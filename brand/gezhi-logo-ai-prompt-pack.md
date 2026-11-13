# Gezhi · Logo design AI prompt pack v1

> 2026-10-02: the software already uses the four-way interwoven Logo v2; this document is retained as a historical exploration. See `docs/ui-v2-design-and-validation.md` for the current assets and generation record; icon export uses `node brand/export-logo-v2.mjs`.

> **Purpose**: create a set of logos for "Gezhi" that can actually be put into production. Every prompt in this document can be **copied directly** into Midjourney / GPT-image / Ideogram / Recraft / Jimeng / Nano Banana and run.
> **Source of the brand core**: `docs/00-environment-survey.md`, `docs/01-intelligence-layer-dsh-as-agent-core.md`, `research/05-avatars-and-feynman-scoring-research.md` (not adjectives made up on the spot).
> **Compliance reminder**: Article 12 of the competition charter requires the research report to list the **tool name, version, and purpose** of generative AI. Every image generated with this pack must be registered in the Generation Record Table at the end.

---

## 0. Decide three things first, then write prompts

### 1. One-sentence brand core

**Gezhi = an AI learning companion that helps secondary students "really understand".**

- The name comes from "致知在格物" in the *Book of Rites · Great Learning*. In the late Qing, "格致" meant natural science (Gezhi Academy, *Gezhi Huibian*).
- Three words that must be visible in the graphic: **structure (格, lattice) · inquiry (格物, investigate things) · sudden insight (致知, extending knowledge)**.
- The real differentiators on the product side (from research): **local-first, mandatory citation, Feynman scoring, knowledge graph** — so it **should not** look like yet another "blue-purple gradient + brain + circuit" AI logo.

> ⚠️ **One hard constraint**: 90% of AI education product logos on the market are "blue-purple gradient + glowing brain/book". **As soon as the words "AI", "technology", "futuristic", "neural", "glowing", or "gradient" appear in a prompt, a collision is inevitable.** All prompts in this pack deliberately avoid these words.

### 2. Where the Logo must survive (these are the acceptance criteria)

| Scenario | Size / condition | Requirement |
| --- | --- | --- |
| Windows taskbar / tray | 24–32 px | The structure must not blur into a blob |
| App icon | 1024 canvas, Win11 rounded corners | Outer 1/8 left empty, main body occupies ~62% |
| favicon | 16 px | Recognizable at a glance |
| Single-color printing | Pure black, no grayscale | Works without relying on color |
| Poster (0.8 × 1.1 m portrait) | Vector, may be printed in black and white | Lines must not be too thin |
| Demo video corner badge | Semi-transparent white, dark picture | Needs a reversed version |
| Research report header | Horizontal lockup, width ~40 mm | Wordmark must be clear |

**Conclusion: five versions must be made — "horizontal lockup / vertical lockup / icon only / single color / reversed".** Plan the image output around this goal from the prompt stage; do not draw a pretty one first and then figure it out.

### 3. One lesson that saves half the rework

> **Do not ask AI to draw Chinese characters, and do not expect it to spell "GEZHI" correctly.**
>
> The correct division of labor is: **AI only produces the "graphic"; the wordmark is typeset with a real font.**
> - Chinese "格致" → real fonts such as Source Han Serif / LXGW WenKai / Huawen Mingchao, with manual letter-spacing adjustment (-20 to -40/1000 em).
> - English "GEZHI" → a geometric sans-serif such as Inter / Manrope, all caps, letter-spacing +40 to +80.
> - Only when using **Ideogram 3.0 / Jimeng Seedream / GPT-image** should you try to have AI write the English wordmark, and **you must generate several and pick one**.

---

## 1. Universal master template (use this formula to build your own prompts)

```
[1 Subject structure] What geometric structure to draw — use countable, pointable nouns ("four straight lines dividing a square into nine cells")
[2 Composition rules] Grid / line weight / symmetry / positive-negative space / whitespace — determines whether it looks like a logo
[3 Color] Explicit colors or HEX, limited to 2–3 colors
[4 Style and medium] flat vector / geometric / modernist / app icon
[5 Exclusions] no text, no gradient, no 3D, no shadow, no mockup …
[6 Parameters] --ar 1:1 --style raw --v 7 --stylize 50
```

