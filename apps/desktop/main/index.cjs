// 格致桌面端 · 主进程
//
// ⚠️ 这个文件是 CommonJS，不是 ESM —— 这不是偷懒，是 Electron 的硬限制：
//   `import { app, BrowserWindow } from "electron"` 会报
//   "The requested module 'electron' does not provide an export named 'BrowserWindow'"
//   Electron 的内置模块是 CJS，不提供 ESM 具名导出探测。
//   所以主进程与 preload 用 .cjs；渲染进程照常可以用 ESM（它走的是浏览器那套）。
//   实测记录见 docs/06。
//
// 主进程只做三件事：
//   ① 管窗口与生命周期
//   ② 提供受控的 IPC（渲染进程不能直接碰文件系统）
//   ③ 承载将来要放主进程的东西（DSH 桥、SQLite、语音、导出）
//
// 安全约束：contextIsolation 必须开、nodeIntegration 必须关。
// 密钥不出主进程（见 docs/04）。
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { registerAIStream, registerAI } = require("./ai.cjs");
const { registerExport } = require("./export-ipc.cjs");
const { registerVaultFs } = require("./vault-fs.cjs");
const { extractDocText, extractPptText } = require("./lib/doc-extract.cjs");
const { parsePptxFile } = require("./lib/pptx.cjs");

