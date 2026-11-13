// Gezhi · Voice service (Tencent Cloud ASR / TTS)
//
// Security rules (the most important constraints of this module):
//   1. Keys are used only in the **main process** and never sent to the renderer — signing needs SecretKey,
//      and once it reaches the frontend anyone who can open DevTools can take it.
//   2. Key source priority: environment variables > encrypted store (%APPDATA%\gezhi\credentials.enc).
//      **Never write keys into any file**, including this module's comments and tests.
//   3. This module exposes only "text in, audio out" and "audio in, text out" to the outside;
//      callers cannot get, and do not need, the credential object.
import crypto from "node:crypto";
import { loadSecrets, credentialsInfo } from "../../core/src/credentials.mjs";

// ------------------------------------------------------------------ Credential resolution

/** Environment variable names (for tests and local development; production uses the encrypted store) */
export const ENV_KEYS = {
  secretId: "TENCENT_SECRET_ID",
  secretKey: "TENCENT_SECRET_KEY",
};

/**
 * Get Tencent Cloud credentials. Returns { secretId, secretKey, source }.
 * Never print the contents — report only the source.
 */
export function resolveTencentCredentials({ passphrase } = {}) {
  const envId = process.env[ENV_KEYS.secretId];
  const envKey = process.env[ENV_KEYS.secretKey];
  if (envId && envKey) {
    return { secretId: envId, secretKey: envKey, source: "environment variables" };
  }
  try {
    const s = loadSecrets({ passphrase });
    if (s?.tencent?.secretId && s?.tencent?.secretKey) {
      return { ...s.tencent, source: "encrypted store" };
    }
  } catch (e) {
    throw new Error(`Failed to read encrypted credentials: ${e.message}`);
  }
  throw new Error(
    `No Tencent Cloud credentials available. Set the ${ENV_KEYS.secretId} / ${ENV_KEYS.secretKey} environment variables, ` +
    `or configure ${credentialsInfo().path} first`
  );
}

/** Report only whether things are configured, without exposing contents — for the settings page */
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

/** Text limit per Tencent Cloud TTS request: 150 Chinese characters (full-width punctuation counts as one character) */
export const TTS_MAX_CHARS = 150;

/**
 * Voice presets.
 *
 * Warning, measured lesson (2026-10-01, all 12 voices scanned one by one, see docs/05):
 *   **The "education voices" (403005 Yun Yaqin / 403003 Yun Xiaotian) do not support timestamps** —
 *   yet they are exactly the ones that best fit the "AI teacher" persona. The supernatural voices (602005/603001) also do not support them.
 *   Voices that do support timestamps: basic (101001/101002/0), premium (1001/1002),
 *   and large-model (501008 Zhibin / 501000 Zhilan / 601008 Zhibin 2).
 *
 *   Timestamps are the data source for the digital human's lip sync — without them we would have to estimate mouth shapes from audio energy (a notch worse).
 *   So the default voice was changed to "large-model · Zhilan": high-grade audio quality with timestamps available.
 */
export const VOICE_PRESETS = {
  // Supported timestamps (lip sync usable)
  llmZhiLan: 501000,      // large-model · Zhilan — **default**: good quality + character-level timestamps
  llmZhiBin: 501008,      // large-model · Zhibin — male
  llmZhiBin2: 601008,     // large-model · Zhibin 2
  premiumZhiYu: 1001,     // premium · Zhiyu
  premiumZhiLing: 1002,   // premium · Zhiling
  basicF: 101001,         // basic female (uses the least quota)
  basicM: 101002,         // basic male
  // Warning: no timestamp support — use only when lip sync is not needed (e.g. plain reading)
  teacherYunYaqin: 403005,  // education · Yun Yaqin
  campusYunXiaotian: 403003,// education · Yun Xiaotian
  naturalYunMu: 602005,     // supernatural · Yun Mu
  naturalYunXi: 603001,     // supernatural · Yun Xi
};

/** Voices measured and confirmed to support character-level timestamps */
export const VOICES_WITH_TIMING = new Set([501000, 501008, 601008, 1001, 1002, 101001, 101002, 0]);

/** Default voice: the intersection of "good audio quality + lip-sync data available" */
export const DEFAULT_VOICE = VOICE_PRESETS.llmZhiLan;

/**
 * Split long text into pieces under the limit, breaking at punctuation where possible.
 * Why this is necessary: texts over 150 characters make the API error out, and AI-generated explanations are usually far longer.
 */
export function splitForTts(text, limit = TTS_MAX_CHARS) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean ? [clean] : [];

  const parts = [];
  let buf = "";
  // Prefer breaking at sentence-ending punctuation, then commas, and hard-cut as a last resort
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
      // A single sentence is already too long: split at commas again, and hard-cut if still too long
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

