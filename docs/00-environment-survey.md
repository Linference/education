# Gezhi · Local Environment Survey Report (P0 Baseline)

> Generated: the day of the survey (measured within the session)
> Note: This document records only **facts that were actually measured**, to help the development plan with technology selection and size budgets. Anything not measured is marked "unverified".

## 1. Hardware and System

| Item | Measured value |
| --- | --- |
| Operating system | Windows 11 Home, Chinese edition, 10.0.26200, 64-bit |
| System drive C: | 244.4 GB used, **55.6 GB free** (tight; do not put installers and dependencies on C: by default) |
| Data drive D: | 213.9 GB used, **409.9 GB free** (projects, libraries, models and dependencies should all go on D:) |

## 2. Installed Toolchain

| Tool | Path | Version |
| --- | --- | --- |
| Node.js | `C:\Program Files\nodejs\node.exe` | v24.18.1 |
| npm | `C:\Program Files\nodejs\npm.ps1` | bundled with Node |
| pnpm | `C:\Users\LINKIT\AppData\Roaming\npm\pnpm.ps1` | installed |
| Python | `C:\Users\LINKIT\AppData\Local\Programs\Python\Python311\python.exe` | 3.11.9 (directory 10.99 GB) |
| uv | `C:\Users\LINKIT\.local\bin\uv.exe` | installed (very useful for isolating Python dependencies) |
| Git | `C:\Program Files\Git\cmd\git.exe` | 2.55.0.windows.3 |
| Rust | `C:\Users\LINKIT\.cargo\bin\cargo.exe` / `rustc.exe` | installed (the Tauri route is viable) |
| .NET | `C:\Program Files\dotnet\dotnet.exe` | installed |
| VS Code | `code.cmd` | installed |
| opencode | `C:\Users\LINKIT\AppData\Roaming\npm\opencode.ps1` | installed (`opencode serve` available) |
| Obsidian | desktop shortcut installed, Vault at `D:\Users\LINKIT\Documents\Obsidian Vault` | empty vault (only "Welcome.md") |
| LaTeX | `D:\MiKTeX\miktex\bin\x64\` (xelatex / pdflatex / lualatex / kpsewhich / mpm) | MiKTeX, whole directory about **1.0 GB** |
| pdftoppm | `D:\MiKTeX\miktex\bin\x64\pdftoppm.exe` | poppler, usable for PDF-to-image conversion and rendering verification |
| pandoc | **not installed** | — |
| typst | **not installed** | — |
| tesseract / magick / soffice | **not installed** | — |

### MiKTeX Chinese and paper-generation capability (measured with kpsewhich)

Installed: `ctex.sty`, `xeCJK.sty`, `exam.cls`, **`exam-zh.cls`**, `unicode-math.sty`, `geometry.sty`, `tikz.sty`
Not installed: `fandol-fonts` (one of the default Chinese font packages; its absence is not fatal, system fonts `SimSun`/`Noto Serif CJK` can be used instead)

> Conclusion: **this machine already has the LaTeX capability for "Chinese exam papers + mathematical formulas"**. `exam-zh` is precisely the document class specialized for domestic exam-paper typesetting; R&D on paper generation and PDF export can land directly without waiting for the packaging work to finish.

## 3. Reusable Existing Assets (important: avoid reinventing the wheel)

### 1. Predecessor: AI learning assistant (competition project) `D:\Users\LINKIT\Desktop\全球青少年人工智能創新大賽`

Reusable code and design already exist:

- `app\server\src\opencode.js` (318 lines): **already implements managing `opencode serve` as a subprocess + an HTTP client + an SSE event stream**, including `ensureServer()`, `createSession()`, `sendMessage()`, `listMessages()`, `addMcpServer()`, `resolveModel()`. This is the ready-made skeleton for an "embedded AI Agent".
- `app\mcp-kb\`: an **MCP server** is already set up (`@modelcontextprotocol/sdk ^1.30.1`) hosting the knowledge base.
- `app\web\package.json` has already chosen the frontend dependencies: React 19, Vite, `pdfjs-dist`, `mammoth`, `docx-preview`, `markdown-it`, `katex`, `highlight.js`.
- `app\server\package.json` has already chosen the server dependencies: `docx` (Word generation), `express`, `puppeteer-core`, `zod`.
- `docs\01-architecture.md`, `02-product-architecture.md`, `03-plan.md`, `04-innovation-design.md`: already contain product design and the core proposition of "mandatory citation + sentence-by-sentence verification".
- `docs\03-plan.md` explicitly records: **opencode engine + DeepSeek API + local SQLite (FTS5) retrieval**, and has already fixed the data flow as "textbook segmentation → retrieval → generation → sentence-by-sentence verification → export md/docx/pdf → embedded preview".

> The Gezhi project should **absorb** this skeleton (especially `opencode.js` and the file pipeline), rather than start from zero.

### 2. Configured model channels `C:\Users\LINKIT\.config\opencode\opencode.json`

- `deepseek` provider: `@ai-sdk/openai-compatible`, `baseURL = https://api.deepseek.com/v1`, configured model names `deepseek-v4-flash`, `deepseek-v4-pro`.
- `zhipu` provider: `glm-4v-flash` (vision model, can serve as a fallback for OCR/image understanding).
- Registered MCP: `blender`, `playwright`, `zhipu-vision` (local Python scripts).

