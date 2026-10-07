// 格致 · 主界面
//
// 结构照 Obsidian：左侧竖条(ribbon) + 侧栏(文件树) + 中央(标签页+查看器) + 右侧面板 + 底部状态栏。
// 这一版把关键能力补齐：Markdown 渲染、PDF 与 Word 查看、代码高亮、属性面板、字数统计。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppInfo, TreeEntry, VaultInfo, FileKind, SofficeProbe, PptResult } from "./types";
import { kindOf, iconFor } from "./types";
import { renderMarkdown as renderMarkdownForTest } from "./lib/markdown";
import MarkdownView from "./components/MarkdownView";
import PdfViewer from "./components/PdfViewer";
import DocxViewer from "./components/DocxViewer";
import DocViewer from "./components/DocViewer";
import PptViewer from "./components/PptViewer";
import CsvViewer from "./components/CsvViewer";
import SheetViewer from "./components/SheetViewer";
import CodeView from "./components/CodeView";
import AiChat from "./components/AiChat";
import ExportMenu from "./components/ExportMenu";
import MdEditor from "./components/MdEditor";
import SearchPanel from "./components/SearchPanel";
import BacklinksPanel from "./components/BacklinksPanel";
import CalendarPanel from "./components/CalendarPanel";
import SettingsPanel from "./components/SettingsPanel";
import GraphView from "./components/GraphView";
import BankView from "./components/BankView";
import LearningStudio, { type StudioRequest } from "./components/LearningStudio";
import DshOnboarding from './components/DshOnboarding';
import { useSurfaceMotion } from './lib/useSurfaceMotion';
import logoMark from "./assets/gezhi-mark-v3.png";

// ---------------------------------------------------------------- 类型

interface Tab {
  path: string;
  name: string;
  ext: string;
  kind: FileKind;
  text?: string;          // markdown / 文本 / 代码 / .doc 提取出的文字
  bytes?: Uint8Array;     // pdf / docx / 图片
  size: number;
  mtime: string | null;
  error?: string;
  /** .doc 专用：提取方式与耗时（界面上如实展示） */
  docMethod?: string;
  docMs?: number;
  /** true 表示版式有损（旧版二进制只能提取文字） */
  lossyText?: boolean;
  /** .ppt / .pptx 的幻灯片文字（转 PDF 失败时用这个兜底） */
  pptSlides?: Array<{ index: number; title: string; lines: string[] }>;
  /**
   * 电子表格的解析结果（xlsx / xls / ods）。
   * 表格走**原生查看器**（虚拟滚动），不转 PDF。
   */
  sheet?: Array<{
    name: string;
    rows: string[][];
    rowCount: number;
    colCount: number;
    truncatedRows?: boolean;
    truncatedCols?: boolean;
    error?: string;
  }>;
  /** 工作簿里实际有几张表（用于界面提示"只解析了前 N 张"） */
  sheetTotal?: number;
  /**
   * 这份 PDF 是从别的格式转来的（高保真模式）。
   * 有值说明走了 LibreOffice 转换 —— 界面上要如实告知，
   * 否则用户会以为原文件就是 PDF。
   */
  convertedFrom?: string;
  convertMs?: number;
}

// ---------------------------------------------------------------- 图标（内联 SVG，避免引图标库）

const Icon = {
  file: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
    </svg>
  ),
  folder: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  ),
  md: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" /><path d="M6 15V9l3 3 3-3v6" /><path d="M16 9v4a2 2 0 0 0 4 0" />
    </svg>
  ),
  pdf: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h1.5a1.5 1.5 0 0 1 0 3H9v-3zm0 3v2" />
    </svg>
  ),
  doc: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
      <path d="M8 13l1.5 4 1.5-3 1.5 3L14 13" />
    </svg>
  ),
  img: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
    </svg>
  ),
  code: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
    </svg>
  ),
  ppt: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="13" rx="2" /><path d="M12 17v3M8 21h8" />
      <path d="M9 13V7h2.5a2 2 0 0 1 0 4H9" />
    </svg>
  ),
  sheet: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16M15 4v16" />
    </svg>
  ),
  graph: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="6" r="2.5" /><circle cx="19" cy="8" r="2.5" /><circle cx="12" cy="18" r="2.5" />
      <path d="M7.2 7.2l9.6.9M6.3 8.2l4.5 7.6M17.6 10.3l-4.2 5.6" />
    </svg>
  ),
  search: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
    </svg>
  ),
  /** 数字人：用"人 + 声波"表示，比一个星形更能说明它是干什么的 */
  sparkle: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7.5" r="3.6" />
      <path d="M2.6 19.5c0-3.4 2.9-5.9 6.4-5.9s6.4 2.5 6.4 5.9" />
      <path d="M18.6 5v9M21.6 7.5v4" />
    </svg>
  ),
  calendar: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  ),
  book: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  settings: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.5.55.87 1.06.98H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

function FileIcon({ ext, isDir }: { ext: string; isDir: boolean }) {
  if (isDir) return <Icon.folder />;
  const k = kindOf(ext);
  if (k === "markdown") return <Icon.md />;
  if (k === "pdf") return <Icon.pdf />;
  if (k === "docx" || k === "doc") return <Icon.doc />;
  if (k === "pptx" || k === "ppt") return <Icon.ppt />;
  if (k === "csv") return <Icon.sheet />;
  if (k === "image") return <Icon.img />;
  if (k === "code") return <Icon.code />;
  return <Icon.file />;
}

// ---------------------------------------------------------------- 工具

