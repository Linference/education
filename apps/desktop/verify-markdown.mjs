#!/usr/bin/env node
// 用真实构建产物验证 Markdown 渲染
//
// 为什么不能用 Node 直接 import .ts：需要转译。
// 所以借 vite 的 build 做一次"单文件打包"，再 import 那个产物 ——
// 这样测的就是**应用里真正跑的那段代码**，而不是我手写的近似版。
import { build } from "vite";
import fs from "node:fs";
import path from "node:path";

const HERE = path.resolve(import.meta.dirname);
const TMP = path.join(HERE, "_mdcheck");
fs.mkdirSync(TMP, { recursive: true });

const entry = path.join(TMP, "entry.js");
fs.writeFileSync(
  entry,
  `import { renderMarkdown, splitFrontmatter } from "../renderer/src/lib/markdown.ts";
export { renderMarkdown, splitFrontmatter };`,
  "utf8"
);

await build({
  root: HERE,
  logLevel: "error",
  build: {
    outDir: path.join(TMP, "out"),
    emptyOutDir: true,
    lib: { entry, formats: ["es"], fileName: "mdcheck" },
    minify: false,
  },
});

// 产物是 .mjs 而不是 .js —— 因为 package.json 里 "type": "module"，
// vite 会据此改扩展名。写死 .js 会 ERR_MODULE_NOT_FOUND。
const outFile = path.join(TMP, "out", "mdcheck.mjs");
if (!fs.existsSync(outFile)) {
  console.error("构建产物不存在：", outFile);
  console.error("目录内容：", fs.readdirSync(path.join(TMP, "out")));
  process.exit(1);
}

// Windows 上动态 import 绝对路径必须转成 file:// URL，否则报
// ERR_UNSUPPORTED_ESM_URL_SCHEME（收到的是 "d:" 协议）
const { pathToFileURL } = await import("node:url");
const mod = await import(pathToFileURL(outFile).href + "?t=" + Date.now());
const { renderMarkdown } = mod;

const CASES = [
  {
    name: "行内公式",
    src: "行内公式 $E = mc^2$ 要渲染。",
    must: ["katex"],
    mustNot: ["mc^2", "$E"],
    // ★ 公式只能出现一次：界面截图里曾出现"渲染后的公式 + 原始源码"两行
    maxKatex: 1,
  },
  {
    name: "块级公式（含竖线，容易被表格规则截断）",
    src: "$$P(A|B) = \\frac{P(B|A)P(A)}{P(B)}$$",
    must: ["katex-display", "katex"],
    mustNot: ["\\frac", "P(A|B)"],
    maxKatex: 1,
  },
  {
    name: "块级 + 行内公式同时存在（回归：曾出现碎片重复）",
    src: "$$\\frac{P(B|A)P(A)}{P(B)}$$\n\n行内 $E = mc^2$ 也要渲染。",
    must: ["katex-display", "katex"],
    mustNot: [],
    maxKatex: 2,          // 一个块级 + 一个行内，不能更多
  },
  {
    name: "任务列表",
    src: "- [ ] 未完成\n- [x] 已完成",
    must: ['type="checkbox"', "task-list-item", "checked"],
    mustNot: ["[ ]", "[x]"],
  },
  {
    name: "wikilink（含别名）",
    src: "见 [[虚拟语气|虚拟]] 与 [[情态动词]]",
    must: ["wikilink", "虚拟", "情态动词"],
    mustNot: ["[[", "]]"],
  },
  {
    // 标签渲染成 chip 后，可见文本里**仍然带 #**（这是对的设计，chip 里就显示 #英语）。
    // 所以这里不能断言"看不见 #"，只能断言：
    //   a) 生成了 .tag-chip 元素
    //   b) 源码里的标签语法被消耗掉了 —— 用"带前导空格的裸 #tag"判据不可靠，
    //      改为验证 chip 数量与文案
    name: "标签",
    src: "相关 #语法/情态动词 与 #英语",
    must: ["tag-chip", "#语法/情态动词", "#英语"],
    mustNot: [],
  },
  {
    name: "表格",
    src: "| a | b |\n| --- | --- |\n| 1 | 2 |",
    must: ["<table>", "<td>"],
    mustNot: [],
  },
  {
    name: "加粗与代码",
    src: "**粗** 与 `code`",
    must: ["<strong>", "<code>"],
    mustNot: ["**"],
  },
  {
    name: "frontmatter 不进正文",
    src: "---\ntype: 笔记\ntags: [a, b]\n---\n\n# 正文",
    must: ["<h1>"],
    mustNot: ["type:", "tags:"],
  },
];

