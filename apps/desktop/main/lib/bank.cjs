// Question bank and paper assembly
//
// ★ Why the bank lives in SQLite rather than Markdown files:
//   Assembling a paper is a **conditional query** ("Guangdong exam + quadratic
//   functions + difficulty 3 or higher + multiple choice only"). That is a
//   query, not browsing. With files you would re-read and filter everything on
//   every request, and a few hundred questions already start to lag; SQLite
//   with an index is millisecond-fast.
//   Questions **can** also stay in Markdown (still readable/editable after
//   import) — what is stored here is a "searchable copy", not the only truth.
//
// ★ Trade-offs in the question field design:
//   · kps (knowledge points) stored as a JSON array instead of a relation
//     table: there are few knowledge points (1~4 per question), and a relation
//     table would complicate import/export for little gain. Split it out only
//     when we actually need per-knowledge-point statistics.
//   · options stored as JSON: choice questions have a fixed number of options,
//     and structuring them makes paper layout much easier.
//   · source as its own field: Guangdong exam / Hong Kong-Macau-Taiwan joint
//     exam / four-school joint exam / Macau recommendation are filter
//     dimensions users explicitly asked for and must not be mixed into titles.
const path = require("node:path");
const fs = require("node:fs");

let DatabaseSync = null;
function sqlite() {
  if (!DatabaseSync) DatabaseSync = require("node:sqlite").DatabaseSync;
  return DatabaseSync;
}

/** Question types */
const Q_TYPES = ["choice", "fill", "answer", "proof", "calc"];
const TYPE_LABEL = {
  choice: "Multiple choice",
  fill: "Fill in the blank",
  answer: "Free response",
  proof: "Proof",
  calc: "Calculation",
};

function openBankDb(dbPath) {
  const DB = sqlite();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DB(dbPath);
  db.exec("pragma journal_mode = wal");
  db.exec(`
    create table if not exists questions(
      id         integer primary key autoincrement,
      vault      text not null,
      type       text not null default 'answer',
      stem       text not null,
      options    text,                 -- JSON array (multiple choice)
      answer     text,
      solution   text,                 -- explanation
      kps        text,                 -- JSON array (knowledge points)
      difficulty integer not null default 3,   -- 1~5
      source     text,                 -- Guangdong exam / Hong Kong-Macau-Taiwan joint exam / four-school joint exam / Macau recommendation …
      year       integer,
      subject    text,                 -- Math / Physics …
      created_at text not null,
      updated_at text not null
    );
    create index if not exists idx_q_vault on questions(vault);
    create index if not exists idx_q_diff  on questions(vault, difficulty);
    create index if not exists idx_q_src   on questions(vault, source);
    create index if not exists idx_q_type  on questions(vault, type);

    -- Papers: archive assembled papers so they can be exported again later
    create table if not exists papers(
      id         integer primary key autoincrement,
      vault      text not null,
      title      text not null,
      qids       text not null,        -- JSON array (question ids, in paper order)
      config     text,                 -- JSON (assembly conditions, for "another paper of the same spec")
      created_at text not null
    );
    create index if not exists idx_papers_vault on papers(vault);
  `);
  return db;
}

function nowIso() {
  return new Date().toISOString();
}

/** Safe JSON.parse */
function parseJson(s, fallback) {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}

/** Convert a database row to the shape the frontend expects (unpack JSON strings) */
function rowToQuestion(r) {
  return {
    id: r.id,
    type: r.type,
    typeLabel: TYPE_LABEL[r.type] ?? r.type,
    stem: r.stem,
    options: parseJson(r.options, []),
    answer: r.answer ?? "",
    solution: r.solution ?? "",
    kps: parseJson(r.kps, []),
    difficulty: r.difficulty,
    source: r.source ?? "",
    year: r.year ?? null,
    subject: r.subject ?? "",
  };
}

// ---------------------------------------------------------------- CRUD

