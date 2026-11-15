import { RNG, clamp, uid } from '../core/rng';
import { createFactions, chooseBuildTargets, equipArmy, factionStrength, membersOf, updateFactionDaily, discoverAggression } from './factions';
import { assignSimLevels, simulateAggregate, simulateFar, simulateNear, isNight, SIM_CONSTANTS } from './ai';
import { collectRents, createMarket, runBusinesses, updateMarket, priceOf } from './economy';
import { createNPC, createPlayer, makeWeapon, weaponForAge, addItem } from './npc';
import { healTick, killCharacter } from './combat';
import { addHistory, pushLog, recordMemory, recordSignificantEvent, locationName } from './memory';
import { ensureDesignBot } from './designBot';
import { defaultCheats, ensureCheats, swearFealty } from './cheats';
import { BUILDING_BY_ID, BUILDING_DEFS } from '../data/buildings';
import { GOODS } from '../data/goods';
import { generateResources, generateTerrain, heightAt, isWalkable, REGIONS, regionAt, SEA_LEVEL, findSettlementSite } from '../world/worldgen';
import type { BuildingDef, BuildingInstance, Faction, NPC, World } from '../core/types';

export const GAME_VERSION = 1;
export const MINUTES_PER_TICK = 6;
export const TICKS_PER_DAY = 240;
export const DAYS_PER_YEAR = 80;

const PLAYER_START = { x: 40, z: 470 };

function randomLandNear(terrain: World['terrain'], center: { x: number; z: number }, rng: RNG, radius = 26): { x: number; z: number } {
  for (let i = 0; i < 60; i++) {
    const angle = rng.next() * Math.PI * 2;
    const r = rng.range(4, radius);
    const x = center.x + Math.cos(angle) * r;
    const z = center.z + Math.sin(angle) * r;
    if (isWalkable(terrain, x, z)) return { x, z };
  }
  return { ...center };
}

