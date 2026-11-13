# Gezhi · Demonstration film requirements and production specification

> Basis: `competition-charter-summary-macau-secondary-2026.md` (compiled from the 6-page scanned charter, the only authoritative source currently on this machine)
> ⏰ Today is 2026-10-02; 7 days remain until the 10-09 submission deadline.

---

## 1. What the charter actually says (verbatim quotes)

| Source | Original text |
| --- | --- |
| §7 Submission materials | "**Demonstration Materials**: photos of the work and an English demonstration video of **no more than 5 minutes**; the video must have **clear English narration or English description**." |
| §7 Language rules | "All registration materials, work content, attachments, posters, **video subtitles**, presentation slides and defenses are **accepted in English only**." |
| §7 Format | "All text documents and posters are submitted as PDF, each file no larger than 50MB; **videos are uploaded in the format specified by the registration system or provided via a publicly accessible link**." |
| §7 Naming | `DemoVideo_ProjectName.mp4 (or a video link file)` |
| §10 Final | "If the work involves network services, teams must prepare **offline video, screenshots or a backup demonstration plan**, so that network or third-party platform failures do not affect the presentation." |
| §14 Supplementary provisions | Incomplete materials, late submission, **not using English**, **file cannot be opened**, off-topic, **not meeting specifications** → may **not be reviewed** |

---

## 2. Undisputed hard requirements (4)

| # | Requirement | Consequence |
| --- | --- | --- |
| 1 | **Duration ≤ 5 minutes** | "Does not meet specifications" → not reviewed |
| 2 | **English** — narration **or** English description; and the language rules explicitly cover "**video subtitles**" | "Not using English" → not reviewed |
| 3 | **Besides the video, "photos of the work" must also be submitted** | Incomplete materials → not accepted |
| 4 | Named `DemoVideo_Gezhi.mp4`, or submit a "video link file" | — |

> ⚠️ **Item 3 is the easiest to miss**: Demonstration Materials is "**photos of the work + video**", two things,
> not just the video.

---

## 3. ⚠️ 5 things the charter does **not** specify but the registration system may block you on

This is the most important section of this document. None of the following 5 items are written in the charter, and **they must be confirmed with the organizer**:

| # | Unspecified item | Why it needs asking |
| --- | --- | --- |
| 1 | **Video file size limit** | The charter phrase "no more than 50MB" grammatically modifies "**text documents and posters (PDF)**". **The video size limit is not specified** — but if the registration system enforces 50MB, a 1080p 5-minute video (about 300–500MB) will simply fail to upload |
| 2 | **Video container and codec** | Only a filename example `.mp4` is given; no codec requirement |
| 3 | **Resolution** | Not specified at all |
| 4 | **Number and format of work photos** | Only the words "photos of the work" are given |
| 5 | **Specific form of the public link** | "or provide a publicly accessible link" — is it entered in a form, or must a `.txt`/`.pdf` be submitted? |

### 📧 Suggested email to send today for clarification

Inquiry email: **info@mcs.mo** (charter §8). A reply within 7 days is enough time, but **the sooner the better**.

```
Subject: Inquiry on demonstration video specifications — 2026 Global Youth AI Future Innovation Competition (Macau Secondary School Region)

To the Macau Computer Society:

We are the [school name] team, and our work is titled Gezhi. Regarding the submission of demonstration materials under Article 7 of the charter, we would like to confirm the following points:

1. What is the file size limit for the demonstration video? Is it the same as for text documents (50MB)?
2. Is there a specified format for the video container and codec (for example MP4 / H.264)?
3. Is there a minimum resolution requirement for the video?
4. How many "photos of the work" are required, and in what format should they be submitted?
5. If the video is submitted via a public link, how should the link be provided? Is a separate file required?
6. **Must the software interface shown in the demonstration video and defense be in English?** The language rules in Article 7 of the charter
   cover "work content", and we would like to confirm whether this includes the software's operating interface itself.

Thank you for your time.

[Name]
[School name] · Team Gezhi
[Contact phone/email]
```

