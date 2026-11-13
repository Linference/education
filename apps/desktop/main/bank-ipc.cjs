// IPC for the question bank and paper assembly
//
// The database lives at %APPDATA%\gezhi\bank.db (same directory as the index
// and calendar databases). It is not kept in the library directory — the
// library may be under OneDrive, and WAL files would cause sync conflicts.
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

  /** Uniform wrapper: exceptions must also return {ok,error}; the renderer must never receive an empty object */
  const wrap = (fn) => (_e, arg) => {
    try {
      const r = fn(arg ?? {});
      if (r && typeof r === "object" && typeof r.ok === "boolean") return r;
      return { ok: true, result: r };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  };

  // ---- Queries ----
  ipcMain.handle("bank:list", wrap((p) => bank.listQuestions(open(), p)));
  ipcMain.handle("bank:stats", wrap((p) => bank.bankStats(open(), p)));
  ipcMain.handle("bank:byIds", wrap((p) => bank.getQuestionsByIds(open(), p)));

  // ---- Create / update / delete ----
  ipcMain.handle("bank:add", wrap((p) => bank.addQuestion(open(), p)));
  ipcMain.handle("bank:addMany", wrap((p) => bank.addQuestions(open(), p)));
  ipcMain.handle("bank:update", wrap((p) => bank.updateQuestion(open(), p)));
  ipcMain.handle("bank:delete", wrap((p) => bank.deleteQuestion(open(), p)));

  // ---- Import from a Markdown file ----
  //
  // Parse first and tell the user "how many questions were found", **without
  // importing yet**: let the user glance before deciding. Importing hundreds
  // of wrong questions straight in would be painful to clean up.
  ipcMain.handle("bank:parseFile", wrap(({ filePath }) => {
    if (!filePath) return { ok: false, error: "No file path given" };
    const st = fs.statSync(filePath);
    if (st.isDirectory()) return { ok: false, error: "This is a directory" };
    if (st.size > 8 * 1024 * 1024) return { ok: false, error: "File exceeds 8 MB; split it into smaller files before importing" };
    const text = fs.readFileSync(filePath, "utf8");
    const r = parseQuestionsFromMarkdown(text);
    return { ok: true, questions: r.questions, warnings: r.warnings, count: r.questions.length };
  }));

  // Read browser File contents rather than the removed Electron File.path.
  ipcMain.handle("bank:parseText", wrap(({ text }) => {
    if (typeof text !== 'string') return { ok: false, error: 'No text to parse' };
    if (Buffer.byteLength(text, 'utf8') > 8 * 1024 * 1024) return { ok: false, error: 'File exceeds 8 MB; split it into smaller files before importing' };
    const r = parseQuestionsFromMarkdown(text);
    return { ...r, count: r.questions.length };
  }));
  ipcMain.handle('bank:parseDocument', async (_e, p) => {
    try { return await require('./lib/bank-document.cjs').parseDocument(p || {}); }
    catch (e) { return { ok: false, error: e.message }; }
  });

  // ---- Export to Markdown (turn bank questions into an editable document) ----
  ipcMain.handle("bank:toMarkdown", wrap(({ vault, ids }) => {
    const r = bank.getQuestionsByIds(open(), { vault, ids });
    return { ok: true, markdown: questionsToMarkdown(r.questions), count: r.questions.length };
  }));

  // ---- Paper archive ----
  ipcMain.handle("bank:savePaper", wrap((p) => bank.savePaper(open(), p)));
  ipcMain.handle("bank:papers", wrap((p) => bank.listPapers(open(), p)));
  ipcMain.handle("bank:deletePaper", wrap((p) => bank.deletePaper(open(), p)));

  // ---- Bank info ----
  ipcMain.handle("bank:info", wrap(() => {
    let size = 0;
    try { size = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0; } catch { /* ignore */ }
    return { ok: true, path: dbPath, size, exists: size > 0 };
  }));
}

module.exports = { registerBank };
