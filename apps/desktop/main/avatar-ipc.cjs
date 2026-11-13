// Digital-human capability probe
//
// The user asked to "probe the capabilities first" — that is, figure out
// **which features work and which are unconfigured** before drawing a digital
// human, only to have every click error out.
//
// Probe items:
//   1. Speech synthesis credentials (Tencent Cloud TTS) — no credentials, no audio
//   2. Speech recognition credentials (Tencent Cloud ASR) — no credentials, no listening
//   3. Viseme data generation (pure algorithm, no network, always available)
//   4. Microphone devices (enumerable in Electron)
//   5. System speech (browser built-in speechSynthesis) — free fallback for TTS
//
// ★ Key judgment: **missing credentials does not mean the feature is broken**.
//   The two Tencent Cloud items need keys; the viseme algorithm and system
//   speech are local capabilities. The panel must therefore distinguish
//   "missing credentials" from "unavailable", or users will think the whole
//   feature is dead.
const path = require("node:path");
const { pathToFileURL } = require("node:url");

let voiceMod = null;
async function loadVoice() {
  if (voiceMod) return voiceMod;
  // packages/voice is pure ESM and the main process is CJS, so use dynamic import
  const candidates = [
    path.join(process.resourcesPath ?? "", "packages", "voice", "src", "index.mjs"),
    path.resolve(__dirname, "..", "..", "..", "packages", "voice", "src", "index.mjs"),
    path.join(process.resourcesPath ?? "", "voice", "index.mjs"),
  ];
  for (const c of candidates) {
    try {
      voiceMod = await import(pathToFileURL(c).href);
      return voiceMod;
    } catch { /* try the next one */ }
  }
  return null;
}

/**
 * Wrap raw PCM in a WAV header so browsers/`<audio>` can play it directly.
 *
 * ★ Why this step is required:
 *   Tencent Cloud TTS returns `pcm` by default — that is **headerless raw
 *   sample data**, which the browser cannot decode (`new Audio()` fails
 *   outright without a clear reason).
 *   Measured output: 16000 Hz, 16 bit, mono → 2 bytes per frame.
 *   Wrapping it in WAV is just a 44-byte header; no transcoding, hence no
 *   extra dependency.
 *
 * If the codec is later switched to mp3, this function becomes unnecessary
 * (mp3 carries its own frame headers).
 */
