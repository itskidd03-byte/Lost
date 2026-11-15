// Source adapters. Every adapter yields *candidates* — nothing is downloaded
// here. build-assets.mjs fetches, validates and records provenance.
//
// Only sources whose terms allow permanent storage in this repository are used:
//   Poly Haven        CC0 1.0
//   Wikimedia Commons public domain / CC0 / CC BY (attribution recorded)
//   The Met           Open Access CC0 (isPublicDomain must be true)
//   Art Institute     public domain (is_public_domain must be true)
// The existing bank policy excludes CC BY-SA, NC and ND, so that filter is
// applied here too.

import { getJson, throttles, titleCase } from './lib.mjs';

const stripHtml = (s) =>
  String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// ---------------------------------------------------------------- Wikimedia
const COMMONS_OK = /^(public domain|pd-|cc0|cc by(?!-sa)|no restrictions)/i;

export function licenceAccepted(name) {
  const n = String(name || '').trim();
  if (!n) return false;
  if (/sa|nc|nd/i.test(n)) return false;
  return COMMONS_OK.test(n);
}

export async function commonsSearch(query, { limit = 50, offset = 0 } = {}) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2' +
    '&generator=search&gsrnamespace=6&gsrlimit=' +
    limit +
    '&gsroffset=' +
    offset * limit +
    '&gsrsearch=' +
    encodeURIComponent(`${query} filetype:bitmap`) +
    '&prop=imageinfo&iiprop=url%7Csize%7Cextmetadata&iiurlwidth=960';

  const data = await throttles.commons.run(() => getJson(url, { tries: 5 }));
  const pages = data?.query?.pages || [];
  const out = [];

  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    const meta = info.extmetadata || {};
    const licence = stripHtml(meta.LicenseShortName?.value);
    if (!licenceAccepted(licence)) continue;
    if (!info.thumburl && !info.url) continue;
    if ((info.width || 0) < 760 || (info.height || 0) < 560) continue;

    out.push({
      source: 'wikimedia_commons',
      source_id: `commons:${page.pageid}`,
      source_url: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
      image_url: info.thumburl || info.url,
      title: stripHtml(String(page.title || '').replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '')),
      width: info.thumbwidth || info.width,
      height: info.thumbheight || info.height,
      license: licence,
      license_url: stripHtml(meta.LicenseUrl?.value) || 'https://commons.wikimedia.org/wiki/Commons:Licensing',
      creator: stripHtml(meta.Artist?.value) || 'Wikimedia Commons contributor',
      credit: stripHtml(meta.Credit?.value),
    });
  }
  return out;
}

// ---------------------------------------------------------------------- Met
export async function metSearch(query, { limit = 40, offset = 0 } = {}) {
  const search = await throttles.met.run(() =>
    getJson(
      'https://collectionapi.metmuseum.org/public/collection/v1.1/search?' +
        new URLSearchParams({ q: query, hasImages: 'true', limit: String(limit), offset: String(offset) }),
      { tries: 4 },
    ),
  );
  const ids = (search?.objectIDs || []).filter(Boolean);
  const out = [];
  for (const id of ids) {
    if (out.length >= limit) break;
    let obj;
    try {
      obj = await throttles.met.run(() =>
        getJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`, { tries: 2 }),
      );
    } catch {
      continue;
    }
    if (!obj || obj.isPublicDomain !== true) continue;
    if (!obj.primaryImageSmall) continue;
    out.push({
      source: 'met_museum',
      source_id: `met:${obj.objectID}`,
      source_url: obj.objectURL || `https://www.metmuseum.org/art/collection/search/${obj.objectID}`,
      image_url: obj.primaryImageSmall,
      title: stripHtml(obj.title) || titleCase(query),
      width: 0,
      height: 0, // measured after download
      license: 'CC0 1.0 (The Met Open Access)',
      license_url: 'https://www.metmuseum.org/about-the-met/policies-and-documents/open-access',
      creator: stripHtml(obj.artistDisplayName) || 'Unknown',
      credit: stripHtml(obj.creditLine),
      extra_tags: [obj.objectName, obj.classification, obj.medium, obj.culture, obj.department]
        .map(stripHtml)
        .filter(Boolean),
    });
  }
  return out;
}

// ------------------------------------------------------------ Art Institute
export async function articSearch(query, { limit = 40, page = 1 } = {}) {
  const fields =
    'id,title,image_id,is_public_domain,artist_display,date_display,department_title,classification_title,style_title';
  const data = await throttles.artic.run(() =>
    getJson(
      'https://api.artic.edu/api/v1/artworks/search?' +
        new URLSearchParams({ q: query, limit: String(limit), page: String(page), fields }),
      { tries: 4 },
    ),
  );
  const out = [];
  for (const a of data?.data || []) {
    if (a.is_public_domain !== true || !a.image_id) continue;
    out.push({
      source: 'art_institute_chicago',
      source_id: `artic:${a.id}`,
      source_url: `https://www.artic.edu/artworks/${a.id}`,
      image_url: `https://www.artic.edu/iiif/2/${a.image_id}/full/1000,/0/default.jpg`,
      title: stripHtml(a.title) || titleCase(query),
      width: 1000,
      height: 0,
      license: 'Public domain (Art Institute of Chicago)',
      license_url: 'https://www.artic.edu/open-access/open-access-images',
      creator: stripHtml(a.artist_display) || 'Unknown',
      credit: stripHtml(a.department_title),
      extra_tags: [a.classification_title, a.style_title, a.department_title].map(stripHtml).filter(Boolean),
    });
  }
  return out;
}

// --------------------------------------------------------------- Poly Haven
let polyHavenCache = null;

export async function polyHavenAssets() {
  if (!polyHavenCache) {
    const data = await getJson('https://api.polyhaven.com/assets?t=textures', { tries: 5 });
    polyHavenCache = Object.entries(data).map(([id, meta]) => ({ id, ...meta }));
  }
  return polyHavenCache;
}

export async function polyHavenTextures(categories, { exclude = new Set(), wanted = 75 } = {}) {
  const all = await polyHavenAssets();
  const wantedCats = new Set(categories);
  const pool = all.filter(
    (a) => !exclude.has(a.id) && (a.categories || []).some((c) => wantedCats.has(c)),
  );
  // Prefer assets with an explicit matching category over generic outdoor/indoor.
  pool.sort((a, b) => {
    const score = (x) => (x.categories || []).filter((c) => wantedCats.has(c)).length;
    return score(b) - score(a) || a.id.localeCompare(b.id);
  });

  const out = [];
  for (const asset of pool.slice(0, wanted)) {
    let files;
    try {
      files = await throttles.polyhaven.run(() => getJson(`https://api.polyhaven.com/files/${asset.id}`, { tries: 3 }));
    } catch {
      continue;
    }
    const diffuse = files?.Diffuse?.['1k']?.jpg?.url || files?.Diffuse?.['2k']?.jpg?.url;
    if (!diffuse) continue;
    out.push({
      source: 'poly_haven',
      source_id: `polyhaven:${asset.id}`,
      source_url: `https://polyhaven.com/a/${asset.id}`,
      image_url: diffuse,
      title: asset.name || titleCase(asset.id),
      width: 1024,
      height: 1024,
      license: 'CC0 1.0',
      license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      creator: Object.keys(asset.authors || {}).join(', ') || 'Poly Haven',
      credit: 'Poly Haven (CC0)',
      extra_tags: (asset.categories || []).slice(0, 4).concat(asset.tags || []).slice(0, 4),
    });
  }
  return out;
}
