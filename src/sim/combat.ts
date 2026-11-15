import { REGIONS, TARGETABLE, describePart, impairment, accuracyPenalty, mobilityFactor, canUseTwoHanded } from '../core/anatomy';
import type { BodyRegion, Injury } from '../core/anatomy';
import { RNG, clamp, uid } from '../core/rng';
import { durabilityMultiplier, RESOURCE_LABEL } from '../data/goods';
import type { AttackOptions, AttackResult, Corpse, Faction, NPC, World } from '../core/types';
import { addItem, trainSkill } from './npc';
import { locationName, pushLog, recordSignificantEvent, spreadRumour } from './memory';

const FIST = {
  id: 'fist',
  kind: 'fist' as const,
  name: 'Bare hands',
  material: 'wood' as const,
  damage: 3,
  reach: 1.8,
  twoHanded: false,
  ranged: false,
  durability: 999,
  maxDurability: 999
};

export function combatFrozen(world: World): boolean {
  return world.finishing.active;
}

export function weaponOf(npc: NPC) {
  return npc.weapon && npc.weapon.durability > 0 ? npc.weapon : FIST;
}

export function injuryPenalty(npc: NPC): { accuracy: number; mobility: number; pain: number } {
  return {
    accuracy: accuracyPenalty(npc.body),
    mobility: mobilityFactor(npc.body),
    pain: impairment(npc.body)
  };
}

function sharpWeapon(kind: string): boolean {
  return kind === 'sword' || kind === 'axe' || kind === 'dagger' || kind === 'spear';
}

function chooseInjuryType(kind: string, rng: RNG): Injury['type'] {
  switch (kind) {
    case 'fist':
      return rng.chance(0.7) ? 'bruise' : 'fracture';
    case 'club':
    case 'hammer':
      return rng.chance(0.5) ? 'fracture' : 'bruise';
    case 'axe':
    case 'sword':
    case 'dagger':
      return 'cut';
    case 'spear':
      return rng.chance(0.6) ? 'cut' : 'fracture';
    case 'bow':
    case 'crossbow':
    case 'musket':
      return 'cut';
    default:
      return 'bruise';
  }
}

function frozenResult(): AttackResult {
  return {
    hit: false, blocked: false, dodged: false, damage: 0, part: null, injuryId: null,
    fatal: false, dismembered: false, durabilityLoss: 0,
    message: 'The world is frozen around the finishing choice.',
    qualifiesFinisher: false, weaponBroke: false
  };
}

