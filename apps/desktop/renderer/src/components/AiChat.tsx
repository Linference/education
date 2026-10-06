// AI 助手面板 —— DeepSeek Harness 的界面
//
// 这是"融合 DSH"的可见部分。设计要点：
//   1. **过程要看得见**：thinking / tool_call / tool_result 都实时显示成条目，
//      而不是只有一个转圈。用户要知道 AI 在读哪个文件、改了什么。
//   2. **改文件要能看 diff**：DSH 的 edit 事件带 old_string / new_string，
//      直接渲染成红绿对比 —— 这是"敢让它动我的笔记"的前提。
//   3. **会话可续**：把 sessionId 存下来，后续消息接着同一个上下文，
//      不用每次重新解释背景。
//   4. 沙箱边界 = 当前打开的库。界面上明确写出来，让用户放心。
import { useCallback, useEffect, useRef, useState } from "react";
import type { DshEvent } from "../types";
import MarkdownView from "./MarkdownView";

interface Props {
  /** 当前打开的库目录 —— DSH 的 cwd，也是沙箱边界 */
  vaultPath: string | null;
  /** AI 改完文件后通知外面刷新文件树 */
  onFilesChanged?: () => void;
}

interface Step {
  id: number;
  kind: "thinking" | "text" | "tool" | "result" | "status" | "error" | "final";
  text?: string;
  tool?: string;
  path?: string;
  oldText?: string;
  newText?: string;
  ok?: boolean;
  resultText?: string;
}

interface Msg {
  role: "user" | "assistant";
  text: string;
  steps?: Step[];
  tokens?: { input: number; output: number };
  error?: string;
  done?: boolean;
}

/**
 * 对话持久化的 localStorage 键。
 *
 * 为什么要持久化：用户实测反馈"点一下信息再回来，对话全没了" ——
 * 那个的直接原因是组件被卸载（切右栏用的三元表达式），已改成 CSS 隐藏。
 * 但如果只修那一处，**关掉软件对话照样丢**。
 * 一个能写笔记、能改文件的 AI 助手，对话不该是易失的。
 *
 * 按库路径分键：不同资料库的对话不该混在一起。
 */
const STORE_KEY = (vaultPath: string | null) => `gezhi.chat.${vaultPath ?? "__none__"}`;

/** 一条对话最多保留多少条消息（避免 localStorage 无限膨胀） */
const MAX_PERSISTED_MSGS = 60;

function loadPersisted(vaultPath: string | null): { msgs: Msg[]; sessionId: string | null } {
  try {
    const raw = localStorage.getItem(STORE_KEY(vaultPath));
    if (!raw) return { msgs: [], sessionId: null };
    const j = JSON.parse(raw);
    // 不做过度校验：坏数据就当没有，不要因为持久化把界面搞崩
    return {
      msgs: Array.isArray(j?.msgs) ? j.msgs : [],
      sessionId: typeof j?.sessionId === "string" ? j.sessionId : null,
    };
  } catch {
    return { msgs: [], sessionId: null };
  }
}

function savePersisted(vaultPath: string | null, msgs: Msg[], sessionId: string | null) {
  try {
    // 只留最近若干条；steps 可能很大（工具返回内容），也做截断
    const slim = msgs.slice(-MAX_PERSISTED_MSGS).map((m) => ({
      ...m,
      steps: m.steps?.slice(-40).map((s) => ({
        ...s,
        // 工具返回内容截到 4000 字，否则 localStorage 很快写满
        resultText: s.resultText ? s.resultText.slice(0, 4000) : undefined,
      })),
    }));
    localStorage.setItem(STORE_KEY(vaultPath), JSON.stringify({ msgs: slim, sessionId }));
  } catch {
    // 写不进去（比如配额满了）就放弃持久化，不影响当前会话继续用
  }
}

