import { TARGETABLE, describePart, REGIONS, activeInjuries, bodyParts } from '../core/anatomy';
import type { BodyRegion } from '../core/anatomy';
import { BUILDING_CATEGORIES, BUILDING_DEFS, BUILDING_BY_ID, AGE_LABELS } from '../data/buildings';
import { GOODS, weaponCondition } from '../data/goods';
import type { BuildingDef, Faction, MemoryRecord, NPC, PowerKey, World } from '../core/types';
import { priceOf, playerLedger, estimateValue } from '../sim/economy';
import { playerTechAge } from '../sim/simulation';
import { membersOf, factionStrength } from '../sim/factions';
import { artDirection, MATERIAL_LABELS, type MaterialKey } from '../render/artDirection';
import { isEnabled as graphicsEnabled, setEnabled as setGraphicsEnabled } from '../sim/designBot';
import { CHEAT_CODES, MIDAS_AMOUNT, POWER_META, type CheatKey } from '../sim/cheats';
import type { CheatCode } from '../core/types';
import {
  GAME_REFERENCE_CATEGORIES,
  fetchBankStats,
  searchReferences,
  type BankStats,
  type ReferenceRecord
} from '../data/memoryBank';
import { regionAt } from '../world/worldgen';
import type { DesignProposal } from '../sim/designBot';
import {
  SLAYER_SCHEDULE,
  applyProposal as applyVelaProposal,
  dismissProposal as dismissVelaProposal,
  messages as velaMessages,
  slotLabel,
  unreadCount as velaUnreadCount
} from '../sim/designBot';

export interface HUDActions {
  onSelectTargetPart(part: BodyRegion | null): void;
  onFinishNow(): void;
  onChooseFinishing(option: 'wound' | 'kill'): void;
  onSave(): void;
  onLoad(): void;
  onInstall(): void;
  onLogout(): void;
  onNewIsland(): void;
  onNewGame(seed: number | null): void;
  onSpeed(speed: number): void;
  onBuild(defId: string): void;
  onBuy(good: string, quantity: number): void;
  onSell(good: string, quantity: number): void;
  onInspect(npcId: string): void;
  onEnterBuilding(id: string): void;
  onExitInterior(): void;
  onHire(): void;
  onFire(npcId: string): void;
  onToggleBusiness(): void;
  onNewCharacter(): void;
  onSetSetting(key: 'gore' | 'slowMotion' | 'distantSim' | 'firstPerson' | 'shadows', value: number | boolean): void;
  onCollectCorpse(id: string): void;
  onOpenBusiness(buildingId: string): void;
  onRentBuilding(buildingId: string): void;
  onAttackNearest(): void;
  onConsume(good: string): void;
  onCraft(recipeId: string): void;
  onRepair(): void;
  onCheat(code: string): void;
  onToggleCheat(key: CheatKey): void;
  onTogglePower(key: PowerKey): void;
  onBlink(): void;
}

export type PanelKind =
  | 'none' | 'character' | 'injuries' | 'memories' | 'factions' | 'history'
  | 'map' | 'build' | 'ledger' | 'inventory' | 'market' | 'npc' | 'interior' | 'settings'
  | 'references' | 'studio' | 'powers' | 'cheats';

export class HUD {
  private hud: HTMLElement;
  private panels: HTMLElement;
  private modal: HTMLElement;
  private toasts: HTMLElement;
  private reticle: HTMLElement;
  private actions: HUDActions;

  private openPanelKind: PanelKind = 'none';
  private openPanelContext: string | null = null;
  private selectedPart: BodyRegion | null = null;
  private toastTimer: number | null = null;
  private mapCanvas: HTMLCanvasElement | null = null;
  private panelScrollTop = 0;
  private resetPanelScroll = false;
  private currentBuildCategory = BUILDING_CATEGORIES[0];
  private currentBuildAge = 0;
  private buildQuery = '';
  private lastModalSignature = '';
  private refResults: ReferenceRecord[] = [];
  private refStats: BankStats | null = null;
  private refLoading = false;
  private refError: string | null = null;
  private refTotal = 0;
  private refPolicy = '';
  private refCategory = 'tex-wood';
  private refColor = '';
  private refQuery = '';
  private refLoadedOnce = false;
  private accountName = '';

  constructor(
    elements: { hud: HTMLElement; panels: HTMLElement; modal: HTMLElement; toasts: HTMLElement; reticle: HTMLElement },
    actions: HUDActions
  ) {
    this.hud = elements.hud;
    this.panels = elements.panels;
    this.modal = elements.modal;
    this.toasts = elements.toasts;
    this.reticle = elements.reticle;
    this.actions = actions;
    this.buildStaticHud();
    this.bindHUDActions();
  }

  private buildStaticHud(): void {
    this.hud.innerHTML = `
      <div class="hud-top">
        <div class="hud-calendar">
          <div class="calendar-day" id="hud-day">Day 1</div>
          <div class="calendar-meta" id="hud-meta">Spring · 07:00 · Clear</div>
        </div>
        <div class="hud-world" id="hud-world"></div>
      </div>
      <button class="hud-bot" id="hud-bot" data-panel="studio">Slayer <b id="hud-bot-count">0</b></button>
      <button class="hud-powers" id="hud-powers" data-panel="powers" hidden>Powers</button>
      <button class="hud-cheats" id="hud-cheats" data-panel="cheats" hidden>Cheats <b id="hud-cheats-count">0</b></button>
      <div class="hud-log" id="hud-log"></div>
      <div class="hud-target" id="hud-target" hidden></div>
      <div class="hud-bottom">
        <div class="hud-vitals">
          <div class="vital-name" id="hud-name">Wanderer</div>
          <div class="bar-row"><span>Health</span><div class="bar"><i id="bar-health"></i></div><b id="val-health">100</b></div>
          <div class="bar-row"><span>Hunger</span><div class="bar"><i id="bar-hunger"></i></div><b id="val-hunger">100</b></div>
          <div class="bar-row"><span>Thirst</span><div class="bar"><i id="bar-thirst"></i></div><b id="val-thirst">100</b></div>
          <div class="bar-row"><span>Fatigue</span><div class="bar"><i id="bar-fatigue"></i></div><b id="val-fatigue">100</b></div>
          <div class="vital-secondary" id="hud-secondary"></div>
        </div>
        <div class="hud-combat">
          <div class="combat-weapon" id="hud-weapon">Bare hands</div>
          <div class="target-part" id="hud-target-part"></div>
        </div>
      </div>
      <div class="hud-hint" id="hud-hint">Drag the world to look around. The island menu holds every panel.</div>
    `;
  }

