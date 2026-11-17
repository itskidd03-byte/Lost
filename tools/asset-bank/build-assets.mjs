// Build ASSET_MEMORY_BANK: acquire real, licensed game assets, verify them and
// index them. No dependencies beyond Node 20 + `unzip`, so it runs in GitHub
// Actions untouched.
//
//   node tools/asset-bank/build-assets.mjs                 # every source
//   node tools/asset-bank/build-assets.mjs --source=kenney  # one source
//   BANK_MAX_BYTES=200000000 node ...                       # tighten the budget
//
// Downloads are idempotent: an asset already indexed by source id is skipped,
// files already on disk are reused, and a run that hits the storage budget
// stops cleanly with everything downloaded so far indexed.
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const BANK = 'ASSET_MEMORY_BANK';
const INDEX = `${BANK}/MEMORY_INDEX`;
const TMP = '.asset-bank-tmp';
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const args = new Set(process.argv.slice(2).map((a) => a.replace(/^--/, '')));
const only = new Set(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--source='))
    .flatMap((a) => a.slice('--source='.length).split(','))
    .filter(Boolean),
);
const having = (name) => only.size === 0 || only.has(name);

// Storage ceiling for the whole bank. GitHub rejects files over 100 MB and
// warns on repositories over 1 GB, so the bank keeps itself far below both.
const MAX_BYTES = Number(process.env.BANK_MAX_BYTES || 620 * 1024 * 1024);
const MAX_FILE_BYTES = 40 * 1024 * 1024;
const DELAY_MS = Number(process.env.BANK_DELAY_MS || 120);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const slugify = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'asset';

// ---------------------------------------------------------------------------
// Taxonomy: the requested permanent structure, stored verbatim in the index so
// future acquisition runs route into the same folders.
// ---------------------------------------------------------------------------
const TAXONOMY = {
  '01_CHARACTERS': ['Humans', 'Soldiers', 'Civilians', 'Fantasy Characters', 'Monsters', 'Animals', 'Creatures', 'NPCs', 'Character Skins', 'Clothing', 'Armor'],
  '02_ANIMATIONS': ['Walking', 'Running', 'Idle', 'Combat', 'Melee', 'Shooting', 'Reloading', 'Death', 'Jumping', 'Flying', 'Working', 'Farming', 'Building', 'Emotes', 'Facial Animations'],
  '03_MILITARY': ['Soldiers', 'Weapons', 'Tanks', 'Helicopters', 'Aircraft', 'Ships', 'Vehicles', 'Military Buildings', 'Barracks', 'Fortifications', 'Sandbags', 'Turrets', 'Explosions', 'Military Props'],
  '04_BUILDINGS': ['Houses', 'Castles', 'Fortresses', 'Shops', 'Hospitals', 'Factories', 'Warehouses', 'Farms', 'Churches', 'Industrial', 'Modern Buildings', 'Medieval Buildings', 'Modular Building Pieces'],
  '05_CONSTRUCTION': ['Walls', 'Doors', 'Windows', 'Floors', 'Ceilings', 'Roofs', 'Stairs', 'Gates', 'Fences', 'Bridges', 'Foundations', 'Pillars', 'Structural Pieces'],
  '06_FURNITURE': ['Bedroom', 'Living Room', 'Kitchen', 'Bathroom', 'Office', 'Tables', 'Chairs', 'Cabinets', 'Beds', 'Appliances', 'Decorations'],
  '07_FOOD': ['Fruits', 'Vegetables', 'Meat', 'Bread', 'Prepared Meals', 'Drinks', 'Ingredients', 'Cooking Equipment'],
  '08_ENVIRONMENT': ['Trees', 'Bushes', 'Grass', 'Flowers', 'Rocks', 'Mountains', 'Water', 'Rivers', 'Lakes', 'Cliffs', 'Caves', 'Forests'],
  '09_TERRAIN': ['Dirt', 'Mud', 'Sand', 'Gravel', 'Grass', 'Stone', 'Snow', 'Asphalt', 'Concrete', 'Terrain Tiles', 'Terrain Textures'],
  '10_ROADS_INFRASTRUCTURE': ['Roads', 'Intersections', 'Sidewalks', 'Highways', 'Bridges', 'Railways', 'Streetlights', 'Traffic Signs', 'Utility Poles'],
  '11_PROPS_RESOURCES': ['Tools', 'Crates', 'Barrels', 'Mining Resources', 'Wood', 'Stone', 'Metals', 'Crafting Materials', 'Collectibles'],
  '12_TEXTURES_MATERIALS': ['PBR Materials', 'Normal Maps', 'Roughness Maps', 'Metallic Maps', 'Displacement Maps', 'Ambient Occlusion', 'Decals', 'Surface Details'],
  '13_GRAPHICS_UI': ['Icons', 'Buttons', 'HUD', 'Inventory', 'Menus', 'Sprites', 'Tilesets', 'Particle Effects', 'Backgrounds'],
  '14_LIGHTING_EFFECTS': ['HDRI', 'Skyboxes', 'Fire', 'Smoke', 'Weather', 'Rain', 'Snow', 'Fog', 'Lighting Effects'],
  '15_AUDIO': ['Sound Effects', 'Weapons', 'Footsteps', 'Animals', 'Environment', 'Music', 'Interface Sounds'],
};
const EXTENSIONS = new Set([
  '.glb', '.gltf', '.fbx', '.obj', '.blend', '.bin',
  '.png', '.jpg', '.jpeg', '.webp', '.svg', '.tga', '.exr', '.bmp',
  '.hdr', '.wav', '.ogg', '.mp3', '.txt', '.md', '.pdf', '.json', '.csv', '.ttf', '.otf', '.aseprite', '.psd', '.mtl',
]);

// ---------------------------------------------------------------------------
// Routing: every source asset lands in a taxonomy folder.
// ---------------------------------------------------------------------------
const any = (text, words) => words.some((w) => text.includes(w));
const word = (text, words) => words.some((w) => new RegExp(`\\b${w}\\b`).test(text));

