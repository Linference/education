// PDF viewer (pdf.js)
//
// Key points (all learned the hard way):
//   1. pdf.js needs a worker: import it with Vite's ?url and assign it via GlobalWorkerOptions,
//      otherwise you either get a "fake worker" warning or the worker file is missing after bundling.
//   2. CSP must allow worker-src blob: (already configured in index.html).
//   3. On high-DPI screens, scale the canvas by devicePixelRatio, otherwise text looks blurry.
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

  // Load document
  useEffect(() => {
    let cancelled = false;
    let loadedDoc:any;
    setDoc(null);
    setError(null);
    loadedPath.current='';
    setScale(readingPositions.get(path)?.scale || 1.25);

    (async () => {
      try {
        // pdf.js takes ownership of this memory; pass a copy to avoid it detaching the original Uint8Array
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

  // Render current page
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

  // Keyboard page navigation
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
    return <div className="empty-state">Failed to open PDF: {error}</div>;
  }

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <button className="icon-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} title="Previous page">‹</button>
        <span>
          Page <b>{page}</b> / {pageCount || "…"}
        </span>
        <button className="icon-btn" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} title="Next page">›</button>
        <span style={{ marginLeft: 12, color: "var(--text-faint)" }}>Zoom</span>
        <button className="icon-btn" onClick={() => setScale((s) => Math.max(0.4, +(s - 0.15).toFixed(2)))} title="Zoom out">−</button>
        <span style={{ minWidth: 44, textAlign: "center" }}>{Math.round(scale * 100)}%</span>
        <button className="icon-btn" onClick={() => setScale((s) => Math.min(4, +(s + 0.15).toFixed(2)))} title="Zoom in">+</button>
        <button className="icon-btn" onClick={() => setScale(1.25)} title="Reset zoom" style={{ width: "auto", padding: "0 8px", fontSize: 12 }}>Fit</button>
        <div style={{ flex: 1 }} />
        <span style={{ color: "var(--text-faint)", fontSize: 12 }}>{doc ? `${pageCount} pages` : "Loading…"}</span>
      </div>
      <div className="pdf-canvas-wrap">
        {!doc && !error && <div style={{ color: "#ccc" }}>Loading PDF…</div>}
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
