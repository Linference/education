// 数字人 · 能力检测
//
// 用户要求"先检测功能" —— 先查清哪些能用、哪些没配，而不是先画一个数字人，
// 结果点下去处处报错。
//
// ★ 核心区分（面板上必须说清）：
//   · **本地能力**：口型算法、系统语音 —— 不需要密钥，现在就能用
//   · **云端能力**：腾讯云语音合成 / 识别 —— 需要 SecretId / SecretKey
//   把这两类混在一起说"不可用"，用户会以为整个功能废了。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AvatarStage, { type VisemeFrame } from "./AvatarStage";

/**
 * 把**真实的**字级时间戳压成口型帧。
 *
 * 算法与 packages/voice 的 buildVisemeTrack 完全一致：
 * 字中间张得最大、首尾收拢（sin 弧线），发音期间嘴至少微张 0.25。
 * 在渲染进程重写一份是因为那个包是纯 ESM，这一侧不引它。
 *
 * ⚠️ 两份实现必须保持同一条公式，否则"本地估算"和"云端真实"驱动出来的
 *    口型观感会不一致（同一个字一个快一个慢）。改动时两边一起改。
 */
function buildVisemeTrackFromTimings(
  timings: Array<{ text: string; beginMs: number; endMs: number }>,
  fps = 30,
): VisemeFrame[] {
  if (!timings.length) return [];
  const step = 1000 / fps;
  const end = timings[timings.length - 1].endMs;
  const frames: VisemeFrame[] = [];
  let ti = 0;
  for (let ms = 0; ms <= end + step; ms += step) {
    while (ti < timings.length && timings[ti].endMs < ms) ti++;
    const cur = timings[ti];
    let open = 0;
    let c = "";
    if (cur && ms >= cur.beginMs) {
      const span = Math.max(1, cur.endMs - cur.beginMs);
      const phase = Math.min(1, (ms - cur.beginMs) / span);
      open = Math.max(0.25, Math.sin(Math.PI * phase));
      c = cur.text;
    }
    frames.push({ t: Math.round(ms), open: Number(open.toFixed(3)), ch: c });
  }
  return frames;
}

/**
 * 把文本估算成"字级时间戳"，再压成口型帧。
 *
 * ★ 这是本地版（不需要密钥）。
 *   算法与 packages/voice 的 buildVisemeTrack 一致：
 *   字中间张得最大、首尾收拢，用 sin 弧线，发音期间嘴至少微张 0.25。
 *
 * ★ 为什么在渲染进程里重写一遍：
 *   packages/voice 是纯 ESM，渲染进程这一侧不引它（体积与打包成本）；
 *   而且本地朗读本来就没有真实时间戳，只有估算值。
 *   等接上腾讯云 TTS，字级时间戳是真的，届时走 IPC 拿真帧即可 ——
 *   AvatarStage 只认 VisemeFrame[]，换数据源不用改形象组件。
 */
function buildLocalVisemeTrack(text: string, fps = 30): VisemeFrame[] {
  const chars = [...text];
  if (!chars.length) return [];

  // 逐字给时长：汉字约 165ms；标点与空格当作停顿，不发音但占时间
  let t = 0;
  const timings: Array<{ text: string; beginMs: number; endMs: number }> = [];
  for (const ch of chars) {
    if (/[\s]/.test(ch)) { t += 60; continue; }
    if (/[，。！？、；：,.!?;:]/.test(ch)) { t += 170; continue; }
    const dur = 165;
    timings.push({ text: ch, beginMs: t, endMs: t + dur });
    t += dur;
  }
  if (!timings.length) return [];

  // 压缩成帧（照 buildVisemeTrack 的写法）
  const step = 1000 / fps;
  const end = timings[timings.length - 1].endMs;
  const frames: VisemeFrame[] = [];
  let ti = 0;
  for (let ms = 0; ms <= end + step; ms += step) {
    while (ti < timings.length && timings[ti].endMs < ms) ti++;
    const cur = timings[ti];
    let open = 0;
    let c = "";
    if (cur && ms >= cur.beginMs) {
      const span = Math.max(1, cur.endMs - cur.beginMs);
      const phase = Math.min(1, (ms - cur.beginMs) / span);
      open = Math.max(0.25, Math.sin(Math.PI * phase));
      c = cur.text;
    }
    frames.push({ t: Math.round(ms), open: Number(open.toFixed(3)), ch: c });
  }
  return frames;
}

