#!/usr/bin/env node
// Word (.docx) 查看器验证
//
// 单独一个脚本，因为 Word 渲染是最容易"看起来成功其实白屏"的一环：
// docx-preview 失败时会安静地什么都不渲染，必须断言 DOM 里真有内容。
import { _electron as electron } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "..", "..", "产出");
const SRC = path.join(OUT, "_测试文档.docx");

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, pass: Boolean(ok), detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? "  " + detail : ""}`);
}

if (!fs.existsSync(SRC)) {
  console.error("缺少测试文档：", SRC);
  console.error("先运行生成 docx 的脚本");
  process.exit(1);
}

// 造库并放入文档
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-docx-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"),
  JSON.stringify({ schemaVersion: 1, id: "docx-test", name: "Word 测试库" }, null, 2), "utf8");
const docxPath = path.join(vault, "讲义.docx");
fs.copyFileSync(SRC, docxPath);

console.log("=== Word 查看器验证 ===");

const app = await electron.launch({
  executablePath: path.join(HERE, "node_modules", "electron", "dist", "electron.exe"),
  args: [HERE],
  env: { ...process.env, GEZHI_TEST: "1" },
});
const page = await app.firstWindow();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

try {
  await page.waitForSelector(".app", { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gezhiTest), { timeout: 20000 });

  await page.evaluate((d) => window.__gezhiTest.openVault(d), vault);
  await page.waitForTimeout(400);
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), docxPath);

  // 给它足够时间渲染（docx-preview 是异步的，大文档更慢）
  await page.waitForTimeout(4000);

  const dom = await page.evaluate(() => {
    const wrap = document.querySelector(".docx-wrap");
    if (!wrap) return { hasWrap: false };
    const text = wrap.innerText || "";
    return {
      hasWrap: true,
      text,
      textLen: text.length,
      sections: wrap.querySelectorAll("section.docx").length,
      tables: wrap.querySelectorAll("table").length,
      paragraphs: wrap.querySelectorAll("p").length,
      hasPageBreak: wrap.querySelectorAll(".docx-wrapper").length,
      errorShown: Boolean(document.querySelector(".empty-state")),
      emptyStateText: document.querySelector(".empty-state")?.textContent ?? "",
    };
  });

  check("Word 查看区已挂载", dom.hasWrap === true);
  check("★ 渲染出文档页面（section.docx）", (dom.sections ?? 0) > 0, `${dom.sections} 个 section`);
  check("★ 渲染出段落", (dom.paragraphs ?? 0) > 0, `${dom.paragraphs} 个 <p>`);
  check("★ 渲染出表格", (dom.tables ?? 0) > 0, `${dom.tables} 个表格`);
  check("★ 中文内容正确显示",
    (dom.text ?? "").includes("情态动词") && (dom.text ?? "").includes("讲义"),
    JSON.stringify((dom.text ?? "").slice(0, 60)));
  check("表格内容正确", (dom.text ?? "").includes("must") && (dom.text ?? "").includes("把握程度"));
  check("没有掉进错误态", dom.errorShown !== true, dom.emptyStateText?.slice(0, 60) ?? "");
  check("渲染进程无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));

  fs.mkdirSync(OUT, { recursive: true });
  const shot = path.join(OUT, "ui-docx.png");
  await page.screenshot({ path: shot });
  console.log(`\n  截图：${path.relative(process.cwd(), shot)}`);

  // 顺便验证 .doc（旧格式）给出的是明确提示，而不是白屏
  const oldDoc = path.join(vault, "旧格式.doc");
  fs.writeFileSync(oldDoc, "not a real doc", "utf8");
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), oldDoc);
  await page.waitForTimeout(1500);
  const docMsg = await page.evaluate(() => document.querySelector(".empty-state")?.textContent ?? "");
  check("旧版 .doc 给出明确提示（不白屏）", docMsg.includes(".doc"), docMsg.slice(0, 80));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
process.exit(passed === results.length ? 0 : 1);
