#!/usr/bin/env node
// Gezhi · Voice module offline tests
//
// Only pure functions are tested (sentence splitting, duration advancement, lip-sync frame generation). These need neither network nor keys,
// so they can be run at any time — real API calls are a separate suite (verify-tencent.mjs).
import assert from "node:assert/strict";
import { splitForTts, buildVisemeTrack, TTS_MAX_CHARS, credentialsStatus, toTranscript } from "./index.mjs";

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`  [PASS] ${name}`); }
  catch (e) { failed++; console.log(`  [FAIL] ${name}\n         ${e.message.split("\n")[0]}`); }
}

console.log("=== Voice module offline tests ===");
console.log(`  TTS per-request limit: ${TTS_MAX_CHARS} chars\n`);

// ---------------------------------------------------------------- Sentence splitting

check("Short text is not split", () => {
  assert.deepEqual(splitForTts("你好"), ["你好"]);
});

check("Empty text returns an empty array", () => {
  assert.deepEqual(splitForTts("   "), []);
  assert.deepEqual(splitForTts(""), []);
});

check("★ No piece exceeds the limit (a hard API constraint; exceeding it errors out)", () => {
  const long = "情态动词表示说话人对动作的态度。".repeat(40);   // 680 chars
  const parts = splitForTts(long);
  assert.ok(parts.length > 1, "long text should be split");
  for (const p of parts) {
    assert.ok(p.length <= TTS_MAX_CHARS, `a piece is ${p.length} chars, over ${TTS_MAX_CHARS}`);
  }
});

check("Breaks at sentence-ending punctuation first (do not cut a sentence in half)", () => {
  const text = "第一句话。第二句话。第三句话。".repeat(12);   // 5 chars per sentence
  const parts = splitForTts(text);
  for (const p of parts.slice(0, -1)) {
    assert.ok(/[。！？；]$/.test(p), `this piece does not end with sentence-ending punctuation: 「${p.slice(-12)}」`);
  }
});

check("Falls back to comma splitting when a single sentence is too long", () => {
  const oneBigSentence = "这一句特别长，" + "中间还有内容，".repeat(30) + "最后结束。";
  const parts = splitForTts(oneBigSentence);
  for (const p of parts) assert.ok(p.length <= TTS_MAX_CHARS, `a piece has ${p.length} chars`);
  assert.ok(parts.length > 1);
});

check("Overly long text with no punctuation at all can still be hard-cut (must not loop forever)", () => {
  const noPunct = "啊".repeat(500);
  const parts = splitForTts(noPunct);
  assert.ok(parts.length >= 4, `only ${parts.length} pieces produced`);
  for (const p of parts) assert.ok(p.length <= TTS_MAX_CHARS);
  assert.equal(parts.join("").length, 500, "total character count should be unchanged after splitting");
});

check("Splitting loses no characters (joining all pieces equals the original with extra whitespace removed)", () => {
  const text = "细胞呼吸分三个阶段。第一阶段在细胞质。第二阶段在线粒体基质。第三阶段在线粒体内膜。";
  const parts = splitForTts(text);
  assert.equal(parts.join(""), text.replace(/\s+/g, " ").trim());
});

check("Long English text is limited too (English limit is 500 letters; we conservatively apply the same limit here)", () => {
  const en = "modal verbs express modality. ".repeat(20);
  const parts = splitForTts(en);
  for (const p of parts) assert.ok(p.length <= TTS_MAX_CHARS);
});

// ---------------------------------------------------------------- Lip-sync frames

const fakeTimings = [
  { text: "情", beginMs: 0, endMs: 200 },
  { text: "态", beginMs: 200, endMs: 400 },
  { text: "动", beginMs: 400, endMs: 600 },
];

check("Lip-sync frames cover the whole timeline", () => {
  const frames = buildVisemeTrack(fakeTimings, { fps: 30 });
  assert.ok(frames.length > 15, `only ${frames.length} frames`);
  assert.ok(frames[frames.length - 1].t >= 600, "the last frame does not reach the end");
});

check("★ The mouth is open throughout each character's time span (otherwise the lip sync flickers)", () => {
  const frames = buildVisemeTrack(fakeTimings, { fps: 30 });
  for (const tm of fakeTimings) {
    const inSpan = frames.filter((f) => f.t >= tm.beginMs && f.t < tm.endMs);
    assert.ok(inSpan.length > 0, `no frames in the time span of character 「${tm.text}」`);
    for (const f of inSpan) {
      assert.ok(f.open >= 0.25, `character 「${tm.text}」 has open=${f.open} at t=${f.t}; too small looks closed`);
    }
  }
});

check("The mouth closes in gaps between characters (open drops to zero)", () => {
  const withGap = [
    { text: "甲", beginMs: 0, endMs: 100 },
    { text: "乙", beginMs: 500, endMs: 600 },   // 400ms gap in the middle
  ];
  const frames = buildVisemeTrack(withGap, { fps: 30 });
  const gapFrames = frames.filter((f) => f.t > 150 && f.t < 450);
  assert.ok(gapFrames.length > 0, "there should be frames in the gap");
  assert.ok(gapFrames.every((f) => f.open === 0), "the mouth should be closed in the gap");
});

check("Empty timestamps return an empty track (no crash)", () => {
  assert.deepEqual(buildVisemeTrack([]), []);
  assert.deepEqual(buildVisemeTrack(null), []);
});

check("The frame-rate parameter takes effect", () => {
  const f30 = buildVisemeTrack(fakeTimings, { fps: 30 });
  const f60 = buildVisemeTrack(fakeTimings, { fps: 60 });
  assert.ok(f60.length > f30.length * 1.7, `60fps should be about twice 30fps: ${f60.length} vs ${f30.length}`);
});

// ---------------------------------------------------------------- Credential status

check("Credential status query leaks no contents (reports only the source)", () => {
  const st = credentialsStatus();
  assert.equal(typeof st.ready, "boolean");
  assert.equal(typeof st.fromEnv, "boolean");
  const json = JSON.stringify(st);
  assert.ok(!/AKID|secretKey/i.test(json), `sensitive fields appeared in the status object: ${json}`);
});

// ---------------------------------------------------------------- ASR normalization

check("ASR word list is normalized into a transcript with a timeline", () => {
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

check("Empty word list does not crash", () => {
  assert.deepEqual(toTranscript(null), { text: "", segments: [] });
  assert.deepEqual(toTranscript([]), { text: "", segments: [] });
});

console.log("");
console.log(`=== Result: ${passed} passed / ${failed} failed ===`);
process.exit(failed === 0 ? 0 : 1);
