# Gezhi PoC · CodeMirror 6 Chinese IME automated test conclusions

> Test date: 2026-10-01
> Test method: **Playwright + the Chrome DevTools Protocol `Input.imeSetComposition` interface** driving real composition input
> Test target: `poc/ime` (CodeMirror 6.43.13 + `@codemirror/lang-markdown` + Lezer, with Live Preview decorations)
> Result: **8/8 test cases passed, zero JS errors on the page**

---

## 1. First, be clear about what this test can and cannot prove

This point matters more than the result itself.

### What was tested (convincing)

`Input.imeSetComposition` is **CDP's IME interface**, and it goes through **Blink's real composition editing path** — it does not stuff events into the DOM by force. Therefore the following were genuinely exercised:

- Blink's composition input state machine (`compositionstart` → `compositionupdate` × N → `compositionend`)
- CodeMirror 6's DOM synchronization, selection maintenance, and undo grouping during composition
- Composition input in the presence of Live Preview decorations (`Decoration.mark` for wikilinks / formulas / tags)
- Cleanup when composition input is cancelled (the composition string is cleared)

**Event sequences were verified**: for each composition input, CodeMirror received `start=1 / update=3~5 / end=1`, with matching counts and no anomalies — this shows the editor really was responding to real composition events, rather than "the text happened to get in".

### What was not tested (still requires one human pass)

- **The operating-system IME engine itself**: candidate ordering, paging, fuzzy sounds, cloud candidates, and the encoding behavior of Shuangpin/Zhuyin/Cangjie
- **The two-stage behavior specific to some IMEs, where the Pinyin string is first committed and then wholly replaced with Chinese characters**
- **Differences between IMEs** (Microsoft Pinyin / Sogou / WeChat / Zhuyin / Cangjie behave inconsistently)

> The correct reading of the conclusion: **"the editor handles composition input without losing characters/duplicating them/jumping the cursor/corrupting undo" — this layer has been automatically verified**;
> "whether your particular IME feels smooth to use" — this layer still requires you to spend 10 minutes doing a hands-on test (see `test-checklist.md` for the cases).

---

## 2. Test method (reproducible)

```python
# Core: use CDP's IME interface to go through the real composition path
cdp = page.context.new_cdp_session(page)
cdp.send("Input.imeSetComposition", {"text": "qingtaidongci",
         "selectionStart": 13, "selectionEnd": 13})   # composing (similar to a Pinyin string)
cdp.send("Input.insertText", {"text": "情态动词"})      # commit
```

Scripts: `poc/ime/cdp_ime_final.py` (final version), `cdp_undo_test2.py` (undo granularity special test)
Reports: `poc/ime/cdp-ime-report-final.json`, `cdp-undo-report2.json`

> Runtime note: the scripts must **run from `%TEMP%`**. If placed in the PoC directory, Vite's fs watcher locks the temporary files (`EBUSY`), causing the dev server to crash.

---

## 3. Test case results

| # | Test case | Event sequence | Result |
| --- | --- | --- | --- |
| 1 | Row-end composition input of 「情态动词龘」 | start=1 / update=5 / end=1 / input=5, Δ=5 | ✅ |
| 2 | Mixed Chinese-English 「modal 靐」 | start=1 / update=3 / end=1, Δ=1 | ✅ |
| 3 | **Input inside `[[ ]]`** (the CodeMirror #1688 scenario) | start=1 / update=3 / end=1, Δ=1 | ✅ |
| 4 | **Input inside `$ 公式 $`** | start=1 / update=3 / end=1, Δ=1 | ✅ |
| 5 | **Input inside `#标签`** | start=1 / update=3 / end=1, Δ=1 | ✅ |
| 6 | Three consecutive composition inputs | start=3 / end=3 | ✅ |
| 7 | Cancel mid-composition (clear the composition string) | Δ=0, no residual characters | ✅ |
| 8 | One undo completely removes the committed word | 235 → 236 → **235** | ✅ |

The test cases use **rare-character probes (龘 靐 齉)**: these three characters never exist in the initial document, so judgments like "was it inserted" and "was it undone" cannot produce false positives.

### Undo granularity special test (`cdp_undo_test2.py`, 5/5 passed)

| Scenario | Number of undos | Result |
| --- | --- | --- |
| Undo after one CDP composition-input word | 1 undo returns to the pre-insertion length | ✅ |
| Undo after multi-step composition (Pinyin string grows step by step) | 1 | ✅ |
| Undo after ordinary text insertion (baseline) | 1 | ✅ |
| Undo immediately after composition input (<500ms) | 1 | ✅ |
| Undo 1.5 seconds after composition input | 1 | ✅ |

**This shows that CodeMirror's undo grouping treats an entire composition input as one step**, and there is no "undo halfway leaving half a word".

---

## 4. Pitfalls I hit myself along the way (for those who follow)

### Pitfall 1: Wrong assertion caused a false report that CodeMirror "undo failed"

The first version of the test used "测试" as the probe and asserted "after undo the document no longer contains 『测试』". **But the initial template already contained the two characters 「测试」** (the draft title line), so the assertion was always true → the report said 12 undos all failed to undo, which looked like a serious CodeMirror defect.

In reality **one undo cleaned it up** (235 → 235).

**Lesson**: the assertion probe must be a string that never appears in the document; and **also verify the length rollback**, not just text containment. The most dangerous thing about this kind of false positive is that it looks like "a bug was found" and makes people change direction wrongly.

### Pitfall 2: Vite bound only to IPv6, `127.0.0.1` could not connect

Vite 8 listens on `::1` by default. `http://127.0.0.1:5188` refused the connection, but `http://[::1]:5188` worked. It appeared as "the server is clearly up but cannot be accessed".
**Fix**: explicitly set `host: "127.0.0.1"` in `vite.config.js`.

### Pitfall 3: Vite's fs watcher crashed because of Python temporary files

When starting `python.exe` from a background task, Windows writes the script into `.selfcheck.py.<pid>.<uuid>.tmpdir/` in the **current working directory**. Vite watched it → `EBUSY: resource busy or locked` → the dev server crashed outright.
**Fix**: exclude `**/*.tmpdir/**` etc. via `watch.ignored`; run the scripts from `%TEMP%` instead.

### Pitfall 4: The Windows console is GBK

Python output of `✅` threw `UnicodeEncodeError`. **Fix**: use ASCII markers (`[PASS]`/`[FAIL]`) for output and set `PYTHONUTF8=1`.

---

## 5. Conclusions for the plan

1. **Editor technology choice is locked to CodeMirror 6**; the Chinese composition input path has been verified on this machine — this risk drops from "to be verified" to "verified (automated layer)".
2. **Live Preview decorations and IME can coexist** — cases 3/4/5 were performed with decorations active. This was the combination we were most worried about.
3. **Still requires a 10-minute hands-on human test**: type once with your own IME, focusing on candidate behavior and feel (the IME engine itself cannot be tested automatically).
4. **Remaining risk points to verify** (not testable automatically, left for P1):
   - The interaction between `[[` autocomplete and IME — **this is exactly where Monaco fails (#2199)**, and is the next risk point that must be specifically verified
   - Input frame rate with a 5,000-character document
   - The Electron environment (this time it was Chrome; the Chromium kernel is the same but the shell differs)
5. **Test infrastructure is in place**: `cdp_ime_final.py` can be turned directly into a CI regression test — run it whenever the CodeMirror version is upgraded in the future, and IME behavior regressions will be found immediately.
