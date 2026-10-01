// 格致 · 检索与反向链接的 IPC
//
// 索引库位置：%APPDATA%\gezhi\index.db
//   **不放库目录内** —— 理由同 P0 的存储决策：库可能在 OneDrive 下，
//   WAL/Shm 文件会引发同步冲突甚至数据库损坏。
//
// 索引时机：
//   1. 打开库时后台建一次索引（增量：只处理 mtime/size 变了的文件）
//   2. 保存文件后重新索引那一个文件（保持检索即时可用）
//   3. 让用户能手动点"重建索引"
const path = require("node:path");
const fs = require("node:fs");
const idx = require("./indexer.cjs");

let db = null;
let currentVault = null;
/** 正在索引时置位，避免并发触发 */
let indexing = null;

function indexDbPath(app) {
  const base = app.getPath("userData");   // %APPDATA%\gezhi
  return path.join(base, "index.db");
}

function registerSearch(ipcMain, getWindow, app) {
  const dbPath = indexDbPath(app);

  const open = () => {
    if (db) return db;
    db = idx.openIndex(dbPath);
    return db;
  };

  /** 后台索引（不阻塞 IPC 返回；完成后通知界面刷新） */
  const runIndex = (vault, { incremental = true, notify = true } = {}) => {
    if (indexing) return indexing;
    indexing = (async () => {
      try {
        const database = open();
        const r = idx.indexVault({
          db: database,
          vault,
          incremental,
          onProgress: (p) => {
            const win = getWindow();
            if (notify && win && !win.isDestroyed() && p.done % 20 === 0) {
              win.webContents.send("search:progress", p);
            }
          },
        });
        const win = getWindow();
        if (notify && win && !win.isDestroyed()) {
          win.webContents.send("search:indexed", { vault, ...r });
        }
        return r;
      } catch (e) {
        const win = getWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send("search:error", { vault, error: e.message });
        }
        return { ok: false, error: e.message };
      } finally {
        indexing = null;
      }
    })();
    return indexing;
  };

  // ---- 打开库时开始索引 ----
  ipcMain.handle("search:open", async (_e, vault) => {
    currentVault = vault;
    try {
      const database = open();
      // 先返回当前统计（界面能不能立刻用是另一回事），索引在后台跑
      const stats = idx.indexStats(database, { vault });
      runIndex(vault, { incremental: true });
      return { ok: true, stats, dbPath };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  /** 手动重建（全量） */
  ipcMain.handle("search:reindex", async (_e, vault) => {
    currentVault = vault ?? currentVault;
    if (!currentVault) return { ok: false, error: "还没有打开库" };
    const r = await runIndex(currentVault, { incremental: false });
    return r;
  });

  /** 等索引完成（测试与"保存后立刻检索"要用） */
  ipcMain.handle("search:waitIdle", async () => {
    if (indexing) await indexing;
    return { ok: true };
  });

  /** 单个文件重新索引（保存后调） */
  ipcMain.handle("search:reindexFile", async (_e, { vault, filePath }) => {
    try {
      const database = open();
      // 复用整库增量逻辑最简单也最安全：它会发现只有这一个文件变了
      const r = idx.indexVault({ db: database, vault, incremental: true });
      return { ok: true, ...r, filePath };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  /** 全文检索 */
  ipcMain.handle("search:query", async (_e, { vault, query, limit }) => {
    try {
      const database = open();
      return idx.search(database, { vault: vault ?? currentVault, query, limit });
    } catch (e) {
      return { ok: false, error: e.message, hits: [] };
    }
  });

  /** 反向链接 */
  ipcMain.handle("search:backlinks", async (_e, { vault, path: filePath }) => {
    try {
      const database = open();
      return idx.backlinks(database, { vault: vault ?? currentVault, path: filePath });
    } catch (e) {
      return { ok: false, error: e.message, files: [], total: 0 };
    }
  });

  /** 出链 */
  ipcMain.handle("search:outlinks", async (_e, { vault, path: filePath }) => {
    try {
      const database = open();
      return idx.outlinks(database, { vault: vault ?? currentVault, path: filePath });
    } catch (e) {
      return { ok: false, error: e.message, links: [] };
    }
  });

  /** 统计 */
  ipcMain.handle("search:stats", async (_e, vault) => {
    try {
      const database = open();
      return idx.indexStats(database, { vault: vault ?? currentVault });
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  /** 索引库文件大小（体积面板用） */
  ipcMain.handle("search:dbInfo", async () => {
    try {
      const st = fs.existsSync(dbPath) ? fs.statSync(dbPath) : null;
      return { ok: true, path: dbPath, size: st?.size ?? 0, exists: Boolean(st) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

module.exports = { registerSearch, indexDbPath };