**English master template (fill in the blanks directly)**

```
Flat vector logo mark for [product positioning]: [1 subject structure with exact counts and angles];
[2 composition rules: uniform stroke weight, strictly geometric construction on a square grid,
centered, generous even negative space]; [3 color: ink black #141414 plus one accent
in vermilion red #C8452F]; flat two-color vector on a warm off-white background #F7F3EC;
no texture, no brush, no text, no letters, no numbers, no gradient, no shadow, no 3D,
no perspective, no mockup; Swiss modernist / Bauhaus geometric brand mark, app-icon
quality, still legible at 16 by 16 pixels
--ar 1:1 --style raw --v 7 --stylize 50
--no text, letters, numbers, words, gradient, shadow, 3d, mockup, photo, realistic, watermark, signature, glow
```

**Chinese master template (for Jimeng / Seedream / Tongyi Wanxiang / Doubao)**

```
Minimalist flat vector logo design. Subject: [1 subject structure, with clear counts and angles]. Composition: [2 uniform line weight,
strict geometric symmetry, centered, ample whitespace on all sides]. Color: [3 primary color + one accent color, give color names or values],
warm white background #F7F3EC. Flat two-color vector, no texture, no brush strokes, no gradient, no 3D, no shadow, no mockup,
no metallic texture, no light effects. Style: Swiss International Style / Bauhaus geometry / modern brand identity, App icon level,
still clear when scaled to 16×16. **Do not include any text, letters, or numbers** in the image.
```

**Slot table (change one value = change one direction, convenient for batch experiments)**

| Slot | Options |
| --- | --- |
| Geometric base | Nine-cell grid / 2×2田 grid / single square frame / ring / node connections / a single baseline |
| Main action | One cell filled / one stroke out of the frame / nodes growing on branches / negative space in a seal face / one continuous line |
| Primary color | Ink `#141414`, indigo ink `#14202B` |
| Accent color | Vermilion `#C8452F`, pine green `#1F8A70`, warm yellow `#F2B33D` |
| Background color | Rice-paper white `#F7F3EC`, pure white `#FFFFFF` |
| Style anchor | Swiss International Style / Bauhaus geometry / Japanese family crest (mon) / modern seal carving / minimalist UI icon |

> **Why the colors are "ink + vermilion + paper white"**: Gezhi's name itself comes from the tradition of vermilion-and-ink seal impressions. This palette is highly recognizable among a pile of blue-purple AI logos, prints beautifully on posters, does not collapse in black-and-white printing, and **the single-color version works naturally** (replace vermilion with black and the graphic is still complete).

---

## 2. Five concept directions (each can be run directly)

