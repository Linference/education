import * as React from "react";

// 数字人形象
//
// 用 SVG 画一个简洁的卡通形象，嘴部由**口型帧序列**驱动。
//
// ★ 为什么先做这个版本（而不是先接腾讯云）：
//   口型算法和系统语音都是**本地能力**，不需要密钥，现在就能跑通
//   "打字 → 出声 → 对口型"这条完整链路。
//   等腾讯云密钥配好，只需把"发声"换成云端 TTS、把"口型数据源"
//   换成它返回的字级时间戳，**这个形象组件一行都不用改** ——
//   它只认 VisemeFrame[]，不关心帧是从哪来的。
//
// ★ 口型驱动的关键设计：
//   嘴的张开量取自 frame.open（0..1），t 是毫秒时间轴。
//   但系统语音的实际时长我事先不知道，所以不能直接按 t 播 ——
//   做法是：发声开始时记下时刻，用 requestAnimationFrame 计真实流逝时间，
//   再按 `真实事件时间 / 语音实际总时长` 归一化去检索帧。
//   这样**无论语音比估算快还是慢，口型都会自动伸缩对齐**。
// 口型类型与两套帧生成器都在 ./viseme，那里只有一份公式，
// 语音 hook 与形象组件共用（避免两边公式漂移，口型观感不一致）。
import { type VisemeFrame, trackDuration, sampleOpen } from "./viseme";
export type { VisemeFrame };

interface Props {
  /** 口型帧；为空则闭嘴静止 */
  frames: VisemeFrame[];
  /** 是否正在说话（由外部控制播放时机） */
  speaking: boolean;
  /** 语音实际总时长（毫秒）。传入后口型会按它伸缩对齐 */
  actualMs?: number | null;
  /** 尺寸 */
  size?: number;
  /** 当前状态文字，显示在脸下方 */
  status?: string;
}


export default function AvatarStage({ frames, speaking, actualMs, size = 200, status }: Props) {
  const [open, setOpen] = React.useState(0);

  React.useEffect(() => {
    if (!speaking || !frames.length) {
      setOpen(0);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    // 语音实际时长优先；没有就退回帧序列的估算时长
    const total = actualMs && actualMs > 0 ? actualMs : trackDuration(frames);

    const tick = () => {
      const elapsed = performance.now() - t0;
      const progress = total > 0 ? elapsed / total : 0;
      if (progress >= 1) { setOpen(0); return; }
      setOpen(sampleOpen(frames, progress));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speaking, frames, actualMs]);

  // 眨眼：随机的自然感，说话时也可以眨
  const [blink, setBlink] = React.useState(false);
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      timer = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 120);
        loop();
      }, 2200 + Math.random() * 3200);
    };
    loop();
    return () => clearTimeout(timer);
  }, []);

  // 嘴：open 0 → 一条线；open 1 → 明显张开
  const mouthOpenH = 3 + open * 22;
  const mouthW = 34 + open * 6;
  const eyeH = blink ? 1.6 : 9;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width={size} height={size * 0.92} viewBox="0 0 200 184">
        <defs>
          <radialGradient id="av-face" cx="50%" cy="42%" r="62%">
            <stop offset="0%" stopColor="#fef6f0" />
            <stop offset="100%" stopColor="#f3e0d2" />
          </radialGradient>
          <linearGradient id="av-hair" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3f3a4a" />
            <stop offset="100%" stopColor="#2a2633" />
          </linearGradient>
        </defs>

        {/* 肩膀 */}
        <ellipse cx="100" cy="196" rx="72" ry="46" fill="var(--bg-secondary)" stroke="var(--bd)" />
        {/* 头发（后） */}
        <ellipse cx="100" cy="86" rx="58" ry="60" fill="url(#av-hair)" />
        {/* 脸 */}
        <ellipse cx="100" cy="92" rx="50" ry="55" fill="url(#av-face)" />
        {/* 刘海 */}
        <path d="M50 76 Q66 42 100 42 Q134 42 150 76 Q138 62 118 60 Q100 74 82 60 Q62 62 50 76 Z"
          fill="url(#av-hair)" />
        {/* 耳朵 */}
        <ellipse cx="50" cy="98" rx="6" ry="9" fill="#f0dccb" />
        <ellipse cx="150" cy="98" rx="6" ry="9" fill="#f0dccb" />

        {/* 眉毛 */}
        <path d="M74 74 Q84 69 94 73" stroke="#4b4453" strokeWidth="3.2" fill="none" strokeLinecap="round" />
        <path d="M106 73 Q116 69 126 74" stroke="#4b4453" strokeWidth="3.2" fill="none" strokeLinecap="round" />

        {/* 眼睛（会眨） */}
        <ellipse cx="84" cy="89" rx="7" ry={eyeH} fill="#2c2833" />
        <ellipse cx="116" cy="89" rx="7" ry={eyeH} fill="#2c2833" />
        {!blink && (
          <>
            <circle cx="86.5" cy="86.5" r="2.1" fill="#fff" opacity="0.9" />
            <circle cx="118.5" cy="86.5" r="2.1" fill="#fff" opacity="0.9" />
          </>
        )}

        {/* 腮红：说话时随张口程度微微加深，增加"活着"的感觉 */}
        <ellipse cx="68" cy="106" rx="9" ry="5" fill="#f2a9a0" opacity={0.22 + open * 0.18} />
        <ellipse cx="132" cy="106" rx="9" ry="5" fill="#f2a9a0" opacity={0.22 + open * 0.18} />

        {/* 嘴：由口型帧驱动 */}
        <ellipse
          cx="100"
          cy="124"
          rx={mouthW / 2}
          ry={mouthOpenH / 2}
          fill="#a8443f"
        />
        {open > 0.35 && (
          // 张嘴时露一点舌头，纯白的一个椭圆太快"假"，加一点颜色有生气
          <ellipse cx="100" cy={124 + mouthOpenH / 2 - 2.5} rx={mouthW / 2.6} ry={mouthOpenH / 5}
            fill="#d98a86" opacity={0.85} />
        )}
      </svg>

      {status && (
        <div style={{ fontSize: 11, color: "var(--text-faint)", textAlign: "center", lineHeight: 1.6 }}>
          {status}
        </div>
      )}
    </div>
  );
}
