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
   * 试听。
   * 没有凭据时返回明确原因，而不是抛错。
   */
  ipcMain.handle("avatar:ttsTest", async (_e, { text = "你好，我是格致。" } = {}) => {
    const voice = await loadVoice();
    if (!voice) return { ok: false, error: "找不到语音模块" };
    try {
      const r = await voice.synthesize(text, {});
      if (!r?.ok) return { ok: false, error: r?.error ?? "合成失败" };
      // 音频以 base64 回传，渲染进程用它做 <audio> 或算时长
      const audio = r.audio ?? r.buffer ?? r.data ?? null;
      return {
        ok: true,
        bytes: audio ? audio.length : 0,
        base64: audio ? Buffer.from(audio).toString("base64") : null,
        format: r.format ?? "mp3",
        hasTiming: Boolean(r.timings?.length),
        timings: r.timings ?? null,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  /** 打开日志/诊断信息用的数据库与配置位置 */
  ipcMain.handle("avatar:paths", async () => ({
    ok: true,
    credentials: path.join(app.getPath("userData"), "credentials.enc"),
    userData: app.getPath("userData"),
  }));
}

module.exports = { registerAvatar };
