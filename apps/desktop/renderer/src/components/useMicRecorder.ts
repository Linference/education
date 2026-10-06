// 麦克风录音 hook：按住说话 → WAV → 腾讯云识别 → 文字
//
// ★ 为什么不用 MediaRecorder：
//   它录出来是 webm/opus，而腾讯云一句话识别要求 wav/mp3/m4a 之类。
//   要么在渲染进程转码（要引编码器），要么让接口去猜 —— 两条都不稳。
//   所以直接用 Web Audio 采 PCM：**采集时就指定 16 kHz**，
//   停下后自己包一个 44 字节的 WAV 头就完事，零依赖、零转码。
//
// ★ 为什么在渲染进程包 WAV 而不是把 PCM 丢给主进程：
//   主进程那边已经有 pcmToWav 了 —— 但它是给"云端返回的 PCM"用的。
//   麦克风这条路的采样格式由这里决定（16 bit 单声道），
//   在本层包好可以让主进程只面对"一个能播的 WAV 文件"这一种输入。
import { useCallback, useEffect, useRef, useState } from "react";

/** 采样率：腾讯云 16k 引擎要 16 kHz */
const SAMPLE_RATE = 16000;
/** 录到多久自动停（平台上限 60 秒，留 5 秒余量） */
const AUTO_STOP_MS = 55000;

/** Float32 单声道 → 16 bit PCM 的 WAV */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const dataLen = samples.length * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buf);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);          // fmt 块长度
  view.setUint16(20, 1, true);           // 1 = PCM
  view.setUint16(22, 1, true);           // 单声道
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);  // 字节率
  view.setUint16(32, bytesPerSample, true);               // 块对齐
  view.setUint16(34, 16, true);          // 位深
  writeStr(36, "data");
  view.setUint32(40, dataLen, true);

  // 夹到 [-1, 1] 再转 16 bit，避免爆音时溢出成噪音
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([buf], { type: "audio/wav" });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = String(fr.result);
      resolve(s.slice(s.indexOf(",") + 1));   // 去掉 data:...;base64,
    };
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

export interface AsrResult {
  ok: boolean;
  text?: string;
  empty?: boolean;
  ms?: number;
  audioBytes?: number;
  audioDurationMs?: number;
  wordCount?: number;
  error?: string;
  hint?: string | null;
}

export function useMicRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending,setPending] = useState(false);
  const pendingBlob = useRef<Blob | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodeRef = useRef<ScriptProcessorNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 让录音结束的 Promise 有地方落地 */
  const stopResolverRef = useRef<((blob: Blob | null) => void) | null>(null);

  /** 彻底释放麦克风与音频上下文 —— 不放会一直亮着系统的录音提示 */
  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (autoRef.current) { clearTimeout(autoRef.current); autoRef.current = null; }
    try { nodeRef.current?.disconnect(); } catch { /* 忽略 */ }
    try { ctxRef.current?.close(); } catch { /* 忽略 */ }
    streamRef.current?.getTracks().forEach((t) => { try { t.stop(); } catch { /* 忽略 */ } });
    nodeRef.current = null;
    ctxRef.current = null;
    streamRef.current = null;
  }, []);

  useEffect(() => () => { cleanup(); }, [cleanup]);

  /**
   * 停止录音并拿到 WAV。
   * 自动停与手动停都走它 —— 所以它**不能依赖 recording 这个 state**
   * （否则会形成 start ↔ stop 的循环引用，TS 也会报"先用后声明"）。
   * 用 ref 判断"是否真的在录"就够了。
   */
  const stopInternal = useCallback(async (): Promise<Blob | null> => {
    const wasActive = Boolean(ctxRef.current || streamRef.current);
    setRecording(false);
    if (!wasActive) return null;

    const chunks = chunksRef.current;
    chunksRef.current = [];
    cleanup();

    const total = chunks.reduce((n, c) => n + c.length, 0);
    if (!total) return null;

    const all = new Float32Array(total);
    let off = 0;
    for (const c of chunks) { all.set(c, off); off += c.length; }
    return encodeWav(all, SAMPLE_RATE);
  }, [cleanup]);

  /** 开始录音 */
  const start = useCallback(async () => {
    if (recording) return;
    setError(null);
    setSeconds(0);
    pendingBlob.current = null; setPending(false);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      // ★ 关键：把 AudioContext 直接开在 16 kHz，
      //   浏览器会自己做重采样 —— 省掉手写重采样这一步
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx({ sampleRate: SAMPLE_RATE });
      ctxRef.current = ctx;

      const src = ctx.createMediaStreamSource(stream);
      // ScriptProcessor 虽已标记废弃，但兼容性最好；AudioWorklet 要额外文件
      const node = ctx.createScriptProcessor(4096, 1, 1);
      nodeRef.current = node;

      node.onaudioprocess = (e: AudioProcessingEvent) => {
        // 复制一份：输入缓冲会被复用
        chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };

      // 必须接到 destination 才会触发 onaudioprocess；
      // 但不能把麦克风声音放出来（会啸叫），所以用一个静音增益节点
      const mute = ctx.createGain();
      mute.gain.value = 0;
      src.connect(node);
      node.connect(mute);
      mute.connect(ctx.destination);

      setRecording(true);

      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      // 到自动停的时限就自己停，别让用户录到一半才发现超限
      autoRef.current = setTimeout(() => { void stopInternal().then(blob => { pendingBlob.current = blob; setPending(Boolean(blob)); }); }, AUTO_STOP_MS);
    } catch (e: any) {
      cleanup();
      setRecording(false);
      const msg = e?.name === "NotAllowedError"
        ? "没有麦克风权限。请在系统设置里允许格致使用麦克风。"
        : (e?.message ?? String(e));
      setError(msg);
    }
  }, [recording, cleanup, stopInternal]);

  /** 停止并识别 */
  const stopAndRecognize = useCallback(async (): Promise<AsrResult> => {
    setBusy(true);
    setError(null);
    try {
      const blob = pendingBlob.current || await stopInternal();
      pendingBlob.current = null; setPending(false);
      if (!blob) {
        setBusy(false);
        const msg = "没有录到声音";
        setError(msg);
        return { ok: false, error: msg };
      }

      const base64 = await blobToBase64(blob);
      const r = await window.gezhi.avatar.asr({ audioBase64: base64, format: "wav", sampleRate: SAMPLE_RATE });
      setBusy(false);
      if (!r.ok) {
        setError(`${r.error ?? "识别失败"}${r.hint ? ` —— ${r.hint}` : ""}`);
      }
      return r as AsrResult;
    } catch (e: any) {
      setBusy(false);
      const msg = e?.message ?? String(e);
      setError(msg);
      return { ok: false, error: msg };
    }
  }, [stopInternal]);

  /** 放弃这次录音 */
  const cancel = useCallback(() => {
    setRecording(false);
    chunksRef.current = [];
    pendingBlob.current = null; setPending(false);
    cleanup();
    setSeconds(0);
  }, [cleanup]);

  return { recording, seconds, busy, error, pending, start, stopAndRecognize, cancel, setError };
}
