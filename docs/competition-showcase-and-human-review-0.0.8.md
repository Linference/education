# Competition Showcase and Six-Dimensional Human Review · 0.0.8

2026-10-07. Based on the scanned charter of the "2026 Global Youth AI Future Innovation Competition (Macau Secondary School Division)" provided by the user, six pages in total. The complete file has been re-read; the feature priorities in this document are engineering judgments and do not represent organizer endorsement or a scoring commitment.

## Requirements and This Round's Implementation

| Charter basis | Reinforcement this round |
| --- | --- |
| Section 8: AI technology use 25%, appropriate methods and students able to explain clearly | English AI method page, explaining step by step the material snapshot, role prompts, multi-turn dialogue, learner-statement scoring, citation verification and model limitations |
| Section 8: prototype, testing and outcomes 20%, prototype operable, testing reasonable and evidence-based | Human per-dimension scoring and reasons, comparison statistics and real-record export; stays unavailable when there is no human data |
| Sections 6 and 9: English materials, introduction and defense | Independent English showcase interface, English sample materials, English model-output settings; does not modify the everyday Chinese interface or translate the user's original text |
| Section 9: network services must have offline film, screenshots or a backup demonstration | Bundled offline process demonstration, with a different question for each of the five roles; can auto-play or advance manually |
| Section 11: list AI tools, versions, purposes and the parts completed by students | AI-use disclosure form; missing versions and student work remain blank, and exports show INCOMPLETE |
| Sections 8 and 11: ethics, real data and privacy | Offline demonstration does not write scores; demo materials are isolated from the real vault; aggregate export excludes review aliases, full explanation text and full original-text text |

The charter requires the work description to connect with the SDGs; this round's showcase positions the goal as SDG 4 (Quality Education). This is the work's intended value, not yet a verified educational outcome.

## Entry and Showcase

Click the trophy button "Competition English Showcase" on the left. The English full-screen showcase contains Demonstration, AI method, Evaluation evidence, and AI disclosure.

Offline mode provides the five steps Source → Explain → Question → Refine → Inspect. The content is pre-written examples, and the interface continuously marks PREPARED EXAMPLE; it is not called real-time generation, does not show fabricated AI scores, and does not produce AI evaluation records. Auto-play advances one step every 3.2 seconds and supports pause, role switching and the system's reduced-motion setting.

Online mode can reuse the current material or open the isolated English vault. The topic is editable; after the session starts, the topic, citation snapshot, role and output language are fixed. Scoring uses only the learner statements saved by the main process. If English model output contains untranslated Chinese explanations, it is rejected; the learner's and original text's verbatim quotations retain their original language.

The isolated English vault is created in `presentation-v1` under the application data directory. Sample files are created only once, and later user modifications are retained; original vault files are not overwritten. Before opening, it checks whether the original document has unsaved modifications. On exit, it returns to the previous vault and original active file; demo dialogues and reviews do not enter the original vault. When there is no original vault, the demo vault remains the current vault.

## Human Review

Each piece of six-dimensional feedback gains a review entry point, and saved reports can also be selected in Evaluation evidence. AI numbers are hidden by default so the filler can judge independently, but this is not equivalent to a double-blind trial in research.

- Can declare teacher, peer or self; the software does not verify identity.
- A real name is not required; an anonymous ID can be filled in.
- Scores are 0–4 or not observed; every non-empty score must have a reason.
- The main process looks up the original report in the current vault and recalculates the AI score and difference; it does not accept differences fabricated by the frontend.
- Each save retains the audit time and a unique submission identifier; retrying the same submission does not produce duplicate records.

Statistics show, within the most recent 200-review window, the latest review round's comparable dimensions for each report. Dimensions without an AI score or a human score are excluded. The number of exactly identical scores divided by the number of comparable dimensions gives the agreement rate; the mean absolute difference is `sum(abs(human - AI)) / n`. When `n=0`, Not available is shown. The sample unit is the report, not the individual student; the agreement rate does not represent learning improvement, and does not mean teacher calibration has been completed.

## Disclosure and English Evidence

The AI tool table is filled in by the team with the real names, versions or model identifiers, purposes, and the parts actually completed by students. The initial tool names and purposes are provided for verification; versions and student division of labor are not filled in on their behalf. New records are saved by vault. Unknown information is left blank, and aggregate exports are marked INCOMPLETE.

Export English evidence exports the record counts from real queries, review statistics, audit IDs, source snapshot IDs, AI methods, limitations and saved disclosures, in Markdown and PDF. Disclosures containing Chinese must first be changed to English. The export does not include the full learner explanation text, full original-text text, review anonymous IDs or the reason bodies; disclosures filled in freely should still be checked by the team for personal information. This file is a draft evidence attachment and does not replace the required work introduction, research report, poster and demo film.

## Verification

| Check | Result |
| --- | --- |
| Original learning logic, multi-turn protocol, human review, English output and parameter-extraction constraints | 64 / 64 |
| English showcase, isolated vault, model channel, review, real MD/PDF export, narrow-window navigation and exit restoration | 11 / 11 |
| Original Digital Space, restart restoration, citation and real Markdown export | 13 / 13 |
| Material, experiment and feedback linkage regression | 15 / 15 |
| Workspace, theme, document, graph and 1,500-node stress regression | 31 / 31 |

Type checking and production build passed. Engineering tests use an independent application data directory, and models and voice are test doubles, so account quota is not consumed. Real Electron, preload, SQLite, document parsing, image drawing and export participate in the checks. There is no real student trial data, and no learning improvement was fabricated from it.

English material extraction also fixed the issue where the sentence-ending periods in `μ=0.` and `n=2.` caused parameters to be missed, and rejects truncating multiple decimal points or unsupported exponent notation into another value. The frictionless parameter in the English example is therefore consistent with the 5 m/s² calculation.

The team still needs to complete disclosure of actual tool versions and division of labor, actual teacher review and consented real trials, and truthfully distinguish engineering verification from student learning outcomes in the report. The existing research report, poster and film need to be synchronized with the final software version.
