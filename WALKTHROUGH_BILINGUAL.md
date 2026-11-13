# Gezhi — Bilingual Walkthrough Script / 格致 · 中英对照讲解稿

> **EN:** A ready-to-present script for a demo, a competition defense, or a classroom introduction. Each section has an English block followed by the Chinese counterpart. Approximate timing is given for a 6–8 minute presentation; the short version can be assembled from §1, §3, §4 and §12.
>
> **中文：** 这是一份可直接用于演示、比赛答辩或课堂介绍的讲解稿。每节先英文、后中文。总时长按 6–8 分钟设计；如需短版，可只讲 §1、§3、§4 与 §12。

---

## §1. Opening hook / 开场

**EN:** Ask a student to explain a concept out loud. Most can repeat a definition, but far fewer can state the conditions under which it fails. That gap — between recognition and understanding — is where Gezhi lives.

**中文：** 请一位学生把某个概念讲出来。多数人能背出定义，但很少有人能说清它在什么条件下不成立。这个「认得」与「真懂」之间的差距，就是格致要解决的问题。

**EN:** Gezhi is a local-first AI learning studio. It does not give students another chatbot to copy answers from. It asks them to explain, questions them, and shows them evidence of what they actually understand.

**中文：** 格致是一个本地优先的 AI 学习工作室。它不是再给学生一个可以抄答案的聊天机器人，而是要求学生讲解、向学生追问，并用证据展示他们真正理解了什么。

---

## §2. The problem / 问题

**EN:** Three things are usually broken in self-study. First, materials are scattered across folders and formats. Second, reading feels like learning, so students never test themselves. Third, when AI gives an answer, the student cannot tell whether they could have produced it alone.

**中文：** 自学通常有三个问题。第一，资料散落在不同文件夹和格式里。第二，阅读会让人误以为自己在学习，于是从不自我检验。第三，AI 给出答案后，学生分不清那是自己本来就会，还是只是看懂了。

**EN:** Gezhi targets all three: one workspace for materials, a loop that forces explanation and retesting, and records that separate independent work from assisted work.

**中文：** 格致同时针对这三点：统一的工作区管理资料；用闭环强制「讲解—追问—复测」；用记录把独立完成与借助提示区分开。

---

## §3. What Gezhi is / 格致是什么

**EN:** Gezhi takes its name from the classical phrase *gewu zhizhi* — "investigate things to extend knowledge." It is a desktop application with four connected parts: a Markdown vault, a document workspace, an AI explanation partner, and a learning-record database.

**中文：** 格致的名字取自「格物致知」。它是一个桌面应用，由四个相互连接的部分组成：Markdown 资料库、文档工作区、AI 讲解伙伴，以及学习记录数据库。

**EN:** Everything that matters stays on the student's own machine. Notes are ordinary Markdown files that can be opened in any editor. The index and learning records live in the local application-data directory. Nothing is uploaded unless the student chooses to use a cloud model or cloud voice.

**中文：** 重要的东西都留在学生自己的电脑上。笔记就是普通 Markdown 文件，可以用任何编辑器打开。索引与学习记录保存在本机应用数据目录。除非学生主动使用云端模型或云端语音，否则不会上传任何内容。

---

## §4. The core loop / 核心闭环

**EN:** The learning loop has five steps: **Source → Explain → Question → Refine → Inspect**.

**中文：** 学习闭环有五步：**选资料 → 讲解 → 追问 → 修正 → 查看证据**。

**EN:** *Source.* The student picks a chapter, a page range, or an excerpt from their own material. That snapshot becomes the evidence base for the session.

**中文：** **选资料。** 学生从自己的资料中选一个章节、页段或原文片段，这个快照就成为本次学习的证据基础。

**EN:** *Explain.* The student explains the idea in their own words, by typing or recording. They do not answer a multiple-choice question; they produce an explanation.

