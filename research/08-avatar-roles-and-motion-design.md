# Gezhi · Digital Avatar Roles and Motion Design (v1)

> **This document does not overturn `research\05-avatars-and-feynman-scoring-research.md` §4**—the **8-state machine, the `AvatarRenderer` interface, "don't use GIF's 1-bit transparency", "expressions lag behind content", and "encouraging ≥ 2× confused"** in that research all remain valid.
> This document only does the three things it didn't do: **① change the persona from "AI teacher" to "junior classmate"; ② provide ready-to-run AI generation prompts; ③ give the motion breakdown for 8+1 states and a production route that can be finished in 8 days.**

---

## 0. Three decisions first; everything else follows from them

| # | Decision | One-line reason |
| --- | --- | --- |
| **1** | The role is the **"junior classmate" (学弟), not the "teacher"** | A teacher = judge, and students dare not speak; a junior classmate = someone being helped, so **the student becomes the one who possesses the knowledge** |
| **2** | The role is **not a real person**; it is a geometric / animal figure | Reduces the "feeling of being scrutinized" + doable in 8 days + zero copyright risk |
| **3** | In the app, **do not do frame-by-frame animation**; use "parts + procedural composition" | 8 states frame by frame ≈ 240 images; parts ≈ 28 images, **an 8× workload difference** |

> Point 1 is the foundation. Get it wrong and every later detail goes wrong too—so the next section makes it completely clear.

---

## 1. Why it must be the "junior classmate"—this is the foundation of the entire avatar design

### 1. Evidence chain

| Evidence | Conclusion |
| --- | --- |
| [Fact] Bastani et al. (2024): the group where AI directly gave answers scored **17% lower** on the exam | The student must not be the "receiver" |
| [Fact] Khanmigo RCT (NBER w35620): students proactively asked for help in only **17%** of the sessions where they got a question wrong | The problem is not AI capability, but **whether students are willing to speak up** |
| [Fact] arXiv 2412.15226: when ChatGPT acted as a "teachable agent", students' **error-correction ability did not improve**—because it was too accurate, students had no chance to debug | The object must **genuinely not know** for this to work |
| [Fact] Cassell (2022) "Socially Interactive Agents as Peers" and Ryokai–Vaucelle–Cassell's virtual peer research: **virtual characters appearing as "peers"** can improve children's narrative and language learning performance | "Peer" is not cutesiness; it is a role positioning backed by research |

### 2. Psychological mechanism: authority reversal

- **When the object is an "AI teacher"**: the student is in the **position of being evaluated**. In that position people speak less, say safer things, and guess the "standard answer". But the Feynman method requires them to speak **a lot, in fragments, and truthfully**—the two things directly conflict.
- **When the object is a "junior classmate a little weaker than you"**: the student becomes **the one who possesses knowledge**. They don't need to prove they're smart, only to make the other side understand. **The length, detail, and self-correction of the explanation all increase naturally.**

> So this is not "drawing the character a bit cuter"; it is **moving the student from the examinee's position to the expert's position**. This one sentence is the reason the whole avatar exists, and it is what you should say at the defense.

### 3. This decision directly determines four details

| Detail | Why |
| --- | --- |
| **The character must never wear a white lab coat, glasses, or hold a pointer / chalk** | Any "teacher symbol" pushes the student back into the evaluated position |
| **The character must never have scoring expressions** (no judging actions other than "nod of approval / shake of disapproval") | Once it resembles an examiner, "practice partner" becomes "exam" |
| **There must be a "not convinced" state** (see §4) | The junior classmate must not understand as soon as you explain, otherwise the whole design degrades into a tape recorder |
| **The character must be able to "become dumb"**—the grid above its head can revert to blank | Make "it doesn't understand again" a visible, forgivable fact |

---

## 2. Character setting card

| Item | Setting |
| --- | --- |
| **Name** | **Xiao Ge** (tentative; "Ge" is taken directly from the brand name and also echoes the nine-grid above its head) |
| **Identity** | A junior classmate at Gezhi, one grade below the user, **not an AI, not a teaching assistant** |
| **Personality** | Curious, candid, a little clingy, **misremembers things**, but **never judges you** |
| **What it can't do** | It doesn't score, doesn't say "you're wrong", doesn't rush you, doesn't compare you with others |
| **Catchphrases** (for TTS) | "Oh—so that's how it is!" (epiphany) / "But... I think X is right too." (not convinced) / "Wait, I didn't understand the last sentence." (confused) / "It's okay, say it again, I'll listen carefully this time." (encouraging) / "I forgot again..." |

