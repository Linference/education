#!/usr/bin/env node
// Continue investigating: DSH's model provider config and where credentials live.
//
// Conclusion from the previous round: no API key in any obvious place.
// Yet Gezhi's AI demonstrably works (verify-ai.mjs measured 13/13), so the
// credential must be somewhere. Candidates:
//   1. DSH's profile config (which provider and model it uses)
//   2. Electron's credential storage (DPAPI-encrypted, in AppData\Roaming\<app>)
//   3. DSH's login state (an OAuth token rather than an API key)
//   4. some local proxy service
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function mask(s) {
  const t = String(s ?? "");
  if (!t) return "(empty)";
  if (t.length <= 10) return t.slice(0, 2) + "*".repeat(Math.max(1, t.length - 2));
  return t.slice(0, 4) + "*".repeat(Math.min(20, t.length - 8)) + t.slice(-4);
}

const DSH_HOME = "C:\\Users\\LINKIT\\.dsh";
console.log("=== DSH config and credential investigation ===\n");

// ---------- 1. DSH_HOME directory structure ----------
console.log("── 1. DSH_HOME structure (two levels) ──");
function tree(dir, depth = 0, maxDepth = 2) {
  if (depth > maxDepth) return;
  let es; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of es.slice(0, 25)) {
    const p = path.join(dir, e.name);
    const pad = "  ".repeat(depth + 1);
    if (e.isDirectory()) {
      console.log(`${pad}${e.name}/`);
      tree(p, depth + 1, maxDepth);
    } else {
      let size = 0;
      try { size = fs.statSync(p).size; } catch { /* ignore */ }
      console.log(`${pad}${e.name}  (${(size / 1024).toFixed(1)} KB)`);
    }
  }
}
tree(DSH_HOME);

// ---------- 2. provider / model parts of the profile config ----------
console.log("\n── 2. Model and provider settings in the profile config ──");
const profDir = path.join(DSH_HOME, "profiles", "desktop");
const cfgCandidates = [
  path.join(profDir, "agent.cordis.yml"),
  path.join(profDir, "preset.yml"),
  path.join(DSH_HOME, "agent.cordis.yml"),
  path.join(DSH_HOME, "preset.yml"),
];
for (const f of cfgCandidates) {
  if (!fs.existsSync(f)) continue;
  console.log(`  ── ${f.replace(DSH_HOME, "~/.dsh")} ──`);
  let txt = "";
  try { txt = fs.readFileSync(f, "utf8"); } catch { continue; }
  // Only keep lines related to provider/model/key, to avoid flooding the screen
  const lines = txt.split("\n");
  const hits = lines
    .map((l, i) => ({ l, i: i + 1 }))
    .filter(({ l }) => /provider|model|api|key|token|base|url|endpoint|auth|deepseek|anthropic|openai/i.test(l))
    .slice(0, 24);
  if (!hits.length) { console.log("    (no relevant config lines)"); continue; }
  for (const h of hits) {
    // Mask: obfuscate long strings that look like secrets
    const safe = h.l.replace(/([A-Za-z0-9_\-]{20,})/g, (m) => mask(m));
    console.log(`    ${String(h.i).padStart(3)}: ${safe.trim().slice(0, 130)}`);
  }
}

// ---------- 3. Electron credential storage ----------
console.log("\n── 3. Electron app data directory (may hold login state) ──");
const APPDATA = process.env.APPDATA ?? "";
const cands = [];
for (const base of [APPDATA, process.env.LOCALAPPDATA ?? ""]) {
  if (!base || !fs.existsSync(base)) continue;
  for (const e of fs.readdirSync(base, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (/deepseek|dsh|harness/i.test(e.name)) cands.push(path.join(base, e.name));
  }
}
if (!cands.length) console.log("  (no DSH Electron data directory found)");
for (const c of cands) {
  console.log(`  ★ ${c}`);
  const look = ["Cookies", "Login Data", "Local Storage", "Network", "Preferences", "config.json", "settings.json", "credentials.json"];
  for (const name of look) {
    const p = path.join(c, name);
    if (fs.existsSync(p)) {
      let size = 0;
      try { size = fs.statSync(p).size; } catch { /* ignore */ }
      console.log(`      ${name}  (${(size / 1024).toFixed(1)} KB)`);
    }
  }
  // Local Storage in leveldb form
  const ls = path.join(c, "Local Storage", "leveldb");
  if (fs.existsSync(ls)) {
    console.log(`      ${fs.readdirSync(ls).length} file(s) in Local Storage/leveldb/`);
  }
}

// ---------- 4. Does DSH provide a local proxy? ----------
console.log("\n── 4. DSH local service ──");
console.log(`  DSH_WEB_URL = ${process.env.DSH_WEB_URL ?? "(not set)"}`);

// ---------- 5. Search the whole DSH_HOME for sk- keys ----------
console.log("\n── 5. Search DSH_HOME for sk- keys (masked report) ──");
let found = 0;
const walkAll = (dir, depth = 0) => {
  if (depth > 4 || found > 6) return;
  let es; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of es) {
    if (found > 6) return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (/node_modules|Cache|GPUCache|Code Cache/i.test(e.name)) continue;
      walkAll(p, depth + 1);
      continue;
    }
    if (!/\.(json|yml|yaml|txt|log|db|ini|env)$/i.test(e.name)) continue;
    let txt = "";
    try {
      const st = fs.statSync(p);
      if (st.size > 4 * 1024 * 1024) continue;   // skip oversized files
      txt = fs.readFileSync(p, "utf8");
    } catch { continue; }
    const m = txt.match(/sk-[A-Za-z0-9_\-]{10,}/g);
    if (m) {
      found += m.length;
      console.log(`  ★ ${p.replace(DSH_HOME, "~/.dsh")}`);
      for (const one of [...new Set(m)].slice(0, 3)) {
        console.log(`      ${mask(one)}   (length ${one.length})`);
      }
    }
  }
};
walkAll(DSH_HOME);
if (!found) console.log("  (no sk- keys in DSH_HOME)");

console.log("\n=== Conclusion ===");
console.log(`  sk- keys found: ${found}`);
