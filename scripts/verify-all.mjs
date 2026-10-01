#!/usr/bin/env node
// 格致 · 全量验证入口
//
// 一条命令跑完全部测试，跑之前不用记哪些脚本存在。
//
// 为什么要重试：每个 Electron 相关的测试都要**冷启动一个进程**，
// 连续跑十几次时偶发失败（约 1/10）—— 报的是"等待超时"或"页面已关闭"，
// 单独重跑必过。那不是代码问题，是启动竞争。
// 没有重试的话，这种偶发失败会让人怀疑刚改的代码，浪费大量时间排查不存在的问题。
//
// 用法：
//   node scripts/verify-all.mjs          跑全部
//   node scripts/verify-all.mjs --quick  只跑不启动 Electron 的快测
//   node scripts/verify-all.mjs --retry 3  自定义重试次数
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const args = process.argv.slice(2);
const quick = args.includes("--quick");
const retryIdx = args.indexOf("--retry");
const MAX_RETRY = retryIdx >= 0 ? Number(args[retryIdx + 1]) || 2 : 2;

/**
 * 测试清单。
 *   heavy: true  → 要启动 Electron，冷启动偶发失败，需要重试
 *   heavy: false → 纯 Node 脚本，很快，不该失败
 *   electron: true → 必须用 **Electron 的运行时**启动这个脚本本身
 *      （脚本里 `require("electron")` 要拿 `app` 对象，
 *        用普通 node 跑会得到 undefined，
 *        报错是 "Cannot read properties of undefined (reading 'whenReady')" ——
 *        看着像代码坏了，其实只是启动方式不对）
 */
const SUITES = [
  // ---- 代码与数据质量 ----
  { name: "双重编码扫描", cmd: ["scripts/scan-mojibake.mjs", "."], heavy: false },
  { name: "密钥扫描", cmd: ["scripts/scan-secrets.mjs"], heavy: false },
  { name: "许可门禁", cmd: ["scripts/check-licenses.mjs"], heavy: false },
  { name: "许可门禁自测", cmd: ["scripts/check-licenses.test.mjs"], heavy: false },

  // ---- 解析器 ----
  { name: ".doc 提取（真实文件）", cmd: ["scripts/doc-extract.test.cjs"], heavy: false },
  { name: ".ppt 母版占位过滤", cmd: ["scripts/ppt-placeholder.test.cjs"], heavy: false },
  { name: "LaTeX→Typst 转换", cmd: ["scripts/latex2typst.test.cjs"], heavy: false },

  // ---- 导出 ----
  { name: "导出内核（PDF/Word/无署名）", cmd: ["scripts/verify-export.mjs"], heavy: false },

  // ---- 数据库（要 Electron 运行时提供 node:sqlite 的主进程环境）----
  { name: "检索策略（trigram 双字词坑）", cmd: ["apps/desktop/verify-search-strategy.cjs"], heavy: true, electron: true },
  { name: "索引器（切块/反链/增量）", cmd: ["apps/desktop/verify-indexer.cjs"], heavy: true, electron: true },

  // ---- Office 高保真转换（要 Electron 运行时 + 随包 LibreOffice）----
  { name: "★ 转换全格式（PPT/Word/Excel/旧版）", cmd: ["apps/desktop/verify-soffice-convert.cjs"], heavy: true, electron: true },
  { name: "★ 转换边界与防误判", cmd: ["apps/desktop/verify-convert-edge.cjs"], heavy: true, electron: true },

  // ---- 界面（要启动 Electron 应用）----
  { name: "Markdown 渲染", cmd: ["apps/desktop/verify-markdown.mjs"], heavy: true },
  { name: "界面渲染（公式/PDF）", cmd: ["apps/desktop/verify-render.mjs"], heavy: true },
  { name: "Word 查看", cmd: ["apps/desktop/verify-docx.mjs"], heavy: true },
  { name: ".doc 界面", cmd: ["apps/desktop/verify-doc.mjs"], heavy: true },
  { name: "★ 编辑器与模式切换", cmd: ["apps/desktop/verify-editor.mjs"], heavy: true },
  { name: "★ 库内文件操作（含安全边界）", cmd: ["apps/desktop/verify-vault-fs.mjs"], heavy: true },
  { name: "★ 全文检索与反向链接", cmd: ["apps/desktop/verify-search-ui.mjs"], heavy: true },
  { name: "★ 高保真查看（PPT 转 PDF）", cmd: ["apps/desktop/verify-hifi.mjs"], heavy: true },
  // ⚠️ 这两个 .cjs 测试**已经在上面的「数据库」分组里登记过**（带 electron: true）。
  //    在这里再登记一次会导致同一测试跑两遍：第一遍用 Electron 通过，
  //    第二遍用普通 node 启动 → require("electron") 拿到 undefined →
  //    报 "Cannot read properties of undefined (reading 'whenReady')"，
  //    汇总里就是红的。实测踩过：日志里同一条测试先 PASS 后 FAIL。
  { name: "左上角交互", cmd: ["apps/desktop/verify-topleft.mjs"], heavy: true },
  { name: "Office 格式（CSV/PPTX/PPT）", cmd: ["apps/desktop/verify-office.mjs"], heavy: true },
  { name: "Office 界面", cmd: ["apps/desktop/verify-office-ui.mjs"], heavy: true },
  { name: "AI 对话持久化", cmd: ["apps/desktop/verify-chat-persist.mjs"], heavy: true },
  { name: "聊天排版紧凑", cmd: ["apps/desktop/verify-typography.mjs", "--optional"], heavy: true },
  { name: "DSH 集成", cmd: ["apps/desktop/verify-ai.mjs"], heavy: true },
];

