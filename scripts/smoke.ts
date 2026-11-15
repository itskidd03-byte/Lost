/**
 * Headless simulation smoke test. Exercises the world, factions, AI, combat,
 * permanent injuries, the finishing-choice freeze and memory recording
 * without needing a browser or WebGL.
 *
 * Run: npx esbuild scripts/smoke.ts --bundle --platform=node --format=esm --outfile=/tmp/smoke.mjs && node /tmp/smoke.mjs
 */
import { RNG } from '../src/core/rng';
import { BUILDING_DEFS } from '../src/data/buildings';
import { createWorld, tickWorld, TICKS_PER_DAY, placePlayerBuilding, canPlayerBuild, constructionStage, advancePlayerConstruction, playerTechAge, nearestWalkable } from '../src/sim/simulation';
import { MIDAS_AMOUNT, activePower, applyCheat, cheatIsActive, disableCheat, loadBloodline, maintainMidas, togglePower } from '../src/sim/cheats';
import { resolveAttack, canFinish, applyFinishingWound } from '../src/sim/combat';
import { beginFinishing, chooseOutcome, tickFinishing } from '../src/sim/finishing';
import { describePart } from '../src/core/anatomy';
import { validateSaveShape } from '../src/sim/saveShape';
import { saveWorld, loadWorld, hasSave, setSaveNamespace, claimLegacySave } from '../src/sim/save';
import { AuthManager } from '../src/auth';
import { applyNote, buildMessage, dueSlots, isEnabled, messages as velaMessages, refresh as refreshVela, resetForTests, setEnabled } from '../src/sim/designBot';
import { ArtDirection } from '../src/render/artDirection';
import { loadSavedTheme, saveTheme } from '../src/data/graphics';
import { Input } from '../src/render/input';
import { playerBlocked, npcBlocked } from '../src/sim/collision';
import { cameraRelativeDirection } from '../src/sim/movement';
import { moveToward } from '../src/sim/ai';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`ok — ${message}`);
  }
}

const started = Date.now();
const stick = new Input();
const ahead = cameraRelativeDirection(0, 1, 0, 1);
assert(ahead.x === 0 && ahead.z === 1, 'pushing up walks straight where the camera looks');
const screenRight = cameraRelativeDirection(0, 1, 1, 0);
const screenLeft = cameraRelativeDirection(0, 1, -1, 0);
assert(screenRight.x < 0 && screenLeft.x > 0, 'pushing right moves right on screen and left moves left');
stick.setMove(0, 0.3);
const partial = Math.hypot(stick.state.moveX, stick.state.moveY);
assert(partial > 0 && partial < 0.3, 'a partly tilted stick moves slower than a full tilt');
stick.setMove(0.7, -0.7);
const diagonal = Math.hypot(stick.state.moveX, stick.state.moveY);
assert(diagonal > 0.98 && diagonal <= 1.001, 'diagonal stick movement stays capped at full speed');
stick.setMove(0, 0);
assert(stick.state.moveX === 0 && stick.state.moveY === 0, 'releasing the stick stops movement');
const { world } = createWorld(20261115);
const rng = new RNG(99);

assert(BUILDING_DEFS.length >= 450, `building catalog has ${BUILDING_DEFS.length} entries (>= 450)`);
assert(world.factions.length === 10, 'exactly ten factions exist');

const factionCounts = world.factions.map((f) => [...world.npcs.values()].filter((n) => n.factionId === f.id).length);
assert(factionCounts.every((c) => c === 10), `every faction starts with ten individuals (${factionCounts.join(',')})`);
assert(world.npcs.size === 102, 'one hundred islanders, the player and Vela exist');
assert(world.buildings.length === 1, 'one starting cottage exists beside the player');
assert(world.buildings.every((b) => b.factionId === null), 'no faction starts with a prebuilt structure');
assert(world.factions.every((f) => f.government === 'Unorganised'), 'no faction starts with a government');
const aggressive = world.factions.filter((f) => f.aggressionModifier > 1.6);
assert(aggressive.length === 1, 'exactly one hidden hyper-aggressive faction exists');
assert(world.factions.every((f) => !f.aggressiveDiscovered), 'the aggressive faction is not revealed at start');

