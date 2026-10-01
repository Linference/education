#!/usr/bin/env node
// 公式重复 bug 的回归测试
//
// 现象（界面截图里肉眼可见）：
//   块级公式渲染成 P(B|A)P(A)/P(B)，后面又跟一行碎片 P(B)P(B|A)P(A)
//   行内公式渲染成 E = mc²，后面又跟 E = mc2
//
// 原因假设：latexToTypst 的"字母拆分"改动了文本，
//           使后续的公式正则又匹配到了残余片段。
//
// 这个测试锁死"每个公式只出现一次"。
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const { markdownToTypst } = require(path.join(ROOT, "apps/desktop/main/lib/md2typst.cjs"));

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, pass: Boolean(ok), detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? "  " + detail : ""}`);
}

const BS = String.fromCharCode(92);

console.log("=== 公式重复 bug 回归测试 ===\n");

// ---- 块级公式 ----
const mdBlock = "$$" + BS + "frac{P(B|A)P(A)}{P(B)}$$";
const r1 = markdownToTypst(mdBlock);
const body1 = r1.body;
console.log(`块级公式输出：${JSON.stringify(body1)}`);
const dollarCount1 = (body1.match(/\$/g) ?? []).length;
check("块级公式只产生一对 $（两个 $ 符号）", dollarCount1 === 2, `实际 ${dollarCount1} 个 $`);
check("块级公式里没有残余的括号片段", !/P\(B\)P\(B\|A\)P\(A\)/.test(body1.replace(/\s/g, "")),
  "（这是界面里看到的重复行）");
check("块级公式内容完整", body1.includes("frac") || body1.includes("/"), "");

// ---- 行内公式 ----
const mdInline = "行内 $E = mc^2$ 也要渲染。";
const r2 = markdownToTypst(mdInline);
const body2 = r2.body;
console.log(`行内公式输出：${JSON.stringify(body2)}`);
const dollarCount2 = (body2.match(/\$/g) ?? []).length;
check("行内公式只产生 2 个 $", dollarCount2 === 2, `实际 ${dollarCount2} 个 $`);
check("行内公式里没有残余 E = mc2 字面文本",
  !(body2.replace(/\$[^$]*\$/g, "").includes("mc2")), "（这是界面里看到的重复）");

// ---- 混合：块级 + 行内同时存在 ----
const mdMix = [
  "# 标题",
  "",
  "$$" + BS + "frac{P(B|A)P(A)}{P(B)}$$",
  "",
  "行内 $E = mc^2$ 也要渲染。",
].join("\n");
const r3 = markdownToTypst(mdMix);
const body3 = r3.body;
console.log(`混合输出：\n${body3}\n`);
const dollars3 = (body3.match(/\$/g) ?? []).length;
check("混合场景共 4 个 $（块级 2 + 行内 2）", dollars3 === 4, `实际 ${dollars3} 个`);
check("没有重复的公式碎片", !body3.replace(/\s/g, "").includes("P(B)P(B|A)P(A)"));

// ---- 每个公式在输出里只出现一次 ----
const latexFragments = ["frac{P(B|A)P(A)}{P(B)}", "E = mc^2"];
for (const frag of latexFragments) {
  const n = (body3.match(new RegExp(frag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
  check(`原始 LaTeX 片段「${frag}」在输出里出现 0 次（应已转换）`, n === 0, `出现 ${n} 次`);
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
process.exit(passed === results.length ? 0 : 1);
