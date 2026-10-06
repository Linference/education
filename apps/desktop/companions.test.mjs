import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const rubric = require('./shared/companion-rubric.cjs');
const bank = require('./main/lib/bank.cjs');
const { parseDocument } = require('./main/lib/bank-document.cjs');
const transcript = '顶点是 (h,k)，符号决定开口。需要 a 不等于零。';
const sample = () => ({ summary:'检查边界条件', dimensions:rubric.DIMENSIONS.map(d => ({id:d.id,score:3,evidence:'需要 a 不等于零。',reason:'原话包含条件',nextStep:'补充反例'})),questions:['a=0 会怎样？'] });
test('five roles have distinct responsibilities and the same transparent rubric', () => {
  assert.equal(rubric.ROLES.length,5); assert.equal(new Set(rubric.ROLES.map(r=>r.instruction)).size,5);
  for (const role of rubric.ROLES) assert.match(rubric.prompt({roleId:role.id,topic:'函数',transcript}),/score=null/);
});
test('unobserved, out-of-range, and invented evidence never become radar scores', () => {
  const data=sample(); data.dimensions[0].evidence='用户没有讲过这句话';data.dimensions[1].score=9;data.dimensions[2].score=null;
  const result=rubric.normalize(JSON.stringify(data),transcript);
  assert.equal(result.dimensions[0].score,null);assert.equal(result.dimensions[0].evidence,'');assert.equal(result.dimensions[1].score,null);assert.equal(result.dimensions[2].score,null);assert.equal(result.dimensions[3].score,3);
});
test('malformed or incomplete AI replies fail explicitly', () => {
  assert.throws(()=>rubric.normalize('无法评估',transcript),/格式/);
  const data=sample();data.dimensions.pop();assert.throws(()=>rubric.normalize(JSON.stringify(data),transcript),/六维/);
});
test('numbered and bold-field documents import without phantom introduction questions', async () => {
  const r=await parseDocument({name:'题目.txt',text:'说明文字\n1. 细胞膜有什么作用？\n**答案：**控制物质进出\n**解析**：需要选择透过性。\n2. DNA 在哪里？\n答案：细胞核'});
  assert.equal(r.count,2);assert.equal(r.questions[0].answer,'控制物质进出');assert.equal(r.questions[1].stem,'DNA 在哪里？');
});
test('JSON numeric zero and string options survive normalization', async () => {
  const r=await parseDocument({name:'题目.json',text:JSON.stringify([{stem:'1-1',type:'fill',answer:0},{question:'选择',type:'选择题',options:['甲','乙'],answer:'A'}])});
  assert.equal(r.questions[0].answer,'0');assert.equal(r.questions[1].type,'choice');assert.deepEqual(r.questions[1].options[0],{label:'A',text:'甲'});
});
test('deduplication is scoped to the selected library and can be disabled', () => {
  const db=bank.openBankDb(':memory:');const q={stem:'一加一',type:'fill',answer:'2',options:[]};
  assert.equal(bank.addQuestions(db,{vault:'a',questions:[q,q],skipDuplicates:true}).skipped,1);
  assert.equal(bank.addQuestions(db,{vault:'b',questions:[q],skipDuplicates:true}).added,1);
  assert.equal(bank.addQuestions(db,{vault:'a',questions:[q],skipDuplicates:false}).added,1); db.close();
});
