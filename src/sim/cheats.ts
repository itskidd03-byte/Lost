import type { CheatCode, Cheats, NPC, PowerKey, World } from '../core/types';
import { GOODS } from '../data/goods';
import { createNPC, makeWeapon } from './npc';
import { RNG } from '../core/rng';
import { getSaveScope, scopedStorageKey } from './saveScope';
import { isWalkable } from '../world/worldgen';
import { pushLog } from './memory';

export const MIDAS_AMOUNT = 1_000_000;
const BLOODLINE_KEY = 'kotfi.bloodline.v1';
const BLOODLINE_MIGRATED_KEY = 'kotfi.bloodline.migrated';
const REVEALED_KEY = 'kotfi.cheats.revealed.v1';
const DISCOVERED_KEY = 'kotfi.cheats.discovered.v1';

/** The old global bloodline moves into the first profile that loads it. */
function scopedBloodlineKey(): string {
  return scopedStorageKey(BLOODLINE_KEY);
}

export const POWER_META: { key: PowerKey; label: string; detail: string }[] = [
  { key: 'speed', label: 'Super speed', detail: 'Move three times as fast.' },
  { key: 'strength', label: 'Super strength', detail: 'Every landed blow hits like a falling wall.' },
  { key: 'teleport', label: 'Teleportation', detail: 'Blink thirty metres in the direction you are looking.' },
  { key: 'invisible', label: 'Invisibility', detail: 'Nobody can find you, aim at you or land a blow on you.' },
  { key: 'invincible', label: 'Invincibility', detail: 'Nothing can wound or kill you.' },
  { key: 'flying', label: 'Flying', detail: 'Rise above the ground and cross water and walls.' }
];

export const CHEAT_CODES: { code: CheatCode; label: string; detail: string; permanent?: boolean }[] = [
  { code: 'midas', label: 'MIDAS', detail: 'Every resource reads 1,000,000 and refills the moment it is spent. Town stores stay full.' },
  { code: 'slumlord', label: 'SLUMLORD', detail: 'Every building is free to place, forever.' },
  { code: 'powers', label: 'POWERS', detail: 'Unlocks the six super powers into your bloodline. Open the Powers panel to toggle them.' },
  { code: 'ages', label: 'AGES', detail: 'Every other people is capped at the Industrial age. Your own works are uncapped.' },
  { code: 'lucifer', label: 'LUCIFER', detail: 'Places a one-kill dagger in your hand: every fight opens with a wound/kill choice.' },
  { code: 'people', label: 'PEOPLE', detail: 'Brings 100 new islanders to the ground around your home. This cannot be undone.', permanent: true },
  { code: 'crownme', label: 'CROWNME', detail: 'Every islander gains unwavering loyalty to you, every people names you monarch, and you become the King. This cannot be undone.', permanent: true }
];

export type CheatKey = Exclude<CheatCode, 'powers'>;

/** Switch an effect off without touching anything it already built or unlocked. */
export function disableCheat(world: World, key: CheatKey): { message: string } {
  const cheats = ensureCheats(world);
  if (key === 'people' || key === 'crownme') {
    return { message: `${key.toUpperCase()} is permanent and cannot be undone.` };
  }
  if (!cheats[key]) return { message: `${key.toUpperCase()} is already off.` };
  cheats[key] = false;
  switch (key) {
    case 'midas':
      return { message: 'MIDAS off. Resources stop refilling; what you already have is yours.' };
    case 'slumlord':
      return { message: 'SLUMLORD off. New construction costs resources again.' };
    case 'ages':
      return { message: 'AGES off. Other peoples can advance past the Industrial age again.' };
    case 'lucifer':
      return { message: 'LUCIFER off. The dagger stays in your hand, but fights no longer force the wound/kill choice.' };
  }
}

export function cheatIsActive(world: World, key: CheatKey): boolean {
  return Boolean(world.cheats?.[key]);
}

export function defaultCheats(): Cheats {
  const discovered = loadCheatsDiscovered();
  return {
    revealed: discovered.length > 0 || loadCheatsRevealed(),
    discovered,
    midas: false,
    slumlord: false,
    ages: false,
    lucifer: false,
    people: false,
    crownme: false,
    powersUnlocked: false,
    powers: { speed: false, strength: false, teleport: false, invisible: false, invincible: false, flying: false },
    bloodline: loadBloodline()
  };
}

