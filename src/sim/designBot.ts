/**
 * Lord Slayer, the graphics keeper: an autonomous NPC who keeps the studio inside
 * the player's cottage,
 * checks the world every five minutes and leaves five concrete enhancement notes
 * per check. Notes stack while the game is closed
 * and every accepted note changes the live world: a palette is re-grounded in the
 * reference library, a structure is actually raised, or trees are actually planted.
 */
import { RNG, uid } from '../core/rng';
import type { BuildingDef, BuildingInstance, NPC, Planting, World } from '../core/types';
import { BUILDING_BY_ID } from '../data/buildings';
import { dominantSwatch, searchReferences, type ReferenceRecord } from '../data/memoryBank';
import { artDirection, MATERIAL_LABELS, type MaterialKey } from '../render/artDirection';
import { createNPC } from './npc';
import { pushLog } from './memory';
import { isWalkable, regionAt } from '../world/worldgen';

export type ProposalKind = 'palette' | 'structure' | 'grove';
export type ProposalStatus = 'open' | 'applied' | 'dismissed';

export interface DesignProposal {
  id: string;
  kind: ProposalKind;
  title: string;
  detail: string;
  status: ProposalStatus;
  material?: MaterialKey;
  record?: ReferenceRecord;
  defId?: string;
  position?: { x: number; z: number };
  count?: number;
}

export interface VelaMessage {
  id: string;
  slot: string;
  at: number;
  islandDay: number;
  greeting: string;
  proposals: DesignProposal[];
}

interface VelaStore {
  lastSlot: string | null;
  messages: VelaMessage[];
  enabled: boolean;
}

const STORE_KEY = 'kotfi.lordslayer.v1';
const LEGACY_STORE_KEY = 'kotfi.vela.v1';
const SLOT_MINUTES = Array.from({ length: (24 * 60) / 5 }, (_, index) => index * 5);
const MAX_MESSAGES = 40;
const MAX_CATCHUP_SLOTS = 8;
const MATERIAL_KEYS = Object.keys(MATERIAL_LABELS) as MaterialKey[];
const STRUCTURE_PLAN: { key: string; label: string }[] = [
  { key: 'religious', label: 'Religious' },
  { key: 'commercial', label: 'Commercial' },
  { key: 'infrastructure', label: 'Infrastructure' },
  { key: 'military', label: 'Military' },
  { key: 'education', label: 'Education' },
  { key: 'healthcare', label: 'Healthcare' },
  { key: 'entertainment', label: 'Entertainment' },
  { key: 'agriculture', label: 'Agriculture' },
  { key: 'storage', label: 'Storage' }
];

let store: VelaStore = loadStore();
let refreshing: Promise<VelaMessage[]> | null = null;

function emptyStore(): VelaStore {
  return { lastSlot: null, messages: [], enabled: true };
}

function loadStore(): VelaStore {
  try {
    if (typeof localStorage === 'undefined') return emptyStore();
    const raw = localStorage.getItem(STORE_KEY) ?? localStorage.getItem(LEGACY_STORE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as VelaStore;
    if (!parsed || !Array.isArray(parsed.messages)) return emptyStore();
    return { lastSlot: parsed.lastSlot ?? null, messages: parsed.messages, enabled: parsed.enabled ?? true };
  } catch {
    return emptyStore();
  }
}

function saveStore(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // Storage blocked (private mode, file://): the chat still works this session.
  }
}

function slotDate(day: Date, minutes: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0);
}

export function slotKeyOf(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function slotLabel(slot: string): string {
  return slot.slice(11, 16);
}

/** All scheduled checks that fell after `lastSlot` and at or before `now`. */
export function dueSlots(now: Date, lastSlot: string | null): string[] {
  if (!lastSlot) return [];
  const out: string[] = [];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let offset = 7; offset >= 0; offset--) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    for (const minutes of SLOT_MINUTES) {
      const at = slotDate(day, minutes);
      if (at > now) continue;
      const key = slotKeyOf(at);
      if (key > lastSlot) out.push(key);
    }
  }
  return out.slice(-MAX_CATCHUP_SLOTS);
}