const HERE = __dirname;
const ROOT = path.resolve(HERE, "..");

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "格致",
    backgroundColor: "#ffffff",
    show: false,                    // 等 ready-to-show，避免白屏闪烁
    webPreferences: {
      preload: path.join(HERE, "preload.cjs"),
      contextIsolation: true,        // ★ 必须
      nodeIntegration: false,        // ★ 必须
      sandbox: false,                // preload 要用 node 模块
      spellcheck: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  // 外部链接交给系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const devUrl = process.env.GEZHI_DEV_URL;
  if (devUrl) {
    // 开发模式：连 Vite dev server（有 HMR）
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // 生产模式：加载 Vite 构建产物
    // 注意产物在 renderer/dist/ —— 第一版直接 loadFile(renderer/index.html)
    // 加载的是源文件，所以只有纯静态页能跑，编辑器/PDF 全都上不了。
    const built = path.join(ROOT, "renderer", "dist", "index.html");
    const fallback = path.join(ROOT, "renderer", "index.html");
    const target = fs.existsSync(built) ? built : fallback;
    // GEZHI_TEST=1 时带 ?test=1，启用界面里的自动化测试钩子（详见 renderer/src/App.tsx）
    const query = process.env.GEZHI_TEST === "1" ? { search: "test=1" } : undefined;
    mainWindow.loadFile(target, query);
  }

  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ------------------------------------------------------------------ IPC
//
// 原则：渲染进程永远不直接读文件系统，一切经由这里，且路径必须校验。
// P1 先给只读能力（浏览库、读文件），写入能力等编辑器落地再加。

const TEXT_EXT = new Set([
  ".md", ".markdown", ".txt", ".json", ".yaml", ".yml", ".csv",
  ".html", ".css", ".js", ".mjs", ".cjs", ".ts", ".py",
  ".c", ".cpp", ".h", ".java", ".rs", ".go", ".sh", ".ps1", ".sql",
]);
/**
 * 文本文件读取上限。
 *
 * 实测用户最大的 CSV 是 **42.8 MB**（FIRMS 全球火点数据），原来设 8MB 会直接拒掉。
 * 放宽到 96MB：CSV 视图是虚拟滚动的，几十万行也能流畅显示，
 * 所以"大"本身不是问题 —— 真正会卡的是把几十万行全塞进 DOM，那在视图层解决。
 */
const MAX_READ_BYTES = 96 * 1024 * 1024;
const SKIP_DIRS = new Set(["node_modules", ".git", "$RECYCLE.BIN", "System Volume Information", ".cache"]);

function registerIpc() {
  ipcMain.handle("app:info", () => ({
    name: "格致",
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    // ★ 用系统 API 取「文档」目录，不硬编码（见计划 §4.1）
    documentsDir: app.getPath("documents"),
    cwd: process.cwd(),
  }));

  ipcMain.handle("vault:pick", async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: "选择或新建一个库目录",
      properties: ["openDirectory", "createDirectory"],
    });
    if (r.canceled || !r.filePaths.length) return null;
    return readVaultInfo(r.filePaths[0]);
  });

  ipcMain.handle("vault:info", (_e, dir) => readVaultInfo(dir));
  ipcMain.handle("vault:list", (_e, dir) => listTree(dir));
  ipcMain.handle("file:read", (_e, filePath) => readTextFile(filePath));
  ipcMain.handle("file:reveal", (_e, p) => { shell.showItemInFolder(p); return true; });

  // 二进制读取：PDF / Word / Excel / 图片走这条。
  // 为什么不让渲染进程直接读：渲染进程没有 fs（contextIsolation 已开），
  // 而且 file:// 在 webSecurity 下取二进制会被 CORS 拦。
  // 返回 ArrayBuffer 的 Uint8Array 形式，渲染进程可直接喂给 pdf.js / docx-preview。
  ipcMain.handle("file:readBinary", (_e, filePath) => readBinaryFile(filePath));

  // 旧版 .doc：OLE 二进制格式，必须在主进程解析
  ipcMain.handle("file:readDoc", (_e, filePath) => readDocFile(filePath));

  // 旧版 .ppt：同样是 OLE 二进制，主进程解析
  ipcMain.handle("file:readPpt", (_e, filePath) => readPptFile(filePath));

  /**
   * PPTX：**在主进程解析，只把文字传回渲染进程**。
   *
   * 为什么不走 file:readBinary：
   *   实测用户最大的 PPTX 是 219 MB。把 2.19 亿字节通过 IPC 传过去，
   *   结构化克隆要复制一份、渲染进程还要驻留一份 —— 测试里直接崩了。
   *   而 219 MB 的课件提取出的文字通常只有几百 KB，传输量降三个数量级。
   */
  ipcMain.handle("file:readPptx", (_e, filePath) => {
    if (typeof filePath !== "string" || !filePath) return { ok: false, error: "路径无效" };
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== ".pptx") {
      // 兼容 .ppt 改名的情况
      if (ext === ".ppt") return { ok: false, isActuallyPptx: false, error: "这是 .ppt，请用旧版解析" };
      return { ok: false, error: "只处理 .pptx 文件" };
    }
    let st;
    try { st = fs.statSync(filePath); } catch (e) { return { ok: false, error: e.message }; }
    const r = parsePptxFile(filePath);
    if (!r.ok) return { ok: false, error: r.error, ms: r.ms };
    return {
      ok: true,
      path: filePath,
      slides: r.slides,
      slideCount: r.slideCount,
      hasNotes: r.hasNotes,
      ms: r.ms,
      size: st.size,
      mtime: st.mtime.toISOString(),
      lossy: true,
    };
  });

  // 另存为：导出功能用（P5 文档产线会用到）
  ipcMain.handle("file:saveAs", async (_e, { defaultName, data }) => {
    const r = await dialog.showSaveDialog(mainWindow, {
      title: "另存为",
      defaultPath: defaultName,
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    try {
      fs.writeFileSync(r.filePath, Buffer.from(data));
      return { ok: true, path: r.filePath };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // AI 助手：把 DeepSeek Harness 接进来（这是"融合 DSH"落地的地方）
  registerAI(ipcMain, () => mainWindow);
  registerAIStream(ipcMain, () => mainWindow);

  // 导出：Markdown → PDF / Word / Markdown
  registerExport(ipcMain, () => mainWindow);

  // 库内文件操作：新建 / 重命名 / 删除 / 保存
  registerVaultFs(ipcMain);
}

/** 读库信息：认识 .gezhi/vault.json；不是格致库也允许当普通文件夹浏览 */
function readVaultInfo(dir) {
  if (typeof dir !== "string" || !dir) return { ok: false, error: "路径无效" };
  let st;
  try {
    st = fs.statSync(dir);
  } catch (e) {
    return { ok: false, error: `目录不存在：${e.message}` };
  }
  if (!st.isDirectory()) return { ok: false, error: "不是目录" };

  const configPath = path.join(dir, ".gezhi", "vault.json");
  let vault = null;
  try {
    vault = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    /* 不是格致库，当普通文件夹 */
  }
  return { ok: true, path: dir, name: path.basename(dir), isVault: Boolean(vault), vault, configPath };
}

/** 列一层目录（懒加载）。排序：目录在前，中文按 localeCompare */
function listTree(dir) {
  if (typeof dir !== "string" || !dir) return { ok: false, error: "路径无效", entries: [] };
  let names;
  try {
    names = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return { ok: false, error: e.message, entries: [] };
  }
  const entries = [];
  for (const d of names) {
    if (d.name.startsWith(".") && d.name !== ".gezhi") continue;
    if (d.isDirectory() && SKIP_DIRS.has(d.name)) continue;
    const full = path.join(dir, d.name);
    let size = 0;
    let mtime = null;
    try {
      const st = fs.statSync(full);
      size = st.size;
      mtime = st.mtime.toISOString();
    } catch { /* 权限等问题忽略这一项 */ }
    entries.push({
      name: d.name,
      path: full,
      isDir: d.isDirectory(),
      ext: d.isDirectory() ? "" : path.extname(d.name).toLowerCase(),
      size,
      mtime,
    });
  }
  entries.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, "zh") : a.isDir ? -1 : 1));
  return { ok: true, dir, entries };
}

/** 读文本文件（限类型与大小） */
function readTextFile(filePath) {
  if (typeof filePath !== "string" || !filePath) return { ok: false, error: "路径无效" };
  const ext = path.extname(filePath).toLowerCase();
  if (!TEXT_EXT.has(ext)) {
    return { ok: false, error: `暂不支持预览 ${ext || "(无扩展名)"} 文件`, unsupported: true };
  }
  let st;
  try {
    st = fs.statSync(filePath);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  if (st.size > MAX_READ_BYTES) {
    return { ok: false, error: `文件 ${(st.size / 1024 / 1024).toFixed(1)}MB 过大（上限 8MB）` };
  }
  try {
    return { ok: true, path: filePath, text: fs.readFileSync(filePath, "utf8"), size: st.size, mtime: st.mtime.toISOString() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** 二进制文件读取上限。
 *  实测用户最大的 PPTX 是 219 MB（机器学习课件），所以上限要高于它 ——
 *  原来设 200MB 会直接拒掉，用户看到的是"文件过大"。 */
const MAX_BINARY_BYTES = 400 * 1024 * 1024;

const BINARY_EXT = new Set([".pdf", ".docx", ".xlsx", ".pptx", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".zip"]);

/** 读二进制文件，返回 Uint8Array（结构化克隆可直接传 Uint8Array） */
function readBinaryFile(filePath) {
  if (typeof filePath !== "string" || !filePath) return { ok: false, error: "路径无效" };
  const ext = path.extname(filePath).toLowerCase();
  if (!BINARY_EXT.has(ext)) {
    return { ok: false, error: `不是支持的二进制类型：${ext || "(无扩展名)"}`, unsupported: true };
  }
  let st;
  try {
    st = fs.statSync(filePath);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  if (st.size > MAX_BINARY_BYTES) {
    return { ok: false, error: `文件 ${(st.size / 1024 / 1024).toFixed(0)}MB 过大` };
  }
  try {
    const buf = fs.readFileSync(filePath);
    // 转成 Uint8Array 而不是 Node Buffer：跨 IPC 后 Buffer 会变成普通对象
    return {
      ok: true,
      path: filePath,
      bytes: new Uint8Array(buf),
      size: st.size,
      mtime: st.mtime.toISOString(),
      ext,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * 读旧版 .doc（Word 97-2003 二进制格式）。
 *
 * docx 是 zip+XML，渲染进程能直接处理；
 * 但 .doc 是 OLE 复合文档，**必须在主进程解析**（渲染进程没有 fs，
 * 而且解析逻辑是 Node 侧的 Buffer 操作）。
 * 解析器见 lib/doc-extract.cjs（自己实现，含 OLE 容器 + 分片表 + 编码判定）。
 */
function readDocFile(filePath) {
  if (typeof filePath !== "string" || !filePath) return { ok: false, error: "路径无效" };
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".doc") return { ok: false, error: "只处理 .doc 文件" };

  let st;
  try {
    st = fs.statSync(filePath);
  } catch (e) {
    return { ok: false, error: e.message };
  }

  const t0 = Date.now();
  let r;
  try {
    r = extractDocText(filePath);
  } catch (e) {
    return { ok: false, error: e.message };
  }

  if (!r.ok) {
    // 特例：文件其实是 docx 改名 —— 告诉界面改走 docx 路径
    if (r.error === "__IS_DOCX__") {
      return { ok: false, isActuallyDocx: true, error: r.hint ?? "这其实是 .docx 文件" };
    }
    return { ok: false, error: r.error };
  }

  return {
    ok: true,
    path: filePath,
    text: r.text,
    method: r.method,
    size: st.size,
    mtime: st.mtime.toISOString(),
    ms: Date.now() - t0,
    // .doc 的版式无法还原，界面要如实告知（不能假装和 docx 一样）
    lossy: true,
  };
}

/**
 * 读旧版 .ppt（PowerPoint 97-2003 二进制格式）。
 * 与 .doc 同理：OLE 复合文档，必须在主进程解析。
 */
function readPptFile(filePath) {
  if (typeof filePath !== "string" || !filePath) return { ok: false, error: "路径无效" };
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".ppt") return { ok: false, error: "只处理 .ppt 文件" };

  let st;
  try {
    st = fs.statSync(filePath);
  } catch (e) {
    return { ok: false, error: e.message };
  }

  const t0 = Date.now();
  let r;
  try {
    r = extractPptText(filePath);
  } catch (e) {
    return { ok: false, error: e.message };
  }

  if (!r.ok) {
    if (r.error === "__IS_PPTX__") {
      return { ok: false, isActuallyPptx: true, error: r.hint ?? "这其实是 .pptx 文件" };
    }
    return { ok: false, error: r.error };
  }

  // .ppt 没有可靠的"每页"边界（页码信息在另一套结构里），
  // 所以按空行切块当作"近似页"，并如实说明这不是精确页码。
  const blocks = r.text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  const slides = blocks.map((b, i) => {
    const lines = b.split("\n").map((s) => s.trim()).filter(Boolean);
    return { index: i + 1, title: lines[0] ?? `（第 ${i + 1} 段）`, lines };
  });

  return {
    ok: true,
    path: filePath,
    text: r.text,
    slides,
    slideCount: slides.length,
    method: r.method,
    size: st.size,
    mtime: st.mtime.toISOString(),
    ms: Date.now() - t0,
    lossy: true,
    approximatePages: true,
  };
}
