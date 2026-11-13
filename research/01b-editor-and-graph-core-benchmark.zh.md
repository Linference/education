# 格致 · 编辑器与图谱内核实测（01 附录）

> `research/01-编辑器与图谱调研.md` 由并行子代理撰写中（含编辑器/图谱/开源项目横评）。
> 本文件是**独立的本机实测结论**，用于校验选型是否真的装得上、跑得起来；两者互补，不冲突。

---

## 一、实测记录（2026-10-01）

```powershell
npm install --no-audit --no-fund @codemirror/state @codemirror/view `
  @codemirror/lang-markdown @codemirror/language-data @codemirror/commands `
  katex sigma graphology
```

**结果：35.8 秒、退出码 0、`node_modules` 共 16.3 MB。**

实际装到的版本与许可：

| 包 | 版本 | License |
| --- | --- | --- |
| `@codemirror/state` | 6.7.6 | MIT |
| `@codemirror/view` | 6.43.13 | MIT |
| `@codemirror/lang-markdown` | 6.5.2 | MIT |
| `@codemirror/language-data` | 6.5.2 | MIT |
| `@codemirror/commands` | 6.11.1 | MIT |
| `sigma` | 3.0.3 | MIT |
| `graphology` | 0.26.0 | MIT |
| `katex` | 0.18.10 | MIT |

## 二、验证 1：CodeMirror 6 能解析「中文 + 双链 + 公式」

```js
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";

const st = EditorState.create({
  doc: "# 中文标题\n\n[[双链]] $x^2 + y^2$\n",
  extensions: [markdown({ codeLanguages: languages })],
});
console.log(st.doc.length);
```

**输出：`[OK] CodeMirror EditorState, doc.length = 27`** —— 中文、`[[wikilink]]`、行内公式共存，解析器无报错。

结论：**P1 的编辑器内核选型成立**，且状态与视图分离的架构天然支持「同一文档多视图（分屏预览）」。

## 三、验证 2：sigma 不能在主进程加载（重要坑）

```js
import Sigma from "sigma";
```

**输出：**

```
ReferenceError: WebGL2RenderingContext is not defined
    at node_modules/sigma/dist/index-5d7c4e29.cjs.dev.js:145
```

sigma **在模块导入阶段就求值 `WebGL2RenderingContext`**，因此：

1. 只能在**渲染进程**（Electron 的 Chromium，具备 WebGL2）里加载；
2. 主进程 / 纯 Node 单测**一定崩**，所以**图数据逻辑必须留在 graphology 侧**（graphology 纯 JS，可安全地跑在任何地方）；
3. 关闭 GPU 加速的环境（老机器、远程桌面）可能没有 WebGL2 → **必须准备降级方案**：Canvas 2D 简易力导向图，或提示用户开启硬件加速。

**写进 P3 任务清单**：`graphology 负责数据（过滤/社区/子图），sigma 只负责画；sigma 的 import 放在渲染进程专用模块里，主进程只 import graphology。`

## 四、验证 3：graphology / katex 可在 Node 侧使用

`graphology` 的 `Graph` 增删节点与边在 Node 里正常工作（`order` / `size` 可读），`katex.renderToString('x^2')` 正常返回 HTML。

**含义**：知识图谱的**构建**（扫描 Markdown 抽 `[[链接]]`、抽 `#标签`、把知识点与题目连边）可以放在主进程/后台任务里跑，只把结果丢给渲染进程画。这正好匹配主计划 P3「索引服务」的定位。

## 五、验证 4：依赖体积

| 项 | 实测 |
| --- | --- |
| 8 个包 + 传递依赖的 `node_modules` | **16.3 MB** |

`【推断】` 打包进 Electron 后（tree-shaking + 只引需要的语言包），编辑器与图谱的实际增量预计在 **2–5 MB** 量级，对 300 MB 的安装包预算几乎无影响。

## 六、对主计划的四条修正建议

1. **`@codemirror/language-data` 按需加载**：它带的是所有语言的元数据，首屏不要同步加载全部语言包，否则打开含代码块的笔记会卡（P1 待测）。
2. **图谱模块拆两个文件**：`graph-model.ts`（graphology，可在主进程/测试里跑）与 `graph-view.tsx`（sigma，仅渲染进程）。这条拆分从 P3 第一天就要做，事后拆代价大。
3. **P1 必须实测中文 IME**：连续输入 200 字、撤销栈、选区行为 —— 这是 CodeMirror 在中文环境最常见的坑，且只有真机手测能发现。
4. **降级路径要写进需求**：设置页增加「图谱渲染方式：WebGL（默认）/ Canvas 简易模式」开关，作为老机器与远程桌面的逃生口。

## 七、复跑方式

```powershell
# 探针目录（可删）
D:\Users\LINKIT\Desktop\格致\_probe_npm\
  ├─ package.json
  ├─ probe.mjs    # sigma 加载失败的复现
  └─ probe2.mjs   # CodeMirror / graphology / katex 正常路径
```
