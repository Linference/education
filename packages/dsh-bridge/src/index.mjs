// 格致 · DSH 桥
//
// 职责：把 `dsh headless --json <任务>` 封装成一个可控的异步事件流。
// 设计依据全部来自实测（见 docs/01、docs/03）：
//   - 必须走 dsh.cmd 包装器：直接调 Electron 主程序时，含空格的路径会被拆开
//   - stdout 必须显式按 UTF-8 解码，否则中文乱码
//   - NDJSON 里可能有被 ANSI 转义污染的行 → 解析要宽容，失败只计数不抛
//   - cwd 就是沙箱边界（DSH 的 sandbox-policy.workspaceRoot = process.cwd()）
//   - 会话续聊靠 --session-id
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";

/** DSH 事件类型（实测全集）。未知类型一律忽略，保证向前兼容。 */
export const DSH_EVENT_TYPES = ["session", "status", "thinking", "text", "final", "tool_call", "tool_result"];

const ANSI_RE = /\u001b\[[0-9;?]*[A-Za-z]/g;

/** 定位 dsh 可执行文件。 */
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
      /* 忽略 */
    }
  }
  // 退路：交给 PATH
  return "dsh";
}

/**
 * 把 dsh.cmd 换成它真正调用的东西。
 *
 * 为什么要这么做（两条实测教训）：
 *   1. Node 24 起不允许直接 spawn `.cmd` 文件（报 EINVAL）；
 *      旧办法是 shell:true，但那会让用户输入的任务文本经过 cmd.exe 解析，
 *      文本里出现 & | > 等字符就可能被当成命令执行 —— 对一个"把学生的话
 *      原样发给 AI"的应用来说这是不可接受的注入面。
 *   2. dsh.cmd 内部其实就是：设 ELECTRON_RUN_AS_NODE=1，用 Electron 主程序跑 cli.js。
 *      我们完全可以直接照做，绕开 shell。
 */
export function resolveLaunchSpec(bin = resolveDshBin()) {
  const lower = String(bin).toLowerCase();

  // 直接给了 js 入口
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) {
    return { exe: process.execPath, args: [bin], env: {} };
  }

  // 给了 dsh.cmd → 直接照抄它内部干的事（见 dsh.cmd 原文）：
  //   set ELECTRON_RUN_AS_NODE=1
  //   "%~dp0..\..\..\..\DeepSeek Harness.exe" --expose-internals "%~dp0..\..\..\app.asar\dsh\...\cli.js" %*
  // 注意 %~dp0 已经是 bin\ 结尾，所以：
  //   ..\..\..\..      → 从 bin 往上四级 = runtime  ← 不是三级，这里容易数错
  //   ..\..\..         → 往上三级 = runtime\cli
  if (lower.endsWith(".cmd") || lower.endsWith(".bat")) {
    const cliBinDir = path.dirname(bin);                    // ...\runtime\cli\bin
    const appExe = path.resolve(cliBinDir, "..", "..", "..", "..", "DeepSeek Harness.exe");
    const cliJs = path.resolve(
      cliBinDir, "..", "..", "..", "app.asar", "dsh", "node_modules",
      "@deepseek-ai", "dsh-desktop-host", "lib", "cli.js"
    );
    // 不能用 fs.existsSync 判断 cli.js：它在 asar 归档里，Node 看不见，只有 Electron 能读。
    // 所以判断 asar 这个**目录**是否存在。
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

/** 解析一行 NDJSON。宽容模式：坏行返回 null。 */
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
 * 跑一次 headless 任务。
 *
 * @param {object} opts
 * @param {string}   opts.task       任务文本
 * @param {string}   [opts.cwd]      工作目录（= 沙箱边界，务必设成当前 Vault）
 * @param {string}   [opts.sessionId] 续聊已有会话
 * @param {string}   [opts.profile]  默认 headless
 * @param {AbortSignal} [opts.signal] 取消
 * @returns {AsyncGenerator<object>} 逐个产出解析后的事件
 */
export async function* runHeadless({ task, cwd = process.cwd(), sessionId, profile = "headless", signal, bin } = {}) {
  const spec = resolveLaunchSpec(bin);
  const args = [...spec.args, "--profile", profile, "headless", "--json"];
  if (sessionId) args.push("--session-id", sessionId);
  args.push(task);

  const child = spawn(spec.exe, args, {
    cwd,
    windowsHide: true,
    env: { ...process.env, ...spec.env },
    // 只有反解失败时才走 shell；正常情况下任务文本不经过 cmd.exe
    shell: Boolean(spec.viaShell),
    stdio: ["ignore", "pipe", "pipe"], // 不要用 exec + pipe 捕获（受限沙箱下会 EPERM）
  });
  child.stdout.setEncoding("utf8"); // 必须显式 UTF-8，否则中文乱码
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
      // 坏行直接丢弃；调用方可以通过 collectRun 拿到统计
    }
    const info = await finished;
    if (info.code !== 0) {
      throw new Error(`dsh 退出码 ${info.code}\n${info.stderr.slice(-800)}`);
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    if (!done) child.kill();
  }
}

/**
 * 跑一次任务并汇总结果（常用场景：要最终答案 + 用量 + 工具调用记录）。
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
 * 长期会话句柄：便于在格致里做"同一个学生的同一门课"这种连续对话。
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

/** 健康检查：DSH 是否可用、版本信息。 */
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
