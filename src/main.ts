import * as THREE from 'three';
import './styles.css';
import { RNG, clamp } from './core/rng';
import type { BodyRegion } from './core/anatomy';
import { mobilityFactor } from './core/anatomy';
import { BUILDING_BY_ID } from './data/buildings';
import { GOODS } from './data/goods';
import type { BuildingDef, NPC, PowerKey, World } from './core/types';
import { WorldRenderer } from './render/scene';
import { Input } from './render/input';
import { HUD } from './ui/hud';
import { TouchControls } from './ui/touch';
import { isEnabled as graphicsTeamEnabled, refresh as refreshVela, slotLabel as velaSlotLabel } from './sim/designBot';
import {
  OFFLINE_THEME,
  isOffline,
  loadGraphicsPlugin,
  loadSavedTheme,
  readableAccent,
  saveTheme,
  type GccApi,
  type GccTheme
} from './data/graphics';
import { createWorld, tickWorld, playerTechAge, placePlayerBuilding, newPlayerCharacter, advancePlayerConstruction, MINUTES_PER_TICK, TICKS_PER_DAY } from './sim/simulation';
import { activePower, applyCheat, disableCheat, ensureCheats, maintainMidas, togglePower as togglePowerState, type CheatKey } from './sim/cheats';
import { beginFinishing, chooseOutcome, tickFinishing } from './sim/finishing';
import { resolveAttack, canFinish, weaponOf } from './sim/combat';
import { buyFromMarket, sellToMarket, hireEmployee, openBusiness, priceOf } from './sim/economy';
import { pushLog } from './sim/memory';
import { saveWorld, loadWorld, saveMeta, hasSave, setSaveNamespace, claimLegacySave, hasLegacySave } from './sim/save';
import { isWalkable, heightAt, SEA_LEVEL } from './world/worldgen';
import { playerBlocked } from './sim/collision';
import { cameraRelativeDirection } from './sim/movement';
import { RESOURCE_LABEL } from './data/goods';
import { adjustStanding } from './sim/factions';
import { artDirection } from './render/artDirection';
import { makeWeapon, trainSkill } from './sim/npc';
import { addItem } from './sim/npc';
import { AuthManager, type LocalProfile } from './auth';
import { LoginScreen } from './ui/login';

const TICK_MS = 250;
const AUTOSAVE_MS = 10000;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function showFatal(message: string): void {
  const modal = document.getElementById('modal');
  if (!modal) return;
  modal.classList.add('open');
  modal.innerHTML = `<div class="modal-card"><h2>The island failed to load</h2>
    <p class="lede">${message}</p>
    <p class="fineprint">This build needs WebGL. Try a different browser or enable hardware acceleration, then reload.</p></div>`;
}

window.addEventListener('error', (event) => {
  console.error(event.error ?? event.message);
});

class Game {
  private world!: World;
  private rng = new RNG(1);
  private renderer!: WorldRenderer;
  private input!: Input;
  private hud!: HUD;
  private running = false;
  private lastFrame = 0;
  private tickAccumulator = 0;
  private hudAccumulator = 0;
  private aiming: NPC | null = null;
  private selectedPart: BodyRegion | null = null;
  private pendingBuild: BuildingDef | null = null;
  private deathShown = false;
  private lastFinishingSignature = '';
  private lastModalState: 'none' | 'choice' | 'cinematic' = 'none';
  private touch!: TouchControls;
  private awayPaused = false;
  private awayPausedBefore = false;
  private lastVelaPoll = 0;
  private moveVX = 0;
  private moveVZ = 0;
  private moveForward = new THREE.Vector3();
  private installPrompt: BeforeInstallPromptEvent | null = null;
  private auth = new AuthManager();
  private login!: LoginScreen;
  private activeProfile: LocalProfile | null = null;
  private lastAutosaveError: string | null = null;
  private gcc: GccApi | null = null;
  private graphicsTimer: number | null = null;
  private graphicsStarted = false;
  private gccThemeBound = false;
  private gccThemeHandler = (event: Event): void => {
    if (!this.graphicsStarted) return;
    const theme = (event as CustomEvent<GccTheme>).detail;
    if (theme?.tokens) this.applyGraphicsTheme(theme, true);
  };