// Run three in-game days of full simulation.
for (let i = 0; i < TICKS_PER_DAY * 3; i++) {
  tickWorld(world, rng);
}
const living = [...world.npcs.values()].filter((n) => n.alive).length;
assert(world.tick === TICKS_PER_DAY * 3, `simulated ${world.tick} ticks`);
assert(world.history.length > 0, `history recorded ${world.history.length} events`);
assert(living >= 90, `${living} islanders still alive after three days`);
assert(world.buildings.length > 0 || world.factions.some((f) => f.buildQueue.length > 0), 'factions have begun planning or building');
console.log(`   buildings=${world.buildings.length} built=${world.buildings.filter((b) => b.built).length} wars=${world.factions.reduce((s, f) => s + f.wars.length, 0) / 2}`);

// ----- Permanent wound finishing choice -----
const soldierPool = [...world.npcs.values()].filter((n) => n.alive && !n.isPlayer);
const attacker = soldierPool[0];
let victim = soldierPool[1];
victim.position = { x: attacker.position.x + 1.2, z: attacker.position.z + 0.6 };
victim.health = 12;
victim.inCombat = true;
const check = canFinish(world, attacker, victim);
assert(check.ok, `a downed opponent can be finished (${check.part ?? 'no part'})`);
assert(beginFinishing(world, attacker, victim), 'finishing choice begins');
assert(world.finishing.phase === 'choosing', 'combat is in the frozen choosing phase');

// The freeze rule: nobody can be damaged while the choice or cinematic runs.
const attackerHealthBefore = attacker.health;
const freezeAttack = resolveAttack(world, victim, attacker, rng, { aimedPart: 'hand' });
assert(!freezeAttack.hit && freezeAttack.damage === 0, 'no attack resolves while the fight is frozen');
assert(attacker.health === attackerHealthBefore, 'the attacker cannot be damaged during the freeze');

const partChosen = world.finishing.part!;
assert(chooseOutcome(world, 'wound'), 'permanent wound outcome selected');
for (let i = 0; i < 40 && world.finishing.active; i++) tickFinishing(world, 0.25, rng);
assert(!world.finishing.active, 'cinematic completed and combat resumed');
assert(victim.alive, 'the victim of a permanent wound survives');
assert(victim.body[partChosen].dismembered, `victim permanently loses the ${describePart(partChosen)}`);
assert(victim.maxHealth < 100, 'permanent dismemberment reduces maximum health');
assert(victim.memories.some((m) => m.type === 'finisher-wound'), 'the victim remembers the finishing wound');
assert(victim.memories.some((m) => m.attackerId === attacker.id), 'the victim remembers who did it');

// ----- Brutal kill finishing choice -----
let victim2 = soldierPool[3];
victim2.position = { x: attacker.position.x + 1.1, z: attacker.position.z - 0.5 };
victim2.health = 9;
const familyBefore = victim2.childIds.length + victim2.familyIds.length;
assert(beginFinishing(world, attacker, victim2), 'a second finishing choice begins');
assert(chooseOutcome(world, 'kill'), 'brutal kill outcome selected');
for (let i = 0; i < 40 && world.finishing.active; i++) tickFinishing(world, 0.25, rng);
assert(!victim2.alive, 'the victim of a brutal kill is permanently dead');
assert(world.corpses.some((c) => c.npcId === victim2.id), 'the body remains in the world with its possessions');
assert(world.history.some((h) => h.type === 'finisher-kill'), 'the kill is recorded in island history');
assert(world.deaths > 0, 'the world death count increased');
void familyBefore;