/** Old saves, new worlds and imports all pass through here. */
export function normalizeCheats(value?: Partial<Cheats> | null): Cheats {
  const base = defaultCheats();
  if (!value) return base;
  const bloodline = Array.from(new Set([...(value.bloodline ?? []), ...base.bloodline]));
  const discovered = Array.from(new Set<CheatCode>([
    ...(value.discovered ?? []).filter(isCheatCode),
    ...base.discovered,
    ...(value.midas ? ['midas' as const] : []),
    ...(value.slumlord ? ['slumlord' as const] : []),
    ...(value.ages ? ['ages' as const] : []),
    ...(value.lucifer ? ['lucifer' as const] : []),
    ...(value.people ? ['people' as const] : []),
    ...(value.crownme ? ['crownme' as const] : []),
    ...(value.powersUnlocked || bloodline.length > 0 ? ['powers' as const] : [])
  ]));
  const revealed = discovered.length > 0 || Boolean(value.revealed) || base.revealed;
  if (discovered.length) saveCheatsDiscovered(discovered);
  if (revealed) markCheatsRevealed();
  return {
    revealed,
    discovered,
    midas: Boolean(value.midas),
    slumlord: Boolean(value.slumlord),
    ages: Boolean(value.ages),
    lucifer: Boolean(value.lucifer),
    people: Boolean(value.people),
    crownme: Boolean(value.crownme),
    powersUnlocked: Boolean(value.powersUnlocked) || bloodline.length > 0,
    powers: { ...base.powers, ...(value.powers ?? {}) },
    bloodline
  };
}

function isCheatCode(value: unknown): value is CheatCode {
  return typeof value === 'string' && CHEAT_CODES.some((entry) => entry.code === value);
}

function loadCheatsRevealed(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(scopedStorageKey(REVEALED_KEY)) === '1';
  } catch {
    return false;
  }
}

function loadCheatsDiscovered(): CheatCode[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(scopedStorageKey(DISCOVERED_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(parsed.filter(isCheatCode)));
  } catch {
    return [];
  }
}

function saveCheatsDiscovered(codes: CheatCode[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(scopedStorageKey(DISCOVERED_KEY), JSON.stringify(Array.from(new Set(codes))));
  } catch {
    // Storage blocked: the reveal still lasts for this session.
  }
}

function recordDiscovered(code: CheatCode): void {
  saveCheatsDiscovered([...loadCheatsDiscovered(), code]);
  markCheatsRevealed();
}

function markCheatsRevealed(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(scopedStorageKey(REVEALED_KEY), '1');
  } catch {
    // Storage blocked: reveal for this session through world.cheats.revealed.
  }
}

export function ensureCheats(world: World): Cheats {
  if (!world.cheats || !world.cheats.bloodline || !world.cheats.discovered
    || world.cheats.people === undefined || world.cheats.crownme === undefined) {
    world.cheats = normalizeCheats(world.cheats);
  }
  return world.cheats;
}

