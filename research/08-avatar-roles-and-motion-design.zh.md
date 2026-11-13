# 格致 · 数字人角色与动作设计（v1）

> **本文不推翻 `research\05-数字人与费曼评分调研.md` §4**——那份调研里的 **8 状态机、`AvatarRenderer` 接口、"不要用 GIF 的 1-bit 透明"、"表情滞后于内容"、"encouraging ≥ confused 的 2 倍"** 全部继续有效。
> 本文只做三件它没做的事：**① 把人设从「AI 老师」改成「学弟」；② 给出可直接跑的 AI 生成提示词；③ 给出 8+1 个状态的动作分解与一条 8 天做得完的生产路线。**

---

## 〇、先定三个决策，其余全是它们的推论

| # | 决策 | 一句话理由 |
| --- | --- | --- |
| **1** | 角色是**「学弟」，不是「老师」** | 老师＝评判者，学生不敢开口；学弟＝被帮助者，**学生变成拥有知识的那个人** |
| **2** | 角色**不是真人**，是几何 / 动物形象 | 降低"被审视感" + 8 天做得完 + 零版权风险 |
| **3** | App 内**不做逐帧动画**，用「切件 + 程序化合成」 | 8 状态逐帧 ≈ 240 张图；切件 ≈ 28 张，**工作量差 8 倍** |

> 第 1 条是地基。把它定错，后面所有细节都会跟着错——所以下一节先把它讲透。

---

## 一、为什么必须是「学弟」——这是整个数字人设计的地基

### 1. 证据链

| 证据 | 结论 |
| --- | --- |
| 【事实】Bastani et al. (2024)：AI 直接给答案的组，考试**低 17%** | 学生不能是"接收方" |
| 【事实】Khanmigo RCT (NBER w35620)：学生只在 **17%** 的做错题场次主动求助 | 问题不在 AI 的能力，在**学生愿不愿意开口** |
| 【事实】arXiv 2412.15226：ChatGPT 当"可教代理"时，学生**纠错能力没有提升**——因为它太准，学生根本没有 debug 的机会 | 对象必须**真的不会**才行 |
| 【事实】Cassell (2022)《Socially Interactive Agents as Peers》与 Ryokai–Vaucelle–Cassell 的 virtual peer 研究：**以「同伴」身份出现的虚拟角色**能提升儿童的叙事与语言学习表现 | "同伴"不是卖萌，是有研究支撑的角色定位 |

### 2. 心理机制：权威反转

- **当对象是「AI 老师」**：学生处在**被评估的位置**。此时人会更少说话、说更安全的话、猜"标准答案"。而费曼法要求他说得**又多又碎又真实**——这两件事直接冲突。
- **当对象是「比你弱一点的学弟」**：学生变成**拥有知识的一方**。他不需要证明自己聪明，只需要让对面听懂。**解释的长度、细节和自我纠正都会自然增加。**

> 所以这不是"把角色画得可爱一点"，而是**把学生从考生位置挪到专家位置**。这一句话，就是整个数字人存在的理由，也是答辩时该说的话。

### 3. 这条决策直接决定了四个细节

| 细节 | 为什么 |
| --- | --- |
| **角色绝不能穿白大褂、戴眼镜、拿教鞭 / 粉笔** | 任何一个"教师符号"都会把学生推回被评估位置 |
| **角色绝不能有评分表情**（没有"点头认可 / 摇头否定"之外的评判动作） | 一旦像考官，"陪练"就变成了"考试" |
| **必须有「不服气」状态**（见 §4） | 学弟不能被一讲就懂，否则整套设计退化成录音机 |
| **角色要能"变笨"**——头顶的格子可以退回空白 | 让"它又不懂了"变成一个可见、可原谅的事实 |

---

## 二、角色设定卡

| 项 | 设定 |
| --- | --- |
| **名字** | **小格**（暂定；「格」直接取自品牌名，也呼应它头上的九宫格） |
| **身份** | 格致里的学弟，比用户低一个年级，**不是 AI、不是助教** |
| **性格** | 好奇、坦率、有点黏人、**会记错**、但**从不评价你** |
| **它不会的事** | 不会评分、不会说"你错了"、不会催、不会拿你和别人比 |
| **口头禅**（配 TTS 用） | 「哦——原来是这样！」（顿悟）／「可是……我觉得 X 也对啊。」（不服气）／「等一下，我上一句没听懂。」（疑惑）／「没事，你再说一遍，我这次认真听。」（鼓励）／「我又忘了……」 |

