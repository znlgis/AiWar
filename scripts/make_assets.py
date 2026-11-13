#!/usr/bin/env python3
"""生成 Toy 发布物料：封面 4:3 与图标（极简地图风，全原创）。"""
from PIL import Image, ImageDraw, ImageFont

PAPER = (245, 244, 239)
INK = (29, 31, 33)
INK2 = (74, 79, 85)
LINE = (196, 193, 182)
SEAL = (168, 58, 44)
QI = (47, 111, 143)
WEI = (138, 59, 59)
ZHAO = (122, 106, 58)
WEI_STATE = (138, 106, 74)

SERIF = "C:/Windows/Fonts/simsun.ttc"
SANS = "C:/Windows/Fonts/msyh.ttc"

def font(path, size):
    return ImageFont.truetype(path, size)

POSTER_CITIES = {
    "邯郸": (252, 118, ZHAO),
    "大梁": (390, 320, WEI),
    "临淄": (700, 130, QI),
    "桂陵": (420, 238, WEI),
    "平陵": (520, 238, WEI),
    "濮阳": (448, 176, WEI_STATE),
    "襄陵": (470, 330, WEI),
}
POSTER_ROADS = [
    ("临淄", "邯郸"), ("临淄", "大梁"), ("邯郸", "大梁"),
    ("邯郸", "濮阳"), ("濮阳", "大梁"), ("大梁", "平陵"), ("大梁", "襄陵"),
]

def draw_poster_map(img):
    d = ImageDraw.Draw(img)
    origin_x, origin_y = 700, 320
    scale = 0.66
    for a, b in POSTER_ROADS:
        ax, ay, _ = POSTER_CITIES[a]
        bx, by, _ = POSTER_CITIES[b]
        d.line((origin_x + ax * scale, origin_y + ay * scale, origin_x + bx * scale, origin_y + by * scale), fill=(208, 205, 195), width=2)
    for name, (x, y, color) in POSTER_CITIES.items():
        cx, cy = origin_x + x * scale, origin_y + y * scale
        d.ellipse((cx - 8, cy - 8, cx + 8, cy + 8), fill=color, outline=(255, 253, 248), width=3)
        d.text((cx, cy + 12), name, font=font(SANS, 19), fill=INK2, anchor="ma")

def make_poster():
    w, h = 1200, 900
    img = Image.new("RGB", (w, h), PAPER)
    d = ImageDraw.Draw(img)
    # 左侧竖线 + 标题
    d.rectangle((88, 92, 94, 640), fill=LINE)
    d.text((126, 84), "围魏救赵", font=font(SERIF, 128), fill=INK)
    d.text((130, 246), "桂陵之战 · 前 354—前 353 年", font=font(SANS, 28), fill=INK2)
    d.rectangle((130, 330, 136, 452), fill=SEAL)
    small = font(SANS, 27)
    d.text((158, 332), "只凭前线战报与势力范围", font=small, fill=INK2)
    d.text((158, 376), "在关键节点做出决策", font=small, fill=INK2)
    d.text((158, 420), "推演走向不必与史书相同", font=small, fill=INK2)
    draw_poster_map(img)
    d.line((88, 800, 1112, 800), fill=LINE, width=2)
    d.text((88, 820), "AI 战争模拟器 · 第一战", font=font(SANS, 22), fill=INK2)
    d.text((1112, 820), "单局约 20–30 分钟", font=font(SANS, 22), fill=INK2, anchor="ra")
    d.rectangle((1032, 100, 1112, 180), outline=SEAL, width=3)
    d.text((1072, 140), "齐", font=font(SERIF, 46), fill=SEAL, anchor="mm")
    img.save("release/poster.png", "PNG")

def make_icon():
    size = 512
    img = Image.new("RGB", (size, size), PAPER)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((64, 64, 448, 448), radius=28, outline=LINE, width=3)
    d.line((160, 352, 256, 168), fill=(212, 209, 199), width=7)
    d.line((256, 168, 360, 340), fill=(212, 209, 199), width=7)
    for (x, y, color) in [(160, 352, QI), (256, 168, ZHAO), (360, 340, WEI)]:
        d.ellipse((x - 26, y - 26, x + 26, y + 26), fill=color, outline=(255, 253, 248), width=5)
    d.rectangle((348, 132, 424, 208), outline=SEAL, width=4)
    d.text((386, 170), "齐", font=font(SERIF, 40), fill=SEAL, anchor="mm")
    img.save("release/icon.png", "PNG")

make_poster()
make_icon()
print("assets regenerated")