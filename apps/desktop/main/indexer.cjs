// 格致 · 索引器（全文检索 + 反向链接）
//
// 两件事：
//   1. **全文检索**：把库里的文本文件切块写入 SQLite 的 FTS5 表
//   2. **反向链接**：解析 `[[wikilink]]`，建出 "哪篇笔记引用了哪篇" 的关系
//
// ★ 检索策略（实测定下来的，见 verify-search-strategy.cjs）：
//   SQLite 的 trigram 分词器**只索引 ≥3 字符的片段**，所以
//   查「电场」「情态」这类**双字中文词**会静默命中 0 条 —— 不报错、不警告。
//   而 jieba 预分词词表也不可靠（「情态」被切成「情态动词」一个词，查「情态」匹配不上）。
//   → 对策：**≥3 字走 FTS 索引，≤2 字走 LIKE 扫描**。
//     实测 2 万行 LIKE 只要 2ms，这个规模下"查得到"比"查得快"重要。
//
// ★ 数据库位置：放 %APPDATA%\gezhi\index.db 而不是库目录内。
//   理由同 P0 的存储决策：库目录可能在 OneDrive 下，WAL 文件会引发同步冲突。
const fs = require("node:fs");
const path = require("node:path");

/** 可索引的文本类扩展名 */
const INDEXABLE = new Set([
  ".md", ".markdown", ".txt", ".log", ".rtf",
  ".csv", ".tsv", ".json", ".yaml", ".yml", ".toml", ".ini",
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".c", ".cpp", ".h",
  ".java", ".rs", ".go", ".rb", ".php", ".sh", ".ps1", ".sql", ".html", ".css",
]);

/** 单文件最大索引体积（超过就跳过，避免把几 MB 的 CSV 全塞进索引） */
const MAX_INDEX_BYTES = 2 * 1024 * 1024;
/** 每块的目标字符数 */
const CHUNK_SIZE = 900;
/** 块之间重叠多少字符（避免关键词正好落在切缝上） */
const CHUNK_OVERLAP = 120;

let DatabaseSync = null;
function getSqlite() {
  if (DatabaseSync) return DatabaseSync;
  try {
    DatabaseSync = require("node:sqlite").DatabaseSync;
  } catch (e) {
    throw new Error("这个运行环境不支持 node:sqlite：" + e.message);
  }
  return DatabaseSync;
}

/** 打开（并初始化）索引库 */
function openIndex(dbPath) {
  const DB = getSqlite();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DB(dbPath);
  // WAL：读写并发更稳（Electron 主进程可能同时被索引与查询访问）
  db.exec("pragma journal_mode = wal");
  db.exec("pragma synchronous = normal");
  db.exec(`
    create table if not exists docs(
      id        integer primary key autoincrement,
      vault     text not null,
      path      text not null,
      name      text not null,
      ext       text,
      mtime     text,
      size      integer,
      indexed_at text,
      unique(vault, path)
    );

    create table if not exists chunks(
      id     integer primary key autoincrement,
      doc_id integer not null references docs(id) on delete cascade,
      ord    integer not null,
      text   text not null
    );

    -- 全文索引：trigram 是中文能用的关键（unicode61 查中文恒为 0 条）
    create virtual table if not exists chunks_fts using fts5(
      text,
      content='chunks',
      content_rowid='id',
      tokenize='trigram'
    );

    -- 反向链接：source 引用 target
    create table if not exists links(
      id       integer primary key autoincrement,
      vault    text not null,
      source   text not null,
      target   text not null,
      label    text,
      line     integer,
      unique(vault, source, target, line)
    );

    create index if not exists idx_docs_path on docs(vault, path);
    create index if not exists idx_chunks_doc on chunks(doc_id);
    create index if not exists idx_links_target on links(vault, target);
    create index if not exists idx_links_source on links(vault, source);
  `);
  return db;
}

/** 按段落边界切块（比定长切更自然，关键词不容易被切断） */
function chunkText(text) {
  const out = [];
  const paras = text.split(/\n{2,}/);
  let buf = "";
  for (const p of paras) {
    if (buf.length + p.length + 2 <= CHUNK_SIZE) {
      buf = buf ? buf + "\n\n" + p : p;
    } else {
      if (buf) out.push(buf);
      if (p.length <= CHUNK_SIZE) {
        buf = p;
      } else {
        // 单段就超长 → 硬切，并保留重叠
        for (let i = 0; i < p.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
          out.push(p.slice(i, i + CHUNK_SIZE));
        }
        buf = "";
      }
    }
  }
  if (buf) out.push(buf);
  return out.filter((s) => s.trim().length > 0);
}

/**
 * 从 Markdown 里抽出 wikilink。
 *
 * 支持 `[[目标]]`、`[[目标|别名]]`、`[[目标#标题]]`。
 * 同时跳过代码块与行内代码里的内容 —— 那里出现的 `[[x]]` 是示例，不是链接
 * （实测：笔记里写"用 [[双括号]] 表示链接"这种说明文字很常见）。
 */
