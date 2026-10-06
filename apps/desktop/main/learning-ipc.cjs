const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const learning = require('./lib/learning.cjs');
const bank = require('./lib/bank.cjs');
const cal = require('./lib/calendar.cjs');
const { assertInsideVault } = require('./vault-fs.cjs');

function registerLearning(ipcMain, app) {
  let db, bankDb, calDb;
  const open = () => {
    if (!db) { fs.mkdirSync(app.getPath('userData'), { recursive: true }); db = learning.openLearningDb(path.join(app.getPath('userData'), 'learning.db')); }
    return db;
  };
  const bankOps = {
    listQuestions: p => { bankDb ||= bank.openBankDb(path.join(app.getPath('userData'), 'bank.db')); return bank.listQuestions(bankDb, p); },
    byIds: p => { bankDb ||= bank.openBankDb(path.join(app.getPath('userData'), 'bank.db')); return bank.getQuestionsByIds(bankDb, p); },
  };
  const wrap = fn => async (_event, p = {}) => {
    try { if (typeof p.vault !== 'string') throw new Error('请先打开资料库'); const real = assertInsideVault(p.vault, { mustExist: true }); if (!fs.statSync(real).isDirectory()) throw new Error('资料库路径无效'); return await fn({ ...p, vault: real }); }
    catch (e) { return { ok: false, error: e.message }; }
  };
  ipcMain.handle('learning:catalog', wrap(p => learning.catalog(open(), bankOps, p.vault, p.includeActivityId, p.includeExamples === true)));
  ipcMain.handle('learning:summary', wrap(p => learning.summary(open(), bankOps, p.vault, Date.now(), p.includeExamples === true)));
  ipcMain.handle('learning:submit', wrap(p => learning.submit(open(), bankOps, p)));
  ipcMain.handle('learning:annotate', wrap(p => learning.annotate(open(), p)));
  ipcMain.handle('learning:lab', wrap(async p => {
    const models = await import(pathToFileURL(path.join(__dirname, '../shared/lab-models.mjs')).href);
    const params = models.parameters(p.kind, p.params);
    const titles = { quadratic: '函数预测', force: '受力与加速度预测', probability: '独立事件概率预测' };
    const concept = { quadratic: '二次函数', force: '牛顿第二定律', probability: '独立事件' }[p.kind];
    let answer, prompt, explanation;
    if (p.kind === 'quadratic') { answer = models.quadratic(params.x, params); prompt = 'y = ' + params.a + ' × (x − (' + params.h + '))² + (' + params.k + ')。预测 x = ' + params.x + ' 时的 y 值。'; explanation = '将 x 代入顶点式，先计算括号与平方，再乘 a、加 k，得到 y = ' + answer + '。a = 0 时退化为常函数。'; }
    if (p.kind === 'force') { const m = models.motion(params); answer = m.acceleration; prompt = '水平拉力 ' + params.force + ' N，质量 ' + params.mass + ' kg，摩擦系数 ' + params.friction + '，物体从静止开始。预测加速度（m/s²，保留两位小数）。'; explanation = '简化模型：静摩擦和滑动摩擦系数相同，g = 9.8 m/s²。摩擦力为 min(F, μmg) = ' + m.friction.toFixed(2) + ' N；合力为 ' + m.netForce.toFixed(2) + ' N；a = F合/m = ' + answer.toFixed(2) + ' m/s²。'; }
    if (p.kind === 'probability') { answer = models.probability(params) * 100; prompt = '一次事件成功概率为 ' + params.p + '，独立重复 ' + params.n + ' 次。预测至少成功一次的概率（填写百分数数值，例如 75）。'; explanation = '用对立事件计算：P(至少一次) = 1 − (1 − p)ⁿ = ' + answer.toFixed(2) + '%。抽样频率会波动，不保证随每次增加样本都更接近理论值。'; }
    const a = { id: 'lab:' + randomUUID(), mode: 'lab', concept, title: titles[p.kind], prompt, answer, explanation, options: [], grading: 'numeric', tolerance: 0.05, source: learning.content.source, labKind: p.kind, params, hint: '先写出关系式，检查输入量的单位，再代入计算。' };
    if (process.env.GEZHI_DEMO_EN === '1') {
      const labels = require('../shared/demo-en.json');
      a.concept = labels[a.concept] || a.concept;
      a.title = { quadratic: 'Predict the function', force: 'Predict the acceleration', probability: 'Predict the probability' }[p.kind];
      a.hint = 'Write the relation, check the units, then substitute.';
      if (p.kind === 'quadratic') { a.prompt = `For y = ${params.a}(x − (${params.h}))² + (${params.k}), predict y at x = ${params.x}.`; a.explanation = `Substitute x, square the bracket, multiply by a and add k. The result is y = ${answer}. At a = 0 the function is constant.`; }
      if (p.kind === 'force') { const m = models.motion(params); a.prompt = `Force: ${params.force} N; mass: ${params.mass} kg; friction coefficient: ${params.friction}. Starting at rest, predict acceleration in m/s² to two decimal places.`; a.explanation = `Assume equal static and kinetic friction coefficients and g = 9.8 m/s². Friction is min(F, μmg) = ${m.friction.toFixed(2)} N. Net force is ${m.netForce.toFixed(2)} N; a = Fnet/m = ${answer.toFixed(2)} m/s².`; }
      if (p.kind === 'probability') { a.prompt = `Success probability p = ${params.p}, repeated independently ${params.n} times. Predict the chance of at least one success, as a percentage.`; a.explanation = `Use the complement: P(at least once) = 1 − (1 − p)ⁿ = ${answer.toFixed(2)}%. Sample frequency fluctuates and need not approach theory with every added sample.`; }
    }
    // Bound unfinished drafts; saved attempts retain the full immutable snapshot.
    open().prepare('INSERT INTO learning_labs VALUES(?,?,?)').run(a.id, p.vault, JSON.stringify(a));
    open().prepare('DELETE FROM learning_labs WHERE vault=? AND rowid NOT IN (SELECT rowid FROM learning_labs WHERE vault=? ORDER BY rowid DESC LIMIT 100)').run(p.vault, p.vault);
    return { ok: true, activity: learning.content.publicActivity(a) };
  }));
  ipcMain.handle('learning:schedule', wrap(p => {
    const s = learning.summary(open(), bankOps, p.vault);
    const node = s.evidence.find(n => n.id === p.concept);
    if (!node || !node.total) throw new Error('完成一次练习后，才可以安排复测。');
    calDb ||= cal.openCalendarDb(path.join(app.getPath('userData'), 'calendar.db'));
    const previous = open().prepare('SELECT task_id FROM learning_reviews WHERE vault=? AND concept=?').get(p.vault, p.concept);
    if (previous) { const task = calDb.prepare('SELECT id FROM cal_tasks WHERE id=? AND vault=? AND done_at IS NULL').get(previous.task_id, p.vault); if (task) return { ok: true, id: task.id, duplicate: true }; }
    const dueAt = new Date(Date.now() + 86400000).toISOString();
    const r = cal.addTask(calDb, { vault: p.vault, title: '复测：' + node.id, kind: 'review', dueAt, estMinutes: 10, source: 'manual', goal: '学习证据地图：' + node.reason });
    if (!r.ok) return r;
    open().prepare('INSERT OR REPLACE INTO learning_reviews VALUES(?,?,?)').run(p.vault, node.id, r.id);
    return { ...r, dueAt };
  }));
  app.once('before-quit', () => { db?.close(); bankDb?.close(); calDb?.close(); });
}
module.exports = { registerLearning };
