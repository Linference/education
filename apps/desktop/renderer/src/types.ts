// 全局类型：preload 暴露的 API
export interface AppInfo {
  name: string;
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  documentsDir: string;
  cwd: string;
}

export interface VaultInfo {
  ok: boolean;
  path?: string;
  name?: string;
  isVault?: boolean;
  vault?: Record<string, unknown> | null;
  configPath?: string;
  error?: string;
}

export interface TreeEntry {
  name: string;
  path: string;
  isDir: boolean;
  ext: string;
  size: number;
  mtime: string | null;
}

export interface ListResult {
  ok: boolean;
  dir?: string;
  entries: TreeEntry[];
  error?: string;
}

export interface TextResult {
  ok: boolean;
  path?: string;
  text?: string;
  size?: number;
  mtime?: string;
  error?: string;
  unsupported?: boolean;
}

export interface BinaryResult {
  ok: boolean;
  path?: string;
  bytes?: Uint8Array;
  size?: number;
  mtime?: string;
  ext?: string;
  error?: string;
  unsupported?: boolean;
}

/** 旧版 .doc 的解析结果 */
export interface DocResult {
  ok: boolean;
  path?: string;
  text?: string;
  /** piece-table = 精确提取；scan-fallback = FIB 不可用时的扫描兜底 */
  method?: string;
  size?: number;
  mtime?: string;
  ms?: number;
  /** true 表示版式有损（.doc 无法还原排版，界面要如实告知） */
  lossy?: boolean;
  error?: string;
  /** 文件其实是 docx 改名而来 */
  isActuallyDocx?: boolean;
}

export interface GezhiApi {
  info(): Promise<AppInfo>;
  vault: {
    pick(): Promise<VaultInfo | null>;
    info(dir: string): Promise<VaultInfo>;
    list(dir: string): Promise<ListResult>;
  };
  file: {
    read(p: string): Promise<TextResult>;
    readBinary(p: string): Promise<BinaryResult>;
    /** 旧版 .doc：主进程解析 OLE 二进制，返回提取出的纯文本 */
    readDoc(p: string): Promise<DocResult>;
    /** 旧版 .ppt：主进程解析 OLE 二进制，返回近似分页的文本 */
    readPpt(p: string): Promise<PptResult>;
    /**
     * 读 .pptx 并**在主进程解析成文字**（超大文件不适合走字节 IPC）。
     * 只在 canvas 渲染不可用时作为退路。
     */
    readPptx?(p: string): Promise<PptResult & { slideCount?: number }>;
    /**
     * 读 .pptx 的**原始字节** —— 给 pptxviewjs 做 canvas 渲染。
     * 超过上限（64 MB）时返回 tooLarge:true，界面应退回文字模式，
     * 而不是当成"打开失败"。
     */
    /**
     * 读电子表格（.xlsx / .xls / .ods）。
     * 主进程解析成单元格，**不转 PDF** —— 表格要的是数据不是静态图。
     */
    readSheet(p: string): Promise<SheetResult>;
    reveal(p: string): Promise<boolean>;
    saveAs(payload: { defaultName: string; data: Uint8Array }): Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>;
  };
  ai: {
    health(): Promise<{ ok: boolean; version?: string | null; bin?: string; error?: string | null }>;
    run(payload: { task: string; cwd: string; sessionId?: string | null; profile?: string }): Promise<{
      ok: boolean; finalText?: string; sessionId?: string | null;
      tokens?: { input: number; output: number }; eventCount?: number; error?: string;
    }>;
    ask(payload: { task: string; cwd: string; sessionId?: string | null }): Promise<{
      ok: boolean; finalText?: string; sessionId?: string | null;
      tokens?: { input: number; output: number }; turns?: number; error?: string;
    }>;
    stop(): Promise<{ ok: boolean; stopped?: boolean }>;
    onEvent(cb: (payload: { seq: number; at: number; event: DshEvent }) => void): () => void;
  };
  // 导出：格式由用户选（产品硬规矩）
  exporter: {
    probe(): Promise<ExportCapabilities>;
    run(payload: {
      format: "pdf" | "docx" | "markdown";
      markdown: string;
      sourcePath: string;
      defaultName?: string;
      author?: string;
      saveAs?: boolean;
      /** 导出到系统"下载"文件夹（组卷出卷走这条），而不是源文件所在目录 */
      toDownloads?: boolean;
    }): Promise<ExportResult>;
    reveal(p: string): Promise<{ ok: boolean; error?: string }>;
  };
  // 全文检索与反向链接
  search: {
    open(vault: string): Promise<{ ok: boolean; stats?: IndexStats; dbPath?: string; error?: string }>;
    reindex(vault: string): Promise<{ ok: boolean; indexed?: number; error?: string }>;
    reindexFile(payload: { vault: string; filePath: string }): Promise<{ ok: boolean; error?: string }>;
    waitIdle(): Promise<{ ok: boolean }>;
    query(payload: { vault: string; query: string; limit?: number }): Promise<SearchResult>;
    /** 关系图谱：一次取整张图（节点 + 边） */
    graph(payload: { vault: string; maxNodes?: number; maxEdges?: number }): Promise<GraphResult>;
    backlinks(payload: { vault: string; path: string }): Promise<BacklinksResult>;
    outlinks(payload: { vault: string; path: string }): Promise<{ ok: boolean; links: Array<{ target: string; label: string; line: number }> }>;
    stats(vault: string): Promise<IndexStats>;
    dbInfo(): Promise<{ ok: boolean; path?: string; size?: number; exists?: boolean }>;
    onEvent(cb: (channel: string, payload: any) => void): () => void;
  };

