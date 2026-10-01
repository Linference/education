#!/usr/bin/env node
// 格致 · 密钥扫描的自测
//
// 动机：这个门禁的日常输出是「✔ 未发现疑似密钥」。如果它其实坏了，
// 输出一模一样 —— 你永远不会发现。所以必须构造真实的泄露样本去撞它。
//
// 注意：本文件里的"密钥样本"是用字符串拼接拼出来的**伪造值**，不是真密钥。
// 这样做既能让扫描规则命中（证明规则有效），又不会真的泄露任何东西，
// 同时避免本文件自己被扫描器误报（同时也加进了 SKIP_PATH）。
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
  if (didFail !== wantFail) problems.push(`期望${wantFail ? "拦截" : "放行"}，实际${didFail ? "拦截" : "放行"}`);
  for (const m of mustMention) if (!r.out.includes(m)) problems.push(`输出未提到「${m}」`);
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

// 用拼接构造伪造样本，避免本文件出现"看起来像真 key 的字面量"
const FAKE = {
  tencentId: "AKID" + "DQSHuMdgVTK9IKMJ5f3EDyWq22sExample",
  tencentKey: "vd9brtjMM" + "GyXv78xc6OURBZs0xiJJxzs",
  deepseek: "sk-" + "0123456789abcdef0123456789abcdef",
  zhipu: "0123456789abcdef0123456789abcdef" + "." + "AbCdEf012345678",
  github: "ghp_" + "0123456789abcdefghijklmnopqrstuvwx",
  aws: "AKIA" + "IOSFODNN7EXAMPLE",
};

console.log("=== 密钥扫描自测 ===");
console.log("（样本均为拼接构造的伪造值）\n");

// ---- 必须拦截的
expect("拦住腾讯云 SecretId（本次真实遇到的情况）",
  { "config.json": `{"secretId":"${FAKE.tencentId}"}` }, true, ["腾讯云 SecretId"]);

expect("拦住硬编码的 SecretKey 赋值",
  { "svc.py": `SECRET_KEY = "${FAKE.tencentKey}"\n` }, true, ["硬编码"]);

expect("拦住 DeepSeek / OpenAI 风格 key",
  { "opencode.json": `{"apiKey":"${FAKE.deepseek}"}\n` }, true, ["DeepSeek"]);

expect("拦住智谱 id.secret 形式",
  { "conf.yaml": `apiKey: ${FAKE.zhipu}\n` }, true, ["智谱"]);

expect("拦住 GitHub token",
  { ".env": `GITHUB_TOKEN=${FAKE.github}\n` }, true, ["GitHub"]);

expect("拦住 AWS Access Key",
  { "creds.txt": `aws_access_key_id=${FAKE.aws}\n` }, true, ["AWS"]);

expect("拦住私钥文件内容",
  { "id_rsa": "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----\n" }, true, ["私钥"]);

expect("拦住嵌套在 JS 里的赋值",
  { "src/a.js": `const client = new X({ secretKey: "${FAKE.tencentKey}" });\n` }, true, ["硬编码"]);

expect("拦住藏在 markdown 里的密钥",
  { "notes.md": `我的腾讯云 key 是 ${FAKE.tencentId} 请帮我调用\n` }, true, ["腾讯云 SecretId"]);

// ---- 必须放行的（避免误报到没法用）
expect("放行占位符写法",
  {
    "a.json": `{"apiKey":"YOUR_API_KEY_HERE"}\n`,
    "b.yaml": `secretKey: <your-secret-key>\n`,
    "c.js": `const k = process.env.TENCENT_SECRET_KEY;\n`,
    "d.md": `请把 secretId 填成 ${"${"}TENCENT_SECRET_ID${"}"}\n`,
    "e.env": `API_KEY=changeme\n`,
    "f.json": `{"secret_key":"xxxxxxxxxxxxxxxx"}\n`,
  }, false);

expect("放行 node_modules（依赖里总有测试用的假 key）",
  { "node_modules/pkg/test.js": `apiKey = "${FAKE.deepseek}"\n` }, false);

expect("放行锁文件与二进制",
  { "package-lock.json": `{"x":"${FAKE.deepseek}"}\n` }, false);

expect("放行普通源码（没有密钥）",
  {
    "src/index.mjs": `export function add(a,b){return a+b}\n`,
    "README.md": "# 项目说明\n\n这是普通文档，没有密钥。\n",
  }, false);

// 清理
fs.rmSync(root, { recursive: true, force: true });

console.log("");
console.log(`=== 结果：${passed} 通过 / ${failed} 失败 ===`);
process.exit(failed === 0 ? 0 : 1);