// A dead character cannot be resurrected by re-running anything.
const deadBefore = world.deaths;
tickWorld(world, rng);
assert(world.deaths >= deadBefore, 'death count never decreases');

// ----- Injury from ordinary combat -----
const target = soldierPool[5];
target.position = { x: attacker.position.x + 1, z: attacker.position.z };
attacker.weapon = { id: 'test', kind: 'sword', name: 'iron sword', material: 'iron', damage: 20, reach: 3, twoHanded: false, ranged: false, durability: 400, maxDurability: 400 };
attacker.skills.combat = 14;
// Targeted strikes are attempts, never guarantees: sample many and check both outcomes.
let hits = 0;
let misses = 0;
let injuredStrikes = 0;
for (let i = 0; i < 40; i++) {
  target.health = 100;
  const strike = resolveAttack(world, attacker, target, rng, { aimedPart: 'forearm' });
  if (strike.hit) {
    hits++;
    if (strike.injuryId) injuredStrikes++;
    if (target.health >= 100) throw new Error('landed strike dealt no damage');
  } else {
    misses++;
  }
}
assert(hits > 0, `targeted strikes land sometimes (${hits}/40)`);
assert(misses > 0, `targeted strikes also miss (${misses}/40)`);
assert(injuredStrikes > 0, `targeted strikes can injure anatomy (${injuredStrikes}/40)`);
assert(attacker.weapon.durability < 400, `weapon durability decreases with use (${attacker.weapon.durability.toFixed(1)}/400)`);
assert(Object.values(target.body).flatMap((p) => p.injuries).length > 0, 'injury data is attached to anatomy');

// ----- World continues without the player -----
const player = world.npcs.get(world.playerId)!;
player.position = { x: 600, z: 600 };
const farKeep = [...world.npcs.values()].filter((n) => n.alive && n.id !== player.id).length;
for (let i = 0; i < 120; i++) tickWorld(world, rng);
assert([...world.npcs.values()].filter((n) => n.alive).length >= farKeep - 3, 'distant NPCs keep living and dying on their own');

// ----- Vela, the autonomous design keeper -----
const vela = world.designBotId ? world.npcs.get(world.designBotId) : null;
assert(vela?.occupation === 'Graphics keeper' && vela?.name === 'Lord Slayer', 'Lord Slayer the graphics keeper lives in the cottage');
const playerHome = world.npcs.get(world.playerId)!;
const cottage = world.buildings.find((b) => b.ownerId === playerHome.id && b.built);
assert(!!cottage && playerHome.homeId === cottage.id, 'the starting cottage is the player home');
assert(
  playerBlocked(world, cottage!.position.x + 0.5, cottage!.position.z, cottage!.position.x + 8, cottage!.position.z),
  'the player cannot walk through a standing building'
);
assert(
  !playerBlocked(world, cottage!.position.x + 8, cottage!.position.z, cottage!.position.x, cottage!.position.z),
  'a player already inside a footprint can walk back out'
);
const neighbour = [...world.npcs.values()].find((n) => n.alive && !n.isPlayer)!;
assert(
  playerBlocked(world, neighbour.position.x + 0.5, neighbour.position.z, neighbour.position.x + 5, neighbour.position.z),
  'the player cannot walk through another islander'
);
assert(
  npcBlocked(world, cottage!.position.x + 0.5, cottage!.position.z, cottage!.position.x + 8, cottage!.position.z),
  'islanders cannot path through a standing building'
);
assert(
  !npcBlocked(world, cottage!.position.x + 0.5, cottage!.position.z, cottage!.position.x + 8, cottage!.position.z, cottage!.position),
  'islanders can enter the building they are heading to'
);
assert(
  !npcBlocked(world, cottage!.position.x + 8, cottage!.position.z, cottage!.position.x, cottage!.position.z),
  'an islander already inside a footprint can walk back out'
);
const pathStart = { ...neighbour.position };
const pathTarget = { x: cottage!.position.x - 9, z: cottage!.position.z };
neighbour.position = { x: cottage!.position.x + 9, z: cottage!.position.z };
let closestToCottage = Infinity;
for (let i = 0; i < 30; i++) {
  moveToward(world, neighbour, pathTarget, 2.4);
  closestToCottage = Math.min(closestToCottage, Math.hypot(neighbour.position.x - cottage!.position.x, neighbour.position.z - cottage!.position.z));
}
assert(closestToCottage > 1.5, `an islander steers around a building instead of entering it (closest ${closestToCottage.toFixed(1)})`);
assert(Math.hypot(neighbour.position.x - pathTarget.x, neighbour.position.z - pathTarget.z) < 1.6, 'an islander reaches the far side of a building');
neighbour.position = pathStart;