export function createWorld(seedInput?: number, options: { playerPosition?: { x: number; z: number } } = {}): { world: World; rng: RNG } {
  const seed = seedInput ?? Math.floor(Math.random() * 0xffffffff);
  const rng = new RNG(seed);
  const terrain = generateTerrain(seed);
  const resources = generateResources(terrain, seed);
  const factions = createFactions(rng, terrain, resources);

  const world: World = {
    version: GAME_VERSION,
    seed,
    terrain,
    corpses: [],
    tick: 0,
    minutes: 7 * 60,
    day: 1,
    season: 'Spring',
    weather: { current: 'Clear', intensity: 0.2 },
    playerId: '',
    npcs: new Map(),
    factions,
    buildings: [],
    businesses: [],
    markets: [],
    history: [],
    resources,
    finishing: {
      active: false, phase: 'idle', attackerId: null, victimId: null, part: null,
      weaponName: '', startedAt: 0, elapsed: 0, cameraAngle: 0, applied: false, snapshot: null
    },
    settings: {
      gore: 1,
      slowMotion: 1,
      slowMotionDuration: 4.5,
      distantSim: true,
      shadows: true,
      showReticle: true,
      firstPerson: false
    },
    cheats: defaultCheats(),
    log: [],
    timeScale: 1,
    paused: false,
    currentInteriorId: null,
    worldName: 'The Forgotten Island',
    deaths: 0,
    births: 0,
    designBotId: null,
    plantings: []
  };

  // Ten individuals per faction. No village, no government, no army.
  for (const faction of factions) {
    const members: NPC[] = [];
    for (let i = 0; i < 10; i++) {
      const position = randomLandNear(terrain, faction.capital, rng, 34);
      const npc = createNPC({
        rng,
        factionId: faction.id,
        position,
        age: rng.int(16, 44),
        techAge: 0
      });
      // Families and friendships inside the founding group.
      if (members.length > 0 && rng.chance(0.55)) {
        const other = rng.pick(members);
        if (other.gender !== npc.gender && Math.abs(other.age - npc.age) < 16 && rng.chance(0.6)) {
          npc.spouseId = other.id;
          other.spouseId = npc.id;
          npc.family = other.family;
          npc.name = `${npc.firstName} ${other.family}`;
        } else {
          npc.family = other.family;
          npc.name = `${npc.firstName} ${other.family}`;
          npc.familyIds.push(other.id);
          other.familyIds.push(npc.id);
        }
        const rel = { affinity: rng.int(20, 60), trust: rng.int(20, 60), fear: 0, lastInteractionTick: 0 };
        npc.relationships[other.id] = rel;
        other.relationships[npc.id] = { ...rel };
      }
      npc.homeId = null;
      npc.history.push(`Came ashore with the founding ten of ${faction.name}.`);
      world.npcs.set(npc.id, npc);
      members.push(npc);
    }
    faction.population = members.length;
    const leader = [...members].sort((a, b) =>
      (b.personality.ambition + (b.skills.administration ?? 0) * 3) - (a.personality.ambition + (a.skills.administration ?? 0) * 3)
    )[0];
    faction.leaderId = leader?.id ?? null;
    if (leader) faction.history.push(`${leader.name} speaks for the group, for now.`);
    world.markets.push(createMarket(rng, faction));
    addHistory(world, {
      type: 'founding',
      text: `${faction.name} came ashore in ${REGIONS.find((r) => r.id === faction.regionId)?.name} with ten souls and nothing else.`,
      participants: members.map((m) => m.id),
      factionId: faction.id,
      location: REGIONS.find((r) => r.id === faction.regionId)?.name ?? 'the coast',
      significant: true
    });
  }

  // One hidden hyper-aggressive faction, chosen at world creation.
  const aggressive = factions.find((f) => f.aggressionModifier > 1.6);
  if (aggressive) {
    aggressive.history.push('Their council speaks of taking what the island owes them.');
  }

  const start = options.playerPosition ?? findPlayerStart(terrain, rng);
  const player = createPlayer(rng, start);
  player.occupation = 'Survivor';
  world.npcs.set(player.id, player);
  world.playerId = player.id;

  // A single small cottage above the beach: the wanderer's first home and the
  // studio where Lord Slayer, the graphics keeper, works. Not a village, not a faction.
  const cottageDef = BUILDING_BY_ID.get('b_residential_a0_t0');
  if (cottageDef) {
    const cottageSpot = nearestWalkable(terrain, { x: start.x + 9, z: start.z + 7 });
    const cottage = createBuildingInstance(world, cottageDef, null, player.id, cottageSpot, rng);
    cottage.built = true;
    cottage.progress = 1;
    cottage.condition = 74;
    cottage.name = "Wanderer's Cottage";
    player.homeId = cottage.id;
  }
  ensureDesignBot(world, rng);
  ensureCheats(world);

  addHistory(world, {
    type: 'arrival',
    text: 'A lone wanderer was washed ashore on the southern coast with nothing but the clothes on their back.',
    participants: [player.id],
    factionId: null,
    location: 'The Verdant Vale',
    significant: true
  });
  pushLog(world, 'You wake on a southern beach beside a low cottage. Ten peoples are landing elsewhere; none of them know you exist.', 'neutral');
  pushLog(world, 'Lord Slayer keeps the studio inside your cottage. Drag to look, use the stick to move, and tap him to read his notes.', 'neutral');

  return { world, rng };
}

function findPlayerStart(terrain: World['terrain'], rng: RNG): { x: number; z: number } {
  const region = REGIONS.find((r) => r.id === 'south_vale')!;
  const site = findSettlementSite(terrain, [], region.center, rng.int(1, 999999));
  for (let i = 0; i < 80; i++) {
    const angle = rng.next() * Math.PI * 2;
    const r = rng.range(0, 60);
    const x = site.x + Math.cos(angle) * r;
    const z = site.z + Math.sin(angle) * r;
    if (isWalkable(terrain, x, z)) return { x, z };
  }
  return PLAYER_START;
}