export function loadBloodline(): PowerKey[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const key = scopedBloodlineKey();
    let raw = localStorage.getItem(key);
    if (!raw && getSaveScope() && !localStorage.getItem(BLOODLINE_MIGRATED_KEY)) {
      const legacy = localStorage.getItem(BLOODLINE_KEY);
      if (legacy) {
        localStorage.setItem(key, legacy);
        localStorage.setItem(BLOODLINE_MIGRATED_KEY, '1');
        raw = legacy;
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((key): key is PowerKey => POWER_META.some((power) => power.key === key));
  } catch {
    return [];
  }
}

export function saveBloodline(powers: PowerKey[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(scopedBloodlineKey(), JSON.stringify(Array.from(new Set(powers))));
  } catch {
    // Storage blocked: the unlock still lasts for this session.
  }
}

export function activePower(world: World, key: PowerKey): boolean {
  const cheats = world.cheats;
  return Boolean(cheats?.bloodline?.includes(key) && cheats.powers?.[key]);
}

/** Bind one islander to the ruler with loyalty that does not drift. */
export function swearFealty(world: World, npc: NPC, ruler = world.npcs.get(world.playerId)): void {
  if (!ruler) return;
  npc.loyalty = 100;
  npc.personality.loyalty = 100;
  npc.opinions[ruler.id] = 100;
  npc.relationships[ruler.id] = {
    affinity: 100,
    trust: 100,
    fear: 0,
    lastInteractionTick: world.tick
  };
  const oath = `Swore unwavering loyalty to ${ruler.firstName}.`;
  if (!npc.history.includes(oath)) npc.history.push(oath);
}

/** PEOPLE: bring a hundred new islanders to the ground around the player's home. */
function spawnPeople(world: World, player: NPC, rng: RNG): number {
  const home = player.homeId ? world.buildings.find((building) => building.id === player.homeId) : null;
  const center = home?.position ?? player.position;
  let arrived = 0;
  for (let index = 0; index < 100; index++) {
    let spot: { x: number; z: number } | null = null;
    for (let attempt = 0; attempt < 90; attempt++) {
      const angle = rng.next() * Math.PI * 2;
      const radius = rng.range(5, 38);
      const x = center.x + Math.cos(angle) * radius;
      const z = center.z + Math.sin(angle) * radius;
      if (isWalkable(world.terrain, x, z)) {
        spot = { x, z };
        break;
      }
    }
    if (!spot) continue;
    const npc = createNPC({
      rng,
      factionId: null,
      position: spot,
      age: rng.int(17, 46),
      techAge: 0
    });
    npc.homeId = player.homeId;
    npc.history.push('Came ashore with the hundred called by the King.');
    if (world.cheats?.crownme) swearFealty(world, npc, player);
    world.npcs.set(npc.id, npc);
    arrived++;
  }
  return arrived;
}

export function applyCheat(
  world: World,
  player: NPC,
  code: string,
  rng: RNG
): { ok: boolean; message: string } {
  const cheats = ensureCheats(world);
  const key = code.trim().toLowerCase();
  if (CHEAT_CODES.some((entry) => entry.code === key)) {
    cheats.revealed = true;
    if (!cheats.discovered.includes(key as CheatCode)) cheats.discovered.push(key as CheatCode);
    recordDiscovered(key as CheatCode);
  }
  switch (key) {
    case 'midas': {
      cheats.midas = true;
      maintainMidas(world);
      return { ok: true, message: 'MIDAS: resources now read 1,000,000 and refill as fast as you spend them. Town stores are full.' };
    }
    case 'slumlord': {
      cheats.slumlord = true;
      return { ok: true, message: 'SLUMLORD: every building is free. Place as many as you like.' };
    }
    case 'powers': {
      cheats.powersUnlocked = true;
      cheats.bloodline = POWER_META.map((power) => power.key);
      saveBloodline(cheats.bloodline);
      return { ok: true, message: 'POWERS: six powers are in your bloodline forever. Open the Powers panel to switch them on.' };
    }
    case 'ages': {
      cheats.ages = true;
      for (const faction of world.factions) {
        faction.techAge = Math.min(faction.techAge, 6);
        if (faction.techAge >= 6) faction.techPoints = 0;
      }
      return { ok: true, message: 'AGES: every other people is frozen at the Industrial age. Your own works are uncapped.' };
    }
    case 'lucifer': {
      cheats.lucifer = true;
      const dagger = makeWeapon('dagger', 'steel', rng);
      dagger.name = "Lucifer's dagger";
      dagger.damage = 1;
      dagger.reach = 2.4;
      dagger.durability = 1_000_000_000;
      dagger.maxDurability = 1_000_000_000;
      player.weapon = dagger;
      return { ok: true, message: "LUCIFER: the dagger is in your hand. Every fight now offers wound or kill on the first hit." };
    }
    case 'people': {
      if (cheats.people) {
        return { ok: true, message: 'PEOPLE: the hundred are already here.' };
      }
      cheats.people = true;
      const arrived = spawnPeople(world, player, rng);
      pushLog(world, `PEOPLE: ${arrived} new islanders came ashore around your home.`, 'good');
      return { ok: true, message: `PEOPLE: ${arrived} new islanders are settling around your home.` };
    }
    case 'crownme': {
      cheats.crownme = true;
      player.occupation = 'King';
      for (const npc of world.npcs.values()) {
        if (!npc.alive || npc.isPlayer) continue;
        swearFealty(world, npc, player);
      }
      for (const faction of world.factions) {
        faction.relations['player'] = 100;
        faction.government = 'Monarchy';
        faction.leaderId = player.id;
        faction.history.push(`Day ${world.day}: ${player.firstName} was crowned sovereign of ${faction.name}.`);
      }
      pushLog(world, 'CROWNME: every islander has sworn unwavering loyalty. You are the King.', 'good');
      return { ok: true, message: 'CROWNME: every islander has sworn unwavering loyalty. You are the King.' };
    }
    default:
      return { ok: false, message: 'Nothing answers that word.' };
  }
}

export function togglePower(world: World, key: PowerKey): { ok: boolean; active: boolean; message: string } {
  const cheats = ensureCheats(world);
  const meta = POWER_META.find((power) => power.key === key);
  if (!meta) return { ok: false, active: false, message: 'Unknown power.' };
  if (!cheats.bloodline.includes(key)) {
    cheats.bloodline.push(key);
    saveBloodline(cheats.bloodline);
  }
  cheats.revealed = true;
  if (!cheats.discovered.includes('powers')) cheats.discovered.push('powers');
  recordDiscovered('powers');
  cheats.powersUnlocked = true;
  const active = !cheats.powers[key];
  cheats.powers[key] = active;
  return { ok: true, active, message: `${meta.label} ${active ? 'on' : 'off'}. It stays in your bloodline forever.` };
}

/** Called after every transaction so MIDAS really never moves. */
export function maintainMidas(world: World): void {
  if (!world.cheats?.midas) return;
  const player = world.npcs.get(world.playerId);
  if (!player) return;
  for (const good of Object.keys(GOODS)) {
    if ((player.inventory[good] ?? 0) < MIDAS_AMOUNT) player.inventory[good] = MIDAS_AMOUNT;
  }
  // Every store you own, not just the cottage: town storage stays full too.
  for (const building of world.buildings) {
    if (building.ownerId !== player.id) continue;
    for (const good of Object.keys(GOODS)) {
      if ((building.inventory[good] ?? 0) < MIDAS_AMOUNT) building.inventory[good] = MIDAS_AMOUNT;
    }
  }
}
