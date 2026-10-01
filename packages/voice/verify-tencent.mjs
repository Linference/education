#!/usr/bin/env node
// 格致 · 腾讯云语音真实连通性验证
//
// 运行方式（密钥只经环境变量，绝不写入任何文件）：
//   $env:TENCENT_SECRET_ID="..."; $env:TENCENT_SECRET_KEY="..."; node verify-tencent.mjs
//
// 验证四件事，逐层递进：
//   ① 凭据能取到（只报来源，不打印内容）
//   ② TTS 能出声，且 EnableSubtitle 真的返回字级时间戳（数字人口型的数据源）
//   ③ 时间戳能转成口型帧轨道
//   ④ 闭环：TTS 合成的音频喂给 ASR，看能否还原原文 —— 这是最强的一条证据
import fs from "node:fs";
import path from "node:path";
import {
  synthesize, recognizeOnce, toTranscript, buildVisemeTrack, credentialsStatus, VOICE_PRESETS,
} from "./src/index.mjs";

const OUT = path.resolve(import.meta.dirname, "out");
fs.mkdirSync(OUT, { recursive: true });

let passed = 0, failed = 0;
function report(name, ok, detail = "") {
  if (ok) { passed++; console.log(`  [PASS] ${name}${detail ? "  " + detail : ""}`); }
  else { failed++; console.log(`  [FAIL] ${name}${detail ? "  " + detail : ""}`); }
}

console.log("=== 腾讯云语音连通性验证 ===");
const st = credentialsStatus();
console.log(`  凭据来源：${st.fromEnv ? "环境变量" : st.storeExists ? "加密存储(" + st.storeMode + ")" : "无"}`);
console.log(`  就绪：${st.ready ? "是" : "否"}`);
if (!st.ready) {
  console.log("\n  没有可用凭据，跳过。请先设置 TENCENT_SECRET_ID / TENCENT_SECRET_KEY。");
  process.exit(2);
}
console.log("");

// 测试用文本：短、含中文与数字、便于比对
const TEXT = "格致测试，情态动词表示推测。";

// ---------------------------------------------------------------- ② TTS + 时间戳

let ttsResult = null;
try {
  const t0 = Date.now();
  ttsResult = await synthesize(TEXT, {
    voiceType: VOICE_PRESETS.llmZhiLan,   // 默认音色：音质好 + 有字级时间戳
    codec: "mp3",          // mp3 便于直接喂给 ASR
    sampleRate: 16000,
    withTiming: true,
  });
  const ms = Date.now() - t0;

  report("TTS 合成成功", ttsResult.audio.length > 0,
    `${ttsResult.audio.length} 字节 / ${ms}ms / 请求 ${ttsResult.requestIds[0] ?? "?"}`);
  report("分片数符合预期（文本短，应为 1 段）", ttsResult.chunks === 1, `chunks=${ttsResult.chunks}`);

  // 落盘音频，便于人工听一下（这也是"能出声"的直接证据）
  const audioPath = path.join(OUT, "tts-sample.mp3");
  fs.writeFileSync(audioPath, ttsResult.audio);
  console.log(`         音频已存：${path.relative(process.cwd(), audioPath)}（可用播放器验证）`);

  // ★ 关键：字级时间戳
  report("★ TTS 返回字级时间戳（数字人口型的数据源）",
    ttsResult.timings.length > 0,
    `${ttsResult.timings.length} 个时间片${ttsResult.timingAvailable ? "" : "（实测本次为空，见 docs/05）"}`);

  if (ttsResult.timings.length > 0) {
    const head = ttsResult.timings.slice(0, 6)
      .map((t) => `${t.text}[${t.beginMs}-${t.endMs}]`).join(" ");
    console.log(`         前几个：${head}`);

    const monotonic = ttsResult.timings.every((t, i, a) => i === 0 || t.beginMs >= a[i - 1].beginMs);
    report("时间戳单调不减（能做时间轴对齐）", monotonic);

    const joined = ttsResult.timings.map((t) => t.text).join("");
    report("时间戳拼起来能还原原文（说明是按字给的，不是按句）",
      joined.replace(/[，。！？、；：\s]/g, "").includes(TEXT.replace(/[，。！？、；：\s]/g, "").slice(0, 8)),
      `拼回：「${joined}」`);

    // ------------------------------------------------------------ ③ 口型帧
    const frames = buildVisemeTrack(ttsResult.timings, { fps: 30 });
    const openFrames = frames.filter((f) => f.open > 0).length;
    report("能生成口型帧轨道", frames.length > 0 && openFrames > 0,
      `${frames.length} 帧，其中张嘴 ${openFrames} 帧`);
  } else {
    failed += 2;
    console.log("  [SKIP] 没有时间戳，跳过时间轴相关断言");
  }
} catch (e) {
  report("TTS 合成成功", false, e.message.slice(0, 200));
  failed += 4;
}

// ---------------------------------------------------------------- ④ 闭环：ASR

if (ttsResult?.audio?.length) {
  try {
    const t0 = Date.now();
    const asr = await recognizeOnce(ttsResult.audio, { engine: "16k_zh-PY", voiceFormat: "mp3" });
    const ms = Date.now() - t0;

    report("ASR 识别成功", asr.text.length > 0, `${ms}ms / 请求 ${asr.requestId ?? "?"}`);
    console.log(`         识别结果：「${asr.text}」`);

    const norm = (s) => s.replace(/[，。！？、；：\s,.]/g, "");
    const same = norm(asr.text) === norm(TEXT);
    // 合成→识别有误差是正常的（尤其专有名词），所以这里判"高度相似"而非"完全一致"
    const overlap = (() => {
      const a = norm(asr.text), b = norm(TEXT);
      let hit = 0;
      for (const ch of b) if (a.includes(ch)) hit++;
      return hit / b.length;
    })();
    report("★ 闭环：合成音频能被识别回原文（≥70% 字命中）", overlap >= 0.7,
      `完全一致=${same}，字命中率=${(overlap * 100).toFixed(0)}%`);

    report("ASR 返回字级词表（费曼评分要按时间轴对齐）", asr.words.length > 0,
      `${asr.words.length} 个词 / WordSize=${asr.wordCount}`);

    const t = toTranscript(asr.words);
    // 注意：这里必须判**段数 > 0**。第一版只判了 Array.isArray(asr.words)，
    // 而那个断言对空数组也成立 —— 于是 WordList 解析失败却被判"通过"。
    report("词表能整理成带时间轴的讲解稿", t.segments.length > 0,
      `${t.segments.length} 段${t.segments[0] ? `，首段「${t.segments[0].word}」@${t.segments[0].startMs}ms` : ""}`);
    if (t.segments.length) {
      const spans = t.segments.map((s) => `${s.word}[${s.startMs}-${s.endMs}]`).join(" ");
      console.log(`         词级时间轴：${spans}`);
    }
  } catch (e) {
    report("ASR 识别成功", false, e.message.slice(0, 200));
    failed += 3;
  }
}

// ---------------------------------------------------------------- 汇总

console.log("");
console.log(`=== 结果：${passed} 通过 / ${failed} 失败 ===`);
if (failed > 0) {
  console.log("");
  console.log("常见失败原因：");
  console.log("  · AuthFailure.SignatureFailure / SecretIdNotFound → 密钥不对或未开通语音服务");
  console.log("  · FailedOperation.NoFreeAmount / ResourceInsufficient → 免费额度用完或未购买");
  console.log("  · RequestLimitExceeded → 触发限流，稍后重试");
}
process.exit(failed === 0 ? 0 : 1);
