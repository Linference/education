# 格致

**当前版本：0.0.8 · 2026 年 10 月 7 日**

格致已从本地资料管理工具，发展为以讲解、追问和可追溯反馈为核心的 AI 学习工作室。

## 发展历程

完整记录见 **[格致的发展历程](docs/发展历程.md)**。最初的 23 个 Git 提交完整保留，后续版本在原历史之上追加。

| 阶段 | 主要进展 |
| --- | --- |
| 2026-10-01 | 工程地基、中文编辑与检索、Electron 桌面端、文档查看、AI 助手、语音与费曼讲解。 |
| 2026-10-02 | 设置、关系图谱、题库组卷、工作区设计与交接清单。 |
| 0.0.2 | 自信度记录、错误侦探、学习证据地图、迁移挑战和概念实验。 |
| 0.0.3 · 2026-10-06 | 五个角色空间、六维讲解反馈、首次连接引导，改进题库导入与文档导出。 |
| 0.0.4 · 2026-10-06 | 统一数字空间入口与动效，修复矩阵乘积等公式的 PDF 导出。 |
| 0.0.5 · 2026-10-06 | 采用“六维之窗”标志，软件与安装包图标使用真实透明背景。 |
| 0.0.6 · 2026-10-07 | 资料按章节 / 页段进入学习流程；实验关联原文与控制变量；六维反馈连接任务、再次讲解和证据地图；保留草稿及阅读位置。 |
| 0.0.7 · 2026-10-07 | 数字空间加入多轮追问与回应；整段反馈只评价学习者发言；原文引用可高亮定位；草稿、未发送回答与对话跨重启恢复。 |
| 0.0.8 · 2026-10-07 | 英文比赛展示、离线备用示范、实时英文 AI 对话、六维人工复核、AI 使用披露与英文证据导出。 |

## 当前功能与说明

- 五种听众：同学、教师、学生、考官、研究伙伴，采用不同追问策略。
- 多轮对话：每段最多 12 轮，根据角色选择条件检查、生活迁移、边界挑战或可检验预测；断线后保留回答并重试。
- 六维反馈：准确性、条件、推理、表达、举例与迁移，附讲解原话、判断原因和下一步建议；证据不足时保留未评分状态。
- 学习活动：自信度练习、错误侦探、证据地图、迁移挑战与函数 / 受力 / 概率实验。
- 资料工作区、全文检索、笔记图谱、题库预览导入与组卷，以及 Markdown / PDF / Word 导出。
- 深浅主题、减少动态效果设置与透明 Logo。
- 当前资料栏支持 Markdown / TXT、DOCX 提取文字与 PDF 页段；选择原文片段后可创建开放探究任务。
- 实验记录包含资料快照、实际模型运行数据及两轮对照；预测尚未完成实验时不计入实验通过。
- 六维薄弱项可创建针对性任务；再次讲解展示同一资料、主题与角色下已评分维度的变化；AI 分数不计入独立通过。
- 数字空间草稿和对话按资料库、角色与资料快照保存在本机；原文引用逐字匹配后可高亮定位。
- 比赛展示入口提供纯英文界面、五角色离线示范和联网 AI；隔离英语资料库在退出时回到原资料库。
- 六维人工复核记录评分理由，按报告去重统计一致率与平均绝对差；复核身份为自声明，尚未校准。
- AI 使用披露保留真实版本、用途与学生工作；聚合证据导出为英文 MD / PDF，未填写字段明确标为不完整。

实现文档：[学习工作室](docs/学习工作室-实现与验证.md) · [数字空间](docs/多角色学习空间-0.0.3.md) · [动效与公式修复](docs/数字空间与动效-0.0.4.md) · [品牌记录](brand/identity-v3.md)。
本轮说明：[比赛评审与人工复核 0.0.8](docs/比赛展示与人工复核-0.0.8.md)；前序：[多轮学习对话 0.0.7](docs/数字空间多轮对话-0.0.7.md)、[资料驱动的学习闭环 0.0.6](docs/资料驱动学习闭环-0.0.6.md)。

AI 反馈属于形成性反馈，目前没有真实学生试用数据，评分尚未经教师校准。扫描 PDF 需要先 OCR；云端 AI 与语音需要相应账号和网络。