### ⭐ 外观核心设定：**它头顶有九个小格子**

| 格子状态 | 含义 |
| --- | --- |
| 九个格子全空 | 学弟现在**什么都不会**——学生一眼就看见自己的任务 |
| 亮起 1 格（朱砂红 `#C8452F`） | **懂了一点**（一次 `aha`） |
| 全部亮起 | 这个知识点讲完了 |
| 全部变灰 | 学弟又糊涂了（`skeptical` / `confused`） |

> 🎯 **这一条把品牌的「一格得解」、产品的进度反馈、角色的情绪表达三件事合并成了一个视觉元素。**
> 学生不需要看分数——**他只要看学弟头上亮了几格。** 这是整个设计里最值得写进海报的一笔。

📐 **造型与状态示意**：`research\sketches\xiaoge-states.svg`（浏览器直接打开，一屏看完 待机 / 聆听 / 思考 / 不服气 / 顿悟 五个状态）。那是**几何示意，不是最终美术稿**，用途是让画师和 AI 提示词有个共同参照。

### 为什么用几何形象，而不是动漫人形

1. **降低被审视感**：真人脸（哪怕是画的）自带"评判"暗示；几何小生物不会。
2. **8 天做得完**：人形要处理头发、衣服褶皱、面部肌肉；几何体只有圆角矩形。
3. **零版权风险**：原创几何角色不可能撞脸某个动漫人物；写实立绘很容易"不小心像谁"。
4. **不会丑**：你们自己的调研里写过——**对中学生来说"丑的 3D / 丑的立绘"比"简洁的 2D"更劝退**。几何风格的下限很高。

---

## 三、AI 生成提示词

> **先说清楚 AI 能干什么、不能干什么**：AI 能给你**角色设计**（长什么样、什么表情），**不能给你可用的动画**（帧间一致性保证不了）。所以正确用法是：
> **AI 出设计稿 → 人工描摹成矢量切件 → 程序化合成动画。**
> 只有用 **Ideogram / 即梦 Seedream / GPT-image** 时才让它碰文字，其余一律 `no text`。

---

### 路线 A（**推荐**）「小格」——几何格子小人

**概念**：一个由圆角方块拼成的小生物，用你们 logo 的「墨 + 朱 + 纸白」三色，头顶浮着九宫格。

**英文提示词**

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

**中文提示词（即梦 / Seedream）**

```
角色设计三视图：一个可爱的教育类吉祥物，由圆角方块拼成的小生物。身体是一个圆角正方形，
暖白色 #F7F3EC，配粗墨黑 #141414 描边；两只大大的圆眼睛、一个简单的弧形微笑；
两条短短的圆角矩形手臂和两条短腿；头顶上方悬浮着一个九宫格——九个小方格，目前全是空的。
风格：扁平矢量插画、极简、线条粗细一致且圆角，只用三种颜色（墨黑 #141414、暖白 #F7F3EC、
一点朱砂红 #C8452F 作点缀），无阴影、无渐变、无高光、无质感。
排版：中央一个大正面图，旁边配小的正面/四分之三侧/侧面视图；底部一排六个表情
（平静、聆听、思考、疑惑、开心、鼓励）。纯白背景，间距均匀，留白充足。
不要任何文字、标签、字母、数字、水印；不要立体、不要写实、不要日系动漫、不要复杂细节。
```

**翻车点**：① 不写 `no robot` 会滑向"科技机器人"，那就又变回"AI 老师"了；② 不写 `no shading` 一定会给你加渐变高光，切件时没法用；③ 九宫格容易被画成随机方块，要多抽几张。

---

### 路线 B（**最保险**）「阿知」——刚破壳的幼鸟

**概念**：一只羽毛还没长齐的小鸟，"学飞"天然等于"还没学会"，学弟感是免费的。

**英文提示词**

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

**优点**：表情夸张好读、动画好做、"笨"天然不冒犯。**缺点**：动物吉祥物太常见，品牌辨识度不如路线 A。

---

### 路线 C（效果最好，但 **8 天做不完**）半写实少年

不推荐现在做，理由：需要处理头发/衣褶/面部肌肉的逐帧一致性，AI 生成的多帧一定会闪；且"像真人的同学"会重新引入被审视感。**留到 v2。**

