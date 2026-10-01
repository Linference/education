# 格致

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

## 下一步

P0 已完成。P1 = 知识库与编辑器（Electron 壳 + 文件树 + 标签页 + CodeMirror 6 + Live Preview）。

进度与验收标准见 [格致-开发计划.md](格致-开发计划.md) §5。
