# 04 · 教材与题库数据源调研

> 代号「格致」· Windows 桌面端学习应用 · 数据来源与数据管道调研
> 调研日期：2026-09（本文件中的 URL 与数字均为**本次调研实测**所得）
> 报告性质：**调研与方案设计**。本次工作**未爬取、未批量下载、未分发任何受版权保护的内容**。
>
> **标注约定**
> - **[事实]** = 本次实际访问/实测/查询得到，附可核查 URL。
> - **[推断]** = 基于事实的工程判断，未经实测确认。
> - **[未能核实]** = 尝试过但无法确认，不编造。

---

## 0. 一句话总结

| 决策点 | 一句话建议 |
| --- | --- |
| **教材来源策略** | 唯一可规模化、可核查的合法入口是**国家中小学智慧教育平台**（`basic.smartedu.cn`）的免费电子教材；产品只做**官方链接跳转 + 用户本地导入 + 本地解析**，**绝不随安装包分发教材原文**。 |
| **OCR 与结构化方案** | 先用 PyMuPDF 探测文本层做分流；有文本层走 pdfplumber/PyMuPDF，无文本层走 **RapidOCR（ONNX，Apache-2.0，离线轻量）** 打底，质量要求高的科目再上 **MinerU / PP-StructureV3**（注意许可与显存）。 |
| **向量检索方案** | **SQLite 单文件 + FTS5（jieba 预分词写入）+ sqlite-vec 向量 + RRF 融合**；不要引入 Qdrant/Chroma 这类需要常驻服务端的组件。 |
| **题库获取优先级** | ① 官方免费公开（NOI 大纲、四校联考样题、联考考试大纲）；② 用户自行导入（真题 PDF）；③ 商业授权（学科网/菁优网/二一组卷，**必须买，不能爬**）。 |
| **组卷导出方案** | **Typst 为主**（单二进制、体积小、中文与数学公式好），**LaTeX + exam-zh 为备选/高级路线**（排版上限更高，但依赖大、exam-zh 已停维护）。 |

---

## 1. 教材来源与合法性

### 1.1 官方渠道实测

#### ① 国家中小学智慧教育平台（教育部主办）— **核心来源**

| 项目 | 实测结论 |
| --- | --- |
| 入口 | <https://basic.smartedu.cn/> （SPA，需浏览器 JS；curl 直取首页返回 403，属正常反爬） |
| 电子教材入口 | <https://basic.smartedu.cn/tchMaterial> |
| 是否需要登录 | **[事实]** 平台提供免登录浏览；但下载/部分资源需注册账号。具体以页面提示为准。 |
| 是否有公开 API | **[事实] 有，且实测可用**（见下） |

**[事实] 公开数据接口实测**（未登录、无 Cookie，直接返回 JSON）：

```
GET https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/version/data_version.json
→ {"module":"tch_material","module_version":1618934987,
   "urls":".../part_100.json,.../part_101.json,.../part_102.json,.../part_103.json"}

GET https://s-file-{1,2}.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/part_10{0,1,2,3}.json
→ 4 个目录分片，合计 33.5 MB

GET https://s-file-{1,2,3}.ykt.cbern.com.cn/zxx/ndrv2/resources/tch_material/details/{book_id}.json
→ 单本教材的明细，含 ti_items（文件清单）、ti_size（字节数）、tag_list（学段/年级/学科/版本）
```

**实测规模统计（本次抓全 4 个目录分片 + 逐本明细元数据，共 3579 次详情请求，只取元数据、未取任何教材文件）：**

| 指标 | 实测值 |
| --- | --- |
| 目录条目总数 | **3,579** |
| 标记 `电子教材` 的条目 | **2,925** |
| 标记 `教材` 的条目 | 1,708 |
| 成功解析到明细的条目 | 2,513 |
| 返回 403 未解析的条目 | 1,066（**目录里挂着但没发布文件的容器节点/未上线条目**，与实际发行量无直接关系） |
| 明细中 `ti_file_flag=source` 为 PDF 的条目 | **2,328** |
| 明细中 `ti_file_flag=source` 为 PPTX 的条目 | 179（多为「信息科技」课件） |
| 另有 `image`/`thumbnail` | 2,507（整页 JPEG 文件夹，非单文件） |

> **说明**：`data_version.json` 中 `module_version: 1618934987` 对应 2021-04-20，说明该目录结构自 2021 年起稳定未变，接口可靠性较高。[事实]

**面向「小学一年级→高中三年级」的目标子集（实测）：**

| 指标 | 实测值 |
| --- | --- |
| 小学/初中/高中 · 电子教材（排除特殊教育） | **1,748 本** |
| 其中实际带 PDF 可下载 | **1,742 本** |
| **原始 PDF 合计体积** | **138.59 GB** |
| 单本体积 中位数 / 均值 / p90 / 最大 | **48.5 MB** / 81.5 MB / 198.1 MB / 495.4 MB |
| 分学段 | 小学 880 本 / 76.7 GB；初中 352 本 / 24.3 GB；高中 516 本 / 37.6 GB |

**出版方分布（目标子集，Top 10，实测）：**

| 出版社 | 本数 | 体积 |
| --- | --- | --- |
| 人民教育出版社 | 269 | 5.41 GB |
| 广东教育出版社 | 107 | 8.59 GB |
| 上海教育出版社 | 80 | 6.91 GB |
| 外语教学与研究出版社 | 78 | 8.97 GB |
| 北京师范大学出版社 | 65 | 3.44 GB |
| 教育科学出版社 | 63 | 9.26 GB |
| 人民美术出版社 | 59 | 3.23 GB |
| 江苏凤凰少年儿童出版社 | 56 | 8.31 GB |
| 人民音乐出版社 | 52 | 2.02 GB |
| 江苏凤凰教育出版社 | 51 | 2.37 GB |

**电子教材格式判定 —— 这是本次调研最关键的技术结论之一：**

**[事实]** 单本 PDF 体积中位数 48.5 MB，而平台同书的页级预览图数量中位数为 49 页 → **中位码率约 872 KB/页**（n=2328 全量计算：p25=423 KB、中位 872 KB、p75=2,010 KB、p90=4,093 KB）。

**[推断]** 这个码率说明这些 PDF **不是原生排版 PDF（那通常 20–80 KB/页），而是高分辨率页面图像封装成的 PDF**。因此：

> **「人教版教材有没有文本层」这个问题，必须假设答案为「大概率没有」，把 OCR 当作流水线的必经环节而非异常分支。**

**[建议的落地动作]** 在管道入口加一个**文本层探针**（不是推断，是实测）：

```python
import pymupdf  # PyMuPDF
doc = pymupdf.open(path)
chars = sum(len(p.get_text().strip()) for p in doc)
has_text_layer = (chars / max(doc.page_count, 1)) > 50   # 阈值需按语料校准
```

「每页字符数 < 50」判为扫描件，送 OCR；否则走文本提取分支。**注意：本次调研刻意没有下载任何教材文件去验证这一点，留待工程阶段用 2–3 本样本实测。**

**其他官方/半官方渠道：**

| 渠道 | URL | 说明 |
| --- | --- | --- |
| 人民教育出版社官网 | <https://www.pep.com.cn/> | 实测 HTTP 200。数字教材产品线另有独立入口（人教数字教材 PC 端操作手册见 <https://czpt.mypep.cn/pdf/人教数字教材操作帮助手册（PC）.pdf>，实测可下载） |
| 原国家中小学网络云平台 | <https://www.zxx.edu.cn/> | 实测 HTTP 200，与智慧教育平台同源整合 |
| 广东省教育资源公共服务平台 | <http://zy.gdedu.gov.cn/> | 实测存在并托管真实教学资源（见 §3.1） |
| 教育部课程教材研究所 | <http://www.moe.gov.cn/> 体系 | 课程标准原文入口见 §1.3 |

**第三方下载工具（仅作为「接口结构已被外界验证」的旁证，不建议直接依赖）：**

- <https://github.com/hantang/smartedu-dl-go> — Go 实现，支持 PDF 教材/课件/音频/视频 [事实：仓库存在]
- <https://github.com/maplexuci/pdf_book_download_from_zxxeducn> — Python 实现，README 自述覆盖小初高全部出版社版本 + 五四学制 + 特殊教育 [事实：仓库存在，脚本已实测拉取]

**[推断]** 这些工具的存在反证了「接口无鉴权、结构长期稳定」，但也同时说明**平台侧存在被滥用的风险**。产品若采用此接口，应严格限速、只取用户明确指定的一本、并缓存到本地，不做镜像式全量拉取。

---

### 1.2 法律边界（**必读，产品设计的硬约束**）

**[事实] 中国法律依据**（二一组卷版权声明中引用的条款，可核查原文）：

> 根据《中华人民共和国著作权法》第十条的规定，著作权包括署名权、修改权、复制权、信息网络传播权等。未经权利人许可，复制、发行、表演、放映、广播、汇编、通过信息网络传播其作品的，一经查实，行政执法部门将依据《中华人民共和国著作权法》第五十三条、《信息网络传播权保护条例》第十八条的规定予以处罚。
> — <https://zujuan.21cnjy.com/help/copyright>

**[事实] 教科书是明确的著作权客体。** 即使国家中小学智慧教育平台「免费提供」，免费 ≠ 授权再分发：

| 行为 | 法律定性 | 结论 |
| --- | --- | --- |
| 用户在官方平台**在线浏览**电子教材 | 平台已获授权，个人浏览属正常使用 | ✅ 合规 |
| 用户**自行下载**一本教材到本机个人学习 | 个人学习、研究性质的使用，风险低 | ⚠️ 灰度但可接受（需在协议中明确由用户自行完成） |
| 软件**内置/随安装包分发**教材 PDF 或 OCR 全文 | 侵犯复制权 + 信息网络传播权 | ❌ **绝对禁止** |
| 软件**首次运行时自动从官方站点批量下载全量教材** | 可能构成对平台的非授权批量获取（且平台服务条款通常禁止） | ❌ **禁止** |
| 软件**提供教材原文/全文检索结果的对外分享功能** | 二次分发 | ❌ 禁止（检索结果仅限本机用户自己看） |
| 把 OCR 文本做成**知识点/目录结构**并随软件分发 | 事实性信息、体系结构通常不受版权保护，但**表述性内容（例题原文、课文）受保护** | ⚠️ 可做「结构 + 知识点」，不可做「原文」 |

**产品层必须落地的四件事：**

1. **免责声明**（首次启动 + 设置页常驻）：
   > 本软件不附带、不分发任何教材或试题原文。教材内容由用户自行从国家中小学智慧教育平台等官方渠道获取并导入本机，仅供个人学习使用。请勿将导入内容用于二次分发或商业用途。
2. **架构隔离**：教材原文与 OCR 全文**永远只存在于用户本机数据库**，不进入任何默认同步/云备份路径。
3. **不放种子/不做镜像**：不提供 P2P、不做资源站镜像、不内置任何教材下载直链（只内置**官方页面跳转**）。
4. **导出水印**：当用户导出的 PDF 中含教材原文片段时，加水印「个人学习用途，请勿传播」+ 来源标注。

**合规的替代与补充素材：**

| 素材 | URL | 许可 / 说明 |
| --- | --- | --- |
| 义务教育课程方案和课程标准（2022年版）全文 | <http://www.moe.gov.cn/srcsite/A26/s8001/202204/t20220420_619921.html>（教材〔2022〕2号） | [事实] 教育部官网，实测 HTTP 200，含 16 个课程标准附件。**这是教材目录/知识点体系的官方权威骨架** |
| 普通高中课程方案和课程标准 | 教育部官网 `moe.gov.cn` 检索「普通高中课程方案和课程标准（2017年版2020年修订）」 | [推断] 同一发布体系，建议在工程阶段补录精确 URL |
| NOI 大纲（2025 版） | <https://www.noi.cn/upload/resources/file/2025/04/18/NOI_Syllabus_Edition_2025.pdf> | [事实] 实测 HTTP 200，21.7 MB，CCF 官方发布。**信息学知识树的最佳权威依据** |
| OpenStax 开放教科书 | <https://openstax.org/> | [事实] 站点可访问，许可页 <https://openstax.org/license> HTTP 200。CC BY 系列，可自由分发（英文为主，理科可作补充） |
| Wikipedia / Wikidata | <https://www.wikidata.org/> | [推断] CC0（Wikidata）/ CC BY-SA（Wikipedia），可作知识图谱骨架。**工程阶段需逐个数据集核实许可** |
| OI Wiki | <https://oi-wiki.org/> | [事实] README 明确「可以自由地共享、演绎，但是必须署名、以相同方式共享」→ **CC BY-SA 系列**。中文算法知识的最佳开放来源 |

