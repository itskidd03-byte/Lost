// Inhabitants, settlements, nations, war, economy, disease, predators, and the
// acts of God's Eye. Everything here mutates the same tile store the table shows.

import { addEvent, civEvent, dateLabel } from './journal.js';
import {
  BIOMES, isLand, key, setBiome, tileAt, addResource, raiseMountains, carveRiver,
  growForest, makeLake, claimTile,
} from './world.js';

const FIRST = ['Aelric', 'Bryn', 'Cael', 'Dara', 'Eirik', 'Fenn', 'Galen', 'Hollis', 'Idra', 'Joren', 'Kael', 'Liora', 'Mira', 'Nesta', 'Orin', 'Perrin', 'Rhea', 'Soren', 'Tamsin', 'Ulla', 'Vesna', 'Wren', 'Yara', 'Zeph', 'Alda', 'Bram', 'Corin', 'Dell', 'Edda', 'Frey', 'Greta', 'Hale', 'Ivar', 'Juna', 'Kira', 'Lark', 'Mab', 'Nyle', 'Osric', 'Pia', 'Quin', 'Rook', 'Sable', 'Tor', 'Una', 'Vale', 'Wyst', 'Ysolde'];
const LAST = ['Ashford', 'Barrow', 'Cinder', 'Dunmore', 'Elmwood', 'Farrow', 'Greystone', 'Harrow', 'Ironwood', 'Jarrow', 'Kestrel', 'Larkspur', 'Moss', 'Northwind', 'Oakheart', 'Pell', 'Quarry', 'Rook', 'Stone', 'Thorn', 'Vale', 'Wynd', 'Yarrow', 'Blackmere', 'Coldwater', 'Dusk', 'Ember', 'Fenwick', 'Gale', 'Hollow'];

const HOBBIES = ['carving', 'stargazing', 'river fishing', 'storytelling', 'herbalism', 'drumming', 'stonework', 'dancing', 'hunting', 'painting', 'brewing', 'watching birds', 'collecting fossils', 'weaving', 'cartography'];
const JOBS = ['forager', 'farmer', 'woodcutter', 'fisher', 'potter', 'weaver', 'smith', 'trader', 'healer', 'builder', 'herder', 'miner', 'scholar', 'guard'];

const SETTLEMENT_A = ['Ash', 'Bram', 'Cald', 'Dun', 'Elder', 'Fen', 'Gale', 'Hollow', 'Iron', 'Keld', 'Lark', 'Mire', 'North', 'Oak', 'Pell', 'Raven', 'Stone', 'Thorn', 'Vale', 'Wynd', 'Salt', 'Ember', 'Grey', 'Marrow'];
const SETTLEMENT_B = ['vale', 'hold', 'wick', 'ford', 'mere', 'reach', 'fall', 'stead', 'gate', 'haven', 'crest', 'barrow', 'ford', 'lyn', 'den', 'moor', 'watch', 'crossing'];

const NATION_NAMES = ['Aetheria', 'Valdoria', 'Karth', 'Sylvania', 'Orinth', 'Duskvale', 'Highreach', 'Thornmark', 'Emberfall', 'Sorrowmere', 'Gilded Coast', 'White Hollow', 'Aurel', 'Nym', 'Caldrun', 'Vash', 'Mirelund', 'Ostmark'];
const GOVS = ['Elder Council', 'Monarchy', 'Merchant Republic', 'Theocracy', 'Clan Moot', 'Free Assembly'];
const NATION_COLORS = ['#c8553d', '#7ba05b', '#5d8aa8', '#b58b4a', '#9a6fb0', '#4fa3a0', '#c98b4a', '#a95d6f', '#6f8f4a', '#8a7fb0'];

const BUILDING_LADDER = [
  [4, 'Fire pits'], [6, 'Granary'], [9, 'Meeting hall'], [13, 'Well'], [18, 'Market stalls'],
  [24, 'Timber palisade'], [30, 'Temple'], [38, 'Workshops'], [46, 'Stone walls'], [58, 'Library'],
  [72, 'Aqueduct'], [90, 'Great hall'], [115, 'Academy'], [140, 'Citadel'], [180, 'Grand forum'],
];

const BUSINESS_TYPES = [
  ['Smithy', 'smith'], ['Mill', 'farmer'], ['Tavern', 'brewer'], ['Weaving house', 'weaver'],
  ['Pottery', 'potter'], ['Trading post', 'trader'], ['Fishery', 'fisher'], ['Quarry', 'miner'],
  ['Herbalist', 'healer'], ['Carpentry', 'woodcutter'], ['Stable', 'herder'], ['Schoolroom', 'scholar'],
];

const DISASTER_NAMES = {
  tornado: 'Tornado', hurricane: 'Hurricane', earthquake: 'Earthquake', flood: 'Flood',
  drought: 'Drought', wildfire: 'Wildfire', volcano: 'Volcanic eruption', blizzard: 'Blizzard',
  heatwave: 'Heat wave', tsunami: 'Tsunami', meteor: 'Meteor impact', landslide: 'Landslide',
  storm: 'Severe storm',
};

export function pick(arr, rand = Math.random) {
  return arr[Math.floor(rand() * arr.length)];
}

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function livingNpcs(state) {
  return state.npcs.filter((n) => n.alive);
}

export function population(state) {
  return livingNpcs(state).length;
}

export function settlementById(state, id) {
  return state.settlements.find((s) => s.id === id && s.alive);
}

export function settlementAt(state, x, y) {
  return state.settlements.find((s) => s.alive && s.x === x && s.y === y);
}

export function settlementOf(state, npc) {
  return npc.settlementId ? settlementById(state, npc.settlementId) : null;
}

export function nationOf(state, npc) {
  const s = settlementOf(state, npc);
  return s && s.nationId ? state.nations.find((n) => n.id === s.nationId && n.alive) : null;
}

export function settlementName(state, rand) {
  for (let i = 0; i < 40; i++) {
    const name = pick(SETTLEMENT_A, rand) + pick(SETTLEMENT_B, rand);
    if (!state.settlements.some((s) => s.name === name)) return name;
  }
  return pick(SETTLEMENT_A, rand) + pick(SETTLEMENT_B, rand) + Math.floor(rand() * 90);
}

function trait(rand) {
  return Math.round((0.14 + rand() * 0.82) * 100) / 100;
}

export function createInhabitant(state, rand, opts = {}) {
  const x = opts.x ?? opts.tile?.x ?? 2;
  const y = opts.y ?? opts.tile?.y ?? 2;
  const age = opts.age ?? 17 + Math.floor(rand() * 15);
  const parentTraits = opts.parents ? opts.parents.map((p) => p.traits) : null;
  const inherit = (name) => {
    if (!parentTraits) return trait(rand);
    const avg = parentTraits.reduce((s, t) => s + t[name], 0) / parentTraits.length;
    return clamp(Math.round((avg + (rand() - 0.5) * 0.34) * 100) / 100, 0.05, 0.98);
  };
  const npc = {
    id: ++state.npcSeq,
    firstName: opts.firstName || pick(FIRST, rand),
    familyName: opts.familyName || (opts.parents && opts.parents[0] ? opts.parents[0].familyName : pick(LAST, rand)),
    sex: opts.sex || (rand() < 0.5 ? 'f' : 'm'),
    age,
    bornDay: state.world.day - Math.round(age * 360),
    generation: opts.generation ?? (opts.parents ? Math.max(...opts.parents.map((p) => p.generation)) + 1 : 1),
    traits: {
      curiosity: inherit('curiosity'),
      ambition: inherit('ambition'),
      kindness: inherit('kindness'),
      aggression: inherit('aggression'),
      loyalty: inherit('loyalty'),
      piety: inherit('piety'),
      creativity: inherit('creativity'),
    },
    hobby: opts.hobby || pick(HOBBIES, rand),
    job: opts.job || (opts.settlementId ? pick(JOBS, rand) : 'forager'),
    x,
    y,
    settlementId: opts.settlementId ?? null,
    wealth: opts.wealth ?? Math.round(8 + rand() * 42),
    health: 0.86 + rand() * 0.14,
    happiness: 0.55 + rand() * 0.25,
    opinionOfJohan: opts.opinion ?? Math.round((rand() * 0.5 - 0.15) * 100) / 100,
    metJohan: false,
    memories: [],
    partnerId: null,
    childIds: [],
    parentIds: opts.parents ? opts.parents.map((p) => p.id) : [],
    businessId: null,
    alive: true,
    deeds: [],
    lastSpokeDay: -999,
  };
  npc.name = `${npc.firstName} ${npc.familyName}`;
  state.npcs.push(npc);
  if (npc.parentIds.length) {
    for (const p of opts.parents) if (!p.childIds.includes(npc.id)) p.childIds.push(npc.id);
  }
  return npc;
}

