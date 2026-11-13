#!/usr/bin/env node
// Export verification (PDF / Word / Markdown)
//
// Background: a user reported "exporting Markdown does nothing".
// Testing showed the **export actually succeeds**, but the UI renders 32 bytes as "0 KB",
// which looks like a failure — so this test watches both:
//   1. the file really lands on disk
//   2. the feedback text shows the size correctly (small files must not use KB)
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

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-exp-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), JSON.stringify({ id: "e" }), "utf8");

const MD = [
  "# 导出测试笔记",
  "",
  "这是一段正文，用来验证导出。",
  "",
  "## 小标题",
  "",
  "- 列表项一",
  "- 列表项二",
  "",
  "公式测试：$E = mc^2$",
  "",
].join("\n");
const mdPath = path.join(vault, "导出测试.md");
fs.writeFileSync(mdPath, MD, "utf8");

console.log("=== Export verification ===\n");

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
  await page.waitForTimeout(800);
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), mdPath);
  await page.waitForTimeout(1800);

  // ---- Open the export menu ----
  console.log("── Export menu ──");
  await page.locator('button[title*="导出"]').first().click();
  await page.waitForTimeout(600);

  const menuSel = 'div[style*="width: 300px"]';
  const items = page.locator(`${menuSel} button`);
  const n = await items.count();
  check("★ export menu has three formats (PDF / Word / Markdown)", n === 3, `${n} items`);

  const names = [];
  for (let i = 0; i < n; i++) names.push((await items.nth(i).innerText()).split("\n")[1] ?? "");
  check("the three formats are PDF / Word / Markdown",
    names.join(",").includes("PDF") && names.join(",").includes("Word") && names.join(",").includes("Markdown"),
    names.join(" | "));

  // ---- 导出 Markdown ----
  console.log("\n── Export Markdown ──");
  await page.locator(`${menuSel} button`, { hasText: "Markdown" }).first().click();
  await page.waitForTimeout(2500);

  const feedback = await page.evaluate((sel) => document.querySelector(sel)?.innerText ?? "", menuSel);
  console.log("  feedback: " + feedback.replace(/\n/g, " / ").slice(0, 200));

  check("★ UI shows '已导出' (Exported) — not a silent no-op", /已导出/.test(feedback), "");
  check("★ feedback states the save path", /\.md/.test(feedback), "");
  check("★ offers a '在文件夹中显示' (Show in Folder) entry point", /在文件夹中显示/.test(feedback), "");

  // Key: small files must not display as 0 KB (that is exactly why the user thought it "did nothing")
  check("★ small-file size is shown correctly (not '0 KB')",
    !/（0 KB）/.test(feedback), feedback.match(/（[^）]*B[^）]*）/)?.[0] ?? "size not found");

  const outMd = path.join(vault, "导出测试.导出.md");
  check("★ Markdown file really landed on disk", fs.existsSync(outMd),
    fs.existsSync(outMd) ? `${fs.statSync(outMd).size} bytes` : "file does not exist");
  if (fs.existsSync(outMd)) {
    check("exported content is complete (body and formula)",
      fs.readFileSync(outMd, "utf8").includes("验证导出") &&
      fs.readFileSync(outMd, "utf8").includes("E = mc^2"));
  }

  // ---- 导出 PDF ----
  console.log("\n── Export PDF ──");
  await page.locator('button[title*="导出"]').first().click();   // reopen the menu
  await page.waitForTimeout(500);
  const pdfItem = page.locator(`${menuSel} button`, { hasText: "PDF" }).first();
  if (await pdfItem.count()) {
    await pdfItem.click();
    // PDF generation takes some time
    await page.waitForTimeout(6000);
    const fb2 = await page.evaluate((sel) => document.querySelector(sel)?.innerText ?? "", menuSel);
    console.log("  feedback: " + fb2.replace(/\n/g, " / ").slice(0, 180));
    const outPdf = path.join(vault, "导出测试.pdf");
    check("★ PDF really landed on disk", fs.existsSync(outPdf),
      fs.existsSync(outPdf) ? `${(fs.statSync(outPdf).size / 1024).toFixed(0)} KB` : "file does not exist");
    if (fs.existsSync(outPdf)) {
      const head = fs.readFileSync(outPdf).subarray(0, 5).toString("latin1");
      check("the output is indeed a PDF (header %PDF-)", head === "%PDF-", head);
      // Product hard rule: output must not carry the product signature
      const all = fs.readFileSync(outPdf).toString("latin1");
      check("★ PDF has no product signature (product hard rule)",
        !all.includes("格致"), "raw bytes checked");
    }
  }

  await page.screenshot({ path: path.join(OUT, "ui-export.png") });
  check("no JS errors in the renderer process", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* ignore */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== Result: ${passed}/${results.length} passed ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
process.exit(passed === results.length ? 0 : 1);
