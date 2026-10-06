import {_electron as electron}from'playwright';import fs from'node:fs';import path from'node:path';import assert from'node:assert/strict';import {fileURLToPath}from'node:url';
import {execFileSync}from'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),out=path.join(root,'output/verification/branding-v3');fs.mkdirSync(out,{recursive:true});
const run=fs.mkdtempSync(path.join(out,'qa-')),exe=process.env.GEZHI_TEST_EXE;
const app=await electron.launch({executablePath:exe||path.join(here,'node_modules/electron/dist/electron.exe'),args:exe?[]:[here],env:{...process.env,GEZHI_TEST:'1',GEZHI_TEST_APPDATA:path.join(run,'appdata')},timeout:30000});
const checks=[],errors=[];const pass=name=>{checks.push(name);console.log('[PASS] '+name)};
const resourceIcons=[];
if(exe){
 // Extract executable resources with the native Windows API. Electron's
 // shell-associated icon lookup returned a generic executable-type thumbnail.
 // It is not a reliable test of the embedded RT_GROUP_ICON resource here.
 const candidates=[['program',exe],['installer',path.join(root,'dist/installer/0.0.5/格致-0.0.5-安装包.exe')]];
 const quote=value=>"'"+value.replaceAll("'","''")+"'";
 for(const [name,file] of candidates){
  if(!fs.existsSync(file))throw Error('Missing executable for icon verification: '+file);
  const png=path.join(run,name+'-embedded-icon.png');
  const code=`Add-Type -AssemblyName System.Drawing\n$extractedIcon=[System.Drawing.Icon]::ExtractAssociatedIcon(${quote(file)})\nif ($null -eq $extractedIcon) { throw 'No embedded icon' }\n$iconBitmap=$extractedIcon.ToBitmap()\ntry { $iconBitmap.Save(${quote(png)},[System.Drawing.Imaging.ImageFormat]::Png) } finally { $iconBitmap.Dispose(); $extractedIcon.Dispose() }`;
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{windowsHide:true,timeout:30000});
  resourceIcons.push({name,file,png});
 }
}
try{
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>Boolean(window.__gezhiTest));
 const src=await page.getByRole('img',{name:'格致',exact:true}).first().getAttribute('src');assert.ok(src.includes('gezhi-mark-v3'));pass('当前应用加载六维之窗新标志');
 assert.equal(await page.getByRole('img',{name:'格致',exact:true}).first().evaluate(async image=>{await image.decode();return image.naturalWidth}),1024);pass('打包后的新标志图片可正常解码显示');
 const icons=await app.evaluate(async({app,nativeImage},{root,resourceIcons})=>{
  const fs=process.getBuiltinModule('fs'),path=process.getBuiltinModule('path');const base=app.isPackaged?path.join(process.resourcesPath,'branding'):path.join(root,'brand/assets');
  // Shell icons can have only a high-DPI representation. Normalize through PNG
  // so the bitmap dimensions are physical pixels, not logical display points.
  const inspect=image=>{const normalized=nativeImage.createFromBuffer(image.toPNG()),{width,height}=normalized.getSize(),b=normalized.getBitmap();if(!width||!height||b.length!==width*height*4)throw Error('Invalid native bitmap dimensions');const corners=[0,width-1,width*(height-1),width*height-1].map(at=>b[at*4+3]);let clear=0,solid=0;for(let i=3;i<b.length;i+=4){if(b[i]===0)clear++;if(b[i]>200)solid++;}return{width,height,corners,clearRatio:clear/(width*height),solidRatio:solid/(width*height)}};
  const result={png:inspect(nativeImage.createFromPath(path.join(base,'icon-256.png')))};
  const ico=fs.readFileSync(path.join(root,'brand/assets/app.ico'));result.frames=[];for(let i=0;i<ico.readUInt16LE(4);i++){const at=6+i*16,length=ico.readUInt32LE(at+8),offset=ico.readUInt32LE(at+12);result.frames.push(inspect(nativeImage.createFromBuffer(ico.subarray(offset,offset+length))))}
  result.embedded=resourceIcons.map(({name,file,png})=>({name,file,...inspect(nativeImage.createFromPath(png))}));return result;
 },{root,resourceIcons});
 fs.writeFileSync(path.join(run,'icons.json'),JSON.stringify(icons,null,2));
 for(const icon of [icons.png,...icons.frames]){assert.ok(icon.corners.every(a=>a===0));assert.ok(icon.clearRatio>.3);assert.ok(icon.solidRatio>.08);}assert.equal(icons.frames.length,7);pass('PNG 和七个 ICO 尺寸都有真实透明背景及可见标志');
 for(const icon of icons.embedded){assert.ok(icon.corners.every(a=>a===0));assert.ok(icon.clearRatio>.3);assert.ok(icon.solidRatio>.08);pass((icon.name==='program'?'程序':'安装包')+'实际嵌入的 Windows 图标保留透明背景');}
 await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.webContents.setBackgroundThrottling(false);win.setSize(1200,800);win.hide()});
 for(const theme of ['light','dark']){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);const filter=await page.getByRole('img',{name:'格致',exact:true}).first().evaluate(el=>getComputedStyle(el).filter);assert.ok(filter.includes('brightness(0)'));if(theme==='dark')assert.ok(filter.includes('invert(1)'));}pass('深浅色界面分别显示反白与黑色标志');
 assert.deepEqual(errors,[]);pass('应用无渲染异常');fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({checks,errors,run,packaged:Boolean(exe),icons},null,2));
}finally{await app.close()}
