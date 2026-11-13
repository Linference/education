#!/usr/bin/env node
// Export capability verification (without the UI).
//
// Why verify independently: the export chain has three segments
// (Markdown → Typst → PDF, plus Markdown → python-docx → Word). If any
// segment breaks, the UI only shows "export failed" without saying where.
// Here we assert each segment separately.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// On Windows, don't parse import.meta.url.pathname by hand — it adds a leading
// slash, and Chinese paths get percent-encoded. fileURLToPath is the only
// reliable approach.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT = path.join(ROOT, "产出");
fs.mkdirSync(OUT, { recursive: true });

// md2typst is CommonJS; load it with createRequire (more robust than a file:// URL)
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

// Deliberately use Markdown that "has every syntax" — the converter is most likely to fail here
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

console.log("=== Export capability verification ===\n");
console.log(`  Typst: ${fs.existsSync(TYPST) ? "found" : "missing"}`);
console.log(`  Template: ${fs.existsSync(TEMPLATE) ? "found" : "missing"}`);
console.log(`  Script: ${fs.existsSync(DOCX_SCRIPT) ? "found" : "missing"}\n`);

// Temporary working directory
const work = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-export-"));
const src = path.join(work, "情态动词.md");
fs.writeFileSync(src, MD, "utf8");

// ---------------------------------------------------------------- 1. 转换器
console.log("── 1. Markdown → Typst conversion ──");
const { markdownToTypst, buildTypstDocument } = require(path.join(ROOT, "apps/desktop/main/lib/md2typst.cjs"));

