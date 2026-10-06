// Markdown → Typst 转换器
//
// 为什么要自己写：Typst 与 Markdown 的语法**看起来像，其实关键处不同**，
// 直接拼字符串会出一堆问题（下面每条都是实测踩过的）：
//
//   1. Typst 里 `#` 是代码模式的开始 —— Markdown 的标题 `#` 必须转成 `=`，
//      正文里的 `#` 必须写成 `\#`，否则报 "expected expression"
//   2. Typst 的粗体是 `*粗*`（单星），斜体是 `_斜_`；
//      Markdown 的 `**粗**` 直接搬过去会被当成两个嵌套的斜体
//   3. Typst 字符串**没有转义序列** —— 正文里的 `"` 不用处理，但 `\` 是有意义的
//   4. `$` 在两边都表示公式，但 Typst 块级公式要求**两侧有空格**：
//      `$ x $` 是块级，`$x$` 是行内 —— 与 Markdown 的 `$$` / `$` 映射规则不同
//   5. Typst 的列表是 `- ` / `+ `，但**续行缩进规则与 Markdown 不同**
//   6. 表格语法完全不同：Markdown 用 `| a | b |`，Typst 用 `table(columns:..)`
//   7. **公式里的 LaTeX 命令必须转换** —— Typst 的数学语法不是 LaTeX，
//      `\frac{a}{b}` 会报 `unknown variable: rac`。见 latex2typst.cjs。
const { latexToTypst } = require("./latex2typst.cjs");

/** 公式内容：LaTeX → Typst。块级用空格包裹，行内不加空格。 */
function mathToTypst(tex, display) {
  const { typst } = latexToTypst(tex.trim());
  return display ? `$ ${typst} $` : `$${typst}$`;
}
//
// 设计取舍：**宁可保守，不要炫技**。遇到不认识的语法就原样输出（已转义），
// 绝不因为"想支持某个拓展语法"而把正常内容弄坏。

/** Typst 特殊字符 → 转义形式。只转义真的会改变语义的那些。 */
function escapeTypst(s) {
  return s
    .replace(/\\/g, "\\\\")     // 反斜杠最先（否则会把后面加的转义再转一遍）
    .replace(/#/g, "\\#")
    .replace(/\$/g, "\\$")
    .replace(/@/g, "\\@")       // @ 是引用语法
    .replace(/</g, "\\<")
    .replace(/>/g, "\\>")
    .replace(/~/g, "\\~")       // ~ 是不换行空格
    .replace(/\^/g, "\\^");
}

/** 转义 Typst 字符串字面量里的内容（用在 "..." 里） */
function escapeTypstString(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function protect(ctx, typst) {
  ctx.store.push(typst);
  return `\uE000${ctx.store.length - 1}\uE000`;
}

/**
 * 处理行内语法：代码 → 公式 → 粗体 → 斜体 → 删除线 → 链接。
 *
 * 顺序很关键：代码与公式要**先**抽出来保护，否则它们内部的 `*` `_` `#`
 * 会被后面的规则误伤（例如 `a_b_c` 这种变量名会被当成斜体）。
 */
function inline(text, ctx) {
  let s = text;

  // 1) 行内代码 `code` → Typst 的 `code`（反引号语法相同）
  //    但内容必须**原样**放进 Typst 的 raw，不能转义
  s = s.replace(/`([^`\n]+)`/g, (_m, code) => {
    // Typst 的 raw 用反引号界定；内容里有反引号时要用更多的反引号
    const ticks = code.includes("`") ? "``" : "`";
    return protect(ctx, `${ticks}${code}${ticks}`);
  });

  // 2) 数学公式：$$...$$ 块级、$...$ 行内
  //    Typst 映射：块级 `$ ... $`（两侧空格）、行内 `$...$`（无空格）
  s = s.replace(/\$\$([^$]+?)\$\$/g, (_m, tex) => protect(ctx, mathToTypst(tex, true)));
  s = s.replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, (_m, tex) => protect(ctx, mathToTypst(tex, false)));

  // 3) 图片 ![alt](src) → Typst figure/image
  //    Typst 的 image() 需要文件真实存在，导出 PDF 时图片路径要能被 --root 解析到
  s = s.replace(/!\[([^\]]*)\]\((<[^>]+>|(?:[^()\n]|\([^()\n]*\))+?)\)/g, (original, alt) => {
    const parsed = new (require('markdown-it'))().parseInline(original, {})[0]?.children?.find(t => t.type === 'image');
    if (!parsed) return original;
    const src = parsed.attrGet('src');
    const resolved = ctx.imageResolver ? ctx.imageResolver(src) : src;
    if (!resolved) return protect(ctx, escapeTypst('[图片未能嵌入：' + (alt || src) + ']'));
    return protect(ctx, `#figure(image("${escapeTypstString(resolved)}", width: 70%), caption: [${escapeTypst(alt)}])`);
  });

  // 4) 链接 [text](url) → Typst 的 link
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, txt, url) => {
    return protect(ctx, `#link("${escapeTypstString(url)}")[${escapeTypst(txt)}]`);
  });

  // 4.5) wikilink [[目标]] / [[目标|别名]] / [[目标#标题]]
  //
  // ⚠️ 必须在"链接"之后、转义之前处理：
  //    Typst 里 `[[` 是数组语法，原样留着虽然在多数情况下不报错，
  //    但 PDF 里会出现字面的方括号 —— 实测 `[[虚拟语气]]` 就这么印出来了。
  //    这里只保留显示文字（PDF 是静态交付物，跳转没有意义）。
  s = s.replace(/\[\[([^\]\n]+?)\]\]/g, (_m, inner) => {
    const [targetRaw, aliasRaw] = inner.split("|");
    const label = (aliasRaw ?? "").trim() || (targetRaw ?? "").split("#")[0].trim();
    return protect(ctx, escapeTypst(label));
  });

  // 5) 先做转义，再做粗体/斜体 —— 因为粗体标记 `**` 本身不该被转义
  s = escapeTypst(s);

  // 6) 粗体 **text** / __text__ → *text*
  //
  // ⚠️ 处理完粗体必须**立刻保护起来**，否则紧接着的斜体规则会把
  //    `*态度*` 再转成 `_态度_`，粗体就丢了。
  //    实测踩过：**态度** → *态度* → _态度_（粗体消失）。
  s = s.replace(/\*\*([^*]+?)\*\*/g, (_m, t) => protect(ctx, `*${t}*`));
  s = s.replace(/__([^_]+?)__/g, (_m, t) => protect(ctx, `*${t}*`));

  // 7) 斜体 *text* → _text_    （此时 `**` 已处理完并保护，剩下的单星才是真斜体）
  s = s.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1_$2_");

  // 8) 删除线 ~~text~~ → Typst 的 strike
  s = s.replace(/~~([^~]+?)~~/g, "#strike[$1]");

  // 9) 还原被保护的片段
  s = s.replace(/\uE000(\d+)\uE000/g, (_m, i) => ctx.store[Number(i)] ?? "");

  return s;
}