export interface TickResult {
  newDay: boolean;
  dayEvents: string[];
}

let lastDay = 0;
let lastHour = -1;

export function tickWorld(world: World, rng: RNG): TickResult {
  const result: TickResult = { newDay: false, dayEvents: [] };
  if (world.paused) return result;

  world.tick += 1;
  world.minutes += MINUTES_PER_TICK;
  let newDay = false;
  if (world.minutes >= 24 * 60) {
    world.minutes -= 24 * 60;
    world.day += 1;
    newDay = true;
    result.newDay = true;
  }
  if (world.tick === world.finishing.startedAt + 1 && world.finishing.active) {
    // The finishing state itself is advanced with real time below.
  }

  const player = world.npcs.get(world.playerId);
  if (player) {
    updatePlayerState(world, player, rng);
  }
  assignSimLevels(world, player ?? { position: PLAYER_START } as NPC);

  const hour = Math.floor(world.minutes / 60);
  if (newDay) {
    advanceDay(world, rng, result.dayEvents);
  } else if (hour !== lastHour) {
    lastHour = hour;
    updateWeather(world, rng);
    // Hunger and thirst hurry along between days.
    for (const npc of world.npcs.values()) {
      if (!npc.alive || npc.id === world.designBotId) continue;
      npc.needs.hunger = clamp(npc.needs.hunger - 0.8, 0, 100);
      npc.needs.thirst = clamp(npc.needs.thirst - 1.1, 0, 100);
    }
  }

  for (const npc of world.npcs.values()) {
    if (!npc.alive || npc.isPlayer || npc.id === world.designBotId) continue;
    if (world.finishing.active) break; // full combat freeze
    if (npc.simLevel === 'near') {
      simulateNear(world, npc, rng);
    } else if (npc.simLevel === 'far') {
      if (world.tick % 3 === 0) simulateFar(world, npc, rng);
    } else if (world.settings.distantSim) {
      if (world.tick % 12 === 0) simulateAggregate(world, npc, rng);
    }
  }

  // A dead player ends the run but never the world.
  if (player && !player.alive) {
    result.dayEvents.push('You have died.');
  }
  return result;
}

export function updatePlayerState(world: World, player: NPC, rng: RNG): void {
  if (!player.alive) return;
  const freezing = world.finishing.active;
  player.attackCooldown = Math.max(0, player.attackCooldown - 1);
  // Needs keep moving during a finishing choice only if the fight is not frozen.
  if (!freezing) {
    player.needs.hunger = clamp(player.needs.hunger - 0.05, 0, 100);
    player.needs.thirst = clamp(player.needs.thirst - 0.07, 0, 100);
    if (player.needs.hunger < 12 || player.needs.thirst < 12) {
      player.health = Math.max(0, player.health - 0.05);
    }
    if (player.activity === 'sleeping') player.needs.fatigue = clamp(player.needs.fatigue + 0.4, 0, 100);
    else player.needs.fatigue = clamp(player.needs.fatigue - 0.02, 0, 100);
  }
  if (world.tick % 60 === 0) {
    healTick(world, player, rng);
  }
  if (player.health <= 0 && player.alive && !freezing) {
    killCharacter(world, player, player.lastAttackerId, 'wounds');
  }
}

function updateWeather(world: World, rng: RNG): void {
  const region = world.factions[0] ? REGIONS.find((r) => r.id === world.factions[0].regionId) : null;
  const winter = world.season === 'Winter';
  if (rng.chance(0.25)) {
    const options: World['weather']['current'][] = winter
      ? ['Overcast', 'Snow', 'Fog', 'Storm', 'Clear']
      : ['Clear', 'Clear', 'Overcast', 'Rain', 'Fog', 'Storm'];
    world.weather.current = rng.pick(options);
    world.weather.intensity = rng.range(0.1, 0.9);
  }
  if (world.weather.current === 'Storm') {
    world.weather.intensity = Math.min(1, world.weather.intensity + 0.05);
  }
  void region;
}