export function remember(npc, day, text) {
  npc.memories.push({ day, text });
  if (npc.memories.length > 28) npc.memories.shift();
}

export function ageLabel(npc) {
  if (npc.age < 3) return 'an infant';
  if (npc.age < 13) return 'a child';
  if (npc.age < 18) return 'a youth';
  if (npc.age < 35) return 'in their prime';
  if (npc.age < 55) return 'weathered';
  return 'old';
}

/* --------------------------------- death --------------------------------- */

export function killNpc(state, npc, rand, cause = 'age', tile = null) {
  if (!npc.alive) return;
  npc.alive = false;
  npc.deathDay = state.world.day;
  npc.deathCause = cause;
  const s = settlementOf(state, npc);
  if (npc.partnerId) {
    const partner = state.npcs.find((n) => n.id === npc.partnerId);
    if (partner) {
      partner.partnerId = null;
      remember(partner, state.world.day, `${npc.firstName} died (${cause}).`);
    }
  }
  if (cause === 'war' || cause === 'massacre') {
    npc.deathCause = cause;
  } else if (s && npc.age > 50 && rand() < 0.35) {
    civEvent(state, {
      type: 'death',
      title: `${npc.name} died`,
      detail: `${npc.name}, ${npc.job} of ${s.name}, died at ${Math.floor(npc.age)}.`,
      where: s.name,
      actors: [npc.id],
    });
  }
}

/* ------------------------------- settlements ------------------------------ */

export function foundSettlement(state, rand, tile, founders, opts = {}) {
  const s = {
    id: ++state.settlementSeq,
    name: opts.name || settlementName(state, rand),
    x: tile.x,
    y: tile.y,
    tier: 'camp',
    population: 0,
    food: 12 + founders.length * 3,
    treasury: 10 + founders.length * 2,
    culture: 0.05 + rand() * 0.1,
    mood: 0.6,
    buildings: [],
    foundedDay: state.world.day,
    nationId: null,
    leaderId: null,
    alive: true,
    jobs: {},
    tech: [],
    militia: 0,
    note: opts.note || '',
  };
  state.settlements.push(s);
  tile.settlementId = s.id;
  tile.cultivated = 0.4;
  tile.changedDay = state.world.day;
  for (const npc of founders) {
    npc.settlementId = s.id;
    npc.x = tile.x;
    npc.y = tile.y;
    npc.job = npc.job === 'forager' ? pick(['farmer', 'woodcutter', 'builder', 'forager', 'healer'], rand) : npc.job;
  }
  s.leaderId = [...founders].sort((a, b) => b.traits.ambition + b.age / 50 - (a.traits.ambition + a.age / 50))[0]?.id ?? null;
  civEvent(state, {
    type: 'settlement',
    title: `${s.name} was founded`,
    detail: `${founders.length} inhabitants raised the first shelters at ${s.name}, on ${BIOMES[tile.biome].name.toLowerCase()} at ${tile.x},${tile.y}.`,
    where: `${s.name} · ${tile.x},${tile.y}`,
    actors: founders.map((f) => f.id),
    important: true,
    consequence: opts.note || 'A new settlement now exists in the world.',
  });
  if (s.leaderId) {
    const leader = state.npcs.find((n) => n.id === s.leaderId);
    if (leader) remember(leader, state.world.day, `Helped found ${s.name}.`);
  }
  return s;
}

function tierOf(pop) {
  if (pop < 6) return 'camp';
  if (pop < 18) return 'village';
  if (pop < 45) return 'town';
  if (pop < 110) return 'city';
  return 'metropolis';
}
const TIER_RANK = { camp: 0, village: 1, town: 2, city: 3, metropolis: 4 };

function targetBuildings(pop) {
  let n = 0;
  for (const [threshold] of BUILDING_LADDER) if (pop >= threshold) n++;
  return n;
}

function maybeFoundSettlements(state, rand) {
  const groups = new Map();
  for (const npc of livingNpcs(state)) {
    if (npc.settlementId || npc.age < 16) continue;
    const k = key(npc.x, npc.y);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(npc);
  }
  for (const [, group] of groups) {
    if (group.length < 4) continue;
    if (rand() > 0.16) continue;
    const tile = tileAt(state.world, group[0].x, group[0].y);
    if (!tile || !isLand(tile) || tile.settlementId) continue;
    foundSettlement(state, rand, tile, group.slice(0, Math.min(9, group.length)));
  }
}

function spawnSplinter(state, s, rand) {
  const adults = livingNpcs(state).filter((n) => n.settlementId === s.id && n.age >= 16 && n.age < 55);
  if (adults.length < 8) return;
  const settlers = [];
  for (let i = 0; i < 3; i++) settlers.push(pick(adults, rand));
  const good = [];
  const any = [];
  for (let dx = -4; dx <= 4; dx++) {
    for (let dy = -4; dy <= 4; dy++) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist < 2 || dist > 4) continue;
      const t = tileAt(state.world, s.x + dx, s.y + dy);
      if (!t || !isLand(t) || t.settlementId) continue;
      any.push(t);
      if (t.fertility > 0.25) good.push(t);
    }
  }
  const land = good.length ? good : any;
  if (!land.length) return;
  const tile = land[Math.floor(rand() * land.length)];
  const child = foundSettlement(state, rand, tile, settlers);
  const parentNation = s.nationId ? state.nations.find((x) => x.id === s.nationId) : null;
  const independent = !parentNation || rand() < 0.5;
  if (!independent) {
    child.nationId = s.nationId;
    parentNation.settlementIds.push(child.id);
  } else if (parentNation && rand() < 0.55) {
    civEvent(state, {
      type: 'settlement',
      title: `${child.name} split from ${s.name}`,
      detail: `Settlers from ${s.name} walked out and founded ${child.name}, ${Math.abs(child.x - s.x) + Math.abs(child.y - s.y)} tiles away.`,
      where: child.name,
      important: true,
    });
    foundNation(state, child, rand, { parent: parentNation, name: `${child.name} Freehold` });
    return;
  }
  civEvent(state, {
    type: 'settlement',
    title: `${child.name} split from ${s.name}`,
    detail: `Settlers from ${s.name} walked out and founded ${child.name}, ${Math.abs(child.x - s.x) + Math.abs(child.y - s.y)} tiles away.`,
    where: child.name,
    important: true,
  });
}

function createBusiness(state, s, rand) {
  const owners = livingNpcs(state).filter((n) => n.settlementId === s.id && n.age >= 18 && !n.businessId && n.wealth > 12);
  if (!owners.length) return null;
  const owner = owners[Math.floor(rand() * owners.length)];
  const [type, job] = BUSINESS_TYPES[Math.floor(rand() * BUSINESS_TYPES.length)];
  const business = {
    id: ++state.businessSeq,
    name: `${owner.firstName}'s ${type}`,
    type,
    ownerId: owner.id,
    settlementId: s.id,
    employees: 1,
    capital: 10 + rand() * 25,
    profit: 0.4,
    alive: true,
    foundedDay: state.world.day,
  };
  owner.businessId = business.id;
  owner.job = job;
  owner.wealth = Math.max(0, owner.wealth - 8);
  state.businesses.push(business);
  if (rand() < 0.5) {
    civEvent(state, {
      type: 'business',
      title: `${business.name} opened`,
      detail: `${owner.name} opened a ${type.toLowerCase()} in ${s.name} with ${Math.round(business.capital)} in capital.`,
      where: s.name,
      actors: [owner.id],
    });
  }
  return business;
}

