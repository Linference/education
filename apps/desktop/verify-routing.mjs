#!/usr/bin/env node
// Verify each format goes to the right viewer
//
// Why: a user pointed out that "converting csv/xlsx all to PDF is wrong".
// This test pins down which path each format should take:
//   · .pptx / .ppt  → LibreOffice converts to PDF (complex layout, PDF is the right call)
//   · .docx         → native renderer (flow document, no conversion needed)
//   · .xlsx / .xls  → **native sheet viewer** (must show cells, not a static image)
//   · .csv          → table view (virtual scrolling)
//   · .md           → Markdown rendering
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

/** Find a real sample file */
function find(ext, maxMB = 15) {
  const roots = ["D:\\Users\\LINKIT\\Desktop", "D:\\Users\\LINKIT\\Documents"];
  for (const root of roots) {
    const hit = (function walk(dir, depth) {
      if (depth > 4) return null;
      let es; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
      for (const e of es) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { const r = walk(p, depth + 1); if (r) return r; continue; }
        if (path.extname(e.name).toLowerCase() !== ext) continue;
        try { const sz = fs.statSync(p).size; if (sz > 1024 && sz < maxMB * 1024 * 1024) return p; } catch { /* ignore */ }
      }
      return null;
    })(root, 0);
    if (hit) return hit;
  }
  return null;
}

const samples = {
  ".xlsx": find(".xlsx"),
  ".csv": find(".csv", 5),
  ".docx": find(".docx"),
  ".pptx": find(".pptx", 8),
};

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-fmt-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), JSON.stringify({ id: "f" }), "utf8");

const local = {};
for (const [ext, p] of Object.entries(samples)) {
  if (!p) { console.log(`(no ${ext} sample found, skipping)`); continue; }
  const dest = path.join(vault, `样本${ext}`);
  fs.copyFileSync(p, dest);
  local[ext] = dest;
  console.log(`  ${ext}: ${path.basename(p)} (${(fs.statSync(p).size / 1024 / 1024).toFixed(1)} MB)`);
}
console.log();

const app = await electron.launch({
  executablePath: path.join(HERE, "node_modules", "electron", "dist", "electron.exe"),
  args: [HERE],
  env: { ...process.env, GEZHI_TEST: "1" },
});
const page = await app.firstWindow();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));

/** Determine which viewer the middle pane is currently using */
async function probeViewer() {
  return page.evaluate(() => {
    const text = document.body.innerText;
    return {
      // marker for the sheet viewer
      sheetToolbar: /行 × \d+ 列/.test(text),
      sheetVirtual: text.includes("虚拟滚动"),
      sheetTabs: /工作表 \d+ \/ \d+/.test(text),
      // marker for the CSV viewer
      csvNote: text.includes("虚拟滚动") || /共 \d+ 行/.test(text),
      // marker for the PDF viewer
      pdfCanvas: Boolean(document.querySelector("canvas")),
      pdfToolbar: text.includes("适应") || /第 \d+ \/ \d+ 页/.test(text),
      // native Word renderer
      docxBody: Boolean(document.querySelector(".docx-body, .docx-viewer, [class*='docx']")),
      // conversion-source hint
      convertedFrom: /由 \.(pptx|ppt|docx|xlsx) 转换/.test(text),
      body: text.slice(0, 200).replace(/\n/g, " | "),
    };
  });
}

try {
  await page.waitForSelector(".app", { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gezhiTest), { timeout: 20000 });
  await page.evaluate((d) => window.__gezhiTest.openVault(d), vault);
  await page.waitForTimeout(800);

  // ---- xlsx: should be the sheet viewer ----
  if (local[".xlsx"]) {
    console.log("── .xlsx (should use the native sheet viewer, not PDF) ──");
    await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), local[".xlsx"]);
    // ⚠️ Explicitly wait until the "row × column" count appears before asserting — a fixed
    //    waitForTimeout occasionally runs the assertion before the UI finishes rendering
    //    (that is exactly how the first run produced a false failure).
    let w = 0;
    while (w < 20000) {
      const ready = await page.evaluate(() => /行 × \d+ 列/.test(document.body.innerText));
      if (ready) break;
      await new Promise((r) => setTimeout(r, 300));
      w += 300;
    }
    const v = await probeViewer();
    check("★ .xlsx uses the sheet viewer (shows row/column count)", v.sheetToolbar, v.body.slice(0, 90));
    check("★ .xlsx was not converted to PDF", !v.pdfToolbar && !v.pdfCanvas,
      v.pdfCanvas ? "★ converted to PDF again" : "");
    check("the sheet viewer enables virtual scrolling", v.sheetVirtual);
    check("there are tab switchers when there are multiple sheets", v.sheetTabs, v.sheetTabs ? "" : "(may need to wait longer)");
    await page.screenshot({ path: path.join(OUT, "格式-xlsx.png") });
  }

  // ---- csv: should be the table view ----
  if (local[".csv"]) {
    console.log("\n── .csv (should use the table view) ──");
    await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), local[".csv"]);
    await page.waitForTimeout(2500);
    const v = await probeViewer();
    check("★ .csv uses the table view (not PDF)", !v.pdfCanvas && (v.csvNote || v.sheetVirtual), v.body.slice(0, 90));
  }

  // ---- docx: should be the native renderer, not converted to PDF ----
  if (local[".docx"]) {
    console.log("\n── .docx (should use the native renderer, not PDF) ──");
    await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), local[".docx"]);
    await page.waitForTimeout(3000);
    const v = await probeViewer();
    check("★ .docx was not converted to PDF", !v.convertedFrom, v.convertedFrom ? "★ converted to PDF again" : "");
    check(".docx rendered content", v.body.length > 40, v.body.slice(0, 80));
  }

  // ---- pptx: should go through PDF conversion (complex layout) ----
  if (local[".pptx"]) {
    console.log("\n── .pptx (should go through LibreOffice PDF conversion) ──");
    await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), local[".pptx"]);
    // conversion takes a few seconds
    let w = 0, v = null;
    while (w < 90000) {
      v = await probeViewer();
      if (v.pdfCanvas && v.pdfToolbar) break;
      await new Promise((r) => setTimeout(r, 700));
      w += 700;
    }
    // ⚠️ The criterion must use the **rendered result** (PDF canvas + page number),
    //    not the "由 .pptx 转换" (converted from .pptx) line of text — that only shows
    //    in the 「信息」 (Info) tab, and it is not readable when the app defaults to the
    //    「AI 助手」 (AI Assistant) tab, which would cause a false failure (the first run was like this).
    check("★ .pptx uses high-fidelity rendering (rendered to a PDF canvas)", v.pdfCanvas, v.body.slice(0, 80));
    check("the PDF viewer shows page numbers (proving it really is a PDF)", v.pdfToolbar);

    // Switch to the Info tab to confirm the "由 .pptx 转换" (converted from .pptx) note is really written there
    await page.locator("button", { hasText: "信息" }).first().click();
    await page.waitForTimeout(600);
    const info = await page.evaluate(() => document.body.innerText);
    check("★ the Info panel states it was converted from .pptx (not masquerading as an original PDF)",
      /由 \.pptx 转换/.test(info), "");

    await page.screenshot({ path: path.join(OUT, "格式-pptx.png") });
  }

  check("renderer process has no JS errors", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* ignore */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== Result: ${passed}/${results.length} passed ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
process.exit(passed === results.length ? 0 : 1);
