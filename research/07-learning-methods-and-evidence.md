# Gezhi · What Other Learning Methods Can Be Integrated: Evidence, Design, and Boundaries of Originality (v1)

> **Purpose**: To answer "what can be added beyond the Feynman Technique"—each entry gives **strength of evidence, the concrete approach in Gezhi, implementation cost, and defense talking points**, ready to go straight into the Research Report.
> **Notation conventions** (following the other research documents in this project): [Fact] = actually opened and verified during this session; [Inference] = a judgment based on evidence; [Unverified] = not found, do not put it in the report.
> ⏰ **Time reminder**: Only 8 days remain until submission (2026-10-09). Section Zero of this document is the argument; items ①②③ in Section Two are what can be finished within 8 days, **everything else should go into the report's "Future Work"**—which is itself a plus.

---

## 0. First, two experiments that determine the entire argument of your work

### Experiment 1: When AI gives answers directly, grades get worse

**Bastani et al. (2024), "Generative AI Can Harm Learning," University of Pennsylvania, roughly 1,000 high school students in Turkey, mathematics.**

| Group | Practice phase | **Exam (after AI is removed)** |
| --- | --- | --- |
| Control group (no AI, solve problems themselves) | Baseline | Baseline |
| Access to ordinary ChatGPT | Practice accuracy **+48%** higher | **17% lower** |
| Access to an AI tutor that "only gives hints, not answers" | Practice accuracy **+127%** higher | **No difference from the control group** |

