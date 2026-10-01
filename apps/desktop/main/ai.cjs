// 格致 · AI 助手（DeepSeek Harness 作为 Agent 内核）
//
// 这是"融合 DSH"真正落地的地方。之前只有 packages/dsh-bridge 这个 Node 包，
// 能跑测试但界面里看不见 —— 等于发动机在仓库里躺着。
//
// 做法：
//   1. 用 DshSession / runHeadless 驱动 DSH
//   2. 把 DSH 的事件流**原样转发**给渲染进程（session/status/thinking/text/
//      tool_call/tool_result/final），界面据此实时显示"AI 在干什么"
//   3. 关键：DSH 的 cwd 必须是**当前打开的库**，这样它的读写动作发生在用户
//      自己的笔记目录里，沙箱边界 = 库边界
//
// ⚠️ 两个必须记住的约束：
//   a. 本文件是 **CommonJS**（后缀 .cjs），**不能写 import 语句** ——
//      写了就是语法错误，主进程直接崩，表现为"Electron 窗口起不来"。
//      ESM 的东西一律用动态 import()（它返回 Promise，所以在 async 里 await）。
//      （第一版就是这里写错了，窗口都开不出来。）
//   b. dsh-bridge 本身是 ESM，require() 它会抛 ERR_REQUIRE_ESM，必须动态 import()。
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const HERE = __dirname;
const ROOT = path.resolve(HERE, "..");           // apps/desktop
const REPO = path.resolve(ROOT, "..", "..");     // 仓库根

let bridgeMod = null;

/**
 * 找 dsh-bridge 的入口。
 *
 * 三个位置都要试，因为开发态与打包态的目录结构不同：
 *   1. 打包态：resources/dsh-bridge/index.mjs（由 electron-builder 的
 *      extraResources 放进去。不试这个的话打包版会报"DSH 不可用"，
 *      而开发模式完全正常 —— 最容易漏的一类问题）
 *   2. 开发态：仓库的 packages/dsh-bridge/src/index.mjs
 *   3. 兼容：相对于本文件往上找
 */
function findBridgeEntry() {
  const candidates = [
    path.join(process.resourcesPath ?? "", "dsh-bridge", "index.mjs"),
    path.join(REPO, "packages", "dsh-bridge", "src", "index.mjs"),
    path.join(ROOT, "..", "..", "packages", "dsh-bridge", "src", "index.mjs"),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

/** 动态加载 dsh-bridge（ESM），并缓存 */
async function loadBridge() {
  if (bridgeMod) return bridgeMod;
  const entry = findBridgeEntry();
  if (!entry) {
    throw new Error(
      "找不到 dsh-bridge。开发态请确认 packages/dsh-bridge/src/index.mjs 存在；" +
      "打包态请确认 build 配置里有 extraResources 带上 dsh-bridge。"
    );
  }
  bridgeMod = await import(pathToFileURL(entry).href);
  bridgeMod.__entry = entry;
  return bridgeMod;
}

/** 当前活跃会话（一次只跑一个，避免并发写同一个库） */
let current = null;

function registerAI(ipcMain, getWindow) {
  // 健康检查：DSH 在不在、什么版本
  ipcMain.handle("ai:health", async () => {
    try {
      const mod = await loadBridge();
      const r = await mod.healthCheck();
      return { ok: r.ok, version: r.version, bin: r.bin, error: r.error ?? null };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("ai:stop", async () => {
    if (!current) return { ok: true, stopped: false };
    try {
      if (current._child && !current._child.killed) current._child.kill();
      current = null;
      return { ok: true, stopped: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

/**
 * 流式版本：事件通过 webContents.send 实时推出，而不是等 ask() 返回。
 *
 * 为什么要单独写：DshSession.ask() 会**攒完所有事件**才返回，界面只能看到
 * 最后结果 —— 那就没有"AI 正在思考 / 正在改文件"的过程了，用户会以为它卡死。
 * 这里直接用 runHeadless 的异步生成器，边收边推。
 */
function registerAIStream(ipcMain, getWindow) {
  ipcMain.handle("ai:run", async (_e, { task, cwd, sessionId, profile }) => {
    const win = getWindow();
    const send = (payload) => {
      if (win && !win.isDestroyed()) win.webContents.send("ai:event", payload);
    };

    if (current) return { ok: false, error: "上一个任务还在跑，请先等它结束。" };

    let mod;
    try {
      mod = await loadBridge();
    } catch (e) {
      return { ok: false, error: `加载 DSH 桥失败：${e.message}` };
    }

    // 沙箱边界：必须是用户打开的库。没有库就拒绝 ——
    // 绝不允许 AI 在仓库根或用户主目录里乱跑。
    const workdir = cwd && fs.existsSync(cwd) ? cwd : null;
    if (!workdir) {
      return { ok: false, error: "请先打开一个库 —— AI 只在你打开的资料库目录里工作。" };
    }

    current = { task };

    let seq = 0;
    let finalText = "";
    let latestSessionId = sessionId ?? null;
    const tokens = { input: 0, output: 0 };

    try {
      for await (const ev of mod.runHeadless({
        task,
        cwd: workdir,
        sessionId: sessionId ?? undefined,
        profile: profile ?? "headless",
      })) {
        seq += 1;
        if (ev.type === "session" && ev.sessionId) latestSessionId = ev.sessionId;
        if (ev.type === "status" && ev.usage) {
          tokens.input += ev.usage.inputTokens ?? 0;
          tokens.output += ev.usage.outputTokens ?? 0;
        }
        if (ev.type === "final") finalText = ev.text ?? "";
        send({ seq, at: Date.now(), event: ev });
      }
      send({ seq: seq + 1, at: Date.now(), event: { type: "done" } });
      return { ok: true, finalText, sessionId: latestSessionId, tokens, eventCount: seq };
    } catch (e) {
      send({ seq: seq + 1, at: Date.now(), event: { type: "error", message: e.message } });
      return { ok: false, error: e.message, sessionId: latestSessionId };
    } finally {
      current = null;
    }
  });
}

module.exports = { registerAI, registerAIStream, loadBridge };
