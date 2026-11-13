import type {DialogueIntent,RoomSession} from '../lib/companion-types';
import type {StudySource} from '../lib/learning-types';
const OPTIONS:Record<string,{intent:DialogueIntent;label:string}[]>={
  peer:[{intent:'clarify',label:'Think it through together'},{intent:'transfer',label:'Give an everyday example'}],
  teacher:[{intent:'clarify',label:'Check the reasoning step by step'},{intent:'counterexample',label:'Check the conditions'}],
  student:[{intent:'clarify',label:'Explain it in plain words'},{intent:'transfer',label:'Teach me with an example'}],
  examiner:[{intent:'counterexample',label:'Challenge the boundary conditions'},{intent:'transfer',label:'Ask about a different situation'}],
  researcher:[{intent:'test',label:'Make a testable prediction'},{intent:'counterexample',label:'Change one assumption'}],
};
export const MISSIONS:Record<string,string>={peer:'Discuss together and make it clear to each other',teacher:'Check the concept, conditions, and every step of the reasoning',student:'Teach a student meeting the concept for the first time',examiner:'Face an oral exam with boundaries, counterexamples, and new situations',researcher:'Form a hypothesis, predict, then design a test'};
export function highlight(text:string,quote=''){const start=quote?text.indexOf(quote):-1;return start<0?text:<>{text.slice(0,start)}<mark>{quote}</mark>{text.slice(start+quote.length)}</>;}
interface Props {session:RoomSession;name:string;reply:string;intent:DialogueIntent;busy:boolean;quote?:string;onReply:(text:string)=>void;onIntent:(intent:DialogueIntent)=>void;onContinue:()=>void;onRetry:()=>void;onReference:(source:StudySource,quote:string)=>void;onSpeak:()=>void}
export default function RoomDialogue(p:Props){
  const count=p.session.turns.filter(t=>t.role==='assistant').length,failed=p.session.request?.state==='failed',last=p.session.turns.at(-1);
  return <section className="room-dialogue" data-testid="room-dialogue"><header><div><span className="learning-eyebrow">EXPLAIN · QUESTION · REFINE</span><h3>Talk the problem through</h3></div><span>{count} follow-up rounds · up to 12</span></header>
    <div className="room-dialogue-turns">{p.session.turns.map((turn,i)=><article key={turn.id} className={'dialogue-turn '+turn.role} data-testid={'dialogue-'+turn.role}>
      <div><strong>{turn.role==='learner'?(i===0?'My explanation':'My addition'):p.name}</strong><time>{new Date(turn.at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</time></div>
      <p>{highlight(turn.text,p.quote)}</p>{turn.question&&<p className="dialogue-question">{turn.question}</p>}
      {turn.role==='assistant'&&turn.referenceVerified&&p.session.sourceRef&&<details><summary>Show the source basis</summary><blockquote>{turn.referenceEvidence}</blockquote><button onClick={()=>p.onReference(p.session.sourceRef!,turn.referenceEvidence!)}>Locate it in the material</button></details>}
      {turn.role==='assistant'&&!turn.referenceVerified&&<small>This round has no matching quote from the source; check it against the material.</small>}
    </article>)}</div>
    {p.busy&&<div className="room-thinking" role="status"><i/><i/><i/><span>{p.name} is preparing a reply…</span></div>}
    {last?.role==='assistant'&&<button disabled={p.busy} onClick={p.onSpeak}>Read the latest follow-up aloud</button>}
    {failed?<div className="learning-callout">Your answer has been kept.<button disabled={p.busy} onClick={p.onRetry}>Retry the last follow-up</button></div>:count>=12?<p className="learning-callout">All 12 follow-up rounds in this segment are done. Generate feedback for the whole dialogue, or start a new round.</p>:<>
      <div className="room-intent-options">{(OPTIONS[p.session.roleId]||OPTIONS.peer).map(option=><button key={option.intent} disabled={p.busy} aria-pressed={p.intent===option.intent} onClick={()=>p.onIntent(option.intent)}>{option.label}</button>)}</div>
      <label>Answer this question<textarea aria-label="Answer the role's follow-up" value={p.reply} maxLength={5000} rows={3} disabled={p.busy||last?.role!=='assistant'} onChange={e=>p.onReply(e.target.value)} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.nativeEvent.isComposing&&!p.busy&&p.reply.trim()){e.preventDefault();p.onContinue();}}} placeholder="Add a condition, explain one step, or give an example. Ctrl+Enter to send."/></label>
      <button className="learning-primary" disabled={p.busy||!p.reply.trim()||last?.role!=='assistant'} onClick={p.onContinue}>Answer and continue</button>
    </>}
  </section>;
}
