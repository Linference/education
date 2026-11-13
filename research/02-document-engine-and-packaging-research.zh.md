# 格致 · 文档内核与打包调研（02）

> 目标：为格致选定 **PDF 查看 / PDF 生成 / Word 读写 / Markdown 导出** 的内核，并决定「Python、LaTeX、Pandoc」这些重依赖如何随应用交付。
> 标注约定：`【实测】`= 在本机跑过；`【事实】`= 有可核查来源；`【推断】`= 工程判断；`【未验证】`= 落地前需自查。

---

## 一、结论速览

| 层 | 选型 | 关键理由 |
| --- | --- | --- |
| PDF 查看 | **pdfjs-dist**（Mozilla，Apache-2.0） | 纯前端、无服务端、与 Electron/React 契合；能拿文本层做检索与引用锚点 |
| PDF 生成（试卷/讲义） | **XeLaTeX**（本机已有 MiKTeX + `ctex`/`xeCJK`/`exam-zh`） | 中文 + 数学公式 + 试卷版式的唯一"一次就对"路线 `【实测】` |
| PDF 生成（快速/无 TeX 兜底） | **Chromium 打印 HTML**（Electron 自带 `webContents.printToPDF`） | 零额外依赖，样式可控，适合"笔记导出"这类轻排版 |
| Word 生成 | **python-docx**（走 DSH 的 office-skills）；JS 侧兜底用 `docx` | 页眉页脚、目录、中文字体控制更成熟；DSH 已内置该能力 |
| Word 查看 | **docx-preview**（高保真预览）+ **mammoth**（转 HTML/文本入索引） | 只读预览足够；**不做** docx 真正编辑（需 ONLYOFFICE 级别组件） |
| 依赖交付 | **分层**：核心内置 / TeX 与 Pandoc 优先复用系统 / 教材题库按需下载 | 本机 C 盘仅剩 55.6 GB `【实测】`，不可能全量内置 |

---

## 二、PDF 查看

| 方案 | 许可 | 说明 |
| --- | --- | --- |
| **pdfjs-dist** | Apache-2.0 | 事实标准。Canvas 渲染 + 文本层，支持流式加载大文件、缩放、搜索。格致用它实现「引用的 page=42 直接跳转」 |
| pdfium（`pdfium-binaries` / EmbedPDF） | BSD-3（PDFium）/ 各自 | 渲染更快、注释与表单能力更完整，但需原生二进制并处理 Electron ABI。**先不用**，作为 P2 之后的性能升级项 |
| MuPDF / mupdf.js | **AGPL-3.0**（或商业授权） | 功能强但许可不允许闭源分发 → **排除** |
| **PyMuPDF**（`fitz`） | **AGPL-3.0 / Artifex 商业双授权**`【事实】` | 渲染与提取都很好用，但**闭源产品要么买授权，要么别用** → 格致改用 `pdfplumber`(MIT) / `pypdf`(BSD)；仅在"用户自建脚本"里可选 |
| PSPDFKit / Apryse | 商业 | 排除 |

