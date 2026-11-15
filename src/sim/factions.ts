import { RNG, clamp, uid } from '../core/rng';
import { factionName } from '../core/names';
import type { Faction, GovernmentType, Law, NPC, ResourceNode, World } from '../core/types';
import { REGIONS, findSettlementSite, type WorldTerrain } from '../world/worldgen';
import { BUILDING_DEFS, BUILDING_BY_ID } from '../data/buildings';
import { pushLog, recordSignificantEvent } from './memory';
import { applyInjury, killCharacter, weaponOf } from './combat';
import { describePart } from '../core/anatomy';

const FACTION_COLORS = [0x8a3b2f, 0x2f5d8a, 0x4f7a34, 0x8a7a2f, 0x6b3f8a, 0x2f8a7a, 0x8a2f63, 0x7a5a2f, 0x3f4f8a, 0x5c8a2f];

const LAW_LIBRARY: Omit<Law, 'id' | 'enforced' | 'publicSupport'>[] = [
  { name: 'Property rights', description: 'Theft of goods or land is punishable.', penalty: 'Fine equal to twice the stolen value' },
  { name: 'Right to trial', description: 'Accused persons may speak before a leader or council.', penalty: 'None' },
  { name: 'Tax levy', description: 'Every household contributes a share of earnings.', penalty: 'Seizure of goods' },
  { name: 'Murder statute', description: 'Unlawful killing is a capital crime.', penalty: 'Execution or exile' },
  { name: 'Militia duty', description: 'Able adults must defend the settlement when called.', penalty: 'Fine' },
  { name: 'Rent obligations', description: 'Tenants must pay agreed rent or face eviction.', penalty: 'Eviction after three missed payments' },
  { name: 'Inheritance', description: 'Property passes to spouse, then children, then the settlement.', penalty: 'None' },
  { name: 'Sanitation', description: 'Waste must be kept from wells and waterways.', penalty: 'Labour service' },
  { name: 'Trade licensing', description: 'Merchants must register with the administration.', penalty: 'Confiscation of stock' },
  { name: 'Religious observance', description: 'Public rites must be observed on holy days.', penalty: 'Public shaming' }
];

export function createFactions(rng: RNG, terrain: WorldTerrain, resources: ResourceNode[]): Faction[] {
  const aggressiveIndex = rng.int(0, REGIONS.length - 1);
  const factions: Faction[] = [];
  for (let i = 0; i < REGIONS.length; i++) {
    const region = REGIONS[i];
    const site = findSettlementSite(terrain, resources, region.center, rng.int(1, 999999));
    const name = factionName(rng);
    const words = name.split(' ');
    factions.push({
      id: `fac_${i}`,
      name,
      adjective: 'Forgotten',
      color: FACTION_COLORS[i % FACTION_COLORS.length],
      regionId: region.id,
      capital: site,
      government: 'Unorganised',
      leaderId: null,
      councilIds: [],
      treasury: 40 + rng.int(0, 40),
      taxRate: 0.12,
      techAge: 0,
      techPoints: 0,
      aggressionModifier: i === aggressiveIndex ? rng.range(1.9, 2.5) : rng.range(0.7, 1.25),
      aggressiveDiscovered: false,
      relations: {},
      wars: [],
      alliances: [],
      treaties: [],
      laws: [],
      military: { soldiers: 0, wagesOwed: 0, training: 5, equipment: 10 },
      militaryLedger: { wages: 0, food: 0, equipment: 0, upkeep: 0 },
      population: 0,
      territory: [region.id],
      knownByPlayer: 0.12,
      history: [`The people of ${name} made landfall in ${region.name} with nothing but what they carried.`],
      buildQueue: [],
      lastExpansionTick: 0
    });
    // Keep the adjective readable: strip the leading descriptor.
    const faction = factions[factions.length - 1];
    faction.adjective = words[words.length - 1];
  }

  // Fragile, uncertain starting diplomacy: nobody is an automatic enemy.
  for (const a of factions) {
    for (const b of factions) {
      if (a.id === b.id) continue;
      a.relations[b.id] = rng.int(-12, 14);
    }
    a.relations['player'] = 0;
  }
  return factions;
}

