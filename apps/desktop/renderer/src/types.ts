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
    backlinks(payload: { vault: string; path: string }): Promise<BacklinksResult>;
    outlinks(payload: { vault: string; path: string }): Promise<{ ok: boolean; links: Array<{ target: string; label: string; line: number }> }>;
    stats(vault: string): Promise<IndexStats>;
    dbInfo(): Promise<{ ok: boolean; path?: string; size?: number; exists?: boolean }>;
    onEvent(cb: (channel: string, payload: any) => void): () => void;
  };
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
    case "csv": return "▦";
    case "image": return "▣";
    case "code": return "<>";
    case "text": return "≡";
    default: return "·";
  }
}
