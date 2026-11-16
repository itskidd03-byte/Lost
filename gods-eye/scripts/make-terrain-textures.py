"""Paint the table's ground.

The board is low-poly on purpose, so its tiles get quiet, seamless noise rather
than photographic ground: enough grain to catch the light and tell grass from
rock, nothing that fights the shapes sitting on it.

Run from the repo root:  python3 gods-eye/scripts/make-terrain-textures.py
"""

import math
import random
from pathlib import Path

from PIL import Image

SIZE = 512
OUT = Path(__file__).resolve().parent.parent / "public" / "textures" / "terrain"

# base colour, grain colour, grain strength, speck colour, speck chance
RECIPES = {
    "grass": ("#5d7f45", "#40603a", 0.55, "#87a35c", 0.035),
    "meadow": ("#6d8f4c", "#4c6c3c", 0.5, "#9bbb68", 0.05),
    "forest": ("#41603f", "#2b4630", 0.6, "#5c7d4a", 0.04),
    "deepforest": ("#2f4a34", "#1e3325", 0.65, "#44664a", 0.03),
    "blackgrass": ("#2b3327", "#1b241a", 0.6, "#3f4a35", 0.02),
    "hills": ("#7a7257", "#57513c", 0.55, "#948a68", 0.03),
    "mountain": ("#87837a", "#5f5c55", 0.6, "#a5a199", 0.045),
    "peak": ("#dfe5e8", "#b9c4cb", 0.45, "#ffffff", 0.05),
    "desert": ("#c3ac78", "#9d8757", 0.5, "#dbc796", 0.04),
    "tundra": ("#aab6bd", "#8a969d", 0.45, "#cbd5da", 0.035),
    "swamp": ("#4c5a3b", "#333f2a", 0.6, "#657a4a", 0.03),
    "island": ("#87975f", "#657548", 0.5, "#a5b478", 0.03),
}


def hex_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def blend(a, b, t):
    return tuple(max(0, min(255, round(a[i] + (b[i] - a[i]) * t))) for i in range(3))


def tile_noise(scale, size=SIZE, seed=0):
    """Smooth value noise that wraps, so the texture tiles without a seam."""
    grid = max(2, size // scale)
    rnd = random.Random(seed)
    points = [[rnd.random() for _ in range(grid)] for _ in range(grid)]

    def sample(x, y):
        gx, gy = x / size * grid, y / size * grid
        x0, y0 = int(math.floor(gx)) % grid, int(math.floor(gy)) % grid
        x1, y1 = (x0 + 1) % grid, (y0 + 1) % grid
        fx, fy = gx - math.floor(gx), gy - math.floor(gy)
        fx = fx * fx * (3 - 2 * fx)
        fy = fy * fy * (3 - 2 * fy)
        top = points[y0][x0] * (1 - fx) + points[y0][x1] * fx
        bottom = points[y1][x0] * (1 - fx) + points[y1][x1] * fx
        return top * (1 - fy) + bottom * fy

    return sample


def paint(name, recipe):
    base, grain_col, strength, speck, chance = recipe
    base_rgb, grain_rgb, speck_rgb = hex_rgb(base), hex_rgb(grain_col), hex_rgb(speck)

    coarse = tile_noise(40, seed=hash(name) & 0xFFFF)
    fine = tile_noise(6, seed=(hash(name) >> 3) & 0xFFFF)
    micro = tile_noise(2, seed=(hash(name) >> 7) & 0xFFFF)

    img = Image.new("RGB", (SIZE, SIZE))
    px = img.load()
    rnd = random.Random(name)
    for y in range(SIZE):
        for x in range(SIZE):
            # coarse patches, fine grit and a little per-pixel dust
            n = coarse(x, y) * 0.5 + fine(x, y) * 0.34 + micro(x, y) * 0.16
            # push the range so the grain still reads on a tile a few pixels wide
            n = min(1.0, max(0.0, (n - 0.5) * 1.9 + 0.5))
            colour = blend(base_rgb, grain_rgb, n * strength + 0.08)
            if rnd.random() < chance:
                colour = blend(colour, speck_rgb, 0.45 + rnd.random() * 0.4)
            px[x, y] = colour
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, recipe in RECIPES.items():
        img = paint(name, recipe)
        path = OUT / f"{name}.webp"
        img.save(path, "WEBP", quality=82, method=6)
        print(f"{path.relative_to(OUT.parent.parent.parent)}  {path.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
