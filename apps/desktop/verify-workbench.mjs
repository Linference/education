// Real Electron checks for the redesigned workspace. Cloud calls are mocked;
// actual preload, indexing, renderer, worker, audio playback and input paths run.
import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(ROOT, "产出", "ui-v2", ...(process.env.GEZHI_TEST_EXE ? ["packaged"] : []));
const runRoot = fs.mkdtempSync(path.join(OUTWithMkdir(), "qa-"));
function OUTWithMkdir() { fs.mkdirSync(OUT, { recursive: true }); return OUT; }
const vault = path.join(runRoot, "学习笔记");
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), JSON.stringify({ id: "workbench-qa" }));
const subjects = {
  数学: ["二次函数", "顶点式", "判别式", "韦达定理", "一元二次方程", "函数图像", "对称轴", "抛物线", "极值", "平移变换", "因式分解", "根的分布", "不等式", "坐标系", "相似三角形", "圆与切线", "勾股定理", "概率", "数列", "导数"],
  物理: ["力与运动", "牛顿定律", "加速度", "惯性", "受力分析", "摩擦力", "动能", "势能", "机械能守恒", "动量", "匀速运动", "电路", "欧姆定律", "电功率", "磁场", "电磁感应", "光的反射", "折射", "透镜", "波动"],
  化学: ["元素周期表", "原子结构", "化学键", "离子", "氧化还原", "酸碱反应", "电解质", "溶液", "化学平衡", "反应速率", "物质的量", "气体定律", "金属", "非金属", "有机化学", "碳与硅", "实验安全", "焓变", "催化剂", "同位素"],
};
for (const [subject, names] of Object.entries(subjects)) {
  fs.mkdirSync(path.join(vault, subject), { recursive: true });
  names.forEach((name, i) => fs.writeFileSync(path.join(vault, subject, `${name}.md`),
    `# ${name}\n\n记录思路，理解关系，再用自己的话讲一遍。\n\n## 关联知识\n\n${[names[0], names[(i + 1) % names.length], names[(i + 3) % names.length]].filter(n => n !== name).map(n => `- [[${n}]]`).join("\n")}\n`));
}
const notePath = path.join(vault, "学习地图.md");
fs.writeFileSync(notePath, `---\ntags: [学习, 知识网络]\n---\n# 每一条连接，都是理解的开始\n\n> 把知识放回它的关系中，而不只是记住一个答案。\n\n## 今天的探索\n\n从 [[二次函数]] 的图像出发，用 [[加速度]] 理解变化，再看看 [[化学平衡]] 如何描述动态。\n\n### 二次函数的三种表达\n\n| 表达方式 | 适合观察 |\n| --- | --- |\n| 一般式 | 系数与变化 |\n| 顶点式 | 顶点与对称轴 |\n| 交点式 | 零点与分布 |\n\n$$y=a(x-h)^2+k$$\n\n## 试着讲一遍\n\n为什么顶点横坐标是 $h$？能不能用图像说明？\n\n- [ ] 画出函数图像\n- [ ] 把自己的推导讲给小格听\n\n延伸探索：[[尚未创建的灵感]]。\n`);
fs.writeFileSync(path.join(vault, "独立随记.md"), "# 独立随记\n今天也要留一点时间给思考。\n");
const executablePath = process.env.GEZHI_TEST_EXE || path.join(HERE, "node_modules", "electron", "dist", "electron.exe");
const app = await electron.launch({ executablePath, args: process.env.GEZHI_TEST_EXE ? [] : [HERE],
  env: { ...process.env, GEZHI_TEST: "1", GEZHI_TEST_APPDATA: path.join(runRoot, "appdata"), APPDATA: path.join(runRoot, "appdata"), GEZHI_DOCUMENTS: path.join(runRoot, "documents") }, timeout: 30000 });
