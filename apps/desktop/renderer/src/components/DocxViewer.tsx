// Word 查看器
//
// 用两套方案配合，因为单一方案都有硬伤：
//   docx-preview —— 保真度高（样式、页眉页脚、表格、图片都在），但它是"渲染"，
//                   拿不到干净的文本，且对某些复杂文档会失败
//   mammoth      —— 转 HTML，文本结构干净，但样式丢失
// 策略：先试 docx-preview 保真渲染；失败则退回 mammoth。
// 老式 .doc（二进制格式）两者都不支持，给明确提示而不是白屏。
import { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import mammoth from "mammoth";

interface Props {
  bytes: Uint8Array;
  path: string;
  ext: string;
}

export default function DocxViewer({ bytes, path, ext }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"docx-preview" | "mammoth" | null>(null);
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setMode(null);
    setHtml(null);

    // .doc 是 OLE 复合文档，docx-preview / mammoth 都不认
    if (ext === ".doc") {
      setError(
        "旧版 .doc 格式无法在软件内预览。请用 WPS/Word 打开，或另存为 .docx 后重试。"
      );
      return;
    }

    (async () => {
      // 方案一：docx-preview
      try {
        const host = hostRef.current;
        if (!host) return;
        host.textContent = "";
        const blob = new Blob([bytes.slice(0)], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        await renderAsync(blob, host, undefined, {
          className: "docx",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: true,
          breakPages: true,
          experimental: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
        });
        if (!cancelled) setMode("docx-preview");
        return;
      } catch {
        /* 落到方案二 */
      }

      // 方案二：mammoth 转 HTML
      try {
        const arrayBuffer = bytes.slice(0).buffer;
        const r = await mammoth.convertToHtml({ arrayBuffer });
        if (cancelled) return;
        setHtml(r.value || "<p>（文档内容为空）</p>");
        setMode("mammoth");
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      }
    })();

    return () => { cancelled = true; };
  }, [bytes, ext]);

  if (error) {
    return (
      <div className="empty-state">
        <div style={{ fontSize: 15 }}>无法预览这个 Word 文件</div>
        <div style={{ maxWidth: 480, textAlign: "center", lineHeight: 1.7 }}>{error}</div>
      </div>
    );
  }

  if (mode === "mammoth") {
    return (
      <div className="docx-wrap">
        {html ? (
          <div className="markdown-body selectable" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div style={{ color: "var(--text-faint)" }}>正在转换…</div>
        )}
      </div>
    );
  }

  return (
    <div className="docx-wrap">
      {!mode && <div style={{ color: "var(--text-faint)" }}>正在渲染 Word 文档…</div>}
      <div ref={hostRef} />
    </div>
  );
}
