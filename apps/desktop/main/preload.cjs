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
  dshSetup: {
    status: () => ipcRenderer.invoke('dsh:setupStatus'),
    install: () => ipcRenderer.invoke('dsh:install'),
    login: () => ipcRenderer.invoke('dsh:login'),
    complete: () => ipcRenderer.invoke('dsh:completeSetup'),
  },
  companions: {
    roles: () => ipcRenderer.invoke('companions:roles'),
    evaluate: p => ipcRenderer.invoke('companions:evaluate', p),
    history: p => ipcRenderer.invoke('companions:history', p),
    stop: () => ipcRenderer.invoke('companions:stop'),
  },
  learning: {
    catalog: p => ipcRenderer.invoke('learning:catalog', p),
    summary: p => ipcRenderer.invoke('learning:summary', p),
    submit: p => ipcRenderer.invoke('learning:submit', p),
    annotate: p => ipcRenderer.invoke('learning:annotate', p),
    lab: p => ipcRenderer.invoke('learning:lab', p),
    schedule: p => ipcRenderer.invoke('learning:schedule', p),
  },
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
    /**
     * 读 .pptx 的**原始字节** —— 给 pptxviewjs 做 canvas 渲染用。
     * 有 64 MB 上限（结构化克隆要复制一份，超大文件会把渲染进程搞崩），
     * 超限时返回 { ok:false, tooLarge:true }，界面退回文字模式。
     */
    readPptxBytes: (p) => ipcRenderer.invoke("file:readPptxBytes", p),
    /**
     * 读电子表格（.xlsx / .xls / .ods）。
     * 在主进程解析，只回传用到的单元格区域。**不转 PDF** ——
     * 表格要的是看数据，PDF 里只是静态图。
     */
    readSheet: (p) => ipcRenderer.invoke("file:readSheet", p),
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
    /** 关系图谱：一次取整张图（节点 + 边），不逐个文件查 */
    graph: (payload) => ipcRenderer.invoke("search:graph", payload),
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
  // 高保真查看：调用系统上的 LibreOffice 把 Office 文档转 PDF
  // （可选增强 —— 没装 LibreOffice 时 available=false，界面退回文字模式）
  convert: {
    probe: (opts) => ipcRenderer.invoke("convert:probe", opts ?? {}),
    toPdf: (payload) => ipcRenderer.invoke("convert:toPdf", payload),
    cacheInfo: () => ipcRenderer.invoke("convert:cacheInfo"),
    clearCache: () => ipcRenderer.invoke("convert:clearCache"),
  },
  // 日历 / 计划 / 倒计时
  //
  // ★ 语义上分两类（schema 设计的硬规矩）：
  //   events 固定日程，**AI 不可重排**；tasks 可调整的学习任务。
  //   界面上分在两个页签里，不要混用。
  cal: {
    /** 一次拿齐（事件 / 待办 / 倒计时） */
    load: (p) => ipcRenderer.invoke("cal:load", p),
    addEvent: (p) => ipcRenderer.invoke("cal:addEvent", p),
    updateEvent: (p) => ipcRenderer.invoke("cal:updateEvent", p),
    deleteEvent: (p) => ipcRenderer.invoke("cal:deleteEvent", p),
    addTask: (p) => ipcRenderer.invoke("cal:addTask", p),
    toggleTask: (p) => ipcRenderer.invoke("cal:toggleTask", p),
    deleteTask: (p) => ipcRenderer.invoke("cal:deleteTask", p),
    addCountdown: (p) => ipcRenderer.invoke("cal:addCountdown", p),
    deleteCountdown: (p) => ipcRenderer.invoke("cal:deleteCountdown", p),
    info: () => ipcRenderer.invoke("cal:info"),
  },
  // 数字人能力检测
  //
  // ★ 区分两类能力：本地（口型算法、系统语音）不需要密钥；
  //   云端（腾讯云 TTS/ASR）需要凭据。
  //   界面上必须分开说，否则用户以为整个功能都废了。
  avatar: {
    probe: () => ipcRenderer.invoke("avatar:probe"),
    /**
     * 云端合成（腾讯云）。
     * 返回里带 **timings**（字级时间戳）—— 那是口型的真实数据源，
     * 比本地估算准得多。音频是 WAV（裸 PCM 已在主进程包好头）。
     */
    tts: (payload) => ipcRenderer.invoke("avatar:tts", payload ?? {}),
    /** 旧名字，内部走同一个实现（保留是为了不破坏已有调用） */
    ttsTest: (payload) => ipcRenderer.invoke("avatar:ttsTest", payload ?? {}),
    /**
     * 语音识别（录音 → 文字）。
     * 传 WAV 的 base64 —— 渲染进程自己从麦克风采 PCM 包 WAV，
     * 这样不需要引入任何音频编码器。上限 60 秒 / 3 MB。
     */
    asr: (payload) => ipcRenderer.invoke("avatar:asr", payload ?? {}),
    paths: () => ipcRenderer.invoke("avatar:paths"),
  },

  // 设置：凭据管理 + 应用选项
  //
  // ★ 密钥**只进不出**：credStatus 只回传"配没配、什么模式、存在哪、尾号 4 位"，
  //   完整密钥永远不回到渲染进程。
  // ★ 安装包里也绝不放密钥 —— 那等于把账号借给所有装格致的人用。
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (patch) => ipcRenderer.invoke("settings:set", patch ?? {}),
    credStatus: () => ipcRenderer.invoke("settings:credStatus"),
    credSave: (payload) => ipcRenderer.invoke("settings:credSave", payload ?? {}),
    credDelete: (payload) => ipcRenderer.invoke("settings:credDelete", payload ?? {}),
    /** DSH（AI 大脑）是否就绪 —— 没装它 AI 就用不了 */
    dshStatus: () => ipcRenderer.invoke("settings:dshStatus"),
  },

  // 题库与组卷
  //
  // ★ 为什么单独建库（SQLite）而不只用 Markdown：
  //   组卷是"按条件抽题"（来源 + 知识点 + 难度 + 题型叠加），
  //   那是查询不是浏览；几百道题全量读盘再过滤会卡。
  //   题目仍可导出成 Markdown 编辑，这里存的是可检索副本。
  bank: {
    list: (p) => ipcRenderer.invoke("bank:list", p),
    stats: (p) => ipcRenderer.invoke("bank:stats", p),
    byIds: (p) => ipcRenderer.invoke("bank:byIds", p),
    add: (p) => ipcRenderer.invoke("bank:add", p),
    addMany: (p) => ipcRenderer.invoke("bank:addMany", p),
    update: (p) => ipcRenderer.invoke("bank:update", p),
    delete: (p) => ipcRenderer.invoke("bank:delete", p),
    /** 解析 Markdown 文件，先给用户看结果再决定导不导 */
    parseFile: (p) => ipcRenderer.invoke("bank:parseFile", p),
    parseText: (p) => ipcRenderer.invoke("bank:parseText", p),
    parseDocument: (p) => ipcRenderer.invoke('bank:parseDocument', p),
    toMarkdown: (p) => ipcRenderer.invoke("bank:toMarkdown", p),
    savePaper: (p) => ipcRenderer.invoke("bank:savePaper", p),
    papers: (p) => ipcRenderer.invoke("bank:papers", p),
    deletePaper: (p) => ipcRenderer.invoke("bank:deletePaper", p),
    info: () => ipcRenderer.invoke("bank:info"),
  },
};

contextBridge.exposeInMainWorld("gezhi", api);
