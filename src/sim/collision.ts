import type { World } from '../core/types';

const PLAYER_RADIUS = 0.45;
const NPC_RADIUS = 0.8;

/** Block steps that press into an obstacle, but allow moving out or sliding
 * around its edge. */
function movingInto(
  x: number,
  z: number,
  fromX: number,
  fromZ: number,
  obstacleX: number,
  obstacleZ: number,
  clearance: number
): boolean {
  if (Math.hypot(x - obstacleX, z - obstacleZ) >= clearance) return false;
  const stepX = x - fromX;
  const stepZ = z - fromZ;
  const toward = (x - obstacleX) * stepX + (z - obstacleZ) * stepZ;
  return toward < -0.001;
}

/** True when an islander step would press into a building. A building that
 * contains the destination is ignored so people can still enter their home or
 * workplace. */
export function npcBlocked(
  world: World,
  x: number,
  z: number,
  fromX: number,
  fromZ: number,
  target?: { x: number; z: number }
): boolean {
  for (const building of world.buildings) {
    if (!building.built) continue;
    const clearance = Math.max(1.2, (building.size ?? 3.2) * 0.5) + 0.4;
    if (target && Math.hypot(target.x - building.position.x, target.z - building.position.z) < clearance + 0.5) {
      continue;
    }
    const endDistance = Math.hypot(x - building.position.x, z - building.position.z);
    const startDistance = Math.hypot(fromX - building.position.x, fromZ - building.position.z);
    if (endDistance < clearance && (startDistance >= clearance
      || movingInto(x, z, fromX, fromZ, building.position.x, building.position.z, clearance))) {
      return true;
    }
  }
  return false;
}

/** True when a proposed player step would enter a building footprint or an islander. */
export function playerBlocked(
  world: World,
  x: number,
  z: number,
  fromX: number,
  fromZ: number
): boolean {
  for (const building of world.buildings) {
    if (!building.built) continue;
    const clearance = Math.max(1.2, (building.size ?? 3.2) * 0.5) + PLAYER_RADIUS;
    if (movingInto(x, z, fromX, fromZ, building.position.x, building.position.z, clearance)) {
      return true;
    }
  }
  for (const npc of world.npcs.values()) {
    if (!npc.alive || npc.isPlayer || npc.id === world.playerId) continue;
    if (movingInto(x, z, fromX, fromZ, npc.position.x, npc.position.z, PLAYER_RADIUS + NPC_RADIUS)) {
      return true;
    }
  }
  return false;
}
