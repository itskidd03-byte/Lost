const DIMENSIONS = ['2d', '2.5d', '3d', 'isometric'];

export function parseList(value) {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return raw.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
}

export function detectIntake(concept, options, registry) {
  const text = String(concept || '').toLowerCase();
  if (text.trim().length < 12) {
    return { ok: false, error: 'A game concept needs at least a sentence so genres and departments can be inferred.' };
  }

  const scored = registry.genres.map((genre) => {
    const matched = genre.keywords.filter((keyword) => text.includes(keyword));
    return { genre, matched, hits: matched.length };
  });

  const chosen = scored.filter((entry) => entry.hits > 0).sort((a, b) => b.hits - a.hits).slice(0, 4);
  const selected = [...chosen];

  const explicitGenres = parseList(options.genre);
  const unknown = [];
  for (const id of explicitGenres) {
    const genre = registry.genreById.get(id) || registry.genres.find((item) => item.name.toLowerCase() === id);
    if (!genre) {
      unknown.push(id);
      continue;
    }
    if (!selected.some((entry) => entry.genre.id === genre.id)) selected.push({ genre, matched: ['explicit'], hits: 0 });
  }
  if (unknown.length) {
    return {
      ok: false,
      error: `Unknown genre: ${unknown.join(', ')}. Use "npm run studio -- genres" to list ids, or pass --tags for a genre the catalogue does not know.`,
    };
  }

  const tags = new Set(parseList(options.tags));
  for (const entry of selected) for (const tag of entry.genre.tags) tags.add(tag);

  let dimension = (options.dimension || '').toLowerCase();
  if (dimension) {
    if (!DIMENSIONS.includes(dimension)) {
      return { ok: false, error: `Unknown dimension "${options.dimension}". Use 2d, 2.5d, 3d or isometric.` };
    }
  } else {
    dimension = selected[0]?.genre.dimension || (tags.has('2d') ? '2d' : '3d');
  }

  const platforms = parseList(options.platforms);
  const mobileMentioned = /mobile|android|ios|iphone|ipad|tablet|touch/.test(text);
  if (!platforms.length) {
    platforms.push('webgl', 'desktop');
    if (mobileMentioned) platforms.push('mobile');
  }
  if (mobileMentioned && !platforms.includes('mobile')) platforms.push('mobile');

  const lowEnd = /low[- ]end|budget phone|weak hardware/.test(text);
  const highEnd = /high[- ]end|flagship/.test(text);
  const profiles = new Set();
  for (const platform of platforms) {
    if (platform === 'webgl') {
      profiles.add('webgl-desktop');
      if (platforms.includes('mobile') || mobileMentioned) profiles.add('webgl-mobile');
    }
    if (['mobile', 'android', 'ios', 'tablet'].includes(platform)) {
      profiles.add('mid-android');
      if (platform === 'ios' || platforms.includes('ios')) profiles.add('iphone');
      if (platform === 'tablet' || platforms.includes('tablet')) profiles.add('tablet');
      if (lowEnd) profiles.add('low-android');
      if (highEnd) profiles.add('high-android');
    }
    if (['desktop', 'windows', 'macos', 'linux'].includes(platform)) {
      profiles.add('desktop-mid');
      if (lowEnd) profiles.add('desktop-low');
      if (highEnd) profiles.add('desktop-high');
    }
  }
  if (!profiles.size) profiles.add('webgl-desktop');

  const departments = registry.departments.map((dept) => activation(dept, tags, dimension));

  const notes = [];
  if (!selected.length) {
    notes.push('No known genre keyword matched. The universal pipeline runs and you can add specialist departments with --genre or --tags.');
  }
  if (selected.length > 1) {
    notes.push(`Hybrid intake: ${selected.map((entry) => entry.genre.name).join(' + ')}.`);
  }
  const activeCount = departments.filter((entry) => entry.active).length;
  notes.push(`${activeCount} of ${registry.departments.length} departments activated for a ${dimension.toUpperCase()} project.`);

  return {
    ok: true,
    genres: selected.map((entry) => entry.genre.id),
    genreNames: selected.map((entry) => entry.genre.name),
    tags: [...tags].sort(),
    dimension,
    platforms,
    perfProfiles: [...profiles],
    departments,
    basis: selected.map((entry) => ({ genre: entry.genre.id, matched: entry.matched })),
    notes,
  };
}

export function activation(dept, tagSet, dimension) {
  const rule = dept.activation || {};
  if (rule.dimensions && !rule.dimensions.includes(dimension)) {
    const threeDOverride = tagSet.has('3d') && rule.dimensions.includes('3d');
    if (!threeDOverride) {
      return { id: dept.id, active: false, reason: `dimension: needs ${rule.dimensions.join('/')}` };
    }
  }
  if (rule.always) return { id: dept.id, active: true, reason: 'always active' };
  const hit = (rule.any || []).find((tag) => tagSet.has(tag));
  if (hit) return { id: dept.id, active: true, reason: `tag: ${hit}` };
  return { id: dept.id, active: false, reason: `no matching tag (${(rule.any || []).join(', ')})` };
}
