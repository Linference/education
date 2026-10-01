#!/usr/bin/env node
// 高保真查看的端到端验证（在真实应用界面里）
//
// 要证明的事：
//   1. 应用启动时探测到 LibreOffice，并显示开关
//   2. 打开真实 PPTX → 走转换路径 → 用 PDF 查看器显示（不是文字列表）
//   3. 关掉开关 → 退回文字模式（保证可退）
//   4. 转换失败时给出明确提示，不白屏
//   5. 老格式 .ppt / .doc 也能高保真打开
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

// 用用户真实的文件（这是关键 —— 造假的样本证明不了什么）
const SAMPLES = {
  pptx: "D:\\Users\\LINKIT\\Desktop\\csp\\4.数据排序.pptx",
  ppt: "D:\\Users\\LINKIT\\Desktop\\物理竞赛\\历屆賽題\\全國物理競賽題集\\高中物理竞赛-热学部分.ppt",
};
const missing = Object.entries(SAMPLES).filter(([, p]) => !fs.existsSync(p));
if (missing.length) {
  console.log("缺少样本文件：" + missing.map(([k]) => k).join(", "));
  console.log("（用假文件测不出真实效果，所以直接跳过）");
  process.exit(0);
}

// 用一个临时库，把样本复制进去
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-hifi-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), JSON.stringify({ id: "hifi" }), "utf8");
const localPptx = path.join(vault, "数据排序.pptx");
const localPpt = path.join(vault, "热学部分.ppt");
fs.copyFileSync(SAMPLES.pptx, localPptx);
fs.copyFileSync(SAMPLES.ppt, localPpt);

console.log("=== 高保真查看端到端验证 ===\n");
console.log(`  样本：${path.basename(SAMPLES.pptx)} / ${path.basename(SAMPLES.ppt)}\n`);

const app = await electron.launch({
  executablePath: path.join(HERE, "node_modules", "electron", "dist", "electron.exe"),
  args: [HERE],
  env: { ...process.env, GEZHI_TEST: "1" },
});
const page = await app.firstWindow();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));

