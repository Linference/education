# Gezhi · Intelligence Layer Selection: DeepSeek Harness (DSH) as the Embedded Agent Kernel

> This document presents measured conclusions, not speculation. Every item marked "measured" was actually run on this machine, and the commands and output are appended at the end.
> Conclusion first: **do not build our own Agent loop, and do not copy opencode wholesale; embed DSH as the Agent kernel, and let Gezhi do only "the learning-domain product layer".**

---

## 1. Why We Changed Our Mind (Compared with the Original Plan)

The predecessor (competition project) plan was "treat `opencode serve` as a subprocess + write our own HTTP/SSE client". That route works (the code is already in `app\server\src\opencode.js`), but it carries three structural costs:

| Dimension | opencode plan | **DSH plan (recommended here)** |
| --- | --- | --- |
| Models and keys | Would need to store another copy of the DeepSeek API Key inside Gezhi | **Reuse the DSH account the user is already logged into** (`~/.dsh/llm-deepseek`, `credentials`); Gezhi never touches plaintext Keys |
| Sessions and persistence | Design JSONL/SQLite ourselves | DSH already has built-in `session-persistence-jsonl` + `session-query-sqlite` + projection cache + title generation |
| Tools and sandbox | Implement read/write/search/execute + permissions ourselves | DSH already has built-in file tools, pwsh/bash sandbox, approval policy, permission presets |
| Context governance | Do trimming and compaction ourselves | DSH already has built-in `compaction-basic`, `compaction-tool-result-pruner`, `spill-policy`, `token-meter` |
| Extension approach | Modify opencode source or write MCP | **Write DSH plugins (profile patches) or MCP servers — these are official extension points** |
| Learning-scenario capabilities | None | Built-in skills, subagent, workflow, goal, todo, plan-mode, web search |
| Voice | None | **Built-in `sherpa-onnx-win-x64` (offline Chinese speech)** |
| Office documents | Assemble python-docx etc. ourselves | Built-in `office-skills` (SKILL + validation scripts for docx/pptx/xlsx) and `libreoffice-kit` |

In one sentence: of the "AI brain + document output + voice" that Gezhi wants to build, DSH already provides all three. Rebuilding them would not only waste effort but also make it hard to explain "which part did you build" during the competition/defense.

---

## 2. What DSH Is (Measured Facts)

| Item | Measured value |
| --- | --- |
| Form | Electron desktop application + embedded CLI + local Web GUI |
| Version | Main program `resources\runtime\primary-runtime\runtime.json` has `desktopVersion = 0.2.0-rc.2` |
| Install location | `D:\DeepSeek Harness\` (main program 244 MB; `resources\app.asar` 121 MB) |
| Runtime | Bundles Node 24.21.0, pnpm 11.7.0, Python 3.12.14 (with numpy/pandas/python-docx/python-pptx/openpyxl/Pillow/lxml/XlsxWriter) |
| CLI entry | `D:\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd` |
| CLI essence | `ELECTRON_RUN_AS_NODE=1` + `DeepSeek Harness.exe app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js` |
| HOME | `DSH_HOME=C:\Users\LINKIT\.dsh`, containing `profiles / sessions / skills / storages / attachments / .agent-presets / llm-deepseek` |
| Configuration framework | **Cordis** (plugin tree + YAML patch layer). `~/.dsh/profiles/<name>/cordis.patch.yml` is the user overlay layer |
| Profile composition | `bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]`, with additional `--patch` overrides possible |
| Default model (desktop) | `provider: deepseek-account`, `model: deepseek-flash`, `reasoningEffort: max` |
| Current Web GUI | `DSH_WEB_URL = http://127.0.0.1:19387` (local service; Gezhi can reference its communication approach) |

### Key finding: profiles are "programmable"

`dsh --dump-config` can print the entire plugin tree (measured at 379 lines, saved in `docs\templates\dsh-headless-profile.dump.yml`). This means **Gezhi can have its own DSH profile**:

```
Gezhi profile = dsh-base (foundation)
              + Gezhi's own plugins (question-bank tools / paper generation / Feynman scoring / calendar planning / textbook retrieval)
              + Gezhi MCP server (own tools exposed as MCP)
              + Gezhi model and prompt overrides (change system-prompt, default model, sandbox policy in cordis.patch.yml)
```

> Note: the `desktop` profile is exclusively owned by the Electron application (measured error: `profile "desktop" is managed exclusively by the Electron application`), so Gezhi cannot use it and should create a new `gezhi` profile. The `headless` profile can be read, dumped and run.

---

## 3. Integration Approaches (Three Routes; A Is Recommended)

### Route A: Subprocess + NDJSON event stream (**recommended; measured and working**)

```powershell
# Called by the Gezhi main process (cwd = current Vault; the sandbox workspaceRoot follows cwd)
dsh headless --json "<task>"
dsh headless --json --session-id session-xxxx "<continue the conversation>"
echo "<task>" | dsh headless --json          # read the task from stdin
```

