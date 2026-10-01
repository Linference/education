#!/usr/bin/env node
// 逐块隔离：找出到底哪个 Markdown 构造让 Typst 编译失败
//
// 为什么需要它：整份 Markdown 编译失败时，Typst 只报第一条错误，
// 改完再跑又冒出下一条 —— 来回好几轮。逐块隔离能一次把所有坏块找出来。
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const { exportPdf } = require(path.join(ROOT, "apps/desktop/main/lib/export.cjs"));

const TPL = path.join(ROOT, "templates/typst/handout.typ");

const BS = String.fromCharCode(92);
const BLOCKS = [
  ["标题", "# 情态动词"],
  ["二级标题", "## 三个最容易混的"],
  ["段落", "情态动词表示说话人对动作的态度。"],
  ["粗体", "这里有**粗体**。"],
  ["斜体", "这里有*斜体*。"],
  ["行内代码", "用 `must` 表示。"],
  ["代码块", "```python\nx = 1\n```"],
  ["无序列表", "- 第一项\n- 第二项"],
  ["有序列表", "1. 第一题\n2. 第二题"],
  ["任务列表", "- [ ] 未完成\n- [x] 已完成"],
  ["引用", "> 引用块也要能渲染。"],
  ["水平线", "---"],
  ["表格", "| a | b |\n| --- | --- |\n| 1 | 2 |"],
  ["行内公式", "行内 $E = mc^2$ 公式。"],
  ["块级公式", "$$" + BS + "frac{a}{b}$$"],
  ["wikilink", "见 [[虚拟语气]]。"],
  ["标签", "相关 #语法/情态动词。"],
  ["井号转义", "这里测 #井号 转义。"],
  ["美元转义", "这里测 $美元 转义。"],
  ["中文引号", "他说「你好」和“再见”。"],
  ["竖线与波浪", "a | b ~ c"],
  ["尖括号", "a < b > c"],
  ["at符号", "邮箱 me@example.com"],
  ["下划线与星号", "变量 a_b_c 与 5*3"],
];

let pass = 0;
const fails = [];

console.log("=== 逐块隔离 Typst 编译 ===\n");

for (const [name, md] of BLOCKS) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "q-"));
  const src = path.join(work, "t.md");
  fs.writeFileSync(src, md, "utf8");
  let r;
  try {
    r = await exportPdf({
      markdown: md,
      sourcePath: src,
      outputPath: path.join(work, "t.pdf"),
      templatePath: TPL,
      keepTypst: true,
    });
  } catch (e) {
    r = { ok: false, error: e.message };
  }
  if (r.ok) {
    pass++;
    console.log(`  ✔ ${name}`);
  } else {
    fails.push({ name, md, error: r.error, typPath: r.typPath });
    console.log(`  ✖ ${name}`);
  }
  if (!r.ok && r.typPath && fs.existsSync(r.typPath)) {
    const keepDir = path.join(ROOT, "产出", "_fail");
    fs.mkdirSync(keepDir, { recursive: true });
    fs.copyFileSync(r.typPath, path.join(keepDir, name + ".typ"));
  }
  fs.rmSync(work, { recursive: true, force: true });
}

console.log(`\n=== ${pass}/${BLOCKS.length} 块可编译 ===\n`);
for (const f of fails) {
  console.log(`── ${f.name} ──`);
  console.log(`   Markdown: ${JSON.stringify(f.md)}`);
  console.log(`   错误:`);
  for (const l of String(f.error).split("\n").slice(0, 12)) console.log("     " + l);
  console.log();
}
if (fails.length) console.log("失败的 .typ 已保留在 产出/_fail/");
process.exit(fails.length === 0 ? 0 : 1);