`【事实】` PDF.js 与 PDFium 的定位差异（前者纯 JS 便于嵌 Web，后者原生性能更好）参见 [PDFium vs PDF.js 对比](https://www.react-pdf-kit.dev/blog/pdfium-vs-pdfjs-react-rendering-engine)。

**格致要点**：PDF 查看器必须暴露「当前页码」与「文本选中位置」，因为**教材引用的锚点就是页码**（P7 的引用强制依赖它）。

---

## 三、PDF 生成：三条管线

| 管线 | 中文 | 公式 | 版式控制 | 体积/依赖 | 定位 |
| --- | --- | --- | --- | --- | --- |
| **① Markdown → Typst → PDF** | 好 | 好 | 强（自研试卷模板，Typst 本体 Apache-2.0） | 单文件约 30 MB | **试卷、讲义（P8 改用这条为主）** |
| ② Markdown → XeLaTeX → PDF | 好（`ctex`） | 好（原生） | 最强（`exam-zh`） | 需 TeX（本机已有） | **备选**：仅当用户系统已装 TeX；`【事实】` `exam-zh` 自 2024-04-26 起停止维护，不作为产品依赖 |
| ③ Markdown → HTML → Chromium `printToPDF` | 好（用系统字体） | 好（KaTeX） | 中（CSS 分页） | 零额外依赖 | **笔记导出、快速预览** |

> ⚠️ **许可红线**：`ezexam`（Typst 试卷模板）为 **AGPL-3.0**，**不能打包进闭源产品**，只能参考其版式设计；`Nougat` 模型权重为 **CC-BY-NC-4.0**，商业不可用。详见 [`04-教材与题库数据源调研.md`](04-教材与题库数据源调研.md)。

`【实测】` 本机 `kpsewhich` 已确认安装：`ctex.sty`、`xeCJK.sty`、`exam.cls`、**`exam-zh.cls`**、`unicode-math.sty`、`geometry.sty`、`tikz.sty`；`fandol-fonts` **未安装**（可改用系统字体，如 `SimSun` / `Noto Serif CJK`）。
`【实测】` 因此 **pdflatex 路线中文不可用，必须 XeLaTeX**（或 LuaLaTeX）。

**中文排版的四个坑（工程备忘）**
1. **字体嵌入**：XeLaTeX 用系统字体时 PDF 会内嵌子集，体积可控；用 `fandol` 需确保包存在。
2. **断行与标点**：`ctex` 默认已开启标点挤压与中英混排间距，别自己再改 `\XeTeXlinebreaklocale`。
3. **代码块**：用 `listings` 或 `minted`（minted 需 Python + Pygments，会把依赖链变长 → 建议 `listings` + 自定义样式）。
4. **目录与页码**：试卷通常不要目录但要页码；讲义两者都要 —— 模板分开更省事。

---

## 四、Word（.docx）

| 任务 | 方案 | 说明 |
| --- | --- | --- |
| **生成 docx** | **python-docx**（首选）/ JS `docx`（兜底） | 支持样式、页眉页脚、分节、表格、图片；中文只需设置字体名与 `w:eastAsia` |
| 读取/转文本入索引 | **mammoth**（JS）/ `python-docx` | mammoth 转 HTML 保留标题层级，最适合做知识库切块 |
| 只读预览 | **docx-preview** | 在浏览器里高保真渲染 docx，够用 |
| 真·编辑 docx | ONLYOFFICE Docs / Collabora | 需要独立服务（Docker 或本地服务端）+ 许可评估 → **v1 不做**。产品里明确「Word 只读预览，编辑请用 WPS/Word 打开」 |

`【事实】` DSH 自带 `resources\runtime\office-skills\office-docx\SKILL.md` 与 `scripts\check_office.py`（另含 pptx/xlsx），并配有 `libreoffice-kit` 与 Python 3.12 运行时（含 python-docx / python-pptx / openpyxl / pandas / Pillow / lxml / XlsxWriter）`【实测】`。**这意味着「生成 docx」这件事格致可以直接复用，不必自己搭 Python 环境。**

---

## 五、依赖打包策略（本机约束倒推）

`【实测】` C 盘剩 55.6 GB、D 盘剩 409.9 GB；本机已装：Node 24.18.1、Python 3.11.9（10.99 GB）、uv、MiKTeX 整目录 **1.0 GB**；**未装** pandoc / typst / LibreOffice / ImageMagick / Tesseract。

| 依赖 | 体积量级 | 交付策略 |
| --- | --- | --- |
| Electron 本体 | 180–250 MB | 内置（不可省） |
| DSH 运行时 | 已有（用户已装） | **复用系统已装**；未装则引导安装或作为可选组件下载 |
| Python + 必需库 | 60–120 MB | 用 `uv` 建独立环境；只装 pypdf / python-docx / openpyxl / Pillow（+ 可选 pandas、matplotlib） |
| LaTeX | 完整 MiKTeX ≈ 1 GB；最小中文 XeLaTeX 子集约 150–400 MB | **优先复用系统已装 TeX**；未装则引导安装 TinyTeX/MiKTeX；**不无条件内置 1 GB** |
| Pandoc | 30–80 MB | 按需下载（仅当用户选了 Pandoc 管线） |
| Typst | 单文件约 30 MB | 可选组件 |
| Chromium | Electron 自带 | 免费得到「HTML → PDF」能力 |
| 语音模型（sherpa-onnx 中文） | 50–300 MB | 按需下载，可离线 |
| 教材 / 题库 | 数百 MB – 数 GB | **绝不入安装包**，官方来源下载或用户导入 |

**目标**：安装包 ≤ 300 MB；首次启动后「检查依赖 → 引导补齐」≤ 5 分钟。
**降级原则**：每一项依赖缺失都必须有可用降级（没 TeX → 走 Chromium 打印；没 Pandoc → 走内置模板；没语音模型 → 走文字费曼模式），**不允许出现"缺依赖就崩溃"**。

---

## 六、桌面壳：为什么最终仍选 Electron

| 维度 | Electron | Tauri 2 |
| --- | --- | --- |
| 界面内核 | 自带 Chromium（版本统一） | 系统 WebView2（版本随系统） |
| 安装包 | 180–250 MB | 10–20 MB |
| 本地子进程（Python/TeX/DSH） | Node `child_process`，直接 | Rust sidecar + shell 插件，配置更繁琐 |
| 与 pdf.js / CodeMirror / sigma.js 的兼容 | 开箱即用 | 基本可用，但 WebView2 差异需实测 |
| SQLite | `node:sqlite` 内置 `【实测】` | 需 Rust 侧或 sql 插件 |
| 适合本项目的关键点 | **一次搞定渲染、子进程、文件系统、自动更新** | 体积优势被"本就要带 Python/TeX"抵消 |

`【推断】` 对格致这种「重本地依赖 + 重编辑器」的应用，Electron 的**集成成本优势**大于体积劣势，故选 Electron；若未来要做"轻量只读伴侣"，再考虑 Tauri。参考：[Tauri vs Electron 实战对比](https://devtoolpicks.com/blog/tauri-vs-electron-indie-hackers-2026)。

---

## 七、一句话建议

**查看用 pdfjs-dist + docx-preview；生成走「XeLaTeX（试卷/讲义）+ python-docx（Word）+ Chromium 打印（快速导出）」三条管线；重依赖一律分层——优先复用系统已装的 MiKTeX 与 DSH 自带 Python/office-skills，缺什么引导装什么，且每种缺失都有降级路径；桌面壳选 Electron。**

---

## 附录 · 待自查清单

- [ ] `【未验证】` Typst 的中文试卷模板生态成熟度（P5 时实测一次再决定是否纳入）。
- [ ] `【未验证】` pdfium 在 Electron 下的原生模块加载（若 P2 后需要更强 PDF 能力）。
- [ ] `【未验证】` TinyTeX 最小中文子集的实际体积（决定"引导安装"的文案与预期）。
- [ ] `【未验证】` `fandol-fonts` 在 MiKTeX 下的安装体积（或改用系统字体方案并固定字体清单）。