> For each direction, first give "why this one", then the **English prompt (primary)**, the **Chinese prompt**, the **Midjourney parameters**, and **where this concept is most likely to go wrong**.
> See the SVGs in `sketches\` in the same directory for composition sketches (open directly in a browser).

---

### Direction 1 | "Cell of Insight" — nine-cell grid · one cell filled

**Concept**: the Chinese character "格" (ge) is both structure and rule, and also the **田-character grid** every Chinese student uses to practice writing from childhood. Only one of the nine cells is lit — **knowledge is not poured in; it is genuinely understood one cell at a time.**

**Why it suits Gezhi**: it simultaneously expresses "structured knowledge" and "a Feynman-style moment of sudden clarity", and the shape loses almost no information at 16px (its biggest advantage).

**English prompt (primary)**

```
Flat vector logo mark for an AI study companion app: a perfect square divided into a
three-by-three lattice by four thin straight lines of exactly uniform weight; exactly one
of the nine cells is filled solid, the other eight cells are empty; even, mathematically
equal spacing; hairline strokes with slightly rounded terminals; ink black lines #141414
and the single filled cell in vermilion red #C8452F; strictly geometric and symmetrical
construction, centered on a plain warm off-white background #F7F3EC with generous even
margins; flat two-color vector, no texture; no text, no letters, no numbers, no gradient,
no shadow, no 3D, no perspective, no mockup; Swiss modernist, Bauhaus geometric, app-icon
quality, still legible at 16 by 16 pixels
--ar 1:1 --style raw --v 7 --stylize 50
--no text, letters, numbers, gradient, shadow, 3d, mockup, photo, realistic, watermark, glow, circuit
```

**Chinese prompt**

```
Minimalist flat vector Logo: a square divided by four thin straight lines into a nine-cell grid (three rows, three columns); of the nine cells,
only one is filled solid and the other eight are left empty; lines of exactly uniform weight, absolutely even spacing, slightly rounded ends; the filled cell
in vermilion red #C8452F, lines in ink black #141414; strictly geometric and symmetrical, centered, warm white background #F7F3EC,
ample whitespace around it; flat two-color vector, no texture, no gradient, no 3D, no shadow, no mockup; Swiss International Style / Bauhaus
geometric style, App icon level, still clear when scaled to 16×16; no text, letters, or numbers in the image.
```

**Midjourney**: the parameters above are the complete suffix; add `--seed 12345` to reproduce the same image.

**Where it can go wrong**: ① models easily draw it as the "田" character (only a single cross) — so you must hard-code **four thin straight lines** and **nine cells**; ② a filled cell in the center looks dull; try three positions — "bottom-right / dead center / top-left" — generate batches and choose.

**Defense script (for the defense)**: "A lattice is structure and also a rule; the 田 grid is the shape every Chinese student knows best. Only one of nine cells is lit, because we believe knowledge is not poured in — it is understood one cell at a time."

---

### Direction 2 | "Out of the Frame" — one cell opened · one stroke breaking out

**Concept**: the grid is the rule, **breaking the grid is creation**. In the nine-cell grid, the outer line of one cell is broken, and a stroke passes out through the gap, ending in a small round dot.

**Why it suits Gezhi**: it directly corresponds to the product claim — **"do not memorize answers, ask why"**. It has more momentum and memorability than Direction 1, and suits the poster key visual.

**English prompt (primary)**

```
Flat vector logo mark: a three-by-three grid built from thin uniform straight lines in ink
black #141414; one cell on the right edge is open — its outermost line is missing — and a
single short bold stroke passes out through that opening and ends in a small solid round
dot; the gesture reads as a rule being deliberately broken, a shape escaping its frame;
strictly geometric construction on a square grid, uniform stroke weight, flat two-color
vector: ink black strokes plus one vermilion red #C8452F escaping stroke; centered on a
warm off-white background #F7F3EC with generous negative space; no texture, no brush,
no text, no letters, no numbers, no gradient, no shadow, no 3D, no perspective, no mockup;
Swiss modernist geometric brand mark, app icon, crisp at small sizes
--ar 1:1 --style raw --v 7 --stylize 50
--no text, letters, numbers, gradient, shadow, 3d, mockup, photo, realistic, watermark, glow, splatter
```

**Chinese prompt**

```
Minimalist flat vector mark: a nine-cell grid made of thin straight lines, uniform weight, ink black #141414; on the right,
one cell opens outward (the outer frame line is broken), and a slightly thicker short line passes through the gap, ending in a solid small dot;
the whole conveys "a rule deliberately broken, a shape escaping its frame"; strictly geometric composition, flat two-color vector,
ink black lines + one vermilion red #C8452F line breaking out; centered, warm white background #F7F3EC, ample whitespace;
no texture, no brush strokes, no text, no letters, no numbers, no gradient, no 3D, no shadow, no mockup;
Swiss International Style geometric style, App icon level, clear at small sizes.
```

**Midjourney**: same as above.

**Where it can go wrong**: ① if the "escaping stroke" is too thin, it disappears at 24px — write **bold**, **three times the line weight** in the prompt, and measure the line width after generation; ② it is very easily drawn as an "arrow/rocket"; if necessary add `arrow, rocket, arrowhead` to `--no`.

**Defense script**: "The grid is the rule; breaking the grid is creation. This stroke walks out of the grid, representing that we built this product not so students can memorize answers, but so they ask why."

---

### Direction 3 | "Lattice & Growth" — baseline · trunk · nodes

**Concept**: the character "格" itself contains **木** (wood/tree). A thin baseline acts as a ruler, a short trunk splits into three branches, each branch ends in a solid node, and the nodes are connected by thin lines — **the canopy is simultaneously the knowledge graph**.

**Why it suits Gezhi**: this is the only direction that draws the real feature "knowledge graph" into the logo. It suits the key visual and splash screen.

**English prompt (primary)**

```
Flat vector logo mark: a geometric tree reduced to its essentials — one short vertical
trunk rising from a thin horizontal baseline, splitting into three straight branches at
fixed angles, each branch ending in a small solid circle; the three circles are also
connected to one another by thin straight lines, so the canopy simultaneously reads as a
knowledge graph / node network; the baseline extends left and right like an even ruler
with small tick marks, suggesting a grid; uniform stroke weight, right angles and
45-degree angles only; flat vector in two colors: deep ink #14202B for trunk, branches,
nodes and baseline, with exactly one node in warm amber #F2B33D; centered on a warm
off-white background #F7F3EC with generous negative space; no texture, no text, no letters,
no numbers, no gradient, no shadow, no 3D, no mockup; contemporary minimal educational
brand mark, app icon
--ar 1:1 --style raw --v 7 --stylize 60
--no text, letters, numbers, leaves, foliage, tree illustration, forest, gradient, shadow, 3d, mockup, photo, realistic, watermark
```

**Chinese prompt**

```
Minimalist flat vector mark: a geometric tree simplified to the extreme — a short vertical trunk standing on a thin horizontal baseline,
splitting upward into three straight branches at fixed angles, each branch tip a solid small dot; the three dots are then connected to each other
by thin straight lines, so the canopy also reads as a "knowledge graph / node network"; the baseline extends left and right into a ruler with tick marks,
suggesting a grid; uniform line weight, using only right angles and 45-degree angles; flat two-color: trunk, branches, nodes and baseline in
deep indigo ink #14202B, with one node emphasized in warm yellow #F2B33D; centered, warm white background #F7F3EC, ample whitespace;
no texture, no text, no letters, no numbers, no gradient, no 3D, no shadow, no mockup; contemporary minimalist educational brand identity,
App icon level. Do not draw leaves; do not draw a realistic tree.
```

**Where it can go wrong**: **without `no leaves`, leaves will certainly grow**, and once there are leaves it immediately becomes an "environmental/plant" brand. Also, the trunk must not be too tall, otherwise at small sizes only a vertical line remains.

**Defense script**: "The character 格 contains 木 (wood). The structure grows branches and leaves, and the tips bear knowledge points; connected together they are our knowledge graph."

---

### Direction 4 | "Seal of Inquiry" — modern seal carving · white characters

**Concept**: the two characters "格致" have always lived inside seals — a seal is a token of trust, and also the signature of scholarship. Redraw it as a vermilion seal using purely right-angled modern straight lines; **the outer frame is the structure**.

**Why it suits Gezhi**: among a pile of tech-feeling logos, it has the most cultural grounding and is the least likely to collide; placed on a poster it immediately becomes the key visual.

**English prompt (primary)**

```
Modern geometric logo mark inspired by a Chinese seal: a solid vermilion red #C8452F
square with a slightly softened corner radius, containing two abstract Chinese characters
carved out in white negative space; the strokes are built only from straight lines and
right angles, extremely simplified and geometric, occupying the square in a balanced
two-column layout; the outer frame is part of the character structure, not a separate
border; flat vector, razor-crisp edges, absolutely no brush texture, no ink splatter, no
calligraphic stroke variation, no paper grain, no distress, no grunge; centered on a warm
off-white background #F7F3EC with generous margin; contemporary East-Asian brand identity
with Swiss precision; no Latin text, no letters, no numbers, no gradient, no shadow, no 3D
--ar 1:1 --style raw --v 7
--no brush, calligraphy, ink splatter, ink wash, texture, paper grain, grunge, distressed, gradient, shadow, 3d, watercolor, latin text, letters, numbers, mockup, old, vintage paper
```

**Chinese prompt**

```
A modern geometric-style seal Logo: a solid vermilion red #C8452F square (very small corner radius), inside which two extremely simplified Chinese characters are "carved"
in white negative space; the strokes are built only from straight lines and right angles, fully geometric,
arranged in a balanced two-column layout within the square; the outer frame itself is part of the characters, with no extra border; flat vector,
sharp clean edges; absolutely no brush texture, no flying-white, no ink dots, no rice-paper texture, no distressing, no mottling;
centered on a warm white background #F7F3EC, ample whitespace around it; contemporary Eastern brand character + Swiss precision;
no Latin text, letters, or numbers, no gradient, no 3D, no shadow.
```

**⚠️ This one must be taken over by a human**: **AI will definitely not write the two characters "格致" correctly.** The correct usage is:
1. Have AI produce only the composition of "**red square + white geometric negative-space structure**" (treat it as a layout draft);
2. Typeset the glyphs with real fonts instead (Huawen Mingchao / Jinghua Old Song / Source Han Serif), or have students **hand-draw a geometric version**;
3. The hand-drawn version is actually better — **it is naturally copyrightable, explainable, and you can say clearly at the defense that you drew it yourselves**.

**Defense script**: "The two characters 格致 have always lived inside seals. A seal is a token of trust and also the signature of scholarship. We redrew it with the simplest straight lines, so it is both traditional and of today."

---

### Direction 5 | "GZ Monogram" — letter mark (for English materials)

**Concept**: G is drawn as three quarters of a circle (**the cycle of learning, the closed loop of review**), Z is drawn with three straight segments (**the edges of the lattice, the connections of the graph**), and the two share one stroke.

**Why it is needed**: the competition charter requires **all materials to be accepted in English only** (poster, brief version, report, film subtitles, defense). The lockup version on formal submissions should use "icon + GEZHI"; this letter mark is prepared for the English context.

**English prompt (primary)**

```
Flat vector monogram logo: the letter G drawn as three quarters of a perfect circle with a
short horizontal bar, and the letter Z drawn with three straight segments, the two letters
interlocking and sharing one common stroke where they meet; both letters cut from the same
uniform thick stroke weight, constructed on a geometric grid with a perfect circle and
straight segments only; one small solid vermilion red #C8452F square sits in the counter
of the G as the single accent; near-black ink #141414 for the rest; the monogram fits an
invisible square with even optical margins; flat two-color vector, no outline, no gradient,
no bevel, no shadow, no 3D; centered on a warm off-white background #F7F3EC; no other
text, no words, no numbers; modernist geometric brand mark, app icon, crisp at small sizes
--ar 1:1 --style raw --v 7 --stylize 50
--no extra letters, words, text, numbers, serif ornament, gradient, bevel, 3d, shadow, mockup, glow, watermark
```

**Chinese prompt**

```
Minimalist flat vector letter mark: the letter G is made of three quarters of a perfect circle plus a short horizontal bar, the letter Z
is made of three straight segments; the two letters interlock and share the same stroke where they intersect; both letters have exactly uniform stroke weight,
constructed on a geometric grid using only perfect circles and straight lines; in the negative space of the G place a small solid vermilion red #C8452F square dot
as the only accent color, the rest in near-black #141414; the whole fits within an invisible square, with even optical margins;
flat two-color vector, no outline, no gradient, no bevel, no 3D, no shadow; centered on a warm white background #F7F3EC;
no other text, words, or numbers in the image; modern geometric brand mark, App icon level, clear at small sizes.
```

**Where it can go wrong**: AI has very weak control over letter structure; **do not expect to get it right in one go**. Suggestion: for this one **prefer Ideogram 3.0** (strongest text capability), or simply **have students draw it in Figma / Illustrator** — the geometric construction of two letters takes a secondary student half an hour, and the result is much cleaner than what AI samples produce.

**Defense script**: "The Chinese name serves the Chinese context; the letter mark serves English materials. One brand, instantly recognizable in both languages."

---

### Alternative directions (not expanded; for a change of flavor)

| Direction | One sentence | Prompt replacement keywords |
| --- | --- | --- |
| "田" lamp | One cell of the 田 grid lights up with warm light, like a desk lamp | `one cell glowing like a warm desk lamp, amber #F2B33D` |
| Two-cell book page | The gap between two squares is the spine/page | `two adjacent squares reading as an open book spread` |
| Name seal · single character | Carve only the single character "格" | `a single abstract geometric Chinese character in a red square` |
| Continuous-line grid | One unbroken line draws a grid | `one continuous unbroken stroke drawing a grid, single line weight` |

