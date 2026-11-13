# 05 · Digital Avatars and Feynman Scoring Research

> A technical selection research report for the Windows desktop learning app "Gezhi"
> Target users: Macau / mainland middle-school students (Form 1 – Form 6)
> Scenario: **AI voice practice partner + Feynman Technique scoring + GIF digital avatar**
>
> Status: **Draft skeleton, being filled in section by section**
> Convention: ✅ = verified via web_search / web_fetch; 🟡 = inferred (based on public common knowledge / engineering experience, not verified item by item); ⚠️ = **unverified**, must be measured or checked on the official site before implementation.

---

## Table of Contents

- [0. Executive Summary (TL;DR)](#0-executive-summary-tldr)
- [1. Making the Feynman Technique Executable](#1-making-the-feynman-technique-executable)
  - [1.1 Four-Step Method → Software Flow Mapping](#11-four-step-method--software-flow-mapping)
  - [1.2 Multi-Dimensional Scoring Rubric (1–5 Point Behavioral Anchors)](#12-multi-dimensional-scoring-rubric15-point-behavioral-anchors)
  - [1.3 Total Score Levels and Decision Rules](#13-total-score-levels-and-decision-rules)
  - [1.4 AI Output JSON Schema (DeepSeek structured output)](#14-ai-output-json-schemadeepseek-structured-output)
  - [1.5 Knowledge Gap Diagnosis: Aligning Textbooks and the Knowledge Point Graph](#15-knowledge-gap-diagnosis-aligning-textbooks-and-the-knowledge-point-graph)
  - [1.6 Socratic Follow-up Questioning Strategy (3-Level Progression + Counterexample Test)](#16-socratic-follow-up-questioning-strategy-3-level-progression--counterexample-test)
  - [1.7 Integration with Spaced Repetition (SM-2 / FSRS)](#17-integration-with-spaced-repetition-sm-2--fsrs)
- [2. ASR Selection](#2-asr-selection)
  - [2.1 Tencent Cloud ASR's Three Product Lines](#21-tencent-cloud-asrs-three-product-lines)
  - [2.2 TC3-HMAC-SHA256 Signing Key Points](#22-tc3-hmac-sha256-signing-key-points)
  - [2.3 Keys Must Not Be Placed in the Frontend: Architecture Recommendations](#23-keys-must-not-be-placed-in-the-frontend-architecture-recommendations)
  - [2.4 Open-Source ASR Alternatives Comparison](#24-open-source-asr-alternatives-comparison)
  - [2.5 Recommended Combination: Offline Fallback + Online Preferred](#25-recommended-combination-offline-fallback--online-preferred)
- [3. TTS Selection](#3-tts-selection)
  - [3.1 Tencent Cloud TTS Documentation and Voices](#31-tencent-cloud-tts-documentation-and-voices)
  - [3.2 Open-Source TTS Comparison](#32-open-source-tts-comparison)
  - [3.3 Engineering Points: Streaming, Synthesize-While-Playing, Interruption, AEC Conflict](#33-engineering-points-streaming-synthesize-while-playing-interruption-aec-conflict)
- [4. GIF Digital Avatar (Layered Approach)](#4-gif-digital-avatar-layered-approach)
  - [4.1 Option A: Pre-rendered GIF/APNG/WebP State Machine](#41-option-a-pre-rendered-gifapngwebp-state-machine)
  - [4.2 Option B: Live2D Cubism SDK for Web](#42-option-b-live2d-cubism-sdk-for-web)
  - [4.3 Option C: VRM + three.js + @pixiv/three-vrm](#43-option-c-vrm--threejs--pixivthree-vrm)
  - [4.4 Option D: Audio-Driven Lip Sync (Offline Pre-generation)](#44-option-d-audio-driven-lip-sync-offline-pre-generation)
  - [4.5 Recommended Route and State Machine](#45-recommended-route-and-state-machine)
- [5. Voice Loop Latency Budget](#5-voice-loop-latency-budget)
- [6. Privacy Compliance](#6-privacy-compliance)
- [7. One-Sentence Recommendations](#7-one-sentence-recommendations)
- [Appendix A: URL List (Clickable)](#appendix-a-url-list-clickable)
- [Appendix B: Fact / Inference / Unverified Comparison Table](#appendix-b-fact--inference--unverified-comparison-table)

---

## 0. Executive Summary (TL;DR)

| Module | Recommended approach | One-line reason |
| --- | --- | --- |
| Feynman scoring | **DeepSeek structured output (strict JSON) + 6-dimensional rubric + textbook original-text comparison** | Scoring must be reproducible and appealable, so the scoring dimensions are fixed and evidence must quote original sentences |
| ASR | **Tencent Cloud real-time speech recognition (WebSocket streaming) preferred; sherpa-onnx (already bundled on this machine) as offline fallback** | Buy accuracy online, buy availability and privacy offline |
| TTS | **Tencent Cloud streaming TTS preferred; Windows built-in SAPI Chinese voice as fallback** (⚠️ Edge-TTS has terms-of-service risk; evaluate before commercial use) | Controllable first-packet latency + zero-dependency fallback |
| Digital avatar | **Do Option A first (pre-rendered state-machine WebP/APNG), reserve interfaces for B (Live2D) / C (VRM)** | Visible results within a week, lowest cost, and decoupled from lip-sync driving |
| Latency budget | **End-to-end target ≤ 1.6 s (first-character feedback ≤ 400 ms)** | Beyond 2 s, students feel "it's not listening" |
| Privacy | **Recordings encrypted locally by default, not retained in the cloud, parental consent + one-click deletion** | Users are minors; compliance is a hard threshold, not a bonus |

> **The core engineering proposition of this report**: make "Feynman explanation" a first-class data structure (see the table design at the end of §1.7) (`explain_session` + `rubric_scores` + `gaps`), rather than a chat log. Only once structured can it connect to spaced repetition, produce parent-facing reports, and train scoring stability.

---

## 1. Making the Feynman Technique Executable

### 1.1 Four-Step Method → Software Flow Mapping

The classic four steps of the Feynman Technique must be translated in software into a **stateful, interruptible, persistable** flow, not a single prompt.

| Classic four steps | Software stage ID | What the student sees | What the system does | Produced data |
| --- | --- | --- | --- | --- |
| ① Select a concept | `select` | "Today we'll explain this: **the converse of the Pythagorean theorem**" | Get `kp_id` from the knowledge point graph, fetch the textbook original paragraph + curriculum standard requirements + prerequisite knowledge points | `session.kp_id` |
| ② Explain in simple language | `explain` | Big button "Start explaining to me"; the avatar enters **listening state** | Recording → ASR → real-time transcription; VAD runs simultaneously for endpoint detection | `session.transcript` (with word-level timestamps) |
| ③ Find stumbling blocks and gaps | `probe` | AI asks 2–3 rounds of Socratic follow-ups; the avatar enters **thinking state** | Align transcript with textbook/graph, locate `not mentioned / said wrong / said vaguely` | `session.gaps[]` + `session.probes[]` |
| ④ Simplify and analogize | `simplify` | "Explain it in one sentence for a primary-schooler" / "Give a real-life example" | Add one round of collection specifically scoring "popularization and analogy" and "example appropriateness" | `session.analogy_text` |
| (Wrap-up) | `report` | Explanation quality report: radar chart + level + 3 improvement suggestions + re-teaching plan | Generate JSON → render UI → write to `review_card` (connect SM-2/FSRS) | `session.report` |

**Key design constraints (inferred, but with ample engineering rationale)**:

1. **The `explain` stage does not allow the AI to interject.** Once interrupted, middle-school students give up. The AI can only give non-verbal feedback through the avatar's **expression** (confused / nodding).
2. **Follow-ups must have a cap** (≤ 3 rounds recommended). Socratic questioning works for adults; for a Form 1 student, more than 3 rounds turns into an interrogation and directly triggers quitting.
3. **Allow text fallback.** Students with stuttering, social anxiety, or microphone problems must be able to switch to typing mode, otherwise this group is lost outright. After 2 ASR failures, automatically prompt to switch.
4. **Minimum explanation duration.** Recordings under 15 seconds are considered invalid (student tapping randomly): no scoring, no quota consumed, no review card written.

> **State machine (suggested naming)**: `idle → selecting → listening → transcribing → probing → scoring → reporting → idle`
> Every state must be interruptible by "pause/exit", and exiting mid-way must **save the transcribed text so far** (half-finished work also has value).

---

### 1.2 Multi-Dimensional Scoring Rubric (1–5 Point Behavioral Anchors)

#### Design principles

1. **Only score observable behavior.** Do not score unobservable traits like "smart" or "gifted"—the AI can't judge them, and students won't accept them.
2. **Every dimension score must come with evidence.** Require the model to quote the original transcript sentence (`evidence_quote` + `evidence_start_ms`); if there is no evidence, record `null` rather than 0. This is the key to turning "AI giving scores blindly" into "appealable scoring".
3. **Weights are adjustable, but fixed by default.** Only fixed-weight scoring is comparable across questions (essential for the "progress curve").
4. **Take the best across rounds, not the last.** If the supplementary explanation after follow-up raises a dimension, record the improvement (that itself is evidence of "learning"); the final score should be `max(first explanation, after follow-up)` and the report should show "improved from X to Y".

#### Dimensions and weights

| # | Dimension | Suggested weight | What is scored | Main data source |
| --- | --- | --- | --- | --- |
| 1 | **Conceptual accuracy** | **30 %** | Whether the stated facts are correct, any hard errors, any concept substitution | Compare with textbook original-text / graph entries |
| 2 | **Key point coverage** | **25 %** | How many of the points that should be covered were covered | `key_points[]` of the knowledge point graph |
| 3 | **Logical structure** | **15 %** | Is there a causal chain, is the order correct, are there leaps | Discourse structure of the transcript |
| 4 | **Popularization and analogy** | **13 %** | Is it translated into plain language, do the analogies hold | Follow-up rounds + simplification round |
| 5 | **Example appropriateness** | **12 %** | Do examples fit the concept, do they cover boundary cases | Examples in the transcript |
| 6 | **Fluency and confidence** | **5 %** | Pauses, self-corrections, (inferred) speaking-rate and volume stability | ASR word-level timestamps + audio features |

> **Why accuracy is 30 % and not higher**: if accuracy weight were pushed to 50 %, a single slip of the tongue would knock a student from "proficient" down to "not mastered", causing excessive frustration. Pedagogically more reasonable is "accuracy as a single-vote downgrade"—see the hard rules below.
> **Why fluency and confidence get only 5 %**: it is a **process indicator**, not a **mastery indicator**. An introverted student who speaks haltingly but is correct should not be marked down to "hasn't learned". The purpose of these 5 % is to give the student **encouraging feedback**, not to widen score gaps.

#### 1–5 point behavioral anchors

**① Conceptual accuracy (30 %)**

| Score | Behavioral anchor (actual student performance) |
| --- | --- |
| 5 | All key statements agree with the textbook/definition; proactively points out error-prone points or preconditions ("must emphasize, here a cannot be 0") |
| 4 | Core statements correct, no factual errors; occasional imprecise wording but meaning unaffected |
| 3 | Main body correct, but 1 obvious imprecision or terminology mix-up (saying "area" when meaning "side length", etc.) |
| 2 | 1 clear factual error, or conflates two related but different concepts |
| 1 | The core proposition itself is wrong, or the answer is off-topic / restates the question |

**② Key point coverage (25 %)** — let the knowledge point have N points to cover, k hit

| Score | Behavioral anchor |
| --- | --- |
| 5 | k/N ≥ 0.9, and the importance distinction among points is correct (key points explained in detail, minor ones glossed over) |
| 4 | 0.75 ≤ k/N < 0.9 |
| 3 | 0.5 ≤ k/N < 0.75 |
| 2 | 0.25 ≤ k/N < 0.5 |
| 1 | k/N < 0.25, or only irrelevant content explained |

**③ Logical structure (15 %)**

| Score | Behavioral anchor |
| --- | --- |
| 5 | Has a clear "general—specific—general" or "condition→derivation→conclusion" skeleton; explicit transitions ("so", "but", "therefore"); the listener can anticipate the next step |
| 4 | Order basically reasonable, ≥ 1 explicit connective; missing a closing conclusion |
| 3 | Points listed as a parallel list, chained with "and... and...", no causal connections |
| 2 | Order has leaps; conclusion given before conditions without explanation; the listener must fill in the logic |
| 1 | Says whatever comes to mind, self-contradictory |

**④ Popularization and analogy (13 %)**

| Score | Behavioral anchor |
| --- | --- |
| 5 | Creates own analogy and **states the analogy's applicable boundary** ("like a water pipe, but the water-pressure-to-voltage analogy only holds when...") |
| 4 | Own analogy basically apt, can articulate the correspondence, but does not discuss the boundary |
| 3 | Can paraphrase the textbook in own words, but basically transplants terminology, no real analogy |
| 2 | Reads the definition verbatim; gets stuck when rephrased |
| 1 | Can only pile up terms; asked to "say it so a primary-schooler can understand", produces nothing or repeats the original |

**⑤ Example appropriateness (12 %)**

| Score | Behavioral anchor |
| --- | --- |
| 5 | Gives ≥ 2 examples, including **1 positive + 1 counterexample/boundary case**, and explains why the counterexample fails |
| 4 | Gives 1 correct and apt example, can articulate the correspondence |
| 3 | Has an example but too general ("like when doing problems"), or the example is correct but doesn't explain why it fits |
| 2 | Example only superficially related to the concept (using "the apple falls" to explain Newton's third law) |
| 1 | No example, or the example itself is wrong |

**⑥ Fluency and confidence (5 %)** — *process indicator, for encouraging feedback only*

| Score | Behavioral anchor |
| --- | --- |
| 5 | Almost no long pauses, no repeated starts, natural speaking rate, (inferred) stable volume |
| 4 | 1–2 pauses < 2 s or slight self-corrections, not affecting comprehension |
| 3 | ≥ 3 long pauses, but all recovered by self-correction |
| 2 | Frequent pauses, repeatedly re-saying the same sentence, explanation broken into fragments |
| 1 | Long silence or gives up midway |

> **Items that must not lose points (important)**: dialect accents, verbal tics ("uh", "and then"), low volume, slow speaking rate. The first two are unrelated to mastery; the latter two may be device or personality issues. **Only gently note them in the report, not in the score**—otherwise Macau/mainland accent differences become systematic bias.

#### Threshold scores and quick reference card

**Threshold score**: the minimum score that hits the dimension's "meets the bar" performance. Falling below the threshold triggers the downgrade rules.

| Dimension | Threshold | Meaning |
| --- | --- | --- |
| Conceptual accuracy | **4** | Being correct is the baseline; 3 and below must be downgraded |
| Key point coverage | **3** | Covering more than half counts as "explained" |
| Logical structure | **3** | At least understandable |
| Popularization and analogy | **2** | "Just paraphrasing" allowed, but reading verbatim not allowed |
| Example appropriateness | **3** | At least one decent example |
| Fluency and confidence | **1** | No threshold (never downgraded for expression) |

**Quick reference card (one-line version for product/UI)**

| Dimension | Weight | Threshold | What 5 looks like | What 1 looks like |
| --- | --- | --- | --- | --- |
| Conceptual accuracy | 30 % | 4 | All correct and proactively states error-prone preconditions | Core proposition wrong |
| Key point coverage | 25 % | 3 | Covers ≥ 90 % with appropriate detail | Covers < 25 % |
| Logical structure | 15 % | 3 | Has skeleton, transitions, conclusion | Self-contradictory, random order |
| Popularization and analogy | 13 % | 2 | Own analogy + states boundary | Only piles up terms |
| Example appropriateness | 12 % | 3 | Positive + counterexample + why it holds | No example or wrong example |
| Fluency and confidence | 5 % | 1 | No long pauses, natural rate | Long silence / gives up |

#### Weighted total score formula

```
raw   = Σ ( score_i × weight_i )          // i = 1..6, Σ weight_i = 1
total = raw × 20                           // map to 0–100 for display

Hard rules (Override, take precedence over the total score):
  R1  Conceptual accuracy = 1  →  total capped at 39 (not mastered)
  R2  Conceptual accuracy = 2  →  total capped at 59 (emerging)
  R3  Conceptual accuracy ≥ 4 and key point coverage ≥ 4 and example appropriateness ≥ 4  →  eligible for the "can teach others" candidate
  R4  Any dimension is null (no evidence) → remove that dimension by weight, normalize the remaining weights and recompute,
      and show "not scored this time: <dimension name>" in the report
```

> **Why R4 matters**: if the student stops after 20 seconds, the model should not score "logical structure" out of thin air. Removing no-evidence dimensions and showing them is far more honest than giving 0, and it avoids the manipulation space of "shorter recording, lower score".
> **R1/R2 are "single-vote downgrades", not vetoes**: still show the dimension breakdown of, say, 78 points, so the student sees "everything else is great, you just said this part wrong"—that has more educational value than one vague low score.

#### Weight variants (by subject, optional)

| Subject | Adjustment suggestion | Reason (inferred) |
| --- | --- | --- |
| Mathematics / Physics | Accuracy 32 %, popularization 8 %, examples 14 % | Science examples must be computable; over-analogizing misleads |
| Chemistry / Biology | Accuracy 30 %, key points 28 %, logic 12 % | Many factual details |
| Chinese / History | Logic 20 %, accuracy 25 %, popularization 15 % | Emphasizes argument structure and expression |
| English | Accuracy 28 %, fluency 12 %, logic 15 % | Fluency should be weighted only in language subjects |
| Information Technology / Informatics Olympiad | Accuracy 30 %, logic 20 %, examples 12 % | The logic chain of algorithm explanation is the core |

#### Scoring stability engineering (avoid "the same explanation scoring 20 points differently twice")

- **Set `temperature` to 0** (DeepSeek supports `temperature: 0`), and **forbid** using the default 1.0.
- **Second scoring within the same session is only for verification**; always show the first score to the student, avoiding distrust caused by score jitter.
- **Put anchor examples into the prompt**: include 1 five-point and 1 two-point labeled example per dimension (few-shot), significantly reducing "score drift" across dimensions.
- **Consistency spot checks**: each week, re-run scoring on 5 % of sessions; if |Δtotal| > 10, alert and manually review the prompt. ⚠️ **This strategy has not been measured**; the threshold needs calibration with real data after launch.

---

### 1.3 Total Score Levels and Decision Rules

| Level | ID | Total score range | Additional condition | What to say to the student | System action |
| --- | --- | --- | --- | --- | --- |
| **Not mastered** | `not_mastered` | 0–39 | or triggers R1 | "This hasn't been built yet; let's go through it together again." | Re-teach the same day; review interval **1 day**; drop down to prerequisite knowledge point self-check |
| **Emerging** | `emerging` | 40–59 | or triggers R2 | "You're on the right track, but a few places are stuck; I'll ask you two more questions." | Enter `probe` stage; review interval **1–2 days** |
| **Proficient** | `proficient` | 60–84 | accuracy ≥ 4 | "That was pretty clear—can you give another example?" | Review interval **4–7 days**; enter simplification round |
| **Teachable** | `teachable` | 85–100 | meets R3 and at least one analogy/example marked "citable" | "You explained it clearer than I could—want to try teaching a classmate?" | Review interval **14–21 days**; generate a shareable "little teacher card"; unlock the explanation demo library |

**Supporting mechanisms**:

- **Progress takes priority over absolute scores.** The first screen of the report shows the Δ of `this total vs. last total for the same knowledge point`, not the raw score. When Δ > 0 the avatar must play the "happy" animation—this is the key to turning scoring into positive feedback.
- **Levels are never retroactively lowered.** If this time is lower than last time for the same knowledge point, only hint "you might be a bit tired today, let's explain it again another day", and do not overwrite the highest historical level (store the highest separately in `best_level`).
- **`teachable` is a scarce resource.** If 90 % of students can get `teachable` on a knowledge point, the rubric is too loose or the knowledge point is too easy and the threshold needs adjustment—this is a signal for continuous calibration.

---

### 1.4 AI Output JSON Schema (DeepSeek structured output)

DeepSeek is compatible with OpenAI's `response_format: { type: "json_object" }` (**note**: `json_object` mode requires the word "json" to appear in the prompt and **does not guarantee** schema conformance; therefore the server must still validate with Zod/Ajv and do one repair retry). ⚠️ **Whether DeepSeek supports strict `json_schema` mode is unverified**, and must be measured before implementation; if not supported, go with "`json_object` + local validation + one retry on failure".

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FeynmanExplainReport",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version", "kp_id", "kp_name",
    "scores", "total_score", "level",
    "gaps", "probes", "highlights",
    "suggestions", "review_plan"
  ],
  "properties": {
    "schema_version": { "type": "string", "const": "1.0" },
    "kp_id":   { "type": "string", "description": "Knowledge point graph ID" },
    "kp_name": { "type": "string" },

    "scores": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "concept_accuracy", "key_point_coverage", "logical_structure",
        "plain_language_analogy", "example_quality", "fluency_confidence"
      ],
      "properties": {
        "concept_accuracy":      { "$ref": "#/$defs/dimScore" },
        "key_point_coverage":    { "$ref": "#/$defs/dimScore" },
        "logical_structure":     { "$ref": "#/$defs/dimScore" },
        "plain_language_analogy":{ "$ref": "#/$defs/dimScore" },
        "example_quality":       { "$ref": "#/$defs/dimScore" },
        "fluency_confidence":    { "$ref": "#/$defs/dimScore" }
      }
    },

    "total_score": { "type": "integer", "minimum": 0, "maximum": 100 },
    "level": {
      "type": "string",
      "enum": ["not_mastered", "emerging", "proficient", "teachable"]
    },
    "applied_rules": {
      "type": "array",
      "description": "Triggered hard rule IDs, e.g. ['R1']; empty array if none",
      "items": { "type": "string", "enum": ["R1", "R2", "R3", "R4"] }
    },

    "gaps": {
      "type": "array",
      "description": "Knowledge gaps, in descending order of severity",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["gap_id", "type", "severity", "student_said", "textbook_says", "kp_point", "why_it_matters"],
        "properties": {
          "gap_id": { "type": "string" },
          "type": {
            "type": "string",
            "enum": ["missing", "wrong", "vague"],
            "description": "missing=not mentioned  wrong=said wrong  vague=said vaguely"
          },
          "severity": { "type": "string", "enum": ["critical", "major", "minor"] },
          "student_said": {
            "type": ["string", "null"],
            "description": "Student's original words (verbatim quote, must not be paraphrased); null when missing"
          },
          "student_said_start_ms": { "type": ["integer", "null"] },
          "textbook_says": { "type": "string", "description": "Verbatim quote of the textbook original text" },
          "textbook_ref": {
            "type": "object",
            "additionalProperties": false,
            "required": ["source_file", "chunk_id"],
            "properties": {
              "source_file": { "type": "string" },
              "page":        { "type": ["integer", "null"] },
              "chunk_id":    { "type": "string" }
            }
          },
          "kp_point":       { "type": "string", "description": "Corresponding graph key point ID or original text" },
          "why_it_matters": { "type": "string", "description": "One sentence explaining what consequence this gap leads to" }
        }
      }
    },

    "probes": {
      "type": "array",
      "description": "Used/suggested follow-up questions, at most 3",
      "maxItems": 3,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["level", "question", "target_gap_id", "student_answer_summary", "resolved"],
        "properties": {
          "level": { "type": "integer", "minimum": 1, "maximum": 3 },
          "question": { "type": "string" },
          "target_gap_id": { "type": ["string", "null"] },
          "student_answer_summary": { "type": ["string", "null"] },
          "resolved": { "type": ["boolean", "null"] }
        }
      }
    },

    "highlights": {
      "type": "array",
      "description": "Things done well; must quote original words; at least 1, at most 3",
      "minItems": 1,
      "maxItems": 3,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["quote", "why_good"],
        "properties": {
          "quote":    { "type": "string" },
          "why_good": { "type": "string" }
        }
      }
    },

    "suggestions": {
      "type": "array",
      "description": "Improvement suggestions for the student, at most 3, must be specific and actionable",
      "maxItems": 3,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["action", "example_phrase"],
        "properties": {
          "action":         { "type": "string", "description": "e.g. 'state the order relationship between X and Y'" },
          "example_phrase": { "type": "string", "description": "Give a model sentence the student can say directly" }
        }
      }
    },

    "review_plan": {
      "type": "object",
      "additionalProperties": false,
      "required": ["next_review_in_days", "review_reason"],
      "properties": {
        "next_review_in_days": { "type": "integer", "minimum": 1, "maximum": 60 },
        "review_reason":       { "type": "string" }
      }
    },

    "self_check": {
      "type": "object",
      "description": "Let the model expose its own uncertainty, easing server-side degradation",
      "additionalProperties": false,
      "properties": {
        "transcript_quality":   { "type": "string", "enum": ["good", "fair", "poor"] },
        "scoring_confidence":   { "type": "string", "enum": ["high", "medium", "low"] },
        "low_confidence_reason":{ "type": ["string", "null"] }
      }
    }
  },

  "$defs": {
    "dimScore": {
      "type": "object",
      "additionalProperties": false,
      "required": ["score", "evidence_quote", "evidence_start_ms", "rationale"],
      "properties": {
        "score": {
          "type": ["integer", "null"],
          "minimum": 1, "maximum": 5,
          "description": "null = no evidence, not scored (triggers R4)"
        },
        "evidence_quote":    { "type": ["string", "null"], "description": "Verbatim quote of the student's original words" },
        "evidence_start_ms": { "type": ["integer", "null"] },
        "rationale":         { "type": "string", "description": "Why this score, which anchor it corresponds to" }
      }
    }
  }
}
```

**Server-side processing flow (recommended)**:

```
LLM output → JSON.parse (fail → repair retry once)
        → Zod/Ajv validation (fail → record raw output + fall back to "scoring unavailable" UI)
        → recompute weighted total and hard rules in code (never trust the model's self-reported total_score!)
        → persist to DB session_report
        → render report UI
```

> **The most important engineering discipline**: **the total score and level must be computed by server-side code, never trusted from the model.** The model is only responsible for giving 6 integers from 1–5 + evidence quotes; once you let the model compute the weighted sum itself, mathematical errors like "6 fours but 92 points" appear, and they are not reproducible. The same goes for `applied_rules`—it is self-reported by the model and is for reference only.

**Prompt skeleton (key points)**:

```
system: You are a middle-school <subject> teacher evaluating a student's oral explanation using the Feynman Technique.
        Output strictly according to the given JSON schema; output nothing other than JSON.
        Rules:
        1) Every dimension score must quote the student's original words as evidence; if no evidence is found, fill null—never guess.
        2) When judging "said wrong", you must quote the textbook original text verbatim for comparison (textbook_says field).
        3) Never deduct points for accent, verbal tics, speaking rate, or volume.
        4) highlights must have at least 1 entry—the student surely did something well; look carefully.
        5) Set the total_score field to 0; the server will recompute it.

user: [Knowledge point] <kp_name> (ID: <kp_id>)
      [Textbook original text] <retrieved_chunks with chunk_id + page>
      [Points that should be covered] <key_points[]>
      [Student transcript] (with timestamps)
        [0.0s] Um... I think the Pythagorean theorem says...
        [3.2s] the sum of the squares of the two legs of a right triangle equals the square of the hypotenuse
        ...
      [Student audio features] (optional) speaking rate <wpm>, long pauses <n> times
      Please output the evaluation JSON.
```

---

### 1.5 Knowledge Gap Diagnosis: Aligning Textbooks and the Knowledge Point Graph

This is the **hardest and most valuable** part of the whole scheme. The goal is to turn the student's spoken transcript into three types of actionable diagnosis:

| Type | ID | Criterion | Example | Corresponding teaching action |
| --- | --- | --- | --- | --- |
| **Not mentioned** | `missing` | The graph point `key_point` has **no semantic equivalent** in the transcript | When explaining the converse of the Pythagorean theorem, never says "the three sides must be known" | Not "doesn't know", but "missed it" → prompt to add, no downgrade |
| **Said wrong** | `wrong` | A statement in the transcript **logically contradicts** the textbook original text | "As long as the sum of squares of two sides equals the square of the third, it's an acute triangle" | **Highest priority**; directly triggers R1/R2 downgrade + immediate correction |
| **Said vaguely** | `vague` | Related expression exists but lacks key qualification/quantification/causality | "Anyway it can prove it's a right angle" | Use follow-up to force it clear (exactly the target of the follow-up strategy) |

#### Alignment flow (three stages)

```
① Key point extraction (offline, done once per knowledge point, cached)
   Textbook paragraph → LLM extracts key_points[] → manual/teacher review → store in knowledge_point.key_points
   ⚠️ This step must have manual review. If the automatically extracted key points are themselves wrong, everything downstream is wrong.

② Coverage comparison (online)
   student_transcript + key_points[]
     → three-way classification for each key_point:
        covered_correct / covered_wrong / not_covered
     → for not_covered, further judge: "never mentioned" or "mentioned but not expanded" (the latter → vague)

③ Original-text comparison (online, mandatory)
   For each gap judged wrong / vague, fetch the corresponding textbook chunk from retrieval results,
   quote it verbatim into textbook_says, with chunk_id + page so the UI can jump and highlight.
```

#### Prompt design approach (require quoting the textbook original text)

**Core technique: split "judgment" and "quotation" into two steps—retrieve first, judge second.**

1. **Forced quotation, no paraphrasing**: the prompt explicitly requires `textbook_says` to be a **verbatim copy** of a contiguous string in the retrieved chunk, no rewriting, no summarizing. This lets the server do **string validation**—take `textbook_says` and substring-match it against the retrieved chunks; a failed match means the model is fabricating textbook content (a hallucination detector). This is the highest cost-performance defense line in this scheme.

2. **Judge only within retrieved content.** The prompt says: "If the retrieved chunks do not contain what is needed for this judgment, `type` must be `vague` and `textbook_says` must be `retrieved chunks do not cover`, **do not supplement textbook content from your own knowledge**." — Making the model admit "the textbook doesn't have it" is far safer than letting it improvise.

3. **Give an operational definition to distinguish `vague` from `wrong`** (otherwise the model mixes them up):
   - `wrong`: there exists a statement that could be made correct by directly rewriting the textbook sentence (locatable to a specific sentence)
   - `vague`: cannot be located to a specific sentence, only "the whole passage is going in circles"
   
4. **Severity is computed by code, not decided by the model**: `severity` should be computed from `key_point.importance` (core/minor pre-annotated in the graph) × `type`, rather than discretionary model judgment. The severity given by the model is for reference only.

5. **Require timestamps.** `student_said_start_ms` lets the UI highlight the gap and replay the corresponding audio position—the student clicks once to hear how they said it at the time; this experience is extremely effective for "self-discovering gaps".

6. **Judge only 3–5 key points at a time.** With too many points the model gets lazy (the later ones judged sloppily). Recommend **batch calls**, 3–5 `key_point`s per batch, then merge.

#### Engineering details for aligning with textbook/graph

- **Suggested graph structure**: `knowledge_point(id, name, subject, grade_band, key_points[], prereq_ids[], source_refs[])`. `prereq_ids` lets a `not_mastered` result automatically drill down to prerequisite knowledge points.
- **Textbook retrieval**: reuse Gezhi's existing SQLite FTS5 route (see the predecessor scheme mentioned in `docs\00-environment-survey.md`), chunk granularity recommended **300–500 characters + page metadata**.
- **The graph and the textbook are two separate things**: graph key points are "what should be explained", textbook original text is "what the correct statement is". **Do not merge them**—after merging you cannot distinguish "the textbook doesn't say it" from "the student didn't say it".
- ⚠️ **Unverified**: the textbook corpus does not yet exist on this machine (the survey report confirmed the PEP textbooks are not in place), so the retrieval chain in §1.5 currently **has only a design, no data**. The manual review workload for `key_points` needs a measured assessment.

---

### 1.6 Socratic Follow-up Questioning Strategy (3-Level Progression + Counterexample Test)

The purpose of follow-up questioning is **not** to stump the student, but to force `vague` into `explicit` and expose `wrong` as "the student discovers the contradiction themselves".

#### Three-level progression

| Level | Name | Trigger condition | Question form | Example (converse of the Pythagorean theorem) |
| --- | --- | --- | --- | --- |
| **L1** | **Clarification** | `vague` detected | "What exactly do you mean by X?" Require a definition or boundary | "You said 'it can prove it's a right angle'—proved how?" |
| **L2** | **Causal probing** | Still vague after L1's answer, or there is a `missing` | "Why?" "What if it weren't like this?" Force out the causal chain | "Why does a triangle with sides satisfying this relation have to be right, not acute?" |
| **L3** | **Counterexample test** | L1/L2 answered correctly (to prevent "memorized right but didn't understand") | Give a **seemingly valid wrong example**, have the student judge | "Here's a set: 3, 4, 5 satisfies it. What about 3, 4, 6? 6²=36, while 3²+4²=25, and 36 > 25, so what kind of triangle is it?" |

#### Design points for counterexample tests

- **Counterexamples must be "near the boundary"**, not obviously absurd. "Can 1, 1, 10 form a right triangle" is too easy—students dismiss it at a glance, testing nothing. Give **3, 4, 6** (obtuse) and **3, 4, 4.5**—ones that need real computation.
- **Counterexamples should guide the student to compute themselves**; the AI should not give the answer first. The AI reporting the answer turns the test into lecturing and loses diagnostic value.
- **Getting the counterexample wrong is a good thing**: this precisely locates the gap's boundary ("you can apply the formula, but didn't understand the meaning of the inequality"). The report should phrase it as "we found a boundary case you didn't consider", not "you answered wrong".
- **At most 3 levels, at most 3 rounds.** When the cap is reached, wrap up and produce the report; don't linger. If the student is still confused after L3, the correct action is **re-explain with a simpler analogy**, not to keep questioning.

#### How follow-ups are presented (key adaptation for middle-schoolers)

| Approach | Not recommended |
| --- | --- |
| Avatar "confused" expression + one short question (≤ 25 characters) | Long follow-ups, three questions at once |
| Allow an "I don't know" button; pressing it goes straight to the next level or wraps up | Forcing an answer to continue |
| Follow-up voice playback can be **skipped/muted** (people around in a classroom) | Forced speaker output |
| Immediately affirm after the follow-up: "that sentence was well said" | Consecutive follow-ups with no positive feedback |

> **LLM contract**: follow-up generation should require the model to **output only one question**, with `question.length ≤ 25` Chinese characters. In practice (inferred), long questions are treated by students as "the AI is lecturing" and they give up answering. Recommend a hard constraint of `maxLength: 25` in the schema.

---

### 1.7 Integration with Spaced Repetition (SM-2 / FSRS)

The greatest value of Feynman scoring is: **it naturally produces high-quality review signals**. Ordinary drill questions' "right/wrong" is binary, whereas Feynman scoring gives "a continuous estimate of mastery + specific gaps", which feeds perfectly into spaced repetition algorithms.

#### Comparison of the two algorithms

| Item | SM-2 | FSRS |
| --- | --- | --- |
| Year | 1987 (SuperMemo 2) | since 2022, built into Anki 23.10+ |
| Model | Heuristic: `EF` (ease factor) + fixed interval sequence | **DSR model**: Difficulty / Stability / Retrievability |
| Input | `quality` 0–5 | `rating` 1–4 (Again/Hard/Good/Easy) |
| Output | Next interval in days | Next interval + memory stability prediction |
| Tunable | Only EF upper/lower bounds | **Can train parameters on personal review history** |
| Implementation difficulty | Very low (~30 lines) | Medium (need to bring in a library + optional training) |
| Suitable scenario | Fast launch, little data | Long-term use, after several hundred review records |

**References (✅ verified to exist)**:
- SM-2 original description: [SuperMemo Algorithm (official help wiki)](https://help.supermemo.org/wiki/SuperMemo_Algorithm) · [SuperMemo 2 algorithm original text (mirror repo)](https://github.com/clockzhong/OpenSuperMemo/blob/master/SM2/Docs/SuperMemo%202_%20Algorithm.html)
- FSRS official organization and implementation: [open-spaced-repetition (GitHub organization)](https://github.com/open-spaced-repetition) · [free-spaced-repetition-scheduler (based on the DSR model)](https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler)
- ⚠️ **Unverified**: `open-spaced-repetition.github.io/fsrs/` returns 404; the **current** entry point for the FSRS official wiki/docs needs separate confirmation; the repository address of `ts-fsrs` (TypeScript implementation) has also not been verified—must confirm before implementation.

#### Mapping from score → review parameters (recommended)

```ts
type Rating = 1 | 2 | 3 | 4; // Again / Hard / Good / Easy

function levelToRating(level: Level, delta: number): Rating {
  // delta = this total score - last total score for the same knowledge point
  if (level === 'not_mastered') return 1;                    // Again
  if (level === 'emerging')    return delta > 5 ? 3 : 2;     // Good / Hard
  if (level === 'proficient')  return delta > 5 ? 4 : 3;     // Easy / Good
  return 4;                                                  // teachable → Easy
}
```

**Three reasons for the mapping design (inferred)**:

1. **Don't map with absolute scores; use level + progress.** The same 70 points is a huge improvement for a student who always scored 50, and a regression for one who always scored 90—their review schedules should differ.
2. **`teachable` always maps to Easy.** Being able to explain clearly to someone else is the strongest evidence of memory strength; the interval should stretch to 2–3 weeks.
3. **`not_mastered` forces Again (same day/next day)**, but **no punitive extra drills**. The correct answer is "re-explain in a different way", not "copy it ten times". This is consistent with the level rules in §1.3.

#### Suggested data tables

```sql
-- Explanation session (one Feynman explanation)
explain_session(
  id, kp_id, started_at, duration_ms,
  transcript, transcript_words_json,   -- word-level timestamps
  audio_path, audio_encrypted,          -- see §6
  report_json,                          -- the complete JSON from §1.4
  total_score, level, best_level,
  created_at
)

-- Dimension score details (for long-term statistics on "which dimension is weakest")
rubric_score(session_id, dimension, score, evidence_quote, evidence_start_ms, is_null)

-- Knowledge gaps (aggregated across sessions; the data source for the "personal weak-point graph")
knowledge_gap(id, student_id, kp_id, gap_type, severity,
              first_seen_at, last_seen_at, resolved_at, session_ids_json)

-- Review cards (fed to SM-2 / FSRS)
review_card(id, student_id, kp_id, fsrs_state_json,
            due_at, last_rating, last_reviewed_at, reps, lapses)

-- Knowledge point graph
knowledge_point(id, name, subject, grade_band, key_points_json,
                prereq_ids_json, source_refs_json)
```

> **The `knowledge_gap` table is the strategic asset of this scheme**: after cross-session aggregation, it can answer "this student repeatedly stumbles on the 'boundary condition' class of gaps"—an insight one level higher than a single knowledge point's score, and the most persuasive content for parent reports.

---

## 2. ASR Selection

> **Conclusion first**: **Tencent Cloud real-time speech recognition (WebSocket streaming) as preferred, sherpa-onnx (already bundled on this machine) as offline fallback**. The reason is that streaming ASR lets the avatar react while the student is speaking, while the value of offline is not accuracy but "still usable when network/quota/privacy issues arise".

### 2.1 Tencent Cloud ASR's Three Product Lines

✅ The following product lines and free-tier information were verified from [Speech Recognition Billing Overview (online version)](https://cloud.tencent.com/document/product/1093/35686) (page last updated 2026-09-08):

| Sub-product | API / form | Free tier | Suitable scenario | Recommendation |
| --- | --- | --- | --- | --- |
| **Real-time speech recognition** | WebSocket streaming | **Yes** | Real-time transcription of explanations, text appears as you speak, drives VAD | ⭐ **Mainstay** |
| **One-sentence recognition** | `SentenceRecognition`, HTTP one-shot | **Yes** | Short answers within 60 s, voice input for follow-ups | ⭐ Mainstay (follow-up rounds) |
| **Recording file recognition** | `CreateRecTask` async task | **Yes** | Post-class batch re-transcription for high-quality reports | Auxiliary (async, not suitable for real time) |
| Recording file recognition fast version | Synchronous | Yes | Need to get long-audio results synchronously | Optional |
| Real-time speech recognition (LLM 1.0/2.0 version) | WebSocket streaming | **No free tier** | Higher accuracy, but **no free tier**; use cautiously in cost-sensitive scenarios | Budget-dependent |

> ⚠️ **Defer to the official site**: the **specific free-tier durations** in the docs' product billing framework table are marked "yes/no"; this capture **did not obtain the specific hours** (page content truncated). **Specific free tiers, tiered unit prices, and concurrency package prices must be confirmed on-site in the Tencent Cloud console/billing page**; this report does not give numbers that may expire.
> ⚠️ ASR sub-products with "LLM" in the name (1.0/2.0 versions, cross-border version) **are all marked "no" free tier**; the cross-border version may involve data export issues (see §6).

#### Key API parameters (✅ verified from the [One-Sentence Recognition API docs](https://cloud.tencent.com/document/api/1093/35646), last updated 2025-12-30)

| Item | Value |
| --- | --- |
| Request domain | `asr.tencentcloudapi.com` |
| Version | `2019-06-14` |
| Audio limits | **duration ≤ 60 s, file ≤ 3 MB** |
| Supported formats | wav, pcm, ogg-opus, speex, silk, mp3, m4a, aac, amr |
| Request rate | default **30 requests/second** (can purchase an increase) |
| Signature | signature method **v3** (see 2.2) |
| `Region` | **not required** |

**Key `EngSerViceType` (engine model) enums** — the column you should look at most when selecting:

| Enum value | Meaning | Significance for "Gezhi" |
| --- | --- | --- |
| `16k_zh` | Chinese general | Main scenario: Mandarin for mainland students |
| **`16k_zh-PY`** | **Chinese-English-Cantonese** | ⭐ **First choice for the Macau scenario** (Macau students often mix Chinese, English, and Cantonese) |
| **`16k_yue`** | **Cantonese** | ⭐ Students who mainly speak Cantonese |
| `16k_zh_dialect` | Multi-dialect, **supports 23 dialects** (Shanghainese, Sichuanese, Wuhanese…) | Students in mainland dialect regions |
| `16k_en` | English | Reading/oral practice in the English subject |
| `8k_zh` / `8k_en` | Telephone-scenario 8k | Not applicable (desktop 16k) |

> **Product decision**: Macau campus defaults to `16k_zh-PY` (Chinese-English-Cantonese); settings allow switching to `16k_yue`. **Do not offer only `16k_zh`**—Macau students routinely mix Cantonese words and English terms when explaining, and a Mandarin-only engine will recognize these as wrong characters, which the rubric then judges as "said wrong"—**the most dangerous misjudgment path**.

**Other useful optional parameters**:

- `WordInfo`: **word-level timestamps** (0 not shown / 1 without punctuation / 2 with punctuation). ⭐ **Must enable**—§1.4's `evidence_start_ms`, §1.5's gap replay, and fluency scoring all depend on it.
- `FilterModal`: filter filler words (0/1/2). ⚠️ **Recommend setting 0 (no filtering)**. Although "um" and "uh" are useless for scoring, filtering them loses the raw evidence for fluency scoring and makes `evidence_quote` mismatch what the student actually said (exposed on replay). Recommend keeping the original text and letting the code side ignore it during scoring.
- `FilterPunc`: punctuation filtering, recommend keeping (0), convenient for later sentence-splitting for logical structure analysis.
- `HotwordList` / `HotwordId`: **hotword list**. ⭐ **Score booster**—pass the current knowledge point's terms ("converse", "Pythagorean", "congruent") as temporary hot words. A single hot word ≤ 10 Chinese characters, weight 1–11 or 100, **at most 128 hot words**, comma-separated. Weight 11 = super hot word; weight 100 = enable homophone replacement enhancement (only `8k_zh`/`16k_zh`).
- `ConvertNumMode`: intelligent Arabic numeral conversion (default 1). Recommend enabling; "3 squared" is easier to read in math explanations.
- `CustomizationId`: self-learning model. ⚠️ Involves biometric features; **use with caution** (see §6).

**Real-time speech recognition (WebSocket)**: ⚠️ **the specific API doc URL was not verified item by item this time**. The product entry is in the [Speech Recognition Documentation Center](https://cloud.tencent.com/document/product/1093); real-time recognition uses the WebSocket protocol and requires signed-URL authentication. **The current WebSocket protocol docs and signing method must be confirmed before implementation** (real-time recognition's authentication is not exactly the same as the HTTP API's TC3 signature).

> **Cost reminder**: real-time speech recognition (LLM version) has **no free tier**. At an estimate of "2 Feynman explanations per class × 3 minutes each", a student produces about 6 minutes of audio per day → about 3 hours per month. **Specific costs must be calculated against the official tiered prices**; this report does not estimate. Recommend an in-app **usage dashboard + monthly hard cap**, with automatic switch to the offline fallback when exceeded.

### 2.2 TC3-HMAC-SHA256 Signing Key Points

Tencent Cloud API 3.0 uses **TC3-HMAC-SHA256** signing. ✅ Signature method doc entry: [Signature Method v3](https://cloud.tencent.cn/document/api/1823/132284). ✅ The one-sentence recognition docs explicitly state "for the signature method, refer to signature method v3 in the common parameters"; its Authorization header sample is:

```
Authorization: TC3-HMAC-SHA256 Credential=<SecretId>/2020-09-03/asr/tc3_request,
               SignedHeaders=content-type;host,
               Signature=0615f73a69c6b054affd69e4b1cbb68fbe84ae8024a9347df4aa5054933adac8
```

**Key signing steps** (✅ structure verified from the official sample; ⚠️ **the exact concatenation details defer to the official docs**; **strongly recommend using the official SDK rather than hand-writing the signature**):

1. **CanonicalRequest**: `HTTPRequestMethod` + `CanonicalURI` + `CanonicalQueryString` + `CanonicalHeaders` + `SignedHeaders` + `HashedRequestPayload`. Header keys must be **lowercase and sorted**, and values trimmed.
2. **StringToSign**: `algorithm` + `request timestamp (Unix seconds)` + `CredentialScope` + `HashedCanonicalRequest`. `CredentialScope` looks like `2019-06-14/asr/tc3_request` (date / service / termination string).
3. **Derive the signing key** (the core of TC3, a four-layer HMAC chain):
   ```
   SecretDate     = HMAC-SHA256("TC3" + SecretKey, Date)
   SecretService  = HMAC-SHA256(SecretDate,      Service)   // e.g. "asr" / "tts"
   SecretSigning  = HMAC-SHA256(SecretService,   "tc3_request")
   Signature      = HexEncode(HMAC-SHA256(SecretSigning, StringToSign))
   ```
   ⚠️ The derivation chain's **input order and salt position** must match the official docs verbatim—getting `key`/`message` backwards is the most common cause of signing failure (`AuthFailure.SignatureFailure`).
4. **Common causes of authentication failure**: `X-TC-Timestamp` deviating from server time by > 5 minutes; `host` header not matching the actual domain; body rewritten by middleware causing a payload hash mismatch; keys containing leading/trailing spaces.

**Engineering recommendations**:
- **Use the official SDK**: [tencentcloud-sdk-nodejs](https://github.com/TencentCloud/tencentcloud-sdk-nodejs). Hand-writing the TC3 signature has zero benefit and high debugging cost.
- **Do signing on the server**; the frontend only gets short-term credentials (see 2.3).
- **Clock synchronization**: the Electron client's system time may be inaccurate. If the client participates in signing (not recommended), it must first do a time check and give a clear error message.

### 2.3 Keys Must Not Be Placed in the Frontend: Architecture Recommendations

> **This is the most important point in this section.** Electron renderer-process code, `app.asar`, and strings packed into the installer **can all be unpacked and read**. `asar` is not encryption, just an archive format.

**❌ Absolutely forbidden**:
- Putting `SecretId` / `SecretKey` into frontend code, `.env` then packaged, or anywhere on the Electron `renderer` side.
- Using "obfuscation" or "Base64 encoding" as protection.
- Directly connecting to `asr.tencentcloudapi.com` on the client.

**✅ Recommended architecture (choose one, by project stage)**:

| Option | Approach | Applicable stage | Cost |
| --- | --- | --- | --- |
| **① Self-built lightweight relay (recommended)** | Client → your own HTTPS backend (with user JWT) → backend signs with long-term keys → Tencent Cloud. Keys stored only in server-side env vars / a key management service | **Launch** | Need a backend |
| **② STS temporary credentials** | Backend issues **short-lived, least-privilege** temporary credentials to the client; client connects directly to Tencent Cloud | Optional after a backend exists | Need correct CAM policy to prevent abuse of temporary credentials draining quota |
| **③ Local offline first** | Explanation audio defaults to **sherpa-onnx local recognition**; only when the user explicitly selects "high-accuracy mode" does it go to the cloud | Privacy-sensitive / no backend | Accuracy drops (see 2.4/2.5) |

**References (✅ official entries)**: [Tencent Cloud Access Management CAM docs](https://cloud.tencent.com/document/product/598) · [Speech Recognition Console](https://console.cloud.tencent.com/asr/settings). ⚠️ **The specific STS/CAM best-practice page URLs were not verified item by item**.

**Supporting measures**:
1. **Sub-account + least privilege**: create a separate CAM sub-account for "Gezhi", granting only `QcloudASRFullAccess`/`QcloudTTSFullAccess` (or finer), **never use the root account key**.
2. **Quota and alerts**: set usage alerts on the Tencent Cloud side; set a monthly cap on the app side. Both are needed to prevent a single point of failure from being drained.
3. **Key rotation**: support dual-key parallel transition (new key active, old key retained 24 h then revoked).
4. **Local config encryption**: if any credentials must be stored on the machine, use Electron `safeStorage` (DPAPI on Windows). This is the same problem as the "plaintext key risk" recorded in `docs\00-environment-survey.md`.
5. **Log redaction**: no logs, crash reports, or analytics may contain keys, `SecretId`, or **raw audio and full transcripts**.

> **A related reminder**: the survey report has recorded plaintext API key leaks on this machine (`~\.config\opencode\opencode.json` and the competition project's sample files). **Before integrating Tencent Cloud, first complete the revocation and rotation of those two keys, and establish a checklist of "keys not in the database, not in git, not in logs"**, otherwise the newly added Tencent Cloud keys will repeat the same mistake.

### 2.4 Open-Source ASR Alternatives Comparison

> **Verification status note**: the repository ownership and purpose of the following projects are based on public common knowledge; the License and size annotations in the table are **🟡 inferred**, and this time the repository pages were **not opened one by one** to verify License text and model size. ⚠️ **For every cell marked ⚠️, you must confirm against the repository's LICENSE file and model page before implementation**—especially before commercial use.

| Project | Repository (⚠️ URLs not verified individually) | License | Model size | Chinese performance | Windows CPU real-time | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| **sherpa-onnx** | `github.com/k2-fsa/sherpa-onnx` | Apache-2.0 ⚠️ | Depends on model (Chinese Paraformer/Zipformer usually tens–hundreds of MB) | Good (supports Paraformer / Zipformer / Whisper and other families) | ⭐ **Good**, officially edge-focused, has Windows x64 prebuilt | ⭐ **Already bundled on this machine** (see measurement below) |
| **whisper.cpp** | `github.com/ggml-org/whisper.cpp` | MIT ⚠️ | tiny≈75 MB / base≈142 MB / small≈466 MB / medium≈1.5 GB; quantized about 1/2–1/3 | Chinese usable but **only large models are good enough**; small models error-prone | Medium; `small` near real time, `medium` slower | C/C++ no dependencies, good Windows support |
| **faster-whisper** | `github.com/SYSTRAN/faster-whisper` | MIT ⚠️ | Same as Whisper series + CTranslate2 converted version | Same as Whisper | ⭐ Faster than whisper.cpp (CTranslate2 + int8) | **Requires Python runtime**; high Electron packaging cost |
| **FunASR** | `github.com/modelscope/FunASR` | ⚠️ to verify | Paraformer-large Chinese about hundreds of MB | ⭐ **Strong in Chinese/dialects**, industrial-grade | Medium; has ONNX export path | Python ecosystem, needs self-wrapping |
| **SenseVoice** | `github.com/FunAudioLLM/SenseVoice` | ⚠️ to verify | SenseVoiceSmall about hundreds of MB (including quantized) | ⭐ **Strong Chinese, supports Cantonese**, and includes emotion/event recognition | Medium–good (has ONNX / sherpa-onnx integration) | ⭐ **Most relevant to the Macau scenario**: Cantonese + emotion recognition in one |
| **Vosk** | `github.com/alphacep/vosk-api` | Apache-2.0 ⚠️ | Chinese small model about 40–50 MB | Average (weaker than above) | ⭐ **Excellent** (designed for low-resource devices) | Smallest size, lightest dependencies; insufficient accuracy but **suitable as fallback** |

**Local measured facts (✅ verified)**:

- The path `D:\DeepSeek Harness\resources\app.asar.unpacked\dsh\node_modules\sherpa-onnx-win-x64\` **actually exists**, with contents and exact byte counts:

  | File | Bytes | MB |
  | --- | --- | --- |
  | `onnxruntime.dll` | 17,812,456 | 16.99 |
  | `sherpa-onnx-c-api.dll` | 4,619,240 | 4.41 |
  | `sherpa-onnx.node` | 695,272 | 0.66 |
  | `sherpa-onnx-cxx-api.dll` | 272,872 | 0.26 |
  | `onnxruntime_providers_shared.dll` | 118,248 | 0.11 |
  | **Total** | **23,518,088** | **22.43** |

- This directory **has no `package.json`** (it is just a binary payload directory).
- `sherpa-onnx.node` exists → it is a **native addon for Node.js (N-API)**; the Electron main process can `require` it directly without extra FFI wrapping. ⭐ **Gezhi does not need to compile sherpa-onnx itself**.
- ⚠️ **Unverified**: whether the `.node`'s **ABI/N-API version is compatible with the Electron version Gezhi will use**; also **unverified** whether the directory ships model files—this time **only DLLs and `.node` were seen, no `.onnx` model at all**. **This means sherpa-onnx is only the engine; the Chinese model still needs to be downloaded/distributed separately**, which is a separate item that must be budgeted for in the size budget.
- ⚠️ **Unverified**: how DSH uses this package internally (its `package.json` declaration was not found). **Gezhi should not directly depend on DSH's node_modules path** (that's DSH's internal implementation and will change on upgrade), but should install `sherpa-onnx-node` itself as a formal dependency.

### 2.5 Recommended Combination: Offline Fallback + Online Preferred

```
                    ┌─────────────────────────────┐
   Microphone ──► VAD ──►│  ASR routing (policy layer) │
                    │  1. User explicitly chose "offline first"? │
                    │  2. Network available?                 │
                    │  3. This month's cloud quota not exceeded? │
                    │  4. Audio duration ≤ 60s?              │
                    └──────┬──────────────┬────────┘
                           │              │
              ┌────────────▼───┐   ┌──────▼─────────────┐
              │ Tencent Cloud ASR │   │ sherpa-onnx local    │
              │ real-time (stream)/one-sentence │   │ (offline, works without network) │
              └────────┬───────┘   └──────┬─────────────┘
                       │                  │
                       └────────┬─────────┘
                                ▼
                     Unified transcription result (with word-level timestamps)
                                ▼
                          Feynman scoring pipeline
```

**Routing strategy (recommended)**:

| Condition | Which path | Reason |
| --- | --- | --- |
| Network normal + quota not exceeded + user chose "high-accuracy mode" | **Tencent Cloud real-time recognition (`16k_zh-PY`)** | Streaming text, best experience, highest accuracy |
| Follow-up round (≤ 60 s short answer) | **Tencent Cloud one-sentence recognition** | Simple, fast, has free tier |
| Network unavailable / quota exceeded / user chose "pure offline" | **sherpa-onnx local** | Guarantees functionality; learning isn't interrupted by the network |
| Cloud confidence abnormally low (or student manually reports "recognized wrong") | **Rerun locally once for cross-validation** | Dual-engine comparison improves credibility (🟡 inferred) |
| Post-class fine report generation | **Recording file recognition** (async) | Doesn't occupy the interaction time window; can refine twice |

**Three non-negotiable design principles**:

1. **ASR results must be editable by the student.** ASR will definitely err (especially Cantonese/English-mixed technical terms). Before report generation, provide a lightweight confirmation screen "Was this passage recognized correctly?"—**the student clicking once to fix a character is 100× cheaper than explaining later "why did you mark me wrong"**.
2. **Must show which engine is currently used.** Students/parents have the right to know whether audio goes to the cloud. Indicate with a persistent icon (cloud / local), clickable for details.
3. **Quota exhaustion must degrade gracefully**; it must not just pop "service unavailable" and end. Degradation path: cloud → local → text-only mode; all three levels must work.

---

## 3. TTS Selection

### 3.1 Tencent Cloud TTS Documentation and Voices

✅ Verified from the [Basic Speech Synthesis API docs](https://cloud.tencent.com/document/product/1073/37995) (last updated 2026-03-30) and the [Voice List](https://cloud.tencent.com/document/product/1073/92668) (last updated 2026-09-29).

**API `TextToVoice`**:

| Item | Value |
| --- | --- |
| Request domain | `tts.tencentcloudapi.com` |
| Version | `2019-08-23` |
| **Text limit** | **Chinese ≤ 150 characters** (full-width punctuation counts as 1 character); **English ≤ 500 letters** |
| Return format | `Codec`: `wav` (default) / `mp3` / `pcm` |
| Sample rate | `8000` / `16000` (default) / `24000` (supported by some voices) |
| Speed | `Speed` ∈ [-2, 6]: -2=0.6×, 0=1.0× (default), 6=2.5×; **supports 2 decimal places** |
| Volume | `Volume` ∈ [-10, 10], default 0 |
| Emotion | `EmotionCategory` (neutral / sad / happy / angry / fear / news / story / radio / poetry / call / sajiao / disgusted / amaze / peaceful / exciting / aojiao / jieshuo, 17 kinds total) + `EmotionIntensity` ∈ [50,200], **only supported by multi-emotion voices** |
| Timestamp | `EnableSubtitle: true` → returns `Subtitles[]` (containing `BeginTime` / `EndTime` / `Phoneme`) |
| SSML | ⭐ **supported** ([SSML markup language](https://cloud.tencent.com/document/product/1073/49575)) |
| Concurrency limit | Premium voices **20**; LLM voices **20**; **ultra-natural LLM voices 10**; one-sentence cloned voices **10** |

> ⭐ **`EnableSubtitle` is extremely critical for this project**: the **word-level timestamps** (`BeginTime`/`EndTime`) returned by TTS are exactly the **free data source for driving the avatar's lip sync**! With them, Option A (GIF state machine) **needs no audio-analysis library at all**—just cut frames by timestamp. This single point lowers the avatar's implementation difficulty by an order of magnitude. **Be sure to enable it** (see 4.1 and 4.5).

> ⚠️ **The 150-character limit is a hard constraint**: AI follow-ups are limited to 25 characters (see 1.6), precisely so it both fits pedagogical principles and **completes in a single TTS call** (no segmented concatenation). Long explanations for playback must call TTS in segments and concatenate via `pcm` streaming.

**✅ Verified Chinese voices (education-scenario related, excerpted from the "Real-time TTS Voice List" section of the voice list page)**:

| Voice ID | Name | Recommended scenario | Type | Sample rate |
| --- | --- | --- | --- | --- |
| 402000 | Yun Xiaofu | Chat female voice | Ultra-natural LLM | 8k/16k/24k |
| 402001 | Yun Xiaotuan | Gentle sweet female voice | Ultra-natural LLM | 8k/16k/24k |
| 402002 | Yun Dawei | Magnetic male voice | Ultra-natural LLM | 8k/16k/24k |
| 403000 | Yun Xiaoduo | **Special child-girl voice** | Ultra-natural LLM | 8k/16k/24k |
| 403003 | Yun Xiaotian | **Youthful campus male voice** | Ultra-natural LLM | 8k/16k/24k |
| 403004 | Yun Dachuan | **Energetic male teacher** | Ultra-natural LLM | 8k/16k/24k |
| 403005 | Yun Yaqin | **Steady female teacher** | Ultra-natural LLM | 8k/16k/24k |
| 403006 | YunMia | American-accent female assistant | Ultra-natural LLM | 8k/16k/24k |
| 403007 | YunLeo | American-accent male assistant | Ultra-natural LLM | 8k/16k/24k |
| 502007 | Zhi Xiaohu | **Chat child voice** | Ultra-natural LLM | 8k/16k/24k |
| 502006 | Zhi Xiaowu | Chat male voice | Ultra-natural LLM | 8k/16k/24k |
| 502005 | Zhi Xiaojie | Commentary male voice | Ultra-natural LLM | 8k/16k/24k |
| 502004 | Zhi Xiaoman | Marketing female voice | Ultra-natural LLM | 8k/16k/24k |
| 502003 | Zhi Xiaomin | Chat female voice | Ultra-natural LLM | 8k/16k/24k |
| 502001 | Zhi Xiaorou | Chat female voice | Ultra-natural LLM | 8k/16k/24k |
| 602004 | Nuanxin Acan | Chat male voice | Ultra-natural LLM | 8k/16k/24k |
| 602005 | Zhuanye Zixin | Chat female voice | Ultra-natural LLM | 8k/16k/24k |
| 603000 | Dongs hi Shaonian | Special male voice | (page truncated) | — |

> **Voice selection recommendation**: for the avatar practice partner's **main voice**, recommend **`403005` Yun Yaqin (steady female teacher)** or **`403003` Yun Xiaotian (youthful campus male voice)**—the "teacher" persona better fits the Feynman explanation scenario; for a friendlier feel, use **`502007` Zhi Xiaohu (chat child voice)** as a "study buddy" persona. **Recommend offering 3 voices in settings for the user to choose**; middle-schoolers are very sensitive about this (some hate being lectured by a "teacher").
> ⚠️ **Price-difference warning**: the docs explicitly say "**prices differ by voice**; see the purchase guide for details", and voices are split into multiple tiers: "premium voice / LLM voice / ultra-natural LLM voice / one-sentence cloned voice". **Ultra-natural LLM voices are the most expensive tier** (🟡 inferred), **and have the lowest concurrency limit (10)**.
> ⚠️ **Defer to the official site**: the **specific prices and free tiers** in the [Text-to-Speech Purchase Guide](https://cloud.tencent.com/document/product/1073/34112) were **not verified this time** (that page was not opened). **Must confirm on-site before launch**, and build a cost model of "per-character billing × expected call volume".
> ⚠️ **Unverified**: the **doc URL and protocol details** of the real-time TTS (streaming) API `StreamTextToVoice`. ✅ Confirmed that the voice list page has a separate "**Real-time TTS Voice List**" subsection, indicating the streaming synthesis **product does exist**; the docs page's "next article" points to [Real-time Speech Synthesis](https://cloud.tencent.com/document/product/1073/94308), **to be verified before implementation**.

**If using voice cloning (not recommended for launch)**: `VoiceType = 200000000` is the fixed value for the one-sentence voice-cloning version, used with `FastVoiceType`. ⚠️ **Strongly recommend not doing "teacher voice cloning" for minors**—it involves voice rights, biometric features, and the ethical issue of "AI impersonating a real person" (see §6).

### 3.2 Open-Source TTS Comparison

> **Verification status**: same as 2.4—**repository ownership is based on public common knowledge; License and size are 🟡 inferred, and the repositories were not opened and verified one by one this time**. ⚠️ Must verify before implementation.

| Project | Repository (⚠️ not verified individually) | License | Size | Chinese naturalness | Latency | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| **Edge-TTS** | `github.com/rany2/edge-tts` | **GPL-3.0 ⚠️ and high terms risk** | Very small (a few MB, model in the cloud) | ⭐ **Very high** (Microsoft cloud voices) | Low (network round trip) | 🚨 **See risk warning below** |
| **Piper** | `github.com/rhasspy/piper` / `OHF-Voice/piper1-gpl` | **GPL-3.0 ⚠️** (new repo name includes "gpl", implying a change) | About 20–60 MB ONNX per voice | Chinese **average** (few Chinese voices) | ⭐ **Very low** (local CPU real time) | Suitable for offline fallback; **GPL has copyleft risk for closed-source commercial apps** |
| **Kokoro** | `github.com/hexgrad/kokoro` (+ `kokoro-onnx`) | Apache-2.0 ⚠️ | About 80–330 MB | Chinese support **limited** (mainly English) | Low | Outstanding English quality, **Chinese not a strength** |
| **GPT-SoVITS** | `github.com/RVC-Boss/GPT-SoVITS` | MIT ⚠️ | Several GB (including base model) | ⭐ Very high (strong few-shot cloning) | Medium–high (needs GPU for comfort) | Large size, heavy dependencies, **unrealistic for desktop packaging** |
| **CosyVoice** | `github.com/FunAudioLLM/CosyVoice` | Apache-2.0 ⚠️ | Several GB | ⭐ Very high, **supports streaming** | Medium (slow on CPU, good on GPU) | Alibaba Tongyi; good results but heavy |
| **ChatTTS** | `github.com/2noise/ChatTTS` | **AGPL-3.0 ⚠️** | About 1–2 GB | Good (strong conversational feel) | Medium–high | 🚨 **AGPL is the highest risk for commercial closed-source apps** |
| **Windows built-in SAPI** | System component (`System.Speech` / SAPI5) | Ships with Windows | **0** (already with the system) | Average (Microsoft Huihui / Yaoyao and other Chinese voices) | ⭐ **Very low** | ⭐ **Zero-dependency, zero-size fallback first choice**; ⚠️ whether the Chinese voice pack is preinstalled needs measurement |

> 🚨 **Edge-TTS risk warning (important)**: Edge-TTS is implemented by **reverse-engineering Microsoft Edge browser's online read-aloud service**; **it is not an API officially provided by Microsoft**. This means:
> - It **has no service-level guarantee**; Microsoft can change the interface at any time and break it;
> - It **uses Microsoft's service by bypassing official billing**, and **commercial use carries clear terms-of-service risk** (Microsoft's terms of service generally prohibit such unauthorized access);
> - The repository uses **GPL-3.0**, and linking it into a closed-source commercial product has **copyleft** issues.
>
> **Conclusion**: Edge-TTS **can be used for personal prototype validation, but is not recommended for competition or commercial products**. ⚠️ The judgment about terms risk above is **🟡 inferred** (based on a general understanding of similar service terms); **the specific terms need further confirmation**.
>
> 🚨 **License copyleft summary (for closed-source products)**: **MIT / Apache-2.0** can be safely used in closed-source commercial products; **GPL-3.0 / AGPL-3.0** are copyleft, **AGPL especially dangerous** (even a network service may trigger open-source obligations). If "Gezhi" plans to be closed-source or commercialize after the competition, **prefer MIT/Apache-2.0 components**.

**Recommended open-source TTS combination (for offline fallback)**:
1. ⭐ **First choice: Windows built-in SAPI Chinese voices** — size 0, lowest latency. ⚠️ Need to measure whether Windows 11 Chinese voice packs (Huihui / Yaoyao / Kangkang) exist and whether the quality is acceptable.
2. **Second choice: Piper Chinese voices** — if SAPI quality is unacceptable. ⚠️ **But first resolve the GPL-3.0 compliance issue**.
3. **Not recommended as desktop built-ins**: CosyVoice / GPT-SoVITS / ChatTTS (size and dependencies unrealistic), **but usable as high-quality server-side deployment options**.

### 3.3 Engineering Points: Streaming, Synthesize-While-Playing, Interruption, AEC Conflict

#### ① Streaming synthesis and synthesize-while-playing

```
❌ Non-streaming (bad):
   LLM produces full text → TTS synthesizes full audio → play
   └─ first-character latency = LLM full-text time + TTS full-text time  →  often 2–5 s, unacceptable

✅ Streaming (good):
   LLM streams tokens → split sentences by punctuation/length → TTS each sentence immediately → audio queue synthesizes and plays as it goes
   └─ first-character latency ≈ LLM first token + first sentence TTS  →  can be pushed to 500–900 ms
```

**Key implementation details**:

- **Sentence-splitting strategy**: split on `。！？；\n`; force a further split at commas when a single sentence exceeds **50 characters** (long sentences stretch first-packet time). A single sentence **must not exceed 150 characters** (Tencent Cloud TTS hard limit, see 3.1).
- **Choose `pcm` as the audio format**. `pcm` is a raw stream that **can be scheduled directly in order with the Web Audio API's `AudioBufferSourceNode`**, with no need to decode mp3/wav container headers, saving decode latency. ⚠️ The cost is that you must manage sample rate and channels yourself (Tencent Cloud returns 16k mono).
- **Use the `AudioContext` scheduling timeline** rather than chaining `Audio.play()`: compute `startTime = max(currentTime, previousEndTime)` for each audio segment, call `source.start(startTime)` in advance to queue, achieving **seamless transitions** (avoiding pops/gaps between sentences).
- **Prefetch 1–2 sentences**. Always keep at least 1 sentence waiting in the `Web Audio` queue, so network jitter is absorbed by the buffer.
- ⭐ **One TTS request corresponds to one "lip-sync task"**: because `EnableSubtitle` returns word-level timestamps, you can switch lip-sync frames precisely at `BeginTime` (see 4.1 / 4.5).

#### ② Interruption (barge-in)

The student must be able to interrupt the AI's speech at any time—this is the fundamental difference between a "practice partner" and a "broadcast".

```
State: AI is speaking
       │
       ├─ VAD detects the student speaking (energy + speech probability above threshold, lasting > 200 ms)
       │        │
       │        ├─► [Immediately] stop the current AudioBufferSourceNode
       │        │        └─ clear all scheduled but unplayed buffers in the AudioContext queue
       │        │        └─ cancel all in-flight TTS requests (AbortController)
       │        ├─► [Immediately] the avatar switches from "speaking" to "listening"
       │        ├─► [Immediately] abort the LLM streaming request (otherwise tokens are still burning money)
       │        └─► [Decision] should the retained half-sentence continue?
       │                 ├─ Yes → record breakpoint, resume from the breakpoint after the student answers
       │                 └─ No → discard, regenerate the reply based on context
       │
       └─ VAD not triggered → finish playing normally
```

**Interruption pitfalls**:

| Pitfall | Symptom | Solution |
| --- | --- | --- |
| **Only stopped the player, not the request** | Muted but still burning TTS/LLM quota | Must use `AbortController` to cancel the fetch; the server must also be able to sense the disconnect |
| **Queue residue** | A while after interrupting, the latter half emerges | On interrupt, clear the entire scheduling queue + increment a `playbackGeneration` counter; scheduling callbacks from the old queue find the generation mismatch and discard |
| **Self-triggering (most fatal)** | The AI's voice comes out of the speaker and is picked up by the microphone → VAD thinks the student is speaking → interrupts itself → infinite loop | See the AEC section below |
| **Too sensitive** | The student coughs, turns a page, or a nearby classmate speaks and it interrupts | Threshold + minimum duration + (optional) keyword detection: only things like "wait", "no", "why" count as valid interruptions (🟡 inferred) |

#### ③ Conflict with ASR echo cancellation (the most error-prone place in this section)

**The essence of the problem**: ASR needs to hear the student, but the speaker is playing the AI's voice. The two must coexist in the **same physical space**.

**Two modes; you must choose one or switch explicitly**:

| Mode | Approach | Pros | Cons |
| --- | --- | --- | --- |
| **Half-duplex (recommended for launch)** | While the AI speaks, **do not capture/recognize**; while the student speaks, **do not play**. Hard isolation via the state machine | Simple to implement, **zero echo risk**, cheap CPU | Can't truly "grab the floor"; interruption has latency |
| **Full-duplex (better experience but hard)** | `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })` + WebRTC AEC3 | Can naturally grab the floor | ⚠️ **AEC is far less effective on "non-speech content played by the speaker" than on human voice calls**; AEC support under Electron depends on the Chromium version and audio driver; residual echo is severe with speaker output + high volume |

**✅ Browser API fact**: `getUserMedia`'s audio constraints support the three boolean constraints `echoCancellation`, `noiseSuppression`, `autoGainControl`.

**Engineering recommendations (layered progression; don't start with full-duplex)**:

1. **Launch with half-duplex + strongly recommend headphones**. Detect/ask about headphones on first use; with headphones the echo problem basically disappears.
2. **If speaker output is unavoidable**, additionally do **software-side echo suppression**:
   - Record the TTS playback timeline (we know what the AI played at what moment);
   - **During AI playback, directly discard ASR results** ("playback gating")—crudest but most reliable;
   - After playback stops, open a **150–250 ms cooldown** (speaker tail + AEC convergence) to avoid treating the tail as the student speaking.
3. **Three-level interruption sensitivity**:
   - During playback → accept only **high-confidence, strong-energy** speech (real loud floor-grabbing);
   - After cooldown → normal VAD sensitivity;
   - ⚠️ **Unverified**: the false-trigger rate with speaker output in a real classroom/bedroom environment. **This number must be measured, not estimated**.
4. **Never** use "turn microphone gain very low" to avoid echo—students will give up because "the AI can't hear me".

**Supplement: the relationship between VAD and ASR**

- VAD (Voice Activity Detection) is used to **decide when a utterance starts/ends**, thereby triggering ASR.
- ✅ **sherpa-onnx has built-in VAD support** (internally integrates the Silero VAD model), so **choosing sherpa-onnx gives you VAD for free**; no need to integrate a separate one.
- There is also **Silero VAD** (`github.com/snakers4/silero-vad`) usable independently; the model is very small (about 2 MB ONNX, ⚠️ size unverified), callable directly via ONNX Runtime.
- `webrtcvad` (Python package `py-webrtcvad`): ⚠️ small but **inactively maintained**, mediocre Chinese performance, and it's a Python dependency.
- ⚠️ **Unverified**: whether `ten-vad` exists and its advantages.

**Recommendation**: **use sherpa-onnx's VAD directly** (zero new dependencies), with Silero VAD as an alternative. Recommended VAD silence-endpoint duration: **600–900 ms**—too short will cut off the student's thinking pauses (in a Feynman explanation the student inevitably stops to think), too long makes responses sluggish. ⭐ **Recommend making this parameter a user-adjustable "I speak slowly" toggle**.

---

## 4. GIF Digital Avatar (Layered Approach)

> **Strategy**: the avatar is **not** the product's core competitiveness, but it has a huge impact on middle-school retention. So the principle is "**build it with the dumbest method first, and leave the interfaces good**"—seeing a character that moves, listens, and speaks within a week is far better than spending a month tuning Live2D.

### 4.1 Option A: Pre-rendered GIF/APNG/WebP State Machine

#### Asset specs (recommended)

| State | ID | Loop | Suggested frames | Trigger condition |
| --- | --- | --- | --- | --- |
| Idle | `idle` | Loop | 40–80 frames (with blinking, slight breathing) | Default |
| Listening | `listening` | Loop | 30–60 frames (nodding, ear cocked, eye tracking) | VAD detects the student speaking |
| Thinking | `thinking` | Loop | 40–60 frames (head tilt, rolling eyes) | After submitting to LLM, waiting for first token |
| Speaking | `speaking` | Loop + **volume/timestamp-driven lip sync** | Mouth frame set (see below) | During TTS playback |
| Happy | `happy` | One-shot → back to idle | 30–50 frames | Score improvement / student got it right |
| Confused | `confused` | One-shot / short loop | 20–40 frames | Knowledge gap detected / before follow-up |
| Encouraging | `encouraging` | One-shot | 30–50 frames | After a wrong answer (**must be more common than happy**) |
| Offline | `offline` | Loop | 20 frames | Network unavailable |

#### ⭐ Format choice: **do not use GIF; use animated WebP (or APNG)**

| Format | Alpha transparency | Color | Size | Chromium/Electron support |
| --- | --- | --- | --- | --- |
| **GIF** | ⚠️ **only 1-bit transparency** (a pixel is either fully transparent or fully opaque) → **edge jaggies, white fringes** | 256 colors | Large | ✅ |
| **APNG** | ✅ **8-bit alpha** | 24-bit full color | Medium | ✅ |
| **Animated WebP** | ✅ **8-bit alpha** | 24-bit full color | ⭐ **smallest** (usually 30–70 % smaller than GIF) | ✅ Chromium native support |
| Lottie (JSON) | ✅ vector alpha | Vector | Tiny | ✅ requires `lottie-web` |

> **Conclusion**: although the requirement says "GIF digital avatar", **the implementation strongly recommends animated WebP**. GIF's 1-bit transparency produces ugly white fringes at the character's edges—the number-one source of a "cheap look" in middle-schoolers' aesthetic. **Keep GIF only as an export option** (compatibility fallback).
> ✅ **Fact**: GIF's alpha channel is indeed 1-bit (binary); APNG and animated WebP both support 8-bit alpha.
> ⚠️ **Inference to be verified**: the **specific support details and performance** of animated WebP and APNG in Electron/Chromium (especially memory usage when all 8 states are preloaded at once) **were not measured on this machine**. Recommend measuring during the PoC phase.

#### Volume-driven lip-sync frames (recommended approach)

```
TTS playback
        │
        ├─► [Path 1, recommended] use TTS word-level timestamps (Tencent Cloud EnableSubtitle)
        │        └─ cut lip-sync frames directly by Subtitles[].BeginTime/EndTime
        │        └─ use Phoneme (e.g. "ni2"/"hao3") for vowel classification → pseudo viseme
        │        └─ ⭐ zero audio analysis, near-zero CPU, naturally synchronized with speech
        │
        └─► [Path 2, fallback] Web Audio AnalyserNode energy-driven
                 ├─ each frame (~33 ms / 30 fps) read RMS or frequency-domain energy
                 ├─ energy → mouth openness level (3–4 levels are enough):
                 │      silence → closed frame / low → half open / medium → open / high → wide open
                 ├─ fftSize recommended 256–512 (lip sync doesn't need high resolution)
                 ├─ add smoothing (first-order low-pass / moving average, coefficient ~0.3), otherwise the mouth jitters at high frequency
                 └─ add minimum open/close hold time (e.g. 80 ms) to prevent single-frame flicker
```

> ⭐ **Strongly recommend Path 1**: Tencent Cloud TTS's `Phoneme` field directly gives pinyin—**this equals free viseme data**. Using pinyin finals for vowel classification (a/o/e/i/u/ü) mapped to 5 mouth frames works significantly better than pure volume driving, and **needs no audio analysis at all**. This is the highest ROI technique in this scheme.

#### How to produce assets

| Approach | Tool | Output | Cost | Copyright note |
| --- | --- | --- | --- | --- |
| **Live2D export sequence frames** | Live2D Cubism (see 4.2) | A PNG sequence per state → convert to WebP | Needs a model + learning cost | Cubism assets have their own licensing rules |
| **Pixel/2D hand-drawn animation** | **Aseprite** ([aseprite.org](https://www.aseprite.org/)) | Frame-by-frame animation, can export GIF/APNG/WebP directly | High time cost, but fully original | ⭐ **Original is safest** |
| **AI-generated sequence frames** | Stable Diffusion + consistency control (ControlNet / IP-Adapter / AnimateDiff) | Style-consistent multi-frame | Medium; ⚠️ **inter-frame consistency is hard to guarantee** (flicker) | ⚠️ **training-data copyright unclear; use commercially with caution** |
| **Buy/download ready-made assets** | itch.io, OpenGameArt, Kenney | Ready-made character packs | Low | ⚠️ **must check each License individually** |
| **3D render export** | VRM model + Blender frame-by-frame render | High-quality sequence frames | High | Determined by the model License |

⚠️ **Aseprite licensing note**: its **source code can be compiled yourself** (non-commercial), while the **official binaries require purchase**; the two have different licenses. ⚠️ The price figures were **not verified this time; defer to the official site**. This is a common misuse point.

**Copyright red lines for asset sources (⚠️ general reminder, not legal advice)**:

1. **Never** search "anime GIFs" online and use them directly — the vast majority are copyrighted; if a middle-school product gets a complaint, it looks terrible.
2. **Don't** use well-known IP characters (anime characters, game characters)—an asset site marking "free" may still mean "free to use" rather than "commercial use/redistribution allowed".
3. **Must check each of three things**: ① whether **commercial use** is allowed; ② whether **attribution** is required; ③ whether **modification** (derivative) is allowed.
4. **Recommended practice**: **draw your own / AI-generate with clear originality**, or use **CC0 / public-domain** assets. Store each asset's source URL and License text **in the repository's `ASSETS_LICENSE.md`**—this is material that must be checked at competition/listing time.
5. ⚠️ **The copyright status of AI-generated assets varies by region**; consult before using in commercial products; at least **keep a record of the generation process** (prompt, model, date) as evidence of creation.

### 4.2 Option B: Live2D Cubism SDK for Web

| Item | Description |
| --- | --- |
| Official entry | ⚠️ **not verified item by item**: the Live2D official site (`live2d.com`), the Cubism SDK download page, and `github.com/Live2D/CubismWebSamples` were **not verified this time** |
| Capabilities | Illustration layering + mesh deformation + physics + expression / blink / lip-sync parameters. **Has standard `ParamMouthOpenY` and other parameters**, naturally suited to lip-sync driving; far better than sequence frames |
| **License** | ⚠️ **critical and must verify**: Cubism SDK uses **tiered licensing**, generally free for **small-scale / low-revenue** users, with payment required above thresholds (PRO / publication license), and may require **publication license disclosure**. ⚠️ **The exact threshold amount and disclosure requirements were not verified this time**—**this is the only decisive factor for whether Option B can be adopted, and must be verified first** |
| Electron feasibility | 🟡 inferred feasible (WebGL + Canvas); the ecosystem has wrappers like `pixi-live2d-display`. ⚠️ These third-party wrappers' **repository URLs and Licenses are unverified**, and historically they frequently break due to Cubism SDK version changes |
| Asset acquisition | Needs a Live2D model (`.moc3` + textures + physics config). Self-made needs Cubism Editor (⚠️ free-version feature/commercial limits unverified); official sample models exist |

**Assessment**: the best 2D option for results and controllability, **but the licensing model is a hard threshold**. If "Gezhi" is a competition project / non-commercial → likely usable; once commercialized, **licensing must be re-evaluated**. **Recommendation: launch with Option A first, and keep Option B only as an interface.**

### 4.3 Option C: VRM + three.js + @pixiv/three-vrm

| Item | Description |
| --- | --- |
| Core library | ⚠️ **unverified**: `github.com/pixiv/three-vrm`, npm package `@pixiv/three-vrm` (**repository and License not opened and verified this time**) |
| Capabilities | Loads **VRM**-format 3D models; ✅ the VRM standard defines **BlendShape / Expression**, including the five vowel mouth shapes `aa`/`ih`/`uu`/`ee`/`oo` and `blink`—**this is tailor-made for lip sync**; usually comes with **automatic blinking** and a **lipsync example** |
| Electron feasibility | ⭐ **High**: three.js is a mature path in Chromium, WebGL2 available, GPU acceleration on desktop, performance far better than the browser |
| **License** | ⚠️ `@pixiv/three-vrm`'s License **unverified** (pixiv open-source projects are mostly MIT, but **must confirm**); **the VRM model's own License is determined by the model author**—✅ VRM metadata has formal fields like `licenseName` / `commercialUssageName` |
| Model assets | ⚠️ **unverified**: **VRoid Studio** (character creation; commercial terms to check), **Ready Player Me** (its avatar's free-tier commercial terms **must be verified**), [VRM Consortium](https://vrm-consortium.org/) official sample models |
| Size cost | three.js runtime about 600 KB–1.5 MB (min+gzip, ⚠️ unverified); VRM models usually 5–50 MB |

**Assessment**: the 3D option has the highest ceiling, and VRM's Expression standard makes lip sync almost "usable out of the box". **The cost is** that it requires 3D art skills (sculpting the model, tuning materials, tuning lighting), otherwise the result will be very ugly—and **for middle-school students, "ugly 3D" is more off-putting than "simple 2D"**.

**Recommended stance**: **Option C as the long-term evolution direction**. Wait until the product has validated "students really are willing to explain to an avatar", then invest in 3D. At that point, let users choose "simple 2D / 3D figure" in settings.

### 4.4 Option D: Audio-Driven Lip Sync (Offline Pre-generation)

> **Conclusion: do not use for real-time interaction.** The value of these schemes is in "**offline pre-generation of high-quality demo videos**"—e.g. teacher explanation demos, knowledge point introduction videos.

| Project | Repository (⚠️ unverified) | Real-time | Applicability judgment |
| --- | --- | --- | --- |
| **SadTalker** | `github.com/OpenTalker/SadTalker` | ❌ **slow** (minutes per second of audio) | Image → talking head, good quality, **offline** |
| **MuseTalk** | `github.com/TMElyralab/MuseTalk` | ⚠️ claims real time (needs GPU) | Real-time avatar direction, **but needs a good GPU + large engineering effort** |
| **Wav2Lip** | `github.com/Rudrabha/Wav2Lip` | ❌ slow | 🚨 **License / commercial restrictions must be verified** (academia often restricts commercial use of this project) |
| **NVIDIA Audio2Face** | ⚠️ official URL unverified | ⚠️ needs RTX | 🚨 **usually requires an RTX GPU + possibly NIM/container**; unrealistic for ordinary student laptops |
| **Rhubarb Lip Sync** | `github.com/DanielSWolf/rhubarb-lip-sync` | ✅ fast (offline command line) | ⭐ **practical**: input audio + mouth image set → output **lip-sync timeline JSON**. Can batch-preprocess, small size, no GPU dependency |

**Why real-time performance is poor (technical reasons)**:

1. These models are **diffusion/generative**; inference needs tens to hundreds of iterations;
2. The output is **frame-by-frame images**; at 1080p the entire face is re-rendered every frame;
3. Most implementations **are not designed for streaming input**—they need the full audio before starting.

**Degraded usage (recommended)**:
- Use **Rhubarb Lip Sync** to offline-generate a lip-sync timeline for **predefined TTS lines** → package into the app → read the timeline directly at playback (**zero runtime overhead**). This is the correct interpretation of the "offline pre-generation" idea.
- ⚠️ **Hidden pitfall**: Rhubarb's **phoneme set is English** (Preston Blair mouth set), **Chinese performance needs measurement**. ⚠️ **Unverified**.

### 4.5 Recommended Route and State Machine

#### Recommendation: **do A first, reserve B/C interfaces**

| Stage | What to do | Deliverable |
| --- | --- | --- |
| **P0 (1 week)** | Option A: 8 states of animated WebP + volume-driven lip sync | A character that blinks, listens, and speaks |
| **P1 (+1 week)** | Integrate Tencent Cloud TTS timestamps; change lip sync to **word-level synchronization** | Precise alignment of mouth and speech |
| **P2 (as needed)** | Extract the `AvatarRenderer` interface, with Option A as one implementation | Replaceable rendering backend |
| **P3 (long-term)** | Implement Option B (Live2D) or C (VRM) as a second implementation | Users switch avatars in settings |

**⭐ Key engineering decision: abstract the avatar into an interface, rather than hard-coding it as "show a GIF"**

```ts
// All options (A/B/C/D) implement this one interface
interface AvatarRenderer {
  /** Mount to the specified DOM container */
  mount(container: HTMLElement): Promise<void>;
  /** Switch expression state */
  setState(state: AvatarState): void;
  /** Set mouth openness 0..1 (volume-driven) */
  setMouthOpen(value: number): void;
  /** ⭐ Drive lip sync with TTS word-level timestamps (A can cut frames by the timeline; B/C can map to parameters) */
  driveLipSync(timeline: LipSyncFrame[]): void;
  /** Interrupt: immediately stop all animations and lip-sync scheduling */
  interrupt(): void;
  /** Preload resources, return progress 0..1 */
  preload(onProgress: (p: number) => void): Promise<void>;
  destroy(): void;
}

type AvatarState =
  | 'idle' | 'listening' | 'thinking' | 'speaking'
  | 'happy' | 'confused' | 'encouraging' | 'offline';

interface LipSyncFrame {
  startMs: number;
  endMs: number;
  /** 0..1 openness */
  openness: number;
  /** Optional: phoneme (Tencent Cloud Subtitles[].Phoneme, e.g. "ni2") → vowel mouth classification */
  phoneme?: string;
}
```

> This interface has only 7 methods, but it completely decouples the "avatar" from the "voice pipeline". All of P0's work is implementing `GifAvatarRenderer`; switching to Live2D later requires only adding one class, without changing any business code.

#### State machine and interruption handling

```
                    ┌───────────────────────────────────────┐
                    │              idle (idle)              │
                    │  Loops idle.webp + random blinking      │
                    └───┬─────────────┬─────────────┬───────┘
                        │             │             │
        VAD detects student speaking   user clicked "play follow-up"   network disconnected
                        │             │             │
                        ▼             ▼             ▼
              ┌──────────────┐  ┌──────────┐  ┌──────────┐
              │  listening   │  │ thinking │  │ offline  │
              │ (listening)  │  │(thinking)│  │(offline) │
              └──────┬───────┘  └────┬─────┘  └──────────┘
                     │               │
        VAD endpoint (600–900ms silence)  LLM first token / TTS first packet arrives
                     │               │
                     ▼               ▼
              ┌──────────────┐  ┌──────────────────────────┐
              │ transcribing │  │      speaking (speaking)   │
              │(transcribe/score)│ │  WebP loop + mouth frame overlay │
              └──────┬───────┘  └────┬───────────┬─────────┘
                     │               │           │
        Scoring complete │      AI finished speaking   │    student interrupts (VAD strong trigger)
                     │               │           │
                     ▼               ▼           ▼
              ┌────────────────────────────────────────────┐
              │  Result branch: happy / encouraging / confused │
              │  (one-shot play → automatically return to idle) │
              │  ⭐ encouraging's trigger frequency should be ≥ 2× confused │
              └────────────────────┬───────────────────────┘
                                   ▼
                                 idle
```

**Interruption handling (four things that must be implemented)**:

| Scenario | Action |
| --- | --- |
| **Student grabs the floor while the AI is speaking** | ① `interrupt()` clears the lip-sync scheduling queue; ② stop AudioContext playback; ③ state → `listening`; ④ abort TTS/LLM requests; ⑤ record an "interrupted" analytics event (this is a product health metric) |
| **User clicks "skip" while the student is speaking** | Won't happen (don't provide this button)—**the listening state is not allowed to be interrupted**; this is respect for the student |
| **Thinking state timeout (> 10 s)** | state → `confused`, play once, with a line "this question is a bit hard, let me think again", then continue waiting or prompt retry. **Don't make the student wait facing a frozen character** |
| **Network disconnected** | state → `offline`, and switch to local ASR/TTS at the same time. **The avatar should "express" this problem**, not silently freeze |

**⭐ An easily overlooked product principle**: **the avatar's expression must "lag behind" the content, not "foreshadow" it**. When the student answers wrong, play `encouraging` first (empathy), then go to `confused` (look for the problem together). If it goes straight to `confused` on a wrong answer, the student feels judged—this is the most common mistake that turns a "practice partner" into an "examiner".

---

## 5. Voice Loop Latency Budget

> **Why latency is a life-or-death line (🟡 inferred, but with broad engineering consensus)**: voice interaction's tolerance threshold is far lower than graphical interfaces. It is generally believed:
> - **< 300 ms**: feels like talking to a person
> - **300 ms – 1 s**: acceptable, slight lag
> - **1–2 s**: starts to feel "did it not understand"
> - **> 2 s**: middle-schoolers will likely repeat themselves or give up
>
> Therefore this scheme sets: **end-to-end first-character feedback ≤ 1.6 s, of which "AI starts to react" (animation + first syllable) ≤ 400 ms**. **The key is to make the avatar move first**—perceived latency is mainly determined by the first visual/auditory feedback, not by the complete answer.

### 5.1 Full-chain budget table

| # | Stage | Technical approach | Target latency | Acceptable upper bound | Degradation strategy |
| --- | --- | --- | --- | --- | --- |
| 1 | **Microphone capture** | `getUserMedia` + `AudioContext`, `sampleRate` 16000 (avoid resampling) | **10–30 ms** (buffer) | 60 ms | Lower `bufferSize`; `latencyHint: 'interactive'` |
| 2 | **VAD endpoint** | sherpa-onnx built-in VAD (or Silero VAD ONNX) | **600–900 ms silence judgment on-device** (this is a **design parameter**, not counted as latency overhead); compute cost **< 5 ms/frame** | 1.2 s | Dynamically shorten the silence threshold; provide an "I'm done" button as a fallback |
| 3 | **Audio upload / streaming send** | WebSocket fragmentation (real-time recognition) or whole-segment POST (one-sentence recognition) | **50–150 ms** | 300 ms | Reduce to 16k mono PCM (no wav header), enable compression |
| 4 | **ASR recognition** | Tencent Cloud real-time recognition (streaming) | **first character 200–400 ms**; whole segment **300–800 ms** | 1.2 s | ⭐ switch to sherpa-onnx local (**first character 100–300 ms**, slightly lower accuracy) |
| 5 | **LLM first token** | DeepSeek streaming (`stream: true`) | **400–900 ms** | 1.5 s | ① shorten the prompt (limit textbook chunks to 3–5) ② lower `max_tokens` ③ use a faster model tier ④ ⭐ play a preset filler phrase ("um, let me think") first |
| 6 | **Scoring (if on the critical path)** | DeepSeek structured output | **1.5–4 s** | 6 s | ⭐ **must move off the critical path**: give dialogue feedback first, run scoring in the background, push a report notification when done |
| 7 | **TTS first packet** | Tencent Cloud streaming TTS (`pcm`) | **200–500 ms** | 900 ms | Switch to Windows SAPI local (**first packet < 100 ms**, lower quality) |
| 8 | **Audio buffering & playback** | Web Audio `AudioBufferSourceNode` scheduling | **20–50 ms** | 100 ms | Shorten prefetch; allow a slightly shorter first-sentence buffer |
| 9 | **Animation response** | `AvatarRenderer.setState()` + lip-sync scheduling | **< 16 ms** (1 frame) | 50 ms | ⭐ **don't wait for any network**: switch to `listening` instantly on VAD trigger (local event) |

**End-to-end composition (critical path: student finishes speaking → AI's first syllable sounds)**:

```
VAD endpoint (600–900ms, design parameter)
  + upload 150ms
  + ASR first character 300ms
  + LLM first token 700ms
  + TTS first packet 350ms
  + playback buffer 50ms
  ───────────────────
  ≈ 1.55 s   ← hits the 1.6 s target

⭐ Optimized version (make the avatar move first):
VAD endpoint ends → [0 ms] the avatar immediately switches to thinking + plays preset "um..." (local audio, 0 latency)
             → student perceives a response ≈ 0 ms (!)
             → the real answer arrives 1.55 s later
```

> ⭐ **The most important latency technique in this report: decouple "perceived latency" from "real latency"**. The avatar + preset filler sound ("um...", "let me think") start on the **same frame** as the VAD endpoint, and the student immediately feels "it's listening". The real answer can take its time. **This one technique makes a 1.5 s end-to-end latency feel "almost real-time".**

### 5.2 Phased latency targets

| Stage | Target (end-to-end first syllable) | Description |
| --- | --- | --- |
| **MVP (usable)** | **≤ 3.0 s** | Get the pipeline working first; accept obvious lag |
| **Beta (acceptable)** | **≤ 1.8 s** | Add streaming LLM + streaming TTS |
| **Release (good)** | ⭐ **≤ 1.2 s** | Add preset filler sounds + instant avatar feedback + local fallback |
| **Ideal** | ≤ 0.8 s | Requires a local small model + local TTS; high cost, **not recommended to pursue at launch** |

### 5.3 Degradation strategies (auto-triggered by priority)

| Trigger condition | Degradation action | Impact |
| --- | --- | --- |
| LLM first token > 1.5 s | Play a preset filler phrase + switch to `thinking` animation (long version) | None (this is part of the design anyway) |
| LLM first token > 4 s | Indicate "the network is a bit slow", and offer "wait a bit longer / use offline mode" | Experience degrades |
| Network fully disconnected | **Switch the whole pipeline to local**: sherpa-onnx ASR + Windows SAPI TTS; LLM unavailable → **switch to rule-based dialogue driven by the preset question bank** (not a pure offline AI, but scripted follow-ups) | ⭐ Can still practice Feynman explanation, just without intelligent follow-ups |
| Cloud quota exhausted | Same as above | Same as above |
| CPU usage too high (> 80 %) | Turn off lip-sync driving (degrade to a static "speaking" animation), lower the animation frame rate | Visual quality degrades |
| Microphone unavailable | Switch to text-only mode (typed explanation) | Loses oral practice but retains the Feynman flow and scoring |

> ⭐ **"Still usable when the network is down" is a product differentiator, not fault tolerance.** Unstable home networks are normal for middle-schoolers. **Making offline mode an explicit feature ("offline practice mode") instead of an error message actually becomes a selling point.**

### 5.4 Measurement method (don't optimize by feel)

```ts
// Suggested analytics: record a high-precision timestamp at each stage, stored locally in SQLite
const marks = {
  vad_end:      performance.now(),          // VAD determines speaking finished
  upload_start: performance.now(),
  asr_first:    0,                          // ASR first character arrives
  llm_first:    0,                          // LLM first token arrives
  tts_first:    0,                          // TTS first packet arrives
  play_start:   0,                          // first syllable actually sounds
  anim_switch:  0,                          // avatar switches state
};
// Key metrics (look at both P50 / P95; mean alone is misleading):
//   perceived_latency = anim_switch - vad_end      ← ⭐ most important, target < 100ms
//   real_latency      = play_start  - vad_end      ← target < 1600ms
```

> **Look at P95, not the mean.** A product with a 1.2 s mean but a 5 s P95—students will remember those 5 stutters. **Recommend using P95 as the acceptance criterion.**

---

## 6. Privacy Compliance

> **Premise**: the users are **minors** (Form 1 to Form 6, including those under 14), processing **voice (biometric information)**, and involving **two jurisdictions: Macau and mainland China**. This is not a problem that "adding a privacy policy" can solve; it must be **built-in by design**.
> ⚠️ **This section is engineering- and product-level compliance design advice, not legal advice. Before formal launch, you must consult legal professionals qualified to practice in Macau and mainland China.**

### 6.1 Jurisdictions and regulations involved (⚠️ provisions and applicability require legal confirmation)

| Jurisdiction | Regulation | Most relevant point to this project | Verification status |
| --- | --- | --- | --- |
| **Macau** | Law No. 8/2005 "Personal Data Protection Act" | Personal data processing requires **legitimacy conditions**; sensitive data (including biometrics) is restricted; minors' data requires special protection | ⚠️ **specific provisions and latest amendments not verified**, requires legal confirmation |
| **Mainland** | "Personal Information Protection Law" (PIPL) | Personal information of minors **under 14** is **sensitive personal information**, requiring **separate consent + guardian consent**, and requires **dedicated personal information processing rules** | ⚠️ **specific article numbers not verified**, requires legal confirmation |
| **Mainland** | "Regulations on the Protection of Minors in Cyberspace" | Special obligations of providers of online products/services for minors | ⚠️ **effective date and provisions not verified** |
| **Mainland** | Generative AI service management regulations | Providing generative AI services to the public may require **filing / security assessment** | ⚠️ **unverified**, but **this is the most easily overlooked compliance risk for "AI learning apps"** |

> 🚨 **Two questions that must be confirmed first (🟡 inferred, but high risk)**:
> 1. **Data export**: if using Tencent Cloud's **cross-border version** of ASR, or using overseas LLMs/cloud services, student voice data may **leave the country**, which involves additional compliance requirements in both places. **Recommend launching with only mainland nodes + mainland services.**
> 2. **Whether voice counts as biometric information**: under PIPL, voice is generally recognized as **biometric information** (a type of sensitive personal information), which means **higher consent standards and stricter processing restrictions**. ⚠️ The specific determination requires legal confirmation, but **designing on the assumption of "yes" is the safe choice**. This directly affects the `CustomizationId` (self-learning model) mentioned in §2.1—**recommend not using any voice cloning/voiceprint-related features at launch**.

### 6.2 Six hard design principles

| # | Principle | Specific practice |
| --- | --- | --- |
| 1 | **Minimize by default** | **Do not upload raw audio by default.** Prefer local ASR; when cloud is necessary, prefer "upload the transcript + a very short audio clip" rather than the whole recording. Tencent Cloud's one-sentence recognition supports **uploading only the necessary clip**. |
| 2 | **Encrypted local recording storage** | Encrypt audio files with **AES-256-GCM** using a key derived from **Electron `safeStorage` (Windows DPAPI)** before writing to disk; keys not in the database, not in logs, not exported with backups. After encryption, the file header does not expose identifiable information. |
| 3 | **Parental consent + student awareness** | **Two-layer consent**: ① explicit consent from the guardian (parent); ② the student is told, in language they can understand, "how your voice will be used". ⭐ **Don't just have a single checkbox**—recommend a 30-second animated explanation for the student and parent to watch together. |
| 4 | **One-click deletion (real deletion)** | Provide a "delete all recordings" button that **simultaneously** deletes: ① local encrypted audio; ② audio already uploaded to the cloud (call the cloud deletion API); ③ derived data (transcript, embedding). ⭐ **The shorter the default retention, the better (suggest audio 7 days, transcripts may be retained long-term)**, and **auto-physically-delete on expiry, not soft-delete**. |
| 5 | **Explainability and appealability** | Students/parents can view: which cloud services were used, how many minutes were uploaded, what score the AI gave, and on what basis (the `evidence_quote` + `textbook_says` from §1.4 serve this purpose). **Scores must be appealable** (misjudgments caused by transcription errors must be correctable). |
| 6 | **Local-data-first** | Learning records (scores, gaps, review cards) **default to local SQLite only**, not uploaded. If cross-device sync is needed, **separate consent must be obtained**, and it is off by default. |

### 6.3 Implementation checklist for "one-click recording deletion"

```
User clicks "delete all recordings"
        │
        ├─ 1. Pop up a second confirmation, clearly stating what will be deleted and that it cannot be recovered
        │
        ├─ 2. Local: traverse the audio/ directory, overwrite each file + delete
        │       ⚠️ Note: overwriting on an SSD does not guarantee physical erasure; for higher assurance rely on
        │           OS full-disk encryption (BitLocker). Do not promise the user "unrecoverable".
        │
        ├─ 3. Local DB: DELETE FROM explain_session WHERE audio_path IS NOT NULL
        │              (also clear the audio_path field, keep scores and reports)
        │              ⚠️ SQLite needs VACUUM to actually release pages
        │
        ├─ 4. Cloud: call the Tencent Cloud-side deletion API to delete uploaded audio objects
        │       ⚠️ Unverified: whether Tencent Cloud ASR retains request audio, and for how long.
        │           This must be confirmed in writing with Tencent Cloud before procurement! This is the
        │           biggest unknown of this section — if cloud retention is uncontrollable, "one-click deletion"
        │           cannot truly be achieved technically, and must be honestly disclosed in the privacy policy.
        │
        ├─ 5. Derived data: delete the original verbatim records in the transcript
        │       (keep summary scores, delete text that can reconstruct voice content)
        │
        └─ 6. Write an audit log: what was deleted and when (not the content itself)
```

> 🚨 **The most important compliance unknown in this report**: **whether Tencent Cloud ASR/TTS services retain customer audio, for how long, and whether it can be deleted**. ⚠️ **Not verified this time**. If it cannot be deleted, then "one-click deletion of recordings" can only delete the local copy, and **the privacy policy must honestly state "the cloud may retain data as required by regulations"**—being honest with parents is far better than promising and failing. **This should be confirmed with Tencent Cloud before the procurement decision.**

### 6.4 Product-level transparency design (recommended)

- **Persistent status indicator**: clearly shown when the microphone is on (and also indicated in the system tray), **never eavesdrop in the background**.
- **Recording playback visible**: students can hear their own recordings (this is itself part of the Feynman Technique's "self-discovering gaps", see 1.5).
- **Not used for training**: the privacy policy explicitly promises **student voice is not used to train any model**. ⚠️ Need to confirm whether Tencent Cloud uses customer data to improve models, and exclude it in the contract.
- **Parent report page**: what is given to parents should be **learning insights** (e.g. "repeatedly errs on the boundary-condition class of gaps"), and **not** recording playback—avoid turning the tool into a surveillance tool. ⭐ **Getting this wrong will directly destroy students' trust in the product**.
- **Do not collect biometrics for identity recognition**: no voiceprint login, no facial-recognition attendance. **Unnecessary and extremely high risk**.

---

## 7. One-Sentence Recommendations

| Decision item | One-sentence recommendation |
| --- | --- |
| **Scoring scheme** | **Use DeepSeek structured output to produce 6 dimensions of 1–5 scores + verbatim evidence quotes (accuracy 30 % / coverage 25 % / logic 15 % / plain language 13 % / examples 12 % / fluency 5 %), with the total score and level recomputed by server-side code according to hard rules R1–R4, never trusting the model's self-reported total** — judging "said wrong" must quote the textbook original text verbatim (substring validation can serve as a hallucination detector), and dimensions without evidence are recorded as `null` rather than given 0. |
| **ASR** | **Tencent Cloud real-time speech recognition (Macau uses `16k_zh-PY` Chinese-English-Cantonese, mainland uses `16k_zh`) + must enable `WordInfo` word-level timestamps and `HotwordList` hot words; sherpa-onnx (22.43 MB of binaries already bundled on this machine, but the model must be configured separately) as offline fallback, with automatic three-tier routing by "high accuracy / pure offline / quota exhausted"** — ASR results must be editable by the student, because Cantonese/English-mixed technical terms will definitely be misrecognized, and wrong characters will be judged "said wrong" by the rubric. |
| **TTS** | **Tencent Cloud streaming TTS (`pcm` raw stream) + must enable `EnableSubtitle` word-level timestamps (including `Phoneme` pinyin, which equals free viseme data to drive the avatar's lip sync); main voices `403005` Yun Yaqin or `403003` Yun Xiaotian; keep follow-ups within 25 characters to avoid the 150-character limit; fallback uses Windows built-in SAPI Chinese voices (size 0, first packet < 100 ms)** — although Edge-TTS has the best quality, it has GPL-3.0 copyleft and terms-of-service risk from bypassing official billing, **usable only for prototypes, not for competition/commercial products**. |
| **Digital avatar** | **Do Option A first: 8 states of animated WebP (not GIF, because GIF only has 1-bit alpha and produces ugly white fringes) state machine + word-level lip sync, with visible results within a week; at the same time extract the 7-method `AvatarRenderer` interface to reserve space for Live2D (Option B) / VRM (Option C)** — the key product principle is **expressions must "lag" behind content** (on a wrong answer, `encouraging` empathy first, then `confused`), and `encouraging`'s trigger frequency should be ≥ 2× that of `confused`, otherwise the practice partner becomes an examiner. |
| **Latency budget** | **End-to-end real latency target ≤ 1.6 s (P95, not mean), but what really must be guarded is "perceived latency ≤ 100 ms"—on the same frame as the VAD endpoint, switch the avatar to `thinking` and play a local preset filler sound ("um..."), decoupling perceived latency from real latency; keep scoring off the critical path (run it in the background and push the report when done)** — per-stage budget: upload 150 ms + ASR first character 300 ms + LLM first token 700 ms + TTS first packet 350 ms + playback buffer 50 ms ≈ 1.55 s; if any stage exceeds 1.5×, auto-degrade per §5.3 (cloud → local → text-only, all three levels must work). |

---

## Appendix A: URL List (Clickable)

✅ = page verified accessible via web_fetch / web_search this time; ⚠️ = **unverified, must be confirmed before implementation**.

**Tencent Cloud · Speech Recognition (ASR)**
- ✅ [Speech Recognition Billing Overview (online version)](https://cloud.tencent.com/document/product/1093/35686) — product billing framework, free tier "yes/no", prepaid/postpaid (page updated 2026-09-08)
- ✅ [One-Sentence Recognition API docs](https://cloud.tencent.com/document/api/1093/35646) — full `SentenceRecognition` parameters, `EngSerViceType` enums, Authorization sample (updated 2025-12-30)
- ✅ [Speech Recognition Documentation Center](https://cloud.tencent.com/document/product/1093) — real-time speech recognition (WebSocket) entry
- ✅ [Speech Recognition Console](https://console.cloud.tencent.com/asr/settings)
- ✅ [Tencent Cloud Access Management CAM docs](https://cloud.tencent.com/document/product/598)
- ⚠️ Real-time speech recognition WebSocket protocol docs and authentication method — **exact URL not found, must be confirmed**
- ⚠️ Recording file recognition / fast version `CreateRecTask` docs — **URL unverified**
- ⚠️ ASR specific tiered prices and free-tier hours — **must defer to the console/billing page**

**Tencent Cloud · Speech Synthesis (TTS)**
- ✅ [Basic Speech Synthesis API docs](https://cloud.tencent.com/document/product/1073/37995) — full `TextToVoice` parameters, 150-character limit, `EnableSubtitle`, concurrency limits (updated 2026-03-30)
- ✅ [Voice List](https://cloud.tencent.com/document/product/1073/92668) — includes the "Real-time TTS Voice List" subsection and voice IDs (updated 2026-09-29)
- ✅ [SSML markup language](https://cloud.tencent.com/document/product/1073/49575)
- ⚠️ [Real-time Speech Synthesis](https://cloud.tencent.com/document/product/1073/94308) — link taken from the docs page's "next article", **not opened and verified**
- ⚠️ [Text-to-Speech Purchase Guide](https://cloud.tencent.com/document/product/1073/34112) — **not opened and verified**; prices defer to the official site

**Tencent Cloud · Signing and Security**
- ✅ [Signature Method v3](https://cloud.tencent.cn/document/api/1823/132284) — TC3-HMAC-SHA256
- ✅ [tencentcloud-sdk-nodejs](https://github.com/TencentCloud/tencentcloud-sdk-nodejs) — official Node.js SDK (link from the TTS/ASR docs pages' developer resources)

**Open-source ASR / VAD (⚠️ repository URLs and Licenses not verified individually)**
- ⚠️ sherpa-onnx — `github.com/k2-fsa/sherpa-onnx` (**its Windows x64 binaries are already bundled on this machine, ✅ measured 22.43 MB**)
- ⚠️ whisper.cpp — `github.com/ggml-org/whisper.cpp`
- ⚠️ faster-whisper — `github.com/SYSTRAN/faster-whisper`
- ⚠️ FunASR — `github.com/modelscope/FunASR`
- ⚠️ SenseVoice — `github.com/FunAudioLLM/SenseVoice`
- ⚠️ Vosk — `github.com/alphacep/vosk-api`
- ⚠️ Silero VAD — `github.com/snakers4/silero-vad`

**Open-source TTS (⚠️ repository URLs and Licenses not verified individually)**
- ⚠️ Edge-TTS — `github.com/rany2/edge-tts` (**GPL-3.0 + terms risk, not recommended for commercial use**)
- ⚠️ Piper — `github.com/rhasspy/piper` / `github.com/OHF-Voice/piper1-gpl`
- ⚠️ Kokoro — `github.com/hexgrad/kokoro`
- ⚠️ GPT-SoVITS — `github.com/RVC-Boss/GPT-SoVITS`
- ⚠️ CosyVoice — `github.com/FunAudioLLM/CosyVoice`
- ⚠️ ChatTTS — `github.com/2noise/ChatTTS` (**AGPL-3.0**)

**Digital avatar / lip sync**
- ✅ [Aseprite official site](https://www.aseprite.org/) — pixel animation tool
- ⚠️ Live2D Cubism SDK — `live2d.com`, `github.com/Live2D/CubismWebSamples` (**License threshold must be verified**)
- ⚠️ `@pixiv/three-vrm` — `github.com/pixiv/three-vrm` (**License unverified**)
- ✅ [VRM Consortium](https://vrm-consortium.org/) — VRM specification and Expression definition
- ⚠️ VRoid Studio / Ready Player Me — **commercial terms unverified**
- ⚠️ SadTalker — `github.com/OpenTalker/SadTalker`
- ⚠️ MuseTalk — `github.com/TMElyralab/MuseTalk`
- ⚠️ Wav2Lip — `github.com/Rudrabha/Wav2Lip` (**commercial restrictions must be verified**)
- ⚠️ Rhubarb Lip Sync — `github.com/DanielSWolf/rhubarb-lip-sync` (⚠️ phoneme set is English; Chinese needs measurement)
- ⚠️ NVIDIA Audio2Face — **official URL unverified**

**Spaced repetition algorithms**
- ✅ [SuperMemo Algorithm (official help wiki)](https://help.supermemo.org/wiki/SuperMemo_Algorithm)
- ✅ [SuperMemo 2 algorithm original text (mirror repo)](https://github.com/clockzhong/OpenSuperMemo/blob/master/SM2/Docs/SuperMemo%202_%20Algorithm.html)
- ✅ [open-spaced-repetition (FSRS organization)](https://github.com/open-spaced-repetition)
- ✅ [free-spaced-repetition-scheduler](https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler) — based on the DSR model
- ⚠️ FSRS official docs site — `open-spaced-repetition.github.io/fsrs/` **returns 404**; the current entry must be confirmed separately
- ⚠️ `ts-fsrs` (TypeScript implementation) — **unverified**

**Project internal materials**
- [Local environment survey report](../docs/00-environment-survey.md)
- [Intelligence layer selection: DSH as the Agent core](../docs/01-intelligence-layer-dsh-as-agent-core.md)

---

## Appendix B: Fact / Inference / Unverified Comparison Table

### ✅ Facts (verified this time)

| # | Fact | Source |
| --- | --- | --- |
| 1 | Tencent Cloud ASR bills in the order "free tier > prepaid > postpaid"; postpaid is off by default and must be manually enabled | [Billing overview](https://cloud.tencent.com/document/product/1093/35686) |
| 2 | "Real-time speech recognition", "recording file recognition", "one-sentence recognition", "voice stream async recognition", "recording file recognition fast version" **have free tiers** | Same as above |
| 3 | Real-time/recording file recognition with "LLM 1.0/2.0 version" and "cross-border version" **are all marked "no" free tier** | Same as above |
| 4 | `SentenceRecognition`: audio **≤ 60 s, ≤ 3 MB**, supports wav/pcm/ogg-opus/speex/silk/mp3/m4a/aac/amr, default rate **30 requests/second**, `Region` not required | [One-sentence recognition docs](https://cloud.tencent.com/document/api/1093/35646) |
| 5 | `EngSerViceType` enums include `16k_zh`, **`16k_zh-PY` (Chinese-English-Cantonese)**, **`16k_yue` (Cantonese)**, `16k_zh_dialect` (23 dialects), `16k_en`, etc. | Same as above |
| 6 | `WordInfo` can return word-level timestamps (three levels 0/1/2) | Same as above |
| 7 | `HotwordList` temporary hot words: single hot word ≤ 10 Chinese characters, weight 1–11 or 100, at most 128; weight 100 enables homophone replacement (only `8k_zh`/`16k_zh`) | Same as above |
| 8 | ASR uses **signature method v3**, Authorization header is `TC3-HMAC-SHA256 Credential=.../asr/tc3_request, SignedHeaders=content-type;host, Signature=...` | Same as above |
| 9 | `TextToVoice`: **Chinese ≤ 150 characters / English ≤ 500 letters**; `Codec` supports wav/mp3/**pcm**; sample rate 8k/16k (default)/24k | [Basic speech synthesis docs](https://cloud.tencent.com/document/product/1073/37995) |
| 10 | `Speed` ∈ [-2, 6] (-2=0.6×, 0=1.0×, 6=2.5×, supports 2 decimals); `Volume` ∈ [-10, 10] | Same as above |
| 11 | `EmotionCategory` supports 17 emotions + `EmotionIntensity` ∈ [50,200], multi-emotion voices only | Same as above |
| 12 | `EnableSubtitle` returns `Subtitles[]`, containing `BeginTime`/`EndTime`/**`Phoneme` (e.g. `ni2`/`hao3`)** | Same as above |
| 13 | TTS **supports SSML** | Same as above |
| 14 | TTS concurrency limits: premium 20 / LLM 20 / **ultra-natural LLM 10** / one-sentence clone 10 | Same as above |
| 15 | TTS voice IDs actually exist: `402000` Yun Xiaofu, `403003` Yun Xiaotian (youthful campus male voice), `403004` Yun Dachuan (energetic male teacher), `403005` Yun Yaqin (steady female teacher), `502007` Zhi Xiaohu (chat child voice), etc. | [Voice list](https://cloud.tencent.com/document/product/1073/92668) |
| 16 | The voice list page has a separate "Real-time TTS Voice List" subsection | Same as above |
| 17 | Tencent Cloud docs explicitly state "prices differ by voice" | Same as above |
| 18 | The local sherpa-onnx-win-x64 directory actually exists, containing 5 files totaling **23,518,088 bytes (22.43 MB)**, of which `onnxruntime.dll` 16.99 MB, `sherpa-onnx-c-api.dll` 4.41 MB, `sherpa-onnx.node` 0.66 MB | **Local measurement (PowerShell)** |
| 19 | This directory **has no `package.json`**; **only DLLs and `.node`, no `.onnx` model files at all** | Same as above |
| 20 | FSRS-related repositories actually exist: the `open-spaced-repetition` organization, `free-spaced-repetition-scheduler` (based on the DSR model) | [GitHub](https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler) |
| 21 | SM-2 algorithm original text and explanation are available | [SuperMemo wiki](https://help.supermemo.org/wiki/SuperMemo_Algorithm) |
| 22 | `open-spaced-repetition.github.io/fsrs/` **returns 404** | **web_fetch measured this time** |
| 23 | `getUserMedia` audio constraints support `echoCancellation`/`noiseSuppression`/`autoGainControl` | Web standard (🟡 spec text not checked item by item) |
| 24 | GIF's alpha channel is **1-bit**; APNG and animated WebP support **8-bit alpha**; Chromium natively supports animated WebP | Web format common knowledge (🟡 spec text not checked item by item) |

### 🟡 Inferences (reasonable judgments based on facts, not directly verified)

| # | Inference | Basis | Risk |
| --- | --- | --- | --- |
| 1 | whisper.cpp License is MIT; faster-whisper is MIT; Vosk is Apache-2.0; sherpa-onnx is Apache-2.0 | public common knowledge | **Medium**—must verify before commercial use |
| 2 | Edge-TTS is implemented by reverse-engineering Microsoft Edge's read-aloud service; commercial use has terms risk, and it is GPL-3.0 | public knowledge of the project's nature | **High**—legal risk |
| 3 | Piper is GPL-3.0 (the new repo name `piper1-gpl` corroborates); ChatTTS is AGPL-3.0 | name and public knowledge | **High**—copyleft |
| 4 | Whisper size by spec (tiny≈75 MB / base≈142 MB / small≈466 MB / medium≈1.5 GB) | parameter count and quantization common knowledge | Low |
| 5 | Ultra-natural LLM voices are the most expensive TTS tier | docs' note "prices differ by voice" + tier naming | Medium |
| 6 | Dual-engine (cloud+local) comparison can improve recognition credibility | engineering intuition | Low—but the gain needs measurement |
| 7 | Verbatim textbook quoting can enable **substring validation** as a hallucination detector | engineering reasoning | Low—**recommend measuring the match rate** |
| 8 | Input-method/ASR hallucination risk: the model may fabricate content not covered by the textbook | common LLM failure mode | Medium—**already mitigated with prompt constraints** |
| 9 | Follow-up length ≤ 25 characters improves student answer rate | teaching experience | Medium—**needs A/B measurement** |
| 10 | Avatar expression "lagging" behind content is better than "foreshadowing" | educational psychology intuition | Medium—needs measurement |
| 11 | Voice is biometric information (sensitive personal information) under PIPL | legal common knowledge | **High**—needs legal confirmation |
| 12 | Public-facing generative AI services may require filing/security assessment | regulatory common knowledge | **High**—needs legal confirmation |
| 13 | Per-stage latency figures (ASR first character 200–400 ms, LLM first token 400–900 ms, etc.) | industry rule-of-thumb values | **Medium**—**must be calibrated by local measurement** |
| 14 | VAD silence endpoint 600–900 ms best fits the Feynman explanation scenario | voice interaction experience | Medium—needs measurement |
| 15 | Specific sizes of Options A/B/C (three.js ≈600 KB–1.5 MB, Piper voices 20–60 MB, etc.) | public common knowledge | Low–Medium |

### ⚠️ Unverified (must be confirmed before implementation, ordered by priority)

| # | Unverified item | Why it matters | Suggested action |
| --- | --- | --- | --- |
| 1 | 🚨 **Whether Tencent Cloud ASR/TTS retains customer audio, for how long, and whether it can be deleted** | Directly determines whether "one-click deletion of recordings" can truly be achieved | **Confirm in writing with Tencent Cloud before procurement** |
| 2 | 🚨 **Live2D Cubism SDK's free-tier threshold and disclosure requirements** | Determines whether Option B can be adopted | Check the original text on the official License page |
| 3 | 🚨 **The actual License text of each open-source project** | Hard threshold for commercial compliance | Open each repository's LICENSE file |
| 4 | 🚨 **Filing/security assessment requirements for generative AI services** | May block launch | Consult legal professionals |
| 5 | **Specific prices and free-tier numbers** of Tencent Cloud ASR/TTS | Cost model | Check the console/billing page |
| 6 | **Protocol doc URL and signing method** of real-time speech recognition (WebSocket) | Technical basis of the mainstay option | Check the documentation center |
| 7 | **Docs and protocol** of real-time TTS `StreamTextToVoice` | Streaming TTS is the key to the latency target | Check the docs |
| 8 | **Whether DeepSeek supports strict `json_schema` structured output** | Determines how the §1.4 schema is implemented | Test the API |
| 9 | Whether sherpa-onnx `.node`'s **ABI is compatible with the Electron version Gezhi will use** | Determines whether it can be reused directly | Test `require` locally |
| 10 | **The Chinese model's specific choice, size, and Windows CPU real-time performance (RTF)** for sherpa-onnx | Core of the offline fallback | Download the model and measure |
| 11 | **Whether Windows 11 Chinese SAPI voice packs exist and whether the quality is acceptable** | Prerequisite for the zero-dependency TTS fallback | Measure locally |
| 12 | **Memory usage and performance of preloading 8 animated WebP states** | Feasibility of Option A | PoC measurement |
| 13 | **VAD false-trigger rate in speaker-output environments** (AEC effect) | Determines whether full-duplex interruption can be done | Measure in a real environment |
| 14 | **Lip-sync accuracy of Chinese Rhubarb Lip Sync** | Prerequisite for the offline pre-generation approach | Measure |
| 15 | **Actual accuracy of ASR engines when mixing Cantonese/English/Mandarin** | Core risk of the Macau scenario | Test with real student recordings |
| 16 | **Existence and License of TypeScript spaced repetition libraries like `ts-fsrs`** | Implementation path | Check npm/GitHub |
| 17 | License of `@pixiv/three-vrm` and VRoid Studio / Ready Player Me | Option C compliance | Check official pages |
| 18 | Revocation status of plaintext API keys for DeepSeek / Zhipu on this machine | Known security risk | Revoke and rotate in the console |
| 19 | Source and copyright of the PEP textbook corpus | Data basis for §1.5 gap diagnosis | Procurement/licensing assessment |
| 20 | **Locally measured values** of each latency figure | Calibration of the §5.1 budget table | Measure with the §5.4 analytics |

---

> **Report status**: this report is a **research-phase output**; all "unverified" items (especially the four items with priorities 1–4 in Appendix B) **must be verified before the technical plan is frozen**.
> **Verification method note**: the Tencent Cloud doc facts marked ✅ in this report come from the actual page text captured by `web_fetch` this time; the sherpa-onnx byte counts and file list on this machine come from `Get-ChildItem` measurement; content marked 🟡 and ⚠️ is inferred or could not be verified, and **no URL was fabricated**.
