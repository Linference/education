#!/usr/bin/env node
// Gezhi · dependency license gate
//
// Why this must exist from day one:
//   Research turned up a batch of libraries that "look usable but are not" ——
//     PyMuPDF      AGPL-3.0 (closed-source products must buy a license or stay away)
//     ezexam       AGPL-3.0 (Typst exam template)
//     tldraw       custom commercial license, explicitly forbids production use
//     Anytype      "Any Source Available License" (not OSI open source)
//     Nougat weights  CC-BY-NC-4.0 (non-commercial)
//   Once these get into the dependency tree, you only find out when it is time
//   to distribute, and rework is extremely costly. So make it a CI gate: any
//   newly introduced dependency exposes its license risk at commit time.
//
// Severity policy:
//   block (fail) — AGPL / SSPL / commercial restrictions / non-commercial / undeclared license / explicit production-use ban
//   warn         — GPL / LGPL (generally acceptable for a desktop app, but needs human review)
//   ignore       — MIT / Apache / BSD / ISC / MPL / 0BSD / Unlicense / CC0, etc.
import fs from "node:fs";
import path from "node:path";

// ------------------------------------------------------------------ Severity rules

const BLOCK_PATTERNS = [
  { re: /\bAGPL\b|Affero/i, why: "AGPL is viral for closed-source products distributed over a network" },
  { re: /\bSSPL\b|Server Side Public License/i, why: "SSPL is not OSI open source; it restricts service use" },
  { re: /Commons Clause/i, why: "Commons Clause forbids commercialization" },
  { re: /non-?commercial|CC-BY-NC|NC-4\.0/i, why: "Commercial use forbidden" },
  { re: /Any Source Available/i, why: "Not an OSI open-source license" },
  { re: /not to use the software in production|no production use/i, why: "Explicitly forbids production use" },
  { re: /UNLICENSED|private|proprietary/i, why: "No usable license declared" },
];

const WARN_PATTERNS = [
  { re: /\bLGPL\b/i, why: "LGPL: dynamic linking is generally acceptable; static linking needs review" },
  { re: /\bGPL\b/i, why: "GPL: confirm whether it creates a derivative work" },
  { re: /\bCPAL\b|\bEUPL\b|\bOSL\b/i, why: "Weak copyleft; needs human review" },
];

const OK_PATTERNS = [
  /^MIT$/i, /^MIT-0$/i, /Apache-2\.0/i, /^BSD/i, /^ISC$/i, /^MPL-2\.0/i,
  /^0BSD$/i, /Unlicense/i, /^CC0/i, /^Zlib$/i,
  /^Python-2\.0$/i,
  // PSF-2.0 is the official SPDX identifier for the Python-2.0 license (two spellings of the same license).
  // Measured: argparse@3 uses PSF-2.0 — it is even more permissive than MIT and allows closed-source commercial use.
  /^PSF-2\.0$/i,
  /^BlueOak/i, /^Artistic/i, /BSD-3-Clause OR MIT/i,
  /^WTFPL$/i,          // more permissive than MIT, just not a serious name
  /^CC-BY-4\.0$/i,     // attribution only, not copyleft
];

/**
 * Evaluate an SPDX expression.
 *
 * npm's license field is often an **expression** rather than a single identifier:
 *   "WTFPL OR ISC"       → either one; if any is permissive the whole is usable
 *   "(MIT OR CC0-1.0)"   → same as above, with parentheses
 *   "MIT AND CC0-1.0"    → both must be satisfied
 *
 * Why support is mandatory: the first version only matched whole strings with
 * regexes, so it blocked obviously usable licenses such as "WTFPL OR ISC" /
 * "(MIT OR CC0-1.0)". The real consequence of a too-dumb gate is that nobody
 * wants to use it and it ends up bypassed with --no-verify — as good as no gate.
 * So "better a false positive" has limits: **false positives must be quick to
 * digest**, otherwise the rules get abandoned wholesale.
 */
