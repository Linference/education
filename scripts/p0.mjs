#!/usr/bin/env node
// Gezhi · P0 main entry: run all foundation checks with a single command.
//
// Definition of done for P0 (the acceptance checklist from plan §5):
//   ✔ repo skeleton exists
//   ✔ node:sqlite can create all tables, and the Chinese dual-FTS indexes work
//   ✔ the dependency license gate is active, and the gate itself is self-tested
//   ✔ a vault can be created (directory skeleton + config + database)
//   ✔ the DSH bridge works, and the Agent reads/writes vault files under control
// This script turns each of the above into a repeatable check.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const steps = [];
let failed = 0;

function run(title, cmd, args, { expectFail = false, cwd = root } = {}) {
  process.stdout.write(`\n──────── ${title} ────────\n`);
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  console.log(out.trimEnd());
  const code = r.status ?? 1;
  const ok = expectFail ? code !== 0 : code === 0;
  if (!ok) failed++;
  steps.push({ title, code, ok: code === 0, expected: expectFail ? "fail" : "pass" });
  return { code, out };
}

console.log("╔══════════════════════════════════════════════╗");
console.log("║   Gezhi · P0 foundation checks                ║");
console.log("╚══════════════════════════════════════════════╝");
console.log(`  Repo root: ${root}`);

// 1) Skeleton
process.stdout.write("\n──────── 1. Repo skeleton ────────\n");
const required = [
  "package.json",
  "pnpm-workspace.yaml",
  ".gitignore",
  "packages/db/schema.sql",
  "packages/db/src/index.mjs",
  "packages/db/src/assert-schema.mjs",
  "packages/db/src/cli.mjs",
  "packages/core/src/vault.mjs",
  "packages/core/src/credentials.mjs",
  "packages/dsh-bridge/src/index.mjs",
  "packages/dsh-bridge/smoke.mjs",
  ".githooks/pre-commit",
  "scripts/check-licenses.mjs",
  "scripts/check-licenses.test.mjs",
  "scripts/scan-secrets.mjs",
  "scripts/scan-secrets.test.mjs",
  "scripts/credentials.test.mjs",
  "scripts/p0.mjs",
  "docs/00-environment-survey.md",
  "docs/01-intelligence-layer-dsh-as-agent-core.md",
  "docs/02-storage-and-retrieval-measurements.md",
  "docs/03-dsh-integration-writing-assistant.md",
  "docs/04-credentials-and-security.md",
  "templates/typst/handout.typ",
  "poc/ime/r13-conclusion-autocomplete-and-ime.md",
  "gezhi-development-plan.md",
];
const missing = required.filter((f) => !fs.existsSync(path.join(root, f)));
if (missing.length) {
  failed++;
  console.log(`  [FAIL] missing files: ${missing.join(", ")}`);
  steps.push({ title: "Skeleton complete", ok: false });
} else {
  console.log(`  [PASS] all ${required.length} key files present`);
  steps.push({ title: "Skeleton complete", ok: true });
}

// 2) Database structure + Chinese search
run("2. Database schema assertion (incl. Chinese dual FTS indexes)", process.execPath, ["packages/db/src/assert-schema.mjs"]);

// 3) License gate self-test + real scan
run("3a. License gate self-test (prove it really blocks)", process.execPath, ["scripts/check-licenses.test.mjs"]);
run("3b. License gate scan of the whole repo", process.execPath, ["scripts/check-licenses.mjs"]);

// 3c/3d/3e) Secret defenses: scanner self-test + whole-repo scan + encrypted-storage self-test
run("3c. Secret-scan self-test (prove it really blocks)", process.execPath, ["scripts/scan-secrets.test.mjs"]);
run("3d. Secret scan of the whole repo", process.execPath, ["scripts/scan-secrets.mjs"]);
run("3e. Credential-storage self-test (plaintext/tamper/ACL)", process.execPath, ["scripts/credentials.test.mjs"]);

// 4) Vault creation (temp directory, does not touch user documents)
process.stdout.write("\n──────── 4. Vault-creation smoke ────────\n");
const tmpRoot = path.join(process.env.TEMP ?? "/tmp", `gezhi-p0-${Date.now()}`);
try {
  const r = spawnSync(process.execPath, ["packages/db/src/cli.mjs", "init", "P0冒烟库", "--root", tmpRoot, "--subject", "英语", "--grade", "高二"], {
    cwd: root, encoding: "utf8", windowsHide: true,
  });
  console.log((r.stdout ?? "").trimEnd());
  const vaultDir = path.join(tmpRoot, "P0冒烟库");
  const checks = [
    ["Vault directory", fs.existsSync(vaultDir)],
    ["vault.json", fs.existsSync(path.join(vaultDir, ".gezhi", "vault.json"))],
    ["workspace.json", fs.existsSync(path.join(vaultDir, ".gezhi", "workspace.json"))],
    ["vaults.json", fs.existsSync(path.join(tmpRoot, "vaults.json"))],
    ["Notes directory", fs.existsSync(path.join(vaultDir, "笔记"))],
    ["Trash directory", fs.existsSync(path.join(vaultDir, ".gezhi", "trash"))],
  ];
  // Read the config back with Node to verify it is genuinely UTF-8 (not fooled by console encoding)
  let cfgOk = false;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(vaultDir, ".gezhi", "vault.json"), "utf8"));
    cfgOk = cfg.name === "P0冒烟库" && cfg.subject === "英语";
  } catch { /* stay false */ }
  checks.push(["Config read back with correct Chinese", cfgOk]);

  let allOk = true;
  for (const [name, ok] of checks) {
    console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}`);
    if (!ok) allOk = false;
  }
  if (!allOk) failed++;
  steps.push({ title: "Vault-creation smoke", ok: allOk });
} catch (e) {
  failed++;
  console.log(`  [FAIL] vault creation failed: ${e.message}`);
  steps.push({ title: "Vault-creation smoke", ok: false });
} finally {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
}

// 5) DSH 桥
run("5. DSH bridge smoke (real call + controlled file modification)", process.execPath, ["packages/dsh-bridge/smoke.mjs"]);

// ---------------------------------------------------------------- Summary
console.log("\n╔══════════════════════════════════════════════╗");
console.log("║   P0 summary                                  ║");
console.log("╚══════════════════════════════════════════════╝");
for (const s of steps) {
  const mark = s.ok ? "✔" : "✖";
  console.log(`  ${mark} ${s.title}`);
}
const okCount = steps.filter((s) => s.ok).length;
console.log(`\n  ${okCount}/${steps.length} passed → ${failed === 0 ? "P0 complete" : "P0 incomplete"}`);
process.exit(failed === 0 ? 0 : 1);
