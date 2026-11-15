import { RNG, clamp } from '../core/rng';
import { describePart, mobilityFactor } from '../core/anatomy';
import { FOOD_GOODS, DRINK_GOODS } from '../data/goods';
import { PROFESSION_BY_ID } from '../data/professions';
import type { NPC, World } from '../core/types';
import { heightAt, isWalkable, SEA_LEVEL } from '../world/worldgen';
import { resolveAttack, weaponOf, injuryPenalty } from './combat';
import { npcFinisher } from './finishing';
import { isHostile } from './factions';
import { addItem, takeItem, trainSkill } from './npc';
import { recordMemory } from './memory';
import { npcBlocked } from './collision';

const TICKS_PER_DAY = 240;
const NEAR_RADIUS = 110;
const FAR_RADIUS = 420;

export function isNight(world: World): boolean {
  const hour = Math.floor(world.minutes / 60);
  return hour < 6 || hour >= 20;
}

function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function moveToward(
  world: World,
  npc: NPC,
  target: { x: number; z: number },
  speed: number
): boolean {
  const d = dist(npc.position, target);
  if (d < 1.4) return true;
  const mobility = mobilityFactor(npc.body);
  const pain = injuryPenalty(npc).pain;
  const step = Math.min(d, speed * mobility * (1 - pain * 0.35));
  const fromX = npc.position.x;
  const fromZ = npc.position.z;
  const dx = (target.x - fromX) / d;
  const dz = (target.z - fromZ) / d;
  // Try straight ahead first, then fan out to either side around a structure.
  for (const angle of [0, 0.55, -0.55, 1.05, -1.05, 1.45, -1.45, 1.57, -1.57]) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const nx = fromX + (dx * cos - dz * sin) * step;
    const nz = fromZ + (dx * sin + dz * cos) * step;
    if (!isWalkable(world.terrain, nx, nz)) continue;
    if (npcBlocked(world, nx, nz, fromX, fromZ, target)) continue;
    npc.position.x = nx;
    npc.position.z = nz;
    break;
  }
  return dist(npc.position, target) < 1.6;
}

function nearestMarket(world: World, npc: NPC) {
  if (!world.markets.length) return null;
  return world.markets.reduce((best, market) =>
    dist(market.position, npc.position) < dist(best.position, npc.position) ? market : best
  );
}

function nearestEnemy(world: World, npc: NPC): NPC | null {
  let best: NPC | null = null;
  let bestDist = Infinity;
  for (const other of world.npcs.values()) {
    if (!other.alive || other.id === npc.id || other.id === world.designBotId) continue;
    // INVISIBLE: the player cannot be found, targeted or struck by anyone.
    if (other.isPlayer && world.cheats?.powers?.invisible && world.cheats.bloodline?.includes('invisible')) continue;
    const d = dist(other.position, npc.position);
    if (d > 48) continue;
    if (!isHostile(world, npc, other)) continue;
    if (d < bestDist) {
      bestDist = d;
      best = other;
    }
  }
  return best;
}

function nearestFamily(world: World, npc: NPC): NPC | null {
  for (const id of [npc.spouseId, ...npc.childIds, ...npc.familyIds]) {
    if (!id) continue;
    const other = world.npcs.get(id);
    if (other?.alive) return other;
  }
  return null;
}

function consumeFood(npc: NPC): boolean {
  const foods = Object.entries(npc.inventory)
    .filter(([good, qty]) => qty > 0 && (FOOD_GOODS.some((f) => f.id === good)))
    .sort((a, b) => (FOOD_GOODS.find((f) => f.id === b[0])?.basePrice ?? 0) - (FOOD_GOODS.find((f) => f.id === a[0])?.basePrice ?? 0));
  if (!foods.length) return false;
  const [good] = foods[0];
  takeItem(npc, good, 1);
  const def = FOOD_GOODS.find((f) => f.id === good);
  npc.needs.hunger = clamp(npc.needs.hunger + (def?.nutrition ?? 12) * 2.2, 0, 100);
  if (def?.hydration) npc.needs.thirst = clamp(npc.needs.thirst + def.hydration, 0, 100);
  npc.needs.happiness = clamp(npc.needs.happiness + 1, 0, 100);
  return true;
}

