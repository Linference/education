#!/usr/bin/env node
// 格致 · 许可门禁的自测
//
// 一个从不失败的门禁等于没有门禁。这个脚本构造几种"真实会遇到的违规"，
// 确认门禁确实能拦住它们；同时构造合法样本，确认不会误杀。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const GATE = path.resolve(import.meta.dirname, "check-licenses.mjs");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-lic-"));

/** 造一个假的 node_modules，里面放若干指定许可的包。 */
function makeFixture(name, packages) {
  const dir = path.join(root, name);
  for (const [pkgName, license] of Object.entries(packages)) {
    const pkgDir = path.join(dir, "node_modules", ...pkgName.split("/"));
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ name: pkgName, version: "1.0.0", license }, null, 2)
    );
  }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

let passed = 0, failed = 0;

function runGate(dir, { strict = false } = {}) {
  const args = [GATE, dir];
  if (strict) args.push("--strict");
  try {
    const out = execFileSync(process.execPath, args, { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

function expect(name, dir, wantFail, { strict = false, mustMention = [] } = {}) {
  const r = runGate(dir, { strict });
  const didFail = r.code !== 0;
  const problems = [];
  if (didFail !== wantFail) problems.push(`期望${wantFail ? "失败" : "通过"}，实际${didFail ? "失败" : "通过"}`);
  for (const m of mustMention) {
    if (!r.out.includes(m)) problems.push(`输出里没有提到「${m}」`);
  }
  if (problems.length) {
    failed++;
    console.log(`  [FAIL] ${name}`);
    for (const p of problems) console.log(`         ${p}`);
  } else {
    passed++;
    console.log(`  [PASS] ${name}`);
  }
}

console.log("=== 许可门禁自测 ===");

expect("拦住 AGPL 依赖（PyMuPDF 那类）",
  makeFixture("agpl", { "pymupdf-like": "AGPL-3.0" }), true, { mustMention: ["AGPL"] });

expect("拦住 SSPL 依赖",
  makeFixture("sspl", { "mongo-like": "SSPL-1.0" }), true, { mustMention: ["SSPL"] });

expect("拦住非商业许可（Nougat 权重那类）",
  makeFixture("nc", { "nougat-weights": "CC-BY-NC-4.0" }), true, { mustMention: ["商业"] });

expect("拦住「禁止生产环境使用」的自定义许可（tldraw 那类）",
  makeFixture("tldraw", { "tldraw-like": "Not to use the Software in Production Environments" }), true,
  { mustMention: ["生产环境"] });

expect("拦住未声明许可的包",
  makeFixture("unknown", { "mystery-pkg": "(未声明)" }), true, { mustMention: ["未声明"] });

expect("拦住无法识别的许可（默认拒绝，不是默认放行）",
  makeFixture("weird", { "weird-pkg": "WTFPL-9.9-Custom" }), true, { mustMention: ["无法识别"] });

expect("放行正常许可（MIT / Apache / BSD / ISC / MPL）",
  makeFixture("clean", {
    "a-mit": "MIT", "b-apache": "Apache-2.0", "c-bsd": "BSD-3-Clause",
    "d-isc": "ISC", "e-mpl": "MPL-2.0", "f-apache2": "Apache-2.0",
  }), false);

expect("GPL/LGPL 只警告、不阻止（标准模式）",
  makeFixture("gpl", { "gpl-pkg": "GPL-3.0", "lgpl-pkg": "LGPL-2.1" }), false,
  { mustMention: ["警告"] });

expect("严格模式下 GPL 警告即失败",
  makeFixture("gpl2", { "gpl-pkg": "GPL-3.0" }), true, { strict: true });

expect("空目录不报错（新仓库还没装依赖时）",
  makeFixture("empty", {}), false);

fs.rmSync(root, { recursive: true, force: true });

console.log("");
console.log(`=== 结果：${passed} 通过 / ${failed} 失败 ===`);
process.exit(failed === 0 ? 0 : 1);
