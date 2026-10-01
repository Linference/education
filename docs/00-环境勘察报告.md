# 格致 · 本机环境勘察报告（P0 基线）

> 生成时间：勘察即日（会话内实测）
> 说明：本文件只记录**实测到的事实**，供开发计划做选型与体积预算。凡未实测者一律标注「未验证」。

## 一、硬件与系统

| 项目 | 实测值 |
| --- | --- |
| 操作系统 | Windows 11 家庭版 中文版，10.0.26200，64 位 |
| 系统盘 C: | 已用 244.4 GB，**剩余 55.6 GB**（偏紧，安装包与依赖不要默认塞 C 盘） |
| 数据盘 D: | 已用 213.9 GB，**剩余 409.9 GB**（项目、库、模型、依赖建议全放 D 盘） |

## 二、已装工具链

| 工具 | 路径 | 版本 |
| --- | --- | --- |
| Node.js | `C:\Program Files\nodejs\node.exe` | v24.18.1 |
| npm | `C:\Program Files\nodejs\npm.ps1` | 随 Node |
| pnpm | `C:\Users\LINKIT\AppData\Roaming\npm\pnpm.ps1` | 已装 |
| Python | `C:\Users\LINKIT\AppData\Local\Programs\Python\Python311\python.exe` | 3.11.9（目录 10.99 GB） |
| uv | `C:\Users\LINKIT\.local\bin\uv.exe` | 已装（做 Python 依赖隔离很有用） |
| Git | `C:\Program Files\Git\cmd\git.exe` | 2.55.0.windows.3 |
| Rust | `C:\Users\LINKIT\.cargo\bin\cargo.exe` / `rustc.exe` | 已装（Tauri 路线可行） |
| .NET | `C:\Program Files\dotnet\dotnet.exe` | 已装 |
| VS Code | `code.cmd` | 已装 |
| opencode | `C:\Users\LINKIT\AppData\Roaming\npm\opencode.ps1` | 已装（`opencode serve` 可用） |
| Obsidian | 桌面快捷方式已装，Vault 在 `D:\Users\LINKIT\Documents\Obsidian Vault` | 空库（仅「欢迎.md」） |
| LaTeX | `D:\MiKTeX\miktex\bin\x64\`（xelatex / pdflatex / lualatex / kpsewhich / mpm） | MiKTeX，整目录约 **1.0 GB** |
| pdftoppm | `D:\MiKTeX\miktex\bin\x64\pdftoppm.exe` | poppler，可用于 PDF 转图与渲染核验 |
| pandoc | **未安装** | — |
| typst | **未安装** | — |
| tesseract / magick / soffice | **未安装** | — |

### MiKTeX 中文与组卷能力（kpsewhich 实测）

已安装：`ctex.sty`、`xeCJK.sty`、`exam.cls`、**`exam-zh.cls`**、`unicode-math.sty`、`geometry.sty`、`tikz.sty`
未安装：`fandol-fonts`（中文默认字体包之一，缺了也不致命，可改用系统字体 `SimSun`/`Noto Serif CJK`）

> 结论：**本机已具备「中文试卷 + 数学公式」的 LaTeX 出卷能力**，`exam-zh` 正是国内试卷排版的专用文档类，组卷导出 PDF 的研发可以直接落地，不必等打包工作完成。

## 三、可复用的既有资产（重要，避免重复造轮子）

### 1. 前作：AI 学习助手（比赛项目）`D:\Users\LINKIT\Desktop\全球青少年人工智能創新大賽`

已有可复用代码与设计：

- `app\server\src\opencode.js`（318 行）：**已经实现了把 `opencode serve` 当子进程托管 + HTTP 客户端 + SSE 事件流**，包含 `ensureServer()`、`createSession()`、`sendMessage()`、`listMessages()`、`addMcpServer()`、`resolveModel()`。这就是「内嵌 AI Agent」的现成骨架。
- `app\mcp-kb\`：已搭起 **MCP server**（`@modelcontextprotocol/sdk ^1.30.1`）承载知识库。
- `app\web\package.json` 已选好前端依赖：React 19、Vite、`pdfjs-dist`、`mammoth`、`docx-preview`、`markdown-it`、`katex`、`highlight.js`。
- `app\server\package.json` 已选好服务端依赖：`docx`（生成 Word）、`express`、`puppeteer-core`、`zod`。
- `docs\01-architecture.md`、`02-product-architecture.md`、`03-plan.md`、`04-innovation-design.md`：已有产品设计与「引用强制 + 逐句查核」的核心主张。
- `docs\03-plan.md` 明确记录：**opencode 引擎 + DeepSeek API + 本地 SQLite(FTS5) 检索**，并已把「教材切段 → 检索 → 生成 → 逐句查核 → 导出 md/docx/pdf → 内嵌预览」定为数据流。

> 格致项目应当**吸收**这套骨架（尤其 `opencode.js` 与文件产线），而不是从零开始。

### 2. 已配置的模型通道 `C:\Users\LINKIT\.config\opencode\opencode.json`

- `deepseek` provider：`@ai-sdk/openai-compatible`，`baseURL = https://api.deepseek.com/v1`，已配置模型名 `deepseek-v4-flash`、`deepseek-v4-pro`。
- `zhipu` provider：`glm-4v-flash`（视觉模型，可做 OCR/图片理解兜底）。
- 已注册 MCP：`blender`、`playwright`、`zhipu-vision`（本地 Python 脚本）。