/** Lazily load the SDK (so importing the whole module does not fail when the SDK is not installed) */
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
 * Synthesize a piece of speech.
 *
 * @param {string} text
 * @param {object} opts
 * @param {number} [opts.voiceType]  Voice ID, default 403005 (Yun Yaqin)
 * @param {string} [opts.codec]      "pcm" | "wav" | "mp3", default pcm (makes frame alignment easy for the digital human)
 * @param {number} [opts.sampleRate] 16000 / 8000, default 16000
 * @param {number} [opts.speed]      [-2, 6], default 0
 * @param {boolean}[opts.withTiming] Whether character-level timestamps are wanted (lip-sync data source), default true
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
  if (pieces.length === 0) throw new Error("Text is empty");

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
    if (audio.length === 0) throw new Error("The API returned empty audio");

    // Timestamps: the SDK has already parsed them into an array (the field is Subtitles, plural, not Subtitle).
    // Measured lesson: the research report's "Subtitle (JSON string)" is wrong —
    //   ① the field name is Subtitles
    //   ② the type is Array<{Text, BeginTime, EndTime, BeginIndex, EndIndex}>
    //   ③ even with EnableSubtitle: true, measurements on this machine found several voices returning an empty array (see docs/05)
    // So be lenient here: playback must work even without timestamps, just without lip-sync data.
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
      // Without timestamps, estimate duration from the sample rate so the offset still advances between chunks
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
 * Compress character-level timestamps into a "lip-sync frame sequence".
 *
 * This is the core of the digital human approach: Tencent Cloud TTS's EnableSubtitle gives each character's
 * start and end time for free, which amounts to a free lip-sync (viseme) data source — no audio-driven model needed.
 * This is a minimal version for now: produce "mouth open/closed" frames along the timeline; later they can be refined by pinyin finals.
 *
 * @param {Array} timings  timings returned by synthesize()
 * @param {number} fps     Target frame rate, default 30
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
      // Widest in the middle of the character, closing at the edges — gives the mouth shape a natural open-close arc
      const span = Math.max(1, cur.endMs - cur.beginMs);
      const phase = Math.min(1, (t - cur.beginMs) / span);
      open = Math.sin(Math.PI * phase);
      open = Math.max(0.25, open);   // mouth stays at least slightly open while speaking
      ch = cur.text;
    }
    frames.push({ t: Math.round(t), open: Number(open.toFixed(3)), ch });
  }
  return frames;
}

// ------------------------------------------------------------------ ASR

/** One-shot recognition (synchronous) limits: audio <= 60 seconds, <= 3 MB */
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
 * One-shot recognition: audio -> text.
 *
 * The key point for the Macau scenario: EngineModelType supports
 *   16k_zh     Mandarin
 *   16k_zh-PY  mixed Chinese/English/Cantonese
 *   16k_yue    Cantonese
 *   16k_zh_dialect 23 dialects
 *
 * @param {Buffer} audioData Audio data
 * @param {object} opts
 * @param {string} [opts.engine]    Engine type, default 16k_zh-PY (mixed Chinese/English/Cantonese is very common among Macau students)
 * @param {string} [opts.voiceFormat] "wav" | "pcm" | "mp3" | "m4a" | "silk", default wav
 * @param {number} [opts.sampleRate] default 16000
 */
export async function recognizeOnce(audioData, opts = {}) {
  const {
    engine = "16k_zh-PY",
    voiceFormat = "wav",
    sampleRate = 16000,
    hotwordList = null,
  } = opts;

  if (!Buffer.isBuffer(audioData) || audioData.length === 0) throw new Error("Audio is empty");
  if (audioData.length > ASR_ONE_SHOT_LIMITS.maxBytes) {
    throw new Error(`Audio is ${(audioData.length / 1024 / 1024).toFixed(2)}MB, over the 3MB one-shot recognition limit; use recording-file recognition instead`);
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
    ConvertNumMode: 1,      // convert numbers to Arabic numerals, making later numeric grading easier
    WordInfo: 1,            // request character-level information
  };
  if (hotwordList) req.HotwordList = hotwordList;

  const res = await client.SentenceRecognition(req);
  // Measured lesson: the SDK has already parsed WordList into an array (Array<SentenceWord>),
  // so JSON.parse-ing it again yields a "[object Object]" parse failure — and the first version's
  // assertion only checked Array.isArray, so this bug "passed". Assertions must check length.
  const words = Array.isArray(res.WordList) ? res.WordList : [];
  return {
    text: res.Result ?? "",
    requestId: res.RequestId ?? null,
    audioDurationMs: res.AudioDuration ?? null,
    wordCount: res.WordSize ?? words.length,
    words,
  };
}

/** Turn ASR results into the input the Feynman scoring needs (an explanation transcript with a timeline) */
export function toTranscript(words) {
  if (!words?.length) return { text: "", segments: [] };
  return {
    text: words.map((w) => w.Word).join(""),
    segments: words.map((w) => ({ word: w.Word, startMs: w.StartTime, endMs: w.EndTime })),
  };
}