function tickSettlement(state, s, rand) {
  const npcs = livingNpcs(state).filter((n) => n.settlementId === s.id);
  s.population = npcs.length;
  const tile = tileAt(state.world, s.x, s.y);
  if (!tile) {
    s.alive = false;
    return;
  }
  if (!npcs.length) {
    s.alive = false;
    tile.settlementId = null;
    civEvent(state, {
      type: 'abandoned',
      title: `${s.name} stands empty`,
      detail: `The last inhabitants of ${s.name} are gone. Doors hang open on ${s.buildings.length} buildings.`,
      where: s.name,
      important: true,
    });
    return;
  }

  const tier = tierOf(s.population);
  if (TIER_RANK[tier] > TIER_RANK[s.tier]) {
    s.tier = tier;
    civEvent(state, {
      type: 'tier',
      title: `${s.name} became a ${tier}`,
      detail: `${s.name} now holds ${s.population} inhabitants and ${s.buildings.length} buildings.`,
      where: s.name,
      important: tier === 'town' || tier === 'city' || tier === 'metropolis',
    });
  }

  const irrigation = s.tech.includes('Irrigation') ? 2.4 : 0;
  // Labour scales with people; the land sets how much each pair of hands brings in.
  const production = 1 + s.population * 0.62 * (0.6 + tile.fertility) + irrigation;
  const consumption = s.population * 0.5 + s.buildings.length * 0.15;
  s.food = Math.max(0, s.food + production - consumption);
  s.food = Math.min(s.food, 200 + s.population * 30);
  if (s.food <= 0 && s.population > 2 && rand() < 0.03) {
    const victim = pick(npcs, rand);
    killNpc(state, victim, rand, 'famine');
    civEvent(state, {
      type: 'famine',
      title: `Hunger in ${s.name}`,
      detail: `${victim.name} died of hunger as the granaries failed.`,
      where: s.name,
      consequence: 'The settlement needs more food before it can grow.',
    });
  }

  s.treasury = Math.max(0, s.treasury + s.population * 0.075 + s.treasury * 0.004 - s.buildings.length * 0.13);
  const avgCreativity = npcs.reduce((a, n) => a + n.traits.creativity, 0) / Math.max(1, npcs.length);
  s.culture += 0.0009 + avgCreativity * 0.0012;

  const want = targetBuildings(s.population);
  while (s.buildings.length < want) {
    const next = BUILDING_LADDER[s.buildings.length][1];
    s.buildings.push(next);
    const notable = ['Temple', 'Stone walls', 'Library', 'Academy', 'Citadel', 'Grand forum'].includes(next);
    civEvent(state, {
      type: 'building',
      title: `${next} built in ${s.name}`,
      detail: `${s.name} completed ${next} after ${Math.round(s.population / 2)} seasons of labour.`,
      where: s.name,
      important: notable,
    });
  }

  const leader = npcs.find((n) => n.id === s.leaderId);
  if (!leader) {
    const nextLeader = [...npcs].sort((a, b) => b.traits.ambition + b.age / 60 - (a.traits.ambition + a.age / 60))[0];
    s.leaderId = nextLeader.id;
    if (s.tier !== 'camp') {
      civEvent(state, {
        type: 'leader',
        title: `${nextLeader.name} leads ${s.name}`,
        detail: `${nextLeader.name}, ${nextLeader.job}, took charge of ${s.name} after the previous leader.`,
        where: s.name,
        actors: [nextLeader.id],
      });
    }
  }

  const myBusinesses = state.businesses.filter((b) => b.alive && b.settlementId === s.id);
  const businessCap = Math.min(14, 1 + Math.floor(s.population / 7));
  if (myBusinesses.length < businessCap && rand() < 0.09) createBusiness(state, s, rand);
  for (const b of myBusinesses) {
    const owner = state.npcs.find((n) => n.id === b.ownerId);
    if (!owner || !owner.alive) {
      b.alive = false;
      if (rand() < 0.6) {
        civEvent(state, { type: 'business', title: `${b.name} closed`, detail: `With ${b.name}'s owner gone, the ${b.type.toLowerCase()} shut its doors.`, where: s.name });
      }
      continue;
    }
    b.employees = clamp(1 + Math.floor(s.population / 12), 1, 9);
    b.profit = 0.35 + s.population * 0.034 + owner.traits.ambition * 0.5 - b.employees * 0.11;
    owner.wealth = Math.max(0, owner.wealth + b.profit);
    s.treasury += Math.max(0, b.profit) * 0.08;
    if (b.profit < 0.02 && rand() < 0.02) {
      b.alive = false;
      owner.businessId = null;
      owner.wealth = Math.max(0, owner.wealth - 4);
      civEvent(state, { type: 'business', title: `${b.name} went bankrupt`, detail: `${owner.name}'s ${b.type.toLowerCase()} in ${s.name} could not cover its costs.`, where: s.name });
    }
  }

  // invention
  if (rand() < 0.0016 * (1 + s.culture) && s.population >= 12) {
    const techs = ['Crop rotation', 'Irrigation', 'Runic writing', 'Windmills', 'Sanitation', 'Bronze casting', 'Star charts', 'Paper', 'Water clocks', 'Vaccination', 'Printing', 'Gunpowder'];
    const fresh = techs.filter((t) => !s.tech.includes(t));
    if (fresh.length) {
      const tech = pick(fresh, rand);
      s.tech.push(tech);
      civEvent(state, {
        type: 'invention',
        title: `${tech} discovered in ${s.name}`,
        detail: `Scholars and craftspeople of ${s.name} developed ${tech}.`,
        where: s.name,
        important: ['Vaccination', 'Printing', 'Gunpowder', 'Sanitation'].includes(tech),
        consequence: tech === 'Irrigation' ? 'Crops now yield more.' : 'Knowledge spreads through the region.',
      });
    }
  }

  const avgHappiness = npcs.reduce((a, n) => a + n.happiness, 0) / Math.max(1, npcs.length);
  const atWar = state.wars.some((w) => !w.endedDay && (w.aId === s.nationId || w.bId === s.nationId));
  s.mood = clamp(0.42 + (s.food > 4 ? 0.16 : -0.16) + (tile.mood || 0) * 0.3 + (atWar ? -0.2 : 0) + (avgHappiness - 0.5) * 0.3, 0.05, 0.98);

  if (!s.nationId && TIER_RANK[s.tier] >= 1 && s.population >= 14 && rand() < 0.04) {
    foundNation(state, s, rand);
  }

  // rebellion: a settlement inside a nation can renounce it
  if (s.nationId && s.population >= 8) {
    const parent = state.nations.find((n) => n.id === s.nationId && n.alive);
    if (parent && nationSettlements(state, parent.id).length > 1) {
      const capital = state.settlements.find((x) => x.id === parent.capitalId && x.alive);
      const distance = capital ? Math.abs(capital.x - s.x) + Math.abs(capital.y - s.y) : 9;
      const strain = s.mood < 0.5 ? 0.006 : 0.0;
      const drift = s.id !== parent.capitalId && distance >= 3 ? 0.012 : 0;
      if (rand() < strain + drift) {
        secede(state, s, parent, rand);
      }
    }
  }
  if (s.population > 22 && rand() < 0.02) spawnSplinter(state, s, rand);
}

function secede(state, s, parent, rand) {
  s.nationId = null;
  s.treasury = Math.max(0, s.treasury * 0.5);
  foundNation(state, s, rand, { parent, name: `${s.name} Freehold` });
}

function foundNation(state, s, rand, opts = {}) {
  const name = opts.name || NATION_NAMES.find((n) => !state.nations.some((x) => x.name === n)) || `${s.name} Dominion`;
  const nation = {
    id: ++state.nationSeq,
    name,
    color: NATION_COLORS[state.nations.length % NATION_COLORS.length],
    capitalId: s.id,
    settlementIds: [s.id],
    military: 6 + rand() * 8,
    treasury: s.treasury * 1.5,
    stability: 0.72,
    culture: s.culture,
    gov: pick(GOVS, rand),
    foundedDay: state.world.day,
    relations: {},
    alive: true,
    aggression: 0.3 + rand() * 0.55,
  };
  state.nations.push(nation);
  s.nationId = nation.id;
  if (opts.parent) {
    nation.relations[opts.parent.id] = -0.75;
    opts.parent.relations[nation.id] = -0.75;
    opts.parent.stability = clamp(opts.parent.stability - 0.12, 0, 1);
    opts.parent.military = Math.max(0.5, opts.parent.military - 2);
  }
  civEvent(state, {
    type: opts.parent ? 'secession' : 'nation',
    title: opts.parent ? `${name} broke from ${opts.parent.name}` : `${name} declared itself`,
    detail: opts.parent
      ? `${s.name} renounced ${opts.parent.name} and raised its own banner. ${name} is now a ${nation.gov.toLowerCase()} of its own.`
      : `The people of ${s.name} founded ${name}, a ${nation.gov.toLowerCase()} of ${nation.settlementIds.length} settlement, under the banner of ${name}.`,
    where: s.name,
    important: true,
    consequence: opts.parent ? 'The old nation will not forgive this quietly.' : 'A new nation now holds this territory.',
  });
  return nation;
}

