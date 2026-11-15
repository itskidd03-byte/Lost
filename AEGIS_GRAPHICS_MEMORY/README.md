# AEGIS Graphics Memory Bank

Permanent, searchable graphics memory for AEGIS departments. This directory holds
**1800 actual graphics files** — decoded, measured and indexed — not links.

Generated 2026-11-15T20:31:39.133Z by `tools/aegis/build-assets.mjs` (pipeline `aegis@1.0.0`).

## Collections

| Collection | Id prefix | Assets | Directory |
|---|---|---:|---|
| Dark Futuristic / Industrial | DFI | 600 | `AEGIS_GRAPHICS_MEMORY/DARK_FUTURISTIC_INDUSTRIAL/` |
| Photorealistic | PHR | 600 | `AEGIS_GRAPHICS_MEMORY/PHOTOREALISTIC/` |
| Fantasy / Cinematic | FCN | 600 | `AEGIS_GRAPHICS_MEMORY/FANTASY_CINEMATIC/` |

## Categories

| Category | Required per collection | Present |
|---|---:|---:|
| Characters and NPCs | 75 | 225 |
| Buildings and architecture | 75 | 225 |
| Environments and landscapes | 100 | 300 |
| Objects and props | 75 | 225 |
| Textures and materials | 75 | 225 |
| UI elements and icons | 75 | 225 |
| Effects and animations | 50 | 150 |
| Concept art and references | 75 | 225 |

## Licensing

* Externally acquired assets are **CC0, public domain or CC BY** only. CC BY-SA,
  CC BY-NC and CC BY-ND are rejected by the pipeline. Per-asset source page,
  creator and licence are recorded in `MEMORY_INDEX/generation_provenance.json`.
* `ui/` and `effects/` assets are `original_generated`: original procedural
  vector art authored in `tools/aegis/gen-ui.mjs` and `gen-fx.mjs`.

## Retrieval

Start at `MEMORY_INDEX/retrieval_metadata.json`, then use
`MEMORY_INDEX/asset_tags.json` for keyword lookup and
`MEMORY_INDEX/master_asset_index.json` for full records. Every record carries a
stable `asset_id` and its `repository_path`.

## Rebuilding

```bash
node tools/aegis/build-assets.mjs          # acquire + generate + index
node tools/aegis/validate-bank.mjs         # independent verification
```

The `AEGIS graphics memory bank` workflow runs the same commands and commits new
assets in batches of 25.
