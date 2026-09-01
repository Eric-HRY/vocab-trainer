#!/usr/bin/env python3
"""生成「啸啸单词斩」PWA 图标。

奶油色圆角方底 + 居中深色「词」字。
输出到 public/icons/：
  - icon-192.png            192x192   圆角方底（透明圆角）
  - icon-512.png            512x512   圆角方底（透明圆角）
  - icon-maskable-512.png   512x512   满版底，内容留在 20% 安全边距内
  - apple-touch-icon-180.png 180x180  不透明满版底（iOS 自行裁圆角）

颜色与 src/index.css 的 --background / --foreground HSL 值换算保持一致：
  --background: 40 36% 96%  -> #F8F6F1（奶油米白）
  --foreground: 27 20% 19%  -> #3A2F27（深棕）
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BG = (248, 246, 241)      # #F8F6F1
FG = (58, 47, 39)         # #3A2F27
GLYPH = "词"

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "icons"

FONT_CANDIDATES = [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/Hiragino Sans.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            # ttc 合集：尽量取较粗的字重（最后一个 face 通常是 Bold/W6）
            last_error: Exception | None = None
            for index in (1, 0, 2, 3):
                try:
                    return ImageFont.truetype(path, size=size, index=index)
                except Exception as exc:  # 索引越界时回退
                    last_error = exc
            raise RuntimeError(f"无法加载字体 {path}: {last_error}")
    raise RuntimeError("未找到可用的中文字体: " + ", ".join(FONT_CANDIDATES))


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=radius, fill=255
    )
    return mask


def draw_glyph(canvas: Image.Image, glyph_scale: float) -> None:
    """在画布中心绘制「词」字，glyph_scale 为字号占边长比例。"""
    size = canvas.width
    font = load_font(round(size * glyph_scale))
    draw = ImageDraw.Draw(canvas)
    # anchor="mm" 以字形视觉中心对齐画布中心
    draw.text((size / 2, size / 2), GLYPH, font=font, fill=FG, anchor="mm")


def make_rounded_icon(size: int, out: Path) -> None:
    # 4x 超采样抗锯齿
    s = size * 4
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    bg = Image.new("RGBA", (s, s), BG + (255,))
    img.paste(bg, (0, 0), rounded_mask(s, round(s * 0.22)))
    draw_glyph(img, 0.52)
    img.resize((size, size), Image.LANCZOS).save(out)


def make_maskable_icon(size: int, out: Path) -> None:
    # maskable：满版不裁圆角，字形限制在中央 60%（即 20% 安全边距）内
    img = Image.new("RGBA", (size, size), BG + (255,))
    draw_glyph(img, 0.36)
    img.save(out)


def make_apple_touch_icon(size: int, out: Path) -> None:
    # iOS：必须不透明，满版方底（系统自行裁圆角）
    s = size * 4
    img = Image.new("RGB", (s, s), BG)
    draw_glyph(img, 0.52)
    img.resize((size, size), Image.LANCZOS).save(out)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    jobs = [
        ("icon-192.png", 192, make_rounded_icon),
        ("icon-512.png", 512, make_rounded_icon),
        ("icon-maskable-512.png", 512, make_maskable_icon),
        ("apple-touch-icon-180.png", 180, make_apple_touch_icon),
    ]
    for name, size, maker in jobs:
        out = OUT_DIR / name
        maker(size, out)
        with Image.open(out) as im:
            assert im.size == (size, size), f"{name} 尺寸错误: {im.size}"
        print(f"OK {name} {size}x{size}")


if __name__ == "__main__":
    main()