/**
 * 把 Markdown 正文转成 Typst 正文。
 *
 * 用**逐行状态机**而不是整体正则：代码块必须整体跳过（里面的内容是原样的），
 * 用正则会很容易把代码块里的 ``` 和外面的搞混。
 */
function markdownToTypst(md, { imageResolver } = {}) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  const ctx = { store: [], imageResolver };
  let title = "";

  let inFence = false;
  let fenceLang = "";
  let fenceBuf = [];
  let fenceTicks = "```";

  let inMathBlock = false;
  let mathBuf = [];

  // 表格缓冲
  let tableBuf = [];

  const flushTable = () => {
    if (tableBuf.length === 0) return;
    const rows = tableBuf.map((r) =>
      r.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'))
    );
    // 第二行是 |---|---| 分隔行，丢掉
    const dataRows = rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
    if (dataRows.length === 0) { tableBuf = []; return; }
    const cols = Math.max(...dataRows.map((r) => r.length));
    const header = dataRows[0];
    const rest = dataRows.slice(1);

    const cell = (c) => {
      if (c === undefined) return "[]";
      return `[${inline(c, ctx)}]`;
    };

    out.push("");
    out.push(`#figure(`);
    out.push(`  table(`);
    out.push(`    columns: ${cols},`);
    out.push(`    inset: (x: 7pt, y: 5pt),`);
    out.push(`    align: (left, center,),`);
    // 表头：加粗 + 淡底色
    out.push(`    table.header(${Array.from({ length: cols }, (_, i) => `table.cell(fill: luma(94%))[*${escapeTypst(header[i] ?? "")}*]`).join(", ")}),`);
    for (const r of rest) {
      out.push(`    ${Array.from({ length: cols }, (_, i) => cell(r[i])).join(", ")},`);
    }
    // 描边：外框稍重，内线用浅灰
    out.push(`    stroke: 0.4pt + luma(72%),`);
    out.push(`  ),`);
    out.push(`  kind: table,`);
    out.push(`  supplement: none,`);
    out.push(`)`);
    out.push("");
    tableBuf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw;

    // ---- frontmatter：整段跳过，不要输出到正文 ----
    //
    // ⚠️ 实测踩过：不做这一步，YAML 会原样打进 PDF，
    //    第一页顶部出现 `type: 语法讲义 tags: [英语, 语法]` —— 很难看，
    //    而且那是元数据不是内容。Obsidian 把它显示成属性面板，导出时应当丢弃。
    if (i === 0 && line.trim() === "---") {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== "---") j++;
      if (j < lines.length) {
        i = j;          // 跳到结束的 ---
        continue;
      }
      // 没有配对的 --- 就当成水平线，不特殊处理
    }

    // ---- 代码块 ----
    const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)\s*$/);
    if (fenceMatch && !inMathBlock) {
      if (!inFence) {
        flushTable();
        inFence = true;
        fenceTicks = fenceMatch[2];
        fenceLang = fenceMatch[3] ?? "";
        fenceBuf = [];
      } else if (line.trim().startsWith(fenceTicks)) {
        // 结束
        out.push("");
        // Typst 的 raw 块：```lang\n...\n``` 语法与 Markdown 一致
        const lang = fenceLang ? fenceLang : "";
        // 内容里若有 ``` 要用更长的界定符
        const ticks = fenceBuf.some((l) => l.includes("```")) ? "````" : "```";
        out.push(`${ticks}${lang}`);
        out.push(...fenceBuf);
        out.push(ticks);
        out.push("");
        inFence = false;
        fenceBuf = [];
      } else {
        fenceBuf.push(line);
      }
      continue;
    }
    if (inFence) { fenceBuf.push(line); continue; }

    // ---- 块级公式 $$...$$（可能跨行）----
    if (!inMathBlock && /^\s*\$\$/.test(line)) {
      const oneLine = line.match(/^\s*\$\$(.+?)\$\$\s*$/);
      if (oneLine) {
        flushTable();
        out.push("");
        out.push(mathToTypst(oneLine[1], true));
        out.push("");
        continue;
      }
      flushTable();
      inMathBlock = true;
      mathBuf = [line.replace(/^\s*\$\$/, "")];
      continue;
    }
    if (inMathBlock) {
      if (/\$\$\s*$/.test(line)) {
        mathBuf.push(line.replace(/\$\$\s*$/, ""));
        out.push("");
        out.push(mathToTypst(mathBuf.join("\n"), true));
        out.push("");
        inMathBlock = false;
        mathBuf = [];
      } else {
        mathBuf.push(line);
      }
      continue;
    }

    // ---- 表格 ----
    if (/^\s*\|.*\|\s*$/.test(line)) {
      tableBuf.push(line);
      continue;
    }
    if (tableBuf.length) flushTable();

    // ---- 标题 ----
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const txt = inline(h[2].trim(), ctx);
      if (level === 1 && !title) title = h[2].trim();
      out.push("");
      out.push(`${"=".repeat(level)} ${txt}`);
      out.push("");
      continue;
    }

    // ---- 水平线 ----
    if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(line)) {
      out.push("");
      out.push("#line(length: 100%, stroke: 0.5pt + luma(75%))");
      out.push("");
      continue;
    }

    // ---- 引用 ----
    // ⚠️ Typst 0.15 的 quote() **没有 indent 参数**（实测报 unexpected argument: indent）。
    //    可用参数只有 block 与 attribution。缩进由 quote 自己处理。
    const q = line.match(/^>\s?(.*)$/);
    if (q) {
      out.push(`#quote(block: true)[${inline(q[1], ctx)}]`);
      continue;
    }

    // ---- 任务列表 ----
    const task = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (task) {
      const indent = Math.floor(task[1].length / 2);
      const box = task[2].toLowerCase() === "x" ? "☑" : "☐";
      out.push(`${"  ".repeat(indent)}- ${box} ${inline(task[3], ctx)}`);
      continue;
    }

    // ---- 无序列表 ----
    const ul = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (ul) {
      const indent = Math.floor(ul[1].length / 2);
      out.push(`${"  ".repeat(indent)}- ${inline(ul[2], ctx)}`);
      continue;
    }

    // ---- 有序列表 ----
    const ol = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
    if (ol) {
      const indent = Math.floor(ol[1].length / 2);
      out.push(`${"  ".repeat(indent)}+ ${inline(ol[3], ctx)}`);
      continue;
    }

    // ---- 普通段落 ----
    if (line.trim() === "") {
      out.push("");
      continue;
    }
    out.push(inline(line, ctx));
  }

  // 收尾
  if (tableBuf.length) flushTable();
  if (inFence && fenceBuf.length) {
    out.push("```" + fenceLang);
    out.push(...fenceBuf);
    out.push("```");
  }

  // 压缩多余空行（Typst 对连续空行敏感度低，但干净些好调试）
  const body = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { body, title };
}

/**
 * 生成一份完整可编译的 .typ 文件。
 *
 * 产出物**不得有任何产品署名**（产品硬规矩）—— 所以不注入页脚、
 * 不注入"由某某生成"之类的文字。author 只在调用方显式给出时才传。
 */
function buildTypstDocument(md, opts = {}) {
  const { body, title } = markdownToTypst(md);
  const docTitle = opts.title ?? title ?? "未命名文档";
  const authorLine = opts.author ? `author: "${escapeTypstString(opts.author)}",` : "";

  return `// 由「格致」导出 —— 本注释在编译进 PDF 后不可见
// 产出物不含任何产品署名（产品硬规矩）
#import "${opts.templatePath.replace(/\\/g, "/")}": handout

#show: handout.with(
  title: "${escapeTypstString(docTitle)}",
  ${authorLine}
)

${body}
`;
}

module.exports = { markdownToTypst, buildTypstDocument };
