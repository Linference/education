#!/usr/bin/env node
// 格致 · 密钥存储的自测
//
// 为什么必须测：加密货币代码最容易"看起来在工作" ——
// 文件写出来了、读回来也对，但可能**明文还在里面**、或者**错误密码也能解开**。
// 所以每条断言都针对一个具体的失败模式。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  saveSecrets, loadSecrets, credentialsPath, credentialsInfo, deleteSecrets, hardenAcl,
} from "../packages/core/src/credentials.mjs";

let passed = 0, failed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (e) {
    failed++;
    console.log(`  [FAIL] ${name}`);
    console.log(`         ${e.message.split("\n")[0]}`);
  }
}

// 用拼接构造假密钥，避免本文件被自己的扫描器标记
const FAKE = {
  tencent: { secretId: "AKID" + "TESTONLY".repeat(4), secretKey: "fake-key-" + "x".repeat(24) },
  deepseek: { apiKey: "sk-" + "f".repeat(32) },
};
const PASS = "格致-测试主密码-2026";

console.log("=== 密钥存储自测 ===");
console.log(`  凭据文件：${credentialsPath()}`);
console.log("");

// 备份已有凭据，测完还原（别弄丢用户真实的密钥）
const CRED = credentialsPath();
const backup = fs.existsSync(CRED) ? fs.readFileSync(CRED) : null;
if (backup) console.log("  （检测到已有凭据文件，测完会还原）\n");

function cleanup() {
  try { fs.rmSync(CRED, { force: true }); } catch { /* 忽略 */ }
}

try {
  // ---------------------------------------------------------------- 主密码模式

  cleanup();
  const info1 = saveSecrets(FAKE, { passphrase: PASS });

  check("保存后文件存在，且 mode 记录为 passphrase", () => {
    assert.ok(fs.existsSync(CRED), "文件不存在");
    const f = JSON.parse(fs.readFileSync(CRED, "utf8"));
    assert.equal(f.mode, "passphrase");
  });

  check("★ 文件里不含任何明文密钥（最重要的一条）", () => {
    const raw = fs.readFileSync(CRED, "utf8");
    for (const [svc, obj] of Object.entries(FAKE)) {
      for (const [k, v] of Object.entries(obj)) {
        assert.ok(!raw.includes(v), `文件里出现了明文 ${svc}.${k}`);
      }
    }
    assert.ok(!raw.includes(PASS), "文件里出现了明文主密码");
  });

  check("★ 错误主密码解不开（GCM 认证失败，而不是返回垃圾数据）", () => {
    assert.throws(() => loadSecrets({ passphrase: "错误的密码" }), /unable to authenticate|bad decrypt|authenticate/i);
  });

  check("忘记传主密码时明确报错，而不是静默返回空", () => {
    assert.throws(() => loadSecrets({}), /主密码|passphrase/i);
  });

  check("正确主密码能完整读回，且内容一致", () => {
    const got = loadSecrets({ passphrase: PASS });
    assert.deepEqual(got, FAKE);
  });

  check("每次保存用新的 salt/iv（相同内容两次加密结果不同）", () => {
    const first = fs.readFileSync(CRED, "utf8");
    saveSecrets(FAKE, { passphrase: PASS });
    const second = fs.readFileSync(CRED, "utf8");
    const a = JSON.parse(first), b = JSON.parse(second);
    assert.notEqual(a.kdf.salt, b.kdf.salt, "salt 被复用了");
    assert.notEqual(a.cipher.iv, b.cipher.iv, "iv 被复用了");
    assert.notEqual(a.payload, b.payload, "密文相同（说明没加随机性）");
  });

  check("凭据文件权限已收紧（不含 CodexSandboxUsers 等宽权限组）", () => {
    const r = hardenAcl(CRED);
    if (process.platform !== "win32") {
      assert.ok(r.hardened, "chmod 失败");
      return;
    }
    assert.ok(r.hardened, "ACL 收紧失败：" + (r.error ?? ""));
    const joined = (r.rules ?? []).join(" ");
    assert.ok(!/CodexSandboxUsers/.test(joined), "ACL 里仍有 CodexSandboxUsers：" + joined);
    assert.ok(!/Everyone|Users/.test(joined.replace(/CodexSandboxUsers/g, "")), "ACL 里仍有宽权限组：" + joined);
  });

  check("credentialsInfo 能报出模式与大小", () => {
    const info = credentialsInfo();
    assert.ok(info.exists);
    assert.equal(info.mode, "passphrase");
    assert.ok(info.bytes > 100);
  });

  check("删除后文件消失", () => {
    deleteSecrets();
    assert.ok(!fs.existsSync(CRED));
    assert.equal(credentialsInfo().exists, false);
  });

  // ---------------------------------------------------------------- 覆盖写入

  check("重复保存会覆盖而不是追加", () => {
    saveSecrets({ a: { k: "1".repeat(20) } }, { passphrase: PASS });
    saveSecrets({ b: { k: "2".repeat(20) } }, { passphrase: PASS });
    const got = loadSecrets({ passphrase: PASS });
    assert.ok(!("a" in got), "旧数据没被清掉");
    assert.ok("b" in got);
  });

  // ---------------------------------------------------------------- 损坏与篡改

  check("★ 篡改密文会被发现（完整性保护真的生效）", () => {
    saveSecrets(FAKE, { passphrase: PASS });
    const f = JSON.parse(fs.readFileSync(CRED, "utf8"));
    const buf = Buffer.from(f.payload, "base64");
    buf[0] ^= 0xff;                                  // 翻转第一个字节
    f.payload = buf.toString("base64");
    fs.writeFileSync(CRED, JSON.stringify(f), "utf8");
    assert.throws(() => loadSecrets({ passphrase: PASS }), /authenticate|decrypt/i);
  });

  check("文件格式不认识时报错，而不是瞎猜", () => {
    fs.writeFileSync(CRED, JSON.stringify({ magic: "SOMETHING-ELSE", mode: "passphrase" }), "utf8");
    assert.throws(() => loadSecrets({ passphrase: PASS }), /magic|格式/i);
  });

  check("凭据文件不存在时返回 null（首次运行的正常情况）", () => {
    cleanup();
    assert.equal(loadSecrets({ passphrase: PASS }), null);
  });
} finally {
  // 还原用户原有的凭据文件
  cleanup();
  if (backup) {
    fs.writeFileSync(CRED, backup);
    console.log("\n  （已还原原有凭据文件）");
  }
}

console.log("");
console.log(`=== 结果：${passed} 通过 / ${failed} 失败 ===`);
process.exit(failed === 0 ? 0 : 1);
