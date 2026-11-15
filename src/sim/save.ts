import { RNG } from '../core/rng';
import { generateTerrain, generateResources } from '../world/worldgen';
import type { NPC, World } from '../core/types';
import { GAME_VERSION, newPlayerCharacter } from './simulation';
import { ensureDesignBot } from './designBot';
import { normalizeCheats } from './cheats';
import { getSaveScope, setSaveScope } from './saveScope';

export { setSaveScope as setSaveNamespace } from './saveScope';

const LEGACY_SAVE_KEY = 'kotfi.save.slot1';
const LEGACY_SAVE_META = 'kotfi.save.meta';
const LEGACY_MIGRATED_KEY = 'kotfi.save.legacyMigrated';

/**
 * Saves are scoped to the signed-in local profile. Before profile support the
 * game used one global slot; that slot is claimed once by the first login.
 */
function keysFor(scope: string | null): { save: string; meta: string } {
  return scope
    ? { save: `kotfi.save.${scope}.slot1`, meta: `kotfi.save.${scope}.meta` }
    : { save: LEGACY_SAVE_KEY, meta: LEGACY_SAVE_META };
}

function keys(): { save: string; meta: string } {
  return keysFor(getSaveScope());
}

export function currentSaveNamespace(): string | null {
  return getSaveScope();
}

export function hasLegacySave(): boolean {
  try {
    return localStorage.getItem(LEGACY_SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Move the pre-login island into this profile exactly once. Copy first, then
 * remove the old slot, so a storage failure cannot destroy the only copy.
 */
export function claimLegacySave(scope: string): boolean {
  try {
    if (localStorage.getItem(LEGACY_MIGRATED_KEY)) return false;
    const target = keysFor(scope);
    if (localStorage.getItem(target.save)) {
      localStorage.setItem(LEGACY_MIGRATED_KEY, '1');
      return false;
    }
    const world = localStorage.getItem(LEGACY_SAVE_KEY);
    if (!world) return false;
    const meta = localStorage.getItem(LEGACY_SAVE_META);
    localStorage.setItem(target.save, world);
    if (meta) localStorage.setItem(target.meta, meta);
    localStorage.removeItem(LEGACY_SAVE_KEY);
    localStorage.removeItem(LEGACY_SAVE_META);
    localStorage.setItem(LEGACY_MIGRATED_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

export interface SaveMeta {
  day: number;
  seed: number;
  savedAt: number;
  worldName: string;
  population: number;
}

interface SerializedWorld extends Omit<World, 'npcs' | 'terrain'> {
  npcs: NPC[];
}

type SaveData = Omit<World, 'npcs'> & { npcs: NPC[] };

export function saveWorld(world: World): { ok: boolean; error?: string } {
  try {
    const { terrain: _terrain, ...rest } = world;
    const serialized: SerializedWorld = {
      ...rest,
      npcs: [...world.npcs.values()]
    };
    serialized.finishing = {
      active: false, phase: 'idle', attackerId: null, victimId: null, part: null,
      weaponName: '', startedAt: 0, elapsed: 0, cameraAngle: 0, applied: false, snapshot: null
    };
    serialized.currentInteriorId = null;
    const target = keys();
    localStorage.setItem(target.save, JSON.stringify(serialized));
    const meta: SaveMeta = {
      day: world.day,
      seed: world.seed,
      savedAt: Date.now(),
      worldName: world.worldName,
      population: [...world.npcs.values()].filter((n) => n.alive).length
    };
    localStorage.setItem(target.meta, JSON.stringify(meta));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown save failure' };
  }
}

export function loadWorld(): World | null {
  const target = keys();
  const raw = localStorage.getItem(target.save);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as SerializedWorld;
    const terrain = generateTerrain(data.seed);
    const resources = data.resources?.length ? data.resources : generateResources(terrain, data.seed);
    const world: World = {
      ...data,
      version: GAME_VERSION,
      terrain,
      resources,
      npcs: new Map((data.npcs ?? []).map((npc) => [npc.id, npc])),
      corpses: data.corpses ?? [],
      designBotId: data.designBotId ?? null,
      plantings: data.plantings ?? [],
      cheats: normalizeCheats(data.cheats)
    };
    if (!world.settings) {
      world.settings = {
        gore: 1, slowMotion: 1, slowMotionDuration: 4.5, distantSim: true,
        shadows: true, showReticle: true, firstPerson: false
      };
    }
    if (!world.finishing) {
      world.finishing = {
        active: false, phase: 'idle', attackerId: null, victimId: null, part: null,
        weaponName: '', startedAt: 0, elapsed: 0, cameraAngle: 0, applied: false, snapshot: null
      };
    }
    const rng = new RNG(world.seed ^ 0x9e3779b9);
    // Loading never advances the island: time only passes while the game is on screen.
    const player = world.npcs.get(world.playerId);
    if (!player || !player.alive) {
      newPlayerCharacter(world, rng);
    }
    ensureDesignBot(world, rng);
    return world;
  } catch (error) {
    console.error('Failed to load save', error);
    return null;
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(keys().save) !== null;
  } catch {
    return false;
  }
}

export function saveMeta(): SaveMeta | null {
  try {
    const raw = localStorage.getItem(keys().meta);
    if (!raw) return null;
    return JSON.parse(raw) as SaveMeta;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  const target = keys();
  localStorage.removeItem(target.save);
  localStorage.removeItem(target.meta);
}

export function exportSave(): string | null {
  return localStorage.getItem(keys().save);
}

export function importSave(json: string): { ok: boolean; error?: string } {
  try {
    const parsed = JSON.parse(json) as SerializedWorld;
    if (!parsed || typeof parsed.seed !== 'number') return { ok: false, error: 'Not a valid save file' };
    localStorage.setItem(keys().save, json);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Not valid JSON' };
  }
}