/* ----------------------------- nations & war ----------------------------- */

function activeWars(state) {
  return state.wars.filter((w) => !w.endedDay);
}

function nationSettlements(state, nationId) {
  return state.settlements.filter((s) => s.alive && s.nationId === nationId);
}

function declareWar(state, a, b, rand) {
  a.relations[b.id] = -0.6;
  b.relations[a.id] = -0.6;
  const war = {
    id: ++state.warSeq,
    aId: a.id,
    bId: b.id,
    startDay: state.world.day,
    battles: 0,
    casualties: 0,
    front: null,
    endedDay: null,
  };
  state.wars.push(war);
  civEvent(state, {
    type: 'war',
    title: `${a.name} declared war on ${b.name}`,
    detail: `After months of friction, ${a.name} marched against ${b.name}.`,
    where: `${a.name} / ${b.name}`,
    important: true,
    consequence: 'The border regions are now a war front.',
  });
  return war;
}

function tickNations(state, rand) {
  for (const t of state.world.tiles.values()) if (t.war) t.war = false;

  for (const nation of state.nations) {
    if (!nation.alive) continue;
    const owned = nationSettlements(state, nation.id);
    if (!owned.length) {
      nation.alive = false;
      for (const w of activeWars(state)) {
        if (w.aId === nation.id || w.bId === nation.id) {
          w.endedDay = state.world.day;
        }
      }
      civEvent(state, {
        type: 'collapse',
        title: `${nation.name} collapsed`,
        detail: `Every settlement of ${nation.name} is gone. Its banner is struck.`,
        where: nation.name,
        important: true,
      });
      continue;
    }
    nation.settlementIds = owned.map((s) => s.id);
    const atWar = activeWars(state).some((w) => w.aId === nation.id || w.bId === nation.id);
    nation.military = clamp(nation.military + owned.length * 0.05 - 0.035 - (atWar ? 0.02 : 0), 0.5, 400);
    nation.treasury += owned.reduce((a, s) => a + s.treasury, 0) * 0.05;
    nation.culture += 0.0004 * owned.length;
    nation.stability = clamp(nation.stability + (atWar ? -0.004 : 0.0025), 0, 1);
    if (nation.stability <= 0.02 && rand() < 0.25) {
      nation.alive = false;
      for (const s of owned) s.nationId = null;
      civEvent(state, {
        type: 'collapse',
        title: `${nation.name} fractured`,
        detail: `Unrest broke the ${nation.gov.toLowerCase()} of ${nation.name}. Its settlements now stand alone.`,
        where: nation.name,
        important: true,
      });
      continue;
    }
    for (const other of state.nations) {
      if (other.id === nation.id || !other.alive) continue;
      const held = nation.relations[other.id];
      if (held === undefined) {
        nation.relations[other.id] = -0.1 + (rand() - 0.5) * 0.7;
        other.relations[nation.id] = nation.relations[other.id];
      } else if (!atWar) {
        nation.relations[other.id] = clamp(held + (rand() - 0.5) * 0.02, -1, 1);
        other.relations[nation.id] = nation.relations[other.id];
      }
    }
  }

  // war declarations between neighbours
  for (let i = 0; i < state.nations.length; i++) {
    const a = state.nations[i];
    if (!a.alive) continue;
    const aSettlements = nationSettlements(state, a.id);
    if (!aSettlements.length) continue;
    for (let j = i + 1; j < state.nations.length; j++) {
      const b = state.nations[j];
      if (!b.alive) continue;
      if (activeWars(state).some((w) => (w.aId === a.id && w.bId === b.id) || (w.aId === b.id && w.bId === a.id))) continue;
      const bSettlements = nationSettlements(state, b.id);
      if (!bSettlements.length) continue;
      let nearest = 99;
      for (const sa of aSettlements) for (const sb of bSettlements) nearest = Math.min(nearest, Math.abs(sa.x - sb.x) + Math.abs(sa.y - sb.y));
      if (nearest > 7) continue;
      const friction = 1 - (a.relations[b.id] ?? 0.2);
      const chance = 0.006 * friction * (0.5 + a.aggression) * (nearest <= 3 ? 3 : 1);
      if (rand() < chance) declareWar(state, a, b, rand);
    }
  }

  // battles
  for (const war of activeWars(state)) {
    const a = state.nations.find((n) => n.id === war.aId);
    const b = state.nations.find((n) => n.id === war.bId);
    if (!a || !b || !a.alive || !b.alive) {
      war.endedDay = state.world.day;
      continue;
    }
    const aS = nationSettlements(state, a.id);
    const bS = nationSettlements(state, b.id);
    if (!aS.length || !bS.length) {
      war.endedDay = state.world.day;
      continue;
    }
    let frontA = aS[0], frontB = bS[0], best = 99;
    for (const sa of aS) for (const sb of bS) {
      const d = Math.abs(sa.x - sb.x) + Math.abs(sa.y - sb.y);
      if (d < best) {
        best = d;
        frontA = sa;
        frontB = sb;
      }
    }
    const front = tileAt(state.world, Math.round((frontA.x + frontB.x) / 2), Math.round((frontA.y + frontB.y) / 2)) || tileAt(state.world, frontA.x, frontA.y);
    war.front = front ? { x: front.x, y: front.y } : null;
    for (const s of aS) {
      const t = tileAt(state.world, s.x, s.y);
      if (t) t.war = true;
    }
    for (const s of bS) {
      const t = tileAt(state.world, s.x, s.y);
      if (t) t.war = true;
    }

    if (rand() < 0.55) {
      war.battles++;
      const powerA = a.military * (0.7 + rand() * 0.8);
      const powerB = b.military * (0.7 + rand() * 0.8);
      const loser = powerA < powerB ? a : b;
      const winner = loser === a ? b : a;
      const intensity = Math.round(1 + rand() * 4);
      winner.military = Math.max(0.4, winner.military - intensity * 0.08);
      loser.military = Math.max(0.4, loser.military - intensity * 0.16);
      loser.stability = clamp(loser.stability - 0.015, 0, 1);
      const pool = livingNpcs(state).filter((n) => n.settlementId && state.settlements.find((s) => s.id === n.settlementId && s.alive)?.nationId === loser.id);
      let deaths = 0;
      for (let k = 0; k < intensity && pool.length; k++) {
        const victim = pool.splice(Math.floor(rand() * pool.length), 1)[0];
        if (victim) {
          killNpc(state, victim, rand, 'war');
          deaths++;
        }
      }
      war.casualties += deaths;
      if (front) {
        front.war = true;
        front.blood = Math.min(3, front.blood + (deaths >= 3 ? 1 : 0));
      }
      if (deaths >= 4) {
        const place = front ? `${front.x},${front.y}` : (loserSettlementName(state, loser) || 'the border');
        civEvent(state, {
          type: 'massacre',
          title: `Massacre at ${place}`,
          detail: `${deaths} inhabitants of ${loser.name} were killed in a single clash against ${winner.name}.`,
          where: place,
          actors: [],
          important: true,
          consequence: 'The ground here is marked with what happened.',
        });
        if (front) front.blood = Math.min(3, front.blood + 2);
        for (const n of livingNpcs(state)) {
          if (n.settlementId && state.settlements.find((s) => s.id === n.settlementId)?.nationId === loser.id) {
            remember(n, state.world.day, `Word came of a massacre at ${place}.`);
          }
        }
      } else if (rand() < 0.22) {
        civEvent(state, {
          type: 'battle',
          title: `Battle at ${front ? `${front.x},${front.y}` : 'the border'}`,
          detail: `${winner.name}'s host scattered ${loser.name}'s line. ${deaths} dead.`,
          where: front ? `${front.x},${front.y}` : 'the border',
          war: true,
        });
      }
      if (rand() < 0.045) {
        war.endedDay = state.world.day;
        a.relations[b.id] = 0.15;
        b.relations[a.id] = 0.15;
        civEvent(state, {
          type: 'peace',
          title: `${a.name} and ${b.name} made peace`,
          detail: `After ${war.battles} battles and ${war.casualties} dead, envoys signed terms.`,
          where: `${a.name} / ${b.name}`,
          important: true,
        });
      }
    }
  }
}