function pcmToWav(pcm, { sampleRate = 16000, channels = 1, bitsPerSample = 16 } = {}) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);       // total file size - 8
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);                   // fmt chunk length
  header.writeUInt16LE(1, 20);                    // 1 = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function registerAvatar(ipcMain, getWindow, app) {
  /**
   * Return all probe results at once.
   * The UI uses them to decide:
   *   · can synthesize → show "Preview"
   *   · can listen → show "Hold to talk"
   *   · missing credentials → tell the user exactly what is missing and where
   *     to configure it, instead of a button that errors when clicked
   */
  ipcMain.handle("avatar:probe", async () => {
    const out = {
      ok: true,
      // {available, reason} for each item
      tts: { available: false, reason: null },
      asr: { available: false, reason: null },
      viseme: { available: false, reason: null },
      systemTts: { available: false, reason: null },
      credentials: { configured: false, keys: [] },
      voices: [],
      limits: null,
    };

    // ---- Tencent Cloud credentials ----
    const voice = await loadVoice();
    if (!voice) {
      out.tts.reason = "Voice module (packages/voice) not found";
      out.asr.reason = out.tts.reason;
      out.viseme.reason = out.tts.reason;
      return out;
    }

    try {
      /**
       * ⚠️ Actual return from credentialsStatus() (measured):
       *   { fromEnv, storeExists, storeMode, storePath, ready }
       *   Availability is determined by **ready**, not configured/ok — I
       *   guessed the field name wrong in the first version and it always
       *   showed "not configured".
       */
      const st = voice.credentialsStatus() ?? {};
      out.credentials = {
        configured: Boolean(st.ready),
        fromEnv: Boolean(st.fromEnv),
        storeExists: Boolean(st.storeExists),
        storeMode: st.storeMode ?? null,
        storePath: st.storePath ?? null,
      };
      out.tts.available = Boolean(st.ready);
      out.asr.available = Boolean(st.ready);
      if (!st.ready) {
        const how = st.fromEnv || st.storeExists
          ? "Credentials exist but are incomplete"
          : "Tencent Cloud keys have not been configured";
        out.tts.reason = `${how} (speech synthesis requires SecretId / SecretKey)`;
        out.asr.reason = `${how} (speech recognition requires the same credentials)`;
      }
    } catch (e) {
      out.tts.reason = `Failed to read credentials: ${e.message}`;
      out.asr.reason = out.tts.reason;
    }

    // ---- Viseme algorithm (fully local, no network needed) ----
    try {
      // ⚠️ buildVisemeTrack returns a **frame array** (measured), not {frames: [...]}
      const track = voice.buildVisemeTrack(
        [{ text: "测", startMs: 0, endMs: 200 }, { text: "试", startMs: 200, endMs: 400 }]
      );
      const frames = Array.isArray(track) ? track : (track?.frames ?? []);
      out.viseme.available = frames.length > 0;
      out.viseme.frames = frames.length;
      if (!out.viseme.available) out.viseme.reason = "Viseme generation returned no frames";
    } catch (e) {
      out.viseme.reason = `Viseme generation failed: ${e.message}`;
    }

    // ---- Limits and constants ----
    try {
      out.limits = {
        ttsMaxChars: voice.TTS_MAX_CHARS ?? null,
        asr: voice.ASR_ONE_SHOT_LIMITS ?? null,
      };
      out.voices = Array.isArray(voice.VOICE_PRESETS) ? voice.VOICE_PRESETS : [];
      out.voicesWithTiming = voice.VOICES_WITH_TIMING ?? null;
      out.defaultVoice = voice.DEFAULT_VOICE ?? null;
    } catch { /* does not affect the main verdict */ }

    return out;
  });

  /**
   * Speech recognition (turn a recording into text).
   *
   * ★ Audio format is WAV:
   *   Tencent Cloud one-shot recognition supports wav/mp3/m4a, etc. WAV was
   *   chosen because the renderer can **capture PCM from the microphone and
   *   wrap it in WAV itself** (no encoder dependency).
   *   Using MediaRecorder to record webm/opus carries compatibility risk
   *   (not every ASR endpoint accepts it).
   *
   * ★ Limit 60 seconds / 3 MB (hard platform limit):
   *   16 kHz 16 bit mono ≈ 32 KB/s → 60 seconds is about 1.9 MB, within 3 MB.
   *   The renderer auto-stops at 55 seconds so users do not discover the
   *   failure only after over-recording.
   */
  ipcMain.handle("avatar:asr", async (_e, { audioBase64, format = "wav", sampleRate = 16000 } = {}) => {
    const voice = await loadVoice();
    if (!voice) return { ok: false, error: "Voice module not found" };
    if (!audioBase64) return { ok: false, error: "No audio data received" };

    const st = voice.credentialsStatus();
    if (!st.ready) {
      return { ok: false, error: "Tencent Cloud credentials have not been configured (required for speech recognition)" };
    }

    let buf;
    try {
      buf = Buffer.from(audioBase64, "base64");
    } catch {
      return { ok: false, error: "Failed to decode audio data" };
    }
    if (!buf.length) return { ok: false, error: "Audio is empty" };

    const limit = voice.ASR_ONE_SHOT_LIMITS ?? { maxBytes: 3 * 1024 * 1024, maxSeconds: 60 };
    if (buf.length > limit.maxBytes) {
      return {
        ok: false,
        error: `Recording is ${(buf.length / 1024 / 1024).toFixed(2)} MB, exceeding the ` +
               `${(limit.maxBytes / 1024 / 1024).toFixed(0)} MB limit; please say something shorter`,
      };
    }

    try {
      const t0 = Date.now();
      const r = await voice.recognizeOnce(buf, { voiceFormat: format, sampleRate });
      // When nothing is recognized, text is an empty string — this is not an error, just "didn't catch it"; make that clear
      const text = String(r.text ?? "").trim();
      return {
        ok: true,
        text,
        empty: !text,
        requestId: r.requestId,
        audioDurationMs: r.audioDurationMs,
        wordCount: r.wordCount,
        words: r.words ?? [],
        ms: Date.now() - t0,
        audioBytes: buf.length,
      };
    } catch (e) {
      const msg = String(e?.message ?? e);
      let hint = null;
      if (/AuthFailure|Signature|Unauthorized/i.test(msg)) hint = "The key may be incorrect or disabled.";
      else if (/FailedOperation|Silent|无法识别|no valid/i.test(msg)) hint = "Possibly no sound was recorded, or the environment is too noisy.";
      else if (/ResourceInsufficient|Insufficient|欠费/i.test(msg)) hint = "Insufficient account balance, or the speech recognition service is not activated.";
      return { ok: false, error: msg, hint };
    }
  });

  /**
   * Synthesize a piece of speech (shared implementation).
   *
   * ⚠️ Do not use ipcMain._invokeHandlers to "forward" to another handler —
   *    that is a private Electron property and may disappear in a version
   *    upgrade. Having the two IPC entry points share one ordinary function
   *    is the stable approach.
   */
  async function synthOnce({ text = "", voiceType, speed } = {}) {
    const voice = await loadVoice();
    if (!voice) return { ok: false, error: "Voice module not found" };
    if (!String(text).trim()) return { ok: false, error: "Text is empty" };

    // Check credentials first; if missing, say so clearly instead of hitting the network
    const st = voice.credentialsStatus();
    if (!st.ready) {
      return {
        ok: false,
        error: `Tencent Cloud credentials have not been configured. Set the environment variables ${voice.ENV_KEYS?.secretId ?? "TENCENT_SECRET_ID"} / ` +
               `${voice.ENV_KEYS?.secretKey ?? "TENCENT_SECRET_KEY"}, or store them in ${st.storePath}`,
      };
    }

    try {
      const t0 = Date.now();
      // ⚠️ synthesize's return has no `ok` field; **failures throw**.
      //    The first version checked r.ok and treated success as failure.
      const r = await voice.synthesize(text, {
        ...(voiceType ? { voiceType } : {}),
        ...(speed !== undefined ? { speed } : {}),
      });
      if (!r?.audio?.length) return { ok: false, error: "The API returned empty audio" };

      // Raw PCM needs a WAV header; other codecs (mp3, etc.) are returned as-is
      const isPcm = (r.codec ?? "").toLowerCase() === "pcm";
      const playable = isPcm
        ? pcmToWav(r.audio, { sampleRate: r.sampleRate ?? 16000 })
        : r.audio;

      return {
        ok: true,
        base64: playable.toString("base64"),
        mime: isPcm ? "audio/wav" : `audio/${r.codec}`,
        bytes: playable.length,
        rawBytes: r.audio.length,
        codec: r.codec,
        sampleRate: r.sampleRate,
        chunks: r.chunks,
        totalMs: r.totalMs,
        ms: Date.now() - t0,
        // Viseme data source: character-level timestamps
        timings: r.timings ?? [],
        timingAvailable: Boolean(r.timingAvailable),
      };
    } catch (e) {
      // Give actionable hints for common causes instead of dumping the raw error on the user
      const msg = String(e?.message ?? e);
      let hint = null;
      if (/AuthFailure|Signature|secretId|SecretId|UnauthorizedOperation/i.test(msg)) {
        hint = "The key may be incorrect or disabled; please check in the Tencent Cloud console.";
      } else if (/LimitExceeded|RequestLimit/i.test(msg)) {
        hint = "Request rate limit exceeded; try again later.";
      } else if (/ResourceInsufficient|Insufficient|欠费/i.test(msg)) {
        hint = "Insufficient account balance, or the speech synthesis service is not activated.";
      }
      return { ok: false, error: msg, hint };
    }
  }

  /** Cloud synthesis (with real character-level timestamps, can drive visemes) */
  ipcMain.handle("avatar:tts", (_e, payload) => synthOnce(payload ?? {}));

  /**
   * Preview — keeps the old name; internally uses the same synthOnce.
   * It is not removed because existing tests and the UI call it; sharing one
   * implementation avoids drift between two sets of logic.
   */
  ipcMain.handle("avatar:ttsTest", (_e, payload) => synthOnce(payload ?? { text: "Hello, I'm Gezhi." }));

  /** Database and config locations for logs/diagnostics */
  ipcMain.handle("avatar:paths", async () => ({
    ok: true,
    credentials: path.join(app.getPath("userData"), "credentials.enc"),
    userData: app.getPath("userData"),
  }));
}

module.exports = { registerAvatar };
