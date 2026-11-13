# ⚠️ 中文参考版 —— 仅供内部使用，切勿提交

## 这两份文件是什么

| 文件 | 页数 | 用途 |
| --- | --- | --- |
| `ProjectIntroduction_Gezhi_中文.pdf` | 2 | 与英文版结构一一对应的中文稿 |
| `ResearchReport_Gezhi_中文.pdf` | 10 | 同上 |

它们是英文正式稿的**中文对照版**，供：指导老师审阅、队内讨论、答辩前梳理逻辑、以及准备中文讲解时使用。

## 🚫 为什么不能提交

竞赛章程原文：

> **2026 年度所有报名资料、作品内容、附件、海报、影片字幕、演示简报及答辩均只接受英文。**

而且附则明确列出，**「未使用英文」属于可「不予评审」的情形之一**，且章程写明「不设作品内容覆核或申辩程序」——**没有补救机会**。

**正式提交请用上一级目录的两份英文 PDF：**

```
../ProjectIntroduction_Gezhi.pdf      ← 提交这个
../ResearchReport_Gezhi.pdf           ← 和这个
```

## 两份文档的结构对应关系

中文版与英文版**章节号、表号完全一致**，方便左右对照修改。改任何一份时记得同步另一份。

| 章节 | 英文版 | 中文版 |
| --- | --- | --- |
| 1 | Background | 背景 |
| 2 | Problem Definition | 问题定义 |
| 3 | Related Work | 相关工作 |
| 4 | System Design | 系统设计 |
| 5 | Technical Methods | 技术方法 |
| 6 | Data Sources | 资料来源 |
| 7 | Testing and Evaluation | 测试与评估 |
| 8 | Results | 结果 |
| 9 | Limitations | 局限性 |
| 10 | Ethics, Safety and Privacy | 伦理、安全与隐私 |
| 11 | Conclusion and Future Work | 结论与未来工作 |
| 附录 A | AI Tool Disclosure | 生成式 AI 工具使用披露 |

## 编译

中文版必须用 **XeLaTeX**（英文版用 pdfLaTeX 也可以，但中文字体必须 XeLaTeX）：

```powershell
$mik = 'D:\MiKTeX\miktex\bin\x64'
cd 'D:\Users\LINKIT\Desktop\格致\submission\zh-reference'

# 每份跑两遍
foreach ($f in 'ProjectIntroduction_Gezhi_中文','ResearchReport_Gezhi_中文') {
  & "$mik\xelatex.exe" -interaction=nonstopmode "$f.tex" > $null
  & "$mik\xelatex.exe" -interaction=nonstopmode "$f.tex" > $null
}
```

字体配置为 `fontset=windows`，使用系统自带的宋体 / 黑体 / 楷体，本机已验证可用。

**踩坑提醒**：如果上一次编译失败留下了半成品 PDF，下一次编译会报
`dvipdfmx:fatal: Unable to open ...`——这是文件被占用。先删掉 `*.pdf *.aux *.log *.out`
再重新编译即可。

## 占位符

同样使用红色 `【待填：…】` 标记，与英文版一一对应。查找：

```powershell
Select-String -Path *.tex -Pattern '\\fillin\{|\\fillc\{'
```

**中文版填了数据之后，务必把同样的数字填进英文版**——提交的是英文版。

## `_preview/`

逐页 PNG 预览，用于快速检查排版，**不是交付物**，可随时删除。
