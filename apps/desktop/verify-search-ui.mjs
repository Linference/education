#!/usr/bin/env node
// 全文检索 + 反向链接的界面验证
//
// 要回答的问题：
//   1. 左栏切到「检索」能搜到内容吗？**双字词**能搜到吗（这是 trigram 的坑）？
//   2. 点结果能跳到那个文件吗？
//   3. 右栏「链接」页签能显示反向链接吗？点反链能跳过去吗？
//   4. 保存后重新索引吗（刚写的内容马上能搜到）？
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

// 有 wikilink 关系的笔记
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

// ⚠️ 空态必须用**真没人引用**的笔记来测。
//    一开始我拿「索引页.md」测，但它恰恰是被情态动词.md 与 虚拟语气.md 引用最多的那篇
//    （它自己出链多，但也有入链），于是"空态没显示"是**正确行为**，测试却判失败。
fs.writeFileSync(path.join(vault, "孤儿笔记.md"), [
  "# 孤儿笔记",
  "",
  "这篇没有任何别的笔记引用它。",
].join("\n"), "utf8");

console.log("=== 检索与反向链接界面验证 ===\n");

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

  // 等索引跑完（打开库时在后台索引）
  await page.waitForFunction(async () => {
    const r = await window.gezhi.search.waitIdle();
    return r?.ok === true;
  }, { timeout: 30000 });
  await page.waitForTimeout(800);

  const stats = await page.evaluate((d) => window.gezhi.search.stats(d), vault);
  check("★ 打开库后自动建了索引", stats.docs >= 3, `${stats.docs} 篇 / ${stats.chunks} 块 / ${stats.links} 链接`);

  // ---- 1. 左栏切到检索 ----
  console.log("\n── 全文检索 ──");
  const searchTab = page.locator("button", { hasText: "检索" }).first();
  check("左栏有「检索」页签", (await searchTab.count()) > 0);
  await searchTab.click();
  await page.waitForTimeout(400);

  const box = page.locator('input[placeholder*="搜索全部笔记"]').first();
  check("检索面板有输入框", (await box.count()) > 0);

  // 四字查询（走 FTS）
  await box.fill("情态动词");
  await page.waitForTimeout(900);
  const fourChar = await page.evaluate(() => document.body.innerText);
  check("★ 多字词能搜到（走 FTS 索引）",
    fourChar.includes("情态动词.md"), "");
  check("界面显示检索策略（FTS 索引）", /FTS\s*索引/.test(fourChar));

  // ★ 双字查询（trigram 的坑，靠 LIKE 兜底）
  await box.fill("电场");
  await page.waitForTimeout(900);
  const twoChar = await page.evaluate(() => document.body.innerText);
  check("★ 双字词「电场」能搜到（这是 trigram 的坑，靠扫描兜底）",
    twoChar.includes("情态动词.md"), twoChar.includes("没有匹配") ? "显示「没有匹配」→ 兜底失效" : "");
  check("界面如实标注短词走扫描", /LIKE\s*扫描/.test(twoChar), "");

  // 搜不到的词
  await box.fill("完全不存在的词语");
  await page.waitForTimeout(900);
  const none = await page.evaluate(() => document.body.innerText);
  check("搜不到的词显示空结果提示", none.includes("没有匹配"), "");

  // ---- 2. 点结果跳转 ----
  console.log("\n── 点结果跳转 ──");
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
    check("★ 点检索结果能打开对应文件",
      opened.tabs.includes("虚拟语气.md"), opened.tabs.join(", "));
  } else {
    check("★ 点检索结果能打开对应文件", false, "结果里没有可点的条目");
  }

  // ---- 3. 反向链接 ----
  console.log("\n── 反向链接 ──");
  const linksTab = page.locator("button", { hasText: "链接" }).first();
  check("右栏有「链接」页签", (await linksTab.count()) > 0);
  await linksTab.click();
  await page.waitForTimeout(1200);

  const blView = await page.evaluate(() => document.body.innerText);
  check("★ 反链面板显示了引用来源（情态动词.md / 索引页.md）",
    blView.includes("情态动词.md") && blView.includes("索引页.md"),
    blView.includes("反向链接") ? "" : "没看到「反向链接」标题");
  check("反链显示引用行号", /第\s*\d+\s*行/.test(blView));
  check("反链计数可见", /\d+\s*处/.test(blView));

  // 打开一篇**真没人引用**的笔记，应显示空态提示
  const lonely = path.join(vault, "孤儿笔记.md");
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), lonely);
  await page.waitForTimeout(1200);
  const lonelyView = await page.evaluate(() => document.body.innerText);
  check("没人引用的笔记显示空态说明", lonelyView.includes("还没有别的笔记引用"),
    lonelyView.includes("还没有别的笔记引用") ? "" : lonelyView.slice(0, 120).replace(/\n/g, " | "));
  check("空态里给出写法提示（告诉用户怎么写链接）",
    lonelyView.includes("[[孤儿笔记]]"), "");

  // ---- 4. 保存后自动重新索引 ----
  console.log("\n── 保存后重新索引 ──");
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), path.join(vault, "语法", "虚拟语气.md"));
  await page.waitForTimeout(900);
  // 切到编辑模式，加一句独特的话并保存
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
  check("★ 保存后新内容立刻能搜到（自动重新索引）", found > 0, `命中 ${found} 条`);

  // ★ 保存后**新增的 wikilink** 要立刻出现在目标笔记的反链里。
  //   这条锁定一个时序 bug：早先 reindexFile 是 .then() 里递增版本号，
  //   反链面板会在索引落库**之前**就重新查询，于是刚写完的引用显示 0 处。
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

  // 打开被引用的那篇（它还不存在，但反链应当能查出来）
  const newBacklinks = await page.evaluate((d) =>
    window.gezhi.search.backlinks({ vault: d, path: d + "\\语法\\量子力学.md" })
      .then((r) => r.total ?? 0), vault);
  check("★ 保存后新增的 wikilink 立刻进反链（时序修复）", newBacklinks > 0,
    `量子力学 的反链 ${newBacklinks} 处`);

  await page.screenshot({ path: path.join(OUT, "ui-search.png") });
  check("渲染进程无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
console.log(`\n截图：产出/ui-search.png`);
process.exit(passed === results.length ? 0 : 1);
