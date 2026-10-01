#!/usr/bin/env node
// 诊断：TTS 的 Subtitle 与 ASR 的 WordList 为什么是空的
//
// 做法：直接看原始响应的**字段结构**（只打印键名与形状，不打印音频内容）。
// 这个脚本的存在本身就是一条经验：接口"成功"不等于"要的字段有值"，
// 而 SDK 不会因为你少拿一个字段而报错。
import { synthesize } from "./src/index.mjs";
import crypto from "node:crypto";

let ttsMod;
try {
  ttsMod = await import("tencentcloud-sdk-nodejs-tts");
} catch (e) {
  console.log("SDK 未装：", e.message);
  process.exit(2);
}

const cred = (() => {
  const id = process.env.TENCENT_SECRET_ID, key = process.env.TENCENT_SECRET_KEY;
  if (!id || !key) { console.log("没有环境变量凭据，退出"); process.exit(2); }
  return { secretId: id, secretKey: key };
})();

const Client = ttsMod.default.tts.v20190823.Client;
const client = new Client({
  credential: cred,
  region: "",
  profile: { httpProfile: { endpoint: "tts.tencentcloudapi.com" } },
});

function shape(v) {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (Buffer.isBuffer(v)) return `Buffer(${v.length})`;
  if (Array.isArray(v)) return `Array(${v.length})`;
  if (typeof v === "string") return `string(${v.length}) ${v.length <= 60 ? JSON.stringify(v) : JSON.stringify(v.slice(0, 60)) + "…"}`;
  if (typeof v === "object") return "object";
  return `${typeof v} ${v}`;
}

console.log("=== TTS 原始响应字段结构 ===\n");

const cases = [
  { label: "基础用法（EnableSubtitle=true, mp3, 云雅琴 403005）", req: { VoiceType: 403005, Codec: "mp3", EnableSubtitle: true } },
  { label: "同音色 + 不开字幕（对照）", req: { VoiceType: 403005, Codec: "mp3", EnableSubtitle: false } },
  { label: "换成云小天 403003 + 开字幕", req: { VoiceType: 403003, Codec: "mp3", EnableSubtitle: true } },
  { label: "wav + 开字幕", req: { VoiceType: 403005, Codec: "wav", EnableSubtitle: true } },
];

for (const c of cases) {
  try {
    const res = await client.TextToVoice({
      Text: "格致测试。",
      SessionId: crypto.randomUUID(),
      SampleRate: 16000,
      ...c.req,
    });
    console.log(`▸ ${c.label}`);
    for (const [k, v] of Object.entries(res)) {
      if (k === "Audio") { console.log(`    Audio     : ${shape(v)}`); continue; }
      console.log(`    ${k.padEnd(10)}: ${shape(v)}`);
    }
    const keys = Object.keys(res);
    if (!keys.includes("Subtitle")) {
      console.log(`    ⚠ 响应里根本没有 Subtitle 字段（实际字段：${keys.join(", ")}）`);
    } else if (!res.Subtitle) {
      console.log(`    ⚠ 有 Subtitle 字段但值为空 —— 可能该音色不支持时间戳`);
    }
    console.log("");
  } catch (e) {
    console.log(`▸ ${c.label}`);
    console.log(`    ✖ 失败：${e.message.slice(0, 150)}\n`);
  }
}

// ---------------------------------------------------------------- ASR WordList
console.log("=== ASR WordList 诊断 ===\n");
const asrMod = await import("tencentcloud-sdk-nodejs-asr");
const AsrClient = asrMod.default.asr.v20190614.Client;
const asr = new AsrClient({
  credential: cred,
  region: "",
  profile: { httpProfile: { endpoint: "asr.tencentcloudapi.com" } },
});

// 用上一步的样音
const fs = await import("node:fs");
const path = await import("node:path");
const sample = path.resolve(import.meta.dirname, "out", "tts-sample.mp3");
if (!fs.existsSync(sample)) { console.log("找不到样音，跳过 ASR 诊断"); process.exit(0); }
const data = fs.readFileSync(sample);

const asrCases = [
  { label: "WordInfo=1（要字级信息）", req: { WordInfo: 1 } },
  { label: "WordInfo=2（要字级+标点）", req: { WordInfo: 2 } },
  { label: "WordInfo=0（对照：不要字级）", req: { WordInfo: 0 } },
  { label: "FilterPunc=0 + WordInfo=2（保留标点）", req: { WordInfo: 2, FilterPunc: 0 } },
];

for (const c of asrCases) {
  try {
    const res = await asr.SentenceRecognition({
      ProjectId: 0,
      EngSerViceType: "16k_zh-PY",
      SourceType: 1,
      VoiceFormat: "mp3",
      Data: data.toString("base64"),
      DataLen: data.length,
      ConvertNumMode: 1,
      ...c.req,
    });
    console.log(`▸ ${c.label}`);
    for (const [k, v] of Object.entries(res)) {
      if (k === "Result") { console.log(`    Result    : ${shape(v)}`); continue; }
      console.log(`    ${k.padEnd(10)}: ${shape(v)}`);
    }
    if (res.WordList) {
      try {
        const wl = JSON.parse(res.WordList);
        console.log(`    WordList 解析后：${Array.isArray(wl) ? wl.length + " 个词" : typeof wl}`);
        if (Array.isArray(wl) && wl.length) console.log(`      首词：${JSON.stringify(wl[0])}`);
      } catch (e) {
        console.log(`    WordList 不是 JSON：${e.message.slice(0, 60)}`);
      }
    } else {
      console.log(`    ⚠ WordList 为空（字段：${Object.keys(res).join(", ")}）`);
    }
    console.log("");
  } catch (e) {
    console.log(`▸ ${c.label}`);
    console.log(`    ✖ 失败：${e.message.slice(0, 150)}\n`);
  }
}