---

## 2. 教材内容结构化管道设计

### 2.1 PDF 文本层提取 vs 扫描件 OCR

**许可与版本实测（全部来自 PyPI JSON API `https://pypi.org/pypi/{pkg}/json`）：**

| 库 | 版本 | License | 桌面离线 | 备注 |
| --- | --- | --- | --- | --- |
| **PyMuPDF** | 1.28.2 | **AGPL-3.0 或 Artifex 商业授权（双授权）** | ✅ | 速度最快，但 **AGPL 对闭源商业桌面软件是硬约束** |
| **pdfplumber** | 0.11.10 | **MIT** | ✅ | 表格/字符级信息强，慢 |
| pypdf | 6.19.0 | **BSD-3-Clause** | ✅ | 纯 Python，适合拆分/合并/元数据 |
| pdfminer.six | 20260107 | **MIT** | ✅ | pdfplumber 的底层 |

> ⚠️ **重要许可警示 [事实]**：PyMuPDF 是 **AGPL-3.0 / 商业双授权**（PyPI 元数据原文：`Dual Licensed - GNU AFFERO GPL 3.0 or Artifex Commercial License`）。若「格致」闭源分发，**要么购买 Artifex 商业授权，要么改用 pdfplumber（MIT）/ pypdf（BSD）**。
> [推断] 实务折中：**开发与本地批处理阶段用 PyMuPDF**（自用不构成分发），**随产品分发的运行时改用 pdfplumber/pypdf**；或直接买授权。

**OCR 引擎对比（版本/License 实测）：**

| 引擎 | 版本 | License | 中文 | 桌面离线 | 备注 |
| --- | --- | --- | --- | --- | --- |
| **RapidOCR** | rapidocr 3.9.2 / rapidocr-onnxruntime 1.4.4 | **Apache-2.0** | ✅ 好 | ✅✅ **ONNX Runtime，无 Paddle 依赖，最轻** | 文档 <https://rapidai.github.io/RapidOCRDocs> |
| **PaddleOCR** | 3.7.0 | **Apache-2.0** | ✅✅ 最好 | ⚠️ 需 PaddlePaddle（3.3.1，Apache-2.0），CPU 包体积大 | <https://github.com/PaddlePaddle/PaddleOCR>（★90,478） |
| Tesseract | — | Apache-2.0 | ⚠️ 中文（chi_sim）明显弱于 Paddle 系 | ✅ | <https://github.com/tesseract-ocr/tesseract>（★76,777） |
| EasyOCR | 1.7.2 | Apache-2.0 | ⚠️ 一般 | ⚠️ 依赖 PyTorch | 体积大 |
| 云端 OCR（腾讯/百度/阿里） | — | 商业 | ✅✅ | ❌ 需联网 | **与「本地优先、不经手教材原文」的合规原则冲突，建议排除** |

**[建议] OCR 分流策略：**

```
PDF 输入
 ├─ 文本层探针（PyMuPDF/pdfplumber）
 │   ├─ 有文本层（>50 字/页）──→ 直接用文本层（快、准、零成本）
 │   └─ 无文本层 ──→ OCR 分支
 │            ├─ 默认：RapidOCR（ONNX，Apache-2.0，CPU 可跑，离线）
 │            └─ 高价值科目（数学/物理/化学）：MinerU / PP-StructureV3（公式+表格+版面）
 └─ 输出：Markdown/JSON（含标题层级、公式 LaTeX、表格、图片引用）
```

---

### 2.2 版面分析工具对比（仓库/License/星数均为**本次 GitHub 实测**）

| 工具 | 仓库 | License | ★ | 中文 | 输出 | 离线可行性 |
| --- | --- | --- | --- | --- | --- | --- |
| **MinerU** | <https://github.com/opendatalab/MinerU>（PyPI `mineru` 4.0.10） | **MinerU Open Source License**（自定义，非 OSI 标准；旧包 `magic-pdf` 为 AGPL-3.0） | 80,914 | ✅✅ | Markdown + JSON，公式/表格强 | ⚠️ 需 GPU 更佳，CPU 很慢 |
| **PP-StructureV3** | PaddleOCR 内置（`paddleocr` 3.7.0） | **Apache-2.0** | 90,478 | ✅✅ | Markdown/JSON，版面+表格+公式 | ✅ 可 CPU |
| **docling**（IBM） | <https://github.com/docling-project/docling>（PyPI `docling` 2.131.0） | **MIT** | 68,239 | ✅ | 统一 DoclingDocument，可转 MD | ✅ 最宽松许可，推荐候选 |
| **marker** | <https://github.com/datalab-to/marker>（PyPI `marker-pdf` 2.0.0） | **Apache-2.0**（代码）；模型权重另有条款，**须逐个核实** | 40,133 | ✅ | Markdown + JSON | ⚠️ 需 GPU 体验好 |
| **Surya** | <https://github.com/datalab-to/surya>（PyPI `surya-ocr` 0.22.1） | Apache-2.0（代码） | 21,431 | ✅ 90+ 语言 | 版面/阅读顺序/表格 | ⚠️ 需 GPU |
| **unstructured** | <https://github.com/Unstructured-IO/unstructured>（PyPI `unstructured` 0.27.10） | **Apache-2.0** | 15,520 | ✅ | 元素级切分，适合 RAG | ✅ |
| **Nougat** | <https://github.com/facebookresearch/nougat>（PyPI `nougat-ocr` 0.1.17） | 代码 MIT；**模型权重 CC-BY-NC-4.0（非商用）** | 10,081 | ⚠️ 中文一般 | Markdown + LaTeX | ⚠️ **NC 许可不可用于商业产品** |
| **olmOCR** | <https://github.com/allenai/olmocr>（PyPI `olmocr` 0.4.27） | Apache-2.0 | 19,684 | ✅ | 线性化文本 | ⚠️ 需 GPU + VLM |
| **LaTeX-OCR / pix2tex** | <https://github.com/lukas-blecher/LaTeX-OCR>（PyPI `pix2tex` 0.1.4） | **MIT** | 16,577 | 公式专用 | 图片公式 → LaTeX | ✅ **强烈推荐，专门解决公式** |

**[事实] 许可层面的关键结论：**
- ✅ **可安全用于闭源分发**：docling(MIT)、PP-StructureV3(Apache-2.0)、marker 代码(Apache-2.0)、unstructured(Apache-2.0)、pix2tex(MIT)、RapidOCR(Apache-2.0)
- ⚠️ **需谨慎**：MinerU（自定义许可，须读全文）、marker/surya 的模型权重、PyMuPDF（AGPL）
- ❌ **不可用于商业产品**：Nougat 模型权重（CC-BY-NC-4.0）

**[建议] 分阶段策略：**

| 阶段 | 方案 | 理由 |
| --- | --- | --- |
| Phase 1（先跑通） | PyMuPDF 文本层探针 + RapidOCR 兜底 + pix2tex 公式 | 全离线、许可干净、CPU 可跑 |
| Phase 2（提质） | docling（MIT）做版面分析主力 | 许可最宽松，输出统一文档模型 |
| Phase 3（攻坚） | MinerU / PP-StructureV3 处理数学物理化学的重公式页 | 质量最高，作为离线批处理工具（不随产品分发，规避许可） |

> **[推断] 关键工程技巧**：把重模型（MinerU/PP-StructureV3）做成**独立的、只在你自己的构建机上运行的离线批处理脚本**，产物（Markdown + JSON）随产品分发或供用户下载。这样：
> ① 绕开重模型的许可/体积问题；② 用户端只需解析已结构化好的文本，零 GPU 需求；③ 产物是可再生成的衍生数据。

---

### 2.3 章节切分与知识点抽取

**三级切分策略（从可靠到兜底）：**

| 级别 | 方法 | 可靠性 |
| --- | --- | --- |
| L1 · 目录树 | 教材 PDF 的目录页 / PDF 书签（`doc.get_toc()`） | 最高，优先用 |
| L2 · 标题正则 | 中文教材典型章节模式：`第[一二三四五六七八九十百]+[章节课]`、`^\d+(\.\d+)*\s`、`[一二三四五六七八九十]+、` | 中，需按出版社调规则 |
| L3 · 版面模型 | MinerU/docling 输出的标题层级（`#`/`##`/`###`） | 高，但依赖版面工具质量 |
| L4 · LLM 兜底 | 把连续 3–5 页文本交给 LLM 判断「此处是否为新章节起点」 | 兜底，成本可控（只在 L1–L3 冲突时调用） |

**[建议] 知识点抽取的 Prompt 设计思路**（不是让 LLM 自由发挥，而是**受约束的结构化输出**）：

```
系统角色：你是 K-12 学科知识图谱构建专家。

输入：<章节标题> + <该章节正文（截断到 3000 字）> + <学段/年级/学科> + <对应的课程标准条目>

要求：
1. 只抽取**该章节实际讲授**的知识点，不要补充章节外的内容。
2. 每个知识点必须能在原文中找到依据，输出 evidence 字段（原文片段，≤50字）。
3. 粒度约束：一个知识点对应「一个可在 40 分钟内讲完并可单独出题」的最小单元。
   反面例子：「函数」（太粗）；正面例子：「一次函数的图象与 k、b 符号的关系」。
4. 先修关系只输出**直接先修**（A 是 B 的直接前提），不要输出传递闭包。
5. 无法确定的一律留空，禁止猜测。

输出 JSON Schema：
{
  "knowledge_points": [{
    "name": "string, ≤20字",
    "aliases": ["string"],
    "description": "string, ≤120字",
    "difficulty": 1|2|3|4|5,
    "evidence": "string, 原文片段",
    "bloom_level": "记忆|理解|应用|分析|评价|创造"
  }],
  "prerequisites": [{"from": "知识点name", "to": "知识点name", "reason": "string"}]
}
```

**[建议] 质量控制三件套：**
1. **闭集校验**：知识点名称必须来自「课程标准条目 + 教材目录」构成的候选集，LLM 只能选择或细粒度拆分，不能凭空造。
2. **双向一致性**：先修关系做环检测（拓扑排序），有环则打回重生成。
3. **抽样人工复核**：每学科抽 30 个知识点人工核对，准确率 < 90% 则调整 prompt。

---

### 2.4 向量库与检索

#### 2.4.1 向量库选型（均为**本次实测**的仓库/License/星数）

| 方案 | 仓库 / 版本 | License | ★ | 桌面嵌入 | 结论 |
| --- | --- | --- | --- | --- | --- |
| **sqlite-vec** | <https://github.com/asg017/sqlite-vec>（PyPI 0.1.9） | **MIT / Apache-2.0 双许可** | 8,155 | ✅✅ **SQLite 扩展，单文件，零服务端** | 🏆 **首选** |
| LanceDB | <https://github.com/lancedb/lancedb>（PyPI 0.39.0） | Apache-2.0 | 11,567 | ✅ 嵌入式列存 | 备选（多一个目录格式） |
| Chroma | <https://github.com/chroma-core/chroma>（PyPI 1.5.9） | Apache-2.0 | 29,418 | ⚠️ 偏服务端 | 不推荐 |
| Qdrant | <https://github.com/qdrant/qdrant>（PyPI `qdrant-client` 1.19.1） | Apache-2.0 | 34,891 | ❌ 需常驻服务 | 不推荐 |
| FAISS | <https://github.com/facebookresearch/faiss>（PyPI `faiss-cpu` 1.15.1） | **MIT** | 41,005 | ✅ 纯库 | 备选（需自管持久化） |

#### 2.4.2 全文检索与中文分词 —— **本报告最重要的技术坑**

**[事实] SQLite FTS5 `unicode61` 分词器对中文的行为**（原文见 <https://www.sqlite.org/fts5.html> §4.3.1）：

> 所有被 Unicode 归入 general category 以 `L` 或 `N` 开头，或属于 `Co` 的字符都被视为 token 字符；其他字符视为分隔符。
> 默认 `categories` 选项值为 `"L* N* Co"`。

**[推断]** 汉字属于 `Lo`（Letter, other），完全落入 `L*` → **被当作 token 字符**。而中文没有空格，所以「国家中小学智慧教育平台」会被切成一个 token。

