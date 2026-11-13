// Export menu — Markdown → PDF / Word / Markdown
//
// Product rule: **the user chooses the format**; the software does not decide for them.
// So this is a dropdown menu with the three formats shown as equals, each marked as available or not.
//
// Design notes:
//   1. A missing tool (e.g. Typst not installed) must **not just be disabled**; show the install command —
//      otherwise the user only knows "I can't click it" and not what to do.
//   2. On completion, give a **clear result**: where the file is, how big it is, whether it can be opened.
//      Exporting PDF is slow (it starts Typst), so show progress meanwhile.
//   3. Default to the source file's directory (no path hunting), with "Save as" also available.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ExportCapabilities, ExportResult } from "../types";

interface Props {
  /** Markdown source of the current file */
  markdown: string;
  /** Source file path (determines the output directory) */
  sourcePath: string;
  /** File name (without extension) */
  defaultName: string;
}

type Format = "pdf" | "docx" | "markdown";

/**
 * Show file size at the right scale.
 *
 * Why not always KB: a 32-byte Markdown file shows as "0 KB",
 * and users assume the export failed (this is the reason for the "nothing happened" feedback).
 * Show bytes below 1 KB, so even a tiny file reads "32 B" and never looks empty.
 */
function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const LABEL: Record<Format, { name: string; desc: string; icon: string }> = {
  pdf: { name: "PDF", desc: "Well laid out, good for printing and submission", icon: "P" },
  docx: { name: "Word", desc: "Can be edited further", icon: "W" },
  markdown: { name: "Markdown", desc: "Save an untouched copy", icon: "M" },
};

export default function ExportMenu({ markdown, sourcePath, defaultName }: Props) {
  const [open, setOpen] = useState(false);
  const [cap, setCap] = useState<ExportCapabilities | null>(null);
  const [busy, setBusy] = useState<Format | null>(null);
  const [result, setResult] = useState<(ExportResult & { format: Format }) | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Probe capabilities only when the menu opens (avoid a pointless wait at startup)
  useEffect(() => {
    if (!open || cap) return;
    window.gezhi.exporter.probe().then(setCap).catch(() => setCap(null));
  }, [open, cap]);

  // Close on outside click
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
    if (!cap) return { ok: true };              // Not probed yet; allow clicking for now
    if (f === "markdown") return { ok: true };
    const c = cap[f];
    if (!c) return { ok: true };
    return { ok: c.available, why: c.reason ?? undefined };
  };

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button
        className="icon-btn"
        title="Export (PDF / Word / Markdown)"
        onClick={() => { setOpen((o) => !o); setResult(null); }}
        style={{ width: "auto", padding: "0 8px", fontSize: 12, gap: 4, display: "flex", alignItems: "center" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" />
        </svg>
        Export
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
            Export as (you choose the format)
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
                    {busy === f && <span style={{ color: "var(--text-faint)", marginLeft: 6 }}>Exporting…</span>}
                  </span>
                  <span style={{ display: "block", fontSize: 11.5, color: "var(--text-muted)", marginTop: 1 }}>
                    {av.ok ? info.desc : (av.why ?? "Unavailable")}
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
                    ⚠️ Size must be shown at the right scale.
                    It used to be `((size ?? 0)/1024).toFixed(0)` — 32 bytes rendered as
                    **"0 KB"**, so users thought the export had failed (the "nothing happened" feedback).
                    Small files need bytes; only large files use KB/MB.
                  */}
                  <div>
                    Exported {LABEL[result.format].name}
                    <span style={{ opacity: 0.75, marginLeft: 4 }}>
                      ({fmtBytes(result.size ?? 0)})
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
                    Show in folder
                  </button>
                </>
              ) : result.canceled ? (
                <div>Canceled</div>
              ) : (
                <div style={{ whiteSpace: "pre-wrap" }}>{result.error}</div>
              )}
            </div>
          )}

          {/* Give install guidance when a tool is missing, not just "Unavailable" */}
          {cap && (!cap.pdf.available || !cap.docx.available) && (
            <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-faint)", lineHeight: 1.7, background: "var(--bg-secondary)" }}>
              {!cap.pdf.available && <div>PDF requires Typst: <code>winget install Typst.Typst</code></div>}
              {!cap.docx.available && <div>Word requires python-docx: <code>pip install python-docx</code></div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
