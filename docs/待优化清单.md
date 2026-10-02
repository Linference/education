# 格致 · 待优化清单（交接文档）

> 用途：把项目交给下一个接手者（人或 AI）时，说明**哪些地方需要改、为什么、怎么验证**。
> 写于 2026-10-02，对应提交 `cbf4023`。
>
> 每一条都标了**证据**（文件路径/实测数据），不是凭印象写的。凡是我没验证过的，会明确写"未验证"。

---

## 0. 怎么跑起来（先看这段）

```bash
# 仓库根
node scripts/verify-all.mjs          # 全量回归（29 个套件）
node scripts/build-installer.mjs     # 打包安装包（约 10~20 分钟）
node scripts/scan-secrets.mjs        # 密钥泄露扫描（提交前钩子会跑）
node scripts/check-licenses.mjs      # 依赖许可门禁
node scripts/progress-audit.mjs      # 阶段进度审计 ← ⚠️ 已失效，见 P0-1
```

开发态启动：`apps/desktop` 下 `npx vite build`，然后
`node_modules/electron/dist/electron.exe . "D:\path\to\vault"`。

**架构一句话**：Electron（主进程 `.cjs` + 渲染进程 React/TS）+ DSH 当 AI 内核 +
SQLite（索引/日历/题库）+ Typst 导出 PDF + LibreOffice 做 Office 高保真查看。

**主进程必须是 CommonJS（`.cjs`）** —— 这是踩过的坑，不要改成 ESM。

---

## P0 · 正确性问题（先修这些，否则别的都不可信）

### P0-1 进度审计脚本已失效，报的"未完成"有一半是假的

`scripts/progress-audit.mjs` 用**具体文件名**判断某项是否实现，而实际实现用的文件名
和设计文档不一样：

| 脚本在找 | 实际文件 | 结果 |
|---|---|---|
| `components/VoicePanel.tsx` | `AvatarConsole.tsx` + `useMicRecorder.ts` | 误报"未接界面" |
| `components/Avatar.tsx` | `AvatarStage.tsx` | 误报"未实现" |
| `components/QuestionBank.tsx` | `BankView.tsx` | 误报"未实现" |
| `packages/paper` | `main/lib/bank.cjs` + `BankView.tsx` | 误报"未实现" |
| `components/Calendar.tsx` | `CalendarPanel.tsx` | 误报"未实现" |
| `index.cjs` 里的 `buildPaper` | `BankView.tsx` 的 `buildPaperMarkdown` | 误报"未实现" |

**影响**：审计输出 `53/64 已具备`，实际约 `59/64`。接手者会被误导去做已经做完的事。

**怎么修**：判定条件不要绑文件名，改成**行为断言** ——
比如"能否导出试卷 PDF"就去跑一次导出看产物，而不是看有没有某个文件。
已有 29 个 `verify-*.mjs` 套件可以直接复用（让审计脚本调用它们）。

---

### P0-2 图谱布局在主线程同步算，节点一多就卡死界面

`apps/desktop/renderer/src/components/GraphView.tsx` 的 `computeLayout()`：

- **300 轮迭代**，每轮做 **O(n²) 两两斥力**
- 全部在 **主线程同步执行**（在一个 `useEffect` 里直接调）
- 节点上限 400（主进程 `indexer.cjs` 的 `maxNodes` 截断）

**实测**：森林库 13 节点无感。但 400 节点时一轮两两就是 ~8 万次计算 ×300 轮
= 2400 万次，主线程会明显卡住（**未实测 400 节点的具体耗时，需要先量**）。

