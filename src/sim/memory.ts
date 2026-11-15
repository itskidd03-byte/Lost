import { clamp, uid } from '../core/rng';
import type { CinematicSnapshot, HistoryEvent, LogEntry, MemoryRecord, NPC, World } from '../core/types';
import { regionAt } from '../world/worldgen';

const MAX_MEMORIES = 80;
const MAX_HISTORY = 600;
const MAX_LOG = 120;

export function locationName(world: World, position: { x: number; z: number }): string {
  const region = regionAt(world.terrain, position.x, position.z);
  return region.name;
}

export function recordMemory(npc: NPC, partial: Omit<MemoryRecord, 'id'>): MemoryRecord {
  const memory: MemoryRecord = { id: uid('mem'), ...partial };
  npc.memories.unshift(memory);
  if (npc.memories.length > MAX_MEMORIES) npc.memories.length = MAX_MEMORIES;
  return memory;
}

export function addHistory(
  world: World,
  partial: Omit<HistoryEvent, 'id' | 'tick' | 'day'>
): HistoryEvent {
  const event: HistoryEvent = { id: uid('hist'), tick: world.tick, day: world.day, ...partial };
  world.history.unshift(event);
  if (world.history.length > MAX_HISTORY) world.history.length = MAX_HISTORY;
  return event;
}

export function pushLog(world: World, text: string, tone: LogEntry['tone'] = 'neutral'): void {
  world.log.unshift({ id: uid('log'), tick: world.tick, text, tone });
  if (world.log.length > MAX_LOG) world.log.length = MAX_LOG;
}

export interface EventInput {
  type: string;
  summary: string;
  attackerId: string | null;
  victimId: string | null;
  factionId: string | null;
  position: { x: number; z: number };
  emotionalImpact: number;
  consequences: string;
  witnesses?: string[];
  significant?: boolean;
  replay?: CinematicSnapshot;
  memoryType?: MemoryRecord['type'];
}

/**
 * Records a significant event into the world history, the victim's memories and the
 * memories of every NPC close enough to see it.
 */
export function recordSignificantEvent(world: World, input: EventInput): { history: HistoryEvent; witnessIds: string[] } {
  const location = locationName(world, input.position);
  const history = addHistory(world, {
    type: input.type,
    text: input.summary,
    participants: [input.attackerId, input.victimId].filter((v): v is string => !!v),
    factionId: input.factionId,
    location,
    significant: input.significant ?? true
  });

  const witnessIds: string[] = [];
  for (const npc of world.npcs.values()) {
    if (!npc.alive) continue;
    const dist = Math.hypot(npc.position.x - input.position.x, npc.position.z - input.position.z);
    const isVictim = npc.id === input.victimId;
    const isAttacker = npc.id === input.attackerId;
    const canSee = dist < 70;
    if (!isVictim && !isAttacker && !canSee) continue;

    if (!isVictim && !isAttacker) witnessIds.push(npc.id);

    let impact = input.emotionalImpact;
    if (isVictim) impact = Math.min(100, impact * 1.35);
    else if (isAttacker) impact = Math.max(0, impact * 0.28);
    else impact = impact * clamp(1 - dist / 80, 0.15, 1);

    const memoryType: MemoryRecord['type'] = isVictim
      ? (input.memoryType ?? 'near-death')
      : isAttacker
        ? 'battle'
        : dist < 30
          ? (input.memoryType ?? 'death-witnessed')
          : 'battle';

    recordMemory(npc, {
      tick: world.tick,
      day: world.day,
      location,
      type: memoryType,
      summary: isVictim || isAttacker ? input.summary : `Witnessed: ${input.summary}`,
      attackerId: input.attackerId,
      victimId: input.victimId,
      witnesses: witnessIds.slice(0, 12),
      factionId: input.factionId,
      emotionalImpact: Math.round(impact),
      consequences: input.consequences,
      replay: isVictim || isAttacker ? input.replay : undefined
    });

    // Fear and grudges shape later decisions.
    if (input.attackerId && input.attackerId !== npc.id && impact > 35) {
      const rel = npc.relationships[input.attackerId] ?? { affinity: 0, trust: 0, fear: 0, lastInteractionTick: world.tick };
      rel.affinity = clamp(rel.affinity - impact * 0.7, -100, 100);
      rel.trust = clamp(rel.trust - impact * 0.8, -100, 100);
      rel.fear = clamp(rel.fear + impact * 0.6, 0, 100);
      rel.lastInteractionTick = world.tick;
      npc.relationships[input.attackerId] = rel;
    }
  }

  return { history, witnessIds };
}

export function spreadRumour(world: World, witnessIds: string[], text: string): void {
  pushLog(world, text, 'memory');
  // Witnesses tell those close to them; this is how news travels between settlements.
  for (const id of witnessIds.slice(0, 6)) {
    const witness = world.npcs.get(id);
    if (!witness || !witness.alive) continue;
    const listeners = [...world.npcs.values()]
      .filter((n) => n.alive && n.id !== witness.id && n.factionId === witness.factionId)
      .filter((n) => Math.hypot(n.position.x - witness.position.x, n.position.z - witness.position.z) < 45)
      .slice(0, 2);
    for (const listener of listeners) {
      if (listener.memories.some((m) => m.summary === text)) continue;
      recordMemory(listener, {
        tick: world.tick,
        day: world.day,
        location: locationName(world, listener.position),
        type: 'battle',
        summary: `Heard from ${witness.firstName}: ${text}`,
        attackerId: null,
        victimId: null,
        witnesses: [witness.id],
        factionId: listener.factionId,
        emotionalImpact: 22,
        consequences: 'Second-hand account; details may be unreliable.'
      });
    }
  }
}
