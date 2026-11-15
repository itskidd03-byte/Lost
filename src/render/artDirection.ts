/**
 * Art direction grounded in the live reference library.
 *
 * For each material the game renders (thatch, wood, stone, metal, fabric, soil,
 * sand, foliage, skin) we ask the memory bank for references colour-matched to a
 * target hue, take the dominant swatch from the best matching record, and keep the
 * record itself for attribution. The result is cached locally so the game keeps a
 * coherent palette offline; baked fallbacks guarantee it always renders.
 */
import {
  MEMORY_BANK_ORIGIN,
  attributionLine,
  dominantSwatch,
  fetchBankStats,
  searchReferences,
  type BankStats,
  type ReferenceRecord
} from '../data/memoryBank';

export type MaterialKey = 'thatch' | 'wood' | 'stone' | 'metal' | 'fabric' | 'soil' | 'sand' | 'foliage' | 'skin';

export const MATERIAL_LABELS: Record<MaterialKey, string> = {
  thatch: 'Thatch & reeds',
  wood: 'Timber',
  stone: 'Stone & brick',
  metal: 'Iron & tools',
  fabric: 'Cloth & leather',
  soil: 'Earth & mud',
  sand: 'Sand & salt',
  foliage: 'Foliage',
  skin: 'Skin'
};

interface MaterialSpec {
  /** Query colour the palette should sit near. */
  color: string;
  /** Preferred categories, best first. */
  categories: string[];
  /** Baked colour used when the library is unreachable. */
  fallback: string;
  /** Readability clamp for lightness/saturation (0..1). */
  lightness: [number, number];
  saturation: [number, number];
}

const SPECS: Record<MaterialKey, MaterialSpec> = {
  thatch: { color: '#b99a5b', categories: ['grass-plants', 'season-autumn', 'tex-fabric'], fallback: '#b99a5b', lightness: [0.3, 0.5], saturation: [0.2, 0.55] },
  wood: { color: '#7a5a38', categories: ['tex-wood', 'bark-roots', 'floors', 'furniture'], fallback: '#7a5a38', lightness: [0.16, 0.4], saturation: [0.15, 0.55] },
  stone: { color: '#8d8d86', categories: ['tex-stone', 'rocks-cliffs', 'walls', 'tex-brick'], fallback: '#8d8d86', lightness: [0.22, 0.52], saturation: [0.02, 0.18] },
  metal: { color: '#6a6f76', categories: ['tex-metal', 'weapons', 'helmets-armor', 'tools-signs'], fallback: '#6a6f76', lightness: [0.2, 0.45], saturation: [0.02, 0.22] },
  fabric: { color: '#9a4a3a', categories: ['tex-fabric', 'clothing-general', 'uniforms', 'stitching', 'tex-leather'], fallback: '#9a4a3a', lightness: [0.2, 0.45], saturation: [0.15, 0.5] },
  soil: { color: '#5b4632', categories: ['tex-dirt', 'desert-sand', 'floors'], fallback: '#5b4632', lightness: [0.14, 0.34], saturation: [0.1, 0.4] },
  sand: { color: '#d6bd80', categories: ['desert-sand', 'tex-dirt'], fallback: '#d6bd80', lightness: [0.45, 0.72], saturation: [0.1, 0.4] },
  foliage: { color: '#2f5631', categories: ['trees', 'grass-plants', 'season-spring'], fallback: '#2f5631', lightness: [0.14, 0.32], saturation: [0.18, 0.45] },
  skin: { color: '#c99a74', categories: ['human-skin', 'human-face', 'human-portrait'], fallback: '#c99a74', lightness: [0.3, 0.62], saturation: [0.15, 0.42] }
};

export interface MaterialChoice {
  key: MaterialKey;
  hex: string;
  source: ReferenceRecord | null;
  adopted: boolean;
}

export type ArtDirectionStatus = 'idle' | 'loading' | 'live' | 'cached' | 'offline';

interface CachePayload {
  savedAt: number;
  materials: Record<MaterialKey, { hex: string; source: ReferenceRecord | null; adopted?: boolean }>;
  stats: BankStats | null;
}

const CACHE_KEY = 'kotfi.artdirection.v1';
/** Adopted palettes live here forever: clearing the cache or turning the design
 * team off never reverts them to the baked base look. */
const PERMANENT_KEY = 'kotfi.artdirection.permanent.v1';
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const MATERIAL_KEYS = Object.keys(SPECS) as MaterialKey[];

export class ArtDirection {
  version = 0;
  status: ArtDirectionStatus = 'idle';
  stats: BankStats | null = null;
  error: string | null = null;
  choices: Record<MaterialKey, MaterialChoice>;
  permanent: Partial<Record<MaterialKey, { hex: string; source: ReferenceRecord | null; at: number }>> = {};

