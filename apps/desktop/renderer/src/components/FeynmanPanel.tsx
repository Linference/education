// 费曼讲解台
//
// ★ 这是数字人**原本的用途**（用户澄清）：
//   "我一开始做这个不是用于费曼学习法，我成为老师讲一遍给我查缺补漏的吗"
//
//   所以方向是**反的**：
//     ✘ AI 讲给你听（那是普通问答助手）
//     ✔ **你讲** → AI 找出你讲漏了、讲错了、讲含糊了的地方
//
// ★ 为什么费曼必须配语音输入：
//   费曼法的核心动作是"用自己的话讲出来"。
//   打字会让人不自觉地组织语言（等于先想清楚再写），
//   而**开口讲**才会暴露真正的理解断点 —— 卡壳、含糊、跳步都藏不住。
//   所以这个界面以"按一下开始讲"为主，打字只作为补充。
//
// ★ 为什么要分多段录：
//   腾讯云一句话识别上限 60 秒。一段讲解常常好几分钟，
//   所以录完一段就自动接上下一段，转写文字**累加**，
//   界面上显示总时长与字数，用户随时可以"讲完了"。
import { useCallback, useMemo, useRef, useState } from "react";
import AvatarStage from "./AvatarStage";
import { useAvatarVoice } from "./useAvatarVoice";
import { useMicRecorder } from "./useMicRecorder";
import { markdownToSpeech } from "./viseme";

interface Props {
  onOpenRooms?: () => void;
  vaultPath: string | null;
  /** 是否可用云端语音 */
  cloudReady: boolean;
  /** 当前打开的文件名，用来给"讲什么"提供默认值 */
  currentFileName?: string | null;
  /** 当前打开文件的文字内容（有的话塞给 AI 当背景） */
  currentFileText?: string | null;
}

type Phase = "idle" | "recording" | "analyzing" | "done";

/**
 * 费曼评分用的提示词。
 *
 * ★ 设计要点（这个提示词的每一句都是为了让 AI **别跑偏**）：
 *   1. 明确点出"不要重新完整讲一遍" —— 否则 AI 会退回普通助手的习惯，
 *      把知识点重讲一遍，用户什么也没学到
 *   2. 明确要求"只针对他实际说出的内容" —— 否则 AI 会泛泛而谈，
 *      说一些对任何讲解都成立的废话
 *   3. 语音识别必然有同音错字，要提前说明容忍，不然 AI 会去挑错别字
 *   4. 讲得太少时要有兜底话术，不能硬编出一堆"缺漏"
 *   5. 追问要**针对最薄弱环节** —— 这是查缺补漏真正落地的地方
 */
function buildFeynmanPrompt(topic: string, transcript: string, fileContext?: string | null): string {
  if (document.documentElement.lang === 'en') return `A student is explaining ${topic} in their own words. Evaluate only this explanation, using the reference where relevant. Do not call tools or modify files. Reply entirely in English, at most 160 words, with four short sections: What is correct; Missing conditions; Incorrect or unclear claims; Two follow-up questions. Do not give a complete replacement lecture. Be explicit if the reference is insufficient. This is AI feedback, not a certified assessment.\nStudent explanation:\n${transcript}\nReference:\n${(fileContext || '').slice(0, 4000)}`;
  const bg = fileContext
    ? `\n\n【参考资料（他正在看的文件内容，可用于判断他讲得对不对）】\n${fileContext.slice(0, 4000)}`
    : "";
  return `学生正在用费曼学习法讲解「${topic}」。

下面是他用自己的话讲解的记录（可能来自语音转写或文字输入；请容忍转写错别字）：

"""
${transcript}
"""${bg}

请你作为严格但有耐心的老师，**只针对他实际说出的内容**做四件事：

1. **讲对了什么** —— 简短肯定，指出他真正理解到位的部分（一两句即可）
2. **漏了什么** —— 这是最重要的部分。逐条列出他讲解中**缺失**的关键概念、步骤、条件或前提，每条说明为什么重要
3. **说错或含糊的地方** —— 指出事实性错误、以及"说得很虚"的地方（比如反复用"差不多""就是这样"带过），并给出更准确的说法
4. **追问 2~3 个问题** —— 针对他最薄弱的环节提问，逼他把没想清楚的地方想清楚

硬性要求：
- **不要**把这个知识点重新完整讲一遍 —— 那是反费曼的做法
- 不要泛泛而谈，每条评价都要能对上他原话里的具体位置
- 如果他讲得太少（几乎没内容），直接说「讲得太少，先展开讲」，不要硬凑缺漏
- Respond in English, use bullet points, and be concise`;
}