  private bindHUDActions(): void {
    this.hud.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-panel]');
      if (!button) return;
      this.togglePanel(button.dataset.panel as PanelKind);
    });
  }

  private triggerInteract(): void {
    window.dispatchEvent(new CustomEvent('kotfi:interact'));
  }

  setAccount(username: string): void {
    this.accountName = username;
    if (this.openPanelKind === 'settings') this.renderPanel();
  }

  refreshReferences(): void {
    if (this.openPanelKind === 'references') this.renderPanel();
  }

  refreshStudio(): void {
    if (this.openPanelKind === 'studio') this.renderPanel();
  }

  setReticleVisible(visible: boolean, specialized = false): void {
    this.reticle.hidden = !visible;
    this.reticle.classList.toggle('targeted', specialized);
  }

  toast(message: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    this.toasts.appendChild(el);
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      el.classList.add('fade');
      window.setTimeout(() => el.remove(), 500);
    }, 3200);
    while (this.toasts.children.length > 4) this.toasts.removeChild(this.toasts.firstChild!);
  }

  toggleTargetPicker(): void {
    const container = document.getElementById('hud-target-part');
    if (!container) return;
    if (container.dataset.open === '1') {
      container.dataset.open = '0';
      container.innerHTML = '';
      return;
    }
    container.dataset.open = '1';
    const buttons = TARGETABLE.map((part) => {
      const info = REGIONS[part];
      return `<button class="part-btn ${this.selectedPart === part ? 'active' : ''}" data-part="${part}">${info.label}</button>`;
    }).join('');
    container.innerHTML = `
      <div class="target-picker">
        <div class="picker-title">AIM FOR — success is never guaranteed</div>
        <div class="picker-grid">${buttons}</div>
        <button class="part-btn clear" data-part="">Aim normally</button>
      </div>
    `;
    container.querySelectorAll('[data-part]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const raw = (btn as HTMLElement).dataset.part as BodyRegion | '';
        this.selectedPart = raw === '' ? null : raw;
        this.actions.onSelectTargetPart(this.selectedPart);
        container.dataset.open = '0';
        container.innerHTML = '';
        this.toast(this.selectedPart ? `Targeting the ${REGIONS[this.selectedPart].label.toLowerCase()}` : 'Aiming normally');
      });
    });
  }

  update(world: World, player: NPC, aiming: NPC | null): void {
    const dayEl = document.getElementById('hud-day');
    const metaEl = document.getElementById('hud-meta');
    const worldEl = document.getElementById('hud-world');
    if (!dayEl || !metaEl || !worldEl) return;
    const hour = Math.floor(world.minutes / 60);
    const minute = Math.floor(world.minutes % 60);
    dayEl.textContent = `Day ${world.day}`;
    metaEl.textContent = `${world.season} · ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} · ${world.weather.current}`;
    const living = [...world.npcs.values()].filter((n) => n.alive && !n.isPlayer && n.id !== world.designBotId).length;
    const wars = world.factions.reduce((sum, f) => sum + f.wars.length, 0) / 2;
    worldEl.innerHTML = `
      <span><b>${living}</b> islanders</span>
      <span><b>${world.buildings.filter((b) => b.built).length}</b> buildings</span>
      <span class="${wars > 0 ? 'war' : ''}"><b>${wars}</b> wars</span>
      <span><b>${world.deaths}</b> dead</span>
      <span><b>${world.births}</b> born</span>
    `;

    this.setBar('health', player.health, player.maxHealth);
    this.setBar('hunger', player.needs.hunger, 100);
    this.setBar('thirst', player.needs.thirst, 100);
    this.setBar('fatigue', player.needs.fatigue, 100);
    const nameEl = document.getElementById('hud-name');
    if (nameEl) {
      const region = regionAt(world.terrain, player.position.x, player.position.z);
      nameEl.innerHTML = `${player.name} <small>${player.occupation} · ${region.name}</small>`;
    }
    const secondary = document.getElementById('hud-secondary');
    if (secondary) {
      const injuries = activeInjuries(player.body).filter((i) => i.severity > 0);
      const missing = bodyParts(player.body).filter((p) => p.dismembered);
      secondary.innerHTML = `
        <span class="coin">${Math.round(player.money)} coin</span>
        <span>${player.weapon ? `${player.weapon.name} · ${weaponCondition(player.weapon.durability, player.weapon.maxDurability)}` : 'Unarmed'}</span>
        <span class="${injuries.length ? 'danger' : ''}">${injuries.length} injuries${missing.length ? ` · ${missing.length} missing parts` : ''}</span>
        <span>home: ${player.homeId ? 'yes' : 'none'}</span>
      `;
    }
    const weaponEl = document.getElementById('hud-weapon');
    if (weaponEl) {
      weaponEl.innerHTML = player.weapon
        ? `${player.weapon.name} <small>${Math.round(player.weapon.durability)}/${player.weapon.maxDurability} · reach ${player.weapon.reach.toFixed(1)}</small>`
        : 'Bare hands';
    }
    const targetEl = document.getElementById('hud-target');
    if (targetEl) {
      if (aiming) {
        targetEl.hidden = false;
        const dist = Math.hypot(aiming.position.x - player.position.x, aiming.position.z - player.position.z);
        const faction = aiming.factionId ? world.factions.find((f) => f.id === aiming.factionId) : null;
        const missing = bodyParts(aiming.body).filter((p) => p.dismembered).length;
        targetEl.innerHTML = `
          <b>${aiming.name}</b>
          <span>${aiming.occupation}${faction ? ` · ${faction.adjective}` : ''}</span>
          <span>${Math.round(aiming.health)} hp · ${dist.toFixed(1)}m</span>
          <span>${aiming.inCombat ? 'FIGHTING' : aiming.activity}${missing ? ` · ${missing} missing parts` : ''}</span>
        `;
      } else {
        targetEl.hidden = true;
      }
    }
    const cheatsRevealed = Boolean(world.cheats?.revealed);
    const cheatButton = document.getElementById('hud-cheats');
    if (cheatButton) cheatButton.hidden = !cheatsRevealed;
    const powersButton = document.getElementById('hud-powers');
    if (powersButton) {
      powersButton.hidden = !(world.cheats?.powersUnlocked || (world.cheats?.bloodline?.length ?? 0) > 0);
    }
    const cheatCount = document.getElementById('hud-cheats-count');
    if (cheatCount) {
      const active = (['midas', 'slumlord', 'ages', 'lucifer', 'people', 'crownme'] as CheatKey[])
        .filter((key) => Boolean(world.cheats?.[key]));
      cheatCount.textContent = String(active.length);
      cheatCount.parentElement?.classList.toggle('active', active.length > 0);
      const button = document.getElementById('hud-cheats');
      if (button) button.title = active.length ? `Active: ${active.join(', ').toUpperCase()}` : 'No cheats active';
    }
    const botCount = document.getElementById('hud-bot-count');
    if (botCount) {
      const count = velaUnreadCount();
      botCount.textContent = String(count);
      botCount.classList.toggle('zero', count === 0);
    }
    const targetPart = document.getElementById('hud-target-part');
    if (targetPart && this.selectedPart) {
      targetPart.dataset.selected = describePart(this.selectedPart);
    }
    const logEl = document.getElementById('hud-log');
    if (logEl) {
      logEl.innerHTML = world.log.slice(0, 7)
        .map((entry) => `<div class="log-line ${entry.tone}"><span>D${Math.floor(entry.tick / 240) + 1}</span>${entry.text}</div>`)
        .join('');
    }
    const hint = document.getElementById('hud-hint');
    if (hint) {
      hint.style.display = world.currentInteriorId ? 'block' : 'none';
      hint.textContent = world.currentInteriorId ? 'You are inside. Tap USE at the doorway to leave.' : '';
    }
    this.updateOpenPanel(world, player);
  }

  private setBar(id: string, value: number, max: number): void {
    const bar = document.getElementById(`bar-${id}`);
    const label = document.getElementById(`val-${id}`);
    const ratio = Math.max(0, Math.min(1, value / max));
    if (bar) {
      bar.style.width = `${ratio * 100}%`;
      bar.className = ratio < 0.25 ? 'critical' : ratio < 0.5 ? 'warn' : '';
    }
    if (label) label.textContent = String(Math.round(value));
  }

  togglePanel(kind: PanelKind, context?: string): void {
    const world = (window as unknown as { __world?: World }).__world;
    if (kind === 'cheats' && !world?.cheats?.revealed) return;
    if (kind === 'powers' && !(world?.cheats?.powersUnlocked || (world?.cheats?.bloodline?.length ?? 0) > 0)) return;
    if (this.openPanelKind === kind && this.openPanelContext === (context ?? null)) {
      this.closePanels();
      return;
    }
    window.dispatchEvent(new CustomEvent('kotfi:release-lock'));
    if (kind === 'references') this.ensureReferenceData();
    this.openPanelKind = kind;
    this.openPanelContext = context ?? null;
    this.panelScrollTop = 0;
    this.resetPanelScroll = true;
    this.panels.classList.add('open');
    this.renderPanel();
  }

  closePanels(): void {
    this.openPanelKind = 'none';
    this.openPanelContext = null;
    this.panelScrollTop = 0;
    this.resetPanelScroll = false;
    this.panels.classList.remove('open');
    this.panels.innerHTML = '';
  }

  get panelOpen(): boolean {
    return this.openPanelKind !== 'none';
  }

  private updateOpenPanel(world: World, player: NPC): void {
    if (this.openPanelKind === 'none') return;
    // Light refresh for live panels only.
    if (['character', 'injuries', 'ledger', 'interior', 'market', 'npc', 'inventory'].includes(this.openPanelKind)) {
      this.renderPanel();
    }
  }

  private panelShell(title: string, body: string, subtitle = ''): string {
    return `
      <div class="panel-head">
        <div>
          <h2>${title}</h2>
          ${subtitle ? `<p>${subtitle}</p>` : ''}
        </div>
        <button class="panel-close" id="panel-close">✕</button>
      </div>
      <div class="panel-body">${body}</div>
    `;
  }

  private renderPanel(): void {
    const world = (window as unknown as { __world?: World }).__world;
    if (!world) return;
    const player = world.npcs.get(world.playerId);
    if (!player) return;
    let html = '';
    switch (this.openPanelKind) {
      case 'character': html = this.renderCharacter(world, player); break;
      case 'injuries': html = this.renderInjuries(player); break;
      case 'memories': html = this.renderMemories(player); break;
      case 'factions': html = this.renderFactions(world); break;
      case 'history': html = this.renderHistory(world); break;
      case 'map': html = this.renderMap(world, player); break;
      case 'build': html = this.renderBuild(world, player); break;
      case 'ledger': html = this.renderLedger(world, player); break;
      case 'inventory': html = this.renderInventory(world, player); break;
      case 'market': html = this.renderMarket(world, player); break;
      case 'npc': html = this.renderNPC(world, this.openPanelContext); break;
      case 'interior': html = this.renderInterior(world, player); break;
      case 'settings': html = this.renderSettings(world); break;
      case 'references': html = this.renderReferences(); break;
      case 'studio': html = this.renderStudio(); break;
      case 'powers': html = this.renderPowers(world); break;
      case 'cheats': html = this.renderCheats(world); break;
      default: html = '';
    }
    const previousBody = this.panels.querySelector<HTMLElement>('.panel-body');
    const scrollTop = this.resetPanelScroll ? 0 : (previousBody?.scrollTop ?? this.panelScrollTop);
    this.resetPanelScroll = false;
    this.panels.innerHTML = html;
    const nextBody = this.panels.querySelector<HTMLElement>('.panel-body');
    if (nextBody) nextBody.scrollTop = scrollTop;
    this.panelScrollTop = scrollTop;
    document.getElementById('panel-close')?.addEventListener('click', () => this.closePanels());
    this.bindPanelEvents(world, player);
    if (this.openPanelKind === 'map') this.drawMap(world, player);
  }

  private bindPanelEvents(world: World, player: NPC): void {
    this.panels.querySelectorAll<HTMLElement>('[data-npc]').forEach((el) => {
      el.addEventListener('click', () => this.togglePanel('npc', el.dataset.npc!));
    });
    this.panels.querySelectorAll<HTMLElement>('[data-build]').forEach((el) => {
      el.addEventListener('click', () => this.actions.onBuild(el.dataset.build!));
    });
    this.panels.querySelectorAll<HTMLElement>('[data-cat]').forEach((el) => {
      el.addEventListener('click', () => {
        this.currentBuildCategory = el.dataset.cat!;
        this.renderPanel();
      });
    });
    this.panels.querySelectorAll<HTMLElement>('[data-age]').forEach((el) => {
      el.addEventListener('click', () => {
        this.currentBuildAge = Number(el.dataset.age);
        this.renderPanel();
      });
    });
    this.panels.querySelectorAll<HTMLElement>('[data-buy]').forEach((el) => {
      el.addEventListener('click', () => this.actions.onBuy(el.dataset.buy!, Number(el.dataset.qty ?? 1)));
    });
    this.panels.querySelectorAll<HTMLElement>('[data-sell]').forEach((el) => {
      el.addEventListener('click', () => this.actions.onSell(el.dataset.sell!, Number(el.dataset.qty ?? 1)));
    });
    this.panels.querySelectorAll<HTMLElement>('[data-enter]').forEach((el) => {
      el.addEventListener('click', () => {
        this.actions.onEnterBuilding(el.dataset.enter!);
        this.closePanels();
      });
    });
    this.panels.querySelectorAll<HTMLElement>('[data-recruit]').forEach((el) => {
      el.addEventListener('click', () => this.actions.onHire());
    });
    this.panels.querySelectorAll<HTMLElement>('[data-fire]').forEach((el) => {
      el.addEventListener('click', () => this.actions.onFire(el.dataset.fire!));
    });
    this.panels.querySelectorAll<HTMLElement>('[data-business]').forEach((el) => {
      el.addEventListener('click', () => this.actions.onOpenBusiness(el.dataset.business!));
    });
    this.panels.querySelectorAll<HTMLElement>('[data-rent]').forEach((el) => {
      el.addEventListener('click', () => this.actions.onRentBuilding(el.dataset.rent!));
    });
    this.panels.querySelectorAll<HTMLElement>('[data-consume]').forEach((el) => {
      el.addEventListener('click', () => this.actions.onConsume(el.dataset.consume!));
    });
    this.panels.querySelectorAll<HTMLElement>('[data-craft]').forEach((el) => {
      el.addEventListener('click', () => this.actions.onCraft(el.dataset.craft!));
    });
    this.panels.querySelectorAll<HTMLElement>('[data-repair]').forEach((el) => {
      el.addEventListener('click', () => this.actions.onRepair());
    });
    this.panels.querySelectorAll<HTMLElement>('[data-install-app]').forEach((el) => {
      el.addEventListener('click', () => this.actions.onInstall());
    });
    this.panels.querySelectorAll<HTMLElement>('[data-logout]').forEach((el) => {
      el.addEventListener('click', () => this.actions.onLogout());
    });
    this.panels.querySelectorAll<HTMLElement>('[data-new-island]').forEach((el) => {
      el.addEventListener('click', () => this.actions.onNewIsland());
    });
    this.panels.querySelectorAll<HTMLElement>('[data-cheat]').forEach((el) => {
      el.addEventListener('click', () => {
        this.actions.onToggleCheat(el.dataset.cheat as CheatKey);
        this.renderPanel();
      });
    });
    this.panels.querySelectorAll<HTMLElement>('[data-open-powers]').forEach((el) => {
      el.addEventListener('click', () => this.togglePanel('powers'));
    });
    this.panels.querySelectorAll<HTMLElement>('[data-power]').forEach((el) => {
      el.addEventListener('click', () => {
        this.actions.onTogglePower(el.dataset.power as PowerKey);
        this.renderPanel();
      });
    });
    this.panels.querySelectorAll<HTMLElement>('[data-blink]').forEach((el) => {
      el.addEventListener('click', () => this.actions.onBlink());
    });
    this.panels.querySelectorAll<HTMLElement>('[data-build-clear]').forEach((el) => {
      el.addEventListener('click', () => {
        this.buildQuery = '';
        this.renderPanel();
        (document.getElementById('build-search') as HTMLInputElement | null)?.focus();
      });
    });
    const buildSearch = document.getElementById('build-search') as HTMLInputElement | null;
    if (buildSearch) {
      buildSearch.addEventListener('input', () => {
        this.buildQuery = buildSearch.value;
        const code = buildSearch.value.trim().toLowerCase();
        if (CHEAT_CODES.some((entry) => entry.code === code)) this.actions.onCheat(code);
        const world = (window as unknown as { __world?: World }).__world;
        if (world) this.updateBuildResults(world);
      });
    }
    this.panels.querySelectorAll<HTMLElement>('[data-exit]').forEach((el) => {
      el.addEventListener('click', () => this.actions.onExitInterior());
    });
    this.panels.querySelectorAll<HTMLElement>('[data-ref-run]').forEach((el) => {
      el.addEventListener('click', () => {
        const category = (document.getElementById('ref-category') as HTMLSelectElement | null)?.value ?? '';
        const color = (document.getElementById('ref-color') as HTMLInputElement | null)?.value ?? '';
        const query = (document.getElementById('ref-q') as HTMLInputElement | null)?.value ?? '';
        this.refCategory = category;
        this.refColor = color;
        this.refQuery = query;
        void this.runReferenceSearch();
      });
    });
    this.panels.querySelectorAll<HTMLElement>('[data-ref-reload]').forEach((el) => {
      el.addEventListener('click', () => {
        void artDirection.load(undefined, true).then(() => {
          window.dispatchEvent(new CustomEvent('kotfi:palette-changed'));
          this.renderPanel();
        });
      });
    });
    this.panels.querySelectorAll<HTMLElement>('[data-adopt-index]').forEach((el) => {
      el.addEventListener('click', () => {
        const index = Number(el.dataset.adoptIndex);
        const record = this.refResults[index];
        const select = document.getElementById(`ref-key-${index}`) as HTMLSelectElement | null;
        const key = (select?.value ?? 'wood') as MaterialKey;
        if (!record) return;
        artDirection.adopt(key, record);
        window.dispatchEvent(new CustomEvent('kotfi:palette-changed'));
        this.toast(`${MATERIAL_LABELS[key]} now grounded in “${record.title}” (${record.license}).`);
        this.renderPanel();
      });
    });
    this.panels.querySelectorAll<HTMLElement>('[data-vela-apply]').forEach((el) => {
      el.addEventListener('click', () => {
        const [messageId, proposalId] = (el.dataset.velaApply ?? '').split('|');
        if (!messageId || !proposalId) return;
        const result = applyVelaProposal(world, messageId, proposalId);
        this.toast(result.message);
        if (result.ok) window.dispatchEvent(new CustomEvent('kotfi:design-applied', { detail: { kind: result.kind } }));
        this.renderPanel();
      });
    });
    this.panels.querySelectorAll<HTMLElement>('[data-slayer-toggle]').forEach((el) => {
      el.addEventListener('click', () => {
        const next = !graphicsEnabled();
        setGraphicsEnabled(next);
        window.dispatchEvent(new CustomEvent('kotfi:graphics-team', { detail: { enabled: next } }));
        this.toast(next
          ? 'Lord Slayer is checking the Graphics Command Center again.'
          : 'Graphics team off. Every upgrade already applied stays exactly as it is.');
        this.renderPanel();
      });
    });
    this.panels.querySelectorAll<HTMLElement>('[data-talk-slayer]').forEach((el) => {
      el.addEventListener('click', () => this.togglePanel('studio'));
    });
    this.panels.querySelectorAll<HTMLElement>('[data-vela-dismiss]').forEach((el) => {
      el.addEventListener('click', () => {
        const [messageId, proposalId] = (el.dataset.velaDismiss ?? '').split('|');
        if (!messageId || !proposalId) return;
        dismissVelaProposal(messageId, proposalId);
        this.renderPanel();
      });
    });
    this.panels.querySelectorAll<HTMLElement>('[data-corpse]').forEach((el) => {
      el.addEventListener('click', () => this.actions.onCollectCorpse(el.dataset.corpse!));
    });
    this.panels.querySelectorAll<HTMLElement>('[data-setting]').forEach((el) => {
      el.addEventListener('change', () => {
        const input = el as HTMLInputElement;
        const key = input.dataset.setting as 'gore' | 'slowMotion' | 'distantSim' | 'firstPerson' | 'shadows';
        const value = input.type === 'checkbox' ? input.checked : Number(input.value);
        this.actions.onSetSetting(key, value);
      });
    });
    this.panels.querySelectorAll<HTMLElement>('[data-memory]').forEach((el) => {
      el.addEventListener('click', () => {
        const npc = world.npcs.get(el.dataset.memory!);
        if (npc) this.togglePanel('npc', npc.id);
      });
    });
    void player;
  }

  private renderCharacter(world: World, player: NPC): string {
    const skills = Object.entries(player.skills).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const tech = playerTechAge(world, player);
    const injuries = activeInjuries(player.body).filter((i) => i.severity > 0);
    const body = `
      <div class="stat-grid">
        <div><span>Age</span><b>${player.age}</b></div>
        <div><span>Health</span><b>${Math.round(player.health)}/${player.maxHealth}</b></div>
        <div><span>Coin</span><b>${Math.round(player.money)}</b></div>
        <div><span>Education</span><b>${player.education.toFixed(1)}</b></div>
        <div><span>Technology</span><b>Age ${tech + 1} — ${AGE_LABELS[tech]}</b></div>
        <div><span>Occupation</span><b>${player.occupation}</b></div>
      </div>
      <h3>Personality</h3>
      <div class="tag-list">${Object.entries(player.personality).map(([k, v]) => `<span class="tag">${k} ${v}</span>`).join('')}</div>
      <h3>Skills</h3>
      <div class="skill-list">
        ${skills.map(([k, v]) => `<div class="skill-row"><span>${k}</span><div class="bar"><i style="width:${(v / 20) * 100}%"></i></div><b>${v}</b></div>`).join('') || '<p class="muted">No trained skills yet. Work, fight and study.</p>'}
      </div>
      <h3>Injuries</h3>
      ${injuries.length ? `<ul class="plain">${injuries.map((i) => `<li>${describePart(i.part)} — ${i.type}${i.permanent ? ' · permanent' : ''}</li>`).join('')}</ul>` : '<p class="muted">Unharmed.</p>'}
      <h3>Ambitions</h3>
      <ul class="plain">${player.ambitions.map((a) => `<li>${a}</li>`).join('')}</ul>
      <h3>Equipment</h3>
      <p>${player.weapon ? `${player.weapon.name} — ${weaponCondition(player.weapon.durability, player.weapon.maxDurability)} (${Math.round(player.weapon.durability)}/${player.weapon.maxDurability})` : 'Unarmed'}</p>
    `;
    return this.panelShell(`Character — ${player.name}`, body, 'Personal history, skills and the marks the world has left on you.');
  }

  private renderInjuries(player: NPC): string {
    const rows = bodyParts(player.body).map((part) => {
      const active = part.injuries.filter((i) => i.severity > 0);
      if (!part.dismembered && active.length === 0) return '';
      return `
        <div class="injury-card ${part.dismembered ? 'severe' : ''}">
          <div class="injury-head">
            <b>${describePart(part.key)}</b>
            <span>${part.dismembered ? 'MISSING' : `${active.length} injury`}</span>
          </div>
          ${part.dismembered ? '<p class="danger">This body part is permanently gone.</p>' : ''}
          ${active.map((injury) => `
            <p>${injury.type} · severity ${injury.severity}${injury.permanent ? ' · permanent' : ''}${injury.bleeding ? ' · bleeding' : ''}
            <small>${injury.cause}${injury.healAt ? ` · heals around day ${Math.ceil(injury.healAt / 240)}` : ''}</small></p>
          `).join('')}
        </div>
      `;
    }).join('');
    return this.panelShell('Injuries', rows || '<p class="muted">No injuries.</p>', 'Healing takes in-game days. Permanent injuries never heal.');
  }

  private renderMemories(player: NPC): string {
    const items = player.memories.slice(0, 25).map((memory) => this.memoryCard(memory)).join('');
    return this.panelShell(
      'Memory history',
      items || '<p class="muted">Nothing significant has happened to you yet.</p>',
      'Wounds heal. Memories do not.'
    );
  }

  private memoryCard(memory: MemoryRecord, npcId?: string): string {
    return `
      <div class="memory-card ${memory.emotionalImpact > 60 ? 'trauma' : ''}" ${npcId ? `data-memory="${npcId}"` : ''}>
        <div class="memory-head">
          <b>Day ${memory.day}</b>
          <span>${memory.type.replace('-', ' ')}</span>
          <em>impact ${memory.emotionalImpact}</em>
        </div>
        <p>${memory.summary}</p>
        <small>${memory.location}${memory.consequences ? ` — ${memory.consequences}` : ''}</small>
      </div>
    `;
  }

  private renderFactions(world: World): string {
    const rows = world.factions.map((faction) => this.factionCard(world, faction)).join('');
    return this.panelShell('Factions', rows, 'Information is limited by what you have actually discovered.');
  }

  private factionCard(world: World, faction: Faction): string {
    const known = faction.knownByPlayer;
    const members = membersOf(world, faction.id);
    const leader = faction.leaderId ? world.npcs.get(faction.leaderId) : null;
    const standing = faction.relations['player'] ?? 0;
    const techVisible = known > 0.45;
    return `
      <div class="faction-card" style="border-left-color:#${faction.color.toString(16).padStart(6, '0')}">
        <div class="faction-head">
          <b>${faction.name}</b>
          <span class="${faction.wars.length ? 'danger' : ''}">${faction.wars.length ? `at war (${faction.wars.length})` : 'at peace'}</span>
        </div>
        <p>${faction.government} · ${members.length} people${techVisible ? ` · age ${faction.techAge + 1}` : ''}</p>
        <p>Leader: ${known > 0.3 && leader ? leader.name : 'unknown'} · Standing: ${Math.round(standing)}</p>
        <p>Strength: ${Math.round(factionStrength(world, faction))} · Treasury: ${techVisible ? Math.round(faction.treasury) : '?'}</p>
        ${faction.aggressiveDiscovered ? '<p class="danger">Intelligence: aggressively expansionist.</p>' : ''}
        ${faction.wars.length ? `<p class="danger">At war with: ${faction.wars.map((id) => world.factions.find((f) => f.id === id)?.name).join(', ')}</p>` : ''}
        <details><summary>Known laws</summary><ul class="plain">${faction.laws.length ? faction.laws.map((l) => `<li><b>${l.name}</b> — ${l.description}</li>`).join('') : '<li class="muted">No written laws.</li>'}</ul></details>
        <details><summary>History</summary><ul class="plain">${faction.history.slice(-6).map((h) => `<li>${h}</li>`).join('')}</ul></details>
      </div>
    `;
  }

  private renderHistory(world: World): string {
    const items = world.history.slice(0, 40).map((event) => `
      <div class="history-row ${event.significant ? 'significant' : ''}">
        <span>Day ${event.day}</span>
        <p>${event.text}</p>
        <small>${event.location}</small>
      </div>
    `).join('');
    return this.panelShell('Island history', items || '<p class="muted">Nothing has happened yet.</p>', 'The world writes its own record, whether or not you are present.');
  }

  private renderMap(world: World, player: NPC): string {
    return this.panelShell(
      'Island map',
      `<canvas id="map-canvas" width="620" height="620"></canvas>
       <div class="map-legend">
         <span><i class="dot player"></i>You</span>
         <span><i class="dot faction"></i>Settlement</span>
         <span><i class="dot war"></i>War</span>
         <span><i class="dot market"></i>Market</span>
       </div>`,
      'Territories, settlements, wars and your position.'
    );
  }

  private drawMap(world: World, player: NPC): void {
    const canvas = document.getElementById('map-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = canvas.width;
    const res = world.terrain.resolution;
    const cell = size / res;
    const img = ctx.createImageData(size, size);
    for (let gy = 0; gy < res; gy++) {
      for (let gx = 0; gx < res; gx++) {
        const idx = gy * res + gx;
        const h = world.terrain.heights[idx];
        const biome = world.terrain.biome[idx];
        let r = 30, g = 60, b = 90;
        if (h > 5.5) {
          const scale = Math.min(1, (h - 5.5) / 40);
          r = 70 + scale * 110;
          g = 100 + scale * 85;
          b = 60 + scale * 60;
          if (biome === 'desert') { r = 200; g = 175; b = 120; }
          if (biome === 'mountain' && h > 34) { r = 235; g = 238; b = 242; }
          if (biome === 'saltflat') { r = 225; g = 225; b = 215; }
        }
        const x0 = Math.floor(gx * cell);
        const y0 = Math.floor(gy * cell);
        const x1 = Math.floor((gx + 1) * cell);
        const y1 = Math.floor((gy + 1) * cell);
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const p = (y * size + x) * 4;
            img.data[p] = r;
            img.data[p + 1] = g;
            img.data[p + 2] = b;
            img.data[p + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    const toScreen = (x: number, z: number) => ({
      x: ((x + 700) / 1400) * size,
      y: ((z + 700) / 1400) * size
    });
    for (const market of world.markets) {
      const p = toScreen(market.position.x, market.position.z);
      ctx.fillStyle = '#e8c86a';
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    for (const faction of world.factions) {
      const p = toScreen(faction.capital.x, faction.capital.z);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = `#${faction.color.toString(16).padStart(6, '0')}`;
      ctx.fill();
      ctx.strokeStyle = faction.wars.length ? '#ff6b5a' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = faction.wars.length ? 3 : 1;
      ctx.stroke();
      ctx.fillStyle = '#f3ead7';
      ctx.font = '11px sans-serif';
      ctx.fillText(faction.name.split(' ').slice(-1)[0], p.x + 11, p.y + 4);
    }
    for (const building of world.buildings.filter((b) => b.built)) {
      const p = toScreen(building.position.x, building.position.z);
      ctx.fillStyle = building.factionId ? 'rgba(240,235,220,0.55)' : '#f2d06b';
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
    for (const npc of world.npcs.values()) {
      if (!npc.alive || npc.isPlayer) continue;
      const p = toScreen(npc.position.x, npc.position.z);
      ctx.fillStyle = npc.factionId ? 'rgba(200,210,220,0.55)' : '#c8c8c8';
      ctx.fillRect(p.x, p.y, 1.4, 1.4);
    }
    const pp = toScreen(player.position.x, player.position.z);
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe28a';
    ctx.fill();
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private buildDefs(): BuildingDef[] {
    const needle = this.buildQuery.trim().toLowerCase();
    return needle
      ? BUILDING_DEFS.filter((d) => `${d.name} ${d.category} ${d.purpose}`.toLowerCase().includes(needle))
      : BUILDING_DEFS.filter((d) => d.category === this.currentBuildCategory && d.age === this.currentBuildAge);
  }

  private buildCountMarkup(defs: BuildingDef[], tech: number): string {
    const query = this.buildQuery.trim();
    return query
      ? `${defs.length} design${defs.length === 1 ? '' : 's'} match “${query}”.`
      : `Your people can build ${BUILDING_DEFS.length} structure types across 8 ages. You are at age ${tech + 1}.`;
  }

  private cheatBannerMarkup(world: World): string {
    const cheats = world.cheats;
    const cheat = CHEAT_CODES.find((entry) => entry.code === this.buildQuery.trim().toLowerCase());
    if (!cheat) return '';
    const bound = cheat.code === 'midas' ? Boolean(cheats?.midas)
      : cheat.code === 'slumlord' ? Boolean(cheats?.slumlord)
        : cheat.code === 'ages' ? Boolean(cheats?.ages)
          : cheat.code === 'lucifer' ? Boolean(cheats?.lucifer)
            : cheat.code === 'people' ? Boolean(cheats?.people)
              : cheat.code === 'crownme' ? Boolean(cheats?.crownme)
                : Boolean(cheats?.powersUnlocked);
    return `<div class="cheat-result ${bound ? 'active' : ''}">
      <b>${cheat.label}</b><p>${cheat.detail}</p>
      <span>${bound ? 'BOUND TO THIS WORLD' : 'Type it exactly to bind it.'}</span>
    </div>`;
  }

  /** Update only the results, so typing never tears down the focused search input. */
  private updateBuildResults(world: World): void {
    const player = world.npcs.get(world.playerId);
    if (!player) return;
    const tech = playerTechAge(world, player);
    const defs = this.buildDefs();
    const count = document.getElementById('build-count');
    if (count) count.textContent = this.buildCountMarkup(defs, tech);
    const grid = document.getElementById('build-results');
    if (grid) {
      grid.innerHTML = defs.map((def) => this.buildCard(def, player, tech, world)).join('')
        || '<p class="muted">No design matches that search.</p>';
    }
    const slot = document.getElementById('build-cheat-slot');
    if (slot) slot.innerHTML = this.cheatBannerMarkup(world);
    const clear = document.querySelector<HTMLButtonElement>('[data-build-clear]');
    if (clear) clear.hidden = !this.buildQuery.trim();
  }

  private renderBuild(world: World, player: NPC): string {
    const tech = playerTechAge(world, player);
    const cheats = world.cheats;
    const query = this.buildQuery.trim();
    const defs = this.buildDefs();
    const tabs = BUILDING_CATEGORIES.map((cat) => `<button class="tab ${cat === this.currentBuildCategory ? 'active' : ''}" data-cat="${cat}">${cat}</button>`).join('');
    const ages = Array.from({ length: 8 }, (_, i) => `<button class="tab ${i === this.currentBuildAge ? 'active' : ''}" data-age="${i}">${AGE_LABELS[i]}</button>`).join('');
    const cards = defs.map((def) => this.buildCard(def, player, tech, world)).join('');
    const active = cheats?.revealed ? [
      cheats.midas ? 'MIDAS' : '',
      cheats.slumlord ? 'SLUMLORD' : '',
      cheats.ages ? 'AGES' : '',
      cheats.lucifer ? 'LUCIFER' : '',
      cheats.people ? 'PEOPLE' : '',
      cheats.crownme ? 'CROWNME' : '',
      (cheats.bloodline?.length ?? 0) > 0 ? 'POWERS' : ''
    ].filter(Boolean) : [];
    return this.panelShell(
      'Build',
      `<div class="build-search">
         <input id="build-search" type="search" autocomplete="off" spellcheck="false" placeholder="Search ${BUILDING_DEFS.length} designs or whisper a word…" value="${query.replace(/"/g, '&quot;')}" />
         <button data-build-clear="1" ${query ? '' : 'hidden'}>Clear</button>
       </div>
       <div id="build-cheat-slot">${this.cheatBannerMarkup(world)}</div>
       ${active.length ? `<div class="cheat-chips">${active.map((name) => `<span>${name}</span>`).join('')}</div>` : ''}
       <div class="tab-row">${tabs}</div><div class="tab-row small">${ages}</div>
       <p class="muted" id="build-count">${this.buildCountMarkup(defs, tech)}</p>
       <div class="build-grid" id="build-results">${cards || '<p class="muted">No design matches that search.</p>'}</div>
       <p class="fineprint">Every structure you place takes 30 seconds and rises in three visible stages: foundations, framing, then the building itself.</p>`,
      'Search designs, then click the ground to place one. Some words are older than the island.'
    );
  }

  private buildCard(def: BuildingDef, player: NPC, tech: number, world: World): string {
    const cheats = world.cheats;
    const free = cheats?.midas || cheats?.slumlord;
    const costs = free
      ? '<span class="ok">FREE</span>'
      : Object.entries(def.cost).map(([good, amount]) => {
        const have = cheats?.midas ? MIDAS_AMOUNT : player.inventory[good] ?? 0;
        return `<span class="${have >= amount ? 'ok' : 'missing'}">${GOODS[good]?.name ?? good} ${amount}</span>`;
      }).join(' · ');
    const locked = def.techRequired > tech;
    return `
      <button class="build-card ${locked ? 'locked' : ''}" data-build="${def.id}" ${locked ? 'disabled' : ''}>
        <b>${def.name}</b>
        <span>${def.purpose}</span>
        <em>${costs}</em>
        <small>30 sec staged build · ${def.workers} workers${locked ? ' · LOCKED' : ''}</small>
      </button>
    `;
  }

  private renderLedger(world: World, player: NPC): string {
    const ledger = playerLedger(world, player);
    const properties = world.buildings.filter((b) => b.ownerId === player.id);
    const rows = ledger.lines.map((line) => `
      <div class="ledger-row ${line.kind}">
        <span>${line.label}</span>
        <b>${line.kind === 'income' ? '+' : '−'}${line.amount.toFixed(1)}</b>
      </div>
    `).join('');
    const propertyRows = properties.map((property) => {
      const def = BUILDING_BY_ID.get(property.defId);
      const tenant = property.tenantId ? world.npcs.get(property.tenantId) : null;
      return `
        <div class="property-card">
          <b>${property.name}</b>
                      <span>${property.built ? 'operational' : `under construction — ${property.progress >= 0.66 ? 'building' : property.progress >= 0.33 ? 'framing' : 'foundations'} ${Math.round(property.progress * 100)}%`} · value ${estimateValue(property.defId)}</span>
          <span>${def?.rentable ? (tenant ? `rented to ${tenant.name} for ${property.rent}/day` : 'vacant') : (property.businessId ? 'business' : 'no business')}</span>
          <div class="row-actions">
            ${def?.rentable && !tenant ? `<button data-rent="${property.id}">Advertise for rent</button>` : ''}
            ${property.built && !def?.rentable && !property.businessId ? `<button data-business="${property.id}">Open a business</button>` : ''}
            ${property.built ? `<button data-enter="${property.id}">Enter</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
    const businesses = world.businesses.filter((b) => b.ownerId === player.id).map((business) => {
      const employees = business.employees.map((id) => world.npcs.get(id)).filter((n): n is NPC => !!n?.alive);
      return `
        <div class="property-card">
          <b>${business.name}</b>
          <span>${business.open ? 'open' : 'closed'} · revenue ${Math.round(business.revenue)} · expenses ${Math.round(business.expenses)}</span>
          <span>Employees: ${employees.map((e) => e.name).join(', ') || 'none'}</span>
          <div class="row-actions">
            <button data-recruit="1">Hire nearby worker (2 coin)</button>
            ${employees.map((e) => `<button data-fire="${e.id}">Dismiss ${e.firstName}</button>`).join('')}
          </div>
        </div>
      `;
    }).join('');
    return this.panelShell(
      'Property & finance',
      `<div class="ledger-summary">
        <div><span>Property value</span><b>${ledger.propertyValue}</b></div>
        <div><span>Daily income</span><b class="ok">${ledger.income.toFixed(1)}</b></div>
        <div><span>Daily costs</span><b class="missing">${ledger.expenses.toFixed(1)}</b></div>
        <div><span>Net</span><b class="${ledger.net >= 0 ? 'ok' : 'missing'}">${ledger.net.toFixed(1)}</b></div>
        <div><span>Coin on hand</span><b>${Math.round(player.money)}</b></div>
      </div>
      ${rows || '<p class="muted">No income or expenses yet. Build something.</p>'}
      <h3>Properties</h3>
      ${propertyRows || '<p class="muted">You own no property.</p>'}
      <h3>Businesses</h3>
      ${businesses || '<p class="muted">You operate no businesses.</p>'}`,
      'Every property earns and every property costs.'
    );
  }

  private renderInventory(world: World, player: NPC): string {
    const items = Object.entries(player.inventory).filter(([, qty]) => qty > 0)
      .sort((a, b) => (GOODS[b[0]]?.basePrice ?? 1) - (GOODS[a[0]]?.basePrice ?? 1));
    const cards = items.map(([good, qty]) => {
      const def = GOODS[good];
      const edible = (def?.nutrition ?? 0) > 0 || (def?.hydration ?? 0) > 0;
      return `
      <div class="item-card">
        <b>${def?.name ?? good}</b>
        <span>×${qty >= 10000 ? Math.round(qty).toLocaleString('en-US') : Math.round(qty * 10) / 10}</span>
        <small>${def?.category ?? 'misc'}</small>
        ${edible ? `<button data-consume="${good}">${(def?.nutrition ?? 0) > 0 ? 'Eat' : 'Drink'}</button>` : ''}
      </div>
    `;
    }).join('');
    const tech = playerTechAge(world, player);
    const recipes = [
      { id: 'club', name: 'Wooden club', cost: '3 timber', tech: 0 },
      { id: 'spear', name: 'Stone spear', cost: '4 timber, 2 stone', tech: 0 },
      { id: 'bow', name: 'Hunting bow', cost: '5 timber, 2 cloth', tech: 1 },
      { id: 'sword', name: 'Iron sword', cost: '4 iron, 2 timber', tech: 3 },
      { id: 'musket', name: 'Musket', cost: '8 iron, 4 timber', tech: 6 }
    ];
    const craftRows = recipes.map((recipe) => `
      <div class="ledger-row">
        <span>${recipe.name} <small class="muted">${recipe.cost} · age ${recipe.tech + 1}</small></span>
        <button class="craft-btn" data-craft="${recipe.id}" ${tech < recipe.tech ? 'disabled' : ''}>Craft</button>
      </div>
    `).join('');
    const corpses = world.corpses.slice(-4).map((corpse) => `
      <div class="item-card">
        <b>${corpse.name}</b>
        <span>${Object.keys(corpse.inventory).length} items · ${Math.round(corpse.money)} coin</span>
        <button data-corpse="${corpse.id}">Recover belongings</button>
      </div>
    `).join('');
    return this.panelShell(
      'Inventory',
      `<div class="item-grid">${cards || '<p class="muted">Empty.</p>'}</div>
       <h3>Bodies nearby</h3>
       ${corpses || '<p class="muted">No bodies to search.</p>'}
       <h3>Worn equipment</h3>
       <p>${player.weapon ? `${player.weapon.name} (${weaponCondition(player.weapon.durability, player.weapon.maxDurability)}, ${Math.round(player.weapon.durability)}/${player.weapon.maxDurability})` : 'Nothing'}</p>
       ${player.weapon ? `<button class="craft-btn" data-repair="1">Repair (2 timber)</button>` : ''}
       <h3>Crafting</h3>
       ${craftRows}`,
      'What you carry is all you have.'
    );
  }

  private renderMarket(world: World, player: NPC): string {
    const market = this.openPanelContext
      ? world.markets.find((m) => m.id === this.openPanelContext)
      : world.markets.reduce<typeof world.markets[number] | null>((best, m) => {
        if (!best) return m;
        const d = Math.hypot(m.position.x - player.position.x, m.position.z - player.position.z);
        const bd = Math.hypot(best.position.x - player.position.x, best.position.z - player.position.z);
        return d < bd ? m : best;
      }, null);
    if (!market) return this.panelShell('Market', '<p>No market found.</p>');
    const rows = Object.keys(market.goods).map((good) => {
      const entry = market.goods[good];
      const price = priceOf(market, good);
      const have = player.inventory[good] ?? 0;
      return `
        <div class="market-row">
          <span><b>${GOODS[good]?.name ?? good}</b><small>stock ${Math.round(entry.stock)} · demand ${Math.round(entry.demand)}</small></span>
          <span class="price">${price.toFixed(1)}</span>
          <span class="have">you ${Math.round(have)}</span>
          <button data-buy="${good}" data-qty="1" ${entry.stock < 1 ? 'disabled' : ''}>Buy</button>
          <button data-sell="${good}" data-qty="1" ${have < 1 ? 'disabled' : ''}>Sell</button>
        </div>
      `;
    }).join('');
    return this.panelShell(market.name, `<div class="market-list">${rows}</div>`, 'Prices move with supply, demand and war.');
  }

  private renderNPC(world: World, npcId: string | null): string {
    const npc = npcId ? world.npcs.get(npcId) : null;
    if (!npc) return this.panelShell('Person', '<p class="muted">No one selected.</p>');
    const faction = npc.factionId ? world.factions.find((f) => f.id === npc.factionId) : null;
    const familyIds: string[] = [npc.spouseId, ...npc.childIds, ...npc.parentIds]
      .filter((id): id is string => typeof id === 'string');
    const family = familyIds
      .map((id) => world.npcs.get(id))
      .filter((n): n is NPC => !!n)
      .map((n) => `<span class="tag clickable" data-npc="${n.id}">${n.name} (${n.alive ? 'alive' : 'dead'})</span>`)
      .join('');
    const memories = npc.memories.slice(0, 6).map((m) => this.memoryCard(m)).join('');
    const injuries = activeInjuries(npc.body).filter((i) => i.severity > 0);
    const missing = bodyParts(npc.body).filter((p) => p.dismembered);
    return this.panelShell(
      npc.name,
      `<div class="stat-grid">
        <div><span>Age</span><b>${Math.round(npc.age)}</b></div>
        <div><span>Occupation</span><b>${npc.occupation}</b></div>
        <div><span>Faction</span><b>${faction?.name ?? 'none'}</b></div>
        <div><span>Health</span><b>${Math.round(npc.health)}/${npc.maxHealth}</b></div>
        <div><span>Status</span><b>${npc.alive ? npc.activity : 'dead'}</b></div>
        <div><span>Weapon</span><b>${npc.weapon?.name ?? 'unarmed'}</b></div>
      </div>
      <h3>Personality</h3>
      <div class="tag-list">${Object.entries(npc.personality).map(([k, v]) => `<span class="tag">${k} ${Math.round(v)}</span>`).join('')}</div>
      <h3>Injuries</h3>
      ${missing.length ? `<p class="danger">Missing: ${missing.map((m) => describePart(m.key)).join(', ')}</p>` : ''}
      ${injuries.length ? `<ul class="plain">${injuries.map((i) => `<li>${describePart(i.part)} — ${i.type}${i.permanent ? ' (permanent)' : ''}</li>`).join('')}</ul>` : '<p class="muted">Uninjured.</p>'}
      <h3>Family</h3>
      <div class="tag-list">${family || '<span class="muted">No known family.</span>'}</div>
      <h3>Memories</h3>
      ${memories || '<p class="muted">No significant memories.</p>'}
      <div class="row-actions"><button id="panel-close">Close</button></div>`,
      'Every islander has a life, a body and a memory.'
    );
  }

  private renderInterior(world: World, player: NPC): string {
    const building = world.currentInteriorId ? world.buildings.find((b) => b.id === world.currentInteriorId) : null;
    if (!building) return this.panelShell('Interior', '<p class="muted">You are outside.</p>');
    const def = BUILDING_BY_ID.get(building.defId);
    const tenant = building.tenantId ? world.npcs.get(building.tenantId) : null;
    return this.panelShell(
      building.name,
      `<p>${def?.purpose ?? 'A structure.'}</p>
       <div class="stat-grid">
         <div><span>Owner</span><b>${building.ownerId === player.id ? 'You' : building.ownerId ? world.npcs.get(building.ownerId)?.name ?? 'unknown' : 'none'}</b></div>
         <div><span>Tenant</span><b>${tenant?.name ?? 'vacant'}</b></div>
         <div><span>Condition</span><b>${Math.round(building.condition)}%</b></div>
         <div><span>Rent</span><b>${building.rent}/day</b></div>
       </div>
       <h3>Furnishings</h3>
       <div class="tag-list">${(def?.interior ?? []).map((f) => `<span class="tag">${f}</span>`).join('')}</div>
       <h3>Stored goods</h3>
       <div class="tag-list">${Object.entries(building.inventory).map(([g, q]) => `<span class="tag">${GOODS[g]?.name ?? g} ${Math.round(q)}</span>`).join('') || '<span class="muted">Empty</span>'}</div>
               <div class="row-actions">
          ${player.homeId === building.id ? '<button data-talk-slayer="1">Talk to Lord Slayer</button>' : ''}
          <button data-exit="1">Step outside</button>
        </div>`,
      player.homeId === building.id ? 'Lord Slayer keeps your studio here, measuring the room and the light.' : 'Interiors are real rooms with furniture, storage and tenants.'
    );
  }

  private renderSettings(world: World): string {
    return this.panelShell(
      'Settings',
      `<label class="setting-row">Gore intensity
         <input type="range" min="0" max="1" step="0.1" value="${world.settings.gore}" data-setting="gore" />
       </label>
       <label class="setting-row">Slow-motion intensity
         <input type="range" min="0.2" max="2" step="0.1" value="${world.settings.slowMotion}" data-setting="slowMotion" />
       </label>
       <label class="setting-row"><input type="checkbox" ${world.settings.distantSim ? 'checked' : ''} data-setting="distantSim" /> Simulate distant factions</label>
       <label class="setting-row"><input type="checkbox" ${world.settings.firstPerson ? 'checked' : ''} data-setting="firstPerson" /> First-person camera</label>
       <label class="setting-row"><input type="checkbox" ${world.settings.shadows ? 'checked' : ''} data-setting="shadows" /> Shadows</label>
       <div class="account-row"><span>Signed in as</span><b>${this.accountName || 'this browser'}</b></div>
       <div class="row-actions">
         <button class="craft-btn" data-new-island="1">Start a new island</button>
         <button class="craft-btn" data-logout="1">Log out</button>
       </div>
       <p class="fineprint">Autosaves every 10 seconds to this profile${this.accountName ? ` (${this.accountName})` : ''}. Logging out never deletes the island.</p>
       <button class="craft-btn" data-install-app="1">Install this as an app</button>
       <p class="fineprint">Installing puts the island on your home screen or desktop. The installed app opens offline, keeps your saved palette, and fetches new graphics and code whenever you are online.</p>
       <p class="muted">Controls: left thumb stick moves, drag the right side of the screen to look, and the on-screen buttons attack, block, aim, finish, interact, sprint and open the island menu. The game pauses whenever you leave it, and nothing advances while you are away.</p>`,
      'Presentation options. Combat rules never change.'
    );
  }

  private ensureReferenceData(): void {
    if (!this.refStats && !this.refLoading) {
      void fetchBankStats().then((stats) => {
        this.refStats = stats;
        if (this.openPanelKind === 'references') this.renderPanel();
      }).catch(() => undefined);
    }
    if (!this.refLoadedOnce && !this.refLoading) {
      this.refLoadedOnce = true;
      void this.runReferenceSearch();
    }
  }

  private async runReferenceSearch(): Promise<void> {
    this.refLoading = true;
    this.refError = null;
    if (this.openPanelKind === 'references') this.renderPanel();
    try {
      const response = await searchReferences({
        category: this.refCategory || undefined,
        color: this.refColor || undefined,
        q: this.refQuery || undefined,
        limit: 12
      });
      this.refResults = response.records ?? [];
      this.refTotal = response.total;
      this.refPolicy = response.licencePolicy;
    } catch (error) {
      this.refError = error instanceof Error ? error.message : 'The reference library could not be reached.';
      this.refResults = [];
    } finally {
      this.refLoading = false;
      if (this.openPanelKind === 'references') this.renderPanel();
    }
  }

  private renderCheats(world: World): string {
    const discovered = new Set<CheatCode>(world.cheats?.discovered ?? []);
    const rows = CHEAT_CODES.filter((entry) => entry.code !== 'powers' && discovered.has(entry.code)).map((entry) => {
      const key = entry.code as CheatKey;
      const on = Boolean(world.cheats?.[key]);
      return `
        <div class="cheat-row ${on ? 'active' : ''} ${entry.permanent ? 'permanent' : ''}">
          <div><b>${entry.label}</b><p>${entry.detail}</p>
            <small>${on ? (entry.permanent ? 'PERMANENT' : 'ACTIVE') : 'off'}</small></div>
          <button data-cheat="${key}" class="${on ? 'on' : 'off'}" ${entry.permanent ? 'disabled' : ''}>${entry.permanent ? 'BOUND' : on ? 'ON' : 'OFF'}</button>
        </div>
      `;
    }).join('');
    const bloodline = world.cheats?.bloodline ?? [];
    const powersRow = discovered.has('powers') ? `
       <div class="cheat-row ${bloodline.length ? 'active' : ''}">
         <div><b>POWERS</b><p>${bloodline.length
           ? `${bloodline.length} gifts are permanently in your bloodline. Switching them off never removes them.`
           : 'The six gifts are in your bloodline. Open the Powers panel to switch them on.'}</p>
           <small>${bloodline.length ? 'BLOODLINE · PERMANENT' : 'unlocked'}</small></div>
         <button data-open-powers="1">Open</button>
       </div>` : '';
    return this.panelShell(
      'Cheats',
      `${rows || '<p class="muted">No word has answered you yet. The Build search is where forgotten things are spoken.</p>'}
       ${powersRow}
       <p class="fineprint">Only the words that answered you are written here. Effects can be switched off without wiping anything already built, bought or awakened.</p>`,
      'What the island gave you can be laid down, but never erased.'
    );
  }

  private renderPowers(world: World): string {
    const cheats = world.cheats;
    if (!cheats?.powersUnlocked && !(cheats?.bloodline?.length ?? 0)) {
      return this.panelShell(
        'Powers',
        '<p class="muted">No powers are in your bloodline yet. Open Build and search for the word <b>powers</b>.</p>',
        'What is in the blood cannot be taken out.'
      );
    }
    const rows = POWER_META.map((power) => {
      const unlocked = cheats.bloodline.includes(power.key);
      const active = unlocked && cheats.powers[power.key];
      return `
        <div class="power-card ${active ? 'active' : ''}">
          <div><b>${power.label}</b><p>${power.detail}</p>
            <small>${unlocked ? 'bloodline · permanent' : 'not yet in the blood'}</small></div>
          <button data-power="${power.key}" class="${active ? 'on' : 'off'}" ${unlocked ? '' : 'disabled'}>${active ? 'ON' : unlocked ? 'OFF' : 'LOCKED'}</button>
        </div>
      `;
    }).join('');
    const teleport = cheats.bloodline.includes('teleport') && cheats.powers.teleport;
    return this.panelShell(
      'Powers',
      `${rows}
       <div class="row-actions">
         <button data-blink="1" ${teleport ? '' : 'disabled'}>Blink 30m forward</button>
       </div>
       <p class="fineprint">Each switch is saved in your bloodline forever: a reload, a new day or a new character cannot remove it. Flight raises you above walls and water. Invisibility hides you from every eye. Invincibility turns every blow aside.</p>`,
      'Six gifts, bound to the blood.'
    );
  }

  private renderStudio(): string {
    const messages = velaMessages().slice().reverse();
    const waiting = messages.reduce(
      (sum, message) => sum + message.proposals.filter((proposal) => proposal.status === 'open').length,
      0
    );
    const list = messages.map((message) => {
      const open = message.proposals.filter((proposal) => proposal.status === 'open').length;
      const when = new Date(message.at);
      const stamp = Number.isFinite(when.getTime())
        ? `${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${slotLabel(message.slot)}`
        : slotLabel(message.slot);
      return `
        <div class="vela-msg">
          <div class="vela-msg-head">
            <b>${stamp}</b>
            <span>day ${message.islandDay} · ${open ? `${open} open` : 'handled'}</span>
          </div>
          <p class="vela-greeting">${message.greeting}</p>
          ${message.proposals.map((proposal, index) => this.velaProposal(message.id, proposal, index)).join('')}
        </div>
      `;
    }).join('');
    return this.panelShell(
      'Lord Slayer — graphics studio',
      `<div class="vela-status">
         <div><b>${SLAYER_SCHEDULE}</b><span>a note check every 5 minutes, plus five live palette upgrades a minute while online.</span></div>
         <div><b>${graphicsEnabled() ? 'ACTIVE' : 'OFF'}</b><span>graphics team · ${artDirection.permanentCount()} permanent upgrade${artDirection.permanentCount() === 1 ? '' : 's'} locked in.</span></div>
       </div>
       <button class="slayer-toggle ${graphicsEnabled() ? 'on' : 'off'}" data-slayer-toggle="1">${graphicsEnabled() ? 'Switch the graphics team off' : 'Switch the graphics team on'}</button>
       <p class="muted">${waiting} open note${waiting === 1 ? '' : 's'} in ${messages.length} check${messages.length === 1 ? '' : 's'}.</p>
       ${list || '<p class="muted">Lord Slayer has not filed a check yet. His next notes arrive at 08:30, 14:30 or 20:30.</p>'}
       ${typeof navigator !== 'undefined' && navigator.onLine === false ? '<p class="muted">Offline — the last saved palette stays applied. New Graphics Command Center pulls resume when you are back online.</p>' : ''}
       <p class="fineprint">Accepting a note changes this world for good: palettes are re-grounded in the reference library and saved permanently, structures are raised and trees are planted. Switching the graphics team off stops new checks but never reverts an applied upgrade.</p>`,
      'An autonomous islander with a direct line to the Graphics Command Center. He keeps your check times and your library pulls, and builds what he proposes.'
    );
  }

  private velaProposal(messageId: string, proposal: DesignProposal, index: number): string {
    const kindLabel = proposal.kind === 'palette' ? 'Palette · library' : proposal.kind === 'structure' ? 'Structure' : 'Planting';
    const thumb = proposal.record?.previewUrl
      ? `<img class="vela-thumb" src="${proposal.record.previewUrl}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
      : '';
    const attribution = proposal.record
      ? `<small class="vela-source">${proposal.record.title} · ${proposal.record.provider} · ${proposal.record.license}</small>`
      : '';
    const actions = proposal.status === 'open'
      ? `<button class="vela-apply" data-vela-apply="${messageId}|${proposal.id}">Apply to the world</button>
         <button class="vela-skip" data-vela-dismiss="${messageId}|${proposal.id}">Set aside</button>`
      : `<span class="vela-state ${proposal.status}">${proposal.status === 'applied' ? 'Applied ✓' : 'Set aside'}</span>`;
    return `
      <div class="vela-note ${proposal.status}">
        <div class="vela-note-head"><span>${index + 1} · ${kindLabel}</span>${proposal.status === 'applied' ? '<b>LIVE</b>' : ''}</div>
        ${thumb}
        <b class="vela-title">${proposal.title}</b>
        <p>${proposal.detail}</p>
        ${attribution}
        <div class="vela-actions">${actions}</div>
      </div>
    `;
  }

  private renderReferences(): string {
    const status = artDirection.status;
    const statusLabel = status === 'live' ? 'Live link' : status === 'cached' ? 'Cached palette' : status === 'loading' ? 'Connecting' : status === 'offline' ? 'Offline' : 'Not connected';
    const stats = this.refStats;
    const materialCards = (Object.keys(MATERIAL_LABELS) as MaterialKey[]).map((key) => {
      const choice = artDirection.choices[key];
      return `
        <div class="material-card">
          <span class="swatch" style="background:${choice.hex}"></span>
          <div>
            <b>${MATERIAL_LABELS[key]}</b>
            <small>${choice.source ? `${choice.source.title} · ${choice.source.license}` : 'baked fallback'}${choice.adopted ? ' · permanent' : ''}</small>
          </div>
        </div>
      `;
    }).join('');

    const categoryOptions = GAME_REFERENCE_CATEGORIES
      .map((category) => `<option value="${category}" ${category === this.refCategory ? 'selected' : ''}>${category}</option>`)
      .join('');

    const results = this.refLoading
      ? '<p class="muted">Querying the live library…</p>'
      : this.refError
        ? `<p class="danger">${this.refError}</p><p class="muted">Baked palettes stay active; the game is unaffected.</p>`
        : this.refResults.length === 0
          ? '<p class="muted">No references matched. Try another category.</p>'
          : this.refResults.map((record, index) => this.referenceCard(record, index)).join('');

    const attribution = artDirection.attributions().map((record) => `
      <li><a href="${record.pageUrl}" target="_blank" rel="noreferrer">${record.title}</a> — ${record.attribution || record.provider} · ${record.license}</li>
    `).join('');

    return this.panelShell(
      'Reference memory',
      `<div class="ref-status ${status}">
        <b>${statusLabel}</b>
        <span>${stats ? `${stats.total} references · ${stats.highRes} high-res · ${stats.analyzed} analysed` : 'Graphics Command Center library'}</span>
        ${stats ? `<span>${Object.entries(stats.byLicense).map(([license, count]) => `${license} ${count}`).join(' · ')}</span>` : ''}
        ${artDirection.error ? `<span class="danger">${artDirection.error}</span>` : ''}
        <button class="ref-reload" data-ref-reload="1">Re-link palette</button>
      </div>
      <h3>Materials grounded in references</h3>
      <div class="material-grid">${materialCards}</div>
      <h3>Browse the library</h3>
      <div class="ref-controls">
        <select id="ref-category">${categoryOptions}</select>
        <input id="ref-color" type="text" placeholder="#8a4b2a" value="${this.refColor}" />
        <input id="ref-q" type="text" placeholder="keywords" value="${this.refQuery}" />
        <button data-ref-run="1">Search</button>
      </div>
      <p class="muted">${this.refTotal ? `${this.refTotal} records match.` : 'Colour + category search; colours are CIELAB-matched by the library.'}</p>
      <div class="ref-results">${results}</div>
      <h3>Attribution</h3>
      <ul class="attribution-list">${attribution || '<li class="muted">No adopted references yet.</li>'}</ul>
      <p class="fineprint">${this.refPolicy || 'Public domain, CC0 and CC BY references. Attribution is kept with every adopted palette.'}</p>`,
      'Every material in the world is grounded in a real reference, with its licence kept.'
    );
  }

  private referenceCard(record: ReferenceRecord, index: number): string {
    const swatches = (record.palette ?? []).slice(0, 5)
      .map((swatch) => `<i style="background:${swatch.hex}" title="${swatch.hex} · ${(swatch.share * 100).toFixed(0)}%"></i>`)
      .join('');
    const keyOptions = (Object.keys(MATERIAL_LABELS) as MaterialKey[])
      .map((key) => `<option value="${key}">${MATERIAL_LABELS[key]}</option>`)
      .join('');
    return `
      <div class="ref-card">
        <img class="ref-thumb" src="${record.previewUrl}" alt="${record.title.replace(/"/g, '&quot;')}" loading="lazy" referrerpolicy="no-referrer" />
        <div class="ref-body">
          <b>${record.title}</b>
          <small>${record.category} · ${record.provider} · ${record.license}</small>
          <div class="swatches">${swatches}</div>
          <div class="adopt-row">
            <select id="ref-key-${index}">${keyOptions}</select>
            <button data-adopt-index="${index}">Adopt</button>
            <a href="${record.pageUrl}" target="_blank" rel="noreferrer">source</a>
          </div>
        </div>
      </div>
    `;
  }

  showIntro(seed: number | null, hasSave: boolean, saveSummary: string, onStart: (seed: number | null, load: boolean) => void): void {
    this.modal.classList.add('open');
    this.modal.innerHTML = `
      <div class="modal-card intro">
        <h1>KINGDOMS OF THE<br/><span>FORGOTTEN ISLAND</span></h1>
        <p class="lede">Ten factions. One hundred souls. No villages, no kings, no roads. A living world that stops the instant you put it down.</p>
        <ul class="intro-points">
          <li>Every islander has a body, a memory, a family and a mind of their own.</li>
          <li>Injuries are anatomical and permanent. Deaths do not reset.</li>
          <li>Target a specific limb in combat — but never expect it to land.</li>
          <li>Finish a downed opponent with a wound or a kill. Time stops; you cannot be touched.</li>
        </ul>
        <div class="intro-actions">
          <label class="seed-row">World seed
            <input id="seed-input" type="text" value="${seed ?? ''}" placeholder="random" />
          </label>
          <button class="primary" id="start-new">Enter the island</button>
          ${hasSave ? `<button id="start-load">Continue — ${saveSummary}</button>` : ''}
        </div>
        <p class="fineprint">${this.accountName ? `Autosaving to ${this.accountName}. ` : ''}Save data stays in this browser. The island pauses when you leave and nothing advances while you are away. Play in landscape.</p>
      </div>
    `;
    const start = () => {
      const input = document.getElementById('seed-input') as HTMLInputElement | null;
      const raw = input?.value.trim() ?? '';
      const parsed = raw.length ? Number(raw) : null;
      onStart(Number.isFinite(parsed) && parsed !== null ? parsed : null, false);
    };
    const startNew = document.getElementById('start-new');
    const startLoad = document.getElementById('start-load');
    startNew?.addEventListener('click', start);
    startLoad?.addEventListener('click', () => onStart(null, true));
  }

  hideIntro(): void {
    if (this.modal.querySelector('.intro')) {
      this.modal.classList.remove('open');
      this.modal.innerHTML = '';
    }
  }

  showFinishingChoice(world: World): void {
    const state = world.finishing;
    if (!state.active || state.phase !== 'choosing') return;
    const victim = state.victimId ? world.npcs.get(state.victimId) : null;
    if (!victim) return;
    const signature = `choose:${victim.id}:${state.part}`;
    if (this.lastModalSignature === signature) return;
    this.lastModalSignature = signature;
    this.modal.classList.add('open', 'finishing');
    this.modal.innerHTML = `
      <div class="modal-card finishing-card">
        <div class="freeze-banner">COMBAT FROZEN · YOU CANNOT BE HARMED</div>
        <h2>Finish ${victim.name}</h2>
        <p class="lede">${victim.firstName} is broken and at your mercy. ${victim.age < 16 ? 'They are a child.' : ''} Choose what happens next. This choice is permanent.</p>
        <div class="target-line">Target: <b>${state.part ? describePart(state.part) : 'unknown'}</b> · Weapon: <b>${state.weaponName}</b></div>
        <div class="choice-grid">
          <button class="choice wound" id="choose-wound">
            <span class="choice-tag">CHOICE 1</span>
            <h3>Permanent wound</h3>
            <p>Take the ${state.part ? describePart(state.part).toLowerCase() : 'limb'}. They live, disfigured and disabled, and they will remember you.</p>
            <ul>
              <li>Permanent anatomical loss</li>
              <li>Victim survives, adapts, and remembers</li>
              <li>Witnesses spread the story</li>
            </ul>
          </button>
          <button class="choice kill" id="choose-kill">
            <span class="choice-tag">CHOICE 2</span>
            <h3>Brutal kill</h3>
            <p>End them. A permanent death that reshapes families, property, leadership and history.</p>
            <ul>
              <li>Permanent death</li>
              <li>Inheritance, grief and grudges</li>
              <li>Recorded forever in the world's history</li>
            </ul>
          </button>
        </div>
        <p class="fineprint">The rest of the world is frozen until the cinematic ends. No enemy can strike you.</p>
      </div>
    `;
    document.getElementById('choose-wound')?.addEventListener('click', () => this.actions.onChooseFinishing('wound'));
    document.getElementById('choose-kill')?.addEventListener('click', () => this.actions.onChooseFinishing('kill'));
  }

  showCinematicCaption(world: World): void {
    const state = world.finishing;
    if (!state.active || state.phase === 'choosing') return;
    const victim = state.victimId ? world.npcs.get(state.victimId) : null;
    const signature = `cine:${state.phase}:${state.victimId}`;
    if (this.lastModalSignature === signature) return;
    this.lastModalSignature = signature;
    this.modal.classList.add('open', 'finishing');
    this.modal.innerHTML = `
      <div class="cinematic-overlay">
        <div class="cinematic-letterbox top"></div>
        <div class="cinematic-caption">
          <span>${state.phase === 'kill' ? 'FINISHING BLOW' : 'PERMANENT WOUND'}</span>
          <h2>${victim?.name ?? 'Unknown'}</h2>
          <p>${state.part ? describePart(state.part) : ''} · ${state.weaponName}</p>
          <small>You are invulnerable. Combat resumes when this ends.</small>
        </div>
        <div class="cinematic-letterbox bottom"></div>
      </div>
    `;
  }

  hideModal(): void {
    this.lastModalSignature = '';
    this.modal.classList.remove('open', 'finishing');
    this.modal.innerHTML = '';
  }

  showingCinematic(): boolean {
    return this.modal.classList.contains('finishing');
  }

  showDeath(world: World, player: NPC, onContinue: () => void): void {
    this.lastModalSignature = 'death';
    this.modal.classList.add('open');
    this.modal.innerHTML = `
      <div class="modal-card death">
        <h2>You died</h2>
        <p class="lede">${player.deathCause ? `Cause: ${player.deathCause}.` : ''} Day ${world.day}. The world does not reset.</p>
        <div class="memorial">
          ${player.memories.slice(0, 8).map((m) => `<div class="memory-card ${m.emotionalImpact > 60 ? 'trauma' : ''}"><b>Day ${m.day}</b><p>${m.summary}</p></div>`).join('')}
        </div>
        <div class="stat-grid">
          <div><span>Days survived</span><b>${world.day}</b></div>
          <div><span>People met</span><b>${Object.keys(player.relationships).length}</b></div>
          <div><span>Injuries suffered</span><b>${player.body ? Object.values(player.body).flatMap((p) => p.injuries).length : 0}</b></div>
          <div><span>Coin</span><b>${Math.round(player.money)}</b></div>
        </div>
        <button class="primary" id="death-continue">Begin a new life in this world</button>
        <p class="fineprint">A new character inherits the consequences of the old one.</p>
      </div>
    `;
    document.getElementById('death-continue')?.addEventListener('click', onContinue);
  }

  drawFinishingProgress(world: World): void {
    const state = world.finishing;
    if (!state.active || state.phase === 'choosing') return;
    const duration = state.phase === 'kill' ? 5 : 4.4;
    const ratio = Math.min(1, state.elapsed / duration);
    const bar = document.getElementById('cine-progress');
    if (bar) bar.style.width = `${ratio * 100}%`;
  }

  setWorld(world: World): void {
    (window as unknown as { __world?: World }).__world = world;
  }
}
