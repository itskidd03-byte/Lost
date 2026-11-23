# Asset memory bank

Permanent, reusable game-development asset warehouse. These are **actual files**
(`.glb`, `.gltf`, PBR map sets, sprites, HUD art, audio, HDRIs), verified after
download and indexed — not links.

**481 assets · 24239 files · 618.3 MB** — all CC0 1.0
(public domain): free for commercial use, no attribution required.

Start at `MEMORY_INDEX/catalog.csv` (one row per file: licence, creator, source
page, format, size, triangles, validation, sha256) or
`MEMORY_INDEX/assets.json` (one record per asset with all its maps). Each
category folder also carries a `manifest.json` so it can be read alone.

To browse it visually, run `npm run dev` in the repository root and open
`/asset-gallery/`: a thumbnail gallery with category and search filters, built
from the index by `tools/asset-bank/build-gallery.mjs`.

| Category | Assets | Files | Size |
| --- | ---: | ---: | ---: |
| `01_CHARACTERS` | 57 | 276 | 36.4 MB |
| `02_ANIMATIONS` | 0 | 0 | 0.0 MB |
| `03_MILITARY` | 34 | 240 | 19.8 MB |
| `04_BUILDINGS` | 49 | 3005 | 86.1 MB |
| `05_CONSTRUCTION` | 1 | 1 | 0.4 MB |
| `06_FURNITURE` | 20 | 1332 | 29.4 MB |
| `07_FOOD` | 31 | 1047 | 18.9 MB |
| `08_ENVIRONMENT` | 69 | 3152 | 127.6 MB |
| `09_TERRAIN` | 10 | 49 | 46.6 MB |
| `10_ROADS_INFRASTRUCTURE` | 29 | 511 | 8.1 MB |
| `11_PROPS_RESOURCES` | 67 | 1837 | 89.4 MB |
| `12_TEXTURES_MATERIALS` | 21 | 187 | 68.1 MB |
| `13_GRAPHICS_UI` | 43 | 11688 | 30.6 MB |
| `14_LIGHTING_EFFECTS` | 42 | 251 | 43.3 MB |
| `15_AUDIO` | 8 | 663 | 13.8 MB |

## Sources

| Source | What is taken | Licence |
| --- | --- | --- |
| [3dassets.dev](https://3dassets.dev) | web-optimised GLB models across all categories | CC0 1.0 |
| [Poly Haven](https://polyhaven.com) | glTF models (1K textures) and HDRIs | CC0 1.0 |
| [ambientCG](https://ambientcg.com) | 1K JPG PBR material sets | CC0 1.0 |
| [Kenney](https://kenney.nl/assets) | sprites, tilesets, UI/HUD, icons, audio packs | CC0 1.0 |

Quaternius, Mixamo and the larger GitHub kits are deliberately **not** mirrored:
Quaternius and the big kits are already in `graphics-library/`, Mixamo animations
may not be redistributed, and `fps-buildings-env-kit` alone is 564 MB. See
`MEMORY_INDEX/provenance.json` for the full acquisition log.

## Adding more

```bash
node tools/asset-bank/build-assets.mjs                    # every source
node tools/asset-bank/build-assets.mjs --source=kenney    # one source
BANK_MAX_BYTES=900000000 node tools/asset-bank/build-assets.mjs
```

Runs are idempotent: an asset is keyed by source id, files are hashed with
SHA-256, and identical bytes are rejected rather than stored twice. The bank
stops cleanly at `BANK_MAX_BYTES` (620 MB by default) so it never grows past
what GitHub is comfortable holding.
