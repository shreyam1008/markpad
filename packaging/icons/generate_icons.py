#!/usr/bin/env python3
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
WINDOWS_ICON = ROOT / "packaging" / "windows" / "markpad.ico"
MACOS_ICON = ROOT / "packaging" / "macos" / "markpad.icns"
CANONICAL_SVG = ROOT / "packaging" / "linux" / "markpad.svg"
FRONTEND_SVG = ROOT / "frontend" / "src" / "assets" / "markpad-mark.svg"
WEBSITE_SVG = ROOT / "docs" / "favicon.svg"

GREEN = "#2f6f61"
PAPER = "#fffffb"
MUTED = "#a3b8b0"
GOLD = "#d49e2a"


def scaled_box(scale, *values):
    return [round(value * scale) for value in values]


def draw_round_line(draw, scale, points, color, width):
    width = round(width * scale)
    scaled = [(round(x * scale), round(y * scale)) for x, y in points]
    draw.line(scaled, fill=color, width=width, joint="curve")
    radius = width / 2
    for x, y in scaled:
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)


def render_icon(size):
    render_size = size * 4
    scale = render_size / 128
    image = Image.new("RGBA", (render_size, render_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    draw.rounded_rectangle(
        scaled_box(scale, 0, 0, 128, 128),
        radius=round(28 * scale),
        fill=GREEN,
    )
    draw.rounded_rectangle(
        scaled_box(scale, 22, 18, 106, 110),
        radius=round(10 * scale),
        fill=PAPER,
    )

    draw_round_line(draw, scale, [(36, 80), (36, 42), (50, 62), (64, 42), (64, 80)], GREEN, 7)
    draw_round_line(draw, scale, [(72, 56), (94, 56)], MUTED, 5)
    draw_round_line(draw, scale, [(72, 68), (90, 68)], MUTED, 5)
    draw_round_line(draw, scale, [(72, 80), (86, 80)], MUTED, 5)

    draw.ellipse(scaled_box(scale, 82, 82, 114, 114), fill=GOLD)
    draw_round_line(draw, scale, [(93, 98), (97, 102), (104, 94)], PAPER, 3.5)

    return image.resize((size, size), Image.Resampling.LANCZOS)


def main():
    WINDOWS_ICON.parent.mkdir(parents=True, exist_ok=True)
    MACOS_ICON.parent.mkdir(parents=True, exist_ok=True)

    base = render_icon(1024)
    base.save(
        WINDOWS_ICON,
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    base.save(
        MACOS_ICON,
        format="ICNS",
        sizes=[(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)],
    )

    FRONTEND_SVG.parent.mkdir(parents=True, exist_ok=True)
    FRONTEND_SVG.write_bytes(CANONICAL_SVG.read_bytes())
    WEBSITE_SVG.write_bytes(CANONICAL_SVG.read_bytes())

    print(f"Wrote {WINDOWS_ICON.relative_to(ROOT)}")
    print(f"Wrote {MACOS_ICON.relative_to(ROOT)}")
    print(f"Synced {FRONTEND_SVG.relative_to(ROOT)}")
    print(f"Synced {WEBSITE_SVG.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
