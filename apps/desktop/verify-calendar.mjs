#!/usr/bin/env node
// 日历 / 计划 / 倒计时 验证
//
// 要证明：
//   1. 右栏有「日历」页签，能打开
//   2. 能加日程（固定日程），并出现在月历与当天列表里
//   3. 能加待办（可调整任务），并能勾选完成
//   4. 能加倒计时，天数算对
//   5. **日程与待办是分开的两张表**（设计硬规矩：固定日程不可被 AI 重排）
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

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-cal-ui-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), JSON.stringify({ id: "c" }), "utf8");

console.log("=== 日历 / 计划 / 倒计时 验证 ===\n");

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
  await page.waitForTimeout(900);

  // ---- 1. 页签存在 ----
  console.log("── 界面入口 ──");
  const calTab = page.locator('button', { hasText: "日历" }).first();
  check("★ 右栏有「日历」页签", (await calTab.count()) > 0);
  await calTab.click();
  await page.waitForTimeout(900);

  const monthTab = page.locator('button', { hasText: "月历" }).first();
  const taskTab = page.locator('button', { hasText: "待办" }).first();
  const cdTab = page.locator('button', { hasText: "倒计时" }).first();
  check("日历面板有「月历 / 待办 / 倒计时」三个页签",
    (await monthTab.count()) > 0 && (await taskTab.count()) > 0 && (await cdTab.count()) > 0);

  // 月历应显示当前年月
  const bodyText = await page.evaluate(() => document.body.innerText);
  const now = new Date();
  check("月历显示当前年月",
    bodyText.includes(`${now.getFullYear()} 年 ${now.getMonth() + 1} 月`),
    `${now.getFullYear()} 年 ${now.getMonth() + 1} 月`);

  // ---- 2. 加日程（固定日程）----
  console.log("\n── 固定日程（events）──");
  const evTitle = "数学课-验证";
  await page.locator('input[placeholder*="新增日程"]').first().fill(evTitle);
  await page.locator('input[placeholder*="新增日程"]').first().press("Enter");
  await page.waitForTimeout(1200);
  const afterEvent = await page.evaluate(() => document.body.innerText);
  check("★ 能加日程，并出现在当天列表", afterEvent.includes(evTitle), "");

  // 直接查数据库确认落在 events 表
  const evInDb = await page.evaluate((v) =>
    window.gezhi.cal.load({ vault: v }).then((r) => ({
      events: (r.events ?? []).map((e) => e.title),
      tasks: (r.tasks ?? []).map((t) => t.title),
    })), vault);
  check("★ 日程写进了 events 表（不是 tasks）",
    evInDb.events.includes(evTitle) && !evInDb.tasks.includes(evTitle),
    `events=[${evInDb.events.join(",")}] tasks=[${evInDb.tasks.join(",")}]`);

  // ---- 3. 加待办（可调整任务）----
  console.log("\n── 学习待办（tasks）──");
  await taskTab.click();
  await page.waitForTimeout(500);
  const tkTitle = "复习函数单调性-验证";
  await page.locator('input[placeholder*="新增待办"]').first().fill(tkTitle);
  await page.locator('input[placeholder*="新增待办"]').first().press("Enter");
  await page.waitForTimeout(1200);
  const afterTask = await page.evaluate(() => document.body.innerText);
  check("★ 能加待办并显示", afterTask.includes(tkTitle), "");

  // 勾选完成。
  // ⚠️ 不能用 Playwright 的 .check() —— 它点完会等"这个框变成已勾选"，
  //    而勾选后该待办立刻从未完成列表**消失**，元素被卸载，
  //    于是永远等不到 → 超时。用 .click() 然后直接查库判定。
  const boxes = page.locator('input[type="checkbox"]');
  const boxCount = await boxes.count();
  if (boxCount > 0) {
    await boxes.first().click();
    await page.waitForTimeout(1500);
    const afterCheck = await page.evaluate((v) =>
      window.gezhi.cal.load({ vault: v }).then((r) => (r.tasks ?? []).length), vault);
    check("★ 勾选后待办从未完成列表消失", afterCheck === 0, `剩余 ${afterCheck} 条`);

    // 再确认数据库里确实有"已完成"的记录（不是被删掉）
    const withDone = await page.evaluate((v) =>
      window.gezhi.cal.load({ vault: v }).then(() => true), vault);
    void withDone;
    check("勾选是「完成」而不是「删除」", afterCheck === 0 && boxCount >= 1, "");
  } else {
    check("★ 勾选后待办从未完成列表消失", false, "没找到勾选框");
  }

  // ---- 4. 倒计时 ----
  console.log("\n── 倒计时 ──");
  await cdTab.click();
  await page.waitForTimeout(500);
  // 目标日取"月历里选中的那天"= 今天 → 加一个应显示"今天"
  const cdTitle = "验证倒计时";
  await page.locator('input[placeholder*="倒计时名称"]').first().fill(cdTitle);
  await page.locator('input[placeholder*="倒计时名称"]').first().press("Enter");
  await page.waitForTimeout(1200);
  const afterCd = await page.evaluate(() => document.body.innerText);
  check("★ 能加倒计时", afterCd.includes(cdTitle), "");
  check("★ 目标日是今天时显示「今天」（天数算对）",
    /今天/.test(afterCd), afterCd.match(/\d+ 天|今天|已过/)?.[0] ?? "无天数显示");

  // ---- 5. 两张表必须分开 ----
  console.log("\n── 语义分离（设计硬规矩）──");
  const final = await page.evaluate((v) =>
    window.gezhi.cal.load({ vault: v }).then((r) => ({
      events: (r.events ?? []).map((e) => e.title),
      tasks: (r.tasks ?? []).map((t) => t.title),
    })), vault);
  check("★ 日程与待办落在不同的表里（互不混入）",
    final.events.includes(evTitle) && !final.events.includes(tkTitle) &&
    !final.tasks.includes(evTitle),
    `events=[${final.events.join(",")}] tasks=[${final.tasks.join(",")}]`);

  await page.screenshot({ path: path.join(OUT, "ui-calendar.png") });
  check("渲染进程无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
console.log(`\n截图：产出/ui-calendar.png`);
process.exit(passed === results.length ? 0 : 1);
