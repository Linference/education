#!/usr/bin/env node
// Isolate block by block: find exactly which Markdown construct fails Typst.
//
// Why it exists: when a whole Markdown document fails, Typst only reports the
// first error; fix it, rerun, and the next error appears — several round trips.
// Block-by-block isolation finds every bad block in a single pass.
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
  ["Title", "# 情态动词"],
  ["Second-level heading", "## 三个最容易混的"],
  ["Paragraph", "情态动词表示说话人对动作的态度。"],
  ["Bold", "这里有**粗体**。"],
  ["Italic", "这里有*斜体*。"],
  ["Inline code", "用 `must` 表示。"],
  ["Code block", "```python\nx = 1\n```"],
  ["Unordered list", "- 第一项\n- 第二项"],
  ["Ordered list", "1. 第一题\n2. 第二题"],
  ["Task list", "- [ ] 未完成\n- [x] 已完成"],
  ["Blockquote", "> 引用块也要能渲染。"],
  ["Horizontal rule", "---"],
  ["Table", "| a | b |\n| --- | --- |\n| 1 | 2 |"],
  ["Inline formula", "行内 $E = mc^2$ 公式。"],
  ["Display formula", "$$" + BS + "frac{a}{b}$$"],
  ["wikilink", "见 [[虚拟语气]]。"],
  ["Tag", "相关 #语法/情态动词。"],
  ["Hash escape", "这里测 #井号 转义。"],
  ["Dollar escape", "这里测 $美元 转义。"],
  ["Chinese quotes", "他说「你好」和“再见”。"],
  ["Pipe and tilde", "a | b ~ c"],
  ["Angle brackets", "a < b > c"],
  ["At sign", "邮箱 me@example.com"],
  ["Underscore and asterisk", "变量 a_b_c 与 5*3"],
];

let pass = 0;
const fails = [];

console.log("=== Isolate Typst compilation block by block ===\n");

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

console.log(`\n=== ${pass}/${BLOCKS.length} blocks compile ===\n`);
for (const f of fails) {
  console.log(`── ${f.name} ──`);
  console.log(`   Markdown: ${JSON.stringify(f.md)}`);
  console.log(`   error:`);
  for (const l of String(f.error).split("\n").slice(0, 12)) console.log("     " + l);
  console.log();
}
if (fails.length) console.log("Failed .typ files are kept in 产出/_fail/");
process.exit(fails.length === 0 ? 0 : 1);
