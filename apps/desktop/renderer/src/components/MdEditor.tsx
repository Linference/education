// Markdown 编辑器（CodeMirror 6）
//
// 为什么选 CodeMirror 而不是 Monaco：
//   中文输入法的组合输入在 CodeMirror 里是**已解决**的，而 Monaco 至今仍有
//   组词时补全弹窗抢按键的问题（#2199 / #4805 未关闭）。
//   对中文用户这是硬指标 —— 见 poc/ime/ 的实测结论。
//
// ★ R13 规则（实测发现，必须遵守）：
//   **每个补全源的第一行都必须判 `context.view?.composing`。**
//   CodeMirror 的 autocompletion 在 composing === true 时**仍会**调用补全源，
//   于是中文组词时弹窗和输入法候选词抢按键。加上判断后：
//   组词期间弹窗出现次数 2 → 0（见 poc/ime/R13结论-补全与输入法.md）。
import { useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, rectangularSelection, crosshairCursor, highlightSpecialChars, dropCursor,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
// ⚠️ `languages` 不在 @codemirror/lang-markdown 里（实测查过它的 8 个导出：
//    commonmarkLanguage / deleteMarkupBackward / insertNewlineContinueMarkup /
//    insertNewlineContinueMarkupCommand / markdown / markdownKeymap /
//    markdownLanguage / pasteURLAsLink）。它在 @codemirror/language-data 里。
//    我凭记忆写错过一次，构建直接报 "languages is not exported"。
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput } from "@codemirror/language";
import { autocompletion, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";

interface Props {
  /** 文件路径（切换文件时重建编辑器） */
  path: string;
  /** 初始内容 */
  value: string;
  /** 内容变化（用于标记"未保存"） */
  onChange?: (text: string) => void;
  /** Ctrl+S 保存 */
  onSave?: () => void;
  /** 库里的文件与文件夹名（wikilink 补全用） */
  vaultNames?: string[];
}

export default function MdEditor({ path, value, onChange, onSave, vaultNames = [] }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // 用 ref 保存回调，避免它们变化时重建编辑器（会丢光标位置）
  const cbRef = useRef({ onChange, onSave, vaultNames });
  cbRef.current = { onChange, onSave, vaultNames };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    /**
     * wikilink 补全源。
     *
     * ★ 第一行必须是 composing 判断 —— 见文件顶部 R13 说明。
     *   实测：不判的话中文组词时弹窗会抢输入法的按键。
     */
    const wikiComplete = (context: any) => {
      if (context.view?.composing) return null;      // ← R13：必须第一行
      const before = context.matchBefore(/\[\[([^\]\n]*)$/);
      if (!before) return null;
      const typed = before.text.slice(2).toLowerCase();
      const options = cbRef.current.vaultNames
        .filter((n) => n.toLowerCase().includes(typed))
        .slice(0, 50)
        .map((n) => ({ label: n, type: "text" }));
      if (options.length === 0) return null;
      return { from: before.from + 2, options, validFor: /^[^\]\n]*$/ };
    };

    /** 标题补全：# 之后给常用 Markdown 结构 */
    const mdComplete = (context: any) => {
      if (context.view?.composing) return null;      // ← R13：必须第一行
      const before = context.matchBefore(/^#{1,6}\s.*$/);
      if (!before) return null;
      return null;   // 标题里不做补全，交给 wikilink
    };

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        autocompletion({ override: [wikiComplete, mdComplete] }),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          indentWithTab,
          {
            // Ctrl+S 保存（编辑器内捕获，避免被浏览器/Electron 抢走）
            key: "Mod-s",
            preventDefault: true,
            run: () => { cbRef.current.onSave?.(); return true; },
          },
        ]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) cbRef.current.onChange?.(u.state.doc.toString());
        }),
        // 编辑器主题：与格致整体观感一致（不自带主题，用变量对齐）
        EditorView.theme({
          "&": {
            fontSize: "15px",
            height: "100%",
            backgroundColor: "var(--bg-primary)",
            color: "var(--text-normal)",
          },
          ".cm-content": {
            fontFamily: "var(--font-text)",
            lineHeight: "1.75",
            padding: "20px 0 120px",
            caretColor: "var(--accent)",
          },
          ".cm-scroller": { fontFamily: "var(--font-text)", overflow: "auto" },
          "&.cm-focused": { outline: "none" },
          ".cm-gutters": {
            backgroundColor: "var(--bg-secondary)",
            color: "var(--text-faint)",
            border: "none",
            borderRight: "1px solid var(--bd)",
            fontSize: "12px",
          },
          ".cm-activeLine": { backgroundColor: "rgba(127,109,242,0.05)" },
          ".cm-activeLineGutter": { backgroundColor: "rgba(127,109,242,0.08)" },
          ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
            backgroundColor: "rgba(127,109,242,0.22) !important",
          },
          // Markdown 标记符号弱化（标题#、强调*等）—— 接近所见即所得观感
          ".cm-formatting": { color: "var(--text-faint)" },
          ".cm-formatting-header": { color: "var(--accent)", opacity: 0.55 },
          ".cm-formatting-strong, .cm-formatting-emphasis": { color: "var(--text-faint)" },
          // 标题字号分级（编辑时也能看出层级）
          ".cm-line.h1, .cm-line.ͼm": { fontSize: "1.5em" },
          ".cm-tooltip-autocomplete": {
            border: "1px solid var(--bd-strong)",
            borderRadius: "6px",
            boxShadow: "0 4px 16px rgba(0,0,0,.14)",
            background: "var(--bg-primary)",
          },
          ".cm-tooltip-autocomplete ul li[aria-selected]": {
            background: "var(--accent-soft)",
            color: "var(--accent)",
          },
        }),
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // path 变化时重建（换文件）；value 不进依赖 —— 否则每次输入都会重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // 外部内容变化（例如 AI 改了文件后重新载入）→ 更新编辑器内容
  const lastValueRef = useRef(value);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    // 只在外部值与编辑器当前值不同、且与上次已同步值不同时才覆盖，
    // 否则会把用户正在输入的内容冲掉
    if (value !== current && value !== lastValueRef.current) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
    lastValueRef.current = value;
  }, [value]);

  return <div ref={hostRef} style={{ height: "100%", overflow: "hidden" }} />;
}
