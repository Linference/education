# ⚠️ Chinese reference version — for internal use only, never submit

## What these two files are

| File | Pages | Purpose |
| --- | --- | --- |
| `ProjectIntroduction_Gezhi_zh.pdf` | 2 | Chinese draft structurally corresponding one-to-one with the English version |
| `ResearchReport_Gezhi_zh.pdf` | 10 | Same as above |

They are the **Chinese counterparts** of the formal English drafts, for: review by the supervising teacher, internal team discussion, organizing the logic before the defense, and preparing a Chinese presentation.

## 🚫 Why they cannot be submitted

Exact wording from the competition charter:

> **For the 2026 competition, all registration materials, work content, attachments, posters, film subtitles, presentation slides, and defenses are accepted in English only.**

Moreover, the supplementary provisions explicitly list **"not using English" as one of the circumstances under which a submission may be "not reviewed"**, and the charter states that "there is no work-content review or appeal procedure" — **there is no chance to remedy it**.

**For formal submission, use the two English PDFs in the parent directory:**

```
../ProjectIntroduction_Gezhi.pdf      ← submit this
../ResearchReport_Gezhi.pdf           ← and this
```

## Structural correspondence between the two documents

The Chinese and English versions have **identical section numbers and table numbers**, making side-by-side comparison and editing easy. When changing either one, remember to sync the other.

| Section | English version | Chinese version |
| --- | --- | --- |
| 1 | Background | Background |
| 2 | Problem Definition | Problem Definition |
| 3 | Related Work | Related Work |
| 4 | System Design | System Design |
| 5 | Technical Methods | Technical Methods |
| 6 | Data Sources | Data Sources |
| 7 | Testing and Evaluation | Testing and Evaluation |
| 8 | Results | Results |
| 9 | Limitations | Limitations |
| 10 | Ethics, Safety and Privacy | Ethics, Safety and Privacy |
| 11 | Conclusion and Future Work | Conclusion and Future Work |
| Appendix A | AI Tool Disclosure | Generative AI Tool Usage Disclosure |

## Compiling

The Chinese version must use **XeLaTeX** (the English version can also use pdfLaTeX, but Chinese fonts require XeLaTeX):

```powershell
$mik = 'D:\MiKTeX\miktex\bin\x64'
cd 'D:\Users\LINKIT\Desktop\格致\submission\zh-reference'

# Run each one twice
foreach ($f in 'ProjectIntroduction_Gezhi_zh','ResearchReport_Gezhi_zh') {
  & "$mik\xelatex.exe" -interaction=nonstopmode "$f.tex" > $null
  & "$mik\xelatex.exe" -interaction=nonstopmode "$f.tex" > $null
}
```

The font configuration is `fontset=windows`, using the system's built-in SimSun / SimHei / KaiTi, which has been verified to work on this machine.

**Pitfall reminder**: if a previous failed compile left behind a half-finished PDF, the next compile will report
`dvipdfmx:fatal: Unable to open ...` — this means the file is in use. Delete `*.pdf *.aux *.log *.out` first, then recompile.

## Placeholders

They likewise use red `【待填：…】` markers, corresponding one-to-one with the English version. To find them:

```powershell
Select-String -Path *.tex -Pattern '\\fillin\{|\\fillc\{'
```

**After filling data into the Chinese version, be sure to put the same numbers into the English version** — the English version is what gets submitted.

## `_preview/`

Page-by-page PNG previews for quick layout checks; **not a deliverable**, can be deleted at any time.