function loserSettlementName(state, nation) {
  const s = settlementForNation(state, nation.id);
  return s ? s.name : null;
}

function settlementForNation(state, nationId) {
  return state.settlements.find((s) => s.alive && s.nationId === nationId);
}

/* -------------------------------- disease -------------------------------- */

export function createPlague(state, rand, x, y, kind = 'plague', name = null) {
  const p = {
    id: ++state.plagueSeq,
    name: name || pick(['Grey Fever', 'Wasting Cough', 'Black Pox', 'River Rot', 'Hollow Plague', 'Ember Fever', 'Cold Vein'], rand),
    x,
    y,
    kind,
    day: state.world.day,
    duration: 60 + Math.floor(rand() * 140),
    mortality: 0.012 + rand() * 0.03,
    infected: 3 + Math.floor(rand() * 8),
    deaths: 0,
    ended: false,
    peak: 0,
  };
  state.plagues.push(p);
  const event = addEvent(state, {
    category: 'johan',
    type: 'plague',
    title: `${p.name} released`,
    detail: `${p.kind === 'plague' ? 'A disease' : p.kind === 'animal' ? 'An animal sickness' : 'A blight'} began at ${x},${y}.`,
    where: `${x},${y}`,
    important: true,
    consequence: 'Inhabitants will have to answer it themselves.',
  });
  return event;
}

function tickPlagues(state, rand) {
  for (const p of state.plagues) {
    if (p.ended) continue;
    p.infected *= 1.006 - p.mortality * 0.6;
    const victims = state.npcs.filter((n) => n.alive && Math.abs(n.x - p.x) <= 3 && Math.abs(n.y - p.y) <= 3);
    for (const npc of victims) {
      if (!npc.alive) continue;
      if (rand() < p.mortality * 0.02) {
        killNpc(state, npc, rand, 'plague');
        npc.health = 0;
        p.deaths++;
        p.infected += 1;
      }
    }
    p.peak = Math.max(p.peak, Math.round(p.infected));
    if (rand() < 0.012) {
      const spread = state.settlements.filter((s) => s.alive && Math.abs(s.x - p.x) <= 5 && Math.abs(s.y - p.y) <= 5);
      if (spread.length) {
        const s = spread[Math.floor(rand() * spread.length)];
        p.x = s.x;
        p.y = s.y;
        p.infected += 2;
        civEvent(state, {
          type: 'plague_spread',
          title: `${p.name} reached ${s.name}`,
          detail: `The sickness spread to ${s.name}. ${p.deaths} have died so far.`,
          where: s.name,
        });
      }
    }
    if (state.world.day - p.day > p.duration) {
      p.ended = true;
      civEvent(state, {
        type: 'plague_end',
        title: `${p.name} burned out`,
        detail: `After ${state.world.day - p.day} days and ${p.deaths} dead, ${p.name} faded.`,
        where: `${p.x},${p.y}`,
        important: true,
        consequence: p.deaths > 12 ? 'A generation grew up around the memory of it.' : 'The settlement endures.',
      });
    }
  }
}

/* ------------------------------- predators ------------------------------- */

export function releasePredators(state, rand, x, y, opts = {}) {
  const pred = {
    id: ++state.predatorSeq,
    name: opts.name || pick(['Dire wolves', 'Shadow cats', 'Iron bears', 'Marsh serpents', 'Night hawks'], rand),
    x,
    y,
    targetNationId: opts.targetNationId || null,
    intensity: opts.intensity ?? 0.5,
    day: state.world.day,
    kills: 0,
  };
  state.predators.push(pred);
  addEvent(state, {
    category: 'johan',
    type: 'predator',
    title: `${pred.name} released at ${x},${y}`,
    detail: pred.targetNationId
      ? `Johan set ${pred.name} loose with a hunting directive against a chosen nation.`
      : `Johan set ${pred.name} loose on the wild land.`,
    where: `${x},${y}`,
    important: true,
    consequence: 'The local inhabitants must answer this themselves.',
  });
  return pred;
}

function tickPredators(state, rand) {
  for (const pred of state.predators) {
    let pool = livingNpcs(state).filter((n) => Math.abs(n.x - pred.x) <= 3 && Math.abs(n.y - pred.y) <= 3);
    if (pred.targetNationId) {
      const targeted = livingNpcs(state).filter((n) => {
        const s = settlementOf(state, n);
        return s && s.nationId === pred.targetNationId;
      });
      if (targeted.length) pool = targeted;
    }
    if (!pool.length) continue;
    if (rand() < 0.02 + pred.intensity * 0.03) {
      const victim = pick(pool, rand);
      killNpc(state, victim, rand, 'predator');
      pred.kills++;
      if (rand() < 0.3) {
        civEvent(state, {
          type: 'predator_kill',
          title: `${pred.name} took ${victim.name}`,
          detail: `${pred.name} killed ${victim.name}, ${victim.job}, near ${pred.x},${pred.y}. ${pred.kills} deaths so far.`,
          where: `${pred.x},${pred.y}`,
        });
      }
    }
  }
}

/* ------------------------------ daily tick ------------------------------- */

function tickInhabitant(state, npc, rand) {
  npc.age += 1 / 360;
  npc.health = Math.min(1, npc.health + 0.0015);
  npc.happiness = clamp(npc.happiness + (rand() - 0.5) * 0.01, 0.05, 1);

  const oldAge = npc.age > 58 ? (npc.age - 58) / 55 : 0;
  if (rand() < oldAge * 0.0032 + 0.000015) {
    killNpc(state, npc, rand, 'age');
    return;
  }

  const s = settlementOf(state, npc);
  if (s) {
    const wage = 0.3 + npc.traits.ambition * 0.45 + s.treasury * 0.0006;
    npc.wealth += wage;
    npc.happiness = clamp(npc.happiness + (s.mood - 0.5) * 0.006, 0.05, 1);
    if (npc.wealth < 2) npc.happiness = clamp(npc.happiness - 0.008, 0.05, 1);
  } else {
    npc.wealth += 0.12;
  }

  if (!npc.partnerId && npc.age >= 18 && npc.age < 62 && rand() < 0.02) {
    const candidates = livingNpcs(state).filter(
      (n) => n.id !== npc.id && !n.partnerId && n.settlementId === npc.settlementId && n.age >= 18 && n.age < 62 && n.sex !== npc.sex,
    );
    if (candidates.length) {
      const partner = pick(candidates, rand);
      npc.partnerId = partner.id;
      partner.partnerId = npc.id;
      remember(npc, state.world.day, `Bonded with ${partner.firstName}.`);
      remember(partner, state.world.day, `Bonded with ${npc.firstName}.`);
      if (rand() < 0.45) {
        civEvent(state, {
          type: 'family',
          title: `${npc.firstName} and ${partner.firstName} were bound`,
          detail: `${npc.name} and ${partner.name} joined households in ${s ? s.name : 'the wild'}.`,
          where: s ? s.name : `${npc.x},${npc.y}`,
          actors: [npc.id, partner.id],
        });
      }
    }
  }

  if (npc.sex === 'f' && npc.partnerId && npc.age >= 18 && npc.age <= 44 && npc.health > 0.55 && rand() < 0.02) {
    const partner = state.npcs.find((n) => n.id === npc.partnerId && n.alive);
    if (partner) {
      const child = createInhabitant(state, rand, {
        age: 0,
        x: npc.x,
        y: npc.y,
        settlementId: npc.settlementId,
        parents: [npc, partner],
        wealth: 0,
        job: 'child',
      });
      remember(npc, state.world.day, `Gave birth to ${child.firstName}.`);
      remember(partner, state.world.day, `${npc.firstName} bore ${child.firstName}.`);
      if (s && rand() < 0.16) {
        civEvent(state, {
          type: 'birth',
          title: `${child.name} born in ${s.name}`,
          detail: `A child of ${npc.firstName} and ${partner.firstName}, generation ${child.generation}.`,
          where: s.name,
          actors: [child.id, npc.id, partner.id],
        });
      }
      if (child.generation > (state.maxGeneration || 0)) state.maxGeneration = child.generation;
    }
  }

  if (npc.age >= 16 && npc.job === 'child') npc.job = pick(JOBS, rand);
}