function consumeDrink(npc: NPC): boolean {
  const drinks = Object.entries(npc.inventory).filter(([good, qty]) => qty > 0 && DRINK_GOODS.some((d) => d.id === good));
  if (drinks.length) {
    const [good] = drinks[0];
    takeItem(npc, good, 1);
    const def = DRINK_GOODS.find((d) => d.id === good);
    npc.needs.thirst = clamp(npc.needs.thirst + (def?.hydration ?? 20) * 1.6, 0, 100);
    return true;
  }
  return false;
}

function forage(world: World, npc: NPC, rng: RNG): void {
  const nearby = world.resources
    .filter((r) => r.amount > 0 && dist(r.position, npc.position) < 90)
    .sort((a, b) => dist(a.position, npc.position) - dist(b.position, npc.position))[0];
  if (!nearby) {
    npc.activity = 'searching for food';
    const angle = rng.next() * Math.PI * 2;
    const target = {
      x: clamp(npc.position.x + Math.cos(angle) * 60, -650, 650),
      z: clamp(npc.position.z + Math.sin(angle) * 60, -650, 650)
    };
    npc.activityTarget = isWalkable(world.terrain, target.x, target.z) ? target : null;
    return;
  }
  if (moveToward(world, npc, nearby.position, 2.4)) {
    const gathered = Math.min(nearby.amount, rng.int(2, 5));
    nearby.amount -= gathered;
    const good = nearby.type === 'game' ? 'meat' : nearby.type === 'fish' ? 'fish' : nearby.type === 'herbs' ? 'herbs' : nearby.type === 'wood' ? 'wood' : 'berries';
    addItem(npc, good, gathered);
    npc.activity = `gathering ${good}`;
    npc.activityTarget = null;
    trainSkill(npc, 'hunting', 0.4);
    updateNodeAlive(world, nearby);
  } else {
    npc.activity = 'walking to forage';
  }
}

function updateNodeAlive(world: World, node: World['resources'][number]): void {
  if (node.amount <= 0) node.amount = 0;
}

function doWork(world: World, npc: NPC, rng: RNG): void {
  const profession = PROFESSION_BY_ID.get(npc.occupation);
  const home = npc.homeId ? world.buildings.find((b) => b.id === npc.homeId) : null;
  const workplace = world.buildings.find((b) => b.ownerId === npc.id || b.workers.includes(npc.id));
  const target = workplace?.position ?? home?.position ?? null;

  if (target && dist(npc.position, target) > 4) {
    moveToward(world, npc, target, 2.6);
    npc.activity = 'travelling to work';
    return;
  }

  npc.activity = profession ? `working as ${profession.name.toLowerCase()}` : 'working';
  const skill = profession?.skill ?? 'building';
  const stat = profession?.stat ?? 'strength';
  const aptitude = npc.genes[stat] / 100;
  const output = 0.4 + npc.skills[skill] * 0.08 + aptitude * 0.6;
  trainSkill(npc, skill, 0.35 + aptitude * 0.4);
  npc.needs.fatigue = clamp(npc.needs.fatigue - 0.35, 0, 100);

  if (profession?.produces && rng.chance(0.35)) {
    addItem(npc, profession.produces, Math.max(1, Math.round(output * 0.5)));
  }
  // Work earns coin if the faction or a business is paying.
  const market = nearestMarket(world, npc);
  if (market && rng.chance(0.2)) {
    npc.money += 0.4;
  }
}

