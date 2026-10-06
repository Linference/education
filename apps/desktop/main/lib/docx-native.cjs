// Markdown → Word (.docx)，纯 JavaScript 实现
//
// 为什么不用 python-docx：
//   那需要随包带一个 Python 运行时（本机装完 11 GB，embeddable 版也要 40–60 MB
//   且还要自己解决 lxml 依赖）。而 docx 这个 npm 库是 MIT 许可、解包 9 MB、
//   纯 JS、直接生成 OOXML —— 对"全内置安装包"这个目标，差距是一个量级。
//
// 产出物硬规矩：**不得出现任何产品署名** —— 不写页脚、不加"由某某生成"、不加水印。
//
// 字体处理（中文的关键）：
//   OOXML 里必须同时设 ascii/hAnsi 与 **eastAsia** 三个字体槽，
//   只设 ascii 的话中文会回退成默认字体（宋体或 Calibri），看起来像没排版。
const fs = require("node:fs");
const path = require("node:path");
const d = require("docx");

const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType,
  ExternalHyperlink,
} = d;

// 字体：等线（正文）/ 微软雅黑（标题）/ Consolas（代码）
const FONT_BODY_CN = "DengXian";
const FONT_BODY_EN = "Calibri";
const FONT_HEAD_CN = "Microsoft YaHei";
const FONT_MONO = "Consolas";

/** 统一构造 TextRun：三处字体槽都设上，中文才不回退 */
function run(text, opts = {}) {
  const { bold, italics, mono, size, color, underline } = opts;
  const cn = mono ? FONT_MONO : (opts.cn ?? FONT_BODY_CN);
  const en = mono ? FONT_MONO : (opts.en ?? FONT_BODY_EN);
  return new TextRun({
    text,
    bold,
    italics,
    underline,
    color,
    size: size ?? (mono ? 19 : 21),   // half-points：21 = 10.5pt
    font: {
      ascii: en,
      hAnsi: en,
      eastAsia: cn,                   // ★ 中文生效的关键
      cs: en,
    },
  });
}

// ---------------------------------------------------------------- 行内解析

/** 行内标记：`code`、**粗**、__粗__、*斜*、[text](url)、$公式$ */
const INLINE_RE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(\$[^$\n]+\$)|(\[[^\]\n]+\]\([^)\s]+\))/g;

/** 把一行文本转成 TextRun 数组（保留粗体/斜体/代码样式） */
function inlineRuns(text) {
  const out = [];
  let pos = 0;
  INLINE_RE.lastIndex = 0;
  let m;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > pos) out.push(run(text.slice(pos, m.index)));
    const tok = m[0];
    if (tok.startsWith("`")) {
      out.push(run(tok.slice(1, -1), { mono: true }));
    } else if (tok.startsWith("**") || tok.startsWith("__")) {
      out.push(run(tok.slice(2, -2), { bold: true }));
    } else if (tok.startsWith("*")) {
      out.push(run(tok.slice(1, -1), { italics: true }));
    } else if (tok.startsWith("$")) {
      // Word 不渲染 LaTeX，原样保留（不假装能排版），但换个字体让它不像正文
      out.push(run(tok, { cn: "Cambria Math", en: "Cambria Math" }));
    } else if (tok.startsWith("[")) {
      const mm = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      if (mm) {
        out.push(new ExternalHyperlink({
          children: [run(mm[1], { color: "2F5496", underline: {} })],
          link: mm[2],
        }));
      } else {
        out.push(run(tok));
      }
    }
    pos = m.index + tok.length;
  }
  if (pos < text.length) out.push(run(text.slice(pos)));
  return out.length ? out : [run("")];
}

// ---------------------------------------------------------------- 表格

function buildTable(rows) {
  const cols = Math.max(...rows.map((r) => r.length));
  const border = { style: BorderStyle.SINGLE, size: 4, color: "AAAAAA" };
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: rows.map((cells, ri) => new TableRow({
      tableHeader: ri === 0,
      children: Array.from({ length: cols }, (_, ci) => {
        const txt = cells[ci] ?? "";
        const runs = inlineRuns(txt).map((r) => {
          if (ri === 0) r.bold = true;
          return r;
        });
        return new TableCell({
          shading: ri === 0 ? { fill: "F0F0F0" } : undefined,   // 表头淡底
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [new Paragraph({ children: runs, spacing: { before: 0, after: 0 } })],
        });
      }),
    })),
  });
}

// ---------------------------------------------------------------- 主转换

/**
 * Markdown → docx Buffer。
 *
 * 用逐行状态机（与 md2typst.cjs 同样的思路）：代码块、表格要整体处理，
 * 用正则会很容易把代码块里的 ``` 和外面的搞混。
 */
