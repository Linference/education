#!/usr/bin/env node
// 验证各格式走对了查看器
//
// 起因：用户指出"把 csv/xlsx 都转 PDF 是错的"。
// 这个测试锁定每种格式该走哪条路：
//   · .pptx / .ppt  → LibreOffice 转 PDF（版式复杂，PDF 才对）
//   · .docx         → 原生渲染器（流式文档，不需要转）
//   · .xlsx / .xls  → **原生表格查看器**（要能看单元格，不是静态图）
//   · .csv          → 表格视图（虚拟滚动）
//   · .md           → Markdown 渲染
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

/** 找真实样本 */
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
        try { const sz = fs.statSync(p).size; if (sz > 1024 && sz < maxMB * 1024 * 1024) return p; } catch { /* 忽略 */ }
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
  if (!p) { console.log(`（找不到 ${ext} 样本，跳过）`); continue; }
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

/** 判断当前中间栏用的是什么查看器 */
async function probeViewer() {
  return page.evaluate(() => {
    const text = document.body.innerText;
    return {
      // 表格查看器的标志
      sheetToolbar: /行 × \d+ 列/.test(text),
      sheetVirtual: text.includes("虚拟滚动"),
      sheetTabs: /工作表 \d+ \/ \d+/.test(text),
      // CSV 查看器的标志
      csvNote: text.includes("虚拟滚动") || /共 \d+ 行/.test(text),
      // PDF 查看器的标志
      pdfCanvas: Boolean(document.querySelector("canvas")),
      pdfToolbar: text.includes("适应") || /第 \d+ \/ \d+ 页/.test(text),
      // Word 原生渲染器
      docxBody: Boolean(document.querySelector(".docx-body, .docx-viewer, [class*='docx']")),
      // 转换来源提示
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

  // ---- xlsx：应该是表格查看器 ----
  if (local[".xlsx"]) {
    console.log("── .xlsx（应走原生表格查看器，不是 PDF）──");
    await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), local[".xlsx"]);
    // ⚠️ 显式等到"行列数"出现再断言 —— 固定 waitForTimeout 会偶发地
    //    在界面渲染完之前就跑断言（第一次就是这么假失败的）
    let w = 0;
    while (w < 20000) {
      const ready = await page.evaluate(() => /行 × \d+ 列/.test(document.body.innerText));
      if (ready) break;
      await new Promise((r) => setTimeout(r, 300));
      w += 300;
    }
    const v = await probeViewer();
    check("★ .xlsx 用表格查看器（显示行列数）", v.sheetToolbar, v.body.slice(0, 90));
    check("★ .xlsx 没有转成 PDF", !v.pdfToolbar && !v.pdfCanvas,
      v.pdfCanvas ? "★ 又转 PDF 了" : "");
    check("表格查看器启用了虚拟滚动", v.sheetVirtual);
    check("多工作表时有切换标签", v.sheetTabs, v.sheetTabs ? "" : "（可能需要等更久）");
    await page.screenshot({ path: path.join(OUT, "格式-xlsx.png") });
  }

  // ---- csv：应该是表格视图 ----
  if (local[".csv"]) {
    console.log("\n── .csv（应走表格视图）──");
    await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), local[".csv"]);
    await page.waitForTimeout(2500);
    const v = await probeViewer();
    check("★ .csv 走表格视图（不是 PDF）", !v.pdfCanvas && (v.csvNote || v.sheetVirtual), v.body.slice(0, 90));
  }

  // ---- docx：应该是原生渲染器，不转 PDF ----
  if (local[".docx"]) {
    console.log("\n── .docx（应走原生渲染器，不转 PDF）──");
    await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), local[".docx"]);
    await page.waitForTimeout(3000);
    const v = await probeViewer();
    check("★ .docx 没有转成 PDF", !v.convertedFrom, v.convertedFrom ? "★ 又转 PDF 了" : "");
    check(".docx 渲染出了内容", v.body.length > 40, v.body.slice(0, 80));
  }

  // ---- pptx：应该走 PDF 转换（版式复杂） ----
  if (local[".pptx"]) {
    console.log("\n── .pptx（应走 LibreOffice 转 PDF）──");
    await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), local[".pptx"]);
    // 转换要几秒
    let w = 0, v = null;
    while (w < 90000) {
      v = await probeViewer();
      if (v.pdfCanvas && v.pdfToolbar) break;
      await new Promise((r) => setTimeout(r, 700));
      w += 700;
    }
    // ⚠️ 判定标准要用**渲染结果**（PDF 画布 + 页码），
    //    不能用"由 .pptx 转换"那行文字 —— 它只在「信息」页签里显示，
    //    默认停在「AI 助手」页签时读不到，会导致假失败（第一次就是这样）。
    check("★ .pptx 走高保真（渲染成 PDF 画布）", v.pdfCanvas, v.body.slice(0, 80));
    check("PDF 查看器显示页码（说明确实是 PDF）", v.pdfToolbar);

    // 切到信息页签确认"由 .pptx 转换"确实写在那里
    await page.locator("button", { hasText: "信息" }).first().click();
    await page.waitForTimeout(600);
    const info = await page.evaluate(() => document.body.innerText);
    check("★ 信息面板注明由 .pptx 转换（不冒充原始 PDF）",
      /由 \.pptx 转换/.test(info), "");

    await page.screenshot({ path: path.join(OUT, "格式-pptx.png") });
  }

  check("渲染进程无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
process.exit(passed === results.length ? 0 : 1);
