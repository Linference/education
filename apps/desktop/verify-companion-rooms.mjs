import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../..');
const out=path.join(ROOT,'output/verification/companion-rooms');fs.mkdirSync(out,{recursive:true});
const run=fs.mkdtempSync(path.join(out,'qa-')),vault=path.join(run,'学习资料'),other=path.join(run,'另一库');fs.mkdirSync(vault);fs.mkdirSync(other);
const live=process.argv.includes('--live');
const nativeAppData=process.env.APPDATA;
const note=path.join(vault,'条件与反例.md');fs.writeFileSync(note,'# 二次函数\n\ny=a(x-h)^2+k，a 不等于零。a>0 时有最小值，a<0 时有最大值。');
const image=path.join(vault,'图 像(1).png');fs.copyFileSync(path.join(HERE,'renderer/src/assets/companion-roles-v1.png'),image);
for(const name of ['gezhi.typ','gezhi-handout.typ'])fs.writeFileSync(path.join(vault,name),'USER FILE: PRESERVE');
const app=await electron.launch({executablePath:process.env.GEZHI_TEST_EXE || path.join(HERE,'node_modules/electron/dist/electron.exe'),args:process.env.GEZHI_TEST_EXE?[]:[HERE],env:{...process.env,GEZHI_TEST:'1',GEZHI_TEST_APPDATA:path.join(run,'appdata')},timeout:30000});
const checks=[],errors=[];let page;
const pass=name=>{checks.push({name,pass:true});console.log('[PASS] '+name);};
try{
  page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>Boolean(window.__gezhiTest));
  if(live) await app.evaluate(({BrowserWindow},original)=>{if(original)process.env.APPDATA=original;const win=BrowserWindow.getAllWindows()[0];win.webContents.setBackgroundThrottling(false);win.hide();},nativeAppData);
  if(!live)await app.evaluate(async({ipcMain,app},root)=>{
    const require=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json');
    root=app.getAppPath();
    for(const name of ['roles','history','evaluate','stop','startSession','session','sessions','saveDraft','loadDraft','reply'])ipcMain.removeHandler('companions:'+name);
    const rubric=require(root+'/shared/companion-rubric.cjs');
    require(root+'/main/companion-ipc.cjs').registerCompanions(ipcMain,app,{getBridge:async()=>({async *runHeadless(){await new Promise(r=>setTimeout(r,150));yield {type:'final',text:JSON.stringify({summary:'你说明了顶点，但应补充开口方向与条件。',dimensions:rubric.DIMENSIONS.map((d,i)=>({id:d.id,score:i===4?null:2,evidence:'顶点是 (h,k)',reason:'检查你实际说出的条件。',nextStep:'给出 a 小于零的反例。'})),questions:['a 小于零时还存在最小值吗？','怎样用一个例子解释？'],referenceLimit:'AI 测试替身，用于界面与持久化验证。'})};}})});
  },HERE);
  const setup=await page.evaluate(()=>window.gezhi.dshSetup.status());assert.equal(setup.installerBundled,true);pass('DeepSeek Harness 安装程序可被本地或打包版定位');
  if(!live){
    await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('dsh:setupStatus');ipcMain.handle('dsh:setupStatus',()=>({ok:true,installed:true,installerBundled:true,completed:false}));});
    await page.goto(page.url()+'&onboarding=1');const onboarding=page.getByRole('dialog',{name:'连接你的 AI 学习伙伴'});await onboarding.waitFor();assert.equal(await onboarding.locator('input[type=password]').count(),0);pass('首次启动显示连接引导，格致不收集账号密码');
    await page.getByRole('button',{name:'暂时离线使用笔记和题库'}).click();
  }
  await app.evaluate(({dialog})=>{dialog.showSaveDialog=async(_w,options)=>({canceled:false,filePath:options.defaultPath});});
  await page.evaluate(v=>window.__gezhiTest.openVault(v),vault);await page.evaluate(p=>window.__gezhiTest.openFileByPath(p),note);
  await page.getByRole('button',{name:'学习工作室',exact:true}).click();await page.getByTestId('companion-lobby').waitFor();assert.equal(await page.locator('.companion-card').count(),5);pass('学习工作区默认展示五个独立角色方框');
  await page.screenshot({path:path.join(run,'roles-lobby.png')});
  await page.locator('.companion-card').nth(1).click();await page.getByTestId('companion-room').waitFor();assert.match(await page.locator('.room-toolbar').textContent(),/林老师/);pass('点击进入教师空间，当前资料作为可选参考');
  await page.getByRole('textbox',{name:'角色文字讲解'}).fill('二次函数的顶点是 (h,k)，顶点总是最小值。比如 y=-(x-2)^2+1 的最小值是 1。');
  await page.getByRole('button',{name:'讲完了，生成六维反馈'}).click();await page.waitForFunction(()=>Boolean(document.querySelector('[data-testid=companion-report]')) || Boolean(document.querySelector('.companion-room .learning-error')),{},{timeout:150000});
  if(await page.locator('.companion-room .learning-error').count())throw Error(await page.locator('.companion-room .learning-error').textContent());
  assert.equal(await page.locator('.assessment-dimensions section').count(),6);assert.ok(await page.getByTestId('assessment-radar').count());pass(live?'真实配置 AI 返回六维反馈并保存':'六维反馈、引用依据、改进建议及缺失证据状态显示（AI 测试替身）');
  const h=await page.evaluate(v=>window.gezhi.companions.history({vault:v,roleId:'teacher'}),vault);assert.equal(h.reports.length,1);assert.equal(h.reports[0].dimensions.length,6);pass('讲解原文、角色与六维评估落入本机数据库');
  await page.screenshot({path:path.join(run,'teacher-feedback.png')});
  await page.getByRole('button',{name:'导出反馈',exact:true}).click();assert.match(fs.readFileSync(path.join(vault,'讲解六维反馈.导出.md'),'utf8'),/概念准确性/);pass('六维报告可以真实导出 Markdown');
  await page.getByRole('button',{name:'返回角色空间',exact:false}).click();await page.locator('.companion-card').first().click();assert.equal(await page.locator('.room-history button').count(),0);pass('同学与教师空间的讲解记录分别保存');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1050,760));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));pass('小窗口学习空间不产生整页横向溢出');
  const md='# 题库导出\n\n中文、表格和公式。\n\n| 项目 | 值 |\n|---|---|\n| 加速度 | 4.02 |\n\n$$\\frac{1}{2}at^2$$\n\n![角色](<图 像(1).png>)\n\n![缺失图片](not-found.png)';
  const exports=await page.evaluate(async({vault,note,md})=>Promise.all(['A','B'].map(name=>window.gezhi.exporter.run({format:'pdf',markdown:md,sourcePath:note,defaultName:'图片与公式-'+name}))),{vault,note,md});
  for(const r of exports){assert.equal(r.ok,true,r.error);assert.equal(fs.readFileSync(r.path).subarray(0,4).toString(),'%PDF');assert.ok(r.warnings.some(w=>w.includes('not-found')));}
  for(const name of ['gezhi.typ','gezhi-handout.typ'])assert.equal(fs.readFileSync(path.join(vault,name),'utf8'),'USER FILE: PRESERVE');pass('并行 PDF 导出支持中文带空格括号的图片路径，缺图提示，原模板文件保持完整');
  const docx=await page.evaluate(({note})=>window.gezhi.exporter.run({format:'docx',markdown:'1. 细胞膜作用是什么？\n答案：控制物质进出。\n2. DNA 在哪里？\n答案：细胞核',sourcePath:note,defaultName:'导入测试'}),{note});assert.equal(docx.ok,true,docx.error);
  const parsed=await page.evaluate(async p=>window.gezhi.bank.parseDocument({name:'试题.docx',bytes:new Uint8Array(await window.gezhi.file.readBinary(p).then(r=>r.bytes))}),docx.path);
  // readBinary returns a transferable byte array in the actual preload API.
  assert.equal(parsed.ok,true,parsed.error);assert.equal(parsed.count,2);pass('Word 文件通过实际文档解析器导入两道编号题');
  const textPdf=await page.evaluate(({note})=>window.gezhi.exporter.run({format:'pdf',markdown:'1. 细胞膜作用是什么？\n\n答案：控制物质进出。\n\n2. DNA 在哪里？\n\n答案：细胞核',sourcePath:note,defaultName:'文字PDF导入测试'}),{note});assert.equal(textPdf.ok,true,textPdf.error);
  const pdfQuestions=await page.evaluate(async p=>window.gezhi.bank.parseDocument({name:'试题.pdf',bytes:new Uint8Array(await window.gezhi.file.readBinary(p).then(r=>r.bytes))}),textPdf.path);assert.equal(pdfQuestions.ok,true,pdfQuestions.error);assert.equal(pdfQuestions.count,2);pass('文字层 PDF 使用实际解析器导入两道编号题');
  const outside=await page.evaluate(v=>window.gezhi.companions.history({vault:v,roleId:'teacher'}),other);assert.equal(outside.ok,false);pass('角色记录拒绝读取当前资料库之外的路径');
  assert.deepEqual(errors,[]);pass('整个流程没有未处理的渲染异常');
}catch(e){checks.push({name:'integration',pass:false,detail:e.stack});console.error(e);process.exitCode=1;if(page)await page.screenshot({path:path.join(run,'failure.png')}).catch(()=>{});}
finally{await app.close();fs.writeFileSync(path.join(out,live?'live-verification.json':'verification.json'),JSON.stringify({at:new Date().toISOString(),liveAI:live,checks,errors,run},null,2));}
