# R13 special conclusion: autocomplete × Chinese IME (resolved)

> Test date: 2026-10-01
> Test method: `poc/ime/cdp_r13_test.py` (Playwright + CDP `Input.imeSetComposition` driving real composition input)
> Versions involved: `@codemirror/autocomplete` 6.20.3, `@codemirror/view` 6.43.13
> Result: **5/5 passed** (1/5 before the fix)

---

## 1. Why test this specifically

This was the **highest-risk technical unknown** in the whole project, for three reasons:

1. Gezhi's most core editing experience is "typing `[[` to autocomplete a note name", and note names are mostly **Chinese**;
2. Monaco still fails here — **#2199 "Chinese IME does not work correctly with CompletionItemProvider" is still open**, and this was one reason Gezhi abandoned Monaco in the first place;
3. The earlier IME PoC **deliberately disabled autocomplete** in order to test "pure" IME behavior — this layer had never been validated at all.

---

## 2. The real problem found by hands-on testing

**CodeMirror's `autocompletion` still calls completion sources when `view.composing === true`.**

Evidence (test output before the fix):

```
[FAIL] 组合输入期间补全弹窗出现了 2 次
    组合中 view.composing: True        ← CodeMirror 自己知道在组词
    组合期间弹窗次数: 2                 ← 但补全照样弹
    上屏后补全总弹出次数: 1
```

In other words: while the Chinese IME is composing (the candidate list is open), the autocomplete popup also appears in the same position, and both **are listening for Enter/Space/arrow keys**, competing for keystrokes. This is exactly the shape of the Monaco #2199 disease.

> Note that this does not mean "CodeMirror has a bug" — it provides the `view.composing` check, it just **does not**, by default, intercept on your behalf in a custom completion source. That is the user's responsibility, and the documentation does not emphasize this pitfall heavily.

---

## 3. The fix

Add an intercept on the first line of **every custom completion source**:

```js
function wikilinkSource(context) {
  if (context.view?.composing) return null;   // ★ never trigger during composition
  ...
}

function tagSource(context) {
  if (context.view?.composing) return null;   // ★ same as above
  ...
}
```

Both places must have it. **When writing any new completion source, this check goes on the first line** — this is a rule of this project, not an optional optimization.

---

## 4. Before/after comparison (same test cases)

| # | Test case | Before fix | After fix |
| --- | --- | --- | --- |
| 1 | **Autocomplete does not pop up during composition input (core)** | ✖ popped up **2 times** | ✔ **0 times** |
| 2 | Pressing Enter/Space mid-composition does not wrongly insert a completion item | ✔ 0 times | ✔ 0 times |
| 3 | Autocomplete works normally during non-composition input | ✔ selected "情态笔记" | ✔ still works |
| 4 | Autocomplete following after Chinese text is committed | ✖ popped up once during composition | ✔ popup opens normally after commit, 0 times during composition |
| 5 | Auto-closing brackets do not stack with IME | ✔ | ✔ no `]]` stacking |

**Test cases 3 and 4 are the key balance point of this fix**: you cannot disable autocomplete just to dodge the IME.
- Case 3 proves: during ordinary typing, autocomplete pops up as usual and can be selected
- Case 4 proves: **after** Chinese text is committed, autocomplete still pops up normally (`上屏后弹窗打开: True`)

---

## 5. Three mistakes of my own exposed by this test (for those who follow)

### 1. Assertion probe word conflicted with the initial document (second time I made this mistake)

In the previous IME test I used "测试" as the probe, but the initial document already contained "测试", causing a false positive. This time I used the rare character `龘` and did not repeat it — but it is worth recording: **a probe word must first be asserted not to be in the initial document**.

### 2. Variable name shadowing crashed the script

`REPORT` was used both as "report path (string)" and "results list", and `REPORT.append` directly threw `AttributeError`. Changed to `REPORT_PATH` and `RESULTS`.

### 3. One edit swallowed a newline and commented out an entire function

When I used the editing tool to change a comment, the replacement text was missing a newline, with this result:

```js
// ------ 装饰（模拟 Live Preview 的真实压力面）function buildDecorations(view) {
```

**The entire function declaration was commented out**, and the following `}` became a stray brace → Vite returned 500 → blank page.

The diagnostic path is worth recording: the browser only reported `Failed to load resource: 500`, with no visible cause; using `fetch('/src/main.js')` to get Vite's response body finally produced the real error (it wraps the error in HTML with JSON inside). **When the next page goes blank, ask Vite for the compilation error first; do not search the browser console.**

---

## 6. Impact on the plan

1. **R13 is downgraded from "unverified risk" to "verified and resolved"**, but the fix itself is elevated to a **coding convention**: every completion source must check `view.composing` on its first line.
2. **Autocomplete and IME can coexist** — this is the technical prerequisite for Gezhi's "Obsidian-level editing experience", and now there is evidence.
3. The test script has been solidified into rerunnable cases (`cdp_r13_test.py`) and should be included in CI: **rerun every time CodeMirror-related packages are upgraded** (both `cdp_ime_final.py` and `cdp_r13_test.py` suites).
4. Parts still requiring **hands-on human testing**: CDP can only drive Blink's composition input path and **cannot test the operating-system IME engine** (candidate paging, Shuangpin/Zhuyin/Cangjie encoding, and whether a real IME "eats" Enter instead of passing it to the page). This item remains on the manual checklist (Group D of `test-checklist.md`).
