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
  const schedule = async () => { if (!node) return; try { const r = await window.gezhi.learning.schedule({ vault, concept: node.id }); setNotice(r.ok ? r.duplicate ? '日历中已有这个知识点的复测待办。' : '已加入明天的日历复测待办。' : r.error || '安排失败'); } catch (e) { setNotice((e as Error).message); } };
  return <div className="evidence-layout" data-testid="evidence-map">
    <div className="evidence-main">
      <div className="learning-section-heading"><div><span className="learning-eyebrow">每个状态，都有依据</span><h2>学习证据地图</h2></div><button onClick={() => { setCamera({ x: 0, y: 0, zoom: 1 }); setPositions({}); }}>重置视图</button></div>
      <p className="learning-muted">点击节点查看作答依据。教学前置关系与关联关系分别显示；文件之间的链接保留在原关系图谱。</p>
      <div className="evidence-tools"><input aria-label="搜索知识点" placeholder="搜索知识点…" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="筛选学习状态" value={filter} onChange={e => setFilter(e.target.value)}><option value="">全部状态</option>{Object.entries(STATUS).map(([key, v]) => <option key={key} value={key}>{v.label}</option>)}</select><button aria-label="缩小证据地图" onClick={() => setCamera(c => ({ ...c, zoom: Math.max(0.5, c.zoom - 0.15) }))}>−</button><button aria-label="放大证据地图" onClick={() => setCamera(c => ({ ...c, zoom: Math.min(2.5, c.zoom + 0.15) }))}>＋</button></div>
      <div className="evidence-canvas">
        <svg ref={svg} viewBox="0 0 900 480" role="group" aria-label="可拖动的学习证据图谱" onPointerDown={e => start(e)} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => { drag.current = null; }}>
          <defs><marker id="evidence-arrow" viewBox="0 0 10 10" refX="27" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
          <g transform={'translate(' + camera.x + ' ' + camera.y + ') translate(450 240) scale(' + camera.zoom + ') translate(-450 -240)'}>
            {edges.map((e, i) => <line key={i} x1={point(e.from).x} y1={point(e.from).y} x2={point(e.to).x} y2={point(e.to).y} className={'evidence-edge ' + (selected === e.from || selected === e.to ? 'highlight' : '')} strokeDasharray={e.kind === 'related' ? '4 5' : undefined} markerEnd={e.kind === 'prerequisite' ? 'url(#evidence-arrow)' : undefined}><title>{e.from + ' → ' + e.to + ' · ' + e.source}</title></line>)}
            {nodes.map(n => <g key={n.id} transform={'translate(' + point(n.id).x + ' ' + point(n.id).y + ')'} className={'evidence-node ' + (selected === n.id ? 'selected' : '')} tabIndex={0} role="button" aria-label={n.id + '，' + STATUS[n.status].label} onPointerDown={e => start(e, n.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(n.id); } }} style={{ '--node-color': STATUS[n.status].color } as CSSProperties}>
              <circle className="node-halo" r="22" /><circle className="node-core" r={8 + Math.min(5, Math.sqrt(n.total))} /><text textAnchor="middle" y="34">{n.id.length > 12 ? n.id.slice(0, 11) + '…' : n.id}</text><title>{n.id + '：' + n.reason}</title>
            </g>)}
          </g>
        </svg>
        {!nodes.length && <div className="evidence-empty">没有匹配的知识点</div>}
      </div>
      <div className="evidence-legend">{Object.entries(STATUS).map(([k, v]) => <span key={k}><i style={{ background: v.color }} />{v.label}</span>)}<span>实线箭头：教学前置</span><span>虚线：关联 / 共现</span></div>
      <p className="learning-muted">显示 {nodes.length} 个节点（最多 80 个，可搜索定位）；关系来自原创教学设计和当前题库标签。</p>
      <div className="learning-recommendations"><h3>下一步，为什么练这一项？</h3>{s.recommendations.length ? s.recommendations.map(r => <button key={r.concept} onClick={() => onPractice(r.mode, r.concept)}><strong>{r.concept}</strong><span>{r.reason}</span><small>{MODE_LABEL[r.mode]} →</small></button>) : <p className="learning-muted">从一道练习开始积累证据；近期独立通过的知识点可以继续进行迁移挑战。</p>}</div>
    </div>
    <aside className="evidence-inspector" data-testid="evidence-inspector">
      {node ? <><span className="learning-eyebrow">{node.subject}</span><h2>{node.id}</h2><span className="evidence-status" style={{ color: STATUS[node.status].color }}>{STATUS[node.status].label}</span><p>{node.reason}</p>
        <div className="evidence-metrics"><span><b>{node.total}</b>条记录</span><span><b>{node.independent}</b>次独立通过</span><span><b>{node.transferLevel}/3</b>迁移关卡</span></div>
        <p className="learning-muted">{node.delayed ? '已有间隔至少一天、不同题目的独立通过记录。' : '尚缺不同题目的延迟复测证据。'}</p>
        <div className="learning-actions"><button onClick={() => onPractice('practice', node.id)}>针对性练习</button><button onClick={() => onPractice('transfer', node.id)}>迁移挑战</button><button disabled={!node.total} onClick={() => void schedule()}>安排复测</button><button onClick={() => onCoach(node.id + '。' + node.reason)}>听小格的建议</button></div>
        {notice && <p role="status">{notice}</p>}
        <h3>作答证据</h3>{node.evidence.length ? node.evidence.map(a => <article className="evidence-record" key={a.id}><div><strong>{MODE_LABEL[a.mode]}</strong><time>{new Date(a.at).toLocaleString('zh-CN')}</time></div><p>{a.title}</p><span>{a.correct === null ? '待核验 / 自评' : a.correct ? '通过' : '未通过'} · {CONFIDENCE[a.confidence]} · {supportLabel(a)}</span><details><summary>展开答案与推理</summary><p>题目：{a.prompt}</p><p>作答：{a.response}</p>{a.reflection && <p>推理：{a.reflection}</p>}<p>参考答案：{a.answer || '未提供'}</p><p>{a.explanation}</p>{a.selfVerdict && <p>自评：{({ correct: '正确', partial: '部分正确', incorrect: '需要重做' })[a.selfVerdict]}</p>}{a.observation && <p>观察：{a.observation}</p>}<p className="learning-source">{a.source}</p></details></article>) : <p className="learning-muted">还没有记录。</p>}
        {node.total > node.evidence.length && <p className="learning-muted">此处显示最近 {node.evidence.length} 条；完整统计保留全部记录。</p>}
        {node.evidence.some(a=>a.mode==='lab')&&<details className="evidence-source"><summary>实验运行数据</summary>{node.evidence.filter(a=>a.mode==='lab').map(a=><p key={a.id}>{a.title}：{measurementText(a.measurement)}</p>)}</details>}
        <h3>讲解反馈 · AI 判断</h3><p className="learning-muted">讲解反馈与作答核验分别展示，AI 分数不计入独立通过。</p>{node.aiReports?.length?node.aiReports.map(r=><article className="evidence-record" key={r.id}><strong>{r.topic}</strong><p>{r.summary}</p><time>{new Date(r.at).toLocaleString('zh-CN')}</time><button onClick={()=>onReport?.(r)}>查看六维反馈与原话</button></article>):<p className="learning-muted">尚无关联讲解反馈。</p>}
        <h3>资料来源</h3>{node.sources?.length?node.sources.map(ref=><details className="evidence-source" key={ref.id}><summary>{ref.name} · {ref.section}</summary><p>{ref.page?`PDF 第 ${ref.page} 页`:`提取文字第 ${ref.startLine}–${ref.endLine} 行`}{ref.origin==='draft'?' · 未保存草稿快照':''}</p><blockquote>{ref.text}</blockquote><div className="learning-actions"><button onClick={()=>onOpen(ref.path)}>打开原文件</button><button onClick={()=>onStudySource?.(ref)}>用此资料继续探究</button></div></details>):<p className="learning-muted">早期记录或内置示例没有文件引用。</p>}
        <h3>关联笔记</h3>{notes.filter(n => n.name.replace(/\.[^.]+$/, '').includes(node.id)).slice(0, 6).map(n => <button className="evidence-note" key={n.id} onClick={() => onOpen(n.id)}>↗ {n.name}</button>)}{!notes.some(n => n.name.includes(node.id)) && <p className="learning-muted">暂无同名关联笔记，可在资料库中添加。</p>}
      </> : <div className="evidence-inspector-empty"><span>◎</span><h3>选中一个知识点</h3><p>查看答案、自信度、提示使用和迁移记录，了解每种状态的依据。</p></div>}
    </aside>
  </div>;
}