export function membersOf(world: World, factionId: string): NPC[] {
  return [...world.npcs.values()].filter((n) => n.factionId === factionId && n.alive);
}

export function factionStrength(world: World, faction: Faction): number {
  const members = membersOf(world, faction.id);
  const soldiers = members.filter((m) => m.occupation === 'soldier').length;
  const gear = faction.military.equipment / 100;
  return members.length * 0.6 + soldiers * 3 * (0.6 + gear) + faction.military.training * 0.08;
}

export function isHostile(world: World, a: NPC, b: NPC): boolean {
  if (a.id === b.id) return false;
  if (!a.alive || !b.alive) return false;
  if (a.enemyId === b.id || b.enemyId === a.id) return true;

  if (a.factionId && b.factionId) {
    if (a.factionId === b.factionId) return false;
    const fa = world.factions.find((f) => f.id === a.factionId);
    return !!fa?.wars.includes(b.factionId);
  }

  // One of them is factionless (usually the player).
  const factionNpc = a.factionId ? a : b;
  const outsider = a.factionId ? b : a;
  const faction = factionNpc.factionId ? world.factions.find((f) => f.id === factionNpc.factionId) : null;
  if (!faction) return false;
  const standing = faction.relations['player'] ?? 0;
  const personal = factionNpc.relationships[outsider.id]?.affinity ?? 0;
  if (faction.wars.includes('player')) return true;
  return standing <= -35 || personal <= -55;
}

export function factionStanding(world: World, factionId: string): number {
  const faction = world.factions.find((f) => f.id === factionId);
  return faction?.relations['player'] ?? 0;
}

export function adjustStanding(world: World, factionId: string, delta: number, reason: string): void {
  const faction = world.factions.find((f) => f.id === factionId);
  if (!faction) return;
  faction.relations['player'] = world.cheats?.crownme
    ? 100
    : clamp((faction.relations['player'] ?? 0) + delta, -100, 100);
  if (delta <= -10) {
    faction.history.push(`Day ${world.day}: ${reason}`);
    pushLog(world, `${faction.name} will remember that. (${reason})`, 'bad');
  }
}

