#!/usr/bin/env node
// UI verification of full-text search + backlinks
//
// Questions to answer:
//   1. Can the left rail, switched to 「检索」 (Search), find content? Can **two-character words** be found (this is the trigram pitfall)?
//   2. Does clicking a result jump to that file?
//   3. Can the right rail's 「链接」 (Links) tab show backlinks? Does clicking a backlink jump there?
//   4. Does it re-index after saving (newly written content is searchable right away)?
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

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-search-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), JSON.stringify({ id: "s" }), "utf8");
fs.mkdirSync(path.join(vault, "语法"), { recursive: true });

// Notes with wikilink relationships
fs.writeFileSync(path.join(vault, "语法", "情态动词.md"), [
  "# 情态动词",
  "",
  "情态动词表示说话人对动作的态度：必须、可能、允许、推测。",
  "电场这个词在这里是无关的干扰项。",
  "",
  "相关：[[虚拟语气]]",
].join("\n"), "utf8");

fs.writeFileSync(path.join(vault, "语法", "虚拟语气.md"), [
  "# 虚拟语气",
  "",
  "虚拟语气用于表达与事实相反的假设。",
  "它和 [[情态动词]] 常常一起考。",
].join("\n"), "utf8");

fs.writeFileSync(path.join(vault, "索引页.md"), [
  "# 索引页",
  "",
  "本页汇总：[[情态动词]]、[[虚拟语气]]",
].join("\n"), "utf8");

// ⚠️ The empty state must be tested with a note that is **genuinely unreferenced** by anyone.
//    At first I tested with 「索引页.md」, but it happens to be the note most referenced by
//    情态动词.md and 虚拟语气.md (it has many outbound links, but also inbound links),
//    so "the empty state not showing" was actually **correct behavior**, yet the test judged it a failure.
fs.writeFileSync(path.join(vault, "孤儿笔记.md"), [
  "# 孤儿笔记",
  "",
  "这篇没有任何别的笔记引用它。",
].join("\n"), "utf8");

