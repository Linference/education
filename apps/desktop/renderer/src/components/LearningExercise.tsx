import { useEffect, useRef, useState } from 'react';
import type { LearningActivity, LearningAttempt } from '../lib/learning-types';
import { CONFIDENCE, supportLabel } from '../lib/learning-types';

interface Props {
  activity: LearningActivity; vault: string;
  priorExposure?: boolean;
  onRecorded: () => void; onCoach: (text: string, read?: boolean) => void;
  onResult?: (attempt: LearningAttempt) => void; onEvidence?: (concept: string) => void;
  children?: React.ReactNode;
  revealFeedback?: boolean;
}
const drafts = new Map<string, { response: string; correction: string; reflection: string; confidence: number; hint: boolean; attempt: LearningAttempt | null; submission: string; previewed: boolean }>();
export default function LearningExercise({ activity: a, vault, priorExposure = false, onRecorded, onCoach, onResult, onEvidence, children, revealFeedback = true }: Props) {
  const key = vault+'\0'+a.id, draft = drafts.get(key);
  const [response, setResponse] = useState(draft?.response || '');
  const [correction, setCorrection] = useState(draft?.correction || '');
  const [reflection, setReflection] = useState(draft?.reflection || '');
  const [confidence, setConfidence] = useState(draft?.confidence || 0);
  const [hint, setHint] = useState(draft?.hint || false);
  const [previewed,setPreviewed]=useState(draft?.previewed || false);
  const assisted=priorExposure||previewed;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState<LearningAttempt | null>(draft?.attempt || null);
  const [scheduled, setScheduled] = useState(false);
  const submission = useRef(draft?.submission || crypto.randomUUID());
  useEffect(() => { drafts.set(key,{response,correction,reflection,confidence,hint,attempt,submission:submission.current,previewed}); if (drafts.size>300) drafts.delete(drafts.keys().next().value!); }, [key,response,correction,reflection,confidence,hint,attempt,previewed]);
  const saving = useRef(false);
  const needsReflection = ['detective', 'transfer', 'lab'].includes(a.mode);
  const canSubmit = Boolean(response.trim() && confidence && (!needsReflection || reflection.trim()) && (!a.correctionOptions || correction));
  const submit = async () => {
    if (saving.current || !canSubmit || attempt) return;
    saving.current = true; setBusy(true); setError('');
    try {
      const r = await window.gezhi.learning.submit({ vault, activityId: a.id, submissionId: submission.current,
        response, correction, confidence, usedHint: hint, previewedAnswer: assisted, reflection });
      if (!r.ok || !r.attempt) throw new Error(r.error || 'Could not save');
      setAttempt(r.attempt); onResult?.(r.attempt); onRecorded();
      onCoach(!revealFeedback ? 'Prediction recorded. Run the experiment now, then compare your prediction with the actual result.' : (r.attempt.correct === null ? 'Check your reasoning against the reference answer.' : r.attempt.correct ? 'This check passed.' : 'This check did not pass yet.') + r.attempt.explanation);
    } catch (e) { setError(String((e as Error).message)); }
    finally { saving.current = false; setBusy(false); }
  };
  const selfReview = async (verdict: string) => {
    if (!attempt || busy) return; setBusy(true); setError('');
    try { const r = await window.gezhi.learning.annotate({ vault, id: attempt.id, selfVerdict: verdict }); if (!r.ok || !r.attempt) throw new Error(r.error || 'Could not save the self-review'); setAttempt(r.attempt); onRecorded(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const schedule = async () => {
    setBusy(true); setError('');
    try { const r = await window.gezhi.learning.schedule({ vault, concept: a.concept }); if (!r.ok) throw new Error(r.error || 'Could not schedule'); setScheduled(true); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <section className="learning-exercise" data-testid="learning-exercise" data-activity-id={a.id}>
    <div className="learning-eyebrow">{a.concept}{a.level ? ' · Level ' + a.level + ' / ' + a.levelLabel : ''}</div>
    <h2>{a.title}</h2>
    <p className="learning-source">{a.source}</p>
    <p className="learning-prompt">{a.prompt}</p>
    {assisted && <div className="learning-callout">{previewed?'You have already seen the feedback for this question. This retry is recorded as practice done with reference help.':'You viewed the reference answer in the Question Bank. This round counts as practice done with reference help.'}</div>}
    {a.mode === 'detective' && a.correctionOptions && <div className="learning-callout">This is an Error Detective challenge. One of the steps below contains a known error: find the earliest mistake, then choose the correction.</div>}
    {a.grading === 'self' && <div className="learning-callout">Open inquiry · Self-assess against the source after submitting. A written answer does not count as verifiable independent evidence.</div>}
    <fieldset disabled={busy || Boolean(attempt)} className="learning-answer-fields">
      <legend>{a.mode === 'detective' && a.correctionOptions ? 'First find the step with the error' : a.options.length ? 'Choose your answer' : 'Write your answer'}</legend>
      {a.options.length > 0 ? <div className="learning-options">{a.options.map(o => <label key={o.label} className={'learning-option' + (response === o.label ? ' selected' : '')}>
        <input type="radio" name={'answer-' + a.id} value={o.label} checked={response === o.label} onChange={() => setResponse(o.label)} />
        <span className="option-letter">{o.label}</span><span>{o.text}</span>
      </label>)}</div> : a.grading === 'numeric' ? <input className="learning-number" aria-label="Predicted or calculated value" inputMode="decimal" value={response} onChange={e => setResponse(e.target.value)} placeholder="Enter a number or fraction" />
        : <textarea aria-label="Your answer" rows={4} value={response} onChange={e => setResponse(e.target.value)} placeholder="Write your answer and working, then check the reference answer after submitting." />}
      {a.correctionOptions && <><legend className="learning-sublegend">Now choose the correction</legend><div className="learning-options">{a.correctionOptions.map((text, i) => {
        const label = String.fromCharCode(65 + i); return <label key={label} className={'learning-option' + (correction === label ? ' selected' : '')}>
          <input type="radio" name={'correction-' + a.id} checked={correction === label} onChange={() => setCorrection(label)} /><span className="option-letter">{label}</span><span>{text}</span></label>;
      })}</div></>}
      <label className="learning-reflection">{a.mode === 'detective' ? 'Why is it wrong? What is the basis for the correction?' : a.mode === 'lab' ? 'Your prediction basis' : 'Record your reasoning' }{needsReflection ? ' (required)' : ' (optional)'}
        <textarea aria-label="Reasoning or prediction basis" rows={3} maxLength={6000} value={reflection} onChange={e => setReflection(e.target.value)} placeholder="Write down the conditions, relations, or counterexamples you used." />
      </label>
      <legend className="learning-sublegend">How confident are you before the answer is revealed?</legend>
      <div className="confidence-picker" role="radiogroup" aria-label="Answer confidence">{[1, 2, 3].map(n => <button key={n} type="button" role="radio" aria-label={CONFIDENCE[n]} aria-checked={confidence === n} className={confidence === n ? 'selected' : ''} onClick={() => setConfidence(n)}><span aria-hidden="true">{['', '○', '◐', '●'][n]}</span>{CONFIDENCE[n]}</button>)}</div>
      <div className="learning-submit-row"><button type="button" className="learning-primary" disabled={!canSubmit} onClick={() => void submit()}>{busy ? 'Saving…' : a.mode === 'lab' ? 'Submit prediction and verify' : 'Submit answer and record'}</button>
        <button type="button" onClick={() => { setHint(true); onCoach(a.hint); }}>Give me a hint</button><small>Using a hint is recorded honestly</small></div>
    </fieldset>
    {hint && <div className="learning-callout" role="note">Xiaoge's hint: {a.hint}</div>}
    {error && <div className="learning-error" role="alert">{error}</div>}
    {attempt && !revealFeedback && <p className="learning-callout" role="status">Prediction locked. Complete the experiment above; the numerical check appears afterwards.</p>}
    {attempt && revealFeedback && <section className={'learning-feedback ' + (attempt.correct === null ? 'unverified' : attempt.correct ? 'correct' : 'incorrect')} data-testid="learning-feedback">
      <div className="learning-feedback-heading"><strong>{attempt.correct === null ? 'Recorded · awaiting check' : attempt.correct ? 'Check passed' : 'Needs another check'}</strong><span>Confidence: {CONFIDENCE[attempt.confidence]} · {supportLabel(attempt)}</span></div>
      <p><b>Reference answer:</b> {attempt.answer || 'The Question Bank has no reference answer for this question; consult the original material.'}</p>
      <p>{attempt.explanation}</p>
      {attempt.correct === false && attempt.confidence === 3 && <div className="learning-callout">You were confident in this answer, but the check did not pass. Next time, check the conditions under which this judgement applies first.</div>}
      {attempt.grading === 'self' ? <><p className="learning-muted">This question is self-assessed. The self-assessment is kept, but it does not count as verifiable evidence of independent mastery.</p><div className="learning-actions">{[['correct', 'Checked: correct'], ['partial', 'Partly correct'], ['incorrect', 'Needs redoing']].map(([v, label]) => <button key={v} disabled={busy} aria-pressed={attempt.selfVerdict === v} onClick={() => void selfReview(v)}>{label}{attempt.selfVerdict === v ? ' ✓' : ''}</button>)}</div></>
        : reflection && <p className="learning-muted">The option or number is verified. Your written reasoning is saved but not yet scored semantically.</p>}
      <div className="learning-actions"><button onClick={() => onCoach(attempt.explanation, true)}>Ask Xiaoge to read the explanation</button><button onClick={() => onEvidence?.(a.concept)}>View learning evidence</button><button disabled={busy || scheduled} onClick={() => void schedule()}>{scheduled ? 'Retest added to the calendar' : 'Schedule a retest for tomorrow'}</button></div>
      {a.mode!=='lab'&&<button disabled={busy} onClick={()=>{submission.current=crypto.randomUUID();setPreviewed(true);setAttempt(null);setResponse('');setCorrection('');setReflection('');setConfidence(0);setHint(false);setScheduled(false);setError('');}}>Answer again</button>}
    </section>}
    {children}
  </section>;
}