function socialise(world: World, npc: NPC, rng: RNG, friend: NPC): void {
  const d = dist(npc.position, friend.position);
  if (d > 3) {
    moveToward(world, npc, friend.position, 2.4);
    npc.activity = `approaching ${friend.firstName}`;
    return;
  }
  npc.activity = `talking with ${friend.firstName}`;
  npc.needs.happiness = clamp(npc.needs.happiness + 2.5, 0, 100);
  npc.needs.morale = clamp(npc.needs.morale + 1.5, 0, 100);
  const a = npc.relationships[friend.id] ?? { affinity: 0, trust: 0, fear: 0, lastInteractionTick: world.tick };
  const b = friend.relationships[npc.id] ?? { affinity: 0, trust: 0, fear: 0, lastInteractionTick: world.tick };
  const chemistry = (npc.personality.empathy + friend.personality.empathy) / 200 + rng.range(-0.2, 0.2);
  a.affinity = clamp(a.affinity + chemistry * 3, -100, 100);
  b.affinity = clamp(b.affinity + chemistry * 3, -100, 100);
  a.lastInteractionTick = world.tick;
  b.lastInteractionTick = world.tick;
  npc.relationships[friend.id] = a;
  friend.relationships[npc.id] = b;

  // Word of mouth: NPCs share what they remember.
  if (npc.memories.length && rng.chance(0.25)) {
    const memory = npc.memories[0];
    if (!friend.memories.some((m) => m.summary === memory.summary)) {
      recordMemory(friend, {
        tick: world.tick,
        day: world.day,
        location: memory.location,
        type: memory.type,
        summary: `Heard from ${npc.firstName}: ${memory.summary}`,
        attackerId: memory.attackerId,
        victimId: memory.victimId,
        witnesses: [npc.id],
        factionId: friend.factionId,
        emotionalImpact: memory.emotionalImpact * 0.5,
        consequences: 'Second-hand account.'
      });
    }
  }
}

function seekTreatment(world: World, npc: NPC, rng: RNG): void {
  const injured = Object.values(npc.body).some((p) => p.injuries.length > 0) || npc.health < npc.maxHealth * 0.6;
  if (!injured) return;
  const healer = [...world.npcs.values()]
    .filter((n) => n.alive && n.id !== npc.id && (n.skills.medicine ?? 0) >= 3)
    .sort((a, b) => dist(a.position, npc.position) - dist(b.position, npc.position))[0];
  if (healer && dist(healer.position, npc.position) < 60) {
    if (dist(healer.position, npc.position) > 3) {
      moveToward(world, npc, healer.position, 2.2);
      npc.activity = `seeking treatment from ${healer.firstName}`;
      return;
    }
    npc.activity = 'being treated';
    npc.health = Math.min(npc.maxHealth, npc.health + 1.5 + (healer.skills.medicine ?? 0) * 0.4);
    trainSkill(healer, 'medicine', 0.5);
    if (rng.chance(0.2)) {
      for (const part of Object.values(npc.body)) {
        for (const injury of part.injuries) {
          if (!injury.permanent && injury.healAt) injury.healAt = Math.max(world.tick, injury.healAt - 60);
        }
      }
    }
    return;
  }
  // No healer: rest and self-medicate with herbs.
  if (takeItem(npc, 'herbs', 1)) {
    npc.health = Math.min(npc.maxHealth, npc.health + 3);
    npc.activity = 'treating wounds with herbs';
  } else {
    npc.activity = 'resting to recover';
    npc.health = Math.min(npc.maxHealth, npc.health + 0.5);
  }
}