> 🔴 **结论：用 FTS5 默认 `unicode61` 对中文做检索，用户搜「智慧教育」无法命中「国家中小学智慧教育平台」。这是必须解决的拦路虎。**

**三种解法（按推荐度）：**

| 方案 | 做法 | 优点 | 缺点 |
| --- | --- | --- | --- |
| 🏆 **jieba 预分词写入** | 写入 FTS 表前先 `" ".join(jieba.cut(text))`，查询时同样分词后拼接 | 分词质量最好、可控、支持用户词典（教材专有名词） | 需在写入/查询两侧保持一致 |
| **trigram tokenizer** | `CREATE VIRTUAL TABLE ... USING fts5(body, tokenize='trigram')` | SQLite 内置（3.34+），**额外支持索引化 LIKE/GLOB**，无需外部分词器 | 索引体积约 3 倍，无法做词干/同义 |
| ICU tokenizer | 需编译带 ICU 的 SQLite | 多语言通用 | **Windows 上编译麻烦，不建议** |

**分词器选型（实测）：**

| 工具 | 版本 | License | 状态 | 建议 |
| --- | --- | --- | --- | --- |
| **jieba** | 0.42.1 | **MIT** | ★35,175，更新停滞（0.42.1 发布于 2020） | 🏆 **首选**：成熟、纯 Python、支持自定义词典 |
| **LAC**（百度） | 2.1.2 | **Apache-2.0** | ★4,001 | 备选：准确率更高，但依赖 Paddle |
| HanLP | 2.1.5 | Apache-2.0 | 活跃 | 重型，功能过剩 |
| pkuseg | 0.0.25 | **Other/Proprietary** ⚠️ | 停滞 | ❌ 许可不明确，排除 |

**中文 Embedding 模型（**需在工程阶段用 HuggingFace 页面逐个复核 License**）：**

| 模型 | 维度 | 说明 | 实测状态 |
| --- | --- | --- | --- |
| **BAAI/bge-m3** | 1024 | 多语言、长文本（8192）、中文强 | [事实] PyPI `FlagEmbedding` 1.4.2 可用，<https://github.com/FlagOpen/FlagEmbedding>（★12,209）自述 MIT；**模型权重许可须单独复核** |
| BAAI/bge-large-zh-v1.5 | 1024 | 中文专用，更小 | [推断] 同上体系 |
| 通义 text-embedding-v3 | — | 云端 API | ❌ 与离线原则冲突 |

**[事实]** `onnxruntime` 1.30.0（**MIT**）可用于 CPU 推理；`sentence-transformers` 6.1.0（Apache-2.0）可做本地推理封装。

#### 2.4.3 「高二学生提问 → 检索到教材对应段落」推荐方案

**四段式管线：**

```
用户提问：「双曲线渐近线为什么是 y=±(b/a)x？」
   │
   ├─【1】查询理解（轻量规则 + 小模型，本地）
   │     ├─ 抽取学科：数学（关键词/分类器）
   │     ├─ 抽取年级：高二（教材目录反查）
   │     └─ 抽取知识点：「双曲线的渐近线」（命中 knowledge_points.aliases）
   │     → 得到元数据过滤条件：subject=数学 AND grade IN (高二, 高三) AND kp_id=...
   │
   ├─【2】双路召回（并行，各取 Top-40）
   │     ├─ 路 A · 全文：FTS5(jieba 分词) BM25 排序
   │     └─ 路 B · 语义：sqlite-vec 余弦相似度（bge-m3，查询向量 + chunk 向量）
   │
   ├─【3】融合（RRF, Reciprocal Rank Fusion）
   │     score(d) = Σ_paths 1 / (k + rank_path(d))      # k 通常取 60
   │     → 合并去重，保留 Top-20
   │
   └─【4】重排 + 扩展（可选）
         ├─ 相邻 chunk 拼接（chunk 的前后各 1 个，恢复上下文）
         ├─ 按 chunk_type 提权（正文 > 习题 > 图表说明）
         └─ 小 cross-encoder 重排 → 最终 Top-5 送入 LLM 生成答案
```

**[推断] 为什么必须是混合检索而不是纯向量：**
- 纯向量：学生问「双曲线 `y=±(b/a)x`」，公式符号在 embedding 空间里几乎无区分度 → 漏召回。
- 纯关键词：学生问「为什么渐近线是这个斜率」，教材写的是「双曲线的渐近线方程」→ 字面不重叠 → 漏召回。
- 混合 + 元数据过滤：两者互补，且年级/学科过滤能把候选集从 34 万降到 2 万以内，显著提精度与速度。

**索引规模估算（[推断]，基于 §1.1 实测体积 + 行业经验系数）：**

| 项 | 计算 | 结果 |
| --- | --- | --- |
| 原始 PDF | 实测 | **138.6 GB**（1,742 本） |
| 总页数 | 138.6 GB ÷ 872 KB/页 | **≈ 16.6 万页** |
| 提取纯文本 | 中文教材约 600–900 字/页（含图注/习题） | **≈ 1.0–1.5 亿字符** |
| 文本 UTF-8 体积 | 中文 3 字节/字 | **≈ 330–450 MB** |
| Chunk 数 | 600 字/块 + 80 字重叠，≈ 700 字/块 | **≈ 14–22 万 chunk**（取 18 万） |
| Embedding 向量（fp32, 1024 维） | 18 万 × 1024 × 4 B | **≈ 738 MB** |
| Embedding 向量（int8 量化） | 18 万 × 1024 × 1 B | **≈ 184 MB** |
| FTS5 倒排索引 | 约为原文 0.5–1.0× | **≈ 200–400 MB** |
| **只读知识库（含向量+索引+结构化 JSON）** | | **≈ 1.2–1.8 GB** |
| + 页面缩略图（可选，用于「翻到那一页」） | 16.6 万 × 15 KB | **≈ 2.5 GB** |
| **完整离线包（不含教材原文）** | | **≈ 4–5 GB** |
| 用户本地导入的教材原文 | | **≈ 139 GB**（仅用户本机，随用户导入量增长） |

> **这个对比就是整个分发策略的答案**：**140 GB 的原文不可能分发，5 GB 的结构化知识库完全可以。**

---

### 2.5 推荐数据库 Schema（SQLite）

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────────────────────
-- 1. 书目
-- ─────────────────────────────────────────────────────────────
CREATE TABLE books (
  id                INTEGER PRIMARY KEY,
  uuid              TEXT UNIQUE,              -- 平台侧书 id，用于去重与回源
  title             TEXT NOT NULL,
  publisher         TEXT,                     -- 出版社
  edition           TEXT,                     -- 版本标签（人教版/统编版/沪教版…）
  stage             TEXT CHECK(stage IN ('小学','初中','高中','其他')),
  grade             TEXT,                     -- 一年级…高三
  subject           TEXT NOT NULL,
  volume            TEXT,                     -- 上册/下册/全一册
  isbn              TEXT,
  total_pages       INTEGER,
  source_kind       TEXT NOT NULL CHECK(source_kind IN
                      ('official_link','user_import','bundled_derived')),
  source_url        TEXT,                     -- 官方页面链接（不存直链文件）
  local_path        TEXT,                     -- 用户本机文件路径（仅本机）
  sha256            TEXT,                     -- 去重/校验
  has_text_layer    INTEGER,                  -- 0/1，探针结果
  ocr_status        TEXT DEFAULT 'pending'
                      CHECK(ocr_status IN ('pending','running','done','failed','skipped')),
  struct_status     TEXT DEFAULT 'pending',
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT
);
CREATE INDEX idx_books_gs ON books(grade, subject);
CREATE INDEX idx_books_stage ON books(stage, subject);

-- ─────────────────────────────────────────────────────────────
-- 2. 章节目录树（自引用）
-- ─────────────────────────────────────────────────────────────
CREATE TABLE chapters (
  id            INTEGER PRIMARY KEY,
  book_id       INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  parent_id     INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
  level         INTEGER NOT NULL,             -- 1=章 2=节 3=小节
  order_no      INTEGER NOT NULL,             -- 同层排序
  title         TEXT NOT NULL,
  path          TEXT NOT NULL,                -- 物化路径 "第1章/1.2/1.2.3"，便于 LIKE 与排序
  start_page    INTEGER,
  end_page      INTEGER,
  UNIQUE(book_id, path)
);
CREATE INDEX idx_chapters_book ON chapters(book_id, order_no);
CREATE INDEX idx_chapters_path ON chapters(book_id, path);

-- ─────────────────────────────────────────────────────────────
-- 3. 页（保留页码 ↔ chunk 的映射，支撑「翻到那一页」）
-- ─────────────────────────────────────────────────────────────
CREATE TABLE pages (
  id            INTEGER PRIMARY KEY,
  book_id       INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_id    INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
  page_no       INTEGER NOT NULL,             -- 书内页码
  pdf_page_no   INTEGER,                      -- PDF 物理页序
  width_pt      REAL,
  height_pt     REAL,
  has_text      INTEGER NOT NULL DEFAULT 0,   -- 探针：本页是否有文本层
  text          TEXT,                          -- 页级纯文本（冗余，便于页内检索）
  image_path    TEXT,                          -- 页面图缓存（可选）
  UNIQUE(book_id, page_no)
);
CREATE INDEX idx_pages_book ON pages(book_id, page_no);

-- ─────────────────────────────────────────────────────────────
-- 4. 检索块（核心表）
-- ─────────────────────────────────────────────────────────────
CREATE TABLE chunks (
  id            INTEGER PRIMARY KEY,
  book_id       INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_id    INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
  page_start    INTEGER NOT NULL,
  page_end      INTEGER NOT NULL,
  order_no      INTEGER NOT NULL,             -- 书内全局块序
  content       TEXT NOT NULL,                -- 原始文本（用于展示/引用）
  content_seg   TEXT NOT NULL,                -- jieba 预分词（空格分隔），仅供 FTS5 写入
  content_type  TEXT NOT NULL DEFAULT 'text'
                  CHECK(content_type IN ('text','formula','table','exercise','figure_caption','example')),
  token_len     INTEGER,                      -- 字符数
  has_formula   INTEGER DEFAULT 0,
  has_table     INTEGER DEFAULT 0,
  image_refs    TEXT,                          -- JSON 数组：图片/公式图相对路径
  embedding     BLOB,                          -- float32[1024] 或 int8[1024]，供 sqlite-vec
  embed_model   TEXT,                          -- 记录模型版本，便于重建
  embed_dim     INTEGER,
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_chunks_book ON chunks(book_id, order_no);
CREATE INDEX idx_chunks_chapter ON chunks(chapter_id);
CREATE INDEX idx_chunks_type ON chunks(content_type);

-- FTS5 外部内容表（不重复存原文，省一半空间）
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  content_seg,
  content = 'chunks',
  content_rowid = 'id',
  tokenize = 'unicode61 remove_diacritics 0'
);
-- 触发器保持同步
CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, content_seg) VALUES (new.id, new.content_seg);
END;
CREATE TRIGGER chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content_seg) VALUES ('delete', old.id, old.content_seg);
END;
CREATE TRIGGER chunks_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content_seg) VALUES ('delete', old.id, old.content_seg);
  INSERT INTO chunks_fts(rowid, content_seg) VALUES (new.id, new.content_seg);
END;

-- sqlite-vec 向量索引（vec0 虚拟表）
CREATE VIRTUAL TABLE chunks_vec USING vec0(
  chunk_id INTEGER PRIMARY KEY,
  embedding float[1024]
);

