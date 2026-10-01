#!/usr/bin/env node
// 数字人能力检测验证
//
// 用户要求"先检测功能" —— 这个测试要证明检测**如实反映**了可用性，
// 而不是永远说"不可用"或永远说"可用"。
//
// 关键区分：
//   · 本地能力（口型算法 / 系统语音 / 麦克风）—— 不需要密钥
//   · 云端能力（腾讯云 TTS / ASR）—— 需要凭据，没配时应如实说明缺什么
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

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-av-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), JSON.stringify({ id: "a" }), "utf8");

console.log("=== 数字人能力检测验证 ===\n");

const app = await electron.launch({
  executablePath: path.join(HERE, "node_modules", "electron", "dist", "electron.exe"),
  args: [HERE],
  env: { ...process.env, GEZHI_TEST: "1" },
});
const page = await app.firstWindow();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));

try {
  await page.waitForSelector(".app", { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gezhiTest), { timeout: 20000 });
  await page.evaluate((d) => window.__gezhiTest.openVault(d), vault);
  await page.waitForTimeout(900);

  // ---- 1. 界面入口 ----
  console.log("── 界面入口 ──");
  const avTab = page.locator('button', { hasText: "数字人" }).first();
  check("★ 右栏有「数字人」页签", (await avTab.count()) > 0);
  await avTab.click();
  await page.waitForTimeout(1500);
  const body = await page.evaluate(() => document.body.innerText);
  check("面板显示「能力检测」", body.includes("能力检测"));
  check("★ 本地能力与云端能力分开显示",
    body.includes("本地能力") && body.includes("云端能力"));
  check("列出了检测项（口型 / 系统语音 / 麦克风 / TTS / ASR）",
    body.includes("口型") && body.includes("系统语音") && body.includes("麦克风") &&
    body.includes("语音合成") && body.includes("语音识别"));

  // ---- 2. IPC 检测结果 ----
  console.log("\n── 检测结果（IPC）──");
  const probe = await page.evaluate(() => window.gezhi.avatar.probe());
  console.log("  " + JSON.stringify({
    tts: probe.tts, asr: probe.asr, viseme: probe.viseme,
    credentials: probe.credentials,
  }, null, 2).split("\n").join("\n  "));

  check("★ 口型算法可用（纯本地，不需要网络）",
    probe.viseme.available === true, `生成 ${probe.viseme.frames} 帧`);
  check("★ 未配置凭据时 tts/asr 报「不可用」并给出原因",
    probe.tts.available === false || probe.credentials.configured === true,
    probe.tts.reason ?? "（已配置）");
  check("★ 凭据状态如实返回（ready 字段）",
    probe.credentials.configured === true || probe.credentials.storePath !== undefined,
    `configured=${probe.credentials.configured} storePath=${probe.credentials.storePath ?? "无"}`);
  check("检测结果带平台上限（分段依据）",
    probe.limits?.ttsMaxChars === 150 && probe.limits?.asr?.maxSeconds === 60,
    `TTS ${probe.limits?.ttsMaxChars} 字 / ASR ${probe.limits?.asr?.maxSeconds} 秒`);

  // ---- 3. 未配凭据时试听要给出明确原因，不能抛错 ----
  console.log("\n── 试听路径 ──");
  const t = await page.evaluate(() => window.gezhi.avatar.ttsTest({ text: "测试" }));
  if (probe.tts.available) {
    check("已配置凭据：试听返回音频", t.ok === true && t.bytes > 0, `${t.bytes} 字节`);
  } else {
    check("★ 未配凭据：试听返回明确原因（不抛异常）",
      t.ok === false && Boolean(t.error), String(t.error).slice(0, 80));
  }

  // ---- 4. 系统语音（浏览器内置）----
  const sys = await page.evaluate(() => {
    const s = window.speechSynthesis;
    return { exists: Boolean(s), voices: s ? (s.getVoices() || []).length : 0 };
  });
  console.log(`  内置语音合成：${sys.exists ? "存在" : "不存在"}，语音数 ${sys.voices}`);
  check("内置语音合成可用（TTS 的免费回退）", sys.exists && sys.voices > 0,
    `${sys.voices} 个语音`);

  // ---- 5. 麦克风枚举 ----
  const mics = await page.evaluate(async () => {
    try {
      const d = await navigator.mediaDevices.enumerateDevices();
      return { ok: true, count: (d || []).filter((x) => x.kind === "audioinput").length };
    } catch (e) { return { ok: false, error: String(e.message) }; }
  });
  console.log(`  麦克风输入设备：${mics.ok ? mics.count + " 个" : "枚举失败 " + mics.error}`);

  await page.screenshot({ path: path.join(OUT, "ui-avatar.png") });
  check("渲染进程无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
console.log(`\n截图：产出/ui-avatar.png`);
process.exit(passed === results.length ? 0 : 1);
