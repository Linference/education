// 格致 · 密钥存储
//
// 目标：学生的 API 密钥（DeepSeek / 腾讯云 / 智谱）不落在任何明文文件里，
//       不随库同步，不进 git，也不放在 DSH 的凭据目录下
//       （实测 DSH 的 .credentials.yaml 允许 CodexSandboxUsers 组读取）。
//
// 存储位置：%APPDATA%\gezhi\credentials.enc   —— 在库之外，不随 OneDrive 同步
//
// 两种保护模式，按安全强度排序：
//   ① passphrase（默认，最强）：scrypt 从主密码派生密钥，AES-256-GCM 加密。
//      主密码不落盘 —— 每次解锁都要输。攻击者拿到文件也没用。
//   ② dpapi（便利）：Windows DPAPI CurrentUser 加密，绑定当前 Windows 账户。
//      开机即用，但同一 Windows 账户下的任何进程都能解 —— 防的是"文件被拷走"。
//
// 关于为什么不用纯 Node 做 DPAPI：Node 没有内置 DPAPI 绑定，必须走 PowerShell +
// System.Security.Cryptography。而那条路要把明文通过**命令行参数**传给子进程，
// 同机进程可能从进程列表里窥探到 —— 反而降低了安全性。所以默认模式是 ①。
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { appDataDir } from "../../db/src/index.mjs";

const MAGIC = "GEZHI-CRED-v1";
const FILE = "credentials.enc";

export function credentialsPath() {
  return path.join(appDataDir(), FILE);
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

// ------------------------------------------------------------------ 加密基元

function deriveKey(passphrase, salt) {
  // scrypt：内存硬，抗 GPU 暴力破解。参数按交互式解锁的体感取（约 100ms 级）
  return crypto.scryptSync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

function encryptWithPassphrase(obj, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj), "utf8");
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    magic: MAGIC,
    mode: "passphrase",
    kdf: { algo: "scrypt", N: 2 ** 15, r: 8, p: 1, salt: salt.toString("base64") },
    cipher: { algo: "aes-256-gcm", iv: iv.toString("base64"), tag: tag.toString("base64") },
    payload: ct.toString("base64"),
    updatedAt: new Date().toISOString(),
  };
}

function decryptWithPassphrase(file, passphrase) {
  const kdf = file.kdf ?? {};
  const salt = Buffer.from(kdf.salt, "base64");
  const key = crypto.scryptSync(passphrase, salt, 32, {
    N: kdf.N ?? 2 ** 15, r: kdf.r ?? 8, p: kdf.p ?? 1, maxmem: 64 * 1024 * 1024,
  });
  const iv = Buffer.from(file.cipher.iv, "base64");
  const tag = Buffer.from(file.cipher.tag, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(Buffer.from(file.payload, "base64")), decipher.final()]);
  return JSON.parse(pt.toString("utf8"));
}

// ------------------------------------------------------------------ DPAPI（便利模式）

function dpapiProtect(text) {
  const ps = [
    "Add-Type -AssemblyName System.Security;",
    "$b=[Text.Encoding]::UTF8.GetBytes($env:GEZHI_PLAIN);",
    "$p=[Security.Cryptography.ProtectedData]::Protect($b,$null,'CurrentUser');",
    "[Convert]::ToBase64String($p)",
  ].join(" ");
  const r = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], {
    encoding: "utf8",
    env: { ...process.env, GEZHI_PLAIN: text },   // 用环境变量而非命令行参数，少一个泄露面
    windowsHide: true,
  });
  if (r.status !== 0) throw new Error("DPAPI Protect 失败：" + (r.stderr || "").slice(0, 300));
  return r.stdout.trim();
}

function dpapiUnprotect(b64) {
  const ps = [
    "Add-Type -AssemblyName System.Security;",
    "$p=[Convert]::FromBase64String($env:GEZHI_B64);",
    "$b=[Security.Cryptography.ProtectedData]::Unprotect($p,$null,'CurrentUser');",
    "[Text.Encoding]::UTF8.GetString($b)",
  ].join(" ");
  const r = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], {
    encoding: "utf8",
    env: { ...process.env, GEZHI_B64: b64 },
    windowsHide: true,
  });
  if (r.status !== 0) throw new Error("DPAPI Unprotect 失败：" + (r.stderr || "").slice(0, 300));
  return r.stdout.trim();
}