-- ─────────────────────────────────────────────────────────────
-- 5. 知识点与先修关系图
-- ─────────────────────────────────────────────────────────────
CREATE TABLE knowledge_points (
  id            INTEGER PRIMARY KEY,
  code          TEXT UNIQUE,                  -- 稳定编码，如 "MATH-G10-FUNC-007"
  name          TEXT NOT NULL,
  aliases       TEXT,                          -- JSON 数组，用于查询理解
  subject       TEXT NOT NULL,
  stage         TEXT,
  grade_min     TEXT,
  grade_max     TEXT,
  description   TEXT,
  difficulty    INTEGER CHECK(difficulty BETWEEN 1 AND 5),
  bloom_level   TEXT,
  curriculum_ref TEXT,                         -- 对应课程标准条目编号
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_kp_subject ON knowledge_points(subject, grade_min);
CREATE VIRTUAL TABLE kp_fts USING fts5(name, aliases, description, tokenize='unicode61');

-- chunk ↔ 知识点 多对多
CREATE TABLE chunk_kp (
  chunk_id   INTEGER NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  kp_id      INTEGER NOT NULL REFERENCES knowledge_points(id) ON DELETE CASCADE,
  confidence REAL,                             -- LLM 抽取置信度
  evidence   TEXT,                             -- 原文依据片段
  PRIMARY KEY (chunk_id, kp_id)
);
CREATE INDEX idx_chunkkp_kp ON chunk_kp(kp_id);

-- 先修关系图（有向无环，写入时做环检测）
CREATE TABLE edges (
  id          INTEGER PRIMARY KEY,
  from_kp_id  INTEGER NOT NULL REFERENCES knowledge_points(id) ON DELETE CASCADE,
  to_kp_id    INTEGER NOT NULL REFERENCES knowledge_points(id) ON DELETE CASCADE,
  rel_type    TEXT NOT NULL DEFAULT 'prerequisite'
                CHECK(rel_type IN ('prerequisite','related','contains','contrast')),
  weight      REAL DEFAULT 1.0,                -- 关系强度 0–1
  reason      TEXT,
  UNIQUE(from_kp_id, to_kp_id, rel_type)
);
CREATE INDEX idx_edges_from ON edges(from_kp_id, rel_type);
CREATE INDEX idx_edges_to ON edges(to_kp_id, rel_type);

-- ─────────────────────────────────────────────────────────────
-- 6. 题库
-- ─────────────────────────────────────────────────────────────
CREATE TABLE questions (
  id             INTEGER PRIMARY KEY,
  uuid           TEXT UNIQUE,
  stem           TEXT NOT NULL,                -- 题干（含 LaTeX）
  stem_format    TEXT DEFAULT 'markdown+latex',
  options        TEXT,                          -- JSON: [{"key":"A","content":"..."}]
  answer         TEXT,                          -- 标准化答案（选择题 "B"；多选 "ABD"）
  answer_detail  TEXT,                          -- 主观题答案/评分点
  solution       TEXT,                          -- 解析（分步）
  qtype          TEXT NOT NULL CHECK(qtype IN
                   ('single_choice','multi_choice','fill_blank','judge',
                    'short_answer','essay','calculation','proof',
                    'cloze','reading','programming')),
  difficulty     INTEGER CHECK(difficulty BETWEEN 1 AND 5),
  difficulty_src TEXT CHECK(difficulty_src IN ('manual','auto','irt','imported')),

  -- 溯源
  source_type    TEXT NOT NULL CHECK(source_type IN
                   ('official','public_web','commercial_licensed','user_import','ai_generated')),
  source_name    TEXT,                          -- 如 "2024年广东省初中学业水平考试"
  source_url     TEXT,
  exam_region    TEXT,                          -- 广东 / 澳门 / 全国 / 港澳台联考
  exam_name      TEXT,                          -- 中考/高考/联考/四校联考/保送考/CSP
  year           INTEGER,
  paper_id       INTEGER REFERENCES papers(id) ON DELETE SET NULL,
  qno_in_paper   INTEGER,                       -- 在原卷中的题号

  -- 组卷元数据
  score          REAL,                          -- 分值
  est_minutes    REAL,                          -- 预计作答时间
  subject        TEXT NOT NULL,
  grade          TEXT,
  kp_ids         TEXT,                          -- JSON 数组（冗余，便于快速过滤）
  tags           TEXT,                          -- JSON 数组
  image_refs     TEXT,                          -- JSON 数组
  license_note   TEXT NOT NULL,                 -- 许可备注，如 "CCF 版权所有，非商业教学用途"

  -- 去重
  simhash        TEXT,                          -- 64-bit SimHash hex
  dedup_group    INTEGER,

  -- AI 生成溯源（合规要求：必须能区分真题与 AI 生成题）
  generator      TEXT,
  gen_prompt_hash TEXT,
  review_status  TEXT DEFAULT 'unreviewed'
                   CHECK(review_status IN ('unreviewed','auto_passed','human_verified','rejected')),

  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT
);
CREATE INDEX idx_q_filter ON questions(subject, exam_region, year, qtype);
CREATE INDEX idx_q_kp ON questions(subject, difficulty);
CREATE INDEX idx_q_simhash ON questions(simhash);
CREATE INDEX idx_q_source ON questions(source_type, source_name);

-- 题目 ↔ 知识点
CREATE TABLE question_kp (
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  kp_id       INTEGER NOT NULL REFERENCES knowledge_points(id) ON DELETE CASCADE,
  weight      REAL DEFAULT 1.0,
  is_primary  INTEGER DEFAULT 0,
  PRIMARY KEY (question_id, kp_id)
);

-- 试卷（真题卷 / 用户组卷）
CREATE TABLE papers (
  id            INTEGER PRIMARY KEY,
  title         TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK(kind IN ('real_exam','generated','mixed','template')),
  exam_region   TEXT,
  exam_name     TEXT,
  subject       TEXT NOT NULL,
  year          INTEGER,
  total_score   REAL,
  duration_min  INTEGER,
  structure     TEXT,                          -- JSON：卷面结构（见 §4.1）
  template_id   INTEGER REFERENCES paper_templates(id),
  source_url    TEXT,
  license_note  TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- 卷面结构模板（可复用、可版本化）
CREATE TABLE paper_templates (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,                 -- "广东省中考数学卷（省级统一命题）"
  exam_region   TEXT,
  subject       TEXT,
  total_score   REAL,
  duration_min  INTEGER,
  sections      TEXT NOT NULL,                 -- JSON，见 §4.1
  version       INTEGER DEFAULT 1,
  basis_note    TEXT,                          -- 结构来源说明（官方文件 / 公开试卷反推）
  created_at    TEXT DEFAULT (datetime('now'))
);

-- 试卷 ↔ 题目（带顺序与分值）
CREATE TABLE paper_questions (
  paper_id     INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  question_id  INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  section_no   INTEGER NOT NULL,
  order_no     INTEGER NOT NULL,
  score        REAL,
  PRIMARY KEY (paper_id, question_id)
);
CREATE INDEX idx_pq_paper ON paper_questions(paper_id, section_no, order_no);

-- ─────────────────────────────────────────────────────────────
-- 7. 作答记录
-- ─────────────────────────────────────────────────────────────
CREATE TABLE attempts (
  id            INTEGER PRIMARY KEY,
  question_id   INTEGER REFERENCES questions(id) ON DELETE CASCADE,
  paper_id      INTEGER REFERENCES papers(id) ON DELETE SET NULL,
  session_id    TEXT,                           -- 一次练习/模考会话
  user_answer   TEXT,
  is_correct    INTEGER,                        -- NULL = 主观题未判
  score_got     REAL,
  duration_sec  INTEGER,
  self_rating   INTEGER CHECK(self_rating BETWEEN 1 AND 5),
  answered_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_attempts_q ON attempts(question_id, answered_at);
CREATE INDEX idx_attempts_session ON attempts(session_id);

-- 错题本（物化视图式缓存，加速「错题重练」）
CREATE TABLE wrong_book (
  question_id  INTEGER PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  wrong_count  INTEGER DEFAULT 0,
  last_wrong_at TEXT,
  last_right_at TEXT,
  mastery      REAL DEFAULT 0.0,               -- 0–1 掌握度
  next_review_at TEXT                          -- 艾宾浩斯复习计划
);

-- ─────────────────────────────────────────────────────────────
-- 8. 元数据 / 迁移
-- ─────────────────────────────────────────────────────────────
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
-- 建议写入：schema_version / embed_model / dict_version(jieba) / corpus_version
```

**[推断] 设计要点说明：**
- `chunks.content` 与 `chunks.content_seg` 并存：前者给人看和给 LLM，后者只给 FTS5 用（jieba 预分词）。这是绕开 unicode61 中文缺陷的核心技巧。
- FTS5 用 `content='chunks'` 外部内容表，**不重复存一份原文**，省约 300 MB。
- `source_kind` / `source_type` / `license_note` **三件套是合规留痕**：任何时刻都能回答「这段话/这道题从哪来、能不能分发」。
- `review_status` + `generator` 把 AI 生成题与真题彻底隔离——**这是产品可信度的底线**。

---

## 3. 题库来源调研

### 3.1 广东中考真题

| 来源 | URL | 形态 | 需要登录/付费 | 获取难度 | 合规结论 |
| --- | --- | --- | --- | --- | --- |
| **广东省教育厅（政策原文）** | <https://edu.gd.gov.cn/zwgknew/jyzcfg/gfxwj/content/post_4244085.html> | 网页 | 否 | 易 | ✅ 可引用（政府公开信息） |
| **广东省教育资源公共服务平台** | <http://zy.gdedu.gov.cn/> | PDF | 否 | 中 | ⚠️ 官方公开教学资源，可引用链接；**是否可再分发未明确，建议只做链接** |
| 梅州市教育资源平台 | <http://zy.gdmzedu.cn/> | PDF | 否 | 中 | 同上 |
| 菁优网（商业） | <https://www.jyeoo.com/> | 网页 | **付费** | 中 | ❌ 见 §3.8 |
| 二一组卷（商业） | <https://zujuan.21cnjy.com/> | 网页 | **付费** | 中 | ❌ 见 §3.8 |
| book118（文档分享） | <https://max.book118.com/> | PDF 预览 | 付费 | 中 | ❌ 用户上传内容，权属不清，**不可引用** |

**[事实] 广东省中考的官方结构规范（来源：省教育厅规范性文件，实测原文）：**

- 依据《义务教育课程方案和课程标准》（2022 年版 7–9 年级）命题
- **9 门文化科目**：道德与法治、语文、历史、数学、外语、地理、物理、化学、生物学 → **笔试省级统一命题**
  - 例外：**广州、深圳** 2 个副省级城市**试行 9 个科目自主命题**，其他市由全省统一命题
- **3 门其他科目**：信息科技、体育与健康、艺术 → 由各市自行组织命题
- **卷面原始分**：语文、数学、外语 **各 120 分**（外语含听力/听说 30 分）；其他科目 **各 100 分**；理化生实验操作不低于该科总分的 **10%**
- **考试时长**：语文、数学各 120 分钟；外语 90 分钟（含听力约 20 分钟，不含听说）；物理（不含实验）、历史各 80 分钟；道德与法治、地理、化学（不含实验）、生物学（不含实验）各 60 分钟
- **成绩呈现**：语文、数学、外语、体育与健康以**分数**呈现；其他科目可以分数/等级/「合格-不合格」呈现
- 地理、生物学安排在**八年级第二学期末**；其他科目在**九年级第二学期末**
- 本意见自 **2023-09-01** 起实施，有效期 5 年

> **[未能核实]** 官方文件中**没有**给出「选择题 X 题 × Y 分」这一级别的细目表。**[推断]** 该级别的组卷模板只能从**公开真题卷面反推**（例如可从 jyeoo 的公开试卷页面看到卷面结构，但只是「看结构」，题目内容仍需授权）。**「卷面骨架」是否受版权保护存在解释空间，建议只提取「题型/题量/分值」这类事实性结构，不复制题干。**

---

### 3.2 广东高考真题（含新高考 I 卷）

| 来源 | URL | 形态 | 说明 |
| --- | --- | --- | --- |
| 广东省教育考试院 | <http://eea.gd.gov.cn/> | 网页/PDF | [事实] 联招办与省内考试的官方发布口，站点可访问 |
| 教育部教育考试院 | <https://www.neea.edu.cn/> | 网页 | [推断] 全国统考命题机构 |
| 阳光高考（教育部） | <https://gaokao.chsi.com.cn/> | 网页 | [事实] 官方信息平台 |
| 内地高校面向港澳台招生信息网 | <https://www.gatzs.com.cn/> | 网页 | [事实] 实测可访问，主办：教育部学生服务与素质发展中心 |
| 商业题库 | 菁优网 / 学科网 / 二一组卷 | 网页 | ❌ 需授权 |
| 文档分享站 | book118 / 百度文库 / 360doc | PDF | ❌ 权属不清，不可引用 |

**[未能核实]** 「教育部教育考试院公开发布历年高考真题 PDF」的官方直链——本次调研未定位到稳定的官方真题发布页。**[推断]** 高考真题通常通过各省考试院在**考后短期**发布「试题及参考答案」，缺少长期归档页。

**[事实] GitHub 上的相关整理仓库（已实测存在，但均非权威、无 License）：**

| 仓库 | ★ | License | 说明 |
| --- | --- | --- | --- |
| <https://github.com/fihyer/NCEE> | 1 | **无** | 「历年高考数学试卷」 |
| <https://github.com/rochelobeJYJ/gichul-workbench> | 2 | **无** | 韩语项目，但**方法论完全对口**：下载历年真题 → 按题号裁切 → 转写 → 按课程单元分类 → 生成可打印题集 |

> ⚠️ **重要提醒**：这两个仓库 **都没有 License 文件**。没有 License ≠ 可以自由使用，默认是「保留所有权利」。**[推断]** 建议只把它们当作**方法论参考**，不要拷贝其数据。

---

### 3.3 港澳台联考（全国联招）

**[事实] 权威来源：内地高校面向港澳台招生信息网（主办：教育部学生服务与素质发展中心）**

| 资源 | URL |
| --- | --- |
| 2026 年招生简章（含考试科目、时间、大纲依据） | <https://www.gatzs.com.cn/gatzs/pz/hongkong/202601/20260120/2293447012.html> |
| 全国联招管理系统考生端 | <http://www.eeagd.edu.cn/lzks/> |

**实测原文中的关键事实：**

- **理工类**考试科目：中文、数学、英语、物理、化学
- **文史类**考试科目：中文、数学、英语、历史、地理
- **每科满分 150 分，每个考试类别满分 750 分**
- **考试内容依据**：《中华人民共和国普通高等学校联合招收华侨港澳台学生入学考试（理科、文科）考试大纲（**第 4 版**）》，由**教育部教育考试院**制定 ← **这是唯一权威的考试大纲，产品必须以此为准**
- 考试时间：5 月 23–24 日（中文/英语/数学/物理·历史/化学·地理）
- 考区：北京、上海、浙江、福建、广东（广州、深圳）、香港、澳门 共 7 个
- 答题方式：计算机网上辅助阅卷，**专用答题卡**
- 主办方：普通高校联合招收华侨港澳台学生办公室（**联招办**），友情链接指向广东省教育考试院

> **[未能核实]**《考试大纲（第 4 版）》的**公开 PDF 直链**——本次调研未定位到。**[建议]** 通过广东省教育考试院或联招办索取/购买纸质版，产品内只放**官方获取指引**，不内置大纲原文。
> **[未能核实]** 历年联考真题的官方公开渠道——未定位到。**[推断]** 联考真题主要靠培训机构与教辅流通，**版权风险高，只能走「用户自行导入」**。

---

### 3.4 四校联考（澳门四高校联合入学考试）— **本次调研质量最高的一类**

**[事实] 官方考纲与历年真题均可免费下载，且已在两个官方站点交叉验证：**

**入口 A：澳门大学注册处（推荐主入口）**
<https://reg.um.edu.mo/admissions/macao-students/admission-examination/jae/syllabus-paper/?lang=zh-hant>

**入口 B：澳门旅游大学（UTM）**
<https://www.utm.edu.mo/admission/sc/undergraduate_programmes/joint-admission-examination/jae-syllabus-and-past-examination-papers/index.html>

**考纲（2027）直链：**

| 科目 | URL |
| --- | --- |
| 中文 | <https://reg.um.edu.mo/download/admission-local/jae/syllabus/JC01.pdf> |
| 葡文 A / B | <https://reg.um.edu.mo/download/admission-local/jae/syllabus/JP01.pdf> / <https://reg.um.edu.mo/download/admission-local/jae/syllabus/JP02.pdf> |
| 英文 | <https://reg.um.edu.mo/download/admission-local/jae/syllabus/JE01.pdf> |
| 数学 正卷 / 附加卷 | <https://reg.um.edu.mo/download/admission-local/jae/syllabus/JM01.pdf> / <https://reg.um.edu.mo/download/admission-local/jae/syllabus/JM02.pdf> |

**历年试题及建议答案直链（2025 / 2026）：**

```
2026: https://reg.um.edu.mo/download/admission-local/jae/pastexampaper2/{JC01,JP01,JP02,JE01,JM01,JM02}.pdf
2025: https://reg.um.edu.mo/download/admission-local/jae/pastexampaper1/{JC01,JP01,JP02,JE01,JM01,JM02}.pdf
```

**四校 = 澳门大学（UM）+ 澳门理工大学（MPU）+ 澳门旅游大学（UTM）+ 澳门科技大学（MUST）**
（[事实] 澳大页面同时展示四校校徽，且四校分别在自己的站上发布同一套考纲/试题）

**官方主管部门页面：** 澳门教育及青年发展局（DSEDJ）四校联考专页
<https://portal.dsedj.gov.mo/webdsejspace/internet/Inter_main_page.jsp?id=80793&>

**[事实]** 澳门高等教育局（GAES）旧域名 `gaes.gov.mo` 的联考资源仍可访问（如 <http://www.gaes.gov.mo/unification/Math_StandardPaper_MockPaper_SuggestedAnswer.pdf>），职能已并入 **DSEDJ（dsedj.gov.mo）**。

> ✅ **合规结论：四校联考的「考纲 + 历年试题 + 建议答案」是四校官方主动公开、免费、无需登录的 PDF。**
> **[推断]** 这是**最优质、风险最低**的题库来源，可做「链接聚合 + 用户导入 + 自动解析」。但**是否允许随第三方软件再分发，仍需逐校确认**（建议在产品内只做**官方链接跳转 + 一键导入**，而不是把 PDF 打进安装包）。

---

### 3.5 澳门保送考试（内地高校联合招收澳门保送生）

**[事实] 官方入口（实测可访问）：**

| 资源 | URL |
| --- | --- |
| 招生简章下载系统（按高校） | `https://appl2.dsedj.gov.mo/ChinaUEnrollment/UPublic/DownloadUniDoc.jsp?u_id={高校id}&fileName={高校名}.pdf` |
| 实例：电子科技大学 2026 简章 | <https://appl2.dsedj.gov.mo/ChinaUEnrollment/UPublic/DownloadUniDoc.jsp?u_id=110250&fileName=电子科技大学.pdf> |
| 实例：北京体育大学 2026 简章 | <https://appl2.dsedj.gov.mo/ChinaUEnrollment/UPublic/DownloadUniDoc.jsp?u_id=110034&fileName=北京体育大学.pdf> |
| **2026 年保送须知**（核心文件） | <https://portal.dsedj.gov.mo/webdsejspace/addon/upload/Upload_viewfile_page.jsp?id=705896> |
| 主管部门 | 澳门教育及青年发展局 <https://portal.dsedj.gov.mo/> |

**[推断]** 澳门保送生的录取主要依据**中学推荐 + 高校考核（面试/笔试）**，各高校自主决定考核形式，**不存在全国统一的「澳门保送考试」真题**。

> **[未能核实]** 统一的保送考试样题——未定位到，且推断其不存在。
> **[建议]** 格致对「澳门保送」这一类的处理方式应是：**结构化「保送须知 + 各高校简章 + 面试常见问题库」**，而不是找真题。这部分内容可以从上面两个官方入口**合法抓取并展示**（政府公开信息）。

---

### 3.6 信息学 / 编程题库

#### 3.6.1 参考实现：cspfirstround.com（AK CSP）深度拆解

**[事实] 站点架构（实测 sitemap.xml，共 1,638 个 URL）：**

| 路径模式 | 数量 | 作用 |
| --- | --- | --- |
| `/`（首页） | 1 | 知识点总览 + 卷目导航 |
| `/papers` | 1 | 全部真题卷列表（按 CSP-J / CSP-S / NOIP 普及 / NOIP 提高 分组） |
| `/csp-j`、`/csp-s` | 各 1 | 按组别的历年真题（支持 `?round=2` 切复赛） |
| `/round2?year=YYYY` | 1 + 子题 | 复赛在线评测（`?problem=<slug>`） |
| `/paper/{slug}` | **34** | 单套试卷页（如 `/paper/cspj-2025`） |
| `/topic/{知识点}` | **39** | 知识点专项练习（URL 编码中文，如 `/topic/动态规划`） |
| `/q/{question-slug}` | **1,340** | 单题详情页 |
| `/paper-pdfs/{slug}.{hash}.pdf` | **16** | 试卷 + 答案 PDF 下载 |
| `/about` | 1 | 关于与版权声明 |

**[事实] 题目数据模型（从 `/q/cspj-2025-04` 实测页面逆向）：**

```
题目字段（页面实际呈现）：
  ├─ 卷面归属：CSP-J 2025 第一轮 · 第 4 题
  ├─ 题型：单项选择 / 阅读程序 / 阅读程序·判断 / 阅读程序·单选 / 完善程序 / 问题求解
  ├─ 知识点：树与二叉树（单一考点标签）
  ├─ 难度：较难（三级：入门 / 中等 / 较难 之类）
  ├─ 题干：Markdown + LaTeX（实测原文含 $$...$$ 行间公式与 $\mathrm{WPL}$ 行内公式）
  ├─ 原题扫描图：/public/question-crops/cspj/2025/q-04.png  ← 关键设计！
  ├─ 选项：A/B/C/D 结构化
  ├─ 答案：B（单独字段）
  └─ 题解：三段式「考点定位 / 解题过程 / 易错提醒」
```

> 💡 **最值得抄的一点**：`/public/question-crops/...` —— 每题配一张**裁切后的原题扫描图**。
> **[推断]** 这是版权上的巧妙处理：**题干用 OCR/重排的结构化文本（便于检索和组卷），同时保留原题图像作为「保真底本」**。既解决了 OCR 识别错误的风险（用户可对照原图），又让文本化产物具有独立价值。

**[事实] 组卷与练习交互（首页 + `/papers` 实测文案）：**

- 免费、免登录即可刷题；注册后自动同步做题记录
- **知识点练习**：按 NOI 官方大纲知识树分类刷题
- **历年整卷**：限时整卷模拟，**交卷自动评分**
- **错题本 / 学习统计**：自动收集错题，多维度查看进度
- **教师组卷**：老师可**选题组卷**、发布班级作业并查看提交情况
- **在线评测（复赛）**：题面 + 公开样例，写 C++ 代码提交评测
- 题库规模：实测自述 **1,251 道初赛真题**（CSP-J/S 2019–2025 + NOIP 普及/提高 2010–2018）

**[事实] API：存在但基本不公开**

```
GET /api/anything        → 404 {"error":"接口不存在"}
GET /robots.txt          → User-agent: * / Allow: / / Disallow: /api/ / Allow: /api/round2/assets/
```

**[推断]** 站点有完整的 `/api/` 后端（返回标准 JSON 错误体），但**显式在 robots.txt 中禁止抓取 `/api/`**，只开放 `/api/round2/assets/`（评测资源）。→ **结论：不要试图调用它的 API。这是明确的拒绝授权信号。**

**[事实] 版权声明原文（每页页脚）：**
> 「真题版权归 CCF 所有，本站仅用于非商业教学用途。」

**[事实] 收录内容的版权归属：** CSP-J/S 与 NOIP 真题版权归 **CCF（中国计算机学会）** 所有。

> ⚠️ **[推断] 这意味着即使是 AK CSP 自己，其法律地位也只是「非商业教学用途」的合理使用主张。格致作为商业产品，不能照抄这一模式。**
> 正确做法见 §3.7。

#### 3.6.2 合法可引用的公开题库

| 来源 | URL | 许可 / 条款 | 可抓取？ |
| --- | --- | --- | --- |
| **NOI 官方大纲（2025 版）** | <https://www.noi.cn/upload/resources/file/2025/04/18/NOI_Syllabus_Edition_2025.pdf> | CCF 官方发布，实测 HTTP 200 / 21.7 MB | ✅ **知识树骨架的最佳权威来源**，可引用；**再分发需确认** |
| **NOI 官网** | <https://www.noi.cn/> | CCF 所有 | ⚠️ 只做链接 |
| **OI Wiki** | <https://oi-wiki.org/>（仓库 <https://github.com/OI-wiki/OI-wiki>，★26,788） | [事实] README 明确「可自由共享、演绎，必须署名、以相同方式共享」→ **CC BY-SA 系列** | ✅ **可自由使用，需署名 + 相同方式共享**。用于知识点讲解极佳 |
| 洛谷 | <https://www.luogu.com.cn/> | [未能核实] 需读其服务条款 | ⚠️ 先读条款再定 |
| Codeforces | <https://codeforces.com/> | [推断] 有公开 API | ⚠️ 需遵守其 API 条款与频率限制 |
| AtCoder | <https://atcoder.jp/> | [未能核实] | ⚠️ 同上 |
| OpenJudge | <http://openjudge.cn/> | [未能核实] | ⚠️ 同上 |
| USACO | <http://www.usaco.org/> | [推断] 官方题解与题目长期公开 | ⚠️ 需核实 |

> 🎯 **对格致最实际的建议**：把「**知识树骨架**」用 NOI 大纲（CCF 官方）+ OI Wiki（CC BY-SA），把「**题目**」留给用户导入。这样既有一流的信奥知识体系，又零版权风险。

---

### 3.7 商业组卷网站（**只能买授权，不能爬**）

#### 学科网（zxxk.com）

**[事实] 用户协议原文（实测 <https://m.zxxk.com/api/v1/agreement/user>）：**

> 「……用户购买服务后仅享有学科网®产品的使用权，**且仅限个人使用，不得用作任何商业用途**。」
>
> 用户不得利用学科网®从事进行如下行为：
> 「6) 私自将学科网®的资源内容复制发布、编辑出版、转卖或提供给任何第三方组织或个人，或将学科网®的资源私自上传到除学科网®之外的其他网站、社区、论坛；
> **7) 采用技术手段在学科网®进行高频次的访问、长期逐页逐项抓取（下载）页面内容；**
> 8) 制作、发布与以上行为相关的方法、工具，或对此类方法、工具进行运营或传播，无论这些行为是否为商业目的；」

