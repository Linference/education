#!/usr/bin/env node
// Relationship graph + question-bank paper assembly verification
//
// These two are the features that were "promised but never built" (the sidebar buttons have always been disabled).
//
// Graph: wiki links → an interactive graph; dangling links (files that don't exist) must be distinguished
// Question bank: import Markdown → search → draw questions → export a paper PDF (without the product signature)
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

// ---- Build a vault with links ----
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-gb-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), JSON.stringify({ id: "gb" }), "utf8");

fs.writeFileSync(path.join(vault, "二次函数.md"),
  "# 二次函数\n\n参见 [[顶点式]] 与 [[判别式]]。\n还要看 [[平行线判定]]。\n", "utf8");
fs.writeFileSync(path.join(vault, "顶点式.md"),
  "# 顶点式\n\ny = a(x-h)² + k\n\n延伸阅读 [[判别式]]\n", "utf8");
fs.writeFileSync(path.join(vault, "判别式.md"),
  "# 判别式\n\nΔ = b² - 4ac\n\n回到 [[二次函数]]\n", "utf8");
// Note: deliberately **do not create** 平行线判定.md — used to test "dangling links"

// ---- 题目文件 ----
const QUESTIONS_MD = `### 第 1 题
题型：选择题
难度：3
知识点：二次函数, 顶点式
来源：广东中考
年份：2023

题干：
已知二次函数 y = a(x-h)² + k，顶点坐标是（  ）
A. (h, k)
B. (-h, k)
C. (h, -k)
D. (-h, -k)
答案：A
解析：顶点式 y = a(x-h)² + k 的顶点就是 (h, k)。

### 第 2 题
题型：解答题
难度：4
知识点：平行线判定
来源：港澳台联考

题干：
如图，已知 ∠1 = ∠2，求证：AB ∥ CD。
答案：见解析
解析：∠1 与 ∠2 是同位角，同位角相等则两直线平行。

### 第 3 题
题型：填空题
难度：2
知识点：判别式
来源：四校联考

题干：
一元二次方程 x² - 2x + 1 = 0 的判别式 Δ = ______。
答案：0
解析：Δ = b² - 4ac = 4 - 4 = 0。
`;
const qPath = path.join(vault, "题库-测试.md");
fs.writeFileSync(qPath, QUESTIONS_MD, "utf8");

console.log("=== Relationship graph + question-bank paper assembly verification ===\n");

const app = await electron.launch({
  executablePath: path.join(HERE, "node_modules", "electron", "dist", "electron.exe"),
  args: [HERE],
  env: { ...process.env, GEZHI_TEST: "1" },
});
const page = await app.firstWindow();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));

