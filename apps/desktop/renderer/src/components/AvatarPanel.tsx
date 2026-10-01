// 数字人面板
//
// 两个子页签：
//   · 对话 —— 和数字人说话（打字 → AI 回答 → 念出来，带口型）
//   · 检测 —— 哪些能力可用、哪些缺什么
//
// ★ 为什么拆成两个页签：
//   用户指出的缺口是"没有对话按钮" —— 之前只有一个"朗读"输入框，
//   那只是把字念出来，不是对话。现在「对话」页签是主界面，
//   「检测」退到第二个页签（它是排查用的，不该占主位）。
//
// ★ 语音逻辑不在这里了：都收进 useAvatarVoice，对话台也共用那一份。
import { useCallback, useEffect, useState } from "react";
import AvatarConsole from "./AvatarConsole";
import FeynmanPanel from "./FeynmanPanel";

interface Cap {
  available: boolean;
  reason: string | null;
  frames?: number;
}
interface ProbeResult {
  ok: boolean;
  tts: Cap;
  asr: Cap;
  viseme: Cap;
  credentials: {
    configured: boolean;
    fromEnv?: boolean;
    storeExists?: boolean;
    storeMode?: string | null;
    storePath?: string | null;
  };
  voices?: unknown[];
  limits?: { ttsMaxChars?: number | null; asr?: { maxSeconds?: number; maxBytes?: number } | null } | null;
  error?: string;
}

interface Props {
  vaultPath: string | null;
  /** 当前打开的文件名 —— 给费曼台的"讲什么"当默认值 */
  currentFileName?: string | null;
  /** 当前打开文件的文字 —— 作为 AI 判断讲得对不对的参考资料 */
  currentFileText?: string | null;
}

/** 一行检测结果 */
function CapRow({ label, cap, hint }: { label: string; cap: Cap; hint?: string }) {
  const ok = cap.available;
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 8,
      padding: "7px 8px", borderBottom: "1px solid var(--bd)",
    }}>
      <span style={{
        flex: "0 0 auto", width: 16, textAlign: "center", fontSize: 13, lineHeight: "18px",
        color: ok ? "#16a34a" : "var(--text-faint)",
      }}>
        {ok ? "✔" : "—"}
      </span>
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: ok ? 500 : 400, color: ok ? "var(--text-normal)" : "var(--text-muted)" }}>
          {label}
        </div>
        {!ok && cap.reason && (
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 1, lineHeight: 1.6 }}>
            {cap.reason}
          </div>
        )}
        {ok && hint && (
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 1 }}>{hint}</div>
        )}
      </div>
      <span style={{
        flex: "0 0 auto", fontSize: 10.5, padding: "1px 6px", borderRadius: 8,
        background: ok ? "#e9f7ee" : "var(--bg-secondary)",
        color: ok ? "#14532d" : "var(--text-faint)",
      }}>
        {ok ? "可用" : "未就绪"}
      </span>
    </div>
  );
}