// 聊天排版测试文件名兼容（有的机器上叫 verify-chat-typography.mjs）
for (const s of SUITES) {
  if (s.cmd[0] === "apps/desktop/verify-typography.mjs") {
    const alt = "apps/desktop/verify-chat-typography.mjs";
    if (fs.existsSync(path.join(ROOT, alt))) s.cmd = [alt];
  }
}

function run(suite) {
  const cmdArgs = suite.cmd;
  let exe = process.execPath;
  let args = cmdArgs;

  // 需要 Electron 运行时的测试：换成 Electron 可执行文件启动脚本本身
  if (suite.electron) {
    const candidates = [
      path.join(ROOT, "apps", "desktop", "node_modules", "electron", "dist", "electron.exe"),
      path.join(ROOT, "node_modules", "electron", "dist", "electron.exe"),
    ];
    const found = candidates.find((p) => fs.existsSync(p));
    if (!found) {
      return { code: 1, out: `找不到 Electron 可执行文件，试过：\n  ${candidates.join("\n  ")}` };
    }
    exe = found;
    // Electron 的 cwd 会变成脚本目录，所以给绝对路径
    args = [path.join(ROOT, cmdArgs[0])];
  }

  const env = { ...process.env };
  // ★ ELECTRON_RUN_AS_NODE 会让 Electron 退化成普通 Node，
  //   于是 require("electron") 拿不到 app。必须清掉。
  delete env.ELECTRON_RUN_AS_NODE;

  const r = spawnSync(exe, args, {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 15 * 60 * 1000,
    env,
  });
  // 启动方式出错时（用错运行时）报错很难懂，所以把实际命令打出来
  if (process.env.VERIFY_DEBUG) {
    console.log(`       [调试] ${exe} ${args.join(" ")}`);
    console.log(`       [调试] 退出码=${r.status} 信号=${r.signal ?? "无"} 错误=${r.error?.message ?? "无"}`);
  }
  return { code: r.status ?? 1, out: String(r.stdout ?? "") + String(r.stderr ?? "") };
}

