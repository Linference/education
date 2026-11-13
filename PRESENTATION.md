---
marp: true
paginate: true
---

## Gezhi 格致 · An AI Learning Studio
### 一个让学生「讲出来」的 AI 学习工作室

Local-first · Evidence-based · Explain-to-learn

v0.0.8 · October 2026

::: notes
格致 · AI 学习工作室。核心主张：AI 不替学生回答，而是让学生讲出来，再指出讲漏、讲错、讲含糊的地方。
:::

---

## The problem 问题

- Students read a lot, but rarely **explain** what they read
  - 学生读得多，却很少把内容讲出来
- Chat assistants answer *for* the student, so understanding never gets tested
  - 聊天助手直接替学生答题，理解程度从未被检验
- Feedback is often a score, with no evidence and no next step
  - 反馈常常只有一个分数，没有依据，也没有下一步

::: notes
问题：阅读多、讲解少；AI 代答；反馈不可追溯。
:::

---

## What Gezhi is 格致是什么

- A **local-first desktop learning studio** (Electron)
  - 本地优先的桌面学习工作室
- Your own materials: Markdown, PDF, Word, PPT, Excel
  - 自己的教材：Markdown、PDF、Word、PPT、Excel
- AI works **standing on your own books**, not on generic web answers
  - AI 站在你自己的书上回答，而不是泛泛的网上答案

::: notes
定位：本地优先的桌面学习工作室，AI 基于学生自己的教材工作。
:::

---

## Three pillars 三大支柱

- **Local vault** — files stay on disk; full-text search with SQLite FTS5 (trigram)
  - 本地资料库：文件留在本机；SQLite FTS5 trigram 全文检索
- **AI kernel** — DeepSeek Harness, running as an agent over the vault
  - AI 内核：DeepSeek Harness，以 Agent 方式操作资料库
- **Learning loop** — evidence first, scores second
  - 学习闭环：先有证据，再谈分数

::: notes
三根支柱：本地资料库、DSH 内核、以证据为中心的学习闭环。
:::

---

## The learning loop 学习闭环

1. Record **confidence before** seeing any feedback
   - 先记录自信度，再看反馈
2. Predict → run the experiment → compare
   - 预测 → 做实验 → 对比
3. Evidence Map separates *independent* work from *assisted* work
   - 证据图谱区分独立作答与有辅助的作答
4. Transfer challenge, then a **delayed retest**
   - 迁移挑战，然后延迟重测

AI scores never count as independent evidence.
AI 评分不计入独立掌握。

::: notes
闭环：自信度 → 预测 → 证据 → 迁移 → 延迟重测；AI 分数不算独立证据。
:::

---

## Digital Space: five roles 数字人空间

- **Kai** — classmate: naive questions
- **Teacher Lin** — checks conditions and definitions
- **Mira** — junior student: asks for plain-language explanations
- **Examiner Zhou** — probes testability and boundaries
- **Yuan** — research partner: asks for evidence

Up to 12 follow-up rounds; answers survive a disconnect.
最多 12 轮追问；断线后回答保留、可重试。

::: notes
五个角色：同学 Kai、林老师、学妹 Mira、周考官、袁研究员；追问策略各不相同。
:::

---

## Six-dimensional feedback 六维反馈

- Concept accuracy · Conditions · Reasoning · Clarity · Examples · Transfer
  - 概念准确性 · 条件 · 推理 · 表达 · 举例 · 迁移
- Each dimension carries: **your own words**, the reason, and a next step
  - 每个维度都带：学生原话、判断理由、下一步建议
- Not enough evidence → the dimension stays **unscored**
  - 证据不足 → 该维度保持未评分，不硬给分

::: notes
六维反馈：准确性、条件、推理、表达、举例、迁移；证据不足就留空。
:::

---

## Feynman desk 费曼讲解台

- Speak or type the explanation in your own words
  - 用自己的话讲出来，可语音可分多段
- AI lists what is **correct**, what is **missing**, what is **wrong or vague**
  - AI 指出讲对了什么、漏了什么、哪里说错或含糊
- Follow-up questions target the weakest point
  - 追问直指最薄弱的环节
- Speech recognition noise is tolerated by design
  - 语音转写有错别字也能正常评分

::: notes
费曼台：讲 → 查缺补漏 → 追问最薄弱处。
:::

---

## From questions to paper 题库与组卷

- Import by Markdown / JSON, review before import
  - 支持 Markdown / JSON 导入，导入前逐题预览
- Paper basket, difficulty estimate, suggested time
  - 组卷篮、难度估算、建议时长
- Export PDF (Typst) with an optional answer key
  - Typst 导出 PDF，可选附答案解析
- Deduplication scoped to the current library
  - 去重范围限定在当前资料库

::: notes
题库：导入、预览、组卷、Typst 出 PDF、去重。
:::

---

## Knowledge graph and search 图谱与检索

- Wiki links, backlinks, local and global graph
  - 双链、反向链接、局部与全局图谱
- Chinese-friendly search: trigram FTS index
  - 中文友好的检索：trigram FTS 索引
- Every search reports which strategy was used
  - 每次检索都显示实际使用的策略

::: notes
图谱与检索：双链、图谱、trigram 全文索引。
:::

---

## Privacy and credentials 隐私与凭据

- API keys are stored **encrypted on this device**, bound to the OS account
  - API 密钥加密存在本机，与系统账户绑定
- The app shows only the **last four digits**
  - 界面只显示尾号 4 位
- Offline demo: five roles work without cloud AI
  - 离线演示：五个角色无需云端 AI 也能跑

::: notes
隐私：密钥本机加密、只显示尾号、离线可演示。
:::

---

## Verification 验证

- 57 unit tests across learning, question bank, companions, dialogue
  - 学习、题库、伴学、对话共 57 项单元测试
- Gates: secret scan · license check · mojibake scan
  - 门禁：密钥扫描、许可检查、乱码扫描
- Honest limits: no large student trial yet; AI scoring is not teacher-calibrated
  - 诚实边界：尚无大规模学生试用；AI 评分未经教师校准

::: notes
验证：57 项测试 + 三道门禁；明确说明局限。
:::

---

## What's next 下一步

- Teacher calibration of the six dimensions
  - 六维评分的教师校准
- Real classroom pilot data
  - 真实课堂试点数据
- OCR for scanned textbooks
  - 扫描版教材的 OCR
- English edition shipped on branch `english`
  - 英文版已发布在 `english` 分支

**Thank you · 谢谢**

::: notes
路线图：教师校准、课堂试点、OCR；英文版已上线 english 分支。
:::
