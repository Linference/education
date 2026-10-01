// Markdown 渲染 —— 照 Obsidian 阅读视图的能力范围来做
//
// 支持：标题 / 列表 / 任务列表 / 表格 / 围栏代码块（highlight.js 高亮）/
//       行内与块级公式（KaTeX，$...$ 与 $$...$$）/ 引用 / 图片 /
//       [[wikilink]]（含 |别名 与 #标题）/ #标签 / 自动链接
//
// ⚠️ 两个必须记住的坑（都实测踩过）：
//   1. **不能把裸的 \u0000 当占位符** —— markdown-it 会把它渲染成替换字符 �，
//      之后正则再也匹配不上，公式/标签全部丢失。改用私有区字符 \uE000。
//   2. **html: false 时不能注入原始 HTML 标签** —— <a class="wikilink"> 会被转义成
//      &lt;a&gt; 直接显示在页面上。所以改成"先占位、渲染完再替换回 HTML"。
//   3. markdown-it 原生不支持 `- [ ] 任务`，要自己实现（见 taskList 规则）。
import MarkdownIt from "markdown-it";
import katex from "katex";
import hljs from "highlight.js/lib/common";

// 占位符用私有区字符：markdown-it 不会动它，也不会出现在正常文本里
const PH = "\uE000";

/** frontmatter：Obsidian 用 --- 包住 YAML，要单独抽出来显示成属性面板 */
export function splitFrontmatter(src: string): { frontmatter: Record<string, unknown> | null; body: string } {
  if (!src.startsWith("---")) return { frontmatter: null, body: src };
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { frontmatter: null, body: src };
  const raw = m[1];
  const fm: Record<string, unknown> = {};
  for (const line of raw.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_\u4e00-\u9fff-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const s = kv[2].trim();
    if (s.startsWith("[") && s.endsWith("]")) {
      fm[key] = s.slice(1, -1).split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } else {
      fm[key] = s.replace(/^["']|["']$/g, "");
    }
  }
  return { frontmatter: Object.keys(fm).length ? fm : null, body: src.slice(m[0].length) };
}

const md = new MarkdownIt({
  html: false,          // 关掉原始 HTML：笔记里嵌 <script> 没有理由被执行
  linkify: true,
  breaks: false,        // Obsidian 默认不把单个换行当 <br>
  typographer: false,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      } catch { /* 落到下面 */ }
    }
    try {
      return hljs.highlightAuto(code).value;
    } catch {
      return "";
    }
  },
});

// ---------------------------------------------------------------- 任务列表
// markdown-it 原生不支持 `- [ ] / - [x]`。这里在列表项渲染后加工：
// 把开头的 [ ] / [x] 换成真正的 checkbox，并加上 class 以便 CSS 去掉圆点。
md.core.ruler.after("inline", "gezhi-task-list", (state) => {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== "list_item_open") continue;
    // 找到该项里第一个 inline token
    let j = i + 1;
    while (j < tokens.length && tokens[j].type !== "inline" && tokens[j].type !== "list_item_close") j++;
    if (j >= tokens.length || tokens[j].type !== "inline") continue;
    const inline = tokens[j];
    const m = inline.content.match(/^\[([ xX])\]\s+/);
    if (!m) continue;
    const checked = m[1].toLowerCase() === "x";
    inline.content = inline.content.slice(m[0].length);
    if (inline.children && inline.children[0]?.type === "text") {
      inline.children[0].content = inline.children[0].content.replace(/^\[([ xX])\]\s+/, "");
    }
    // 给 list_item_open 打标记，CSS 用 .task-list-item 去掉项目符号
    tokens[i].attrJoin("class", "task-list-item");
    // 在 inline 前插入 checkbox 的 html_inline token
    const cb = new state.Token("html_inline", "", 0);
    cb.content = `<input type="checkbox" disabled${checked ? " checked" : ""}> `;
    inline.children = inline.children ?? [];
    inline.children.unshift(cb);
  }
  return true;
});

// ---------------------------------------------------------------- 占位符保护
//
// 顺序很重要：**先保护会与 markdown 语法冲突的东西**。
//   [[a|b]] 里的 | 会被当成表格分隔符
//   $...$ 里的 _ ^ * 会被当成强调语法
//   $$...$$ 里的 | 同理（实测：不先保护的话公式会被表格规则截断）

interface Protected {
  text: string;
  store: string[];   // 索引 i 的 HTML 片段
}

function protect(src: string): Protected {
  const store: string[] = [];
  const put = (html: string) => {
    store.push(html);
    return `${PH}${store.length - 1}${PH}`;
  };

  let text = src;

  // 1) 块级公式：$$...$$（可能跨行）
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => {
    try {
      return put(
        `<div class="katex-display">${katex.renderToString(tex.trim(), {
          displayMode: true, throwOnError: false, errorColor: "#e93147", strict: false, trust: false,
        })}</div>`
      );
    } catch {
      return _m;
    }
  });

  // 2) 行内公式：$...$（不跨行、不与 $$ 冲突）
  text = text.replace(/(?<!\$)\$(?!\$)([^\n$]+?)\$(?!\$)/g, (_m, tex: string) => {
    try {
      return put(katex.renderToString(tex.trim(), {
        displayMode: false, throwOnError: false, errorColor: "#e93147", strict: false, trust: false,
      }));
    } catch {
      return _m;
    }
  });

  // 3) wikilink：[[目标]] 或 [[目标|别名]] 或 [[目标#标题]]
  text = text.replace(/\[\[([^\]\n]+?)\]\]/g, (_m, inner: string) => {
    const [targetRaw, aliasRaw] = inner.split("|");
    const target = (targetRaw ?? "").trim();
    const label = (aliasRaw ?? "").trim() || target;
    return put(
      `<a class="wikilink" data-wikilink="${escapeAttr(target)}" href="#">${escapeHtml(label)}</a>`
    );
  });

  // 4) 标签：#tag、#tag/sub —— 要求 # 前是行首或空白，避免把 #fff 当标签
  text = text.replace(/(^|[\s(（])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu, (_m, pre: string, tag: string) => {
    return `${pre}${put(`<span class="tag-chip">#${escapeHtml(tag)}</span>`)}`;
  });

  return { text, store };
}

function restore(html: string, store: string[]): string {
  return html.replace(new RegExp(`${PH}(\\d+)${PH}`, "g"), (_m, i) => store[Number(i)] ?? "");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}

/** 把 Markdown 渲染成 HTML（含公式、wikilink、标签、任务列表、代码高亮） */
export function renderMarkdown(src: string): string {
  const { body } = splitFrontmatter(src);
  const { text, store } = protect(body);
  const html = md.render(text);
  return restore(html, store);
}
