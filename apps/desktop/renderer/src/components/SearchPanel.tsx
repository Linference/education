// 全文检索面板
//
// ★ 检索策略的界面侧配合（实现见 main/indexer.cjs）：
//   SQLite 的 trigram 分词器只索引 ≥3 字符的片段，
//   所以**双字中文词**（电场 / 情态 / 函数）走 FTS 会静默命中 0 条。
//   后端的对策是 ≤2 字自动走 LIKE 扫描。
//   界面上要**如实显示用的是哪种策略** —— 用户看到"LIKE 扫描"就知道
//   这是短词的正常路径，而不是"检索降级了"。
//
// 结果按文件聚合：同一篇笔记里的多处匹配合成一条，避免刷屏。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Hit {
  path: string;
  name: string;
  text: string;
  snip: string;
}

interface Props {
  vaultPath: string | null;
  /** 点结果 → 打开那个文件 */
  onOpen: (filePath: string) => void;
  /** 有未提交的改动时提示（检索的是磁盘上的内容） */
  dirtyCount?: number;
}

interface FileGroup {
  path: string;
  name: string;
  count: number;
  snips: string[];
}

/** FTS 的 snippet 用 \u0001…\u0002 包住命中词，转成可渲染的高亮 */
function renderSnip(snip: string): React.ReactNode {
  const parts = String(snip ?? "").split(/[\u0001\u0002]/);
  return parts.map((p, i) =>
    i % 2 === 1
      ? <mark key={i} style={{ background: "var(--accent-soft)", color: "var(--accent)", padding: "0 1px", borderRadius: 2 }}>{p}</mark>
      : <span key={i}>{p}</span>
  );
}

