# Gezhi · Optimization Backlog (Handover Document)

> Purpose: when handing the project to the next maintainer (human or AI), state **what needs changing, why, and how to verify it**.
> Written 2026-10-02, corresponding to commit `cbf4023`.
>
> Every item carries **evidence** (file paths / measured data); none is written from impression. Anything I did not verify is explicitly marked "unverified".

---

## 0. How to run it (read this first)

```bash
# Repository root
node scripts/verify-all.mjs          # Full regression (29 suites)
node scripts/build-installer.mjs     # Build the installer (about 10–20 minutes)
node scripts/scan-secrets.mjs        # Credential-leak scan (the pre-commit hook runs this)
node scripts/check-licenses.mjs      # Dependency licence gate
node scripts/progress-audit.mjs      # Phase progress audit ← ⚠️ broken, see P0-1
```

Development-mode launch: under `apps/desktop`, run `npx vite build`, then
`node_modules/electron/dist/electron.exe . "D:\path\to\vault"`.

**Architecture in one sentence**: Electron (main process `.cjs` + React/TS renderer) + DSH as the AI kernel +
SQLite (index / calendar / question bank) + Typst for PDF export + LibreOffice for high-fidelity Office viewing.

**The main process must be CommonJS (`.cjs`)** — this is a pitfall we already hit; do not convert it to ESM.

---

## P0 · Correctness issues (fix these first, otherwise nothing else is trustworthy)

### P0-1 The progress-audit script is broken; half of its "not done" reports are false

`scripts/progress-audit.mjs` decides whether something is implemented by looking for **specific file names**, but the actual implementation uses different file names from the design document:

| What the script looks for | Actual file | Result |
|---|---|---|
| `components/VoicePanel.tsx` | `AvatarConsole.tsx` + `useMicRecorder.ts` | Falsely reports "not wired to UI" |
| `components/Avatar.tsx` | `AvatarStage.tsx` | Falsely reports "not implemented" |
| `components/QuestionBank.tsx` | `BankView.tsx` | Falsely reports "not implemented" |
| `packages/paper` | `main/lib/bank.cjs` + `BankView.tsx` | Falsely reports "not implemented" |
| `components/Calendar.tsx` | `CalendarPanel.tsx` | Falsely reports "not implemented" |
| `buildPaper` in `index.cjs` | `buildPaperMarkdown` in `BankView.tsx` | Falsely reports "not implemented" |

**Impact**: the audit reports `53/64 present`, but the real figure is about `59/64`. The next maintainer will be misled into redoing work that is already finished.

**How to fix**: do not tie the conditions to file names; use **behavioural assertions** instead — for example, "can it export a paper PDF" should run an export and inspect the artifact, not check whether a file exists. The 29 existing `verify-*.mjs` suites can be reused directly (have the audit script call them).

---

### P0-2 Graph layout is computed synchronously on the main thread; many nodes freeze the UI

`computeLayout()` in `apps/desktop/renderer/src/components/GraphView.tsx`:

- **300 iterations**, each doing **O(n²) pairwise repulsion**
- All of it runs **synchronously on the main thread** (called directly inside a `useEffect`)
- Node limit is 400 (truncated by `maxNodes` in the main-process `indexer.cjs`)

**Measured**: a 13-node forest vault feels instant. But at 400 nodes, one round of pairwise work is ~80,000 computations × 300 rounds = 24 million, which will visibly block the main thread (**the exact 400-node timing is unverified and must be measured first**).

