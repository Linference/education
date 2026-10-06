import {chromium} from 'playwright';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL}from'node:url';import {spawn}from'node:child_process';import {once}from'node:events';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),out=path.join(root,'output/transition-study');
fs.copyFileSync(path.join(root,'apps/desktop/renderer/src/assets/companion-roles-v1.png'),path.join(out,'roles.png'));
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
let encoder;
try{const page=await browser.newPage({viewport:{width:1280,height:850}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(path.join(out,'index.html')).href);await page.waitForFunction(()=>window.ready);
 await page.evaluate(()=>{document.body.style.padding='0';document.querySelector('header').style.display='none';document.querySelector('.stage-shell').style.borderRadius='0';document.querySelector('.stage-shell').style.width='1280px';window.dispatchEvent(new Event('resize'))});
 const shot=options=>page.screenshot({clip:{x:0,y:0,width:1280,height:720},...options});for(const t of [0.8,2.3,3.6,4.5,6.2,7.7,8.6,10.0,11.7]){await page.evaluate(t=>window.renderAt(t),t);await shot({path:path.join(out,`frame-${t}.png`)});}if(errors.length)throw Error(errors.join('\n'));console.log('Contact frames saved');
 if(process.argv.includes('--qa-only'))process.exitCode=0;
 else{
  const target=path.join(out,'GEZHI-Transition-Study.mp4');encoder=spawn('ffmpeg',['-y','-v','error','-f','image2pipe','-vcodec','png','-framerate','60','-i','pipe:0','-an','-c:v','h264_nvenc','-preset','p5','-cq','18','-pix_fmt','yuv420p','-movflags','+faststart',target],{windowsHide:true});let stderr='';encoder.stderr.on('data',b=>stderr+=b);const done=once(encoder,'close');
  for(let i=0;i<720;i++){await page.evaluate(t=>window.renderAt(t),i/60);const buffer=await shot();if(!encoder.stdin.write(buffer))await once(encoder.stdin,'drain');if(i%120===0)console.log('Rendered '+i+'/720');}
  encoder.stdin.end();const [code]=await done;if(code!==0)throw Error(stderr);fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({duration:12,fps:60,width:1280,height:720,frames:720,errors,paidCalls:0,silentMotionStudy:true,video:target},null,2));console.log(target);
 }
}finally{if(encoder&&!encoder.killed)encoder.stdin.destroy();await browser.close();}