---

### 三·补 两个必备的补充提示词

**① 表情表（一次出 9 个表情，保证同一角色）**

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

**② 口型帧（5 个，直接对接你们已有的 viseme 方案）**

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

## 四、动作表：8 + 1 个状态，每个做什么

**素材规格**：画布 **400×400 透明 PNG**（App 内显示 200–280 CSS px，@2x）；角色占画布 **80%**，四周留 10% 边距给跳跃和歪头。**帧率 12 fps**（循环态）／**15 fps**（单次动作）。

| # | 状态 ID | 类型 | 时长 | 帧数 | **动作分解（照着做）** | 触发条件 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `idle` | 循环 | 2.5 s | 30 | 呼吸：整体上下 ±2 px 正弦；眨眼：每 3–5 秒一次，闭眼 2 帧；循环末尾轻微歪头 3° 再回正 | 默认 |
| 2 | `listening` | 循环 | 2 s | 24 | 身体前倾 5°；头向学生一侧转 8°；每 1.5 秒点一次头（4°）；眼睛比 idle 睁大 10% | VAD 检测到学生在说 |
| 3 | `thinking` | 循环 | 2.5 s | 30 | 头歪 12°；眼睛向右上看；**头顶格子里有一格在闪烁**（转圈感） | 已提交 LLM，等首个 token |
| 4 | `speaking` | 循环 | — | 5 口型帧 | 口型由 TTS 字级时间戳驱动的 5 个 viseme；身体随音节上下 ±1 px | TTS 播放期间 |
| 5 | `confused` | 单次 | 1.2 s | 15 | 头歪 15°；**眉毛一高一低**；眼睛眯起；头顶九格全部变灰；身体左右轻摆 | 学生讲得模糊、没讲清 |
| 6 | ⭐ `skeptical` | 单次 | 1.5 s | 18 | **眉毛上挑；一只眼眯起；摇头两次（±6°）；头顶九格全部退回空白** | 学生讲完了，但学弟的误解**没被消除** |
| 7 | ⭐ `aha` | 单次 | 1.2 s | 15 | **眼睛瞬间睁大到 130%；向上弹跳 8 px；头顶亮起一格朱砂红 `#C8452F`；双手举起** | 误解被消除 / 费曼分上升 |
| 8 | `encouraging` | 单次 | 1.5 s | 18 | 温和微笑；缓慢点头两次；一只手向前伸（"没关系"）；**头顶格子保持原样，不做任何评价** | 学生讲错之后（**必须先于 `confused`**） |
| 9 | `offline` | **静态** | — | 1 | **不做动画**：同一张图 + CSS 灰度 60% + 透明度 50% + 闭眼，旁边一个小断线图标 | 网络 / 服务不可用 |

---

## 五、为什么这么设计（逐条给理由）

### ① 「不服气」是整个设计里最重要的一个状态

如果学弟**一讲就懂**，学生做的事就退化成"对着录音机讲话"——他会开始敷衍、跳步骤、说"反正你懂了"。

【事实】arXiv 2412.15226 已经用实验证明了这一点：ChatGPT 当可教代理时，因为**它总是直接给出正确代码，学生完全没有 debug 的机会，纠错能力没有提升**。

> **学弟"不服气"的存在本身就是产品主张。** 它逼学生面对一个问题：
> *"我以为我讲清楚了，但他还是不明白——那到底是哪一句没说对？"*
> 这个问题，就是费曼学习法真正起作用的地方。

### ② `aha` 必须"亮起一格朱砂红"

- **品牌层**：直接呼应 logo 的「一格得解」——九个方格里亮一格。
- **心理层**：【事实】你们自己的调研里已经写了——**Δ > 0 时数字人必定播放开心动画，这是把评分变成正反馈的关键**。
- **产品层**：它给了学生一个**不需要看分数的进度条**。九格填满 = 这个知识点讲完了。

### ③ `encouraging` 必须先于 `confused`，且触发频率 ≥ 2 倍

这条你们文档里已经有了，这里只说为什么它和"学弟"人设是同一件事：
**答错时先共情、再一起找问题**——如果一答错就立刻 `confused`，角色就变成了考官。
而"学弟"人设天然支持这一点：**学弟听不懂是学弟的问题，不是你的问题**，所以共情是真诚的，不是安慰话术。

### ④ `idle` 必须有微动作，不能完全静止