  // 高保真查看：调用系统/随包的 LibreOffice 把 Office 文档转 PDF
  // 这是**可选增强** —— 没有 LibreOffice 时 available=false，界面退回文字模式
  convert: {
    probe(opts?: { refresh?: boolean }): Promise<SofficeProbe>;
    toPdf(payload: { src: string }): Promise<ConvertResult>;
    cacheInfo(): Promise<{ ok: boolean; dir?: string; bytes?: number; count?: number; error?: string }>;
    clearCache(): Promise<{ ok: boolean; removed?: number; error?: string }>;
  };

  // 日历 / 计划 / 倒计时
  //
  // ★ events 与 tasks 语义不同（schema 设计的硬规矩）：
  //   events 是固定日程（上课、考试），**不可被 AI 重排**；
  //   tasks 是可调整的学习任务，允许 AI 参与安排。
  //   界面上也分两个页签，不要混用。
  cal: {
    load(p: { vault: string; from?: string; to?: string }): Promise<CalendarLoad>;
    addEvent(p: Record<string, unknown>): Promise<{ ok: boolean; id?: string; error?: string }>;
    updateEvent(p: Record<string, unknown>): Promise<{ ok: boolean; unchanged?: boolean; error?: string }>;
    deleteEvent(p: { id: string; vault: string }): Promise<{ ok: boolean; removed?: number; error?: string }>;
    addTask(p: Record<string, unknown>): Promise<{ ok: boolean; id?: string; error?: string }>;
    toggleTask(p: { id: string; vault: string }): Promise<{ ok: boolean; done?: boolean; error?: string }>;
    deleteTask(p: { id: string; vault: string }): Promise<{ ok: boolean; removed?: number; error?: string }>;
    addCountdown(p: Record<string, unknown>): Promise<{ ok: boolean; id?: string; error?: string }>;
    deleteCountdown(p: { id: string; vault: string }): Promise<{ ok: boolean; removed?: number; error?: string }>;
    info(): Promise<{ ok: boolean; path?: string; size?: number; exists?: boolean }>;
  };

  // 数字人能力检测
  //
  // ★ available=false 时 reason 说明缺什么；**不要把它当成"整个功能坏了"**：
  //   口型算法与系统语音是本地能力，不需要密钥。
  avatar: {
    probe(): Promise<AvatarProbe>;
    /**
     * 云端合成。返回带 timings（字级时间戳）—— 口型的真实数据源；
     * 音频是 WAV（裸 PCM 已在主进程包好头，否则浏览器播不了）。
     */
    tts(p: { text?: string; voiceType?: number; speed?: number }): Promise<AvatarTtsResult>;
    ttsTest(p: { text?: string }): Promise<AvatarTtsResult>;
    paths(): Promise<{ ok: boolean; credentials?: string; userData?: string }>;
  };

