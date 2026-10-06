# 格致 · Logo 设计 AI 提示词包 v1

> 2026-10-02：软件已使用四向交织 Logo v2；本文件保留为历史探索。当前素材与生成记录见 `docs/UI-v2-设计与验证.md`，图标导出使用 `node brand/export-logo-v2.mjs`。

> **用途**：给「格致」做一套能真正落地的标识。本文里每一段提示词都可**直接复制**到 Midjourney / GPT-image / Ideogram / Recraft / 即梦 / Nano Banana 里跑。
> **品牌内核来源**：`docs\00-环境勘察报告.md`、`docs\01-智能层选型-DSH作为Agent内核.md`、`research\05-数字人与费曼评分调研.md`（不是拍脑袋写的形容词）。
> **合规提醒**：竞赛章程第十二条要求在研究报告中列明生成式 AI 的**工具名、版本、用途**。用本包生成的每一张图都要登记到文末的《生成记录表》。

---

## 〇、先定三件事，再写提示词

### 1. 一句话品牌内核

**格致 = 让中学生「真的懂」的 AI 学习伙伴。**

- 名字出自《礼记·大学》「致知在格物」。晚清「格致」即自然科学（格致书院、《格致汇编》）。
- 图形上必须能被看见的三个词：**结构（格）· 探究（格物）· 豁然（致知）**。
- 产品侧的真实差异点（来自调研）：**本地优先、引用强制、费曼评分、知识图谱**——所以它**不该**长成又一个「蓝紫色渐变 + 大脑 + 电路」的 AI logo。

> ⚠️ **一条硬约束**：市面上 90% 的 AI 教育产品 logo 都是「蓝紫渐变 + 发光大脑/书本」。**只要提示词里出现 "AI"、"technology"、"futuristic"、"neural"、"glowing"、"gradient"，就必然撞车。** 本包所有提示词都刻意回避这些词。

### 2. Logo 要能在哪些地方活下来（这就是验收标准）

| 场景 | 尺寸 / 条件 | 要求 |
| --- | --- | --- |
| Windows 任务栏 / 托盘 | 24–32 px | 结构不能糊成一团 |
| 应用图标 | 1024 画布，Win11 圆角 | 外圈 1/8 留空，主体占 ~62% |
| favicon | 16 px | 一眼能认 |
| 单色印刷 | 纯黑，无灰阶 | 不靠颜色也成立 |
| 海报（0.8 × 1.1 m 直向） | 矢量，可能黑白打印 | 线条别太细 |
| 演示视频角标 | 半透明白，深色画面 | 需要反白版 |
| 研究报告页眉 | 横版锁定，宽 ~40 mm | 字标要清晰 |

**结论：必须做「横版锁定 / 竖版锁定 / 纯图标 / 单色 / 反白」五个版本。** 提示词阶段就要按这个目标出图，不能先画一张漂亮的再想办法。

### 3. 一条省掉一半返工的经验

> **不要让 AI 画中文字，也不要指望它把「GEZHI」拼对。**
>
> 正确分工是：**AI 只负责出「图形」，字标用真字体排。**
> - 中文「格致」→ 思源宋体 / 霞鹜文楷 / 汇文明朝体 等真字体，手工调字距（-20~-40/1000 em）。
> - 英文「GEZHI」→ Inter / Manrope 类几何无衬线，全大写，字距 +40~+80。
> - 只有在用 **Ideogram 3.0 / 即梦 Seedream / GPT-image** 时才尝试让 AI 写英文词标，并且**必须多抽几张挑一张**。

---

## 一、万能母版（自己造提示词用这个公式）

```
【1 主体结构】 画什么几何结构 —— 用可数、可指认的名词（"四条直线等分为九格"）
【2 构成规则】 网格 / 线宽 / 对称 / 正负形 / 留白 —— 决定它像不像 logo
【3 色彩】     明确的颜色或 HEX，限定 2–3 色
【4 风格媒介】 flat vector / geometric / modernist / app icon
【5 排除项】   no text, no gradient, no 3D, no shadow, no mockup …
【6 参数】     --ar 1:1 --style raw --v 7 --stylize 50
```

**英文母版（直接填空）**