function encryptWithDpapi(obj) {
  return {
    magic: MAGIC,
    mode: "dpapi",
    payload: dpapiProtect(JSON.stringify(obj)),
    updatedAt: new Date().toISOString(),
  };
}

// ------------------------------------------------------------------ 对外 API

/**
 * 保存密钥。
 * @param {object} secrets   形如 { tencent: { secretId, secretKey }, deepseek: { apiKey } }
 * @param {object} opts      { passphrase } 指定则用主密码模式；缺省用 DPAPI
 */
export function saveSecrets(secrets, { passphrase } = {}) {
  const p = credentialsPath();
  ensureDir(p);
  const file = passphrase ? encryptWithPassphrase(secrets, passphrase) : encryptWithDpapi(secrets);
  fs.writeFileSync(p, JSON.stringify(file, null, 2), { encoding: "utf8", mode: 0o600 });
  hardenAcl(p);
  return { path: p, mode: file.mode };
}

/**
 * 载入密钥。
 * @param {object} opts { passphrase }
 */
export function loadSecrets({ passphrase } = {}) {
  const p = credentialsPath();
  if (!fs.existsSync(p)) return null;
  const file = JSON.parse(fs.readFileSync(p, "utf8"));
  if (file.magic !== MAGIC) throw new Error("凭据文件格式不认识（magic 不匹配）");
  if (file.mode === "passphrase") {
    if (!passphrase) throw new Error("该凭据库用主密码保护，需要提供 passphrase");
    return decryptWithPassphrase(file, passphrase);   // 密码错会因 GCM 校验失败而抛
  }
  if (file.mode === "dpapi") {
    return JSON.parse(dpapiUnprotect(file.payload));
  }
  throw new Error("不支持的凭据保护模式：" + file.mode);
}

export function credentialsInfo() {
  const p = credentialsPath();
  if (!fs.existsSync(p)) return { exists: false, path: p };
  const st = fs.statSync(p);
  let mode = "?";
  try { mode = JSON.parse(fs.readFileSync(p, "utf8")).mode; } catch { /* 忽略 */ }
  return { exists: true, path: p, mode, bytes: st.size, mtime: st.mtime.toISOString() };
}

export function deleteSecrets() {
  const p = credentialsPath();
  if (fs.existsSync(p)) fs.rmSync(p);
  return p;
}

/**
 * 收紧文件权限：只允许当前用户访问。
 * 为什么需要：实测 DSH 自己的 .credentials.yaml 允许 CodexSandboxUsers 组读取，
 * 于是沙箱进程能读到里面所有 provider 的 key。格致不重复这个错误。
 */
export function hardenAcl(target) {
  if (process.platform !== "win32") {
    try { fs.chmodSync(target, 0o600); } catch { /* 忽略 */ }
    return { hardened: true, how: "chmod 600" };
  }
  const user = process.env.USERNAME;
  const ps = [
    `$p = $env:GEZHI_TARGET;`,
    `$acl = Get-Acl -LiteralPath $p;`,
    `$acl.SetAccessRuleProtection($true, $false);`,   // 断开继承，清空已有规则
    `$me = New-Object System.Security.AccessControl.FileSystemAccessRule($env:GEZHI_USER,'FullControl','Allow');`,
    `$acl.SetAccessRule($me);`,
    `Set-Acl -LiteralPath $p -AclObject $acl;`,
    `(Get-Acl -LiteralPath $p).Access | ForEach-Object { $_.IdentityReference.Value + '|' + $_.FileSystemRights }`,
  ].join(" ");
  const r = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], {
    encoding: "utf8",
    env: { ...process.env, GEZHI_TARGET: target, GEZHI_USER: `${process.env.USERDOMAIN}\\${user}` },
    windowsHide: true,
  });
  if (r.status !== 0) return { hardened: false, error: (r.stderr || "").slice(0, 200) };
  return { hardened: true, how: "icacls 断开继承", rules: r.stdout.trim().split(/\r?\n/).filter(Boolean) };
}
