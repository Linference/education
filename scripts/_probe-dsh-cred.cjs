#!/usr/bin/env node
// 继续查：DSH 的模型 provider 配置与凭据存放位置
//
// 上一轮结论：没有 API key 在任何显眼位置。
// 但格致的 AI 确实能跑通（实测 verify-ai.mjs 13/13），所以凭据一定在某处。
// 候选：
//   1. DSH 的 profile 配置（用了哪个 provider、什么模型）
//   2. Electron 的凭据存储（DPAPI 加密，放在 AppData\Roaming\<app>）
//   3. DSH 的登录态（OAuth token 而非 API key）
//   4. 某个本地代理服务
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function mask(s) {
  const t = String(s ?? "");
  if (!t) return "(空)";
  if (t.length <= 10) return t.slice(0, 2) + "*".repeat(Math.max(1, t.length - 2));
  return t.slice(0, 4) + "*".repeat(Math.min(20, t.length - 8)) + t.slice(-4);
}

const DSH_HOME = "C:\\Users\\LINKIT\\.dsh";
console.log("=== DSH 配置与凭据调查 ===\n");

// ---------- 1. DSH_HOME 的目录结构 ----------
console.log("── 1. DSH_HOME 结构（两层层级）──");
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
      try { size = fs.statSync(p).size; } catch { /* 忽略 */ }
      console.log(`${pad}${e.name}  (${(size / 1024).toFixed(1)} KB)`);
    }
  }
}
tree(DSH_HOME);

// ---------- 2. profile 配置里关于 provider / model 的部分 ----------
console.log("\n── 2. profile 配置里的模型与 provider 设置 ──");
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
  // 只挑与 provider/model/key 有关的行，避免刷屏
  const lines = txt.split("\n");
  const hits = lines
    .map((l, i) => ({ l, i: i + 1 }))
    .filter(({ l }) => /provider|model|api|key|token|base|url|endpoint|auth|deepseek|anthropic|openai/i.test(l))
    .slice(0, 24);
  if (!hits.length) { console.log("    （没有相关配置行）"); continue; }
  for (const h of hits) {
    // 脱敏：把看起来像密钥的长串打码
    const safe = h.l.replace(/([A-Za-z0-9_\-]{20,})/g, (m) => mask(m));
    console.log(`    ${String(h.i).padStart(3)}: ${safe.trim().slice(0, 130)}`);
  }
}

// ---------- 3. Electron 的凭据存储 ----------
console.log("\n── 3. Electron 应用数据目录（可能存登录态）──");
const APPDATA = process.env.APPDATA ?? "";
const cands = [];
for (const base of [APPDATA, process.env.LOCALAPPDATA ?? ""]) {
  if (!base || !fs.existsSync(base)) continue;
  for (const e of fs.readdirSync(base, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (/deepseek|dsh|harness/i.test(e.name)) cands.push(path.join(base, e.name));
  }
}
if (!cands.length) console.log("  （没找到 DSH 的 Electron 数据目录）");
for (const c of cands) {
  console.log(`  ★ ${c}`);
  const look = ["Cookies", "Login Data", "Local Storage", "Network", "Preferences", "config.json", "settings.json", "credentials.json"];
  for (const name of look) {
    const p = path.join(c, name);
    if (fs.existsSync(p)) {
      let size = 0;
      try { size = fs.statSync(p).size; } catch { /* 忽略 */ }
      console.log(`      ${name}  (${(size / 1024).toFixed(1)} KB)`);
    }
  }
  // leveldb 形式的 Local Storage
  const ls = path.join(c, "Local Storage", "leveldb");
  if (fs.existsSync(ls)) {
    console.log(`      Local Storage/leveldb/ 里 ${fs.readdirSync(ls).length} 个文件`);
  }
}

// ---------- 4. DSH 是否提供本地代理 ----------
console.log("\n── 4. DSH 的本地服务 ──");
console.log(`  DSH_WEB_URL = ${process.env.DSH_WEB_URL ?? "(未设置)"}`);

// ---------- 5. 搜索整个 DSH_HOME 里出现 sk- 的地方 ----------
console.log("\n── 5. 在 DSH_HOME 里搜 sk- 形式的密钥（脱敏报告）──");
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
      if (st.size > 4 * 1024 * 1024) continue;   // 跳过超大文件
      txt = fs.readFileSync(p, "utf8");
    } catch { continue; }
    const m = txt.match(/sk-[A-Za-z0-9_\-]{10,}/g);
    if (m) {
      found += m.length;
      console.log(`  ★ ${p.replace(DSH_HOME, "~/.dsh")}`);
      for (const one of [...new Set(m)].slice(0, 3)) {
        console.log(`      ${mask(one)}   （长度 ${one.length}）`);
      }
    }
  }
};
walkAll(DSH_HOME);
if (!found) console.log("  （DSH_HOME 里没有 sk- 形式的密钥）");

console.log("\n=== 结论 ===");
console.log(`  found sk- 形式密钥：${found} 处`);