```
Flat vector logo mark for [产品定位]: [1 主体结构 with exact counts and angles];
[2 构成规则: uniform stroke weight, strictly geometric construction on a square grid,
centered, generous even negative space]; [3 色彩: ink black #141414 plus one accent
in vermilion red #C8452F]; flat two-color vector on a warm off-white background #F7F3EC;
no texture, no brush, no text, no letters, no numbers, no gradient, no shadow, no 3D,
no perspective, no mockup; Swiss modernist / Bauhaus geometric brand mark, app-icon
quality, still legible at 16 by 16 pixels
--ar 1:1 --style raw --v 7 --stylize 50
--no text, letters, numbers, words, gradient, shadow, 3d, mockup, photo, realistic, watermark, signature, glow
```

**中文母版（即梦 / Seedream / 通义万相 / 豆包用）**

```
极简扁平矢量标志设计。主体：[1 主体结构，写清数量与角度]。构成：[2 线条粗细一致、
严格几何对称、居中、四周留白充足]。配色：[3 主色 + 一个强调色, 给出颜色名或色值]，
暖白背景 #F7F3EC。扁平双色矢量，无纹理、无笔触、无渐变、无立体、无投影、无样机、
无金属质感、无光效。风格：瑞士国际主义 / 包豪斯几何 / 现代品牌标识，App 图标级别，
缩到 16×16 依然清晰。画面中**不要出现任何文字、字母、数字**。
```

**槽位表（换一个值 = 换一个方向，方便批量试）**

| 槽位 | 可选值 |
| --- | --- |
| 几何基底 | 九宫格 / 田字格 2×2 / 单格方框 / 圆环 / 节点连线 / 一条基线 |
| 主体动作 | 一格填实 / 一笔出格 / 枝上生节点 / 印面留白 / 一线连笔 |
| 主色 | 墨 `#141414`、靛墨 `#14202B` |
| 强调色 | 朱砂 `#C8452F`、松青 `#1F8A70`、暖黄 `#F2B33D` |
| 底 色 | 宣纸白 `#F7F3EC`、纯白 `#FFFFFF` |
| 风格锚 | 瑞士国际主义 / 包豪斯几何 / 日本家纹（mon）/ 现代篆刻 / 极简 UI 图标 |

> **色彩为什么是「墨 + 朱 + 纸白」**：格致的名字本身就来自朱墨印谱的传统。这套配色在一堆蓝紫 AI logo 里辨识度极高，海报上印刷好看，黑白打印也不塌，而且**单色版天然成立**（朱砂换成黑就是完整图形）。

---

## 二、五个概念方向（每个都可直接开跑）