function route3d(asset) {
  const t = `${asset.title} ${(asset.tags || []).map((x) => x.slug || x).join(' ')} ${asset.category?.slug || ''}`.toLowerCase();
  const cat = asset.category?.slug || 'props';
  if (cat === 'characters') {
    if (any(t, ['monster', 'zombie', 'skeleton', 'ghost', 'demon', 'goblin', 'orc', 'dragon', 'slime', 'mutant', 'beast', 'horror'])) return '01_CHARACTERS/Monsters';
    if (any(t, ['soldier', 'troop', 'military', 'army', 'warrior', 'knight'])) return '01_CHARACTERS/Soldiers';
    if (any(t, ['fantasy', 'elf', 'dwarf', 'wizard', 'witch'])) return '01_CHARACTERS/Fantasy Characters';
    if (any(t, ['civilian', 'villager', 'peasant', 'worker', 'businessman', 'tourist'])) return '01_CHARACTERS/Civilians';
    return '01_CHARACTERS/Humans';
  }
  if (cat === 'animals') return '01_CHARACTERS/Animals';
  if (cat === 'food') {
    if (any(t, ['apple', 'banana', 'orange', 'lemon', 'berry', 'fruit', 'grape', 'melon', 'pear'])) return '07_FOOD/Fruits';
    if (any(t, ['carrot', 'tomato', 'potato', 'onion', 'vegetable', 'pepper', 'cabbage', 'broccoli'])) return '07_FOOD/Vegetables';
    if (any(t, ['meat', 'steak', 'chicken', 'fish', 'bacon', 'sausage'])) return '07_FOOD/Meat';
    if (any(t, ['bread', 'bun', 'bagel', 'toast', 'croissant', 'doughnut', 'donut'])) return '07_FOOD/Bread';
    if (any(t, ['coffee', 'tea', 'juice', 'bottle', 'can', 'drink', 'soda', 'wine'])) return '07_FOOD/Drinks';
    if (any(t, ['pan', 'pot', 'knife', 'spatula', 'oven', 'grill', 'plate', 'bowl', 'cup'])) return '07_FOOD/Cooking Equipment';
    return '07_FOOD/Prepared Meals';
  }
  if (cat === 'weapons-tools') {
    if (any(t, ['tank', 'apc', 'armoured', 'armored', 'military'])) return '03_MILITARY/Vehicles';
    if (any(t, ['gun', 'rifle', 'pistol', 'shotgun', 'sword', 'axe', 'knife', 'weapon', 'blaster', 'bow', 'spear', 'grenade', 'turret', 'ammo'])) {
      return any(t, ['turret', 'cannon', 'artillery']) ? '03_MILITARY/Turrets' : '03_MILITARY/Weapons';
    }
    return '11_PROPS_RESOURCES/Tools';
  }
  if (cat === 'vehicles') {
    if (any(t, ['tank', 'military', 'apc', 'jeep', 'truck', 'helicopter', 'fighter'])) return '03_MILITARY/Vehicles';
    return '11_PROPS_RESOURCES/Vehicles';
  }
  if (cat === 'props') {
    if (any(t, ['pillow', 'mattress', 'wardrobe', 'nightstand']) || word(t, ['bed'])) return '06_FURNITURE/Bedroom';
    if (any(t, ['sofa', 'couch', 'armchair', 'tv', 'television', 'rug', 'living'])) return '06_FURNITURE/Living Room';
    if (any(t, ['kitchen', 'fridge', 'stove', 'sink', 'microwave'])) return '06_FURNITURE/Kitchen';
    if (any(t, ['bath', 'shower', 'toilet', 'washbasin'])) return '06_FURNITURE/Bathroom';
    if (any(t, ['desk', 'office', 'monitor', 'computer', 'printer'])) return '06_FURNITURE/Office';
    if (word(t, ['table', 'desk', 'coffee table', 'workbench'])) return '06_FURNITURE/Tables';
    if (word(t, ['chair', 'stool', 'bench', 'seat', 'sofa', 'couch', 'armchair'])) return '06_FURNITURE/Chairs';
    if (any(t, ['cabinet', 'drawer', 'shelf', 'bookcase', 'cupboard'])) return '06_FURNITURE/Cabinets';
    if (any(t, ['crate', 'barrel', 'box', 'pallet', 'container'])) return '11_PROPS_RESOURCES/Crates';
    if (any(t, ['lamp', 'vase', 'picture', 'carpet', 'clock', 'plant pot', 'decor'])) return '06_FURNITURE/Decorations';
    return '11_PROPS_RESOURCES';
  }
  if (cat === 'buildings') {
    if (any(t, ['castle', 'fort', 'tower', 'keep', 'battlement'])) return '04_BUILDINGS/Castles';
    if (any(t, ['shop', 'store', 'market', 'cafe', 'restaurant', 'bakery', 'stall'])) return '04_BUILDINGS/Shops';
    if (any(t, ['hospital', 'clinic'])) return '04_BUILDINGS/Hospitals';
    if (any(t, ['factory', 'plant', 'mill'])) return '04_BUILDINGS/Factories';
    if (any(t, ['warehouse', 'depot', 'hangar'])) return '04_BUILDINGS/Warehouses';
    if (any(t, ['farm', 'barn', 'silo', 'stable'])) return '04_BUILDINGS/Farms';
    if (any(t, ['church', 'chapel', 'cathedral', 'temple', 'shrine'])) return '04_BUILDINGS/Churches';
    if (any(t, ['industrial', 'refinery', 'power', 'utility'])) return '04_BUILDINGS/Industrial';
    if (any(t, ['modern', 'apartment', 'office', 'skyscraper', 'school', 'hotel', 'city'])) return '04_BUILDINGS/Modern Buildings';
    if (any(t, ['medieval', 'timber', 'cottage', 'tavern', 'inn'])) return '04_BUILDINGS/Medieval Buildings';
    if (any(t, ['wall', 'door', 'window', 'roof', 'floor', 'stair', 'fence', 'gate', 'pillar', 'column'])) return '05_CONSTRUCTION/Structural Pieces';
    return '04_BUILDINGS/Houses';
  }
  if (cat === 'nature') {
    if (any(t, ['tree', 'pine', 'palm', 'oak', 'birch', 'willow', 'conifer'])) return '08_ENVIRONMENT/Trees';
    if (any(t, ['bush', 'shrub', 'hedge'])) return '08_ENVIRONMENT/Bushes';
    if (any(t, ['flower', 'blossom', 'rose', 'tulip'])) return '08_ENVIRONMENT/Flowers';
    if (any(t, ['grass', 'fern', 'moss', 'plant', 'reed'])) return '08_ENVIRONMENT/Grass';
    if (any(t, ['rock', 'stone', 'boulder', 'cliff', 'pebble'])) return '08_ENVIRONMENT/Rocks';
    if (any(t, ['mountain', 'hill'])) return '08_ENVIRONMENT/Mountains';
    if (any(t, ['water', 'river', 'lake', 'pond', 'waterfall'])) return '08_ENVIRONMENT/Water';
    if (any(t, ['cave', 'cavern'])) return '08_ENVIRONMENT/Caves';
    if (any(t, ['forest', 'woodland', 'jungle'])) return '08_ENVIRONMENT/Forests';
    return '08_ENVIRONMENT';
  }
  if (cat === 'roads-infrastructure') {
    if (any(t, ['intersection', 'crossing', 'junction', 'roundabout'])) return '10_ROADS_INFRASTRUCTURE/Intersections';
    if (any(t, ['sidewalk', 'kerb', 'curb', 'pavement'])) return '10_ROADS_INFRASTRUCTURE/Sidewalks';
    if (any(t, ['highway', 'motorway', 'freeway'])) return '10_ROADS_INFRASTRUCTURE/Highways';
    if (any(t, ['bridge', 'overpass', 'viaduct'])) return '10_ROADS_INFRASTRUCTURE/Bridges';
    if (any(t, ['rail', 'train', 'tram', 'track'])) return '10_ROADS_INFRASTRUCTURE/Railways';
    if (any(t, ['streetlight', 'street light', 'lamp post', 'lantern'])) return '10_ROADS_INFRASTRUCTURE/Streetlights';
    if (any(t, ['sign', 'traffic light', 'signal'])) return '10_ROADS_INFRASTRUCTURE/Traffic Signs';
    if (any(t, ['pole', 'utility', 'pylon', 'cable'])) return '10_ROADS_INFRASTRUCTURE/Utility Poles';
    return '10_ROADS_INFRASTRUCTURE/Roads';
  }
  if (cat === 'icons') return '13_GRAPHICS_UI/Icons';
  if (cat === 'environments') {
    if (any(t, ['interior', 'room', 'kitchen', 'office', 'bedroom', 'shop interior'])) return '04_BUILDINGS/Modular Building Pieces';
    return '08_ENVIRONMENT';
  }
  if (cat === 'effects-primitives') return '14_LIGHTING_EFFECTS/Lighting Effects';
  return '11_PROPS_RESOURCES';
}

