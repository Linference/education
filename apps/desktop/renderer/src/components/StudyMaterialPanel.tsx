import { useEffect, useRef, useState } from 'react';
import type { LearningMode, StudySource } from '../lib/learning-types';

interface Props {
  sources: StudySource[]; source: StudySource | null; loading: boolean; error: string; warning: string;
  name?: string | null; totalPages?: number; isPdf: boolean;
  onSelect: (source: StudySource) => void; onExcerpt: (text: string) => void;
  onLoadPages: (start?: number, end?: number) => void; onOpen: () => void;
  onTask: (mode: LearningMode) => void; onCollapse: () => void;
}
export default function StudyMaterialPanel(p: Props) {
  const [selection, setSelection] = useState(''), [pageStart, setPageStart] = useState(1), [pageEnd, setPageEnd] = useState(20);
  const text = useRef<HTMLDivElement>(null);
  useEffect(() => { setSelection(''); }, [p.source?.id]);
  useEffect(() => { if (p.totalPages) setPageEnd(Math.min(20, p.totalPages)); }, [p.totalPages]);
  const capture = () => {
    const selected = window.getSelection();
    setSelection(selected && text.current?.contains(selected.anchorNode) && text.current.contains(selected.focusNode) ? selected.toString().trim() : '');
  };
  return <aside className="study-source-rail" data-testid="study-source-panel">
    <header><div><span className="learning-eyebrow">LEARNING MATERIAL</span><h3>当前学习资料</h3></div><button aria-label="收起学习资料" onClick={p.onCollapse}>‹</button></header>
    <button className="study-source-link" onClick={p.onOpen}>{p.source?.name || p.name || '到资料库选择文件'} ↗</button>
    {p.isPdf && <div className="study-page-range"><label>起始页<input aria-label="资料起始页" type="number" min={1} value={pageStart} onChange={e => setPageStart(Number(e.target.value))} /></label><label>结束页<input aria-label="资料结束页" type="number" min={pageStart} max={p.totalPages} value={pageEnd} onChange={e => setPageEnd(Number(e.target.value))} /></label><button disabled={p.loading} onClick={() => p.onLoadPages(pageStart,pageEnd)}>读取页段</button><small>{p.totalPages ? `共 ${p.totalPages} 页 · 每次最多 40 页` : '首次读取前 20 页'}</small></div>}
    {p.loading && <p role="status">正在读取资料文字…</p>}
    {p.error && <div className="learning-error" role="alert">{p.error}<button onClick={() => p.onLoadPages()}>重试</button></div>}
    {p.sources.length > 0 && <label className="study-section-picker">章节 / 页段<select aria-label="学习资料章节" value={p.source?.id || ''} onChange={e => { const source = p.sources.find(s => s.id===e.target.value); if (source) p.onSelect(source); }}>{p.source && !p.sources.some(s => s.id===p.source?.id) && <option value={p.source.id}>{p.source.section}</option>}{p.sources.map(s => <option key={s.id} value={s.id}>{s.section}{s.page ? '' : ` · 第 ${s.startLine}–${s.endLine} 行`}</option>)}</select></label>}
    {p.source ? <><div className="study-source-location"><span>{p.source.page ? `PDF 第 ${p.source.page} 页` : `提取文字第 ${p.source.startLine}–${p.source.endLine} 行`}</span>{p.source.origin==='draft' && <span>未保存草稿快照</span>}</div>
      <div ref={text} className="study-source-text" onMouseUp={capture} onKeyUp={capture} tabIndex={0} aria-label="当前章节原文">{p.source.text}</div>
      <button disabled={selection.length<3 || selection.length>7000 || p.loading} onClick={() => { p.onExcerpt(selection); setSelection(''); }}>用选中段落学习{selection ? `（${selection.length} 字）` : ''}</button>
      <div className="study-source-tasks"><button onClick={() => p.onTask('practice')}>解释概念</button><button onClick={() => p.onTask('detective')}>找出反例</button><button onClick={() => p.onTask('transfer')}>迁移应用</button><button onClick={() => p.onTask('lab')}>进入实验</button></div>
      <p className="learning-muted">任务和报告保留此段引用快照；原文件修改后，旧记录仍显示当时使用的内容。</p></> : !p.loading && <p className="learning-muted">打开一份资料，再选择章节。数字空间、练习和实验会沿用当前引用。</p>}
    {p.warning && <p className="learning-muted">{p.warning}</p>}
  </aside>;
}
