#!/usr/bin/env python3
"""生成 Toy 发布物料：封面 4:3 与图标（极简地图风，全原创）。

用法：python scripts/make_assets.py（任意工作目录均可）
依赖：Pillow（见 scripts/requirements.txt）
"""
from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "release"

PAPER = (245, 244, 239)
INK = (29, 31, 33)
INK2 = (74, 79, 85)
LINE = (196, 193, 182)
SEAL = (168, 58, 44)
QI = (47, 111, 143)
WEI = (138, 59, 59)
ZHAO = (122, 106, 58)
WEI_STATE = (138, 106, 74)

# 字体不再写死某一台机器的绝对路径：按优先级找系统中文字体，
# 找不到就用 Pillow 内置位图字体兜底（观感打折，但脚本不会直接崩）。
FONT_CANDIDATES = {
    "serif": [
        "C:/Windows/Fonts/simsun.ttc", "C:/Windows/Fonts/songti.ttc",
        "/System/Library/Fonts/Songti.ttc", "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc",
        "/usr/share/fonts/truetype/arphic/uming.ttc",
    ],
    "sans": [
        "C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/msyhbd.ttc",
        "/System/Library/Fonts/PingFang.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    ],
}


def _resolve(kind: str) -> str | None:
    for path in FONT_CANDIDATES[kind]:
        if Path(path).is_file():
            return path
    return None


SERIF_PATH = _resolve("serif")
SANS_PATH = _resolve("sans")


def font(kind: str, size: int):
    path = SERIF_PATH if kind == "serif" else SANS_PATH
    if path:
        return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def serif(size: int):
    return font("serif", size)


def sans(size: int):
    return font("sans", size)


# 五战共用的示意地图片段：每个战役一个点群，代表「同一套规则，五个战场」。
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

# 五场战役：与 packs.ts 的 PACKS 顺序一致，封面要能代表整个作品
CAMPAIGNS = [
    ("围魏救赵", "战国 · 前 354"),
    ("赤壁之战", "三国 · 208"),
    ("淝水之战", "东晋 · 383"),
    ("四渡赤水", "1935"),
    ("淮海战役", "1948"),
]


def draw_poster_map(img):
    d = ImageDraw.Draw(img)
    origin_x, origin_y = 700, 300
    scale = 0.62
    for a, b in POSTER_ROADS:
        ax, ay, _ = POSTER_CITIES[a]
        bx, by, _ = POSTER_CITIES[b]
        d.line((origin_x + ax * scale, origin_y + ay * scale,
                origin_x + bx * scale, origin_y + by * scale), fill=(208, 205, 195), width=2)
    for name, (x, y, color) in POSTER_CITIES.items():
        cx, cy = origin_x + x * scale, origin_y + y * scale
        d.ellipse((cx - 8, cy - 8, cx + 8, cy + 8), fill=color, outline=(255, 253, 248), width=3)
        d.text((cx, cy + 12), name, font=sans(18), fill=INK2, anchor="ma")


def make_poster():
    w, h = 1200, 900
    img = Image.new("RGB", (w, h), PAPER)
    d = ImageDraw.Draw(img)
    # 左侧竖线 + 标题
    d.rectangle((88, 92, 94, 640), fill=LINE)
    d.text((126, 84), "五战", font=serif(136), fill=INK)
    d.text((130, 252), "历史战争推演 · 关键节点决策", font=sans(30), fill=INK2)
    d.rectangle((130, 322, 136, 444), fill=SEAL)
    small = sans(26)
    d.text((158, 324), "只凭前线战报与势力范围", font=small, fill=INK2)
    d.text((158, 366), "在关键节点做出决策", font=small, fill=INK2)
    d.text((158, 408), "推演走向不必与史书相同", font=small, fill=INK2)

    # 五场战役清单：封面要说明这是「五战」，不再只写第一战
    y = 490
    for title, when in CAMPAIGNS:
        d.text((130, y), title, font=sans(27), fill=INK)
        d.text((372, y + 3), when, font=sans(20), fill=(140, 145, 150))
        y += 52

    draw_poster_map(img)
    d.line((88, 800, 1112, 800), fill=LINE, width=2)
    d.text((88, 820), "AI 战争模拟器", font=sans(22), fill=INK2)
    # 时长与 README / 设计文档 / 标题页保持一致（历史上这里写的是 20–30 分钟）
    d.text((1112, 820), "单局约 5–8 分钟", font=sans(22), fill=INK2, anchor="ra")
    d.rectangle((1032, 100, 1112, 180), outline=SEAL, width=3)
    d.text((1072, 140), "战", font=serif(46), fill=SEAL, anchor="mm")
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / "poster.png", "PNG")


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
    d.text((386, 170), "战", font=serif(40), fill=SEAL, anchor="mm")
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / "icon.png", "PNG")


if __name__ == "__main__":
    if SERIF_PATH is None and SANS_PATH is None:
        print("警告：没有找到系统中文字体，将用内置位图字体（中文可能显示为方块）", file=sys.stderr)
    make_poster()
    make_icon()
    print("assets regenerated ->", OUT)
