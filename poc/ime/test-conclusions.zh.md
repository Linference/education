# 格致 PoC · CodeMirror 6 中文输入法自动测试结论

> 测试时间：2026-10-01
> 测试方式：**Playwright + Chrome DevTools Protocol 的 `Input.imeSetComposition` 接口**驱动真实组合输入
> 测试对象：`poc/ime`（CodeMirror 6.43.13 + `@codemirror/lang-markdown` + Lezer，含 Live Preview 装饰）
> 结果：**8/8 用例通过，页面零 JS 报错**

---

## 一、先说清楚这个测试能证明什么、不能证明什么

这一点比结果本身更重要。

### 测到了（有说服力）

`Input.imeSetComposition` 是 **CDP 的输入法接口**，它走 **Blink 真实的 composition 编辑路径** —— 不是往 DOM 里硬塞事件。因此下面这些都是被真正执行过的：

- Blink 的组合输入状态机（`compositionstart` → `compositionupdate` × N → `compositionend`）
- CodeMirror 6 在组合期间的 DOM 同步、选区维护、撤销分组
- Live Preview 装饰（wikilink / 公式 / 标签的 `Decoration.mark`）存在时的组合输入
- 组合输入被取消（清空组合串）时的清理

**核对过事件序列**：每次组合输入 CodeMirror 都收到 `start=1 / update=3~5 / end=1`，数量配对、无异常 —— 这说明编辑器确实在响应真实组合事件，而不是"恰好文本进去了"。

### 测不到（仍需要真人一次）

- **操作系统输入法引擎本身**：候选词排序、翻页、模糊音、云候选、双拼/注音/仓颉的编码行为
- **某些输入法特有的"先把拼音串上屏、再整体替换成汉字"的两段式行为**
- **不同输入法的差异**（微软拼音 / 搜狗 / 微信 / 注音 / 仓颉，行为不一致）

> 结论的正确读法：**「编辑器处理组合输入不会丢字/重复/跳位/撤销错乱」这一层已经被自动验证通过**；
> 「你的那个输入法用起来顺不顺」这一层仍需你花 10 分钟手测一次（用例见 `测试清单.md`）。

---

## 二、测试方法（可复现）

```python
# 核心：用 CDP 的输入法接口走真实组合路径
cdp = page.context.new_cdp_session(page)
cdp.send("Input.imeSetComposition", {"text": "qingtaidongci",
         "selectionStart": 13, "selectionEnd": 13})   # 组合中（类似拼音串）
cdp.send("Input.insertText", {"text": "情态动词"})      # 上屏
```

脚本：`poc/ime/cdp_ime_final.py`（最终版）、`cdp_undo_test2.py`（撤销粒度专项）
报告：`poc/ime/cdp-ime-report-final.json`、`cdp-undo-report2.json`

> 运行注意：脚本要**从 `%TEMP%` 运行**。放在 PoC 目录里会被 Vite 的 fs watcher 锁住临时文件（`EBUSY`），导致 dev server 崩溃。

---

## 三、用例结果

| # | 用例 | 事件序列 | 结果 |
| --- | --- | --- | --- |
| 1 | 行尾组合输入「情态动词龘」 | start=1 / update=5 / end=1 / input=5，Δ=5 | ✅ |
| 2 | 中英混排「modal 靐」 | start=1 / update=3 / end=1，Δ=1 | ✅ |
| 3 | **在 `[[ ]]` 内部输入**（CodeMirror #1688 的场景） | start=1 / update=3 / end=1，Δ=1 | ✅ |
| 4 | **在 `$ 公式 $` 内部输入** | start=1 / update=3 / end=1，Δ=1 | ✅ |
| 5 | **在 `#标签` 内部输入** | start=1 / update=3 / end=1，Δ=1 | ✅ |
| 6 | 连续三次组合输入 | start=3 / end=3 | ✅ |
| 7 | 组合中途取消（清空组合串） | Δ=0，未残留字符 | ✅ |
| 8 | 一次撤销完整撤掉上屏词 | 235 → 236 → **235** | ✅ |

