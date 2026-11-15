/**
 * DOM-level HUD check: renders every panel, the finishing-choice modal, the
 * cinematic overlay and the death screen against a real world using jsdom,
 * so template/runtime mistakes surface without a browser.
 *
 * Run: npm i --no-save jsdom
 *      npx esbuild scripts/hud-check.ts --bundle --platform=node --format=esm --external:jsdom --outfile=.smoke/hud.mjs
 *      node .smoke/hud.mjs
 */
import { JSDOM } from 'jsdom';
import { RNG } from '../src/core/rng';
import { createWorld } from '../src/sim/simulation';
import { HUD } from '../src/ui/hud';
import { TouchControls } from '../src/ui/touch';
import { Input } from '../src/render/input';

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="app"></div>
  <div id="viewport"></div>
  <div id="reticle" hidden></div>
  <div id="hud"></div>
  <div id="panels"></div>
  <div id="modal"></div>
  <div id="toasts"></div>
</body></html>`, { pretendToBeVisual: true });

const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.HTMLElement = dom.window.HTMLElement;
g.HTMLInputElement = dom.window.HTMLInputElement;
g.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
g.CustomEvent = dom.window.CustomEvent;

const errors: string[] = [];
const noop = () => undefined;
let cheatCalled = '';
const hud = new HUD(
  {
    hud: dom.window.document.getElementById('hud')!,
    panels: dom.window.document.getElementById('panels')!,
    modal: dom.window.document.getElementById('modal')!,
    toasts: dom.window.document.getElementById('toasts')!,
    reticle: dom.window.document.getElementById('reticle')!
  },
  {
    onSelectTargetPart: noop, onFinishNow: noop, onChooseFinishing: noop, onSave: noop, onLoad: noop,
    onNewGame: noop, onSpeed: noop, onBuild: noop, onBuy: noop, onSell: noop, onInspect: noop,
    onEnterBuilding: noop, onExitInterior: noop, onHire: noop, onFire: noop, onToggleBusiness: noop,
    onNewCharacter: noop, onSetSetting: noop, onCollectCorpse: noop, onOpenBusiness: noop,
    onRentBuilding: noop, onAttackNearest: noop, onConsume: noop, onCraft: noop, onRepair: noop,
    onInstall: noop, onLogout: noop, onNewIsland: noop, onCheat: (code: string) => { cheatCalled = code; }, onTogglePower: noop, onBlink: noop
  }
);

const { world } = createWorld(777);
const rng = new RNG(3);
hud.setWorld(world);
const player = world.npcs.get(world.playerId)!;

const check = (label: string, fn: () => void) => {
  try {
    fn();
    console.log(`ok — ${label}`);
  } catch (error) {
    errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`FAIL — ${label}:`, error);
  }
};

check('intro renders', () => hud.showIntro(777, true, 'Day 4', noop));
check('intro hides', () => hud.hideIntro());
check('HUD updates with a target', () => hud.update(world, player, [...world.npcs.values()].find((n) => !n.isPlayer) ?? null));
check('HUD updates without a target', () => hud.update(world, player, null));
check('cheat UI is hidden until a build-search cheat is used', () => {
  const button = dom.window.document.getElementById('hud-cheats') as HTMLButtonElement;
  if (!button.hidden) throw new Error('cheat button visible before discovery');
});

// Reveal the discovered state so the existing panel coverage still renders it.
world.cheats.revealed = true;
world.cheats.discovered = ['midas', 'powers'];
world.cheats.midas = true;
world.cheats.powersUnlocked = true;
world.cheats.bloodline = ['speed'];
hud.update(world, player, null);

const panels = ['character', 'injuries', 'memories', 'factions', 'history', 'map', 'build', 'ledger', 'inventory', 'settings', 'market', 'npc', 'references', 'studio', 'powers', 'cheats'] as const;
for (const panel of panels) {
  check(`panel "${panel}" renders`, () => {
    hud.togglePanel(panel, panel === 'npc' ? [...world.npcs.values()].find((n) => !n.isPlayer)!.id : undefined);
    if (!dom.window.document.querySelector('#panels').innerHTML) throw new Error('panel produced no markup');
    hud.closePanels();
  });
}

check('cheat menu only lists discovered words', () => {
  hud.togglePanel('cheats');
  const rows = dom.window.document.querySelectorAll('#panels .cheat-row');
  if (rows.length !== 2) throw new Error(`expected only MIDAS and POWERS rows, found ${rows.length}`);
  const text = dom.window.document.querySelector('#panels')!.textContent ?? '';
  if (text.includes('SLUMLORD') || text.includes('AGES') || text.includes('LUCIFER')) {
    throw new Error('undiscovered cheat names leaked into the menu');
  }
  hud.closePanels();
});

// Building catalog panel count.
hud.togglePanel('build');
const buildCards = dom.window.document.querySelectorAll('[data-build]').length;
check(`build panel lists designs (${buildCards})`, () => {
  if (buildCards === 0) throw new Error('no building options rendered');
});
hud.closePanels();

// Build search bar and cheat whispers.
hud.togglePanel('build');
const search = dom.window.document.getElementById('build-search') as HTMLInputElement | null;
check('build panel has a search bar', () => {
  if (!search) throw new Error('search input missing');
  search.value = 'Midas';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  if (cheatCalled !== 'midas') throw new Error(`cheat callback got "${cheatCalled}"`);
  if (!dom.window.document.querySelector('.cheat-result')) throw new Error('cheat result card missing');
});
hud.closePanels();

// Reference memory panel content.
hud.togglePanel('references');
const referenceMarkup = {
  materials: dom.window.document.querySelectorAll('.material-card').length,
  controls: !!dom.window.document.getElementById('ref-category'),
  swatches: dom.window.document.querySelectorAll('.material-card .swatch').length
};
check(`reference panel lists ${referenceMarkup.materials} grounded materials`, () => {
  if (referenceMarkup.materials !== 9) throw new Error('expected 9 material cards');
  if (!referenceMarkup.controls) throw new Error('search controls missing');
  if (referenceMarkup.swatches !== 9) throw new Error('material swatches missing');
});
hud.closePanels();

// Market rows.
const market = world.markets[0];
hud.togglePanel('market', market.id);
const marketRows = dom.window.document.querySelectorAll('.market-row').length;
check(`market panel lists goods (${marketRows})`, () => {
  if (marketRows < 10) throw new Error('market rows missing');
});
hud.closePanels();

// Finishing choice.
const victim = [...world.npcs.values()].find((n) => !n.isPlayer)!;
world.finishing = {
  active: true, phase: 'choosing', attackerId: player.id, victimId: victim.id,
  part: 'hand:L', weaponName: 'iron sword', startedAt: world.tick, elapsed: 0,
  cameraAngle: 0, applied: false, snapshot: null
};
check('finishing choice modal renders two outcomes', () => {
  hud.showFinishingChoice(world);
  const choices = dom.window.document.querySelectorAll('.choice');
  if (choices.length !== 2) throw new Error(`expected 2 choices, found ${choices.length}`);
  if (!dom.window.document.getElementById('choose-wound') || !dom.window.document.getElementById('choose-kill')) {
    throw new Error('choice buttons missing');
  }
});

check('cinematic caption renders', () => {
  world.finishing.phase = 'kill';
  hud.showCinematicCaption(world);
  if (!dom.window.document.querySelector('.cinematic-caption')) throw new Error('caption missing');
});
check('cinematic progress is safe', () => hud.drawFinishingProgress(world));
check('modal closes', () => hud.hideModal());
world.finishing.active = false;
world.finishing.phase = 'idle';

check('death screen renders', () => {
  hud.showDeath(world, player, noop);
  if (!dom.window.document.querySelector('.death')) throw new Error('death screen missing');
});
hud.hideModal();

check('toasts render', () => hud.toast('A test message'));

// Touch-only controls: joystick, look pad, action cluster and island menu.
const touchInput = new Input();
let openedPanel = '';
let touchCheatsRevealed = false;
let touchPowers = false;
const touch = new TouchControls(touchInput, {
  onAttack: noop, onInteract: noop, onFinish: noop, onToggleTarget: noop,
  onPanel: (kind) => { openedPanel = kind; },
  onSpeed: noop, onSave: noop, onLoad: noop, onInstall: noop, onCancelBuild: noop,
  getSpeed: () => 1, getAccount: () => 'Test', cheatsRevealed: () => touchCheatsRevealed, hasPowers: () => touchPowers, hasPendingBuild: () => false
});
void touch;

check('touch controls expose a joystick, look pad and six actions', () => {
  const doc = dom.window.document;
  if (!doc.querySelector('#touch .stick') || !doc.querySelector('#touch .look-pad')) throw new Error('stick or look pad missing');
  const actions = doc.querySelectorAll('#touch .actions .tbtn');
  if (actions.length !== 6) throw new Error(`expected 6 action buttons, found ${actions.length}`);
});

check('island menu hides cheat panels until discovery, then shows every panel', () => {
  const doc = dom.window.document;
  doc.getElementById('touch-menu')!.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
  const sheet = doc.getElementById('touch-sheet') as HTMLElement;
  if (sheet.hidden) throw new Error('sheet did not open');
  let panels = sheet.querySelectorAll('[data-sheet-panel]').length;
  if (panels !== 11) throw new Error(`expected 11 undiscovered panels in the menu, found ${panels}`);
  touchCheatsRevealed = true;
  touchPowers = true;
  (sheet.querySelector('[data-sheet-close]') as HTMLElement).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  doc.getElementById('touch-menu')!.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
  panels = sheet.querySelectorAll('[data-sheet-panel]').length;
  if (panels !== 13) throw new Error(`expected 13 discovered panels in the menu, found ${panels}`);
  if (sheet.querySelectorAll('[data-sheet-speed]').length !== 4) throw new Error('speed controls missing');
  const mapButton = sheet.querySelector('[data-sheet-panel="map"]') as HTMLElement;
  mapButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  if (openedPanel !== 'map') throw new Error(`panel callback got "${openedPanel}"`);
  if (!sheet.hidden) throw new Error('menu stayed open after choosing a panel');
});

if (errors.length) {
  console.error(`\nHUD CHECK FAILED (${errors.length})`);
  process.exitCode = 1;
} else {
  console.log('\nHUD CHECK PASSED');
}
