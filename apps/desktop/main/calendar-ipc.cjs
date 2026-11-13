// Calendar / plan IPC
//
// The database lives at %APPDATA%\gezhi\calendar.db (same directory as the
// index database). It must not live in the library directory — the library may
// be under OneDrive, and WAL files would cause sync conflicts.
const path = require("node:path");
const cal = require("./lib/calendar.cjs");

function registerCalendar(ipcMain, getWindow, app) {
  const dbPath = path.join(app.getPath("userData"), "calendar.db");
  let db = null;
  const open = () => {
    if (!db) db = cal.openCalendarDb(dbPath);
    return db;
  };

  /**
   * Uniform wrapper.
   *
   * ★ Why this layer is necessary: on an uncaught exception, ipcMain.handle
   *   sends the renderer something vague like "could not be cloned", and any
   *   non-cloneable value in the returned object becomes an **empty {}** —
   *   the assertion !r.ok passes and r.error is undefined, losing the whole
   *   error message.
   *   (The file operations code already hit this pitfall, so wrap it from the
   *   start.)
   */
  const wrap = (fn) => (_e, arg) => {
    try {
      const r = fn(arg ?? {});
      if (r && typeof r === "object" && typeof r.ok === "boolean") return r;
      return { ok: true, result: r };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  };

  // Fetch all of the current library's calendar data at once (for UI init, to reduce round trips)
  ipcMain.handle("cal:load", wrap(({ vault, from, to }) => {
    const d = open();
    return {
      ok: true,
      events: cal.listEvents(d, { vault, from, to }).events,
      tasks: cal.listTasks(d, { vault, includeDone: false }).tasks,
      countdowns: cal.listCountdowns(d, { vault }).countdowns,
      dbPath,
    };
  }));

  ipcMain.handle("cal:addEvent", wrap((p) => cal.addEvent(open(), p)));
  ipcMain.handle("cal:updateEvent", wrap((p) => cal.updateEvent(open(), p)));
  ipcMain.handle("cal:deleteEvent", wrap((p) => cal.deleteEvent(open(), p)));

  ipcMain.handle("cal:addTask", wrap((p) => cal.addTask(open(), p)));
  ipcMain.handle("cal:toggleTask", wrap((p) => cal.toggleTask(open(), p)));
  ipcMain.handle("cal:deleteTask", wrap((p) => cal.deleteTask(open(), p)));

  ipcMain.handle("cal:addCountdown", wrap((p) => cal.addCountdown(open(), p)));
  ipcMain.handle("cal:deleteCountdown", wrap((p) => cal.deleteCountdown(open(), p)));

  /** Database info (for the size panel / troubleshooting) */
  ipcMain.handle("cal:info", wrap(() => {
    const fs = require("node:fs");
    let size = 0;
    try { size = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0; } catch { /* ignore */ }
    return { ok: true, path: dbPath, size, exists: size > 0 };
  }));
}

module.exports = { registerCalendar };