> 每个方向先给「为什么是它」，再给**英文提示词（主）**、**中文提示词**、**Midjourney 参数**、**这个概念最容易翻车的点**。
> 构图示意见同目录 `sketches\` 下的 SVG（浏览器直接打开即可）。

---

### 方向 1｜「一格得解」Cell of Insight —— 九宫格 · 一格填实

**概念**：中文的「格」既是结构、是规矩，也是每个中国学生从小学写字用的**田字格**。九个格子里只有一格被点亮——**知识不是被灌满的，是一格一格真正弄懂的。**

**为什么适合格致**：它同时说清了「结构化的知识」和「费曼式的一次豁然开朗」，而且这个形状在 16px 下几乎不损失信息（这是它最大的优势）。

**英文提示词（主）**

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

**中文提示词**

```
极简扁平矢量 Logo：一个正方形被四条细直线等分为九宫格（三行三列），九个格子里
只有一格填实，其余八格留空；线条粗细完全一致、间距绝对均匀、端点微圆；填实的格子
用朱砂红 #C8452F，线条用墨黑 #141414；严格几何对称，居中，暖白背景 #F7F3EC，
四周留白充足；扁平双色矢量，无纹理无渐变无立体无投影无样机；瑞士国际主义 / 包豪斯
几何风格，App 图标级别，缩到 16×16 依然清晰；画面中不要任何文字、字母、数字。
```

**Midjourney**：上表参数即为完整后缀；复现同一张加 `--seed 12345`。

**翻车点**：① 模型很容易画成「田」字（只有一个十字）——所以必须写死 **four thin straight lines** 和 **nine cells**；② 填实格子在中心会很呆，可试「右下 / 正中 / 左上」三种位置各出一批再挑。

**答题话术（答辩时用）**：「格是结构也是规矩，田字格是每个中国学生最熟悉的图形。九个格只亮一格，因为我们相信知识不是灌进去的，是一格一格弄懂的。」

---

### 方向 2｜「破格」Out of the Frame —— 一格开口 · 一笔越出

**概念**：格是规则，**破格是创造**。九宫格里有一格的外边线断了，一笔从缺口越出去，末端收成一个小圆点。

**为什么适合格致**：直接对应产品主张——**「不要背答案，要问为什么」**。比方向 1 更有动势和记忆点，适合做海报主视觉。

**英文提示词（主）**

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

**中文提示词**

```
极简扁平矢量标志：一个由细直线构成的九宫格，线条粗细一致、墨黑 #141414；右侧
其中一格向外开口（外框线断开），一笔较粗的短线从缺口穿出，末端是一个实心小圆点；
整体传达「规则被有意识地突破、形状越出框架」的意思；严格几何构图，扁平双色矢量，
墨黑线条 + 一笔朱砂红 #C8452F 的出格笔画；居中，暖白背景 #F7F3EC，留白充足；
无纹理、无笔触、无文字、无字母、无数字、无渐变、无立体、无投影、无样机；
瑞士国际主义几何风格，App 图标级别，小尺寸清晰。
```

**Midjourney**：同上。

**翻车点**：① 「出格那一笔」如果太细，缩到 24px 就消失——提示词里写 **bold**、**three times the line weight**，出图后量一下线宽；② 极易被画成「箭头/火箭」，必要时在 `--no` 里加 `arrow, rocket, arrowhead`。

**答题话术**：「格是规则，破格是创造。这一笔从格子里走出去，代表我们做这个产品不是让学生背答案，而是让他问为什么。」

---

### 方向 3｜「格中生木」Lattice & Growth —— 基线 · 枝干 · 节点

**概念**：「格」字里本来就有个**木**。一条细基线当尺子，一截短树干分三枝，枝头结三个实心节点，节点之间用细线相连——**树冠同时就是知识图谱**。

**为什么适合格致**：这是唯一一个把「知识图谱」这个真实功能画进 logo 的方向。适合做主视觉与启动页。

**英文提示词（主）**

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

**中文提示词**

```
极简扁平矢量标志：一棵被简化到极致的几何树——一条短竖树干立在一条细横基线上，
向上分成三根固定角度的直枝，每根枝头是一个实心小圆点；三个圆点之间再用细直线
互相连接，使树冠同时读作「知识图谱 / 节点网络」；基线向左右延伸成一把带刻度的尺子，
暗示网格；线条粗细一致，只用直角与 45 度角；扁平双色：树干、枝条、节点与基线用
深靛墨 #14202B，其中一个节点用暖黄 #F2B33D 强调；居中，暖白背景 #F7F3EC，留白充足；
无纹理、无文字、无字母、无数字、无渐变、无立体、无投影、无样机；当代极简教育品牌标识，
App 图标级别。不要画叶子，不要画成写实的树。
```

**翻车点**：**不写 `no leaves` 就一定会长出叶子**，一旦有叶子立刻变成「环保/植物」品牌。另外树干别太高，否则缩小时只剩一根竖线。

**答题话术**：「格字里有木。结构长出枝叶，枝上结的是知识点，连起来就是我们的知识图谱。」

---

### 方向 4｜「朱印」Seal of Inquiry —— 现代篆刻 · 白文

**概念**：「格致」这两个字本来就活在印章里——印是凭信，也是学问的落款。用纯直角的现代直线把它重画成一方朱印，**外框即结构**。

**为什么适合格致**：在一堆科技感 logo 里，它是最有文化底气、最不可能撞车的一个；海报上一放就是主视觉。

**英文提示词（主）**

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

**中文提示词**

```
一枚现代几何风格的印章式 Logo：实心朱砂红 #C8452F 的方形（圆角很小），内部以白色
留白的形式「刻」出两个被极度简化的中文汉字；笔画只用直线与直角构成，完全几何化，
在方内以均衡的两栏布局排列；外框本身就是字的一部分，没有额外边框；扁平矢量，
边缘锋利干净；绝对不要毛笔质感、不要飞白、不要墨点、不要宣纸纹理、不要做旧、不要斑驳；
居中安排在暖白背景 #F7F3EC 上，四周留白充足；当代东方品牌气质 + 瑞士式的精确；
不要任何拉丁文字、字母、数字，不要渐变、不要立体、不要投影。
```

**⚠️ 这条必须人工接手**：**AI 一定写不对「格致」二字。** 正确用法是：
1. 让 AI 只出「**红方 + 白色几何留白结构**」的构图（把它当成版式草稿）；
2. 字形改用真字体排（汇文明朝体 / 京华老宋体 / 思源宋体），或由学生**手绘一版几何字**；
3. 手绘版反而更好——**它天然可版权、可解释、能在答辩上说清楚是自己画的**。

**答题话术**：「格致两个字本来就活在印章里。印是凭信，也是学问的落款。我们用最简的直线把它重画了一遍，让它既是传统的，也是今天的。」

---

### 方向 5｜「GZ 一笔连」Monogram —— 字母标记（英文材料专用）

**概念**：G 画成四分之三个圆（**学习的循环、复习的闭环**），Z 用三段直线（**格的棱角、图谱的连线**），两者共用一笔。

**为什么需要它**：竞赛章程要求**所有材料只接受英文**（海报、简版、报告、影片字幕、答辩）。正式提交物上的锁定版本建议用「图标 + GEZHI」；这个字母标记就是为英文语境准备的。

**英文提示词（主）**

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

**中文提示词**

```
极简扁平矢量字母标志：字母 G 由一个完美圆形的四分之三圆弧加一段短横组成，字母 Z
由三段直线组成，两个字母相互咬合、在相交处共用同一笔画；两字母笔画粗细完全一致，
只用正圆与直线在几何网格上构成；G 的负空间里放一个实心朱砂红 #C8452F 的小方点
作为唯一强调色，其余用近黑 #141414；整体在一个隐形正方形内，视觉边距均匀；
扁平双色矢量，无描边、无渐变、无倒角、无立体、无投影；居中于暖白背景 #F7F3EC；
画面中没有其他任何文字、单词或数字；现代几何品牌标识，App 图标级别，小尺寸清晰。
```

**翻车点**：AI 对字母结构的控制力很弱，**不要指望一次出对**。建议：这一条**优先用 Ideogram 3.0**（文字能力最强），或者干脆**学生用 Figma / Illustrator 画**——两个字母的几何构造对一个中学生来说是半小时的事，而且画出来比 AI 抽的干净得多。

**答题话术**：「中文名给中文语境，字母标记给英文材料。同一个品牌，两种语言都一眼认得出。」

---

### 备选方向（不展开，供换口味）

| 方向 | 一句话 | 提示词替换关键词 |
| --- | --- | --- |
| 「田」字灯 | 田字格的一格亮起暖光，像台灯 | `one cell glowing like a warm desk lamp, amber #F2B33D` |
| 双格书页 | 两个方格的间隔就是书脊/书页 | `two adjacent squares reading as an open book spread` |
| 姓名印·单字 | 只刻一个「格」字 | `a single abstract geometric Chinese character in a red square` |
| 连续线方格 | 一条不断笔的线画出一个网格 | `one continuous unbroken stroke drawing a grid, single line weight` |

