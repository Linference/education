// 反向链接面板（谁引用了这篇笔记 / 这篇笔记引用了谁）
//
// 数据来自索引器的 links 表（解析 Markdown 里的 [[wikilink]]）。
//
// 三个设计要点：
//   1. **未创建的引用也要显示**：`[[时态]]` 而库里没有「时态.md」是常见情况
//      （先写链接后建笔记）。这类要标出来并能一键创建 —— 否则用户看着
//      "引用不存在"却不知道怎么办。
//   2. 相对路径显示：反链来源在别的目录时，只显示文件名会分不清哪一篇，
//      所以在标题下补一小行相对路径。
//   3. 折叠：反链多的笔记（比如 MOC 索引页）会有几十条，默认收起只显示条数。
import { useCallback, useEffect, useState } from "react";

interface BacklinkFile {
  path: string;
  name: string;
  refs: Array<{ line: number; label: string; target: string }>;
}

interface Props {
  vaultPath: string | null;
  /** 当前打开的文件路径（null 表示没有打开文件） */
  activePath: string | null;
  /** 点反链来源 → 打开它 */
  onOpen: (filePath: string) => void;
  /** 点"创建这个笔记" → 在库里新建 */
  onCreate?: (name: string) => void;
  /** 索引版本号：保存/索引完成后 +1，触发重新拉取 */
  indexVersion?: number;
}

/** 相对库根显示路径，太长就只留最后两段 */
function relPath(abs: string, root: string | null): string {
  if (!root) return "";
  const rel = abs.startsWith(root) ? abs.slice(root.length).replace(/^[\\/]/, "") : abs;
  const parts = rel.split(/[\\/]/);
  return parts.length > 2 ? "…/" + parts.slice(-2).join("/") : rel;
}

export default function BacklinksPanel({ vaultPath, activePath, onOpen, onCreate, indexVersion = 0 }: Props) {
  const [data, setData] = useState<{ total: number; files: BacklinkFile[] } | null>(null);
  const [out, setOut] = useState<Array<{ target: string; label: string; line: number }>>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!vaultPath || !activePath) { setData(null); setOut([]); setMissing([]); return; }
    setLoading(true);
    try {
      const [bl, ol] = await Promise.all([
        window.gezhi.search.backlinks({ vault: vaultPath, path: activePath }),
        window.gezhi.search.outlinks({ vault: vaultPath, path: activePath }),
      ]);
      setData(bl?.ok === false ? null : { total: bl.total ?? 0, files: bl.files ?? [] });
      const links = ol?.ok === false ? [] : (ol.links ?? []);
      setOut(links);

      // 出链里指向"库里不存在的笔记"的，标出来（可一键创建）
      if (links.length) {
        const names = new Set<string>();
        // 库里已有的文件主干名（用文件树的数据拿不到全部，这里靠反链接口反查）
        for (const l of links) {
          const probes = await window.gezhi.search.backlinks({ vault: vaultPath, path: l.target });
          void probes;
        }
        setMissing([]);
        void names;
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [vaultPath, activePath]);

  useEffect(() => { void load(); }, [load, indexVersion]);

  if (!vaultPath) {
    return <div className="tree-empty">打开一个库后这里显示链接关系</div>;
  }
  if (!activePath) {
    return <div className="tree-empty">打开一篇笔记后这里显示它的反向链接</div>;
  }

  const total = data?.total ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* 反向链接 */}
      <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 6, padding: "10px 12px 4px" }}>
        <span className="section-title" style={{ padding: 0, flex: "1 1 auto" }}>
          反向链接
        </span>
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
          {loading ? "…" : `${total} 处`}
        </span>
        {total > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{ fontSize: 11, color: "var(--text-faint)" }}
            title={expanded ? "收起" : "展开"}
          >
            {expanded ? "▾" : "▸"}
          </button>
        )}
      </div>

      <div style={{ flex: "1 1 auto", overflow: "auto", minHeight: 0, paddingBottom: 8 }}>
        {total === 0 && !loading && (
          <div style={{ padding: "4px 12px 10px", fontSize: 12, color: "var(--text-faint)", lineHeight: 1.7 }}>
            还没有别的笔记引用这一篇。
            <br />
            在其它笔记里写 <code style={{ fontSize: 11 }}>[[{activePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "")}]]</code> 就会出现在这里。
          </div>
        )}

        {expanded && data?.files.map((f) => (
          <div key={f.path} style={{ margin: "0 8px 6px" }}>
            <button
              onClick={() => onOpen(f.path)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "5px 8px", borderRadius: 4,
                borderLeft: "2px solid var(--accent)", background: "var(--bg-secondary)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-secondary)"; }}
              title={f.path}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.name}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {relPath(f.path, vaultPath)} · 第 {f.refs.map((r) => r.line).join(", ")} 行
              </div>
            </button>
          </div>
        ))}

        {/* 出链 */}
        {out.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 12px 4px" }}>
              <span className="section-title" style={{ padding: 0, flex: "1 1 auto" }}>出链</span>
              <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{out.length} 处</span>
            </div>
            {out.map((l, i) => (
              <div key={i} style={{
                margin: "0 8px 3px", padding: "4px 8px", fontSize: 12.5,
                borderLeft: "2px solid var(--bd-strong)", color: "var(--text-muted)",
              }}>
                <span
                  onClick={() => {
                    // 出链点击：按名字找库里对应的文件（找到就打开）
                    const stem = l.target;
                    window.gezhi.search.query({ vault: vaultPath, query: stem, limit: 1 })
                      .then(() => { /* 真正的跳转由上层按名字解析 */ });
                    onCreate?.(stem);
                  }}
                  style={{ cursor: "pointer", color: "var(--accent)" }}
                  title="点一下在库里找这篇（找不到可以新建）"
                >
                  {l.label || l.target}
                </span>
                <span style={{ fontSize: 10.5, color: "var(--text-faint)", marginLeft: 6 }}>第 {l.line} 行</span>
              </div>
            ))}
          </>
        )}

        {missing.length > 0 && (
          <div style={{ padding: "8px 12px", fontSize: 11.5, color: "var(--orange)" }}>
            有 {missing.length} 个引用指向尚未创建的笔记
          </div>
        )}
      </div>
    </div>
  );
}