【事实】你们文档里写过：思考态超时（>10 s）时不要让学生**对着一个僵住的角色**等。
完全静止的角色会被感知为"卡住了 / 崩了"。所以 `idle` 的呼吸 + 眨眼 + 偶尔歪头**不是装饰，是"我还活着"的信号**。

### ⑤ `offline` 不做动画——省时间，而且效果更好

灰度 + 闭眼 + 断线图标，本身就完整传达了"离线"。
**把 8 天里的时间花在 `skeptical` 和 `aha` 上，而不是花在一个没人想看到的错误状态上。**

### ⑥ 为什么不做逐帧动画

见下一节——这是 8 天能不能做完的分水岭。

---

## 六、⭐ 关键工程决策：不要逐帧画，用「切件 + 程序化合成」

### 两种做法的工程量对比

| 做法 | 需要画多少张 | 8 天可行性 |
| --- | --- | --- |
| 逐帧动画（8 状态 × 约 30 帧） | **≈ 240 张** | ❌ 不可能 |
| **切件 + 程序化合成** | **≈ 28 张** | ✅ 可行 |

### 切件清单（PSD / Aseprite 分层，导出为独立透明 PNG）

```
body.png                    身体 + 头（整体，1 张）
head.png                    头（可独立旋转 → 点头 / 歪头，1 张）
eyes/    open · half · closed · happy(月牙) · up · wide · squint        7 张
brows/   neutral · up · worried · one_raised                            4 张
mouth/   m0 闭合 · m1 小开 · m2 半开 · m3 大张 · m4 圆                    5 张
grid/    empty · gray · blink · 1格亮 … 9格亮                            12 张
```

### 合成逻辑（伪代码）

```js
// 眨眼：定时器切换眼睛切件
setInterval(() => swap(eyes, 'closed', 120), 3000 + Math.random() * 2000);

// 呼吸：requestAnimationFrame 正弦
bodyOffsetY = Math.sin(t / 1200) * 2;

// 点头 / 歪头：只旋转 head 图层
head.rotate = state === 'listening' ? nod(t) : 0;

// 口型：沿用你们已有的 TTS 字级时间戳方案（拼音韵母 → 5 个 viseme）
mouth = visemeMap[phoneme.vowel];
```

> **这套方案和你们的 `AvatarRenderer` 接口天然吻合**：`setState()` 内部换成"改哪几个图层"，`setMouthOpenY()` 换成"切哪张口型图"，**将来换 Live2D / VRM 时接口一行都不用改**。

### 生产流程（8 天版）

| 天 | 做什么 | 产出 |
| --- | --- | --- |
| D1 | 用 §3 提示词出角色设计，选稿 | 1 张定稿设计图 |
| D2 | 出表情表 + 口型帧 | 9 表情 + 5 口型参考 |
| D3 | **人工描摹成矢量**（Figma / Illustrator / Aseprite） | 矢量源文件 |
| D4 | 导出切件 | ≈ 28 张 PNG |
| D5 | 前端合成（眨眼 / 呼吸 / 点头 / 口型） | 能动的角色 |
| D6 | 接 8 状态机 + `AvatarRenderer` | 全部状态可切 |
| D7 | 录 3 个 GIF（见下节） | 演示素材 |
| D8 | 进演示视频 / 海报 / PPT | — |

> ⚠️ **D3 是必须人工做的一步**：AI 给的图**没有分层**，不能直接切件。而且这一步同时守住了竞赛章程的「学生主导完成」要求——**答辩时你能把描摹过程拿出来。**

---

## 七、GIF 要不要做？——要，但只做 3 个，而且**用纯色背景**

### 先分清两种用途（这是 90% 的人会搞混的地方）

| 用途 | 用什么 | 为什么 |
| --- | --- | --- |
| **App 界面内** | **动画 WebP**，不要 GIF | GIF 的透明通道只有 **1-bit**（像素非全透即全不透）→ 角色边缘出现白边/锯齿。**这是你们文档里已经论证过的结论，继续遵守** |
| **演示材料**（≤5 分钟示范影片、海报、PPT） | **GIF 完全可以** ⭐ | 因为演示材料里角色是**放在纯色底上**的——**1-bit 透明的问题只在"叠加到复杂背景"时才出现**。纯色底上 GIF 和 WebP 肉眼无差别，而 GIF 兼容性最好、能直接拖进 PPT 和剪辑软件 |

