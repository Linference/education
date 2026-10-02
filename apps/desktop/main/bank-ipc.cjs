// 题库组卷的 IPC
//
// 数据库落在 %APPDATA%\gezhi\bank.db（与索引库、日历库同目录）。
// 不放库目录里 —— 库可能在 OneDrive 下，WAL 文件会引发同步冲突。
const path = require("node:path");
const fs = require("node:fs");
const bank = require("./lib/bank.cjs");
const { parseQuestionsFromMarkdown, questionsToMarkdown } = require("./lib/bank-md.cjs");

function registerBank(ipcMain, getWindow, app) {
  const dbPath = path.join(app.getPath("userData"), "bank.db");
  let db = null;
  const open = () => {
    if (!db) db = bank.openBankDb(dbPath);
    return db;
  };

  /** 统一包装：异常也要返回 {ok,error}，不能让渲染进程收到空对象 */
  const wrap = (fn) => (_e, arg) => {
    try {
      const r = fn(arg ?? {});
      if (r && typeof r === "object" && typeof r.ok === "boolean") return r;
      return { ok: true, result: r };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  };

  // ---- 查询 ----
  ipcMain.handle("bank:list", wrap((p) => bank.listQuestions(open(), p)));
  ipcMain.handle("bank:stats", wrap((p) => bank.bankStats(open(), p)));
  ipcMain.handle("bank:byIds", wrap((p) => bank.getQuestionsByIds(open(), p)));

  // ---- 增删改 ----
  ipcMain.handle("bank:add", wrap((p) => bank.addQuestion(open(), p)));
  ipcMain.handle("bank:addMany", wrap((p) => bank.addQuestions(open(), p)));
  ipcMain.handle("bank:update", wrap((p) => bank.updateQuestion(open(), p)));
  ipcMain.handle("bank:delete", wrap((p) => bank.deleteQuestion(open(), p)));

  // ---- 从 Markdown 文件导入 ----
  //
  // 先解析、把"解析出几道题"告诉用户，**不直接入库**：
  // 让用户看一眼再决定导不导。直接入库几百道错题，清理起来很痛苦。
  ipcMain.handle("bank:parseFile", wrap(({ filePath }) => {
    if (!filePath) return { ok: false, error: "没有给文件路径" };
    const st = fs.statSync(filePath);
    if (st.isDirectory()) return { ok: false, error: "这是一个目录" };
    if (st.size > 8 * 1024 * 1024) return { ok: false, error: "文件超过 8 MB，建议拆成几个再导入" };
    const text = fs.readFileSync(filePath, "utf8");
    const r = parseQuestionsFromMarkdown(text);
    return { ok: true, questions: r.questions, warnings: r.warnings, count: r.questions.length };
  }));

  // ---- 导出成 Markdown（把库里的题变成可编辑文档） ----
  ipcMain.handle("bank:toMarkdown", wrap(({ vault, ids }) => {
    const r = bank.getQuestionsByIds(open(), { vault, ids });
    return { ok: true, markdown: questionsToMarkdown(r.questions), count: r.questions.length };
  }));

  // ---- 试卷留档 ----
  ipcMain.handle("bank:savePaper", wrap((p) => bank.savePaper(open(), p)));
  ipcMain.handle("bank:papers", wrap((p) => bank.listPapers(open(), p)));
  ipcMain.handle("bank:deletePaper", wrap((p) => bank.deletePaper(open(), p)));

  // ---- 库信息 ----
  ipcMain.handle("bank:info", wrap(() => {
    let size = 0;
    try { size = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0; } catch { /* 忽略 */ }
    return { ok: true, path: dbPath, size, exists: size > 0 };
  }));
}

module.exports = { registerBank };
