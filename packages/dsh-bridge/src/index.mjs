// Gezhi · DSH bridge
//
// Responsibility: wrap `dsh headless --json <task>` as a controllable asynchronous event stream.
// All design decisions come from measurements (see docs/01, docs/03):
//   - Must go through the dsh.cmd wrapper: calling the Electron main program directly splits paths containing spaces
//   - stdout must be explicitly decoded as UTF-8, otherwise Chinese is garbled
//   - NDJSON may contain lines polluted by ANSI escapes -> parse leniently, count failures instead of throwing
//   - cwd is the sandbox boundary (DSH's sandbox-policy.workspaceRoot = process.cwd())
//   - Session continuation relies on --session-id
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";

/** DSH event types (the complete set we measured). Unknown types are always ignored to keep forward compatibility. */
export const DSH_EVENT_TYPES = ["session", "status", "thinking", "text", "final", "tool_call", "tool_result"];

const ANSI_RE = /\u001b\[[0-9;?]*[A-Za-z]/g;

/** Locate the dsh executable. */
export function resolveDshBin() {
  const candidates = [];
  if (process.env.GEZHI_DSH_BIN) candidates.push(process.env.GEZHI_DSH_BIN);
  candidates.push("D:\\DeepSeek Harness\\resources\\runtime\\cli\\bin\\dsh.cmd");
  if (process.env.LOCALAPPDATA) {
    candidates.push(path.join(process.env.LOCALAPPDATA, "Programs", "DeepSeek Harness", "resources", "runtime", "cli", "bin", "dsh.cmd"));
  }
  if (process.env.ProgramFiles) {
    candidates.push(path.join(process.env.ProgramFiles, "DeepSeek Harness", "resources", "runtime", "cli", "bin", "dsh.cmd"));
  }
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  // Fallback: hand it to PATH
  return "dsh";
}

/**
 * Replace dsh.cmd with what it actually invokes.
 *
 * Why this is done (two measured lessons):
 *   1. Since Node 24, spawning `.cmd` files directly is not allowed (it reports EINVAL);
 *      the old workaround was shell:true, but that makes user-supplied task text go through cmd.exe parsing,
 *      so characters like & | > in the text may be executed as commands — an unacceptable injection surface
 *      for an application that "sends the student's words to the AI verbatim".
 *   2. dsh.cmd internally just sets ELECTRON_RUN_AS_NODE=1 and runs cli.js with the Electron main program.
 *      We can do exactly the same ourselves, bypassing the shell.
 */
export function resolveLaunchSpec(bin = resolveDshBin()) {
  const lower = String(bin).toLowerCase();

  // A js entry point was given directly
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) {
    return { exe: process.execPath, args: [bin], env: {} };
  }

  // dsh.cmd was given -> copy exactly what it does internally (see the original dsh.cmd):
  //   set ELECTRON_RUN_AS_NODE=1
  //   "%~dp0..\..\..\..\DeepSeek Harness.exe" --expose-internals "%~dp0..\..\..\app.asar\dsh\...\cli.js" %*
  // Note that %~dp0 already ends with bin\, so:
  //   ..\..\..\..      -> four levels up from bin = runtime  <- not three, easy to miscount here
  //   ..\..\..         -> three levels up = runtime\cli
  if (lower.endsWith(".cmd") || lower.endsWith(".bat")) {
    const cliBinDir = path.dirname(bin);                    // ...\runtime\cli\bin
    const appExe = path.resolve(cliBinDir, "..", "..", "..", "..", "DeepSeek Harness.exe");
    const cliJs = path.resolve(
      cliBinDir, "..", "..", "..", "app.asar", "dsh", "node_modules",
      "@deepseek-ai", "dsh-desktop-host", "lib", "cli.js"
    );
    // Cannot use fs.existsSync on cli.js: it is inside the asar archive, invisible to Node; only Electron can read it.
    // So check whether the asar **directory** exists.
    const asarMarker = path.resolve(cliBinDir, "..", "..", "..", "app.asar");
    if (fs.existsSync(appExe) && fs.existsSync(asarMarker)) {
      return {
        exe: appExe,
        args: ["--expose-internals", cliJs],
        env: { ELECTRON_RUN_AS_NODE: "1" },
        viaShell: false,
      };
    }
    return { exe: bin, args: [], env: {}, viaShell: true };
  }

  return { exe: bin, args: [], env: {} };
}

/** Parse one NDJSON line. Lenient mode: a bad line returns null. */
export function parseEventLine(line) {
  const cleaned = String(line).replace(ANSI_RE, "").trim();
  if (!cleaned || !cleaned.startsWith("{")) return null;
  try {
    const obj = JSON.parse(cleaned);
    return typeof obj === "object" && obj && typeof obj.type === "string" ? obj : null;
  } catch {
    return null;
  }
}

/**
 * Run one headless task.
 *
 * @param {object} opts
 * @param {string}   opts.task       Task text
 * @param {string}   [opts.cwd]      Working directory (= sandbox boundary; always set it to the current vault)
 * @param {string}   [opts.sessionId] Continue an existing session
 * @param {string}   [opts.profile]  Defaults to headless
 * @param {AbortSignal} [opts.signal] Cancel
 * @returns {AsyncGenerator<object>} Yields parsed events one at a time
 */