> 🔴 **这是对爬虫最明确的禁止条款**，且第 8 条把「制作爬取工具」本身也列为违规。**任何形态的抓取都不可行。**

**[事实]** `https://www.zxxk.com/robots.txt` 实测返回空内容。空 robots.txt 在法律上**不构成授权**——服务协议优先。

#### 菁优网（jyeoo.com）

**[事实] robots.txt 实测**（<https://www.jyeoo.com/robots.txt>）：
```
User-agent: *
Disallow: /api*              ← API 明确禁止
Disallow: /*/paper/detail*   ← 试卷详情禁止
Disallow: /resource/detail/* ← 资源详情禁止
Disallow: /physics/*
...
Allow: /shijuan/*            ← 试卷列表页允许
Allow: /sj/*
Allow: /shiti/*
Allow: /pp/*
Sitemap: ... sitemap1..110.xml
```

**[推断]** Robots 允许抓「列表页」，但**明确禁止抓「试卷详情页」和 API**。列表页里没有完整题目。→ **实际上仍无法合规获取题目内容**。且 robots.txt 只是技术约定，**服务条款仍是最终约束**，必须单独阅读并遵守。

#### 二一组卷（zujuan.21cnjy.com / 21cnjy.com）

**[事实] 定价与功能分层（实测 <https://zujuan.21cnjy.com/help/vip>）：**

