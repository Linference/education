#!/usr/bin/env node
// Gezhi · DSH bridge smoke test
//
// Verifies four things (all points where measurements ran into trouble):
//   1. The dsh executable can be located (must go through the .cmd wrapper)
//   2. The event stream parses correctly and UTF-8 Chinese is not garbled
//   3. A session id can be obtained and the session can be continued
//   4. The Agent really reads and edits files in the controlled directory (tool-call events are observable)
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveDshBin, healthCheck, collectRun, DshSession, parseEventLine } from "./src/index.mjs";

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`  [PASS] ${name}`); }
  catch (e) { failed++; console.log(`  [FAIL] ${name}\n         ${e.message.split("\n")[0]}`); }
}

const bin = resolveDshBin();
console.log("=== Gezhi · DSH bridge smoke test ===");
console.log(`  dsh executable: ${bin}`);
console.log(`  Exists: ${fs.existsSync(bin) ? "yes" : "no (will try PATH)"}`);
console.log("");

// ---------------------------------------------------------------- Pure function tests (no DSH dependency)

check("parseEventLine accepts a normal line", () => {
  const ev = parseEventLine('{"type":"session","sessionId":"s1","cwd":"D:\\\\x"}');
  assert.equal(ev.type, "session");
  assert.equal(ev.sessionId, "s1");
});

check("parseEventLine strips ANSI escapes before parsing (measured: 3 of 30 lines were polluted)", () => {
  const ev = parseEventLine('\u001b[32m{"type":"text","text":"hello"}\u001b[0m');
  assert.equal(ev.type, "text");
  assert.equal(ev.text, "hello");
});

check("parseEventLine returns null for bad lines instead of throwing (lenient parsing)", () => {
  assert.equal(parseEventLine("this is not JSON"), null);
  assert.equal(parseEventLine(""), null);
  assert.equal(parseEventLine('{"no_type":1}'), null);
  assert.equal(parseEventLine("{half"), null);
});

// ---------------------------------------------------------------- Real calls

const health = await healthCheck({ bin });
check("dsh --help works", () => {
  assert.ok(health.ok, `healthCheck failed: code=${health.code} err=${health.error ?? ""}`);
});

if (!health.ok) {
  console.log("\n  dsh is unavailable; skipping cases that require real calls.");
  console.log(`\n=== Result: ${passed} passed / ${failed} failed ===`);
  process.exit(failed === 0 ? 0 : 1);
}

// Create a temporary working directory to act as the "vault"
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-dsh-"));
console.log(`  Temporary working directory: ${cwd}\n`);

// Case: UTF-8 + event types + session id
let run1 = null;
try {
  run1 = await collectRun({ task: "只回答四个字：格致就绪", cwd, bin });
} catch (e) {
  console.log(`  [FAIL] First call failed: ${e.message.split("\n")[0]}`);
  failed++;
}

if (run1) {
  check("Obtained the final text", () => {
    assert.ok(run1.finalText.length > 0, "finalText is empty");
  });

  check("Chinese is not garbled (UTF-8 decoded correctly)", () => {
    // Garbled text typically shows Latin extended/replacement characters instead of Chinese characters
    assert.match(run1.finalText, /[\u4e00-\u9fff]/, `finalText contains no Chinese characters: ${JSON.stringify(run1.finalText.slice(0, 40))}`);
  });

  check("Obtained a session id (needed for continuing the session)", () => {
    assert.match(run1.sessionId ?? "", /^session-/, `sessionId=${run1.sessionId}`);
  });

  check("Obtained token usage (needed for the cost panel)", () => {
    assert.ok(run1.usage, "no usage");
    assert.equal(typeof run1.usage.inputTokens, "number");
    assert.equal(typeof run1.usage.outputTokens, "number");
  });

  check("All status events present (turn_start/step_start/step_end/turn_end)", () => {
    const phases = run1.statuses.map((s) => s.phase);
    for (const need of ["turn_start", "step_start", "step_end", "turn_end"]) {
      assert.ok(phases.includes(need), `missing phase=${need} (actual: ${phases.join(",")})`);
    }
  });

  check("No unparseable lines encountered", () => {
    assert.equal(run1.badLines, 0);
  });

  check("Duration is in a reasonable range (< 60s)", () => {
    assert.ok(run1.durationMs < 60000, `duration ${run1.durationMs}ms`);
  });
}

// Case: let the Agent edit a file in the controlled directory (verifies cwd is the sandbox boundary + tool calls are observable)
console.log("");
const notePath = path.join(cwd, "情态动词.md");
fs.writeFileSync(notePath, "# 情态动词\n\nmust 表示必须。\n\nTODO: 补充 may 的用法。\n", "utf8");

let run2 = null;
try {
  run2 = await collectRun({
    task: "读取当前目录下的 情态动词.md，把 TODO 那一行替换成一句关于 may 的中文说明。只改文件，不要新建文件。",
    cwd,
    bin,
  });
} catch (e) {
  console.log(`  [FAIL] Second call failed: ${e.message.split("\n")[0]}`);
  failed++;
}

if (run2) {
  check("Agent produced tool calls (read/edit)", () => {
    const tools = run2.toolCalls.map((t) => t.tool);
    assert.ok(tools.length > 0, "no tool_call at all");
    assert.ok(tools.includes("read") || tools.includes("edit"), `tool sequence: ${tools.join(",")}`);
  });

  check("Tool-call events carry callId and can be paired with results", () => {
    const callIds = new Set(run2.toolCalls.map((t) => t.callId));
    assert.ok(callIds.size > 0);
    for (const r of run2.toolResults) {
      assert.ok(callIds.has(r.callId), `tool_result callId ${r.callId} has no corresponding tool_call`);
    }
  });

  check("edit events carry old_string / new_string (material for diff previews)", () => {
    const edits = run2.toolCalls.filter((t) => t.tool === "edit");
    if (edits.length === 0) return; // some models use write directly; skip
    const e = edits[0];
    assert.ok("old_string" in e.input || "new_string" in e.input, `edit event input has an unexpected shape: ${JSON.stringify(e.input).slice(0, 120)}`);
  });

  check("The file really was modified", () => {
    const after = fs.readFileSync(notePath, "utf8");
    assert.notEqual(after, "# 情态动词\n\nmust 表示必须。\n\nTODO: 补充 may 的用法。\n", "file content did not change");
  });

  check("No files created outside the vault (sandbox boundary holds)", () => {
    const entries = fs.readdirSync(cwd);
    assert.deepEqual(entries, ["情态动词.md"], `directory gained extra entries: ${entries.join(", ")}`);
  });
}

// Case: continue a session
console.log("");
let sessionOk = false;
try {
  const session = new DshSession({ cwd, sessionId: run1?.sessionId, bin });
  const r = await session.ask("我刚才让你回答的是什么？只回答那四个字。");
  sessionOk = r.finalText.length > 0 && session.sessionId?.startsWith("session-");
  check("Continuing the same session succeeds", () => {
    assert.ok(sessionOk, `continuation result: ${JSON.stringify(r.finalText.slice(0, 60))}`);
  });
  check("Token usage is accumulated", () => {
    assert.ok(session.tokens.input > 0, "tokens.input is 0");
  });
} catch (e) {
  failed++;
  console.log(`  [FAIL] Session continuation failed: ${e.message.split("\n")[0]}`);
}

// Cleanup
try { fs.rmSync(cwd, { recursive: true, force: true }); } catch { /* ignore */ }

console.log("");
console.log(`=== Result: ${passed} passed / ${failed} failed ===`);
process.exit(failed === 0 ? 0 : 1);