/** One in-game day of faction-level decision making, economics and politics. */
export function updateFactionDaily(world: World, faction: Faction, rng: RNG): void {
  const members = membersOf(world, faction.id);
  faction.population = members.length;
  if (members.length === 0) {
    if (faction.government !== 'Unorganised') {
      faction.government = 'Unorganised';
      faction.history.push(`Day ${world.day}: ${faction.name} has no people left.`);
    }
    return;
  }

  // Leadership and government emerge from the population, not from a script.
  if (!faction.leaderId || !world.npcs.get(faction.leaderId)?.alive) {
    const leader = [...members].sort((a, b) =>
      ((b.skills.administration ?? 0) * 2 + b.personality.ambition * 0.18 + b.age * 0.1)
      - ((a.skills.administration ?? 0) * 2 + a.personality.ambition * 0.18 + a.age * 0.1)
    )[0];
    faction.leaderId = leader?.id ?? null;
    if (leader) faction.history.push(`Day ${world.day}: ${leader.name} emerged as leader.`);
  }

  if (faction.government === 'Unorganised' && members.length >= 8) {
    faction.government = 'Tribal leadership';
    faction.history.push(`Day ${world.day}: ${faction.name} formed a tribal leadership.`);
    pushLog(world, `${faction.name} has formed a tribal leadership.`, 'neutral');
  } else if (faction.government === 'Tribal leadership' && members.length >= 16 && faction.techAge >= 1) {
    const authority = average(members.map((m) => m.politicalBeliefs.authority));
    const tradition = average(members.map((m) => m.politicalBeliefs.tradition));
    const next: GovernmentType = authority > 62 ? 'Chiefdom' : tradition > 60 ? 'Monarchy' : 'Republic';
    faction.government = next;
    faction.history.push(`Day ${world.day}: ${faction.name} became a ${next.toLowerCase()}.`);
    pushLog(world, `${faction.name} has become a ${next.toLowerCase()}.`, 'neutral');
  } else if (faction.government === 'Chiefdom' && members.length >= 26 && faction.techAge >= 2) {
    faction.government = average(members.map((m) => m.politicalBeliefs.authority)) > 65 ? 'Dictatorship' : 'Monarchy';
    faction.history.push(`Day ${world.day}: ${faction.name} consolidated into a ${faction.government.toLowerCase()}.`);
  } else if (faction.government === 'Monarchy' && members.length >= 40 && faction.techAge >= 4) {
    faction.government = 'Empire';
    faction.history.push(`Day ${world.day}: ${faction.name} declared itself an empire.`);
    pushLog(world, `${faction.name} has declared an empire.`, 'war');
  }

  // Laws are enacted as administration skills and population grow.
  const admin = members.reduce((sum, m) => sum + (m.skills.administration ?? 0), 0);
  const lawCount = clamp(Math.floor(admin / 12) + Math.floor(members.length / 14), 0, LAW_LIBRARY.length);
  while (faction.laws.length < lawCount) {
    const template = LAW_LIBRARY[faction.laws.length];
    faction.laws.push({
      id: uid('law'),
      name: template.name,
      description: template.description,
      penalty: template.penalty,
      enforced: true,
      publicSupport: rng.int(35, 75)
    });
    faction.history.push(`Day ${world.day}: ${template.name} enacted.`);
  }

  // Taxation and treasury.
  const earners = members.filter((m) => m.money > 0).length;
  const taxIncome = earners * 0.5 * (1 + members.length * 0.01);
  faction.treasury += taxIncome;

  // Military upkeep is real and can bankrupt a faction.
  const soldiers = members.filter((m) => m.occupation === 'soldier');
  faction.military.soldiers = soldiers.length;
  const wage = soldiers.length * 0.9;
  const food = soldiers.length * 0.5;
  const equipment = soldiers.length * 0.15;
  faction.militaryLedger = { wages: wage, food, equipment, upkeep: wage + food + equipment };
  faction.treasury -= faction.militaryLedger.upkeep;

  if (faction.treasury < 0) {
    faction.military.wagesOwed += Math.abs(faction.treasury) * 0.5;
    faction.treasury = 0;
    if (!world.cheats?.crownme && soldiers.length > 0 && rng.chance(0.22)) {
      const deserter = rng.pick(soldiers);
      deserter.occupation = 'hunter';
      deserter.loyalty = clamp(deserter.loyalty - 25, 0, 100);
      faction.history.push(`Day ${world.day}: ${deserter.name} deserted; the treasury could not pay the army.`);
      pushLog(world, `Unpaid soldiers are deserting ${faction.name}.`, 'war');
    }
  } else if (faction.military.wagesOwed > 0) {
    faction.military.wagesOwed = Math.max(0, faction.military.wagesOwed - 3);
  }

  // Technology: scholars, engineers and workshops produce real points.
  const research = members.reduce((sum, m) =>
    sum + (m.skills.scholarship ?? 0) * 0.022 + (m.skills.engineering ?? 0) * 0.018
    + (m.skills.medicine ?? 0) * 0.006 + m.genes.intellect * 0.0018, 0);
  faction.techPoints += research + members.length * 0.015;
  // Ages take generations, not weeks: early ages are cheap, later ones are not.
  const threshold = 45 + faction.techAge * 110;
  // AGES freezes every other people at the Industrial age (index 6).
  const maxAge = world.cheats?.ages ? 6 : 7;
  if (faction.techPoints >= threshold && faction.techAge < maxAge) {
    faction.techPoints = 0;
    faction.techAge += 1;
    faction.history.push(`Day ${world.day}: ${faction.name} entered a new age (age ${faction.techAge}).`);
    pushLog(world, `${faction.name} has advanced to technology age ${faction.techAge + 1}.`, 'good');
    equipArmy(faction, world, rng);
  }

  // Military build-up depends on wealth, threat and aggression.
  const wantsArmy = faction.wars.length > 0 || faction.aggressionModifier > 1.15 || faction.treasury > 140;
  if (wantsArmy && faction.treasury > 25 && soldiers.length < Math.max(2, Math.floor(members.length * 0.22))) {
    const candidate = members
      .filter((m) => m.occupation !== 'soldier' && m.age >= 16 && m.age <= 48)
      .sort((a, b) => (b.genes.strength + b.personality.bravery) - (a.genes.strength + a.personality.bravery))[0];
    if (candidate) {
      candidate.occupation = 'soldier';
      faction.military.soldiers += 1;
    }
  }

  // Building queue: pick what the settlement actually lacks.
  if (faction.buildQueue.length < 3) {
    const queue = chooseBuildTargets(world, faction, rng);
    faction.buildQueue.push(...queue);
  }

  // Wars are fought, not merely declared.
  for (const enemyId of faction.wars) {
    const enemy = world.factions.find((f) => f.id === enemyId);
    if (enemy) resolveWarFront(world, faction, enemy, rng);
  }

  // Diplomacy drift and war decisions.
  updateDiplomacy(world, faction, rng);
}