/** Resolves one attack between any two characters, player included. */
export function resolveAttack(
  world: World,
  attacker: NPC,
  defender: NPC,
  rng: RNG,
  options: AttackOptions = {}
): AttackResult {
  // THE HARD FREEZE RULE: no combat resolution at all while a finishing choice or
  // cinematic is running. Neither side can gain an advantage.
  if (combatFrozen(world)) return frozenResult();
  if (!attacker.alive || !defender.alive) return frozenResult();
  if (defender.isPlayer && world.cheats?.powers?.invisible && world.cheats.bloodline?.includes('invisible')) {
    return { ...frozenResult(), message: `${attacker.firstName} swings at nothing. They cannot see you.` };
  }
  if (defender.isPlayer && world.cheats?.powers?.invincible && world.cheats.bloodline?.includes('invincible')) {
    return { ...frozenResult(), message: `${attacker.firstName}'s blow turns aside. Nothing can mark you.` };
  }

  const weapon = weaponOf(attacker);
  const luciferBlade = attacker.isPlayer && Boolean(world.cheats?.lucifer);
  const distance = Math.hypot(defender.position.x - attacker.position.x, defender.position.z - attacker.position.z);
  const reach = weapon.ranged ? weapon.reach : weapon.reach + 0.55;
  if (distance > reach) {
    return { ...frozenResult(), message: `${attacker.firstName} is out of reach of ${defender.firstName}.` };
  }
  if (weapon.twoHanded && !canUseTwoHanded(attacker.body)) {
    return { ...frozenResult(), message: `${attacker.firstName} cannot wield ${weapon.name} with one arm.` };
  }

  const attackerSkill = (attacker.skills.combat ?? 0) + (weapon.kind === 'fist' ? attacker.skills.unarmed ?? 0 : 0);
  const defenderSkill = defender.skills.combat ?? 0;
  const penalty = injuryPenalty(attacker);
  const movement = clamp((attacker.genes.agility - 50) / 100, -0.2, 0.3);

  let hitChance = 0.6 + attackerSkill * 0.021 + movement - defenderSkill * 0.013
    - penalty.pain * 0.4 - penalty.accuracy * 0.55;
  if (options.aimedPart) hitChance *= 0.55;
  if (options.sneak) hitChance += 0.22;
  if (weapon.kind === 'fist') hitChance += 0.06;
  if (weapon.durability <= 0) hitChance -= 0.18;
  if (defender.needs.fatigue < 25) hitChance += 0.06;
  if (weapon.ranged) hitChance -= clamp(distance / 180, 0, 0.4);
  hitChance = clamp(hitChance, 0.05, 0.95);
  // LUCIFER's dagger always finds flesh; the choice follows the first blow.
  if (luciferBlade) hitChance = 1;

  const roll = rng.next();
  if (roll > hitChance) {
    trainSkill(attacker, 'combat', 1.2);
    return {
      hit: false, blocked: false, dodged: roll < hitChance * 0.35, damage: 0, part: null,
      injuryId: null, fatal: false, dismembered: false, durabilityLoss: 0,
      message: rng.chance(0.5)
        ? `${attacker.firstName} misses ${defender.firstName}.`
        : `${defender.firstName} slips aside from ${attacker.firstName}'s ${weapon.name}.`,
      qualifiesFinisher: false, weaponBroke: false
    };
  }

  // Defensive reactions: block or parry with a readied weapon.
  const blockChance = defender.weapon
    ? clamp(0.14 + defenderSkill * 0.016 + (defender.needs.fatigue > 50 ? 0.03 : -0.04) - penalty.pain * 0.2, 0.03, 0.55)
    : 0.05;
  const readied = options.defenderBlocking ? 0.22 : 0;
  const blocking = !luciferBlade && !options.ranged && rng.chance(clamp(blockChance + readied, 0.03, 0.7));
  if (blocking) {
    trainSkill(defender, 'combat', 2);
    trainSkill(attacker, 'combat', 1);
    const durabilityLoss = rng.range(2, 6);
    if (attacker.weapon) attacker.weapon.durability = Math.max(0, attacker.weapon.durability - durabilityLoss * 0.4);
    if (defender.weapon) defender.weapon.durability = Math.max(0, defender.weapon.durability - durabilityLoss);
    return {
      hit: false, blocked: true, dodged: false, damage: 0, part: null, injuryId: null,
      fatal: false, dismembered: false, durabilityLoss,
      message: `${defender.firstName} blocks ${attacker.firstName}'s blow.`,
      qualifiesFinisher: false, weaponBroke: false
    };
  }

  let region: BodyRegion;
  let key: string;
  if (options.aimedPart) {
    region = options.aimedPart;
    const info = REGIONS[region];
    const side = info.paired ? (options.aimedSide ?? (rng.chance(0.5) ? 'L' : 'R')) : '';
    key = side ? `${region}:${side}` : region;
  } else {
    const weighted: [BodyRegion, number][] = (Object.keys(REGIONS) as BodyRegion[])
      .filter((r) => r !== 'eyes' && r !== 'ears' || rng.chance(0.25))
      .map((r) => [r, REGIONS[r].weight]);
    region = rng.weighted(weighted);
    const info = REGIONS[region];
    key = info.paired ? `${region}:${rng.chance(0.5) ? 'L' : 'R'}` : region;
  }

  const info = REGIONS[region];
  const base = weapon.damage * (options.power ?? 1) * info.vital;
  const variance = rng.range(0.82, 1.24);
  const skillBonus = 1 + attackerSkill * 0.03;
  const armorFactor = 1 - clamp(defender.armor, 0, 0.75);
  let damage = base * variance * skillBonus * armorFactor
    * durabilityMultiplier(weapon.durability, weapon.maxDurability)
    * (1 - penalty.pain * 0.3);
  damage = Math.max(1, Math.round(damage * 10) / 10);

  // Durability: every landed blow wears the weapon; broken weapons hit like a stick.
  let durabilityLoss = 0;
  let weaponBroke = false;
  if (attacker.weapon && attacker.weapon.kind !== 'fist') {
    durabilityLoss = rng.range(0.6, 2.4) * (attacker.weapon.kind === 'sword' || attacker.weapon.kind === 'axe' ? 1.6 : 1);
    if (rng.chance(0.05)) durabilityLoss += rng.range(4, 12);
    const before = attacker.weapon.durability;
    attacker.weapon.durability = Math.max(0, attacker.weapon.durability - durabilityLoss);
    weaponBroke = before > 0 && attacker.weapon.durability === 0;
  }

  defender.health = Math.max(0, defender.health - damage);
  defender.lastAttackerId = attacker.id;
  defender.inCombat = true;
  defender.enemyId = attacker.id;
  attacker.inCombat = true;
  attacker.enemyId = defender.id;
  trainSkill(attacker, 'combat', 2.4);
  trainSkill(defender, 'combat', 1.4);
  if (attacker.weapon?.kind === 'fist') trainSkill(attacker, 'unarmed', 1.5);

  const severity: 0 | 1 | 2 | 3 = damage >= 26 ? 3 : damage >= 13 ? 2 : damage >= 5 ? 1 : 0;
  let injury: Injury | null = null;
  let dismembered = false;

  if (severity > 0) {
    const permanentChance = severity === 3 ? 0.3 + (sharpWeapon(weapon.kind) ? 0.12 : 0) : severity === 2 ? 0.05 : 0;
    const permanent = rng.chance(permanentChance);
    // A deliberate targeted strike at a limb can cripple even without a finishing blow.
    const severChance = options.aimedPart && sharpWeapon(weapon.kind) && info.severable && severity >= 2
      ? 0.04 + (attackerSkill * 0.004)
      : 0.008;
    dismembered = info.severable && severity >= 2 && permanent && rng.chance(severChance);
    injury = applyInjury(world, defender, key, {
      type: dismembered ? 'amputation' : chooseInjuryType(weapon.kind, rng),
      severity: severity as 1 | 2 | 3,
      permanent: permanent || dismembered,
      dismembered,
      cause: `${attacker.firstName}'s ${weapon.name}`,
      attackerId: attacker.id,
      rng
    });
  }

  const fatal = defender.health <= 0;
  let message = injury
    ? `${attacker.firstName} strikes ${defender.firstName}'s ${describePart(key)} with ${weapon.name}.`
    : `${attacker.firstName} hits ${defender.firstName} for ${Math.round(damage)} damage.`;
  if (dismembered) message = `${attacker.firstName} severs ${defender.firstName}'s ${describePart(key)} with ${weapon.name}!`;
  if (weaponBroke) message += ` The ${weapon.name} breaks under the blow.`;

  const result: AttackResult = {
    hit: true, blocked: false, dodged: false, damage,
    part: key, injuryId: injury?.id ?? null, fatal,
    dismembered, durabilityLoss,
    message, qualifiesFinisher: !fatal && defender.health <= 24,
    weaponBroke
  };

  if (fatal) {
    killCharacter(world, defender, attacker.id, `${weapon.name} wound`);
  } else if (dismembered) {
    recordSignificantEvent(world, {
      type: 'dismemberment',
      summary: `${attacker.firstName} ${attacker.family} severes the ${describePart(key)} of ${defender.firstName} ${defender.family}.`,
      attackerId: attacker.id,
      victimId: defender.id,
      factionId: attacker.factionId,
      position: defender.position,
      emotionalImpact: 82,
      consequences: `${defender.firstName} loses the ${describePart(key)} permanently.`,
      memoryType: 'dismemberment'
    });
  }

  return result;
}

