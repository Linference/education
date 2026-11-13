const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomInt } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const learning = require('./lib/learning.cjs');
const bank = require('./lib/bank.cjs');
const cal = require('./lib/calendar.cjs');
const { assertInsideVault } = require('./vault-fs.cjs');
const material = require('./lib/study-material.cjs');

function registerLearning(ipcMain, app) {
  let db, bankDb, calDb, reportDb;
  const open = () => {
    if (!db) { fs.mkdirSync(app.getPath('userData'), { recursive: true }); db = learning.openLearningDb(path.join(app.getPath('userData'), 'learning.db')); }
    return db;
  };
  const bankOps = {
    listQuestions: p => { bankDb ||= bank.openBankDb(path.join(app.getPath('userData'), 'bank.db')); return bank.listQuestions(bankDb, p); },
    byIds: p => { bankDb ||= bank.openBankDb(path.join(app.getPath('userData'), 'bank.db')); return bank.getQuestionsByIds(bankDb, p); },
  };
  const wrap = fn => async (_event, p = {}) => {
    try { if (typeof p.vault !== 'string') throw new Error('Please open a library first'); const real = assertInsideVault(p.vault, { mustExist: true }); if (!fs.statSync(real).isDirectory()) throw new Error('Invalid library path'); return await fn({ ...p, vault: real }); }
    catch (e) { return { ok: false, error: e.message }; }
  };
  ipcMain.handle('learning:catalog', wrap(p => learning.catalog(open(), bankOps, p.vault, p.includeActivityId, p.includeExamples === true)));
  ipcMain.handle('learning:material', wrap(async p => {
    const filePath = assertInsideVault(p.path, { mustExist: true });
    const relative = path.relative(p.vault, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('The material is not in the specified library.');
    const result = await material.readMaterial({ filePath, draftText: p.draftText, pageStart: p.pageStart, pageEnd: p.pageEnd });
    // A library switch while parsing must not save under the new library.
    assertInsideVault(p.vault, { mustExist: true });
    assertInsideVault(filePath, { mustExist: true });
    for (const source of result.sources) learning.saveSource(open(), p.vault, source);
    return { ok: true, ...result };
  }));
  ipcMain.handle('learning:source', wrap(p => ({ ok: true, source: learning.sourceById(open(), p.vault, p.sourceId) })));
  ipcMain.handle('learning:excerpt', wrap(p => ({ ok: true, source: learning.saveSource(open(), p.vault, material.excerptSource(learning.sourceById(open(), p.vault, p.sourceId), p.text)) })));
  ipcMain.handle('learning:createTask', wrap(p => {
    const source = learning.sourceById(open(), p.vault, p.sourceId), activity = material.studyActivity(source, p.mode, p.focus);
    open().prepare('INSERT OR IGNORE INTO learning_labs VALUES(?,?,?)').run(activity.id, p.vault, JSON.stringify(activity));
    return { ok: true, activity: learning.content.publicActivity(activity) };
  }));
  ipcMain.handle('learning:summary', wrap(p => {
    const result = learning.summary(open(), bankOps, p.vault, Date.now(), p.includeExamples === true);
    const reportFile = path.join(app.getPath('userData'), 'companions.db');
    const reports = [];
    if (fs.existsSync(reportFile)) {
      reportDb ||= new (require('node:sqlite').DatabaseSync)(reportFile, { readOnly: true });
      for (const row of reportDb.prepare('SELECT data FROM reports WHERE vault=? ORDER BY at DESC').all(p.vault)) reports.push(JSON.parse(row.data));
    }
    return learning.linkReports(result, reports);
  }));
  ipcMain.handle('learning:submit', wrap(p => learning.submit(open(), bankOps, p)));
  ipcMain.handle('learning:annotate', wrap(async p => {
    if (p.observation === undefined) return learning.annotate(open(), p);
    const row = open().prepare('SELECT * FROM learning_attempts WHERE vault=? AND id=?').get(p.vault, p.id);
    if (!row || row.mode !== 'lab') throw new Error('Lab record not found.');
    const data = JSON.parse(row.data), models = await import(pathToFileURL(path.join(__dirname, '../shared/lab-models.mjs')).href);
    let measurement;
    if (data.labKind === 'quadratic' && p.measurement?.revealed === true) measurement = { kind: 'quadratic', y: models.quadratic(data.params.x, data.params), vertex: { x: data.params.h, y: data.params.k }, revealed: true };
    if (data.labKind === 'force' && p.measurement?.time === 3) measurement = { kind: 'force', time: 3, ...models.motion(data.params, 3) };
    if (data.labKind === 'probability' && Number.isInteger(p.measurement?.count) && p.measurement.count >= 1 && p.measurement.count <= 10000 && Number.isInteger(data.sampleSeed)) measurement = { kind: 'probability', theoretical: models.probability(data.params), seedStart: data.sampleSeed, ...models.sampleTrials(data.params, p.measurement.count, data.sampleSeed) };
    if (!measurement) throw new Error('Complete the graph verification, motion run, or probability sampling before saving the observation.');
    const result = learning.annotate(open(), p);
    Object.assign(result.attempt, { measurement, labVerified: true });
    const saved = JSON.parse(open().prepare('SELECT data FROM learning_attempts WHERE vault=? AND id=?').get(p.vault, p.id).data);
    Object.assign(saved, { measurement, labVerified: true });
    open().prepare('UPDATE learning_attempts SET data=? WHERE vault=? AND id=?').run(JSON.stringify(saved), p.vault, p.id);
    return result;
  }));
  ipcMain.handle('learning:lab', wrap(async p => {
    const models = await import(pathToFileURL(path.join(__dirname, '../shared/lab-models.mjs')).href);
    const params = models.parameters(p.kind, p.params);
    const sourceRef = p.sourceId ? learning.sourceById(open(), p.vault, p.sourceId) : null;
    if (!sourceRef && p.example !== true) throw new Error('Select learning material first, or explicitly enable the built-in example.');
    if (sourceRef && !sourceRef.labs.some(l => l.kind === p.kind)) throw new Error('The current material has no match for this lab model; please choose the relevant section.');
    if (p.previousLabId) {
      const prior = open().prepare('SELECT data FROM learning_attempts WHERE vault=? AND id=? AND mode=?').get(p.vault, p.previousLabId, 'lab');
      const data = prior && JSON.parse(prior.data);
      if (!data?.labVerified || data.labKind !== p.kind || (data.sourceRef?.id || null) !== (sourceRef?.id || null)) throw new Error('A control experiment requires a completed round of the experiment under the same material.');
      if (Object.keys(params).filter(key => params[key] !== data.params[key]).length !== 1) throw new Error('A control experiment must change exactly one parameter.');
    }
    const titles = { quadratic: 'Predict the function', force: 'Predict the acceleration', probability: 'Predict the probability' };
    const concept = { quadratic: 'Quadratic functions', force: "Newton's second law", probability: 'Independent events' }[p.kind];
    let answer, prompt, explanation;
    if (p.kind === 'quadratic') { answer = models.quadratic(params.x, params); prompt = 'y = ' + params.a + ' × (x − (' + params.h + '))² + (' + params.k + '). Predict y at x = ' + params.x + '.'; explanation = 'Substitute x into the vertex form: compute the bracket and its square, then multiply by a and add k, giving y = ' + answer + '. When a = 0 the function degenerates to a constant.'; }
    if (p.kind === 'force') { const m = models.motion(params); answer = m.acceleration; prompt = 'A horizontal pull of ' + params.force + ' N, a mass of ' + params.mass + ' kg, a friction coefficient of ' + params.friction + ', starting from rest. Predict the acceleration (m/s², to two decimal places).'; explanation = 'Simplified model: static and kinetic friction coefficients are equal, g = 9.8 m/s². The friction force is min(F, μmg) = ' + m.friction.toFixed(2) + ' N; the net force is ' + m.netForce.toFixed(2) + ' N; a = Fnet/m = ' + answer.toFixed(2) + ' m/s².'; }
    if (p.kind === 'probability') { answer = models.probability(params) * 100; prompt = 'An event succeeds with probability ' + params.p + ', repeated independently ' + params.n + ' times. Predict the probability of at least one success (enter a percentage, e.g. 75).'; explanation = 'Use the complement: P(at least once) = 1 − (1 − p)ⁿ = ' + answer.toFixed(2) + '%. The sample frequency fluctuates; adding samples does not guarantee closer agreement with the theoretical value every time.'; }
    const a = { id: 'lab:' + randomUUID(), mode: 'lab', concept, title: titles[p.kind], prompt, answer, explanation, options: [], grading: 'numeric', tolerance: 0.05, source: learning.content.source, labKind: p.kind, params, hint: 'First write the relation, check the units of the inputs, then substitute and compute.' };
    Object.assign(a, { sourceRef, source: sourceRef ? sourceRef.name + ' · ' + sourceRef.section : learning.content.source,
      sampleSeed: randomInt(0, 0x100000000), previousLabId: p.previousLabId || null });
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
    open().prepare("DELETE FROM learning_labs WHERE vault=? AND id LIKE 'lab:%' AND rowid NOT IN (SELECT rowid FROM learning_labs WHERE vault=? AND id LIKE 'lab:%' ORDER BY rowid DESC LIMIT 100)").run(p.vault, p.vault);
    return { ok: true, activity: learning.content.publicActivity(a) };
  }));
  ipcMain.handle('learning:schedule', wrap(p => {
    const s = learning.summary(open(), bankOps, p.vault);
    const node = s.evidence.find(n => n.id === p.concept);
    if (!node || !node.total) throw new Error('Complete an exercise before scheduling a retest.');
    calDb ||= cal.openCalendarDb(path.join(app.getPath('userData'), 'calendar.db'));
    const previous = open().prepare('SELECT task_id FROM learning_reviews WHERE vault=? AND concept=?').get(p.vault, p.concept);
    if (previous) { const task = calDb.prepare('SELECT id FROM cal_tasks WHERE id=? AND vault=? AND done_at IS NULL').get(previous.task_id, p.vault); if (task) return { ok: true, id: task.id, duplicate: true }; }
    const dueAt = new Date(Date.now() + 86400000).toISOString();
    const r = cal.addTask(calDb, { vault: p.vault, title: 'Retest: ' + node.id, kind: 'review', dueAt, estMinutes: 10, source: 'manual', goal: 'Learning evidence map: ' + node.reason });
    if (!r.ok) return r;
    open().prepare('INSERT OR REPLACE INTO learning_reviews VALUES(?,?,?)').run(p.vault, node.id, r.id);
    return { ...r, dueAt };
  }));
  app.once('before-quit', () => { db?.close(); bankDb?.close(); calDb?.close(); reportDb?.close(); });
}
module.exports = { registerLearning };
