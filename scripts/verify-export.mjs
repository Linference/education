#!/usr/bin/env node
// 导出能力验证（不经界面）
//
// 为什么要独立验证：导出这条链有三段（Markdown → Typst → PDF，
// 以及 Markdown → python-docx → Word），任何一段断了界面都只会显示
// "导出失败"，看不出断在哪。这里逐段断言。
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Windows 上不要手工解析 import.meta.url.pathname —— 会多出前导斜杠、
// 中文路径还会被百分号编码。fileURLToPath 是唯一可靠的做法。
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT = path.join(ROOT, "产出");
fs.mkdirSync(OUT, { recursive: true });

// md2typst 是 CommonJS，用 createRequire 加载（比拼 file:// URL 稳）
const require = createRequire(import.meta.url);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, pass: Boolean(ok), detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? "  " + detail : ""}`);
}

const TYPST = "C:\\Users\\LINKIT\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Typst.Typst_Microsoft.Winget.Source_8wekyb3d8bbwe\\typst-x86_64-pc-windows-msvc\\typst.exe";
const TEMPLATE = path.join(ROOT, "templates", "typst", "handout.typ");
const DOCX_SCRIPT = path.join(ROOT, "templates", "docx", "md2docx.py");
const PY = "C:\\Users\\LINKIT\\AppData\\Local\\Programs\\Python\\Python311\\python.exe";

// 故意用一份"什么语法都有"的 Markdown —— 转换器最容易在这里露馅
const MD = `---
type: 语法讲义
tags: [英语, 语法]
---

# 情态动词

情态动词表示说话人对动作的**态度**：必须、可能、允许、推测。
这里测几个容易出事的字符：#井号、$美元、%百分号、&与号、_下划线_、*单星*。

## 一、三个最容易混的

| 情态动词 | 把握程度 | 典型语境 |
| --- | --- | --- |
| \`must\` | 高 | 有充分证据的肯定推断 |
| \`may\` | 中 | 把握不大 |
| \`can't\` | 高（否定） | 不可能 |

## 二、形式化

$$P(A|B) = \\frac{P(B|A)P(A)}{P(B)}$$

行内公式 $E = mc^2$ 也要能渲染。

## 三、判定规则

\`\`\`python
def infer(ratio: float) -> str:
    """根据证据强度选择情态动词。"""
    if ratio > 0.85:
        return "must"
    return "may"
\`\`\`

## 四、自测

- [ ] 用 must / may / can't 各造一句
- [x] 把同学写的句子拿来判断

1. 第一题
2. 第二题

> 引用块也要能渲染。

相关：[[虚拟语气]] 与 #语法/情态动词
`;

console.log("=== 导出能力验证 ===\n");
console.log(`  Typst：${fs.existsSync(TYPST) ? "已找到" : "缺失"}`);
console.log(`  模板 ：${fs.existsSync(TEMPLATE) ? "已找到" : "缺失"}`);
console.log(`  脚本 ：${fs.existsSync(DOCX_SCRIPT) ? "已找到" : "缺失"}\n`);

// 临时工作目录
const work = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-export-"));
const src = path.join(work, "情态动词.md");
fs.writeFileSync(src, MD, "utf8");

// ---------------------------------------------------------------- 1. 转换器
console.log("── 1. Markdown → Typst 转换 ──");
const { markdownToTypst, buildTypstDocument } = require(path.join(ROOT, "apps/desktop/main/lib/md2typst.cjs"));

