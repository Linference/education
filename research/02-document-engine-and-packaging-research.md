# Gezhi · Document Engine and Packaging Research (02)

> Goal: select the kernels for **PDF viewing / PDF generation / Word reading and writing / Markdown export** for Gezhi, and decide how heavy dependencies such as "Python, LaTeX, Pandoc" are delivered with the application.
> Marker conventions: `[Measured]` = ran on this machine; `[Fact]` = has a verifiable source; `[Inference]` = engineering judgment; `[Unverified]` = needs self-check before implementation.

---

## 1. Conclusion at a glance

| Layer | Selection | Key rationale |
| --- | --- | --- |
| PDF viewing | **pdfjs-dist** (Mozilla, Apache-2.0) | Pure frontend, no server, fits Electron/React; the text layer can be used for retrieval and citation anchors |
| PDF generation (exam papers/handouts) | **XeLaTeX** (this machine already has MiKTeX + `ctex`/`xeCJK`/`exam-zh`) | The only "get it right the first time" route for Chinese + math formulas + exam layout `[Measured]` |
| PDF generation (fast / no-TeX fallback) | **Chromium printing HTML** (Electron's built-in `webContents.printToPDF`) | Zero extra dependencies, controllable styling, suitable for light layout such as "note export" |
| Word generation | **python-docx** (via DSH's office-skills); JS-side fallback uses `docx` | More mature control over headers/footers, table of contents, and Chinese fonts; DSH already has this capability built in |
| Word viewing | **docx-preview** (high-fidelity preview) + **mammoth** (convert to HTML/text for indexing) | Read-only preview is enough; **do not** do real .docx editing (which would require an ONLYOFFICE-class component) |
| Dependency delivery | **Layered**: core built in / TeX and Pandoc prefer reusing the system / textbooks and question banks downloaded on demand | This machine's C drive has only 55.6 GB left `[Measured]`; bundling everything is impossible |

---

## 2. PDF viewing

| Option | License | Notes |
| --- | --- | --- |
| **pdfjs-dist** | Apache-2.0 | The de facto standard. Canvas rendering + text layer, supports streaming load of large files, zoom, and search. Gezhi uses it to implement "jump directly to the cited `page=42`" |
| pdfium (`pdfium-binaries` / EmbedPDF) | BSD-3 (PDFium) / varies | Faster rendering and more complete annotation and form capabilities, but requires native binaries and Electron ABI handling. **Not used for now**; treat as a performance upgrade after P2 |
| MuPDF / mupdf.js | **AGPL-3.0** (or commercial license) | Powerful, but the license does not permit closed-source distribution → **excluded** |
| **PyMuPDF** (`fitz`) | **AGPL-3.0 / Artifex commercial dual license** `[Fact]` | Rendering and extraction are both excellent, but **a closed-source product must either buy a license or not use it** → Gezhi instead uses `pdfplumber` (MIT) / `pypdf` (BSD); available only in "user-built scripts" |
| PSPDFKit / Apryse | Commercial | Excluded |

`[Fact]` For the positioning difference between PDF.js and PDFium (the former is pure JS and easy to embed in the web, the latter has better native performance), see [PDFium vs PDF.js comparison](https://www.react-pdf-kit.dev/blog/pdfium-vs-pdfjs-react-rendering-engine).

**Gezhi key point**: the PDF viewer must expose "the current page number" and "the text selection position", because **the anchor for textbook citations is the page number** (P7's citations depend mandatorily on it).

---

## 3. PDF generation: three pipelines

| Pipeline | Chinese | Formulas | Layout control | Size/dependencies | Positioning |
| --- | --- | --- | --- | --- | --- |
| **① Markdown → Typst → PDF** | Good | Good | Strong (self-built exam template; Typst itself is Apache-2.0) | About 30 MB for a single file | **Exam papers, handouts (P8 switches to this as the main one)** |
| ② Markdown → XeLaTeX → PDF | Good (`ctex`) | Good (native) | Strongest (`exam-zh`) | Requires TeX (already on this machine) | **Alternative**: only when the user's system already has TeX; `[Fact]` `exam-zh` has been unmaintained since 2024-04-26 and is not used as a product dependency |
| ③ Markdown → HTML → Chromium `printToPDF` | Good (uses system fonts) | Good (KaTeX) | Medium (CSS pagination) | Zero extra dependencies | **Note export, quick preview** |

> ⚠️ **License red line**: `ezexam` (a Typst exam template) is **AGPL-3.0** and **cannot be bundled into a closed-source product**; only its layout design may be referenced. The `Nougat` model weights are **CC-BY-NC-4.0** and unavailable for commercial use. See [`04-textbook-and-question-bank-sources.md`](04-textbook-and-question-bank-sources.md).

`[Measured]` `kpsewhich` on this machine confirmed installed: `ctex.sty`, `xeCJK.sty`, `exam.cls`, **`exam-zh.cls`**, `unicode-math.sty`, `geometry.sty`, `tikz.sty`; `fandol-fonts` is **not installed** (system fonts such as `SimSun` / `Noto Serif CJK` can be used instead).
`[Measured]` Therefore **the pdflatex route cannot handle Chinese; XeLaTeX is mandatory** (or LuaLaTeX).

**Four pitfalls of Chinese typesetting (engineering notes)**
1. **Font embedding**: when XeLaTeX uses system fonts, the PDF embeds a subset, keeping size under control; using `fandol` requires ensuring the package exists.
2. **Line breaking and punctuation**: `ctex` already enables punctuation compression and CJK/Latin spacing by default; do not modify `\XeTeXlinebreaklocale` yourself.
3. **Code blocks**: use `listings` or `minted` (minted requires Python + Pygments, which lengthens the dependency chain → `listings` + custom style is recommended).
4. **Table of contents and page numbers**: exam papers usually do not need a TOC but do need page numbers; handouts need both — separate templates are less trouble.

---

## 4. Word (.docx)

| Task | Option | Notes |
| --- | --- | --- |
| **Generate docx** | **python-docx** (preferred) / JS `docx` (fallback) | Supports styles, headers/footers, sections, tables, and images; for Chinese you only need to set the font name and `w:eastAsia` |
| Read / convert to text for indexing | **mammoth** (JS) / `python-docx` | mammoth converts to HTML while preserving heading levels, making it best suited for knowledge-base chunking |
| Read-only preview | **docx-preview** | Renders docx with high fidelity in the browser; good enough |
| Real .docx editing | ONLYOFFICE Docs / Collabora | Requires a separate service (Docker or a local server) + license evaluation → **not in v1**. The product should state clearly: "Word is read-only preview; to edit, open it with WPS/Word" |

`[Fact]` DSH ships with `resources\runtime\office-skills\office-docx\SKILL.md` and `scripts\check_office.py` (also including pptx/xlsx), and comes with `libreoffice-kit` and a Python 3.12 runtime (including python-docx / python-pptx / openpyxl / pandas / Pillow / lxml / XlsxWriter) `[Measured]`. **This means "generating docx" can be reused directly by Gezhi, without building its own Python environment.**

---

## 5. Dependency packaging strategy (derived backward from local constraints)

`[Measured]` The C drive has 55.6 GB left and the D drive has 409.9 GB; this machine already has: Node 24.18.1, Python 3.11.9 (10.99 GB), uv, and an entire MiKTeX directory of **1.0 GB**; **not installed**: pandoc / typst / LibreOffice / ImageMagick / Tesseract.

| Dependency | Size magnitude | Delivery strategy |
| --- | --- | --- |
| Electron itself | 180–250 MB | Built in (cannot be omitted) |
| DSH runtime | Already present (user installed) | **Reuse what is already installed on the system**; if not installed, guide installation or offer it as an optional component download |
| Python + required libraries | 60–120 MB | Create an isolated environment with `uv`; install only pypdf / python-docx / openpyxl / Pillow (+ optional pandas, matplotlib) |
| LaTeX | Full MiKTeX ≈ 1 GB; minimal Chinese XeLaTeX subset about 150–400 MB | **Prefer reusing a system-installed TeX**; if absent, guide installation of TinyTeX/MiKTeX; **do not unconditionally bundle 1 GB** |
| Pandoc | 30–80 MB | Download on demand (only when the user selects the Pandoc pipeline) |
| Typst | About 30 MB for a single file | Optional component |
| Chromium | Bundled with Electron | Get "HTML → PDF" capability for free |
| Voice model (sherpa-onnx Chinese) | 50–300 MB | Download on demand; can work offline |
| Textbooks / question banks | Hundreds of MB – several GB | **Never include in the installer**; download from official sources or import by the user |

**Target**: installer ≤ 300 MB; within 5 minutes after first launch, "check dependencies → guide completion" ≤ 5 minutes.
**Degradation principle**: every dependency that is missing must have a usable fallback (no TeX → Chromium printing; no Pandoc → built-in templates; no voice model → text-based Feynman mode); **"missing dependency causes a crash" is not allowed**.

---

## 6. Desktop shell: why Electron is still the final choice

| Dimension | Electron | Tauri 2 |
| --- | --- | --- |
| UI kernel | Bundles Chromium (uniform version) | System WebView2 (version follows the system) |
| Installer size | 180–250 MB | 10–20 MB |
| Local subprocesses (Python/TeX/DSH) | Node `child_process`, straightforward | Rust sidecar + shell plugin, more cumbersome configuration |
| Compatibility with pdf.js / CodeMirror / sigma.js | Works out of the box | Basically usable, but WebView2 differences need hands-on testing |
| SQLite | `node:sqlite` built in `[Measured]` | Requires the Rust side or an sql plugin |
| Key point for this project | **Solves rendering, subprocesses, filesystem, and auto-update in one go** | The size advantage is offset by "already needing to carry Python/TeX" |

`[Inference]` For an application like Gezhi with "heavy local dependencies + a heavy editor", Electron's **integration-cost advantage** outweighs its size disadvantage, so Electron is chosen; if a "lightweight read-only companion" is needed in the future, consider Tauri then. Reference: [Tauri vs Electron hands-on comparison](https://devtoolpicks.com/blog/tauri-vs-electron-indie-hackers-2026).

---

## 7. One-sentence recommendation

**For viewing, use pdfjs-dist + docx-preview; for generation, use three pipelines — "XeLaTeX (exam papers/handouts) + python-docx (Word) + Chromium printing (quick export)"; heavy dependencies are always layered — prefer reusing the system-installed MiKTeX and DSH's bundled Python/office-skills, guide installation of whatever is missing, and provide a fallback path for every missing item; for the desktop shell, choose Electron.**

---

## Appendix · Self-check list

- [ ] `[Unverified]` The maturity of Typst's Chinese exam-template ecosystem (run a hands-on test at P5 before deciding whether to include it).
- [ ] `[Unverified]` Native module loading of pdfium under Electron (if stronger PDF capabilities are needed after P2).
- [ ] `[Unverified]` The actual size of TinyTeX's minimal Chinese subset (determines the copy and expectations for "guided installation").
- [ ] `[Unverified]` The installation size of `fandol-fonts` under MiKTeX (or switch to a system-font approach and fix the font list).