export function applyInjury(
  world: World,
  victim: NPC,
  partKeyValue: string,
  options: {
    type: Injury['type'];
    severity: 1 | 2 | 3;
    permanent: boolean;
    dismembered: boolean;
    cause: string;
    attackerId: string | null;
    rng: RNG;
  }
): Injury {
  const part = victim.body[partKeyValue];
  if (!part) throw new Error(`Unknown body part ${partKeyValue}`);
  const rng = options.rng;
  const healDays = options.permanent ? null : (options.severity === 3 ? 26 : options.severity === 2 ? 11 : 4) + rng.int(0, 6);
  const injury: Injury = {
    id: uid('inj'),
    part: partKeyValue,
    type: options.type,
    severity: options.severity as 1 | 2 | 3,
    permanent: options.permanent,
    dismembered: options.dismembered,
    createdAt: world.tick,
    healAt: healDays === null ? null : world.tick + healDays * 144,
    cause: options.cause,
    attackerId: options.attackerId,
    bleeding: options.type === 'cut' || options.type === 'bite' || options.type === 'amputation'
  };
  part.injuries.push(injury);
  if (options.dismembered) {
    part.dismembered = true;
    part.bleeding = 3;
    victim.health = Math.max(1, victim.health - 12);
    victim.maxHealth = Math.max(45, victim.maxHealth - 8);
  } else if (injury.bleeding) {
    part.bleeding = Math.min(3, part.bleeding + options.severity);
  }
  if (options.severity === 3) victim.needs.happiness = clamp(victim.needs.happiness - 12, 0, 100);
  victim.woundedAt = world.tick;
  if (options.permanent) {
    victim.history.push(`Suffered a permanent ${options.type} injury to the ${describePart(partKeyValue)} (day ${world.day}).`);
  }
  return injury;
}