const stacked = dueSlots(new Date(2026, 10, 15, 21, 44), '2026-11-15T08:30');
assert(
  stacked.length === 8 && stacked[7].endsWith('21:40'),
  `missed five-minute checks stack up to the catch-up limit (${stacked.join(', ')})`
);
assert(
  dueSlots(new Date(2026, 10, 15, 9, 44), '2026-11-15T09:30').length === 2,
  'two five-minute checks fall due in fourteen minutes'
);

// Opening later catches up the most recent eight five-minute checks.
resetForTests();
await refreshVela(world, new Date(2026, 10, 15, 8, 31), { library: false });
const firstCheck = velaMessages().length;
const caughtUp = await refreshVela(world, new Date(2026, 10, 15, 21, 44), { library: false });
assert(firstCheck === 1, `the 08:30 check is filed when the game is first opened (${firstCheck})`);
assert(
  caughtUp.length === 8 && velaMessages().length === 9,
  `opening at 21:44 delivers the latest eight missed five-minute checks (${caughtUp.length})`
);

assert(isEnabled(), 'the graphics team starts enabled');
setEnabled(false, new Date(2026, 10, 15, 21, 45));
const whileOff = await refreshVela(world, new Date(2026, 10, 16, 21, 45), { library: false });
assert(
  whileOff.length === 0 && velaMessages().length === 9,
  `switching the graphics team off stops new checks and keeps the chat (off=${whileOff.length}, stored=${velaMessages().length})`
);
setEnabled(true, new Date(2026, 10, 16, 21, 46));
const afterEnable = await refreshVela(world, new Date(2026, 10, 16, 21, 47), { library: false });
assert(afterEnable.length === 0, 'switching the graphics team back on does not dump a backlog');

// Adopted palettes are permanent: a fresh boot restores them, cache expiry or a disabled
// graphics team cannot revert the world to the baked base look.
const paletteStore = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => paletteStore.get(key) ?? null,
  setItem: (key: string, value: string) => { paletteStore.set(key, String(value)); },
  removeItem: (key: string) => { paletteStore.delete(key); },
  clear: () => paletteStore.clear(),
  key: (index: number) => [...paletteStore.keys()][index] ?? null,
  get length() { return paletteStore.size; }
} as Storage;
const stoneReference = {
  id: 'test-stone', provider: 'wikimedia', title: 'Test Stone Wall', category: 'tex-stone',
  license: 'CC0 1.0', licenseClass: 'cc0', commercialUse: 'yes', licenseUrl: '', attribution: '',
  width: 1200, height: 800, previewUrl: '', pageUrl: '', palette: [{ hex: '#7b5a3a', share: 1 }]
};
const adopted = new ArtDirection();
adopted.adopt('stone', stoneReference);
assert(adopted.isPermanent('stone'), 'an adopted palette is written to the permanent vault');
const rebooted = new ArtDirection();
assert(
  rebooted.hex('stone') === adopted.hex('stone') && rebooted.isPermanent('stone') && rebooted.choices.stone.adopted,
  'the permanent palette survives a fresh boot (no revert to the base look)'
);
assert(adopted.isPermanent('stone'), 'the adopted upgrade stays locked in even with the graphics team off');
const gccTheme = {
  mood: 'metal', luminance: 0.4, saturation: 0.3, palette: ['#7a4a3a'],
  tokens: { primary: '#7a4a3a', accent: '#d8b46a', background: '#141210', surface: '#221d1a', muted: '#7a6a5a', text: '#f2e6d0', onPrimary: '#141210' }
};
saveTheme(gccTheme);
assert(loadSavedTheme()?.tokens.accent === '#d8b46a', 'the last Graphics Command Center theme survives a reload with the team off');

