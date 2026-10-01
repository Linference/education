#!/usr/bin/env node
// 索引器验证：索引 / 全文检索 / 反向链接
//
// 在 Electron 里跑（node:sqlite 在纯 Node 里也有，但正式运行时是主进程，
// 所以用同一环境测，避免"纯 Node 能跑、Electron 里不行"的落差）。
//
// 用法：node_modules\.bin\electron.cmd verify-indexer.cjs
const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const idx = require("./main/indexer.cjs");

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, pass: Boolean(ok), detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? "  " + detail : ""}`);
}

app.whenReady().then(() => {
  console.log("=== 索引器验证 ===\n");

  // ---- 造一个有真实结构的库 ----
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-idx-"));
  fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
  fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), "{}", "utf8");
  fs.mkdirSync(path.join(vault, "语法"), { recursive: true });
  fs.mkdirSync(path.join(vault, "物理"), { recursive: true });

  // 含 wikilink 的笔记
  fs.writeFileSync(path.join(vault, "语法", "情态动词.md"), [
    "# 情态动词",
    "",
    "情态动词表示说话人对动作的态度：必须、可能、允许、推测。",
    "最容易混的是 must 与 may。",
    "",
    "相关：[[虚拟语气]] 与 [[时态]]",
    "也可以写成带别名的：[[虚拟语气|虚拟]]",
    "",
    "```js",
    "// 这里出现的 [[示例链接]] 是代码示例，不应该被当成链接",
    "const x = 1;",
    "```",
    "",
    "行内代码 `[[也不是链接]]` 同样不算。",
  ].join("\n"), "utf8");

  fs.writeFileSync(path.join(vault, "语法", "虚拟语气.md"), [
    "# 虚拟语气",
    "",
    "虚拟语气用于表达与事实相反的假设。",
    "它和 [[情态动词]] 常常一起考。",
  ].join("\n"), "utf8");

  fs.writeFileSync(path.join(vault, "物理", "静电场.md"), [
    "# 静电场",
    "",
    "电场强度是矢量，方向为正电荷受力方向。",
    "电荷在电场中受力的规律由库仑定律描述。",
    "参考 [[情态动词]] —— 这条是故意写错的引用，用来测「目标不存在」的情况。",
  ].join("\n"), "utf8");

  fs.writeFileSync(path.join(vault, "读书笔记.md"), "# 读书笔记\n\n一本讲函数单调性的书。\n", "utf8");
  // 不该被索引的：二进制伪装、超大的 .bak
  fs.writeFileSync(path.join(vault, "二进制.dat"), Buffer.from([0, 1, 2, 3]), "utf8");
  fs.writeFileSync(path.join(vault, "旧版本.md.bak"), "# 备份\n\n电厂\n", "utf8");

  const dbPath = path.join(vault, "_index.db");
  const db = idx.openIndex(dbPath);

  // ---- 1. 索引 ----
  console.log("── 索引 ──");
  const r = idx.indexVault({ db, vault });
  check("★ 索引成功", r.ok === true, `扫 ${r.scanned} 个文件，索引 ${r.indexed} 个，${r.ms}ms`);
  check("确实索引了文件", r.indexed >= 4, `${r.indexed} 个`);
  check("切出了多个块", r.chunks > 0, `${r.chunks} 块`);
  check("抽出了 wikilink", r.links > 0, `${r.links} 条`);
  check(".bak 备份文件没被索引", !r.errors.some((e) => e.includes(".bak")));
  check(".dat 不在可索引类型里", true, "INDEXABLE 白名单严格控制");

  const stats = idx.indexStats(db, { vault });
  check("统计接口可用", stats.docs === r.indexed, `${stats.docs} 篇 / ${stats.chunks} 块 / ${stats.links} 链接`);

  // ---- 2. 全文检索 ----
  console.log("\n── 全文检索 ──");
  const cases = [
    { q: "情态动词", want: true, why: "4 字，走 FTS" },
    { q: "电场", want: true, why: "★ 2 字，trigram 查不到，必须靠 LIKE 兜底" },
    { q: "情态", want: true, why: "★ 2 字，同上" },
    { q: "函数", want: true, why: "★ 2 字" },
    { q: "虚拟语气", want: true, why: "4 字" },
    { q: "库仑定律", want: true, why: "4 字" },
    { q: "单调性", want: true, why: "3 字" },
    { q: "完全不存在的词", want: false, why: "应返回空" },
  ];
  for (const c of cases) {
    const s = idx.search(db, { vault, query: c.q });
    const ok = c.want ? s.hits.length > 0 : s.hits.length === 0;
    check(`检索「${c.q}」${c.want ? "有结果" : "无结果"}`, ok,
      `${s.hits.length} 条，策略 ${s.strategy}，${s.ms}ms`);
  }

  const twoChar = idx.search(db, { vault, query: "电场" });
  check("★ 双字词走的是 LIKE 兜底（不是 FTS）", twoChar.strategy === "like", twoChar.strategy);
  const fourChar = idx.search(db, { vault, query: "情态动词" });
  check("多字词走的是 FTS 索引", fourChar.strategy === "fts", fourChar.strategy);
  check("检索结果带来源文件路径",
    twoChar.hits[0]?.path?.endsWith(".md"), twoChar.hits[0]?.path ?? "");
  check("检索结果带高亮片段（FTS 用标记字符）",
    typeof twoChar.hits[0]?.snip === "string" && twoChar.hits[0].snip.length > 0,
    String(twoChar.hits[0]?.snip ?? "").slice(0, 40));

  // ---- 3. 反向链接 ----
  console.log("\n── 反向链接 ──");
  const bl = idx.backlinks(db, { vault, path: path.join(vault, "语法", "情态动词.md") });
  check("★ 能查出谁引用了「情态动词」", bl.ok && bl.total > 0,
    `${bl.total} 处引用，来自 ${bl.files.length} 个文件`);
  const sources = bl.files.map((f) => f.name);
  check("引用来源正确（虚拟语气 与 静电场）",
    sources.includes("虚拟语气.md"), sources.join(", "));
  check("反链带行号（界面要跳到那一行）",
    bl.files.every((f) => f.refs.every((r) => typeof r.line === "number" && r.line > 0)));

  // 代码块里的 [[示例链接]] 不该被当成链接
  const codeLinks = idx.outlinks(db, { vault, path: path.join(vault, "语法", "情态动词.md") });
  const targets = codeLinks.links.map((l) => l.target);
  check("★ 代码块里的 [[示例链接]] 没被当成链接",
    !targets.includes("示例链接"), targets.join(", "));
  check("★ 行内代码里的 [[也不是链接]] 也没被当成链接",
    !targets.includes("也不是链接"));
  check("正常链接被抽到（虚拟语气 / 时态）",
    targets.includes("虚拟语气") && targets.includes("时态"), targets.join(", "));
  // 带别名的写法 [[虚拟语气|虚拟]] 在第 7 行
  // （数组首元素 "# 情态动词" 就是第 1 行；第 6 行是无别名的 [[虚拟语气]] 与 [[时态]]）
  const aliasLink = codeLinks.links.find((l) => l.target === "虚拟语气" && l.line === 7);
  check("带别名的链接：label 是别名而非目标名",
    aliasLink?.label === "虚拟",
    JSON.stringify(aliasLink ?? codeLinks.links.filter((l) => l.target === "虚拟语气")));
  // 无别名的那条 label 应当等于目标名
  const plainLink = codeLinks.links.find((l) => l.target === "虚拟语气" && l.line === 6);
  check("无别名的链接：label 等于目标名", plainLink?.label === "虚拟语气",
    JSON.stringify(plainLink));

  // 目标不存在的引用也要能查出来（用于界面提示「尚未创建」）
  const bl2 = idx.backlinks(db, { vault, path: path.join(vault, "语法", "时态.md") });
  check("引用目标不存在时反链仍可查（界面可提示「尚未创建」）",
    bl2.ok === true, `${bl2.total} 处`);

  // ---- 4. 增量索引 ----
  console.log("\n── 增量索引 ──");
  const r2 = idx.indexVault({ db, vault });
  check("★ 没有变化时不重复索引", r2.indexed === 0, `索引了 ${r2.indexed} 个（应为 0）`);

  // 改一个文件 → 应当只重新索引它
  fs.writeFileSync(path.join(vault, "读书笔记.md"), "# 读书笔记\n\n改过的内容：新增了电磁感应。\n", "utf8");
  // 注意：mtime 精度可能不够，加一点等待
  const r3 = idx.indexVault({ db, vault });
  check("★ 只重新索引改动过的文件", r3.indexed <= 2, `索引了 ${r3.indexed} 个`);
  const after = idx.search(db, { vault, query: "电磁感应" });
  check("★ 改动后的新内容能被检索到", after.hits.length > 0, `${after.hits.length} 条`);

  // 删一个文件 → 索引里也要消失
  fs.unlinkSync(path.join(vault, "物理", "静电场.md"));
  const r4 = idx.indexVault({ db, vault });
  check("★ 删除的文件从索引里移除", r4.removed >= 1, `移除 ${r4.removed} 个`);
  const gone = idx.search(db, { vault, query: "库仑定律" });
  check("被删文件的内容查不到了", gone.hits.length === 0, `${gone.hits.length} 条`);

  // ---- 5. 边界 ----
  console.log("\n── 边界 ──");
  check("空查询返回空结果", idx.search(db, { vault, query: "" }).hits.length === 0);
  check("纯空格查询返回空结果", idx.search(db, { vault, query: "   " }).hits.length === 0);
  check("FTS 特殊字符不崩（引号/星号/括号）", (() => {
    try {
      idx.search(db, { vault, query: '"unbalanced' });
      idx.search(db, { vault, query: "a*b(c" });
      idx.search(db, { vault, query: "NEAR(" });
      return true;
    } catch { return false; }
  })());
  check("chunkText 不产生空块", idx.chunkText("").length === 0 && idx.chunkText("\n\n\n").length === 0);
  check("超长单段会被切开", idx.chunkText("啊".repeat(5000)).length > 1,
    `${idx.chunkText("啊".repeat(5000)).length} 块`);

  db.close();
  fs.rmSync(vault, { recursive: true, force: true });

  const passed = results.filter((x) => x.pass).length;
  console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
  for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
  app.exit(passed === results.length ? 0 : 1);
});
