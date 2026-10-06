// 导出菜单 —— Markdown → PDF / Word / Markdown
//
// 产品硬规矩：**格式由用户自己选**，软件不替他决定。
// 所以这里是一个下拉菜单，三种格式平级呈现，各自标注能否使用。
//
// 设计要点：
//   1. 缺工具（比如没装 Typst）时**不是禁用就完事**，要给出安装命令 ——
//      否则用户只知道"点不了"，不知道怎么办。
//   2. 导出完成给**明确结果**：文件在哪、多大、能不能直接打开。
//      导出 PDF 是慢操作（要起 Typst），期间要有进度反馈。
//   3. 默认导出到源文件同目录（用户不用找路径），也可以选"另存为"。
import { useCallback, useEffect, useRef, useState } from "react";
import type { ExportCapabilities, ExportResult } from "../types";

interface Props {
  /** 当前文件的 Markdown 原文 */
  markdown: string;
  /** 源文件路径（决定输出目录） */
  sourcePath: string;
  /** 文件名（不含扩展名） */
  defaultName: string;
}

type Format = "pdf" | "docx" | "markdown";

/**
 * 按量级显示文件大小。
 *
 * 为什么不能统一用 KB：32 字节的 Markdown 用 KB 显示是 "0 KB"，
 * 用户会以为导出失败（实测反馈"导出没反应"就是这个原因）。
 * 小于 1 KB 就显示字节，这样再小也是"32 B"，不会看着像空文件。
 */
function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const LABEL: Record<Format, { name: string; desc: string; icon: string }> = {
  pdf: { name: "PDF", desc: "排版好、适合打印与提交", icon: "P" },
  docx: { name: "Word", desc: "可以继续编辑", icon: "W" },
  markdown: { name: "Markdown", desc: "原样另存一份", icon: "M" },
};

export default function ExportMenu({ markdown, sourcePath, defaultName }: Props) {
  const [open, setOpen] = useState(false);
  const [cap, setCap] = useState<ExportCapabilities | null>(null);
  const [busy, setBusy] = useState<Format | null>(null);
  const [result, setResult] = useState<(ExportResult & { format: Format }) | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // 打开菜单时才探测能力（避免启动时白等）
  useEffect(() => {
    if (!open || cap) return;
    window.gezhi.exporter.probe().then(setCap).catch(() => setCap(null));
  }, [open, cap]);

  // 点外面关掉
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const doExport = useCallback(async (format: Format) => {
    setBusy(format);
    setResult(null);
    try {
      const r = await window.gezhi.exporter.run({
        format,
        markdown,
        sourcePath,
        defaultName,
        saveAs: true,
      });
      setResult({ ...r, format });
    } catch (e: any) {
      setResult({ ok: false, format, error: e?.message ?? String(e) });
    } finally {
      setBusy(null);
    }
  }, [markdown, sourcePath, defaultName]);

  const available = (f: Format): { ok: boolean; why?: string } => {
    if (!cap) return { ok: true };              // 还没探测完，先允许点
    if (f === "markdown") return { ok: true };
    const c = cap[f];
    if (!c) return { ok: true };
    return { ok: c.available, why: c.reason ?? undefined };
  };

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button
        className="icon-btn"
        title="导出（PDF / Word / Markdown）"
        onClick={() => { setOpen((o) => !o); setResult(null); }}
        style={{ width: "auto", padding: "0 8px", fontSize: 12, gap: 4, display: "flex", alignItems: "center" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" />
        </svg>
        导出
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 300,
            background: "var(--bg-primary)",
            border: "1px solid var(--bd-strong)",
            borderRadius: 8,
            boxShadow: "0 6px 24px rgba(0,0,0,.16)",
            zIndex: 50,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-faint)", borderBottom: "1px solid var(--bd)" }}>
            导出为（格式由你决定）
          </div>

          {(Object.keys(LABEL) as Format[]).map((f) => {
            const av = available(f);
            const info = LABEL[f];
            return (
              <button
                key={f}
                disabled={!av.ok || busy !== null}
                onClick={() => av.ok && doExport(f)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  width: "100%",
                  padding: "9px 12px",
                  textAlign: "left",
                  borderBottom: "1px solid var(--bd)",
                  opacity: av.ok ? 1 : 0.5,
                  cursor: av.ok && !busy ? "pointer" : "default",
                  background: "none",
                }}
                onMouseEnter={(e) => { if (av.ok) e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
              >
                <span
                  style={{
                    flex: "0 0 auto",
                    width: 20, height: 20, borderRadius: 4,
                    background: "var(--accent-soft)", color: "var(--accent)",
                    display: "grid", placeItems: "center",
                    fontSize: 11, fontWeight: 700, marginTop: 1,
                  }}
                >
                  {info.icon}
                </span>
                <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13 }}>
                    {info.name}
                    {busy === f && <span style={{ color: "var(--text-faint)", marginLeft: 6 }}>导出中…</span>}
                  </span>
                  <span style={{ display: "block", fontSize: 11.5, color: "var(--text-muted)", marginTop: 1 }}>
                    {av.ok ? info.desc : (av.why ?? "不可用")}
                  </span>
                </span>
              </button>
            );
          })}

          {/* 结果反馈 */}
          {result && (
            <div
              style={{
                padding: "8px 12px",
                fontSize: 12,
                background: result.ok ? "#e9f7ee" : "#fdecec",
                color: result.ok ? "#14532d" : "#8a1f1f",
                lineHeight: 1.6,
              }}
            >
              {result.ok ? (
                <>
                  {/*
                    ⚠️ 大小必须按量级显示。
                    原来写的是 `((size ?? 0)/1024).toFixed(0)` —— 32 字节显示成
                    **「0 KB」**，用户看到以为导出失败了（实测反馈"导出没反应"就是这个）。
                    小文件要显示字节，大文件才用 KB/MB。
                  */}
                  <div>
                    已导出 {LABEL[result.format].name}
                    <span style={{ opacity: 0.75, marginLeft: 4 }}>
                      （{fmtBytes(result.size ?? 0)}）
                    </span>
                  </div>
                  <div style={{ wordBreak: "break-all", fontSize: 11, marginTop: 2, opacity: 0.85 }}>
                    {result.path}
                  </div>
                  {result.warnings?.map((warning,i) => <div key={i} style={{fontSize:11,marginTop:5}}>{warning}</div>)}
                  <button
                    onClick={() => result.path && window.gezhi.exporter.reveal(result.path)}
                    style={{ marginTop: 5, fontSize: 11.5, textDecoration: "underline" }}
                  >
                    在文件夹中显示
                  </button>
                </>
              ) : result.canceled ? (
                <div>已取消</div>
              ) : (
                <div style={{ whiteSpace: "pre-wrap" }}>{result.error}</div>
              )}
            </div>
          )}

          {/* 缺工具时给安装指引，而不是只说"不可用" */}
          {cap && (!cap.pdf.available || !cap.docx.available) && (
            <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-faint)", lineHeight: 1.7, background: "var(--bg-secondary)" }}>
              {!cap.pdf.available && <div>PDF 需要 Typst：<code>winget install Typst.Typst</code></div>}
              {!cap.docx.available && <div>Word 需要 python-docx：<code>pip install python-docx</code></div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
