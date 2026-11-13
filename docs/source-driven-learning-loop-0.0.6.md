# Gezhi 0.0.6: Source-Driven Learning Loop

Date: 2026-10-07. Baseline: the original historical commit `df08355`; this iteration continues to append on the `codex/material-learning-loop` branch, without rewriting old commits.

## Materials Run Through the Current Learning Flow

The Learning Studio has a collapsible material panel with adjustable width. Markdown / TXT are split by headings and bounded text segments; DOCX extracts text; PDF reads the first 20 pages on first access, and can read up to 40 pages at a time by start-end page. The file limit is 32 MB and the text limit is 1,000,000 characters. Scanned PDFs still require OCR; Word / PDF formula objects, images and reading order may be lossy, and the interface clearly prompts to check the original text.

Each citation contains the file path, section, extracted-text line number or real PDF page number, and a content snapshot. The user can select a passage from the original text as the current learning citation. Unsaved Markdown drafts are marked as draft snapshots. Changes to content, position or draft state generate a new citation identifier, and history records retain the content as it was used at the time.

The Digital Space, learning guidance, open tasks, experiments, explanation reports and the Learning Evidence Map all reuse the current citation. The main process validates that files belong to the current vault; cross-vault citations cannot be resolved or used from another vault.

## The Actual Relationship Between Experiments and Source Text

Three implemented teaching models are matched by the current section's explicit topic / relation expression: quadratic functions, horizontal force and motion, and independent-event probability. Only parameters that are explicitly assigned and within the model's range are extracted; unrecognized parameters still use teaching defaults, and the interface clearly distinguishes them. Matching is a local rule and does not represent understanding or fully reproducing any original problem.

Content that does not match does not display a quadratic function by default. Counterexamples or transfer tasks based on the source text can be created. Built-in examples must be explicitly enabled by the user and are labeled as not current-material content.

The sequence is parameter selection, locking the prediction, operational verification, observation explanation, and controlled-variable comparison. Before the prediction, the function curve and the probability answer are hidden; the numeric check is revealed after the motion / sampling is completed. Observations cannot be saved without operating. The main process recomputes the motion or sampling data and does not trust displacement, success count or other results passed from the frontend.

Saved content includes parameters, numeric prediction, rationale, confidence, observation explanation and run data. Probability experiments save the starting seed so statistics are reproducible; each new experiment uses a new seed. Text explanations are only saved and are not yet semantically scored.

The comparison experiment keeps the previous round's parameters and allows changing only one selected parameter; the backend likewise verifies exactly one parameter changed, the same material and a completed previous round. Function curves can be overlaid. The motion ruler and slider coordinates use the same scale, and the two rounds share the scale for comparison. The applicable conditions of the simplified mechanical model are still displayed explicitly.

Records where the numeric prediction was correct but the experiment observation was not completed no longer count as verified experiment-pass evidence. Old experiments without run data are also not automatically backfilled as completed.

## Direct Action After Feedback

Each six-dimensional feedback item can locate the original words of the explanation, explain again around that item, or create a targeted task with a source-text citation. Open tasks come from explicit templates and the current source text, use self-assessment, and do not masquerade as real exam questions, automatic correct-answer verification, or independent passes.

Explaining again retains the role, topic and citation. Score changes between rounds are shown only for dimensions that have observable evidence in both rounds; unscored dimensions are not backfilled with points. AI requests do not receive old scores, and evaluation is not automatically raised because of a retry. The difference is an engineering record and has not yet been calibrated by teacher scoring.

Explanation reports are saved in the original role's record vault. The Evidence Map separately displays AI reports and verifiable answers; AI scores do not change independent-pass statistics. Material citations can be expanded, and can return to the original file or continue exploring. Markdown feedback export retains citation snapshots and comparison information, and the three kinds of learning-record export retain experiment data and citation positions.

## A Coherent Workspace

The Learning Studio is preserved when switching reading views; role spaces and experiments are preserved when switching features in the Studio. Role and practice drafts are saved separately by vault / role or question within the current app session. Focus mode collapses auxiliary guidance; the material panel can collapse and be resized horizontally, and small windows switch to a vertical layout.

PDF page and zoom, Markdown reading scroll, and editor cursor and scroll are preserved in the current session. Unsubmitted drafts are not yet persisted across app restarts, avoiding automatically writing temporary explanations into long-term records; submitted records are still saved across restarts via SQLite.

Submitted practice can create a new record via "Answer again". Redos that have already viewed feedback keep the reference-help mark and do not count as a new independent pass; experiments continue by starting a new round or a controlled-variable comparison.

## Verification and Real-Use Boundaries

Checks passed this iteration:

| Check | Result |
| --- | --- |
| Learning, material, question-bank import and six-dimensional specification logic tests | 41 / 41 |
| Original learning flow, redo, calendar and three kinds of real export | 27 / 27 |
| Real desktop flow linked with new materials | 15 / 15 |
| Reading, topics, graph and 1,500-node stress regression | 31 / 31 |
| Material-linked flow of the actual packaged program | 15 / 15 |

The graph regression script waits for an actual rendered frame before reading canvas pixels, avoiding computing test coordinates from a pre-redraw image. Source, type-check and dependency-license gates all pass.

Run `node --test apps/desktop/learning.test.mjs apps/desktop/study-material.test.mjs apps/desktop/bank-import.test.mjs apps/desktop/companions.test.mjs`.

Run `node apps/desktop/verify-learning.mjs` and `node apps/desktop/verify-study-material.mjs` to check real Electron / preload / document extraction / SQLite / image drawing / model data / export. Verification uses an isolated test vault; AI and cloud voice are test doubles, do not consume account balance, and cannot prove that model scoring is actually accurate.

Real student trials and teacher calibration have not been completed. The form below can be used to collect real feedback; test-double results must not be filled in as student learning outcomes.

| Task | Completed independently | Problems encountered | Completion time | Suggestions for revision |
| --- | --- | --- | --- | --- |
| Open your own material and select a passage | To be filled in by real trial | | | |
| Explain to a role and view feedback | To be filled in by real trial | | | |
| Complete an exploration task around a weak point | To be filled in by real trial | | | |
| Complete an experiment and single-variable comparison | To be filled in by real trial | | | |
| Explain again and consult the Evidence Map | To be filled in by real trial | | | |

Teacher review suggestions: check dimension by dimension whether the original words match the judgment, whether conditions are complete, whether evidence-lacking dimensions are left blank, and whether the next step can be executed. Record the disagreements between humans and AI, without presupposing an improvement margin.
