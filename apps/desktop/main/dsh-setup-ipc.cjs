const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { loadBridge } = require('./ai.cjs');
function registerDshSetup(ipcMain, app) {
  const marker = path.join(app.getPath('userData'), 'dsh-onboarding.json');
  const installer = [path.join(process.resourcesPath || '', 'dsh', 'dsh-installer.exe'), path.resolve(__dirname, '../../../vendor/dsh/dsh-installer.exe')].find(p => fs.existsSync(p));
  const locate = async () => {
    const bridge = await loadBridge(); const bin = bridge.resolveDshBin(); const spec = bridge.resolveLaunchSpec(bin);
    return { bin, exe: spec.exe, installed: fs.existsSync(spec.exe) && path.basename(spec.exe).toLowerCase() === 'deepseek harness.exe' };
  };
  const launch = exe => new Promise((resolve,reject) => {
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(exe, [], { detached: true, stdio: 'ignore', env, windowsHide: false });
    child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
  });
  ipcMain.handle('dsh:setupStatus', async () => {
    try { return { ok: true, ...(await locate()), installerBundled: Boolean(installer), completed: fs.existsSync(marker) }; }
    catch (e) { return { ok: false, installed: false, installerBundled: Boolean(installer), completed: false, error: e.message }; }
  });
  ipcMain.handle('dsh:install', async () => {
    try { if (!installer) throw new Error('未找到随包的 DeepSeek Harness 安装程序'); await launch(installer); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('dsh:login', async () => {
    try { const state = await locate(); if (!state.installed) throw new Error('请先使用内置安装程序安装 DeepSeek Harness'); await launch(state.exe); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('dsh:completeSetup', async () => {
    try { const state = await locate(); if (!state.installed) throw new Error('尚未检测到 DeepSeek Harness，请完成安装后重试');
      const health = await (await loadBridge()).healthCheck(); if (!health.ok) throw new Error(health.error || '运行时检查失败');
      fs.mkdirSync(path.dirname(marker), { recursive: true }); fs.writeFileSync(marker, JSON.stringify({ at: new Date().toISOString(), version: health.version, userAcknowledgedLogin: true }));
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });
}
module.exports = { registerDshSetup };
