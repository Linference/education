// 数字人的"发声引擎"（hook）
//
// 从 AvatarPanel 里抽出来，因为现在有**两个地方**要用它：
//   · 数字人面板的"打字朗读"
//   · 数字人对话台（AI 回答后自动念出来）
// 抽成 hook 就不会出现两份实现各自漂移。
//
// ★ 两条发声路径：
//   cloud  —— 腾讯云 TTS。音质好，而且**免费给字级时间戳**，
//             所以口型是精确的（这是本项目数字人的核心技术点）。
//   system —— 浏览器内置语音。不需要密钥，随时能用，口型按字数估算。
//
// ★ 口型对齐的做法（两条路都要）：
//   系统语音事先不知道会读多久，所以：
//     1. onstart 时按估算时长先动起来
//     2. onend 时拿到**真实**时长回填，口型按比例伸缩
//   云端直接用接口返回的 totalMs，一开始就是准的。
import { useCallback, useEffect, useRef, useState } from "react";
import { type VisemeFrame, buildLocalVisemeTrack, buildVisemeTrackFromTimings } from "./viseme";

export type VoiceSource = "cloud" | "system";

export interface SpeakResult {
  ok: boolean;
  source: VoiceSource;
  /** 实际发声时长（毫秒） */
  ms?: number;
  error?: string;
}

