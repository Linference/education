#!/usr/bin/env node
// Actually open CSV / PPTX / PPT in the UI and take screenshots
//
// Why this extra layer: the verify-office.mjs above checks whether the IPC data is correct.
// But "data is correct" doesn't mean "the UI can draw it" — if the component route or props are wrong,
// the data-layer tests still pass. Here we take the full user path: open vault → click file → inspect DOM.
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

function pick(dirs, filter, maxDepth = 4) {
  const found = [];
  const walk = (d, depth) => {
    if (depth > maxDepth) return;
    let es;
    try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      const p = path.join(d, e.name);
      if (e.isFile() && filter(e.name)) found.push(p);
      else if (e.isDirectory() && !/node_modules|\.git|AppData/i.test(e.name)) walk(p, depth + 1);
    }
  };
  for (const d of dirs) if (fs.existsSync(d)) walk(d, 0);
  return found.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
}

const DIRS = ["D:/Users/LINKIT/Downloads", "D:/Users/LINKIT/Desktop", "D:/Users/LINKIT/Documents"];
const csv = pick(DIRS, (n) => n.toLowerCase().endsWith(".csv"))[0];
// pick a medium-sized PPTX (the 219MB one parses fast, but copying it into the temp vault takes time)
const pptxs = pick(DIRS, (n) => n.toLowerCase().endsWith(".pptx"));
const pptx = pptxs.find((p) => fs.statSync(p).size < 60 * 1024 * 1024) ?? pptxs[0];
const ppt = pick(DIRS, (n) => n.toLowerCase().endsWith(".ppt"))[0];

console.log("=== open CSV / PPTX / PPT in the UI ===\n");
for (const [k, v] of [["CSV", csv], ["PPTX", pptx], ["PPT", ppt]]) {
  console.log(`  ${k}: ${v ? `${(fs.statSync(v).size / 1024 / 1024).toFixed(1)} MB  ${path.basename(v)}` : "(not found)"}`);
}
console.log();

if (!csv || !pptx || !ppt) {
  console.error("missing test files");
  process.exit(1);
}

// build a temp vault and **hard-link** the files in (avoid copying hundreds of MB)
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-ov-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), JSON.stringify({ id: "ov" }), "utf8");

const linked = [];
for (const src of [csv, pptx, ppt]) {
  const dest = path.join(vault, path.basename(src));
  try { fs.linkSync(src, dest); linked.push(dest); }
  catch { fs.copyFileSync(src, dest); linked.push(dest); }
}

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
  await page.evaluate((d) => window.__gezhiTest.openVault(d), vault);
  await page.waitForTimeout(500);

  // ---- CSV ----
  console.log("── CSV UI ──");
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), linked[0]);
  await page.waitForTimeout(3500);   // 42MB takes a while to parse
  const csvDom = await page.evaluate(() => {
    const rows = document.querySelectorAll('[style*="height: 26px"]');
    return {
      hasTable: document.body.innerText.includes("行 ×"),
      rowCount: rows.length,
      virtualNote: /虚拟滚动/.test(document.body.innerText),
      headerCells: [...document.querySelectorAll("div")].filter((d) =>
        d.style && d.style.minWidth === "130px").length,
      sample: document.body.innerText.slice(0, 200).replace(/\n/g, " | "),
    };
  });
  check("CSV view renders the toolbar (with row count)", csvDom.hasTable, csvDom.sample.slice(0, 80));
  check("★ CSV renders only a small number of rows (virtual scrolling works)", csvDom.rowCount > 0 && csvDom.rowCount < 200,
    `${csvDom.rowCount} rows in DOM`);
  check("CSV bottom note says virtual scrolling", csvDom.virtualNote);
  await page.screenshot({ path: path.join(OUT, "ui-csv.png") });

  // ---- PPTX ----
  //
  // ★ Note: after bundling LibreOffice, PPT/PPTX **default to high fidelity**
  //   (converted to PDF and shown in the PDF viewer), not "text extraction mode".
  //   So we can no longer assert "text extraction mode appears" — that assertion was
  //   written before high fidelity existed.
  //
  //   Both outcomes pass, but **at least** one is required:
  //     · high fidelity: a PDF canvas appears (conversion succeeded)
  //     · text mode: the "文字提取模式" (text extraction mode) notice appears
  //       (engine not installed, or the switch is off)
  //   This keeps the test meaningful under both configurations instead of hard-coding
  //   the current implementation.
  console.log("\n── PPTX UI ──");
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), linked[1]);
  // high fidelity needs conversion, give it enough time
  await page.waitForTimeout(9000);
  const pptxDom = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasNotice: text.includes("文字提取模式"),
      hasPdfCanvas: Boolean(document.querySelector("canvas")),
      hiFiLabel: text.includes("高保真") || /由 \.pptx 转换/.test(text),
      hasList: /共 \d+ 页/.test(text),
      pageInfo: (text.match(/第 \d+ \/ \d+ 页/) ?? [])[0] ?? "",
      firstSlide: text.slice(0, 260).replace(/\n/g, " | "),
    };
  });
  check("★ PPTX UI can show content (high fidelity or text mode either way)",
    pptxDom.hasPdfCanvas || pptxDom.hasNotice,
    `high-fidelity=${pptxDom.hasPdfCanvas} text-mode=${pptxDom.hasNotice}`);
  check("★ with high fidelity the PDF canvas is visible / with text mode there is a page list",
    pptxDom.hasPdfCanvas || pptxDom.hasList,
    pptxDom.pageInfo || (pptxDom.hasPdfCanvas ? "(PDF canvas)" : ""));
  check("PPTX first page has content", pptxDom.firstSlide.length > 20, pptxDom.firstSlide.slice(0, 60));
  console.log(`       first screen: ${pptxDom.firstSlide.slice(0, 130)}`);
  await page.screenshot({ path: path.join(OUT, "ui-pptx.png") });

  // ---- PPT ----
  console.log("\n── PPT (legacy) UI ──");
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), linked[2]);
  await page.waitForTimeout(9000);
  const pptDom = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasNotice: text.includes("文字提取模式"),
      hasPdfCanvas: Boolean(document.querySelector("canvas")),
      hasApprox: text.includes("近似"),
      hasList: /共 \d+ 页/.test(text),
      sample: text.slice(0, 260).replace(/\n/g, " | "),
    };
  });
  check("★ legacy PPT UI can open", pptDom.sample.length > 20);
  check("legacy PPT shows content (high fidelity or text mode either way)",
    pptDom.hasPdfCanvas || pptDom.hasNotice,
    `high-fidelity=${pptDom.hasPdfCanvas} text-mode=${pptDom.hasNotice}`);
  check("★ legacy .ppt can also be high fidelity (which pure text mode can't do)",
    pptDom.hasPdfCanvas,
    pptDom.hasPdfCanvas ? "conversion succeeded" : "★ did not use high fidelity — legacy .ppt text extraction is a poor experience");
  console.log(`       first screen: ${pptDom.sample.slice(0, 130)}`);
  await page.screenshot({ path: path.join(OUT, "ui-ppt.png") });

  check("renderer process has no JS errors", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* ignore */ }
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== result: ${passed}/${results.length} passed ===`);
for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
console.log("\nscreenshots: 产出/ui-csv.png, ui-pptx.png, ui-ppt.png");
process.exit(passed === results.length ? 0 : 1);
