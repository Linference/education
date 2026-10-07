// PDF 查看器（pdf.js）
//
// 关键点（都踩过）：
//   1. pdf.js 需要 worker：用 Vite 的 ?url 引入，再用 GlobalWorkerOptions 指定，
//      否则要么报 "fake worker" 警告、要么在打包后找不到 worker 文件。
//   2. CSP 里必须允许 worker-src blob: （已在 index.html 里配好）。
//   3. 高 DPI 屏要按 devicePixelRatio 放大画布，否则字发虚。
import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
const readingPositions = new Map<string,{page:number;scale:number}>();

interface Props {
  bytes: Uint8Array;
  path: string;
}

export default function PdfViewer({ bytes, path }: Props) {
  const [doc, setDoc] = useState<any>(null);
  const [page, setPage] = useState(readingPositions.get(path)?.page || 1);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(readingPositions.get(path)?.scale || 1.25);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const loadedPath=useRef('');
  useEffect(()=>{if(doc&&loadedPath.current===path){readingPositions.set(path,{page,scale});if(readingPositions.size>100)readingPositions.delete(readingPositions.keys().next().value!);}},[doc,path,page,scale]);

  // 载入文档
  useEffect(() => {
    let cancelled = false;
    let loadedDoc:any;
    setDoc(null);
    setError(null);
    loadedPath.current='';
    setScale(readingPositions.get(path)?.scale || 1.25);

    (async () => {
      try {
        // pdf.js 会接管这块内存，传副本避免它 detach 原始 Uint8Array
        const task = pdfjsLib.getDocument({ data: bytes.slice(0) });
        const d = await task.promise;
        if (cancelled) { d.destroy(); return; }
        loadedDoc=d;loadedPath.current=path;
        setPage(Math.min(d.numPages,readingPositions.get(path)?.page || 1));
        setDoc(d);
        setPageCount(d.numPages);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      }
    })();

    return () => { cancelled = true;renderTaskRef.current?.cancel();void loadedDoc?.destroy(); };
  }, [bytes,path]);

  // 渲染当前页
  const renderPage = useCallback(async () => {
    if (!doc || !canvasRef.current) return;
    try {
      if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }
      const p = await doc.getPage(page);
      const dpr = window.devicePixelRatio || 1;
      const viewport = p.getViewport({ scale: scale * dpr });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
      const task = p.render({ canvasContext: ctx, viewport, canvas });
      renderTaskRef.current = task;
      await task.promise;
      renderTaskRef.current = null;
    } catch (e: any) {
      if (e?.name !== "RenderingCancelledException") setError(e?.message ?? String(e));
    }
  }, [doc, page, scale]);

  useEffect(() => { renderPage(); }, [renderPage]);

  // 键盘翻页
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "PageDown" || (e.key === "ArrowRight" && e.ctrlKey)) {
        e.preventDefault(); setPage((p) => Math.min(pageCount, p + 1));
      } else if (e.key === "PageUp" || (e.key === "ArrowLeft" && e.ctrlKey)) {
        e.preventDefault(); setPage((p) => Math.max(1, p - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageCount]);

  if (error) {
    return <div className="empty-state">PDF 打开失败：{error}</div>;
  }

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <button className="icon-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} title="上一页">‹</button>
        <span>
          第 <b>{page}</b> / {pageCount || "…"} 页
        </span>
        <button className="icon-btn" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} title="下一页">›</button>
        <span style={{ marginLeft: 12, color: "var(--text-faint)" }}>缩放</span>
        <button className="icon-btn" onClick={() => setScale((s) => Math.max(0.4, +(s - 0.15).toFixed(2)))} title="缩小">−</button>
        <span style={{ minWidth: 44, textAlign: "center" }}>{Math.round(scale * 100)}%</span>
        <button className="icon-btn" onClick={() => setScale((s) => Math.min(4, +(s + 0.15).toFixed(2)))} title="放大">+</button>
        <button className="icon-btn" onClick={() => setScale(1.25)} title="重置缩放" style={{ width: "auto", padding: "0 8px", fontSize: 12 }}>适应</button>
        <div style={{ flex: 1 }} />
        <span style={{ color: "var(--text-faint)", fontSize: 12 }}>{doc ? `${pageCount} 页` : "载入中…"}</span>
      </div>
      <div className="pdf-canvas-wrap">
        {!doc && !error && <div style={{ color: "#ccc" }}>正在解析 PDF…</div>}
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
