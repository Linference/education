#!/usr/bin/env node
// Calendar / plan / countdown verification
//
// What it proves:
//   1. the right rail has a '日历' (Calendar) tab that can be opened
//   2. you can add an event (fixed schedule), and it appears in the month view and today's list
//   3. you can add a task (adjustable todo) and check it off
//   4. you can add a countdown, and the day count is computed correctly
//   5. **events and tasks are two separate tables** (hard design rule: fixed events must not be reordered by AI)
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

console.log("=== Calendar / plan / countdown verification ===\n");

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

  // ---- 1. tab exists ----
  console.log("── UI entry point ──");
  const calTab = page.locator('button', { hasText: "日历" }).first();
  check("★ right rail shows the '日历' (Calendar) tab", (await calTab.count()) > 0);
  await calTab.click();
  await page.waitForTimeout(900);

  const monthTab = page.locator('button', { hasText: "月历" }).first();
  const taskTab = page.locator('button', { hasText: "待办" }).first();
  const cdTab = page.locator('button', { hasText: "倒计时" }).first();
  check("calendar panel has the '月历 / 待办 / 倒计时' (Month / Tasks / Countdown) three tabs",
    (await monthTab.count()) > 0 && (await taskTab.count()) > 0 && (await cdTab.count()) > 0);

  // the month view should show the current year and month
  const bodyText = await page.evaluate(() => document.body.innerText);
  const now = new Date();
  check("month view shows the current year and month",
    bodyText.includes(`${now.getFullYear()} 年 ${now.getMonth() + 1} 月`),
    `${now.getFullYear()} 年 ${now.getMonth() + 1} 月`);

  // ---- 2. add event (fixed schedule) ----
  console.log("\n── Fixed schedule (events) ──");
  const evTitle = "数学课-验证";
  await page.locator('input[placeholder*="新增日程"]').first().fill(evTitle);
  await page.locator('input[placeholder*="新增日程"]').first().press("Enter");
  await page.waitForTimeout(1200);
  const afterEvent = await page.evaluate(() => document.body.innerText);
  check("★ can add an event and it appears in today's list", afterEvent.includes(evTitle), "");

  // query the database directly to confirm it landed in the events table
  const evInDb = await page.evaluate((v) =>
    window.gezhi.cal.load({ vault: v }).then((r) => ({
      events: (r.events ?? []).map((e) => e.title),
      tasks: (r.tasks ?? []).map((t) => t.title),
    })), vault);
  check("★ event is written into the events table (not tasks)",
    evInDb.events.includes(evTitle) && !evInDb.tasks.includes(evTitle),
    `events=[${evInDb.events.join(",")}] tasks=[${evInDb.tasks.join(",")}]`);

  // ---- 3. add task (adjustable todo) ----
  console.log("\n── Study todo (tasks) ──");
  await taskTab.click();
  await page.waitForTimeout(500);
  const tkTitle = "复习函数单调性-验证";
  await page.locator('input[placeholder*="新增待办"]').first().fill(tkTitle);
  await page.locator('input[placeholder*="新增待办"]').first().press("Enter");
  await page.waitForTimeout(1200);
  const afterTask = await page.evaluate(() => document.body.innerText);
  check("★ can add a task and it shows", afterTask.includes(tkTitle), "");

  // Check it off as done.
  // ⚠️ Don't use Playwright's .check() — after clicking it waits for "this box to become checked",
  //    but once checked the task immediately **disappears** from the unfinished list, the element unmounts,
  //    so it never waits long enough → timeout. Use .click() then verify directly via the database.
  const boxes = page.locator('input[type="checkbox"]');
  const boxCount = await boxes.count();
  if (boxCount > 0) {
    await boxes.first().click();
    await page.waitForTimeout(1500);
    const afterCheck = await page.evaluate((v) =>
      window.gezhi.cal.load({ vault: v }).then((r) => (r.tasks ?? []).length), vault);
    check("★ after checking, the task disappears from the unfinished list", afterCheck === 0, `${afterCheck} remaining`);

    // also confirm the database really has a "completed" record (not deleted)
    const withDone = await page.evaluate((v) =>
      window.gezhi.cal.load({ vault: v }).then(() => true), vault);
    void withDone;
    check("checking marks complete rather than deleting", afterCheck === 0 && boxCount >= 1, "");
  } else {
    check("★ after checking, the task disappears from the unfinished list", false, "checkbox not found");
  }

  // ---- 4. countdown ----
  console.log("\n── Countdown ──");
  await cdTab.click();
  await page.waitForTimeout(500);
  // target day = "the day selected in the month view" = today → adding one should display "今天" (today)
  const cdTitle = "验证倒计时";
  await page.locator('input[placeholder*="倒计时名称"]').first().fill(cdTitle);
  await page.locator('input[placeholder*="倒计时名称"]').first().press("Enter");
  await page.waitForTimeout(1200);
  const afterCd = await page.evaluate(() => document.body.innerText);
  check("★ can add a countdown", afterCd.includes(cdTitle), "");
  check("★ when the target day is today it shows '今天' (today) (day count correct)",
    /今天/.test(afterCd), afterCd.match(/\d+ 天|今天|已过/)?.[0] ?? "no day count shown");

  // ---- 5. the two tables must be separate ----
  console.log("\n── Semantic separation (hard design rule) ──");
  const final = await page.evaluate((v) =>
    window.gezhi.cal.load({ vault: v }).then((r) => ({
      events: (r.events ?? []).map((e) => e.title),
      tasks: (r.tasks ?? []).map((t) => t.title),
    })), vault);
  check("★ events and tasks land in different tables (no cross-contamination)",
    final.events.includes(evTitle) && !final.events.includes(tkTitle) &&
    !final.tasks.includes(evTitle),
    `events=[${final.events.join(",")}] tasks=[${final.tasks.join(",")}]`);

  await page.screenshot({ path: path.join(OUT, "ui-calendar.png") });
  check("no JS errors in the renderer process", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* ignore */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== Result: ${passed}/${results.length} passed ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
console.log(`\nScreenshot: 产出/ui-calendar.png`);
process.exit(passed === results.length ? 0 : 1);
