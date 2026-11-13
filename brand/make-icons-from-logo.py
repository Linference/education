# -*- coding: utf-8 -*-
"""Generate the full application icon asset set from a user-provided GZ monogram

Input: brand/source-monogram-original.jpg (1024×1024, with an AI-generation
watermark in the bottom-right corner)
Output: PNGs at various sizes under brand/assets/ + app.ico + favicon.ico + NSIS bitmap

Processing steps and rationale:
  1. Crop to the mark's bounding box (measured x216..812 / y218..802) — this
     also removes the watermark in the bottom-right corner
  2. Remove the background: turn the warm-white background transparent and
     **feather** the edges (preserving anti-aliasing); otherwise the outline
     carries a white fringe that looks bad on a dark taskbar
  3. Place into a square safe area: the subject occupies ~78% (an icon
     convention; leaves room for Windows 11's rounded-corner crop)
  4. Rescale separately for each size (a separate LANCZOS pass per size),
     rather than scaling once and copying
"""
from __future__ import annotations
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "assets")
os.makedirs(OUT, exist_ok=True)

SRC = os.path.join(HERE, "source-monogram.png")
BG = (247, 243, 236)          # original image background (measured)
SS = 4                        # supersampling factor


def extract_mark() -> Image.Image:
    """Crop + remove background, returning the mark on transparency (tight bounding box).

    The crop box comes from the measured bounding box x216..808 / y222..800
    (newer image, no watermark).
    """
    im = Image.open(SRC).convert("RGB")
    # 1) Crop to the bounding box (leave about 1% padding so stroke edges are not cut)
    box = (206, 212, 818, 810)
    im = im.crop(box)
    w, h = im.size

    # 2) Remove background: use "distance from the background color" as opacity
    #    Pure background → fully transparent; farther away → more opaque. This
    #    naturally preserves anti-aliased edges.
    out = Image.new("RGBA", (w, h))
    src_px = im.load()
    out_px = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = src_px[x, y]
            dist = abs(r - BG[0]) + abs(g - BG[1]) + abs(b - BG[2])
            if dist <= 8:
                out_px[x, y] = (0, 0, 0, 0)
            else:
                # Linear feather between thresholds 8..60; fully opaque at 60 and above
                a = 255 if dist >= 60 else int((dist - 8) / 52 * 255)
                # Keep the original color (black stays black, red stays red); only opacity changes
                out_px[x, y] = (r, g, b, a)
    return out


