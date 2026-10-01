#!/usr/bin/env node
// 格致 · DSH 桥冒烟测试
//
// 验证四件事（都是实测里踩过坑的点）：
//   1. 能定位到 dsh 可执行文件（必须走 .cmd 包装器）
//   2. 事件流能正常解析，UTF-8 中文不乱码
//   3. 会话 id 能拿到，并且可以续聊
//   4. Agent 真的会在受控目录里读改文件（工具调用事件可观测）
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
console.log("=== 格致 · DSH 桥冒烟测试 ===");
console.log(`  dsh 可执行文件：${bin}`);
console.log(`  存在性：${fs.existsSync(bin) ? "是" : "否（将尝试 PATH）"}`);
console.log("");

// ---------------------------------------------------------------- 纯函数测试（不依赖 DSH）

check("parseEventLine 能吃正常行", () => {
  const ev = parseEventLine('{"type":"session","sessionId":"s1","cwd":"D:\\\\x"}');
  assert.equal(ev.type, "session");
  assert.equal(ev.sessionId, "s1");
});

check("parseEventLine 能剥掉 ANSI 转义再解析（实测里 30 行有 3 行被污染）", () => {
  const ev = parseEventLine('\u001b[32m{"type":"text","text":"你好"}\u001b[0m');
  assert.equal(ev.type, "text");
  assert.equal(ev.text, "你好");
});

check("parseEventLine 对坏行返回 null 而不抛（宽容解析）", () => {
  assert.equal(parseEventLine("这不是 JSON"), null);
  assert.equal(parseEventLine(""), null);
  assert.equal(parseEventLine('{"no_type":1}'), null);
  assert.equal(parseEventLine("{半截"), null);
});

// ---------------------------------------------------------------- 真实调用

const health = await healthCheck({ bin });
check("dsh --help 可用", () => {
  assert.ok(health.ok, `healthCheck 失败：code=${health.code} err=${health.error ?? ""}`);
});

if (!health.ok) {
  console.log("\n  dsh 不可用，跳过需要真实调用的用例。");
  console.log(`\n=== 结果：${passed} 通过 / ${failed} 失败 ===`);
  process.exit(failed === 0 ? 0 : 1);
}

// 建一个临时工作目录当"库"
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-dsh-"));
console.log(`  临时工作目录：${cwd}\n`);

// 用例：UTF-8 + 事件类型 + 会话 id
let run1 = null;
try {
  run1 = await collectRun({ task: "只回答四个字：格致就绪", cwd, bin });
} catch (e) {
  console.log(`  [FAIL] 第一次调用失败：${e.message.split("\n")[0]}`);
  failed++;
}

if (run1) {
  check("拿到最终的 final 文本", () => {
    assert.ok(run1.finalText.length > 0, "finalText 为空");
  });

  check("中文没有乱码（UTF-8 解码正确）", () => {
    // 乱码的典型特征是出现拉丁扩展/替代字符而不是汉字
    assert.match(run1.finalText, /[\u4e00-\u9fff]/, `finalText 里没有汉字：${JSON.stringify(run1.finalText.slice(0, 40))}`);
  });

  check("拿到了会话 id（续聊要用）", () => {
    assert.match(run1.sessionId ?? "", /^session-/, `sessionId=${run1.sessionId}`);
  });

  check("拿到了 token 用量（成本面板要用）", () => {
    assert.ok(run1.usage, "没有 usage");
    assert.equal(typeof run1.usage.inputTokens, "number");
    assert.equal(typeof run1.usage.outputTokens, "number");
  });

  check("status 事件齐全（turn_start/step_start/step_end/turn_end）", () => {
    const phases = run1.statuses.map((s) => s.phase);
    for (const need of ["turn_start", "step_start", "step_end", "turn_end"]) {
      assert.ok(phases.includes(need), `缺 phase=${need}（实际：${phases.join(",")}）`);
    }
  });

  check("未遇到无法解析的行", () => {
    assert.equal(run1.badLines, 0);
  });

  check("耗时在合理范围（< 60s）", () => {
    assert.ok(run1.durationMs < 60000, `耗时 ${run1.durationMs}ms`);
  });
}

// 用例：让 Agent 在受控目录里改文件（验证 cwd 就是沙箱边界 + 工具调用可观测）
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
  console.log(`  [FAIL] 第二次调用失败：${e.message.split("\n")[0]}`);
  failed++;
}

if (run2) {
  check("Agent 产生了工具调用（read/edit）", () => {
    const tools = run2.toolCalls.map((t) => t.tool);
    assert.ok(tools.length > 0, "没有任何 tool_call");
    assert.ok(tools.includes("read") || tools.includes("edit"), `工具序列：${tools.join(",")}`);
  });

  check("工具调用事件带 callId，可与结果配对", () => {
    const callIds = new Set(run2.toolCalls.map((t) => t.callId));
    assert.ok(callIds.size > 0);
    for (const r of run2.toolResults) {
      assert.ok(callIds.has(r.callId), `tool_result 的 callId ${r.callId} 没有对应的 tool_call`);
    }
  });

  check("edit 事件带 old_string / new_string（diff 预览的素材）", () => {
    const edits = run2.toolCalls.filter((t) => t.tool === "edit");
    if (edits.length === 0) return; // 有的模型会直接用 write，跳过
    const e = edits[0];
    assert.ok("old_string" in e.input || "new_string" in e.input, `edit 事件的 input 结构不符：${JSON.stringify(e.input).slice(0, 120)}`);
  });

  check("文件确实被改动了", () => {
    const after = fs.readFileSync(notePath, "utf8");
    assert.notEqual(after, "# 情态动词\n\nmust 表示必须。\n\nTODO: 补充 may 的用法。\n", "文件内容没变");
  });

  check("没有在库外创建文件（沙箱边界成立）", () => {
    const entries = fs.readdirSync(cwd);
    assert.deepEqual(entries, ["情态动词.md"], `目录里多了东西：${entries.join(", ")}`);
  });
}

// 用例：会话续聊
console.log("");
let sessionOk = false;
try {
  const session = new DshSession({ cwd, sessionId: run1?.sessionId, bin });
  const r = await session.ask("我刚才让你回答的是什么？只回答那四个字。");
  sessionOk = r.finalText.length > 0 && session.sessionId?.startsWith("session-");
  check("续聊同一会话成功", () => {
    assert.ok(sessionOk, `续聊结果：${JSON.stringify(r.finalText.slice(0, 60))}`);
  });
  check("token 用量被累计", () => {
    assert.ok(session.tokens.input > 0, "tokens.input 为 0");
  });
} catch (e) {
  failed++;
  console.log(`  [FAIL] 续聊失败：${e.message.split("\n")[0]}`);
}

// 清理
try { fs.rmSync(cwd, { recursive: true, force: true }); } catch { /* 忽略 */ }

console.log("");
console.log(`=== 结果：${passed} 通过 / ${failed} 失败 ===`);
process.exit(failed === 0 ? 0 : 1);
