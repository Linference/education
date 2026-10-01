// 数字人对话台
//
// ★ 这个组件补的是用户指出的缺口：
//   "我如何和数字人对话，都没有对话按钮"
//   —— 之前只有"朗读"（把输入框里的字念出来），没有**对话**。
//
// 完整链路：
//   你打字 → 交给 DSH（和 AI 助手同一个大脑，cwd = 当前库）
//        → 拿到回答 → 数字人**念出来**（带口型）
//
// ★ 为什么单独一个组件而不是塞进 AiChat：
//   AiChat 是"干活"的工作台（显示 think/tool/diff 过程，适合看 AI 动了哪些文件）；
//   这里是"说话"的对话台（只关心问答与发声，界面要极简、字要大）。
//   两者共用同一个 DSH 会话能力，但目的不同，混在一起两边都不好用。
import { useCallback, useEffect, useRef, useState } from "react";
import AvatarStage from "./AvatarStage";
import { useAvatarVoice } from "./useAvatarVoice";
import { useMicRecorder } from "./useMicRecorder";
import { markdownToSpeech } from "./viseme";

interface Msg {
  role: "user" | "assistant";
  text: string;
  /** 流式过程中还没说完 */
  streaming?: boolean;
  error?: string;
}

interface Props {
  vaultPath: string | null;
  /** 是否可用云端语音（检测结果） */
  cloudReady: boolean;
}

/**
 * 语音识别是否可用。
 *
 * ★ 与语音合成**分开**判断：
 *   合成可以退回系统语音（不需要密钥），
 *   但**识别没有本地回退** —— 浏览器内置的 SpeechRecognition 在 Electron 里
 *   不可用（它要联网走 Google 的服务，且 Chromium 官方版没带）。
 *   所以没有凭据时，麦克风按钮应该明确置灰并说明原因，
 *   而不是让用户按下去等一个必然失败的结果。
 */

/**
 * 一次最多念多少字。
 *
 * ★ 为什么要限制：
 *   腾讯云 TTS 单次 150 字，超了会自动分段再拼接；
 *   但如果 AI 写了两千字的长文，逐段合成会发出几十个请求、音频上百 MB，
 *   而且用户也不会想听五分钟。
 *   所以超过上限就**念开头**，并在界面上说明"其余请看文字"，不假装念完了。
 */
const SPEAK_MAX_CHARS = 600;

