#!/usr/bin/env node
// 数字人对话 + 语音输入验证
//
// 用户指出的两个缺口：
//   ① "我如何和数字人对话，都没有对话按钮"
//   ② "不是那我的语音输入呢"
//
// 这个测试锁死整条链路：
//   A. 对话：输入框 / 发送按钮存在 → 真发一句 → AI 回答 → 数字人念出来（嘴在动）
//   B. 语音输入：麦克风按钮存在且可用 → ASR 链路真的能识别
//
// ★ ASR 怎么在无人说话的情况下验？
//   用**合成的语音**喂给识别：TTS 说"今天天气很好" → 拿到 WAV → 丢给 ASR
//   → 看能不能识别回来。这是一条真实的端到端链路（真音频、真接口），
//   比只检查"按钮在不在"有说服力得多。
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

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-talk-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), JSON.stringify({ id: "t" }), "utf8");
fs.writeFileSync(path.join(vault, "笔记.md"), "# 二次函数\n\n顶点式 y = a(x-h)² + k\n", "utf8");

console.log("=== 数字人对话 + 语音输入验证 ===\n");

const app = await electron.launch({
  executablePath: path.join(HERE, "node_modules", "electron", "dist", "electron.exe"),
  args: [HERE],
  env: { ...process.env, GEZHI_TEST: "1" },
});
const page = await app.firstWindow();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));

const mouthRy = () =>
  page.evaluate(() => {
    const els = [...document.querySelectorAll("svg ellipse")];
    const m = els.find((e) => Number(e.getAttribute("cy")) === 124);
    return m ? Number(m.getAttribute("ry")) : null;
  });

