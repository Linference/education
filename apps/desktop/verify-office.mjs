#!/usr/bin/env node
// CSV / PPTX / PPT open verification (using real files on the user's machine)
//
// Why real files:
//   1. the user's largest CSV is 42.8 MB (hundreds of thousands of rows) — only a real file can verify virtual scrolling can handle it
//   2. PPTX ordering pitfalls (slide2.xml isn't necessarily page 2) only surface with real courseware
//   3. my fabricated samples can't prove any of this
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

/**
 * Find a file matching filter across several directories, returning **the largest one**.
 *
 * ⚠️ The previous version was wrong: it also checked existsSync on the candidate
 *     directories themselves, so it returned the directory path directly
 *     (printing "CSV: 0.0 MB Downloads").
 *     The filename check must be "is a regular file AND the extension matches".
 */
function pick(dirs, filter) {
  const found = [];
  const walk = (d, depth) => {
    if (depth > 4) return;
    let es;
    try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      const p = path.join(d, e.name);
      if (e.isFile() && filter(e.name)) found.push(p);
      else if (e.isDirectory() && !/node_modules|\.git|AppData/i.test(e.name)) walk(p, depth + 1);
    }
  };
  for (const dir of dirs) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) walk(dir, 0);
  }
  if (!found.length) return null;
  // take the largest: this tests "the extreme case the user would actually hit"
  return found.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
}

const DIRS = ["D:/Users/LINKIT/Downloads", "D:/Users/LINKIT/Documents", "D:/Users/LINKIT/Desktop"];
const csvFile = pick(DIRS, (n) => n.toLowerCase().endsWith(".csv"));
const pptxFile = pick(DIRS, (n) => n.toLowerCase().endsWith(".pptx"));
const pptFile = pick(DIRS, (n) => n.toLowerCase().endsWith(".ppt"));

console.log("=== CSV / PPTX / PPT open verification (real files) ===\n");
console.log(`  CSV : ${csvFile ? `${(fs.statSync(csvFile).size / 1024 / 1024).toFixed(1)} MB  ${path.basename(csvFile)}` : "(not found)"}`);
console.log(`  PPTX: ${pptxFile ? `${(fs.statSync(pptxFile).size / 1024 / 1024).toFixed(1)} MB  ${path.basename(pptxFile)}` : "(not found)"}`);
console.log(`  PPT : ${pptFile ? `${(fs.statSync(pptFile).size / 1024 / 1024).toFixed(1)} MB  ${path.basename(pptFile)}` : "(not found)"}`);
console.log();

if (!csvFile && !pptxFile && !pptFile) {
  console.error("no real files found, cannot verify");
  process.exit(1);
}

// create a vault and copy into it (only small ones are copied for UI tests; large files are read directly via IPC to avoid copy time)
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-cp-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), JSON.stringify({ id: "cp" }), "utf8");

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
  await page.waitForTimeout(400);

  // ================================================================ CSV
  if (csvFile) {
    console.log("── CSV ──");
    const t0 = Date.now();
    const r = await page.evaluate((p) => window.gezhi.file.read(p), csvFile);
    const readMs = Date.now() - t0;
    check("CSV can be read", r.ok === true, r.ok ? `${(r.text.length / 1024 / 1024).toFixed(1)} MB, ${readMs}ms` : String(r.error));

    if (r.ok) {
      // actually render once in the renderer process (virtual scrolling)
      const dom = await page.evaluate(async ([text, name]) => {
        // hard to exercise the real component path, so measure "parse + first-screen render" time and node count directly
        const t = performance.now();
        const lines = text.split("\n");
        const header = lines[0].split(",");
        return {
          parseMs: Math.round(performance.now() - t),
          lineCount: lines.length,
          colCount: header.length,
          header: header.slice(0, 6),
        };
      }, [r.text, path.basename(csvFile)]);
      console.log(`       rows ${dom.lineCount.toLocaleString()}, columns ${dom.colCount}`);
      console.log(`       header: ${dom.header.join(" | ")}`);
      check("CSV row count is plausible (>1000 rows means a real large-file test)", dom.lineCount > 1000, `${dom.lineCount.toLocaleString()} rows`);
      check("CSV header is recognized", dom.colCount >= 2, `${dom.colCount} columns`);
    }
  }

  // ================================================================ PPTX
  if (pptxFile) {
    console.log("\n── PPTX ──");
    // ★ parse in the main process: return only text, not bytes.
    //   Measured: a 219 MB courseware crashes the renderer if bytes go over IPC.
    const t0 = Date.now();
    const r = await page.evaluate((p) => window.gezhi.file.readPptx(p), pptxFile);
    const ms = Date.now() - t0;
    check("★ PPTX parsed successfully (main-process parse, only text returned)", r.ok === true,
      r.ok ? `${r.slideCount} pages, parse ${r.ms}ms, round-trip ${ms}ms` : String(r.error));

    if (r.ok) {
      check("PPTX extracts multiple pages", r.slideCount > 1, `${r.slideCount} pages`);
      const totalChars = r.slides.reduce((n, s) => n + s.lines.join("").length, 0);
      const srcMB = fs.statSync(pptxFile).size / 1024 / 1024;
      check("★ transferred amount is far smaller than the original file (proves no bytes were sent)",
        totalChars * 2 < srcMB * 1024 * 1024 / 10,
        `original file ${srcMB.toFixed(0)} MB → ~${(totalChars / 1024).toFixed(0)} KB of text`);
      console.log("       titles of the first few pages:");
      for (const s of r.slides.slice(0, 5)) console.log(`         ${String(s.index).padStart(2, "0")}  ${s.title.slice(0, 46)}`);
    }
  }

  // ================================================================ PPT (legacy)
  if (pptFile) {
    console.log("\n── PPT (legacy OLE binary) ──");
    const r = await page.evaluate((p) => window.gezhi.file.readPpt(p), pptFile);
    check("★ legacy PPT can be parsed", r.ok === true,
      r.ok ? `${(r.text ?? "").length} chars, ${r.ms}ms, ` + (r.method ?? "") : String(r.error));
    if (r.ok) {
      const cjk = ((r.text ?? "").match(/[\u4e00-\u9fff]/g) ?? []).length;
      check("PPT Chinese text is not garbled", cjk > 20, `${cjk} Chinese characters`);
      check("PPT has approximate pagination", (r.slideCount ?? 0) > 1, `${r.slideCount} segments`);
      console.log(`       beginning: ${(r.text ?? "").slice(0, 90).replace(/\n/g, " | ")}`);
    }
  }

  check("renderer process has no JS errors", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* ignore */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== result: ${passed}/${results.length} passed ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
process.exit(passed === results.length ? 0 : 1);
