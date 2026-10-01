#!/usr/bin/env node
// 验证母版占位文字的过滤
//
// 背景：PowerPoint 的幻灯片母版里存着"单击此处编辑母版标题样式"这类样板文字，
// 它们真的在文件里，会被一并提取。不过滤的话用户看到开头一整屏样板字，
// 会以为解析坏了。
const fs = require("node:fs");
const path = require("node:path");
const { extractPptText } = require("../apps/desktop/main/lib/doc-extract.cjs");

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, pass: Boolean(ok), detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? "  " + detail : ""}`);
}

// 先单独验正则本身（不依赖真实文件）
console.log("=== 母版占位过滤：正则自测 ===\n");
const RE = /^单击(此处|以)?编辑母版.*$/;
const CASES = [
  ["单击此处编辑母版文本样式", true],
  ["单击此处编辑母版标题样式", true],
  ["单击以编辑母版标题样式", true],
  ["单击以编辑母版文本样式", true],
  ["Click to edit Master title style", false],  // 英文版另有一条规则，这里只验中文
  ["热   学", false],
  ["内容提要", false],
  ["第二级", false],                             // 由另一条规则处理
];
for (const [line, shouldMatch] of CASES) {
  const got = RE.test(line);
  check(`正则「${line.slice(0, 16)}」→ ${shouldMatch ? "应过滤" : "应保留"}`, got === shouldMatch,
    got === shouldMatch ? "" : `实际 ${got}`);
}

// 再验真实文件：过滤后不应再出现母版样板
console.log("\n=== 母版占位过滤：真实文件验证 ===\n");
const DIRS = ["D:/Users/LINKIT/Desktop", "D:/Users/LINKIT/Downloads"];
const found = [];
const walk = (d, depth) => {
  if (depth > 4) return;
  let es;
  try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of es) {
    const p = path.join(d, e.name);
    if (e.isFile() && /\.ppt$/i.test(e.name)) found.push(p);
    else if (e.isDirectory() && !/node_modules|\.git/i.test(e.name)) walk(p, depth + 1);
  }
};
for (const d of DIRS) walk(d, 0);

let ok = 0;
let stillHasPlaceholder = 0;
let firstSample = null;

for (const fp of found) {
  const r = extractPptText(fp);
  if (!r.ok) continue;
  ok++;
  // 检查是否**仍以母版样板开头**（这是用户实际会看到的）
  const firstLine = (r.text.split("\n")[0] ?? "").trim();
  const isPlaceholder = /^单击(此处|以)?编辑母版/.test(firstLine);
  if (isPlaceholder) {
    stillHasPlaceholder++;
    if (!firstSample) firstSample = { file: path.basename(fp), firstLine };
  }
}

console.log(`  可解析的 .ppt：${ok} 个`);
check("★ 过滤后没有文件以母版样板开头", stillHasPlaceholder === 0,
  stillHasPlaceholder ? `${stillHasPlaceholder} 个仍以样板开头，例：${firstSample?.file} → ${firstSample?.firstLine}` : "");

// 展示一个过滤后的开头，肉眼核对
for (const fp of found) {
  const r = extractPptText(fp);
  if (r.ok && /热学|运动学/.test(fp)) {
    console.log(`\n  ${path.basename(fp)}`);
    console.log(`     开头：${r.text.slice(0, 100).replace(/\n/g, " | ")}`);
    check("过滤后开头是真实内容（不是样板）",
      !/^单击(此处|以)?编辑母版/.test(r.text.trim()));
    break;
  }
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
process.exit(passed === results.length ? 0 : 1);
