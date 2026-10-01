#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Markdown → Word (.docx)

为什么不用 JS 库：python-docx 是成熟方案，本机已随环境提供（1.2.0），
而 Node 侧没有一个能同时处理好中文样式与表格的 docx 生成库。

★ 产出物**不得出现任何产品署名**（产品硬规矩）：
  不写页脚、不加"由某某生成"、不加水印、不加品牌色。
  学生拿到的必须是"自己的文档"。

用法：
  python md2docx.py 输入.md 输出.docx [标题]
"""
from __future__ import annotations

import os
import re
import sys

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor

# 中文字体必须同时设 eastAsia，否则 Word 里中文会回退成默认字体
BODY_FONT_CN = "等线"
BODY_FONT_EN = "Calibri"
HEAD_FONT_CN = "微软雅黑"
MONO_FONT = "Consolas"


def set_run_font(run, cn=BODY_FONT_CN, en=BODY_FONT_EN, size=None, bold=None, mono=False):
    if mono:
        cn = en = MONO_FONT
    run.font.name = en
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = rpr.makeelement(qn("w:rFonts"), {})
        rpr.append(rfonts)
    rfonts.set(qn("w:ascii"), en)
    rfonts.set(qn("w:hAnsi"), en)
    rfonts.set(qn("w:eastAsia"), cn)   # ★ 这一行是中文字体生效的关键
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.font.bold = bold


# 行内语法：`code`、**粗**、*斜*、[text](url)、$公式$
INLINE_RE = re.compile(
    r"(`[^`]+`)"          # 行内代码
    r"|(\*\*[^*]+\*\*)"   # 粗体
    r"|(__[^_]+__)"       # 粗体（另一种写法）
    r"|(\*[^*]+\*)"       # 斜体
    r"|(\$[^$\n]+\$)"     # 行内公式（原样保留，Word 不渲染 LaTeX）
    r"|(\[[^\]]+\]\([^)]+\))"  # 链接
)


def add_inline(paragraph, text):
    """把一段带行内标记的文字写进段落，保留粗体/斜体/代码样式。"""
    pos = 0
    for m in INLINE_RE.finditer(text):
        if m.start() > pos:
            r = paragraph.add_run(text[pos:m.start()])
            set_run_font(r)
        tok = m.group(0)
        if tok.startswith("`"):
            r = paragraph.add_run(tok[1:-1])
            set_run_font(r, mono=True, size=10)
        elif tok.startswith("**") or tok.startswith("__"):
            r = paragraph.add_run(tok[2:-2])
            set_run_font(r, bold=True)
        elif tok.startswith("*"):
            r = paragraph.add_run(tok[1:-1])
            set_run_font(r)
            r.font.italic = True
        elif tok.startswith("$"):
            r = paragraph.add_run(tok)          # 公式原样保留，不假装能排版
            set_run_font(r, cn="Cambria Math", en="Cambria Math")
        elif tok.startswith("["):
            label = re.match(r"\[([^\]]+)\]", tok).group(1)
            url = re.match(r"\[[^\]]+\]\(([^)]+)\)", tok).group(1)
            r = paragraph.add_run(label)
            set_run_font(r)
            r.font.color.rgb = RGBColor(0x2F, 0x54, 0x96)
            r.font.underline = True
            _ = url  # 超链接关系需要额外 XML 操作，这里先只做样式
        pos = m.end()
    if pos < len(text):
        r = paragraph.add_run(text[pos:])
        set_run_font(r)


def convert(md_path: str, out_path: str, title: str | None = None) -> None:
    with open(md_path, "r", encoding="utf-8") as f:
        lines = f.read().replace("\r\n", "\n").split("\n")

    doc = Document()

    # 正文默认样式
    normal = doc.styles["Normal"]
    normal.font.name = BODY_FONT_EN
    normal.font.size = Pt(10.5)
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), BODY_FONT_CN)

    # frontmatter 跳过
    i = 0
    if lines and lines[0].strip() == "---":
        i = 1
        while i < len(lines) and lines[i].strip() != "---":
            i += 1
        i += 1

    title_done = False
    in_fence = False
    fence_buf: list[str] = []
    table_buf: list[str] = []

    def flush_table():
        nonlocal table_buf
        if not table_buf:
            return
        rows = [
            [c.strip() for c in r.strip().strip("|").split("|")]
            for r in table_buf
        ]
        rows = [r for r in rows if not all(re.fullmatch(r":?-{2,}:?", c or "") for c in r)]
        if not rows:
            table_buf = []
            return
        cols = max(len(r) for r in rows)
        t = doc.add_table(rows=0, cols=cols)
        t.style = "Table Grid"
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        for ri, row in enumerate(rows):
            cells = t.add_row().cells
            for ci in range(cols):
                txt = row[ci] if ci < len(row) else ""
                p = cells[ci].paragraphs[0]
                add_inline(p, txt)
                if ri == 0:
                    for r in p.runs:
                        r.font.bold = True
        doc.add_paragraph()
        table_buf = []

    def flush_fence():
        nonlocal fence_buf
        if not fence_buf:
            return
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Pt(18)
        p.paragraph_format.space_before = Pt(4)
        p.paragraph_format.space_after = Pt(4)
        r = p.add_run("\n".join(fence_buf))
        set_run_font(r, mono=True, size=9.5)
        fence_buf = []

    while i < len(lines):
        line = lines[i]

        # 代码块
        fm = re.match(r"^\s*(`{3,}|~{3,})", line)
        if fm:
            if not in_fence:
                flush_table()
                in_fence = True
                fence_buf = []
            else:
                flush_fence()
                in_fence = False
            i += 1
            continue
        if in_fence:
            fence_buf.append(line)
            i += 1
            continue

        # 表格
        if re.match(r"^\s*\|.*\|\s*$", line):
            table_buf.append(line)
            i += 1
            continue
        if table_buf:
            flush_table()

        # 标题
        hm = re.match(r"^(#{1,6})\s+(.*)$", line)
        if hm:
            level = len(hm.group(1))
            text = hm.group(2).strip()
            if level == 1 and not title_done:
                # 用文档标题而不是普通标题样式：Word 的导航窗格里更清楚
                h = doc.add_heading("", level=0)
                r = h.add_run(title or text)
                set_run_font(r, cn=HEAD_FONT_CN, en=HEAD_FONT_CN, size=20, bold=True)
                title_done = True
            else:
                h = doc.add_heading("", level=min(level, 4))
                r = h.add_run(text)
                sizes = {1: 18, 2: 15, 3: 13, 4: 12}
                set_run_font(r, cn=HEAD_FONT_CN, en=HEAD_FONT_CN, size=sizes.get(level, 11), bold=True)
            i += 1
            continue

        # 水平线
        if re.match(r"^\s*([-*_])\s*\1\s*\1[\s\1]*$", line):
            p = doc.add_paragraph()
            r = p.add_run("─" * 30)
            set_run_font(r, size=8)
            r.font.color.rgb = RGBColor(0xAA, 0xAA, 0xAA)
            i += 1
            continue

        # 引用
        qm = re.match(r"^>\s?(.*)$", line)
        if qm:
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Pt(20)
            add_inline(p, qm.group(1))
            for r in p.runs:
                r.font.color.rgb = RGBColor(0x55, 0x55, 0x55)
            i += 1
            continue

        # 任务列表
        tm = re.match(r"^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$", line)
        if tm:
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Pt(18 + len(tm.group(1)) * 9)
            box = "☑ " if tm.group(2).lower() == "x" else "☐ "
            r = p.add_run(box)
            set_run_font(r)
            add_inline(p, tm.group(3))
            i += 1
            continue

        # 无序列表
        um = re.match(r"^(\s*)[-*+]\s+(.*)$", line)
        if um:
            p = doc.add_paragraph(style="List Bullet")
            p.paragraph_format.left_indent = Pt(18 + len(um.group(1)) * 9)
            add_inline(p, um.group(2))
            i += 1
            continue

        # 有序列表
        om = re.match(r"^(\s*)\d+[.)]\s+(.*)$", line)
        if om:
            p = doc.add_paragraph(style="List Number")
            p.paragraph_format.left_indent = Pt(18 + len(om.group(1)) * 9)
            add_inline(p, om.group(2))
            i += 1
            continue

        # 空行
        if not line.strip():
            i += 1
            continue

        # 普通段落
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(6)
        add_inline(p, line)
        i += 1

    flush_table()
    flush_fence()

    os.makedirs(os.path.dirname(os.path.abspath(out_path)) or ".", exist_ok=True)
    doc.save(out_path)


def main() -> int:
    if len(sys.argv) < 3:
        print("用法：python md2docx.py 输入.md 输出.docx [标题]", file=sys.stderr)
        return 2
    src, dst = sys.argv[1], sys.argv[2]
    title = sys.argv[3] if len(sys.argv) > 3 else None
    try:
        convert(src, dst, title)
    except Exception as e:  # noqa: BLE001
        print(f"转换失败：{e}", file=sys.stderr)
        return 1
    print(f"OK {dst}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