export default function AiChat({ vaultPath, onFilesChanged }: Props) {
  // 初始值从持久化里读 —— 重启软件后对话还在
  const initial = useRef(loadPersisted(null));
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [health, setHealth] = useState<{ ok: boolean; version?: string | null; error?: string | null } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stepIdRef = useRef(0);
  const touchedFilesRef = useRef(false);
  /** 当前已加载的是哪个库的对话（切库时要换） */
  const loadedForRef = useRef<string | null>(null);
  void initial;

  // 切库时载入那个库的对话
  useEffect(() => {
    const key = vaultPath ?? null;
    if (loadedForRef.current === key) return;
    loadedForRef.current = key;
    const r = loadPersisted(key);
    setMsgs(r.msgs);
    setSessionId(r.sessionId);
  }, [vaultPath]);

  // 对话变化就存起来
  useEffect(() => {
    savePersisted(vaultPath ?? null, msgs, sessionId);
  }, [msgs, sessionId, vaultPath]);

  // DSH 健康检查
  useEffect(() => {
    window.gezhi.ai.health().then(setHealth).catch((e) => setHealth({ ok: false, error: e.message }));
  }, []);

  // 订阅事件流
  useEffect(() => {
    const off = window.gezhi.ai.onEvent(({ event }) => {
      const ev: DshEvent = event;
      setMsgs((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        const last = { ...next[next.length - 1] };
        if (last.role !== "assistant") return prev;
        const steps = [...(last.steps ?? [])];

        const push = (s: Omit<Step, "id">) => {
          stepIdRef.current += 1;
          steps.push({ id: stepIdRef.current, ...s });
        };

        switch (ev.type) {
          case "session":
            if (ev.sessionId) setSessionId(ev.sessionId);
            break;
          case "status":
            break;
          case "thinking":
            if (ev.text) push({ kind: "thinking", text: ev.text });
            break;
          case "text":
            if (ev.text) push({ kind: "text", text: ev.text });
            break;
          case "tool_call": {
            const name = ev.tool ?? ev.name ?? "tool";
            const a = ev.args ?? ev.input ?? {};
            const p = (a.path ?? a.file_path ?? a.filePath ?? ev.path) as string | undefined;
            push({
              kind: "tool",
              tool: name,
              path: p,
              oldText: typeof a.old_string === "string" ? a.old_string : ev.old_string,
              newText: typeof a.new_string === "string" ? a.new_string : ev.new_string,
            });
            // 写类工具动过文件 → 待会儿刷新文件树
            if (/edit|write|create|patch|replace/i.test(name)) touchedFilesRef.current = true;
            break;
          }
          case "tool_result": {
            const r = ev.result ?? ev.output;
            const txt = typeof r === "string" ? r : r == null ? "" : JSON.stringify(r).slice(0, 2000);
            push({ kind: "result", ok: !ev.error, resultText: txt.slice(0, 2000) });
            break;
          }
          case "final":
            if (ev.text) last.text = ev.text;
            last.done = true;
            break;
          case "done":
            last.done = true;
            break;
          case "error":
            push({ kind: "error", text: ev.message ?? ev.error ?? "未知错误" });
            last.error = ev.message ?? ev.error;
            last.done = true;
            break;
        }

        last.steps = steps;
        next[next.length - 1] = last;
        return next;
      });
    });
    return off;
  }, []);

  // 自动滚到底
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const send = useCallback(async () => {
    const task = input.trim();
    if (!task || running) return;
    if (!vaultPath) {
      setMsgs((p) => [...p, { role: "assistant", text: "", error: "请先打开一个库 —— AI 只在你打开的资料库目录里工作。" }]);
      return;
    }
    setInput("");
    setRunning(true);
    touchedFilesRef.current = false;
    setMsgs((p) => [
      ...p,
      { role: "user", text: task },
      { role: "assistant", text: "", steps: [], done: false },
    ]);

    try {
      const r = await window.gezhi.ai.run({ task, cwd: vaultPath, sessionId });
      if (r.sessionId) setSessionId(r.sessionId);
      setMsgs((prev) => {
        const next = [...prev];
        const last = { ...next[next.length - 1] };
        if (last.role !== "assistant") return prev;
        last.done = true;
        if (r.tokens) last.tokens = r.tokens;
        if (!r.ok) {
          last.error = r.error ?? "运行失败";
          if (!last.text) last.text = "";
        }
        next[next.length - 1] = last;
        return next;
      });
    } catch (e: any) {
      setMsgs((prev) => {
        const next = [...prev];
        const last = { ...next[next.length - 1] };
        if (last.role === "assistant") {
          last.done = true;
          last.error = e?.message ?? String(e);
          next[next.length - 1] = last;
        }
        return next;
      });
    } finally {
      setRunning(false);
      // AI 可能改了文件 —— 让外面的文件树刷新
      if (touchedFilesRef.current) onFilesChanged?.();
    }
  }, [input, running, vaultPath, sessionId, onFilesChanged]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Enter 发送，Shift+Enter 换行（聊天框的通行习惯）
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="ai-chat" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* 顶部：DSH 状态 */}
      <div
        style={{
          padding: "6px 12px",
          fontSize: 11,
          color: "var(--text-faint)",
          borderBottom: "1px solid var(--bd)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            width: 6, height: 6, borderRadius: "50%",
            background: health?.ok ? "var(--green)" : "var(--red)",
            display: "inline-block",
          }}
        />
        <span>
          {health === null
            ? "检查 DSH…"
            : health.ok
            ? `DeepSeek Harness ${health.version ?? ""}`
            : "DSH 不可用"}
        </span>
        {sessionId && <span style={{ marginLeft: "auto" }} title={sessionId}>已连接上下文</span>}
      </div>

      {/* 消息区 */}
      <div ref={scrollerRef} style={{ flex: "1 1 auto", overflow: "auto", padding: "8px 0 12px" }}>
        {msgs.length === 0 && (
          <div className="ai-empty" style={{ padding: "16px 14px", color: "var(--text-faint)", fontSize: 13, lineHeight: 1.8 }}>
            <div style={{ marginBottom: 10 }}>让 AI 在你的资料库里干活。它能读、能写、能改你的笔记。</div>
            {!vaultPath && <div style={{ color: "var(--red)" }}>先打开一个库（Ctrl+O）</div>}
            {health && !health.ok && (
              <div style={{ color: "var(--red)", marginTop: 8 }}>
                DSH 不可用：{health.error ?? "未找到可执行文件"}
              </div>
            )}
            <div style={{ marginTop: 12, color: "var(--text-muted)" }}>试试：</div>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              <li>把这篇笔记整理成大纲</li>
              <li>给这个库里的英语笔记建一份索引</li>
              <li>把这份讲义转成练习题（Markdown）</li>
            </ul>
          </div>
        )}

        {msgs.map((m, i) => (
          <div className="ai-message" key={i} style={{ padding: "6px 12px" }}>
            {m.role === "user" ? (
              <div
                style={{
                  background: "var(--accent-soft)",
                  borderRadius: 8,
                  padding: "8px 11px",
                  fontSize: 13,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
                className="selectable"
              >
                {m.text}
              </div>
            ) : (
              <div>
                {/* 过程条目 */}
                {m.steps?.map((s) => (
                  <StepView key={s.id} step={s} />
                ))}

                {/* 最终回答：Markdown 渲染。
                    用 compact 模式 —— 默认的阅读排版是给 760px 正文区设计的，
                    h1 近 30px、留白很大，塞进 340px 的聊天栏又大又散
                    （用户实测反馈"格式大小也太大了"）。 */}
                {m.text && (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 13.5,
                      lineHeight: 1.65,
                      borderLeft: "2px solid var(--accent)",
                      paddingLeft: 10,
                    }}
                  >
                    <MarkdownView text={m.text} compact showProps={false} />
                  </div>
                )}

                {m.error && (
                  <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 6 }}>出错了：{m.error}</div>
                )}

                {!m.done && (
                  <div style={{ color: "var(--text-faint)", fontSize: 12, marginTop: 4 }}>
                    <span className="ai-dots">正在工作</span>
                  </div>
                )}

                {m.tokens && m.done && (
                  <div style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 4 }}>
                    tokens: {m.tokens.input} 入 / {m.tokens.output} 出
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 输入区 */}
      <div className="ai-composer" style={{ flex: "0 0 auto", borderTop: "1px solid var(--bd)", padding: 8 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={vaultPath ? "交给 AI 做点什么…（Enter 发送，Shift+Enter 换行）" : "先打开一个库"}
          disabled={!vaultPath || running}
          rows={3}
          style={{
            width: "100%",
            resize: "none",
            border: "1px solid var(--bd-strong)",
            borderRadius: 6,
            padding: "7px 9px",
            font: "inherit",
            fontSize: 13,
            lineHeight: 1.55,
            background: "var(--bg-primary)",
            color: "var(--text-normal)",
            outline: "none",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <span style={{ fontSize: 11, color: "var(--text-faint)", flex: "1 1 auto" }}>
            {vaultPath ? `工作目录：${vaultPath.split(/[\\/]/).pop()}` : "未打开库"}
          </span>
          {running ? (
            <button
              onClick={() => window.gezhi.ai.stop()}
              style={{
                padding: "4px 12px", borderRadius: 5, fontSize: 12.5,
                border: "1px solid var(--bd-strong)", background: "var(--bg-secondary)",
              }}
            >
              停止
            </button>
          ) : (
            <button
              onClick={send}
              disabled={!vaultPath || !input.trim()}
              style={{
                padding: "4px 14px", borderRadius: 5, fontSize: 12.5,
                background: vaultPath && input.trim() ? "var(--accent)" : "var(--bg-active)",
                color: vaultPath && input.trim() ? "#fff" : "var(--text-faint)",
                cursor: vaultPath && input.trim() ? "pointer" : "default",
              }}
            >
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 过程条目
function StepView({ step }: { step: Step }) {
  const [open, setOpen] = useState(false);

  if (step.kind === "thinking") {
    return (
      <div style={{ fontSize: 12.5, color: "var(--text-faint)", fontStyle: "italic", margin: "4px 0", lineHeight: 1.6 }}>
        {step.text}
      </div>
    );
  }

  if (step.kind === "text") {
    return (
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "3px 0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
        {step.text}
      </div>
    );
  }

  if (step.kind === "tool") {
    const isEdit = Boolean(step.oldText || step.newText);
    const short = (step.path ?? "").split(/[\\/]/).slice(-2).join("/");
    return (
      <div
        style={{
          margin: "5px 0",
          border: "1px solid var(--bd)",
          borderRadius: 6,
          overflow: "hidden",
          background: "var(--bg-secondary)",
        }}
      >
        <div
          onClick={() => isEdit && setOpen((o) => !o)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 8px", fontSize: 12, cursor: isEdit ? "pointer" : "default",
          }}
        >
          <span style={{ color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
            {step.tool}
          </span>
          {short && <span style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{short}</span>}
          {isEdit && (
            <span style={{ marginLeft: "auto", color: "var(--text-faint)", fontSize: 11 }}>
              {open ? "收起改动 ▴" : "查看改动 ▾"}
            </span>
          )}
        </div>
        {open && isEdit && (
          <div style={{ borderTop: "1px solid var(--bd)", fontSize: 11.5, fontFamily: "var(--font-mono)" }}>
            {step.oldText && (
              <pre style={{ margin: 0, padding: "6px 8px", background: "#fdecec", color: "#8a1f1f", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {step.oldText.split("\n").map((l) => "- " + l).join("\n")}
              </pre>
            )}
            {step.newText && (
              <pre style={{ margin: 0, padding: "6px 8px", background: "#e9f7ee", color: "#14532d", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {step.newText.split("\n").map((l) => "+ " + l).join("\n")}
              </pre>
            )}
          </div>
        )}
      </div>
    );
  }

  if (step.kind === "result") {
    const txt = step.resultText ?? "";
    if (!txt.trim()) return null;
    return (
      <div style={{ fontSize: 11.5, color: "var(--text-faint)", margin: "2px 0 4px" }}>
        <span
          onClick={() => setOpen((o) => !o)}
          style={{ cursor: "pointer", textDecoration: "underline dotted" }}
        >
          {step.ok === false ? "工具报错" : "工具返回"}（{txt.length} 字）{open ? " ▴" : " ▾"}
        </span>
        {open && (
          <pre
            className="selectable"
            style={{
              margin: "4px 0 0", padding: "6px 8px", background: "var(--code-bg)",
              borderRadius: 4, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 240, overflow: "auto",
              fontSize: 11.5, fontFamily: "var(--font-mono)",
            }}
          >
            {txt}
          </pre>
        )}
      </div>
    );
  }

  if (step.kind === "error") {
    return <div style={{ fontSize: 12.5, color: "var(--red)", margin: "4px 0" }}>{step.text}</div>;
  }

  return null;
}
