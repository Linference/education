#!/usr/bin/env node
// Gezhi · secret scanner self-test.
//
// Motivation: this gate's normal output is "✔ No suspected secrets found".
// If it were actually broken, the output would be identical — you would never
// notice. So it must be hit with real leak samples.
//
// Note: the "secret samples" in this file are **fake values** built by string
// concatenation, not real secrets. That way the scan rules match (proving they
// work), nothing is actually leaked, and this file does not get falsely
// reported by the scanner itself (it is also added to SKIP_PATH).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const SCANNER = path.resolve(import.meta.dirname, "scan-secrets.mjs");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-sec-"));

let passed = 0, failed = 0;

function run(files) {
  const dir = fs.mkdtempSync(path.join(root, "case-"));
  for (const [name, content] of Object.entries(files)) {
    const p = path.join(dir, name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, "utf8");
  }
  try {
    const out = execFileSync(process.execPath, [SCANNER, dir], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

function expect(name, files, wantFail, mustMention = []) {
  const r = run(files);
  const didFail = r.code !== 0;
  const problems = [];
  if (didFail !== wantFail) problems.push(`expected ${wantFail ? "block" : "allow"}, got ${didFail ? "block" : "allow"}`);
  for (const m of mustMention) if (!r.out.includes(m)) problems.push(`output did not mention "${m}"`);
  if (problems.length) {
    failed++;
    console.log(`  [FAIL] ${name}`);
    for (const p of problems) console.log(`         ${p}`);
    if (process.env.GEZHI_VERBOSE) console.log(r.out);
  } else {
    passed++;
    console.log(`  [PASS] ${name}`);
  }
}

// Build fake samples by concatenation, so this file never contains a literal that "looks like a real key"
const FAKE = {
  tencentId: "AKID" + "DQSHuMdgVTK9IKMJ5f3EDyWq22sExample",
  tencentKey: "vd9brtjMM" + "GyXv78xc6OURBZs0xiJJxzs",
  deepseek: "sk-" + "0123456789abcdef0123456789abcdef",
  zhipu: "0123456789abcdef0123456789abcdef" + "." + "AbCdEf012345678",
  github: "ghp_" + "0123456789abcdefghijklmnopqrstuvwx",
  aws: "AKIA" + "IOSFODNN7EXAMPLE",
};

console.log("=== Secret scanner self-test ===");
console.log("(all samples are fake values built by concatenation)\n");

// ---- Must block
expect("Blocks Tencent Cloud SecretId (the real case encountered here)",
  { "config.json": `{"secretId":"${FAKE.tencentId}"}` }, true, ["Tencent Cloud SecretId"]);

expect("Blocks a hardcoded SecretKey assignment",
  { "svc.py": `SECRET_KEY = "${FAKE.tencentKey}"\n` }, true, ["hardcoded"]);

expect("Blocks a DeepSeek / OpenAI-style key",
  { "opencode.json": `{"apiKey":"${FAKE.deepseek}"}\n` }, true, ["DeepSeek"]);

expect("Blocks the Zhipu id.secret form",
  { "conf.yaml": `apiKey: ${FAKE.zhipu}\n` }, true, ["Zhipu"]);

expect("Blocks a GitHub token",
  { ".env": `GITHUB_TOKEN=${FAKE.github}\n` }, true, ["GitHub"]);

expect("Blocks an AWS Access Key",
  { "creds.txt": `aws_access_key_id=${FAKE.aws}\n` }, true, ["AWS"]);

expect("Blocks private key file content",
  { "id_rsa": "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----\n" }, true, ["Private key"]);

expect("Blocks an assignment nested in JS",
  { "src/a.js": `const client = new X({ secretKey: "${FAKE.tencentKey}" });\n` }, true, ["hardcoded"]);

expect("Blocks a secret hidden in markdown",
  { "notes.md": `我的腾讯云 key 是 ${FAKE.tencentId} 请帮我调用\n` }, true, ["Tencent Cloud SecretId"]);

// ---- Must allow (to avoid unusable false positives)
expect("Allows placeholder syntax",
  {
    "a.json": `{"apiKey":"YOUR_API_KEY_HERE"}\n`,
    "b.yaml": `secretKey: <your-secret-key>\n`,
    "c.js": `const k = process.env.TENCENT_SECRET_KEY;\n`,
    "d.md": `请把 secretId 填成 ${"${"}TENCENT_SECRET_ID${"}"}\n`,
    "e.env": `API_KEY=changeme\n`,
    "f.json": `{"secret_key":"xxxxxxxxxxxxxxxx"}\n`,
  }, false);

expect("Allows node_modules (dependencies always have test fake keys)",
  { "node_modules/pkg/test.js": `apiKey = "${FAKE.deepseek}"\n` }, false);

// Regression case: forced by a real false positive — after extracting
// process.env.X into a constant, `secretId: "TENCENT_SECRET_ID"` was treated
// as a hardcoded secret. A real secret never takes the ALL_CAPS_UNDERSCORE
// form, so this must be allowed.
expect("Allows env-var-name constants (regression case from a real false positive)",
  {
    "src/env.mjs": [
      `export const ENV_KEYS = {`,
      `  secretId: "TENCENT_SECRET_ID",`,
      `  secretKey: "TENCENT_SECRET_KEY",`,
      `};`,
      ``,
    ].join("\n"),
  }, false);

expect("Allows same-line environment access",
  { "src/a.mjs": `const k = process.env["MY_SECRET_KEY_VALUE_X"];\n` }, false);

expect("But still blocks assignments that look like real secrets (must not miss just because of the exception)",
  { "src/b.mjs": `const apiKey = "aB3xK9mQ2pL7vN4zR8tY1wC6";\n` }, true, ["hardcoded"]);

expect("Allows lockfiles and binaries",
  { "package-lock.json": `{"x":"${FAKE.deepseek}"}\n` }, false);

expect("Allows ordinary source code (no secrets)",
  {
    "src/index.mjs": `export function add(a,b){return a+b}\n`,
    "README.md": "# 项目说明\n\n这是普通文档，没有密钥。\n",
  }, false);

// Cleanup
fs.rmSync(root, { recursive: true, force: true });

console.log("");
console.log(`=== Result: ${passed} passed / ${failed} failed ===`);
process.exit(failed === 0 ? 0 : 1);