function advanceDay(world: World, rng: RNG, events: string[]): void {
  if (world.day % 20 === 0) {
    const seasons: World['season'][] = ['Spring', 'Summer', 'Autumn', 'Winter'];
    const idx = (seasons.indexOf(world.season) + 1) % 4;
    world.season = seasons[idx];
    pushLog(world, `${world.season} begins across the island.`, 'neutral');
  }
  if (world.day % DAYS_PER_YEAR === 0) {
    for (const npc of world.npcs.values()) {
      if (!npc.alive) continue;
      npc.age += 1;
      if (npc.age === 16 && npc.occupation === 'child') npc.occupation = 'unemployed';
    }
    pushLog(world, 'A year turns. Everyone on the island is a year older.', 'neutral');
  }

  // Faction politics, war, economy.
  for (const faction of world.factions) {
    updateFactionDaily(world, faction, rng);
  }
  for (const market of world.markets) updateMarket(world, market, rng);
  collectRents(world, rng);
  runBusinesses(world, rng);
  progressConstruction(world, rng, events);
  populationTick(world, rng, events);
  healAll(world, rng);
  expireCorpses(world);
  discoverAggressiveFaction(world);
  world.weather.intensity = clamp(world.weather.intensity * 0.9, 0.05, 1);
}

function healAll(world: World, rng: RNG): void {
  for (const npc of world.npcs.values()) {
    if (!npc.alive) continue;
    if (npc.isPlayer) continue;
    healTick(world, npc, rng);
    for (const part of Object.values(npc.body)) {
      if (part.bleeding > 0 && rng.chance(0.5)) part.bleeding = Math.max(0, part.bleeding - 1);
    }
  }
}

function expireCorpses(world: World): void {
  world.corpses = world.corpses.filter((c) => world.tick - c.tick < TICKS_PER_DAY * 4);
}

function discoverAggressiveFaction(world: World): void {
  const player = world.npcs.get(world.playerId);
  if (!player) return;
  const aggressive = world.factions.find((f) => f.aggressionModifier > 1.6);
  if (!aggressive || aggressive.aggressiveDiscovered) return;
  const near = [...world.npcs.values()].some(
    (n) => n.alive && n.factionId === aggressive.id && Math.hypot(n.position.x - player.position.x, n.position.z - player.position.z) < 60
  );
  const atWar = aggressive.wars.length > 0;
  if ((near && player.skills.combat > 4) || atWar) {
    discoverAggression(world, aggressive, atWar ? 'they have drawn blood' : 'observed behaviour');
  }
}

