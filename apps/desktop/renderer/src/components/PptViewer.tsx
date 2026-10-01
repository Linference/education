// PPTX / PPT 查看器
//
// 数据来源：**由主进程解析好后传进来**，这个组件不读盘、不解析。
// 原因：最大的 PPTX 是 219 MB，走字节 IPC 会把渲染进程搞崩（实测），
// 而提取出的文字通常只有几百 KB。解析全在主进程完成。
//
// 呈现方式是"幻灯片列表 + 每页文字"，**不是**原版视觉还原：
// 课件里的排版、图片、动画在提取后都没有了。这一点在界面上要说明白。
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
  /** 解析耗时（主进程报的），展示给用户看 */
  ms?: number;
}

export default function PptViewer({ slides, path, ext, ms }: Props) {
  const [active, setActive] = useState(1);
  const [query, setQuery] = useState("");
  const [showNotice, setShowNotice] = useState(true);

  const isLegacy = ext === ".ppt";
  const name = path.split(/[\\/]/).pop() ?? "";

  // 搜索：按页筛（含关键词的页）
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
        <div style={{ fontSize: 15 }}>这份演示文稿里没有提取到文字</div>
        <div style={{ maxWidth: 540, textAlign: "center", lineHeight: 1.9, color: "var(--text-muted)" }}>
          可能整份都是图片（扫描件、纯图片排版，或公式以图片形式插入）。
          <br />
          图片里的文字需要 OCR 才能读，目前未支持。
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
            <b>文字提取模式</b>：只提取每页文字，<b>图片、排版、动画与母版样式无法还原</b>。
            {isLegacy && " 旧版 .ppt 是 OLE 二进制格式，页码是**按内容分段近似**的，不是原始页码。"}
            {ms !== undefined && <> 解析耗时 {ms}ms。</>}
          </span>
          <button onClick={() => setShowNotice(false)} style={{ flex: "0 0 auto", color: "#7a5300", opacity: 0.7 }} title="知道了">✕</button>
        </div>
      )}

      <div style={{ flex: "1 1 auto", display: "flex", minHeight: 0 }}>
        {/* 左：页码列表 */}
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
              placeholder="搜索页面内容…"
              style={{
                width: "100%", fontSize: 12, padding: "3px 7px",
                border: "1px solid var(--bd-strong)", borderRadius: 5,
                background: "var(--bg-primary)", color: "var(--text-normal)", outline: "none",
              }}
            />
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 5 }}>
              共 {slides.length} 页
              {query && ` · 命中 ${filtered.length} 页`}
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

          {filtered.length === 0 && <div className="tree-empty">没有含「{query}」的页面</div>}
        </div>

        {/* 右：当前页内容 */}
        <div style={{ flex: "1 1 auto", overflow: "auto", padding: "24px 32px 80px", minWidth: 0 }}>
          <div style={{ maxWidth: 780, margin: "0 auto" }}>
            <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 12 }}>
              {name} · 第 {cur.index} / {slides.length} 页
            </div>

            {cur.lines.length === 0 ? (
              <div style={{ color: "var(--text-faint)" }}>（这一页没有文字）</div>
            ) : (
              <>
                {/* 第一行当标题 */}
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
                          // 看起来像列表项的缩进行：一个短横 + 内容
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