function fmtSize(n: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function countWords(text: string): { words: number; chars: number } {
  const chars = text.length;
  // 中文按字数算，英文按空格分词 —— 与 Obsidian 的口径接近
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) ?? []).length;
  const latin = (text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, " ").match(/[A-Za-z0-9_'-]+/g) ?? []).length;
  return { words: cjk + latin, chars };
}

/**
 * 是否值得算字数。
 *
 * ⚠️ 实测：一个 42 MB 的 CSV 会在状态栏显示"11504567 个词 · 44836846 个字符"，
 *    但那两个数字对表格毫无意义，而且每切换一次标签都要全文扫两遍正则 ——
 *    纯属白烧 CPU。
 *    所以：**CSV 不算字数**（表格有自己的行数×列数统计），
 *    超大文本也只报字符数不跑正则。
 */
const WORD_COUNT_MAX = 2 * 1024 * 1024;   // 2 MB 以内才算词数

// ---------------------------------------------------------------- 应用

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try { return localStorage.getItem("gezhi.theme.v2") === "dark" ? "dark" : "light"; }
    catch { return "light"; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("gezhi.theme.v2", theme); } catch { /* keep theme usable if storage is full */ }
  }, [theme]);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [tree, setTree] = useState<TreeEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [children, setChildren] = useState<Map<string, TreeEntry[]>>(new Map());
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("就绪");
  const [rightWidth, setRightWidth] = useState(340);
  const [leftWidth, setLeftWidth] = useState(260);
  const [showRight, setShowRight] = useState(true);
  const [showLeft, setShowLeft] = useState(true);
  const [rightTab, setRightTab] = useState<"ai" | "info" | "links" | "settings">("ai");
  /**
   * 中间栏显示什么。
   *   files —— 平常的文件标签页
   *   graph —— 关系图谱（链接关系可视化）
   *   bank  —— 题库组卷
   * 图谱与题库做成"换视图"而不是弹窗：它们要看的内容量大，弹窗挤不下。
   */
  const [mainView, setMainView] = useState<"files" | "graph" | "bank" | "learning">("files");
  const centerMotion = useSurfaceMotion<HTMLDivElement>(mainView);
  const [studioRequest, setStudioRequest] = useState<StudioRequest>({ view: 'teach' });
  const openStudio = (request: StudioRequest = { view: 'teach' }) => {
    setStudioRequest({ ...request, nonce: Date.now() });
    setMainView('learning');
  };
  /** 左栏视图：文件树 / 全文检索 */
  /**
   * 左栏视图。
   *
   * ★ 归类原则（照 Obsidian 的分法）：
   *   左栏 = 导航与工具（文件、检索、日历）
   *   右栏 = 当前文件的上下文（AI 助手、信息、反向链接、设置）
   *   角色统一从学习工作室进入，避免重复的数字人入口。
   */
  const [leftView, setLeftView] = useState<"files" | "search" | "cal">("files");
  const sidebarMotion = useSurfaceMotion<HTMLDivElement>(leftView + ':' + showLeft, 5);
  /** 索引版本号：索引完成后 +1，用来触发反链面板重新拉取 */
  const [indexVersion, setIndexVersion] = useState(0);
  /** 索引状态（界面上显示"已索引 N 篇"） */
  const [indexStatus, setIndexStatus] = useState<{ docs: number; chunks: number; links: number } | null>(null);

  // ---------- 高保真查看（LibreOffice 转换）----------
  /** 是否启用高保真查看。默认开 —— 有 LibreOffice 就享受，没有就自动退回文字模式 */
  const [hiFiEnabled, setHiFiEnabled] = useState(true);
  /** LibreOffice 能力探测结果（null = 还没探测完） */
  const [soffice, setSoffice] = useState<SofficeProbe | null>(null);
  /** 文件名过滤（左栏文件树用；与全文检索是两回事） */
  const [filter, setFilter] = useState("");
  const filterRef = useRef<HTMLInputElement>(null);
  /** 筛选时是否正在预加载整棵树（加载完过滤才准确） */
  const [filterLoading, setFilterLoading] = useState(false);

  // ---------- 新建 / 重命名 / 删除 ----------
  /**
   * 新建时的输入状态。
   * 用"内联输入框"而不是弹窗：Obsidian 就是这么做的，
   * 而且不打断视线（弹窗要移动鼠标到屏幕中央再移回来）。
   */
  const [creating, setCreating] = useState<{ kind: "file" | "folder"; dir: string; depth: number } | null>(null);
  const [newName, setNewName] = useState("");
  const createInputRef = useRef<HTMLInputElement>(null);
  /** 正在重命名的条目路径 */
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  /** 右键菜单：{x, y, entry} */
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; entry: TreeEntry | null } | null>(null);
  /** 操作结果提示（成功/失败都在树上方显示一行） */
  const [fsNotice, setFsNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // ---------- 编辑 / 阅读模式 ----------
  /**
   * 每个文件各自的显示模式（默认阅读）。
   *
   * 为什么按文件记而不是全局一个 mode：
   *   1. 全局 mode 时，切文件要"重置"，而重置的 useEffect 会和
   *      "新建后自动进编辑模式"打架 —— 实测就是新建完停在阅读模式。
   *   2. 按文件记更符合直觉：切回一个你刚才在编辑的文件，应该回到编辑模式。
   */
  const [modeByPath, setModeByPath] = useState<Map<string, "read" | "edit">>(new Map());
  const mode: "read" | "edit" = (activePath && modeByPath.get(activePath)) || "read";
  const setMode = useCallback((m: "read" | "edit" | ((prev: "read" | "edit") => "read" | "edit")) => {
    if (!activePath) return;
    setModeByPath((prev) => {
      const cur = prev.get(activePath) ?? "read";
      const next = typeof m === "function" ? m(cur) : m;
      const map = new Map(prev);
      map.set(activePath, next);
      return map;
    });
  }, [activePath]);
  /** 有未保存改动的文件路径集合 */
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  /** 编辑器里的实时内容（按路径存，切换标签不丢） */
  const [drafts, setDrafts] = useState<Map<string, string>>(new Map());

  const activeTab = useMemo(() => tabs.find((t) => t.path === activePath) ?? null, [tabs, activePath]);
  const viewerMotion = useSurfaceMotion<HTMLDivElement>(mainView + ':' + (activePath || '') + ':' + (activePath ? modeByPath.get(activePath) || 'read' : 'read'), 5);
  const readingScroll=useRef(new Map<string,number>());
  useEffect(()=>{
    const viewer=viewerMotion.current;
    if(mainView!=='files'||!activePath||!viewer)return;
    const key=activePath+'\0'+(modeByPath.get(activePath)||'read');
    const frame=requestAnimationFrame(()=>{viewer.scrollTop=readingScroll.current.get(key)||0;});
    const remember=()=>readingScroll.current.set(key,viewer.scrollTop);
    viewer.addEventListener('scroll',remember);
    return()=>{cancelAnimationFrame(frame);remember();viewer.removeEventListener('scroll',remember);};
  },[mainView,activePath,modeByPath]);

  useEffect(() => {
    window.gezhi.info()
      .then((i) => {
        setInfo(i);
        // 从命令行带了库路径就直接打开（试用/开发时省掉选目录这一步）
        const arg = (i as any).vaultFromArgv as string | null | undefined;
        if (arg) {
          window.gezhi.vault.info(arg).then((v) => { void loadVault(v); }).catch(() => { /* 忽略 */ });
        }
      })
      .catch((e) => setStatus("初始化失败：" + e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- 打开库
  const loadVault = useCallback(async (v: VaultInfo) => {
    if (!v.ok || !v.path) { setStatus("打开失败：" + (v.error ?? "未知错误")); return; }
    // 告诉主进程当前库 —— 文件写入的路径校验要用（防止写到库外面）
    await window.gezhi.vault.set(v.path);
    setVault(v);
    setStudioRequest({ view: 'teach' });
    setExpanded(new Set());
    setChildren(new Map());
    setTabs([]);
    setActivePath(null);
    setFilter("");
    setCreating(null);
    setRenaming(null);
    setDirty(new Set());
    setDrafts(new Map());
    setMode("read");
    setLoading(true);
    try {
      const r = await window.gezhi.vault.list(v.path);
      setTree(r.entries ?? []);
      setStatus(`已打开 ${v.name}（${(r.entries ?? []).length} 项）`);
    } catch (e: any) {
      setStatus("列目录失败：" + e.message);
    } finally {
      setLoading(false);
    }

    // 触发后台索引（不阻塞界面）。索引完成后会通过事件通知，
    // 界面据此刷新统计与反链面板。
    window.gezhi.search.open(v.path).then((r) => {
      if (r?.stats) setIndexStatus(r.stats);
    }).catch(() => { /* 索引失败不影响基本使用 */ });
  }, []);

  // 启动时探测 LibreOffice（决定 PPT/Word 走高保真还是文字模式）
  useEffect(() => {
    window.gezhi.convert.probe({})
      .then((p) => {
        setSoffice(p);
        if (!p.available) {
          // 没装也不报错 —— 只是少一个增强功能，文字模式照样能用
          setStatus("提示：装上 LibreOffice 后，PPT/Word 可以高保真查看（不用额外配置）");
        }
      })
      .catch(() => setSoffice({ available: false, reason: "探测失败", engine: null, version: null }));
  }, []);

  // 订阅索引事件：完成后刷新统计并让反链面板重新拉数据
  useEffect(() => {
    const off = window.gezhi.search.onEvent((chan, p) => {
      if (chan === "search:indexed") {
        setIndexVersion((v) => v + 1);
        setIndexStatus({ docs: p?.indexed ?? 0, chunks: p?.chunks ?? 0, links: p?.links ?? 0 });
        setStatus(`索引已更新：${p?.indexed ?? 0} 篇变化，共 ${p?.scanned ?? 0} 篇`);
      } else if (chan === "search:error") {
        setStatus("索引出错：" + String(p?.error ?? ""));
      }
    });
    return off;
  }, []);

  const openVaultDialog = useCallback(async () => {
    const v = await window.gezhi.vault.pick();
    if (v) await loadVault(v);
  }, [loadVault]);

  // 目录展开
  /**
   * 刷新文件树（丢弃所有缓存重新读盘）。
   *
   * 什么时候要调：① 用户手动刷新 ② **AI 改过文件之后**。
   * 第②点很关键 —— AI 新建/修改了笔记，树不刷新用户就以为它没干活。
   * 必须连 children 缓存一起清，否则展开过的目录还是旧内容（这个坑踩过一次）。
   */
  const refreshTree = useCallback(async () => {
    if (!vault?.path) return;
    setChildren(new Map());
    const r = await window.gezhi.vault.list(vault.path);
    setTree(r.entries ?? []);
    // 已展开的目录要重新拉一遍，否则它们显示的还是改之前的内容
    const dirs = [...expanded];
    if (dirs.length) {
      const next = new Map<string, TreeEntry[]>();
      for (const d of dirs) {
        const rr = await window.gezhi.vault.list(d);
        next.set(d, rr.entries ?? []);
      }
      setChildren(next);
    }
  }, [vault, expanded]);

  // ---------------------------------------------------------------- 文件操作
  // 新建 / 重命名 / 删除。全部走主进程的 fsx IPC（渲染进程没有 fs），
  // 主进程那边会做**路径必须在库内**的校验。

  /**
   * openFile 的 ref。
   * 为什么需要：新建文件后要立刻打开它，而 openFile 定义在后面。
   * 用 ref 转发比调整定义顺序安全 —— 那些函数互相依赖，
   * 硬挪顺序容易踩到 TDZ（这个项目已经被 TDZ 坑过一次）。
   */
  const openFileRef = useRef<((entry: TreeEntry) => Promise<void>) | null>(null);

  /**
   * 按完整路径打开文件。
   *
   * 图谱点节点、题库点题目都要用它 —— 那两处手里只有路径，
   * 没有 TreeEntry（它得先列目录才知道）。
   * 所以这里"由路径反查 entry 再交给 openFile"，
   * 保证和图树上点开走的是**同一条**打开逻辑（格式路由、查看器选择都不重复实现）。
   */
  const openFileByPath = useCallback(async (fullPath: string) => {
    try {
      const sep = fullPath.includes("\\") ? "\\" : "/";
      const dir = fullPath.slice(0, fullPath.lastIndexOf(sep));
      const name = fullPath.slice(fullPath.lastIndexOf(sep) + 1);
      const r = await window.gezhi.vault.list(dir);
      if (r?.ok === false) { setStatus("打开失败：" + (r.error ?? "目录读不到")); return; }
      const entry = r.entries.find((e) => e.name === name);
      if (!entry) { setStatus(`打开失败：找不到 ${name}`); return; }
      // openFile 是通过 ref 拿的，避开"定义在后面"的循环依赖
      await openFileRef.current?.(entry);
    } catch (e: any) {
      setStatus("打开失败：" + (e?.message ?? e));
    }
  }, []);

  /** 统一的失败提示 */
  const fsFail = (e: any) => setFsNotice({ ok: false, text: e?.message ?? String(e) });

  const openCreate = useCallback((kind: "file" | "folder", dir: string, depth: number) => {
    // 目标目录若收起则展开，让输入框可见
    setExpanded((prev) => new Set([...prev, dir]));
    setCreating({ kind, dir, depth });
    setNewName("");
    setTimeout(() => createInputRef.current?.focus(), 50);
  }, []);

  const submitCreate = useCallback(async () => {
    if (!creating || !newName.trim()) { setCreating(null); return; }
    const api = window.gezhi.fsx;
    const r = creating.kind === "file"
      ? await api.createFile({ dir: creating.dir, name: newName.trim() })
      : await api.createFolder({ dir: creating.dir, name: newName.trim() });

    if (!r.ok) { setFsNotice({ ok: false, text: r.error }); return; }

    setFsNotice({ ok: true, text: `已新建 ${creating.kind === "file" ? "文件" : "文件夹"}「${r.name}」` });
    const created = r;
    setCreating(null);
    setNewName("");

    // 让新条目可见：展开它所在的目录 + 刷新缓存
    if (vault?.path) {
      const parentDir = creating.dir;
      setChildren((prev) => {
        const next = new Map(prev);
        next.delete(parentDir);        // 丢掉这个目录的缓存，重读
        return next;
      });
      setExpanded((prev) => new Set([...prev, parentDir]));
    }
    await refreshTree();

    // 新建文件后直接打开它（用户建文件就是为了写内容）
    if (creating.kind === "file" && created.path) {
      const name = created.name;
      const dir = creating.dir;
      const rr = await window.gezhi.vault.list(dir);
      const entry = rr.entries.find((x) => x.name === name);
      if (entry) {
        await openFileRef.current?.(entry);
        // 直接进编辑模式 —— 建文件就是为了写。
        // ⚠️ 早先这里是 setMode("edit")，但当时 mode 是全局状态，
        //    会被"切文件重置成阅读"的 effect 覆盖掉，结果停在阅读模式（真 bug）。
        //    现在模式按文件记，直接写这个文件自己的模式，不会被覆盖。
        setModeByPath((prev) => new Map(prev).set(entry.path, "edit"));
      }
    }
  }, [creating, newName, vault, refreshTree]);

  const submitRename = useCallback(async (target: string) => {
    const v = renameValue.trim();
    if (!v) { setRenaming(null); return; }
    const r = await window.gezhi.fsx.rename({ target, newName: v });
    setRenaming(null);
    if (!r.ok) { setFsNotice({ ok: false, text: r.error }); return; }
    if (r.unchanged) return;
    setFsNotice({ ok: true, text: `已重命名为「${r.name}」` });

    // 如果重命名的是当前打开的文件，标签页也要跟着改
    setTabs((prev) => prev.map((t) => t.path === target ? { ...t, path: r.path!, name: r.name! } : t));
    setActivePath((p) => (p === target ? r.path! : p));
    // 草稿与脏标记也要跟着搬（否则重命名后编辑器内容会"丢"）
    setDrafts((prev) => {
      if (!prev.has(target)) return prev;
      const next = new Map(prev);
      next.set(r.path!, next.get(target)!);
      next.delete(target);
      return next;
    });
    setDirty((prev) => {
      if (!prev.has(target)) return prev;
      const next = new Set(prev);
      next.delete(target);
      next.add(r.path!);
      return next;
    });
    await refreshTree();
  }, [renameValue, refreshTree]);

  const doDelete = useCallback(async (entry: TreeEntry) => {
    const label = entry.isDir ? "文件夹" : "文件";
    // 删除文件夹时提示会连带删除内容
    const extra = entry.isDir ? "（连同里面的所有内容）" : "";
    if (!window.confirm(`删除${label}「${entry.name}」${extra}？\n\n会移到回收站，可以从那里恢复。`)) return;
    const r = await window.gezhi.fsx.remove({ target: entry.path });
    if (!r.ok) { setFsNotice({ ok: false, text: r.error }); return; }
    setFsNotice({ ok: true, text: `已删除「${entry.name}」（在回收站）` });
    // 关掉相关标签页
    setTabs((prev) => prev.filter((t) => t.path !== entry.path && !t.path.startsWith(entry.path + "\\") && !t.path.startsWith(entry.path + "/")));
    if (activePath && (activePath === entry.path || activePath.startsWith(entry.path))) setActivePath(null);
    await refreshTree();
  }, [refreshTree, activePath]);

  /**
   * 保存当前文件。
   *
   * 三个要点：
   *   1. 写的是**草稿内容**（编辑器里的实时值），不是打开时的原文
   *   2. 成功后清掉 dirty 标记，并把 tab.text 更新为已保存内容
   *   3. 失败要显式提示 —— 静默失败等于用户以为存了其实没存
   */
  const saveActive = useCallback(async () => {
    const tab = tabs.find((t) => t.path === activePath);
    if (!tab) return false;
    const text = drafts.get(tab.path);
    if (text === undefined || !dirty.has(tab.path)) return true;

    setStatus("正在保存…");
    const r = await window.gezhi.fsx.writeText({ path: tab.path, text });
    if (!r.ok) {
      setStatus("保存失败：" + r.error);
      setFsNotice({ ok: false, text: "保存失败：" + r.error });
      return false;
    }
    setDirty((prev) => { const n = new Set(prev); n.delete(tab.path); return n; });
    setTabs((prev) => prev.map((t) => t.path === tab.path ? { ...t, text, size: r.size ?? t.size } : t));
    setStatus(`已保存 ${tab.name}`);
    setFsNotice({ ok: true, text: `已保存「${tab.name}」` });

    // 保存后重新索引这个文件 —— 否则刚写的内容搜不到，
    // 而且新加的 [[wikilink]] 也不会出现在反向链接里。
    //
    // ⚠️ 必须 `await` 之后再递增 indexVersion。
    //    早先是 `.then(() => setIndexVersion(v => v+1))`，问题在于：
    //    反链面板可能在**索引真正完成之前**就收到版本变化并重新查询，
    //    于是拿到旧数据（实测出现过：刚写完 [[索引页]] 的反链显示 0 处）。
    //    先等索引落库再通知，面板才拉得到新数据。
    if (vault?.path) {
      try {
        await window.gezhi.search.reindexFile({ vault: vault.path, filePath: tab.path });
        setIndexVersion((v) => v + 1);
      } catch { /* 索引失败不阻断保存流程 */ }
    }
    return true;
  }, [tabs, activePath, drafts, dirty, vault]);

  // 右键菜单：点别处关掉
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("blur", close); };
  }, [ctxMenu]);

  // 切换文件时不再无条件重置模式 —— 模式按文件记（见 modeByPath 的说明）。
  // 这条 effect 只做一件事：文件被删/关掉后清掉它的模式记录，避免 Map 无限增长。
  useEffect(() => {
    setModeByPath((prev) => {
      if (prev.size <= 40) return prev;
      const keep = new Set(tabs.map((t) => t.path));
      const next = new Map<string, "read" | "edit">();
      for (const [k, v] of prev) if (keep.has(k)) next.set(k, v);
      return next;
    });
  }, [tabs]);

  const toggleDir = useCallback(async (entry: TreeEntry) => {
    const next = new Set(expanded);
    if (next.has(entry.path)) {
      next.delete(entry.path);
    } else {
      next.add(entry.path);
      if (!children.has(entry.path)) {
        const r = await window.gezhi.vault.list(entry.path);
        setChildren((prev) => new Map(prev).set(entry.path, r.entries ?? []));
      }
    }
    setExpanded(next);
  }, [expanded, children]);

  // ---------------------------------------------------------------- 打开文件
  const openFile = useCallback(async (entry: TreeEntry) => {
    if (tabs.some((t) => t.path === entry.path)) { setActivePath(entry.path); return; }
    const kind = kindOf(entry.ext);

    /**
     * ★ 只有 **幻灯片** 走 LibreOffice 转 PDF。
     *
     * 为什么只有 PPT：
     *   · PPT 是**版式驱动**的 —— 位置、图片、配色、母版决定一切，
     *     纯 JS 提取文字等于没有内容（实测 15 MB 课件只提出 2 KB 文字）。
     *     转成 PDF 交给已有的 PDF 查看器，视觉 100% 还原。
     *
     * 为什么 Word / Excel **不转**：
     *   · .docx 本质是"流式文档"，有原生渲染器就能正常看；
     *     转 PDF 反而慢，而且丢掉了文字可选中、可复制的优势
     *   · .xlsx / .csv 是**表格数据**，用户要的是排序、筛选、看单元格，
     *     **转成 PDF 是错的** —— PDF 里只是一张静态图，没法用
     *
     * 旧版 .doc / .ppt（97-2003 二进制）没有纯 JS 渲染库，
     *   .doc 走原生解析出文字，.ppt 也转入 PDF（版式同样重要）。
     */
    const needsPdfConversion = kind === "pptx" || kind === "ppt";
    if (needsPdfConversion && hiFiEnabled) {
      setLoading(true);
      setStatus(`正在转换 ${entry.name}（首次约 10~40 秒）…`);
      try {
        const c = await window.gezhi.convert.toPdf({ src: entry.path });
        if (c.ok && c.pdfPath) {
          // 读出转换后的 PDF 字节，走 PDF 查看器
          const b = await window.gezhi.file.readBinary(c.pdfPath);
          if (b.ok && b.bytes) {
            setTabs((prev) => [...prev, {
              path: entry.path,
              name: entry.name,
              ext: entry.ext,
              kind: "pdf",
              size: entry.size,
              mtime: entry.mtime,
              bytes: b.bytes!,
              // 标记来源：界面上要说清楚这是转换来的，不是原始 PDF
              convertedFrom: entry.ext,
              convertMs: c.ms,
            }]);
            setActivePath(entry.path);
            setStatus(`已高保真打开 ${entry.name}（转换耗时 ${((c.ms ?? 0) / 1000).toFixed(1)}s）`);
            return;
          }
        }
        // 转换失败 → 退回文字模式，并把原因告诉用户
        setStatus(`高保真转换失败，已用文字模式：${c.error ?? "未知原因"}`);
        if (c.hint) setFsNotice({ ok: false, text: `${c.error}。${c.hint}` });
      } catch (e: any) {
        setStatus("高保真转换出错，已用文字模式：" + e.message);
      }
    }

    setLoading(true);
    try {
      const base = { path: entry.path, name: entry.name, ext: entry.ext, kind, size: entry.size, mtime: entry.mtime };
      let tab: Tab;

      if (kind === "pdf" || kind === "docx" || kind === "image") {
        // docx 走原生渲染器（流式文档，不需要转 PDF）
        const r = await window.gezhi.file.readBinary(entry.path);
        tab = r.ok
          ? { ...base, bytes: r.bytes! }
          : { ...base, error: r.error ?? "读取失败" };
      } else if (kind === "xlsx") {
        // ★ 电子表格走**原生表格查看器**，不转 PDF。
        //   表格数据要能排序、筛选、看单元格 —— PDF 里只是静态图，没法用。
        const r = await window.gezhi.file.readSheet(entry.path);
        tab = r.ok
          ? { ...base, sheet: r.sheets, sheetTotal: r.sheetCount, docMs: r.ms }
          : { ...base, error: r.error ?? "读取失败" };
      } else if (kind === "pptx") {
        /**
         * .pptx 高保真模式已在上面处理（转 PDF）。
         * 走到这里说明开关关了、或引擎不可用 —— 退回文字模式。
         */
        const r = await window.gezhi.file.readPptx?.(entry.path);
        tab = r?.ok
          ? { ...base, pptSlides: (r as PptResult).slides, docMs: r.ms, lossyText: true }
          : { ...base, error: r?.error ?? "读取失败" };
      } else if (kind === "doc" || kind === "ppt") {
        // 旧版 Office 二进制（OLE 复合文档）必须走主进程解析器 ——
        // 渲染进程没有 fs，而且解析是 Node 侧的 Buffer 操作。
        // 纯 JS 生态**没有**这两个格式的渲染库（连 VS Code 的 Office 插件也不支持）。
        const r = kind === "doc"
          ? await window.gezhi.file.readDoc(entry.path)
          : await window.gezhi.file.readPpt(entry.path);
        tab = r.ok
          ? {
              ...base,
              text: r.text,
              docMethod: r.method,
              docMs: r.ms,
              lossyText: r.lossy,
              // .ppt 的近似分页也带上，查看器直接渲染
              pptSlides: kind === "ppt" ? (r as PptResult).slides : undefined,
            }
          : { ...base, error: r.error ?? "读取失败" };
      } else {
        const r = await window.gezhi.file.read(entry.path);
        tab = r.ok
          ? { ...base, text: r.text!, size: r.size ?? entry.size, mtime: r.mtime ?? entry.mtime }
          : { ...base, error: r.error ?? "读取失败" };
      }

      setTabs((prev) => [...prev, tab]);
      setActivePath(entry.path);
      setStatus(tab.error ? `打开失败：${tab.error}` : `已打开 ${entry.name}`);
    } finally {
      setLoading(false);
    }
  }, [tabs]);

  // 让前面（新建文件后自动打开）能调到 openFile
  useEffect(() => { openFileRef.current = openFile; }, [openFile]);

  const closeTab = useCallback((path: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTabs((prev) => {
      const i = prev.findIndex((t) => t.path === path);
      const next = prev.filter((t) => t.path !== path);
      if (activePath === path) setActivePath(next[Math.min(i, next.length - 1)]?.path ?? null);
      return next;
    });
  }, [activePath]);

  // wikilink 跳转：在当前库里按文件名找
  const followWikilink = useCallback(async (target: string) => {
    const name = target.split("#")[0].trim();
    if (!name || !vault?.path) return;
    const find = async (dir: string, depth: number): Promise<TreeEntry | null> => {
      if (depth > 6) return null;
      const r = await window.gezhi.vault.list(dir);
      for (const e of r.entries ?? []) {
        if (!e.isDir && (e.name === name || e.name === `${name}.md`)) return e;
      }
      for (const e of r.entries ?? []) {
        if (e.isDir) {
          const hit = await find(e.path, depth + 1);
          if (hit) return hit;
        }
      }
      return null;
    };
    const hit = await find(vault.path, 0);
    if (hit) await openFile(hit);
    else setStatus(`找不到笔记「${name}」`);
  }, [vault, openFile]);

  // ---------------------------------------------------------------- 分栏拖拽
  const dragRef = useRef<{ side: "left" | "right"; startX: number; startW: number } | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      if (d.side === "left") setLeftWidth(Math.max(180, Math.min(520, d.startW + dx)));
      else setRightWidth(Math.max(200, Math.min(560, d.startW - dx)));
    };
    const onUp = () => { dragRef.current = null; document.body.style.cursor = ""; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  // ---------------------------------------------------------------- 测试钩子
  //
  // 为什么需要它：自动化无法操作系统的"打开文件夹"对话框，所以没法端到端验证
  // "点开文件 → 看到正确渲染"这条最关键的用户路径。
  //
  // 启用条件：**URL 带 ?test=1**（或开发模式）。
  // 为什么用查询参数而不是 import.meta.env.PROD：
  //   生产构建里 PROD 恒为 true，若按它来守卫，就永远测不了"打包后的真实产物"——
  //   而那恰恰是最该测的。用显式参数，平时用户不会带，自动化可以带；
  //   且这个钩子本身只暴露两个"打开库/打开文件"的方法，没有额外权限。
  const testMode =
    new URLSearchParams(window.location.search).has("test") ||
    !import.meta.env.PROD;

  useEffect(() => {
    if (!testMode) return;
    (window as any).__gezhiTest = {
      openVault: (dir: string) => window.gezhi.vault.info(dir).then(loadVault),
      openFileByPath: async (p: string) => {
        const dir = p.slice(0, p.lastIndexOf("\\"));
        const name = p.slice(p.lastIndexOf("\\") + 1);
        const r = await window.gezhi.vault.list(dir);
        const entry = r.entries.find((e) => e.name === name);
        if (!entry) throw new Error(`找不到 ${name}`);
        await openFile(entry);
        return entry.path;
      },
      state: () => ({ tabs: tabs.map((t) => t.name), active: activePath, vault: vault?.name ?? null }),
    };
    // 渲染函数也挂到 window 上：自动化测试要用**同一份实现**生成对比图，
    // 不能在测试里另写近似版（那样验证的不是真代码）
    (window as any).__gezhiRenderMarkdown = renderMarkdownForTest;
    return () => {
      delete (window as any).__gezhiTest;
      delete (window as any).__gezhiRenderMarkdown;
    };
  }, [testMode, loadVault, openFile, tabs, activePath, vault]);

  // ---------------------------------------------------------------- 快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "o") { e.preventDefault(); openVaultDialog(); }
      if (e.key.toLowerCase() === "w" && activePath) { e.preventDefault(); closeTab(activePath); }
      if (e.key.toLowerCase() === "b") { e.preventDefault(); setShowRight((s) => !s); }
      if (e.key.toLowerCase() === "e") { e.preventDefault(); setShowLeft((s) => !s); }
      // Ctrl+S 保存
      if (e.key.toLowerCase() === "s") { e.preventDefault(); void saveActive(); }
      // Ctrl+E 已被占用（折叠侧栏），编辑/阅读切换用 Ctrl+Shift+E
      if (e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setMode((m) => (m === "read" ? "edit" : "read"));
      }
      // Ctrl+N 新建文件
      if (e.key.toLowerCase() === "n" && vault?.path) {
        e.preventDefault();
        openCreate("file", vault.path, 0);
      }
      // Ctrl+F：聚焦文件名过滤（不是全文搜索 —— 全文搜索要等索引建好，见 P3）
      if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        setShowLeft(true);
        setTimeout(() => filterRef.current?.focus(), 60);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openVaultDialog, closeTab, activePath, saveActive, vault, openCreate]);

  // ---------------------------------------------------------------- 渲染

  /**
   * 筛选文件名时**预加载整棵树**。
   *
   * 为什么必须这样：判断"某个目录该不该显示"要看它下面有没有匹配的文件，
   * 而目录默认是**懒加载**的 —— 没展开过就没有子项数据，只能保守显示。
   * 结果就是：筛一个根本不存在的东西，目录还全列在那儿，用户看不到
   * "没有匹配"的提示，以为筛选坏了。实测踩过。
   *
   * 树的规模是"一个学生的资料库"（几百到几千个文件），一次全读没问题；
   * 真到几万个文件再换索引式搜索，而不是在这里打补丁。
   */
  useEffect(() => {
    if (!vault?.path || !filter.trim()) return;
    const vaultPath = vault.path;
    let cancelled = false;

    (async () => {
      setFilterLoading(true);
      const acc = new Map<string, TreeEntry[]>();
      let dirsRead = 0;

      const walk = async (dir: string, depth: number) => {
        if (cancelled || depth > 8 || dirsRead > 2000) return;
        if (acc.has(dir)) return;
        dirsRead++;
        const r = await window.gezhi.vault.list(dir);
        const entries = r.entries ?? [];
        acc.set(dir, entries);
        for (const e of entries) {
          if (e.isDir) await walk(e.path, depth + 1);
        }
      };

      await walk(vaultPath, 0);
      if (cancelled) return;
      setChildren(acc);

      // 展开所有含匹配项的目录，让用户直接看到结果
      const q = filter.trim().toLowerCase();
      const toExpand = new Set<string>();
      const hasMatch = (list: TreeEntry[]): boolean =>
        list.some((e) => (e.isDir ? hasMatch(acc.get(e.path) ?? []) : e.name.toLowerCase().includes(q)));
      const expand = (list: TreeEntry[], prefix: string[]) => {
        for (const e of list) {
          if (e.isDir) {
            const kids = acc.get(e.path) ?? [];
            if (hasMatch(kids)) {
              toExpand.add(e.path);
              for (const p of prefix) toExpand.add(p);
              expand(kids, [...prefix, e.path]);
            }
          }
        }
      };
      expand(acc.get(vaultPath) ?? [], []);
      if (toExpand.size) setExpanded((prev) => new Set([...prev, ...toExpand]));

      setFilterLoading(false);
    })();

    return () => { cancelled = true; };
  }, [filter, vault]);

  /**
   * 渲染文件树。
   *
   * 有过滤词时：只显示匹配的文件，以及**通往匹配文件的那几层目录**
   * （否则用户看到一个孤零零的文件，不知道它在哪个目录下）。
   * 目录本身不参与匹配 —— 过滤的是"要找的文件"。
   */
  const renderTree = (entries: TreeEntry[], depth: number): React.ReactNode => {
    const q = filter.trim().toLowerCase();

    /**
     * 不该出现在文件树里的东西。
     *
     * `.bak` 是**保存时自动生成的备份**（防编辑器 bug 把笔记写坏）。
     * 它是内部机制，不该占用用户的视线 —— 实测截图里 `.bak` 就混在笔记列表里。
     * 但也不删：用户真需要时可以手动到文件夹里找。
     */
    const isHidden = (e: TreeEntry) =>
      /\.bak$/i.test(e.name) || /\.gezhi-export\./i.test(e.name);

    // 过滤模式：判断某个条目是否"值得显示"
    const visible = (e: TreeEntry): boolean => {
      if (isHidden(e)) return false;
      if (!q) return true;
      if (!e.isDir) return e.name.toLowerCase().includes(q);
      // 目录：看它下面的子项里有没有匹配的
      const kids = children.get(e.path);
      if (!kids) return false;      // 没加载过 → 不显示（筛选时已预加载整棵树）
      const walk = (list: TreeEntry[]): boolean =>
        list.some((k) => (k.isDir ? walk(children.get(k.path) ?? []) : k.name.toLowerCase().includes(q)));
      return walk(kids);
    };

    return entries.filter(visible).map((e) => {
      const isOpen = expanded.has(e.path);
      const isRenaming = renaming === e.path;
      const isDirty = dirty.has(e.path);

      return (
        <div key={e.path}>
          {isRenaming ? (
            /* 重命名：就地变成输入框（不弹窗，视线不跳） */
            <div className="tree-row" style={{ paddingLeft: 8 + depth * 14 }}>
              <span className="tw" />
              <span className="ic"><FileIcon ext={e.ext} isDir={e.isDir} /></span>
              <input
                autoFocus
                value={renameValue}
                onChange={(ev) => setRenameValue(ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") submitRename(e.path);
                  else if (ev.key === "Escape") setRenaming(null);
                }}
                onBlur={() => setRenaming(null)}
                style={{
                  flex: "1 1 auto", minWidth: 0, fontSize: 13, padding: "1px 4px",
                  border: "1px solid var(--accent)", borderRadius: 3, outline: "none",
                  background: "var(--bg-primary)", color: "var(--text-normal)",
                }}
              />
            </div>
          ) : (
            <div
              className={`tree-row${e.isDir ? " is-dir" : ""}${e.path === activePath ? " active" : ""}${isDirty ? " dirty" : ""}`}
              style={{ paddingLeft: 8 + depth * 14 }}
              onClick={() => (e.isDir ? toggleDir(e) : openFile(e))}
              onContextMenu={(ev) => {
                ev.preventDefault();
                // 记录右键目标，供重命名用
                setCtxMenu({ x: ev.clientX, y: ev.clientY, entry: e });
              }}
              title={e.path}
            >
              <span className={`tw${isOpen ? " open" : ""}`}>{e.isDir ? "▶" : ""}</span>
              <span className="ic"><FileIcon ext={e.ext} isDir={e.isDir} /></span>
              <span className="nm">{e.name}</span>
              {isDirty && <span className="dot" title="有未保存的改动">●</span>}
              {!e.isDir && e.size > 0 && <span className="sz">{fmtSize(e.size)}</span>}
            </div>
          )}

          {/* 新建时的内联输入框：插在这个目录的子项最前面 */}
          {e.isDir && creating && creating.dir === e.path && isOpen && (
            <div className="tree-row" style={{ paddingLeft: 8 + (depth + 1) * 14 }}>
              <span className="tw" />
              <span className="ic">{creating.kind === "folder" ? <Icon.folder /> : <Icon.md />}</span>
              <input
                ref={createInputRef}
                value={newName}
                onChange={(ev) => setNewName(ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") submitCreate();
                  else if (ev.key === "Escape") { setCreating(null); setNewName(""); }
                }}
                onBlur={() => { if (!newName.trim()) setCreating(null); }}
                placeholder={creating.kind === "folder" ? "新文件夹名" : "新文件名（自动加 .md）"}
                style={{
                  flex: "1 1 auto", minWidth: 0, fontSize: 13, padding: "1px 4px",
                  border: "1px solid var(--accent)", borderRadius: 3, outline: "none",
                  background: "var(--bg-primary)", color: "var(--text-normal)",
                }}
              />
            </div>
          )}

          {e.isDir && isOpen && children.has(e.path) && renderTree(children.get(e.path)!, depth + 1)}
        </div>
      );
    });
  };

  /** 新建输入框也要出现在库根（没展开任何目录时） */
  const renderRootCreate = () => {
    if (!creating || creating.dir !== vault?.path) return null;
    return (
      <div className="tree-row" style={{ paddingLeft: 8 }}>
        <span className="tw" />
        <span className="ic">{creating.kind === "folder" ? <Icon.folder /> : <Icon.md />}</span>
        <input
          ref={createInputRef}
          value={newName}
          onChange={(ev) => setNewName(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") submitCreate();
            else if (ev.key === "Escape") { setCreating(null); setNewName(""); }
          }}
          onBlur={() => { if (!newName.trim()) setCreating(null); }}
          placeholder={creating.kind === "folder" ? "新文件夹名" : "新文件名（自动加 .md）"}
          style={{
            flex: "1 1 auto", minWidth: 0, fontSize: 13, padding: "1px 4px",
            border: "1px solid var(--accent)", borderRadius: 3, outline: "none",
            background: "var(--bg-primary)", color: "var(--text-normal)",
          }}
        />
      </div>
    );
  };

  /** 库里所有文件的名称（wikilink 补全用） */
  const vaultNames = useMemo(() => {
    const names: string[] = [];
    const push = (list: TreeEntry[]) => {
      for (const e of list) {
        if (e.isDir) push(children.get(e.path) ?? []);
        else names.push(e.name);
      }
    };
    push(tree);
    return names;
  }, [tree, children]);

  const stats = useMemo(() => {
    // CSV 不算字数：表格有自己的行数×列数统计，字数对它毫无意义，
    // 而且 42 MB 的 CSV 每切一次标签都要扫两遍正则（实测白烧 CPU）
    if (!activeTab?.text || activeTab.kind === "csv") return null;
    if (activeTab.text.length > WORD_COUNT_MAX) {
      return { words: null, chars: activeTab.text.length };  // 只报字符数，不跑正则
    }
    return countWords(activeTab.text) as { words: number | null; chars: number };
  }, [activeTab]);

  const renderViewer = () => {
    if (!activeTab) {
      return (
        <div className="welcome-shell">
          <div className="welcome-kicker"><img className="brand-mark" src={logoMark} width={36} height={36} alt="" />格物 · 致知</div>
          <h1>让知识连接，<br />让理解发生。</h1>
          <p>{vault ? `欢迎回到「${vault.name}」。从一篇笔记开始，或把今天学到的知识讲给小格。` : "你的笔记、教材与学习计划，在一个安静的工作空间里。打开资料库，开始今天的学习。"}</p>
          <div className="welcome-actions">
            <button className="welcome-action" onClick={() => openStudio()}><span>◐</span><div><strong>进入学习工作室</strong><small>检验误区、迁移知识、动手做实验</small></div></button>
            <button className="welcome-action" onClick={openVaultDialog}><span><Icon.folder /></span><div><strong>打开资料库</strong><small>接着整理你的笔记与教材</small></div></button>
            <button className="welcome-action" onClick={() => openStudio({ view: 'teach' })}><span><Icon.sparkle /></span><div><strong>进入角色空间</strong><small>选择听众，获得六维讲解反馈</small></div></button>
            <button className="welcome-action" onClick={() => { if (!vault) { void openVaultDialog(); return; } setMainView("graph"); }}><span>◎</span><div><strong>探索知识图谱</strong><small>发现笔记之间的连接</small></div></button>
            <button className="welcome-action" onClick={() => { if (!vault) { void openVaultDialog(); return; } setLeftView("cal"); setShowLeft(true); }}><span><Icon.calendar /></span><div><strong>安排今天</strong><small>查看日程、待办与倒计时</small></div></button>
          </div>
          <div className="welcome-hint"><kbd>Ctrl</kbd> + <kbd>O</kbd> 打开资料库 · 从左侧选择文件即可阅读</div>
        </div>
      );
    }
    if (activeTab.error) {
      return (
        <div className="empty-state">
          <div style={{ fontSize: 15 }}>打不开这个文件</div>
          <div style={{ fontSize: 13, maxWidth: 460, textAlign: "center" }}>{activeTab.error}</div>
        </div>
      );
    }
    switch (activeTab.kind) {
      case "markdown":
        // 编辑 / 阅读双模式
        if (mode === "edit") {
          return (
            <MdEditor
              path={activeTab.path}
              value={drafts.get(activeTab.path) ?? activeTab.text ?? ""}
              vaultNames={vaultNames}
              onChange={(text) => {
                setDrafts((prev) => new Map(prev).set(activeTab.path, text));
                setDirty((prev) => new Set(prev).add(activeTab.path));
              }}
              onSave={() => { void saveActive(); }}
            />
          );
        }
        return <MarkdownView text={drafts.get(activeTab.path) ?? activeTab.text ?? ""} onWikilink={followWikilink} />;
      case "pdf":
        return <PdfViewer bytes={activeTab.bytes!} path={activeTab.path} />;
      case "docx":
        return <DocxViewer bytes={activeTab.bytes!} path={activeTab.path} ext={activeTab.ext} />;
      case "doc":
        return <DocViewer path={activeTab.path} name={activeTab.name} />;
      case "pptx":
      case "ppt":
        // 幻灯片走 LibreOffice 转 PDF（见 openFile 里的说明），
        // 转换失败、或用户关掉高保真开关时才到这里 —— 用文字模式兜底。
        return (
          <PptViewer
            slides={activeTab.pptSlides ?? []}
            path={activeTab.path}
            ext={activeTab.ext}
            ms={activeTab.docMs}
          />
        );
      case "csv":
        return <CsvViewer text={activeTab.text ?? ""} name={activeTab.name} />;
      case "xlsx":
        // 电子表格走原生查看器（虚拟滚动），**不转 PDF**
        if (!activeTab.sheet?.length) {
          return (
            <div className="empty-state">
              <div style={{ fontSize: 15 }}>读不出这个表格</div>
              <div style={{ color: "var(--text-muted)", maxWidth: 520, textAlign: "center", lineHeight: 1.9 }}>
                {activeTab.error ?? "文件里没有可显示的工作表"}
              </div>
            </div>
          );
        }
        return (
          <SheetViewer
            sheets={activeTab.sheet}
            path={activeTab.path}
            sheetCount={activeTab.sheetTotal}
            ms={activeTab.docMs}
          />
        );
      case "image": {
        const b64 = activeTab.bytes ? btoa(String.fromCharCode(...activeTab.bytes.slice(0, 0))) : "";
        void b64;
        return <ImageView bytes={activeTab.bytes!} name={activeTab.name} />;
      }
      case "code":
        return <CodeView text={activeTab.text ?? ""} ext={activeTab.ext} />;
      default:
        return <CodeView text={activeTab.text ?? ""} ext={activeTab.ext} plain />;
    }
  };

  return (
    <div className="app">
      <DshOnboarding />
      {/* 标题栏 */}
      <div className="titlebar">
        {/* 四向交织标志：透明底，主题切换时使用单色反白。 */}
        <img
          className="brand-mark"
          src={logoMark}
          alt="格致"
          width={32}
          height={32}
          style={{ borderRadius: 6, flex: "0 0 auto" }}
        />
        <span className="titlebar-brand">格致</span>

        <div style={{ width: 1, height: 16, background: "var(--bd-strong)", margin: "0 2px" }} />

        {/* 面包屑：库名 › 文件名。比分开两处显示更好读，也让用户随时知道自己在哪 */}
        <div
          style={{
            display: "flex", alignItems: "center", gap: 4, minWidth: 0,
            fontSize: 13, color: "var(--text-muted)",
          }}
        >
          <button
            onClick={openVaultDialog}
            title={vault?.path ?? "点这里打开一个库（Ctrl+O）"}
            style={{
              fontSize: 13, color: vault ? "var(--text-muted)" : "var(--text-faint)",
              padding: "2px 5px", borderRadius: 4, whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
          >
            {vault ? vault.name : "未打开库"}
          </button>
          {activeTab && (
            <>
              <span style={{ color: "var(--text-faint)", flex: "0 0 auto" }}>›</span>
              <span
                style={{
                  color: "var(--text-normal)", overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
                title={activeTab.path}
              >
                {activeTab.name}
              </span>
            </>
          )}
        </div>

        <div style={{ flex: 1 }} />
        <div className="titlebar-meta">
          <span className="local-badge"><i />资料保存在本机</span>
          <button className="theme-switch" aria-label={theme === "light" ? "切换深色主题" : "切换浅色主题"} onClick={() => setTheme(t => t === "light" ? "dark" : "light")}>
            {theme === "light" ? "◐" : "☀"}<span>{theme === "light" ? "深色" : "浅色"}</span>
          </button>
        </div>
      </div>

      <div className="main">
        {/* 左侧竖条（ribbon）
            设计取舍：
              1. 宽度 44 → 38px，图标 18 → 17px：原来那排大图标悬在空白里显得空
              2. **未实现的功能明确做成"禁用"状态**（灰、不可点、提示写"未启用"）
                 —— 之前它们和真按钮长得一样，点了没反应，等于骗用户
              3. 顶部放"折叠侧栏"，底部放设置：这是编辑器类软件的通行布局 */}
        <div className="ribbon">
          <button
            className={`ribbon-btn${showLeft ? " active" : ""}`}
            onClick={() => setShowLeft((s) => !s)}
            title={showLeft ? "折叠文件栏（Ctrl+E）" : "展开文件栏（Ctrl+E）"}
          >
            {/* 图标随状态变化：展开时画"左栏高亮"（说明当前左栏是开着的），
                折叠后画"向左的箭头"（说明点它会展开）。
                这两个形状是从 5 个候选里选出来的 —— 见 产出/logo尺码对比.png 的 E 区。
                第一版用的是"竖线 + 一根短竖杠"，那个形状读不出"折叠"的意思。 */}
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              {showLeft ? (
                <>
                  <rect x="5.5" y="6.5" width="4.5" height="11" rx="1.2" fill="currentColor" stroke="none" />
                  <path d="M13 9h5M13 12h5M13 15h5" strokeWidth="1.4" />
                </>
              ) : (
                <>
                  <path d="M9 4v16" />
                  <path d="M15 9l-3 3 3 3" strokeWidth="2.2" />
                </>
              )}
            </svg>
          </button>

          <div className="ribbon-sep" />

          <button className="ribbon-btn" onClick={openVaultDialog} title="打开库（Ctrl+O）">
            <Icon.folder />
          </button>

          <button
            className={`ribbon-btn${leftView === "search" ? " active" : ""}`}
            onClick={() => { setShowLeft(true); setLeftView((v) => (v === "search" ? "files" : "search")); }}
            title={leftView === "search" ? "回到文件列表" : "全文检索（Ctrl+Shift+F）"}
          >
            <Icon.search />
          </button>

          <button
            className={`ribbon-btn${rightTab === "ai" && showRight && mainView !== "learning" ? " active" : ""}`}
            onClick={() => { if (mainView === "learning") setMainView("files"); setRightTab("ai"); setShowRight(true); }}
            title="AI 助手（DeepSeek Harness）"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.4L12 15l-1.9-4.6L5.5 9l4.6-1.4z" />
              <path d="M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z" />
            </svg>
          </button>

          <div className="ribbon-sep" />

          {/* 高保真查看开关。
              只在**引擎可用**时才显示 —— 没有 LibreOffice 却给个开关，
              用户打开一看还是文字模式，会以为坏了。
              说明里写清楚：它是用 LibreOffice 转 PDF，首次要等几秒。 */}
          {soffice?.available && (
            <button
              className={`ribbon-btn${hiFiEnabled ? " active" : ""}`}
              onClick={() => setHiFiEnabled((v) => !v)}
              title={
                (hiFiEnabled
                  ? "高保真查看：已开启\n打开 PPT/Word/Excel 时先用 LibreOffice 转成 PDF，视觉完全还原（首次约 10~40 秒）"
                  : "高保真查看：已关闭\n当前只提取文字（快，但图片和排版看不到）")
                + `\n\n引擎：${soffice.engine ?? ""}`
              }
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="13" rx="2" />
                <path d="M12 17v4M8 21h8" />
                {hiFiEnabled && <path d="M7 11l3 3 6-6" />}
              </svg>
            </button>
          )}

          <div className="ribbon-sep" />

          {/* 主视图切换：关系图谱 / 题库组卷 / 日历计划。
              图谱与题库是**中间栏换视图**（不是弹窗）——
              它们要看的内容量大，弹窗会挤得没法用。 */}
          <button className={'ribbon-btn' + (mainView === 'learning' ? ' active' : '')} aria-current={mainView === 'learning' ? 'page' : undefined} onClick={() => mainView === 'learning' ? setMainView('files') : openStudio()} title="学习工作室（角色空间 / 自信度 / 错误侦探 / 学习证据 / 迁移挑战 / 概念实验）" aria-label="学习工作室">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 2 22 8v8l-10 6L2 16V8Z" /><path d="m2 8 10 6 10-6M12 14v8M7 5l10 6" /></svg>
          </button>
          <button
            className={`ribbon-btn${mainView === "graph" ? " active" : ""}`}
            onClick={() => setMainView((v) => (v === "graph" ? "files" : "graph"))}
            title={mainView === "graph" ? "返回文件视图" : "关系图谱（把笔记间的链接画成图）"}
            aria-current={mainView === 'graph' ? 'page' : undefined}
          >
            <Icon.graph />
          </button>
          <button
            className={`ribbon-btn${mainView === "bank" ? " active" : ""}`}
            onClick={() => setMainView((v) => (v === "bank" ? "files" : "bank"))}
            title={mainView === "bank" ? "返回文件视图" : "题库组卷（抽题 → 导出试卷）"}
            aria-current={mainView === 'bank' ? 'page' : undefined}
          >
            <Icon.book />
          </button>
          {/* 日历在左栏。
              点一下切到该面板，再点一下回文件列表。 */}
          <button
            className={`ribbon-btn${leftView === "cal" && showLeft ? " active" : ""}`}
            onClick={() => {
              setShowLeft(true);
              setLeftView((v) => (v === "cal" ? "files" : "cal"));
            }}
            title={leftView === "cal" ? "回到文件列表" : "日历计划（月历 / 待办 / 倒计时）"}
          >
            <Icon.calendar />
          </button>

          <div className="ribbon-spacer" />

          <button
            className={`ribbon-btn${rightTab === "settings" && showRight ? " active" : ""}`}
            onClick={() => { setRightTab("settings"); setShowRight(true); }}
            title="设置（密钥 / AI 大脑 / 选项）"
          >
            <Icon.settings />
          </button>
        </div>

        {/* 左侧栏 */}
        {showLeft && (
          <>
            <div ref={sidebarMotion} className="sidebar motion-surface" style={{ width: leftWidth }}>
              {/* 左栏视图：文件 / 检索 / 日历。 */}
              <div className="workspace-panel-tabs" role="tablist" aria-label="学习工具" style={{ display: "flex", borderBottom: "1px solid var(--bd)", flex: "0 0 auto" }}>
                {([["files", "文件"], ["search", "检索"], ["cal", "日历"]] as const).map(([k, label]) => (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={leftView === k}
                    onClick={() => setLeftView(k)}
                    style={{
                      flex: "1 1 auto", padding: "6px 0", fontSize: 12, whiteSpace: "nowrap",
                      color: leftView === k ? "var(--accent)" : "var(--text-muted)",
                      borderBottom: leftView === k ? "2px solid var(--accent)" : "2px solid transparent",
                      fontWeight: leftView === k ? 600 : 400,
                    }}
                  >
                    {label}
                    {k === "search" && indexStatus && (
                      <span style={{ fontSize: 10, color: "var(--text-faint)", marginLeft: 4 }}>
                        {indexStatus.docs}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* 日历工具 */}
              {leftView === "cal" && <CalendarPanel vaultPath={vault?.path ?? null} />}

              {leftView === "search" ? (
                <SearchPanel
                  vaultPath={vault?.path ?? null}
                  dirtyCount={dirty.size}
                  onOpen={async (filePath) => {
                    // 检索结果给的是路径 → 找到条目打开
                    const dir = filePath.slice(0, Math.max(filePath.lastIndexOf("\\"), filePath.lastIndexOf("/")));
                    const name = filePath.slice(Math.max(filePath.lastIndexOf("\\"), filePath.lastIndexOf("/")) + 1);
                    const rr = await window.gezhi.vault.list(dir);
                    const entry = rr.entries.find((x) => x.name === name);
                    if (entry) await openFile(entry);
                    else setFsNotice({ ok: false, text: `找不到文件：${name}` });
                  }}
                />
              ) : leftView === "files" ? (
              <>
              {/* 面板头：标题 + 新建按钮。新建入口必须**一眼可见** ——
                  藏进右键菜单的话，很多人根本不知道能新建。 */}
              <div className="panel-head" style={{ paddingRight: 6 }}>
                <span>文件</span>
                <span style={{ display: "flex", gap: 2, alignItems: "center" }}>
                  {vault && (
                    <>
                      <button
                        className="icon-btn"
                        style={{ width: 22, height: 22 }}
                        title="新建文件（在当前库里）"
                        onClick={() => openCreate("file", vault.path!, 0)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
                          <path d="M12 12v6M9 15h6" />
                        </svg>
                      </button>
                      <button
                        className="icon-btn"
                        style={{ width: 22, height: 22 }}
                        title="新建文件夹"
                        onClick={() => openCreate("folder", vault.path!, 0)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                          <path d="M12 11v5M9.5 13.5h5" />
                        </svg>
                      </button>
                    </>
                  )}
                  {filter && (
                    <button
                      onClick={() => setFilter("")}
                      style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "none", letterSpacing: 0 }}
                    >
                      清除
                    </button>
                  )}
                </span>
              </div>

              {/* 操作结果提示（成功/失败都显示，几秒后自动消失） */}
              {fsNotice && (
                <div
                  style={{
                    margin: "0 8px 6px", padding: "4px 8px", borderRadius: 4, fontSize: 12,
                    background: fsNotice.ok ? "#e9f7ee" : "#fdecec",
                    color: fsNotice.ok ? "#14532d" : "#8a1f1f",
                    display: "flex", alignItems: "flex-start", gap: 6,
                  }}
                >
                  <span style={{ flex: "1 1 auto", wordBreak: "break-word" }}>{fsNotice.text}</span>
                  <button onClick={() => setFsNotice(null)} style={{ opacity: 0.6, fontSize: 12 }}>✕</button>
                </div>
              )}

              {/* 文件名过滤：只在打开库后显示（没库时没意义） */}
              {vault && (
                <div style={{ padding: "0 8px 6px", flex: "0 0 auto" }}>
                  <input
                    ref={filterRef}
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") setFilter(""); }}
                    placeholder="筛选文件名…"
                    style={{
                      width: "100%", fontSize: 12.5, padding: "4px 8px",
                      border: "1px solid var(--bd-strong)", borderRadius: 5,
                      background: "var(--bg-primary)", color: "var(--text-normal)",
                      outline: "none",
                    }}
                  />
                </div>
              )}

              <div className="tree">
                {!vault ? (
                  <div className="tree-empty">
                    还没有打开库。
                    <br />
                    按 <kbd style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>Ctrl+O</kbd> 或点左上角文件夹图标。
                  </div>
                ) : tree.length === 0 ? (
                  <div className="tree-empty">（这个文件夹是空的）</div>
                ) : (
                  (() => {
                    if (filterLoading) {
                      return <div className="tree-empty">正在筛选「{filter}」…</div>;
                    }
                    const rendered = renderTree(tree, 0);
                    const isEmpty = Array.isArray(rendered) && rendered.length === 0;
                    return (
                      <>
                        {/* 库根的新建输入框（没展开任何目录时也要能新建） */}
                        {renderRootCreate()}
                        {isEmpty && !creating ? <div className="tree-empty">没有匹配「{filter}」的文件</div> : rendered}
                      </>
                    );
                  })()
                )}
              </div>

              {/* 提示：右键菜单 */}
              {vault && tree.length > 0 && (
                <div style={{ flex: "0 0 auto", padding: "4px 10px 8px", fontSize: 11, color: "var(--text-faint)" }}>
                  右键文件可重命名 / 删除
                </div>
              )}
              </>
              ) : null}
            </div>
            <div
              style={{ width: 4, cursor: "col-resize", flex: "0 0 auto" }}
              onMouseDown={(e) => { dragRef.current = { side: "left", startX: e.clientX, startW: leftWidth }; document.body.style.cursor = "col-resize"; }}
            />
          </>
        )}

        {/* 中央。
            图谱与题库是**换视图**而不是弹窗 —— 它们要看的内容量大，
            弹窗挤不下；换视图还能保留标签页不动，切回来原来的文件还开着。 */}
        <div ref={centerMotion} className="center motion-surface">
          <div style={{display:mainView==='learning'?'flex':'none',flex:'1 1 auto',minHeight:0,minWidth:0}}>
            <LearningStudio key={vault?.path || 'no-vault'} vaultPath={vault?.path ?? null} request={studioRequest}
              visible={mainView==='learning'} referencePath={activeTab?.path} referenceName={activeTab?.name} referenceText={activeTab ? drafts.get(activeTab.path) ?? activeTab.text : null}
              onBrowse={() => setMainView('files')} onOpen={(p) => { setMainView('files'); void openFileByPath(p); }} onOpenVault={() => void openVaultDialog()} onBank={() => setMainView('bank')} />
          </div>
          {mainView === "learning" ? null : mainView === "graph" ? (
            <GraphView
              vaultPath={vault?.path ?? null}
              activePath={activePath}
              onEvidence={() => openStudio({ view: 'evidence' })}
              onOpen={(p) => { setMainView("files"); void openFileByPath(p); }}
            />
          ) : mainView === "bank" ? (
            <BankView
              key={vault?.path || 'no-vault'}
              vaultPath={vault?.path ?? null}
              onPractice={(id, priorExposure) => openStudio({ view: 'practice', activityId: 'bank:' + id, priorExposure })}
              onOpen={(p) => { void openFileByPath(p); }}
            />
          ) : (
          <>
          <div className="tabs">
            {tabs.map((t) => (
              <div
                key={t.path}
                className={`tab${t.path === activePath ? " active" : ""}`}
                onClick={() => setActivePath(t.path)}
                title={t.path}
              >
                <span style={{ color: "var(--text-muted)", display: "grid", placeItems: "center" }}>
                  <FileIcon ext={t.ext} isDir={false} />
                </span>
                <span className="tname">{t.name}</span>
                {/* 未保存标记：小圆点。比"标题加星号"更不干扰阅读 */}
                {dirty.has(t.path) && (
                  <span style={{ color: "var(--accent)", fontSize: 9, lineHeight: 1 }} title="有未保存的改动">●</span>
                )}
                <span className="tclose" onClick={(e) => closeTab(t.path, e)}>✕</span>
              </div>
            ))}
            {tabs.length === 0 && (
              <div style={{ padding: "0 12px", display: "flex", alignItems: "center", color: "var(--text-faint)", fontSize: 13 }}>
                没有打开的文件
              </div>
            )}
            <div style={{ flex: "1 1 auto" }} />

            {/* 编辑 / 阅读模式切换 + 保存。只对 Markdown 显示 ——
                PDF/Word/PPT 是只读格式，给"编辑"按钮会误导。 */}
            {activeTab?.kind === "markdown" && activeTab.text != null && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 8px" }}>
                <div
                  style={{
                    display: "flex", border: "1px solid var(--bd-strong)",
                    borderRadius: 5, overflow: "hidden", fontSize: 12,
                  }}
                >
                  {(["read", "edit"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      title={m === "read" ? "阅读模式（渲染后的效果）" : "编辑模式（改 Markdown 源码）"}
                      style={{
                        padding: "3px 10px",
                        background: mode === m ? "var(--accent-soft)" : "transparent",
                        color: mode === m ? "var(--accent)" : "var(--text-muted)",
                        fontWeight: mode === m ? 600 : 400,
                      }}
                    >
                      {m === "read" ? "阅读" : "编辑"}
                    </button>
                  ))}
                </div>

                {dirty.has(activeTab.path) && (
                  <button
                    onClick={() => { void saveActive(); }}
                    title="保存（Ctrl+S）"
                    style={{
                      padding: "3px 10px", borderRadius: 5, fontSize: 12,
                      background: "var(--accent)", color: "#fff",
                    }}
                  >
                    保存
                  </button>
                )}

                <ExportMenu
                  markdown={drafts.get(activeTab.path) ?? activeTab.text}
                  sourcePath={activeTab.path}
                  defaultName={activeTab.name.replace(/\.(md|markdown)$/i, "")}
                />
              </div>
            )}
          </div>
          <div ref={viewerMotion} className="viewer motion-surface">{renderViewer()}</div>
          </>
          )}
        </div>

        {/* 右侧栏 */}
        <div style={{ display: mainView === 'learning' && rightTab !== 'settings' ? 'none' : 'contents' }}>
        {showRight ? (
          <>
            <div
              style={{ width: 4, cursor: "col-resize", flex: "0 0 auto" }}
              onMouseDown={(e) => { dragRef.current = { side: "right", startX: e.clientX, startW: rightWidth }; document.body.style.cursor = "col-resize"; }}
            />
            <div className="sidebar right" style={{ width: rightWidth, display: "flex", flexDirection: "column" }}>
              {/* 右栏顶部三个页签：AI / 信息 / 链接。
                  合成一栏而不是各占一栏，是因为窄屏下三栏已经吃满，
                  再切一栏会把正文挤到不可读。 */}
              {/* 右栏页签。
                  五个页签在窄栏里会挤，所以：
                    · 标签保持完整（"AI 助手"不缩成"AI"，缩写会让人一时认不出）
                    · 容器允许横向滚动，挤的时候能滑
                    · 每个页签不换行、不压缩
                  比"把名字改短"更好的做法 —— 改短是在为布局牺牲可读性。 */}
              <div className="workspace-panel-tabs" role="tablist" aria-label="当前文件上下文" style={{
                display: "flex", alignItems: "center",
                borderBottom: "1px solid var(--bd)", flex: "0 0 auto",
                overflowX: "auto",
              }}>
                {(["ai", "info", "links", "settings"] as const).map((k) => (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={rightTab === k}
                    onClick={() => setRightTab(k)}
                    style={{
                      flex: "0 0 auto",
                      padding: "7px 9px",
                      fontSize: 12,
                      whiteSpace: "nowrap",
                      color: rightTab === k ? "var(--accent)" : "var(--text-muted)",
                      borderBottom: rightTab === k ? "2px solid var(--accent)" : "2px solid transparent",
                      fontWeight: rightTab === k ? 600 : 400,
                    }}
                  >
                    {k === "ai" ? "AI 助手"
                      : k === "info" ? "信息"
                      : k === "links" ? "链接"
                      : "设置"}
                  </button>
                ))}
                {/* 折叠按钮。
                    为什么必须有一个**看得见**的按钮：
                    只留快捷键（Ctrl+B）的话，用户折叠后不知道还能展开。
                    折叠后还会保留一条窄竖条（见下面的渲染），
                    保证任何时候都有路回到这里。 */}
                <button
                  onClick={() => setShowRight(false)}
                  title="折叠右栏（Ctrl+B）"
                  style={{
                    flex: "0 0 auto", width: 26, alignSelf: "stretch",
                    color: "var(--text-faint)", fontSize: 13,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-normal)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-faint)"; }}
                >
                  ›
                </button>
              </div>

              {/* ★ 两个面板**都必须保持挂载**，只用 CSS 隐藏。
                  之前这里是三元表达式（rightTab === "ai" ? <AiChat/> : <信息/>），
                  切到「信息」时 AiChat 被卸载 → React 把它的 state（全部对话、
                  sessionId、输入框内容）一起销毁，切回来对话就没了。
                  这是真 bug，用户实测发现的。
                  CSS 隐藏的代价只是 DOM 里多留一份，远比丢对话可接受。 */}
              <div
                style={{
                  flex: "1 1 auto",
                  minHeight: 0,
                  display: rightTab === "ai" ? "flex" : "none",
                  flexDirection: "column",
                }}
              >
                <AiChat vaultPath={vault?.path ?? null} onFilesChanged={refreshTree} />
              </div>

              {/* 链接面板（反向链接 / 出链）。
                  同样保持挂载：它自己有展开状态与已拉取的数据，
                  卸载后每次切回来都要重新查库。 */}
              <div
                style={{
                  flex: "1 1 auto",
                  minHeight: 0,
                  display: rightTab === "links" ? "flex" : "none",
                  flexDirection: "column",
                }}
              >
                <BacklinksPanel
                  vaultPath={vault?.path ?? null}
                  activePath={activePath}
                  indexVersion={indexVersion}
                  onOpen={async (filePath) => {
                    const dir = filePath.slice(0, Math.max(filePath.lastIndexOf("\\"), filePath.lastIndexOf("/")));
                    const name = filePath.slice(Math.max(filePath.lastIndexOf("\\"), filePath.lastIndexOf("/")) + 1);
                    const rr = await window.gezhi.vault.list(dir);
                    const entry = rr.entries.find((x) => x.name === name);
                    if (entry) await openFile(entry);
                  }}
                  onCreate={async (name) => {
                    if (!vault?.path) return;
                    const r = await window.gezhi.fsx.createFile({ dir: vault.path, name });
                    if (!r.ok) { setFsNotice({ ok: false, text: r.error }); return; }
                    setFsNotice({ ok: true, text: `已创建「${r.name}」` });
                    await refreshTree();
                  }}
                />
              </div>



              {/* 设置：密钥 / AI 大脑 / 选项。
                  密钥为什么不放进安装包：见 SettingsPanel 顶部说明。 */}
              <div
                style={{
                  flex: "1 1 auto",
                  minHeight: 0,
                  display: rightTab === "settings" ? "flex" : "none",
                  flexDirection: "column",
                }}
              >
                <SettingsPanel
                  onChanged={() => {
                    // 设置里改了高保真开关后，要和界面上的状态同步：
                    // 读回设置并刷新引擎探测结果
                    void window.gezhi.settings.get()
                      .then((s) => {
                        if (typeof s?.settings?.hiFi === "boolean") setHiFiEnabled(s.settings.hiFi as boolean);
                      })
                      .catch(() => { /* 读不到就保持现状 */ });
                    void window.gezhi.avatar.probe().catch(() => { /* 语音凭据状态变了，重探一次 */ });
                  }}
                />
              </div>

              <div
                style={{
                  flex: "1 1 auto",
                  overflow: "auto",
                  display: rightTab === "info" ? "block" : "none",
                }}
              >
                {activeTab ? (
                  <>
                    <div className="section-title">当前文件</div>
                    <div className="info-list">
                      <div className="info-item"><span className="k">名称</span><span className="v selectable">{activeTab.name}</span></div>
                      <div className="info-item"><span className="k">类型</span><span className="v">{activeTab.kind}</span></div>
                      <div className="info-item"><span className="k">大小</span><span className="v">{fmtSize(activeTab.size)}</span></div>
                      {stats && (
                        <>
                          {/* words 可能是 null（超大文件只统计字符数，不跑分词正则） */}
                          {stats.words !== null && (
                            <div className="info-item"><span className="k">字数</span><span className="v">{stats.words}</span></div>
                          )}
                          <div className="info-item"><span className="k">字符</span><span className="v">{stats.chars}</span></div>
                        </>
                      )}
                      {activeTab.mtime && (
                        <div className="info-item">
                          <span className="k">修改时间</span>
                          <span className="v">{new Date(activeTab.mtime).toLocaleString("zh-CN")}</span>
                        </div>
                      )}
                      {/* 转换来源：让用户知道这份 PDF 是从 PPT 转来的 */}
                      {activeTab.convertedFrom && (
                        <div className="info-item">
                          <span className="k">高保真</span>
                          <span className="v">
                            由 {activeTab.convertedFrom} 转换
                            {activeTab.convertMs ? `（${(activeTab.convertMs / 1000).toFixed(1)}s）` : ""}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="section-title">反向链接</div>
                    <div className="info-list" style={{ color: "var(--text-faint)", fontSize: 12 }}>
                      （P3 阶段实现：需要先建立链接索引）
                    </div>
                  </>
                  ) : (
                    <div className="tree-empty">打开一个文件后这里显示详情</div>
                  )}
              </div>
            </div>
          </>
        ) : (
          /**
           * 折叠后的窄竖条。
           *
           * ★ 为什么折叠了还要留一条：
           *   如果整个右栏消失、只留一个工具栏图标，用户折叠后
           *   很容易找不到"怎么再展开"（尤其是误触快捷键之后）。
           *   留一条可点的竖条，任何时候都能点回来。
           *
           * 竖排文字用 writing-mode；鼠标悬停时给一点颜色反馈。
           */
          <button
            onClick={() => setShowRight(true)}
            title="展开右栏（Ctrl+B）"
            style={{
              flex: "0 0 auto", width: 26, alignSelf: "stretch",
              display: "flex", flexDirection: "column", alignItems: "center",
              gap: 8, paddingTop: 10,
              borderLeft: "1px solid var(--bd)",
              background: "var(--bg-secondary)",
              color: "var(--text-faint)", fontSize: 12,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
              e.currentTarget.style.color = "var(--text-normal)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--bg-secondary)";
              e.currentTarget.style.color = "var(--text-faint)";
            }}
          >
            <span style={{ fontSize: 13 }}>‹</span>
            <span style={{ writingMode: "vertical-rl", letterSpacing: 1 }}>
              {rightTab === "ai" ? "AI 助手" : rightTab === "info" ? "信息" : "链接"}
            </span>
          </button>
        )}
        </div>
      </div>

      {/* 右键菜单：重命名 / 删除 / 在此新建。
          用 fixed 定位在鼠标处，点别处自动关闭（见上面的 useEffect）。 */}
      {ctxMenu && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            left: Math.min(ctxMenu.x, window.innerWidth - 200),
            top: Math.min(ctxMenu.y, window.innerHeight - 200),
            width: 190,
            background: "var(--bg-primary)",
            border: "1px solid var(--bd-strong)",
            borderRadius: 6,
            boxShadow: "0 6px 22px rgba(0,0,0,.18)",
            zIndex: 200,
            overflow: "hidden",
            fontSize: 13,
          }}
        >
          {ctxMenu.entry?.isDir && (
            <>
              <CtxItem
                label="在此新建文件"
                onClick={() => {
                  setCtxMenu(null);
                  openCreate("file", ctxMenu.entry!.path, 0);
                }}
              />
              <CtxItem
                label="在此新建文件夹"
                onClick={() => {
                  setCtxMenu(null);
                  openCreate("folder", ctxMenu.entry!.path, 0);
                }}
              />
              <div style={{ height: 1, background: "var(--bd)" }} />
            </>
          )}
          {ctxMenu.entry && (
            <>
              <CtxItem
                label="重命名"
                onClick={() => {
                  setRenaming(ctxMenu.entry!.path);
                  setRenameValue(ctxMenu.entry!.name);
                  setCtxMenu(null);
                }}
              />
              {!ctxMenu.entry.isDir && (
                <CtxItem
                  label="在文件夹中显示"
                  onClick={() => {
                    window.gezhi.file.reveal(ctxMenu.entry!.path);
                    setCtxMenu(null);
                  }}
                />
              )}
              <div style={{ height: 1, background: "var(--bd)" }} />
              <CtxItem
                label="删除（移到回收站）"
                danger
                onClick={() => {
                  const e = ctxMenu.entry!;
                  setCtxMenu(null);
                  void doDelete(e);
                }}
              />
            </>
          )}
          {!ctxMenu.entry && vault?.path && (
            <>
              <CtxItem label="新建文件" onClick={() => { setCtxMenu(null); openCreate("file", vault.path!, 0); }} />
              <CtxItem label="新建文件夹" onClick={() => { setCtxMenu(null); openCreate("folder", vault.path!, 0); }} />
            </>
          )}
        </div>
      )}

      {/* 状态栏。文件路径放这里 —— 它是"偶尔要看一眼"的信息，
          占右栏一整块是浪费（用户反馈过这点）。 */}
      <div className="statusbar">
        <span>{loading ? "载入中…" : status}</span>
        <div className="spacer" />
        {activeTab && (
          <span className="selectable" title={activeTab.path} style={{ maxWidth: "45%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", direction: "rtl", textAlign: "left" }}>
            {activeTab.path}
          </span>
        )}
        {stats && (
          <span>
            {stats.words !== null ? `${stats.words} 个词 · ` : ""}{stats.chars} 个字符
          </span>
        )}
        {vault && <span>{tabs.length} 个标签页</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 右键菜单项
function CtxItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: "7px 12px", fontSize: 13,
        color: danger ? "var(--red)" : "var(--text-normal)",
        background: "none",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = danger ? "#fdecec" : "var(--bg-hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------- 图片查看
// 单独一个组件：需要在挂载时把 bytes 转成 blob URL 并在卸载时释放，
// 否则切来切去会漏内存。
function ImageView({ bytes, name }: { bytes: Uint8Array; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const blob = new Blob([bytes.slice(0)]);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [bytes]);
  if (!url) return <div className="empty-state">载入图片…</div>;
  return (
    <div style={{ height: "100%", display: "grid", placeItems: "center", background: "var(--bg-tertiary)", padding: 24 }}>
      <img src={url} alt={name} style={{ maxWidth: "100%", maxHeight: "100%", boxShadow: "0 2px 12px rgba(0,0,0,.18)", background: "#fff" }} />
    </div>
  );
}
