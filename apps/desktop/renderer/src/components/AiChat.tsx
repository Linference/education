// AI Assistant panel — the DeepSeek Harness UI
//
// This is the visible part of the "DSH integration". Design points:
//   1. **The process must be visible**: thinking / tool_call / tool_result are all
//      shown as live entries instead of a single spinner. Users need to know which
//      file the AI is reading and what it changed.
//   2. **File edits must show a diff**: DSH edit events carry old_string / new_string,
//      rendered as a red/green comparison — the precondition for trusting it with
//      your notes.
//   3. **Sessions resume**: sessionId is persisted, so follow-up messages continue in
//      the same context without re-explaining the background each time.
//   4. Sandbox boundary = the currently open library. The UI states this clearly so
//      users feel safe.
import { useCallback, useEffect, useRef, useState } from "react";
import type { DshEvent } from "../types";
import MarkdownView from "./MarkdownView";

interface Props {
  /** The currently open library directory — DSH's cwd, also the sandbox boundary */
  vaultPath: string | null;
  /** Notify the parent to refresh the file tree after the AI changes files */
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
 * localStorage key for persisted conversation.
 *
 * Why persist: users reported "I clicked Info, came back, and the conversation was
 * gone" — the direct cause was the component being unmounted (the ternary used to
 * switch the right sidebar). That is now CSS-hidden.
 * But fixing only that spot still means **the conversation is lost when the app closes**.
 * For an AI assistant that can write notes and edit files, the conversation should not
 * be volatile.
 *
 * Keyed by library path: conversations from different libraries should not mix.
 */
const STORE_KEY = (vaultPath: string | null) => `gezhi.chat.${vaultPath ?? "__none__"}`;

/** Maximum messages kept per conversation (so localStorage does not grow forever) */
const MAX_PERSISTED_MSGS = 60;

function loadPersisted(vaultPath: string | null): { msgs: Msg[]; sessionId: string | null } {
  try {
    const raw = localStorage.getItem(STORE_KEY(vaultPath));
    if (!raw) return { msgs: [], sessionId: null };
    const j = JSON.parse(raw);
    // No heavy validation: treat bad data as absent; persistence must not crash the UI
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
    // Keep only the most recent messages; steps can be large (tool output), so truncate them too
    const slim = msgs.slice(-MAX_PERSISTED_MSGS).map((m) => ({
      ...m,
      steps: m.steps?.slice(-40).map((s) => ({
        ...s,
        // Truncate tool output to 4000 chars, otherwise localStorage fills up fast
        resultText: s.resultText ? s.resultText.slice(0, 4000) : undefined,
      })),
    }));
    localStorage.setItem(STORE_KEY(vaultPath), JSON.stringify({ msgs: slim, sessionId }));
  } catch {
    // If writing fails (e.g. quota full), skip persistence; the current session keeps working
  }
}