[Fact] The same experiment also measured AI reliability: ChatGPT solved math problems correctly only about **half** the time, and **made errors in 42% of solution steps**.
Source: [Hechinger Report](https://hechingerreport.org/kids-chatgpt-worse-on-tests/) (citing the SSRN preprint, 2024-07)

### Experiment 2: However restrained the AI design, it amounts to zero if students do not use it

**Oreopoulos & Low (2026), "One Click Away: AI Tutoring with Khanmigo in a Two-Year School Experiment," NBER Working Paper 35620.**
Two school years, 18 Tennessee middle schools, a true randomized controlled trial (RCT); Khanmigo was deliberately configured to **only give hints, not answers**.

| Metric | Result |
| --- | --- |
| Intention-to-treat analysis (ITT, two years combined) | About **0.06 SD** (0.08 SD in the second year) |
| Estimated effect for "actually participating all year" | **0.14 SD** |
| Comparison note | **This gain is comparable to "pure problem drilling with Khan Academy, without AI"** |

[Fact] **Why is the effect so small? The paper's own words**: 96% of students tried Khanmigo at least once, but **the median student only talked to it on one third of practice days**, and **only 17% sought help in practice sessions where they got problems wrong**; most messages students sent were bare answers, or they simply clicked the system-recommended hint.
[Fact] The paper's conclusion in its own words: **"The binding constraint is engagement: realizing the promise of AI tutors requires getting students to actually use them, not merely giving them access."**
Sources: [NBER w35620](https://www.nber.org/papers/w35620) (2026-08); [Sal Khan's interpretation](https://blog.khanacademy.org/what-i-found-compelling-in-a-new-randomized-trial-of-khan-academy-in-math-intervention/) (2026-08-24)

### Together the two experiments show only one thing

> **AI tutors currently have only two outcomes: either harmful (giving answers directly, −17%), or ineffective (however well designed, students do not use them).**
> **The only remaining path that can produce a positive return is "students producing their own output"—and the software must actively push this in front of students.**

🎯 **This is precisely the reason Gezhi exists, and it is what you should write in the first paragraph of the Project Introduction.**
The Feynman mode is responsible for "forcing production" (solving Experiment 1), while the calendar/planning module is responsible for "active push" (solving Experiment 2)—**your two puzzle pieces each solve exactly one failure mode exposed by a published experiment. This argument is a hundred times stronger than "we built an AI learning assistant."**

---

## 1. First take stock: which mechanisms you have already used correctly, without realizing it

Before writing the report, fill in this table—**what earns judges' points most easily is a team that "knows what principles it is using."**

| What you already have | The learning-science mechanism behind it | Evidence tier |
| --- | --- | --- |
| Question bank + paper generation | **Practice testing (retrieval practice)** | **Strongest tier** |
| Calendar + spaced repetition (FSRS) | **Distributed practice** | **Strongest tier** |
| Feynman scoring | Self-explanation + **learning by teaching (protégé effect)** | Strong |
| AI Socratic follow-up questioning | Elaborative interrogation | Medium–strong |
| Knowledge graph | Generative learning / concept maps | Medium |
| Avatar voice practice | Oral production + emotional feedback | Weak–medium (high retention value) |

[Fact] Dunlosky et al. (2013) reviewed 10 learning techniques and ranked them by utility: **only two are high-utility—practice testing and distributed practice**; medium utility includes elaborative interrogation, self-explanation, and interleaved practice; low utility includes rereading, highlighting, summarization, keyword mnemonics, and text imagery.
→ **You already occupy both of the highest-utility tiers** (question bank = practice testing, calendar = distributed practice). The report should state this explicitly; it is a very solid foundation.

---

## 2. Learning methods recommended for integration (ordered by priority)

### ① ⭐⭐⭐ "The fallible junior student"—make the teachable agent real (**most recommended**)

**Mechanism in one sentence**: Having a student teach an object that **genuinely does not understand and carries fixed misconceptions** forces far deeper cognitive processing than explaining to an AI that "knows everything."

**Evidence**

- [Fact] Chase, Chin, Oppezzo & Schwartz (2009), "Teachable Agents and the Protégé Effect": teaching a virtual student significantly increases learner engagement—**"I am helping it" makes people try harder than "I am being tested."** [Stanford archive](https://purl.stanford.edu/zm369yx3532)
- [Fact] Rogers et al. (2025), "**Playing Dumb to Get Smart**," CHI 2025—the paper's title is the conclusion: **the AI should play dumb**. [ACM](https://doi.org/10.1145/3706598.3713644)
- [Fact] Yang, Pujara & Li (2025), COLM 2025: having students act as "teachers" to teach an LLM; the key is designing **"engineered knowledge gaps" that only the student can fill**; a quasi-experiment in an undergraduate course showed significantly better grades than historical cohorts. The paper also points out: **when the LLM answers too accurately, it causes a "loss of learning opportunities."** [arXiv:2508.05979](https://arxiv.org/abs/2508.05979)
- ⭐[Fact] **Counter-evidence (the most important item)**: an experiment using ChatGPT as a teachable agent in programming education found that it improved knowledge mastery and self-regulated learning, but **"error-correction ability" did not improve significantly**—because **ChatGPT tended to hand over the correct code directly, so students never had a chance to debug**. [arXiv:2412.15226](https://arxiv.org/abs/2412.15226)
  → **In other words: if the AI is not dumb enough, students cannot practice the most critical ability—"finding errors." This is the empirical basis for "playing dumb" design; it must go into the report.**
- [Fact] At JSAI 2025 in Japan there is teachable-agent research that specifically uses a **"bug model" to drive RAG**—injecting the AI with **a coherent set of mutually consistent mistaken beliefs**, rather than random errors. [JSAI](http://jsise.org/taikai/2025/program/contents/pdf/A3-2.pdf)

**How to do it concretely in Gezhi**

1. **Change the persona**: turn the avatar from an "AI teacher" into "**a junior student in the same grade who is half a beat slower than you**." The junior student's positioning is "I did not understand; explain it to me."
2. **Give it a misconception library** (the core, and also where you can most differentiate):
   - Data source: **statistics on error causes from your own question bank**—take the three most frequent misunderstandings and write them as structured JSON:
     ```
     { misconception_id, surface_statement, why_wrong, correct_correction_point, trigger_condition }
     ```
   - Example (English · modal verbs): surface statement "must and may both express speculation, so they are interchangeable" / correct point "must expresses near-100% certainty in speculation, while may is only about 50%."
3. **Key constraint: misconceptions must be consistent**. The junior student must not instantly understand after being persuaded once, nor change the story each time—otherwise what the student diagnoses is "the AI is talking nonsense," not "the AI has a specific misconception." **Consistency matters more than the error itself.**
4. **Hard prompt constraints** (the step most likely to fail): LLMs are naturally eager to help and eager to understand instantly. The system prompt must state firmly:
   > Before the student's explanation hits the "correct correction point," **you must not indicate understanding**; you may only ask follow-up questions; each follow-up must be no more than 25 characters (reusing your existing constraint).
5. **Add a "correction effectiveness" dimension to scoring**: whether the misconception was eliminated, and how many turns it took—naturally quantifiable and trackable.

**Cost**: Low. Persona rework + 20–30 misconception entries + prompt constraints. **No new model and no new interface needed.**

**Defense talking points**:
> "AI learning assistants on the market all play the 'teacher.' But research finds that the more accurately the AI answers, the less students learn—in one programming-education experiment, because ChatGPT always gave the correct code directly, students' error-correction ability **did not improve at all**. So we reversed it: the AI plays **a junior student carrying fixed misconceptions**. The student has to explain it clearly and also persuade him. Then the student cannot bluff, because the junior student really does ask follow-up questions."

---

### ② ⭐⭐⭐ Active push: put "explain it to me" into the review queue

**Mechanism in one sentence**: Khanmigo's RCT proved that—**the AI tutor's biggest enemy is not capability, but students not opening it**. So "when to push the task in front of the student" is itself a learning-method question.

**Evidence**: See Experiment 2 in Section Zero. [Fact] Students sought help voluntarily in only **17% of sessions where they got problems wrong**; the paper attributes the crux to "help-seeking barriers + non-proactive interface."

**How to do it concretely in Gezhi** (this can create real differentiation)

- You already have an FSRS spaced-repetition queue, but **what is queued is "questions."** Change it so that **"explanations" are also queued**.
- Rule: when a knowledge point satisfies "FSRS due" **and** "Feynman score < 3" **and** "last explanation more than N days ago" → proactively pop up:
  > "The junior student forgot again—want to explain it to him once more?"
- Put the trigger on **the first screen when the app opens**, not hidden in some tab. **Khanmigo's lesson is that hidden help equals no help.**
- Over the long term, build a "mastery vs. review schedule" curve; this is excellent poster material.

**Why this is a real gap**: [Inference] Almost all AI learning products on the market do "you ask, I answer"; **no one treats "when the student should speak" as a scheduling problem**. And you happen to already have the full scheduling infrastructure (FSRS + knowledge graph + Feynman scoring); **anyone else would have to build what you already have first**.

**Cost**: Low (one query + one first-screen card).

---

### ③ ⭐⭐⭐ Interleaved practice—change "paper generation" from random question sampling to mixing question types (**the strongest evidence of all**)

**Mechanism in one sentence**: Practice **mixing different types of questions**, rather than drilling 50 questions on one knowledge point. It forces students to re-judge on every question "which method should I use here"—**and that is exactly the action real exams require**.

**Evidence** (the only one of the five directions with "middle-school classroom experiment" level evidence)

- [Fact] **Brunmair & Richter (2019) meta-analysis** (*Psychological Bulletin*): 59 studies / 238 effects / 158 samples, overall **g = 0.42**; **mathematics g = 0.34**; drawing g = 0.67; expository text not significant; **for vocabulary, blocking was actually better, g = −0.39**. Moderators: the more similar the categories, the larger the within-category differences, and the more complex the material, the stronger the effect. [DOI](https://doi.org/10.1037/bul0000209)
- [Fact] **Rohrer, Dedrick & Stershic (2014)** (*JEP*): a classroom experiment with **126 seventh graders over 3 months**—the interleaved group scored **d = 0.42** on the immediate test and **d = 0.79** on the test delayed 30 days. [DOI](https://doi.org/10.1037/edu0000001)

> 🎯 **d = 0.79 is the largest number in this entire document, and it comes from a middle-school mathematics classroom (not a lab, not university students). This is the strongest card in your hand.**

**⚠️ A reverse finding that must go into the report**: the same meta-analysis shows that **for vocabulary learning, interleaving is actually worse (g = −0.39)**.
→ **Never enable interleaving for English word cards**. Use interleaving only for **subjects that require "judging which method to use"**—among them **mathematics is the only one with direct evidence** (g = 0.34 meta-analysis + d = 0.79 classroom experiment); **physics and chemistry are reasonable extrapolations [Inference], and the report must label them as extrapolations**.
**This one point will immediately show judges that you actually read the literature rather than copying a buzzword.**

**Why this is especially meaningful for Chinese students**: the Chinese-style "sea of problems" strategy is **extreme "blocked practice"** (drilling 50 questions in a row on one knowledge point). Interleaved practice is exactly its opposite, and **it is almost nowhere to be seen in public products**.

**How to do it concretely in Gezhi**

- Add a switch to the paper-generation module: "**Interleaved mode**" (by default **enabled only for science question types**: mathematics has direct evidence; physics/chemistry are extrapolations).
- Rule: within the same paper, alternate different knowledge points / different question types.
- **The most critical point: do not indicate between questions which knowledge point a question belongs to**. Once you label "this question tests quadratic equations in one variable," the interleaving effect disappears—students go back to "pulling formulas by label."
- It fits naturally with your existing LaTeX paper generation: **just a sorting algorithm + one switch** (half a day).
- ⚠️ Conditions where it fails (write them into the report; judges will see you are rigorous):
  - **Basic knowledge must come first**; interleaving brand-new knowledge points that have not been learned at all is actually harmful;
  - When category differences are too large, it degenerates into "unhelpful multitasking switching";
  - [Fact] **Students subjectively find it harder and mistakenly believe they are learning worse**—so you must **actively explain this to them** ("feeling uncomfortable now is normal; in a week you will be stronger"). This explanation is itself a piece of metacognitive teaching.

**Defense talking points**:
> "The practice method most familiar to Chinese students is 'drill fifty questions on one knowledge point.' An experiment with 126 seventh graders over three months found that the mixed-practice group reached an effect size of **d = 0.79** on a test one month later—the largest number we found. But the same meta-analysis also found that **for vocabulary learning, interleaving is actually worse (g = −0.39)**, so our interleaved mode **is enabled only for science subjects; English word cards are turned off**; and **we deliberately do not label knowledge points**—because real exams do not tell you what a question tests."

**Cost**: Low (half a day).

---

### ④ ⭐⭐ Pretesting effect—before the explanation, let him "take a test" once (even if he will certainly get it wrong)

**Mechanism in one sentence**: **Guess first, then learn**; even if the guess is wrong, you remember it better than by studying directly. A failed retrieval attempt itself paves the way for later learning.

**Evidence** (**to be honest: this is the direction with the weakest aggregate evidence among these options; it is suitable as an auxiliary micro-interaction, not as a core selling point**)

- [Fact] Richland, Kornell & Kao (2009): across 4 experiments, the testing condition **all** outperformed the pure-study condition on the posttest. [DOI](https://doi.org/10.1037/a0016496)
- [Unverified] There is indeed an authoritative meta-analysis on this topic (St. Hilaire, Chan & Ahn, 2024, *Psychonomic Bulletin & Review*), but this session **could not read its pooled effect size**—**so do not write any specific number in the report**. [DOI](https://doi.org/10.3758/s13423-023-02353-8)
- ⚠️ [Fact] **Boundary conditions (must be written)**: the effect is **question-specific**—only the question that was pretested benefits; **it fails without feedback**; purely conceptual pretesting, reading / long-video scenarios easily fail; some studies even report that using prequestions in third grade **actually harms** comprehension.

**How to do it concretely in Gezhi**

- Before entering the Feynman explanation, pop up **1 question**, and allow an "**I cannot answer**" button.
- At this point the AI **only records, does not explain, does not correct** (once it explains, it becomes "learning" and the pretesting effect disappears).
- **After the explanation, feedback is mandatory**—come back, redo this question, and give the correct answer. **This is a necessary condition in the literature, not optional.**
- ⚠️ **Do not make it a "preview before reading" feature**: the literature shows it easily fails in reading-material scenarios.

**Cost**: Very low (reuse the question bank + change the process order; can be done within a day).

---

### ⑤ ⭐⭐ Self-explanation (written version)—lower the psychological threshold of the Feynman method

**Mechanism in one sentence**: The Feynman Technique requires "explaining to the AI," but **introverted students get stuck at the step of speaking up**; and the cognitive benefit mainly comes from the act of "explaining" itself, which does not necessarily require speaking aloud.

**Evidence**

- [Fact] Bisra et al. (2018) meta-analysis on self-explanation: 64 studies / 69 independent effect sizes / **5,917 participants**, weighted average effect size **+0.55**; even when the comparison condition was "directly providing a ready-made explanation," self-explanation still prevailed. (Cross-verified through two secondary sources: [Best Evidence in Brief](http://www.beib.org.uk/category/self-explanation/) and that topic's database; **the original abstract was not read directly this session**, and the report should label it as a secondary source)
- ⭐[Fact] **The mathematics-specific meta-analysis is only 0.27**: Rittle-Johnson, Loehr & Durkin (2017) (*ZDM*, 26 studies), effect size **ES = 0.27**.
  → **Your Feynman scoring is mainly used in science scenarios, so citing 0.27 is safer than citing 0.55**, and it stands up better to judges' follow-up questions.
- ⚠️ [Fact] **Boundary conditions (very critical)**: **purely metacognitive prompts (e.g., "think about how well you understand it") are ineffective for subject achievement**; **content-related prompts are required**.
  → So the design "**state in one sentence why you did this**" is correct (content-related), while vague questions like "do you think you understand?" are **ineffective**.
- ⚠️ [Fact] Limitations: these studies **mostly lasted less than an hour, mostly used university students, and had somewhat artificial settings**; effect sizes **cannot be assumed to transfer directly to real classrooms**; and self-explanation **takes more time** (though the effect remains after controlling study time). When citing, **the limitations must be written at the same time**.

**How to do it concretely in Gezhi**

- After finishing each question, add a required input box: "**Explain in one sentence why you did this**" (limit 60 characters).
- The AI **only judges "whether it was explained clearly," not whether it is right or wrong**—this division of labor matters, otherwise students will try to guess what the AI wants to hear.
- By-product: these "one-sentence" entries are extremely high-quality diagnostic corpus that can be fed to the Feynman scoring module for gap localization.

**Cost**: Very low.

---

### ⑥ ⭐⭐ Metacognitive calibration—**use it as a design principle, not as a selling-point number**

**Mechanism in one sentence**: The biggest trap for middle-school students is not "not having learned," but **"thinking they have learned"**—their judgment of "whether I have learned it" decouples from actual performance, so they stop studying too early.

**Evidence (the numbers in this section describe a "deficiency," not a "proof of efficacy"—do not use them backwards)**

- [Fact] **Yang et al. (2022)** (*Review of Educational Research*): 115 studies / 15,889 people / 502 effects—under **no intervention**, the weighted average correlation between learners' self-judgment and actual performance is **only r = .178**, and **calibration is generally poor**. [DOI](https://doi.org/10.3102/00346543221094083)
  > ⚠️ **r = .178 describes the phenomenon that "students generally judge inaccurately," not that "your feature works." Never write it in the report as an effect number.**
- ⭐[Fact] **The only proven large-effect operation is "delayed self-assessment"**: Rhodes & Tauber (2011) (*Psychological Bulletin*)—when judgments are made **delayed**, **relative** accuracy is **g = 0.93** (112 effects / 4,554 people); but **absolute** accuracy is only **g = 0.08** (98 effects / 3,807 people). [DOI](https://doi.org/10.1037/a0021705)
  > In plain language: **"self-assess after a while" lets students distinguish "which things I really know and which I do not" (very effective), but it barely fixes "overall blind optimism" (basically ineffective).**
- [Fact] Dunlosky et al. (2013) list "the accuracy of judgments of learning" as key to learner self-regulation; Fan et al. (2024), "Beware of **Metacognitive Laziness**," found that generative AI leads students to "outsource" their thinking. [BJET](https://doi.org/10.1111/bjet.13544)

**How to do it concretely in Gezhi** (already adjusted according to the evidence)

- Keep **pre-explanation self-assessment** (slider 1–5), but position it as **diagnosis**—used to catch students who "think they understand," **not as a selling point for efficacy**.
- **Give a Feynman score after the explanation**, display the two numbers **side by side**, and the difference = "calibration bias."
- ⭐ **The truly effective action is "delayed self-assessment"**: self-assess again **the next day / at the next review** (that is, when FSRS schedules it back), **immediately followed by a question**. At that point the student has a chance to correct the judgment based on "whether the retrieval just now went smoothly"—this is exactly how the g = 0.93 operation from the literature is implemented.
- Over the long term, turn it into a curve: **relative calibration** (the ability to distinguish strengths and weaknesses) will improve; **absolute optimism** basically will not—**stating this honestly in the report is far better than exaggerating**.

**Why it is still worth doing**: almost **no one** on the market turns "self-assessment accuracy" into a quantifiable, visualizable metric. It maps to the rubric's "Problem and Educational Value" (20%)—**you are pointing out a real educational problem backed by empirical evidence of r = .178**, which is itself a strong argument.

**Cost**: Low (one slider + one comparison chart).

---

### ⑦ ⭐ Generative drawing—let students draw a knowledge graph, and the AI compares it (do it if time permits)

**Mechanism in one sentence**: **Drawing it out** is remembered better than **reading it in**.

**Evidence**: [Fact] Fiorella & Mayer's generative learning framework lists "drawing, mapping, self-explaining, self-testing, and teaching" among the eight generative strategies.

**How to do it concretely in Gezhi**: Draw a relationship graph of 3–5 nodes by dragging and dropping; the AI compares it against the textbook's standard graph and points out "**which edge is missing**" (rather than giving a score)—**the feedback "which edge is missing" is far more useful than a score.**

**Cost**: Medium. **Basically impossible to finish within 8 days; recommend putting it into Future Work.**

---

## 3. String the learning methods into one lesson (key: do not turn it into a feature list)

What judges look at is "**a complete learning loop**," not "a feature list."

| Stage | Learning method | What the student does | What the AI does |
| --- | --- | --- | --- |
| 0 Trigger | **Active push** (②) | Opens the app and sees "the junior student forgot again" | Triggers according to FSRS + Feynman score scheduling |
| 1 Pre-study | **Pretesting effect** (④) | Does 1 question first; allowed not to answer | **Only records, does not explain** |
| 2 Self-assessment | **Metacognitive calibration** (⑥) | Drags the slider: "how well do I understand" | Archives it |
| 3 Explanation | Feynman + self-explanation (⑤) | Explains to the "junior student" | **Does not interrupt**, only gives facial feedback |
| 4 Challenge | Socratic + **teachable agent** (①) | Is challenged by the junior student's misconception and must persuade him | Throws out preset misconceptions |
| 5 Diagnosis | Feynman scoring | Receives a gap list | Gives a six-dimensional rubric against the textbook original text |
| 6 Consolidation | **Practice testing** | Only does "gap questions" | Generates targeted questions from the question bank |
| 7 Review | Distributed practice | Reviews according to FSRS due dates | Schedules |
| 8 Check | **Interleaved practice** (③) | Takes a short interleaved paper | Paper generation + export to LaTeX PDF |
| 9 Calibration | **Metacognitive calibration** (⑥) | Compares "predicted score vs. actual score" | Draws the calibration curve |

> **One-sentence summary of the product proposition**: **Expose ignorance first → produce an explanation → be challenged → revise → spaced repetition → interleaved check → calibrate self-awareness.**
> The English can go straight onto the poster: *Expose the gap. Explain it. Defend it. Master it.*

---

## 4. The other half of the competition theme: AI literacy (you have so far answered only half)

[Fact] The competition theme in its own words: "AI and Education: AI Transforming the Educational Paradigm **and Enhancing AI Literacy**"—**"enhancing AI literacy" is the other half of the theme**, while all your current designs address the first half.

[Fact] UNESCO's "AI competency framework for students" (2024) proposes **4 dimensions × 3 levels**:
- 4 dimensions: human-centred mindset / **AI ethics** / AI technologies and applications / **AI system design**
- 3 levels: understand → apply → **create**
- [UNESCO official page](https://www.unesco.org/en/articles/ai-competency-framework-students) · [full English PDF](https://unesdoc.unesco.org/ark:/48223/pf0000391105_eng)

> 🎯 **Your "students teach the AI, install misconceptions in the AI, and correct the AI" falls exactly in the "create" level of the "AI system design" dimension—the highest level in the UNESCO framework.**
> The competition is hosted by **United Nations University (UNU)**; using UNESCO's own framework to position your work is **the most cost-effective alignment**: add 150 words of mapping in the report, at almost zero cost, and judges will immediately see where you stand.

**Suggested small additional feature to solidify this: "Error-catching mode."**
The AI deliberately gives an explanation **containing errors** (the errors come from your misconception library), and the student must point out where the error is. This trains both (a) subject knowledge and (b) critical use of AI.

**One-sentence defense**: "We do not just teach students how to use AI; we let students **create the AI's errors**—knowing where AI will make mistakes is what real AI literacy means."

---

## 5. Competitive landscape: what has already been done to death, and what is still a blank

**Purpose of this section**: The rubric's exact wording for "Creativity and Originality 20%" is "**ability to explain the difference from existing solutions**." Only after seeing others' cards clearly can you articulate your own difference.

### Already done to death (these are the price of entry, not differentiation)

| Approach | Current state |
| --- | --- |
| Spaced repetition + automatically tuned algorithms | [Fact] Since FSRS became open source, it has become standard: on a benchmark of about 10,000 Anki collections and 350 million reviews, FSRS-6 beats the old SM-2 for **99.6% of users**. [benchmark](https://expertium.github.io/Benchmark.html) |
| Knowledge graph + adaptive question recommendation | Almost all "adaptive intelligence" products look the same |
| Socratic AI tutor | Everyone has been doing it since Khanmigo, and its RCT effect is only 0.06–0.14 SD |
| One-click conversion of materials into flashcards / quizzes / podcasts | NotebookLM has standardized the action; **the learning-method increment is very low** |
| Text → audio → slide multimodal conversion | Google Learn Your Way (2025) has already done it |

### Still blank (positions you can occupy)

| Blank | Why it is a good opportunity |
| --- | --- |
| **① Role reversal: students teach AI, and AI exposes its own misconceptions** | [Fact] There are only paper prototypes, **almost no consumer-grade products**; and it happens to be the intersection of two high-evidence principles: learning-by-teaching and self-explanation. The sticking point is "reliable misconception simulation + automatic scoring"—**and that is exactly what LLMs are good at** |
| **② Deliberately designed pretesting / fail first, then explain** | Basically nowhere to be seen in public products, and implementation cost is almost zero |
| **③ Proactive, evidence-driven push** | The most valuable finding of the Khanmigo RCT is not 0.14 SD, but **"students will not seek help proactively."** Treat "when to push help in front of the student" as a learning-method problem, not a notification problem |
| **④ Evaluation approach** | [Inference] Very few products are willing to publish "learning outcomes rather than engagement" data. **If Gezhi can report "Feynman score improvement" rather than "usage time" in a small-scale real test, this will stand out sharply to reviewers** (directly corresponding to the rubric's "Prototype, Testing, and Effectiveness 20%") |

---

## 6. Do not do these (evidence shows they are ineffective or harmful)

| Do not do | Why |
| --- | --- |
| **AI explains answers directly** | [Fact] Bastani 2024: exam scores 17% lower |
| **Hide help in some tab** | [Fact] Khanmigo RCT: students sought help in only 17% of wrong-answer sessions |
| **Match teaching to "learning styles" (visual/auditory)** | [Fact] Pashler et al.'s (2008) classic review concluded: **there is no evidence that teaching matched to learning styles improves learning**. The most stubborn myth in education |
| **Reread notes / highlight / summarize** | [Fact] Dunlosky 2013 classifies them as **low utility**. Students "feel like they are studying," with the lowest return |
| **Rely only on points, badges, leaderboards** | [Inference] External rewards may undermine intrinsic motivation. **Better to make "shrinking the calibration bias" itself an achievement** |
| **"Finished the questions" = "mastered"** | This is exactly the problem metacognitive calibration is meant to solve |
| **AI instantly understands the student's explanation every time** | It degenerates the whole process into "talking to a recorder"—**this is the design flaw judges are most likely to spot on the spot** |

---

## 7. How to talk about originality (be sure to read this to avoid a defense disaster)

⚠️ **Saying at the defense that "students teaching AI is our world first" is very risky.**

[Fact] "Students teach AI / teachable agents" had classic research as early as 2009, and **2024–2026 is an especially active period**: CHI 2025 "Playing Dumb to Get Smart," COLM 2025 "Learning by Teaching," the bug-model teachable agent at JSAI 2025, and even a 2025 Nature Scientific Reports study on middle-school students' engagement with AI teachable agents.
If there is even one person with an AI-education background among the judges, they can stump you with one sentence. **And the review form asks for "difference," not "world first."**

**Suggested wording (accurate, credible, and more moving)**:

> "The teachable agent is a mechanism that has long been studied in educational technology, traceable at least to Chase et al.'s 2009 protégé effect research. **We do not claim to have invented this concept.**
> Our originality lies in four points:
> ① These studies overwhelmingly remain at the **paper prototype or university classroom** level; we have turned the teachable agent into **a Chinese desktop product usable by middle-school students**;
> ② What the student teaches is not generic questions, but **knowledge points in his own textbook**—we bring in the textbook original text through a local knowledge base, so the AI's challenges have sources and can be traced back to page numbers;
> ③ We **quantify the process of "persuading the junior student" into a Feynman score**, then feed it into spaced-repetition scheduling to form a closed loop, rather than a one-off chat;
> ④ The knowledge base and learning records **all stay on the local machine**; AI calls use the user's own account, and the student's question content is not retained a second time."

These four points are all capabilities that **actually exist** in your architecture (see `docs/01-intelligence-layer-dsh-as-agent-core.md`); they can be stated and demonstrated, and are far more solid than "world first."

---

## 8. ⚠️ Four numbers you must never cite (academic-integrity red line)

The competition rules have explicit requirements on **false data** and academic integrity, and judges may also ask at the defense where a number comes from. The following four are the most widely circulated online but **problematic upon verification**—**getting one wrong hurts far more than not writing numbers**.

| ❌ Do not write | The truth |
| --- | --- |
| "Interleaved practice can improve by **60%**" | [Fact] This number **does not appear in any original literature**. The verifiable secondary summary is Rohrer & Taylor (2007): **the interleaved group was 29% lower in the practice phase and 43% higher on the test one week later**. Moreover, these percentages **cannot be mixed with Rohrer 2014's d values**—the two papers are not the same thing |
| "Productive failure effect size **g = 0.87**" | [Fact] This is a **publication-bias-corrected estimate**, not a measured effect. **You should cite g = 0.36 (95% CI 0.20–0.51)**, and 0.37–0.58 under high-fidelity implementation |
| "Self-explanation effect size **0.55**" (used in mathematics scenarios) | [Fact] 0.55 is the cross-disciplinary overall value, and it was **cited via a database; the original was not read directly**; **the mathematics-specific meta-analysis is only 0.27**. For a science-oriented product, **please cite 0.27** |
| "Metacognitive calibration can improve grades" | [Fact] r = .178 describes the **deficiency that "students judge inaccurately,"** not a feature effect. Delayed self-assessment improves **relative** accuracy (g = 0.93) but is almost ineffective for **absolute** accuracy (g = 0.08) |

> **General principle**: **Every number in the report must be traceable to "which paper, what population, what outcome was measured."**
> If you cannot say it, write a qualitative conclusion (e.g., "multiple studies show interleaving is effective in mathematics") and **do not put the number in**. If a judge asks "where does this number come from" and you cannot answer, the loss is far greater than the benefit of adding one more number.

---

## 9. References (ready to copy directly into the Research Report)

**✅ = link or content actually opened and verified this session; the rest are standard literature in the field—please open and confirm the year and page numbers before submission.**

1. ✅ Bastani, H., Bastani, O., Sungu, A., Ge, H., Kabakcı, Ö., & Mariman, R. (2024). *Generative AI Can Harm Learning.* SSRN Working Paper. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4895486
   (Popular version: [Hechinger Report, 2024-09](https://hechingerreport.org/kids-chatgpt-worse-on-tests/))
2. ✅ Oreopoulos, P., & Low, N. (2026). *One Click Away: AI Tutoring with Khanmigo in a Two-Year School Experiment.* NBER Working Paper 35620. https://doi.org/10.3386/w35620
3. ✅ Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). Improving Students' Learning With Effective Learning Techniques. *Psychological Science in the Public Interest, 14*(1), 4–58. https://doi.org/10.1177/1529100612453266
4. ✅ Chase, C. C., Chin, D. B., Oppezzo, M., & Schwartz, D. L. (2009). Teachable Agents and the Protégé Effect: Increasing the Effort Towards Learning. *Journal of Science Education and Technology, 18*(4). https://purl.stanford.edu/zm369yx3532
5. ✅ Yang, X., Pujara, H., & Li, J. (2025). *Learning by Teaching: Engaging Students as Instructors of Large Language Models in Computer Science Education.* COLM 2025. https://arxiv.org/abs/2508.05979
6. ✅ Rogers, et al. (2025). *Playing Dumb to Get Smart: Creating and Evaluating an LLM-based Teachable Agent within University Computer Science Classes.* CHI 2025. https://doi.org/10.1145/3706598.3713644
7. ✅ *Learning by Teaching with ChatGPT: The Effect of Teachable ChatGPT Agent on Programming Education.* arXiv:2412.15226. https://arxiv.org/abs/2412.15226
8. ✅ Richland, L. E., Kornell, N., & Kao, L. S. (2009). The Pretesting Effect: Do Unsuccessful Retrieval Attempts Enhance Learning? *Journal of Experimental Psychology: Applied.* http://learninglab.uchicago.edu/Pre-Testing_files/RichlandKornellKao.pdf
9. ✅ Brunmair, M., & Richter, T. (2019). Similarity Matters: A Meta-Analysis of Interleaved Learning and Its Moderators. *Psychological Bulletin.* https://doi.org/10.1037/bul0000209
10. ✅ Fan, Y., Tang, L., et al. (2024). Beware of Metacognitive Laziness: Effects of Generative Artificial Intelligence on Learning Motivation, Processes, and Performance. *British Journal of Educational Technology.* https://doi.org/10.1111/bjet.13544
11. ✅ UNESCO (2024). *AI Competency Framework for Students* (Miao, F., Shiohira, K., & Lao, N.). https://unesdoc.unesco.org/ark:/48223/pf0000391105_eng
12. ✅ Expertium. *SRS Benchmark* (large-scale comparison of FSRS and SM-2). https://expertium.github.io/Benchmark.html
13. ✅ Bisra, K., Liu, Q., Nesbit, J. C., Salimi, F., & Winne, P. H. (2018). Inducing Self-Explanation: A Meta-Analysis. *Educational Psychology Review, 30*(3). Overall weighted effect size **+0.55** (64 studies / 5,917 people). ([Abstract](http://www.beib.org.uk/category/self-explanation/))
14. ✅ Rohrer, D., Dedrick, R. F., & Stershic, S. (2014). Interleaved Practice Improves Mathematics Learning. *Journal of Educational Psychology.* 126 seventh graders, 3 months; immediate **d = 0.42**, delayed 30 days **d = 0.79**. https://doi.org/10.1037/edu0000001
15. ✅ Rittle-Johnson, B., Loehr, A. M., & Durkin, K. (2017). Promoting Self-Explanation to Improve Mathematics Learning: A Meta-Analysis. *ZDM.* 26 studies, **ES = 0.27**. https://doi.org/10.1007/s11858-017-0834-z
16. ✅ Yang et al. (2022). Meta-analysis on the accuracy of judgments of learning (JOL). *Review of Educational Research.* 115 studies / 15,889 people / 502 effects, **r = .178**. https://doi.org/10.3102/00346543221094083
    (First author's surname and year verified; for the full author list, copy from the DOI page)
17. ✅ Rhodes, M. G., & Tauber, S. K. (2011). The Influence of Delaying Judgments of Learning on Metacognitive Accuracy: A Meta-Analytic Review. *Psychological Bulletin.* Delayed JOL: relative accuracy **g = 0.93**, absolute accuracy **g = 0.08**. https://doi.org/10.1037/a0021705
18. ✅ Sinha, T., & Kapur, M. (2021). When Problem Solving Followed by Instruction Works: Evidence for Productive Failure. *Review of Educational Research.* 53 studies / 166 comparisons, **g = 0.36** (95% CI 0.20–0.51). https://doi.org/10.3102/00346543211019105
19. ✅ Pan, S. C., & Carpenter, S. K. (2023). Prequestions and Pretesting (a review of boundary conditions of the pretesting effect). *Educational Psychology Review.* https://doi.org/10.1007/s10648-023-09814-5
20. ✅ St. Hilaire, K. J., Chan, J. C. K., & Ahn, D. (2024). Guessing as a Learning Intervention: A Meta-Analytic Review of the Prequestion Effect. *Psychonomic Bulletin & Review, 31*, 411–441. (This session **could not read its pooled effect size**; do not cite specific numbers in the report) https://doi.org/10.3758/s13423-023-02353-8
21. Rohrer, D., & Taylor, K. (2007). The Shuffling of Mathematics Problems Improves Learning. *Instructional Science, 35*(6), 481–498.
22. Pashler, H., McDaniel, M., Rohrer, D., & Bjork, R. (2008). Learning Styles: Concepts and Evidence. *Psychological Science in the Public Interest, 9*(3).
23. Fiorella, L., & Mayer, R. E. (2016). Eight Ways to Promote Generative Learning. *Educational Psychology Review, 28*(4).

---

## 10. 8-day implementation plan (realistic version)

⏰ Set direction on 10-01 → **submit on 10-09**. The following is ordered by "what can be finished":

| Day | What to do | Who does it |
| --- | --- | --- |
| 10-01～10-02 | **20–30 misconception entries + junior-student persona prompt** (①)—**highest differentiation priority** | 1 person writes the library, 1 person revises the prompt |
| 10-02 | **Interleaved paper-generation switch** (③, half a day, enabled only for mathematics/physics)—**strongest evidence; do this first** | 1 person |
| 10-03 | One "why" sentence per question (⑤) + pre-explanation pretest and **mandatory feedback after explanation** (④) + self-assessment slider (⑥)—all small changes | 1 person |
| 10-04 | **Find 3–5 classmates to try it**, and record: changes in Feynman scores, calibration bias, how many turns it took to persuade the junior student | **All three together** (corresponds to the rubric's 20% "Testing and Effectiveness") |
| 10-05～10-08 | Write the report (put the comparison table from Section Zero into the Introduction), poster, video, PPT | Divide the work |
| Write into the report | ② active push, ⑦ drawing, productive failure → **"Future Work"** | — |

> ⚠️ **Do not launch everything at once.** The defense is only a few minutes, and all three of you must be able to explain it clearly.
> **Two main focuses with clear division**: **③ interleaved practice = strongest evidence** (the only one with a middle-school mathematics classroom experiment, d = 0.79); **① the fallible junior student = strongest differentiation** (almost no consumer-grade products). The rest can be mentioned briefly as "we also made these small improvements."
> **Saying more is not the same as saying it well; being able to demonstrate one complete loop on the spot is what counts.**

---

## Appendix: Directions not explored in depth this time

| Direction | One sentence | Why not recommended |
| --- | --- | --- |
| Productive failure (Kapur) | First let students try and fail on their own, then give formal instruction | The evidence is actually solid (Sinha & Kapur 2021: 53 studies / 166 comparisons, **g = 0.36**, 95% CI 0.20–0.51), but **the full process is required** (explore → explain → compare); giving only hard problems degenerates into frustration; and **for grades 2–5 and "domain-general skills," direct instruction should come first instead**. Cannot finish in 8 days; **put it into Future Work** |
| Dual coding / imagery mnemonics | Remember via text paired with images | Dunlosky classifies it as **low utility** (the "text imagery" tier) |
| Peer teaching / group work | Students teach each other | A single-user desktop application; social features conflict with the "local-first, privacy" positioning |
| Generative semantics × spaced-repetition scheduling | Use card text to improve scheduling precision (the KAR3L line) | Requires training a model, far beyond the competition's scope |
