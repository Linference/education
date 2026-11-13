#!/usr/bin/env node
// Investigate: which credential does the DSH that Gezhi calls use to access the model?
//
// The user asked: "I never entered an api key, so where does the deepseek the
// software calls come from?"
//
// Three things need to be established:
//   1. Where DSH's config lives, and whether it contains a model and a key
//   2. Whether the key is stored in plaintext somewhere, or read from env vars
//   3. Whether Gezhi has ever stored a key itself (credentials.enc)
//
// ⚠️ Output must be **masked** — show only 4 characters at each end, with the
//    middle obfuscated. This script's output may be pasted into a chat, so it
//    must never print the key.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execSync } = require("node:child_process");

/** Masked display: keep 4 characters at each end */
function mask(s) {
  const t = String(s ?? "");
  if (!t) return "(empty)";
  if (t.length <= 12) return t.slice(0, 2) + "*".repeat(Math.max(1, t.length - 2));
  return t.slice(0, 4) + "*".repeat(Math.min(24, t.length - 8)) + t.slice(-4);
}

/** Find fields that look like secrets in file content (report only field names and masked values) */
function scanSecrets(label, txt, maxLen = 20000) {
  const patterns = [
    [/\b(sk-[A-Za-z0-9_\-]{8,})/g, "key starting with sk-"],
    [/(["']?(?:api[_-]?key|apikey|token|secret|password|auth)["']?\s*[:=]\s*["']?)([^"'\s,}]{8,})/gi, "config field"],
  ];
  const found = [];
  for (const [re, why] of patterns) {
    let m;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(txt.slice(0, maxLen))) !== null) {
      const val = m[2] ?? m[1];
      found.push({ why, field: m[1]?.slice(0, 40) ?? "", masked: mask(val) });
    }
  }
  const uniq = [];
  const seen = new Set();
  for (const f of found) {
    const k = f.masked + f.field;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(f);
  }
  if (uniq.length) {
    console.log(`  ★ ${label} contains ${uniq.length} suspected credential(s) (masked):`);
    for (const f of uniq.slice(0, 8)) console.log(`      ${f.field}${f.masked}   [${f.why}]`);
  }
  return uniq.length;
}

console.log("=== Investigation: which credentials Gezhi uses to access the model ===\n");

// ---------- 1. DSH install location and config ----------
console.log("── 1. DSH itself ──");
const DSH_DIR = "D:\\DeepSeek Harness";
const DSH_EXE = path.join(DSH_DIR, "DeepSeek Harness.exe");
console.log(`  Executable: ${fs.existsSync(DSH_EXE) ? "present" : "missing"}  ${DSH_EXE}`);

console.log("\n─ 1b. Config-related files under the DSH directory ──");
const walk = (dir, depth = 0, acc = []) => {
  if (depth > 3) return acc;
  let es; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of es) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (/node_modules|Cache|GPUCache|logs?$/i.test(e.name)) continue;
      walk(p, depth + 1, acc);
    } else if (/\.(json|yaml|yml|toml|ini|env|conf)$/i.test(e.name) || /config|credential|auth|setting/i.test(e.name)) {
      try { acc.push({ p, size: fs.statSync(p).size }); } catch { /* ignore */ }
    }
  }
  return acc;
};
const cfgFiles = walk(DSH_DIR);
for (const f of cfgFiles.slice(0, 20)) {
  console.log(`    ${(f.size / 1024).toFixed(1).padStart(7)} KB  ${f.p.replace(DSH_DIR + "\\", "")}`);
}
if (cfgFiles.length > 20) console.log(`    …${cfgFiles.length} in total`);

// ---------- 2. DSH config under the user directory ----------
console.log("\n── 2. DSH / Gezhi config under the user directory ──");
const home = os.homedir();
const CANDIDATES = [
  path.join(home, ".dsh"),
  path.join(home, ".deepseek"),
  path.join(home, ".config", "dsh"),
  path.join(process.env.APPDATA ?? "", "dsh"),
  path.join(process.env.APPDATA ?? "", "DeepSeek Harness"),
  path.join(process.env.APPDATA ?? "", "gezhi"),
  path.join(process.env.LOCALAPPDATA ?? "", "gezhi"),
];
let secretHits = 0;
for (const c of CANDIDATES) {
  if (!fs.existsSync(c)) { console.log(`  ${c}  (does not exist)`); continue; }
  console.log(`  ★ ${c}`);
  const files = walk(c, 0);
  for (const f of files.slice(0, 15)) {
    console.log(`      ${(f.size / 1024).toFixed(1).padStart(6)} KB  ${path.basename(f.p)}`);
    try {
      const txt = fs.readFileSync(f.p, "utf8");
      secretHits += scanSecrets(path.basename(f.p), txt);
    } catch { /* ignore */ }
  }
  if (!files.length) console.log("      (no config files)");
}

// ---------- 3. Environment variables ----------
console.log("\n── 3. Credentials in environment variables ──");
const ENV_KEYS = Object.keys(process.env).filter((k) =>
  /API|KEY|TOKEN|SECRET|DEEPSEEK|DSH|OPENAI|ANTHROPIC/i.test(k)
);
if (!ENV_KEYS.length) {
  console.log("  (no model/key-related environment variables)");
} else {
  for (const k of ENV_KEYS) {
    const v = process.env[k] ?? "";
    // Only show values that look like secrets, and mask them
    const looksSecret = /key|token|secret/i.test(k) && v.length > 8;
    console.log(`  ${k} = ${looksSecret ? mask(v) : v.slice(0, 60)}`);
    if (looksSecret) secretHits++;
  }
}

// ---------- 4. Gezhi's own credential store ----------
console.log("\n── 4. Gezhi's own credential store ──");
const gezhiCred = path.join(process.env.APPDATA ?? "", "gezhi", "credentials.enc");
if (fs.existsSync(gezhiCred)) {
  const st = fs.statSync(gezhiCred);
  console.log(`  ★ exists: ${gezhiCred}`);
  console.log(`      ${st.size} bytes, modified at ${st.mtime.toLocaleString("zh-CN")}`);
  console.log(`      (encrypted storage; contents cannot be read directly — by design)`);
} else {
  console.log(`  does not exist (Gezhi has never stored any secret itself)`);
  console.log(`      Expected path: ${gezhiCred}`);
}

console.log(`\n=== Summary ===`);
console.log(`  Suspected credential occurrences found in config files: ${secretHits}`);
console.log(`  Gezhi's own credential store: ${fs.existsSync(gezhiCred) ? "present" : "absent"}`);
