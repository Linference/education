# 05 · 数字人与费曼评分调研

> 面向 Windows 桌面端学习应用「格致」的技术选型调研报告
> 目标用户：澳门 / 内地中学生（中一 – 高三）
> 场景：**AI 语音陪练 + 费曼学习法评分 + GIF 数字人**
>
> 状态：**草稿骨架，正在逐节补齐**
> 约定：✅ = 已通过 web_search / web_fetch 核实；🟡 = 推断（基于公开常识/工程经验，未逐条核实）；⚠️ = **未验证**，落地前必须实测或查官网。

---

## 目录

- [0. 执行摘要（TL;DR）](#0-执行摘要tldr)
- [1. 费曼学习法的可执行化](#1-费曼学习法的可执行化)
  - [1.1 四步法 → 软件流程映射](#11-四步法--软件流程映射)
  - [1.2 多维度评分 Rubric（1–5 分行为锚点）](#12-多维度评分-rubric15-分行为锚点)
  - [1.3 总分等级与判定规则](#13-总分等级与判定规则)
  - [1.4 AI 输出 JSON Schema（DeepSeek structured output）](#14-ai-输出-json-schemadeepseek-structured-output)
  - [1.5 知识缺口诊断：对齐教材与知识点图谱](#15-知识缺口诊断对齐教材与知识点图谱)
  - [1.6 苏格拉底式追问策略（3 层递进 + 反例测试）](#16-苏格拉底式追问策略3-层递进--反例测试)
  - [1.7 与间隔复习联动（SM-2 / FSRS）](#17-与间隔复习联动sm-2--fsrs)
- [2. ASR 选型](#2-asr-选型)
  - [2.1 腾讯云 ASR 三条产品线](#21-腾讯云-asr-三条产品线)
  - [2.2 TC3-HMAC-SHA256 签名要点](#22-tc3-hmac-sha256-签名要点)
  - [2.3 密钥不可放前端：架构建议](#23-密钥不可放前端架构建议)
  - [2.4 开源 ASR 替代方案横评](#24-开源-asr-替代方案横评)
  - [2.5 推荐组合：离线兜底 + 在线优选](#25-推荐组合离线兜底--在线优选)
- [3. TTS 选型](#3-tts-选型)
  - [3.1 腾讯云 TTS 文档与音色](#31-腾讯云-tts-文档与音色)
  - [3.2 开源 TTS 横评](#32-开源-tts-横评)
  - [3.3 工程要点：流式、边播边合成、打断、AEC 冲突](#33-工程要点流式边播边合成打断aec-冲突)
- [4. GIF 数字人（分层方案）](#4-gif-数字人分层方案)
  - [4.1 方案 A：预渲染 GIF/APNG/WebP 状态机](#41-方案-a预渲染-gifapngwebp-状态机)
  - [4.2 方案 B：Live2D Cubism SDK for Web](#42-方案-blive2d-cubism-sdk-for-web)
  - [4.3 方案 C：VRM + three.js + @pixiv/three-vrm](#43-方案-cvrm--threejs--pixivthree-vrm)
  - [4.4 方案 D：音频驱动口型（离线预生成）](#44-方案-d音频驱动口型离线预生成)
  - [4.5 推荐路线与状态机](#45-推荐路线与状态机)
- [5. 语音环延迟预算](#5-语音环延迟预算)
- [6. 隐私合规](#6-隐私合规)
- [7. 一句话建议](#7-一句话建议)
- [附录 A：URL 清单（可点击）](#附录-aurl-清单可点击)
- [附录 B：事实 / 推断 / 未验证 对照表](#附录-b事实--推断--未验证-对照表)

---

## 0. 执行摘要（TL;DR）

| 模块 | 推荐方案 | 一句话理由 |
| --- | --- | --- |
| 费曼评分 | **DeepSeek structured output（严格 JSON）+ 6 维 rubric + 教材原文对照** | 评分必须可复现、可申诉，所以评分维度固定、证据必须引用原句 |
| ASR | **腾讯云实时语音识别（WebSocket 流式）为优选；sherpa-onnx（本机已内置）为离线兜底** | 在线买准确率，离线买可用性与隐私 |
| TTS | **腾讯云流式 TTS 为优选；Windows 内置 SAPI 中文语音为兜底**（⚠️ Edge-TTS 有条款风险，商用前须评估） | 首包延迟可控 + 零依赖兜底 |
| 数字人 | **先做方案 A（预渲染状态机 WebP/APNG），接口预留 B（Live2D）/C（VRM）** | 一周内可见效果，成本最低，且和口型驱动解耦 |
| 延迟预算 | **端到端目标 ≤ 1.6 s（首字反馈 ≤ 400 ms）** | 超过 2 s 学生就会觉得"它没在听" |
| 隐私 | **录音默认本地加密、云端不留存、家长同意 + 一键删除** | 用户是未成年人，合规是硬门槛不是加分项 |

> 本报告的**核心工程主张**：把「费曼讲解」做成一等公民的数据结构（见 [1.7 节末尾的表设计](#17-与间隔复习联动sm-2--fsrs)）（`explain_session` + `rubric_scores` + `gaps`），而不是一段聊天记录。只有结构化了，才能接间隔复习、才能给家长看报告、才能训练评分稳定性。

---

## 1. 费曼学习法的可执行化

### 1.1 四步法 → 软件流程映射

费曼学习法（Feynman Technique）的经典四步，在软件里必须翻译成**有状态、可中断、可持久化**的流程，而不是一次 prompt。

| 经典四步 | 软件阶段 ID | 学生看到什么 | 系统做什么 | 产出数据 |
| --- | --- | --- | --- | --- |
| ① 选定概念 | `select` | 「今天讲这个：**勾股定理的逆定理**」 | 从知识点图谱取 `kp_id`，取教材原文段落 + 课标要求 + 前置知识点 | `session.kp_id` |
| ② 用简单语言讲解 | `explain` | 大按钮「开始讲给我听」，数字人进入**聆听态** | 录音 → ASR → 实时转写；同时跑 VAD 判停 | `session.transcript`（带词级时间戳） |
| ③ 找出卡壳与缺口 | `probe` | AI 苏格拉底式追问 2–3 轮，数字人进入**思考态** | 把 transcript 与教材/图谱对齐，定位 `没提到 / 说错了 / 说得模糊` | `session.gaps[]` + `session.probes[]` |
| ④ 简化并类比 | `simplify` | 「用一句话讲给小学生听」/「举一个生活里的例子」 | 追加一轮采集，专门评「通俗化与类比」「举例恰当性」 | `session.analogy_text` |
| （收尾） | `report` | 讲解质量报告：雷达图 + 等级 + 3 条改进建议 + 回讲计划 | 生成 JSON → 渲染 UI → 写入 `review_card`（接 SM-2/FSRS） | `session.report` |

**关键设计约束（推断，但有充分工程理由）**：

1. **`explain` 阶段不允许 AI 插话**。中学生一旦被打断就会放弃。AI 只能通过数字人的**表情**（疑惑 / 点头）给非语言反馈。
2. **追问必须有上限**（建议 ≤ 3 轮）。苏格拉底式追问对成年人有效，对中一学生超过 3 轮就变成审问，直接触发退出。
3. **允许文字兜底**。有口吃、社恐、或麦克风故障的学生必须能切到打字模式，否则这批用户直接流失。ASR 失败 2 次后自动提示切换。
4. **讲解时长下限**。少于 15 秒的录音视为无效（学生乱点），不评分、不消耗额度、不写入复习卡片。

> **状态机（建议命名）**：`idle → selecting → listening → transcribing → probing → scoring → reporting → idle`
> 每个状态都要能被「暂停/退出」打断，且中途退出要**保存已转写文本**（半成品也有价值）。

---

### 1.2 多维度评分 Rubric（1–5 分行为锚点）

#### 设计原则

1. **只评可观测行为**。禁止评「聪明」「有天赋」这类不可观测特质——AI 评不出来，学生也不服。
2. **每维分数必须附证据**。要求模型引用转写原句（`evidence_quote` + `evidence_start_ms`），无证据则记 `null` 而非 0。这是把「AI 瞎给分」变成「可申诉评分」的关键。
3. **权重可调，但默认固定**。固定权重的评分才可跨题目比较（这对「进步曲线」是必需的）。
4. **多轮取最优，不是取末次**。追问后的补充讲解若把某维拉高，应记录提升（这本身就是「学会」的证据），最终分建议取 `max(初讲, 追问后)` 并在报告里体现"从 X 提升到 Y"。

#### 维度与权重

| # | 维度 | 建议权重 | 评什么 | 主要数据来源 |
| --- | --- | --- | --- | --- |
| 1 | **概念准确性** | **30 %** | 说的事实对不对、有无硬错误、有无偷换概念 | 与教材原文/图谱条目对比 |
| 2 | **关键点覆盖** | **25 %** | 该讲到的得分点讲到了几个 | 知识点图谱的 `key_points[]` |
| 3 | **逻辑结构** | **15 %** | 有没有因果链、先后顺序对不对、有无跳跃 | 转写文本的篇章结构 |
| 4 | **通俗化与类比** | **13 %** | 有没有翻译成人话、类比是否成立 | 追问轮 + 简化轮 |
| 5 | **举例恰当性** | **12 %** | 例子是否贴合概念、是否覆盖边界情况 | 转写文本中的例证 |
| 6 | **流畅自信** | **5 %** | 停顿、自我修正、（推断）语速与音量稳定性 | ASR 词级时间戳 + 音频特征 |

> **为什么准确性 30 % 而不是更高**：如果准确性权重压到 50 %，一次口误就会把学生从"熟练"打到"未掌握"，挫败感过强。教学上更合理的是「准确性一票降级」——见下方硬规则。
> **为什么流畅自信只给 5 %**：它是**过程指标**，不是**掌握指标**。内向学生讲得磕巴但内容对，不该被扣成"没学会"。这 5 % 的存在意义是给学生**鼓励性反馈**，而不是拉开分差。

#### 1–5 分行为锚点

**① 概念准确性（30 %）**

| 分 | 行为锚点（学生实际表现） |
| --- | --- |
| 5 | 全部关键陈述与教材/定义一致；能主动指出易错点或前提条件（"必须强调，这里 a 不能为 0"） |
| 4 | 核心陈述正确，无事实错误；个别措辞不严谨，但不影响含义 |
| 3 | 主体正确，但有 1 处明显不严谨或术语混用（说"面积"其实是"边长"这类） |
| 2 | 有 1 处明确事实错误，或把相关但不同的两个概念混为一谈 |
| 1 | 核心命题就说错了，或答非所问、复述题面 |

**② 关键点覆盖（25 %）** — 设该知识点应覆盖 N 个要点，命中 k 个

| 分 | 行为锚点 |
| --- | --- |
| 5 | k/N ≥ 0.9，且要点之间的重要性区分正确（重点讲得细，次要一笔带过） |
| 4 | 0.75 ≤ k/N < 0.9 |
| 3 | 0.5 ≤ k/N < 0.75 |
| 2 | 0.25 ≤ k/N < 0.5 |
| 1 | k/N < 0.25，或只讲了无关内容 |

**③ 逻辑结构（15 %）**

| 分 | 行为锚点 |
| --- | --- |
| 5 | 有清晰"总—分—总"或"条件→推导→结论"骨架；有显式过渡（"所以""但是""因此"）；听众能预判下一步 |
| 4 | 顺序基本合理，有 ≥ 1 处显式连接词；缺一个收束结论 |
| 3 | 要点以并列清单形式列出，用"还有……还有……"串联，无因果连接 |
| 2 | 顺序有跳跃，先讲结论再补条件但没有说明；需要听者自己补逻辑 |
| 1 | 想到哪说到哪，前后自相矛盾 |

**④ 通俗化与类比（13 %）**

| 分 | 行为锚点 |
| --- | --- |
| 5 | 自创类比且**指明了类比的适用边界**（"就像水管，不过水压对应电压这个类比只在……时成立"） |
| 4 | 自创类比基本贴切，能说清对应关系，但未讨论边界 |
| 3 | 能用自己的话复述教材表述，但基本是术语搬运，无异类比 |
| 2 | 照念定义原文；换一个说法就卡住 |
| 1 | 只能堆术语，被要求"用小学生能听懂的话说"后无输出或重复原话 |

**⑤ 举例恰当性（12 %）**

| 分 | 行为锚点 |
| --- | --- |
| 5 | 给出 ≥ 2 个例子，含 **1 个正例 + 1 个反例/边界例**，并说明为什么反例不成立 |
| 4 | 给出 1 个正确且贴切的例子，能说明对应关系 |
| 3 | 有例子但过于笼统（"比如做题的时候"），或例子正确但未说明为什么合适 |
| 2 | 例子与概念只是表面相关（用"苹果落地"讲牛顿第三定律） |
| 1 | 无例子，或例子本身是错的 |

**⑥ 流畅自信（5 %）** — *过程指标，仅作鼓励性反馈*

| 分 | 行为锚点 |
| --- | --- |
| 5 | 几乎无长停顿，无重复起头，语速自然，（推断）音量稳定 |
| 4 | 有 1–2 次 < 2 s 的停顿或轻微自我修正，不影响理解 |
| 3 | 有 ≥ 3 次长停顿，但都靠自我修正接回来了 |
| 2 | 频繁停顿、反复重说同一句，讲解被打断成碎片 |
| 1 | 长时间沉默或中途放弃 |

> **不许扣分的项（重要）**：方言口音、口头禅（"那个""然后"）、音量偏小、语速偏慢。前两项与掌握程度无关，后两项可能是设备或性格问题。**只在报告里温和提示，不进分数**——否则澳门/内地口音差异会变成系统性偏见。

#### 门槛分与快速参考卡

**门槛分（threshold）**：命中该维度「达标表现」的最低分。低于门槛即触发降级规则。

| 维度 | 门槛分 | 含义 |
| --- | --- | --- |
| 概念准确性 | **4** | 讲对是底线，3 分及以下必须降级 |
| 关键点覆盖 | **3** | 覆盖一半以上才算"讲过" |
| 逻辑结构 | **3** | 至少要能听懂 |
| 通俗化与类比 | **2** | 允许"只是复述"，但不允许完全照念 |
| 举例恰当性 | **3** | 至少要有一个像样的例子 |
| 流畅自信 | **1** | 不设门槛（永不因表达降级） |

**快速参考卡（给产品/UI 用的一句话版本）**

| 维度 | 权重 | 门槛 | 5 分的样子 | 1 分的样子 |
| --- | --- | --- | --- | --- |
| 概念准确性 | 30 % | 4 | 全对且主动点出易错前提 | 核心命题就说错 |
| 关键点覆盖 | 25 % | 3 | 覆盖 ≥ 90 % 且详略得当 | 覆盖 < 25 % |
| 逻辑结构 | 15 % | 3 | 有骨架、有过渡、有结论 | 前后矛盾、想到哪说到哪 |
| 通俗化与类比 | 13 % | 2 | 自创类比 + 说明边界 | 只会堆术语 |
| 举例恰当性 | 12 % | 3 | 正例 + 反例 + 说明为何成立 | 无例子或例子错 |
| 流畅自信 | 5 % | 1 | 无长停顿、语速自然 | 长时间沉默/放弃 |

#### 加权总分公式

```
raw   = Σ ( score_i × weight_i )          // i = 1..6，Σ weight_i = 1
total = raw × 20                           // 映射到 0–100 便于展示

硬规则（Override，优先于总分）：
  R1  概念准确性 = 1  →  total 直接封顶 39 分（未掌握）
  R2  概念准确性 = 2  →  total 封顶 59 分（初步）
  R3  概念准确性 ≥ 4 且 关键点覆盖 ≥ 4 且 举例恰当性 ≥ 4  →  允许进入「可教别人」候选
  R4  任一维度为 null（无证据）→ 该维按权重剔除，其余维度权重归一化后再算，
      并在报告中显示「本次未评：<维度名>」
```

> **R4 为什么重要**：如果学生录了 20 秒就停了，模型不该凭空给"逻辑结构"打分。把无证据维度剔除并显示出来，比给 0 分诚实得多，也避免了"录音越短分越低"的操纵空间。
> **R1/R2 是「一票降级」，不是一票否决**：仍显示 78 分的维度明细，让学生看到"你其他都很好，就是这里说错了"——这比一个笼统低分更有教育价值。

#### 权重变体（按学科，可选）

| 学科 | 调整建议 | 理由（推断） |
| --- | --- | --- |
| 数学 / 物理 | 准确性 32 %，通俗化 8 %，例子 14 % | 理科例子要能算得通，类比过度反而误导 |
| 化学 / 生物 | 准确性 30 %，关键点 28 %，逻辑 12 % | 事实性细节多 |
| 语文 / 历史 | 逻辑 20 %，准确性 25 %，通俗化 15 % | 重论述结构与表达 |
| 英语 | 准确 28 %，流畅 12 %，逻辑 15 % | 表达流利度在语言学科才该加权 |
| 信息技术 / 信奥 | 准确 30 %，逻辑 20 %，例子 12 % | 算法讲解的逻辑链是核心 |

#### 评分稳定性工程（避免"同一份讲解两次评分差 20 分"）

- **`temperature` 设 0**（DeepSeek 支持 `temperature: 0`），并**禁止**用默认 1.0。
- **同一 session 二次评分只用于校验**，展示给学生的始终是首次评分，避免分数抖动引发不信任。
- **锚点示例入 prompt**：每维各放 1 个 5 分和 1 个 2 分的标注示例（few-shot），显著降低维度间"分数漂移"。
- **一致性抽检**：每周抽 5 % 的 session 重跑评分，若 |Δtotal| > 10 则告警并人工复核 prompt。⚠️ **此策略未实测**，阈值需上线后用真实数据校准。

---

### 1.3 总分等级与判定规则

| 等级 | ID | 总分区间 | 附加条件 | 给学生的话 | 系统动作 |
| --- | --- | --- | --- | --- | --- |
| **未掌握** | `not_mastered` | 0–39 | 或触发 R1 | 「这块还没搭起来，我们一起再走一遍。」 | 当天重讲；复习间隔 **1 天**；降级到前置知识点自查 |
| **初步** | `emerging` | 40–59 | 或触发 R2 | 「大方向对了，但有几处卡住，我再问你两个问题。」 | 进入追问 `probe` 阶段；复习间隔 **1–2 天** |
| **熟练** | `proficient` | 60–84 | 准确性 ≥ 4 | 「讲得挺清楚了，能不能再举个例子？」 | 复习间隔 **4–7 天**；进入简化轮 |
| **可教别人** | `teachable` | 85–100 | 满足 R3 且 至少一个类比/例子被标记为"可引用" | 「你讲得比我还清楚，要不要试着教同学？」 | 复习间隔 **14–21 天**；生成「小老师卡」可分享；解锁讲解示范库 |

**配套机制**：

- **进步优先于绝对分**。报告首屏显示的是 `本次总分 vs. 上次同知识点` 的 Δ，而不是裸分。Δ > 0 时数字人必定播放「开心」动画——这是把评分变成正反馈的关键。
- **等级不回溯下调**。同一知识点若本次比上次低，只提示「今天可能有点累，我们改天再讲一次」，不覆盖历史最高等级（历史最高单独存 `best_level`）。
- **`teachable` 是稀缺资源**。若某知识点 90 % 的学生都能拿 `teachable`，说明 rubric 太松或知识点太简单，需要调阈值——这是持续校准的信号。

---

### 1.4 AI 输出 JSON Schema（DeepSeek structured output）

DeepSeek 兼容 OpenAI 的 `response_format: { type: "json_object" }`（**注意**：`json_object` 模式要求 prompt 里出现 "json" 字样，且**不保证**符合 schema；因此服务端仍须用 Zod/Ajv 校验并做一次修复重试）。⚠️ **DeepSeek 是否支持严格 `json_schema` 模式未验证**，落地前需实测；若不支持，就走「`json_object` + 本地校验 + 失败重试一次」。

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FeynmanExplainReport",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version", "kp_id", "kp_name",
    "scores", "total_score", "level",
    "gaps", "probes", "highlights",
    "suggestions", "review_plan"
  ],
  "properties": {
    "schema_version": { "type": "string", "const": "1.0" },
    "kp_id":   { "type": "string", "description": "知识点图谱 ID" },
    "kp_name": { "type": "string" },

    "scores": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "concept_accuracy", "key_point_coverage", "logical_structure",
        "plain_language_analogy", "example_quality", "fluency_confidence"
      ],
      "properties": {
        "concept_accuracy":      { "$ref": "#/$defs/dimScore" },
        "key_point_coverage":    { "$ref": "#/$defs/dimScore" },
        "logical_structure":     { "$ref": "#/$defs/dimScore" },
        "plain_language_analogy":{ "$ref": "#/$defs/dimScore" },
        "example_quality":       { "$ref": "#/$defs/dimScore" },
        "fluency_confidence":    { "$ref": "#/$defs/dimScore" }
      }
    },

    "total_score": { "type": "integer", "minimum": 0, "maximum": 100 },
    "level": {
      "type": "string",
      "enum": ["not_mastered", "emerging", "proficient", "teachable"]
    },
    "applied_rules": {
      "type": "array",
      "description": "触发的硬规则 ID，如 ['R1']；无则空数组",
      "items": { "type": "string", "enum": ["R1", "R2", "R3", "R4"] }
    },

    "gaps": {
      "type": "array",
      "description": "知识缺口，按严重度降序",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["gap_id", "type", "severity", "student_said", "textbook_says", "kp_point", "why_it_matters"],
        "properties": {
          "gap_id": { "type": "string" },
          "type": {
            "type": "string",
            "enum": ["missing", "wrong", "vague"],
            "description": "missing=没提到  wrong=说错了  vague=说得模糊"
          },
          "severity": { "type": "string", "enum": ["critical", "major", "minor"] },
          "student_said": {
            "type": ["string", "null"],
            "description": "学生原话（逐字引用，不得改写）；missing 时为 null"
          },
          "student_said_start_ms": { "type": ["integer", "null"] },
          "textbook_says": { "type": "string", "description": "教材原文逐字引用" },
          "textbook_ref": {
            "type": "object",
            "additionalProperties": false,
            "required": ["source_file", "chunk_id"],
            "properties": {
              "source_file": { "type": "string" },
              "page":        { "type": ["integer", "null"] },
              "chunk_id":    { "type": "string" }
            }
          },
          "kp_point":       { "type": "string", "description": "对应图谱要点 ID 或原文" },
          "why_it_matters": { "type": "string", "description": "一句话说明这个缺口会导致什么后果" }
        }
      }
    },

    "probes": {
      "type": "array",
      "description": "已使用/建议的追问，最多 3 条",
      "maxItems": 3,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["level", "question", "target_gap_id", "student_answer_summary", "resolved"],
        "properties": {
          "level": { "type": "integer", "minimum": 1, "maximum": 3 },
          "question": { "type": "string" },
          "target_gap_id": { "type": ["string", "null"] },
          "student_answer_summary": { "type": ["string", "null"] },
          "resolved": { "type": ["boolean", "null"] }
        }
      }
    },

    "highlights": {
      "type": "array",
      "description": "做得好的地方，必须引用原话；至少 1 条，最多 3 条",
      "minItems": 1,
      "maxItems": 3,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["quote", "why_good"],
        "properties": {
          "quote":    { "type": "string" },
          "why_good": { "type": "string" }
        }
      }
    },

    "suggestions": {
      "type": "array",
      "description": "给学生看的改进建议，最多 3 条，必须具体可执行",
      "maxItems": 3,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["action", "example_phrase"],
        "properties": {
          "action":         { "type": "string", "description": "如「把 X 和 Y 的先后关系说出来」" },
          "example_phrase": { "type": "string", "description": "给一句可以直接照说的示范句" }
        }
      }
    },

    "review_plan": {
      "type": "object",
      "additionalProperties": false,
      "required": ["next_review_in_days", "review_reason"],
      "properties": {
        "next_review_in_days": { "type": "integer", "minimum": 1, "maximum": 60 },
        "review_reason":       { "type": "string" }
      }
    },

    "self_check": {
      "type": "object",
      "description": "让模型自曝不确定性，便于服务端降级",
      "additionalProperties": false,
      "properties": {
        "transcript_quality":   { "type": "string", "enum": ["good", "fair", "poor"] },
        "scoring_confidence":   { "type": "string", "enum": ["high", "medium", "low"] },
        "low_confidence_reason":{ "type": ["string", "null"] }
      }
    }
  },

  "$defs": {
    "dimScore": {
      "type": "object",
      "additionalProperties": false,
      "required": ["score", "evidence_quote", "evidence_start_ms", "rationale"],
      "properties": {
        "score": {
          "type": ["integer", "null"],
          "minimum": 1, "maximum": 5,
          "description": "null = 无证据，不评分（触发 R4）"
        },
        "evidence_quote":    { "type": ["string", "null"], "description": "逐字引用学生原话" },
        "evidence_start_ms": { "type": ["integer", "null"] },
        "rationale":         { "type": "string", "description": "为什么给这个分，对应哪条锚点" }
      }
    }
  }
}
```

**服务端处理流程（建议）**：

```
LLM 输出 → JSON.parse（失败 → 修复重试 1 次）
        → Zod/Ajv 校验（失败 → 记录原始输出 + 走「评分不可用」兜底 UI）
        → 代码层重算权重总分与硬规则（不信任模型自报的 total_score！）
        → 落库 session_report
        → 渲染报告 UI
```

> **最重要的工程纪律**：**总分和等级必须由服务端代码算，不能信模型**。模型只负责给 6 个 1–5 的整数 + 证据引用；一旦让模型自己算加权和，就会出现"6 个 4 分却给 92 分"的数学错误，而且不可复现。`applied_rules` 同理——它是模型自报的，仅作参考。

**Prompt 骨架（要点）**：

```
system: 你是中学 <学科> 老师，正在用费曼学习法评估学生的口头讲解。
        严格按给定 JSON schema 输出，不要输出任何 JSON 以外的内容。
        规则：
        1) 每维打分必须引用学生原话作为证据；找不到证据就填 null，绝对不许猜。
        2) 判定"说错了"时，必须逐字引用教材原文作对照（textbook_says 字段）。
        3) 不许因为口音、口头禅、语速、音量扣分。
        4) highlights 至少 1 条 —— 学生一定有做得好的地方，认真找。
        5) total_score 字段填 0 即可，服务端会重算。

user: 【知识点】<kp_name>（ID: <kp_id>）
      【教材原文】<retrieved_chunks with chunk_id + page>
      【应覆盖要点】<key_points[]>
      【学生转写】(带时间戳)
        [0.0s] 嗯……我觉得勾股定理就是说……
        [3.2s] 直角三角形两条直角边的平方和等于斜边的平方
        ...
      【学生音频特征】(可选) 语速 <wpm>，长停顿 <n> 次
      请输出评估 JSON。
```

---

### 1.5 知识缺口诊断：对齐教材与知识点图谱

这是整个方案里**最难也最值钱**的部分。目标是把学生的口语转写，变成三类可行动诊断：

| 类型 | ID | 判据 | 例子 | 对应的教学动作 |
| --- | --- | --- | --- | --- |
| **没提到** | `missing` | 图谱要点 `key_point` 在转写中**无语义等价物** | 讲勾股定理逆定理时完全没说"必须已知三边" | 不是"不会"，是"漏了"→ 提示补讲，不降级 |
| **说错了** | `wrong` | 转写中有陈述与教材原文**逻辑矛盾** | 「只要两条边平方和等于第三边平方，就是锐角三角形」 | **最优先处理**，直接触发 R1/R2 降级 + 立即纠正 |
| **说得模糊** | `vague` | 有相关表述但缺少关键限定/量化/因果 | 「反正就是能证明它是直角」 | 用追问把它逼清楚（正是追问策略的靶子） |

#### 对齐流程（三段式）

```
① 要点抽取（离线，每个知识点做一次，缓存）
   教材段落 → LLM 抽 key_points[] → 人工/教师审核 → 存 knowledge_point.key_points
   ⚠️ 这一步必须有人工审核。自动抽的要点如果本身错了，后面全错。

② 覆盖比对（在线）
   student_transcript + key_points[]
     → 对每个 key_point 做三分类：
        covered_correct / covered_wrong / not_covered
     → not_covered 的再判：是"从没提"还是"提了但没展开"（后者 → vague）

③ 原文对照（在线，强制）
   对每个判为 wrong / vague 的缺口，从检索结果里取对应教材 chunk，
   逐字引用进 textbook_says，并带 chunk_id + page 以便 UI 跳转高亮。
```

#### Prompt 设计思路（要求引用教材原文）

**核心技巧：把「判断」和「引用」拆成两步，先检索后判断。**

1. **强制引用，禁止转述**：prompt 里明确要求 `textbook_says` 必须是**逐字复制**检索片段中的连续字符串，不许改写、不许总结。这样服务端可以做**字符串校验**——把 `textbook_says` 拿去在检索片段里做子串匹配，匹配失败就说明模型在编造教材内容（幻觉检测器）。这是本方案里性价比最高的一道防线。

2. **只在检索到的内容里判断**。prompt 里写：「如果检索片段中没有覆盖该判断所需的内容，`type` 必须填 `vague` 并把 `textbook_says` 填 `检索片段未覆盖`，**不许凭自己的知识补充教材内容**」。—— 让模型承认"教材里没有"，比让它自由发挥安全得多。

3. **`vague` 与 `wrong` 的区分要给出操作性定义**（否则模型会混用）：
   - `wrong`：存在一个可以直接改写教材原句就能变对的陈述（可定位到具体句子）
   - `vague`：无法定位到具体句子，只能定位到"整段都在绕"
   
4. **严重度由代码算，不由模型定**：`severity` 建议按 `key_point.importance`（图谱里预先标注的核心/次要）× `type` 计算，而不是让模型自由裁量。模型给的 severity 只作参考。

5. **要求定位时间戳**。`student_said_start_ms` 让 UI 能把缺口高亮回放到对应音频位置——学生点一下就能听到自己当时怎么说的，这个体验对"自我发现缺口"极其有效。

6. **一次只判 3–5 个要点**。要点过多时模型会偷懒（后几个要点判得潦草）。建议**分批调用**，每批 3–5 个 `key_point`，然后合并。

#### 与教材/图谱对齐的工程细节

- **图谱结构建议**：`knowledge_point(id, name, subject, grade_band, key_points[], prereq_ids[], source_refs[])`。`prereq_ids` 让 `not_mastered` 时能自动下钻到前置知识点。
- **教材检索**：复用格致已有的 SQLite FTS5 路线（见 `docs\00-环境勘察报告.md` 提到的前作方案），chunk 粒度建议 **300–500 字 + 带页码元数据**。
- **图谱与教材是两套东西**：图谱要点是"应该讲什么"，教材原文是"正确的说法是什么"。**不要合并**——合并后无法区分"教材没写"和"学生没说"。
- ⚠️ **未验证**：教材语料在本机尚不存在（勘察报告已确认人教版教材未落地），所以 1.5 节的检索链路目前**只有设计、没有数据**。`key_points` 的人工审核工作量需实测评估。

---

### 1.6 苏格拉底式追问策略（3 层递进 + 反例测试）

追问的目的**不是**考倒学生，而是把 `vague` 逼成 `explicit`，把 `wrong` 暴露成「学生自己发现矛盾」。

#### 三层递进

| 层 | 名称 | 触发条件 | 问题形态 | 示例（勾股定理逆定理） |
| --- | --- | --- | --- | --- |
| **L1** | **澄清** | 检测到 `vague` | 「你说的 X，具体是指什么？」要求给定义或边界 | 「你说'能证明它是直角'，是用什么证明的？」 |
| **L2** | **追因** | L1 回答后仍有模糊，或有 `missing` | 「为什么？」「如果不这样会怎样？」逼出因果链 | 「为什么三边满足这个关系，就一定是直角而不是锐角？」 |
| **L3** | **反例测试** | L1/L2 回答正确（防止"背对了但没懂"） | 给一个**貌似成立的错误例子**，让学生判断 | 「我举个数：3、4、5 满足，那 3、4、6 呢？6²=36，而 3²+4²=25，36 > 25，所以它是什么三角形？」 |

#### 反例测试的设计要点

- **反例必须是"边界附近"的**，而不是明显荒谬的。给「1、1、10 能不能组成直角三角形」太容易，学生一眼否掉，测不出东西。要给 **3、4、6**（钝角）和 **3、4、4.5** 这类需要真算的。
- **反例要引导学生自己算**，AI 不要先给答案。AI 报答案就等于把测试变成讲授，失去诊断价值。
- **答错反例是好事**：这正好精确定位了缺口的边界（"你会套公式，但没理解不等号的含义"）。报告里应该表述为「我们发现了一个边界情况你没考虑到」，而不是「你答错了」。
- **最多 3 层，最多 3 轮**。达到上限就收尾出报告，不要恋战。若 L3 后学生仍困惑，正确动作是**换一个更简单的类比重讲一遍**，而不是继续追问。

#### 追问的呈现方式（对中学生的关键适配）

| 做法 | 不推荐 |
| --- | --- |
| 数字人「疑惑」表情 + 一句短问题（≤ 25 字） | 长篇追问、一次问三个问题 |
| 允许「我不知道」按钮，按了直接进下一层或收尾 | 强制必须回答才能继续 |
| 追问语音播报可**跳过/静音**（课堂环境有人） | 强制外放 |
| 追问后立即肯定「刚才那句说得好」 | 连续追问不给正反馈 |

> **LLM 契约**：追问生成应要求模型**只输出一个问题**，且 `question.length ≤ 25` 个汉字。实测（推断）长问题会被学生当作"AI 在讲课"而放弃回答。建议在 schema 里用 `maxLength: 25` 硬约束。

---

### 1.7 与间隔复习联动（SM-2 / FSRS）

费曼评分最大的价值在于：**它天然产出高质量的复习信号**。普通刷题的"对/错"是二值的，而费曼评分给出的是「掌握程度的连续估计 + 具体缺口」，正好喂给间隔复习算法。

#### 两个算法对比

| 项 | SM-2 | FSRS |
| --- | --- | --- |
| 年份 | 1987（SuperMemo 2） | 2022 起，Anki 23.10+ 内置 |
| 模型 | 启发式：`EF`（易度因子）+ 固定间隔序列 | **DSR 模型**：Difficulty / Stability / Retrievability 三参数 |
| 输入 | `quality` 0–5 | `rating` 1–4（Again/Hard/Good/Easy） |
| 输出 | 下次间隔天数 | 下次间隔 + 记忆稳定性预测 |
| 可调优 | 只能调 EF 上下限 | **可用个人复习历史训练参数** |
| 实现难度 | 极低（约 30 行） | 中（需引入库 + 可选训练） |
| 适合场景 | 快速上线、数据量少 | 长期使用、有几百条以上复习记录后 |

**参考资料（✅ 已核实存在）**：
- SM-2 原始描述：[SuperMemo Algorithm（官方帮助 wiki）](https://help.supermemo.org/wiki/SuperMemo_Algorithm) · [SuperMemo 2 算法原文（镜像仓库）](https://github.com/clockzhong/OpenSuperMemo/blob/master/SM2/Docs/SuperMemo%202_%20Algorithm.html)
- FSRS 官方组织与实现：[open-spaced-repetition（GitHub 组织）](https://github.com/open-spaced-repetition) · [free-spaced-repetition-scheduler（基于 DSR 模型）](https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler)
- ⚠️ **未验证**：`open-spaced-repetition.github.io/fsrs/` 返回 404，FSRS 官方 wiki/文档的**当前**入口需另行确认；`ts-fsrs`（TypeScript 实现）的仓库地址亦未核实，落地前须查证。

#### 评分 → 复习参数的映射（建议）

```ts
type Rating = 1 | 2 | 3 | 4; // Again / Hard / Good / Easy

function levelToRating(level: Level, delta: number): Rating {
  // delta = 本次总分 - 上次同知识点总分
  if (level === 'not_mastered') return 1;                    // Again
  if (level === 'emerging')    return delta > 5 ? 3 : 2;     // Good / Hard
  if (level === 'proficient')  return delta > 5 ? 4 : 3;     // Easy / Good
  return 4;                                                  // teachable → Easy
}
```

**映射设计的三条理由（推断）**：

1. **不用绝对分做映射，用等级 + 进步量**。同一份 70 分，对一直考 50 分的学生是巨大进步，对一直考 90 分的学生是退步——两者的复习安排应该不同。
2. **`teachable` 永远映射到 Easy**。能给别人讲明白，是记忆强度最高的证据，间隔应该拉开到 2–3 周。
3. **`not_mastered` 强制 Again（当天/次日）**，但**不惩罚性加练**。正确答案是"换一种方式重讲一遍"，而不是"抄十遍"。这与 1.3 节的等级规则一致。

#### 数据表建议

```sql
-- 讲解会话（一次费曼讲解）
explain_session(
  id, kp_id, started_at, duration_ms,
  transcript, transcript_words_json,   -- 词级时间戳
  audio_path, audio_encrypted,          -- 见第 6 节
  report_json,                          -- 1.4 的完整 JSON
  total_score, level, best_level,
  created_at
)

-- 维度分明细（便于做"哪一维最弱"的长期统计）
rubric_score(session_id, dimension, score, evidence_quote, evidence_start_ms, is_null)

-- 知识缺口（跨 session 聚合，这是"个人薄弱点图谱"的数据源）
knowledge_gap(id, student_id, kp_id, gap_type, severity,
              first_seen_at, last_seen_at, resolved_at, session_ids_json)

-- 复习卡片（喂给 SM-2 / FSRS）
review_card(id, student_id, kp_id, fsrs_state_json,
            due_at, last_rating, last_reviewed_at, reps, lapses)

-- 知识点图谱
knowledge_point(id, name, subject, grade_band, key_points_json,
                prereq_ids_json, source_refs_json)
```

> **`knowledge_gap` 这张表是本方案的战略资产**：跨 session 聚合后，它能回答"这个学生在'边界条件'这一类缺口上反复栽跟头"——这是比单个知识点分数高一个层次的洞察，也是家长报告最有说服力的内容。

---

## 2. ASR 选型

> **结论先行**：**腾讯云实时语音识别（WebSocket 流式）做优选，sherpa-onnx（本机已内置）做离线兜底**。理由是流式 ASR 能让数字人在学生说话时就有反应，而离线的价值不在精度而在"网络/额度/隐私出问题时还能用"。

### 2.1 腾讯云 ASR 三条产品线

✅ 以下产品线与免费额度信息核实自[语音识别 计费概述（在线版）](https://cloud.tencent.com/document/product/1093/35686)（页面最近更新 2026-09-08）：

| 子产品 | 接口 / 形态 | 免费额度 | 适用场景 | 推荐度 |
| --- | --- | --- | --- | --- |
| **实时语音识别** | WebSocket 流式 | **有** | 讲解实时转写、边说边出字、驱动 VAD | ⭐ **主力** |
| **一句话识别** | `SentenceRecognition`，HTTP 一次性 | **有** | 60 秒内的短回答、追问的语音输入 | ⭐ 主力（追问轮） |
| **录音文件识别** | `CreateRecTask` 异步任务 | **有** | 课后批量重新精细转写、生成高质量报告 | 辅助（异步，不适合实时） |
| 录音文件识别极速版 | 同步版 | 有 | 需要同步拿到长音频结果 | 可选 |
| 实时语音识别（大模型 1.0/2.0 版） | WebSocket 流式 | **无免费额度** | 精度更高，但**无免费额度**，成本敏感场景慎用 | 视预算 |

> ⚠️ **以官网为准**：免费额度的**具体时长数字**在文档的产品计费框架表中以「有/无」标注，本次抓取中**未取到具体小时数**（页面内容被截断）。**具体免费额度、阶梯单价、并发包价格必须在腾讯云控制台/计费页现场确认**，本报告不给出可能过期的数字。
> ⚠️ 带「大模型」字样的 ASR 子产品（1.0/2.0 版、跨境版）**均标注「无」免费额度**；跨境版可能涉及数据出境问题（见第 6 节）。

#### 关键接口参数（✅ 核实自[一句话识别 API 文档](https://cloud.tencent.com/document/api/1093/35646)，最近更新 2025-12-30）

| 项 | 值 |
| --- | --- |
| 请求域名 | `asr.tencentcloudapi.com` |
| Version | `2019-06-14` |
| 音频限制 | **时长 ≤ 60 s，文件 ≤ 3 MB** |
| 支持格式 | wav、pcm、ogg-opus、speex、silk、mp3、m4a、aac、amr |
| 请求频率 | 默认 **30 次/秒**（可购买提升） |
| 签名 | 签名方法 **v3**（见 2.2） |
| `Region` | **不需要传** |

**`EngSerViceType`（引擎模型）关键枚举** —— 选型时最该看的一栏：

| 枚举值 | 含义 | 对「格致」的意义 |
| --- | --- | --- |
| `16k_zh` | 中文通用 | 内地学生普通话主场景 |
| **`16k_zh-PY`** | **中英粤** | ⭐ **澳门场景首选**（澳门学生常中英粤混说） |
| **`16k_yue`** | **粤语** | ⭐ 粤语为主的学生 |
| `16k_zh_dialect` | 多方言，**支持 23 种方言**（上海话、四川话、武汉话…） | 内地方言区学生 |
| `16k_en` | 英语 | 英语科的朗读/口语练习 |
| `8k_zh` / `8k_en` | 电话场景 8k | 不适用（桌面端 16k） |

> **产品决策**：澳门校区默认 `16k_zh-PY`（中英粤），设置里允许切到 `16k_yue`。**不要只给 `16k_zh`**——澳门学生讲课时夹杂粤语词和英语术语是常态，单普通话引擎会把这些识别成错字，然后被 rubric 判成"说错了"，这是**最危险的误判路径**。

**其他有用的可选参数**：

- `WordInfo`：**词级时间戳**（0 不显示 / 1 不含标点 / 2 含标点）。⭐ **必开**——1.4 节的 `evidence_start_ms`、1.5 节的缺口回放、流利度评分都依赖它。
- `FilterModal`：过滤语气词（0/1/2）。⚠️ **建议设 0（不过滤）**。虽然"嗯""那个"对评分没用，但过滤掉就失去了流利度评分的原始证据，且会让 `evidence_quote` 与学生实际说的话对不上（回放时穿帮）。建议保留原文，评分时由代码侧忽略。
- `FilterPunc`：标点过滤，建议保留（0），便于后续分句做逻辑结构分析。
- `HotwordList` / `HotwordId`：**热词表**。⭐ **提分利器**——把当前知识点术语（"逆定理""勾股""全等"）作为临时热词传入。单个热词 ≤ 10 个汉字，权重 1–11 或 100，**最多 128 个热词**，逗号分隔。权重 11 = 超级热词；权重 100 = 开启同音替换增强（仅 `8k_zh`/`16k_zh`）。
- `ConvertNumMode`：阿拉伯数字智能转换（默认 1）。建议开启，数学讲解里"3 的平方"更易读。
- `CustomizationId`：自学习模型。⚠️ 涉及生物特征，**慎用**（见第 6 节）。

**实时语音识别（WebSocket）**：⚠️ **具体 API 文档 URL 本次未逐条核实**。产品入口在[语音识别文档中心](https://cloud.tencent.com/document/product/1093)，实时识别走 WebSocket 协议、需要签名 URL 鉴权。**落地前必须查证当前 WebSocket 协议文档与签名方式**（实时识别的鉴权与 HTTP API 的 TC3 签名不完全相同）。

> **成本提醒**：实时语音识别（大模型版）**无免费额度**。若按「每节课 2 次费曼讲解 × 每次 3 分钟」估算，一个学生每天约 6 分钟音频 → 每月约 3 小时。**具体费用需按官网阶梯价核算**，本报告不做估算。建议应用内做**用量看板 + 月度硬上限**，超限自动切离线兜底。

### 2.2 TC3-HMAC-SHA256 签名要点

腾讯云 API 3.0 使用 **TC3-HMAC-SHA256** 签名。✅ 签名方法文档入口：[签名方法 v3](https://cloud.tencent.cn/document/api/1823/132284)。✅ 一句话识别文档明确"签名方法参考公共参数中签名方法 v3"，其 Authorization 头实测样例为：

```
Authorization: TC3-HMAC-SHA256 Credential=<SecretId>/2020-09-03/asr/tc3_request,
               SignedHeaders=content-type;host,
               Signature=0615f73a69c6b054affd69e4b1cbb68fbe84ae8024a9347df4aa5054933adac8
```

**签名步骤要点**（✅ 结构核实自官方样例；⚠️ **精确拼接细节以官方文档为准**，**强烈建议直接用官方 SDK 而非手写签名**）：

1. **CanonicalRequest**：`HTTPRequestMethod` + `CanonicalURI` + `CanonicalQueryString` + `CanonicalHeaders` + `SignedHeaders` + `HashedRequestPayload`。header key 必须**小写并排序**，value 需 trim。
2. **StringToSign**：`算法` + `请求时间戳（Unix 秒）` + `CredentialScope` + `HashedCanonicalRequest`。`CredentialScope` 形如 `2019-06-14/asr/tc3_request`（日期 / 服务 / 终止字符串）。
3. **派生签名密钥**（TC3 的核心，四层 HMAC 链）：
   ```
   SecretDate     = HMAC-SHA256("TC3" + SecretKey, Date)
   SecretService  = HMAC-SHA256(SecretDate,      Service)   // 如 "asr" / "tts"
   SecretSigning  = HMAC-SHA256(SecretService,   "tc3_request")
   Signature      = HexEncode(HMAC-SHA256(SecretSigning, StringToSign))
   ```
   ⚠️ 派生链的**输入顺序与盐值位置**必须逐字对照官方文档——写反 `key`/`message` 是最常见的签名失败原因（报 `AuthFailure.SignatureFailure`）。
4. **鉴权失败常见原因**：`X-TC-Timestamp` 与服务器时间偏差 > 5 分钟；`host` 头与实际域名不一致；body 被中间件改写导致 payload hash 不匹配；密钥含前后空格。

**工程建议**：
- **用官方 SDK**：[tencentcloud-sdk-nodejs](https://github.com/TencentCloud/tencentcloud-sdk-nodejs)。手写 TC3 签名收益为零、踩坑成本很高。
- **签名在服务端做**，前端只拿短期凭证（见 2.3）。
- **时钟同步**：Electron 客户端系统时间可能不准。若客户端参与签名（不推荐），必须先做时间校验并给出明确错误提示。

### 2.3 密钥不可放前端：架构建议

> **这是本节最重要的一条。** Electron 的渲染进程代码、`app.asar`、以及打包进安装包的字符串，**都可被解包读取**。`asar` 不是加密，只是归档格式。

**❌ 绝对禁止**：
- 把 `SecretId` / `SecretKey` 写进前端代码、`.env` 并打包、或 Electron `renderer` 侧任何地方。
- 用「混淆」「Base64 编码」当保护手段。
- 在客户端直连 `asr.tencentcloudapi.com`。

**✅ 推荐架构（三选一，按项目阶段）**：

| 方案 | 做法 | 适用阶段 | 代价 |
| --- | --- | --- | --- |
| **① 自建轻量中转（推荐）** | 客户端 → 自己的 HTTPS 后端（带用户 JWT）→ 后端持长期密钥签名 → 腾讯云。密钥只存服务端环境变量/密钥管理服务 | **首发** | 需要一个后端 |
| **② STS 临时密钥** | 后端签发**短期、最小权限**临时凭证给客户端，客户端直连腾讯云 | 有后端后可选 | 需正确配置 CAM 策略，防临时凭证被滥用刷额度 |
| **③ 本地离线优先** | 讲解音频默认走 **sherpa-onnx 本地识别**，仅用户显式选「高精度模式」才上云 | 隐私敏感 / 无后端 | 精度下降（见 2.4/2.5） |

**参考（✅ 官方入口）**：[腾讯云访问管理 CAM 文档](https://cloud.tencent.com/document/product/598) · [语音识别控制台](https://console.cloud.tencent.com/asr/settings)。⚠️ **具体的 STS/CAM 最佳实践页面 URL 未逐条核实**。

**配套措施**：
1. **子账号 + 最小权限**：为「格致」单独建 CAM 子账号，只授 `QcloudASRFullAccess`/`QcloudTTSFullAccess`（或更细），**绝不使用主账号密钥**。
2. **配额与告警**：腾讯云侧设用量告警；应用侧设月度上限。两者都要有，防止单点失效被刷爆。
3. **密钥轮换**：支持双密钥并行过渡（新密钥生效、旧密钥保留 24 h 后吊销）。
4. **本地配置加密**：若必须在本机存任何凭证，用 Electron `safeStorage`（Windows 走 DPAPI）。这与 `docs\00-环境勘察报告.md` 记录的「明文 Key 风险」是同一个问题。
5. **日志脱敏**：任何日志、崩溃报告、埋点中不得出现密钥、`SecretId`、以及**原始音频和完整转写文本**。

> **顺带提醒**：勘察报告已记录本机存在明文 API Key 泄漏（`~\.config\opencode\opencode.json` 与比赛项目 sample 文件）。**在接入腾讯云之前，先完成那两个 Key 的吊销轮换，并建立「密钥不入库、不入 git、不进日志」的检查清单**，否则新增的腾讯云 Key 会重蹈覆辙。

### 2.4 开源 ASR 替代方案横评

> **核实状态说明**：以下项目的**仓库归属与用途基于公开认知**，表中 License 与体积标注为 **🟡 推断**，**本次未逐个打开仓库页面核实 License 文本与模型体积**。⚠️ **凡带 ⚠️ 的单元格，落地前必须到仓库 License 文件与模型页确认**——尤其是要商用时。

| 项目 | 仓库（⚠️ URL 未逐个核实） | License | 模型体积 | 中文效果 | Windows CPU 实时性 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| **sherpa-onnx** | `github.com/k2-fsa/sherpa-onnx` | Apache-2.0 ⚠️ | 视模型而定（中文 Paraformer/Zipformer 通常几十–几百 MB） | 好（支持 Paraformer / Zipformer / Whisper 等多家族） | ⭐ **好**，官方主打端侧，有 Windows x64 预编译 | ⭐ **本机已内置**（见下方实测） |
| **whisper.cpp** | `github.com/ggml-org/whisper.cpp` | MIT ⚠️ | tiny≈75 MB / base≈142 MB / small≈466 MB / medium≈1.5 GB；量化版约 1/2–1/3 | 中文可用但**大模型才够好**，小模型易错 | 中；`small` 接近实时，`medium` 偏慢 | C/C++ 无依赖，Windows 支持好 |
| **faster-whisper** | `github.com/SYSTRAN/faster-whisper` | MIT ⚠️ | 同 Whisper 系列 + CTranslate2 转换版 | 同 Whisper | ⭐ 比 whisper.cpp 快（CTranslate2 + int8） | **需 Python 运行时**，Electron 打包成本高 |
| **FunASR** | `github.com/modelscope/FunASR` | ⚠️ 需核实 | Paraformer-large 中文约数百 MB | ⭐ **中文/方言强**，工业级 | 中；有 ONNX 导出路径 | Python 生态，需自行封装 |
| **SenseVoice** | `github.com/FunAudioLLM/SenseVoice` | ⚠️ 需核实 | SenseVoiceSmall 约数百 MB（含量化版） | ⭐ **中文强、支持粤语**，且带情感/事件识别 | 中–好（有 ONNX / sherpa-onnx 集成） | ⭐ **与澳门场景最相关**：粤语 + 情感识别一举两得 |
| **Vosk** | `github.com/alphacep/vosk-api` | Apache-2.0 ⚠️ | 中文小模型约 40–50 MB | 一般（弱于上述） | ⭐ **极好**（专为低资源设备） | 体积最小、依赖最轻；精度不足但**适合兜底** |

**本机实测事实（✅ 已验证）**：

- 路径 `D:\DeepSeek Harness\resources\app.asar.unpacked\dsh\node_modules\sherpa-onnx-win-x64\` **真实存在**，内容与精确字节数：

  | 文件 | 字节数 | MB |
  | --- | --- | --- |
  | `onnxruntime.dll` | 17,812,456 | 16.99 |
  | `sherpa-onnx-c-api.dll` | 4,619,240 | 4.41 |
  | `sherpa-onnx.node` | 695,272 | 0.66 |
  | `sherpa-onnx-cxx-api.dll` | 272,872 | 0.26 |
  | `onnxruntime_providers_shared.dll` | 118,248 | 0.11 |
  | **合计** | **23,518,088** | **22.43** |

- 该目录**无 `package.json`**（只是二进制载荷目录）。
- `sherpa-onnx.node` 存在 → 这是**给 Node.js 用的原生插件（N-API）**，Electron 主进程可直接 `require`，无需额外 FFI 封装。⭐ **格致不必自己编译 sherpa-onnx**。
- ⚠️ **未验证**：该 `.node` 的 **ABI/N-API 版本是否与格致将用的 Electron 版本兼容**；也**未验证**目录内是否附带模型文件——本次**只看到 DLL 与 `.node`，没有看到任何 `.onnx` 模型**。**这意味着 sherpa-onnx 只是引擎，中文模型仍需另外下载/分发**，这是体积预算里必须单独算的一块。
- ⚠️ **未验证**：DSH 内部如何使用这个包（未找到其 `package.json` 声明）。**格致不应直接依赖 DSH 的 node_modules 路径**（那是 DSH 内部实现，升级会变），而应自己安装 `sherpa-onnx-node` 作为正式依赖。

### 2.5 推荐组合：离线兜底 + 在线优选

```
                    ┌─────────────────────────────┐
   麦克风 ──► VAD ──►│  ASR 路由（策略层）           │
                    │  1. 用户显式选"离线优先"？    │
                    │  2. 网络可用？                │
                    │  3. 本月云端额度未超？        │
                    │  4. 音频时长 ≤ 60s？          │
                    └──────┬──────────────┬────────┘
                           │              │
              ┌────────────▼───┐   ┌──────▼─────────────┐
              │ 腾讯云 ASR      │   │ sherpa-onnx 本地    │
              │ 实时(流式)/一句话│   │ （离线，无网可用）   │
              └────────┬───────┘   └──────┬─────────────┘
                       │                  │
                       └────────┬─────────┘
                                ▼
                     统一转写结果（含词级时间戳）
                                ▼
                          费曼评分管线
```

**路由策略（建议）**：

| 条件 | 走哪条路 | 理由 |
| --- | --- | --- |
| 网络正常 + 额度未超 + 用户选「高精度模式」 | **腾讯云实时识别（`16k_zh-PY`）** | 流式出字，体验最好，精度最高 |
| 追问轮（≤ 60 s 短回答） | **腾讯云一句话识别** | 简单、快、有免费额度 |
| 网络不可用 / 额度超限 / 用户选「纯离线」 | **sherpa-onnx 本地** | 保证功能可用，不因网络中断学习 |
| 云端置信度异常低（或学生手动报「识别错了」） | **本地重跑一次做交叉验证** | 双引擎比对提升可信度（🟡 推断） |
| 课后生成精细报告 | **录音文件识别**（异步） | 不占用交互时间窗，可二次精修 |

**三条不可妥协的设计原则**：

1. **ASR 结果必须让学生可编辑**。ASR 一定会错（尤其粤语/英混合的专业术语）。报告生成前给一个「这段话识别对了吗？」的轻量确认界面——**学生点一下改一个字，比后面解释"为什么给我判错"便宜 100 倍**。
2. **必须显示当前用的是哪个引擎**。学生/家长有权知道音频是否上云。用常驻图标（云 / 本地）表示，可点击查看详情。
3. **额度耗尽必须优雅降级**，不能弹"服务不可用"就结束。降级路径：云端 → 本地 → 纯文字模式，三级都要走通。

---

## 3. TTS 选型

### 3.1 腾讯云 TTS 文档与音色

✅ 核实自[基础语音合成 API 文档](https://cloud.tencent.com/document/product/1073/37995)（最近更新 2026-03-30）与[音色列表](https://cloud.tencent.com/document/product/1073/92668)（最近更新 2026-09-29）。

**接口 `TextToVoice`**：

| 项 | 值 |
| --- | --- |
| 请求域名 | `tts.tencentcloudapi.com` |
| Version | `2019-08-23` |
| **文本上限** | **中文 ≤ 150 个汉字**（全角标点算 1 个汉字）；**英文 ≤ 500 个字母** |
| 返回格式 | `Codec`：`wav`（默认）/ `mp3` / `pcm` |
| 采样率 | `8000` / `16000`（默认）/ `24000`（部分音色支持） |
| 语速 | `Speed` ∈ [-2, 6]：-2=0.6×，0=1.0×（默认），6=2.5×；**支持保留 2 位小数** |
| 音量 | `Volume` ∈ [-10, 10]，默认 0 |
| 情感 | `EmotionCategory`（neutral / sad / happy / angry / fear / news / story / radio / poetry / call / sajiao / disgusted / amaze / peaceful / exciting / aojiao / jieshuo 共 17 种）+ `EmotionIntensity` ∈ [50,200]，**仅多情感音色支持** |
| 时间戳 | `EnableSubtitle: true` → 返回 `Subtitles[]`（含 `BeginTime` / `EndTime` / `Phoneme`） |
| SSML | ⭐ **支持**（[SSML 标记语言](https://cloud.tencent.com/document/product/1073/49575)） |
| 并发限制 | 精品音色 **20**；大模型音色 **20**；**超自然大模型音色 10**；一句话复刻音色 **10** |

> ⭐ **`EnableSubtitle` 对本项目极其关键**：TTS 返回的**字级时间戳**（`BeginTime`/`EndTime`）正是**驱动数字人口型的免费数据源**！有了它，方案 A（GIF 状态机）**不需要任何音频分析库**，直接按时间戳切帧即可。这一条把数字人的实现难度降低了一个数量级。**务必开启**（详见 4.1 与 4.5）。

> ⚠️ **150 字上限是硬约束**：AI 的追问被限制在 25 字（见 1.6），正是为了既符合教学原则、又**单次 TTS 调用就能完成**（无需分段拼接）。长篇讲解播报必须分段调用 TTS 并用 `pcm` 流式拼接。

**✅ 核实到的中文音色（教育场景相关，节选自音色列表页「实时语音合成音色列表」）**：

| 音色 ID | 名称 | 推荐场景 | 类型 | 采样率 |
| --- | --- | --- | --- | --- |
| 402000 | 云晓芙 | 聊天女声 | 超自然大模型 | 8k/16k/24k |
| 402001 | 云小团 | 温柔甜美女声 | 超自然大模型 | 8k/16k/24k |
| 402002 | 云大围 | 磁性男声 | 超自然大模型 | 8k/16k/24k |
| 403000 | 云小朵 | **特色女童声** | 超自然大模型 | 8k/16k/24k |
| 403003 | 云小天 | **青春校园男声** | 超自然大模型 | 8k/16k/24k |
| 403004 | 云大川 | **活力男老师** | 超自然大模型 | 8k/16k/24k |
| 403005 | 云雅琴 | **沉稳女老师** | 超自然大模型 | 8k/16k/24k |
| 403006 | YunMia | 美音女助手 | 超自然大模型 | 8k/16k/24k |
| 403007 | YunLeo | 美音男助手 | 超自然大模型 | 8k/16k/24k |
| 502007 | 智小虎 | **聊天童声** | 超自然大模型 | 8k/16k/24k |
| 502006 | 智小悟 | 聊天男声 | 超自然大模型 | 8k/16k/24k |
| 502005 | 智小解 | 解说男声 | 超自然大模型 | 8k/16k/24k |
| 502004 | 智小满 | 营销女声 | 超自然大模型 | 8k/16k/24k |
| 502003 | 智小敏 | 聊天女声 | 超自然大模型 | 8k/16k/24k |
| 502001 | 智小柔 | 聊天女声 | 超自然大模型 | 8k/16k/24k |
| 602004 | 暖心阿灿 | 聊天男声 | 超自然大模型 | 8k/16k/24k |
| 602005 | 专业梓欣 | 聊天女声 | 超自然大模型 | 8k/16k/24k |
| 603000 | 懂事少年 | 特色男声 | （页面截断） | — |

> **选型建议**：数字人陪练的**主音色**推荐 **`403005` 云雅琴（沉稳女老师）** 或 **`403003` 云小天（青春校园男声）**——"老师"人设更贴合费曼讲解场景；若要更亲切可用 **`502007` 智小虎（聊天童声）** 做"学伴"人设。**建议在设置里提供 3 个音色让用户选**，中学生对这个非常敏感（有人讨厌被"老师"说教）。
> ⚠️ **价格差异警告**：文档明确写「**不同音色价格有差异**，详情请参见购买指南」，且音色分「精品音色 / 大模型音色 / 超自然大模型音色 / 一句话复刻音色」多档。**超自然大模型音色是最贵的一档**（🟡 推断），**并发限制也最低（10）**。
> ⚠️ **以官网为准**：[语音合成购买指南](https://cloud.tencent.com/document/product/1073/34112) 的**具体价格与免费额度本次未核实**（未打开该页）。**上线前必须现场确认**，并做「按字符计费 × 预计调用量」的成本模型。
> ⚠️ **未验证**：实时语音合成（流式）接口 `StreamTextToVoice` 的**文档 URL 与协议细节**。✅ 已确认音色列表页存在独立的「**实时语音合成音色列表**」小节，说明流式合成**产品确实存在**；文档页「下一篇」指向[实时语音合成](https://cloud.tencent.com/document/product/1073/94308)，**需落地前核实**。

**若要用声音复刻（不建议首发）**：`VoiceType = 200000000` 为一句话版声音复刻固定值，配 `FastVoiceType` 使用。⚠️ **强烈建议不要给未成年人做"老师声音复刻"**——涉及声音权、生物特征、以及"AI 冒充真人"的伦理问题（见第 6 节）。

### 3.2 开源 TTS 横评

> **核实状态**：与 2.4 相同——**仓库归属基于公开认知，License 与体积为 🟡 推断，本次未逐个打开仓库核实**。⚠️ 落地前必须核实。

| 项目 | 仓库（⚠️ 未逐个核实） | License | 体积 | 中文自然度 | 延迟 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| **Edge-TTS** | `github.com/rany2/edge-tts` | **GPL-3.0 ⚠️ 且条款风险高** | 极小（几 MB，模型在云端） | ⭐ **很高**（微软云音色） | 低（网络往返） | 🚨 **见下方风险警告** |
| **Piper** | `github.com/rhasspy/piper` / `OHF-Voice/piper1-gpl` | **GPL-3.0 ⚠️**（新仓库名含 "gpl" 暗示已变更） | 每音色约 20–60 MB ONNX | 中文**一般**（中文音色少） | ⭐ **极低**（本地 CPU 实时） | 适合离线兜底，**GPL 对闭源商业应用有传染性风险** |
| **Kokoro** | `github.com/hexgrad/kokoro`（+ `kokoro-onnx`） | Apache-2.0 ⚠️ | 约 80–330 MB | 中文支持**有限**（以英文为主） | 低 | 英文质量突出，**中文非强项** |
| **GPT-SoVITS** | `github.com/RVC-Boss/GPT-SoVITS` | MIT ⚠️ | 数 GB（含底模） | ⭐ 很高（少样本复刻强） | 中–高（需 GPU 才舒服） | 体积大、依赖重，**桌面端打包不现实** |
| **CosyVoice** | `github.com/FunAudioLLM/CosyVoice` | Apache-2.0 ⚠️ | 数 GB | ⭐ 很高，**支持流式** | 中（CPU 慢，GPU 好） | 阿里通义，效果好但重 |
| **ChatTTS** | `github.com/2noise/ChatTTS` | **AGPL-3.0 ⚠️** | 约 1–2 GB | 好（对话感强） | 中–高 | 🚨 **AGPL 对商业闭源应用风险最高** |
| **Windows 内置 SAPI** | 系统组件（`System.Speech` / SAPI5） | 随 Windows | **0**（已随系统） | 一般（Microsoft Huihui / Yaoyao 等中文音色） | ⭐ **极低** | ⭐ **零依赖零体积的兜底首选**；⚠️ 中文语音包是否预装需实测 |

> 🚨 **Edge-TTS 风险警告（重要）**：Edge-TTS 是**通过逆向调用微软 Edge 浏览器的在线朗读服务**实现的，**不是微软官方提供的 API**。这意味着：
> - 它**没有服务等级保证**，微软可随时改接口使其失效；
> - 它是**绕过官方计费**使用微软的服务，**商用存在明确的条款风险**（微软服务条款通常禁止此类未经授权的访问）；
> - 该仓库采用 **GPL-3.0**，链接进闭源商业产品会有**传染性**问题。
>
> **结论**：Edge-TTS **可用于个人原型验证，不建议用于参赛或商用的产品**。⚠️ 以上关于条款风险的判断是 **🟡 推断**（基于对同类服务条款的一般理解），**具体条款需进一步确认**。
>
> 🚨 **License 传染性总结（对闭源产品）**：**MIT / Apache-2.0** 可安全用于闭源商业产品；**GPL-3.0 / AGPL-3.0** 有传染性，**AGPL 尤其危险**（即使只做网络服务也可能触发开源义务）。若「格致」计划闭源或参赛后商业化，**优先选 MIT/Apache-2.0 的组件**。

**推荐的开源 TTS 组合（用于离线兜底）**：
1. ⭐ **首选：Windows 内置 SAPI 中文语音** —— 体积 0，延迟最低。⚠️ 需实测 Windows 11 中文语音包（Huihui / Yaoyao / Kangkang）是否存在及音质是否可接受。
2. **次选：Piper 中文音色** —— 若 SAPI 音质不可接受。⚠️ **但需先解决 GPL-3.0 的合规问题**。
3. **不推荐作为桌面端内置**：CosyVoice / GPT-SoVITS / ChatTTS（体积与依赖不现实），**但可作为服务端部署的高质量选项**。

### 3.3 工程要点：流式、边播边合成、打断、AEC 冲突

#### ① 流式合成与边播边合成

```
❌ 非流式（差）：
   LLM 出完整文本 → TTS 合成完整音频 → 播放
   └─ 首字延迟 = LLM 全文时间 + TTS 全文时间  →  常见 2–5 s，不可接受

✅ 流式（好）：
   LLM 流式出 token → 按标点/字数切句 → 每句立即 TTS → 音频队列边合成边播
   └─ 首字延迟 ≈ LLM 首 token + 首句 TTS  →  可压到 500–900 ms
```

**关键实现细节**：

- **切句策略**：按 `。！？；\n` 切句；单句超过 **50 字**时强制在逗号处再切（长句会拉长首包时间）。单句**不得超过 150 字**（腾讯云 TTS 硬限制，见 3.1）。
- **音频格式选 `pcm`**。`pcm` 是裸流，**可以直接用 Web Audio API 的 `AudioBufferSourceNode` 顺序调度**，无需解码 mp3/wav 容器头，省掉解码延迟。⚠️ 代价是必须自己管理采样率与声道（腾讯云返回 16k 单声道）。
- **用 `AudioContext` 的调度时间轴**而不是 `Audio.play()` 串联：为每段音频计算 `startTime = max(currentTime, previousEndTime)`，提前 `source.start(startTime)` 排队，实现**无缝衔接**（避免句间爆音/间隙）。
- **预取 1–2 句**。`Web Audio` 队列里始终保持至少 1 句待播，网络抖动时靠缓冲吸收。
- ⭐ **一个 TTS 请求对应一个「口型任务」**：因为 `EnableSubtitle` 返回字级时间戳，可以精确地在 `BeginTime` 时刻切换口型帧（见 4.1 / 4.5）。

#### ② 打断（Barge-in）

学生必须能随时打断 AI 说话——这是"陪练"与"播音"的根本区别。

```
状态：AI 正在播报
       │
       ├─ VAD 检测到学生说话（能量 + 语音概率超阈值，持续 > 200 ms）
       │        │
       │        ├─► 【立即】停止当前 AudioBufferSourceNode
       │        │        └─ 清空 AudioContext 队列里所有已调度但未播的 buffer
       │        │        └─ 取消所有 in-flight 的 TTS 请求（AbortController）
       │        ├─► 【立即】数字人从「说话」切到「聆听」
       │        ├─► 【立即】abort LLM 流式请求（否则 token 还在烧钱）
       │        └─► 【决策】被保留的半句要不要继续？
       │                 ├─ 是 → 记录 breakpoint，学生回答后从断点续播
       │                 └─ 否 → 丢弃，根据上下文重新生成回复
       │
       └─ VAD 未触发 → 正常播完
```

**打断的坑**：

| 坑 | 现象 | 解法 |
| --- | --- | --- |
| **只停了播放器，没停请求** | 静音了但仍在烧 TTS/LLM 额度 | 必须用 `AbortController` 取消 fetch；服务端也要能感知断连 |
| **队列残留** | 打断后过一会儿又冒出后半句 | 打断时清空整个调度队列 + 递增 `playbackGeneration` 计数器，旧队列的调度回调发现代次不符就丢弃 |
| **自触发（最致命）** | AI 的声音从扬声器出来被麦克风收进去 → VAD 以为学生说话了 → 打断自己 → 死循环 | 见下方 AEC 部分 |
| **打断太敏感** | 学生咳嗽、翻书、旁边同学说话就打断 | 阈值 + 最短持续时长 +（可选）关键词检测：只有"等等""不对""为什么"这类才算有效打断（🟡 推断） |

#### ③ 与 ASR 回声消除的冲突（本节最容易踩雷的地方）

**问题本质**：ASR 要听学生说话，但扬声器在放 AI 的声音。两者必须在**同一个物理空间**共存。

**两种模式，必须二选一或明确切换**：

| 模式 | 做法 | 优点 | 缺点 |
| --- | --- | --- | --- |
| **半双工（推荐首发）** | AI 说话时**不采集/不识别**；学生说话时**不播放**。用状态机硬隔离 | 实现简单、**零回声风险**、CPU 便宜 | 不能真正"抢话"，打断有延迟 |
| **全双工（体验好但难）** | `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })` + WebRTC AEC3 | 能自然抢话 | ⚠️ **AEC 对"扬声器播放的非语音内容"效果远不如对人声通话**；Electron 下 AEC 支持依赖 Chromium 版本与音频驱动；外放 + 音量大时残留严重 |

**✅ 浏览器 API 事实**：`getUserMedia` 的音频约束支持 `echoCancellation`、`noiseSuppression`、`autoGainControl` 三个布尔约束。

**工程建议（分层递进，不要一上来做全双工）**：

1. **首发走半双工 + 强制建议耳机**。首次使用时检测/询问是否有耳机；有耳机则回声问题基本消失。
2. **若必须外放**，额外做**软件侧回声抑制**：
   - 记录 TTS 播放时间轴（我们知道 AI 在什么时刻播了什么）；
   - **AI 播放期间直接丢弃 ASR 结果**（"播放门控"）——最粗暴但最可靠；
   - 播放停止后再开放 **150–250 ms 冷却期**（扬声器余音 + AEC 收敛），避免把尾音当学生说话。
3. **三级打断灵敏度**：
   - 播放中 → 只接受**高置信度、强能量**的语音（真正的大声抢话）；
   - 冷却期后 → 正常 VAD 灵敏度；
   - ⚠️ **未验证**：真实教室/卧室环境下外放时的误触发率。**这个数字必须实测，不能推算**。
4. **绝对不要**用「把麦克风增益调很低」来回避回声——学生会因为"AI 听不见我"而放弃。

**补充：VAD 与 ASR 的关系**

- VAD（Voice Activity Detection）用来**决定什么时候开始/结束一段话**，从而触发 ASR。
- ✅ **sherpa-onnx 自带 VAD 支持**（内部集成 Silero VAD 模型），所以**选了 sherpa-onnx 就等于免费获得 VAD**，不必再单独集成一套。
- 另有 **Silero VAD**（`github.com/snakers4/silero-vad`）可独立使用，模型很小（约 2 MB ONNX，⚠️ 体积未核实），支持 ONNX Runtime 直接调用。
- `webrtcvad`（Python 包 `py-webrtcvad`）：⚠️ 体积小但**维护不活跃**，中文场景表现一般，且是 Python 依赖。
- ⚠️ **未验证**：`ten-vad` 是否存在及其优势。

**推荐**：**直接用 sherpa-onnx 的 VAD**（零新增依赖），Silero VAD 作为备选。VAD 静音判定时长建议 **600–900 ms** —— 太短会把学生思考时的停顿切断（费曼讲解里学生必然要停下来想），太长则响应迟钝。⭐ 这个参数**建议做成用户可调的「我说话慢」开关**。

---

## 4. GIF 数字人（分层方案）

> **策略**：数字人**不是**本产品的核心竞争力，但它对中学生的**留存影响极大**。因此原则是「**先用最笨的办法做出来，把接口留好**」——一周内能看见会动、会听、会说的角色，远胜于花一个月调 Live2D。

### 4.1 方案 A：预渲染 GIF/APNG/WebP 状态机

#### 素材规格（建议）

| 状态 | ID | 循环 | 帧数建议 | 触发条件 |
| --- | --- | --- | --- | --- |
| 待机 | `idle` | 循环 | 40–80 帧（含眨眼、轻微呼吸） | 默认 |
| 聆听 | `listening` | 循环 | 30–60 帧（点头、侧耳、眼神跟随） | VAD 检测到学生在说 |
| 思考 | `thinking` | 循环 | 40–60 帧（歪头、转眼睛） | 提交给 LLM 后等待首个 token |
| 说话 | `speaking` | 循环 + **音量/时间戳驱动口型** | 口型帧组（见下） | TTS 播放期间 |
| 开心 | `happy` | 单次 → 回 idle | 30–50 帧 | 评分进步 / 学生讲对了 |
| 疑惑 | `confused` | 单次 / 短循环 | 20–40 帧 | 检测到知识缺口 / 追问前 |
| 鼓励 | `encouraging` | 单次 | 30–50 帧 | 学生讲错后（**必须比 happy 更常用**） |
| 离线 | `offline` | 循环 | 20 帧 | 网络不可用 |

#### ⭐ 格式选择：**不要用 GIF，用动画 WebP（或 APNG）**

| 格式 | Alpha 透明 | 色彩 | 体积 | Chromium/Electron 支持 |
| --- | --- | --- | --- | --- |
| **GIF** | ⚠️ **仅 1-bit 透明**（像素非全透即全不透）→ **边缘锯齿、白边** | 256 色 | 大 | ✅ |
| **APNG** | ✅ **8-bit alpha** | 24-bit 全彩 | 中 | ✅ |
| **动画 WebP** | ✅ **8-bit alpha** | 24-bit 全彩 | ⭐ **最小**（通常比 GIF 小 30–70 %） | ✅ Chromium 原生支持 |
| Lottie (JSON) | ✅ 矢量 alpha | 矢量 | 极小 | ✅ 需 `lottie-web` |

> **结论**：虽然需求写的是「GIF 数字人」，**实现上强烈建议用动画 WebP**。GIF 的 1-bit 透明会在角色边缘产生难看白边，在中学生审美里是"廉价感"的头号来源。**保留 GIF 仅作为导出选项**（兼容性兜底）。
> ✅ **事实**：GIF 的透明通道确为 1-bit（二值），APNG 与动画 WebP 均支持 8-bit alpha。
> ⚠️ **推论待验证**：动画 WebP 与 APNG 在 Electron/Chromium 中的**具体支持细节与性能**（尤其 8 个状态同时预加载时的内存占用）**未在本机实测**。建议 PoC 阶段实测。

#### 音量驱动口型帧（推荐做法）

```
TTS 播放
        │
        ├─► 【路径 1，推荐】用 TTS 字级时间戳（腾讯云 EnableSubtitle）
        │        └─ 按 Subtitles[].BeginTime/EndTime 直接切口型帧
        │        └─ 用 Phoneme（如 "ni2"/"hao3"）做元音分类 → 伪 viseme
        │        └─ ⭐ 零音频分析、CPU 占用近零、与语音天然同步
        │
        └─► 【路径 2，兜底】Web Audio AnalyserNode 能量驱动
                 ├─ 每帧（~33 ms / 30 fps）读取 RMS 或频域能量
                 ├─ 能量 → 口型档位（3–4 档就够）：
                 │      静音 → 闭嘴帧 ／ 低 → 半开 ／ 中 → 开 ／ 高 → 大张
                 ├─ fftSize 建议 256–512（口型不需要高分辨率）
                 ├─ 加平滑（一阶低通/移动平均，系数 ~0.3），否则口型高频抖动
                 └─ 加最小开合保持时间（如 80 ms），防单帧闪烁
```

> ⭐ **强烈建议做路径 1**：腾讯云 TTS 的 `Phoneme` 字段直接给出拼音，**这等于免费的 viseme 数据**。用拼音的韵母做元音分类（a/o/e/i/u/ü）映射到 5 个口型帧，效果显著优于纯音量驱动，且**完全不需要音频分析**。这是本方案里投入产出比最高的技巧。

#### 如何制作素材

| 途径 | 工具 | 产出 | 成本 | 版权注意 |
| --- | --- | --- | --- | --- |
| **Live2D 导出序列帧** | Live2D Cubism（见 4.2） | 每状态一段 PNG 序列 → 转 WebP | 需模型 + 学习成本 | Cubism 素材有其自己的授权规则 |
| **像素/2D 手绘动画** | **Aseprite**（[aseprite.org](https://www.aseprite.org/)） | 逐帧动画，可直接导出 GIF/APNG/WebP | 时间成本高，但完全原创 | ⭐ **原创最安全** |
| **AI 生成序列帧** | Stable Diffusion + 一致性控制（ControlNet / IP-Adapter / AnimateDiff） | 风格统一的多帧 | 中；⚠️ **帧间一致性难保证**（闪烁） | ⚠️ **训练数据版权不明确，商用需谨慎** |
| **购买/下载现成素材** | itch.io、OpenGameArt、Kenney | 现成角色包 | 低 | ⚠️ **必须逐个核对 License** |
| **3D 渲染导出** | VRM 模型 + Blender 逐帧渲染 | 高质量序列帧 | 高 | 模型 License 决定 |

⚠️ **Aseprite 授权注意**：其**源码可自行编译**（非商用），**官方二进制需付费购买**，两者授权不同。⚠️ 价格数字**未在本次核实，以官网为准**。这是常见的误用点。

**素材来源的版权红线（⚠️ 通用提醒，不构成法律意见）**：

1. **绝对不要**从网上搜"动漫 GIF"直接用 —— 绝大多数有版权，中学生产品一旦被投诉很难看。
2. **不要**用知名 IP 角色（动漫人物、游戏角色）—— 素材站标"免费"也可能只是"免费使用"而非"可商用/可再分发"。
3. **必须逐个核对**三件事：① 是否允许**商用**；② 是否要求**署名**（attribution）；③ 是否允许**修改**（derivative）。
4. **推荐做法**：**自己画 / AI 生成 + 明确原创**，或用 **CC0 / 公共领域**素材。把每个素材的来源 URL 与 License 文本**存进仓库的 `ASSETS_LICENSE.md`** —— 这是参赛/上架时必查的材料。
5. ⚠️ **AI 生成素材的版权状态在各地不一致**，用于商业产品前建议咨询；至少**保留生成过程记录**（prompt、模型、日期）作为创作证据。

### 4.2 方案 B：Live2D Cubism SDK for Web

| 项 | 说明 |
| --- | --- |
| 官方入口 | ⚠️ **未逐条核实**：Live2D 官网（`live2d.com`）、Cubism SDK 下载页、`github.com/Live2D/CubismWebSamples` 均**未在本次核实** |
| 能力 | 立绘分层 + 网格变形 + 物理演算 + 表情 / blink / 口型参数。**有标准的 `ParamMouthOpenY` 等参数**，天然适合口型驱动，效果远优于序列帧 |
| **License** | ⚠️ **关键且必须核实**：Cubism SDK 采用**分层授权**，一般对**小规模 / 低营收**使用者免费，超过门槛需付费（PRO / 发行授权），且可能要求**披露（publication license）**。⚠️ **具体门槛金额与披露要求本次未核实** —— **这是方案 B 能否采用的唯一决定性因素，必须优先查证** |
| Electron 可行性 | 🟡 推断可行（WebGL + Canvas），生态有 `pixi-live2d-display` 之类封装。⚠️ 这些第三方封装的**仓库 URL 与 License 均未核实**，且历史上因 Cubism SDK 版本变更而频繁失修 |
| 素材获取 | 需 Live2D 模型（`.moc3` + 纹理 + 物理配置）。自制需 Cubism Editor（⚠️ 免费版的功能/商用限制未核实）；官方有示例模型 |

**评价**：效果与可控性最好的 2D 方案，**但授权模型是硬门槛**。若「格致」是比赛项目 / 非商业 → 大概率可用；一旦商业化，**必须重新评估授权**。**建议：先用方案 A 上线，方案 B 只保留接口。**

### 4.3 方案 C：VRM + three.js + @pixiv/three-vrm

| 项 | 说明 |
| --- | --- |
| 核心库 | ⚠️ **未核实**：`github.com/pixiv/three-vrm`，npm 包 `@pixiv/three-vrm`（**仓库与 License 本次未打开核实**） |
| 能力 | 加载 **VRM** 格式 3D 模型；✅ VRM 标准定义了 **BlendShape / Expression**，含 `aa`/`ih`/`uu`/`ee`/`oo` 五个元音口型与 `blink` —— **这是为口型同步量身定做的**；通常配套提供**自动眨眼**与 **lipsync 示例** |
| Electron 可行性 | ⭐ **高**：three.js 在 Chromium 里是成熟路径，WebGL2 可用，桌面端有 GPU 加速，性能远好于浏览器 |
| **License** | ⚠️ `@pixiv/three-vrm` 的 License **未核实**（pixiv 系开源项目多为 MIT，但**必须确认**）；**VRM 模型本身的 License 由模型作者决定** —— ✅ VRM 元数据里有 `licenseName` / `commercialUssageName` 等正式字段 |
| 模型素材 | ⚠️ **未核实**：**VRoid Studio**（捏人建模，商用条款需查）、**Ready Player Me**（其头像的免费版商用条款**必须核实**）、[VRM Consortium](https://vrm-consortium.org/) 官方示例模型 |
| 体积代价 | three.js 运行时约 600 KB–1.5 MB（min+gzip，⚠️ 未核实）；VRM 模型通常 5–50 MB |

**评价**：3D 方案天花板最高，且 VRM 的 Expression 标准让口型同步几乎是"开箱可用"。**代价是**需要 3D 美术能力（捏模型、调材质、调光照），否则做出来会很丑 —— 而**对中学生来说"丑的 3D"比"简洁的 2D"更劝退**。

**推荐姿势**：**方案 C 作为长期演进方向**。等产品验证了"学生真的愿意对着数字人讲"之后，再投入 3D。届时可在设置里让用户选「2D 简洁 / 3D 形象」。

### 4.4 方案 D：音频驱动口型（离线预生成）

> **结论：不要用于实时交互。** 这些方案的价值在「**离线预生成高质量示范视频**」——例如老师讲解示范、知识点导入视频。

| 项目 | 仓库（⚠️ 未核实） | 实时性 | 适用判断 |
| --- | --- | --- | --- |
| **SadTalker** | `github.com/OpenTalker/SadTalker` | ❌ **慢**（分钟级 / 秒级音频） | 图像→说话头，质量好，**离线** |
| **MuseTalk** | `github.com/TMElyralab/MuseTalk` | ⚠️ 声称实时（需 GPU） | 实时数字人方向，**但需好显卡 + 工程量大** |
| **Wav2Lip** | `github.com/Rudrabha/Wav2Lip` | ❌ 慢 | 🚨 **License / 商用限制必须核实**（学术界常对该项目的商用有限制） |
| **NVIDIA Audio2Face** | ⚠️ 官方 URL 未核实 | ⚠️ 需 RTX | 🚨 **通常需 RTX 显卡 + 可能需 NIM/容器**；对普通学生笔记本不现实 |
| **Rhubarb Lip Sync** | `github.com/DanielSWolf/rhubarb-lip-sync` | ✅ 快（离线命令行） | ⭐ **实用**：输入音频 + 口型图集 → 输出**口型时间轴 JSON**。可批量预处理，体积小，不依赖 GPU |

**为什么实时性差（技术原因）**：

1. 这些模型是**扩散/生成式**的，推理需要数十到数百步迭代；
2. 输出是**逐帧图像**，1080p 下每帧都要重新渲染整个面部；
3. 大多数实现**没有为流式输入设计**——需拿到完整音频才能开始。

**降级用法（推荐）**：
- 用 **Rhubarb Lip Sync** 对**预置的 TTS 台词**离线生成口型时间轴 → 打包进应用 → 播放时直接读时间轴（**零运行时开销**）。这是"离线预生成"思想的正解。
- ⚠️ **隐性坑**：Rhubarb 的**音素集是英文的**（Preston Blair 口型集），**中文效果需实测**。⚠️ **未验证**。

### 4.5 推荐路线与状态机

#### 推荐：**先做 A，预留 B/C 接口**

| 阶段 | 做什么 | 交付 |
| --- | --- | --- |
| **P0（1 周）** | 方案 A：8 个状态的动画 WebP + 音量驱动口型 | 一个会眨眼、会听、会说的角色 |
| **P1（+1 周）** | 接入腾讯云 TTS 时间戳，口型改为**字级同步** | 口型与语音精确对齐 |
| **P2（按需）** | 抽出 `AvatarRenderer` 接口，方案 A 作为其一个实现 | 可替换渲染后端 |
| **P3（远期）** | 实现方案 B（Live2D）或 C（VRM）作为第二个实现 | 用户在设置里切换形象 |

**⭐ 关键工程决策：把数字人抽象成接口，而不是写死成"放 GIF"**

```ts
// 所有方案（A/B/C/D）都实现这一个接口
interface AvatarRenderer {
  /** 挂载到指定 DOM 容器 */
  mount(container: HTMLElement): Promise<void>;
  /** 切换表情状态 */
  setState(state: AvatarState): void;
  /** 设置口型开合度 0..1（音量驱动） */
  setMouthOpen(value: number): void;
  /** ⭐ 用 TTS 字级时间戳驱动口型（A 可按时间轴切帧；B/C 可映射到参数） */
  driveLipSync(timeline: LipSyncFrame[]): void;
  /** 打断：立即停止所有动画与口型调度 */
  interrupt(): void;
  /** 预加载资源，返回进度 0..1 */
  preload(onProgress: (p: number) => void): Promise<void>;
  destroy(): void;
}

type AvatarState =
  | 'idle' | 'listening' | 'thinking' | 'speaking'
  | 'happy' | 'confused' | 'encouraging' | 'offline';

interface LipSyncFrame {
  startMs: number;
  endMs: number;
  /** 0..1 开口度 */
  openness: number;
  /** 可选：音素（腾讯云 Subtitles[].Phoneme，如 "ni2"）→ 元音口型分类 */
  phoneme?: string;
}
```

> 这个接口只有 7 个方法，但它把「数字人」和「语音管线」彻底解耦。**P0 阶段的全部工作就是实现 `GifAvatarRenderer`**；将来换 Live2D 只需新增一个类，不改动任何业务代码。

#### 状态机与打断处理

```
                    ┌───────────────────────────────────────┐
                    │              idle（待机）              │
                    │  循环播放 idle.webp + 随机眨眼         │
                    └───┬─────────────┬─────────────┬───────┘
                        │             │             │
        VAD 检测到学生说话   用户点了"播放追问"   网络断开
                        │             │             │
                        ▼             ▼             ▼
              ┌──────────────┐  ┌──────────┐  ┌──────────┐
              │  listening   │  │ thinking │  │ offline  │
              │ （聆听）      │  │（思考）   │  │（离线）   │
              └──────┬───────┘  └────┬─────┘  └──────────┘
                     │               │
        VAD 判停（600–900ms 静音）    LLM 首 token / TTS 首包到达
                     │               │
                     ▼               ▼
              ┌──────────────┐  ┌──────────────────────────┐
              │ transcribing │  │      speaking（说话）      │
              │（转写/评分）  │  │  WebP 循环 + 口型帧覆盖    │
              └──────┬───────┘  └────┬───────────┬─────────┘
                     │               │           │
        评分完成      │      AI 说完   │    学生打断（VAD 强触发）
                     │               │           │
                     ▼               ▼           ▼
              ┌────────────────────────────────────────────┐
              │  结果分支：happy / encouraging / confused    │
              │  （单次播放 → 自动回 idle）                   │
              │  ⭐ encouraging 的触发频率应 ≥ confused 的 2 倍 │
              └────────────────────┬───────────────────────┘
                                   ▼
                                 idle
```

**打断处理（必须实现的四条）**：

| 场景 | 动作 |
| --- | --- |
| **AI 说话时学生抢话** | ① `interrupt()` 清空口型调度队列；② 停 AudioContext 播放；③ state → `listening`；④ 中止 TTS/LLM 请求；⑤ 记录"被打断"埋点（这是产品健康度指标） |
| **学生说话时用户点"跳过"** | 不会发生（不给这个按钮）—— **聆听态不允许被打断**，这是对学生的尊重 |
| **思考态超时（> 10 s）** | state → `confused` 播放一次，配一句"这个问题有点难，让我再想想"，然后继续等或提示重试。**不要让学生对着一个僵住的角色等** |
| **网络断开** | state → `offline`，同时切换到本地 ASR/TTS。**数字人要"表达"出这个问题**，而不是静默卡住 |

**⭐ 一条容易被忽略的产品原则**：**数字人的表情必须"滞后于"内容，而不是"预告"内容**。学生答错了先播 `encouraging`（共情），再进 `confused`（一起找问题）。如果一答错就立刻 `confused`，学生会感到被评判 —— 这是把"陪练"做成"考官"的最常见失误。

---

## 5. 语音环延迟预算

> **为什么延迟是生死线（🟡 推断，但有普遍工程共识）**：语音交互的容忍阈值远低于图形界面。一般认为：
> - **< 300 ms**：像跟人说话
> - **300 ms – 1 s**：可接受，略有迟滞感
> - **1–2 s**：开始觉得"它是不是没听懂"
> - **> 2 s**：中学生大概率会重复说一遍或直接放弃
>
> 因此本方案设定：**端到端首字反馈 ≤ 1.6 s，其中"AI 开始有反应"（动画 + 首个音节）≤ 400 ms**。**关键是让数字人先动起来**——感知延迟主要由第一个视觉/听觉反馈决定，而不是由完整回答决定。

### 5.1 全链路预算表

| # | 环节 | 技术方案 | 目标延迟 | 可接受上限 | 降级策略 |
| --- | --- | --- | --- | --- | --- |
| 1 | **麦克风采集** | `getUserMedia` + `AudioContext`，`sampleRate` 16000（避免重采样） | **10–30 ms**（缓冲） | 60 ms | 降低 `bufferSize`；`latencyHint: 'interactive'` |
| 2 | **VAD 判停** | sherpa-onnx 内置 VAD（或 Silero VAD ONNX） | **端内 600–900 ms 静音判定**（这是**设计参数**，不算延迟开销）；计算开销 **< 5 ms/帧** | 1.2 s | 动态缩短静音阈值；提供"我说完了"按钮兜底 |
| 3 | **音频上传 / 流式发送** | WebSocket 分片（实时识别）或整段 POST（一句话识别） | **50–150 ms** | 300 ms | 降至 16k 单声道 PCM（不传 wav 头）、启用压缩 |
| 4 | **ASR 识别** | 腾讯云实时识别（流式） | **首字 200–400 ms**；整段 **300–800 ms** | 1.2 s | ⭐ 切 sherpa-onnx 本地（**首字 100–300 ms**，精度略降） |
| 5 | **LLM 首 token** | DeepSeek 流式（`stream: true`） | **400–900 ms** | 1.5 s | ① 缩短 prompt（教材片段限 3–5 个）② 降低 `max_tokens` ③ 用更快的模型档位 ④ ⭐ 预置话术模板（"嗯，让我想想"）先播 |
| 6 | **评分（若在关键路径）** | DeepSeek structured output | **1.5–4 s** | 6 s | ⭐ **必须移出关键路径**：先出对话反馈，评分后台跑，评分完再推报告通知 |
| 7 | **TTS 首包** | 腾讯云流式 TTS（`pcm`） | **200–500 ms** | 900 ms | 切换 Windows SAPI 本地（**首包 < 100 ms**，音质下降） |
| 8 | **音频缓冲 & 播放** | Web Audio `AudioBufferSourceNode` 调度 | **20–50 ms** | 100 ms | 缩短预取；允许首句稍短的缓冲 |
| 9 | **动画响应** | `AvatarRenderer.setState()` + 口型调度 | **< 16 ms**（1 帧） | 50 ms | ⭐ **不等待任何网络**：VAD 触发即刻切 `listening`（本地事件） |

**端到端合成（关键路径：学生说完 → AI 首个音节出声）**：

```
VAD 判停 (600–900ms，设计参数)
  + 上传 150ms
  + ASR 首字 300ms
  + LLM 首 token 700ms
  + TTS 首包 350ms
  + 播放缓冲 50ms
  ───────────────────
  ≈ 1.55 s   ← 命中 1.6 s 目标

⭐ 优化版（先让数字人动）：
VAD 判停结束 → 【0 ms】数字人立刻转 thinking + 播放预置"嗯…"（本地音频，0 延迟）
             → 学生感知到反应 ≈ 0 ms（！）
             → 真实回答 1.55 s 后到达
```

> ⭐ **本报告最重要的延迟技巧：把「感知延迟」和「真实延迟」解耦**。数字人 + 预置填充音（"嗯…""让我想想"）在 **VAD 判停的同一帧**就启动，学生立刻感到"它在听"。真实回答可以慢慢来。**这一个技巧能让 1.5 s 的端到端延迟在体感上变成"几乎实时"**。

### 5.2 分阶段延迟目标

| 阶段 | 目标（端到端首音节） | 说明 |
| --- | --- | --- |
| **MVP（可用）** | **≤ 3.0 s** | 先跑通链路，接受明显迟滞 |
| **Beta（可接受）** | **≤ 1.8 s** | 加入流式 LLM + 流式 TTS |
| **发布（良好）** | ⭐ **≤ 1.2 s** | 加入预置填充音 + 数字人即时反馈 + 本地兜底 |
| **理想** | ≤ 0.8 s | 需要本地小模型 + 本地 TTS，成本高，**不建议首发追求** |

### 5.3 降级策略（按优先级自动触发）

| 触发条件 | 降级动作 | 影响 |
| --- | --- | --- |
| LLM 首 token > 1.5 s | 播放预置填充语 + 切 `thinking` 动画（长版） | 无（本来就是设计的一部分） |
| LLM 首 token > 4 s | 提示"网络有点慢"，并提供"再等等 / 用离线模式" | 体验下降 |
| 网络完全断开 | **全链路切本地**：sherpa-onnx ASR + Windows SAPI TTS；LLM 不可用 → **切预置题库驱动的规则对话**（不是纯离线 AI，而是脚本化追问） | ⭐ 仍可练习费曼讲解，只是没有智能追问 |
| 云端额度耗尽 | 同上 | 同上 |
| CPU 占用过高（> 80 %） | 关闭口型驱动（退化为静态"说话"动画）、降低动画帧率 | 视觉质量下降 |
| 麦克风不可用 | 切纯文字模式（打字讲解） | 失去口语练习，但保留费曼流程与评分 |

> ⭐ **「网络断开仍能用」是产品差异点，不是容错**。中学生在家里网络不稳是常态。**把离线模式做成一个明确的功能（"离线练习模式"）而不是一个错误提示**，反而会变成卖点。

### 5.4 测量方法（不要凭感觉优化）

```ts
// 建议的埋点：每个环节打一个高精度时间戳，落到本地 SQLite
const marks = {
  vad_end:      performance.now(),          // VAD 判定说完
  upload_start: performance.now(),
  asr_first:    0,                          // ASR 首个字符到达
  llm_first:    0,                          // LLM 首个 token 到达
  tts_first:    0,                          // TTS 首包到达
  play_start:   0,                          // 首个音节实际出声
  anim_switch:  0,                          // 数字人切换状态
};
// 关键指标（P50 / P95 都要看，只看均值会骗人）：
//   perceived_latency = anim_switch - vad_end      ← ⭐ 最重要，目标 < 100ms
//   real_latency      = play_start  - vad_end      ← 目标 < 1600ms
```

> **看 P95，不看均值**。均值 1.2 s 但 P95 是 5 s 的产品，学生会记住那 5 次卡顿。**建议把 P95 作为验收标准**。

---

## 6. 隐私合规

> **前提**：使用者是**未成年人**（中一到高三，含不满 14 周岁者），处理的是**声音（生物识别信息）**，且涉及**澳门与内地两个法域**。这不是"加个隐私政策"能解决的问题，必须**内建设计**。
> ⚠️ **本节为工程与产品层面的合规设计建议，不构成法律意见。正式上线前必须咨询具备澳门与内地执业资格的法律专业人士。**

### 6.1 涉及的法域与法规（⚠️ 法规条文与适用性需法律确认）

| 法域 | 法规 | 与本项目最相关的点 | 核实状态 |
| --- | --- | --- | --- |
| **澳门** | 第 8/2005 号法律《个人资料保护法》 | 个人资料处理需**正当性条件**；敏感资料（含生物特征）受限；未成年人资料需特别保护 | ⚠️ **未核实条文细节与最新修订**，须法律确认 |
| **内地** | 《个人信息保护法》(PIPL) | **不满 14 周岁**未成年人的个人信息属**敏感个人信息**，需**单独同意 + 监护人同意**，并需制定**专门的个人信息处理规则** | ⚠️ **未核实具体条款号**，须法律确认 |
| **内地** | 《未成年人网络保护条例》 | 未成年人网络产品/服务提供者的特殊义务 | ⚠️ **生效日期与条款未核实** |
| **内地** | 生成式人工智能服务管理规定 | 面向公众提供生成式 AI 服务可能需要**备案 / 安全评估** | ⚠️ **未核实**，但**这是"AI 学习应用"最容易被忽略的合规风险** |

> 🚨 **两个必须优先确认的问题（🟡 推断，但风险等级高）**：
> 1. **数据出境**：若使用腾讯云**跨境版** ASR，或使用境外 LLM/云服务，学生声音数据可能**出境**，这在两地都涉及额外合规要求。**建议首发只用境内节点 + 境内服务**。
> 2. **声音是否属于生物识别信息**：声音在 PIPL 下通常被认定为**生物识别信息**（属敏感个人信息），这意味着**更高的同意标准与更严的处理限制**。⚠️ 具体认定需法律确认，但**按"是"来设计是安全的选择**。这直接影响 2.1 节提到的 `CustomizationId`（自学习模型）——**建议首发完全不使用声音复刻/声纹相关功能**。

### 6.2 六条硬性设计原则

| # | 原则 | 具体做法 |
| --- | --- | --- |
| 1 | **默认最小化** | **默认不上传原始音频**。优先本地 ASR；必须上云时优先「上传转写文本 + 极短音频片段」而不是整段录音。腾讯云一句话识别支持**只上传必要片段**。 |
| 2 | **录音本地加密存储** | 音频文件用 **Electron `safeStorage`（Windows DPAPI）** 派生的密钥做 **AES-256-GCM** 加密后落盘；密钥不入库、不进日志、不随备份导出。加密后文件头不暴露可识别信息。 |
| 3 | **家长同意 + 学生知情** | **双层同意**：① 监护人（家长）明确同意；② 学生本人用他能听懂的语言被告知"你的声音会被怎样使用"。⭐ **不要只签一个勾选框**——建议做一个 30 秒的动画说明，学生和家长一起看。 |
| 4 | **一键删除（真删）** | 提供「删除所有录音」按钮，**同时**删除：① 本地加密音频；② 云端已上传的音频（调用云端删除接口）；③ 派生数据（转写文本、embedding）。⭐ **默认保留期越短越好（建议音频 7 天，转写文本可长期保留）**，且**到期自动物理删除**而非软删除。 |
| 5 | **可解释与可申诉** | 学生/家长可查看：用过哪些云服务、上传了多少分钟、AI 给了什么分、依据是什么（1.4 的 `evidence_quote` + `textbook_says` 就是这个用途）。**评分必须能申诉**（转写错误导致的误判要能修正）。 |
| 6 | **数据本地优先** | 学习记录（分数、缺口、复习卡片）**默认只存本地 SQLite**，不上传。若要做跨设备同步，**必须单独征求同意**，且默认关闭。 |

### 6.3 「一键删除录音」的实现清单

```
用户点击「删除所有录音」
        │
        ├─ 1. 弹出二次确认，明确告知将删除什么、不可恢复
        │
        ├─ 2. 本地：遍历 audio/ 目录，逐文件覆写 + 删除
        │       ⚠️ 注意：SSD 上覆写不保证物理擦除；如需更高保证应依赖
        │           OS 全盘加密（BitLocker）。不要向用户承诺"不可恢复"。
        │
        ├─ 3. 本地 DB：DELETE FROM explain_session WHERE audio_path IS NOT NULL
        │              （同时清 audio_path 字段，保留分数与报告）
        │              ⚠️ SQLite 需 VACUUM 才能真正释放页
        │
        ├─ 4. 云端：调用腾讯云侧删除接口，删除已上传的音频对象
        │       ⚠️ 未验证：腾讯云 ASR 是否留存请求音频、留存多久。
        │           这必须在采购前向腾讯云书面确认！这是本节的
        │           最大未知项 —— 若云端留存不可控，则「一键删除」
        │           在技术上无法真正实现，必须在隐私政策中如实披露。
        │
        ├─ 5. 派生数据：删除转写文本中的原始逐字记录
        │       （保留汇总分数，删除可还原语音内容的文本）
        │
        └─ 6. 写入审计日志：何时删除了什么（不含内容本身）
```

> 🚨 **本报告最重要的合规未知项**：**腾讯云 ASR/TTS 服务是否留存客户音频、留存多久、能否删除**。⚠️ **本次未核实**。若无法删除，则「一键删除录音」只能删除本地副本，**必须在隐私政策中如实说明"云端可能按法规要求留存"**——对家长坦诚比承诺后做不到要好得多。**这一条应在采购决策前就向腾讯云确认。**

### 6.4 产品层面的透明度设计（建议）

- **常驻状态指示器**：麦克风开启时明确显示（且系统托盘也有提示），**绝不后台偷听**。
- **录音回放可见**：学生能听到自己的录音（这本身就是费曼学习法"自我发现缺口"的一部分，见 1.5）。
- **不用于训练**：隐私政策里明确承诺**学生语音不用于训练任何模型**。⚠️ 需确认腾讯云是否会用客户数据改进模型，并在合同中排除。
- **家长报告页**：给家长的应该是**学习洞察**（如"在边界条件类缺口上反复出错"），而**不是**录音回放——避免把工具变成监控工具。⭐ **这一点做错会直接毁掉产品的学生信任**。
- **不要采集生物特征做身份识别**：不做声纹登录、不做人脸识别考勤。**没有必要，风险极高**。

---

## 7. 一句话建议

| 决策项 | 一句话建议 |
| --- | --- |
| **评分方案** | **用 DeepSeek structured output 输出 6 维 1–5 分 + 逐字证据引用（准确性 30 % / 覆盖 25 % / 逻辑 15 % / 通俗 13 % / 举例 12 % / 流畅 5 %），总分与等级由服务端代码按硬规则 R1–R4 重算，绝不信模型自报的总分** —— 判「说错了」必须逐字引用教材原文（可做子串校验当幻觉检测器），无证据的维度记 `null` 而不是给 0 分。 |
| **ASR** | **腾讯云实时语音识别（澳门用 `16k_zh-PY` 中英粤，内地用 `16k_zh`）+ 必开 `WordInfo` 词级时间戳与 `HotwordList` 热词；sherpa-onnx（本机已内置 22.43 MB 二进制，但需另配模型）做离线兜底，并按「高精度 / 纯离线 / 额度耗尽」三级自动路由** —— ASR 结果必须让学生可编辑，因为粤语/英混合的专业术语一定会被识别错，而错字会被 rubric 判成"说错了"。 |
| **TTS** | **腾讯云流式 TTS（`pcm` 裸流）+ 必开 `EnableSubtitle` 字级时间戳（含 `Phoneme` 拼音，等于免费 viseme 数据驱动数字人口型），主音色用 `403005` 云雅琴或 `403003` 云小天，追问控制在 25 字以避开 150 字上限；兜底用 Windows 内置 SAPI 中文语音（体积 0、首包 < 100 ms）** —— Edge-TTS 虽然音质最好但有 GPL-3.0 传染性与绕过官方计费的条款风险，**只可用于原型，不可用于参赛/商用产品**。 |
| **数字人** | **先做方案 A：8 个状态的动画 WebP（不用 GIF，因为 GIF 只有 1-bit 透明会产生难看的白边）状态机 + 口型字节级同步，一周内可见效果；同时抽出 7 方法的 `AvatarRenderer` 接口为 Live2D（方案 B）/ VRM（方案 C）预留位置** —— 关键产品原则是**表情要"滞后"于内容**（答错先 `encouraging` 共情再 `confused`），且 `encouraging` 的触发频率应 ≥ `confused` 的 2 倍，否则陪练就变成了考官。 |
| **延迟预算** | **端到端真实延迟目标 ≤ 1.6 s（P95 而非均值），但真正要守的是「感知延迟 ≤ 100 ms」—— 在 VAD 判停的同一帧就让数字人切 `thinking` 并播放本地预置填充音（"嗯…"），把感知延迟与真实延迟解耦；评分别放关键路径（后台跑完再推报告）** —— 各环节预算：上传 150 ms + ASR 首字 300 ms + LLM 首 token 700 ms + TTS 首包 350 ms + 播放缓冲 50 ms ≈ 1.55 s，任何一环超 1.5 倍就按 5.3 节自动降级（云端 → 本地 → 纯文字三级都要走通）。 |

---

## 附录 A：URL 清单（可点击）

✅ = 本次已 web_fetch / web_search 核实页面可访问；⚠️ = **未核实，落地前必须查证**。

**腾讯云 · 语音识别（ASR）**
- ✅ [语音识别 计费概述（在线版）](https://cloud.tencent.com/document/product/1093/35686) — 产品计费框架、免费额度「有/无」、预付费/后付费（页面更新 2026-09-08）
- ✅ [一句话识别 API 文档](https://cloud.tencent.com/document/api/1093/35646) — `SentenceRecognition` 全参数、`EngSerViceType` 枚举、Authorization 样例（更新 2025-12-30）
- ✅ [语音识别文档中心](https://cloud.tencent.com/document/product/1093) — 实时语音识别（WebSocket）入口
- ✅ [语音识别控制台](https://console.cloud.tencent.com/asr/settings)
- ✅ [腾讯云访问管理 CAM 文档](https://cloud.tencent.com/document/product/598)
- ⚠️ 实时语音识别 WebSocket 协议文档与鉴权方式 — **未找到确切 URL，须查证**
- ⚠️ 录音文件识别 / 极速版 `CreateRecTask` 文档 — **未核实 URL**
- ⚠️ ASR 具体阶梯价格与免费额度小时数 — **须以控制台/计费页为准**

**腾讯云 · 语音合成（TTS）**
- ✅ [基础语音合成 API 文档](https://cloud.tencent.com/document/product/1073/37995) — `TextToVoice` 全参数、150 字上限、`EnableSubtitle`、并发限制（更新 2026-03-30）
- ✅ [音色列表](https://cloud.tencent.com/document/product/1073/92668) — 含「实时语音合成音色列表」小节与音色 ID（更新 2026-09-29）
- ✅ [SSML 标记语言](https://cloud.tencent.com/document/product/1073/49575)
- ⚠️ [实时语音合成](https://cloud.tencent.com/document/product/1073/94308) — 链接取自文档页「下一篇」，**未打开核实**
- ⚠️ [语音合成购买指南](https://cloud.tencent.com/document/product/1073/34112) — **未打开核实**，价格以官网为准

**腾讯云 · 签名与安全**
- ✅ [签名方法 v3](https://cloud.tencent.cn/document/api/1823/132284) — TC3-HMAC-SHA256
- ✅ [tencentcloud-sdk-nodejs](https://github.com/TencentCloud/tencentcloud-sdk-nodejs) — 官方 Node.js SDK（链接出自 TTS/ASR 文档页开发者资源）

**开源 ASR / VAD（⚠️ 仓库 URL 与 License 均未逐个核实）**
- ⚠️ sherpa-onnx — `github.com/k2-fsa/sherpa-onnx`（**本机已内置其 Windows x64 二进制，✅ 实测 22.43 MB**）
- ⚠️ whisper.cpp — `github.com/ggml-org/whisper.cpp`
- ⚠️ faster-whisper — `github.com/SYSTRAN/faster-whisper`
- ⚠️ FunASR — `github.com/modelscope/FunASR`
- ⚠️ SenseVoice — `github.com/FunAudioLLM/SenseVoice`
- ⚠️ Vosk — `github.com/alphacep/vosk-api`
- ⚠️ Silero VAD — `github.com/snakers4/silero-vad`

**开源 TTS（⚠️ 仓库 URL 与 License 均未逐个核实）**
- ⚠️ Edge-TTS — `github.com/rany2/edge-tts`（**GPL-3.0 + 条款风险，不建议商用**）
- ⚠️ Piper — `github.com/rhasspy/piper` / `github.com/OHF-Voice/piper1-gpl`
- ⚠️ Kokoro — `github.com/hexgrad/kokoro`
- ⚠️ GPT-SoVITS — `github.com/RVC-Boss/GPT-SoVITS`
- ⚠️ CosyVoice — `github.com/FunAudioLLM/CosyVoice`
- ⚠️ ChatTTS — `github.com/2noise/ChatTTS`（**AGPL-3.0**）

**数字人 / 口型**
- ✅ [Aseprite 官网](https://www.aseprite.org/) — 像素动画工具
- ⚠️ Live2D Cubism SDK — `live2d.com`、`github.com/Live2D/CubismWebSamples`（**License 门槛必须核实**）
- ⚠️ `@pixiv/three-vrm` — `github.com/pixiv/three-vrm`（**License 未核实**）
- ✅ [VRM Consortium](https://vrm-consortium.org/) — VRM 规范与 Expression 定义
- ⚠️ VRoid Studio / Ready Player Me — **商用条款未核实**
- ⚠️ SadTalker — `github.com/OpenTalker/SadTalker`
- ⚠️ MuseTalk — `github.com/TMElyralab/MuseTalk`
- ⚠️ Wav2Lip — `github.com/Rudrabha/Wav2Lip`（**商用限制必须核实**）
- ⚠️ Rhubarb Lip Sync — `github.com/DanielSWolf/rhubarb-lip-sync`（⚠️ 音素集为英文，中文需实测）
- ⚠️ NVIDIA Audio2Face — **官方 URL 未核实**

**间隔复习算法**
- ✅ [SuperMemo Algorithm（官方帮助 wiki）](https://help.supermemo.org/wiki/SuperMemo_Algorithm)
- ✅ [SuperMemo 2 算法原文（镜像仓库）](https://github.com/clockzhong/OpenSuperMemo/blob/master/SM2/Docs/SuperMemo%202_%20Algorithm.html)
- ✅ [open-spaced-repetition（FSRS 组织）](https://github.com/open-spaced-repetition)
- ✅ [free-spaced-repetition-scheduler](https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler) — 基于 DSR 模型
- ⚠️ FSRS 官方文档站 — `open-spaced-repetition.github.io/fsrs/` **返回 404**，当前入口须另行确认
- ⚠️ `ts-fsrs`（TypeScript 实现）— **未核实**

**项目内部资料**
- [本机环境勘察报告](../docs/00-环境勘察报告.md)
- [智能层选型：DSH 作为 Agent 内核](../docs/01-智能层选型-DSH作为Agent内核.md)

---

## 附录 B：事实 / 推断 / 未验证 对照表

### ✅ 事实（本次已核实）

| # | 事实 | 来源 |
| --- | --- | --- |
| 1 | 腾讯云 ASR 计费按「免费额度 > 预付费 > 后付费」顺序扣费；后付费默认关闭需手动开启 | [计费概述](https://cloud.tencent.com/document/product/1093/35686) |
| 2 | 「实时语音识别」「录音文件识别」「一句话识别」「语音流异步识别」「录音文件识别极速版」**有免费额度** | 同上 |
| 3 | 带「大模型 1.0/2.0 版」「跨境版」的实时/录音文件识别**均标注「无」免费额度** | 同上 |
| 4 | `SentenceRecognition`：音频 **≤ 60 s、≤ 3 MB**，支持 wav/pcm/ogg-opus/speex/silk/mp3/m4a/aac/amr，默认频率 **30 次/秒**，`Region` 不需要传 | [一句话识别文档](https://cloud.tencent.com/document/api/1093/35646) |
| 5 | `EngSerViceType` 枚举含 `16k_zh`、**`16k_zh-PY`（中英粤）**、**`16k_yue`（粤语）**、`16k_zh_dialect`（23 种方言）、`16k_en` 等 | 同上 |
| 6 | `WordInfo` 可返回词级时间戳（0/1/2 三档） | 同上 |
| 7 | `HotwordList` 临时热词：单热词 ≤ 10 汉字、权重 1–11 或 100、最多 128 个；权重 100 开启同音替换（仅 `8k_zh`/`16k_zh`） | 同上 |
| 8 | ASR 使用**签名方法 v3**，Authorization 头为 `TC3-HMAC-SHA256 Credential=.../asr/tc3_request, SignedHeaders=content-type;host, Signature=...` | 同上 |
| 9 | `TextToVoice`：**中文 ≤ 150 汉字 / 英文 ≤ 500 字母**；`Codec` 支持 wav/mp3/**pcm**；采样率 8k/16k(默认)/24k | [基础语音合成文档](https://cloud.tencent.com/document/product/1073/37995) |
| 10 | `Speed` ∈ [-2, 6]（-2=0.6×，0=1.0×，6=2.5×，支持 2 位小数）；`Volume` ∈ [-10, 10] | 同上 |
| 11 | `EmotionCategory` 支持 17 种情感 + `EmotionIntensity` ∈ [50,200]，仅多情感音色 | 同上 |
| 12 | `EnableSubtitle` 返回 `Subtitles[]`，含 `BeginTime`/`EndTime`/**`Phoneme`（如 `ni2`/`hao3`）** | 同上 |
| 13 | TTS **支持 SSML** | 同上 |
| 14 | TTS 并发限制：精品 20 / 大模型 20 / **超自然大模型 10** / 一句话复刻 10 | 同上 |
| 15 | TTS 音色 ID 真实存在：`402000` 云晓芙、`403003` 云小天（青春校园男声）、`403004` 云大川（活力男老师）、`403005` 云雅琴（沉稳女老师）、`502007` 智小虎（聊天童声）等 | [音色列表](https://cloud.tencent.com/document/product/1073/92668) |
| 16 | 音色列表页含独立的「实时语音合成音色列表」小节 | 同上 |
| 17 | 腾讯云文档明示「不同音色价格有差异」 | 同上 |
| 18 | 本机 sherpa-onnx-win-x64 目录真实存在，含 5 个文件共 **23,518,088 字节（22.43 MB）**，其中 `onnxruntime.dll` 16.99 MB、`sherpa-onnx-c-api.dll` 4.41 MB、`sherpa-onnx.node` 0.66 MB | **本机实测（PowerShell）** |
| 19 | 该目录**无 `package.json`**；**只有 DLL 与 `.node`，没有任何 `.onnx` 模型文件** | 同上 |
| 20 | FSRS 相关仓库真实存在：`open-spaced-repetition` 组织、`free-spaced-repetition-scheduler`（基于 DSR 模型） | [GitHub](https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler) |
| 21 | SM-2 算法原文与说明可查 | [SuperMemo wiki](https://help.supermemo.org/wiki/SuperMemo_Algorithm) |
| 22 | `open-spaced-repetition.github.io/fsrs/` **返回 404** | **本次 web_fetch 实测** |
| 23 | `getUserMedia` 音频约束支持 `echoCancellation`/`noiseSuppression`/`autoGainControl` | Web 标准（🟡 未逐条查规范原文） |
| 24 | GIF 透明通道为 **1-bit**；APNG 与动画 WebP 支持 **8-bit alpha**；Chromium 原生支持动画 WebP | Web 格式规范常识（🟡 未逐条查规范原文） |

### 🟡 推断（基于事实的合理判断，未直接验证）

| # | 推断 | 依据 | 风险 |
| --- | --- | --- | --- |
| 1 | whisper.cpp License 为 MIT；faster-whisper 为 MIT；Vosk 为 Apache-2.0；sherpa-onnx 为 Apache-2.0 | 公开认知 | **中**——商用前必须核实 |
| 2 | Edge-TTS 通过逆向调用微软 Edge 朗读服务实现，商用有条款风险，且为 GPL-3.0 | 项目性质公开认知 | **高**——法律风险 |
| 3 | Piper 为 GPL-3.0（新仓库名 `piper1-gpl` 佐证）；ChatTTS 为 AGPL-3.0 | 名称与公开认知 | **高**——传染性 |
| 4 | Whisper 各规格体积（tiny≈75 MB / base≈142 MB / small≈466 MB / medium≈1.5 GB） | 参数量与量化常识 | 低 |
| 5 | 超自然大模型音色是 TTS 中最贵的一档 | 文档提示"不同音色价格有差异"+ 层级命名 | 中 |
| 6 | 双引擎（云端+本地）比对能提升识别可信度 | 工程直觉 | 低——但需实测收益 |
| 7 | 逐字引用教材原文可做**子串校验**当幻觉检测器 | 工程推理 | 低——**建议实测匹配率** |
| 8 | 输入法/ASR 幻觉风险：模型可能编造教材未覆盖的内容 | 常见 LLM 失效模式 | 中——**已用 prompt 约束缓解** |
| 9 | 追问长度 ≤ 25 字能提升学生回答率 | 教学经验 | 中——**需 A/B 实测** |
| 10 | 数字人表情"滞后"于内容比"预告"更好 | 教育心理学直觉 | 中——需实测 |
| 11 | 声音在 PIPL 下属生物识别信息（敏感个人信息） | 法律常识 | **高**——需法律确认 |
| 12 | 面向公众的生成式 AI 服务可能需要备案/安全评估 | 监管常识 | **高**——需法律确认 |
| 13 | 各环节延迟数字（ASR 首字 200–400 ms、LLM 首 token 400–900 ms 等） | 业内经验值 | **中**——**必须本机实测校准** |
| 14 | VAD 静音判定 600–900 ms 最适合费曼讲解场景 | 语音交互经验 | 中——需实测 |
| 15 | 方案 A/B/C 的具体体积（three.js ≈600 KB–1.5 MB、Piper 音色 20–60 MB 等） | 公开认知 | 低–中 |

### ⚠️ 未验证（落地前必须确认，按优先级排序）

| # | 未验证项 | 为什么重要 | 建议动作 |
| --- | --- | --- | --- |
| 1 | 🚨 **腾讯云 ASR/TTS 是否留存客户音频、留存多久、能否删除** | 直接决定「一键删除录音」能否真正实现 | **采购前书面向腾讯云确认** |
| 2 | 🚨 **Live2D Cubism SDK 的免费额度门槛与披露要求** | 决定方案 B 能否采用 | 查官方 License 页原文 |
| 3 | 🚨 **各开源项目的实际 License 文本** | 商用合规硬门槛 | 逐个打开仓库 LICENSE 文件 |
| 4 | 🚨 **生成式 AI 服务的备案/安全评估要求** | 可能阻塞上线 | 咨询法律专业人士 |
| 5 | 腾讯云 ASR/TTS 的**具体价格与免费额度数字** | 成本模型 | 查控制台/计费页 |
| 6 | 实时语音识别（WebSocket）的**协议文档 URL 与签名方式** | 主力方案的技术基础 | 查文档中心 |
| 7 | 实时语音合成 `StreamTextToVoice` 的**文档与协议** | 流式 TTS 是延迟目标的关键 | 查文档 |
| 8 | **DeepSeek 是否支持严格 `json_schema` structured output** | 决定 1.4 节 schema 的落地方式 | 实测 API |
| 9 | sherpa-onnx `.node` 的 **ABI 与格致将用的 Electron 版本是否兼容** | 决定能否直接复用 | 本机实测 require |
| 10 | sherpa-onnx **中文模型的具体选型、体积与 Windows CPU 实时性（RTF）** | 离线兜底方案的核心 | 下载模型实测 |
| 11 | **Windows 11 中文 SAPI 语音包是否存在、音质是否可接受** | 零依赖 TTS 兜底的前提 | 本机实测 |
| 12 | **动画 WebP 8 状态预加载的内存占用与性能** | 方案 A 的可行性 | PoC 实测 |
| 13 | **外放环境下 VAD 误触发率**（AEC 效果） | 决定能否做全双工打断 | 真实环境实测 |
| 14 | **中文 Rhubarb Lip Sync 的口型准确度** | 离线预生成方案的前提 | 实测 |
| 15 | **ASR 引擎在粤语/英语/普通话混说时的实际准确率** | 澳门场景的核心风险 | 用真实学生录音测试 |
| 16 | **`ts-fsrs` 等 TypeScript 间隔复习库的存在性与 License** | 实现路径 | 查 npm/GitHub |
| 17 | `@pixiv/three-vrm` 与 VRoid Studio / Ready Player Me 的 License | 方案 C 的合规 | 查官方页 |
| 18 | 本机 DeepSeek / 智谱明文 API Key 的吊销状态 | 已知安全风险 | 到控制台吊销轮换 |
| 19 | 人教版教材语料的来源与版权 | 1.5 节缺口诊断的数据基础 | 采购/授权评估 |
| 20 | 各延迟数字的**本机实测值** | 5.1 节预算表的校准 | 按 5.4 节埋点实测 |

---

> **报告状态**：本报告为**调研阶段产出**，其中所有「未验证」项（尤其附录 B 中优先级 1–4 的四项）**必须在技术方案冻结前完成核实**。
> **核实方法说明**：本报告中标注 ✅ 的腾讯云文档事实来自本次 `web_fetch` 实际抓取的页面正文；本机 sherpa-onnx 的字节数与文件清单来自 `Get-ChildItem` 实测；标 🟡 与 ⚠️ 的内容为推断或未能核实，**未编造任何 URL**。

