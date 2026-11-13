# Gezhi · Editor and Graph Core Hands-on Test (01 appendix)

> `research/01-editor-and-graph-research.md` is being written by a parallel sub-agent (including editor/graph/open-source project comparisons).
> This file contains **independent, local hands-on test conclusions**, used to verify whether the selected options can actually be installed and run; the two are complementary and do not conflict.

---

## 1. Test record (2026-10-01)

```powershell
npm install --no-audit --no-fund @codemirror/state @codemirror/view `
  @codemirror/lang-markdown @codemirror/language-data @codemirror/commands `
  katex sigma graphology
```

**Result: 35.8 seconds, exit code 0, `node_modules` 16.3 MB in total.**

The versions and licenses actually installed:

| Package | Version | License |
| --- | --- | --- |
| `@codemirror/state` | 6.7.6 | MIT |
| `@codemirror/view` | 6.43.13 | MIT |
| `@codemirror/lang-markdown` | 6.5.2 | MIT |
| `@codemirror/language-data` | 6.5.2 | MIT |
| `@codemirror/commands` | 6.11.1 | MIT |
| `sigma` | 3.0.3 | MIT |
| `graphology` | 0.26.0 | MIT |
| `katex` | 0.18.10 | MIT |

## 2. Verify 1: CodeMirror 6 can parse "Chinese + bidirectional links + formulas"

```js
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";

const st = EditorState.create({
  doc: "# 中文标题\n\n[[双链]] $x^2 + y^2$\n",
  extensions: [markdown({ codeLanguages: languages })],
});
console.log(st.doc.length);
```

**Output: `[OK] CodeMirror EditorState, doc.length = 27`** — Chinese, `[[wikilink]]`, and inline formulas coexist, and the parser reports no errors.

Conclusion: **the P1 editor kernel selection holds**, and the architecture that separates state from view naturally supports "multiple views of the same document (split preview)".

## 3. Verify 2: sigma cannot be loaded in the main process (important pitfall)

```js
import Sigma from "sigma";
```

**Output:**

```
ReferenceError: WebGL2RenderingContext is not defined
    at node_modules/sigma/dist/index-5d7c4e29.cjs.dev.js:145
```

sigma **evaluates `WebGL2RenderingContext` at module import time**, therefore:

1. It can only be loaded in the **renderer process** (Electron's Chromium, which has WebGL2);
2. The main process / pure Node unit tests **will definitely crash**, so **graph data logic must stay on the graphology side** (graphology is pure JS and can safely run anywhere);
3. Environments with GPU acceleration disabled (old machines, remote desktops) may lack WebGL2 → **a fallback must be prepared**: a simple Canvas 2D force-directed graph, or prompt the user to enable hardware acceleration.

**Write into the P3 task list**: `graphology handles data (filtering/community/subgraph), sigma only draws; sigma's import goes in a renderer-process-only module; the main process only imports graphology.`

## 4. Verify 3: graphology / katex can be used on the Node side

`graphology`'s `Graph` adding/removing nodes and edges works normally in Node (`order` / `size` are readable), and `katex.renderToString('x^2')` returns HTML normally.

**Meaning**: knowledge-graph **construction** (scanning Markdown to extract `[[links]]`, extract `#tags`, and connect knowledge points to questions) can run in the main process/background tasks, handing only the results to the renderer process for drawing. This matches exactly the positioning of "index service" in main plan P3.

## 5. Verify 4: dependency size

| Item | Measured |
| --- | --- |
| `node_modules` of the 8 packages + transitive dependencies | **16.3 MB** |

`[Inference]` After being bundled into Electron (tree-shaking + importing only the needed language packs), the actual incremental size of the editor and graph is expected to be on the order of **2–5 MB**, which has almost no impact on the 300 MB installer budget.

## 6. Four suggested corrections to the main plan

1. **Load `@codemirror/language-data` on demand**: it carries metadata for all languages; do not synchronously load all language packs on the first screen, otherwise opening a note containing code blocks will lag (P1 to be tested).
2. **Split the graph module into two files**: `graph-model.ts` (graphology, runnable in the main process/tests) and `graph-view.tsx` (sigma, renderer process only). This split must be done from day one of P3; splitting it afterwards is costly.
3. **P1 must hands-on test Chinese IME**: continuous input of 200 characters, the undo stack, and selection behavior — this is the most common pitfall of CodeMirror in a Chinese environment, and only real-device manual testing can find it.
4. **The fallback path must be written into the requirements**: add a toggle in the settings page for "Graph rendering: WebGL (default) / Canvas simple mode", as an escape hatch for old machines and remote desktops.

## 7. How to re-run

```powershell
# probe directory (can be deleted)
D:\Users\LINKIT\Desktop\Gezhi\_probe_npm\
  ├─ package.json
  ├─ probe.mjs    # reproduction of the sigma load failure
  └─ probe2.mjs   # CodeMirror / graphology / katex normal path
```
