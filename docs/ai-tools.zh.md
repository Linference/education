# AI 助手可用的工具

这份文档给**在格致里干活的 AI 助手**看。它描述了你能直接调用哪些命令，
免得你为了一个"导出 PDF"去绕远路（比如先生成 HTML、再让用户自己去浏览器打印）。

## 一句话

格致已经内置了排版引擎。**要 PDF 就直接生成 PDF，不要输出 HTML 让用户自己打印。**

---

## `scripts/md2pdf.mjs` —— Markdown 转 PDF

**什么时候用**：用户要一份 PDF，或者要"把这份内容做成能打印/能交的文档"。

**用法**：

```bash
node scripts/md2pdf.mjs <输入.md> [输出.pdf]
```

不写输出路径时，PDF 与输入文件同目录同名。

**例**：

```bash
node scripts/md2pdf.mjs "报告.md"
node scripts/md2pdf.mjs "报告.md" "产出/报告-终稿.pdf"
```

**它背后是什么**：

```
Markdown → (md2typst) → Typst 源码 → (内置 typst.exe) → PDF
```

- 中文排版（断行、标点挤压、字体嵌入）由 Typst 处理，效果接近 LaTeX
- 数学公式：Markdown 里写 `$...$` 或 `$$...$$`，会自动转成 Typst 公式
- 表格、引用、目录都支持
- **产物不含任何产品署名**（这是产品硬规矩：学生拿到的应当是自己的文档）

**实测**：4 页、带目录与表格的中文文档，0.3 秒生成 278 KB。

---

## 为什么不要用 HTML → PDF

格致里也有 `scripts/html2pdf.mjs`（用系统的 Chrome/Edge 打印），
但那**只在一种情况下才该用**：用户明确要求"HTML 的样式必须原样保留"，
比如已经做好的网页版排版。

对比：

| | `md2pdf.mjs`（推荐） | `html2pdf.mjs` |
|---|---|---|
| 输入 | Markdown，易于修改 | HTML，改起来啰嗦 |
| 排版 | Typst，专业中文排版 | 浏览器打印，取决于 CSS |
| 公式 | 原生支持 | 要用 KaTeX/MathJax |
| 适用 | **绝大多数情况** | 已定稿的网页版式 |

---

## `scripts/html2pdf.mjs` —— HTML 转 PDF

```bash
node scripts/html2pdf.mjs <输入.html> [输出.pdf]
```

- 自动找 Chrome / Edge（PATH → 常见安装位置）
- 用无头浏览器打印，A4、无页眉页脚
- 想指定浏览器可设环境变量 `GEZHI_BROWSER`

---

## 关于文件权限

如果你在某个目录里**所有命令都失败**，报错类似
`SetNamedSecurityInfoW failed (Win32 5)`，那是 Windows 文件权限的问题，
不是你的命令写错了。把遇到的情况和目录路径告诉用户，
让他把这个会话切到「完全权限」再试。

---

## 写在最后

**先看已有的工具，不要急着自己造。**

格致里已经有的能力：
- Markdown → PDF / Word（`scripts/md2pdf.mjs`、导出链路）
- PDF 查看（内置查看器）
- 全文检索与反向链接（索引器）
- Office 文档高保真查看（LibreOffice 转换，见 `main/lib/soffice.cjs`）

如果缺什么工具，直接告诉用户，而不是用一堆 HTML 兜圈子。
