#!/usr/bin/env node
// 在界面里真的打开 CSV / PPTX / PPT，并截图
//
// 为什么还要这一层：上面的 verify-office.mjs 测的是 IPC 返回的数据对不对。
// 但"数据对"不等于"界面画得出来" —— 组件路由错了、props 传错了，
// 数据层测试一样全绿。这里走完整的用户路径：开库 → 点文件 → 看 DOM。
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
// PPTX 取中等大小的（219MB 那个解析很快，但复制进临时库要花时间）
const pptxs = pick(DIRS, (n) => n.toLowerCase().endsWith(".pptx"));
const pptx = pptxs.find((p) => fs.statSync(p).size < 60 * 1024 * 1024) ?? pptxs[0];
const ppt = pick(DIRS, (n) => n.toLowerCase().endsWith(".ppt"))[0];

console.log("=== 界面打开 CSV / PPTX / PPT ===\n");
for (const [k, v] of [["CSV", csv], ["PPTX", pptx], ["PPT", ppt]]) {
  console.log(`  ${k}: ${v ? `${(fs.statSync(v).size / 1024 / 1024).toFixed(1)} MB  ${path.basename(v)}` : "（没找到）"}`);
}
console.log();

if (!csv || !pptx || !ppt) {
  console.error("缺少测试文件");
  process.exit(1);
}

// 建临时库，把文件**硬链接**进去（避免复制几百 MB）
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
  console.log("── CSV 界面 ──");
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), linked[0]);
  await page.waitForTimeout(3500);   // 42MB 解析要点时间
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
  check("CSV 视图渲染出工具条（含行数）", csvDom.hasTable, csvDom.sample.slice(0, 80));
  check("★ CSV 只渲染少量行（虚拟滚动生效）", csvDom.rowCount > 0 && csvDom.rowCount < 200,
    `DOM 里 ${csvDom.rowCount} 行`);
  check("CSV 底部说明是虚拟滚动", csvDom.virtualNote);
  await page.screenshot({ path: path.join(OUT, "ui-csv.png") });

  // ---- PPTX ----
  console.log("\n── PPTX 界面 ──");
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), linked[1]);
  await page.waitForTimeout(3500);
  const pptxDom = await page.evaluate(() => ({
    hasNotice: document.body.innerText.includes("文字提取模式"),
    hasList: /共 \d+ 页/.test(document.body.innerText),
    pageInfo: (document.body.innerText.match(/第 \d+ \/ \d+ 页/) ?? [])[0] ?? "",
    firstSlide: document.body.innerText.slice(0, 260).replace(/\n/g, " | "),
  }));
  check("★ PPTX 界面显示「文字提取模式」提示", pptxDom.hasNotice);
  check("★ PPTX 界面显示页码列表", pptxDom.hasList, pptxDom.pageInfo);
  check("PPTX 第一页有内容", pptxDom.firstSlide.length > 60);
  console.log(`       首屏：${pptxDom.firstSlide.slice(0, 130)}`);
  await page.screenshot({ path: path.join(OUT, "ui-pptx.png") });

  // ---- PPT ----
  console.log("\n── PPT（旧版）界面 ──");
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), linked[2]);
  await page.waitForTimeout(2500);
  const pptDom = await page.evaluate(() => ({
    hasNotice: document.body.innerText.includes("文字提取模式"),
    hasApprox: document.body.innerText.includes("近似"),
    hasList: /共 \d+ 页/.test(document.body.innerText),
    sample: document.body.innerText.slice(0, 260).replace(/\n/g, " | "),
  }));
  check("★ 旧版 PPT 界面能打开", pptDom.sample.length > 60);
  check("PPT 界面说明是近似分页", pptDom.hasApprox, "提示里应写明页码是近似的");
  check("PPT 有页码列表", pptDom.hasList);
  console.log(`       首屏：${pptDom.sample.slice(0, 130)}`);
  await page.screenshot({ path: path.join(OUT, "ui-ppt.png") });

  check("渲染进程无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
console.log("\n截图：产出/ui-csv.png、ui-pptx.png、ui-ppt.png");
process.exit(passed === results.length ? 0 : 1);