function average(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 50;
}

/**
 * One day at the front. Armies with real soldiers meet, wound and kill each other;
 * casualties are named individuals whose bodies and memories persist.
 */
export function resolveWarFront(world: World, faction: Faction, enemy: Faction, rng: RNG): void {
  const attackers = membersOf(world, faction.id).filter((m) => m.occupation === 'soldier');
  const defenders = membersOf(world, enemy.id).filter((m) => m.occupation === 'soldier');
  const attackersReady = attackers.length > 0 ? attackers : membersOf(world, faction.id).slice(0, 2);
  const defendersReady = defenders.length > 0 ? defenders : membersOf(world, enemy.id).slice(0, 2);
  if (!attackersReady.length || !defendersReady.length) return;
  // Not every day brings a battle.
  if (!rng.chance(0.3)) return;

  const attacker = rng.pick(attackersReady);
  const defender = rng.pick(defendersReady);
  const weapon = weaponOf(attacker);
  const attackerSkill = (attacker.skills.combat ?? 0) + weapon.damage * 0.18;
  const defenderSkill = (defender.skills.combat ?? 0) + (defender.armor ?? 0) * 10;
  const hitChance = clamp(0.42 + attackerSkill * 0.018 - defenderSkill * 0.014, 0.12, 0.88);

  // Upkeep is consumed whether the battle is won or lost.
  faction.treasury = Math.max(0, faction.treasury - 0.6);
  enemy.treasury = Math.max(0, enemy.treasury - 0.4);

  if (rng.chance(hitChance)) {
    const severity = rng.chance(0.12) ? 3 : rng.chance(0.4) ? 2 : 1;
    const damage = 6 + weapon.damage * rng.range(0.5, 1.2) * (severity / 2 + 0.5);
    defender.health = Math.max(0, defender.health - damage);
    const partKeys = Object.keys(defender.body);
    const part = rng.pick(partKeys);
    const permanent = severity === 3 && rng.chance(0.35);
    if (severity >= 2) {
      applyInjury(world, defender, part, {
        type: rng.pick(['cut', 'fracture', 'bruise', 'burn'] as const),
        severity: severity as 1 | 2 | 3,
        permanent,
        dismembered: false,
        cause: `wounds taken fighting ${faction.adjective} soldiers`,
        attackerId: attacker.id,
        rng
      });
    }
    attacker.skills.combat = clamp((attacker.skills.combat ?? 0) + 0.02, 0, 20);
    if (defender.health <= 0) {
      recordSignificantEvent(world, {
        type: 'battle-death',
        summary: `${defender.name} of ${enemy.name} was killed in battle against ${faction.adjective} soldiers.`,
        attackerId: attacker.id,
        victimId: defender.id,
        factionId: enemy.id,
        position: defender.position,
        emotionalImpact: 78,
        consequences: `${enemy.name} has lost a soldier and will remember it.`,
        memoryType: 'battle'
      });
      killCharacter(world, defender, attacker.id, `battle wound to the ${describePart(part)}`);
      enemy.relations[faction.id] = clamp((enemy.relations[faction.id] ?? 0) - 12, -100, 100);
    } else if (permanent) {
      recordSignificantEvent(world, {
        type: 'battle-injury',
        summary: `${defender.name} was permanently injured fighting ${faction.adjective} soldiers.`,
        attackerId: attacker.id,
        victimId: defender.id,
        factionId: enemy.id,
        position: defender.position,
        emotionalImpact: 62,
        consequences: `A lasting wound to the ${describePart(part)}.`,
        memoryType: 'permanent-injury'
      });
    }
  } else {
    // A failed assault costs morale and supplies.
    attacker.needs.morale = clamp(attacker.needs.morale - 4, 0, 100);
    if (rng.chance(0.04)) {
      pushLog(world, `${faction.adjective} raiders were driven back by ${enemy.adjective} defenders.`, 'war');
    }
  }
}

