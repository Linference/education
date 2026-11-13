# submission/ — Submission materials (LaTeX source + compiled PDFs)

## Current outputs

| File | Pages | Size | Specification requirement | Status |
| --- | --- | --- | --- | --- |
| `ProjectIntroduction_Gezhi.pdf` | **2** | 292 KB | Recommended ≤2 pages, PDF ≤50MB | ✅ Compliant |
| `ResearchReport_Gezhi.pdf` | **11** | 395 KB | Recommended 6–12 pages, PDF ≤50MB | ✅ Compliant |

Both are A4, **all English**, and named according to the competition naming rules. A4 is the international standard; the charter specifies only the poster size and does not specify document paper, so A4 can be submitted directly.

## Recompiling

```powershell
$mik = 'D:\MiKTeX\miktex\bin\x64'
cd 'D:\Users\LINKIT\Desktop\格致\submission'

# Run each one twice (the second pass resolves cross-references and the table of contents)
foreach ($f in 'ProjectIntroduction_Gezhi','ResearchReport_Gezhi') {
  & "$mik\pdflatex.exe" -interaction=nonstopmode "$f.tex" > $null
  & "$mik\pdflatex.exe" -interaction=nonstopmode "$f.tex" > $null
}
```

After changing a `.tex` file, **be sure to rerun twice**, otherwise page references will show as `??`.

Page count check:

```powershell
& "$mik\pdfinfo.exe" ResearchReport_Gezhi.pdf | Select-String 'Pages'
```

## ⚠️ Must be handled before submission: red placeholders

All **red bold** `[TO BE COMPLETED: ...]` items in the documents are real data that you must fill in yourselves; **do not estimate, do not round, do not infer**.

| File | Number of placeholders | Description |
| --- | --- | --- |
| `ProjectIntroduction_Gezhi.tex` | 3 | Number of misconception-bank items, subjects covered, number of trial students |
| `ResearchReport_Gezhi.tex` | 38 | Participant information, test duration, round limits, **all result data**, qualitative observations, AI tool disclosure table |

Find all placeholders in one command:

```powershell
Select-String -Path *.tex -Pattern '\\fillin\{|\\fillc\{'
```

**The entire Section 8 Results is placeholders** — this section directly underpins the 20% "prototype, testing and effectiveness" criterion in the review rubric, and must be filled with data from your actual runs. If you cannot produce numbers, write qualitative conclusions; **never fabricate** (the charter has explicit disqualification clauses for false data).

## Compilation warning notes

- `Font shape 'T1/lmr/bx/sc' undefined` — bold small caps have no corresponding glyph and fall back automatically; **does not affect the output**.
- `Overfull \hbox (1.8pt)` — one line extends 1.8 points (about 0.6 mm) beyond the text block; invisible to the eye, **no action needed**.

## Preview

`_preview/` contains rendered page-by-page PNGs for quick visual layout checks; **not a deliverable**, can be deleted at any time.

## Two other materials still to produce

This directory contains only items 1 and 2 from the charter. The other two (see `..\submission-checklist.md`):

- **Poster** — portrait 0.8 m × 1.1 m PDF (fixed dimensions, not A4)
- **DemoVideo** — ≤5 minutes, English narration/subtitles

## Chinese reference versions

`zh-reference/` contains two **Chinese drafts structurally corresponding one-to-one with the English versions** (2-page introduction, 10-page report), for review by the supervising teacher and for internal team discussion.

> 🚫 **Never submit the Chinese versions.** The charter states that all materials are accepted only in English, and "not using English" is a circumstance under which a submission may be "not reviewed". See `zh-reference/README.md` for details.