---

## 三、字标（Wordmark）与三种锁定

### 中文字标「格致」

**不要 AI 生成。** 用真字体，配好字距就是专业水准：

| 字体 | 气质 | 用在哪 |
| --- | --- | --- |
| 思源宋体 Source Han Serif SC | 学术、端正、有分量 | 报告封面、海报标题、「朱印」方向 |
| 霞鹜文楷 LXGW WenKai | 亲和、手写感、不端着 | App 内 UI、写给学生的文案 |
| 思源黑体 Source Han Sans SC | 中性、现代、清楚 | 界面、视频字幕 |
| 汇文明朝体 / 京华老宋体 | 当代国风、复古但不旧 | 「朱印」方向的字标 |

处理手法：字距收紧 **-20 ~ -40 / 1000 em**；可让「格」的末笔与「致」的起笔做**一处连接**；「致」的反文旁（攵）末笔可略微上扬，与图形的「出格」意象呼应。

### 英文字标 GEZHI

- 全大写 + 字距 **+40 ~ +80**：`G E Z H I`
- 推荐字体：**Inter** / **Manrope**（几何无衬线，免费可商用）；想更有书卷气用 **Source Serif 4** / **Spectral**。
- 若坚持让 AI 写：用 **Ideogram 3.0**，提示词写 `the exact text "GEZHI" in a clean geometric sans-serif, all caps, wide letter spacing`，抽 8 张挑 1 张，**仍要人工检查字形是否正确**。

### 三种锁定（必做）

```
横版  [图标] 格致 / GEZHI          → 报告页眉、海报标题带、PPT 页脚
竖版   [图标]
       格致
       GEZHI                        → 启动页、海报主视觉、视频片尾
纯图标 [图标]                       → favicon、任务栏、视频角标、单色印刷
```

**⚠️ 参赛注意**：2026 章程规定所有提交材料**只接受英文**。所以正式提交物（海报、简版、报告、影片）上用**横版「图标 + GEZHI」**；中文版留给 App 界面和本地场景。

