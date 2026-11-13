// Gezhi desktop · main process
//
// ⚠️ This file is CommonJS, not ESM — this is not laziness, it is a hard limit of Electron:
//   `import { app, BrowserWindow } from "electron"` throws
//   "The requested module 'electron' does not provide an export named 'BrowserWindow'"
//   Electron's built-in modules are CJS and do not provide ESM named-export detection.
//   So the main process and preload use .cjs; the renderer can keep using ESM (it goes through the browser path).
//   Field notes are in docs/06.
//
// The main process only does three things:
//   ① Manage windows and lifecycle
//   ② Provide controlled IPC (the renderer must not touch the filesystem directly)
//   ③ Host things that belong in the main process later (DSH bridge, SQLite, voice, export)
//
// Security constraints: contextIsolation must be on, nodeIntegration must be off.
// Secrets never leave the main process (see docs/04).
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
// Explicit test runs keep Chromium, settings and indices away from real app data.
if (process.env.GEZHI_TEST === "1" && process.env.GEZHI_TEST_APPDATA) {
  const testRoot = path.resolve(process.env.GEZHI_TEST_APPDATA);
  fs.mkdirSync(path.join(testRoot, "userData"), { recursive: true });
  app.setPath("appData", testRoot);
  app.setPath("userData", path.join(testRoot, "userData"));
  process.env.APPDATA = testRoot;
}
const { registerAIStream, registerAI } = require("./ai.cjs");
const { registerExport } = require("./export-ipc.cjs");
const { registerVaultFs } = require("./vault-fs.cjs");
const { registerSearch } = require("./search-ipc.cjs");
const { registerConvert } = require("./convert-ipc.cjs");
const { registerCalendar } = require("./calendar-ipc.cjs");
const { registerAvatar } = require("./avatar-ipc.cjs");
const { registerSettings } = require("./settings-ipc.cjs");
const { registerBank } = require("./bank-ipc.cjs");
const { registerLearning } = require("./learning-ipc.cjs");
const { registerCompanions } = require('./companion-ipc.cjs');
const { registerDshSetup } = require('./dsh-setup-ipc.cjs');
const { registerCompetition } = require('./competition-ipc.cjs');
const { extractDocText, extractPptText } = require("./lib/doc-extract.cjs");
const { parsePptxFile } = require("./lib/pptx.cjs");
const { parseSheetFile } = require("./lib/xlsx.cjs");

const HERE = __dirname;
const ROOT = path.resolve(HERE, "..");

let mainWindow = null;