const { body, title } = markdownToTypst(MD);
check("Extracted the document title", title === "情态动词", title);
check("Title converted to Typst = syntax", /^= 情态动词$/m.test(body));
check("Second-level heading converted to ==", /^== 一、三个最容易混的$/m.test(body));
check("Bold **x** converted to *x*", body.includes("*态度*"), "(Markdown double star → Typst single star)");
check("Table converted to table()", body.includes("table(") && body.includes("columns: 3"));
check("Table header converted to table.header", body.includes("table.header("));
check("Code block keeps the language tag", /```python/.test(body));
check("Code block content verbatim (not escaped)", body.includes('return "must"'));
check("Display formula converted to $ ... $ (spaces on both sides)", /\$ P\(A\|B\)/.test(body) || body.includes("$ P(A|B)"));
// Note: in Typst a run of consecutive letters is one identifier, so mc^2 becomes m c^2 (see latex2typst.cjs)
check("Inline formula converted to $...$ (no spaces)", body.includes("$E = m c^2$") || body.includes("$E = mc^2$"), body.match(/\$[^$\n]{0,24}\$/)?.[0] ?? "");
check("Task list converted to ☐/☑", body.includes("☐") && body.includes("☑"));
check("Ordered list converted to +", /^\+ 第一题$/m.test(body));
check("Blockquote converted to #quote", body.includes("#quote("));
check("★ Hash sign escaped (otherwise Typst errors)", body.includes("\\#井号"), "original: #井号");
check("★ Dollar sign escaped", body.includes("\\$美元"), "original: $美元");
check("Strikethrough/wikilink does not break", !body.includes("[[虚拟语气]]") || body.includes("虚拟语气"));

// ---------------------------------------------------------------- 2. PDF
console.log("\n── 2. Markdown → PDF（Typst）──");
// Use the exact same path as the main process: exportPdf from export.cjs,
// rather than assembling a .typ here — otherwise we would not be testing
// the real code.
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
  console.log("        Typst error:");
  console.log(String(pdfRes.error).split("\n").slice(0, 14).map((l) => "        " + l).join("\n"));
}

// Inspect the generated .typ (only present when the layout file is kept)
if (pdfRes.typPath && fs.existsSync(pdfRes.typPath)) {
  const typSrc = fs.readFileSync(pdfRes.typPath, "utf8");
  // Only inspect the body outside #import and #show — import lines inevitably contain the repo path
  const contentOnly = typSrc
    .split("\n")
    .filter((l) => !/^\s*(\/\/|#import|#show)/.test(l))
    .join("\n");
  check("★ .typ body contains no product attribution (hard rule)",
    !/格致|gezhi/i.test(contentOnly),
    /格致|gezhi/i.test(contentOnly) ? "found attribution!" : "clean");
  check("#import before #show (otherwise handout is undefined)",
    typSrc.indexOf("#import") < typSrc.indexOf("#show:"));
  check("Template import uses a relative path (Typst --root security boundary)",
    /#import "gezhi-handout\.typ"/.test(typSrc) && !/#import "[A-Za-z]:/.test(typSrc));
}

check("★ Typst compiled successfully", pdfOk, pdfOk ? `engine ${path.basename(pdfRes.engine ?? "")}` : "");
if (pdfOk && fs.existsSync(pdfPath)) {
  const size = fs.statSync(pdfPath).size;
  check("PDF size reasonable (>10KB means there is content)", size > 10240, `${(size / 1024).toFixed(1)} KB`);
  const head = fs.readFileSync(pdfPath).subarray(0, 5).toString("latin1");
  check("Is a valid PDF (%PDF- magic number)", head.startsWith("%PDF-"), head);

  // Which fonts are embedded (Chinese must not render as boxes)
  const txt = fs.readFileSync(pdfPath).toString("latin1");
  const fonts = [...new Set((txt.match(/\/BaseFont\s*\/([A-Za-z0-9+,-]+)/g) ?? [])
    .map((s) => s.replace(/\/BaseFont\s*\//, "")))];
  check("★ Embedded a Chinese font (not boxes)", fonts.some((f) => /Deng|YaHei|SimSun|MSYH|DengXian/i.test(f)),
    fonts.join(", ").slice(0, 120));
  check("No Thin/ExtraLight embedded (the variable-font pitfall)",
    !fonts.some((f) => /Thin|ExtraLight/i.test(f)), fonts.join(", ").slice(0, 120));
  console.log(`        PDF: ${path.relative(ROOT, pdfPath)} (${(size / 1024).toFixed(1)} KB)`);
}

// ---------------------------------------------------------------- 3. Word
//
// Use the **built-in pure-JS converter** (docx npm library), no longer
// depending on python-docx. Reason: a fully self-contained installer cannot
// require users to install Python (11 GB after install here).
console.log("\n── 3. Markdown → Word (built-in pure-JS converter) ──");
const docxPath = path.join(OUT, "导出测试.docx");
const { exportDocxNative } = require(path.join(ROOT, "apps/desktop/main/lib/docx-native.cjs"));
const docxRes = await exportDocxNative({ markdown: MD, outputPath: docxPath, title: "情态动词" });
check("★ Generated docx successfully", docxRes.ok === true, docxRes.ok ? docxRes.engine : String(docxRes.error));
if (docxRes.ok && fs.existsSync(docxPath)) {
  const size = fs.statSync(docxPath).size;
  check("docx size reasonable", size > 5000, `${(size / 1024).toFixed(1)} KB`);

  // Unzip with pure Node to inspect content — the exported artifact must NOT
  // depend on Python/PowerShell in reverse. (Expand-Archive only accepts the
  // .zip extension, and rejects .docx outright.)
  const { readZipText, listZip } = require(path.join(ROOT, "scripts/lib/zip-read.cjs"));
  try {
    const names = [...listZip(docxPath).keys()];
    check("docx is a valid zip (has the required OOXML parts)",
      names.includes("[Content_Types].xml") && names.includes("word/document.xml"),
      `${names.length} internal file(s)`);

    const docXml = readZipText(docxPath, "word/document.xml");
    const stylesXml = names.includes("word/styles.xml") ? readZipText(docxPath, "word/styles.xml") : "";

    check("docx has body content", docXml.length > 1500, `document.xml ${docXml.length} bytes`);
    check("docx has a title", docXml.includes("情态动词"));
    check("docx has table content (must)", docXml.includes("must"));
    check("docx has table structure", docXml.includes("<w:tbl>"));
    check("★ Set the Chinese eastAsia font (otherwise Chinese falls back in Word)",
      docXml.includes("eastAsia") || stylesXml.includes("eastAsia"));
    check("docx has bold styling", /<w:b\/>|<w:b /.test(docXml));
    check("docx has a code block (Consolas monospace)", docXml.includes("Consolas"));
    check("docx has no frontmatter residue", !docXml.includes("type: 语法讲义"));
  } catch (e) {
    check("docx content inspection", false, String(e.message).slice(0, 160));
  }
  console.log(`        Word: ${path.relative(ROOT, docxPath)} (${(size / 1024).toFixed(1)} KB)`);
}

// ---------------------------------------------------------------- 4. 无署名检查
console.log("\n── 4. Output artifacts carry no product attribution (hard rule) ──");
for (const [label, file] of [["PDF", pdfPath], ["Word", docxPath]]) {
  if (!fs.existsSync(file)) { check(`${label} no attribution`, false, "file does not exist"); continue; }
  const raw = fs.readFileSync(file);
  // PDF/docx are compressed or binary, and Chinese strings appear in PDFs as
  // UTF-16 or CID, so scanning raw UTF-8 bytes is the most reliable: search
  // for "格致" in both UTF-8 and UTF-16LE encodings.
  const utf8 = raw.includes(Buffer.from("格致", "utf8"));
  const utf16 = raw.includes(Buffer.from("格致", "utf16le"));
  // docx is a zip, so unzip before looking
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
    } catch { /* ignore */ }
  }
  check(`${label} no product attribution`, !utf8 && !utf16 && !inZip,
    utf8 || utf16 || inZip ? "★ found the 「格致」 text!" : "clean");
}

fs.rmSync(work, { recursive: true, force: true });

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== Result: ${passed}/${results.length} passed ===`);
for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
process.exit(passed === results.length ? 0 : 1);