export default function AiChat({ vaultPath, onFilesChanged }: Props) {
  // The initial value is read from persistence — the conversation survives an app restart
  const initial = useRef(loadPersisted(null));
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [health, setHealth] = useState<{ ok: boolean; version?: string | null; error?: string | null } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stepIdRef = useRef(0);
  const touchedFilesRef = useRef(false);
  /** Which library's conversation is currently loaded (switch when the library changes) */
  const loadedForRef = useRef<string | null>(null);
  void initial;

  // Load that library's conversation when the library changes
  useEffect(() => {
    const key = vaultPath ?? null;
    if (loadedForRef.current === key) return;
    loadedForRef.current = key;
    const r = loadPersisted(key);
    setMsgs(r.msgs);
    setSessionId(r.sessionId);
  }, [vaultPath]);

  // Save whenever the conversation changes
  useEffect(() => {
    savePersisted(vaultPath ?? null, msgs, sessionId);
  }, [msgs, sessionId, vaultPath]);

  // DSH health check
  useEffect(() => {
    window.gezhi.ai.health().then(setHealth).catch((e) => setHealth({ ok: false, error: e.message }));
  }, []);

  // Subscribe to the event stream
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
            // A write-style tool touched files → refresh the file tree later
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
            push({ kind: "error", text: ev.message ?? ev.error ?? "Unknown error" });
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

  // Auto-scroll to the bottom
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const send = useCallback(async () => {
    const task = input.trim();
    if (!task || running) return;
    if (!vaultPath) {
      setMsgs((p) => [...p, { role: "assistant", text: "", error: "Open a library first — AI only works inside the library directory you opened." }]);
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
          last.error = r.error ?? "Run failed";
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
      // The AI may have changed files — let the parent refresh the file tree
      if (touchedFilesRef.current) onFilesChanged?.();
    }
  }, [input, running, vaultPath, sessionId, onFilesChanged]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Enter sends, Shift+Enter inserts a newline (standard chat behaviour)
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="ai-chat" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Top: DSH status */}
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
            ? "Checking DSH…"
            : health.ok
            ? `DeepSeek Harness ${health.version ?? ""}`
            : "DSH unavailable"}
        </span>
        {sessionId && <span style={{ marginLeft: "auto" }} title={sessionId}>Context connected</span>}
      </div>

      {/* Messages */}
      <div ref={scrollerRef} style={{ flex: "1 1 auto", overflow: "auto", padding: "8px 0 12px" }}>
        {msgs.length === 0 && (
          <div className="ai-empty" style={{ padding: "16px 14px", color: "var(--text-faint)", fontSize: 13, lineHeight: 1.8 }}>
            <div style={{ marginBottom: 10 }}>Ask AI to work in your library. It can read, create and revise your notes.</div>
            {!vaultPath && <div style={{ color: "var(--red)" }}>Open a library first (Ctrl+O)</div>}
            {health && !health.ok && (
              <div style={{ color: "var(--red)", marginTop: 8 }}>
                DSH unavailable: {health.error ?? "No executable found"}
              </div>
            )}
            <div style={{ marginTop: 12, color: "var(--text-muted)" }}>Try this:</div>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              <li>Organise this note into an outline</li>
              <li>Create an index for this library</li>
              <li>Turn this handout into Markdown exercises</li>
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
                {/* Process entries */}
                {m.steps?.map((s) => (
                  <StepView key={s.id} step={s} />
                ))}

                {/* Final answer: rendered as Markdown.
                    Use compact mode — the default reading layout is designed for a
                    760px body area, with h1 near 30px and generous spacing; inside
                    the 340px chat column it looks oversized and loose
                    (users reported "the formatting is far too large"). */}
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
                  <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 6 }}>Error: {m.error}</div>
                )}

                {!m.done && (
                  <div style={{ color: "var(--text-faint)", fontSize: 12, marginTop: 4 }}>
                    <span className="ai-dots">Working</span>
                  </div>
                )}

                {m.tokens && m.done && (
                  <div style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 4 }}>
                    tokens: {m.tokens.input} in / {m.tokens.output} out
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Composer */}
      <div className="ai-composer" style={{ flex: "0 0 auto", borderTop: "1px solid var(--bd)", padding: 8 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={vaultPath ? "Ask AI to do something… (Enter to send, Shift+Enter for a new line)" : "Open a library first"}
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
            {vaultPath ? `Workspace: ${vaultPath.split(/[\\/]/).pop()}` : "No library open"}
          </span>
          {running ? (
            <button
              onClick={() => window.gezhi.ai.stop()}
              style={{
                padding: "4px 12px", borderRadius: 5, fontSize: 12.5,
                border: "1px solid var(--bd-strong)", background: "var(--bg-secondary)",
              }}
            >
              Stop
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
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Process entries
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
              {open ? "Hide changes ▴" : "View changes ▾"}
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
          {step.ok === false ? "Tool error" : "Tool output"} ({txt.length} chars){open ? " ▴" : " ▾"}
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
