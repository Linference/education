import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = process.cwd(), OUT = path.join(ROOT, '产出/demo-video-20261002');
fs.mkdirSync(OUT, { recursive: true });
const vault = path.join(OUT, 'Demo Library'); fs.mkdirSync(vault, { recursive: true });
const nativeAppData = process.env.APPDATA;
const app = await electron.launch({ executablePath: path.join(ROOT, 'apps/desktop/node_modules/electron/dist/electron.exe'), args: [path.join(ROOT, 'apps/desktop'), '--force-device-scale-factor=1'], env: { ...process.env, GEZHI_TEST: '1', GEZHI_TEST_APPDATA: path.join(OUT, 'probe-appdata') } });
try {
  const page = await app.firstWindow(); await page.waitForFunction(() => Boolean(window.__gezhiTest));
  await app.evaluate((_e, original) => { if (original) process.env.APPDATA = original; }, nativeAppData);
  await page.evaluate(v => window.__gezhiTest.openVault(v), vault);
  const health = await page.evaluate(() => window.gezhi.ai.health());
  console.log(JSON.stringify({ health: { ok: health.ok, version: health.version, error: health.error } }));
  if (!health.ok) throw Error('DSH not available: '+health.error);
  const events = []; await page.exposeFunction('captureAIEvent', e => events.push(e));
  await page.evaluate(() => window.gezhi.ai.onEvent(e => window.captureAIEvent(e)));
  const result = await page.evaluate(v => window.gezhi.ai.run({ cwd: v, task: 'Create the file Quadratic Study Guide.md in the current folder. Write original educational material entirely in English, about 250 words, using Markdown headings, a comparison table and a short checklist. Explain y=a(x-h)^2+k, vertex, opening direction, and the example y=-(x-2)^2+1. Include one worked example and one transfer question with an answer. Link to [[Concept Notes]]. Use file tools to actually write the file. Do not access files outside this folder. Do not download anything or change any existing file. Finally reply briefly in English with the file name.' }), vault);
  fs.writeFileSync(path.join(OUT, 'real-ai-events.json'), JSON.stringify({ at: new Date().toISOString(), result, events }, null, 2));
  const file = path.join(vault, 'Quadratic Study Guide.md');
  console.log(JSON.stringify({ ok: result.ok, fileCreated: fs.existsSync(file), bytes: fs.existsSync(file) ? fs.statSync(file).size : 0, error: result.error }));
  if (!result.ok || !fs.existsSync(file)) process.exitCode = 1;
} finally { await app.close(); }
