// 格致 · 数据库层：开库、建表、检索
// 只用 Node 内置的 node:sqlite（实测 SQLite 3.53.1，含 FTS5 与 JSON1），
// 不引入原生模块 —— 避开 Node 升级后预编译二进制失配的老问题。
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA_PATH = path.resolve(HERE, "..", "schema.sql");

/** 格致的应用数据目录（索引与缓存放这里，刻意放在库之外）。 */
export function appDataDir() {
  const base =
    process.env.APPDATA ??
    (process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support")
      : path.join(os.homedir(), ".local", "share"));
  return path.join(base, "gezhi");
}

/** 索引库位置：%APPDATA%\gezhi\index\<vaultId>\gezhi.db */
export function indexPathFor(vaultId) {
  return path.join(appDataDir(), "index", vaultId, "gezhi.db");
}

/** 缓存目录：%APPDATA%\gezhi\cache\<vaultId>\ */
export function cacheDirFor(vaultId) {
  return path.join(appDataDir(), "cache", vaultId);
}

/**
 * 打开数据库。
 * @param {object} opts
 * @param {string} [opts.vaultId]   库 id —— 决定放在 %APPDATA% 的哪个子目录
 * @param {string} [opts.file]      直接指定 db 文件（测试时用 ":memory:"）
 */
export function openDatabase({ vaultId = "default", file } = {}) {
  const dbPath = file ?? indexPathFor(vaultId);
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  applyPragmas(db);
  return db;
}

/** 每个连接都必须设这三个 PRAGMA（尤其是 foreign_keys，默认是关的）。 */
export function applyPragmas(db) {
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA busy_timeout = 5000");
}

/** 建表（幂等）。 */
export function migrate(db, { schemaPath = SCHEMA_PATH } = {}) {
  const sql = fs.readFileSync(schemaPath, "utf8");
  // schema.sql 里也写了 PRAGMA，重复执行无害
  db.exec(sql);
  return schemaInfo(db);
}

export function schemaInfo(db) {
  const tables = db
    .prepare(
      "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all();
  const fts = tables.filter((t) => t.name.includes("_fts_")).map((t) => t.name);
  const version = db.prepare("SELECT sqlite_version() AS v").get().v;
  const schemaVersion = db
    .prepare("SELECT value FROM schema_meta WHERE key='schema_version'")
    .get()?.value;
  return {
    sqlite: version,
    schemaVersion,
    tableCount: tables.length,
    tables: tables.map((t) => t.name),
    ftsTables: fts,
  };
}

// ------------------------------------------------------------------ 检索

/**
 * 双路检索：trigram 负责"找得到"，分词索引负责"排得准"。
 * 关键词用空格或逗号分隔；每个词在任一路命中即算召回。
 */
export function searchChunks(db, query, { limit = 20 } = {}) {
  const terms = query
    .split(/[\s,，]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (terms.length === 0) return [];

  const hits = new Map(); // chunkId -> { id, text, page_from, page_to, score, via }

  const fold = (rows, via, weight) => {
    for (const r of rows) {
      const cur = hits.get(r.id) ?? { ...r, score: 0, via: new Set() };
      cur.score += weight;
      cur.via.add(via);
      hits.set(r.id, cur);
    }
  };

  const sqlTri = `
    SELECT c.id, c.text, c.page_from, c.page_to, bm25(chunks_fts_trigram) AS rank
    FROM chunks_fts_trigram f JOIN chunks c ON c.id = f.rowid
    WHERE chunks_fts_trigram MATCH ? ORDER BY rank LIMIT ?`;

  const sqlWord = `
    SELECT c.id, c.text, c.page_from, c.page_to, bm25(chunks_fts_word) AS rank
    FROM chunks_fts_word f JOIN chunks c ON c.id = f.rowid
    WHERE chunks_fts_word MATCH ? ORDER BY rank LIMIT ?`;

  for (const term of terms) {
    // trigram：直接把词丢进去即可（子串匹配）
    try {
      fold(db.prepare(sqlTri).all(quoteFts(term), limit), "trigram", 1);
    } catch {
      /* 关键词里可能含有 FTS 语法字符，忽略这一路 */
    }
    // 分词索引：需要把词切成 token 再查（中文已由 text_seg 预分词）
    try {
      fold(db.prepare(sqlWord).all(quoteFts(term), limit), "word", 1.5);
    } catch {
      /* 同上 */
    }
  }

  return [...hits.values()]
    .map((h) => ({ ...h, via: [...h.via] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** 把用户输入包成 FTS5 字符串字面量，避免语法字符把查询搞崩。 */
export function quoteFts(term) {
  return `"${String(term).replace(/"/g, '""')}"`;
}

/** 插入一个 chunk（触发器会自动同步两张 FTS 表）。 */
export function insertChunk(db, { bookId, chapterId = null, pageFrom, pageTo, text, textSeg = null, kpIds = [] }) {
  const info = db
    .prepare(
      `INSERT INTO chunks (book_id, chapter_id, page_from, page_to, text, text_seg, tokens, kp_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(bookId, chapterId, pageFrom, pageTo, text, textSeg, text.length, JSON.stringify(kpIds));
  return Number(info.lastInsertRowid);
}

export function closeDatabase(db) {
  try {
    db.close();
  } catch {
    /* 已关就忽略 */
  }
}
