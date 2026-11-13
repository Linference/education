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
  useEffect(()=>{if(p.source?.focusQuote)text.current?.querySelector('mark')?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});},[p.source?.focusQuote]);
  useEffect(() => { if (p.totalPages) setPageEnd(Math.min(20, p.totalPages)); }, [p.totalPages]);
  const capture = () => {
    const selected = window.getSelection();
    setSelection(selected && text.current?.contains(selected.anchorNode) && text.current.contains(selected.focusNode) ? selected.toString().trim() : '');
  };
  return <aside className="study-source-rail" data-testid="study-source-panel">
    <header><div><span className="learning-eyebrow">LEARNING MATERIAL</span><h3>Current learning material</h3></div><button aria-label="Collapse the learning material" onClick={p.onCollapse}>‹</button></header>
    <button className="study-source-link" onClick={p.onOpen}>{p.source?.name || p.name || 'Choose a file from the vault'} ↗</button>
    {p.isPdf && <div className="study-page-range"><label>First page<input aria-label="First page of the material" type="number" min={1} value={pageStart} onChange={e => setPageStart(Number(e.target.value))} /></label><label>Last page<input aria-label="Last page of the material" type="number" min={pageStart} max={p.totalPages} value={pageEnd} onChange={e => setPageEnd(Number(e.target.value))} /></label><button disabled={p.loading} onClick={() => p.onLoadPages(pageStart,pageEnd)}>Read these pages</button><small>{p.totalPages ? `${p.totalPages} pages · up to 40 at a time` : 'The first 20 pages are read on first use'}</small></div>}
    {p.loading && <p role="status">Reading the text of the material…</p>}
    {p.error && <div className="learning-error" role="alert">{p.error}<button onClick={() => p.onLoadPages()}>Retry</button></div>}
    {p.sources.length > 0 && <label className="study-section-picker">Section / page range<select aria-label="Section of the learning material" value={p.source?.id || ''} onChange={e => { const source = p.sources.find(s => s.id===e.target.value); if (source) p.onSelect(source); }}>{p.source && !p.sources.some(s => s.id===p.source?.id) && <option value={p.source.id}>{p.source.section}</option>}{p.sources.map(s => <option key={s.id} value={s.id}>{s.section}{s.page ? '' : ` · lines ${s.startLine}–${s.endLine}`}</option>)}</select></label>}
    {p.source ? <><div className="study-source-location"><span>{p.source.page ? `PDF page ${p.source.page}` : `Extracted text, lines ${p.source.startLine}–${p.source.endLine}`}</span>{p.source.origin==='draft' && <span>Unsaved draft snapshot</span>}</div>
      <div ref={text} className="study-source-text" onMouseUp={capture} onKeyUp={capture} tabIndex={0} aria-label="Source text of the current section">{p.source.focusQuote&&p.source.text.includes(p.source.focusQuote)?<>{p.source.text.slice(0,p.source.text.indexOf(p.source.focusQuote))}<mark>{p.source.focusQuote}</mark>{p.source.text.slice(p.source.text.indexOf(p.source.focusQuote)+p.source.focusQuote.length)}</>:p.source.text}</div>
      <button disabled={selection.length<3 || selection.length>7000 || p.loading} onClick={() => { p.onExcerpt(selection); setSelection(''); }}>Learn from the selected passage{selection ? ` (${selection.length} characters)` : ''}</button>
      <div className="study-source-tasks"><button onClick={() => p.onTask('practice')}>Explain the concept</button><button onClick={() => p.onTask('detective')}>Find a counterexample</button><button onClick={() => p.onTask('transfer')}>Apply it elsewhere</button><button onClick={() => p.onTask('lab')}>Open the experiment</button></div>
      <p className="learning-muted">Tasks and reports keep a snapshot of this passage. If the source file changes, old records still show the content used at the time.</p></> : !p.loading && <p className="learning-muted">Open a piece of material, then choose a section. Digital Space, practice, and experiments will use that reference.</p>}
    {p.warning && <p className="learning-muted">{p.warning}</p>}
  </aside>;
}
