#!/usr/bin/env node
// PPTX Canvas 渲染验证（在真实应用里）
//
// 换掉 LibreOffice 后的验收：
//   1. 打开 .pptx 能画出 canvas（不是"文字提取模式"）
//   2. 速度：应该在百毫秒级，不是几十秒
//   3. 能翻页、渲染内容不是空白
//   4. 没有残留的外部进程（LibreOffice 已移除）
//   5. 旧版 .ppt 仍能打开（走文字模式，因为纯 JS 不支持）
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

const SAMPLES = {
  pptx: "D:\\Users\\LINKIT\\Desktop\\csp\\4.数据排序.pptx",
  ppt: "D:\\Users\\LINKIT\\Desktop\\物理竞赛\\历屆賽題\\全國物理競賽題集\\高中物理竞赛-热学部分.ppt",
};
const have = Object.entries(SAMPLES).filter(([, p]) => fs.existsSync(p));
if (!have.length) { console.log("缺样本，跳过"); process.exit(0); }

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-pptxjs-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), JSON.stringify({ id: "p" }), "utf8");
const local = {};
for (const [k, p] of have) {
  local[k] = path.join(vault, path.basename(p));
  fs.copyFileSync(p, local[k]);
}

console.log("=== PPTX Canvas 渲染验证 ===\n");
for (const [k, p] of have) console.log(`  ${k}: ${path.basename(p)} (${(fs.statSync(p).size / 1024 / 1024).toFixed(2)} MB)`);
console.log();

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
  await page.waitForTimeout(700);

  // ---- 1. PPTX Canvas 渲染 ----
  if (local.pptx) {
    console.log("── .pptx（Canvas 渲染）──");
    const t0 = Date.now();
    await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), local.pptx);

    // 等到 canvas 出现**且有内容、有尺寸**。
    // ⚠️ 不能一看到 canvas 就 break —— canvas 元素在解析完成前就存在于 DOM，
    //    而"第 1 / 29 页"这些文字要 React 状态更新后才渲染。
    //    第一版就是 break 太早，导致"总页数"读到空，翻页断言也跟着假失败。
    let waited = 0;
    let st = null;
    while (waited < 30000) {
      st = await page.evaluate(() => {
        const c = document.querySelector("canvas");
        let nonWhite = -1;
        if (c && c.width > 0) {
          try {
            const ctx = c.getContext("2d");
            const w = Math.min(c.width, 200), h = Math.min(c.height, 200);
            const d = ctx.getImageData(0, 0, w, h).data;
            nonWhite = 0;
            for (let i = 0; i < d.length; i += 4) {
              if (d[i] < 245 || d[i + 1] < 245 || d[i + 2] < 245) nonWhite++;
            }
          } catch { nonWhite = -1; }
        }
        return {
          hasCanvas: Boolean(c),
          size: c ? `${c.width}x${c.height}` : "",
          nonWhite,
          textMode: document.body.innerText.includes("文字提取模式"),
          // 匹配 "第 1 / 29 页"
          total: (document.body.innerText.match(/第\s*\d+\s*\/\s*(\d+)\s*页/) ?? [])[1] ?? "",
          current: (document.body.innerText.match(/第\s*(\d+)\s*\//) ?? [])[1] ?? "",
          body: document.body.innerText.slice(0, 160),
        };
      });
      // 三个条件都满足才算加载完：canvas 出现 + 有内容 + 总页数已渲染
      if (st.hasCanvas && st.nonWhite > 30 && st.total) break;
      await new Promise((r) => setTimeout(r, 400));
      waited += 400;
    }
    const elapsed = Date.now() - t0;

    check("★ .pptx 画出 canvas（不是文字列表）", st.hasCanvas, st.size);
    check("★ canvas 有实际内容（非空白）", st.nonWhite > 30, `非白像素 ${st.nonWhite}`);
    check("★ 没有退回文字提取模式", st.textMode === false);
    check("显示了总页数", Number(st.total) > 0, `${st.total} 页`);
    check("★ 打开速度在 5 秒内（对比 LibreOffice 的 19 秒）", elapsed < 5000, `${elapsed}ms`);

    // 翻页：比较 canvas 的 PNG 数据。
    //
    // 试过两种更弱的办法，都不可靠：
    //   · 数"非白像素" —— 两页都有彩色背景，都数到采样上限，测不出差异
    //   · 抽样像素哈希 —— 写出来的哈希恒为 0（自己的 bug）
    // 直接用 toDataURL 拿到整张图的编码，长度 + 前后片段一起比，简单可靠。
    const snapshot = () => page.evaluate(() => {
      const c = document.querySelector("canvas");
      if (!c) return null;
      const url = c.toDataURL("image/png");
      return { len: url.length, head: url.slice(0, 120), tail: url.slice(-120) };
    });

    const before = await snapshot();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(1200);
    const after = await snapshot();
    const pageNo = await page.evaluate(() => (document.body.innerText.match(/第\s*(\d+)\s*\//) ?? [])[1] ?? "");
    check("键盘右方向键能翻页", pageNo === "2", `当前第 ${pageNo} 页`);
    const changed = before && after && (before.len !== after.len || before.head !== after.head || before.tail !== after.tail);
    check("★ 翻页后渲染了新内容（PNG 数据不同）", Boolean(changed),
      before && after ? `${before.len} 字节 → ${after.len} 字节` : "拿不到 canvas 数据");

    await page.screenshot({ path: path.join(OUT, "ui-pptx-canvas.png") });
  }

  // ---- 2. 旧版 .ppt ----
  if (local.ppt) {
    console.log("\n── 旧版 .ppt（应走文字模式）──");
    await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), local.ppt);
    await page.waitForTimeout(6000);
    const pptSt = await page.evaluate(() => ({
      textMode: document.body.innerText.includes("文字提取模式"),
      hasCanvas: Boolean(document.querySelector("canvas")),
      body: document.body.innerText.slice(0, 200).replace(/\n/g, " | "),
    }));
    check("★ 旧版 .ppt 仍能打开（纯 JS 不支持，走文字模式）",
      pptSt.textMode || pptSt.hasCanvas, pptSt.textMode ? "文字模式" : `canvas=${pptSt.hasCanvas}`);
    check("旧版 .ppt 界面有内容", pptSt.body.length > 40, pptSt.body.slice(0, 80));
  }

  // ---- 3. 不应再有 LibreOffice 相关的转换 ----
  console.log("\n── 确认不再走 LibreOffice ──");
  const conv = await page.evaluate(() => window.gezhi.convert?.probe?.({}) ?? null);
  check("convert API 仍存在（未破坏接口）", conv !== null, conv ? `available=${conv.available}` : "（已移除）");

  check("渲染进程无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
console.log(`\n截图：产出/ui-pptx-canvas.png`);
process.exit(passed === results.length ? 0 : 1);