function evalSpdx(expr) {
  const s = String(expr ?? "").trim();
  if (!s || s === "(undeclared)") return "block";

  const flat = s.replace(/[()]/g, " ").trim();

  // AND: the strictest component decides the whole
  if (/\sAND\s/i.test(flat)) {
    const parts = flat.split(/\s+AND\s+/i).map(evalSpdx);
    return parts.includes("block") ? "block" : parts.includes("warn") ? "warn" : "ok";
  }
  // OR: the most permissive component decides the whole (any usable one is enough)
  if (/\sOR\s/i.test(flat)) {
    const parts = flat.split(/\s+OR\s+/i).map(evalSpdx);
    return parts.includes("ok") ? "ok" : parts.includes("warn") ? "warn" : "block";
  }

  for (const o of OK_PATTERNS) if (o.test(s)) return "ok";
  for (const b of BLOCK_PATTERNS) if (b.re.test(s)) return "block";
  for (const w of WARN_PATTERNS) if (w.re.test(s)) return "warn";
  return "block";
}

// Known and already-confirmed libraries (documented exceptions with reasons)
const KNOWN_EXCEPTIONS = [
  {
    name: "@deepseek-ai/*",
    allow: true,
    why: "DSH itself: planned as a reusable engine (MIT); its internal dependency list is not bundled",
  },
];

// ------------------------------------------------------------------ Scanning

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
        // But handle node_modules separately: collect every package's package.json inside
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
      /* ignore */
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
  return "(undeclared)";
}

function classify(name, license) {
  for (const ex of KNOWN_EXCEPTIONS) {
    const re = new RegExp("^" + ex.name.replace(/\*/g, ".*") + "$");
    if (re.test(name)) return { level: "ok", why: ex.why };
  }
  // Hand off to the SPDX expression evaluator (supports "A OR B" / "A AND B")
  const level = evalSpdx(license);
  if (level === "ok") return { level: "ok", why: "" };
  if (level === "warn") {
    const w = WARN_PATTERNS.find((p) => p.re.test(license));
    return { level: "warn", why: w ? w.why : "Weak copyleft; needs human review" };
  }
  const b = BLOCK_PATTERNS.find((p) => p.re.test(license));
  return {
    level: "block",
    why: b ? b.why : "Unrecognized license; blocked by default (verify it, then add it to OK_PATTERNS with a written reason)",
  };
}

// ------------------------------------------------------------------ Main flow

const root = process.cwd();
const args = process.argv.slice(2);
const strict = args.includes("--strict"); // in strict mode warnings also count as failures
const targets = args.filter((a) => !a.startsWith("--"));
const scanRoots = targets.length ? targets : [root];

console.log("=== Gezhi · dependency license gate ===");
console.log(`  Scan roots: ${scanRoots.join(", ")}`);
console.log(`  Mode: ${strict ? "strict (warnings fail)" : "standard (warnings do not fail)"}`);
console.log("");

const files = [];
for (const r of scanRoots) files.push(...findPackageJsonFiles(r));
const unique = [...new Set(files)];
console.log(`  package.json files found: ${unique.length}`);

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

console.log("\n  License distribution:");
for (const [lic, n] of [...inventory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`    ${String(n).padStart(4)}  ${lic}`);
}

if (warned.length) {
  console.log(`\n  ⚠ Warnings: ${warned.length} (not blocked, but need human review):`);
  for (const w of warned.slice(0, 40)) {
    console.log(`    - ${w.name}@${w.version}  ${w.license}`);
    console.log(`      ${w.why}`);
  }
  if (warned.length > 40) console.log(`    …plus ${warned.length - 40} more`);
}

if (blocked.length) {
  console.log(`\n  ✖ Blocked: ${blocked.length}:`);
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
  `=== Result: ok ${okCount.n} | warnings ${warned.length} | blocked ${blocked.length} → ${failed ? "FAILED" : "PASSED"} ===`
);
process.exit(failed ? 1 : 0);
