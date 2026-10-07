import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { CompanionReport, CompanionRole } from '../lib/companion-types';
import RolePortrait from './RolePortrait';
import AssessmentRadar from './AssessmentRadar';
import { useAvatarVoice } from './useAvatarVoice';
import { useMicRecorder } from './useMicRecorder';
import { useSurfaceMotion } from '../lib/useSurfaceMotion';
import type { LearningMode, StudySource } from '../lib/learning-types';
import {sourceLocation} from '../../../shared/study-format.mjs';
interface Props { vault: string; referenceName?: string | null; referenceText?: string | null; studySource?: StudySource|null; visible?: boolean; initialReport?: CompanionReport|null; onRecorded?:()=>void; onTask?:(mode:LearningMode,focus:string,source?:StudySource|null)=>void; onSource?:(source:StudySource|null)=>void }
const roomDrafts = new Map<string,{topic:string;transcript:string;previousId:string;focus:string}>();
export default function CompanionRooms({ vault, referenceName, referenceText,studySource=null,visible=true,initialReport,onRecorded,onTask,onSource }: Props) {
  const [roles,setRoles] = useState<CompanionRole[]>([]), [roleId,setRoleId] = useState('');
  const [topic,setTopic] = useState(''), [transcript,setTranscript] = useState(''), [useReference,setUseReference] = useState(true);
  const [report,setReport] = useState<CompanionReport | null>(null), [history,setHistory] = useState<CompanionReport[]>([]);
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [cloudReady,setCloudReady] = useState(false), [notice,setNotice] = useState('');
  const voice = useAvatarVoice(), mic = useMicRecorder(), alive = useRef(true), request = useRef(0), running = useRef(false);
  const [previousId,setPreviousId]=useState(''),[focus,setFocus]=useState('');
  const transcriptInput=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{if(roleId){roomDrafts.set(vault+'\0'+roleId,{topic,transcript,previousId,focus});if(roomDrafts.size>40)roomDrafts.delete(roomDrafts.keys().next().value!);}},[vault,roleId,topic,transcript,previousId,focus]);
  useEffect(()=>{if(!visible){voice.stop();mic.cancel();if(running.current)void window.gezhi.companions.stop();}},[visible]);
  useEffect(()=>{if(initialReport){setRoleId(initialReport.roleId);setReport(initialReport);setTopic(initialReport.topic);setTranscript(initialReport.transcript);setPreviousId('');setFocus('');void historyFor(initialReport.roleId);}},[initialReport?.id]);
  const roomRef = useSurfaceMotion<HTMLElement>(roleId || 'lobby');
  const reportRef = useSurfaceMotion<HTMLElement>(report?.id || 'no-report', 12);
  useEffect(() => { if (report) { const frame=requestAnimationFrame(() => reportRef.current?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})); return () => cancelAnimationFrame(frame); } }, [report?.id]);
  useEffect(() => { if (mic.error) setError(mic.error); }, [mic.error]);
  useEffect(() => { if (mic.pending && !mic.busy) void mic.stopAndRecognize().then(r => { if (alive.current) { if (r.ok && r.text) setTranscript(t => (t ? t+'\n' : '')+r.text); else setError(r.error || '没有听清'); } }); }, [mic.pending]);
  useEffect(() => { alive.current = true; void window.gezhi.companions.roles().then(r => { if (alive.current) setRoles(r.roles); }); void window.gezhi.avatar.probe().then(r => { if (alive.current) setCloudReady(Boolean(r.asr?.available)); }).catch(() => {});
    return () => { alive.current = false; request.current++; if (running.current) void window.gezhi.companions.stop(); };
  }, []);
  const role = roles.find(r => r.id === roleId);
  const historyFor = async (id: string) => { const seq = ++request.current; const r = await window.gezhi.companions.history({ vault, roleId:id }); if (alive.current && seq === request.current) setHistory(r.reports || []); };
  const enter = (id: string) => { const draft=roomDrafts.get(vault+'\0'+id);voice.stop(); setRoleId(id); setReport(null); setTopic(draft?.topic || studySource?.concept || referenceName?.replace(/\.[^.]+$/,'') || ''); setTranscript(draft?.transcript || '');setPreviousId(draft?.previousId || '');setFocus(draft?.focus || '');setError(''); setNotice(''); setHistory([]); void historyFor(id); };
  const evaluate = async () => {
    if (!role || busy || mic.recording || mic.busy) return;
    running.current = true; setBusy(true); setError(''); setReport(null); voice.stop();
    try {
      const r = await window.gezhi.companions.evaluate({ vault,roleId,topic,transcript,context:useReference ? referenceText || '' : '',referenceName:useReference ? referenceName || '' : '',sourceId:useReference?studySource?.id:undefined,previousId:previousId||undefined,focus });
      if (!alive.current) return;
      if (!r.ok || !r.report) throw new Error(r.error || '没有收到完整评估');
      setReport(r.report);setPreviousId('');onRecorded?.(); await historyFor(roleId);
    } catch (e) { if (alive.current) setError((e as Error).message); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  };
  const record = async () => {
    setError(''); voice.stop();
    if (!mic.recording) { await mic.start(); return; }
    const r = await mic.stopAndRecognize();
    if (!r.ok || !r.text) setError(r.error || '没有听清，请重新录制');
    else setTranscript(t => (t ? t + '\n' : '') + r.text);
  };
  const exportReport = async () => {
    if (!report || !role) return;
    const markdown = '# ' + report.topic + '：六维反馈\n\n角色：' + role.name + ' · ' + role.title + '\n\n时间：' + report.at + '\n\nAI 形成性反馈，评分尚未经教师校准。\n\n## 我的讲解\n\n' + report.transcript + '\n\n## 反馈\n\n' + report.summary + '\n\n' + report.dimensions.map(d => '### ' + d.label + '：' + (d.score === null ? '未展示' : d.score+'/4') + '\n\n依据：' + (d.evidence || '未提供') + '\n\n' + d.reason + '\n\n下一步：' + d.nextStep).join('\n\n') + '\n\n## 追问\n\n' + report.questions.map(q => '- '+q).join('\n') + '\n\n' + report.referenceLimit;
    const provenance=report.sourceRef?'\n\n## 资料引用快照\n\n'+sourceLocation(report.sourceRef)+'\n\n'+report.sourceRef.text:'';
    const comparison=report.previousId?'\n\n## 再次讲解的反馈变化\n\n'+(report.comparison||[]).map(c=>report.dimensions.find(d=>d.id===c.id)?.label+'：'+c.before+' → '+c.after).join('\n\n')+'\n\n仅比较有证据的维度，AI 分数变化尚未经教师校准。':'';
    const r = await window.gezhi.exporter.run({format:'markdown',markdown:markdown+provenance+comparison,sourcePath:vault,defaultName:'讲解六维反馈',saveAs:true});
    if (!r.ok && !r.canceled) setError(r.error || '导出失败'); else if (r.ok) setNotice('反馈已导出：'+r.path);
  };
  const retry=(current:CompanionReport,nextFocus='')=>{setTranscript(current.transcript);setTopic(current.topic);setPreviousId(current.id);setFocus(nextFocus);setUseReference(Boolean(current.sourceRef || current.referenceName));onSource?.(current.sourceRef||null);setReport(null);voice.stop();};
  const locate=(evidence:string)=>{if(!report||!evidence)return;setTranscript(report.transcript);requestAnimationFrame(()=>{const input=transcriptInput.current;if(!input)return;const start=report.transcript.indexOf(evidence);input.focus();input.setSelectionRange(start,start+evidence.length);input.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});});};
  if (!role) return <section ref={roomRef} className="companion-lobby motion-surface" data-testid="companion-lobby"><div className="room-section-title"><span className="learning-eyebrow">YOUR LEARNING COMPANY</span><h2>今天，想讲给谁听？</h2><p>选择一位听众，进入独立学习空间。不同视角，同一套透明的六维反馈。</p></div><div className="companion-card-grid">{roles.map((r,i) => <button key={r.id} className="companion-card" onClick={() => enter(r.id)} style={{'--role-color':r.color,'--motion-order':i} as CSSProperties}><div className="companion-card-art"><RolePortrait roleId={r.id} name={r.name} /></div><span className="room-role-tag">{r.title}</span><h3>{r.name}</h3><p>{r.description}</p><span className="room-enter">进入空间 <span aria-hidden="true">↗</span></span></button>)}</div><p className="learning-muted">角色是 AI 学习伙伴；反馈供反思与讨论，不代表教师认证成绩。</p></section>;
  return <section ref={roomRef} className="companion-room motion-surface" data-testid="companion-room" style={{'--role-color':role.color} as CSSProperties}>
    <header className="room-toolbar"><button disabled={busy || mic.recording || mic.busy} onClick={() => { voice.stop(); mic.cancel(); request.current++; setRoleId(''); }}>← 返回角色空间</button><div><strong>{role.name}</strong><span>{role.title}</span></div><span>独立讲解 · 六维反馈</span></header>
    {error && <div className="learning-error" role="alert">{error}{/余额|额度|登录|账号/.test(error) && <button style={{marginLeft:12}} onClick={() => void window.gezhi.dshSetup.login().then(r => { if (!r.ok) setError(r.error || '打开登录窗口失败'); })}>打开 DeepSeek Harness</button>}</div>}{notice && <div className="learning-callout" role="status">{notice}</div>}
    <div className="room-layout"><aside className="room-avatar"><RolePortrait roleId={role.id} name={role.name} speaking={voice.speaking} /><h2>{role.name}</h2><span className="room-role-tag">{role.title}</span><p>{role.description}</p><div className="room-status" data-busy={busy} role="status" aria-live="polite">{mic.recording ? `正在倾听 · ${mic.seconds} 秒` : busy ? '正在检查你的讲解…' : report ? '反馈已保存，试着回应追问。' : '准备好了，用自己的话讲给我听。'}</div>
      {report && <button onClick={() => void voice.speak(report.summary + '。' + report.questions.join('。'), {preferCloud:true})}>朗读反馈与追问</button>}<button disabled={!voice.speaking} onClick={voice.stop}>停止朗读</button>{voice.status && <small>{voice.status}</small>}
    </aside><div className="room-workspace"><div className="room-input-card">{previousId&&<div className="learning-callout">再次讲解 · 保持同一主题、角色和资料。{focus&&<p>本次重点：{focus}</p>}<button onClick={()=>{setPreviousId('');setFocus('');}}>改为新的讲解</button></div>}<label>讲解主题<input aria-label="角色讲解主题" maxLength={200} value={topic} onChange={e => setTopic(e.target.value)} disabled={busy || mic.recording || Boolean(previousId)} placeholder="例如：为什么除以 x 可能丢失解？" /></label><label>用自己的话解释<textarea ref={transcriptInput} aria-label="角色文字讲解" value={transcript} maxLength={12000} rows={7} onChange={e => setTranscript(e.target.value)} disabled={busy || mic.recording || mic.busy} placeholder="说清概念、条件和推理，再举例说明。可以录音，也可以输入。" /></label>
      <div className="room-input-meta"><span>{transcript.length} / 12000 字</span><label><input type="checkbox" checked={useReference} onChange={e => setUseReference(e.target.checked)} disabled={busy||Boolean(previousId)} /> 使用当前资料：{studySource?studySource.name+' · '+studySource.section:referenceName || '未选择文件'}</label></div><div className="learning-actions"><button disabled={!cloudReady || busy || mic.busy} onClick={() => void record()}>{mic.recording ? `结束录音（${mic.seconds}s）` : '录音讲解'}</button><button className="learning-primary" disabled={busy || mic.recording || mic.busy || !topic.trim() || transcript.trim().length<10} onClick={() => void evaluate()}>{busy ? '正在生成六维反馈…' : '讲完了，生成六维反馈'}</button>{busy && <button onClick={() => void window.gezhi.companions.stop()}>停止评估</button>}</div><p className="learning-muted">语音转写后可以修改。录音每段最多 55 秒。评估使用已配置 AI；资料按当前章节或选段引用。</p></div>
      {report && <article ref={reportRef} className="room-report" data-testid="companion-report"><div className="room-report-heading"><div><span className="learning-eyebrow">EXPLANATION EVIDENCE</span><h2>你的讲解，哪里还可以更好？</h2><small>{new Date(report.at).toLocaleString('zh-CN')} · {report.referenceName ? '参考：'+report.referenceName : '未提供参考资料'}</small></div><button onClick={() => void exportReport()}>导出反馈</button></div><p>{report.summary}</p>
      {report.previousId&&<div className="room-comparison" data-testid="explanation-comparison"><h3>两次讲解的反馈变化</h3>{report.comparison?.length?report.comparison.map(c=><p key={c.id}><strong>{report.dimensions.find(d=>d.id===c.id)?.label}</strong><span>{c.before} → {c.after}</span><b>{c.delta>0?'+':''}{c.delta}</b></p>):<p>两轮没有可比较的已评分维度。</p>}<small>只比较同一资料、角色和主题下有证据的维度；AI 分数变化供反思，尚未经教师校准。</small></div>}
      <AssessmentRadar dimensions={report.dimensions} /><div className="assessment-dimensions">{report.dimensions.map((d,i) => <section key={d.id} style={{'--motion-order':i} as CSSProperties}><h3>{d.label}<span>{d.score === null ? '未展示' : d.score + ' / 4'}</span></h3>{d.evidence && <blockquote>“{d.evidence}”<button onClick={()=>locate(d.evidence)}>定位讲解原话</button></blockquote>}<p>{d.reason}</p><div className="assessment-next"><strong>下一步</strong> {d.nextStep}</div><div className="learning-actions"><button onClick={()=>retry(report,d.label+'：'+d.nextStep)}>围绕这一项再讲</button><button disabled={!report.sourceRef} onClick={()=>onTask?.(d.id==='transfer'?'transfer':d.id==='conditions'?'detective':'practice',d.label+'：'+d.nextStep,report.sourceRef)}>做针对性任务</button></div></section>)}</div><div className="room-followups"><h3>{role.name}的追问</h3>{report.questions.map((q,i) => <p key={i}>{i+1}. {q}</p>)}</div><p className="learning-muted">{report.referenceLimit}</p><button disabled={busy} onClick={() => retry(report)}>按建议再讲一遍</button></article>}
      {history.length > 0 && <section className="room-history"><h3>这个空间的讲解记录</h3>{history.map(r => <button key={r.id} disabled={busy || mic.recording} onClick={() => setReport(r)}><span>{r.topic}</span><small>{new Date(r.at).toLocaleString('zh-CN')}</small></button>)}</section>}
    </div></div>
  </section>;
}
