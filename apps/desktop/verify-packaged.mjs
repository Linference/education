#!/usr/bin/env node
// Verify that AI still works in the **packaged** app
//
// Why it must be tested separately: in dev, ai.cjs imports dsh-bridge from a repo path;
// after packaging that path doesn't exist (code is inside app.asar), so it must be placed
// into resources/dsh-bridge via extraResources. If this step is missed, dev mode works fine,
// but after installing, users find the AI panel says "DSH 不可用" (DSH unavailable) — the hardest kind of bug to catch.
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

console.log("=== packaged AI kernel verification ===\n");

if (!fs.existsSync(EXE)) {
  console.error("packaged build not found:", EXE);
  console.error("run node scripts/build-installer.mjs first");
  process.exit(1);
}

// ---- static check: whether dsh-bridge really got packed into resources ----
const resDir = path.join(PACKED, "resources");
const bridgeDir = path.join(resDir, "dsh-bridge");
check("resources/dsh-bridge directory exists", fs.existsSync(bridgeDir));
if (fs.existsSync(bridgeDir)) {
  const files = fs.readdirSync(bridgeDir);
  check("dsh-bridge/index.mjs exists", files.includes("index.mjs"), files.join(", "));
  const idx = path.join(bridgeDir, "index.mjs");
  if (fs.existsSync(idx)) {
    const txt = fs.readFileSync(idx, "utf8");
    check("index.mjs is a full file (not a placeholder)", txt.length > 3000, `${txt.length} bytes`);
    check("index.mjs exports runHeadless and healthCheck",
      txt.includes("runHeadless") && txt.includes("healthCheck"));
  }
}
const asarPath = path.join(resDir, "app.asar");
check("app.asar exists", fs.existsSync(asarPath),
  fs.existsSync(asarPath) ? `${(fs.statSync(asarPath).size / 1024 / 1024).toFixed(1)} MB` : "");

// ---- dynamic check: actually launch the packaged build and see if AI works ----
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-packed-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"),
  JSON.stringify({ id: "packed-test", name: "打包测试库" }), "utf8");
fs.writeFileSync(path.join(vault, "素材.md"), "# 素材\n\n这是给 AI 看的素材。\n", "utf8");

console.log("\n  launching the packaged app…");
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
  check("packaged UI can start", true);

  await page.waitForFunction(() => Boolean(window.__gezhiTest), { timeout: 20000 });

  // ★ core: can the DSH bridge load in the packaged build, and can it find DSH
  const health = await page.evaluate(() => window.gezhi.ai.health());
  check("★ packaged build can find the DSH executable", health.ok === true,
    health.ok ? `path ${health.bin}` : String(health.error));

  // actually run a task to confirm end-to-end usability
  console.log("\n  making DSH do work in the packaged build…");
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

  check("★ AI task executed successfully in the packaged build", run.r.ok === true, run.r.ok ? "" : String(run.r.error));
  check("event stream is normal in the packaged build", run.types.length > 0, run.types.join(", "));
  const created = fs.existsSync(path.join(vault, "打包验证.md"));
  if (!created) {
    // diagnostics: print the tool_call args and the actual vault contents to see where it wrote
    console.log("\n  [diagnostics] actual vault contents:", fs.readdirSync(vault).join(", "));
    console.log("  [diagnostics] tool_call details:");
    for (const t of run.toolCalls ?? []) console.log("        ", JSON.stringify(t).slice(0, 300));
    console.log("  [diagnostics] final answer:", String(run.r.finalText ?? "").slice(0, 300).replace(/\n/g, " "));
  }
  check("★ AI really created the file in the packaged build", created,
    created ? fs.readFileSync(path.join(vault, "打包验证.md"), "utf8").slice(0, 40).replace(/\n/g, " ") : "not found");

  check("packaged renderer process has no JS errors", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* ignore */ }
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== result: ${passed}/${results.length} passed ===`);
for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
process.exit(passed === results.length ? 0 : 1);
