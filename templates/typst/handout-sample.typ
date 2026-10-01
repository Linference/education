// PDF 产线验收样张（示例文件，用于验证模板能力）
//
// 目的：一次性验证中文 PDF 产线的全部关键项 ——
//   中文不断字/不出方框、公式、代码块、表格、列表、页码、
//   出处标注、提示框、推导块、例题块、对比表、自测
//
// ★ 同时验证「输出物必须干净」这条产品要求：
//   本文件编译出来的 PDF 里**不应出现任何产品署名**（页脚、结尾、水印都没有）。
//   验收方式：编译后搜 PDF 文本，不该命中项目名。
//
// 编译：typst compile --root . templates/typst/handout-sample.typ 产出/讲义样张.pdf

#import "handout.typ": handout, tip, pitfall, cite, derive, example, compare, selfcheck
#import "gezhi.typ": gezhi-sans, gezhi-mono

#show: handout.with(
  // 注意：Typst 的字符串**没有转义符**，双引号里不能再出现双引号。
  // 需要内嵌引号时用原始字符串 #"..."#，或直接用中文引号「」。
  title: "情态动词：从「必须」到「推测」",
  subtitle: "含推导、例题、易错点与自测",
  date: "2026 年 10 月",
)

= 一、为什么要单独学情态动词

情态动词（modal verbs）不表示动作本身，而表示说话人对动作的*态度*：是必须、是可能、
是允许，还是推测。同一个动作配上不同的情态动词，句子的意思会完全不同：

#align(center)[
  #text(size: 11pt)[
    You *must* be tired.　→　你一定累了。（有把握的推测）\
    You *may* be tired.　→　你可能累了。（把握不大）\
    You *can't* be tired.　→　你不可能累。（否定的推测）
  ]
]

这一组例句说明了本讲的核心：*情态动词的难点不在词形变化，而在语义强度与语境*。

#tip(title: "一句话抓住重点")[
  情态动词的「时态」变化极少，真正的考点是*语气强弱*与*推断依据*。
  考试里失分，九成不是因为不会变形，而是因为分不清 `must` 与 `may` 的把握程度。
]

= 二、表示推测的三种强度
#table(
  columns: (auto, auto, 1fr),
  align: (left, left, left),
  stroke: 0.4pt + luma(75%),
  inset: 6pt,
  table.header([*情态动词*], [*把握程度*], [*典型语境*]),
  [`must`],   [高（约 90% 以上）], [有充分证据的肯定推断；只用于肯定句],
  [`may` / `might`], [中／低], [`might` 比 `may` 更不确定],
  [`can't`],  [高（否定方向）], [`must` 的否定推测形式，不能用 `mustn't` 代替],
)

#pitfall(title: "最常错的一点")[
  `mustn't` 表示*禁止*，不是「不可能」。表示「不可能」要用 `can't`。

  #v(0.3em)
  #grid(
    columns: (1fr, 1fr),
    [✓ He `can't` be at home.　（他不可能在家）],
    [✗ He `mustn't` be at home.　（× 不表示推测）],
  )
]

= 三、形式化：用概率写清楚

如果把「把握程度」写成一个条件概率，情态动词的差别就变成了数值区间。
这一节是*同一个知识点的另一种表示* —— 详细的意思就包括：概念不止一种讲法。

$ P("事实" divides "证据") = frac(P("证据" divides "事实") P("事实"), P("证据")) $

#derive(title: "为什么可以这样理解")[
  + 设「事实」为待判断的命题，「证据」为观察到的现象
  + 说话人实际在做的是估计 $P("事实" divides "证据")$，即*在看到证据之后*的相信程度
  + `must` 对应这个值接近 1；`may` 对应中等；`might` 更低
  + 注意：这只是一种理解方式，*不能反推* —— 英语表达不等于精确概率
]

- `must`　→ 后验概率接近 1，且要求先验不为零
- `may`　 → 后验概率在 0.3–0.6 之间
- `might` → 比 `may` 更低，且常带"我不确定"的元语气

#cite("普通高中教科书·英语（必修）", page: 87)

= 四、对比：三个最容易混的

#compare(
  ([ ], [肯定方向], [否定方向]),
  (
    ([义务], [`must` 必须], [`mustn't` 禁止]),
    ([许可], [`can` / `may` 可以], [`can't` / `mustn't` 不可以]),
    ([推测], [`must` 一定], [`can't` 不可能]),
  ),
)

#example(
  [门开着，屋里的灯也亮着 —— 用 `must` / `may` / `can't` 各说一句。],
  title: "例 1",
  solution: [
    + `He must be at home.`　灯亮门开，有明确证据 → 高把握
    + `He may be at home.`　只看到门开着，也可能是忘了关 → 中等把握
    + `He can't be at home.`　他刚发了在外地旅游的照片 → 排除
  ],
)

= 五、用代码描述判定规则

把语义强度写成可执行的规则，能帮助学生自查是否真正理解 ——
"你能不能把自己的理解写成规则"，正是费曼学习法要问的问题：

```python
def infer_strength(evidence_ratio: float, negative: bool = False) -> str:
    """根据证据强度选择合适的推测性情态动词。"""
    if negative:
        return "can't" if evidence_ratio > 0.8 else "may not"
    if evidence_ratio > 0.85:
        return "must"
    if evidence_ratio > 0.5:
        return "may"
    return "might"
```

#selfcheck((
  [用 `must` / `may` / `can't` 各造一句，描述你此刻对窗外天气的推断。],
  [把同学写的句子拿来判断：他用的是推测，还是"义务"？],
  [用一句话向小学生解释 `must` 与 `may` 的区别。],
))
