# Graphics library

A reusable set of low-poly 3D models, saved here so the same art can be dropped
into any later site. Everything is CC0 — take it, ship it, no credit required.

| Pack | Models | Size | What it is |
| --- | --- | --- | --- |
| `nature/` | 68 | 8.5 MB | Trees, pines, twisted and dead trees, bushes, ferns, grass, flowers, mushrooms, pebbles, rocks |
| `village/` | 176 | 40 MB | Modular medieval village: walls, corners, roofs, balconies, doors, windows, floors, stairs |
| `city/` | 153 | 46 MB | Modular modern city: bricks, trims, columns, windows, doors, awnings, street pieces |
| `medieval-kit/` | 105 | 1.3 MB | Kenney's retro medieval kit: walls, doorways, roofs, towers, battlements, docks, fences, crates, pixel-art atlases |
| `people/` | 8 | 0.8 MB | Rigged medieval people — peasants, townsfolk, rich citizens, a king and a queen |
| `animals/` | 8 | 0.1 MB | Vertex-coloured animals: cow, sheep, goat, deer, horse, fox, chicken, duck |

520 models. The Quaternius mega kits (`nature`, `village`, `city`) are CC0 — see
`LICENSE-quaternius.txt`. Kenney's kit is CC0 too (`medieval-kit/LICENSE.txt`);
the people and animal packs came from the same upload and carry their own terms
in `people/LICENSE.txt`.

The three new packs are what the table in God's Eye is built from:
`medieval-kit/` houses are one kit cell wide, `people/` are rigged and can be
posed by bone, and `animals/` store their paint in vertex colours (set
`material.vertexColors = true` or they render flat).

`medieval-kit/*.glb` point at `Textures/*.png` beside them, so copy that folder
with the models.

## Format

- Binary glTF (`.glb`), one file per model, textures **embedded** as WebP (max 1024 px).
- Geometry is **Meshopt-compressed**, which is what keeps a tree at ~250 KB instead of 9 MB.
- Because of Meshopt, the loader needs a decoder. In three.js:

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const gltf = await loader.loadAsync('/models/nature/CommonTree_1.glb');
scene.add(gltf.scene);
```

Blender imports `.glb` with Meshopt natively; Godot 4 does too. Any engine
without a Meshopt decoder needs the files re-exported plain — see "Re-exporting".

## Using a model

Models are untextured-unit-scale in no particular orientation: measure the
bounding box and scale to the height you want, then set the model's
`position.y -= box.min.y` so it stands on the ground. `gods-eye/src/render/nature.js`
does exactly this for trees.

`manifest.json` lists every model with its path and byte size, grouped by pack —
read it to find names without listing the folders.

## Adding more

The originals came from a Quick Share; the zips are not kept here. To add a
pack, convert each glTF into a compressed GLB:

```bash
npx @gltf-transform/cli optimize model.gltf out/model.glb \
  --texture-compress webp --texture-size 1024 --simplify false
```

Then append it to `manifest.json` (or regenerate it: the packs map holds one
entry per folder).

## Re-exporting without Meshopt

If a target engine cannot run a Meshopt decoder, convert once for that project:

```bash
npx @gltf-transform/cli optimize in.glb out.glb --compress false --simplify false
```

Sizes roughly double, and nothing else changes.
