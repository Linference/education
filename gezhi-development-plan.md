# Gezhi · Software Development Master Plan

> Version: v1.0 (first edition of the plan)
> Positioning document: this file is the **single master plan**. Companion detailed documents are in [`docs/`](docs/): environment survey, intelligence-layer selection, storage measurements, and research reports in six directions (to be completed as work progresses).
> Naming: product name **Gezhi** (from "investigate things to extend knowledge") — it gathers textbooks, questions, notes, AI and planning into one local vault, so that AI can only speak **standing on your own books**.

---

## 0. One-Sentence Definition

> **A local learning operating system: manage your knowledge like Obsidian, edit your documents like VSCode, let AI produce Word/PDF/Markdown like opencode, quiz you and grade you with the Feynman method like a private tutor, and plan and count down for you like an academic affairs system.**

Four non-negotiable product principles:

1. **Data lives on your computer**: a vault = an ordinary folder (by default under "Documents"); Markdown is the single source of truth and can be opened with other software at any time.
2. **AI must stand on evidence**: answering textbook questions must give "which book, which page"; if the source cannot be found, say so plainly; do not make things up.
3. **Operable and verifiable**: every stage can run, be demonstrated and be rolled back; no half-finished products that "look almost done".
4. **Don't rebuild engines**: the Agent kernel uses DeepSeek Harness, the document engine uses existing open-source components, and Gezhi only builds what is genuinely missing in the learning domain.

---

## 1. Final Form: Six Pages

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  Gezhi   [Vault: Grade 11 Term 2 ▾]   128 days until Four-School Joint Exam  ⏱ Today 2h15m   🔍  ⌘K    ⚙  │
├────────────┬───────────────────────────────────────────────┬─────────────────────────┤
│ ① Vault     │  ② Editor / viewer                             │  ③ Right pane          │
│  File tree  │   ┌─ modal-verbs.md ─┬─ unit-3.pdf ─┬─ handout.docx ─┐ │   • Backlinks       │
│  📁 notes   │   │                                          │ │   • Outgoing links      │
│  📁 textbooks │  │   # Modal verbs                          │ │   • Unlinked mentions   │
│  📁 question bank │ │   must / can / may ...                │ │   • Tags in this note   │
│  📁 output  │   │   $$P(A|B)=\frac{P(B|A)P(A)}{P(B)}$$      │ │   • Related knowledge points │
│  📁 voice   │   │   [[subjunctive mood]] [[Feynman:modal verbs]] │ │   • Questions in this note │
│  ★ Favorites │  └──────────────────────────────────────────┘ │   • Outline             │
│  🏷 Tags    │   [Source] [Live Preview] [Reading]      [Graph] [Export] │                     │
├────────────┴───────────────────────────────────────────────┴─────────────────────────┤
│  ④ Learning graph (global / local)    ⑤ AI dialogue (with Feynman scoring)    ⑥ Question bank and paper generation │
│  ⑦ Calendar and planning (with countdowns, review queue)   ⑧ Dashboard (heatmap, mastery radar, token usage) │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

| Page | What it does | Key interactions |
| --- | --- | --- |
| ① Vault | Multi-vault switching, file tree, tags, search, favorites | Dragging in a PDF/docx imports it automatically; right-click to rename/move/export |
| ② Editor | Full-featured Markdown editing; PDF / Word viewing | Three-mode switching, `[[` autocomplete, paste images, formula preview |
| ③ Right pane | Backlinks, outgoing links, unlinked mentions, tags, related knowledge points and questions, outline | Click any item to jump; one-click conversion of "unlinked mentions" into wikilinks |
| ④ Graph | Relationship network of files/knowledge points/questions | Global/local, colour by type, filter by tag, click a node to preview |
| ⑤ AI dialogue | Converse with AI and have it produce documents; in **Feynman mode** the AI asks follow-up questions and scores | Streaming output, collapsible thinking, approvable tool calls, session continuation, token metering |
| ⑥ Question bank and paper generation | Filter questions by knowledge point/difficulty/year, select them and automatically generate and export a PDF paper | Paper + quick answer key + analysis pages, answer sheet |
| ⑦ Calendar and planning | Goals → weekly plans → daily tasks; exam countdowns; review queue | One-click AI goal breakdown, drag to reschedule, daily briefing notification |
| ⑧ Dashboard | Study-time heatmap, mastery radar, streak, spending | See at a glance "which subject is regressing" |

---

## 2. Technology Selection (Conclusion Table)

### 2.0 Four Product Hard Rules (Settle These First, Then Technology)

> These four are product-level constraints and **take precedence over any technology selection**. They are written here because they permeate the data model,
> templates, AI prompts and the export pipeline; settling them late means rework.

| # | Rule | Why | How to implement |
| --- | --- | --- | --- |
| **G1** | **Outputs must be clean: PDF / Word / Markdown must contain no product attribution whatsoever** (no footer, watermark, end signature or header branding) | What students receive is **their own** document, not a document "generated by some software". Attribution makes people embarrassed to hand it in | The Typst template's `author` defaults to `none`; if not supplied, no footer is rendered; the export pipeline **does not inject watermarks**; acceptance uses `pdftotext` to extract the text layer and search for the project name, which must yield 0 hits |
| **G2** | **No arts/science streaming**; no preset "science student / humanities student" paths | The knowledge points students need do not follow streams. Preset streams box people in, and also leave interdisciplinary knowledge points with nowhere to live | The data model **adds no track field**; `subject`/`grade` are **free tags** rather than hard classifications; knowledge points are connected into an interdisciplinary network via `kp_edges`; **no "Subject: / Grade:" classification lines appear in exports** |
| **G3** | **Knowledge points must be detailed**: reject outline-style output | The standard for "having learned something" is being able to explain it clearly and solve problems, not recite a table of contents | See the detail definition in §2.0.1, written into generation prompts and acceptance as a **hard constraint** |
| **G4** | **The output format is decided by the user on the spot** (md / pdf / word); if not stated, ask; never default | Sometimes only Markdown is wanted for editing, sometimes Word for homework, sometimes PDF for printing | **Markdown is the single source of truth**; docx / pdf are derived renderings of it. The three are generated independently and triggered on demand |

#### 2.0.1 What "Detailed Knowledge Point" Means (A Hard Constraint, Not an Adjective)

A knowledge point must **at least** contain the following **sections**; fill in whichever is missing; **only a definition and a bullet list of key points = failing**:

| Element | Content requirements |
| --- | --- |
| **Definition** | Precise statement + **conditions for validity/scope of application** (many wrong answers stem from missing conditions) |
| **Why** | Motivation for introducing it: what happens without it, what problem it solves |
| **Derivation** | Key steps expanded step by step, **with a reason written for every step** (not a conclusion that skips steps) |
| **At least one worked example** | Stem and solution **laid out separately** (try it yourself before looking at the answer); the solution must give the reasoning, not just the calculation |
| **Common mistakes** | Specific to "which step goes wrong", with an erroneous example and a correct contrast |
| **Comparison** | Side by side with the most easily confused concept (in table form) |
| **Multi-angle representation** | **At least two** representations of the same concept among diagram/formula/code/everyday analogy |
| **Source** | Textbook title + page number (students must be able to open the book and check) |
| **Self-test** | 3–5 questions that can be explained aloud |

> **Acceptance method**: take a genuinely generated handout and tick each item against the table above. Fewer than 6 items = failing; redo.
> **Negative sample** (explicitly prohibited): only a level-1 heading + three bullet points + one sentence "in short, understand the concept".

### 2.1 Three-Layer Division: Which Language Each Layer Uses and Why

> This section exists to dispel a real misunderstanding: "You said Typst, so why are you writing JavaScript again?"
> The answer is that **the three are not on the same layer at all**; each does its own job and none replaces the others.

| Layer | Language / tool | Responsibilities | What it does not do |
| --- | --- | --- | --- |
| **① Application shell** | **Node / TypeScript** (Electron) | UI, file tree, tabs, editor, database, full-text search, scheduling, communication with AI, approval and diff | **Not responsible for typesetting** |
| **② Intelligence layer** | **DeepSeek Harness** (reused) | Dialogue, understanding user intent, reading/modifying files in the vault, deciding "what content to generate" | Not responsible for typesetting, nor for where data is stored |
| **③ Document production line** | **Typst** (PDF) + **python-docx** (Word) + Chromium printing (HTML fallback) | Typeset content **deterministically** into deliverable files | Makes no "intelligent" judgments |

**Why the document production line does not use JavaScript**: Chinese typesetting (line breaking, punctuation compression, font embedding, formulas, page numbers, two-column exam papers) has more than a decade of accumulation in these tools, and there is no equivalent in the Node ecosystem. The result of forcing JS to assemble PDFs is uncontrollable layout and different output every time — that cannot serve as a deliverable (P5 acceptance specifically includes "exporting the same Markdown twice in a row yields exactly the same layout").

**Why the application shell does not use Python**: the UI needs the Web technology stack; and Node has built-in `node:sqlite` (including FTS5 and JSON1), so the storage layer does not need a single native module. The P0 foundation is therefore **zero-dependency** — this is not fastidiousness, but a way to make "it can run" independent of any installation step.

**How the three layers connect**: the application shell spawns a DSH subprocess (NDJSON event stream); DSH calls Typst and python-docx through **skills/MCP tools registered by Gezhi**; products land back in the vault's `output/`. See the architecture diagram in §3 and P5 in §5.

**Verified dependency status** (measured at the end of P0):

| Dependency | Status | Notes |
| --- | --- | --- |
| Typst | ✅ `Typst.Typst` 0.15.1 installed (winget) | Mainstay of the PDF production line. **Chinese PDF generation has already been verified in advance**, see the font pitfall below |
| python-docx | ✅ **Already included in DSH's bundled Python 3.12.14** as `docx 1.2.0` (also openpyxl / python-pptx / Pillow / lxml) | The Word production line **requires no environment setup of its own** |
| XeLaTeX | ✅ Installed (MiKTeX, `ctex`/`xeCJK`/`exam-zh` in place) | Alternative route to Typst |
| Chromium printing | ✅ Bundled with Electron | Zero-dependency fallback |
| Pandoc | ❌ Not installed | Optional, not needed for now |

