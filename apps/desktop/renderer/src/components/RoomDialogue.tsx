import type {DialogueIntent,RoomSession} from '../lib/companion-types';
import type {StudySource} from '../lib/learning-types';
const OPTIONS:Record<string,{intent:DialogueIntent;label:string}[]>={
  peer:[{intent:'clarify',label:'一起理清思路'},{intent:'transfer',label:'换个生活例子'}],
  teacher:[{intent:'clarify',label:'逐步检查推理'},{intent:'counterexample',label:'检查适用条件'}],
  student:[{intent:'clarify',label:'用简单话解释'},{intent:'transfer',label:'举例教会我'}],
  examiner:[{intent:'counterexample',label:'挑战边界条件'},{intent:'transfer',label:'换情境追问'}],
  researcher:[{intent:'test',label:'提出可检验预测'},{intent:'counterexample',label:'改变一个假设'}],
};
export const MISSIONS:Record<string,string>={peer:'一起讨论，互相讲清楚',teacher:'检查概念、条件与每一步推理',student:'教会一位第一次接触概念的学生',examiner:'用边界、反例与新情境接受口试',researcher:'提出假设，预测，再设计验证'};
export function highlight(text:string,quote=''){const start=quote?text.indexOf(quote):-1;return start<0?text:<>{text.slice(0,start)}<mark>{quote}</mark>{text.slice(start+quote.length)}</>;}
interface Props {session:RoomSession;name:string;reply:string;intent:DialogueIntent;busy:boolean;quote?:string;onReply:(text:string)=>void;onIntent:(intent:DialogueIntent)=>void;onContinue:()=>void;onRetry:()=>void;onReference:(source:StudySource,quote:string)=>void;onSpeak:()=>void}
export default function RoomDialogue(p:Props){
  const count=p.session.turns.filter(t=>t.role==='assistant').length,failed=p.session.request?.state==='failed',last=p.session.turns.at(-1);
  return <section className="room-dialogue" data-testid="room-dialogue"><header><div><span className="learning-eyebrow">EXPLAIN · QUESTION · REFINE</span><h3>把问题讲透</h3></div><span>已追问 {count} 轮 · 最多 12 轮</span></header>
    <div className="room-dialogue-turns">{p.session.turns.map((turn,i)=><article key={turn.id} className={'dialogue-turn '+turn.role} data-testid={'dialogue-'+turn.role}>
      <div><strong>{turn.role==='learner'?(i===0?'我的讲解':'我的补充'):p.name}</strong><time>{new Date(turn.at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</time></div>
      <p>{highlight(turn.text,p.quote)}</p>{turn.question&&<p className="dialogue-question">{turn.question}</p>}
      {turn.role==='assistant'&&turn.referenceVerified&&p.session.sourceRef&&<details><summary>查看原文依据</summary><blockquote>{turn.referenceEvidence}</blockquote><button onClick={()=>p.onReference(p.session.sourceRef!,turn.referenceEvidence!)}>在资料中定位</button></details>}
      {turn.role==='assistant'&&!turn.referenceVerified&&<small>本轮未附匹配的原文引用，请结合资料核对。</small>}
    </article>)}</div>
    {p.busy&&<div className="room-thinking" role="status"><i/><i/><i/><span>{p.name}正在准备回应…</span></div>}
    {last?.role==='assistant'&&<button disabled={p.busy} onClick={p.onSpeak}>朗读最新追问</button>}
    {failed?<div className="learning-callout">你的回答已保留。<button disabled={p.busy} onClick={p.onRetry}>重试上轮追问</button></div>:count>=12?<p className="learning-callout">已完成本段 12 轮追问。可以生成整段反馈，或开始新一轮。</p>:<>
      <div className="room-intent-options">{(OPTIONS[p.session.roleId]||OPTIONS.peer).map(option=><button key={option.intent} disabled={p.busy} aria-pressed={p.intent===option.intent} onClick={()=>p.onIntent(option.intent)}>{option.label}</button>)}</div>
      <label>回应这个问题<textarea aria-label="回应角色追问" value={p.reply} maxLength={5000} rows={3} disabled={p.busy||last?.role!=='assistant'} onChange={e=>p.onReply(e.target.value)} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.nativeEvent.isComposing&&!p.busy&&p.reply.trim()){e.preventDefault();p.onContinue();}}} placeholder="补充条件、解释一步，或给出例子。Ctrl+Enter 发送。"/></label>
      <button className="learning-primary" disabled={p.busy||!p.reply.trim()||last?.role!=='assistant'} onClick={p.onContinue}>回应并继续</button>
    </>}
  </section>;
}