| | 普通用户 | VIP 会员 | 团体组卷 |
| --- | --- | --- | --- |
| 下载试题试卷 | **按题收费 2 学币/题** | 免费 | 免费 |
| 下载次数 | 5 次/天 | 15 次/天 | **不限** |
| 单次组卷题数上限 | **40 题/卷** | 100 题/卷 | 不限 |
| 查看答案解析 | **20 题/天** | √ | √ |
| 细目表组卷 / 平行组卷 | × | √ | √ |
| 校本题库 / 跨科组卷 | × | × | √ |
| 价格 | — | 「新用户首单仅需 9.9 元」 | 需申请 |

**[事实] 版权声明原文（实测 <https://zujuan.21cnjy.com/help/copyright>）：**
> 「未经作者本人书面授权，任何第三方不得转载、复制、摘录本作品内容，一旦发生侵权纠纷，司法机关有权获取相关用户信息并要求侵权者承担相关法律责任！」
> 并明确引用《著作权法》第五十三条、《信息网络传播权保护条例》第十八条。

**[事实] 🎉 但它有一个「开放平台」——这是正规的授权通道：**
<https://dev.21cnjy.com/>（二一资源开放平台）
> 「优质教育内容与智能服务，**通过统一开放接口按需交付**」
> 能力：平台核心能力 / 开放能力 / 解决方案 / 文档 / 控制台
> 接入流程：**四步完成申请到联调的合作准备**

> ✅ **这是本报告对「题库授权」给出的最重要可执行建议：如果要商业题库，走 `dev.21cnjy.com` 申请 API 授权，而不是爬。**

**同类商业平台（同样需要授权）：**

| 平台 | URL | 备注 |
| --- | --- | --- |
| 学科网 | <https://www.zxxk.com/> | 有 e卷通/e备课/网校通产品线 |
| 菁优网 | <https://www.jyeoo.com/> | 组卷、批改 |
| 二一组卷 | <https://zujuan.21cnjy.com/> | **有开放平台 API** |
| 组卷题库 | <https://tiku.chujuan.cn/> | 二一友情链接 |

---

### 3.8 ⭐ 三分类清单（合规红线）

#### 🟢 A 类：可以合法抓取 / 引用

| 条目 | URL | 理由 |
| --- | --- | --- |
| 义务教育课程方案和课程标准（2022年版） | <http://www.moe.gov.cn/srcsite/A26/s8001/202204/t20220420_619921.html> | 政府公开信息 |
| 广东省中考改革实施意见 | <https://edu.gd.gov.cn/zwgknew/jyzcfg/gfxwj/content/post_4244085.html> | 政府公开信息（规范性文件） |
| 全国联招招生简章 | <https://www.gatzs.com.cn/gatzs/pz/hongkong/202601/20260120/2293447012.html> | 官方发布 |
| 澳门保送须知 + 各高校简章 | <https://portal.dsedj.gov.mo/webdsejspace/addon/upload/Upload_viewfile_page.jsp?id=705896> | 澳门特区政府公开信息 |
| 四校联考考纲（2027） | <https://reg.um.edu.mo/download/admission-local/jae/syllabus/JC01.pdf> 等 | 四校官方主动公开、免费、无需登录 |
| 四校联考历年试题及建议答案 | <https://reg.um.edu.mo/admissions/macao-students/admission-examination/jae/syllabus-paper/?lang=zh-hant> | 同上（**建议做链接聚合而非镜像**） |
| NOI 大纲 2025 | <https://www.noi.cn/upload/resources/file/2025/04/18/NOI_Syllabus_Edition_2025.pdf> | CCF 官方发布 |
| OI Wiki | <https://oi-wiki.org/> | CC BY-SA，**需署名 + 相同方式共享** |
| OpenStax 开放教科书 | <https://openstax.org/license> | CC BY 系列 |
| 国家中小学智慧教育平台（元数据） | <https://basic.smartedu.cn/tchMaterial> | 目录/知识点结构属事实性信息；**教材原文另论** |

#### 🟡 B 类：只能用户自行导入

| 条目 | 理由 |
| --- | --- |
| 人教版/各版本教材 PDF 原文 | 受著作权保护；平台免费 ≠ 授权再分发 |
| 广东中考 / 高考真题 PDF | 试卷整体受保护；个人学习可，分发不可 |
| 港澳台联考历年真题 | 未找到官方公开渠道，流通版本版权风险高 |
| 四校联考 PDF（若要做成离线包） | 公开可下载，但**随软件分发的授权未明确** |
| NOI / CSP 真题 | **版权归 CCF**（AK CSP 亦标注「非商业教学用途」） |
| 各站点用户上传的文档（book118/百度文库等） | 权属不清，不可引用 |

#### 🔴 C 类：必须购买授权

| 条目 | URL | 授权入口 |
| --- | --- | --- |
| 学科网资源 | <https://www.zxxk.com/> | 商务合作（协议明令禁止抓取与再分发） |
| 菁优网题库 | <https://www.jyeoo.com/> | 商务合作（robots 禁 API 与详情页） |
| 二一组卷题库 | <https://zujuan.21cnjy.com/> | ✅ **<https://dev.21cnjy.com/> 开放平台 API**（推荐走这条） |
| 其他商业题库 | tiku.chujuan.cn 等 | 商务合作 |

---

## 4. 组卷与输出 PDF 的工程设计

### 4.1 组卷算法

**输入（约束条件）：**

```yaml
blueprint:
  subject: 数学
  grade: 九年级
  exam_region: 广东
  total_score: 120
  duration_min: 120
  kp_weights:            # 知识点覆盖要求
    一元二次方程: 0.20
    二次函数: 0.25
    相似三角形: 0.15
    圆: 0.20
    统计与概率: 0.10
    其他: 0.10
  difficulty_dist:       # 难度分布（1–5）
    1: 0.30
    2: 0.35
    3: 0.20
    4: 0.10
    5: 0.05
  type_quota:            # 题型配额（示例，实际须按真题卷面反推）
    single_choice: {count: 10, score: 3}
    fill_blank:    {count: 5,  score: 3}
    calculation:   {count: 7,  score: 8}
    proof:         {count: 2,  score: 10}
  exclude_recent_years: 3   # 近 3 年已做过的题排除
  exclude_question_ids: []
```

**算法流程（[推断]，工程建议）：**

```
Step 1 · 候选集构建（SQL，秒级）
   SELECT ... FROM questions q
   WHERE q.subject=? AND q.difficulty=? AND q.qtype=?
     AND q.review_status IN ('auto_passed','human_verified')
     AND q.grade IN (...)
     AND EXISTS (SELECT 1 FROM question_kp qk WHERE qk.question_id=q.id AND qk.kp_id IN (...))

Step 2 · 分层配额切分
   按 (题型 × 难度) 建二维桶，每桶的目标数量 = 配额 × 难度分布

Step 3 · 带约束的选取（每个桶内）
   3.1 打分：score = w1·知识点匹配度 + w2·难度贴合度 + w3·新颖度(1/(1+已做次数)) + w4·随机扰动
   3.2 贪心 + 回溯：优先满足稀缺的 (高难度 × 指定知识点) 桶
   3.3 硬约束校验：
       - 知识点覆盖率 ≥ 阈值（如 90%）
       - 难度分布卡方检验 p > 0.05
       - 总分精确等于 total_score
       - 无去重冲突

Step 4 · 去重（关键，必须在选取过程中实时做）
   4.1 精确去重：题干 SHA-256 / 题号冲突
   4.2 近似去重：SimHash 汉明距离 ≤ 3 判为重复
        - 生成：jieba 分词 → 词频向量(64维) → SimHash → 64-bit hex
        - 存 questions.simhash，建索引；选取时 O(1) 查表 + 汉明距离比对
   4.3 语义去重（可选，更贵）：向量余弦 > 0.95 判为重复
   4.4 结果写回 questions.dedup_group

Step 5 · 装配与微调
   按 paper_templates.sections 组装顺序、题号、分值
   校验总分与时长 → 生成 paper_questions 记录

Step 6 · 多样性检查（避免整卷同源）
   同一 source_name+year 的题目占比 ≤ 40%
```

**可选进阶：IRT（项目反应理论）难度校准**
- **[推断]** 用历史 `attempts` 数据（正确率）反推题目实际难度，修正人工标注的 `difficulty`。样本量 < 200 次作答的题不参与校准。这对「澳门四校联考」这类样本少的场景不适用。

---

### 4.2 卷面结构模板（中国考试）

**[事实] 广东省中考（省级统一命题，来自省教育厅规范性文件）：**

| 项目 | 规定值 |
| --- | --- |
| 科目 | 9 门文化科目省级统一命题；广州、深圳试行自主命题 |
| 分值 | 语文/数学/外语 各 **120**；其他科目 各 **100**（外语含听说 30 分） |
| 时长 | 语文/数学 **120 min**；外语 90 min；物理/历史 80 min；道法/地理/化学/生物学 60 min |
| 依据 | 《义务教育课程方案和课程标准》（2022 年版） |
| 实施 | 自 2023-09-01 起，有效期 5 年 |

> ⚠️ **[未能核实]** 官方**未公布**「第 1–10 题单选，每题 3 分」级别的细目表。
> **[推断]** 组卷模板的题型/分值细目只能从**公开真题卷面反推**。建议在 `paper_templates.basis_note` 字段中如实标注：「结构由公开真题卷面反推，非官方细目表」，并在 UI 上提示用户可自定义。

