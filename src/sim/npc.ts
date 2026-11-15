import { RNG, clamp, uid } from '../core/rng';
import { createBody } from '../core/anatomy';
import { personName } from '../core/names';
import type { NPC, Weapon, WeaponKind, WeaponMaterial } from '../core/types';
import { PROFESSIONS } from '../data/professions';
import { SKILLS } from '../data/professions';

const WEAPON_STATS: Record<WeaponKind, { damage: number; reach: number; twoHanded: boolean; ranged: boolean; durability: number }> = {
  fist: { damage: 3, reach: 1.7, twoHanded: false, ranged: false, durability: 999 },
  club: { damage: 7, reach: 2.1, twoHanded: false, ranged: false, durability: 70 },
  dagger: { damage: 9, reach: 1.6, twoHanded: false, ranged: false, durability: 60 },
  sword: { damage: 15, reach: 2.3, twoHanded: false, ranged: false, durability: 90 },
  axe: { damage: 17, reach: 1.9, twoHanded: false, ranged: false, durability: 80 },
  spear: { damage: 13, reach: 3.1, twoHanded: true, ranged: false, durability: 70 },
  bow: { damage: 14, reach: 40, twoHanded: true, ranged: true, durability: 55 },
  crossbow: { damage: 18, reach: 55, twoHanded: true, ranged: true, durability: 65 },
  musket: { damage: 30, reach: 90, twoHanded: true, ranged: true, durability: 50 },
  hammer: { damage: 16, reach: 2.2, twoHanded: true, ranged: false, durability: 95 },
  staff: { damage: 8, reach: 3.4, twoHanded: true, ranged: false, durability: 50 }
};

const MATERIAL_MULT: Record<WeaponMaterial, number> = {
  wood: 0.7, stone: 0.85, copper: 1, bronze: 1.2, iron: 1.4, steel: 1.65
};

const MATERIAL_NAMES: Record<WeaponMaterial, string> = {
  wood: 'wooden', stone: 'stone', copper: 'copper', bronze: 'bronze', iron: 'iron', steel: 'steel'
};

export function makeWeapon(kind: WeaponKind, material: WeaponMaterial, rng?: RNG): Weapon {
  const stats = WEAPON_STATS[kind];
  const mult = MATERIAL_MULT[material];
  const maxDurability = Math.round(stats.durability * (0.85 + mult * 0.35));
  return {
    id: uid('wpn', rng),
    kind,
    name: kind === 'fist' ? 'Bare hands' : `${MATERIAL_NAMES[material]} ${kind}`,
    material,
    damage: Math.round(stats.damage * mult * 10) / 10,
    reach: stats.reach,
    twoHanded: stats.twoHanded,
    ranged: stats.ranged,
    durability: maxDurability,
    maxDurability
  };
}

export function weaponForAge(age: number, rng: RNG): Weapon {
  const loadout: [WeaponKind, WeaponMaterial][] = age >= 7
    ? [['musket', 'steel'], ['sword', 'steel'], ['crossbow', 'steel']]
    : age >= 5
      ? [['crossbow', 'iron'], ['sword', 'iron'], ['spear', 'iron']]
      : age >= 3
        ? [['sword', 'iron'], ['axe', 'iron'], ['spear', 'iron']]
        : age >= 2
          ? [['sword', 'bronze'], ['spear', 'bronze'], ['bow', 'wood']]
          : age >= 1
            ? [['dagger', 'copper'], ['spear', 'wood'], ['bow', 'wood']]
            : [['club', 'wood'], ['spear', 'wood'], ['axe', 'stone']];
  const [kind, material] = rng.pick(loadout);
  return makeWeapon(kind, material, rng);
}

export function rollPersonality(rng: RNG): NPC['personality'] {
  return {
    openness: rng.int(10, 95),
    aggression: rng.int(5, 90),
    loyalty: rng.int(20, 95),
    empathy: rng.int(10, 95),
    bravery: rng.int(15, 95),
    industry: rng.int(20, 95),
    ambition: rng.int(10, 95)
  };
}

export function rollGenes(rng: RNG, parents?: NPC[]): NPC['genes'] {
  const blend = (a: number, b: number) => Math.round(clamp((a + b) / 2 + rng.range(-12, 12), 8, 98));
  if (parents && parents.length === 2) {
    return {
      strength: blend(parents[0].genes.strength, parents[1].genes.strength),
      agility: blend(parents[0].genes.agility, parents[1].genes.agility),
      endurance: blend(parents[0].genes.endurance, parents[1].genes.endurance),
      intellect: blend(parents[0].genes.intellect, parents[1].genes.intellect),
      resilience: blend(parents[0].genes.resilience, parents[1].genes.resilience)
    };
  }
  return {
    strength: rng.int(20, 90),
    agility: rng.int(20, 90),
    endurance: rng.int(20, 90),
    intellect: rng.int(20, 90),
    resilience: rng.int(20, 90)
  };
}

export function emptySkills(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const skill of SKILLS) out[skill] = 0;
  return out;
}

export function skillOf(npc: NPC, skill: string): number {
  return npc.skills[skill] ?? 0;
}

