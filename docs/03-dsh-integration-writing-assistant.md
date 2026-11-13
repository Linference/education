# Gezhi · DSH Integration Measurement #2: Using DSH as a Writing Assistant That "Can Only Modify the Current Vault"

> Purpose: verify the most critical architectural assumption in the plan — **can DSH be made to read and write a specified Vault under control, and expose every action to the interface as an event stream?**
> Conclusion: **Yes, it holds; we can proceed directly to P4 implementation.**

## 1. Experiment Setup

```powershell
# Test directory (simulating a Vault)
D:\Users\LINKIT\Desktop\格致\_probe_vault\情态动词.md   # pre-seeded note containing TODO

# Invocation (key: -WorkingDirectory points to the Vault, i.e., the sandbox workspaceRoot)
Start-Process -FilePath "D:\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" `
  -ArgumentList @('headless','--json',
    'Read 情态动词.md in the current directory, append a section ## Speculative Usage at the end of the file, and use two Chinese sentences to explain the difference between may/might and must when expressing speculation. Modify the file directly; do not create a new file.') `
  -WorkingDirectory "D:\Users\LINKIT\Desktop\格致\_probe_vault" `
  -NoNewWindow -Wait -RedirectStandardOutput events.ndjson -RedirectStandardError err.txt
```

## 2. Measured Results

| Observation | Result |
| --- | --- |
| Exit code / duration | **exit = 0 / 6.1 seconds** |
| stderr | empty |
| Was the file actually modified? | **Yes**: `情态动词.md` went from 5 lines to 11 lines, with two paragraphs of Chinese explanation added at the end under `## 推测用法` |
| Agent's autonomous tool choices | ① `read` the original file → ② `edit` precise replacement → ③ `read` read back to verify (**3 tool calls; it self-checks even without being prompted**) |
| Sandbox boundary | All reads and writes were confined to cwd (the Vault); no files outside the vault were touched |

**Event type statistics (real NDJSON)**

| Event type | Count | Description |
| --- | --- | --- |
| `session` | 1 | Creates the session, including `sessionId` and `cwd` |
| `status` | 10 | `turn_start / step_start / step_end / turn_end`, including token usage |
| `thinking` | 4 | Thinking stream (can be displayed collapsed) |
| `tool_call` | 2 → actually 3 (including 1 wrapped in ANSI) | Fields: `callId`, `tool`, `input` |
| `tool_result` | 3 | Fields: `callId`, `status`, `result` |

Example original text of a tool call:

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

> This is exactly all the information needed for "the AI modifies your notes": which file was changed, what was changed into what (`old_string` / `new_string` are naturally diff material), and whether it succeeded.

## 3. Five Hard Conclusions for Implementers

1. **`cwd = Vault` is the permission boundary.** DSH's `sandbox-policy.workspaceRoot = process.cwd()`, so once Gezhi sets the child process's working directory to the current vault, the AI's reads and writes are locked inside the vault. **Default to locking `workspace-write`; do not grant `danger-full-access`.**
2. **diff preview is directly usable.** The `edit` event in `tool_call` carries `old_string` / `new_string`, which the interface can use to render "the modification that is about to happen" and suspend it before the user clicks "Apply" — but because the tool has already executed, the correct approach is: **have Gezhi intercept and display first, then release** (P4 implements this with a "two-level mode": in review mode, the AI's write requests are converted into a confirmation queue; in automatic mode, they execute directly and retain a snapshot).
3. **The subprocess output must be explicitly decoded as UTF-8.** In the measurement, passing DSH's byte stream to PowerShell redirection and reading it with `Get-Content` produced mojibake such as `鎯呮€佸姩璇` — **the file content itself is correct UTF-8; the mojibake occurs only on the reading side**. On the Node side, implement `child.stdout.setEncoding('utf8')` (or streaming `TextDecoder`), and add an integration test of "write Chinese → read back and compare" to prevent regressions.
4. **Event parsing must be tolerant.** In the measured 30 lines, 3 were `PARSE_ERR`, because individual lines were polluted by terminal escape sequences (ANSI). The parser should: strip ANSI → try `JSON.parse` → on failure discard and count, rather than throw and interrupt the UI.
5. **The 6-second cold-start cost is acceptable but not ideal.** Use `--session-id` to continue conversations within a session; if interaction becomes dense, upgrade to a resident `dsh web` (see Route B in `01-intelligence-layer-dsh-as-agent-core`).

## 4. How to Rerun

```powershell
# The directory and files are rebuilt by the script; simply rerun the commands recorded in this file; output paths:
#   _probe_vault\情态动词.md      ← the modified file
#   _probe_agent.ndjson           ← full event stream
```
