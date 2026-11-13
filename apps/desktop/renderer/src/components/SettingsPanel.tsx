// 设置
//
// ★ 这个界面解决的核心问题（用户提出的）：
//   "安装包里面的腾讯云的账号密钥你没放"
//
//   答案是：**不能放，也不该放。**
//     一旦把密钥打进安装包，任何装了格致的人都能拿它去调腾讯云语音 ——
//     账号余额会被别人用光，密钥流到网上也收不回来。
//     正确的做法就是这里：**每个用户填自己的密钥**，存在本机加密库里。
//
// ★ 界面必须把"密钥到底存哪、怎么加密的"说清楚：
//   用户凭什么敢把密钥交给一个软件？得让他看到：
//     · 存在自己电脑上（路径写出来）
//     · Windows 账户绑定加密，不是明文
//     · 格致自己都不会把它显示出来（只显示尾号 4 位）
//
// ★ 另一个必须管的事：**AI 大脑（DSH）**。
//   格致的 AI 走 DeepSeek Harness。别人装了格致但没装 DSH，AI 就是空的。
//   这里要把这个依赖明明白白摆出来，而不是让用户在 AI 面板里对着
//   "未连接"发呆。
import { useCallback, useEffect, useState } from "react";

interface CredStatus {
  ok: boolean;
  path?: string;
  exists?: boolean;
  mode?: string | null;
  bytes?: number;
  updatedAt?: string | null;
  locked?: boolean;
  tencent?: { configured: boolean; secretIdTail: string | null };
  deepseek?: { configured: boolean; apiKeyTail: string | null };
  error?: string;
}

interface DshStatus {
  ok: boolean;
  available?: boolean;
  version?: string | null;
  bin?: string | null;
  error?: string | null;
  custom?: string;
  hint?: string | null;
}

interface Props {
  /** 设置变更后通知外面（例如高保真开关） */
  onChanged?: () => void;
}

/** 一行状态 */
function Row({ label, value, ok, hint }: { label: string; value: string; ok?: boolean; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 0", fontSize: 12 }}>
      <span style={{ flex: "0 0 auto", width: 92, color: "var(--text-muted)" }}>{label}</span>
      <span style={{ flex: "1 1 auto", minWidth: 0, wordBreak: "break-all", color: "var(--text-normal)" }}>
        {value}
        {hint && <div style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 1 }}>{hint}</div>}
      </span>
      {ok !== undefined && (
        <span style={{
          flex: "0 0 auto", fontSize: 10.5, padding: "1px 6px", borderRadius: 8,
          background: ok ? "#e9f7ee" : "#fdecec",
          color: ok ? "#14532d" : "#8a1f1f",
        }}>
          {ok ? "Ready" : "Not ready"}
        </span>
      )}
    </div>
  );
}

