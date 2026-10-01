// 旧版 .doc（Word 97-2003）查看器
//
// 与 .docx 的区别必须**如实告知用户**：
//   .docx 是 zip+XML，可以原样还原版式（表格、字体、页眉页脚）；
//   .doc 是 OLE 二进制，我提取的是**纯文本**，版式（图片、公式对象、
//   EMBED 域、精确排版）无法还原。
//
// 为什么不在界面上"装作一样"：
//   用户看到文字就以为版式也对，拿去交作业会出问题。
//   顶部明确写"文字提取"、给出提取方式与耗时，才是诚实的做法。
//
// 物理竞赛题集那类文件里有 `EMBED Equation.DSMT4`（MathType 公式对象），
// 提取出来就是这串占位符 —— 这不是 bug，是二进制格式的固有限制，
// 界面上要说明白，免得用户以为是软件坏了。
import { useEffect, useState } from "react";

interface Props {
  path: string;
  name: string;
}

interface DocResult {
  ok: boolean;
  text?: string;
  method?: string;
  size?: number;
  ms?: number;
  lossy?: boolean;
  error?: string;
  isActuallyDocx?: boolean;
}

const METHOD_LABEL: Record<string, string> = {
  "piece-table": "按分片表精确提取",
  "scan-fallback": "扫描提取（FIB 字段不准时的兜底）",
  rtf: "RTF 解析",
  plaintext: "纯文本",
};

export default function DocViewer({ path, name }: Props) {
  const [r, setR] = useState<DocResult | null>(null);
  const [showNotice, setShowNotice] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setR(null);
    window.gezhi.file.readDoc(path).then((res) => {
      if (!cancelled) setR(res);
    }).catch((e) => {
      if (!cancelled) setR({ ok: false, error: e?.message ?? String(e) });
    });
    return () => { cancelled = true; };
  }, [path]);

  if (!r) {
    return <div className="empty-state">正在解析 .doc（Word 97-2003 二进制格式）…</div>;
  }

  if (!r.ok) {
    return (
      <div className="empty-state">
        <div style={{ fontSize: 15 }}>{r.isActuallyDocx ? "这个文件其实是 .docx" : "无法读取这个 .doc 文件"}</div>
        <div style={{ maxWidth: 520, textAlign: "center", lineHeight: 1.8 }}>{r.error}</div>
        {r.isActuallyDocx && (
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", maxWidth: 520, textAlign: "center" }}>
            把扩展名从 .doc 改成 .docx 后重新打开即可 —— 有些软件保存时会写成 .doc，
            但内容实际是新的 .docx 格式。
          </div>
        )}
      </div>
    );
  }

  const text = r.text ?? "";
  const hasEmbed = /EMBED\s+Equation|EMBED\s+Word\.Picture|EMBED\s+Excel/i.test(text);
  const lines = text.split("\n");

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* 提示条：说明这是文字提取，不是原版排版 */}
      {showNotice && (
        <div
          style={{
            flex: "0 0 auto",
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "7px 12px",
            fontSize: 12,
            lineHeight: 1.6,
            background: "#fff8e6",
            color: "#7a5300",
            borderBottom: "1px solid #f0e0b8",
          }}
        >
          <span style={{ flex: "1 1 auto" }}>
            <b>文字提取模式</b>：.doc 是旧版二进制格式，这里显示的是提取出的文字，
            <b>图片、公式对象与原版排版无法还原</b>。
            {r.method && <> 提取方式：{METHOD_LABEL[r.method] ?? r.method}，耗时 {r.ms}ms。</>}
            {hasEmbed && (
              <>
                <br />
                文中出现的 <code>EMBED Equation.DSMT4</code> 之类是原文档里的
                <b>公式对象占位符</b>（MathType 等以 OLE 对象嵌入，二进制里没有纯文本形态），
                导出 PDF 时会缺失 —— 需要公式请用 .docx 或重新录入。
              </>
            )}
          </span>
          <button
            onClick={() => setShowNotice(false)}
            style={{ flex: "0 0 auto", color: "#7a5300", opacity: 0.7, fontSize: 14 }}
            title="知道了"
          >
            ✕
          </button>
        </div>
      )}

      {/* 正文 */}
      <div style={{ flex: "1 1 auto", overflow: "auto", background: "var(--bg-primary)" }}>
        <div
          className="markdown-body selectable"
          style={{ fontFamily: "var(--font-text)", maxWidth: 820 }}
        >
          {lines.map((ln, i) => (
            <p key={i} style={{ margin: "0 0 0.55em", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {ln || "\u00a0"}
            </p>
          ))}
        </div>
      </div>

      {/* 底部统计 */}
      <div
        style={{
          flex: "0 0 auto",
          padding: "4px 12px",
          fontSize: 11.5,
          color: "var(--text-faint)",
          borderTop: "1px solid var(--bd)",
          background: "var(--bg-secondary)",
        }}
      >
        {text.length} 字 · {lines.length} 行 · 原文件 {((r.size ?? 0) / 1024).toFixed(0)} KB
      </div>
    </div>
  );
}
