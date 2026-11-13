// Companion panel
//
// Two sub-tabs:
//   · Chat — talk to the Companion (type → AI answers → spoken aloud with lip sync)
//   · Capabilities — which capabilities are available and what is missing
//
// ★ Why split into two tabs:
//   The gap users pointed out was "there is no chat button" — before, there was only
//   a "read aloud" input box, which merely spoke text rather than holding a conversation.
//   The Chat tab is now the main interface, and Capabilities moves to the second tab
//   (it is for troubleshooting and should not take the prime spot).
//
// ★ Voice logic no longer lives here: it is all in useAvatarVoice, shared with the
//   conversation console.
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
  onOpenRooms?: () => void;
  vaultPath: string | null;
  /** Currently open file name — used as the default "what to explain" for the Feynman panel */
  currentFileName?: string | null;
  /** Text of the currently open file — reference material for the AI to judge the explanation */
  currentFileText?: string | null;
}

/** A single capability check row */
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
        {ok ? "Ready" : "Not ready"}
      </span>
    </div>
  );
}

export default function AvatarPanel({ vaultPath, currentFileName, currentFileText, onOpenRooms }: Props) {
  /**
   * Opens on the Feynman tab by default — that is the Companion's main use:
   * **the user teaches it back, and the AI checks for gaps**.
   * Chat is ordinary Q&A (the AI explains to you), a supplement rather than the main line.
   */
  const [tab, setTab] = useState<"feynman" | "chat" | "probe">("feynman");
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Whether system speech (built into the browser) is available — the free TTS fallback */
  const [sysTts, setSysTts] = useState<{ ok: boolean; voices: number; reason?: string }>({ ok: false, voices: 0 });
  /** Microphone devices */
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
    if (!synth) { setSysTts({ ok: false, voices: 0, reason: "This environment has no built-in speech synthesis" }); return; }
    const read = () => {
      const vs = synth.getVoices?.() ?? [];
      setSysTts({ ok: vs.length > 0, voices: vs.length, reason: vs.length ? undefined : "No voices available on this system" });
    };
    read();
    // The voice list loads asynchronously; the first read may be empty
    synth.addEventListener?.("voiceschanged", read);
    return () => synth.removeEventListener?.("voiceschanged", read);
  }, []);

  // ---- Microphone devices ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const md = (navigator as any).mediaDevices;
        if (!md?.enumerateDevices) {
          if (!cancelled) setMics({ ok: false, count: 0, reason: "This environment cannot enumerate audio devices" });
          return;
        }
        const devs = await md.enumerateDevices();
        const audioIn = (devs ?? []).filter((d: any) => d.kind === "audioinput");
        if (!cancelled) {
          setMics({
            ok: audioIn.length > 0,
            count: audioIn.length,
            reason: audioIn.length ? undefined : "No microphone detected",
          });
        }
      } catch (e: any) {
        if (!cancelled) setMics({ ok: false, count: 0, reason: e?.message ?? String(e) });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!vaultPath) {
    return <div className="tree-empty">Open a vault to use the Companion</div>;
  }

  const localReady = [sysTts.ok, mics.ok, Boolean(probe?.viseme.available)].filter(Boolean).length;
  const cloudReady = Boolean(probe?.tts.available);

  return (
    <div className="companion-panel" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Sub-tabs.
          Feynman comes first — it is the main use (you explain, the AI checks for gaps),
          Chat is ordinary Q&A, and Capabilities is a troubleshooting tool. */}
      <div className="companion-tabs" style={{ flex: "0 0 auto", display: "flex", borderBottom: "1px solid var(--bd)" }}>
        {([["feynman", "Feynman"], ["chat", "Chat"], ["probe", "Capabilities"]] as const).map(([k, label]) => (
          <button
            key={k}
            aria-selected={tab === k}
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

      {/* ---- Feynman: you explain, the AI checks for gaps ---- */}
      {tab === "feynman" && (
        <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
          <FeynmanPanel
            onOpenRooms={onOpenRooms}
            vaultPath={vaultPath}
            cloudReady={cloudReady}
            currentFileName={currentFileName}
            currentFileText={currentFileText}
          />
        </div>
      )}

      {/* ---- Chat ---- */}
      {tab === "chat" && (
        <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
          <AvatarConsole vaultPath={vaultPath} cloudReady={cloudReady} />
        </div>
      )}

      {/* ---- Capabilities ---- */}
      {tab === "probe" && (
        <div style={{ flex: "1 1 auto", overflow: "auto", minHeight: 0 }}>
          <div style={{
            padding: "8px 10px", borderBottom: "1px solid var(--bd)",
            background: "var(--bg-secondary)", fontSize: 11.5,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Capabilities</span>
              <div style={{ flex: "1 1 auto" }} />
              <button
                onClick={() => void run()}
                style={{ color: "var(--accent)", fontSize: 11.5, textDecoration: "underline" }}
              >
                {loading ? "Checking…" : "Check again"}
              </button>
            </div>
            <div style={{ marginTop: 4, color: "var(--text-faint)", lineHeight: 1.7 }}>
              Local capabilities {localReady}/3 · cloud capabilities {cloudReady ? 2 : 0}/2
              <br />
              <span style={{ fontSize: 10.5 }}>
                Local capabilities need no credentials and work right now; cloud capabilities need Tencent Cloud credentials.
              </span>
            </div>
          </div>

          {err && (
            <div style={{ padding: "6px 10px", fontSize: 11.5, color: "var(--red)", background: "#fdecec" }}>
              Check failed: {err}
            </div>
          )}

          <div style={{ padding: "6px 10px 2px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
            Local capabilities (no credentials needed)
          </div>
          <CapRow
            label="Viseme generation"
            cap={probe?.viseme ?? { available: false, reason: "Not checked yet" }}
            hint={probe?.viseme.frames ? `Measured ${probe.viseme.frames} frames` : undefined}
          />
          <CapRow
            label="System speech (TTS fallback)"
            cap={{ available: sysTts.ok, reason: sysTts.reason ?? null }}
            hint={sysTts.ok ? `${sysTts.voices} voices on this system` : undefined}
          />
          <CapRow
            label="Microphone (audio input)"
            cap={{ available: mics.ok, reason: mics.reason ?? null }}
            hint={mics.ok ? `${mics.count} input devices detected` : undefined}
          />

          <div style={{ padding: "10px 10px 2px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
            Cloud capabilities (Tencent Cloud credentials required)
          </div>
          <CapRow label="Speech synthesis (TTS)" cap={probe?.tts ?? { available: false, reason: "Not checked yet" }} />
          <CapRow label="Speech recognition (ASR)" cap={probe?.asr ?? { available: false, reason: "Not checked yet" }} />

          {probe && !probe.credentials.configured && (
            <div style={{
              margin: "8px 10px", padding: "7px 9px", borderRadius: 4,
              background: "var(--bg-secondary)", fontSize: 11, lineHeight: 1.8, color: "var(--text-muted)",
            }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Credentials not configured</div>
              Two ways to configure them:
              <br />· Environment variables <code style={{ fontSize: 10.5 }}>TENCENT_SECRET_ID</code> and <code style={{ fontSize: 10.5 }}>TENCENT_SECRET_KEY</code>
              <br />· Or store them in Gezhi's encrypted credential store
              {probe.credentials.storePath && (
                <div style={{ fontSize: 10.5, color: "var(--text-faint)", wordBreak: "break-all", marginTop: 2 }}>
                  {probe.credentials.storePath}
                </div>
              )}
            </div>
          )}

          {probe?.credentials.configured && (
            <div style={{ margin: "8px 10px", fontSize: 11, color: "#14532d" }}>
              ✔ Credentials ready ({probe.credentials.fromEnv ? "from environment variables" : "from the encrypted credential store"})
            </div>
          )}

          {probe?.limits && (
            <div style={{ padding: "10px", fontSize: 10.5, color: "var(--text-faint)", lineHeight: 1.8 }}>
              Platform limits:
              {probe.limits.ttsMaxChars ? <> {probe.limits.ttsMaxChars} characters per synthesis</> : null}
              {probe.limits.asr?.maxSeconds ? <> · {probe.limits.asr.maxSeconds} seconds per recognition</> : null}
              {probe.limits.asr?.maxBytes ? <> (≤ {(probe.limits.asr.maxBytes / 1024 / 1024).toFixed(1)} MB)</> : null}
              <br />
              Beyond these limits, Gezhi splits the text automatically.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