/** 从输出里抓一行结论，让汇总表有信息量 */
function summarize(out) {
  const pats = [
    /=== 结果：(.+?) ===/,
    /结果：(\d+)\s*通过\s*\/\s*(\d+)/,
    /通过 (\d+)｜警告 (\d+)｜阻止 (\d+)/,
    /✔ (没有发现双重编码损坏的文件)/,
    /✔ (未发现疑似密钥)/,
  ];
  for (const p of pats) {
    const m = out.match(p);
    if (m) return m[0].replace(/^=== | ===$/g, "").trim();
  }
  return "";
}

console.log("=== 格致 · 全量验证 ===\n");
if (quick) console.log("  （--quick：跳过需要启动 Electron 的界面测试）\n");

// ---- 清单自检：同一条测试只应登记一次 ----
// 为什么要查：重复登记时同一条测试会跑两遍，第二遍可能用错运行时
// （例如 .cjs 用普通 node 跑 → require("electron") 拿到 undefined），
// 日志里表现为**先 PASS 后 FAIL**，很容易被误判成"代码坏了"。
const seen = new Map();
const dupes = [];
for (const s of SUITES) {
  const key = s.cmd[0];
  if (seen.has(key)) dupes.push(`${key}（登记了 ${seen.get(key)} 与 ${s.name}）`);
  else seen.set(key, s.name);
}
if (dupes.length) {
  console.log("  [清单错误] 以下测试重复登记：");
  for (const d of dupes) console.log(`    · ${d}`);
  console.log("");
  process.exit(1);
}

const results = [];
let failed = 0;

for (const s of SUITES) {
  if (quick && s.heavy) {
    results.push({ ...s, status: "skip" });
    continue;
  }
  if (!fs.existsSync(path.join(ROOT, s.cmd[0]))) {
    results.push({ ...s, status: "missing" });
    console.log(`  [MISS] ${s.name}  （找不到 ${s.cmd[0]}）`);
    continue;
  }

  let attempt = 0;
  let last = null;
  let ok = false;

  while (attempt <= (s.heavy ? MAX_RETRY : 0)) {
    attempt++;
    last = run(s);
    if (last.code === 0) { ok = true; break; }
    if (attempt <= (s.heavy ? MAX_RETRY : 0)) {
      console.log(`  [重试] ${s.name}（第 ${attempt} 次失败，重试…）`);
    }
  }

  const info = summarize(last?.out ?? "");
  if (ok) {
    results.push({ ...s, status: "pass", attempts: attempt, info });
    console.log(`  [PASS] ${s.name}${attempt > 1 ? `（重试 ${attempt - 1} 次）` : ""}${info ? "  " + info : ""}`);
  } else {
    failed++;
    results.push({ ...s, status: "fail", attempts: attempt, info, out: last?.out ?? "" });
    console.log(`  [FAIL] ${s.name}${info ? "  " + info : ""}`);
  }
}

// ---- 失败详情 ----
if (failed > 0) {
  console.log("\n──────── 失败详情 ────────");
  for (const r of results) {
    if (r.status !== "fail") continue;
    console.log(`\n── ${r.name}（${r.cmd.join(" ")}）──`);
    const lines = (r.out ?? "").split("\n");
    // 只打关键行：FAIL 行 + 报错行
    const key = lines.filter((l) => /\[FAIL\]|FAIL|Error:|error:|Timeout|TimeoutError/.test(l));
    for (const l of (key.length ? key.slice(0, 12) : lines.slice(-12))) {
      console.log("   " + l.trim().slice(0, 160));
    }
  }
}

const passed = results.filter((r) => r.status === "pass").length;
const skipped = results.filter((r) => r.status === "skip").length;
const missing = results.filter((r) => r.status === "missing").length;

console.log(`\n=== 汇总：${passed} 通过 / ${failed} 失败${skipped ? ` / ${skipped} 跳过` : ""}${missing ? ` / ${missing} 缺失` : ""} ===`);
if (failed === 0 && missing === 0) {
  console.log("全部通过。");
}
process.exit(failed === 0 && missing === 0 ? 0 : 1);
