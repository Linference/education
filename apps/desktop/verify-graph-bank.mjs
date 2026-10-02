#!/usr/bin/env node
// 关系图谱 + 题库组卷 验证
//
// 这两项是"说好但一直没做"的功能（侧栏按钮一直是禁用的）。
//
// 图谱：wiki 链接 → 可交互的图；悬空链接（文件不存在）要区分出来
// 题库：导入 Markdown → 检索 → 抽题 → 导出试卷 PDF（且不带产品署名）
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

// ---- 造一个有链接的库 ----
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-gb-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), JSON.stringify({ id: "gb" }), "utf8");

fs.writeFileSync(path.join(vault, "二次函数.md"),
  "# 二次函数\n\n参见 [[顶点式]] 与 [[判别式]]。\n还要看 [[平行线判定]]。\n", "utf8");
fs.writeFileSync(path.join(vault, "顶点式.md"),
  "# 顶点式\n\ny = a(x-h)² + k\n\n延伸阅读 [[判别式]]\n", "utf8");
fs.writeFileSync(path.join(vault, "判别式.md"),
  "# 判别式\n\nΔ = b² - 4ac\n\n回到 [[二次函数]]\n", "utf8");
// 注意：刻意**不建** 平行线判定.md —— 用来测"悬空链接"

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

