// 数字人能力检测
//
// 用户要求"先检测功能" —— 也就是先把**哪些能用、哪些没配**查清楚，
// 而不是先画一个数字人出来，结果点下去处处报错。
//
// 检测项：
//   1. 语音合成的凭据（腾讯云 TTS）—— 没配就没法出声
//   2. 语音识别的凭据（腾讯云 ASR）—— 没配就没法听
//   3. 口型数据生成（纯算法，不需要网络，随时可用）
//   4. 麦克风设备（Electron 里可以枚举）
//   5. 系统语音（浏览器内置 speechSynthesis）—— 作为 TTS 的免费回退
//
// ★ 关键判断：**没配凭据不等于功能坏**。
//   腾讯云那两条需要密钥；口型算法与系统语音是本地能力，
//   所以面板上要把"缺凭据"和"不可用"分开说，否则用户以为整个功能废了。
const path = require("node:path");
const { pathToFileURL } = require("node:url");

let voiceMod = null;
async function loadVoice() {
  if (voiceMod) return voiceMod;
  // packages/voice 是纯 ESM，主进程是 CJS，用动态 import
  const candidates = [
    path.resolve(__dirname, "..", "..", "..", "packages", "voice", "src", "index.mjs"),
    path.join(process.resourcesPath ?? "", "voice", "index.mjs"),
  ];
  for (const c of candidates) {
    try {
      voiceMod = await import(pathToFileURL(c).href);
      return voiceMod;
    } catch { /* 试下一个 */ }
  }
  return null;
}

/**
 * 给裸 PCM 套一个 WAV 头，让浏览器/`<audio>` 能直接播。
 *
 * ★ 为什么必须做这一步：
 *   腾讯云 TTS 默认返回 `pcm` —— 那是**没有文件头的裸采样数据**，
 *   浏览器拿到它无法解码（`new Audio()` 会直接失败，且不报明确原因）。
 *   实测返回：16000 Hz、16 bit、单声道 → 每帧 2 字节。
 *   包成 WAV 只是一个 44 字节的头，不需要任何转码，也就没有额外依赖。
 *
 * 如果以后把 codec 改成 mp3，这个函数就用不上了（mp3 自带帧头）。
 */
