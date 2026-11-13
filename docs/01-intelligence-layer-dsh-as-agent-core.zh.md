# 格致 · 智能层选型：把 DeepSeek Harness (DSH) 作为内嵌 Agent 内核

> 本文是实测结论，不是设想。凡标注「实测」的条目都在本机跑过，命令与输出附在文末。
> 结论先行：**不做自己的 Agent 循环，也不照搬 opencode；把 DSH 当 Agent 内核嵌进来，格致只做「学习领域的产品层」。**

---

## 一、为什么改主意（对比原方案）

前作（比赛项目）的方案是「把 `opencode serve` 当子进程 + 自己写 HTTP/SSE 客户端」。那条路能用（代码已经在 `app\server\src\opencode.js`），但有三处结构性代价：

| 维度 | opencode 方案 | **DSH 方案（本文推荐）** |
| --- | --- | --- |
| 模型与密钥 | 要在格致里再存一份 DeepSeek API Key | **复用用户已登录的 DSH 账号**（`~/.dsh/llm-deepseek`、`credentials`），格致不碰明文 Key |
| 会话与持久化 | 自己设计 JSONL/SQLite | DSH 已内置 `session-persistence-jsonl` + `session-query-sqlite` + 投影缓存 + 标题生成 |
| 工具与沙箱 | 自己实现读写/搜索/执行 + 权限 | DSH 已内置文件工具、pwsh/bash 沙箱、审批策略、权限预设 |
| 上下文治理 | 自己做裁剪与压缩 | DSH 已内置 `compaction-basic`、`compaction-tool-result-pruner`、`spill-policy`、`token-meter` |
| 扩展方式 | 改 opencode 源码或写 MCP | **写 DSH 插件（profile patch）或 MCP server，属于官方扩展点** |
| 学习场景能力 | 无 | 已内置 skills、subagent、workflow、goal、todo、plan-mode、web 搜索 |
| 语音 | 无 | **已内置 `sherpa-onnx-win-x64`（离线中文语音）** |
| Office 文档 | 自己拼 python-docx 等 | 已内置 `office-skills`（docx/pptx/xlsx 的 SKILL + 校验脚本）与 `libreoffice-kit` |

一句话：格致要造的「AI 大脑 + 文档产出 + 语音」，DSH 里已经有三样。重复造一遍不但浪费，还会在比赛/答辩里说不清「哪部分是你做的」。

---

## 二、DSH 是什么（实测事实）

| 项目 | 实测值 |
| --- | --- |
| 形态 | Electron 桌面应用 + 内嵌 CLI + 本地 Web GUI |
| 版本 | 主程序 `resources\runtime\primary-runtime\runtime.json` 中 `desktopVersion = 0.2.0-rc.2` |
| 安装位置 | `D:\DeepSeek Harness\`（主程序 244 MB；`resources\app.asar` 121 MB） |
| 运行时 | 自带 Node 24.21.0、pnpm 11.7.0、Python 3.12.14（含 numpy/pandas/python-docx/python-pptx/openpyxl/Pillow/lxml/XlsxWriter） |
| CLI 入口 | `D:\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd` |
| CLI 本质 | `ELECTRON_RUN_AS_NODE=1` + `DeepSeek Harness.exe app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js` |
| HOME | `DSH_HOME=C:\Users\LINKIT\.dsh`，其中含 `profiles / sessions / skills / storages / attachments / .agent-presets / llm-deepseek` |
| 配置框架 | **Cordis**（插件树 + YAML patch 层）。`~/.dsh/profiles/<name>/cordis.patch.yml` 是用户叠加层 |
| profile 组成 | `bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]`，另可 `--patch` 追加覆盖 |
| 默认模型（desktop） | `provider: deepseek-account`，`model: deepseek-flash`，`reasoningEffort: max` |
| 当前 Web GUI | `DSH_WEB_URL = http://127.0.0.1:19387`（本地服务，格致可参考其通信方式） |

### 关键发现：profile 是「可编程的」

`dsh --dump-config` 能把整棵插件树打印出来（实测 379 行，已存 `docs\templates\dsh-headless-profile.dump.yml`）。这意味着**格致可以拥有自己的 DSH profile**：

```
格致 profile = dsh-base（底座）
             + 格致自研插件（题库工具 / 组卷 / 费曼评分 / 日历计划 / 教材检索）
             + 格致 MCP server（自有工具以 MCP 形式暴露）
             + 格致模型与提示词覆盖（cordis.patch.yml 里改 system-prompt、默认模型、沙箱策略）
```

> 注意：`desktop` profile 被 Electron 应用独占（实测报错 `profile "desktop" is managed exclusively by the Electron application`），格致不能用它，应新建 `gezhi` profile。`headless` profile 可读、可 dump、可运行。

---

## 三、集成方式（三条路，推荐 A）

### 路线 A：子进程 + NDJSON 事件流（**推荐，已实测跑通**）