  // 设置：凭据管理 + 应用选项
  //
  // ★ 密钥只进不出：credStatus 只回传状态与尾号 4 位，完整密钥不回渲染进程。
  // ★ 安装包里也不放密钥 —— 那等于把账号借给所有装格致的人用。
  settings: {
    get(): Promise<{
      ok: boolean;
      settings?: Record<string, unknown>;
      paths?: { settings: string; credentials: string };
      error?: string;
    }>;
    set(patch: Record<string, unknown>): Promise<{ ok: boolean; settings?: Record<string, unknown>; error?: string }>;
    credStatus(): Promise<{
      ok: boolean; path?: string; exists?: boolean; mode?: string | null;
      bytes?: number; updatedAt?: string | null; locked?: boolean;
      tencent?: { configured: boolean; secretIdTail: string | null };
      deepseek?: { configured: boolean; apiKeyTail: string | null };
      error?: string;
    }>;
    credSave(p: {
      tencent?: { secretId: string; secretKey: string };
      deepseek?: { apiKey: string };
      passphrase?: string;
    }): Promise<{ ok: boolean; mode?: string; path?: string; error?: string }>;
    credDelete(p: { which: string }): Promise<{ ok: boolean; removed?: string; error?: string }>;
    dshStatus(): Promise<{
      ok: boolean; available?: boolean; version?: string | null; bin?: string | null;
      error?: string | null; custom?: string; hint?: string | null;
    }>;
  };

  // 题库与组卷
  bank: {
    list(p: { vault: string; type?: string; source?: string; kp?: string; keyword?: string;
              difficultyMin?: number; difficultyMax?: number; limit?: number; offset?: number }):
      Promise<{ ok: boolean; questions?: BankQuestion[]; total?: number; error?: string }>;
    stats(p: { vault: string }): Promise<BankStats>;
    byIds(p: { vault: string; ids: number[] }): Promise<{ ok: boolean; questions?: BankQuestion[]; error?: string }>;
    add(p: Record<string, unknown>): Promise<{ ok: boolean; id?: number; error?: string }>;
    addMany(p: { vault: string; questions: Array<Record<string, unknown>> }):
      Promise<{ ok: boolean; added?: number; failed?: Array<{ index: number; reason: string }>; error?: string }>;
    update(p: Record<string, unknown>): Promise<{ ok: boolean; error?: string }>;
    delete(p: { vault: string; id: number }): Promise<{ ok: boolean; removed?: number; error?: string }>;
    /** 解析 Markdown，**先看结果再决定导不导**（避免一次导进几百道错题） */
    parseFile(p: { filePath: string }): Promise<{
      ok: boolean; questions?: Array<Record<string, unknown>>; warnings?: string[]; count?: number; error?: string;
    }>;
    toMarkdown(p: { vault: string; ids: number[] }): Promise<{ ok: boolean; markdown?: string; count?: number; error?: string }>;
    savePaper(p: { vault: string; title: string; qids: number[]; config?: unknown }):
      Promise<{ ok: boolean; id?: number; error?: string }>;
    papers(p: { vault: string }): Promise<{
      ok: boolean;
      papers?: Array<{ id: number; title: string; qids: number[]; config: unknown; createdAt: string }>;
      error?: string;
    }>;
    deletePaper(p: { vault: string; id: number }): Promise<{ ok: boolean; removed?: number; error?: string }>;
    info(): Promise<{ ok: boolean; path?: string; size?: number; exists?: boolean }>;
  };
}

export interface BankQuestion {
  id: number;
  type: string;
  typeLabel: string;
  stem: string;
  options: Array<{ label: string; text: string }>;
  answer: string;
  solution: string;
  kps: string[];
  difficulty: number;
  source: string;
  year: number | null;
  subject: string;
}

export interface BankStats {
  ok: boolean;
  total?: number;
  byType?: Array<{ type: string; n: number }>;
  bySource?: Array<{ source: string; n: number }>;
  byDiff?: Array<{ difficulty: number; n: number }>;
  bySubject?: Array<{ subject: string; n: number }>;
  byKp?: Array<{ kp: string; n: number }>;
  error?: string;
}

export interface AvatarTtsResult {
  ok: boolean;
  /** WAV 音频（base64） */
  base64?: string | null;
  mime?: string;
  bytes?: number;
  rawBytes?: number;
  codec?: string;
  sampleRate?: number;
  chunks?: number;
  totalMs?: number;
  ms?: number;
  /** 字级时间戳：口型的真实数据源 */
  timings?: Array<{ text: string; beginMs: number; endMs: number }>;
  timingAvailable?: boolean;
  error?: string;
  /** 常见错因的可操作提示（如密钥失效） */
  hint?: string | null;
}