**How to fix** (inspired by [obsidian-fast-graph](https://github.com/jkRaccoon/obsidian-fast-graph)):
1. Move the layout into a **Web Worker** (that project explicitly says "physics runs in a worker, so heavy ticks don't block the UI")
2. Replace pairwise repulsion with a **Barnes-Hut octree**, reducing O(n²) to O(n log n)
3. Add **alpha decay**: stop iterating once converged, bringing CPU to zero (the current fixed 300-iteration stop is already correct in this respect)

---

### P0-3 The viseme formula has two implementations kept in sync by comments alone (no test guarantee)

- `buildVisemeTrack()` in `packages/voice/src/index.mjs`
- `buildVisemeTrackFromTimings()` / `buildLocalVisemeTrack()` in `apps/desktop/renderer/src/components/viseme.ts`

The two implement **the same formula** (`open = max(0.25, sin(π × progress))`), because `packages/voice` is pure ESM and bundles the Tencent Cloud SDK, so the renderer does not import it.

**Risk**: change one and forget the other → the local estimate and the cloud timestamp-driven visemes look different (the same character animates fast in one and slow in the other), and **no test fails**.

**How to fix** (pick one):
- Extract a shared pure-JS module imported by both (recommended)
- Or add a cross-assertion test: feed the same timings to both and compare the `open` value frame by frame

---

### P0-4 Window size may be wrong at high DPI (unverified; needs real hardware)

`createWindow()` in `apps/desktop/main/index.cjs` computes the window size from
`screen.getPrimaryDisplay().workAreaSize`. Measured on the local machine:

```
bounds(DIP)      : {"width":1440,"height":900}
workAreaSize(DIP): {"width":1440,"height":852}
scaleFactor      : 2
size(physical)   : {"width":1440,"height":900}   ← contradicts workAreaSize × scaleFactor = 2880
```

`workAreaSize` is in DIP and `size` is in physical pixels; they do not agree under `scaleFactor=2` —
meaning this machine's display reports self-contradictory values (possibly a remote-desktop or virtual-display quirk).

**Current code**: `width = min(1440, wa.width)` → 1440 DIP.
If `scaleFactor` really is 2, the physical width is 2880, which would be **twice as wide** as a 1440 screen. A user previously reported "the right sidebar is not visible" (later said it was fine); **this has never been settled**.

**How to fix**: test on real machines at different scaling factors (100% / 125% / 150% / 200%), confirming the window does not exceed the screen and the right sidebar is visible. Do not rely on the local machine alone.

---

## P1 · Features promised by the design docs but not yet built

### P1-1 Textbook ingestion (P7, the largest effort)

- The data model **already exists**: `books` / `chapters` / `pages` in `packages/db/schema.sql`
- **Missing**: the textbook PDF ingestion pipeline (not implemented), and OCR for PDFs without a text layer (not implemented)

**The real difficulty is not writing code but deciding "where the content comes from"** — until the acquisition route for PEP textbook PDFs is settled (official source? scanning? licensing?), whatever is built will be an empty shell. **Confirm the source with the user before starting.**

### P1-2 Auto-update

Not done at all. electron-builder has `electron-updater`, but it needs:
- A place to host the installer (GitHub Releases or self-hosted)
- Version comparison and incremental-download logic
- A user-facing prompt

### P1-3 "Save AI output as a new file" (a P4 starred item)

The Markdown/PDF that the AI generates in a conversation can currently only be copied manually by the user.
The design document requires one-click saving as a new file in the vault.

### P1-4 Capability gaps in the question bank

Implemented: Markdown import, filtering by source / knowledge point / difficulty / question type, paper generation → export a PDF folder.

**Missing**:
- **No way to manually add/edit a single question in the UI** (you must write Markdown first and import it)
- No **paper templates** (question-count ratios, mark allocation, answer sheet)
- Knowledge points are matched against a JSON string with `LIKE '%kp%'` (`listQuestions` in `main/lib/bank.cjs`) — once there are tens of thousands of questions this must be split into a relational table

### P1-5 Two voice paths untested

Present in `packages/voice` but **never verified**:
- Tencent Cloud **asynchronous recording-file recognition** (>60-second long explanations; the current one-shot recognition has a hard 60-second cap)
- **WebSocket real-time recognition** (transcribing while speaking)

The Feynman explanation console currently works around the 60-second limit by recording in several segments (`AUTO_STOP_MS = 55000` in `useMicRecorder.ts`). It works, but the experience is disjointed.

---

## P2 · Distribution and security

### P2-1 [Biggest gap] DSH is not in the installer

Gezhi's AI is driven by **DeepSeek Harness**, and **the installer does not include it**
(`settings:dshStatus` in `apps/desktop/main/settings-ipc.cjs` probes for a system-installed DSH).

**Consequence**: if someone installs Gezhi without DSH, **the AI is completely empty**.
The UI already explains this on the settings page (a fallback exists), but it is a hard gap in distribution.

**Options**: bundle DSH / guide installation on first launch / state it explicitly in the installation instructions.

### P2-2 No code signing

Windows shows "Unknown publisher" during installation. Removing this requires buying a certificate (a few hundred to a few thousand yuan per year).
`build-installer.mjs` has disabled signature probing (probing hangs when no certificate is present).

### P2-3 The installer is 405 MB

Mostly the bundled LibreOffice (1014 MB / 9113 files, about 200 MB compressed).
A **lite edition** (~150 MB) is possible, at the cost of PPT/PPTX showing text only, without layout.

### P2-4 Credentials: passphrase mode has no unlock UI

`packages/core/src/credentials.mjs` supports two modes:
- **DPAPI** (default): bound to the Windows account, usable at login — this is the path currently used
- **passphrase**: scrypt + AES-256-GCM, master password never touches disk — stronger, but **has no unlock UI**

The settings page can set a master password for the first time, but after a restart **there is nowhere to enter it to unlock**, so the mode is effectively unusable for now.
`settings:credStatus` returns `locked: true` in passphrase mode, and the UI only shows a message.

### P2-5 ⚠️ Tencent Cloud keys once appeared in plaintext in the conversation

On 2026-10-01 the user sent the SecretId / SecretKey directly in the conversation.
They are now stored in `%APPDATA%\gezhi\credentials.enc` and verified working,
but **rotating them once in the Tencent Cloud console is recommended**. After rotating, re-enter them on the settings page.

---

## P3 · Performance and scale

| Location | Current state | When it becomes a problem |
|---|---|---|
| `main/indexer.cjs` | Full index rebuild, no incremental mode | A large vault is fully rescanned on every open |
| `main/lib/xlsx.cjs` | Reads the whole file into memory | Large sheets consume memory (capped at 20,000 rows × 200 columns returned) |
| `components/PdfViewer.tsx` | Loads the whole PDF | PDFs with hundreds of pages |
| `components/GraphView.tsx` | 400-node cap, truncates and warns | A large vault can only be viewed partially |
| `main/lib/bank.cjs` | Knowledge points matched with LIKE against JSON | Tens of thousands of questions |

---

## P4 · Test quality

- **29 `verify-*.mjs` suites**, of which **43 places use a fixed `waitForTimeout(≥1000)`** —
  this is **the main source of flaky failures**. Across these rounds I fixed at least 5 such false failures
  (cold start slower than first start, asynchronous loading not waited for long enough).
  **Recommendation**: replace all of them with "explicitly wait until a condition holds"; do not wait a fixed time.
- `scripts/verify-all.mjs` **opens 20+ real windows** (each UI test launches Electron once),
  so it keeps popping windows and interrupting the user. Add `--headless` or reuse a single instance serially.
- **There is no end-to-end test of the packaged app** — only development mode is tested.
  `verify-packaged.mjs` exists but is not included in `verify-all.mjs`.
- `verify-settings.mjs` **writes to and clears the credential store**. It already backs up real credentials first and restores them afterwards;
  a more robust approach is to give it an isolated storage directory (override `appDataDir()` via an environment variable).

---

## P5 · Code quality

- `apps/desktop/renderer/src/App.tsx` is **1732 lines** — it should be split (layout / toolbar / tabs / context menu)
- `components/GraphView.tsx` is 540 lines — the layout algorithm can be extracted into its own file (it will move to a Worker later)
- Some comments no longer match reality (historical leftovers); clean them up when touching the code
- **Missing an architecture overview for the next maintainer**: right now there is only `gezhi-development-plan.md` (71 KB, a plan rather than the current state)
  and seven `docs/*.md` measurement notes. A newcomer needs a long time to get up to speed.

---

## Appendix: not bugs, but real constraints (do not "fix" these)

1. **No pure-JS rendering library exists for `.doc` / `.ppt` (97-2003 binary)** —
   even VS Code's Office Viewer extension does not support them.
   Current approach: `.doc` extracts text; `.ppt` is converted to PDF via LibreOffice.
2. **CSV / XLSX are not converted to PDF** (an explicit user requirement) — for tables the user wants to read data, not a static image.
   Only slides are converted to PDF (complex layout, so PDF is right).
3. **Generated artifacts must not contain "Gezhi"** (a hard product rule) — papers, PDFs and Word documents must not carry product branding.
4. **Do not split science/humanities** (a hard product rule).
5. **Knowledge points must be detailed** (a hard product rule).
6. **The user chooses the format** (PDF / Word / Markdown; a hard product rule).
7. **Chinese full-text search must use `tokenize='trigram'`** — `unicode61` always returns 0 rows for Chinese (measured).
8. **Do not use the Noto SC variable font with Typst** (it crashes); use DengXian / Microsoft YaHei.
9. **Do not use `--print-to-pdf-no-header` for PDF generation** (it has no effect in current Chrome);
   use CSS `@page { margin: 0 }` + body padding instead.
10. **Do not delete `share/config` when trimming LibreOffice** — deleting it makes conversion **fail silently**
    (reports "source file could not be loaded" but exits with code 0).
