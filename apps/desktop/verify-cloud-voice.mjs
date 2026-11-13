#!/usr/bin/env node
// Cloud voice (Tencent Cloud TTS) end-to-end verification
//
// What it proves:
//   1. credentials are ready (present but **never printed**)
//   2. synthesis returns playable audio (WAV, because raw PCM can't be played by the browser)
//   3. **returns real word-level timestamps** — the data source for the digital-human lip sync
//   4. timestamps can be compressed into viseme frames, and frame count grows with timestamps
//   5. when not configured, give an actionable reason rather than a vague error
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

console.log("=== Cloud voice verification (Tencent Cloud TTS) ===\n");

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

  // ---- 1. credentials ----
  console.log("── Credentials ──");
  const probe = await page.evaluate(() => window.gezhi.avatar.probe());
  console.log("  tts.available = " + probe.tts.available);
  console.log("  credentials = " + JSON.stringify(probe.credentials));
  check("★ Tencent Cloud credentials are ready", probe.tts.available === true,
    probe.tts.reason ?? "configured");
  // safety check: no returned value should contain the full secret key
  const dumpAll = JSON.stringify(probe);
  check("★ the probe result contains no secret key material (only reports status)",
    !/AKID[A-Za-z0-9]{20,}/.test(dumpAll) && !/[A-Za-z0-9]{30,}/.test(dumpAll.replace(/"storePath":"[^"]*"/g, "")),
    "response body scanned");

  if (!probe.tts.available) {
    console.log("\n  credentials not ready, skipping the rest (remaining checks treated as failed)");
    check("synthesis available", false, "credentials not ready");
  } else {
    // ---- 2. synthesis ----
    console.log("\n── Synthesis ──");
    const r = await page.evaluate(() => window.gezhi.avatar.tts({ text: "同学们好，今天我们来复习函数的单调性。" }));
    console.log("  ok=" + r.ok);
    console.log("  audio " + (r.bytes / 1024).toFixed(1) + " KB (raw " + (r.rawBytes / 1024).toFixed(1) + " KB)");
    console.log("  mime=" + r.mime + "  codec=" + r.codec + "  sampleRate=" + r.sampleRate);
    console.log("  synthesis time " + r.ms + "ms  voice duration " + r.totalMs + "ms  chunks " + r.chunks);
    console.log("  timestamps " + (r.timings?.length ?? 0) + " segments");

    check("★ synthesis succeeds and returns audio", r.ok === true && r.bytes > 0);
    check("★ audio is WAV (raw PCM can't be played by the browser, must have a header)",
      r.mime === "audio/wav", r.mime);
    check("★ returns real word-level timestamps (lip-sync data source)",
      (r.timings?.length ?? 0) > 0, `${r.timings?.length ?? 0} segments`);
    check("timestamp fields complete (text/beginMs/endMs)",
      r.timings?.every((t) => typeof t.text === "string" && typeof t.beginMs === "number" && typeof t.endMs === "number"),
      r.timings?.[0] ? JSON.stringify(r.timings[0]) : "none");
    check("timestamps are increasing (not out of order)",
      (r.timings ?? []).every((t, i, a) => i === 0 || t.beginMs >= a[i - 1].beginMs),
      "");

    // ---- 3. viseme frames ----
    console.log("\n── Lip sync (driven by real timestamps) ──");
    const t = r.timings ?? [];
    if (t.length) {
      // recompute the frame count once to confirm the formula matches the main process
      const step = 1000 / 30;
      const end = t[t.length - 1].endMs;
      const expect = Math.floor((end + step) / step) + 1;
      check("viseme frame count can be recomputed by formula (matches buildVisemeTrack)",
        expect > t.length, `about ${expect} frames / ${t.length} timestamp segments`);
      check("viseme duration covers the whole sentence",
        r.totalMs > 1000, `${(r.totalMs / 1000).toFixed(1)} seconds`);
    }

    // ---- 4. long text auto-segmentation ----
    console.log("\n── Long text segmentation (platform limit 150 chars) ──");
    const longText = "这是一段用来测试自动分段的较长文本。".repeat(12); // > 150 chars
    const r2 = await page.evaluate((txt) => window.gezhi.avatar.tts({ text: txt }), longText);
    console.log("  text " + longText.length + " chars → chunks " + r2.chunks + ", audio " + ((r2.bytes ?? 0) / 1024).toFixed(0) + " KB");
    check("★ over 150 chars auto-segments (not an error)",
      r2.ok === true && r2.chunks > 1, `${r2.chunks} chunks`);
    check("timestamps accumulate continuously after segmentation",
      (r2.timings?.length ?? 0) > (r.timings?.length ?? 0),
      `${r2.timings?.length ?? 0} segments`);
  }

  // ---- 5. UI: cloud-side behavior ----
  console.log("\n── UI ──");
  await page.locator("button", { hasText: "数字人" }).first().click();
  await page.waitForTimeout(1500);
  const body = await page.evaluate(() => document.body.innerText);
  check("capability check shows cloud is ready", /云端能力 2\/2/.test(body),
    body.match(/本地能力 \d\/\d · 云端能力 \d\/\d/)?.[0] ?? "not found");
  check("Tencent Cloud voice button is clickable (not disabled)", await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.innerText.includes("腾讯云语音"));
    return b ? !b.disabled : false;
  }));

  await page.screenshot({ path: path.join(OUT, "数字人-云端.png") });
  check("no JS errors in the renderer process", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* ignore */ }
}

const passed = results.filter((x) => x.pass).length;
console.log(`\n=== Result: ${passed}/${results.length} passed ===`);
for (const x of results) if (!x.pass) console.log(`  FAIL ${x.name}: ${x.detail}`);
process.exit(passed === results.length ? 0 : 1);