> 💡 If no reply arrives within a week, **follow the "safe specifications" in Section 4** — those parameters will pass under any
> common registration system.

---

## 4. Safe specifications (follow the strictest interpretation; accepted by any system)

| Item | Recommended value | Reason |
| --- | --- | --- |
| Container | **MP4** | The charter filename example is `.mp4`; best compatibility |
| Video codec | **H.264 (AVC)**, High Profile Level 4.0 | Most universal. **Do not use H.265/HEVC** (old players cannot open it) |
| Audio codec | **AAC**, 48 kHz, stereo, 192 kbps | Universal |
| Resolution | **1920 × 1080** (1080p) | Clear enough, and not too large |
| Frame rate | **30 fps** | 30fps is enough for screen recording; 60fps only doubles the file |
| Video bitrate | **8–12 Mbps** | About 300–450 MB for 5 minutes |
| **Duration** | **Target 4:30, hard limit 5:00** | Leave a 30-second buffer to avoid being judged overtime due to encoding differences |
| Narration | **English**, write the script first and then record | See "How to write the narration" below |
| Subtitles | **English hard subtitles (burned into the picture)** | The charter language rules cover "video subtitles". Hard subtitles = understandable even when muted, double insurance |
| Safe area | No key information in the **bottom 10%** of the frame | The player progress bar will cover it |
| File size | Produce a 300–450 MB master first; if the system limits to 50MB, compress to 45 MB as backup | Prepare both options |

### How to write the narration

- **Write a verbatim script first, then read it**. Do not improvise — English must be clear within 5 minutes, and improvisation will inevitably trip you up.
- Target speaking rate **130–150 words per minute**, about **650–750 words** for 5 minutes.
- All three students must speak (charter §10: "**all three students should participate in the demonstration or defense**"); it is recommended to divide by paragraph.

---

## 5. Upload method: how to provide the link

| Approach | Description |
| --- | --- |
| ⭐ **Recommended: set YouTube to "Unlisted"** | Only people with the link can view it. **Never set it to Private** — judges cannot open it, directly triggering "file cannot be opened" |
| Alternative: Bilibili | May be inconvenient for Macau/international judges; **not as good as YouTube** |
| **Be sure to self-test** | Open it once each in an **incognito window**, **logged out**, and **on a different device** |
| Recommended to also prepare | An MP4 file under 200MB as a fallback, in case the system actually allows direct upload |

---

## 6. Storyboard script (total 4 minutes 30 seconds)

> Core principle: **this is a film that "proves the work runs", not a product promo.** In the review rubric it mainly earns
> "Prototype, Testing and Effectiveness 20%" and "English Expression and Presentation 10%".

| Time | Picture | Key English narration points | Why this order |
| --- | --- | --- | --- |
| **0:00–0:20** | Two charts of experimental data (Bastani's −17%, Khanmigo's 17% help-seeking rate) | AI tutors either harm learning or go unused | 20 seconds to establish the problem, so judges immediately know you are solving a real problem |
| **0:20–0:40** | One-sentence positioning + quick sweep of the five interface panels | Students explain. An AI classmate argues back. | Give the conclusion first, then the evidence |
| **0:40–1:10** | **Pre-test**: a student attempts a question, clicks "I don't know"; then drags the self-assessment slider | He tries first, and commits to how well he thinks he understands | Shows steps 1–2 of the loop |
| **1:10–2:30** ⭐ | **Explanation and defense (core 80 seconds)**: the student explains aloud → the junior student shakes his head "but I think X is also right" → the student explains again → **a cinnabar-red cell lights up above the junior student's head** | ...the companion holds a misconception and refuses to agree until the explanation actually addresses it — then one cell lights up | **This is the highlight of the whole film and your differentiation itself. Give it a full 80 seconds** |
| **2:30–3:00** | **Scoring and gaps**: six-dimensional rubric → questions targeting only the gaps | A six-dimension rubric, scored against his own textbook | Proves AI has substantive effect (the 25% "AI technology use" in the rubric) |
| **3:00–3:25** | **Interleaved paper generation**: mixed question types, no topic labels → export a LaTeX exam PDF | ...an interleaved paper that deliberately does not label the topic | The feature with the strongest evidence (d = 0.79), deserves its own segment |
| **3:25–4:00** | Technical highlights: local knowledge base, retrieved textbook passages and page numbers | All retrieval runs locally; every challenge cites a page of his own textbook | Responds to "will the AI make things up" and privacy concerns (Ethics 5%) |
| **4:00–4:20** | **Real trial evidence**: footage of classmates trying it + Feynman score change numbers | We tested it with N students at our school | The rubric's "Testing and Effectiveness 20%" **must have this segment** |
| **4:20–4:30** | Ending: logo + SDG 4 + one sentence on UNESCO framework alignment | Gezhi. Expose the gap. Explain it. Defend it. Master it. | Closing |

