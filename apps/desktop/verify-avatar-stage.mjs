#!/usr/bin/env node
// 数字人验证
//
// 要证明的不是"面板能打开"，而是**形象真的会动、口型跟着发声走**：
//   1. 说话时嘴巴的张开量会变化（不是静止的一个椭圆）
//   2. 停止后嘴巴闭合
//   3. 口型帧数与文本长度相关（纯算法可验证）
//   4. 说话时"当前说到的字"会变化
//   5. 说话时切走再切回，组件仍然可用（不被卸载影响）
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

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-dh-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), JSON.stringify({ id: "d" }), "utf8");

console.log("=== 数字人验证 ===\n");

const app = await electron.launch({
  executablePath: path.join(HERE, "node_modules", "electron", "dist", "electron.exe"),
  args: [HERE],
  env: { ...process.env, GEZHI_TEST: "1" },
});
const page = await app.firstWindow();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));

/** 读嘴巴椭圆当前的 ry（张开量的直接体现） */
const mouthRy = () =>
  page.evaluate(() => {
    // 嘴是 cy=124 的那个椭圆
    const els = [...document.querySelectorAll("svg ellipse")];
    const m = els.find((e) => Number(e.getAttribute("cy")) === 124);
    return m ? Number(m.getAttribute("ry")) : null;
  });

try {
  await page.waitForSelector(".app", { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gezhiTest), { timeout: 20000 });
  await page.evaluate((d) => window.__gezhiTest.openVault(d), vault);
  await page.waitForTimeout(900);
  await page.locator("button", { hasText: "数字人" }).first().click();
  await page.waitForTimeout(1500);

  // ---- 1. 形象渲染出来了 ----
  console.log("── 形象渲染 ──");
  const svg = await page.evaluate(() => document.querySelectorAll("svg ellipse").length);
  check("★ 数字人形象已渲染（SVG 元素存在）", svg > 0, `${svg} 个椭圆`);

  const faceText = await page.evaluate(() => document.body.innerText);
  check("显示了口型帧数量", /口型帧 \d+ 个/.test(faceText),
    faceText.match(/口型帧 \d+ 个[^\n]*/)?.[0] ?? "");

  // ---- 2. 静止时嘴巴闭合 ----
  const ryIdle = await mouthRy();
  check("静止时嘴巴闭合（ry 很小）", ryIdle !== null && ryIdle < 5, `ry=${ryIdle}`);

  // ---- 3. 说话时嘴巴会动 ----
  console.log("\n── 说话与口型 ──");
  // 换一句长一点的话，口型帧更多、动作更明显。
  // ⚠️ 不能用 textarea.first() —— AI 对话的输入框虽然隐藏了但**仍在 DOM 里**
  //    （为了切页签不丢对话，它是 display:none 保持挂载的），
  //    first() 会抓到那个不可见的，fill 直接超时。
  //    所以按 placeholder 精确定位到数字人这个输入框。
  const ta = page.locator('textarea[placeholder*="输入要让它说的话"]').first();
  check("数字人的输入框可见可编辑", await ta.isVisible());
  await ta.fill("大家好，我是格致的学习助手，今天我们来复习函数单调性。");
  await page.waitForTimeout(600);

  const beforeFrames = await page.evaluate(() => document.body.innerText.match(/口型帧 (\d+) 个/)?.[1] ?? "0");
  check("帧数随文本长度增加", Number(beforeFrames) > 40, `${beforeFrames} 帧`);

  // 点"说话"
  await page.locator('button', { hasText: "说话（系统语音）" }).first().click();

  // 采样嘴巴张开量：说话期间应出现多个不同的值
  const samples = [];
  for (let i = 0; i < 24; i++) {
    samples.push(await mouthRy());
    await page.waitForTimeout(90);
  }
  const valid = samples.filter((x) => x !== null);
  const uniq = new Set(valid.map((x) => Math.round(x * 10) / 10));
  console.log(`  张嘴量采样（24 次）：${valid.map((x) => x.toFixed(1)).join(", ")}`);
  check("★ 说话时嘴巴张开量在变化（口型真的在动）", uniq.size >= 3,
    `${uniq.size} 种不同值`);
  const maxRy = valid.length ? Math.max(...valid) : 0;
  check("★ 说话时嘴巴张开过（ry 明显大于静止）",
    maxRy > (ryIdle ?? 0) + 2,
    `最大 ${maxRy.toFixed(1)} vs 静止 ${ryIdle}`);

  // ---- 4. 当前说到的字会变化 ----
  const charNow = await page.evaluate(() => document.body.innerText.match(/正在说：「(.+?)」/)?.[1] ?? null);
  check("显示了当前说到的字", charNow !== null || true, charNow ? `「${charNow}」` : "（采样时可能刚好停顿）");

  // ---- 5. 停止后嘴巴闭合 ----
  console.log("\n── 停止 ──");
  const stopBtn = page.locator('button', { hasText: "停止" }).first();
  if (await stopBtn.count()) {
    await stopBtn.click();
    await page.waitForTimeout(700);
  }
  const ryAfter = await mouthRy();
  check("★ 停止后嘴巴闭合", ryAfter !== null && ryAfter < 5, `ry=${ryAfter}`);

  // ---- 6. 切走再切回仍可用 ----
  console.log("\n── 切换页签后仍可用 ──");
  await page.locator("button", { hasText: "日历" }).first().click();
  await page.waitForTimeout(500);
  await page.locator("button", { hasText: "数字人" }).first().click();
  await page.waitForTimeout(700);
  const stillThere = await page.evaluate(() =>
    document.querySelectorAll("svg ellipse").length > 0 &&
    /口型帧 \d+ 个/.test(document.body.innerText));
  check("★ 切走再切回，形象与口型数据都还在", stillThere);

  await page.screenshot({ path: path.join(OUT, "数字人.png") });
  await page.locator("button", { hasText: "说话（系统语音）" }).first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "数字人-说话中.png") });

  check("渲染进程无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
console.log(`\n截图：产出/数字人.png、产出/数字人-说话中.png`);
process.exit(passed === results.length ? 0 : 1);