export default function AvatarConsole({ vaultPath, cloudReady }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  /** 自动念出回答（默认开：不然"对话"就少了半边） */
  const [autoSpeak, setAutoSpeak] = useState(true);
  /** 优先用云端音质 */
  const [preferCloud, setPreferCloud] = useState(true);
  /** 说话后自动发送（不用再点一次发送） */
  const [autoSend, setAutoSend] = useState(true);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [hint, setHint] = useState<string | null>(null);

  const voice = useAvatarVoice();
  const mic = useMicRecorder();
  const scrollerRef = useRef<HTMLDivElement>(null);
  /** 防止旧回答的朗读盖住新回答 */
  const answerSeq = useRef(0);

  const cloudUsable = cloudReady && preferCloud;

  // 自动滚到底
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  /** 订阅 DSH 事件流，把流式文字拼进最后一条 assistant 消息 */
  useEffect(() => {
    const off = window.gezhi.ai.onEvent(({ event }) => {
      const ev: any = event;
      if (ev.type === "text" && ev.text) {
        setMsgs((prev) => {
          const next = [...prev];
          const last = { ...next[next.length - 1] };
          if (last?.role !== "assistant") return prev;
          last.text = (last.text ?? "") + ev.text;
          next[next.length - 1] = last;
          return next;
        });
      } else if (ev.type === "final" && ev.text) {
        setMsgs((prev) => {
          const next = [...prev];
          const last = { ...next[next.length - 1] };
          if (last?.role !== "assistant") return prev;
          last.text = ev.text;
          last.streaming = false;
          next[next.length - 1] = last;
          return next;
        });
      } else if (ev.type === "session" && ev.sessionId) {
        setSessionId(ev.sessionId);
      }
    });
    return off;
  }, []);

  /* 发送逻辑统一在下面的 sendText —— 输入框与语音输入走同一条路径，
     避免"打字能问、语音问不了"这种两套行为。 */

  const clear = () => {
    voice.stop();
    setMsgs([]);
    setSessionId(undefined);
    setHint(null);
  };

  /**
   * 语音输入：按一下开始录，再按一下停止并识别。
   *
   * ★ 为什么做成"按一下开始/再按一下停"而不是"按住说话"：
   *   按住说话要求用户一直按着鼠标，一旦手滑松开就断了，
   *   而且没法录超过几秒的长句。点按式更适合"说一整段问题"。
   *   界面上会给明显的录音中提示（红点 + 秒数），不会让人忘了在录。
   *
   * ★ 识别完的结果**填进输入框**（autoSend 时再自动发）：
   *   识别难免有错字（同音字尤其多），先把文字给用户看一眼，
   *   能改再发比直接发出去礼貌得多。
   */
  const toggleVoiceInput = useCallback(async () => {
    setHint(null);
    if (mic.recording) {
      const r = await mic.stopAndRecognize();
      if (!r.ok) {
        setHint(`语音识别失败：${r.error ?? "未知原因"}${r.hint ? ` —— ${r.hint}` : ""}`);
        return;
      }
      if (r.empty) {
        setHint("没听清（可能没说，或者环境太吵）。再说一次试试。");
        return;
      }
      const text = String(r.text ?? "").trim();
      setInput(text);
      setHint(`已识别（${((r.audioBytes ?? 0) / 1024).toFixed(0)} KB · ${r.ms}ms）：${text}`);
      if (autoSend && text) {
        // 让 setInput 先落地，再发送
        setTimeout(() => { void sendText(text); }, 0);
      }
    } else {
      await mic.start();
    }
  }, [mic, autoSend]);

  /**
   * 直接发送指定文本。
   * 抽出来是因为语音输入要走同一条发送逻辑（要传文字，不能用 input 的 state ——
   * 那个还没更新）。
   */
  const sendText = useCallback(async (raw: string) => {
    const task = raw.trim();
    if (!task || running) return;
    if (!vaultPath) { setHint("请先打开一个库 —— AI 只在库目录里工作。"); return; }

    setInput("");
    setHint(null);
    voice.stop();
    setRunning(true);
    setMsgs((prev) => [
      ...prev,
      { role: "user", text: task },
      { role: "assistant", text: "", streaming: true },
    ]);

    try {
      const r = await window.gezhi.ai.run({ task, cwd: vaultPath, sessionId });
      if (r.sessionId) setSessionId(r.sessionId);

      let answer = "";
      setMsgs((prev) => {
        const next = [...prev];
        const last = { ...next[next.length - 1] };
        if (last?.role !== "assistant") return prev;
        last.streaming = false;
        if (r.finalText) last.text = r.finalText;
        if (!r.ok) last.error = r.error ?? "运行失败";
        answer = last.text ?? "";
        next[next.length - 1] = last;
        return next;
      });

      setRunning(false);

      if (autoSpeak) {
        const spoken = markdownToSpeech(answer);
        if (!spoken) {
          setHint("这次回答没有可朗读的文字内容");
        } else {
          const seq = ++answerSeq.current;
          const clipped = spoken.length > SPEAK_MAX_CHARS ? spoken.slice(0, SPEAK_MAX_CHARS) : spoken;
          if (spoken.length > SPEAK_MAX_CHARS) {
            setHint(`回答较长，只念了前 ${SPEAK_MAX_CHARS} 字（完整内容看文字）`);
          }
          if (seq === answerSeq.current) {
            await voice.speak(clipped, { preferCloud: cloudUsable });
          }
        }
      }
    } catch (e: any) {
      setRunning(false);
      setMsgs((prev) => {
        const next = [...prev];
        const last = { ...next[next.length - 1] };
        if (last?.role === "assistant") { last.streaming = false; last.error = String(e?.message ?? e); }
        next[next.length - 1] = last;
        return next;
      });
    }
  }, [running, vaultPath, sessionId, autoSpeak, cloudUsable, voice]);

  /** 输入框那条发送路径（读 input） */
  const send = useCallback(() => sendText(input), [input, sendText]);

  return (
    <div
      data-testid="avatar-console"
      style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}
    >
      {/* ---- 形象 ---- */}
      <div style={{
        flex: "0 0 auto", display: "flex", justifyContent: "center",
        padding: "4px 8px 2px", background: "var(--bg-secondary)",
        borderBottom: "1px solid var(--bd)",
      }}>
        <AvatarStage
          frames={voice.frames}
          speaking={voice.speaking}
          actualMs={voice.actualMs}
          size={150}
          status={
            voice.speaking
              ? (voice.curChar ? `「${voice.curChar}」` : "正在说…")
              : voice.frames.length
                ? `口型 ${voice.frames.length} 帧 · ${voice.source === "cloud" ? "云端时间戳" : "本地估算"}`
                : "还没说过话"
          }
        />
      </div>

      {/* ---- 开关 ---- */}
      <div style={{
        flex: "0 0 auto", display: "flex", alignItems: "center", gap: 10,
        padding: "5px 10px", fontSize: 11.5, borderBottom: "1px solid var(--bd)",
        color: "var(--text-muted)",
      }}>
        <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input type="checkbox" checked={autoSpeak} onChange={(e) => setAutoSpeak(e.target.checked)} />
          自动念回答
        </label>
        <label
          style={{
            display: "flex", alignItems: "center", gap: 4,
            cursor: cloudReady ? "pointer" : "not-allowed",
            opacity: cloudReady ? 1 : 0.5,
          }}
          title={cloudReady ? "云端音质更好，且带真实时间戳（口型更准）" : "未配置腾讯云凭据，只能用系统语音"}
        >
          <input
            type="checkbox"
            checked={cloudUsable}
            disabled={!cloudReady}
            onChange={(e) => setPreferCloud(e.target.checked)}
          />
          云端音质
        </label>
        <div style={{ flex: "1 1 auto" }} />
        {voice.speaking ? (
          <button onClick={voice.stop} style={{ color: "var(--red, #dc2626)", fontSize: 11.5 }}>
            停止朗读
          </button>
        ) : (
          msgs.length > 0 && (
            <button onClick={clear} style={{ color: "var(--text-faint)", fontSize: 11.5 }}>
              清空
            </button>
          )
        )}
      </div>

      {/* ---- 对话区 ---- */}
      <div ref={scrollerRef} style={{ flex: "1 1 auto", overflow: "auto", minHeight: 0, padding: "8px 10px" }}>
        {msgs.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--text-faint)", lineHeight: 1.9, padding: "6px 0" }}>
            在这里和数字人说话。它用的是和「AI 助手」同一个大脑（DeepSeek Harness），
            工作目录就是当前打开的库。
            <div style={{ marginTop: 6 }}>试试说：</div>
            <div>· 帮我讲讲这道题的思路</div>
            <div>· 把这周的复习计划念给我听</div>
            <div>· 用费曼方法考考我</div>
          </div>
        )}

        {msgs.map((m, i) => (
          <div key={i} style={{
            marginBottom: 8,
            display: "flex",
            justifyContent: m.role === "user" ? "flex-end" : "flex-start",
          }}>
            <div style={{
              maxWidth: "88%",
              padding: "6px 9px",
              borderRadius: 8,
              fontSize: 12.5,
              lineHeight: 1.75,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: m.role === "user" ? "var(--accent-soft)" : "var(--bg-secondary)",
              color: m.role === "user" ? "var(--accent)" : "var(--text-normal)",
              border: m.error ? "1px solid var(--red, #dc2626)" : "1px solid transparent",
            }}>
              {m.error ? (
                <span style={{ color: "var(--red, #dc2626)" }}>出错了：{m.error}</span>
              ) : (
                <>
                  {m.text || (m.streaming ? "…" : "")}
                  {m.streaming && <span style={{ color: "var(--text-faint)" }}> ▍</span>}
                </>
              )}
              {/* 每条回答都能单独重念 —— 用户不必重新问一遍 */}
              {m.role === "assistant" && m.text && !m.streaming && (
                <div style={{ marginTop: 4 }}>
                  <button
                    onClick={() => {
                      voice.stop();
                      const spoken = markdownToSpeech(m.text);
                      void voice.speak(spoken.slice(0, SPEAK_MAX_CHARS), { preferCloud: cloudUsable });
                    }}
                    style={{ fontSize: 11, color: "var(--accent)", textDecoration: "underline" }}
                  >
                    念一遍
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ---- 状态 / 提示 ---- */}
      {(voice.status || hint) && (
        <div style={{
          flex: "0 0 auto", padding: "4px 10px", fontSize: 10.5,
          color: hint ? "var(--text-muted)" : "var(--text-faint)",
          background: "var(--bg-secondary)", borderTop: "1px solid var(--bd)",
          lineHeight: 1.6,
        }}>
          {hint ?? voice.status}
        </div>
      )}

      {/* ---- 输入 ---- */}
      <div style={{ flex: "0 0 auto", padding: "6px 10px 10px", borderTop: "1px solid var(--bd)" }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
          }}
          rows={2}
          placeholder={running ? "正在思考…" : "和数字人说点什么…（Enter 发送）"}
          disabled={running}
          style={{
            width: "100%", fontSize: 12.5, padding: "6px 8px", marginBottom: 6,
            border: "1px solid var(--bd-strong)", borderRadius: 6, resize: "none",
            background: "var(--bg-primary)", color: "var(--text-normal)", outline: "none",
            fontFamily: "inherit", lineHeight: 1.6,
          }}
        />

        {/* 发送 + 语音输入。
            语音输入的可用性单独判断 —— 合成能退回系统语音，识别不能，
            所以没凭据时按钮要明确置灰并说清原因，不能让人白按。 */}
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => void send()}
            disabled={running || !input.trim()}
            style={{
              flex: "1 1 auto", padding: "7px 0", borderRadius: 6, fontSize: 13,
              background: running || !input.trim() ? "var(--bg-secondary)" : "var(--accent)",
              color: running || !input.trim() ? "var(--text-faint)" : "#fff",
              cursor: running || !input.trim() ? "not-allowed" : "pointer",
              fontWeight: 500,
            }}
          >
            {running ? "思考中…" : "发送"}
          </button>

          <button
            onClick={() => void toggleVoiceInput()}
            disabled={!cloudReady || running || mic.busy}
            title={
              !cloudReady
                ? "语音输入需要腾讯云凭据（识别没有本地回退方案）"
                : mic.recording
                  ? "点一下停止并识别"
                  : "点一下开始说话"
            }
            style={{
              flex: "0 0 auto", width: 42, borderRadius: 6, fontSize: 16,
              display: "grid", placeItems: "center",
              background: mic.recording
                ? "var(--red, #dc2626)"
                : (!cloudReady || running || mic.busy ? "var(--bg-secondary)" : "var(--accent)"),
              color: (!cloudReady || running || mic.busy) && !mic.recording ? "var(--text-faint)" : "#fff",
              cursor: (!cloudReady || running || mic.busy) ? "not-allowed" : "pointer",
            }}
          >
            {mic.recording ? "■" : mic.busy ? "…" : "🎤"}
          </button>
        </div>

        {/* 录音中的提示要显眼：红点 + 秒数 + 上限提醒 */}
        {mic.recording && (
          <div style={{
            marginTop: 6, fontSize: 11.5, color: "var(--red, #dc2626)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%", background: "currentColor",
              display: "inline-block",
            }} />
            正在录音 {mic.seconds} 秒（最长 55 秒）· 说完点一下方块
          </div>
        )}

        {/* 识别完自动发送的开关 */}
        <label style={{
          marginTop: 6, display: "flex", alignItems: "center", gap: 4,
          fontSize: 11, color: "var(--text-muted)", cursor: "pointer",
        }}>
          <input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} />
          识别完自动发送
          <span style={{ color: "var(--text-faint)" }}>（关掉的话可以先改错字）</span>
        </label>

        {mic.error && (
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--red, #dc2626)", lineHeight: 1.6 }}>
            {mic.error}
          </div>
        )}
      </div>
    </div>
  );
}