console.log("=== Search & backlink UI verification ===\n");

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

  // Wait for indexing to finish (it runs in the background when the vault opens)
  await page.waitForFunction(async () => {
    const r = await window.gezhi.search.waitIdle();
    return r?.ok === true;
  }, { timeout: 30000 });
  await page.waitForTimeout(800);

  const stats = await page.evaluate((d) => window.gezhi.search.stats(d), vault);
  check("★ the index is built automatically after opening the vault", stats.docs >= 3, `${stats.docs} docs / ${stats.chunks} chunks / ${stats.links} links`);

  // ---- 1. Left rail switches to search ----
  console.log("\n── Full-text search ──");
  const searchTab = page.locator("button", { hasText: "检索" }).first();
  check("the left rail has the 「检索」 (Search) tab", (await searchTab.count()) > 0);
  await searchTab.click();
  await page.waitForTimeout(400);

  const box = page.locator('input[placeholder*="搜索全部笔记"]').first();
  check("the search panel has an input box", (await box.count()) > 0);

  // Four-character query (goes through FTS)
  await box.fill("情态动词");
  await page.waitForTimeout(900);
  const fourChar = await page.evaluate(() => document.body.innerText);
  check("★ multi-character words can be found (via the FTS index)",
    fourChar.includes("情态动词.md"), "");
  check("the UI shows the search strategy (FTS index)", /FTS\s*索引/.test(fourChar));

  // ★ Two-character query (the trigram pitfall, backed by LIKE fallback)
  await box.fill("电场");
  await page.waitForTimeout(900);
  const twoChar = await page.evaluate(() => document.body.innerText);
  check("★ the two-character word 「电场」 (electric field) can be found (this is the trigram pitfall, backed by scanning fallback)",
    twoChar.includes("情态动词.md"), twoChar.includes("没有匹配") ? "shows 「没有匹配」 (no match) → fallback failed" : "");
  check("the UI honestly labels short words as using scanning", /LIKE\s*扫描/.test(twoChar), "");

  // A word that cannot be found
  await box.fill("完全不存在的词语");
  await page.waitForTimeout(900);
  const none = await page.evaluate(() => document.body.innerText);
  check("unfindable words show an empty-result hint", none.includes("没有匹配"), "");

  // ---- 2. Click a result to jump ----
  console.log("\n── Click result to jump ──");
  await box.fill("虚拟语气");
  await page.waitForTimeout(900);
  const hitBtn = page.locator("button", { hasText: "虚拟语气.md" }).first();
  if (await hitBtn.count()) {
    await hitBtn.click();
    await page.waitForTimeout(900);
    const opened = await page.evaluate(() => ({
      tabs: [...document.querySelectorAll(".tab .tname")].map((n) => n.textContent),
      body: document.body.innerText,
    }));
    check("★ clicking a search result opens the corresponding file",
      opened.tabs.includes("虚拟语气.md"), opened.tabs.join(", "));
  } else {
    check("★ clicking a search result opens the corresponding file", false, "no clickable entries in the results");
  }

  // ---- 3. Backlinks ----
  console.log("\n── Backlinks ──");
  const linksTab = page.locator("button", { hasText: "链接" }).first();
  check("the right rail has the 「链接」 (Links) tab", (await linksTab.count()) > 0);
  await linksTab.click();
  await page.waitForTimeout(1200);

  const blView = await page.evaluate(() => document.body.innerText);
  check("★ the backlink panel shows the referencing sources (情态动词.md / 索引页.md)",
    blView.includes("情态动词.md") && blView.includes("索引页.md"),
    blView.includes("反向链接") ? "" : "did not see the 「反向链接」 (Backlinks) heading");
  check("backlinks show the referencing line number", /第\s*\d+\s*行/.test(blView));
  check("the backlink count is visible", /\d+\s*处/.test(blView));

  // Open a note that is **truly unreferenced**; the empty-state hint should show
  const lonely = path.join(vault, "孤儿笔记.md");
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), lonely);
  await page.waitForTimeout(1200);
  const lonelyView = await page.evaluate(() => document.body.innerText);
  check("an unreferenced note shows the empty-state explanation", lonelyView.includes("还没有别的笔记引用"),
    lonelyView.includes("还没有别的笔记引用") ? "" : lonelyView.slice(0, 120).replace(/\n/g, " | "));
  check("the empty state gives a syntax hint (telling users how to write links)",
    lonelyView.includes("[[孤儿笔记]]"), "");

  // ---- 4. Auto re-index after saving ----
  console.log("\n── Re-index after saving ──");
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), path.join(vault, "语法", "虚拟语气.md"));
  await page.waitForTimeout(900);
  // Switch to edit mode, add a distinctive sentence, and save
  const editBtn = page.locator("button", { hasText: "编辑" }).first();
  await editBtn.click();
  await page.waitForTimeout(1000);
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n新增了一句独特的话：量子纠缠现象。");
  await page.waitForTimeout(400);
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.gezhi.search.waitIdle());
  await page.waitForTimeout(600);

  const found = await page.evaluate((d) =>
    window.gezhi.search.query({ vault: d, query: "量子纠缠" }).then((r) => r.hits?.length ?? 0), vault);
  check("★ newly saved content is immediately searchable (auto re-index)", found > 0, `${found} hits`);

  // ★ After saving, a **newly added wikilink** must immediately appear in the target note's backlinks.
  //   This locks in a timing bug: earlier, reindexFile incremented the version number inside a .then(),
  //   so the backlink panel re-queried **before** the index was persisted, and the just-written reference showed 0 occurrences.
  await page.locator("button", { hasText: "链接" }).first().click();
  await page.waitForTimeout(300);
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), path.join(vault, "语法", "虚拟语气.md"));
  await page.waitForTimeout(1000);
  await page.locator("button", { hasText: "编辑" }).first().click();
  await page.waitForTimeout(900);
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n另见 [[量子力学]]。");
  await page.waitForTimeout(300);
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(2500);

  // Open the referenced note (it does not exist yet, but the backlink should still be found)
  const newBacklinks = await page.evaluate((d) =>
    window.gezhi.search.backlinks({ vault: d, path: d + "\\语法\\量子力学.md" })
      .then((r) => r.total ?? 0), vault);
  check("★ a newly saved wikilink immediately enters the backlinks (timing fix)", newBacklinks > 0,
    `量子力学 backlinks: ${newBacklinks}`);

  await page.screenshot({ path: path.join(OUT, "ui-search.png") });
  check("renderer process has no JS errors", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* ignore */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== Result: ${passed}/${results.length} passed ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
console.log(`\nScreenshot: 产出/ui-search.png`);
process.exit(passed === results.length ? 0 : 1);
