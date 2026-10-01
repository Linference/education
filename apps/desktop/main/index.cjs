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
const MAX_READ_BYTES = 8 * 1024 * 1024;
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

/** 二进制文件读取上限：PDF/Word 可能很大，放宽到 200MB */
const MAX_BINARY_BYTES = 200 * 1024 * 1024;

const BINARY_EXT = new Set([".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".zip"]);

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
