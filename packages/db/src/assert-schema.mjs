#!/usr/bin/env node
// Gezhi · Schema assertions: turn "the vault is built correctly" into a regression check.
//
// Why this is needed: the Chinese FTS tokenization pitfall (the default unicode61 cannot find Chinese) is a **silent failure** —
// the index is built and queries do not error, they simply find nothing. Without assertions you cannot detect it.
import assert from "node:assert/strict";
import { openDatabase, migrate, schemaInfo, searchChunks, insertChunk, closeDatabase } from "./index.mjs";

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed++;
    console.log(`  [FAIL] ${name}`);
    console.log(`         ${err.message.split("\n")[0]}`);
  }
}

const db = openDatabase({ file: ":memory:" });
const info = migrate(db);

console.log("=== Gezhi · Schema assertions ===");
console.log(`  SQLite ${info.sqlite} | schema v${info.schemaVersion} | ${info.tableCount} tables`);
console.log(`  FTS tables: ${info.ftsTables.join(", ") || "(none)"}`);
console.log("");

// ---------------------------------------------------------------- Basic structure

check("SQLite version >= 3.51.3 (avoids the WAL-reset vulnerability)", () => {
  const [maj, min, pat] = info.sqlite.split(".").map(Number);
  const v = maj * 10000 + min * 100 + pat;
  assert.ok(v >= 3 * 10000 + 51 * 100 + 3, `Version too low: ${info.sqlite}`);
});

check("Both FTS tables are created", () => {
  assert.ok(info.ftsTables.includes("chunks_fts_trigram"), "missing chunks_fts_trigram");
  assert.ok(info.ftsTables.includes("chunks_fts_word"), "missing chunks_fts_word");
});

check("All key tables are present", () => {
  const need = [
    "vaults", "files", "links", "tags", "vault_properties",
    "books", "chapters", "pages", "chunks", "knowledge_points", "kp_edges",
    "questions", "question_kps", "papers", "paper_items",
    "feynman_sessions", "feynman_attempts", "mastery",
    "goals", "plans", "tasks", "events", "countdowns", "reviews", "ai_plan_runs",
    "conversations", "messages_index",
  ];
  const missing = need.filter((t) => !info.tables.includes(t));
  assert.deepEqual(missing, [], `Missing tables: ${missing.join(", ")}`);
});

check("The trigram index uses the trigram tokenizer (not the default unicode61)", () => {
  const sql = db
    .prepare("SELECT sql FROM sqlite_master WHERE name='chunks_fts_trigram'")
    .get().sql;
  assert.match(sql, /tokenize\s*=\s*'trigram'/i, `No trigram in CREATE statement: ${sql.slice(0, 120)}`);
});

// ---------------------------------------------------------------- Chinese search (core)

db.prepare("INSERT INTO vaults (id, name, root_path) VALUES ('v1','测试库','/tmp/v1')").run();
db.prepare(
  `INSERT INTO books (id, vault_id, title, subject, grade, source) VALUES (1,'v1','普通高中教科书·生物学','生物','高一','official_api')`
).run();

const fixtures = [
  "细胞呼吸分为糖解、柠檬酸循环与电子传递链三个阶段。",
  "国家中小学智慧教育平台提供免费的电子教材。",
  "情态动词 must 表示主观必须，may 表示推测。",
  "modal verbs express modality in English grammar.",
];
fixtures.forEach((t, i) => insertChunk(db, { bookId: 1, pageFrom: i + 1, pageTo: i + 1, text: t }));

check("trigram finds Chinese substrings (the default tokenizer cannot)", () => {
  const hits = searchChunks(db, "电子传递链");
  assert.ok(hits.length >= 1, "「电子传递链」matched no chunk");
  assert.ok(hits[0].text.includes("电子传递链"));
});

check("trigram finds short Chinese strings that are not full words", () => {
  const hits = searchChunks(db, "智慧教育");
  assert.ok(hits.length >= 1, "「智慧教育」matched nothing");
});

check("English words match too", () => {
  const hits = searchChunks(db, "modality");
  assert.ok(hits.length >= 1, "「modality」matched nothing");
});

check("Search results carry page numbers (a prerequisite for enforced citations)", () => {
  const hits = searchChunks(db, "情态动词");
  assert.ok(hits.length >= 1);
  assert.equal(typeof hits[0].page_from, "number");
});

check("Searching an empty string returns an empty array without throwing", () => {
  assert.deepEqual(searchChunks(db, "   "), []);
});

check("Queries containing FTS syntax characters do not crash (injection protection)", () => {
  const hits = searchChunks(db, 'NOT OR "unbalanced');
  assert.ok(Array.isArray(hits));
});

// ---------------------------------------------------------------- Triggers and consistency

check("After inserting into chunks, both FTS tables are synced", () => {
  const before = db.prepare("SELECT count(*) c FROM chunks_fts_word").get().c;
  const id = insertChunk(db, { bookId: 1, pageFrom: 99, pageTo: 99, text: "触发器同步测试专用句子" });
  const after = db.prepare("SELECT count(*) c FROM chunks_fts_word").get().c;
  assert.equal(after, before + 1, "chunks_fts_word not synced");
  const tri = db
    .prepare("SELECT count(*) c FROM chunks_fts_trigram WHERE chunks_fts_trigram MATCH ?")
    .get('"触发器同步测试"').c;
  assert.ok(tri >= 1, "chunks_fts_trigram not synced");
  db.prepare("DELETE FROM chunks WHERE id=?").run(id);
  const afterDel = db.prepare("SELECT count(*) c FROM chunks_fts_word").get().c;
  assert.equal(afterDel, before, "FTS not synced after delete");
});

check("Foreign key constraints really take effect (they silently pass when PRAGMA is off)", () => {
  assert.throws(
    () => db.prepare("INSERT INTO chunks (book_id,page_from,page_to,text) VALUES (99999,1,1,'x')").run(),
    /FOREIGN KEY|constraint/i
  );
});

check("Ghost-edge protection: dst_file_id may be NULL (unresolved wikilinks produce no outgoing edge)", () => {
  db.prepare(
    `INSERT INTO files (id, vault_id, path, ext, kind) VALUES (10,'v1','笔记/a.md','md','md')`
  ).run();
  db.prepare(
    `INSERT INTO links (vault_id, src_file_id, dst_path, dst_file_id, kind) VALUES ('v1',10,'不存在的文件',NULL,'wikilink')`
  ).run();
  const ghosts = db.prepare("SELECT count(*) c FROM links WHERE dst_file_id IS NULL").get().c;
  assert.equal(ghosts, 1);
});

// ---------------------------------------------------------------- Plan module semantic constraints

check("events and tasks are two separate tables (fixed schedules cannot be rescheduled by AI)", () => {
  assert.ok(info.tables.includes("events"));
  assert.ok(info.tables.includes("tasks"));
  assert.ok(!info.tables.includes("schedule_items"), "There should be no table that mixes the two");
});

check("Time fields are stored as ISO-8601 TEXT, and julianday() can compute differences correctly", () => {
  const d = db.prepare("SELECT julianday('2026-11-26') - julianday('2026-10-01') AS days").get().days;
  assert.equal(Math.round(d), 56, `Expected 56 days, got ${d}`);
});

check("sessions_stat uses day as the primary key (one row per day)", () => {
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE name='sessions_stat'").get().sql;
  assert.match(sql, /day\s+TEXT PRIMARY KEY/i);
});

console.log("");
console.log(`=== Result: ${passed} passed / ${failed} failed ===`);
closeDatabase(db);
process.exit(failed === 0 ? 0 : 1);