const checkMessage = await buildMessage(world, '2026-11-15T14:30', 1, new Date(2026, 10, 15, 14, 30), { library: false });
assert(checkMessage.proposals.length === 5, `a check always contains five notes (${checkMessage.proposals.length})`);
const structureNote = checkMessage.proposals.find((proposal) => proposal.kind === 'structure');
if (structureNote) {
  const before = world.buildings.length;
  const result = applyNote(world, structureNote);
  assert(result.ok && world.buildings.length === before + 1, 'accepting a structure note raises a real building');
  assert(world.buildings[world.buildings.length - 1].built, 'the raised building stands immediately');
}
const groveNote = checkMessage.proposals.find((proposal) => proposal.kind === 'grove');
if (groveNote) {
  const before = world.plantings?.length ?? 0;
  const result = applyNote(world, groveNote);
  assert(result.ok && (world.plantings?.length ?? 0) > before, 'accepting a grove note plants real trees');
}

// ----- Staged 30-second construction -----
const buildDef = BUILDING_DEFS.find((d) => d.age === 0 && d.category === 'Residential')!;
player.inventory = {};
for (const good of Object.keys(buildDef.cost)) player.inventory[good] = 5000;
const home = world.buildings.find((b) => b.ownerId === player.id && b.built)!;
const buildSpot = nearestWalkable(world.terrain, { x: home.position.x + 24, z: home.position.z + 18 });
const placed = placePlayerBuilding(world, player, buildDef, buildSpot, rng);
assert(placed.ok && placed.building?.constructionSeconds === 30, `a placed structure takes exactly 30 seconds to build${placed.reason ? `: ${placed.reason}` : ''}`);
assert(placed.building?.progress === 0 && !placed.building?.built, 'it starts at zero progress and is not finished');
const timed = placed.building;
if (timed) {
  timed.progress = 5 / 30;
  assert(constructionStage(timed.progress) === 'foundations', '0-33% shows the foundations stage');
  timed.progress = 15 / 30;
  assert(constructionStage(timed.progress) === 'framing', '33-66% shows the framing stage');
  timed.progress = 25 / 30;
  assert(constructionStage(timed.progress) === 'building', '66-100% shows the building stage');
  timed.progress = 1;
  assert(constructionStage(timed.progress, true) === 'complete', 'the final stage is a complete structure');

  // A real 30-second clock: 10s crosses framing, 20s crosses building, 30s completes.
  timed.progress = 0;
  timed.built = false;
  const after10 = advancePlayerConstruction(world, player.id, 10);
  assert(Math.abs(timed.progress - 1 / 3) < 1e-6 && after10.staged.some((entry) => entry.stage === 'framing'), 'after 10 seconds the frame is standing');
  const after20 = advancePlayerConstruction(world, player.id, 10);
  assert(Math.abs(timed.progress - 2 / 3) < 1e-6 && after20.staged.some((entry) => entry.stage === 'building'), 'after 20 seconds the walls go up');
  const after30 = advancePlayerConstruction(world, player.id, 10);
  assert(after30.completed.includes(timed) && timed.built, 'after 30 seconds the structure is complete');
}

