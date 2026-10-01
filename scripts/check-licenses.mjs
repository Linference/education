#!/usr/bin/env node
// 格致 · 依赖许可门禁
//
// 为什么第一天就要有这个东西：
//   调研发现一批"看起来能用、实际不能用"的库 ——
//     PyMuPDF      AGPL-3.0（闭源产品要么买授权要么别用）
//     ezexam       AGPL-3.0（Typst 试卷模板）
//     tldraw       自定义商业许可，明文禁止生产环境使用
//     Anytype      "Any Source Available License"（非 OSI 开源）
//     Nougat 权重  CC-BY-NC-4.0（禁商用）
//   这些东西一旦混进依赖树，等到要分发时才发现，返工代价极高。
//   所以把它做成 CI 门禁：凡是新引入的依赖，许可风险在提交那一刻就暴露。
//
// 分级策略：
//   阻止（fail）—— AGPL / SSPL / 商业限制 / 非商业 / 未声明许可 / 明确禁止生产使用
//   警告（warn）—— GPL / LGPL（桌面端一般可接受，但需要人确认）
//   忽略        —— MIT / Apache / BSD / ISC / MPL / 0BSD / Unlicense / CC0 等
import fs from "node:fs";
import path from "node:path";

// ------------------------------------------------------------------ 分级规则

const BLOCK_PATTERNS = [
  { re: /\bAGPL\b|Affero/i, why: "AGPL 对网络分发的闭源产品有传染性" },
  { re: /\bSSPL\b|Server Side Public License/i, why: "SSPL 非 OSI 开源，限制服务化" },
  { re: /Commons Clause/i, why: "Commons Clause 禁止商业化" },
  { re: /non-?commercial|CC-BY-NC|NC-4\.0/i, why: "禁止商业使用" },
  { re: /Any Source Available/i, why: "非 OSI 开源许可" },
  { re: /not to use the software in production|no production use/i, why: "明文禁止生产环境使用" },
  { re: /UNLICENSED|private|proprietary/i, why: "未声明可用许可" },
];

const WARN_PATTERNS = [
  { re: /\bLGPL\b/i, why: "LGPL：动态链接一般可接受，静态链接需评估" },
  { re: /\bGPL\b/i, why: "GPL：需确认是否构成衍生作品" },
  { re: /\bCPAL\b|\bEUPL\b|\bOSL\b/i, why: "弱 copyleft，需人工确认" },
];

const OK_PATTERNS = [
  /^MIT$/i, /^MIT-0$/i, /Apache-2\.0/i, /^BSD/i, /^ISC$/i, /^MPL-2\.0/i,
  /^0BSD$/i, /Unlicense/i, /^CC0/i, /^Zlib$/i, /^Python-2\.0$/i,
  /^BlueOak/i, /^Artistic/i, /BSD-3-Clause OR MIT/i,
];

// 已知且已确认过的库（有据可查的例外，写清理由）
const KNOWN_EXCEPTIONS = [
  {
    name: "@deepseek-ai/*",
    allow: true,
    why: "DSH 本体：按计划作为可复用引擎（MIT），不打包其内部依赖清单",
  },
];

// ------------------------------------------------------------------ 扫描

function findPackageJsonFiles(root) {
  const out = [];
  const skip = new Set(["node_modules", ".git", "dist", "out", "build", ".vite"]);
  const walk = (dir, depth) => {
    if (depth > 8) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (skip.has(e.name)) {
        // 但要单独处理 node_modules：把里面每个包的 package.json 收进来
        if (e.name === "node_modules") {
          collectInstalled(path.join(dir, e.name), out);
        }
        continue;
      }
      if (e.name.startsWith(".") && e.name !== ".") continue;
      walk(path.join(dir, e.name), depth + 1);
    }
  };
  walk(root, 0);
  return out;
}

