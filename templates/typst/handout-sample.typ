// PDF pipeline acceptance sample (example file used to verify template capabilities)
//
// Purpose: verify every key aspect of the Chinese PDF pipeline in one pass —
//   no broken Chinese characters or tofu boxes, math, code blocks, tables, lists,
//   page numbers, source citations, callouts, derivations, worked examples,
//   comparison tables, and self-checks
//
// ★ Also verifies the "output must be clean" product requirement:
//   the PDF compiled from this file **must not contain any product attribution**
//   (no footer, no ending, no watermark).
//   Acceptance method: after compiling, search the PDF text; it must not match the project name.
//
// Compile: typst compile --root . templates/typst/handout-sample.typ output/handout-sample.pdf

#import "handout.typ": handout, tip, pitfall, cite, derive, example, compare, selfcheck
#import "gezhi.typ": gezhi-sans, gezhi-mono

#show: handout.with(
  // Note: Typst strings have **no escape sequences**; a double quote cannot appear inside another.
  // To embed quotes, use a raw string #"..."# or plain quotation marks.
  title: "Modal Verbs: From “Must” to “Speculation”",
  subtitle: "With derivations, examples, pitfalls, and a self-check",
  date: "October 2026",
)

= 1. Why Study Modal Verbs on Their Own

Modal verbs do not express the action itself; they express the speaker's *attitude*
toward the action: obligation, possibility, permission, or speculation. The same action
paired with different modal verbs means something completely different:

#align(center)[
  #text(size: 11pt)[
    You *must* be tired.　→　You are definitely tired. (confident speculation)\
    You *may* be tired.　→　You might be tired. (less certain)\
    You *can't* be tired.　→　You cannot possibly be tired. (negative speculation)
  ]
]

This set of examples captures the core of this lesson: *the difficulty of modal verbs
lies not in their inflection but in their semantic strength and context*.

#tip(title: "The one-sentence takeaway")[
  Modal verbs change "tense" very rarely; the real exam points are *strength of tone*
  and *basis for inference*. Nine out of ten lost exam points come not from failing to
  inflect them, but from being unable to tell how confident `must` and `may` are.
]

= 2. Three Strengths of Speculation
#table(
  columns: (auto, auto, 1fr),
  align: (left, left, left),
  stroke: 0.4pt + luma(75%),
  inset: 6pt,
  table.header([*Modal verb*], [*Degree of certainty*], [*Typical context*]),
  [`must`],   [High (roughly 90% or more)], [A positive inference backed by sufficient evidence; used only in affirmative sentences],
  [`may` / `might`], [Medium / low], [`might` is less certain than `may`],
  [`can't`],  [High (negative direction)], [The negative speculative form of `must`; `mustn't` cannot replace it],
)

#pitfall(title: "The most common mistake")[
  `mustn't` means *prohibition*, not "impossible". To say "impossible", use `can't`.

  #v(0.3em)
  #grid(
    columns: (1fr, 1fr),
    [✓ He `can't` be at home.　(He cannot be at home)],
    [✗ He `mustn't` be at home.　(× does not express speculation)],
  )
]

= 3. Formalizing It: Writing Certainty as Probability

If we write "degree of certainty" as a conditional probability, the differences between
modal verbs become numerical ranges. This section is *another representation of the same
topic* — being detailed means the concept can be explained in more than one way.

$ P("fact" divides "evidence") = frac(P("evidence" divides "fact") P("fact"), P("evidence")) $

#derive(title: "Why this interpretation works")[
  + Let "fact" be the proposition to be judged and "evidence" the observed phenomenon
  + What the speaker is actually doing is estimating $P("fact" divides "evidence")$, i.e. the degree of belief *after seeing the evidence*
  + `must` corresponds to this value being close to 1; `may` to medium; `might` to even lower
  + Note: this is only one way of understanding it and *cannot be inverted* — English usage is not equal to exact probability
]

- `must`　→ posterior probability near 1, and the prior must be nonzero
- `may`　 → posterior probability between 0.3 and 0.6
- `might` → lower than `may`, and often carries the meta-tone "I'm not sure"

#cite("Senior High School English Textbook (Compulsory)", page: 87)

= 4. Comparison: The Three Most Easily Confused

#compare(
  ([ ], [Affirmative direction], [Negative direction]),
  (
    ([Obligation], [`must` must], [`mustn't` prohibited]),
    ([Permission], [`can` / `may` may], [`can't` / `mustn't` may not]),
    ([Speculation], [`must` definitely], [`can't` impossible]),
  ),
)

#example(
  [The door is open and the light inside is on — say one sentence each with `must` / `may` / `can't`.],
  title: "Example 1",
  solution: [
    + `He must be at home.`　Light on, door open, clear evidence → high certainty
    + `He may be at home.`　You only saw the open door; maybe it was left unlocked → medium certainty
    + `He can't be at home.`　He just posted a photo from a trip out of town → ruled out
  ],
)

= 5. Describing the Decision Rule in Code

Writing semantic strength as an executable rule helps students check whether they truly
understand it — "can you write your understanding as a rule?" is exactly the question the
Feynman technique asks:

```python
def infer_strength(evidence_ratio: float, negative: bool = False) -> str:
    """Pick a suitable speculative modal verb based on the strength of evidence."""
    if negative:
        return "can't" if evidence_ratio > 0.8 else "may not"
    if evidence_ratio > 0.85:
        return "must"
    if evidence_ratio > 0.5:
        return "may"
    return "might"
```

#selfcheck((
  [Write one sentence each with `must` / `may` / `can't` describing your inference about the weather outside right now.],
  [Take a classmate's sentence and judge: are they speculating, or expressing "obligation"?],
  [Explain the difference between `must` and `may` to a primary-school student in one sentence.],
))
