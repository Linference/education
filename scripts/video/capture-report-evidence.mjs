import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const film = path.join(root, '产出/demo-video-20261002');
const out = path.join(root, 'output/pdf/gezhi-competition/assets');
fs.mkdirSync(out, { recursive: true });
const app = await electron.launch({
  executablePath: path.join(root, 'apps/desktop/node_modules/electron/dist/electron.exe'),
  args: [path.join(root, 'apps/desktop'), '--force-device-scale-factor=1'],
  env: { ...process.env, GEZHI_TEST: '1', GEZHI_DEMO_EN: '1', GEZHI_TEST_APPDATA: path.join(film, 'film-appdata') }
});
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  await page.waitForFunction(() => window.__gezhiTest);
  await app.evaluate(({ BrowserWindow }, original) => {
    process.env.APPDATA = original;
    const window = BrowserWindow.getAllWindows()[0];
    window.setContentSize(1920, 1000);
  }, process.env.APPDATA);
  await page.evaluate(v => window.__gezhiTest.openVault(v), path.join(film, 'Demo Library'));
  await page.waitForTimeout(1200);
  await page.evaluate(p => window.__gezhiTest.openFileByPath(p), path.join(film, 'Demo Library/Concept Notes.md'));
  await page.waitForTimeout(700);
  await page.locator('button[aria-label="Learning Studio"]').click();
  await page.locator('#learning-tab-evidence').click();
  await page.locator('.evidence-main').getByRole('button', { name: 'Reset view', exact: true }).click();
  await page.waitForTimeout(700);
  const main = page.locator('.evidence-main');
  // Capture the complete 900:480 SVG canvas at its original landscape proportion.
  // Headings, search controls and document footers belong outside the report figure.
  const b = await main.locator('.evidence-canvas').boundingBox();
  if (!b) throw new Error('Evidence canvas is unavailable');
  await page.mouse.move(1905, 15);
  const clip = { x: b.x, y: b.y, width: b.width, height: b.height };
  await page.screenshot({ path: path.join(out, 'evidence-landscape.png'), clip });
  fs.writeFileSync(path.join(out, 'evidence-landscape-capture.json'), JSON.stringify({
    source: 'actual application screenshot', simulatedLearningRecords: true,
    viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight })),
    camera: { x: 0, y: 0, zoom: 1 }, clip, aspectRatio: clip.width / clip.height,
    pixelEdits: false, newAttemptsCreated: false
  }, null, 2));
  console.log('Captured original-proportion evidence view: ' + Math.round(clip.width) + ' x ' + Math.round(clip.height));
} finally { await app.close(); }