**⚠️ The Typst Chinese font pitfall (measured and solved — be sure to follow this)**

Among the Chinese fonts on this machine there are **variable fonts**, and their default weight is the extremely thin end:

```
Noto Sans SC   → NotoSansSC-VF.ttf    Weight: 100-900, Default: 100
Noto Serif SC  → NotoSerifSC-VF.ttf   Weight: 200-900, Default: 200
```

Measured: **Typst 0.15.1 cannot instantiate these two variable fonts on this Windows machine**. Whether `weight: "regular"` or `weight: 400` is written, what gets embedded in the PDF is always `NotoSansSC-Thin` / `NotoSerifSC-ExtraLight` — the Chinese body text is so thin it is almost illegible, **and no error is reported**; you only find out by checking the embedded fonts.

**Solution: do not put the variable versions of Noto in the font stack; use static fonts instead.** The conclusion after line-by-line rendering comparison:

| Font | Is the weight reliable? | Use |
| --- | --- | --- |
| **DengXian** | ✅ regular/bold clearly distinct | **First choice for body text** (elegant glyphs) |
| **Microsoft YaHei** | ✅ Clearly distinguished | **First choice for headings** |
| SimHei / KaiTi / STSong | ✅ | Fallback |
| SimSun | ✅ but overall too thin | Fallback only |

Product comparison: `output/handout-sample.pdf` (164 KB, 2 pages, `DengXian` + `DengXian-Bold` + `MicrosoftYaHei` embedded in pairs, with ToUnicode so **Chinese is copyable**).

> **Reusable criterion**: before adding any Chinese font in the future, first check whether `typst fonts --variants` contains `(Variable)`; if so, don't use it. After the change, you must **open the PDF and check the embedded font names**; do not merely look for errors.

### 2.1 Selection Conclusion Table

