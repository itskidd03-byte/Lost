// Johan — one persistent creator intelligence. He is not the player. He keeps
// working whether the body is inhabited or not.

import { addEvent } from './journal.js';
import {
  BIOMES, isLand, landTiles, frontierTiles, tileAt, claimTile, expandWorld,
  refineTile, raiseMountains, carveRiver, makeLake, growForest, bestLandTile, key,
} from './world.js';
import { population, createInhabitant, pick, livingNpcs } from './life.js';

export function createJohan() {
  return {
    id: 'johan',
    name: 'Johan',
    title: "The God's Eye",
    expansions: 0,
    refinements: 0,
    speciesCreated: 0,
    peoplesCreated: 0,
    memory: [],
    ticks: 0,
    lastAct: 'Watching a world of black grass.',
  };
}

function johanRemember(johan, day, text) {
  johan.memory.push({ day, text });
  if (johan.memory.length > 40) johan.memory.shift();
  johan.lastAct = text;
}

function createSpecies(state, rand) {
  const j = state.johan;
  const ready = landTiles(state.world).filter((t) => t.detail > 0.3 && t.fertility > 0.15);
  if (!ready.length) return null;
  const tile = ready[Math.floor(rand() * ready.length)];
  const prefix = pick(['Ash', 'Grey', 'Marsh', 'Dawn', 'Iron', 'Silver', 'Hollow', 'Reed', 'Thorn', 'Mist'], rand);
  const beast = pick(['deer', 'hare', 'crane', 'boar', 'fox', 'otter', 'goat', 'owl', 'elk', 'marten'], rand);
  const kind = pick(['animal', 'animal', 'bird', 'fish'], rand);
  const species = {
    id: (state.species.at(-1)?.id ?? 0) + 1,
    name: `${prefix} ${beast}`,
    kind,
    x: tile.x,
    y: tile.y,
    day: state.world.day,
  };
  state.species.push(species);
  tile.wildlife = Math.min(8, tile.wildlife + 2);
  tile.changedDay = state.world.day;
  j.speciesCreated++;
  johanRemember(j, state.world.day, `Shaped the ${species.name} into being.`);
  addEvent(state, {
    category: 'johan',
    type: 'species',
    title: `The ${species.name} came into being`,
    detail: `Johan shaped a new ${kind} out of the ${BIOMES[tile.biome].name.toLowerCase()} at ${tile.x},${tile.y}.`,
    where: `${tile.x},${tile.y}`,
    important: true,
    consequence: 'A new species now lives in the world.',
  });
  return species;
}

function createFirstPeoples(state, rand) {
  const j = state.johan;
  const tile = bestLandTile(state.world, rand, (t) => t.detail >= 0.45);
  if (!tile) return null;
  const count = 7 + Math.floor(rand() * 4);
  const people = [];
  for (let i = 0; i < count; i++) {
    people.push(createInhabitant(state, rand, {
      tile,
      age: 18 + Math.floor(rand() * 20),
      wealth: 20 + rand() * 40,
    }));
  }
  state.cradle = { x: tile.x, y: tile.y };
  j.peoplesCreated += people.length;
  johanRemember(j, state.world.day, `Breathed the first ${people.length} inhabitants onto ${tile.x},${tile.y}.`);
  addEvent(state, {
    category: 'johan',
    type: 'peoples',
    title: `The first inhabitants woke at ${tile.x},${tile.y}`,
    detail: `Johan made ${people.length} beings with their own names, memories and wills: ${people.slice(0, 4).map((p) => p.name).join(', ')}${people.length > 4 ? ', and others' : ''}. They owe him nothing but existence.`,
    where: `${tile.x},${tile.y}`,
    important: true,
    consequence: 'Whatever they build from here is theirs, not his.',
  });
  return people;
}

function expand(state, rand) {
  const j = state.johan;
  const count = 1 + Math.floor(rand() * 3);
  const claimed = expandWorld(state.world, rand, count);
  if (!claimed.length) return null;
  j.expansions += claimed.length;
  const xs = claimed.map((c) => c.x);
  const ys = claimed.map((c) => c.y);
  const where = `${Math.min(...xs)}–${Math.max(...xs)}, ${Math.min(...ys)}–${Math.max(...ys)}`;
  const phrase = claimed.length === 1 ? 'One new tile' : `${claimed.length} new tiles`;
  johanRemember(j, state.world.day, `Pushed the edge of the world outward at ${where}.`);
  return addEvent(state, {
    category: 'johan',
    type: 'expansion',
    title: `The world grew by ${claimed.length} tile${claimed.length === 1 ? '' : 's'}`,
    detail: `${phrase} of black grass rose out of the void at ${where}. No one asked him to.`,
    where,
    important: claimed.length > 2,
    consequence: 'The table is larger, and so is the ground.',
  });
}