function populationTick(world: World, rng: RNG, events: string[]): void {
  // Marriages
  for (const faction of world.factions) {
    const members = membersOf(world, faction.id);
    const singles = members.filter((n) => !n.spouseId && n.age >= 18 && n.age <= 55);
    for (const a of singles) {
      if (a.spouseId) continue;
      const b = singles.find((other) =>
        other.id !== a.id && !other.spouseId && other.gender !== a.gender
        && Math.abs(other.age - a.age) < 18
        && (a.relationships[other.id]?.affinity ?? 0) > 35
      );
      if (b && rng.chance(0.5)) {
        a.spouseId = b.id;
        b.spouseId = a.id;
        a.familyIds.push(b.id);
        b.familyIds.push(a.id);
        recordMemory(a, {
          tick: world.tick, day: world.day, location: 'settlement', type: 'marriage',
          summary: `${a.firstName} married ${b.firstName}.`, attackerId: null, victimId: null,
          witnesses: [], factionId: a.factionId, emotionalImpact: -55, consequences: 'A household formed.'
        });
        recordMemory(b, {
          tick: world.tick, day: world.day, location: 'settlement', type: 'marriage',
          summary: `${b.firstName} married ${a.firstName}.`, attackerId: null, victimId: null,
          witnesses: [], factionId: b.factionId, emotionalImpact: -55, consequences: 'A household formed.'
        });
        events.push(`${a.firstName} and ${b.firstName} of ${faction.name} married.`);
      }
    }
  }

  // Births
  for (const npc of world.npcs.values()) {
    if (!npc.alive || npc.gender !== 'F' || !npc.spouseId) continue;
    if (npc.age < 18 || npc.age > 44) continue;
    const spouse = world.npcs.get(npc.spouseId);
    if (!spouse?.alive) continue;
    const faction = npc.factionId ? world.factions.find((f) => f.id === npc.factionId) : null;
    const foodShortage = npc.needs.hunger < 25;
    if (rng.chance(foodShortage ? 0.012 : 0.045)) {
      const father = npc.gender === 'F' ? spouse : npc;
      const mother = npc.gender === 'F' ? npc : spouse;
      const child = createNPC({
        rng,
        factionId: npc.factionId,
        position: { ...npc.position },
        age: 0,
        family: npc.family,
        parents: [father, mother],
        techAge: faction?.techAge ?? 0
      });
      child.occupation = 'child';
      child.health = 100;
      child.money = 0;
      child.inventory = {};
      child.homeId = npc.homeId;
      child.weapon = makeWeapon('fist', 'wood', rng);
      child.skills.combat = 0;
      world.npcs.set(child.id, child);
      mother.childIds.push(child.id);
      father.childIds.push(child.id);
      mother.familyIds.push(child.id);
      father.familyIds.push(child.id);
      child.parentIds = [mother.id, father.id];
      if (world.cheats?.crownme) {
        const ruler = world.npcs.get(world.playerId);
        if (ruler) swearFealty(world, child, ruler);
      }
      world.births++;
      if (faction) faction.population += 1;
      events.push(`${child.firstName} was born to ${mother.firstName} and ${father.firstName} of ${faction?.name ?? 'the island'}.`);
      recordMemory(mother, {
        tick: world.tick, day: world.day, location: 'settlement', type: 'birth',
        summary: `${child.firstName} was born.`, attackerId: null, victimId: null,
        witnesses: [father.id], factionId: npc.factionId, emotionalImpact: -70,
        consequences: 'A new life with inherited traits.'
      });
      addHistory(world, {
        type: 'birth',
        text: `${child.firstName} ${child.family} was born to ${mother.firstName} and ${father.firstName} of ${faction?.name ?? 'no faction'}.`,
        participants: [child.id, mother.id, father.id],
        factionId: npc.factionId,
        location: 'settlement',
        significant: false
      });
    }
  }

  // Ageing and natural death.
  for (const npc of world.npcs.values()) {
    if (!npc.alive || npc.isPlayer) continue;
    if (npc.age > 55) {
      const risk = ((npc.age - 55) / 100) * 0.02;
      if (rng.chance(risk)) {
        killCharacter(world, npc, null, 'old age');
        events.push(`${npc.name} died of old age at ${Math.round(npc.age)}.`);
        continue;
      }
    }
    if (npc.age < 16 && npc.occupation === 'child') {
      // Children learn from whoever raises them.
      const parent = npc.parentIds.map((id) => world.npcs.get(id)).find((p) => p?.alive);
      if (parent && rng.chance(0.35)) {
        const skill = parent.occupation && parent.skills[parent.occupation] !== undefined ? parent.occupation : 'farming';
        npc.skills[skill] = clamp((npc.skills[skill] ?? 0) + 0.08, 0, 20);
        npc.education = clamp(npc.education + 0.01, 0, 10);
      }
      if (npc.age >= 14 && npc.occupation === 'child') npc.occupation = 'apprentice';
    }
  }

  // The dead do not linger in their old homes.
  for (const building of world.buildings) {
    if (!building.tenantId) continue;
    const tenant = world.npcs.get(building.tenantId);
    if (!tenant?.alive) building.tenantId = null;
  }
}

