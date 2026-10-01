// 格致 · 中文讲义模板（handout）
//
// 用法：
//   typst compile --root . templates/typst/handout.typ 产出/讲义.pdf
// 或在文件开头用 #import 引入并调用 handout.with(...)
//
// 设计约束（来自 P5 验收标准）：
//   - 排版必须由模板决定，模型只决定内容 → 同一份 Markdown 导出两次版式必须一致
//   - 中文不得出现方框（字体栈有回退）
//   - 公式、代码块、表格、页眉页脚、页码都要能正常显示

#import "gezhi.typ": gezhi-fonts, gezhi-sans, gezhi-mono

#let handout(
  title: "未命名讲义",
  subtitle: none,
  author: "格致",
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
    footer: context {
      set text(font: gezhi-sans, size: 8.5pt, weight: "regular", fill: luma(45%))
      align(center)[#author]
    },
  )

  // 标题区
  align(center)[
    #text(font: gezhi-sans, size: 19pt, weight: "bold")[#title]
    #if subtitle != none [
      #v(0.25em)
      #text(font: gezhi-sans, size: 11pt, fill: luma(35%))[#subtitle]
    ]
    #v(0.7em)
    #let meta = ()
    #if subject != none { meta.push("学科：" + subject) }
    #if grade != none { meta.push("年级：" + grade) }
    #if date != none { meta.push("日期：" + date) }
    #if meta.len() > 0 [
      #text(font: gezhi-sans, size: 9pt, fill: luma(40%))[#meta.join("　·　")]
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

// 出处标注 —— 引用强制原则在输出层的体现：每段结论都要能指明来自哪本书哪一页
#let cite(source, page: none) = text(
  font: gezhi-sans,
  size: 8.5pt,
  fill: luma(45%),
)[#source#if page != none [ · 第 #page 页]]
