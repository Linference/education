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
    /** 读二进制（PDF / Word / 图片），返回 Uint8Array */
    readBinary: (p) => ipcRenderer.invoke("file:readBinary", p),
    /** 读旧版 .doc（OLE 二进制），返回提取出的纯文本 */
    readDoc: (p) => ipcRenderer.invoke("file:readDoc", p),
    reveal: (p) => ipcRenderer.invoke("file:reveal", p),
    /** 另存为（导出用） */
    saveAs: (payload) => ipcRenderer.invoke("file:saveAs", payload),
  },
  ai: {
    /** DSH 是否可用、版本 */
    health: () => ipcRenderer.invoke("ai:health"),
    /** 跑一个任务；事件通过 onEvent 流式推送 */
    run: (payload) => ipcRenderer.invoke("ai:run", payload),
    ask: (payload) => ipcRenderer.invoke("ai:ask", payload),
    stop: () => ipcRenderer.invoke("ai:stop"),
    /**
     * 订阅事件流。返回取消订阅函数。
     * 注意：只把 event 对象传出去，不把 ipcEvent 传出去 —— 否则渲染进程
     * 能拿到 sender 之类的东西，等于绕开 contextIsolation 的初衷。
     */
    onEvent: (cb) => {
      const h = (_e, payload) => cb(payload);
      ipcRenderer.on("ai:event", h);
      return () => ipcRenderer.removeListener("ai:event", h);
    },
  },
  // 导出：Markdown → PDF / Word / Markdown（格式由用户选，产品硬规矩）
  exporter: {
    /** 探测三种格式各自是否可用（缺 Typst / python-docx 时给安装提示） */
    probe: () => ipcRenderer.invoke("export:probe"),
    run: (payload) => ipcRenderer.invoke("export:run", payload),
    reveal: (p) => ipcRenderer.invoke("export:reveal", p),
  },
};

contextBridge.exposeInMainWorld("gezhi", api);