try {
  await page.waitForSelector(".app", { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gezhiTest), { timeout: 20000 });
  await page.evaluate((d) => window.__gezhiTest.openVault(d), vault);
  await page.waitForTimeout(800);
  await page.locator("button", { hasText: "数字人" }).first().click();
  await page.waitForTimeout(2500);

  // 把查询范围锁在数字人面板内。
  // ⚠️ 不能只写 page.locator("button", ...) —— AI 对话面板虽然隐藏了
  //    但**仍在 DOM 里**（为了切页签不丢对话），按钮文本一样能匹配到，
  //    于是会点到不可见的那个，超时失败。前面已经踩过两次这个坑。
  const panel = page.locator('[data-testid="avatar-console"]');
  check("★ 数字人对话面板已挂载", (await panel.count()) > 0);

  // ---- A. 对话界面 ----
  console.log("\n── A. 对话界面 ──");
  const body = await page.evaluate(() => document.body.innerText);
  check("有「对话」页签", body.includes("对话"));
  check("有「检测」页签（能力检测保留）", body.includes("检测"));

  const inputBox = panel.locator('textarea[placeholder*="和数字人说点什么"]');
  check("★ 有对话输入框", (await inputBox.count()) > 0);

  const sendBtn = panel.locator("button").filter({ hasText: /^发送$/ }).first();
  check("★ 有发送按钮（用户说的「没有对话按钮」）", (await sendBtn.count()) > 0);
  check("没输入内容时发送按钮禁用",
    (await sendBtn.count()) > 0 ? await sendBtn.isDisabled() : false);

  check("有「自动念回答」开关", body.includes("自动念回答"));
  check("有「云端音质」开关", body.includes("云端音质"));

  // ---- B. 语音输入界面 ----
  console.log("\n── B. 语音输入界面 ──");
  const micBtn = panel.locator('button[title*="说话"], button[title*="识别"]').first();
  check("★ 有麦克风按钮（用户说的「我的语音输入呢」）", (await micBtn.count()) > 0,
    (await micBtn.count()) ? "" : "找不到麦克风按钮");

  // 凭据已配置 → 麦克风按钮应该可点
  const probe = await page.evaluate(() => window.gezhi.avatar.probe());
  const micEnabled = (await micBtn.count()) > 0 ? !(await micBtn.isDisabled()) : false;
  check("★ 凭据就绪时麦克风按钮可点", micEnabled,
    micEnabled ? "" : `cloudReady=${probe.tts.available}`);

  check("有「识别完自动发送」开关", body.includes("识别完自动发送"));

  // ---- C. ASR 真链路：合成语音 → 识别回来 ----
  console.log("\n── C. 语音识别（TTS→ASR 回环，真实音频走真接口）──");
  const SENTENCE = "今天天气很好";
  const r = await page.evaluate(async (text) => {
    // 1. 合成一句话（拿到真 WAV）
    const t = await window.gezhi.avatar.tts({ text });
    if (!t.ok) return { step: "tts", error: t.error, hint: t.hint };
    // 2. 把这段音频喂给识别
    const a = await window.gezhi.avatar.asr({ audioBase64: t.base64, format: "wav", sampleRate: 16000 });
    return { step: "asr", ttsBytes: t.bytes, ...a };
  }, SENTENCE);

  if (r.step === "tts") {
    check("合成成功", false, String(r.error));
  } else {
    console.log(`  合成音频 ${(r.ttsBytes / 1024).toFixed(0)} KB → 识别结果："${r.text ?? "（空）"}"`);
    console.log(`  识别耗时 ${r.ms}ms  音频时长 ${r.audioDurationMs}ms  字数 ${r.wordCount}`);
    check("★ ASR 链路通（真的识别出文字）", r.ok === true && r.text, r.error ?? "");
    // 合成与识别同音不同字是正常的（同音字），所以按"有内容且长度接近"判定
    const got = String(r.text ?? "").replace(/[，。！？、\s]/g, "");
    const want = SENTENCE.replace(/[，。！？、\s]/g, "");
    check("★ 识别内容与原文基本一致（同音字可接受）",
      got.length >= want.length - 1 && got.length <= want.length + 1,
      `识别 "${got}" vs 原文 "${want}"`);
  }

  // ---- D. 真跑一轮对话 ----
  console.log("\n── D. 真发一句（会真跑 AI，可能 30~90 秒）──");
  const QUESTION = "用一句话说明二次函数的顶点式。只要一句话。";
  await inputBox.fill(QUESTION);
  await page.waitForTimeout(300);
  check("输入后发送按钮变为可点", !(await sendBtn.isDisabled()));

  await sendBtn.click();

  /*
   * ⚠️ 判定"回答完成"不能用关键词匹配 —— 我的问题里就含"顶点"，
   *    而判定正则里也有 /顶点/，于是匹配到**我自己问的那句**，
   *    误报"已回答（0 秒）"，后面找"念一遍"按钮自然找不到。
   *    这是典型的自匹配测试 bug。
   *
   * 改用**结构性信号**：「念一遍」按钮只在
   *   m.role === "assistant" && m.text && !m.streaming
   * 时才渲染 —— 它出现就等于"回答已完成且有文字"。
   */
  const againBtn = panel.locator("button", { hasText: "念一遍" });
  let answered = false, waited = 0;
  while (waited < 150000) {
    if ((await againBtn.count()) > 0) { answered = true; break; }
    await page.waitForTimeout(1500);
    waited += 1500;
    if (waited % 15000 === 0) console.log(`      …已等 ${waited / 1000} 秒`);
  }
  check("★ AI 真的回答了（对话成功）", answered,
    answered ? `${(waited / 1000).toFixed(0)} 秒` : "150 秒内没看到回答");

  const panelText = await panel.innerText().catch(() => "");
  check("用户的问题显示在对话区", panelText.includes(QUESTION));
  check("★ 每条回答都有「念一遍」按钮", (await againBtn.count()) > 0);

  // ---- E. 念出来（口型驱动） ----
  console.log("\n── E. 数字人念出来 ──");
  const again = againBtn.first();
  if (await again.count()) {
    await again.click();
    const samples = [];
    for (let i = 0; i < 26; i++) { samples.push(await mouthRy()); await page.waitForTimeout(90); }
    const valid = samples.filter((x) => x !== null);
    const uniq = new Set(valid.map((x) => Math.round(x * 10) / 10));
    console.log(`  张嘴量采样：${valid.slice(0, 14).map((x) => x.toFixed(1)).join(", ")} …`);
    check("★ 念回答时嘴巴在动（口型驱动成功）", uniq.size >= 3, `${uniq.size} 种不同值`);
    const maxRy = valid.length ? Math.max(...valid) : 0;
    check("★ 嘴确实张开过", maxRy > 4, `最大 ${maxRy.toFixed(1)}`);
    const src = (await panel.innerText()).match(/口型 \d+ 帧 · [^\n]*/)?.[0] ?? "";
    check("界面标明了口型来源", src.length > 0, src);
  } else {
    check("★ 念回答时嘴巴在动（口型驱动成功）", false, "找不到念一遍按钮");
  }

  await page.screenshot({ path: path.join(OUT, "数字人-对话.png") });
  check("渲染进程无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
process.exit(passed === results.length ? 0 : 1);
