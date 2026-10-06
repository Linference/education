import fs from 'node:fs';
const source=fs.readFileSync('scripts/video/record-demo.mjs','utf8');
const start=source.slice(0,source.indexOf(" if(!resume){"));
const ending=source.slice(source.indexOf('} catch(e){'));
fs.writeFileSync('scripts/video/record-pdf-retake.mjs',start+`
 await page.keyboard.press('Control+b');
 const md=fs.readFileSync(path.join(VAULT,'My Study Guide.md'),'utf8');
 const r=await page.evaluate(p=>window.gezhi.exporter.run(p),{format:'pdf',markdown:md,sourcePath:path.join(VAULT,'My Study Guide.md'),defaultName:'My Study Guide',saveAs:false});if(!r.ok)throw Error(r.error);
 await begin('04-pdf');await open('My Study Guide.pdf');await page.locator('.pdf-viewer canvas').waitFor({timeout:60000});await pause(1800);await shot('04-pdf');await click(page.locator('.pdf-toolbar button[title="Zoom in"]'));await pause(1200);await move(850,650);await page.mouse.wheel(0,210);await pause(1700);await end('04-pdf');
 console.log('PDF retake completed');
`+ending);
