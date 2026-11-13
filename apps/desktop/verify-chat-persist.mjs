#!/usr/bin/env node
// AI conversation persistence verification
//
// User-reported bug: "click the info tab and come back, and the AI assistant's conversation is all gone".
// Root cause: the right rail switches with a ternary; when switching to '信息' (Info), AiChat is **unmounted**,
//       and React destroys its state (the whole conversation).
//
// This test locks in two things:
//   1. switch to '信息' (Info) and back, the conversation is still there
//   2. close and reopen the window, the conversation is still there (persisted to localStorage)
//
// Don't actually run AI (takes tens of seconds and costs money): seed a conversation into localStorage,
// and the UI should display it after loading.
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

/** Seed a conversation (simulating what the user chatted before) */
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

console.log("=== AI conversation persistence verification ===\n");

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

  // ---- first seed the conversation into localStorage, **then reload the page** ----
  // ⚠️ Order matters: loadPersisted only runs once when the component mounts.
  //    If you write localStorage after the component has already mounted, the UI won't re-read it — the test would fail falsely.
  //    The first version was written this way: all four assertions failed, looking like a broken feature when it was actually a test timing mistake.
  //    Changed here to "seed data → reload → let the component remount with the data".
  await page.evaluate(([key, seed]) => {
    localStorage.setItem(key, JSON.stringify(seed));
  }, [`gezhi.chat.${vault}`, SEED]);
  await page.reload();
  await page.waitForSelector(".app", { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gezhiTest), { timeout: 20000 });

  await page.evaluate((d) => window.__gezhiTest.openVault(d), vault);
  await page.waitForTimeout(900);

  const beforeSwitch = await page.evaluate(() => document.body.innerText);
  check("★ conversation loads successfully from persistence",
    beforeSwitch.includes("帮我把这篇笔记整理成大纲") && beforeSwitch.includes("我整理成了三级大纲"),
    beforeSwitch.includes("帮我把这篇笔记整理成大纲") ? "" : "seeded conversation not visible in the UI");

  // ---- switch to '信息' (Info) then back to 'AI 助手' (AI Assistant) ----
  const infoTab = page.locator("button", { hasText: "信息" }).first();
  const aiTab = page.locator("button", { hasText: "AI 助手" }).first();
  check("right rail shows the '信息' (Info) tab", (await infoTab.count()) > 0);
  check("right rail shows the 'AI 助手' (AI Assistant) tab", (await aiTab.count()) > 0);

  await infoTab.click();
  await page.waitForTimeout(500);
  const onInfo = await page.evaluate(() => document.body.innerText);
  check("after switching to Info it actually shows the info panel", onInfo.includes("当前文件") || onInfo.includes("打开一个文件后这里显示详情"));

  await aiTab.click();
  await page.waitForTimeout(500);
  const afterSwitch = await page.evaluate(() => document.body.innerText);
  check("★ conversation is still there after switching back to AI Assistant (the bug fixed this round)",
    afterSwitch.includes("帮我把这篇笔记整理成大纲") && afterSwitch.includes("我整理成了三级大纲"),
    afterSwitch.includes("帮我把这篇笔记整理成大纲") ? "" : "★ conversation lost");

  check("the second round of Q&A is also still there", afterSwitch.includes("再把公式补上") && afterSwitch.includes("补充了公式"));

  // ---- switch back and forth a few times to confirm stability ----
  for (let i = 0; i < 3; i++) {
    await infoTab.click();
    await page.waitForTimeout(200);
    await aiTab.click();
    await page.waitForTimeout(200);
  }
  const afterMany = await page.evaluate(() => document.body.innerText);
  check("conversation is still intact after 3 switches", afterMany.includes("帮我把这篇笔记整理成大纲"));

  // ---- close the window and reopen to verify persistence ----
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
     * ⚠️ Here we must **explicitly wait for the conversation to render**, not use a fixed waitForTimeout.
     *
     * The original wrote waitForTimeout(1000), causing occasional flaky failures (sometimes passes, sometimes fails).
     * Reason: restarting the app is a **cold start**, slower than first launch;
     * within 1 second AiChat hasn't yet read the conversation out of localStorage and rendered it, so the assertion runs too early.
     *
     * This kind of flaky failure is the most misleading — it looks like "persistence is broken" when the feature is actually fine.
     * I reproduced it twice by hand with the full seed: the data stays on disk, and the UI keeps showing it.
     */
    let rendered = false;
    for (let i = 0; i < 60; i++) {
      const seen = await page.evaluate(() =>
        document.body.innerText.includes("帮我把这篇笔记整理成大纲"));
      if (seen) { rendered = true; break; }
      await page.waitForTimeout(250);
    }
    const afterRestart = await page.evaluate(() => document.body.innerText);
    check("★ conversation still there after restarting the app (persistence works)", rendered,
      rendered ? "" : "conversation still not rendered after 15 seconds");
    check("both rounds of Q&A complete after restart",
      afterRestart.includes("我整理成了三级大纲") && afterRestart.includes("补充了公式"),
      "");
  } finally {
    await app2.close();
  }

  check("no JS errors", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  try { await app.close(); } catch { /* may already be closed */ }
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* ignore */ }
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== Result: ${passed}/${results.length} passed ===`);
for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
process.exit(passed === results.length ? 0 : 1);