| Layer | Selection | Reason / notes |
| --- | --- | --- |
| Desktop shell | **Electron + electron-vite + React 19 + TypeScript** | The UI stack is the Web; PDF.js, CodeMirror and graph libraries are all born for the browser; the downside (size) has been offset by "we are going to bundle Python/TeX anyway". [The real differences between Tauri and Electron](https://devtoolpicks.com/blog/tauri-vs-electron-indie-hackers-2026) |
| **Intelligence kernel** | **DeepSeek Harness (DSH) headless subprocess + NDJSON event stream** | Measured working (3.1s, 8 event types); reuse its account, sandbox, sessions, compaction, skills, MCP and offline voice. See [`docs/01-intelligence-layer-dsh-as-agent-core.md`](docs/01-intelligence-layer-dsh-as-agent-core.md) |
| Text editing kernel | **CodeMirror 6** (6.43.13 / MIT) **has passed Chinese composition input measurements** | **The decisive basis is the Chinese input method**: CodeMirror's IME-related issues are **all closed** (including composition garbling #1650/#1654/#1688 on the core Live Preview path; status and closing time independently re-checked); while **Monaco's #2199 (Chinese IME conflicting with autocomplete) and #4805 (decorations not refreshing during IME) are still open**, exactly blocking the autocomplete and decorations Gezhi needs; TipTap #7271 (duplicate characters with Chinese IME) is also still open. **Measured on this machine with the CDP IME interface: 8/8 passing** (including composition input inside `[[ ]]`, `$formula$` and `#tag`, and undo granularity). See [`poc/ime/test-conclusions.md`](poc/ime/test-conclusions.md). ⚠️ **The cost must be scheduled: Live Preview decorations, wikilink atomization and autocomplete are all self-developed, about 2–4 person-months**; ⚠️ **the interaction between `[[` autocomplete and IME has not yet been verified** (exactly where Monaco failed), and is a risk point that P1 must verify specifically |
| Markdown parsing | **Dual-parser division of labour**: editing path `@lezer/markdown`; indexing path `micromark` + `mdast-util-from-markdown`; rendering path `markdown-it` | [Fact] The `@lezer/markdown` README explicitly admits that in exchange for incremental parsing it **does not validate link references** (`[a][b]` is treated as a link even if `[b]` is undeclared) → **the link graph index must never depend on Lezer, or ghost edges will grow in the graph**. Risk: dialect drift between the two → extract the wikilink recognition rules into an independent module shared by both paths |
| wikilink parsing | **Must be written in-house** | [Fact] All existing npm packages are stagnant: `remark-wiki-link` (2023-10), `markdown-it-wikilinks` (2023-08), `micromark-extension-wiki-link` (**2021-01**). The upside is that the semantics of aliases/embeds/block references are product logic anyway |
| Graph kernel | **`d3-force` layout (Web Worker) + self-developed layered Canvas 2D rendering**; alternatives sigma.js, Cytoscape.js/G6 | [Fact] Obsidian's official documentation states: the graph uses `<canvas>` and WebGL — **it uses no graph library**; the Center/Repel/Link/Link distance **four knobs in its settings panel correspond one-to-one to `forceCenter`/`forceManyBody`/`forceLink.strength`/`forceLink.distance`** (the same force model), while `Text fade threshold` and `Animate` **have no equivalent in any off-the-shelf library**. Switching conditions below |
| Panel layout | **dockview** (MIT, 3,453★, 8.4.0) | The only one with all four pieces "tabs + groups + grid + splits", zero dependencies and continuous releases; replaces the self-developed layout |
| Command palette | **kbar** (MIT) | Comes with the trio of command registry + shortcuts + search; cmdk is only a UI primitive (and the repository has moved to `dip/cmdk`) |
| Local storage | **`node:sqlite` (built into Node, measured 3.53.1 + FTS5 + JSON1)** | No native modules, avoiding prebuilt binary mismatches after Node upgrades; **3.53.1 is above the fix line 3.51.3 for the WAL-reset vulnerability**, so the dual connection "main process writes + renderer reads" can be safely adopted |
| Chinese full-text search | **FTS5 `tokenize='trigram'` (required, measured)** | Under the default tokenizer, Chinese **cannot retrieve anything at all** (measured) |
| Vector retrieval | Deferred; use `sqlite-vec` or LanceDB when needed | First get "trigram keywords + LLM re-ranking" working; don't let a vector database become an installation barrier |
| Calendar component | **FullCalendar 7.1.0 (MIT standard package) + `@fullcalendar/react` + `@fullcalendar/rrule`** | Month/week/day/agenda + **drag-to-reschedule** (`/interaction`) + RRULE recurrence **are all in the MIT package**; only "resource view/timeline" is Premium (from $480), **v1 will not pay for it**; use "self-drawn subject columns + `dayGridWeek`" instead |
| Date handling | **date-fns (calculation) + Day.js (display)**, lunar calendar via `lunar-javascript` | Don't introduce Luxon/Moment (duplication); lunar birthday countdowns must be implemented separately — components don't provide it |
| Charts | **ECharts 6.1.0 (Apache-2.0)** | One library simultaneously solves the heatmap (`calendar` coordinate system + `heatmap`), mastery radar and completion-rate curves |
| System notifications | Electron built-in `Notification` (`id` → Windows toast `Tag` de-duplication, **Tag limited to 64 characters**) | Dual paths: autostart + tray timer as the main path, `schtasks /sc daily /st 07:00 /it` (**must include `/it`**) as fallback; don't use the abandoned node-notifier |
| PDF viewing | **pdfjs-dist** (alternatives pdfium/EmbedPDF) | No server needed, a natural fit with Electron ([PDFium vs PDF.js comparison](https://www.react-pdf-kit.dev/blog/pdfium-vs-pdfjs-react-rendering-engine)) |
| Word viewing | **docx-preview** (high fidelity) + **mammoth** (convert to HTML for text) | Read-only preview is enough; true docx **editing** needs ONLYOFFICE/Collabora — not for now |
| Word generation | **DSH's bundled `office-skills` (python-docx)**, invoked by the AI as a tool; JS `docx` only as an offline fallback | **Do not set up a Python environment yourself** — DSH ships Python 3.12 with python-docx/openpyxl/pptx + the `check_office.py` validation script ([Measured]). Chinese styles, headers and footers are controllable |
| PDF generation | **Self-developed Typst templates (primary) → XeLaTeX (when the user already has TeX) → Chromium printing (fallback)** | Although `exam-zh` is in place, it has been unmaintained since 2024-04 (not a product dependency); `ezexam` is AGPL and cannot be bundled. **Typesetting is always decided by templates; the model only handles content** |

> **Prerequisite of §2**: all "intelligent" steps in the table above (dialogue, reading files, generating content, calling tools, exporting documents, voice) **are executed through DSH**, not a separate stack built by Gezhi. Gezhi only provides "capabilities invoked by DSH" and "the interface for presenting results and approvals".

### 2.1 DSH Built-in Capabilities → Gezhi Features (What Is Reused Directly, What Must Be Built In-House)

| What Gezhi needs to do | DSH already has | Gezhi's effort |
| --- | --- | --- |
| AI dialogue / streaming output / thinking display | `agent-loop` + NDJSON events (8 types measured) | UI consumption only |
| Read/modify files in the vault | `tool-fs` / `tool-fs-search` + `fs-observation-policy` + sandbox (cwd is the boundary, measured) | Only set the cwd |
| Generate Word / Excel / PPT | **`office-skills` + Python runtime + `libreoffice-kit`** | Write Gezhi templates and skill wrappers |
| Generate PDF | ❌ None (no TeX/Typst integration) | **Self-developed Typst templates** |
| Session persistence / long-term memory | `session-persistence-jsonl` + `session-query-sqlite` + projection cache + title generation | Retrieval UI only |
| What if the context is too long | `compaction-basic` + `tool-result-pruner` + `spill-policy` + `token-meter` | Read usage to build a cost panel |
| Permissions and student safety | `approval` + `permission-presets` (read-only / workspace-write / danger-full-access) | Lock to `workspace-write` by default |
| Long tasks (indexing a whole book) | `jobs` (local background jobs) | Build progress UI |
| Parallel research / multiple roles | `subagent` / `subagent_fork` / `workflow` | No development needed |
| Online lookup | `web` + `web-search-deepseek` + `web-fetch-http` | Use directly (note it requires `DEEPSEEK_API_KEY`) |
| External tool access | `mcp-resources` (MCP client) | Make the question bank/knowledge base into an MCP server |
| Knowledge-base retrieval / question-bank paper generation / Feynman scoring / calendar planning | ❌ | **Built in-house by Gezhi (this is Gezhi's value)** |
| Offline Chinese voice | `sherpa-onnx-win-x64` (22.43 MB, excluding models) | Download models + build the voice loop |

> This table is the answer to "how much code does Gezhi actually need to write": **the intelligence layer is almost zero; the value is concentrated in five things — knowledge base, question bank, scoring, planning and the interface.**
| Voice (listening) | **Tencent Cloud real-time speech recognition (streaming) as preferred + DSH's bundled sherpa-onnx offline fallback** | Key to the Macao scenario: Tencent Cloud supports **`16k_yue` (Cantonese)** and `16k_zh-PY` (mixed Chinese/English/Cantonese)
| Voice (speaking) | **Tencent Cloud streaming TTS as preferred + Windows built-in SAPI Chinese voice as fallback** | ⚠️ **Edge-TTS must not be used for competition/commercial purposes** (reverse-engineered calls to Microsoft's reading service + GPL-3.0)
| Avatars | **Pre-rendered GIF/WebP/APNG state machine (first) → Live2D / VRM (later)** | **Tencent Cloud TTS's `EnableSubtitle` returns character-level `BeginTime/EndTime` + `Phoneme` pinyin**, which amounts to a free data source for mouth shapes (visemes), lowering the difficulty of Plan A by an order of magnitude
| Packaging | electron-builder (NSIS) + on-demand dependency download on first run | See §7 size budget

---

## 3. System Architecture

```
┌─────────────────────────── Gezhi (Electron main process / Node) ───────────────────────────┐
│  Vault service      node:sqlite (metadata + FTS5 trigram)   chokidar file watcher          │
│  Index service      extract → chunk → build FTS → align knowledge points (background job, resumable) │
│  Document service   md→docx (python-docx) / md→pdf (xelatex) → preview → write back to output directory │
│  Question-bank svc  extract questions / generate papers / produce papers and answers (LaTeX template) │
│  Planning service   goals→plans→tasks, countdowns, FSRS review queue, system notifications │
│  Voice service      recording/VAD → ASR → LLM → TTS → playback; avatar state machine       │
│  Agent bridge       spawn `dsh headless --json` ⇄ NDJSON event stream (cwd = current Vault) │
└───────────────┬─────────────────────────────────────────────────────────────────────────────┘
                │ IPC (contextBridge, allowlisted API)
┌───────────────┴─────────────────────────── Renderer process (React) ──────────────────────┐
│  ① Vault  ② Editor/viewer  ③ Right pane  ④ Graph  ⑤ AI dialogue + Feynman  ⑥ Question bank & paper generation │
│  ⑦ Calendar & planning  ⑧ Dashboard  ⑨ Settings                                            │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
                │ Subprocess (controlled)
   ┌────────────┴─────────────┬──────────────────────┬────────────────────┐
   │ DSH headless (Agent)     │ Python (docs/index/stats) │ XeLaTeX (papers/exports) │
   └──────────────────────────┴──────────────────────┴────────────────────┘
```

**Security boundary**: DSH's `sandbox-policy.workspaceRoot = process.cwd()`, so "set cwd to the current Vault" = "AI can only modify this vault"; out-of-bounds writes must go through approval. Gezhi's default policy locks to `workspace-write`.

---

## 4. Vault Data Model

### 4.1 Disk Structure

**The vault's root path must be resolved with `app.getPath('documents')`; hardcoding is forbidden.**
Most Windows users never touch the setting, and `Documents` is by default `C:\Users\<username>\Documents`; but **it can be redirected at any time** (this machine is exactly such a case, see below), so you can only "ask the system", not "guess the path".

`[Measured]` On this machine `%USERPROFILE%` = `C:\Users\LINKIT`, but the registry key `User Shell Folders\Personal` redirects "Documents" to **`D:\Users\LINKIT\Documents`** (the user actively moved Documents to the D: drive — only 55.6 GB remained on C:, a reasonable choice).
- Hardcoding `C:\Users\<username>\Documents`: on this machine it **reports no error but writes to the wrong place** (a directory the user never actually uses), silently. This is the worst kind of bug.
- `app.getPath('documents')`: reads the real known-folder location in the registry → on this machine it returns `D:\Users\LINKIT\Documents`, on other machines it returns `C:\Users\<username>\Documents` — **both are correct**.

The same machine also has OneDrive installed (`C:\Users\LINKIT\OneDrive`, where `Documents`/`Pictures`/`Attachments` are links, and **Files On-Demand may turn files into "online-only" placeholders**) — this is the direct reason "the vault must not live on a sync drive", so the database is placed separately in `%APPDATA%`.

> **General rule (holds for all users)**: vault path = the return value of `app.getPath('documents')` → the user can change it, but **the default must be the "Documents" the system says**, and the settings page must **state the current actual path explicitly** (so users don't later lose track of their vault).

```
<app.getPath('documents')>\Gezhi\        ← measured on this machine = D:\Users\LINKIT\Documents\Gezhi\
├─ vaults.json                          vault list (registry for multi-vault switching)
├─ Grade 11 Term 2\                     ← Vault 1 (can be git-managed independently)
│  ├─ .gezhi\
│  │  ├─ vault.json          vault config (name/subject/grade/default template/encrypted or not)
│  │  ├─ workspace.json      tab layout, open files, panel widths
│  │  ├─ graph.json          graph view settings (filters, layout, colouring)
│  │  ├─ property-types.json property type registry (**vault-level global**, see below)
│  │  ├─ backup\             export backups (question bank/plans/scores and other non-reconstructible data)
│  │  └─ trash\              deleted files (recoverable, not wiped immediately)
│  ├─ notes\  textbooks\  question-bank\  voice\  output\  templates\  attachments\
│  └─ README.md
└─ Competition\                         ← Vault 2

%APPDATA%\Gezhi\                        ← cache and index, deliberately placed outside the vault
├─ cache\<vaultId>\          thumbnails, render cache, temporary exports
└─ index\<vaultId>\gezhi.db  SQLite: metadata + FTS + question bank + plans + scores
```

**Why put `gezhi.db` in `%APPDATA%` rather than inside the vault** (this is a correction to the original plan):
- `[Fact]` Obsidian itself puts its metadata cache in **IndexedDB (outside the vault)**, as stated in the official documentation;
- If the vault lives under OneDrive (a condition this machine already meets), a WAL-mode SQLite database is prone to corruption or locking when **a cloud drive interrupts a write midway**; moving the hot database out of the sync directory cures this class of problem;
- The cost is "copying the vault folder ≠ a complete backup" → compensate with the **exported backups** (question bank/plans/scores) in `.gezhi\backup\`, and clearly distinguish "vault backup" from "full backup" in the UI. The index and cache **can be rebuilt at any time from the Markdown and the original PDFs**.

> Difference from Obsidian: `.gezhi/` replaces `.obsidian/`; and we **do not pursue key-name compatibility of the config files** — `[Unverified]` the real key names of Obsidian's `graph.json` / `core-plugins.json` were never officially published; if we later want "import an Obsidian vault", we must measure the key-name structure against a real vault, not guess from documentation.

### 4.2 Database Tables (SQLite)

**Vaults and files**

| Table | Key fields |
| --- | --- |
| `vaults` | id, name, root_path, created_at, **tags(json, free tags)** —— ⚠️ **deliberately no subject/grade hard fields** (G2: no arts/science streaming; classification goes to tags) |
| `files` | id, vault_id, path, ext, kind(md/pdf/docx/xlsx/ipynb/img), size, mtime, hash, title, page_count, status(new/indexed/failed) |
| `links` | src_file_id, dst_path(text), dst_file_id(nullable), kind(wikilink/embed/md), line |
| `tags` | id, name, color |
| `file_tags` | file_id, tag_id |
| `attachments` | id, file_id, mime, bytes_path, sha256 |
| `vault_properties` | vault_id, key, type(text/number/date/checkbox/list), default, note —— **property types are vault-level global** (per Obsidian semantics: the same key shares one type across the whole vault), not defined per note |

**Knowledge base (textbooks)**

| Table | Key fields |
| --- | --- |
| `books` | id, title, publisher(PEP/…), subject, grade, volume, isbn, source(official/imported), license_note, file_id |
| `chapters` | id, book_id, parent_id, level, no, title, start_page, end_page |
| `pages` | id, book_id, chapter_id, page_no, text, ocr_used, image_path |
| `chunks` | id, book_id, chapter_id, page_from, page_to, text, **text_seg** (jieba pre-tokenized, space-joined), tokens, kp_ids(json) |
| `chunks_fts_trigram` | **FTS5(tokenize='trigram')**: text; rowid → chunks.id —— responsible for "finding it" |
| `chunks_fts_word` | **FTS5(unicode61)**: text_seg; rowid → chunks.id —— responsible for "ranking it correctly" |
| `knowledge_points` | id, code, name, desc, difficulty, source(CSP syllabus/textbook TOC/LLM-extracted), key_points(json), **tags(json)** —— `subject`/`grade` are demoted to **tags** rather than separate columns (G2) |
| `kp_edges` | from_kp, to_kp, kind(prereq/contains/related), weight |

**Question bank**

| Table | Key fields |
| --- | --- |
| `questions` | id, subject, type(choice/fill/judge/calc/proof/code), stem_md, options(json), answer, explanation, difficulty(1-5), year, source(Guangdong zhongkao/Guangdong gaokao/HK-Macao-Taiwan JEE/Four-School Joint Exam/Macao recommended admission/CSP/self-built), region, license_note, image_ids(json), hash(deduplication) |
| `question_kps` | question_id, kp_id, weight |
| `papers` | id, title, kind(exam/quiz/homework), subject, blueprint(json), duration_min, total_score, created_by(user/ai), created_at |
| `paper_items` | paper_id, question_id, section, no, score, snapshot_md |
| `paper_exports` | paper_id, **formats(json: which formats were actually exported)**, md_path, docx_path, pdf_path, answer_pdf_path, created_at —— corresponds to G4: a paper can first export only Markdown, and export PDF later |

**Feynman scoring**

| Table | Key fields |
| --- | --- |
| `feynman_sessions` | id, kp_id, mode(voice/text), started_at, ended_at, dsh_session_id |
| `feynman_attempts` | id, session_id, transcript, transcript_words(json, with word-level timestamps), audio_path, rubric_json(6-dimension scores **+ evidence_quote + evidence_start_ms**), total_score, level, gaps_json(three kinds: missing/wrong/vague), followups_json, improved_from(score before taking the best across rounds), model, latency_ms |
| `mastery` | kp_id, score(0-100), attempts, last_at, trend, next_review_at, fsrs_state(json) |

**Planning and calendar**

| Table | Key fields |
| --- | --- |
| `goals` | id, title, subject, target_kp_ids(json), deadline, daily_minutes, status, priority |
| `plans` | id, goal_id, parent_id(self-nested), level(milestone/week/day), title, planned_start, planned_end, est_minutes, status |
| `tasks` | id, plan_id, title, kind(study/review/exam/rest), est_minutes, done_at, due_at, source(manual/ai), ref_kp_id, ref_question_ids(json) |
| `events` | id, title, kind(class/exam/activity), start_at, end_at, **rrule**(RFC 5545 text), location, remind_before_min, **is_blocking**(1=occupies learnable time) |
| `countdowns` | id, title(Four-School Joint Exam/gaokao…), date, color, note, **lunar_month/lunar_day/is_leap** (lunar birthday countdowns) |
| `reviews` | id, kp_id, question_id, due_at, interval_days, ease, reps, lapses, **fsrs_card(json)** (one row per knowledge point, following Anki's notes→cards→revlog structure) |
| `sessions_stat` | day, minutes, tasks_done, feynman_avg, tokens_in, tokens_out, cost_cny |
| `ai_plan_runs` | id, goal_id, prompt, model, output_json, applied(0/1), created_at (the AI breakdown is rollbackable and A/B comparable) |

**Three data-model conventions (from research #06)**:
1. **`events` and `tasks` are strictly separated**: fixed schedules (classes, exams) cannot be rescheduled by the AI; only `tasks` participate in automatic planning; `is_blocking` marks which schedules occupy learnable time, used for the "remaining learnable days" calculation.
2. **All times are stored as ISO-8601 TEXT, differences computed with `julianday()`** (SQLite itself has no date/time type).
3. **Foreign keys are off by default**: every connection must `PRAGMA foreign_keys=ON`, and index the foreign-key columns of child tables.

**Final decision on Chinese retrieval (merging research #02 and #04)**: the `chunks` table uses **dual fields, dual indexes**:
- `content` (original text) + **FTS5 trigram**: responsible for "finding it" (substring-level recall, works for both English and Chinese, `[Measured]` 1 ms);
- `content_seg` (jieba pre-tokenized, space-joined) + FTS5 unicode61: responsible for "ranking it correctly" (word-level recall);
- The two paths are fused and ranked. Rationale: `[Fact]` SQLite's official documentation §4.3.1 specifies that token characters by default include `L* N* Co`; Han characters belong to `Lo` and are thus treated as token characters, and Chinese has no spaces → a whole sentence becomes **a single** token; under the default tokenizer, searching "智慧教育" within "国家中小学智慧教育平台" (the National Smart Education Platform) misses (consistent with this machine's measurement).
- jieba uses `nodejieba` on the Node side / `jieba` on the Python side (MIT); both are clean for commercial use.

**Conversations**

| Table | Key fields |
| --- | --- |
| `conversations` | id, title, module(vault/feynman/exam/plan), dsh_session_id, cwd_vault_id, created_at, last_at, tokens_total |
| `messages_index` | id, conversation_id, role, text_preview, tool_calls(json), tokens, created_at (the body is still stored by DSH's JSONL sessions; this table only serves retrieval and listing) |

---

## 5. Phased Delivery Plan

Principle: **at the end of every phase it must "run, be demonstrable and be rollbackable"**; write the acceptance scripts before the features in each phase.

### P0 · Kickoff and Foundation (0.5 weeks) —— ✅ **Completed (commit `ec3b6b9`, `node scripts/p0.mjs` 6/6 passing)**

Deliverables: repository structure, the `node:sqlite` database-creation script, a minimally usable DSH bridge, the license gate, the vault-creation CLI, and the CI entry point.

Acceptance (fulfilled item by item):
- [x] `node:sqlite` created all tables (43 tables); `chunks_fts_trigram` and `chunks_fts_word` **dual indexes built and passing 16 assertions** (including foreign keys actually enforced, ghost-edge protection, trigger sync, and `julianday()` differences).
- [x] **The dependency license gate works**: scanning the whole repo yields 0 violations, and the gate itself has **10 self-tests** proving it can block AGPL / SSPL / CC-BY-NC / production-use-forbidden / undeclared licenses (R2b technically fulfilled).
- [x] The vault-creation CLI works: directory skeleton + `vault.json` / `workspace.json` / `vaults.json` + the database (`migrate` is idempotent). **The default path reads the registry**, and correctly resolves this machine's "Documents" redirected to the D: drive in measurements.
- [x] The DSH bridge works: `collectRun` / `DshSession` wrap the event stream, **18 smoke assertions all pass** —— including the Agent modifying in-vault files under control, creating nothing outside the vault (the sandbox boundary holds), session continuation, and token usage accumulation.
- [x] `git init` + first commit (52 files); `.gitignore` excludes data/secrets/temporary artifacts; `.gitattributes` unifies LF.
- [x] Extra: a Chinese input method PoC (CodeMirror 6, CDP automated test 8/8) —— originally a P1 prerequisite, done ahead of time.

> **Difference from the original plan**: the "`electron-vite` shell" originally in P0 is postponed to P1. Rationale: first solidify the three **assertable** foundations — "vault structure + intelligence layer + gate" — on which the UI's value depends; and the P1 editor selection had just passed PoC validation at that point, so moving straight into P1 was smoother.

### P1 · Vault and Editor (**3–4 weeks**, including self-developed Live Preview) → usable product prototype

Features: file tree (create/rename/delete to trash/drag to move), multiple tabs and splits (**dockview**), CodeMirror 6 editor (Markdown + KaTeX + code highlighting + image paste + `[[` autocomplete), three-mode switching (source/live preview/reading), YAML frontmatter property panel, vault switching, Ctrl+P command palette (**kbar**), Ctrl+O quick switch, autosave and history snapshots.

> ⚠️ **Schedule correction (from research #01)**: Live Preview decorations, wikilink atomization and autocomplete **have no ready-made wheels** (all wikilink-related npm packages stalled between 2021–2023), so they must all be built in-house, **about 2–4 person-months**. The original 1.5-week estimate only covers a "Monaco/CM editor with Markdown highlighting", not the Obsidian experience. **If you want something usable quickly, shrink P1 to "source mode + split preview" first, and move Live Preview to after P3.**

Acceptance:
- [ ] Create 20 notes, 30 `[[wikilinks]]` and 5 tags; after restart all are preserved and the layout is restored.
- [ ] **Chinese input method typing 200 characters in a row with no dropped characters and no cursor jumping** (this is the first priority of the selection; must be hand-tested on a real machine).
- [ ] **Turn the PoC's automated IME test into a CI regression test and get it passing** (`poc/ime/cdp_ime_final.py` is already usable; must run when upgrading the CodeMirror version, to immediately detect regressions in composition input behaviour).
- [ ] **`[[` autocomplete coexists with IME** —— ✅ already verified specifically at the PoC stage (R13, 5/5); see [`poc/ime/r13-conclusion-autocomplete-and-ime.md`](poc/ime/r13-conclusion-autocomplete-and-ime.md). **When landing P1, the rule must be followed: every autocomplete source checks `context.view?.composing` on its first line**, and this test suite is wired into CI.
- [ ] Type a 5000-character document; scrolling and typing don't stutter (frame rate ≥ 50 fps).
- [ ] Deleting a file moves it to `.gezhi/trash`; one-click recovery.
- [ ] `[[` autocomplete filters correctly under both Chinese titles and mixed Chinese-English titles.

### P2 · Multi-format Viewing: PDF / Word / Excel (1 week)

Features: pdfjs-dist viewing (page turning, zoom, table of contents, text-layer selection and copy, jump to a page), docx-preview for Word, mammoth for converting to text for indexing, basic table and ipynb preview, and clipping a PDF page into a note with a backlink.

Acceptance:
- [ ] Opening a 300-page scanned PDF: first screen < 1.5s, page turn < 200ms.
- [ ] Opening a 10 MB docx renders Chinese and tables correctly.
- [ ] After "clip page 42 as a note", the note automatically carries `[[source file#page=42]]` and a backlink appears in the right pane.

### P3 · Graph, Backlinks and Full-Text Search (**2.5–3 weeks**)

Features: global/local graph using **`d3-force` layout (running in a Web Worker) + self-developed layered Canvas 2D rendering** (coloured by file type, filtered by tag, drag and zoom, text fades out with zoom), right-pane backlinks/outgoing links/unlinked mentions, a full-text search panel (trigram dual indexes, supporting `tag:`/`path:`/`ext:` operators), result highlighting and jumping, and previewing a graph node on click. **(If P1 took the "shrunken" path, Live Preview is also built in this phase.)**

**Three constraints on the graph implementation (from research #01)**
1. **The link-graph index must not depend on `@lezer/markdown`** (it does not validate link references and treats undeclared references like `[a][b]` as links → ghost edges in the graph). The indexing path uses `micromark` + `mdast-util-from-markdown`, and only the editing path uses Lezer; both share one wikilink recognition rule module to prevent "dialect drift".
2. **The force model follows Obsidian's four knobs**: Center / Repel / Link strength / Link distance ↔ `forceCenter` / `forceManyBody` / `forceLink.strength` / `forceLink.distance`, user-adjustable.
3. **Prepare for ten-thousand-scale ahead of time**: `[Fact]` Obsidian's official documentation admits that at **10,000 items** it downgraded the fuzzy-search algorithm of the quick switcher → name+alias fuzzy search has a performance ceiling; the index structure must be ready for ten-thousand-scale at design time (don't wait until it lags to fix it).

**Switching conditions (when to change libraries)**: the team lacks graphics experience or must ship within 2 weeks → switch to **Cytoscape.js / AntV G6**; the vault is expected to exceed **20,000 nodes** → switch to **sigma.js + graphology** (`[Measured]` sigma can only load in the renderer process, see 01b).

Acceptance:
- [ ] Dragging at ≥ 40 fps with 5000 nodes / 8000 edges (**must be measured on a real machine and the data recorded**——research #01 did no performance benchmark at all; every "smooth" conclusion there is inference).
- [ ] Chinese search for "情态动词" (modal verbs) returns and highlights within 1 second.
- [ ] Clicking an item in the "unlinked mentions" list turns the plain text into a `[[wikilink]]`, and the graph updates in real time.
- [ ] Typing a `[[xxx]]` that points to a non-existent file does **not** produce an edge to it in the graph (verifies ghost edges are eliminated).
- [ ] Tag semantics match Obsidian: `tag:inbox` matches `#inbox/to-read`, but `tag:#work` does **not** match `#myjob/work` (consistent behaviour in both search and graph).

### P4 · AI Dialogue and Agent Production (1.5 weeks)

Features: DSH bridge upgrade (session continuation, event-stream UI, collapsible thinking, cancellation, error retry), a dialogue page (Markdown rendering + code blocks + tool-call cards + approval dialogs), `@file` references, token and cost statistics, an Agent tool panel showing which files it read, and a diff preview before write operations.

Acceptance:
- [ ] Saying "fix the typos in `notes/modal-verbs.md`": the AI shows a diff, and after clicking "Apply" the file is actually changed.
- [ ] Saying "make a review outline for this chapter": Markdown is produced and lands in `output/`.
- [ ] When offline, give a clear prompt rather than failing silently; clicking cancel stops it immediately.
- [ ] An out-of-bounds write to `C:\` is blocked by the sandbox and reported.

### P5 · Document Production Line: Markdown → Word / PDF (1.5 weeks)

**This production line is "work done by the AI through DSH", not a converter written by Gezhi itself.** The division of labour must be clear:

```
The user says to the AI: "turn this chapter into a handout, export Word and PDF"
        ↓
Gezhi forwards the request to DSH (headless subprocess, cwd = current Vault)
        ↓
DSH's Agent loop: read source files → generate Markdown → call the skills/tools registered by Gezhi to produce documents
        ↓
Capabilities registered by Gezhi (DSH skills + MCP tools, essentially local scripts)
        ├─ docx: reuse DSH's bundled office-skills (python-docx / python-pptx / openpyxl + check_office.py validation)
        ├─ pdf : self-developed Typst template (Apache-2.0, freely distributable) → fall back to XeLaTeX (when the user already has TeX)
        └─ html: Chromium printing (zero dependency)
        ↓
Products are written back to output/ → previewed in the Gezhi UI → the user opens them / links back from the dialogue
```

**Key point**: the model does no typesetting. The model only decides "content and structure"; **typesetting is handed to deterministic templates and scripts** —— otherwise every generation would have a different layout and could not serve as a deliverable.

**The relationship of the three formats (corresponds to G4; implement exactly this way)**

```
        ┌──────────────────────────────┐
        │  Markdown —— the single source of truth │  always generate it first; readable, editable, can go into git-style versioning
        └───────────┬──────────────────┘
                    │  derived on demand (independent of each other; you may make only one)
        ┌───────────┴───────────┐
        ▼                       ▼
   Typst → PDF            python-docx → docx
   (print/submit homework)   (editable/submit homework)
```

- **The user decides on the spot** which one: saying "give me Markdown" produces only `.md`, saying "I want Word" produces `.docx`, saying "print version" produces `.pdf`.
- **If not stated, ask**; don't generate everything by default (the student may only want Markdown they can keep editing).
- The three formats are **each independently re-runnable**: if you exported Markdown first and want to add a PDF a week later, just derive it from that Markdown.

**Outputs must be clean (G1)**: none of the three formats may carry product attribution, watermarks or footer branding.
- The Typst template's `author` defaults to `none`; if not supplied, no footer is rendered
- docx adds no footer attribution; Markdown adds no generator comment header
- **Acceptance method**: `pdftotext` extracts the text layer and searches for the project name (0 hits), docx is unpacked and `docProps` and the footer searched, Markdown is searched directly

Features:
- **Gezhi side**: an export panel (Markdown / Word / PDF / styled HTML; multi-select but **empty by default**, the user must tick something), template management (handout, exam paper, report), export results going into `output/` with backlinks, pre-export preview, and readable errors on failure.
- **DSH side**: register Gezhi skills (`export-docx` / `export-pdf`) so the Agent can call them autonomously; reuse DSH's `office-skills` to produce docx/xlsx/pptx, and use its `scripts/check_office.py` directly for product validation.
- **Don't reinvent**: DSH already ships Python 3.12 + python-docx/openpyxl/python-pptx/Pillow/lxml/XlsxWriter and `libreoffice-kit` (`[Measured]`, see `docs/00-environment-survey.md`) → **Gezhi does not need to set up a Python environment itself**.
- ⚠️ **To be completed**: the `Markdown → docx` pipeline currently only has the Python side (python-docx); a "Markdown AST → docx elements" converter must be written (heading levels, lists, tables, formulas rasterized to images, code blocks, callout styles). This is the bulk of P5's workload.

Acceptance:
- [ ] In the dialogue, saying "turn `notes/modal-verbs.md` into a handout and export Word": the AI completes it itself, **and the UI shows which tools it called during the process**.
- [ ] Saying "only Markdown" **produces no** pdf/docx files (verifies G4's "on demand" rather than "generate everything").
- [ ] A 12-page Chinese handout (with 8 formulas, 3 tables and code blocks) exported to PDF: formulas and Chinese are all correct, with no missing glyphs.
- [ ] The same content exported to docx opens in WPS/Word with correct styles and table of contents, and `check_office.py` passes.
- [ ] **Exporting the same Markdown twice in a row yields exactly the same layout** (verifies the principle "typesetting is not decided by the model").
- [ ] **★ G1 acceptance: in all three formats, `pdftotext` / docx unpacking / source-text search all** find nothing **of any product attribution or watermark.**
- [ ] **★ G2 acceptance: no classification lines like "Subject:", "Grade:", "science track" or "humanities track" appear in the outputs.**
- [ ] **★ G3 acceptance: take a genuinely generated handout and tick it against §2.0.1's detail table, hitting ≥ 6 items** (definition/why/derivation/example/common mistakes/comparison/multi-angle/source/self-test).
- [ ] On a clean environment without TeX, it automatically goes through Typst or Chromium printing rather than crashing; both fallback paths give readable prompts.

### P6 · Voice and Feynman Scoring (2 weeks)

Features: recording (getUserMedia + Web Audio), VAD sentence segmentation, ASR (offline sherpa-onnx fallback / Tencent Cloud real-time streaming preferred), AI follow-up questioning flow, **six-dimensional scoring report**, three kinds of knowledge-gap diagnosis (not mentioned / said wrong / said vaguely), mastery written back to `mastery` and the review queue, a GIF avatar state machine, and TTS playback.

**Feynman flow state machine (from research #05)**
`idle → selecting → listening → transcribing → probing → scoring → reporting → idle`; every state can be paused/exited, and exiting midway must **save the already-transcribed text**.

**Scoring rubric (six dimensions + weights)**

| # | Dimension | Weight | What is scored | Data source |
| --- | --- | --- | --- | --- |
| 1 | Conceptual accuracy | **30 %** | Whether the facts are right, any hard errors, any concept-switching | Compared against textbook source text / graph entries |
| 2 | Key-point coverage | **25 %** | How many of the scoreable points that should be covered were covered | The knowledge-point graph's `key_points[]` |
| 3 | Logical structure | 15 % | Causal chain, ordering, any leaps | Discourse structure of the transcript |
| 4 | Plain-language and analogy | 13 % | Whether it was translated into plain words and whether analogies hold | Follow-up rounds + simplification rounds |
| 5 | Aptness of examples | 12 % | Whether examples fit and cover boundary cases | Examples in the transcript |
| 6 | Fluency and confidence | 5 % | Pauses, self-corrections, stability of pace and volume | ASR word-level timestamps |

**Four scoring disciplines that must be fixed first**
1. **Every dimension must carry evidence**: the model must give `evidence_quote` + `evidence_start_ms`; with no evidence, record `null` rather than 0 —— this is the key to turning "AI grading arbitrarily" into "appealable scoring".
2. **Accuracy triggers a one-vote downgrade**: hard errors trigger a level drop, but a single slip of the tongue must not drop a student from "proficient" to "not mastered".
3. **Take the best across rounds** (`max(initial explanation, after follow-up)`), and show "improved from X to Y" in the report —— the improvement itself is evidence of having learned.
4. **An explanation shorter than 15 seconds counts as invalid**: no scoring, no quota consumption, no review card written.

**Voice-loop latency budget**: end-to-end **≤ 1.6 s**, first-character feedback **≤ 400 ms** (beyond 2 s the student will think "it's not listening"). Both ASR/TTS use "online preferred + offline fallback"; the offline fallback is sherpa-onnx and the Windows SAPI Chinese voice.

**Three high-leverage engineering principles from research #05**
1. **Scores are computed by local code; the model only submits raw items**: the model only outputs 6 integers in 1–5 plus verbatim evidence quotes; weighting, levels and the one-vote downgrade are all computed by server-side code (reproducible, appealable). When judging "said wrong", it must **quote the textbook source verbatim**, and do a substring check as a hallucination detector.
2. **Decouple perceived latency from real latency**: in the **same frame** VAD declares a stop, switch the avatar to `thinking` and play a local preloaded filler sound —— the student's perceived latency ≈ 0 ms, while the real answer arrives 1.55 s later. This is the single most cost-effective move in the whole plan.
3. **Expressions must lag behind content**: on a wrong answer, first `encouraging` (empathy) then `confused` (puzzlement), and `encouraging` should fire at least twice as often as `confused`, otherwise the "training partner" turns into an "examiner".

**Dependency note** `[Measured]`: DSH's bundled sherpa-onnx is **22.43 MB**, containing a `.node` N-API native plugin (the Electron main process can `require` it directly, **no self-compilation needed**), but **the directory contains no `.onnx` models** —— the voice model must be downloaded separately in P6 and included in the size budget (50–300 MB, see §7).

Acceptance:
- [ ] Speak "Newton's second law" into the microphone for 60 seconds: get a six-dimensional score + at least 2 specific gaps (each with a textbook source) + 1 follow-up question.
- [ ] Every dimension's score can be clicked open to see the supporting original sentence and the audio timestamp (traceable evidence).
- [ ] Offline, ASR + offline TTS can still complete a full round of scoring.
- [ ] The avatar switches naturally between the "listening/thinking/speaking" three states, and mouth shapes track volume while speaking; 2 consecutive ASR failures automatically prompt switching to text mode.
- [ ] All recordings and scores are kept locally; settings allow one-click deletion of all of a day's recordings.

### P7 · Textbook Knowledge Base (2–3 weeks, can run in parallel with P6)

Features: textbook acquisition and import, a data pipeline (text-layer probe → OCR of scans → layout and heading-level restoration → chapter segmentation by table of contents → chunking → dual indexing → knowledge-point alignment), a knowledge-base browsing page, **citation enforcement** (answering textbook questions must give "book title + page number"), and a coverage panel.

**Knowledge-point extraction must follow G3 (detailed), not extract headings**:
- Extract **together with the surrounding context** —— a knowledge point's definition often spans paragraphs; grabbing only the heading line is extracting an empty shell
- Try to extract: the definition sentence, validity conditions (qualifiers like "if and only if"/"within the range of"), the derivation paragraph, worked examples, and caveats
- Parts that cannot be extracted are **marked as missing** rather than having the AI invent them —— missing is better than fabricated
- Stored into `knowledge_points.key_points(json)` as the basis for Feynman scoring's "points that should be covered"
- **Not organized by arts/science streaming** (G2): knowledge points are connected into a network via `kp_edges`, allowing interdisciplinary edges (e.g. "probability" connects both mathematics and biological heredity)

**Textbook sources (from research #04, all measured)**
- **The National Smart Education Platform has an auth-free public API** that can directly fetch the e-textbook catalogue and per-book details: catalogue `.../zxx/ndrs/resources/tch_material/version/data_version.json` (4 shards, 33.5 MB), details `.../zxx/ndrv2/resources/tch_material/details/{id}.json`.
- Measured scale: catalogue **3,579 entries**, **2,925** marked "e-textbook", of which **2,328** have `ti_file_flag=source` as PDF; **the target subset for primary/junior/senior high = 1,742 PDFs, 138.59 GB in total** (primary 880 books / 76.7 GB, junior 352 books / 24.3 GB, senior 516 books / 37.6 GB; People's Education Press alone is 269 books / only 5.41 GB).
- **The 138.59 GB of source text is never distributed with the software**, only "user self-service download + local structuring".

**OCR is the main path, not a fallback branch**
`[Inferred, pending measurement]` The median single-PDF size is 48.5 MB and median page count 49 → **about 872 KB/page**, whereas natively typeset PDFs are usually 20–80 KB/page, so **it most likely has no text layer**.
→ The **very first step** at the pipeline entry is the text-layer probe: `sum(len(p.get_text()))/page_count < 50` marks it as a scan and routes it into the OCR queue. "Assume there is a text layer first and deal with errors later" is not allowed.

Acceptance:
- [ ] Importing a 200-page textbook: chunking and dual indexing finish within 10 minutes, and the vault grows by a reasonable amount.
- [ ] The text-layer probe gives correct verdicts on sample textbooks (and records the measured "characters per page" distribution to verify the inference above).
- [ ] Asking "the three stages of cellular respiration": the answer carries more than 3 "book title + page number" citations, and clicking a page number jumps directly to the corresponding PDF page.
- [ ] Asking about content not in the textbook: the AI clearly answers "your textbook doesn't have this", without fabricating.
- [ ] The coverage panel correctly shows imported/missing chapters.

> Copyright red line: **only local import and personal study use; do not distribute copyrighted scans**; what ships with the software is always official free entry points, open materials such as curriculum standards/syllabi, and **self-built structured data**; a disclaimer is stated in the product.
> ⚠️ **To be confirmed by legal**: the redistribution boundary of "derived data" such as chunks / vectors / knowledge-point graphs.

### P8 · Question Bank and Paper Generation (2 weeks)

Features: question-bank browsing and filtering (subject/type/knowledge point/difficulty/year/source), question details, a wrong-answer book and favorites, the **paper generator** (by blueprint: knowledge-point coverage + difficulty distribution + question-type mix, with deduplication and score calculation), one-click export of "paper + quick answer key + analysis pages + answer sheet", AI question generation with source annotation, and question deduplication and version management.

**Three-tier classification of question sources (from research #04; execute exactly this way)**

| Tier | Source | Action |
| --- | --- | --- |
| 🟢 **Legally quotable/scrapable** | Ministry of Education curriculum standards (Textbook doc 〔2022〕 No. 2), Guangdong senior-high reform implementation opinions, the national joint admission brochure, **the Macao Four-School Joint Exam syllabus + past papers + suggested answers (officially free and public, no login)**, Macao recommended-admission notices, NOI syllabus 2025, OI Wiki (CC BY-SA) | Direct integration; the main question source for v1 |
| 🟡 **Only importable by the user** | Textbook PDF source text, Guangdong zhongkao past papers, Guangdong gaokao past papers, HK-Macao-Taiwan JEE past papers, CCF's CSP/NOIP past papers | Provide an import wizard and format validation; **not scraped by the software** |
| 🔴 **Must buy a license** | XueKe.com (whose terms **explicitly prohibit** scraping — even "making a scraping tool" counts as a violation), Jyeoo.com (robots bans `/api*` and the paper detail pages) | Don't touch |
| 🎫 **Legitimate commercial channel** | **The 21CNJY Education Open Platform `https://dev.21cnjy.com/`** | If a commercial question bank is truly needed, **this is the only route worth taking**; make contact and negotiate terms first |

**Four-School Joint Exam direct links (highest-quality source)**: the UM Registry `https://reg.um.edu.mo/admissions/macao-students/admission-examination/jae/syllabus-paper/?lang=zh-hant` and the Macao University of Tourism share the same content; the syllabus pattern is `/download/admission-local/jae/syllabus/{JC01,JP01,JP02,JE01,JM01,JM02}.pdf`, and papers are `/pastexampaper{1,2}/{same set}.pdf`.

**Paper rendering: switch to Typst as primary, LaTeX as fallback**
- `[Fact]` `exam-zh` (LaTeX Chinese exam papers) has license LPPL-1.3c, which is usable, but its README states it has been **indefinitely unmaintained since 2024-04-26** → only a fallback for **locally existing environments**, not a product dependency.
- `[Fact]` `ezexam` (a Typst exam template) is **AGPL-3.0** → **cannot be bundled into a closed-source product**; only its layout design can be referenced.
- Conclusion: **build a Typst exam template in-house** (Typst itself is Apache-2.0, freely distributable); Typst must be introduced in P8 since it isn't installed on this machine; LaTeX is only an optional backend "when the user's system already has TeX".

**Reference site design (cspfirstround.com, measured teardown)**: the sitemap has 1,638 URLs = 1,340 questions / 39 knowledge points / 34 papers / 16 PDFs. What is worth copying from its data model is the **dual-track design: "structured text for retrieval + one cropped scan image of the original question per question for fidelity"**.
> ⚠️ Its `robots.txt` explicitly says `Disallow: /api/`, so **do not call its API**; its footer declares that the past papers are copyrighted by CCF and for non-commercial teaching use only —— a commercial product cannot copy this model.

Acceptance:
- [ ] Selecting 25 questions → generates an A4 two-column paper PDF + quick answer key + analysis pages, within 10 seconds.
- [ ] The paper blueprint "functions 40% / sequences 30% / probability 30%, difficulty 3:5:2" can be satisfied and the actual distribution is reported.
- [ ] Regenerating a paper from the same batch of questions produces no duplicate questions.
- [ ] The question bank supports user self-import (with format instructions and validation errors), and **the imported past-paper source text never enters any server**.
- [ ] The Four-School Joint Exam syllabus and past papers can be pulled into the vault with one click (annotated with source and year).

### P9 · Calendar and Planning (1.5 weeks)

Features: FullCalendar month/week/day/agenda views (`timeGridWeek` as the class timetable), drag to reschedule, RRULE recurring schedules, countdowns (zhongkao/gaokao/Four-School Joint Exam/recommended admission/custom + lunar birthdays), **AI goal breakdown** (goal → milestone → weekly plan → daily task, output structured JSON then write into the vault), automatic rescheduling of overdue items, automatic insertion of FSRS review tasks, system notifications and daily briefings, and study heatmap and mastery radar (ECharts).

**Key implementation principles (from research #06)**:
- **AI only does content breakdown; capacity and date mapping are handed to local code**. The AI returns "what to learn, in what order, roughly how long"; date placement is done by the local scheduler —— otherwise the AI will inevitably produce unrealistic plans.
- **Six code-checkable hard constraints** (each must be verified after generation; if any fails, reschedule or regenerate): daily total ≤ 80% of available time; at least 1 buffer day every 7 days; chapter order indices non-decreasing; a single task ≤ 90 minutes; no tasks on days with no available time; **review tasks are not generated by the AI** (they all come from the FSRS queue).
- Each breakdown stores the prompt and output into `ai_plan_runs`, supporting rollback and comparison.

Acceptance:
- [ ] Entering "improve English grammar and math functions in 60 days, 90 minutes a day, rest on Sundays": it generates an editable three-level plan, and each item passes the 6 hard-constraint checks above (asserted by script).
- [ ] The top bar shows "N days until the Four-School Joint Exam", and "remaining learnable days" correctly deducts scheduled classes (test case: 4 of 10 calendar days are fully scheduled, so it should return 6 days, not 10).
- [ ] The daily briefing actually pops up at 07:00 (test the autostart + tray-timer path and the `schtasks /it` fallback path once each).
- [ ] When tasks are unfinished for 3 consecutive days, it suggests a reschedule that can be applied with one click.
- [ ] Pomodoro timer error ≤ 2 seconds; heatmap and radar data match the database (verified by script).

### P10 · Packaging, Installation and Iteration (1.5 weeks)

Features: electron-builder producing an NSIS installer, first-launch dependency check and guidance (DSH / Python / TeX / Pandoc), dependency installation to an optional `D:\` path, automatic updates, crash and logging, backup and restore (vault export as zip, separate backup of question bank and plans), and a privacy settings page (data flows, recording management, one-click wipe).

Acceptance:
- [ ] On a clean Windows 11 machine: after install it can launch, create a vault, edit and converse; it clearly prompts when TeX is missing.
- [ ] From double-clicking the installer to usable < 5 minutes (excluding large dependency downloads).
- [ ] Upgrading to a new version loses no data and does not modify the user's vault.
- [ ] One-click export of a full vault backup that can be restored on another machine.

### P11 · Possible Later Additions (not scheduled)

Avatar upgrade (Live2D/VRM + mouth-shape alignment), cloud sync and multi-machine (end-to-end encryption), family/class shared vaults, automatic wrong-answer classification and "similar-question recommendation", a cross-disciplinary knowledge graph, and a read-only mobile companion.

---

## 6. Milestone Overview

| Milestone | Phase | What you'll see then |
| --- | --- | --- |
| M0 **can create a vault** ✅ | P0 | Already: one command creates a vault, the Chinese retrieval index is in place, the license gate works, and the AI modifies in-vault files under control |
| M1 **can write** | P0–P1 | An Obsidian-like notebook that can edit Markdown, switch vaults, and use a command palette |
| M2 **can view** | P2 | PDF / Word / tables all viewable directly in the software, and clippable into notes |
| M3 **can connect** | P3 | The graph and wikilinks run, and Chinese search responds instantly |
| M4 **can ask** | P4 | Talk to the AI and it actually modifies files and produces documents, with the process visible and approvable |
| M5 **can export** | P5 | One click turns notes into a Chinese handout PDF / Word |
| M6 **can explain** | P6 | Explain a knowledge point to the avatar and get a score and a gap list |
| M7 **can look up** | P7 | The AI's answers carry "which book, which page"; if the textbook doesn't have it, it says so |
| M8 **can test** | P8 | Tick a few questions and a formal exam-paper PDF is generated automatically |
| M9 **can plan** | P9 | Throw a goal at the AI and it automatically produces daily plans and countdowns |
| M10 **can install** | P10 | It can be installed and used on someone else's computer |

**Suggested pace (effort corrected per the research)**

| Milestone group | Phase | Duration | Notes |
| --- | --- | --- | --- |
| **Gezhi can stand** | P0–P2 | about 3 weeks | Shell + editor + multi-format viewing (P1 taking the "source + split preview" shrunken tier) |
| **Gezhi can connect** | P3 | about 3 weeks | Graph + backlinks + search; **if Live Preview wasn't done in P1, it is counted here** |
| **Gezhi can ask and export** | P4–P5 | about 3 weeks | DSH dialogue + document production line |
| **Gezhi has a soul** | P6–P9 | about 9 weeks | Feynman voice / textbook base / question-bank paper generation / calendar planning |
| **Gezhi can install** | P10 | about 1.5 weeks | Packaging, dependency guidance, automatic updates |

Total about **19–20 weeks (≈ 5 months)**. The "7 weeks" written in the original plan was an underestimate — the entire underestimate comes from research #01 revealing that **Live Preview needs 2–4 person-months of in-house work**.

**It is suggested to first build M1–M5 (about 9 weeks) for real users (yourself + classmates) to try**, then decide the order of M6/M7/M8: the voice Feynman is the most impressive but the heaviest, the textbook base is the most useful but constrained by copyright, and question-bank paper generation shows results most easily.

---

## 7. Size and Performance Budget

| Item | Estimate | Strategy |
| --- | --- | --- |
| Electron app body | 180–250 MB | Can't be compressed; accept it |
| DSH runtime | Already present (the user has it installed) | **Reuse the system-installed DSH**; otherwise download as an optional component |
| Python runtime + libraries | 60–120 MB | Build an isolated environment with uv; install only the necessary libraries |
| LaTeX | **Prefer reusing the system MiKTeX (this machine already has 1.0 GB with ctex/exam-zh complete)**; if absent, guide installing TinyTeX | Don't unconditionally bundle 1 GB |
| Pandoc / Typst | 30–80 MB each | Download on first run as needed (**paper rendering switches to Typst**, see P8) |
| Textbooks + question bank | **Structured knowledge base 1.2–1.8 GB** (4–5 GB with thumbnails); source text 138.59 GB | Strictly layered, see below |
| Voice model (sherpa-onnx Chinese) | 50–300 MB | Download on demand, works offline (DSH's bundled one is only the 22.43 MB runtime, **no models**) |

**Data layering (from research #04, measurement-backed)**

| Layer | Content | Size | Delivery |
| --- | --- | --- | --- |
| **L0** | Program body + Typst + fonts + curriculum-standard/NOI knowledge tree | **≤ 150 MB** | With the installer |
| **L1** | Structured knowledge base (text + dual FTS indexes + knowledge-point graph; **no textbook source text**) | 1.2–5 GB | Downloaded on first run |
| **L2** | Structured products of a single textbook | A few MB per book | Downloaded on demand |
| **L3** | Textbook source text / past-paper source text | 138.59 GB (full) | **User self-imports, never enters a server** |
| **L4** | Commercially licensed content | — | Separately licensed |

Target: **installer ≤ 150–300 MB; usable within ≤ 5 minutes after first run (including TeX/Typst detection)**.

Performance red lines: editing a 5000-character document doesn't lag; opening a 300-page PDF < 1.5s; Chinese retrieval < 1s; graph with 5000 nodes ≥ 40fps; AI first byte < 3s; **paper generation (25 questions) ≤ 10s**.

---

## 8. Risk Register

| # | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| R1 | **Textbook copyright**: People's Education Press textbook source text cannot be distributed (measured: 1,742 PDFs totaling **138.59 GB**) | Legal risk | Only local import and self-service download via the official auth-free API + **self-built structured data**; don't bundle, don't redistribute; stated in the product. ⚠️ The redistribution boundary of "derived data (chunks/vectors/knowledge-point graphs)" is to be confirmed by legal |
| R2 | **Question-bank sources**: past papers mostly require paid licenses or explicitly prohibit scraping (XueKe.com's terms even count "making a scraping tool" as a violation) | Feature shrinkage + legal risk | Strict three-tier classification: 🟢 quotable (curriculum standards / OI Wiki / **Macao Four-School Joint Exam official free past papers** / NOI syllabus) 🟡 user self-import (Guangdong zhongkao/gaokao, HK-Macao-Taiwan JEE, CSP past papers) 🔴 don't touch (XueKe.com, Jyeoo.com); for a commercial question bank use the **dev.21cnjy.com open platform** |
| R2b | **Open-source license red lines**: PyMuPDF=AGPL, ezexam (Typst exam template)=AGPL, Nougat weights=CC-BY-NC-4.0, exam-zh unmaintained since 2024-04 | Closed-source distribution constrained | Establish a **dependency license allowlist**: PDF parsing via pdfplumber(MIT)/pypdf(BSD); exam templates **self-developed Typst template** (Typst itself Apache-2.0); structuring via docling(MIT)/PP-StructureV3(Apache-2.0)/RapidOCR(Apache-2.0); **AGPL and NC never enter the dependency tree** (this CI check must be built in P0) |
| R2c | **Reference projects cannot be copied for code** (research #01 verified the LICENSE texts): **tldraw has a custom commercial license that explicitly says "Not to use the Software in Production Environments"**; **Anytype = "Any Source Available License 1.0" (not OSI open source)**; **AFFiNE is licensed per directory** (backend/native are not under MIT); **Logseq / AppFlowy / Trilium / SiYuan = AGPL-3.0** (contagious for a potentially commercial desktop product); Dendron's last push was 2025-11-13, **treated as unmaintained** | Copying the wrong code drags the whole product into a license quagmire | For reference projects **copy only the design, not the code**; if reuse is truly necessary, pass the allowlist CI first and record source and license |
| R2d | **Live Preview is the bulk of the in-house workload** (decorations, wikilink atomization, autocomplete, **about 2–4 person-months**) | Serious P1 delay | P1 delivers in two tiers: first "source mode + split preview" to get a usable product, with Live Preview as a separate milestone after P3; if in a hurry, accept "not the Obsidian-level experience" |
| R3 | **DSH version drift** (currently 0.2.0-rc.2) | Integration breakage | Rely only on three stable surfaces (CLI / NDJSON events / profile patch); tolerant event parsing; startup self-check with a version prompt |
| R4 | **OCR quality of scans** | Dirty knowledge base | Do text-layer PDFs first; scans go through a separate queue + manual spot checks; mark `ocr_used` and confidence, and don't cite from low-confidence output |
| R5 | **Chinese FTS tokenization** (default tokenizer fails) | Retrieval entirely unusable | Already solved by measurement: trigram; add assertions in the vault-creation script to prevent regression |
| R6 | **Dependency size / install failure** | Users can't install | Layered dependencies: the core (Electron+DB) is mandatory, TeX/Pandoc/voice model on demand; each item has a "usable even without it" fallback |
| R7 | **Cost runaway** (long dialogues + whole-book indexing) | Money | Index with local rules + cheap models; dialogue uses a token-meter panel and budget alerts; cache and send only necessary fragments |
| R8 | **Student privacy and minors' data** | Compliance | Local-first by default; encrypted recordings + one-click deletion; cloud-bound content stated clearly; parental-consent flow. ⚠️ **Undecided**: whether Tencent Cloud retains customer audio and whether it can be deleted is **not yet verified** —— if not deletable, "one-click delete recordings" cannot truly be delivered; written confirmation is required before purchase |
| R9 | **API keys in plaintext** (existing risk) | Account theft | Revoke and rotate existing keys; switch to DPAPI/`safeStorage`; no keys in sample files or commits |
| R10 | **Scope runaway** | Never finished | Strictly follow M1→M10; every phase can stop and be demonstrated; P11 is not scheduled |
| R11 | **Chinese typesetting of AI-generated documents** | Ugly deliverables | Templates first (decide templates before P5), with a "reference-sample comparison" acceptance for each export type |
| R12 | **Unable to articulate originality in competition/defense** | Review risk | State clearly in the documentation: DSH is an MIT-licensed engine (reused); Gezhi's own work is the knowledge base / question-bank paper generation / Feynman scoring / calendar planning / voice practice / UI and data model |
| R13 | **Interaction between `[[` autocomplete and the Chinese input method** —— this is where Monaco failed (#2199), and it is Gezhi's most core editing experience | Autocomplete and IME fight over events, causing duplicate input or interrupted candidate words | ✅ **Verified and solved** (5/5 passing; see [`poc/ime/r13-conclusion-autocomplete-and-ime.md`](poc/ime/r13-conclusion-autocomplete-and-ime.md)). **Measurement found that CodeMirror's `autocompletion` still calls the completion source when `view.composing === true`** —— you must write `if (context.view?.composing) return null;` as the first line of every custom completion source. **This is promoted to a coding rule: for any new completion source, that check is its first line.** |

---

## 9. Decisions You Need to Make

| # | Decision | My recommendation | Alternative |
| --- | --- | --- | --- |
| D1 | Desktop shell | **Electron** (mature ecosystem, fits PDF.js/editor/graph) | Tauri (small size but high integration cost) |
| D2 | UI language | **Chinese UI + key terms listed in both Chinese and English** | All-Chinese / all-English (all-English materials needed if submitted for a competition) |
| D3 | Default vault location | `D:\Users\LINKIT\Documents\Gezhi\` (changeable) | Put the vault in the project directory on D: |
| D4 | First user | **Yourself (Grade 11, AI/physics/English/CSP)** | Oriented toward teacher lesson-prep |
| D5 | Priority | **M1–M5 first (can write, view, ask, export)**, then M6 voice Feynman | Do question-bank paper generation first |
| D6 | How DSH is depended on | **Reuse the system-installed DSH** | Ship a standalone runtime with Gezhi |
| D7 | Textbook acquisition | Official free e-textbooks + local import | Local import only |
| D8 | Whether to open source | Start as a private repo, open data formats (readable Markdown + SQLite) | Open source directly |

---

## 10. The First Immediate Actions (P0 Task List)

1. Create the repo: `git init`, with directory skeleton `apps/desktop`, `packages/core`, `packages/dsh-bridge`, `packages/db`, `templates/`, `scripts/`, `docs/`.
2. Write `packages/db/schema.sql` (all §4.2 tables) + the vault-creation script + **trigram assertion tests**.
3. Write `packages/dsh-bridge`: `spawnDsh({task, sessionId, cwd})` returning an async event stream; unit tests run once with the real `dsh headless --json`.
4. Start the Electron shell + three-column layout + vault selector.
5. Clear the to-verify items in [`docs/00-environment-survey.md`](docs/00-environment-survey.md) one by one (`better-sqlite3`, `sqlite-vec`, Tencent Cloud account).
6. Revoke and rotate plaintext API keys, and wire in `safeStorage`.
7. Two one-line commands to clear uncertainties: `node -e "console.log(require('@fullcalendar/core/locales/zh-cn'))"` (confirm whether FullCalendar 7 bundles the simplified-Chinese locale), `node -e "console.log(require('node:sqlite').DatabaseSync ? 'ok' : 'no')"` (confirm SQLite ≥ 3.51.3 to avoid the WAL-reset vulnerability).

---

## Appendix · Document Index

| File | Content |
| --- | --- |
| [`docs/00-environment-survey.md`](docs/00-environment-survey.md) | This machine's toolchain, existing materials and engineering constraints (measured) |
| [`docs/01-intelligence-layer-dsh-as-agent-core.md`](docs/01-intelligence-layer-dsh-as-agent-core.md) | Why and how to use DSH as the Agent kernel (including measured event streams) |
| [`docs/02-storage-and-retrieval-measurements.md`](docs/02-storage-and-retrieval-measurements.md) | Measured conclusions on `node:sqlite` / FTS5 / Chinese tokenization |
| [`docs/03-dsh-integration-writing-assistant.md`](docs/03-dsh-integration-writing-assistant.md) | Measured results of DSH reading/writing the Vault under control (tool-call events, diff material, encoding pitfalls) |
| `docs/templates/dsh-headless-profile.dump.yml` | Complete plugin tree of the DSH headless profile (379 lines, measured export) |
| `docs/templates/dsh-headless-events.sample.ndjson` | Sample DSH headless event stream |
| `docs/templates/_probe_node_sqlite.cjs`, `_probe_fts_cjk.cjs` | Re-runnable storage probes |
| [`research/01-editor-and-graph-research.md`](research/01-editor-and-graph-research.md) | Editor-kernel IME evidence chain, graph-engine comparison, Obsidian interaction teardown, Vault path and 6 JSON samples, license red flags, layout/command-palette selection (**completed, 1083 lines**) |
| [`research/01b-editor-and-graph-core-benchmark.md`](research/01b-editor-and-graph-core-benchmark.md) | **On-machine install measurements** of CodeMirror 6 / sigma / graphology / KaTeX and the pitfall that sigma cannot load in the main process (**completed**) |
| [`research/02-document-engine-and-packaging-research.md`](research/02-document-engine-and-packaging-research.md) | PDF/docx kernels, the three export pipelines, dependency packaging strategy, desktop-shell trade-offs (**completed**) |
| `research/03-AI-Agent集成调研.md` | Agent orchestration, DeepSeek integration, MCP, security (mostly already covered by docs/01) |
| [`research/04-textbook-and-question-bank-sources.md`](research/04-textbook-and-question-bank-sources.md) | Textbook sources and legality, measured scale of the auth-free API, OCR/layout-analysis/dual-index pipeline, three-tier question sources, paper generation and export, storage layering, field-level schema (**completed, 1369 lines / 116 measured URLs**) |
| [`research/05-avatars-and-feynman-scoring-research.md`](research/05-avatars-and-feynman-scoring-research.md) | Feynman rubric / JSON Schema / gap diagnosis, measured Tencent Cloud ASR-TTS parameters, four GIF avatar plans, latency budget, privacy compliance (**completed, 1011 lines**) |
| `research/06-calendar-and-planning-research.md` | Calendar-library selection (FullCalendar MIT boundary), planning data model, AI breakdown schema, dual reminder paths, ECharts (**completed, 896 lines**) |
| [`competition-charter-summary-macau-secondary-2026.md`](competition-charter-summary-macau-secondary-2026.md) | Competition charter summary (reusable if entering the competition with this work) |

**PoC (runnable code)**

| File | Content |
| --- | --- |
| [`poc/ime/test-conclusions.md`](poc/ime/test-conclusions.md) | **Chinese IME automated test conclusions (8/8 passing)** —— including an honest boundary note on "what was measured / what wasn't", and 4 pitfalls I hit myself along the way |
| [`poc/ime/test-checklist.md`](poc/ime/test-checklist.md) | Human hand-test checklist (15–20 minutes, 6 test groups, including the "disable decorations and test again" control experiment) |
| [`poc/ime/cdp_ime_final.py`](poc/ime/cdp_ime_final.py) | CDP IME automated test (final version, directly convertible into a CI regression) |
| [`poc/ime/cdp_undo_test2.py`](poc/ime/cdp_undo_test2.py) | Undo-granularity targeted test |
| [`poc/ime/src/main.js`](poc/ime/src/main.js) | Minimal implementation of CodeMirror 6 + Live Preview decorations + 6 automated checks |
| [`poc/ime/start-poc.ps1`](poc/ime/start-poc.ps1) | One-click startup (install deps → start the server → open Chrome) |
