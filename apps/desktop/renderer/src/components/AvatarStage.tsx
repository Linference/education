import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import portrait from "../assets/xiaoge-expressions-v2.png";
import { type VisemeFrame, trackDuration, sampleOpen } from "./viseme";
export type { VisemeFrame };

interface Props {
  frames: VisemeFrame[];
  speaking: boolean;
  actualMs?: number | null;
  size?: number;
  status?: string;
  mood?: "idle" | "listening" | "thinking";
}

/** Six generated expressions share the existing audio/viseme timeline. */
export default function AvatarStage({ frames, speaking, actualMs, size = 200, status, mood = "idle" }: Props) {
  const sprite = useRef<HTMLDivElement>(null);
  const [blink, setBlink] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    setBlink(false);
    if (reducedMotion || speaking || mood !== "idle") return;
    let timer: ReturnType<typeof setTimeout>;
    let closeTimer: ReturnType<typeof setTimeout>;
    const next = () => {
      timer = setTimeout(() => {
        setBlink(true);
        closeTimer = setTimeout(() => { setBlink(false); next(); }, 140);
      }, 3200 + Math.random() * 2200);
    };
    setBlink(false); next();
    return () => { clearTimeout(timer); clearTimeout(closeTimer); };
  }, [speaking, mood, reducedMotion]);
  useEffect(() => {
    const el = sprite.current;
    if (!el) return;
    const paint = (cell: number, open: number) => {
      el.style.backgroundPosition = `${(cell % 3) * 50}% ${Math.floor(cell / 3) * 100}%`;
      el.dataset.expression = String(cell);
      el.dataset.mouthOpen = open.toFixed(3);
    };
    const rest = mood === "thinking" ? 3 : mood === "listening" ? 2 : blink ? 1 : 0;
    if (!speaking || !frames.length || reducedMotion) { paint(rest, 0); return; }
    let raf = 0;
    const started = performance.now();
    const total = actualMs && actualMs > 0 ? actualMs : trackDuration(frames);
    let lastPaint = -100;
    const tick = (now: number) => {
      const progress = total > 0 ? (now - started) / total : 1;
      if (progress >= 1) { paint(rest, 0); return; }
      if (now - lastPaint >= 40) {
        const open = sampleOpen(frames, progress);
        paint(open > 0.65 ? 5 : open > 0.16 ? 4 : 0, open);
        lastPaint = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frames, speaking, actualMs, mood, blink, reducedMotion]);
  return (
    <div className={`avatar-stage ${speaking ? "is-speaking" : ""} is-${mood}`} data-testid="avatar-stage">
      <div className="avatar-scene" style={{ width: size, height: size }}>
        <div className="avatar-orbit" aria-hidden="true" />
        <div className="avatar-portrait" ref={sprite} role="img" aria-label="小格，学习陪伴伙伴"
          style={{ backgroundImage: `url(${portrait})` }} />
        <span className="avatar-presence" aria-label={speaking ? "正在说话" : mood === "listening" ? "正在倾听" : "准备好了"} />
      </div>
      <div className="avatar-identity"><strong>小格</strong><span>你的学习搭档</span></div>
      {status && <div className="avatar-status" role="status">{status}</div>}
      <div className="avatar-wave" aria-hidden="true">{Array.from({ length: 11 }, (_, i) =>
        <i key={i} style={{ "--bar": i } as CSSProperties} />)}</div>
    </div>
  );
}