## 开发与构建

推荐 Windows x64 与 Node.js 24.x。在仓库根目录安装锁定依赖并构建：

```powershell
npm ci
npm --prefix apps/desktop ci
npm --prefix packages/voice ci
npm --prefix apps/desktop run build:renderer
& .\apps\desktop\node_modules\.bin\electron.cmd .\apps\desktop
```

完整安装包需按 [Typst](vendor/typst/README.md)、[LibreOffice](vendor/soffice/README.md)、[DeepSeek Harness](vendor/dsh/README.md) 的说明准备第三方程序，然后运行 `node scripts/build-installer.mjs`。输出位于 `dist/installer/0.0.8/`。

核心验证：`node --test apps/desktop/learning.test.mjs apps/desktop/bank-import.test.mjs apps/desktop/companions.test.mjs`；公式验证：`node scripts/latex2typst.test.cjs` 与 `node scripts/verify-math-pdf.mjs`。真实模型测试需额外服务配置，可能产生费用。

<details>
<summary>初始工程阶段说明（保留作为历史资料）</summary>

> 本地优先的个人学习操作系统 —— 像 Obsidian 一样管知识，像 VSCode 一样编辑文档，
> 让 AI 站在**你自己的书上**说话，能出卷、能考你、能替你排计划。

产品名取自「格物致知」。

---

## 现在能跑什么

```bash
# 一条命令跑完全部地基检查（P0）
node scripts/p0.mjs

# 看"文档"目录是怎么解析出来的（库默认放这儿）
node packages/db/src/cli.mjs where

# 建一个库
node packages/db/src/cli.mjs init 高二下 --subject 英语 --grade 高二

# 列出所有库
node packages/db/src/cli.mjs list

# 依赖许可门禁（拦住 AGPL / 非商业 / 禁止生产使用等）
node scripts/check-licenses.mjs
node scripts/check-licenses.test.mjs    # 门禁自测：证明它真的会拦

# 数据库结构断言（含中文双 FTS 索引）
node packages/db/src/assert-schema.mjs

# DSH 桥冒烟（真实调用 AI + 受控改库内文件）
node packages/dsh-bridge/smoke.mjs
```

> **不需要 `npm install`** —— 目前所有代码只用 Node 内置模块（含 `node:sqlite`）。
> 这正是刻意的：地基阶段不引入任何依赖，就不可能有供应链与许可风险。

---

## 目录结构

```
格致/
├─ 格致-开发计划.md          ← 总纲：选型、架构、数据模型、P0–P11、风险登记册
├─ docs/                     ← 实测文档（环境勘察 / DSH 选型 / 存储 / DSH 集成）
│  └─ templates/             ← 可复跑的探针脚本与 DSH 配置样本
├─ research/                 ← 六份技术调研（编辑器图谱 / 文档内核 / 教材题库 / 数字人 / 日历）
├─ poc/ime/                  ← 中文输入法 PoC（CodeMirror 6，自动测试 8/8 通过）
├─ packages/
│  ├─ db/                    ← SQLite 结构与检索（node:sqlite + FTS5 双索引）
│  ├─ core/                  ← 库（Vault）脚手架、路径解析
│  └─ dsh-bridge/            ← DeepSeek Harness 桥：把 dsh headless 封成事件流
├─ apps/desktop/             ← Electron 桌面端（P1 起）
└─ scripts/                  ← P0 总入口与 CI 门禁
```

---

## 四条不妥协的原则

1. **数据在你电脑上** —— 库就是一个普通文件夹，Markdown 是唯一真源，随时能用别的软件打开。
2. **AI 必须站在证据上** —— 回答教材问题要给「哪本书、哪一页」；找不到出处就明说，不许编。
3. **可操作、可验收** —— 每个阶段都能跑、能演示、能回退；不做"看起来快完成"的半成品。
4. **不重复造引擎** —— Agent 内核用 DeepSeek Harness，文档内核用现成开源件，格致只做学习领域真正缺的东西。

---

## 已知的硬约束（都是实测得出的，别再踩）