  start(): void {
    const viewport = document.getElementById('viewport')!;
    try {
      this.renderer = new WorldRenderer(viewport);
    } catch (error) {
      showFatal(error instanceof Error ? error.message : 'WebGL is unavailable in this browser.');
      return;
    }
    this.input = new Input();
    this.hud = new HUD(
      {
        hud: document.getElementById('hud')!,
        panels: document.getElementById('panels')!,
        modal: document.getElementById('modal')!,
        toasts: document.getElementById('toasts')!,
        reticle: document.getElementById('reticle')!
      },
      {
        onSelectTargetPart: (part) => { this.selectedPart = part; },
        onFinishNow: () => this.tryFinish(),
        onChooseFinishing: (option) => this.choose(option),
        onSave: () => this.save(),
        onLoad: () => this.load(),
        onInstall: () => this.promptInstall(),
        onLogout: () => this.logout(),
        onNewIsland: () => this.confirmNewIsland(),
        onNewGame: (seed) => this.newGame(seed),
        onSpeed: (speed) => { this.world.timeScale = speed; this.world.paused = speed === 0; },
        onBuild: (defId) => this.beginBuild(defId),
        onBuy: (good, qty) => this.buy(good, qty),
        onSell: (good, qty) => this.sell(good, qty),
        onInspect: (id) => this.hud.togglePanel('npc', id),
        onEnterBuilding: (id) => this.enterBuilding(id),
        onExitInterior: () => this.exitInterior(),
        onHire: () => this.hire(),
        onFire: (id) => this.fire(id),
        onToggleBusiness: () => undefined,
        onNewCharacter: () => this.continueAfterDeath(),
        onSetSetting: (key, value) => { this.applySetting(key, value); },
        onCollectCorpse: (id) => this.collectCorpse(id),
        onConsume: (good) => this.consume(good),
        onCraft: (recipeId) => this.craft(recipeId),
        onRepair: () => this.repairWeapon(),
        onOpenBusiness: (id) => this.startBusiness(id),
        onRentBuilding: (id) => this.advertiseRent(id),
        onAttackNearest: () => this.attack(),
        onCheat: (code) => this.handleCheat(code),
        onToggleCheat: (key) => this.handleCheatToggle(key),
        onTogglePower: (key) => this.handlePowerToggle(key),
        onBlink: () => this.blink()
      }
    );

    this.touch = new TouchControls(this.input, {
      onAttack: () => {
        if (this.pendingBuild) {
          this.placeBuilding();
          return;
        }
        if (!this.running || this.world.finishing.active) return;
        this.attack();
      },
      onInteract: () => this.interact(),
      onFinish: () => this.tryFinish(),
      onToggleTarget: () => this.hud.toggleTargetPicker(),
      onPanel: (kind) => this.hud.togglePanel(kind),
      onSpeed: (speed) => { this.world.timeScale = speed; this.world.paused = speed === 0; },
      onSave: () => this.save(),
      onLoad: () => this.load(),
      onInstall: () => this.promptInstall(),
      onCancelBuild: () => this.cancelBuild(),
      getSpeed: () => (this.world ? this.world.timeScale : 1),
      getAccount: () => this.activeProfile?.username ?? '',
      cheatsRevealed: () => Boolean(this.world?.cheats?.revealed),
      hasPowers: () => Boolean(this.world?.cheats?.powersUnlocked || (this.world?.cheats?.bloodline?.length ?? 0) > 0),
      hasPendingBuild: () => this.pendingBuild !== null
    });
    // The game pauses the moment it leaves the screen; the world never advances without you.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pauseAway();
    });
    window.addEventListener('pagehide', () => this.pauseAway());
    document.getElementById('away-resume')?.addEventListener('click', () => this.resumeFromAway());
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.installPrompt = event as BeforeInstallPromptEvent;
    });
    window.addEventListener('appinstalled', () => {
      this.installPrompt = null;
      this.hud.toast('Installed. The island opens offline and refreshes when you are online.');
    });
    this.registerOfflineShell();
    window.addEventListener('kotfi:interact', () => this.interact());
    window.addEventListener('kotfi:palette-changed', () => {
      this.renderer.applyArtDirection();
      this.hud.refreshReferences();
    });
    window.addEventListener('kotfi:graphics-team', (event) => {
      const enabled = Boolean((event as CustomEvent<{ enabled?: boolean }>).detail?.enabled);
      if (enabled) void this.startGraphicsTeam();
      else this.stopGraphicsTeam();
    });
    // The saved palette is the offline look; new library pulls resume on reconnect.
    window.addEventListener('online', () => {
      if (graphicsTeamEnabled()) void this.startGraphicsTeam();
    });
    window.addEventListener('offline', () => this.stopGraphicsTeam());
    window.addEventListener('kotfi:design-applied', (event) => {
      const kind = (event as CustomEvent<{ kind?: string }>).detail?.kind;
      if (kind === 'palette') {
        this.renderer.applyArtDirection();
        this.hud.refreshReferences();
      }
      this.renderer.sync(this.world);
      this.hud.refreshStudio();
      // Structures and trees from an accepted note survive a reload even if the
      // player forgets to save afterwards.
      if (this.world) saveWorld(this.world);
    });

    const savedTheme = loadSavedTheme();
    const shownTheme = savedTheme ?? (graphicsTeamEnabled() ? OFFLINE_THEME : null);
    if (shownTheme) this.applyGraphicsTheme(shownTheme, false);
    if (graphicsTeamEnabled()) void this.startGraphicsTeam();

    this.startSession();
    window.setInterval(() => this.autosave(), AUTOSAVE_MS);
    void this.linkReferenceLibrary();
    this.loop();
  }

  /** Ground the world's materials in the live reference library. Never blocks play. */
  private async linkReferenceLibrary(): Promise<void> {
    try {
      await artDirection.load();
      this.renderer.applyArtDirection();
      this.hud.refreshReferences();
      if (artDirection.status === 'live') {
        const total = artDirection.stats?.total;
        this.hud.toast(`Art direction linked to the live library${total ? ` (${total} references)` : ''}. Browse it from the island menu.`);
      } else if (artDirection.status === 'offline') {
        this.hud.toast('Reference library unreachable — cached palettes are in use.');
      }
    } catch {
      // A reference library outage must never stop the game.
    }
  }

  /** Restore the remembered profile, or ask for a username and PIN. */
  private startSession(): void {
    this.login = new LoginScreen(document.getElementById('login')!);
    const remembered = this.auth.restore();
    if (remembered) {
      this.enterProfile(remembered);
      return;
    }
    this.login.show(this.auth.usernames, hasLegacySave(), this.auth.lastUsername, {
      onLogin: async (username, pin) => {
        const result = await this.auth.login(username, pin);
        if (!result.ok || !result.profile) return result.error ?? 'Could not sign in.';
        this.enterProfile(result.profile);
        return null;
      },
      onCreate: async (username, pin) => {
        const result = await this.auth.create(username, pin);
        if (!result.ok || !result.profile) return result.error ?? 'Could not create the profile.';
        this.enterProfile(result.profile);
        return null;
      }
    });
  }

  /** A profile owns its own save namespace; the old single slot migrates once. */
  private enterProfile(profile: LocalProfile): void {
    this.activeProfile = profile;
    const namespace = `user.${profile.id}`;
    setSaveNamespace(namespace);
    const migrated = claimLegacySave(namespace);
    this.hud.setAccount(profile.username);
    this.login.hide();
    if (hasSave()) {
      this.load();
      if (this.world) {
        this.hud.toast(migrated
          ? `Existing island moved into ${profile.username}. Autosaves resumed.`
          : `Welcome back, ${profile.username}. Autosaves resumed.`);
        return;
      }
    }
    this.showIntro();
  }

  private showIntro(): void {
    const meta = saveMeta();
    const summary = meta ? `Day ${meta.day} · seed ${meta.seed} · ${meta.population} alive` : '';
    this.hud.showIntro(this.world?.seed ?? null, hasSave(), summary, (seed, load) => {
      this.hud.hideIntro();
      this.requestLandscape();
      if (load) {
        this.load();
        if (!this.world) this.newGame(seed);
      } else {
        this.newGame(seed);
      }
    });
  }

  private newGame(seed: number | null): void {
    const created = createWorld(seed ?? undefined);
    this.world = created.world;
    this.rng = new RNG((this.world.seed ^ 0x6a09e667) >>> 0);
    this.hud.setWorld(this.world);
    this.renderer.exitInterior();
    this.renderer.sync(this.world);
    this.renderer.buildResources(this.world);
    this.renderer.applyArtDirection();
    this.resetTransientState();
    this.running = true;
    const saved = saveWorld(this.world);
    this.hud.toast(saved.ok
      ? `World seed ${this.world.seed}. Autosaving to ${this.activeProfile?.username ?? 'this browser'}.`
      : `World seed ${this.world.seed}. Save failed: ${saved.error}`);
    pushLog(this.world, 'Lord Slayer is in the cottage studio. His first graphics check is waiting in his notes.', 'neutral');
    void this.checkDesignBot();
  }

  private load(): void {
    const world = loadWorld();
    if (!world) {
      this.hud.toast('No save found in this browser.');
      return;
    }
    this.world = world;
    this.rng = new RNG((this.world.seed ^ 0x5be0cd19) >>> 0);
    this.hud.setWorld(this.world);
    this.renderer.exitInterior();
    this.world.currentInteriorId = null;
    this.renderer.sync(this.world);
    this.renderer.buildResources(this.world);
    this.renderer.applyArtDirection();
    this.resetTransientState();
    this.running = true;
    this.hud.toast(`Save loaded for ${this.activeProfile?.username ?? 'this browser'}. No time passed while you were away.`);
    void this.checkDesignBot();
  }

  private resetTransientState(): void {
    this.pendingBuild = null;
    this.renderer.hideGhost();
    this.moveVX = 0;
    this.moveVZ = 0;
    this.renderer.playerYaw = null;
    this.selectedPart = null;
    this.deathShown = false;
    this.lastModalState = 'none';
    this.lastFinishingSignature = '';
    this.hud.hideModal();
    this.hud.closePanels();
    this.hud.setReticleVisible(!this.world.finishing.active && this.world.settings.showReticle);
  }

  private save(): void {
    if (!this.world) return;
    const result = saveWorld(this.world);
    this.hud.toast(result.ok
      ? `World saved to ${this.activeProfile?.username ?? 'this browser'}.`
      : `Save failed: ${result.error}`);
  }

  /** Every ten seconds the current island is written to the signed-in profile. */
  private autosave(): void {
    if (!this.world || !this.activeProfile || this.awayPaused) return;
    const result = saveWorld(this.world);
    if (result.ok) {
      this.lastAutosaveError = null;
      return;
    }
    if (result.error !== this.lastAutosaveError) {
      this.lastAutosaveError = result.error ?? 'storage unavailable';
      this.hud.toast(`Autosave failed: ${this.lastAutosaveError}`);
    }
  }

  private logout(): void {
    if (!this.activeProfile) return;
    if (!window.confirm(`Log out of ${this.activeProfile.username}? The island is autosaved to this profile.`)) return;
    this.autosave();
    this.auth.logout();
    this.activeProfile = null;
    setSaveNamespace(null);
    location.reload();
  }

  private confirmNewIsland(): void {
    if (!this.activeProfile) return;
    if (!window.confirm(`Start a new island? This replaces the autosave for ${this.activeProfile.username}.`)) return;
    this.newGame(null);
  }

  /** Leaving the app pauses the simulation and switches autonomous time off. */
  private pauseAway(): void {
    if (!this.world || this.awayPaused) return;
    // Leaving is also a save point: closing the app must not lose the last ten seconds.
    this.autosave();
    this.awayPaused = true;
    this.awayPausedBefore = this.world.paused;
    this.world.paused = true;
    this.world.timeScale = 0;
    this.input.reset();
    this.touch.closeSheet();
    this.hud.closePanels();
    const away = document.getElementById('away');
    if (away) away.hidden = false;
  }

  private resumeFromAway(): void {
    if (!this.awayPaused || !this.world) return;
    this.awayPaused = false;
    this.lastFrame = performance.now();
    this.tickAccumulator = 0;
    this.lastVelaPoll = 0;
    void this.checkDesignBot();
    this.world.paused = this.awayPausedBefore;
    this.world.timeScale = 1;
    const away = document.getElementById('away');
    if (away) away.hidden = true;
    this.hud.setReticleVisible(!this.world.finishing.active && this.world.settings.showReticle);
    this.hud.toast('Resumed. The island waited, and accelerated time is off.');
  }

  /** Landscape play: best-effort orientation lock after the first tap. */
  private requestLandscape(): void {
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    try {
      const request = document.documentElement.requestFullscreen?.();
      if (request) void request.catch(() => undefined);
    } catch {
      // Fullscreen is optional; the rotate prompt still enforces landscape.
    }
    try {
      const orientation = screen.orientation as unknown as { lock?: (mode: string) => Promise<void> };
      const lock = orientation?.lock;
      if (lock && orientation) void lock.call(orientation, 'landscape').catch(() => undefined);
    } catch {
      // Older mobile browsers do not support orientation lock.
    }
  }

  /** Installable shell: caches the build and refreshes it whenever the network is back. */
  private registerOfflineShell(): void {
    const isProduction = Boolean((import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD);
    if (!isProduction || !('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
    void navigator.serviceWorker.register('./sw.js').then((registration) => {
      const refresh = () => { if (navigator.onLine) void registration.update(); };
      window.addEventListener('online', refresh);
      window.setInterval(refresh, 15 * 60 * 1000);
      refresh();
    }).catch(() => undefined);
  }

  /** The browser owns the actual install prompt; show its UI when it is ready. */
  private promptInstall(): void {
    if (window.matchMedia?.('(display-mode: standalone)').matches) {
      this.hud.toast('The island is already installed.');
      return;
    }
    const prompt = this.installPrompt;
    if (!prompt) {
      this.hud.toast('Use your browser menu and choose “Install app” or “Add to Home Screen”.');
      return;
    }
    this.installPrompt = null;
    void prompt.prompt();
    void prompt.userChoice.then((choice) => {
      if (choice.outcome === 'accepted') this.hud.toast('Installed. It opens offline and updates when you are online.');
    }).catch(() => undefined);
  }

  /** Load the Graphics Command Center plugin and let Lord Slayer drive the palette. */
  private async startGraphicsTeam(): Promise<void> {
    if (this.graphicsStarted) return;
    if (isOffline()) {
      this.applyGraphicsTheme(loadSavedTheme() ?? OFFLINE_THEME, false);
      return;
    }
    if (!loadSavedTheme()) this.applyGraphicsTheme(OFFLINE_THEME, false);
    const gcc = await loadGraphicsPlugin();
    if (!gcc) return;
    this.gcc = gcc;
    this.graphicsStarted = true;
    if (!this.gccThemeBound) {
      document.addEventListener('gcc:theme', this.gccThemeHandler);
      this.gccThemeBound = true;
    }
    try {
      // The plugin's own timer will not go below 15s. Start it once, then drive
      // our own five-refreshes-a-minute cadence through refreshVisuals().
      await gcc.startVisuals({ category: 'tex-metal', every: 15000, limit: 8 });
      gcc.stopVisuals();
      if (gcc.refreshVisuals) {
        this.graphicsTimer = window.setInterval(() => {
          const refresh = gcc.refreshVisuals?.();
          if (refresh) void refresh.catch(() => undefined);
        }, 12000);
      }
    } catch {
      // A library outage leaves the saved permanent look in place.
    }
  }

  private stopGraphicsTeam(): void {
    if (this.graphicsTimer !== null) {
      window.clearInterval(this.graphicsTimer);
      this.graphicsTimer = null;
    }
    this.gcc?.stopVisuals();
    this.graphicsStarted = false;
  }

  /** Tokens from `gcc:theme` become scene colour and UI accents, and are stored permanently. */
  private applyGraphicsTheme(theme: GccTheme, persist: boolean): void {
    this.renderer.applyTheme(theme);
    const root = document.documentElement.style;
    root.setProperty('--gold', readableAccent(theme.tokens.accent));
    root.setProperty('--gold-dim', theme.tokens.muted);
    root.setProperty('--parchment', theme.tokens.text);
    root.setProperty('--gcc-surface', theme.tokens.surface);
    root.setProperty('--gcc-text', theme.tokens.text);
    root.setProperty('--gcc-primary', theme.tokens.primary);
    if (persist) saveTheme(theme);
  }

  /** Run Lord Slayer's due checks and announce any that were missed. */
  private async checkDesignBot(): Promise<void> {
    if (!this.world) return;
    this.lastVelaPoll = Date.now();
    try {
      const created = await refreshVela(this.world);
      if (!created.length) return;
      const checks = created.map((message) => velaSlotLabel(message.slot)).join(', ');
      this.hud.toast(`Lord Slayer filed ${created.length} check${created.length > 1 ? 's' : ''} (${checks}): ${created.length * 5} new graphics notes.`);
      this.hud.refreshStudio();
    } catch {
      // The studio never blocks the game.
    }
  }

  private cancelBuild(): void {
    if (!this.pendingBuild) {
      this.hud.toast('Nothing is being placed.');
      return;
    }
    this.pendingBuild = null;
    this.renderer.hideGhost();
    this.hud.toast('Construction cancelled.');
  }

  private loop = (): void => {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000 || 0);
    this.lastFrame = now;
    if (!this.world) return;
    // Vela's checks run on the real clock, even while the island is paused.
    if (!this.awayPaused && Date.now() - this.lastVelaPoll > 60000) void this.checkDesignBot();

    if (this.running && !this.awayPaused) {
      // Camera look
      const look = this.input.consumeLook();
      this.renderer.yaw -= look.x * 0.0026;
      this.renderer.pitch = clamp(this.renderer.pitch - look.y * 0.0022, -1.1, 0.85);

      this.movePlayer(dt);
      if (!this.world.paused && !this.world.finishing.active) this.advanceConstruction(dt);
      maintainMidas(this.world);
      this.renderer.playerLift = !this.renderer.portalMode && activePower(this.world, 'flying') ? 2.6 : 0;

      // Simulation ticks
      const speed = this.world.paused ? 0 : this.world.timeScale;
      if (speed > 0 && !this.world.finishing.active) {
        this.tickAccumulator += dt * 1000;
        const interval = TICK_MS / speed;
        let iterations = 0;
        while (this.tickAccumulator >= interval && iterations < 8) {
          this.tickAccumulator -= interval;
          iterations++;
          const tickResult = tickWorld(this.world, this.rng);
          if (tickResult.newDay) this.afterDay(tickResult.dayEvents);
        }
      } else if (this.world.finishing.active) {
        this.tickFinishing(dt);
      }

      this.updateAim();
      this.updateBuildGhost();
      this.renderer.sync(this.world);
      this.renderer.updateEnvironment(this.world, dt);
      this.renderer.updateCamera(this.world, this.player, dt);
      this.renderer.render();

      this.hudAccumulator += dt;
      if (this.hudAccumulator > 0.12) {
        this.hudAccumulator = 0;
        this.hud.update(this.world, this.player, this.aiming);
      }
      this.syncModalState();
      this.checkPlayerDeath();
    } else {
      this.renderer.updateEnvironment(this.world, dt);
      this.renderer.render();
    }
  };

  private get player(): NPC {
    const player = this.world.npcs.get(this.world.playerId);
    if (!player) throw new Error('Player missing from world');
    return player;
  }

  private movePlayer(dt: number): void {
    const player = this.player;
    if (!player.alive) return;
    const state = this.input.state;
    const inputLength = Math.min(1, Math.hypot(state.moveX, state.moveY));
    if (inputLength < 0.01) {
      this.moveVX = 0;
      this.moveVZ = 0;
      if (player.activity === 'walking') player.activity = 'standing';
      return;
    }
    const mobility = mobilityFactor(player.body);
    const injury = Object.values(player.body).some((p) => p.injuries.some((i) => i.severity >= 2));
    const powerSpeed = activePower(this.world, 'speed') ? 3 : 1;
    const speed = (state.sprint ? 11 : 6.4) * mobility * (injury ? 0.85 : 1) * (player.needs.fatigue < 20 ? 0.7 : 1) * powerSpeed;
    // Use the camera's real horizontal direction so UP always walks where you look.
    // The horizontal stick is reversed because the camera looks from behind the player.
    const forward = this.moveForward;
    this.renderer.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(Math.sin(this.renderer.yaw), 0, Math.cos(this.renderer.yaw));
    forward.normalize();
    const relative = cameraRelativeDirection(forward.x, forward.z, state.moveX, state.moveY);
    const dirX = relative.x;
    const dirZ = relative.z;
    const length = Math.hypot(dirX, dirZ) || 1;
    const targetX = (dirX / length) * speed * inputLength;
    const targetZ = (dirZ / length) * speed * inputLength;
    // A very short ramp keeps taps precise while removing the old instant lurch.
    const blend = 1 - Math.exp(-dt * 22);
    this.moveVX += (targetX - this.moveVX) * blend;
    this.moveVZ += (targetZ - this.moveVZ) * blend;
    const stepX = this.moveVX * dt;
    const stepZ = this.moveVZ * dt;

    if (this.renderer.portalMode) {
      this.renderer.moveInterior(stepX * 0.6, stepZ * 0.6);
      this.renderer.playerYaw = Math.atan2(this.moveVX, this.moveVZ);
      if (this.renderer.atInteriorDoor()) {
        this.hud.toast('Tap USE at the doorway to step outside.');
      }
      return;
    }

    // Slide along whichever axis is clear instead of sticking to coastlines and walls.
    const flying = activePower(this.world, 'flying');
    const startX = player.position.x;
    const startZ = player.position.z;
    const nextX = startX + stepX;
    const nextZ = startZ + stepZ;
    const canX = flying || (isWalkable(this.world.terrain, nextX, startZ)
      && !playerBlocked(this.world, nextX, startZ, startX, startZ));
    if (canX) player.position.x = nextX;
    else this.moveVX = 0;
    const canZ = flying || (isWalkable(this.world.terrain, player.position.x, nextZ)
      && !playerBlocked(this.world, player.position.x, nextZ, player.position.x, startZ));
    if (!canX && !canZ) {
      this.moveVZ = 0;
      return;
    }
    if (canZ) player.position.z = nextZ;
    else this.moveVZ = 0;
    player.activity = 'walking';
    this.renderer.playerYaw = Math.atan2(this.moveVX, this.moveVZ);
    // Travel drains fatigue slowly.
    player.needs.fatigue = clamp(player.needs.fatigue - dt * 0.35, 0, 100);
  }

  private updateAim(): void {
    if (this.renderer.portalMode) {
      this.aiming = null;
      this.renderer.hideGhost();
      return;
    }
    this.aiming = this.renderer.raycastNPC(this.world, 70);
  }

  private updateBuildGhost(): void {
    if (!this.pendingBuild) {
      this.renderer.hideGhost();
      return;
    }
    const pos = this.placementPoint();
    const valid = isWalkable(this.world.terrain, pos.x, pos.z);
    this.renderer.showGhost(this.world, pos, valid);
  }

  private gatherNode(): boolean {
    const world = this.world;
    const player = this.player;
    const node = world.resources
      .filter((r) => r.amount > 0)
      .map((r) => ({ r, d: Math.hypot(r.position.x - player.position.x, r.position.z - player.position.z) }))
      .filter((entry) => entry.d < 9)
      .sort((a, b) => a.d - b.d)[0];
    if (!node) return false;
    const skillMap: Record<string, string> = {
      wood: 'woodwork', stone: 'mining', iron: 'mining', copper: 'mining', gold: 'mining',
      clay: 'masonry', herbs: 'medicine', fish: 'fishing', game: 'hunting', peat: 'woodwork', salt: 'mining'
    };
    const good = node.r.type === 'game' ? 'meat' : node.r.type === 'peat' ? 'wood' : node.r.type;
    const skill = skillMap[node.r.type] ?? 'building';
    const yieldAmount = Math.max(1, Math.round(2 + (player.skills[skill] ?? 0) * 0.35));
    const taken = Math.min(node.r.amount, yieldAmount);
    node.r.amount -= taken;
    addItem(player, good, taken);
    trainSkill(player, skill, 1.2);
    this.hud.toast(`Gathered ${taken} ${RESOURCE_LABEL[node.r.type] ?? good}.`);
    return true;
  }

  private consume(good: string): void {
    const player = this.player;
    if ((player.inventory[good] ?? 0) < 1) return;
    const def = GOODS[good];
    player.inventory[good] = (player.inventory[good] ?? 0) - 1;
    if (player.inventory[good] <= 0) delete player.inventory[good];
    if (def?.nutrition) player.needs.hunger = Math.min(100, player.needs.hunger + def.nutrition * 2.4);
    if (def?.hydration) player.needs.thirst = Math.min(100, player.needs.thirst + def.hydration * 2);
    player.needs.happiness = Math.min(100, player.needs.happiness + 1);
    this.hud.toast(def?.nutrition ? `You eat the ${def.name.toLowerCase()}.` : `You drink the ${def?.name.toLowerCase() ?? good}.`);
  }

  private craft(recipeId: string): void {
    const recipes: Record<string, { name: string; kind: 'club' | 'spear' | 'bow' | 'sword' | 'musket'; material: 'wood' | 'stone' | 'iron' | 'steel'; cost: Record<string, number>; tech: number }> = {
      club: { name: 'wooden club', kind: 'club', material: 'wood', cost: { wood: 3 }, tech: 0 },
      spear: { name: 'stone spear', kind: 'spear', material: 'stone', cost: { wood: 4, stone: 2 }, tech: 0 },
      bow: { name: 'hunting bow', kind: 'bow', material: 'wood', cost: { wood: 5, cloth: 2 }, tech: 1 },
      sword: { name: 'iron sword', kind: 'sword', material: 'iron', cost: { iron: 4, wood: 2 }, tech: 3 },
      musket: { name: 'musket', kind: 'musket', material: 'steel', cost: { iron: 8, wood: 4 }, tech: 6 }
    };
    const recipe = recipes[recipeId];
    if (!recipe) return;
    const player = this.player;
    if (playerTechAge(this.world, player) < recipe.tech) {
      this.hud.toast(`You lack the technology for a ${recipe.name}.`);
      return;
    }
    for (const [good, amount] of Object.entries(recipe.cost)) {
      if ((player.inventory[good] ?? 0) < amount) {
        this.hud.toast(`Need ${amount} ${GOODS[good]?.name ?? good}.`);
        return;
      }
    }
    for (const [good, amount] of Object.entries(recipe.cost)) {
      player.inventory[good] = (player.inventory[good] ?? 0) - amount;
      if (player.inventory[good] <= 0) delete player.inventory[good];
    }
    player.weapon = makeWeapon(recipe.kind, recipe.material, this.rng);
    trainSkill(player, recipe.kind === 'bow' || recipe.kind === 'musket' ? 'mechanics' : 'smithing', 2);
    this.hud.toast(`You craft a ${recipe.name}.`);
  }

  private repairWeapon(): void {
    const player = this.player;
    if (!player.weapon) {
      this.hud.toast('You have no weapon to repair.');
      return;
    }
    if ((player.inventory.wood ?? 0) < 2) {
      this.hud.toast('Repairs need 2 timber.');
      return;
    }
    player.inventory.wood = (player.inventory.wood ?? 0) - 2;
    player.weapon.durability = Math.min(player.weapon.maxDurability, player.weapon.durability + player.weapon.maxDurability * 0.5);
    this.hud.toast(`You repair the ${player.weapon.name}.`);
  }

  private placementPoint(): { x: number; z: number } {
    const player = this.player;
    const yaw = this.renderer.yaw;
    const x = player.position.x + Math.sin(yaw) * 7.5;
    const z = player.position.z + Math.cos(yaw) * 7.5;
    return { x, z };
  }

  private attack(): void {
    const world = this.world;
    if (world.finishing.active) return;
    const player = this.player;
    if (!player.alive) return;
    if (player.attackCooldown > 0) return;
    player.attackCooldown = 9;

    let target = this.aiming;
    if (!target) {
      // Melee assist: closest hostile NPC in front within reach.
      const weapon = weaponOf(player);
      target = [...world.npcs.values()]
        .filter((n) => n.alive && !n.isPlayer && n.id !== player.id)
        .map((n) => ({ n, d: Math.hypot(n.position.x - player.position.x, n.position.z - player.position.z) }))
        .filter((entry) => entry.d <= weapon.reach + 0.6)
        .sort((a, b) => a.d - b.d)[0]?.n ?? null;
    }
    if (!target) {
      this.hud.toast(this.aiming ? 'Target is out of reach.' : 'Nothing within reach.');
      return;
    }
    if (target.id === world.designBotId) {
      this.hud.toast('Lord Slayer does not fight. Talk to him inside the cottage.');
      return;
    }

    const result = resolveAttack(world, player, target, this.rng, {
      aimedPart: this.selectedPart,
      aimedSide: this.rng.chance(0.5) ? 'L' : 'R',
      power: activePower(world, 'strength') ? 5 : 1,
      defenderBlocking: this.input.state.blocking
    });
    if (!result.hit && !result.blocked) {
      this.hud.toast(result.message);
    } else if (result.blocked) {
      this.hud.toast(result.message);
    } else {
      this.hud.toast(result.message);
      if (result.weaponBroke) {
        this.hud.toast('Your weapon is broken. It is barely better than a club.');
      }
    }
    if (result.hit && target.factionId) {
      adjustStanding(world, target.factionId, -9, `You attacked ${target.name}`);
    }
    if (result.hit && target.alive && !world.finishing.active) {
      const check = canFinish(world, player, target);
      if (check.ok && (world.cheats?.lucifer || target.health <= 24 || result.qualifiesFinisher)) {
        beginFinishing(world, player, target);
        this.hud.showFinishingChoice(world);
        this.lastModalState = 'choice';
      }
    }
  }

  private tryFinish(): void {
    const world = this.world;
    if (world.finishing.active) return;
    const target = this.aiming;
    const player = this.player;
    if (!target) {
      this.hud.toast('Look at a downed opponent to finish them.');
      return;
    }
    if (!beginFinishing(world, player, target)) {
      const check = canFinish(world, player, target);
      this.hud.toast(`No finishing opening: ${check.reason.toLowerCase()}.`);
      return;
    }
    this.hud.showFinishingChoice(world);
    this.lastModalState = 'choice';
  }

  private choose(option: 'wound' | 'kill'): void {
    if (!chooseOutcome(this.world, option)) return;
    this.hud.hideModal();
    this.lastModalState = 'cinematic';
  }

  private tickFinishing(dt: number): void {
    const world = this.world;
    tickFinishing(world, dt, this.rng);
    if (world.finishing.active) {
      if (world.finishing.phase === 'choosing') {
        this.hud.showFinishingChoice(world);
      } else {
        this.hud.showCinematicCaption(world);
      }
    }
    this.hud.setReticleVisible(false);
  }

  private syncModalState(): void {
    const finishing = this.world.finishing;
    if (!finishing.active) {
      if (this.lastModalState !== 'none') {
        this.hud.hideModal();
        this.lastModalState = 'none';
        this.hud.setReticleVisible(this.world.settings.showReticle);
      }
      return;
    }
    if (finishing.phase === 'choosing') {
      this.hud.showFinishingChoice(this.world);
      this.lastModalState = 'choice';
    } else {
      this.hud.showCinematicCaption(this.world);
      this.lastModalState = 'cinematic';
    }
  }

  private checkPlayerDeath(): void {
    const player = this.player;
    if (player.alive || this.deathShown) return;
    this.deathShown = true;
    this.hud.showDeath(this.world, player, () => this.continueAfterDeath());
  }

  private continueAfterDeath(): void {
    const player = newPlayerCharacter(this.world, this.rng);
    this.deathShown = false;
    this.hud.hideModal();
    this.renderer.sync(this.world);
    this.hud.setWorld(this.world);
    this.hud.toast(`${player.firstName} steps ashore into a world that remembers your last life.`);
    void player;
  }

  private interact(): void {
    const world = this.world;
    if (world.finishing.active) return;
    if (this.renderer.portalMode) {
      if (this.renderer.atInteriorDoor()) {
        this.exitInterior();
      } else {
        this.hud.toast('Walk to the doorway to leave.');
      }
      return;
    }
    const player = this.player;

    const slayer = world.designBotId ? world.npcs.get(world.designBotId) : null;
    if (slayer && Math.hypot(slayer.position.x - player.position.x, slayer.position.z - player.position.z) < 6) {
      this.hud.togglePanel('studio');
      return;
    }

    const corpse = world.corpses
      .map((c) => ({ c, d: Math.hypot(c.position.x - player.position.x, c.position.z - player.position.z) }))
      .filter((entry) => entry.d < 3.5)
      .sort((a, b) => a.d - b.d)[0];
    if (corpse) {
      this.collectCorpse(corpse.c.id);
      return;
    }

    if (this.gatherNode()) return;

    const market = world.markets
      .map((m) => ({ m, d: Math.hypot(m.position.x - player.position.x, m.position.z - player.position.z) }))
      .filter((entry) => entry.d < 8)
      .sort((a, b) => a.d - b.d)[0];
    if (market) {
      this.hud.togglePanel('market', market.m.id);
      return;
    }

    const npc = [...world.npcs.values()]
      .filter((n) => n.alive && !n.isPlayer && n.id !== player.id)
      .map((n) => ({ n, d: Math.hypot(n.position.x - player.position.x, n.position.z - player.position.z) }))
      .filter((entry) => entry.d < 4.5)
      .sort((a, b) => a.d - b.d)[0];
    if (npc) {
      this.hud.togglePanel('npc', npc.n.id);
      return;
    }

    const building = world.buildings
      .map((b) => ({ b, d: Math.hypot(b.position.x - player.position.x, b.position.z - player.position.z) }))
      .filter((entry) => entry.d < 5)
      .sort((a, b) => a.d - b.d)[0];
    if (building) {
      this.enterBuilding(building.b.id);
      return;
    }
    this.hud.toast('Nothing here to interact with.');
  }

  private enterBuilding(buildingId: string): void {
    const world = this.world;
    const building = world.buildings.find((b) => b.id === buildingId);
    if (!building) return;
    if (!building.built) {
      this.hud.toast('That structure is still under construction.');
      return;
    }
    const def = BUILDING_BY_ID.get(building.defId);
    if (!def) return;
    world.currentInteriorId = building.id;
    this.renderer.enterInterior(building, def, world);
    this.hud.togglePanel('interior');
    this.hud.toast(`You enter ${building.name}.`);
  }

  private exitInterior(): void {
    const world = this.world;
    if (!world.currentInteriorId) {
      this.renderer.exitInterior();
      return;
    }
    const building = world.buildings.find((b) => b.id === world.currentInteriorId);
    world.currentInteriorId = null;
    this.renderer.exitInterior();
    this.hud.closePanels();
    if (building) {
      // Step out just in front of the door.
      const player = this.player;
      const offset = 3.4;
      const x = building.position.x + Math.sin(building.rotation) * offset;
      const z = building.position.z + Math.cos(building.rotation) * offset;
      if (isWalkable(world.terrain, x, z)) {
        player.position.x = x;
        player.position.z = z;
      }
    }
  }

  private beginBuild(defId: string): void {
    const def = BUILDING_BY_ID.get(defId);
    if (!def) return;
    this.pendingBuild = def;
    this.hud.closePanels();
    this.hud.toast(`Placing ${def.name}. Aim with the camera and tap ATTACK. Cancel it from the menu.`);
  }

  private advanceConstruction(dt: number): void {
    const player = this.player;
    const { completed, staged } = advancePlayerConstruction(this.world, player.id, dt);
    for (const entry of staged) {
      this.hud.toast(`${entry.building.name}: ${entry.stage} stage.`);
    }
    for (const building of completed) {
      const def = BUILDING_BY_ID.get(building.defId);
      if (def?.category === 'Residential' && !player.homeId) player.homeId = building.id;
      pushLog(this.world, `Construction finished: ${building.name}.`, 'good');
      this.hud.toast(`${building.name} is complete.`);
      saveWorld(this.world);
    }
  }

  private handleCheat(code: string): void {
    const result = applyCheat(this.world, this.player, code, this.rng);
    this.hud.toast(result.message);
    if (!result.ok) return;
    ensureCheats(this.world);
    this.renderer.sync(this.world);
    saveWorld(this.world);
  }

  /** Cheat status can be switched off without erasing bloodline unlocks or built things. */
  private handleCheatToggle(key: CheatKey): void {
    if (this.world.cheats?.[key]) {
      this.hud.toast(disableCheat(this.world, key).message);
    } else {
      this.hud.toast(applyCheat(this.world, this.player, key, this.rng).message);
    }
    this.renderer.sync(this.world);
    saveWorld(this.world);
  }

  private handlePowerToggle(key: PowerKey): void {
    const result = togglePowerState(this.world, key);
    this.hud.toast(result.message);
    if (key === 'flying' && !result.active) this.renderer.playerLift = 0;
    this.renderer.sync(this.world);
    saveWorld(this.world);
  }

  /** TELEPORTATION: a short blink in the direction the camera is looking. */
  private blink(): void {
    if (!activePower(this.world, 'teleport')) {
      this.hud.toast('Teleportation is not in your blood yet.');
      return;
    }
    if (this.renderer.portalMode) {
      this.hud.toast('You cannot blink through a roof.');
      return;
    }
    const player = this.player;
    const yaw = this.renderer.yaw;
    let x = player.position.x;
    let z = player.position.z;
    for (let step = 2; step <= 30; step += 2) {
      const nx = player.position.x + Math.sin(yaw) * step;
      const nz = player.position.z + Math.cos(yaw) * step;
      if (!isWalkable(this.world.terrain, nx, nz) && !activePower(this.world, 'flying')) break;
      x = nx;
      z = nz;
    }
    const distance = Math.hypot(x - player.position.x, z - player.position.z);
    if (distance < 2) {
      this.hud.toast('The way ahead is blocked.');
      return;
    }
    player.position.x = x;
    player.position.z = z;
    this.hud.toast(`You blink ${Math.round(distance)} metres.`);
  }

  private placeBuilding(): void {
    if (!this.pendingBuild) return;
    const def = this.pendingBuild;
    const position = this.placementPoint();
    const result = placePlayerBuilding(this.world, this.player, def, position, this.rng);
    if (!result.ok) {
      this.hud.toast(result.reason ?? 'Cannot build here.');
      return;
    }
    this.pendingBuild = null;
    this.renderer.hideGhost();
    this.renderer.sync(this.world);
    this.hud.toast(`${def.name} begun. Foundations are laid; it will rise over 30 seconds.`);
  }

  private buy(good: string, quantity: number): void {
    const market = this.nearbyMarket();
    if (!market) {
      this.hud.toast('No market nearby.');
      return;
    }
    const result = buyFromMarket(this.world, this.player, market, good, quantity);
    this.hud.toast(result.ok ? `Bought ${quantity} ${GOODS[good]?.name ?? good} for ${result.cost}` : result.reason ?? 'Purchase failed.');
  }

  private sell(good: string, quantity: number): void {
    const market = this.nearbyMarket();
    if (!market) {
      this.hud.toast('No market nearby.');
      return;
    }
    const result = sellToMarket(this.world, this.player, market, good, quantity);
    this.hud.toast(result.ok ? `Sold ${quantity} ${GOODS[good]?.name ?? good} for ${result.revenue}` : result.reason ?? 'Sale failed.');
  }

  private nearbyMarket() {
    const player = this.player;
    return this.world.markets
      .map((m) => ({ m, d: Math.hypot(m.position.x - player.position.x, m.position.z - player.position.z) }))
      .filter((entry) => entry.d < 26)
      .sort((a, b) => a.d - b.d)[0]?.m ?? null;
  }

  private hire(): void {
    const player = this.player;
    const business = this.world.businesses.find((b) => b.ownerId === player.id);
    if (!business) {
      this.hud.toast('You do not own a business.');
      return;
    }
    const candidate = [...this.world.npcs.values()]
      .filter((n) => n.alive && !n.isPlayer && n.id !== this.world.designBotId && !n.businessId)
      .map((n) => ({ n, d: Math.hypot(n.position.x - player.position.x, n.position.z - player.position.z) }))
      .filter((entry) => entry.d < 30)
      .sort((a, b) => a.d - b.d)[0]?.n;
    if (!candidate) {
      this.hud.toast('Nobody nearby is looking for work.');
      return;
    }
    if (player.money < 2) {
      this.hud.toast('Hiring costs 2 coin up front.');
      return;
    }
    player.money -= 2;
    if (hireEmployee(this.world, business, candidate, 1.2)) {
      this.hud.toast(`${candidate.name} now works at ${business.name}.`);
    } else {
      this.hud.toast('Could not hire them.');
    }
  }

  private fire(npcId: string): void {
    const business = this.world.businesses.find((b) => b.ownerId === this.player.id);
    if (!business) return;
    business.employees = business.employees.filter((id) => id !== npcId);
    const npc = this.world.npcs.get(npcId);
    if (npc) {
      npc.businessId = null;
      npc.occupation = 'unemployed';
    }
    this.hud.toast('Worker dismissed.');
  }

  private startBusiness(buildingId: string): void {
    const player = this.player;
    const building = this.world.buildings.find((b) => b.id === buildingId);
    if (!building || building.ownerId !== player.id) return;
    const def = BUILDING_BY_ID.get(building.defId);
    const business = openBusiness(this.world, player, buildingId, `${player.firstName}'s ${def?.category ?? 'shop'}`);
    this.hud.toast(business ? `${business.name} is open for trade.` : 'Could not open a business.');
  }

  private advertiseRent(buildingId: string): void {
    const world = this.world;
    const building = world.buildings.find((b) => b.id === buildingId);
    if (!building) return;
    const tenant = [...world.npcs.values()]
      .filter((n) => n.alive && !n.isPlayer && !n.homeId)
      .map((n) => ({ n, d: Math.hypot(n.position.x - building.position.x, n.position.z - building.position.z) }))
      .filter((entry) => entry.d < 90)
      .sort((a, b) => a.d - b.d)[0]?.n;
    if (!tenant) {
      this.hud.toast('Nobody nearby needs a home.');
      return;
    }
    tenant.homeId = building.id;
    building.tenantId = tenant.id;
    building.rent = 0.5;
    tenant.history.push(`Rented ${building.name} for ${building.rent} coin a day.`);
    this.hud.toast(`${tenant.name} will rent ${building.name} for ${building.rent} coin a day.`);
  }

  private collectCorpse(corpseId: string): void {
    const world = this.world;
    const corpse = world.corpses.find((c) => c.id === corpseId);
    if (!corpse) return;
    const player = this.player;
    for (const [good, qty] of Object.entries(corpse.inventory)) {
      addItem(player, good, qty);
    }
    player.money += corpse.money;
    world.corpses = world.corpses.filter((c) => c.id !== corpseId);
    this.hud.toast(`Recovered the belongings of ${corpse.name}.`);
  }

  private applySetting(
    key: 'gore' | 'slowMotion' | 'distantSim' | 'firstPerson' | 'shadows',
    value: number | boolean
  ): void {
    if (key === 'gore') this.world.settings.gore = Number(value);
    if (key === 'slowMotion') this.world.settings.slowMotion = Number(value);
    if (key === 'distantSim') this.world.settings.distantSim = Boolean(value);
    if (key === 'firstPerson') this.world.settings.firstPerson = Boolean(value);
    if (key === 'shadows') this.world.settings.shadows = Boolean(value);
  }

  private afterDay(events: string[]): void {
    for (const event of events.slice(0, 3)) {
      this.hud.toast(event);
    }
    if (events.length) {
      this.hud.setWorld(this.world);
    }
  }
}

const game = new Game();
game.start();

// Expose a tiny debug surface for the browser console and automated smoke tests.
(window as unknown as { __kotfi?: unknown }).__kotfi = {
  get world() { return (window as unknown as { __world?: World }).__world; },
  tick: () => TICKS_PER_DAY,
  minutesPerTick: MINUTES_PER_TICK,
  priceOf,
  playerTechAge
};
void THREE;
void SEA_LEVEL;
void heightAt;
void priceOf;