**中文：** **讲解。** 学生用自己的话讲出来，可以打字也可以录音。不是做选择题，而是产出讲解。

**EN:** *Question.* Gezhi adopts one of five listener roles, each with a different questioning strategy.

**中文：** **追问。** 格致会扮演五种听众之一，每种角色采用不同的追问策略。

**EN:** *Refine.* The student revises the explanation. Each round is stored, so improvement is visible.

**中文：** **修正。** 学生修改讲解。每一轮都会保存，进步看得见。

**EN:** *Inspect.* The system shows six-dimensional feedback and an evidence map. Crucially, the AI score is kept separate from independently verified answers.

**中文：** **查看证据。** 系统展示六维反馈与证据地图。关键在于：AI 评分与独立作答验证分开记录。

---

## §5. Five listeners / 五种听众

**EN:** A single "AI teacher" quickly becomes predictable. Gezhi uses five roles because different listeners expose different weaknesses:

| Role | What it pushes on | 中文角色 | 追问重点 |
| --- | --- | --- | --- |
| Peer practice partner / 同学 | Clarifying fuzzy phrasing | 同学 | 把含糊的表达说清楚 |
| Teacher / 教师 | Conditions and reasoning | 教师 | 适用条件与推理 |
| Student audience / 学生 | Plain language and examples | 学生 | 用简单的话和例子解释 |
| Examiner / 考官 | Boundaries, counterexamples and transfer | 考官 | 边界、反例与迁移 |
| Research partner / 研究伙伴 | Testable predictions and hypotheses | 研究伙伴 | 可检验的预测与假设 |

**EN:** A peer says, "I don't quite follow that part." A teacher asks, "Under what conditions would that fail?" An examiner changes the scenario and asks whether the same reasoning still holds. Same material, different pressure.

**中文：** 同学会说「这段我没太听懂」；教师会问「在什么条件下会不成立」；考官会换一个情境，问同样的推理是否仍然有效。同一份资料，不同的压力。

**EN:** Each conversation segment allows at most twelve turns, so the loop stays focused and the record stays readable.

**中文：** 每段对话最多十二轮，保证讨论聚焦、记录可读。

---

## §6. Six-dimensional feedback / 六维反馈

**EN:** Feedback covers six dimensions: **conceptual accuracy, completeness of conditions, coherence of reasoning, clarity of expression, quality of examples, and transfer application.**

**中文：** 反馈覆盖六个维度：**概念准确性、条件的完整性、推理的连贯性、表达的清晰度、举例的质量、迁移应用。**

**EN:** Every scored dimension quotes the learner's own words, explains why the score was given, and suggests a next step. If there is no observable evidence, the dimension is marked *not demonstrated* rather than silently scored zero.

**中文：** 每个评分维度都会引用学习者的原话、说明给分理由，并给出下一步建议。如果没有可观察到的证据，该维度会标为「未体现」，而不是悄悄记零分。

**EN:** This matters because "I don't know" and "I know it but did not say it" are different problems and need different practice.

**中文：** 这一点很重要： 「不会」和「会但没说」是两个不同的问题，需要不同的练习。

---

## §7. Learning Studio activities / 学习工作室活动

**EN:** Reading alone is not enough, so the Learning Studio adds five activities:

**中文：** 只看不练不够，因此学习工作室增加了五项活动：

- **Confidence recording / 自信度记录** — commit to a confidence level before the answer is revealed, so "very sure but wrong" becomes visible. / 在答案揭晓前先记录自信度，让「很确定但错了」暴露出来。
- **Error Detective / 错误侦探** — find the specific wrong step, fix the condition and the reasoning, then test with a counterexample. / 找出具体错在哪一步，修正条件与推理，再用反例检验。
- **Learning Evidence Map / 学习证据地图** — display objective answers and AI explanation reports separately, so assisted success is not counted as independent mastery. / 分开显示客观作答与 AI 讲解报告，避免把借助提示的成功算作独立掌握。
- **Transfer Challenge / 迁移挑战** — change the conditions or the scenario and retest. / 改变条件或情境后复测。
- **Concept experiments / 概念实验** — predict, manipulate, observe and explain in function, force and probability models. / 在函数、受力与概率模型中预测、操作、观察并解释。