**[未能核实] 广东新高考 I 卷的官方题型细目表。** 本次调研未定位到教育部教育考试院发布的、含「8 单选 + 3 多选 + 3 填空 + 5 解答」这类细目的官方文件；网络流传的版本多来自教辅与自媒体。**[建议]** 同一处理：模板可由用户在 UI 中自由编辑并存为自定义模板（`paper_templates` 表已支持 `version` 与 `basis_note`）。

---

### 4.3 输出 PDF 的技术路线（版本/License/星数均实测）

| 路线 | 组件 | License | ★ | 体积 | 中文 | 数学公式 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Typst** | <https://github.com/typst/typst>（PyPI `typst` 0.15.0，`messense/typst-py` ★355） | **Apache-2.0** | 56,354 | ✅ **单二进制，约 30–50 MB** | ✅ 字体嵌入、CJK 断行好 | ✅ 原生数学模式 | 🏆 **首选** |
| **LaTeX + exam-zh** | CTAN <https://ctan.org/pkg/exam-zh>；仓库 <https://github.com/xkwxdyy/exam-zh> | **LPPL-1.3c** | 43 | ❌ TeX Live 完整版 **数 GB**，最小化也要数百 MB | ✅✅ 中文试卷排版天花板 | ✅✅ 最强 | 🥈 备选/高级 |
| Pandoc | <https://github.com/jgm/pandoc>（PyPI `pypandoc` 1.17, MIT） | **GPL-2.0** | 46,463 | ⚠️ 单文件约 150 MB | ⚠️ 取决于后端 | ⚠️ 取决于后端 | 转换器，非排版器 |
| WeasyPrint | <https://github.com/Kozea/WeasyPrint>（PyPI 70.0） | **BSD** | 9,651 | ✅ 小 | ✅ | ⚠️ MathML 支持有限 | 备选（简单试卷） |
| headless Chromium | Playwright 1.63.0（Apache-2.0） | Apache-2.0 | — | ❌ 数百 MB | ✅ | ✅（配 KaTeX/MathJax） | 不推荐（体积） |
| ReportLab / fpdf2 | PyPI 5.0.1(BDS) / 2.8.9(**LGPL-3.0**) | BSD / LGPL | — | ✅ | ⚠️ 需手工处理中文 | ❌ | 不推荐 |

**[事实] 两个中文试卷模板（实测 License 与状态）：**

| 模板 | 仓库 | License | ★ | 状态 |
| --- | --- | --- | --- | --- |
| **exam-zh** | <https://github.com/xkwxdyy/exam-zh> | **LPPL-1.3c** | 43 | 🔴 **作者已于 2024-04-26 起无限期停止维护**（README 原文警告） |
| **ezexam**（Typst） | <https://github.com/gbchu/ezexam>（Typst Universe <https://typst.app/universe/package/ezexam/>） | ⚠️ **AGPL-3.0-or-later** | 42 | 🟢 活跃（最新 0.3.1，2026-04-07），文档 <https://ezexam.pages.dev/>，**灵感来自 exam-zh** |
| shuxuejuan（Typst） | <https://github.com/VWWVVW/shuxuejuan>（Universe <https://typst.app/universe/package/shuxuejuan>） | **MIT** | 3 | 🟢 活跃（0.2.0，2026-06-24） |

> 🔴 **[事实] ezexam 是 AGPL-3.0。** 若「格致」闭源，**不能把 ezexam 打包进产品**（AGPL 的网络分发条款会传染）。
> ✅ **可行做法**：① 参考其 API 设计自己写模板（**思路不受版权保护，代码受保护**）；② 或引导用户**自行**从 Typst Universe 安装（`typst init @preview/ezexam`），产品只负责生成 `.typ` 源码。
> ✅ **shuxuejuan 是 MIT**，可自由使用，但功能比 ezexam 少、star 少（3），需评估成熟度。

**[事实] exam-zh 的组成（CTAN 实测文件清单）：**
```
exam-zh.cls (72 KB)              exam-zh-question.sty (63 KB)
exam-zh-choices.sty (24 KB)      exam-zh-symbols.sty (52 KB)
exam-zh-font.sty (20 KB)         exam-zh-math.sty (16 KB)
exam-zh-textfigure.sty (27 KB)   exam-zh-chinese-english.sty (20 KB)
exam-zh-counter.sty              exam-zh-circlednumber.sty
doc/exam-zh-doc.pdf (2 MB)       examples/00-minimal.tex 等
```
特点：格式与内容分离、`choices` 环境自动排版选项、**弥封线（sealline）** 易设计、跨 Windows/macOS/Linux、支持小学到大学各类考试。

**[推断] 推荐架构：Typst 主路线 + LaTeX 可选导出**

```
题库(SQLite)
   │
   ├─(1) 生成结构化中间表示 paper.json
   │      {meta, sections:[{title, questions:[{stem, options, score, kp}]}]}
   │
   ├─(2) 渲染为 Typst 源码 (.typ)
   │      ├─ 自研模板 exam-paper.typ     → 试卷（双栏/单栏、弥封线、分数框）
   │      ├─ 自研模板 answer-sheet.typ   → 答题卡（涂卡区 + 主观题答题框）
   │      ├─ 自研模板 solution.typ       → 答案解析（Step-by-step）
   │      └─ 自研模板 quick-answer.typ   → 答案速查表（表格）
   │
   ├─(3) typst compile --font-path ./fonts x.typ x.pdf
   │      └─ 随产品分发 Typst 二进制(Apache-2.0) + 思源宋体/黑体子集
   │
   └─(4)【可选】同时输出 .tex（exam-zh 风格）供高级用户自行编译
          └─ 产品不分发 TeX 发行版，只提示「需自行安装 TeX Live / MiKTeX」
```

**中文排版与公式注意点（[推断]，工程经验）：**

| 问题 | 处理 |
| --- | --- |
| 字体 | 正文思源宋体（Noto Serif CJK SC）/ 标题思源黑体；Typst 用 `#set text(font: ("Noto Serif CJK SC", "Times New Roman"))` 实现中西文分流 |
| 数学字体 | Typst 用 `#show math.equation: set text(font: "New Computer Modern Math")`；LaTeX 用 `unicode-math` + `newtxmath` |
| 标点挤压 | Typst 默认已处理 CJK 标点；LaTeX 用 `ctex` 宏包的 `\punctstyle` |
| 题目不被切断 | Typst：`#block(breakable: false)[...]`；LaTeX：`\needspace{5\baselineskip}` |
| 行距 | 试卷常用 1.2–1.5 倍；`#set par(leading: 0.8em)` |
| 字号 | 正文五号（10.5pt）/ 小四（12pt）；Typst `#set text(size: 10.5pt)` |
| 双栏 | Typst `#set page(columns: 2)`；LaTeX `\documentclass[twocolumn]{exam-zh}` |
| 答题卡涂卡区 | 用 Typst `table` + 圆圈符号（`①②③④`）或自绘 `circle()`；注意留 2B 铅笔填涂余量 |
| 化学方程式 | ezexam 已支持单线桥/双线桥、原子/离子结构示意图（[事实] 见其 CHANGELOG v0.1.6） |

---

### 4.4 可参考的开源组卷 / 题库项目（均**实测存在**）

| 项目 | 仓库 | ★ | License | 可借鉴点 |
| --- | --- | --- | --- | --- |
| **math-question-bank** | <https://github.com/JudgePeach/math-question-bank> | 276 | ⚠️ **AGPL-3.0** | 本地化高中数学题库管理；**LaTeX 实时渲染 + LLM AI 解析 + OCR 公式识别**。功能与格致高度重叠，**仅作架构参考，代码不可用于闭源产品** |
| **MathCyclus 灵犀题库助手** | <https://github.com/JinLingxi/MathCyclus---Lingxi-Question-Bank-Assistant> | 140 | ⚠️ **无 License** | Streamlit + LaTeX 的自动化题库管理与智能组卷；OCR 识别 + TikZ 实时渲染 + 自动归档。**无 License = 保留所有权利，不可拷贝** |
| gichul-workbench | <https://github.com/rochelobeJYJ/gichul-workbench> | 2 | ⚠️ **无 License** | **方法论最对口**：真题 PDF → 按题号裁切 → 转写 → 按课程单元分类 → 生成可打印题集 |
| NCEE | <https://github.com/fihyer/NCEE> | 1 | ⚠️ **无 License** | 历年高考数学试卷整理（数据不可用） |
| exam-zh | <https://github.com/xkwxdyy/exam-zh> | 43 | LPPL-1.3c | 中文试卷 LaTeX 排版（**已停维护**） |
| ezexam | <https://github.com/gbchu/ezexam> | 42 | ⚠️ AGPL-3.0 | Typst 试卷/讲义模板，API 设计优秀（**可参考思路**） |

> 🔴 **许可警示汇总**：上表中 3 个「无 License」项目默认**保留所有权利**。AGPL 项目对闭源产品不可用。
> **格致应当自研**，把这些项目当作**功能对标与设计参考**，不复制代码与数据。

---

## 5. 数据落地规模与存储策略

### 5.1 规模实测与估算汇总

| 类别 | 实测/估算 | 依据 |
| --- | --- | --- |
| **教材原始 PDF（目标子集 1,742 本）** | **138.6 GB** | ✅ 实测（平台元数据 `ti_size` 累加） |
| 其中：小学 880 本 | 76.7 GB | ✅ 实测 |
| 其中：初中 352 本 | 24.3 GB | ✅ 实测 |
| 其中：高中 516 本 | 37.6 GB | ✅ 实测 |
| 教材总页数 | ≈ **16.6 万页** | [推断] 138.6 GB ÷ 872 KB/页（实测中位码率） |
| 提取纯文本 | ≈ 330–450 MB | [推断] 1.0–1.5 亿字符 × 3 B |
| Chunk 数（600 字 + 80 重叠） | ≈ **18 万** | [推断] |
| 向量（fp32 / 1024 维） | ≈ 738 MB | [推断] |
| 向量（int8 量化） | ≈ 184 MB | [推断] |
| FTS5 倒排索引 | ≈ 200–400 MB | [推断] |
| 页面缩略图（可选） | ≈ 2.5 GB | [推断] 16.6 万 × 15 KB |
| **知识库离线包（不含教材原文）** | **≈ 1.2–1.8 GB**（含缩略图 4–5 GB） | [推断] |
| 题库：单题结构化 JSON | ≈ 3–8 KB | [推断] |
| 题库：**10 万题** | **≈ 0.3–0.8 GB** | [推断] |
| 题库：40 万题（含向量） | ≈ 2.5–4 GB | [推断] |

### 5.2 策略分层建议（**核心结论**）

| 层 | 内容 | 体积 | 分发方式 | 合规依据 |
| --- | --- | --- | --- | --- |
| **L0 · 随安装包** | 程序本体 + Typst 二进制 + 中文字体子集 + **知识树骨架**（课标目录 + NOI 大纲结构 + 知识点图）+ 少量**官方公开**题（四校联考链接元数据） | **≤ 150 MB** | 安装包内置 | 全部为事实性结构 / 官方公开信息 / Apache-2.0 组件 |
| **L1 · 首次运行下载** | 结构化知识库：FTS5 索引 + 向量 + chunks（**不含教材原文**）+ 缩略图 | **1.2–5 GB** | 从自有 CDN 下载，可断点续传 | **衍生数据，不含受保护原文**；[推断] 需法务确认「衍生数据」边界 |
| **L2 · 用户按需下载** | 单本教材的结构化产物（用户指定哪一本才下哪一本） | 每本 **2–8 MB** | 按需拉取 | 同上 |
| **L3 · 用户自行导入** | 教材 PDF 原文、真题 PDF；由软件提供**官方页面跳转**与**一键导入** | **可达 139 GB** | **永不进任何服务器，只在本机** | **合规红线所在**：产品不做、不存、不传 |
| **L4 · 商业授权内容** | 学科网/菁优网/二一开放平台的题库 | 视授权 | 通过授权 API 拉取，**受条款约束** | 必须签协议 |

> 🎯 **一句话决策**：
> **L0 打包，L1 首下，L3 用户导入，L2 按需。教材原文永远走 L3。**

### 5.3 用户本机磁盘占用预估

