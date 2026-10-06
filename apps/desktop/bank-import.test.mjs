import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { parseQuestionsFromMarkdown, questionsToMarkdown } = require('./main/lib/bank-md.cjs');

test('export/import preserves multiline stems, answers, explanations and fields', () => {
  const questions = [{ type: 'choice', difficulty: 3, stem: '求解方程\n给出过程。', options: [{ label: 'A', text: '零' }, { label: 'B', text: '一' }], answer: 'A\n需要检查零解。', solution: '先因式分解。\n再检验两个解。\nA. 这是解析内容，不是新选项。', kps: ['方程','零解'], source: '原创', subject: '数学', year: 2026 }];
  assert.deepEqual(parseQuestionsFromMarkdown(questionsToMarkdown(questions)).questions, questions);
});
test('document title and introduction are not imported as fake questions', () => {
  const r = parseQuestionsFromMarkdown('\uFEFF---\ntitle: 生物题库\n---\n# 生物题库\n以下为原创练习。\n### 第 1 题\n题干：细胞膜有什么作用？\n答案：控制物质进出。');
  assert.equal(r.questions.length, 1);
  assert.equal(r.questions[0].stem, '细胞膜有什么作用？');
});
test('subheadings and fenced code stay within one question', () => {
  const r = parseQuestionsFromMarkdown('### 第 1 题\n题干：解释下面的文本\n#### 提示\n```md\n### 代码里的标题\n```\n答案：示例\n### 第 2 题\n题干：第二题\n答案：2');
  assert.equal(r.questions.length, 2);
  assert.match(r.questions[0].stem, /### 代码里的标题/);
});
test('field-like code and heading-only question stems are preserved', () => {
  const r=parseQuestionsFromMarkdown('### 什么是选择透过性？\n答案：控制物质进出\n### 第 2 题\n题干：阅读代码\n```txt\n答案：这只是代码\n```\n答案：真正答案');
  assert.equal(r.questions[0].stem,'什么是选择透过性？');
  assert.match(r.questions[1].stem,/答案：这只是代码/);assert.equal(r.questions[1].answer,'真正答案');
});
