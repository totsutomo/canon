"""Canonアプリアイコン一式を生成する (app-design-rules準拠: 単色背景・白1モチーフ・角丸なし正方形・中央80%)。"""
from pathlib import Path

STATIC = Path(__file__).resolve().parent.parent / "static"
STATIC.mkdir(parents=True, exist_ok=True)

SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#1f6e5c"/>
  <g fill="none" stroke="#ffffff" stroke-width="26" stroke-linecap="round" stroke-linejoin="round" transform="translate(86,96) scale(14.16)">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </g>
</svg>
'''

def main():
    (STATIC / "icon.svg").write_text(SVG, encoding="utf-8")
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print("Pillow not installed; icon.svg created only.")
        return

    def draw_icon(size: int, pad_ratio: float = 0.22):
        img = Image.new("RGBA", (size, size), (31, 110, 92, 255))
        d = ImageDraw.Draw(img)
        w = max(2, round(size * 0.052))
        m = size * pad_ratio
        cx = size / 2
        top = size * (pad_ratio + 0.04)
        bot = size * (1 - pad_ratio - 0.04)
        left = m
        right = size - m
        mid_top = top + (bot - top) * 0.14
        mid_bot = bot + (bot - top) * 0.05
        # Left page
        d.line([(left, top), (cx - size * 0.08, top), (cx, mid_top), (cx, mid_bot)], fill="white", width=w, joint="curve")
        d.line([(left, top), (left, bot), (cx - size * 0.08, bot), (cx, mid_bot)], fill="white", width=w, joint="curve")
        # Right page
        d.line([(right, top), (cx + size * 0.08, top), (cx, mid_top)], fill="white", width=w, joint="curve")
        d.line([(right, top), (right, bot), (cx + size * 0.08, bot), (cx, mid_bot)], fill="white", width=w, joint="curve")
        return img

    draw_icon(192, 0.20).save(STATIC / "icon-192.png")
    draw_icon(512, 0.20).save(STATIC / "icon-512.png")
    draw_icon(512, 0.27).save(STATIC / "icon-maskable-512.png")
    draw_icon(180, 0.20).save(STATIC / "apple-touch-icon-180.png")
    draw_icon(64, 0.16).save(STATIC / "favicon.ico", format="ICO", sizes=[(32, 32), (64, 64)])
    print("Generated PNG/ICO icons in", STATIC)


if __name__ == "__main__":
    main()
