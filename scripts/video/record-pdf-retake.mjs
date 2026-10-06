import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const ROOT=process.cwd(), OUT=path.join(ROOT,'产出/demo-video-20261002'), VAULT=path.join(OUT,'Demo Library');
const RAW=path.join(OUT,'capture');fs.mkdirSync(RAW,{recursive:true});
const app=await electron.launch({executablePath:path.join(ROOT,'apps/desktop/node_modules/electron/dist/electron.exe'),args:[path.join(ROOT,'apps/desktop'),'--force-device-scale-factor=1'],env:{...process.env,GEZHI_TEST:'1',GEZHI_DEMO_EN:'1',GEZHI_TEST_APPDATA:path.join(OUT,'film-appdata')}});
const finish=process.argv.includes('--finish'), resume=process.argv.includes('--resume')||finish;
let page,cdp,frames=[],started=0,recording=false,clipdir='';const manifest=resume?JSON.parse(fs.readFileSync(path.join(OUT,'capture-manifest.json'))):[],events=resume?JSON.parse(fs.readFileSync(path.join(OUT,'recorded-ai-events.json'))).events:[];
const pause=ms=>page.waitForTimeout(ms);
async function move(x,y){await page.mouse.move(x,y,{steps:18});await pause(300);}
async function click(loc){await loc.scrollIntoViewIfNeeded();const b=await loc.boundingBox();if(!b)throw Error('Invisible click');await move(b.x+b.width/2,b.y+b.height/2);await loc.click();await pause(420);}
async function type(loc,text){await click(loc);await loc.pressSequentially(text,{delay:16});await pause(600);}
async function shot(name){await pause(500);await page.screenshot({path:path.join(OUT,name+'.png')});}
async function begin(name){clipdir=path.join(RAW,name);fs.mkdirSync(clipdir,{recursive:true});frames=[];started=Date.now();recording=true;const f=path.join(clipdir,'000000.jpg');await page.screenshot({path:f,type:'jpeg',quality:92});frames.push({file:f,t:0});await cdp.send('Page.startScreencast',{format:'jpeg',quality:90,maxWidth:1440,maxHeight:810,everyNthFrame:1});}
async function end(name){await cdp.send('Page.stopScreencast');recording=false;const duration=(Date.now()-started)/1000;const lines=[];for(let i=0;i<frames.length;i++){lines.push("file '"+frames[i].file.replaceAll('\\','/').replaceAll("'","'\\''")+"'",'duration '+Math.max(.02,(frames[i+1]?.t??duration)-frames[i].t));}lines.push(lines[lines.length-2]);const list=path.join(clipdir,'frames.txt');fs.writeFileSync(list,lines.join('\n'));const output=path.join(RAW,name+'.mp4');const r=spawnSync('ffmpeg',['-y','-v','error','-f','concat','-safe','0','-i',list,'-vf','fps=30,scale=1440:810:flags=lanczos,setsar=1','-c:v','h264_nvenc','-preset','p5','-cq','18','-pix_fmt','yuv420p','-an',output],{windowsHide:true,encoding:'utf8'});if(r.status)throw Error(r.stderr);manifest.push({name,duration,frames:frames.length,file:output,actualOperation:true});fs.writeFileSync(path.join(OUT,'capture-manifest.json'),JSON.stringify(manifest,null,2));console.log('Captured '+name+' '+duration.toFixed(1)+'s / '+frames.length+' frames');}
async function open(name){await click(page.locator('.tree-row').filter({hasText:name}).first());await pause(1200);}
async function tab(id){await click(page.locator('#learning-tab-'+id));await pause(600);}
async function answer(choice,reason,correct=''){const ex=page.getByTestId('learning-exercise');const id=await ex.getAttribute('data-activity-id');await click(ex.locator(`input[name="answer-${id}"][value="${choice}"]`).locator('..'));if(correct)await click(ex.locator(`input[name="correction-${id}"]`).nth(correct.charCodeAt(0)-65).locator('..'));if(reason)await type(ex.locator('textarea'),reason);await click(ex.getByRole('radio',{name:'Confident',exact:true}));await pause(700);await click(ex.getByRole('button',{name:'Submit and record',exact:true}));await ex.getByTestId('learning-feedback').waitFor();await ex.getByTestId('learning-feedback').scrollIntoViewIfNeeded();await pause(2200);}
try {
 page=await app.firstWindow();await page.waitForFunction(()=>window.__gezhiTest);page.setDefaultTimeout(25000);
 await app.evaluate(({BrowserWindow},original)=>{process.env.APPDATA=original;BrowserWindow.getAllWindows()[0].setContentSize(1440,810);},process.env.APPDATA);
 await page.evaluate(v=>window.__gezhiTest.openVault(v),VAULT);await pause(1400);
 await page.exposeFunction('filmAIEvent',e=>events.push({at:Date.now(),event:e}));await page.evaluate(()=>window.gezhi.ai.onEvent(e=>window.filmAIEvent(e)));
 const health=await page.evaluate(()=>window.gezhi.ai.health());if(!health.ok)throw Error('Real AI unavailable');
 await page.addStyleTag({content:'.demo-cursor{position:fixed;left:-100px;top:-100px;width:22px;height:28px;z-index:999999;pointer-events:none;filter:drop-shadow(0 2px 2px #0008);transform:translate(-2px,-2px)}.demo-ring{position:fixed;z-index:999998;pointer-events:none;width:10px;height:10px;border:2px solid #9a89ff;border-radius:50%;animation:filmClick .6s ease-out forwards}@keyframes filmClick{to{transform:translate(-20px,-20px) scale(5);opacity:0}}'});
 await page.evaluate(()=>{const p=document.createElement('div');p.className='demo-cursor';p.innerHTML='<svg viewBox="0 0 22 28"><path d="M2 1L2 22L7 17L11 26L15 24L11 16L20 16Z" fill="white" stroke="#55489a" stroke-width="1.5"/></svg>';document.body.append(p);document.addEventListener('mousemove',e=>{p.style.left=e.clientX+'px';p.style.top=e.clientY+'px';});document.addEventListener('mousedown',e=>{const r=document.createElement('div');r.className='demo-ring';r.style.left=e.clientX+'px';r.style.top=e.clientY+'px';document.body.append(r);setTimeout(()=>r.remove(),650);});});
 cdp=await page.context().newCDPSession(page);cdp.on('Page.screencastFrame',e=>{cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});if(!recording)return;const file=path.join(clipdir,String(frames.length).padStart(6,'0')+'.jpg');fs.writeFileSync(file,Buffer.from(e.data,'base64'));frames.push({file,t:(Date.now()-started)/1000});});
 if((await page.locator('.theme-switch').innerText()).includes('Dark'))await click(page.locator('.theme-switch'));
 await page.evaluate(p=>window.__gezhiTest.openFileByPath(p),path.join(VAULT,'Concept Notes.md'));await pause(1200);

 await page.keyboard.press('Control+b');
 const md=fs.readFileSync(path.join(VAULT,'My Study Guide.md'),'utf8');
 const r=await page.evaluate(p=>window.gezhi.exporter.run(p),{format:'pdf',markdown:md,sourcePath:path.join(VAULT,'My Study Guide.md'),defaultName:'My Study Guide',saveAs:false});if(!r.ok)throw Error(r.error);
 await begin('04-pdf');await open('My Study Guide.pdf');await page.locator('.pdf-viewer canvas').waitFor({timeout:60000});await pause(1800);await shot('04-pdf');await click(page.locator('.pdf-toolbar button[title="Zoom in"]'));await pause(1200);await move(850,650);await page.mouse.wheel(0,210);await pause(1700);await end('04-pdf');
 console.log('PDF retake completed');
} catch(e){console.error(e);if(page){await page.screenshot({path:path.join(OUT,'capture-error.png')}).catch(()=>{});fs.writeFileSync(path.join(OUT,'capture-error-ui.txt'),await page.evaluate(()=>document.body.innerText).catch(()=>''));}process.exitCode=1;}
finally{fs.writeFileSync(path.join(OUT,'recorded-ai-events.json'),JSON.stringify({capturedAt:new Date().toISOString(),events},null,2));await app.close();}