export default function SettingsPanel({ onChanged }: Props) {
  const [cred, setCred] = useState<CredStatus | null>(null);
  const [dsh, setDsh] = useState<DshStatus | null>(null);
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  /** 落盘位置（给"数据存放位置"那段用） */
  const [paths, setPaths] = useState<{ settings?: string; credentials?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 输入框
  const [secretId, setSecretId] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [deepseekKey, setDeepseekKey] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [dshPath, setDshPath] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [c, d, s] = await Promise.all([
        window.gezhi.settings.credStatus(),
        window.gezhi.settings.dshStatus(),
        window.gezhi.settings.get(),
      ]);
      setCred(c);
      setDsh(d);
      setSettings(s?.settings ?? null);
      setPaths(s?.paths ?? null);
      setDshPath(String(s?.settings?.dshPath ?? ""));
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message ?? e) });
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  /** 保存腾讯云密钥 */
  const saveTencent = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await window.gezhi.settings.credSave({
        tencent: { secretId, secretKey },
        ...(passphrase ? { passphrase } : {}),
      });
      if (!r.ok) { setMsg({ ok: false, text: r.error ?? "The operation did not complete. Please try again." }); return; }
      setSecretId(""); setSecretKey(""); setPassphrase("");
      setMsg({ ok: true, text: `Saved (${r.mode === "dpapi" ? "encrypted against your Windows account" : "encrypted with a master password"}). Voice features should work now.` });
      await refresh();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const saveDeepseek = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await window.gezhi.settings.credSave({ deepseek: { apiKey: deepseekKey } });
      if (!r.ok) { setMsg({ ok: false, text: r.error ?? "The operation did not complete. Please try again." }); return; }
      setDeepseekKey("");
      setMsg({ ok: true, text: "DeepSeek key saved." });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const del = async (which: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await window.gezhi.settings.credDelete({ which });
      if (!r.ok) { setMsg({ ok: false, text: r.error ?? "The operation did not complete. Please try again." }); return; }
      setMsg({ ok: true, text: "Cleared." });
      await refresh();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const savePath = async () => {
    setBusy(true);
    try {
      const r = await window.gezhi.settings.set({ dshPath });
      if (!r.ok) { setMsg({ ok: false, text: r.error ?? "The operation did not complete. Please try again." }); return; }
      setMsg({ ok: true, text: dshPath ? "Path saved, re-checking…" : "Automatic detection restored." });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (key: string, value: unknown) => {
    const r = await window.gezhi.settings.set({ [key]: value });
    if (r?.ok) { setSettings(r.settings ?? null); onChanged?.(); }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", fontSize: 12.5, padding: "5px 8px",
    border: "1px solid var(--bd-strong)", borderRadius: 5,
    background: "var(--bg-primary)", color: "var(--text-normal)", outline: "none",
    fontFamily: "var(--font-mono)",
  };
  const btnStyle = (primary?: boolean): React.CSSProperties => ({
    padding: "5px 12px", borderRadius: 5, fontSize: 12.5,
    background: primary ? "var(--accent)" : "var(--bg-secondary)",
    color: primary ? "#fff" : "var(--text-normal)",
    cursor: busy ? "not-allowed" : "pointer",
    border: primary ? "none" : "1px solid var(--bd-strong)",
  });
  const sectionStyle: React.CSSProperties = {
    padding: "9px 11px", marginBottom: 10, borderRadius: 6,
    background: "var(--bg-secondary)", border: "1px solid var(--bd)",
  };
  const h = (t: string, sub?: string) => (
    <>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: sub ? 2 : 6 }}>{t}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-faint)", lineHeight: 1.7, marginBottom: 7 }}>{sub}</div>}
    </>
  );

  const tencentOk = Boolean(cred?.tencent?.configured);
  const dshOk = Boolean(dsh?.available);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{
        flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8,
        padding: "7px 10px", borderBottom: "1px solid var(--bd)", background: "var(--bg-secondary)",
      }}>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>Settings</span>
        <div style={{ flex: "1 1 auto" }} />
        <button onClick={() => void refresh()} style={{ fontSize: 11.5, color: "var(--accent)", textDecoration: "underline" }}>
          Refresh status
        </button>
      </div>

      <div style={{ flex: "1 1 auto", overflow: "auto", minHeight: 0, padding: "10px 11px" }}>
        {msg && (
          <div style={{
            padding: "7px 9px", marginBottom: 10, borderRadius: 5, fontSize: 11.5, lineHeight: 1.7,
            background: msg.ok ? "#e9f7ee" : "#fdecec",
            color: msg.ok ? "#14532d" : "#8a1f1f",
          }}>
            {msg.text}
          </div>
        )}

        {/* ---------------- AI 大脑 ---------------- */}
        <div style={sectionStyle}>
          {h("AI kernel (DeepSeek Harness)",
            "Gezhi's AI is driven by DeepSeek Harness. It is not bundled with the installer, so it has to be installed and signed in separately — that is the prerequisite for using the AI.")}
          <Row label="Status" value={dshOk ? `Available (version ${dsh?.version ?? "unknown"})` : (dsh?.error ?? "Not found")} ok={dshOk} />
          {dsh?.bin && <Row label="Executable" value={dsh.bin} />}
          {!dshOk && dsh?.hint && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.75, margin: "4px 0 8px" }}>
              {dsh.hint}
            </div>
          )}
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>
              Specify the DSH path manually (leave empty = automatic detection)
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={dshPath}
                onChange={(e) => setDshPath(e.target.value)}
                placeholder="For example D:\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"
                style={inputStyle}
              />
              <button onClick={() => void savePath()} disabled={busy} style={btnStyle()}>Save</button>
            </div>
          </div>
        </div>

        {/* ---------------- 腾讯云语音 ---------------- */}
        <div style={sectionStyle}>
          {h("Tencent Cloud voice (speech and recognition)",
            "The Feynman desk's voice input and the companion's read-aloud both use it. Keys are stored only on your own computer; Gezhi never uploads them and never writes them into the installer.")}
          <Row
            label="Status"
            value={tencentOk ? `Configured (SecretId ends with ${cred?.tencent?.secretIdTail ?? "?"})` : "Not configured"}
            ok={tencentOk}
          />
          {cred?.mode && (
            <Row
              label="Encryption"
              value={cred.mode === "dpapi" ? "Bound to your Windows account (only this account on this machine can decrypt it)" : "Master password (scrypt + AES-256-GCM)"}
              hint={cred.path ? `Stored at: ${cred.path}` : undefined}
            />
          )}

          <div style={{ marginTop: 8 }}>
            <input
              value={secretId}
              onChange={(e) => setSecretId(e.target.value)}
              placeholder="SecretId (starts with AKID, 36 characters)"
              style={{ ...inputStyle, marginBottom: 5 }}
            />
            <input
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder="SecretKey"
              type="password"
              style={{ ...inputStyle, marginBottom: 5 }}
            />
            <input
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Master password (optional; if set, keys are encrypted with it — stronger, but you must type it every time)"
              type="password"
              style={{ ...inputStyle, marginBottom: 6 }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => void saveTencent()}
                disabled={busy || !secretId.trim() || !secretKey.trim()}
                style={btnStyle(true)}
              >
                Save keys
              </button>
              {cred?.exists && (
                <button onClick={() => void del("tencent")} disabled={busy} style={btnStyle()}>
                  Clear Tencent Cloud
                </button>
              )}
            </div>
          </div>

          <div style={{ fontSize: 10.5, color: "var(--text-faint)", lineHeight: 1.75, marginTop: 7 }}>
            Create the keys in the Tencent Cloud console under Access Management → API Key Management.
            Grant only the "speech synthesis" and "speech recognition" permissions.
          </div>
        </div>

        {/* ---------------- DeepSeek 密钥 ---------------- */}
        <div style={sectionStyle}>
          {h("DeepSeek key (optional)",
            "If your DeepSeek Harness is already signed in, leave this empty. It is a fallback: some deployment setups require a key to be supplied separately.")}
          <Row
            label="Status"
            value={cred?.deepseek?.configured ? `Configured (ends with ${cred.deepseek.apiKeyTail ?? "?"})` : "Not configured"}
            ok={Boolean(cred?.deepseek?.configured)}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <input
              value={deepseekKey}
              onChange={(e) => setDeepseekKey(e.target.value)}
              placeholder="sk-…"
              type="password"
              style={inputStyle}
            />
            <button onClick={() => void saveDeepseek()} disabled={busy || !deepseekKey.trim()} style={btnStyle()}>
              Save
            </button>
            {cred?.deepseek?.configured && (
              <button onClick={() => void del("deepseek")} disabled={busy} style={btnStyle()}>Clear</button>
            )}
          </div>
        </div>

        {/* ---------------- 应用选项 ---------------- */}
        <div style={sectionStyle}>
          {h("Application options")}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 0", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={Boolean(settings?.hiFi)}
              onChange={(e) => void toggle("hiFi", e.target.checked)}
            />
            High-fidelity Office viewing
            <span style={{ fontSize: 10.5, color: "var(--text-faint)" }}>
              (converts to PDF with the bundled LibreOffice; turn it off and PPT shows text only)
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 0", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={Boolean(settings?.preferCloudVoice)}
              onChange={(e) => void toggle("preferCloudVoice", e.target.checked)}
            />
            Use cloud voice by default
            <span style={{ fontSize: 10.5, color: "var(--text-faint)" }}>
              (better sound and real timestamps for more accurate lip sync; turn it off to use the system voice)
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 0", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={Boolean(settings?.feynmanSpeakFeedback)}
              onChange={(e) => void toggle("feynmanSpeakFeedback", e.target.checked)}
            />
            Read Feynman feedback aloud
          </label>
        </div>

        {/* ---------------- 存储位置 ---------------- */}
        <div style={sectionStyle}>
          {h("Where data is stored", "Everything stays on your own computer. Credentials and session databases live in AppData and are not synced with the vault (which avoids OneDrive conflicts).")}
          <Row label="Credentials" value={cred?.path ?? "(not created)"} />
          <Row label="Settings" value={paths?.settings ?? "(unknown)"} />
          <div style={{ fontSize: 10.5, color: "var(--text-faint)", lineHeight: 1.7, marginTop: 4 }}>
            The vault itself stays wherever you chose it (for example "Gezhi Trial" on your desktop).
          </div>
        </div>

        {cred?.locked && (
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.7 }}>
            The credential store is protected by a master password and must be unlocked before its contents can be read.
          </div>
        )}
      </div>
    </div>
  );
}