export interface AvatarCap {
  available: boolean;
  reason: string | null;
  /** 口型检测会带上实测帧数 */
  frames?: number;
}

export interface AvatarProbe {
  ok: boolean;
  tts: AvatarCap;
  asr: AvatarCap;
  viseme: AvatarCap;
  credentials: {
    configured: boolean;
    fromEnv?: boolean;
    storeExists?: boolean;
    storeMode?: string | null;
    storePath?: string | null;
  };
  voices?: unknown[];
  voicesWithTiming?: unknown;
  defaultVoice?: unknown;
  limits?: {
    ttsMaxChars?: number | null;
    asr?: { maxSeconds?: number; maxBytes?: number } | null;
  } | null;
  error?: string;
}

export interface CalEventRow {
  id: string; title: string; kind: string;
  start_at: string; end_at?: string | null; all_day?: number;
  location?: string | null; repeat?: string | null; note?: string | null;
}
export interface CalTaskRow {
  id: string; title: string; kind: string;
  due_at?: string | null; est_minutes?: number | null;
  done_at?: string | null; source?: string; goal?: string | null;
}
export interface CountdownRow {
  id: string; title: string; date?: string | null;
  lunar_month?: number | null; lunar_day?: number | null; color?: string | null;
}
export interface CalendarLoad {
  ok: boolean;
  events?: CalEventRow[];
  tasks?: CalTaskRow[];
  countdowns?: CountdownRow[];
  dbPath?: string;
  error?: string;
}

export interface GraphResult {
  ok: boolean;
  /** exists=false 表示"被引用但文件不存在"的悬空链接 */
  nodes?: Array<{ id: string; name: string; ext: string; exists: boolean; degree: number }>;
  edges?: Array<{ source: string; target: string; label: string | null; line: number | null }>;
  /** 图被截断了（库里节点/边超过上限） */
  truncated?: boolean;
  totalDocs?: number;
  totalEdges?: number;
  error?: string;
}

export interface SheetResult {
  ok: boolean;
  /** 解析出的工作表（最多前 8 张） */
  sheets?: Array<{
    name: string;
    rows: string[][];
    rowCount: number;
    colCount: number;
    truncatedRows?: boolean;
    truncatedCols?: boolean;
    error?: string;
  }>;
  /** 工作簿里实际有多少张表 */
  sheetCount?: number;
  ms?: number;
  error?: string;
}

export interface SofficeProbe {
  available: boolean;
  /** 找不到时给用户的说明（界面直接显示） */
  reason: string | null;
  engine: string | null;
  version: string | null;
}

export interface ConvertResult {
  ok: boolean;
  /** 转换后的 PDF 路径（在应用缓存目录里，不在用户库目录） */
  pdfPath?: string;
  bytes?: number;
  ms?: number;
  engine?: string;
  version?: string | null;
  error?: string;
  /** 失败时的建议（例如「装个 LibreOffice」） */
  hint?: string;
}

export interface IndexStats {
  ok?: boolean;
  docs: number;
  chunks: number;
  links: number;
  lastIndexed?: string | null;
}

export interface SearchHit {
  path: string;
  name: string;
  text: string;
  /** 命中片段；FTS 用 \u0001…\u0002 标出命中词 */
  snip: string;
}

export interface SearchResult {
  ok: boolean;
  hits: SearchHit[];
  /** fts = 走索引；like = 短词扫描；like-fallback = 索引无结果的兜底 */
  strategy: "fts" | "like" | "like-fallback" | "none" | string;
  ms: number;
  query?: string;
  error?: string;
}

export interface BacklinksResult {
  ok: boolean;
  total: number;
  files: Array<{
    path: string;
    name: string;
    refs: Array<{ line: number; label: string; target: string }>;
  }>;
  error?: string;
}

// ⚠️ 这个开头被我插入新类型时误删过一次（替换的 `}` 匹配到了本接口的结尾），
//    结果字段体裸露在文件里、构建报 "Unexpected :"。改文件时要注意
//    `}` + 声明 这种锚点在 TypeScript 里非常不唯一。
export interface ExportCapability {
  available: boolean;
  reason?: string | null;
  engine?: string | null;
  template?: boolean;
}