---

## 3. Wordmark and three lockups

### Chinese wordmark "格致"

**Do not generate it with AI.** Use a real font; with good letter-spacing it is already professional:

| Font | Character | Where to use |
| --- | --- | --- |
| Source Han Serif SC | Academic, proper, weighty | Report cover, poster title, "Seal" direction |
| LXGW WenKai | Approachable, handwritten feel, unpretentious | In-app UI, copy written for students |
| Source Han Sans SC | Neutral, modern, clear | Interface, video subtitles |
| Huawen Mingchao / Jinghua Old Song | Contemporary Chinese style, retro but not old | Wordmark for the "Seal" direction |

Handling: tighten letter-spacing to **-20 to -40 / 1000 em**; you may connect the final stroke of "格" with the first stroke of "致" at **one point**; the final stroke of the "攵" radical in "致" may rise slightly, echoing the graphic's "breaking out of the frame" imagery.

### English wordmark GEZHI

- All caps + letter-spacing **+40 to +80**: `G E Z H I`
- Recommended fonts: **Inter** / **Manrope** (geometric sans-serif, free for commercial use); for a more bookish feel use **Source Serif 4** / **Spectral**.
- If you insist on having AI write it: use **Ideogram 3.0**, prompt `the exact text "GEZHI" in a clean geometric sans-serif, all caps, wide letter spacing`, generate 8 and pick 1, and **still manually check whether the glyphs are correct**.

