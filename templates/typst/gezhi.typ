// 格致 · Typst 公共样式与字体栈
//
// 为什么 PDF 这条线用 Typst 而不是 JavaScript 拼：
//   中文排版（断行、标点挤压、字体嵌入、公式、页码、目录）在 Typst/LaTeX 里有
//   十几年积累，Node 生态没有等价物。硬用 JS 拼出来的版式每次都不一样，不能当交付物。
//
// ⚠⚠ 字体血泪教训（本机实测，务必照做）：
//
//   1) 本机的中文字体里有**可变字体（Variable Font）**：
//        Noto Sans SC  → NotoSansSC-VF.ttf   Weight: 100-900，**Default: 100**
//        Noto Serif SC → NotoSerifSC-VF.ttf  Weight: 200-900，**Default: 200**
//      实测：**Typst 0.15.1 在这台 Windows 上无法实例化它们**，
//      无论写 weight: "regular" 还是 weight: 400，嵌进 PDF 的始终是
//      NotoSansSC-Thin / NotoSerifSC-ExtraLight —— 中文正文细到几乎看不清，
//      而且**不报任何错**，只有去查嵌入字体才发现。
//      → 结论：**字体栈里不要放 Noto Serif SC / Noto Sans SC**。
//
//   2) 换用静态字体后字重正常。实测对照（渲染成图逐行看粗细）：
//        DengXian（等线）  regular/bold 粗细分明、字形清秀  ← 正文首选
//        Microsoft YaHei   regular/bold 区分清楚          ← 标题首选
//        SimSun / SimHei / KaiTi / STSong                 可用，SimSun 偏细
//
//   3) 即便如此，**正文仍显式写 weight: "regular"，标题写 "bold"**，别省。

// 字体栈按优先级排列。注意：**只列本机真的装了的字体** —— 列了没装的会刷
// "unknown font family" 警告（不影响输出，但会淹没真正的错误）。
// 跨平台时再按需追加 mac 的 PingFang SC / Songti SC。

// 中文正文：等线 → 微软雅黑 → 宋体
#let gezhi-fonts = (
  "DengXian",
  "Microsoft YaHei",
  "SimSun",
)

// 中文标题 / 无衬线：微软雅黑 → 黑体 → 等线
#let gezhi-sans = (
  "Microsoft YaHei",
  "SimHei",
  "DengXian",
)

// 代码
#let gezhi-mono = (
  "Cascadia Code",
  "Consolas",
  "DejaVu Sans Mono",
)


