"""Generate the installable app icons for God's Eye (a gold eye in the dark)."""

from PIL import Image, ImageDraw, ImageFilter
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(OUT, exist_ok=True)


def eye(size, scale=0.72, maskable=False):
    img = Image.new("RGBA", (size, size), (5, 7, 10, 255))
    draw = ImageDraw.Draw(img)

    # subtle vignette / starfield
    for i in range(90):
        x = (i * 7919) % size
        y = (i * 104729) % size
        a = 18 + (i * 13) % 55
        draw.point((x, y), fill=(201, 162, 39, a))

    cx, cy = size / 2, size / 2
    w = size * scale
    h = w * 0.56
    stroke = max(2, int(size * 0.018))
    gold = (217, 178, 60, 255)
    amber = (240, 207, 106, 255)

    # eye almond as two arcs
    box = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]
    draw.arc(box, 200, 340, fill=gold, width=stroke)
    draw.arc(box, 20, 160, fill=gold, width=stroke)

    # iris rings
    r = h * 0.92
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=gold, width=max(2, stroke // 2))
    r2 = h * 0.52
    draw.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], fill=(20, 16, 8, 255), outline=amber, width=max(2, stroke // 2))
    r3 = h * 0.24
    draw.ellipse([cx - r3, cy - r3, cx + r3, cy + r3], fill=amber)

    glow = img.filter(ImageFilter.GaussianBlur(size * 0.03))
    img = Image.blend(img, glow, 0.35)

    if maskable:
        # keep the mark inside the safe zone
        inner = eye(size, scale=0.5, maskable=False).resize((int(size * 0.62), int(size * 0.62)))
        base = Image.new("RGBA", (size, size), (5, 7, 10, 255))
        base.paste(inner, (int(size * 0.19), int(size * 0.19)), inner)
        img = base

    return img


for size, maskable, name in [(192, False, "icon-192.png"), (512, False, "icon-512.png"), (512, True, "icon-maskable-512.png")]:
    eye(size, maskable=maskable).convert("RGB").save(os.path.join(OUT, name), "PNG", optimize=True)
    print("wrote", name)
