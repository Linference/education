import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, KeyboardEvent } from "react";

interface GNode { id: string; rel?: string; name: string; ext: string; exists: boolean; degree: number }
interface GEdge { source: string; target: string; label: string | null; line: number | null }
interface GraphData { nodes: GNode[]; edges: GEdge[]; truncated?: boolean; totalDocs?: number }
interface Props { vaultPath: string | null; activePath?: string | null; onOpen?: (path: string) => void; onEvidence?: () => void }
interface Options { repel: number; distance: number; center: number; linkForce: number; nodeSize: number; linkWidth: number; labels: number; arrows: boolean }
const DEFAULTS: Options = { repel: 150, distance: 95, center: 0.025, linkForce: 0.18, nodeSize: 1, linkWidth: 0.8, labels: 0.7, arrows: false };
const COLORS = ["#8b7bea", "#5b9bd5", "#59b6a2", "#daa85e", "#d27897", "#7594cc", "#ad8bc6", "#8caf68"];
const OPTION_BOUNDS = { repel: [30, 600], distance: [40, 220], center: [0.005, 0.1], linkForce: [0.05, 0.6], nodeSize: [0.5, 2], linkWidth: [0.3, 2], labels: [0.1, 1.6] };
function folderOf(n: GNode) { const parts = (n.rel ?? "").split(/[\\/]/).filter(Boolean); return parts.length > 1 ? parts[0] : n.exists ? "根目录" : "未创建"; }
function colorOf(folder: string) { let h = 0; for (const ch of folder) h = (h * 31 + ch.charCodeAt(0)) | 0; return COLORS[Math.abs(h) % COLORS.length]; }
function nodeRadius(n: GNode, size: number) { return (3.5 + Math.min(8, Math.sqrt(n.degree) * 1.4)) * size; }
function readOptions(): Options {
  try {
    const saved = JSON.parse(localStorage.getItem("gezhi.graph.visual.v2") ?? "{}");
    const out = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS) as (keyof Options)[]) {
      const v = saved[key];
      if (key === "arrows") out.arrows = typeof v === "boolean" ? v : false;
      else if (typeof v === "number" && Number.isFinite(v)) (out as any)[key] = Math.max(OPTION_BOUNDS[key][0], Math.min(OPTION_BOUNDS[key][1], v));
    }
    return out;
  } catch { return { ...DEFAULTS }; }
}

