import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import type { EvidenceNode, LearningMode, LearningSummary, StudySource } from '../lib/learning-types';
import type { CompanionReport } from '../lib/companion-types';
import { CONFIDENCE, MODE_LABEL, STATUS, supportLabel } from '../lib/learning-types';
import {measurementText} from '../../../shared/study-format.mjs';

interface Props { summary: LearningSummary; vault: string; focusConcept?: string; onPractice: (mode: LearningMode, concept: string) => void; onOpen: (path: string) => void; onCoach: (text: string) => void; onReport?:(report:CompanionReport)=>void; onStudySource?:(source:StudySource)=>void }
export default function EvidenceMap({ summary: s, vault, focusConcept, onPractice, onOpen, onCoach,onReport,onStudySource }: Props) {
  const [selected, setSelected] = useState(focusConcept || '');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [notes, setNotes] = useState<{ id: string; name: string }[]>([]);
  const [notice, setNotice] = useState('');
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ startX: number; startY: number; originalX: number; originalY: number; id?: string; moved: boolean } | null>(null);
  useEffect(() => { if (focusConcept) { setSelected(focusConcept); setQuery(''); setFilter(''); } }, [focusConcept]);
  useEffect(() => { let alive = true; void window.gezhi.search.graph({ vault, maxNodes: 1500 }).then(r => { if (alive) setNotes((r.nodes || []).filter(n => n.exists)); }).catch(() => {}); return () => { alive = false; }; }, [vault]);
  const nodes = useMemo(() => s.evidence.filter(n => (!query || n.id.toLowerCase().includes(query.toLowerCase())) && (!filter || n.status === filter)).slice(0, 80), [s.evidence, query, filter]);
  const layout = useMemo(() => {
    const groups = [...new Set(nodes.map(n => n.subject))];
    const map: Record<string, { x: number; y: number }> = {};
    const cols = Math.min(3, groups.length || 1), rows = Math.ceil(groups.length / cols);
    groups.forEach((subject, g) => {
      const group = nodes.filter(n => n.subject === subject);
      const cx = 900 / cols * (g % cols + 0.5), cy = 480 / rows * (Math.floor(g / cols) + 0.5);
      group.forEach((n, i) => {
        const ring = Math.floor(i / 10), angle = (i % 10) / Math.min(10, group.length - ring * 10) * Math.PI * 2 - Math.PI / 2;
        const r = group.length === 1 ? 0 : Math.min(150 / rows, 86 + ring * 35);
        map[n.id] = { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
      });
    });
    return map;
  }, [nodes]);
  const point = (id: string) => positions[id] || layout[id];
  const ids = new Set(nodes.map(n => n.id));
  const edges = s.edges.filter(e => ids.has(e.from) && ids.has(e.to));
  const node: EvidenceNode | undefined = s.evidence.find(n => n.id === selected);
  const start = (e: PointerEvent<SVGElement>, id?: string) => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const p = id ? point(id) : camera;
    drag.current = { startX: e.clientX, startY: e.clientY, originalX: p.x, originalY: p.y, id, moved: false };
    svg.current?.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current, rect = svg.current?.getBoundingClientRect(); if (!d || !rect) return;
    const scale = Math.min(rect.width / 900, rect.height / 480), dx = (e.clientX - d.startX) / scale, dy = (e.clientY - d.startY) / scale;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.id) setPositions(prev => ({ ...prev, [d.id!]: { x: d.originalX + dx / camera.zoom, y: d.originalY + dy / camera.zoom } }));
    else setCamera(prev => ({ ...prev, x: d.originalX + dx, y: d.originalY + dy }));
  };
  const finish = (e: PointerEvent<SVGSVGElement>) => { const d = drag.current; if (d?.id && !d.moved) setSelected(d.id); drag.current = null; if (svg.current?.hasPointerCapture(e.pointerId)) svg.current.releasePointerCapture(e.pointerId); };
  const schedule = async () => { if (!node) return; try { const r = await window.gezhi.learning.schedule({ vault, concept: node.id }); setNotice(r.ok ? r.duplicate ? 'A retest for this concept is already in the calendar.' : 'Added to tomorrow’s calendar retest tasks.' : r.error || 'Scheduling failed'); } catch (e) { setNotice((e as Error).message); } };
  return <div className="evidence-layout" data-testid="evidence-map">
    <div className="evidence-main">
      <div className="learning-section-heading"><div><span className="learning-eyebrow">Every status has evidence</span><h2>Learning Evidence Map</h2></div><button onClick={() => { setCamera({ x: 0, y: 0, zoom: 1 }); setPositions({}); }}>Reset view</button></div>
      <p className="learning-muted">Select a node to inspect its evidence. Prerequisites and associations are shown separately; links between files stay in the original relationship graph.</p>
      <div className="evidence-tools"><input aria-label="Search concepts" placeholder="Search concepts…" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="Filter learning status" value={filter} onChange={e => setFilter(e.target.value)}><option value="">All statuses</option>{Object.entries(STATUS).map(([key, v]) => <option key={key} value={key}>{v.label}</option>)}</select><button aria-label="Zoom out evidence map" onClick={() => setCamera(c => ({ ...c, zoom: Math.max(0.5, c.zoom - 0.15) }))}>−</button><button aria-label="Zoom in evidence map" onClick={() => setCamera(c => ({ ...c, zoom: Math.min(2.5, c.zoom + 0.15) }))}>＋</button></div>
      <div className="evidence-canvas">
        <svg ref={svg} viewBox="0 0 900 480" role="group" aria-label="Draggable learning evidence graph" onPointerDown={e => start(e)} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => { drag.current = null; }}>
          <defs><marker id="evidence-arrow" viewBox="0 0 10 10" refX="27" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
          <g transform={'translate(' + camera.x + ' ' + camera.y + ') translate(450 240) scale(' + camera.zoom + ') translate(-450 -240)'}>
            {edges.map((e, i) => <line key={i} x1={point(e.from).x} y1={point(e.from).y} x2={point(e.to).x} y2={point(e.to).y} className={'evidence-edge ' + (selected === e.from || selected === e.to ? 'highlight' : '')} strokeDasharray={e.kind === 'related' ? '4 5' : undefined} markerEnd={e.kind === 'prerequisite' ? 'url(#evidence-arrow)' : undefined}><title>{e.from + ' → ' + e.to + ' · ' + e.source}</title></line>)}
            {nodes.map(n => <g key={n.id} transform={'translate(' + point(n.id).x + ' ' + point(n.id).y + ')'} className={'evidence-node ' + (selected === n.id ? 'selected' : '')} tabIndex={0} role="button" aria-label={n.id + ', ' + STATUS[n.status].label} onPointerDown={e => start(e, n.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(n.id); } }} style={{ '--node-color': STATUS[n.status].color } as CSSProperties}>
              <circle className="node-halo" r="22" /><circle className="node-core" r={8 + Math.min(5, Math.sqrt(n.total))} /><text textAnchor="middle" y="34">{n.id.length > 12 ? n.id.slice(0, 11) + '…' : n.id}</text><title>{n.id + ': ' + n.reason}</title>
            </g>)}
          </g>
        </svg>
        {!nodes.length && <div className="evidence-empty">No matching concepts</div>}
      </div>
      <div className="evidence-legend">{Object.entries(STATUS).map(([k, v]) => <span key={k}><i style={{ background: v.color }} />{v.label}</span>)}<span>Solid arrows: prerequisites</span><span>Dashed: association / co-occurrence</span></div>
      <p className="learning-muted">Showing {nodes.length} nodes (up to 80; search to locate). Relationships come from original instructional design and current question-bank tags.</p>
      <div className="learning-recommendations"><h3>What should I practise next, and why?</h3>{s.recommendations.length ? s.recommendations.map(r => <button key={r.concept} onClick={() => onPractice(r.mode, r.concept)}><strong>{r.concept}</strong><span>{r.reason}</span><small>{MODE_LABEL[r.mode]} →</small></button>) : <p className="learning-muted">Start with one exercise to build evidence; recently passed concepts can move on to a Transfer Challenge.</p>}</div>
    </div>
    <aside className="evidence-inspector" data-testid="evidence-inspector">
      {node ? <><span className="learning-eyebrow">{node.subject}</span><h2>{node.id}</h2><span className="evidence-status" style={{ color: STATUS[node.status].color }}>{STATUS[node.status].label}</span><p>{node.reason}</p>
        <div className="evidence-metrics"><span><b>{node.total}</b> attempts</span><span><b>{node.reportCount||0}</b> explanation reviews</span><span><b>{node.independent}</b> independent passes</span><span><b>{node.transferLevel}/3</b> transfer stages</span></div>
        <p className="learning-muted">{node.delayed ? 'There are independent passes on different questions at least one day apart.' : 'Delayed retest evidence on different questions is still needed.'}</p>
        <div className="learning-actions"><button onClick={() => onPractice('practice', node.id)}>Targeted practice</button><button onClick={() => onPractice('transfer', node.id)}>Transfer Challenge</button><button disabled={!node.total} onClick={() => void schedule()}>Schedule retest</button><button onClick={() => onCoach(node.id + '. ' + node.reason)}>Ask Xiaoge for advice</button></div>
        {notice && <p role="status">{notice}</p>}
        <h3>Attempt evidence</h3>{node.evidence.length ? node.evidence.map(a => <article className="evidence-record" key={a.id}><div><strong>{MODE_LABEL[a.mode]}</strong><time>{new Date(a.at).toLocaleString('zh-CN')}</time></div><p>{a.title}</p><span>{a.correct === null ? 'Unverified / self-assessed' : a.correct ? 'Passed' : 'Not passed'} · {CONFIDENCE[a.confidence]} · {supportLabel(a)}</span><details><summary>Show answer and reasoning</summary><p>Question: {a.prompt}</p><p>Response: {a.response}</p>{a.reflection && <p>Reasoning: {a.reflection}</p>}<p>Reference answer: {a.answer || 'Not provided'}</p><p>{a.explanation}</p>{a.selfVerdict && <p>Self-review: {({ correct: 'correct', partial: 'partly correct', incorrect: 'needs redo' })[a.selfVerdict]}</p>}{a.observation && <p>Observation: {a.observation}</p>}<p className="learning-source">{a.source}</p></details></article>) : <p className="learning-muted">No records yet.</p>}
        {node.total > node.evidence.length && <p className="learning-muted">Showing the latest {node.evidence.length} records; overall statistics use all records.</p>}
        {node.evidence.some(a=>a.mode==='lab')&&<details className="evidence-source"><summary>Experiment run data</summary>{node.evidence.filter(a=>a.mode==='lab').map(a=><p key={a.id}>{a.title}: {measurementText(a.measurement)}</p>)}</details>}
        <h3>Explanation feedback · AI judgment</h3><p className="learning-muted">Explanation feedback and answer checks are shown separately; AI scores do not count as independent passes.</p>{node.aiReports?.length?node.aiReports.map(r=><article className="evidence-record" key={r.id}><strong>{r.topic}</strong><p>{r.summary}</p><time>{new Date(r.at).toLocaleString('zh-CN')}</time><button onClick={()=>onReport?.(r)}>View six-dimension feedback and quotes</button></article>):<p className="learning-muted">No linked explanation feedback yet.</p>}
        <h3>Sources</h3>{node.sources?.length?node.sources.map(ref=><details className="evidence-source" key={ref.id}><summary>{ref.name} · {ref.section}</summary><p>{ref.page?`PDF page ${ref.page}`:`Extracted text, lines ${ref.startLine}–${ref.endLine}`}{ref.origin==='draft'?' · unsaved draft snapshot':''}</p><blockquote>{ref.text}</blockquote><div className="learning-actions"><button onClick={()=>onOpen(ref.path)}>Open original file</button><button onClick={()=>onStudySource?.(ref)}>Continue exploring with this source</button></div></details>):<p className="learning-muted">Early records or built-in examples have no file references.</p>}
        <h3>Linked notes</h3>{notes.filter(n => n.name.replace(/\.[^.]+$/, '').includes(node.id)).slice(0, 6).map(n => <button className="evidence-note" key={n.id} onClick={() => onOpen(n.id)}>↗ {n.name}</button>)}{!notes.some(n => n.name.includes(node.id)) && <p className="learning-muted">No linked note with the same name. Add one in the library.</p>}
      </> : <div className="evidence-inspector-empty"><span>◎</span><h3>Select a concept</h3><p>Review answers, confidence, hint usage, and transfer records to understand the evidence behind each status.</p></div>}
    </aside>
  </div>;
}