| 约束 | 说明 |
| --- | --- |
| **中文 FTS 必须用 trigram** | SQLite 默认 `unicode61` 把汉字视为 token 字符而中文无空格 → 整句变成一个 token，**检索静默返回 0 条**。已用双索引解决（trigram 召回 + jieba 预分词排序） |
| **库路径不能硬编码** | 「文档」可能被重定向（本机就在 D 盘）。用 `app.getPath('documents')`，纯 Node 下读注册表 |
| **索引与缓存放 `%APPDATA%`** | 库若在 OneDrive 等同步目录里，WAL 模式的 SQLite 会被云盘打断写入而损坏 |
| **不要 spawn `.cmd` 文件** | Node 24 起报 `EINVAL`。DSH 桥直接调 `DeepSeek Harness.exe` + `ELECTRON_RUN_AS_NODE=1`，**绕开 shell 也就绕开了命令注入面** |
| **DSH 的 cwd 就是沙箱边界** | `sandbox-policy.workspaceRoot = process.cwd()`，所以把 cwd 设成当前库 = AI 只能改这个库 |
| **子进程 stdout 要显式 UTF-8** | 否则中文乱码；另外 NDJSON 里可能有被 ANSI 污染的行，解析要宽容 |
| **补全源必须首行判 composing** | 实测 CodeMirror 的 autocompletion 在 `view.composing === true` 时**仍会**调用补全源 → 中文组词时补全弹窗与输入法候选词抢按键（就是 Monaco #2199 那个病）。每个补全源第一行写 `if (context.view?.composing) return null;` |
| **别用 PowerShell 的 `Get-Content` 读 UTF-8 文件** | 它默认按系统 ANSI（本机 GBK）解码 → 中文变乱码；再 `Set-Content -Encoding utf8` 写回就**永久损坏**（本项目 README.md 已中招一次）。判断编码与读写请用 Node，或至少 `-Encoding UTF8` |
| **Electron 主进程/preload 必须是 CommonJS** | `import { app, BrowserWindow } from "electron"` 会报 `does not provide an export named 'BrowserWindow'` —— Electron 内置模块不提供 ESM 具名导出。主进程与 preload 用 `.cjs`，渲染进程照常 ESM |
| **`ELECTRON_RUN_AS_NODE=1` 会让 Electron 变成 Node** | 环境里残留这个变量时，Electron 启动会报 `Cannot read properties of undefined (reading 'whenReady')`。调试 DSH 时设过它的话，记得清掉 |
| **PowerShell 用 GBK 读 UTF-8 文件** | 会显示成乱码，但**文件本身是对的**。判断编码请用 Node 读，别信 `Get-Content` |

---

## 依赖许可红线

调研发现一批"看起来能用、实际不能用"的库，已在 CI 门禁里拦住：

- **AGPL-3.0**：PyMuPDF、`ezexam`（Typst 试卷模板）、Logseq / AppFlowy / Trilium / 思源
- **非商业**：Nougat 模型权重（CC-BY-NC-4.0）
- **明文禁止生产使用**：tldraw
- **非 OSI 开源**：Anytype

替代方案见 [格致-开发计划.md](格致-开发计划.md) 的风险登记册 R2b/R2c。

---

## 已验证的能力（都有可复跑的证据）

| 能力 | 状态 | 证据 |
| --- | --- | --- |
| P0 地基（库结构 / DSH 桥 / 许可门禁 / 密钥防线） | ✅ 9/9 | `node scripts/p0.mjs` |
| 中文输入法（组合输入） | ✅ 8/8 | `poc/ime/cdp_ime_final.py` |
| R13 自动补全 × 输入法 | ✅ 5/5 | `poc/ime/cdp_r13_test.py` |
| 腾讯云 ASR / TTS（含合成→识别闭环） | ✅ 10/10 | `packages/voice/verify-tencent.mjs`（需环境变量密钥） |
| 产出物去品牌化 + 知识点详细度 | ✅ 10/10 | `typst compile templates/typst/handout-sample.typ` |
| Electron 壳（启动 / IPC / 安全约束 / 文件树 / 标签页） | 见 `apps/desktop/smoke-electron.mjs` | — |

## 下一步

P1 = 知识库与编辑器（Electron 壳 + 文件树 + 标签页 + CodeMirror 6 + Live Preview）。

进度与验收标准见 [格致-开发计划.md](格致-开发计划.md) §5。

</details>