export function chooseBuildTargets(world: World, faction: Faction, rng: RNG): string[] {
  const age = faction.techAge;
  const own = world.buildings.filter((b) => b.factionId === faction.id && b.built);
  const has = (category: string) => own.some((b) => b.name.includes(category) || b.defId.includes(category));
  const needs: string[] = [];
  // Only designs the faction can actually construct at its current age.
  const buildable = BUILDING_DEFS.filter((d) => d.age <= age);
  const check: [string, string][] = [
    ['b_residential', 'housing'],
    ['b_agriculture', 'food'],
    ['b_extraction', 'materials'],
    ['b_storage', 'storage'],
    ['b_commercial', 'trade'],
    ['b_government', 'rule'],
    ['b_military', 'defence'],
    ['b_education', 'learning'],
    ['b_healthcare', 'healing'],
    ['b_industrial', 'industry']
  ];
  for (const [prefix, label] of check) {
    if (has(prefix)) continue;
    // Pick the best design this faction can actually construct right now.
    const def = buildable
      .filter((d) => d.id.startsWith(prefix))
      .sort((a, b) => b.age - a.age || a.maintenance - b.maintenance)[0];
    if (def) needs.push(def.id);
    if (needs.length >= 2) break;
  }
  if (needs.length === 0) {
    // Everything basic exists: improve the category with the fewest structures.
    const oldest = own[0];
    if (oldest) {
      const category = BUILDING_BY_ID.get(oldest.defId)?.category;
      const upgrade = buildable
        .filter((d) => d.category === category)
        .sort((a, b) => b.age - a.age)[0];
      needs.push(upgrade?.id ?? oldest.defId);
    }
  }
  if (needs.length === 0 && rng.chance(0.5)) {
    const tier = rng.int(0, 3);
    needs.push(`b_residential_a${age}_t${tier}`);
  }
  return needs;
}

export function equipArmy(faction: Faction, world: World, rng: RNG): void {
  const soldiers = membersOf(world, faction.id).filter((m) => m.occupation === 'soldier');
  for (const soldier of soldiers) {
    const material = faction.techAge >= 7 ? 'steel' : faction.techAge >= 5 ? 'iron' : faction.techAge >= 3 ? 'iron' : faction.techAge >= 2 ? 'bronze' : faction.techAge >= 1 ? 'copper' : 'stone';
    const kind = faction.techAge >= 7 ? 'musket' : faction.techAge >= 4 ? 'sword' : faction.techAge >= 2 ? 'spear' : 'club';
    soldier.weapon = {
      ...soldier.weapon!,
      id: uid('wpn'),
      kind,
      material,
      name: `${material} ${kind}`,
      damage: 8 + faction.techAge * 3.2,
      reach: kind === 'musket' ? 80 : kind === 'spear' ? 3.1 : 3.2,
      twoHanded: kind === 'musket' || kind === 'spear',
      ranged: kind === 'musket',
      durability: 90,
      maxDurability: 90
    };
    soldier.armor = clamp(faction.techAge * 0.07, 0, 0.6);
  }
  faction.military.equipment = clamp(15 + faction.techAge * 11, 0, 95);
  faction.military.training = clamp(5 + faction.techAge * 9, 0, 90);
  faction.history.push(`Day ${world.day}: the army was re-equipped for age ${faction.techAge + 1}.`);
}

