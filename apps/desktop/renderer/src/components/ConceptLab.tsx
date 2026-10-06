import { useEffect, useRef, useState } from 'react';
import type { LabKind, LabParams } from '../../../shared/lab-models.mjs';
import { motion, probability, quadratic, sampleTrials } from '../../../shared/lab-models.mjs';
import type { LearningActivity, LearningAttempt } from '../lib/learning-types';
import LearningExercise from './LearningExercise';

const DEFAULTS: Record<LabKind, LabParams> = { quadratic: { a: 1, h: 0, k: 0, x: 2 }, force: { force: 20, mass: 4, friction: 0.1 }, probability: { p: 0.5, n: 2 } };
const LABS: { kind: LabKind; title: string; subtitle: string }[] = [
  { kind: 'quadratic', title: '函数的形状', subtitle: '改变参数，观察图像与顶点' },
  { kind: 'force', title: '力与运动', subtitle: '预测加速度，再观察运动' },
  { kind: 'probability', title: '概率与抽样', subtitle: '对比理论概率和实验频率' },
];
const SLIDERS: Record<LabKind, { key: keyof LabParams; label: string; min: number; max: number; step: number }[]> = {
  quadratic: [{ key: 'a', label: '开口系数 a', min: -3, max: 3, step: 0.25 }, { key: 'h', label: '横向平移 h', min: -4, max: 4, step: 0.5 }, { key: 'k', label: '纵向平移 k', min: -4, max: 4, step: 0.5 }, { key: 'x', label: '预测位置 x', min: -4, max: 4, step: 0.5 }],
  force: [{ key: 'force', label: '水平拉力 F（N）', min: 0, max: 80, step: 1 }, { key: 'mass', label: '质量 m（kg）', min: 1, max: 10, step: 0.5 }, { key: 'friction', label: '摩擦系数 μ', min: 0, max: 0.6, step: 0.05 }],
  probability: [{ key: 'p', label: '单次成功概率 p', min: 0.1, max: 0.9, step: 0.05 }, { key: 'n', label: '每组独立尝试次数 n', min: 1, max: 5, step: 1 }],
};
interface Props { vault: string; onRecorded: () => void; onCoach: (text: string, read?: boolean) => void; onEvidence: (concept: string) => void }
export default function ConceptLab({ vault, onRecorded, onCoach, onEvidence }: Props) {
  const [kind, setKind] = useState<LabKind>('quadratic');
  const [params, setParams] = useState<LabParams>({ ...DEFAULTS.quadratic });
  const [activity, setActivity] = useState<LearningActivity | null>(null);
  const [attempt, setAttempt] = useState<LearningAttempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);
  const [samples, setSamples] = useState({ count: 0, success: 0, seed: 12345 });
  const [observation, setObservation] = useState('');
  const [saved, setSaved] = useState(false);
  const frame = useRef(0);
  const scope = useRef(0);
  useEffect(() => () => { scope.current++; cancelAnimationFrame(frame.current); }, []);
  const reset = (next: LabKind) => { scope.current++; cancelAnimationFrame(frame.current); setKind(next); setParams({ ...DEFAULTS[next] }); setActivity(null); setAttempt(null); setTime(0); setRunning(false); setSamples({ count: 0, success: 0, seed: 12345 }); setObservation(''); setSaved(false); setError(''); };
  const prepare = async () => {
    const seq = scope.current; setBusy(true); setError('');
    try { const r = await window.gezhi.learning.lab({ vault, kind, params }); if (seq !== scope.current) return; if (!r.ok || !r.activity) throw new Error(r.error || '实验准备失败'); setActivity(r.activity); }
    catch (e) { if (seq === scope.current) setError((e as Error).message); } finally { if (seq === scope.current) setBusy(false); }
  };
  const runMotion = () => {
    if (!attempt) return; cancelAnimationFrame(frame.current); setTime(0);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setTime(3); setRunning(false); return; }
    setRunning(true); const start = performance.now(); let last = 0;
    const tick = (now: number) => { const t = Math.min(3, (now - start) / 1000); if (now - last > 40 || t === 3) { setTime(t); last = now; } if (t < 3) frame.current = requestAnimationFrame(tick); else setRunning(false); };
    frame.current = requestAnimationFrame(tick);
  };
  const sample = (count: number) => { const r = sampleTrials(params, count, samples.seed); setSamples({ count: samples.count + count, success: samples.success + r.success, seed: r.seed }); };
  const saveObservation = async () => {
    if (!attempt) return; setBusy(true); setError('');
    try { const r = await window.gezhi.learning.annotate({ vault, id: attempt.id, observation }); if (!r.ok) throw new Error(r.error || '观察记录保存失败'); setSaved(true); onRecorded(); onCoach('实验观察已保存。试着改变一个条件，再预测一次。'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const model = kind === 'force' ? motion(params, time) : null;
  const theoretical = kind === 'probability' ? probability(params) : 0;
  const frequency = samples.count ? samples.success / samples.count : 0;
  const graphPoints = kind === 'quadratic' ? Array.from({ length: 241 }, (_, i) => {
    const x = -6 + i / 20, y = quadratic(x, params); return (300 + x * 43) + ',' + (150 - y * 16);
  }).join(' ') : '';
  return <div className="concept-lab" data-testid="concept-lab" data-kind={kind}>
    <div className="learning-section-heading"><div><span className="learning-eyebrow">预测 → 操作 → 解释</span><h2>概念实验台</h2></div></div>
    <div className="lab-selector">{LABS.map(l => <button key={l.kind} disabled={busy} aria-pressed={kind === l.kind} onClick={() => reset(l.kind)}><strong>{l.title}</strong><small>{l.subtitle}</small></button>)}</div>
    <div className="lab-layout"><div className="lab-visual">
      {kind === 'quadratic' && <><div className="lab-equation">y = {params.a} × (x − ({params.h}))² + ({params.k})</div><svg viewBox="0 0 600 300" role="img" aria-label="二次函数交互图像"><defs><clipPath id="quadratic-clip"><rect x="20" y="10" width="560" height="280" /></clipPath></defs>{Array.from({ length: 13 }, (_, i) => <line className="lab-grid" key={'x' + i} x1={42 + i * 43} y1="10" x2={42 + i * 43} y2="290" />)}{Array.from({ length: 17 }, (_, i) => <line className="lab-grid" key={'y' + i} x1="20" y1={22 + i * 16} x2="580" y2={22 + i * 16} />)}<path className="lab-axis" d="M20 150H580 M300 10V290" /><text x="580" y="143">x</text><text x="308" y="18">y</text><text x="305" y="165">0</text><text x="512" y="165">5</text><text x="77" y="165">−5</text><text x="308" y="74">5</text><text x="308" y="235">−5</text><g clipPath="url(#quadratic-clip)"><polyline className="lab-curve" points={graphPoints} /><line className="lab-target" x1={300 + params.x! * 43} y1="10" x2={300 + params.x! * 43} y2="290" />{params.a !== 0 && <circle className="lab-vertex" cx={300 + params.h! * 43} cy={150 - params.k! * 16} r="6" />}{attempt && <circle className="lab-result-point" cx={300 + params.x! * 43} cy={150 - quadratic(params.x!, params) * 16} r="7" />}</g></svg><p className="learning-muted">虚线为待预测的 x 位置。{params.a === 0 ? 'a = 0，图像退化为常函数。' : '圆点为顶点。'}纵轴显示 −8 至 8，超出窗口的曲线会被裁切。</p></>}
      {kind === 'force' && model && <><div className="lab-equation">F合 = F − f · a = F合 / m</div><svg viewBox="0 0 600 260" role="img" aria-label="水平受力与运动实验"><defs><marker id="force-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="currentColor" /></marker></defs><line className="lab-ground" x1="25" y1="188" x2="575" y2="188" /><g transform={'translate(' + (70 + model.displacement / 360 * 360) + ' 0)'}><rect className="lab-cart" x="0" y="115" width="80" height="55" rx="10" /><text className="lab-cart-label" x="40" y="149" textAnchor="middle">{params.mass} kg</text><circle className="lab-wheel" cx="18" cy="177" r="10" /><circle className="lab-wheel" cx="62" cy="177" r="10" /><path className="lab-force" d={'M80 133h' + Math.max(0, params.force! * 1.4)} markerEnd={params.force ? 'url(#force-arrow)' : undefined} /><text x="85" y="115">拉力 {params.force} N</text><path className="lab-friction" d={'M0 153h-' + Math.max(0, model.friction * 1.4)} markerEnd={model.friction ? 'url(#force-arrow)' : undefined} /></g><text x="30" y="225">0 m</text><text x="410" y="225">360 m</text></svg><div className="lab-readouts"><span>时间 <b>{time.toFixed(2)} s</b></span><span>加速度 <b>{attempt ? model.acceleration.toFixed(2) + ' m/s²' : '预测后显示'}</b></span><span>位移 <b>{model.displacement.toFixed(2)} m</b></span></div><button className="learning-primary" disabled={!attempt || running} onClick={runMotion}>{running ? '实验运行中…' : '运行 3 秒实验'}</button><p className="learning-muted">物体从静止开始，水平恒力，g = 9.8 m/s²；静、滑动摩擦系数相同，忽略空气阻力。动画按 1 px/m 展示位移，初始坐标有视觉偏移。</p></>}
      {kind === 'probability' && <><div className="lab-equation">P(至少成功一次) = 1 − (1 − p)ⁿ</div><div className="probability-bars"><div><span>理论概率</span><i style={{ width: (attempt ? theoretical * 100 : 0) + '%' }} /><b>{attempt ? (theoretical * 100).toFixed(2) + '%' : '提交预测后揭晓'}</b></div><div><span>抽样频率</span><i className="empirical" style={{ width: frequency * 100 + '%' }} /><b>{samples.count ? (frequency * 100).toFixed(2) + '%' : '尚未抽样'}</b></div></div><div className="lab-readouts"><span>实验组数 <b>{samples.count}</b></span><span>成功组数 <b>{samples.success}</b></span><span>每组尝试 <b>{params.n} 次</b></span></div><div className="learning-actions"><button disabled={!attempt || samples.count >= 10000} onClick={() => sample(Math.min(100, 10000 - samples.count))}>抽样 100 组</button><button disabled={!attempt || samples.count >= 10000} onClick={() => sample(Math.min(1000, 10000 - samples.count))}>抽样 1000 组</button></div><p className="learning-muted">每组重复 n 次独立试验，统计至少成功一次的组数。抽样频率存在随机波动，每轮最多 10000 组。</p></>}
    </div><div className="lab-controls"><h3>只改变一个条件，看看会怎样</h3>{SLIDERS[kind].map(s => <label key={s.key}>{s.label}<output>{params[s.key]}</output><input type="range" aria-label={s.label} min={s.min} max={s.max} step={s.step} disabled={Boolean(activity) || busy} value={params[s.key]} onChange={e => setParams(p => ({ ...p, [s.key]: Number(e.target.value) }))} /></label>)}
      {!activity ? <button className="learning-primary" disabled={busy} onClick={() => void prepare()}>{busy ? '准备中…' : '用当前参数开始预测'}</button> : <><p className="learning-muted">本轮参数已固定，保证预测与验证使用相同条件。</p><button disabled={busy || running} onClick={() => reset(kind)}>开始新一轮实验</button></>}
    </div></div>
    {error && <div className="learning-error" role="alert">{error}</div>}
    {activity && <LearningExercise key={activity.id} vault={vault} activity={activity} onRecorded={onRecorded} onCoach={onCoach} onEvidence={onEvidence} onResult={a => { setAttempt(a); }} />}
    {attempt && <section className="lab-observation"><h3>把观察变成理解</h3><p>预测与现象有哪些差异？关系式中的哪个条件解释了差异？</p><textarea aria-label="实验观察与解释" rows={4} maxLength={6000} value={observation} onChange={e => { setObservation(e.target.value); setSaved(false); }} placeholder="写下观察、解释，以及下一次想改变的条件。" /><button className="learning-primary" disabled={busy || saved || observation.trim().length < 3} onClick={() => void saveObservation()}>{saved ? '观察已保存到学习证据' : '保存观察与解释'}</button></section>}
  </div>;
}
