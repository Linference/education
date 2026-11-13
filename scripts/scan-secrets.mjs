#!/usr/bin/env node
// Gezhi · secret leak scanner.
//
// Why it exists: this project has been bitten twice —
//   1) DeepSeek and Zhipu keys sat in plaintext in
//      ~/.config/opencode/opencode.json, and that file was even copied into
//      the competition project's docs/opencode-config-sample.json
//   2) Tencent Cloud SecretId/SecretKey were pasted directly into chat logs
// Memory is unreliable, so this is an executable check:
//   - manual: node scripts/scan-secrets.mjs [dirs...]
//   - on commit: .githooks/pre-commit
//   - in CI: node scripts/scan-secrets.mjs
//
// Design principle: **better a false positive than a miss**. A false positive
// only needs one entry in the skip list with a clear reason; the cost of a miss
// is a leaked secret.
import fs from "node:fs";
import path from "node:path";

// ------------------------------------------------------------------ 规则

const RULES = [
  {
    id: "tencent-secret-id",
    label: "Tencent Cloud SecretId",
    re: /\bAKID[A-Za-z0-9]{13,}\b/g,
    why: "A leaked Tencent Cloud SecretId plus SecretKey can call every enabled service under the account",
  },
  {
    id: "deepseek-key",
    label: "DeepSeek / OpenAI-style key",
    re: /\bsk-[A-Za-z0-9_-]{16,}\b/g,
    why: "A leaked model API key can be used to drain your quota",
  },
  {
    id: "zhipu-key",
    label: "Zhipu API key (id.secret form)",
    re: /\b[0-9a-f]{32}\.[A-Za-z0-9]{12,}\b/g,
    why: "A leaked Zhipu key can be used to drain your quota",
  },
  {
    id: "github-token",
    label: "GitHub token",
    re: /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
    why: "A leaked GitHub token can be used to modify code and read private repos",
  },
  {
    id: "aws-key",
    label: "AWS Access Key",
    re: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g,
    why: "A leaked AWS key directly produces a bill",
  },
  {
    id: "private-key-block",
    label: "Private key file content",
    re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
    why: "A private key must never appear in the repo",
  },
  {
    id: "generic-assignment",
    label: "Assignment that looks like a hardcoded secret",
    // e.g. secretKey = "xxxx" / api_key: 'xxxxxxxx' — but exclude obvious placeholders and non-secret values
    re: /(secret[_-]?key|secret[_-]?id|api[_-]?key|access[_-]?token|password|passwd)\s*[:=]\s*["'`]([^"'`\s]{16,})["'`]/gi,
    why: "Writing a secret into code or config is the most common way it leaks",
    filter: (m, lineText) => {
      const v = (m[2] ?? "");
      const lower = v.toLowerCase();

      // ① Placeholders and sample values
      const placeholders = [
        /^(your|my|xxx+|placeholder|example|test|demo|sample|dummy|fake|redacted|todo)/,
        /^\$\{/, /^<.*>$/, /^\{\{/, /^(process\.)?env\./,
        /^(none|null|undefined|changeme|change_me|replace|insert)/,
        /^[a-z]+_here$/, /^0+$/, /^\*+$/,
      ];
      if (placeholders.some((r) => r.test(lower))) return false;

      // ② ★ ALL_CAPS_UNDERSCORE values — those are **environment variable /
      //     constant names**, not secrets. A real secret never looks like
      //     "TENCENT_SECRET_ID".
      //     (This rule was forced by a real case: after extracting
      //      process.env.X into constants, `secretId: "TENCENT_SECRET_ID"`
      //      was misreported as a leak.)
      if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(v)) return false;

      // ③ The line itself references an environment variable — so the value comes from env, not a hardcoded secret
      if (lineText && /process\.env|import\.meta\.env|env\[|os\.environ|getenv/i.test(lineText)) return false;

      return true;
    },
  },
];

// Allow list: matched files/paths are skipped outright (each entry needs a clear reason)
const SKIP_PATH = [
  /[\\/]node_modules[\\/]/,
  /[\\/]\.git[\\/]/,
  /[\\/]dist[\\/]/,
  /[\\/]产出[\\/]/,
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  // This scanner itself (it must contain these regexes)
  /scan-secrets\.mjs$/,
  // The self-test: its "secrets" are fake samples built by string concatenation, to prove the rules really match
  /scan-secrets\.test\.mjs$/,
  // The license-gate self-test: it contains license strings, unrelated to this scan
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
  return s.slice(0, 6) + "…" + s.slice(-4) + ` (${s.length} chars)`;
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
    if (text.includes("\u0000")) continue;   // binary

    const lines = text.split(/\r?\n/);
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(text)) !== null) {
        const idx = m.index;
        const lineNo = text.slice(0, idx).split(/\r?\n/).length;
        const lineText = lines[lineNo - 1] ?? "";
        // filter gets both the match and its line — some false positives need the whole line to rule out
        // (e.g. the value in `secretId: "TENCENT_SECRET_ID"` is an env var name, not a secret)
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
        if (rule.re.lastIndex === m.index) rule.re.lastIndex++;  // prevent zero-width infinite loop
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

  console.log("=== Gezhi · secret leak scan ===");
  console.log(`  Scanning ${files.length} file(s) with ${RULES.length} rule(s)`);
  console.log("");

  const findings = scanFiles(files);

  if (findings.length === 0) {
    console.log("  ✔ No suspected secrets found");
    console.log("");
    return 0;
  }

  const byRule = new Map();
  for (const f of findings) {
    if (!byRule.has(f.rule)) byRule.set(f.rule, []);
    byRule.get(f.rule).push(f);
  }

  for (const [rule, items] of byRule) {
    console.log(`  ✖ ${items[0].label} (${items.length} occurrence(s))`);
    console.log(`     Why dangerous: ${items[0].why}`);
    for (const it of items.slice(0, 10)) {
      console.log(`     ${path.relative(process.cwd(), it.file)}:${it.line}  ${it.preview}`);
      if (it.context) console.log(`        ${it.context}`);
    }
    if (items.length > 10) console.log(`     …another ${items.length - 10} occurrence(s)`);
    console.log("");
  }

  console.log(`  === Result: ${findings.length} suspected secret(s) found → fail ===`);
  console.log("  Next steps: ① revoke and reissue the secret immediately  ② store the new secret in %APPDATA%\\gezhi\\credentials.enc");
  console.log("              ③ if it is a false positive, add an exception with a clear reason in scan-secrets.mjs's SKIP_PATH or a rule filter");
  return 1;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("scan-secrets.mjs")) {
  process.exit(main());
}
