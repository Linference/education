# The Development History of Gezhi

> From a local material-management tool to an AI Learning Studio centered on explanation, follow-up questioning and traceable feedback.

Updated: October 6, 2026. Current version: 0.0.5.

This document is compiled from Git commits, implementation documents and version verification records. The engineering history of October 1–2, 2026 is preserved in the original 23 commits; subsequent versions are iterations on top of that work. Historical commits have not been squashed, deleted or rewritten.

## Starting Point: First Make One's Own Materials the Foundation of Learning

Gezhi takes its name from "investigate things to extend knowledge" (格物致知). The project initially aimed to solve the problems of scattered materials, inconsistent file formats, and a lack of connections between notes and knowledge points: students can manage textbooks and notes in an ordinary folder, read, edit and search in the same workspace, and let AI refer to their own materials.

This stage established the local-first direction: notes remain ordinary files, while the index and learning databases are kept in the local user data directory; AI is integrated through DeepSeek Harness. External AI and cloud voice still require accounts, a network and the corresponding service configuration.

## October 1, 2026: Engineering Foundation and Desktop Workspace

The first commit [f0d49bf](https://github.com/Linference/education/commit/f0d49bf) established the database, the vault CLI, the AI bridge and the dependency-license check, and preserved six technical research documents and the Chinese input-method verification.

Several capabilities that directly affect actual use were then completed:

- **Chinese editing and retrieval.** Verified the conflict between IME composition input and autocomplete; established SQLite FTS5 retrieval and handled Chinese tokenization and two-character-word recall issues.
- **Desktop software and documents.** Built the Electron desktop shell, file tree, tabs and Markdown editor, and integrated viewing of PDF, Word, spreadsheets and presentation documents.
- **Export.** Got Chinese Typst typesetting and Markdown-to-PDF/Word flows working.
- **AI and voice.** Added the AI assistant, conversation persistence, and Tencent Cloud speech synthesis and recognition; credentials are supplied through environment variables or encrypted storage.
- **The first explanation experience.** Added the Feynman explanation desk so students try to explain knowledge in their own words, rather than only reading AI answers.

Representative commits from this stage include [4950e7b](https://github.com/Linference/education/commit/4950e7b) (desktop shell and installer), [c204f3b](https://github.com/Linference/education/commit/c204f3b) (document workspace and AI assistant), [e0ca38c](https://github.com/Linference/education/commit/e0ca38c) (retrieval and backlinks), and [8ee1c94](https://github.com/Linference/education/commit/8ee1c94) (Feynman explanation desk).

## October 2, 2026: Knowledge Connections and Learning Tools

The project further added settings, a relationship graph, question-bank paper generation, and exam-paper export. The graph went beyond a folder list to show links between notes; the question bank began connecting materials with practice. The related commits are [d94bd23](https://github.com/Linference/education/commit/d94bd23) and [cbf4023](https://github.com/Linference/education/commit/cbf4023).

The interface then received a unified design: the workbench, question bank, calendar, light/dark themes and brand assets gradually adopted consistent spacing, colors and interactions. The relationship graph adopted Canvas rendering and a background layout Worker, adding zoom, dragging, local neighborhoods, search and grouped filtering.

That day's [8542888](https://github.com/Linference/education/commit/8542888) saved the optimization backlog, which became the handover point for subsequent iterations. See the [UI upgrade notes](ui-v2-design-and-validation.md) for implementation and verification.

## 0.0.2: From "Providing Tools" to "Testing Understanding"

The Learning Studio organizes the learning process into five kinds of activities:

| Feature | Problem it solves |
| --- | --- |
| Confidence recording | Record certainty before the answer is revealed, so "very sure but wrong" can be traced back. |
| Error Detective | Locate the erroneous step, fix the conditions and reasoning, and test with counterexamples. |
| Learning Evidence Map | Explain the current state using answers, help usage, delayed retests and transfer records. |
| Transfer Challenge | Change the conditions or scenario to test whether the same knowledge can still be used. |
| Concept experiment | Predict, manipulate, observe and explain in function, force and probability models. |

This step shifted Gezhi's focus toward the learning process. Getting one answer right, repeating an answer, and passing after using a hint have different meanings; the records preserve these distinctions and do not treat a single success as comprehensive mastery.

Development also fixed a startup error caused by a duplicate variable declaration in the numeric parsing function, and added syntax checks for all main-process and shared modules to the build flow. See [Learning Studio implementation and validation](learning-studio-implementation-and-validation.md).

## October 6, 2026 · 0.0.3: Digital Space and Six-Dimensional Feedback

Building on the existing explanation flow, the project added five role spaces: peer practice partner, teacher guidance, student audience, examiner follow-up, and research partner. Different roles use different follow-up strategies, focusing respectively on vague expression, applicable conditions, terminology explanation, boundary counterexamples, and testable hypotheses.

Students can type or record an explanation, choose the current material as a reference, and receive six-dimensional formative feedback: **conceptual accuracy, completeness of conditions, coherence of reasoning, clarity of expression, ability to give examples, and transfer application**.

Each scorable dimension includes the original words of the explanation, the reason for the judgment, and a next-step suggestion. The software checks score ranges, dimension completeness, and whether citations appear in the explanation; dimensions with no observable evidence are shown as "not demonstrated" rather than filled in as zero. Explanation history is saved by vault and role, and explanations can be repeated and feedback exported.

The version also added a bundled DeepSeek Harness installer and first-connection guidance, and fixed question-bank import, vault switching and document export:

- Before import, question stems, answers, explanations and options can be previewed and modified, with duplicate-question checking.
- Switching vaults does not carry over questions from other vaults; built-in examples are shown through an explicit switch.
- Markdown export uses a separate temporary directory and supports image paths with spaces or parentheses, avoiding modification of user files.
- A really configured AI once completed an engineering demo call; when quota is insufficient or the return is incomplete, no substitute score is generated.

See [Multi-role learning space notes](multi-role-learning-space-0.0.3.md).

## October 6, 2026 · 0.0.4: Unified Entry Point, Motion and Formula Fixes

Digital Space became the main entry point for explanations, and the old standalone digital-human tab was removed. The learning guidance in practice retains text and voice functions, while the role space retains the five listeners.

Page switching, role cards, feedback expansion and radar charts gained short animations, and the system's reduced-motion setting is supported. Animations act on existing interface surfaces, avoiding rebuilding input boxes just to play animations.

PDF export fixed the problem of `Ax`, `By` and `AB` being treated by Typst as undefined variables, while protecting mathematical function names, English comments and large braces above and below. This stage recorded 46 conversion checks and actual PDF compilation of 9 categories of formulas. See [Digital Space and motion notes](digital-space-and-motion-0.0.4.md).

## October 6, 2026 · 0.0.5: The Six-Dimensional Window and Transparent Icons

After comparing three concepts in the brand exploration, "Six-Dimensional Window" was finally adopted: six outer components enclose an open space, and a diagonal path in the center echoes understanding and exploration.

The official mark was integrated into the software, programs, installer and shortcuts; the PNG and seven sizes of ICO retain a true transparent channel, and dark interfaces use an inverted mark. Verification directly extracted the icon resources of the Windows program and installer, confirming that the transparent background is still preserved after packaging. See [Brand record and generation prompts](../brand/identity-v3.md).

The promotional direction also focused on Digital Space: the [60-second English film plan](../submission/60-second-english-film-plan-20261006.md) was formed, and a 12-second, 60 fps music-free transition visual sample was produced, comparing spatial advancement, original-words matching and six-dimensional convergence. The sample uses a schematic interface and is a production-direction validation; the complete 60-second film has not yet been produced.

## October 7, 2026 · 0.0.6: Source-Driven Learning Loop

The Learning Studio added a source panel; Markdown / TXT, DOCX text extraction and PDF page segments all enter the same citation chain. After the user selects a chapter or an original-text excerpt, Digital Space, open inquiry and supported experiments use the current citation, and records retain the source location and snapshot.

Concept experiments match supported teaching models according to the chapter topic; when there is no match, they provide counterexamples and transfer tasks based on the original text. Experiments lock in a prediction before manipulation and verification; only after the run data is saved does it count as a verified experiment. Controlled experiments retain the previous round and change only one parameter, with the backend recalculating motion and sampling statistics.

Six-dimensional feedback can locate the original words, create targeted tasks, and explain again under the same material, role and topic. The Evidence Map separately displays objective answers and AI explanation reports; AI scores do not count toward independent passes. The workspace retains drafts, PDF page numbers and zoom, and Markdown reading/editing positions within the current session. See [0.0.6 implementation notes](source-driven-learning-loop-0.0.6.md).

## October 7, 2026 · 0.0.7: Digital Space Becomes a Multi-Turn Learning Dialogue

The five role spaces gained "opening explanation → role follow-up → learner supplement → continued follow-up". The peer focuses on clarifying ideas together, the teacher checks reasoning and conditions, the student audience asks for simple explanations and examples, the examiner challenges boundaries and transfer, and the research partner discusses testable predictions and hypotheses.

Each segment has at most 12 turns. Roles pose follow-ups based on the material snapshot fixed for the current turn; verbatim-matching original-text citations can be highlighted and located in the source panel. The six-dimensional feedback for the whole segment uses only the learner's explanations and supplements, and does not count content provided by roles as learner evidence. The report saves the dialogue snapshot at generation time; later discussion does not change old reports.

Drafts, unsent answers and multi-turn dialogues are saved locally and can be restored after fully closing and restarting the program. After a cloud quota error, a stop request or an interruption, the same turn can be retried without appending the learner's answer again. The interface adds role tasks, dialogue bubbles and a thinking state driven by real requests, and supports reduced motion. See [0.0.7 implementation and validation](digital-space-multi-turn-dialogue-0.0.7.md).

## October 7, 2026 · 0.0.8: Toward English Review and Verifiable Human Review

Based on the competition charter's requirements for AI technology use, prototype testing, English presentation and privacy, the software added an English review showcase entry point. Offline mode uses clearly labeled pre-written examples and does not call models or generate scoring records; online mode uses actual materials, student statements and the existing AI channel, fixes English output settings and preserves sources. The English demo vault is saved separately, and exiting the showcase returns to the original vault and original file.

Six-dimensional feedback gained human review, saving the self-declared reviewer role, anonymous ID, per-dimension scores and reasons. The main process computes differences from the original report, and the latest review round is used for per-report comparison statistics; unobserved dimensions do not participate in agreement rates, and repeated reviews do not expand the report sample size. Human opinions do not change the original AI report or independent-pass records.

The showcase entry point also provides technical explanation, SDG 4 positioning, actual record statistics, AI tool version and student-work disclosure, and English aggregate evidence export. Unknown information remains blank; engineering records and AI scores are not described as measured learning improvement. See [0.0.8 implementation and validation](competition-showcase-and-human-review-0.0.8.md).

## Current Stage and Next Steps

Gezhi has now formed a learning workspace of "one's own materials → independent practice or explanation → view evidence and suggestions → test again → save records". Digital Space's six-dimensional feedback and objective practice learning evidence are stored separately, and a single AI score is not directly treated as knowledge-point mastery.

Follow-up priorities include scanned question-bank OCR, more precise citation location, teacher scoring calibration, delayed review and whiteboard explanation. Candidate open-source projects and integration ideas are in the [GitHub optimization roadmap](github-optimization-roadmap-20261006.md).

There is currently no real student trial data. Completed engineering verification, model demonstrations and simulated tests can show whether functions run, but cannot replace real research on learning outcomes. The next stage should use teacher comparison scoring, actual learning tasks, delayed retests and transfer questions to test feedback quality and learning value.