### Three things that must appear

1. **Real mouse clicks and keyboard input** — proves it is an operable prototype, not a PPT animation
2. **The second when the junior student argues back** — the only irreplaceable shot in the whole film
3. **One concrete number** (Feynman score change / calibration deviation / how many rounds it took to persuade)

---

## 7. ⚠️ Must the software interface be in English?

This is the most frequently asked question, and also the **precondition for whether the film can be shot at all**. The conclusion first:

> **Not a single sentence in the charter says "the software interface must be in English". But prepare as if it does — because the risk is asymmetric.**

### 7.1 The charter's wording and ambiguity

The §7 language rule list is: **registration materials, work content, attachments, posters, video subtitles, presentation slides, defense**.

**Only the four characters "work content" are ambiguous**:

| Interpretation | Meaning | Must the interface be in English? |
| --- | --- | --- |
| **Narrow** | Refers to **the content in the submitted materials** (the text written in the PDF) | No |
| **Broad** | Refers to **the content of the work itself**, i.e. the software's features and interface | Yes |

The charter **does not** require the software interface to be in English. But §14 lists "**not using English**" as a circumstance under which a submission may **not be reviewed**, and "work content" is broad enough that a strict interpretation could apply it to the interface.

**Risk asymmetry**: changing the demo path to English costs "1 day"; being judged "not using English" costs "**not reviewed, and the charter explicitly states there is no review or appeal procedure**".

### 7.2 But the real killer is not compliance, it is the live demonstration

Charter §10 states in black and white:

> "The jury may require **on-the-spot operation**, explanation of the program or model, clarification of data sources, and answers to questions about the originality of the work."

And §3 states that the review committee consists of scholars and experts in **education, artificial intelligence, information technology, and sustainable development**; the organizers include the **United Nations University Institute in Macau** and the **UNU Global AI Network**. [Inference] It is very likely that some judges are international experts who do not understand Chinese.

**With a Chinese-interface app, you cannot demonstrate it to them at the defense.** This is harder than any clause — it does not depend on how the rules are interpreted, but on who is sitting across from you.

### 7.3 Good news: **not everything needs translating**

I counted your source code (`apps/desktop/`):

| Item | Count |
| --- | --- |
| Total Chinese in renderer (UI layer) | 31,319 characters |
| Of which **code comments** | 19,993 characters → **no translation needed at all** |
| Of which **UI copy** | **11,326 characters**, spread across 727 lines in 34 files |

11,326 Chinese characters ≈ **1,000–1,400 UI strings**. Full i18n is 3–5 days of work — **doing it within 7 days would squeeze out the report and the film, and risks breaking a working prototype**.

**So: do not translate everything, only the "demo path".**

### 7.4 Recommended approach: add an English toggle covering only the demo path

Prioritize these 6 files (the film and defense only reach these interfaces):

| File | Why prioritize |
| --- | --- |
| `App.tsx` | Shell: menus, tabs, status bar — **appears in every shot** |
| `FeynmanPanel.tsx` | Feynman explanation console — **the highlight of the whole film is here** |
| `AvatarConsole.tsx` + `AvatarPanel.tsx` | The junior student and status display |
| `BankView.tsx` | Question bank and interleaved paper generation |
| `LearningStudio.tsx` + `ExportMenu.tsx` | Export exam papers |

