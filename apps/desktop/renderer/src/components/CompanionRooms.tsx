import {useEffect,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import type {CompanionReport,CompanionRole,DialogueIntent,RoomDraft,RoomSession,RoomSessionSummary} from '../lib/companion-types';
import type {LearningMode,StudySource} from '../lib/learning-types';
import RolePortrait from './RolePortrait';
import AssessmentRadar from './AssessmentRadar';
import AssessmentReview from './AssessmentReview';
import RoomDialogue,{MISSIONS} from './RoomDialogue';
import {useAvatarVoice} from './useAvatarVoice';
import {useMicRecorder} from './useMicRecorder';
import {useSurfaceMotion} from '../lib/useSurfaceMotion';
import {markdownToSpeech} from './viseme';
import {sourceLocation} from '../../../shared/study-format.mjs';
interface Props {vault:string;referenceName?:string|null;referenceText?:string|null;studySource?:StudySource|null;visible?:boolean;initialReport?:CompanionReport|null;onRecorded?:()=>void;onTask?:(mode:LearningMode,focus:string,source?:StudySource|null)=>void;onSource?:(source:StudySource|null)=>void}
type CachedDraft=RoomDraft&{roleId:string};
const memory=new Map<string,CachedDraft>();
const keyOf=(vault:string,role:string,source?:string|null)=>vault+'\0'+role+'\0'+(source||'free');
const defaultIntent=(id:string):DialogueIntent=>id==='researcher'?'test':id==='examiner'?'counterexample':'clarify';
export default function CompanionRooms({vault,referenceName,referenceText,studySource=null,visible=true,initialReport,onRecorded,onTask,onSource}:Props){
  const [roles,setRoles]=useState<CompanionRole[]>([]),[roleId,setRoleId]=useState('');
  const [topic,setTopic]=useState(''),[transcript,setTranscript]=useState(''),[useReference,setUseReference]=useState(true);
  const [previousId,setPreviousId]=useState(''),[focus,setFocus]=useState('');
  const [report,setReport]=useState<CompanionReport|null>(null),[history,setHistory]=useState<CompanionReport[]>([]);
  const [session,setSession]=useState<RoomSession|null>(null),[sessions,setSessions]=useState<RoomSessionSummary[]>([]);
  const [replyDraft,setReplyDraft]=useState(''),[intent,setIntent]=useState<DialogueIntent>('clarify'),[selectedQuote,setSelectedQuote]=useState('');
  const [busyKind,setBusyKind]=useState<'dialogue'|'evaluation'|null>(null),[loadingDraft,setLoadingDraft]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[draftStatus,setDraftStatus]=useState(''),[cloudReady,setCloudReady]=useState(false);
  const voice=useAvatarVoice(),mic=useMicRecorder(),alive=useRef(true),scope=useRef(0),running=useRef(false),draftReady=useRef(false),saveSequence=useRef(0);
  const openingInput=useRef<HTMLTextAreaElement>(null),dialogueRef=useRef<HTMLDivElement>(null),latest=useRef<CachedDraft|null>(null);
  const roomRef=useSurfaceMotion<HTMLElement>(roleId||'lobby'),reportRef=useSurfaceMotion<HTMLElement>(report?.id||'no-report',12);
  const busy=Boolean(busyKind)||loadingDraft,role=roles.find(r=>r.id===roleId);
  const pinnedSource=session?session.sourceRef:useReference?studySource:null;
  const draftKey=keyOf(vault,roleId,pinnedSource?.id);
  const meta=async(id:string,seq=scope.current)=>{
    const [h,s]=await Promise.all([window.gezhi.companions.history({vault,roleId:id}),window.gezhi.companions.sessions({vault,roleId:id})]);
    if(alive.current&&seq===scope.current){setHistory(h.reports||[]);setSessions(s.sessions||[]);}
  };
  const persist=async(payload:CachedDraft,seq=saveSequence.current)=>{
    const r=await window.gezhi.companions.saveDraft({vault,roleId:payload.roleId,topic:payload.topic,transcript:payload.transcript,replyDraft:payload.replyDraft,focus:payload.focus,previousId:payload.previousId,useReference:payload.useReference,sourceId:payload.sourceId||undefined,sessionId:payload.sessionId||undefined});
    if(alive.current&&seq===saveSequence.current)setDraftStatus(r.ok?'Draft saved on this device':'Draft not saved: '+(r.error||'please try again'));
    return r;
  };
  const flush=()=>latest.current?persist(latest.current).catch(()=>{}):Promise.resolve();
  useEffect(()=>{
    if(!roleId||!draftReady.current||loadingDraft)return;
    const payload:CachedDraft={roleId,topic,transcript,replyDraft,previousId,focus,useReference,sourceId:pinnedSource?.id||null,sourceRef:pinnedSource,sessionId:session?.id||null,session:session||undefined,at:new Date().toISOString()};
    latest.current=payload;memory.set(draftKey,payload);if(memory.size>100)memory.delete(memory.keys().next().value!);
    const seq=++saveSequence.current;setDraftStatus('Saving the draft…');
    const timer=setTimeout(()=>void persist(payload,seq).catch(()=>{if(alive.current&&seq===saveSequence.current)setDraftStatus('Saving the draft failed. Please try again.');}),450);
    return()=>clearTimeout(timer);
  },[vault,roleId,topic,transcript,replyDraft,previousId,focus,useReference,pinnedSource?.id,session,loadingDraft]);
  useEffect(()=>{alive.current=true;void window.gezhi.companions.roles().then(r=>{if(alive.current)setRoles(r.roles);});void window.gezhi.avatar.probe().then(r=>{if(alive.current)setCloudReady(Boolean(r.asr?.available));}).catch(()=>{});
    const beforeClose=()=>void flush();window.addEventListener('beforeunload',beforeClose);
    return()=>{void flush();alive.current=false;scope.current++;window.removeEventListener('beforeunload',beforeClose);if(running.current)void window.gezhi.companions.stop();};
  },[]);
  useEffect(()=>{if(!visible){voice.stop();mic.cancel();void flush();if(running.current)void window.gezhi.companions.stop();}},[visible]);
  useEffect(()=>{if(report){const frame=requestAnimationFrame(()=>reportRef.current?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}));return()=>cancelAnimationFrame(frame);}},[report?.id]);
  useEffect(()=>{if(session?.turns.length){const frame=requestAnimationFrame(()=>dialogueRef.current?.querySelector('.dialogue-turn:last-child')?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));return()=>cancelAnimationFrame(frame);}},[session?.turns.length]);
  useEffect(()=>{if(mic.error)setError(mic.error);},[mic.error]);
  const appendRecognized=(text:string)=>session?setReplyDraft(t=>(t?t+'\n':'')+text):setTranscript(t=>(t?t+'\n':'')+text);
  useEffect(()=>{if(mic.pending&&!mic.busy)void mic.stopAndRecognize().then(r=>{if(alive.current){if(r.ok&&r.text)appendRecognized(r.text);else setError(r.error||'That was not clear');}});},[mic.pending]);
  const applyDraft=(d:RoomDraft)=>{setTopic(d.topic);setTranscript(d.transcript);setReplyDraft(d.replyDraft||'');setPreviousId(d.previousId||'');setFocus(d.focus||'');setUseReference(d.useReference);setSession(d.session||null);if(d.sourceRef)onSource?.(d.sourceRef);};
  const enter=async(id:string)=>{
    await flush();const seq=++scope.current;draftReady.current=false;setLoadingDraft(true);setRoleId(id);setIntent(defaultIntent(id));setReport(null);setSession(null);setReplyDraft('');setSelectedQuote('');setError('');setNotice('');voice.stop();
    const cached=memory.get(keyOf(vault,id,studySource?.id));
    try{const r=await window.gezhi.companions.loadDraft({vault,roleId:id,sourceId:studySource?.id});if(!alive.current||seq!==scope.current)return;if(!r.ok)throw Error(r.error||'Failed to load the draft');
      const restoredSession=r.draft?.session;
      const saved=cached?{...cached,session:restoredSession&&restoredSession.id===cached.session?.id?restoredSession:cached.session}:r.draft;
      if(saved){applyDraft(saved);setNotice('Local draft restored'+(saved.sourceRef?' · '+saved.sourceRef.name+' / '+saved.sourceRef.section:''));}
      else{setTopic(studySource?.concept||referenceName?.replace(/\.[^.]+$/,'')||'');setTranscript('');setPreviousId('');setFocus('');setUseReference(true);}
      await meta(id,seq);
    }catch(e){if(alive.current&&seq===scope.current)setError((e as Error).message);}
    finally{if(alive.current&&seq===scope.current){draftReady.current=true;setLoadingDraft(false);}}
  };
  const openReport=async(r:CompanionReport)=>{
    await flush();const seq=++scope.current;draftReady.current=false;setLoadingDraft(true);setRoleId(r.roleId);setIntent(defaultIntent(r.roleId));setReport(r);setTopic(r.topic);setTranscript(r.transcript);setPreviousId('');setFocus('');setReplyDraft('');setSession(null);setUseReference(Boolean(r.sourceRef||r.referenceName));onSource?.(r.sourceRef||null);
    try{if(r.sessionId){const result=await window.gezhi.companions.session({vault,sessionId:r.sessionId});if(alive.current&&seq===scope.current&&result.session){setSession(result.session);setTranscript(result.session.turns[0]?.text||r.transcript);}}
      await meta(r.roleId,seq);
    }catch(e){if(alive.current&&seq===scope.current)setError((e as Error).message);}finally{if(alive.current&&seq===scope.current){draftReady.current=true;setLoadingDraft(false);}}
  };
  useEffect(()=>{if(initialReport)void openReport(initialReport);},[initialReport?.id]);
  const resume=async(id:string)=>{if(busy)return;await flush();const seq=++scope.current;setLoadingDraft(true);try{const r=await window.gezhi.companions.session({vault,sessionId:id});if(!r.ok||!r.session)throw Error(r.error||'Failed to load the dialogue');if(!alive.current||seq!==scope.current)return;setSession(r.session);setTopic(r.session.topic);setTranscript(r.session.turns[0].text);setReplyDraft('');setPreviousId('');setReport(null);setIntent(defaultIntent(r.session.roleId));setUseReference(Boolean(r.session.sourceRef||r.session.referenceText));onSource?.(r.session.sourceRef);setNotice('Opened the dialogue saved on this device.');}catch(e){if(alive.current&&seq===scope.current)setError((e as Error).message);}finally{if(alive.current&&seq===scope.current)setLoadingDraft(false);}};
  const requestReply=async(current:RoomSession,answer:string,nextIntent:DialogueIntent,requestId:string=crypto.randomUUID(),seq=scope.current)=>{
    const r=await window.gezhi.companions.reply({vault,sessionId:current.id,requestId,answer,intent:nextIntent});
    if(!alive.current||seq!==scope.current)return;
    if(r.session)setSession(r.session);
    if(!r.ok)throw Error(r.error||'Follow-up questions are temporarily unavailable');
    setReplyDraft('');setReport(null);await meta(current.roleId);return r.session;
  };
  const converse=async(retry=false)=>{
    if(!role||busy||mic.recording||mic.busy)return;const seq=scope.current;running.current=true;setBusyKind('dialogue');setError('');voice.stop();
    try{let current=session;if(!current){const id=crypto.randomUUID(),r=await window.gezhi.companions.startSession({locale:'en',vault,id,roleId,topic,transcript,sourceId:useReference?studySource?.id:undefined,context:useReference?referenceText||'':'',referenceName:useReference?referenceName||'':''});if(!alive.current||seq!==scope.current)return;if(!r.ok||!r.session)throw Error(r.error||'Failed to prepare the dialogue');current=r.session;setSession(current);}
      const failed=current.request?.state==='failed';
      await requestReply(current,retry&&failed?current.request!.answer:session?replyDraft:'',retry&&failed?current.request!.intent:intent,retry&&failed?current.request!.id:undefined,seq);
    }catch(e){if(alive.current&&seq===scope.current)setError((e as Error).message);}finally{running.current=false;if(alive.current&&seq===scope.current)setBusyKind(null);}
  };
  const evaluate=async()=>{
    if(!role||busy||mic.recording||mic.busy)return;const seq=scope.current;running.current=true;setBusyKind('evaluation');setError('');setReport(null);voice.stop();
    try{const r=await window.gezhi.companions.evaluate({locale:'en',vault,roleId,topic,transcript,context:useReference?referenceText||'':'',referenceName:useReference?referenceName||'':'',sourceId:useReference?studySource?.id:undefined,sessionId:session?.id,previousId:previousId||undefined,focus});if(!alive.current||seq!==scope.current)return;if(!r.ok||!r.report)throw Error(r.error||'The evaluation did not come back complete');setReport(r.report);setPreviousId('');onRecorded?.();await meta(roleId,seq);}
    catch(e){if(alive.current&&seq===scope.current)setError((e as Error).message);}finally{running.current=false;if(alive.current&&seq===scope.current)setBusyKind(null);}
  };
  const record=async()=>{setError('');voice.stop();if(!mic.recording){await mic.start();return;}const r=await mic.stopAndRecognize();if(!r.ok||!r.text)setError(r.error||'That was not clear, please record again');else appendRecognized(r.text);};
  const retryExplanation=(r:CompanionReport,nextFocus='')=>{setSession(null);setTranscript(r.transcript);setTopic(r.topic);setPreviousId(r.id);setFocus(nextFocus);setReplyDraft('');setUseReference(Boolean(r.sourceRef||r.referenceName));onSource?.(r.sourceRef||null);setReport(null);voice.stop();};
  const locate=(quote:string)=>{if(!report||!quote)return;if(session){setSelectedQuote(quote);requestAnimationFrame(()=>dialogueRef.current?.querySelector('mark')?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));return;}setTranscript(report.transcript);requestAnimationFrame(()=>{const input=openingInput.current;if(!input)return;const start=report.transcript.indexOf(quote);input.focus();input.setSelectionRange(start,start+quote.length);input.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});});};
  const openReference=(source:StudySource,quote:string)=>onSource?.({...source,focusQuote:quote});
  const exportReport=async()=>{if(!report||!role)return;
    const markdown='# '+report.topic+': six-dimensional feedback\n\nRole: '+role.name+' · '+role.title+'\n\nTime: '+report.at+'\n\nAI formative feedback, not yet calibrated by a teacher.\n\n## My explanation and additions\n\n'+report.transcript+'\n\n## Feedback\n\n'+report.summary+'\n\n'+report.dimensions.map(d=>'### '+d.label+': '+(d.score===null?'not shown':d.score+'/4')+'\n\nLearner words: '+(d.evidence||'not provided')+'\n\nOriginal-text quote: '+(d.referenceVerified?d.referenceEvidence:'no matching quote in the original text')+'\n\n'+d.reason+'\n\nNext step: '+d.nextStep).join('\n\n')+'\n\n## Follow-up questions\n\n'+report.questions.map(q=>'- '+q).join('\n')+'\n\n'+report.referenceLimit;
    const provenance=report.sourceRef?'\n\n## Source quote snapshot\n\n'+sourceLocation(report.sourceRef)+'\n\n'+report.sourceRef.text:'';
    const conversation=report.dialogue?.length?'\n\n## The dialogue this feedback is based on\n\n'+report.dialogue.map(t=>'### '+(t.role==='learner'?'Learner':role.name)+'\n\n'+t.text+(t.question?'\n\n'+t.question:'')).join('\n\n'):'';
    const comparison=report.previousId?'\n\n## How the feedback changed between explanations\n\n'+(report.comparison||[]).map(c=>report.dimensions.find(d=>d.id===c.id)?.label+': '+c.before+' → '+c.after).join('\n\n')+'\n\nAI score changes are for reflection only.':'';
    const r=await window.gezhi.exporter.run({format:'markdown',markdown:markdown+provenance+conversation+comparison,sourcePath:vault,defaultName:'Six-dimensional feedback',saveAs:true});if(!r.ok&&!r.canceled)setError(r.error||'Export failed');else if(r.ok)setNotice('Feedback exported: '+r.path);
  };
  const newRound=()=>{voice.stop();setSession(null);setReport(null);setPreviousId('');setFocus('');setReplyDraft('');setSelectedQuote('');setTopic(studySource?.concept||'');setTranscript('');setNotice('A new explanation has started; existing dialogues are still saved in the dialogue records.');};
  if(!role)return <section ref={roomRef} className="companion-lobby motion-surface" data-testid="companion-lobby"><div className="room-section-title"><span className="learning-eyebrow">YOUR LEARNING COMPANY</span><h2>Who would you like to explain it to today?</h2><p>Enter a learning space and explain the concept properly through explanation, follow-up questions and additions.</p></div><div className="companion-card-grid">{roles.map((r,i)=><button key={r.id} className="companion-card" onClick={()=>void enter(r.id)} style={{'--role-color':r.color,'--motion-order':i} as CSSProperties}><div className="companion-card-art"><RolePortrait roleId={r.id} name={r.name}/></div><span className="room-role-tag">{r.title}</span><h3>{r.name}</h3><p>{MISSIONS[r.id]||r.description}</p><span className="room-enter">Enter the space ↗</span></button>)}</div><p className="learning-muted">Drafts and dialogues are stored on this device; the roles provide study discussion and formative feedback.</p></section>;
  const lastAssistant=session?.turns.filter(t=>t.role==='assistant').at(-1);
  const learnerCount=session?session.turns.filter(t=>t.role==='learner').length-1:0;
  return <section ref={roomRef} className="companion-room motion-surface" data-testid="companion-room" data-role={role.id} style={{'--role-color':role.color} as CSSProperties}>
    <header className="room-toolbar"><button disabled={busy||mic.recording||mic.busy} onClick={()=>{void flush();voice.stop();mic.cancel();scope.current++;setRoleId('');}}>← Back to Digital Space</button><div><strong>{role.name}</strong><span>{role.title}</span></div><span>Explanation · multi-turn follow-ups · six-dimensional feedback</span></header>
    <div className="room-mission"><span>{MISSIONS[role.id]}</span><small>{session?`${learnerCount} additions so far`:'Start with your first explanation'}</small></div>
    {error&&<div className="learning-error" role="alert">{error}{/余额|额度|登录|账号/.test(error)&&<button onClick={()=>void window.gezhi.dshSetup.login()}>Open DeepSeek Harness</button>}</div>}{notice&&<div className="learning-callout" role="status">{notice}</div>}
    <div className="room-layout"><aside className="room-avatar"><RolePortrait roleId={role.id} name={role.name} speaking={voice.speaking} state={mic.recording?'listening':busyKind?'thinking':'idle'}/><h2>{role.name}</h2><span className="room-role-tag">{role.title}</span><p>{role.description}</p><div className="room-status" data-busy={Boolean(busyKind)} role="status" aria-live="polite">{loadingDraft?'Restoring the local draft…':mic.recording?`Listening · ${mic.seconds}s`:busyKind==='dialogue'?'Preparing the next follow-up…':busyKind==='evaluation'?'Checking your explanation and additions…':report?'Feedback saved — try responding to the follow-up questions.':session?'Keep responding, and make it clear with conditions, steps or examples.':'Ready when you are — explain it to me in your own words.'}</div>
      {report&&<button onClick={()=>void voice.speak(markdownToSpeech(report.summary+'.'+report.questions.join('.')),{preferCloud:true})}>Read the feedback and follow-ups aloud</button>}<button disabled={!voice.speaking} onClick={voice.stop}>Stop reading</button>{voice.status&&<small>{voice.status}</small>}
      <span className="room-draft-status" role="status">{draftStatus}</span>{draftStatus.includes('failed')||draftStatus.includes('not saved')?<button onClick={()=>void flush()}>Retry saving the draft</button>:null}
    </aside><div className="room-workspace"><div className="room-input-card">
      {previousId&&<div className="learning-callout">Explaining again · keep the same topic, role and material.{focus&&<p>This round's focus: {focus}</p>}<button onClick={()=>{setPreviousId('');setFocus('');}}>Switch to a new explanation</button></div>}
      <label>Explanation topic<input aria-label="Role explanation topic" maxLength={200} value={topic} onChange={e=>setTopic(e.target.value)} disabled={busy||mic.recording||Boolean(previousId)||Boolean(session)} placeholder="For example: why is the vertex not always the lowest point?"/></label>
      <label>{session?'This round\'s opening explanation (kept)':'Explain it in your own words'}<textarea ref={openingInput} aria-label="Role written explanation" value={transcript} maxLength={12000} rows={session?3:6} onChange={e=>setTranscript(e.target.value)} disabled={busy||mic.recording||mic.busy||Boolean(session)} placeholder="State the concept, the conditions and the reasoning, then give an example. You can record or type."/></label>
      <div className="room-input-meta"><span>{transcript.length} / 12000 characters</span><label><input type="checkbox" checked={useReference} onChange={e=>setUseReference(e.target.checked)} disabled={busy||Boolean(previousId)||Boolean(session)}/> Use the current material: {session?session.referenceName||'no material cited this round':studySource?studySource.name+' · '+studySource.section:referenceName||'no file selected'}</label></div>
      {session?.sourceRef&&session.sourceRef.id!==studySource?.id&&<div className="learning-callout">The citation for this round is fixed.<button onClick={()=>onSource?.(session.sourceRef)}>Back to this round's material</button> Use a new material to start a new round.</div>}
      <div className="learning-actions"><button disabled={!cloudReady||busy||mic.busy} onClick={()=>void record()}>{mic.recording?`End the recording (${mic.seconds}s)`:session?'Record a reply':'Record an explanation'}</button>
        {!session&&<button className="learning-primary" disabled={busy||mic.recording||mic.busy||!topic.trim()||transcript.trim().length<10} onClick={()=>void converse()}>Let the role ask follow-ups</button>}
        <button className={session?'learning-primary':''} disabled={busy||mic.recording||mic.busy||!topic.trim()||transcript.trim().length<10} onClick={()=>void evaluate()}>{busyKind==='evaluation'?'Generating six-dimensional feedback…':session?'Generate feedback for the whole dialogue':'Done — generate six-dimensional feedback'}</button>
        {busyKind&&<button onClick={()=>void window.gezhi.companions.stop()}>Stop {busyKind==='dialogue'?'follow-up':'evaluation'}</button>}{session&&<button disabled={busy||mic.recording} onClick={newRound}>Start a new round</button>}
      </div><p className="learning-muted">Each dialogue asks only one main follow-up at a time. Feedback on the whole session assesses only your explanations and additions; anything a role said does not count as your evidence.</p>
    </div>
    {session&&<div ref={dialogueRef}><RoomDialogue session={session} name={role.name} reply={replyDraft} intent={intent} busy={busy||mic.recording||mic.busy} quote={selectedQuote} onReply={setReplyDraft} onIntent={setIntent} onContinue={()=>void converse()} onRetry={()=>void converse(true)} onReference={openReference} onSpeak={()=>{if(lastAssistant)void voice.speak(markdownToSpeech(lastAssistant.text+'. '+lastAssistant.question),{preferCloud:true});}}/></div>}
    {report&&<article ref={reportRef} className="room-report" data-testid="companion-report"><div className="room-report-heading"><div><span className="learning-eyebrow">EXPLANATION EVIDENCE</span><h2>Your explanation — where could it be better?</h2><small>{new Date(report.at).toLocaleString('en-GB')} · {report.referenceName?'Reference: '+report.referenceName:'No reference material provided'}</small></div><button onClick={()=>void exportReport()}>Export feedback</button></div><p>{report.summary}</p>
      {report.dialogue&&<p className="learning-muted">This feedback covers {report.dialogue.filter(t=>t.role==='learner').length} of your explanations and additions, up to the moment it was generated.</p>}
      {report.previousId&&<div className="room-comparison" data-testid="explanation-comparison"><h3>How the feedback changed between the two explanations</h3>{report.comparison?.length?report.comparison.map(c=><p key={c.id}><strong>{report.dimensions.find(d=>d.id===c.id)?.label}</strong><span>{c.before} → {c.after}</span><b>{c.delta>0?'+':''}{c.delta}</b></p>):<p>There are no scored dimensions to compare across the two rounds.</p>}<small>Only dimensions with evidence are compared; AI score changes are for reflection and have not been calibrated by a teacher.</small></div>}
      <AssessmentRadar dimensions={report.dimensions} english/><div className="assessment-dimensions">{report.dimensions.map((d,i)=><section key={d.id} style={{'--motion-order':i} as CSSProperties}><h3>{d.label}<span>{d.score===null?'Not shown':d.score+' / 4'}</span></h3>{d.evidence&&<blockquote>"{d.evidence}"<button onClick={()=>locate(d.evidence)}>Locate these words</button></blockquote>}<p>{d.reason}</p>
        {d.referenceVerified&&report.sourceRef?<div className="room-reference-evidence"><small>The original-text quote matched verbatim</small><blockquote>{d.referenceEvidence}</blockquote><button onClick={()=>openReference(report.sourceRef!,d.referenceEvidence!)}>Locate it in the material</button></div>:<p className="learning-muted">No matching quote from the original text yet; the basis for this judgement needs checking.</p>}
        <div className="assessment-next"><strong>Next step</strong> {d.nextStep}</div><div className="learning-actions"><button disabled={busy} onClick={()=>retryExplanation(report,d.label+': '+d.nextStep)}>Explain this dimension again</button><button disabled={busy||!report.sourceRef} onClick={()=>onTask?.(d.id==='transfer'?'transfer':d.id==='conditions'?'detective':'practice',d.label+': '+d.nextStep,report.sourceRef)}>Do a targeted task</button></div></section>)}</div>
      <AssessmentReview key={report.id} vault={vault} report={report} english/>
      <div className="room-followups"><h3>{role.name}'s follow-up questions</h3>{report.questions.map((q,i)=><p key={i}>{i+1}. {q}</p>)}</div><p className="learning-muted">{report.referenceLimit}</p><button disabled={busy} onClick={()=>retryExplanation(report)}>Explain again using the suggestions</button>
    </article>}
    {sessions.length>0&&<section className="room-history"><h3>Dialogue records in this space</h3>{sessions.map(s=><button key={s.id} disabled={busy||mic.recording} onClick={()=>void resume(s.id)}><span>{s.topic} · {s.turnCount} turns</span><small>{new Date(s.at).toLocaleString('en-GB')}</small></button>)}</section>}
    {history.length>0&&<section className="room-history"><h3>Explanation records in this space</h3>{history.map(r=><button key={r.id} disabled={busy||mic.recording} onClick={()=>void openReport(r)}><span>{r.topic}</span><small>{new Date(r.at).toLocaleString('en-GB')}</small></button>)}</section>}
    </div></div>
  </section>;
}
