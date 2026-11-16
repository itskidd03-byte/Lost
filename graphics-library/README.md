# Graphics library

A reusable set of low-poly 3D models, saved here so the same art can be dropped
into any later site. Everything is CC0 — take it, ship it, no credit required.

| Pack | Models | Size | What it is |
| --- | --- | --- | --- |
| `nature/` | 68 | 8.5 MB | Trees, pines, twisted and dead trees, bushes, ferns, grass, flowers, mushrooms, pebbles, rocks |
| `village/` | 176 | 40 MB | Modular medieval village: walls, corners, roofs, balconies, doors, windows, floors, stairs |
| `city/` | 153 | 46 MB | Modular modern city: bricks, trims, columns, windows, doors, awnings, street pieces |

397 models, 96 MB total. Source: Quaternius MegaKits (quaternius.com), CC0 1.0 —
see `LICENSE-quaternius.txt`.

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
