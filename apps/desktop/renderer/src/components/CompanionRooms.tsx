import {useEffect,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import type {CompanionReport,CompanionRole,DialogueIntent,RoomDraft,RoomSession,RoomSessionSummary} from '../lib/companion-types';
import type {LearningMode,StudySource} from '../lib/learning-types';
import RolePortrait from './RolePortrait';
import AssessmentRadar from './AssessmentRadar';
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
    if(alive.current&&seq===saveSequence.current)setDraftStatus(r.ok?'草稿已保存到本机':'草稿未保存：'+(r.error||'请重试'));
    return r;
  };
  const flush=()=>latest.current?persist(latest.current).catch(()=>{}):Promise.resolve();
  useEffect(()=>{
    if(!roleId||!draftReady.current||loadingDraft)return;
    const payload:CachedDraft={roleId,topic,transcript,replyDraft,previousId,focus,useReference,sourceId:pinnedSource?.id||null,sourceRef:pinnedSource,sessionId:session?.id||null,session:session||undefined,at:new Date().toISOString()};
    latest.current=payload;memory.set(draftKey,payload);if(memory.size>100)memory.delete(memory.keys().next().value!);
    const seq=++saveSequence.current;setDraftStatus('正在保存草稿…');
    const timer=setTimeout(()=>void persist(payload,seq).catch(()=>{if(alive.current&&seq===saveSequence.current)setDraftStatus('草稿保存失败，请重试。');}),450);
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
  useEffect(()=>{if(mic.pending&&!mic.busy)void mic.stopAndRecognize().then(r=>{if(alive.current){if(r.ok&&r.text)appendRecognized(r.text);else setError(r.error||'没有听清');}});},[mic.pending]);
  const applyDraft=(d:RoomDraft)=>{setTopic(d.topic);setTranscript(d.transcript);setReplyDraft(d.replyDraft||'');setPreviousId(d.previousId||'');setFocus(d.focus||'');setUseReference(d.useReference);setSession(d.session||null);if(d.sourceRef)onSource?.(d.sourceRef);};
  const enter=async(id:string)=>{
    await flush();const seq=++scope.current;draftReady.current=false;setLoadingDraft(true);setRoleId(id);setIntent(defaultIntent(id));setReport(null);setSession(null);setReplyDraft('');setSelectedQuote('');setError('');setNotice('');voice.stop();
    const cached=memory.get(keyOf(vault,id,studySource?.id));
    try{const r=await window.gezhi.companions.loadDraft({vault,roleId:id,sourceId:studySource?.id});if(!alive.current||seq!==scope.current)return;if(!r.ok)throw Error(r.error||'草稿读取失败');
      const restoredSession=r.draft?.session;
      const saved=cached?{...cached,session:restoredSession&&restoredSession.id===cached.session?.id?restoredSession:cached.session}:r.draft;
      if(saved){applyDraft(saved);setNotice('已恢复本机草稿'+(saved.sourceRef?' · '+saved.sourceRef.name+' / '+saved.sourceRef.section:''));}
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
  const resume=async(id:string)=>{if(busy)return;await flush();const seq=++scope.current;setLoadingDraft(true);try{const r=await window.gezhi.companions.session({vault,sessionId:id});if(!r.ok||!r.session)throw Error(r.error||'对话读取失败');if(!alive.current||seq!==scope.current)return;setSession(r.session);setTopic(r.session.topic);setTranscript(r.session.turns[0].text);setReplyDraft('');setPreviousId('');setReport(null);setIntent(defaultIntent(r.session.roleId));setUseReference(Boolean(r.session.sourceRef||r.session.referenceText));onSource?.(r.session.sourceRef);setNotice('已打开本机保存的对话。');}catch(e){if(alive.current&&seq===scope.current)setError((e as Error).message);}finally{if(alive.current&&seq===scope.current)setLoadingDraft(false);}};
  const requestReply=async(current:RoomSession,answer:string,nextIntent:DialogueIntent,requestId:string=crypto.randomUUID(),seq=scope.current)=>{
    const r=await window.gezhi.companions.reply({vault,sessionId:current.id,requestId,answer,intent:nextIntent});
    if(!alive.current||seq!==scope.current)return;
    if(r.session)setSession(r.session);
    if(!r.ok)throw Error(r.error||'追问暂时不可用');
    setReplyDraft('');setReport(null);await meta(current.roleId);return r.session;
  };
  const converse=async(retry=false)=>{
    if(!role||busy||mic.recording||mic.busy)return;const seq=scope.current;running.current=true;setBusyKind('dialogue');setError('');voice.stop();
    try{let current=session;if(!current){const id=crypto.randomUUID(),r=await window.gezhi.companions.startSession({vault,id,roleId,topic,transcript,sourceId:useReference?studySource?.id:undefined,context:useReference?referenceText||'':'',referenceName:useReference?referenceName||'':''});if(!alive.current||seq!==scope.current)return;if(!r.ok||!r.session)throw Error(r.error||'对话准备失败');current=r.session;setSession(current);}
      const failed=current.request?.state==='failed';
      await requestReply(current,retry&&failed?current.request!.answer:session?replyDraft:'',retry&&failed?current.request!.intent:intent,retry&&failed?current.request!.id:undefined,seq);
    }catch(e){if(alive.current&&seq===scope.current)setError((e as Error).message);}finally{running.current=false;if(alive.current&&seq===scope.current)setBusyKind(null);}
  };
  const evaluate=async()=>{
    if(!role||busy||mic.recording||mic.busy)return;const seq=scope.current;running.current=true;setBusyKind('evaluation');setError('');setReport(null);voice.stop();
    try{const r=await window.gezhi.companions.evaluate({vault,roleId,topic,transcript,context:useReference?referenceText||'':'',referenceName:useReference?referenceName||'':'',sourceId:useReference?studySource?.id:undefined,sessionId:session?.id,previousId:previousId||undefined,focus});if(!alive.current||seq!==scope.current)return;if(!r.ok||!r.report)throw Error(r.error||'没有收到完整评估');setReport(r.report);setPreviousId('');onRecorded?.();await meta(roleId,seq);}
    catch(e){if(alive.current&&seq===scope.current)setError((e as Error).message);}finally{running.current=false;if(alive.current&&seq===scope.current)setBusyKind(null);}
  };
  const record=async()=>{setError('');voice.stop();if(!mic.recording){await mic.start();return;}const r=await mic.stopAndRecognize();if(!r.ok||!r.text)setError(r.error||'没有听清，请重录');else appendRecognized(r.text);};
  const retryExplanation=(r:CompanionReport,nextFocus='')=>{setSession(null);setTranscript(r.transcript);setTopic(r.topic);setPreviousId(r.id);setFocus(nextFocus);setReplyDraft('');setUseReference(Boolean(r.sourceRef||r.referenceName));onSource?.(r.sourceRef||null);setReport(null);voice.stop();};
  const locate=(quote:string)=>{if(!report||!quote)return;if(session){setSelectedQuote(quote);requestAnimationFrame(()=>dialogueRef.current?.querySelector('mark')?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));return;}setTranscript(report.transcript);requestAnimationFrame(()=>{const input=openingInput.current;if(!input)return;const start=report.transcript.indexOf(quote);input.focus();input.setSelectionRange(start,start+quote.length);input.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});});};
  const openReference=(source:StudySource,quote:string)=>onSource?.({...source,focusQuote:quote});
  const exportReport=async()=>{if(!report||!role)return;
    const markdown='# '+report.topic+'：六维反馈\n\n角色：'+role.name+' · '+role.title+'\n\n时间：'+report.at+'\n\nAI 形成性反馈，尚未经教师校准。\n\n## 我的讲解与补充\n\n'+report.transcript+'\n\n## 反馈\n\n'+report.summary+'\n\n'+report.dimensions.map(d=>'### '+d.label+'：'+(d.score===null?'未展示':d.score+'/4')+'\n\n讲解原话：'+(d.evidence||'未提供')+'\n\n原文引用：'+(d.referenceVerified?d.referenceEvidence:'未匹配到原文引用')+'\n\n'+d.reason+'\n\n下一步：'+d.nextStep).join('\n\n')+'\n\n## 追问\n\n'+report.questions.map(q=>'- '+q).join('\n')+'\n\n'+report.referenceLimit;
    const provenance=report.sourceRef?'\n\n## 资料引用快照\n\n'+sourceLocation(report.sourceRef)+'\n\n'+report.sourceRef.text:'';
    const conversation=report.dialogue?.length?'\n\n## 本次反馈所依据的对话\n\n'+report.dialogue.map(t=>'### '+(t.role==='learner'?'学习者':role.name)+'\n\n'+t.text+(t.question?'\n\n'+t.question:'')).join('\n\n'):'';
    const comparison=report.previousId?'\n\n## 再次讲解的反馈变化\n\n'+(report.comparison||[]).map(c=>report.dimensions.find(d=>d.id===c.id)?.label+'：'+c.before+' → '+c.after).join('\n\n')+'\n\nAI 分数变化仅供反思。':'';
    const r=await window.gezhi.exporter.run({format:'markdown',markdown:markdown+provenance+conversation+comparison,sourcePath:vault,defaultName:'讲解六维反馈',saveAs:true});if(!r.ok&&!r.canceled)setError(r.error||'导出失败');else if(r.ok)setNotice('反馈已导出：'+r.path);
  };
  const newRound=()=>{voice.stop();setSession(null);setReport(null);setPreviousId('');setFocus('');setReplyDraft('');setSelectedQuote('');setTopic(studySource?.concept||'');setTranscript('');setNotice('已开始新的讲解；已有对话仍保存在对话记录中。');};
  if(!role)return <section ref={roomRef} className="companion-lobby motion-surface" data-testid="companion-lobby"><div className="room-section-title"><span className="learning-eyebrow">YOUR LEARNING COMPANY</span><h2>今天，想讲给谁听？</h2><p>进入一个学习空间，用解释、追问和补充把概念讲透。</p></div><div className="companion-card-grid">{roles.map((r,i)=><button key={r.id} className="companion-card" onClick={()=>void enter(r.id)} style={{'--role-color':r.color,'--motion-order':i} as CSSProperties}><div className="companion-card-art"><RolePortrait roleId={r.id} name={r.name}/></div><span className="room-role-tag">{r.title}</span><h3>{r.name}</h3><p>{MISSIONS[r.id]||r.description}</p><span className="room-enter">进入空间 ↗</span></button>)}</div><p className="learning-muted">草稿与对话保存在本机；角色提供学习讨论与形成性反馈。</p></section>;
  const lastAssistant=session?.turns.filter(t=>t.role==='assistant').at(-1);
  const learnerCount=session?session.turns.filter(t=>t.role==='learner').length-1:0;
  return <section ref={roomRef} className="companion-room motion-surface" data-testid="companion-room" data-role={role.id} style={{'--role-color':role.color} as CSSProperties}>
    <header className="room-toolbar"><button disabled={busy||mic.recording||mic.busy} onClick={()=>{void flush();voice.stop();mic.cancel();scope.current++;setRoleId('');}}>← 返回角色空间</button><div><strong>{role.name}</strong><span>{role.title}</span></div><span>讲解 · 多轮追问 · 六维反馈</span></header>
    <div className="room-mission"><span>{MISSIONS[role.id]}</span><small>{session?`已补充 ${learnerCount} 次`:'从你的第一段解释开始'}</small></div>
    {error&&<div className="learning-error" role="alert">{error}{/余额|额度|登录|账号/.test(error)&&<button onClick={()=>void window.gezhi.dshSetup.login()}>打开 DeepSeek Harness</button>}</div>}{notice&&<div className="learning-callout" role="status">{notice}</div>}
    <div className="room-layout"><aside className="room-avatar"><RolePortrait roleId={role.id} name={role.name} speaking={voice.speaking} state={mic.recording?'listening':busyKind?'thinking':'idle'}/><h2>{role.name}</h2><span className="room-role-tag">{role.title}</span><p>{role.description}</p><div className="room-status" data-busy={Boolean(busyKind)} role="status" aria-live="polite">{loadingDraft?'正在恢复本机草稿…':mic.recording?`正在倾听 · ${mic.seconds} 秒`:busyKind==='dialogue'?'正在准备下一轮追问…':busyKind==='evaluation'?'正在检查你的讲解与补充…':report?'反馈已保存，试着回应追问。':session?'继续回应，用条件、步骤或例子说清楚。':'准备好了，用自己的话讲给我听。'}</div>
      {report&&<button onClick={()=>void voice.speak(markdownToSpeech(report.summary+'。'+report.questions.join('。')),{preferCloud:true})}>朗读反馈与追问</button>}<button disabled={!voice.speaking} onClick={voice.stop}>停止朗读</button>{voice.status&&<small>{voice.status}</small>}
      <span className="room-draft-status" role="status">{draftStatus}</span>{draftStatus.includes('失败')||draftStatus.includes('未保存')?<button onClick={()=>void flush()}>重试保存草稿</button>:null}
    </aside><div className="room-workspace"><div className="room-input-card">
      {previousId&&<div className="learning-callout">再次讲解 · 保持同一主题、角色和资料。{focus&&<p>本次重点：{focus}</p>}<button onClick={()=>{setPreviousId('');setFocus('');}}>改为新的讲解</button></div>}
      <label>讲解主题<input aria-label="角色讲解主题" maxLength={200} value={topic} onChange={e=>setTopic(e.target.value)} disabled={busy||mic.recording||Boolean(previousId)||Boolean(session)} placeholder="例如：顶点为什么不一定是最低点？"/></label>
      <label>{session?'本轮开场讲解（已保留）':'用自己的话解释'}<textarea ref={openingInput} aria-label="角色文字讲解" value={transcript} maxLength={12000} rows={session?3:6} onChange={e=>setTranscript(e.target.value)} disabled={busy||mic.recording||mic.busy||Boolean(session)} placeholder="说清概念、条件和推理，再举例说明。可以录音，也可以输入。"/></label>
      <div className="room-input-meta"><span>{transcript.length} / 12000 字</span><label><input type="checkbox" checked={useReference} onChange={e=>setUseReference(e.target.checked)} disabled={busy||Boolean(previousId)||Boolean(session)}/> 使用当前资料：{session?session.referenceName||'本轮未引用资料':studySource?studySource.name+' · '+studySource.section:referenceName||'未选择文件'}</label></div>
      {session?.sourceRef&&session.sourceRef.id!==studySource?.id&&<div className="learning-callout">本轮引用已固定。<button onClick={()=>onSource?.(session.sourceRef)}>回到本轮资料</button>使用新资料可以开始新一轮。</div>}
      <div className="learning-actions"><button disabled={!cloudReady||busy||mic.busy} onClick={()=>void record()}>{mic.recording?`结束录音（${mic.seconds}s）`:session?'录音回应':'录音讲解'}</button>
        {!session&&<button className="learning-primary" disabled={busy||mic.recording||mic.busy||!topic.trim()||transcript.trim().length<10} onClick={()=>void converse()}>让角色追问</button>}
        <button className={session?'learning-primary':''} disabled={busy||mic.recording||mic.busy||!topic.trim()||transcript.trim().length<10} onClick={()=>void evaluate()}>{busyKind==='evaluation'?'正在生成六维反馈…':session?'生成整段对话反馈':'讲完了，生成六维反馈'}</button>
        {busyKind&&<button onClick={()=>void window.gezhi.companions.stop()}>停止{busyKind==='dialogue'?'追问':'评估'}</button>}{session&&<button disabled={busy||mic.recording} onClick={newRound}>新开一轮</button>}
      </div><p className="learning-muted">对话每次只追问一个主要问题。整段反馈只评价你的讲解与补充；角色说过的内容不会计作你的证据。</p>
    </div>
    {session&&<div ref={dialogueRef}><RoomDialogue session={session} name={role.name} reply={replyDraft} intent={intent} busy={busy||mic.recording||mic.busy} quote={selectedQuote} onReply={setReplyDraft} onIntent={setIntent} onContinue={()=>void converse()} onRetry={()=>void converse(true)} onReference={openReference} onSpeak={()=>{if(lastAssistant)void voice.speak(markdownToSpeech(lastAssistant.text+'。'+lastAssistant.question),{preferCloud:true});}}/></div>}
    {report&&<article ref={reportRef} className="room-report" data-testid="companion-report"><div className="room-report-heading"><div><span className="learning-eyebrow">EXPLANATION EVIDENCE</span><h2>你的讲解，哪里还可以更好？</h2><small>{new Date(report.at).toLocaleString('zh-CN')} · {report.referenceName?'参考：'+report.referenceName:'未提供参考资料'}</small></div><button onClick={()=>void exportReport()}>导出反馈</button></div><p>{report.summary}</p>
      {report.dialogue&&<p className="learning-muted">本次反馈包含 {report.dialogue.filter(t=>t.role==='learner').length} 段你的讲解与补充，截止于本次生成时。</p>}
      {report.previousId&&<div className="room-comparison" data-testid="explanation-comparison"><h3>两次讲解的反馈变化</h3>{report.comparison?.length?report.comparison.map(c=><p key={c.id}><strong>{report.dimensions.find(d=>d.id===c.id)?.label}</strong><span>{c.before} → {c.after}</span><b>{c.delta>0?'+':''}{c.delta}</b></p>):<p>两轮没有可比较的已评分维度。</p>}<small>仅比较有证据的维度；AI 分数变化供反思，尚未经教师校准。</small></div>}
      <AssessmentRadar dimensions={report.dimensions}/><div className="assessment-dimensions">{report.dimensions.map((d,i)=><section key={d.id} style={{'--motion-order':i} as CSSProperties}><h3>{d.label}<span>{d.score===null?'未展示':d.score+' / 4'}</span></h3>{d.evidence&&<blockquote>“{d.evidence}”<button onClick={()=>locate(d.evidence)}>定位讲解原话</button></blockquote>}<p>{d.reason}</p>
        {d.referenceVerified&&report.sourceRef?<div className="room-reference-evidence"><small>原文引用已逐字匹配</small><blockquote>{d.referenceEvidence}</blockquote><button onClick={()=>openReference(report.sourceRef!,d.referenceEvidence!)}>在资料中定位</button></div>:<p className="learning-muted">尚无匹配的原文引用，需核对判断依据。</p>}
        <div className="assessment-next"><strong>下一步</strong> {d.nextStep}</div><div className="learning-actions"><button disabled={busy} onClick={()=>retryExplanation(report,d.label+'：'+d.nextStep)}>围绕这一项再讲</button><button disabled={busy||!report.sourceRef} onClick={()=>onTask?.(d.id==='transfer'?'transfer':d.id==='conditions'?'detective':'practice',d.label+'：'+d.nextStep,report.sourceRef)}>做针对性任务</button></div></section>)}</div>
      <div className="room-followups"><h3>{role.name}的追问</h3>{report.questions.map((q,i)=><p key={i}>{i+1}. {q}</p>)}</div><p className="learning-muted">{report.referenceLimit}</p><button disabled={busy} onClick={()=>retryExplanation(report)}>按建议再讲一遍</button>
    </article>}
    {sessions.length>0&&<section className="room-history"><h3>这个空间的对话记录</h3>{sessions.map(s=><button key={s.id} disabled={busy||mic.recording} onClick={()=>void resume(s.id)}><span>{s.topic} · {s.turnCount} 段对话</span><small>{new Date(s.at).toLocaleString('zh-CN')}</small></button>)}</section>}
    {history.length>0&&<section className="room-history"><h3>这个空间的讲解记录</h3>{history.map(r=><button key={r.id} disabled={busy||mic.recording} onClick={()=>void openReport(r)}><span>{r.topic}</span><small>{new Date(r.at).toLocaleString('zh-CN')}</small></button>)}</section>}
    </div></div>
  </section>;
}