### Three lockups (mandatory)

```
Horizontal  [icon] Gezhi / GEZHI          → report header, poster title band, PPT footer
Vertical     [icon]
              Gezhi
              GEZHI                        → splash screen, poster key visual, video end card
Icon only    [icon]                        → favicon, taskbar, video corner badge, single-color printing
```

**⚠️ Competition note**: the 2026 charter requires all submitted materials to be **accepted in English only**. So on formal submissions (poster, brief version, report, film) use the **horizontal "icon + GEZHI"**; leave the Chinese version for the App interface and local contexts.

### Tagline (use only as a third layer; do not stuff it into the logo)

- `Inquire. Understand. Master.`
- `Understand it, don't memorize it.`
- `AI learning, rooted in inquiry.`
- Bilingual pairing: `Gewu Zhizhi · Learn by Inquiry` (works well as a poster subtitle)

---

## 4. Tool adaptation quick reference

| Tool | Strength | How to write the prompt | Key techniques |
| --- | --- | --- | --- |
| **Midjourney v7** | Style and texture, high exploration volume | Stack short comma-separated phrases, make the structure concrete | `--style raw --stylize 50 --ar 1:1`; lower `--stylize` = more obedient; `--seed` to reproduce; `--sref` to lock style; **weak at text** |
| **GPT-image (ChatGPT)** | Understands long sentences, can revise images iteratively | Complete natural-language paragraphs, explicitly write `no text` | Change only one thing at a time, and say `keep everything else identical` |
| **Ideogram 3.0** | **Most accurate English text** | Natural language + quoted exact text | Choose the `Design` style; generate 4 and pick 1 |
| **Recraft V3** | **Can export SVG vectors directly** | Short description + `vector logo, flat, icon` | Choose Vector art / Icon; export SVG then clean anchors in Figma |
| **Jimeng / Seedream 4.0** | Best Chinese understanding, relatively accurate Chinese glyphs | Use the Chinese master template above | Choose the "Logo / icon" template, output 2K |
| **Nano Banana (Gemini image)** | **Unbeatable at iterative revisions** | "Change X in this image to Y, keep everything else completely unchanged" | Much more stable than regenerating; good for final polish |
| **Local Flux / SDXL** | Fully controllable, can train LoRA, uncensored | Short tag style, negative words separately | Use ControlNet to lock the grid; generate 20 and train a "Gezhi style" LoRA |