const { body, title } = markdownToTypst(MD);
check("提取到文档标题", title === "情态动词", title);
check("标题转成 Typst 的 = 语法", /^= 情态动词$/m.test(body));
check("二级标题转成 ==", /^== 一、三个最容易混的$/m.test(body));
check("粗体 **x** 转成 *x*", body.includes("*态度*"), "（Markdown 双星 → Typst 单星）");
check("表格转成 table()", body.includes("table(") && body.includes("columns: 3"));
check("表格表头转成 table.header", body.includes("table.header("));
check("代码块保留语言标注", /```python/.test(body));
check("代码块内容原样（未被转义）", body.includes('return "must"'));
check("块级公式转成 $ ... $（两侧空格）", /\$ P\(A\|B\)/.test(body) || body.includes("$ P(A|B)"));
// 注意：Typst 里连续字母是一个标识符，所以 mc^2 会转成 m c^2（见 latex2typst.cjs）
check("行内公式转成 $...$（无空格）", body.includes("$E = m c^2$") || body.includes("$E = mc^2$"), body.match(/\$[^$\n]{0,24}\$/)?.[0] ?? "");
check("任务列表转成 ☐/☑", body.includes("☐") && body.includes("☑"));
check("有序列表转成 +", /^\+ 第一题$/m.test(body));
check("引用转成 #quote", body.includes("#quote("));
check("★ 井号被转义（否则 Typst 报错）", body.includes("\\#井号"), "原文：#井号");
check("★ 美元符号被转义", body.includes("\\$美元"), "原文：$美元");
check("删除线/wikilink 不炸", !body.includes("[[虚拟语气]]") || body.includes("虚拟语气"));

// ---------------------------------------------------------------- 2. PDF
console.log("\n── 2. Markdown → PDF（Typst）──");
// 走与主进程完全相同的路径：用 export.cjs 的 exportPdf，
// 而不是在这里自己拼一份 .typ —— 否则测的不是真代码。
const { exportPdf } = require(path.join(ROOT, "apps/desktop/main/lib/export.cjs"));
const pdfPath = path.join(OUT, "导出测试.pdf");
const pdfRes = await exportPdf({
  markdown: MD,
  sourcePath: src,
  outputPath: pdfPath,
  title: "情态动词",
  templatePath: TEMPLATE,
  keepTypst: true,
});
const pdfOk = pdfRes.ok === true;
if (!pdfOk) {
  console.log("        Typst 报错：");
  console.log(String(pdfRes.error).split("\n").slice(0, 14).map((l) => "        " + l).join("\n"));
}

// 检查生成的 .typ（保留版式文件时才有）
if (pdfRes.typPath && fs.existsSync(pdfRes.typPath)) {
  const typSrc = fs.readFileSync(pdfRes.typPath, "utf8");
  // 只检查 #import 与 #show 以外的正文部分 —— import 行里必然出现仓库路径
  const contentOnly = typSrc
    .split("\n")
    .filter((l) => !/^\s*(\/\/|#import|#show)/.test(l))
    .join("\n");
  check("★ .typ 正文里不含产品署名（硬规矩）",
    !/格致|gezhi/i.test(contentOnly),
    /格致|gezhi/i.test(contentOnly) ? "发现了署名！" : "干净");
  check("#import 在 #show 之前（否则 handout 未定义）",
    typSrc.indexOf("#import") < typSrc.indexOf("#show:"));
  check("模板 import 用相对路径（Typst --root 的安全边界）",
    /#import "gezhi-handout\.typ"/.test(typSrc) && !/#import "[A-Za-z]:/.test(typSrc));
}

check("★ Typst 编译成功", pdfOk, pdfOk ? `引擎 ${path.basename(pdfRes.engine ?? "")}` : "");
if (pdfOk && fs.existsSync(pdfPath)) {
  const size = fs.statSync(pdfPath).size;
  check("PDF 体积合理（>10KB 说明有内容）", size > 10240, `${(size / 1024).toFixed(1)} KB`);
  const head = fs.readFileSync(pdfPath).subarray(0, 5).toString("latin1");
  check("是合法 PDF（%PDF- 魔数）", head.startsWith("%PDF-"), head);

  // 嵌入了哪些字体（中文不能是方框）
  const txt = fs.readFileSync(pdfPath).toString("latin1");
  const fonts = [...new Set((txt.match(/\/BaseFont\s*\/([A-Za-z0-9+,-]+)/g) ?? [])
    .map((s) => s.replace(/\/BaseFont\s*\//, "")))];
  check("★ 嵌入了中文字体（不是方框）", fonts.some((f) => /Deng|YaHei|SimSun|MSYH|DengXian/i.test(f)),
    fonts.join(", ").slice(0, 120));
  check("没有嵌入 Thin/ExtraLight（可变字体那个坑）",
    !fonts.some((f) => /Thin|ExtraLight/i.test(f)), fonts.join(", ").slice(0, 120));
  console.log(`        PDF：${path.relative(ROOT, pdfPath)}（${(size / 1024).toFixed(1)} KB）`);
}

// ---------------------------------------------------------------- 3. Word
//
// 走**内置的纯 JS 转换器**（docx npm 库），不再依赖 python-docx。
// 理由：全内置安装包不能要求用户装 Python（本机装完 11 GB）。
console.log("\n── 3. Markdown → Word（内置纯 JS 转换器）──");
const docxPath = path.join(OUT, "导出测试.docx");
const { exportDocxNative } = require(path.join(ROOT, "apps/desktop/main/lib/docx-native.cjs"));
const docxRes = await exportDocxNative({ markdown: MD, outputPath: docxPath, title: "情态动词" });
check("★ 生成 docx 成功", docxRes.ok === true, docxRes.ok ? docxRes.engine : String(docxRes.error));
if (docxRes.ok && fs.existsSync(docxPath)) {
  const size = fs.statSync(docxPath).size;
  check("docx 体积合理", size > 5000, `${(size / 1024).toFixed(1)} KB`);

  // 用纯 Node 解 zip 检查内容 —— 验证导出产物**不该反过来依赖 Python/PowerShell**
  // （Expand-Archive 还只认 .zip 扩展名，.docx 直接拒绝）
  const { readZipText, listZip } = require(path.join(ROOT, "scripts/lib/zip-read.cjs"));
  try {
    const names = [...listZip(docxPath).keys()];
    check("docx 是合法 zip（含 OOXML 必要部件）",
      names.includes("[Content_Types].xml") && names.includes("word/document.xml"),
      `${names.length} 个内部文件`);

    const docXml = readZipText(docxPath, "word/document.xml");
    const stylesXml = names.includes("word/styles.xml") ? readZipText(docxPath, "word/styles.xml") : "";

    check("docx 里有正文内容", docXml.length > 1500, `document.xml ${docXml.length} 字节`);
    check("docx 里有标题", docXml.includes("情态动词"));
    check("docx 里有表格内容（must）", docXml.includes("must"));
    check("docx 里有表格结构", docXml.includes("<w:tbl>"));
    check("★ 设置了中文字体 eastAsia（否则 Word 里中文回退）",
      docXml.includes("eastAsia") || stylesXml.includes("eastAsia"));
    check("docx 里有粗体样式", /<w:b\/>|<w:b /.test(docXml));
    check("docx 里有代码块（等宽字体 Consolas）", docXml.includes("Consolas"));
    check("docx 里没有 frontmatter 残留", !docXml.includes("type: 语法讲义"));
  } catch (e) {
    check("docx 内容检查", false, String(e.message).slice(0, 160));
  }
  console.log(`        Word：${path.relative(ROOT, docxPath)}（${(size / 1024).toFixed(1)} KB）`);
}

// ---------------------------------------------------------------- 4. 无署名检查
console.log("\n── 4. 产出物无产品署名（产品硬规矩）──");
for (const [label, file] of [["PDF", pdfPath], ["Word", docxPath]]) {
  if (!fs.existsSync(file)) { check(`${label} 无署名`, false, "文件不存在"); continue; }
  const raw = fs.readFileSync(file);
  // PDF/docx 都是压缩或二进制，中文字符串在 PDF 里以 UTF-16 或 CID 形式存在，
  // 直接扫 UTF-8 字节最稳：搜 "格致" 的 UTF-8 与 UTF-16LE 两种编码
  const utf8 = raw.includes(Buffer.from("格致", "utf8"));
  const utf16 = raw.includes(Buffer.from("格致", "utf16le"));
  // docx 是 zip，要解压后看
  let inZip = false;
  if (file.endsWith(".docx")) {
    try {
      const { execFileSync: ex } = await import("node:child_process");
      const r = ex(PY, ["-c", `
import zipfile
z=zipfile.ZipFile(r"${file.replace(/\\/g, "\\\\")}")
hit=False
for n in z.namelist():
    if n.endswith(".xml"):
        t=z.read(n).decode("utf-8","ignore")
        if "格致" in t: hit=True
print("HIT" if hit else "CLEAN")
`], { encoding: "utf8" });
      inZip = r.includes("HIT");
    } catch { /* 忽略 */ }
  }
  check(`${label} 无产品署名`, !utf8 && !utf16 && !inZip,
    utf8 || utf16 || inZip ? "★ 发现了「格致」字样！" : "干净");
}

fs.rmSync(work, { recursive: true, force: true });

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
process.exit(passed === results.length ? 0 : 1);