try {
  await page.waitForSelector(".app", { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gezhiTest), { timeout: 20000 });

  // ---- 1. 探测 ----
  console.log("── 引擎探测 ──");
  const probe = await page.evaluate(() => window.gezhi.convert.probe({}));
  check("★ 应用探测到 LibreOffice", probe.available === true, probe.engine ?? probe.reason ?? "");
  check("引擎指向随包的那份", String(probe.engine ?? "").includes("vendor"), probe.engine ?? "");
  check("探测结果里带 version 字段（可为 null）", "version" in probe, JSON.stringify(probe.version));

  await page.evaluate((d) => window.__gezhiTest.openVault(d), vault);
  await page.waitForTimeout(800);
  await page.evaluate(() => window.gezhi.search.waitIdle());
  await page.waitForTimeout(400);

  const ribbonHasToggle = await page.evaluate(() =>
    [...document.querySelectorAll(".ribbon-btn")].some((b) => (b.getAttribute("title") ?? "").includes("高保真")));
  check("★ 工具栏出现了「高保真查看」开关", ribbonHasToggle);

  // ---- 2. 打开 PPTX（应走转换）----
  console.log("\n── 打开 PPTX（高保真路径）──");
  const t0 = Date.now();
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), localPptx);
  // 转换要几秒，等到出现 PDF 画布或明确的错误
  let waited = 0;
  let state = null;
  while (waited < 90000) {
    state = await page.evaluate(() => ({
      hasPdfToolbar: document.body.innerText.includes("适应") || Boolean(document.querySelector(".pdf-viewer")),
      hasCanvas: Boolean(document.querySelector("canvas")),
      hasPptTextMode: document.body.innerText.includes("文字提取模式"),
      body: document.body.innerText.slice(0, 300),
      status: document.querySelector(".statusbar, .status")?.textContent ?? "",
    }));
    if (state.hasPdfToolbar && state.hasCanvas) break;
    await new Promise((r) => setTimeout(r, 700));
    waited += 700;
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`      等待 ${elapsed}s`);

  check("★ PPTX 走高保真路径（显示为 PDF 画布，不是文字列表）",
    state.hasPdfToolbar && state.hasCanvas,
    state.hasPdfToolbar ? "" : "没看到 PDF 查看器");
  check("★ 没有退回文字提取模式", state.hasPptTextMode === false);

  // 信息面板应说明"由 .pptx 转换"，让用户知道这不是原始 PDF
  const infoTab = page.locator("button", { hasText: "信息" }).first();
  await infoTab.click();
  await page.waitForTimeout(600);
  const infoText = await page.evaluate(() => document.body.innerText);
  check("★ 信息面板注明「由 .pptx 转换」（不冒充原始 PDF）",
    infoText.includes("由 .pptx 转换") || infoText.includes("高保真"), "");

  // ---- 3. 旧版 .ppt ----
  console.log("\n── 打开旧版 .ppt ──");
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), localPpt);
  waited = 0;
  let s2 = null;
  while (waited < 90000) {
    s2 = await page.evaluate(() => ({
      hasCanvas: Boolean(document.querySelector("canvas")),
      hasPptTextMode: document.body.innerText.includes("文字提取模式"),
    }));
    if (s2.hasCanvas && !s2.hasPptTextMode) break;
    await new Promise((r) => setTimeout(r, 700));
    waited += 700;
  }
  check("★ 旧版 .ppt 也走高保真路径", s2.hasCanvas && !s2.hasPptTextMode,
    `canvas=${s2.hasCanvas} 文字模式=${s2.hasPptTextMode}`);

  // ---- 4. 关掉开关 → 退回文字模式 ----
  console.log("\n── 关闭开关后应退回文字模式 ──");
  const toggle = page.locator('.ribbon-btn[title*="高保真"]').first();
  await toggle.click();
  await page.waitForTimeout(400);

  // ⚠️ 必须用一个**新文件**来测。
  //    openFile 对已打开的路径只做切换标签页（不会重新加载），
  //    所以拿刚打开过的 pptx 去测，看到的是上次的 PDF —— 假失败。
  const localPptx2 = path.join(vault, "数据排序-副本.pptx");
  fs.copyFileSync(SAMPLES.pptx, localPptx2);
  // 刷新文件树让新文件可见（测试钩子直接按路径打开，其实不刷新也行）
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), localPptx2);
  await page.waitForTimeout(4000);

  const textMode = await page.evaluate(() => ({
    hasPptTextMode: document.body.innerText.includes("文字提取模式"),
    hasCanvas: Boolean(document.querySelector("canvas")),
    pptLines: document.body.innerText.includes("共 29 页"),
  }));
  check("★ 关掉开关后新开文件走文字模式（功能可退）", textMode.hasPptTextMode,
    `文字模式=${textMode.hasPptTextMode} canvas=${textMode.hasCanvas} 页数提示=${textMode.pptLines}`);

  // 再打开开关，应恢复高保真
  await toggle.click();
  await page.waitForTimeout(400);
  const localPptx3 = path.join(vault, "数据排序-副本2.pptx");
  fs.copyFileSync(SAMPLES.pptx, localPptx3);
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), localPptx3);
  let w3 = 0, back = null;
  while (w3 < 90000) {
    back = await page.evaluate(() => ({
      hasCanvas: Boolean(document.querySelector("canvas")),
      hasText: document.body.innerText.includes("文字提取模式"),
    }));
    if (back.hasCanvas && !back.hasText) break;
    await new Promise((r) => setTimeout(r, 700));
    w3 += 700;
  }
  check("★ 重新打开开关后恢复高保真", back.hasCanvas && !back.hasText,
    `canvas=${back.hasCanvas} 文字模式=${back.hasText}`);

  await page.screenshot({ path: path.join(OUT, "ui-hifi.png") });

  // ---- 5. 失败路径 ----
  console.log("\n── 失败路径 ──");
  const bad = path.join(vault, "损坏文件.pptx");
  fs.writeFileSync(bad, "这不是一个真实的 pptx 文件。".repeat(120), "utf8");
  const r = await page.evaluate((p) => window.gezhi.convert.toPdf({ src: p }), bad);
  check("损坏文件转换失败时返回明确错误（不崩）",
    r.ok === false && /损坏|识别为/.test(r.error ?? ""), String(r.error ?? "").slice(0, 90));

  // 空文件
  const empty = path.join(vault, "空文件.pptx");
  fs.writeFileSync(empty, "", "utf8");
  const r2 = await page.evaluate((p) => window.gezhi.convert.toPdf({ src: p }), empty);
  check("空文件转换被拒绝并说明原因", r2.ok === false && /空/.test(r2.error ?? ""),
    String(r2.error ?? "").slice(0, 70));

  check("渲染进程无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
console.log(`\n截图：产出/ui-hifi.png`);
process.exit(passed === results.length ? 0 : 1);
