# Gezhi 0.0.3: Multi-Role Space and Release Notes

2026-10-06. Per the user's request, added a bundled DeepSeek Harness installer, first-launch login guidance, five digital-human spaces, six-dimensional explanation feedback, and continued fixes to question-bank import and Markdown-to-PDF.

## Installation and Login

The installer includes `resources/dsh/dsh-installer.exe`, preserving the original bytes and license of the complete DeepSeek Harness 0.2.0-rc.2 installer already present on this machine. The manifest is at `vendor/dsh/manifest.json`.

On first run, Gezhi displays connection guidance. If not installed, the bundled installation wizard can be launched; after installation, open the official DeepSeek Harness window to complete login or model configuration, then return to Gezhi. Gezhi does not collect account passwords on its behalf. The offline entry point retains local note and question-bank functions.

A runtime version check is not the same as account login verification; authentication, quota and service errors from actual model requests are shown truthfully. When insufficient balance is detected, no score is generated or saved, and no demo score is used to impersonate a service response.

## Five Digital-Human Spaces

| Role | Name | Responsibility |
|---|---|---|
| Peer practice partner | Xiaochuan | Discuss as equals, restate understanding, follow up on vague expressions |
| Teacher guidance | Teacher Lin | Check concepts, conditions and steps, explain the basis for corrections |
| Student audience | Xiaohe | Treat the user as the teacher, point out understanding obstacles caused by terminology and skipped steps |
| Examiner follow-up | Examiner Zhou | Test understanding with boundary conditions, counterexamples and oral-examination follow-ups |
| Research partner | Zhiyuan | Discuss hypotheses, design testable predictions and transfer scenarios |

Role definitions and scoring rubrics are in `apps/desktop/shared/companion-rubric.cjs`. Role cards enter their respective spaces, supporting typed explanations, segmented recording and transcription, referencing the currently open material, reading feedback aloud, explaining again, viewing history and exporting Markdown.

Role assets were generated with the built-in imagegen; the final project asset is `apps/desktop/renderer/src/assets/companion-roles-v1.png`. It is a five-column transparent atlas that the software displays by column; the original image is not cropped or modified. New role avatars use slight breathing and reading-state animations; dedicated multi-expression lip-sync atlases for each role have not yet been produced. Xiaoge's original six expressions and lip-sync functions are still retained.

Generation prompt: five distinct high-quality 3D editorial-illustration half-body digital humans, in order: an Asian teenage peer in a light-purple hoodie, an Asian female teacher wearing glasses and a dark-blue cardigan, an Asian teenage girl student in a teal school uniform, an Asian male examiner in a dark-gray coat, and a silver-haired research partner in a blue-gray lab coat. Equal-width horizontal arrangement, the same framing scale, transparent background, unified soft lighting and a graphite-gray/light-purple/teal color palette; no text, borders or logos. Tool: built-in imagegen.

## Six-Dimensional Feedback and Data Boundaries

The six dimensions are conceptual accuracy, completeness of conditions, coherence of reasoning, clarity of expression, ability to give examples, and transfer application. Rubric 0–4; when there is no observable evidence, return `null` and display "not demonstrated", not zero.

Each dimension includes the actual original words of the explanation, the basis for judgment, and a next-step suggestion. The main process validates the six dimension identifiers, score ranges, and whether citations exist verbatim in the explanation; scores with invalid evidence are not drawn in the chart. No score is saved when there is an incomplete response, timeout, cancellation or insufficient balance. Verbatim-excerpt verification is not semantic-correctness calibration; the rubric has not yet been empirically validated by teachers.

Reference text is at most 12,000 characters; topic at most 200 characters; explanation 10–12,000 characters. This path requires the AI not to call tools, and evaluation stops when a tool request is observed. It is not an OS-level guarantee of tool-free isolation.

Successful records are saved in `companions.db` in the user data directory, distinguished by the vault's real path and role. Records include topic, explanation, reference file name, six-dimensional feedback and follow-ups. Switching vaults does not write old results into the new vault.

## Question-Bank Import

Supports Markdown, TXT, JSON, DOCX and PDF with a text layer. After choosing a file, a preview is shown first; question stems, answers, explanations and options can be modified, misrecognized questions removed, and then the import confirmed. Skipping duplicate questions in the current vault is supported.

Supports ordinary numbered questions, bold fields, multi-line explanations, code fences, and questions that use headings as stems. Numeric zero in JSON is no longer lost. Layout parsing of Word/PDF still requires manual preview verification; scanned/image PDFs need OCR first, and there is currently no built-in OCR. Legacy DOC should be saved as DOCX first.

## PDF Export

Continues to use the built-in Typst typesetting, with compilation changed to asynchronous execution. Templates, temporary source and local images are all copied into a separate temporary directory, without overwriting or deleting same-named templates next to user notes. Supports relative, local image paths with spaces and parentheses, and parallel export.

Missing or network images display a placeholder explanation and return an explicit warning, rather than letting the entire file fail without notice. Network images must be saved locally first. The output path remains the user's choice; Markdown, PDF and Word remain separately selectable formats.

## Verification Record

Unit checks: `apps/desktop/companions.test.mjs`, `learning.test.mjs`, `bank-import.test.mjs`.

Actual Electron integration: `apps/desktop/verify-companion-rooms.mjs`, `verify-bank-export-regression.mjs`, `verify-learning.mjs`.

The default role integration check uses only AI response test doubles; the actual main process, preload, SQLite, interface, import parsing and export converters all run. `--live` separately uses the user's configured service to verify an original test explanation, without treating test-double records as real AI evidence.

The final results are those in the run records under `output/verification/companion-rooms/`, `output/verification/bank-export/` and `产出/learning-studio/verification.json`. The installer does not carry these test directories, user accounts, sessions or credentials.
