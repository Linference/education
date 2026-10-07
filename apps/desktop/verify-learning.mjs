// Actual Electron/preload/SQLite integration; isolated data. Cloud voice and AI
// only are test doubles, never external account calls.
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..');
for (const name of fs.readdirSync(path.join(HERE, 'main'), { recursive: true }).filter(f => f.endsWith('.cjs'))) {
  execFileSync(process.execPath, ['--check', path.join(HERE, 'main', name)]);
}
const OUT = path.join(ROOT, '产出', 'learning-studio', ...(process.env.GEZHI_TEST_EXE ? ['packaged'] : []));
fs.mkdirSync(OUT, { recursive: true }); const runRoot = fs.mkdtempSync(path.join(OUT, 'qa-'));
const vault = path.join(runRoot, '学习笔记'), other = path.join(runRoot, '另一资料库');
for (const dir of [vault, other]) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(vault, '二次函数.md'), '# 二次函数\n\ny=a(x-h)²+k\n\n[[判别式]]\n');
fs.writeFileSync(path.join(vault, '牛顿第二定律.md'), '# 牛顿第二定律\n\nF合 = ma\n');
const app = await electron.launch({ executablePath: process.env.GEZHI_TEST_EXE || path.join(HERE, 'node_modules/electron/dist/electron.exe'), args: process.env.GEZHI_TEST_EXE ? [] : [HERE], env: { ...process.env, GEZHI_TEST: '1', GEZHI_TEST_APPDATA: path.join(runRoot, 'appdata'), APPDATA: path.join(runRoot, 'appdata') }, timeout: 30000 });
const processLogs = [];
app.process().stderr?.on('data', chunk => processLogs.push(chunk.toString()));
let page;
try { page = await app.firstWindow({ timeout: 60000 }); }
catch (e) { console.error(processLogs.join('')); await app.close().catch(() => {}); throw e; }
const checks = [], errors = [];
page.on('pageerror', e => errors.push(e.message));
const pass = (name, detail = '') => { checks.push({ name, pass: true, detail }); console.log('[PASS] ' + name + (detail ? ' · ' + detail : '')); };
const screenshot = name => page.screenshot({ path: path.join(OUT, name + '.png'), animations: 'disabled' });
const tab = name => page.getByRole('tab', { name, exact: true });
const exercise = () => page.locator('[data-testid="learning-exercise"]:visible');
const choose = label => exercise().locator('input[type=radio][name^="answer-"]').nth(label.charCodeAt(0) - 65).check();
const confidence = name => exercise().getByRole('radio', { name, exact: true }).click();
const rationale = text => exercise().getByRole('textbox', { name: '推理或预测依据' }).fill(text);
const submit = async () => { await exercise().getByRole('button', { name: '提交答案并记录', exact: true }).click(); await exercise().getByTestId('learning-feedback').waitFor(); await page.waitForTimeout(100); };
try {
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.webContents.setBackgroundThrottling(false); w.setSize(1440, 900); });
  await page.waitForFunction(() => Boolean(window.__gezhiTest));
  await page.getByRole('button', { name: '学习工作室', exact: true }).click(); await page.getByText('开启你的学习工作室').waitFor(); pass('无资料库时有明确入口和空状态');
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('ai:ask'); ipcMain.handle('ai:ask', async () => { await new Promise(r => setTimeout(r, 250)); return { ok: true, finalText: '先检查条件：匀速运动的加速度为零，所以合力为零。' }; });
    ipcMain.removeHandler('avatar:probe'); ipcMain.handle('avatar:probe', () => ({ ok: true, tts: { available: true }, asr: { available: false }, viseme: { available: true } }));
    ipcMain.removeHandler('avatar:tts'); ipcMain.handle('avatar:tts', () => {
      const pcm = Buffer.alloc(16000 * 2 * 2), header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8); header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(16000, 24); header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
      return { ok: true, base64: Buffer.concat([header, pcm]).toString('base64'), mime: 'audio/wav', totalMs: 2000, timings: Array.from({ length: 10 }, (_, i) => ({ text: '学习', beginMs: i * 200, endMs: i * 200 + 150 })) };
    });
  });
  await page.evaluate(v => window.__gezhiTest.openVault(v), vault);
  await page.evaluate(v => window.gezhi.search.reindex(v), vault); await page.evaluate(() => window.gezhi.search.waitIdle());
  await tab('自信度练习').click();
  await page.getByRole('checkbox', { name: '显示内置示例（非当前资料库内容）' }).check();
  await exercise().waitFor();
  const catalog = await page.evaluate(v => window.gezhi.learning.catalog({ vault: v, includeExamples: true }), vault);
  assert.equal(catalog.activities.length, 16); assert.ok(catalog.activities.every(a => !('answer' in a) && !('explanation' in a))); pass('原始目录不泄露答案，16 道原创练习明确标注');
  await screenshot('practice-light');
  assert.equal(await exercise().getByRole('button', { name: '提交答案并记录' }).isEnabled(), false);
  await choose('A'); assert.equal(await exercise().getByRole('button', { name: '提交答案并记录' }).isEnabled(), false); await confidence('确定'); await submit();
  let s = await page.evaluate(v => window.gezhi.learning.summary({ vault: v }), vault); assert.equal(s.total, 1); assert.equal(s.highConfidenceWrong, 1); assert.equal(s.evidence.find(n => n.id === '判别式').status, 'misconception'); pass('答案揭晓前必须选择自信度，确定但答错可回溯');
  await tab('错误侦探').click();
  await choose('B'); await exercise().locator('input[name^="correction-"]').nth(1).check(); await rationale('第②步除以 x 时没有排除 x=0，遗漏零解。'); await confidence('大概'); await submit();
  s = await page.evaluate(v => window.gezhi.learning.summary({ vault: v }), vault); assert.equal(s.total, 2); assert.equal(s.history[0].correct, true); assert.match(s.history[0].reflection, /遗漏/); pass('错误定位、修正选项、文字推理完整记录');
  await screenshot('detective-light');
  await exercise().getByRole('button', { name: '请小格朗读解析' }).click(); await page.waitForFunction(() => document.querySelector('.learning-coach')?.textContent.includes('正在朗读')); assert.equal(await page.locator('.learning-coach .avatar-portrait').count(),0); pass('文字引导保留实际音频朗读，不再展示旧数字人（测试音频）');
  await page.locator('.learning-coach').getByRole('button', { name: '停止', exact: true }).click();
  await page.waitForTimeout(150);
  assert.doesNotMatch(await page.locator('.learning-coach').textContent(), /播放被拒绝|播放失败|正在朗读/);
  pass('主动停止朗读后清理播放状态，不产生播放器错误');
  await page.getByRole('textbox', { name: '向小格追问' }).fill('为什么不能直接除以 x？'); await page.getByRole('button', { name: '向小格追问', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.learning-coach-text')?.textContent.includes('匀速运动')); pass('AI 追问接入现有通道，回复不改变核验结果（AI 测试替身）');
  await tab('迁移挑战').click(); assert.equal(await page.getByRole('button', { name: /改变关键条件/ }).isEnabled(), false);
  for (let level = 1; level <= 3; level++) { if (level > 1) await page.getByRole('button', { name: level === 2 ? /改变关键条件/ : /喷泉里的抛物线/ }).click(); await choose('B'); await rationale('用顶点式和开口方向判断，最高点需要在定义域内。'); await confidence('确定'); await submit(); }
  s = await page.evaluate(v => window.gezhi.learning.summary({ vault: v }), vault); assert.equal(s.evidence.find(n => n.id === '二次函数').transferLevel, 3); pass('迁移挑战逐关解锁，记录三种情境的独立通过'); await screenshot('transfer-light');
  await tab('学习证据').click(); await page.getByRole('button', { name: '二次函数，近期独立通过', exact: true }).click();
  await page.getByTestId('evidence-inspector').getByText('3/3', { exact: true }).waitFor(); await page.getByTestId('evidence-inspector').getByRole('button', { name: /^↗ 二次函数/ }).waitFor(); pass('证据地图显示状态依据、迁移记录与真实关联笔记');
  await page.getByRole('button', { name: '放大证据地图' }).click(); assert.ok((await page.locator('.evidence-canvas svg > g').getAttribute('transform')).includes('1.15')); pass('证据图谱缩放与节点选择有效');
  await screenshot('evidence-light');
  await page.getByRole('button', { name: '切换深色主题', exact: true }).click(); await screenshot('evidence-dark');
  const fixed = await page.evaluate(v => window.gezhi.cal.addEvent({ vault: v, title: '固定课程', kind: 'class', startAt: new Date().toISOString() }), vault); assert.equal(fixed.ok, true);
  const schedule1 = await page.evaluate(v => window.gezhi.learning.schedule({ vault: v, concept: '二次函数' }), vault), schedule2 = await page.evaluate(v => window.gezhi.learning.schedule({ vault: v, concept: '二次函数' }), vault);
  assert.equal(schedule1.ok, true); assert.equal(schedule2.duplicate, true); const cal = await page.evaluate(v => window.gezhi.cal.load({ vault: v }), vault); assert.equal(cal.tasks.length, 1); assert.equal(cal.events.length, 1); pass('复测进入日历待办，重复安排去重，固定课程不变');
  const q = await page.evaluate(v => window.gezhi.bank.add({ vault: v, type: 'fill', stem: '公平硬币正面的概率（用数值或分数）', answer: '1/2', solution: '正反面等可能。', kps: ['概率'], source: 'QA 原创测试题' }), vault); assert.equal(q.ok, true);
  await page.getByRole('button', { name: '打开题库', exact: true }).click(); await page.getByRole('button', { name: '看答案与解析', exact: true }).click(); await page.getByRole('button', { name: '记录自信度练习', exact: true }).click(); await exercise().waitFor(); assert.equal(await exercise().getAttribute('data-activity-id'), 'bank:' + q.id);
  await exercise().getByText('你已在题库查看过参考答案。本轮按有参考帮助的练习记录。').waitFor();
  await page.getByRole('textbox', { name: '预测或计算的数值' }).fill('0.5'); await confidence('确定'); await submit();
  const previewed = (await page.evaluate(v => window.gezhi.learning.summary({ vault: v }), vault)).history[0];
  assert.equal(previewed.correct, true); assert.equal(previewed.previewedAnswer, true); assert.equal(previewed.hints, 1);
  pass('真实题库入口联动、分数数值核验与参考答案预览标记');
  const proof = await page.evaluate(v => window.gezhi.bank.add({ vault: v, type: 'proof', stem: '证明并说明条件', answer: '完整论证见解析', kps: ['逻辑证明'], source: 'QA 原创证明题' }), vault);
  await page.getByRole('button', { name: '打开题库', exact: true }).click(); await page.getByRole('button', { name: '记录自信度练习', exact: true }).first().click(); await exercise().waitFor(); assert.equal(await exercise().getAttribute('data-activity-id'), 'bank:' + proof.id);
  await page.getByRole('textbox', { name: '你的答案', exact: true }).fill('先列出条件，再进行证明。'); await confidence('大概'); await submit(); await exercise().getByRole('button', { name: '核对后：正确', exact: true }).click(); await page.waitForTimeout(150);
  s = await page.evaluate(v => window.gezhi.learning.summary({ vault: v }), vault); assert.equal(s.history[0].correct, null); assert.equal(s.evidence.find(n => n.id === '逻辑证明').independent, 0); pass('主观题自评标记保存，不冒充自动核验通过');
  await tab('概念实验').click(); await page.getByRole('button', { name: '用当前参数开始预测', exact: true }).click(); await exercise().waitFor();
  await page.getByRole('textbox', { name: '预测或计算的数值' }).fill('4'); await rationale('x=2，y=x²，因此得到4。'); await confidence('确定'); await exercise().getByRole('button', { name: '提交预测并验证', exact: true }).click(); await page.getByRole('button',{name:'验证函数图像',exact:true}).click(); await exercise().getByTestId('learning-feedback').waitFor(); assert.ok(await page.locator('.lab-result-point').count()); pass('函数实验先锁定预测，再核验图像与数值');
  await page.getByRole('textbox', { name: '实验观察与解释' }).fill('曲线经过 (2,4)，与代入公式的预测一致。'); await page.getByRole('button', { name: '保存观察与解释', exact: true }).click(); await page.getByRole('button', { name: '观察已保存到学习证据', exact: true }).waitFor(); pass('实验预测、观察和解释写入同一条学习证据'); await screenshot('lab-quadratic-dark');
  await page.getByRole('button', { name: /力与运动.*对比受力/ }).click(); await page.getByRole('button', { name: '用当前参数开始预测', exact: true }).click(); await exercise().waitFor(); await page.getByRole('textbox', { name: '预测或计算的数值' }).fill('4.02'); await rationale('合力=20−0.1×4×9.8=16.08N，加速度4.02。'); await confidence('确定'); await exercise().getByRole('button', { name: '提交预测并验证', exact: true }).click(); await page.getByRole('button', { name: '运行 3 秒实验', exact: true }).click(); await exercise().getByTestId('learning-feedback').waitFor(); assert.ok((await page.locator('.lab-readouts').textContent()).includes('18.09')); pass('受力动画按统一标尺运行，3 秒位移 18.09 m'); await screenshot('lab-force-dark');
  await page.getByRole('button', { name: /概率与抽样.*比较理论概率/ }).click(); await page.getByRole('button', { name: '用当前参数开始预测', exact: true }).click(); await exercise().waitFor(); await page.getByRole('textbox', { name: '预测或计算的数值' }).fill('75'); await rationale('对立事件是两次均失败，1−0.5²=0.75。'); await confidence('确定'); await exercise().getByRole('button', { name: '提交预测并验证', exact: true }).click(); await page.getByRole('button', { name: '抽样 1000 组', exact: true }).click(); await exercise().getByTestId('learning-feedback').waitFor(); assert.match(await page.locator('.lab-readouts').textContent(), /1000/); pass('概率实验先抽样，再对比理论值与频率'); await screenshot('lab-probability-dark');
  await app.evaluate(({ dialog }, folder) => {
    dialog.showSaveDialog = async (_window, options) => ({ canceled: false, filePath: folder + '/学习记录.' + options.filters[0].extensions[0] });
  }, OUT);
  for (const [format, ext] of [['markdown', 'md'], ['pdf', 'pdf'], ['docx', 'docx']]) {
    await page.getByRole('combobox', { name: '学习记录导出格式' }).selectOption(format);
    await page.getByRole('button', { name: '导出最近记录', exact: true }).click();
    await page.getByRole('button', { name: '导出最近记录', exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('.learning-footer button')?.disabled, { timeout: 30000 });
    const bytes = fs.readFileSync(path.join(OUT, '学习记录.' + ext));
    assert.ok(bytes.length > 100);
    if (format === 'markdown') { assert.match(bytes.toString('utf8'), /看过参考答案/); assert.match(bytes.toString('utf8'), /实验观察/); }
    else assert.equal(bytes.subarray(0, format === 'pdf' ? 4 : 2).toString(), format === 'pdf' ? '%PDF' : 'PK');
    pass('学习记录真实导出 ' + format, bytes.length + ' bytes');
  }
  const before = (await page.evaluate(v => window.gezhi.learning.summary({ vault: v }), vault)).total; await page.reload(); await page.waitForFunction(() => Boolean(window.__gezhiTest)); await page.evaluate(v => window.__gezhiTest.openVault(v), vault); await page.getByRole('button', { name: '学习工作室', exact: true }).click(); await tab('自信度练习').click(); await page.getByRole('checkbox', { name: '显示内置示例（非当前资料库内容）' }).check(); await exercise().waitFor(); const persisted = await page.evaluate(v => window.gezhi.learning.summary({ vault: v }), vault); assert.equal(persisted.total, before); pass('刷新应用后，学习证据完整恢复', before + ' 条');
  const outside = await page.evaluate(v => window.gezhi.learning.summary({ vault: v }), other); assert.equal(outside.ok, false); pass('IPC 拒绝查询当前资料库之外的路径');
  const badLab = await page.evaluate(v => window.gezhi.learning.lab({ vault: v, kind: 'force', params: { mass: 0 } }), vault); assert.equal(badLab.ok, false); pass('实验参数边界在主进程也有校验');
  await page.evaluate(v => window.__gezhiTest.openVault(v), other); await tab('自信度练习').click(); await page.getByText('没有匹配的练习', { exact: true }).waitFor(); assert.equal((await page.evaluate(v => window.gezhi.learning.summary({ vault: v }), other)).total, 0); pass('切换资料库不会混入其他资料库的学习记录或示例题');
  await page.evaluate(v => window.__gezhiTest.openVault(v), vault); await tab('自信度练习').click(); await page.getByRole('checkbox', { name: '显示内置示例（非当前资料库内容）' }).check(); await page.getByTestId('learning-exercise').waitFor();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 760)); await page.waitForTimeout(250); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await screenshot('studio-compact-dark'); pass('紧凑窗口布局不产生整页水平溢出');
  assert.deepEqual(errors, []); pass('渲染过程中没有未处理异常');
} catch (e) { checks.push({ name: 'integration', pass: false, detail: e.stack || String(e) }); console.error(e); await screenshot('failure').catch(() => {}); process.exitCode = 1; }
finally { fs.writeFileSync(path.join(OUT, 'verification.json'), JSON.stringify({ at: new Date().toISOString(), checks, pageErrors: errors, cloud: 'AI and TTS test doubles; actual preload, SQLite, rendering and model paths exercised', runRoot }, null, 2)); await app.close(); }
console.log(checks.filter(c => c.pass).length + ' passed, ' + checks.filter(c => !c.pass).length + ' failed');
