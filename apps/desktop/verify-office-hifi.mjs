#!/usr/bin/env node
// Word / Excel 高保真查看验证
//
// 扩展动机：内置 LibreOffice 后，只有 PPT 用上它是浪费。
//   · .docx 原来的原生渲染器只画文字与表格，**图片和复杂排版丢失**
//   · .xlsx 原来**根本没有查看器**（只识别不渲染）
//
// 要证明：
//   1. .docx 走高保真（PDF 画布），而不是原生渲染器
//   2. .xlsx 能打开（原来是"不支持的格式"）
//   3. 关掉开关后 .docx 退回原生渲染器（功能可退）
//   4. 没有引擎时不崩
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

/** 找用户真实的样本 */
function findSample(exts, maxMB = 30) {
  const found = {};
  const walk = (dir, depth) => {
    if (depth > 4 || Object.keys(found).length >= exts.length) return;
    let es; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      if (Object.keys(found).length >= exts.length) return;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p, depth + 1); continue; }
      const ext = path.extname(e.name).toLowerCase();
      if (!exts.includes(ext) || found[ext]) continue;
      try {
        const sz = fs.statSync(p).size;
        if (sz > 10 * 1024 && sz < maxMB * 1024 * 1024) found[ext] = p;
      } catch { /* 忽略 */ }
    }
  };
  for (const r of ["D:\\Users\\LINKIT\\Desktop", "D:\\Users\\LINKIT\\Documents"]) walk(r, 0);
  return found;
}

const samples = findSample([".docx", ".xlsx", ".doc"]);
console.log("=== Word / Excel 高保真验证 ===\n");
for (const [k, v] of Object.entries(samples)) {
  console.log(`  ${k}: ${path.basename(v)} (${(fs.statSync(v).size / 1024 / 1024).toFixed(1)} MB)`);
}
console.log();

if (!samples[".docx"] || !samples[".xlsx"]) {
  console.log("缺样本文件，跳过（造假样本证明不了什么）");
  process.exit(0);
}

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-office-hifi-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), JSON.stringify({ id: "oh" }), "utf8");
const localDocx = path.join(vault, "文档.docx");
const localXlsx = path.join(vault, "表格.xlsx");
const localDoc = path.join(vault, "旧版.doc");
fs.copyFileSync(samples[".docx"], localDocx);
fs.copyFileSync(samples[".xlsx"], localXlsx);
if (samples[".doc"]) fs.copyFileSync(samples[".doc"], localDoc);

const app = await electron.launch({
  executablePath: path.join(HERE, "node_modules", "electron", "dist", "electron.exe"),
  args: [HERE],
  env: { ...process.env, GEZHI_TEST: "1" },
});
const page = await app.firstWindow();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));

/** 等 PDF 画布出现（转换要几秒） */
async function waitForPdf(maxMs = 90000) {
  let waited = 0;
  let st = null;
  while (waited < maxMs) {
    st = await page.evaluate(() => ({
      canvas: Boolean(document.querySelector("canvas")),
      textMode: document.body.innerText.includes("文字提取模式"),
      body: document.body.innerText.slice(0, 200),
    }));
    if (st.canvas) break;
    await new Promise((r) => setTimeout(r, 700));
    waited += 700;
  }
  return st;
}

try {
  await page.waitForSelector(".app", { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gezhiTest), { timeout: 20000 });
  await page.evaluate((d) => window.__gezhiTest.openVault(d), vault);
  await page.waitForTimeout(800);

  // ---- 1. .docx ----
  console.log("── Word (.docx) ──");
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), localDocx);
  const docxState = await waitForPdf();
  check("★ .docx 走高保真（PDF 画布，不是原生渲染器）", docxState.canvas,
    docxState.canvas ? "" : `首屏：${docxState.body.replace(/\n/g, " | ").slice(0, 100)}`);
  // ⚠️ 必须先点开「信息」页签 —— 那条信息只在信息面板里显示。
  //    第一次没点，直接查 document.body.innerText 查不到，是假失败。
  await page.locator("button", { hasText: "信息" }).first().click();
  await page.waitForTimeout(600);
  const docxInfo = await page.evaluate(() => document.body.innerText);
  check("★ 信息面板注明由 .docx 转换（不冒充原始 PDF）",
    docxInfo.includes("由 .docx 转换"),
    docxInfo.includes("高保真") ? "（有高保真字样）" : "信息面板里没有转换说明");

  // ---- 2. .xlsx ----
  console.log("\n── Excel (.xlsx) ──");
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), localXlsx);
  const xlsxState = await waitForPdf();
  check("★ .xlsx 能打开（原来是「不支持的格式」）", xlsxState.canvas,
    xlsxState.canvas ? "" : `首屏：${xlsxState.body.replace(/\n/g, " | ").slice(0, 100)}`);

  // ---- 3. 旧版 .doc ----
  if (fs.existsSync(localDoc)) {
    console.log("\n── 旧版 .doc ──");
    await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), localDoc);
    const docState = await waitForPdf();
    check("★ 旧版 .doc 也走高保真", docState.canvas, "");
  }

  // ---- 4. 关掉开关 → .docx 退回原生渲染器 ----
  console.log("\n── 关闭开关后应退回原生渲染器 ──");
  await page.locator('.ribbon-btn[title*="高保真"]').first().click();
  await page.waitForTimeout(400);
  const localDocx2 = path.join(vault, "文档2.docx");
  fs.copyFileSync(samples[".docx"], localDocx2);
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), localDocx2);
  await page.waitForTimeout(4000);
  const fallback = await page.evaluate(() => ({
    canvas: Boolean(document.querySelector("canvas")),
    // 原生渲染器的标志：有 docx 容器
    native: Boolean(document.querySelector(".docx-viewer, .docx-body")) || document.body.innerText.length > 100,
  }));
  check("★ 关掉开关后 .docx 退回原生渲染器（不再有 PDF 画布）", !fallback.canvas,
    `画布=${fallback.canvas}`);

  await page.screenshot({ path: path.join(OUT, "ui-office-hifi.png") });
  check("渲染进程无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
console.log(`\n截图：产出/ui-office-hifi.png`);
process.exit(passed === results.length ? 0 : 1);