export function useAvatarVoice() {
  const [speaking, setSpeaking] = useState(false);
  const [actualMs, setActualMs] = useState<number | null>(null);
  const [curChar, setCurChar] = useState("");
  const [frames, setFrames] = useState<VisemeFrame[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [source, setSource] = useState<VoiceSource | null>(null);

  const startRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** 用于让旧的朗读在被新的替换时停下（跟着最后一次请求走） */
  const seqRef = useRef(0);

  /** 停掉一切正在发声的东西 */
  const stop = useCallback(() => {
    seqRef.current += 1;
    try { (window as any).speechSynthesis?.cancel(); } catch { /* 忽略 */ }
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch { /* 忽略 */ }
      audioRef.current = null;
    }
    setSpeaking(false);
    setCurChar("");
  }, []);

  // 卸载时清理，避免"关掉面板声音还在响"
  useEffect(() => () => { stop(); }, [stop]);

  /**
   * 跟随口型进度高亮"当前说到的字"。
   * 用与形象组件相同的归一化算法（真实时长优先），
   * 所以文字高亮与嘴的动作走同一条时间轴，不会各走各的。
   */
  useEffect(() => {
    if (!speaking || !frames.length) { setCurChar(""); return; }
    let raf = 0;
    const t0 = performance.now();
    const total = actualMs && actualMs > 0 ? actualMs : (frames[frames.length - 1]?.t ?? 0);
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

  /** 系统语音（不需要密钥） */
  const speakSystem = useCallback((text: string): Promise<SpeakResult> => {
    return new Promise((resolve) => {
      const synth = (window as any).speechSynthesis;
      if (!synth) {
        setStatus("这个环境没有内置语音合成");
        resolve({ ok: false, source: "system", error: "没有内置语音合成" });
        return;
      }
      const clean = text.trim();
      if (!clean) { resolve({ ok: false, source: "system", error: "文本为空" }); return; }

      try { synth.cancel(); } catch { /* 忽略 */ }

      // 本地估算的口型帧（系统语音拿不到时间戳）
      const est = buildLocalVisemeTrack(clean);
      setFrames(est);
      setActualMs(null);

      const seq = ++seqRef.current;
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = "zh-CN";
      u.rate = 1.0;

      u.onstart = () => {
        if (seq !== seqRef.current) return;
        startRef.current = performance.now();
        setSpeaking(true);
        setSource("system");
        setStatus("正在用系统语音朗读…");
      };
      u.onend = () => {
        if (seq !== seqRef.current) return;
        const real = performance.now() - startRef.current;
        setSpeaking(false);
        setCurChar("");
        if (real > 200) setActualMs(Math.round(real));
        setStatus(`朗读完成（${(real / 1000).toFixed(1)} 秒，口型已按此时长对齐）`);
        resolve({ ok: true, source: "system", ms: Math.round(real) });
      };
      u.onerror = (e: any) => {
        if (seq !== seqRef.current) return;
        setSpeaking(false);
        setCurChar("");
        const msg = e?.error ?? "未知原因";
        setStatus("朗读失败：" + msg);
        resolve({ ok: false, source: "system", error: String(msg) });
      };
      synth.speak(u);
    });
  }, []);

  /** 云端语音（腾讯云；需要凭据） */
  const speakCloud = useCallback(async (text: string): Promise<SpeakResult> => {
    const clean = text.trim();
    if (!clean) return { ok: false, source: "cloud", error: "文本为空" };

    setStatus("正在请求云端语音…");
    try {
      const r = await window.gezhi.avatar.tts({ text: clean });
      if (!r.ok || !r.base64) {
        const msg = `${r.error ?? "未知原因"}${r.hint ? ` —— ${r.hint}` : ""}`;
        setStatus("云端合成失败：" + msg);
        return { ok: false, source: "cloud", error: msg };
      }

      // 音频 → blob → <audio>
      const bin = atob(r.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: r.mime ?? "audio/wav" }));
      const audio = new Audio(url);
      audioRef.current = audio;

      // ★ 真实字级时间戳 → 精确口型（这是云端路径的价值所在）
      if (r.timings?.length) setFrames(buildVisemeTrackFromTimings(r.timings));

      const knownMs = r.totalMs && r.totalMs > 0 ? r.totalMs : null;
      const seq = ++seqRef.current;

      return await new Promise<SpeakResult>((resolve) => {
        audio.onplay = () => {
          if (seq !== seqRef.current) return;
          setSpeaking(true);
          setSource("cloud");
          setActualMs(knownMs);
        };
        audio.onended = () => {
          if (seq !== seqRef.current) { URL.revokeObjectURL(url); return; }
          setSpeaking(false);
          setCurChar("");
          setActualMs(knownMs);
          URL.revokeObjectURL(url);
          audioRef.current = null;
          setStatus(
            `已朗读（${(r.bytes! / 1024).toFixed(0)} KB · ${r.ms}ms 合成 · ` +
            `${r.timingAvailable ? `${r.timings!.length} 段真实时间戳驱动口型` : "无时间戳"})`
          );
          resolve({ ok: true, source: "cloud", ms: knownMs ?? undefined });
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          setSpeaking(false);
          setStatus("音频播放失败（格式可能不被支持）");
          resolve({ ok: false, source: "cloud", error: "播放失败" });
        };
        audio.onloadedmetadata = () => {
          if (!knownMs && Number.isFinite(audio.duration) && audio.duration > 0) {
            setActualMs(Math.round(audio.duration * 1000));
          }
        };
        audio.play().catch((err) => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          setSpeaking(false);
          setStatus("播放被拒绝：" + (err?.message ?? err));
          resolve({ ok: false, source: "cloud", error: String(err?.message ?? err) });
        });
      });
    } catch (e: any) {
      setStatus("云端朗读失败：" + (e?.message ?? e));
      return { ok: false, source: "cloud", error: String(e?.message ?? e) };
    }
  }, []);

  /**
   * 自动选路径发声。
   * preferCloud=true 且凭据就绪时走云端；否则退回系统语音。
   * 云端失败**不自动回退** —— 用户可能正想看到云端具体错在哪（如密钥失效）。
   */
  const speak = useCallback(async (text: string, opts: { preferCloud?: boolean } = {}) => {
    if (opts.preferCloud) {
      const r = await speakCloud(text);
      return r;
    }
    return speakSystem(text);
  }, [speakCloud, speakSystem]);

  return {
    speaking, actualMs, curChar, frames, status, source,
    speak, speakSystem, speakCloud, stop,
    /** 让外面能设置提示文字（如"已跳过朗读"） */
    setStatus,
  };
}