// ambientCG assetId prefixes -> texture folders.
const ACG_ROUTES = [
  [/^(Asphalt|Road)/i, '09_TERRAIN/Asphalt'],
  [/^(Concrete|Plaster|PaintedPlaster|PavingStones)/i, '09_TERRAIN/Concrete'],
  [/^(Bricks|Brick)/i, '12_TEXTURES_MATERIALS/PBR Materials'],
  [/^(Dirt|Ground|Mud|Gravel|Sand|Snow|Grass|Rock|Stone|Marble|Terrazzo)/i, '09_TERRAIN/Terrain Textures'],
  [/^(Wood|Metal|Fabric|Leather|Rubber|Carpet|Tiles|Roofing|Ceramic|DiamondPlate|Foam)/i, '12_TEXTURES_MATERIALS/PBR Materials'],
];
const routeACG = (id) => {
  for (const [re, dir] of ACG_ROUTES) if (re.test(id)) return dir;
  return '12_TEXTURES_MATERIALS/PBR Materials';
};

// Kenney packs -> taxonomy folders, matched by slug keyword.
// Ordered by priority: audio, then UI/HUD, then 2D sprites and tilesets, then
// the Kenney 3D kits. A capped run takes the first N of this list.
const KENNEY_PACKS = [
  ['interface-sounds', '15_AUDIO/Interface Sounds'],
  ['impact-sounds', '15_AUDIO/Sound Effects'],
  ['rpg-audio', '15_AUDIO/Sound Effects'],
  ['casino-audio', '15_AUDIO/Sound Effects'],
  ['sci-fi-sounds', '15_AUDIO/Sound Effects'],
  ['music-jingles', '15_AUDIO/Music'],
  ['ui-pack', '13_GRAPHICS_UI/HUD'],
  ['ui-pack-rpg-expansion', '13_GRAPHICS_UI/Inventory'],
  ['ui-pack-adventure', '13_GRAPHICS_UI/Menus'],
  ['game-icons', '13_GRAPHICS_UI/Icons'],
  ['cursor-pack', '13_GRAPHICS_UI/Buttons'],
  ['input-prompts', '13_GRAPHICS_UI/Buttons'],
  ['pattern-pack', '13_GRAPHICS_UI/Backgrounds'],
  ['background-elements', '13_GRAPHICS_UI/Backgrounds'],
  ['pixel-platformer', '13_GRAPHICS_UI/Tilesets'],
  ['pixel-platformer-industrial-expansion', '13_GRAPHICS_UI/Tilesets'],
  ['1-bit-pack', '13_GRAPHICS_UI/Sprites'],
  ['pixel-line-platformer', '13_GRAPHICS_UI/Sprites'],
  ['pixel-shmup', '13_GRAPHICS_UI/Sprites'],
  ['desert-shooter-pack', '13_GRAPHICS_UI/Sprites'],
  ['platformer-kit', '13_GRAPHICS_UI/Sprites'],
  ['fantasy-ui-borders', '13_GRAPHICS_UI/HUD'],
  ['ui-pack-sci-fi', '13_GRAPHICS_UI/Menus'],
  ['digital-audio', '15_AUDIO/Sound Effects'],
  ['voiceover-pack', '15_AUDIO/Sound Effects'],
  ['mini-characters', '01_CHARACTERS/Humans'],
  ['mini-dungeon', '04_BUILDINGS/Modular Building Pieces'],
  ['mini-forest', '08_ENVIRONMENT/Trees'],
  ['mini-shop', '04_BUILDINGS/Shops'],
  ['furniture-kit', '06_FURNITURE'],
  ['food-kit', '07_FOOD/Prepared Meals'],
  ['nature-kit', '08_ENVIRONMENT'],
  ['survival-kit', '11_PROPS_RESOURCES/Tools'],
  ['castle-kit', '04_BUILDINGS/Castles'],
  ['city-kit-commercial', '04_BUILDINGS/Modern Buildings'],
  ['city-kit-suburban', '04_BUILDINGS/Houses'],
  ['city-kit-roads', '10_ROADS_INFRASTRUCTURE/Roads'],
  ['city-kit-industrial', '04_BUILDINGS/Industrial'],
  ['car-kit', '11_PROPS_RESOURCES/Vehicles'],
  ['racing-kit', '11_PROPS_RESOURCES/Vehicles'],
  ['weapon-pack', '03_MILITARY/Weapons'],
  ['blaster-kit', '03_MILITARY/Weapons'],
  ['tower-defense-kit', '04_BUILDINGS/Fortresses'],
  ['retro-fantasy-kit', '04_BUILDINGS/Medieval Buildings'],
  ['skyboxes', '14_LIGHTING_EFFECTS/Skyboxes'],
  ['skyboxes-space', '14_LIGHTING_EFFECTS/Skyboxes'],
  ['particle-pack', '14_LIGHTING_EFFECTS/Lighting Effects'],
  ['prototype-textures', '12_TEXTURES_MATERIALS/Surface Details'],
  ['medieval-rts', '04_BUILDINGS/Medieval Buildings'],
];

// ---------------------------------------------------------------------------
// Verification helpers
// ---------------------------------------------------------------------------
function glbInfo(buf) {
  if (buf.length < 20 || buf.toString('ascii', 0, 4) !== 'glTF') return { ok: false, reason: 'not a GLB (bad magic)' };
  const version = buf.readUInt32LE(4);
  const declared = buf.readUInt32LE(8);
  if (version !== 2) return { ok: false, reason: `GLB version ${version}` };
  if (declared !== buf.length) return { ok: false, reason: `GLB length ${declared} != ${buf.length}` };
  const chunkLen = buf.readUInt32LE(12);
  const chunkType = buf.toString('ascii', 16, 20);
  if (chunkType !== 'JSON') return { ok: false, reason: 'first chunk is not JSON' };
  let json;
  try {
    json = JSON.parse(buf.toString('utf8', 20, 20 + chunkLen));
  } catch (error) {
    return { ok: false, reason: `unreadable JSON chunk: ${error.message}` };
  }
  let triangles = 0;
  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives || []) {
      const count = prim.indices != null ? json.accessors?.[prim.indices]?.count : json.accessors?.[prim.attributes?.POSITION]?.count;
      if (count) triangles += Math.floor(count / 3);
    }
  }
  return {
    ok: true,
    triangles,
    meshes: (json.meshes || []).length,
    materials: (json.materials || []).length,
    textures: (json.images || []).length,
    animations: (json.animations || []).map((a) => a.name || 'unnamed'),
    extensions: json.extensionsUsed || [],
    generator: json.asset?.generator || '',
  };
}

