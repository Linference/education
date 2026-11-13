// Gezhi · Credential storage
//
// Goal: students' API keys (DeepSeek / Tencent Cloud / Zhipu) never land in any plaintext file,
//       are not synced with the vault, do not enter git, and are not placed in DSH's credential directory
//       (measurements show DSH's .credentials.yaml is readable by the CodexSandboxUsers group).
//
// Storage location: %APPDATA%\gezhi\credentials.enc   — outside the vault, not synced by OneDrive
//
// Two protection modes, ordered by security strength:
//   ① passphrase (default, strongest): derive a key from the master password with scrypt, encrypt with AES-256-GCM.
//      The master password is never written to disk — it must be entered on every unlock. An attacker who gets the file gains nothing.
//   ② dpapi (convenience): Windows DPAPI CurrentUser encryption, bound to the current Windows account.
//      Works right after boot, but any process under the same Windows account can decrypt it — it protects against "the file being copied away".
//
// Why not implement DPAPI in pure Node: Node has no built-in DPAPI binding, so it must go through PowerShell +
// System.Security.Cryptography. That path requires passing plaintext to a child process via **command-line arguments**,
// which other processes on the same machine may be able to observe in the process list — actually reducing security. So the default mode is ①.
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

// ------------------------------------------------------------------ Crypto primitives

function deriveKey(passphrase, salt) {
  // scrypt: memory-hard, resists GPU brute force. Parameters chosen for interactive unlock feel (~100ms range)
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

// ------------------------------------------------------------------ DPAPI (convenience mode)

function dpapiProtect(text) {
  const ps = [
    "Add-Type -AssemblyName System.Security;",
    "$b=[Text.Encoding]::UTF8.GetBytes($env:GEZHI_PLAIN);",
    "$p=[Security.Cryptography.ProtectedData]::Protect($b,$null,'CurrentUser');",
    "[Convert]::ToBase64String($p)",
  ].join(" ");
  const r = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], {
    encoding: "utf8",
    env: { ...process.env, GEZHI_PLAIN: text },   // use an environment variable instead of a command-line argument, one less leak surface
    windowsHide: true,
  });
  if (r.status !== 0) throw new Error("DPAPI Protect failed: " + (r.stderr || "").slice(0, 300));
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
  if (r.status !== 0) throw new Error("DPAPI Unprotect failed: " + (r.stderr || "").slice(0, 300));
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

// ------------------------------------------------------------------ Public API

/**
 * Save secrets.
 * @param {object} secrets   Of the form { tencent: { secretId, secretKey }, deepseek: { apiKey } }
 * @param {object} opts      { passphrase } if given, use passphrase mode; otherwise DPAPI
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
 * Load secrets.
 * @param {object} opts { passphrase }
 */
export function loadSecrets({ passphrase } = {}) {
  const p = credentialsPath();
  if (!fs.existsSync(p)) return null;
  const file = JSON.parse(fs.readFileSync(p, "utf8"));
  if (file.magic !== MAGIC) throw new Error("Unrecognized credential file format (magic mismatch)");
  if (file.mode === "passphrase") {
    if (!passphrase) throw new Error("This credential store is protected by a master password; passphrase is required");
    return decryptWithPassphrase(file, passphrase);   // a wrong password throws on GCM verification failure
  }
  if (file.mode === "dpapi") {
    return JSON.parse(dpapiUnprotect(file.payload));
  }
  throw new Error("Unsupported credential protection mode: " + file.mode);
}

export function credentialsInfo() {
  const p = credentialsPath();
  if (!fs.existsSync(p)) return { exists: false, path: p };
  const st = fs.statSync(p);
  let mode = "?";
  try { mode = JSON.parse(fs.readFileSync(p, "utf8")).mode; } catch { /* ignore */ }
  return { exists: true, path: p, mode, bytes: st.size, mtime: st.mtime.toISOString() };
}

export function deleteSecrets() {
  const p = credentialsPath();
  if (fs.existsSync(p)) fs.rmSync(p);
  return p;
}

/**
 * Tighten file permissions: allow access only by the current user.
 * Why this is needed: measurements show DSH's own .credentials.yaml is readable by the CodexSandboxUsers group,
 * so sandbox processes can read every provider's key in it. Gezhi does not repeat that mistake.
 */
export function hardenAcl(target) {
  if (process.platform !== "win32") {
    try { fs.chmodSync(target, 0o600); } catch { /* ignore */ }
    return { hardened: true, how: "chmod 600" };
  }
  const user = process.env.USERNAME;
  const ps = [
    `$p = $env:GEZHI_TARGET;`,
    `$acl = Get-Acl -LiteralPath $p;`,
    `$acl.SetAccessRuleProtection($true, $false);`,   // break inheritance and clear existing rules
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
  return { hardened: true, how: "icacls inheritance broken", rules: r.stdout.trim().split(/\r?\n/).filter(Boolean) };
}