function addQuestion(db, p) {
  const stem = String(p?.stem ?? "").trim();
  if (!stem) return { ok: false, error: "Question stem cannot be empty" };
  const type = Q_TYPES.includes(p?.type) ? p.type : "answer";
  const diff = Math.max(1, Math.min(5, Number(p?.difficulty) || 3));
  const info = db.prepare(
    `insert into questions(vault, type, stem, options, answer, solution, kps, difficulty, source, year, subject, created_at, updated_at)
     values(?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    p.vault, type, stem,
    p.options?.length ? JSON.stringify(p.options) : null,
    p.answer ?? null,
    p.solution ?? null,
    p.kps?.length ? JSON.stringify(p.kps) : null,
    diff,
    p.source ?? null,
    p.year ?? null,
    p.subject ?? null,
    nowIso(), nowIso(),
  );
  return { ok: true, id: Number(info.lastInsertRowid) };
}

/**
 * Bulk import.
 *
 * ★ Use a transaction: inserting a few hundred questions one by one without
 *   a transaction is dozens of times slower (one fsync per row). A failure
 *   halfway through would also leave half the data behind; a transaction
 *   guarantees "all in, or none in".
 */
function addQuestions(db, { vault, questions, skipDuplicates = false }) {
  if (!Array.isArray(questions) || !questions.length) {
    return { ok: false, error: "No questions to import" };
  }
  const stmt = db.prepare(
    `insert into questions(vault, type, stem, options, answer, solution, kps, difficulty, source, year, subject, created_at, updated_at)
     values(?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  let added = 0;
  let skipped = 0;
  const signature = q => JSON.stringify([String(q.stem || '').normalize('NFKC').replace(/\s+/g,''), q.options, String(q.answer || '').trim()]);
  const seen = new Set(skipDuplicates ? db.prepare('SELECT stem,options,answer FROM questions WHERE vault=?').all(vault).map(q => signature({ ...q, options: parseJson(q.options,[]) })) : []);
  const failed = [];
  db.exec("begin");
  try {
    for (const [i, q] of questions.entries()) {
      const stem = String(q?.stem ?? "").trim();
      if (!stem) { failed.push({ index: i, reason: "Question stem is empty" }); continue; }
      if (skipDuplicates && seen.has(signature(q))) { skipped++; continue; }
      try {
        stmt.run(
          vault,
          Q_TYPES.includes(q.type) ? q.type : "answer",
          stem,
          q.options?.length ? JSON.stringify(q.options) : null,
          q.answer ?? null,
          q.solution ?? null,
          q.kps?.length ? JSON.stringify(q.kps) : null,
          Math.max(1, Math.min(5, Number(q.difficulty) || 3)),
          q.source ?? null,
          q.year ?? null,
          q.subject ?? null,
          nowIso(), nowIso(),
        );
        added++;
        if (skipDuplicates) seen.add(signature(q));
      } catch (e) {
        failed.push({ index: i, reason: String(e?.message ?? e) });
      }
    }
    db.exec("commit");
  } catch (e) {
    db.exec("rollback");
    return { ok: false, error: "Import failed and was rolled back: " + String(e?.message ?? e) };
  }
  return { ok: added > 0 || skipped > 0, added, skipped, failed, ...(added || skipped ? {} : { error: 'No questions were imported successfully; check the stem and field format' }) };
}

function updateQuestion(db, { vault, id, patch }) {
  const cur = db.prepare("select * from questions where id = ? and vault = ?").get(id, vault);
  if (!cur) return { ok: false, error: "Question not found" };
  const map = {
    type: "type", stem: "stem", answer: "answer", solution: "solution",
    difficulty: "difficulty", source: "source", year: "year", subject: "subject",
  };
  const sets = [];
  const vals = [];
  for (const [k, col] of Object.entries(map)) {
    if (patch[k] === undefined) continue;
    sets.push(`${col} = ?`);
    vals.push(patch[k]);
  }
  if (patch.options !== undefined) { sets.push("options = ?"); vals.push(patch.options?.length ? JSON.stringify(patch.options) : null); }
  if (patch.kps !== undefined) { sets.push("kps = ?"); vals.push(patch.kps?.length ? JSON.stringify(patch.kps) : null); }
  if (!sets.length) return { ok: true, unchanged: true };
  sets.push("updated_at = ?");
  vals.push(nowIso(), id, vault);
  db.prepare(`update questions set ${sets.join(", ")} where id = ? and vault = ?`).run(...vals);
  return { ok: true };
}

function deleteQuestion(db, { vault, id }) {
  const r = db.prepare("delete from questions where id = ? and vault = ?").run(id, vault);
  return { ok: true, removed: Number(r.changes ?? 0) };
}

// ---------------------------------------------------------------- Queries

/**
 * Draw questions by condition.
 *
 * ★ Every condition is an **optional combination** (users want stacks like
 *   "Guangdong exam + quadratic functions + difficulty ≥ 3").
 *   Knowledge points are matched with LIKE over the JSON string — because kps
 *   is stored as JSON array text, LIKE is plenty for 1~4 knowledge points and
 *   it is not worth a relation table for that scale.
 */
function listQuestions(db, { vault, type, source, difficultyMin, difficultyMax, kp, keyword, subject, limit = 200, offset = 0 }) {
  const where = ["vault = ?"];
  const args = [vault];

  if (type) { where.push("type = ?"); args.push(type); }
  if (source) { where.push("source = ?"); args.push(source); }
  if (subject) { where.push("subject = ?"); args.push(subject); }
  if (difficultyMin != null) { where.push("difficulty >= ?"); args.push(Number(difficultyMin)); }
  if (difficultyMax != null) { where.push("difficulty <= ?"); args.push(Number(difficultyMax)); }
  if (kp) { where.push("kps like ?"); args.push(`%${kp}%`); }
  if (keyword) {
    where.push("(stem like ? or answer like ? or solution like ?)");
    const k = `%${keyword}%`;
    args.push(k, k, k);
  }

  const sql = `select * from questions where ${where.join(" and ")} order by id desc limit ? offset ?`;
  const rows = db.prepare(sql).all(...args, Number(limit), Number(offset));
  const total = db.prepare(`select count(*) as n from questions where ${where.join(" and ")}`).get(...args)?.n ?? 0;
  return { ok: true, questions: rows.map(rowToQuestion), total };
}

/** Bank overview: totals and the distribution by source/type/difficulty (used to build the UI filters) */
function bankStats(db, { vault }) {
  const total = db.prepare("select count(*) as n from questions where vault = ?").get(vault)?.n ?? 0;
  const byType = db.prepare("select type, count(*) as n from questions where vault = ? group by type").all(vault);
  const bySource = db.prepare("select source, count(*) as n from questions where vault = ? and source is not null group by source order by n desc").all(vault);
  const byDiff = db.prepare("select difficulty, count(*) as n from questions where vault = ? group by difficulty order by difficulty").all(vault);
  const bySubject = db.prepare("select subject, count(*) as n from questions where vault = ? and subject is not null group by subject").all(vault);

  // Knowledge points: unpack the JSON array and count (a full scan is fine up to a few thousand questions)
  const kpRows = db.prepare("select kps from questions where vault = ? and kps is not null").all(vault);
  const kpMap = new Map();
  for (const r of kpRows) {
    for (const k of parseJson(r.kps, [])) {
      kpMap.set(k, (kpMap.get(k) ?? 0) + 1);
    }
  }
  const byKp = [...kpMap.entries()].map(([kp, n]) => ({ kp, n })).sort((a, b) => b.n - a.n);

  return { ok: true, total, byType, bySource, byDiff, bySubject, byKp };
}

/** Fetch questions by id (used for paper export) */
function getQuestionsByIds(db, { vault, ids }) {
  if (!ids?.length) return { ok: true, questions: [] };
  const ph = ids.map(() => "?").join(",");
  const rows = db.prepare(`select * from questions where vault = ? and id in (${ph})`).all(vault, ...ids);
  // Return in the order the ids were given (paper order is user-determined, not database order)
  const byId = new Map(rows.map((r) => [r.id, r]));
  return { ok: true, questions: ids.map((id) => byId.get(Number(id))).filter(Boolean).map(rowToQuestion) };
}

// ---------------------------------------------------------------- Paper archive

function savePaper(db, { vault, title, qids, config }) {
  const info = db.prepare(
    "insert into papers(vault, title, qids, config, created_at) values(?,?,?,?,?)"
  ).run(vault, String(title ?? "Untitled paper"), JSON.stringify(qids ?? []), config ? JSON.stringify(config) : null, nowIso());
  return { ok: true, id: Number(info.lastInsertRowid) };
}

function listPapers(db, { vault }) {
  const rows = db.prepare("select * from papers where vault = ? order by id desc limit 50").all(vault);
  return {
    ok: true,
    papers: rows.map((r) => ({
      id: r.id, title: r.title,
      qids: parseJson(r.qids, []),
      config: parseJson(r.config, null),
      createdAt: r.created_at,
    })),
  };
}

function deletePaper(db, { vault, id }) {
  const r = db.prepare("delete from papers where id = ? and vault = ?").run(id, vault);
  return { ok: true, removed: Number(r.changes ?? 0) };
}

module.exports = {
  openBankDb, Q_TYPES, TYPE_LABEL,
  addQuestion, addQuestions, updateQuestion, deleteQuestion,
  listQuestions, bankStats, getQuestionsByIds,
  savePaper, listPapers, deletePaper,
};