> ⚠️ **Security warning**: this configuration stores the DeepSeek and Zhipu API Keys in plaintext, and **the same Key has also been copied into the competition project's `docs\opencode-config-sample.json`**. Please go to both consoles as soon as possible to **revoke and regenerate** them, store the new Keys encrypted with Windows DPAPI / `safeStorage`, and never let plaintext Keys appear in any `*-sample`/example file, git commit or research report. Gezhi's configuration layer must have a built-in warning for "suspected plaintext Key detected".

### 3. Raw source material for the question bank and knowledge base (already owned by the user)

| Location | Content | Value to Gezhi |
| --- | --- | --- |
| `D:\Users\LINKIT\Desktop\csp\` | 22 files: CSP knowledge-topic PDFs (computer overview, number systems, encoding, networks, sorting, graphs, linked lists, stacks and queues…) + CSP-J/S 2019–2024 preliminary round questions and answer explanations PDF | The first batch of corpus for the informatics question bank and knowledge points, including **answers and explanations**, ready to enter the question bank |
| `D:\Users\LINKIT\Documents\csp-s\` | `CSP-S-提高级-知识清单.md`, `CSP-S知识点地图.md` + `知识点\01..05` (fundamentals/C++/data structures/algorithms/mathematics), dozens of md files in total | A **ready-made knowledge-point graph skeleton** (with hierarchical classification), can be imported directly into the knowledge_points table |
| `D:\Users\LINKIT\Desktop\物理竞赛\` | `高中物理\` 15 chapters of "knowledge extension" doc (mechanics → atomic physics, single files 3–11 MB) + `历屆賽題\應用賽題庫\` (including 2022/2023 Macau Form 4/5/6 applied physics competition papers) + olympiad methods, general physics | High-school physics knowledge base + source of local Macau competition questions; doc files need conversion to docx/md |
| `D:\Users\LINKIT\Desktop\人工智能\` | `高中(試用)_v2 (1).pdf` (29 MB, high-school AI textbook), 9 classroom assignment PDFs/ipynb, `前饋神經網路_作業詳解.md` | Self-owned textbook and assignment-grading corpus for the "artificial intelligence" subject; **verified: both PDF and ipynb are ingested into the knowledge base** |
| `D:\Users\LINKIT\Documents\English grammer\` | English grammar material (the "modal verb grammar questions" in the screenshot come from this system) | Landing point for the English subject question bank and notes |
| `D:\Users\LINKIT\Desktop\计划安排表\panda-plan\` | Web-based planner built with Drizzle + SQLite (table `planner`, fields id/body/version/updated_at) | The calendar/planning module can reference its schema approach (but the functionality is far from sufficient; it needs to be redone) |

> Measured conclusion: **the PEP (People's Education Press) textbook PDFs do not yet exist on this machine** (a full-disk search for "PEP/compulsory/elective/textbook/zhongkao/gaokao/joint exam" matched only physics competition and local Macau competition papers). Textbook collection is work that starts from zero in the P7 stage, and copyright and sourcing issues must be resolved first.

## 4. Six Engineering Constraints Derived from the Environment

1. **Do not install large dependencies on the C: drive**: only 55.6 GB remains on C:. Plan the Python runtime, LaTeX, models, textbook vault and question bank all under `D:\Gezhi\` (or `格致\` under the user's Documents directory).
2. **Do not repackage LaTeX**: this machine already has 1.0 GB of MiKTeX with a complete set of Chinese macro packages. Gezhi's strategy should be "prefer reusing the system's existing TeX; only when it is not detected, guide the user to install TinyTeX/MiKTeX portable", not unconditionally bundling a 1 GB TeX.
3. **Reuse the competition project where possible**: the process management + SSE event stream of `opencode.js`, and the file-pipeline dependencies (docx / pdfjs / mammoth / docx-preview / katex / markdown-it) have already been selected once; Gezhi takes them over and upgrades them directly.
4. **The reality of PDF processing**: `pdftoppm` is available on this machine, `pdfium` is unverified. Many of the textbooks/handouts in the screenshots are **traditional-Chinese scans** (e.g., CSP papers, Macau charters), so "scanned-document OCR + layout restoration" is not optional but a branch that must be designed.
5. **Chinese typesetting must go through XeLaTeX**: `ctex`/`xeCJK`/`exam-zh` are in place; the pdflatex route cannot handle Chinese, so the export pipeline defaults to `xelatex`.
6. **Model calls go through the OpenAI-compatible layer**: DeepSeek and Zhipu are both `openai-compatible`; Gezhi needs only one compatible client to connect to both, facilitating cost tiering of "cheap model for summaries / strong model for reasoning".

## 5. To-Do and Unverified Items

- [ ] Unverified: whether `better-sqlite3` has a prebuilt binary for Node 24 on this machine (if not, it will be forced to switch to `node:sqlite` or `libsql`).
- [ ] Unverified: the availability of `pdfium` / `sqlite-vec` / `lancedb` on the Node 24 + Windows combination.
- [ ] Unverified: whether the Tencent Cloud ASR/TTS account has been activated, along with quota and billing.
- [ ] Unverified: the accessibility and download method of electronic textbooks on the National Smart Education Platform for Primary and Secondary Schools (requires login; to be measured separately).
- [ ] To handle: revoke and rotate the two plaintext API Keys mentioned above.
- [ ] To confirm: Gezhi's default "documents" vault location (suggested `D:\Users\LINKIT\Documents\格致\`, with multiple vaults side by side).
