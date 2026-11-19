---
owner: D01
department: D01
revision: 1
project: God's Eye
status: approved
---

# God's Eye — Art Direction Bible

## Deliverable

### Palette

Values are the ones the build actually uses; a colour that is not in this table is a decision, not a
default.

| Role | Value | Where it lives |
| --- | --- | --- |
| Sky zenith | `#6f9dc4` | painted sky sheet, upper band |
| Sky high | `#9dc3dd` | painted sky sheet, mid band |
| Sky horizon / fog | `#d3e6f1` | horizon band and `FogExp2` colour |
| Ground haze | `#93a39b` | painted sky sheet, just below the horizon |
| Sun | `#fff3d8` | sun disc and directional light `0xfff1d6` |
| Cabin shadow | `#060809` | cabin background and fog |
| Lantern | `#ffb35c` | point light, the room's only warm key |
| Moon through the window | `#9dc3e6` | cabin directional light |
| Earth and timber | `#7a5631`, `#43301d` | table top and floorboards |
| Gold (UI and Johan) | `#c9a227`, `#f0cf6a` | nameplates, HUD, Johan's marker |
| Biome ground | per biome | vertex colours multiplied over one shared ground texture |

Rule: the cabin is warm and low-key (values near 0.05–0.25 linear), the region is cool and high-key
(0.35–0.7). Nothing in the cabin is allowed to read as daylight, and nothing outdoors may read as lamp
light.

### Lighting mood

- **Cabin:** one warm key (lantern `0xffb35c`, intensity 15, decay 1.7) with a wide fill of the same
  colour at low intensity, a cool moon through the window casting the only shadow in the room, and a
  near-black environment probe with a warm pool and one cool window patch. Mood: safe, close, amber.
- **Region:** one warm sun key at roughly 52° elevation from the west-north-west, sky-blue hemisphere
  fill, a light ambient term, and image-based light from the painted sky at 0.55 intensity. Mood: clear,
  cold, generous. Shadows are crisp at 2048 px on desktop and 1024 px on mobile, with a normal bias of
  0.035 to keep thin geometry from acne.
- **Tone:** ACES filmic at 1.02 exposure, no manual colour correction. If a scene needs a colour fix, it
  is fixed in the palette, not with a filter.
- **Bloom:** desktop only, strength 0.24, radius 0.55, threshold 0.9 in linear HDR. The threshold is set
  so only the sun, the lantern and the additive glows around them cross it. Bloom is a spill, never a
  haze over the whole frame.
- **Frame:** a graded vignette (elliptic falloff plus a cool top and warm bottom linear wash) sits between
  the canvas and the HUD, so interface elements are never dimmed by it.

### Material language

Painted in code, not photographed. Every surface is a canvas texture generated at load, paired with a
bump or normal sheet derived from the same source, so the detail aligns with the relief.

- **Terrain:** one shared ground-cover texture across every biome; biome identity comes from vertex
  colour, never from a second texture set. Anisotropy 8 on ground and terrain tiles.
- **Water:** painted currents as an albedo sheet, plus a normal sheet generated from that sheet's own
  luminance. Roughness 0.18 on rivers and 0.24 on ponds, metalness 0.26, environment intensity 1.15 on
  rivers and 0.85 elsewhere. Rivers run; ponds breathe; the normal sheet drifts with the albedo so a
  highlight stays on its crest.
- **Wood, plaster, fabric:** albedo plus bump, roughness 0.82–0.97, no metalness. Wear is painted as
  grain, knots, hairline cracks and damp, never as decals.
- **Metal:** metalness 0.5–0.8, roughness 0.35–0.6, and it only reads as metal because the environment
  probe is there. A metal material with no probe is a bug in the art direction, not a limitation.

### Silhouette and shape language

- Low-poly, hand-cut: 6–8 sided cones for conifers, boxes with a single bevel for buildings, cylinders
  with 8–12 segments for barrels, posts and lanterns.
- **Read at distance first.** Every model must be identifiable as a black shape at 30 m. Detail is
  added inside the silhouette, never as a fringe on it.