/** 把秒数变成"1 分 23 秒" */
function fmtDur(sec: number): string {
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

export default function FeynmanPanel({ vaultPath, cloudReady, currentFileName, currentFileText, onOpenRooms }: Props) {
  const [topic, setTopic] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  /** 累加的讲解文字 */
  const [transcript, setTranscript] = useState("");
  /** 已录制的总秒数 */
  const [totalSec, setTotalSec] = useState(0);
  /** AI 的查缺补漏结果 */
  const [feedback, setFeedback] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 上一段的识别结果，便于用户确认录音生效了 */
  const [lastChunk, setLastChunk] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);

  const voice = useAvatarVoice();
  const mic = useMicRecorder();
  const scrollerRef = useRef<HTMLDivElement>(null);
  /** 防止旧的 AI 结果盖住新的 */
  const runSeq = useRef(0);

  /** 主题默认取当前文件名（去掉扩展名） */
  const effectiveTopic = topic.trim() ||
    (currentFileName ? currentFileName.replace(/\.[^.]+$/, "") : "");

  const wordCount = useMemo(() => transcript.replace(/\s/g, "").length, [transcript]);

  // 订阅 AI 流式事件，把反馈实时拼出来
  const offRef = useRef<null | (() => void)>(null);
  const subscribe = useCallback(() => {
    if (offRef.current) return;
    offRef.current = window.gezhi.ai.onEvent(({ event }) => {
      const ev: any = event;
      if (ev.type === "text" && ev.text) setFeedback((p) => p + ev.text);
      else if (ev.type === "final" && ev.text) { setFeedback(ev.text); setStreaming(false); }
      else if (ev.type === "session" && ev.sessionId) setSessionId(ev.sessionId);
    });
  }, []);

  /** 录一段：开始 */
  const startSegment = useCallback(async () => {
    setError(null);
    setLastChunk(null);
    voice.stop();
    await mic.start();
    setPhase("recording");
  }, [mic, voice]);

  /** 录一段：结束并转写，累加到讲解记录 */
  const stopSegment = useCallback(async () => {
    const sec = mic.seconds;
    const r = await mic.stopAndRecognize();
    setPhase("idle");
    setTotalSec((s) => s + sec);

    if (!r.ok) {
      setError(`Recognition failed: ${r.error ?? "unknown reason"}${r.hint ? ` — ${r.hint}` : ""}`);
      return;
    }
    if (r.empty) {
      setLastChunk(null);
      setError("That segment was not clear (nothing was said, or the room was too noisy). Please say it again.");
      return;
    }
    const text = String(r.text ?? "").trim();
    setLastChunk(text);
    setTranscript((t) => (t ? `${t}\n${text}` : text));
  }, [mic]);

  /** 讲完了 → 交给 AI 查缺补漏 */
  const analyze = useCallback(async () => {
    if (!vaultPath) { setError("Open a vault first."); return; }
    if (!effectiveTopic) { setError("Say what you want to explain first (or open a related file)."); return; }
    if (wordCount < 10) { setError(`Too short (${wordCount} characters). Please expand.`); return; }

    voice.stop();
    setError(null);
    setFeedback("");
    setStreaming(true);
    setPhase("analyzing");
    subscribe();

    const seq = ++runSeq.current;
    try {
      const task = buildFeynmanPrompt(effectiveTopic, transcript, currentFileText);
      const r = await window.gezhi.ai.run({ task, cwd: vaultPath, sessionId });
      if (r.sessionId) setSessionId(r.sessionId);
      if (seq !== runSeq.current) return;

      if (r.finalText) setFeedback(r.finalText);
      if (!r.ok) setError(r.error ?? "Run failed");
      setStreaming(false);
      setPhase("done");

      // 念出反馈，方便闭着眼睛听自己讲得怎么样
      const spoken = markdownToSpeech(r.finalText ?? "");
      if (spoken && cloudReady) {
        void voice.speak(spoken.slice(0, 600), { preferCloud: true });
      }
    } catch (e: any) {
      if (seq !== runSeq.current) return;
      setError(String(e?.message ?? e));
      setStreaming(false);
      setPhase("done");
    }
  }, [vaultPath, effectiveTopic, wordCount, transcript, currentFileText, sessionId, subscribe, cloudReady, voice]);

  /** 重新讲一遍 */
  const reset = useCallback(() => {
    voice.stop();
    mic.cancel();
    setTranscript("");
    setTotalSec(0);
    setFeedback("");
    setLastChunk(null);
    setError(null);
    setPhase("idle");
    setSessionId(undefined);
  }, [voice, mic]);

  if (!vaultPath) {
    return <div className="tree-empty">The Feynman explanation desk is available once a vault is open</div>;
  }

  const recording = mic.recording;
  const canAnalyze = wordCount >= 10 && !recording && phase !== "analyzing";

  return (
    <div className="feynman-panel" data-testid="feynman-panel" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {onOpenRooms && <button className="learning-primary" style={{ margin: 8 }} onClick={onOpenRooms}>Choose a companion · Open the six-dimensional explanation space ↗</button>}
      {/* ---- 顶部：数字人（讲的时候它在听） ---- */}
      <div className="companion-hero" style={{
        flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center",
        padding: "6px 8px 4px", background: "var(--bg-secondary)", borderBottom: "1px solid var(--bd)",
      }}>
        <AvatarStage
          frames={voice.frames}
          speaking={voice.speaking}
          actualMs={voice.actualMs}
          size={160}
          mood={recording ? "listening" : phase === "analyzing" ? "thinking" : "idle"}
          status={
            recording
              ? `Listening… ${mic.seconds}s`
              : phase === "analyzing"
                ? "Checking what is missing…"
                : transcript
                  ? `Recorded ${wordCount} characters · ${fmtDur(totalSec)}`
                  : "Press the button below to start"
          }
        />
      </div>

      <div ref={scrollerRef} style={{ flex: "1 1 auto", overflow: "auto", minHeight: 0, padding: "8px 10px" }}>
        {/* ---- 讲什么 ---- */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 3 }}>
            What are you going to explain? (Teach it in your own words)
          </div>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={currentFileName ? `Default: ${currentFileName.replace(/\.[^.]+$/, "")}` : "For example: the vertex form of a quadratic function"}
            disabled={recording || phase === "analyzing"}
            style={{
              width: "100%", fontSize: 12.5, padding: "5px 8px",
              border: "1px solid var(--bd-strong)", borderRadius: 6,
              background: "var(--bg-primary)", color: "var(--text-normal)", outline: "none",
            }}
          />
        </div>

        {/* ---- 录音按钮 ---- */}
        <button
          onClick={() => (recording || mic.pending ? void stopSegment() : void startSegment())}
          disabled={!cloudReady || phase === "analyzing"}
          title={cloudReady ? "" : "Explaining by voice needs Tencent Cloud credentials (there is no local fallback for recognition)"}
          style={{
            width: "100%", padding: "10px 0", borderRadius: 8, fontSize: 14, fontWeight: 600,
            background: !cloudReady ? "var(--bg-secondary)"
              : recording ? "var(--red, #dc2626)"
              : "var(--accent)",
            color: !cloudReady ? "var(--text-faint)" : recording ? "#fff" : "var(--on-accent)",
            cursor: !cloudReady || phase === "analyzing" ? "not-allowed" : "pointer",
            marginBottom: 6,
          }}
        >
          {recording ? `■ Done with this segment (${mic.seconds}s)` : mic.pending ? 'Recognize the recorded segment' : "🎤 Start explaining (one click starts recording)"}
        </button>

        <div style={{ fontSize: 10.5, color: "var(--text-faint)", lineHeight: 1.7, marginBottom: 8 }}>
          You can speak in several segments, each up to 55 seconds; the text is appended automatically.
          {mic.busy && <span style={{ color: "var(--accent)" }}> Recognizing…</span>}
        </div>

        {/* ---- 讲解记录 ---- */}
        <label style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 8 }}>
          You can also type or edit your explanation
          <textarea aria-label="Written explanation" value={transcript} onChange={e => setTranscript(e.target.value)} disabled={recording || phase === 'analyzing'} rows={5} maxLength={12000} placeholder="Explain it in your own words, and state the conditions under which it applies." style={{ width: '100%', boxSizing: 'border-box', marginTop: 5, padding: 9, borderRadius: 8, background: 'var(--bg-primary)', color: 'var(--text-normal)', border: '1px solid var(--bd-strong)', fontSize: 12.5, lineHeight: 1.6, resize: 'vertical' }} />
        </label>
        {transcript && (
          <div style={{ marginBottom: 8 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 11.5, color: "var(--text-muted)", marginBottom: 3,
            }}>
              <span>Your explanation ({wordCount} characters / {fmtDur(totalSec)})</span>
              <div style={{ flex: "1 1 auto" }} />
              <button
                onClick={() => setTranscript("")}
                style={{ fontSize: 11, color: "var(--text-faint)" }}
                disabled={recording || phase === "analyzing"}
              >
                Clear
              </button>
            </div>
            <div style={{
              padding: "7px 9px", borderRadius: 6, fontSize: 12.5, lineHeight: 1.8,
              background: "var(--bg-secondary)", whiteSpace: "pre-wrap", wordBreak: "break-word",
              maxHeight: 200, overflow: "auto",
            }}>
              {transcript}
            </div>
            {lastChunk && (
              <div style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 3 }}>
                Latest segment: "{lastChunk}"
              </div>
            )}
          </div>
        )}

        {/* ---- 查缺补漏 ---- */}
        <button
          onClick={() => void analyze()}
          disabled={!canAnalyze}
          style={{
            width: "100%", padding: "9px 0", borderRadius: 8, fontSize: 13.5, fontWeight: 500,
            background: canAnalyze ? "var(--accent)" : "var(--bg-secondary)",
            color: canAnalyze ? "var(--on-accent)" : "var(--text-faint)",
            cursor: canAnalyze ? "pointer" : "not-allowed",
            marginBottom: 8,
          }}
        >
          {phase === "analyzing"
            ? "Checking what is missing…"
            : canAnalyze
              ? "Done → check what is missing"
              : `Done → check what is missing (${Math.max(0, 10 - wordCount)} more characters needed)`}
        </button>

        {/* ---- AI 反馈 ---- */}
        {(feedback || streaming) && (
          <div className="companion-feedback" style={{
            padding: "8px 10px", borderRadius: 6, fontSize: 12.5, lineHeight: 1.85,
            background: "var(--bg-primary)", border: "1px solid var(--bd-strong)",
            whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--accent)", marginBottom: 4 }}>
              Feedback on this explanation
              {streaming && <span style={{ color: "var(--text-faint)", fontWeight: 400 }}> Generating…</span>}
            </div>
            {feedback}
            {streaming && <span style={{ color: "var(--text-faint)" }}>▍</span>}

            {!streaming && feedback && (
              <div style={{ marginTop: 6, display: "flex", gap: 10 }}>
                <button
                  onClick={() => {
                    voice.stop();
                    void voice.speak(markdownToSpeech(feedback).slice(0, 600), { preferCloud: cloudReady });
                  }}
                  style={{ fontSize: 11, color: "var(--accent)", textDecoration: "underline" }}
                >
                  Read it to me
                </button>
                <button
                  onClick={reset}
                  style={{ fontSize: 11, color: "var(--text-faint)", textDecoration: "underline" }}
                >
                  Explain again
                </button>
              </div>
            )}
          </div>
        )}

        {/* ---- 空状态提示 ---- */}
        {!transcript && !feedback && (
          <div style={{ fontSize: 12, color: "var(--text-faint)", lineHeight: 1.9, padding: "4px 0" }}>
            The Feynman technique asks you to teach someone who knows nothing about the topic,
            explaining it in your own words.
            <div style={{ marginTop: 6 }}>
              Do not worry about getting it wrong — the AI points out key points you missed,
              vague phrasing, and asks follow-up questions on your weakest areas.
            </div>
          </div>
        )}

        {error && (
          <div style={{
            marginTop: 8, padding: "6px 8px", borderRadius: 6, fontSize: 11.5,
            background: "#fdecec", color: "var(--red, #dc2626)", lineHeight: 1.7,
          }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
