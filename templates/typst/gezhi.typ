// Gezhi · Typst shared styles and font stack
//
// Why the PDF pipeline uses Typst instead of assembling output with JavaScript:
//   Chinese typesetting (line breaking, punctuation compression, font embedding,
//   math, page numbers, table of contents) has over a decade of accumulated work
//   in Typst/LaTeX, and the Node ecosystem has no equivalent. Layouts hacked
//   together with JS differ every time and cannot be shipped as deliverables.
//
// ⚠⚠ Hard-won font lessons (measured on this machine, follow them):
//
//   1) The Chinese fonts installed here include **variable fonts**:
//        Noto Sans SC  → NotoSansSC-VF.ttf   Weight: 100-900, **Default: 100**
//        Noto Serif SC → NotoSerifSC-VF.ttf  Weight: 200-900, **Default: 200**
//      Measured: **Typst 0.15.1 on this Windows machine cannot instantiate them**.
//      Whether you write weight: "regular" or weight: 400, what gets embedded in
//      the PDF is always NotoSansSC-Thin / NotoSerifSC-ExtraLight — Chinese body
//      text becomes so thin it is nearly unreadable, and **no error is reported**;
//      you only notice by inspecting the embedded fonts.
//      → Conclusion: **do not put Noto Serif SC / Noto Sans SC in the font stack**.
//
//   2) Weights are correct after switching to static fonts. Measured comparison
//      (rendered to images and inspected line by line):
//        DengXian (DengXian)    regular/bold clearly distinct, elegant glyphs  ← first choice for body
//        Microsoft YaHei        regular/bold clearly distinct                 ← first choice for headings
//        SimSun / SimHei / KaiTi / STSong  usable, SimSun is on the thin side
//
//   3) Even so, **body text still explicitly sets weight: "regular" and headings "bold"**; don't omit it.

// Font stack in priority order. Note: **list only fonts actually installed here** —
// listing missing ones floods the output with "unknown font family" warnings (they
// don't affect output but drown out real errors).
// When going cross-platform, append mac fonts such as PingFang SC / Songti SC as needed.

// Chinese body text: DengXian → Microsoft YaHei → SimSun
#let gezhi-fonts = (
  "DengXian",
  "Microsoft YaHei",
  "SimSun",
)

// Chinese headings / sans-serif: Microsoft YaHei → SimHei → DengXian
#let gezhi-sans = (
  "Microsoft YaHei",
  "SimHei",
  "DengXian",
)

// Code
#let gezhi-mono = (
  "Cascadia Code",
  "Consolas",
  "DejaVu Sans Mono",
)