**EN:** The experiment flow locks the prediction before the student manipulates anything, and it records controlled-variable comparisons. A prediction that was never followed by a completed experiment does not count as a pass.

**中文：** 实验流程要求先锁定预测，再动手操作，并记录控制变量的对照结果。只有预测、没有完成实验，不计入通过。

---

## §8. Materials, search and export / 资料、检索与导出

**EN:** The vault supports Markdown, TXT, DOCX text extraction and PDF page segments. Full-text search handles Chinese properly by combining trigram recall with dictionary-based pre-tokenization — the default SQLite tokenizer silently returns zero results for Chinese, which is a trap we hit and documented.

**中文：** 资料库支持 Markdown、TXT、DOCX 文字提取与 PDF 页段。全文检索对中文做了专门处理：trigram 召回加词典预分词。SQLite 默认分词器查中文会静默返回 0 条，这是我们踩过并记录下来的坑。

**EN:** Notes form a graph through wikilinks, with backlinks and a background layout worker so large vaults stay usable. Export supports Markdown, PDF through Typst, and Word, with formulas and Chinese typesetting preserved.

**中文：** 笔记通过 wikilink 形成图谱，支持反向链接，并用后台布局线程保证大资料库仍可使用。导出支持 Markdown、Typst 生成的 PDF 与 Word，公式与中文排版都会保留。

---

## §9. Architecture / 架构

**EN:** The desktop app is Electron: a CommonJS main process, a React/TypeScript renderer, and a preload bridge with a narrow, validated IPC surface. Local data is SQLite plus plain files. AI runs through DeepSeek Harness as the agent kernel, so the same account, sandbox and session model can be reused. PDF export uses Typst; Office viewing and conversion use a trimmed LibreOffice.

**中文：** 桌面端是 Electron：CommonJS 主进程、React/TypeScript 渲染进程，以及一个接口很窄、带校验的 preload 桥。本地数据是 SQLite 加普通文件。AI 通过 DeepSeek Harness 作为智能体内核，复用其账号、沙箱与会话模型。PDF 导出使用 Typst；Office 查看与转换使用裁剪后的 LibreOffice。

**EN:** Two design rules shape the code. The data stays local and portable. The AI must stand on evidence: if it cannot point to the book or page, it should say so rather than invent a source.

**中文：** 两条设计原则塑造了代码。第一，数据本地、可迁移。第二，AI 必须站在证据上：如果指不出哪本书、哪一页，就应该明说，而不是编造出处。

---

## §10. Competition showcase / 比赛展示

**EN:** For the 2026 Global Youth AI Future Innovation Competition (Macau Secondary School Division), Gezhi includes an English showcase entry point. It offers an offline five-role demonstration with clearly labeled prepared examples, and an online mode that uses real materials and the real AI channel.

**中文：** 针对 2026 全球青少年人工智能未来创新竞赛（澳门中学组），格致内置英文展示入口：既有明确标注「预制示例」的五角色离线示范，也有使用真实资料与真实 AI 通道的联网模式。

**EN:** The showcase is isolated from the everyday vault. Demo dialogues and demo reviews do not enter the student's real records. On exit, the app returns to the previous vault and file.

**中文：** 展示区与日常资料库相互隔离。示范对话和示范复核不会进入学生真实记录。退出时回到原资料库与原文件。

**EN:** Human review lets a teacher, peer or the student score each dimension independently, with a required reason per score. The main process recalculates differences from the original report; statistics are per report, not per student, and only the latest review round counts. The reviewer identity is self-declared and the software does not verify it.