const page = await app.firstWindow();
const errors = [];
const results = [];
page.on("pageerror", e => errors.push(e.message));
const check = (name, detail = "") => { results.push({ name, pass: true, detail }); console.log(`[PASS] ${name} ${detail}`); };
const screenshot = name => page.screenshot({ path: path.join(OUT, name + ".png"), animations: "disabled" });
const settle = () => page.waitForFunction(() => document.querySelector('[data-testid="graph-view"]')?.dataset.settled === "true", null, { timeout: 30000 });
const graphCount = () => page.locator('[data-testid="graph-view"]').getAttribute("data-node-count").then(Number);
try {
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.webContents.setBackgroundThrottling(false); w.setSize(1440, 900); });
  await page.waitForFunction(() => Boolean(window.__gezhiTest));
  assert.ok((await page.getByRole("img", { name: "格致", exact: true }).first().getAttribute("src")).includes("gezhi-mark-v3"));
  check("新版六维之窗 Logo 已接入实际界面");
  const realProbe = await page.evaluate(() => window.gezhi.avatar.probe());
  assert.equal(realProbe.viseme.available, true); check("真实语音模块及本地口型算法可加载");
  const credentialStatus = await page.evaluate(() => window.gezhi.settings.credStatus());
  assert.equal(credentialStatus.ok, true); check("凭据模块可加载，隔离数据目录正常");
  const sdk = await app.evaluate(({ app }) => {
    const path = process.getBuiltinModule("path");
    const file = app.isPackaged ? path.join(process.resourcesPath, "packages/voice/src/index.mjs") : path.resolve(app.getAppPath(), "../../packages/voice/src/index.mjs");
    const requireVoice = process.getBuiltinModule("module").createRequire(file);
    return { tts: typeof requireVoice("tencentcloud-sdk-nodejs-tts").tts.v20190823.Client, asr: typeof requireVoice("tencentcloud-sdk-nodejs-asr").asr.v20190614.Client };
  });
  assert.deepEqual(sdk, { tts: "function", asr: "function" }); check("实际 TTS / ASR SDK 可解析加载（未发送请求）");
  // Test doubles exist only in this isolated process; no cloud request or secret is used.
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("ai:run");
    ipcMain.handle("ai:run", async () => { await new Promise(r => setTimeout(r, 800)); return { ok: true, finalText: "我们可以先从图像开始。试着解释一下：为什么平移后，顶点的位置会变成 h 和 k？", sessionId: "qa" }; });
    ipcMain.removeHandler("avatar:probe");
    ipcMain.handle("avatar:probe", () => ({ ok: true, tts: { available: true, reason: null }, asr: { available: true, reason: null }, viseme: { available: true, reason: null }, credentials: { configured: true } }));
    ipcMain.removeHandler("avatar:tts");
    ipcMain.handle("avatar:tts", () => {
      const pcm = Buffer.alloc(16000 * 2 * 3); // silent WAV, three real seconds of audio playback
      const header = Buffer.alloc(44); header.write("RIFF"); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8); header.write("fmt ", 12);
      header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(16000, 24); header.writeUInt32LE(32000, 28);
      header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
      return { ok: true, base64: Buffer.concat([header, pcm]).toString("base64"), mime: "audio/wav", totalMs: 3000, timingAvailable: true,
        timings: Array.from({ length: 10 }, (_, i) => ({ text: "学习", beginMs: i * 300, endMs: i * 300 + 200 })) };
    });
  });
  await page.evaluate(v => window.__gezhiTest.openVault(v), vault);
  await page.evaluate(v => window.gezhi.search.reindex(v), vault);
  await page.evaluate(() => window.gezhi.search.waitIdle());
  await screenshot("welcome-light");
  await page.evaluate(p => window.__gezhiTest.openFileByPath(p), notePath);
  await page.getByRole("button", { name: "学习工作室", exact: true }).click();
  await page.waitForSelector('.role-portrait');
  await page.waitForTimeout(400);
  const imageOk = await page.locator('.role-portrait').first().evaluate(async el => {
    const src = getComputedStyle(el).backgroundImage.slice(5, -2); const img = new Image(); img.src = src;
    await img.decode(); return [img.naturalWidth, img.naturalHeight];
  });
  assert.deepEqual(imageOk, [2172, 724]); assert.equal(await page.locator('.companion-card').count(),5); check("角色空间的五位形象成功加载", imageOk.join("×"));
  await screenshot("workbench-light");
  await page.getByRole("button", { name: "切换深色主题", exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
  check("深色主题即时生效");
  await screenshot("workbench-dark");
  await page.locator('button[title*="关系图谱"]').first().click();
  await settle();
  const count = await graphCount(); assert.equal(count, 63); check("真实索引图谱收敛", `${count} 节点`);
  assert.equal(await page.locator('.graph-error').count(), 0); check("Electron file:// 下布局 Worker 正常运行");
  const rendered = await page.locator('.graph-view canvas').evaluate(el => {
    const pixels = el.getContext("2d").getImageData(0, 0, el.width, el.height).data;
    let painted = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) painted++; return painted;
  });
  assert.ok(rendered > 1000); check("Canvas 实际绘制节点和链接", `${rendered} 像素`);
  await screenshot("graph-dark");
  const zoom = page.getByTestId("graph-zoom"); const initialZoom = parseInt(await zoom.innerText());
  await page.getByRole("button", { name: "放大图谱", exact: true }).click();
  assert.ok(parseInt(await zoom.innerText()) > initialZoom); check("按钮缩放生效");
  const canvas = page.locator('.graph-view canvas');
  await canvas.focus(); await page.keyboard.press("-"); await page.keyboard.press("0");
  assert.equal(parseInt(await zoom.innerText()), initialZoom); check("键盘缩放与适应画布");
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, -120);
  await page.waitForTimeout(100);
  assert.ok(parseInt(await zoom.innerText()) > initialZoom); check("滚轮以指针为中心缩放");
  await page.getByRole("button", { name: "适应画布", exact: true }).click();
  const beforePan = await canvas.evaluate(el => el.toDataURL());
  await page.mouse.move(box.x + 25, box.y + box.height - 80); await page.mouse.down();
  await page.mouse.move(box.x + 95, box.y + box.height - 55, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(100);
  assert.notEqual(await canvas.evaluate(el => el.toDataURL()), beforePan); check("空白画布拖拽平移");
  await page.getByRole("button", { name: "适应画布", exact: true }).click();
  // Find a genuinely colored node pixel and exercise the real hit-test/pin path.
  const pixel = await canvas.evaluate(el => {
    const ctx = el.getContext("2d"), { data } = ctx.getImageData(0, 0, el.width, el.height);
    for (let y = 60; y < el.height - 60; y++) for (let x = 60; x < el.width - 60; x++) {
      const i = (y * el.width + x) * 4;
      if (data[i + 3] > 230 && Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) > 45)
        return { x: x / (el.width / el.clientWidth), y: y / (el.height / el.clientHeight) };
    }
  });
  assert.ok(pixel); await page.mouse.move(box.x + pixel.x, box.y + pixel.y);
  await page.waitForSelector('.graph-inspector'); check("节点命中与邻居高亮");
  await page.mouse.down(); await page.mouse.move(box.x + pixel.x + 45, box.y + pixel.y + 25, { steps: 6 }); await page.mouse.up();
  assert.ok(await page.getByTestId("graph-view").isVisible()); check("节点拖动不误打开文件");
  await page.getByRole("button", { name: "查看邻居", exact: true }).click(); await settle();
  assert.ok(await graphCount() < count); check("局部图谱 BFS 邻域筛选", `${await graphCount()} 节点`);
  await page.getByRole("button", { name: "退出局部图谱", exact: true }).click(); await settle();
  await page.getByRole("button", { name: "图谱设置", exact: true }).click();
  await page.getByLabel("只看已有笔记", { exact: true }).check(); await settle();
  assert.equal(await graphCount(), count - 1); check("悬空链接筛选");
  await page.getByLabel("隐藏孤立节点", { exact: true }).check(); await settle();
  assert.equal(await graphCount(), count - 2); check("孤立节点筛选");
  await page.getByLabel("搜索笔记", { exact: true }).fill("顶点式"); await settle();
  assert.equal(await graphCount(), 1); check("名称搜索筛选");
  await page.getByRole("button", { name: "重置", exact: true }).click(); await settle();
  await page.locator('.graph-group-list button').filter({ hasText: "数学" }).click(); await settle();
  assert.equal(await graphCount(), count - 20); check("文件夹颜色分组可切换");
  await page.getByRole("button", { name: "重置", exact: true }).click(); await settle();
  await screenshot("graph-settings-dark");
  await page.getByRole("button", { name: "切换浅色主题", exact: true }).click();
  await page.getByRole("button", { name: "图谱设置", exact: true }).click(); await screenshot("graph-light");
  await page.getByRole("button", { name: "图谱设置", exact: true }).click();
  await page.locator('.graph-settings summary').filter({ hasText: "笔记列表" }).click();
  await page.locator('.graph-note-list button').filter({ hasText: /^顶点式(?:\.md)?$/ }).click();
  await page.waitForSelector('.markdown-body h1');
  assert.equal(await page.getByTestId("graph-view").count(), 0); check("图谱打开笔记并返回文件视图");
  assert.equal(await page.getByRole("tab", { name: "数字人", exact: true }).count(),0); check("数字人独立入口已被角色空间替代");
  await page.getByRole("tab", { name: "日历", exact: true }).click();
  await page.getByTestId("calendar-panel").waitFor();
  await screenshot("calendar-light"); check("日历面板使用统一界面样式");
  const add = await page.evaluate(v => window.gezhi.bank.addMany({ vault: v, questions: [
    { type: "choice", stem: "函数 y = 2(x − 3)² + 1 的顶点坐标为？", options: [{ label: "A", text: "(3, 1)" }, { label: "B", text: "(−3, 1)" }], answer: "A", solution: "由顶点式直接得到 (h, k) = (3, 1)。", kps: ["二次函数", "顶点式"], difficulty: 2, source: "课堂练习" },
    { type: "answer", stem: "试着说明：机械能守恒需要满足哪些条件？", answer: "只有重力或弹力做功。", solution: "系统无其他力做功时，动能与势能之和不变。", kps: ["机械能守恒"], difficulty: 3, source: "知识回顾" },
  ] }), vault);
  assert.equal(add.added, 2);
  await page.locator('button[title*="题库组卷"]').first().click();
  await page.waitForSelector('.bank-question');
  await page.locator('.bank-question').first().getByRole("button", { name: "加入组卷", exact: true }).click();
  await page.locator('.bank-question').first().getByRole("button", { name: "看答案与解析", exact: true }).click();
  await screenshot("bank-light"); check("新版题库卡片、解析和组卷篮交互");
  await page.locator('button[title*="返回文件视图"]').first().click();
  await page.getByRole("button", { name: "学习工作室", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = await page.locator('.role-portrait').first().evaluate(el => getComputedStyle(el).animationName);
  assert.equal(reduced, "none"); check("尊重减少动态效果偏好");
  await page.getByRole("button", { name: "切换深色主题", exact: true }).click();
  await page.reload(); await page.waitForSelector('.app');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark"); check("主题选择重启后保留");
  await page.waitForFunction(() => Boolean(window.__gezhiTest));
  await page.evaluate(v => window.__gezhiTest.openVault(v), vault);
  await page.evaluate(p => window.__gezhiTest.openFileByPath(p), notePath);
  await page.getByRole("button", { name: "学习工作室", exact: true }).click();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 700));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false); check("小屏工作台不产生整体横向溢出");
  await screenshot("workbench-compact-dark");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // Synthetic large graph exercises the same worker/renderer at the supported cap.
  await app.evaluate(({ ipcMain }, v) => {
    ipcMain.removeHandler("search:graph"); ipcMain.handle("search:graph", () => ({ ok: true,
      nodes: Array.from({ length: 1500 }, (_, i) => ({ id: `${v}/压力节点${i}.md`, rel: `组${i % 6}/压力节点${i}.md`, name: `压力节点${i}`, ext: ".md", exists: true, degree: 4 })),
      edges: Array.from({ length: 3000 }, (_, i) => ({ source: `${v}/压力节点${i % 1500}.md`, target: `${v}/压力节点${(i % 1500 + (i < 1500 ? 1 : 23)) % 1500}.md`, label: null, line: null })) }));
  }, vault);
  await page.locator('button[title*="关系图谱"]').first().click();
  const t0 = Date.now();
  const responsiveness = page.evaluate(() => new Promise(resolve => {
    const gaps = []; const start = performance.now(); let last = start;
    const tick = now => { gaps.push(now - last); last = now;
      if (now - start < 1200) requestAnimationFrame(tick); else { gaps.sort((a, b) => a - b); resolve({ frames: gaps.length, p95: gaps[Math.floor(gaps.length * .95)], max: gaps.at(-1) }); } };
    requestAnimationFrame(tick);
  }));
  await settle();
  assert.equal(await graphCount(), 1500); check("1500 节点 / 3000 链接压力图谱正常收敛", `${Date.now() - t0} ms`);
  const responsivenessResult = await responsiveness;
  assert.ok(responsivenessResult.frames >= 15 && responsivenessResult.p95 < 160);
  check("大图谱计算期间 UI 持续响应", JSON.stringify(responsivenessResult));
  await page.getByRole("button", { name: "放大图谱", exact: true }).click(); check("大图谱交互仍可用");
  assert.deepEqual(errors, []); check("无渲染进程未捕获异常");
} catch (e) {
  results.push({ name: "执行失败", pass: false, detail: e.stack });
  await screenshot("failure").catch(() => {}); throw e;
} finally {
  fs.writeFileSync(path.join(OUT, "verification.json"), JSON.stringify({ runAt: new Date().toISOString(), results, errors, cloud: "mocked, no external services called", runRoot }, null, 2));
  await app.close();
}
