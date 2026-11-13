# Gezhi 0.0.2: Learning Studio

2026-10-02. Implemented five features per user authorization, reusing the existing Electron, question bank, digital human, calendar and export modules. Historical memories and attachments served as background material; attachment content was not treated as new execution instructions.

## Entry Points

After opening a vault, click the cube icon "Learning Studio" on the left, or the Learning Studio entry on the home page. "Record confidence practice" on a question-bank card opens the corresponding question directly; the "Learning Evidence Map" button in the original relationship graph opens the evidence view. The five features are switched at the top of the Studio.

| Feature | Implemented behavior |
| --- | --- |
| Confidence recording | Before the answer is revealed, one must choose guess, roughly, or certain; records the original answer, source, time, hints and reference-answer preview; multiple-choice and parseable single numeric answers are automatically verified |
| Error Detective | Finds the earliest erroneous step in the derivation, chooses a correction, and writes the reason; passing requires both correct error location and correction; there are four original cases in mathematics, physics, probability and chemistry |
| Learning Evidence Map | Displays states such as suspected misconception, needs practice, awaiting retest, along with the basis for judgment, by knowledge point; supports search, filtering, zoom, pan, node dragging, keyboard selection, related notes and targeted practice |
| Transfer Challenge | Three paths: functions, forces, and independent events, three levels each; from basic application to condition changes to everyday situations; the main process also checks that the previous level was passed |
| Concept experiment bench | Three interactive experiments: function graphs, force and motion, and probability sampling; after adjusting parameters the current round's conditions are fixed, and the user writes a prediction, confidence and rationale before verifying; saves observations and explanations |

The digital human can read explanations and study suggestions aloud, and responds to follow-up questions through the original AI channel. AI follow-up requires the user's existing AI configuration, and reading aloud uses the existing cloud or system voice capability. Saving learning records, objective verification and the experiment models themselves do not depend on cloud AI.

## Data and Evidence Rules

- The built-in catalog contains 16 original exercises: 3 ordinary exercises, 4 Error Detective, and 9 Transfer Challenge. All are labeled "Gezhi original learning exercise · not an actual exam question"; original exercises are not packaged as actual exam questions, and no e-books were added.
- The Studio integrates the current vault's existing question bank, loading the most recent 500 questions by default. Earlier questions can be opened directly from question-bank cards. Questions without a filled-in source are explicitly marked as source not filled in.
- Only explicit single-choice answers and parseable numeric / fraction answers are automatically verified. Multiple-choice answer lists, proofs, text answers and unparseable answers go to self-assessment; self-assessment does not become an automatic verification pass.
- Entering practice after viewing the answer on the current question-bank page records reference help. Correct answers that used hints or reference help do not count as "independent passes". This record does not detect what materials the user viewed outside the software.
- Text reasoning, correction reasons and observations are all saved, but automatic semantic scoring of text reasoning is not implemented. Choosing the right option does not mean the full argument has been verified; the feedback states this.
- "Suspected misconception" means the most recent objective verification was wrong and confidence was certain; "recent independent pass" only means there was a recent objective pass with no hints and no reference help, and does not claim comprehensive mastery.
- If the most recent independent pass is more than 24 hours old, a retest is suggested. "Delayed retest evidence" requires independent passes on different questions at least 24 hours apart. Repeated correct answers to the same question do not constitute delayed retest evidence.
- Transfer Challenge allows hints to unlock the next level, but the independent transfer level in the Evidence Map uses only no-hint pass records.
- An answer to a question-bank question is assigned to its first knowledge-point tag; other tags can produce co-occurrence associations, and passing one question is not automatically expanded into passing all tags.
- Solid arrows are explicitly designed pedagogical prerequisite relations; dashed lines are pedagogical associations or question-tag co-occurrences. File links are still shown by the original note relationship graph.
- Supports scheduling a retest to-do for a knowledge point for tomorrow. Repeated scheduling reuses the existing incomplete to-do, preserving fixed classes in the calendar.

Records are stored in `learning.db` in the software's local user data directory, separated by the vault's real path. The new database is independent of the existing `bank.db`, `calendar.db` and note files. Each answer retains a snapshot of the question, answer and explanation; deleting or modifying the original question-bank question does not erase past learning evidence.

The map displays at most 80 filtered nodes at a time; related-note queries are capped at the original search module's 1,500 nodes. Each knowledge point shows the most recent 8 pieces of evidence, and the Studio exports the most recent 120 records with an explicit note about the count. Cumulative statistics use all stored records; history is not deleted because of display limits.

## Experiment Models

The function model is `y = a(x-h)²+k`, supporting opening direction, translation and degeneracy to a constant function when `a=0`; graphs that exceed the display range are clipped. The force experiment is a simplified model of a constant horizontal force starting from rest, with `g=9.8 m/s²`, identical static and kinetic friction coefficients, and air resistance ignored; when the pulling force is insufficient to overcome static friction, acceleration is zero. Under default parameters the acceleration is `4.02 m/s²`, and the displacement after 3 seconds is `18.09 m`.

The probability experiment counts, for each group of `n` independent trials, how many groups have at least one success; the theoretical probability is `1-(1-p)^n`, with at most 10,000 groups sampled per round. Seeded pseudo-random sampling is used for reproducibility; sampling frequencies fluctuate. The main process and interface share the model functions, and all parameters have boundary checks. When the system has reduced motion enabled, the force experiment shows the final state directly.

## Verification and Release

The startup error came from a duplicate variable declaration inside the numeric conversion function and has been fixed. The installer build flow adds `node --check` for all main-process CJS modules and shared model MJS; the build stops on syntax failure.

```powershell
node --test apps/desktop/learning.test.mjs
node apps/desktop/node_modules/typescript/bin/tsc --noEmit -p apps/desktop/tsconfig.json
npm --prefix apps/desktop run build:renderer
node apps/desktop/verify-learning.mjs
node apps/desktop/verify-workbench.mjs
node scripts/build-installer.mjs
$env:GEZHI_TEST_EXE = Join-Path (Get-Location) 'dist/installer/win-unpacked/格致.exe'
node apps/desktop/verify-learning.mjs
```

Verification uses isolated vaults and user data directories and does not write to real learning materials. AI replies and cloud TTS use test doubles in interactive verification; lip-sync, audio playback, preload, SQLite, actual experiment formulas and document export go through the real software implementation. These checks do not mean that external accounts, real AI reply quality or actual cloud voice service availability have been verified.

There are 19 unit tests in total, covering confidence constraints, duplicate submission, source snapshots, reference help, error location and correction, level-by-level unlocking, conservative verification, cross-vault isolation, delayed evidence and experiment boundaries. The Learning Studio integration check has 26 items, plus 33 existing interface regression checks, including a 1,500-node stress graph. Proactively stopping read-aloud cleans up playback state, and asynchronous callbacks after cancellation do not show player errors or resume old audio. Final check results and the installer manifest are in `产出/learning-studio/release-manifest.json`; the integration report and screenshots are in `verification.json` and `packaged/verification.json` in the same directory.

The installer for this iteration is `dist/installer/格致-0.0.2-安装包.exe`. Upgrades use existing user data; the original 0.0.1 installer is retained. Nothing was committed or pushed to Git, and no software the user is currently using was installed or overwritten.