function pcmToWav(pcm, { sampleRate = 16000, channels = 1, bitsPerSample = 16 } = {}) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);       // 整个文件大小 - 8
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);                   // fmt 块长度
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
   * 一次性返回所有检测结果。
   * 界面据此决定：
   *   · 能出声 → 显示"试听"
   *   · 能听 → 显示"按住说话"
   *   · 缺凭据 → 明确告诉用户缺什么、去哪配，而不是给一个点了就报错的按钮
   */
  ipcMain.handle("avatar:probe", async () => {
    const out = {
      ok: true,
      // 各项的 {available, reason}
      tts: { available: false, reason: null },
      asr: { available: false, reason: null },
      viseme: { available: false, reason: null },
      systemTts: { available: false, reason: null },
      credentials: { configured: false, keys: [] },
      voices: [],
      limits: null,
    };

    // ---- 腾讯云凭据 ----
    const voice = await loadVoice();
    if (!voice) {
      out.tts.reason = "找不到语音模块（packages/voice）";
      out.asr.reason = out.tts.reason;
      out.viseme.reason = out.tts.reason;
      return out;
    }

    try {
      /**
       * ⚠️ credentialsStatus() 的真实返回（实测）：
       *   { fromEnv, storeExists, storeMode, storePath, ready }
       *   判定可用看 **ready**，不是 configured/ok —— 我第一版猜错了字段名，
       *   结果永远显示"未配置"。
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
          ? "凭据存在但不完整"
          : "还没有配置腾讯云密钥";
        out.tts.reason = `${how}（语音合成需要 SecretId / SecretKey）`;
        out.asr.reason = `${how}（语音识别需要同样的凭据）`;
      }
    } catch (e) {
      out.tts.reason = `读取凭据失败：${e.message}`;
      out.asr.reason = out.tts.reason;
    }

    // ---- 口型算法（纯本地，不需要网络） ----
    try {
      // ⚠️ buildVisemeTrack 返回的是**帧数组**（实测），不是 {frames: [...]}
      const track = voice.buildVisemeTrack(
        [{ text: "测", startMs: 0, endMs: 200 }, { text: "试", startMs: 200, endMs: 400 }]
      );
      const frames = Array.isArray(track) ? track : (track?.frames ?? []);
      out.viseme.available = frames.length > 0;
      out.viseme.frames = frames.length;
      if (!out.viseme.available) out.viseme.reason = "口型生成返回空";
    } catch (e) {
      out.viseme.reason = `口型生成失败：${e.message}`;
    }

    // ---- 上限与常量 ----
    try {
      out.limits = {
        ttsMaxChars: voice.TTS_MAX_CHARS ?? null,
        asr: voice.ASR_ONE_SHOT_LIMITS ?? null,
      };
      out.voices = Array.isArray(voice.VOICE_PRESETS) ? voice.VOICE_PRESETS : [];
      out.voicesWithTiming = voice.VOICES_WITH_TIMING ?? null;
      out.defaultVoice = voice.DEFAULT_VOICE ?? null;
    } catch { /* 不影响主判定 */ }

    return out;
  });

  /**
   * 语音识别（把录音变成文字）。
   *
   * ★ 音频格式走 WAV：
   *   腾讯云一句话识别支持 wav/mp3/m4a 等；选 wav 是因为渲染进程能
   *   **自己从麦克风采到 PCM 直接包 WAV**（不需要引入任何编码器）。
   *   用 MediaRecorder 录 webm/opus 反而有兼容风险（不是所有 ASR 接口都吃）。
   *
   * ★ 上限 60 秒 / 3 MB（平台的硬限制）：
   *   16 kHz 16 bit 单声道 ≈ 32 KB/秒 → 60 秒约 1.9 MB，在 3 MB 以内。
   *   渲染进程会在录到 55 秒时自动停，避免用户录超了才发现失败。
   */
  ipcMain.handle("avatar:asr", async (_e, { audioBase64, format = "wav", sampleRate = 16000 } = {}) => {
    const voice = await loadVoice();
    if (!voice) return { ok: false, error: "找不到语音模块" };
    if (!audioBase64) return { ok: false, error: "没有收到音频数据" };

    const st = voice.credentialsStatus();
    if (!st.ready) {
      return { ok: false, error: "还没有配置腾讯云凭据（语音识别需要）" };
    }

    let buf;
    try {
      buf = Buffer.from(audioBase64, "base64");
    } catch {
      return { ok: false, error: "音频数据解码失败" };
    }
    if (!buf.length) return { ok: false, error: "音频为空" };

    const limit = voice.ASR_ONE_SHOT_LIMITS ?? { maxBytes: 3 * 1024 * 1024, maxSeconds: 60 };
    if (buf.length > limit.maxBytes) {
      return {
        ok: false,
        error: `录音 ${(buf.length / 1024 / 1024).toFixed(2)} MB 超过上限 ` +
               `${(limit.maxBytes / 1024 / 1024).toFixed(0)} MB，请说短一点`,
      };
    }

    try {
      const t0 = Date.now();
      const r = await voice.recognizeOnce(buf, { voiceFormat: format, sampleRate });
      // 识别不出内容时 text 是空串 —— 这不是错误，是"没听清"，要说清楚
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
      if (/AuthFailure|Signature|Unauthorized/i.test(msg)) hint = "密钥可能不正确或已被禁用。";
      else if (/FailedOperation|Silent|无法识别|no valid/i.test(msg)) hint = "可能是没录到声音，或者环境太吵。";
      else if (/ResourceInsufficient|Insufficient|欠费/i.test(msg)) hint = "账户余额不足，或语音识别服务未开通。";
      return { ok: false, error: msg, hint };
    }
  });

  /**
   * 合成一段语音（共享实现）。
   *
   * ⚠️ 不要用 ipcMain._invokeHandlers 去"转发"到另一个处理器 ——
   *    那是 Electron 的私有属性，版本升级就可能没了。
   *    两个 IPC 入口共用一个普通函数，才是稳的做法。
   */
  async function synthOnce({ text = "", voiceType, speed } = {}) {
    const voice = await loadVoice();
    if (!voice) return { ok: false, error: "找不到语音模块" };
    if (!String(text).trim()) return { ok: false, error: "文本为空" };

    // 先查凭据，没配就明确说清楚，不去打网络
    const st = voice.credentialsStatus();
    if (!st.ready) {
      return {
        ok: false,
        error: `还没有配置腾讯云凭据。设置环境变量 ${voice.ENV_KEYS?.secretId ?? "TENCENT_SECRET_ID"} / ` +
               `${voice.ENV_KEYS?.secretKey ?? "TENCENT_SECRET_KEY"}，或存进 ${st.storePath}`,
      };
    }

    try {
      const t0 = Date.now();
      // ⚠️ synthesize 的返回没有 `ok` 字段，**失败是抛异常**。
      //    第一版判 r.ok，把成功当成了失败。
      const r = await voice.synthesize(text, {
        ...(voiceType ? { voiceType } : {}),
        ...(speed !== undefined ? { speed } : {}),
      });
      if (!r?.audio?.length) return { ok: false, error: "接口返回了空音频" };

      // 裸 PCM 要包 WAV 头；其他编码（mp3 等）原样返回
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
        // 口型数据源：字级时间戳
        timings: r.timings ?? [],
        timingAvailable: Boolean(r.timingAvailable),
      };
    } catch (e) {
      // 常见错因给出可操作的提示，而不是把原始报错直接丢给用户
      const msg = String(e?.message ?? e);
      let hint = null;
      if (/AuthFailure|Signature|secretId|SecretId|UnauthorizedOperation/i.test(msg)) {
        hint = "密钥可能不正确或已被禁用，请到腾讯云控制台核对。";
      } else if (/LimitExceeded|RequestLimit/i.test(msg)) {
        hint = "调用频率超限，稍等再试。";
      } else if (/ResourceInsufficient|Insufficient|欠费/i.test(msg)) {
        hint = "账户余额不足，或语音合成服务未开通。";
      }
      return { ok: false, error: msg, hint };
    }
  }

  /** 云端合成（带真实字级时间戳，可驱动口型） */
  ipcMain.handle("avatar:tts", (_e, payload) => synthOnce(payload ?? {}));

  /**
   * 试听 —— 保留旧名字，内部走同一个 synthOnce。
   * 不删它是因为已有测试与界面在调；改成共用实现，避免两套逻辑漂移。
   */
  ipcMain.handle("avatar:ttsTest", (_e, payload) => synthOnce(payload ?? { text: "你好，我是格致。" }));

  /** 打开日志/诊断信息用的数据库与配置位置 */
  ipcMain.handle("avatar:paths", async () => ({
    ok: true,
    credentials: path.join(app.getPath("userData"), "credentials.enc"),
    userData: app.getPath("userData"),
  }));
}

module.exports = { registerAvatar };
