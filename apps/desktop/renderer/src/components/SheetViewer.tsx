// 电子表格查看器（xlsx / xls）
//
// ★ 为什么不做"转 PDF"：
//   表格数据要的是**看单元格、对比数值、排序**。
//   转成 PDF 出来只是一张静态图 —— 那是把表格当图片处理，方向就错了。
//   （用户直接指出过这一点：把 csv/xlsx 都转 PDF 是错的。）
//
// 数据由**主进程**解析好传进来（xlsx 是 zip + XML，渲染进程没有 fs）。
//
// ★ 必须有虚拟滚动：
//   实测用户的表格有 449 行 × 302 列（13 万个单元格）。
//   全量渲染 13 万个 <td> 会让界面卡死 —— 这是 CSV 查看器早先踩过的同一个坑。
//   所以这里只渲染视口内的行。
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

/** 行高（与 CSS 保持一致，虚拟滚动要用它算偏移） */
const ROW_H = 24;
/** 左侧行号列宽 */
const GUTTER_W = 52;
/** 视口上下各多渲染几行，滚动时不留白 */
const OVERSCAN = 12;
/** 单元格最大显示宽度（超长内容截断，避免一格撑爆整表） */
const CELL_MAX_W = 180;

export default function SheetViewer({ sheets, path, sheetCount, ms }: Props) {
  const [active, setActive] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const sheet = sheets[active];
  const name = path.split(/[\\/]/).pop() ?? "";

  // 视口高度变化时更新（窗口缩放）
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => setViewH(el.clientHeight || 600);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 切表时回到顶部
  useEffect(() => { setScrollTop(0); scrollerRef.current?.scrollTo({ top: 0 }); }, [active]);

  /** 只算要渲染的行区间 */
  const { start, end } = useMemo(() => {
    if (!sheet) return { start: 0, end: 0 };
    const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
    const last = Math.min(sheet.rows.length, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN);
    return { start: first, end: last };
  }, [scrollTop, viewH, sheet]);

  if (!sheets.length) {
    return <div className="empty-state"><div>这个文件里没有可显示的工作表</div></div>;
  }

  const visible = sheet?.rows.slice(start, end) ?? [];
  const totalRows = sheet?.rows.length ?? 0;
  const cols = sheet?.colCount ?? 0;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* 工具条 */}
      <div
        style={{
          flex: "0 0 auto", display: "flex", alignItems: "center", gap: 10,
          padding: "5px 12px", borderBottom: "1px solid var(--bd)",
          background: "var(--bg-secondary)", fontSize: 12,
        }}
      >
        <span style={{ color: "var(--text-muted)" }}>
          {totalRows.toLocaleString()} 行 × {cols.toLocaleString()} 列
        </span>
        {sheet?.truncatedRows && (
          <span style={{ color: "var(--orange)" }} title={`只显示了前 ${totalRows} 行`}>
            （行数过大，已截断显示）
          </span>
        )}
        {sheet?.truncatedCols && (
          <span style={{ color: "var(--orange)" }}>（列数过大，已截断显示）</span>
        )}
        {ms !== undefined && <span style={{ color: "var(--text-faint)" }}>解析 {ms}ms</span>}
        <div style={{ flex: "1 1 auto" }} />
        <span style={{ color: "var(--text-faint)", fontSize: 11 }}>{name}</span>
      </div>

      {/* 工作表切换（多于一张时才显示） */}
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
              title={s.error ?? `${s.rowCount} 行`}
            >
              {s.name}
            </button>
          ))}
          {sheetCount !== undefined && sheetCount > sheets.length && (
            <span style={{ fontSize: 11, color: "var(--text-faint)", alignSelf: "center", paddingLeft: 6 }}>
              （共 {sheetCount} 张，只解析了前 {sheets.length} 张）
            </span>
          )}
        </div>
      )}

      {/* 表格本体：虚拟滚动 */}
      <div
        ref={scrollerRef}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        style={{ flex: "1 1 auto", overflow: "auto", minHeight: 0, position: "relative" }}
      >
        {sheet?.error ? (
          <div className="tree-empty">读不出这张表：{sheet.error}</div>
        ) : (
          <div style={{ position: "relative", minWidth: "min-content" }}>
            {/* 用上下两个占位块撑出总高度，只渲染中间可见的行 */}
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
                      {/* 行号：方便对照，也起到固定列的作用 */}
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

      {/* 底部说明 */}
      <div
        style={{
          flex: "0 0 auto", padding: "4px 12px", fontSize: 11,
          color: "var(--text-faint)", borderTop: "1px solid var(--bd)",
          background: "var(--bg-secondary)", display: "flex", gap: 12,
        }}
      >
        <span>虚拟滚动：只渲染可见的行（大表也不卡）</span>
        <div style={{ flex: "1 1 auto" }} />
        <span>工作表 {active + 1} / {sheets.length}</span>
      </div>
    </div>
  );
}