function fight(world: World, npc: NPC, enemy: NPC, rng: RNG): void {
  const weapon = weaponOf(npc);
  const d = dist(npc.position, enemy.position);
  npc.inCombat = true;
  npc.enemyId = enemy.id;

  const fear = npc.relationships[enemy.id]?.fear ?? 0;
  const healthRatio = npc.health / npc.maxHealth;
  const wantsToFlee = (healthRatio < 0.3 || fear > 65) && npc.personality.bravery < 60;
  if (wantsToFlee) {
    npc.activity = `retreating from ${enemy.firstName}`;
    const away = {
      x: npc.position.x + (npc.position.x - enemy.position.x),
      z: npc.position.z + (npc.position.z - enemy.position.z)
    };
    moveToward(world, npc, away, 3);
    return;
  }

  if (d > (weapon.ranged ? weapon.reach : weapon.reach + 0.5)) {
    moveToward(world, npc, enemy.position, 3);
    npc.activity = `closing on ${enemy.firstName}`;
    return;
  }

  if (npc.attackCooldown > 0) {
    npc.activity = `fighting ${enemy.firstName}`;
    return;
  }
  npc.attackCooldown = Math.max(4, 12 - (npc.skills.combat ?? 0) * 0.3);

  // Skilled, aggressive fighters attempt deliberate crippling strikes.
  const aimed = rng.chance(clamp((npc.skills.combat ?? 0) * 0.02 + npc.personality.aggression * 0.001, 0, 0.28));
  const aimedPart = aimed ? rng.pick(['hand', 'forearm', 'eyes', 'knee', 'foot', 'jaw'] as const) : null;

  const result = resolveAttack(world, npc, enemy, rng, { aimedPart, aimedSide: rng.chance(0.5) ? 'L' : 'R' });
  npc.activity = result.hit ? `striking ${enemy.firstName}` : `attacking ${enemy.firstName}`;

  if (enemy.health / enemy.maxHealth < 0.22 && enemy.alive && !enemy.isPlayer && rng.chance(0.18)) {
    npcFinisher(world, npc, enemy, rng);
  }

  if (!enemy.alive) {
    npc.inCombat = false;
    npc.enemyId = null;
    npc.needs.morale = clamp(npc.needs.morale + 12, 0, 100);
  }
}