**怎么修**（参照 [obsidian-fast-graph](https://github.com/jkRaccoon/obsidian-fast-graph)）：
1. 布局搬进 **Web Worker**（它明确说"物理跑在 worker 里，重 tick 也不卡界面"）
2. 斥力换 **Barnes-Hut 八叉树**，把 O(n²) 降到 O(n log n)
3. 加 **alpha decay**：收敛后停止迭代，CPU 归零（现在是固定 300 轮就停，这点已经对了）

---

### P0-3 口型公式有两份实现，靠注释约束同步（没有测试保证）

- `packages/voice/src/index.mjs` 的 `buildVisemeTrack()`
- `apps/desktop/renderer/src/components/viseme.ts` 的 `buildVisemeTrackFromTimings()` /
  `buildLocalVisemeTrack()`

两份是**同一条公式**（`open = max(0.25, sin(π × 进度))`），
因为 `packages/voice` 是纯 ESM 且带腾讯云 SDK，渲染进程不引它。

**风险**：改一边忘另一边 → 本地估算和云端真实时间戳驱动出来的口型观感不一致
（同一个字一个快一个慢），而且**没有任何测试会失败**。

**怎么修**（二选一）：
- 抽成共享的纯 JS 模块，两边都引（推荐）
- 或加一个交叉断言测试：同一组 timings 喂给两边，逐帧比对 `open` 值

---

### P0-4 窗口尺寸在高 DPI 下可能不对（未验证，需要真机）

`apps/desktop/main/index.cjs` 的 `createWindow()` 用
`screen.getPrimaryDisplay().workAreaSize` 算窗口大小。本机实测：

```
bounds(DIP)     : {"width":1440,"height":900}
workAreaSize(DIP): {"width":1440,"height":852}
scaleFactor     : 2
size(物理)      : {"width":1440,"height":900}   ← 与 workAreaSize × scaleFactor = 2880 矛盾
```

`workAreaSize` 是 DIP、`size` 是物理像素，两者按 `scaleFactor=2` 换算对不上 ——
说明本机显示器报的参数自相矛盾（可能是远程桌面/虚拟显示的怪值）。

**当前代码**：`width = min(1440, wa.width)` → 1440 DIP。
若 `scaleFactor` 真是 2，那物理宽度是 2880，在 1440 的屏上会**超出一倍**。
用户此前反馈过"右侧栏看不到"（后来又说没问题），**这条始终没有定论**。

**怎么修**：在真机（不同缩放比：100% / 125% / 150% / 200%）上各测一次，
确认窗口不超出屏幕、右侧栏可见。别只看本机。

---

## P1 · 设计文档承诺但还没做的功能

### P1-1 教材采集（P7，工作量最大）

- 数据模型**已有**：`packages/db/schema.sql` 里的 `books` / `chapters` / `pages`
- **缺**：教材 PDF 采集流水线（未实现）、无文本层 PDF 的 OCR（未实现）

**真正的难点不是写代码，是定"内容从哪来"** ——
人教版教材 PDF 的获取方式（正版来源？扫描？授权？）没定之前，
做出来是个空壳。**建议先跟用户确认来源，再动手。**

### P1-2 自动更新

完全没做。electron-builder 有 `electron-updater`，但需要：
- 一个放安装包的地址（GitHub Releases 或自建）
- 版本比对与增量下载逻辑
- 用户提示界面

### P1-3 AI 产出物"一键存为新文件"（P4 标★项）

AI 在对话里生成的 Markdown/PDF，现在只能靠用户手动复制。
设计文档要求能一键存成库里的新文件。

### P1-4 题库的能力缺口

已实现：Markdown 导入、按来源/知识点/难度/题型筛选、组卷 → 下载夹出 PDF。

**缺**：
- 界面里**不能手工新增/编辑单道题**（只能先写 Markdown 再导入）
- 没有**试卷模板**（题量配比、分值分配、答题卡）
- 知识点用 `LIKE '%kp%'` 匹配 JSON 字符串（`main/lib/bank.cjs` 的 `listQuestions`）——
  题目上万后要拆成关联表

### P1-5 语音的两条路没测

`packages/voice` 里有但**从未验证**：
- 腾讯云**异步录音文件识别**（>60 秒的长讲解；现在一句话识别硬上限 60 秒）
- **WebSocket 实时识别**（边说边出字）

费曼讲解台现在靠"分多段录"绕过 60 秒限制（`useMicRecorder.ts` 的 `AUTO_STOP_MS = 55000`），
能用但体验割裂。

---

## P2 · 分发与安全

### P2-1 【最大缺口】DSH 不在安装包里

格致的 AI 由 **DeepSeek Harness** 驱动，而**安装包不含它**
（`apps/desktop/main/settings-ipc.cjs` 的 `settings:dshStatus` 会去探测系统装的 DSH）。

**后果**：别人装了格致，如果没装 DSH，**AI 完全是空的**。
界面已经在设置页说明了这件事（做了兜底），但分发上这是个硬缺口。

**可选方向**：随包内置 DSH / 首次启动引导安装 / 明确写进安装说明。

### P2-2 没有代码签名

安装时 Windows 报「未知发布者」。要消除需买证书（一年几百到几千元）。
`build-installer.mjs` 里已关掉签名探测（没有证书时探测会卡住）。

### P2-3 安装包 405 MB

主要是内置 LibreOffice（1014 MB / 9113 文件，压缩后约 200 MB）。
可出**精简版**（约 150 MB），代价是 PPT/PPTX 只能看文字、看不到版式。

### P2-4 凭据：主密码模式没有解锁 UI

`packages/core/src/credentials.mjs` 支持两种模式：
- **DPAPI**（默认）：Windows 账户绑定，开机即用 —— 现在走这条
- **passphrase**：scrypt + AES-256-GCM，主密码不落盘 —— 更强，但**没有解锁界面**

设置页能首次设置主密码，但重启后**没有地方输入主密码解锁**，等于该模式暂时不可用。
`settings:credStatus` 遇到 passphrase 模式会返回 `locked: true`，界面只是显示一句提示。

### P2-5 ⚠️ 腾讯云密钥曾在对话里明文出现过

2026-10-01 用户把 SecretId / SecretKey 直接发在对话里。
已在 `%APPDATA%\gezhi\credentials.enc` 存好并验证可用，
但**建议去腾讯云控制台轮换一次**。轮换后重新在设置页填即可。

---

## P3 · 性能与规模

| 位置 | 现状 | 什么时候会出问题 |
|---|---|---|
| `main/indexer.cjs` | 全量重建索引，没有增量 | 库大了每次打开都全扫 |
| `main/lib/xlsx.cjs` | 整文件读进内存 | 大表吃内存（已限 20000 行 × 200 列回传） |
| `components/PdfViewer.tsx` | 整份 PDF 加载 | 几百页的 PDF |
| `components/GraphView.tsx` | 节点上限 400，超出截断并提示 | 大库只能看局部 |
| `main/lib/bank.cjs` | 知识点用 LIKE 匹配 JSON | 题目上万 |

---

## P4 · 测试质量

- **29 个 `verify-*.mjs`**，其中 **43 处用了固定 `waitForTimeout(≥1000)`** ——
  这是**偶发失败的主要来源**。我这几轮至少修了 5 处这类假失败
  （冷启动比首次启动慢、异步载入没等够）。
  **建议**：全部换成"显式等待某个条件成立"，别等固定时间。
- `scripts/verify-all.mjs` 会**连开 20+ 个真实窗口**（每个界面测试启一次 Electron），
  用户用电脑时会被不断弹窗打断。建议加 `--headless` 或串行复用同一个实例。
- **没有"打包后应用"的端到端测试** —— 只测了开发态。
  `verify-packaged.mjs` 存在但不在 `verify-all.mjs` 里。
- `verify-settings.mjs` **会写并清空凭据库**。已加"先备份真凭据、结束恢复"，
  更稳的做法是给它一个独立的存储目录（用环境变量覆盖 `appDataDir()`）。

---

## P5 · 代码质量

- `apps/desktop/renderer/src/App.tsx` **1732 行** —— 该拆（布局 / 工具栏 / 标签页 / 右键菜单）
- `components/GraphView.tsx` 540 行 —— 布局算法可以单独抽文件（将来要搬 Worker）
- 有些注释与现状不符（历史遗留），改动时顺手清理
- **缺一份给接手者的架构总览**：现在只有 `格致-开发计划.md`（71 KB，是规划不是现状）
  和 7 篇 `docs/*.md` 实测笔记。新人上手要读很久。

---

## 附：不是 bug，是现实约束（别去"修"）

1. **`.doc` / `.ppt`（97-2003 二进制）没有纯 JS 渲染库** ——
   连 VS Code 的 Office Viewer 插件都不支持。
   现在的做法：`.doc` 提取文字、`.ppt` 走 LibreOffice 转 PDF。
2. **CSV / XLSX 不转 PDF**（用户明确要求）—— 表格要的是能看数据，不是静态图。
   只有幻灯片转 PDF（版式复杂，PDF 才对）。
3. **产出物不得出现"格致"**（产品硬规矩）—— 试卷、PDF、Word 都不能带产品署名。
4. **不拆理科/文科**（产品硬规矩）。
5. **知识点要详细**（产品硬规矩）。
6. **格式由用户选**（PDF / Word / Markdown，产品硬规矩）。
7. **中文全文检索必须用 `tokenize='trigram'`** —— `unicode61` 查中文恒为 0 条（实测过）。
8. **Typst 不要用 Noto SC 可变字体**（会崩），用 DengXian / Microsoft YaHei。
9. **PDF 生成不要用 `--print-to-pdf-no-header`**（当前 Chrome 无效），
   改用 CSS `@page { margin: 0 }` + body padding。
10. **LibreOffice 裁剪时 `share/config` 不能删** —— 删了转换会**静默失败**
    （报 "source file could not be loaded" 但退出码是 0）。