def place_in_canvas(mark: Image.Image, size: int, *, body: float = 0.78,
                    rounded_bg: bool = True, bg_color=None) -> Image.Image:
    """Place the mark into a size×size canvas with the subject occupying body."""
    S = size * SS
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    if rounded_bg:
        r = int(S * 0.22)
        ImageDraw.Draw(canvas).rounded_rectangle(
            [0, 0, S - 1, S - 1], radius=r,
            fill=bg_color if bg_color else (247, 243, 236, 255)
        )
    elif bg_color:
        canvas = Image.new("RGBA", (S, S), bg_color)

    target = int(S * body)
    mw, mh = mark.size
    scale = min(target / mw, target / mh)
    nm = mark.resize((max(1, int(mw * scale)), max(1, int(mh * scale))), Image.LANCZOS)
    canvas.alpha_composite(nm, ((S - nm.width) // 2, (S - nm.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


def main():
    print("=== Generating icon assets from the GZ mark ===")
    mark = extract_mark()
    print(f"  Extracted mark: {mark.size}")

    # Master: transparent background, subject at 78%, no rounded background (for design use)
    master = place_in_canvas(mark, 1024, rounded_bg=False)
    master.save(os.path.join(OUT, "logo-mark-1024.png"))
    print("  logo-mark-1024.png (transparent master icon)")

    # App icon master: with rounded background
    app1024 = place_in_canvas(mark, 1024)
    app1024.save(os.path.join(OUT, "icon-1024.png"))
    print("  icon-1024.png (Windows 11 rounded background)")

    # PNGs at each size
    sizes = (512, 256, 128, 64, 48, 32, 24, 16)
    for s in sizes:
        place_in_canvas(mark, s).save(os.path.join(OUT, f"icon-{s}.png"))
    print(f"  icon-{('/'.join(map(str, sizes)))}.png")

    # Monochrome version (pure black, transparent background) — verifies "it works without color"
    mono = place_in_canvas(mark, 1024, rounded_bg=False)
    mp = mono.load()
    for y in range(mono.height):
        for x in range(mono.width):
            r, g, b, a = mp[x, y]
            if a == 0:
                continue
            # Flatten vermilion to black too (a true monochrome version)
            mp[x, y] = (16, 16, 16, a)
    mono.save(os.path.join(OUT, "logo-mark-mono-1024.png"))
    print("  logo-mark-mono-1024.png (monochrome version)")

    # Reversed version (dark background: the whole mark turns white, vermilion kept as accent)
    rev = place_in_canvas(mark, 1024, rounded_bg=True, bg_color=(20, 20, 20, 255))
    rp = rev.load()
    for y in range(rev.height):
        for x in range(rev.width):
            r, g, b, a = rp[x, y]
            if a == 0:
                continue
            # Determine whether it is in the red family (R clearly greater than G/B)
            if r > g + 40 and r > b + 40:
                continue                      # keep vermilion
            if abs(r - 20) < 12 and abs(g - 20) < 12 and abs(b - 20) < 12:
                continue                      # keep the background color
            rp[x, y] = (255, 255, 255, a)     # turn ink to white
    rev.save(os.path.join(OUT, "logo-mark-reversed-1024.png"))
    print("  logo-mark-reversed-1024.png (reversed version)")

    # Multi-size ICO: render each size separately
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    frames = [place_in_canvas(mark, s) for s in ico_sizes]
    frames[-1].save(os.path.join(OUT, "app.ico"), format="ICO",
                    sizes=[(s, s) for s in ico_sizes], append_images=frames[:-1])
    print(f"  app.ico ({ico_sizes})")

    place_in_canvas(mark, 32).save(os.path.join(OUT, "favicon.ico"),
                                   format="ICO", sizes=[(16, 16), (32, 32)])
    print("  favicon.ico (16/32)")

    # NSIS installer header (150×57)
    header = Image.new("RGB", (150, 57), (247, 243, 236))
    hm = place_in_canvas(mark, 48, rounded_bg=False)
    header.paste(hm, (6, (57 - 48) // 2), hm)
    ImageDraw.Draw(header).text((60, 23), "GEZHI", fill=(20, 20, 20))
    header.save(os.path.join(OUT, "nsis-header.bmp"))
    print("  nsis-header.bmp (150×57)")

    # ---- Self-check ----
    print("\n=== Self-check: is the mark still visible at each size ===")
    for s in (16, 24, 32, 64, 256):
        im = place_in_canvas(mark, s).convert("RGBA")
        dark = red = 0
        for p in im.getdata():
            if p[3] < 40:
                continue
            r, g, b = p[:3]
            if r > g + 40 and r > b + 40:
                red += 1
            elif r < 120 and g < 120 and b < 120:
                dark += 1
        total = s * s
        print(f"  {s:>3}px: dark {dark/total*100:5.1f}%  vermilion {red/total*100:5.1f}%")

    # Comparison image: nearest-neighbor upscale to see the pixels as they really are
    prev = Image.new("RGBA", (4 * 200 + 50, 240), (210, 210, 210, 255))
    x = 10
    for s in (256, 48, 32, 16):
        im = place_in_canvas(mark, s).resize((200, 200), Image.NEAREST)
        prev.alpha_composite(im, (x, 20))
        x += 210
    prev.save(os.path.join(OUT, "_preview-compare.png"))
    print(f"\nComparison image: {os.path.join(OUT, '_preview-compare.png')}")
    print(f"Asset directory: {OUT}")


if __name__ == "__main__":
    main()