Measured: the command returned in 3.1 seconds, stdout was pure NDJSON, stderr was empty, exit code 0.

**Event types (full measured set; samples saved in `docs\templates\dsh-headless-events.sample.ndjson`)**

| Event | Fields | Purpose |
| --- | --- | --- |
| `session` | `sessionId`, `cwd` | Create/reuse a session; the frontend gets the session id to continue chatting |
| `status` | `phase: turn_start / step_start / step_end / turn_end`, `turn`, `step`, `usage{inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens,totalTokens}` | Progress bar, token metering, cost statistics |
| `thinking` | `text` (streaming increment) | "Thinking" collapsible area (corresponds to reasoning content) |
| `text` | `text` (streaming increment) | Typewriter-effect body text |
| `final` | `text` | Final answer for this turn, persisted as a message |

> This event set covers exactly all the UI states the Gezhi "AI chat page" needs: session → thinking → streaming body → usage → wrap-up. Gezhi **does not need** to parse DSH's internal protocol; it only needs to consume these 5 line types.

**Why A rather than the alternatives**:
- Process isolation: a DSH crash does not affect the Gezhi main UI; a Gezhi crash does not pollute DSH sessions.
- Account reuse: directly uses the quota of the DeepSeek account the user is already logged into; Gezhi does not need to custody an API Key.
- Sandbox alignment: DSH's `sandbox-policy.workspaceRoot = process.cwd()`, so "setting cwd to the current Vault" is equivalent to "the AI can only touch this vault" — the security boundary holds naturally.
- Resumable conversations: `--session-id` lets a long conversation for "the same student, the same course" continue across processes.

### Route B: Resident `dsh web` service + HTTP

`dsh web` starts a local service (the current instance is at `127.0.0.1:19387`, exposed via `DSH_WEB_URL`). Gezhi could treat it as a backend and communicate over HTTP/SSE, eliminating the cold start each time.

**Measured**: a direct `GET http://127.0.0.1:19387/` returns **HTTP 401 Unauthorized** (pid 1476 is listening). In other words, that port **is not an open API for third-party applications to reuse directly**; getting it working would require handling its authentication/session handshake.

- Advantages: no cold start, concurrent requests from multiple panels, natural event push.
- Costs: must figure out the authentication and HTTP contract (much more complex than NDJSON), and sharing the port with its own GUI requires isolation.
- Applicable: reassess once Route A runs smoothly and "cold start is too slow" actually becomes a problem.

> This measurement further supports Route A: **subprocess + NDJSON is a stable surface that requires no authentication and depends on no internal contract**.

### Route C: In-process Cordis plugin

Turn Gezhi into a DSH plugin package and install it with `dsh plugin --profile gezhi add <local path>`.

- Advantages: deepest integration; Gezhi's capabilities become native Agent tools directly (no MCP relay).
- Costs: coupling to DSH internal APIs (rc versions may change) and a long debugging chain.
- Applicable: **Gezhi-specific tools** (paper generation, Feynman scoring, knowledge-graph queries) should ultimately be built this way, but only after P5.

---

## 4. How Gezhi's Capabilities "Grow" into DSH

DSH's built-in extension points map directly to Gezhi's functional requirements:

| Gezhi requirement | DSH's existing mechanism | What Gezhi needs to do |
| --- | --- | --- |
| AI can read/write/modify files in the vault | `tool-fs` + `tool-fs-search` + `fs-observation-policy` + sandbox | No development needed; just set cwd to the Vault |
| AI generates Word/PDF/Markdown | `office-skills` (SKILL.md + `check_office.py`) + Python runtime + `libreoffice-kit` | Write Gezhi's export skill (Chinese typesetting, exam-paper templates) and call existing capabilities |
| AI looks up textbooks and citation sources | `skill` + `tool-skill` + `agent-instructions` | Turn textbook-vault retrieval into a skill (with FTS5 query scripts); put mandatory citation in the skill |
| AI creates questions and generates papers | None existing | Build our own: `gezhi-exam` skill + MCP tools (question-bank query, question sampling, LaTeX→PDF export) |
| Feynman scoring | None existing | Build our own: `gezhi-feynman` skill (rubric + JSON schema + diagnostic flow) |
| Calendar and plan segmentation | `tool-todo`, `goal`, `goal-round-driver`, `plan-mode` | Build our own: schedule MCP tools (read/write tasks/events/countdowns), reusing todo/goal semantics |
| Voice practice | **`sherpa-onnx-win-x64` (offline ASR/TTS)** | Build our own: recording→DSH→TTS voice loop; use Tencent Cloud online |
| Long tasks ("index the whole book") | `jobs` (local background tasks), `subagent`, `workflow` | Build our own: package indexing tasks as a job and write progress to the vault |
| Online research | `web` + `web-search-deepseek` + `web-fetch-http` | Use directly (note: `web-search-deepseek` needs the `DEEPSEEK_API_KEY` environment variable) |
| Third-party tools | `mcp-resources` (MCP client capability) | Expose the Gezhi knowledge base/question bank as an MCP server and attach it |
| Permissions and student safety | `approval` + `permission-presets` (read-only / workspace-write / danger-full-access) | Default to locking `workspace-write`; writes outside the vault require approval |
| Cost control | `token-meter`, `session-projection`, `compaction-*` | Read usage events to build a "today's token usage" panel |

