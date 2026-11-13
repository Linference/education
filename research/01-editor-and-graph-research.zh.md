# 格致 · Markdown 编辑器内核 + 文件关系图谱 + Vault 数据模型 技术选型调研

> 调研目标：为 Windows 桌面端学习应用「格致」（Electron + React 19 + TypeScript）确定
> 1) Markdown 编辑器内核、2) 文件关系图谱（graph view）、3) Vault 数据模型。
>
> 状态标记约定：
> - **【事实】** 已通过 GitHub API / 官方文档 / 仓库源码核实
> - **【推断】** 基于事实的合理推断，未经直接验证
> - **【未验证】** 未能核实，需要后续 PoC 确认

---

## 目录

1. [Markdown 编辑器内核对比](#1-markdown-编辑器内核对比)
2. [Markdown 解析生态](#2-markdown-解析生态)
3. [图谱可视化库对比](#3-图谱可视化库对比)
4. [Obsidian 交互拆解（可借鉴项）](#4-obsidian-交互拆解可借鉴项)
5. [Vault 数据模型](#5-vault-数据模型)
6. [可参考的开源项目](#6-可参考的开源项目)
7. [一句话建议](#7-一句话建议)

---

## 0. 调研方法与数据来源说明

- **Star 数 / License 核实方式**：【事实】通过 GitHub REST API（`api.github.com/repos/<owner>/<repo>`、`/search/repositories`）与 GitHub 仓库页面 HTML（`"stargazerCount"` 字段）两条路径交叉核实，取数时间 **2026-10-01**。
- **版本 / 发版时间核实方式**：【事实】通过 npm registry（`https://registry.npmjs.org/<pkg>`）的 `dist-tags.latest` 与 `time` 字段核实。
- **Obsidian 行为核实方式**：【事实】优先引用官方帮助文档仓库 [`obsidianmd/obsidian-help`](https://github.com/obsidianmd/obsidian-help) 的 Markdown 源文件（`raw.githubusercontent.com`），官方文档站镜像见 [mintlify.wiki/obsidianmd/obsidian-help](https://mintlify.wiki/obsidianmd/obsidian-help/files/how-obsidian-stores-data)。
- **IME 问题核实方式**：【事实】通过 GitHub Search API（`/search/issues`）按 `IME` / `composition` / `中文` / `输入法` 等关键词逐仓库检索，记录 issue 编号、状态与 URL。
- **【推断】** 表示基于上述事实的合理推断，未做直接实验。
- **【未验证】** 表示本次调研未能核实，需 PoC 确认。

> **重要限制（先说结论可信度的边界）**：本次调研**没有做任何实测性能基准**。所有"几千节点是否流畅"的判断来自库的渲染后端（WebGL vs Canvas vs SVG）、官方设计目标、以及社区 issue 记录，属于**【推断】**，不是实测数据。落地前必须自建基准（见 [§3.7](#37-落地前必须自测的基准)）。

---

## 1. Markdown 编辑器内核对比

### 1.1 总览表

| 维度 | **CodeMirror 6** | **Monaco Editor** | **TipTap v3** | **Milkdown** | **Vditor** | **Lexical** |
|---|---|---|---|---|---|---|
| 仓库 | [codemirror/dev](https://github.com/codemirror/dev) | [microsoft/monaco-editor](https://github.com/microsoft/monaco-editor) | [ueberdosis/tiptap](https://github.com/ueberdosis/tiptap) | [Milkdown/milkdown](https://github.com/Milkdown/milkdown) | [Vanessa219/vditor](https://github.com/Vanessa219/vditor) | [facebook/lexical](https://github.com/facebook/lexical) |
| License | MIT（`@codemirror/*` 全部 MIT） | MIT | MIT（核心）；平台服务另售 | MIT | MIT | MIT |
| Stars（2026-10-01） | **7,815**（`codemirror/dev`，含 issues） | **46,828** | **38,604** | **11,970** | **11,355** | **23,917** |
| 架构本质 | 文本编辑器 + 增量语法树（Lezer） | 文本编辑器 + 完整 IDE 语言服务 | ProseMirror 富文本（schema 文档模型） | ProseMirror 富文本（ProseMirror + Remark 混合） | 自研：textarea/div + 三种渲染模式 | 自研富文本（独立 Node 模型） |
| WYSIWYG | ✗ 需靠 Decoration 自建 Live Preview | ✗ 需靠 Decoration 自建 | ✓ 原生所见即所得 | ✓ 原生，且保留 Markdown 为真源 | ✓ **IR 即时渲染模式**（Vditor 独有） | ✓ 原生所见即所得 |
| KaTeX / MathJax | 靠 `@codemirror/language` + 自绘 Widget（生态有现成方案） | 内置 Markdown 语言支持较弱，需插件（社区 `monaco-katex` 等）【未验证质量】 | 社区/官方扩展 | 官方 `@milkdown/plugin-math`（Remark math） | 内置（`preview.math` 配置项） | 需自建 DecoratorNode |
| 代码高亮 | **Lezer** 增量高亮（本身就是高亮引擎，最贴合） | Monarch / TextMate（VSCode 同源，最强） | 需接 Shiki / lowlight（异步，与 PM 事务模型有摩擦） | 接 Shiki / Prism | 内置 Prism | 需自建 CodeNode + 高亮 |
| `[[wikilink]]` 扩展难度 | **中**（`ViewPlugin` + `Decoration.mark` + `atomicRanges`） | **中**（同 CM6，但 Decoration API 更笨重） | **低-中**（自定义 Mark + `InputRule` + `Suggestion` 插件） | **低**（ProseMirror 体系同上，且已有社区 wikilink 实现） | **低**（有内置 hint / 自定义渲染入口） | **中-高**（需自定义 `TextNode` 子类 + `TypeaheadMenuPlugin`，选区/原子化要自己兜） |
| 中文 IME 已知问题 | 见 [§1.2](#12-中文-ime-已知问题核实结果)，**历史 issue 多但均已修复**，是目前跟踪最勤的 | 见 §1.2，**仍有 open issue** | 见 §1.2，**open issue 最多**（表格、标题、颜色标记场景重复字符） | issue 少（因其建立在 ProseMirror 之上，继承 PM 的修复） | 中文社区项目，IME 体验是其重点，open issue 少 | 见 §1.2，IME 相关 PR 活跃 |
| 维护活跃度 | 极活跃（`@codemirror/view` 6.43.13 @ 2026-09-22） | 活跃（monaco-editor 0.57.0 @ 2026-09-24） | 极活跃（@tiptap/core 3.31.4 @ 2026-09-30） | 活跃（@milkdown/core 7.22.2 @ 2026-09-23） | 中（vditor 4.0.0 @ 2026-08-30；主作者单人） | 极活跃（lexical 0.52.0 @ 2026-09-28） |
| 对"格致"的关键风险 | 无内置所见即所得，Live Preview 要自己写（Obsidian 走的就是这条路） | 体积大、为代码而生的交互习惯不适合笔记；移动端/IME 历史坑多 | 文档模型是 ProseMirror 而非 Markdown，**往返序列化保真度**要长期投入；商业条款要读清 | 生态比 TipTap 小，版本迭代快（v7 系），中文资料少 | 主作者单人维护、v4 刚发布（API 变动风险）、非 React 原生（需命令式包装） | 生态偏"社交编辑器"，Markdown 往返与数学公式支持最弱 |

### 1.2 中文 IME 已知问题（核实结果）

这一节是**选型的决定性因素**，因此逐条列出实际检索到的 issue。

**CodeMirror 6**（仓库 [`codemirror/dev`](https://github.com/codemirror/dev)，共检索到 32 条 IME 相关 issue，**全部为 closed**）

| Issue | 标题 | 状态 |
|---|---|---|
| [#1688](https://github.com/codemirror/dev/issues/1688) | Text visually disappears after IME composition inside brackets on Chrome | closed |
| [#1687](https://github.com/codemirror/dev/issues/1687) | First-keystroke console error with bracketMatching when using non-English IME | closed |
| [#1684](https://github.com/codemirror/dev/issues/1684) | Chinese IME composition deletes preceding text in code cells on Google Chrome | closed |
| [#1654](https://github.com/codemirror/dev/issues/1654) | IME composition problem in decoration | closed |
| [#1650](https://github.com/codemirror/dev/issues/1650) | IME composition at the boundary of syntax highlight nodes garbles the content | closed |
| [#1472](https://github.com/codemirror/dev/issues/1472) | Adding characters before the cursor while composing with IME results in offset of characters from IME | closed |
| [#1396](https://github.com/codemirror/dev/issues/1396) | codemirror/view 6.28.2 version will cause abnormal input of Chinese input method | closed |
| [#1409](https://github.com/codemirror/dev/issues/1409) | Mac OS native chinese IME, prompt pos not right | closed |
| [#1128](https://github.com/codemirror/dev/issues/1128) | Pinyin composition glitch in snippet highlight between matched brackets | closed |

**当前仍 open 的 composition 相关 issue 只有 2 条，且都不是中文桌面场景**：【事实】
- [#1403](https://github.com/codemirror/dev/issues/1403) Samsung/移动 Safari 韩文回车重复换行
- [#467](https://github.com/codemirror/dev/issues/467) Android (Boox) 自动更正追加而非替换

**CHANGELOG 侧的持续投入**【事实】——`@codemirror/view` 的 `CHANGELOG.md` 中，2026 年仍在修 composition 相关问题，说明这不是"修完就放"的领域：
- 6.39.16（2026-03-02）：*Fix an issue where changing decorations right before a composition could end up corrupting the visible DOM.*
- 6.39.15（2026-02-20）：*Fix a bug that broke composition inside of block wrappers.*
- 6.39.10 / 6.39.9（2026-01）：多处 "composition next to a widget could get needlessly interrupted"

> **【推断】结论**：CodeMirror 6 的 IME 问题**不是"没有"，而是"被修得最勤"**。上表里最要命的几条（#1650 语法高亮节点边界的组合输入乱码、#1654 decoration 下的 IME、#1688 括号内组合输入文字消失）恰好都是 **Live Preview 场景的核心路径**，且均已 closed。对一个要自建 Live Preview 的 Obsidian-like 应用，这是最强的正向信号——同时也说明**这些坑真实存在，你必须用当前版本并跟踪 CHANGELOG**。

**Monaco**（仓库 [`microsoft/monaco-editor`](https://github.com/microsoft/monaco-editor)，15 条 IME 标题 issue，**多条仍 open**）

| Issue | 标题 | 状态 |
|---|---|---|
| [#3549](https://github.com/microsoft/monaco-editor/issues/3549) | [Bug] Japanese IME issue when using wordWrap | **open** |
| [#2199](https://github.com/microsoft/monaco-editor/issues/2199) | Chinese IME does not work correctly with CompletionItemProvider | **open** |
| [#4805](https://github.com/microsoft/monaco-editor/issues/4805) | [Bug] Decorations Not Updating when using an IME to input on windows | **open** |
| [#1410](https://github.com/microsoft/monaco-editor/issues/1410) | Can't overwrite selected text on Microsoft Edge with Chinese IME | closed |
| [#1634](https://github.com/microsoft/monaco-editor/issues/1634) | First time typing to overwrite selected text with Chinese IME on Edge actually does nothing | closed |
| [#136](https://github.com/microsoft/monaco-editor/issues/136) | Sogou IME does not work in Edge/IE | closed |

> **#2199 与 #4805 直接命中我们要做的事**：用 IME 时补全项（正是 `[[` 自动补全要用的机制）工作不正常、以及 IME 输入时 Decoration 不刷新（正是 Live Preview 要用的机制）。**这两条都还 open。**【事实】

**TipTap / ProseMirror**（IME 标题 issue 数量最多）

TipTap（24 条）**仍 open 的**：
- [#7414](https://github.com/ueberdosis/tiptap/issues/7414) 组合输入过程中文本选区不被替换
- [#7271](https://github.com/ueberdosis/tiptap/issues/7271) **在 Heading 元素中用中文 IME 输入出现重复文本（WebKit）**
- [#7186](https://github.com/ueberdosis/tiptap/issues/7186) Safari 下表格单元格 IME 输入只留下生拼音（如 "nihao"）
- [#7135](https://github.com/ueberdosis/tiptap/issues/7135) 行内可编辑节点 + IME 有 bug
- [#8189](https://github.com/ueberdosis/tiptap/pull/8189) fix(extension-floating-menu): 组合输入结束后重新求值菜单（open PR）
- [#7899](https://github.com/ueberdosis/tiptap/pull/7899) fix: 防止彩色文本 IME 组合期间光标跳动（open PR）

ProseMirror 上游（22 条）**仍 open**：
- [#1564](https://github.com/ProseMirror/prosemirror/issues/1564) Chrome 中文 IME 退格产生意外 `<br>` 节点
- 已 closed 但很说明问题的：[#1453](https://github.com/ProseMirror/prosemirror/issues/1453)（行首中文 IME 首字符重复）、[#1450](https://github.com/ProseMirror/prosemirror/issues/1450)（切换到粗体时首字符重复）、[#1484](https://github.com/ProseMirror/prosemirror/issues/1484)（Chrome 更新后韩文 IME 失效）

Milkdown（1 条 IME 标题 issue）：[#1403](https://github.com/Milkdown/milkdown/pull/1403) 用 `prosemirror-safari-ime-span` 替换了自研的表格零宽空格插件（closed）；另有 [#1542](https://github.com/Milkdown/milkdown/issues/1542) *[Bug] Chinese input, wrong cursor position*（closed）。

**Vditor**：`IME in:title` 命中 **0 条**；中文标题 issue 中与输入相关的是 [#1533](https://github.com/Vanessa219/vditor/issues/1533)（移动端回车换行后粘贴或中文输入不被记录，**open**）与 [#1622](https://github.com/Vanessa219/vditor/issues/1622)（即时渲染模式下首行标题全选后中文输入崩溃，closed）。【事实】就"中文 IME 专项问题少"这一点，Vditor 表现最好——但这也可能只是**用户基数与 issue 报告习惯**的差异，不能直接等同于体验更好。【推断】

**Lexical**（36 条 IME 标题 issue，PR 非常活跃）：**仍 open** 的 [#8834](https://github.com/facebook/lexical/issues/8834)（鼠标点击强制提交 IME 组合会把视口滚回组合文本处）、[#8835](https://github.com/facebook/lexical/pull/8835)。已修复的包括 [#6296](https://github.com/facebook/lexical/issues/6296)（中文输入破坏 mention 实体并重复字符）、[#1898](https://github.com/facebook/lexical/issues/1898)（Safari 中文 IME 光标位置错误）、[#1695](https://github.com/facebook/lexical/issues/1695)、[#4547](https://github.com/facebook/lexical/issues/4547)。另有 [#8679](https://github.com/facebook/lexical/issues/8679)（Firefox 韩文 IME 激活时 Markdown 快捷输入不触发）——**这条对"Markdown 输入快捷方式"是直接打击**。【事实】

**Electron 层还有一个必须知道的坑（与内核无关，但会污染归因）**：WebView2 在 Chromium 149.0.4022.69 上出现过"丢掉第一个 CJK IME 字符 + 中文标点重复"的问题，见 [MicrosoftEdge/WebView2Feedback#5625](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5625)。**Electron 用的是 Chromium 而非 WebView2**，所以严格说这条不直接适用；但只要在 Windows 上做中文输入，就必须把"内核 bug"与"Chromium/系统输入法/TSF 层 bug"分开定位，否则会误判内核。【推断】

### 1.3 各候选的实现路径要点（不写代码，只讲机制）

- **CodeMirror 6**：Live Preview 的正统做法是 `ViewPlugin` 产出 `DecorationSet`：用 `Decoration.replace({})` 隐藏 `**`/`[[`/`]]` 等标记，用 `Decoration.mark` 加样式，用 `atomicRanges` 让光标跳过被隐藏的标记，用 `EditorView.atomicRanges` + `EditorState.readOnly` 之外的 `StateField` 区分"光标在语法内/外"。KaTeX 用 `WidgetType` 渲染（`Decoration.replace` 换成公式块）。**难点不在渲染，在选区语义与 IME 组合期的 decoration 稳定性**——上表 #1650/#1654/#1688 全是这个主题。
- **Monaco**：Decoration API 是 `deltaDecorations` 风格的区间集合，配合 `IModelDecorationOptions.inlineClassName` 做隐藏/样式。理论上可做 Live Preview，但 Monaco 的定位是代码编辑器（行号、折叠、minimap、建议框），要逐一关掉并重写交互；`CompletionItemProvider` 的 IME 交互有 open bug（#2199）。
- **TipTap**：`Mark`/`Node` 扩展 + `InputRule`（`[[` 触发）+ `Suggestion`（`@tiptap/suggestion`，自带 React 渲染入口）。**这是做 wikilink 最省力的路径**。代价是文档模型是 ProseMirror 的，需要在 Markdown ↔ PM JSON 之间做双向序列化，而 `[[x]]`、`==高亮==`、`![[嵌入]]` 都是非标准语法，序列化插件要自己维护。
- **Milkdown**：ProseMirror 做文档模型、Remark 做 Markdown 解析/序列化（**这是它相对 TipTap 的核心差异**），`@milkdown/plugin-math` 等官方插件齐全。对"Markdown 必须是唯一真源"的项目，模型契合度最高。
- **Vditor**：三种模式 `wysiwyg` / `ir`（即时渲染）/ `sv`（分屏预览），`ir` 模式是它的招牌，也是**与 Obsidian Live Preview 最接近的开箱方案**。扩展依靠 `options.preview`、`hint`、`toolbar` 等回调，深度定制受框架约束。
- **Lexical**：一切靠自定义 Node（`TextNode` 子类）+ `DecoratorNode` + `TypeaheadMenuPlugin`。灵活度最高，但要自己实现的"轮子"也最多；Markdown 往返是弱项。

### 1.4 推荐 / 备选 / 理由

**✅ 推荐（主选）：CodeMirror 6**

理由，按权重排序：
1. **Live Preview 是"格致"的核心体验，而 CM6 是唯一有大规模生产验证的 Live Preview 基座**——Obsidian 自己就是这条路【推断，基于 Obsidian 编辑器表现出 CM6 的 Decoration/语法隐藏行为；Obsidian 未公开确认，**未验证**】。我们不是在做实验，是在复刻一条已被验证的路径。
2. **IME 问题被修得最勤、且当前 open 的 composition issue 不在中文桌面场景**（§1.2）。对中文用户产品，这是第一优先级。
3. **编辑与高亮同源**：Lezer 增量语法树同时供给高亮、折叠、缩进、以及我们自己的 wikilink 识别，不需要再引一套 highlighter，也不会有"高亮器与文档模型不同步"的问题。
4. **纯文本为真源，零往返损耗**：文档就是 `.md` 字符串，没有 PM JSON ↔ Markdown 的保真度战争。对"用户的文件必须能被别的工具打开"这个产品承诺，这是结构性优势。
5. License 干净（MIT），依赖树小而稳（`@codemirror/state` / `view` / `language` 均为 MIT，2026-09 仍在发版）。

**要接受的代价**：Live Preview 的 decoration 逻辑、wikilink 的原子化与自动补全、表格的所见即所得编辑，**全部要自己写**。这是 2–4 人月的实打实工作量，必须计入排期，不能当成"选个库就有了"。【推断】

**🔄 备选 A：Milkdown（要"开箱所见即所得 + Markdown 真源"时切它）**

当出现以下任一情况时切换：CM6 的 Live Preview 工作量评估超出预算 / 需要在编辑器里做块级拖拽与斜杠菜单（`@milkdown/crepe` 已内置）。它的 ProseMirror + Remark 组合是"Markdown 为真源 + 富文本编辑"里最正统的工程答案，MIT，v7 迭代活跃。

**🔄 备选 B：Vditor（要最快看到中文可用的 demo 时用它做原型）**

`ir` 模式开箱即得接近 Obsidian Live Preview 的效果，中文社区背景，IME 专项 issue 少。**但不要把它作为长期内核**：主作者单人维护（bus factor 风险）、v4 刚发（API 变动）、非 React 原生需要命令式包装。**建议用法：第 1 周用它做一个可点击的交互原型，用来和产品对齐 Live Preview 的手感，然后丢掉它、用 CM6 实现。**【推断】

**❌ 不建议**
- **Monaco**：为代码而生的交互模型（行号、minimap、建议框）与笔记场景对抗，且 #2199/#4805 两个 open bug 正好卡在我们要用的补全与 decoration 上。体积也是最大的一档。
- **TipTap**：技术上是好选择，但**中文 IME 的 open issue 集中在标题、表格、浮动菜单**——恰好都是笔记的高频场景（#7271 标题重复字符尤其致命）。加上 Markdown 往返保真度的长期成本，以及平台版定价（Start $49/月起）需要在选型文档里明确"我们只用 MIT 核心、不用云文档"的边界。
- **Lexical**：Markdown 是它最弱的一环（#8679 韩文 IME 下 Markdown 快捷键不触发，直接与"输入 `#` 变标题"冲突），且要自建的轮子最多。

### 1.5 提交前的 PoC 清单（必做）

1. **中文 IME × Live Preview decoration 压测**：在 CM6 中实现最小 Live Preview（隐藏 `**`、渲染行内 KaTeX、识别 `[[wikilink]]` 并原子化），用微软拼音 / 搜狗 / 微信输入法分别测试：行首输入、括号内输入（复现 #1688 场景）、高亮节点边界输入（复现 #1650 场景）、组合态中途用方向键移动光标、组合态中途鼠标点击、组合态中途按 Esc 取消。**通过标准：零字符丢失、零重复、光标不跳。** 用当前 `@codemirror/view` 6.43.x 而非任何旧版本。
2. **`[[` 自动补全与 IME 共存**：验证"用户正在打拼音时 `[[` 补全弹窗的行为"——弹窗是否该在 `compositionstart` 时抑制、`compositionend` 后恢复。这是 CM6 与 Monaco 差异最大、也最容易被漏掉的一环。
3. **10 万字单文件 + 2000 文件 vault 的输入延迟**：测 P95 按键到上屏延迟与 decoration 重算耗时。CM6 的 Lezer 是增量的，但**你自己写的 ViewPlugin 未必是**——这是最常见的性能翻车点。

---

## 2. Markdown 解析生态

### 2.1 四者的本质差异

这一节的判断标准不是"哪个解析器更好"，而是**"哪个解析器能同时服务三种消费者"**：编辑器的每次按键高亮、后台的全库链接索引、阅读模式的静态渲染。这三者的需求互相冲突（延迟敏感 vs 吞吐敏感 vs 保真敏感），选型结论会因此变成一个**组合方案**而非单选。

| 维度 | **remark / unified** | **markdown-it** | **micromark** | **Lezer (`@lezer/markdown`)** |
|---|---|---|---|---|
| 仓库 | [remarkjs/remark](https://github.com/remarkjs/remark) / [unifiedjs/unified](https://github.com/unifiedjs/unified) | [markdown-it/markdown-it](https://github.com/markdown-it/markdown-it) | [micromark/micromark](https://github.com/micromark/micromark) | [lezer-parser/markdown](https://github.com/lezer-parser/markdown) |
| License | MIT | MIT | MIT | MIT |
| Stars | **9,010** / **5,037** | **21,950** | **2,230** | 未单独统计（`lezer-parser/lezer` 主仓已归档，代码迁至 [code.haverbeke.berlin/lezer](https://code.haverbeke.berlin/lezer/markdown)） |
| npm / 版本 | `remark` 15.0.1（2023-09-18）；`mdast-util-from-markdown` 2.0.3（**2026-02-21**）；`unified` 11.0.5（2024-06-19） | `markdown-it` 15.0.2（**2026-09-11**） | `micromark` 4.0.3（**2026-09-26**）；`mdast-util-from-markdown` 2.0.3（2026-02-21） | `@lezer/markdown` 1.7.2（**2026-07-15**） |
| 数据模型 | mdast（结构化 AST，节点即对象） | Token 流（扁平 token 数组 + `Token.stream`） | 具体 token 事件流（状态机，"每个字节都有归属"） | Lezer 紧凑语法树（不可变、可切片复用） |
| **增量解析** | ✗ 每次全文重解析（缓存只能靠插件自己维护） | ✗ 全文重解析 | ✗ 全文重解析 | **✓ 原生增量**：消费旧树片段（fragments）重建，这是设计目标 |
| 位置信息（source map） | ✓ 每个节点带 `position.{start,end}.{line,column,offset}` | ✓ `token.map`（行号区间）+ 行内 offset | ✓ **最强**：token 级 `start`/`end` 偏移，官方卖点 "with positional info and concrete tokens" | ✓ 节点 `from`/`to` 文档偏移 |
| 扩展新语法 | 写 remark 插件遍历 mdast（或写 micromark 语法扩展再升级到 mdast） | `md.inline.ruler.before()` / `md.block.ruler.before()` 注册规则（**最直接**） | 写 `SyntaxExtension`（state machine 级别，**学习曲线最陡**） | 实现 `MarkdownConfig` 的 `parseInline` / `parseBlock` / `defineNodes`（**中等**） |
| 生态充裕度 | 最丰富：GFM / math / frontmatter / MDX / directives / 表格 / 脚注一应俱全 | 丰富：社区插件多，但质量参差、部分停更 | 官方覆盖 GFM 100% + MDX + frontmatter + math + directives | 官方带 GFM（Table/TaskList/Strikethrough/Autolink）+ Subscript/Superscript/Emoji |
| 体积 | 中等（unified 管线 + 一堆小包） | 小 | **最小**（官方称 ±14kb，最小 CommonMark 解析器） | 小（CM6 生态内已随编辑器加载，边际成本≈0） |
| 能否输出 HTML | 不直接——unified 管线的 `remark-rehype` + `rehype-stringify` 负责 | ✓ 原生渲染 HTML | ✓ 原生（token → HTML），也能转 mdast 供别人消费 | **✗ 只解析不渲染**（官方 README 明确：不帮忙输出 HTML） |

### 2.2 关键事实与坑

1. **Lezer 是唯一"为按键级编辑而生"的解析器。**【事实】`@lezer/markdown` 的 README 原文：*"This is an incremental Markdown parser ... it produces Lezer-style compact syntax trees and consumes fragments of such trees for its incremental parsing."* 并且明确 *"It does not in fact use the Lezer runtime (that runs LR parsers, and Markdown can't really be parsed that way)"* —— 这句很重要：**Markdown 用 LR 解析在原理上不成立，所以 Lezer 的 Markdown 解析器是特化的**，不要指望"Lezer 家族的通用能力"。

2. **Lezer Markdown 有明确的保真度妥协。**【事实】同一 README：*"in order to be single-pass and incremental, it doesn't do some things that a conforming CommonMark parser is expected to do—specifically, it doesn't validate link references, so it'll parse `[a][b]` and similar as a link, even if no `[b]` reference is declared."*
   → **这直接决定了架构分工**：Lezer 用于**编辑器内的高亮/装饰**（它对"引用式链接是否真的存在"不敏感，用户看不出来），而**链接图的解析绝不能依赖 Lezer**，否则不存在的引用会被当成真链接写进索引。

3. **wikilink 的现成轮子全部停滞。**【事实】npm 核实结果：
   - `remark-wiki-link` 2.0.1（**2023-10-10**）、`mdast-util-wiki-link` 0.1.2（2023-10-09）
   - `markdown-it-wikilinks` 1.4.0（**2023-08-12**）
   - `micromark-extension-wiki-link` 0.0.4（**2021-01-21**）
   - `markdown-it-obsidian` 1.1.0（**2021-07-13**，ISC）
   - `@portaljs/remark-wiki-link` 1.2.0（2024-04-17）—— 相对最新，且明确目标是 Obsidian 风格链接

   → **【推断】结论：不要指望"引入一个包就支持 wikilink"。**这些包平均 2–5 年未更新，且大多只做"解析成 `a` 标签"，不支持 `![[嵌入]]`、`[[目标|别名#标题^块ID]]` 的完整语法、不支持未解析链接（unresolved link）的区分。**必须自己写插件**，但这反而是好事：wikilink 的语义（别名、嵌入、块引用、未解析态）本身就是你的产品逻辑，外包出去迟早要重写。

4. **remark 主仓"稳定"不等于"停更"。**【事实】`remark` 15.0.1 停在 2023-09-18，但 `mdast-util-from-markdown` 在 2026-02-21 还在发版，`remark-gfm` 在 2025-02-10 发版。生态是**成熟稳定**而非**废弃**——底层 mdast/micromark 仍在维护。【推断】这是好事（API 不会乱动），但也意味着遇到问题别指望主仓快速响应。

5. **micromark 是 remark 的引擎，不是竞品。**【事实】micromark 是状态机 + 具体 token，`mdast-util-from-markdown` 把它转成 mdast。所以"选 remark"≈"选 micromark + 一层 AST 包装"。反过来，**只用 micromark 不升 AST** 适合"只要位置信息、不要结构化遍历"的场景（比如做语法检查/装饰）。

6. **markdown-it 的扩展成本最低。**【事实】它的 ruler 机制（`inline.ruler.before('link', 'wikilink', fn)`）让"加一条行内语法"变成十行代码，这也是为什么大量 Obsidian-like 的 Web 项目用它。代价是 token 流模型对**结构化查询不友好**（要自己从扁平 token 里重建树），而链接图索引需要的是"这篇笔记引用了哪些目标"这种结构化查询。

### 2.3 推荐：**双解析器分工**（不是二选一）

**✅ 编辑路径 —— `@lezer/markdown` + `@codemirror/lang-markdown`**
- 理由：唯一增量解析器；CM6 原生集成，零额外依赖；自带 GFM（Table/TaskList/Strikethrough/Autolink）；`MarkdownConfig` 的 `parseInline` 足以注册一个 `WikiLink` 节点用于高亮与原子化。
- 版本：`@lezer/markdown` 1.7.2 / `@codemirror/lang-markdown` 6.5.2（2026-08-04），MIT。
- **注意**：只用于"看"，不用于"信"（理由见 §2.2 第 2 点）。

**✅ 索引路径（构建链接图）—— `micromark` + `mdast-util-from-markdown`（即 remark 家族底层）+ 自写 wikilink 扩展**
- 理由：
  1. **位置信息最强**（token 级偏移），"点击反链跳转到原文第几行第几列"这件事依赖它。
  2. CommonMark 合规性经 ±2k 测试与模糊测试验证，不会像 Lezer 那样放过未声明的引用。**索引必须准确**，一个假链接会让图谱多一条幽灵边，用户会立刻不信任图谱。
  3. micromark 维护最活跃（4.0.3 @ 2026-09-26）。
  4. 你可以**只解析一次、缓存结果**（按文件内容 hash），所以"非增量"在这里不是性能问题——索引是后台批处理，用户感知不到。
- 具体做法【推断，需 PoC】：先剥离 YAML frontmatter（用 `micromark-extension-frontmatter` 或简单前置扫描），再用 `micromark` + 自写 `SyntaxExtension` 识别 `[[...]]` / `![[...]]` / `#tag` / `^block-id` / `==highlight==`，用 `mdast-util-from-markdown` 升级为 mdast 后遍历取 `link`/`wikiLink`/`inlineTag` 节点，输出 `{目标, 别名, 是否为嵌入, 行, 列}`。

**✅ 渲染路径（阅读模式）—— `markdown-it`（或 `remark` + `remark-rehype` + `rehype` 全家桶）**
- **推荐 `markdown-it`**【推断】：渲染是一次性的、不需要增量，`markdown-it` 更快、更小、插件写法更直白，且有现成的 KaTeX（`markdown-it-katex`，但注意它 **2016 年停更**，建议改用 `@vscode/markdown-it-katex` 或自己写 KaTeX 插件）、Mermaid、脚注等。
- **选 `remark` 全管线的唯一理由**：你想让**索引与渲染共用同一棵 AST**，避免"索引认为这是一个链接、渲染却渲染成纯文本"的双方言漂移。这是真实存在的风险。

> **⚠️ 双方言风险（必须写进设计文档）**：用两套解析器意味着 `[[x]]`、`==x==`、嵌套强调等边界情形可能在"编辑器里看起来是链接"和"渲染出来是链接"之间不一致。**缓解措施**：把 wikilink 的识别规则**抽成一个独立的、被双方共用的正则/扫描模块**，两套解析器都调用它，只让它们负责"在文档的哪个位置调用"。这样方言只有一个来源。

**❌ 不建议**：只选 `markdown-it` 一套通吃。它的 token 流模型会让"提取所有链接与标签"变成手写状态遍历，且**没有增量能力**，编辑器每次按键全文重解析在长文档上会掉帧。

**📌 配套库（全部 MIT，已核实版本）**：`katex` 0.18.10（2026-09-30）、`shiki` 4.4.3（2026-08-10，比 highlight.js / Prism 更适合"代码块静态渲染"因为主题丰富且无 CSS 冲突）、`mermaid` 12.0.0（2026-09-10）、`yaml` 2.9.1（ISC，解析 frontmatter）、`fuse.js` 7.5.0（Apache-2.0，模糊搜索）/ `minisearch` 7.2.0（MIT，全文索引，比 flexsearch 的 API 更稳）。

---

## 3. 图谱可视化库对比

### 3.1 先说 Obsidian 的答案（作为目标基准）

**【事实】** Obsidian 官方社区文档 *Graph view customization*（[obsidian-hub](https://github.com/obsidian-community/obsidian-hub)）原文：

> *"Since the graph is rendered using `<canvas>` and WebGL, CSS is unable to affect things like nodes and links. To customize graph view, we have provided a bridge to use CSS colors for customizing WebGL."*

并公开了它支持的 CSS 颜色桥接类，这等于给出了**图谱需要着色的 13 个语义槽位**，可以直接作为"格致"图谱的样式需求清单：

`.graph-view.color-fill`、`.color-fill-focused`、`.color-fill-tag`、`.color-fill-attachment`、`.color-arrow`、`.color-circle`、`.color-line`、`.color-text`、`.color-fill-highlight`、`.color-line-highlight`、`.color-fill-unresolved`

> **【推断】这说明两件事**：(1) Obsidian 的图谱是**自研 Canvas+WebGL 渲染器**，不是上面任何一款库；(2) 它把"节点分类着色"做成了一等公民（焦点色 / 标签色 / 附件色 / 未解析链接色 / 高亮态填充与连线色），这是产品级图谱的必要设计，选型时要确认库能否低摩擦地表达这些槽位。

### 3.2 总览表

| 维度 | **Cytoscape.js** | **sigma.js + graphology** | **react-force-graph** | **d3-force（裸用）** | **AntV G6** | **vis-network** |
|---|---|---|---|---|---|---|
| 仓库 | [cytoscape/cytoscape.js](https://github.com/cytoscape/cytoscape.js) | [jacomyal/sigma.js](https://github.com/jacomyal/sigma.js) + [graphology/graphology](https://github.com/graphology/graphology) | [vasturiano/react-force-graph](https://github.com/vasturiano/react-force-graph) | [d3/d3-force](https://github.com/d3/d3-force) | [antvis/G6](https://github.com/antvis/G6) | [visjs/vis-network](https://github.com/visjs/vis-network) |
| License | **MIT** | **MIT**（两者均 MIT） | **MIT** | **ISC** | **MIT**（LICENSE 核实为 "MIT License, Copyright (c) 2018 Alipay.inc"） | **Apache-2.0 OR MIT**（双许可，实测 LICENSE 文件两者都在） |
| Stars（2026-10-01） | **11,228** | **12,174** / **1,750** | **3,316** | **2,002** | **12,322** | **3,632** |
| npm / 版本 | `cytoscape` 3.34.3（2026-09-07） | `sigma` 3.0.3（2026-04-30）/ `graphology` 0.26.0（**2025-01-26**） | `react-force-graph` 1.48.3（2026-09-29） | `d3-force` 3.0.0（**2021-06-05**） | `@antv/g6` 5.1.1（2026-05-08） | `vis-network` 10.1.2（2026-08-19） |
| 渲染后端 | **Canvas 2D**（默认）。**注意**：仓库有 [#3436](https://github.com/cytoscape/cytoscape.js/issues/3436)（WebGL 硬件加速在集显上反而降性能）与 [#3261](https://github.com/cytoscape/cytoscape.js/issues/3261)（用 GPU 做性能增强，**open**）——说明 WebGL 支持存在但不是默认路径【事实】 | **WebGL**（sigma 的核心卖点，3.x 为纯 WebGL 渲染）+ graphology 做图数据与布局 | **Canvas 2D / WebGL / SVG 三选一**（2D/3D/VR 变体各有实现） | 无渲染——**只有布局力模型**，渲染要自己写 | Canvas（内置）+ 可插拔渲染器 | Canvas 2D |
| 几千节点是否流畅 | 【推断】**布局是瓶颈**：内置力导向布局（`cose`/`fcose`）在 5k 节点上会明显卡（社区 #3486 "v4 performance redesign" **open**）。渲染本身 Canvas 2D 在 5k 节点/10k 边上通常可接受。**未实测。** | 【推断】**渲染层最稳**：WebGL 是为此而生。sigma 3.x 官方定位就是大规模图。但 **graphology 0.26.0 停在 2025-01，且 sigma 3.0.3 停在 2026-04**，是六个里发版节奏最慢的 | 【推断】介于两者之间。仓库有一串性能 issue：#483 "Performance issues with 80k+ edges"（**open**）、#223 ">12k elements"、#202、#181，多已 closed，说明**中等规模 OK、超大规摸是已知痛点** | 纯布局：`d3-force` 的 Barnes-Hut 近似让 O(n²) 降到 O(n log n)，5k 节点布局可跑但需 Web Worker + 冷却调度 | 【推断】G6 5.x 有大量性能 PR（#6670、#6651、#6619、#6267、#6249 等，均已合并），并提供了[性能诊断流程图 demo](https://github.com/antvis/G6/pull/6289)，工程化程度高。但 #6591 "[Bug]: v5 performance needs to be improved" 也说明 v5 性能曾是问题 | 【推断】Canvas 2D，中等规模可用；生态活跃度是六个里最低 |
| 增量更新 | ✓ `cy.add()` / `cy.remove()`，可只对新增节点跑局部布局 | ✓ **最强**：graphology 的 `graph.addNode()` 等是事件驱动的，sigma 监听事件自动增量重渲染，**不需重建** | △ `graphData` prop diff（React 侧），但内部仍靠 d3-force 重新加热模拟 | ✓ 手动：`simulation.nodes()` 增删 + `simulation.alpha(0.3).restart()` | ✓ `graph.addData()` / `updateData()` / `removeData()` | ✓ `DataSet` 的 `add`/`update`/`remove`（事件驱动） |
| 过滤 / 子图 | ✓ `cy.filter()`、`eles.hide()`；ego network 需自己用 `eles.neighborhood()` | ✓ graphology 有 `graphology-traversal`，可提子图后喂给 sigma | △ 靠外部过滤 `graphData` 再传入 | ✓ 完全手动（但也完全自由） | ✓ 内置多种过滤与状态系统（`setElementState`） | ✓ `DataSet` 过滤 + `physics` 动态开关 |
| 节点自定义样式 | ✓✓ **最强**：`style` 支持 `background-image`、`shape: round-rectangle/ellipse/...`、`text-wrap`、`text-max-width`、按数据映射（`mapData`）；支持 HTML 节点（性能差） | ✓ 节点可以画图片/图标（WebGL 程序化），标签可随缩放淡出——**这正是 Obsidian 图谱要的"缩放到一定级别才显示标签"** | ✓ `nodeCanvasObject` 完全自定义绘制回调（能画任何东西，但要自己处理缩放与命中测试） | ✗ 无——渲染是你的事 | ✓✓ 内置丰富节点/边/箭头/徽标（badge）样式，中文文档最好 | ✓ 支持字体/图标/形状，配置式 |
| React 19 集成 | 需命令式包装（社区 `react-cytoscapejs` 陈旧，**未验证** 是否支持 React 19） | 需命令式包装（无官方 React 绑定） | ✓ **本身就是 React 组件**（`react-force-graph-2d`） | ✗ 非 React | 需命令式包装（`@antv/g6-react-node` 等，**未验证** React 19） | 需命令式包装（`react-graph-vis` 陈旧，**未验证**） |
| 中文资料 | 一般 | 少 | 少 | 多（d3 中文资料最多） | **最好**（AntV 中文文档 + 中文社区） | 一般 |

### 3.3 逐项关键判断

- **Cytoscape.js**：功能最全（图算法 `eles.dijkstra()`、`eles.neighborhood()`、复合节点、丰富的选择器语法），**把"图"当一等公民**而不是"可视化的输入"。代价：默认 Canvas 2D、样式 DSL 学习成本、React 集成要自己写 wrapper。**【推断】如果你的图谱不只是"看"，还要"算"（最短路径、共同邻居、社区检测），它是首选。**
- **sigma.js + graphology**：**渲染性能天花板最高**（纯 WebGL）且 **graphology 的数据模型 + 事件系统是所有方案里最贴合"增量更新"的**。风险是维护节奏：`graphology` 0.26.0 停在 2025-01-26，`sigma` 3.0.3 停在 2026-04-30。【推断】属于"成熟稳定"而非"活跃开发"，对基础设施类库可以接受，但要接受"出问题大概率得自己修"。
- **react-force-graph**：起步最快（一个 React 组件传 `graphData` 就行），**但本项目不建议**——它是"3D/VR 图谱展示"的定位，为了 3D 与 VR 引入了 three.js 依赖链，而"格致"要的是 2D Obsidian 风格。【推断】它的 `nodeCanvasObject` 自定义能力足以做出 Obsidian 外观，但**为了省一个 wrapper 而背 three.js 不划算**。
- **d3-force（裸用）**：**【推断】这其实是"认真做 Obsidian 级图谱"的正解组件**——但只是**布局**的正解，不是渲染的。Obsidian 自己的图谱就是"自研 WebGL 渲染 + 力导向布局"（§3.1 已证实前半句，后半句为**推断**）。`d3-force` 提供 `forceSimulation` / `forceLink` / `forceManyBody`（Barnes-Hut）/ `forceCenter` / `forceCollide`，正好对应 Obsidian 图谱设置面板里暴露的 **Center force / Repel force / Link force / Link distance** 四个旋钮——这**不是巧合，是同一套力模型的命名**。【推断】但 `d3-force` 3.0.0 停在 **2021-06-05**，且它是 ISC 许可的"稳定即完成"型库（d3 系列常态），不构成风险。
- **AntV G6**：功能与中文体验最好，工程化最认真（大量性能 PR、性能诊断 demo、内置 badge/箭头/状态系统）。**【推断】如果团队更看重"少写代码、快速出成品"和中文文档，G6 是性价比之选。**但 5.x 仍在修性能，且 React 19 集成**未验证**。
- **vis-network**：能干活，但生态活跃度最低、样式与交互偏"网络拓扑图"而非"知识图谱"。**不推荐。**

### 3.4 推荐

**✅ 推荐（主选）：`d3-force`（布局）+ 自研 Canvas 2D 渲染层**

理由：
1. **Obsidian 级图谱的差异化全在渲染细节**——标签随缩放淡出、hover 高亮邻居并压暗其余、未解析链接用空心/虚线、按标签分组着色、点击聚焦动画。**任何库的默认渲染都会在这些细节上跟产品预期打架**，而 `nodeCanvasObject` 式的回调方案最终等于"在库的框架里写自己的渲染器"。既然如此，不如直接写渲染器。
2. **几千节点的规模，Canvas 2D 足够。**【推断】Canvas 2D 画 5k 个圆 + 10k 条线，在 60fps 下的主要成本是每帧重绘全部图元；通过**分层 canvas**（连线层 / 节点层 / 标签层 / 交互层）+ **静态时停止重绘**（力模拟冷却后只重绘交互层），可稳稳达标。只有上万节点才需要 WebGL。
3. **`d3-force` 的力模型与 Obsidian 的设置面板一一对应**（Center / Repel / Link / Link distance），能让"图谱设置"这个 UI 直接映射到 API，省掉一层翻译。
4. **零框架耦合**：没有 React 19 兼容性悬念，没有命令式/声明式的阻抗失配。布局跑在 Web Worker 里，主线程只管画。
5. License 最宽松（ISC），依赖最少。

**🚫 但这条推荐的成立条件必须写清楚**（否则就是过度设计）：
- **如果团队没有图形/性能调优经验**，或者**要在 2 周内出可用的图谱**，请改选 **Cytoscape.js**（功能全、生态成熟、`fcose` 布局质量好）或 **AntV G6**（中文文档 + 内置组件最省事）。自研渲染器的隐性成本被严重低估：命中测试、缩放平移的坐标变换、HiDPI 的 `devicePixelRatio` 处理、文本测量与截断、节点拖拽的惯性——每一项都要自己写。
- **如果目标 vault 规模会到 2 万+ 节点**，改用 **sigma.js + graphology**（WebGL 渲染层 + 事件驱动增量）。此时接受的代价是维护节奏慢。

**🔄 备选：Cytoscape.js**（团队规模小 / 需要图算法 / 想少写代码时选它）

**❌ 不推荐**：`react-force-graph`（为 2D 场景背 three.js）、`vis-network`（生态与定位不匹配）。

### 3.5 全局图谱 vs 局部图谱：选型必须同时满足的两件事

**【事实】** Obsidian 官方文档明确两者共用全部设置，局部图谱额外有 **depth 滑杆**："*The local Graph view can use all of the Settings available to the global Graph view. Additionally, you can change the depth of the local graph.*"

对应到选型，这意味着库必须支持：
1. **同一套渲染管线喂不同子图**（不能为局部图谱换一套实现）；
2. **N-hop 邻域提取**要便宜：`Cytoscape.js` 有 `eles.neighborhood()` / `eles.closedNeighborhood()`；`graphology` 有 traversal 工具；自研方案就是一次 BFS。**这一条自研方案反而最简单**。
3. **深度的边界语义**：depth=1 只显示直接入链/出链；是否包含"未解析链接"（指向不存在的笔记的节点）？Obsidian 有 `Existing files only` 开关处理这个。【事实】

### 3.6 Obsidian 图谱设置面板 → 选型检查清单

**【事实】** 以下全部来自 Obsidian 官方 Graph view 文档，**应逐条作为选型验收项**：

| 分组 | 设置项 | 对选型的约束 |
|---|---|---|
| Filters | Search files（用完整搜索语法过滤节点） | 图谱必须能消费搜索 DSL 的结果集 → 搜索与图谱共用一套过滤引擎 |
| Filters | Tags / Attachments / **Existing files only** / Orphans | 需要按节点类型与度数过滤；"Orphans"= degree 0 过滤 |
| Groups | 按搜索词建组 + 上色 | 需要 `node → color` 的映射层与多组优先级 |
| Display | Arrows（显示方向）/ **Text fade threshold** / Node size / Link thickness / Animate（时间流逝动画） | Text fade threshold 是**按缩放级别控制标签透明度的能力**；Animate 需要能按 `created_at` 顺序逐批显形 |
| Forces | Center / Repel / Link / Link distance | 力模型必须可运行时调参并重新加热（`simulation.alpha()`）|

> **【推断】这张表就是"自研 vs 用库"的决定性证据**：`Text fade threshold` 和 `Animate` 这两项，在 Cytoscape/G6/sigma 里都没有现成的等价物，都要写自定义渲染或自定义图层。也就是说，**无论选哪个库，这两项都得自己写**。

### 3.7 落地前必须自测的基准

本报告**没有做任何实测**（见 §0 限制说明）。选型定稿前必须跑以下基准，用真实 vault 数据：

1. **布局基准**：2k / 5k / 10k 节点、边数≈节点数×1.5，测 `d3-force` 在 Web Worker 中从随机初值到能量收敛的**墙钟时间**。**通过标准**：2k 节点首次收敛 < 3s，且收敛后主线程可交互（不阻塞输入）。**这是全局图谱的生死线**——渲染慢可以优化，布局卡住就没救。
2. **渲染基准**：收敛后的静态图上，测平移/缩放的**帧率**（目标：1080p 下 ≥ 50fps）与 hover 高亮邻居的重绘耗时。分别测**分层 canvas** 与**单 canvas** 两版，验证"分层是否真的必要"。
3. **增量基准**：模拟用户编辑一篇笔记造成 1 条边增删，测"更新图数据 → 重新布局 → 重绘"的延迟。**通过标准**：< 100ms 且不产生视觉抖动（节点位置不应大幅跳变——这就是 Obsidian 用 `alpha` 小幅加热而非重置的原因）。【推断】
4. **局部图谱基准**：depth 1/2/3 的 N-hop 提取耗时（目标 < 20ms），以及在 5k 节点全局图上的**反向索引**（`target → sources`）查询耗时。

---

## 4. Obsidian 交互拆解（可借鉴项）

> 难度评级是**针对"格致"团队（Electron + React 19 + TS，无现成桌面笔记框架）从零实现**的工作量判断，属**【推断】**，不是 Obsidian 的实现难度。
> 官方文档链接一律用 `obsidian.md/help/<permalink>` 形式（permalink 取自 [`obsidianmd/obsidian-help`](https://github.com/obsidianmd/obsidian-help) 各文件的 frontmatter，已逐条核实）。

### 4.1 逐项拆解

#### 1) 左侧 Ribbon（图标条）

- **Obsidian 行为**【事实，[help/ribbon](https://obsidian.md/help/ribbon)】：桌面上位于**左侧边栏**中，且**即使左侧边栏折叠也保持可见**。每个动作是一个图标，hover 显示 tooltip。支持**拖拽重排**、右键空白处**勾选隐藏**、右键选择 **Hide ribbon**。布局**跨会话记忆**，并**随 `workspace.json` 与 `workspace-mobile.json` 同步**。默认动作三个：Vault switcher、Help、Settings。
- **难度：低。** 就是一个可拖拽排序的纵向图标列表 + 配置持久化。
- **开源替代**：无专门库，直接用 `@dnd-kit/core`（拖拽排序）+ `lucide-react` 图标即可。【推断】
- **可借鉴的关键设计**：**"侧栏折叠时 ribbon 仍可见"** 这个细节决定了主内容区的有效宽度感知——很多模仿者漏掉它，导致折叠侧栏后没有入口再打开。

#### 2) 文件浏览器（File explorer）

- **Obsidian 行为**【事实，[help/file-explorer](https://obsidian.md/help/plugins/file-explorer)】：树形结构，拖拽移动文件/文件夹、右键上下文菜单、新建/重命名/删除、排序、折叠全部、跟随当前文件高亮。
- **难度：中。** 真正的成本不在渲染树，而在**文件系统语义**：重命名要级联更新所有 `[[旧名]]` 链接（Obsidian 的 "Automatically update internal links" 设置）、删除要走回收站（`.trash/`）、要监听外部变更（chokidar）、要处理大小写不敏感与 Windows 保留字符、要处理符号链接与 260 字符路径限制。
- **开源替代**：`react-arborist`（虚拟化树，**未验证** React 19）；也可用 `react-window` / `@tanstack/react-virtual` 自建。**文件监听用 `chokidar`。**【推断】
- **⚠️ Windows 特有坑（必须在设计阶段处理）**：文件路径大小写不敏感但大小写保留；`CON`/`PRN`/`AUX`/`NUL` 等保留名；路径长度上限（需 long path 支持）；文件锁（另一进程正在写入 → `EBUSY`）。**【推断】，需 PoC 验证。**
- **Obsidian 的一个聪明做法**【推断】：笔记的**唯一标识是文件名（或路径）**，不是内部 ID——这样文件系统本身就是数据库，"用别的工具打开也能看懂"。代价是重命名要全库改链接。

#### 3) 标签页与分屏（Tabs & Split panes）

- **Obsidian 行为**【事实，[help/tabs](https://obsidian.md/help/tabs) + [help/workspace](https://obsidian.md/help/workspace)】：
  - 每个标签属于一个 **tab group**；可拖拽在组内重排、拖到别的组、或**拖出窗口变成独立窗口**（pop-out windows）。
  - **Split right / Split down** 右键菜单拆分；也可把标签拖到另一个标签底部来拆分。
  - **Pin tab**：固定的标签页中，链接总在**新标签**打开。
  - **Stack tabs**（堆叠标签，灵感来自 Andy Matuschak 的 sliding notes），配 gif 演示。
  - **Linked views**：一个标签**引用另一个标签**，被引用标签内容变化时联动。可用于笔记标签的 **Graph view (local) / Backlinks / Outline**。
  - 侧边栏的 tab group 与主区**共用同一套模型**，但侧栏标签**只显示图标**（hover 显示标题）。
  - 快捷键：`Ctrl+Tab`/`Ctrl+Shift+Tab` 切换、`Ctrl+1..8` 跳转、`Ctrl+9` 最后一个、`Ctrl+Shift+T` 恢复最近关闭的标签。链接修饰键：`Ctrl` 新标签、`Ctrl+Alt` 新标签组、`Ctrl+Alt+Shift` 新窗口。
- **难度：高。** 这是 Obsidian UI 里**最贵**的一块。核心难点是"**Linked views**"——一个面板要订阅"当前激活标签"的变化，且 pin 之后要**停止**跟随。这个状态机容易写出微妙的 bug。
- **开源替代（已核实 star / license / 版本）**：

| 库 | 仓库 | License | Stars | npm 版本（日期）| 备注 |
|---|---|---|---|---|---|
| **dockview** | [dockview/dockview](https://github.com/dockview/dockview) | MIT | **3,453** | 8.4.0（**2026-09-30**）| 零依赖，支持 React/Vue/Angular/vanilla；**最接近 Obsidian 的模型**（tabs + groups + grid + splitview），发版最活跃 |
| **rc-dock** | [ticlo/rc-dock](https://github.com/ticlo/rc-dock) | Apache-2.0 | **未验证** | 4.1.0（**2026-09-30**）| React 专用，支持拖拽停靠与浮动窗口，同样活跃 |
| **FlexLayout** | [caplin/FlexLayout](https://github.com/caplin/FlexLayout) | MIT | 1,363 | 0.11.1（2026-09-26）| React 专用，功能强但 v0.x（API 未稳定）|
| **Golden Layout** | [golden-layout/golden-layout](https://github.com/golden-layout/golden-layout) | MIT | 6,719 | 2.6.0（**2022-09-26**）| star 最高但**发版停在 2022**，且黄金布局原本是 jQuery 时代设计 |
| **react-mosaic** | [nomcopter/react-mosaic](https://github.com/nomcopter/react-mosaic) | Apache-2.0 | 4,800 | 7.2.1（2026-09-28）| **平铺窗口**（tiling）而非"标签+分屏"，交互范式不同 |
| **allotment** | [johnwalley/allotment](https://github.com/johnwalley/allotment) | MIT | 1,261 | 1.20.5（2025-12-19）| 只做**可拖拽分栏**（VS Code 风格 split view），不含标签与拖拽停靠 |

- **【推断】建议**：用 **dockview** 做主区与侧栏的布局引擎（它是唯一"标签 + 组 + 网格 + 分栏"四件套齐全且持续发版的零依赖库），**Linked view 的语义自己实现**（这是产品逻辑，不该外包）。若 dockview 的 React 19 兼容性有问题（**未验证**），退到 **allotment（只做分栏）+ 自研标签条**——这条路的可控性其实更高，因为 Obsidian 的标签条交互（拖拽 drop zone 高亮、拖出成窗）本来就要自定义。

#### 4) 右侧反链面板（Backlinks / Outgoing / Unlinked mentions）

- **Obsidian 行为**【事实，[help/backlinks](https://obsidian.md/help/plugins/backlinks) + [help/outgoing-links](https://obsidian.md/help/plugins/outgoing-links)】：
  - **两个可折叠区**：**Linked mentions**（指向当前笔记的反链）与 **Unlinked mentions**（当前笔记**名字**在别处的未链接出现）。原始文档只定义这两个；**Outgoing links 是独立的核心插件**（独立 tab、独立文档页）。
  - 面板选项：**Collapse results**、**Show more context**（是否截断到整段）、**Change sort order**、**Show search filter**（用完整搜索语法过滤提及）。
  - **跟随 vs 固定**：backlinks tab 默认跟随**当前激活标签**；用命令 *Backlinks: Open backlinks for the current note* 可开一个 **linked backlinks tab**，该 tab 带链接图标，**锁定在某一篇笔记**。
  - **两种呈现**：侧栏 tab，或 **"Backlink in document"**（把反链渲染在笔记正文底部），后者可设为自动开启。
  - 被 **Excluded files** 命中的文件**不会出现在 Unlinked mentions** 里。
- **Unlinked mentions 的算法**【推断】：拿当前笔记的**文件名 + 所有 aliases**做主串，在其余笔记的**纯文本**（剥离代码块、链接语法）中做大小写不敏感的多模式匹配；命中且该位置**不在已有的 `[[...]]` 内**才算"未链接"；然后提供"一键转成链接"。
- **难度：中。** Linked/Outgoing 靠索引查询即可（低）；**Unlinked mentions 是真难点**——它是 O(笔记数 × 文本长度) 的多模式搜索，必须**增量维护**（否则每次切笔记都全库扫描，几千篇就卡）。**建议实现**【推断】：建立"文件名/别名 → 出现位置"的倒排索引，在文件变更时增量更新；用 Aho-Corasick 类多模式匹配而非 N 次 `indexOf`。
- **开源替代**：无直接等价库，需自研。搜索层可用 `minisearch`（7.2.0，MIT）或 `flexsearch`（0.8.212，Apache-2.0）。

#### 5) 局部图谱 vs 全局图谱

- **Obsidian 行为**【事实，[help/graph](https://obsidian.md/help/plugins/graph)】：两者的差异**只有一点**——全局显示全库，局部显示"与当前笔记相连的笔记"，局部**多一个 depth 滑杆**（"每一层深度会显示与上一层揭示的笔记相连的笔记"）。其余设置完全共用（Filters / Groups / Display / Forces，详见 §3.6 表格）。
- **难度：中。** 图谱本身已在 §3 评估；这里的额外成本是 **"图谱面板作为 linked view 跟随当前笔记"**（即上面的 Linked views 机制）与 **depth 变化的平滑重布局**。
- **开源替代**：见 §3。

#### 6) Ctrl+P 命令面板（Command palette）

- **Obsidian 行为**【事实，[help/command-palette](https://obsidian.md/help/plugins/command-palette)】：`Ctrl+P` 打开；**支持模糊匹配**（文档举例：输入 `scf` 找到 **S**ave **c**urrent **f**ile）；**1.8.3 起最近使用的命令排在顶部**，但筛选开始后**更短的命令优先于最近使用的**；可**固定（pin）常用命令**；可查看每个命令的快捷键。
- **难度：低。**
- **开源替代（已核实）**：

| 库 | 仓库 | License | Stars | 版本 | 备注 |
|---|---|---|---|---|---|
| **cmdk** | [dip/cmdk](https://github.com/dip/cmdk)（原 `pacocoursey/cmdk`）| MIT | **12,998** | 1.1.1（2025-03-14）| 无样式、组合式，事实标准；**注意仓库已迁移到 `dip/cmdk`** |
| **kbar** | [timc1/kbar](https://github.com/timc1/kbar) | MIT | 5,255 | 1.0.0（2026-08-10）| 自带"动作注册 + 快捷键 + 搜索"的完整框架 |
| **ninja-keys** | [ssleptsov/ninja-keys](https://github.com/ssleptsov/ninja-keys) | MIT | **未验证** | 1.2.2（**2022-07-01**）| Web Component（非 React），发版停滞 |

- **【推断】建议**：**用 `kbar`**。理由：Obsidian 的命令面板本质是"**一个全局命令注册表 + 快捷键系统 + 模糊搜索 UI**"三件套，而 `kbar` 正好把这三者打包了（`useRegisterActions` + `useHotkeys` + 内建搜索）；`cmdk` 只给你 UI 原语，注册表与快捷键系统仍要自己搭。若已决定自建命令注册表（大概率要，因为插件系统需要它），则用 `cmdk` 做纯 UI。

#### 7) Ctrl+O 快速切换（Quick switcher）

- **Obsidian 行为**【事实，[help/quick-switcher](https://obsidian.md/help/plugins/quick-switcher)】：`Ctrl+O`；**按名称或别名搜索**；`Enter` 打开；**无匹配时 `Enter` 直接创建同名笔记**；**即使有相似匹配，`Shift+Enter` 仍强制创建精确名称的新笔记**；`Ctrl+Enter` 在新标签打开；**搜索词为空时显示最近笔记**（配合 `↓`+`Enter` 可实现两篇笔记间快速切换）；被 Excluded files 命中的文件**降权**而非排除。
- **⚠️ 一条重要的性能护栏**【事实】：*"Autocomplete functionality switches to a simpler result algorithm when the vault reaches 10,000 items to maintain optimal application performance."* —— **Obsidian 自己在 1 万条目时降级了算法**。这说明"名字+别名模糊搜索"在万级规模上是有性能天花板的。【推断】"格致"必须在索引层就为此设计（例如：前缀索引 + 别名单独索引，而非每次全量 fuzzy 扫描）。
- **难度：低-中**（UI 低，索引中）。`[[` 自动补全应**复用同一套索引与排序算法**，保证两处结果一致。
- **开源替代**：`fuse.js` 7.5.0（Apache-2.0）用于小规模；万级以上建议自建 n-gram / 前缀索引。

#### 8) 三种视图模式：源码 / 实时预览 / 阅读

- **Obsidian 行为**【事实，[help/edit-and-read](https://obsidian.md/help/edit-and-read)】：
  - 文档把概念拆成 **Views（Reading / Editing）** 与 **Modes（Live Preview / Source）** 两层。
  - **Reading view**：不显示 Markdown 语法，干净阅读。`Ctrl+E` 切换。**按住 `Ctrl` 点视图切换器可同屏并排打开编辑与阅读**。
  - **Live Preview**："*inline 显示已格式化文本，同时隐藏大部分 Markdown 语法。当光标进入已格式化内容时，底层语法会显现以供编辑*"。这是**非所见即所得**（WYSIWYM / 半 WYSIWYG）——**语法是"隐藏"而非"不存在"**，这正是 CodeMirror Decoration 方案的能力边界。
  - **Source mode**：原样显示全部 Markdown 语法。
  - 命令 **Toggle Live Preview/Source mode** 可在两种编辑模式间快速切换。
- **难度：高（Live Preview 部分）。** 阅读视图是中（`markdown-it` 渲染 + 安全的 HTML 消毒），源码模式是低（编辑器默认态）。Live Preview 就是 §1.5 PoC 清单里的东西。
- **开源替代**：无直接替代；这是 CodeMirror Decoration / ProseMirror 自定义 Node 的活。
- **【推断】给"格致"的建议**：**不要承诺"真正的所见即所得"**。Obsidian 明确的"语法隐藏、光标进入即显现"是一个**可实现的、用户已经接受的**契约；而"完全 WYSIWYG + Markdown 为真源"在数学上做不到无损（Markdown 有太多等价写法：`*x*` 与 `_x_`、setext 与 atx 标题、硬换行），必然要面对"用户存了什么"与"用户看到什么"的漂移。

#### 9) YAML frontmatter 属性面板（Properties）

- **Obsidian 行为**【事实，[help/properties](https://obsidian.md/help/properties)】：
  - 入口：命令 **Add file property**、快捷键 **`Ctrl+;`**、标签右键菜单、或直接在文件开头输入 `---`。
  - 界面上每个属性是一行"**名称输入 + 值输入**"。
  - **默认/特殊属性**：`tags`、`cssclasses`、`aliases`。
  - **支持的类型**：Text、List、Number、Checkbox、Date、Date & time、Tags。
  - **关键约束**：*"Once a property type is assigned to a property name, all properties with that name across your vault will use the same type."* —— **类型是 vault 级全局的**，不是每篇笔记独立的。这一点必须在数据模型里体现（需要一个 vault 级的 `property types` 注册表）。
  - **Display modes**（Settings → Editor → Properties in document）：**Visible**（默认，显示在笔记顶部）/ **Hidden**（隐藏，仍可在 Properties view 侧栏看）/ **Source**（显示为原始 YAML）。
  - **明确不支持**（官方列的 Not supported）：**嵌套属性**（建议用源码模式看）、**批量编辑**（建议用外部工具）、**属性里的 Markdown**（*"这是有意的限制，因为属性是小的、原子的、人和机器都可读的信息"*）。`null` 可用于查"存在但为空"的属性（但空引号 `""` 或空括号 `[]` 不算空）。
  - **格式细节**【事实】：属性名与值以 `: ` 分隔；**属性名在单篇笔记内必须唯一**；**Text 属性中的 hashtag 不会生成标签**；Text 属性中的内部链接**必须加引号**（`link: "[[Episode IV]]"`），Obsidian 手动输入时会自动补引号。
- **难度：中。** UI 本身不难；难在**"类型注册表 + 跨笔记类型一致性 + 与源码模式双向同步且不破坏用户手写的 YAML 格式"**（YAML 注释、缩进、引号风格、键顺序都会在往返中丢失——这是 `yaml` 库的已知特性）。**【推断】建议：属性面板读时用 `yaml` 解析，写时只做**最小化的文本编辑**（定位到对应行改值），不要整体重新序列化整个 frontmatter，否则用户的格式会被吃掉。**
- **开源替代**：`yaml` 2.9.1（ISC）解析；UI 自研。

#### 10) 标签（Tags）

- **Obsidian 行为**【事实，[help/tags](https://obsidian.md/help/tags)】：
  - 两种来源：**行内 `#tag`** 与 **frontmatter `tags:`**（YAML 里**必须是列表**）。
  - **嵌套标签**用 `/`：`#inbox/to-read`。**注意匹配语义差异**【事实】：`tag:inbox` 会匹配 `#inbox` **以及所有嵌套标签**（如 `#inbox/to-read`）；但搜索 `tag:#work` **不会**返回 `#myjob/work`。→ 这两句话合起来说明：**前缀匹配生效的方向是"父标签匹配子标签"，而不是反过来**。
  - **合法字符**：字母、数字、下划线 `_`、连字符 `-`、斜杠 `/`（用于嵌套）、以及"普遍接受的 Unicode 字符，包括 emoji 和其他符号"。
  - **必须含至少一个非数字字符**：`#1984` 非法，`#y1984` 合法。
  - **大小写不敏感**：`#tag` 与 `#TAG` 视为同一个；Tags view 中显示**首次创建时**的大小写。
  - **不能含空格**；建议 `#camelCase` / `#PascalCase` / `#snake_case` / `#kebab-case`。
- **难度：低-中。** 解析与索引不难（一行正则 + 前缀树）；难点是 ①标签面板的树形展示与重命名级联、②上述"父匹配子、子不匹配父"的语义要在搜索与图谱两处保持一致。
- **开源替代**：无。`Tags view` 是核心插件（[help/tags-view](https://obsidian.md/help/plugins/tags-view)）。

#### 11) 搜索语法

**【事实】** 完整核实自 [help/search](https://obsidian.md/help/plugins/search)。这是**必须逐条实现**的清单：

**基础**
- 空格分隔 = **AND**（每个词在各文件内独立匹配）；`OR` = 任一；`-` 前缀 = 取反（`meeting -work`）；`-` 可作用于括号组（`meeting -(work meetup)` = 有 meeting 且**不是"两者都有"**）。
- 括号控制优先级：`meeting (work OR meetup) personal`。
- 引号 = 精确短语 `"star wars"`；短语内引号用反斜杠转义 `"they said \"hello\" to each other"`。
- **属性搜索**：`[property]` 匹配"有该属性"；`[property:value]` 匹配值；`[property:null]` 匹配"存在但为空"。属性名与值**都支持子查询**（括号、`OR`、引号、正则）。
- 比较运算符：`[duration:<5]`、`[duration:>5]`（**必须用方括号或引号包裹**）。
- **正则**：`/.../` 包裹，**JavaScript 风格**（`/\d{4}-\d{2}-\d{2}/`），可与操作符组合 `path:/\d{4}-\d{2}-\d{2}/`。

**操作符表（逐条核实）**

| 操作符 | 语义 | 备注 |
|---|---|---|
| `file:` | 在**文件名**中找文本；匹配 vault 中**任意文件** | `file:.jpg`、`file:202209` |
| `path:` | 在**文件路径**中找文本；匹配任意文件 | `path:"Daily notes/2022-07"` |
| `content:` | 在**文件内容**中找文本 | `content:"happy cat"` |
| `match-case:` | 大小写敏感匹配 | `match-case:HappyCat` |
| `ignore-case:` | 大小写不敏感匹配 | `ignore-case:ikea` |
| `tag:` | 找**文件中的标签** | `tag:#work`；**忽略代码块与非 Markdown 内容**，因此常比全文搜 `#work` 更快更准；`tag:#work` **不**返回 `#myjob/work` |
| `line:` | 至少有一**行**匹配 | `line:(mix flour)`；`-line` 取反 |
| `block:` | 匹配在**同一块**内 | `block:(dog cat)`；**需要解析每个文件的 Markdown**，较慢 |
| `section:` | 匹配在**同一小节**内（两个标题之间的文本） | `section:(dog cat)` |
| `task:` | 在**任务列表项**中匹配 | `task:call` |
| `task-todo:` | 在**未完成**任务中匹配 | `task-todo:call` |
| `task-done:` | 在**已完成**任务中匹配 | `task-done:call` |

**其它已在官方文档中确认的行为**
- **默认只搜笔记与 canvas 的路径/文件名**；要搜**任意文件**的路径或文件名，必须用 `path:` 或 `file:`。
- **只搜笔记和 canvas 的内容**（不搜附件内容）。
- 支持 **Explain search term**、结果排序（文件名 A-Z/Z-A、修改时间新→旧/旧→新、创建时间新→旧/旧→新）、**Copy search results**。
- **嵌入式搜索**：在笔记里写 ` ```query ` 代码块可把搜索结果嵌入笔记。
- **Excluded files** 命中的文件不出现在搜索结果中。

- **难度：中-高。** 逐条实现 UI 与解析不难，难在 **`block:` 与 `section:` 要求结构化解析**（这正是 §2 里"索引路径必须用高保真解析器"的又一个理由），以及**性能**：`block:` 官方都承认慢。

### 4.2 其它值得借鉴的小件

| 特性 | Obsidian 行为 | 难度 | 参考 |
|---|---|---|---|
| **状态栏** | 右下角；显示编辑模式切换、字数等 | 低 | [help/status-bar](https://obsidian.md/help/status-bar) |
| **Workspaces 插件** | **保存/恢复整个窗口布局**（`workspaces.json`） | 中 | [help/workspaces](https://obsidian.md/help/plugins/workspaces) |
| **File recovery** | 定期快照 + 恢复（`snapshots/`） | 中-高 | [help/file-recovery](https://obsidian.md/help/plugins/file-recovery) |
| **属性总览视图** | 全库属性列表、重命名属性 | 低-中 | [help/properties-view](https://obsidian.md/help/plugins/properties-view) |
| **标签总览视图** | 标签树 + 嵌套归属 | 低 | [help/tags-view](https://obsidian.md/help/plugins/tags-view) |

### 4.3 明确建议**不要抄**的部分

| 不抄的东西 | 原因 |
|---|---|
| **插件 API / 社区插件生态** | 这是 Obsidian 最大的护城河，也是最重的负债：一旦公开 API，**每个内部重构都变成破坏性变更**，且要维护版本兼容、安全沙箱（插件能读全库、能发网络请求）。**【推断】"格致"应把核心功能做扎实，插件系统延后到 v2 且只做受限的内部插件。** |
| **Obsidian Sync / Publish** | 需要账号体系、端到端加密、冲突解决、CDN、计费。与"本地优先的学习工具"定位冲突。**用 Git / 用户自己的网盘解决同步，不要自建。** |
| **Canvas（白板）** | 独立的大子系统（无限画布 + 节点 + 连线 + 嵌入笔记）。参考 [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw)（MIT，**133,336** stars）或 [tldraw/tldraw](https://github.com/tldraw/tldraw)（**注意：自定义商业许可，不是 MIT**，需仔细读 [LICENSE.md](https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md)）而不是自研。**建议 v1 不做。** |
| **"真"所见即所得 + Markdown 无损往返** | 数学上不成立（见 §4.1 第 8 项的推断）。承诺了就是给自己挖坑。 |
| **Excluded files（排除模式）** | 看似简单，但它要渗透进**搜索、图谱、反链、快速切换、Unlinked mentions** 每个子系统（官方文档里每一处都单独声明了这个行为）。**v1 建议只做 `.gezhiignore` 式的目录级排除，不做通配符模式。** |
| **移动端** | Obsidian 的 `workspace-mobile.json`、Ribbon 移动版、Navigation bar 都是一整套独立交互。**专注 Windows 桌面。** |

---

## 5. Vault 数据模型

### 5.1 Obsidian 的真实做法（已核实）

#### 5.1.1 vault 的本质

**【事实，[help/data-storage](https://obsidian.md/help/data-storage)】**：
- *"A vault is just a regular folder — including any subfolders — that you choose."* 笔记是 **Markdown 纯文本文件**。
- *"When you open a folder as a vault, Obsidian creates a `.obsidian` folder in the vault root."* → **vault 的判定标志就是根目录下的 `.obsidian/`**（这是**推断**，文档未用"marker"字样，但"打开文件夹即创建 `.obsidian`"是明确的机制描述；**Obsidian 没有顶层的 vault manifest 文件**，这一点为【推断】）。
- Obsidian **监听 vault 目录**，外部改动自动反映。
- **两条明确的禁令**【事实】：① **不要把一个 vault 建在另一个 vault 里**（内部链接是 vault 局部的，嵌套会导致链接解析错误）；② **不要把 vault 建在 Obsidian 的系统配置目录里**（会数据损坏/丢失）。

#### 5.1.2 `.obsidian/` 目录结构

**【事实，官方文档给出的表】**

| 文件/目录 | 作用 |
|---|---|
| `app.json` | **核心设置**（Core Obsidian settings） |
| `hotkeys.json` | **快捷键自定义** |
| `appearance.json` | **主题与外观设置** |
| `plugins/` | 已安装的**社区插件数据** |
| `themes/` | 已安装主题 |
| `snippets/` | 自定义 CSS 片段 |
| `workspace.json` | **当前工作区布局**（打开的标签、面板） |
| `workspaces.json` | **已保存的工作区布局** |

**官方给出的 Git 建议**【事实】：*"consider adding `.obsidian/workspace.json` and `.obsidian/workspaces.json` to your `.gitignore`. These files update every time you open a file, which creates noisy commits."*

→ **【推断】由此可推出一个通用的"该提交 / 该忽略"判据**：**描述"用户意图与内容"的文件提交（`app.json`、`hotkeys.json`、`appearance.json`、`templates/`、`snippets/`、`plugins/<id>/data.json`）；描述"会话状态"的文件忽略（`workspace.json`、`workspaces.json`、`cache/`）。**

**关于其它常见文件（`core-plugins.json`、`community-plugins.json`、`graph.json`、`backlink.json` 等）**：官方文档**没有**列出完整清单，但 `core-plugins.json` / `community-plugins.json` 与 Ribbon 文档中提到的 `workspace-mobile.json` 是【事实】存在的（后者在 [help/ribbon](https://obsidian.md/help/ribbon) 中明确出现："*it synchronizes ... when app settings (in the `workspace.json` and `workspace-mobile.json` files) are synchronized*"）。
**【未验证】**：`core-plugins-migration.json`、`graph.json`、`backlink.json`、`templates.json`、`daily-notes.json`、`bookmarks.json`、`canvas.json`、`snapshots/`、`cache/` 的具体结构与是否存在——这些来自社区观察而非官方文档，**本次未能通过一手来源核实**。若需要精确兼容 Obsidian 的配置格式（例如做"导入 Obsidian vault"功能），必须**实测一个真实 vault 目录**。

#### 5.1.3 全局配置目录与 `obsidian.json`（多库注册表）

**【事实，[help/data-storage](https://obsidian.md/help/data-storage)】**

| 平台 | 全局配置位置 |
|---|---|
| Windows | **`%APPDATA%\Obsidian\`** |
| macOS | `/Users/<user>/Library/Application Support/obsidian` |
| Linux | `$XDG_CONFIG_HOME/obsidian/` 或 `~/.config/obsidian/` |

**注意**：官方文档写 `%APPDATA%\Obsidian\`（首字母大写），而第三方文档与实测脚本中常见小写 `%APPDATA%\obsidian\`——**Windows 路径大小写不敏感，所以两者都能工作**，但写代码时**不要依赖大小写**。【推断】

**【事实，第三方来源】** `obsidian.json` 位于 `%APPDATA%\obsidian\obsidian.json`，记录**所有已知 vault**，并用 `"open": true` 标记**最后打开的 vault**。社区脚本正是通过删除 `"open":true` 来强制 Obsidian 启动时显示 vault 选择器：
- [DrSapling/Start-Obsidian-Vault-Manager · HOW-IT-WORKS.md](https://raw.githubusercontent.com/DrSapling/Start-Obsidian-Vault-Manager/main/README-resources/HOW-IT-WORKS.md)：*"Obsidian stores information about last visited Vault inside `obsidian.json` file in default install location `\AppData\Roaming\obsidian\obsidian.json` by adding `"open":true` next to last visited one."*
- [jaredrhod/ai-memory-vault · TROUBLESHOOTING.md](https://raw.githubusercontent.com/jaredrhod/ai-memory-vault/main/TROUBLESHOOTING.md)：*"Obsidian only opens vaults it knows about, and it learns about them from a registry file called `obsidian.json` (… Windows: `%APPDATA%\obsidian\obsidian.json` (lowercase folder) …)"*，并提示 *"Obsidian must be closed while it edits, because the app rewrites that file on quit."*

**【推断】`obsidian.json` 的形状**（结构本身**未验证**，以下为合理推测，仅供设计参考）：
一个以 vault ID 为键的对象，每个 vault 带 `path`、`ts`（时间戳）、可选的 `open` 标记。**这是"格致" `vaults.json` 设计时可以直接借鉴的模式**（见 §5.2.4）。

#### 5.1.4 多库切换

**【事实，[help/manage-vaults](https://obsidian.md/help/manage-vaults)】**：
- 首次打开时让用户 **Create new vault**（填名称 + Browse 选目录）或 **Open folder as vault**（选一个已有文件夹）。
- 切换通过 **Vault switcher**（Ribbon 第一个图标；移动端在左下/ribbon 里）。
- 每个 vault 有独立的 `.obsidian/`，因此**设置、插件、主题、快捷键都是 per-vault 的**；只有账号/全局外观在 `%APPDATA%\Obsidian\`。
- **【推断】** 每个 vault 可开独立窗口（"per-vault window"）——这在 Obsidian 中可观察，但本次**未从官方文档核实**，标记为【未验证】。

#### 5.1.5 元数据缓存（重要架构参考）

**【事实，[help/data-storage](https://obsidian.md/help/data-storage)】**：
- Obsidian 维护一个 **metadata cache**：*"a record of each file's properties, headings, tags, and links. This cache powers features like Graph view, Outline view, backlinks, and search."*
- **缓存存放位置是 IndexedDB**（浏览器级本地数据库），**不是 vault 里的文件**。
- 缓存**可自动重建**；失步时可从 **Settings → Files and links → Rebuild cache** 手动重建。
- 一个已知故障模式：Apple Lockdown Mode 开启且未排除 Obsidian 时，IndexedDB 写不进去，**每次启动都要全量重建索引**。

> **【推断】这是本节最有价值的一条**：Obsidian **把缓存放在 vault 之外的 IndexedDB**，而不是 vault 内的 `.obsidian/cache/`。这印证了 §5.2.5 的推荐结论：**派生缓存不应污染 vault 目录**。

### 5.2 格致推荐方案

#### 5.2.1 设计原则

1. **笔记文件是唯一真源**，且**必须能被 Obsidian / VS Code / Typora 直接打开**（用标准 `.md`、标准 YAML frontmatter、`[[wikilink]]` 语法与 Obsidian 兼容）。
2. **配置文件与缓存分离**：配置（用户意图）进 vault，缓存（可重建的派生数据）**出 vault**。
3. **默认位置在用户"文档"目录**，但**必须通过 Shell 已知文件夹 API 查询**，不能硬编码 `%USERPROFILE%\Documents`。
4. **支持多库**，注册表放在 `%APPDATA%\格致\`（沿用 Obsidian 的模式）。
5. **不制造"嵌套 vault"**：创建时检测所选目录是否已在另一个 vault 内。

> **⚠️ 关于"文档"目录的关键实现要求（必须写进技术方案）**：Windows 的 Documents 是 **known folder**，**用户可以把它的位置重定向**（右键属性 → 位置 → 移动），**OneDrive 也常会接管它**（变成 `%USERPROFILE%\OneDrive\文档`）。因此：
> - **正确做法**：调用 Shell 的 known-folder API 取真实路径。在 Electron 中即 `app.getPath('documents')`（底层走 SHGetKnownFolderPath）。**【推断】，需验证 Electron 版本行为。**
> - **错误做法**：拼接 `process.env.USERPROFILE + '\\Documents'`。
> - **额外注意**：若 Documents 被 OneDrive 接管，大 vault 会触发 **Files On-Demand** 把文件变成"仅在线"占位符，导致读取变慢或离线失败。**创建 vault 时应检测路径是否在 OneDrive 下并提示用户"始终保留在此设备上"。**【推断，来自 [ai-memory-vault TROUBLESHOOTING](https://raw.githubusercontent.com/jaredrhod/ai-memory-vault/main/TROUBLESHOOTING.md) 的经验描述】

#### 5.2.2 目录树

```
%USERPROFILE%\Documents\格致\          ← 默认库根目录（真实路径由 known-folder API 取得）
└── 我的学习库\                         ← 一个 vault（库）
    ├── .gezhi\                        ← 【配置目录，对标 .obsidian】
    │   ├── vault.json                 ← 库身份与版本（id / name / schemaVersion / createdAt）
    │   ├── app.json                   ← 应用设置（编辑器、文件与链接、搜索行为）
    │   ├── appearance.json            ← 主题、字号、CSS 变量
    │   ├── core-plugins.json          ← 核心插件开关
    │   ├── graph.json                 ← 图谱视图设置（Filters / Groups / Display / Forces）
    │   ├── workspace.json             ← 当前工作区布局（标签、面板、ribbon、侧栏）※ 建议 gitignore
    │   ├── workspaces.json            ← 已保存的布局 ※ 建议 gitignore
    │   ├── hotkeys.json               ← 快捷键自定义
    │   ├── templates\                 ← 模板文件（可被用户编辑）
    │   │   └── 读书笔记.md
    │   ├── snippets\                  ← 自定义 CSS 片段
    │   └── plugins\                   ← 【预留】内部插件；v1 可为空
    │
    ├── 笔记\                          ← 默认新笔记落点（可在 app.json 改）
    │   ├── 学习法\
    │   │   ├── 费曼技巧.md
    │   │   └── 间隔重复.md
    │   ├── 读书\
    │   │   └── 《刻意练习》.md
    │   └── 索引.md                    ← 首页 / MOC（Map of Content）
    │
    ├── 附件\                          ← 图片、PDF、音频；按 YYYY/MM 分子目录避免单目录过大
    │   └── 2026\10\
    │       └── 20261001-143022-图谱截图.png
    │
    ├── .trash\                        ← 删除的笔记（软删除），对标 Obsidian 的回收站
    └── .gitignore                     ← 可选：忽略 workspace.json 等会话态文件
```

**说明与取舍**

- **为什么叫 `.gezhi` 而不是复用 `.obsidian`**：复用会让"格致"和 Obsidian 互相覆盖对方不认识的键，且一旦格式漂移就会损坏用户配置。**但要让用户能一眼看出对应关系**，所以采用同构的命名（`app.json` / `appearance.json` / `graph.json` / `workspace.json` / `hotkeys.json`）。**【推断】**
- **为什么笔记放在 `笔记\` 子目录而不是 vault 根**：给 `附件\`、`.trash\`、未来的 `模板\` 留出同级位置，避免根目录与用户自己的文件混在一起。
- **附件文件名规范化**：用 `YYYYMMDD-HHmmss-<原文件名 slug>.<ext>`，既不丢可读性，又避免重名覆盖与中文文件名在不同文件系统上的编码问题。【推断】
- **vault 根不放任何"格致专有"的可见文件**（除了 `.gezhi/` 与 `.trash/` 两个点目录），保证"用别的工具打开这个文件夹"时看到的就是一堆正常的 Markdown。

#### 5.2.3 `.gezhi/vault.json`

```json
{
  "schemaVersion": 1,
  "id": "0f3a7c2e-9b41-4d8a-b6f2-1c5e8d7a3b90",
  "name": "我的学习库",
  "createdAt": "2026-10-01T05:12:33.000Z",
  "createdBy": "格致 0.1.0",
  "notesFolder": "笔记",
  "attachmentsFolder": "附件",
  "trashFolder": ".trash",
  "attachmentNamePattern": "{yyyy}{MM}{dd}-{HH}{mm}{ss}-{slug}",
  "newNoteLocation": "笔记",
  "linkFormat": "wikilink",
  "attachmentLinkFormat": "wikilink",
  "useMarkdownLinks": false,
  "showUnsupportedFiles": false
}
```

| 字段 | 作用 | 备注 |
|---|---|---|
| `schemaVersion` | 配置格式版本，用于未来的迁移 | **必须最先读**，决定后续解析逻辑 |
| `id` | 库的稳定 UUID，与 `vaults.json` 对应 | **不要用路径做 ID**——用户会移动库 |
| `notesFolder` / `attachmentsFolder` / `trashFolder` | 目录约定 | 存**相对路径**，不存绝对路径 |
| `linkFormat` | 生成链接时用 `[[wikilink]]` 还是 `[md](md)` | 对标 Obsidian 的 `useMarkdownLinks`。【推断】Obsidian 对应设置的确切键名**未验证** |
| `newNoteLocation` | 新建笔记落点 | 对标 Obsidian 的 "Default location for new notes"【事实：[help/settings](https://obsidian.md/help/settings) 有此设置项】 |

#### 5.2.4 App 级库注册表 `%APPDATA%\格致\vaults.json`

```json
{
  "schemaVersion": 1,
  "lastOpenedVaultId": "0f3a7c2e-9b41-4d8a-b6f2-1c5e8d7a3b90",
  "vaults": [
    {
      "id": "0f3a7c2e-9b41-4d8a-b6f2-1c5e8d7a3b90",
      "name": "我的学习库",
      "path": "C:\\Users\\LINKIT\\Documents\\格致\\我的学习库",
      "lastOpenedAt": "2026-10-01T05:12:33.000Z",
      "pinned": true
    },
    {
      "id": "b71d4e88-2a6c-45f1-9e30-7d2b8c4a5f16",
      "name": "课程笔记",
      "path": "D:\\Study\\课程笔记",
      "lastOpenedAt": "2026-09-18T11:02:07.000Z",
      "pinned": false
    }
  ]
}
```

**设计要点**【推断】：
- `lastOpenedVaultId` 对标 Obsidian 的 `"open": true` 机制，但用**显式 ID 字段**而非"在某个对象上加标记"——后者在多个 vault 同时打开时会歧义。
- **启动时的健壮性检查（必备）**：逐个 vault 校验 ① 路径是否存在 ② 路径下是否有 `.gezhi/vault.json` ③ `id` 是否与注册表一致。任一项失败 → 标记为"缺失"，**提示用户定位或移除**，绝不静默删除（用户可能只是把移动硬盘拔了）。
- **路径变更**：如果用户移动了 vault 文件夹，`id` 不变但 `path` 失效 → 提供"重新定位库"功能，按 `id` 重新绑定。**这正是用 UUID 而不是路径当 ID 的价值。**

#### 5.2.5 Vault 级 `app.json`

```json
{
  "schemaVersion": 1,
  "editor": {
    "defaultViewMode": "livePreview",
    "defaultEditingMode": "livePreview",
    "showLineNumbers": false,
    "readableLineLength": true,
    "strictLineBreaks": false,
    "autoPairBrackets": true,
    "autoPairMarkdown": true,
    "smartLists": true,
    "indentUsingTabs": false,
    "indentVisualWidth": 4,
    "propertiesInDocument": "visible",
    "showEditingModeInStatusBar": true,
    "vimMode": false,
    "spellcheck": true,
    "spellcheckLanguages": ["zh-CN", "en-US"]
  },
  "filesAndLinks": {
    "newNoteLocation": "笔记",
    "attachmentFolderPath": "附件",
    "useMarkdownLinks": false,
    "newLinkFormat": "shortest",
    "automaticallyUpdateInternalLinks": true,
    "detectAllFileExtensions": false,
    "excludedFolders": [".trash", ".gezhi"],
    "excludedPatterns": [],
    "rebuildCacheOnStartup": false
  },
  "search": {
    "showMoreContext": false,
    "collapseResults": true
  },
  "quickSwitcher": {
    "showExistingOnly": true,
    "showAttachments": false
  },
  "backlinks": {
    "showLinkedMentions": true,
    "showUnlinkedMentions": true,
    "collapseResults": false,
    "showMoreContext": false,
    "sortOrder": "modified-desc",
    "backlinkInDocument": false,
    "searchFilter": ""
  },
  "appearance": {
    "baseTheme": "dark",
    "accentColor": "#7c5cff",
    "interfaceFontSize": 15,
    "textFontSize": 16,
    "translucency": false
  }
}
```

**⚠️ 与 Obsidian 的设置兼容性**【事实，[help/settings](https://obsidian.md/help/settings)】：Obsidian 的 Editor 设置里确实存在 `Default view for new tabs`、`Default editing mode`、`Readable line length`、`Strict line breaks`、`Properties in document`、`Show line numbers`、`Show indentation guides`、`Auto-pair brackets`、`Auto-pair Markdown syntax`、`Smart lists`、`Indent using tabs`、`Indent visual width`、`Vim key bindings`、`Spellcheck`、`Spellcheck languages`、`Convert pasted HTML to Markdown`、`Fold heading`、`Fold indent`、`Right-to-left`、`Always focus new tabs`、`Show editing mode in status bar`、`Notify if startup takes longer than expected` 等项，以及 Files and links 下的 `Default location for new notes`。**上面 JSON 里的键名是"格致"自己设计的，不保证与 Obsidian 的 `app.json` 键名一致**（Obsidian 的 `app.json` 键名**未验证**）。若要做 Obsidian 导入功能，必须**实测一份真实 `app.json`**。

#### 5.2.6 `.gezhi/graph.json`（对标 Obsidian Graph view 设置）

**【事实】分组依据**：Obsidian 官方 Graph view 文档给出 Filters / Groups / Display / Forces 四个分组与各自设置项（§3.6 已列）。下面的 JSON 把那些设置**逐项映射为字段**：

```json
{
  "schemaVersion": 1,
  "filters": {
    "searchQuery": "",
    "showTags": false,
    "showAttachments": false,
    "existingFilesOnly": true,
    "showOrphans": true
  },
  "groups": [
    { "id": "g1", "query": "path:学习法", "color": "#7c5cff" },
    { "id": "g2", "query": "tag:#读书", "color": "#22c55e" },
    { "id": "g3", "query": "tag:#待整理", "color": "#f59e0b" }
  ],
  "display": {
    "showArrows": false,
    "textFadeThreshold": 0.35,
    "nodeSize": 1.0,
    "linkThickness": 1.0
  },
  "forces": {
    "centerForce": 0.5,
    "repelForce": 10.0,
    "linkForce": 1.0,
    "linkDistance": 30.0
  },
  "localGraph": {
    "depth": 2
  },
  "colorSlots": {
    "fill": "#9ca3af",
    "fillFocused": "#7c5cff",
    "fillTag": "#22c55e",
    "fillAttachment": "#38bdf8",
    "fillUnresolved": "transparent",
    "fillHighlight": "#ffffff",
    "circle": "#1f2937",
    "line": "#4b5563",
    "lineHighlight": "#7c5cff",
    "arrow": "#4b5563",
    "text": "#e5e7eb"
  }
}
```

- `colorSlots` 的 11 个槽位**直接对应 §3.1 核实的 Obsidian CSS 类**（`color-fill` / `color-fill-focused` / `color-fill-tag` / `color-fill-attachment` / `color-fill-unresolved` / `color-fill-highlight` / `color-circle` / `color-line` / `color-line-highlight` / `color-arrow` / `color-text`）。**把这 11 个槽位定义清楚，图谱的渲染层与主题层才能解耦。**
- `forces` 的四个字段**逐一对应** Obsidian 的 Center force / Repel force / Link force / Link distance（§3.6【事实】），也因此**可以直接映射到 `d3-force` 的 `forceCenter` / `forceManyBody` / `forceLink.strength` / `forceLink.distance`**（§3.4 推荐的技术依据）。
- `textFadeThreshold` 用**归一化缩放值**（0–1）而非像素阈值，避免不同 DPI 下行为不一致。【推断】

#### 5.2.7 `.gezhi/workspace.json`

```json
{
  "schemaVersion": 1,
  "activeTabGroupId": "tg-main",
  "ribbon": {
    "visible": true,
    "items": [
      { "id": "vault-switcher", "visible": true },
      { "id": "quick-switcher", "visible": true },
      { "id": "graph-global", "visible": true },
      { "id": "graph-local", "visible": true },
      { "id": "search", "visible": true },
      { "id": "settings", "visible": true }
    ]
  },
  "sidebar": {
    "left": {
      "collapsed": false,
      "width": 260,
      "tabGroups": [
        {
          "activeTabId": "t-files",
          "tabs": [{ "id": "t-files", "type": "file-explorer", "pinned": true }]
        },
        {
          "activeTabId": "t-search",
          "tabs": [
            { "id": "t-search", "type": "search", "pinned": false },
            { "id": "t-tags", "type": "tags-view", "pinned": false }
          ]
        }
      ]
    },
    "right": {
      "collapsed": false,
      "width": 320,
      "tabGroups": [
        {
          "activeTabId": "t-backlinks",
          "tabs": [
            { "id": "t-backlinks", "type": "backlinks", "followActiveNote": true, "pinned": false },
            { "id": "t-outline", "type": "outline", "followActiveNote": true, "pinned": false },
            { "id": "t-links-locked", "type": "backlinks", "followActiveNote": false, "lockedNotePath": "笔记/索引.md", "pinned": true }
          ]
        }
      ]
    }
  },
  "mainTabGroups": [
    {
      "id": "tg-main",
      "direction": "horizontal",
      "size": 0.65,
      "activeTabId": "tab-1",
      "tabs": [
        { "id": "tab-1", "type": "markdown", "path": "笔记/索引.md", "viewMode": "livePreview", "pinned": true },
        { "id": "tab-2", "type": "graph", "scope": "global" }
      ]
    },
    {
      "id": "tg-side",
      "direction": "horizontal",
      "size": 0.35,
      "activeTabId": "tab-3",
      "tabs": [
        { "id": "tab-3", "type": "graph", "scope": "local", "depth": 2 }
      ]
    }
  ],
  "statusBar": { "showEditingMode": true, "showWordCount": true },
  "recentFiles": ["笔记/索引.md", "笔记/学习法/费曼技巧.md"]
}
```

**关键设计点**【推断】：
- **`followActiveNote` + `lockedNotePath` 两个字段就是 Backlinks 的"跟随 / 锁定"语义**（§4.1 第 4 项【事实】的 Obsidian 行为）。**这个布尔量必须在数据模型里显式存在**，否则 UI 无法正确表达"这个反链面板是不是钉住的"。这是最容易漏掉的一处。
- **布局用递归的 tab group 树**（`direction` + `size` + 子组），而不是扁平的坐标。这样"Split right/down"就是一次树插入，序列化也自然。
- **`recentFiles` 放 workspace 而非 vault 级配置**——它是会话态，应随 `workspace.json` 被 gitignore。

#### 5.2.8 索引 / 缓存设计

**【事实】Obsidian 的选择**：metadata cache 存 **IndexedDB**（浏览器级），**不在 vault 里**，可自动重建，可手动 Rebuild。

**【推断】"格致"的对应设计**：

**存放位置的推荐：分层，默认放 `%APPDATA%\格致\cache\<vaultId>\`**

| 方案 | 优点 | 缺点 | 建议 |
|---|---|---|---|
| A. 放 vault 内 `.gezhi/index/` | 随 vault 一起移动/备份，多机同步时缓存也同步 | **污染 vault 目录**（虽然 `.gezhi` 已是点目录）；若用户用 Git/网盘同步，缓存文件会造成冲突与噪音；缓存可能很大 | ✗ |
| B. 放 `%APPDATA%\格致\cache\<vaultId>\` | vault 保持干净；缓存大小不受用户同步工具影响；**用 `vaultId` 做目录名，天然支持 vault 移动后缓存不失效** | vault 移动到另一台机器后缓存要重建（可接受，本就是派生物） | ✅ **推荐** |
| C. 放 IndexedDB（学 Obsidian） | 零文件管理，事务性好 | Electron 中 IndexedDB 与主进程的文件监听协作较绕；调试困难；不易做"重建缓存"以外的手动修复 | △ 可用，但不如 B 直观 |

> **⚠️ 硬约束**：**无论选 B 还是 C，缓存都绝不能放在笔记目录里。**理由有三：① 用户可能用 Git 或网盘同步 vault，缓存文件会造成冲突与巨量噪音；② 缓存是**可重建的派生物**，把它放进"用户数据"目录会破坏"vault 就是一堆 Markdown"这个产品承诺；③ Obsidian 已经用 IndexedDB 给出了同样的答案（【事实】）。

**缓存内容与增量策略**

原则：**用内容 hash 做失效判据，只重解析变更的文件。**

```
%APPDATA%\格致\cache\<vaultId>\
├── index.json          ← 全局索引（见下）
└── files\
    └── <pathHash>.json ← 单文件解析产物（或把全部塞进 index.json，按规模决定）
```

单文件记录至少应包含：

| 字段 | 用途 |
|---|---|
| `path`（vault 内相对路径，正斜杠归一化） | 主键 |
| `contentHash`（如 xxhash/SHA-1） | **失效判据**：hash 未变则复用，不重解析 |
| `mtime` / `size` | **快速预筛**：先比 mtime+size，相同则跳过读取与 hash 计算 |
| `parsedAt` / `parserVersion` | `parserVersion` 变更时**强制全量重解析**（改了 wikilink 语法就必须全量重建，否则新旧解析结果混在一起） |
| `frontmatter`（原始 YAML 文本 + 解析后的对象） | 属性面板、属性搜索、`[prop:value]` 查询 |
| `propertyTypes` | 全局属性类型注册表（Obsidian 的类型是 vault 级全局的，§4.1 第 9 项【事实】） |
| `aliases[]` | 快速切换与 Unlinked mentions 的主串 |
| `tags[]`（含嵌套结构） | 标签树、`tag:` 搜索、图谱 tag 节点 |
| `headings[]`（层级 + 行号 + 偏移） | 大纲视图、`section:` 搜索、`[[#标题]]` 锚点补全 |
| `blocks[]`（`^block-id` → 偏移） | `[[^^块引用]]` |
| `linksOut[]`（`{target, alias, isEmbed, line, col, resolved}`） | **图谱出边、Outgoing links** |
| `linkTextOccurrences[]`（纯文本中出现的"其它笔记名"位置）| **Unlinked mentions 的倒排索引来源** |
| `wordCount` / `taskCounts` | 状态栏、`task:` 搜索 |

配套的**反向索引**（可在内存中构建、可持久化）：
- `targetPath → Set<sourcePath>`：**反链查询**、图谱入边、局部图谱的 N-hop 扩展。**这是最关键的索引**，没有它每次查反链都要全库扫描。
- `tag → Set<path>`（含父标签聚合，因为"`tag:inbox` 匹配 `#inbox/to-read`"）
- `alias/name → Set<path>`：快速切换与 Unlinked mentions
- `propertyName → Set<path>`、`(property, value) → Set<path>`：属性搜索

**重建性能的关键**（这一条决定了图谱与反链能不能"秒开"）：
1. **启动时先读缓存，立刻可用**；后台再对 mtime/size 变化的文件做增量校验。
2. **只在内容 hash 变化时重解析**——重命名文件、切换标签页都不触发重解析。
3. **索引构建必须可中断、可分批**：几千文件的全量重建应分片让出主线程/放在 worker，并在 UI 上显示进度（对标 Obsidian 的 Rebuild cache）。
4. **`parserVersion` 是必需品**，不是可选项：wikilink 语法只要改一次（比如支持 `![[嵌入#标题]]`），旧缓存就是错的，必须能一键全量重建。

---

## 6. 可参考的开源项目

### 6.1 总览表（License 与活跃度均已核实）

| 项目 | 仓库 | License | Stars | 技术栈（语言，已核实） | 最后推送 | 整体 fork？ |
|---|---|---|---|---|---|---|
| **Foam** | [foambubble/foam](https://github.com/foambubble/foam) | **MIT** | **17,431** | **TypeScript**（VS Code 扩展） | 2026-09-30 | ❌ 不是同一形态 |
| **Dendron** | [dendronhq/dendron](https://github.com/dendronhq/dendron) | **Apache-2.0** | **7,473** | **TypeScript**（VS Code 扩展） | **2025-11-13** ⚠️ | ❌ 形态不符 + 已停滞 |
| **Logseq** | [logseq/logseq](https://github.com/logseq/logseq) | **AGPL-3.0** | **45,099** | **Clojure/ClojureScript** | 2026-10-01 | ❌ 语言与技术栈完全不同 |
| **AppFlowy** | [AppFlowy-IO/AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) | **AGPL-3.0** | **77,038** | **Dart / Flutter** | 2026-10-01 | ❌ 必须换语言 |
| **Anytype** | [anyproto/anytype-ts](https://github.com/anyproto/anytype-ts)（桌面） | **Any Source Available License 1.0** ⚠️ | **8,871** | **TypeScript** | 2026-09-30 | ❌ 不是开源许可 |
| **Joplin** | [laurent22/joplin](https://github.com/laurent22/joplin) | **MIT** | **56,547** | **TypeScript**（Electron） | 2026-10-01 | ⚠️ 技术栈最接近，但数据模型完全不同 |
| **Trilium** | [zadam/trilium](https://github.com/zadam/trilium) | **AGPL-3.0** | **38,108** | （未核实语言字段） | — | ❌ 非 Markdown 真源 |
| **TriliumNext**（活跃分支） | [TriliumNext/Notes](https://github.com/TriliumNext/Notes) | **AGPL-3.0**（核实 `LICENSE`） | **2,926** | （未核实） | 活跃 | ❌ 同上 |
| **Notesnook** | [streetwriters/notesnook](https://github.com/streetwriters/notesnook) | **GPL-3.0** | **14,706** | **TypeScript** | 2026-09-30 | ❌ 数据模型不符 |
| **SilverBullet** | [silverbulletmd/silverbullet](https://github.com/silverbulletmd/silverbullet) | **MIT** | **6,189** | **TypeScript** | 2026-09-30 | ⚠️ 设计可抄，架构不可 fork |
| **思源 SiYuan** | [siyuan-note/siyuan](https://github.com/siyuan-note/siyuan) | **AGPL-3.0** | **46,587** | **TypeScript** | 2026-10-01 | ❌ 非 Markdown 真源 |
| **AFFiNE** | [toeverything/AFFiNE](https://github.com/toeverything/AFFiNE) | **MIT + 目录级例外**（`packages/backend`、`packages/common/native` 另有许可） | **73,142** | **TypeScript** | 2026-09-30 | ❌ 数据模型不符 |
| **MarkText** | [marktext/marktext](https://github.com/marktext/marktext) | **MIT** | **62,008** | **TypeScript**（Electron） | 2026-10-01 | ⚠️ **最值得抄的编辑器 UI 参考** |

### 6.2 逐项判断：整体 fork vs 只抄设计

#### ❌ 整体 fork —— **没有一个是合适的**

**为什么全部否决**，按否决理由分类：

**(a) 语言/形态根本不同，fork 等于重写**
- **Logseq**（Clojure/ClojureScript）、**AppFlowy**（Dart/Flutter）。这不是"改造成本高"的问题，是**技术栈不相容**：你无法把 ClojureScript 的编辑器内核放进 React 19 应用。**唯一可抄的是交互设计与 outliner 的数据模型。**

**(b) 数据模型与"Markdown 文件是唯一真源"冲突**
- **Joplin**：MIT + TypeScript + Electron，看起来最像，**但它的真源是 SQLite 数据库**，Markdown 文件是导出物/同步物，不是工作对象。**【推断】** 要 fork 成"文件即真源"，等于把它的存储层整个换掉——那还不如不要它。
- **Trilium / TriliumNext**：树形笔记 + 属性继承，**数据存在 SQLite**（不是 Markdown 文件）。它的"笔记树 + 属性 + 脚本"模型与"文件夹 + Markdown + frontmatter"是两套世界观。
- **思源 SiYuan**：**JSON 块存储**（`.sy` 文件），不是 Markdown 真源。它的块引用/块 ID 体系很值得抄（见下），但架构不可复用。
- **Anytype**：对象图 + 自有协议（any-sync），本地存储是私有格式。**且 License 是 "Any Source Available License 1.0"（已核实），不是 OSI 开源许可**——法务上必须谨慎，读代码学习可以，复制代码前必须确认条款。
- **AFFiNE**：**BlockSuite + Yjs CRDT** 为真源，Markdown 是导入导出格式。**它的 License 是分目录的**（已核实）——`packages/backend` 和 `packages/common/native` 不在 MIT 之下，**不能整体当 MIT 用**。

**(c) License 阻止 fork**
- **AGPL-3.0**（Logseq、AppFlowy、Trilium/TriliumNext、思源）：AGPL 的**网络服务条款**意味着如果你把 fork 版做成任何形式的网络服务，必须开源全部源码。对一个**闭源或未来可能商业化的桌面教育产品**，这是不可接受的传染性风险。**【推断】即便只是"参考代码"也要小心：AGPL 项目里抄大段实现同样有风险。**
- **GPL-3.0**（Notesnook）：同样是强 copyleft。
- **tldraw**（若考虑做白板）：**自定义商业许可，已核实原文**——*"Not to use the Software in Production Environments"*，且不得绕过 License Key 校验。**生产环境使用必须购买商业许可。**

**(d) 成熟度不足**
- **Dendron**：最后推送 **2025-11-13**，已近一年无活动，**应视为停止维护**。且它是 VS Code 扩展，不是独立桌面应用。

#### ✅ 只抄设计（推荐）—— 按可借鉴价值排序

**1. MarkText —— 抄编辑器与"打字机模式"的 UI/UX**【推断，本项目内最高性价比】
- 为什么：**MIT + TypeScript + Electron**，与本项目技术栈几乎完全一致，且是**成熟的 Markdown 编辑器**（不是 PKM）。它解决的正是"Electron 里做 Markdown 编辑体验"这个具体问题：所见即所得/源码双模式、打字机模式、焦点模式、实时预览、图片粘贴与上传、主题系统。
- **看什么**：编辑器装饰逻辑（它用 `muya` 引擎而非 CodeMirror）、状态栏、侧栏搜索、导出管线（PDF/HTML）、以及它如何处理中文输入。
- **不抄什么**：它是**单文件编辑器**，没有 vault / 图谱 / 双链 —— 这些正是"格致"要自己建的部分。**注意**：它的维护节奏比 CM6 慢，作为**参考而非依赖**。

**2. SilverBullet —— 抄"文件即数据库"的索引与查询设计**
- 为什么：**MIT + TypeScript**，明确以 **Markdown 文件为唯一真源**，且有 Lua 脚本化查询。它的**索引器**（扫描 vault 提取 page / link / tag / task / item 并建内存索引）与"格致"要做的事**完全同构**，可以直接读它的索引设计来验证 §5.2.8 的方案。
- **看什么**：索引的数据结构与失效策略、page 名称解析（`[[Page Name]]` → 文件路径的解析规则，包含大小写与路径歧义的处理）、`$query` 语法与 Obsidian 搜索语法的对应关系。
- **不抄什么**：它是**服务器 + 浏览器**架构（跑一个本地 HTTP 服务），不是 Electron 桌面应用；编辑器体验也不是它的重点。

**3. Foam —— 抄"链接解析"与 VS Code 内的图谱实现**
- 为什么：**MIT + TypeScript**，是**最纯粹的"Markdown + wikilink + 图谱"实现之一**，且长期活跃（2026-09-30 仍在推送）。**它用 remark 生态做解析**，对本项目 §2 的"索引路径"选型是最好的活教材——直接看它如何处理 wikilink 解析、附件链接、以及在有限 UI 能力（VS Code Webview）下渲染图谱。
- **看什么**：`@foam/core` 的解析与链接解析逻辑、图谱的布局与渲染选型、tag 与 frontmatter 的处理。
- **不抄什么**：宿主是 VS Code，UI 层完全不可复用；它没有独立的窗口/标签系统。

**4. 思源 SiYuan —— 抄"块级 ID 与块引用"的产品设计**
- 为什么：**它的块引用（block reference）与块级属性是同类产品里做得最彻底的**，中文社区反馈也最充分。
- **看什么**：块 ID 的生成与稳定性、块引用的反向链接呈现、`((块ID))` 的补全交互、以及它在大文档下的性能处理。
- **特别看**：**它如何用中文做全文搜索与分词**（Obsidian 对中文分词的支持较弱，思源作为中文项目在这块有积累）。**【推断】**
- **不抄什么**：AGPL + JSON 块存储，一律不碰代码。

**5. Joplin —— 抄"Electron 桌面应用的工程化"**
- 为什么：**MIT + TypeScript + Electron**，是**同类项目中工程化最成熟、最长期维护的桌面应用**（多端同步、加密、插件系统、自动更新、崩溃恢复）。
- **看什么**：Electron 主进程/渲染进程的 IPC 设计、文件与数据库操作的错误处理、自动更新与代码签名、插件沙箱、以及**它在 Windows 上的路径与文件锁处理**。
- **不抄什么**：数据层（SQLite 真源）、同步协议。

**6. logseq / AppFlowy / AFFiNE / Anytype —— 抄交互与视觉**
- 抄它们的**块级拖拽、斜杠命令菜单、数据库视图（table/board）、以及"每日笔记 + 日志流"的入口设计**。
- **一律不抄代码**（理由见 §6.2 的 License 与数据模型部分）。

### 6.3 一张决策表

| 你的目的 | 该看谁 |
|---|---|
| 编辑器 UI/UX、打字机模式、导出 | **MarkText**（MIT，可读代码） |
| vault 索引器、page 解析、查询语言 | **SilverBullet**（MIT，可读代码） |
| wikilink 解析、remark 生态用法、图谱实现 | **Foam**（MIT，可读代码） |
| 块引用 / 块 ID / 中文搜索 | **思源**（AGPL，**只读设计，不抄代码**） |
| Electron 工程化 / IPC / 自动更新 / 插件沙箱 | **Joplin**（MIT，可读代码） |
| 布局引擎的具体库 | **dockview**（MIT，直接依赖，见 §4.1 第 3 项） |
| 交互与视觉灵感 | logseq / Anytype / AFFiNE（**只读，不抄代码**） |

> **⚠️ 一条法务提醒**【推断】，非法律意见：**MIT / Apache-2.0 项目可以读代码并借鉴实现（保留版权声明的前提下）；AGPL / GPL 项目即使只抄大段实现也有 copyleft 风险；tldraw 与 Anytype 的自定义许可必须逐条读原文再决定。**在正式立项前建议让法务过一遍上述清单。

---

## 7. 一句话建议

**编辑器选型**：**CodeMirror 6**（`@codemirror/view` + `@lezer/markdown`，MIT）——它是唯一有大规模生产验证的 Live Preview 基座，中文 IME 的 composition issue 全部已修复且仍在持续跟踪，且"纯文本为真源"零往返损耗；代价是 Live Preview 的 decoration、wikilink 原子化与自动补全要自己写（预算 2–4 人月），备选 **Milkdown**（要开箱所见即所得时）与 **Vditor**（只用于第 1 周对齐全 Preview 手感后丢弃）。

**图谱选型**：**`d3-force`（Web Worker 内布局）+ 自研分层 Canvas 2D 渲染**——Obsidian 的图谱本身就是自研 Canvas+WebGL，而 Obsidian 图谱设置里的 Center/Repel/Link/Link distance 四个旋钮可**直接映射** `forceCenter`/`forceManyBody`/`forceLink.strength`/`forceLink.distance`，"标签随缩放淡出"与"时间流逝动画"在任何现成库里都没有等价物、横竖都要自己写；**若团队图形经验不足或要 2 周出成品，改选 Cytoscape.js（功能全）或 AntV G6（中文文档最省事）；若 vault 会到 2 万+ 节点，改选 sigma.js + graphology（WebGL + 事件驱动增量）**。

**库目录结构**：**`<系统"文档"已知文件夹>\格致\<库名>\`**，配置进 vault 内的 **`.gezhi/`**（同构于 `.obsidian/`：`vault.json` 存 UUID 与 schemaVersion、`app.json` / `appearance.json` / `core-plugins.json` / `graph.json` / `workspace.json` / `hotkeys.json` / `templates/` / `snippets/`），笔记放 `笔记\`、附件放 `附件\`、软删除放 `.trash\`；**索引缓存绝不放进 vault，放 `%APPDATA%\格致\cache\<vaultId>\`**，多库注册表放 `%APPDATA%\格致\vaults.json`——**取"文档"目录必须用 Shell known-folder API（Electron `app.getPath('documents')`），不可硬编码 `%USERPROFILE%\Documents`**，因为该目录可被用户重定向、也常被 OneDrive 接管。

---

## 附录 A：本次调研的核实边界（诚实清单）

**已核实（有 URL 支撑）**
- 全部 GitHub 仓库 URL 可解析；全部 star 数、License、维护时间点均来自 GitHub API 或仓库页面（2026-10-01）。
- 全部 npm 包版本与发版日期来自 `registry.npmjs.org`。
- 全部 Obsidian 行为描述来自官方帮助文档仓库 `obsidianmd/obsidian-help` 的 Markdown 源文件或官方文档站镜像。
- 全部 IME issue 的编号、标题、状态来自 GitHub Search API 逐仓库检索。
- Obsidian 图谱使用 **Canvas + WebGL** —— 来自官方社区文档原文。
- tldraw 的"禁止生产环境使用"、Anytype 的 "Any Source Available License 1.0"、AFFiNE 的目录级许可分割、TriliumNext 的 AGPL-3.0 —— 均来自各自 `LICENSE` 文件原文。

**未验证（需 PoC 或实测）**
1. **本报告没有任何实测性能数据。** 全部"几千节点是否流畅"的判断都是基于渲染后端与 issue 记录的**【推断】**。§3.7 的基准必须自己跑。
2. `core-plugins.json` / `graph.json` / `backlink.json` / `templates.json` / `daily-notes.json` / `bookmarks.json` / `canvas.json` / `snapshots/` / `cache/` 的**真实结构与键名**——官方文档未列出，本次未找到一手来源。**如需 Obsidian 导入功能，必须实测一份真实 vault。**
3. `obsidian.json` 的**实际 JSON 形状**——只核实了它的路径与 `"open": true` 标记的存在（第三方来源），结构本身未验证。
4. Obsidian 的 `app.json` / `graph.json` 等文件的**具体键名**——"格致"的 JSON 示例是自设计的，不保证与 Obsidian 一致。
5. Obsidian 每个 vault 是否可开独立窗口（per-vault window）。
6. `dockview`、`cmdk`、`react-arborist`、`react-cytoscapejs`、`react-graph-vis` 等库对 **React 19** 的兼容性——**全部未验证**。React 19 的 StrictMode 双挂载对命令式图形库是常见坑，必须逐个 PoC。
7. `ninja-keys` 的 star 数（未能取到）。
8. `rc-dock` 的 star 数（页面抓取失败）。
9. `vis-network` 的双许可（Apache-2.0 OR MIT）在实际使用中如何选择——两个 LICENSE 文件都在仓库中，但未找到官方的选择说明。
10. Electron `app.getPath('documents')` 是否在所有情况下都正确返回被重定向的"文档"已知文件夹。
11. 中文 IME 在 Electron/Chromium 下与系统输入法（微软拼音、搜狗、微信输入法）的具体交互差异——必须在目标机器上实测。

**已知的调研方法局限**
- 本次环境中 `github.com` 页面抓取可用但 GitHub **core API 匿名限流为 60 次/小时且已耗尽**，因此部分仓库元数据改用页面 HTML 抓取或 search API 获取；个别字段（语言、精确推送时间）在两种来源间可能有一致性差异。
- `web_fetch` 工具对 `github.com` 与 `raw.githubusercontent.com` 返回"非公网 IP"错误，故 GitHub 相关内容全部改用 `pwsh` + `Invoke-WebRequest` 获取。这不影响数据真实性，但说明工具链存在环境限制。

**统一澄清：报告采用的时间基准**
- 本报告所有"截至"均指 **2026-10-01**（系统日期），所有 GitHub/npm 数据均在该日采集。