export default function AvatarPanel({ vaultPath, currentFileName, currentFileText }: Props) {
  /**
   * 默认开在「费曼」页 —— 那才是数字人的主要用途：
   * **用户当老师讲一遍，AI 查缺补漏**。
   * 「对话」是普通问答（AI 讲给你听），是补充而不是主线。
   */
  const [tab, setTab] = useState<"feynman" | "chat" | "probe">("feynman");
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** 系统语音（浏览器内置）是否可用 —— TTS 的免费回退 */
  const [sysTts, setSysTts] = useState<{ ok: boolean; voices: number; reason?: string }>({ ok: false, voices: 0 });
  /** 麦克风设备 */
  const [mics, setMics] = useState<{ ok: boolean; count: number; reason?: string }>({ ok: false, count: 0 });

  const run = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await window.gezhi.avatar.probe();
      setProbe(r);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void run(); }, [run]);

  // ---- 系统语音（浏览器内置，无需密钥） ----
  useEffect(() => {
    const synth = (window as any).speechSynthesis;
    if (!synth) { setSysTts({ ok: false, voices: 0, reason: "这个环境没有内置语音合成" }); return; }
    const read = () => {
      const vs = synth.getVoices?.() ?? [];
      setSysTts({ ok: vs.length > 0, voices: vs.length, reason: vs.length ? undefined : "系统里没有可用的语音" });
    };
    read();
    // 语音列表是异步加载的，第一次可能为空
    synth.addEventListener?.("voiceschanged", read);
    return () => synth.removeEventListener?.("voiceschanged", read);
  }, []);

  // ---- 麦克风设备 ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const md = (navigator as any).mediaDevices;
        if (!md?.enumerateDevices) {
          if (!cancelled) setMics({ ok: false, count: 0, reason: "这个环境不支持枚举音频设备" });
          return;
        }
        const devs = await md.enumerateDevices();
        const audioIn = (devs ?? []).filter((d: any) => d.kind === "audioinput");
        if (!cancelled) {
          setMics({
            ok: audioIn.length > 0,
            count: audioIn.length,
            reason: audioIn.length ? undefined : "没有检测到麦克风",
          });
        }
      } catch (e: any) {
        if (!cancelled) setMics({ ok: false, count: 0, reason: e?.message ?? String(e) });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!vaultPath) {
    return <div className="tree-empty">打开一个库后可以使用数字人</div>;
  }

  const localReady = [sysTts.ok, mics.ok, Boolean(probe?.viseme.available)].filter(Boolean).length;
  const cloudReady = Boolean(probe?.tts.available);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* 子页签。
          顺序上把「费曼」放第一个 —— 它是主用途（你讲、AI 查缺补漏），
          「对话」是普通问答，「检测」是排查工具。 */}
      <div style={{ flex: "0 0 auto", display: "flex", borderBottom: "1px solid var(--bd)" }}>
        {([["feynman", "费曼"], ["chat", "对话"], ["probe", "检测"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              flex: "1 1 auto", padding: "5px 0", fontSize: 12,
              color: tab === k ? "var(--accent)" : "var(--text-muted)",
              borderBottom: tab === k ? "2px solid var(--accent)" : "2px solid transparent",
              fontWeight: tab === k ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ---- 费曼：你讲，AI 查缺补漏 ---- */}
      {tab === "feynman" && (
        <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
          <FeynmanPanel
            vaultPath={vaultPath}
            cloudReady={cloudReady}
            currentFileName={currentFileName}
            currentFileText={currentFileText}
          />
        </div>
      )}

      {/* ---- 对话 ---- */}
      {tab === "chat" && (
        <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
          <AvatarConsole vaultPath={vaultPath} cloudReady={cloudReady} />
        </div>
      )}

      {/* ---- 检测 ---- */}
      {tab === "probe" && (
        <div style={{ flex: "1 1 auto", overflow: "auto", minHeight: 0 }}>
          <div style={{
            padding: "8px 10px", borderBottom: "1px solid var(--bd)",
            background: "var(--bg-secondary)", fontSize: 11.5,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>能力检测</span>
              <div style={{ flex: "1 1 auto" }} />
              <button
                onClick={() => void run()}
                style={{ color: "var(--accent)", fontSize: 11.5, textDecoration: "underline" }}
              >
                {loading ? "检测中…" : "重新检测"}
              </button>
            </div>
            <div style={{ marginTop: 4, color: "var(--text-faint)", lineHeight: 1.7 }}>
              本地能力 {localReady}/3 · 云端能力 {cloudReady ? 2 : 0}/2
              <br />
              <span style={{ fontSize: 10.5 }}>
                本地能力不需要密钥，现在就能用；云端需要腾讯云凭据。
              </span>
            </div>
          </div>

          {err && (
            <div style={{ padding: "6px 10px", fontSize: 11.5, color: "var(--red)", background: "#fdecec" }}>
              检测出错：{err}
            </div>
          )}

          <div style={{ padding: "6px 10px 2px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
            本地能力（不需要密钥）
          </div>
          <CapRow
            label="口型数据生成"
            cap={probe?.viseme ?? { available: false, reason: "还没检测" }}
            hint={probe?.viseme.frames ? `实测生成 ${probe.viseme.frames} 帧` : undefined}
          />
          <CapRow
            label="系统语音朗读（TTS 回退）"
            cap={{ available: sysTts.ok, reason: sysTts.reason ?? null }}
            hint={sysTts.ok ? `系统里有 ${sysTts.voices} 个语音` : undefined}
          />
          <CapRow
            label="麦克风（录音输入）"
            cap={{ available: mics.ok, reason: mics.reason ?? null }}
            hint={mics.ok ? `检测到 ${mics.count} 个输入设备` : undefined}
          />

          <div style={{ padding: "10px 10px 2px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
            云端能力（需要腾讯云凭据）
          </div>
          <CapRow label="语音合成（TTS）" cap={probe?.tts ?? { available: false, reason: "还没检测" }} />
          <CapRow label="语音识别（ASR）" cap={probe?.asr ?? { available: false, reason: "还没检测" }} />

          {probe && !probe.credentials.configured && (
            <div style={{
              margin: "8px 10px", padding: "7px 9px", borderRadius: 4,
              background: "var(--bg-secondary)", fontSize: 11, lineHeight: 1.8, color: "var(--text-muted)",
            }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>凭据未配置</div>
              两种配置方式：
              <br />· 环境变量 <code style={{ fontSize: 10.5 }}>TENCENT_SECRET_ID</code> 与 <code style={{ fontSize: 10.5 }}>TENCENT_SECRET_KEY</code>
              <br />· 或存进格致的加密凭据库
              {probe.credentials.storePath && (
                <div style={{ fontSize: 10.5, color: "var(--text-faint)", wordBreak: "break-all", marginTop: 2 }}>
                  {probe.credentials.storePath}
                </div>
              )}
            </div>
          )}

          {probe?.credentials.configured && (
            <div style={{ margin: "8px 10px", fontSize: 11, color: "#14532d" }}>
              ✔ 凭据已就绪（{probe.credentials.fromEnv ? "来自环境变量" : "来自加密凭据库"}）
            </div>
          )}

          {probe?.limits && (
            <div style={{ padding: "10px", fontSize: 10.5, color: "var(--text-faint)", lineHeight: 1.8 }}>
              平台上限：
              {probe.limits.ttsMaxChars ? <> 单次合成 {probe.limits.ttsMaxChars} 字</> : null}
              {probe.limits.asr?.maxSeconds ? <> · 单次识别 {probe.limits.asr.maxSeconds} 秒</> : null}
              {probe.limits.asr?.maxBytes ? <>（≤ {(probe.limits.asr.maxBytes / 1024 / 1024).toFixed(1)} MB）</> : null}
              <br />
              超过上限格致会自动分段。
            </div>
          )}
        </div>
      )}
    </div>
  );
}
