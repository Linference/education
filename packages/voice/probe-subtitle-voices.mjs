#!/usr/bin/env node
// 探针：哪些 TTS 音色真的返回 Subtitles（时间戳）
//
// 背景：EnableSubtitle: true 时，403005 / 403003 都返回空数组。
// 不确定是"音色不支持"还是"账号未开通"，所以扫一批候选音色，把结论落到证据上。
// 官方音色列表：https://cloud.tencent.com/document/product/1073/92668
import crypto from "node:crypto";

const ttsMod = await import("tencentcloud-sdk-nodejs-tts");
const Client = ttsMod.default.tts.v20190823.Client;
const id = process.env.TENCENT_SECRET_ID, key = process.env.TENCENT_SECRET_KEY;
if (!id || !key) { console.log("需要环境变量凭据"); process.exit(2); }

const client = new Client({
  credential: { secretId: id, secretKey: key },
  region: "",
  profile: { httpProfile: { endpoint: "tts.tencentcloudapi.com" } },
});

// 覆盖各档次：基础/精品/大模型/超自然大模型
const CANDIDATES = [
  { id: 101001, tag: "基础版女声" },
  { id: 101002, tag: "基础版男声" },
  { id: 0,      tag: "默认音色" },
  { id: 1001,   tag: "精品·智瑜" },
  { id: 1002,   tag: "精品·智聆" },
  { id: 403005, tag: "教育·云雅琴" },
  { id: 403003, tag: "教育·云小天" },
  { id: 501008, tag: "大模型·智斌" },
  { id: 501000, tag: "大模型·智兰" },
  { id: 601008, tag: "大模型·智斌2" },
  { id: 602005, tag: "超自然·云幕" },
  { id: 603001, tag: "超自然·云希" },
];

const TEXT = "格致测试。";

console.log("=== TTS 音色 × 时间戳可用性扫描 ===\n");
console.log("  " + "音色ID".padEnd(8) + "标签".padEnd(20) + "音频".padEnd(10) + "时间戳");
console.log("  " + "-".repeat(58));

const results = [];
for (const c of CANDIDATES) {
  try {
    const res = await client.TextToVoice({
      Text: TEXT,
      SessionId: crypto.randomUUID(),
      VoiceType: c.id,
      Codec: "mp3",
      SampleRate: 16000,
      EnableSubtitle: true,
    });
    const audio = Buffer.from(res.Audio ?? "", "base64");
    const subs = Array.isArray(res.Subtitles) ? res.Subtitles : [];
    const mark = subs.length > 0 ? `✔ ${subs.length} 片` : "✖ 空";
    console.log("  " + String(c.id).padEnd(8) + c.tag.padEnd(18) + `${audio.length}B`.padEnd(10) + mark);
    if (subs.length > 0) {
      console.log(`      样例：${subs.slice(0, 3).map((s) => `${s.Text}[${s.BeginTime}-${s.EndTime}]`).join(" ")}`);
      console.log(`      响应字段：${Object.keys(res).join(", ")}`);
    }
    results.push({ id: c.id, tag: c.tag, bytes: audio.length, subs: subs.length, ok: true });
  } catch (e) {
    const msg = e.message ?? String(e);
    // 音色未开通/不存在是常见情况，不算脚本失败
    const short = msg.split("\n")[0].slice(0, 70);
    console.log("  " + String(c.id).padEnd(8) + c.tag.padEnd(18) + "—".padEnd(10) + `无法使用：${short}`);
    results.push({ id: c.id, tag: c.tag, ok: false, error: short });
  }
  await new Promise((r) => setTimeout(r, 250));   // 别把限流撞出来
}

const withTiming = results.filter((r) => (r.subs ?? 0) > 0);
console.log("");
console.log("=== 结论 ===");
if (withTiming.length === 0) {
  console.log("  本账号下扫描的 " + results.filter((r) => r.ok).length + " 个可用音色，**全部**没有返回时间戳。");
  console.log("  → 这不是音色问题。可能是：");
  console.log("     · 该功能需单独申请/开通（EnableSubtitle 在官方文档里标注为「部分音色不支持」）");
  console.log("     · 或账号等级/套餐限制");
  console.log("  → 数字人口型的替代路线：用 ASR 的词级时间戳反推（讲解场景可行），");
  console.log("     或本地按音频能量做口型（不依赖云服务）。");
} else {
  console.log(`  可用音色：${withTiming.map((r) => `${r.id}(${r.tag})`).join("、")}`);
}

console.log("");
console.log("  明细：");
for (const r of results) {
  const st = r.ok ? (r.subs > 0 ? `时间戳 ${r.subs} 片` : "无时间戳") : `失败：${r.error}`;
  console.log(`    ${String(r.id).padEnd(8)} ${r.tag.padEnd(20)} ${st}`);
}
