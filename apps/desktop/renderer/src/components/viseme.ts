// 口型数据：类型 + 两套帧生成器
//
// 单独一个文件，因为现在有三处要用（语音 hook、形象组件、对话台）。
// 放一起能保证公式只有一份。
//
// ★ 为什么在渲染进程重写一遍（packages/voice 里已经有一份）：
//   那个包是纯 ESM，渲染进程这一侧不引它（打包成本 + 它带着腾讯云 SDK）。
//   代价是公式有两份实现 —— 所以**改动时必须两边一起改**，
//   否则"本地估算"和"云端真实"驱动出来的口型观感会不一致。
export interface VisemeFrame {
  /** 毫秒 */
  t: number;
  /** 张嘴程度 0..1 */
  open: number;
  /** 这个时刻在发的字（可为空） */
  ch: string;
}

/** 帧序列的估算总时长 */
export function trackDuration(frames: VisemeFrame[]): number {
  return frames.length ? frames[frames.length - 1].t : 0;
}

/**
 * 共享的口型曲线：字中间张得最大、首尾收拢。
 *
 * 与 packages/voice 的 buildVisemeTrack 是**同一条公式**：
 *   open = max(0.25, sin(π × 进度))
 * 0.25 的下限保证"发音期间嘴至少微张"，不然连读时嘴会一直闭着。
 */
const MIN_OPEN = 0.25;
function openAt(beginMs: number, endMs: number, ms: number): number {
  const span = Math.max(1, endMs - beginMs);
  const phase = Math.min(1, (ms - beginMs) / span);
  return Math.max(MIN_OPEN, Math.sin(Math.PI * phase));
}

/** 通用：时间戳 → 帧序列 */
function framesFromTimings(
  timings: Array<{ text: string; beginMs: number; endMs: number }>,
  fps: number,
): VisemeFrame[] {
  if (!timings.length) return [];
  const step = 1000 / fps;
  const end = timings[timings.length - 1].endMs;
  const frames: VisemeFrame[] = [];
  let ti = 0;
  for (let ms = 0; ms <= end + step; ms += step) {
    while (ti < timings.length && timings[ti].endMs < ms) ti++;
    const cur = timings[ti];
    let open = 0;
    let ch = "";
    if (cur && ms >= cur.beginMs) {
      open = openAt(cur.beginMs, cur.endMs, ms);
      ch = cur.text;
    }
    frames.push({ t: Math.round(ms), open: Number(open.toFixed(3)), ch });
  }
  return frames;
}

/**
 * 云端路径：**真实的**字级时间戳 → 帧。
 * 时间戳来自腾讯云 TTS 的 EnableSubtitle（免费），所以口型是精确的。
 */
export function buildVisemeTrackFromTimings(
  timings: Array<{ text: string; beginMs: number; endMs: number }>,
  fps = 30,
): VisemeFrame[] {
  return framesFromTimings(timings, fps);
}

/**
 * 本地路径：没有时间戳时，按字数**估算**时间戳再压成帧。
 *
 * 估算规则：
 *   · 汉字 165ms
 *   · 标点 170ms（当停顿，不发音但占时间）
 *   · 空白 60ms
 * 这当然是粗略的，但配合"用真实时长归一化"的做法，
 * 语速快慢都不会让嘴越说越偏。
 */
export function buildLocalVisemeTrack(text: string, fps = 30): VisemeFrame[] {
  const chars = [...text];
  if (!chars.length) return [];
  let t = 0;
  const timings: Array<{ text: string; beginMs: number; endMs: number }> = [];
  for (const ch of chars) {
    if (/\s/.test(ch)) { t += 60; continue; }
    if (/[，。！？、；：,.!?;:]/.test(ch)) { t += 170; continue; }
    timings.push({ text: ch, beginMs: t, endMs: t + 165 });
    t += 165;
  }
  return framesFromTimings(timings, fps);
}

/**
 * 按归一化进度取某一刻的嘴型（线性插值，帧率不够高时嘴动也不跳）。
 */
export function sampleOpen(frames: VisemeFrame[], progress: number): number {
  if (!frames.length) return 0;
  const total = trackDuration(frames);
  if (total <= 0) return frames[0]?.open ?? 0;
  const t = Math.max(0, Math.min(1, progress)) * total;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  const b = frames[lo];
  const a = frames[Math.max(0, lo - 1)];
  if (!a || !b || b.t === a.t) return b?.open ?? 0;
  const k = (t - a.t) / (b.t - a.t);
  return a.open + (b.open - a.open) * k;
}

/**
 * 把 Markdown 洗成"适合朗读的纯文本"。
 *
 * ★ 为什么必须洗：
 *   AI 的回答是 Markdown，直接念会把符号也念出来 ——
 *   "星号星号标题星号星号"、"反引号代码反引号"，听起来像机器坏话。
 *   实测最刺耳的是代码块与表格：整段念下来完全没有意义。
 *   所以：去掉标记、去掉代码块、表格转成"某某：某某"的口语读法。
 */
export function markdownToSpeech(md: string): string {
  let s = md;

  // 代码块整段丢掉（念代码没有意义，而且很长）
  s = s.replace(/```[\s\S]*?```/g, "（代码略）");
  // 行内代码去掉反引号，保留内容（像是函数名，念出来有意义）
  s = s.replace(/`([^`]+)`/g, "$1");
  // 图片：读 alt
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  // 链接：只读文字
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // 标题标记
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  // 强调/删除线标记
  s = s.replace(/(\*\*|__)(.*?)\1/g, "$2");
  s = s.replace(/(\*|_)(.*?)\1/g, "$2");
  s = s.replace(/~~(.*?)~~/g, "$1");
  // 引用标记
  s = s.replace(/^\s{0,3}>\s?/gm, "");
  // 列表标记
  s = s.replace(/^\s{0,3}[-*+]\s+/gm, "");
  s = s.replace(/^\s{0,3}\d+\.\s+/gm, "");
  // 分隔线
  s = s.replace(/^\s{0,3}([-*_]\s*){3,}$/gm, "");
  // 表格：整行转成"甲，乙，丙"（比念竖线好得多）
  s = s.replace(/^\s*\|(.+)\|\s*$/gm, (_m, inner) =>
    String(inner).split("|").map((c) => c.trim()).filter(Boolean).join("，"));
  // 表格分隔行（|---|---|）整个丢掉
  s = s.replace(/^\s*[-:\s|]+\s*$/gm, "");
  // 折叠多余空行
  s = s.replace(/\n{3,}/g, "\n\n").trim();

  return s;
}