**Recommended combination**: `Midjourney for volume → choose a direction → Nano Banana for fine-tuning → Recraft for SVG → Figma redraw for the final`.

---

## 5. From AI image to a truly usable logo: a seven-step pipeline

| Step | What to do | Output / criterion |
| --- | --- | --- |
| 0 | Build a moodboard (**reference inspiration, do not reference a specific brand**) | Explicitly write "**do not imitate any existing brand**" |
| 1 | Generate **8–12 images** for each of the five directions (1:1, ≥1024px) | 40–60 images total |
| 2 | Pick 1 per direction → use `--seed` or Nano Banana to generate **6 variants** | Fine-tune only: line weight, corner radius, filled-cell position, whitespace ratio |
| 3 | Finalize → **vectorize** | Recraft exports SVG; or Illustrator Image Trace (limit 2–3 colors, ignore white, paths 60–80%, corners 75%+, noise 20px) |
| 4 | **Redraw it on a grid in Figma / Illustrator** ⭐ | Traced paths always have burrs; **only a redraw preserves "originality" and survives the defense** |
| 5 | Assemble the wordmark (real font) + three lockups | Horizontal / vertical / icon only |
| 6 | Export the asset list (see below) | All vector or transparent PNG |
| 7 | Register the generation record (compliance) | See the table at the end |