> **所以答案是：做 3 个 GIF 给演示材料用；App 内继续走 WebP / 切件。**

### GIF 规格

| 项 | 建议值 |
| --- | --- |
| 尺寸 | **480 × 480**（视频里缩放用；不大不小） |
| 背景 | **纯色宣纸白 `#F7F3EC`**（不要透明——透明就会露出白边） |
| 帧率 | 12 fps（循环态）／15 fps（单次动作） |
| 时长 | 2–4 秒，**循环播放** |
| 循环 | 首尾帧必须能接上（单次动作做"出去→回来"闭环） |
| 单文件 | < 2 MB |

### 录哪 3 个（按"讲故事的能力"排序）

| 优先 | 状态 | 为什么录它 |
| --- | --- | --- |
| ⭐⭐⭐ | **`aha`** | 演示视频的高光时刻——**头顶亮起一格朱砂红**，一眼看懂"一格得解"。评委记住的就是这一秒 |
| ⭐⭐⭐ | **`skeptical`** | 它证明"这不是又一个 AI 助手"。学弟摇头说"可是我觉得 X 也对啊"→ 学生必须说服他。**这是产品的差异化本身** |
| ⭐⭐ | **`listening`** | 点头、侧耳——展示"它在听我讲"，最能传达"学生当老师"的关系 |
| 可选 | `idle` | 如果海报/PPT 需要一个"活着"的角色 |

> **不要录 `offline`，不要录 `speaking`**（`speaking` 没有真实语音时看着很怪）。

---

## 八、验收清单（做完对着勾）

- [ ] 角色**没有任何教师符号**（白大褂、眼镜、教鞭、讲台、书本举过头顶）
- [ ] 头顶九宫格在 `idle` 时**全空**——学生一眼能看出目标
- [ ] `aha` 时**恰好亮一格**，颜色是朱砂红 `#C8452F`（与 logo 完全一致）
- [ ] `skeptical` 时九格**全部退回空白**（"我又不懂了"）
- [ ] `encouraging` 的触发频率 **≥ `confused` 的 2 倍**
- [ ] 答错时先播 `encouraging`，再播 `confused`（**绝不颠倒**）
- [ ] `idle` 有呼吸 + 眨眼，**不会完全静止**
- [ ] 素材是 **400×400 透明 PNG @2x**，角色占 80%
- [ ] 主色只有三种：墨 `#141414` / 纸白 `#F7F3EC` / 朱 `#C8452F`
- [ ] App 内用 **WebP**；GIF 只出现在演示材料里且是**纯色底**
- [ ] 所有素材来源与 License 记进 `ASSETS_LICENSE.md`

---

## 附、版权与合规（沿用你们文档的红线，不重复论证）

1. **绝对不要**从网上搜"动漫 GIF"直接用——中学生产品一旦被投诉很难看。
2. **不要**用知名 IP 角色。素材站标"免费"可能只是"可免费使用"，不等于"可商用 / 可再分发"。
3. 逐个核对三件事：能否**商用**、是否要求**署名**、是否允许**修改**。
4. **本方案的角色是原创几何 / 动物形象 + AI 生成设计稿 + 学生手工描摹**，版权风险最低的一档。保留 AI 生成的 prompt、模型、日期作为创作过程记录。
5. ⚠️ **AI 生成素材的版权状态各地不一致**，商业化前建议咨询；参赛场景下至少要把生成记录留全——这也是竞赛章程 §12「列明 AI 工具名称、版本、用途」的要求。

---

## 附录：动画 WebP 到底是什么？为什么不用 GIF？

### 一句话

**动画 WebP 就是「GIF 的现代替代品」**——Google 的 WebP 图片格式支持了多帧动画，把 GIF 的两个老毛病（透明只有 1 位、颜色只有 256 色）都修好了。

### 技术本质

- 容器是 **RIFF**（和 WAV / AVI 同族）；
- **每一帧**可以独立选择**有损压缩（VP8）**或**无损压缩（VP8L）**；
- 支持逐帧显示时长、循环次数，还支持**子矩形更新**——只有变化的区域重新编码，所以体积小；
- ⚠️ 和 GIF 一样**不支持音频**。

### 和 GIF / APNG 的对比（这是关键）