function decide(world: World, npc: NPC, rng: RNG): void {
  const night = isNight(world);
  const needHunger = 100 - npc.needs.hunger;
  const needThirst = 100 - npc.needs.thirst;
  const needRest = 100 - npc.needs.fatigue;
  const injuries = Object.values(npc.body).some((p) => p.injuries.length > 0);

  const options: { id: string; score: number }[] = [
    { id: 'eat', score: needHunger * 1.7 + (npc.inventory && Object.keys(npc.inventory).some((g) => FOOD_GOODS.some((f) => f.id === g)) ? 18 : 0) },
    { id: 'drink', score: needThirst * 1.9 + 6 },
    { id: 'sleep', score: (night ? 55 : 0) + needRest * 1.4 },
    { id: 'work', score: night ? 6 : 34 + npc.personality.industry * 0.35 },
    { id: 'socialise', score: 16 + (100 - npc.needs.happiness) * 0.5 + npc.personality.empathy * 0.1 },
    { id: 'treatment', score: injuries ? 45 + (1 - npc.health / npc.maxHealth) * 40 : 0 },
    { id: 'forage', score: needHunger * 0.9 + (npc.occupation === 'hunter' ? 20 : 0) },
    { id: 'patrol', score: npc.occupation === 'soldier' || npc.occupation === 'guard' ? 32 : 0 }
  ];

  if (world.settings.firstPerson) options.find((o) => o.id === 'sleep')!.score += 4;
  const chosen = options.sort((a, b) => b.score - a.score)[0].id;
  npc.lastDecisionTick = world.tick;

  switch (chosen) {
    case 'eat': {
      if (!consumeFood(npc)) {
        const market = nearestMarket(world, npc);
        if (market && npc.money > 4) {
          const affordable = Object.keys(market.goods).find((g) => FOOD_GOODS.some((f) => f.id === g) && market.goods[g].stock > 0);
          if (affordable) {
            if (dist(market.position, npc.position) > 4 && !moveToward(world, npc, market.position, 2.6)) {
              npc.activity = 'walking to market';
              return;
            }
            const cost = market.goods[affordable].basePrice;
            if (npc.money >= cost) {
              npc.money -= cost;
              market.goods[affordable].stock -= 1;
              addItem(npc, affordable, 1);
              consumeFood(npc);
              npc.activity = `buying ${affordable}`;
              return;
            }
          }
        }
        forage(world, npc, rng);
      } else {
        npc.activity = 'eating';
      }
      break;
    }
    case 'drink': {
      if (!consumeDrink(npc)) {
        let nearestWater: { x: number; z: number } | null = null;
        let bestDist = 55;
        for (let i = 0; i < 16; i++) {
          const angle = (i / 16) * Math.PI * 2;
          for (const radius of [12, 24, 36]) {
            const x = npc.position.x + Math.cos(angle) * radius;
            const z = npc.position.z + Math.sin(angle) * radius;
            if (heightAt(world.terrain, x, z) < SEA_LEVEL + 0.6) {
              const d = dist({ x, z }, npc.position);
              if (d < bestDist) {
                bestDist = d;
                nearestWater = { x, z };
              }
            }
          }
        }
        if (nearestWater) {
          moveToward(world, npc, nearestWater, 2.4);
          npc.activity = 'walking to water';
          if (dist(nearestWater, npc.position) < 4) {
            npc.needs.thirst = clamp(npc.needs.thirst + 45, 0, 100);
            npc.activity = 'drinking';
          }
        } else {
          npc.needs.thirst = clamp(npc.needs.thirst - 2, 0, 100);
          npc.activity = 'searching for water';
        }
      } else {
        npc.activity = 'drinking';
      }
      break;
    }
    case 'sleep': {
      const home = npc.homeId ? world.buildings.find((b) => b.id === npc.homeId) : null;
      if (home && dist(home.position, npc.position) > 3) {
        moveToward(world, npc, home.position, 2.4);
        npc.activity = 'heading home';
      } else {
        npc.needs.fatigue = clamp(npc.needs.fatigue + 6, 0, 100);
        npc.needs.happiness = clamp(npc.needs.happiness + 1.2, 0, 100);
        npc.activity = 'sleeping';
      }
      break;
    }
    case 'work':
      doWork(world, npc, rng);
      break;
    case 'socialise': {
      const friend = [...world.npcs.values()]
        .filter((n) => n.alive && n.id !== npc.id && (!n.factionId || n.factionId === npc.factionId))
        .sort((a, b) => dist(a.position, npc.position) - dist(b.position, npc.position))[0];
      if (friend) socialise(world, npc, rng, friend);
      else npc.activity = 'idle';
      break;
    }
    case 'treatment':
      seekTreatment(world, npc, rng);
      break;
    case 'forage':
      forage(world, npc, rng);
      break;
    case 'patrol': {
      const capital = npc.factionId ? world.factions.find((f) => f.id === npc.factionId)?.capital : null;
      if (capital) {
        const target = { x: capital.x + rng.range(-24, 24), z: capital.z + rng.range(-24, 24) };
        if (moveToward(world, npc, target, 2.2)) {
          npc.activity = 'standing watch';
        } else {
          npc.activity = 'on patrol';
        }
      }
      break;
    }
    default:
      npc.activity = 'idle';
  }
}

export function updateNeeds(world: World, npc: NPC, rng: RNG, rate = 1): void {
  const { needs } = npc;
  const activity = npc.activity;
  needs.hunger = clamp(needs.hunger - 0.055 * rate * (activity === 'sleeping' ? 0.5 : 1), 0, 100);
  needs.thirst = clamp(needs.thirst - 0.075 * rate, 0, 100);
  if (activity !== 'sleeping') needs.fatigue = clamp(needs.fatigue - 0.05 * rate, 0, 100);
  if (needs.hunger < 15 || needs.thirst < 15) {
    needs.happiness = clamp(needs.happiness - 0.12 * rate, 0, 100);
    npc.health = Math.max(0, npc.health - 0.02 * rate);
  }
  if (npc.health <= 0) {
    npc.health = 0;
  }
  // Recount family bonds occasionally so heirs stay current.
  if (rng.chance(0.01)) {
    npc.familyIds = [...new Set([...npc.parentIds, ...npc.childIds, ...(npc.spouseId ? [npc.spouseId] : [])])];
  }
}

