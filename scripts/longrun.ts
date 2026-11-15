/**
 * Long-run macro check: does the island actually develop on its own?
 * Run: npx esbuild scripts/longrun.ts --bundle --platform=node --format=esm --outfile=/tmp/longrun.mjs && node /tmp/longrun.mjs
 */
import { RNG } from '../src/core/rng';
import { createWorld, tickWorld, TICKS_PER_DAY } from '../src/sim/simulation';

const { world } = createWorld(424242);
const rng = new RNG(7);
const days = Number(process.argv[2] ?? 90);
const started = Date.now();

for (let i = 0; i < days * TICKS_PER_DAY; i++) {
  tickWorld(world, rng);
}

const alive = (id: string) => [...world.npcs.values()].filter((n) => n.alive && n.factionId === id).length;
console.log(`Simulated ${days} days in ${Date.now() - started}ms`);
console.log(`Season ${world.season} · day ${world.day} · ${world.buildings.filter((b) => b.built).length} buildings · ${world.history.length} recorded events`);
console.log(`Births ${world.births} · deaths ${world.deaths} · corpses ${world.corpses.length}`);
console.log('');
for (const faction of world.factions) {
  const wars = faction.wars.map((id) => world.factions.find((f) => f.id === id)?.adjective).join(',');
  console.log(
    `${faction.name.padEnd(28)} pop ${String(alive(faction.id)).padStart(3)} · gov ${faction.government.padEnd(17)} · tech ${faction.techAge + 1} · treasury ${String(Math.round(faction.treasury)).padStart(5)} · army ${faction.military.soldiers} · laws ${faction.laws.length}${wars ? ` · WAR ${wars}` : ''}`
  );
}
const aggressive = world.factions.find((f) => f.aggressionModifier > 1.6);
console.log(`\nHidden aggressor discovered: ${aggressive?.aggressiveDiscovered ? 'yes' : 'no'} (${aggressive?.name})`);
const injured = [...world.npcs.values()].filter((n) => n.alive && n.body && Object.values(n.body).some((p) => p.injuries.length > 0)).length;
const dismembered = [...world.npcs.values()].filter((n) => n.alive && Object.values(n.body).some((p) => p.dismembered)).length;
const memories = [...world.npcs.values()].reduce((sum, n) => sum + n.memories.length, 0);
console.log(`People with injuries: ${injured} · permanently disfigured: ${dismembered} · memories stored: ${memories}`);
const player = world.npcs.get(world.playerId);
console.log(`Player alive: ${player?.alive} · health ${Math.round(player?.health ?? 0)} · hunger ${Math.round(player?.needs.hunger ?? 0)} · thirst ${Math.round(player?.needs.thirst ?? 0)}`);
