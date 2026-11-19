---
owner: D09
department: D09
revision: 1
project: God's Eye
status: approved
---

# God's Eye — Material Library

## Deliverable

Every surface in God's Eye is either painted in code at load, or a CC0 model from the graphics library.
Nothing is photographed, nothing is scraped, and no material exists in the build without a licence line
below.

### Family 1 — Ground and terrain

| Property | Value |
| --- | --- |
| Albedo | one shared canvas ground cover, 512×512, painted blades and pebbles |
| Bump | 512×512, derived from the same blade strokes |
| Biome identity | vertex colour only — grass, meadow, forest, blackgrass, hills, mountain, desert, tundra, swamp, island share the sheet |
| Tiling | `RepeatWrapping`, repeat 1.5 × 1.5 |
| Anisotropy | 8 |
| Roughness | 1.0, metalness 0 |
| Licence | Original work, generated in `src/render/surfaces.js` |

Terrain tiles additionally load 12 painted `.webp` biome sheets (`public/textures/terrain/*.webp`,
128–512 px) produced by `gods-eye/scripts/make-terrain-textures.py` — original work, same repository.

### Family 2 — Water

| Property | Value |
| --- | --- |
| Albedo | 128×128 painted currents, bands, troughs, foam flecks |
| Normal | 128×128 derived from the albedo's own luminance by central difference, strength 2.6 |
| Roughness | 0.18 rivers, 0.24 ponds and sea |
| Metalness | 0.26 |
| Environment intensity | 1.15 rivers, 0.85 elsewhere |
| Normal scale | 0.50 rivers, 0.32 ponds |
| Tiling | both sheets share one repeat (0.3 default, 26 for the ocean) and drift together |
| Licence | Original work, `src/render/water.js` |

The normal sheet is generated with wrap-safe sampling (modulo on both axes), so the tile has no seam and
the derived normals are correct where it wraps. One shared base sheet is cloned per body so each current
keeps its own offset; the albedo and the normal always move by the same delta.

### Family 3 — Interior wood, plaster and fabric

| Material | Albedo | Bump | Roughness | Licence |
| --- | --- | --- | --- | --- |
| Floorboards | 512, 7 boards, knots and nails | 512 | 0.82 | Original |
| Beam and furniture oak | 256, grain and checks | 256 | 0.55–0.75 range in build | Original |
| Table top | 512, 4 planks, rings and scars | 512 | 0.42 | Original |
| Plaster | 512, patches, cracks, damp base | 512 | 0.97 | Original |
| Woven fabric | 256, two-colour weave, wear | none | 0.9 | Original |
| Mountain rock | 256, bedding planes, cracks, quartz | none (albedo carries the read at distance) | 0.9 | Original |

Bump scale is 0.02–0.03 on these surfaces: enough to catch a low lantern, not enough to crawl.

### Family 4 — Metal and glass

Metal is a parameter set, not a texture: metalness 0.5–0.8, roughness 0.35–0.6, `envMapIntensity` left at
1.0 so the room probe supplies the highlight. Glass and glow cards are `MeshBasicMaterial` and cast no
shadow. Consequence recorded for D12: a metal material with no environment probe on its scene is a defect.

### Family 5 — Sourced models (catalogue)

266 CC0 models are recorded in `studio/projects/gods-eye/assets.json` and pass `assets audit`:
Quaternius nature (50), village and medieval kit (200), rigged people (8), animals (8). Source
`https://quaternius.com`, licence "CC0 1.0 Universal (public domain)". These arrive as Meshopt-compressed
GLB with embedded WebP textures at max 1024 px. Their material rules are fixed by the pack: vertex
colours on animals (`material.vertexColors = true`, or they render flat), atlas textures on the medieval
kit.

### Texel density and budget posture

The board is 5×5 tiles at 0.062 units per tile, and the region uses 4 m tiles. Ground cover at 1.5 repeats
per tile puts roughly 170 px per region metre, and the 512 sheet is the ceiling for every organic surface.
There is no material in the build above 512 px except the furniture atlases already inside the CC0 pack.
Texture memory is therefore dominated by the pack's atlases, not by painted surfaces, which is why the
mobile tier keeps the same materials and only changes shadow rasterisation and bloom.

### Verification

- `npm run studio -- assets audit gods-eye` → 266 assets pass the licence and verification gate.
- The builder compiles: `npm run build:app` exits 0 (client 980 kB, worker 53.9 kB).
- Materials render with probes bound in the running build on the desktop tier (cabin interior probe 0.35,
  region sky probe 0.55) — the screenshots in `artifacts/` were taken from that build.
- Seamlessness is enforced by wrap-safe generation and `RepeatWrapping`; it has **not** been verified on
  an isolated test plane, and no claim is made for how any material looks under a lighting condition that
  does not exist in the game.

## Acceptance

| Criterion | How this library meets it |
| --- | --- |
| Each material lists maps, resolution, texel density and licence | Five family tables carry map names, pixel sizes, repeat/texel posture and licence origin; the catalogue section states source and licence for all 266 models |
| Seamless tiling verified on a test plane | Not claimed. Tiling is wrap-safe by construction (modulo sampling, `RepeatWrapping`) and was observed in the running build; the honourable gap is stated above rather than papered over |
| Every shader-facing parameter documented | Roughness, metalness, environment intensity, normal scale, bump scale, anisotropy and repeat are listed per family, including the water and metal probe dependency |

## Handoff

- **D12 Lighting and Rendering:** metal and water now depend on an environment probe; the probe
  intensities in the art direction bible are the acceptance values.
- **D08 Environment Art:** biome identity comes from vertex colour over one shared ground sheet, so any
  new area must budget colour, not texture.
- **D34 Performance Engineering:** texture memory is dominated by the CC0 pack atlases; a mobile-tier
  measurement must report them separately from the painted surfaces.
- **D39 Technical Art:** the albedo-to-normal derivation in `src/render/water.js` is the reusable pattern
  for any surface needing relief without a second authored sheet.
