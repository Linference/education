# Test checklist · CodeMirror 6 Chinese IME validation

> Tester: yourself (not a script — IME behavior can only be tested by a real person typing)
> Estimated time: **15–20 minutes**
> Purpose: before writing the 9-week editor code, first confirm that the kernel does not fail under a Chinese IME.

## How to count as a pass

There are 6 automatic checks on the right side of the page. **The most important thing is that all 6 turn ✅**, and at the same time **you must not feel that anything is "off" while typing**.
If any item turns ❌, copy three or four lines of the log area (right side) from the operation where the problem occurred backward and send them to me — it contains the event type, position, and document-length changes, which is enough to locate the issue.

---

## Preparation

1. Open `启动PoC.ps1` (right-click → Run with PowerShell), or run `npm run dev` in the `poc\ime` directory and then visit http://127.0.0.1:5188
2. Switch to your **Chinese IME** (Pinyin/Zhuyin/Cangjie are all fine, **please use the one you normally use most**)
3. Confirm that "Live Preview 装饰" on the right is **checked** (this item is the most critical: decorations + IME is the historical bug hotspot)

---

## Test cases (please do them in order, and glance at the right-side checks after each)

### A. Basic input
- [ ] **A1** Type the four characters 「情态动词」 after the arrow on the 「行首→」 line
- [ ] **A2** Type 「表示推测」 at the end of the 「←行尾」 line
- [ ] **A3** On the 「中英混排」 line, type 「modal 动词 verbs 用法」 — **switch frequently between Chinese and English**
> Watch for: whether **duplicated characters** appear after committing a candidate (for example 「情情态动词」)

### B. Boundaries and punctuation (historical bug hotspots)
- [ ] **B1** On the 「标点旁」 line, type immediately after 「、」 and 「【】」
- [ ] **B2** Type Chinese **inside** the square brackets of `[[在这里打字]]`
- [ ] **B3** Type Chinese **inside** the dollar signs of `$在这里打分$`
- [ ] **B4** Type Chinese after the hash of `#标签在这里`
> Watch for: whether **text inside the square brackets/dollar signs disappears** (this is exactly CodeMirror #1688, fixed only this April)

### C. Editing operations
- [ ] **C1** Press Backspace 10 times in a row, then immediately type Chinese
- [ ] **C2** Insert Chinese **in the middle** (not at the end) of an existing Chinese paragraph
- [ ] **C3** Select a Chinese passage and overwrite it by typing new characters directly with the IME
- [ ] **C4** Hold down a key (repeated input) and observe whether it stutters

### D. Undo / redo
- [ ] **D1** Type a word and press <kbd>Ctrl</kbd>+<kbd>Z</kbd>: it should **undo the entire word in one go**, not stop halfway (for example, leaving 「情态」)
- [ ] **D2** After 「连续退格后重打：」, do: Backspace 3 times → type Chinese → undo 6 times → redo 3 times
> Watch for: whether the undo stack is confused (one undo jumps far back, or the cursor jumps around after undo)

### E. Turn off decorations and test again (control experiment)
- [ ] **E1** Uncheck "Live Preview 装饰" and **redo each of** A2, B2, B3, D1
> This step is **for localization**: if problems occur with decorations on and disappear when off → the problem is in the decorations; if both fail → the problem is in the kernel

### F. Reverse validation (optional, but very convincing)
- [ ] **F1** Check "性能计时", type about 300 characters continuously and quickly, and see whether the right-side frame-rate check is ✅ (≥ 50fps)

---

## Result record table (fill in and send to me)

| Item | Result | If abnormal, brief description |
|---|---|---|
| Duplicated characters | ☐ None ☐ Yes | |
| Missing/swallowed characters | ☐ None ☐ Yes | |
| Cursor jumping | ☐ None ☐ Yes | |
| Undo abnormality | ☐ None ☐ Yes | |
| Stuttering (frame rate) | ☐ Normal ☐ Dropped frames | |
| Other "off" feel | | |

**IME information** (please record it as well; behavior differs greatly between IMEs):
- IME name and version: __________
- Which scheme is used (Full Pinyin/Shuangpin/Zhuyin/Cangjie/other): __________

---

## What this PoC cannot test (stated up front to avoid misjudgment)

- **Cannot test Electron**: this is Chrome. Electron uses the same Chromium + the same Blink input handling, and **IME-layer behavior is highly consistent**, but if you want 100% certainty, after the P0 shell is built you should **redo Group E cases in Electron**.
- **Cannot test large-document performance**: there are only a few hundred characters here. The smoothness of a 5,000-character document is another acceptance item for P1.
- **Cannot test `[[` autocomplete**: this PoC **deliberately disables autocomplete** in order to first test "pure" IME behavior. The interaction between autocomplete and IME (exactly where Monaco #2199 fails) must be tested separately when P1 has an autocomplete prototype — that is the next risk point that must be verified.

> In other words: **this PoC can only falsify, not prove**. If it goes wrong, the technology choice changes immediately; if it is fine, it only means "no obvious problems", and the remaining risks are left for P1 to hit one by one.