| 场景 | 磁盘占用 |
| --- | --- |
| 仅装软件 + 知识库 | **≈ 2–6 GB** |
| + 用户导入「小学到高三全科人教版」 | ≈ +5 GB（人教社 269 本实测仅 5.41 GB） |
| + 用户导入「平台全部目标子集」 | ≈ +139 GB |
| 建议 UI 提示 | 「教材原文占用较大，建议按需导入，或指定外部磁盘/网络盘作为内容目录」 |

---

## 6. 结论与「一句话建议」

### 6.1 本报告实测的核心事实汇总

| # | 事实 | 来源 |
| --- | --- | --- |
| 1 | 国家中小学智慧教育平台有**免鉴权公开目录 API**，覆盖 **3,579** 条目 / **2,925** 本电子教材 | 实测 `s-file-1.ykt.cbern.com.cn` |
| 2 | 面向小初高的目标子集 = **1,742 本 PDF / 138.59 GB** | 实测逐本 `ti_size` 累加 |
| 3 | 教材 PDF 中位码率 **872 KB/页** → **极可能无文本层，OCR 是必经环节** | [推断] 基于实测体积 + 页数 |
| 4 | 广东省中考：9 科省级统一命题、语数外各 120 分、数学 120 分钟 | 省教育厅规范性文件原文 |
| 5 | 全国联招：理工/文史各 5 科、每科 150 分、总分 750 | 2026 年招生简章原文 |
| 6 | 四校联考**考纲 + 历年试题 + 建议答案**官方免费公开 | 澳大注册处 + 澳门旅游大学双站验证 |
| 7 | 学科网协议**明令禁止**抓取，并把「制作爬取工具」也列为违规 | 学科网用户协议原文 |
| 8 | 二一教育有**正式开放平台 API**（`dev.21cnjy.com`） | 实测站点 |
| 9 | SQLite FTS5 `unicode61` 把汉字当 token 字符 → **中文检索会失效** | SQLite 官方文档 §4.3.1 |
| 10 | PyMuPDF 是 **AGPL-3.0 / 商业双授权** | PyPI 元数据 |
| 11 | ezexam 是 **AGPL-3.0**；exam-zh 是 **LPPL-1.3c 且已停维护** | GitHub + Typst Universe 实测 |
| 12 | AK CSP 的 `/api/` 在 robots.txt 中**明确禁止抓取** | 实测 robots.txt |

### 6.2 一句话建议（五项决策）

1. **教材来源策略**：以**国家中小学智慧教育平台官方链接 + 用户本地导入 + 本机解析**为唯一路径，产品只分发**结构化衍生知识库（1–2 GB）**，**绝不分发教材原文**，并配齐免责声明与三层架构隔离。

2. **OCR 与结构化方案**：**PyMuPDF 文本层探针分流 → 无文本层走 RapidOCR（Apache-2.0，ONNX，离线轻量）打底 + pix2tex（MIT）专攻公式 → 重公式页在你自己的构建机上用 docling（MIT）/ MinerU 离线批处理**，重模型不随产品分发。

3. **向量检索方案**：**SQLite 单文件 + FTS5（jieba 预分词写入，绕开 unicode61 中文缺陷）+ sqlite-vec（MIT/Apache 双许可，1024 维 bge-m3）+ RRF 融合 + 年级/学科元数据前置过滤**，18 万 chunk 约 1.2–1.8 GB，全离线零服务端。

4. **题库获取优先级**：**① 官方免费公开**（NOI 大纲、四校联考考纲与真题、联考简章、澳门保送须知）→ **② 用户自行导入**（广东中考/高考/联考真题 PDF，产品只给官方跳转与导入器）→ **③ 商业授权**（走 `dev.21cnjy.com` 开放平台 API 签协议，**永不爬取**）。

5. **组卷导出方案**：**Typst（Apache-2.0，单二进制）自研四套模板**（试卷 / 答题卡 / 答案解析 / 答案速查表），题库侧用 **SimHash + 知识点覆盖率 + 难度分布卡方检验** 做约束组卷；**exam-zh 仅作排版能力对标，不作为运行时依赖**（已停维护 + TeX 发行版体积）。

---

## 附录 A · 本次调研已实测核查的 URL 清单

**官方/政府**
- <https://basic.smartedu.cn/> · <https://basic.smartedu.cn/tchMaterial> · <https://www.zxx.edu.cn/>
- <https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/version/data_version.json>（及 `part_100..103.json`、`ndrv2/.../details/{id}.json`）
- <http://www.moe.gov.cn/srcsite/A26/s8001/202204/t20220420_619921.html>
- <https://edu.gd.gov.cn/zwgknew/jyzcfg/gfxwj/content/post_4244085.html>
- <https://www.gatzs.com.cn/gatzs/pz/hongkong/202601/20260120/2293447012.html>
- <http://www.eeagd.edu.cn/lzks/> · <http://eea.gd.gov.cn/> · <https://gaokao.chsi.com.cn/>
- <https://portal.dsedj.gov.mo/webdsejspace/internet/Inter_main_page.jsp?id=80793&>
- <https://portal.dsedj.gov.mo/webdsejspace/addon/upload/Upload_viewfile_page.jsp?id=705896>
- <https://appl2.dsedj.gov.mo/ChinaUEnrollment/UPublic/DownloadUniDoc.jsp?u_id=110250&fileName=电子科技大学.pdf>
- <https://reg.um.edu.mo/admissions/macao-students/admission-examination/jae/syllabus-paper/?lang=zh-hant>
- <https://www.utm.edu.mo/admission/sc/undergraduate_programmes/joint-admission-examination/jae-syllabus-and-past-examination-papers/index.html>
- <http://www.gaes.gov.mo/unification/Math_StandardPaper_MockPaper_SuggestedAnswer.pdf>
- <https://www.noi.cn/upload/resources/file/2025/04/18/NOI_Syllabus_Edition_2025.pdf>
- <http://zy.gdedu.gov.cn/> · <http://zy.gdmzedu.cn/> · <https://www.pep.com.cn/>

**技术文档 / 许可**
- <https://www.sqlite.org/fts5.html>（§4.3.1 unicode61、§4.3.4 trigram）
- <https://pypi.org/pypi/{PyMuPDF,pdfplumber,pypdf,pdfminer.six,paddleocr,paddlepaddle,rapidocr,rapidocr-onnxruntime,easyocr,pytesseract,mineru,magic-pdf,marker-pdf,docling,unstructured,nougat-ocr,surya-ocr,olmocr,sqlite-vec,lancedb,chromadb,qdrant-client,faiss-cpu,jieba,pkuseg,LAC,hanlp,sentence-transformers,FlagEmbedding,rank-bm25,bm25s,onnxruntime,typst,pypandoc,weasyprint,reportlab,fpdf2,pix2tex,playwright,xhtml2pdf,borb,jinja2,python-docx,openpyxl,fastapi,pyside6,pyqt6}/json
- <https://mirror.koddos.net/CTAN/macros/xetex/latex/exam-zh/>（LICENSE = LPPL-1.3c）
- <https://mirror.aria-on-the-planet.es/CTAN/macros/xetex/latex/exam-zh/README.md>
- <https://typst.app/universe/package/ezexam/> · <https://typst.app/universe/package/shuxuejuan>
- <https://openstax.org/license> · <https://oi-wiki.org/>

**仓库（本次实测存在 + 星数 + License）**
- <https://github.com/PaddlePaddle/PaddleOCR>(★90,478, Apache-2.0) · <https://github.com/RapidAI/RapidOCR>(★8,016, Apache-2.0) · <https://github.com/tesseract-ocr/tesseract>(★76,777)
- <https://github.com/opendatalab/MinerU>(★80,914, 自定义许可) · <https://github.com/datalab-to/marker>(★40,133, Apache-2.0) · <https://github.com/docling-project/docling>(★68,239, MIT) · <https://github.com/Unstructured-IO/unstructured>(★15,520, Apache-2.0) · <https://github.com/facebookresearch/nougat>(★10,081, 权重 CC-BY-NC-4.0) · <https://github.com/datalab-to/surya>(★21,431) · <https://github.com/allenai/olmocr>(★19,684) · <https://github.com/lukas-blecher/LaTeX-OCR>(★16,577, MIT)
- <https://github.com/pymupdf/PyMuPDF>(★10,812, AGPL/商业双授权) · <https://github.com/jsvine/pdfplumber>(★10,786, MIT) · <https://github.com/py-pdf/pypdf>(★10,241)
- <https://github.com/asg017/sqlite-vec>(★8,155, MIT/Apache-2.0) · <https://github.com/lancedb/lancedb>(★11,567) · <https://github.com/chroma-core/chroma>(★29,418) · <https://github.com/qdrant/qdrant>(★34,891) · <https://github.com/facebookresearch/faiss>(★41,005, MIT)
- <https://github.com/fxsjy/jieba>(★35,175, MIT) · <https://github.com/baidu/lac>(★4,001, Apache-2.0) · <https://github.com/FlagOpen/FlagEmbedding>(★12,209) · <https://github.com/xhluca/bm25s>(★1,797) · <https://github.com/dorianbrown/rank_bm25>(★1,397)
- <https://github.com/typst/typst>(★56,354, Apache-2.0) · <https://github.com/jgm/pandoc>(★46,463, GPL-2.0) · <https://github.com/Kozea/WeasyPrint>(★9,651, BSD) · <https://github.com/messense/typst-py>(★355)
- <https://github.com/xkwxdyy/exam-zh>(★43, LPPL-1.3c, 已停维护) · <https://github.com/gbchu/ezexam>(★42, AGPL-3.0) · <https://github.com/VWWVVW/shuxuejuan>(★3, MIT)
- <https://github.com/JudgePeach/math-question-bank>(★276, AGPL-3.0) · <https://github.com/JinLingxi/MathCyclus---Lingxi-Question-Bank-Assistant>(★140, 无 License) · <https://github.com/rochelobeJYJ/gichul-workbench>(★2, 无 License) · <https://github.com/fihyer/NCEE>(★1, 无 License)
- <https://github.com/OI-wiki/OI-wiki>(★26,788, CC BY-SA) · <https://github.com/hantang/smartedu-dl-go> · <https://github.com/maplexuci/pdf_book_download_from_zxxeducn>

**商业平台（条款实测）**
- <https://m.zxxk.com/api/v1/agreement/user> · <https://www.zxxk.com/service/detail-773373.html> · <https://www.zxxk.com/robots.txt>（空）
- <https://www.jyeoo.com/robots.txt> · <https://www.jyeoo.com/support>
- <https://zujuan.21cnjy.com/help/vip> · <https://zujuan.21cnjy.com/help/copyright> · <https://dev.21cnjy.com/>

**参考实现**
- <https://www.cspfirstround.com/> · <https://www.cspfirstround.com/papers> · <https://www.cspfirstround.com/paper/cspj-2025>（及 `cspj-2019`…`csps-2026`、`noip-2010`…`noip_senior-2018` 共 34 卷）
- <https://www.cspfirstround.com/q/cspj-2025-04> · <https://www.cspfirstround.com/topic/动态规划>
- <https://www.cspfirstround.com/about> · <https://www.cspfirstround.com/robots.txt> · <https://www.cspfirstround.com/sitemap.xml>

---

## 附录 B · 本次调研**刻意未做**的事（合规声明）

1. ❌ **未下载任何一本教材的正文文件。** 仅获取了平台公开的**目录与文件元数据**（书名、出版社、字节数、标签），用于规模测算。下载量：4 个目录分片（33.5 MB）+ 3,579 次详情 JSON 请求。
2. ❌ **未抓取任何题库网站的题目内容。** 仅访问了首页、帮助页、`robots.txt`、`sitemap.xml`、服务协议与版权声明页，用于判定合规边界。
3. ❌ **未绕过任何登录、付费墙或访问控制。** 所有请求均为未登录状态。
4. ❌ **未调用 AK CSP 的 `/api/` 接口**（其 robots.txt 明确 `Disallow: /api/`），仅探测了不存在的路径以确认 API 存在。
5. ✅ 对受版权内容**只记录 URL**，不复制内容。
6. ✅ 本报告的所有数字均标注了**实测**或**推断**来源。

> **⚠️ 交付给「格致」产品团队的第一条行动项**：
> 在写第一行抓取代码之前，请法务确认三件事：
> ① 结构化衍生数据（chunks / 向量 / 知识点图）的再分发边界；
> ② 四校联考 PDF 能否随软件分发（还是只能做链接）；
> ③ 若走商业授权，预算与 `dev.21cnjy.com` 的接入条件。
