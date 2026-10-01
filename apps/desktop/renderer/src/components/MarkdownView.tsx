// Markdown 阅读视图
//
// 只做"渲染"这一件事，编辑器是另一个组件（LiveEditor）。
// 属性面板（YAML frontmatter）按 Obsidian 的样子放在正文上方 ——
// 这是用户截图里明确想要的东西。
import { useMemo, useRef, useEffect } from "react";
import { renderMarkdown, splitFrontmatter } from "../lib/markdown";

interface Props {
  text: string;
  /** 点击 wikilink 时回调（用来跳转到另一篇笔记） */
  onWikilink?: (target: string) => void;
}

export default function MarkdownView({ text, onWikilink }: Props) {
  const { frontmatter, html } = useMemo(() => {
    const { frontmatter } = splitFrontmatter(text);
    return { frontmatter, html: renderMarkdown(text) };
  }, [text]);

  const bodyRef = useRef<HTMLDivElement>(null);

  // wikilink 用事件委托，避免每次渲染都绑一堆监听
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !onWikilink) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest?.("a.wikilink") as HTMLAnchorElement | null;
      if (!a) return;
      e.preventDefault();
      const target = a.dataset.wikilink;
      if (target) onWikilink(target);
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [onWikilink]);

  return (
    <div className="selectable">
      {frontmatter && (
        <div className="props">
          <div className="props-title">笔记属性</div>
          {Object.entries(frontmatter).map(([k, v]) => (
            <div className="prop-row" key={k}>
              <div className="prop-key">
                <span style={{ opacity: 0.55 }}>≡</span>
                {k}
              </div>
              <div className="prop-val">
                {Array.isArray(v) ? (
                  v.map((t) => (
                    <span className="tag-chip" key={String(t)}>
                      {String(t)}
                    </span>
                  ))
                ) : (
                  String(v)
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div
        ref={bodyRef}
        className="markdown-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
