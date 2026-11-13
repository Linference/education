# LibreOffice (bundled distribution)

The Office document conversion engine built into Gezhi. Purpose: convert PPT / Word / Excel / legacy `.doc` / `.ppt`
into PDF and hand it to Gezhi's existing PDF viewer for display — **100% visual fidelity**.

## Why it is needed

Plain-text extraction is meaningless for handwritten courseware. Measured data:

| File | Size | Extracted text | Note |
|---|---|---|---|
| `part4_linear algebra.pptx` | 219 MB | 197 pages / 10,647 characters | **only 54 characters per page**, content is all in images |
| `01.概述、线性代数和NDArray.pptx` | 15.3 MB | 33 pages / 2,029 characters | **15 MB yields only 2 KB of text** |

In other words, when opening such files the user sees a string of text instead of slides.
After LibreOffice conversion, layout, images, formulas, and backgrounds are all restored.

Measured conversion time (bundled version):

| File | Time | Result |
|---|---|---|
| 高中物理竞赛-热学部分.**ppt** (legacy) | 10.4s | 37 pages, layout/background/formulas fully restored |
| 4.数据排序.pptx | 19.4s | 29 pages |
| part4_linear algebra.pptx (219 MB) | 37.7s | 197 pages |

## Version and source

- Version: LibreOffice 26.8.0 (Windows x86-64)
- Source: <https://download.documentfoundation.org/libreoffice/stable/>
- Acquisition method: `msiexec /a` extraction (administrative install, not installed into the system)

## License: MPL-2.0

LibreOffice is distributed under the **Mozilla Public License v. 2.0**.

**Why it can be distributed with Gezhi**: MPL-2.0 is a **weak copyleft** and is **file-level** —
it requires that "modifications to MPL-covered files" be published under MPL, but it **does not require**
other programs that call it (Gezhi) to adopt MPL. The relationship between Gezhi and LibreOffice is:

- Gezhi **does not modify** any LibreOffice source code
- Gezhi launches it as a **separate process** (`soffice.exe --headless --convert-to pdf`)
- The two interact only through command-line arguments and files

This is fundamentally different from AGPL (AGPL has network-distribution copyleft). The project's dependency license gate
(`scripts/check-licenses.mjs`) allows MPL-2.0 and blocks AGPL/SSPL/Commons Clause.

License files are bundled:
- `license.txt` — full MPL-2.0 text + third-party code notices
- `LICENSE.html` — same as above (HTML version)
- `NOTICE` — attribution requirements for the Apache-2.0 portions
- `CREDITS.fodt` — list of contributors

## Trimming notes

After extraction, the original installation package is **1523 MB** (19,457 files). It was trimmed to control size,
finally **1014 MB** (9,112 files), and about **198 MB** after LZMA compression.

What was removed (**each item was verified to still convert correctly**):

| Directory | Size | Contents |
|---|---|---|
| `share/extensions` | 462 MB | Spell-check dictionaries and language packs (conversion does not need correction) |
| `help` | 11 MB | Offline help manual |
| `share/gallery` | 13 MB | Clip art |
| `share/template` | 8 MB | Document templates |
| `share/autotest` / `autotext` | 3 MB | AutoText |
| `share/wizards` | 5 MB | Wizards |
| `readmes` | 2 MB | Readme files |
| `share/xslt` | 4 MB | XSLT styles |
| `share/palette` | 1 MB | Color palettes |

### ⚠️ What cannot be removed: `share/config`

**Removing `share/config` makes conversion fail**, with the error:

```
Error: source file could not be loaded
```

The reason is that it holds the configuration needed for file type detection and export filter registration.
This pitfall was hit once in hands-on testing — it was only discovered when the `prepare-vendor.cjs` script ran a conversion immediately after trimming.

**Lesson**: trimming LibreOffice cannot be judged by size alone. Every cut must be followed by rerunning a real conversion,
because a wrong cut manifests as "silent failure", not a crash with an error.

## Code locations

- `apps/desktop/main/lib/soffice.cjs` — detection and conversion (including a serial queue)
- `apps/desktop/main/convert-ipc.cjs` — IPC wrapper
- `apps/desktop/verify-soffice-convert.cjs` — acceptance test

## Invocation (for maintainers)

```
soffice.exe
  --headless --norestore --invisible --nolockcheck --nodefault --nofirststartwizard
  -env:UserInstallation=file:///<separate profile directory each time>
  --convert-to pdf:impress_pdf_Export
  --outdir <output directory>
  <source file>
```

Three points that must be observed:

1. **`-env:UserInstallation` must be separate each time** — the same profile cannot be launched concurrently;
   with concurrency, the second one silently fails or hangs
2. **Success cannot be judged by exit code alone** — LibreOffice may still return 0 when conversion fails;
   you must check that "the output directory contains a non-empty PDF"
3. **`--norestore` and `--nofirststartwizard` cannot be omitted** —
   otherwise a recovery dialog / first-run wizard may pop up, and automation will hang forever

Known limitation: `--convert-to`'s `FilterOptions` (compression parameters) **do not take effect** on the command line.
So a 219 MB image-based courseware converts to a PDF of about 260 MB, which takes a few seconds to load.