function createWindow() {
  /**
   * Window size **adapts to the screen** instead of being hard-coded.
   *
   * ★ Why it must be this way:
   *   Originally it was hard-coded width:1440, height:900. On a real 1440×900 screen,
   *   after subtracting the taskbar the work area is only **1440×852** — the window
   *   is 48px taller than the work area, so the bottom gets clipped; the width also
   *   presses against the edge, and the right panel (AI assistant / calendar / digital human) is easily pushed off-screen.
   *
   *   A hard-coded size breaks on any machine with a different resolution,
   *   so we changed it to: prefer the "work area size", then take the smaller of the ideal size.
   */
  const { screen } = require("electron");
  const wa = screen.getPrimaryDisplay().workAreaSize;   // taskbar already subtracted
  const width = Math.min(1440, wa.width);
  const height = Math.min(900, wa.height);

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: Math.min(900, wa.width),
    minHeight: Math.min(600, wa.height),
    // Center it: avoid the window running off-screen (especially on multiple monitors / small screens)
    center: true,
    title: "Gezhi",
    icon: app.isPackaged
      ? path.join(process.resourcesPath, "branding", "icon-256.png")
      : path.resolve(HERE, "..", "..", "..", "brand", "assets", "icon-256.png"),
    backgroundColor: "#ffffff",
    show: false,                    // wait for ready-to-show to avoid a white-screen flash
    webPreferences: {
      preload: path.join(HERE, "preload.cjs"),
      contextIsolation: true,        // ★ required
      nodeIntegration: false,        // ★ required
      sandbox: false,                // preload needs node modules
      spellcheck: false,
    },
  });

  // Log the actual effective size so "UI is clipped" issues are visible at a glance
  console.log(`[Gezhi] window ${width}×${height} (screen work area ${wa.width}×${wa.height})`);

  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Hand external links to the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const devUrl = process.env.GEZHI_DEV_URL;
  if (devUrl) {
    // Dev mode: connect to the Vite dev server (has HMR)
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // Production mode: load the Vite build output
    // Note the output lives in renderer/dist/ — the first version directly loadFile(renderer/index.html),
    // which loaded the source files, so only purely static pages worked; editor / PDF were all broken.
    const built = path.join(ROOT, "renderer", "dist", "index.html");
    const fallback = path.join(ROOT, "renderer", "index.html");
    const target = fs.existsSync(built) ? built : fallback;
    // When GEZHI_TEST=1, append ?test=1 to enable the UI's automation test hooks (see renderer/src/App.tsx)
    const params = new URLSearchParams();
    if (process.env.GEZHI_TEST === '1') params.set('test', '1');
    if (process.env.GEZHI_DEMO_EN === '1') params.set('demo', 'en');
    const query = params.size ? { search: params.toString() } : undefined;
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
// Principle: the renderer never reads the filesystem directly, everything goes through here, and paths must be validated.
// P1 gives read-only capability first (browse vault, read files); write capability is added once the editor lands.

const TEXT_EXT = new Set([
  ".md", ".markdown", ".txt", ".json", ".yaml", ".yml", ".csv",
  ".html", ".css", ".js", ".mjs", ".cjs", ".ts", ".py",
  ".c", ".cpp", ".h", ".java", ".rs", ".go", ".sh", ".ps1", ".sql",
]);
/**
 * Text file read limit.
 *
 * The largest CSV we measured is **42.8 MB** (FIRMS global fire point data); the old 8MB limit would just reject it.
 * Relaxed to 96MB: the CSV view is virtualized, so hundreds of thousands of rows still scroll smoothly,
 * so "large" is not the problem by itself — what really jams is stuffing hundreds of thousands of rows into the DOM, which is solved at the view layer.
 */
const MAX_READ_BYTES = 96 * 1024 * 1024;
const SKIP_DIRS = new Set(["node_modules", ".git", "$RECYCLE.BIN", "System Volume Information", ".cache"]);

function registerIpc() {
  ipcMain.handle("app:info", () => ({
    name: "Gezhi",
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    // ★ Use the system API to get the "Documents" directory, not hard-coded (see plan §4.1)
    documentsDir: app.getPath("documents"),
    cwd: process.cwd(),
    /**
     * Vault path passed on the command line (for trials / development, saves selecting a directory every time).
     *
     * Usage: electron . "D:\some-vault"
     *
     * ⚠️ Argument parsing is trickier than it looks (we hit this on the first try):
     *   With `electron . <dir>`, process.argv is
     *     [electron.exe, ".", "<dir>"]
     *   while with `electron <script> <dir>` it is
     *     [electron.exe, "<script>", "<dir>"]
     *   If we just "take the first existing directory", "." gets resolved first to **the app's own working directory**
     *   (measured: the window opened apps\desktop instead of the passed-in vault).
     *
     *   So the rules are tightened to:
     *     1. Must exist and be a directory
     *     2. Must not be the app's own directory (__dirname or its ancestors)
     *     3. Must **look like a vault** — has a .gezhi directory, or at least is not a source directory
     */
    vaultFromArgv: (() => {
      const appDir = path.resolve(__dirname, "..");          // apps/desktop
      const repoRoot = path.resolve(appDir, "..", "..");     // repo root
      const isAppPath = (p) => {
        const r = path.resolve(p);
        return r === appDir || r === repoRoot || appDir.startsWith(r + path.sep) || r.startsWith(appDir + path.sep);
      };
      const candidates = process.argv.slice(1).filter((a) => {
        if (!a || a.startsWith("-")) return false;
        let st;
        try { st = fs.statSync(a); } catch { return false; }
        if (!st.isDirectory()) return false;
        const abs = path.resolve(a);
        if (isAppPath(abs)) return false;
        // Exclude the app's own entry path
        if (a.endsWith("index.cjs") || a === ".") return false;
        return true;
      });
      return candidates[0] ? path.resolve(candidates[0]) : null;
    })(),
  }));

  ipcMain.handle("vault:pick", async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: "Choose or create a vault directory",
      properties: ["openDirectory", "createDirectory"],
    });
    if (r.canceled || !r.filePaths.length) return null;
    return readVaultInfo(r.filePaths[0]);
  });

  ipcMain.handle("vault:info", (_e, dir) => readVaultInfo(dir));
  ipcMain.handle("vault:list", (_e, dir) => listTree(dir));
  ipcMain.handle("file:read", (_e, filePath) => readTextFile(filePath));
  ipcMain.handle("file:reveal", (_e, p) => { shell.showItemInFolder(p); return true; });

  // Binary reads: PDF / Word / Excel / images go through this.
  // Why the renderer can't read directly: the renderer has no fs (contextIsolation is on),
  // and reading binary via file:// under webSecurity is blocked by CORS.
  // Returns an ArrayBuffer as Uint8Array, which the renderer can feed directly to pdf.js / docx-preview.
  ipcMain.handle("file:readBinary", (_e, filePath) => readBinaryFile(filePath));

  // Legacy .doc: OLE binary format, must be parsed in the main process
  ipcMain.handle("file:readDoc", (_e, filePath) => readDocFile(filePath));

  // Legacy .ppt: also OLE binary, parsed in the main process
  ipcMain.handle("file:readPpt", (_e, filePath) => readPptFile(filePath));

  /**
   * PPTX: **parsed in the main process, only the text is sent back to the renderer**.
   *
   * Why not use file:readBinary:
   *   The largest PPTX we measured is 219 MB. Pushing 219 million bytes through IPC means
   *   structured clone copies one copy and the renderer keeps another in memory — it crashed outright in testing.
   *   The text extracted from a 219 MB courseware is usually only a few hundred KB, three orders of magnitude less transfer.
   */
  /**
   * Read the **raw bytes** of a PPTX for the renderer to draw on canvas with a pure JS library (pptxviewjs).
   *
   * Why not reuse file:readPptx (which returns extracted text):
   *   Canvas rendering needs the raw OOXML bytes, not the extracted text.
   *
   * ⚠️ The size limit is set separately and much smaller than MAX_BINARY_BYTES:
   *   Structured clone has to copy the entire ArrayBuffer, and the renderer keeps another copy in memory.
   *   A measured 219 MB courseware pushed through byte IPC crashes the renderer.
   *   So here we cap at 64 MB — anything larger falls back to "text extraction mode",
   *   and the reason is reported in the return value instead of failing silently.
   */
  const MAX_PPTX_RENDER_BYTES = 64 * 1024 * 1024;
  /**
   * Read a spreadsheet (.xlsx / .xls / .ods).
   *
   * ★ Why not convert to PDF like PPT:
   *   Spreadsheet data needs to be read cell by cell and values compared. Converting to PDF is just a static image,
   *   you can't select or sort it — that's treating a table as an image, which is the wrong direction.
   *
   * ★ Why parse in the main process:
   *   xlsx is zip + XML; the renderer has no fs and no decompression.
   *   After parsing, the main process returns only the **used range** (trailing empty rows and columns removed),
   *   avoiding the structured-clone cost of 130k cells dragging the renderer down.
   */
  ipcMain.handle("file:readSheet", (_e, filePath) => {
    if (typeof filePath !== "string" || !filePath) return { ok: false, error: "Invalid path" };
    try {
      const st = fs.statSync(filePath);
      if (st.isDirectory()) return { ok: false, error: "This is a directory" };
      const r = parseSheetFile(filePath);
      return r;
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("file:readPptxBytes", (_e, filePath) => {
    if (typeof filePath !== "string" || !filePath) return { ok: false, error: "Invalid path" };
    let st;
    try { st = fs.statSync(filePath); } catch (e) { return { ok: false, error: e.message }; }
    if (st.isDirectory()) return { ok: false, error: "This is a directory" };
    if (st.size > MAX_PPTX_RENDER_BYTES) {
      return {
        ok: false,
        tooLarge: true,
        size: st.size,
        limit: MAX_PPTX_RENDER_BYTES,
        error: `File ${(st.size / 1024 / 1024).toFixed(0)} MB exceeds the render limit of ${MAX_PPTX_RENDER_BYTES / 1024 / 1024} MB`,
      };
    }
    try {
      const bytes = fs.readFileSync(filePath);
      return { ok: true, bytes, size: bytes.length, ms: 0 };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("file:readPptx", (_e, filePath) => {
    if (typeof filePath !== "string" || !filePath) return { ok: false, error: "Invalid path" };
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== ".pptx") {
      // Handle renamed .ppt files
      if (ext === ".ppt") return { ok: false, isActuallyPptx: false, error: "This is a .ppt, use the legacy parser" };
      return { ok: false, error: "Only .pptx files are handled" };
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

  // Save as: used by export (the P5 document pipeline will use it)
  ipcMain.handle("file:saveAs", async (_e, { defaultName, data }) => {
    const r = await dialog.showSaveDialog(mainWindow, {
      title: "Save As",
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

  // AI assistant: bring DeepSeek Harness in (this is where "integrating DSH" lands)
  registerAI(ipcMain, () => mainWindow);
  registerAIStream(ipcMain, () => mainWindow);

  // Export: Markdown → PDF / Word / Markdown
  registerExport(ipcMain, () => mainWindow);

  // Vault file operations: create / rename / delete / save
  registerVaultFs(ipcMain);

  // Full-text search and backlinks (SQLite + FTS5, index database stored in %APPDATA%)
  registerSearch(ipcMain, () => mainWindow, app);

  // High-fidelity viewing: use LibreOffice on the system to convert Office docs to PDF (optional enhancement)
  registerConvert(ipcMain, () => mainWindow, app);

  // Calendar / plans / countdowns (SQLite, database stored in %APPDATA%)
  registerCalendar(ipcMain, () => mainWindow, app);

  // Digital human capability detection (voice credentials / lip-sync algorithm / device)
  registerAvatar(ipcMain, () => mainWindow, app);

  // Settings: credential management + app options
  registerSettings(ipcMain, () => mainWindow, app);

  // Question bank and paper assembly (SQLite, database stored in %APPDATA%)
  registerBank(ipcMain, () => mainWindow, app);
  registerLearning(ipcMain, app);
  registerCompanions(ipcMain, app);
  registerDshSetup(ipcMain, app);
  registerCompetition(ipcMain, app);
}

/** Read vault info: recognizes .gezhi/vault.json; non-Gezhi vaults are still allowed to be browsed as plain folders */
function readVaultInfo(dir) {
  if (typeof dir !== "string" || !dir) return { ok: false, error: "Invalid path" };
  let st;
  try {
    st = fs.statSync(dir);
  } catch (e) {
    return { ok: false, error: `Directory does not exist: ${e.message}` };
  }
  if (!st.isDirectory()) return { ok: false, error: "Not a directory" };

  const configPath = path.join(dir, ".gezhi", "vault.json");
  let vault = null;
  try {
    vault = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    /* Not a Gezhi vault, treat as a plain folder */
  }
  return { ok: true, path: dir, name: path.basename(dir), isVault: Boolean(vault), vault, configPath };
}

/** List one directory level (lazy loading). Sorting: directories first, Chinese text via localeCompare */
function listTree(dir) {
  if (typeof dir !== "string" || !dir) return { ok: false, error: "Invalid path", entries: [] };
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
    } catch { /* ignore this entry on permission errors, etc. */ }
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

/** Read a text file (type and size limited) */
function readTextFile(filePath) {
  if (typeof filePath !== "string" || !filePath) return { ok: false, error: "Invalid path" };
  const ext = path.extname(filePath).toLowerCase();
  if (!TEXT_EXT.has(ext)) {
    return { ok: false, error: `Preview for ${ext || "(no extension)"} files is not supported yet`, unsupported: true };
  }
  let st;
  try {
    st = fs.statSync(filePath);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  if (st.size > MAX_READ_BYTES) {
    return { ok: false, error: `File ${(st.size / 1024 / 1024).toFixed(1)}MB is too large (limit 8MB)` };
  }
  try {
    return { ok: true, path: filePath, text: fs.readFileSync(filePath, "utf8"), size: st.size, mtime: st.mtime.toISOString() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Binary file read limit.
 *  The largest PPTX we measured is 219 MB (a machine-learning courseware), so the limit must be above it —
 *  the old 200MB limit would just reject it and the user would see "file too large". */
const MAX_BINARY_BYTES = 400 * 1024 * 1024;

const BINARY_EXT = new Set([".pdf", ".docx", ".xlsx", ".pptx", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".zip"]);

/** Read a binary file, returns Uint8Array (structured clone can pass Uint8Array directly) */
function readBinaryFile(filePath) {
  if (typeof filePath !== "string" || !filePath) return { ok: false, error: "Invalid path" };
  const ext = path.extname(filePath).toLowerCase();
  if (!BINARY_EXT.has(ext)) {
    return { ok: false, error: `Unsupported binary type: ${ext || "(no extension)"}`, unsupported: true };
  }
  let st;
  try {
    st = fs.statSync(filePath);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  if (st.size > MAX_BINARY_BYTES) {
    return { ok: false, error: `File ${(st.size / 1024 / 1024).toFixed(0)}MB is too large` };
  }
  try {
    const buf = fs.readFileSync(filePath);
    // Convert to Uint8Array rather than Node Buffer: after crossing IPC, Buffer becomes a plain object
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
 * Read legacy .doc (Word 97-2003 binary format).
 *
 * docx is zip+XML, which the renderer can handle directly;
 * but .doc is an OLE compound document, so it **must be parsed in the main process** (the renderer has no fs,
 * and the parsing logic operates on Buffers on the Node side).
 * The parser lives in lib/doc-extract.cjs (implemented ourselves, with OLE container + piece table + encoding detection).
 */
function readDocFile(filePath) {
  if (typeof filePath !== "string" || !filePath) return { ok: false, error: "Invalid path" };
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".doc") return { ok: false, error: "Only .doc files are handled" };

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
    // Special case: the file is actually a renamed docx — tell the UI to go through the docx path
    if (r.error === "__IS_DOCX__") {
      return { ok: false, isActuallyDocx: true, error: r.hint ?? "This is actually a .docx file" };
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
    // .doc layout cannot be faithfully reproduced; the UI must tell the user (it can't pretend to be identical to docx)
    lossy: true,
  };
}

/**
 * Read legacy .ppt (PowerPoint 97-2003 binary format).
 * Same reasoning as .doc: OLE compound document, must be parsed in the main process.
 */
function readPptFile(filePath) {
  if (typeof filePath !== "string" || !filePath) return { ok: false, error: "Invalid path" };
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".ppt") return { ok: false, error: "Only .ppt files are handled" };

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
      return { ok: false, isActuallyPptx: true, error: r.hint ?? "This is actually a .pptx file" };
    }
    return { ok: false, error: r.error };
  }

  // .ppt has no reliable "per page" boundary (page-number info lives in a separate structure),
  // so we split on blank lines into blocks as "approximate pages", and state clearly that these are not exact page numbers.
  const blocks = r.text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  const slides = blocks.map((b, i) => {
    const lines = b.split("\n").map((s) => s.trim()).filter(Boolean);
    return { index: i + 1, title: lines[0] ?? `(paragraph ${i + 1})`, lines };
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
