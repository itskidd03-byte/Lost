// The people Johan lets loose into the world — once.
//
// They walk in at his first land tile, a hundred of them, and after that
// nothing is spawned for him: they are born, they grow old, they work, they
// build homes and shops, they form councils and kingdoms, and when a camp grows
// too crowded a group splits off and founds its own camp somewhere nearby. The
// simulation runs whether or not Johan is standing there; walking into a region
// only changes what is drawn, never who exists.

import * as THREE from 'three';
import { key, tileAt, isLand } from './world.js';

export const ERAS = [
  { id: 'stone', name: 'Stone Age', blurb: 'Foragers, flint and hide tents', homesPer: 4, homeCap: 28 },
  { id: 'bronze', name: 'Bronze Age', blurb: 'Kilns, cast bronze and the first fields', homesPer: 4, homeCap: 34 },
  { id: 'iron', name: 'Iron Age', blurb: 'Iron ploughs and hill forts', homesPer: 5, homeCap: 40 },
  { id: 'medieval', name: 'Medieval', blurb: 'Mills, guilds and stone keeps', homesPer: 5, homeCap: 46 },
  { id: 'industrial', name: 'Industrial', blurb: 'Steam, rails and chimneys', homesPer: 6, homeCap: 54 },
  { id: 'modern', name: 'Modern Era', blurb: 'Glass, power lines and dishes on the roofs', homesPer: 6, homeCap: 62 },
];

const GOVERNMENTS = [
  { id: 'band', name: 'Bands', note: 'a handful of families and no one in charge', min: 0, era: 0 },
  { id: 'elders', name: 'Council of Elders', note: 'the oldest voices decide together', min: 18, era: 0 },
  { id: 'chief', name: 'Chiefdom', note: 'one chief, chosen by the strong', min: 34, era: 1 },
  { id: 'king', name: 'Kingdom', note: 'a crowned line and its court', min: 60, era: 3 },
  { id: 'republic', name: 'Republic', note: 'elected magistrates and a written law', min: 110, era: 4 },
  { id: 'democracy', name: 'Democracy', note: 'every adult voice counted', min: 180, era: 5 },
];

const FIRST = [
  'Ash', 'Bryn', 'Cael', 'Dara', 'Ede', 'Fenn', 'Gorm', 'Hild', 'Ivo', 'Jori',
  'Kesh', 'Lios', 'Mara', 'Nemi', 'Orin', 'Pell', 'Quin', 'Rill', 'Saga', 'Tove',
  'Ari', 'Bela', 'Corin', 'Duna', 'Elm', 'Faye', 'Gil', 'Hana', 'Ines', 'Joss',
];
const SECOND = ['of the ford', 'the quick', 'the patient', 'of the pines', 'the fisher', 'two-knives', 'the quiet', 'of the marsh', 'the elder', 'of the hill'];
const CAMP_FIRST = ['Ash', 'Barrow', 'Cinder', 'Dun', 'Elm', 'Fen', 'Grey', 'Hollow', 'Iron', 'Kell', 'Lark', 'Moss', 'North', 'Oak', 'Pell', 'Quarry', 'Rook', 'Stone', 'Thorn', 'Vale'];
const CAMP_LAST = ['ford', 'mere', 'stead', 'wick', 'hollow', 'ridge', 'field', 'brook', 'gate', 'moor'];

const BUSINESSES = [
  { era: 3, names: ['Mill', 'Bakery', 'Smithy', 'Weaver\'s shop', 'Tavern', 'Market stall'] },
  { era: 4, names: ['Foundry', 'Rail depot', 'Textile works', 'Bank', 'Printing house', 'Coal yard'] },
  { era: 5, names: ['Power station', 'Department store', 'Motor works', 'Radio station', 'Hospital trust', 'Data exchange'] },
];

const CIVICS = [
  { era: 1, name: 'Village well' },
  { era: 2, name: 'Granary' },
  { era: 3, name: 'Schoolroom' },
  { era: 3, name: 'Meeting hall' },
  { era: 4, name: 'Courthouse' },
  { era: 4, name: 'Infirmary' },
  { era: 5, name: 'University' },
  { era: 5, name: 'Public library' },
];

