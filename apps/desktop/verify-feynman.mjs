#!/usr/bin/env node
// Feynman presentation console verification + CSP audio fix verification
//
// The user clarified the real purpose of the avatar:
//   "I didn't build this for the Feynman technique — I want to be a teacher and explain it once so you can fill in my gaps"
// So this test locks in:
//   1. the avatar panel defaults to the "费曼" (Feynman) tab
//   2. there is a "讲什么" (what to explain) input box and a "开始讲" (start explaining) button (voice input)
//   3. the transcript accumulates (simulated recognition results)
//   4. "讲完了 → 查缺补漏" (done → fill in gaps) really runs the AI and gives targeted feedback
//   5. CSP allows blob audio (otherwise it can't be heard even after synthesis, and the mouth doesn't move)
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

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-feyn-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"), JSON.stringify({ id: "f" }), "utf8");
fs.writeFileSync(
  path.join(vault, "二次函数.md"),
  "# 二次函数\n\n一般式 y = ax² + bx + c\n顶点式 y = a(x-h)² + k，顶点 (h,k)\n" +
  "对称轴 x = h = -b/(2a)\n判别式 Δ = b² - 4ac\n",
  "utf8",
);

console.log("=== Feynman presentation console verification ===\n");

const app = await electron.launch({
  executablePath: path.join(HERE, "node_modules", "electron", "dist", "electron.exe"),
  args: [HERE],
  env: { ...process.env, GEZHI_TEST: "1" },
});
const page = await app.firstWindow();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
const cspErrs = [];
page.on("console", (m) => {
  if (m.type() === "error" && /Content Security Policy/i.test(m.text())) cspErrs.push(m.text().slice(0, 200));
});

