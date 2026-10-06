import { _electron as electron } from 'playwright';
import path from 'node:path';
const root = process.cwd();
const film = path.join(root, '产出/demo-video-20261002');
const app = await electron.launch({
  executablePath: path.join(root, 'apps/desktop/node_modules/electron/dist/electron.exe'),
  args: [path.join(root, 'apps/desktop'), '--force-device-scale-factor=1'],
  env: { ...process.env, GEZHI_TEST: '1', GEZHI_DEMO_EN: '1', GEZHI_TEST_APPDATA: path.join(film, 'film-appdata') }
});
const page = await app.firstWindow();
page.setDefaultTimeout(20000);
await page.waitForFunction(() => window.__gezhiTest);
await app.evaluate(({ BrowserWindow }, original) => {
  process.env.APPDATA = original;
  const win = BrowserWindow.getAllWindows()[0];
  win.show();
  win.maximize();
  win.focus();
}, process.env.APPDATA);
await page.evaluate(v => window.__gezhiTest.openVault(v), path.join(film, 'Demo Library'));
await page.waitForTimeout(1200);
await page.evaluate(p => window.__gezhiTest.openFileByPath(p), path.join(film, 'Demo Library/Concept Notes.md'));
await page.waitForTimeout(700);
await page.locator('button[aria-label="Learning Studio"]').click();
await page.locator('#learning-tab-evidence').click();
await page.locator('.evidence-main').getByRole('button', { name: 'Reset view', exact: true }).click();
await page.waitForTimeout(500);
await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.show(); win.focus(); });
console.log('Learning Evidence Map is open. The window remains available for the user to capture.');
await new Promise(resolve => app.on('close', resolve));
