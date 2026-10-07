import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const require=createRequire(import.meta.url),{DatabaseSync}=require('node:sqlite');
const review=require('./main/lib/assessment-review.cjs'),rubric=require('./shared/companion-rubric.cjs'),dialogue=require('./main/lib/companion-dialogue.cjs');
const {registerCompanions}=require('./main/companion-ipc.cjs'),{registerCompetition}=require('./main/competition-ipc.cjs'),{setVault}=require('./main/vault-fs.cjs');
const report={id:'report-1',dimensions:rubric.DIMENSIONS.map((d,i)=>({id:d.id,score:i===5?null:3}))};
const payload=()=>({id:randomUUID(),reviewerType:'teacher',alias:'T01',dimensions:rubric.DIMENSIONS.map(d=>({id:d.id,score:2,reason:'A relevant condition is missing.'}))});
test('review ratings validate six dimensions, score bounds and required reasons',()=>{
  const db=new DatabaseSync(':memory:');review.initialize(db);
  for(const mutate of [p=>p.dimensions.pop(),p=>p.dimensions[1].id='accuracy',p=>p.dimensions[0].score=5,p=>p.dimensions[0].score=2.5,p=>p.dimensions[0].reason='',p=>p.reviewerType='verified-teacher']){
    const p=payload();mutate(p);assert.throws(()=>review.save(db,'a',p,report));
  }
  const p=payload();p.dimensions[0].score=null;p.dimensions[0].reason='';assert.equal(review.save(db,'a',p,report).dimensions[0].difference,null);db.close();
});
test('differences are recomputed from canonical AI scores, and retries do not duplicate',()=>{
  const db=new DatabaseSync(':memory:');review.initialize(db);const p=payload();p.dimensions[0].aiScore=99;p.dimensions[0].difference=0;
  const a=review.save(db,'a',p,report),b=review.save(db,'a',p,report);assert.deepEqual(a,b);assert.equal(review.list(db,'a').length,1);
  assert.equal(a.dimensions[0].aiScore,3);assert.equal(a.dimensions[0].difference,-1);assert.equal(a.dimensions[5].difference,null);
  assert.throws(()=>review.save(db,'b',p,report));p.dimensions[0].score=3;assert.throws(()=>review.save(db,'a',p,report));db.close();
});
test('comparison sample is latest review per report, excludes unobserved scores and never invents empty statistics',()=>{
  assert.equal(review.summary([]).agreement,null);assert.equal(review.summary([]).meanAbsoluteDifference,null);
  const db=new DatabaseSync(':memory:');review.initialize(db);
  const first=review.save(db,'a',payload(),report),p=payload();p.dimensions.forEach(d=>d.score=3);const second=review.save(db,'a',p,report);
  const s=review.summary([second,first]);assert.equal(s.reviewCount,2);assert.equal(s.reportCount,1);assert.equal(s.comparable,5);assert.equal(s.agreement,1);assert.equal(s.meanAbsoluteDifference,0);db.close();
});
test('review and disclosure records are scoped to the library; missing versions remain missing',()=>{
  const db=new DatabaseSync(':memory:');review.initialize(db);review.save(db,'a',payload(),report);
  review.saveDisclosure(db,'a',{tools:[{name:'Codex',version:'',purpose:'Development assistance',studentWork:''}]});
  assert.equal(review.list(db,'b').length,0);assert.equal(review.disclosure(db,'b').tools.length,0);
  assert.equal(review.disclosure(db,'a').tools[0].version,'');assert.equal(review.disclosure(db,'a').tools[0].studentWork,'');db.close();
});
test('human review IPC requires an existing report and never rewrites AI feedback',async()=>{
  const root=path.resolve('output/verification/review-tests');fs.mkdirSync(root,{recursive:true});const dir=fs.mkdtempSync(path.join(root,'qa-')),vault=path.join(dir,'vault');fs.mkdirSync(vault);
  const handlers=new Map(),closures=[],app={getPath:()=>dir,once:(_,fn)=>closures.push(fn)};setVault(vault);
  registerCompanions({handle:(n,fn)=>handlers.set(n,fn)},app,{getBridge:async()=>({async *runHeadless(){yield{type:'final',text:JSON.stringify({summary:'Test only',dimensions:rubric.DIMENSIONS.map(d=>({id:d.id,score:3,evidence:'Net force determines acceleration.',reason:'Test evidence',nextStep:'Explain conditions'})),questions:[]})};}})});
  const call=(name,p)=>handlers.get('companions:'+name)(null,{vault,...p});
  try{
    assert.equal((await call('review',{...payload(),reportId:'missing'})).ok,false);
    const r=await call('evaluate',{roleId:'teacher',topic:'Force',transcript:'Net force determines acceleration.'});assert.equal(r.ok,true);
    assert.equal((await call('review',{...payload(),reportId:r.report.id})).ok,true);
    assert.deepEqual((await call('history',{})).reports[0],r.report);
    assert.equal((await call('reviews',{})).summary.comparable,6);
  }finally{closures.reverse().forEach(f=>f());}
});
test('English sessions pin their language, keep quotes intact and use the same six-dimension rubric',()=>{
  const db=new DatabaseSync(':memory:');dialogue.initialize(db);const p={id:randomUUID(),roleId:'teacher',locale:'en',topic:'Force',transcript:'Net force determines acceleration.'};
  const s=dialogue.startSession(db,'a',p,null);assert.equal(s.locale,'en');assert.match(dialogue.replyPrompt(s,'clarify'),/entirely in English/);
  assert.throws(()=>dialogue.startSession(db,'a',{...p,locale:'zh'},null));
  assert.match(rubric.prompt(p),/entirely in English/);assert.equal(rubric.DIMENSIONS.length,6);db.close();
});
test('isolated English demo workspace creates original material once and preserves edits',()=>{
  const root=path.resolve('output/verification/review-tests');fs.mkdirSync(root,{recursive:true});const dir=fs.mkdtempSync(path.join(root,'demo-')),handlers=new Map();
  registerCompetition({handle:(n,fn)=>handlers.set(n,fn)},{getPath:()=>dir});const call=handlers.get('competition:workspace');
  const first=call();assert.equal(first.ok,true);assert.ok(first.file.startsWith(dir));assert.match(fs.readFileSync(first.file,'utf8'),/not a real student trial/);
  fs.writeFileSync(first.file,'User edits remain.');assert.equal(call().ok,true);assert.equal(fs.readFileSync(first.file,'utf8'),'User edits remain.');
});
test('English output guard rejects untranslated model prose while preserving literal source quotations',()=>{
  assert.throws(()=>dialogue.normalizeReply(JSON.stringify({reply:'中文回应',question:'English question?'}),'','en'),/English/);
  assert.equal(dialogue.normalizeReply(JSON.stringify({reply:'Explain the condition.',question:'What changes?',referenceEvidence:'原文'}),'原文','en').referenceEvidence,'原文');
  const data={summary:'English summary',questions:[],dimensions:rubric.DIMENSIONS.map(d=>({id:d.id,score:3,evidence:'原话',referenceEvidence:'原文',reason:'English reason',nextStep:'Check a condition.'}))};
  assert.equal(rubric.normalize(JSON.stringify(data),'原话','原文','en').dimensions[0].evidence,'原话');
  data.dimensions[0].reason='中文理由';assert.throws(()=>rubric.normalize(JSON.stringify(data),'原话','原文','en'),/English/);
});
test('human review and disclosure survive database close and reopen without changing report IDs',()=>{
  const root=path.resolve('output/verification/review-tests');fs.mkdirSync(root,{recursive:true});const file=path.join(fs.mkdtempSync(path.join(root,'db-')),'reviews.db');
  let db=new DatabaseSync(file);review.initialize(db);const saved=review.save(db,'a',payload(),report);review.saveDisclosure(db,'a',{tools:[{name:'DSH',version:'recorded version',purpose:'Discussion',studentWork:'Actual contribution'}]});db.close();
  db=new DatabaseSync(file);review.initialize(db);assert.deepEqual(review.list(db,'a')[0],saved);assert.equal(review.disclosure(db,'a').tools[0].studentWork,'Actual contribution');db.close();
});