export interface ExportCapabilities {
  pdf: ExportCapability;
  docx: ExportCapability;
  markdown: ExportCapability;
  paths: { templatePath: string; docxScriptPath: string; packed: boolean };
}

export interface ExportResult {
  ok: boolean;
  path?: string;
  size?: number;
  error?: string;
  canceled?: boolean;
  engine?: string;
}

// ---------------------------------------------------------------- DSH 事件
//
// 事件类型来自 packages/dsh-bridge 的 DSH_EVENT_TYPES：
//   session / status / thinking / text / final / tool_call / tool_result
// 这里都带上可选字段，因为 DSH 不同版本可能给不同字段 ——
// 界面要能容错显示，而不是因为缺字段就崩。
export interface DshEvent {
  type: string;
  text?: string;
  sessionId?: string;
  /** status 事件里的阶段名：turn_start / step_start / step_end / turn_end */
  status?: string;
  phase?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  /** tool_call / tool_result */
  tool?: string;
  name?: string;
  callId?: string;
  args?: Record<string, unknown>;
  input?: Record<string, unknown>;
  result?: unknown;
  output?: unknown;
  /** edit 类工具的 diff 素材 */
  old_string?: string;
  new_string?: string;
  path?: string;
  message?: string;
  error?: string;
}

/** 旧版 .ppt 的解析结果 */
export interface PptResult {
  ok: boolean;
  path?: string;
  text?: string;
  /** 按空行切出的近似分页（.ppt 没有可靠的页边界，界面会如实说明） */
  slides?: Array<{ index: number; title: string; lines: string[] }>;
  slideCount?: number;
  method?: string;
  size?: number;
  ms?: number;
  lossy?: boolean;
  approximatePages?: boolean;
  error?: string;
  isActuallyPptx?: boolean;
}

declare global {
  interface Window {
    gezhi: GezhiApi;
  }
}

/** 文件类型分类 —— 决定用哪个查看器 */
export type FileKind =
  | "markdown" | "text" | "csv"
  | "pdf" | "docx" | "doc"
  | "pptx" | "ppt"
  | "xlsx" | "xls"
  | "image" | "code" | "unsupported";

const MD = new Set([".md", ".markdown"]);
const CSV = new Set([".csv", ".tsv"]);          // 表格视图（虚拟滚动），不是当纯文本看
const TEXT = new Set([".txt", ".log", ".rtf"]);
const CODE = new Set([
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".c", ".cpp", ".cc", ".h", ".hpp",
  ".java", ".rs", ".go", ".rb", ".php", ".sh", ".ps1", ".sql", ".json", ".yaml", ".yml",
  ".toml", ".ini", ".conf", ".html", ".css", ".scss", ".vue", ".svelte", ".lua", ".r",
]);
const IMAGE = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".avif"]);

export function kindOf(ext: string): FileKind {
  const e = ext.toLowerCase();
  if (MD.has(e)) return "markdown";
  if (CSV.has(e)) return "csv";
  if (e === ".pdf") return "pdf";
  if (e === ".docx") return "docx";
  if (e === ".doc") return "doc";      // 旧版二进制格式，走主进程解析
  if (e === ".pptx") return "pptx";
  if (e === ".ppt") return "ppt";      // 旧版 OLE 二进制
  // 电子表格：靠内置 LibreOffice 转 PDF 查看（原来只识别不渲染）
  if (e === ".xlsx" || e === ".xls" || e === ".ods") return "xlsx";
  if (IMAGE.has(e)) return "image";
  if (TEXT.has(e)) return "text";
  if (CODE.has(e)) return "code";
  return "unsupported";
}

/** 给文件树用的图标字符（后面可换 SVG，先用轻量方案） */
export function iconFor(entry: { isDir: boolean; ext: string; name: string }): string {
  if (entry.isDir) return "▸";
  const k = kindOf(entry.ext);
  switch (k) {
    case "markdown": return "M";
    case "pdf": return "P";
    case "docx": return "W";
    case "doc": return "W";
    case "pptx": return "P";
    case "ppt": return "P";
    case "xlsx": return "X";
    case "csv": return "▦";
    case "image": return "▣";
    case "code": return "<>";
    case "text": return "≡";
    default: return "·";
  }
}
