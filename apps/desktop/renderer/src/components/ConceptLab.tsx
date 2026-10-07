import { useEffect, useRef, useState } from 'react';
import type { LabKind, LabParams } from '../../../shared/lab-models.mjs';
import { motion, probability, quadratic, sampleTrials } from '../../../shared/lab-models.mjs';
import type { LearningActivity, LearningAttempt, LearningMode, StudySource } from '../lib/learning-types';
import LearningExercise from './LearningExercise';

const DEFAULTS: Record<LabKind, LabParams> = {quadratic:{a:1,h:0,k:0,x:2},force:{force:20,mass:4,friction:0.1},probability:{p:0.5,n:2}};
const LABS = [
  {kind:'quadratic' as LabKind,title:'函数的形状',subtitle:'比较参数、顶点和开口'},
  {kind:'force' as LabKind,title:'力与运动',subtitle:'对比受力、加速度和位移'},
  {kind:'probability' as LabKind,title:'概率与抽样',subtitle:'比较理论概率和抽样频率'},
];
const SLIDERS: Record<LabKind,{key:keyof LabParams;label:string;min:number;max:number;step:number}[]> = {
  quadratic:[{key:'a',label:'开口系数 a',min:-3,max:3,step:.25},{key:'h',label:'横向平移 h',min:-4,max:4,step:.5},{key:'k',label:'纵向平移 k',min:-4,max:4,step:.5},{key:'x',label:'预测位置 x',min:-4,max:4,step:.5}],
  force:[{key:'force',label:'水平拉力 F（N）',min:0,max:80,step:1},{key:'mass',label:'质量 m（kg）',min:1,max:10,step:.5},{key:'friction',label:'摩擦系数 μ',min:0,max:.6,step:.05}],
  probability:[{key:'p',label:'单次成功概率 p',min:.1,max:.9,step:.05},{key:'n',label:'每组独立尝试次数 n',min:1,max:5,step:1}],
};
interface Props {vault:string;studySource?:StudySource|null;includeExamples?:boolean;visible?:boolean;onRecorded:()=>void;onCoach:(text:string,read?:boolean)=>void;onEvidence:(concept:string)=>void;onTask?:(mode:LearningMode)=>void}
export default function ConceptLab({vault,studySource=null,includeExamples=false,visible=true,onRecorded,onCoach,onEvidence,onTask}:Props) {
  const [kind,setKind]=useState<LabKind>('quadratic'),[params,setParams]=useState<LabParams>({...DEFAULTS.quadratic});
  const [activity,setActivity]=useState<LearningActivity|null>(null),[attempt,setAttempt]=useState<LearningAttempt|null>(null);
  const [baseline,setBaseline]=useState<LearningAttempt|null>(null),[changeKey,setChangeKey]=useState<keyof LabParams>('a');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[time,setTime]=useState(0),[running,setRunning]=useState(false);
  const [completed,setCompleted]=useState(false),[observation,setObservation]=useState(''),[saved,setSaved]=useState(false);
  const [samples,setSamples]=useState({count:0,success:0,seed:1});
  const frame=useRef(0),scope=useRef(0),alive=useRef(true);
  const available=studySource?LABS.filter(l=>studySource.labs.some(s=>s.kind===l.kind)):includeExamples?LABS:[];
  const clearRound=()=>{scope.current++;cancelAnimationFrame(frame.current);setActivity(null);setAttempt(null);setCompleted(false);setTime(0);setRunning(false);setObservation('');setSaved(false);setError('');setBusy(false);setSamples({count:0,success:0,seed:1});};
  const reset=(next:LabKind)=>{clearRound();setKind(next);setBaseline(null);setChangeKey(SLIDERS[next][0].key);setParams({...DEFAULTS[next],...studySource?.labs.find(l=>l.kind===next)?.parameters});};
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;scope.current++;cancelAnimationFrame(frame.current);};},[]);
  useEffect(()=>{reset(available.some(l=>l.kind===kind)?kind:available[0]?.kind||'quadratic');},[studySource?.id,includeExamples]);
  useEffect(()=>{if(!visible){cancelAnimationFrame(frame.current);setRunning(false);}},[visible]);
  const prepare=async()=>{
    const seq=scope.current;setBusy(true);setError('');
    try{const r=await window.gezhi.learning.lab({vault,kind,params,sourceId:studySource?.id,example:!studySource&&includeExamples,previousLabId:baseline?.id});if(!alive.current||seq!==scope.current)return;if(!r.ok||!r.activity)throw Error(r.error||'实验准备失败');setActivity(r.activity);setSamples({count:0,success:0,seed:r.activity.sampleSeed??1});}
    catch(e){if(alive.current&&seq===scope.current)setError((e as Error).message);}finally{if(alive.current&&seq===scope.current)setBusy(false);}
  };
  const runMotion=()=>{
    if(!attempt)return;cancelAnimationFrame(frame.current);setTime(0);setCompleted(false);
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){setTime(3);setCompleted(true);return;}
    setRunning(true);const start=performance.now();let last=0;
    const tick=(now:number)=>{const t=Math.min(3,(now-start)/1000);if(now-last>30||t===3){setTime(t);last=now;}if(t<3)frame.current=requestAnimationFrame(tick);else{setRunning(false);setCompleted(true);}};
    frame.current=requestAnimationFrame(tick);
  };
  const sample=(count:number)=>{const r=sampleTrials(params,count,samples.seed);setSamples({count:samples.count+count,success:samples.success+r.success,seed:r.seed});setCompleted(true);setSaved(false);};
  const saveObservation=async()=>{
    if(!attempt||!completed)return;const seq=scope.current;setBusy(true);setError('');
    try{const measurement=kind==='quadratic'?{revealed:true}:kind==='force'?{time:3}:{count:samples.count};const r=await window.gezhi.learning.annotate({vault,id:attempt.id,observation,measurement});if(!alive.current||seq!==scope.current)return;if(!r.ok||!r.attempt)throw Error(r.error||'观察保存失败');setAttempt(r.attempt);setSaved(true);onRecorded();onCoach('预测、运行数据与解释已保存。可以保留本轮作为对照，只改变一个条件再验证。');}
    catch(e){if(alive.current&&seq===scope.current)setError((e as Error).message);}finally{if(alive.current&&seq===scope.current)setBusy(false);}
  };
  const startComparison=()=>{if(!saved||!attempt)return;const previous=attempt;clearRound();setBaseline(previous);setChangeKey(SLIDERS[kind][0].key);};
  const model=motion(paramsForForce(params,kind),time),theoretical=kind==='probability'?probability(params):0;
  const frequency=samples.count?samples.success/samples.count:0;
  const baselineParams=baseline?.params;
  const displacementMax=Math.max(1,motion(paramsForForce(params,kind),3).displacement,baselineParams&&kind==='force'?motion(baselineParams,3).displacement:0);
  const rulerMax=Math.ceil(displacementMax/5)*5,pxPerMeter=400/rulerMax;
  const yRange=kind==='quadratic'&&completed?Math.max(8,Math.ceil(Math.max(...Array.from({length:121},(_,i)=>Math.abs(quadratic(-6+i/10,params))),...(baselineParams?Array.from({length:121},(_,i)=>Math.abs(quadratic(-6+i/10,baselineParams))):[0]))/5)*5):8;
  const graph=(p:LabParams)=>Array.from({length:241},(_,i)=>{const x=-6+i/20;return `${300+43*x},${150-130*quadratic(x,p)/yRange}`;}).join(' ');
  if(!available.length)return <section className="learning-empty" data-testid="lab-unavailable"><h2>{studySource?'当前章节尚无匹配的交互模型':'先选择实验所依据的资料'}</h2><p>{studySource?'可以围绕原文做条件对比、反例探究与迁移任务。当前支持二次函数、牛顿第二定律和独立事件模型。':'在左侧打开资料并选择章节，实验会显示来源和参数依据。内置示例可通过上方开关启用。'}</p>{studySource&&<div className="learning-actions"><button onClick={()=>onTask?.('detective')}>创建反例探究任务</button><button onClick={()=>onTask?.('transfer')}>创建迁移任务</button></div>}</section>;
  return <div className="concept-lab" data-testid="concept-lab" data-kind={kind}>
    <div className="learning-section-heading"><div><span className="learning-eyebrow">预测 → 操作 → 对照 → 解释</span><h2>概念实验台</h2></div><span className="study-source-location">{studySource?studySource.name+' · '+studySource.section:'内置原创示例 · 非导入资料'}</span></div>
    <div className="lab-selector">{available.map(l=><button key={l.kind} disabled={busy||running} aria-pressed={kind===l.kind} onClick={()=>reset(l.kind)}><strong>{l.title}</strong><small>{l.subtitle}</small></button>)}</div>
    <p className="learning-muted">{studySource?`已匹配当前章节。识别到 ${Object.keys(studySource.labs.find(l=>l.kind===kind)?.parameters||{}).join('、')||'无明确赋值参数'}；其余参数使用可调整的教学默认值，请核对原文。`:'这是独立教学示例。'}{kind==='force'&&' 模型限定：水平恒力、从静止开始，静与滑动摩擦系数相同，g=9.8 m/s²，无空气阻力。'}</p>
    {baseline&&<div className="lab-comparison-header"><strong>对照实验：保留上一轮</strong><label>只改变<select aria-label="对照实验变化参数" disabled={Boolean(activity)} value={changeKey} onChange={e=>{setChangeKey(e.target.value as keyof LabParams);setParams({...baseline.params!});}}>{SLIDERS[kind].map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select></label><span>其余参数保持一致</span></div>}
    <div className="lab-layout"><div className="lab-visual">
      {kind==='quadratic'&&<><div className="lab-equation">y = {params.a} × (x − ({params.h}))² + ({params.k})</div><svg viewBox="0 0 600 300" role="img" aria-label="二次函数交互图像"><defs><clipPath id="study-curve-clip"><rect x="20" y="10" width="560" height="280"/></clipPath></defs>{Array.from({length:13},(_,i)=><line className="lab-grid" key={i} x1={42+43*i} x2={42+43*i} y1="10" y2="290"/>)}{Array.from({length:9},(_,i)=><line className="lab-grid" key={'y'+i} x1="20" x2="580" y1={20+32.5*i} y2={20+32.5*i}/>)}<path className="lab-axis" d="M20 150H580 M300 10V290"/><text x="580" y="143">x</text><text x="308" y="18">y</text><text x="305" y="165">0</text><text x="508" y="165">5</text><text x="80" y="165">−5</text><text x="310" y="27">{yRange}</text><text x="310" y="285">−{yRange}</text>{completed&&<g clipPath="url(#study-curve-clip)">{baselineParams&&<polyline className="lab-curve baseline" points={graph(baselineParams)}/>}<polyline className="lab-curve" points={graph(params)}/><line className="lab-target" x1={300+43*params.x!} x2={300+43*params.x!} y1="10" y2="290"/>{params.a!==0&&<circle className="lab-vertex" cx={300+43*params.h!} cy={150-130*params.k!/yRange} r="6"/>}<circle className="lab-result-point" cx={300+43*params.x!} cy={150-130*quadratic(params.x!,params)/yRange} r="7"/></g>}</svg><button className="learning-primary" disabled={!attempt||completed} onClick={()=>setCompleted(true)}>{completed?'图像已验证':'验证函数图像'}</button><p className="learning-muted">{completed?`当前纵轴范围 ±${yRange}；${baseline?'虚线为上一轮，实线为本轮。':''}${params.a===0?'a=0 时退化为常函数。':'圆点标记顶点与预测位置。'}`:'先提交预测，随后揭晓图像。'}</p></>}
      {kind==='force'&&<><div className="lab-equation">{completed?'F合 = F − f；a = F合 / m':'预测恒力作用下的加速度'}</div><svg viewBox="0 0 600 260" role="img" aria-label="水平受力与运动实验"><defs><marker id="study-force-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="currentColor"/></marker></defs><line className="lab-ground" x1="25" x2="575" y1="188" y2="188"/><g transform={`translate(${60+model.displacement*pxPerMeter} 0)`}><rect className="lab-cart" x="0" y="130" width="70" height="55" rx="6"/><text className="lab-cart-label" x="35" y="160" textAnchor="middle">{params.mass} kg</text><path className="lab-force" d={`M70 145h${params.force!*.6}`} markerEnd={params.force?'url(#study-force-arrow)':undefined}/><path className="lab-friction" d={`M0 167h-${Math.min(45,model.friction*.6)}`} markerEnd={model.friction?'url(#study-force-arrow)':undefined}/></g>{Array.from({length:5},(_,i)=><g key={i}><line className="lab-grid" x1={60+i*100} x2={60+i*100} y1="191" y2="201"/><text x={60+i*100} y="224" textAnchor="middle">{Number((rulerMax*i/4).toFixed(2))} m</text></g>)}</svg><div className="lab-readouts"><span>时间<b>{time.toFixed(2)} s</b></span><span>加速度<b>{completed||running?model.acceleration.toFixed(2)+' m/s²':'运行后显示'}</b></span><span>位移<b>{model.displacement.toFixed(2)} m</b></span></div><button className="learning-primary" disabled={!attempt||running||saved} onClick={runMotion}>{running?'实验运行中…':'运行 3 秒实验'}</button><p className="learning-muted">滑块位移使用统一标尺；本轮每米对应 {pxPerMeter.toFixed(2)} 像素。{baseline?'两轮共用同一比例。':''}</p></>}
      {kind==='probability'&&<><div className="lab-equation">{completed?'P(至少成功一次) = 1 − (1 − p)ⁿ':`每组独立尝试 ${params.n} 次，预测至少成功一次的概率`}</div><div className="probability-bars"><div><span>理论概率</span><i style={{width:(completed?theoretical*100:0)+'%'}}/><b>{completed?(theoretical*100).toFixed(2)+'%':'抽样后显示'}</b></div><div><span>抽样频率</span><i className="empirical" style={{width:frequency*100+'%'}}/><b>{samples.count?(frequency*100).toFixed(2)+'%':'尚未抽样'}</b></div></div><div className="lab-readouts"><span>实验组数<b>{samples.count}</b></span><span>成功组数<b>{samples.success}</b></span><span>每组尝试<b>{params.n} 次</b></span></div><div className="learning-actions"><button disabled={!attempt||saved||samples.count>=10000} onClick={()=>sample(Math.min(100,10000-samples.count))}>抽样 100 组</button><button disabled={!attempt||saved||samples.count>=10000} onClick={()=>sample(Math.min(1000,10000-samples.count))}>抽样 1000 组</button></div><p className="learning-muted">频率会随机波动，不保证每次增加样本都更接近理论。每轮使用独立种子，最多 10000 组；保存时保留种子和统计结果以便复现。</p></>}
    </div><div className="lab-controls"><h3>{baseline?'保持控制变量':'选择本轮参数'}</h3>{SLIDERS[kind].map(s=><label key={s.key}>{s.label}<output>{params[s.key]}</output><input type="range" aria-label={s.label} min={s.min} max={s.max} step={s.step} disabled={Boolean(activity)||busy||(Boolean(baseline)&&s.key!==changeKey)} value={params[s.key]} onChange={e=>setParams(p=>({...p,[s.key]:Number(e.target.value)}))}/></label>)}{!activity?<button className="learning-primary" disabled={busy||(Boolean(baseline)&&params[changeKey]===baseline?.params?.[changeKey])} onClick={()=>void prepare()}>{busy?'准备中…':'用当前参数开始预测'}</button>:<p className="learning-muted">本轮参数已锁定。完成观察后可开始下一轮。</p>}{saved&&<div className="learning-actions"><button onClick={startComparison}>保留本轮，改变一个条件</button><button onClick={()=>{clearRound();setBaseline(null);}}>开始独立实验</button></div>}</div></div>
    {baseline&&completed&&<div className="lab-comparison-results"><h3>两轮结果对比</h3><p>上一轮：{kind==='quadratic'?`y=${baseline.measurement?.y}`:kind==='force'?`a=${baseline.measurement?.acceleration?.toFixed(2)} m/s²，s=${baseline.measurement?.displacement?.toFixed(2)} m`:`理论 ${((baseline.measurement?.theoretical||0)*100).toFixed(2)}%，${baseline.measurement?.count} 组抽样频率 ${((baseline.measurement?.frequency||0)*100).toFixed(2)}%`}</p><p>本轮：{kind==='quadratic'?`y=${quadratic(params.x!,params)}`:kind==='force'?`a=${model.acceleration.toFixed(2)} m/s²，s=${model.displacement.toFixed(2)} m`:`理论 ${(theoretical*100).toFixed(2)}%，${samples.count} 组抽样频率 ${(frequency*100).toFixed(2)}%`}</p></div>}
    {error&&<div className="learning-error" role="alert">{error}</div>}
    {activity&&<LearningExercise key={activity.id} vault={vault} activity={activity} onRecorded={onRecorded} onCoach={onCoach} onEvidence={onEvidence} revealFeedback={completed} onResult={setAttempt}/>}
    {attempt&&<section className="lab-observation"><h3>把观察变成理解</h3><p>比较预测与结果，说明哪个条件解释了变化。{!completed&&'请先完成上方实验。'}</p><textarea aria-label="实验观察与解释" rows={4} maxLength={6000} value={observation} onChange={e=>{setObservation(e.target.value);setSaved(false);}} placeholder="写下观察、解释，以及下一次想改变的条件。"/><button className="learning-primary" disabled={!completed||busy||saved||observation.trim().length<3} onClick={()=>void saveObservation()}>{saved?'观察已保存到学习证据':'保存观察与解释'}</button><p className="learning-muted">数值预测与运行数据可核验；文字解释尚未进行语义评分。</p></section>}
  </div>;
}
function paramsForForce(params:LabParams,kind:LabKind):LabParams{return kind==='force'?params:DEFAULTS.force;}