/** The finishing-choice wound: a permanent anatomical removal that the victim survives. */
export function applyFinishingWound(
  world: World,
  attacker: NPC | null,
  victim: NPC,
  partKeyValue: string,
  weaponName: string,
  rng: RNG
): Injury {
  const part = victim.body[partKeyValue];
  const alreadyLost = part?.dismembered;
  const injury = applyInjury(world, victim, partKeyValue, {
    type: alreadyLost ? 'disfigurement' : 'amputation',
    severity: 3,
    permanent: true,
    dismembered: false,
    cause: `Finishing blow from ${attacker?.firstName ?? 'an unknown attacker'}'s ${weaponName}`,
    attackerId: attacker?.id ?? null,
    rng
  });
  if (part) {
    part.dismembered = true;
    part.bleeding = 3;
    injury.dismembered = true;
    // Permanent anatomical loss is not free: it caps what the body can take.
    victim.maxHealth = Math.max(45, victim.maxHealth - 8);
  }
  victim.health = Math.max(4, victim.health - 6);
  const event = recordSignificantEvent(world, {
    type: 'finisher-wound',
    summary: `${attacker?.firstName ?? 'Someone'} cripples ${victim.firstName} ${victim.family}, taking the ${describePart(partKeyValue)}.`,
    attackerId: attacker?.id ?? null,
    victimId: victim.id,
    factionId: attacker?.factionId ?? victim.factionId,
    position: victim.position,
    emotionalImpact: 88,
    consequences: `${victim.firstName} survives without the ${describePart(partKeyValue)}. Permanent.`,
    memoryType: 'finisher-wound',
    replay: {
      attackerPos: attacker ? [attacker.position.x, 0, attacker.position.z] : [victim.position.x, 0, victim.position.z],
      victimPos: [victim.position.x, 0, victim.position.z],
      facing: 0,
      part: partKeyValue,
      option: 'wound',
      weaponName,
      victimName: victim.name
    }
  });
  spreadRumour(world, event.witnessIds, `${victim.firstName} ${victim.family} was crippled at ${locationName(world, victim.position)}.`);
  return injury;
}

/** The finishing-choice kill: permanent death with full consequences. */
export function applyFinishingKill(
  world: World,
  attacker: NPC | null,
  victim: NPC,
  partKeyValue: string,
  weaponName: string
): void {
  recordSignificantEvent(world, {
    type: 'finisher-kill',
    summary: `${attacker?.firstName ?? 'Someone'} finishes ${victim.firstName} ${victim.family} with ${weaponName} at ${locationName(world, victim.position)}.`,
    attackerId: attacker?.id ?? null,
    victimId: victim.id,
    factionId: attacker?.factionId ?? victim.factionId,
    position: victim.position,
    emotionalImpact: 96,
    consequences: `${victim.firstName} is dead. Permanently.`,
    memoryType: 'finisher-kill',
    replay: {
      attackerPos: attacker ? [attacker.position.x, 0, attacker.position.z] : [victim.position.x, 0, victim.position.z],
      victimPos: [victim.position.x, 0, victim.position.z],
      facing: 0,
      part: partKeyValue,
      option: 'kill',
      weaponName,
      victimName: victim.name
    }
  });
  killCharacter(world, victim, attacker?.id ?? null, `executed with ${weaponName}`);
}

