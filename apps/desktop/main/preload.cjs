// 格致桌面端 · preload
//
// ⚠️ CommonJS —— 与主进程同样的原因（见 main/index.cjs 顶部注释）：
//   Electron 的内置模块不提供 ESM 具名导出。
//
// 这是渲染进程与主进程之间**唯一的**通道。
// 铁律：只暴露白名单方法，不暴露 ipcRenderer 本体，也不暴露任何 Node API。
// 暴露 ipcRenderer 等于把整个 IPC 面交给页面，是 Electron 最常见的错。
const { contextBridge, ipcRenderer } = require("electron");

const api = {
  /** 应用与运行环境信息（含「文档」目录的真实位置） */
  info: () => ipcRenderer.invoke("app:info"),

  vault: {
    pick: () => ipcRenderer.invoke("vault:pick"),
    info: (dir) => ipcRenderer.invoke("vault:info", dir),
    list: (dir) => ipcRenderer.invoke("vault:list", dir),
  },

  file: {
    read: (p) => ipcRenderer.invoke("file:read", p),
    reveal: (p) => ipcRenderer.invoke("file:reveal", p),
  },
};

contextBridge.exposeInMainWorld("gezhi", api);
