import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {Document,Packer,Paragraph} from 'docx';
const require=createRequire(import.meta.url),material=require('./main/lib/study-material.cjs');
const {registerLearning}=require('./main/learning-ipc.cjs'),{registerCompanions}=require('./main/companion-ipc.cjs');
const {setVault}=require('./main/vault-fs.cjs');
const root=path.resolve('output/verification/study-material-tests');fs.mkdirSync(root,{recursive:true});
function fixture(){
  const dir=fs.mkdtempSync(path.join(root,'run-')),vault=path.join(dir,'vault'),other=path.join(dir,'other');fs.mkdirSync(vault);fs.mkdirSync(other);
  const file=path.join(vault,'力与运动.md');fs.writeFileSync(file,'# 牛顿第二定律\n\nF=20 N，m=4 kg，μ=0.1。牛顿第二定律指出合力决定加速度。\n\n# 生物\n\n细胞膜是细胞的重要结构。');
  const handlers=new Map(),closures=[],ipc={handle:(name,fn)=>handlers.set(name,fn)},app={getPath:()=>dir,once:(_,fn)=>closures.push(fn)};
  setVault(vault);registerLearning(ipc,app);const call=(name,p={})=>handlers.get('learning:'+name)(null,{vault,...p});
  return{dir,vault,other,file,ipc,app,call,close:()=>closures.reverse().forEach(f=>f())};
}
const submit=(f,a,response)=>f.call('submit',{activityId:a.id,submissionId:randomUUID(),response,reflection:'根据合力与质量的关系预测，再检验适用条件。',confidence:3,usedHint:false});
test('sections retain line locators and bounded text; unrelated sections do not get a fixed lab',()=>{
  const sections=material.sectionsFromText('# 二次函数\na=2，h=1。\n# 生物\n细胞膜。','笔记.md');
  assert.equal(sections[0].startLine,1);assert.equal(sections[1].startLine,3);
  const sources=sections.map(s=>material.makeSource(s,{filePath:'v/n.md',name:'笔记.md'}));
  assert.deepEqual(sources[0].labs.map(l=>l.kind),['quadratic']);assert.deepEqual(sources[1].labs,[]);
  assert.ok(material.sectionsFromText('a'.repeat(21000),'长文.md').every(s=>s.text.length<=7000));
});
test('only explicit bounded parameter assignments are extracted; defaults are not labelled as original data',()=>{
  assert.deepEqual(material.extractParameters('force','F=20 N，m=4 kg，μ=0.1'),{force:20,mass:4,friction:.1});
  assert.deepEqual(material.extractParameters('probability','p=0.3，n=3'),{p:.3,n:3});
  assert.deepEqual(material.extractParameters('force','F=900，m=0，μ=-1'),{});
});
test('changed source, position or draft origin creates a different immutable snapshot',()=>{
  const section={section:'概念',text:'引用文字',startLine:1,endLine:2};
  const a=material.makeSource(section,{filePath:'v/n.md',name:'n.md'});
  assert.notEqual(a.id,material.makeSource({...section,startLine:4,endLine:5},{filePath:'v/n.md',name:'n.md'}).id);
  assert.notEqual(a.id,material.makeSource(section,{filePath:'v/n.md',name:'n.md',origin:'draft'}).id);
});
test('English sentence punctuation preserves explicit zero friction without truncating malformed decimals or exponents',()=>{
  assert.deepEqual(material.extractParameters('force','F=20 N, m=4 kg, μ=0.'),{force:20,mass:4,friction:0});
  assert.deepEqual(material.extractParameters('probability','p=0.3. n=2.'),{p:.3,n:2});
  assert.deepEqual(material.extractParameters('quadratic','a=1.2.3, h=1e2, k=1..2'),{});
  const c=require('./shared/competition-content.json'),source=material.makeSource(material.sectionsFromText(c.source,'Force-and-acceleration.md')[0],{filePath:'demo.md',name:'demo.md'});
  assert.deepEqual(source.labs[0].parameters,{force:20,mass:4,friction:0});
});
test('Word extraction is usable as learning context',async()=>{
  const file=path.join(root,'sample.docx');fs.writeFileSync(file,await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('独立事件：p=0.5，n=2。')]}]})));
  const r=await material.readMaterial({filePath:file});assert.match(r.sources[0].text,/独立事件/);assert.equal(r.sources[0].labs[0].kind,'probability');
});
test('PDF reads a selected page range and retains actual page locators',async()=>{
  const texts=['Newton second law. F=20 N, m=4 kg.','Independent trials. p=0.5, n=2.'];
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>'];
  texts.forEach((text,i)=>{objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 7 0 R >> >> /Contents ${4+2*i} 0 R >>`);const stream=`BT /F1 12 Tf 40 760 Td (${text}) Tj ET`;objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);});
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});const start=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  const file=path.join(root,'sample.pdf');fs.writeFileSync(file,pdf);
  const r=await material.readMaterial({filePath:file,pageStart:2,pageEnd:2});assert.equal(r.totalPages,2);assert.equal(r.sources[0].page,2);assert.equal(r.sources[0].labs[0].kind,'probability');assert.match(r.sources[0].text,/Independent/);
  await assert.rejects(()=>material.readMaterial({filePath:file,pageStart:0,pageEnd:2}),/页码/);
});
test('IPC rejects paths outside current vault and source IDs from other vaults',async()=>{
  const f=fixture();try{
    const r=await f.call('material',{path:f.file});assert.equal(r.ok,true);
    fs.writeFileSync(path.join(f.other,'outside.md'),'其他资料');assert.equal((await f.call('material',{path:path.join(f.other,'outside.md')})).ok,false);
    setVault(f.other);assert.equal((await f.call('source',{vault:f.other,sourceId:r.sources[0].id})).ok,false);
  }finally{f.close();}
});
test('selected excerpt must literally belong to source; open tasks preserve citations and remain self-reviewed',async()=>{
  const f=fixture();try{
    const src=(await f.call('material',{path:f.file})).sources[0];
    assert.equal((await f.call('excerpt',{sourceId:src.id,text:'伪造的引用文字'})).ok,false);
    const ref=(await f.call('excerpt',{sourceId:src.id,text:'牛顿第二定律指出合力决定加速度。'})).source;
    const a=(await f.call('createTask',{sourceId:ref.id,mode:'detective',focus:'检查适用条件'})).activity;
    assert.equal(a.sourceRef.id,ref.id);assert.equal('answer'in a,false);
    const r=await submit(f,a,'恒力改变加速度，不能直接说恒力决定速度。');assert.equal(r.ok,true);assert.equal(r.attempt.correct,null);
    await f.call('annotate',{id:r.attempt.id,selfVerdict:'correct'});assert.equal((await f.call('summary')).independent,0);
  }finally{f.close();}
});
test('labs require a matching source or an explicitly enabled example',async()=>{
  const f=fixture();try{
    const sources=(await f.call('material',{path:f.file})).sources;
    assert.equal((await f.call('lab',{kind:'force',params:{},sourceId:sources[1].id})).ok,false);
    assert.equal((await f.call('lab',{kind:'quadratic',params:{}})).ok,false);
    assert.equal((await f.call('lab',{kind:'quadratic',params:{},example:true})).ok,true);
  }finally{f.close();}
});
test('prediction alone is not verified experiment evidence; observations require completed measurements',async()=>{
  const f=fixture();try{
    const source=(await f.call('material',{path:f.file})).sources[0],a=(await f.call('lab',{kind:'force',params:{},sourceId:source.id})).activity;
    const r=await submit(f,a,'4.02');assert.equal(r.ok,true);assert.equal((await f.call('summary')).independent,0);
    assert.equal((await f.call('annotate',{id:r.attempt.id,observation:'实验观察'})).ok,false);
    assert.equal((await f.call('annotate',{id:r.attempt.id,observation:'实验观察',measurement:{time:2}})).ok,false);
    const saved=await f.call('annotate',{id:r.attempt.id,observation:'三秒位移为18.09米，加速度保持不变。',measurement:{time:3,displacement:999}});
    assert.equal(saved.ok,true);assert.ok(Math.abs(saved.attempt.measurement.displacement-18.09)<1e-9);assert.equal(saved.attempt.labVerified,true);
    assert.equal((await f.call('summary')).independent,1);
  }finally{f.close();}
});
test('comparison enforces one changed parameter and the same source; seeded sample statistics are recomputed',async()=>{
  const f=fixture();try{
    const a=(await f.call('lab',{kind:'probability',params:{},example:true})).activity,r=await submit(f,a,'75');
    const saved=await f.call('annotate',{id:r.attempt.id,observation:'抽样频率会波动，增加组数不保证每步都更接近理论值。',measurement:{count:1000,success:99999}});
    assert.equal(saved.ok,true);assert.equal(saved.attempt.measurement.count,1000);assert.ok(saved.attempt.measurement.success<=1000);
    assert.equal((await f.call('lab',{kind:'probability',params:{p:.6,n:3},example:true,previousLabId:r.attempt.id})).ok,false);
    const b=await f.call('lab',{kind:'probability',params:{p:.6,n:2},example:true,previousLabId:r.attempt.id});assert.equal(b.ok,true);assert.equal(b.activity.previousLabId,r.attempt.id);
  }finally{f.close();}
});
test('AI report citations and repeat comparisons are stored separately from independently verified answers',async()=>{
  const f=fixture();try{
    const source=(await f.call('material',{path:f.file})).sources[0],transcript='合力决定加速度，必须考虑质量与适用条件。';
    // Test double only: no network or paid model is used.
    const companionCalls=new Map();registerCompanions({handle:(n,fn)=>companionCalls.set(n,fn)},f.app,{getBridge:async()=>({async *runHeadless(){yield{type:'final',text:JSON.stringify({summary:'测试替身反馈',dimensions:['accuracy','conditions','reasoning','clarity','examples','transfer'].map(id=>({id,score:id==='transfer'?null:2,evidence:id==='transfer'?'':transcript,reason:'测试依据',nextStep:'补充条件'})),questions:['条件改变后还能使用吗？']})};}})});
    const payload={vault:f.vault,roleId:'teacher',topic:'牛顿第二定律',transcript,sourceId:source.id};
    const first=await companionCalls.get('companions:evaluate')(null,payload);assert.equal(first.ok,true);assert.equal(first.report.sourceRef.id,source.id);
    const second=await companionCalls.get('companions:evaluate')(null,{...payload,previousId:first.report.id});assert.equal(second.ok,true);assert.equal(second.report.comparison.length,5);
    assert.equal((await companionCalls.get('companions:evaluate')(null,{...payload,topic:'其他主题',previousId:first.report.id})).ok,false);
    const summary=await f.call('summary');assert.equal(summary.aiReportCount,2);assert.equal(summary.independent,0);assert.equal(summary.evidence[0].status,'unverified');assert.equal(summary.evidence[0].reportCount,2);
  }finally{f.close();}
});
