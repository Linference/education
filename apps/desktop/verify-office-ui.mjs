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
  //
  // ★ 注意：内置 LibreOffice 之后，PPT/PPTX **默认走高保真**（转成 PDF 用
  //   PDF 查看器显示），而不是"文字提取模式"。
  //   所以这里不能再断言"出现文字提取模式"—— 那条断言写于还没有高保真的时候。
  //
  //   两种结果都算通过，但要求**至少**是一种：
  //     · 高保真：看到 PDF 画布（说明转换成功）
  //     · 文字模式：看到「文字提取模式」提示（说明没装引擎或开关关了）
  //   这样测试在两种配置下都有意义，而不是把"当前实现"写死。
  console.log("\n── PPTX 界面 ──");
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), linked[1]);
  // 高保真要转换，给足时间
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
  check("★ PPTX 界面能显示内容（高保真或文字模式皆可）",
    pptxDom.hasPdfCanvas || pptxDom.hasNotice,
    `高保真=${pptxDom.hasPdfCanvas} 文字模式=${pptxDom.hasNotice}`);
  check("★ 高保真时能看到 PDF 画布 / 文字模式时有页码列表",
    pptxDom.hasPdfCanvas || pptxDom.hasList,
    pptxDom.pageInfo || (pptxDom.hasPdfCanvas ? "（PDF 画布）" : ""));
  check("PPTX 第一页有内容", pptxDom.firstSlide.length > 20, pptxDom.firstSlide.slice(0, 60));
  console.log(`       首屏：${pptxDom.firstSlide.slice(0, 130)}`);
  await page.screenshot({ path: path.join(OUT, "ui-pptx.png") });

  // ---- PPT ----
  console.log("\n── PPT（旧版）界面 ──");
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
  check("★ 旧版 PPT 界面能打开", pptDom.sample.length > 20);
  check("旧版 PPT 显示内容（高保真或文字模式皆可）",
    pptDom.hasPdfCanvas || pptDom.hasNotice,
    `高保真=${pptDom.hasPdfCanvas} 文字模式=${pptDom.hasNotice}`);
  check("★ 旧版 .ppt 也能高保真（这是纯文字模式做不到的）",
    pptDom.hasPdfCanvas,
    pptDom.hasPdfCanvas ? "转换成功" : "★ 没走高保真 —— 旧版 .ppt 靠文字提取体验很差");
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
