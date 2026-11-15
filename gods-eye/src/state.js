// State assembly, simulation advance, persistence and offline catch-up.

import { createWorld, BIOMES } from './world.js';
import { addEvent, resetEventBudget } from './journal.js';
import { createJohan, johanStep } from './johan.js';
import { tickDay, population } from './life.js';

const SAVE_BASE = 'gods-eye-save-v1';
export const DAYS_PER_SECOND = 2;
const MAX_EVENTS_KEPT = 4000;

// Each signed-in account gets its own local world on this device. Worlds are
// stored on-device so they keep working offline; the account decides which one
// is yours.
let saveNamespace = 'local';

export function setSaveNamespace(ns) {
  saveNamespace = ns ? String(ns) : 'local';
}

export function saveKey() {
  return `${SAVE_BASE}:${saveNamespace}`;
}

export function createState() {
  const state = {
    version: 2,
    world: createWorld(),
    johan: createJohan(),
    started: false,
    npcs: [],
    settlements: [],
    nations: [],
    wars: [],
    plagues: [],
    predators: [],
    species: [],
    businesses: [],
    events: [],
    eventSeq: 0,
    npcSeq: 0,
    settlementSeq: 0,
    nationSeq: 0,
    warSeq: 0,
    plagueSeq: 0,
    predatorSeq: 0,
    businessSeq: 0,
    eventBudget: 5,
    maxGeneration: 1,
    lastSeenDay: 0,
    lastVisit: Date.now(),
    createdAt: Date.now(),
    speed: 1,
    selected: null,
    cradle: null,
  };
  addEvent(state, {
    category: 'johan',
    type: 'genesis',
    title: 'Johan wakes to black grass',
    detail:
      'A cabin on a lone island. A table holding five by five tiles of black grass, ringed by ocean. No inhabitants, no settlements, no nations — only an immortal mind and the will to make a world.',
    where: 'Johan’s Island',
    important: true,
    consequence: 'Everything that follows is his work, or theirs.',
  });
  state.lastSeenDay = 0;
  return state;
}

export function advanceDays(state, days, { quiet = false } = {}) {
  if (!state || !state.started) return 0;
  const rand = Math.random;
  const steps = Math.max(0, Math.min(Math.floor(days), 20000));
  const previousHook = state.onEvent;
  if (quiet) state.onEvent = null;
  for (let i = 0; i < steps; i++) {
    tickDay(state, rand);
    if (state.world.day % 3 === 0) johanStep(state, rand);
    if (state.world.day % 2 === 0) joleneStep(state, rand);
    resetEventBudget(state);
  }
  state.onEvent = previousHook;
  return steps;
}

/* ---------------------------------- Jolene --------------------------------- */

// Jolene never builds. She follows Johan's work and dresses it: cleaner lines,
// finer detail, the same ground made to look like a real place.
const JOLENE_LINES = [
  'thinned the canopy so every branch showed',
  'combed the grass until the blades stood apart',
  'smoothed the water until it held the lamplight',
  'gave each roof its own tilt and shadow',
  'moulded the bare blocks into rolling ground',
  'laid the paths so the village spills over its blocks',
];

export function joleneStep(state, rand = Math.random) {
  const land = [...state.world.tiles.values()].filter((t) => t.biome !== 'ocean' && t.biome !== 'island');
  if (!land.length) return null;
  const stale = land.filter((t) => (t.polishedDay ?? -1) < (t.changedDay ?? 0));
  const pool = stale.length ? stale : land;
  const tile = pool[Math.floor(rand() * pool.length)];
  if (!tile) return null;

  tile.polishedDay = state.world.day;
  tile.detail = Math.min(1, (tile.detail ?? 0.4) + 0.16);
  state.jolene = state.jolene || { polished: 0, lastDay: 0, lastTile: null };
  state.jolene.polished += 1;
  state.jolene.lastDay = state.world.day;
  state.jolene.lastTile = { x: tile.x, y: tile.y };

  // Most passes are quiet; now and then she says what she did.
  if (rand() > 0.4) return null;
  const line = JOLENE_LINES[Math.floor(rand() * JOLENE_LINES.length)];
  return addEvent(state, {
    category: 'jolene',
    type: 'polish',
    title: `Jolene refined ${tile.x},${tile.y}`,
    detail: `She built nothing there. She ${line}, and the ${(BIOMES[tile.biome] || BIOMES.blackgrass).name.toLowerCase()} looks more like a place than it did.`,
    where: `${tile.x},${tile.y}`,
    consequence: 'The same ground, only finer.',
  });
}

/* ------------------------------- persistence ------------------------------ */