interface Cap {
  available: boolean;
  reason: string | null;
  frames?: number;
}
interface ProbeResult {
  ok: boolean;
  tts: Cap;
  asr: Cap;
  viseme: Cap;
  credentials: {
    configured: boolean;
    fromEnv?: boolean;
    storeExists?: boolean;
    storeMode?: string | null;
    storePath?: string | null;
  };
  voices?: unknown[];
  limits?: { ttsMaxChars?: number | null; asr?: { maxSeconds?: number; maxBytes?: number } | null } | null;
  error?: string;
}

interface Props {
  vaultPath: string | null;
}

/**
 * 一行检测结果
 */
function CapRow({ label, cap, hint }: { label: string; cap: Cap; hint?: string }) {
  const ok = cap.available;
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 8,
      padding: "7px 8px", borderBottom: "1px solid var(--bd)",
    }}>
      <span style={{
        flex: "0 0 auto", width: 16, textAlign: "center", fontSize: 13, lineHeight: "18px",
        color: ok ? "#16a34a" : "var(--text-faint)",
      }}>
        {ok ? "✔" : "—"}
      </span>
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: ok ? 500 : 400, color: ok ? "var(--text-normal)" : "var(--text-muted)" }}>
          {label}
        </div>
        {!ok && cap.reason && (
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 1, lineHeight: 1.6 }}>
            {cap.reason}
          </div>
        )}
        {ok && hint && (
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 1 }}>{hint}</div>
        )}
      </div>
      <span style={{
        flex: "0 0 auto", fontSize: 10.5, padding: "1px 6px", borderRadius: 8,
        background: ok ? "#e9f7ee" : "var(--bg-secondary)",
        color: ok ? "#14532d" : "var(--text-faint)",
      }}>
        {ok ? "可用" : "未就绪"}
      </span>
    </div>
  );
}