function markdownToDocx(markdown, opts = {}) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const children = [];

  let inFence = false;
  let fenceTicks = "```";
  let fenceBuf = [];
  let tableBuf = [];
  let titleUsed = false;

  const flushTable = () => {
    if (!tableBuf.length) return;
    const rows = tableBuf.map((r) =>
      r.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'))
    );
    // 丢掉 |---|---| 分隔行
    const data = rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
    if (data.length) {
      children.push(buildTable(data));
      children.push(new Paragraph({ text: "", spacing: { after: 120 } }));
    }
    tableBuf = [];
  };

  const flushFence = () => {
    if (!fenceBuf.length) return;
    // 代码块：等宽字体 + 淡灰底 + 左缩进，整体作为一个段落（保留换行）
    children.push(new Paragraph({
      shading: { fill: "F5F5F5" },
      indent: { left: 240 },
      spacing: { before: 80, after: 80, line: 260 },
      children: [run(fenceBuf.join("\n"), { mono: true, size: 18 })],
    }));
    fenceBuf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // frontmatter：跳过（元数据不是内容）
    if (i === 0 && line.trim() === "---") {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== "---") j++;
      if (j < lines.length) { i = j; continue; }
    }

    // 代码块
    const fm = line.match(/^\s*(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)\s*$/);
    if (fm) {
      if (!inFence) { flushTable(); inFence = true; fenceTicks = fm[1]; fenceBuf = []; }
      else if (line.trim().startsWith(fenceTicks)) { flushFence(); inFence = false; }
      continue;
    }
    if (inFence) { fenceBuf.push(line); continue; }

    // 表格
    if (/^\s*\|.*\|\s*$/.test(line)) { tableBuf.push(line); continue; }
    if (tableBuf.length) flushTable();

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();
      if (level === 1 && !titleUsed) {
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 240 },
          children: [run(opts.title || text, {
            bold: true, size: 40, cn: FONT_HEAD_CN, en: FONT_HEAD_CN,
          })],
        }));
        titleUsed = true;
      } else {
        const sizes = { 1: 34, 2: 30, 3: 26, 4: 24, 5: 22, 6: 21 };
        children.push(new Paragraph({
          spacing: { before: 260, after: 120 },
          children: inlineRuns(text).map((r) => {
            r.bold = true;
            r.size = sizes[level] ?? 21;
            return r;
          }),
        }));
      }
      continue;
    }

    // 水平线
    if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(line)) {
      children.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" } },
        spacing: { before: 120, after: 120 },
        children: [run("")],
      }));
      continue;
    }

    // 引用
    const q = line.match(/^>\s?(.*)$/);
    if (q) {
      children.push(new Paragraph({
        indent: { left: 360 },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: "BBBBBB" } },
        spacing: { before: 60, after: 60 },
        children: inlineRuns(q[1]).map((r) => { r.color = "555555"; return r; }),
      }));
      continue;
    }

    // 任务列表
    const task = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (task) {
      const indent = 240 + Math.floor(task[1].length / 2) * 240;
      const box = task[2].toLowerCase() === "x" ? "☑ " : "☐ ";
      children.push(new Paragraph({
        indent: { left: indent },
        spacing: { before: 30, after: 30 },
        children: [run(box), ...inlineRuns(task[3])],
      }));
      continue;
    }

    // 无序列表
    const ul = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (ul) {
      const indent = 240 + Math.floor(ul[1].length / 2) * 240;
      children.push(new Paragraph({
        indent: { left: indent, hanging: 120 },
        spacing: { before: 30, after: 30 },
        children: [run("• "), ...inlineRuns(ul[2])],
      }));
      continue;
    }

    // 有序列表
    const ol = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
    if (ol) {
      const indent = 240 + Math.floor(ol[1].length / 2) * 240;
      children.push(new Paragraph({
        indent: { left: indent, hanging: 160 },
        spacing: { before: 30, after: 30 },
        children: [run(ol[2] + ". "), ...inlineRuns(ol[3])],
      }));
      continue;
    }

    // 空行
    if (!line.trim()) continue;

    // 普通段落
    children.push(new Paragraph({
      spacing: { before: 0, after: 140, line: 300 },
      children: inlineRuns(line),
    }));
  }

  flushTable();
  if (inFence && fenceBuf.length) flushFence();

  if (children.length === 0) {
    children.push(new Paragraph({ children: [run("（文档内容为空）")] }));
  }

  return new Document({
    creator: opts.author || "",       // 默认空 —— 产出物不带署名
    lastModifiedBy: opts.author || "",
    title: opts.title || "",
    description: "",
    styles: {
      default: {
        document: {
          run: { font: { ascii: FONT_BODY_EN, hAnsi: FONT_BODY_EN, eastAsia: FONT_BODY_CN, cs: FONT_BODY_EN }, size: 21 },
        },
      },
    },
    sections: [{
      properties: {
        page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } },  // 2cm
      },
      children,
    }],
  });
}

/** 生成 docx 文件 */
async function exportDocxNative({ markdown, outputPath, title, author }) {
  try {
    const doc = markdownToDocx(markdown, { title, author });
    const buf = await Packer.toBuffer(doc);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, buf);
    return { ok: true, path: outputPath, size: buf.length, engine: "docx(npm,纯JS)" };
  } catch (e) {
    return { ok: false, error: `生成 Word 失败：${e.message}` };
  }
}

module.exports = { exportDocxNative, markdownToDocx };
