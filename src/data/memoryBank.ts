/**
 * Client for the live Graphics Command Center reference library ("memory bank").
 *
 * Public read access needs no key. If a key is ever required, it must be supplied
 * at runtime (GCC.configure / window.GCC) — never written into this repository.
 *
 * Endpoints used:
 *   GET /api/stats
 *   GET /api/search?q&category&provider&color&minLongEdge&limit&offset
 *   GET /api/random?n
 *   GET /api/asset/:id
 */

export const MEMORY_BANK_ORIGIN = 'https://site-d460edd452c14327949ad468417abf82.freebuff.page';

export interface PaletteSwatch {
  hex: string;
  share: number;
}

export interface ReferenceRecord {
  id: string;
  provider: string;
  title: string;
  category: string;
  license: string;
  licenseClass: string;
  commercialUse: string;
  licenseUrl: string;
  attribution: string;
  width: number;
  height: number;
  previewUrl: string;
  pageUrl: string;
  palette: PaletteSwatch[];
  keywords?: string[];
  hueBucket?: number;
}

export interface ReferenceSearchResponse {
  total: number;
  count: number;
  offset: number;
  limit: number;
  records: ReferenceRecord[];
  library: string;
  licencePolicy: string;
}

export interface BankStats {
  total: number;
  highRes: number;
  analyzed: number;
  updatedAt: number;
  byProvider: Record<string, number>;
  byCategory: Record<string, number>;
  byLicense: Record<string, number>;
}

export interface ReferenceQuery {
  q?: string;
  category?: string;
  provider?: string;
  color?: string;
  minLongEdge?: number;
  limit?: number;
  offset?: number;
}

const DEFAULT_TIMEOUT = 9000;

async function request<T>(path: string, params: Record<string, string | number | undefined>, origin: string): Promise<T> {
  const url = new URL(path, origin);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
  try {
    const response = await fetch(url.toString(), {
      headers: { accept: 'application/json' },
      signal: controller.signal
    });
    const body = (await response.json()) as T & { error?: string; message?: string };
    if (!response.ok) {
      throw new Error(body.error ?? body.message ?? `Library request failed (${response.status})`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export async function searchReferences(
  query: ReferenceQuery,
  origin: string = MEMORY_BANK_ORIGIN
): Promise<ReferenceSearchResponse> {
  return request<ReferenceSearchResponse>('/api/search', { ...query }, origin);
}

export async function fetchBankStats(origin: string = MEMORY_BANK_ORIGIN): Promise<BankStats> {
  return request<BankStats>('/api/stats', {}, origin);
}

export async function randomReferences(count: number, origin: string = MEMORY_BANK_ORIGIN): Promise<{ count: number; records: ReferenceRecord[] }> {
  return request('/api/random', { n: count }, origin);
}

export function dominantSwatch(record: ReferenceRecord | null | undefined): string | null {
  if (!record?.palette?.length) return null;
  return [...record.palette].sort((a, b) => b.share - a.share)[0]?.hex ?? null;
}

/** A readable attribution line for a record, honouring CC BY requirements. */
export function attributionLine(record: ReferenceRecord): string {
  const author = record.attribution?.trim() || record.provider;
  return `${record.title} — ${author} (${record.license})`;
}

/** Categories that are actually useful for grounding the island's look. */
export const GAME_REFERENCE_CATEGORIES = [
  'tex-wood', 'tex-stone', 'tex-dirt', 'tex-metal', 'tex-fabric', 'tex-brick', 'tex-leather',
  'rocks-cliffs', 'trees', 'grass-plants', 'desert-sand', 'snow-ice', 'water', 'clouds', 'fog',
  'fire', 'smoke', 'houses', 'walls', 'floors', 'interiors', 'furniture', 'windows-doors',
  'tools-signs', 'weapons', 'helmets-armor', 'clothing-general', 'uniforms', 'human-portrait',
  'human-skin', 'human-face', 'human-hands', 'animals-wild', 'animals-domestic', 'season-autumn',
  'season-spring', 'season-summer', 'season-winter', 'wound-cut'
];