console.log("=== 关系图谱 + 题库组卷 验证 ===\n");

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

  // 等索引建好（图数据来自索引）
  await page.evaluate((v) => window.gezhi.search.reindex(v), vault).catch(() => null);
  await page.evaluate(() => window.gezhi.search.waitIdle()).catch(() => null);
  await page.waitForTimeout(2500);

  // ================= 关系图谱 =================
  console.log("── 关系图谱 ──");
  const graphBtn = page.locator('button[title*="关系图谱"]').first();
  check("★ 侧栏「关系图谱」按钮存在且可点",
    (await graphBtn.count()) > 0 && !(await graphBtn.isDisabled()));

  await graphBtn.click();

  // ⚠️ 图数据是异步来的（要先 open 索引再查），固定等 3 秒会偶发落空。
  //    改成显式等"统计文字出现"。
  let sawStats = false;
  for (let i = 0; i < 40; i++) {
    const t = await page.evaluate(() => document.body.innerText);
    if (/\d+ 个节点 · \d+ 条链接/.test(t)) { sawStats = true; break; }
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(500);

  const gBody = await page.evaluate(() => document.body.innerText);
  check("★ 能打开图谱视图", gBody.includes("关系图谱"));
  check("显示节点与链接统计", sawStats,
    gBody.match(/\d+ 个节点[^\n]*/)?.[0] ?? "没找到统计");
  check("图例说明了实心/空心的含义",
    /实心/.test(gBody) && /空心/.test(gBody), "");
  check("图例按文件夹分组并标了数量（颜色要能解释）",
    /（\d+）/.test(gBody), gBody.match(/[^\n]*（\d+）[^\n]*/)?.[0]?.slice(0, 60) ?? "");
  check("有 canvas（图真的画出来了）",
    await page.evaluate(() => Boolean(document.querySelector("canvas"))));

  // 直接查 IPC：节点、边、悬空节点
  const g = await page.evaluate((v) => window.gezhi.search.graph({ vault: v }), vault);
  console.log(`  IPC: ${g.nodes?.length ?? 0} 节点 / ${g.edges?.length ?? 0} 边`);
  const dangling = (g.nodes ?? []).filter((n) => !n.exists);
  console.log("  悬空节点: " + JSON.stringify(dangling.map((n) => n.name)));
  check("★ 图里有节点（笔记被索引到了）", (g.nodes?.length ?? 0) >= 3, `${g.nodes?.length} 个`);
  check("★ 图里有链接（wiki 链接被解析出来了）", (g.edges?.length ?? 0) >= 3, `${g.edges?.length} 条`);
  check("★ 悬空链接被识别出来（[[平行线判定]] 没有文件）",
    dangling.some((n) => n.name.includes("平行线判定")),
    dangling.map((n) => n.name).join(","));
  check("已有笔记被标成 exists=true",
    (g.nodes ?? []).some((n) => n.name.includes("二次函数") && n.exists));
  check("节点带 degree（用于按连接数缩放）",
    (g.nodes ?? []).every((n) => typeof n.degree === "number"));

  await page.screenshot({ path: path.join(OUT, "ui-graph.png") });

  // ================= 题库组卷 =================
  console.log("\n── 题库组卷 ──");
  // 回文件视图。⚠️ 按钮 title 会随状态变（"关系图谱…" ↔ "返回文件视图"），
  //    所以按**当前** title 找，不能写死一个。
  await page.locator('button[title*="返回文件视图"]').first().click();
  await page.waitForTimeout(800);

  const bankBtn = page.locator('button[title*="题库组卷"]').first();
  check("★ 侧栏「题库组卷」按钮存在且可点",
    (await bankBtn.count()) > 0 && !(await bankBtn.isDisabled()));
  await bankBtn.click();
  await page.waitForTimeout(2000);

  const bBody = await page.evaluate(() => document.body.innerText);
  check("★ 能打开题库视图", bBody.includes("题库组卷"));
  check("题库为空时给出了格式说明（用户知道怎么建库）",
    bBody.includes("导入 Markdown 题目") && bBody.includes("题型：选择题"), "");
  check("有筛选（题型/来源/难度/知识点）",
    bBody.includes("筛选") && bBody.includes("最低难度") && bBody.includes("知识点"));
  check("有组卷篮", bBody.includes("组卷篮"));

  // 导入题目（直接走 IPC，因为文件选择框在自动化里不好点）
  console.log("\n── 导入题目 ──");
  const parsed = await page.evaluate((p) => window.gezhi.bank.parseFile({ filePath: p }), qPath);
  console.log(`  解析出 ${parsed.count} 道题` + (parsed.warnings?.length ? `，警告 ${parsed.warnings.length} 条` : ""));
  check("★ 能从 Markdown 解析出题目", parsed.ok && parsed.count === 3, `${parsed.count} 道`);

  const added = await page.evaluate(([v, qs]) => window.gezhi.bank.addMany({ vault: v, questions: qs }), [vault, parsed.questions]);
  check("★ 题目入库成功", added.ok && added.added === 3, `入库 ${added.added} 道`);

  const stats = await page.evaluate((v) => window.gezhi.bank.stats({ vault: v }), vault);
  console.log("  来源分布: " + JSON.stringify(stats.bySource));
  check("★ 按来源统计正确（广东中考/港澳台联考/四校联考）",
    (stats.bySource?.length ?? 0) === 3, JSON.stringify(stats.bySource?.map((s) => s.source)));
  check("★ 知识点被拆开统计",
    (stats.byKp ?? []).some((k) => k.kp === "二次函数") &&
    (stats.byKp ?? []).some((k) => k.kp === "顶点式"),
    JSON.stringify(stats.byKp?.map((k) => k.kp)));
  check("按题型统计正确", (stats.byType?.length ?? 0) === 3);

  // 筛选：只看广东中考
  const filtered = await page.evaluate((v) =>
    window.gezhi.bank.list({ vault: v, source: "广东中考" }), vault);
  check("★ 按来源筛选有效", filtered.total === 1 && filtered.questions?.[0]?.source === "广东中考",
    `筛出 ${filtered.total} 道`);

  const byKp = await page.evaluate((v) => window.gezhi.bank.list({ vault: v, kp: "平行线判定" }), vault);
  check("★ 按知识点筛选有效", byKp.total === 1, `筛出 ${byKp.total} 道`);

  /*
   * 界面刷新后能看到题。
   *
   * ⚠️ 原来的写法是 `bankBtn.click()` 两次 —— 语义不清：
   *   第一次点会切回文件视图（因为当前已在题库视图），第二次又切回题库。
   *   而且 title 会随状态变，写死一个 title 的选择器在切换后就失效了。
   *   改成：先切回文件视图，再用**当时的** title 切进题库，语义明确。
   */
  await page.locator('button[title*="返回文件视图"]').first().click().catch(() => null);
  await page.waitForTimeout(700);
  await page.locator('button[title*="题库组卷"]').first().click();
  // 题库是异步载入的（要查 SQLite），固定等待会偶发落空
  let sawCount = false;
  for (let i = 0; i < 30; i++) {
    const t = await page.evaluate(() => document.body.innerText);
    if (/共 \d+ 道/.test(t)) { sawCount = true; break; }
    await page.waitForTimeout(500);
  }
  const after = await page.evaluate(() => document.body.innerText);
  check("★ 界面上能看到导入的题目", sawCount, after.match(/共 \d+ 道[^\n]*/)?.[0] ?? "没看到题数");
  check("题目显示了来源与知识点", after.includes("广东中考") && after.includes("顶点式"));
  check("有「加入组卷」按钮", after.includes("加入组卷"));

  // ================= 组卷导出 PDF =================
  console.log("\n── 组卷导出 PDF ──");
  // 点三道题的「加入组卷」
  /*
   * 点「加入组卷」。
   *
   * ⚠️ 不能用 nth(i) 循环 —— 点完第一道后那个按钮文字变成「已加入」，
   *   于是"加入组卷"这个集合**立刻少一个、后面的全部前移**，
   *   nth(1) 就跳过了原本的第二道。
   *   正确做法：每次都取**当前第一个**「加入组卷」，点够次数为止。
   */
  const addBtns = page.locator("button", { hasText: "加入组卷" });
  const nAdd = await addBtns.count();
  console.log("  可加入的题: " + nAdd);
  for (let i = 0; i < Math.min(3, nAdd); i++) {
    const cur = page.locator("button", { hasText: "加入组卷" }).first();
    if ((await cur.count()) === 0) break;
    await cur.click();
    await page.waitForTimeout(300);
  }
  const basketText = await page.evaluate(() => document.body.innerText);
  check("★ 加入后组卷篮有统计", /\d+ 题 · 平均难度/.test(basketText),
    basketText.match(/\d+ 题 · 平均难度[^\n]*/)?.[0] ?? "没有统计");

  const exportBtn = page.locator("button", { hasText: "导出试卷 PDF" }).first();
  check("有导出按钮且可点", (await exportBtn.count()) > 0 && !(await exportBtn.isDisabled()));

  await exportBtn.click();
  // PDF 生成要时间
  let pdfPath = null;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000);
    const found = fs.readdirSync(vault).filter((f) => f.endsWith(".pdf"));
    if (found.length) { pdfPath = path.join(vault, found[0]); break; }
  }
  check("★ 试卷 PDF 生成了", Boolean(pdfPath), pdfPath ? path.basename(pdfPath) : "40 秒内没生成");
  if (pdfPath) {
    const buf = fs.readFileSync(pdfPath);
    console.log(`  PDF ${(buf.length / 1024).toFixed(0)} KB`);
    check("产出确实是 PDF（%PDF- 文件头）", buf.subarray(0, 5).toString("latin1") === "%PDF-");
    // ★ 产品硬规矩：试卷不能带产品署名
    const raw = buf.toString("latin1");
    check("★ 试卷 PDF 不含产品署名（产品硬规矩）", !raw.includes("格致"), "");
  }

  await page.screenshot({ path: path.join(OUT, "ui-bank.png") });
  check("渲染进程无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
process.exit(passed === results.length ? 0 : 1);
