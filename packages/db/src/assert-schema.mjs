#!/usr/bin/env node
// 格致 · 库结构断言：把"建库正确性"变成可回归的检查。
//
// 为什么需要它：中文 FTS 分词这条坑（默认 unicode61 检不到中文）是**静默失败**——
// 索引建好了、查询不报错，只是搜不到东西。没有断言就发现不了。
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

console.log("=== 格致 · 库结构断言 ===");
console.log(`  SQLite ${info.sqlite}｜schema v${info.schemaVersion}｜${info.tableCount} 张表`);
console.log(`  FTS 表：${info.ftsTables.join(", ") || "（无）"}`);
console.log("");

// ---------------------------------------------------------------- 基本结构

check("SQLite 版本 ≥ 3.51.3（避开 WAL-reset 漏洞）", () => {
  const [maj, min, pat] = info.sqlite.split(".").map(Number);
  const v = maj * 10000 + min * 100 + pat;
  assert.ok(v >= 3 * 10000 + 51 * 100 + 3, `版本过低：${info.sqlite}`);
});

check("两张 FTS 表都建出来了", () => {
  assert.ok(info.ftsTables.includes("chunks_fts_trigram"), "缺 chunks_fts_trigram");
  assert.ok(info.ftsTables.includes("chunks_fts_word"), "缺 chunks_fts_word");
});

check("关键表齐全", () => {
  const need = [
    "vaults", "files", "links", "tags", "vault_properties",
    "books", "chapters", "pages", "chunks", "knowledge_points", "kp_edges",
    "questions", "question_kps", "papers", "paper_items",
    "feynman_sessions", "feynman_attempts", "mastery",
    "goals", "plans", "tasks", "events", "countdowns", "reviews", "ai_plan_runs",
    "conversations", "messages_index",
  ];
  const missing = need.filter((t) => !info.tables.includes(t));
  assert.deepEqual(missing, [], `缺表：${missing.join(", ")}`);
});

check("trigram 索引用的是 trigram 分词器（不是默认 unicode61）", () => {
  const sql = db
    .prepare("SELECT sql FROM sqlite_master WHERE name='chunks_fts_trigram'")
    .get().sql;
  assert.match(sql, /tokenize\s*=\s*'trigram'/i, `建表语句里没有 trigram：${sql.slice(0, 120)}`);
});

// ---------------------------------------------------------------- 中文检索（核心）

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

check("trigram 能搜到中文子串（默认分词器搜不到）", () => {
  const hits = searchChunks(db, "电子传递链");
  assert.ok(hits.length >= 1, "「电子传递链」没有命中任何 chunk");
  assert.ok(hits[0].text.includes("电子传递链"));
});

check("trigram 能搜到不构成词的短中文串", () => {
  const hits = searchChunks(db, "智慧教育");
  assert.ok(hits.length >= 1, "「智慧教育」没有命中");
});

check("英文单词也能命中", () => {
  const hits = searchChunks(db, "modality");
  assert.ok(hits.length >= 1, "「modality」没有命中");
});

check("检索结果带页码（引用强制的前提）", () => {
  const hits = searchChunks(db, "情态动词");
  assert.ok(hits.length >= 1);
  assert.equal(typeof hits[0].page_from, "number");
});

check("检索空串返回空数组，不抛异常", () => {
  assert.deepEqual(searchChunks(db, "   "), []);
});

check("含 FTS 语法字符的查询不崩（注入防护）", () => {
  const hits = searchChunks(db, 'NOT OR "unbalanced');
  assert.ok(Array.isArray(hits));
});

// ---------------------------------------------------------------- 触发器与一致性

check("往 chunks 插入后，两张 FTS 表都同步了", () => {
  const before = db.prepare("SELECT count(*) c FROM chunks_fts_word").get().c;
  const id = insertChunk(db, { bookId: 1, pageFrom: 99, pageTo: 99, text: "触发器同步测试专用句子" });
  const after = db.prepare("SELECT count(*) c FROM chunks_fts_word").get().c;
  assert.equal(after, before + 1, "chunks_fts_word 未同步");
  const tri = db
    .prepare("SELECT count(*) c FROM chunks_fts_trigram WHERE chunks_fts_trigram MATCH ?")
    .get('"触发器同步测试"').c;
  assert.ok(tri >= 1, "chunks_fts_trigram 未同步");
  db.prepare("DELETE FROM chunks WHERE id=?").run(id);
  const afterDel = db.prepare("SELECT count(*) c FROM chunks_fts_word").get().c;
  assert.equal(afterDel, before, "删除后 FTS 未同步");
});

check("外键约束真的生效（未开 PRAGMA 时会静默通过）", () => {
  assert.throws(
    () => db.prepare("INSERT INTO chunks (book_id,page_from,page_to,text) VALUES (99999,1,1,'x')").run(),
    /FOREIGN KEY|constraint/i
  );
});

check("幽灵边防护：dst_file_id 允许为 NULL（未解析的 wikilink 不产生边指向）", () => {
  db.prepare(
    `INSERT INTO files (id, vault_id, path, ext, kind) VALUES (10,'v1','笔记/a.md','md','md')`
  ).run();
  db.prepare(
    `INSERT INTO links (vault_id, src_file_id, dst_path, dst_file_id, kind) VALUES ('v1',10,'不存在的文件',NULL,'wikilink')`
  ).run();
  const ghosts = db.prepare("SELECT count(*) c FROM links WHERE dst_file_id IS NULL").get().c;
  assert.equal(ghosts, 1);
});

// ---------------------------------------------------------------- 计划模块的语义约束

check("events 与 tasks 是两张独立的表（固定日程不可被 AI 重排）", () => {
  assert.ok(info.tables.includes("events"));
  assert.ok(info.tables.includes("tasks"));
  assert.ok(!info.tables.includes("schedule_items"), "不应存在把两者混在一起的表");
});

check("时间字段用 TEXT 存 ISO-8601，且 julianday() 可正确求差", () => {
  const d = db.prepare("SELECT julianday('2026-11-26') - julianday('2026-10-01') AS days").get().days;
  assert.equal(Math.round(d), 56, `期望 56 天，实际 ${d}`);
});

check("sessions_stat 以 day 为主键（一天一行）", () => {
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE name='sessions_stat'").get().sql;
  assert.match(sql, /day\s+TEXT PRIMARY KEY/i);
});

console.log("");
console.log(`=== 结果：${passed} 通过 / ${failed} 失败 ===`);
closeDatabase(db);
process.exit(failed === 0 ? 0 : 1);
