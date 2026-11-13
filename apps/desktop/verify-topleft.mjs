#!/usr/bin/env node
// Top-left interaction verification: collapse button, filter box, and the disabled state of unenabled features
//
// Why test these "small" interactions:
//   1. If the collapse button does nothing when clicked, users will think the app froze
//   2. If the filter box is just decoration (doesn't filter), it's worse than having nothing
//   3. **Unenabled features must really be unclickable** — before, they behaved like real buttons,
//      and clicking them did nothing, which is basically deceiving the user. This is the issue
//      this round explicitly set out to fix.
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

// Create a vault with several files so filtering can be tested
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

  // ---- 1. logo display ----
  const logo = await page.evaluate(() => {
    const img = document.querySelector(".titlebar img");
    return img ? { w: img.width, h: img.height, src: img.getAttribute("src")?.slice(0, 40) } : null;
  });
  check("★ the title bar shows the logo", logo !== null, logo ? `${logo.w}×${logo.h}px` : "no img");
  check("logo size ≥24px (below 20px the GZ logo gets blurry)", (logo?.w ?? 0) >= 24);

  // ---- 2. Breadcrumb ----
  const crumb = await page.locator(".titlebar").innerText();
  check("the title bar shows the vault name", crumb.includes(path.basename(vault)), crumb.replace(/\n/g, " ").slice(0, 60));

  // ---- 3. Collapse button: one click should hide the left rail ----
  // ⚠️ The selector must use .sidebar:not(.right) — the left and right rails share the .sidebar class.
  //    Using just .sidebar would count 2, and after collapsing only 1 remains, making it look like
  //    it "didn't collapse cleanly".
  const leftSidebar = page.locator(".sidebar:not(.right)");
  const beforeCollapse = await leftSidebar.count();
  await page.locator(".ribbon-btn").first().click();
  await page.waitForTimeout(400);
  const afterCollapse = await leftSidebar.count();
  check("★ the collapse button really collapses the side rail", beforeCollapse > 0 && afterCollapse === 0,
    `before ${beforeCollapse} → after ${afterCollapse}`);

  // Clicking again should bring it back
  await page.locator(".ribbon-btn").first().click();
  await page.waitForTimeout(400);
  check("clicking again expands it back", (await leftSidebar.count()) > 0);

  // ---- 4. The filter box really filters ----
  const allRows = await page.evaluate(() =>
    [...document.querySelectorAll(".tree-row .nm")].map((e) => e.textContent));
  check("shows multiple entries when unfiltered", allRows.length >= 3, `${allRows.length} items: ${allRows.join(", ")}`);

  const filterInput = page.locator('input[placeholder="筛选文件名…"]');
  check("there is a filter input box", (await filterInput.count()) > 0);
  await filterInput.fill("情态");
  await page.waitForTimeout(400);

  const filtered = await page.evaluate(() => ({
    rows: [...document.querySelectorAll(".tree-row .nm")].map((e) => e.textContent),
    empty: document.querySelector(".tree-empty")?.textContent ?? "",
  }));
  check("★ the filter really works", filtered.rows.length < allRows.length && filtered.rows.length > 0,
    `filtered ${filtered.rows.length} items: ${filtered.rows.join(", ")}`);

  // Filter for something that doesn't exist
  await filterInput.fill("zzz不存在zzz");
  await page.waitForTimeout(400);
  const none = await page.evaluate(() => document.querySelector(".tree-empty")?.textContent ?? "");
  check("gives a clear hint when nothing matches (not just blank)", none.includes("没有匹配"), none.slice(0, 40));
  await filterInput.fill("");
  await page.waitForTimeout(300);

  // ---- 5. Unenabled features must really be unclickable ----
  const disabledInfo = await page.evaluate(() => {
    const btns = [...document.querySelectorAll(".ribbon-btn")];
    return btns.map((b) => ({
      disabled: b.disabled === true,
      title: b.getAttribute("title") ?? "",
      hasDisabledClass: b.classList.contains("disabled"),
    }));
  });
  const disabled = disabledInfo.filter((b) => b.disabled);
  check("★ there are clearly disabled (unclickable) feature buttons", disabled.length > 0, `${disabled.length} of them`);
  check("★ the disabled buttons' tooltips say 「未启用」 (Not enabled) (not the vague 「待实现」 (To be implemented))",
    disabled.every((b) => b.title.includes("未启用")),
    disabled.map((b) => b.title).slice(0, 3).join(" | "));
  check("disabled buttons all carry the .disabled style class", disabled.every((b) => b.hasDisabledClass));

  // Enabled buttons should not be mistakenly disabled
  const enabledCount = disabledInfo.filter((b) => !b.disabled).length;
  check("there are still enough enabled buttons", enabledCount >= 4, `${enabledCount} enabled`);

  // ---- 6. Ctrl+E shortcut ----
  const before = await leftSidebar.count();
  await page.keyboard.press("Control+e");
  await page.waitForTimeout(350);
  const after = await leftSidebar.count();
  check("Ctrl+E can also collapse the side rail", before !== after, `${before} → ${after}`);
  if (after === 0) { await page.keyboard.press("Control+e"); await page.waitForTimeout(300); }

  await page.screenshot({ path: path.join(OUT, "ui-topleft.png"), clip: { x: 0, y: 0, width: 520, height: 260 } });
  check("renderer process has no JS errors", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* ignore */ }
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== Result: ${passed}/${results.length} passed ===`);
for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
process.exit(passed === results.length ? 0 : 1);
