// 题库与组卷
//
// ★ 为什么题库要放 SQLite 而不是 Markdown 文件：
//   组卷是**按条件抽题**（"广东中考 + 二次函数 + 难度 3 以上 + 只抽选择题"），
//   这是查询，不是浏览。用文件存就得每次全量读盘再过滤，
//   几百道题就开始卡；SQLite 加索引是毫秒级。
//   题目**也可以**同时留在 Markdown 里（导入后仍可阅读编辑）——
//   这里存的是"可检索的副本"，不是唯一真相。
//
// ★ 题目字段设计的取舍：
//   · kps（知识点）存 JSON 数组而不是关联表：知识点数量少（每道题 1~4 个），
//     建关联表会让导入导出变复杂，收益不大。真要按知识点统计时再拆。
//   · options 存 JSON：选择题选项数固定，结构化后组卷排版才好办。
//   · source 单独一个字段：广东中考 / 港澳台联考 / 四校联考 / 澳门保送
//     这些来源是用户明确要求的筛选维度，不能混在标题里。
const path = require("node:path");
const fs = require("node:fs");

let DatabaseSync = null;
function sqlite() {
  if (!DatabaseSync) DatabaseSync = require("node:sqlite").DatabaseSync;
  return DatabaseSync;
}

/** 题型 */
const Q_TYPES = ["choice", "fill", "answer", "proof", "calc"];
const TYPE_LABEL = {
  choice: "选择题",
  fill: "填空题",
  answer: "解答题",
  proof: "证明题",
  calc: "计算题",
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
      options    text,                 -- JSON 数组（选择题）
      answer     text,
      solution   text,                 -- 解析
      kps        text,                 -- JSON 数组（知识点）
      difficulty integer not null default 3,   -- 1~5
      source     text,                 -- 广东中考 / 港澳台联考 / 四校联考 / 澳门保送 …
      year       integer,
      subject    text,                 -- 数学 / 物理 …
      created_at text not null,
      updated_at text not null
    );
    create index if not exists idx_q_vault on questions(vault);
    create index if not exists idx_q_diff  on questions(vault, difficulty);
    create index if not exists idx_q_src   on questions(vault, source);
    create index if not exists idx_q_type  on questions(vault, type);

    -- 试卷：组好的卷子留档，下次可以直接再导一次
    create table if not exists papers(
      id         integer primary key autoincrement,
      vault      text not null,
      title      text not null,
      qids       text not null,        -- JSON 数组（题目 id，按卷面顺序）
      config     text,                 -- JSON（组卷条件，便于"再来一份同规格的"）
      created_at text not null
    );
    create index if not exists idx_papers_vault on papers(vault);
  `);
  return db;
}

function nowIso() {
  return new Date().toISOString();
}

/** 安全 JSON.parse */
function parseJson(s, fallback) {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}

/** 把数据库行转成前端要的形状（拆掉 JSON 字符串） */
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

// ---------------------------------------------------------------- 增删改查

function addQuestion(db, p) {
  const stem = String(p?.stem ?? "").trim();
  if (!stem) return { ok: false, error: "题干不能为空" };
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
 * 批量导入。
 *
 * ★ 用事务：几百道题逐条 insert 不加事务会慢几十倍
 *   （每条一次 fsync）。而且导入到一半失败会留半份数据，
 *   事务能保证"要么全进，要么全不进"。
 */
function addQuestions(db, { vault, questions }) {
  if (!Array.isArray(questions) || !questions.length) {
    return { ok: false, error: "没有要导入的题目" };
  }
  const stmt = db.prepare(
    `insert into questions(vault, type, stem, options, answer, solution, kps, difficulty, source, year, subject, created_at, updated_at)
     values(?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  let added = 0;
  const failed = [];
  db.exec("begin");
  try {
    for (const [i, q] of questions.entries()) {
      const stem = String(q?.stem ?? "").trim();
      if (!stem) { failed.push({ index: i, reason: "题干为空" }); continue; }
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
      } catch (e) {
        failed.push({ index: i, reason: String(e?.message ?? e) });
      }
    }
    db.exec("commit");
  } catch (e) {
    db.exec("rollback");
    return { ok: false, error: "导入失败已回滚：" + String(e?.message ?? e) };
  }
  return { ok: true, added, failed };
}

function updateQuestion(db, { vault, id, patch }) {
  const cur = db.prepare("select * from questions where id = ? and vault = ?").get(id, vault);
  if (!cur) return { ok: false, error: "找不到这道题" };
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

// ---------------------------------------------------------------- 查询

/**
 * 按条件抽题。
 *
 * ★ 所有条件都是**可选的组合**（用户要的就是"广东中考 + 二次函数 + 难度≥3"这种叠加）。
 *   知识点用 LIKE 匹配 JSON 字符串 —— 因为 kps 存的是 JSON 数组文本，
 *   对 1~4 个知识点这种规模，LIKE 完全够用，不值得为它建关联表。
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

/** 题库概览：总数、各来源/题型/难度的分布（界面上的筛选项据此生成） */
function bankStats(db, { vault }) {
  const total = db.prepare("select count(*) as n from questions where vault = ?").get(vault)?.n ?? 0;
  const byType = db.prepare("select type, count(*) as n from questions where vault = ? group by type").all(vault);
  const bySource = db.prepare("select source, count(*) as n from questions where vault = ? and source is not null group by source order by n desc").all(vault);
  const byDiff = db.prepare("select difficulty, count(*) as n from questions where vault = ? group by difficulty order by difficulty").all(vault);
  const bySubject = db.prepare("select subject, count(*) as n from questions where vault = ? and subject is not null group by subject").all(vault);

  // 知识点：把 JSON 数组拆开统计（题目量级在几千以内，全表扫可接受）
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

/** 按 id 取题（组卷导出要用） */
function getQuestionsByIds(db, { vault, ids }) {
  if (!ids?.length) return { ok: true, questions: [] };
  const ph = ids.map(() => "?").join(",");
  const rows = db.prepare(`select * from questions where vault = ? and id in (${ph})`).all(vault, ...ids);
  // 按传入的 ids 顺序返回（卷面顺序由用户决定，不能按数据库顺序）
  const byId = new Map(rows.map((r) => [r.id, r]));
  return { ok: true, questions: ids.map((id) => byId.get(Number(id))).filter(Boolean).map(rowToQuestion) };
}

// ---------------------------------------------------------------- 试卷留档

function savePaper(db, { vault, title, qids, config }) {
  const info = db.prepare(
    "insert into papers(vault, title, qids, config, created_at) values(?,?,?,?,?)"
  ).run(vault, String(title ?? "未命名试卷"), JSON.stringify(qids ?? []), config ? JSON.stringify(config) : null, nowIso());
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
