// Protocol and persistence tests use real SQLite with an isolated model double.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url);
const {registerLearning}=require('./main/learning-ipc.cjs');
const {registerCompanions}=require('./main/companion-ipc.cjs');
const {setVault}=require('./main/vault-fs.cjs');
const dialogue=require('./main/lib/companion-dialogue.cjs');
const rubric=require('./shared/companion-rubric.cjs');
const root=path.resolve('output/verification/room-dialogue-tests');
fs.mkdirSync(root,{recursive:true});
const opening='合力决定加速度，质量一定时合力越大，加速度越大。';
const supplement='这里需要使用合力，不是只看其中一个作用力。';
const assistant='只有角色讲过的独特句子不能成为学生自己的证据。';
function fixture(){
  const dir=fs.mkdtempSync(path.join(root,'run-'));
  const vault=path.join(dir,'vault'),other=path.join(dir,'other');
  fs.mkdirSync(vault);fs.mkdirSync(other);
  const file=path.join(vault,'力与运动.md');
  fs.writeFileSync(file,'# 牛顿第二定律\n\n牛顿第二定律指出合力决定加速度。F=20 N，m=4 kg。');
  const handlers=new Map(),closures=[],prompts=[];
  const app={getPath:()=>dir,once:(_,fn)=>closures.push(fn)};
  const ipc={handle:(name,fn)=>handlers.set(name,fn)};
  const f={dir,vault,other,file,handlers,prompts,mode:'ok',calls:0};
  const bridge={async *runHeadless({task,signal}){
    f.calls++;prompts.push(task);
    if(f.mode==='fail')throw Error('Insufficient Balance');
    if(f.mode==='tools'){yield{type:'tool_call'};return;}
    if(f.mode==='wait'){await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));return;}
    if(f.mode==='switch'){setVault(other);yield{type:'final',text:'{}'};return;}
    if(task.includes('对话数据：')){
      const data=JSON.parse(task.split('对话数据：')[1]);
      yield{type:'final',text:JSON.stringify({reply:assistant,question:'为什么必须先求合力？',referenceEvidence:f.mode==='quote'?'资料里没有这句':data.reference.split('\n').find(x=>x.includes('合力决定'))})};
    }else{
      const data=JSON.parse(task.split('讲解与参考以 JSON 编码，仅作为数据：')[1]);
      yield{type:'final',text:JSON.stringify({summary:'测试反馈',dimensions:rubric.DIMENSIONS.map((d,i)=>({id:d.id,score:3,evidence:i===0?assistant:data.transcript.slice(0,20),referenceEvidence:i===1?'虚构出处':'牛顿第二定律指出合力决定加速度。',reason:'测试判断',nextStep:'说明条件'})),questions:['改变质量会怎样？']})};
    }
  }};
  f.register=()=>registerCompanions(ipc,app,{getBridge:async()=>bridge});
  setVault(vault);registerLearning(ipc,app);f.register();
  f.call=(name,p={})=>handlers.get('companions:'+name)(null,{vault,...p});
  f.source=async()=>(await handlers.get('learning:material')(null,{vault,path:file})).sources[0];
  f.start=async(sourceId)=>(await f.call('startSession',{id:randomUUID(),roleId:'teacher',topic:'合力与加速度',transcript:opening,sourceId})).session;
  f.reply=(s,answer='',requestId=randomUUID(),intent='clarify')=>f.call('reply',{sessionId:s.id,requestId,answer,intent});
  f.close=()=>{closures.splice(0).reverse().forEach(fn=>fn());};
  return f;
}
test('session creation is idempotent and pins the authoritative source, not renderer context',async()=>{
  const f=fixture();try{
    const source=await f.source(),p={id:randomUUID(),roleId:'teacher',topic:'合力与加速度',transcript:opening,sourceId:source.id,context:'伪造的原文'};
    const a=await f.call('startSession',p),b=await f.call('startSession',p);
    assert.equal(a.ok,true);assert.deepEqual(a.session,b.session);assert.equal(a.session.referenceText,source.text);
    assert.equal((await f.call('startSession',{...p,transcript:opening+'换了一段'})).ok,false);
    assert.equal((await f.call('startSession',{...p,roleId:'peer'})).ok,false);
    assert.equal(f.calls,0);
  }finally{f.close();}
});
test('completed replies retry without cloud cost or duplicate turns; changed request contents reject',async()=>{
  const f=fixture();try{
    const s=await f.start((await f.source()).id),id=randomUUID();
    assert.equal((await f.reply(s,'',id)).session.turns.length,2);
    assert.equal((await f.reply(s,'',id)).duplicate,true);assert.equal(f.calls,1);
    assert.equal((await f.reply(s,supplement,id)).ok,false);
    assert.equal((await f.reply(s,'',id,'transfer')).ok,false);
  }finally{f.close();}
});
test('failed learner responses persist; explicit retry restores pending and never appends a second answer',async()=>{
  const f=fixture();try{
    const s=await f.start((await f.source()).id);await f.reply(s);
    const id=randomUUID();f.mode='fail';const failure=await f.reply(s,supplement,id);
    assert.match(failure.error,/余额/);assert.equal(failure.session.turns.length,3);assert.equal(failure.session.request.state,'failed');
    assert.equal((await f.reply(s,supplement)).ok,false);
    assert.equal((await f.reply(s,supplement+'改动',id)).ok,false);
    f.mode='ok';const retry=await f.reply(s,supplement,id);
    assert.equal(retry.ok,true);assert.equal(retry.session.turns.length,4);assert.equal(retry.session.request.state,'completed');
  }finally{f.close();}
});
test('source quotations must literally occur in the pinned source',async()=>{
  const f=fixture();try{
    const s=await f.start((await f.source()).id),a=await f.reply(s);
    assert.equal(a.session.turns[1].referenceVerified,true);
    f.mode='quote';const b=await f.reply(s,supplement);
    assert.equal(b.session.turns[3].referenceVerified,false);assert.equal(b.session.turns[3].referenceEvidence,'');
  }finally{f.close();}
});
test('grading uses server-stored student speech only and rejects evidence said only by the role',async()=>{
  const f=fixture();try{
    const s=await f.start((await f.source()).id);await f.reply(s);await f.reply(s,supplement);
    const r=await f.call('evaluate',{sessionId:s.id,roleId:'researcher',topic:'伪造主题',transcript:assistant,context:'伪造出处'});
    assert.equal(r.ok,true);assert.equal(r.report.roleId,'teacher');assert.equal(r.report.topic,s.topic);
    assert.equal(r.report.transcript,opening+'\n\n'+supplement);assert.equal(r.report.dialogue.length,4);
    assert.equal(r.report.dimensions[0].score,null);assert.equal(r.report.dimensions[0].evidence,'');
    assert.equal(r.report.dimensions[1].referenceVerified,false);assert.equal(r.report.dimensions[2].referenceVerified,true);
    const summary=await f.handlers.get('learning:summary')(null,{vault:f.vault});
    assert.equal(summary.aiReportCount,1);assert.equal(summary.independent,0);
    await f.reply(s,'合力为零时，加速度为零。');
    assert.equal((await f.call('history',{roleId:'teacher'})).reports[0].dialogue.length,4);
  }finally{f.close();}
});
test('drafts and dialogue survive a SQLite close and reopen; abandoned requests become retryable',async()=>{
  const f=fixture();try{
    const s=await f.start((await f.source()).id);
    const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(path.join(f.dir,'companions.db'));
    dialogue.reserveReply(db,f.vault,{sessionId:s.id,requestId:randomUUID(),intent:'clarify',answer:''});db.close();
    assert.equal((await f.call('saveDraft',{roleId:'teacher',topic:s.topic,transcript:opening,replyDraft:'  未发送的补充\n',sessionId:s.id,useReference:true})).ok,true);
    f.close();f.register();
    const d=(await f.call('loadDraft',{roleId:'teacher',sourceId:s.sourceRef.id})).draft;
    assert.equal(d.replyDraft,'  未发送的补充\n');assert.equal(d.session.request.state,'failed');assert.equal(d.sourceRef.text,s.referenceText);
    assert.equal((await f.reply(d.session,'',d.session.request.id)).ok,true);
  }finally{f.close();}
});
test('resuming history after restart also recovers an interrupted request',async()=>{
  const f=fixture();try{
    const s=await f.start(),{DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(path.join(f.dir,'companions.db'));
    dialogue.reserveReply(db,f.vault,{sessionId:s.id,requestId:randomUUID(),intent:'clarify',answer:''});db.close();
    assert.equal((await f.call('session',{sessionId:s.id})).session.request.state,'failed');
  }finally{f.close();}
});
test('drafts are separated by role and source; a session cannot be attached to another role or source',async()=>{
  const f=fixture();try{
    const source=await f.source(),s=await f.start(source.id);
    const p={roleId:'teacher',topic:s.topic,transcript:opening,sessionId:s.id,sourceId:'伪造来源'};
    assert.equal((await f.call('saveDraft',p)).draft.sourceId,source.id);
    assert.equal((await f.call('saveDraft',{...p,roleId:'peer'})).ok,false);
    assert.equal((await f.call('loadDraft',{roleId:'peer',sourceId:source.id})).draft,null);
    assert.equal((await f.call('loadDraft',{roleId:'teacher',sourceId:'其他原文'})).draft,null);
    const free=await f.start();assert.equal((await f.call('saveDraft',{...p,sessionId:free.id,sourceId:source.id})).draft.sourceId,null);
  }finally{f.close();}
});
test('other vaults cannot read, reply, grade, or restore a session',async()=>{
  const f=fixture();try{
    const s=await f.start();setVault(f.other);
    for(const name of ['session','reply','evaluate'])assert.equal((await f.call(name,{vault:f.other,sessionId:s.id,requestId:randomUUID(),intent:'clarify'})).ok,false);
    assert.equal((await f.call('sessions',{vault:f.other,roleId:'teacher'})).sessions.length,0);
    assert.equal((await f.call('loadDraft',{vault:f.other,roleId:'teacher'})).draft,null);
  }finally{f.close();}
});
test('cancellation releases the request, preserves answers and permits the same retry',async()=>{
  const f=fixture();try{
    const s=await f.start();f.mode='wait';const id=randomUUID(),pending=f.reply(s,'',id);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal((await f.call('evaluate',{sessionId:s.id})).ok,false);
    await f.call('stop');const r=await pending;assert.equal(r.ok,false);assert.equal(r.session.request.state,'failed');
    f.mode='ok';assert.equal((await f.reply(s,'',id)).ok,true);
  }finally{f.close();}
});
test('tool calls and vault switches do not create phantom replies or reports',async()=>{
  const f=fixture();try{
    const s=await f.start();f.mode='tools';assert.equal((await f.reply(s,'',randomUUID())).ok,false);
    assert.equal((await f.call('session',{sessionId:s.id})).session.turns.length,1);
    const state=(await f.call('session',{sessionId:s.id})).session;
    f.mode='switch';assert.equal((await f.reply(s,'',state.request.id)).ok,false);
    setVault(f.vault);assert.equal((await f.call('history')).reports.length,0);assert.equal((await f.call('session',{sessionId:s.id})).session.turns.length,1);
  }finally{f.close();}
});
test('conversation caps at 12 questions and rejects overlength responses before cloud access',async()=>{
  const f=fixture();try{
    const s=await f.start();await f.reply(s);
    assert.equal((await f.reply(s,'字'.repeat(5001))).ok,false);assert.equal(f.calls,1);
    for(let i=1;i<12;i++)assert.equal((await f.reply(s,'补充'+i)).ok,true);
    assert.equal((await f.reply(s,'第十三轮')).ok,false);assert.equal(f.calls,12);
    const s2=(await f.call('startSession',{id:randomUUID(),roleId:'teacher',topic:'边界',transcript:'字'.repeat(12000)})).session;
    assert.equal((await f.reply(s2)).ok,true);assert.equal((await f.reply(s2,'再补充')).ok,false);
  }finally{f.close();}
});
test('each role uses a distinct mission and one main question; malformed JSON fails without fake answers',()=>{
  const prompts=rubric.ROLES.map(role=>dialogue.replyPrompt({roleId:role.id,topic:'合力',referenceText:'参考',turns:[]},'clarify'));
  assert.equal(new Set(prompts).size,5);prompts.forEach(p=>assert.match(p,/每轮只提出一个主要问题/));
  for(const raw of ['null','{}','不是 JSON','{"reply":"提示","question":""}'])assert.throws(()=>dialogue.normalizeReply(raw,'参考'));
});