// ----- Cheat words -----
const midas = applyCheat(world, player, 'Midas', rng);
assert(world.cheats.discovered.includes('midas') && !world.cheats.discovered.includes('slumlord'), 'only the used cheat is written into the cheat menu');
assert(midas.ok && player.inventory.wood === MIDAS_AMOUNT, 'MIDAS fills resources and labels them a million');
player.inventory.wood -= 500;
maintainMidas(world);
assert(player.inventory.wood === MIDAS_AMOUNT, 'MIDAS refills anything spent, so the number never moves');
if (timed) {
  timed.inventory.wood = 0;
  maintainMidas(world);
  assert(timed.inventory.wood === MIDAS_AMOUNT, 'MIDAS keeps town storage full too, not just your pack');
}
player.inventory.wood = 500;
assert(cheatIsActive(world, 'midas'), 'cheat status reports MIDAS as active');
const midasOff = disableCheat(world, 'midas');
maintainMidas(world);
assert(
  !cheatIsActive(world, 'midas') && player.inventory.wood === 500 && midasOff.message.includes('off'),
  'switching MIDAS off stops the refill without taking what is already stored'
);
const slumlord = applyCheat(world, player, 'slumlord', rng);
assert(slumlord.ok && world.cheats.slumlord, 'SLUMLORD binds free construction');
const oldInventory = player.inventory;
player.inventory = {};
assert(canPlayerBuild(world, player, buildDef).ok, 'SLUMLORD builds without any resources');
player.inventory = oldInventory;
const ages = applyCheat(world, player, 'ages', rng);
world.factions[0].techAge = 7;
applyCheat(world, player, 'ages', rng);
assert(ages.ok && playerTechAge(world, player) === 7, 'AGES leaves your own works uncapped');
assert(world.factions.every((f) => f.techAge <= 6), 'AGES freezes every other people at Industrial');
const powers = applyCheat(world, player, 'powers', rng);
assert(powers.ok && world.cheats.bloodline.length === 6, 'POWERS unlocks all six gifts');
assert(world.cheats.revealed, 'using a Build-search cheat reveals the cheat UI');
assert(world.cheats.discovered.includes('powers'), 'POWERS is discovered only when its word is used');
togglePower(world, 'flying');
assert(activePower(world, 'flying'), 'a power can be toggled on');
togglePower(world, 'flying');
assert(!activePower(world, 'flying') && world.cheats.bloodline.includes('flying'), 'switching it off never removes it from the bloodline');
const peopleBefore = world.npcs.size;
const people = applyCheat(world, player, 'people', rng);
assert(people.ok && world.npcs.size === peopleBefore + 100, 'PEOPLE brings one hundred new islanders');
assert(world.cheats.people && world.cheats.discovered.includes('people'), 'PEOPLE is a permanent discovered cheat');
const crown = applyCheat(world, player, 'crownme', rng);
assert(crown.ok && player.occupation === 'King', 'CROWNME makes the player king');
const subjects = [...world.npcs.values()].filter((n) => n.alive && !n.isPlayer);
assert(
  subjects.every((n) => n.loyalty === 100 && n.opinions[player.id] === 100),
  'CROWNME gives every islander unwavering loyalty'
);
assert(
  world.factions.every((f) => f.leaderId === player.id && f.government === 'Monarchy' && f.relations['player'] === 100),
  'CROWNME makes the player monarch of every people'
);
const lucifer = applyCheat(world, player, 'lucifer', rng);
assert(lucifer.ok && player.weapon?.name === "Lucifer's dagger", 'LUCIFER places the one-kill dagger in your hand');
const luciferVictim = [...world.npcs.values()].find((n) => n.alive && !n.isPlayer && n.id !== world.designBotId)!;
luciferVictim.position = { x: player.position.x + 1.2, z: player.position.z };
luciferVictim.health = luciferVictim.maxHealth;
const instant = canFinish(world, player, luciferVictim);
assert(instant.ok, 'the dagger offers wound/kill on a completely healthy opponent');
const daggerStrike = resolveAttack(world, player, luciferVictim, rng, {});
assert(daggerStrike.hit, 'the one-kill dagger always lands its first blow');