export function killCharacter(world: World, victim: NPC, killerId: string | null, cause: string): void {
  if (!victim.alive) return;
  victim.alive = false;
  victim.health = 0;
  victim.deathTick = world.tick;
  victim.deathCause = cause;
  victim.inCombat = false;
  victim.enemyId = null;
  world.deaths += 1;

  const corpse: Corpse = {
    id: uid('corpse'),
    npcId: victim.id,
    name: victim.name,
    position: { ...victim.position },
    inventory: { ...victim.inventory },
    money: victim.money,
    tick: world.tick,
    cause
  };
  world.corpses.push(corpse);
  if (world.corpses.length > 120) world.corpses.shift();

  const killer = killerId ? world.npcs.get(killerId) : null;
  const faction = victim.factionId ? world.factions.find((f) => f.id === victim.factionId) : null;

  if (killer && killer.id !== victim.id) {
    const victimFaction = faction;
    if (victimFaction && killer.factionId !== victimFaction.id) {
      victimFaction.relations[killer.factionId ?? 'player'] =
        clamp((victimFaction.relations[killer.factionId ?? 'player'] ?? 0) - 22, -100, 100);
    }
    // The killer is remembered by everyone who knew the victim.
    for (const otherId of victim.familyIds) {
      const other = world.npcs.get(otherId);
      if (!other || !other.alive) continue;
      const rel = other.relationships[killer.id] ?? { affinity: 0, trust: 0, fear: 0, lastInteractionTick: world.tick };
      rel.affinity = clamp(rel.affinity - 85, -100, 100);
      rel.trust = clamp(rel.trust - 90, -100, 100);
      rel.fear = clamp(rel.fear + 55, 0, 100);
      rel.lastInteractionTick = world.tick;
      other.relationships[killer.id] = rel;
      recordSignificantEvent(world, {
        type: 'family-death',
        summary: `${other.firstName}'s ${other.spouseId === victim.id ? 'spouse' : 'kin'} ${victim.firstName} was killed by ${killer.firstName}.`,
        attackerId: killer.id,
        victimId: victim.id,
        factionId: other.factionId,
        position: victim.position,
        emotionalImpact: 95,
        consequences: `${other.firstName} is grieving and will remember ${killer.firstName}.`,
        memoryType: 'family-death'
      });
    }
  }

  inheritProperty(world, victim, killer?.id ?? null);
  pushLog(world, `${victim.name} has died (${cause}).`, 'bad');
  if (faction) {
    faction.history.push(`Day ${world.day}: ${victim.name} died (${cause}).`);
    // Succession if a leader falls.
    if (faction.leaderId === victim.id) {
      const successor = pickSuccessor(world, faction, victim);
      faction.leaderId = successor?.id ?? null;
      if (successor) {
        pushLog(world, `${successor.name} takes leadership of ${faction.name} after ${victim.name}'s death.`, 'war');
        faction.history.push(`Day ${world.day}: ${successor.name} succeeded ${victim.name}.`);
      }
    }
    faction.military.soldiers = Math.max(0, faction.military.soldiers - (victim.occupation === 'soldier' ? 1 : 0));
  }
  if (victim.isPlayer) {
    pushLog(world, 'You have died. Your story continues in the world you leave behind.', 'bad');
  }
}

function pickSuccessor(world: World, faction: Faction, dead: NPC): NPC | null {
  const candidates = [...world.npcs.values()]
    .filter((n) => n.alive && n.factionId === faction.id && n.id !== dead.id)
    .sort((a, b) => {
      const score = (n: NPC) => (n.skills.administration ?? 0) * 2 + n.personality.ambition * 0.2
        + (n.spouseId === dead.id ? 12 : 0) + (dead.childIds.includes(n.id) ? 15 : 0);
      return score(b) - score(a);
    });
  return candidates[0] ?? null;
}