function progressConstruction(world: World, rng: RNG, events: string[]): void {
  for (const faction of world.factions) {
    const members = membersOf(world, faction.id);
    if (!members.length) continue;
    let site = world.buildings.find((b) => b.factionId === faction.id && !b.built);
    if (!site && faction.buildQueue.length > 0) {
      // A settlement only supports so much building per head of population,
      // and construction comes out of the treasury.
      const owned = world.buildings.filter((b) => b.factionId === faction.id).length;
      if (owned >= 4 + members.length * 1.4) continue;
      if (faction.treasury < 10) continue;
      const defId = faction.buildQueue.shift()!;
      const def = BUILDING_BY_ID.get(defId);
      if (!def || def.techRequired > faction.techAge) continue;
      faction.treasury -= 8;
      const position = randomLandNear(world.terrain, faction.capital, rng, 55);
      site = createBuildingInstance(world, def, faction.id, null, position, rng);
      site.progress = 0;
      world.history.unshift({
        id: uid('hist'), tick: world.tick, day: world.day, type: 'construction',
        text: `${faction.name} began building ${def.name}.`,
        participants: [], factionId: faction.id, location: locationName(world, position), significant: false
      });
    }
    if (!site) continue;
    const def = BUILDING_BY_ID.get(site.defId);
    if (!def) continue;
    const builders = members.filter((m) => m.occupation === 'builder' || (m.skills.building ?? 0) > 3);
    const labour = builders.length > 0 ? builders.length : members.length * 0.4;
    site.progress = clamp(site.progress + labour / Math.max(1, def.buildDays * 1.6), 0, 1);
    for (const builder of builders) {
      builder.skills.building = clamp((builder.skills.building ?? 0) + 0.01, 0, 20);
      builder.needs.fatigue = clamp(builder.needs.fatigue - 4, 0, 100);
    }
    if (site.progress >= 1 && !site.built) {
      site.built = true;
      site.condition = 100;
      events.push(`${faction.name} completed ${def.name}.`);
      world.history.unshift({
        id: uid('hist'), tick: world.tick, day: world.day, type: 'construction',
        text: `${faction.name} completed construction of ${def.name}.`,
        participants: [], factionId: faction.id, location: locationName(world, site.position), significant: false
      });
      // Homes, jobs and rent come from the building itself.
      assignBuildingUse(world, site, def, faction, members, rng);
      if (faction.buildQueue.length === 0) {
        faction.buildQueue.push(...chooseBuildTargets(world, faction, rng));
      }
    }
  }

  // Player buildings advance slowly with hired labour. Player-placed structures
  // are built in real, visible stages by the game loop instead (30 seconds).
  for (const building of world.buildings.filter((b) => b.ownerId && !b.built && !b.factionId && !b.constructionSeconds)) {
    const def = BUILDING_BY_ID.get(building.defId);
    if (!def) continue;
    const workers = building.workers.map((id) => world.npcs.get(id)).filter((n): n is NPC => !!n?.alive);
    const labour = workers.length * 0.5 + 0.25;
    building.progress = clamp(building.progress + labour / Math.max(1, def.buildDays * 1.6), 0, 1);
    if (building.progress >= 1 && !building.built) {
      building.built = true;
      building.condition = 90;
      pushLog(world, `Construction finished: ${building.name}.`, 'good');
    }
  }
}

