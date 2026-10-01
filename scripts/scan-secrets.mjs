#!/usr/bin/env node
// 格致 · 密钥泄露扫描
//
// 为什么要有：本项目已经踩过两次 ——
//   1) ~/.config/opencode/opencode.json 里明文躺着 DeepSeek 与智谱的 key，
//      那份还被复制进了比赛项目的 docs/opencode-config-sample.json
//   2) 腾讯云的 SecretId/SecretKey 直接贴进了聊天记录
// 靠人记性是不可靠的，所以做成可执行的检查：
//   - 手动跑：node scripts/scan-secrets.mjs [目录...]
//   - 提交时自动跑：.githooks/pre-commit
//   - CI 里跑：node scripts/scan-secrets.mjs
//
// 设计原则：**宁可误报，不可漏报**。误报只需在 EXEMPT 里加一条并写清理由；
// 漏报的代价是密钥泄露。
import fs from "node:fs";
import path from "node:path";

// ------------------------------------------------------------------ 规则

const RULES = [
  {
    id: "tencent-secret-id",
    label: "腾讯云 SecretId",
    re: /\bAKID[A-Za-z0-9]{13,}\b/g,
    why: "腾讯云 SecretId 泄露 + SecretKey 一起就能调用账号下所有已开通服务",
  },
  {
    id: "deepseek-key",
    label: "DeepSeek / OpenAI 风格密钥",
    re: /\bsk-[A-Za-z0-9_-]{16,}\b/g,
    why: "模型 API key 泄露会被刷额度",
  },
  {
    id: "zhipu-key",
    label: "智谱 API key（形如 id.secret）",
    re: /\b[0-9a-f]{32}\.[A-Za-z0-9]{12,}\b/g,
    why: "智谱 key 泄露会被刷额度",
  },
  {
    id: "github-token",
    label: "GitHub token",
    re: /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
    why: "GitHub token 泄露可被用来改代码、读私库",
  },
  {
    id: "aws-key",
    label: "AWS Access Key",
    re: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g,
    why: "AWS 密钥泄露会直接产生账单",
  },
  {
    id: "private-key-block",
    label: "私钥文件内容",
    re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
    why: "私钥绝不该出现在仓库里",
  },
  {
    id: "generic-assignment",
    label: "疑似硬编码密钥的赋值",
    // 形如 secretKey = "xxxx" / api_key: 'xxxxxxxx' —— 但排除明显的占位符与非密钥值
    re: /(secret[_-]?key|secret[_-]?id|api[_-]?key|access[_-]?token|password|passwd)\s*[:=]\s*["'`]([^"'`\s]{16,})["'`]/gi,
    why: "把密钥写进代码或配置是最常见的泄露方式",
    filter: (m, lineText) => {
      const v = (m[2] ?? "");
      const lower = v.toLowerCase();

      // ① 占位符与示例值
      const placeholders = [
        /^(your|my|xxx+|placeholder|example|test|demo|sample|dummy|fake|redacted|todo)/,
        /^\$\{/, /^<.*>$/, /^\{\{/, /^(process\.)?env\./,
        /^(none|null|undefined|changeme|change_me|replace|insert)/,
        /^[a-z]+_here$/, /^0+$/, /^\*+$/,
      ];
      if (placeholders.some((r) => r.test(lower))) return false;

      // ② ★ 全大写下划线形式的值 —— 那是**环境变量名 / 常量名**，不是密钥
      //    真实密钥不会长成 "TENCENT_SECRET_ID" 这样。
      //    （这条是实测逼出来的：把 process.env.X 拆成常量后，
      //      `secretId: "TENCENT_SECRET_ID"` 被误判成泄露。）
      if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(v)) return false;

      // ③ 该行本身就出现了环境变量访问 —— 说明值来自 env 而非硬编码
      if (lineText && /process\.env|import\.meta\.env|env\[|os\.environ|getenv/i.test(lineText)) return false;

      return true;
    },
  },
];

// 允许清单：命中的文件/路径直接跳过（每条都要写清理由）
const SKIP_PATH = [
  /[\\/]node_modules[\\/]/,
  /[\\/]\.git[\\/]/,
  /[\\/]dist[\\/]/,
  /[\\/]产出[\\/]/,
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  // 本扫描器自身（它必须包含这些正则）
  /scan-secrets\.mjs$/,
  // 自测文件：里面的"密钥"是用字符串拼接构造的伪造样本，用于证明规则真的会命中
  /scan-secrets\.test\.mjs$/,
  // 许可门禁自测：里面有 license 字符串，与本扫描无关
  /check-licenses\.test\.mjs$/,
];

const SKIP_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz",
  ".woff", ".woff2", ".ttf", ".otf", ".mp3", ".mp4", ".webm", ".db", ".asar",
]);

const MAX_FILE_BYTES = 3 * 1024 * 1024;

// ------------------------------------------------------------------ 扫描

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (SKIP_PATH.some((r) => r.test(p))) continue;
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && !SKIP_EXT.has(path.extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}

function mask(s) {
  if (s.length <= 10) return s[0] + "***";
  return s.slice(0, 6) + "…" + s.slice(-4) + `（${s.length} 字符）`;
}

export function scanFiles(files) {
  const findings = [];
  for (const f of files) {
    let st;
    try {
      st = fs.statSync(f);
    } catch {
      continue;
    }
    if (st.size > MAX_FILE_BYTES) continue;
    let text;
    try {
      text = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    if (text.includes("\u0000")) continue;   // 二进制

    const lines = text.split(/\r?\n/);
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(text)) !== null) {
        const idx = m.index;
        const lineNo = text.slice(0, idx).split(/\r?\n/).length;
        const lineText = lines[lineNo - 1] ?? "";
        // filter 同时拿到匹配与所在行 —— 有些误报要结合整行才能排除
        // （例如 `secretId: "TENCENT_SECRET_ID"` 里的值是环境变量名而非密钥）
        if (rule.filter && !rule.filter(m, lineText)) {
          if (rule.re.lastIndex === m.index) rule.re.lastIndex++;
          continue;
        }
        findings.push({
          rule: rule.id,
          label: rule.label,
          why: rule.why,
          file: f,
          line: lineNo,
          preview: mask(m[0]),
          context: lineText.trim().slice(0, 120),
        });
        if (rule.re.lastIndex === m.index) rule.re.lastIndex++;  // 防零宽死循环
      }
    }
  }
  return findings;
}

// ------------------------------------------------------------------ CLI

function main() {
  const args = process.argv.slice(2);
  const targets = args.filter((a) => !a.startsWith("--"));
  const roots = targets.length ? targets : [process.cwd()];

  let files = [];
  for (const r of roots) {
    const st = fs.existsSync(r) ? fs.statSync(r) : null;
    if (!st) continue;
    files = st.isDirectory() ? walk(r, files) : files.concat(r);
  }
  files = [...new Set(files)];

  console.log("=== 格致 · 密钥泄露扫描 ===");
  console.log(`  扫描 ${files.length} 个文件，${RULES.length} 条规则`);
  console.log("");

  const findings = scanFiles(files);

  if (findings.length === 0) {
    console.log("  ✔ 未发现疑似密钥");
    console.log("");
    return 0;
  }

  const byRule = new Map();
  for (const f of findings) {
    if (!byRule.has(f.rule)) byRule.set(f.rule, []);
    byRule.get(f.rule).push(f);
  }

  for (const [rule, items] of byRule) {
    console.log(`  ✖ ${items[0].label}（${items.length} 处）`);
    console.log(`     为什么危险：${items[0].why}`);
    for (const it of items.slice(0, 10)) {
      console.log(`     ${path.relative(process.cwd(), it.file)}:${it.line}  ${it.preview}`);
      if (it.context) console.log(`        ${it.context}`);
    }
    if (items.length > 10) console.log(`     …另有 ${items.length - 10} 处`);
    console.log("");
  }

  console.log(`  === 结果：发现 ${findings.length} 处疑似密钥 → 失败 ===`);
  console.log("  处理办法：① 立刻吊销该密钥并重发  ② 把新密钥放进 %APPDATA%\\gezhi\\credentials.enc");
  console.log("            ③ 若确属误报，在 scan-secrets.mjs 的 SKIP_PATH 或规则 filter 里加例外并写清理由");
  return 1;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("scan-secrets.mjs")) {
  process.exit(main());
}