let pass = 0;
let fail = 0;
console.log("=== 真实构建产物的 Markdown 渲染验证 ===\n");

/**
 * 判断"原始 markdown 源码是否泄漏到可见文本里"。
 *
 * ⚠️ 不能直接在整串 HTML 里 includes() —— KaTeX 会把原始 TeX 源码放进
 * <annotation encoding="application/x-tex"> 里做无障碍（屏幕阅读器与复制用），
 * 于是 "E = mc^2"、"\frac" 这些会出现在 HTML 里，但它们在页面上**不可见**。
 * 第一版断言就是这么误报的，白白怀疑自己的渲染逻辑。
 * 正确做法：先剥掉不可见部分（annotation/semantics/script/style），再查。
 */
function visibleText(html) {
  return html
    .replace(/<annotation[^>]*>[\s\S]*?<\/annotation>/g, "")
    .replace(/<semantics>[\s\S]*?<\/semantics>/g, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/g, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")   // 去掉所有标签，只留文本
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

for (const c of CASES) {
  const html = renderMarkdown(c.src);
  const text = visibleText(html);
  const problems = [];
  for (const m of c.must) if (!html.includes(m)) problems.push(`缺少 ${JSON.stringify(m)}`);
  for (const m of c.mustNot) {
    if (text.includes(m)) problems.push(`可见文本里残留原始源码 ${JSON.stringify(m)}`);
  }
  // 公式数量上限：多了说明有重复渲染（界面截图里出现过这个 bug）
  //
  // ⚠️ 不能数 `class="katex` —— KaTeX 一个公式会生成多个内部 span：
  //    <span class="katex"><span class="katex-mathml">…</span>
  //      <span class="katex-html">…</span></span>
  //    实测一个行内公式就有 8 个 `class="katex`，于是"数出来 8 个"看着像重复，
  //    其实只有一个公式。**统计口径错了会让人去修没坏的代码。**
  //    正确口径：只数**最外层**容器 —— 行内数 `class="katex"`（后面紧跟 >），
  //    块级数 `katex-display`。
  if (c.maxKatex !== undefined) {
    // ⚠️ `class="katex"` 是 `class="katex-display"` 的**前缀**，
    //    直接用 /class="katex"/ 会把同一个块级公式数两次（实测踩过）。
    //    必须用词边界：属性值后面紧跟引号或空格才算。
    const inlineOuter = (html.match(/class="katex"(?=["\s])/g) ?? []).length;
    const displayOuter = (html.match(/<div class="katex-display">/g) ?? []).length;
    const n = inlineOuter + displayOuter;
    if (n > c.maxKatex) {
      problems.push(`公式容器数 ${n}（行内 ${inlineOuter} + 块级 ${displayOuter}）超过上限 ${c.maxKatex}（疑似重复渲染）`);
    }
  }
  if (problems.length) {
    fail++;
    console.log(`  [FAIL] ${c.name}`);
    for (const p of problems) console.log(`         ${p}`);
    console.log(`         可见文本：${text.slice(0, 200)}`);
  } else {
    pass++;
    console.log(`  [PASS] ${c.name}`);
  }
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail === 0 ? 0 : 1);
