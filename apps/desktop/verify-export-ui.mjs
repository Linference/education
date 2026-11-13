#!/usr/bin/env node
// In-UI export verification (end-to-end)
//
// Exercises the real path: open vault → open Markdown → click export → pick format → verify the file really gets created.
// The layer above, verify-export.mjs, tests the export core; this tests "can the user click it in the UI".
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

// ---- Build the vault ----
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-exp-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"),
  JSON.stringify({ id: "exp-test", name: "导出测试库" }), "utf8");

const MD = [
  "---",
  "type: 语法笔记",
  "tags: [英语, 语法]",
  "---",
  "",
  "# 情态动词",
  "",
  "情态动词表示说话人对动作的**态度**。",
  "",
  "## 一、对比",
  "",
  "| 情态动词 | 把握 | 语境 |",
  "| --- | --- | --- |",
  "| `must` | 高 | 有证据 |",
  "| `may` | 中 | 把握不大 |",
  "",
  "## 二、公式",
  "",
  "$$\\frac{P(B|A)P(A)}{P(B)}$$",
  "",
  "行内 $E = mc^2$ 也要渲染。",
  "",
  "- [ ] 造三个句子",
  "- [x] 判断同学写的",
  "",
  "相关：[[虚拟语气]]",
  "",
].join("\n");

const target = path.join(vault, "情态动词.md");
fs.writeFileSync(target, MD, "utf8");

console.log("=== In-UI export verification ===");
console.log(`  test vault: ${vault}\n`);

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

  // ---- 1. Main-process capability probe ----
  const probe = await page.evaluate(() => window.gezhi.exporter.probe());
  check("★ Typst detected (PDF available)", probe.pdf.available === true,
    probe.pdf.available ? path.basename(probe.pdf.engine ?? "") : String(probe.pdf.reason));
  check("python-docx detected (Word available)", probe.docx.available === true,
    probe.docx.available ? path.basename(probe.docx.engine ?? "") : String(probe.docx.reason));
  check("Markdown is always available", probe.markdown.available === true);
  check("template path resolves", Boolean(probe.paths.templatePath));

  // ---- 2. Open the file; the export button should appear in the UI ----
  await page.evaluate((d) => window.__gezhiTest.openVault(d), vault);
  await page.waitForTimeout(400);
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), target);
  await page.waitForTimeout(800);

  const exportBtn = page.locator("button", { hasText: "导出" }).first();
  check("★ an '导出' (Export) button appears in the UI", (await exportBtn.count()) > 0);

  // Open the menu and confirm all three formats are present
  await exportBtn.click();
  await page.waitForTimeout(600);
  const menuText = await page.locator("text=格式由你决定").count();
  check("★ export menu opens (the format is user-chosen)", menuText > 0);
  for (const f of ["PDF", "Word", "Markdown"]) {
    const n = await page.locator(`text=${f}`).count();
    check(`menu has a ${f} option`, n > 0);
  }
  await page.screenshot({ path: path.join(OUT, "ui-export-menu.png") });

  // ---- 3. Export all three formats directly via IPC (clicking the menu also works, but here we need the result for assertions) ----
  for (const [format, ext, minSize] of [["pdf", ".pdf", 20000], ["docx", ".docx", 5000], ["markdown", ".导出.md", 100]]) {
    const r = await page.evaluate(async ([md, src, fmt]) => {
      return window.gezhi.exporter.run({
        format: fmt,
        markdown: md,
        sourcePath: src,
        defaultName: "情态动词",
      });
    }, [MD, target, format]);

    check(`★ export ${format} succeeded`, r.ok === true, r.ok ? `${((r.size ?? 0) / 1024).toFixed(1)} KB` : String(r.error));
    if (r.ok && r.path) {
      check(`  ${format} file really exists`, fs.existsSync(r.path), path.basename(r.path));
      const size = fs.statSync(r.path).size;
      check(`  ${format} size is reasonable (>${(minSize / 1024).toFixed(0)}KB)`, size > minSize, `${(size / 1024).toFixed(1)} KB`);
    }
  }

  // ---- 4. Output carries no product signature (hard rule) ----
  for (const f of ["情态动词.pdf", "情态动词.docx"]) {
    const p = path.join(vault, f);
    if (!fs.existsSync(p)) { check(`${f} has no signature`, false, "file does not exist"); continue; }
    const raw = fs.readFileSync(p);
    const hitUtf8 = raw.includes(Buffer.from("格致", "utf8"));
    const hitUtf16 = raw.includes(Buffer.from("格致", "utf16le"));
    check(`★ ${f} has no product signature`, !hitUtf8 && !hitUtf16);
  }

  // ---- 5. Content correctness: the PDF should contain Chinese and formulas ----
  const pdfPath = path.join(vault, "情态动词.pdf");
  if (fs.existsSync(pdfPath)) {
    const txt = fs.readFileSync(pdfPath).toString("latin1");
    check("PDF embeds a Chinese font", /DengXian|YaHei|SimSun|MSYH/i.test(txt),
      (txt.match(/\/BaseFont\s*\/([A-Za-z0-9+,-]+)/g) ?? []).slice(0, 3).join(", "));
    check("PDF is not blank (>30KB)", fs.statSync(pdfPath).size > 30000,
      `${(fs.statSync(pdfPath).size / 1024).toFixed(1)} KB`);
  }

  check("no JS errors in the renderer process", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  // Keep a copy of the export results in 产出/ for manual inspection
  for (const f of ["情态动词.pdf", "情态动词.docx"]) {
    const p = path.join(vault, f);
    if (fs.existsSync(p)) {
      try { fs.copyFileSync(p, path.join(OUT, "界面导出-" + f)); } catch { /* ignore */ }
    }
  }
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* ignore */ }
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== Result: ${passed}/${results.length} passed ===`);
for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
console.log(`\nExport result copies: 产出/界面导出-情态动词.pdf / .docx`);
process.exit(passed === results.length ? 0 : 1);