export function trainSkill(npc: NPC, skill: string, amount: number): void {
  const current = npc.skills[skill] ?? 0;
  if (current >= 20) return;
  npc.xp[skill] = (npc.xp[skill] ?? 0) + amount;
  const threshold = 12 + current * 9;
  if (npc.xp[skill] >= threshold) {
    npc.xp[skill] = 0;
    npc.skills[skill] = current + 1;
  }
}

export function createNPC(options: {
  rng: RNG;
  factionId: string | null;
  position: { x: number; z: number };
  age?: number;
  isPlayer?: boolean;
  family?: string;
  parents?: NPC[];
  techAge?: number;
}): NPC {
  const { rng, factionId, position } = options;
  const gender = rng.chance(0.5) ? 'M' : 'F';
  const age = options.age ?? rng.int(17, 46);
  const name = personName(rng, gender, options.family);
  const genes = rollGenes(rng, options.parents);
  const skills = emptySkills();
  const xp: Record<string, number> = {};
  const age0 = options.techAge ?? 0;
  const profession = options.isPlayer ? 'Survivor' : rng.pick(PROFESSIONS).id;
  // Starting competence comes from childhood, apprenticeship and temperament.
  for (const skill of SKILLS) {
    skills[skill] = rng.int(0, 3);
  }
  if (!options.isPlayer) {
    const prof = PROFESSIONS.find((p) => p.id === profession);
    if (prof) skills[prof.skill] = clamp(skills[prof.skill] + rng.int(2, 5), 0, 20);
    skills.combat = clamp(skills.combat + (age0 >= 3 ? 2 : 0), 0, 20);
  }
  const weapon = options.isPlayer ? makeWeapon('club', 'wood', rng) : weaponForAge(age0, rng);
  for (const skill of SKILLS) xp[skill] = 0;

  return {
    id: uid(options.isPlayer ? 'player' : 'npc', rng),
    name: options.isPlayer ? 'You' : name.full,
    firstName: options.isPlayer ? 'Wanderer' : name.first,
    family: name.family,
    age,
    gender,
    factionId,
    isPlayer: !!options.isPlayer,
    appearance: {
      skin: rng.range(0.55, 0.95),
      hair: rng.range(0.05, 0.85),
      height: rng.range(1.55, 1.95),
      build: rng.range(0.8, 1.25),
      clothing: rng.int(0, 5)
    },
    genes,
    personality: rollPersonality(rng),
    needs: {
      hunger: rng.int(55, 90),
      thirst: rng.int(55, 90),
      fatigue: rng.int(60, 95),
      happiness: rng.int(45, 80),
      morale: rng.int(45, 85)
    },
    health: 100,
    maxHealth: 100,
    alive: true,
    body: createBody(),
    skills,
    xp,
    occupation: options.isPlayer ? 'Survivor' : profession,
    education: options.isPlayer ? 1 : rng.int(0, 3),
    inventory: options.isPlayer
      ? { berries: 4, water: 2, wood: 2, stone: 1 }
      : { [rng.pick(['berries', 'bread', 'fish', 'meat'])]: rng.int(1, 4), water: rng.int(1, 3) },
    money: options.isPlayer ? 12 : rng.int(2, 30),
    weapon,
    armor: 0,
    homeId: null,
    businessId: null,
    familyIds: [],
    parentIds: options.parents?.map((p) => p.id) ?? [],
    spouseId: null,
    childIds: [],
    relationships: {},
    opinions: {},
    loyalty: rng.int(40, 90),
    politicalBeliefs: {
      authority: rng.int(10, 90),
      tradition: rng.int(10, 90),
      militarism: rng.int(10, 90)
    },
    memories: [],
    goals: [],
    fears: [],
    ambitions: [],
    history: [],
    position: { ...position },
    activity: 'idle',
    activityTarget: null,
    inCombat: false,
    enemyId: null,
    lastAttackerId: null,
    attackCooldown: 0,
    simLevel: 'near',
    rentDue: 0,
    woundedAt: null,
    deathTick: null,
    deathCause: null,
    lastDecisionTick: -999
  };
}

export function createPlayer(rng: RNG, position: { x: number; z: number }): NPC {
  const player = createNPC({ rng, factionId: null, position, age: 26, isPlayer: true, family: 'Ashford' });
  player.name = 'You';
  player.firstName = 'Wanderer';
  player.goals = ['Survive the first winter', 'Find a place to settle', 'Make a name for yourself'];
  player.fears = ['Dying alone in the wilderness'];
  player.ambitions = ['Build something that outlives me'];
  player.history.push('Washed ashore on the southern coast with almost nothing.');
  return player;
}

export function addItem(npc: NPC, good: string, amount: number): void {
  npc.inventory[good] = Math.max(0, (npc.inventory[good] ?? 0) + amount);
  if (npc.inventory[good] === 0) delete npc.inventory[good];
}

export function takeItem(npc: NPC, good: string, amount: number): boolean {
  const have = npc.inventory[good] ?? 0;
  if (have < amount) return false;
  addItem(npc, good, -amount);
  return true;
}

export function totalItems(npc: NPC): number {
  return Object.values(npc.inventory).reduce((sum, v) => sum + v, 0);
}

export function isAlive(world: { npcs: Map<string, NPC> }, id: string | null): boolean {
  if (!id) return false;
  const npc = world.npcs.get(id);
  return !!npc && npc.alive;
}

export function healthRatio(npc: NPC): number {
  return clamp(npc.health / npc.maxHealth, 0, 1);
}