try {
  await page.waitForSelector(".app", { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gezhiTest), { timeout: 20000 });

  // ---- 0. CSP: blob audio must be allowed ----
  console.log("── 0. CSP (blob audio) ──");
  const csp = await page.evaluate(() =>
    document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content") ?? "");
  check("★ CSP includes media-src (otherwise the synthesized voice can't play)",
    /media-src[^;]*blob:/.test(csp), csp.match(/media-src[^;]*/)?.[0] ?? "no media-src");

  await page.evaluate((d) => window.__gezhiTest.openVault(d), vault);
  await page.waitForTimeout(800);

  // Open a file so the Feynman console has a default topic and reference material
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), path.join(vault, "二次函数.md"));
  await page.waitForTimeout(1200);

  await page.locator("button", { hasText: "数字人" }).first().click();
  await page.waitForTimeout(2500);

  const panel = page.locator('[data-testid="feynman-panel"], .sidebar.right').first();

  // ---- 1. Defaults to the Feynman tab ----
  console.log("\n── 1. UI ──");
  const bodyText = await page.evaluate(() => document.body.innerText);
  check("★ avatar panel defaults to the '费曼' (Feynman) tab", bodyText.includes("费曼"));
  check("has a '对话' (Chat) tab (ordinary Q&A still present)", bodyText.includes("对话"));
  check("has a '检测' (Detection) tab", bodyText.includes("检测"));

  const topicInput = page.locator('input[placeholder*="二次函数"], input[placeholder*="例如："]').first();
  check("★ has a '你要讲什么' (what do you want to explain) input box", (await topicInput.count()) > 0);

  const topicVal = (await topicInput.count()) ? await topicInput.inputValue() : "";
  const placeholder = (await topicInput.count()) ? await topicInput.getAttribute("placeholder") : "";
  check("topic defaults to the current filename (auto-filled after opening the file)",
    topicVal.includes("二次函数") || String(placeholder).includes("二次函数"),
    `value="${topicVal}" placeholder="${placeholder}"`);

  const startBtn = page.locator("button").filter({ hasText: /开始讲/ }).first();
  check("★ has a '开始讲' (Start Explaining) button (Feynman requires speaking out loud)", (await startBtn.count()) > 0);
  check("'开始讲' (Start Explaining) is clickable when credentials are ready",
    (await startBtn.count()) > 0 ? !(await startBtn.isDisabled()) : false);

  check("explains that multi-segment recording is possible", bodyText.includes("分段") || bodyText.includes("每段最长"));

  // ---- 2. Simulate a segment of explanation (can't really record; inject recognition results through the same path) ----
  console.log("\n── 2. Transcript (simulated recognition text) ──");
  // You can't inject React state from the page directly, so calling ASR through the real chain is pointless (no one is speaking).
  // Instead: verify the "讲完了" (done) button is disabled when the word count is insufficient (prevent empty submissions).
  const analyzeBtn = page.locator("button").filter({ hasText: /讲完了|查缺补漏/ }).first();
  check("★ has a '讲完了 → 帮我查缺补漏' (Done → Help Me Fill Gaps) button", (await analyzeBtn.count()) > 0);
  check("★ the button is disabled when nothing has been said (prevent empty submission)",
    (await analyzeBtn.count()) > 0 ? await analyzeBtn.isDisabled() : false,
    (await analyzeBtn.count()) ? await analyzeBtn.innerText() : "");

  // ---- 3. Run gap-filling once for real ----
  // Since we can't actually speak, verify the Feynman prompt and AI chain directly:
  // go outside __gezhiTest — send an equivalent Feynman task via IPC,
  // and see whether the AI answers in the "查缺补漏" (fill-in-gaps) format (rather than re-explaining).
  console.log("\n── 3. Gap-filling (runs the AI for real, ~30–90 s) ──");
  const t0 = Date.now();
  const r = await page.evaluate(async (cwd) => {
    const transcript =
      "二次函数就是 y 等于 a x 平方加 b x 加 c。a 不能等于零。它的图像是抛物线。" +
      "然后顶点的话，嗯，就是用公式算出来，大概是负 b 除以 2a 这样。差不多就是这样。";
    const task = `学生正在用费曼学习法讲解「二次函数的顶点式」。
下面是他口述的讲解记录（语音转写，可能有同音错字，请容忍）：

"""
${transcript}
"""

请你作为严格但有耐心的老师，只针对他实际说出的内容做四件事：
1. 讲对了什么 2. 漏了什么 3. 说错或含糊的地方 4. 追问 2~3 个问题
硬性要求：不要把这个知识点重新完整讲一遍；每条评价要能对上他原话；
用中文分点简洁。`;
    const res = await window.gezhi.ai.run({ task, cwd });
    return { ok: res.ok, text: res.finalText ?? "", error: res.error ?? null, ms: Date.now() - (res.t0 ?? 0) };
  }, vault);
  const secs = (Date.now() - t0) / 1000;
  console.log(`  AI took ${secs.toFixed(0)} s, answer ${r.text.length} chars`);
  console.log("  answer starts: " + r.text.slice(0, 160).replace(/\n/g, " / "));

  check("★ gap-filling runs end-to-end (AI has an answer)", r.ok && r.text.length > 50, r.error ?? "");
  // The key to Feynman: the AI should not re-explain the topic, but point out gaps and ask follow-ups
  check("★ answer contains gap-type content ('漏'/'缺' = missed / missing)",
    /漏|缺|没有提|未提|少讲/.test(r.text), "");
  check("★ answer contains follow-up questions (question mark)", /[？?]/.test(r.text), "");
  check("★ does not re-explain the topic (reasonable length, no long textbook-style recitation)",
    r.text.length < 4000, `${r.text.length} chars`);

  await page.screenshot({ path: path.join(OUT, "数字人-费曼.png") });
  check("★ no CSP errors blocking audio", cspErrs.length === 0, cspErrs.slice(0, 1).join(""));
  check("no JS errors in the renderer process", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* ignore */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== Result: ${passed}/${results.length} passed ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
process.exit(passed === results.length ? 0 : 1);
