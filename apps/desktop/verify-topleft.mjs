#!/usr/bin/env node
// 左上角交互验证：折叠按钮、筛选框、未启用功能的禁用态
//
// 为什么要测这些"小"交互：
//   1. 折叠按钮如果点了没反应，用户会以为软件卡了
//   2. 筛选框如果只是摆设（不过滤），比没有更糟
//   3. **未启用的功能必须真的不可点** —— 之前它们和真按钮一样，
//      点了没反应，等于骗用户。这是本轮明确要修的问题。
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

// 造一个有多个文件的库，才能测筛选
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-ui2-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), JSON.stringify({ id: "u2" }), "utf8");
fs.mkdirSync(path.join(vault, "英语"), { recursive: true });
fs.mkdirSync(path.join(vault, "物理"), { recursive: true });
fs.writeFileSync(path.join(vault, "英语", "情态动词.md"), "# 情态动词\n", "utf8");
fs.writeFileSync(path.join(vault, "英语", "虚拟语气.md"), "# 虚拟语气\n", "utf8");
fs.writeFileSync(path.join(vault, "物理", "电磁感应.md"), "# 电磁感应\n", "utf8");
fs.writeFileSync(path.join(vault, "读书笔记.md"), "# 读书笔记\n", "utf8");

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

  // ---- 1. logo 显示 ----
  const logo = await page.evaluate(() => {
    const img = document.querySelector(".titlebar img");
    return img ? { w: img.width, h: img.height, src: img.getAttribute("src")?.slice(0, 40) } : null;
  });
  check("★ 标题栏显示 logo", logo !== null, logo ? `${logo.w}×${logo.h}px` : "没有 img");
  check("logo 尺寸 ≥24px（20px 以下 GZ 会糊）", (logo?.w ?? 0) >= 24);

  // ---- 2. 面包屑 ----
  const crumb = await page.locator(".titlebar").innerText();
  check("标题栏有库名", crumb.includes(path.basename(vault)), crumb.replace(/\n/g, " ").slice(0, 60));

  // ---- 3. 折叠按钮：点一下左栏应该消失 ----
  // ⚠️ 选择器要用 .sidebar:not(.right) —— 左右侧栏共用 .sidebar 这个类，
  //    只写 .sidebar 会数到 2 个，折叠后剩 1 个，看起来像"没折叠干净"。
  const leftSidebar = page.locator(".sidebar:not(.right)");
  const beforeCollapse = await leftSidebar.count();
  await page.locator(".ribbon-btn").first().click();
  await page.waitForTimeout(400);
  const afterCollapse = await leftSidebar.count();
  check("★ 折叠按钮真的折叠了侧栏", beforeCollapse > 0 && afterCollapse === 0,
    `折叠前 ${beforeCollapse} → 折叠后 ${afterCollapse}`);

  // 再点一下应该回来
  await page.locator(".ribbon-btn").first().click();
  await page.waitForTimeout(400);
  check("再点一次能展开回来", (await leftSidebar.count()) > 0);

  // ---- 4. 筛选框真的过滤 ----
  const allRows = await page.evaluate(() =>
    [...document.querySelectorAll(".tree-row .nm")].map((e) => e.textContent));
  check("未筛选时显示多个条目", allRows.length >= 3, `${allRows.length} 项：${allRows.join(", ")}`);

  const filterInput = page.locator('input[placeholder="筛选文件名…"]');
  check("有筛选输入框", (await filterInput.count()) > 0);
  await filterInput.fill("情态");
  await page.waitForTimeout(400);

  const filtered = await page.evaluate(() => ({
    rows: [...document.querySelectorAll(".tree-row .nm")].map((e) => e.textContent),
    empty: document.querySelector(".tree-empty")?.textContent ?? "",
  }));
  check("★ 筛选真的生效", filtered.rows.length < allRows.length && filtered.rows.length > 0,
    `筛出 ${filtered.rows.length} 项：${filtered.rows.join(", ")}`);

  // 筛一个不存在的
  await filterInput.fill("zzz不存在zzz");
  await page.waitForTimeout(400);
  const none = await page.evaluate(() => document.querySelector(".tree-empty")?.textContent ?? "");
  check("筛不到时给明确提示（不是空白）", none.includes("没有匹配"), none.slice(0, 40));
  await filterInput.fill("");
  await page.waitForTimeout(300);

  // ---- 5. 未启用的功能必须真的不可点 ----
  const disabledInfo = await page.evaluate(() => {
    const btns = [...document.querySelectorAll(".ribbon-btn")];
    return btns.map((b) => ({
      disabled: b.disabled === true,
      title: b.getAttribute("title") ?? "",
      hasDisabledClass: b.classList.contains("disabled"),
    }));
  });
  const disabled = disabledInfo.filter((b) => b.disabled);
  check("★ 存在明确禁用（不可点）的功能按钮", disabled.length > 0, `${disabled.length} 个`);
  check("★ 禁用按钮的提示写明「未启用」（不是「待实现」这种含糊说法）",
    disabled.every((b) => b.title.includes("未启用")),
    disabled.map((b) => b.title).slice(0, 3).join(" | "));
  check("禁用按钮都带 .disabled 样式类", disabled.every((b) => b.hasDisabledClass));

  // 可用按钮不该被误禁用
  const enabledCount = disabledInfo.filter((b) => !b.disabled).length;
  check("仍有足够多的可用按钮", enabledCount >= 4, `${enabledCount} 个可用`);

  // ---- 6. Ctrl+E 快捷键 ----
  const before = await leftSidebar.count();
  await page.keyboard.press("Control+e");
  await page.waitForTimeout(350);
  const after = await leftSidebar.count();
  check("Ctrl+E 也能折叠侧栏", before !== after, `${before} → ${after}`);
  if (after === 0) { await page.keyboard.press("Control+e"); await page.waitForTimeout(300); }

  await page.screenshot({ path: path.join(OUT, "ui-topleft.png"), clip: { x: 0, y: 0, width: 520, height: 260 } });
  check("渲染进程无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
process.exit(passed === results.length ? 0 : 1);