export default function GraphView({ vaultPath, activePath, onOpen, onEvidence }: Props) {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hideDangling, setHideDangling] = useState(false);
  const [hideOrphans, setHideOrphans] = useState(false);
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());
  const [localRoot, setLocalRoot] = useState<string | null>(null);
  const [depth, setDepth] = useState(1);
  const [hover, setHover] = useState<string | null>(null);
  const [inspected, setInspected] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [options, setOptions] = useState<Options>(readOptions);
  const [settled, setSettled] = useState(false);
  const [zoomLabel, setZoomLabel] = useState(100);
  const [themeVersion, setThemeVersion] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const worker = useRef<Worker | null>(null);
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const camera = useRef({ x: 0, y: 0, k: 1 });
  const size = useRef({ w: 800, h: 600 });
  const layout = useRef({ revision: 0, ids: [] as string[] });
  const autoFit = useRef(true);
  const drawRef = useRef<() => void>(() => {});
  const drawRaf = useRef(0);
  const loadSeq = useRef(0);
  const drag = useRef<{ id: string | null; px: number; py: number; moved: boolean; cameraX: number; cameraY: number } | null>(null);
  const hasVault = Boolean(vaultPath);
  const scheduleDraw = useCallback(() => {
    if (!drawRaf.current) drawRaf.current = requestAnimationFrame(() => { drawRaf.current = 0; drawRef.current(); });
  }, []);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    if (!vaultPath) { setData(null); return; }
    setLoading(true); setErr(null);
    try {
      await window.gezhi.search.open(vaultPath);
      await window.gezhi.search.waitIdle();
      const r = await window.gezhi.search.graph({ vault: vaultPath, maxNodes: 1500, maxEdges: 6000 });
      if (seq !== loadSeq.current) return;
      if (!r.ok) throw new Error(String((r as any).error ?? "图谱载入失败"));
      autoFit.current = true;
      setData({ nodes: r.nodes ?? [], edges: r.edges ?? [], truncated: r.truncated, totalDocs: r.totalDocs });
    } catch (e: any) { if (seq === loadSeq.current) setErr(e.message); }
    finally { if (seq === loadSeq.current) setLoading(false); }
  }, [vaultPath]);
  useEffect(() => { void load(); return () => { loadSeq.current++; }; }, [load]);
  useEffect(() => { setLocalRoot(null); setHiddenGroups(new Set()); setHover(null); setInspected(null); }, [vaultPath]);
  useEffect(() => { try { localStorage.setItem("gezhi.graph.visual.v2", JSON.stringify(options)); } catch { /* storage can be full */ } }, [options]);

  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const n of data?.nodes ?? []) map.set(n.id, new Set());
    for (const e of data?.edges ?? []) { map.get(e.source)?.add(e.target); map.get(e.target)?.add(e.source); }
    return map;
  }, [data]);
  const view = useMemo(() => {
    if (!data) return { nodes: [] as GNode[], edges: [] as GEdge[] };
    let allowed: Set<string> | null = null;
    if (localRoot) {
      allowed = new Set([localRoot]); let frontier = [localRoot];
      for (let d = 0; d < depth; d++) {
        const next: string[] = [];
        for (const id of frontier) for (const other of adjacency.get(id) ?? []) if (!allowed.has(other)) { allowed.add(other); next.push(other); }
        frontier = next;
      }
    }
    const q = query.trim().toLocaleLowerCase();
    const nodes = data.nodes.filter(n => (!hideDangling || n.exists) && (!hideOrphans || (adjacency.get(n.id)?.size ?? 0) > 0)
      && !hiddenGroups.has(folderOf(n)) && (!allowed || allowed.has(n.id)) && (!q || `${n.name} ${n.rel ?? ""}`.toLocaleLowerCase().includes(q)));
    const ids = new Set(nodes.map(n => n.id));
    return { nodes, edges: data.edges.filter(e => ids.has(e.source) && ids.has(e.target)) };
  }, [data, adjacency, query, hideDangling, hideOrphans, hiddenGroups, localRoot, depth]);
  const nodeMap = useMemo(() => new Map(view.nodes.map(n => [n.id, n])), [view]);
  const folders = useMemo(() => {
    const groups = new Map<string, number>();
    for (const n of data?.nodes ?? []) groups.set(folderOf(n), (groups.get(folderOf(n)) ?? 0) + 1);
    return [...groups.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  const fit = useCallback(() => {
    const ps = layout.current.ids.map(id => positions.current.get(id)).filter((p): p is { x: number; y: number } => !!p && Number.isFinite(p.x) && Number.isFinite(p.y));
    if (!ps.length) return;
    const xs = ps.map(p => p.x), ys = ps.map(p => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const { w, h } = size.current;
    const k = Math.max(0.12, Math.min(1.5, (w - 100) / Math.max(160, x1 - x0), (h - 120) / Math.max(160, y1 - y0)));
    camera.current = { k, x: w / 2 - (x0 + x1) / 2 * k, y: h / 2 - (y0 + y1) / 2 * k };
    setZoomLabel(Math.round(k * 100)); scheduleDraw();
  }, [scheduleDraw]);

  useEffect(() => {
    const w = new Worker(new URL("../lib/graph-layout.worker.js", import.meta.url), { type: "module" });
    worker.current = w;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => w.postMessage({ type: "reduced-motion", value: motion.matches });
    updateMotion(); motion.addEventListener("change", updateMotion);
    w.onmessage = ({ data: message }) => {
      if (message.revision !== layout.current.revision) return;
      layout.current.ids.forEach((id, i) => positions.current.set(id, { x: message.positions[i * 2], y: message.positions[i * 2 + 1] }));
      if (message.done) { setSettled(true); if (autoFit.current) { fit(); autoFit.current = false; } }
      scheduleDraw();
    };
    w.onerror = () => { setErr("图谱布局未能启动，请重新载入。"); setSettled(true); };
    const visibility = () => w.postMessage({ type: "pause", value: document.hidden });
    document.addEventListener("visibilitychange", visibility); visibility();
    return () => { w.terminate(); worker.current = null; motion.removeEventListener("change", updateMotion); document.removeEventListener("visibilitychange", visibility); cancelAnimationFrame(drawRaf.current); drawRaf.current = 0; };
  }, [fit, scheduleDraw, hasVault]);

  useEffect(() => {
    setSettled(false); autoFit.current = true;
    const revision = ++layout.current.revision;
    layout.current.ids = view.nodes.map(n => n.id);
    camera.current = { x: size.current.w / 2, y: size.current.h / 2, k: 1 };
    worker.current?.postMessage({ type: "layout", revision, nodes: view.nodes.map(n => ({ ...n, group: folderOf(n) })), edges: view.edges, options });
  }, [view, options.repel, options.distance, options.center, options.linkForce, hasVault]);

  useEffect(() => {
    const element = wrap.current; if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      const old = size.current;
      size.current = { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };
      camera.current.x += (size.current.w - old.w) / 2;
      camera.current.y += (size.current.h - old.h) / 2;
      scheduleDraw();
    };
    const observer = new ResizeObserver(update); observer.observe(element); update();
    return () => observer.disconnect();
  }, [scheduleDraw, hasVault]);
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeVersion(v => v + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const draw = useCallback(() => {
    const el = canvas.current; const ctx = el?.getContext("2d"); if (!el || !ctx) return;
    const { w, h } = size.current; const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) { el.width = Math.round(w * dpr); el.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const style = getComputedStyle(document.documentElement);
    const bg = style.getPropertyValue("--bg-primary").trim();
    const text = style.getPropertyValue("--text-muted").trim();
    const accent = style.getPropertyValue("--accent").trim();
    const dark = document.documentElement.dataset.theme === "dark";
    const cam = camera.current;
    const screen = (p: { x: number; y: number }) => ({ x: p.x * cam.k + cam.x, y: p.y * cam.k + cam.y });
    const focus = hover ?? localRoot;
    const related = focus ? new Set([focus, ...(adjacency.get(focus) ?? [])]) : null;
    for (const edge of view.edges) {
      const a = positions.current.get(edge.source), b = positions.current.get(edge.target); if (!a || !b) continue;
      const p = screen(a), q = screen(b); const active = focus === edge.source || focus === edge.target;
      ctx.globalAlpha = focus ? active ? 0.9 : 0.08 : 0.3;
      ctx.strokeStyle = active ? accent : dark ? "#a6a2b9" : "#8c899d";
      ctx.lineWidth = Math.max(0.5, options.linkWidth * (active ? 1.7 : 1));
      ctx.setLineDash(nodeMap.get(edge.target)?.exists === false ? [3, 4] : []);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      if (options.arrows) {
        const angle = Math.atan2(q.y - p.y, q.x - p.x);
        const r = nodeRadius(nodeMap.get(edge.target)!, options.nodeSize) * Math.sqrt(cam.k) + 3;
        const x = q.x - Math.cos(angle) * r, y = q.y - Math.sin(angle) * r;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5 * Math.cos(angle - 0.5), y - 5 * Math.sin(angle - 0.5));
        ctx.lineTo(x - 5 * Math.cos(angle + 0.5), y - 5 * Math.sin(angle + 0.5)); ctx.closePath(); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
      }
    }
    ctx.setLineDash([]);
    for (const n of view.nodes) {
      const world = positions.current.get(n.id); if (!world) continue; const p = screen(world);
      const r = Math.max(2, nodeRadius(n, options.nodeSize) * Math.sqrt(cam.k));
      ctx.globalAlpha = related && !related.has(n.id) ? 0.16 : 1;
      if (n.id === focus) { ctx.beginPath(); ctx.arc(p.x, p.y, r + 7, 0, Math.PI * 2); ctx.fillStyle = accent; ctx.globalAlpha = 0.14; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      const col = colorOf(folderOf(n));
      if (n.exists) { ctx.fillStyle = n.id === focus ? accent : col; ctx.fill(); }
      else { ctx.strokeStyle = col; ctx.lineWidth = 1.1; ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]); }
    }
    // Screen-space occupancy grid avoids overlapping labels even at overview zoom.
    const occupied = new Set<string>();
    const ordered = [...view.nodes].sort((a, b) => Number(b.id === focus) - Number(a.id === focus) || b.degree - a.degree);
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (const n of ordered) {
      const world = positions.current.get(n.id); if (!world) continue; const p = screen(world);
      if (p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) continue;
      const important = n.id === focus || !!related?.has(n.id);
      const alpha = important ? 1 : Math.max(0, Math.min(1, (cam.k / options.labels - 0.45) * 1.6));
      if (!alpha || (!important && view.nodes.length > 180 && n.degree < 2)) continue;
      const label = n.name.length > 24 ? n.name.slice(0, 23) + "…" : n.name;
      ctx.font = `${n.id === focus ? 600 : 400} 11px "Segoe UI", "Microsoft YaHei", sans-serif`;
      const width = ctx.measureText(label).width + 10;
      const y = p.y + nodeRadius(n, options.nodeSize) * Math.sqrt(cam.k) + 6;
      const cells: string[] = [];
      for (let x = Math.floor((p.x - width / 2) / 20); x <= Math.ceil((p.x + width / 2) / 20); x++)
        for (let row = Math.floor(y / 16); row <= Math.ceil((y + 13) / 16); row++) cells.push(`${x}:${row}`);
      if (!important && cells.some(c => occupied.has(c))) continue;
      cells.forEach(c => occupied.add(c));
      ctx.globalAlpha = related && !related.has(n.id) ? 0.16 : alpha;
      ctx.lineWidth = 4; ctx.strokeStyle = bg; ctx.lineJoin = "round"; ctx.strokeText(label, p.x, y);
      ctx.fillStyle = n.id === focus ? accent : text; ctx.fillText(label, p.x, y);
    }
    ctx.globalAlpha = 1;
  }, [view, nodeMap, options, hover, localRoot, adjacency, themeVersion]);
  useEffect(() => { drawRef.current = draw; scheduleDraw(); }, [draw, scheduleDraw]);

  const zoom = useCallback((factor: number, mx = size.current.w / 2, my = size.current.h / 2) => {
    const c = camera.current; const k = Math.max(0.12, Math.min(4, c.k * factor));
    c.x = mx - (mx - c.x) * k / c.k; c.y = my - (my - c.y) * k / c.k; c.k = k;
    autoFit.current = false; setZoomLabel(Math.round(k * 100)); scheduleDraw();
  }, [scheduleDraw]);
  useEffect(() => {
    const el = canvas.current; if (!el) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [zoom, hasVault]);
  const pick = (x: number, y: number) => {
    let best: string | null = null; let dist = Infinity; const cam = camera.current;
    for (const n of view.nodes) {
      const p = positions.current.get(n.id); if (!p) continue;
      const d = Math.hypot(p.x * cam.k + cam.x - x, p.y * cam.k + cam.y - y);
      if (d < Math.max(8, nodeRadius(n, options.nodeSize) * Math.sqrt(cam.k) + 4) && d < dist) { best = n.id; dist = d; }
    }
    return best;
  };
  const pointer = (e: ReactPointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const p = pointer(e); const id = pick(p.x, p.y); canvas.current?.focus(); e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id, px: p.x, py: p.y, moved: false, cameraX: camera.current.x, cameraY: camera.current.y };
    autoFit.current = false;
  };
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = pointer(e); const d = drag.current;
    if (!d) { const hit = pick(p.x, p.y); setHover(hit); if (hit) setInspected(hit); e.currentTarget.style.cursor = hit ? "pointer" : "grab"; return; }
    if (Math.hypot(p.x - d.px, p.y - d.py) > 4) d.moved = true;
    if (!d.moved) return;
    e.currentTarget.style.cursor = "grabbing";
    if (d.id) {
      const c = camera.current; const pos = { x: (p.x - c.x) / c.k, y: (p.y - c.y) / c.k };
      positions.current.set(d.id, pos);
      worker.current?.postMessage({ type: "pin", revision: layout.current.revision, id: d.id, ...pos });
    } else { camera.current.x = d.cameraX + p.x - d.px; camera.current.y = d.cameraY + p.y - d.py; }
    scheduleDraw();
  };
  const up = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current; drag.current = null; if (!d) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (d.id && d.moved) worker.current?.postMessage({ type: "pin", revision: layout.current.revision, id: d.id, release: true });
    if (d.id && !d.moved) {
      if (nodeMap.get(d.id)?.exists) onOpen?.(d.id);
      else setErr(`「${nodeMap.get(d.id)?.name}」尚未创建。在笔记中保留这条双链即可。`);
    }
  };
  const cancel = () => { const d = drag.current; drag.current = null; if (d?.id) worker.current?.postMessage({ type: "pin", revision: layout.current.revision, id: d.id, release: true }); };
  const keys = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (e.key === "+" || e.key === "=") zoom(1.2);
    else if (e.key === "-") zoom(1 / 1.2);
    else if (e.key === "0" || e.key === "Home") fit();
    else if (e.key.startsWith("Arrow")) { const step = e.shiftKey ? 80 : 30; camera.current.x += e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0; camera.current.y += e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0; scheduleDraw(); }
    else return; e.preventDefault();
  };
  const setOption = (key: keyof Options, value: number | boolean) => setOptions(prev => ({ ...prev, [key]: value }));
  if (!vaultPath) return <div className="tree-empty">打开一个库后可以看到关系图谱</div>;
  const hoverNode = inspected ? nodeMap.get(inspected) : null;

  return <div className="graph-view" data-testid="graph-view" data-settled={settled} data-node-count={view.nodes.length}>
    <header className="graph-toolbar">
      <div className="graph-heading"><span className="graph-symbol">◎</span><div><strong>关系图谱</strong><span>{view.nodes.length} 个节点 · {view.edges.length} 条链接</span></div></div>
      <div className="graph-mode"><button className={!localRoot ? "active" : ""} onClick={() => setLocalRoot(null)}>全局</button><button className={localRoot ? "active" : ""} disabled={!activePath && !hover} title="查看当前笔记的邻近链接" onClick={() => setLocalRoot(hover ?? activePath ?? null)}>局部</button></div>
      {onEvidence && <button className="graph-evidence-link" onClick={onEvidence}>学习证据地图 ↗</button>}
      <button className={`workbench-icon ${showSettings ? "active" : ""}`} aria-label="图谱设置" aria-expanded={showSettings} onClick={() => setShowSettings(v => !v)}>⚙</button>
    </header>
    {err && <div className="graph-error" role="alert">{err}<button aria-label="关闭提示" onClick={() => setErr(null)}>×</button></div>}
    <div className="graph-canvas-wrap" ref={wrap}>
      <canvas ref={canvas} aria-label={`关系图谱，${view.nodes.length} 个节点。拖拽平移，滚轮缩放，点击笔记打开。`} tabIndex={0} onKeyDown={keys}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel} onPointerLeave={() => { if (!drag.current) setHover(null); }}
        onDoubleClick={() => { fit(); autoFit.current = false; }} />
      {localRoot && <div className="graph-local-pill">局部 · {data?.nodes.find(n => n.id === localRoot)?.name ?? "当前笔记"}<button aria-label="退出局部图谱" onClick={() => setLocalRoot(null)}>×</button></div>}
      {(loading || !settled && view.nodes.length > 0) && <div className="graph-layout-status"><span />{loading ? "读取笔记链接" : "布局正在收敛"}</div>}
      {!loading && !view.nodes.length && <div className="graph-empty"><span>◎</span><strong>{data?.nodes.length ? "没有匹配的笔记" : "让知识连接起来"}</strong><p>{data?.nodes.length ? "调整筛选条件，或切回全局图谱。" : "在笔记中写下 [[另一篇笔记]]，这里就会出现连接。"}</p></div>}
      {hoverNode && <div className="graph-inspector"><span style={{ background: colorOf(folderOf(hoverNode)) }} /><div><strong>{hoverNode.name}</strong><small>{folderOf(hoverNode)} · {hoverNode.degree} 个连接</small></div><button onClick={() => setLocalRoot(hoverNode.id)}>查看邻居</button></div>}
      <div className="graph-zoom"><button aria-label="缩小图谱" onClick={() => zoom(1 / 1.2)}>−</button><span data-testid="graph-zoom">{zoomLabel}%</span><button aria-label="放大图谱" onClick={() => zoom(1.2)}>+</button><button aria-label="适应画布" title="适应画布（0）" onClick={fit}>⤢</button></div>
      {showSettings && <aside className="graph-settings">
        <div className="graph-settings-head"><strong>图谱设置</strong><button onClick={() => { setOptions({ ...DEFAULTS }); setQuery(""); setHideDangling(false); setHideOrphans(false); setHiddenGroups(new Set()); }}>重置</button></div>
        <label className="graph-search"><span>搜索笔记</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="名称或路径…" /></label>
        <label className="graph-toggle"><input type="checkbox" checked={hideDangling} onChange={e => setHideDangling(e.target.checked)} />只看已有笔记</label>
        <label className="graph-toggle"><input type="checkbox" checked={hideOrphans} onChange={e => setHideOrphans(e.target.checked)} />隐藏孤立节点</label>
        {localRoot && <label className="graph-range">链接深度 <output>{depth}</output><input aria-label="链接深度" type="range" min="1" max="4" value={depth} onChange={e => setDepth(+e.target.value)} /></label>}
        <details open><summary>颜色分组</summary><div className="graph-group-list">{folders.map(([f, n]) => <button key={f} className={hiddenGroups.has(f) ? "is-hidden" : ""} aria-pressed={!hiddenGroups.has(f)} onClick={() => setHiddenGroups(prev => { const next = new Set(prev); next.has(f) ? next.delete(f) : next.add(f); return next; })}><i style={{ background: colorOf(f) }} /><span>{f}</span><small>{n}</small></button>)}</div></details>
        <details open><summary>显示</summary>{([["nodeSize", "节点大小", 0.5, 2, 0.1], ["linkWidth", "连线粗细", 0.3, 2, 0.1], ["labels", "文字淡出阈值", 0.1, 1.6, 0.1]] as const).map(([key, name, min, max, step]) => <label key={key} className="graph-range">{name}<output>{options[key].toFixed(1)}</output><input aria-label={name} type="range" min={min} max={max} step={step} value={options[key]} onChange={e => setOption(key, +e.target.value)} /></label>)}<label className="graph-toggle"><input type="checkbox" checked={options.arrows} onChange={e => setOption("arrows", e.target.checked)} />显示链接方向</label></details>
        <details><summary>布局力量</summary>{([["repel", "斥力", 30, 600, 10], ["distance", "链接距离", 40, 220, 5], ["center", "中心引力", 0.005, 0.1, 0.005], ["linkForce", "链接拉力", 0.05, 0.6, 0.05]] as const).map(([key, name, min, max, step]) => <label key={key} className="graph-range">{name}<output>{options[key] < 1 ? options[key].toFixed(3) : options[key]}</output><input aria-label={name} type="range" min={min} max={max} step={step} value={options[key]} onChange={e => setOption(key, +e.target.value)} /></label>)}</details>
        <details><summary>笔记列表 · {view.nodes.length}</summary><div className="graph-note-list">{view.nodes.slice(0, 100).map(n => <button key={n.id} disabled={!n.exists} onClick={() => onOpen?.(n.id)}>{n.name}</button>)}</div></details>
        <button className="graph-reload" onClick={() => void load()} disabled={loading}>{loading ? "载入中…" : "重新载入链接"}</button>
      </aside>}
    </div>
    <footer className="graph-footer"><div className="graph-legend">{folders.slice(0, 6).map(([f, n]) => <span key={f}><i style={{ background: colorOf(f) }} />{f}（{n}）</span>)}</div><span>实心 = 已有笔记 · 空心 = 未创建</span><span>拖拽移动 · 滚轮缩放</span>{data?.truncated && <span title={`库里共 ${data.totalDocs} 篇笔记`}>已显示前 {data.nodes.length} 个节点</span>}</footer>
  </div>;
}
