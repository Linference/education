// 设置：凭据管理 + 应用选项
//
// ★ 为什么安装包里**绝不能**内置腾讯云密钥：
//   一旦内置，任何装了格致的人都能用同一个账号调语音服务 ——
//   余额会被别人花光，密钥流到网上也收不回来。
//   正确做法就是这里：**每个用户填自己的密钥**，存在本机加密库里。
//
// ★ 凭据存储沿用 packages/core 的实现（不另起一套）：
//   默认 DPAPI（Windows 账户绑定，不落明文，开机即用）；
//   也可升级为主密码模式（scrypt + AES-256-GCM，主密码不落盘）。
//
// ★ 密钥**绝不回传前端**：
//   前端只能拿到"配没配、什么模式、存在哪"，以及后 4 位用于辨认。
//   完整密钥只在主进程里读出来用。
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

/** 应用级选项（非机密），存成 JSON */
const DEFAULT_SETTINGS = {
  /** 高保真查看：用 LibreOffice 把 Office 文档转 PDF */
  hiFi: true,
  /** 自定义 DSH 可执行文件路径（留空则自动探测） */
  dshPath: "",
  /** 默认语音音色（腾讯云 VoiceType） */
  voiceType: 501000,
  /** 默认优先用云端语音 */
  preferCloudVoice: true,
  /** 费曼台：讲完自动念出反馈 */
  feynmanSpeakFeedback: true,
  /** 编辑器字号 */
  editorFontSize: 14,
};

