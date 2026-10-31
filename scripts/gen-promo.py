#!/usr/bin/env python3
# 生成 Chrome / Edge 商店宣传图（promo），纯设计素材，不需加载扩展。
# 输出：store-assets/promo/{440x280,920x680,1400x560}.png
# 依赖：Pillow + 系统中文字体（Noto Sans/Serif CJK）。
#
# 用法：
#   python3 scripts/gen-promo.py
#   python3 scripts/gen-promo.py --size 920x680      # 只生成某一张
#   python3 scripts/gen-promo.py --out /tmp/promo    # 指定输出目录

import argparse
import os
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "store-assets", "promo")

FONT_REG = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc"

# 配色（深色阅读主题 + 暖纸色点缀）
BG_TOP = (15, 23, 42)       # slate-900
BG_BOT = (30, 41, 59)       # slate-800
GLOW = (217, 119, 6)        # amber-600 暖光晕
ACCENT = (245, 158, 11)     # amber-500
PAPER = (245, 239, 225)     # 暖纸色
PAPER_LINE = (201, 191, 166)
PAPER_LINE2 = (214, 206, 186)
WHITE = (248, 250, 252)
MUTED = (148, 163, 184)     # slate-400
MUTED2 = (100, 116, 139)    # slate-500
CHIP_BG = (51, 65, 85)      # slate-700
CHIP_BORDER = (71, 85, 105)


def font(size, bold=False, idx=0):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size, index=idx)


def vgradient(w, h, c1, c2):
    base = Image.new("RGB", (w, h), c1)
    for y in range(h):
        t = y / max(1, h - 1)
        r = int(c1[0] + (c2[0] - c1[0]) * t)
        g = int(c1[1] + (c2[1] - c1[1]) * t)
        b = int(c1[2] + (c2[2] - c1[2]) * t)
        ImageDraw.Draw(base).line([(0, y), (w, y)], (r, g, b))
    return base


def add_glow(img, cx, cy, radius, color, alpha=70):
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=color + (255,))
    glow = glow.filter(ImageFilter.GaussianBlur(radius * 0.6))
    glow.putalpha(alpha)
    img.alpha_composite(glow)