### Tagline（只在第三层用，别塞进 logo）

- `Inquire. Understand. Master.`
- `Understand it, don't memorize it.`
- `AI learning, rooted in inquiry.`
- 中英并置：`格物致知 · Learn by Inquiry`（海报副标题很好用）

---

## 四、工具适配速查

| 工具 | 强项 | 提示词怎么写 | 关键技巧 |
| --- | --- | --- | --- |
| **Midjourney v7** | 风格质感、探索量大 | 逗号短句堆叠，把结构写具体 | `--style raw --stylize 50 --ar 1:1`；`--stylize` 越低越听话；`--seed` 复现；`--sref` 锁风格；**文字弱** |
| **GPT-image（ChatGPT）** | 听得懂长句、能连续改图 | 完整自然语言段落，明确写 `no text` | 一次只改一处，并说 `keep everything else identical` |
| **Ideogram 3.0** | **英文文字最准** | 自然语言 + 引号写死文字 | 选 `Design` 风格；一次出 4 张挑 1 张 |
| **Recraft V3** | **可直接导出 SVG 矢量** | 短描述 + `vector logo, flat, icon` | 选 Vector art / Icon；导出 SVG 后再到 Figma 清锚点 |
| **即梦 / Seedream 4.0** | 中文理解最好、中文字形较准 | 用上面的中文母版 | 选「Logo / 图标」模板，出 2K |
| **Nano Banana（Gemini 图像）** | **改稿迭代无敌** | 「把这张图的 X 改成 Y，其余完全不变」 | 比重新生成稳得多，适合最后收口 |
| **本地 Flux / SDXL** | 完全可控、可训 LoRA、无审查 | 短标签式，负向词单独填 | 用 ControlNet 锁网格；抽 20 张训一个「格致风格」LoRA |

**推荐组合拳**：`Midjourney 出量 → 选定方向 → Nano Banana 微调 → Recraft 出 SVG → Figma 重画定稿`。

---

## 五、从 AI 图到真正能用的 logo：七步流水线

| 步 | 做什么 | 产出 / 判据 |
| --- | --- | --- |
| 0 | 建 moodboard（**参考灵感，不要参考某个具体品牌**） | 明确写出「**不要模仿任何现有品牌**」 |
| 1 | 五个方向各出 **8–12 张**（1:1，≥1024px） | 共 40–60 张 |
| 2 | 每方向选 1 张 → 用 `--seed` 或 Nano Banana 出 **6 张变体** | 只微调：线宽、圆角、填色格位置、留白比例 |
| 3 | 定稿 → **矢量化** | Recraft 导出 SVG；或 Illustrator 图像描摹（限 2–3 色、忽略白色、路径 60–80%、角落 75%+、杂色 20px） |
| 4 | **在 Figma / Illustrator 里按网格重画一遍** ⭐ | 描摹路径一定有毛刺；**重画才守得住「原创性」与答辩** |
| 5 | 组装字标（真字体）+ 三种锁定 | 横版 / 竖版 / 纯图标 |
| 6 | 导出资产清单（见下） | 全部为矢量或透明 PNG |
| 7 | 登记生成记录（合规） | 见文末表格 |

**第 4 步是整条流水线的灵魂**：AI 描摹出来的路径永远不干净（节点几百个、曲率不匀），而且**在答辩时你没法解释它**。用 3×3 网格重画一遍，路径干净、可缩放、可版权，还能说「这是我们自己画的」。

### 导出资产清单

```
logo-mark.svg              主图标（16–1024 通用，矢量）
logo-mark-mono.svg         单色版（朱砂→黑）
logo-horizontal.svg        横版锁定
logo-vertical.svg          竖版锁定
logo-reversed.svg          反白版（深色背景）
icon-1024.png              透明底，App 图标母版
app.ico                    16 / 24 / 32 / 48 / 64 / 128 / 256
favicon.ico                16 / 32
apple-touch-icon.png       180×180
poster-logo.svg            0.8×1.1 m 海报用（矢量，直接嵌入 PDF）
brand-colors.md            主色/辅助色的 HEX / RGB / CMYK
```

命名统一用 `Gezhi_Logo_*`，方便贴进报告和海报。

---

## 六、迭代提示词（改稿专用）

改稿比重新生成稳得多，用 **Nano Banana / GPT-image** 对着已选中的图说：