**中文：** 人工复核允许教师、同伴或学生本人逐维评分，每个分数都必须写理由。主进程会与原始报告重新计算差异；统计以报告为单位而非以学生为单位，且只取最近一轮复核。复核身份是自声明的，软件不做核验。

**EN:** An AI-use disclosure records real tool names, versions, purposes and the work students actually did. Unknown fields stay blank, and exports are marked INCOMPLETE rather than filled with guesses.

**中文：** AI 使用披露会记录真实工具名称、版本、用途以及学生实际完成的部分。未知字段保持空白，导出会标注「不完整」，而不是猜测填写。

---

## §11. Evidence and verification / 证据与验证

**EN:** The engineering claims are backed by repeatable checks, not by adjectives. The foundation gate passes 9/9 on a prepared machine; core learning tests pass 39/39; the 0.0.8 showcase adds 64/64, 11/11, 13/13, 15/15 and 31/31 across feature groups, including a 1,500-node graph stress test.

**中文：** 工程结论靠可复跑的检查支撑，而不是形容词。在准备好的机器上，地基门禁 9/9 通过；核心学习测试 39/39 通过；0.0.8 展示新增 64/64、11/11、13/13、15/15、31/31 等分组验证，其中包括 1,500 节点图谱压力测试。

**EN:** There is a documented Chinese input-method proof of concept: composition input passes 8/8, and the interaction between `[[` autocomplete and the IME passes 5/5. We also recorded the exact CodeMirror behaviour that forced a coding rule: every autocomplete source must return early while `view.composing` is true.

**中文：** 有一份完整记录的中文输入法 PoC：组合输入 8/8 通过，`[[` 自动补全与输入法共存 5/5 通过。我们还记录了一条由此得出的编码规约：每个补全源在 `view.composing` 为真时必须提前返回。

---

## §12. Limitations — stated honestly / 诚实地说明局限

**EN:** Gezhi does not claim measured learning gains. There is no real student trial data yet. The six-dimensional feedback is formative, the AI scores are not teacher-calibrated, and human review is self-declared. Simulated tests show that the software runs; they do not prove that learning improves.

**中文：** 格致不声称已经测出学习提升。目前没有真实学生试用数据。六维反馈属于形成性反馈，AI 评分尚未经教师校准，人工复核身份为自声明。模拟测试只能说明软件能运行，不能证明学习效果提升。

**EN:** Scanning PDFs still requires OCR first. Cloud AI and cloud voice need accounts and a network. The installer does not bundle the DSH kernel, so without it the AI features are unavailable.

**中文：** 扫描版 PDF 仍需先做 OCR。云端 AI 与云端语音需要账号与网络。安装包未内置 DSH 内核，缺少它时 AI 功能不可用。

**EN:** The next stage should be teacher comparison scoring, real learning tasks, delayed retests and transfer questions — the kind of evidence that can actually support a claim about learning.

**中文：** 下一阶段应该做教师对照评分、真实学习任务、延迟复测与迁移题——这些证据才能真正支撑关于学习效果的结论。

---

## §13. SDG 4 positioning / 可持续发展目标 4 定位

**EN:** Gezhi aligns with SDG 4, Quality Education. The intended contribution is not a new content library, but a way to make independent understanding visible and improvable, using materials a student already has. This is the project's intended value, not a verified outcome.

**中文：** 格致对应可持续发展目标 4「优质教育」。它想贡献的不是一个新的内容库，而是一种方法：用学生已有的资料，让独立理解变得可见、可改进。这是项目的预期价值，不是已经验证的成果。

---

## §14. Closing / 结尾

**EN:** The question is not whether AI can explain something to a student. It can. The question is whether a student can explain it back, under pressure, and still be right tomorrow. Gezhi is built to make that question answerable.

**中文：** 问题不是 AI 能不能给学生讲明白——它当然能。问题是：学生能不能反过来讲清楚，在追问之下仍然站得住，并且明天还记得。格致就是为了让这个问题有答案。

