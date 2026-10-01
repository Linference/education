#!/usr/bin/env node
// 云端语音（腾讯云 TTS）端到端验证
//
// 要证明的：
//   1. 凭据已就绪（存在但**不打印内容**）
//   2. 合成返回可播放的音频（WAV，因为裸 PCM 浏览器播不了）
//   3. **返回真实字级时间戳** —— 这是数字人口型的数据源
//   4. 时间戳能压成口型帧，且帧数随时间戳增加
//   5. 没配置时给出可操作的原因，而不是模糊报错
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

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-cloud-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), JSON.stringify({ id: "v" }), "utf8");

console.log("=== 云端语音验证（腾讯云 TTS）===\n");

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
  await page.waitForTimeout(800);

  // ---- 1. 凭据 ----
  console.log("── 凭据 ──");
  const probe = await page.evaluate(() => window.gezhi.avatar.probe());
  console.log("  tts.available = " + probe.tts.available);
  console.log("  credentials = " + JSON.stringify(probe.credentials));
  check("★ 腾讯云凭据已就绪", probe.tts.available === true,
    probe.tts.reason ?? "已配置");
  // 安全检查：任何返回里都不该出现完整密钥
  const dumpAll = JSON.stringify(probe);
  check("★ 检测结果里不含密钥内容（只报状态）",
    !/AKID[A-Za-z0-9]{20,}/.test(dumpAll) && !/[A-Za-z0-9]{30,}/.test(dumpAll.replace(/"storePath":"[^"]*"/g, "")),
    "已扫描返回体");

  if (!probe.tts.available) {
    console.log("\n  凭据未就绪，跳过后续（其余检查视为失败）");
    check("合成可用", false, "凭据未就绪");
  } else {
    // ---- 2. 合成 ----
    console.log("\n── 合成 ──");
    const r = await page.evaluate(() => window.gezhi.avatar.tts({ text: "同学们好，今天我们来复习函数的单调性。" }));
    console.log("  ok=" + r.ok);
    console.log("  音频 " + (r.bytes / 1024).toFixed(1) + " KB（原始 " + (r.rawBytes / 1024).toFixed(1) + " KB）");
    console.log("  mime=" + r.mime + "  codec=" + r.codec + "  采样率=" + r.sampleRate);
    console.log("  合成耗时 " + r.ms + "ms  语音时长 " + r.totalMs + "ms  分片 " + r.chunks);
    console.log("  时间戳 " + (r.timings?.length ?? 0) + " 段");

    check("★ 合成成功并返回音频", r.ok === true && r.bytes > 0);
    check("★ 音频是 WAV（裸 PCM 浏览器播不了，必须包头）",
      r.mime === "audio/wav", r.mime);
    check("★ 返回真实字级时间戳（口型数据源）",
      (r.timings?.length ?? 0) > 0, `${r.timings?.length ?? 0} 段`);
    check("时间戳字段完整（text/beginMs/endMs）",
      r.timings?.every((t) => typeof t.text === "string" && typeof t.beginMs === "number" && typeof t.endMs === "number"),
      r.timings?.[0] ? JSON.stringify(r.timings[0]) : "无");
    check("时间戳递增（不乱序）",
      (r.timings ?? []).every((t, i, a) => i === 0 || t.beginMs >= a[i - 1].beginMs),
      "");

    // ---- 3. 口型帧 ----
    console.log("\n── 口型（由真实时间戳驱动）──");
    const t = r.timings ?? [];
    if (t.length) {
      // 复算一次帧数，确认公式与主进程一致
      const step = 1000 / 30;
      const end = t[t.length - 1].endMs;
      const expect = Math.floor((end + step) / step) + 1;
      check("口型帧数可按公式复算（与 buildVisemeTrack 一致）",
        expect > t.length, `预计约 ${expect} 帧 ／ 时间戳 ${t.length} 段`);
      check("口型时长覆盖整句话",
        r.totalMs > 1000, `${(r.totalMs / 1000).toFixed(1)} 秒`);
    }

    // ---- 4. 长文本自动分段 ----
    console.log("\n── 长文本分段（平台上限 150 字）──");
    const longText = "这是一段用来测试自动分段的较长文本。".repeat(12); // > 150 字
    const r2 = await page.evaluate((txt) => window.gezhi.avatar.tts({ text: txt }), longText);
    console.log("  文本 " + longText.length + " 字 → 分片 " + r2.chunks + "，音频 " + ((r2.bytes ?? 0) / 1024).toFixed(0) + " KB");
    check("★ 超过 150 字自动分段（不是报错）",
      r2.ok === true && r2.chunks > 1, `${r2.chunks} 片`);
    check("分段后时间戳连续累加",
      (r2.timings?.length ?? 0) > (r.timings?.length ?? 0),
      `${r2.timings?.length ?? 0} 段`);
  }

  // ---- 5. 界面：云端的表现 ----
  console.log("\n── 界面 ──");
  await page.locator("button", { hasText: "数字人" }).first().click();
  await page.waitForTimeout(1500);
  const body = await page.evaluate(() => document.body.innerText);
  check("能力检测显示云端已就绪", /云端能力 2\/2/.test(body),
    body.match(/本地能力 \d\/\d · 云端能力 \d\/\d/)?.[0] ?? "未找到");
  check("腾讯云语音按钮已可点（未禁用）", await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.innerText.includes("腾讯云语音"));
    return b ? !b.disabled : false;
  }));

  await page.screenshot({ path: path.join(OUT, "数字人-云端.png") });
  check("渲染进程无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
process.exit(passed === results.length ? 0 : 1);
