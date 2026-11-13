# Tools Available to the AI Assistant

This document is for **the AI assistant working inside Gezhi**. It describes which commands you can call directly,
so you do not take a detour for a "export PDF" task (for example, generating HTML first and then asking the user to print it in a browser).

## In One Sentence

Gezhi already has a built-in typesetting engine. **When a PDF is wanted, generate the PDF directly; do not output HTML and ask the user to print it.**

---

## `scripts/md2pdf.mjs` —— Markdown to PDF

**When to use**: the user wants a PDF, or wants "this content made into a document that can be printed/submitted".

**Usage**:

```bash
node scripts/md2pdf.mjs <input.md> [output.pdf]
```

When no output path is given, the PDF has the same directory and name as the input file.

**Examples**:

```bash
node scripts/md2pdf.mjs "报告.md"
node scripts/md2pdf.mjs "报告.md" "产出/报告-终稿.pdf"
```

**What is behind it**:

```
Markdown → (md2typst) → Typst source → (bundled typst.exe) → PDF
```

- Chinese typesetting (line breaking, punctuation compression, font embedding) is handled by Typst, with results close to LaTeX
- Mathematical formulas: write `$...$` or `$$...$$` in Markdown and they are automatically converted to Typst formulas
- Tables, blockquotes and tables of contents are all supported
- **The output contains no product attribution** (this is a hard product rule: what students receive should be their own document)

**Measured**: a 4-page Chinese document with a table of contents and tables generated 278 KB in 0.3 seconds.

---

## Why Not Use HTML → PDF

Gezhi also has `scripts/html2pdf.mjs` (printing via the system Chrome/Edge),
but it **should be used in only one situation**: the user explicitly asks that "the HTML styling must be preserved exactly",
such as an already-finished web-page layout.

Comparison:

| | `md2pdf.mjs` (recommended) | `html2pdf.mjs` |
|---|---|---|
| Input | Markdown, easy to modify | HTML, verbose to modify |
| Typesetting | Typst, professional Chinese typesetting | Browser printing, depends on CSS |
| Formulas | Native support | Requires KaTeX/MathJax |
| Suitable for | **The vast majority of cases** | Finalized web-page layouts |

---

## `scripts/html2pdf.mjs` —— HTML to PDF

```bash
node scripts/html2pdf.mjs <input.html> [output.pdf]
```

- Automatically finds Chrome / Edge (PATH → common installation locations)
- Prints with a headless browser, A4, no header or footer
- To specify a browser, set the `GEZHI_BROWSER` environment variable

---

## About File Permissions

If **all commands fail** in a certain directory with an error like
`SetNamedSecurityInfoW failed (Win32 5)`, that is a Windows file-permission issue,
not a mistake in your command. Tell the user what you encountered and the directory path,
and ask them to switch this session to "Full permissions" and try again.

---

## Final Words

**Look at the existing tools first; do not rush to build your own.**

Capabilities already present in Gezhi:
- Markdown → PDF / Word (`scripts/md2pdf.mjs`, export pipeline)
- PDF viewing (built-in viewer)
- Full-text search and backlinks (indexer)
- High-fidelity viewing of Office documents (LibreOffice conversion, see `main/lib/soffice.cjs`)

If a tool is missing, tell the user directly instead of running in circles with a pile of HTML.
