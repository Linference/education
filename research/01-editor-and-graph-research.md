# Gezhi · Markdown Editor Kernel + File Relationship Graph + Vault Data Model Technology Selection Research

> Research goal: determine, for the Windows desktop learning application "Gezhi" (Electron + React 19 + TypeScript):
> 1) Markdown editor kernel, 2) file relationship graph (graph view), 3) vault data model.
>
> Status marker conventions:
> - **[Fact]** Verified via GitHub API / official documentation / repository source code
> - **[Inference]** Reasonable inference based on facts, not directly verified
> - **[Unverified]** Could not be verified, pending follow-up PoC confirmation

---

## Table of Contents

1. [Markdown editor kernel comparison](#1-markdown-editor-kernel-comparison)
2. [Markdown parsing ecosystem](#2-markdown-parsing-ecosystem)
3. [Graph visualization library comparison](#3-graph-visualization-library-comparison)
4. [Obsidian interaction breakdown (items worth borrowing)](#4-obsidian-interaction-breakdown-items-worth-borrowing)
5. [Vault data model](#5-vault-data-model)
6. [Open-source projects for reference](#6-open-source-projects-for-reference)
7. [One-sentence recommendation](#7-one-sentence-recommendation)

---

## 0. Research method and data sources

- **How star counts / licenses were verified**: [Fact] Cross-verified through two paths — the GitHub REST API (`api.github.com/repos/<owner>/<repo>`, `/search/repositories`) and the GitHub repository page HTML (the `"stargazerCount"` field). Data collection date: **2026-10-01**.
- **How versions / release dates were verified**: [Fact] Via the npm registry (`https://registry.npmjs.org/<pkg>`) `dist-tags.latest` and `time` fields.
- **How Obsidian behavior was verified**: [Fact] Preferring the Markdown source files in the official help documentation repository [`obsidianmd/obsidian-help`](https://github.com/obsidianmd/obsidian-help) (`raw.githubusercontent.com`); for the official documentation site mirror, see [mintlify.wiki/obsidianmd/obsidian-help](https://mintlify.wiki/obsidianmd/obsidian-help/files/how-obsidian-stores-data).
- **How IME issues were verified**: [Fact] Searched each repository by keyword through the GitHub Search API (`/search/issues`) using the `IME` / `composition` / `中文` / `输入法` keywords, recording issue number, status and URL.
- **[Inference]** denotes a reasonable inference based on the above facts, without direct experiment.
- **[Unverified]** denotes something this research could not verify, requiring PoC confirmation.

> **Important limitation (setting the boundary of how trustworthy the conclusions are)**: This research **did not run any hands-on performance benchmarks**. All judgments about "whether thousands of nodes are smooth" come from each library's rendering backend (WebGL vs Canvas vs SVG), official design goals, and community issue records; they are **[Inference]**, not measured data. Before implementation you must build your own benchmarks (see [§3.7](#37-benchmarks-that-must-be-run-before-implementation)).

---

## 1. Markdown Editor Kernel Comparison

### 1.1 Overview table

| Dimension | **CodeMirror 6** | **Monaco Editor** | **TipTap v3** | **Milkdown** | **Vditor** | **Lexical** |
|---|---|---|---|---|---|---|
| Repository | [codemirror/dev](https://github.com/codemirror/dev) | [microsoft/monaco-editor](https://github.com/microsoft/monaco-editor) | [ueberdosis/tiptap](https://github.com/ueberdosis/tiptap) | [Milkdown/milkdown](https://github.com/Milkdown/milkdown) | [Vanessa219/vditor](https://github.com/Vanessa219/vditor) | [facebook/lexical](https://github.com/facebook/lexical) |
| License | MIT (all `@codemirror/*` are MIT) | MIT | MIT (core); platform services sold separately | MIT | MIT | MIT |
| Stars (2026-10-01) | **7,815** (`codemirror/dev`, including issues) | **46,828** | **38,604** | **11,970** | **11,355** | **23,917** |
| Architectural essence | Text editor + incremental syntax tree (Lezer) | Text editor + full IDE language service | ProseMirror rich text (schema document model) | ProseMirror rich text (ProseMirror + Remark hybrid) | In-house: textarea/div + three rendering modes | In-house rich text (independent Node model) |
| WYSIWYG | ✗ Requires building Live Preview via Decoration | ✗ Requires building via Decoration | ✓ Native WYSIWYG | ✓ Native, and keeps Markdown as the source of truth | ✓ **IR instant-rendering mode** (unique to Vditor) | ✓ Native WYSIWYG |
| KaTeX / MathJax | Relies on `@codemirror/language` + custom Widget (ready-made solutions exist in the ecosystem) | Built-in Markdown language support is weak; needs plugins (community `monaco-katex`, etc.) [unverified quality] | Community/official extensions | Official `@milkdown/plugin-math` (Remark math) | Built-in (`preview.math` config option) | Requires a custom DecoratorNode |
| Code highlighting | **Lezer** incremental highlighting (it is itself a highlighting engine, the best fit) | Monarch / TextMate (same origin as VSCode, the strongest) | Needs Shiki / lowlight (async, friction with the PM transaction model) | Shiki / Prism | Built-in Prism | Requires custom CodeNode + highlighting |
| Difficulty of `[[wikilink]]` extension | **Medium** (`ViewPlugin` + `Decoration.mark` + `atomicRanges`) | **Medium** (same as CM6, but the Decoration API is clunkier) | **Low-medium** (custom Mark + `InputRule` + `Suggestion` plugin) | **Low** (same ProseMirror system as above, and community wikilink implementations already exist) | **Low** (built-in hint / custom rendering hook) | **Medium-high** (requires a custom `TextNode` subclass + `TypeaheadMenuPlugin`; selection/atomization must be handled yourself) |
| Known Chinese IME issues | See [§1.2](#12-known-chinese-ime-issues-verification-results); **many historical issues but all fixed**, currently the most actively tracked | See §1.2; **still has open issues** | See §1.2; **the most open issues** (duplicate characters in tables, headings, and colored-text scenarios) | Few issues (because it is built on ProseMirror and inherits PM's fixes) | Chinese-community project; IME experience is a focus; few open issues | See §1.2; IME-related PRs are active |
| Maintenance activity | Very active (`@codemirror/view` 6.43.13 @ 2026-09-22) | Active (monaco-editor 0.57.0 @ 2026-09-24) | Very active (@tiptap/core 3.31.4 @ 2026-09-30) | Active (@milkdown/core 7.22.2 @ 2026-09-23) | Medium (vditor 4.0.0 @ 2026-08-30; single main author) | Very active (lexical 0.52.0 @ 2026-09-28) |
| Key risk for "Gezhi" | No built-in WYSIWYG; Live Preview must be written yourself (this is the path Obsidian took) | Large; interaction conventions born for code are unsuitable for note-taking; many historical pitfalls on mobile/IME | Document model is ProseMirror rather than Markdown; **round-trip serialization fidelity** requires long-term investment; read the commercial terms carefully | Smaller ecosystem than TipTap; fast version iteration (v7 line); few Chinese-language resources | Single-maintainer; v4 just released (API change risk); not React-native (needs an imperative wrapper) | Ecosystem leans toward "social editor"; Markdown round-trip and math support are the weakest |

### 1.2 Known Chinese IME issues (verification results)

This section is **the decisive factor for selection**, so the issues actually found are listed one by one.

**CodeMirror 6** (repository [`codemirror/dev`](https://github.com/codemirror/dev); 32 IME-related issues found in total, **all closed**)

| Issue | Title | Status |
|---|---|---|
| [#1688](https://github.com/codemirror/dev/issues/1688) | Text visually disappears after IME composition inside brackets on Chrome | closed |
| [#1687](https://github.com/codemirror/dev/issues/1687) | First-keystroke console error with bracketMatching when using non-English IME | closed |
| [#1684](https://github.com/codemirror/dev/issues/1684) | Chinese IME composition deletes preceding text in code cells on Google Chrome | closed |
| [#1654](https://github.com/codemirror/dev/issues/1654) | IME composition problem in decoration | closed |
| [#1650](https://github.com/codemirror/dev/issues/1650) | IME composition at the boundary of syntax highlight nodes garbles the content | closed |
| [#1472](https://github.com/codemirror/dev/issues/1472) | Adding characters before the cursor while composing with IME results in offset of characters from IME | closed |
| [#1396](https://github.com/codemirror/dev/issues/1396) | codemirror/view 6.28.2 version will cause abnormal input of Chinese input method | closed |
| [#1409](https://github.com/codemirror/dev/issues/1409) | Mac OS native chinese IME, prompt pos not right | closed |
| [#1128](https://github.com/codemirror/dev/issues/1128) | Pinyin composition glitch in snippet highlight between matched brackets | closed |

**Currently only 2 composition-related issues remain open, and neither is a Chinese desktop scenario**: [Fact]
- [#1403](https://github.com/codemirror/dev/issues/1403) Samsung/mobile Safari Korean Enter key produces a duplicate newline
- [#467](https://github.com/codemirror/dev/issues/467) Android (Boox) auto-correct appends instead of replacing

**Sustained investment visible in the CHANGELOG** [Fact] — in `@codemirror/view`'s `CHANGELOG.md`, composition-related issues were still being fixed in 2026, showing this is not a "fix it and forget it" area:
- 6.39.16 (2026-03-02): *Fix an issue where changing decorations right before a composition could end up corrupting the visible DOM.*
- 6.39.15 (2026-02-20): *Fix a bug that broke composition inside of block wrappers.*
- 6.39.10 / 6.39.9 (2026-01): multiple "composition next to a widget could get needlessly interrupted"

> **[Inference] Conclusion**: CodeMirror 6's IME problems are **not "nonexistent" but "the most diligently fixed"**. The most critical entries in the table above (#1650 garbled composition input at syntax-highlight node boundaries, #1654 IME under decoration, #1688 text disappearing during composition inside brackets) happen to be **core paths of the Live Preview scenario**, and all are closed. For an Obsidian-like application that must build its own Live Preview, this is the strongest positive signal — and it also shows that **these pitfalls are real, so you must use the current version and track the CHANGELOG**.

**Monaco** (repository [`microsoft/monaco-editor`](https://github.com/microsoft/monaco-editor); 15 issues with IME in the title, **several still open**)

| Issue | Title | Status |
|---|---|---|
| [#3549](https://github.com/microsoft/monaco-editor/issues/3549) | [Bug] Japanese IME issue when using wordWrap | **open** |
| [#2199](https://github.com/microsoft/monaco-editor/issues/2199) | Chinese IME does not work correctly with CompletionItemProvider | **open** |
| [#4805](https://github.com/microsoft/monaco-editor/issues/4805) | [Bug] Decorations Not Updating when using an IME to input on windows | **open** |
| [#1410](https://github.com/microsoft/monaco-editor/issues/1410) | Can't overwrite selected text on Microsoft Edge with Chinese IME | closed |
| [#1634](https://github.com/microsoft/monaco-editor/issues/1634) | First time typing to overwrite selected text with Chinese IME on Edge actually does nothing | closed |
| [#136](https://github.com/microsoft/monaco-editor/issues/136) | Sogou IME does not work in Edge/IE | closed |

> **#2199 and #4805 directly hit what we want to do**: completion items malfunction when using an IME (exactly the mechanism that `[[` autocomplete needs), and Decorations do not refresh during IME input (exactly the mechanism Live Preview needs). **Both are still open.** [Fact]

**TipTap / ProseMirror** (the largest number of IME-titled issues)

TipTap (24 issues), **still open**:
- [#7414](https://github.com/ueberdosis/tiptap/issues/7414) Text selection is not replaced during composition
- [#7271](https://github.com/ueberdosis/tiptap/issues/7271) **Duplicate text appears when typing Chinese with an IME in a Heading element (WebKit)**
- [#7186](https://github.com/ueberdosis/tiptap/issues/7186) Under Safari, IME input in a table cell leaves only raw pinyin (e.g. "nihao")
- [#7135](https://github.com/ueberdosis/tiptap/issues/7135) Bug with inline editable nodes + IME
- [#8189](https://github.com/ueberdosis/tiptap/pull/8189) fix(extension-floating-menu): re-evaluate the menu after composition ends (open PR)
- [#7899](https://github.com/ueberdosis/tiptap/pull/7899) fix: prevent cursor jumps during IME composition in colored text (open PR)

ProseMirror upstream (22 issues), **still open**:
- [#1564](https://github.com/ProseMirror/prosemirror/issues/1564) Chrome Chinese IME Backspace produces unexpected `<br>` nodes
- Closed but highly illustrative: [#1453](https://github.com/ProseMirror/prosemirror/issues/1453) (first character duplicated with Chinese IME at line start), [#1450](https://github.com/ProseMirror/prosemirror/issues/1450) (first character duplicated when switching to bold), [#1484](https://github.com/ProseMirror/prosemirror/issues/1484) (Korean IME failing after a Chrome update)

Milkdown (1 issue with IME in the title): [#1403](https://github.com/Milkdown/milkdown/pull/1403) replaced its in-house table zero-width-space plugin with `prosemirror-safari-ime-span` (closed); there is also [#1542](https://github.com/Milkdown/milkdown/issues/1542) *[Bug] Chinese input, wrong cursor position* (closed).

**Vditor**: `IME in:title` returned **0 hits**; among Chinese-titled issues, the input-related ones are [#1533](https://github.com/Vanessa219/vditor/issues/1533) (on mobile, after pressing Enter for a newline, pasting or Chinese input is not recorded, **open**) and [#1622](https://github.com/Vanessa219/vditor/issues/1622) (in instant-rendering mode, Chinese input crashes after selecting all of the first-line heading, closed). [Fact] On the point of "few Chinese IME-specific issues", Vditor performs best — but this may simply reflect differences in **user base and issue-reporting habits**, and cannot be directly equated with a better experience. [Inference]

**Lexical** (36 IME-titled issues, PRs very active): **still open** are [#8834](https://github.com/facebook/lexical/issues/8834) (clicking with the mouse to force-commit an IME composition scrolls the viewport back to the composed text) and [#8835](https://github.com/facebook/lexical/pull/8835). Fixed ones include [#6296](https://github.com/facebook/lexical/issues/6296) (Chinese input breaks mention entities and duplicates characters), [#1898](https://github.com/facebook/lexical/issues/1898) (wrong cursor position with Chinese IME on Safari), [#1695](https://github.com/facebook/lexical/issues/1695), [#4547](https://github.com/facebook/lexical/issues/4547). There is also [#8679](https://github.com/facebook/lexical/issues/8679) (Markdown shortcut input does not trigger when Korean IME is active in Firefox) — **this one directly undermines "Markdown input shortcuts"**. [Fact]

**There is also a pitfall at the Electron layer that you must know about (unrelated to the kernel, but it pollutes attribution)**: WebView2 on Chromium 149.0.4022.69 had a problem where "the first CJK IME character is dropped + Chinese punctuation is duplicated", see [MicrosoftEdge/WebView2Feedback#5625](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5625). **Electron uses Chromium, not WebView2**, so strictly speaking this does not directly apply; but whenever doing Chinese input on Windows, you must separate "kernel bugs" from "Chromium/system IME/TSF layer bugs" when locating problems, otherwise you will misjudge the kernel. [Inference]

### 1.3 Key implementation path of each candidate (no code, just mechanism)

- **CodeMirror 6**: The orthodox way to do Live Preview is for a `ViewPlugin` to produce a `DecorationSet`: use `Decoration.replace({})` to hide markers such as `**`/`[[`/`]]`, use `Decoration.mark` to add styles, use `atomicRanges` to let the cursor skip hidden markers, and use a `StateField` (beyond `EditorView.atomicRanges` + `EditorState.readOnly`) to distinguish "cursor inside/outside syntax". KaTeX is rendered with a `WidgetType` (`Decoration.replace` swaps in a formula block). **The hard part is not rendering but selection semantics and decoration stability during IME composition** — #1650/#1654/#1688 in the table above are all about this theme.
- **Monaco**: The Decoration API is a `deltaDecorations`-style set of ranges, combined with `IModelDecorationOptions.inlineClassName` for hiding/styling. A Live Preview is theoretically possible, but Monaco is positioned as a code editor (line numbers, folding, minimap, suggestion box), so you would have to turn each off and rewrite the interactions; the IME interaction of `CompletionItemProvider` has open bugs (#2199).
- **TipTap**: `Mark`/`Node` extensions + `InputRule` (triggered by `[[`) + `Suggestion` (`@tiptap/suggestion`, with a built-in React rendering entry point). **This is the least-effort path to wikilinks**. The cost is that the document model is ProseMirror's, so you need bidirectional serialization between Markdown ↔ PM JSON, and `[[x]]`, `==highlight==`, `![[embed]]` are all non-standard syntax, so the serialization plugin must be maintained by you.
- **Milkdown**: ProseMirror for the document model and Remark for Markdown parsing/serialization (**this is its core difference from TipTap**), with official plugins such as `@milkdown/plugin-math` complete. For a project where "Markdown must be the sole source of truth", its model fit is the highest.
- **Vditor**: Three modes `wysiwyg` / `ir` (instant rendering) / `sv` (split preview); `ir` mode is its signature and the **out-of-the-box solution closest to Obsidian Live Preview**. Extensions rely on callbacks such as `options.preview`, `hint`, and `toolbar`; deep customization is constrained by the framework.
- **Lexical**: Everything relies on custom Nodes (`TextNode` subclasses) + `DecoratorNode` + `TypeaheadMenuPlugin`. Maximum flexibility, but also the most "wheels" you must build yourself; Markdown round-trip is a weak point.

### 1.4 Recommendation / alternatives / rationale

**✅ Recommended (primary choice): CodeMirror 6**

Rationale, ordered by weight:
1. **Live Preview is the core experience of "Gezhi", and CM6 is the only Live Preview foundation with large-scale production validation** — Obsidian itself takes this path [Inference, based on the Obsidian editor exhibiting CM6's Decoration/syntax-hiding behavior; Obsidian has not publicly confirmed it, **Unverified**]. We are not conducting an experiment; we are replicating an already-validated path.
2. **IME issues are fixed most diligently, and the currently open composition issues are not in Chinese desktop scenarios** (§1.2). For a product aimed at Chinese users, this is the top priority.
3. **Editing and highlighting share the same source**: the Lezer incremental syntax tree simultaneously supplies highlighting, folding, indentation, and our own wikilink recognition; no additional highlighter is needed, and there is no "highlighter out of sync with the document model" problem.
4. **Plain text as the source of truth, zero round-trip loss**: the document is just a `.md` string, with no PM JSON ↔ Markdown fidelity war. For the product promise that "the user's files must be openable by other tools", this is a structural advantage.
5. Clean license (MIT), small and stable dependency tree (`@codemirror/state` / `view` / `language` are all MIT and still releasing in 2026-09).

**Costs to accept**: the decoration logic of Live Preview, the atomization and autocomplete of wikilinks, and WYSIWYG table editing **all have to be written yourself**. This is a solid 2–4 person-month workload that must be included in the schedule and cannot be treated as "pick a library and it's done". [Inference]

**🔄 Alternative A: Milkdown (switch to it when you want "out-of-the-box WYSIWYG + Markdown source of truth")**

Switch when any of the following occurs: the CM6 Live Preview workload estimate exceeds the budget / you need block-level drag-and-drop and a slash menu in the editor (`@milkdown/crepe` already includes them). Its ProseMirror + Remark combination is the most orthodox engineering answer in "Markdown as source of truth + rich-text editing", MIT, with active v7 iteration.

**🔄 Alternative B: Vditor (use it for a prototype when you need to see a Chinese-usable demo as fast as possible)**

`ir` mode out of the box gets close to Obsidian Live Preview; it has a Chinese-community background and few IME-specific issues. **But do not use it as a long-term kernel**: single main author (bus factor risk), v4 just released (API changes), not React-native and requiring an imperative wrapper. **Suggested usage: in week 1, build a clickable interactive prototype with it to align the Live Preview feel with the product, then throw it away and implement with CM6.** [Inference]

**❌ Not recommended**
- **Monaco**: Its interaction model born for code (line numbers, minimap, suggestion box) fights the note-taking scenario, and the two open bugs #2199/#4805 land exactly on the completion and decoration we need. It is also in the largest size tier.
- **TipTap**: Technically a good choice, but **the open Chinese IME issues cluster around headings, tables and floating menus** — exactly high-frequency note-taking scenarios (#7271 duplicate characters in headings is especially fatal). Add the long-term cost of Markdown round-trip fidelity, plus platform pricing (from $49/month for Start), and the selection document should clearly state the boundary: "we only use the MIT core, not cloud documents".
- **Lexical**: Markdown is its weakest link (#8679: Markdown shortcuts do not trigger under Korean IME, directly conflicting with "type `#` to make a heading"), and it requires the most wheels built yourself.

### 1.5 Pre-submission PoC checklist (mandatory)

1. **Chinese IME × Live Preview decoration stress test**: implement a minimal Live Preview in CM6 (hide `**`, render inline KaTeX, recognize `[[wikilink]]` and atomize it), and test separately with Microsoft Pinyin / Sogou / WeChat input methods: typing at line start, typing inside brackets (reproduce the #1688 scenario), typing at a highlight node boundary (reproduce the #1650 scenario), moving the cursor with arrow keys mid-composition, clicking the mouse mid-composition, and pressing Esc to cancel mid-composition. **Pass criteria: zero character loss, zero duplication, no cursor jumps.** Use the current `@codemirror/view` 6.43.x, not any older version.
2. **`[[` autocomplete coexisting with IME**: verify "the behavior of the `[[` autocomplete popup while the user is typing pinyin" — should the popup be suppressed on `compositionstart` and restored after `compositionend`? This is where CM6 and Monaco differ most, and the link most easily overlooked.
3. **Input latency with a 100k-character single file + 2000-file vault**: measure the P95 key-to-screen latency and decoration recomputation cost. CM6's Lezer is incremental, but **the ViewPlugin you write yourself may not be** — this is the most common performance failure point.

---

## 2. Markdown Parsing Ecosystem

### 2.1 The essential difference between the four

The criterion in this section is not "which parser is better" but **"which parser can simultaneously serve three consumers"**: per-keystroke highlighting in the editor, vault-wide link indexing in the background, and static rendering in reading mode. The needs of these three conflict with one another (latency-sensitive vs throughput-sensitive vs fidelity-sensitive), so the selection conclusion becomes a **combination scheme** rather than a single choice.

| Dimension | **remark / unified** | **markdown-it** | **micromark** | **Lezer (`@lezer/markdown`)** |
|---|---|---|---|---|
| Repository | [remarkjs/remark](https://github.com/remarkjs/remark) / [unifiedjs/unified](https://github.com/unifiedjs/unified) | [markdown-it/markdown-it](https://github.com/markdown-it/markdown-it) | [micromark/micromark](https://github.com/micromark/micromark) | [lezer-parser/markdown](https://github.com/lezer-parser/markdown) |
| License | MIT | MIT | MIT | MIT |
| Stars | **9,010** / **5,037** | **21,950** | **2,230** | Not counted separately (`lezer-parser/lezer` main repo has been archived; code moved to [code.haverbeke.berlin/lezer](https://code.haverbeke.berlin/lezer/markdown)) |
| npm / version | `remark` 15.0.1 (2023-09-18); `mdast-util-from-markdown` 2.0.3 (**2026-02-21**); `unified` 11.0.5 (2024-06-19) | `markdown-it` 15.0.2 (**2026-09-11**) | `micromark` 4.0.3 (**2026-09-26**); `mdast-util-from-markdown` 2.0.3 (2026-02-21) | `@lezer/markdown` 1.7.2 (**2026-07-15**) |
| Data model | mdast (structured AST, nodes are objects) | Token stream (flat token array + `Token.stream`) | Concrete token event stream (state machine, "every byte has an owner") | Lezer compact syntax tree (immutable, slice-reusable) |
| **Incremental parsing** | ✗ Full re-parse every time (caching must be maintained by the plugin itself) | ✗ Full re-parse | ✗ Full re-parse | **✓ Natively incremental**: consumes fragments of the old tree to rebuild; this is a design goal |
| Position information (source map) | ✓ Every node has `position.{start,end}.{line,column,offset}` | ✓ `token.map` (line range) + inline offset | ✓ **Strongest**: token-level `start`/`end` offsets; official selling point "with positional info and concrete tokens" | ✓ Node `from`/`to` document offsets |
| Extending new syntax | Write a remark plugin traversing mdast (or write a micromark syntax extension then upgrade to mdast) | `md.inline.ruler.before()` / `md.block.ruler.before()` to register rules (**most direct**) | Write a `SyntaxExtension` (state-machine level, **steepest learning curve**) | Implement `MarkdownConfig`'s `parseInline` / `parseBlock` / `defineNodes` (**medium**) |
| Ecosystem richness | Most abundant: GFM / math / frontmatter / MDX / directives / tables / footnotes all available | Rich: many community plugins, but quality varies and some are abandoned | Official 100% GFM coverage + MDX + frontmatter + math + directives | Officially includes GFM (Table/TaskList/Strikethrough/Autolink) + Subscript/Superscript/Emoji |
| Size | Medium (unified pipeline + a bunch of small packages) | Small | **Smallest** (officially ±14kb, the smallest CommonMark parser) | Small (already loaded with the editor in the CM6 ecosystem; marginal cost ≈ 0) |
| Can it output HTML | Not directly — the unified pipeline's `remark-rehype` + `rehype-stringify` handles it | ✓ Renders HTML natively | ✓ Natively (token → HTML), and can convert to mdast for others to consume | **✗ Parses only, does not render** (the official README states clearly: it does not help output HTML) |

### 2.2 Key facts and pitfalls

1. **Lezer is the only parser "born for keystroke-level editing".** [Fact] The `@lezer/markdown` README says verbatim: *"This is an incremental Markdown parser ... it produces Lezer-style compact syntax trees and consumes fragments of such trees for its incremental parsing."* It also states clearly that *"It does not in fact use the Lezer runtime (that runs LR parsers, and Markdown can't really be parsed that way)"* — this sentence matters: **parsing Markdown with LR is not theoretically tenable, so Lezer's Markdown parser is specialized**; do not count on "the general capabilities of the Lezer family".

2. **Lezer Markdown has explicit fidelity compromises.** [Fact] The same README: *"in order to be single-pass and incremental, it doesn't do some things that a conforming CommonMark parser is expected to do—specifically, it doesn't validate link references, so it'll parse `[a][b]` and similar as a link, even if no `[b]` reference is declared."*
   → **This directly determines the architectural division**: Lezer is used for **in-editor highlighting/decoration** (it is insensitive to "whether a reference-style link actually exists", which users cannot see), while **link-graph parsing must never rely on Lezer**, otherwise nonexistent references would be written into the index as real links.

3. **All the ready-made wikilink wheels are stagnant.** [Fact] npm verification results:
   - `remark-wiki-link` 2.0.1 (**2023-10-10**), `mdast-util-wiki-link` 0.1.2 (2023-10-09)
   - `markdown-it-wikilinks` 1.4.0 (**2023-08-12**)
   - `micromark-extension-wiki-link` 0.0.4 (**2021-01-21**)
   - `markdown-it-obsidian` 1.1.0 (**2021-07-13**, ISC)
   - `@portaljs/remark-wiki-link` 1.2.0 (2024-04-17) — relatively the newest, and its explicit goal is Obsidian-style links

   → **[Inference] Conclusion: do not expect that "adding a package gives you wikilink support".** These packages have gone 2–5 years without updates on average, and most only "parse into an `a` tag"; they do not support the full `![[embed]]` and `[[target|alias#heading^blockID]]` syntax, nor do they distinguish unresolved links. **You must write the plugin yourself**, but this is actually a good thing: the semantics of wikilinks (aliases, embeds, block references, unresolved state) are your product logic, and outsourcing them will eventually require a rewrite.

4. **The remark main repo being "stable" does not mean "abandoned".** [Fact] `remark` 15.0.1 stopped at 2023-09-18, but `mdast-util-from-markdown` was still releasing on 2026-02-21, and `remark-gfm` released on 2025-02-10. The ecosystem is **mature and stable** rather than **abandoned** — the underlying mdast/micromark is still maintained. [Inference] This is good (the API will not change randomly), but it also means that when you hit problems, do not expect a fast response from the main repo.

5. **micromark is remark's engine, not a competitor.** [Fact] micromark is a state machine + concrete tokens, and `mdast-util-from-markdown` converts it to mdast. So "choosing remark" ≈ "choosing micromark + a layer of AST wrapping". Conversely, **using only micromark without upgrading to an AST** suits scenarios where "you only need position information and not structured traversal" (for example, syntax checking/decoration).

6. **markdown-it has the lowest extension cost.** [Fact] Its ruler mechanism (`inline.ruler.before('link', 'wikilink', fn)`) turns "add an inline syntax" into ten lines of code, which is why many Obsidian-like web projects use it. The cost is that the token-stream model is **unfriendly to structured queries** (you must rebuild a tree from flat tokens yourself), while link-graph indexing needs structured queries such as "which targets does this note reference".

### 2.3 Recommendation: **dual-parser division of labor** (not either-or)

**✅ Editing path — `@lezer/markdown` + `@codemirror/lang-markdown`**
- Rationale: the only incremental parser; natively integrated with CM6 with zero extra dependencies; comes with GFM (Table/TaskList/Strikethrough/Autolink); `MarkdownConfig`'s `parseInline` is enough to register a `WikiLink` node for highlighting and atomization.
- Versions: `@lezer/markdown` 1.7.2 / `@codemirror/lang-markdown` 6.5.2 (2026-08-04), MIT.
- **Note**: use it only for "looking", not for "trusting" (see §2.2 point 2).

**✅ Indexing path (building the link graph) — `micromark` + `mdast-util-from-markdown` (i.e., the underlying remark family) + a self-written wikilink extension**
- Rationale:
  1. **Strongest position information** (token-level offsets); "click a backlink to jump to the exact line and column in the source" depends on it.
  2. CommonMark compliance is validated by ±2k tests and fuzzing, and it will not let undeclared references through the way Lezer does. **The index must be accurate**: one fake link adds a ghost edge to the graph, and the user will immediately stop trusting the graph.
  3. micromark is the most actively maintained (4.0.3 @ 2026-09-26).
  4. You can **parse only once and cache the result** (by file-content hash), so "non-incremental" is not a performance problem here — indexing is background batch processing that users do not perceive.
- Concrete approach [Inference, needs PoC]: first strip YAML frontmatter (using `micromark-extension-frontmatter` or a simple leading scan), then use `micromark` + a self-written `SyntaxExtension` to recognize `[[...]]` / `![[...]]` / `#tag` / `^block-id` / `==highlight==`, use `mdast-util-from-markdown` to upgrade to mdast, then traverse to collect `link`/`wikiLink`/`inlineTag` nodes and output `{target, alias, isEmbed, line, column}`.

**✅ Rendering path (reading mode) — `markdown-it` (or the full `remark` + `remark-rehype` + `rehype` suite)**
- **`markdown-it` is recommended** [Inference]: rendering is one-off and does not need incrementality; `markdown-it` is faster, smaller, has a more straightforward plugin style, and has ready-made KaTeX (`markdown-it-katex`, but note it **stopped updating in 2016**; consider `@vscode/markdown-it-katex` or writing your own KaTeX plugin), Mermaid, footnotes, etc.
- **The only reason to choose the full `remark` pipeline**: you want **indexing and rendering to share the same AST**, avoiding two-dialect drift where "the index thinks this is a link, but rendering renders it as plain text". This is a real risk.

> **⚠️ Two-dialect risk (must be written into the design document)**: using two parsers means edge cases such as `[[x]]`, `==x==`, and nested emphasis may be inconsistent between "looks like a link in the editor" and "renders as a link". **Mitigation**: **extract the wikilink recognition rules into an independent regex/scanning module shared by both sides**; both parsers call it and are only responsible for "where in the document to call it". That way there is only one source of the dialect.

**❌ Not recommended**: choosing only `markdown-it` to do everything. Its token-stream model turns "extract all links and tags" into a hand-written state traversal, and it **has no incremental capability**; re-parsing the full text on every keystroke in the editor will drop frames on long documents.

**📌 Supporting libraries (all MIT, versions verified)**: `katex` 0.18.10 (2026-09-30), `shiki` 4.4.3 (2026-08-10; better suited than highlight.js / Prism for "static rendering of code blocks" because of rich themes and no CSS conflicts), `mermaid` 12.0.0 (2026-09-10), `yaml` 2.9.1 (ISC, parses frontmatter), `fuse.js` 7.5.0 (Apache-2.0, fuzzy search) / `minisearch` 7.2.0 (MIT, full-text index; its API is more stable than flexsearch's).

---

## 3. Graph Visualization Library Comparison

### 3.1 First, Obsidian's answer (as the target baseline)

**[Fact]** Obsidian's official community documentation *Graph view customization* ([obsidian-hub](https://github.com/obsidian-community/obsidian-hub)) says verbatim:

> *"Since the graph is rendered using `<canvas>` and WebGL, CSS is unable to affect things like nodes and links. To customize graph view, we have provided a bridge to use CSS colors for customizing WebGL."*

It also publishes the CSS color bridge classes it supports, which effectively gives the **13 semantic slots that the graph needs to color**, and can be used directly as the style requirements checklist for Gezhi's graph:

`.graph-view.color-fill`, `.color-fill-focused`, `.color-fill-tag`, `.color-fill-attachment`, `.color-arrow`, `.color-circle`, `.color-line`, `.color-text`, `.color-fill-highlight`, `.color-line-highlight`, `.color-fill-unresolved`

> **[Inference] This shows two things**: (1) Obsidian's graph is a **self-built Canvas+WebGL renderer**, not any of the libraries above; (2) it makes "node category coloring" a first-class citizen (focus color / tag color / attachment color / unresolved-link color / highlight-state fill and line colors). This is the necessary design of a product-grade graph, so when selecting, confirm whether the library can express these slots with low friction.

### 3.2 Overview table

| Dimension | **Cytoscape.js** | **sigma.js + graphology** | **react-force-graph** | **d3-force (used bare)** | **AntV G6** | **vis-network** |
|---|---|---|---|---|---|---|
| Repository | [cytoscape/cytoscape.js](https://github.com/cytoscape/cytoscape.js) | [jacomyal/sigma.js](https://github.com/jacomyal/sigma.js) + [graphology/graphology](https://github.com/graphology/graphology) | [vasturiano/react-force-graph](https://github.com/vasturiano/react-force-graph) | [d3/d3-force](https://github.com/d3/d3-force) | [antvis/G6](https://github.com/antvis/G6) | [visjs/vis-network](https://github.com/visjs/vis-network) |
| License | **MIT** | **MIT** (both are MIT) | **MIT** | **ISC** | **MIT** (the LICENSE was verified as "MIT License, Copyright (c) 2018 Alipay.inc") | **Apache-2.0 OR MIT** (dual-licensed; the actual LICENSE file contains both) |
| Stars (2026-10-01) | **11,228** | **12,174** / **1,750** | **3,316** | **2,002** | **12,322** | **3,632** |
| npm / version | `cytoscape` 3.34.3 (2026-09-07) | `sigma` 3.0.3 (2026-04-30) / `graphology` 0.26.0 (**2025-01-26**) | `react-force-graph` 1.48.3 (2026-09-29) | `d3-force` 3.0.0 (**2021-06-05**) | `@antv/g6` 5.1.1 (2026-05-08) | `vis-network` 10.1.2 (2026-08-19) |
| Rendering backend | **Canvas 2D** (default). **Note**: the repo has [#3436](https://github.com/cytoscape/cytoscape.js/issues/3436) (WebGL hardware acceleration actually degrades performance on integrated graphics) and [#3261](https://github.com/cytoscape/cytoscape.js/issues/3261) (use the GPU for performance enhancement, **open**) — showing that WebGL support exists but is not the default path [Fact] | **WebGL** (sigma's core selling point; 3.x is pure WebGL rendering) + graphology for graph data and layout | **Canvas 2D / WebGL / SVG, choose one** (2D/3D/VR variants each have implementations) | No rendering — **only the force-layout model**; you write the rendering yourself | Canvas (built-in) + pluggable renderers | Canvas 2D |
| Smooth with thousands of nodes | [Inference] **Layout is the bottleneck**: the built-in force-directed layouts (`cose`/`fcose`) visibly lag at 5k nodes (community #3486 "v4 performance redesign", **open**). Rendering itself with Canvas 2D is usually acceptable at 5k nodes / 10k edges. **Not measured.** | [Inference] **The most stable rendering layer**: WebGL was made for this. sigma 3.x is officially positioned for large-scale graphs. But **graphology 0.26.0 stopped at 2025-01, and sigma 3.0.3 stopped at 2026-04**, the slowest release cadence of the six | [Inference] In between. The repo has a string of performance issues: #483 "Performance issues with 80k+ edges" (**open**), #223 ">12k elements", #202, #181, most already closed, showing **medium scale is OK; very large scale is a known pain point** | Layout only: `d3-force`'s Barnes-Hut approximation reduces O(n²) to O(n log n); a 5k-node layout can run but needs a Web Worker + cooldown scheduling | [Inference] G6 5.x has many performance PRs (#6670, #6651, #6619, #6267, #6249, etc., all merged) and provides a [performance diagnosis flowchart demo](https://github.com/antvis/G6/pull/6289); the engineering level is high. But #6591 "[Bug]: v5 performance needs to be improved" also shows v5 performance was once a problem | [Inference] Canvas 2D, usable at medium scale; the least active ecosystem of the six |
| Incremental updates | ✓ `cy.add()` / `cy.remove()`, can run local layout only for new nodes | ✓ **Strongest**: graphology's `graph.addNode()` etc. are event-driven; sigma listens to events and re-renders incrementally automatically, **without rebuilding** | △ `graphData` prop diff (React side), but internally still relies on d3-force re-heating the simulation | ✓ Manual: add/remove via `simulation.nodes()` + `simulation.alpha(0.3).restart()` | ✓ `graph.addData()` / `updateData()` / `removeData()` | ✓ `DataSet` `add`/`update`/`remove` (event-driven) |
| Filtering / subgraphs | ✓ `cy.filter()`, `eles.hide()`; ego network requires `eles.neighborhood()` yourself | ✓ graphology has `graphology-traversal`; extract a subgraph and feed it to sigma | △ Filter `graphData` externally and pass it in | ✓ Fully manual (but also fully free) | ✓ Built-in filtering and a state system (`setElementState`) | ✓ `DataSet` filtering + dynamic `physics` toggling |
| Node custom styling | ✓✓ **Strongest**: `style` supports `background-image`, `shape: round-rectangle/ellipse/...`, `text-wrap`, `text-max-width`, data-driven mapping (`mapData`); supports HTML nodes (poor performance) | ✓ Nodes can draw images/icons (WebGL programmatic); labels can fade with zoom — **exactly the "show labels only above a certain zoom level" that Obsidian's graph needs** | ✓ `nodeCanvasObject` fully custom drawing callback (can draw anything, but you must handle zoom and hit testing yourself) | ✗ None — rendering is your job | ✓✓ Built-in rich node/edge/arrow/badge styles; the best Chinese documentation | ✓ Font/icon/shape support, configuration-based |
| React 19 integration | Needs an imperative wrapper (community `react-cytoscapejs` is stale; **unverified** whether it supports React 19) | Needs an imperative wrapper (no official React binding) | ✓ **Is itself a React component** (`react-force-graph-2d`) | ✗ Not React | Needs an imperative wrapper (`@antv/g6-react-node` etc.; React 19 **unverified**) | Needs an imperative wrapper (`react-graph-vis` is stale; **unverified**) |
| Chinese-language resources | Average | Few | Few | Many (d3 has the most Chinese resources) | **Best** (AntV Chinese docs + Chinese community) | Average |

### 3.3 Key judgment item by item

- **Cytoscape.js**: The most complete feature set (graph algorithms `eles.dijkstra()`, `eles.neighborhood()`, compound nodes, rich selector syntax); **it treats "the graph" as a first-class citizen** rather than "input for visualization". Costs: default Canvas 2D, a learning curve for the style DSL, and React integration requires writing your own wrapper. **[Inference] If your graph is not just for "looking" but also for "computing" (shortest paths, common neighbors, community detection), it is the first choice.**
- **sigma.js + graphology**: **The highest rendering-performance ceiling** (pure WebGL) and **graphology's data model + event system is the best fit for "incremental updates" among all options**. The risk is maintenance cadence: `graphology` 0.26.0 stopped at 2025-01-26, `sigma` 3.0.3 stopped at 2026-04-30. [Inference] This is "mature and stable" rather than "actively developed", acceptable for infrastructure libraries, but accept that "if something breaks, you will most likely have to fix it yourself".
- **react-force-graph**: Fastest to get started (just pass `graphData` to one React component), **but not recommended for this project** — it is positioned for "3D/VR graph display", bringing in the three.js dependency chain for 3D and VR, whereas Gezhi wants 2D Obsidian style. [Inference] Its `nodeCanvasObject` customization is enough to achieve an Obsidian look, but **carrying three.js just to save one wrapper is not worth it**.
- **d3-force (used bare)**: **[Inference] This is actually the right component for "seriously building an Obsidian-grade graph"** — but only the right answer for **layout**, not rendering. Obsidian's own graph is "self-built WebGL rendering + force-directed layout" (§3.1 has proven the first half; the second half is an **Inference**). `d3-force` provides `forceSimulation` / `forceLink` / `forceManyBody` (Barnes-Hut) / `forceCenter` / `forceCollide`, which correspond exactly to the four knobs exposed in Obsidian's graph settings panel: **Center force / Repel force / Link force / Link distance** — this **is not a coincidence; it is the naming of the same force model**. [Inference] But `d3-force` 3.0.0 stopped at **2021-06-05**, and it is an ISC-licensed "stable means complete" library (normal for the d3 family); this does not constitute a risk.
- **AntV G6**: The best features and Chinese experience, the most serious engineering (many performance PRs, a performance diagnosis demo, built-in badge/arrow/state systems). **[Inference] If the team values "less code, faster finished product" and Chinese documentation more, G6 is the best value for money.** But 5.x is still fixing performance, and React 19 integration is **unverified**.
- **vis-network**: It can do the job, but has the least active ecosystem, and its styling and interactions lean toward "network topology diagrams" rather than "knowledge graphs". **Not recommended.**

### 3.4 Recommendation

**✅ Recommended (primary choice): `d3-force` (layout) + a self-built Canvas 2D rendering layer**

Rationale:
1. **The differentiation of an Obsidian-grade graph lies entirely in rendering details** — labels fading with zoom, hovering to highlight neighbors and dim the rest, unresolved links drawn as hollow/dashed, coloring by tag group, click-to-focus animation. **Any library's default rendering will fight the product expectations on these details**, and a `nodeCanvasObject`-style callback approach ultimately amounts to "writing your own renderer inside the library's framework". Since that is the case, it is better to write the renderer directly.
2. **For a scale of thousands of nodes, Canvas 2D is enough.** [Inference] Drawing 5k circles + 10k lines with Canvas 2D at 60fps: the main cost is redrawing all primitives every frame; with **layered canvases** (edge layer / node layer / label layer / interaction layer) + **stopping redraws when static** (after the force simulation cools down, only redraw the interaction layer), you can reliably meet the target. Only tens of thousands of nodes require WebGL.
3. **`d3-force`'s force model maps one-to-one to Obsidian's settings panel** (Center / Repel / Link / Link distance), letting the "graph settings" UI map directly to the API and saving a translation layer.
4. **Zero framework coupling**: no React 19 compatibility suspense, no imperative/declarative impedance mismatch. Layout runs in a Web Worker; the main thread only draws.
5. The most permissive license (ISC), the fewest dependencies.

**🚫 But the conditions under which this recommendation holds must be stated clearly** (otherwise it is over-engineering):
- **If the team has no graphics/performance-tuning experience**, or **must ship a usable graph within 2 weeks**, switch to **Cytoscape.js** (complete features, mature ecosystem, good `fcose` layout quality) or **AntV G6** (Chinese docs + built-in components are the least work). The hidden costs of a self-built renderer are severely underestimated: hit testing, coordinate transforms for zoom/pan, HiDPI `devicePixelRatio` handling, text measurement and truncation, node-drag inertia — each must be written yourself.
- **If the target vault size will reach 20k+ nodes**, switch to **sigma.js + graphology** (WebGL rendering layer + event-driven incremental updates). The cost then is the slow maintenance cadence.

**🔄 Alternative: Cytoscape.js** (choose it when the team is small / you need graph algorithms / you want to write less code)

**❌ Not recommended**: `react-force-graph` (carries three.js for a 2D scenario), `vis-network` (ecosystem and positioning do not match).

### 3.5 Global graph vs local graph: two things the selection must satisfy simultaneously

**[Fact]** Obsidian's official documentation states clearly that both share all settings, and the local graph has an additional **depth slider**: *"The local Graph view can use all of the Settings available to the global Graph view. Additionally, you can change the depth of the local graph."*

Mapped to selection, this means the library must support:
1. **The same rendering pipeline feeding different subgraphs** (you cannot switch to a different implementation for the local graph);
2. **N-hop neighborhood extraction must be cheap**: `Cytoscape.js` has `eles.neighborhood()` / `eles.closedNeighborhood()`; `graphology` has traversal tools; the self-built approach is just one BFS. **On this point the self-built approach is actually the simplest.**
3. **Boundary semantics of depth**: depth=1 shows only direct inbound/outbound links; does it include "unresolved links" (nodes pointing to nonexistent notes)? Obsidian has an `Existing files only` toggle for this. [Fact]

### 3.6 Obsidian graph settings panel → selection checklist

**[Fact]** All of the following comes from Obsidian's official Graph view documentation and **should be used item by item as selection acceptance criteria**:

| Group | Setting | Constraint on selection |
|---|---|---|
| Filters | Search files (filter nodes using the full search syntax) | The graph must be able to consume the result set of the search DSL → search and graph share one filtering engine |
| Filters | Tags / Attachments / **Existing files only** / Orphans | Need to filter by node type and degree; "Orphans" = degree-0 filtering |
| Groups | Create groups by search term + color them | Need a `node → color` mapping layer and multi-group priority |
| Display | Arrows (show direction) / **Text fade threshold** / Node size / Link thickness / Animate (time-lapse animation) | Text fade threshold is **the ability to control label opacity by zoom level**; Animate requires revealing batches in `created_at` order |
| Forces | Center / Repel / Link / Link distance | The force model must be tunable at runtime and re-heatable (`simulation.alpha()`) |

> **[Inference] This table is the decisive evidence for "self-build vs use a library"**: `Text fade threshold` and `Animate` have no ready-made equivalent in Cytoscape/G6/sigma; both require custom rendering or custom layers. That is, **whichever library you choose, these two must be written yourself**.

### 3.7 Benchmarks that must be run before implementation

This report **did not run any hands-on measurements** (see the limitation note in §0). Before finalizing the selection, you must run the following benchmarks with real vault data:

1. **Layout benchmark**: 2k / 5k / 10k nodes, edge count ≈ node count × 1.5; measure `d3-force`'s **wall-clock time** from random initial values to energy convergence in a Web Worker. **Pass criteria**: first convergence for 2k nodes < 3s, and the main thread remains interactive after convergence (input not blocked). **This is the life-or-death line for the global graph** — slow rendering can be optimized; a stuck layout cannot be saved.
2. **Rendering benchmark**: on the converged static graph, measure the **frame rate** of pan/zoom (target: ≥ 50fps at 1080p) and the redraw cost of hover-highlighting neighbors. Test both the **layered canvas** and **single canvas** versions separately, to verify "whether layering is really necessary".
3. **Incremental benchmark**: simulate a user editing a note that adds/removes one edge, and measure the latency of "update graph data → re-layout → redraw". **Pass criteria**: < 100ms and no visual jitter (node positions should not jump substantially — this is why Obsidian uses a small `alpha` heat-up rather than a reset). [Inference]
4. **Local graph benchmark**: N-hop extraction time for depth 1/2/3 (target < 20ms), and the **reverse index** (`target → sources`) query time on a 5k-node global graph.

---

## 4. Obsidian Interaction Breakdown (Items Worth Borrowing)

> The difficulty rating is a judgment of the workload **for the "Gezhi" team (Electron + React 19 + TS, no existing desktop note framework) to implement from scratch**; it is an **[Inference]**, not Obsidian's implementation difficulty.
> Official documentation links all use the `obsidian.md/help/<permalink>` form (the permalink comes from the frontmatter of each file in [`obsidianmd/obsidian-help`](https://github.com/obsidianmd/obsidian-help), verified one by one).

### 4.1 Item-by-item breakdown

#### 1) Left ribbon (icon bar)

- **Obsidian behavior** [Fact, [help/ribbon](https://obsidian.md/help/ribbon)]: On desktop it is located in the **left sidebar**, and **remains visible even when the left sidebar is collapsed**. Each action is an icon; hovering shows a tooltip. Supports **drag to reorder**, right-clicking blank space to **check/uncheck items for hiding**, and right-clicking to choose **Hide ribbon**. The layout is **remembered across sessions** and **synchronized with `workspace.json` and `workspace-mobile.json`**. There are three default actions: Vault switcher, Help, Settings.
- **Difficulty: Low.** It is just a vertically ordered icon list with drag-to-reorder + persisted configuration.
- **Open-source alternative**: no dedicated library; simply use `@dnd-kit/core` (drag reordering) + `lucide-react` icons. [Inference]
- **Key design worth borrowing**: **"the ribbon remains visible when the sidebar is collapsed"** — this detail determines the perceived usable width of the main content area. Many imitators miss it, so after collapsing the sidebar there is no entry point to reopen it.

#### 2) File explorer

- **Obsidian behavior** [Fact, [help/file-explorer](https://obsidian.md/help/plugins/file-explorer)]: tree structure, drag to move files/folders, right-click context menu, create/rename/delete, sorting, collapse all, highlight the current file.
- **Difficulty: Medium.** The real cost is not rendering the tree but **filesystem semantics**: renaming must cascade-update all `[[old-name]]` links (Obsidian's "Automatically update internal links" setting), deletion goes through the recycle bin (`.trash/`), external changes must be watched (chokidar), case-insensitivity and Windows reserved characters must be handled, and symlinks and the 260-character path limit must be handled.
- **Open-source alternative**: `react-arborist` (virtualized tree, React 19 **unverified**); or build your own with `react-window` / `@tanstack/react-virtual`. **Use `chokidar` for file watching.** [Inference]
- **⚠️ Windows-specific pitfalls (must be handled at the design stage)**: file paths are case-insensitive but case-preserving; reserved names such as `CON`/`PRN`/`AUX`/`NUL`; path length limits (need long-path support); file locks (another process writing → `EBUSY`). **[Inference], needs PoC verification.**
- **A clever approach by Obsidian** [Inference]: a note's **unique identifier is its filename (or path)**, not an internal ID — so the filesystem itself is the database, and "opening it with another tool still makes sense". The cost is that renaming requires updating links vault-wide.

#### 3) Tabs & split panes

- **Obsidian behavior** [Fact, [help/tabs](https://obsidian.md/help/tabs) + [help/workspace](https://obsidian.md/help/workspace)]:
  - Each tab belongs to a **tab group**; you can drag within a group to reorder, drag to another group, or **drag out of the window to become a separate window** (pop-out windows).
  - **Split right / Split down** via the right-click menu; you can also drag a tab onto the bottom of another tab to split.
  - **Pin tab**: in a pinned tab, links always open in a **new tab**.
  - **Stack tabs** (stacked tabs, inspired by Andy Matuschak's sliding notes), with a gif demo.
  - **Linked views**: one tab **references another tab**; when the referenced tab's content changes, they stay in sync. Can be used for a note tab's **Graph view (local) / Backlinks / Outline**.
  - Sidebar tab groups **share the same model** as the main area, but sidebar tabs **show only icons** (hover shows the title).
  - Shortcuts: `Ctrl+Tab`/`Ctrl+Shift+Tab` to switch, `Ctrl+1..8` to jump, `Ctrl+9` for the last, `Ctrl+Shift+T` to restore the most recently closed tab. Link modifier keys: `Ctrl` new tab, `Ctrl+Alt` new tab group, `Ctrl+Alt+Shift` new window.
- **Difficulty: High.** This is the **most expensive** part of Obsidian's UI. The core difficulty is "**Linked views**" — a panel must subscribe to changes of the "currently active tab", and after pinning it must **stop** following. This state machine easily produces subtle bugs.
- **Open-source alternatives (stars / license / version verified)**:

| Library | Repository | License | Stars | npm version (date) | Notes |
|---|---|---|---|---|---|
| **dockview** | [dockview/dockview](https://github.com/dockview/dockview) | MIT | **3,453** | 8.4.0 (**2026-09-30**) | Zero dependencies, supports React/Vue/Angular/vanilla; **the model closest to Obsidian** (tabs + groups + grid + splitview); the most active releases |
| **rc-dock** | [ticlo/rc-dock](https://github.com/ticlo/rc-dock) | Apache-2.0 | **Unverified** | 4.1.0 (**2026-09-30**) | React-only, supports drag docking and floating windows, similarly active |
| **FlexLayout** | [caplin/FlexLayout](https://github.com/caplin/FlexLayout) | MIT | 1,363 | 0.11.1 (2026-09-26) | React-only, powerful but v0.x (API not stable) |
| **Golden Layout** | [golden-layout/golden-layout](https://github.com/golden-layout/golden-layout) | MIT | 6,719 | 2.6.0 (**2022-09-26**) | Highest stars but **releases stopped in 2022**; Golden Layout was originally designed in the jQuery era |
| **react-mosaic** | [nomcopter/react-mosaic](https://github.com/nomcopter/react-mosaic) | Apache-2.0 | 4,800 | 7.2.1 (2026-09-28) | **Tiling windows** rather than "tabs + splits"; a different interaction paradigm |
| **allotment** | [johnwalley/allotment](https://github.com/johnwalley/allotment) | MIT | 1,261 | 1.20.5 (2025-12-19) | Only **draggable split panes** (VS Code-style split view); no tabs or drag-docking |

- **Recommendation [Inference]**: use **dockview** as the layout engine for the main area and sidebars (it is the only zero-dependency library with all four of "tabs + groups + grid + splits" and continuous releases), and **implement the semantics of linked views yourself** (this is product logic and should not be outsourced). If dockview has React 19 compatibility problems (**unverified**), fall back to **allotment (splits only) + a self-built tab bar** — this path is actually more controllable, because Obsidian's tab-bar interactions (drag drop-zone highlighting, dragging out into a window) inherently require customization anyway.

#### 4) Right backlinks panel (Backlinks / Outgoing / Unlinked mentions)

- **Obsidian behavior** [Fact, [help/backlinks](https://obsidian.md/help/plugins/backlinks) + [help/outgoing-links](https://obsidian.md/help/plugins/outgoing-links)]:
  - **Two collapsible sections**: **Linked mentions** (backlinks pointing to the current note) and **Unlinked mentions** (unlinked occurrences of the current note's **name** elsewhere). The original documentation defines only these two; **Outgoing links is an independent core plugin** (its own tab, its own documentation page).
  - Panel options: **Collapse results**, **Show more context** (whether to truncate to the whole paragraph), **Change sort order**, **Show search filter** (filter mentions using the full search syntax).
  - **Follow vs fixed**: the backlinks tab follows the **currently active tab** by default; the command *Backlinks: Open backlinks for the current note* opens a **linked backlinks tab**, which has a link icon and is **locked to a particular note**.
  - **Two presentations**: a sidebar tab, or **"Backlink in document"** (rendering backlinks at the bottom of the note body), the latter can be set to turn on automatically.
  - Files matched by **Excluded files** **do not appear in Unlinked mentions**.
- **Algorithm for Unlinked mentions** [Inference]: take the current note's **filename + all aliases** as the main strings, and do case-insensitive multi-pattern matching in the **plain text** of other notes (stripping code blocks and link syntax); a hit counts as "unlinked" only if that position **is not inside an existing `[[...]]`**; then offer "convert to link with one click".
- **Difficulty: Medium.** Linked/Outgoing only need index queries (low); **Unlinked mentions is the real difficulty** — it is an O(note count × text length) multi-pattern search and must be **maintained incrementally** (otherwise every note switch scans the whole vault, which stalls with thousands of notes). **Suggested implementation** [Inference]: build an inverted index of "filename/alias → occurrence positions" and update it incrementally on file changes; use Aho-Corasick-style multi-pattern matching rather than N `indexOf` calls.
- **Open-source alternative**: no direct equivalent; needs to be built in-house. The search layer can use `minisearch` (7.2.0, MIT) or `flexsearch` (0.8.212, Apache-2.0).

#### 5) Local graph vs global graph

- **Obsidian behavior** [Fact, [help/graph](https://obsidian.md/help/plugins/graph)]: The difference between the two is **only one thing** — the global view shows the whole vault, while the local view shows "notes connected to the current note"; the local view has **an extra depth slider** ("each level of depth reveals notes connected to the notes revealed at the previous level"). All other settings are fully shared (Filters / Groups / Display / Forces; see the table in §3.6).
- **Difficulty: Medium.** The graph itself was evaluated in §3; the extra cost here is **"the graph panel as a linked view following the current note"** (i.e., the Linked views mechanism above) and **smooth re-layout when depth changes**.
- **Open-source alternative**: see §3.

#### 6) Ctrl+P command palette

- **Obsidian behavior** [Fact, [help/command-palette](https://obsidian.md/help/plugins/command-palette)]: opened with `Ctrl+P`; **supports fuzzy matching** (documentation example: typing `scf` finds **S**ave **c**urrent **f**ile); **since 1.8.3, recently used commands are sorted to the top**, but once filtering begins, **shorter commands take precedence over recently used ones**; frequently used commands can be **pinned**; the shortcut for each command can be viewed.
- **Difficulty: Low.**
- **Open-source alternatives (verified)**:

| Library | Repository | License | Stars | Version | Notes |
|---|---|---|---|---|---|
| **cmdk** | [dip/cmdk](https://github.com/dip/cmdk) (formerly `pacocoursey/cmdk`) | MIT | **12,998** | 1.1.1 (2025-03-14) | Unstyled and composable; the de facto standard; **note the repository has moved to `dip/cmdk`** |
| **kbar** | [timc1/kbar](https://github.com/timc1/kbar) | MIT | 5,255 | 1.0.0 (2026-08-10) | A complete framework with "action registration + shortcuts + search" built in |
| **ninja-keys** | [ssleptsov/ninja-keys](https://github.com/ssleptsov/ninja-keys) | MIT | **Unverified** | 1.2.2 (**2022-07-01**) | Web Component (not React); releases stalled |

- **Recommendation [Inference]**: **use `kbar`**. Rationale: Obsidian's command palette is essentially a trio of "**a global command registry + a shortcut system + a fuzzy-search UI**", and `kbar` packages exactly those three (`useRegisterActions` + `useHotkeys` + built-in search); `cmdk` only gives you UI primitives, leaving the registry and shortcut system to be built yourself. If you have already decided to build your own command registry (likely, because the plugin system will need it), then use `cmdk` for the pure UI.

#### 7) Ctrl+O quick switcher

- **Obsidian behavior** [Fact, [help/quick-switcher](https://obsidian.md/help/plugins/quick-switcher)]: `Ctrl+O`; **searches by name or alias**; `Enter` opens; **when there is no match, `Enter` directly creates a note with the same name**; **even when there is a similar match, `Shift+Enter` still forces creation of a new note with the exact name**; `Ctrl+Enter` opens in a new tab; **when the search term is empty, recent notes are shown** (with `↓`+`Enter` you can quickly switch between two notes); files matched by Excluded files are **down-ranked** rather than excluded.
- **⚠️ An important performance guardrail** [Fact]: *"Autocomplete functionality switches to a simpler result algorithm when the vault reaches 10,000 items to maintain optimal application performance."* — **Obsidian itself downgrades the algorithm at 10,000 items**. This shows that "name + alias fuzzy search" has a performance ceiling at the ten-thousand scale. [Inference] "Gezhi" must design for this at the index layer (e.g., a prefix index + a separate alias index, rather than a full fuzzy scan every time).
- **Difficulty: Low-medium** (UI low, indexing medium). `[[` autocomplete should **reuse the same index and ranking algorithm** to ensure the two places produce consistent results.
- **Open-source alternative**: `fuse.js` 7.5.0 (Apache-2.0) for small scale; above ten thousand, build an n-gram / prefix index yourself.

#### 8) Three view modes: source / live preview / reading

- **Obsidian behavior** [Fact, [help/edit-and-read](https://obsidian.md/help/edit-and-read)]:
  - The documentation splits the concepts into two layers: **Views (Reading / Editing)** and **Modes (Live Preview / Source)**.
  - **Reading view**: does not show Markdown syntax; clean reading. `Ctrl+E` toggles. **Holding `Ctrl` while clicking the view switcher opens editing and reading side by side**.
  - **Live Preview**: "*inline displays formatted text while hiding most of the Markdown syntax. When the cursor enters the formatted content, the underlying syntax appears for editing*". This is **not WYSIWYG** (WYSIWYM / semi-WYSIWYG) — **syntax is "hidden" rather than "nonexistent"**, which is exactly the capability boundary of the CodeMirror Decoration approach.
  - **Source mode**: shows all Markdown syntax as-is.
  - The command **Toggle Live Preview/Source mode** quickly switches between the two editing modes.
- **Difficulty: High (the Live Preview part).** Reading view is medium (`markdown-it` rendering + safe HTML sanitization), source mode is low (the editor's default state). Live Preview is what is in the PoC checklist in §1.5.
- **Open-source alternative**: none directly; this is the job of CodeMirror Decoration / ProseMirror custom Nodes.
- **Recommendation for "Gezhi" [Inference]**: **do not promise "true WYSIWYG"**. Obsidian's explicit "hide syntax, reveal it when the cursor enters" is an **achievable contract that users have already accepted**; whereas "complete WYSIWYG + Markdown as the source of truth" is mathematically impossible to do losslessly (Markdown has too many equivalent spellings: `*x*` vs `_x_`, setext vs atx headings, hard line breaks), and will inevitably face drift between "what the user saved" and "what the user sees".

#### 9) YAML frontmatter properties panel (Properties)

- **Obsidian behavior** [Fact, [help/properties](https://obsidian.md/help/properties)]:
  - Entry points: the command **Add file property**, the shortcut **`Ctrl+;`**, the tab right-click menu, or typing `---` directly at the start of the file.
  - In the UI, each property is a row of "**name input + value input**".
  - **Default/special properties**: `tags`, `cssclasses`, `aliases`.
  - **Supported types**: Text, List, Number, Checkbox, Date, Date & time, Tags.
  - **Key constraint**: *"Once a property type is assigned to a property name, all properties with that name across your vault will use the same type."* — **types are vault-global**, not per-note. This must be reflected in the data model (a vault-level `property types` registry is needed).
  - **Display modes** (Settings → Editor → Properties in document): **Visible** (default, shown at the top of the note) / **Hidden** (hidden, but still viewable in the Properties view sidebar) / **Source** (shown as raw YAML).
  - **Explicitly unsupported** (Not supported in the official list): **nested properties** (suggest using source mode), **batch editing** (suggest using external tools), **Markdown in properties** (*"This is an intentional limitation, because properties are small, atomic pieces of information that are readable by both humans and machines"*). `null` can be used to find properties that "exist but are empty" (but empty quotes `""` or empty brackets `[]` do not count as empty).
  - **Format details** [Fact]: the property name and value are separated by `: `; **property names must be unique within a single note**; **hashtags in Text properties do not generate tags**; internal links in Text properties **must be quoted** (`link: "[[Episode IV]]"`), and Obsidian automatically adds quotes when typing manually.
- **Difficulty: Medium.** The UI itself is not hard; the hard part is **"the type registry + cross-note type consistency + bidirectional sync with source mode without destroying the user's hand-written YAML formatting"** (YAML comments, indentation, quote style, and key order are all lost in round-trips — a known characteristic of the `yaml` library). **[Inference] Recommendation: when reading, parse with `yaml`; when writing, perform only **minimal text edits** (locate the corresponding line and change the value); do not re-serialize the entire frontmatter, otherwise the user's formatting will be eaten.**
- **Open-source alternative**: `yaml` 2.9.1 (ISC) for parsing; build the UI yourself.

#### 10) Tags

- **Obsidian behavior** [Fact, [help/tags](https://obsidian.md/help/tags)]:
  - Two sources: **inline `#tag`** and **frontmatter `tags:`** (**must be a list** in YAML).
  - **Nested tags** use `/`: `#inbox/to-read`. **Note the matching semantics difference** [Fact]: `tag:inbox` matches `#inbox` **and all nested tags** (such as `#inbox/to-read`); but searching `tag:#work` **does not** return `#myjob/work`. → Together these two sentences show that **prefix matching works in the direction "parent tag matches child tag", not the reverse**.
  - **Valid characters**: letters, digits, underscore `_`, hyphen `-`, slash `/` (for nesting), and "commonly accepted Unicode characters, including emoji and other symbols".
  - **Must contain at least one non-digit character**: `#1984` is invalid, `#y1984` is valid.
  - **Case-insensitive**: `#tag` and `#TAG` are treated as the same; the Tags view displays the casing from **when it was first created**.
  - **Cannot contain spaces**; `#camelCase` / `#PascalCase` / `#snake_case` / `#kebab-case` are recommended.
- **Difficulty: Low-medium.** Parsing and indexing are not hard (a one-line regex + a prefix tree); the difficulties are (1) the tag panel's tree display and rename cascade, and (2) the above semantics of "parent matches child, child does not match parent" must remain consistent in both search and graph.
- **Open-source alternative**: none. The `Tags view` is a core plugin ([help/tags-view](https://obsidian.md/help/plugins/tags-view)).

#### 11) Search syntax

**[Fact]** Fully verified from [help/search](https://obsidian.md/help/plugins/search). This is a checklist that **must be implemented item by item**:

**Basics**
- Space separation = **AND** (each term matches independently within each file); `OR` = either; `-` prefix = negation (`meeting -work`); `-` can apply to a parenthesized group (`meeting -(work meetup)` = has meeting and **not "both present"**).
- Parentheses control precedence: `meeting (work OR meetup) personal`.
- Quotes = exact phrase `"star wars"`; quotes inside a phrase are escaped with backslash `"they said \"hello\" to each other"`.
- **Property search**: `[property]` matches "has that property"; `[property:value]` matches the value; `[property:null]` matches "exists but is empty". Property names and values **both support subqueries** (parentheses, `OR`, quotes, regex).
- Comparison operators: `[duration:<5]`, `[duration:>5]` (**must be wrapped in square brackets or quotes**).
- **Regex**: wrapped in `/.../`, **JavaScript style** (`/\d{4}-\d{2}-\d{2}/`), can be combined with operators `path:/\d{4}-\d{2}-\d{2}/`.

**Operator table (verified item by item)**

| Operator | Semantics | Notes |
|---|---|---|
| `file:` | Find text in the **filename**; matches **any file** in the vault | `file:.jpg`, `file:202209` |
| `path:` | Find text in the **file path**; matches any file | `path:"Daily notes/2022-07"` |
| `content:` | Find text in the **file content** | `content:"happy cat"` |
| `match-case:` | Case-sensitive matching | `match-case:HappyCat` |
| `ignore-case:` | Case-insensitive matching | `ignore-case:ikea` |
| `tag:` | Find **tags in files** | `tag:#work`; **ignores code blocks and non-Markdown content**, so it is often faster and more accurate than full-text searching `#work`; `tag:#work` does **not** return `#myjob/work` |
| `line:` | At least one **line** matches | `line:(mix flour)`; `-line` negates |
| `block:` | Matches within the **same block** | `block:(dog cat)`; **requires parsing the Markdown of each file**, slower |
| `section:` | Matches within the **same section** (text between two headings) | `section:(dog cat)` |
| `task:` | Matches in **task list items** | `task:call` |
| `task-todo:` | Matches in **incomplete** tasks | `task-todo:call` |
| `task-done:` | Matches in **completed** tasks | `task-done:call` |

**Other behaviors confirmed in the official documentation**
- **By default only the path/filename of notes and canvases is searched**; to search the path or filename of **any file**, you must use `path:` or `file:`.
- **Only the content of notes and canvases is searched** (attachment content is not searched).
- Supports **Explain search term**, result sorting (filename A-Z/Z-A, modified time new→old/old→new, creation time new→old/old→new), and **Copy search results**.
- **Embedded search**: writing a ` ```query ` code block in a note embeds the search results into the note.
- Files matched by **Excluded files** do not appear in search results.

- **Difficulty: Medium-high.** Implementing the UI and parsing item by item is not hard; the hard parts are that **`block:` and `section:` require structured parsing** (another reason in §2 that "the indexing path must use a high-fidelity parser"), and **performance**: even the official docs admit `block:` is slow.

### 4.2 Other small items worth borrowing

| Feature | Obsidian behavior | Difficulty | Reference |
|---|---|---|---|
| **Status bar** | Bottom-right; shows editing-mode toggle, word count, etc. | Low | [help/status-bar](https://obsidian.md/help/status-bar) |
| **Workspaces plugin** | **Save/restore the entire window layout** (`workspaces.json`) | Medium | [help/workspaces](https://obsidian.md/help/plugins/workspaces) |
| **File recovery** | Periodic snapshots + recovery (`snapshots/`) | Medium-high | [help/file-recovery](https://obsidian.md/help/plugins/file-recovery) |
| **Properties overview view** | Vault-wide property list, rename properties | Low-medium | [help/properties-view](https://obsidian.md/help/plugins/properties-view) |
| **Tags overview view** | Tag tree + nested membership | Low | [help/tags-view](https://obsidian.md/help/plugins/tags-view) |

### 4.3 Parts explicitly **not to copy**

| What not to copy | Reason |
|---|---|
| **Plugin API / community plugin ecosystem** | This is Obsidian's biggest moat and also its heaviest liability: once an API is public, **every internal refactor becomes a breaking change**, and you must maintain version compatibility and a security sandbox (plugins can read the whole vault and make network requests). **[Inference] "Gezhi" should make core features solid and postpone the plugin system to v2, with only restricted internal plugins.** |
| **Obsidian Sync / Publish** | Requires an account system, end-to-end encryption, conflict resolution, CDN, and billing. Conflicts with the "local-first learning tool" positioning. **Solve sync with Git / the user's own cloud drive; do not build it yourself.** |
| **Canvas (whiteboard)** | An independent large subsystem (infinite canvas + nodes + connections + embedded notes). Reference [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw) (MIT, **133,336** stars) or [tldraw/tldraw](https://github.com/tldraw/tldraw) (**note: custom commercial license, not MIT**; read the [LICENSE.md](https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md) carefully) rather than building it in-house. **Recommend not doing it in v1.** |
| **"True" WYSIWYG + lossless Markdown round-trip** | Mathematically untenable (see the inference in §4.1 item 8). Promising it is digging a hole for yourself. |
| **Excluded files (exclusion patterns)** | It looks simple, but it must permeate every subsystem: **search, graph, backlinks, quick switcher, Unlinked mentions** (the official documentation declares this behavior separately in each place). **For v1, recommend only directory-level exclusion of the `.gezhiignore` type, not wildcard patterns.** |
| **Mobile** | Obsidian's `workspace-mobile.json`, mobile Ribbon, and Navigation bar are a whole separate set of interactions. **Focus on Windows desktop.** |

---

## 5. Vault Data Model

### 5.1 Obsidian's actual approach (verified)

#### 5.1.1 The nature of a vault

**[Fact, [help/data-storage](https://obsidian.md/help/data-storage)]**:
- *"A vault is just a regular folder — including any subfolders — that you choose."* Notes are **plain-text Markdown files**.
- *"When you open a folder as a vault, Obsidian creates a `.obsidian` folder in the vault root."* → **The marker that identifies a vault is the `.obsidian/` folder in its root** (this is an **Inference**; the documentation does not use the word "marker", but "opening a folder creates `.obsidian`" is an explicit description of the mechanism; **Obsidian has no top-level vault manifest file**, which is an [Inference]).
- Obsidian **watches the vault directory**, and external changes are reflected automatically.
- **Two explicit prohibitions** [Fact]: (1) **Do not create a vault inside another vault** (internal links are vault-local, and nesting causes link-resolution errors); (2) **Do not create a vault inside Obsidian's system configuration directory** (it will cause data corruption/loss).

#### 5.1.2 `.obsidian/` directory structure

**[Fact, the table given in the official documentation]**

| File/directory | Purpose |
|---|---|
| `app.json` | **Core settings** (Core Obsidian settings) |
| `hotkeys.json` | **Shortcut customization** |
| `appearance.json` | **Theme and appearance settings** |
| `plugins/` | Installed **community plugin data** |
| `themes/` | Installed themes |
| `snippets/` | Custom CSS snippets |
| `workspace.json` | **Current workspace layout** (open tabs, panels) |
| `workspaces.json` | **Saved workspace layouts** |

**Official Git advice** [Fact]: *"consider adding `.obsidian/workspace.json` and `.obsidian/workspaces.json` to your `.gitignore`. These files update every time you open a file, which creates noisy commits."*

→ **[Inference] From this we can derive a general "commit / ignore" criterion**: **commit files that describe "user intent and content" (`app.json`, `hotkeys.json`, `appearance.json`, `templates/`, `snippets/`, `plugins/<id>/data.json`); ignore files that describe "session state" (`workspace.json`, `workspaces.json`, `cache/`).**

**About other common files (`core-plugins.json`, `community-plugins.json`, `graph.json`, `backlink.json`, etc.)**: the official documentation **does not** list a complete set, but `core-plugins.json` / `community-plugins.json` and the `workspace-mobile.json` mentioned in the Ribbon documentation are [Fact] to exist (the latter appears explicitly in [help/ribbon](https://obsidian.md/help/ribbon): *"it synchronizes ... when app settings (in the `workspace.json` and `workspace-mobile.json` files) are synchronized"*).
**[Unverified]**: the concrete structure and existence of `core-plugins-migration.json`, `graph.json`, `backlink.json`, `templates.json`, `daily-notes.json`, `bookmarks.json`, `canvas.json`, `snapshots/`, and `cache/` — these come from community observation rather than official documentation, and **could not be verified through first-hand sources this time**. If you need precise compatibility with Obsidian's configuration format (for example, an "import Obsidian vault" feature), you must **test a real vault directory hands-on**.

#### 5.1.3 Global config directory and `obsidian.json` (multi-vault registry)

**[Fact, [help/data-storage](https://obsidian.md/help/data-storage)]**

| Platform | Global config location |
|---|---|
| Windows | **`%APPDATA%\Obsidian\`** |
| macOS | `/Users/<user>/Library/Application Support/obsidian` |
| Linux | `$XDG_CONFIG_HOME/obsidian/` or `~/.config/obsidian/` |

**Note**: the official documentation writes `%APPDATA%\Obsidian\` (capitalized first letter), while third-party documentation and test scripts commonly use lowercase `%APPDATA%\obsidian\` — **Windows paths are case-insensitive, so both work**, but when writing code **do not depend on casing**. [Inference]

**[Fact, third-party sources]** `obsidian.json` is located at `%APPDATA%\obsidian\obsidian.json`, records **all known vaults**, and uses `"open": true` to mark **the last opened vault**. Community scripts delete `"open":true` precisely to force Obsidian to show the vault picker on startup:
- [DrSapling/Start-Obsidian-Vault-Manager · HOW-IT-WORKS.md](https://raw.githubusercontent.com/DrSapling/Start-Obsidian-Vault-Manager/main/README-resources/HOW-IT-WORKS.md): *"Obsidian stores information about last visited Vault inside `obsidian.json` file in default install location `\AppData\Roaming\obsidian\obsidian.json` by adding `"open":true` next to last visited one."*
- [jaredrhod/ai-memory-vault · TROUBLESHOOTING.md](https://raw.githubusercontent.com/jaredrhod/ai-memory-vault/main/TROUBLESHOOTING.md): *"Obsidian only opens vaults it knows about, and it learns about them from a registry file called `obsidian.json` (… Windows: `%APPDATA%\obsidian\obsidian.json` (lowercase folder) …)"*, and notes *"Obsidian must be closed while it edits, because the app rewrites that file on quit."*

**[Inference] The shape of `obsidian.json`** (the structure itself is **unverified**; the following is a reasonable guess for design reference only):
an object keyed by vault ID, each vault carrying `path`, `ts` (timestamp), and an optional `open` flag. **This is a pattern that "Gezhi"'s `vaults.json` can borrow directly** (see §5.2.4).

#### 5.1.4 Multi-vault switching

**[Fact, [help/manage-vaults](https://obsidian.md/help/manage-vaults)]**:
- On first launch, the user is asked to **Create new vault** (enter a name + Browse to choose a directory) or **Open folder as vault** (choose an existing folder).
- Switching is done via the **Vault switcher** (the first icon in the Ribbon; on mobile it is at the bottom-left/in the ribbon).
- Each vault has its own `.obsidian/`, so **settings, plugins, themes, and shortcuts are all per-vault**; only the account/global appearance live in `%APPDATA%\Obsidian\`.
- **[Inference]** Each vault can open an independent window ("per-vault window") — this is observable in Obsidian, but **was not verified from official documentation** this time and is marked [Unverified].

#### 5.1.5 Metadata cache (an important architectural reference)

**[Fact, [help/data-storage](https://obsidian.md/help/data-storage)]**:
- Obsidian maintains a **metadata cache**: *"a record of each file's properties, headings, tags, and links. This cache powers features like Graph view, Outline view, backlinks, and search."*
- **The cache is stored in IndexedDB** (a browser-level local database), **not in a file inside the vault**.
- The cache is **automatically rebuildable**; when out of sync, it can be manually rebuilt via **Settings → Files and links → Rebuild cache**.
- A known failure mode: when Apple Lockdown Mode is on and Obsidian has not been excluded, IndexedDB cannot be written, and **the entire index is rebuilt on every launch**.

> **[Inference] This is the most valuable item in this section**: Obsidian **puts the cache in IndexedDB outside the vault**, rather than in `.obsidian/cache/` inside the vault. This corroborates the recommendation in §5.2.5: **derived caches should not pollute the vault directory**.

### 5.2 Gezhi recommended scheme

#### 5.2.1 Design principles

1. **Note files are the sole source of truth**, and **must be directly openable by Obsidian / VS Code / Typora** (using standard `.md`, standard YAML frontmatter, and `[[wikilink]]` syntax compatible with Obsidian).
2. **Separate configuration files from caches**: configuration (user intent) goes into the vault; caches (rebuildable derived data) **stay out of the vault**.
3. **The default location is the user's "Documents" directory**, but **it must be queried through the Shell known-folder API**; do not hard-code `%USERPROFILE%\Documents`.
4. **Support multiple vaults**, with the registry in `%APPDATA%\Gezhi\` (following Obsidian's pattern).
5. **Do not create "nested vaults"**: when creating, check whether the selected directory is already inside another vault.

> **⚠️ Key implementation requirement for the "Documents" directory (must be written into the technical plan)**: Windows' Documents is a **known folder**, and **the user can redirect its location** (right-click Properties → Location → Move). **OneDrive also often takes it over** (becoming `%USERPROFILE%\OneDrive\Documents`). Therefore:
> - **Correct approach**: call the Shell known-folder API to get the real path. In Electron this is `app.getPath('documents')` (underneath it goes through SHGetKnownFolderPath). **[Inference], Electron version behavior needs verification.**
> - **Wrong approach**: concatenating `process.env.USERPROFILE + '\\Documents'`.
> - **Additional note**: if Documents is taken over by OneDrive, a large vault will trigger **Files On-Demand** to turn files into "online-only" placeholders, causing slow reads or offline failures. **When creating a vault, detect whether the path is under OneDrive and prompt the user to "always keep on this device".** [Inference, based on the experiential description in [ai-memory-vault TROUBLESHOOTING](https://raw.githubusercontent.com/jaredrhod/ai-memory-vault/main/TROUBLESHOOTING.md)]

#### 5.2.2 Directory tree

```
%USERPROFILE%\Documents\Gezhi\          ← default vault root (the real path is obtained via the known-folder API)
└── My Learning Vault\                  ← a vault (library)
    ├── .gezhi\                         ← [configuration directory, mirroring .obsidian]
    │   ├── vault.json                  ← vault identity and version (id / name / schemaVersion / createdAt)
    │   ├── app.json                    ← application settings (editor, files and links, search behavior)
    │   ├── appearance.json             ← theme, font size, CSS variables
    │   ├── core-plugins.json           ← core plugin toggles
    │   ├── graph.json                  ← graph view settings (Filters / Groups / Display / Forces)
    │   ├── workspace.json              ← current workspace layout (tabs, panels, ribbon, sidebars) ※ recommend gitignore
    │   ├── workspaces.json             ← saved layouts ※ recommend gitignore
    │   ├── hotkeys.json                ← shortcut customization
    │   ├── templates\                  ← template files (editable by the user)
    │   │   └── reading-notes.md
    │   ├── snippets\                   ← custom CSS snippets
    │   └── plugins\                    ← [reserved] internal plugins; may be empty in v1
    │
    ├── notes\                          ← default location for new notes (changeable in app.json)
    │   ├── learning-methods\
    │   │   ├── feynman-technique.md
    │   │   └── spaced-repetition.md
    │   ├── reading\
    │   │   └── Deliberate Practice.md
    │   └── index.md                    ← home page / MOC (Map of Content)
    │
    ├── attachments\                    ← images, PDFs, audio; organized into YYYY/MM subdirectories to avoid an oversized single directory
    │   └── 2026\10\
    │       └── 20261001-143022-graph-screenshot.png
    │
    ├── .trash\                         ← deleted notes (soft delete), mirroring Obsidian's recycle bin
    └── .gitignore                      ← optional: ignore session-state files such as workspace.json
```

**Explanation and trade-offs**

- **Why call it `.gezhi` instead of reusing `.obsidian`**: reuse would let "Gezhi" and Obsidian overwrite keys each does not understand, and any format drift would corrupt the user's configuration. **But the user should be able to see the correspondence at a glance**, so the naming is isomorphic (`app.json` / `appearance.json` / `graph.json` / `workspace.json` / `hotkeys.json`). **[Inference]**
- **Why put notes in a `notes\` subdirectory instead of the vault root**: to reserve sibling positions for `attachments\`, `.trash\`, and a future `templates\`, preventing the root from getting mixed with the user's own files.
- **Attachment filename normalization**: use `YYYYMMDD-HHmmss-<original filename slug>.<ext>`, which retains readability while avoiding duplicate-name overwrites and encoding problems of Chinese filenames on different filesystems. [Inference]
- **Do not put any "Gezhi-proprietary" visible files at the vault root** (other than the two dot-directories `.gezhi/` and `.trash/`), ensuring that "opening this folder with another tool" shows just a bunch of normal Markdown.

#### 5.2.3 `.gezhi/vault.json`

```json
{
  "schemaVersion": 1,
  "id": "0f3a7c2e-9b41-4d8a-b6f2-1c5e8d7a3b90",
  "name": "My Learning Vault",
  "createdAt": "2026-10-01T05:12:33.000Z",
  "createdBy": "Gezhi 0.1.0",
  "notesFolder": "notes",
  "attachmentsFolder": "attachments",
  "trashFolder": ".trash",
  "attachmentNamePattern": "{yyyy}{MM}{dd}-{HH}{mm}{ss}-{slug}",
  "newNoteLocation": "notes",
  "linkFormat": "wikilink",
  "attachmentLinkFormat": "wikilink",
  "useMarkdownLinks": false,
  "showUnsupportedFiles": false
}
```

| Field | Purpose | Notes |
|---|---|---|
| `schemaVersion` | Configuration format version, used for future migrations | **Must be read first**; determines the subsequent parsing logic |
| `id` | Stable UUID of the vault, corresponding to `vaults.json` | **Do not use the path as the ID** — users will move vaults |
| `notesFolder` / `attachmentsFolder` / `trashFolder` | Directory conventions | Store **relative paths**, not absolute paths |
| `linkFormat` | Whether generated links use `[[wikilink]]` or `[md](md)` | Mirrors Obsidian's `useMarkdownLinks`. [Inference] The exact key name of the corresponding Obsidian setting is **unverified** |
| `newNoteLocation` | Location for new notes | Mirrors Obsidian's "Default location for new notes" [Fact: this setting exists in [help/settings](https://obsidian.md/help/settings)] |

#### 5.2.4 App-level vault registry `%APPDATA%\Gezhi\vaults.json`

```json
{
  "schemaVersion": 1,
  "lastOpenedVaultId": "0f3a7c2e-9b41-4d8a-b6f2-1c5e8d7a3b90",
  "vaults": [
    {
      "id": "0f3a7c2e-9b41-4d8a-b6f2-1c5e8d7a3b90",
      "name": "My Learning Vault",
      "path": "C:\\Users\\LINKIT\\Documents\\Gezhi\\My Learning Vault",
      "lastOpenedAt": "2026-10-01T05:12:33.000Z",
      "pinned": true
    },
    {
      "id": "b71d4e88-2a6c-45f1-9e30-7d2b8c4a5f16",
      "name": "Course Notes",
      "path": "D:\\Study\\Course Notes",
      "lastOpenedAt": "2026-09-18T11:02:07.000Z",
      "pinned": false
    }
  ]
}
```

**Design points** [Inference]:
- `lastOpenedVaultId` mirrors Obsidian's `"open": true` mechanism, but uses an **explicit ID field** rather than "putting a marker on some object" — the latter is ambiguous when multiple vaults are open simultaneously.
- **Robustness checks at startup (mandatory)**: for each vault, verify (1) whether the path exists, (2) whether `.gezhi/vault.json` exists under that path, (3) whether the `id` matches the registry. If any check fails → mark it "missing" and **prompt the user to locate or remove it**; never silently delete it (the user may simply have unplugged an external drive).
- **Path changes**: if the user moves the vault folder, the `id` stays the same but the `path` becomes invalid → provide a "relocate vault" feature that rebinds by `id`. **This is exactly the value of using a UUID rather than a path as the ID.**

#### 5.2.5 Vault-level `app.json`

```json
{
  "schemaVersion": 1,
  "editor": {
    "defaultViewMode": "livePreview",
    "defaultEditingMode": "livePreview",
    "showLineNumbers": false,
    "readableLineLength": true,
    "strictLineBreaks": false,
    "autoPairBrackets": true,
    "autoPairMarkdown": true,
    "smartLists": true,
    "indentUsingTabs": false,
    "indentVisualWidth": 4,
    "propertiesInDocument": "visible",
    "showEditingModeInStatusBar": true,
    "vimMode": false,
    "spellcheck": true,
    "spellcheckLanguages": ["zh-CN", "en-US"]
  },
  "filesAndLinks": {
    "newNoteLocation": "notes",
    "attachmentFolderPath": "attachments",
    "useMarkdownLinks": false,
    "newLinkFormat": "shortest",
    "automaticallyUpdateInternalLinks": true,
    "detectAllFileExtensions": false,
    "excludedFolders": [".trash", ".gezhi"],
    "excludedPatterns": [],
    "rebuildCacheOnStartup": false
  },
  "search": {
    "showMoreContext": false,
    "collapseResults": true
  },
  "quickSwitcher": {
    "showExistingOnly": true,
    "showAttachments": false
  },
  "backlinks": {
    "showLinkedMentions": true,
    "showUnlinkedMentions": true,
    "collapseResults": false,
    "showMoreContext": false,
    "sortOrder": "modified-desc",
    "backlinkInDocument": false,
    "searchFilter": ""
  },
  "appearance": {
    "baseTheme": "dark",
    "accentColor": "#7c5cff",
    "interfaceFontSize": 15,
    "textFontSize": 16,
    "translucency": false
  }
}
```

**⚠️ Compatibility with Obsidian settings** [Fact, [help/settings](https://obsidian.md/help/settings)]: Obsidian's Editor settings do indeed include `Default view for new tabs`, `Default editing mode`, `Readable line length`, `Strict line breaks`, `Properties in document`, `Show line numbers`, `Show indentation guides`, `Auto-pair brackets`, `Auto-pair Markdown syntax`, `Smart lists`, `Indent using tabs`, `Indent visual width`, `Vim key bindings`, `Spellcheck`, `Spellcheck languages`, `Convert pasted HTML to Markdown`, `Fold heading`, `Fold indent`, `Right-to-left`, `Always focus new tabs`, `Show editing mode in status bar`, `Notify if startup takes longer than expected`, and other items, plus `Default location for new notes` under Files and links. **The key names in the JSON above are designed by "Gezhi" itself and are not guaranteed to match Obsidian's `app.json` key names** (Obsidian's `app.json` key names are **unverified**). If you want to implement an Obsidian import feature, you must **test a real `app.json` hands-on**.

#### 5.2.6 `.gezhi/graph.json` (mirroring Obsidian Graph view settings)

**[Fact] Basis for grouping**: Obsidian's official Graph view documentation gives the four groups Filters / Groups / Display / Forces and their respective settings (listed in §3.6). The JSON below **maps those settings item by item into fields**:

```json
{
  "schemaVersion": 1,
  "filters": {
    "searchQuery": "",
    "showTags": false,
    "showAttachments": false,
    "existingFilesOnly": true,
    "showOrphans": true
  },
  "groups": [
    { "id": "g1", "query": "path:learning-methods", "color": "#7c5cff" },
    { "id": "g2", "query": "tag:#reading", "color": "#22c55e" },
    { "id": "g3", "query": "tag:#to-organize", "color": "#f59e0b" }
  ],
  "display": {
    "showArrows": false,
    "textFadeThreshold": 0.35,
    "nodeSize": 1.0,
    "linkThickness": 1.0
  },
  "forces": {
    "centerForce": 0.5,
    "repelForce": 10.0,
    "linkForce": 1.0,
    "linkDistance": 30.0
  },
  "localGraph": {
    "depth": 2
  },
  "colorSlots": {
    "fill": "#9ca3af",
    "fillFocused": "#7c5cff",
    "fillTag": "#22c55e",
    "fillAttachment": "#38bdf8",
    "fillUnresolved": "transparent",
    "fillHighlight": "#ffffff",
    "circle": "#1f2937",
    "line": "#4b5563",
    "lineHighlight": "#7c5cff",
    "arrow": "#4b5563",
    "text": "#e5e7eb"
  }
}
```

- The 11 slots of `colorSlots` **correspond directly to the Obsidian CSS classes verified in §3.1** (`color-fill` / `color-fill-focused` / `color-fill-tag` / `color-fill-attachment` / `color-fill-unresolved` / `color-fill-highlight` / `color-circle` / `color-line` / `color-line-highlight` / `color-arrow` / `color-text`). **Only by defining these 11 slots clearly can the graph's rendering layer and theme layer be decoupled.**
- The four fields of `forces` **correspond one-to-one** to Obsidian's Center force / Repel force / Link force / Link distance (§3.6 [Fact]), and therefore **can be mapped directly to `d3-force`'s `forceCenter` / `forceManyBody` / `forceLink.strength` / `forceLink.distance`** (the technical basis for the recommendation in §3.4).
- `textFadeThreshold` uses a **normalized zoom value** (0–1) rather than a pixel threshold, avoiding inconsistent behavior across different DPIs. [Inference]

#### 5.2.7 `.gezhi/workspace.json`

```json
{
  "schemaVersion": 1,
  "activeTabGroupId": "tg-main",
  "ribbon": {
    "visible": true,
    "items": [
      { "id": "vault-switcher", "visible": true },
      { "id": "quick-switcher", "visible": true },
      { "id": "graph-global", "visible": true },
      { "id": "graph-local", "visible": true },
      { "id": "search", "visible": true },
      { "id": "settings", "visible": true }
    ]
  },
  "sidebar": {
    "left": {
      "collapsed": false,
      "width": 260,
      "tabGroups": [
        {
          "activeTabId": "t-files",
          "tabs": [{ "id": "t-files", "type": "file-explorer", "pinned": true }]
        },
        {
          "activeTabId": "t-search",
          "tabs": [
            { "id": "t-search", "type": "search", "pinned": false },
            { "id": "t-tags", "type": "tags-view", "pinned": false }
          ]
        }
      ]
    },
    "right": {
      "collapsed": false,
      "width": 320,
      "tabGroups": [
        {
          "activeTabId": "t-backlinks",
          "tabs": [
            { "id": "t-backlinks", "type": "backlinks", "followActiveNote": true, "pinned": false },
            { "id": "t-outline", "type": "outline", "followActiveNote": true, "pinned": false },
            { "id": "t-links-locked", "type": "backlinks", "followActiveNote": false, "lockedNotePath": "notes/index.md", "pinned": true }
          ]
        }
      ]
    }
  },
  "mainTabGroups": [
    {
      "id": "tg-main",
      "direction": "horizontal",
      "size": 0.65,
      "activeTabId": "tab-1",
      "tabs": [
        { "id": "tab-1", "type": "markdown", "path": "notes/index.md", "viewMode": "livePreview", "pinned": true },
        { "id": "tab-2", "type": "graph", "scope": "global" }
      ]
    },
    {
      "id": "tg-side",
      "direction": "horizontal",
      "size": 0.35,
      "activeTabId": "tab-3",
      "tabs": [
        { "id": "tab-3", "type": "graph", "scope": "local", "depth": 2 }
      ]
    }
  ],
  "statusBar": { "showEditingMode": true, "showWordCount": true },
  "recentFiles": ["notes/index.md", "notes/learning-methods/feynman-technique.md"]
}
```

**Key design points** [Inference]:
- **The two fields `followActiveNote` + `lockedNotePath` are exactly the "follow / lock" semantics of Backlinks** (the Obsidian behavior in §4.1 item 4 [Fact]). **This boolean must exist explicitly in the data model**, otherwise the UI cannot correctly express "whether this backlinks panel is pinned". This is the easiest place to miss.
- **The layout uses a recursive tab-group tree** (`direction` + `size` + child groups), not flat coordinates. This way "Split right/down" is a single tree insertion, and serialization is natural.
- **`recentFiles` goes in the workspace rather than vault-level configuration** — it is session state and should be gitignored along with `workspace.json`.

#### 5.2.8 Index / cache design

**[Fact] Obsidian's choice**: the metadata cache is stored in **IndexedDB** (browser-level), **not in the vault**; it is automatically rebuildable and can be manually rebuilt.

**[Inference] The corresponding design for "Gezhi"**:

**Recommended storage location: layered, by default under `%APPDATA%\Gezhi\cache\<vaultId>\`**

| Option | Advantages | Disadvantages | Recommendation |
|---|---|---|---|
| A. Put it in the vault at `.gezhi/index/` | Moves/backups with the vault; the cache is also synchronized during multi-machine sync | **Pollutes the vault directory** (although `.gezhi` is already a dot-directory); if the user syncs with Git/cloud drive, cache files cause conflicts and noise; the cache may be large | ✗ |
| B. Put it in `%APPDATA%\Gezhi\cache\<vaultId>\` | The vault stays clean; cache size is unaffected by the user's sync tools; **using `vaultId` as the directory name naturally means the cache survives moving the vault** | After the vault is moved to another machine, the cache must be rebuilt (acceptable; it is derived data anyway) | ✅ **Recommended** |
| C. Put it in IndexedDB (like Obsidian) | Zero file management, good transactionality | In Electron, IndexedDB collaboration with main-process file watching is convoluted; hard to debug; manual repair options other than "rebuild cache" are hard to provide | △ Usable, but less intuitive than B |

> **⚠️ Hard constraint**: **Whether you choose B or C, the cache must never be placed in the notes directory.** There are three reasons: (1) the user may sync the vault with Git or a cloud drive, and cache files cause conflicts and enormous noise; (2) the cache is a **rebuildable derived artifact**, and putting it into the "user data" directory breaks the product promise that "the vault is just a bunch of Markdown"; (3) Obsidian has already given the same answer with IndexedDB ([Fact]).

**Cache content and incremental strategy**

Principle: **use the content hash as the invalidation criterion, and re-parse only changed files.**

```
%APPDATA%\Gezhi\cache\<vaultId>\
├── index.json          ← global index (see below)
└── files\
    └── <pathHash>.json ← per-file parse artifact (or put everything into index.json, depending on scale)
```

A single-file record should contain at least:

| Field | Purpose |
|---|---|
| `path` (relative path within the vault, normalized to forward slashes) | Primary key |
| `contentHash` (e.g. xxhash/SHA-1) | **Invalidation criterion**: if the hash is unchanged, reuse it without re-parsing |
| `mtime` / `size` | **Fast pre-filter**: compare mtime+size first; if identical, skip reading and hash computation |
| `parsedAt` / `parserVersion` | When `parserVersion` changes, **force a full re-parse** (once the wikilink syntax changes, a full rebuild is mandatory, otherwise old and new parse results get mixed together) |
| `frontmatter` (raw YAML text + parsed object) | Properties panel, property search, `[prop:value]` queries |
| `propertyTypes` | Global property type registry (Obsidian's types are vault-global, §4.1 item 9 [Fact]) |
| `aliases[]` | Main strings for quick switcher and Unlinked mentions |
| `tags[]` (including nested structure) | Tag tree, `tag:` search, graph tag nodes |
| `headings[]` (level + line number + offset) | Outline view, `section:` search, `[[#heading]]` anchor completion |
| `blocks[]` (`^block-id` → offset) | `[[^^block reference]]` |
| `linksOut[]` (`{target, alias, isEmbed, line, col, resolved}`) | **Graph out-edges, Outgoing links** |
| `linkTextOccurrences[]` (positions in plain text where "other note names" occur) | **Source of the inverted index for Unlinked mentions** |
| `wordCount` / `taskCounts` | Status bar, `task:` search |

Supporting **reverse indexes** (can be built in memory and persisted):
- `targetPath → Set<sourcePath>`: **backlink queries**, graph in-edges, N-hop expansion of the local graph. **This is the most critical index**; without it, every backlink query would scan the whole vault.
- `tag → Set<path>` (including parent-tag aggregation, because "`tag:inbox` matches `#inbox/to-read`")
- `alias/name → Set<path>`: quick switcher and Unlinked mentions
- `propertyName → Set<path>`, `(property, value) → Set<path>`: property search

**The key to rebuild performance** (this determines whether the graph and backlinks can "open in a second"):
1. **Read the cache at startup and be usable immediately**; then, in the background, incrementally validate files whose mtime/size have changed.
2. **Re-parse only when the content hash changes** — renaming a file or switching tabs does not trigger a re-parse.
3. **Index construction must be interruptible and batchable**: a full rebuild of thousands of files should be sharded to yield the main thread / run in a worker, and progress should be shown in the UI (mirroring Obsidian's Rebuild cache).
4. **`parserVersion` is a necessity, not an option**: once the wikilink syntax changes even once (for example, adding support for `![[embed#heading]]`), the old cache is wrong, and there must be a one-click full rebuild.

---

## 6. Open-Source Projects for Reference

### 6.1 Overview table (License and activity verified)

| Project | Repository | License | Stars | Tech stack (language, verified) | Last push | Whole-project fork? |
|---|---|---|---|---|---|---|
| **Foam** | [foambubble/foam](https://github.com/foambubble/foam) | **MIT** | **17,431** | **TypeScript** (VS Code extension) | 2026-09-30 | ❌ Not the same form factor |
| **Dendron** | [dendronhq/dendron](https://github.com/dendronhq/dendron) | **Apache-2.0** | **7,473** | **TypeScript** (VS Code extension) | **2025-11-13** ⚠️ | ❌ Wrong form factor + stagnant |
| **Logseq** | [logseq/logseq](https://github.com/logseq/logseq) | **AGPL-3.0** | **45,099** | **Clojure/ClojureScript** | 2026-10-01 | ❌ Completely different language and stack |
| **AppFlowy** | [AppFlowy-IO/AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) | **AGPL-3.0** | **77,038** | **Dart / Flutter** | 2026-10-01 | ❌ Would require changing languages |
| **Anytype** | [anyproto/anytype-ts](https://github.com/anyproto/anytype-ts) (desktop) | **Any Source Available License 1.0** ⚠️ | **8,871** | **TypeScript** | 2026-09-30 | ❌ Not an open-source license |
| **Joplin** | [laurent22/joplin](https://github.com/laurent22/joplin) | **MIT** | **56,547** | **TypeScript** (Electron) | 2026-10-01 | ⚠️ Closest tech stack, but a completely different data model |
| **Trilium** | [zadam/trilium](https://github.com/zadam/trilium) | **AGPL-3.0** | **38,108** | (language field not verified) | — | ❌ Not Markdown as source of truth |
| **TriliumNext** (active fork) | [TriliumNext/Notes](https://github.com/TriliumNext/Notes) | **AGPL-3.0** (`LICENSE` verified) | **2,926** | (not verified) | Active | ❌ Same as above |
| **Notesnook** | [streetwriters/notesnook](https://github.com/streetwriters/notesnook) | **GPL-3.0** | **14,706** | **TypeScript** | 2026-09-30 | ❌ Data model does not fit |
| **SilverBullet** | [silverbulletmd/silverbullet](https://github.com/silverbulletmd/silverbullet) | **MIT** | **6,189** | **TypeScript** | 2026-09-30 | ⚠️ Design can be borrowed, architecture cannot be forked |
| **SiYuan** | [siyuan-note/siyuan](https://github.com/siyuan-note/siyuan) | **AGPL-3.0** | **46,587** | **TypeScript** | 2026-10-01 | ❌ Not Markdown as source of truth |
| **AFFiNE** | [toeverything/AFFiNE](https://github.com/toeverything/AFFiNE) | **MIT + directory-level exceptions** (`packages/backend` and `packages/common/native` have separate licenses) | **73,142** | **TypeScript** | 2026-09-30 | ❌ Data model does not fit |
| **MarkText** | [marktext/marktext](https://github.com/marktext/marktext) | **MIT** | **62,008** | **TypeScript** (Electron) | 2026-10-01 | ⚠️ **The editor UI reference most worth borrowing from** |

### 6.2 Item-by-item judgment: whole-project fork vs design-only borrowing

#### ❌ Whole-project fork — **none of them is suitable**

**Why all are rejected**, categorized by reason for rejection:

**(a) Fundamentally different language/form factor; forking equals rewriting**
- **Logseq** (Clojure/ClojureScript), **AppFlowy** (Dart/Flutter). This is not a "high modification cost" problem but a **tech-stack incompatibility**: you cannot put a ClojureScript editor kernel into a React 19 application. **The only things worth borrowing are the interaction design and the outliner data model.**

**(b) The data model conflicts with "Markdown files are the sole source of truth"**
- **Joplin**: MIT + TypeScript + Electron, looks the most similar, **but its source of truth is a SQLite database**; Markdown files are exports/sync artifacts, not the working object. **[Inference]** Forking it into "files as the source of truth" would mean replacing its entire storage layer — in which case you might as well not use it.
- **Trilium / TriliumNext**: tree notes + property inheritance, **data stored in SQLite** (not Markdown files). Its "note tree + properties + scripts" model and "folders + Markdown + frontmatter" are two different worldviews.
- **SiYuan**: **JSON block storage** (`.sy` files), not Markdown as the source of truth. Its block-reference/block-ID system is well worth borrowing (see below), but the architecture cannot be reused.
- **Anytype**: object graph + its own protocol (any-sync); local storage is a proprietary format. **And the license is "Any Source Available License 1.0" (verified), not an OSI open-source license** — legal must be cautious; reading the code to learn is fine, but you must confirm the terms before copying code.
- **AFFiNE**: **BlockSuite + Yjs CRDT** as the source of truth, with Markdown as an import/export format. **Its license is split by directory** (verified) — `packages/backend` and `packages/common/native` are not under MIT, and **the whole project cannot be treated as MIT**.

**(c) License prevents forking**
- **AGPL-3.0** (Logseq, AppFlowy, Trilium/TriliumNext, SiYuan): AGPL's **network-service clause** means that if you make any form of network service from a forked version, you must open-source all of the source code. For a **closed-source or potentially commercializable desktop education product**, this is an unacceptable viral risk. **[Inference] Even "referencing the code" requires care: copying large chunks of implementation from an AGPL project carries the same risk.**
- **GPL-3.0** (Notesnook): also strong copyleft.
- **tldraw** (if considering a whiteboard): **custom commercial license, text verified** — *"Not to use the Software in Production Environments"*, and it must not bypass License Key validation. **Production use requires purchasing a commercial license.**

**(d) Insufficient maturity**
- **Dendron**: last push **2025-11-13**, nearly a year without activity, **should be regarded as unmaintained**. It is also a VS Code extension, not a standalone desktop application.

#### ✅ Design-only borrowing (recommended) — ordered by borrowing value

**1. MarkText — borrow the editor and "typewriter mode" UI/UX** [Inference, highest value for money within this project]
- Why: **MIT + TypeScript + Electron**, almost identical to this project's tech stack, and a **mature Markdown editor** (not a PKM). It solves precisely the concrete problem of "building a Markdown editing experience in Electron": WYSIWYG/source dual modes, typewriter mode, focus mode, live preview, image paste and upload, and a theme system.
- **What to look at**: editor decoration logic (it uses the `muya` engine rather than CodeMirror), the status bar, sidebar search, the export pipeline (PDF/HTML), and how it handles Chinese input.
- **What not to borrow**: it is a **single-file editor** with no vault / graph / bidirectional links — exactly the parts "Gezhi" must build itself. **Note**: its maintenance cadence is slower than CM6; use it as a **reference rather than a dependency**.

**2. SilverBullet — borrow the "files as a database" index and query design**
- Why: **MIT + TypeScript**, explicitly using **Markdown files as the sole source of truth**, with Lua-scripted queries. Its **indexer** (scans the vault to extract page / link / tag / task / item and builds an in-memory index) is **completely isomorphic** to what "Gezhi" wants to do; you can read its index design directly to validate the scheme in §5.2.8.
- **What to look at**: the index data structure and invalidation strategy, page-name resolution (the rules for resolving `[[Page Name]]` → file path, including handling of case and path ambiguity), and the correspondence between `$query` syntax and Obsidian search syntax.
- **What not to borrow**: it is a **server + browser** architecture (running a local HTTP service), not an Electron desktop application; the editing experience is not its focus either.

**3. Foam — borrow "link resolution" and the in-VS-Code graph implementation**
- Why: **MIT + TypeScript**, one of the **purest "Markdown + wikilink + graph" implementations**, and active for a long time (still pushing on 2026-09-30). **It uses the remark ecosystem for parsing**, making it the best living textbook for this project's §2 "indexing path" selection — look directly at how it handles wikilink parsing, attachment links, and rendering the graph under limited UI capabilities (VS Code Webview).
- **What to look at**: `@foam/core`'s parsing and link-resolution logic, the graph's layout and rendering choices, and its handling of tags and frontmatter.
- **What not to borrow**: the host is VS Code, so the UI layer is completely non-reusable; it has no independent window/tab system.

**4. SiYuan — borrow the "block-level ID and block reference" product design**
- Why: **its block references and block-level properties are the most thoroughly executed among comparable products**, and Chinese-community feedback is also the most extensive.
- **What to look at**: block-ID generation and stability, the presentation of backlinks for block references, the completion interaction for `((block ID))`, and its performance handling in large documents.
- **Look especially at**: **how it does full-text search and word segmentation in Chinese** (Obsidian's Chinese word-segmentation support is weak; SiYuan, as a Chinese project, has accumulated experience here). **[Inference]**
- **What not to borrow**: AGPL + JSON block storage; do not touch the code at all.

**5. Joplin — borrow "engineering practice for Electron desktop applications"**
- Why: **MIT + TypeScript + Electron**, the **most maturely engineered and longest-maintained desktop application among comparable projects** (multi-device sync, encryption, plugin system, auto-update, crash recovery).
- **What to look at**: Electron main-process/renderer-process IPC design, error handling for file and database operations, auto-update and code signing, the plugin sandbox, and **its handling of paths and file locks on Windows**.
- **What not to borrow**: the data layer (SQLite as source of truth) and the sync protocol.

**6. logseq / AppFlowy / AFFiNE / Anytype — borrow interactions and visuals**
- Borrow their **block-level drag-and-drop, slash command menu, database views (table/board), and the entry design of "daily notes + journal stream"**.
- **Do not copy code in any case** (reasons in the License and data-model parts of §6.2).

### 6.3 A decision table

| Your goal | Whom to look at |
|---|---|
| Editor UI/UX, typewriter mode, export | **MarkText** (MIT, readable code) |
| Vault indexer, page resolution, query language | **SilverBullet** (MIT, readable code) |
| Wikilink parsing, remark ecosystem usage, graph implementation | **Foam** (MIT, readable code) |
| Block references / block IDs / Chinese search | **SiYuan** (AGPL, **design only, do not copy code**) |
| Electron engineering / IPC / auto-update / plugin sandbox | **Joplin** (MIT, readable code) |
| Concrete layout engine library | **dockview** (MIT, direct dependency; see §4.1 item 3) |
| Interaction and visual inspiration | logseq / Anytype / AFFiNE (**read only, do not copy code**) |

> **⚠️ A legal reminder** [Inference], not legal advice: **MIT / Apache-2.0 projects can be read and their implementations borrowed (provided copyright notices are retained); AGPL / GPL projects carry copyleft risk even if you copy only large chunks of implementation; the custom licenses of tldraw and Anytype must be read in full, item by item, before deciding.** Before formally starting the project, it is advisable to have legal review the above list.

---

## 7. One-Sentence Recommendation

**Editor selection**: **CodeMirror 6** (`@codemirror/view` + `@lezer/markdown`, MIT) — it is the only Live Preview foundation with large-scale production validation; all Chinese IME composition issues have been fixed and are still being tracked, and "plain text as the source of truth" has zero round-trip loss. The cost is that Live Preview decorations, wikilink atomization, and autocomplete must be written yourself (budget 2–4 person-months). Alternatives are **Milkdown** (when you want out-of-the-box WYSIWYG) and **Vditor** (use only in week 1 to align the Live Preview feel, then discard).

**Graph selection**: **`d3-force` (layout inside a Web Worker) + a self-built layered Canvas 2D renderer** — Obsidian's graph itself is self-built Canvas+WebGL, and the four knobs Center/Repel/Link/Link distance in Obsidian's graph settings can be **mapped directly** to `forceCenter`/`forceManyBody`/`forceLink.strength`/`forceLink.distance`; "labels fading with zoom" and "time-lapse animation" have no equivalent in any off-the-shelf library and must be written yourself either way. **If the team lacks graphics experience or needs a finished product in 2 weeks, switch to Cytoscape.js (complete features) or AntV G6 (the least work thanks to Chinese docs); if the vault will reach 20k+ nodes, switch to sigma.js + graphology (WebGL + event-driven incremental updates)**.

**Vault directory structure**: **`<system "Documents" known folder>\Gezhi\<vault name>\`**; configuration goes into **`.gezhi/`** inside the vault (isomorphic to `.obsidian/`: `vault.json` stores the UUID and schemaVersion; `app.json` / `appearance.json` / `core-plugins.json` / `graph.json` / `workspace.json` / `hotkeys.json` / `templates/` / `snippets/`), notes go in `notes\`, attachments in `attachments\`, soft-deleted files in `.trash\`; **the index cache must never go into the vault; put it in `%APPDATA%\Gezhi\cache\<vaultId>\`**; the multi-vault registry goes in `%APPDATA%\Gezhi\vaults.json` — **obtaining the "Documents" directory must use the Shell known-folder API (Electron `app.getPath('documents')`), and must not hard-code `%USERPROFILE%\Documents`**, because that directory can be redirected by the user and is often taken over by OneDrive.

---

## Appendix A: Verification boundaries of this research (honest list)

**Verified (with URL support)**
- All GitHub repository URLs resolve; all star counts, licenses, and maintenance timestamps come from the GitHub API or repository pages (2026-10-01).
- All npm package versions and release dates come from `registry.npmjs.org`.
- All Obsidian behavior descriptions come from the Markdown source files of the official help documentation repository `obsidianmd/obsidian-help` or the official documentation site mirror.
- The numbers, titles, and statuses of all IME issues come from per-repository searches via the GitHub Search API.
- Obsidian's graph uses **Canvas + WebGL** — from the original text of the official community documentation.
- tldraw's "prohibited in production environments", Anytype's "Any Source Available License 1.0", AFFiNE's directory-level license split, and TriliumNext's AGPL-3.0 — all from the original text of their respective `LICENSE` files.

**Unverified (need PoC or hands-on testing)**
1. **This report contains no hands-on performance data.** All judgments about "whether thousands of nodes are smooth" are **[Inference]** based on rendering backends and issue records. The benchmarks in §3.7 must be run yourself.
2. The **real structure and key names** of `core-plugins.json` / `graph.json` / `backlink.json` / `templates.json` / `daily-notes.json` / `bookmarks.json` / `canvas.json` / `snapshots/` / `cache/` — the official documentation does not list them, and no first-hand source was found this time. **If an Obsidian import feature is needed, you must test a real vault hands-on.**
3. The **actual JSON shape** of `obsidian.json` — only its path and the existence of the `"open": true` marker were verified (third-party sources); the structure itself is unverified.
4. The **concrete key names** of Obsidian's `app.json` / `graph.json` and other files — "Gezhi"'s JSON examples are self-designed and are not guaranteed to match Obsidian.
5. Whether each Obsidian vault can open an independent window (per-vault window).
6. The **React 19** compatibility of `dockview`, `cmdk`, `react-arborist`, `react-cytoscapejs`, `react-graph-vis`, and other libraries — **all unverified**. React 19 StrictMode double-mounting is a common pitfall for imperative graphics libraries; each must be PoC-tested.
7. The star count of `ninja-keys` (could not be obtained).
8. The star count of `rc-dock` (page fetch failed).
9. How to choose between `vis-network`'s dual licenses (Apache-2.0 OR MIT) in actual use — both LICENSE files are in the repository, but no official explanation of the choice was found.
10. Whether Electron's `app.getPath('documents')` correctly returns the redirected "Documents" known folder in all cases.
11. The specific interaction differences of Chinese IME under Electron/Chromium with system input methods (Microsoft Pinyin, Sogou, WeChat input method) — must be tested hands-on on the target machine.

**Known limitations of the research method**
- In this environment, fetching `github.com` pages worked, but the GitHub **core API anonymous rate limit is 60 requests/hour and was already exhausted**; therefore some repository metadata was obtained via page HTML scraping or the search API. Individual fields (language, exact push time) may show consistency differences between the two sources.
- The `web_fetch` tool returned a "non-public IP" error for `github.com` and `raw.githubusercontent.com`, so all GitHub-related content was fetched using `pwsh` + `Invoke-WebRequest`. This does not affect the authenticity of the data, but it shows that the toolchain has environment limitations.

**Unified clarification: the time baseline used in this report**
- All "as of" dates in this report refer to **2026-10-01** (the system date); all GitHub/npm data was collected on that date.

