import type { World } from '../core/types';

/**
 * Serialisation check shared by the save system and the headless smoke test.
 * It mirrors what saveWorld writes, without touching localStorage.
 */
export function validateSaveShape(world: World): { ok: boolean; error?: string; bytes?: number } {
  try {
    const { terrain: _terrain, ...rest } = world;
    const payload = JSON.stringify({
      ...rest,
      npcs: [...world.npcs.values()],
      finishing: {
        active: false, phase: 'idle', attackerId: null, victimId: null, part: null,
        weaponName: '', startedAt: 0, elapsed: 0, cameraAngle: 0, applied: false, snapshot: null
      }
    });
    if (!payload.includes('"npcs":[')) return { ok: false, error: 'NPC list missing from payload' };
    if (payload.includes('"terrain"')) return { ok: false, error: 'terrain should be regenerated, not stored' };
    return { ok: true, bytes: payload.length };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'unknown error' };
  }
}