export default function AvatarPanel({ vaultPath }: Props) {
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** 系统语音（浏览器内置）是否可用 —— 这是 TTS 的免费回退 */
  const [sysTts, setSysTts] = useState<{ ok: boolean; voices: number; reason?: string }>({ ok: false, voices: 0 });
  /** 麦克风设备 */
  const [mics, setMics] = useState<{ ok: boolean; count: number; reason?: string }>({ ok: false, count: 0 });
  const [speakText, setSpeakText] = useState("你好，我是格致。");
  const [speakMsg, setSpeakMsg] = useState<string | null>(null);

  // ---- 数字人说话状态 ----
  /** 是否正在说话（驱动口型动画） */
  const [speaking, setSpeaking] = useState(false);
  /** 语音实际总时长（毫秒）。拿到后口型会按它伸缩对齐 */
  const [actualMs, setActualMs] = useState<number | null>(null);
  /** 当前说到的字（显示出来便于确认口型与字对得上） */
  const [curChar, setCurChar] = useState("");
  const speakStartRef = useRef(0);

  /**
   * 当前文本对应的口型帧。
   *
   * 优先用**云端返回的真实时间戳**（cloudFrames），没有才退回本地估算。
   * 这就是把"口型数据源"与"形象组件"解耦的收益：
   * 形象只认 VisemeFrame[]，换成真实时间戳时它一行都不用改。
   */
  const localFrames = useMemo(() => buildLocalVisemeTrack(speakText), [speakText]);
  const [cloudFrames, setCloudFrames] = useState<VisemeFrame[] | null>(null);
  const frames = cloudFrames ?? localFrames;

  const run = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await window.gezhi.avatar.probe();
      setProbe(r);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void run(); }, [run]);

  // ---- 系统语音（浏览器内置，无需密钥） ----
  useEffect(() => {
    const synth = (window as any).speechSynthesis;
    if (!synth) { setSysTts({ ok: false, voices: 0, reason: "这个环境没有内置语音合成" }); return; }
    const read = () => {
      const vs = synth.getVoices?.() ?? [];
      setSysTts({ ok: vs.length > 0, voices: vs.length, reason: vs.length ? undefined : "系统里没有可用的语音" });
    };
    read();
    // 语音列表是异步加载的，第一次可能为空
    synth.addEventListener?.("voiceschanged", read);
    return () => synth.removeEventListener?.("voiceschanged", read);
  }, []);

  // ---- 麦克风设备 ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const md = (navigator as any).mediaDevices;
        if (!md?.enumerateDevices) {
          if (!cancelled) setMics({ ok: false, count: 0, reason: "这个环境不支持枚举音频设备" });
          return;
        }
        const devs = await md.enumerateDevices();
        const audioIn = (devs ?? []).filter((d: any) => d.kind === "audioinput");
        if (!cancelled) {
          setMics({
            ok: audioIn.length > 0,
            count: audioIn.length,
            // 没授权时设备名是空的，但数量通常仍能拿到
            reason: audioIn.length ? undefined : "没有检测到麦克风",
          });
        }
      } catch (e: any) {
        if (!cancelled) setMics({ ok: false, count: 0, reason: e?.message ?? String(e) });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /**
   * 用系统语音朗读（不需要腾讯云密钥），同时驱动口型。
   *
   * ★ 关键点：系统语音**不给**时间戳，所以我事先不知道它会读多久。
   *   做法是：
   *     1. onstart 时记下开始时刻，按估算时长先动起来
   *     2. onend 时算出**真实**时长，回填给 AvatarStage
   *    AvatarStage 拿到真实时长后会按比例伸缩口型 ——
   *    即使系统语音比估算快或慢，嘴也不会越说越偏。
   */
  const speakLocal = () => {
    const synth = (window as any).speechSynthesis;
    if (!synth) { setSpeakMsg("这个环境没有内置语音合成"); return; }
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(speakText);
      u.lang = "zh-CN";
      u.rate = 1.0;

      u.onstart = () => {
        speakStartRef.current = performance.now();
        setActualMs(null);          // 先按估算动
        setSpeaking(true);
        setSpeakMsg("正在用系统语音朗读…");
      };
      u.onend = () => {
        const real = performance.now() - speakStartRef.current;
        setSpeaking(false);
        setCurChar("");
        // 回填真实时长（>=200ms 才可信，太短说明是被打断的）
        if (real > 200) setActualMs(Math.round(real));
        setSpeakMsg(`朗读完成（实际 ${(real / 1000).toFixed(1)} 秒，口型已按此时长对齐）`);
      };
      u.onerror = (e: any) => {
        setSpeaking(false);
        setCurChar("");
        setSpeakMsg("朗读失败：" + (e?.error ?? "未知原因"));
      };
      synth.speak(u);
    } catch (e: any) {
      setSpeakMsg("朗读失败：" + (e?.message ?? e));
    }
  };

  /** 停止朗读 */
  const stopSpeak = () => {
    const synth = (window as any).speechSynthesis;
    try { synth?.cancel(); } catch { /* 忽略 */ }
    setSpeaking(false);
    setCurChar("");
  };

  /**
   * 跟随口型进度显示"当前说到的字"。
   *
   * 用与 AvatarStage 相同的归一化算法（真实时长优先），
   * 所以文字高亮与嘴的动作是同一条时间轴，不会各走各的。
   */
  useEffect(() => {
    if (!speaking || !frames.length) { setCurChar(""); return; }
    let raf = 0;
    const t0 = performance.now();
    const total = actualMs && actualMs > 0
      ? actualMs
      : (frames[frames.length - 1]?.t ?? 0);
    const tick = () => {
      const elapsed = performance.now() - t0;
      if (total <= 0 || elapsed >= total) { setCurChar(""); return; }
      const idx = Math.min(frames.length - 1, Math.floor((elapsed / total) * frames.length));
      setCurChar(frames[idx]?.ch ?? "");
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speaking, frames, actualMs]);

  /**
   * 用腾讯云合成并播放（需要凭据）。
   *
   * ★ 与系统语音的关键差别：**腾讯云返回真实的字级时间戳**。
   *   所以口型不再是估算的，而是每个字精确起止 ——
   *   这就是"免费拿到 viseme 数据"的做法（EnableSubtitle）。
   *
   * ★ 音频是 WAV：主进程已经把裸 PCM 包好头了。
   *   浏览器不能直接播裸 PCM，会静默失败。
   */
  const speakCloud = async () => {
    setSpeakMsg("正在请求云端语音合成…");
    setCloudFrames(null);
    try {
      const r = await window.gezhi.avatar.tts({ text: speakText });
      if (!r.ok || !r.base64) {
        setSpeakMsg(`合成失败：${r.error ?? "未知原因"}${r.hint ? ` —— ${r.hint}` : ""}`);
        return;
      }

      // 音频 → blob → 播放
      const bin = atob(r.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: r.mime ?? "audio/wav" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      // ★ 用真实时间戳压口型帧
      let realFrames: VisemeFrame[] | null = null;
      if (r.timings?.length) {
        realFrames = buildVisemeTrackFromTimings(r.timings);
        setCloudFrames(realFrames);
      }

      // 语音实际时长：接口给的 totalMs 最准，拿不到就用音频元素的 duration
      const knownMs = r.totalMs && r.totalMs > 0 ? r.totalMs : null;

      audio.onplay = () => {
        setSpeaking(true);
        setActualMs(knownMs);
      };
      audio.onended = () => {
        setSpeaking(false);
        setCurChar("");
        setActualMs(knownMs);
        URL.revokeObjectURL(url);
        const bits = [
          `已播放（${(r.bytes! / 1024).toFixed(0)} KB）`,
          r.timingAvailable ? `${r.timings!.length} 段真实时间戳驱动口型` : "无可用的时间戳",
          `${r.ms}ms 合成`,
        ];
        setSpeakMsg(bits.join(" · "));
      };
      audio.onerror = () => {
        setSpeaking(false);
        setCurChar("");
        URL.revokeObjectURL(url);
        setSpeakMsg("音频播放失败（格式可能不被支持）");
      };

      // duration 兜底：真到播放时才知道
      audio.onloadedmetadata = () => {
        if (!knownMs && Number.isFinite(audio.duration) && audio.duration > 0) {
          setActualMs(Math.round(audio.duration * 1000));
        }
      };

      await audio.play();
    } catch (e: any) {
      setSpeakMsg("播放失败：" + (e?.message ?? e));
    }
  };

  if (!vaultPath) {
    return <div className="tree-empty">打开一个库后可以检测数字人能力</div>;
  }

  const localReady = [sysTts.ok, mics.ok, Boolean(probe?.viseme.available)].filter(Boolean).length;
  const cloudReady = [Boolean(probe?.tts.available), Boolean(probe?.asr.available)].filter(Boolean).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* 顶部：总体状态 */}
      <div style={{
        flex: "0 0 auto", padding: "8px 10px", borderBottom: "1px solid var(--bd)",
        background: "var(--bg-secondary)", fontSize: 11.5,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600 }}>能力检测</span>
          <div style={{ flex: "1 1 auto" }} />
          <button
            onClick={() => void run()}
            style={{ color: "var(--accent)", fontSize: 11.5, textDecoration: "underline" }}
          >
            {loading ? "检测中…" : "重新检测"}
          </button>
        </div>
        <div style={{ marginTop: 4, color: "var(--text-faint)", lineHeight: 1.7 }}>
          本地能力 {localReady}/3 · 云端能力 {cloudReady}/2
          <br />
          <span style={{ fontSize: 10.5 }}>
            本地能力不需要密钥，现在就能用；云端需要腾讯云凭据。
          </span>
        </div>
      </div>

      <div style={{ flex: "1 1 auto", overflow: "auto", minHeight: 0 }}>
        {err && (
          <div style={{ padding: "6px 10px", fontSize: 11.5, color: "var(--red)", background: "#fdecec" }}>
            检测出错：{err}
          </div>
        )}

        {/* ---- 本地能力 ---- */}
        <div style={{
          padding: "6px 10px 2px", fontSize: 11, fontWeight: 600,
          color: "var(--text-muted)", letterSpacing: 0.5,
        }}>
          本地能力（不需要密钥）
        </div>
        <CapRow
          label="口型数据生成"
          cap={probe?.viseme ?? { available: false, reason: "还没检测" }}
          hint={probe?.viseme.frames ? `实测生成 ${probe.viseme.frames} 帧` : undefined}
        />
        <CapRow
          label="系统语音朗读（TTS 回退）"
          cap={{ available: sysTts.ok, reason: sysTts.reason ?? null }}
          hint={sysTts.ok ? `系统里有 ${sysTts.voices} 个语音` : undefined}
        />
        <CapRow
          label="麦克风（录音输入）"
          cap={{ available: mics.ok, reason: mics.reason ?? null }}
          hint={mics.ok ? `检测到 ${mics.count} 个输入设备` : undefined}
        />

        {/* ---- 云端能力 ---- */}
        <div style={{
          padding: "10px 10px 2px", fontSize: 11, fontWeight: 600,
          color: "var(--text-muted)", letterSpacing: 0.5,
        }}>
          云端能力（需要腾讯云凭据）
        </div>
        <CapRow label="语音合成（TTS）" cap={probe?.tts ?? { available: false, reason: "还没检测" }} />
        <CapRow label="语音识别（ASR）" cap={probe?.asr ?? { available: false, reason: "还没检测" }} />

        {/* 凭据详情：没配的时候告诉用户看哪里 */}
        {probe && !probe.credentials.configured && (
          <div style={{
            margin: "8px 10px", padding: "7px 9px", borderRadius: 4,
            background: "var(--bg-secondary)", fontSize: 11, lineHeight: 1.8,
            color: "var(--text-muted)",
          }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>凭据未配置</div>
            两种配置方式：
            <br />· 环境变量 <code style={{ fontSize: 10.5 }}>TENCENT_SECRET_ID</code> 与 <code style={{ fontSize: 10.5 }}>TENCENT_SECRET_KEY</code>
            {/*
              ⚠️ 变量名必须与 packages/voice 的 ENV_KEYS 完全一致：
                 secretId → TENCENT_SECRET_ID
                 secretKey → TENCENT_SECRET_KEY
              第一版我写成 TENCENTCLOUD_SECRET_ID（凭印象拼的），
              用户照着配也配不上。这里是从真实导出读出来的。
            */}
            <br />· 或存进格致的加密凭据库
            {probe.credentials.storePath && (
              <>
                <br />
                <span style={{ fontSize: 10.5, color: "var(--text-faint)", wordBreak: "break-all" }}>
                  {probe.credentials.storePath}
                </span>
              </>
            )}
          </div>
        )}

        {probe?.credentials.configured && (
          <div style={{ margin: "8px 10px", fontSize: 11, color: "#14532d" }}>
            ✔ 凭据已就绪
            {probe.credentials.fromEnv ? "（来自环境变量）" : "（来自加密凭据库）"}
          </div>
        )}

        {/* ---- 数字人 ---- */}
        <div style={{
          padding: "10px 10px 2px", fontSize: 11, fontWeight: 600,
          color: "var(--text-muted)", letterSpacing: 0.5,
        }}>
          数字人
        </div>
        <div style={{ padding: "0 10px 14px" }}>
          <div style={{
            display: "flex", justifyContent: "center", padding: "6px 0 2px",
            background: "var(--bg-secondary)", borderRadius: 8, marginBottom: 8,
          }}>
            <AvatarStage
              frames={frames}
              speaking={speaking}
              actualMs={actualMs}
              size={188}
              status={
                speaking
                  ? (curChar ? `正在说：「${curChar}」` : "正在说…")
                  : `口型帧 ${frames.length} 个 · ${actualMs ? `上次实际 ${(actualMs / 1000).toFixed(1)}s` : "未朗读"}`
              }
            />
          </div>

          <textarea
            value={speakText}
            onChange={(e) => { setSpeakText(e.target.value); setActualMs(null); }}
            rows={2}
            placeholder="输入要让它说的话…"
            style={{
              width: "100%", fontSize: 12, padding: "5px 7px", marginBottom: 6,
              border: "1px solid var(--bd-strong)", borderRadius: 4, resize: "vertical",
              background: "var(--bg-primary)", color: "var(--text-normal)", outline: "none",
              fontFamily: "inherit",
            }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            {speaking ? (
              <button
                onClick={stopSpeak}
                style={{
                  flex: "1 1 auto", padding: "6px 8px", borderRadius: 4, fontSize: 12,
                  background: "var(--red, #dc2626)", color: "#fff",
                }}
              >
                停止
              </button>
            ) : (
              <button
                onClick={speakLocal}
                disabled={!sysTts.ok || !speakText.trim()}
                style={{
                  flex: "1 1 auto", padding: "6px 8px", borderRadius: 4, fontSize: 12,
                  background: sysTts.ok && speakText.trim() ? "var(--accent)" : "var(--bg-secondary)",
                  color: sysTts.ok && speakText.trim() ? "#fff" : "var(--text-faint)",
                  cursor: sysTts.ok && speakText.trim() ? "pointer" : "not-allowed",
                }}
                title={sysTts.ok ? "用系统语音朗读并驱动口型" : "系统语音不可用"}
              >
                说话（系统语音）
              </button>
            )}
            <button
              onClick={() => void speakCloud()}
              disabled={!probe?.tts.available || speaking}
              style={{
                flex: "1 1 auto", padding: "6px 8px", borderRadius: 4, fontSize: 12,
                background: probe?.tts.available && !speaking ? "var(--accent)" : "var(--bg-secondary)",
                color: probe?.tts.available && !speaking ? "#fff" : "var(--text-faint)",
                cursor: probe?.tts.available && !speaking ? "pointer" : "not-allowed",
              }}
              title={probe?.tts.available ? "用腾讯云合成（音质更好，带真实字级时间戳）" : "未配置凭据"}
            >
              腾讯云语音
            </button>
          </div>
          {speakMsg && (
            <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
              {speakMsg}
            </div>
          )}

          {/* 上限说明：让用户知道为什么长文本要分段 */}
          {probe?.limits && (
            <div style={{ marginTop: 10, fontSize: 10.5, color: "var(--text-faint)", lineHeight: 1.8 }}>
              平台上限：
              {probe.limits.ttsMaxChars ? <> 单次合成 {probe.limits.ttsMaxChars} 字</> : null}
              {probe.limits.asr?.maxSeconds ? <> · 单次识别 {probe.limits.asr.maxSeconds} 秒</> : null}
              {probe.limits.asr?.maxBytes ? <>（≤ {(probe.limits.asr.maxBytes / 1024 / 1024).toFixed(1)} MB）</> : null}
              <br />
              超过上限格致会自动分段。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