**EN:** Thank you. I am happy to take questions on the learning design, the architecture, or the evidence.

**中文：** 谢谢。欢迎就学习设计、技术架构或证据细节提问。

---

## Appendix A. 60-second version / 60 秒短版

**EN:** Gezhi is a local-first AI learning studio. Students pick a source, explain it in their own words, get questioned by one of five listener roles, revise, and then inspect six-dimensional feedback and an evidence map. The AI score never counts as independent mastery. Everything runs on the student's own machine, with Markdown as the source of truth. We have repeatable engineering checks, a documented Chinese IME proof of concept, and an English competition showcase. We do not claim measured learning gains: real student trials and teacher calibration are the next step.

**中文：** 格致是一个本地优先的 AI 学习工作室。学生选一份资料，用自己的话讲解，接受五种听众角色之一的追问，修正后再查看六维反馈与证据地图。AI 评分永远不算独立掌握。一切运行在学生自己的电脑上，Markdown 是唯一真源。我们有一套可复跑的工程检查、一份完整的中文输入法 PoC，以及英文比赛展示。我们不声称已经测出学习提升：真实学生试用与教师校准是下一步。

---

## Appendix B. Anticipated questions / 预设问答

**Q (EN): Is this just another AI chatbot?**
**A (EN):** No. The AI is constrained to the student's material, is forced to cite, and its scores are separated from independent evidence. The product's unit is an explanation loop, not a chat window.
**问（中）：** 这不就是又一个 AI 聊天机器人吗？
**答（中）：** 不是。AI 被约束在学生自己的资料内，必须给出处，其评分与独立证据分开记录。产品的单位是「讲解闭环」，不是聊天窗口。

**Q (EN): How do you know it improves learning?**
**A (EN):** We do not claim that yet. We have engineering verification and simulated tests. The honest position is that learning-outcome research is the next stage.
**问（中）：** 怎么证明它能提升学习？
**答（中）：** 目前不这样声称。我们有的是工程验证与模拟测试。诚实的说法是：学习效果研究是下一阶段的事。

**Q (EN): Why local-first?**
**A (EN):** Because student notes and records are sensitive, and because files should outlive the app. A vault is a folder of Markdown; the index can be rebuilt.
**问（中）：** 为什么坚持本地优先？
**答（中）：** 因为学生的笔记与记录是敏感的，也因为文件应该比应用活得更久。资料库就是一个 Markdown 文件夹，索引可以重建。

**Q (EN): What happens without internet or an API key?**
**A (EN):** The vault, editor, search, graph, question bank, exports and the offline showcase still work. Live AI and cloud voice are unavailable.
**问（中）：** 没有网络或 API 密钥时呢？
**答（中）：** 资料库、编辑器、检索、图谱、题库、导出与离线展示都照常可用；联网 AI 与云端语音不可用。

---

## Appendix C. Demo checklist / 演示清单

- [ ] **EN:** Open the vault and show that it is an ordinary folder. / **中文：** 打开资料库，说明它就是普通文件夹。
- [ ] **EN:** Pick a source excerpt and start an explanation. / **中文：** 选一段原文，开始讲解。
- [ ] **EN:** Switch listener roles and show the different follow-ups. / **中文：** 切换听众角色，展示不同追问。
- [ ] **EN:** Open the six-dimensional feedback and point to "not demonstrated". / **中文：** 打开六维反馈，指出「未体现」。
- [ ] **EN:** Show the evidence map separating AI and independent evidence. / **中文：** 展示证据地图，区分 AI 与独立证据。
- [ ] **EN:** Run the offline English showcase and label it as prepared examples. / **中文：** 运行英文离线展示，并说明是预制示例。
- [ ] **EN:** State the limitations before anyone asks. / **中文：** 在别人问之前主动说明局限。
