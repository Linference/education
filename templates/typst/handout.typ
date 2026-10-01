// 中文讲义模板（handout）
//
// 用法：
//   typst compile --root . templates/typst/handout.typ 产出/讲义.pdf
// 或在文件开头用 #import 引入并调用 handout.with(...)
//
// ★ 输出物必须干净（产品要求）：
//   生成的 PDF / Word / Markdown **不得出现任何产品署名** ——
//   页脚不要、结尾不要、页眉不要、注释里也不要。
//   学生拿到的应当是"自己的文档"，不是"某某软件生成的文档"。
//   所以本模板默认不写作者、不写品牌；`author` 参数保留但**默认空**，
//   只有调用方显式传入（例如学生填自己的名字）才会出现在页脚。
//   ⚠ 这条只约束**产出物**；代码注释、仓库文档里出现项目名是正常的。
//
// 设计约束：
//   - 排版必须由模板决定，模型只决定内容 → 同一份 Markdown 导出两次版式必须一致
//   - 中文不得出现方框（字体栈有回退）
//   - 公式、代码块、表格、页码都要能正常显示

#import "gezhi.typ": gezhi-fonts, gezhi-sans, gezhi-mono

#let handout(
  title: "未命名讲义",
  subtitle: none,
  author: none,          // ← 默认空：不署名、不水印
  subject: none,
  grade: none,
  date: none,
  body,
) = {
  // weight 必须显式写 "regular"：否则 Typst 可能挑到 Thin/ExtraLight 那一档
  set text(font: gezhi-fonts, size: 10.5pt, weight: "regular", lang: "zh", region: "cn")
  set par(justify: true, leading: 0.82em, first-line-indent: 0em)
  set page(
    paper: "a4",
    margin: (x: 2.2cm, y: 2.4cm),
    // 页眉只留标题与页码 —— 标题是学生的内容，页码是实用信息，都不是品牌
    header: context {
      let page-num = counter(page).get().first()
      if page-num > 1 {
        set text(font: gezhi-sans, size: 8.5pt, weight: "regular", fill: luma(40%))
        grid(
          columns: (1fr, auto),
          align: (left, right),
          [#title],
          [#page-num],
        )
        v(-0.6em)
        line(length: 100%, stroke: 0.4pt + luma(80%))
      }
    },
    // 页脚：只在调用方显式给了 author 时才显示（默认完全没有页脚）
    footer: if author == none { none } else {
      context {
        set text(font: gezhi-sans, size: 8.5pt, weight: "regular", fill: luma(45%))
        align(center)[#author]
      }
    },
  )

  // 标题区
  // 注意：不写"学科/年级"这类分类行 —— 知识点本身不该被文理分科框住，
  // 需要标注的时候用副标题自由表达（例如"函数单调性 · 含例题与易错点"）。
  align(center)[
    #text(font: gezhi-sans, size: 19pt, weight: "bold")[#title]
    #if subtitle != none [
      #v(0.25em)
      #text(font: gezhi-sans, size: 11pt, fill: luma(35%))[#subtitle]
    ]
    #if date != none [
      #v(0.4em)
      #text(font: gezhi-sans, size: 9pt, fill: luma(45%))[#date]
    ]
  ]
  v(1.1em)
  line(length: 100%, stroke: 0.6pt + luma(70%))
  v(0.9em)

  body
}

// 术语/要点提示框 —— 讲义里常用
#let tip(title: "提示", body) = block(
  width: 100%,
  inset: (x: 0.9em, y: 0.7em),
  radius: 3pt,
  stroke: (left: 2.5pt + rgb("#0969da")),
  fill: rgb("#f2f7fd"),
)[
  #text(font: gezhi-sans, weight: "bold", fill: rgb("#0a3069"))[#title]
  #v(0.35em)
  #body
]

// 易错点 —— 复习场景用
#let pitfall(title: "易错", body) = block(
  width: 100%,
  inset: (x: 0.9em, y: 0.7em),
  radius: 3pt,
  stroke: (left: 2.5pt + rgb("#cf222e")),
  fill: rgb("#fdf3f3"),
)[
  #text(font: gezhi-sans, weight: "bold", fill: rgb("#a40e26"))[#title]
  #v(0.35em)
  #body
]

// 出处标注 —— 引用强制原则在输出层的体现。
// 这里写的是**教材书名与页码**，不是产品名 —— 学生要能拿着这一行去翻书核对。
#let cite(source, page: none) = text(
  font: gezhi-sans,
  size: 8.5pt,
  fill: luma(45%),
)[#source#if page != none [ · 第 #page 页]]

// ------------------------------------------------------------------
// 以下组件是为了满足"知识点必须详细"这条要求。
// 一个知识点只有定义是不够的：推导、例题、易错、对比、自测都要有位置放。
// 用法上让 AI 按需选用，而不是每篇都堆满 —— 但**不许只写提纲**。
// ------------------------------------------------------------------

/// 推导过程：逐步展开，每步都要有理由
#let derive(title: "推导", body) = block(
  width: 100%,
  inset: (x: 0.9em, y: 0.7em),
  radius: 3pt,
  stroke: (left: 2.5pt + rgb("#8250df")),
  fill: rgb("#faf5ff"),
)[
  #text(font: gezhi-sans, weight: "bold", fill: rgb("#6639ba"))[#title]
  #v(0.35em)
  #body
]

/// 例题：题干 + 解答分开，便于"先自己做再看答案"
/// 注意：stem 是**位置参数**，签名里必须排在所有具名参数之前 ——
/// Typst 不允许用 `stem:` 这种方式给位置参数传值（报 "the argument `stem` is positional"）。
#let example(
  stem,
  title: "例",
  solution: none,
) = block(
  width: 100%,
  inset: (x: 0.9em, y: 0.7em),
  radius: 3pt,
  stroke: (left: 2.5pt + rgb("#1a7f37")),
  fill: rgb("#f6fdf8"),
)[
  #text(font: gezhi-sans, weight: "bold", fill: rgb("#116329"))[#title]
  #v(0.35em)
  #stem
  #if solution != none [
    #v(0.5em)
    #text(font: gezhi-sans, size: 9pt, fill: luma(45%))[解答]
    #v(0.2em)
    #solution
  ]
]

/// 对比表：容易混淆的概念并排看（例如 must vs may、正弦定理 vs 余弦定理）
#let compare(headers, rows) = table(
  columns: headers.len(),
  align: (left, left, left),
  stroke: 0.4pt + luma(75%),
  inset: 6pt,
  table.header(..headers.map(h => text(font: gezhi-sans, weight: "bold")[#h])),
  ..rows.flatten(),
)

/// 自测：留空白让学生自己写（导出 PDF 时可以直接打印来用）
#let selfcheck(items) = block(
  width: 100%,
  inset: (x: 0.9em, y: 0.7em),
  radius: 3pt,
  stroke: (left: 2.5pt + rgb("#9a6700")),
  fill: rgb("#fffdf5"),
)[
  #text(font: gezhi-sans, weight: "bold", fill: rgb("#7d4e00"))[自测]
  #v(0.35em)
  #enum(..items)
]
