// PPTX / PPT viewer
//
// Data source: **parsed by the main process and passed in**; this component never reads or parses files.
// Reason: the largest PPTX is 219 MB, and sending bytes over IPC crashes the renderer (measured),
// while the extracted text is usually only a few hundred KB. Parsing happens entirely in the main process.
//
// Presentation is a "slide list + text per slide", **not** a faithful visual reproduction:
// the layout, images, and animations in the deck are lost after extraction. The UI must make this clear.
import { useMemo, useState } from "react";

interface Slide {
  index: number;
  title: string;
  lines: string[];
}

interface Props {
  slides: Slide[];
  path: string;
  ext: string;
  /** Parse time (reported by the main process), shown to the user */
  ms?: number;
}

export default function PptViewer({ slides, path, ext, ms }: Props) {
  const [active, setActive] = useState(1);
  const [query, setQuery] = useState("");
  const [showNotice, setShowNotice] = useState(true);

  const isLegacy = ext === ".ppt";
  const name = path.split(/[\\/]/).pop() ?? "";

  // Search: filter by slide (slides containing the keyword)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return slides;
    return slides.filter(
      (s) => s.title.toLowerCase().includes(q) || s.lines.some((l) => l.toLowerCase().includes(q))
    );
  }, [slides, query]);

  if (slides.length === 0) {
    return (
      <div className="empty-state">
        <div style={{ fontSize: 15 }}>No text was extracted from this presentation</div>
        <div style={{ maxWidth: 540, textAlign: "center", lineHeight: 1.9, color: "var(--text-muted)" }}>
          The whole file may be images (a scan, an image-only layout, or formulas inserted as images).
          <br />
          Text in images requires OCR, which is not supported yet.
        </div>
      </div>
    );
  }

  const cur = slides.find((s) => s.index === active) ?? slides[0];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {showNotice && (
        <div
          style={{
            flex: "0 0 auto", display: "flex", alignItems: "flex-start", gap: 8,
            padding: "6px 12px", fontSize: 12, lineHeight: 1.6,
            background: "#fff8e6", color: "#7a5300", borderBottom: "1px solid #f0e0b8",
          }}
        >
          <span style={{ flex: "1 1 auto" }}>
            <b>Text extraction mode</b>: only text is extracted per slide. <b>Images, layout, animation, and master styles cannot be reproduced.</b>
            {isLegacy && " Legacy .ppt is an OLE binary format, so page numbers are **approximate content-based segments**, not the original slide numbers."}
            {ms !== undefined && <> Parsed in {ms}ms.</>}
          </span>
          <button onClick={() => setShowNotice(false)} style={{ flex: "0 0 auto", color: "#7a5300", opacity: 0.7 }} title="Got it">✕</button>
        </div>
      )}

      <div style={{ flex: "1 1 auto", display: "flex", minHeight: 0 }}>
        {/* Left: slide list */}
        <div
          style={{
            flex: "0 0 auto", width: 210, borderRight: "1px solid var(--bd)",
            overflow: "auto", background: "var(--bg-secondary)",
          }}
        >
          <div style={{ padding: "6px 8px" }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search slide content…"
              style={{
                width: "100%", fontSize: 12, padding: "3px 7px",
                border: "1px solid var(--bd-strong)", borderRadius: 5,
                background: "var(--bg-primary)", color: "var(--text-normal)", outline: "none",
              }}
            />
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 5 }}>
              {slides.length} slides total
              {query && ` · ${filtered.length} matching slides`}
            </div>
          </div>

          {filtered.map((s) => (
            <button
              key={s.index}
              onClick={() => setActive(s.index)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "6px 10px", fontSize: 12.5, lineHeight: 1.5,
                background: s.index === active ? "var(--accent-soft)" : "none",
                color: s.index === active ? "var(--accent)" : "var(--text-normal)",
                borderBottom: "1px solid var(--bd)",
              }}
              title={s.title}
            >
              <span style={{ color: "var(--text-faint)", fontFamily: "var(--font-mono)", fontSize: 11, marginRight: 6 }}>
                {String(s.index).padStart(2, "0")}
              </span>
              <span style={{
                display: "inline-block", maxWidth: 148, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom",
              }}>
                {s.title}
              </span>
            </button>
          ))}

          {filtered.length === 0 && <div className="tree-empty">No slides containing “{query}”</div>}
        </div>

        {/* Right: current slide content */}
        <div style={{ flex: "1 1 auto", overflow: "auto", padding: "24px 32px 80px", minWidth: 0 }}>
          <div style={{ maxWidth: 780, margin: "0 auto" }}>
            <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 12 }}>
              {name} · Slide {cur.index} / {slides.length}
            </div>

            {cur.lines.length === 0 ? (
              <div style={{ color: "var(--text-faint)" }}>(No text on this slide)</div>
            ) : (
              <>
                {/* First line as the title */}
                <div
                  className="selectable"
                  style={{ fontSize: 21, fontWeight: 650, lineHeight: 1.5, marginBottom: 16 }}
                >
                  {cur.lines[0]}
                </div>
                {cur.lines.length > 1 && (
                  <div style={{ fontSize: 15, lineHeight: 2, color: "var(--text-normal)" }}>
                    {cur.lines.slice(1).map((l, i) => (
                      <div
                        key={i}
                        className="selectable"
                        style={{
                          display: "flex", gap: 8, marginBottom: 3,
                          // Indented line that looks like a list item: a dash + content
                        }}
                      >
                        <span style={{ color: "var(--text-faint)", flex: "0 0 auto", userSelect: "none" }}>·</span>
                        <span style={{ flex: "1 1 auto", wordBreak: "break-word" }}>{l}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
