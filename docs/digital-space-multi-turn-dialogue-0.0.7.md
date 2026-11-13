# Digital Space Multi-Turn Learning Dialogue · 0.0.7

October 7, 2026. Continues the material citation and learning loop of 0.0.6, adding role dialogue that can respond continuously.

## How to Use

1. Open your own material and select a chapter or page segment in the Learning Studio.
2. Enter the role space and type a topic and an opening explanation of at least 10 characters.
3. Click "Let the role ask a follow-up"; after responding to the question, click "Respond and continue", or press Ctrl+Enter.
4. Choose a follow-up style that fits the role and view the verbatim-matching original-text citations.
5. Click "Generate feedback for the whole dialogue" and view your own original words, the judgments and the next-step suggestions dimension by dimension.

Each segment has at most 12 turns; the learner's explanations and supplements total at most 12,000 characters. Each supplement is at most 5,000 characters. Directly submitting one explanation to generate six-dimensional feedback is still supported.

| Space | Optional follow-up styles |
| --- | --- |
| Peer practice partner | Clarify ideas together, switch to a life example |
| Teacher guidance | Check reasoning, check applicable conditions |
| Student audience | Simple explanation, teach by example |
| Examiner follow-up | Boundaries and counterexamples, change the scenario |
| Research partner | Testable predictions, change the hypothesis |

## Original Text and Scoring Basis

A material snapshot is fixed at the start of the session. Opening other files later does not silently change the citations for this segment; you can return to this round's material, or start a new round with new material.

The `referenceEvidence` given by the model must appear verbatim in the snapshot text; otherwise the citation is deleted and it is shown that there is not yet matching evidence. After a match, it can be highlighted and located in the source panel. Verbatim-match verification checks the citation source, not the correctness of the model's judgment.

The scoring main process re-extracts the learner's statements from the saved session, overriding the topic, role, explanation and reference passed in by the renderer. Role responses serve only as context and cannot serve as the learner's own evidence. Dimensions without the learner's original words remain unscored. AI scores do not increase the number of independent passes.

The report saves the complete dialogue and citation snapshot at generation time; later dialogue cannot rewrite earlier reports. Markdown export attaches the whole learner explanation, source, dialogue snapshot and six-dimensional feedback.

## Saving, Restoration and Retry

`companions.db` adds the `room_sessions` and `room_drafts` tables, without deleting existing reports. Dialogues are saved by vault, and drafts are distinguished by vault, role and material snapshot. Each role retains drafts for the most recent 30 sources, and session history shows the most recent 20 segments.

Drafts are saved automatically after input; the interface shows the save status and provides retry on failure. The opening explanation, unsent answers, improvement focus and session citations are restored after the program restarts, preserving blank lines and line breaks.

Requests use an independent submission identifier. The learner's answer is first written to disk, then the model is awaited; after a quota failure, stop or restart interruption, the answer is retained and the same identifier is retried. Re-submitting a completed request does not append again and does not call the model again. Modifying the content of the same identifier is rejected. Interrupted requests return to a retryable state.

## Interface

Role cards display their respective tasks. The space contains material, role status and continuous dialogue; chat bubbles are distinguished by speaker and show the follow-up turn count. Thinking, listening and reading states follow actual requests, recording and playback states. New animations respect the system's reduced-motion setting and support light/dark themes and compact windows.

## Engineering Verification

| Check | Result |
| --- | --- |
| Learning, material, question bank, six-dimensional and session-protocol tests | 54 / 54 |
| Multi-turn dialogue, full restart, citation location, export, role isolation and layout | 13 / 13 |
| Material, experiment, targeted task and re-explanation regression | 15 / 15 |
| Learning flow, redo, calendar and real export of three document formats | 27 / 27 |

Type checking and renderer build passed. Tests use real Electron, preload, document reading and SQLite; AI and cloud voice use isolated test doubles and do not consume service balance. These checks do not represent actual model scoring accuracy or student learning outcomes. There is still no real student trial or teacher scoring-calibration data.

```powershell
node --test apps/desktop/room-dialogue.test.mjs apps/desktop/learning.test.mjs apps/desktop/study-material.test.mjs apps/desktop/bank-import.test.mjs apps/desktop/companions.test.mjs
node apps/desktop/verify-room-dialogue.mjs
node apps/desktop/verify-study-material.mjs
node apps/desktop/verify-learning.mjs
```

What is worth verifying next is the per-dimension scoring agreement between teachers and AI, whether follow-ups repeat or over-hint, and understanding transfer after delayed retests.
