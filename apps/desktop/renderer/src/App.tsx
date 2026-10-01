// 格致 · 主界面
//
// 结构照 Obsidian：左侧竖条(ribbon) + 侧栏(文件树) + 中央(标签页+查看器) + 右侧面板 + 底部状态栏。
// 这一版把关键能力补齐：Markdown 渲染、PDF 与 Word 查看、代码高亮、属性面板、字数统计。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppInfo, TreeEntry, VaultInfo, FileKind } from "./types";
import { kindOf, iconFor } from "./types";
import MarkdownView from "./components/MarkdownView";
import PdfViewer from "./components/PdfViewer";
import DocxViewer from "./components/DocxViewer";
import DocViewer from "./components/DocViewer";
import CodeView from "./components/CodeView";
import AiChat from "./components/AiChat";
import ExportMenu from "./components/ExportMenu";

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
  /** true 表示版式有损（.doc 提取的是纯文本） */
  lossyText?: boolean;
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
  if (k === "docx") return <Icon.doc />;
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

// ---------------------------------------------------------------- 应用

export default function App() {
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
  const [rightTab, setRightTab] = useState<"ai" | "info">("ai");

  const activeTab = useMemo(() => tabs.find((t) => t.path === activePath) ?? null, [tabs, activePath]);

  useEffect(() => {
    window.gezhi.info().then(setInfo).catch((e) => setStatus("初始化失败：" + e.message));
  }, []);

  // ---------------------------------------------------------------- 打开库
  const loadVault = useCallback(async (v: VaultInfo) => {
    if (!v.ok || !v.path) { setStatus("打开失败：" + (v.error ?? "未知错误")); return; }
    setVault(v);
    setExpanded(new Set());
    setChildren(new Map());
    setTabs([]);
    setActivePath(null);
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
    setLoading(true);
    try {
      const base = { path: entry.path, name: entry.name, ext: entry.ext, kind, size: entry.size, mtime: entry.mtime };
      let tab: Tab;

      if (kind === "pdf" || kind === "docx" || kind === "image") {
        const r = await window.gezhi.file.readBinary(entry.path);
        tab = r.ok
          ? { ...base, bytes: r.bytes! }
          : { ...base, error: r.error ?? "读取失败" };
      } else if (kind === "doc") {
        // 旧版 .doc 必须走主进程的 OLE 解析器（渲染进程没有 fs，
        // 而且解析是 Node 侧的 Buffer 操作）
        const r = await window.gezhi.file.readDoc(entry.path);
        tab = r.ok
          ? { ...base, text: r.text, docMethod: r.method, docMs: r.ms, lossyText: r.lossy }
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
    return () => { delete (window as any).__gezhiTest; };
  }, [testMode, loadVault, openFile, tabs, activePath, vault]);

  // ---------------------------------------------------------------- 快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "o") { e.preventDefault(); openVaultDialog(); }
      if (e.key.toLowerCase() === "w" && activePath) { e.preventDefault(); closeTab(activePath); }
      if (e.key.toLowerCase() === "b") { e.preventDefault(); setShowRight((s) => !s); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openVaultDialog, closeTab, activePath]);

  // ---------------------------------------------------------------- 渲染

  const renderTree = (entries: TreeEntry[], depth: number): React.ReactNode =>
    entries.map((e) => {
      const isOpen = expanded.has(e.path);
      return (
        <div key={e.path}>
          <div
            className={`tree-row${e.path === activePath ? " active" : ""}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => (e.isDir ? toggleDir(e) : openFile(e))}
            title={e.path}
          >
            <span className={`tw${isOpen ? " open" : ""}`}>{e.isDir ? "▶" : ""}</span>
            <span className="ic"><FileIcon ext={e.ext} isDir={e.isDir} /></span>
            <span className="nm">{e.name}</span>
            {!e.isDir && e.size > 0 && <span className="sz">{fmtSize(e.size)}</span>}
          </div>
          {e.isDir && isOpen && children.has(e.path) && renderTree(children.get(e.path)!, depth + 1)}
        </div>
      );
    });

  const stats = useMemo(() => {
    if (!activeTab?.text) return null;
    return countWords(activeTab.text);
  }, [activeTab]);

  const renderViewer = () => {
    if (!activeTab) {
      return (
        <div className="empty-state">
          <div style={{ fontSize: 15 }}>还没有打开任何文件</div>
          <div style={{ fontSize: 13 }}>
            按 <kbd>Ctrl</kbd>+<kbd>O</kbd> 打开一个库，或从左侧选择文件
          </div>
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
        return <MarkdownView text={activeTab.text ?? ""} onWikilink={followWikilink} />;
      case "pdf":
        return <PdfViewer bytes={activeTab.bytes!} path={activeTab.path} />;
      case "docx":
        return <DocxViewer bytes={activeTab.bytes!} path={activeTab.path} ext={activeTab.ext} />;
      case "doc":
        return <DocViewer path={activeTab.path} name={activeTab.name} />;
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
      {/* 标题栏 */}
      <div className="titlebar">
        <button className="icon-btn" onClick={openVaultDialog} title="打开库（Ctrl+O）">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
        </button>
        <span style={{ fontWeight: 600, fontSize: 13 }}>格致</span>
        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
          {vault ? vault.name : "（未打开库）"}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ color: "var(--text-faint)", fontSize: 11 }}>
          {info ? `Electron ${info.electron} · Chromium ${info.chrome}` : ""}
        </span>
      </div>

      <div className="main">
        {/* 左侧竖条 */}
        <div className="ribbon">
          <button className="ribbon-btn" onClick={openVaultDialog} title="打开库"><Icon.folder /></button>
          <button className="ribbon-btn active" title="文件浏览"><Icon.file /></button>
          <button className="ribbon-btn" title="搜索（待实现）"><Icon.search /></button>
          <button className="ribbon-btn" title="关系图谱（待实现）"><Icon.graph /></button>
          <button className="ribbon-btn" title="题库（待实现）"><Icon.book /></button>
          <button className="ribbon-btn" title="计划（待实现）"><Icon.calendar /></button>
          <div className="ribbon-spacer" />
          <button className="ribbon-btn" title="设置（待实现）"><Icon.settings /></button>
        </div>

        {/* 左侧栏 */}
        <div className="sidebar" style={{ width: leftWidth }}>
          <div className="panel-head">文件</div>
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
              renderTree(tree, 0)
            )}
          </div>
        </div>
        <div
          style={{ width: 4, cursor: "col-resize", flex: "0 0 auto" }}
          onMouseDown={(e) => { dragRef.current = { side: "left", startX: e.clientX, startW: leftWidth }; document.body.style.cursor = "col-resize"; }}
        />

        {/* 中央 */}
        <div className="center">
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
                <span className="tclose" onClick={(e) => closeTab(t.path, e)}>✕</span>
              </div>
            ))}
            {tabs.length === 0 && (
              <div style={{ padding: "0 12px", display: "flex", alignItems: "center", color: "var(--text-faint)", fontSize: 13 }}>
                没有打开的文件
              </div>
            )}
            <div style={{ flex: "1 1 auto" }} />
            {/* 导出按钮：只对 Markdown 文件显示（其他格式没什么可导出的） */}
            {activeTab?.kind === "markdown" && activeTab.text != null && (
              <div style={{ display: "flex", alignItems: "center", padding: "0 8px" }}>
                <ExportMenu
                  markdown={activeTab.text}
                  sourcePath={activeTab.path}
                  defaultName={activeTab.name.replace(/\.(md|markdown)$/i, "")}
                />
              </div>
            )}
          </div>
          <div className="viewer">{renderViewer()}</div>
        </div>

        {/* 右侧栏 */}
        {showRight && (
          <>
            <div
              style={{ width: 4, cursor: "col-resize", flex: "0 0 auto" }}
              onMouseDown={(e) => { dragRef.current = { side: "right", startX: e.clientX, startW: rightWidth }; document.body.style.cursor = "col-resize"; }}
            />
            <div className="sidebar right" style={{ width: rightWidth, display: "flex", flexDirection: "column" }}>
              {/* 右栏顶部两个页签：信息 / AI。
                  合成一栏而不是各占一栏，是因为窄屏下三栏已经吃满，
                  再切一栏会把正文挤到不可读。 */}
              <div style={{ display: "flex", borderBottom: "1px solid var(--bd)", flex: "0 0 auto" }}>
                {(["ai", "info"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setRightTab(k)}
                    style={{
                      flex: "1 1 auto",
                      padding: "7px 0",
                      fontSize: 12,
                      color: rightTab === k ? "var(--accent)" : "var(--text-muted)",
                      borderBottom: rightTab === k ? "2px solid var(--accent)" : "2px solid transparent",
                      fontWeight: rightTab === k ? 600 : 400,
                    }}
                  >
                    {k === "ai" ? "AI 助手" : "信息"}
                  </button>
                ))}
              </div>

              {rightTab === "ai" ? (
                <AiChat vaultPath={vault?.path ?? null} onFilesChanged={refreshTree} />
              ) : (
                <div style={{ flex: "1 1 auto", overflow: "auto" }}>
                  {activeTab ? (
                    <>
                      <div className="section-title">当前文件</div>
                      <div className="info-list">
                        <div className="info-item"><span className="k">名称</span><span className="v selectable">{activeTab.name}</span></div>
                        <div className="info-item"><span className="k">类型</span><span className="v">{activeTab.kind}</span></div>
                        <div className="info-item"><span className="k">大小</span><span className="v">{fmtSize(activeTab.size)}</span></div>
                        {stats && (
                          <>
                            <div className="info-item"><span className="k">字数</span><span className="v">{stats.words}</span></div>
                            <div className="info-item"><span className="k">字符</span><span className="v">{stats.chars}</span></div>
                          </>
                        )}
                        {activeTab.mtime && (
                          <div className="info-item">
                            <span className="k">修改时间</span>
                            <span className="v">{new Date(activeTab.mtime).toLocaleString("zh-CN")}</span>
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
              )}
            </div>
          </>
        )}
      </div>

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
        {stats && <span>{stats.words} 个词 · {stats.chars} 个字符</span>}
        {vault && <span>{tabs.length} 个标签页</span>}
      </div>
    </div>
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
