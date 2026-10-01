// 日历 / 计划的数据层（SQLite）
//
// ★ 设计上最重要的一条（schema.sql 里原话）：
//   **events 与 tasks 严格分离** —— 固定日程（上课、考试）不可被 AI 重排；
//   tasks 是可调整的学习任务，允许 AI 参与安排。
//   这个分离不是洁癖：如果把"周一 8 点数学课"和"复习函数"混在一张表里，
//   AI 重排计划时会把你的课也挪走。所以两张表、两种语义，永不混用。
//
// ★ 数据库位置：与索引库同目录（%APPDATA%\gezhi），**不放库目录**。
//   理由同 P0 的存储决策：库可能在 OneDrive 下，WAL 文件会引发同步冲突。
//
// 本文件只建日历需要的表，不引 packages/db 的全量 schema ——
// 那份 schema 有 vaults/knowledge_points 等外键依赖，界面这一层不需要它们。
const path = require("node:path");
const fs = require("node:fs");

let DatabaseSync = null;
function sqlite() {
  if (!DatabaseSync) DatabaseSync = require("node:sqlite").DatabaseSync;
  return DatabaseSync;
}

/** 事件类型（与 schema.sql 的注释保持一致：class/exam/activity） */
const EVENT_KINDS = ["class", "exam", "activity", "other"];
/** 任务类型（study/review/exam/rest） */
const TASK_KINDS = ["study", "review", "exam", "rest"];

function openCalendarDb(dbPath) {
  const DB = sqlite();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DB(dbPath);
  db.exec("pragma journal_mode = wal");
  db.exec(`
    -- 固定日程：上课、考试、活动。**AI 不可重排**
    create table if not exists cal_events(
      id              text primary key,
      vault           text not null,
      title           text not null,
      kind            text not null default 'other',
      start_at        text not null,
      end_at          text,
      all_day         integer not null default 0,
      location        text,
      repeat          text,                 -- none/daily/weekly/monthly
      remind_before_min integer,
      note            text,
      created_at      text not null
    );
    create index if not exists idx_cal_events_start on cal_events(vault, start_at);

    -- 可调整的学习任务：AI 可以参与安排
    create table if not exists cal_tasks(
      id          text primary key,
      vault       text not null,
      title       text not null,
      kind        text not null default 'study',
      due_at      text,
      est_minutes integer,
      done_at     text,
      source      text not null default 'manual',   -- manual/ai
      goal        text,
      created_at  text not null
    );
    create index if not exists idx_cal_tasks_due on cal_tasks(vault, due_at);

    -- 倒计时：考试、生日、假期。支持公历或农历（农历只存月日，不换算）
    create table if not exists cal_countdowns(
      id           text primary key,
      vault        text not null,
      title        text not null,
      date         text,                    -- 公历 YYYY-MM-DD
      lunar_month  integer,                 -- 农历月（1-12）
      lunar_day    integer,                 -- 农历日（1-30）
      is_leap      integer default 0,
      color        text,
      created_at   text not null
    );
    create index if not exists idx_cal_countdowns_vault on cal_countdowns(vault);
  `);
  return db;
}

/** 生成 id：时间戳 + 随机后缀，足够避免同毫秒冲突，且可读 */
function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------- 事件

function listEvents(db, { vault, from, to }) {
  // from/to 是 ISO 日期字符串；不传则返回全部（一般会传当前月范围）
  const rows = (from && to)
    ? db.prepare("select * from cal_events where vault = ? and start_at >= ? and start_at < ? order by start_at").all(vault, from, to)
    : db.prepare("select * from cal_events where vault = ? order by start_at").all(vault);
  return { ok: true, events: rows };
}

