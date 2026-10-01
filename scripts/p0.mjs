#!/usr/bin/env node
// 格致 · P0 总入口：一条命令跑完全部地基检查
//
// P0 的完成定义（对应计划 §5 的验收清单）：
//   ✔ 仓库骨架存在
//   ✔ node:sqlite 能建出全部表，且中文双 FTS 索引可用
//   ✔ 依赖许可门禁生效，且门禁本身经过自测
//   ✔ 能建库（目录骨架 + 配置 + 数据库）
//   ✔ DSH 桥能用，且 Agent 受控地读写库内文件
// 这个脚本把上面每一条变成可重复执行的检查。
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
console.log("║   格致 · P0 地基检查                          ║");
console.log("╚══════════════════════════════════════════════╝");
console.log(`  仓库根目录：${root}`);

// 1) 骨架
process.stdout.write("\n──────── 1. 仓库骨架 ────────\n");
const required = [
  "package.json",
  "pnpm-workspace.yaml",
  ".gitignore",
  "packages/db/schema.sql",
  "packages/db/src/index.mjs",
  "packages/db/src/assert-schema.mjs",
  "packages/db/src/cli.mjs",
  "packages/core/src/vault.mjs",
  "packages/dsh-bridge/src/index.mjs",
  "packages/dsh-bridge/smoke.mjs",
  "scripts/check-licenses.mjs",
  "scripts/check-licenses.test.mjs",
  "docs/00-环境勘察报告.md",
  "docs/01-智能层选型-DSH作为Agent内核.md",
  "docs/02-存储与检索实测.md",
  "docs/03-DSH集成实测-写作助手.md",
  "格致-开发计划.md",
];
const missing = required.filter((f) => !fs.existsSync(path.join(root, f)));
if (missing.length) {
  failed++;
  console.log(`  [FAIL] 缺文件：${missing.join(", ")}`);
  steps.push({ title: "骨架完整", ok: false });
} else {
  console.log(`  [PASS] ${required.length} 个关键文件齐全`);
  steps.push({ title: "骨架完整", ok: true });
}

// 2) 数据库结构 + 中文检索
run("2. 数据库结构断言（含中文双 FTS 索引）", process.execPath, ["packages/db/src/assert-schema.mjs"]);

// 3) 许可门禁自测 + 真实扫描
run("3a. 许可门禁自测（证明它真的会拦）", process.execPath, ["scripts/check-licenses.test.mjs"]);
run("3b. 许可门禁扫描全仓", process.execPath, ["scripts/check-licenses.mjs"]);

// 4) 建库（临时目录，不碰用户文档）
process.stdout.write("\n──────── 4. 建库冒烟 ────────\n");
const tmpRoot = path.join(process.env.TEMP ?? "/tmp", `gezhi-p0-${Date.now()}`);
try {
  const r = spawnSync(process.execPath, ["packages/db/src/cli.mjs", "init", "P0冒烟库", "--root", tmpRoot, "--subject", "英语", "--grade", "高二"], {
    cwd: root, encoding: "utf8", windowsHide: true,
  });
  console.log((r.stdout ?? "").trimEnd());
  const vaultDir = path.join(tmpRoot, "P0冒烟库");
  const checks = [
    ["库目录", fs.existsSync(vaultDir)],
    ["vault.json", fs.existsSync(path.join(vaultDir, ".gezhi", "vault.json"))],
    ["workspace.json", fs.existsSync(path.join(vaultDir, ".gezhi", "workspace.json"))],
    ["vaults.json", fs.existsSync(path.join(tmpRoot, "vaults.json"))],
    ["笔记目录", fs.existsSync(path.join(vaultDir, "笔记"))],
    ["回收站目录", fs.existsSync(path.join(vaultDir, ".gezhi", "trash"))],
  ];
  // 用 Node 读回配置，验证是真正的 UTF-8（而不是被控制台编码骗了）
  let cfgOk = false;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(vaultDir, ".gezhi", "vault.json"), "utf8"));
    cfgOk = cfg.name === "P0冒烟库" && cfg.subject === "英语";
  } catch { /* 保持 false */ }
  checks.push(["配置读回且中文正确", cfgOk]);

  let allOk = true;
  for (const [name, ok] of checks) {
    console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}`);
    if (!ok) allOk = false;
  }
  if (!allOk) failed++;
  steps.push({ title: "建库冒烟", ok: allOk });
} catch (e) {
  failed++;
  console.log(`  [FAIL] 建库失败：${e.message}`);
  steps.push({ title: "建库冒烟", ok: false });
} finally {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

// 5) DSH 桥
run("5. DSH 桥冒烟（真实调用 + 受控改文件）", process.execPath, ["packages/dsh-bridge/smoke.mjs"]);

// ---------------------------------------------------------------- 汇总
console.log("\n╔══════════════════════════════════════════════╗");
console.log("║   P0 汇总                                     ║");
console.log("╚══════════════════════════════════════════════╝");
for (const s of steps) {
  const mark = s.ok ? "✔" : "✖";
  console.log(`  ${mark} ${s.title}`);
}
const okCount = steps.filter((s) => s.ok).length;
console.log(`\n  ${okCount}/${steps.length} 项通过 → ${failed === 0 ? "P0 完成" : "P0 未完成"}`);
process.exit(failed === 0 ? 0 : 1);
