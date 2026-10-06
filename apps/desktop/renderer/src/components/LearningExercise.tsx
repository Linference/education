import { useRef, useState } from 'react';
import type { LearningActivity, LearningAttempt } from '../lib/learning-types';
import { CONFIDENCE, supportLabel } from '../lib/learning-types';

interface Props {
  activity: LearningActivity; vault: string;
  priorExposure?: boolean;
  onRecorded: () => void; onCoach: (text: string, read?: boolean) => void;
  onResult?: (attempt: LearningAttempt) => void; onEvidence?: (concept: string) => void;
  children?: React.ReactNode;
}
export default function LearningExercise({ activity: a, vault, priorExposure = false, onRecorded, onCoach, onResult, onEvidence, children }: Props) {
  const [response, setResponse] = useState('');
  const [correction, setCorrection] = useState('');
  const [reflection, setReflection] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [hint, setHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState<LearningAttempt | null>(null);
  const [scheduled, setScheduled] = useState(false);
  const submission = useRef(crypto.randomUUID());
  const saving = useRef(false);
  const needsReflection = ['detective', 'transfer', 'lab'].includes(a.mode);
  const canSubmit = Boolean(response.trim() && confidence && (!needsReflection || reflection.trim()) && (a.mode !== 'detective' || correction));
  const submit = async () => {
    if (saving.current || !canSubmit || attempt) return;
    saving.current = true; setBusy(true); setError('');
    try {
      const r = await window.gezhi.learning.submit({ vault, activityId: a.id, submissionId: submission.current,
        response, correction, confidence, usedHint: hint, previewedAnswer: priorExposure, reflection });
      if (!r.ok || !r.attempt) throw new Error(r.error || '保存失败');
      setAttempt(r.attempt); onResult?.(r.attempt); onRecorded();
      onCoach((r.attempt.correct === null ? '请根据参考答案核对你的推理。' : r.attempt.correct ? '这次验证通过了。' : '这次验证还没有通过。') + r.attempt.explanation);
    } catch (e) { setError(String((e as Error).message)); }
    finally { saving.current = false; setBusy(false); }
  };
  const selfReview = async (verdict: string) => {
    if (!attempt || busy) return; setBusy(true); setError('');
    try { const r = await window.gezhi.learning.annotate({ vault, id: attempt.id, selfVerdict: verdict }); if (!r.ok || !r.attempt) throw new Error(r.error || '自评保存失败'); setAttempt(r.attempt); onRecorded(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const schedule = async () => {
    setBusy(true); setError('');
    try { const r = await window.gezhi.learning.schedule({ vault, concept: a.concept }); if (!r.ok) throw new Error(r.error || '安排失败'); setScheduled(true); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <section className="learning-exercise" data-testid="learning-exercise" data-activity-id={a.id}>
    <div className="learning-eyebrow">{a.concept}{a.level ? ' · 第 ' + a.level + ' 关 / ' + a.levelLabel : ''}</div>
    <h2>{a.title}</h2>
    <p className="learning-source">{a.source}</p>
    <p className="learning-prompt">{a.prompt}</p>
    {priorExposure && <div className="learning-callout">你已在题库查看过参考答案。本轮按有参考帮助的练习记录。</div>}
    {a.mode === 'detective' && <div className="learning-callout">这是找错挑战。以下步骤包含已知错误，请定位最早的错误，并选择修正方案。</div>}
    <fieldset disabled={busy || Boolean(attempt)} className="learning-answer-fields">
      <legend>{a.mode === 'detective' ? '先找到出错的一步' : a.options.length ? '选择你的答案' : '写下你的答案'}</legend>
      {a.options.length > 0 ? <div className="learning-options">{a.options.map(o => <label key={o.label} className={'learning-option' + (response === o.label ? ' selected' : '')}>
        <input type="radio" name={'answer-' + a.id} value={o.label} checked={response === o.label} onChange={() => setResponse(o.label)} />
        <span className="option-letter">{o.label}</span><span>{o.text}</span>
      </label>)}</div> : a.grading === 'numeric' ? <input className="learning-number" aria-label="预测或计算的数值" inputMode="decimal" value={response} onChange={e => setResponse(e.target.value)} placeholder="填写数值或分数" />
        : <textarea aria-label="你的答案" rows={4} value={response} onChange={e => setResponse(e.target.value)} placeholder="写出答案与解题过程，提交后再核对参考答案。" />}
      {a.correctionOptions && <><legend className="learning-sublegend">再选择修正方案</legend><div className="learning-options">{a.correctionOptions.map((text, i) => {
        const label = String.fromCharCode(65 + i); return <label key={label} className={'learning-option' + (correction === label ? ' selected' : '')}>
          <input type="radio" name={'correction-' + a.id} checked={correction === label} onChange={() => setCorrection(label)} /><span className="option-letter">{label}</span><span>{text}</span></label>;
      })}</div></>}
      <label className="learning-reflection">{a.mode === 'detective' ? '为什么错？修正的依据是什么？' : a.mode === 'lab' ? '你的预测依据' : '记录你的推理' }{needsReflection ? '（必填）' : '（选填）'}
        <textarea aria-label="推理或预测依据" rows={3} maxLength={6000} value={reflection} onChange={e => setReflection(e.target.value)} placeholder="写下你使用的条件、关系式或反例。" />
      </label>
      <legend className="learning-sublegend">揭晓答案前，你有多确定？</legend>
      <div className="confidence-picker" role="radiogroup" aria-label="作答自信度">{[1, 2, 3].map(n => <button key={n} type="button" role="radio" aria-label={CONFIDENCE[n]} aria-checked={confidence === n} className={confidence === n ? 'selected' : ''} onClick={() => setConfidence(n)}><span aria-hidden="true">{['', '○', '◐', '●'][n]}</span>{CONFIDENCE[n]}</button>)}</div>
      <div className="learning-submit-row"><button type="button" className="learning-primary" disabled={!canSubmit} onClick={() => void submit()}>{busy ? '正在保存…' : a.mode === 'lab' ? '提交预测并验证' : '提交答案并记录'}</button>
        <button type="button" onClick={() => { setHint(true); onCoach(a.hint); }}>给我一个提示</button><small>使用提示会如实记录</small></div>
    </fieldset>
    {hint && <div className="learning-callout" role="note">小格的提示：{a.hint}</div>}
    {error && <div className="learning-error" role="alert">{error}</div>}
    {attempt && <section className={'learning-feedback ' + (attempt.correct === null ? 'unverified' : attempt.correct ? 'correct' : 'incorrect')} data-testid="learning-feedback">
      <div className="learning-feedback-heading"><strong>{attempt.correct === null ? '已记录 · 等待核对' : attempt.correct ? '验证通过' : '需要再检验'}</strong><span>自信度：{CONFIDENCE[attempt.confidence]} · {supportLabel(attempt)}</span></div>
      <p><b>参考答案：</b>{attempt.answer || '题库没有参考答案，请查阅原始资料。'}</p>
      <p>{attempt.explanation}</p>
      {attempt.correct === false && attempt.confidence === 3 && <div className="learning-callout">你对这次答案很确定，但核验未通过。下一次练习优先检查这个判断的适用条件。</div>}
      {attempt.grading === 'self' ? <><p className="learning-muted">本题采用自评；自评结果会保留，但不计入“独立通过”的可核验证据。</p><div className="learning-actions">{[['correct', '核对后：正确'], ['partial', '部分正确'], ['incorrect', '需要重做']].map(([v, label]) => <button key={v} disabled={busy} aria-pressed={attempt.selfVerdict === v} onClick={() => void selfReview(v)}>{label}{attempt.selfVerdict === v ? ' ✓' : ''}</button>)}</div></>
        : reflection && <p className="learning-muted">选项或数值已核验。文字推理已保存，尚未进行语义评分。</p>}
      <div className="learning-actions"><button onClick={() => onCoach(attempt.explanation, true)}>请小格朗读解析</button><button onClick={() => onEvidence?.(a.concept)}>查看学习证据</button><button disabled={busy || scheduled} onClick={() => void schedule()}>{scheduled ? '已加入日历复测待办' : '安排明天复测'}</button></div>
    </section>}
    {children}
  </section>;
}