- Vertical rhythm: the cabin is human-scaled (2.6 m ceiling, 0.95 m table), the region is terrain-scaled
  (4 m tiles, mountains 30–80 m). Nothing between the two scales is allowed to be ambiguous.
- People are 1.7 m, rigged, and always distinguishable by silhouette and hat colour before face detail.

### Do and do-not

| Do | Pillar |
| --- | --- |
| Reuse the one ground texture and differentiate biomes by vertex colour | 1 — one world, one state |
| Keep the cabin's key warm and the region's key cold, always | 3 — light carries the story |
| Let the environment probe do the work for metal and water | 3 |
| Build the same art path for mobile, at a lower tier | 2 — the world runs everywhere |
| Paint wear into the texture | 1 — the world is old before you arrive |

| Do not | Pillar |
| --- | --- |
| Add a photographic texture that cannot be licence-verified | 1 — the world must be shippable |
| Use bloom as a substitute for contrast | 3 |
| Ship a second biome texture set to fake variety | 1 |
| Give the cabin daylight | 3 |
| Put interface chrome inside the vignette | 3 |

### Fidelity tiers

One build, three defined tiers, chosen once from the viewport and the device:

| Tier | Selected when | Shadow map | Bloom | Pixel ratio cap | Environment | Implemented |
| --- | --- | --- | --- | --- | --- | --- |
| Hero (desktop) | short side ≥ 760 px and > 4 cores | 2048 px, region and cabin | on | 2.0 | sky probe 0.55, interior probe 0.35 | Yes |
| Standard (small laptop, tablet) | short side ≥ 760 px, ≤ 4 cores | 2048 px region, 1024 px cabin | off | 1.75 | same probes | Defined, **not yet implemented** |
| Low (phone) | short side < 760 px | 1024 px region, 512 px cabin | off | 1.5 | same probes, cheaper resolution | Yes |

The proxies are deliberately simple and honest: the tier is decided by the size of the frame the device
must fill and its core count, not by a user-agent string. A tablet in landscape earns the desktop
treatment; a phone in landscape does not.

### Measured state of this bible

- Hero tier verified in the running build: bloom active, tier resolved as `high`, sky probe bound as the
  region environment at 0.55, interior probe bound in the cabin, region shadow map reported as 2048 px.
- Low tier exists as a code path (composer never constructed, 1024/512 shadow maps, pixel ratio 1.5) but
  has **not** been measured on a phone. No frame-rate claim is made for it.
- Standard is specified here and is not implemented: devices that would select it currently fall through
  to Low and lose the 2048 px region shadow. That is recorded as work for D12, not as a shipped feature.

## Acceptance

| Criterion | How this bible meets it |
| --- | --- |
| Palette, lighting mood and material language as concrete values | Palette table with hex values and where each is used; light intensities, decay, biases, bloom and exposure numbers; material roughness/metalness/environment intensities |
| Silhouette and shape-language rules a modeller can follow | Segment counts per shape class, the 30 m black-shape test, the two scales and their fixed dimensions |
| Do and do-not lists traceable to a creative pillar | Every row carries its pillar number, 1–3 |
| Platform-aware fidelity tiers (hero, standard, low) | Tier table with selection rule, shadow sizes, bloom state, pixel ratio and probe intensities |

## Handoff

- **D08 Environment Art:** the biome palette and the one-texture rule constrain every dressed area.
- **D09 Materials and Textures:** owns the canvas albedo/bump/normal pairs and the anisotropy and
  roughness values above; any new material must state its probe dependency.
- **D12 Lighting and Rendering:** owns the sun, the probes, the tone curve, bloom and the tier gate; the
  numbers here are the acceptance values, not suggestions.
- **D34 Performance Engineering:** the three tiers are the unit of performance evidence. A measurement
  must name its tier and device.
- **D39 Technical Art:** the normal-from-albedo derivation for water is the pattern to reuse for any
  other surface that needs relief without a second authored sheet.
