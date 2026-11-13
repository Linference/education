# Gezhi: Digital Human, Workbench, Graph and Brand Upgrade

2026-10-02. This iteration modified the software according to the user's current request; historical sessions and memory files served only as project background.

## Software Behavior Integrated

- Xiaoge uses six expression assets generated with the built-in image_gen image tool: idle, blinking, listening, thinking, mouth slightly open, mouth open. A 3×2 sprite sheet is used, updating the background position directly and retaining the original voice-timestamp driving. This is image-based expression animation, not a rotatable three-dimensional skeletal model.
- The digital human retains Feynman explanation, ordinary conversation and ability checks. It shows a thinking state while waiting for an answer; a listening state while recording; during playback the mouth shapes are linked to the audio timeline, and the mouth closes after stopping.
- Fixed an issue where the digital human's automatic reading relied on a React state-update side effect: the reading text now comes directly from the API answer and does not depend on the state updater executing immediately.
- The title bar, toolbar, file tree, tabs, welcome page, reading area, AI chat, calendar, question-bank cards and paper basket use unified colors, spacing, corner radii and focus styles. Light/dark switching is persisted. The dark background and text contrast of primary buttons are handled separately.
- Page entry, panel switching, button hover, digital-human breathing, speaking waveforms and thinking rings use short, restrained animations. When the system has reduced motion enabled, continuous decorative animations stop, and the graph only shows the final layout positions.
- The graph uses Canvas + D3 force Worker: background computation, position-array transfer, on-demand drawing, and stopping continuous refresh after convergence. It supports scroll-wheel zoom at a fixed point, button/keyboard zoom, blank-area panning, node dragging, neighbor highlighting, clicking a note to return to reading, global/local switching, BFS depth, name search, dangling/isolated node filtering, folder color grouping, display and force parameters.
- The graph load limit is 1,500 nodes / 6,000 links; beyond the limit a truncation notice is shown. Local depth is 1–4. Settings storage has numeric boundary checks, and resources are cleaned up when switching vaults/canceling asynchronous requests/unmounting.
- The new logo uses four-way interweaving with a square negative space in the center; referencing the black-and-white geometry and woven feel provided by the user, it uses an independent four-way structure. The title bar, welcome page, application window, multi-size PNGs, ICO and installer assets have been updated. The original old logo source files are still retained.
- The installer now includes packages/voice, the Tencent Cloud SDK, the credentials module, and the database foundation modules and schema they reference, preserving the package directory relationships so the digital human can find the voice module after packaging.

## Assets and Generation Specifications

Usage: built-in image_gen; no CLI was used and no API Key was requested. The specific underlying model version is managed by the tool; no fixed model version was self-declared.

Xiaoge final asset: `apps/desktop/renderer/src/assets/xiaoge-expressions-v2.png`, 1536×1024, six cells each 512×512. The avatar uses a circular viewport. Generation specification:

> A premium, handsome and approachable East Asian teenage male learning companion, about 17, softly tousled dark hair, expressive brown eyes, natural facial proportions, matte lavender knitted sweater with cream collar, soft 3D painterly studio lighting. One precisely aligned 3-column by 2-row expression sheet of the SAME character, identical head-and-shoulders frontal framing and scale. Top row: neutral friendly, eyes blinking closed, attentive listening. Bottom row: thoughtful, speaking with a small open mouth, speaking with a wider open mouth. Transparent background; no words, text, props or shadows.

After generation, the tool was once asked to remove the background while preserving the six-cell positions; the software chose the initially generated six-cell asset. The mouth shapes are discrete expression switches; no claim of continuous three-dimensional lip shapes is made.

Logo original asset: `brand/source-woven-v2.png`, 1254×1254, with the actual transparent alpha checked; application asset `apps/desktop/renderer/src/assets/gezhi-mark-v2.png`. Final Logo prompt:

> Design ONE original premium black-and-white logo symbol for 格致 (Gezhi), a knowledge and learning desktop application. Use the attached image ONLY as a visual-language reference: sophisticated continuous geometry, confident black linework, balanced negative space, calm woven interconnected construction. Create a CLEARLY DISTINCT FOURFOLD woven rounded-square emblem, NOT the reference's sixfold flower/knot. Four rounded bent ribbon links interlock in a compact rotationally symmetric form around ONE clearly open square/diamond center: the grid refers to 格, the linked pathways refer to knowledge becoming connected. Strong simple silhouette, generously separated paths, medium-bold consistent strokes, smooth purposeful rounded joins. Design must remain crisp and recognizable at 24 pixels. A timeless professional identity that feels designed by a serious identity studio. Pure near-black monochrome, flat vector-style graphic, no colors or gradients, no 3D, no bevels, no shadows, no typography, no letters, no border, no wordmark, no decorative dots. One single centered mark with even generous margin, occupies 72% of a square canvas. True transparent alpha background. Do not reproduce OpenAI's sixfold logo or any existing trademark. The result should look like a single precisely constructed vector logo, not a sketch or an illustration.

Export uses `node brand/export-logo-v2.mjs`, checks the transparent background and exports icon sizes, ICO and BMP. What is generated is a PNG bitmap mark; the bitmap was not packaged as an editable vector file. Dark interfaces use CSS monochrome inversion.

## Verification and Reproduction

```powershell
node apps/desktop/node_modules/typescript/bin/tsc --noEmit -p apps/desktop/tsconfig.json
npm --prefix apps/desktop run build:renderer
node apps/desktop/verify-workbench.mjs
node scripts/check-licenses.mjs
node scripts/scan-secrets.mjs
node brand/export-logo-v2.mjs
node scripts/build-installer.mjs
```

The packaged real application uses the same verification script:

```powershell
$env:GEZHI_TEST_EXE = (Resolve-Path 'dist/installer/win-unpacked/格致.exe').Path
node apps/desktop/verify-workbench.mjs
Remove-Item Env:GEZHI_TEST_EXE
```

The tests create independent vaults and application data directories under `产出/ui-v2/qa-*`, without modifying user notes or credentials. They actually run Electron, preload, indexing, the Worker, Canvas, the audio player and interface events; AI answers and cloud TTS use in-process test doubles, and the audio is a three-second WAV. The tests do not prove the network availability of the external DSH engine or the Tencent Cloud account.

Verification results are recorded in `产出/ui-v2/verification.json` and, for the packaged test, in `产出/ui-v2/packaged/verification.json`. Screenshots cover the welcome page, the digital-human reading workbench, the graph and settings, the calendar, the question bank, and dark and small-screen layouts. The final running results are those in the JSON; the design description does not replace verification.

Final packaged run this time: all 33 checks passed, with 0 uncaught exceptions. Laying out 1,500 nodes / 3,000 links took 2041 ms; 143 animation frames were sampled during layout, with frame-interval P95 at 8.5 ms and maximum at 16.8 ms. This is a test result on this machine and does not represent a fixed frame rate on all hardware. The real TTS/ASR SDKs, voice module and credentials module all loaded successfully in the packaged directory; networked services were still verified interactively by test doubles.

Finally, after adding the database foundation modules to the verified `win-unpacked`, the NSIS installer was generated using electron-builder's `--prepackaged dist/installer/win-unpacked`; when building fully from source, the same dependencies are already included in `package.json`'s `extraResources`.

## Graph References

The interaction references the [Obsidian official Graph view documentation](https://help.obsidian.md/plugins/graph): global/local, filtering, grouping, display and force settings. The layout algorithm uses the Barnes–Hut method described in the [D3 many-body documentation](https://d3js.org/d3-force/many-body). The implementation is not Obsidian's source code or its graph engine.
