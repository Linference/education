#!/usr/bin/env node
// AI 对话不丢失验证
//
// 用户实测反馈："点一下信息再回来，AI 助手的对话就全没了"。
// 根因：右栏用三元表达式切换，切到「信息」时 AiChat 被**卸载**，
//       React 把它的 state（全部对话）销毁。
//
// 这个测试锁死两条：
//   1. 切到「信息」再切回来，对话还在
//   2. 关掉窗口重开，对话还在（持久化到 localStorage）
//
// 不真跑 AI（要几十秒且花钱）：直接往 localStorage 种一段对话，
// 界面载入后应该显示出来。
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

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-chat-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), JSON.stringify({ id: "chat" }), "utf8");
fs.writeFileSync(path.join(vault, "笔记.md"), "# 笔记\n", "utf8");

/** 种一段对话（模拟用户之前聊过的内容） */
const SEED = {
  msgs: [
    { role: "user", text: "帮我把这篇笔记整理成大纲" },
    {
      role: "assistant",
      text: "好的，我整理成了三级大纲。",
      done: true,
      steps: [{ id: 1, kind: "tool", tool: "read", path: "笔记.md" }],
    },
    { role: "user", text: "再把公式补上" },
    { role: "assistant", text: "已在第二节补充了公式。", done: true },
  ],
  sessionId: "session-seeded-1234",
};

console.log("=== AI 对话不丢失验证 ===\n");

const app = await electron.launch({
  executablePath: path.join(HERE, "node_modules", "electron", "dist", "electron.exe"),
  args: [HERE],
  env: { ...process.env, GEZHI_TEST: "1" },
});
let page = await app.firstWindow();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));

try {
  await page.waitForSelector(".app", { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gezhiTest), { timeout: 20000 });

  // ---- 先种对话到 localStorage，**再刷新页面** ----
  // ⚠️ 顺序很重要：loadPersisted 只在组件挂载时跑一次。
  //    如果在组件已经挂载后才写 localStorage，界面不会重新读 —— 测试会假失败。
  //    第一版就是这么写的，四个断言全挂，看着像功能坏了，其实是测试的时序错了。
  //    这里改成"种数据 → reload → 让组件带着数据重新挂载"。
  await page.evaluate(([key, seed]) => {
    localStorage.setItem(key, JSON.stringify(seed));
  }, [`gezhi.chat.${vault}`, SEED]);
  await page.reload();
  await page.waitForSelector(".app", { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gezhiTest), { timeout: 20000 });

  await page.evaluate((d) => window.__gezhiTest.openVault(d), vault);
  await page.waitForTimeout(900);

  const beforeSwitch = await page.evaluate(() => document.body.innerText);
  check("★ 对话从持久化里载入成功",
    beforeSwitch.includes("帮我把这篇笔记整理成大纲") && beforeSwitch.includes("我整理成了三级大纲"),
    beforeSwitch.includes("帮我把这篇笔记整理成大纲") ? "" : "界面上没看到种下的对话");

  // ---- 切到「信息」再切回「AI 助手」----
  const infoTab = page.locator("button", { hasText: "信息" }).first();
  const aiTab = page.locator("button", { hasText: "AI 助手" }).first();
  check("右栏有「信息」页签", (await infoTab.count()) > 0);
  check("右栏有「AI 助手」页签", (await aiTab.count()) > 0);

  await infoTab.click();
  await page.waitForTimeout(500);
  const onInfo = await page.evaluate(() => document.body.innerText);
  check("切到信息后确实显示信息面板", onInfo.includes("当前文件") || onInfo.includes("打开一个文件后这里显示详情"));

  await aiTab.click();
  await page.waitForTimeout(500);
  const afterSwitch = await page.evaluate(() => document.body.innerText);
  check("★ 切回 AI 助手后对话还在（本轮修的 bug）",
    afterSwitch.includes("帮我把这篇笔记整理成大纲") && afterSwitch.includes("我整理成了三级大纲"),
    afterSwitch.includes("帮我把这篇笔记整理成大纲") ? "" : "★ 对话丢失了");

  check("第二轮问答也还在", afterSwitch.includes("再把公式补上") && afterSwitch.includes("补充了公式"));

  // ---- 反复切几次，确认稳定 ----
  for (let i = 0; i < 3; i++) {
    await infoTab.click();
    await page.waitForTimeout(200);
    await aiTab.click();
    await page.waitForTimeout(200);
  }
  const afterMany = await page.evaluate(() => document.body.innerText);
  check("反复切换 3 次后对话仍完整", afterMany.includes("帮我把这篇笔记整理成大纲"));

  // ---- 关掉窗口重开，验证持久化 ----
  await page.screenshot({ path: path.join(OUT, "ui-chat-persist.png"), clip: { x: 1400, y: 0, width: 500, height: 600 } });
  await app.close();

  const app2 = await electron.launch({
    executablePath: path.join(HERE, "node_modules", "electron", "dist", "electron.exe"),
    args: [HERE],
    env: { ...process.env, GEZHI_TEST: "1" },
  });
  page = await app2.firstWindow();
  try {
    await page.waitForSelector(".app", { timeout: 30000 });
    await page.waitForFunction(() => Boolean(window.__gezhiTest), { timeout: 20000 });
    await page.evaluate((d) => window.__gezhiTest.openVault(d), vault);

    /*
     * ⚠️ 这里必须**显式等待对话渲染出来**，不能用固定 waitForTimeout。
     *
     * 原来写的是 waitForTimeout(1000)，于是偶发失败（时好时坏）。
     * 原因：重新启动应用是**冷启动**，比首次启动慢；
     * 1 秒内 AiChat 还没把 localStorage 里的对话读出来渲染，断言就跑了。
     *
     * 这种偶发失败最误导人 —— 看着像"持久化坏了"，其实功能是好的。
     * 我用完整种子手工复现过两轮：数据一直在磁盘上，界面也一直显示。
     */
    let rendered = false;
    for (let i = 0; i < 60; i++) {
      const seen = await page.evaluate(() =>
        document.body.innerText.includes("帮我把这篇笔记整理成大纲"));
      if (seen) { rendered = true; break; }
      await page.waitForTimeout(250);
    }
    const afterRestart = await page.evaluate(() => document.body.innerText);
    check("★ 重启软件后对话仍在（持久化生效）", rendered,
      rendered ? "" : "等了 15 秒仍未渲染出对话");
    check("重启后两轮问答都完整",
      afterRestart.includes("我整理成了三级大纲") && afterRestart.includes("补充了公式"),
      "");
  } finally {
    await app2.close();
  }

  check("无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  try { await app.close(); } catch { /* 可能已关 */ }
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
process.exit(passed === results.length ? 0 : 1);