  constructor() {
    this.choices = {} as Record<MaterialKey, MaterialChoice>;
    for (const key of MATERIAL_KEYS) {
      this.choices[key] = { key, hex: SPECS[key].fallback, source: null, adopted: false };
    }
    this.restorePermanent();
    this.restore();
  }

  /** Adopted upgrades survive restarts, cache expiry and the graphics team being switched off. */
  isPermanent(key: MaterialKey): boolean {
    return !!this.permanent[key];
  }

  permanentCount(): number {
    return Object.keys(this.permanent).length;
  }

  restorePermanent(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(PERMANENT_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw) as { materials?: Record<string, { hex: string; source: ReferenceRecord | null; at?: number }> };
      if (!payload?.materials) return;
      for (const key of MATERIAL_KEYS) {
        const entry = payload.materials[key];
        if (!entry?.hex) continue;
        this.permanent[key] = { hex: entry.hex, source: entry.source ?? null, at: entry.at ?? 0 };
        this.choices[key] = { key, hex: entry.hex, source: entry.source ?? null, adopted: true };
      }
      this.version++;
    } catch {
      // A corrupt vault must never stop the island rendering.
    }
  }

  private persistPermanent(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(PERMANENT_KEY, JSON.stringify({ materials: this.permanent }));
    } catch {
      // Private mode or a full quota: the permanent palette still holds this session.
    }
  }

  get labels(): Record<MaterialKey, string> {
    return MATERIAL_LABELS;
  }

  spec(key: MaterialKey): MaterialSpec {
    return SPECS[key];
  }

  hex(key: MaterialKey): string {
    return this.choices[key].hex;
  }

  /** THREE.js-ready integer colour. */
  color(key: MaterialKey): number {
    return parseInt(this.hex(key).replace('#', ''), 16);
  }

  /** Blend a faction or character colour toward the referenced material. */
  blend(colorHex: number, key: MaterialKey, amount = 0.45): number {
    const base = hexToRgb(`#${colorHex.toString(16).padStart(6, '0')}`);
    const tint = hexToRgb(this.hex(key));
    const mix = (a: number, b: number) => Math.round(a * (1 - amount) + b * amount);
    return (mix(base.r, tint.r) << 16) | (mix(base.g, tint.g) << 8) | mix(base.b, tint.b);
  }

  attributions(): ReferenceRecord[] {
    const seen = new Set<string>();
    const out: ReferenceRecord[] = [];
    for (const key of MATERIAL_KEYS) {
      const source = this.choices[key].source;
      if (!source || seen.has(source.id)) continue;
      seen.add(source.id);
      out.push(source);
    }
    return out;
  }

  attributionText(record: ReferenceRecord): string {
    return attributionLine(record);
  }

  /** Query the live library for every material. Never throws. */
  async load(origin: string = MEMORY_BANK_ORIGIN, force = false): Promise<void> {
    if (this.status === 'loading') return;
    // A cached palette is used immediately but still refreshed from the live library.
    if (!force && this.status === 'live') return;
    this.status = 'loading';
    this.error = null;
    try {
      const [stats, results] = await Promise.all([
        fetchBankStats(origin).catch(() => null),
        Promise.all(MATERIAL_KEYS.map(async (key) => {
          const spec = SPECS[key];
          try {
            const response = await searchReferences({ color: spec.color, limit: 14 }, origin);
            let match = pickRecord(response.records ?? [], spec.categories);
            // Colour matching alone can surface the wrong kind of thing (a sky for
            // "metal"), so if no preferred category matched, ask for that category
            // directly and take its best-palette record.
            if (!match || !spec.categories.includes(match.category)) {
              for (const category of spec.categories) {
                const byCategory = await searchReferences({ category, limit: 8 }, origin).catch(() => null);
                const candidate = closestTo(
                  byCategory?.records ?? [],
                  spec.color,
                  (record) => record.category === category
                );
                if (candidate) {
                  match = candidate;
                  break;
                }
              }
            }
            return { key, record: match };
          } catch {
            return { key, record: null };
          }
        }))
      ]);
      let found = 0;
      for (const { key, record } of results) {
        if (this.permanent[key]) {
          found++;
          continue;
        }
        if (!record) continue;
        found++;
        const swatch = dominantSwatch(record) ?? SPECS[key].fallback;
        this.choices[key] = {
          key,
          hex: groundedHex(swatch, SPECS[key]),
          source: record,
          adopted: false
        };
      }
      this.stats = stats;
      if (found === 0) {
        this.status = 'offline';
        this.error = 'The reference library returned no usable records. Using baked palettes.';
      } else {
        this.status = 'live';
        this.version++;
        this.persist();
      }
    } catch (error) {
      this.status = 'offline';
      this.error = error instanceof Error ? error.message : 'The reference library is unreachable.';
    }
  }

  /** Manually adopt a record from the browse panel for one material. */
  adopt(key: MaterialKey, record: ReferenceRecord): void {
    const swatch = dominantSwatch(record) ?? SPECS[key].fallback;
    const hex = groundedHex(swatch, SPECS[key]);
    this.choices[key] = {
      key,
      hex,
      source: record,
      adopted: true
    };
    this.permanent[key] = { hex, source: record, at: Date.now() };
    this.persistPermanent();
    this.version++;
    this.persist();
  }

  restore(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw) as CachePayload;
      if (!payload?.materials) return;
      if (Date.now() - payload.savedAt > CACHE_MAX_AGE) return;
      for (const key of MATERIAL_KEYS) {
        if (this.permanent[key]) continue;
        const entry = payload.materials[key];
        if (!entry?.hex) continue;
        this.choices[key] = { key, hex: entry.hex, source: entry.source ?? null, adopted: !!entry.adopted };
      }
      this.stats = payload.stats ?? null;
      this.status = 'cached';
      this.version++;
    } catch {
      // Corrupt cache is not fatal.
    }
  }

  persist(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const payload: CachePayload = {
        savedAt: Date.now(),
        materials: Object.fromEntries(MATERIAL_KEYS.map((key) => {
          const choice = this.choices[key];
          return [key, { hex: choice.hex, source: choice.source, adopted: choice.adopted }];
        })) as CachePayload['materials'],
        stats: this.stats
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {
      // Storage full or blocked: the palette still works for this session.
    }
  }
}

