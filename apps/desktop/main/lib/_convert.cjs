#!/usr/bin/env node
// 把 md2typst.cjs 从 TS 语法转成纯 CommonJS
//
// 为什么需要脚本：用 PowerShell 内联 node -e 做正则替换，引号与反斜杠会被
// 层层解释，实测直接语法错误。放文件里就干净了。
const fs = require("node:fs");

const p = "D:/Users/LINKIT/Desktop/格致/apps/desktop/main/lib/md2typst.cjs";
let s = fs.readFileSync(p, "utf8");
const before = s.length;

const rules = [
  // interface 声明整段删掉（含多行）
  [/interface Ctx \{[\s\S]*?\n\}\n\n/, ""],
  // 函数签名
  [/function escapeTypst\(s: string\): string/g, "function escapeTypst(s)"],
  [/function escapeTypstString\(s: string\): string/g, "function escapeTypstString(s)"],
  [/function protect\(ctx: Ctx, typst: string\): string/g, "function protect(ctx, typst)"],
  [/function inline\(text: string, ctx: Ctx\): string/g, "function inline(text, ctx)"],
  [/export function markdownToTypst\(md: string\): \{ body: string; title: string \}/g, "function markdownToTypst(md)"],
  // buildTypstDocument 的签名跨行，单独处理
  [/export function buildTypstDocument\(\s*\n\s*md: string,\s*\n\s*opts: \{ templatePath: string; title\?: string; author\?: string \} = \{ templatePath: "" \}\s*\n\): string \{/g,
   "function buildTypstDocument(md, opts = {}) {"],
  // 回调参数类型
  [/\(_m, code: string\)/g, "(_m, code)"],
  [/\(_m, tex: string\)/g, "(_m, tex)"],
  [/\(_m, alt: string, src: string\)/g, "(_m, alt, src)"],
  [/\(_m, txt: string, url: string\)/g, "(_m, txt, url)"],
  [/\(c: string \| undefined\)/g, "(c)"],
  [/\(r\) => r\.trim\(\)/g, "(r) => r.trim()"],
  // 数组类型标注
  [/const out: string\[\] = \[\]/g, "const out = []"],
  [/let fenceBuf: string\[\] = \[\]/g, "let fenceBuf = []"],
  [/let mathBuf: string\[\] = \[\]/g, "let mathBuf = []"],
  [/let tableBuf: string\[\] = \[\]/g, "let tableBuf = []"],
  // 其余零散的 : string / : Ctx
  [/: Ctx\b/g, ""],
  [/\bexport /g, ""],
];

let applied = [];
for (const [re, rep] of rules) {
  const m = s.match(re);
  if (m) { applied.push(`${re.source.slice(0, 46)}… (${m.length} 处)`); }
  s = s.replace(re, rep);
}

s = s.trimEnd() + "\n\nmodule.exports = { markdownToTypst, buildTypstDocument };\n";
fs.writeFileSync(p, s, "utf8");

console.log(`已转换：${before} → ${s.length} 字节`);
console.log(`应用了 ${applied.length} 条规则：`);
for (const a of applied) console.log("  " + a);

// 残留的 TS 标注检查
const leftovers = [];
const checks = [
  [/:\s*string\b/, ": string"],
  [/\binterface\s+\w+/, "interface"],
  [/\bexport\b/, "export"],
  [/:\s*Ctx\b/, ": Ctx"],
];
for (const [re, label] of checks) {
  const m = s.match(new RegExp(re.source, "g"));
  if (m) leftovers.push(`${label} × ${m.length}`);
}
console.log(leftovers.length ? `\n⚠ 残留：${leftovers.join("; ")}` : "\n✔ 没有残留的 TS 语法");