```powershell
# 格致主进程调用（cwd = 当前 Vault，沙箱 workspaceRoot 即跟随 cwd）
dsh headless --json "<任务>"
dsh headless --json --session-id session-xxxx "<继续对话>"
echo "<任务>" | dsh headless --json          # 从 stdin 读任务
```

实测：命令 3.1 秒返回，stdout 为纯 NDJSON，stderr 为空，退出码 0。

**事件类型（实测全集，样本存 `docs\templates\dsh-headless-events.sample.ndjson`）**

| 事件 | 字段 | 用途 |
| --- | --- | --- |
| `session` | `sessionId`, `cwd` | 建立/复用会话，前端拿到会话 id 做续聊 |
| `status` | `phase: turn_start / step_start / step_end / turn_end`, `turn`, `step`, `usage{inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens,totalTokens}` | 进度条、token 计量、成本统计 |
| `thinking` | `text`（流式增量） | 「思考中」折叠区（对应 reasoning 内容） |
| `text` | `text`（流式增量） | 打字机效果正文 |
| `final` | `text` | 本轮最终答案，作为消息落库 |

> 这套事件刚好覆盖格致「AI 对话页」需要的全部 UI 状态：会话 → 思考 → 流式正文 → 用量 → 收尾。格致**不需要**解析 DSH 内部协议，只需要消费这 5 类行。

**为什么是 A 而不是别的**：
- 进程隔离：DSH 崩溃不影响格致主界面；格致崩溃也不污染 DSH 会话。
- 复用账号：直接用用户已登录的 DeepSeek 账号额度，格致无需托管 API Key。
- 沙箱对齐：DSH 的 `sandbox-policy.workspaceRoot = process.cwd()`，所以「把 cwd 设成当前 Vault」就等于「AI 只能动这个库」，安全边界天然成立。
- 可断点续聊：`--session-id` 让「同一个学生、同一门课」的长对话跨进程延续。

### 路线 B：常驻 `dsh web` 服务 + HTTP

`dsh web` 会起一个本地服务（当前实例在 `127.0.0.1:19387`，由 `DSH_WEB_URL` 暴露）。格致可把它当后端，通过 HTTP/SSE 通信，省掉每次冷启动。

**实测**：直接 `GET http://127.0.0.1:19387/` 返回 **HTTP 401 未授权**（pid 1476 在监听）。也就是说该端口**不是给第三方应用直接复用的开放 API**，要走通得处理它的鉴权/会话握手。

- 优点：无冷启动、多面板并发请求、事件推送自然。
- 代价：要摸清鉴权与 HTTP 契约（比 NDJSON 复杂得多），且与本 GUI 共用端口需要隔离。
- 适用：等路线 A 跑顺、且确实出现「冷启动太慢」时再评估。

> 这条实测进一步支持路线 A：**子进程 + NDJSON 是不需要鉴权、不依赖内部契约的稳定面**。

### 路线 C：进程内嵌 Cordis 插件

把格致做成一个 DSH 插件包，`dsh plugin --profile gezhi add <本地路径>` 装进去。

- 优点：最深整合，格致的能力直接变成 Agent 的原生工具（无需 MCP 中转）。
- 代价：耦合 DSH 内部 API（rc 版本可能变），调试链路长。
- 适用：**格致专属工具**（组卷、费曼评分、知识图谱查询）最终用这条路做，但放在 P5 之后。

---

## 四、格致能力如何「长」进 DSH

DSH 已内置的扩展点，直接对应格致的功能需求：

| 格致需求 | DSH 现成机制 | 格致要做的 |
| --- | --- | --- |
| AI 能读/写/改库里的文件 | `tool-fs` + `tool-fs-search` + `fs-observation-policy` + 沙箱 | 无需开发，把 cwd 设为 Vault 即可 |
| AI 生成 Word/PDF/Markdown | `office-skills`（SKILL.md + `check_office.py`）+ Python 运行时 + `libreoffice-kit` | 写格致的导出 skill（中文排版、试卷模板），调用已有能力 |
| AI 查教材、引用出处 | `skill` + `tool-skill` + `agent-instructions` | 把教材库检索做成 skill（含 FTS5 查询脚本）；引用强制写在 skill 里 |
| AI 出题、组卷 | 无现成 | 自研：`gezhi-exam` skill + MCP 工具（题库查询、抽题、导出 LaTeX→PDF） |
| 费曼评分 | 无现成 | 自研：`gezhi-feynman` skill（rubric + JSON schema + 诊断流程） |
| 日历与计划分割 | `tool-todo`、`goal`、`goal-round-driver`、`plan-mode` | 自研：日程 MCP 工具（读写 tasks/events/countdowns），复用 todo/goal 的语义 |
| 语音对练 | **`sherpa-onnx-win-x64`（离线 ASR/TTS）** | 自研：录音→DSH→TTS 的语音环；在线走腾讯云 |
| 长任务（"把整本书做完索引"） | `jobs`（本地后台任务）、`subagent`、`workflow` | 自研：索引任务包成 job，进度写库 |
| 联网查资料 | `web` + `web-search-deepseek` + `web-fetch-http` | 直接用（注意 `web-search-deepseek` 需要 `DEEPSEEK_API_KEY` 环境变量） |
| 第三方工具 | `mcp-resources`（MCP client 能力） | 把格致知识库/题库做成 MCP server 挂上 |
| 权限与学生安全 | `approval` + `permission-presets`（read-only / workspace-write / danger-full-access） | 默认锁 `workspace-write`，写库外文件必须审批 |
| 成本控制 | `token-meter`、`session-projection`、`compaction-*` | 读取 usage 事件做「今日 token 用量」面板 |