> What this mapping table means: more than half of Gezhi's development work shifts from "building the engine" to "writing skills + writing MCP tools + building the UI". This is the key improvement in feasibility.

---

## 5. Relationship with opencode (Not Either/Or, but Division of Labor)

- **Agent kernel**: use DSH (account, sandbox, sessions, voice and Office are all there).
- **Keep opencode**: the user has installed it and is familiar with it; it can serve as a **development-time aid** (used when writing Gezhi's own code) and as a **reference** (its toolset design, permission prompts and TUI interaction are worth copying).
- **Do not** stuff two Agent loops into Gezhi at the same time — two sets of sessions, permissions and billing would make maintenance uncontrollable.

---

## 6. Measured Commands and Raw Output (Reproducible)

```powershell
# 1) CLI capabilities
& "D:\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" --help
& "D:\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" headless --help

# 2) Print the full plugin tree of the headless profile (379 lines)
& "D:\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" --profile headless --dump-config

# 3) Run headless once and capture NDJSON events
$out = "events.ndjson"
Start-Process -FilePath "D:\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" `
  -ArgumentList @('headless','--json','Only answer four characters: Gezhi test') `
  -WorkingDirectory "D:\Users\LINKIT\Desktop\格致" -NoNewWindow -Wait `
  -RedirectStandardOutput $out -RedirectStandardError "err.txt"
# => exit=0, 3.1s, 8 lines of NDJSON
```

**Pitfall log (for implementers)**:
1. Do not call `& "D:\DeepSeek Harness\DeepSeek Harness.exe" <cli.js path>` directly — the spaces in the path get split into `D:\DeepSeek`, reporting `Cannot find module`. **You must go through the `dsh.cmd` wrapper.**
2. Use `Start-Process ... -RedirectStandardOutput` to capture output; using `1>` directly in PowerShell against an Electron program is unreliable (measured: returns instantly with 0 output).
3. When spawning from Node, do not use `exec` with `stdio: 'pipe'` (it gives EPERM under a restricted sandbox); use `spawn` and read the stdout stream directly, or write to a temporary file and read it.
4. The `desktop` profile cannot be dumped or customized; create your own profile.
5. The default provider of `headless` is `deepseek-official`, while desktop is `deepseek-account`; the Gezhi profile must explicitly hardcode the provider/model in the patch to avoid inconsistent behavior after switching machines.

---

## 7. Risks and Mitigations

| Risk | Description | Mitigation |
| --- | --- | --- |
| DSH version drift | Currently `0.2.0-rc.2`; plugin names/event fields may change | Gezhi depends only on the three stable surfaces: "CLI + five NDJSON event types + profile patch"; make version detection a startup self-check, and write event parsing in tolerant mode (ignore unknown types) |
| Depends on the user having DSH installed | Distributing to others requires installing DSH first | Short term: position Gezhi as "local personal use + competition demo"; medium term: distribute the DSH runtime as a Gezhi sidecar (size in exchange for independence) |
| 3-second cold start | A process is started for every question | Reuse `--session-id` within a session; for high-frequency interaction, upgrade to a resident `dsh web` (Route B) |
| Student data leakage | Question content is sent to the model | Send only necessary excerpts by default; provide a "pure local mode" switch (local model/offline retrieval); encrypt recordings and scores locally |
| Resource contention with the DSH GUI | The user has DSH desktop open at the same time | Isolate the profile and `DSH_HOME`, or allow specifying an independent DSH_HOME in Gezhi settings |
| Originality is hard to explain | The competition requires listing AI tool usage | State clearly in research and product documents: **DSH is an MIT-licensed Agent engine (reused); what Gezhi built itself is the knowledge base, question-bank paper generation, Feynman scoring, calendar planning, voice practice and the entire teaching workflow** |

---

## 8. Hard Conclusions for the Plan

1. The intelligence-layer technical route is locked as: **DSH headless subprocess + NDJSON event stream + custom `gezhi` profile**.
2. Gezhi's self-developed boundary is clearly drawn as: **knowledge base and retrieval, question bank and paper generation, Feynman scoring, calendar planning, voice practice, five-panel interface, data model**.
3. "Self-developed Agent loop / self-developed tool sandbox / self-developed session storage" are no longer on the schedule.
4. The value of the predecessor `opencode.js` is downgraded to "reference implementation"; it is no longer a mainline dependency.
