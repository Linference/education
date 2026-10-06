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
          {ok ? "就绪" : "未就绪"}
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
      if (!r.ok) { setMsg({ ok: false, text: r.error ?? "操作未完成，请重试" }); return; }
      setSecretId(""); setSecretKey(""); setPassphrase("");
      setMsg({ ok: true, text: `已保存（${r.mode === "dpapi" ? "Windows 账户绑定加密" : "主密码加密"}）。语音功能现在应该可用了。` });
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
      if (!r.ok) { setMsg({ ok: false, text: r.error ?? "操作未完成，请重试" }); return; }
      setDeepseekKey("");
      setMsg({ ok: true, text: "DeepSeek 密钥已保存。" });
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
      if (!r.ok) { setMsg({ ok: false, text: r.error ?? "操作未完成，请重试" }); return; }
      setMsg({ ok: true, text: "已清除。" });
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
      if (!r.ok) { setMsg({ ok: false, text: r.error ?? "操作未完成，请重试" }); return; }
      setMsg({ ok: true, text: dshPath ? "路径已保存，正在复查…" : "已恢复自动探测。" });
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
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>设置</span>
        <div style={{ flex: "1 1 auto" }} />
        <button onClick={() => void refresh()} style={{ fontSize: 11.5, color: "var(--accent)", textDecoration: "underline" }}>
          刷新状态
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
          {h("AI 大脑（DeepSeek Harness）",
            "格致的 AI 由 DeepSeek Harness 驱动。它不在安装包里，需要单独安装并登录 —— 这是 AI 能用起来的前提。")}
          <Row label="状态" value={dshOk ? `可用（版本 ${dsh?.version ?? "未知"}）` : (dsh?.error ?? "未找到")} ok={dshOk} />
          {dsh?.bin && <Row label="可执行文件" value={dsh.bin} />}
          {!dshOk && dsh?.hint && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.75, margin: "4px 0 8px" }}>
              {dsh.hint}
            </div>
          )}
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>
              手动指定 DSH 路径（留空 = 自动探测）
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={dshPath}
                onChange={(e) => setDshPath(e.target.value)}
                placeholder="例如 D:\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"
                style={inputStyle}
              />
              <button onClick={() => void savePath()} disabled={busy} style={btnStyle()}>保存</button>
            </div>
          </div>
        </div>

        {/* ---------------- 腾讯云语音 ---------------- */}
        <div style={sectionStyle}>
          {h("腾讯云语音（说话与识音）",
            "费曼讲解台的语音输入、数字人的朗读都靠它。密钥只存在你自己电脑上，格致不会上传，也不会写进安装包。")}
          <Row
            label="状态"
            value={tencentOk ? `已配置（SecretId 尾号 ${cred?.tencent?.secretIdTail ?? "?"}）` : "未配置"}
            ok={tencentOk}
          />
          {cred?.mode && (
            <Row
              label="加密方式"
              value={cred.mode === "dpapi" ? "Windows 账户绑定（仅本机本账户可解）" : "主密码（scrypt + AES-256-GCM）"}
              hint={cred.path ? `存放位置：${cred.path}` : undefined}
            />
          )}

          <div style={{ marginTop: 8 }}>
            <input
              value={secretId}
              onChange={(e) => setSecretId(e.target.value)}
              placeholder="SecretId（以 AKID 开头，36 位）"
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
              placeholder="主密码（可选；填了就用主密码加密，更强但每次要输）"
              type="password"
              style={{ ...inputStyle, marginBottom: 6 }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => void saveTencent()}
                disabled={busy || !secretId.trim() || !secretKey.trim()}
                style={btnStyle(true)}
              >
                保存密钥
              </button>
              {cred?.exists && (
                <button onClick={() => void del("tencent")} disabled={busy} style={btnStyle()}>
                  清除腾讯云
                </button>
              )}
            </div>
          </div>

          <div style={{ fontSize: 10.5, color: "var(--text-faint)", lineHeight: 1.75, marginTop: 7 }}>
            密钥在腾讯云控制台「访问管理 → API 密钥管理」里创建。
            建议给它只勾选「语音合成」「语音识别」两项权限。
          </div>
        </div>

        {/* ---------------- DeepSeek 密钥 ---------------- */}
        <div style={sectionStyle}>
          {h("DeepSeek 密钥（可选）",
            "如果你的 DeepSeek Harness 已经登录过，这里不用填。留作备用：某些部署方式需要单独提供。")}
          <Row
            label="状态"
            value={cred?.deepseek?.configured ? `已配置（尾号 ${cred.deepseek.apiKeyTail ?? "?"}）` : "未配置"}
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
              保存
            </button>
            {cred?.deepseek?.configured && (
              <button onClick={() => void del("deepseek")} disabled={busy} style={btnStyle()}>清除</button>
            )}
          </div>
        </div>

        {/* ---------------- 应用选项 ---------------- */}
        <div style={sectionStyle}>
          {h("应用选项")}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 0", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={Boolean(settings?.hiFi)}
              onChange={(e) => void toggle("hiFi", e.target.checked)}
            />
            高保真查看 Office 文档
            <span style={{ fontSize: 10.5, color: "var(--text-faint)" }}>
              （用内置 LibreOffice 转 PDF；关掉则 PPT 只能看文字）
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 0", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={Boolean(settings?.preferCloudVoice)}
              onChange={(e) => void toggle("preferCloudVoice", e.target.checked)}
            />
            默认用云端语音
            <span style={{ fontSize: 10.5, color: "var(--text-faint)" }}>
              （音质更好且带真实时间戳，口型更准；关掉则用系统语音）
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 0", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={Boolean(settings?.feynmanSpeakFeedback)}
              onChange={(e) => void toggle("feynmanSpeakFeedback", e.target.checked)}
            />
            费曼台念出反馈
          </label>
        </div>

        {/* ---------------- 存储位置 ---------------- */}
        <div style={sectionStyle}>
          {h("数据存放位置", "都在你自己电脑上。凭据与会话库放在 AppData，不随资料库同步（避免 OneDrive 冲突）。")}
          <Row label="凭据" value={cred?.path ?? "（未创建）"} />
          <Row label="设置" value={paths?.settings ?? "（未知）"} />
          <div style={{ fontSize: 10.5, color: "var(--text-faint)", lineHeight: 1.7, marginTop: 4 }}>
            资料库本身仍在你自己选的位置（如桌面上的「格致试用」）。
          </div>
        </div>

        {cred?.locked && (
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.7 }}>
            凭据库用主密码保护，需要解锁才能查看内容。
          </div>
        )}
      </div>
    </div>
  );
}