export function tickDay(state, rand = Math.random) {
  state.world.day++;
  state.eventBudget = 5;
  for (const npc of state.npcs) {
    if (!npc.alive) continue;
    tickInhabitant(state, npc, rand);
  }
  maybeFoundSettlements(state, rand);
  for (const s of state.settlements) {
    if (s.alive) tickSettlement(state, s, rand);
  }
  tickNations(state, rand);
  tickPlagues(state, rand);
  tickPredators(state, rand);
  for (const t of state.world.tiles.values()) {
    if (t.mood) t.mood *= 0.985;
    if (t.disaster && state.world.day - t.disaster.day > 12) t.disaster = null;
  }
}

/* ------------------------------- god's eye ------------------------------- */

function nearestSettlement(state, x, y, radius = 6) {
  let best = null;
  let bestD = Infinity;
  for (const s of state.settlements) {
    if (!s.alive) continue;
    const d = Math.abs(s.x - x) + Math.abs(s.y - y);
    if (d < bestD && d <= radius) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

function killInArea(state, rand, x, y, radius, chance) {
  let deaths = 0;
  for (const npc of livingNpcs(state)) {
    if (!npc.alive) continue;
    if (Math.abs(npc.x - x) <= radius && Math.abs(npc.y - y) <= radius && rand() < chance) {
      killNpc(state, npc, rand, 'disaster');
      deaths++;
    }
  }
  return deaths;
}

function damageSettlement(state, rand, x, y, severity) {
  const s = settlementAt(state, x, y) || nearestSettlement(state, x, y, 1);
  if (!s) return { s: null, lost: 0 };
  const lost = Math.min(s.buildings.length, Math.ceil(severity * (1 + rand() * 3)));
  if (lost) s.buildings.splice(Math.max(0, s.buildings.length - lost), lost);
  s.food = Math.max(0, s.food * (1 - severity * 0.35));
  s.treasury = Math.max(0, s.treasury * (1 - severity * 0.2));
  return { s, lost };
}

function disasterEvent(state, tile, label, detail, consequence) {
  return addEvent(state, {
    category: 'johan',
    type: 'disaster',
    title: `${label} at ${tile.x},${tile.y}`,
    detail,
    where: `${tile.x},${tile.y}`,
    important: true,
    consequence,
  });
}

export function godAction(state, kind, tile, rand = Math.random, hint = '') {
  if (!tile) return null;
  const w = state.world;
  const x = tile.x;
  const y = tile.y;
  const land = isLand(tile);

  const disaster = (type, detailFn, tileMutateFn, severity = 0.6, radius = 2) => {
    const deaths = killInArea(state, rand, x, y, radius, 0.14 + severity * 0.3);
    const { s, lost } = damageSettlement(state, rand, x, y, severity);
    if (tileMutateFn) tileMutateFn(tile);
    tile.disaster = { type, day: w.day, intensity: severity };
    tile.changedDay = w.day;
    const where = s ? ` at ${s.name}` : '';
    const detail = detailFn({ deaths, lost, s });
    const ev = disasterEvent(state, tile, DISASTER_NAMES[type] || type, detail, deaths > 6 ? 'The dead are counted for years.' : 'The land and its people will carry the mark.');
    return ev;
  };

  switch (kind) {
    case 'tornado':
      return disaster('tornado', ({ deaths, lost, s }) =>
        `A tornado tore across ${BIOMES[tile.biome].name.toLowerCase()}${s ? ` in ${s.name}` : ''}. ${deaths} inhabitants died, ${lost} buildings were torn apart.`,
      (tile) => {
        tile.trees = Math.max(0, tile.trees - 0.5);
        tile.changedDay = w.day;
      }, 0.6, 1);

    case 'hurricane':
      return disaster('hurricane', ({ deaths, lost }) =>
        `A hurricane broke over the coast. ${deaths} died and ${lost} structures were flattened.`,
      (tile) => {
        tile.trees = Math.max(0, tile.trees - 0.4);
        tile.fertility = Math.max(0.05, tile.fertility - 0.08);
      }, 0.7, 3);

    case 'earthquake': {
      const ev = disaster('earthquake', ({ deaths, lost, s }) =>
        `The ground split. ${deaths} inhabitants died, ${lost} buildings collapsed${s ? ` in ${s.name}` : ''}. The terrain itself shifted.`,
      (tile) => {
        tile.elevation += (rand() - 0.4) * 0.22;
        if (rand() < 0.35) setBiome(tile, 'hills');
      }, 0.8, 2);
      const near = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dx, dy] of near) {
        const n = tileAt(w, x + dx, y + dy);
        if (n && isLand(n) && rand() < 0.5) n.elevation += (rand() - 0.5) * 0.1;
      }
      return ev;
    }

    case 'flood':
      return disaster('flood', ({ deaths, lost }) =>
        `Rivers broke their banks. ${deaths} drowned and ${lost} buildings were swept away.`,
      (tile) => {
        tile.fertility = Math.min(1, tile.fertility + 0.1);
        tile.mood = Math.max(-1, tile.mood - 0.2);
      }, 0.55, 2);

    case 'drought': {
      const affected = [tile];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = tileAt(w, x + dx, y + dy);
        if (n && isLand(n)) affected.push(n);
      }
      for (const t of affected) {
        t.fertility = Math.max(0.02, t.fertility - 0.22);
        t.disaster = { type: 'drought', day: w.day, intensity: 0.6 };
        t.changedDay = w.day;
      }
      return disasterEvent(state, tile, 'Drought', `The rains stopped across ${affected.length} tiles. Fertility has collapsed; harvests will fail.`, 'Famine may follow.');
    }

    case 'wildfire':
      return disaster('wildfire', ({ deaths, lost }) =>
        `Fire ran through the ${BIOMES[tile.biome].name.toLowerCase()}. ${deaths} died, ${lost} buildings burned, and the forest is gone.`,
      (tile) => {
        if (BIOMES[tile.biome].trees) setBiome(tile, 'grass');
        tile.trees = 0;
        tile.fertility = Math.min(1, tile.fertility + 0.05);
        tile.wildlife = 0;
      }, 0.8, 2);

    case 'volcano':
      return disaster('volcano', ({ deaths, lost }) =>
        `A vent opened and ash fell for days. ${deaths} died; ${lost} buildings were buried. The land is now mountain.`,
      (tile) => setBiome(tile, 'peak'), 0.95, 2);

    case 'blizzard':
      return disaster('blizzard', ({ deaths, lost }) =>
        `A blizzard buried the region. ${deaths} froze. ${lost} buildings lost their roofs.`,
      (tile) => {
        if (isLand(tile)) setBiome(tile, 'tundra');
        tile.fertility = Math.max(0.03, tile.fertility - 0.2);
      }, 0.6, 2);

    case 'heatwave':
      return disaster('heatwave', ({ deaths }) =>
        `A killing heat settled for weeks. ${deaths} inhabitants died of it, and the crops withered.`,
      (tile) => {
        tile.fertility = Math.max(0.03, tile.fertility - 0.14);
        tile.trees = Math.max(0, tile.trees - 0.25);
      }, 0.4, 2);

    case 'tsunami':
      return disaster('tsunami', ({ deaths, lost }) =>
        `A wall of water came in from the sea. ${deaths} drowned and ${lost} coastal buildings were destroyed.`,
      (tile) => {
        tile.fertility = Math.max(0.02, tile.fertility - 0.12);
        if (rand() < 0.5) setBiome(tile, 'swamp');
      }, 0.85, 2);

    case 'meteor':
      return disaster('meteor', ({ deaths, lost }) =>
        `A burning stone struck the ground. ${deaths} died instantly, ${lost} buildings vanished, and the crater filled with dark water.`,
      (tile) => setBiome(tile, 'lake'), 1, 2);

    case 'landslide':
      return disaster('landslide', ({ deaths, lost }) =>
        `A hillside gave way. ${deaths} were buried, ${lost} buildings destroyed.`, null, 0.6, 1);

    case 'storm':
      return disaster('storm', ({ deaths, lost }) =>
        `A severe storm hammered the region. ${deaths} died, ${lost} buildings damaged.`, null, 0.4, 2);

    case 'plague':
      return createPlague(state, rand, x, y, 'plague');

    case 'animaldisease': {
      tile.wildlife = 0;
      return addEvent(state, {
        category: 'johan',
        type: 'disease',
        title: `Animal sickness at ${x},${y}`,
        detail: 'A sickness passed through the herds and wild things. Wildlife in the area has collapsed; herders will be ruined this season.',
        where: `${x},${y}`,
        important: true,
      });
    }

    case 'plantdisease': {
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = tileAt(w, x + dx, y + dy);
        if (n && isLand(n)) {
          n.fertility = Math.max(0.02, n.fertility - 0.3);
          n.disaster = { type: 'blight', day: w.day, intensity: 0.5 };
          n.changedDay = w.day;
        }
      }
      const { s } = damageSettlement(state, rand, x, y, 0.3);
      return addEvent(state, {
        category: 'johan',
        type: 'disease',
        title: `Blight at ${x},${y}`,
        detail: `A plant sickness spread through the fields${s ? ` of ${s.name}` : ''}. The soil will yield little for a season.`,
        where: `${x},${y}`,
        important: true,
      });
    }

    case 'emotion_hope':
    case 'emotion_trust':
    case 'emotion_compassion':
    case 'emotion_courage':
    case 'emotion_creativity':
      return emotion(state, tile, kind.replace('emotion_', ''), 1, rand);

    case 'emotion_fear':
    case 'emotion_anger':
    case 'emotion_paranoia':
    case 'emotion_greed':
    case 'emotion_despair':
    case 'emotion_jealousy':
      return emotion(state, tile, kind.replace('emotion_', ''), -1, rand);

    case 'predator':
      return releasePredators(state, rand, x, y, { targetNationId: nearestSettlement(state, x, y, 3)?.nationId || null });

    case 'mountain': {
      if (!land) return null;
      const touched = raiseRange(w, tile, rand);
      return addEvent(state, {
        category: 'johan',
        type: 'terrain',
        title: `Mountains raised at ${x},${y}`,
        detail: `Johan lifted a range across ${touched.length} tiles. Stone and iron now lie beneath the surface.`,
        where: `${x},${y}`,
        important: true,
        consequence: 'New ore is available, and the passes are hard.',
      });
    }

    case 'river': {
      const touched = carveWater(w, tile, rand);
      return addEvent(state, {
        category: 'johan',
        type: 'terrain',
        title: `River carved at ${x},${y}`,
        detail: `A river now runs through ${touched.length} tiles, carrying silt and fish to the land around it.`,
        where: `${x},${y}`,
        important: true,
        consequence: 'Fertility rises along its banks.',
      });
    }

    case 'forest': {
      const touched = plantForest(w, tile, rand);
      return addEvent(state, {
        category: 'johan',
        type: 'terrain',
        title: `Forest grown at ${x},${y}`,
        detail: `Trees spread across ${touched.length} tiles. Timber and game follow.`,
        where: `${x},${y}`,
        important: true,
      });
    }

    case 'lake': {
      const touched = fillLake(w, tile, rand);
      return addEvent(state, {
        category: 'johan',
        type: 'terrain',
        title: `Lake created at ${x},${y}`,
        detail: `Water filled a hollow across ${touched.length} tiles.`,
        where: `${x},${y}`,
        important: true,
      });
    }

    case 'newland': {
      const made = [];
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (w.protected.has(key(nx, ny))) continue;
        if (!tileAt(w, nx, ny)) {
          const t = claimLand(w, nx, ny, rand);
          if (t) made.push(t);
        }
      }
      return addEvent(state, {
        category: 'johan',
        type: 'world',
        title: `New land raised at ${x},${y}`,
        detail: `Johan pulled ${made.length} new tiles out of the void.`,
        where: `${x},${y}`,
        important: true,
        consequence: 'The world is larger than it was.',
      });
    }

    case 'blessfertility': {
      if (!land) return null;
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = tileAt(w, x + dx, y + dy);
        if (n && isLand(n)) {
          n.fertility = Math.min(1, n.fertility + 0.25);
          n.trees = Math.min(1, n.trees + 0.2);
          n.wildlife = Math.min(6, n.wildlife + 1);
          n.changedDay = w.day;
        }
      }
      return addEvent(state, {
        category: 'johan',
        type: 'terrain',
        title: `The land around ${x},${y} was made fertile`,
        detail: 'Soil deepened, game returned, and the harvests here will be heavy.',
        where: `${x},${y}`,
        important: true,
      });
    }

    case 'donate': {
      const s = settlementAt(state, x, y) || nearestSettlement(state, x, y, 4);
      if (!s) return null;
      const amount = Math.round(120 + rand() * 380);
      s.treasury += amount;
      s.food += amount * 0.12;
      s.mood = Math.min(0.99, s.mood + 0.08);
      const recipients = livingNpcs(state).filter((n) => n.settlementId === s.id);
      for (const n of recipients) {
        n.wealth += amount / Math.max(1, recipients.length) * 0.35;
        n.happiness = Math.min(1, n.happiness + 0.1);
        n.opinionOfJohan = Math.min(1, n.opinionOfJohan + 0.12);
        remember(n, state.world.day, 'Johan gave freely, and asked for nothing.');
      }
      return addEvent(state, {
        category: 'johan',
        type: 'gift',
        title: `${amount} given to ${s.name}`,
        detail: `Johan poured ${amount} into ${s.name}'s treasury. The inhabitants keep every building and every deed; nothing was bought.`,
        where: s.name,
        important: true,
        consequence: 'Prices settle, bellies fill, and the settlement remembers.',
      });
    }

    case 'donate_npc': {
      const near = livingNpcs(state)
        .filter((n) => Math.abs(n.x - x) <= 2 && Math.abs(n.y - y) <= 2)
        .sort(
          (a, b) =>
            Math.abs(a.x - x) + Math.abs(a.y - y) - (Math.abs(b.x - x) + Math.abs(b.y - y)),
        );
      // "give to the baker" should reach the baker when one is standing there
      const wanted = String(hint || '').toLowerCase();
      const byName = wanted
        ? near.find((n) => wanted.includes(String(n.name).toLowerCase().split(' ')[0]))
        : null;
      const byJob = wanted ? near.find((n) => n.job && wanted.includes(String(n.job).toLowerCase())) : null;
      const person = byName || byJob || near[0] || null;
      if (!person) return null;
      const amount = Math.round(40 + rand() * 160);
      person.wealth += amount;
      person.happiness = Math.min(1, (person.happiness ?? 0.5) + 0.22);
      person.opinionOfJohan = Math.min(1, (person.opinionOfJohan ?? 0.5) + 0.2);
      remember(person, w.day, `Johan put ${amount} in my hand and asked for nothing back.`);
      return addEvent(state, {
        category: 'johan',
        type: 'gift',
        title: `${amount} given to ${person.name}`,
        detail: `${person.name}, ${person.job}, took the coins with no debt tied to them. Nothing was asked — not a name on a wall, not a share of their work.`,
        where: `${x},${y}`,
        actors: [person.id],
        important: true,
        consequence: 'One person is a little less afraid of the eye in the sky.',
      });
    }

    case 'donate_building': {
      const s = settlementAt(state, x, y) || nearestSettlement(state, x, y, 4);
      if (!s || !s.buildings.length) return null;
      // fund the building that was named, else the newest one standing
      const wantedBuilding = String(hint || '').toLowerCase();
      const namedBuilding = wantedBuilding
        ? s.buildings.find((b) => wantedBuilding.includes(String(b).toLowerCase()))
        : null;
      const building = namedBuilding || s.buildings[s.buildings.length - 1];
      const amount = Math.round(150 + rand() * 450);
      s.treasury += amount;
      s.mood = Math.min(0.99, s.mood + 0.05);
      s.culture += 0.03;
      const label = String(building).charAt(0).toUpperCase() + String(building).slice(1);
      s.fundedBuilding = { name: building, amount, day: w.day };
      const keepers = livingNpcs(state).filter((n) => n.settlementId === s.id);
      for (const n of keepers) {
        n.wealth += (amount / Math.max(1, keepers.length)) * 0.2;
        n.happiness = Math.min(1, (n.happiness ?? 0.5) + 0.06);
      }
      return addEvent(state, {
        category: 'johan',
        type: 'gift',
        title: `${label} in ${s.name} was funded`,
        detail: `${amount} went straight into the ${String(building).toLowerCase()} — roof, hinges, lamps and wages. The hands that keep it still own it.`,
        where: s.name,
        important: true,
        consequence: 'The building stands a little prouder, and everyone under it knows who paid.',
      });
    }

    default:
      return null;
  }
}