**Step 4 is the soul of the whole pipeline**: AI-traced paths are never clean (hundreds of nodes, uneven curvature), and **you cannot explain them at the defense**. Redraw on a 3×3 grid: clean paths, scalable, copyrightable, and you can say "we drew this ourselves".

### Export asset list

```
logo-mark.svg              Main icon (16–1024 universal, vector)
logo-mark-mono.svg         Single-color version (vermilion → black)
logo-horizontal.svg        Horizontal lockup
logo-vertical.svg          Vertical lockup
logo-reversed.svg          Reversed version (dark background)
icon-1024.png              Transparent background, App icon master
app.ico                    16 / 24 / 32 / 48 / 64 / 128 / 256
favicon.ico                16 / 32
apple-touch-icon.png       180×180
poster-logo.svg            For 0.8×1.1 m poster (vector, embedded directly into PDF)
brand-colors.md            Primary/secondary colors in HEX / RGB / CMYK
```

Use the uniform prefix `Gezhi_Logo_*` for naming, convenient for pasting into reports and posters.

---

## 6. Iteration prompts (for revisions)

Revising is much more stable than regenerating; use **Nano Banana / GPT-image** on the selected image:

| What to change | Say this |
| --- | --- |
| Lines too thin | `Keep everything identical, but increase the stroke weight of all lines by about 40% so it survives at 16 pixels.` |
| Filled cell in the wrong place | `Move the single filled cell to the bottom-right corner. Change nothing else.` |
| Too crowded | `Keep the same structure but increase the negative space around the mark by 30%. Nothing else changes.` |
| Colors too saturated | `Desaturate the red to a muted vermilion #C8452F. Keep all shapes and proportions exactly as they are.` |
| Need a single-color version | `Convert this mark to a single-color black version on white, removing the accent color entirely while keeping the same shapes.` |
| Need a reversed version | `Reverse this mark to pure white on a near-black #141414 background. Keep the geometry identical.` |
| Change the style | `Redraw the same mark in the style of Japanese family crests (mon): perfect symmetry, hairline uniform strokes, no shading.` |