function imageDimensions(buf) {
  if (buf.length > 24 && buf.toString('ascii', 1, 4) === 'PNG') {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    if (buf.toString('ascii', 12, 16) === 'VP8X') {
      return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    }
  }
  return {};
}

function audioInfo(buf, ext) {
  if (ext === '.wav' && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') {
    return { ok: true, channels: buf.readUInt16LE(22), sampleRate: buf.readUInt32LE(24) };
  }
  if (ext === '.ogg' && buf.toString('ascii', 0, 4) === 'OggS') return { ok: true };
  if (ext === '.mp3' && (buf.toString('ascii', 0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0))) return { ok: true };
  return { ok: false, reason: `unreadable ${ext} header` };
}

function hdrInfo(buf) {
  const head = buf.toString('ascii', 0, 64);
  if (!head.startsWith('#?')) return { ok: false, reason: 'not a Radiance HDR' };
  const m = head.match(/^#\?[^\n]*\n(?:#[^\n]*\n)*format=32[^\n]*\n\n(-?\d+) (-?\d+)/);
  return m ? { ok: true, width: Number(m[1]), height: Number(m[2]) } : { ok: true };
}

// ---------------------------------------------------------------------------
// Records and storage
// ---------------------------------------------------------------------------
const records = [];
const seen = new Map(); // sha256 -> record id
const duplicates = [];
const sourceLog = [];
let bankBytes = 0;
let stopped = false;
const nextId = new Map();

function makeId(prefix) {
  const n = (nextId.get(prefix) || 0) + 1;
  nextId.set(prefix, n);
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

const recordKey = (source, sourceId) => `${source}:${sourceId}`;
const known = new Set();

async function loadExisting() {
  try {
    const raw = JSON.parse(await readFile(`${INDEX}/assets.json`, 'utf8'));
    for (const rec of raw) {
      records.push(rec);
      for (const r of rec.files || []) if (r.sha256) seen.set(r.sha256, rec.asset_id);
      if (rec.source_id) known.add(recordKey(rec.source, rec.source_id));
      bankBytes += rec.bytes || 0;
    }
    return true;
  } catch {
    return false;
  }
}

async function save(data, dest) {
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, data);
}

async function fetchBuffer(url, { referer, allowHtml = false } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, ...(referer ? { Referer: referer } : {}) },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${res.statusText}`);
  const type = res.headers.get('content-type') || '';
  if (!allowHtml && type.includes('text/html')) throw new Error(`${url} -> unexpected HTML`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_FILE_BYTES) throw new Error(`${url} -> ${(buf.length / 1048576).toFixed(1)} MB exceeds per-file cap`);
  return buf;
}

async function writeAsset(relDir, name, buf) {
  const dir = path.join(BANK, relDir);
  await mkdir(dir, { recursive: true });
  const dest = path.join(dir, name);
  await writeFile(dest, buf);
  bankBytes += buf.length;
  return path.relative(BANK, dest);
}

function validate(relPath, buf) {
  const ext = path.extname(relPath).toLowerCase();
  if (ext === '.glb') return glbInfo(buf);
  if (['.png', '.jpg', '.jpeg', '.webp', '.bmp'].includes(ext)) {
    const dims = imageDimensions(buf);
    if (!dims.width) return { ok: false, reason: 'no readable image header' };
    return { ok: true, ...dims };
  }
  if (['.wav', '.ogg', '.mp3'].includes(ext)) return audioInfo(buf, ext);
  if (ext === '.hdr') return hdrInfo(buf);
  if (ext === '.gltf') {
    try {
      const json = JSON.parse(buf.toString('utf8'));
      return {
        ok: true,
        meshes: (json.meshes || []).length,
        materials: (json.materials || []).length,
        textures: (json.images || []).length,
        animations: (json.animations || []).map((a) => a.name || 'unnamed'),
        extensions: json.extensionsUsed || [],
      };
    } catch {
      return { ok: false, reason: 'unreadable glTF JSON' };
    }
  }
  if (ext === '.svg') {
    const text = buf.toString('utf8');
    return text.includes('<svg') ? { ok: true } : { ok: false, reason: 'no <svg> root' };
  }
  if (ext === '.txt' || ext === '.md' || ext === '.json' || ext === '.csv') return { ok: true };
  return { ok: true, unchecked: true };
}

function addRecord({ source, sourceId, title, creator, license, licenseUrl, attribution, pageUrl, downloadUrl, taxonomy, tags, kind, bytes, files, thumbnail, extra = {} }) {
  const key = recordKey(source, sourceId);
  if (known.has(key)) return null;
  known.add(key);
  const rec = {
    asset_id: makeId(source === '3dassets' ? 'D3A' : source === 'polyhaven' ? 'PLH' : source === 'ambientcg' ? 'ACG' : source === 'kenney' ? 'KNY' : 'GIT'),
    source,
    source_id: sourceId,
    name: title,
    category: taxonomy.split('/')[0],
    subcategory: taxonomy.split('/')[1] || '',
    creator: creator || 'Unknown',
    source_repository: pageUrl,
    download_url: downloadUrl,
    license,
    license_url: licenseUrl,
    attribution_required: Boolean(attribution),
    attribution_text: attribution || '',
    kind,
    tags: tags || [],
    files,
    bytes,
    formats: [...new Set(files.map((f) => path.extname(f.path).slice(1).toLowerCase()))],
    polygons: files.reduce((n, f) => n + (f.triangles || 0), 0) || '',
    textures: files.reduce((n, f) => n + (f.textures || 0), 0) || '',
    animations: files.flatMap((f) => f.animations || []),
    thumbnail: thumbnail || '',
    validation: files.every((f) => f.status === 'valid') ? 'valid' : 'partial',
    ...extra,
  };
  records.push(rec);
  for (const f of files) if (f.sha256) seen.set(f.sha256, rec.asset_id);
  return rec;
}

function touch(source, detail) {
  sourceLog.push({ source, at: new Date().toISOString(), ...detail });
}

// ---------------------------------------------------------------------------
// Source: 3dassets.dev — CC0 GLB models with a public discovery API
// ---------------------------------------------------------------------------
async function sync3dassets() {
  const api = 'https://3dassets.dev/api/v1';
  const perCategory = Number(process.env.BANK_3DASSETS_PER_CATEGORY || 26);
  // Category sweeps, then keyword sweeps that fill the thin parts of the
  // taxonomy (construction pieces, furniture, kitchen and workshop props).
  const targets = [
    ...['buildings', 'nature', 'characters', 'animals', 'props', 'food', 'weapons-tools', 'vehicles', 'roads-infrastructure', 'environments', 'effects-primitives', 'icons'].map((category) => ({ label: category, param: `category=${category}`, limit: perCategory })),
    ...['modular wall', 'door', 'window', 'staircase', 'roof', 'fence', 'bridge', 'ladder', 'shelf', 'wardrobe', 'stove', 'pot', 'workbench', 'barrel'].map((q) => ({ label: `q:${q}`, param: `q=${encodeURIComponent(q)}`, limit: 4 })),
  ];
  let downloaded = 0;
  let skipped = 0;

  for (const target of targets) {
    if (stopped) break;
    let list;
    try {
      const res = await fetch(`${api}/assets?${target.param}&limit=${target.limit}&sort=popular`, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`search ${res.status}`);
      list = (await res.json()).data || [];
    } catch (error) {
      touch('3dassets', { target: target.label, error: String(error.message) });
      continue;
    }
    for (const asset of list) {
      if (stopped) break;
      if (known.has(recordKey('3dassets', asset.id))) { skipped++; continue; }
      const size = asset.stats?.fileSize || 0;
      if (size && size > MAX_FILE_BYTES) continue;
      if (bankBytes + size > MAX_BYTES) { stopped = true; break; }
      try {
        const buf = await fetchBuffer(asset.cdnUrl);
        const info = glbInfo(buf);
        if (!info.ok) {
          touch('3dassets', { asset: asset.slug, rejected: info.reason });
          continue;
        }
        const digest = sha256(buf);
        if (seen.has(digest)) {
          duplicates.push({ source: '3dassets', source_id: asset.id, duplicate_of: seen.get(digest), reason: 'identical bytes' });
          continue;
        }
        const taxonomy = route3d(asset);
        const rel = await writeAsset(taxonomy, `${asset.slug}.glb`, buf);
        let thumb = '';
        if (asset.thumbnailUrl) {
          try {
            const tbuf = await fetchBuffer(asset.thumbnailUrl);
            thumb = await writeAsset(taxonomy, `${asset.slug}.thumb.webp`, tbuf);
          } catch {
            thumb = '';
          }
        }
        addRecord({
          source: '3dassets',
          sourceId: asset.id,
          title: asset.title,
          creator: asset.contributor?.name || asset.contributor?.username || '3dassets community',
          license: asset.license?.name || 'CC0 1.0 Universal',
          licenseUrl: asset.license?.url || 'https://creativecommons.org/publicdomain/zero/1.0/',
          attribution: asset.license?.attributionRequired ? asset.license?.attributionText : '',
          pageUrl: asset.url,
          downloadUrl: asset.cdnUrl,
          taxonomy,
          tags: (asset.tags || []).map((t) => t.title || t.slug),
          kind: 'model',
          bytes: buf.length,
          thumbnail: thumb,
          files: [
            {
              path: rel,
              bytes: buf.length,
              sha256: digest,
              status: 'valid',
              triangles: info.triangles,
              meshes: info.meshes,
              materials: info.materials,
              textures: info.textures,
              animations: info.animations,
              extensions: info.extensions,
              format: 'glb',
            },
          ],
          extra: { summary: asset.summary || '', ai_generated: Boolean(asset.aiGenerated), dimensions_m: (asset.stats?.sizeMeters || []).join(' x ') },
        });
        downloaded++;
      } catch (error) {
        touch('3dassets', { asset: asset.slug, error: String(error.message) });
      }
      await sleep(DELAY_MS);
    }
  }
  touch('3dassets', {
    downloaded,
    skipped_already_indexed: skipped,
    api: `${api}/assets`,
    license: 'CC0 1.0 Universal (per-asset licence recorded)',
    note: 'Fetched through the public discovery API; the CDN URL is immutable and cached, so each model is downloaded once.',
  });
}

// ---------------------------------------------------------------------------
// Source: Poly Haven — CC0 models, HDRIs and textures
// ---------------------------------------------------------------------------
async function syncPolyHaven() {
  const api = 'https://api.polyhaven.com';
  const modelsTarget = Number(process.env.BANK_POLYHAVEN_MODELS || 30);
  const hdriTarget = Number(process.env.BANK_POLYHAVEN_HDRIS || 12);
  let models = 0;
  let hdris = 0;

  if (!stopped) {
    try {
      const all = await (await fetch(`${api}/assets?t=models`, { headers: { 'User-Agent': UA } })).json();
      const ids = Object.keys(all)
        .filter((id) => (all[id].polycount || 0) > 0 && (all[id].polycount || 0) < 250000)
        .sort((a, b) => a.localeCompare(b));
      // Deterministic spread across the catalogue rather than the same 30 every
      // run: step through the sorted ids.
      const step = Math.max(1, Math.floor(ids.length / modelsTarget));
      for (let i = 0; i < ids.length && models < modelsTarget && !stopped; i += step) {
        const id = ids[i];
        if (known.has(recordKey('polyhaven', `model:${id}`))) continue;
        try {
          const files = await (await fetch(`${api}/files/${id}`, { headers: { 'User-Agent': UA } })).json();
          const res = ['1k', '2k', '4k'].find((r) => files.gltf?.[r]);
          if (!res) continue;
          const entry = files.gltf[res].gltf;
          const main = await fetchBuffer(entry.url);
          const folder = `${routePolyHaven(all[id], id)}/${id}`;
          const fileRecords = [];
          const written = [];
          const mainRel = await writeAsset(folder, `${id}.gltf`, main);
          fileRecords.push({ path: mainRel, bytes: main.length, sha256: sha256(main), status: 'valid', format: 'gltf' });
          written.push(['gltf', main, mainRel]);
          for (const [name, file] of Object.entries(entry.include || {})) {
            if (bankBytes > MAX_BYTES) { stopped = true; break; }
            const buf = await fetchBuffer(file.url);
            const relDir = path.dirname(path.join(folder, name));
            const rel = await writeAsset(relDir, path.basename(name), buf);
            written.push([path.basename(name), buf, rel]);
          }
          for (const [, buf, rel] of written.slice(1)) {
            const v = validate(rel, buf);
            fileRecords.push({
              path: rel,
              bytes: buf.length,
              sha256: sha256(buf),
              status: v.ok ? 'valid' : 'invalid',
              reason: v.reason,
              width: v.width,
              height: v.height,
              format: path.extname(rel).slice(1),
            });
          }
          const total = fileRecords.reduce((n, f) => n + f.bytes, 0);
          addRecord({
            source: 'polyhaven',
            sourceId: `model:${id}`,
            title: all[id].name || id,
            creator: Object.keys(all[id].authors || {}).join(', ') || 'Poly Haven',
            license: 'CC0 1.0 Universal',
            licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
            pageUrl: `https://polyhaven.com/a/${id}`,
            downloadUrl: entry.url,
            taxonomy: `${routePolyHaven(all[id], id)}/${id}`,
            tags: all[id].tags || [],
            kind: 'model',
            bytes: total,
            thumbnail: `https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=256`,
            files: fileRecords,
            extra: { resolution: res, polycount: all[id].polycount || '' },
          });
          models++;
        } catch (error) {
          touch('polyhaven', { model: id, error: String(error.message) });
        }
        await sleep(DELAY_MS);
      }
    } catch (error) {
      touch('polyhaven', { error: String(error.message) });
    }
  }

  if (!stopped) {
    try {
      const all = await (await fetch(`${api}/assets?t=hdris`, { headers: { 'User-Agent': UA } })).json();
      const ids = Object.keys(all).sort((a, b) => a.localeCompare(b));
      const step = Math.max(1, Math.floor(ids.length / hdriTarget));
      for (let i = 0; i < ids.length && hdris < hdriTarget && !stopped; i += step) {
        const id = ids[i];
        if (known.has(recordKey('polyhaven', `hdri:${id}`))) continue;
        try {
          const files = await (await fetch(`${api}/files/${id}`, { headers: { 'User-Agent': UA } })).json();
          const res = ['1k', '2k'].find((r) => files.hdri?.[r]?.hdr);
          if (!res) continue;
          const entry = files.hdri[res].hdr;
          if (bankBytes + entry.size > MAX_BYTES) { stopped = true; break; }
          const buf = await fetchBuffer(entry.url);
          const info = hdrInfo(buf);
          if (!info.ok) { touch('polyhaven', { hdri: id, rejected: info.reason }); continue; }
          const rel = await writeAsset('14_LIGHTING_EFFECTS/HDRI', `${id}_${res}.hdr`, buf);
          addRecord({
            source: 'polyhaven',
            sourceId: `hdri:${id}`,
            title: all[id].name || id,
            creator: Object.keys(all[id].authors || {}).join(', ') || 'Poly Haven',
            license: 'CC0 1.0 Universal',
            licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
            pageUrl: `https://polyhaven.com/a/${id}`,
            downloadUrl: entry.url,
            taxonomy: '14_LIGHTING_EFFECTS/HDRI',
            tags: all[id].tags || [],
            kind: 'hdri',
            bytes: buf.length,
            thumbnail: `https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=256`,
            files: [{ path: rel, bytes: buf.length, sha256: sha256(buf), status: 'valid', width: info.width, height: info.height, format: 'hdr' }],
            extra: { resolution: res },
          });
          hdris++;
        } catch (error) {
          touch('polyhaven', { hdri: id, error: String(error.message) });
        }
        await sleep(DELAY_MS);
      }
    } catch (error) {
      touch('polyhaven', { error: String(error.message) });
    }
  }
  touch('polyhaven', { models, hdris, api, license: 'CC0 1.0 Universal' });
}