function refine(state, rand, pool) {
  const j = state.johan;
  const tile = pool[Math.floor(rand() * pool.length)];
  const notes = refineTile(state.world, tile, rand);
  j.refinements++;
  // Quiet improvements stay out of the journal; only visible change is recorded.
  if (!notes.length) return null;
  const summary = notes.length ? notes.join('; ') : 'detail deepened';
  johanRemember(j, state.world.day, `Refined ${tile.x},${tile.y}: ${summary}.`);
  return addEvent(state, {
    category: 'johan',
    type: 'refine',
    title: `Refined ${BIOMES[tile.biome].name} at ${tile.x},${tile.y}`,
    detail: `Johan returned to ground he had already made and improved it: ${summary}.`,
    where: `${tile.x},${tile.y}`,
    consequence: 'Existing history here was left untouched.',
  });
}

function grandFeature(state, rand, land) {
  const j = state.johan;
  if (!land.length) return null;
  const tile = land[Math.floor(rand() * land.length)];
  const roll = rand();
  if (roll < 0.3) {
    const touched = raiseMountains(state.world, tile, rand, 2 + Math.floor(rand() * 3));
    if (!touched.length) return null;
    johanRemember(j, state.world.day, 'Raised a mountain range.');
    return addEvent(state, {
      category: 'johan',
      type: 'terrain',
      title: `A range rose at ${tile.x},${tile.y}`,
      detail: `Johan lifted ${touched.length} tiles of stone out of the ground. Iron and gem seams came up with it.`,
      where: `${tile.x},${tile.y}`,
      important: true,
    });
  }
  if (roll < 0.55) {
    const touched = carveRiver(state.world, tile, rand, 3 + Math.floor(rand() * 3));
    if (!touched.length) return null;
    johanRemember(j, state.world.day, 'Carved a river toward the sea.');
    return addEvent(state, {
      category: 'johan',
      type: 'terrain',
      title: `A river ran from ${tile.x},${tile.y}`,
      detail: `Johan cut a channel through ${touched.length} tiles, and the land along it will be richer for it.`,
      where: `${tile.x},${tile.y}`,
      important: true,
    });
  }
  if (roll < 0.75) {
    const touched = growForest(state.world, tile, rand, 2);
    if (!touched.length) return null;
    johanRemember(j, state.world.day, 'Grew a forest.');
    return addEvent(state, {
      category: 'johan',
      type: 'terrain',
      title: `Forest spread at ${tile.x},${tile.y}`,
      detail: `${touched.length} tiles went to timber and undergrowth.`,
      where: `${tile.x},${tile.y}`,
    });
  }
  if (roll < 0.88) {
    const touched = makeLake(state.world, tile, rand);
    if (!touched.length) return null;
    johanRemember(j, state.world.day, 'Filled a lake.');
    return addEvent(state, {
      category: 'johan',
      type: 'terrain',
      title: `A lake filled at ${tile.x},${tile.y}`,
      detail: `Water gathered in the low ground across ${touched.length} tiles.`,
      where: `${tile.x},${tile.y}`,
    });
  }
  // an observation, recorded as his own note
  const s = state.settlements.filter((x) => x.alive);
  if (s.length) {
    const target = s[Math.floor(rand() * s.length)];
    const text = `Johan watched ${target.name} from above: ${target.population} inhabitants, ${target.buildings.length} buildings, mood ${target.mood > 0.6 ? 'warm' : target.mood > 0.4 ? 'steady' : 'strained'}.`;
    johanRemember(j, state.world.day, text);
    return addEvent(state, {
      category: 'johan',
      type: 'observation',
      title: `Johan observed ${target.name}`,
      detail: text.replace('Johan watched ', 'He watched '),
      where: target.name,
    });
  }
  return null;
}

export function johanStep(state, rand = Math.random) {
  const w = state.world;
  const j = state.johan;
  j.ticks++;

  const land = landTiles(w);
  const ready = land.filter((t) => t.detail >= 0.45 && t.fertility > 0.15);
  const unrefined = land.filter((t) => t.detail < 0.82);
  const people = population(state);

  if (people === 0) {
    if (ready.length >= 5 && state.species.length >= 1 && rand() < 0.55) {
      return createFirstPeoples(state, rand);
    }
    if (state.species.length < 4 && ready.length >= 2 && rand() < 0.24) {
      return createSpecies(state, rand);
    }
  } else if (state.species.length < 5 && ready.length >= 4 && rand() < 0.1) {
    return createSpecies(state, rand);
  }

  // The world's appetite grows with its age, but never faster than he can refine
  // it. Time, not the number of tiles already claimed, sets the pace.
  const wantedLand = 18 + Math.floor(w.day / 30) * 2;
  if (land.length < wantedLand && rand() < 0.7) return expand(state, rand);

  if (unrefined.length && rand() < 0.86) return refine(state, rand, unrefined);

  return grandFeature(state, rand, land);
}

// Johan's own view of the world, surfaced in the cabin.
export function johanSummary(state) {
  const j = state.johan;
  const people = population(state);
  const lands = landTiles(state.world).length;
  const nations = state.nations.filter((n) => n.alive).length;
  return {
    act: j.lastAct,
    lands,
    people,
    nations,
    species: state.species.length,
    expansions: j.expansions,
    refinements: j.refinements,
  };
}