/** The most recent scheduled check at or before `now`. */
export function latestSlot(now: Date): Date | null {
  for (let offset = 0; offset < 4; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    for (let i = SLOT_MINUTES.length - 1; i >= 0; i--) {
      const at = slotDate(day, SLOT_MINUTES[i]);
      if (at <= now) return at;
    }
  }
  return null;
}

export function scheduledLabel(index: number): string {
  const minutes = SLOT_MINUTES[index] ?? 0;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function distance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function homeOf(world: World): BuildingInstance | null {
  const player = world.npcs.get(world.playerId);
  if (!player) return null;
  if (player.homeId) {
    const home = world.buildings.find((b) => b.id === player.homeId);
    if (home) return home;
  }
  return world.buildings.find((b) => b.ownerId === player.id && b.built) ?? null;
}

function safeSpot(
  world: World,
  center: { x: number; z: number },
  rng: RNG,
  minRadius: number,
  maxRadius: number,
  spacing = 6
): { x: number; z: number } | null {
  for (let attempt = 0; attempt < 60; attempt++) {
    const angle = rng.range(0, Math.PI * 2);
    const radius = rng.range(minRadius, maxRadius);
    const x = center.x + Math.cos(angle) * radius;
    const z = center.z + Math.sin(angle) * radius;
    if (!isWalkable(world.terrain, x, z)) continue;
    if (world.buildings.some((b) => distance(b.position, { x, z }) < spacing)) continue;
    return { x, z };
  }
  return null;
}

function directionName(from: { x: number; z: number }, to: { x: number; z: number }): string {
  const angle = Math.atan2(to.z - from.z, to.x - from.x);
  const names = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  const index = Math.round(((angle / (Math.PI * 2)) * 8 + 8)) % 8;
  return names[index];
}

function structureProposals(world: World, rng: RNG, center: { x: number; z: number }, count: number): DesignProposal[] {
  const nearby = world.buildings.filter((b) => distance(b.position, center) < 55);
  const present = new Set(nearby.map((b) => BUILDING_BY_ID.get(b.defId)?.category ?? ''));
  const candidates = [...STRUCTURE_PLAN]
    .sort((a, b) => Number(present.has(a.label)) - Number(present.has(b.label)))
    .slice(0, count);
  const out: DesignProposal[] = [];
  for (const plan of candidates) {
    const def = BUILDING_BY_ID.get(`b_${plan.key}_a0_t0`);
    if (!def) continue;
    const position = safeSpot(world, center, rng, 12, 26);
    if (!position) continue;
    const side = directionName(center, position);
    out.push({
      id: `d_${rng.int(100000, 999999)}`,
      kind: 'structure',
      title: `Raise ${article(def.name)} to the ${side}`,
      detail: `${def.name} — ${def.purpose.toLowerCase()}. I would build it outright rather than queue it: ${Math.round(distance(position, center))} paces from your door, on ground I have already walked.`,
      status: 'open',
      defId: def.id,
      position
    });
  }
  return out;
}

function article(name: string): string {
  return /^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`;
}

async function paletteProposal(world: World, rng: RNG, slot: string, index: number): Promise<DesignProposal | null> {
  const start = (hashString(slot) + index) % MATERIAL_KEYS.length;
  for (let attempt = 0; attempt < 3; attempt++) {
    const material = MATERIAL_KEYS[(start + attempt) % MATERIAL_KEYS.length];
    const spec = artDirection.spec(material);
    const current = artDirection.choices[material];
    if (current.adopted) continue;
    const category = spec.categories[0];
    try {
      const response = await searchReferences({ category, limit: 10 });
      const records = (response.records ?? []).filter((record) => record.palette?.length);
      const currentSwatch = current.source ? (dominantSwatch(current.source) ?? current.hex) : current.hex;
      const ranked = records
        .map((record) => ({ record, swatch: dominantSwatch(record) }))
        .filter((entry): entry is { record: ReferenceRecord; swatch: string } => !!entry.swatch)
        .map((entry) => ({ ...entry, delta: colorDistance(entry.swatch, currentSwatch) }))
        .filter((entry) => entry.record.id !== current.source?.id && entry.delta > 18)
        .sort((a, b) => b.delta - a.delta);
      const best = ranked[0] ?? null;
      const record = best?.record ?? records[0] ?? null;
      if (!record) continue;
      const swatch = best?.swatch ?? dominantSwatch(record) ?? spec.color;
      return {
        id: `d_${rng.int(100000, 999999)}`,
        kind: 'palette',
        title: `Re-ground the ${MATERIAL_LABELS[material].toLowerCase()} in ${record.title}`,
        detail: `The library has a ${record.category} reference — ${record.title} (${record.provider}, ${record.license}) — whose scanned swatch reads ${swatch}. I would adopt it for ${MATERIAL_LABELS[material].toLowerCase()} and let every wall, trunk and cloth in that material shift with it. ${record.attribution || record.provider}.`,
        status: 'open',
        material,
        record
      };
    } catch {
      return null;
    }
  }
  return null;
}

function colorDistance(a: string, b: string): number {
  const parse = (hex: string) => {
    const value = hex.replace('#', '');
    const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value.slice(0, 6);
    const int = parseInt(full, 16);
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
  };
  const one = parse(a);
  const two = parse(b);
  return Math.hypot(one.r - two.r, one.g - two.g, one.b - two.b);
}

function groveProposal(world: World, rng: RNG, center: { x: number; z: number }): DesignProposal | null {
  if ((world.plantings?.length ?? 0) > 70) return null;
  const position = safeSpot(world, center, rng, 14, 24, 3);
  if (!position) return null;
  const region = regionAt(world.terrain, position.x, position.z);
  const count = 7;
  return {
    id: `d_${rng.int(100000, 999999)}`,
    kind: 'grove',
    title: `Plant ${count} trees between your door and the ${region.name.replace(/^The /, '').toLowerCase()}`,
    detail: `The ground there is bare and the wind comes straight off the water. ${count} broadleaf trees, planted now, would break it and give you shade and fuel within a season.`,
    status: 'open',
    position,
    count
  };
}

/** Build one scheduled check message. Always exactly five notes. */
export async function buildMessage(
  world: World,
  slot: string,
  index: number,
  now = new Date(),
  options: { library?: boolean } = {}
): Promise<VelaMessage> {
  const slotDateValue = new Date(slot);
  const rng = new RNG(hashString(`${slot}:${world.seed}`));
  const player = world.npcs.get(world.playerId);
  const home = homeOf(world);
  const center = home?.position ?? player?.position ?? { x: 0, z: 0 };
  const structures = structureProposals(world, rng, center, 6);
  const grove = groveProposal(world, rng, center);
  const palette = options.library === false ? null : await paletteProposal(world, rng, slot, index);
  const notes: DesignProposal[] = [];
  if (palette) notes.push(palette);
  notes.push(...structures.slice(0, 2));
  if (grove) notes.push(grove);
  let cursor = 2;
  while (notes.length < 5 && cursor < structures.length) {
    notes.push(structures[cursor]);
    cursor++;
  }
  // Guarantee five notes even on a cramped map by adding further structure ideas.
  const fallback = structureProposals(world, rng, center, 12);
  for (const proposal of fallback) {
    if (notes.length >= 5) break;
    if (notes.some((note) => note.title === proposal.title)) continue;
    notes.push(proposal);
  }
  // Five notes are a promise, even on a cramped or waterlogged map.
  let guard = 0;
  while (notes.length < 5 && guard < 40) {
    guard++;
    const position = safeSpot(world, center, rng, 18, 44, 2);
    if (!position) continue;
    notes.push({
      id: `d_${rng.int(100000, 999999)}`,
      kind: 'grove',
      title: `Plant a windbreak to the ${directionName(center, position)}`,
      detail: 'Five broadleaf trees on open ground, planted now rather than promised. They will show up in the scene and in your fuel stores.',
      status: 'open',
      position,
      count: 5
    });
  }
  const time = slotLabel(slot);
  const buildingCount = world.buildings.filter((b) => b.built).length;
  const greeting =
    `${time} check. Day ${world.day}. I walked your ground and counted ${buildingCount} standing structures on the island. ` +
    `${notes.length >= 5 ? 'Five things I would change' : 'A few things I would change'}, in the order I would do them.`;
  return {
    id: `vm_${slot}_${rng.int(1000, 9999)}`,
    slot,
    at: Number.isFinite(slotDateValue.getTime()) ? slotDateValue.getTime() : now.getTime(),
    islandDay: world.day,
    greeting,
    proposals: notes.slice(0, 5)
  };
}

/** Run any checks that fell due, including ones missed while the game was closed. */
export function refresh(world: World, now = new Date(), options: { library?: boolean } = {}): Promise<VelaMessage[]> {
  if (!store.enabled) return Promise.resolve([]);
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      if (!store.lastSlot) {
        const latest = latestSlot(now);
        if (latest) {
          const previous = latestSlot(new Date(latest.getTime() - 1));
          store.lastSlot = previous ? slotKeyOf(previous) : slotKeyOf(latest);
          saveStore();
        }
      }
      const slots = dueSlots(now, store.lastSlot);
      if (!slots.length) return [];
      const messages = await Promise.all(slots.map((slot, index) => buildMessage(world, slot, index, now, options)));
      // The team may have been switched off while the library was answering.
      if (!store.enabled) return [];
      store.messages.push(...messages);
      if (store.messages.length > MAX_MESSAGES) store.messages = store.messages.slice(-MAX_MESSAGES);
      store.lastSlot = slots[slots.length - 1];
      saveStore();
      return messages;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export function messages(): VelaMessage[] {
  return store.messages;
}

/** The graphics team can be switched off without touching anything it already changed. */
export function isEnabled(): boolean {
  return store.enabled;
}

export function setEnabled(enabled: boolean, now = new Date()): void {
  store.enabled = enabled;
  if (enabled) {
    const latest = latestSlot(now);
    if (latest) store.lastSlot = slotKeyOf(latest);
  }
  saveStore();
}

export function unreadCount(): number {
  return store.messages.filter((message) => message.proposals.some((proposal) => proposal.status === 'open')).length;
}

export function resetForTests(): void {
  store = emptyStore();
  refreshing = null;
}

function createInstance(world: World, def: BuildingDef, position: { x: number; z: number }, rng: RNG): BuildingInstance {
  const instance: BuildingInstance = {
    id: uid('bld', rng),
    defId: def.id,
    name: def.name,
    ownerId: world.playerId,
    factionId: null,
    position: { ...position },
    rotation: rng.range(0, Math.PI * 2),
    progress: 1,
    built: true,
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

/** Apply one accepted note. This mutates the live world, not a mock-up. */
export function applyProposal(world: World, messageId: string, proposalId: string): { ok: boolean; message: string; kind?: ProposalKind } {
  const message = store.messages.find((entry) => entry.id === messageId);
  const proposal = message?.proposals.find((entry) => entry.id === proposalId);
  if (!message || !proposal) return { ok: false, message: 'That note is no longer in the chat.' };
  if (proposal.status !== 'open') return { ok: false, message: 'That note has already been handled.' };
  const result = applyNote(world, proposal);
  if (result.ok) {
    proposal.status = 'applied';
    saveStore();
  }
  return result;
}

/** Apply a note directly. This mutates the live world, not a mock-up. */
export function applyNote(world: World, proposal: DesignProposal): { ok: boolean; message: string; kind?: ProposalKind } {
  const rng = new RNG(hashString(`${proposal.id}:${world.seed}`));

  if (proposal.kind === 'palette' && proposal.material && proposal.record) {
    artDirection.adopt(proposal.material, proposal.record);
    pushLog(world, `Lord Slayer re-grounded ${MATERIAL_LABELS[proposal.material].toLowerCase()} in “${proposal.record.title}”. This upgrade is permanent.`, 'good');
    return { ok: true, message: `Palette adopted from ${proposal.record.title}.`, kind: 'palette' };
  }

  if (proposal.kind === 'structure' && proposal.defId) {
    const def = BUILDING_BY_ID.get(proposal.defId);
    if (!def) return { ok: false, message: 'That design is not in the catalog.' };
    const player = world.npcs.get(world.playerId);
    const center = homeOf(world)?.position ?? player?.position ?? proposal.position ?? { x: 0, z: 0 };
    const occupied = proposal.position
      ? world.buildings.some((b) => distance(b.position, proposal.position!) < 5)
      : true;
    const position = occupied ? safeSpot(world, center, rng, 10, 28) : proposal.position!;
    if (!position) return { ok: false, message: 'No clear ground left nearby.' };
    const instance = createInstance(world, def, position, rng);
    pushLog(world, `Lord Slayer raised ${def.name} beside your home.`, 'good');
    return { ok: true, message: `${instance.name} raised and standing.`, kind: 'structure' };
  }

  if (proposal.kind === 'grove' && proposal.position) {
    const count = proposal.count ?? 7;
    const plantings: Planting[] = [];
    const base = proposal.position;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const radius = rng.range(2.5, 8);
      const x = base.x + Math.cos(angle) * radius;
      const z = base.z + Math.sin(angle) * radius;
      if (!isWalkable(world.terrain, x, z)) continue;
      plantings.push({ id: uid('tree', rng), x, z, species: 'broadleaf' });
    }
    if (!plantings.length) return { ok: false, message: 'The ground there will not take a sapling.' };
    world.plantings = [...(world.plantings ?? []), ...plantings];
    pushLog(world, `Lord Slayer planted ${plantings.length} young trees near your home.`, 'good');
    return { ok: true, message: `${plantings.length} trees planted.`, kind: 'grove' };
  }

  return { ok: true, message: 'Noted.' };
}

export function dismissProposal(messageId: string, proposalId: string): boolean {
  const proposal = store.messages.find((entry) => entry.id === messageId)?.proposals.find((entry) => entry.id === proposalId);
  if (!proposal || proposal.status !== 'open') return false;
  proposal.status = 'dismissed';
  saveStore();
  return true;
}

/** Create Lord Slayer and stand him at the player's cottage door. */
export function ensureDesignBot(world: World, rng: RNG): NPC {
  const existing = world.designBotId ? world.npcs.get(world.designBotId) : null;
  if (existing?.alive) {
    positionAtHome(world, existing);
    return existing;
  }
  const home = homeOf(world);
  const player = world.npcs.get(world.playerId);
  const center = home?.position ?? player?.position ?? { x: 0, z: 0 };
  const spot = safeSpot(world, center, rng, 6, 9, 0) ?? center;
  const bot = createNPC({ rng, factionId: null, position: spot, age: 31, techAge: 3 });
  bot.name = SLAYER_NAME;
  bot.firstName = 'Lord';
  bot.family = 'Slayer';
  bot.gender = 'M';
  bot.occupation = 'Graphics keeper';
  bot.homeId = home?.id ?? null;
  bot.weapon = null;
  bot.inventory = {};
  bot.health = bot.maxHealth;
  bot.needs = { hunger: 100, thirst: 100, fatigue: 100, happiness: 80, morale: 80 };
  bot.personality = { ...bot.personality, industry: 92, openness: 95, empathy: 78, aggression: 2, bravery: 20 };
  bot.goals = ['Rebuild the island one honest material at a time', 'Keep the wanderer’s house standing'];
  bot.history.push('Took the cottage studio with a satchel of measured drawings, a colour wheel and a direct line to the Graphics Command Center.');
  world.npcs.set(bot.id, bot);
  world.designBotId = bot.id;
  return bot;
}

function positionAtHome(world: World, bot: NPC): void {
  const home = homeOf(world);
  if (!home) return;
  if (distance(bot.position, home.position) < 32) return;
  const angle = Math.atan2(bot.position.z - home.position.z, bot.position.x - home.position.x);
  for (const radius of [6.5, 7.5, 5.5]) {
    const x = home.position.x + Math.cos(angle || 0.6) * radius;
    const z = home.position.z + Math.sin(angle || 0.6) * radius;
    if (isWalkable(world.terrain, x, z)) {
      bot.position = { x, z };
      return;
    }
  }
  const spot = safeSpot(world, home.position, new RNG(hashString(bot.id)), 3, 6, 0);
  if (spot) bot.position = spot;
}

export const SLAYER_NAME = 'Lord Slayer';
export const SLAYER_SCHEDULE = 'Every 5 minutes';