export default function SearchPanel({ vaultPath, onOpen, dirtyCount = 0 }: Props) {
  const [q, setQ] = useState("");
  const [raw, setRaw] = useState<Hit[]>([]);
  const [strategy, setStrategy] = useState("");
  const [ms, setMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<{ docs: number; chunks: number; links: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** 防抖：连续输入时只在停顿后查一次 */
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshStats = useCallback(async () => {
    if (!vaultPath) return;
    try {
      const s = await window.gezhi.search.stats(vaultPath);
      if (s?.ok !== false) setStats(s);
    } catch { /* 忽略 */ }
  }, [vaultPath]);

  // 打开库时拉一次统计，并订阅索引完成事件
  useEffect(() => {
    if (!vaultPath) { setStats(null); setRaw([]); return; }
    refreshStats();
    const off = window.gezhi.search.onEvent((chan, p) => {
      if (chan === "search:indexed") {
        refreshStats();
        // 索引完成后如果已有查询词，重查一次（否则用户看到的是旧索引的结果）
        setQ((cur) => { if (cur.trim()) void doSearch(cur); return cur; });
      } else if (chan === "search:error") {
        setErr(String(p?.error ?? "索引出错"));
      }
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultPath, refreshStats]);

  const doSearch = useCallback(async (query: string) => {
    if (!vaultPath) return;
    const text = query.trim();
    if (!text) { setRaw([]); setStrategy(""); setMs(0); return; }
    setBusy(true);
    setErr(null);
    try {
      const r = await window.gezhi.search.query({ vault: vaultPath, query: text, limit: 200 });
      if (r?.ok === false) { setErr(String(r.error)); setRaw([]); return; }
      setRaw(r.hits ?? []);
      setStrategy(r.strategy ?? "");
      setMs(r.ms ?? 0);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setRaw([]);
    } finally {
      setBusy(false);
    }
  }, [vaultPath]);

  // 输入防抖
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim()) { setRaw([]); setStrategy(""); return; }
    timerRef.current = setTimeout(() => { void doSearch(q); }, 220);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [q, doSearch]);

  /** 按文件聚合 */
  const groups: FileGroup[] = useMemo(() => {
    const map = new Map<string, FileGroup>();
    for (const h of raw) {
      if (!map.has(h.path)) {
        map.set(h.path, { path: h.path, name: h.name, count: 0, snips: [] });
      }
      const g = map.get(h.path)!;
      g.count++;
      if (g.snips.length < 3 && h.snip) g.snips.push(h.snip);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [raw]);

  const strategyLabel =
    strategy === "fts" ? "FTS 索引" :
    strategy === "like" ? "LIKE 扫描（短词）" :
    strategy === "like-fallback" ? "LIKE 兜底（索引无结果）" : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* 搜索框 */}
      <div style={{ flex: "0 0 auto", padding: "8px 10px 6px" }}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); inputRef.current?.blur(); } }}
          placeholder={vaultPath ? "搜索全部笔记内容…" : "先打开一个库"}
          disabled={!vaultPath}
          style={{
            width: "100%", fontSize: 13, padding: "6px 9px",
            border: "1px solid var(--bd-strong)", borderRadius: 6,
            background: "var(--bg-primary)", color: "var(--text-normal)", outline: "none",
          }}
        />

        {/* 状态行：索引规模 + 本次查询的策略与耗时 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, fontSize: 11, color: "var(--text-faint)" }}>
          {stats && <span>已索引 {stats.docs} 篇 / {stats.chunks} 块</span>}
          {strategyLabel && (
            <>
              <span>·</span>
              <span title={
                strategy === "fts"
                  ? "查询词 ≥3 字，走 trigram 全文索引"
                  : "查询词 ≤2 字：SQLite 的 trigram 不索引这么短的片段，改用扫描（这个规模下同样很快）"
              }>
                {strategyLabel}
              </span>
              <span>·</span>
              <span>{ms}ms</span>
            </>
          )}
        </div>

        {dirtyCount > 0 && (
          <div style={{ marginTop: 4, fontSize: 11, color: "var(--orange)" }}>
            有 {dirtyCount} 个文件未保存 —— 检索的是磁盘上的内容
          </div>
        )}
        {err && <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--red)" }}>{err}</div>}
      </div>

      {/* 结果 */}
      <div style={{ flex: "1 1 auto", overflow: "auto", minHeight: 0 }}>
        {!vaultPath && <div className="tree-empty">打开一个库后可以搜索笔记内容</div>}

        {vaultPath && !q.trim() && (
          <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-faint)", lineHeight: 1.9 }}>
            <div>输入关键词搜索全部笔记。</div>
            <div style={{ marginTop: 8, color: "var(--text-muted)" }}>说明：</div>
            <div>· 3 字以上走全文索引，很快</div>
            <div>· <b>2 字词</b>（如「电场」「函数」）走扫描（SQLite 的 trigram 不索引这么短的片段）</div>
            <div>· 结果按笔记聚合，点一条直接跳过去</div>
          </div>
        )}

        {vaultPath && q.trim() && !busy && groups.length === 0 && !err && (
          <div className="tree-empty">没有匹配「{q}」的内容</div>
        )}

        {groups.map((g) => (
          <button
            key={g.path}
            onClick={() => onOpen(g.path)}
            style={{
              display: "block", width: "100%", textAlign: "left",
              padding: "8px 12px", borderBottom: "1px solid var(--bd)",
              background: "none",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, flex: "1 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {g.name}
              </span>
              <span style={{
                flex: "0 0 auto", fontSize: 10.5, padding: "0 5px", borderRadius: 8,
                background: "var(--accent-soft)", color: "var(--accent)",
              }}>
                {g.count}
              </span>
            </div>
            {g.snips.map((s, i) => (
              <div key={i} style={{
                fontSize: 11.5, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.6,
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}>
                {renderSnip(s)}
              </div>
            ))}
          </button>
        ))}
      </div>

      {/* 底部：重建索引 */}
      {vaultPath && (
        <div style={{
          flex: "0 0 auto", padding: "5px 10px", borderTop: "1px solid var(--bd)",
          background: "var(--bg-secondary)", display: "flex", alignItems: "center", gap: 8, fontSize: 11.5,
        }}>
          <span style={{ color: "var(--text-faint)", flex: "1 1 auto" }}>
            {busy ? "检索中…" : "索引在打开库时自动更新"}
          </span>
          <button
            onClick={async () => {
              setBusy(true);
              try { await window.gezhi.search.reindex(vaultPath); await refreshStats(); if (q.trim()) await doSearch(q); }
              finally { setBusy(false); }
            }}
            style={{ color: "var(--accent)", fontSize: 11.5, textDecoration: "underline" }}
          >
            重建索引
          </button>
        </div>
      )}
    </div>
  );
}