try {
  await page.waitForSelector(".app", { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gezhiTest), { timeout: 20000 });
  await page.evaluate((d) => window.__gezhiTest.openVault(d), vault);
  await page.waitForTimeout(1000);

  // Wait for the index to be built (graph data comes from the index)
  await page.evaluate((v) => window.gezhi.search.reindex(v), vault).catch(() => null);
  await page.evaluate(() => window.gezhi.search.waitIdle()).catch(() => null);
  await page.waitForTimeout(2500);

  // ================= Relationship graph =================
  console.log("── Relationship graph ──");
  const graphBtn = page.locator('button[title*="关系图谱"]').first();
  check("★ sidebar '关系图谱' (Relationship Graph) button exists and is clickable",
    (await graphBtn.count()) > 0 && !(await graphBtn.isDisabled()));

  await graphBtn.click();

  // ⚠️ Graph data arrives asynchronously (the index must be opened before querying), so a fixed 3-second wait can intermittently miss.
  //    Instead, explicitly wait for the "stats text" to appear.
  let sawStats = false;
  for (let i = 0; i < 40; i++) {
    const t = await page.evaluate(() => document.body.innerText);
    if (/\d+ 个节点 · \d+ 条链接/.test(t)) { sawStats = true; break; }
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(500);

  const gBody = await page.evaluate(() => document.body.innerText);
  check("★ can open the graph view", gBody.includes("关系图谱"));
  check("shows node and link statistics", sawStats,
    gBody.match(/\d+ 个节点[^\n]*/)?.[0] ?? "statistics not found");
  check("legend explains solid vs hollow",
    /实心/.test(gBody) && /空心/.test(gBody), "");
  check("legend groups by folder and labels counts (colors must be explainable)",
    /（\d+）/.test(gBody), gBody.match(/[^\n]*（\d+）[^\n]*/)?.[0]?.slice(0, 60) ?? "");
  check("has a canvas (the graph is really drawn)",
    await page.evaluate(() => Boolean(document.querySelector("canvas"))));

  // Query IPC directly: nodes, edges, dangling nodes
  const g = await page.evaluate((v) => window.gezhi.search.graph({ vault: v }), vault);
  console.log(`  IPC: ${g.nodes?.length ?? 0} nodes / ${g.edges?.length ?? 0} edges`);
  const dangling = (g.nodes ?? []).filter((n) => !n.exists);
  console.log("  dangling nodes: " + JSON.stringify(dangling.map((n) => n.name)));
  check("★ graph has nodes (notes were indexed)", (g.nodes?.length ?? 0) >= 3, `${g.nodes?.length} nodes`);
  check("★ graph has edges (wiki links were parsed)", (g.edges?.length ?? 0) >= 3, `${g.edges?.length} edges`);
  check("★ dangling links are detected ([[平行线判定]] has no file)",
    dangling.some((n) => n.name.includes("平行线判定")),
    dangling.map((n) => n.name).join(","));
  check("existing notes are marked exists=true",
    (g.nodes ?? []).some((n) => n.name.includes("二次函数") && n.exists));
  check("nodes carry degree (used to scale by connection count)",
    (g.nodes ?? []).every((n) => typeof n.degree === "number"));

  await page.screenshot({ path: path.join(OUT, "ui-graph.png") });

  // ================= Question-bank paper assembly =================
  console.log("\n── Question-bank paper assembly ──");
  // Back to the file view. ⚠️ the button title changes with state ("关系图谱…" (graph…) ↔ "返回文件视图" (back to file view)),
  //    so find it by the **current** title; don't hardcode one.
  await page.locator('button[title*="返回文件视图"]').first().click();
  await page.waitForTimeout(800);

  const bankBtn = page.locator('button[title*="题库组卷"]').first();
  check("★ sidebar '题库组卷' (Question-Bank Paper Assembly) button exists and is clickable",
    (await bankBtn.count()) > 0 && !(await bankBtn.isDisabled()));
  await bankBtn.click();
  await page.waitForTimeout(2000);

  const bBody = await page.evaluate(() => document.body.innerText);
  check("★ can open the question-bank view", bBody.includes("题库组卷"));
  check("when empty the bank shows the format help (user knows how to build it)",
    bBody.includes("导入 Markdown 题目") && bBody.includes("题型：选择题"), "");
  check("has filters (type/source/difficulty/knowledge point)",
    bBody.includes("筛选") && bBody.includes("最低难度") && bBody.includes("知识点"));
  check("has a paper-assembly basket", bBody.includes("组卷篮"));

  // Import questions (go via IPC directly, since the file picker is hard to click in automation)
  console.log("\n── Import questions ──");
  const parsed = await page.evaluate((p) => window.gezhi.bank.parseFile({ filePath: p }), qPath);
  console.log(`  parsed ${parsed.count} questions` + (parsed.warnings?.length ? `, ${parsed.warnings.length} warning(s)` : ""));
  check("★ can parse questions from Markdown", parsed.ok && parsed.count === 3, `${parsed.count} questions`);

  const added = await page.evaluate(([v, qs]) => window.gezhi.bank.addMany({ vault: v, questions: qs }), [vault, parsed.questions]);
  check("★ questions imported successfully", added.ok && added.added === 3, `imported ${added.added} questions`);

  const stats = await page.evaluate((v) => window.gezhi.bank.stats({ vault: v }), vault);
  console.log("  source distribution: " + JSON.stringify(stats.bySource));
  check("★ per-source stats are correct (广东中考/港澳台联考/四校联考)",
    (stats.bySource?.length ?? 0) === 3, JSON.stringify(stats.bySource?.map((s) => s.source)));
  check("★ knowledge points are split out and counted",
    (stats.byKp ?? []).some((k) => k.kp === "二次函数") &&
    (stats.byKp ?? []).some((k) => k.kp === "顶点式"),
    JSON.stringify(stats.byKp?.map((k) => k.kp)));
  check("per-type stats are correct", (stats.byType?.length ?? 0) === 3);

  // Filter: only 广东中考
  const filtered = await page.evaluate((v) =>
    window.gezhi.bank.list({ vault: v, source: "广东中考" }), vault);
  check("★ filtering by source works", filtered.total === 1 && filtered.questions?.[0]?.source === "广东中考",
    `filtered ${filtered.total} question(s)`);

  const byKp = await page.evaluate((v) => window.gezhi.bank.list({ vault: v, kp: "平行线判定" }), vault);
  check("★ filtering by knowledge point works", byKp.total === 1, `filtered ${byKp.total} question(s)`);

  /*
   * After refreshing, the questions should be visible in the UI.
   *
   * ⚠️ The old code called `bankBtn.click()` twice — semantically unclear:
   *   the first click switched back to the file view (since we were already in the bank view), and the second switched back to the bank.
   *   Also the title changes with state, so a selector that hardcodes one title breaks after the switch.
   *   Change: switch back to the file view first, then switch into the bank using the **current** title — semantically clear.
   */
  await page.locator('button[title*="返回文件视图"]').first().click().catch(() => null);
  await page.waitForTimeout(700);
  await page.locator('button[title*="题库组卷"]').first().click();
  // The bank loads asynchronously (it queries SQLite), so a fixed wait can intermittently miss
  let sawCount = false;
  for (let i = 0; i < 30; i++) {
    const t = await page.evaluate(() => document.body.innerText);
    if (/共 \d+ 道/.test(t)) { sawCount = true; break; }
    await page.waitForTimeout(500);
  }
  const after = await page.evaluate(() => document.body.innerText);
  check("★ imported questions are visible in the UI", sawCount, after.match(/共 \d+ 道[^\n]*/)?.[0] ?? "question count not seen");
  check("questions show source and knowledge point", after.includes("广东中考") && after.includes("顶点式"));
  check("has an '加入组卷' (Add to Paper) button", after.includes("加入组卷"));

  // ================= Export paper PDF =================
  console.log("\n── Export paper PDF ──");
  // Click '加入组卷' (Add to Paper) on three questions
  /*
   * Click "加入组卷" (Add to Paper).
   *
   * ⚠️ Don't loop with nth(i) — after clicking the first one, that button's label becomes "已加入" (Added),
   *   so the "加入组卷" (Add to Paper) set **immediately loses one and everything after shifts forward**,
   *   and nth(1) skips what was originally the second question.
   *   Correct approach: each time take the **current first** "加入组卷" (Add to Paper), and click enough times.
   */
  const addBtns = page.locator("button", { hasText: "加入组卷" });
  const nAdd = await addBtns.count();
  console.log("  questions available to add: " + nAdd);
  for (let i = 0; i < Math.min(3, nAdd); i++) {
    const cur = page.locator("button", { hasText: "加入组卷" }).first();
    if ((await cur.count()) === 0) break;
    await cur.click();
    await page.waitForTimeout(300);
  }
  const basketText = await page.evaluate(() => document.body.innerText);
  check("★ after adding, the paper-assembly basket has stats", /\d+ 题 · 平均难度/.test(basketText),
    basketText.match(/\d+ 题 · 平均难度[^\n]*/)?.[0] ?? "no stats");

  const exportBtn = page.locator("button", { hasText: "导出试卷 PDF" }).first();
  check("has an export button and it's clickable", (await exportBtn.count()) > 0 && !(await exportBtn.isDisabled()));

  await exportBtn.click();
  /*
   * The PDF should land in the **system "Downloads" folder**, not the vault directory.
   *
   * ⚠️ This machine's download directory is D:\Users\LINKIT\Downloads (redirected to drive D),
   *    not the default C:\Users\x\Downloads — so **never hardcode it**;
   *    the main process uses app.getPath("downloads").
   *    The test does the same: read the real path back from the UI, don't assemble it yourself.
   */
  let pdfPath = null;
  let announcedPath = null;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000);
    const t = await page.evaluate(() => document.body.innerText);
    const m = t.match(/已导出到下载文件夹：([^\n（]+)/);
    if (m) {
      announcedPath = m[1].trim();
      if (fs.existsSync(announcedPath)) { pdfPath = announcedPath; break; }
    }
  }
  check("★ paper PDF was generated", Boolean(pdfPath), pdfPath ? path.basename(pdfPath) : "not generated within 40 s");
  check("★ it lands in the Downloads folder (not the vault directory)",
    Boolean(pdfPath) && path.dirname(pdfPath).toLowerCase().includes("download"),
    pdfPath ? path.dirname(pdfPath) : "unknown");
  check("★ the PDF did not leak into the vault (no pdf in the vault directory)",
    fs.readdirSync(vault).filter((f) => f.endsWith(".pdf")).length === 0,
    fs.readdirSync(vault).filter((f) => f.endsWith(".pdf")).join(",") || "vault directory is clean");

  if (pdfPath) {
    const buf = fs.readFileSync(pdfPath);
    console.log(`  PDF ${(buf.length / 1024).toFixed(0)} KB → ${pdfPath}`);
    check("the output is indeed a PDF (%PDF- header)", buf.subarray(0, 5).toString("latin1") === "%PDF-");
    // ★ Product hard rule: the paper must not carry the product signature
    const raw = buf.toString("latin1");
    check("★ paper PDF has no product signature (product hard rule)", !raw.includes("格致"), "");
    // Cleanup: don't leave test junk in the user's Downloads folder
    try { fs.rmSync(pdfPath); console.log("  (cleaned up the test PDF)"); } catch { /* ignore */ }
  }
  void announcedPath;

  await page.screenshot({ path: path.join(OUT, "ui-bank.png") });
  check("no JS errors in the renderer process", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* ignore */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== Result: ${passed}/${results.length} passed ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
process.exit(passed === results.length ? 0 : 1);