---

## 7. Pitfall checklist

1. **Do not write "AI", "futuristic", "neural", "glowing", "gradient", or "blue" in the prompt** → it will inevitably collide into a generic AI logo.
2. **Do not let AI draw Chinese characters** → it will certainly be wrong. Graphics belong to AI; characters belong to fonts.
3. **Do not ask for "3D texture / glassmorphism / metal"** → it blurs when scaled down and collapses in print.
4. **Do not use lines thinner than 1.5px (@1024)** → they will certainly disappear at 16px.
5. **Do not ignore whitespace** → the icon body should occupy **60–66%** of the canvas, with no content in the outer 1/8 (Win11 rounded corners will cut it).
6. **Do not skip the similarity self-check** → after finalizing, reverse-search the image on Google Images / trademark databases once; it **must be clearly different** from existing school emblems such as "Gezhi Middle School" (to avoid being mistaken for an official school product).
7. **Do not save only PNG** → the poster is 0.8×1.1 m, so it must be vector.
8. **Do not stuff the tagline into the logo** → that is the third layer; typeset it separately.
9. **Do not distinguish only by color** → the poster will turn into a blob in black-and-white printing.

---

## 8. Acceptance tests (seven items; all must pass for finalization)

| # | Test | Pass criterion |
| --- | --- | --- |
| 1 | Scale to **16×16** and look | Still recognizable as what it is |
| 2 | **Pure black single color** on white | Does not collapse, loses no information |
| 3 | **Reversed** (pure white on #141414) | Clear, not harsh |
| 4 | **Grayscale printing** | Hierarchy still distinguishable |
| 5 | Windows taskbar **24/32px** | Does not blur into a blob |
| 6 | Poster size (0.8×1.1 m) | Line width sufficient, vector with no jaggies |
| 7 | Similarity self-check | Clearly different from known logos |

Also write out `brand-colors.md`: primary `#C8452F` / ink `#141414` / background `#F7F3EC`, each with HEX, RGB, and CMYK, and note that **single-color use is allowed**.

---

## 9. Generation record table (for compliance; must be filled in)

Competition charter §12 requires: **list the name, version, and purpose of the generative AI tools, as well as the parts completed by students.** It is recommended to put this table directly into the "AI Usage Statement" section of the research report.

| Date | Tool and version | Purpose | Prompt ID | seed / URL | **Parts done by students themselves** | Adopted |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-__-__ | Midjourney v7 | Sketch exploration (Direction 1) | A-01 | seed 12345 | Selecting drafts, deciding direction | ✅ |
| 2026-__-__ | Recraft V3 | Vectorization | A-01 | — | Cleaning anchors | ✅ |
| 2026-__-__ | — | **Manual redraw of the final on a 3×3 grid** | — | — | **All** | ✅ |
| 2026-__-__ | Source Han Serif | Chinese wordmark typesetting | — | — | Letter-spacing adjustment | ✅ |

> **A more robust compliance strategy**: use AI only to **produce sketches and find directions**, and have students **redraw the final artwork on a grid as vectors**.
> This makes the copyright status certain (not dependent on copyright disputes over AI-generated works), and also satisfies the charter's requirement that "the work must be led and completed by the participating students" — at the defense you can bring out the grid paper and the redrawing process together.

---

## Appendix: composition sketches

| File | Corresponding direction |
| --- | --- |
| `brand\sketches\01-one-cell.svg` | Direction 1 · Cell of Insight |
| `brand\sketches\02-break-grid.svg` | Direction 2 · Out of the Frame |
| `brand\sketches\03-tree-graph.svg` | Direction 3 · Lattice & Growth |
| `brand\sketches\04-seal-lattice.svg` | Direction 4 · Seal of Inquiry (glyphs are indicative only; final requires redrawing) |

> These SVGs are **geometric composition sketches**, not final designs; open them directly in a browser to see the proportional relationships. When actually producing images, use them as a reference for "what it looks like in my head", not as something for AI to trace.