export function serialize(state) {
  return {
    version: 2,
    world: {
      seed: state.world.seed,
      day: state.world.day,
      expansion: state.world.expansion,
      protected: [...state.world.protected],
      tiles: [...state.world.tiles.values()],
    },
    johan: state.johan,
    jolene: state.jolene || { polished: 0, lastDay: 0, lastTile: null },
    started: !!state.started,
    npcs: state.npcs,
    settlements: state.settlements,
    nations: state.nations,
    wars: state.wars,
    plagues: state.plagues,
    predators: state.predators,
    species: state.species,
    businesses: state.businesses,
    events: state.events.slice(-MAX_EVENTS_KEPT),
    eventSeq: state.eventSeq,
    npcSeq: state.npcSeq,
    settlementSeq: state.settlementSeq,
    nationSeq: state.nationSeq,
    warSeq: state.warSeq,
    plagueSeq: state.plagueSeq,
    predatorSeq: state.predatorSeq,
    businessSeq: state.businessSeq,
    maxGeneration: state.maxGeneration,
    lastSeenDay: state.lastSeenDay,
    lastVisit: Date.now(),
    createdAt: state.createdAt,
    speed: state.speed,
    selected: state.selected,
    cradle: state.cradle,
  };
}

export function saveState(state) {
  if (!state) return false;
  try {
    localStorage.setItem(saveKey(), JSON.stringify(serialize(state)));
    return true;
  } catch (err) {
    console.warn('[gods-eye] save failed', err);
    return false;
  }
}

export function hasSave() {
  try {
    return !!localStorage.getItem(saveKey());
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(saveKey());
  } catch {
    /* ignore */
  }
}

export function restoreState(raw) {
  if (!raw || !raw.world || !Array.isArray(raw.world.tiles)) return null;
  const state = createState();
  state.world.tiles = new Map(raw.world.tiles.map((t) => [`${t.x},${t.y}`, t]));
  state.world.seed = raw.world.seed ?? state.world.seed;
  state.world.day = raw.world.day ?? 0;
  state.world.expansion = raw.world.expansion ?? 0;
  state.world.protected = new Set(raw.world.protected ?? []);
  state.johan = raw.johan || createJohan();
  state.jolene = raw.jolene || { polished: 0, lastDay: 0, lastTile: null };
  state.started = !!raw.started;
  state.npcs = raw.npcs || [];
  state.settlements = raw.settlements || [];
  state.nations = raw.nations || [];
  state.wars = raw.wars || [];
  state.plagues = raw.plagues || [];
  state.predators = raw.predators || [];
  state.species = raw.species || [];
  state.businesses = raw.businesses || [];
  state.events = raw.events || [];
  state.eventSeq = raw.eventSeq ?? state.events.length;
  state.npcSeq = raw.npcSeq ?? state.npcs.length;
  state.settlementSeq = raw.settlementSeq ?? state.settlements.length;
  state.nationSeq = raw.nationSeq ?? state.nations.length;
  state.warSeq = raw.warSeq ?? state.wars.length;
  state.plagueSeq = raw.plagueSeq ?? state.plagues.length;
  state.predatorSeq = raw.predatorSeq ?? state.predators.length;
  state.businessSeq = raw.businessSeq ?? state.businesses.length;
  state.maxGeneration = raw.maxGeneration ?? 1;
  state.lastSeenDay = raw.lastSeenDay ?? state.world.day;
  state.lastVisit = raw.lastVisit ?? Date.now();
  state.createdAt = raw.createdAt ?? Date.now();
  state.speed = raw.speed ?? 1;
  state.selected = raw.selected ?? null;
  state.cradle = raw.cradle ?? null;
  return state;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(saveKey());
    if (!raw) return null;
    return restoreState(JSON.parse(raw));
  } catch (err) {
    console.warn('[gods-eye] load failed', err);
    return null;
  }
}

// Time passed while the game was closed. Two simulated days per real minute,
// capped so a month away does not erase a civilization.
export function awayDays(state, now = Date.now()) {
  if (!state) return 0;
  const elapsed = now - (state.lastVisit || now);
  if (elapsed < 45000) return 0;
  return Math.min(900, Math.floor(elapsed / 60000) * 2);
}

export function worldStats(state) {
  return {
    day: state.world.day,
    population: population(state),
    tiles: state.world.tiles.size,
    land: [...state.world.tiles.values()].filter((t) => t.biome !== 'ocean' && t.biome !== 'lake' && t.biome !== 'river' && t.biome !== 'coast').length,
    nations: state.nations.filter((n) => n.alive).length,
    wars: state.wars.filter((w) => !w.endedDay).length,
    settlements: state.settlements.filter((s) => s.alive).length,
    events: state.events.length,
    newEvents: state.events.filter((e) => e.day > state.lastSeenDay).length,
  };
}
