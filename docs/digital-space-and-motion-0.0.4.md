# Gezhi 0.0.4: Digital Space, Motion and Formula Export

This iteration removed the old digital-human entry point per the user's request; the five listeners and six-dimensional feedback in the role space continue to be used.

## Entry Points and Learning Workspace

- Removed the left-side "Digital Human" tab, the old digital-human button in the vertical bar, and the old panel mount.
- The welcome page's "Enter role space" goes directly to the Learning Studio.
- The old Xiaoge figure on the practice page was changed to textual learning guidance, retaining AI follow-up and voice reading.
- The vertical-bar indicator of the current workspace uses `aria-current`; the AI panel hidden by the Learning Studio does not show a selected state.

## Motion

Uses the browser-native Web Animations API and CSS, without adding animation-library dependencies.

- File reading / editing, the main workspace and learning tabs: short fade-in with a small distance shift.
- Digital Space: the five role cards enter in sequence, with hover lift, colored glow and arrow feedback.
- Entering a space: the side listeners and input card appear in sequence; a waiting indicator is shown during evaluation.
- Six-dimensional feedback: report expansion, radar chart and dimension cards fade in; dimensions not demonstrated still do not draw a score.
- Connection guidance and import preview: background fade-in, dialog slight scale.
- When the system is set to "reduce motion", CSS animations and transitions are disabled, and in-progress native animations are canceled.
- Animations attach to existing DOM surfaces, without changing component keys to trigger them, and do not rebuild input boxes because of animation.

## Markdown-to-PDF Fix

`Ax`, `By` and `AB` are adjacent mathematical symbols in LaTeX. The old converter preserved uppercase letter strings, and Typst read them as undefined variable names.

The converter now writes these products as `A x`, `B y`, `A B`, preserving known operators, Greek letters, namespaces and English text inside quotes. It also fixes adjacent relation commands sticking to variables and preserves `quad` / `qquad` spacing.

This fix does not claim support for all LaTeX environments; unsupported commands still retain the original text and a warning.

## Verification and Installer

- TypeScript check passed.
- 30 unit tests for learning records, import, and role-scoring constraints passed.
- 46 formula-string conversions passed.
- 9 categories of formulas went through real inline and block-level Typst PDF compilation, including the integer optimization model and large braces above and below from the error screenshot, preserving mathematical function names.
- 26 Learning Studio Electron integration checks passed, including voice playback, record restoration, vault isolation and real PDF / Word / Markdown export.
- Motion-specific Electron checks cover entry-point removal, the five roles, switching, six-dimensional feedback, input retention, reduced motion, compact layout and real formula export.
- Workbench checks cover themes, graph interaction and a 1,500-node / 3,000-link stress graph.

AI feedback and cloud voice use isolated test doubles; no new paid model calls were made and no real student trials are claimed.

The official delivery outputs to `dist/installer/0.0.4-final/`, avoiding overwriting the running preview. DeepSeek Harness and document-viewing dependencies continue to be provided with the package.