export function updateDiplomacy(world: World, faction: Faction, rng: RNG): void {
  for (const other of world.factions) {
    if (other.id === faction.id) continue;
    const current = faction.relations[other.id] ?? 0;
    const drift = rng.range(-0.6, 0.4);
    let next = clamp(current + drift, -100, 100);
    if (faction.wars.includes(other.id)) next = Math.min(next, -35);

    // Shared enemies improve relations; alliances demand upkeep.
    const sharedEnemies = faction.wars.filter((w) => other.wars.includes(w)).length;
    if (sharedEnemies > 0) next = clamp(next + 0.5, -100, 100);

    faction.relations[other.id] = next;

    const strength = factionStrength(world, faction);
    const theirStrength = factionStrength(world, other);
    const aggressive = faction.aggressionModifier > 1.6;
    const hated = next < -25;
    const stronger = strength > theirStrength * 1.15;
    const warWeariness = faction.wars.length > 1 ? 0.25 : 1;
    const canWar = faction.military.soldiers >= 2 && faction.treasury > 10;
    // Aggressive powers look for reasons; patient ones need a real grievance.
    const casusBelli = aggressive ? (hated || stronger) : next < -55;

    if (!faction.wars.includes(other.id) && canWar && world.tick - faction.lastExpansionTick > 1728
      && rng.chance(0.06 * faction.aggressionModifier * warWeariness)
      && casusBelli) {
      declareWar(world, faction, other);
      faction.lastExpansionTick = world.tick;
    }

    if (faction.wars.includes(other.id)) {
      const losing = strength < theirStrength * 0.6;
      if ((losing && rng.chance(0.05)) || (!aggressive && rng.chance(0.02))) {
        makePeace(world, faction, other);
      }
    } else if (next > 55 && !faction.alliances.includes(other.id) && rng.chance(0.008)) {
      faction.alliances.push(other.id);
      other.alliances.push(faction.id);
      world.history.unshift({
        id: uid('hist'), tick: world.tick, day: world.day, type: 'alliance',
        text: `${faction.name} and ${other.name} swore an alliance.`,
        participants: [], factionId: faction.id, location: 'diplomatic channel', significant: true
      });
      pushLog(world, `${faction.name} and ${other.name} have allied.`, 'good');
    }
  }
}

export function declareWar(world: World, a: Faction, b: Faction): void {
  if (a.wars.includes(b.id)) return;
  a.wars.push(b.id);
  b.wars.push(a.id);
  a.relations[b.id] = Math.min(a.relations[b.id] ?? 0, -50);
  b.relations[a.id] = Math.min(b.relations[a.id] ?? 0, -50);
  a.alliances = a.alliances.filter((id) => id !== b.id);
  b.alliances = b.alliances.filter((id) => id !== a.id);
  a.history.push(`Day ${world.day}: declared war on ${b.name}.`);
  b.history.push(`Day ${world.day}: ${a.name} declared war.`);
  world.history.unshift({
    id: uid('hist'), tick: world.tick, day: world.day, type: 'war',
    text: `${a.name} declared war on ${b.name}.`,
    participants: [], factionId: a.id, location: 'the island', significant: true
  });
  pushLog(world, `WAR: ${a.name} has declared war on ${b.name}.`, 'war');
}

export function makePeace(world: World, a: Faction, b: Faction): void {
  a.wars = a.wars.filter((id) => id !== b.id);
  b.wars = b.wars.filter((id) => id !== a.id);
  a.relations[b.id] = clamp((a.relations[b.id] ?? 0) + 18, -100, 100);
  b.relations[a.id] = clamp((b.relations[a.id] ?? 0) + 18, -100, 100);
  a.history.push(`Day ${world.day}: made peace with ${b.name}.`);
  b.history.push(`Day ${world.day}: peace with ${a.name}.`);
  world.history.unshift({
    id: uid('hist'), tick: world.tick, day: world.day, type: 'peace',
    text: `${a.name} and ${b.name} agreed to peace.`,
    participants: [], factionId: a.id, location: 'the island', significant: true
  });
  pushLog(world, `Peace between ${a.name} and ${b.name}.`, 'good');
}

export function discoverAggression(world: World, faction: Faction, reason: string): void {
  if (faction.aggressiveDiscovered) return;
  faction.aggressiveDiscovered = true;
  faction.knownByPlayer = clamp(faction.knownByPlayer + 0.3, 0, 1);
  pushLog(world, `Intelligence: ${faction.name} is far more aggressive than it appears. (${reason})`, 'war');
}

export function factionSummary(world: World, faction: Faction): string {
  const members = membersOf(world, faction.id);
  const soldiers = members.filter((m) => m.occupation === 'soldier').length;
  return `${faction.name} — ${faction.government}, ${members.length} people, ${soldiers} soldiers, age ${faction.techAge + 1}`;
}
