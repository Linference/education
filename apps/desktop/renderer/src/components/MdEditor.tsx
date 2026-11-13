// Markdown editor (CodeMirror 6)
//
// Why CodeMirror instead of Monaco:
//   IME composition for Chinese is **solved** in CodeMirror, while Monaco still has
//   the autocomplete popup stealing keys during composition (#2199 / #4805 still open).
//   For Chinese users this is a hard requirement — see the measured findings in poc/ime/.
//
// ★ R13 rule (discovered by testing, must be followed):
//   **Every completion source must check `context.view?.composing` on its first line.**
//   CodeMirror's autocompletion **still** calls completion sources when composing === true,
//   so during Chinese composition the popup fights the IME candidates for keys. With the check:
//   组词期间弹窗出现次数 2 → 0（见 poc/ime/r13-conclusion-autocomplete-and-ime.md）。
import { useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, rectangularSelection, crosshairCursor, highlightSpecialChars, dropCursor,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
// ⚠️ `languages` is not in @codemirror/lang-markdown (checked all 8 of its exports:
//    commonmarkLanguage / deleteMarkupBackward / insertNewlineContinueMarkup /
//    insertNewlineContinueMarkupCommand / markdown / markdownKeymap /
//    markdownLanguage / pasteURLAsLink). It lives in @codemirror/language-data.
//    I once got this wrong from memory and the build reported "languages is not exported".
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput } from "@codemirror/language";
import { autocompletion, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";

interface Props {
  /** File path (rebuilds the editor when switching files) */
  path: string;
  /** Initial content */
  value: string;
  /** Content change (used to mark "unsaved") */
  onChange?: (text: string) => void;
  /** Ctrl+S save */
  onSave?: () => void;
  /** File and folder names in the library (for wikilink completion) */
  vaultNames?: string[];
}
const editorPositions=new Map<string,{anchor:number;head:number;scrollTop:number}>();

export default function MdEditor({ path, value, onChange, onSave, vaultNames = [] }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Keep callbacks in a ref so changes do not rebuild the editor (which would lose the cursor)
  const cbRef = useRef({ onChange, onSave, vaultNames });
  cbRef.current = { onChange, onSave, vaultNames };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    /**
     * wikilink completion source.
     *
     * ★ The first line must be the composing check — see the R13 note at the top of the file.
     *   Measured: without it, the popup steals IME keys during Chinese composition.
     */
    const wikiComplete = (context: any) => {
      if (context.view?.composing) return null;      // ← R13: must be the first line
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

    /** Heading completion: common Markdown structure after # */
    const mdComplete = (context: any) => {
      if (context.view?.composing) return null;      // ← R13: must be the first line
      const before = context.matchBefore(/^#{1,6}\s.*$/);
      if (!before) return null;
      return null;   // No completion inside headings; leave it to wikilinks
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
            // Ctrl+S save (captured in the editor so the browser/Electron does not take it)
            key: "Mod-s",
            preventDefault: true,
            run: () => { cbRef.current.onSave?.(); return true; },
          },
        ]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) cbRef.current.onChange?.(u.state.doc.toString());
        }),
        // Editor theme: consistent with Gezhi's overall look (no bundled theme; align via variables)
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
          // Dim Markdown markup symbols (heading #, emphasis *, etc.) — close to a WYSIWYG feel
          ".cm-formatting": { color: "var(--text-faint)" },
          ".cm-formatting-header": { color: "var(--accent)", opacity: 0.55 },
          ".cm-formatting-strong, .cm-formatting-emphasis": { color: "var(--text-faint)" },
          // Heading size hierarchy (levels visible while editing)
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
    const position=editorPositions.get(path);
    if(position){view.dispatch({selection:{anchor:Math.min(position.anchor,state.doc.length),head:Math.min(position.head,state.doc.length)}});requestAnimationFrame(()=>{if(viewRef.current===view)view.scrollDOM.scrollTop=position.scrollTop;});}
    view.focus();

    return () => {
      editorPositions.set(path,{anchor:view.state.selection.main.anchor,head:view.state.selection.main.head,scrollTop:view.scrollDOM.scrollTop});
      if(editorPositions.size>100)editorPositions.delete(editorPositions.keys().next().value!);
      view.destroy();
      viewRef.current = null;
    };
    // Rebuild when path changes (switching files); value is not a dependency — otherwise every keystroke would rebuild
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // External content change (e.g. reload after AI edited the file) → update the editor content
  const lastValueRef = useRef(value);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    // Overwrite only when the external value differs from the editor's current and last-synced values,
    // otherwise it would wipe what the user is typing
    if (value !== current && value !== lastValueRef.current) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
    lastValueRef.current = value;
  }, [value]);

  return <div ref={hostRef} style={{ height: "100%", overflow: "hidden" }} />;
}
