// 代码 / 纯文本查看器
// 代码走 highlight.js 高亮并按行号排版；纯文本保持原样（等宽、可选中）
import { useMemo } from "react";
import hljs from "highlight.js/lib/common";

const LANG_BY_EXT: Record<string, string> = {
  ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript",
  ".ts": "typescript", ".tsx": "typescript", ".jsx": "javascript",
  ".py": "python", ".c": "c", ".h": "c", ".cpp": "cpp", ".cc": "cpp", ".hpp": "cpp",
  ".java": "java", ".rs": "rust", ".go": "go", ".rb": "ruby", ".php": "php",
  ".sh": "bash", ".ps1": "powershell", ".sql": "sql",
  ".json": "json", ".yaml": "yaml", ".yml": "yaml", ".toml": "ini", ".ini": "ini",
  ".html": "xml", ".css": "css", ".scss": "scss", ".xml": "xml",
  ".lua": "lua", ".r": "r", ".vue": "xml", ".svelte": "xml",
};

interface Props {
  text: string;
  ext: string;
  plain?: boolean;
}

export default function CodeView({ text, ext, plain }: Props) {
  const { html, lang, lines } = useMemo(() => {
    const lang = LANG_BY_EXT[ext.toLowerCase()];
    const lineCount = text.split("\n").length;
    if (plain || !lang || !hljs.getLanguage(lang)) {
      return { html: null, lang: null, lines: lineCount };
    }
    try {
      const r = hljs.highlight(text, { language: lang, ignoreIllegals: true });
      return { html: r.value, lang, lines: lineCount };
    } catch {
      return { html: null, lang: null, lines: lineCount };
    }
  }, [text, ext, plain]);

  return (
    <div style={{ padding: "16px 0 80px" }}>
      <div
        style={{
          display: "flex",
          gap: 12,
          padding: "0 20px 8px",
          fontSize: 12,
          color: "var(--text-faint)",
        }}
      >
        <span>{lang ?? "纯文本"}</span>
        <span>·</span>
        <span>{lines} 行</span>
      </div>
      <div style={{ display: "flex", padding: "0 20px", fontFamily: "var(--font-mono)" }}>
        <div
          style={{
            flex: "0 0 auto",
            userSelect: "none",
            textAlign: "right",
            paddingRight: 14,
            color: "var(--text-faint)",
            fontSize: 13,
            lineHeight: 1.65,
          }}
        >
          {Array.from({ length: lines }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <div style={{ flex: "1 1 auto", minWidth: 0, overflowX: "auto" }}>
          {html ? (
            <pre
              className="selectable"
              style={{ margin: 0, fontSize: 13, lineHeight: 1.65, background: "none", padding: 0 }}
            >
              <code dangerouslySetInnerHTML={{ __html: html }} />
            </pre>
          ) : (
            <pre
              className="selectable"
              style={{ margin: 0, fontSize: 13, lineHeight: 1.65, background: "none", padding: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            >
              {text}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