function pickRecord(records: ReferenceRecord[], categories: string[]): ReferenceRecord | null {
  if (!records.length) return null;
  for (const category of categories) {
    const match = records.find((record) => record.category === category && record.palette?.length);
    if (match) return match;
  }
  return records.find((record) => record.palette?.length) ?? records[0] ?? null;
}

/** Among acceptable records, prefer the one whose dominant colour is closest to the role. */
function closestTo(records: ReferenceRecord[], targetHex: string, accept: (record: ReferenceRecord) => boolean): ReferenceRecord | null {
  const pool = records.filter((record) => record.palette?.length && accept(record));
  const fallbackPool = pool.length ? pool : records.filter((record) => record.palette?.length);
  const target = hexToRgb(targetHex);
  let best: ReferenceRecord | null = null;
  let bestDistance = Infinity;
  for (const record of fallbackPool) {
    const swatch = dominantSwatch(record);
    if (!swatch) continue;
    const rgb = hexToRgb(swatch);
    const distance = Math.hypot(rgb.r - target.r, rgb.g - target.g, rgb.b - target.b);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = record;
    }
  }
  return best;
}

interface RGB { r: number; g: number; b: number }

function hexToRgb(hex: string): RGB {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value.slice(0, 6);
  const int = parseInt(full, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;
  if (max === rn) hue = ((gn - bn) / delta + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) hue = ((bn - rn) / delta + 2) / 6;
  else hue = ((rn - gn) / delta + 4) / 6;
  return [hue, saturation, lightness];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  let r = l;
  let g = l;
  let b = l;
  if (s !== 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Keep referenced swatches recognisable but readable in-game. */
export function normalizeHex(hex: string, lightnessRange: [number, number], saturationRange: [number, number]): string {
  const { r, g, b } = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const clampedL = Math.min(lightnessRange[1], Math.max(lightnessRange[0], l));
  const clampedS = Math.min(saturationRange[1], Math.max(saturationRange[0], s));
  return hslToHex(h, clampedS, clampedL);
}

/**
 * Derived from a real reference, then harmonised toward the material's role so a
 * blue-lit photograph cannot turn the forest blue. Hue may shift; value and
 * chroma still come from the photographed material.
 */
function groundedHex(swatch: string, spec: MaterialSpec): string {
  const { r, g, b } = hexToRgb(swatch);
  const [hue, saturation, lightness] = rgbToHsl(r, g, b);
  const target = hexToRgb(spec.color);
  const [targetHue] = rgbToHsl(target.r, target.g, target.b);
  const difference = Math.abs(((hue - targetHue + 0.5) % 1 + 1) % 1 - 0.5);
  const harmonised = difference > 0.09
    ? targetHue + Math.sign(((hue - targetHue + 0.5) % 1 + 1) % 1 - 0.5) * Math.min(0.03, difference * 0.15)
    : hue;
  const clampedL = Math.min(spec.lightness[1], Math.max(spec.lightness[0], lightness));
  const clampedS = Math.min(spec.saturation[1], Math.max(spec.saturation[0], saturation));
  return hslToHex((harmonised + 1) % 1, clampedS, clampedL);
}

export const artDirection = new ArtDirection();