export async function* runHeadless({ task, cwd = process.cwd(), sessionId, profile = "headless", signal, bin } = {}) {
  if (signal?.aborted) throw new Error('Task already stopped');
  const spec = resolveLaunchSpec(bin);
  const args = [...spec.args, "--profile", profile, "headless", "--json"];
  if (sessionId) args.push("--session-id", sessionId);
  args.push(task);

  const child = spawn(spec.exe, args, {
    cwd,
    windowsHide: true,
    env: { ...process.env, ...spec.env },
    // Only fall back to the shell when resolution fails; normally the task text never goes through cmd.exe
    shell: Boolean(spec.viaShell),
    stdio: ["ignore", "pipe", "pipe"], // do not use exec + pipe capture (it gives EPERM in restricted sandboxes)
  });
  child.stdout.setEncoding("utf8"); // must be explicitly UTF-8, otherwise Chinese is garbled
  child.stderr.setEncoding("utf8");

  let stderrBuf = "";
  child.stderr.on("data", (d) => {
    stderrBuf += d;
  });

  const onAbort = () => child.kill();
  signal?.addEventListener("abort", onAbort, { once: true });

  let buffer = "";
  const queue = [];
  let done = false;
  let exitInfo = null;

  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      queue.push(line);
    }
  });

  const finished = new Promise((resolve) => {
    child.on("close", (code, sig) => {
      if (buffer.trim()) queue.push(buffer);
      buffer = "";
      done = true;
      exitInfo = { code, signal: sig, stderr: stderrBuf };
      resolve(exitInfo);
    });
    child.on("error", (err) => {
      done = true;
      exitInfo = { code: -1, signal: null, stderr: `${stderrBuf}\nspawn error: ${err.message}` };
      resolve(exitInfo);
    });
  });

  try {
    while (!done || queue.length > 0) {
      if (queue.length === 0) {
        await Promise.race([finished, new Promise((r) => setTimeout(r, 25))]);
        continue;
      }
      const line = queue.shift();
      const ev = parseEventLine(line);
      if (ev) yield ev;
      // Bad lines are dropped; callers can get statistics via collectRun
    }
    const info = await finished;
    if (info.code !== 0) {
      throw new Error(`dsh exited with code ${info.code}\n${info.stderr.slice(-800)}`);
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    if (!done) child.kill();
  }
}

/**
 * Run one task and summarize the result (a common case: wanting the final answer + usage + tool-call records).
 */
export async function collectRun({ task, cwd, sessionId, signal, bin } = {}) {
  const result = {
    sessionId: null,
    cwd: cwd ?? process.cwd(),
    finalText: "",
    textChunks: [],
    thinking: [],
    toolCalls: [],
    toolResults: [],
    usage: null,
    statuses: [],
    unknownEvents: 0,
    badLines: 0,
    durationMs: 0,
  };
  const started = Date.now();
  for await (const ev of runHeadless({ task, cwd, sessionId, signal, bin })) {
    switch (ev.type) {
      case "session":
        result.sessionId = ev.sessionId;
        result.cwd = ev.cwd ?? result.cwd;
        break;
      case "status":
        result.statuses.push(ev);
        if (ev.usage) result.usage = ev.usage;
        break;
      case "thinking":
        result.thinking.push(ev.text ?? "");
        break;
      case "text":
        result.textChunks.push(ev.text ?? "");
        break;
      case "final":
        result.finalText = ev.text ?? "";
        break;
      case "tool_call":
        result.toolCalls.push({ callId: ev.callId, tool: ev.tool, input: ev.input });
        break;
      case "tool_result":
        result.toolResults.push({ callId: ev.callId, status: ev.status, result: ev.result });
        break;
      default:
        result.unknownEvents++;
    }
  }
  result.durationMs = Date.now() - started;
  if (!result.finalText && result.textChunks.length) result.finalText = result.textChunks.join("");
  return result;
}

/**
 * Long-lived session handle: makes continuous conversations like "the same student's same course" easy in Gezhi.
 */
export class DshSession extends EventEmitter {
  constructor({ cwd, sessionId = null, bin } = {}) {
    super();
    this.cwd = cwd ?? process.cwd();
    this.sessionId = sessionId;
    this.bin = bin;
    this.turns = 0;
    this.tokens = { input: 0, output: 0 };
  }

  async ask(task, { signal } = {}) {
    this.emit("turn:start", { task, turn: this.turns + 1 });
    const events = [];
    let finalText = "";
    for await (const ev of runHeadless({
      task,
      cwd: this.cwd,
      sessionId: this.sessionId,
      signal,
      bin: this.bin,
    })) {
      events.push(ev);
      if (ev.type === "session" && ev.sessionId) this.sessionId = ev.sessionId;
      if (ev.type === "status" && ev.usage) {
        this.tokens.input += ev.usage.inputTokens ?? 0;
        this.tokens.output += ev.usage.outputTokens ?? 0;
      }
      if (ev.type === "final") finalText = ev.text ?? "";
      this.emit("event", ev);
    }
    this.turns++;
    this.emit("turn:end", { turn: this.turns, finalText, tokens: this.tokens });
    return { finalText, events, sessionId: this.sessionId, tokens: { ...this.tokens } };
  }
}

/** Health check: whether DSH is usable, plus version information. */
export async function healthCheck({ bin } = {}) {
  const spec = resolveLaunchSpec(bin);
  return new Promise((resolve) => {
    const child = spawn(spec.exe, [...spec.args, "--help"], {
      windowsHide: true,
      env: { ...process.env, ...spec.env },
      shell: Boolean(spec.viaShell),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d) => (out += d));
    child.on("error", (e) => resolve({ ok: false, bin: spec.exe, error: e.message }));
    child.on("close", (code) => {
      const version = (out.match(/dsh\s+([\d.]+)/i) ?? [])[1] ?? null;
      resolve({ ok: code === 0 && /Usage: dsh/.test(out), bin: spec.exe, code, version, helpText: out.slice(0, 2000) });
    });
  });
}