| | **GIF** | **动画 WebP** | APNG |
| --- | --- | --- | --- |
| 透明通道 | ⚠️ **1-bit**（像素非全透即全不透） | ✅ **8-bit（256 级）** | ✅ 8-bit |
| 颜色数 | 256 色 | **1677 万色（24-bit）** | 1677 万色 |
| 体积 | 大 | ⭐ **通常比等效 GIF 小 30–70%** | 中 |
| Chromium / Electron | ✅ | ✅ **原生支持** | ✅ |
| PowerPoint | ✅ 会动 | ⚠️ 见下 | ⚠️ 见下 |

### 为什么这对数字人是决定性的

**GIF 的 1-bit 透明意味着：角色边缘的每个像素要么完全不透明、要么完全透明，没有中间过渡。**
结果就是角色贴到 App 界面上时，**边缘出现难看的白边和锯齿**——这正是你们调研文档里写的"在中学生审美里是廉价感的头号来源"。

WebP 的 8-bit alpha 让边缘有 256 级过渡，**抠图边缘是干净的**。

### ⚠️ 谁支持、谁不支持（实操要点）

| 环境 | 动画 WebP |
| --- | --- |
| **Electron / Chromium（你们的 App）** | ✅ 原生支持，`<img src="x.webp">` 直接就能动，**不需要额外 JS 库** |
| Chrome / Edge / Firefox / Safari 14+ | ✅ |
| **PowerPoint 桌面版** | ⚠️ 能插入 WebP 图片，但**动画 WebP 不要指望它会播放** |
| **PowerPoint 在线版 / Google Slides** | ❌ **完全不支持 WebP**（截至 2025-10 的公开资料） |

> **这条直接印证了 §7 的结论**：
> **App 内用动画 WebP**（要透明、要小、要干净边缘）；
> **PPT / 演示视频 / 海报用 GIF**（要的是"到处都能放、拖进去就会动"）。
> 两者不是二选一，是**按用途分工**。

### 怎么做出来（按你们的情况排序）

| 方法 | 说明 |
| --- | --- |
| ⭐ **Aseprite 直接导出** | 逐帧画完后直接导出 animated WebP，一步到位（你们调研里已经选了 Aseprite） |
| **ezgif.com**（在线） | 上传 GIF / PNG 序列 → 一键转 WebP，**免安装**——你们 shell 环境目前不可用，这条最现实 |
| `gif2webp` / `img2webp` | Google libwebp 官方命令行工具，批量转换最合适（等 shell 恢复再用） |
| `ffmpeg -i in.gif -c:v libwebp_anim -loop 0 out.webp` | 有 ffmpeg 的话一行搞定 |
| ScreenToGif | Windows 上录屏导出，支持 WebP |

### 使用方式

```html
<!-- 就这么简单，浏览器原生就会播 -->
<img src="assets/xiaoge-idle.webp" alt="学弟待机">
```

### ⚠️ 一条仍未验证的风险（沿用你们调研文档的标注）

8 个状态的动画 WebP **同时预加载时的内存占用，本机未实测**。建议 PoC 阶段用 Electron 实测一遍；如果内存偏高，退路是：只预加载当前状态 + 相邻状态，其余懒加载。

---

## 参考

1. Cassell, J. (2022). *Socially Interactive Agents as Peers.* In The Handbook on Socially Interactive Agents, Vol. 2, ACM, pp. 331. https://doi.org/10.1145/3563659
2. Ryokai, K., Vaucelle, C., & Cassell, J. (2003). Virtual Peers as Partners in Storytelling and Literacy Learning. *Journal of Computer Assisted Learning.* http://www.justinecassell.com/CC_Winter05/pdfs/ryokai_virtual.pdf
3. Bastani, H., et al. (2024). *Generative AI Can Harm Learning.* SSRN. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4895486
4. Oreopoulos, P., & Low, N. (2026). *One Click Away: AI Tutoring with Khanmigo in a Two-Year School Experiment.* NBER w35620. https://www.nber.org/papers/w35620
5. *Learning by Teaching with ChatGPT: The Effect of Teachable ChatGPT Agent on Programming Education.* arXiv:2412.15226. https://arxiv.org/abs/2412.15226
6. Rogers, et al. (2025). *Playing Dumb to Get Smart.* CHI 2025. https://doi.org/10.1145/3706598.3713644

> 其余证据（Bastani 的具体数字、Khanmigo 的 17%、纠错能力实验）的完整出处与限制条件，见 `research\07-学习法融入与证据.md` 第九节。
