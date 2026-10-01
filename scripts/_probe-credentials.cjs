#!/usr/bin/env node
// 查：格致调用的 DSH 到底用哪个凭据在访问模型
//
// 用户问："我都没输入 api，那软件调用的 deepseek 是哪里来的"
//
// 需要查清三件事：
//   1. DSH 的配置在哪、里面有没有配模型与密钥
//   2. 密钥是明文存在哪，还是从环境变量读
//   3. 格致自己有没有存过密钥（credentials.enc）
//
// ⚠️ 输出时必须**脱敏** —— 只显示前后各 4 位，中间打码。
//    这个脚本的输出可能被贴到对话里，不能把密钥打出来。
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execSync } = require("node:child_process");

/** 脱敏显示：保留首尾各 4 位 */
function mask(s) {
  const t = String(s ?? "");
  if (!t) return "(空)";
  if (t.length <= 12) return t.slice(0, 2) + "*".repeat(Math.max(1, t.length - 2));
  return t.slice(0, 4) + "*".repeat(Math.min(24, t.length - 8)) + t.slice(-4);
}

/** 在文件内容里找疑似密钥的字段（只报告字段名与脱敏值） */
function scanSecrets(label, txt, maxLen = 20000) {
  const patterns = [
    [/\b(sk-[A-Za-z0-9_\-]{8,})/g, "sk- 开头的密钥"],
    [/(["']?(?:api[_-]?key|apikey|token|secret|password|auth)["']?\s*[:=]\s*["']?)([^"'\s,}]{8,})/gi, "配置字段"],
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
    console.log(`  ★ ${label} 里发现 ${uniq.length} 处疑似凭据（已脱敏）：`);
    for (const f of uniq.slice(0, 8)) console.log(`      ${f.field}${f.masked}   [${f.why}]`);
  }
  return uniq.length;
}

console.log("=== 格致访问模型的凭据来源调查 ===\n");

// ---------- 1. DSH 安装位置与配置 ----------
console.log("── 1. DSH 本体 ──");
const DSH_DIR = "D:\\DeepSeek Harness";
const DSH_EXE = path.join(DSH_DIR, "DeepSeek Harness.exe");
console.log(`  可执行文件：${fs.existsSync(DSH_EXE) ? "存在" : "不存在"}  ${DSH_EXE}`);

console.log("\n─ 1b. DSH 目录下与配置有关的文件 ──");
const walk = (dir, depth = 0, acc = []) => {
  if (depth > 3) return acc;
  let es; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of es) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (/node_modules|Cache|GPUCache|logs?$/i.test(e.name)) continue;
      walk(p, depth + 1, acc);
    } else if (/\.(json|yaml|yml|toml|ini|env|conf)$/i.test(e.name) || /config|credential|auth|setting/i.test(e.name)) {
      try { acc.push({ p, size: fs.statSync(p).size }); } catch { /* 忽略 */ }
    }
  }
  return acc;
};
const cfgFiles = walk(DSH_DIR);
for (const f of cfgFiles.slice(0, 20)) {
  console.log(`    ${(f.size / 1024).toFixed(1).padStart(7)} KB  ${f.p.replace(DSH_DIR + "\\", "")}`);
}
if (cfgFiles.length > 20) console.log(`    …共 ${cfgFiles.length} 个`);

// ---------- 2. 用户目录下的 DSH 配置 ----------
console.log("\n── 2. 用户目录下的 DSH / 格致 配置 ──");
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
  if (!fs.existsSync(c)) { console.log(`  ${c}  （不存在）`); continue; }
  console.log(`  ★ ${c}`);
  const files = walk(c, 0);
  for (const f of files.slice(0, 15)) {
    console.log(`      ${(f.size / 1024).toFixed(1).padStart(6)} KB  ${path.basename(f.p)}`);
    try {
      const txt = fs.readFileSync(f.p, "utf8");
      secretHits += scanSecrets(path.basename(f.p), txt);
    } catch { /* 忽略 */ }
  }
  if (!files.length) console.log("      （没有配置文件）");
}

// ---------- 3. 环境变量 ----------
console.log("\n── 3. 环境变量里的凭据 ──");
const ENV_KEYS = Object.keys(process.env).filter((k) =>
  /API|KEY|TOKEN|SECRET|DEEPSEEK|DSH|OPENAI|ANTHROPIC/i.test(k)
);
if (!ENV_KEYS.length) {
  console.log("  （没有与模型/密钥相关的环境变量）");
} else {
  for (const k of ENV_KEYS) {
    const v = process.env[k] ?? "";
    // 只显示看起来像密钥的值，且脱敏
    const looksSecret = /key|token|secret/i.test(k) && v.length > 8;
    console.log(`  ${k} = ${looksSecret ? mask(v) : v.slice(0, 60)}`);
    if (looksSecret) secretHits++;
  }
}

// ---------- 4. 格致自己的凭据库 ----------
console.log("\n── 4. 格致自己的凭据库 ──");
const gezhiCred = path.join(process.env.APPDATA ?? "", "gezhi", "credentials.enc");
if (fs.existsSync(gezhiCred)) {
  const st = fs.statSync(gezhiCred);
  console.log(`  ★ 存在：${gezhiCred}`);
  console.log(`      ${st.size} 字节，修改于 ${st.mtime.toLocaleString("zh-CN")}`);
  console.log(`      （加密存储，无法直接读取内容 —— 这是设计如此）`);
} else {
  console.log(`  不存在（格致没有自己存过任何密钥）`);
  console.log(`      路径应为：${gezhiCred}`);
}

console.log(`\n=== 小结 ===`);
console.log(`  在配置文件里发现的疑似凭据处数：${secretHits}`);
console.log(`  格致自己的凭据库：${fs.existsSync(gezhiCred) ? "有" : "无"}`);
