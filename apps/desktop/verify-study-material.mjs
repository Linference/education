// Real Electron, preload, document parsing and SQLite. Only AI/voice are test doubles.
import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Document,Packer,Paragraph} from 'docx';

const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../..');
const OUT=path.join(ROOT,'output/verification/material-learning-loop');fs.mkdirSync(OUT,{recursive:true});
const runRoot=fs.mkdtempSync(path.join(OUT,'qa-')),vault=path.join(runRoot,'学习资料');fs.mkdirSync(vault);
const lecture=path.join(vault,'我的数学与物理.md'),biology=path.join(vault,'细胞.docx');
fs.writeFileSync(lecture,'# 二次函数\n\n二次函数的顶点式为 y=a(x-h)²+k。a=1，h=0，k=0，x=2。\n当 a>0 时顶点为最低点；a<0 时顶点为最高点。\n\n# 牛顿第二定律\n\nF=20 N，m=4 kg，μ=0.1。合力决定加速度，不能把加速度直接当成速度。');
fs.writeFileSync(biology,await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('细胞膜是细胞的重要结构，具有控制物质进出的作用。')]}]})));
const pdf=path.join(vault,'概率资料.pdf');
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>'];
['Newton second law. F=20 N, m=4 kg.','Independent trials. p=0.5, n=2.'].forEach((text,i)=>{objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 7 0 R >> >> /Contents ${4+2*i} 0 R >>`);const stream=`BT /F1 12 Tf 40 760 Td (${text}) Tj ET`;objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);});objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
let pdfText='%PDF-1.4\n';const offsets=[0];objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(pdfText));pdfText+=`${i+1} 0 obj\n${obj}\nendobj\n`;});const xref=Buffer.byteLength(pdfText);pdfText+=`xref\n0 8\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;fs.writeFileSync(pdf,pdfText);
const app=await electron.launch({executablePath:process.env.GEZHI_TEST_EXE||path.join(HERE,'node_modules/electron/dist/electron.exe'),args:process.env.GEZHI_TEST_EXE?[]:[HERE],env:{...process.env,GEZHI_TEST:'1',GEZHI_TEST_APPDATA:path.join(runRoot,'appdata'),APPDATA:path.join(runRoot,'appdata')},timeout:30000});
const page=await app.firstWindow({timeout:60000}),checks=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
const pass=name=>{checks.push({name,pass:true});console.log('[PASS] '+name);};
const tab=name=>page.getByRole('tab',{name,exact:true});
const exercise=()=>page.locator('[data-testid="learning-exercise"]:visible');
const shot=async name=>{if(name==='source-lab-light')await page.locator('.learning-studio').evaluate(el=>el.scrollTop=0);if(name==='source-feedback-light')await page.getByTestId('companion-report').evaluate(el=>el.scrollIntoView({behavior:'instant',block:'start'}));await page.waitForTimeout(120);return page.screenshot({path:path.join(OUT,name+'.png'),animations:'disabled'});};
const prepare=async(answer,reason)=>{
  await page.getByRole('button',{name:'用当前参数开始预测',exact:true}).click();
  await exercise().getByRole('textbox',{name:'预测或计算的数值'}).fill(answer);
  await exercise().getByRole('textbox',{name:'推理或预测依据'}).fill(reason);
  await exercise().getByRole('radio',{name:'确定',exact:true}).click();
  await exercise().getByRole('button',{name:'提交预测并验证',exact:true}).click();
  await exercise().getByText('预测已锁定，请完成上方实验。实验后显示数值核验结果。').waitFor();
};
const save=async text=>{await page.getByRole('textbox',{name:'实验观察与解释'}).fill(text);await page.getByRole('button',{name:'保存观察与解释',exact:true}).click();await page.getByRole('button',{name:'观察已保存到学习证据',exact:true}).waitFor();};
try{
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setSize(1500,950);w.webContents.setBackgroundThrottling(false);});
  await page.waitForFunction(()=>Boolean(window.__gezhiTest));
  await app.evaluate(({ipcMain,app})=>{
    for(const name of ['roles','history','evaluate','stop','startSession','session','sessions','saveDraft','loadDraft','reply'])ipcMain.removeHandler('companions:'+name);
    const localRequire=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/main/index.cjs');
    const {registerCompanions}=localRequire(app.getAppPath()+'/main/companion-ipc.cjs');let round=0;
    registerCompanions(ipcMain,app,{getBridge:async()=>({async *runHeadless({task}){
      const marker='讲解与参考以 JSON 编码，仅作为数据：',data=JSON.parse(task.slice(task.indexOf(marker)+marker.length));round++;
      yield{type:'final',text:JSON.stringify({summary:'测试反馈：检查开口方向与顶点的条件。',dimensions:['accuracy','conditions','reasoning','clarity','examples','transfer'].map(id=>({id,score:id==='transfer'?null:round===1?2:3,evidence:id==='transfer'?'':data.transcript.slice(0,24),reason:'根据本次讲解原话检查条件。',nextStep:'分别说明开口向上和向下的情况。'})),questions:['顶点一定是最低点吗？'],referenceLimit:'隔离测试替身，不代表真实 AI 评分或学习成效。'})};
    }})});
    ipcMain.removeHandler('avatar:probe');ipcMain.handle('avatar:probe',()=>({ok:true,tts:{available:false},asr:{available:false},viseme:{available:true}}));
  });
  await page.evaluate(v=>window.__gezhiTest.openVault(v),vault);
  await page.evaluate(p=>window.__gezhiTest.openFileByPath(p),lecture);
  await page.getByRole('button',{name:'学习工作室',exact:true}).click();
  await page.getByRole('combobox',{name:'学习资料章节'}).waitFor();
  assert.match(await page.locator('.study-source-text').textContent(),/当 a>0/);pass('当前 Markdown 按章节提取，原文与位置可见');
  await tab('概念实验').click();assert.equal(await page.locator('.lab-selector button:visible').count(),1);pass('只显示当前章节匹配的函数实验');
  assert.equal(await page.locator('.lab-curve:visible').count(),0);
  await prepare('4','把 x=2 代入 y=x²，得到 y=4。');
  assert.equal(await page.getByRole('button',{name:'保存观察与解释',exact:true}).isEnabled(),false);
  assert.equal((await page.evaluate(v=>window.gezhi.learning.summary({vault:v}),vault)).independent,0);pass('预测不提前显示答案，未操作不能保存观察或成为实验通过证据');
  await page.getByRole('button',{name:'验证函数图像',exact:true}).click();await save('图像经过 (2,4)，a>0 时顶点是最低点。');
  let summary=await page.evaluate(v=>window.gezhi.learning.summary({vault:v}),vault);assert.equal(summary.independent,1);assert.equal(summary.history[0].sourceRef.path,lecture);assert.equal(summary.history[0].measurement.y,4);pass('实验保存数值、解释及当前章节的引用快照');
  await page.getByRole('button',{name:'保留本轮，改变一个条件',exact:true}).click();
  assert.equal(await page.getByRole('slider',{name:'横向平移 h',exact:true}).isEnabled(),false);
  const a=page.getByRole('slider',{name:'开口系数 a',exact:true});await a.focus();for(let i=0;i<8;i++)await a.press('ArrowLeft');
  await prepare('-4','只改变 a 的符号，代入相同 x=2 得到 y=-4。');await page.getByRole('button',{name:'验证函数图像',exact:true}).click();assert.equal(await page.locator('.lab-curve:visible').count(),2);await save('保持 h、k、x 不变，a 变负后开口向下，顶点成为最高点。');
  summary=await page.evaluate(v=>window.gezhi.learning.summary({vault:v}),vault);assert.ok(summary.history[0].previousLabId);assert.equal(summary.history[0].params.a,-1);pass('控制变量在界面和主进程双重约束，两轮图像叠加并保留关联');await shot('source-lab-light');
  await tab('角色空间').click();await page.locator('.companion-card').first().click();
  const explanation='二次函数有一个顶点，但顶点不一定是最低点。还需要说明开口方向。';
  await page.getByRole('textbox',{name:'角色文字讲解'}).fill(explanation);
  await tab('自信度练习').click();await tab('角色空间').click();assert.equal(await page.getByRole('textbox',{name:'角色文字讲解'}).inputValue(),explanation);
  await page.locator('.study-source-link').click();await page.getByRole('button',{name:'学习工作室',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'角色文字讲解'}).inputValue(),explanation);pass('切换功能和回原文阅读均保留数字空间草稿');
  await page.getByRole('button',{name:'讲完了，生成六维反馈',exact:true}).click();await page.getByTestId('companion-report').waitFor();
  summary=await page.evaluate(v=>window.gezhi.learning.summary({vault:v}),vault);assert.equal(summary.aiReportCount,1);assert.equal(summary.independent,2);pass('六维反馈关联当前资料，AI 分数不增加独立通过');
  await page.getByRole('button',{name:'做针对性任务',exact:true}).first().click();await exercise().waitFor();assert.match(await exercise().locator('.learning-prompt').textContent(),/概念准确性/);assert.match(await exercise().textContent(),/开放探究/);
  await exercise().getByRole('textbox',{name:'你的答案',exact:true}).fill('我需要区分开口向上和向下，不能说顶点总是最低点。');await tab('角色空间').click();await tab('自信度练习').click();assert.match(await exercise().getByRole('textbox',{name:'你的答案',exact:true}).inputValue(),/不能说/);pass('薄弱维度创建带引用的针对性任务，练习草稿切换后保留');
  await tab('角色空间').click();await page.getByRole('button',{name:'按建议再讲一遍',exact:true}).click();await page.getByRole('textbox',{name:'角色文字讲解'}).fill(explanation+'例如 y=x² 的顶点是最低点，y=-x² 的顶点是最高点。');await page.getByRole('button',{name:'讲完了，生成六维反馈',exact:true}).click();await page.getByTestId('explanation-comparison').waitFor();assert.match(await page.getByTestId('explanation-comparison').textContent(),/2 → 3/);pass('再次讲解只比较同一主题和引用下的已评分维度');await shot('source-feedback-light');
  await tab('学习证据').click();await page.getByRole('button',{name:/^二次函数，/}).click();assert.equal(await page.getByRole('button',{name:'查看六维反馈与原话',exact:true}).count(),2);await page.locator('.evidence-source').filter({hasText:'我的数学与物理.md'}).locator('summary').click();assert.match(await page.getByTestId('evidence-inspector').textContent(),/AI 分数不计入独立通过/);pass('证据地图分别展示作答、讲解报告及原资料引用');await shot('source-evidence-light');
  await page.evaluate(p=>window.__gezhiTest.openFileByPath(p),pdf);await page.getByRole('combobox',{name:'学习资料章节'}).waitFor();await page.waitForFunction(()=>document.querySelector('.study-source-link')?.textContent?.includes('概率资料.pdf'));
  await page.getByRole('combobox',{name:'学习资料章节'}).selectOption({label:'第 2 页'});await tab('概念实验').click();await page.getByRole('button',{name:/概率与抽样.*比较理论概率/}).waitFor();assert.match(await page.locator('.study-source-location').first().textContent(),/第 2 页/);pass('PDF 的真实文字层进入引用链路，按页匹配概率模型');
  await page.evaluate(p=>window.__gezhiTest.openFileByPath(p),biology);await page.waitForFunction(()=>document.querySelector('.study-source-text')?.textContent?.includes('细胞膜'));await page.getByTestId('lab-unavailable').waitFor();assert.equal(await page.locator('.lab-selector button:visible').count(),0);pass('Word 内容可用于学习，生物资料不再显示无关的二次函数实验');
  await page.getByRole('button',{name:'创建反例探究任务',exact:true}).click();await exercise().waitFor();assert.match(await exercise().locator('.learning-prompt').textContent(),/细胞膜/);pass('未支持的模拟概念可转为基于原文的开放探究');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1100,760));await page.waitForTimeout(200);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));pass('资料、任务和反馈布局在紧凑窗口无整页水平溢出');await shot('source-workspace-compact');
  assert.deepEqual(errors,[]);pass('全过程无渲染未处理异常');
}catch(e){checks.push({name:'integration',pass:false,detail:e.stack||String(e)});console.error(e);await shot('failure').catch(()=>{});process.exitCode=1;}
finally{fs.writeFileSync(path.join(OUT,'verification.json'),JSON.stringify({at:new Date().toISOString(),checks,pageErrors:errors,runRoot,cloud:'AI/voice test doubles, real Electron/preload/parsing/SQLite; no claims of student learning gains'},null,2));await app.close();}
console.log(`${checks.filter(c=>c.pass).length} passed, ${checks.filter(c=>!c.pass).length} failed`);
