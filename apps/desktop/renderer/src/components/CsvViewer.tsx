// CSV / TSV 表格查看器
//
// ⚠️ 关键约束：**必须虚拟滚动**。
//    实测用户最大的 CSV 是 42.8 MB（FIRMS 全球火点数据），几十万行。
//    全部渲染成 DOM 会直接卡死渲染进程 —— 浏览器几万个节点就开始明显掉帧，
//    几十万行等于自杀。这里只渲染视口内可见的那几十行。
//
// 解析放在 Web Worker 里做吗？暂时不 —— 解析 42 MB 大约几百毫秒，
// 放在主线程会短暂卡顿但可接受；先保证正确，真要更快再挪。
// （如果卡顿明显，下一步就是把 parseCsv 搬进 Worker。）
import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  text: string;
  /** 分隔符：, ; \t | */
  delimiter?: string;
  name: string;
}

/** 解析 CSV 文本 → 行数组。
 *  处理引号包裹、转义引号（""）、以及字段内的换行符 —— 这三个不处理就会错列。 */
function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }   // 转义引号
        else inQuotes = false;
      } else {
        field += c;                                        // 含换行的字段原样保留
      }
      continue;
    }

    if (c === '"') { inQuotes = true; continue; }
    if (c === delimiter) { row.push(field); field = ""; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    if (c === "\r") continue;                              // CRLF
    field += c;
  }
  // 收尾（最后一行可能没有换行符）
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/** 猜分隔符：看第一行里哪种分隔符出现次数最多 */
function guessDelimiter(text: string, ext: string): string {
  if (ext === ".tsv") return "\t";
  const head = text.slice(0, 8192);
  const firstLine = head.split(/\r?\n/)[0] ?? "";
  const counts: Array<[string, number]> = [
    [",", (firstLine.match(/,/g) ?? []).length],
    ["\t", (firstLine.match(/\t/g) ?? []).length],
    [";", (firstLine.match(/;/g) ?? []).length],
    ["|", (firstLine.match(/\|/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

const ROW_H = 26;          // 每行高度（像素），虚拟滚动靠它算位置
const OVERSCAN = 12;       // 视口上下各多渲染几行，滚动时不留白

export default function CsvViewer({ text, name, delimiter: forced }: Props) {
  const ext = name.toLowerCase().endsWith(".tsv") ? ".tsv" : ".csv";
  const delimiter = forced ?? guessDelimiter(text, ext);

  const parsed = useMemo(() => {
    const t0 = performance.now();
    const rows = parseCsv(text, delimiter);
    return { rows, ms: Math.round(performance.now() - t0) };
  }, [text, delimiter]);

  const rows = parsed.rows;
  const header = rows[0] ?? [];
  const body = rows.slice(1);
  const colCount = useMemo(
    () => rows.reduce((m, r) => Math.max(m, r.length), 0),
    [rows]
  );

  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    setViewH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // 过滤：只匹配包含关键词的行（大文件时给用户一个"找得到"的办法）
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return body;
    return body.filter((r) => r.some((c) => c.toLowerCase().includes(q)));
  }, [body, query]);

  // 虚拟滚动：只渲染视口内的行
  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const visibleCount = Math.ceil(viewH / ROW_H) + OVERSCAN * 2;
  const last = Math.min(filtered.length, first + visibleCount);
  const slice = filtered.slice(first, last);

  const sizeMB = (text.length / 1024 / 1024).toFixed(1);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* 工具条 */}
      <div
        style={{
          flex: "0 0 auto", display: "flex", alignItems: "center", gap: 10,
          padding: "6px 12px", background: "var(--bg-secondary)",
          borderBottom: "1px solid var(--bd)", fontSize: 12.5, color: "var(--text-muted)",
        }}
      >
        <span>
          <b>{rows.length.toLocaleString()}</b> 行 × {colCount} 列
        </span>
        <span style={{ color: "var(--text-faint)" }}>
          分隔符 {delimiter === "\t" ? "Tab" : delimiter} · 解析 {parsed.ms}ms · {sizeMB} MB
        </span>
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setScrollTop(0); wrapRef.current?.scrollTo(0, 0); }}
          placeholder="在表格里查找…"
          style={{
            marginLeft: "auto", width: 200, fontSize: 12.5, padding: "3px 8px",
            border: "1px solid var(--bd-strong)", borderRadius: 5,
            background: "var(--bg-primary)", color: "var(--text-normal)", outline: "none",
          }}
        />
        {query && (
          <span style={{ color: "var(--accent)" }}>
            {filtered.length.toLocaleString()} 行匹配
          </span>
        )}
      </div>

      {/* 表头 */}
      <div
        style={{
          flex: "0 0 auto", display: "flex", background: "var(--bg-tertiary)",
          borderBottom: "1px solid var(--bd-strong)", fontSize: 12.5, fontWeight: 600,
          overflow: "hidden",
        }}
      >
        <div style={{ flex: "0 0 auto", width: 56, padding: "5px 8px", color: "var(--text-faint)", textAlign: "right" }}>#</div>
        <div style={{ flex: "1 1 auto", display: "flex", overflowX: "auto" }}>
          {Array.from({ length: colCount }, (_, i) => (
            <div
              key={i}
              title={header[i] ?? ""}
              style={{
                flex: "0 0 auto", minWidth: 130, maxWidth: 320, padding: "5px 10px",
                borderRight: "1px solid var(--bd)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {header[i] ?? `列${i + 1}`}
            </div>
          ))}
        </div>
      </div>

      {/* 表格体：虚拟滚动 */}
      <div
        ref={wrapRef}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        style={{ flex: "1 1 auto", overflow: "auto", position: "relative" }}
      >
        {filtered.length === 0 ? (
          <div className="tree-empty">没有匹配的行</div>
        ) : (
          <div style={{ height: filtered.length * ROW_H, position: "relative" }}>
            <div style={{ position: "absolute", top: first * ROW_H, left: 0, right: 0 }}>
              {slice.map((r, i) => {
                const rowNo = first + i + 1;
                return (
                  <div
                    key={rowNo}
                    style={{
                      display: "flex", height: ROW_H, fontSize: 12.5,
                      borderBottom: "1px solid var(--bd)",
                      background: rowNo % 2 ? "transparent" : "var(--bg-secondary)",
                    }}
                  >
                    <div
                      style={{
                        flex: "0 0 auto", width: 56, padding: "4px 8px",
                        color: "var(--text-faint)", textAlign: "right",
                        fontFamily: "var(--font-mono)", fontSize: 11.5,
                      }}
                    >
                      {rowNo}
                    </div>
                    <div style={{ flex: "1 1 auto", display: "flex", overflow: "hidden" }}>
                      {Array.from({ length: colCount }, (_, ci) => (
                        <div
                          key={ci}
                          title={r[ci] ?? ""}
                          style={{
                            flex: "0 0 auto", minWidth: 130, maxWidth: 320, padding: "4px 10px",
                            borderRight: "1px solid var(--bd)",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            textAlign: /^-?\d+(\.\d+)?$/.test(r[ci] ?? "") ? "right" : "left",
                          }}
                        >
                          {r[ci] ?? ""}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 底部提示 */}
      <div
        style={{
          flex: "0 0 auto", padding: "3px 12px", fontSize: 11.5,
          color: "var(--text-faint)", borderTop: "1px solid var(--bd)",
          background: "var(--bg-secondary)",
        }}
      >
        虚拟滚动：只渲染可见的 {slice.length} 行（共 {filtered.length.toLocaleString()} 行）
        {first > 0 && <> · 已滚过 {first.toLocaleString()} 行</>}
      </div>
    </div>
  );
}