function extractLinks(text) {
  const links = [];
  const lines = text.split("\n");
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;

    // 去掉行内代码，避免把示例当链接
    const clean = line.replace(/`[^`]*`/g, (m) => " ".repeat(m.length));

    const re = /\[\[([^\]\n]+?)\]\]/g;
    let m;
    while ((m = re.exec(clean)) !== null) {
      const [targetRaw, aliasRaw] = m[1].split("|");
      const target = (targetRaw ?? "").split("#")[0].trim();
      if (!target) continue;
      links.push({ target, label: (aliasRaw ?? "").trim() || target, line: i + 1 });
    }
  }
  return links;
}

/**
 * 索引一个目录（递归）。
 *
 * @param {object} opts
 * @param {DatabaseSync} opts.db
 * @param {string} opts.vault  库根路径（作为 vault 标识）
 * @param {number} opts.maxFiles  最多索引多少文件（防止超大库第一次索引卡住）
 * @param {(p:{done:number,total:number,name:string})=>void} [opts.onProgress]
 */
function indexVault({ db, vault, maxFiles = 3000, onProgress, incremental = true }) {
  const t0 = Date.now();
  const files = [];

  // ---- 1. 收集文件 ----
  const walk = (dir, depth) => {
    if (depth > 8 || files.length >= maxFiles) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (files.length >= maxFiles) return;
      if (e.name === ".git" || e.name === "node_modules" || e.name === ".gezhi") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p, depth + 1); continue; }
      const ext = path.extname(e.name).toLowerCase();
      if (!INDEXABLE.has(ext)) continue;
      if (/\.bak$/i.test(e.name)) continue;
      let st;
      try { st = fs.statSync(p); } catch { continue; }
      if (st.size > MAX_INDEX_BYTES) continue;
      files.push({ path: p, name: e.name, ext, size: st.size, mtime: st.mtime.toISOString() });
    }
  };
  walk(vault, 0);

  // ---- 2. 增量：找出需要重新索引的 ----
  const existing = new Map();
  for (const r of db.prepare("select path, mtime, size from docs where vault = ?").all(vault)) {
    existing.set(r.path, r);
  }
  const toIndex = incremental
    ? files.filter((f) => {
        const prev = existing.get(f.path);
        return !prev || prev.mtime !== f.mtime || prev.size !== f.size;
      })
    : files;

  // 删掉已经不存在的文件的索引
  const aliveSet = new Set(files.map((f) => f.path));
  const removed = [];
  for (const p of existing.keys()) {
    if (!aliveSet.has(p)) removed.push(p);
  }

  const delDoc = db.prepare("delete from docs where vault = ? and path = ?");
  const delChunks = db.prepare("delete from chunks where doc_id = ?");
  const delLinks = db.prepare("delete from links where vault = ? and source = ?");

  const insDoc = db.prepare(
    "insert into docs(vault, path, name, ext, mtime, size, indexed_at) values(?,?,?,?,?,?,?)"
  );
  const updDoc = db.prepare(
    "update docs set name=?, ext=?, mtime=?, size=?, indexed_at=? where vault=? and path=?"
  );
  const getDocId = db.prepare("select id from docs where vault=? and path=?");
  const insChunk = db.prepare("insert into chunks(doc_id, ord, text) values(?,?,?)");
  // ⚠️ 用 `insert or replace` 而不是 `insert or ignore`。
  //    唯一键是 (vault, source, target, line)，同一行里出现两次指向同一目标的链接
  //    会冲突；`or ignore` 会**静默丢弃后面那条**，于是 `[[X]]` 与 `[[X|别名]]`
  //    写在同一行时，别名版本被丢掉，反链显示的 label 变成目标名而不是别名。
  //    实测踩过（verify-indexer.cjs 的别名用例就是这个暴露出来的）。
  const insLink = db.prepare(
    "insert or replace into links(vault, source, target, label, line) values(?,?,?,?,?)"
  );

  let indexed = 0;
  let chunkCount = 0;
  let linkCount = 0;
  const errors = [];

  db.exec("begin");
  try {
    // 清理被删掉的文件
    for (const p of removed) {
      const row = getDocId.get(vault, p);
      if (row) delChunks.run(row.id);
      delDoc.run(vault, p);
      delLinks.run(vault, p);
    }

    for (const f of toIndex) {
      if (onProgress) onProgress({ done: indexed, total: toIndex.length, name: f.name });
      try {
        const text = fs.readFileSync(f.path, "utf8");
        // 非文本内容（二进制误判）跳过：出现 NUL 就当不是文本
        if (text.includes("\u0000")) continue;

        const prev = getDocId.get(vault, f.path);
        let docId;
        if (prev) {
          delChunks.run(prev.id);
          updDoc.run(f.name, f.ext, f.mtime, f.size, new Date().toISOString(), vault, f.path);
          docId = prev.id;
        } else {
          const r = insDoc.run(vault, f.path, f.name, f.ext, f.mtime, f.size, new Date().toISOString());
          docId = Number(r.lastInsertRowid);
        }

        // 切块 + 建全文索引
        const chunks = chunkText(text);
        for (let i = 0; i < chunks.length; i++) {
          const cr = insChunk.run(docId, i, chunks[i]);
          chunkCount++;
          void cr;
        }

        // 反向链接（只有 Markdown 才有 wikilink）
        delLinks.run(vault, f.path);
        if (f.ext === ".md" || f.ext === ".markdown") {
          for (const l of extractLinks(text)) {
            insLink.run(vault, f.path, l.target, l.label, l.line);
            linkCount++;
          }
        }
        indexed++;
      } catch (e) {
        errors.push(`${f.name}: ${e.message}`);
      }
    }

    // FTS 索引与内容表同步（content='chunks' 的外部内容表要手动 rebuild）
    db.exec("insert into chunks_fts(chunks_fts) values('rebuild')");
    db.exec("commit");
  } catch (e) {
    db.exec("rollback");
    throw e;
  }

  return {
    ok: true,
    scanned: files.length,
    indexed,
    skipped: files.length - toIndex.length,
    removed: removed.length,
    chunks: chunkCount,
    links: linkCount,
    errors: errors.slice(0, 10),
    ms: Date.now() - t0,
  };
}

/**
 * 检索。
 *
 * ★ 策略：≥3 字走 FTS 索引；≤2 字走 LIKE 扫描。
 *   原因见文件顶部说明（trigram 不索引双字片段，会静默返回 0 条）。
 */
function search(db, { vault, query, limit = 50 }) {
  const q = String(query ?? "").trim();
  if (!q) return { ok: true, hits: [], strategy: "none", ms: 0 };

  const t0 = Date.now();
  const len = [...q].length;   // 按码点算（中文一个字算一个）
  let hits = [];
  let strategy = "";

  if (len >= 3) {
    try {
      hits = db.prepare(`
        select d.path, d.name, c.text,
               snippet(chunks_fts, 0, '\u0001', '\u0002', '…', 14) as snip
        from chunks_fts f
        join chunks c on c.id = f.rowid
        join docs d on d.id = c.doc_id
        where chunks_fts match ? and d.vault = ?
        limit ?
      `).all(q, vault, limit);
      strategy = "fts";
    } catch {
      hits = [];   // FTS 语法报错时落到 LIKE
    }
  }

  // ≤2 字，或 FTS 没结果（包含查询词含特殊字符导致 FTS 报错的情况）
  if (hits.length === 0) {
    hits = db.prepare(`
      select d.path, d.name, c.text,
             substr(c.text, 1, 90) as snip
      from chunks c
      join docs d on d.id = c.doc_id
      where d.vault = ? and c.text like ?
      limit ?
    `).all(vault, `%${q}%`, limit);
    strategy = len >= 3 ? "like-fallback" : "like";
  }

  return { ok: true, hits, strategy, ms: Date.now() - t0, query: q };
}

/**
 * 反向链接：谁引用了这篇笔记。
 *
 * 匹配规则（宽松但实用）：按**文件名主干**匹配 target。
 * `[[情态动词]]` 应当匹配 `笔记/情态动词.md`。
 * 也支持 target 写成带路径的形式。
 */
function backlinks(db, { vault, path: targetPath }) {
  const name = path.basename(targetPath);
  const stem = name.replace(/\.[^.]+$/, "");

  const rows = db.prepare(`
    select source, target, label, line
    from links
    where vault = ? and (target = ? or target = ? or target = ?)
    order by source, line
    limit 500
  `).all(vault, stem, name, targetPath);

  // 按来源文件分组，便于界面显示
  const byFile = new Map();
  for (const r of rows) {
    if (!byFile.has(r.source)) byFile.set(r.source, []);
    byFile.get(r.source).push({ line: r.line, label: r.label, target: r.target });
  }

  return {
    ok: true,
    total: rows.length,
    files: [...byFile.entries()].map(([source, refs]) => ({
      path: source,
      name: path.basename(source),
      refs,
    })),
  };
}

/** 出链：这篇笔记引用了谁 */
function outlinks(db, { vault, path: sourcePath }) {
  const rows = db.prepare(
    "select target, label, line from links where vault = ? and source = ? order by line"
  ).all(vault, sourcePath);
  return { ok: true, links: rows };
}

/** 索引统计（界面上显示"已索引 N 篇"） */
function indexStats(db, { vault }) {
  const docs = db.prepare("select count(*) c from docs where vault = ?").get(vault).c;
  const chunks = db.prepare(
    "select count(*) c from chunks c2 join docs d on d.id = c2.doc_id where d.vault = ?"
  ).get(vault).c;
  const links = db.prepare("select count(*) c from links where vault = ?").get(vault).c;
  const last = db.prepare(
    "select max(indexed_at) t from docs where vault = ?"
  ).get(vault).t;
  return { ok: true, docs, chunks, links, lastIndexed: last };
}

module.exports = {
  openIndex, indexVault, search, backlinks, outlinks, indexStats,
  chunkText, extractLinks, INDEXABLE, MAX_INDEX_BYTES,
};
