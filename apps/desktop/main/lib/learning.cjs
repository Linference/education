const { DatabaseSync } = require('node:sqlite');
const content = require('./learning-content.cjs');

function openLearningDb(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec("CREATE TABLE IF NOT EXISTS learning_attempts(id TEXT PRIMARY KEY, vault TEXT NOT NULL, activity_id TEXT NOT NULL, concept TEXT NOT NULL, mode TEXT NOT NULL, at TEXT NOT NULL, correct INTEGER, confidence INTEGER NOT NULL, hints INTEGER NOT NULL, grading TEXT NOT NULL, data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS learning_vault_at ON learning_attempts(vault,at); CREATE TABLE IF NOT EXISTS learning_labs(id TEXT PRIMARY KEY, vault TEXT NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS learning_reviews(vault TEXT NOT NULL, concept TEXT NOT NULL, task_id TEXT NOT NULL, PRIMARY KEY(vault,concept));");
  db.exec('CREATE TABLE IF NOT EXISTS learning_sources(id TEXT NOT NULL,vault TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(id,vault));');
  return db;
}
function normalize(value) { return String(value ?? '').normalize('NFKC').trim().replace(/[−–]/g, '-').replace(/\s+/g, '').toLowerCase(); }
function numeric(value) {
  const text = normalize(value);
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/.test(text)) return Number.isFinite(Number(text)) ? Number(text) : null;
  const frac = /^([+-]?\d+(?:\.\d+)?)\/([+-]?\d+(?:\.\d+)?)$/.exec(text);
  const quotient = frac && Number(frac[2]) !== 0 ? Number(frac[1]) / Number(frac[2]) : null;
  return quotient !== null && Number.isFinite(quotient) ? quotient : null;
}
function bankActivity(q) {
  const choiceAnswer = String(q.answer || '').normalize('NFKC').trim().match(/^(?:答案[:：]?\s*)?([A-Z])[.、。．]?$/i)?.[1]?.toUpperCase();
  const grading = q.type === 'choice' && q.options.some(o => o.label === choiceAnswer) ? 'choice'
    : ['fill', 'calc'].includes(q.type) && numeric(q.answer) !== null ? 'numeric' : 'self';
  return { id: 'bank:' + q.id, mode: 'practice', concept: q.kps[0] || 'Unlabeled knowledge point', concepts: q.kps,
    title: 'Question bank practice #' + q.id, prompt: q.stem, options: q.type === 'choice' ? q.options : [],
    answer: grading === 'choice' ? choiceAnswer : q.answer, grading, tolerance: 1e-8,
    explanation: q.solution || 'This question has no solution; please verify against the original material.', source: q.source || 'User-imported question · source not provided',
    hint: q.kps.length ? 'First review: ' + q.kps.join(', ') + '. Separate the given conditions from the quantities to find.' : 'First list the given conditions and the quantities to find, then check the method used.' };
}
function catalog(db, bank, vault, includeActivityId, includeExamples = false) {
  const passes = new Set(db.prepare("SELECT DISTINCT activity_id FROM learning_attempts WHERE vault=? AND correct=1 AND grading!='self'").all(vault).map(r => r.activity_id));
  const imported = bank.listQuestions({ vault, limit: 500, offset: 0 });
  if (typeof includeActivityId === 'string' && /^bank:\d+$/.test(includeActivityId) && !(imported.questions || []).some(q => 'bank:' + q.id === includeActivityId)) {
    const q = bank.byIds({ vault, ids: [Number(includeActivityId.slice(5))] }).questions?.[0];
    if (q) imported.questions.push(q);
  }
  const contextual = db.prepare("SELECT data FROM learning_labs WHERE vault=? AND id LIKE 'study:%' ORDER BY rowid DESC LIMIT 200").all(vault).map(r => JSON.parse(r.data));
  return { ok: true, activities: [...contextual, ...(includeExamples ? content.activities : []), ...(imported.questions || []).map(bankActivity)].map(a => ({ ...content.publicActivity(a), unlocked: !a.requires || passes.has(a.requires), completed: passes.has(a.id) })), bankTotal: imported.total || 0, bankShown: imported.questions?.length || 0 };
}
function resolveActivity(db, bank, vault, id) {
  const built = content.activities.find(a => a.id === id);
  if (built) return built;
  if (/^bank:\d+$/.test(id)) { const q = bank.byIds({ vault, ids: [Number(id.slice(5))] }).questions?.[0]; if (q) return bankActivity(q); }
  const row = db.prepare('SELECT data FROM learning_labs WHERE vault=? AND id=?').get(vault, id);
  if (row) return JSON.parse(row.data);
  throw new Error('The activity does not exist or was removed from the current library. Please refresh.');
}
function rowAttempt(row) { return { ...JSON.parse(row.data), id: row.id, activityId: row.activity_id, concept: row.concept, mode: row.mode, at: row.at, correct: row.correct === null ? null : Boolean(row.correct), confidence: row.confidence, hints: row.hints, grading: row.grading }; }
function submit(db, bank, p) {
  if (typeof p.submissionId !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(p.submissionId)) throw new Error('Invalid submission identifier');
  const existing = db.prepare('SELECT * FROM learning_attempts WHERE id=?').get(p.submissionId);
  if (existing) { if (existing.vault !== p.vault || existing.activity_id !== p.activityId) throw new Error('This submission identifier has already been used for another exercise'); return { ok: true, attempt: rowAttempt(existing), duplicate: true }; }
  if (![1, 2, 3].includes(p.confidence)) throw new Error('Choose a confidence level before revealing the answer');
  const a = resolveActivity(db, bank, p.vault, p.activityId);
  if (a.requires && !db.prepare("SELECT 1 FROM learning_attempts WHERE vault=? AND activity_id=? AND correct=1 AND grading!='self'").get(p.vault, a.requires)) throw new Error('Complete the previous level before attempting this transfer challenge.');
  const response = String(p.response ?? '').trim();
  const reflection = String(p.reflection ?? '').trim();
  if (!response || response.length > 12000 || reflection.length > 6000) throw new Error('Please enter a valid answer');
  if (a.mode === 'detective' && (!reflection || (a.correctionOptions && !p.correction))) throw new Error('Please provide the correction and explain what went wrong.');
  if (a.mode === 'lab' && !reflection) throw new Error('Write down your prediction and reasoning before verifying.');
  if (a.mode === 'transfer' && !reflection) throw new Error('Record the method you used in the new situation.');
  let correct = null;
  if (a.grading === 'choice') { if (!a.options.some(o => o.label === response)) throw new Error('Please choose a valid option'); correct = response === a.answer; }
  if (a.grading === 'numeric') { const n = numeric(response), expected = numeric(a.answer); if (n === null || !Number.isFinite(n)) throw new Error('Enter a number (fractions are allowed). Units are shown in the question.'); if (expected === null || !Number.isFinite(expected)) throw new Error('Cannot verify against the reference answer; please check the question bank'); correct = Math.abs(n - expected) <= (a.tolerance ?? 1e-8) * (a.relative ? Math.max(1, Math.abs(expected)) : 1); }
  if (a.mode === 'detective' && a.correctionOptions) { if (!['A', 'B', 'C'].includes(p.correction)) throw new Error('Invalid correction option'); correct = correct && p.correction === a.correctionAnswer; }
  const at = new Date().toISOString();
  const data = { title: a.title, prompt: a.prompt, response, reflection, correction: typeof p.correction === 'string' ? p.correction : null, answer: String(a.answer ?? ''), explanation: a.explanation, source: a.source, level: a.level || null, chain: a.chain || null, params: a.params || null, labKind: a.labKind || null, selfVerdict: null, observation: null, usedHint: p.usedHint === true, previewedAnswer: p.previewedAnswer === true };
  Object.assign(data, { sourceRef: a.sourceRef || null, focus: a.focus || '', sampleSeed: a.sampleSeed ?? null, previousLabId: a.previousLabId || null, measurement: null, labVerified: false });
  db.prepare('INSERT INTO learning_attempts VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(p.submissionId, p.vault, a.id, a.concept, a.mode, at, correct === null ? null : Number(correct), p.confidence, p.usedHint === true || p.previewedAnswer === true ? 1 : 0, a.grading, JSON.stringify(data));
  return { ok: true, attempt: rowAttempt(db.prepare('SELECT * FROM learning_attempts WHERE id=?').get(p.submissionId)) };
}
function annotate(db, p) {
  const row = db.prepare('SELECT * FROM learning_attempts WHERE vault=? AND id=?').get(p.vault, p.id);
  if (!row) throw new Error('Learning record not found');
  const data = JSON.parse(row.data);
  if (p.selfVerdict !== undefined) { if (row.grading !== 'self' || !['correct', 'partial', 'incorrect'].includes(p.selfVerdict)) throw new Error('Invalid self-assessment result'); data.selfVerdict = p.selfVerdict; }
  if (p.observation !== undefined) { if (row.mode !== 'lab' || typeof p.observation !== 'string' || p.observation.trim().length < 3 || p.observation.length > 6000) throw new Error('Please fill in the lab observation and explanation'); data.observation = p.observation.trim(); }
  db.prepare('UPDATE learning_attempts SET data=? WHERE id=? AND vault=?').run(JSON.stringify(data), p.id, p.vault);
  return { ok: true, attempt: rowAttempt(db.prepare('SELECT * FROM learning_attempts WHERE id=?').get(p.id)) };
}
function summary(db, bank, vault, now = Date.now(), includeExamples = false) {
  const rows = db.prepare('SELECT * FROM learning_attempts WHERE vault=? ORDER BY at DESC,rowid DESC').all(vault);
  const attempts = rows.map(rowAttempt);
  const imported = bank.listQuestions({ vault, limit: 500, offset: 0 }).questions || [];
  const nodes = new Map((includeExamples ? content.concepts : []).map(c => [c.id, { ...c }]));
  for (const q of imported) for (const kp of q.kps) if (!nodes.has(kp)) nodes.set(kp, { id: kp, subject: q.subject || 'Question bank' });
  for (const a of attempts) if (!nodes.has(a.concept)) nodes.set(a.concept, { ...(content.concepts.find(c => c.id === a.concept) || { subject: 'Question bank' }), id: a.concept });
  const edges = content.edges.filter(e => nodes.has(e.from) && nodes.has(e.to));
  const seen = new Set(edges.map(e => e.from + '\0' + e.to));
  for (const q of imported) for (let i = 0; i < q.kps.length; i++) for (let j = i + 1; j < q.kps.length; j++) {
    const [from, to] = [q.kps[i], q.kps[j]].sort(); const key = from + '\0' + to;
    if (from !== to && !seen.has(key)) { seen.add(key); edges.push({ from, to, kind: 'related', source: 'Knowledge point tags from the same question' }); }
  }
  const evidence = [...nodes.values()].map(node => {
    const history = attempts.filter(a => a.concept === node.id);
    const verified = history.filter(a => a.grading !== 'self' && a.correct !== null && (a.mode !== 'lab' || a.labVerified));
    const latest = verified[0];
    let status = history.length ? 'unverified' : 'untested', reason = history.length ? 'There are responses or self-assessments, but no verifiable independent practice yet.' : 'Complete an exercise to start collecting evidence.';
    if (latest) {
      if (!latest.correct) { status = latest.confidence === 3 ? 'misconception' : 'needsPractice'; reason = latest.confidence === 3 ? 'A confident answer did not pass. Test the idea with a counterexample.' : 'The latest verification did not pass; review the conditions before practicing again.'; }
      else if (latest.hints) { status = 'needsPractice'; reason = 'The latest attempt used a hint or reference; complete an independent exercise.'; }
      else if (now - Date.parse(latest.at) >= 86400000) { status = 'needsRetest'; reason = 'The last independent pass was more than a day ago; a delayed retest is due.'; }
      else { status = 'supported'; reason = 'An independent answer passed recently. Verify again with a different task and a delayed retest.'; }
    }
    const independent = verified.filter(a => a.correct && !a.hints);
    const delayed = independent.some((a, i) => independent.slice(i + 1).some(b => a.activityId !== b.activityId && Date.parse(a.at) - Date.parse(b.at) >= 86400000));
    const transfer = verified.filter(a => a.mode === 'transfer' && a.correct && !a.hints).map(a => a.level);
    return { ...node, status, reason, total: history.length, verified: verified.length, independent: independent.length, delayed, transferLevel: Math.max(0, ...transfer), latestAt: history[0]?.at || null, evidence: history.slice(0, 8) };
  });
  const priority = { misconception: 0, needsPractice: 1, needsRetest: 2, unverified: 3, untested: 4, supported: 5 };
  const recommendations = evidence.filter(n => n.total && n.status !== 'supported').sort((a, b) => priority[a.status] - priority[b.status]).slice(0, 8).map(n => ({ concept: n.id, reason: n.reason, mode: n.status === 'misconception' && content.activities.some(a => a.mode === 'detective' && a.concept === n.id) ? 'detective' : 'practice', dueAt: new Date(now).toISOString() }));
  return { ok: true, total: attempts.length, independent: attempts.filter(a => a.correct && !a.hints && a.grading !== 'self' && (a.mode !== 'lab' || a.labVerified)).length, highConfidenceWrong: attempts.filter(a => a.correct === false && a.confidence === 3).length, evidence, edges, recommendations, history: attempts.slice(0, 120), historyShown: Math.min(attempts.length, 120) };
}
function sourceById(db, vault, id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id)) throw new Error('Invalid source reference; please reselect the section.');
  const row = db.prepare('SELECT data FROM learning_sources WHERE vault=? AND id=?').get(vault, id);
  if (!row) throw new Error('The current library has no such source reference; please reload it.');
  return JSON.parse(row.data);
}
function saveSource(db, vault, source) { db.prepare('INSERT OR IGNORE INTO learning_sources VALUES(?,?,?)').run(source.id, vault, JSON.stringify(source)); return source; }
function linkReports(result, reports) {
  result.aiReportCount = reports.length;
  for (const report of reports) {
    const concept = report.sourceRef?.concept || report.topic;
    let node = result.evidence.find(n => n.id === concept);
    if (!node) { node = { id: concept, subject: 'Explanation material', status: 'unverified', reason: 'There is AI explanation feedback, but no verifiable independent responses yet.', total: 0, verified: 0, independent: 0, delayed: false, transferLevel: 0, latestAt: report.at, evidence: [] }; result.evidence.push(node); }
    node.aiReports ||= []; node.reportCount = (node.reportCount || 0) + 1;
    if (node.aiReports.length < 5) node.aiReports.push(report);
  }
  for (const node of result.evidence) {
    const sources = [...node.evidence.map(a => a.sourceRef), ...(node.aiReports || []).map(r => r.sourceRef)].filter(Boolean);
    node.sources = [...new Map(sources.map(s => [s.id, s])).values()];
  }
  return result;
}
module.exports = { openLearningDb, normalize, numeric, bankActivity, catalog, resolveActivity, submit, annotate, summary, content, sourceById, saveSource, linkReports };