### ⭐ Core visual setting: **nine little squares above its head**

| Grid state | Meaning |
| --- | --- |
| All nine squares empty | The junior classmate currently **knows nothing**—the student sees their task at a glance |
| One square lit (vermilion red `#C8452F`) | **Understands a little** (one `aha`) |
| All lit | This knowledge point has been explained |
| All gray | The junior classmate is confused again (`skeptical` / `confused`) |

> 🎯 **This one item merges the brand's "one square solved", the product's progress feedback, and the character's emotional expression into a single visual element.**
> The student doesn't need to look at scores—**they only need to see how many squares are lit above the junior classmate's head.** This is the single most poster-worthy detail in the whole design.

📐 **Shape and state reference**: `research\sketches\xiaoge-states.svg` (open directly in a browser to see all five states—idle / listening / thinking / not convinced / epiphany—on one screen). That is a **geometric sketch, not final artwork**; its purpose is to give the artist and the AI prompts a shared reference.

### Why a geometric figure rather than an anime humanoid

1. **Reduces the sense of being scrutinized**: a real human face (even drawn) carries an implicit "judgment"; a geometric little creature does not.
2. **Doable in 8 days**: a humanoid has to handle hair, clothing folds, facial muscles; a geometric body is just rounded rectangles.
3. **Zero copyright risk**: an original geometric character can't accidentally look like an anime character; realistic illustrations easily "accidentally resemble someone".
4. **It won't be ugly**: your own research wrote—**for middle-school students, "ugly 3D / ugly illustrations" are more off-putting than "simple 2D"**. The geometric style has a very high floor.

---

## 3. AI generation prompts