function registerSettings(ipcMain, getWindow, app) {
  const dir = app.getPath("userData");
  const settingsPath = path.join(dir, "settings.json");
  const credentialsPath = path.join(app.getPath("appData"), "gezhi", "credentials.enc");

  // ---------------------------------------------------------------- 选项

  function readSettings() {
    try {
      const raw = fs.readFileSync(settingsPath, "utf8");
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      // 读不到就用默认值（不报错：第一次运行本来就没有这个文件）
      return { ...DEFAULT_SETTINGS };
    }
  }

  function writeSettings(patch) {
    const next = { ...readSettings(), ...patch };
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2), "utf8");
    return next;
  }

  ipcMain.handle("settings:get", () => {
    try {
      return { ok: true, settings: readSettings(), paths: { settings: settingsPath, credentials: credentialsPath } };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle("settings:set", (_e, patch) => {
    try {
      // 白名单：不认识的键不写，避免前端手滑写进一堆垃圾
      const allowed = Object.keys(DEFAULT_SETTINGS);
      const clean = {};
      for (const [k, v] of Object.entries(patch ?? {})) {
        if (allowed.includes(k)) clean[k] = v;
      }
      return { ok: true, settings: writeSettings(clean) };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  // ---------------------------------------------------------------- 凭据

  let credMod = null;
  async function loadCred() {
    if (credMod) return credMod;
    const candidates = [
      path.join(process.resourcesPath ?? "", "packages", "core", "src", "credentials.mjs"),
      path.resolve(__dirname, "..", "..", "..", "packages", "core", "src", "credentials.mjs"),
      path.join(process.resourcesPath ?? "", "core", "credentials.mjs"),
    ];
    for (const c of candidates) {
      try { credMod = await import(pathToFileURL(c).href); return credMod; } catch { /* 试下一个 */ }
    }
    return null;
  }

  /**
   * 凭据状态。
   *
   * ★ 只报"有没有 / 什么模式 / 存在哪 / 尾号是多少"，**绝不回传完整密钥**。
   *   尾号 4 位是给用户辨认"我填的是哪一个"，泄露风险可忽略。
   */
  ipcMain.handle("settings:credStatus", async () => {
    const cred = await loadCred();
    if (!cred) return { ok: false, error: "找不到凭据模块" };
    try {
      const info = cred.credentialsInfo();
      const out = {
        ok: true,
        path: info.path,
        exists: Boolean(info.exists),
        mode: info.mode ?? null,
        bytes: info.bytes ?? 0,
        updatedAt: info.mtime ?? null,
        // 只有存在时才尝试读出来看尾号（DPAPI 模式不需要主密码）
        tencent: { configured: false, secretIdTail: null },
        deepseek: { configured: false, apiKeyTail: null },
      };
      if (info.exists && info.mode === "dpapi") {
        try {
          const s = cred.loadSecrets({});
          if (s?.tencent?.secretId) {
            out.tencent.configured = true;
            out.tencent.secretIdTail = String(s.tencent.secretId).slice(-4);
          }
          if (s?.deepseek?.apiKey) {
            out.deepseek.configured = true;
            out.deepseek.apiKeyTail = String(s.deepseek.apiKey).slice(-4);
          }
        } catch { /* 主密码模式读不了，不算错 */ }
      } else if (info.exists && info.mode === "passphrase") {
        out.locked = true;   // 主密码模式：需要解锁才能看内容
      }
      return out;
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  /**
   * 保存凭据。
   * 只覆盖传进来的服务，**不动其他服务** ——
   * 否则"只改腾讯云"会把已存的 DeepSeek 密钥抹掉。
   */
  ipcMain.handle("settings:credSave", async (_e, { tencent, deepseek, passphrase } = {}) => {
    const cred = await loadCred();
    if (!cred) return { ok: false, error: "找不到凭据模块" };
    try {
      // 先读出已有的（DPAPI 模式无需密码）
      let existing = {};
      const info = cred.credentialsInfo();
      if (info.exists && info.mode === "dpapi") {
        try { existing = cred.loadSecrets({}) ?? {}; } catch { existing = {}; }
      } else if (info.exists && info.mode === "passphrase") {
        if (!passphrase) return { ok: false, error: "现有凭据库用主密码保护，请先输入主密码" };
        try { existing = cred.loadSecrets({ passphrase }) ?? {}; } catch { return { ok: false, error: "主密码不正确" }; }
      }

      const next = { ...existing };
      if (tencent) {
        const id = String(tencent.secretId ?? "").trim();
        const key = String(tencent.secretKey ?? "").trim();
        if (!id || !key) return { ok: false, error: "腾讯云的 SecretId 与 SecretKey 都要填" };
        // 粗略校验形状：腾讯云 SecretId 以 AKID 开头，36 位
        if (!/^AKID[A-Za-z0-9]{28,}$/.test(id)) {
          return { ok: false, error: "SecretId 看起来不对（应以 AKID 开头，共 36 位）" };
        }
        next.tencent = { secretId: id, secretKey: key };
      }
      if (deepseek) {
        const k = String(deepseek.apiKey ?? "").trim();
        if (!k) return { ok: false, error: "DeepSeek 的 API Key 不能为空" };
        next.deepseek = { apiKey: k };
      }

      const r = cred.saveSecrets(next, passphrase ? { passphrase } : {});
      return { ok: true, mode: r.mode, path: r.path };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  /** 删除某个服务的凭据（或全部） */
  ipcMain.handle("settings:credDelete", async (_e, { which } = {}) => {
    const cred = await loadCred();
    if (!cred) return { ok: false, error: "找不到凭据模块" };
    try {
      const info = cred.credentialsInfo();
      if (!info.exists) return { ok: true, removed: "none" };
      if (which === "all") {
        cred.deleteSecrets();
        return { ok: true, removed: "all" };
      }
      if (info.mode !== "dpapi") {
        return { ok: false, error: "主密码模式的凭据库暂不支持单独删除，请清空后重配" };
      }
      const s = cred.loadSecrets({}) ?? {};
      if (which === "tencent") delete s.tencent;
      else if (which === "deepseek") delete s.deepseek;
      else return { ok: false, error: "不知道要删哪个" };
      if (!Object.keys(s).length) {
        cred.deleteSecrets();
        return { ok: true, removed: "all" };
      }
      cred.saveSecrets(s, {});
      return { ok: true, removed: which };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  /** DSH 状态：AI 能不能用，取决于它 */
  ipcMain.handle("settings:dshStatus", async () => {
    try {
      const bridge = await require('./ai.cjs').loadBridge().catch(() => null);
      if (!bridge) return { ok: false, error: "找不到 DSH 桥接模块" };

      const custom = readSettings().dshPath;
      // ⚠️ dsh-bridge 导出的是 healthCheck（不是 dshHealth），
      //    并且它接受 { bin } 直接指定可执行文件；
      //    resolveDshBin() 另外认环境变量 GEZHI_DSH_BIN。
      //    两条路都用上：传 bin 优先，同时设环境变量以便其他调用点也生效。
      if (custom) process.env.GEZHI_DSH_BIN = custom;
      else delete process.env.GEZHI_DSH_BIN;

      const h = await bridge.healthCheck({ ...(custom ? { bin: custom } : {}) });
      return {
        ok: true,
        available: Boolean(h?.ok),
        version: h?.version ?? null,
        bin: h?.bin ?? null,
        error: h?.error ?? null,
        custom,
        // 没装 DSH 是最可能的原因，所以提示要具体到"装什么、怎么登录"
        hint: h?.ok
          ? null
          : custom
            ? "指定的路径跑不起来，请确认它是一个可执行的 DSH 程序。"
            : "格致用 DeepSeek Harness 当 AI 大脑。请先安装并登录 DeepSeek Harness，" +
              "或在下面手动指定它的可执行文件路径。",
      };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });
}

module.exports = { registerSettings };
