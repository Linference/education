#!/usr/bin/env node
// Markdown → PDF（命令行入口，给 AI 助手与脚本用）
//
// 为什么需要这个：
//   AI 助手在库里干活时能读能写文件，但**拿不到格致的导出能力** ——
//   它试过 pandoc / wkhtmltopdf / soffice，全都不在 PATH 里，
//   于是只能退而输出 HTML，让用户自己去浏览器"打印为 PDF"。
//
//   而格致本来就有很好的 PDF 生成链路：
//     Markdown → (md2typst) → Typst 源码 → (内置 typst.exe) → PDF
//   公式、表格、中文字体都处理过，比 HTML 打印质量高。
//
//   这个脚本把那套链路暴露成一条命令，AI 就能直接调用。
//
// 用法：
//   node scripts/md2pdf.mjs <输入.md> [输出.pdf]
//
// 也支持：
//   node scripts/md2pdf.mjs --help
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const { exportPdf } = require(path.join(ROOT, "apps", "desktop", "main", "lib", "export.cjs"));

function usage() {
  console.log(`Markdown → PDF（用格致内置的 Typst 排版）

用法：
  node scripts/md2pdf.mjs <输入.md> [输出.pdf]

说明：
  · 不写输出路径时，PDF 与输入文件同目录、同名
  · 排版用格致内置的 Typst，公式/表格/中文都已适配
  · 产物不含任何产品署名（产品硬规矩）
`);
}

const args = process.argv.slice(2);
if (!args.length || args[0] === "--help" || args[0] === "-h") {
  usage();
  process.exit(args.length ? 0 : 2);
}

const [input, output] = args;
const inputPath = path.resolve(input);
if (!fs.existsSync(inputPath)) {
  console.error(`找不到输入文件：${inputPath}`);
  process.exit(1);
}

const markdown = fs.readFileSync(inputPath, "utf8");
const outputPath = output
  ? path.resolve(output)
  : inputPath.replace(/\.(md|markdown|txt)$/i, "") + ".pdf";

// 标题取首个一级标题；没有就用文件名
const titleMatch = /^#\s+(.+)$/m.exec(markdown);
const title = titleMatch ? titleMatch[1].trim() : path.basename(inputPath).replace(/\.[^.]+$/, "");

// 模板：必须是**导出 `handout` 函数**的那个文件。
//
// ⚠️ 传错模板会报 `unresolved import`，而且错误信息指向生成出来的中间文件，
//    不容易一眼看出是"模板选错了"。
//    exportPdf 会把传入的模板复制成 `gezhi-handout.typ`，然后
//    `#import "gezhi-handout.typ": handout` —— 所以模板里必须有 `handout`。
//      · handout.typ  → 有（#let handout(...)）✔ 用它
//      · gezhi.typ    → 没有，只有字体栈（gezhi-fonts / gezhi-sans / gezhi-mono）
//    handout.typ 自己会 import gezhi.typ，exportPdf 也把它一起复制过去。
const templateCandidates = [
  path.join(ROOT, "templates", "typst", "handout.typ"),
];
const templatePath = templateCandidates.find((p) => fs.existsSync(p));

// 内置 Typst（开发态在 vendor 下）
const bundledTypst = [
  path.join(ROOT, "vendor", "typst", "typst.exe"),
  path.join(ROOT, "vendor", "typst", "typst"),
].find((p) => fs.existsSync(p));

(async () => {
  console.log(`输入：${inputPath}`);
  console.log(`输出：${outputPath}`);
  console.log(`标题：${title}`);
  console.log(`排版引擎：${bundledTypst ? "内置 Typst" : "系统 Typst"}${templatePath ? " + 模板 " + path.basename(templatePath) : ""}`);
  console.log(`\n正在生成…`);

  const t0 = Date.now();
  let r;
  try {
    r = await exportPdf({
      markdown,
      sourcePath: inputPath,
      outputPath,
      title,
      templatePath,
      bundledTypst,
    });
  } catch (e) {
    console.error(`\n生成失败：${e.message}`);
    process.exit(1);
  }
  const ms = Date.now() - t0;

  if (!r || r.ok === false) {
    console.error(`\n生成失败：${r?.error ?? "未知原因"}`);
    if (r?.log) console.error(r.log.slice(-500));
    process.exit(1);
  }

  // 判定成功看产物，不看返回值（导出链路里有多处可能静默失败）
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    console.error(`\n生成失败：没有产出 PDF`);
    if (r.log) console.error(String(r.log).slice(-500));
    process.exit(1);
  }

  const size = fs.statSync(outputPath).size;
  console.log(`\n已生成：${outputPath}`);
  console.log(`  体积 ${(size / 1024).toFixed(0)} KB，耗时 ${(ms / 1000).toFixed(1)}s`);
})();
