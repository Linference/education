import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const ROOT=process.cwd(), OUT=path.join(ROOT,'产出/demo-video-20261002');
const app=await electron.launch({executablePath:path.join(ROOT,'apps/desktop/node_modules/electron/dist/electron.exe'),args:[path.join(ROOT,'apps/desktop'),'--force-device-scale-factor=1'],env:{...process.env,GEZHI_TEST:'1',GEZHI_DEMO_EN:'1',GEZHI_TEST_APPDATA:path.join(OUT,'film-appdata')}});
try {
 const page=await app.firstWindow(); await page.waitForFunction(()=>window.__gezhiTest);
 await app.evaluate(({BrowserWindow},original)=>{process.env.APPDATA=original;BrowserWindow.getAllWindows()[0].setContentSize(1440,810);},process.env.APPDATA);
 await page.evaluate(v=>window.__gezhiTest.openVault(v),path.join(OUT,'Demo Library'));
 await page.waitForTimeout(1600);
 await page.evaluate(p=>window.__gezhiTest.openFileByPath(p),path.join(OUT,'Demo Library/Concept Notes.md'));
 await page.waitForTimeout(1000);
 await page.screenshot({path:path.join(OUT,'inspect-library.png')});
 console.log(JSON.stringify(await page.locator('button').evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().width).map(e=>({text:e.textContent,title:e.title,aria:e.getAttribute('aria-label'),class:e.className}))),null,2));
 console.log('CHINESE',await page.evaluate(()=>document.body.innerText.split('\n').filter(x=>/[\u3400-\u9fff]/.test(x))));
 await page.locator('button[aria-label="Learning Studio"]').click(); await page.waitForTimeout(800);
 await page.screenshot({path:path.join(OUT,'inspect-learning.png')});
 console.log('LEARNING',await page.evaluate(()=>document.body.innerText));
} finally {await app.close();}
