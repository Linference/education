import fs from 'node:fs';
import path from 'node:path';
const OUT=path.resolve('产出/demo-video-20261002'),backup=path.join(OUT,'revision-v1');fs.mkdirSync(backup,{recursive:true});
for(const name of ['DemoVideo_Gezhi.mp4','DemoVideo_Gezhi_Compact.mp4','DemoVideo_Gezhi.en.srt','timeline.json','README.md','delivery-verification.json','recorded-ai-events.json','capture-manifest.json']){
 const source=path.join(OUT,name),target=path.join(backup,name);if(fs.existsSync(source)&&!fs.existsSync(target))fs.copyFileSync(source,target);
}
fs.mkdirSync(path.join(backup,'audio'),{recursive:true});for(const name of fs.readdirSync(path.join(OUT,'audio'))){if(name.endsWith('.wav')&&!fs.existsSync(path.join(backup,'audio',name)))fs.copyFileSync(path.join(OUT,'audio',name),path.join(backup,'audio',name));}
for(const id of ['02-ai-writes','03-markdown','04-pdf','05-word']){
 for(const ext of ['.png']){const source=path.join(OUT,id+ext),target=path.join(backup,id+ext);if(fs.existsSync(source)&&!fs.existsSync(target))fs.copyFileSync(source,target);}
 const source=path.join(OUT,'capture',id+'.mp4'),target=path.join(backup,id+'.mp4');if(fs.existsSync(source)&&!fs.existsSync(target))fs.copyFileSync(source,target);
}
// Move only the three generated demonstration files, with both absolute paths checked.
for(const ext of ['md','pdf','docx']){const from=path.resolve(OUT,'Demo Library','My Study Guide.'+ext),to=path.resolve(backup,'My Study Guide.'+ext);if(!from.startsWith(OUT+path.sep)||!to.startsWith(OUT+path.sep))throw Error('Backup path outside video workspace');if(fs.existsSync(from)&&!fs.existsSync(to))fs.renameSync(from,to);}
const source=fs.readFileSync('scripts/video/record-demo.mjs','utf8');
let start=source.slice(0,source.indexOf(' if(!resume){'));
start=start.replace("path.join(OUT,'film-appdata')","path.join(OUT,'film-appdata-v3')");
start=start.replace('BrowserWindow.getAllWindows()[0].setContentSize(1440,810);',"const w=BrowserWindow.getAllWindows()[0];w.unmaximize();w.setContentSize(1440,810);w.webContents.setZoomFactor(1);w.setResizable(false);w.setMaximizable(false);");
start=start.replace("async function begin(name){","async function assertViewport(){const v=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio}));if(v.width!==1440||v.height!==810||v.dpr!==1)throw Error('Unexpected capture viewport '+JSON.stringify(v));}\nasync function begin(name){await assertViewport();");
start=start.replace('async function end(name){','async function end(name){await assertViewport();');
const workflow=source.slice(source.indexOf(" const writer=page.locator('.ai-chat textarea');"),source.indexOf("\n }\n if(resume)"));
const changed=workflow.replace('Include headings, a table, a worked example','Include headings, a three-column comparison table with a header and exactly four feature rows (Vertex, Axis, Opening, Width), a worked example').replace('Use file tools to write it.','Use file read/write tools only; do not run shell commands or count words.').replace('Reply briefly in English.','Reply in English with one short sentence about the guide.');
const ending=source.slice(source.indexOf('} catch(e){'));
fs.writeFileSync('scripts/video/record-workflow-retake.mjs',start+changed+"\n console.log('Locked 1440 x 810 workflow retake completed');\n"+ending);
console.log('First revision preserved; locked-window recorder prepared');