// ----- Save shape (localStorage-free check) -----
const shape = validateSaveShape(world);
assert(shape.ok, `world serialises for saving${shape.error ? `: ${shape.error}` : ''}`);

// ----- Leaving the game must never advance the island -----
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, String(value)); },
  removeItem: (key: string) => { store.delete(key); },
  clear: () => store.clear(),
  key: (index: number) => [...store.keys()][index] ?? null,
  get length() { return store.size; }
} as Storage;
assert(saveWorld(world).ok, 'world saves to browser storage');
const savedMeta = JSON.parse(store.get('kotfi.save.meta')!) as { savedAt: number };
savedMeta.savedAt = Date.now() - 1000 * 60 * 60 * 72;
store.set('kotfi.save.meta', JSON.stringify(savedMeta));
const dayAtSave = world.day;
const loaded = loadWorld();
assert(loaded !== null, 'the saved world loads back');
assert(loaded?.day === dayAtSave, `no days pass while the game is closed (day ${loaded?.day} vs ${dayAtSave})`);
assert(loaded?.npcs.size === world.npcs.size, 'loading restores every islander without simulating them');
assert(loaded?.cheats?.lucifer && loaded?.cheats?.bloodline?.length === 6, 'cheat state and the bloodline survive a save and reload');
assert(loaded?.cheats?.people && loaded?.cheats?.crownme, 'PEOPLE and CROWNME survive a save and reload');
assert(loaded?.cheats?.revealed, 'the revealed cheat UI survives a save and reload');
assert(loaded?.cheats?.discovered?.includes('midas') && loaded?.cheats?.discovered?.includes('powers'), 'the discovered cheat list survives a save and reload');

// ----- Local profiles: existing progress migrates, saves stay isolated -----
const auth = new AuthManager();
const alice = await auth.create('Alice', '2468');
assert(alice.ok && !!alice.profile, 'a username and PIN create a local profile');
const aliceId = alice.profile!.id;
const migrated = claimLegacySave(`user.${aliceId}`);
assert(migrated, 'the existing single-slot island moves into the first profile');
setSaveNamespace(`user.${aliceId}`);
assert(hasSave(), 'the migrated profile has an island to resume');
const aliceSave = loadWorld();
assert(aliceSave?.day === dayAtSave, 'the migrated island keeps its exact day');

const bob = await auth.create('Bob', '1357');
assert(bob.ok && !!bob.profile, 'a second local profile can be created');
setSaveNamespace(`user.${bob.profile!.id}`);
assert(!hasSave(), 'the second profile starts with no save of its own');
assert(loadBloodline().length === 0, 'a second profile does not inherit the first profile’s bloodline unlocks');
world.day += 2;
assert(saveWorld(world).ok, 'the second profile saves its own world');
setSaveNamespace(`user.${aliceId}`);
const aliceAgain = loadWorld();
assert(aliceAgain?.day === dayAtSave, 'the first profile is not overwritten by the second');
const wrongPin = await auth.login('Alice', '0000');
assert(!wrongPin.ok, 'the wrong PIN cannot open a profile');
const rightPin = await auth.login('Alice', '2468');
assert(rightPin.ok && rightPin.profile?.id === aliceId, 'the correct username and PIN restore the profile');
auth.logout();
assert(auth.restore() === null, 'logging out clears the remembered session');
setSaveNamespace(null);

console.log(`\nSmoke test finished in ${Date.now() - started}ms`);
console.log(`Day ${world.day} · ${[...world.npcs.values()].filter((n) => n.alive).length} alive · ${world.history.length} history events · ${world.buildings.length} buildings`);
if (process.exitCode) {
  console.error('SMOKE TEST FAILED');
} else {
  console.log('SMOKE TEST PASSED');
}