function hash(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function pick(list, r) {
  return list[Math.floor(Math.abs(r) * list.length) % list.length];
}

const TS = 4;

export class Society {
  constructor(state) {
    this.state = state;
    this.data = null;
    this.views = [];
    this.group = null;
    this.region = null;
    this.time = 0;
    this.onEvent = null;
    this.mats = null;
    this.geos = null;
    this.colors = null;
  }

  /* ------------------------------- founding -------------------------------- */

  // Only ever called with the first land tile Johan walks into. After that the
  // flag is set, and no amount of walking spawns anybody.
  ensureFounded(tile) {
    if (this.data?.founded) return false;
    if (!tile || !isLand(tile)) return false;
    const camp = this.makeCamp(tile.x, tile.y, 'First Camp', true);
    this.data = {
      founded: true,
      homeTile: { x: tile.x, y: tile.y },
      camps: [camp],
      landTiles: this.countLand(),
      nextPersonId: 100,
      nextCampId: 2,
      born: 0,
      died: 0,
      history: [],
    };
    for (const camp of this.data.camps) this.headcount(camp);
    this.rebuildClaims();
    this.note(`Johan's hundred step onto ${tile.x},${tile.y} and call it the First Camp.`);
    this.save();
    return true;
  }

  // How many people the ground around a camp can actually carry. This is the
  // ceiling that stops the world filling up forever: finite land, finite
  // harvest, finite population.
  capacity(camp) {
    const y = camp.yields || { forest: 8, water: 4, grass: 20 };
    const cap = 60 + y.grass * 1.6 + y.water * 0.8 + y.forest * 0.7;
    return Math.round(Math.max(70, Math.min(220, cap)));
  }

  countLand() {
    const world = this.state?.world;
    if (!world?.tiles) return 400;
    let land = 0;
    for (const tile of world.tiles.values()) if (isLand(tile)) land++;
    return land;
  }

  // A finite world holds a finite number of camps: roughly one per fifty
  // tiles of habitable ground, and never more than twelve.
  maxCamps() {
    const land = this.data?.landTiles ?? 400;
    return Math.max(3, Math.min(12, Math.round(land / 50)));
  }

  makeCamp(x, y, name, withPeople) {
    const camp = {
      id: (this.data?.nextCampId ?? 1),
      name,
      x,
      y,
      foundedDay: this.state?.world?.day ?? 0,
      people: [],
      territory: [`${x},${y}`],
      isKingdom: false,
      food: 60,
      wood: 30,
      knowledge: 0,
      era: 0,
      homes: 2,
      buildings: [],
      businesses: [],
      civics: [],
      government: { id: 'band', name: 'Bands', leader: null, since: 0 },
      yields: null,
      progress: 0,
    };
    if (withPeople) {
      for (let i = 0; i < 100; i++) {
        camp.people.push(this.makePerson(i, i % 2 === 0 ? 'f' : 'm', 16 + Math.floor(hash(i * 3.1) * 24)));
      }
    }
    this.chooseLeader(camp);
    return camp;
  }

  makePerson(id, sex, age) {
    const r = hash(id * 5.7 + 1.3);
    const r2 = hash(id * 13.3 + 7.1);
    return {
      id,
      name: `${pick(FIRST, r)} ${pick(SECOND, r2)}`,
      sex,
      age,
      job: this.jobFor(age, r),
      partner: null,
      campId: null,
      bornBy: null,
    };
  }

  jobFor(age, r) {
    if (age < 6) return 'child';
    if (age < 14) return 'young';
    if (age > 58) return 'elder';
    if (r < 0.42) return 'forager';
    if (r < 0.66) return 'woodcutter';
    if (r < 0.8) return 'fisher';
    if (r < 0.9) return 'hunter';
    return 'builder';
  }

  chooseLeader(camp) {
    const adults = camp.people.filter((p) => p.age >= 18);
    if (!adults.length) {
      camp.government.leader = null;
      return;
    }
    const chosen = adults.reduce((best, p) => (p.age > best.age ? p : best), adults[0]);
    camp.government.leader = chosen.name;
    camp.government.since = this.state?.world?.day ?? 0;
  }

  /* --------------------------------- tick ---------------------------------- */

  // Runs on real time, in every mode: the world keeps working while Johan is in
  // the cabin or asleep.
  tick(dt) {
    if (!this.data?.founded) return;
    const step = Math.min(dt, 0.75);
    this.time += step;
    const world = this.state?.world;

    for (const camp of this.data.camps) {
      if (!camp.yields) camp.yields = this.readLand(camp, world);
      this.workCamp(camp, step, world);
    }

    // the land a camp holds grows with the people living in it
    for (const camp of this.data.camps) this.growTerritory(camp, world);

    // people who no longer agree with the crown walk out and start again
    for (const camp of [...this.data.camps]) this.considerMigration(camp, world);

    // kingdoms whose borders touch find reasons to fight
    this.tickWars();

    // a camp with nobody left is a ruin, not a place
    if (this.data.camps.length > 1) {
      const dead = this.data.camps.filter((c) => this.headcount(c) <= 0);
      for (const camp of dead) {
        this.data.camps = this.data.camps.filter((c) => c !== camp);
        this.note(`${camp.name} stands empty. ${camp.homes} homes and ${camp.civics.length} halls, and no one left to use them.`);
      }
    }
  }

  readLand(camp, world) {
    let forest = 0;
    let water = 0;
    let grass = 0;
    if (!world) return { forest: 2, water: 1, grass: 4 };
    for (let dx = -6; dx <= 6; dx++) {
      for (let dy = -6; dy <= 6; dy++) {
        const tile = tileAt(world, camp.x + dx, camp.y + dy);
        if (!tile) continue;
        if (tile.biome === 'forest' || tile.biome === 'deepforest' || tile.biome === 'swamp') forest++;
        else if (['lake', 'river', 'coast', 'ocean'].includes(tile.biome)) water++;
        else if (tile.biome === 'grass' || tile.biome === 'meadow') grass++;
      }
    }
    return { forest, water, grass };
  }

  // A camp's people are held as a head count; the named people are a sample of
  // them, enough to be faces and voices without simulating tens of thousands.
  headcount(camp) {
    if (camp.pop == null) camp.pop = camp.people.length;
    return camp.pop;
  }

  workCamp(camp, dt, world) {
    const pop = this.headcount(camp);
    const y = camp.yields || { forest: 8, water: 4, grass: 20 };
    // the land around a camp sets how much it can pull from it
    const land = 0.8 + Math.min(0.9, y.grass * 0.005 + y.water * 0.008);
    const timber = 0.7 + Math.min(0.7, y.forest * 0.012);
    const eff = 1 + camp.era * 0.3;

    let hands = 0;
    let sampled = 0;
    for (const p of [...camp.people]) {
      p.age += dt * 0.012; // a year every eighty seconds of watching
      // people grow into and out of their work as the years pass
      p.job = this.jobFor(p.age, hash(p.id * 5.7 + 1.3));
      // how willing they are to live under the crown: ambition and learning both
      // push against it, a republic holds them, hunger makes it worse
      if (p.dissent == null) p.dissent = hash(p.id * 4.41) * 0.55;
      const rank = this.governmentRank(camp);
      const crowded = camp.food < pop ? 2.2 : 1;
      p.dissent += dt * (rank >= 3 ? 0.004 : 0.0012) * crowded;
      if (rank <= 2) p.dissent -= dt * 0.0015;
      p.dissent = Math.max(0, Math.min(1.6, p.dissent));
      sampled++;
      if (p.age < 8 || p.job === 'child') continue;
      if (p.age < 14) {
        hands += 0.5;
      } else if (p.age < 58) {
        hands += 1;
      } else {
        hands += 0.4;
      }
    }
    // the named sample is too small and too young to speak for the whole camp,
    // so work is taken from the age structure of a settled village instead
    hands = pop * 0.48;

    // feeding and sheltering the camp
    const eat = pop * 0.2;
    // farmland is finite: twice the hands does not mean twice the harvest
    camp.food += (0.6 + Math.sqrt(hands) * 3.2 * land) * eff * dt;
    camp.food -= eat * dt;

    // timber, and what the trades add to it
    const businessBonus = 1 + camp.businesses.length * 0.05;
    camp.wood += (0.15 + hands * 0.05 * timber) * eff * businessBonus * dt;

    // knowledge comes mostly from the halls and shops, not from digging
    const civicBonus = 1 + camp.civics.length * 0.12;
    camp.knowledge += (0.25 + pop * 0.003 + camp.businesses.length * 0.05) * civicBonus * eff * dt;
    const nextNeed = [400, 1200, 3000, 7000, 14000][camp.era];
    if (nextNeed) camp.knowledge = Math.min(camp.knowledge, nextNeed * 1.25);

    camp.food = Math.max(0, Math.min(camp.food, 260 + pop * 4));
    camp.wood = Math.min(camp.wood, 200 + pop * 2);

    // hunger takes the oldest first, and only when the stores are truly empty
    if (camp.food <= 0 && pop > 4) {
      const victim = camp.people.length
        ? camp.people.reduce((old, p) => (p.age > old.age ? p : old), camp.people[0])
        : null;
      if (victim) camp.people = camp.people.filter((p) => p !== victim);
      camp.pop = pop - 1;
      this.data.died++;
      if (victim && this.data.died % 15 === 1) this.note(`Hunger in ${camp.name}. ${victim.name} did not see the next dawn.`);
    }

    // old age among the named, and quietly among the rest
    for (const p of [...camp.people]) {
      const limit = 62 + hash(p.id * 7.7) * 22;
      if (p.age > limit) {
        camp.people = camp.people.filter((q) => q !== p);
        camp.pop = Math.max(1, this.headcount(camp) - 1);
        this.data.died++;
      }
    }
    const hidden = Math.max(0, this.headcount(camp) - camp.people.length);
    if (hidden > 0) camp.pop = Math.max(camp.people.length, camp.pop - hidden * dt * 0.00008);
    const now = this.headcount(camp);

    // homes are built with a little room to spare
    const homesPer = ERAS[camp.era].homesPer;
    const homeCost = 24 + camp.era * 12;
    if (camp.wood >= homeCost && camp.homes * homesPer < now * 1.25) {
      camp.wood -= homeCost;
      camp.homes++;
    }

    const room = camp.homes * homesPer - now;
    if (camp.food > now * 0.5 && room > 1) {
      const couples = this.couples(camp);
      const strained = now < 20 ? 2.5 : 1;
      // a growing town keeps growing: food and houses are the only brakes
      const pull = strained * (1 + Math.min(2, room / Math.max(8, now)));
      if (couples > 0 && hash(this.time * 0.37 + camp.id) < dt * 0.014 * couples * pull) {
        this.birth(camp);
      }
    }

    this.growBusiness(camp, dt);
    this.growCivics(camp);
    this.growEra(camp);
    this.growGovernment(camp);
    camp.progress = this.progress(camp);
  }

  couples(camp) {
    return Math.min(26, Math.round(this.headcount(camp) * 0.2));
  }

  birth(camp) {
    camp.pop = this.headcount(camp) + 1;
    this.data.born++;
    // only the first sixty or so get names; the rest are counted, not written down
    if (camp.people.length >= 60) return;
    const women = camp.people.filter((p) => p.sex === 'f' && p.age >= 17 && p.age < 44);
    const mother = women.length
      ? women[Math.floor(hash(this.time + camp.id) * women.length) % women.length]
      : null;
    const id = this.data.nextPersonId++;
    const child = this.makePerson(id, hash(id * 3.3) > 0.5 ? 'f' : 'm', 0);
    if (child.sex === 'm' && hash(id * 1.7) > 0.6) child.sex = 'f';
    child.campId = camp.id;
    child.bornBy = mother?.name ?? null;
    camp.people.push(child);
    if (this.data.born % 25 === 1) {
      this.note(mother
        ? `${mother.name} of ${camp.name} gave birth to ${child.name}. The camp has ${Math.round(this.headcount(camp))} souls.`
        : `${child.name} is born in ${camp.name}. The camp has ${Math.round(this.headcount(camp))} souls.`);
    }
    if (this.onBirth) this.onBirth(camp, child);
  }

  growBusiness(camp, dt) {
    const tiers = BUSINESSES.filter((b) => camp.era >= b.era);
    if (!tiers.length) return;
    const cap = 5 + camp.era * 3;
    const allowed = Math.min(cap, Math.max(0, Math.floor(this.headcount(camp) / (16 - camp.era * 1.5)))) - camp.businesses.length;
    if (allowed <= 0) return;
    if (hash(this.time * 0.13 + camp.id * 3.7) > dt * 0.09) return;
    const tier = tiers[tiers.length - 1];
    const name = pick(tier.names, hash(camp.businesses.length + camp.id * 5.3));
    camp.businesses.push({ name, era: camp.era });
    this.note(`${name} opens in ${camp.name}. ${camp.businesses.length} businesses now trade there.`);
  }

  growCivics(camp) {
    const next = CIVICS.find((c) => camp.era >= c.era && !camp.civics.includes(c.name));
    if (!next) return;
    if (this.headcount(camp) < 20 + camp.civics.length * 14) return;
    const cost = 40 + camp.civics.length * 30;
    if (camp.wood < cost) return;
    camp.wood -= cost;
    camp.civics.push(next.name);
    this.note(`${next.name} is raised in ${camp.name}.`);
  }

  growEra(camp) {
    const next = ERAS[camp.era + 1];
    if (!next) return;
    const need = {
      pop: 26 + camp.era * 18,
      homes: 3 + camp.era * 2,
      knowledge: [400, 1200, 3000, 7000, 14000][camp.era] ?? 14000,
      food: 40 + camp.era * 35,
    };
    if (this.headcount(camp) < need.pop) return;
    if (camp.homes < need.homes) return;
    if (camp.knowledge < need.knowledge) return;
    if (camp.food < need.food) return;
    camp.era++;
    camp.buildings = [];
    if (this.onEra) this.onEra(camp, ERAS[camp.era], ERAS[camp.era - 1]);
    this.note(`${camp.name} enters the ${ERAS[camp.era].name}: ${ERAS[camp.era].blurb.toLowerCase()}.`);
  }

  growGovernment(camp) {
    const current = GOVERNMENTS.findIndex((g) => g.id === camp.government.id);
    const options = GOVERNMENTS.filter((g, i) => i > current && this.headcount(camp) >= g.min && camp.era >= g.era);
    const best = options[options.length - 1];
    if (best) {
      const previous = camp.government;
      camp.government = { id: best.id, name: best.name, leader: previous.leader, since: this.state?.world?.day ?? 0 };
      this.chooseLeader(camp);
      this.note(`${camp.name} becomes a ${best.name} — ${best.note}. ${camp.government.leader ?? 'No one'} leads it.`);
    }
  }

  /* ------------------------- land, migration and war ----------------------- */

  governmentRank(camp) {
    return Math.max(0, GOVERNMENTS.findIndex((g) => g.id === camp.government.id));
  }

  rebuildClaims() {
    this.claimed = new Map();
    for (const camp of this.data?.camps || []) {
      if (!camp.territory || !camp.territory.length) camp.territory = [`${camp.x},${camp.y}`];
      for (const k of camp.territory) this.claimed.set(k, camp.id);
    }
  }

  claim(camp, x, y) {
    const k = `${x},${y}`;
    if (this.claimed.has(k)) return false;
    if (!camp.territory) camp.territory = [];
    camp.territory.push(k);
    this.claimed.set(k, camp.id);
    return true;
  }

  // A camp's holdings grow with its people: about one tile for every ten souls.
  // Kingdoms take the land around them faster than a band ever does.
  growTerritory(camp, world) {
    if (!this.claimed) this.rebuildClaims();
    const rank = this.governmentRank(camp);
    const per = rank >= 3 ? 4 : 6;
    const target = 1 + Math.floor((this.headcount(camp) || 0) / per);
    const have = (camp.territory || []).length;
    if (have >= target) return;
    // a great kingdom reaches further than a village does
    // land is taken from the edge of what the camp already holds, so a country
    // grows as one shape instead of scattering dots across the board
    for (let i = 0; i < 6 && (camp.territory || []).length < target; i++) {
      const spot = this.freeNeighbour(camp, world) || this.freeTileNear(camp, world, 2, 5 + Math.min(35, Math.floor(have / 2)));
      if (!spot || !this.claim(camp, spot.x, spot.y)) break;
    }
  }

  freeNeighbour(camp, world) {
    const owned = camp.territory || [];
    if (!world || !owned.length) return null;
    const start = Math.floor(hash(camp.id * 1.7 + this.time * 0.07) * owned.length);
    for (let n = 0; n < owned.length; n++) {
      const [x, y] = owned[(start + n) % owned.length].split(',').map(Number);
      const spin = Math.floor(hash(camp.id + n * 3.1 + this.time * 0.03) * 4);
      for (let d = 0; d < 4; d++) {
        const [dx, dy] = [[1, 0], [0, 1], [-1, 0], [0, -1]][(d + spin) % 4];
        const nx = x + dx;
        const ny = y + dy;
        const tile = tileAt(world, nx, ny);
        if (!tile || !isLand(tile)) continue;
        if (this.claimed.has(`${nx},${ny}`)) continue;
        return { x: nx, y: ny };
      }
    }
    return null;
  }

  freeTileNear(camp, world, minRing = 2, maxRing = 12) {
    if (!world) return null;
    for (let ring = minRing; ring <= maxRing; ring++) {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + hash(camp.id * 7 + ring * 3 + i) * 0.4;
        const x = Math.round(camp.x + Math.cos(a) * ring);
        const y = Math.round(camp.y + Math.sin(a) * ring);
        const tile = tileAt(world, x, y);
        if (!tile || !isLand(tile)) continue;
        if (this.claimed?.has(`${x},${y}`)) continue;
        return { x, y };
      }
    }
    return null;
  }

  // Whoever has had enough of the crown goes looking for land of their own.
  considerMigration(camp, world) {
    const pop = this.headcount(camp);
    if (pop < 45) return;
    if (this.data.camps.length >= 16) return;
    if (this.time - (camp.lastMigration || 0) < 600) return;
    // people only leave when there are enough of them to spare and stores to share
    if (camp.food < pop * 0.8) return;
    const willing = camp.people.filter((p) => p.age >= 15 && (p.dissent ?? 0) > 0.88);
    const share = Math.round(pop * 0.05);
    if (willing.length < 2 && share < 5) return;
    const leavers = willing.slice(0, Math.min(10, willing.length));
    const moved = Math.max(leavers.length, Math.min(18, share));
    const spot = this.freeTileNear(camp, world, 2, 40);
    if (!spot) return;
    camp.lastMigration = this.time;
    this.foundCamp(camp, leavers, spot, moved);
  }

  foundCamp(parent, leavers, spot, moved = leavers.length) {
    const id = this.data.nextCampId++;
    const name = this.campName(spot, id);
    const kid = {
      id,
      name,
      x: spot.x,
      y: spot.y,
      foundedDay: this.state?.world?.day ?? 0,
      people: leavers,
      territory: [`${spot.x},${spot.y}`],
      pop: Math.max(leavers.length, moved),
      food: Math.max(30, Math.max(leavers.length, moved) * 2.6),
      wood: Math.max(16, Math.max(leavers.length, moved) * 2),
      knowledge: Math.max(0, parent.knowledge * 0.08),
      era: parent.era,
      homes: 2,
      buildings: [],
      businesses: [],
      civics: [],
      government: { id: 'band', name: 'Bands', leader: null, since: 0 },
      yields: null,
      progress: 0,
    };
    parent.food *= 0.86;
    parent.wood *= 0.86;
    parent.people = parent.people.filter((p) => !leavers.includes(p));
    parent.pop = Math.max(parent.people.length, this.headcount(parent) - Math.max(leavers.length, moved));
    for (const p of leavers) {
      p.campId = id;
      p.dissent = hash(p.id * 9.1) * 0.3;
    }
    this.chooseLeader(kid);
    this.chooseLeader(parent);
    this.claim(kid, spot.x, spot.y);
    this.data.camps.push(kid);
    const why = parent.government.id === 'king' || parent.government.id === 'kingdom' ? 'the crown' : 'the way things are run';
    this.note(`${Math.max(leavers.length, moved)} of ${parent.name} leave ${why} behind and found ${name} at ${spot.x},${spot.y}.`);
    if (this.onSplit) this.onSplit(kid);
    return kid;
  }

  borders(a, b) {
    for (const k of a.territory || []) {
      const [x, y] = k.split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (this.claimed?.get(`${x + dx},${y + dy}`) === b.id) return true;
      }
    }
    return false;
  }

  tickWars() {
    if (!this.data.wars) this.data.wars = [];
    if (!this.claimed) this.rebuildClaims();
    if (this.time - (this.lastWarCheck || 0) < 5) return;
    this.lastWarCheck = this.time;

    for (const war of [...this.data.wars]) {
      const a = this.data.camps.find((c) => c.id === war.a);
      const b = this.data.camps.find((c) => c.id === war.b);
      if (!a || !b) {
        this.data.wars = this.data.wars.filter((w) => w !== war);
        continue;
      }
      // a season of skirmishes
      const killA = Math.max(1, Math.round(this.headcount(a) * 0.004));
      const killB = Math.max(1, Math.round(this.headcount(b) * 0.004));
      this.cull(a, killA);
      this.cull(b, killB);
      a.food *= 0.97;
      b.food *= 0.97;
      if (this.time > war.until) this.endWar(war, a, b);
    }

    if (this.data.wars.length >= 3) return;
    const kingdoms = this.data.camps.filter((c) => this.governmentRank(c) >= 3 && this.headcount(c) > 18);
    if (kingdoms.length < 2) return;
    // more colonies, more chances of a quarrel over the border
    const chance = Math.min(0.003, 0.0006 + this.data.camps.length * 0.00006);
    for (let i = 0; i < kingdoms.length; i++) {
      for (let j = i + 1; j < kingdoms.length; j++) {
        const a = kingdoms[i];
        const b = kingdoms[j];
        if (this.data.wars.some((w) => (w.a === a.id && w.b === b.id) || (w.a === b.id && w.b === a.id))) continue;
        if (!this.borders(a, b)) continue;
        if (hash(this.time * 0.31 + a.id * 7 + b.id * 13) > chance) continue;
        this.startWar(a, b);
        return;
      }
    }
  }

  cull(camp, n) {
    for (let i = 0; i < n && this.headcount(camp) > 2; i++) {
      camp.pop = this.headcount(camp) - 1;
      if (camp.people.length > 2) {
        const index = Math.floor(hash(camp.id * 3.1 + this.time + i * 7.7) * camp.people.length) % camp.people.length;
        camp.people.splice(index, 1);
      }
      this.data.died++;
    }
  }

  startWar(a, b) {
    a.lastWar = this.time;
    b.lastWar = this.time;
    this.data.wars.push({ a: a.id, b: b.id, since: this.time, until: this.time + 30 + 60 * hash(a.id + b.id * 3) });
    this.note(`${a.name} and ${b.name} go to war over their borders.`);
    if (this.onWar) this.onWar(a, b);
  }

  endWar(war, a, b) {
    const winner = this.headcount(a) >= this.headcount(b) ? a : b;
    const loser = winner === a ? b : a;
    const take = Math.min(2, Math.max(0, (loser.territory || []).length - 1));
    for (let i = 0; i < take; i++) {
      const k = loser.territory.pop();
      if (!k) break;
      winner.territory.push(k);
      this.claimed.set(k, winner.id);
    }
    this.data.wars = this.data.wars.filter((w) => w !== war);
    if (!this.data.peace) this.data.peace = {};
    this.data.peace[`${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`] = this.time;
    this.note(`${winner.name} breaks ${loser.name}, taking ${take} border tiles and the fields on them.`);
  }

    campName(spot, id) {
    return `${pick(CAMP_FIRST, hash(spot.x * 3.1 + spot.y * 7.7))}${pick(CAMP_LAST, hash(id * 5.3))}`;
  }

  progress(camp) {
    const next = ERAS[camp.era + 1];
    if (!next) return 1;
    const need = {
      pop: 26 + camp.era * 18,
      homes: 3 + camp.era * 2,
      knowledge: [400, 1200, 3000, 7000, 14000][camp.era] ?? 14000,
      food: 40 + camp.era * 35,
    };
    const parts = [
      Math.min(1, this.headcount(camp) / need.pop),
      Math.min(1, camp.homes / need.homes),
      Math.min(1, camp.knowledge / need.knowledge),
      Math.min(1, camp.food / need.food),
    ];
    return parts.reduce((a, b) => a + b, 0) / parts.length;
  }

  note(text) {
    if (!this.data) return;
    const day = this.state?.world?.day ?? 0;
    this.data.history.push({ day, text });
    if (this.data.history.length > 60) this.data.history.shift();
    if (this.onNote) this.onNote(text, day);
  }

  /* -------------------------------- reading -------------------------------- */

  nearestCamp(playerPos = null) {
    if (!this.data?.camps.length) return null;
    let best = this.data.camps[0];
    let bestD = Infinity;
    for (const camp of this.data.camps) {
      if (playerPos && this.region && this.views.length) {
        const pos = this.campLocal(camp);
        const d = Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z);
        if (d < bestD) {
          bestD = d;
          best = camp;
        }
        continue;
      }
      // away from the camps, "nearest" is measured on the world map
      const c = this.region?.center ?? this.data.homeTile;
      const d = Math.abs(camp.x - c.x) + Math.abs(camp.y - c.y);
      if (d < bestD) {
        bestD = d;
        best = camp;
      }
    }
    return best;
  }

  campLocal(camp) {
    const c = this.region?.center ?? this.data.homeTile;
    const info = this.region?.tiles?.get(key(camp.x, camp.y));
    if (info) return { x: info.x, z: info.z, top: info.top };
    return { x: (camp.x - c.x) * TS, z: (camp.y - c.y) * TS, top: 0 };
  }

  snapshot(playerPos = null) {
    const camp = this.nearestCamp(playerPos);
    if (!camp) {
      return { founded: false, people: 0, camps: 0 };
    }
    const near = this.nearestPerson(camp, playerPos);
    return {
      founded: true,
      camps: this.data.camps.length,
      born: this.data.born,
      died: this.data.died,
      name: camp.name,
      era: ERAS[camp.era].name,
      blurb: ERAS[camp.era].blurb,
      next: ERAS[camp.era + 1]?.name ?? null,
      progress: camp.progress,
      population: Math.round(this.headcount(camp)),
      territory: (camp.territory || []).length,
      kingdom: this.governmentRank(camp) >= 3,
      wars: (this.data.wars || []).length,
      homes: camp.homes,
      food: Math.round(camp.food),
      wood: Math.round(camp.wood),
      knowledge: Math.round(camp.knowledge),
      government: camp.government.name,
      leader: camp.government.leader,
      businesses: camp.businesses.map((b) => b.name),
      civics: camp.civics,
      person: near ? { name: near.name, job: near.job, age: Math.round(near.age) } : null,
    };
  }

  nearestPerson(camp, playerPos) {
    if (!playerPos || !this.views.length) return camp.people[0] ?? null;
    const view = this.views.find((v) => v.camp === camp);
    if (!view) return camp.people[0] ?? null;
    let best = null;
    let bestD = Infinity;
    for (const p of view.people) {
      if (!p.person) continue;
      const d = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
      if (d < bestD) {
        bestD = d;
        best = p.person;
      }
    }
    return best ?? camp.people[0] ?? null;
  }

  /* -------------------------------- visuals -------------------------------- */

  attachRegion(region) {
    this.detach();
    this.region = region;
    this.group = new THREE.Group();
    region.scene.add(this.group);
    this.makeMaterials();
    const c = region.center;
    for (const camp of this.data.camps) {
      if (Math.abs(camp.x - c.x) > 6 || Math.abs(camp.y - c.y) > 6) continue;
      this.views.push(this.buildView(camp, region));
    }
  }

  detach() {
    if (this.group) {
      this.group.parent?.remove(this.group);
      this.group.traverse((o) => {
        if (o.isMesh) {
          o.geometry?.dispose?.();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) m?.dispose?.();
        }
      });
    }
    this.views.length = 0;
    this.group = null;
    this.region = null;
  }

  makeMaterials() {
    this.mats = {
      stone: new THREE.MeshStandardMaterial({ color: 0x8d8578, roughness: 0.95 }),
      hide: new THREE.MeshStandardMaterial({ color: 0x7a5c42, roughness: 0.95 }),
      thatch: new THREE.MeshStandardMaterial({ color: 0x9a7f45, roughness: 0.95 }),
      timber: new THREE.MeshStandardMaterial({ color: 0x6b4f35, roughness: 0.9 }),
      plaster: new THREE.MeshStandardMaterial({ color: 0xcfc3a8, roughness: 0.95 }),
      brick: new THREE.MeshStandardMaterial({ color: 0x7d4a3c, roughness: 0.95 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xbcdbe6, roughness: 0.25, metalness: 0.2 }),
      modern: new THREE.MeshStandardMaterial({ color: 0xd8dde0, roughness: 0.55 }),
      ember: new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff5a12, emissiveIntensity: 2 }),
      skin: new THREE.MeshStandardMaterial({ color: 0xb5896a, roughness: 0.9 }),
      legs: new THREE.MeshStandardMaterial({ color: 0x5a4634, roughness: 0.95 }),
    };
    if (!this.geos) {
      this.geos = {
        body: new THREE.CapsuleGeometry(0.19, 0.68, 3, 6),
        head: new THREE.SphereGeometry(0.14, 8, 6),
        leg: new THREE.CylinderGeometry(0.065, 0.055, 0.52, 5),
      };
    }
  }

  buildView(camp, region) {
    const local = this.campLocal(camp);
    const base = this.region.groundAt(local.x, local.z);
    const view = { camp, base, people: [], huts: [], local };

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.1, 6, 14), this.mats.stone);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(local.x, base + 0.06, local.z);
    this.group.add(ring);
    const embers = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), this.mats.ember);
    embers.position.set(local.x, base + 0.16, local.z);
    this.group.add(embers);
    const light = new THREE.PointLight(0xffa04a, 2.4, 12, 2);
    light.position.set(local.x, base + 0.8, local.z);
    this.group.add(light);
    view.fire = light;

    const homes = Math.min(camp.homes, 14);
    for (let i = 0; i < homes; i++) {
      const a = (i / Math.max(1, homes)) * Math.PI * 2 + hash(camp.id * 3.1 + i) * 0.5;
      const rad = 3.4 + (i % 3) * 1.6;
      const hut = this.hutMesh(camp.era, i);
      hut.position.set(local.x + Math.cos(a) * rad, this.region.groundAt(local.x + Math.cos(a) * rad, local.z + Math.sin(a) * rad), local.z + Math.sin(a) * rad);
      hut.rotation.y = a;
      this.group.add(hut);
      view.huts.push(hut);
    }

    // a market and a hall, once they have the buildings for it
    if (camp.businesses.length) {
      const stall = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.8), this.mats.timber);
      stall.position.set(local.x + 1.8, base + 0.9, local.z - 1.4);
      stall.rotation.y = 0.4;
      const awning = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.9), this.mats.thatch);
      awning.position.set(local.x + 1.8, base + 1.5, local.z - 1.4);
      this.group.add(stall, awning);
    }
    if (camp.civics.length) {
      const hall = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.3, 1.4), this.mats.plaster);
      hall.position.set(local.x - 2.4, base + 0.65, local.z - 1.2);
      this.group.add(hall);
    }

    this.buildCrowd(view, camp);
    return view;
  }

  buildCrowd(view, camp) {
    const cap = 40;
    const people = camp.people.slice(0, cap);
    const n = Math.max(1, people.length);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc9a483, roughness: 0.9 });
    const body = new THREE.InstancedMesh(this.geos.body, bodyMat, n);
    const head = new THREE.InstancedMesh(this.geos.head, this.mats.skin, n);
    const legs = new THREE.InstancedMesh(this.geos.leg, this.mats.legs, n * 2);
    for (const mesh of [body, head, legs]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    const color = new THREE.Color();
    const skins = [0xc9a483, 0xb98f6b, 0x9a6f4f, 0xd6b193, 0xbf9a7a];
    for (let i = 0; i < people.length; i++) body.setColorAt(i, color.setHex(skins[i % skins.length]));
    if (body.instanceColor) body.instanceColor.needsUpdate = true;

    view.body = body;
    view.head = head;
    view.legs = legs;
    view.dummy = new THREE.Object3D();
    view.people = people.map((person, i) => {
      // spread the crowd around the fire instead of stacking them in one line
      const a = (i / n) * Math.PI * 2 + hash(person.id * 3.7) * 0.6;
      const rad = 2.2 + hash(person.id * 7.3) * 4.6;
      return {
        person,
        x: view.local.x + Math.cos(a) * rad,
        z: view.local.z + Math.sin(a) * rad,
        y: view.base,
        yaw: a,
        gait: hash(person.id) * 8,
        phase: hash(person.id * 11) * 9,
        targetX: view.local.x,
        targetZ: view.local.z,
      };
    });
  }

  updateVisuals(dt, playerPos) {
    if (!this.group || !this.region) return;
    for (const view of this.views) {
      if (view.fire) view.fire.intensity = 2.2 + Math.sin(this.time * 5.2 + view.camp.id) * 0.4;
      const d = view.dummy;
      for (let i = 0; i < view.people.length; i++) {
        const p = view.people[i];
        const person = p.person;
        // children stay close to the fire, elders sit near it, workers roam
        const reach = person.job === 'child' ? 2.0 : person.job === 'elder' ? 2.6 : 4.6;
        const dx = p.targetX - p.x;
        const dz = p.targetZ - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.3) {
          const a = hash(person.id * 13.1 + Math.floor(this.time * 0.25)) * Math.PI * 2;
          const rad = 1.8 + hash(person.id * 5.9 + Math.floor(this.time * 0.3)) * reach;
          p.targetX = view.local.x + Math.cos(a) * rad;
          p.targetZ = view.local.z + Math.sin(a) * rad;
        } else {
          const speed = (person.job === 'child' ? 0.7 : 0.55) + hash(person.id * 2.9) * 0.35;
          p.x += (dx / dist) * Math.min(dist, speed * dt);
          p.z += (dz / dist) * Math.min(dist, speed * dt);
          p.yaw = Math.atan2(dx, dz);
          p.gait += dt * 6;
        }
        if (playerPos) {
          const ox = p.x - playerPos.x;
          const oz = p.z - playerPos.z;
          const dd = Math.hypot(ox, oz);
          if (dd < 0.9 && dd > 0.001) {
            p.x += (ox / dd) * (0.9 - dd) * 0.5;
            p.z += (oz / dd) * (0.9 - dd) * 0.5;
          }
        }
        p.y = this.region.groundAt(p.x, p.z);
        const scale = person.age < 6 ? 0.45 : person.age < 14 ? 0.72 : 1;
        const swing = Math.sin(p.gait) * 0.13;
        const fx = Math.sin(p.yaw);
        const fz = Math.cos(p.yaw);
        d.position.set(p.x, p.y + 0.78 * scale, p.z);
        d.rotation.set(0, p.yaw, 0);
        d.scale.setScalar(scale);
        d.updateMatrix();
        view.body.setMatrixAt(i, d.matrix);
        d.position.y = p.y + 1.4 * scale;
        d.updateMatrix();
        view.head.setMatrixAt(i, d.matrix);
        d.position.set(p.x + fx * swing, p.y + 0.26 * scale, p.z + fz * swing);
        d.updateMatrix();
        view.legs.setMatrixAt(i * 2, d.matrix);
        d.position.set(p.x - fx * swing, p.y + 0.26 * scale, p.z - fz * swing);
        d.updateMatrix();
        view.legs.setMatrixAt(i * 2 + 1, d.matrix);
      }
      view.body.instanceMatrix.needsUpdate = true;
      view.head.instanceMatrix.needsUpdate = true;
      view.legs.instanceMatrix.needsUpdate = true;
    }
  }

  hutMesh(era, index) {
    const m = this.mats;
    const group = new THREE.Group();
    const variant = hash(index * 4.3);
    if (era === 0) {
      const tent = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1.7, 7), m.hide);
      tent.position.y = 0.85;
      group.add(tent);
    } else if (era === 1) {
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 1.0, 10), m.stone);
      wall.position.y = 0.5;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.1, 10), m.thatch);
      roof.position.y = 1.5;
      group.add(wall, roof);
    } else if (era === 2) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.15, 1.6), m.stone);
      wall.position.y = 0.58;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.9, 4), m.thatch);
      roof.position.y = 1.55;
      roof.rotation.y = Math.PI / 4;
      group.add(wall, roof);
    } else if (era === 3) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.3, 1.6), m.plaster);
      wall.position.y = 0.65;
      const beams = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.12, 1.64), m.timber);
      beams.position.y = 1.2;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.05, 4), m.thatch);
      roof.position.y = 1.8;
      roof.rotation.y = Math.PI / 4;
      group.add(wall, beams, roof);
    } else if (era === 4) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 1.7), m.brick);
      wall.position.y = 0.9;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.12, 1.8), m.stone);
      roof.position.y = 1.85;
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 1.0, 8), m.brick);
      stack.position.set(0.75, 2.3, -0.45);
      group.add(wall, roof, stack);
    } else {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.0, 1.8), m.modern);
      wall.position.y = 1.0;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.14, 1.9), m.stone);
      roof.position.y = 2.05;
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 0.06), m.glass);
      glass.position.set(0, 1.35, 0.92);
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), m.modern);
      dish.position.set(-0.7, 2.2, -0.3);
      dish.rotation.x = -0.7;
      group.add(wall, roof, glass, dish);
    }
    if (variant > 0.6) group.scale.setScalar(0.9 + variant * 0.2);
    return group;
  }

  /* ------------------------------- persistence ------------------------------ */

  save() {
    if (!this.state) return;
    this.state.society = this.data ? JSON.parse(JSON.stringify(this.data)) : null;
  }

  restore(raw) {
    if (!raw || !raw.founded) return;
    this.data = JSON.parse(JSON.stringify(raw));
    for (const camp of this.data.camps) {
      camp.yields = null;
      camp.progress = this.progress(camp);
      for (const p of camp.people) p.campId = camp.id;
      this.headcount(camp);
    }
    this.rebuildClaims();
  }

  get founded() {
    return !!this.data?.founded;
  }
}
