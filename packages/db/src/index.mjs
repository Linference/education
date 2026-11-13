// Gezhi · Database layer: open, create tables, search
// Uses only Node's built-in node:sqlite (measured SQLite 3.53.1, with FTS5 and JSON1),
// and pulls in no native modules — avoiding the old problem of prebuilt binaries mismatching after a Node upgrade.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA_PATH = path.resolve(HERE, "..", "schema.sql");

/** Gezhi's application data directory (index and cache live here, deliberately outside the vault). */
export function appDataDir() {
  const base =
    process.env.APPDATA ??
    (process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support")
      : path.join(os.homedir(), ".local", "share"));
  return path.join(base, "gezhi");
}

/** Index database location: %APPDATA%\gezhi\index\<vaultId>\gezhi.db */
export function indexPathFor(vaultId) {
  return path.join(appDataDir(), "index", vaultId, "gezhi.db");
}

/** Cache directory: %APPDATA%\gezhi\cache\<vaultId>\ */
export function cacheDirFor(vaultId) {
  return path.join(appDataDir(), "cache", vaultId);
}

/**
 * Open the database.
 * @param {object} opts
 * @param {string} [opts.vaultId]   Vault id — determines which subdirectory under %APPDATA% is used
 * @param {string} [opts.file]      Specify the db file directly (use ":memory:" in tests)
 */
export function openDatabase({ vaultId = "default", file } = {}) {
  const dbPath = file ?? indexPathFor(vaultId);
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  applyPragmas(db);
  return db;
}

/** These PRAGMAs must be set on every connection (especially foreign_keys, which is off by default). */
export function applyPragmas(db) {
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA busy_timeout = 5000");
}

/** Create tables (idempotent). */
export function migrate(db, { schemaPath = SCHEMA_PATH } = {}) {
  const sql = fs.readFileSync(schemaPath, "utf8");
  // schema.sql also sets the PRAGMAs; executing them again is harmless
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

// ------------------------------------------------------------------ Search

/**
 * Two-path search: trigram is responsible for "finding it", the token index for "ranking it accurately".
 * Keywords are separated by spaces or commas; a term that hits either path counts as recalled.
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
    // trigram: just pass the term straight in (substring match)
    try {
      fold(db.prepare(sqlTri).all(quoteFts(term), limit), "trigram", 1);
    } catch {
      /* the keyword may contain FTS syntax characters; ignore this path */
    }
    // token index: the term must be split into tokens before querying (Chinese is already pre-segmented by text_seg)
    try {
      fold(db.prepare(sqlWord).all(quoteFts(term), limit), "word", 1.5);
    } catch {
      /* same as above */
    }
  }

  return [...hits.values()]
    .map((h) => ({ ...h, via: [...h.via] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Wrap user input as an FTS5 string literal so syntax characters do not break the query. */
export function quoteFts(term) {
  return `"${String(term).replace(/"/g, '""')}"`;
}

/** Insert a chunk (triggers automatically sync both FTS tables). */
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
    /* ignore if already closed */
  }
}