function collectInstalled(nmDir, out, depth = 0) {
  if (depth > 4) return;
  let entries;
  try {
    entries = fs.readdirSync(nmDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".")) continue;
    if (e.name.startsWith("@")) {
      collectInstalled(path.join(nmDir, e.name), out, depth + 1);
      continue;
    }
    const pj = path.join(nmDir, e.name, "package.json");
    try {
      if (fs.statSync(pj).isFile()) out.push(pj);
    } catch {
      /* 忽略 */
    }
    const nested = path.join(nmDir, e.name, "node_modules");
    if (fs.existsSync(nested)) collectInstalled(nested, out, depth + 1);
  }
}

function licenseOf(pkg) {
  if (typeof pkg.license === "string" && pkg.license.trim()) return pkg.license.trim();
  if (pkg.license && typeof pkg.license === "object" && pkg.license.type) return String(pkg.license.type);
  if (Array.isArray(pkg.licenses) && pkg.licenses.length) {
    return pkg.licenses.map((l) => l.type ?? "?").join(" OR ");
  }
  return "(未声明)";
}

function classify(name, license) {
  for (const ex of KNOWN_EXCEPTIONS) {
    const re = new RegExp("^" + ex.name.replace(/\*/g, ".*") + "$");
    if (re.test(name)) return { level: "ok", why: ex.why };
  }
  for (const b of BLOCK_PATTERNS) if (b.re.test(license)) return { level: "block", why: b.why };
  for (const w of WARN_PATTERNS) if (w.re.test(license)) return { level: "warn", why: w.why };
  for (const o of OK_PATTERNS) if (o.test(license)) return { level: "ok", why: "" };
  return { level: "block", why: "许可无法识别，默认按阻止处理（需人工加入白名单）" };
}

// ------------------------------------------------------------------ 主流程

const root = process.cwd();
const args = process.argv.slice(2);
const strict = args.includes("--strict"); // strict 模式下警告也算失败
const targets = args.filter((a) => !a.startsWith("--"));
const scanRoots = targets.length ? targets : [root];

console.log("=== 格致 · 依赖许可门禁 ===");
console.log(`  扫描根目录：${scanRoots.join(", ")}`);
console.log(`  模式：${strict ? "严格（警告即失败）" : "标准（警告不失败）"}`);
console.log("");

const files = [];
for (const r of scanRoots) files.push(...findPackageJsonFiles(r));
const unique = [...new Set(files)];
console.log(`  发现 package.json：${unique.length} 个`);

const blocked = [];
const warned = [];
const okCount = { n: 0 };
const inventory = new Map();

for (const f of unique) {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    continue;
  }
  if (!pkg.name) continue;
  const lic = licenseOf(pkg);
  inventory.set(lic, (inventory.get(lic) ?? 0) + 1);
  const { level, why } = classify(pkg.name, lic);
  const rec = { name: pkg.name, version: pkg.version ?? "?", license: lic, why, dir: path.dirname(f) };
  if (level === "block") blocked.push(rec);
  else if (level === "warn") warned.push(rec);
  else okCount.n++;
}

console.log("\n  许可分布：");
for (const [lic, n] of [...inventory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`    ${String(n).padStart(4)}  ${lic}`);
}

if (warned.length) {
  console.log(`\n  ⚠ 警告 ${warned.length} 个（不阻止，但需要人确认）：`);
  for (const w of warned.slice(0, 40)) {
    console.log(`    - ${w.name}@${w.version}  ${w.license}`);
    console.log(`      ${w.why}`);
  }
  if (warned.length > 40) console.log(`    …另有 ${warned.length - 40} 个`);
}

if (blocked.length) {
  console.log(`\n  ✖ 阻止 ${blocked.length} 个：`);
  const uniqByName = new Map();
  for (const b of blocked) uniqByName.set(b.name, b);
  for (const b of uniqByName.values()) {
    console.log(`    - ${b.name}@${b.version}  【${b.license}】`);
    console.log(`      ${b.why}`);
    console.log(`      ${path.relative(root, b.dir)}`);
  }
}

const failed = blocked.length > 0 || (strict && warned.length > 0);
console.log("");
console.log(
  `=== 结果：通过 ${okCount.n}｜警告 ${warned.length}｜阻止 ${blocked.length} → ${failed ? "失败" : "通过"} ===`
);
process.exit(failed ? 1 : 0);
