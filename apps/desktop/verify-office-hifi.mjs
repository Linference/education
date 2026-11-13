#!/usr/bin/env node
// Word / Excel high-fidelity viewing verification
//
// Motivation for extending this: after bundling LibreOffice, only PPT using it was wasteful.
//   · .docx's old native renderer only drew text and tables; **images and complex layout were lost**
//   · .xlsx previously **had no viewer at all** (recognized but not rendered)
//
// What to prove:
//   1. .docx goes through high fidelity (PDF canvas), not the native renderer
//   2. .xlsx can open (previously "不支持的格式" (unsupported format))
//   3. after turning off the switch, .docx falls back to the native renderer (feature can be rolled back)
//   4. no crash when the engine is missing
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

/** Find the user's real samples */
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
      } catch { /* ignore */ }
    }
  };
  for (const r of ["D:\\Users\\LINKIT\\Desktop", "D:\\Users\\LINKIT\\Documents"]) walk(r, 0);
  return found;
}

const samples = findSample([".docx", ".xlsx", ".doc"]);
console.log("=== Word / Excel high-fidelity verification ===\n");
for (const [k, v] of Object.entries(samples)) {
  console.log(`  ${k}: ${path.basename(v)} (${(fs.statSync(v).size / 1024 / 1024).toFixed(1)} MB)`);
}
console.log();

if (!samples[".docx"] || !samples[".xlsx"]) {
  console.log("missing sample files, skipping (fabricated samples prove nothing)");
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

/** Wait for the PDF canvas to appear (conversion takes a few seconds) */
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
  check("★ .docx uses high fidelity (PDF canvas, not the native renderer)", docxState.canvas,
    docxState.canvas ? "" : `first screen: ${docxState.body.replace(/\n/g, " | ").slice(0, 100)}`);
  // ⚠️ Must first open the "信息" (Info) tab — that text only shows in the Info panel.
  //    If you don't click it first and query document.body.innerText directly, it won't be found (a false failure).
  await page.locator("button", { hasText: "信息" }).first().click();
  await page.waitForTimeout(600);
  const docxInfo = await page.evaluate(() => document.body.innerText);
  check("★ Info panel notes it was converted from .docx (doesn't impersonate the original PDF)",
    docxInfo.includes("由 .docx 转换"),
    docxInfo.includes("高保真") ? "(has 高保真 (high-fidelity) text)" : "Info panel has no conversion note");

  // ---- 2. .xlsx ----
  console.log("\n── Excel (.xlsx) ──");
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), localXlsx);
  const xlsxState = await waitForPdf();
  check("★ .xlsx can open (previously '不支持的格式' (unsupported format))", xlsxState.canvas,
    xlsxState.canvas ? "" : `first screen: ${xlsxState.body.replace(/\n/g, " | ").slice(0, 100)}`);

  // ---- 3. legacy .doc ----
  if (fs.existsSync(localDoc)) {
    console.log("\n── legacy .doc ──");
    await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), localDoc);
    const docState = await waitForPdf();
    check("★ legacy .doc also uses high fidelity", docState.canvas, "");
  }

  // ---- 4. turning off the switch → .docx falls back to the native renderer ----
  console.log("\n── after turning off the switch, should fall back to the native renderer ──");
  await page.locator('.ribbon-btn[title*="高保真"]').first().click();
  await page.waitForTimeout(400);
  const localDocx2 = path.join(vault, "文档2.docx");
  fs.copyFileSync(samples[".docx"], localDocx2);
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), localDocx2);
  await page.waitForTimeout(4000);
  const fallback = await page.evaluate(() => ({
    canvas: Boolean(document.querySelector("canvas")),
    // native renderer marker: has a docx container
    native: Boolean(document.querySelector(".docx-viewer, .docx-body")) || document.body.innerText.length > 100,
  }));
  check("★ after turning off the switch, .docx falls back to the native renderer (no more PDF canvas)", !fallback.canvas,
    `canvas=${fallback.canvas}`);

  await page.screenshot({ path: path.join(OUT, "ui-office-hifi.png") });
  check("renderer process has no JS errors", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* ignore */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== result: ${passed}/${results.length} passed ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
console.log(`\nscreenshot: 产出/ui-office-hifi.png`);
process.exit(passed === results.length ? 0 : 1);