> 这条映射表的含义：格致的开发工作量，一半以上从「造引擎」变成了「写 skill + 写 MCP 工具 + 做界面」。这是可行性的关键提升。

---

## 五、与 opencode 的关系（不是二选一，而是分工）

- **Agent 内核**：用 DSH（账号、沙箱、会话、语音、Office 都在）。
- **opencode 保留**：用户已装且熟悉，可作为**开发期辅助**（写格致自己的代码时用），以及**参照物**（它的工具集设计、权限提示、TUI 交互值得抄）。
- **不要**在格致里同时塞两套 Agent 循环——两套会话、两套权限、两套计费，维护会失控。

---

## 六、实测命令与原始输出（可复现）

```powershell
# 1) CLI 能力
& "D:\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" --help
& "D:\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" headless --help

# 2) 打印 headless profile 的完整插件树（379 行）
& "D:\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" --profile headless --dump-config

# 3) 跑一次 headless，取 NDJSON 事件
$out = "events.ndjson"
Start-Process -FilePath "D:\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" `
  -ArgumentList @('headless','--json','只回答四个字：格致测试') `
  -WorkingDirectory "D:\Users\LINKIT\Desktop\格致" -NoNewWindow -Wait `
  -RedirectStandardOutput $out -RedirectStandardError "err.txt"
# => exit=0, 3.1s, 8 行 NDJSON
```

**踩坑记录（给实现者）**：
1. 不要用 `& "D:\DeepSeek Harness\DeepSeek Harness.exe" <cli.js 路径>` 直接调——路径含空格会被拆成 `D:\DeepSeek`，报 `Cannot find module`。**必须走 `dsh.cmd` 包装器**。
2. 用 `Start-Process ... -RedirectStandardOutput` 捕获输出；直接在 PowerShell 里用 `1>` 对 Electron 程序不可靠（实测瞬时返回、0 输出）。
3. 从 Node 里 spawn 时不要用 `stdio: 'pipe'` 的 `exec`（受限沙箱下会 EPERM）；用 `spawn` + 直接读 stdout 流，或写临时文件后读。
4. `desktop` profile 不可 dump、不可自定义；新建自己的 profile。
5. `headless` 的默认 provider 是 `deepseek-official`，而 desktop 是 `deepseek-account`；格致 profile 要在 patch 里显式写死 provider/model，避免换机器后行为不一致。

---

## 七、风险与对策

| 风险 | 说明 | 对策 |
| --- | --- | --- |
| DSH 版本漂移 | 当前是 `0.2.0-rc.2`，插件名/事件字段可能变 | 格致只依赖「CLI + NDJSON 五类事件 + profile patch」这三条稳定面；把版本探测做成启动自检，事件解析写宽容模式（未知 type 忽略） |
| 依赖用户已装 DSH | 分发给别人要先装 DSH | 短期：格致定位「本机自用 + 比赛演示」；中期：把 DSH runtime 作为格致的 sidecar 一并分发（体积换独立性） |
| 冷启动 3 秒 | 每次提问起进程 | 会话内复用 `--session-id`；高频交互时升级到常驻 `dsh web`（路线 B） |
| 学生数据外泄 | 提问内容会发往模型 | 默认只发必要片段；提供「纯本地模式」（本地模型/离线检索）开关；录音与得分本地加密 |
| 与 DSH GUI 抢资源 | 用户同时开着 DSH 桌面版 | profile 与 `DSH_HOME` 隔离，或允许在格致设置里指定独立的 DSH_HOME |
| 说不清原创性 | 比赛要求列明 AI 工具使用 | 在研究与产品文档中明确：**DSH 是 MIT 许可的 Agent 引擎（复用），格致自研的是知识库、题库组卷、费曼评分、日历规划、语音对练与整套教学流程** |

---

## 八、给计划的硬结论

1. 智能层技术路线锁定为：**DSH headless 子进程 + NDJSON 事件流 + 自定义 `gezhi` profile**。
2. 格致的自研边界划清为：**知识库与检索、题库与组卷、费曼评分、日历规划、语音对练、五面板界面、数据模型**。
3. 不再把「自研 Agent 循环 / 自研工具沙箱 / 自研会话存储」列入工期。
4. 前作 `opencode.js` 的价值降级为「参考实现」，不再作为主线依赖。
