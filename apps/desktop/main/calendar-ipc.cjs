// 日历 / 计划的 IPC
//
// 数据库落在 %APPDATA%\gezhi\calendar.db（与索引库同目录）。
// 存库目录里不行 —— 库可能在 OneDrive 下，WAL 文件会引发同步冲突。
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
   * 统一的包装。
   *
   * ★ 为什么必须包一层：ipcMain.handle 遇到未捕获异常时，
   *   渲染进程收到的是模糊的 "could not be cloned" 之类，
   *   而且返回对象里若有不可克隆的值会变成**空对象 {}** ——
   *   断言 !r.ok 会通过、r.error 是 undefined，错误信息全丢。
   *   （文件操作那边踩过这个坑，这里一开始就包好。）
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

  // 一次拿齐当前库的全部日历数据（界面初始化用，减少来回）
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

  /** 数据库信息（体积面板/排查用） */
  ipcMain.handle("cal:info", wrap(() => {
    const fs = require("node:fs");
    let size = 0;
    try { size = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0; } catch { /* 忽略 */ }
    return { ok: true, path: dbPath, size, exists: size > 0 };
  }));
}

module.exports = { registerCalendar };
