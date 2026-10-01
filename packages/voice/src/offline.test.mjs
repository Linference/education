#!/usr/bin/env node
// 格致 · 语音模块离线测试
//
// 只测纯函数（分句、时长推进、口型帧生成）。这些不需要网络也不需要密钥，
// 所以可以随时跑 —— 而真实 API 调用是另一套（verify-tencent.mjs）。
import assert from "node:assert/strict";
import { splitForTts, buildVisemeTrack, TTS_MAX_CHARS, credentialsStatus, toTranscript } from "./index.mjs";

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`  [PASS] ${name}`); }
  catch (e) { failed++; console.log(`  [FAIL] ${name}\n         ${e.message.split("\n")[0]}`); }
}

console.log("=== 语音模块离线测试 ===");
console.log(`  TTS 单次上限：${TTS_MAX_CHARS} 字\n`);

// ---------------------------------------------------------------- 分句

check("短文本不切分", () => {
  assert.deepEqual(splitForTts("你好"), ["你好"]);
});

check("空文本返回空数组", () => {
  assert.deepEqual(splitForTts("   "), []);
  assert.deepEqual(splitForTts(""), []);
});

check("★ 每段都不超过上限（这是接口硬约束，超了直接报错）", () => {
  const long = "情态动词表示说话人对动作的态度。".repeat(40);   // 680 字
  const parts = splitForTts(long);
  assert.ok(parts.length > 1, "长文本应该被切开");
  for (const p of parts) {
    assert.ok(p.length <= TTS_MAX_CHARS, `有一段 ${p.length} 字，超了 ${TTS_MAX_CHARS}`);
  }
});

check("优先在句末标点断开（不要把一个句子拦腰切断）", () => {
  const text = "第一句话。第二句话。第三句话。".repeat(12);   // 每句 5 字
  const parts = splitForTts(text);
  for (const p of parts.slice(0, -1)) {
    assert.ok(/[。！？；]$/.test(p), `这段没有以句末标点结束：「${p.slice(-12)}」`);
  }
});

check("单句超长时退化到逗号切分", () => {
  const oneBigSentence = "这一句特别长，" + "中间还有内容，".repeat(30) + "最后结束。";
  const parts = splitForTts(oneBigSentence);
  for (const p of parts) assert.ok(p.length <= TTS_MAX_CHARS, `有 ${p.length} 字的段`);
  assert.ok(parts.length > 1);
});

check("完全没有标点的超长文本也能硬切（不能死循环）", () => {
  const noPunct = "啊".repeat(500);
  const parts = splitForTts(noPunct);
  assert.ok(parts.length >= 4, `只切出 ${parts.length} 段`);
  for (const p of parts) assert.ok(p.length <= TTS_MAX_CHARS);
  assert.equal(parts.join("").length, 500, "切分后总字数应不变");
});

check("切分不丢字（把所有段拼回去等于原文去掉多余空白）", () => {
  const text = "细胞呼吸分三个阶段。第一阶段在细胞质。第二阶段在线粒体基质。第三阶段在线粒体内膜。";
  const parts = splitForTts(text);
  assert.equal(parts.join(""), text.replace(/\s+/g, " ").trim());
});

check("英文长文本同样受限（英文上限 500 字母，这里按同一上限保守处理）", () => {
  const en = "modal verbs express modality. ".repeat(20);
  const parts = splitForTts(en);
  for (const p of parts) assert.ok(p.length <= TTS_MAX_CHARS);
});

// ---------------------------------------------------------------- 口型帧

const fakeTimings = [
  { text: "情", beginMs: 0, endMs: 200 },
  { text: "态", beginMs: 200, endMs: 400 },
  { text: "动", beginMs: 400, endMs: 600 },
];

check("口型帧覆盖整段时间轴", () => {
  const frames = buildVisemeTrack(fakeTimings, { fps: 30 });
  assert.ok(frames.length > 15, `只有 ${frames.length} 帧`);
  assert.ok(frames[frames.length - 1].t >= 600, "最后一帧没到结尾");
});

check("★ 每个字的时间段内嘴都是张开的（否则口型会闪）", () => {
  const frames = buildVisemeTrack(fakeTimings, { fps: 30 });
  for (const tm of fakeTimings) {
    const inSpan = frames.filter((f) => f.t >= tm.beginMs && f.t < tm.endMs);
    assert.ok(inSpan.length > 0, `字「${tm.text}」的时间段内没有帧`);
    for (const f of inSpan) {
      assert.ok(f.open >= 0.25, `字「${tm.text}」在 t=${f.t} 时 open=${f.open}，太小会看起来闭嘴`);
    }
  }
});

check("字的间隙嘴闭合（open 归零）", () => {
  const withGap = [
    { text: "甲", beginMs: 0, endMs: 100 },
    { text: "乙", beginMs: 500, endMs: 600 },   // 中间空 400ms
  ];
  const frames = buildVisemeTrack(withGap, { fps: 30 });
  const gapFrames = frames.filter((f) => f.t > 150 && f.t < 450);
  assert.ok(gapFrames.length > 0, "间隙里应该有帧");
  assert.ok(gapFrames.every((f) => f.open === 0), "间隙里嘴应该闭合");
});

check("空时间戳返回空轨道（不崩）", () => {
  assert.deepEqual(buildVisemeTrack([]), []);
  assert.deepEqual(buildVisemeTrack(null), []);
});

check("帧率参数生效", () => {
  const f30 = buildVisemeTrack(fakeTimings, { fps: 30 });
  const f60 = buildVisemeTrack(fakeTimings, { fps: 60 });
  assert.ok(f60.length > f30.length * 1.7, `60fps 应约是 30fps 的两倍：${f60.length} vs ${f30.length}`);
});

// ---------------------------------------------------------------- 凭据状态

check("凭据状态查询不泄露内容（只报来源）", () => {
  const st = credentialsStatus();
  assert.equal(typeof st.ready, "boolean");
  assert.equal(typeof st.fromEnv, "boolean");
  const json = JSON.stringify(st);
  assert.ok(!/AKID|secretKey/i.test(json), `状态对象里出现了敏感字段：${json}`);
});

// ---------------------------------------------------------------- ASR 整理

check("ASR 词表整理成带时间轴的讲解稿", () => {
  const words = [
    { Word: "情", StartTime: 0, EndTime: 100 },
    { Word: "态", StartTime: 100, EndTime: 220 },
    { Word: "动词", StartTime: 220, EndTime: 500 },
  ];
  const t = toTranscript(words);
  assert.equal(t.text, "情态动词");
  assert.equal(t.segments.length, 3);
  assert.equal(t.segments[2].word, "动词");
  assert.equal(t.segments[2].endMs, 500);
});

check("空词表不崩", () => {
  assert.deepEqual(toTranscript(null), { text: "", segments: [] });
  assert.deepEqual(toTranscript([]), { text: "", segments: [] });
});

console.log("");
console.log(`=== 结果：${passed} 通过 / ${failed} 失败 ===`);
process.exit(failed === 0 ? 0 : 1);
