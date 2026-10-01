#!/usr/bin/env node
// .doc（Word 97-2003 二进制格式）文本提取自测
//
// 用**用户机器上真实存在的 .doc 文件**测，不用我造的样本 ——
// 造的样本只能证明"我实现的东西能被我自己解析"，证明不了真实文件能读。
//
// 断言策略：
//   1. 能提取出非空文本
//   2. 中文比例合理（不能是乱码）
//   3. 抽取的文本里应该出现该文件"本该有"的关键词（人工核对过的）
const fs = require("node:fs");
const path = require("node:path");
const { extractDocText } = require("../apps/desktop/main/lib/doc-extract.cjs");

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, pass: Boolean(ok), detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? "  " + detail : ""}`);
}

// 真实文件（用户机器上找到的）
const FILES = [
  {
    p: "D:/Users/LINKIT/Desktop/math_model/samples/2024_CUMCM_A/format2024.doc",
    label: "2024 数学建模国赛 A 题格式模板",
    expect: ["数学建模", "论文", "摘要"],
  },
  {
    p: "D:/Users/LINKIT/Desktop/物理竞赛/历屆賽題/全國物理競賽題集/2020高中物理竞赛习题专题五：静电场(Word版含答案).doc",
    label: "2020 高中物理竞赛 · 静电场",
    expect: ["电场", "电荷"],
  },
  {
    p: "D:/Users/LINKIT/Downloads/34-4.doc",
    label: "Downloads/34-4.doc",
    expect: [],
  },
];

console.log("=== .doc 文本提取自测（用真实文件）===\n");

let tested = 0;
for (const f of FILES) {
  if (!fs.existsSync(f.p)) {
    console.log(`  [SKIP] ${f.label}（文件不存在）`);
    continue;
  }
  tested++;
  const sizeMB = (fs.statSync(f.p).size / 1024 / 1024).toFixed(1);
  console.log(`\n── ${f.label}（${sizeMB} MB）──`);

  const t0 = Date.now();
  const r = extractDocText(f.p);
  const ms = Date.now() - t0;

  if (!r.ok) {
    check(`${f.label} 提取成功`, false, String(r.error));
    continue;
  }

  const text = r.text ?? "";
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const total = text.length;
  const cjkRatio = total > 0 ? cjk / total : 0;

  check(`${f.label} 提取到文本`, text.length > 50,
    `${text.length} 字（方法 ${r.method}，${ms}ms）`);
  check(`${f.label} 中文不是乱码`, cjk > 20 && (cjkRatio > 0.25 || f.expect.length === 0),
    `汉字 ${cjk} 个，占比 ${(cjkRatio * 100).toFixed(0)}%`);

  if (f.expect.length) {
    const hits = f.expect.filter((k) => text.includes(k));
    check(`${f.label} 含预期关键词`, hits.length > 0,
      `命中 ${JSON.stringify(hits)} / 期望 ${JSON.stringify(f.expect)}`);
  }

  // 打印开头，便于肉眼核对
  const preview = text.slice(0, 100).replace(/\n/g, " | ");
  console.log(`       开头：${preview}`);
}

// 边界情况
console.log("\n── 边界情况 ──");
const tmp = path.join(require("node:os").tmpdir(), "gezhi-doc-test");
fs.mkdirSync(tmp, { recursive: true });

// RTF 伪装成 .doc
const rtfPath = path.join(tmp, "rtf.doc");
fs.writeFileSync(rtfPath, "{\\rtf1\\ansi\\deff0 {\\fonttbl{\\f0\\fnil Calibri;}}\\f0\\fs24 Hello 世界\\par Second line}", "latin1");
const rtfR = extractDocText(rtfPath);
check("RTF 伪装成 .doc 也能读", rtfR.ok && rtfR.text.includes("Hello"), rtfR.ok ? rtfR.text.slice(0, 40) : String(rtfR.error));

// 纯文本伪装成 .doc
const txtPath = path.join(tmp, "plain.doc");
fs.writeFileSync(txtPath, "这是一份纯文本，扩展名写成了 .doc。\n第二行。", "utf8");
const txtR = extractDocText(txtPath);
check("纯文本伪装成 .doc 也能读", txtR.ok && txtR.text.includes("纯文本"), txtR.ok ? txtR.text.slice(0, 30) : String(txtR.error));

// docx 伪装成 .doc（应给出明确提示）
// 夹具做成一个**真的 zip**（PK\x03\x04 + 足够长度），否则测不到 ZIP 分支
const docxPath = path.join(tmp, "fake.doc");
{
  const parts = [Buffer.from([0x50, 0x4b, 0x03, 0x04])];
  parts.push(Buffer.alloc(64, 0x00));
  parts.push(Buffer.from("[Content_Types].xml"));
  fs.writeFileSync(docxPath, Buffer.concat(parts));
}
const docxR = extractDocText(docxPath);
check("docx 伪装成 .doc 会提示按 docx 打开", docxR.ok === false && docxR.error === "__IS_DOCX__",
  String(docxR.hint ?? docxR.error));

// 随机垃圾
const junkPath = path.join(tmp, "junk.doc");
fs.writeFileSync(junkPath, Buffer.alloc(2000, 0xff));
const junkR = extractDocText(junkPath);
check("垃圾文件不崩，返回明确错误", junkR.ok === false && typeof junkR.error === "string", String(junkR.error).slice(0, 50));

fs.rmSync(tmp, { recursive: true, force: true });

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过（测了 ${tested} 个真实文件）===`);
for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
process.exit(passed === results.length ? 0 : 1);