function routePolyHaven(info, id) {
  const t = `${id} ${(info.tags || []).join(' ')} ${(info.categories || []).join(' ')}`.toLowerCase();
  if (any(t, ['chair', 'sofa', 'couch', 'stool', 'bench'])) return '06_FURNITURE/Chairs';
  if (any(t, ['table', 'desk'])) return '06_FURNITURE/Tables';
  if (any(t, ['furniture', 'shelf', 'cabinet', 'drawer', 'bed', 'lamp', 'vase', 'decor'])) return '06_FURNITURE';
  if (any(t, ['tree', 'plant', 'foliage', 'potted', 'bush'])) return '08_ENVIRONMENT/Trees';
  if (any(t, ['rock', 'stone', 'cliff', 'boulder'])) return '08_ENVIRONMENT/Rocks';
  if (any(t, ['food', 'fruit', 'bread', 'kitchen'])) return '07_FOOD';
  if (any(t, ['tool', 'crate', 'barrel', 'industrial', 'prop'])) return '11_PROPS_RESOURCES';
  if (any(t, ['weapon', 'gun', 'sword'])) return '03_MILITARY/Weapons';
  return '11_PROPS_RESOURCES';
}

// ---------------------------------------------------------------------------
// Source: ambientCG — CC0 PBR materials (1K JPG maps)
// ---------------------------------------------------------------------------
async function syncAmbientCG() {
  const target = Number(process.env.BANK_AMBIENTCG_MATERIALS || 28);
  let done = 0;
  let list = [];
  try {
    const res = await fetch('https://ambientcg.com/api/v2/full_json?type=Material&sort=popular&limit=120&include=downloadData', { headers: { 'User-Agent': UA } });
    list = (await res.json()).foundAssets || [];
  } catch (error) {
    touch('ambientcg', { error: String(error.message) });
    return;
  }
  const step = Math.max(1, Math.floor(list.length / target));
  for (let i = 0; i < list.length && done < target && !stopped; i += step) {
    const asset = list[i];
    if (known.has(recordKey('ambientcg', asset.assetId))) continue;
    const zips = asset.downloadFolders?.default?.downloadFiletypeCategories?.zip?.downloads || [];
    const zip = zips.find((z) => z.attribute === '1K-JPG') || zips.find((z) => /1K/.test(z.attribute));
    if (!zip || zip.size > 30 * 1024 * 1024) continue;
    if (bankBytes + zip.size > MAX_BYTES) { stopped = true; break; }
    const tmp = path.join(TMP, zip.fileName);
    try {
      const buf = await fetchBuffer(zip.downloadLink);
      await save(buf, tmp);
      const dir = routeACG(asset.assetId) + '/' + asset.assetId;
      const dest = path.join(BANK, dir);
      await mkdir(dest, { recursive: true });
      await run('unzip', ['-o', '-q', tmp, '-d', dest]);
      await rm(tmp, { force: true });
      // The zip also carries Blender/MaterialX/USD wrappers and a duplicate
      // DirectX normal map. The bank keeps the maps an engine actually binds.
      const keep = /(_Color|_NormalGL|_Roughness|_AmbientOcclusion|_Displacement|_Metalness|_Opacity|_Emissive)\.(jpg|jpeg|png)$/i;
      for (const name of await readdir(dest)) {
        if (!keep.test(name)) await rm(path.join(dest, name), { force: true });
      }
      const fileRecords = [];
      for (const name of await readdir(dest)) {
        const full = path.join(dest, name);
        const info = await stat(full);
        if (!info.isFile()) continue;
        const ext = path.extname(name).toLowerCase();
        if (!EXTENSIONS.has(ext)) continue;
        const data = await readFile(full);
        const v = validate(name, data);
        bankBytes += data.length;
        if (!v.ok) { duplicates.push({ source: 'ambientcg', source_id: asset.assetId, reason: `unreadable map ${name}: ${v.reason}` }); continue; }
        fileRecords.push({
          path: path.relative(BANK, full),
          bytes: data.length,
          sha256: sha256(data),
          status: 'valid',
          width: v.width,
          height: v.height,
          format: ext.slice(1),
        });
      }
      if (!fileRecords.length) continue;
      addRecord({
        source: 'ambientcg',
        sourceId: asset.assetId,
        title: asset.assetId,
        creator: 'ambientCG (Lennart Demes)',
        license: 'CC0 1.0 Universal',
        licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        pageUrl: `https://ambientcg.com/view?id=${asset.assetId}`,
        downloadUrl: zip.downloadLink,
        taxonomy: routeACG(asset.assetId),
        tags: (asset.tags || []).map((t) => (typeof t === 'string' ? t : t.tag || t.name)).filter(Boolean),
        kind: 'material',
        bytes: fileRecords.reduce((n, f) => n + f.bytes, 0),
        thumbnail: asset.previewImage?.url ? `https://ambientcg.com${asset.previewImage.url}` : '',
        files: fileRecords,
        extra: { resolution: '1K', maps: fileRecords.length },
      });
      done++;
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => {});
      touch('ambientcg', { material: asset.assetId, error: String(error.message) });
    }
    await sleep(DELAY_MS);
  }
  touch('ambientcg', { materials: done, license: 'CC0 1.0 Universal', note: '1K JPG PBR sets, extracted; the zip is removed after successful extraction.' });
}

