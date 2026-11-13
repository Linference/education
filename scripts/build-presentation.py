#!/usr/bin/env python3
"""Build PRESENTATION.pptx (16:9, bilingual) from PRESENTATION.md.

The Markdown deck is the source of truth: `##` starts a slide, `###` is the
Chinese subtitle, `- ` lines are bullets, `  - ` lines are Chinese sub-bullets,
and `::: notes ... :::` blocks become speaker notes.

Usage: python3 scripts/build-presentation.py [PRESENTATION.md] [out.pptx]
"""

import re
import sys
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.util import Emu, Inches, Pt

NAVY = RGBColor(0x0F, 0x17, 0x2A)
INK = RGBColor(0x1E, 0x29, 0x3B)
MUTED = RGBColor(0x64, 0x74, 0x8B)
ACCENT = RGBColor(0x25, 0x63, 0xEB)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
LIGHT = RGBColor(0xCB, 0xD5, 0xE1)

WIDTH = Inches(13.333)
HEIGHT = Inches(7.5)


def parse(md_path: Path):
    text = md_path.read_text(encoding="utf-8")
    # Drop the leading YAML front matter.
    text = re.sub(r"^---\n.*?\n---\n", "", text, count=1, flags=re.S)
    blocks = re.split(r"\n---\n", text)
    slides = []
    for block in blocks:
        lines = [ln.rstrip() for ln in block.strip().splitlines()]
        if not lines:
            continue
        title, subtitle, body, notes = "", "", [], []
        in_notes = False
        for ln in lines:
            if ln.strip() == "::: notes":
                in_notes = True
                continue
            if ln.strip() == ":::":
                in_notes = False
                continue
            if in_notes:
                notes.append(ln)
                continue
            if ln.startswith("## "):
                title = ln[3:].strip()
            elif ln.startswith("### "):
                subtitle = ln[4:].strip()
            elif ln.strip():
                body.append(ln)
        slides.append({"title": title, "subtitle": subtitle,
                       "body": body, "notes": "\n".join(notes).strip()})
    return slides


def add_runs(paragraph, text, size, color, bold_default=False):
    """Split **bold** and `code` markers into runs."""
    text = text.replace("`", "")
    for part in re.split(r"(\*\*.+?\*\*)", text):
        if not part:
            continue
        bold = bold_default
        if part.startswith("**") and part.endswith("**"):
            part = part[2:-2]
            bold = True
        run = paragraph.add_run()
        run.text = part
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.color.rgb = color
        run.font.name = "Arial"


def textbox(slide, left, top, width, height):
    box = slide.shapes.add_textbox(left, top, width, height)
    frame = box.text_frame
    frame.word_wrap = True
    frame.margin_left = 0
    frame.margin_right = 0
    frame.margin_top = 0
    frame.margin_bottom = 0
    return frame


def title_slide(prs, data):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    bg = slide.shapes.add_shape(1, 0, 0, WIDTH, HEIGHT)  # rectangle
    bg.fill.solid()
    bg.fill.fore_color.rgb = NAVY
    bg.line.fill.background()

    bar = slide.shapes.add_shape(1, Inches(0.9), Inches(2.55), Inches(1.2), Emu(45720))
    bar.fill.solid()
    bar.fill.fore_color.rgb = ACCENT
    bar.line.fill.background()

    frame = textbox(slide, Inches(0.9), Inches(2.85), Inches(11.5), Inches(1.7))
    p = frame.paragraphs[0]
    add_runs(p, data["title"], 44, WHITE, bold_default=True)

    if data["subtitle"]:
        frame2 = textbox(slide, Inches(0.9), Inches(4.45), Inches(11.5), Inches(0.8))
        add_runs(frame2.paragraphs[0], data["subtitle"], 24, LIGHT)

    extra = [ln for ln in data["body"] if ln.strip()]
    if extra:
        frame3 = textbox(slide, Inches(0.9), Inches(5.45), Inches(11.5), Inches(1.0))
        for i, ln in enumerate(extra):
            p = frame3.paragraphs[0] if i == 0 else frame3.add_paragraph()
            p.space_after = Pt(4)
            add_runs(p, ln.strip(), 16, MUTED)

    # Dark slides get a light page number too.
    num = textbox(slide, Inches(12.3), Inches(7.0), Inches(0.7), Inches(0.3))
    add_runs(num.paragraphs[0], "1", 11, MUTED)
    return slide


def content_slide(prs, data, number):
    slide = prs.slides.add_slide(prs.slide_layouts[6])

    accent = slide.shapes.add_shape(1, 0, 0, Inches(0.18), HEIGHT)
    accent.fill.solid()
    accent.fill.fore_color.rgb = ACCENT
    accent.line.fill.background()

    frame = textbox(slide, Inches(0.75), Inches(0.45), Inches(11.9), Inches(0.9))
    add_runs(frame.paragraphs[0], data["title"], 30, INK, bold_default=True)

    if data["subtitle"]:
        sub = textbox(slide, Inches(0.77), Inches(1.28), Inches(11.9), Inches(0.5))
        add_runs(sub.paragraphs[0], data["subtitle"], 17, MUTED)

    body_top = Inches(2.0) if data["subtitle"] else Inches(1.6)
    body = textbox(slide, Inches(0.9), body_top, Inches(11.4), Inches(5.0))

    first = True
    for ln in data["body"]:
        if ln.startswith("  - "):            # Chinese sub-bullet
            p = body.paragraphs[0] if first else body.add_paragraph()
            first = False
            p.space_after = Pt(12)
            add_runs(p, "    " + ln[4:].strip(), 14, MUTED)
        elif ln.startswith("- "):            # English bullet
            p = body.paragraphs[0] if first else body.add_paragraph()
            first = False
            p.space_after = Pt(3)
            add_runs(p, "•  " + ln[2:].strip(), 19, INK)
        else:                                # plain paragraph
            p = body.paragraphs[0] if first else body.add_paragraph()
            first = False
            p.space_after = Pt(10)
            add_runs(p, ln.strip(), 18, INK)

    num = textbox(slide, Inches(12.3), Inches(7.0), Inches(0.7), Inches(0.3))
    add_runs(num.paragraphs[0], str(number), 11, MUTED)
    return slide


def main():
    md = Path(sys.argv[1] if len(sys.argv) > 1 else "PRESENTATION.md")
    out = Path(sys.argv[2] if len(sys.argv) > 2 else "PRESENTATION.pptx")
    slides = parse(md)
    prs = Presentation()
    prs.slide_width = WIDTH
    prs.slide_height = HEIGHT
    # python-pptx keeps the old "screen4x3" type hint; make 16:9 explicit.
    prs.part._element.sldSz.set("type", "screen16x9")
    for i, data in enumerate(slides):
        slide = title_slide(prs, data) if i == 0 else content_slide(prs, data, i + 1)
        if data["notes"]:
            slide.notes_slide.notes_text_frame.text = data["notes"]
    prs.save(out)
    print(f"wrote {out} ({len(slides)} slides)")


if __name__ == "__main__":
    main()
