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
    /** 告诉主进程当前打开的库（文件写入的路径校验要用） */
    set: (dir) => ipcRenderer.invoke("vault:set", dir),
  },

  // 库内文件操作：新建 / 重命名 / 删除 / 保存
  fsx: {
    createFile: (payload) => ipcRenderer.invoke("fs:createFile", payload),
    createFolder: (payload) => ipcRenderer.invoke("fs:createFolder", payload),
    rename: (payload) => ipcRenderer.invoke("fs:rename", payload),
    /** 默认移到回收站（笔记不能一删就没） */
    remove: (payload) => ipcRenderer.invoke("fs:delete", payload),
    writeText: (payload) => ipcRenderer.invoke("fs:writeText", payload),
    currentVault: () => ipcRenderer.invoke("fs:currentVault"),
  },

  file: {
    read: (p) => ipcRenderer.invoke("file:read", p),
    /** 读二进制（PDF / Word / 图片），返回 Uint8Array */
    readBinary: (p) => ipcRenderer.invoke("file:readBinary", p),
    /** 读旧版 .doc（OLE 二进制），返回提取出的纯文本 */
    readDoc: (p) => ipcRenderer.invoke("file:readDoc", p),
    /** 读旧版 .ppt（OLE 二进制），返回近似分页的文本 */
    readPpt: (p) => ipcRenderer.invoke("file:readPpt", p),
    /** 读 .pptx：**主进程解析，只回传文字**（219MB 的文件不适合走字节 IPC） */
    readPptx: (p) => ipcRenderer.invoke("file:readPptx", p),
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
  // 全文检索与反向链接
  search: {
    /** 打开库时调用：拿到统计并触发后台索引 */
    open: (vault) => ipcRenderer.invoke("search:open", vault),
    /** 全量重建索引 */
    reindex: (vault) => ipcRenderer.invoke("search:reindex", vault),
    /** 单个文件重新索引（保存后调） */
    reindexFile: (payload) => ipcRenderer.invoke("search:reindexFile", payload),
    /** 等后台索引跑完（测试与"保存后立刻检索"用） */
    waitIdle: () => ipcRenderer.invoke("search:waitIdle"),
    query: (payload) => ipcRenderer.invoke("search:query", payload),
    backlinks: (payload) => ipcRenderer.invoke("search:backlinks", payload),
    outlinks: (payload) => ipcRenderer.invoke("search:outlinks", payload),
    stats: (vault) => ipcRenderer.invoke("search:stats", vault),
    dbInfo: () => ipcRenderer.invoke("search:dbInfo"),
    /** 订阅索引进度 / 完成 / 出错 */
    onEvent: (cb) => {
      const chans = ["search:progress", "search:indexed", "search:error"];
      const hs = chans.map((c) => {
        const h = (_e, p) => cb(c, p);
        ipcRenderer.on(c, h);
        return [c, h];
      });
      return () => hs.forEach(([c, h]) => ipcRenderer.removeListener(c, h));
    },
  },
};

contextBridge.exposeInMainWorld("gezhi", api);