/** Full individual AI for nearby agents. */
export function simulateNear(world: World, npc: NPC, rng: RNG): void {
  if (!npc.alive || npc.isPlayer) return;
  if (world.finishing.active) return;

  npc.attackCooldown = Math.max(0, npc.attackCooldown - 1);
  updateNeeds(world, npc, rng, 1);

  const enemy = nearestEnemy(world, npc);
  if (enemy) {
    fight(world, npc, enemy, rng);
    return;
  }
  npc.inCombat = false;
  npc.enemyId = null;

  // Protect family if they are under attack nearby.
  if (rng.chance(0.02)) {
    const family = nearestFamily(world, npc);
    if (family && family.inCombat && family.enemyId) {
      const attacker = world.npcs.get(family.enemyId);
      if (attacker?.alive && dist(attacker.position, npc.position) < 40) {
        fight(world, npc, attacker, rng);
        return;
      }
    }
  }

  // Decisions are re-evaluated periodically rather than every tick.
  const decisionInterval = 8 + Math.floor(rng.next() * 6);
  if (world.tick - npc.lastDecisionTick > decisionInterval || !npc.activityTarget && npc.activity === 'idle') {
    decide(world, npc, rng);
    if (npc.attackCooldown === 0 && npc.skills.combat > 0) npc.attackCooldown = 2;
  } else if (npc.activityTarget) {
    moveToward(world, npc, npc.activityTarget, 2.2);
  }
}

/** Simplified but individual simulation for distant agents. */
export function simulateFar(world: World, npc: NPC, rng: RNG): void {
  if (!npc.alive || npc.isPlayer) return;
  updateNeeds(world, npc, rng, 6);
  const profession = PROFESSION_BY_ID.get(npc.occupation);
  if (profession) {
    trainSkill(npc, profession.skill, 0.1);
  }
  if (rng.chance(0.08)) {
    npc.activity = profession ? `working as ${profession.name.toLowerCase()}` : 'idle';
  }
  // Slow drift toward their settlement keeps populations coherent.
  const faction = npc.factionId ? world.factions.find((f) => f.id === npc.factionId) : null;
  if (faction && dist(npc.position, faction.capital) > 120) {
    npc.position.x += (faction.capital.x - npc.position.x) * 0.04;
    npc.position.z += (faction.capital.z - npc.position.z) * 0.04;
  }
  if (npc.health <= 0) npc.health = 0.1;
}

/** Faction-level aggregate simulation for characters nobody is watching. */
export function simulateAggregate(world: World, npc: NPC, rng: RNG): void {
  if (!npc.alive || npc.isPlayer) return;
  updateNeeds(world, npc, rng, 18);
  npc.health = clamp(npc.health + 0.4, 0, npc.maxHealth);
  const faction = npc.factionId ? world.factions.find((f) => f.id === npc.factionId) : null;
  if (faction && npc.occupation === 'soldier' && faction.wars.length === 0 && rng.chance(0.01)) {
    npc.activity = ' garrison duty';
  }
}

export function assignSimLevels(world: World, player: NPC): void {
  for (const npc of world.npcs.values()) {
    if (npc.isPlayer) continue;
    const d = dist(npc.position, player.position);
    npc.simLevel = d < NEAR_RADIUS ? 'near' : d < FAR_RADIUS ? 'far' : 'aggregate';
  }
}

export const SIM_CONSTANTS = { TICKS_PER_DAY, NEAR_RADIUS, FAR_RADIUS };
export type { RNG };

export function describeInjuryList(npc: NPC): string[] {
  const out: string[] = [];
  for (const part of Object.values(npc.body)) {
    if (part.dismembered) out.push(`${describePart(part.key)} — MISSING`);
    for (const injury of part.injuries) {
      if (injury.severity <= 0) continue;
      out.push(`${describePart(part.key)} — ${injury.type}${injury.permanent ? ' (permanent)' : ''}`);
    }
  }
  return out;
}
