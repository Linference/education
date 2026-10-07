import {useEffect,useRef,useState} from 'react';
import type {CompanionReport,HumanReview} from '../lib/companion-types';
import content from '../../../shared/competition-content.json';
interface Props {vault:string;report:CompanionReport;english?:boolean;onSaved?:()=>void}
export default function AssessmentReview({vault,report,english=false,onSaved}:Props){
  const [open,setOpen]=useState(false),[blind,setBlind]=useState(true);
  const [type,setType]=useState<'teacher'|'peer'|'self'>('self'),[alias,setAlias]=useState('');
  const [rows,setRows]=useState(content.dimensions.map(d=>({id:d.id,score:null as number|null,reason:''})));
  const [history,setHistory]=useState<HumanReview[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const alive=useRef(true),submission=useRef(crypto.randomUUID());
  const label=(zh:string,en:string)=>english?en:zh;
  const load=async()=>{const r=await window.gezhi.companions.reviews({vault,reportId:report.id});if(alive.current&&r.ok)setHistory(r.reviews||[]);};
  useEffect(()=>{alive.current=true;void load().catch(e=>{if(alive.current)setError(e.message);});return()=>{alive.current=false;};},[vault,report.id]);
  const change=(id:string,patch:{score?:number|null;reason?:string})=>{submission.current=crypto.randomUUID();setRows(old=>old.map(r=>r.id===id?{...r,...patch}:r));setNotice('');};
  const save=async()=>{
    setBusy(true);setError('');setNotice('');
    try{const r=await window.gezhi.companions.review({vault,id:submission.current,reportId:report.id,reviewerType:type,alias,dimensions:rows});if(!r.ok)throw Error(r.error);if(alive.current){setNotice(label('人工复核已保存。','Human review saved.'));await load();onSaved?.();}}
    catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setBusy(false);}
  };
  return <section className="review-panel" data-testid="assessment-review" lang={english?'en':'zh-CN'}>
    <button className="review-toggle" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{label('人工复核六维反馈','Review the six dimensions')} <span>{history.length?label(`已记录 ${history.length} 次复核`,`${history.length} saved reviews`):label('尚未人工复核','Not yet reviewed')}</span></button>
    {open&&<><p>{label('按原话逐维核对。复核身份由填写者声明，尚未验证；评分差异用于发现问题，不代表学习进步。','Check the learner evidence dimension by dimension. Reviewer roles are self-declared, not identity-verified. Agreement is not a measure of learning improvement.')}</p>
      <div className="review-meta"><label>{label('复核角色','Reviewer role')}<select aria-label={label('复核角色','Reviewer role')} value={type} disabled={busy} onChange={e=>{submission.current=crypto.randomUUID();setType(e.target.value as typeof type);}}><option value="self">{label('学习者自查','Learner self-review')}</option><option value="teacher">{label('教师复核（自声明）','Teacher (self-declared)')}</option><option value="peer">{label('同伴复核','Peer review')}</option></select></label>
      <label>{label('匿名编号（可选）','Anonymous code (optional)')}<input aria-label={label('复核匿名编号','Reviewer anonymous code')} maxLength={60} value={alias} disabled={busy} onChange={e=>{submission.current=crypto.randomUUID();setAlias(e.target.value);}} placeholder={label('例如 T01，不填真实姓名','For example T01; omit real names')}/></label></div>
      <label className="review-blind"><input type="checkbox" checked={blind} onChange={e=>setBlind(e.target.checked)}/>{label('填写时隐藏 AI 分数','Hide AI scores while reviewing')}</label>
      <div className="review-rows">{rows.map(row=>{const dimension=report.dimensions.find(d=>d.id===row.id),en=content.dimensions.find(d=>d.id===row.id)!;return <div key={row.id}><strong>{english?en.label:dimension?.label}</strong>{dimension?.evidence&&<blockquote>{dimension.evidence}</blockquote>}
        <label>{label('人工评分','Human score')}<select aria-label={(english?en.label:dimension?.label)+label('人工评分',' human score')} value={row.score??''} disabled={busy} onChange={e=>change(row.id,{score:e.target.value===''?null:Number(e.target.value)})}><option value="">{label('未观察到','Unobserved')}</option>{[0,1,2,3,4].map(n=><option key={n} value={n}>{n} / 4</option>)}</select></label>
        {!blind&&<small>AI: {dimension?.score??label('未展示','Unobserved')}</small>}
        <label>{label('评分理由','Review reason')}<textarea aria-label={(english?en.label:dimension?.label)+label('复核理由',' review reason')} rows={2} maxLength={1000} value={row.reason} disabled={busy} onChange={e=>change(row.id,{reason:e.target.value})}/></label>
      </div>;})}</div>
      {error&&<p role="alert" className="learning-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
      <button className="learning-primary" disabled={busy} onClick={()=>void save()}>{busy?label('保存中…','Saving…'):label('保存人工复核','Save human review')}</button>
      {history.length>0&&<div className="review-history">{history.slice(0,5).map(r=><details key={r.id}><summary>{r.reviewerType} · {r.alias||label('匿名','Anonymous')} · {new Date(r.at).toLocaleString(english?'en-GB':'zh-CN')}</summary>{r.dimensions.map(d=><p key={d.id}>{english?content.dimensions.find(x=>x.id===d.id)?.label:report.dimensions.find(x=>x.id===d.id)?.label}: AI {d.aiScore??'—'} → {label('人工','Human')} {d.score??'—'} · {d.reason||label('未观察到','Unobserved')}</p>)}</details>)}</div>}
    </>}
  </section>;
}