export function assignBuildingUse(
  world: World, building: BuildingInstance, def: BuildingDef, faction: Faction, members: NPC[], rng: RNG
): void {
  if (def.category === 'Residential') {
    const homeless = members.filter((m) => !m.homeId).slice(0, def.bedCount ?? 4);
    for (const npc of homeless) {
      npc.homeId = building.id;
      if (!building.tenantId) {
        building.tenantId = npc.id;
        building.rent = 0.4;
      }
    }
    building.ownerId = faction.leaderId;
    return;
  }
  // Staff the building with the best available people for it.
  const wanted = def.workers;
  const candidates = members
    .filter((m) => !building.workers.includes(m.id))
    .sort((a, b) => (b.skills.building ?? 0) + (b.skills.crafting ?? 0) - (a.skills.building ?? 0));
  building.workers = candidates.slice(0, wanted).map((m) => m.id);
  if (def.category === 'Government' && faction.leaderId) {
    building.ownerId = faction.leaderId;
  }
  if (def.produces) {
    for (const [good] of Object.entries(def.produces)) {
      building.inventory[good] = (building.inventory[good] ?? 0) + 6;
    }
  }
  // Bring in new weapons and armour as the faction advances.
  if (faction.techAge > 0 && rng.chance(0.4)) equipArmy(faction, world, rng);
}

export function createBuildingInstance(
  world: World, def: BuildingDef, factionId: string | null, ownerId: string | null,
  position: { x: number; z: number }, rng: RNG
): BuildingInstance {
  const instance: BuildingInstance = {
    id: uid('bld', rng),
    defId: def.id,
    name: def.name,
    ownerId,
    factionId,
    position: { ...position },
    rotation: rng.range(0, Math.PI * 2),
    progress: 0,
    built: false,
    condition: 100,
    inventory: {},
    workers: [],
    tenantId: null,
    rent: 0.5,
    businessId: null,
    size: def.category === 'Residential' ? 3.2 : 4.4
  };
  world.buildings.push(instance);
  return instance;
}

export function playerTechAge(world: World, player: NPC): number {
  // AGES caps everyone else at Industrial; your own works are uncapped.
  if (world.cheats?.ages) return 7;
  let points = (player.skills.scholarship ?? 0) * 1.4 + (player.skills.engineering ?? 0) * 0.8 + (player.skills.architecture ?? 0) * 0.5;
  const owned = world.buildings.filter((b) => b.ownerId === player.id && b.built);
  points += owned.length * 0.9;
  for (const b of owned) {
    const def = BUILDING_BY_ID.get(b.defId);
    if (def) points += def.age * 0.4;
  }
  points += Math.max(0, player.education);
  return clamp(Math.floor(points / 6), 0, 7);
}

export function canPlayerBuild(world: World, player: NPC, def: BuildingDef): { ok: boolean; reason?: string } {
  const tech = playerTechAge(world, player);
  if (def.techRequired > tech) {
    return { ok: false, reason: `Requires technology age ${def.techRequired + 1} (yours: ${tech + 1})` };
  }
  const free = world.cheats?.midas || world.cheats?.slumlord;
  if (free) return { ok: true };
  for (const [good, amount] of Object.entries(def.cost)) {
    if ((player.inventory[good] ?? 0) + (player.money > 0 ? 0 : 0) < amount) {
      return { ok: false, reason: `Needs ${amount} ${GOODS[good]?.name ?? good}` };
    }
  }
  return { ok: true };
}

export function placePlayerBuilding(
  world: World, player: NPC, def: BuildingDef, position: { x: number; z: number }, rng: RNG
): { ok: boolean; reason?: string; building?: BuildingInstance } {
  const check = canPlayerBuild(world, player, def);
  if (!check.ok) return { ok: false, reason: check.reason };
  if (!isWalkable(world.terrain, position.x, position.z)) return { ok: false, reason: 'Cannot build in water' };
  const tooClose = world.buildings.some((b) => Math.hypot(b.position.x - position.x, b.position.z - position.z) < 5);
  if (tooClose) return { ok: false, reason: 'Something is already built here' };
  const free = world.cheats?.midas || world.cheats?.slumlord;
  if (!free) {
    for (const [good, amount] of Object.entries(def.cost)) {
      if ((player.inventory[good] ?? 0) < amount) return { ok: false, reason: `Not enough ${GOODS[good]?.name ?? good}` };
    }
    for (const [good, amount] of Object.entries(def.cost)) {
      player.inventory[good] = (player.inventory[good] ?? 0) - amount;
      if (player.inventory[good] <= 0) delete player.inventory[good];
    }
  }
  const building = createBuildingInstance(world, def, null, player.id, position, rng);
  building.workers = [];
  building.constructionSeconds = 30;
  addHistory(world, {
    type: 'construction',
    text: `The wanderer began building ${def.name} in ${locationName(world, position)}.`,
    participants: [player.id], factionId: null, location: locationName(world, position), significant: false
  });
  pushLog(world, `Started construction: ${def.name}.`, 'good');
  return { ok: true, building };
}