function addEvent(db, { vault, title, kind, startAt, endAt, allDay, location, repeat, remindBeforeMin, note }) {
  if (!title || !String(title).trim()) return { ok: false, error: "标题不能为空" };
  if (!startAt) return { ok: false, error: "必须指定开始时间" };
  const k = EVENT_KINDS.includes(kind) ? kind : "other";
  const id = newId("ev");
  db.prepare(
    `insert into cal_events(id, vault, title, kind, start_at, end_at, all_day, location, repeat, remind_before_min, note, created_at)
     values(?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(id, vault, String(title).trim(), k, startAt, endAt ?? null, allDay ? 1 : 0,
        location ?? null, repeat ?? "none", remindBeforeMin ?? null, note ?? null, new Date().toISOString());
  return { ok: true, id };
}

function updateEvent(db, { id, vault, patch }) {
  const cur = db.prepare("select * from cal_events where id = ? and vault = ?").get(id, vault);
  if (!cur) return { ok: false, error: "找不到这个日程" };
  const map = {
    title: "title", kind: "kind", startAt: "start_at", endAt: "end_at",
    allDay: "all_day", location: "location", repeat: "repeat",
    remindBeforeMin: "remind_before_min", note: "note",
  };
  const sets = [];
  const vals = [];
  for (const [k, col] of Object.entries(map)) {
    if (patch[k] === undefined) continue;
    sets.push(`${col} = ?`);
    let v = patch[k];
    if (k === "allDay") v = v ? 1 : 0;
    vals.push(v ?? null);
  }
  if (!sets.length) return { ok: true, unchanged: true };
  vals.push(id, vault);
  db.prepare(`update cal_events set ${sets.join(", ")} where id = ? and vault = ?`).run(...vals);
  return { ok: true };
}

function deleteEvent(db, { id, vault }) {
  const r = db.prepare("delete from cal_events where id = ? and vault = ?").run(id, vault);
  return { ok: true, removed: Number(r.changes ?? 0) };
}

// ---------------------------------------------------------------- 任务

function listTasks(db, { vault, includeDone = false }) {
  const rows = includeDone
    ? db.prepare("select * from cal_tasks where vault = ? order by coalesce(due_at,'~'), created_at").all(vault)
    : db.prepare("select * from cal_tasks where vault = ? and done_at is null order by coalesce(due_at,'~'), created_at").all(vault);
  return { ok: true, tasks: rows };
}

function addTask(db, { vault, title, kind, dueAt, estMinutes, goal, source = "manual" }) {
  if (!title || !String(title).trim()) return { ok: false, error: "标题不能为空" };
  const k = TASK_KINDS.includes(kind) ? kind : "study";
  const id = newId("tk");
  db.prepare(
    `insert into cal_tasks(id, vault, title, kind, due_at, est_minutes, done_at, source, goal, created_at)
     values(?,?,?,?,?,?,null,?,?,?)`
  ).run(id, vault, String(title).trim(), k, dueAt ?? null, estMinutes ?? null,
        source === "ai" ? "ai" : "manual", goal ?? null, new Date().toISOString());
  return { ok: true, id };
}

function toggleTask(db, { id, vault }) {
  const cur = db.prepare("select * from cal_tasks where id = ? and vault = ?").get(id, vault);
  if (!cur) return { ok: false, error: "找不到这个任务" };
  const done = cur.done_at ? null : new Date().toISOString();
  db.prepare("update cal_tasks set done_at = ? where id = ? and vault = ?").run(done, id, vault);
  return { ok: true, done: Boolean(done) };
}

function deleteTask(db, { id, vault }) {
  const r = db.prepare("delete from cal_tasks where id = ? and vault = ?").run(id, vault);
  return { ok: true, removed: Number(r.changes ?? 0) };
}

// ---------------------------------------------------------------- 倒计时

function listCountdowns(db, { vault }) {
  const rows = db.prepare("select * from cal_countdowns where vault = ? order by coalesce(date,'~')").all(vault);
  return { ok: true, countdowns: rows };
}

function addCountdown(db, { vault, title, date, lunarMonth, lunarDay, isLeap, color }) {
  if (!title || !String(title).trim()) return { ok: false, error: "标题不能为空" };
  const hasGregorian = Boolean(date);
  const hasLunar = lunarMonth && lunarDay;
  if (!hasGregorian && !hasLunar) return { ok: false, error: "要么给公历日期，要么给农历月日" };
  const id = newId("cd");
  db.prepare(
    `insert into cal_countdowns(id, vault, title, date, lunar_month, lunar_day, is_leap, color, created_at)
     values(?,?,?,?,?,?,?,?,?)`
  ).run(id, vault, String(title).trim(), date ?? null,
        lunarMonth ?? null, lunarDay ?? null, isLeap ? 1 : 0, color ?? null, new Date().toISOString());
  return { ok: true, id };
}

function deleteCountdown(db, { id, vault }) {
  const r = db.prepare("delete from cal_countdowns where id = ? and vault = ?").run(id, vault);
  return { ok: true, removed: Number(r.changes ?? 0) };
}

module.exports = {
  openCalendarDb, EVENT_KINDS, TASK_KINDS,
  listEvents, addEvent, updateEvent, deleteEvent,
  listTasks, addTask, toggleTask, deleteTask,
  listCountdowns, addCountdown, deleteCountdown,
};
