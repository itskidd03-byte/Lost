import { RNG, clamp } from '../core/rng';
import type { CinematicSnapshot, NPC, World } from '../core/types';
import { canFinish, applyFinishingKill, applyFinishingWound, weaponOf } from './combat';
import { REGIONS, TARGETABLE } from '../core/anatomy';
import { pushLog } from './memory';

const DURATIONS = { wound: 4.4, kill: 5.0 };

export function finishingActive(world: World): boolean {
  return world.finishing.active;
}

/** Starts the finishing-choice state: the whole fight freezes and the player stays untouchable. */
export function beginFinishing(world: World, attacker: NPC, victim: NPC): boolean {
  if (world.finishing.active) return false;
  const check = canFinish(world, attacker, victim);
  if (!check.ok) {
    pushLog(world, `Finishing blow unavailable: ${check.reason.toLowerCase()}.`, 'neutral');
    return false;
  }
  // Choose which limb the opening actually presents, based on what is still attached.
  const available: string[] = [];
  for (const region of TARGETABLE) {
    const info = REGIONS[region];
    if (!info.severable) continue;
    for (const key of info.paired ? [`${region}:L`, `${region}:R`] : [region]) {
      if (victim.body[key] && !victim.body[key].dismembered) available.push(key);
    }
  }
  // Deterministic but varied: derived from who is involved and when.
  const seedValue = `${victim.id}:${attacker.id}:${world.tick}`
    .split('')
    .reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);
  const chosen = available.length ? available[seedValue % available.length] : check.part;
  world.finishing = {
    active: true,
    phase: 'choosing',
    attackerId: attacker.id,
    victimId: victim.id,
    part: chosen,
    weaponName: weaponOf(attacker).name,
    startedAt: world.tick,
    elapsed: 0,
    cameraAngle: 0,
    applied: false,
    snapshot: null
  };
  pushLog(world, `Time freezes. ${victim.firstName} ${victim.family} is at your mercy.`, 'war');
  return true;
}

/** Player (or AI) selects one of the two outcomes. */
export function chooseOutcome(world: World, option: 'wound' | 'kill'): boolean {
  const state = world.finishing;
  if (!state.active || state.phase !== 'choosing') return false;
  const victim = state.victimId ? world.npcs.get(state.victimId) : null;
  if (!victim) {
    endFinishing(world);
    return false;
  }
  const attacker = state.attackerId ? world.npcs.get(state.attackerId) : null;
  state.phase = option;
  state.elapsed = 0;
  state.applied = false;
  state.cameraAngle = Math.atan2(victim.position.x - (attacker?.position.x ?? 0), victim.position.z - (attacker?.position.z ?? 0));
  const snapshot: CinematicSnapshot = {
    attackerPos: attacker ? [attacker.position.x, 0, attacker.position.z] : [victim.position.x, 0, victim.position.z],
    victimPos: [victim.position.x, 0, victim.position.z],
    facing: state.cameraAngle,
    part: state.part ?? 'hand',
    option,
    weaponName: state.weaponName,
    victimName: victim.name
  };
  state.snapshot = snapshot;
  victim.inCombat = false;
  victim.activity = option === 'kill' ? 'being executed' : 'being crippled';
  pushLog(world, option === 'kill' ? 'You choose the brutal kill.' : 'You choose the permanent wound.', 'war');
  return true;
}

/** Advances the cinematic. Damage cannot happen anywhere in the world while this runs. */
export function tickFinishing(world: World, dt: number, rng: RNG): void {
  const state = world.finishing;
  if (!state.active || state.phase === 'choosing') return;
  const duration = state.phase === 'kill' ? DURATIONS.kill : DURATIONS.wound;
  // Cinematic time is slowed; the UI duration setting scales how long it lingers.
  state.elapsed += dt * (0.55 + world.settings.slowMotion * 0.35);

  if (!state.applied && state.elapsed >= duration * 0.5) {
    state.applied = true;
    const victim = state.victimId ? world.npcs.get(state.victimId) ?? null : null;
    const attacker = state.attackerId ? world.npcs.get(state.attackerId) ?? null : null;
    if (victim && victim.alive && state.part) {
      if (state.phase === 'kill') {
        applyFinishingKill(world, attacker, victim, state.part, state.weaponName);
      } else {
        applyFinishingWound(world, attacker, victim, state.part, state.weaponName, rng);
      }
    }
  }

  if (state.elapsed >= duration) {
    endFinishing(world);
  }
}

export function endFinishing(world: World): void {
  const victim = world.finishing.victimId ? world.npcs.get(world.finishing.victimId) : null;
  if (victim && victim.alive) {
    victim.inCombat = false;
    victim.enemyId = null;
    victim.activity = 'recovering';
  }
  world.finishing = {
    active: false,
    phase: 'idle',
    attackerId: null,
    victimId: null,
    part: null,
    weaponName: '',
    startedAt: 0,
    elapsed: 0,
    cameraAngle: 0,
    applied: false,
    snapshot: null
  };
}

export function finishingProgress(world: World): number {
  const state = world.finishing;
  if (state.phase === 'choosing' || state.phase === 'idle') return 0;
  const duration = state.phase === 'kill' ? DURATIONS.kill : DURATIONS.wound;
  return clamp(state.elapsed / duration, 0, 1);
}

/** NPCs may also execute a downed enemy; the player is never part of that choice UI. */
export function npcFinisher(world: World, attacker: NPC, victim: NPC, rng: RNG): boolean {
  if (world.finishing.active) return false;
  const check = canFinish(world, attacker, victim);
  if (!check.ok || !check.part) return false;
  // Aggressive, low-empathy characters kill; others take a trophy and leave a survivor.
  const lethal = attacker.personality.aggression > 55 && attacker.personality.empathy < 45;
  if (lethal) {
    applyFinishingKill(world, attacker, victim, check.part, weaponOf(attacker).name);
  } else {
    applyFinishingWound(world, attacker, victim, check.part, weaponOf(attacker).name, rng);
  }
  return true;
}