用例采用**生僻字探针（龘 靐 齉）**：这三个字在初始文档中绝不存在，因此"插入了没有""撤掉了没有"的判断不会出现假阳性。

### 撤销粒度专项（`cdp_undo_test2.py`，5/5 通过）

| 场景 | 撤销次数 | 结果 |
| --- | --- | --- |
| CDP 组合输入一个词后撤销 | 1 次回到插入前长度 | ✅ |
| 多步组合（拼音串逐步增长）后撤销 | 1 次 | ✅ |
| 普通插入文本后撤销（基线） | 1 次 | ✅ |
| 组合输入后立刻撤销（<500ms） | 1 次 | ✅ |
| 组合输入后等 1.5 秒再撤销 | 1 次 | ✅ |

**说明 CodeMirror 的撤销分组是把整次组合输入当成一步**，不会出现"撤到一半剩半个词"。

---

## 四、过程中我自己踩的坑（写给后来者）

### 坑 1：断言写错，误报 CodeMirror「撤销失效」

第一版测试用「测试」作探针，断言"撤销后文档里不再含『测试』"。**但初始模板里本来就有「测试」两个字**（草稿标题那行），断言恒为真 → 报告 12 次撤销都没撤掉，看起来像 CodeMirror 的严重缺陷。

实际是 **1 次就撤干净了**（235 → 235）。

**教训**：断言探针必须是文档里绝无仅有的字符串；并且**同时校验长度回退**，不能只看文本包含关系。这类假阳性最危险的地方在于——它看起来像"发现了 bug"，会让人改错方向。

### 坑 2：Vite 只绑 IPv6，`127.0.0.1` 连不上

Vite 8 默认监听 `::1`。`http://127.0.0.1:5188` 拒绝连接，但 `http://[::1]:5188` 正常。表现为"服务器明明起来了却访问不了"。
**修法**：`vite.config.js` 里显式 `host: "127.0.0.1"`。

### 坑 3：Vite 的 fs watcher 被 Python 临时文件搞崩

从后台任务启动 `python.exe` 时，Windows 会把脚本写进**当前工作目录**的 `.selfcheck.py.<pid>.<uuid>.tmpdir/`。Vite 监听它 → `EBUSY: resource busy or locked` → dev server 直接崩。
**修法**：`watch.ignored` 排除 `**/*.tmpdir/**` 等；脚本改从 `%TEMP%` 运行。

### 坑 4：Windows 控制台是 GBK

Python 输出 `✅` 抛 `UnicodeEncodeError`。**修法**：输出用 ASCII 标记（`[PASS]`/`[FAIL]`）并设 `PYTHONUTF8=1`。

---

## 五、对计划的结论

1. **编辑器选型锁定 CodeMirror 6**，中文组合输入路径在本机验证通过 — 这条风险从"待验证"降为"已验证（自动层）"。
2. **Live Preview 装饰与 IME 可以共存** —— 用例 3/4/5 就是在装饰生效的前提下做的。这是原先最担心的组合。
3. **仍需 10 分钟真人手测**：换你自己的输入法打一遍，重点看候选词行为与手感（自动测不到输入法引擎本身）。
4. **待验证的剩余风险点**（自动测不到，留到 P1）：
   - `[[` 自动补全与 IME 的交互 —— **这正是 Monaco 挂掉的地方（#2199）**，是下一个必须专门验证的风险点
   - 5000 字大文档下的输入帧率
   - Electron 环境（本次是 Chrome；Chromium 内核相同但外壳不同）
5. **测试基础设施已建好**：`cdp_ime_final.py` 可以直接改成 CI 回归测试 —— 以后升级 CodeMirror 版本时跑一遍，能立刻发现 IME 行为退化。