Estimated **1 day** (AI-assisted translation + manual proofreading); risk is controllable.

### 7.5 Three design principles

1. **Keep Chinese as the default.** Your users are Macau secondary students, and a Chinese interface is correct to begin with — **do not change the product to English for the competition**. Adding a language toggle is enough.
2. **The toggle state must persist** (stored in `.gezhi/app.json`), so that opening it at the defense shows English without having to find the toggle on the spot.
3. **Bilingualism itself is a selling point**: the poster can say "Bilingual Chinese-English interface — the materials Macau students use are already a mix of Chinese and English". This is far more dignified than "for compliance".

### 7.6 Fallback (if even 1 day cannot be spared)

Add **English annotation boxes** over the Chinese interface in the **film** and **defense PPT**, and switch to **English interface screenshots** in the report. It is weak, but far better than doing nothing.

### 7.7 📧 This question should also be asked of the organizer

It has been added to the inquiry email in Section 3 (Question 6). **Until they reply, prepare as if the answer is "yes".**

---

## 8. Shooting and production points

| Item | Approach |
| --- | --- |
| Screen recording tool | **OBS Studio** (free). Set 1080p / 30fps / hardware encoding |
| Recording resolution | Same as output; **do not record 4K and then downscale** (large file, no benefit) |
| ⚠️ **Interface language** | **The app interface appearing in the film must be in English**. See Section **7** for details — within 7 days you do not need full translation, only an English toggle for the "demo path" |
| ⚠️ **Privacy** | Charter §12/§13: **do not upload personal data or personally identifiable images without permission**. Obtain consent from students who appear; before filming consider **blurring names, filming only hands and screen, or filming only from behind** |
| Audio | Use an external mic (even a phone headset is better than the laptop's built-in mic). **Record narration separately in a quiet room**; do not record it simultaneously with the screen capture |
| Editing | CapCut Pro / DaVinci Resolve (free) |
| Subtitles | Burn in **hard subtitles** (do not submit a separate .srt; the charter does not require it, and an extra file is an extra risk point) |

---

## 9. The 7 easiest ways to lose points

| # | Point-losing issue | Consequence |
| --- | --- | --- |
| 1 | **Exceeding 5 minutes** | Does not meet specifications → not reviewed |
| 2 | **No English narration or English subtitles** | Not using English → not reviewed |
| 3 | **The app interface is in Chinese** | Same as above, and very conspicuous |
| 4 | **Only explanation, no demonstration** | Charter §6: "The work must include **actually functioning AI features**; concepts and slides alone are not acceptable" |
| 5 | **YouTube link set to Private** | File cannot be opened → not reviewed |
| 6 | **Real names/faces of classmates appear in the film without consent** | Violates §12/§13 privacy clauses |
| 7 | **Forgot to separately submit "photos of the work"** | Incomplete materials → not accepted |

---

## 10. 7-day countdown

| Day | What to do |
| --- | --- |
| **10-02 (today)** | **Email info@mcs.mo with questions**; finalize the storyboard; **start building the English interface for the demo path** (the 6 files in Section 7.4) |
| 10-03 | **Complete the English interface and self-test**; write the verbatim English narration script (650–750 words), divided among the three students |
| 10-04 | **Screen-record** according to the storyboard — ⚠️ **the interface must already be in English at this point**; record several takes per segment |
| 10-05 | Record narration; organize trial evidence numbers (Feynman score change / number of persuasion rounds) |
| 10-06 | Edit + burn in English subtitles; export the master |
| 10-07 | Upload to YouTube (**Unlisted**) + **incognito-window self-test**; shoot work photos |
| 10-08 | Final check of the full set of materials (see `..\submission-checklist.md`) |
| 10-09 | Submit in the morning |

> ⚠️ **Do not wait for the organizer's reply before starting.** Screen recording depends on the English interface, and the reply timing is uncontrollable.
> If the reply says the interface need not be English, the 10-02 to 10-03 interface work is wasted — **but if you bet the other way and are wrong, there is no time to remedy it**.
> **English interface = English-izing the demo path, not full translation** (see Section 7.4, doable in 1 day).
