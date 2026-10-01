# -*- coding: utf-8 -*-
"""从用户提供的 GZ 字母标志生成全套应用图标资产

输入：brand/source-monogram-original.jpg（1024×1024，右下角带 AI 生成水印）
输出：brand/assets/ 下的 PNG 各尺寸 + app.ico + favicon.ico + NSIS 位图

处理步骤与理由：
  1. 裁剪到标志包围盒（实测 x216..812 / y218..802）—— 顺带切掉右下角水印
  2. 抠底：把暖白底转成透明，并对边缘做**羽化**（保留抗锯齿），
     否则描边会带一圈白边，深色任务栏上很难看
  3. 置入方形安全区：主体占 ~78%（图标惯例；留出 Win11 圆角切割区）
  4. 逐尺寸重新缩放（每档单独 LANCZOS），而不是缩一次再复制
"""
from __future__ import annotations
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "assets")
os.makedirs(OUT, exist_ok=True)

SRC = os.path.join(HERE, "source-monogram.png")
BG = (247, 243, 236)          # 原图底色（实测）
SS = 4                        # 超采样倍率


def extract_mark() -> Image.Image:
    """裁剪 + 抠底，返回透明底的标志（紧凑包围盒）。

    裁剪框来自实测包围盒 x216..808 / y222..800（新版图，无水印）。
    """
    im = Image.open(SRC).convert("RGB")
    # 1) 裁剪到包围盒（留约 1% 内边距，避免切到笔画边缘）
    box = (206, 212, 818, 810)
    im = im.crop(box)
    w, h = im.size

    # 2) 抠底：以"与底色的距离"作为不透明度
    #    纯底色 → 全透明；偏离越大 → 越不透明。这样抗锯齿边缘自然保留。
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
                # 阈值 8..60 之间做线性羽化，60 以上全不透明
                a = 255 if dist >= 60 else int((dist - 8) / 52 * 255)
                # 保持原色（黑就是黑，红就是红），只调不透明度
                out_px[x, y] = (r, g, b, a)
    return out


def place_in_canvas(mark: Image.Image, size: int, *, body: float = 0.78,
                    rounded_bg: bool = True, bg_color=None) -> Image.Image:
    """把标志放进 size×size 画布，主体占 body 比例。"""
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
    print("=== 从 GZ 标志生成图标资产 ===")
    mark = extract_mark()
    print(f"  抠出的标志：{mark.size}")

    # 母版：透明底、主体 78%、无圆角底（给设计用）
    master = place_in_canvas(mark, 1024, rounded_bg=False)
    master.save(os.path.join(OUT, "logo-mark-1024.png"))
    print("  logo-mark-1024.png（透明底主图标）")

    # App 图标母版：带圆角底
    app1024 = place_in_canvas(mark, 1024)
    app1024.save(os.path.join(OUT, "icon-1024.png"))
    print("  icon-1024.png（Win11 圆角底）")

    # 各档 PNG
    sizes = (512, 256, 128, 64, 48, 32, 24, 16)
    for s in sizes:
        place_in_canvas(mark, s).save(os.path.join(OUT, f"icon-{s}.png"))
    print(f"  icon-{('/'.join(map(str, sizes)))}.png")

    # 单色版（纯黑，透明底）—— 验证"不靠颜色也成立"
    mono = place_in_canvas(mark, 1024, rounded_bg=False)
    mp = mono.load()
    for y in range(mono.height):
        for x in range(mono.width):
            r, g, b, a = mp[x, y]
            if a == 0:
                continue
            # 朱红也压成黑（真单色版）
            mp[x, y] = (16, 16, 16, a)
    mono.save(os.path.join(OUT, "logo-mark-mono-1024.png"))
    print("  logo-mark-mono-1024.png（单色版）")

    # 反白版（深色背景：标志整体转白，保留朱红作强调）
    rev = place_in_canvas(mark, 1024, rounded_bg=True, bg_color=(20, 20, 20, 255))
    rp = rev.load()
    for y in range(rev.height):
        for x in range(rev.width):
            r, g, b, a = rp[x, y]
            if a == 0:
                continue
            # 判断是不是红色系（R 明显大于 G/B）
            if r > g + 40 and r > b + 40:
                continue                      # 朱红保留
            if abs(r - 20) < 12 and abs(g - 20) < 12 and abs(b - 20) < 12:
                continue                      # 底色保留
            rp[x, y] = (255, 255, 255, a)     # 墨色转白
    rev.save(os.path.join(OUT, "logo-mark-reversed-1024.png"))
    print("  logo-mark-reversed-1024.png（反白版）")

    # 多尺寸 ICO：每档单独出图
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    frames = [place_in_canvas(mark, s) for s in ico_sizes]
    frames[-1].save(os.path.join(OUT, "app.ico"), format="ICO",
                    sizes=[(s, s) for s in ico_sizes], append_images=frames[:-1])
    print(f"  app.ico（{ico_sizes}）")

    place_in_canvas(mark, 32).save(os.path.join(OUT, "favicon.ico"),
                                   format="ICO", sizes=[(16, 16), (32, 32)])
    print("  favicon.ico（16/32）")

    # NSIS 安装器 header（150×57）
    header = Image.new("RGB", (150, 57), (247, 243, 236))
    hm = place_in_canvas(mark, 48, rounded_bg=False)
    header.paste(hm, (6, (57 - 48) // 2), hm)
    ImageDraw.Draw(header).text((60, 23), "GEZHI", fill=(20, 20, 20))
    header.save(os.path.join(OUT, "nsis-header.bmp"))
    print("  nsis-header.bmp（150×57）")

    # ---- 自检 ----
    print("\n=== 自检：各尺寸下标志是否还看得见 ===")
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
        print(f"  {s:>3}px: 深色 {dark/total*100:5.1f}%  朱红 {red/total*100:5.1f}%")

    # 对比图：最近邻放大，看像素真相
    prev = Image.new("RGBA", (4 * 200 + 50, 240), (210, 210, 210, 255))
    x = 10
    for s in (256, 48, 32, 16):
        im = place_in_canvas(mark, s).resize((200, 200), Image.NEAREST)
        prev.alpha_composite(im, (x, 20))
        x += 210
    prev.save(os.path.join(OUT, "_preview-compare.png"))
    print(f"\n对比图：{os.path.join(OUT, '_preview-compare.png')}")
    print(f"资产目录：{OUT}")


if __name__ == "__main__":
    main()