> ⚠️ **安全提示**：该配置以明文保存了 DeepSeek 与智谱的 API Key，且**同一份 Key 还被复制进了比赛项目的 `docs\opencode-config-sample.json`**。请尽快到两家控制台**吊销并重新生成**，新 Key 改用 Windows DPAPI / `safeStorage` 加密保存，且任何 `*-sample`/示例文件、git 提交、研究报告中一律不得出现明文 Key。格致的配置层要内置「检测到疑似明文 Key」的告警。

### 3. 题库与知识库原始素材（用户已有）

| 位置 | 内容 | 对格致的价值 |
| --- | --- | --- |
| `D:\Users\LINKIT\Desktop\csp\` | 22 个文件：CSP 知识专题 PDF（計算機概述、數制、編碼、網絡、排序、圖、鏈表、棧與隊列…）+ CSP-J/S 2019–2024 初赛试题与答案解析 PDF | 信奥题库与知识点的第一批语料，含**答案与解析**，可直接入题库 |
| `D:\Users\LINKIT\Documents\csp-s\` | `CSP-S-提高级-知识清单.md`、`CSP-S知识点地图.md` + `知识点\01..05`（基础/C++/数据结构/算法/数学）共计数十篇 md | **现成的知识点图谱骨架**（含层级分类），可直接导入 knowledge_points 表 |
| `D:\Users\LINKIT\Desktop\物理竞赛\` | `高中物理\` 15 章「知識拓展」doc（力學→原子物理，单文件 3–11 MB）+ `历屆賽題\應用賽題庫\`（含 2022/2023 澳門高一/高二/高三應用物理競賽卷）+ 奥赛方法、普通物理學 | 高中物理知识库 + 澳门本地赛题来源；doc 需转 docx/md |
| `D:\Users\LINKIT\Desktop\人工智能\` | `高中(試用)_v2 (1).pdf`（29 MB，高中人工智能教材）、9 份课堂作业 PDF/ipynb、`前饋神經網路_作業詳解.md` | 「人工智能」这一科的自有教材与作业批改语料；**已验证：PDF 与 ipynb 都会被知识库摄取** |
| `D:\Users\LINKIT\Documents\English grammer\` | 英语语法资料（截图里的「情态动词语法题」即出自此体系） | 英语学科题库与笔记的落点 |
| `D:\Users\LINKIT\Desktop\计划安排表\panda-plan\` | Drizzle + SQLite 的网站版计划表（表 `planner`，字段 id/body/version/updated_at） | 日历计划模块可参考其 schema 思路（但功能远不够，需重做） |

> 实测结论：**人教版教材 PDF 在本机尚未存在**（全盘按「人教版/必修/选修/教材/中考/高考/联考」检索，只命中物理竞赛与澳门本地赛卷）。教材采集是 P7 阶段从零开始的工作，且需要先解决版权与来源问题。

## 四、由环境倒推的六条工程约束

1. **不要把大体积依赖装到 C 盘**：C 仅剩 55.6 GB。Python 运行时、LaTeX、模型、教材库、题库统一规划到 `D:\Gezhi\`（或用户文档目录下的 `格致\`）。
2. **LaTeX 不要重复打包**：本机已有 1.0 GB 的 MiKTeX 且中文宏包齐全。格致的策略应是「优先复用系统已有 TeX；检测不到时再引导安装 TinyTeX/MiKTeX 便携版」，而不是无条件内置一份 1 GB 的 TeX。
3. **能复用比赛项目就复用**：`opencode.js` 的进程托管 + SSE 事件流、文件产线依赖（docx / pdfjs / mammoth / docx-preview / katex / markdown-it）已经选过一轮，格致直接接手并升级。
4. **PDF 处理的现实**：本机 `pdftoppm` 可用、`pdfium` 未验证。截图中的教材/讲义大量是**繁体扫描件**（如 CSP 试卷、澳门章程），所以「扫描件 OCR + 版面还原」不是可选项，而是必须设计的分支。
5. **中文排版必须走 XeLaTeX**：`ctex`/`xeCJK`/`exam-zh` 已就位，pdflatex 路线中文不可用，导出管线默认 `xelatex`。
6. **模型调用走 OpenAI 兼容层**：DeepSeek 与智谱都是 `openai-compatible`，格致只需一个兼容客户端即可同时接两家，便于「便宜模型做摘要 / 强模型做推理」的成本分层。

## 五、待办与未验证项

- [ ] 未验证：`better-sqlite3` 在本机 Node 24 上是否有预编译二进制（若无，将被迫改用 `node:sqlite` 或 `libsql`）。
- [ ] 未验证：`pdfium` / `sqlite-vec` / `lancedb` 在 Node 24 + Windows 的组合可用性。
- [ ] 未验证：腾讯云 ASR/TTS 账号是否已开通、额度与计费。
- [ ] 未验证：国家中小学智慧教育平台电子教材的可访问性与下载方式（需登录，另行实测）。
- [ ] 待处理：吊销并轮换上文提到的两个明文 API Key。
- [ ] 待确认：格致的「文档」默认库位置（建议 `D:\Users\LINKIT\Documents\格致\`，多库并列）。
