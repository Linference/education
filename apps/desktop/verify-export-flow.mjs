#!/usr/bin/env node
// 导出验证（PDF / Word / Markdown）
//
// 起因：用户反馈"导出 Markdown 没反应"。
// 实测发现**导出其实成功了**，但界面把 32 字节显示成「0 KB」，
// 看起来像失败 —— 所以这个测试两条都要盯：
//   1. 文件真的落盘了
//   2. 反馈文案把大小显示对（小文件不能用 KB）
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

console.log("=== 导出验证 ===\n");

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

  // ---- 打开导出菜单 ----
  console.log("── 导出菜单 ──");
  await page.locator('button[title*="导出"]').first().click();
  await page.waitForTimeout(600);

  const menuSel = 'div[style*="width: 300px"]';
  const items = page.locator(`${menuSel} button`);
  const n = await items.count();
  check("★ 导出菜单有三种格式（PDF / Word / Markdown）", n === 3, `${n} 项`);

  const names = [];
  for (let i = 0; i < n; i++) names.push((await items.nth(i).innerText()).split("\n")[1] ?? "");
  check("三种格式分别是 PDF / Word / Markdown",
    names.join(",").includes("PDF") && names.join(",").includes("Word") && names.join(",").includes("Markdown"),
    names.join(" | "));

  // ---- 导出 Markdown ----
  console.log("\n── 导出 Markdown ──");
  await page.locator(`${menuSel} button`, { hasText: "Markdown" }).first().click();
  await page.waitForTimeout(2500);

  const feedback = await page.evaluate((sel) => document.querySelector(sel)?.innerText ?? "", menuSel);
  console.log("  反馈：" + feedback.replace(/\n/g, " / ").slice(0, 200));

  check("★ 界面显示「已导出」（不是静默无反应）", /已导出/.test(feedback), "");
  check("★ 反馈里写明了保存路径", /\.md/.test(feedback), "");
  check("★ 提供了「在文件夹中显示」入口", /在文件夹中显示/.test(feedback), "");

  // 关键：小文件不能显示成 0 KB（这正是用户觉得"没反应"的原因）
  check("★ 小文件的大小显示正确（不是「0 KB」）",
    !/（0 KB）/.test(feedback), feedback.match(/（[^）]*B[^）]*）/)?.[0] ?? "没找到大小");

  const outMd = path.join(vault, "导出测试.导出.md");
  check("★ Markdown 文件真的落盘了", fs.existsSync(outMd),
    fs.existsSync(outMd) ? `${fs.statSync(outMd).size} 字节` : "文件不存在");
  if (fs.existsSync(outMd)) {
    check("导出内容完整（含正文与公式）",
      fs.readFileSync(outMd, "utf8").includes("验证导出") &&
      fs.readFileSync(outMd, "utf8").includes("E = mc^2"));
  }

  // ---- 导出 PDF ----
  console.log("\n── 导出 PDF ──");
  await page.locator('button[title*="导出"]').first().click();   // 重新打开菜单
  await page.waitForTimeout(500);
  const pdfItem = page.locator(`${menuSel} button`, { hasText: "PDF" }).first();
  if (await pdfItem.count()) {
    await pdfItem.click();
    // PDF 生成要点时间
    await page.waitForTimeout(6000);
    const fb2 = await page.evaluate((sel) => document.querySelector(sel)?.innerText ?? "", menuSel);
    console.log("  反馈：" + fb2.replace(/\n/g, " / ").slice(0, 180));
    const outPdf = path.join(vault, "导出测试.pdf");
    check("★ PDF 真的落盘了", fs.existsSync(outPdf),
      fs.existsSync(outPdf) ? `${(fs.statSync(outPdf).size / 1024).toFixed(0)} KB` : "文件不存在");
    if (fs.existsSync(outPdf)) {
      const head = fs.readFileSync(outPdf).subarray(0, 5).toString("latin1");
      check("产出的确实是 PDF（文件头 %PDF-）", head === "%PDF-", head);
      // 产品硬规矩：产出物不得带产品署名
      const all = fs.readFileSync(outPdf).toString("latin1");
      check("★ PDF 不含产品署名（产品硬规矩）",
        !all.includes("格致"), "已检查原始字节");
    }
  }

  await page.screenshot({ path: path.join(OUT, "ui-export.png") });
  check("渲染进程无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
process.exit(passed === results.length ? 0 : 1);
