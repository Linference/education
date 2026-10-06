import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { motion, parameters, probability, quadratic, sampleTrials } from './shared/lab-models.mjs';
const require = createRequire(import.meta.url);
const learning = require('./main/lib/learning.cjs');
const bank = require('./main/lib/bank.cjs');
function fixture() {
  const db = learning.openLearningDb(':memory:'), b = bank.openBankDb(':memory:');
  const ops = { listQuestions: p => bank.listQuestions(b, p), byIds: p => bank.getQuestionsByIds(b, p) };
  const submit = p => learning.submit(db, ops, { vault: 'v', activityId: 'practice-force', submissionId: randomUUID(), response: 'C', confidence: 3, usedHint: false, ...p });
  return { db, b, ops, submit };
}
test('catalog never discloses answers or explanations; original sources explicit', () => {
  const f = fixture(), c = learning.catalog(f.db, f.ops, 'v', undefined, true);
  assert.equal(c.activities.length, 16);
  for (const a of c.activities) { assert.equal('answer' in a, false); assert.equal('correctionAnswer' in a, false); assert.equal('explanation' in a, false); assert.match(a.source, /非考试真题/); }
  assert.equal(c.activities.find(a => a.level === 2).unlocked, false);
});
test('new vaults show no fixed example questions or unrelated evidence by default', () => {
  const f = fixture();
  bank.addQuestion(f.b, { vault: 'v', stem: '细胞的基本结构是什么？', type: 'answer', kps: ['细胞'], subject: '生物' });
  assert.deepEqual(learning.catalog(f.db, f.ops, 'other').activities, []);
  assert.deepEqual(learning.summary(f.db, f.ops, 'other').evidence, []);
  const current = learning.catalog(f.db, f.ops, 'v');
  assert.equal(current.activities.length, 1);
  assert.equal(current.activities[0].concept, '细胞');
  assert.deepEqual(learning.summary(f.db, f.ops, 'v').evidence.map(n => n.id), ['细胞']);
  assert.equal(learning.catalog(f.db, f.ops, 'other', undefined, true).activities.length, 16);
});
test('confidence must precede feedback, invalid choices rejected', () => {
  const f = fixture(); assert.throws(() => f.submit({ confidence: 0 }), /自信度/); assert.throws(() => f.submit({ confidence: 5 }), /自信度/); assert.throws(() => f.submit({ response: 'E' }), /选项/); assert.equal(learning.summary(f.db, f.ops, 'v').total, 0);
});
test('deterministic grading and idempotent retry preserve original evidence', () => {
  const f = fixture(), id = randomUUID(); const a = f.submit({ submissionId: id, response: 'A' }).attempt;
  assert.equal(a.correct, false); assert.equal(a.confidence, 3);
  const retry = f.submit({ submissionId: id, response: 'C' }); assert.equal(retry.duplicate, true); assert.equal(retry.attempt.correct, false);
  assert.equal(learning.summary(f.db, f.ops, 'v').total, 1);
  assert.throws(() => f.submit({ submissionId: id, vault: 'other' }), /另一项/);
});
test('high-confidence incorrect and assisted correct have distinct recommendations', () => {
  const f = fixture(); f.submit({ response: 'A' }); let s = learning.summary(f.db, f.ops, 'v');
  assert.equal(s.evidence.find(n => n.id === '牛顿第二定律').status, 'misconception'); assert.equal(s.recommendations[0].mode, 'detective');
  f.submit({ usedHint: true }); s = learning.summary(f.db, f.ops, 'v'); assert.equal(s.evidence.find(n => n.id === '牛顿第二定律').status, 'needsPractice'); assert.equal(s.independent, 0);
  f.submit({ usedHint: false }); assert.equal(learning.summary(f.db, f.ops, 'v').evidence.find(n => n.id === '牛顿第二定律').status, 'supported');
});
test('previewed reference answers are retained as assistance, never independent evidence', () => {
  const f = fixture(), a = f.submit({ previewedAnswer: true }).attempt;
  assert.equal(a.previewedAnswer, true); assert.equal(a.usedHint, false); assert.equal(a.hints, 1);
  const s = learning.summary(f.db, f.ops, 'v');
  assert.equal(s.independent, 0); assert.equal(s.evidence.find(n => n.id === '牛顿第二定律').status, 'needsPractice');
  assert.equal(s.history[0].previewedAnswer, true);
});
test('error detective verifies the identified error AND the correction, preserves rationale', () => {
  const f = fixture(); assert.throws(() => f.submit({ activityId: 'detective-root', response: 'B' }), /修正/);
  assert.equal(f.submit({ activityId: 'detective-root', response: 'B', correction: 'A', reflection: '除法应检验非零条件' }).attempt.correct, false);
  const a = f.submit({ activityId: 'detective-root', response: 'B', correction: 'B', reflection: 'x=0 时不能除以 x' }).attempt;
  assert.equal(a.correct, true); assert.match(a.reflection, /不能除/);
});
test('all curated exercises match their checked reference answers', () => {
  const f = fixture(); for (const a of learning.content.activities) {
    const result = f.submit({ activityId: a.id, response: a.answer, correction: a.correctionAnswer, reflection: '使用定义和题目条件逐步检验。' }); assert.equal(result.attempt.correct, true, a.id);
  }
  assert.equal(learning.summary(f.db, f.ops, 'v').total, 16);
});
test('transfer prerequisites enforced in main process, chains independent', () => {
  const f = fixture(); assert.throws(() => f.submit({ activityId: 'transfer-force-3', response: 'B', reflection: '匀速意味着合力为零' }), /前一关/);
  f.submit({ activityId: 'transfer-quadratic-1', response: 'B', reflection: '顶点式' });
  let c = learning.catalog(f.db, f.ops, 'v', undefined, true); assert.equal(c.activities.find(a => a.id === 'transfer-quadratic-2').unlocked, true); assert.equal(c.activities.find(a => a.id === 'transfer-force-2').unlocked, false);
  f.submit({ activityId: 'transfer-quadratic-2', response: 'B', reflection: '开口方向改变' }); f.submit({ activityId: 'transfer-quadratic-3', response: 'B', reflection: '最高点是定义域内的顶点' });
  assert.equal(learning.summary(f.db, f.ops, 'v').evidence.find(n => n.id === '二次函数').transferLevel, 3);
});
test('numeric imported questions accept fractions, reject malformed and infinite responses', () => {
  const f = fixture(); const q = bank.addQuestion(f.b, { vault: 'v', type: 'fill', stem: '概率为多少？', answer: '1/2', kps: ['概率'] });
  assert.equal(f.submit({ activityId: 'bank:' + q.id, response: '0.5' }).attempt.correct, true);
  assert.equal(f.submit({ activityId: 'bank:' + q.id, response: '１/２' }).attempt.correct, true);
  assert.throws(() => f.submit({ activityId: 'bank:' + q.id, response: '1/0' }), /数值/);
  assert.throws(() => f.submit({ activityId: 'bank:' + q.id, response: '1e999' }), /数值/);
});
test('multiple-choice answer lists are not misread as a single correct option', () => {
  const f = fixture(), q = bank.addQuestion(f.b, { vault: 'v', type: 'choice', stem: '哪些说法正确？', options: [{ label: 'A', text: '甲' }, { label: 'B', text: '乙' }], answer: 'A、B', kps: ['多项判断'] });
  assert.equal(f.submit({ activityId: 'bank:' + q.id, response: 'A' }).attempt.correct, null);
  assert.equal(learning.summary(f.db, f.ops, 'v').independent, 0);
});
test('proofs and unparseable answers remain unverified; self-assessment cannot become independent evidence', () => {
  const f = fixture(), q = bank.addQuestion(f.b, { vault: 'v', type: 'proof', stem: '证明命题', answer: '证明见解析', kps: ['证明'] });
  const a = f.submit({ activityId: 'bank:' + q.id, response: '我的推理' }).attempt; assert.equal(a.correct, null);
  learning.annotate(f.db, { vault: 'v', id: a.id, selfVerdict: 'correct' });
  const s = learning.summary(f.db, f.ops, 'v'); assert.equal(s.independent, 0); assert.equal(s.evidence.find(n => n.id === '证明').status, 'unverified');
  assert.throws(() => learning.annotate(f.db, { vault: 'other', id: a.id, selfVerdict: 'correct' }), /不存在/);
});
test('delayed evidence requires at least a day AND a different independently answered task', () => {
  const f = fixture(), first = f.submit().attempt;
  f.db.prepare('UPDATE learning_attempts SET at=? WHERE id=?').run(new Date(Date.now() - 2 * 86400000).toISOString(), first.id);
  assert.equal(learning.summary(f.db, f.ops, 'v').evidence.find(n => n.id === '牛顿第二定律').status, 'needsRetest');
  f.submit(); assert.equal(learning.summary(f.db, f.ops, 'v').evidence.find(n => n.id === '牛顿第二定律').delayed, false);
  f.submit({ activityId: 'transfer-force-1', response: 'B', reflection: '合力除以质量' }); assert.equal(learning.summary(f.db, f.ops, 'v').evidence.find(n => n.id === '牛顿第二定律').delayed, true);
});
test('vault isolation, deletion, and immutable question snapshots', () => {
  const f = fixture(), q = bank.addQuestion(f.b, { vault: 'v', type: 'fill', stem: '一加一', answer: '2', kps: ['加法'], source: '我的练习' });
  const a = f.submit({ activityId: 'bank:' + q.id, response: '2' }).attempt;
  assert.throws(() => f.submit({ vault: 'other', activityId: 'bank:' + q.id }), /不存在/);
  bank.deleteQuestion(f.b, { vault: 'v', id: q.id }); assert.throws(() => f.submit({ activityId: 'bank:' + q.id }), /不存在/);
  assert.equal(learning.summary(f.db, f.ops, 'v').history.find(r => r.id === a.id).prompt, '一加一');
  assert.equal(learning.summary(f.db, f.ops, 'other').total, 0);
});
test('bank co-occurrence edges are labelled related, never inferred prerequisites', () => {
  const f = fixture(); bank.addQuestion(f.b, { vault: 'v', stem: '题目', answer: '答', kps: ['甲概念', '乙概念'] });
  const s = learning.summary(f.db, f.ops, 'v'); assert.equal(s.edges.find(e => [e.from, e.to].includes('甲概念')).kind, 'related');
});
test('SQLite records survive close and reopen', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gezhi-learning-unit-')), file = path.join(dir, 'learning.db');
  const f = fixture(); const db = learning.openLearningDb(file); learning.submit(db, f.ops, { vault: 'v', activityId: 'practice-force', submissionId: randomUUID(), response: 'C', confidence: 2 }); db.close();
  const reopened = learning.openLearningDb(file); assert.equal(learning.summary(reopened, f.ops, 'v').total, 1); reopened.close();
});
test('function model handles vertex, sign changes, and a=0 degeneration', () => {
  assert.equal(quadratic(2, parameters('quadratic', { a: -0.5, h: 2, k: 2 })), 2); assert.equal(quadratic(0, { a: -0.5, h: 2, k: 2 }), 0); assert.equal(quadratic(9, { a: 0, h: 0, k: 3 }), 3);
});
test('force model respects static balance, units, acceleration and displacement', () => {
  const p = parameters('force'); const m = motion(p, 3); assert.ok(Math.abs(m.acceleration - 4.02) < 1e-12); assert.ok(Math.abs(m.displacement - 18.09) < 1e-10);
  const stuck = motion({ force: 1, mass: 4, friction: 0.6 }, 3); assert.equal(stuck.acceleration, 0); assert.equal(stuck.friction, 1);
  assert.equal(motion({ force: 80, mass: 1, friction: 0 }, 3).displacement, 360);
});
test('probability uses complement of all failures; seeded sampling within bounds', () => {
  assert.equal(probability({ p: 0.5, n: 2 }), 0.75); assert.ok(Math.abs(probability({ p: 0.2, n: 2 }) - 0.36) < 1e-12);
  const p = parameters('probability'), a = sampleTrials(p, 10000, 12345), b = sampleTrials(p, 10000, 12345); assert.deepEqual(a, b); assert.ok(Math.abs(a.frequency - 0.75) < 0.03); assert.equal(sampleTrials({ p: 1, n: 2 }, 100).success, 100); assert.equal(sampleTrials({ p: 0, n: 2 }, 100).success, 0);
});
test('all experiment parameters reject non-finite values, out of range, or non-integer trial count', () => {
  assert.throws(() => parameters('quadratic', { a: Infinity }), /范围/); assert.throws(() => parameters('force', { mass: 0 }), /范围/); assert.throws(() => parameters('probability', { n: 1.5 }), /范围/); assert.throws(() => parameters('probability', { p: 1 }), /范围/); assert.throws(() => sampleTrials({ p: 0.5, n: 2 }, 10001), /次数/);
});
