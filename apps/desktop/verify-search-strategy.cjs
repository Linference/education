// 中文全文检索策略测试
//
// ★ 本文件记录一个**既有验证漏掉的真问题**：
//   SQLite 的 trigram 分词器只索引 ≥3 字符的片段。
//   所以查**双字中文词**（电场 / 情态 / 函数 / 语法 …）会命中 0 条，
//   而且是**静默的** —— 不报错、不警告，界面只会显示"没有结果"。
//   中文里双字词极多，这个漏洞会直接影响可用性。
//
// 实测结论（三种方案对比，见下方 QUERIES 表）：
//   1. trigram 全文表：≥3 字很准；≤2 字恒为 0
//   2. jieba 预分词词表：**不可靠** —— 依赖分词边界，
//      "情态"被 jieba 切成"情态动词"一个词，于是查"情态"匹配不上；
//      "直角三角形"同理。所以它不能当兜底。
//   3. LIKE 扫描：**2 万行只要 2ms** —— 在这个规模下完全可接受，
//      而且保证查得到。
//
// → 采用的策略：**≥3 字走 FTS 索引，≤2 字走 LIKE 扫描**。
//   用 LIKE 兜底而不是靠词表，是因为"查得到"比"查得快"重要得多。
const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, pass: Boolean(ok), detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? "  " + detail : ""}`);
}

/** 被测的策略实现（与将来接到界面上的那份保持一致） */
function makeSearch(db) {
  return function search(query, limit = 50) {
    const q = String(query ?? "").trim();
    if (!q) return [];
    // ≥3 字：走 trigram FTS 索引
    if ([...q].length >= 3) {
      try {
        return db.prepare(
          `select c.id, c.text,
                  snippet(chunks_fts_trigram, 0, '', '', '…', 12) as snip
           from chunks_fts_trigram f
           join chunks c on c.id = f.rowid
           where chunks_fts_trigram match ?
           limit ?`
        ).all(q, limit);
      } catch {
        /* FTS 查询语法出错时退化到 LIKE */
      }
    }
    // ≤2 字（或 FTS 出错）：LIKE 扫描 —— 这个规模下 2ms，而且保证查得到
    return db.prepare(
      "select id, text, substr(text, 1, 80) as snip from chunks where text like ? limit ?"
    ).all(`%${q}%`, limit);
  };
}

app.whenReady().then(() => {
  const { DatabaseSync } = require("node:sqlite");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-search-"));
  const db = new DatabaseSync(path.join(tmp, "t.db"));

  console.log("=== 中文全文检索策略测试 ===\n");

  // ---- 建表：与 packages/db/schema.sql 的结构保持一致 ----
  db.exec(`
    create table chunks(
      id integer primary key,
      text text not null,
      text_seg text
    );
    create virtual table chunks_fts_trigram using fts5(text, tokenize='trigram');
    create virtual table chunks_fts_word using fts5(text_seg);
  `);

  const DOCS = [
    { text: "情态动词表示说话人对动作的态度：必须、可能、允许、推测", seg: "情态动词 表示 说话人 对 动作 的 态度 必须 可能 允许 推测" },
    { text: "虚拟语气用于表达与事实相反的假设条件", seg: "虚拟 语气 用于 表达 与 事实 相反 的 假设 条件" },
    { text: "电场强度是矢量，方向为正电荷受力方向", seg: "电场 强度 是 矢量 方向 为 正电荷 受力 方向" },
    { text: "勾股定理：直角三角形两直角边的平方和等于斜边的平方", seg: "勾股 定理 直角 三角形 两 直角 边 的 平方 和 等于 斜边 的 平方" },
    { text: "函数单调性的判定方法与常见易错点", seg: "函数 单调性 的 判定 方法 与 常见 易错 点" },
    // ⚠️ 测"语法"这条时发现：这条文档原来没有 —— 于是"查不到"是**正确行为**，
    //    而我把它当成策略失败。查不到的用例必须先确认库里有这个词，
    //    否则测的是"库里没有"，不是"检索坏了"。
    { text: "英语语法中的时态与语态是常见考点", seg: "英语 语法 中 的 时态 与 语态 是 常见 考点" },
  ];

  const insC = db.prepare("insert into chunks(text, text_seg) values(?, ?)");
  const insT = db.prepare("insert into chunks_fts_trigram(text) values(?)");
  const insW = db.prepare("insert into chunks_fts_word(text_seg) values(?)");
  for (const d of DOCS) { insC.run(d.text, d.seg); insT.run(d.text); insW.run(d.seg); }

  // ================================================================
  console.log("── 1. 记录问题本身：trigram 对双字词失效 ──");
  const twoChar = ["电场", "情态", "函数", "语法", "语气", "三角", "语气"];
  const trigramMisses = [];
  for (const q of twoChar) {
    const n = db.prepare("select count(*) c from chunks_fts_trigram where chunks_fts_trigram match ?").get(q).c;
    if (n === 0) trigramMisses.push(q);
  }
  check("★ 确认 trigram 对双字词失效（这是要解决的问题）",
    trigramMisses.length === twoChar.length,
    `全部 ${twoChar.length} 个双字词命中 0 条：${trigramMisses.join(" ")}`);

  const threeChar = ["情态动词", "直角三角形", "勾股定理", "电场强度"];
  const threeOk = threeChar.every((q) =>
    db.prepare("select count(*) c from chunks_fts_trigram where chunks_fts_trigram match ?").get(q).c > 0);
  check("trigram 对 ≥3 字查询正常", threeOk, threeChar.join(" "));

  // ================================================================
  console.log("\n── 2. 为什么不能用 jieba 词表兜底 ──");
  const wordMisses = [];
  for (const q of ["情态", "三角", "直角三角形"]) {
    const n = db.prepare("select count(*) c from chunks_fts_word where chunks_fts_word match ?").get(q).c;
    if (n === 0) wordMisses.push(q);
  }
  check("★ 证实 word 词表也不可靠（依赖分词边界）",
    wordMisses.length > 0,
    `这些词词表也查不到：${wordMisses.join(" ")} —— 所以它不能当兜底`);

  // ================================================================
  console.log("\n── 3. 采用的策略：≥3 字走 FTS，≤2 字走 LIKE ──");
  const search = makeSearch(db);

  for (const q of ["电场", "情态", "函数", "语法"]) {
    const r = search(q);
    check(`双字词「${q}」能查到`, r.length > 0, `${r.length} 条`);
  }
  for (const q of ["情态动词", "直角三角形", "勾股定理"]) {
    const r = search(q);
    check(`≥3 字「${q}」能查到`, r.length > 0, `${r.length} 条`);
  }
  check("查不到的词返回空数组而不是抛异常", search("不存在的词啊啊啊").length === 0);
  check("空查询返回空数组", search("").length === 0 && search("   ").length === 0);
  check("查询结果带片段（便于界面预览）",
    search("电场")[0]?.snip?.length > 0, String(search("电场")[0]?.snip ?? "").slice(0, 30));

  // ================================================================
  console.log("\n── 4. LIKE 在真实规模上够快吗 ──");
  db.exec("create table big(id integer primary key, t text)");
  const insBig = db.prepare("insert into big(t) values(?)");
  db.exec("begin");
  for (let i = 0; i < 20000; i++) {
    insBig.run(`第${i}条：电场与磁场的关系，情态动词的用法，勾股定理的应用，函数单调性`);
  }
  db.exec("commit");

  const t0 = Date.now();
  const likeHit = db.prepare("select count(*) c from big where t like ?").get("%电场%").c;
  const likeMs = Date.now() - t0;
  check("★ 2 万行 LIKE 扫描在 100ms 内（可接受为兜底）", likeMs < 100,
    `${likeHit} 条，${likeMs}ms`);
  check("LIKE 兜底能命中大表里的双字词", likeHit > 0, `${likeHit} 条`);

  // 索引规模下 FTS 的速度
  db.exec("create virtual table big_fts using fts5(t, tokenize='trigram')");
  db.exec("insert into big_fts(t) select t from big");
  const t1 = Date.now();
  const ftsHit = db.prepare("select count(*) c from big_fts where big_fts match ?").get("情态动词").c;
  const ftsMs = Date.now() - t0 - likeMs;
  check("2 万行 FTS 检索也很快", ftsMs < 500, `${ftsHit} 条，${Date.now() - t1}ms`);

  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
  for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
  app.exit(passed === results.length ? 0 : 1);
});