| 想改什么 | 就这么说 |
| --- | --- |
| 线太细 | `Keep everything identical, but increase the stroke weight of all lines by about 40% so it survives at 16 pixels.` |
| 填色格位置不对 | `Move the single filled cell to the bottom-right corner. Change nothing else.` |
| 太拥挤 | `Keep the same structure but increase the negative space around the mark by 30%. Nothing else changes.` |
| 颜色太艳 | `Desaturate the red to a muted vermilion #C8452F. Keep all shapes and proportions exactly as they are.` |
| 要单色版 | `Convert this mark to a single-color black version on white, removing the accent color entirely while keeping the same shapes.` |
| 要反白版 | `Reverse this mark to pure white on a near-black #141414 background. Keep the geometry identical.` |
| 变风格 | `Redraw the same mark in the style of Japanese family crests (mon): perfect symmetry, hairline uniform strokes, no shading.` |

---

## 七、避坑清单

1. **别在提示词里写 "AI"、"futuristic"、"neural"、"glowing"、"gradient"、"blue"** → 必然撞车成通用 AI logo。
2. **别让 AI 画中文字** → 一定错。图形归 AI，字归字体。
3. **别要"3D 质感 / 玻璃拟态 / 金属"** → 缩小即糊，且印刷塌。
4. **别用细于 1.5px（@1024）的线** → 16px 下必然消失。
5. **别忽略留白** → 图标主体建议占画布 **60–66%**，外圈 1/8 不放内容（Win11 圆角会切）。
6. **别跳过相似度自查** → 定稿后拿图去 Google 图片 / 商标网反向搜一次；与「格致中学」等现有校徽**必须明显不同**（避免被误认为学校官方产品）。
7. **别只存 PNG** → 海报是 0.8×1.1 m，必须矢量。
8. **别把 tagline 塞进 logo** → 那是第三层，单独排版。
9. **别只用颜色区分** → 黑白打印时海报会变成一团。

---

## 八、验收测试（七项，全过才算定稿）

| # | 测试 | 通过标准 |
| --- | --- | --- |
| 1 | 缩到 **16×16** 看 | 仍然认得出是什么 |
| 2 | **纯黑单色**在白底 | 不塌、不缺信息 |
| 3 | **反白**（纯白在 #141414 上） | 清晰、不刺眼 |
| 4 | **灰度打印** | 层级仍可辨 |
| 5 | Windows 任务栏 **24/32px** | 不糊成一团 |
| 6 | 海报尺寸（0.8×1.1 m） | 线宽足够，矢量无锯齿 |
| 7 | 相似度自查 | 与已知 logo 明显不同 |

顺便把 `brand-colors.md` 写出来：主色 `#C8452F` / 墨 `#141414` / 底 `#F7F3EC`，各给 HEX、RGB、CMYK，并注明**允许单色使用**。

---

## 九、生成记录表（合规用，务必填）

竞赛章程 §12 要求：**列明生成式 AI 工具的名称、版本、用途，以及由学生完成的部分。** 建议直接把这个表放进研究报告的「AI 使用说明」一节。

| 日期 | 工具与版本 | 用途 | 提示词编号 | seed / URL | **学生自己做的部分** | 采用 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-__-__ | Midjourney v7 | 草图探索（方向1） | A-01 | seed 12345 | 选稿、定方向 | ✅ |
| 2026-__-__ | Recraft V3 | 矢量化 | A-01 | — | 清理锚点 | ✅ |
| 2026-__-__ | — | **按 3×3 网格手工重绘定稿** | — | — | **全部** | ✅ |
| 2026-__-__ | 思源宋体 | 中文字标排版 | — | — | 字距调整 | ✅ |

> **一条更稳的合规策略**：AI 只用来**出草图、找方向**，最终正稿由学生**按网格重绘成矢量**。
> 这样版权状态确定（不依赖 AI 生成物的版权争议），也守得住章程「作品必须由参赛学生主导完成」的要求——答辩时你能把网格纸和重绘过程一起拿出来。

---

## 附：构图示意

| 文件 | 对应方向 |
| --- | --- |
| `brand\sketches\01-one-cell.svg` | 方向 1 · 一格得解 |
| `brand\sketches\02-break-grid.svg` | 方向 2 · 破格 |
| `brand\sketches\03-tree-graph.svg` | 方向 3 · 格中生木 |
| `brand\sketches\04-seal-lattice.svg` | 方向 4 · 朱印（字形为示意，最终需重绘） |

> 这些 SVG 是**几何构图示意**，不是设计定稿，用浏览器直接打开即可看到比例关系。真正出图时把它们当"我脑子里的样子"的参照，而不是让 AI 照着描。
