// Calendar / plan data layer (SQLite)
//
// ★ The single most important design decision (verbatim from schema.sql):
//   **events and tasks are strictly separated** — fixed schedule items
//   (classes, exams) must not be reordered by AI; tasks are adjustable study
//   items that AI may help arrange.
//   This separation is not pedantry: if "Monday 8am math class" and "review
//   functions" were mixed in one table, AI rescheduling would also move your
//   class. So two tables, two meanings, never mixed.
//
// ★ Database location: same directory as the index database (%APPDATA%\gezhi),
//   **not in the library directory**. Same reasoning as the P0 storage
//   decision: the library may be under OneDrive, and WAL files would cause
//   sync conflicts.
//
// This file only creates the tables the calendar needs and does not import the
// full packages/db schema — that schema has vaults/knowledge_points foreign-key
// dependencies this UI layer does not need.
const path = require("node:path");
const fs = require("node:fs");

let DatabaseSync = null;
function sqlite() {
  if (!DatabaseSync) DatabaseSync = require("node:sqlite").DatabaseSync;
  return DatabaseSync;
}

/** Event kinds (kept in line with the schema.sql comment: class/exam/activity) */
const EVENT_KINDS = ["class", "exam", "activity", "other"];
/** Task kinds (study/review/exam/rest) */
const TASK_KINDS = ["study", "review", "exam", "rest"];

function openCalendarDb(dbPath) {
  const DB = sqlite();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DB(dbPath);
  db.exec("pragma journal_mode = wal");
  db.exec(`
    -- Fixed schedule items: classes, exams, activities. **AI must not reorder**
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

    -- Adjustable study tasks: AI may help arrange them
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

    -- Countdowns: exams, birthdays, holidays. Gregorian or lunar supported
    -- (lunar stores only month and day; no conversion is done)
    create table if not exists cal_countdowns(
      id           text primary key,
      vault        text not null,
      title        text not null,
      date         text,                    -- Gregorian YYYY-MM-DD
      lunar_month  integer,                 -- lunar month (1-12)
      lunar_day    integer,                 -- lunar day (1-30)
      is_leap      integer default 0,
      color        text,
      created_at   text not null
    );
    create index if not exists idx_cal_countdowns_vault on cal_countdowns(vault);
  `);
  return db;
}

/** Generate an id: timestamp + random suffix, readable and enough to avoid same-millisecond collisions */
function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------- Events

function listEvents(db, { vault, from, to }) {
  // from/to are ISO date strings; if omitted, return everything (usually the current month range is passed)
  const rows = (from && to)
    ? db.prepare("select * from cal_events where vault = ? and start_at >= ? and start_at < ? order by start_at").all(vault, from, to)
    : db.prepare("select * from cal_events where vault = ? order by start_at").all(vault);
  return { ok: true, events: rows };
}

function addEvent(db, { vault, title, kind, startAt, endAt, allDay, location, repeat, remindBeforeMin, note }) {
  if (!title || !String(title).trim()) return { ok: false, error: "Title cannot be empty" };
  if (!startAt) return { ok: false, error: "Start time is required" };
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
  if (!cur) return { ok: false, error: "Event not found" };
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

// ---------------------------------------------------------------- Tasks

function listTasks(db, { vault, includeDone = false }) {
  const rows = includeDone
    ? db.prepare("select * from cal_tasks where vault = ? order by coalesce(due_at,'~'), created_at").all(vault)
    : db.prepare("select * from cal_tasks where vault = ? and done_at is null order by coalesce(due_at,'~'), created_at").all(vault);
  return { ok: true, tasks: rows };
}

function addTask(db, { vault, title, kind, dueAt, estMinutes, goal, source = "manual" }) {
  if (!title || !String(title).trim()) return { ok: false, error: "Title cannot be empty" };
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
  if (!cur) return { ok: false, error: "Task not found" };
  const done = cur.done_at ? null : new Date().toISOString();
  db.prepare("update cal_tasks set done_at = ? where id = ? and vault = ?").run(done, id, vault);
  return { ok: true, done: Boolean(done) };
}

function deleteTask(db, { id, vault }) {
  const r = db.prepare("delete from cal_tasks where id = ? and vault = ?").run(id, vault);
  return { ok: true, removed: Number(r.changes ?? 0) };
}

// ---------------------------------------------------------------- Countdowns

function listCountdowns(db, { vault }) {
  const rows = db.prepare("select * from cal_countdowns where vault = ? order by coalesce(date,'~')").all(vault);
  return { ok: true, countdowns: rows };
}

function addCountdown(db, { vault, title, date, lunarMonth, lunarDay, isLeap, color }) {
  if (!title || !String(title).trim()) return { ok: false, error: "Title cannot be empty" };
  const hasGregorian = Boolean(date);
  const hasLunar = lunarMonth && lunarDay;
  if (!hasGregorian && !hasLunar) return { ok: false, error: "Provide either a Gregorian date or a lunar month and day" };
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