def draw_book(draw, x, y, w, h, dpr):
    r = int(10 * dpr)
    gap = w * 0.045
    pw = (w - gap) / 2
    # 落地阴影
    shadow = Image.new("RGBA", (draw._image.width, draw._image.height), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle([x, y + int(8 * dpr), x + w, y + h + int(8 * dpr)], radius=r, fill=(0, 0, 0, 90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(int(10 * dpr)))
    base = draw._image
    base.alpha_composite(shadow)
    # 左右两页
    draw.rounded_rectangle([x, y, x + pw, y + h], radius=r, fill=PAPER)
    draw.rounded_rectangle([x + pw + gap, y, x + w, y + h], radius=r, fill=PAPER)
    # 书脊阴影
    draw.rectangle([x + pw, y, x + pw + gap, y + h], fill=(222, 214, 196))
    # 文字行
    pad = pw * 0.12
    ly = y + h * 0.16
    lh = h * 0.052
    step = lh * 1.5
    while ly < y + h * 0.92:
        # 左页
        lw = pw - 2 * pad
        if ly > y + h * 0.5:
            lw *= 0.7  # 模拟段落末行
        draw.rounded_rectangle([x + pad, ly, x + pad + lw, ly + lh], radius=int(2 * dpr), fill=PAPER_LINE)
        # 右页
        lw2 = pw - 2 * pad
        if ly > y + h * 0.62:
            lw2 *= 0.55
        rx = x + pw + gap + pad
        draw.rounded_rectangle([rx, ly, rx + lw2, ly + lh], radius=int(2 * dpr), fill=PAPER_LINE2)
        ly += step


def text(draw, xy, s, f, fill, anchor=None, shadow=True):
    x, y = xy
    if shadow:
        draw.text((x + 2, y + 2), s, font=f, fill=(0, 0, 0, 120), anchor=anchor)
    draw.text((x, y), s, font=f, fill=fill, anchor=anchor)


def fit_font(draw, s, max_w, size, bold=True, min_size=8):
    """按可用宽度自动缩小字号，避免标题溢出被裁。"""
    while size > min_size:
        f = font(size, bold=bold)
        bb = draw.textbbox((0, 0), s, font=f)
        if bb[2] - bb[0] <= max_w:
            return f
        size -= 1
    return font(min_size, bold=bold)


def make(size, dpr=2):
    W, H = size
    w, h = W * dpr, H * dpr
    img = vgradient(w, h, BG_TOP, BG_BOT).convert("RGBA")
    draw = ImageDraw.Draw(img)
    add_glow(img, int(w * 0.78), int(h * 0.30), int(min(w, h) * 0.5), GLOW, alpha=60)

    if (W, H) == (440, 280):
        # 小图：左书 + 右文字，极简
        bw, bh = int(h * 0.56), int(h * 0.72)
        bx, by = int(w * 0.07), int((h - bh) / 2)
        draw_book(draw, bx, by, bw, bh, dpr)
        tx = bx + bw + int(w * 0.06)
        avail = w - tx - int(w * 0.05)
        text(draw, (tx, int(h * 0.30)), "Xyfy TXT Reader",
             fit_font(draw, "Xyfy TXT Reader", avail, dpr * 24, bold=True), WHITE)
        text(draw, (tx, int(h * 0.48)), "本地 TXT 小说阅读器",
             fit_font(draw, "本地 TXT 小说阅读器", avail, dpr * 14, bold=False), MUTED)
        text(draw, (tx, int(h * 0.62)), "双页 · 滚动 · 沉浸阅读",
             fit_font(draw, "双页 · 滚动 · 沉浸阅读", avail, dpr * 13, bold=False), ACCENT)
    elif (W, H) == (920, 680):
        # 大图：书本在左，文字在右
        bw, bh = int(h * 0.66), int(h * 0.74)
        bx, by = int(w * 0.07), int((h - bh) / 2)
        draw_book(draw, bx, by, bw, bh, dpr)
        tx = bx + bw + int(w * 0.07)
        tw = w - tx - int(w * 0.06)
        text(draw, (tx, int(h * 0.14)), "Xyfy TXT Reader",
             fit_font(draw, "Xyfy TXT Reader", tw, dpr * 40, bold=True), WHITE)
        text(draw, (tx, int(h * 0.235)), "本地 TXT 小说阅读器",
             fit_font(draw, "本地 TXT 小说阅读器", tw, dpr * 22, bold=False), MUTED)
        text(draw, (tx, int(h * 0.31)), "在浏览器里，优雅地读完每一本 TXT。", font(dpr * 17), ACCENT)
        chips = ["双页 / 滚动阅读", "沉浸护眼主题", "本地备份与同步"]
        cy = int(h * 0.46)
        for i, c in enumerate(chips):
            chx = tx + i * int(tw * 0.34)
            cw = int(tw * 0.31)
            chh = int(h * 0.072)
            draw.rounded_rectangle([chx, cy, chx + cw, cy + chh], radius=int(8 * dpr), fill=CHIP_BG, outline=CHIP_BORDER, width=int(2 * dpr))
            f = font(dpr * 13)
            tb = draw.textbbox((0, 0), c, font=f)
            twc = tb[2] - tb[0]
            text(draw, (chx + (cw - twc) / 2, cy + (chh - (tb[3] - tb[1])) / 2), c, f, WHITE, shadow=False)
        text(draw, (tx, int(h * 0.80)), "无需上传 · 文件仅存本地 · 大文件流畅翻页", font(dpr * 15), MUTED2)
    else:  # 1400x560 宽幅
        bw, bh = int(h * 0.74), int(h * 0.80)
        bx, by = int(w * 0.06), int((h - bh) / 2)
        draw_book(draw, bx, by, bw, bh, dpr)
        tx = bx + bw + int(w * 0.05)
        avail = w - tx - int(w * 0.05)
        text(draw, (tx, int(h * 0.20)), "Xyfy TXT Reader",
             fit_font(draw, "Xyfy TXT Reader", avail, dpr * 42, bold=True), WHITE)
        text(draw, (tx, int(h * 0.31)), "本地 TXT 小说阅读器",
             fit_font(draw, "本地 TXT 小说阅读器", avail, dpr * 22, bold=False), MUTED)
        text(draw, (tx, int(h * 0.41)), "双页 · 滚动 · 沉浸，专注读完每一页。", font(dpr * 18), ACCENT)
        chips = ["双页 / 滚动", "沉浸主题", "本地备份同步"]
        cy = int(h * 0.58)
        for i, c in enumerate(chips):
            chx = tx + i * int(h * 0.30)
            cw = int(h * 0.27)
            chh = int(h * 0.085)
            draw.rounded_rectangle([chx, cy, chx + cw, cy + chh], radius=int(8 * dpr), fill=CHIP_BG, outline=CHIP_BORDER, width=int(2 * dpr))
            f = font(dpr * 14)
            tb = draw.textbbox((0, 0), c, font=f)
            twc = tb[2] - tb[0]
            text(draw, (chx + (cw - twc) / 2, cy + (chh - (tb[3] - tb[1])) / 2), c, f, WHITE, shadow=False)

    img = img.resize((W, H), Image.LANCZOS)
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", default="all")
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    sizes = [(440, 280), (920, 680), (1400, 560)]
    if args.size != "all":
        try:
            sizes = [tuple(int(x) for x in args.size.split("x"))]
        except Exception:
            print("size 格式应为 WxH，如 920x680", file=sys.stderr)
            sys.exit(1)
    for (W, H) in sizes:
        out = os.path.join(args.out, f"{W}x{H}.png")
        make((W, H)).save(out)
        print("✓", out)


if __name__ == "__main__":
    main()
