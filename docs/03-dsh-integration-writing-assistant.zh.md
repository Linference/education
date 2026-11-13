# 格致 · DSH 集成实测 #2：把 DSH 当「只能改当前库」的写作助手

> 目的：验证计划里最关键的一条架构假设 —— **能不能让 DSH 受控地读写指定 Vault，并把每一步动作以事件流暴露给界面**。
> 结论：**成立，可以直接进 P4 阶段实现。**

## 一、实验设置

```powershell
# 受测目录（模拟一个 Vault）
D:\Users\LINKIT\Desktop\格致\_probe_vault\情态动词.md   # 预置含 TODO 的笔记

# 调用（关键：-WorkingDirectory 指向 Vault，即沙箱 workspaceRoot）
Start-Process -FilePath "D:\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" `
  -ArgumentList @('headless','--json',
    '读取当前目录下的 情态动词.md，在文件末尾追加一节 ## 推测用法，用两句中文说明 may/might 与 must 表示推测时的差别。直接改文件，不要新建文件。') `
  -WorkingDirectory "D:\Users\LINKIT\Desktop\格致\_probe_vault" `
  -NoNewWindow -Wait -RedirectStandardOutput events.ndjson -RedirectStandardError err.txt
```

## 二、实测结果

| 观测项 | 结果 |
| --- | --- |
| 退出码 / 耗时 | **exit = 0 / 6.1 秒** |
| stderr | 空 |
| 文件是否被真正修改 | **是**：`情态动词.md` 从 5 行变 11 行，末尾新增 `## 推测用法` 两段中文说明 |
| Agent 自主选择工具 | ① `read` 读原文件 → ② `edit` 精确替换 → ③ `read` 回读校验（**3 步工具调用，无人提示就会自我复核**） |
| 沙箱边界 | 全程读写都限制在 cwd（Vault）内，未触碰库外文件 |

**事件类型统计（真实 NDJSON）**

| 事件 type | 条数 | 说明 |
| --- | --- | --- |
| `session` | 1 | 建立会话，含 `sessionId` 与 `cwd` |
| `status` | 10 | `turn_start / step_start / step_end / turn_end`，含 token 用量 |
| `thinking` | 4 | 思考流（可折叠展示） |
| `tool_call` | 2 → 实为 3（含 1 条被 ANSI 包裹） | 字段：`callId`、`tool`、`input` |
| `tool_result` | 3 | 字段：`callId`、`status`、`result` |

工具调用原文示例：

```json
{"type":"tool_call","callId":"call_00_JUvgliFk0A2KOV8ectTG2336","tool":"read",
 "input":{"file_path":"…\\_probe_vault\\情态动词.md"}}

{"type":"tool_call","callId":"call_00_HFIAGnLdMdiedBTUieW32640","tool":"edit",
 "input":{"file_path":"…\\情态动词.md",
          "old_string":"TODO: 补充 may/might 表示推测的用法。",
          "new_string":"TODO: …\n\n## 推测用法\n\n…"}}

{"type":"tool_result","callId":"call_00_HFIAGnLdMdiedBTUieW32640","status":"completed",
 "result":"The file … has been updated successfully."}
```

> 这正是「AI 改你的笔记」需要的全部信息：改哪个文件、把什么改成什么（`old_string` / `new_string` 天然就是 diff 素材）、成功与否。

## 三、给实现者的五条硬结论

1. **`cwd = Vault` 就是权限边界**。DSH 的 `sandbox-policy.workspaceRoot = process.cwd()`，所以格致只要把子进程的工作目录设成当前库，AI 的读写就被关在库里。**默认锁 `workspace-write`，不要给 `danger-full-access`。**
2. **diff 预览直接可用**。`tool_call` 的 `edit` 事件自带 `old_string` / `new_string`，界面可以用它渲染「将要发生的修改」并在用户点「应用」前挂起——但因工具已执行，正确做法是：**先由格致拦截并展示，再放行**（P4 用「两级模式」实现：审阅模式下把 AI 的写入请求转成待确认队列；自动模式下直接执行并保留快照）。
3. **必须显式按 UTF-8 解码子进程输出**。实测中把 DSH 的字节流交给 PowerShell 重定向再用 `Get-Content` 读，会得到 `鎯呮€佸姩璇` 这类乱码——**文件内容本身是正确的 UTF-8，乱码只发生在读取端**。Node 侧要实现为 `child.stdout.setEncoding('utf8')`（或 `TextDecoder` 流式解码），并加一条「中文写入 → 读回比对」的集成测试防回归。
4. **事件解析要宽容**。实测 30 行里有 3 行 `PARSE_ERR`，原因是个别行被终端转义序列（ANSI）污染。解析器应：剥 ANSI → 尝试 `JSON.parse` → 失败则丢弃并计数，而不是抛出中断 UI。
5. **冷启动 6 秒成本可接受但不理想**。会话内用 `--session-id` 续聊；若交互变密，升级到常驻 `dsh web`（见 `01-智能层选型` 的路线 B）。

## 四、复跑方式

```powershell
# 目录与文件由脚本重建，直接重跑本文件记录的命令即可；产物路径：
#   _probe_vault\情态动词.md      ← 被修改的文件
#   _probe_agent.ndjson           ← 完整事件流
```