export function inheritProperty(world: World, dead: NPC, killerId: string | null): void {
  const heirs: NPC[] = [];
  for (const id of [dead.spouseId, ...dead.childIds]) {
    if (!id) continue;
    const heir = world.npcs.get(id);
    if (heir?.alive) heirs.push(heir);
  }
  const faction = dead.factionId ? world.factions.find((f) => f.id === dead.factionId) : null;
  const fallback = faction && faction.leaderId && world.npcs.get(faction.leaderId)?.alive
    ? world.npcs.get(faction.leaderId)!
    : killerId
      ? world.npcs.get(killerId) ?? null
      : null;

  const share = (amount: number) => heirs.length > 0 ? amount / heirs.length : 0;
  const moneyShare = share(dead.money);
  for (const heir of heirs) {
    heir.money += moneyShare;
    heir.history.push(`Inherited ${Math.round(moneyShare)} coin from ${dead.name}.`);
  }
  if (heirs.length === 0 && fallback) {
    fallback.money += dead.money;
  }

  for (const building of world.buildings) {
    if (building.ownerId !== dead.id) continue;
    const heir = heirs[0] ?? fallback;
    building.ownerId = heir?.id ?? null;
    if (!heir) building.factionId = faction?.id ?? building.factionId;
    if (heir) heir.history.push(`Inherited ${building.name} from ${dead.name}.`);
  }
}

/** Runs daily healing, bleeding and infection for one character. */
export function healTick(world: World, npc: NPC, rng: RNG): void {
  if (!npc.alive) return;
  let bleeding = 0;
  for (const part of Object.values(npc.body)) {
    bleeding += part.bleeding;
    for (let i = part.injuries.length - 1; i >= 0; i--) {
      const injury = part.injuries[i];
      if (injury.permanent) continue;
      if (injury.healAt !== null && world.tick >= injury.healAt) {
        if (injury.severity > 1) {
          injury.severity = (injury.severity - 1) as 1 | 2;
          injury.healAt = world.tick + 120;
        } else {
          injury.severity = 0;
          injury.bleeding = false;
          part.injuries.splice(i, 1);
          npc.history.push(`Recovered from a ${injury.type} on the ${describePart(part.key)}.`);
        }
      } else if (injury.bleeding && rng.chance(0.09)) {
        injury.bleeding = false;
        part.bleeding = Math.max(0, part.bleeding - 1);
      }
    }
    if (part.injuries.length === 0) part.bleeding = 0;
  }

  if (bleeding > 0) {
    npc.health = Math.max(0, npc.health - bleeding * 0.35);
    if (npc.health <= 0) {
      killCharacter(world, npc, null, 'blood loss');
      return;
    }
  }

  const wounded = Object.values(npc.body).some((p) => p.injuries.length > 0);
  const medicine = npc.skills.medicine ?? 0;
  const recovery = wounded ? 0.4 + medicine * 0.12 : 1.6;
  npc.health = Math.min(npc.maxHealth, npc.health + recovery);
}

/** Whether the attacker can currently perform a finishing action on the defender. */
export function canFinish(world: World, attacker: NPC, defender: NPC): { ok: boolean; part: string | null; reason: string } {
  if (combatFrozen(world)) return { ok: false, part: null, reason: 'Frozen' };
  if (!attacker.alive || !defender.alive) return { ok: false, part: null, reason: 'Dead' };
  const weapon = weaponOf(attacker);
  const distance = Math.hypot(defender.position.x - attacker.position.x, defender.position.z - attacker.position.z);
  if (distance > weapon.reach + 1.4) return { ok: false, part: null, reason: 'Out of range' };
  if (defender.isPlayer && (world.cheats?.powers?.invincible || world.cheats?.powers?.invisible)) {
    return { ok: false, part: null, reason: 'They cannot touch you' };
  }
  // LUCIFER: the dagger opens a wound/kill choice on any living opponent.
  const lucifer = attacker.isPlayer && world.cheats?.lucifer;
  const vulnerable = lucifer || defender.health <= 24
    || Object.values(defender.body).some((p) => p.injuries.some((i) => i.severity === 3));
  if (!vulnerable) return { ok: false, part: null, reason: 'Opponent is still fighting' };

  const reachable: string[] = [];
  for (const region of TARGETABLE) {
    const info = REGIONS[region];
    if (!info.severable) continue;
    const keys = info.paired ? [`${region}:L`, `${region}:R`] : [region];
    for (const key of keys) {
      const part = defender.body[key];
      if (part && !part.dismembered) reachable.push(key);
    }
  }
  if (reachable.length === 0) return { ok: false, part: null, reason: 'No limb within reach' };
  return { ok: true, part: reachable[0], reason: '' };
}

export function dismantleWeapon(npc: NPC, rng: RNG): void {
  if (!npc.weapon) return;
  const good = rng.chance(0.4) ? 'wood' : 'iron';
  addItem(npc, good, 1);
  npc.weapon = null;
}

export { RESOURCE_LABEL };
