// 格致 · 语音服务（腾讯云 ASR / TTS）
//
// 安全铁律（这个模块最要紧的约束）：
//   1. 密钥只在**主进程**使用，绝不下发到渲染进程 —— 签名需要 SecretKey，
//      一旦进前端，任何能开 DevTools 的人都能拿走。
//   2. 密钥来源优先级：环境变量 > 加密存储（%APPDATA%\gezhi\credentials.enc）。
//      **不要把密钥写进任何文件**，包括这个模块的注释和测试。
//   3. 这个模块对外只暴露「文本进、音频出」和「音频进、文本出」，
//      调用方拿不到也不需要拿 credential 对象。
import crypto from "node:crypto";
import { loadSecrets, credentialsInfo } from "../../core/src/credentials.mjs";

// ------------------------------------------------------------------ 密钥解析

/** 环境变量名（测试与本机开发用；生产走加密存储） */
export const ENV_KEYS = {
  secretId: "TENCENT_SECRET_ID",
  secretKey: "TENCENT_SECRET_KEY",
};

/**
 * 取腾讯云凭据。返回 { secretId, secretKey, source }。
 * 绝不把内容打印出来 —— 只报来源。
 */
export function resolveTencentCredentials({ passphrase } = {}) {
  const envId = process.env[ENV_KEYS.secretId];
  const envKey = process.env[ENV_KEYS.secretKey];
  if (envId && envKey) {
    return { secretId: envId, secretKey: envKey, source: "环境变量" };
  }
  try {
    const s = loadSecrets({ passphrase });
    if (s?.tencent?.secretId && s?.tencent?.secretKey) {
      return { ...s.tencent, source: "加密存储" };
    }
  } catch (e) {
    throw new Error(`读取加密凭据失败：${e.message}`);
  }
  throw new Error(
    `没有可用的腾讯云凭据。请设置环境变量 ${ENV_KEYS.secretId} / ${ENV_KEYS.secretKey}，` +
    `或先配置 ${credentialsInfo().path}`
  );
}

/** 只报"有没有配好"，不暴露内容 —— 给设置页用 */
export function credentialsStatus() {
  const envOk = Boolean(process.env[ENV_KEYS.secretId] && process.env[ENV_KEYS.secretKey]);
  const info = credentialsInfo();
  return {
    fromEnv: envOk,
    storeExists: info.exists,
    storeMode: info.mode ?? null,
    storePath: info.path,
    ready: envOk || info.exists,
  };
}

// ------------------------------------------------------------------ TTS

/** 腾讯云 TTS 单次请求的文本上限：中文 150 字（全角标点算一字） */
export const TTS_MAX_CHARS = 150;

/**
 * 音色预设。
 *
 * ⚠ 实测教训（2026-10-01，12 个音色逐个扫过，见 docs/05）：
 *   **"教育音色"（403005 云雅琴 / 403003 云小天）不支持时间戳** ——
 *   而它们恰好是最贴合"AI 老师"人设的那一档。同时超自然音色（602005/603001）也不支持。
 *   支持时间戳的是：基础版（101001/101002/0）、精品（1001/1002）、
 *   大模型（501008 智斌 / 501000 智兰 / 601008 智斌2）。
 *
 *   而时间戳是数字人口型的数据源 —— 没有它就得靠音频能量估口型（效果差一档）。
 *   所以默认音色改选"大模型·智兰"：音质属于高档，且时间戳可用。
 */
export const VOICE_PRESETS = {
  // ✅ 支持时间戳（口型可用）
  llmZhiLan: 501000,      // 大模型·智兰 —— **默认**：音质好 + 有字级时间戳
  llmZhiBin: 501008,      // 大模型·智斌 —— 男声
  llmZhiBin2: 601008,     // 大模型·智斌2
  premiumZhiYu: 1001,     // 精品·智瑜
  premiumZhiLing: 1002,   // 精品·智聆
  basicF: 101001,         // 基础版女声（最省额度）
  basicM: 101002,         // 基础版男声
  // ⚠ 不支持时间戳 —— 只在不需要口型时用（例如纯朗读）
  teacherYunYaqin: 403005,  // 教育·云雅琴
  campusYunXiaotian: 403003,// 教育·云小天
  naturalYunMu: 602005,     // 超自然·云幕
  naturalYunXi: 603001,     // 超自然·云希
};

/** 已实测确认支持字级时间戳的音色 */
export const VOICES_WITH_TIMING = new Set([501000, 501008, 601008, 1001, 1002, 101001, 101002, 0]);

/** 默认音色：挑"音质好 + 有口型数据"的交集 */
export const DEFAULT_VOICE = VOICE_PRESETS.llmZhiLan;

/**
 * 把长文本切成不超过上限的片段，尽量在标点处断开。
 * 为什么必须做：超 150 字接口直接报错，而 AI 生成的讲解稿通常远超这个长度。
 */
