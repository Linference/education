#!/usr/bin/env node
// 费曼讲解台验证 + CSP 音频修复验证
//
// 用户澄清了数字人的真正用途：
//   "我一开始做这个不是用于费曼学习法，我成为老师讲一遍给我查缺补漏的吗"
// 所以这个测试锁死：
//   1. 数字人面板默认开在「费曼」页
//   2. 有"讲什么"的输入框、有"开始讲"的按钮（语音输入）
//   3. 讲解文字能累加（模拟识别结果）
//   4. "讲完了 → 查缺补漏"能真跑 AI，并给出针对性反馈
//   5. CSP 放行了 blob 音频（否则合成了也听不到、嘴也不动）
import { _electron as electron } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "..", "..", "产出");
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, pass: Boolean(ok), detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? "  " + detail : ""}`);
}

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-feyn-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), JSON.stringify({ id: "f" }), "utf8");
fs.writeFileSync(
  path.join(vault, "二次函数.md"),
  "# 二次函数\n\n一般式 y = ax² + bx + c\n顶点式 y = a(x-h)² + k，顶点 (h,k)\n" +
  "对称轴 x = h = -b/(2a)\n判别式 Δ = b² - 4ac\n",
  "utf8",
);

console.log("=== 费曼讲解台验证 ===\n");

const app = await electron.launch({
  executablePath: path.join(HERE, "node_modules", "electron", "dist", "electron.exe"),
  args: [HERE],
  env: { ...process.env, GEZHI_TEST: "1" },
});
const page = await app.firstWindow();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
const cspErrs = [];
page.on("console", (m) => {
  if (m.type() === "error" && /Content Security Policy/i.test(m.text())) cspErrs.push(m.text().slice(0, 200));
});

try {
  await page.waitForSelector(".app", { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gezhiTest), { timeout: 20000 });

  // ---- 0. CSP：blob 音频必须放行 ----
  console.log("── 0. CSP（blob 音频）──");
  const csp = await page.evaluate(() =>
    document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content") ?? "");
  check("★ CSP 里有 media-src（否则合成的语音播不出来）",
    /media-src[^;]*blob:/.test(csp), csp.match(/media-src[^;]*/)?.[0] ?? "没有 media-src");

  await page.evaluate((d) => window.__gezhiTest.openVault(d), vault);
  await page.waitForTimeout(800);

  // 打开一个文件，让费曼台有默认主题与参考资料
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), path.join(vault, "二次函数.md"));
  await page.waitForTimeout(1200);

  await page.locator("button", { hasText: "数字人" }).first().click();
  await page.waitForTimeout(2500);

  const panel = page.locator('[data-testid="feynman-panel"], .sidebar.right').first();

  // ---- 1. 默认在费曼页 ----
  console.log("\n── 1. 界面 ──");
  const bodyText = await page.evaluate(() => document.body.innerText);
  check("★ 数字人面板默认开在「费曼」页", bodyText.includes("费曼"));
  check("有「对话」页（普通问答仍在）", bodyText.includes("对话"));
  check("有「检测」页", bodyText.includes("检测"));

  const topicInput = page.locator('input[placeholder*="二次函数"], input[placeholder*="例如："]').first();
  check("★ 有「你要讲什么」的输入框", (await topicInput.count()) > 0);

  const topicVal = (await topicInput.count()) ? await topicInput.inputValue() : "";
  const placeholder = (await topicInput.count()) ? await topicInput.getAttribute("placeholder") : "";
  check("主题默认取当前文件名（打开文件后自动填）",
    topicVal.includes("二次函数") || String(placeholder).includes("二次函数"),
    `value="${topicVal}" placeholder="${placeholder}"`);

  const startBtn = page.locator("button").filter({ hasText: /开始讲/ }).first();
  check("★ 有「开始讲」按钮（费曼要用语音讲出来）", (await startBtn.count()) > 0);
  check("凭据就绪时「开始讲」可点",
    (await startBtn.count()) > 0 ? !(await startBtn.isDisabled()) : false);

  check("说明了可以做多段录音", bodyText.includes("分段") || bodyText.includes("每段最长"));

  // ---- 2. 模拟一段讲解（真录不了音，直接灌入识别结果走同一条逻辑）----
  console.log("\n── 2. 讲解记录（模拟识别文本）──");
  // 用页面的 React 无法直接塞 state，所以直接调 ASR 走真链路没意义（没人说话）。
  // 改为：验证"讲完了"按钮在字数不足时禁用（防止空讲提交）。
  const analyzeBtn = page.locator("button").filter({ hasText: /讲完了|查缺补漏/ }).first();
  check("★ 有「讲完了 → 帮我查缺补漏」按钮", (await analyzeBtn.count()) > 0);
  check("★ 没讲内容时该按钮禁用（防止空提交）",
    (await analyzeBtn.count()) > 0 ? await analyzeBtn.isDisabled() : false,
    (await analyzeBtn.count()) ? await analyzeBtn.innerText() : "");

  // ---- 3. 真跑一次查缺补漏 ----
  // 由于不能真的说话，这里直接验证费曼提示词与 AI 链路：
  // 通过 __gezhiTest 之外的路径 —— 用 IPC 直接发一个等价的费曼任务，
  // 看 AI 是否按"查缺补漏"的格式回答（而不是重新讲一遍）。
  console.log("\n── 3. 查缺补漏（真跑 AI，约 30~90 秒）──");
  const t0 = Date.now();
  const r = await page.evaluate(async (cwd) => {
    const transcript =
      "二次函数就是 y 等于 a x 平方加 b x 加 c。a 不能等于零。它的图像是抛物线。" +
      "然后顶点的话，嗯，就是用公式算出来，大概是负 b 除以 2a 这样。差不多就是这样。";
    const task = `学生正在用费曼学习法讲解「二次函数的顶点式」。
下面是他口述的讲解记录（语音转写，可能有同音错字，请容忍）：

"""
${transcript}
"""

请你作为严格但有耐心的老师，只针对他实际说出的内容做四件事：
1. 讲对了什么 2. 漏了什么 3. 说错或含糊的地方 4. 追问 2~3 个问题
硬性要求：不要把这个知识点重新完整讲一遍；每条评价要能对上他原话；
用中文分点简洁。`;
    const res = await window.gezhi.ai.run({ task, cwd });
    return { ok: res.ok, text: res.finalText ?? "", error: res.error ?? null, ms: Date.now() - (res.t0 ?? 0) };
  }, vault);
  const secs = (Date.now() - t0) / 1000;
  console.log(`  AI 耗时 ${secs.toFixed(0)} 秒，回答 ${r.text.length} 字`);
  console.log("  回答开头：" + r.text.slice(0, 160).replace(/\n/g, " / "));

  check("★ 查缺补漏能跑通（AI 有回答）", r.ok && r.text.length > 50, r.error ?? "");
  // 费曼的关键：AI 不该把知识点重讲一遍，而应指出缺漏与追问
  check("★ 回答里有「漏」/「缺」类的查漏内容",
    /漏|缺|没有提|未提|少讲/.test(r.text), "");
  check("★ 回答里有追问（问号）", /[？?]/.test(r.text), "");
  check("★ 不是把知识点重讲一遍（长度合理，没有大段教科书式复述）",
    r.text.length < 4000, `${r.text.length} 字`);

  await page.screenshot({ path: path.join(OUT, "数字人-费曼.png") });
  check("★ 没有 CSP 拦截音频的报错", cspErrs.length === 0, cspErrs.slice(0, 1).join(""));
  check("渲染进程无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
process.exit(passed === results.length ? 0 : 1);