export type ConstructionStage = 'foundations' | 'framing' | 'building' | 'complete';

/** The three visible stages of a player construction, in order. */
export function constructionStage(progress: number, built = false): ConstructionStage {
  if (built || progress >= 1) return 'complete';
  if (progress >= 0.66) return 'building';
  if (progress >= 0.33) return 'framing';
  return 'foundations';
}

/**
 * Advance the player's staged construction in real seconds. A full build takes
 * the building's `constructionSeconds` (30 by default), crossing foundations,
 * framing and building on the way to completion.
 */
export function advancePlayerConstruction(
  world: World,
  playerId: string,
  dt: number
): {
  completed: BuildingInstance[];
  staged: { building: BuildingInstance; stage: ConstructionStage }[];
} {
  const completed: BuildingInstance[] = [];
  const staged: { building: BuildingInstance; stage: ConstructionStage }[] = [];
  for (const building of world.buildings) {
    if (building.built || building.ownerId !== playerId || !building.constructionSeconds) continue;
    const before = constructionStage(building.progress);
    building.progress = clamp(building.progress + dt / building.constructionSeconds, 0, 1);
    const after = constructionStage(building.progress);
    if (after !== before && after !== 'complete') staged.push({ building, stage: after });
    if (building.progress >= 1) {
      building.built = true;
      building.condition = 90;
      completed.push(building);
    }
  }
  return { completed, staged };
}

export function playerStartPosition(world: World): { x: number; z: number } {
  return { ...PLAYER_START };
}

export function nearestWalkable(terrain: World['terrain'], position: { x: number; z: number }): { x: number; z: number } {
  if (isWalkable(terrain, position.x, position.z)) return position;
  for (let r = 4; r < 90; r += 4) {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const x = position.x + Math.cos(angle) * r;
      const z = position.z + Math.sin(angle) * r;
      if (isWalkable(terrain, x, z)) return { x, z };
    }
  }
  return position;
}

export function newPlayerCharacter(world: World, rng: RNG): NPC {
  const start = nearestWalkable(world.terrain, findPlayerStart(world.terrain, rng));
  const player = createPlayer(rng, start);
  player.history.push(`Arrived on the island in the year ${Math.floor(world.day / DAYS_PER_YEAR) + 1}, inheriting a world shaped by others.`);
  world.npcs.set(player.id, player);
  world.playerId = player.id;
  addHistory(world, {
    type: 'arrival',
    text: `A new wanderer came ashore on the southern coast, into a world already shaped by war, grief and construction.`,
    participants: [player.id], factionId: null, location: 'The Verdant Vale', significant: true
  });
  pushLog(world, 'A new life begins in the same world. Nothing has been reset.', 'neutral');
  return player;
}

export function worldSnapshotSummary(world: World): string {
  const living = [...world.npcs.values()].filter((n) => n.alive && !n.isPlayer).length;
  const wars = world.factions.flatMap((f) => f.wars).length / 2;
  return `Day ${world.day} · ${living} living islanders · ${Math.round(wars)} wars · ${world.buildings.length} structures`;
}

export function factionTechSummary(world: World): string {
  return world.factions
    .map((f) => `${f.adjective}: age ${f.techAge + 1}`)
    .join(' · ');
}

export { priceOf, factionStrength };