> **First, be clear about what AI can and cannot do**: AI can give you **character design** (what it looks like, what expressions), but **cannot give you usable animation** (frame-to-frame consistency can't be guaranteed). So the correct usage is:
> **AI produces a design draft → manually trace it into vector parts → procedurally compose the animation.**
> Only use **Ideogram / Jimeng Seedream / GPT-image** when you want it to touch text; otherwise always `no text`.

---

### Route A (**recommended**): "Xiao Ge"—a geometric grid creature

**Concept**: a little creature built from rounded squares, using your logo's three colors "ink + vermilion + paper white", with a nine-grid floating above its head.

**English prompt**

```
Character design reference sheet for a friendly educational mascot: a small geometric
creature built entirely from rounded squares. Body is one soft rounded square in warm
off-white #F7F3EC with a thick ink-black #141414 outline. Two large round friendly eyes,
a simple curved smile, two short stubby arms and two short legs made of rounded
rectangles. Floating just above its head is a small three-by-three lattice of nine tiny
outlined squares, currently all empty.
Style: flat vector illustration, minimal, clean thick uniform outlines with rounded
corners, exactly three colours — ink black #141414, warm off-white #F7F3EC and one
vermilion red #C8452F accent — no shading, no gradient, no texture, no highlights.
Layout: one large front view in the centre; smaller front, three-quarter and side views
beside it; a row of six facial expressions along the bottom (neutral, listening,
thinking, confused, delighted, encouraging).
Plain white background, evenly spaced, generous margins.
No text, no labels, no letters, no numbers, no watermark, no shadow, no 3D render,
no anime style, no shading.
--ar 3:2 --style raw --v 7 --stylize 50
--no text, labels, letters, numbers, watermark, signature, gradient, shadow, 3d, realistic, photo, anime, complex detail, shading, robot, humanoid
```

**Prompt for Chinese models (Jimeng / Seedream)**

```
Character design three-view sheet: a cute educational mascot, a small creature built from
rounded squares. The body is a rounded square in warm white #F7F3EC with a thick ink-black
#141414 outline; two large round eyes, a simple curved smile; two short rounded-rectangle
arms and two short legs; floating above its head is a three-by-three grid—nine small
squares, currently all empty.
Style: flat vector illustration, minimal, uniform rounded line weights, only three colors
(ink black #141414, warm white #F7F3EC, a touch of vermilion red #C8452F as accent), no
shadow, no gradient, no highlight, no texture.
Layout: a large front view in the center, with small front / three-quarter / side views
beside it; a row of six expressions along the bottom (calm, listening, thinking, confused,
happy, encouraging). Pure white background, even spacing, generous margins.
No text, labels, letters, numbers, or watermark; no 3D, no realism, no Japanese anime, no
complex detail.
```

**Pitfalls**: ① without `no robot` it drifts toward a "tech robot", which turns back into an "AI teacher"; ② without `no shading` it will definitely add gradient highlights, which can't be used when cutting parts; ③ the nine-grid easily gets drawn as random squares; generate several extra variants.

---

### Route B (**safest**): "A Zhi"—a newly hatched baby bird

**Concept**: a little bird whose feathers haven't fully grown; "learning to fly" naturally equals "hasn't learned yet", so the junior-classmate feel comes for free.

**English prompt**

```
Character design reference sheet for a friendly educational mascot: a tiny baby bird that
has just hatched, with a few fluffy down feathers, oversized round eyes and a small stubby
beak; it looks a little clumsy and very eager. Style: flat vector illustration, minimal,
thick uniform ink-black #141414 outlines, exactly three colours — ink black, warm off-white
#F7F3EC and one vermilion red #C8452F accent — no shading, no gradient, no texture.
Layout: one large front view in the centre, smaller front / three-quarter / side views
beside it, and a row of six facial expressions along the bottom (neutral, listening,
thinking, confused, delighted, encouraging). Plain white background, generous margins.
No text, no labels, no letters, no numbers, no watermark, no shadow, no 3D, no realistic
feather detail, no anime style.
--ar 3:2 --style raw --v 7 --stylize 50
--no text, labels, letters, numbers, watermark, gradient, shadow, 3d, realistic, photo, anime, detailed feathers, nest, background scenery
```

**Pros**: exaggerated, readable expressions; easy to animate; "dumbness" is naturally non-offensive. **Cons**: animal mascots are too common; brand recognition is lower than Route A.

---

### Route C (best results, but **impossible in 8 days**): semi-realistic youth

Not recommended now. Reason: it requires frame-to-frame consistency of hair / clothing folds / facial muscles, and AI-generated multi-frame sequences will definitely flicker; also, a "classmate who looks real" reintroduces the feeling of being scrutinized. **Leave it to v2.**

---

### Section 3 supplement: two essential additional prompts

**① Expression sheet (produce 9 expressions in one pass, keeping the same character)**

```
Facial expression sheet for the same small geometric square mascot character: nine
identical head-and-shoulders busts arranged in a neat three-by-three grid, changing only
the face — 1 neutral calm, 2 listening attentively with wide eyes, 3 thinking with eyes
looking up and head tilted, 4 confused with one raised brow and squinting eyes, 5
sceptical with both brows raised and one eye narrowed, 6 delighted with eyes squeezed
into happy crescent shapes and a wide open smile, 7 encouraging with a gentle warm smile,
8 sleepy with eyes closed, 9 surprised with wide-open eyes and an open mouth.
Flat vector, thick uniform ink-black outlines, warm off-white body, no gradient, no
shading, plain white background, generous even spacing.
No text, no labels, no letters, no numbers.
--ar 1:1 --style raw --v 7
--no text, labels, letters, numbers, watermark, gradient, shadow, 3d, realistic, photo, anime
```

**② Mouth frames (5, directly plugged into your existing viseme scheme)**

```
Mouth shape chart for a flat vector mascot character: five identical mouth shapes in a
single horizontal row on a plain white background, drawn as simple rounded geometric
shapes with the same thick ink-black outline — 1 closed flat line, 2 slightly open small
oval, 3 half open rounded rectangle, 4 wide open large circle, 5 small rounded circle.
Minimal, uniform line weight, no teeth detail, no tongue detail, no gradient, no shading.
No text, no letters, no numbers, no labels.
--ar 5:1 --style raw --v 7
--no text, letters, numbers, labels, watermark, gradient, shadow, 3d, realistic
```

---

## 4. Motion table: 8 + 1 states and what each one does

**Asset specs**: canvas **400×400 transparent PNG** (displayed in-app at 200–280 CSS px, @2x); the character occupies **80%** of the canvas, with a 10% margin on all sides for jumping and head tilts. **Frame rate 12 fps** (loop states) / **15 fps** (one-shot actions).

| # | State ID | Type | Duration | Frames | **Motion breakdown (follow this)** | Trigger condition |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `idle` | Loop | 2.5 s | 30 | Breathing: whole body sine ±2 px vertically; blinking: once every 3–5 s, eyes closed for 2 frames; at the end of the loop a slight 3° head tilt then back | Default |
| 2 | `listening` | Loop | 2 s | 24 | Body leans forward 5°; head turns 8° toward the student; nods once every 1.5 s (4°); eyes 10% wider than idle | VAD detects the student speaking |
| 3 | `thinking` | Loop | 2.5 s | 30 | Head tilts 12°; eyes look up-right; **one square in the head grid blinks** (spinning feel) | LLM submitted, waiting for first token |
| 4 | `speaking` | Loop | — | 5 mouth frames | Mouth uses 5 visemes driven by TTS word-level timestamps; body bobs ±1 px per syllable | During TTS playback |
| 5 | `confused` | One-shot | 1.2 s | 15 | Head tilts 15°; **eyebrows one high one low**; eyes squint; all nine head squares turn gray; body sways left-right gently | Student's explanation is vague or unclear |
| 6 | ⭐ `skeptical` | One-shot | 1.5 s | 18 | **Eyebrows raise; one eye squints; shakes head twice (±6°); all nine head squares revert to blank** | Student has finished, but the junior classmate's misunderstanding **has not been cleared** |
| 7 | ⭐ `aha` | One-shot | 1.2 s | 15 | **Eyes instantly widen to 130%; bounces up 8 px; one square above the head lights up vermilion red `#C8452F`; both hands raised** | Misunderstanding cleared / Feynman score rises |
| 8 | `encouraging` | One-shot | 1.5 s | 18 | Gentle smile; slowly nods twice; one hand reaches forward ("it's okay"); **head grid stays as-is, no judgment** | After the student gets something wrong (**must precede `confused`**) |
| 9 | `offline` | **Static** | — | 1 | **No animation**: same image + CSS grayscale 60% + opacity 50% + eyes closed, with a small disconnected icon beside it | Network / service unavailable |

---

## 5. Why it is designed this way (reasons, item by item)

### ① "Not convinced" is the most important state in the whole design

If the junior classmate **understands as soon as you explain**, what the student is doing degenerates into "talking to a tape recorder"—they start going through the motions, skipping steps, saying "anyway, you get it".

[Fact] arXiv 2412.15226 has already demonstrated this experimentally: when ChatGPT acted as a teachable agent, because **it always directly gave the correct code, students had no chance to debug, and their error-correction ability did not improve**.

> **The very existence of the junior classmate's "not convinced" state is the product proposition.** It forces the student to face one question:
> *"I thought I explained it clearly, but he still doesn't understand—so which sentence was wrong?"*
> That question is exactly where the Feynman Technique actually does its work.

### ② `aha` must "light one square vermilion red"

- **Brand layer**: directly echoes the logo's "one square solved"—one of nine squares lights up.
- **Psychological layer**: [Fact] your own research already wrote—**when Δ > 0 the avatar must play a happy animation; this is the key to turning scoring into positive feedback**.
- **Product layer**: it gives the student a **progress bar that doesn't require looking at scores**. Nine squares filled = this knowledge point is explained.

### ③ `encouraging` must precede `confused`, and trigger at least 2× as often

This is already in your docs; here we only explain why it is the same thing as the "junior classmate" persona:
**When an answer is wrong, empathize first, then look for the problem together**—if you go straight to `confused` the moment an answer is wrong, the character becomes an examiner.
And the "junior classmate" persona naturally supports this: **if the junior classmate doesn't understand, it's the junior classmate's problem, not yours**, so the empathy is genuine, not comforting rhetoric.

### ④ `idle` must have micro-movements and must not be completely still

[Fact] your docs wrote: when the thinking state times out (>10 s), don't make the student **wait facing a frozen character**.
A completely still character is perceived as "stuck / crashed". So `idle`'s breathing + blinking + occasional head tilt is **not decoration; it is the signal "I'm still alive"**.

### ⑤ `offline` gets no animation—saves time and actually works better

Grayscale + closed eyes + disconnected icon already fully conveys "offline".
**Spend the 8 days' time on `skeptical` and `aha`, not on an error state nobody wants to see.**

### ⑥ Why not do frame-by-frame animation

See the next section—this is the watershed for whether it can be done in 8 days.

---

## 6. ⭐ Key engineering decision: don't draw frame by frame; use "parts + procedural composition"

### Workload comparison of the two approaches

| Approach | How many images to draw | 8-day feasibility |
| --- | --- | --- |
| Frame-by-frame animation (8 states × ~30 frames) | **≈ 240 images** | ❌ impossible |
| **Parts + procedural composition** | **≈ 28 images** | ✅ feasible |

### Parts list (layered in PSD / Aseprite, exported as separate transparent PNGs)

```
body.png                    body + head (whole, 1 image)
head.png                    head (independently rotatable → nod / head tilt, 1 image)
eyes/    open · half · closed · happy(crescent) · up · wide · squint        7 images
brows/   neutral · up · worried · one_raised                            4 images
mouth/   m0 closed · m1 slightly open · m2 half open · m3 wide open · m4 round                    5 images
grid/    empty · gray · blink · 1 lit … 9 lit                            12 images
```

### Composition logic (pseudocode)

```js
// Blink: timer swaps the eye parts
setInterval(() => swap(eyes, 'closed', 120), 3000 + Math.random() * 2000);

// Breathing: requestAnimationFrame sine
bodyOffsetY = Math.sin(t / 1200) * 2;

// Nod / head tilt: rotate only the head layer
head.rotate = state === 'listening' ? nod(t) : 0;

// Mouth: reuse your existing TTS word-level timestamp scheme (pinyin finals → 5 visemes)
mouth = visemeMap[phoneme.vowel];
```

> **This scheme fits your `AvatarRenderer` interface naturally**: `setState()` becomes "which layers to change" internally, `setMouthOpenY()` becomes "which mouth image to switch to", and **when you later switch to Live2D / VRM, not a single line of the interface needs to change**.

### Production workflow (8-day version)

| Day | What to do | Output |
| --- | --- | --- |
| D1 | Generate the character design with the §3 prompts, select a draft | 1 final design sheet |
| D2 | Generate the expression sheet + mouth frames | 9 expressions + 5 mouth references |
| D3 | **Manually trace into vectors** (Figma / Illustrator / Aseprite) | vector source file |
| D4 | Export parts | ≈ 28 PNGs |
| D5 | Front-end composition (blink / breathing / nod / mouth) | a character that moves |
| D6 | Hook up the 8-state machine + `AvatarRenderer` | all states switchable |
| D7 | Record 3 GIFs (see next section) | demo assets |
| D8 | Put into the demo video / poster / PPT | — |

> ⚠️ **D3 is a step that must be done by hand**: the images AI gives **have no layers**, so they can't be cut into parts directly. And this step also satisfies the competition rules' "student-led completion" requirement—**during the defense you can show the tracing process.**

---

## 7. Should we make GIFs?—Yes, but only 3, and **with a solid-color background**

### First distinguish the two uses (this is where 90% of people get confused)

| Use | What to use | Why |
| --- | --- | --- |
| **Inside the app UI** | **Animated WebP**, not GIF | GIF's alpha channel is only **1-bit** (a pixel is either fully transparent or fully opaque) → white fringes / jaggies appear on the character's edges. **This is a conclusion already argued in your docs; keep following it** |
| **Demo material** (≤5-minute demo video, poster, PPT) | **GIF is perfectly fine** ⭐ | Because in demo material the character is placed **on a solid background**—**the 1-bit alpha problem only appears when "compositing onto a complex background"**. On a solid background GIF and WebP are indistinguishable to the eye, and GIF has the best compatibility and can be dragged directly into PPT and editing software |

> **So the answer is: make 3 GIFs for demo material; keep using WebP / parts inside the app.**

### GIF specs

| Item | Suggested value |
| --- | --- |
| Size | **480 × 480** (for scaling in the video; not too big, not too small) |
| Background | **Solid paper-white `#F7F3EC`** (not transparent—transparency will reveal white fringes) |
| Frame rate | 12 fps (loop states) / 15 fps (one-shot actions) |
| Duration | 2–4 seconds, **looping** |
| Loop | First and last frames must connect (one-shot actions close the loop "out → back") |
| Single file | < 2 MB |

### Which 3 to record (ordered by "storytelling ability")

| Priority | State | Why record it |
| --- | --- | --- |
| ⭐⭐⭐ | **`aha`** | The highlight of the demo video—**one square above the head lights vermilion red**, "one square solved" understood at a glance. What judges remember is that one second |
| ⭐⭐⭐ | **`skeptical`** | It proves "this is not just another AI assistant." The junior classmate shakes his head and says "but I think X is right too" → the student must convince him. **This is the product's differentiation itself** |
| ⭐⭐ | **`listening`** | Nodding, ear cocked—shows "it's listening to me", best conveys the "student as teacher" relationship |
| Optional | `idle` | If a poster/PPT needs a "living" character |

> **Don't record `offline`, don't record `speaking`** (`speaking` looks weird without real audio).

---

## 8. Acceptance checklist (tick off when done)

- [ ] The character has **no teacher symbols** (white lab coat, glasses, pointer, lectern, book held overhead)
- [ ] The nine-grid above the head is **all empty** in `idle`—the student can see the goal at a glance
- [ ] During `aha`, **exactly one square** lights up, in vermilion red `#C8452F` (fully matching the logo)
- [ ] During `skeptical`, all nine squares **revert to blank** ("I don't understand again")
- [ ] The trigger frequency of `encouraging` is **≥ 2× that of `confused`**
- [ ] When an answer is wrong, play `encouraging` first, then `confused` (**never reversed**)
- [ ] `idle` has breathing + blinking and **is not completely still**
- [ ] Assets are **400×400 transparent PNG @2x**, with the character occupying 80%
- [ ] Only three main colors: ink `#141414` / paper white `#F7F3EC` / vermilion `#C8452F`
- [ ] Use **WebP** in the app; GIFs appear only in demo material and on a **solid background**
- [ ] Record the source and license of all assets in `ASSETS_LICENSE.md`

---

## Appendix: Copyright and compliance (following the red lines in your docs, not re-arguing them)

1. **Never** search for "anime GIFs" online and use them directly—if a middle-school product gets a complaint, it looks terrible.
2. **Don't** use well-known IP characters. Asset sites marking "free" may only mean "free to use", not "commercial use / redistributable".
3. Check three things one by one: whether **commercial use** is allowed, whether **attribution** is required, whether **modification** is allowed.
4. **The characters in this scheme are original geometric / animal figures + AI-generated design drafts + student manual tracing**, the lowest copyright-risk tier. Keep the AI prompts, models, and dates as a record of the creative process.
5. ⚠️ **The copyright status of AI-generated assets varies by region**; consult before commercializing; for competition scenarios at least keep the full generation records—this is also required by competition rules §12 "list AI tool names, versions, and uses".

---

## Appendix: What exactly is animated WebP? Why not use GIF?

### In one sentence

**Animated WebP is "the modern replacement for GIF"**—Google's WebP image format supports multi-frame animation and fixes both of GIF's old problems (alpha is only 1-bit, colors are only 256).

### Technical nature

- The container is **RIFF** (same family as WAV / AVI);
- **Each frame** can independently choose **lossy compression (VP8)** or **lossless compression (VP8L)**;
- Supports per-frame display duration and loop count, and also supports **sub-rectangle updates**—only changed regions are re-encoded, so files are small;
- ⚠️ Like GIF, **does not support audio**.

### Comparison with GIF / APNG (this is the key)

| | **GIF** | **Animated WebP** | APNG |
| --- | --- | --- | --- |
| Alpha channel | ⚠️ **1-bit** (a pixel is either fully transparent or fully opaque) | ✅ **8-bit (256 levels)** | ✅ 8-bit |
| Color count | 256 colors | **16.77 million colors (24-bit)** | 16.77 million colors |
| Size | large | ⭐ **usually 30–70% smaller than an equivalent GIF** | medium |
| Chromium / Electron | ✅ | ✅ **native support** | ✅ |
| PowerPoint | ✅ animates | ⚠️ see below | ⚠️ see below |

### Why this is decisive for the avatar

**GIF's 1-bit alpha means: every pixel at the character's edge is either fully opaque or fully transparent, with no intermediate transition.**
The result is **ugly white fringes and jaggies at the edges** when the character is placed on the app UI—exactly what your research doc calls "the number-one source of a cheap look in middle-schoolers' aesthetic".

WebP's 8-bit alpha gives edges 256 levels of transition, so **the cut-out edge is clean**.

### ⚠️ Who supports it and who doesn't (practical points)

| Environment | Animated WebP |
| --- | --- |
| **Electron / Chromium (your app)** | ✅ native support, `<img src="x.webp">` animates directly, **no extra JS library needed** |
| Chrome / Edge / Firefox / Safari 14+ | ✅ |
| **PowerPoint desktop** | ⚠️ can insert WebP images, but **don't count on animated WebP playing** |
| **PowerPoint online / Google Slides** | ❌ **no WebP support at all** (public info as of 2025-10) |

> **This directly confirms the conclusion of §7**:
> **Use animated WebP in the app** (needs transparency, small size, clean edges);
> **Use GIF for PPT / demo video / poster** (what's wanted is "plays anywhere, animates when dragged in").
> The two are not an either-or choice; they **divide the work by use**.

### How to produce it (ordered for your situation)

| Method | Description |
| --- | --- |
| ⭐ **Direct Aseprite export** | Draw frame by frame then export animated WebP directly, one step (your research already chose Aseprite) |
| **ezgif.com** (online) | Upload GIF / PNG sequence → one-click convert to WebP, **no installation**—your shell environment is currently unavailable, so this is the most realistic option |
| `gif2webp` / `img2webp` | Google libwebp official command-line tools; best for batch conversion (use once the shell is restored) |
| `ffmpeg -i in.gif -c:v libwebp_anim -loop 0 out.webp` | One line if you have ffmpeg |
| ScreenToGif | Screen recording and export on Windows, supports WebP |

### How to use it

```html
<!-- That's all it takes; the browser plays it natively -->
<img src="assets/xiaoge-idle.webp" alt="junior classmate idle">
```

### ⚠️ One still-unverified risk (following your research doc's notation)

The memory usage when all 8 states' animated WebPs **are preloaded at once** has **not been measured on this machine**. It is recommended to measure it once with Electron during the PoC phase; if memory is high, the fallback is: preload only the current state + adjacent states, and lazy-load the rest.

---

## References

1. Cassell, J. (2022). *Socially Interactive Agents as Peers.* In The Handbook on Socially Interactive Agents, Vol. 2, ACM, pp. 331. https://doi.org/10.1145/3563659
2. Ryokai, K., Vaucelle, C., & Cassell, J. (2003). Virtual Peers as Partners in Storytelling and Literacy Learning. *Journal of Computer Assisted Learning.* http://www.justinecassell.com/CC_Winter05/pdfs/ryokai_virtual.pdf
3. Bastani, H., et al. (2024). *Generative AI Can Harm Learning.* SSRN. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4895486
4. Oreopoulos, P., & Low, N. (2026). *One Click Away: AI Tutoring with Khanmigo in a Two-Year School Experiment.* NBER w35620. https://www.nber.org/papers/w35620
5. *Learning by Teaching with ChatGPT: The Effect of Teachable ChatGPT Agent on Programming Education.* arXiv:2412.15226. https://arxiv.org/abs/2412.15226
6. Rogers, et al. (2025). *Playing Dumb to Get Smart.* CHI 2025. https://doi.org/10.1145/3706598.3713644

> For the full sources and limitations of the remaining evidence (Bastani's specific numbers, Khanmigo's 17%, the error-correction experiment), see §9 of `research\07-learning-methods-and-evidence.md`.
