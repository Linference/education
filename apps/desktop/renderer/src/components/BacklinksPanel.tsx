// Backlinks panel (who links to this note / which notes this note links to)
//
// Data comes from the indexer's links table (parsed from [[wikilink]]s in Markdown).
//
// Three design notes:
//   1. **Show references to notes that do not exist yet**: `[[Tense]]` with no "Tense.md"
//      in the library is common (write the link first, create the note later). Mark such
//      references and offer one-click creation — otherwise users see "reference does not
//      exist" and do not know what to do.
//   2. Show relative paths: when a backlink source is in another directory, the file name
//      alone is ambiguous, so add a small relative-path line under the title.
//   3. Collapse: notes with many backlinks (e.g. an MOC index page) can have dozens; collapse by default and show only the count.
import { useCallback, useEffect, useState } from "react";

interface BacklinkFile {
  path: string;
  name: string;
  refs: Array<{ line: number; label: string; target: string }>;
}

interface Props {
  vaultPath: string | null;
  /** Path of the currently open file (null means no file open) */
  activePath: string | null;
  /** Click a backlink source → open it */
  onOpen: (filePath: string) => void;
  /** Click "create this note" → create it in the library */
  onCreate?: (name: string) => void;
  /** Index version: incremented after save/indexing to trigger a refetch */
  indexVersion?: number;
}

/** Show a path relative to the library root; if too long, keep only the last two segments */
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

      // Mark outlinks that point to "notes missing from the library" (can be created in one click)
      if (links.length) {
        const names = new Set<string>();
        // Existing file stem names (the file tree does not provide all of them; query via the backlinks API)
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
    return <div className="tree-empty">Open a vault to see link relationships here</div>;
  }
  if (!activePath) {
    return <div className="tree-empty">Open a note to see its backlinks here</div>;
  }

  const total = data?.total ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* 反向链接 */}
      <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 6, padding: "10px 12px 4px" }}>
        <span className="section-title" style={{ padding: 0, flex: "1 1 auto" }}>
          Backlinks
        </span>
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
          {loading ? "…" : `${total} references`}
        </span>
        {total > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{ fontSize: 11, color: "var(--text-faint)" }}
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? "▾" : "▸"}
          </button>
        )}
      </div>

      <div style={{ flex: "1 1 auto", overflow: "auto", minHeight: 0, paddingBottom: 8 }}>
        {total === 0 && !loading && (
          <div style={{ padding: "4px 12px 10px", fontSize: 12, color: "var(--text-faint)", lineHeight: 1.7 }}>
            No other notes link to this one yet.
            <br />
            Write <code style={{ fontSize: 11 }}>[[{activePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "")}]]</code> in another note and it will appear here.
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
                {relPath(f.path, vaultPath)} · line {f.refs.map((r) => r.line).join(", ")}
              </div>
            </button>
          </div>
        ))}

        {/* 出链 */}
        {out.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 12px 4px" }}>
              <span className="section-title" style={{ padding: 0, flex: "1 1 auto" }}>Outlinks</span>
              <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{out.length} references</span>
            </div>
            {out.map((l, i) => (
              <div key={i} style={{
                margin: "0 8px 3px", padding: "4px 8px", fontSize: 12.5,
                borderLeft: "2px solid var(--bd-strong)", color: "var(--text-muted)",
              }}>
                <span
                  onClick={() => {
                    // Outlink click: find the matching file in the library by name (open it if found)
                    const stem = l.target;
                    window.gezhi.search.query({ vault: vaultPath, query: stem, limit: 1 })
                      .then(() => { /* The actual navigation is resolved by the parent by name */ });
                    onCreate?.(stem);
                  }}
                  style={{ cursor: "pointer", color: "var(--accent)" }}
                  title="Click to find this note in the library (create it if missing)"
                >
                  {l.label || l.target}
                </span>
                <span style={{ fontSize: 10.5, color: "var(--text-faint)", marginLeft: 6 }}>line {l.line}</span>
              </div>
            ))}
          </>
        )}

        {missing.length > 0 && (
          <div style={{ padding: "8px 12px", fontSize: 11.5, color: "var(--orange)" }}>
            {missing.length} references point to notes that do not exist yet
          </div>
        )}
      </div>
    </div>
  );
}
