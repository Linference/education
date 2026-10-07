const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const rubric = require('../shared/companion-rubric.cjs');
const { assertInsideVault } = require('./vault-fs.cjs');
const { loadBridge } = require('./ai.cjs');
const learning = require('./lib/learning.cjs');
function registerCompanions(ipcMain, app, { getBridge = loadBridge } = {}) {
  let db, sourceDb, active = null;
  const open = () => {
    if (!db) {
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      db = new (require('node:sqlite').DatabaseSync)(path.join(app.getPath('userData'), 'companions.db'));
      db.exec('CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,vault TEXT NOT NULL,role TEXT NOT NULL,at TEXT NOT NULL,data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS reports_vault ON reports(vault,at);');
    }
    return db;
  };
  const vault = p => { const real = assertInsideVault(p.vault, { mustExist: true }); if (!fs.statSync(real).isDirectory()) throw new Error('资料库无效'); return real; };
  ipcMain.handle('companions:roles', () => ({ ok: true, roles: rubric.ROLES, dimensions: rubric.DIMENSIONS }));
  ipcMain.handle('companions:history', (_e, p = {}) => {
    try { const current = vault(p); const rows = p.roleId ? open().prepare('SELECT data FROM reports WHERE vault=? AND role=? ORDER BY at DESC LIMIT 20').all(current,p.roleId) : open().prepare('SELECT data FROM reports WHERE vault=? ORDER BY at DESC LIMIT 100').all(current); return { ok: true, reports: rows.map(r => JSON.parse(r.data)) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('companions:evaluate', async (_e, p = {}) => {
    if (active) return { ok: false, error: '正在评估，请等待或停止当前评估。' };
    const controller = new AbortController(); active = controller;
    let timer;
    try {
      const currentVault = vault(p);
      if (typeof p.topic !== 'string' || !p.topic.trim() || p.topic.length > 200) throw new Error('请填写讲解主题（不超过 200 字）');
      if (typeof p.transcript !== 'string' || p.transcript.trim().length < 10 || p.transcript.length > 12000) throw new Error('请提供 10 至 12000 字的讲解');
      let sourceRef = null, previous = null;
      if (p.sourceId) {
        const file = path.join(app.getPath('userData'), 'learning.db');
        if (!fs.existsSync(file)) throw new Error('请先选择学习资料。');
        sourceDb ||= learning.openLearningDb(file);
        sourceRef = learning.sourceById(sourceDb, currentVault, p.sourceId);
      }
      if (p.previousId) {
        const row = open().prepare('SELECT data FROM reports WHERE vault=? AND role=? AND id=?').get(currentVault, p.roleId, p.previousId);
        previous = row ? JSON.parse(row.data) : null;
        if (!previous || previous.topic !== p.topic || (previous.sourceRef?.id || null) !== (sourceRef?.id || null)) throw new Error('再次讲解需要使用原来的主题、角色和资料章节。');
      }
      const task = rubric.prompt({ ...p, context: sourceRef?.text ?? p.context, sourceLocation: sourceRef ? sourceRef.name + ' · ' + sourceRef.section : '', previous, focus: String(p.focus || '').slice(0,1800) }), bridge = await getBridge();
      if (controller.signal.aborted) throw new Error('评估已停止');
      timer = setTimeout(() => controller.abort(), 120000);
      let final = '', text = '';
      for await (const ev of bridge.runHeadless({ task, cwd: currentVault, signal: controller.signal })) {
        if (ev.type === 'tool_call') { controller.abort(); throw new Error('本次评估请求了工具操作，已停止；请重新讲解。'); }
        if (ev.type === 'text') text += ev.text || '';
        if (ev.type === 'final') final = ev.text || '';
      }
      if (controller.signal.aborted) throw new Error('评估已停止或超时，未保存评分。');
      // Switching libraries while awaiting a response must never write to the new library.
      if (vault(p) !== currentVault) throw new Error('资料库已切换，本次评估未保存。');
      const assessment = rubric.normalize(final || text, p.transcript);
      const report = { id: randomUUID(), roleId: p.roleId, topic: p.topic, transcript: p.transcript, referenceName: String(p.referenceName || '').slice(0,200), at: new Date().toISOString(), ...assessment };
      Object.assign(report, { sourceRef, referenceName: sourceRef ? sourceRef.name + ' · ' + sourceRef.section : report.referenceName, previousId: previous?.id || null,
        comparison: previous ? assessment.dimensions.flatMap(d => { const before = previous.dimensions.find(x => x.id === d.id)?.score; return typeof before === 'number' && typeof d.score === 'number' ? [{ id: d.id, before, after: d.score, delta: d.score-before }] : []; }) : [] });
      open().prepare('INSERT INTO reports VALUES(?,?,?,?,?)').run(report.id,currentVault,p.roleId,report.at,JSON.stringify(report));
      return { ok: true, report };
    } catch (e) {
      const message=String(e.message || e);
      return { ok:false,error:/Insufficient Balance|QUOTA/i.test(message) ? '当前 AI 服务余额或额度不足。请在 DeepSeek Harness 中检查账号额度，或切换已配置的模型后重试；本次未生成或保存评分。' : /unauthorized|not authenticated|login required/i.test(message) ? 'AI 账号尚未登录或登录已过期，请打开 DeepSeek Harness 完成登录后重试。' : message };
    }
    finally { clearTimeout(timer); if (active === controller) active = null; }
  });
  ipcMain.handle('companions:stop', () => { active?.abort(); return { ok: true }; });
  app.once('before-quit', () => { active?.abort(); db?.close(); sourceDb?.close(); });
}
module.exports = { registerCompanions };