function emotion(state, tile, tag, sign, rand) {
  const labels = {
    hope: 'hope', trust: 'trust', compassion: 'compassion', courage: 'courage', creativity: 'creativity',
    fear: 'fear', anger: 'anger', paranoia: 'paranoia', greed: 'greed', despair: 'despair', jealousy: 'jealousy',
  };
  const near = [];
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const n = tileAt(state.world, tile.x + dx, tile.y + dy);
    if (n) near.push(n);
  }
  for (const t of near) {
    t.mood = clamp((t.mood || 0) + sign * 0.5, -1, 1);
    t.moodTag = tag;
    t.changedDay = state.world.day;
  }
  const affected = livingNpcs(state).filter((n) => Math.abs(n.x - tile.x) <= 2 && Math.abs(n.y - tile.y) <= 2);
  for (const n of affected) {
    n.happiness = clamp(n.happiness + sign * 0.15, 0.02, 1);
    if (tag === 'anger') n.traits.aggression = clamp(n.traits.aggression + 0.06, 0, 1);
    if (tag === 'compassion' || tag === 'trust') n.traits.kindness = clamp(n.traits.kindness + 0.05, 0, 1);
    if (tag === 'greed') n.traits.ambition = clamp(n.traits.ambition + 0.06, 0, 1);
    remember(n, state.world.day, `Felt a strange wave of ${labels[tag]} pass over the region.`);
  }
  return addEvent(state, {
    category: 'johan',
    type: 'emotion',
    title: `${sign > 0 ? 'A wave of ' + labels[tag] : 'A shadow of ' + labels[tag]} at ${tile.x},${tile.y}`,
    detail: `Johan pressed on the emotional air of ${near.length} tiles. Nothing is compelled — but ${affected.length} inhabitants feel it, and will decide for themselves what to do.`,
    where: `${tile.x},${tile.y}`,
    important: true,
  });
}

