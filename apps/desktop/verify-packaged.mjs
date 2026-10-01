#!/usr/bin/env node
// 验证**打包后**的应用里 AI 还能不能用
//
// 为什么必须单独测：开发态 ai.cjs 从仓库路径 import dsh-bridge，
// 打包后那个路径不存在（代码在 app.asar 里），必须靠 extraResources
// 放到 resources/dsh-bridge。这一步漏了的话，开发模式一切正常、
// 用户装完发现 AI 面板写着"DSH 不可用" —— 最难发现的一类问题。
import { _electron as electron } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const PACKED = path.join(ROOT, "dist", "installer", "win-unpacked");
const EXE = path.join(PACKED, "格致.exe");

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, pass: Boolean(ok), detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? "  " + detail : ""}`);
}

console.log("=== 打包版 AI 内核验证 ===\n");

if (!fs.existsSync(EXE)) {
  console.error("找不到打包产物：", EXE);
  console.error("先跑 node scripts/build-installer.mjs");
  process.exit(1);
}

// ---- 静态检查：dsh-bridge 是否真的被打进 resources ----
const resDir = path.join(PACKED, "resources");
const bridgeDir = path.join(resDir, "dsh-bridge");
check("resources/dsh-bridge 目录存在", fs.existsSync(bridgeDir));
if (fs.existsSync(bridgeDir)) {
  const files = fs.readdirSync(bridgeDir);
  check("dsh-bridge/index.mjs 存在", files.includes("index.mjs"), files.join(", "));
  const idx = path.join(bridgeDir, "index.mjs");
  if (fs.existsSync(idx)) {
    const txt = fs.readFileSync(idx, "utf8");
    check("index.mjs 是完整文件（不是占位）", txt.length > 3000, `${txt.length} 字节`);
    check("index.mjs 导出了 runHeadless 与 healthCheck",
      txt.includes("runHeadless") && txt.includes("healthCheck"));
  }
}
const asarPath = path.join(resDir, "app.asar");
check("app.asar 存在", fs.existsSync(asarPath),
  fs.existsSync(asarPath) ? `${(fs.statSync(asarPath).size / 1024 / 1024).toFixed(1)} MB` : "");

// ---- 动态检查：真的启动打包版，看 AI 能不能用 ----
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-packed-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"),
  JSON.stringify({ id: "packed-test", name: "打包测试库" }), "utf8");
fs.writeFileSync(path.join(vault, "素材.md"), "# 素材\n\n这是给 AI 看的素材。\n", "utf8");

console.log("\n  启动打包后的应用…");
const app = await electron.launch({
  executablePath: EXE,
  args: [],
  env: { ...process.env, GEZHI_TEST: "1" },
});
const page = await app.firstWindow();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));

try {
  await page.waitForSelector(".app", { timeout: 40000 });
  check("打包版界面能启动", true);

  await page.waitForFunction(() => Boolean(window.__gezhiTest), { timeout: 20000 });

  // ★ 核心：打包版里 DSH 桥能不能加载、能不能找到 DSH
  const health = await page.evaluate(() => window.gezhi.ai.health());
  check("★ 打包版里能找到 DSH 可执行文件", health.ok === true,
    health.ok ? `路径 ${health.bin}` : String(health.error));

  // 真跑一个任务，确认端到端可用
  console.log("\n  在打包版里让 DSH 干活…");
  const run = await page.evaluate(async ([dir]) => {
    const events = [];
    const off = window.gezhi.ai.onEvent((p) => events.push(p.event));
    try {
      const r = await window.gezhi.ai.run({
        task: "在资料库里新建 打包验证.md，内容写：# 打包验证\n\n打包版 AI 可用。\n\n只调用一次 write。",
        cwd: dir,
      });
      return {
        r,
        types: [...new Set(events.map((e) => e.type))],
        toolCalls: events.filter((e) => e.type === "tool_call").map((e) => ({
          tool: e.tool ?? e.name,
          args: e.args ?? e.input,
          path: e.path,
        })),
        toolResults: events.filter((e) => e.type === "tool_result").map((e) => ({
          tool: e.tool ?? e.name,
          error: e.error ?? null,
          result: typeof (e.result ?? e.output) === "string"
            ? String(e.result ?? e.output).slice(0, 200)
            : JSON.stringify(e.result ?? e.output ?? null).slice(0, 200),
        })),
      };
    } finally { off(); }
  }, [vault]);

  check("★ 打包版里 AI 任务执行成功", run.r.ok === true, run.r.ok ? "" : String(run.r.error));
  check("打包版里事件流正常", run.types.length > 0, run.types.join(", "));
  const created = fs.existsSync(path.join(vault, "打包验证.md"));
  if (!created) {
    // 诊断：把 tool_call 的参数与库目录的实际内容打出来，看它写到哪了
    console.log("\n  [诊断] 库目录实际内容：", fs.readdirSync(vault).join(", "));
    console.log("  [诊断] tool_call 明细：");
    for (const t of run.toolCalls ?? []) console.log("        ", JSON.stringify(t).slice(0, 300));
    console.log("  [诊断] 最终回答：", String(run.r.finalText ?? "").slice(0, 300).replace(/\n/g, " "));
  }
  check("★ 打包版里 AI 真的创建了文件", created,
    created ? fs.readFileSync(path.join(vault, "打包验证.md"), "utf8").slice(0, 40).replace(/\n/g, " ") : "没找到");

  check("打包版渲染进程无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
process.exit(passed === results.length ? 0 : 1);