// ---------------------------------------------------------------------------
// Source: Kenney — CC0 2D sprites, UI, tilesets and audio packs
// ---------------------------------------------------------------------------
async function syncKenney() {
  const cap = Number(process.env.BANK_KENNEY_PACKS || KENNEY_PACKS.length);
  let done = 0;
  let index = 0;
  for (const [slug, taxonomy] of KENNEY_PACKS) {
    if (stopped) break;
    if (done >= cap) break;
    index++;
    if (known.has(recordKey('kenney', slug))) { done++; continue; }
    try {
      const page = `https://kenney.nl/assets/${slug}`;
      const html = (await fetchBuffer(page, { allowHtml: true })).toString('utf8');
      const idMatch = html.match(/data-download-id='([^']+)'/);
      if (!idMatch) { touch('kenney', { pack: slug, error: 'no download id on page' }); continue; }
      const link = await (await fetch(`https://kenney.nl/download-link/${idMatch[1]}`, {
        headers: { 'User-Agent': UA, Referer: page, Accept: 'application/json' },
      })).json();
      if (!link.url) { touch('kenney', { pack: slug, error: 'download link unavailable' }); continue; }
      const zipBuf = await fetchBuffer(link.url, { referer: page });
      if (bankBytes + zipBuf.length > MAX_BYTES) {
        touch('kenney', { pack: slug, skipped: 'would exceed storage budget', size: zipBuf.length });
        stopped = true;
        break;
      }
      const tmp = path.join(TMP, `${slug}.zip`);
      await save(zipBuf, tmp);
      const dest = path.join(BANK, taxonomy, slug);
      await mkdir(dest, { recursive: true });
      await run('unzip', ['-o', '-q', tmp, '-d', dest]);
      await rm(tmp, { force: true });
      const fileRecords = [];
      const walk = async (dir) => {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) { await walk(full); continue; }
          const ext = path.extname(entry.name).toLowerCase();
          if (ext === '.zip') continue;
          const data = await readFile(full);
          if (!EXTENSIONS.has(ext)) continue;
          const v = validate(entry.name, data);
          bankBytes += data.length;
          fileRecords.push({
            path: path.relative(BANK, full),
            bytes: data.length,
            sha256: sha256(data),
            status: v.ok ? 'valid' : 'invalid',
            reason: v.reason,
            width: v.width,
            height: v.height,
            format: ext.slice(1),
          });
        }
      };
      await walk(dest);
      const raw = (html.match(/<title>([^<]+)</) || [, slug])[1].replace(/\s*&middot;.*$/, '').replace(/&amp;/g, '&').trim();
      const title = /pack$/i.test(raw) ? raw : `${raw} pack`;
      addRecord({
        source: 'kenney',
        sourceId: slug,
        title,
        creator: 'Kenney (kenney.nl)',
        license: 'CC0 1.0 Universal',
        licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        pageUrl: page,
        downloadUrl: link.url.split('?')[0],
        taxonomy,
        tags: slug.split('-'),
        kind: 'pack',
        bytes: fileRecords.reduce((n, f) => n + f.bytes, 0),
        thumbnail: '',
        files: fileRecords,
        extra: { pack: slug, file_count: fileRecords.length, ordering: index },
      });
      done++;
    } catch (error) {
      await rm(path.join(TMP, `${slug}.zip`), { force: true }).catch(() => {});
      touch('kenney', { pack: slug, error: String(error.message) });
    }
    await sleep(DELAY_MS * 2);
  }
  touch('kenney', { packs: done, license: 'CC0 1.0 Universal', note: 'Signed download links are requested per pack; the archive is extracted and then removed.' });
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
const esc = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function writeOutputs() {
  await mkdir(INDEX, { recursive: true });

  await save(JSON.stringify(records, null, 1), `${INDEX}/assets.json`);
  await save(JSON.stringify({ generated: new Date().toISOString(), duplicates }, null, 1), `${INDEX}/duplicates.json`);
  // Provenance is cumulative: a run that only touches one source must not erase
  // the acquisition history of the others.
  let history = [];
  try {
    const previous = JSON.parse(await readFile(`${INDEX}/provenance.json`, 'utf8'));
    history = previous.runs || previous.sources || [];
  } catch {
    history = [];
  }
  const touched = new Set(sourceLog.map((entry) => entry.source));
  const merged = [...history.filter((entry) => !touched.has(entry.source)), ...sourceLog]
    .sort((a, b) => String(a.at).localeCompare(String(b.at)))
    .slice(-200);
  // Per-source holdings are derived from the records themselves, so they stay
  // correct even for assets acquired before a run recorded its log entry.
  const holdings = {};
  for (const rec of records) {
    holdings[rec.source] = holdings[rec.source] || { source: rec.source, assets: 0, files: 0, bytes: 0, licenses: new Set(), creator_count: new Set() };
    const h = holdings[rec.source];
    h.assets++;
    h.files += (rec.files || []).length;
    h.bytes += rec.bytes || 0;
    h.licenses.add(rec.license);
    h.creator_count.add(rec.creator);
  }
  const holdingsList = Object.values(holdings).map((h) => ({
    ...h,
    licenses: [...h.licenses],
    creators: h.creator_count.size,
    creator_count: undefined,
    megabytes: Number((h.bytes / 1048576).toFixed(1)),
  }));
  await save(
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        policy: { licences: ['CC0 1.0', 'public domain'], excluded: ['CC BY-NC', 'CC BY-ND', 'CC BY-SA at ingest'], max_bank_bytes: MAX_BYTES },
        holdings: holdingsList,
        runs: merged,
      },
      null,
      1,
    ),
    `${INDEX}/provenance.json`,
  );

  // Every animation clip inside every model, so a game can find "walk forward"
  // without opening the files.
  const animationIndex = records.flatMap((rec) =>
    (rec.files || []).flatMap((file) =>
      (file.animations || []).map((clip) => ({ clip, asset_id: rec.asset_id, model: rec.name, path: file.path })),
    ),
  );
  await save(JSON.stringify(animationIndex, null, 1), `${INDEX}/animations.json`);

  const header = ['asset_id', 'name', 'category', 'subcategory', 'creator', 'source', 'source_page', 'download_url', 'license', 'attribution_required', 'file_path', 'formats', 'bytes', 'triangles', 'textures', 'animations', 'thumbnail', 'validation', 'sha256', 'tags'];
  const rows = [];
  for (const rec of records) {
    for (const file of rec.files || []) {
      rows.push([
        rec.asset_id, rec.name, rec.category, rec.subcategory, rec.creator, rec.source, rec.source_repository, rec.download_url,
        rec.license, rec.attribution_required ? 'yes' : 'no', file.path, (file.format || path.extname(file.path).slice(1)).toLowerCase(),
        file.bytes, file.triangles ?? '', file.textures ?? '', (file.animations || []).join('|'), rec.thumbnail, file.status || rec.validation,
        file.sha256 || '', (rec.tags || []).slice(0, 8).join('|'),
      ]);
    }
  }
  const csv = [header.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n') + '\n';
  await save(csv, `${INDEX}/catalog.csv`);

  // Full requested taxonomy, with live counts.
  const taxonomy = {};
  for (const [cat, subs] of Object.entries(TAXONOMY)) {
    taxonomy[cat] = Object.fromEntries(subs.map((sub) => [sub, records.filter((r) => r.category === cat && r.subcategory === sub).length]));
    const loose = records.filter((r) => r.category === cat && !subs.includes(r.subcategory)).length;
    if (loose) taxonomy[cat]._other = loose;
  }
  await save(JSON.stringify(taxonomy, null, 2), `${INDEX}/taxonomy.json`);

  // Per-category manifests so a folder can be read on its own.
  const byCategory = new Map();
  for (const rec of records) {
    if (!byCategory.has(rec.category)) byCategory.set(rec.category, []);
    byCategory.get(rec.category).push(rec);
  }
  for (const [cat, list] of byCategory) {
    await save(
      JSON.stringify(
        {
          category: cat,
          assets: list.length,
          files: list.reduce((n, r) => n + (r.files || []).length, 0),
          bytes: list.reduce((n, r) => n + (r.bytes || 0), 0),
          subcategories: [...new Set(list.map((r) => r.subcategory))].sort(),
          items: list.map((r) => ({ asset_id: r.asset_id, name: r.name, subcategory: r.subcategory, kind: r.kind, license: r.license, files: (r.files || []).length, bytes: r.bytes, thumbnail: r.thumbnail })),
        },
        null,
        1,
      ),
      `${BANK}/${cat}/manifest.json`,
    );
  }

  // Snapshot report.
  const totalBytes = records.reduce((n, r) => n + (r.bytes || 0), 0);
  const totalFiles = records.reduce((n, r) => n + (r.files || []).length, 0);
  const bySource = {};
  for (const rec of records) {
    bySource[rec.source] = bySource[rec.source] || { assets: 0, bytes: 0 };
    bySource[rec.source].assets++;
    bySource[rec.source].bytes += rec.bytes || 0;
  }
  const fmt = (b) => `${(b / 1048576).toFixed(1)} MB`;
  const report = [
    '# Asset memory bank snapshot',
    '',
    `Generated ${new Date().toISOString()} by \`tools/asset-bank/build-assets.mjs\`.`,
    '',
    `- **${records.length}** indexed assets in **${totalFiles}** files (${fmt(totalBytes)})`,
    `- Storage budget: ${fmt(MAX_BYTES)}${stopped ? ' — **budget reached, acquisition stopped**' : ''}`,
    `- Duplicates rejected: ${duplicates.length}`,
    '',
    '## By source',
    '',
    '| Source | Assets | Size | Licence |',
    '| --- | ---: | ---: | --- |',
    ...Object.entries(bySource).map(([s, v]) => `| ${s} | ${v.assets} | ${fmt(v.bytes)} | CC0 1.0 |`),
    '',
    '## By category',
    '',
    '| Category | Assets | Files | Subcategories |',
    '| --- | ---: | ---: | --- |',
    ...Object.entries(taxonomy).map(([cat, subs]) => {
      const list = byCategory.get(cat) || [];
      return `| \`${cat}\` | ${list.length} | ${list.reduce((n, r) => n + (r.files || []).length, 0)} | ${Object.keys(subs).filter((k) => k !== '_other').length} |`;
    }),
    '',
    '## This run',
    '',
    ...sourceLog.map((s) => `- \`${s.source}\`: ${Object.entries(s).filter(([k]) => !['source', 'at'].includes(k)).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ')}`),
  ].join('\n');
  await save(report + '\n', 'reports/asset-bank-snapshot.md');

  // Bank README.
  const readme = [
    '# Asset memory bank',
    '',
    'Permanent, reusable game-development asset warehouse. These are **actual files**',
    '(`.glb`, `.gltf`, PBR map sets, sprites, HUD art, audio, HDRIs), verified after',
    'download and indexed — not links.',
    '',
    `**${records.length} assets · ${totalFiles} files · ${fmt(totalBytes)}** — all CC0 1.0`,
    '(public domain): free for commercial use, no attribution required.',
    '',
    'Start at `MEMORY_INDEX/catalog.csv` (one row per file: licence, creator, source',
    'page, format, size, triangles, validation, sha256) or',
    '`MEMORY_INDEX/assets.json` (one record per asset with all its maps). Each',
    'category folder also carries a `manifest.json` so it can be read alone.',
    '',
    '| Category | Assets | Files | Size |',
    '| --- | ---: | ---: | ---: |',
    ...Object.keys(TAXONOMY).map((cat) => {
      const list = byCategory.get(cat) || [];
      return `| \`${cat}\` | ${list.length} | ${list.reduce((n, r) => n + (r.files || []).length, 0)} | ${fmt(list.reduce((n, r) => n + (r.bytes || 0), 0))} |`;
    }),
    '',
    '## Sources',
    '',
    '| Source | What is taken | Licence |',
    '| --- | --- | --- |',
    '| [3dassets.dev](https://3dassets.dev) | web-optimised GLB models across all categories | CC0 1.0 |',
    '| [Poly Haven](https://polyhaven.com) | glTF models (1K textures) and HDRIs | CC0 1.0 |',
    '| [ambientCG](https://ambientcg.com) | 1K JPG PBR material sets | CC0 1.0 |',
    '| [Kenney](https://kenney.nl/assets) | sprites, tilesets, UI/HUD, icons, audio packs | CC0 1.0 |',
    '',
    'Quaternius, Mixamo and the larger GitHub kits are deliberately **not** mirrored:',
    'Quaternius and the big kits are already in `graphics-library/`, Mixamo animations',
    'may not be redistributed, and `fps-buildings-env-kit` alone is 564 MB. See',
    '`MEMORY_INDEX/provenance.json` for the full acquisition log.',
    '',
    '## Adding more',
    '',
    '```bash',
    'node tools/asset-bank/build-assets.mjs                    # every source',
    'node tools/asset-bank/build-assets.mjs --source=kenney    # one source',
    'BANK_MAX_BYTES=900000000 node tools/asset-bank/build-assets.mjs',
    '```',
    '',
    'Runs are idempotent: an asset is keyed by source id, files are hashed with',
    'SHA-256, and identical bytes are rejected rather than stored twice. The bank',
    'stops cleanly at `BANK_MAX_BYTES` (620 MB by default) so it never grows past',
    'what GitHub is comfortable holding.',
  ].join('\n');
  await save(readme + '\n', `${BANK}/README.md`);

  return { records: records.length, files: totalFiles, bytes: totalBytes, animations: animationIndex.length, stopped };
}

// ---------------------------------------------------------------------------
async function main() {
  await mkdir(TMP, { recursive: true });
  await mkdir(INDEX, { recursive: true });
  const resumed = await loadExisting();
  if (resumed) console.log(`resume: ${records.length} assets, ${(bankBytes / 1048576).toFixed(1)} MB already indexed`);

  if (!args.has('index-only')) {
    if (having('3dassets')) await sync3dassets();
    if (having('polyhaven')) await syncPolyHaven();
    if (having('ambientcg')) await syncAmbientCG();
    if (having('kenney')) await syncKenney();
  }

  await rm(TMP, { recursive: true, force: true });
  const summary = await writeOutputs();
  console.log(
    `bank: ${summary.records} assets, ${summary.files} files, ${summary.animations} animation clips, ${(summary.bytes / 1048576).toFixed(1)} MB${summary.stopped ? ' (storage budget reached)' : ''}`,
  );
  for (const entry of sourceLog) console.log(' ', JSON.stringify(entry));
}

await main();
