// Spreadsheet viewer (xlsx / xls)
//
// ★ Why not "convert to PDF":
//   Tabular data needs **cell inspection, value comparison, sorting**.
//   A PDF is just a static image — that treats a table as a picture, which is the wrong approach.
//   (A user pointed this out directly: converting csv/xlsx to PDF is wrong.)
//
// Data is parsed in the **main process** and passed in (xlsx is zip + XML; the renderer has no fs).
//
// ★ Virtual scrolling is required:
//   A real user's sheet had 449 rows × 302 columns (130k cells).
//   Rendering all 130k <td>s freezes the UI — the same pitfall the CSV viewer hit earlier.
//   So only rows inside the viewport are rendered.
import { useMemo, useRef, useState, useEffect } from "react";

interface SheetData {
  name: string;
  rows: string[][];
  rowCount: number;
  colCount: number;
  truncatedRows?: boolean;
  truncatedCols?: boolean;
  error?: string;
}

interface Props {
  sheets: SheetData[];
  path: string;
  sheetCount?: number;
  ms?: number;
}

/** Row height (keep in sync with CSS; virtual scrolling uses it for offsets) */
const ROW_H = 24;
/** Width of the row-number gutter on the left */
const GUTTER_W = 52;
/** Extra rows rendered above and below the viewport so scrolling never shows blanks */
const OVERSCAN = 12;
/** Max cell display width (long content is truncated so one cell cannot blow up the table) */
const CELL_MAX_W = 180;

export default function SheetViewer({ sheets, path, sheetCount, ms }: Props) {
  const [active, setActive] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const sheet = sheets[active];
  const name = path.split(/[\\/]/).pop() ?? "";

  // Update when the viewport height changes (window resize)
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => setViewH(el.clientHeight || 600);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Return to top when switching sheets
  useEffect(() => { setScrollTop(0); scrollerRef.current?.scrollTo({ top: 0 }); }, [active]);

  /** Compute only the row range to render */
  const { start, end } = useMemo(() => {
    if (!sheet) return { start: 0, end: 0 };
    const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
    const last = Math.min(sheet.rows.length, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN);
    return { start: first, end: last };
  }, [scrollTop, viewH, sheet]);

  if (!sheets.length) {
    return <div className="empty-state"><div>No worksheets to display in this file</div></div>;
  }

  const visible = sheet?.rows.slice(start, end) ?? [];
  const totalRows = sheet?.rows.length ?? 0;
  const cols = sheet?.colCount ?? 0;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Toolbar */}
      <div
        style={{
          flex: "0 0 auto", display: "flex", alignItems: "center", gap: 10,
          padding: "5px 12px", borderBottom: "1px solid var(--bd)",
          background: "var(--bg-secondary)", fontSize: 12,
        }}
      >
        <span style={{ color: "var(--text-muted)" }}>
          {totalRows.toLocaleString()} rows × {cols.toLocaleString()} columns
        </span>
        {sheet?.truncatedRows && (
          <span style={{ color: "var(--orange)" }} title={`Only the first ${totalRows} rows are shown`}>
            (Too many rows; display truncated)
          </span>
        )}
        {sheet?.truncatedCols && (
          <span style={{ color: "var(--orange)" }}>(Too many columns; display truncated)</span>
        )}
        {ms !== undefined && <span style={{ color: "var(--text-faint)" }}>Parsed in {ms}ms</span>}
        <div style={{ flex: "1 1 auto" }} />
        <span style={{ color: "var(--text-faint)", fontSize: 11 }}>{name}</span>
      </div>

      {/* Sheet switcher (shown only when there is more than one) */}
      {sheets.length > 1 && (
        <div
          style={{
            flex: "0 0 auto", display: "flex", gap: 2, padding: "4px 8px",
            borderBottom: "1px solid var(--bd)", background: "var(--bg-secondary)",
            overflowX: "auto",
          }}
        >
          {sheets.map((s, i) => (
            <button
              key={s.name + i}
              onClick={() => setActive(i)}
              style={{
                padding: "3px 12px", fontSize: 12, borderRadius: 4, whiteSpace: "nowrap",
                background: i === active ? "var(--accent-soft)" : "transparent",
                color: i === active ? "var(--accent)" : "var(--text-muted)",
                fontWeight: i === active ? 600 : 400,
              }}
              title={s.error ?? `${s.rowCount} rows`}
            >
              {s.name}
            </button>
          ))}
          {sheetCount !== undefined && sheetCount > sheets.length && (
            <span style={{ fontSize: 11, color: "var(--text-faint)", alignSelf: "center", paddingLeft: 6 }}>
              ({sheetCount} total; only the first {sheets.length} parsed)
            </span>
          )}
        </div>
      )}

      {/* Table body: virtual scrolling */}
      <div
        ref={scrollerRef}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        style={{ flex: "1 1 auto", overflow: "auto", minHeight: 0, position: "relative" }}
      >
        {sheet?.error ? (
          <div className="tree-empty">Could not read this sheet: {sheet.error}</div>
        ) : (
          <div style={{ position: "relative", minWidth: "min-content" }}>
            {/* Two spacer blocks set the total height; only visible rows in the middle are rendered */}
            <div style={{ height: start * ROW_H }} />
            <table
              style={{
                borderCollapse: "collapse",
                fontSize: 12.5,
                fontFamily: "var(--font-mono)",
                tableLayout: "auto",
              }}
            >
              <tbody>
                {visible.map((row, i) => {
                  const rowIdx = start + i;
                  return (
                    <tr key={rowIdx} style={{ height: ROW_H }}>
                      {/* Row number: for reference, and acts as a sticky column */}
                      <td
                        style={{
                          width: GUTTER_W, minWidth: GUTTER_W, textAlign: "right",
                          padding: "0 8px", color: "var(--text-faint)",
                          background: "var(--bg-secondary)",
                          borderRight: "1px solid var(--bd)",
                          borderBottom: "1px solid var(--bd)",
                          position: "sticky", left: 0, zIndex: 1,
                          fontSize: 11,
                          userSelect: "none",
                        }}
                      >
                        {rowIdx + 1}
                      </td>
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          title={cell}
                          style={{
                            padding: "0 8px", whiteSpace: "nowrap",
                            maxWidth: CELL_MAX_W, overflow: "hidden",
                            textOverflow: "ellipsis",
                            borderRight: "1px solid var(--bd)",
                            borderBottom: "1px solid var(--bd)",
                            color: "var(--text-normal)",
                          }}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ height: Math.max(0, (totalRows - end) * ROW_H) }} />
          </div>
        )}
      </div>

      {/* Bottom info */}
      <div
        style={{
          flex: "0 0 auto", padding: "4px 12px", fontSize: 11,
          color: "var(--text-faint)", borderTop: "1px solid var(--bd)",
          background: "var(--bg-secondary)", display: "flex", gap: 12,
        }}
      >
        <span>Virtual scrolling: only visible rows are rendered (large sheets stay smooth)</span>
        <div style={{ flex: "1 1 auto" }} />
        <span>Sheet {active + 1} / {sheets.length}</span>
      </div>
    </div>
  );
}
