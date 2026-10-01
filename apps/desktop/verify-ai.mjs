#!/usr/bin/env node
// 验证：DeepSeek Harness 是否真的接进了界面
//
// 这个测试要回答的核心问题：**点发送之后，AI 到底动没动？**
// 所以它不看"有没有 AI 面板"，而是：
//   1. preload 暴露的 ai API 是否可用
//   2. ai:health 能否找到 DSH 可执行文件
//   3. 真发一个任务，**事件流有没有推回来**（thinking / tool_call / final）
//   4. AI 是否真的在库目录里创建了文件（证明沙箱边界 = 库边界）
import { _electron as electron } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "..", "..", "产出");
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, pass: Boolean(ok), detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? "  " + detail : ""}`);
}

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-ai-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"),
  JSON.stringify({ schemaVersion: 1, id: "ai-test", name: "AI 测试库" }, null, 2), "utf8");
// 给 AI 一点素材
fs.writeFileSync(path.join(vault, "英语笔记.md"),
  "# 英语笔记\n\n## 情态动词\n\nmust 表示必须。\nmay 表示可能。\n\n## 时态\n\n一般现在时表示习惯。\n", "utf8");

console.log("=== DeepSeek Harness 集成验证 ===");
console.log(`  测试库：${vault}\n`);

const app = await electron.launch({
  executablePath: path.join(HERE, "node_modules", "electron", "dist", "electron.exe"),
  args: [HERE],
  env: { ...process.env, GEZHI_TEST: "1" },
});
const page = await app.firstWindow();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

try {
  await page.waitForSelector(".app", { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gezhiTest), { timeout: 20000 });

  // ---- 1. API 是否存在 ----
  const apiShape = await page.evaluate(() => ({
    hasAi: Boolean(window.gezhi.ai),
    hasRun: typeof window.gezhi.ai?.run === "function",
    hasHealth: typeof window.gezhi.ai?.health === "function",
    hasOnEvent: typeof window.gezhi.ai?.onEvent === "function",
  }));
  check("preload 暴露了 ai API", apiShape.hasAi && apiShape.hasRun && apiShape.hasHealth && apiShape.hasOnEvent,
    JSON.stringify(apiShape));

  // ---- 2. DSH 健康检查 ----
  const health = await page.evaluate(() => window.gezhi.ai.health());
  check("★ 能找到 DeepSeek Harness 可执行文件", health.ok === true,
    health.ok ? `版本 ${health.version ?? "未知"}` : String(health.error));
  if (health.bin) console.log(`       路径：${health.bin}`);

  // ---- 3. 界面上的 AI 面板 ----
  await page.evaluate((d) => window.__gezhiTest.openVault(d), vault);
  await page.waitForTimeout(500);
  const hasPanel = await page.locator("text=AI 助手").count();
  check("右栏有「AI 助手」页签", hasPanel > 0);
  const hasComposer = await page.locator("textarea").count();
  check("有输入框", hasComposer > 0);

  // ---- 4. 真发一个任务，看事件流 ----
  // 在渲染进程里直接订阅事件，同时通过 API 发任务 —— 这样能确认
  // "事件确实从主进程流到了渲染进程"，而不是只拿到最终返回值。
  console.log("\n  正在让 DSH 干活（可能要 30-90 秒）…");
  const runResult = await page.evaluate(async (dir) => {
    const events = [];
    const off = window.gezhi.ai.onEvent((p) => events.push(p.event));
    try {
      const r = await window.gezhi.ai.run({
        task: "在这个资料库里新建一个文件 摘要.md，内容写：# 摘要\n\n本库包含英语笔记，重点是情态动词。\n\n只用一次 write 工具，不要做别的事。",
        cwd: dir,
      });
      return { r, events };
    } finally {
      off();
    }
  }, vault);

  const evTypes = [...new Set(runResult.events.map((e) => e.type))];
  console.log(`       收到 ${runResult.events.length} 个事件，类型：${evTypes.join(", ")}`);
  check("★ AI 任务执行成功", runResult.r.ok === true, runResult.r.ok ? "" : String(runResult.r.error));
  check("★ 事件流推到了渲染进程（不是只有最终结果）", runResult.events.length > 0,
    `${runResult.events.length} 个`);
  check("事件里含 session（会话 id，续聊要用）", evTypes.includes("session"),
    runResult.r.sessionId ? String(runResult.r.sessionId).slice(0, 20) : "无");
  check("事件里含 tool_call（能看到 AI 在用什么工具）", evTypes.includes("tool_call"),
    JSON.stringify(runResult.events.filter((e) => e.type === "tool_call").map((e) => e.tool ?? e.name).slice(0, 3)));
  check("事件里含 final（最终回答）", evTypes.includes("final"));
  check("拿到了 token 用量", Boolean(runResult.r.tokens),
    runResult.r.tokens ? `${runResult.r.tokens.input} 入 / ${runResult.r.tokens.output} 出` : "无");

  // ---- 5. AI 真的在库目录里动了文件吗 ----
  const created = fs.existsSync(path.join(vault, "摘要.md"));
  check("★ AI 真的在库目录里创建了文件（沙箱边界 = 库边界）", created,
    created ? fs.readFileSync(path.join(vault, "摘要.md"), "utf8").slice(0, 40).replace(/\n/g, " ") : "没找到 摘要.md");

  // 确认没有在库外乱写
  const repoRoot = path.resolve(HERE, "..", "..");
  const sneaky = ["摘要.md", "摘要.md.txt"].filter((f) => fs.existsSync(path.join(repoRoot, f)));
  check("没有写到仓库根目录（沙箱边界成立）", sneaky.length === 0, sneaky.join(", "));

  check("渲染进程无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));

  await page.screenshot({ path: path.join(OUT, "ui-ai.png") });
  console.log(`\n  截图：${path.relative(process.cwd(), path.join(OUT, "ui-ai.png"))}`);
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
process.exit(passed === results.length ? 0 : 1);
