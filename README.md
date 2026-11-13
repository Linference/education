# Gezhi

**Current version: 0.0.8 · 7 October 2026**

Gezhi has grown from a local source-material management tool into an AI Learning Studio centred on explanation, follow-up questioning and traceable feedback.

## Development History

For the complete record, see **[Gezhi's Development History](docs/history.md)**. The original 23 Git commits are fully preserved, and later versions are appended on top of the original history.

| Stage | Main progress |
| --- | --- |
| 2026-10-01 | Engineering foundation, Chinese editing and retrieval, Electron desktop app, document viewing, AI assistant, voice and Feynman explanation. |
| 2026-10-02 | Settings, relationship graph, question-bank paper generation, workspace design and handover checklist. |
| 0.0.2 | Confidence recording, Error Detective, learning Evidence Map, Transfer Challenge and concept experiments. |
| 0.0.3 · 2026-10-06 | Five role spaces, six-dimensional explanation feedback, first-connection guidance, improved question-bank import and document export. |
| 0.0.4 · 2026-10-06 | Unified Digital Space entry and motion, fixed PDF export of formulas such as matrix products. |
| 0.0.5 · 2026-10-06 | Adopted the "Six-Dimensional Window" logo; app and installer icons use genuinely transparent backgrounds. |
| 0.0.6 · 2026-10-07 | Source material enters the learning flow by chapter / page segment; experiments link to the original text and control variables; six-dimensional feedback connects tasks, re-explanation and the Evidence Map; drafts and reading positions are retained. |
| 0.0.7 · 2026-10-07 | Digital Space adds multi-turn follow-up questioning and responses; whole-segment feedback evaluates only the learner's speech; original quotations can be highlighted and located; drafts, unsent answers and conversations are restored across restarts. |
| 0.0.8 · 2026-10-07 | English competition showcase, offline backup demonstration, real-time English AI dialogue, six-dimensional human review, AI usage disclosure and English evidence export. |

## Current Features and Notes

- Five audiences: classmate, teacher, student, examiner and research partner, using different follow-up questioning strategies.
- Multi-turn dialogue: at most 12 rounds per segment; depending on the role, it checks conditions, life transfer, boundary challenges or testable predictions; after a disconnection, answers are retained and retried.
- Six-dimensional feedback: accuracy, conditions, reasoning, expression, examples and transfer, with the original explanation words, the reason for the judgment and next-step suggestions; when evidence is insufficient, the unscored state is retained.
- Learning activities: confidence practice, Error Detective, Evidence Map, Transfer Challenge and function / force / probability experiments.
- Source-material workspace, full-text search, note graph, question-bank preview and import and paper generation, plus Markdown / PDF / Word export.
- Light and dark themes, reduced-motion setting and a transparent logo.
- The current source-material pane supports Markdown / TXT, DOCX text extraction and PDF page segments; after selecting a passage from the original text, an open inquiry task can be created.
- Experiment records include source snapshots, actual model run data and two rounds of comparison; a prediction is not counted as a passed experiment until the experiment has been completed.
- Six-dimensional weak items can create targeted tasks; re-explanation shows changes in scored dimensions under the same source material, topic and role; AI scores do not count toward independent passing.
- Digital Space drafts and conversations are saved locally by vault, role and source snapshot; original quotations can be highlighted and located after a verbatim match.
- The competition showcase entry provides an English-only interface, offline demonstrations of five roles and online AI; the isolated English vault returns to the original vault on exit.
- Six-dimensional human review records scoring reasons, and counts the agreement rate and mean absolute difference by report with duplicates removed; reviewer identity is self-declared and has not yet been calibrated.
- AI usage disclosure retains the real version, purpose and student work; aggregated evidence is exported as English MD / PDF, and unfilled fields are explicitly marked as incomplete.

Implementation documents: [Learning Studio](docs/learning-studio-implementation-and-validation.md) · [Digital Space](docs/multi-role-learning-space-0.0.3.md) · [Motion and formula fixes](docs/digital-space-and-motion-0.0.4.md) · [Brand record](brand/identity-v3.md).
Notes for this round: [Competition judging and human review 0.0.8](docs/competition-showcase-and-human-review-0.0.8.md); previous: [Multi-turn learning dialogue 0.0.7](docs/digital-space-multi-turn-dialogue-0.0.7.md), [Source-driven learning loop 0.0.6](docs/source-driven-learning-loop-0.0.6.md).

AI feedback is formative feedback; there is currently no real student trial data, and the scoring has not been calibrated by teachers. Scanned PDFs require OCR first; cloud AI and voice require the corresponding accounts and network access.

## Development and Build

Windows x64 and Node.js 24.x are recommended. Install the locked dependencies and build in the repository root:

```powershell
npm ci
npm --prefix apps/desktop ci
npm --prefix packages/voice ci
npm --prefix apps/desktop run build:renderer
& .\apps\desktop\node_modules\.bin\electron.cmd .\apps\desktop
```

The complete installer requires preparing the third-party programs according to the instructions for [Typst](vendor/typst/README.md), [LibreOffice](vendor/soffice/README.md) and [DeepSeek Harness](vendor/dsh/README.md), then running `node scripts/build-installer.mjs`. Output is located in `dist/installer/0.0.8/`.

Core validation: `node --test apps/desktop/learning.test.mjs apps/desktop/bank-import.test.mjs apps/desktop/companions.test.mjs`; formula validation: `node scripts/latex2typst.test.cjs` and `node scripts/verify-math-pdf.mjs`. Real-model tests require additional service configuration and may incur costs.

<details>
<summary>Initial engineering phase notes (retained as historical material)</summary>

> A local-first personal learning operating system — manage knowledge like Obsidian, edit documents like VSCode,
> let AI speak **standing on your own books**, able to generate exam papers, quiz you and plan for you.

The product name comes from "investigate things to extend knowledge".

---

## What Can Run Now

```bash
# Run all foundation checks (P0) with one command
node scripts/p0.mjs

# See how the "Documents" directory is resolved (the vault goes here by default)
node packages/db/src/cli.mjs where

# Create a vault
node packages/db/src/cli.mjs init grade-11-2 --subject English --grade "Grade 11"

# List all vaults
node packages/db/src/cli.mjs list

# Dependency license gate (blocks AGPL / non-commercial / production-use-prohibited, etc.)
node scripts/check-licenses.mjs
node scripts/check-licenses.test.mjs    # gate self-test: proves it really blocks

# Database schema assertions (including the Chinese dual FTS index)
node packages/db/src/assert-schema.mjs

# DSH bridge smoke test (real AI call + controlled modification of files in the vault)
node packages/dsh-bridge/smoke.mjs
```

> **No `npm install` required** — all code currently uses only Node built-in modules (including `node:sqlite`).
> This is deliberate: at the foundation stage, introducing no dependencies means there can be no supply-chain or licensing risk.

---

## Directory Structure

```
Gezhi/
├─ gezhi-development-plan.md  ← master plan: selection, architecture, data model, P0–P11, risk register
├─ docs/                     ← measurement documents (environment survey / DSH selection / storage / DSH integration)
│  └─ templates/             ← rerunnable probe scripts and DSH configuration samples
├─ research/                 ← six technical research reports (editor graph / document engine / textbook question bank / avatars / calendar)
├─ poc/ime/                  ← Chinese input method PoC (CodeMirror 6, automated tests 8/8 passing)
├─ packages/
│  ├─ db/                    ← SQLite schema and retrieval (node:sqlite + FTS5 dual index)
│  ├─ core/                  ← vault scaffolding and path resolution
│  └─ dsh-bridge/            ← DeepSeek Harness bridge: wraps dsh headless into an event stream
├─ apps/desktop/             ← Electron desktop app (from P1)
└─ scripts/                  ← P0 entry point and CI gates
```

---

## Four Non-Negotiable Principles

1. **Data lives on your computer** — a vault is just an ordinary folder; Markdown is the single source of truth and can be opened with other software at any time.
2. **AI must stand on evidence** — answering textbook questions must give "which book, which page"; if the source cannot be found, say so plainly; do not make things up.
3. **Operable and verifiable** — every stage can run, be demonstrated and be rolled back; no half-finished products that "look almost done".
4. **Don't rebuild engines** — the Agent kernel uses DeepSeek Harness, the document engine uses existing open-source components, and Gezhi only builds what is genuinely missing in the learning domain.

---

## Known Hard Constraints (All Measured — Don't Step on Them Again)

| Constraint | Explanation |
| --- | --- |
| **Chinese FTS must use trigram** | SQLite's default `unicode61` treats Chinese characters as token characters, and Chinese has no spaces → a whole sentence becomes one token, and **retrieval silently returns 0 results**. Solved with a dual index (trigram recall + jieba pre-tokenization ranking) |
| **Vault paths must not be hard-coded** | "Documents" may be redirected (on this machine it is on drive D). Use `app.getPath('documents')`, and read the registry under plain Node |
| **Indexes and caches go in `%APPDATA%`** | If the vault is in a sync directory such as OneDrive, SQLite in WAL mode can be interrupted mid-write by the cloud drive and become corrupted |
| **Do not spawn `.cmd` files** | Node 24 reports `EINVAL`. The DSH bridge calls `DeepSeek Harness.exe` directly + `ELECTRON_RUN_AS_NODE=1`; **bypassing the shell also bypasses the command-injection surface** |
| **DSH's cwd is the sandbox boundary** | `sandbox-policy.workspaceRoot = process.cwd()`, so setting the cwd to the current vault = the AI can only modify this vault |
| **Child process stdout must be explicitly UTF-8** | Otherwise Chinese is garbled; also, NDJSON may contain lines polluted by ANSI, so parsing must be tolerant |
| **Completion sources must check composing on the first line** | Measured: CodeMirror's autocompletion **still** invokes the completion source when `view.composing === true` → during Chinese composition, the completion popup and the IME candidate window compete for keystrokes (the same disease as Monaco #2199). Write `if (context.view?.composing) return null;` on the first line of every completion source |
| **Don't use PowerShell's `Get-Content` to read UTF-8 files** | It decodes according to the system ANSI code page (GBK on this machine) by default → Chinese becomes garbled; writing back with `Set-Content -Encoding utf8` then causes **permanent corruption** (this project's README.md has already been hit once). Use Node to detect encoding and read/write, or at least use `-Encoding UTF8` |
| **Electron main process/preload must be CommonJS** | `import { app, BrowserWindow } from "electron"` reports `does not provide an export named 'BrowserWindow'` — Electron built-in modules do not provide ESM named exports. Use `.cjs` for the main process and preload; the renderer uses ESM as usual |
| **`ELECTRON_RUN_AS_NODE=1` turns Electron into Node** | When this variable remains in the environment, Electron startup reports `Cannot read properties of undefined (reading 'whenReady')`. If you set it while debugging DSH, remember to clear it |
| **PowerShell reads UTF-8 files as GBK** | It displays garbled text, but **the file itself is fine**. Use Node to determine the encoding; don't trust `Get-Content` |

---

## Dependency License Red Lines

Research found a batch of libraries that "look usable but are actually not"; they have been blocked in the CI gate:

- **AGPL-3.0**: PyMuPDF, `ezexam` (Typst exam-paper template), Logseq / AppFlowy / Trilium / SiYuan
- **Non-commercial**: Nougat model weights (CC-BY-NC-4.0)
- **Explicitly prohibits production use**: tldraw
- **Not OSI open source**: Anytype

For alternatives, see the risk register R2b/R2c in [gezhi-development-plan.md](gezhi-development-plan.md).

---

## Verified Capabilities (All Have Rerunnable Evidence)

| Capability | Status | Evidence |
| --- | --- | --- |
| P0 foundation (vault schema / DSH bridge / license gate / credential defenses) | ✅ 9/9 | `node scripts/p0.mjs` |
| Chinese input method (composition input) | ✅ 8/8 | `poc/ime/cdp_ime_final.py` |
| R13 autocomplete × input method | ✅ 5/5 | `poc/ime/cdp_r13_test.py` |
| Tencent Cloud ASR / TTS (including the synthesis→recognition loop) | ✅ 10/10 | `packages/voice/verify-tencent.mjs` (requires environment-variable keys) |
| De-branding of outputs + knowledge-point detail | ✅ 10/10 | `typst compile templates/typst/handout-sample.typ` |
| Electron shell (startup / IPC / security constraints / file tree / tabs) | see `apps/desktop/smoke-electron.mjs` | — |

## Next Steps

P1 = knowledge base and editor (Electron shell + file tree + tabs + CodeMirror 6 + Live Preview).

For progress and acceptance criteria, see §5 of [gezhi-development-plan.md](gezhi-development-plan.md).

</details>