const raiseRange = raiseMountains;
const carveWater = carveRiver;
const plantForest = growForest;
const fillLake = makeLake;
const claimLand = claimTile;

/* ------------------------------- dialogue -------------------------------- */

export function dialogueTopics(state, npc) {
  const s = settlementOf(state, npc);
  const topics = ['self', 'family', 'work', 'land', 'johan', 'history'];
  if (s && state.wars.some((w) => !w.endedDay && w.aId === s.nationId && w.bId)) topics.push('war');
  if (!state.wars.some((w) => !w.endedDay)) topics.splice(topics.indexOf('war'), 1);
  return topics;
}

const OPINION_WORDS = [
  [-0.35, 'afraid of you'],
  [-0.1, 'wary of you'],
  [0.2, 'unsure what to make of you'],
  [0.5, 'grateful to you'],
  [1.1, 'devoted to you'],
];

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function opinionWord(npc) {
  for (const [limit, word] of OPINION_WORDS) if (npc.opinionOfJohan < limit) return word;
  return 'devoted to you';
}

export function talk(state, npc, topic, rand = Math.random) {
  const s = settlementOf(state, npc);
  const partner = npc.partnerId ? state.npcs.find((n) => n.id === npc.partnerId) : null;
  const children = state.npcs.filter((n) => n.parentIds.includes(npc.id) && n.alive);
  const nation = nationOf(state, npc);
  const place = s ? s.name : 'the open land';
  const mood = npc.happiness > 0.7 ? 'content' : npc.happiness > 0.45 ? 'even' : 'troubled';
  npc.metJohan = true;
  npc.lastSpokeDay = state.world.day;
  remember(npc, state.world.day, `Johan spoke with me about ${topic}.`);

  let text = '';
  switch (topic) {
    case 'self': {
      text = s
        ? `I am ${npc.name}. ${npc.job === 'child' ? 'Still a child' : `A ${npc.job}`} in ${place}, and I spend what I can on ${npc.hobby}. `
        : `I am ${npc.name}. I have no roof but the sky over ${npc.x},${npc.y}, and I am ${ageLabel(npc)}. `;
      text += npc.traits.curiosity > 0.6
        ? 'I want to see what is past the next hill before I die.'
        : 'I want a quiet year and enough to eat.';
      break;
    }
    case 'family': {
      const bits = [];
      if (partner) bits.push(`My ${partner.sex === 'f' ? 'wife' : 'husband'} ${partner.firstName} is ${partner.job}.`);
      if (children.length) bits.push(`We have ${children.length} ${children.length === 1 ? 'child' : 'children'}${children.length ? `: ${children.slice(0, 3).map((c) => c.firstName).join(', ')}` : ''}.`);
      if (!partner && !children.length) bits.push(`I have no household yet. My family name is ${npc.familyName}.`);
      if (npc.generation > 1) bits.push(`My line is ${npc.generation} generations deep in this world.`);
      text = bits.join(' ');
      break;
    }
    case 'work': {
      const business = npc.businessId ? state.businesses.find((b) => b.id === npc.businessId) : null;
      if (business) text = `I own ${business.name} in ${place}. ${business.employees} hands work with me, and last season we cleared ${Math.round(business.profit * 30)} beyond costs.`;
      else if (s) text = `I am a ${npc.job} in ${place}. ${s.buildings.length ? `I helped raise the ${s.buildings[s.buildings.length - 1].toLowerCase()}.` : 'We have built little so far.'} I keep ${Math.round(npc.wealth)} in coin.`;
      else text = `I forage. ${npc.wealth > 30 ? 'I have done well enough.' : 'Some days I eat, some days I do not.'}`;
      break;
    }
    case 'land': {
      text = s
        ? `${place} holds ${plural(s.population, 'soul')} and ${plural(s.buildings.length, 'building')}. ${s.food > 8 ? 'The granary is full.' : 'We are watching the granary.'} ${nation ? `We answer to ${nation.name}.` : 'We answer to no nation yet.'}`
        : `There is no settlement here. ${npc.x},${npc.y} is wild, and I like it that way.`;
      break;
    }
    case 'johan': {
      const o = npc.opinionOfJohan;
      const view = opinionWord(npc);
      if (o > 0.45) text = `I am ${view}. When the ground shook, it stopped where you wished, and ${place} still stands. I do not understand what you are, but I am glad of you.`;
      else if (o > 0.05) text = `They say I should be ${view}. I have seen the map in your cabin only in stories. Do not take my children from me, and we will have no quarrel.`;
      else if (o > -0.35) text = `I am ${view}, Creator. The old ones say you drowned a coast for a lesson. I keep my own counsel.`;
      else text = `I am ${view}. You gave us life, and then you gave us plague, and we buried the children ourselves. Do not ask me for worship.`;
      break;
    }
    case 'history': {
      const memories = npc.memories.slice(-2).map((m) => m.text);
      const localEvents = state.events.filter((e) => (s ? e.where.includes(s.name) : false)).slice(-2);
      text = memories.length ? memories.join(' ') : `I am ${Math.floor(npc.age)} years old and little has happened to me worth telling.`;
      if (localEvents.length) text += ` They still speak of the day ${localEvents[localEvents.length - 1].title.toLowerCase()}.`;
      break;
    }
    case 'war': {
      const war = state.wars.find((w) => !w.endedDay && s && (w.aId === s.nationId || w.bId === s.nationId));
      if (war) {
        const otherId = war.aId === s.nationId ? war.bId : war.aId;
        const other = state.nations.find((n) => n.id === otherId);
        text = `The war with ${other ? other.name : 'them'} has taken ${war.casualties} of our people. ${npc.traits.aggression > 0.6 ? 'I would march myself if I were younger.' : 'I would give up a hill or two to stop the burying.'}`;
      } else text = 'There is peace where I am. I intend to keep it.';
      break;
    }
    default:
      text = 'I have nothing to say to that.';
  }

  // small opinion shifts from being noticed
  const toward = topic === 'johan' ? (npc.traits.piety > 0.5 ? 0.05 : -0.02) : 0.01;
  npc.opinionOfJohan = clamp(npc.opinionOfJohan + toward, -1, 1);
  npc.happiness = clamp(npc.happiness + 0.01, 0, 1);

  return { text, mood, opinion: npc.opinionOfJohan };
}