export function splitForTts(text, limit = TTS_MAX_CHARS) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean ? [clean] : [];

  const parts = [];
  let buf = "";
  // 优先在句末标点断开，其次逗号，最后硬切
  const sentences = clean.split(/(?<=[。！？；!?;])/);
  for (const s of sentences) {
    if ((buf + s).length <= limit) {
      buf += s;
      continue;
    }
    if (buf) parts.push(buf.trim());
    if (s.length <= limit) {
      buf = s;
    } else {
      // 单句就超长：按逗号再切，还超就硬切
      let rest = s;
      while (rest.length > limit) {
        const cut = rest.lastIndexOf("，", limit);
        const at = cut > limit * 0.5 ? cut + 1 : limit;
        parts.push(rest.slice(0, at).trim());
        rest = rest.slice(at);
      }
      buf = rest;
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

/** 惰性加载 SDK（避免没装 SDK 时整个模块 import 就炸） */
let _ttsClient = null;
async function ttsClient() {
  if (_ttsClient) return _ttsClient;
  const mod = await import("tencentcloud-sdk-nodejs-tts");
  const TtsClient = mod.default.tts.v20190823.Client;
  const cred = resolveTencentCredentials();
  _ttsClient = new TtsClient({
    credential: { secretId: cred.secretId, secretKey: cred.secretKey },
    region: "",
    profile: { httpProfile: { endpoint: "tts.tencentcloudapi.com" } },
  });
  return _ttsClient;
}

/**
 * 合成一段语音。
 *
 * @param {string} text
 * @param {object} opts
 * @param {number} [opts.voiceType]  音色 ID，默认 403005（云雅琴）
 * @param {string} [opts.codec]      "pcm" | "wav" | "mp3"，默认 pcm（便于数字人按帧对齐）
 * @param {number} [opts.sampleRate] 16000 / 8000，默认 16000
 * @param {number} [opts.speed]      [-2, 6]，默认 0
 * @param {boolean}[opts.withTiming] 是否要字级时间戳（口型数据源），默认 true
 * @returns {{audio: Buffer, codec: string, sampleRate: number, timings: Array, chunks: number, requestIds: string[]}}
 */
export async function synthesize(text, opts = {}) {
  const {
    voiceType = DEFAULT_VOICE,
    codec = "pcm",
    sampleRate = 16000,
    speed = 0,
    volume = 0,
    withTiming = true,
  } = opts;

  const pieces = splitForTts(text);
  if (pieces.length === 0) throw new Error("文本为空");

  const client = await ttsClient();
  const buffers = [];
  const timings = [];
  const requestIds = [];
  let offsetMs = 0;

  for (const piece of pieces) {
    const req = {
      Text: piece,
      SessionId: crypto.randomUUID(),
      VoiceType: voiceType,
      Codec: codec,
      SampleRate: sampleRate,
      Speed: speed,
      Volume: volume,
      EnableSubtitle: withTiming,
    };
    const res = await client.TextToVoice(req);
    requestIds.push(res.RequestId ?? null);

    const audio = Buffer.from(res.Audio ?? "", "base64");
    if (audio.length === 0) throw new Error("接口返回了空音频");

    // 时间戳：SDK 已经解析成数组了（字段名是 Subtitles，复数，不是 Subtitle）。
    // 实测教训：调研报告里写的 "Subtitle（JSON 字符串）" 是错的 ——
    //   ① 字段名是 Subtitles
    //   ② 类型是 Array<{Text, BeginTime, EndTime, BeginIndex, EndIndex}>
    //   ③ 即使 EnableSubtitle: true，本机实测多个音色都返回空数组（见 docs/05）
    // 所以这里必须宽容：拿不到时间戳也要能正常出声，只是没有口型数据。
    const subs = Array.isArray(res.Subtitles) ? res.Subtitles : [];
    if (withTiming && subs.length > 0) {
      for (const w of subs) {
        timings.push({
          text: w.Text ?? "",
          beginMs: (w.BeginTime ?? 0) + offsetMs,
          endMs: (w.EndTime ?? 0) + offsetMs,
        });
      }
      const last = subs[subs.length - 1];
      if (last?.EndTime) offsetMs += last.EndTime;
    } else {
      // 没有时间戳时按采样率粗算时长，保证分片之间的 offset 仍然推进
      const bytesPerMs = codec === "pcm" ? (sampleRate * 2) / 1000 : null;
      if (bytesPerMs) offsetMs += Math.round(audio.length / bytesPerMs);
    }

    buffers.push(audio);
  }

  return {
    audio: Buffer.concat(buffers),
    codec,
    sampleRate,
    timings,
    timingAvailable: timings.length > 0,
    chunks: pieces.length,
    requestIds,
    totalMs: offsetMs,
  };
}

/**
 * 把字级时间戳压缩成"口型帧序列"。
 *
 * 这是数字人方案的核心：腾讯云 TTS 的 EnableSubtitle 免费给出每个字的
 * 起止时间，等于免费拿到口型（viseme）数据源 —— 不需要音频驱动的模型。
 * 这里先做最简版本：按时间轴产出「嘴张开/闭合」的帧，后续可按拼音韵母细分。
 *
 * @param {Array} timings  synthesize() 返回的 timings
 * @param {number} fps     目标帧率，默认 30
 * @returns {Array<{t:number, open:number, ch:string}>} open: 0..1
 */
export function buildVisemeTrack(timings, { fps = 30, gapMs = 40 } = {}) {
  if (!timings?.length) return [];
  const step = 1000 / fps;
  const end = timings[timings.length - 1].endMs;
  const frames = [];
  let ti = 0;
  for (let t = 0; t <= end + step; t += step) {
    while (ti < timings.length && timings[ti].endMs < t) ti++;
    const cur = timings[ti];
    let open = 0;
    let ch = "";
    if (cur && t >= cur.beginMs) {
      // 字中间张得最大、首尾收拢 —— 让口型有个自然的开合弧线
      const span = Math.max(1, cur.endMs - cur.beginMs);
      const phase = Math.min(1, (t - cur.beginMs) / span);
      open = Math.sin(Math.PI * phase);
      open = Math.max(0.25, open);   // 发音期间嘴至少微张
      ch = cur.text;
    }
    frames.push({ t: Math.round(t), open: Number(open.toFixed(3)), ch });
  }
  return frames;
}

// ------------------------------------------------------------------ ASR

/** 一句话识别（同步）限制：音频 ≤ 60 秒、≤ 3 MB */
export const ASR_ONE_SHOT_LIMITS = { maxSeconds: 60, maxBytes: 3 * 1024 * 1024 };

let _asrClient = null;
async function asrClient() {
  if (_asrClient) return _asrClient;
  const mod = await import("tencentcloud-sdk-nodejs-asr");
  const AsrClient = mod.default.asr.v20190614.Client;
  const cred = resolveTencentCredentials();
  _asrClient = new AsrClient({
    credential: { secretId: cred.secretId, secretKey: cred.secretKey },
    region: "",
    profile: { httpProfile: { endpoint: "asr.tencentcloudapi.com" } },
  });
  return _asrClient;
}

/**
 * 一句话识别：音频 → 文本。
 *
 * 澳门场景的关键：EngineModelType 支持
 *   16k_zh     普通话
 *   16k_zh-PY  中英粤混说
 *   16k_yue    粤语
 *   16k_zh_dialect 23 种方言
 *
 * @param {Buffer} audioData 音频数据
 * @param {object} opts
 * @param {string} [opts.engine]    引擎类型，默认 16k_zh-PY（澳门学生中英粤混说很常见）
 * @param {string} [opts.voiceFormat] "wav" | "pcm" | "mp3" | "m4a" | "silk"，默认 wav
 * @param {number} [opts.sampleRate] 默认 16000
 */
export async function recognizeOnce(audioData, opts = {}) {
  const {
    engine = "16k_zh-PY",
    voiceFormat = "wav",
    sampleRate = 16000,
    hotwordList = null,
  } = opts;

  if (!Buffer.isBuffer(audioData) || audioData.length === 0) throw new Error("音频为空");
  if (audioData.length > ASR_ONE_SHOT_LIMITS.maxBytes) {
    throw new Error(`音频 ${(audioData.length / 1024 / 1024).toFixed(2)}MB 超过一句话识别上限 3MB，请改用录音文件识别`);
  }

  const client = await asrClient();
  const req = {
    ProjectId: 0,
    EngSerViceType: engine,
    SourceType: 1,          // 1 = 音频数据
    VoiceFormat: voiceFormat,
    Data: audioData.toString("base64"),
    DataLen: audioData.length,
    FilterDirty: 1,
    FilterModal: 1,
    FilterPunc: 0,
    ConvertNumMode: 1,      // 数字转阿拉伯数字，方便后续按数字判分
    WordInfo: 1,            // 要字级信息
  };
  if (hotwordList) req.HotwordList = hotwordList;

  const res = await client.SentenceRecognition(req);
  // 实测教训：SDK 已经把 WordList 解析成数组了（Array<SentenceWord>），
  // 再 JSON.parse 一次会得到 "[object Object]" 解析失败 —— 而且我第一版的
  // 断言只判 Array.isArray，所以这个 bug 被"通过"了。断言要判长度。
  const words = Array.isArray(res.WordList) ? res.WordList : [];
  return {
    text: res.Result ?? "",
    requestId: res.RequestId ?? null,
    audioDurationMs: res.AudioDuration ?? null,
    wordCount: res.WordSize ?? words.length,
    words,
  };
}

/** 把 ASR 结果整理成费曼评分要的输入（带时间轴的讲解稿） */
export function toTranscript(words) {
  if (!words?.length) return { text: "", segments: [] };
  return {
    text: words.map((w) => w.Word).join(""),
    segments: words.map((w) => ({ word: w.Word, startMs: w.StartTime, endMs: w.EndTime })),
  };
}
