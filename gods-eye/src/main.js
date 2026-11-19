import * as THREE from 'three';
import './style.css';
import {
  createState, loadState, saveState, clearSave, advanceDays, awayDays, worldStats,
  setSaveNamespace, hasSave, DAYS_PER_SECOND,
} from './state.js';
import { Cabin } from './render/cabin.js';
import { Region } from './render/region.js';
import { FirstPerson, MapOrbit, keyCode } from './controls.js';
import { UI } from './ui.js';
import { godAction, talk } from './life.js';
import { parseOrder, runOrder } from './orders.js';
import { isLand, tileAt } from './world.js';
import { dateLabel, civEvent } from './journal.js';
import { TouchControls, isTouchDevice } from './mobile.js';
import { Sound } from './audio.js';
import { Decor, DECOR_PROPS } from './render/decor.js';
import { initGrade, Presentation } from './render/grade.js';
import { Society, ERAS } from './society.js';
import * as account from './account.js';

const PROFILE_KEY = 'gods-eye-profile-v1';
const TOUCH_KEY = 'gods-eye-touch';

function readProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
  } catch {
    return null;
  }
}

function cacheProfile(user) {
  try {
    if (!user) return;
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ sub: user.sub, name: user.name || '', email: user.email || '', picture: user.picture || '' }));
  } catch {
    /* ignore */
  }
}

class Game {
  constructor() {
    this.stage = document.getElementById('stage');
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.stage.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.008, 600);
    this.camera.rotation.order = 'YXZ';

    // The sky and both image-based probes are built before the cabin or a
    // region asks for them; the presentation owns tone mapping, pixel ratio and
    // bloom, so the two scenes cannot drift apart.
    initGrade(this.renderer);
    this.presentation = new Presentation(this.renderer, this.camera);

    this.cabin = new Cabin();
    this.decor = new Decor();
    this.society = null;
    this.civHudIn = 0;
    this.societyHudIn = 0;
    this.decorMode = false;
    this.decorPick = 'table';
    this.decor.load(this.cabin.root, this.cabin.blockers);
    this.fp = new FirstPerson(this.camera, this.renderer.domElement);
    this.orbit = new MapOrbit(this.camera, this.renderer.domElement);
    this.ui = new UI(this);
    this.touchControls = new TouchControls(this);

    this.state = null;
    this.savedState = null;
    this.mode = 'title';
    this.scene = this.cabin.scene;
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.simAccumulator = 0;
    this.mapTimer = 0;
    this.uiTimer = 0;
    this.saveTimer = 0;
    this.region = null;
    this.nearestNpc = null;
    this.overlay = null;
    this.auth = { status: 'checking', user: null };
    this.away = 0;
    this.resumeSpeed = 1;
    this.cabinReturn = null;
    this.hiddenAt = 0;
    this.installEvent = null;
    this.touchEnabled = false;
    this.sound = new Sound();
    // audio may not start until the player has touched the page
    const wakeAudio = () => {
      this.sound.ensure();
      window.removeEventListener('pointerdown', wakeAudio);
      window.removeEventListener('keydown', wakeAudio);
    };
    window.addEventListener('pointerdown', wakeAudio);
    window.addEventListener('keydown', wakeAudio);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    // Keys held while roaming the table, and the little bit of drift the camera
    // keeps after the stick is let go.
    this.tableKeys = new Set();
    this.tableDrift = new THREE.Vector2();
    document.addEventListener('keyup', (e) => this.tableKeys.delete(keyCode(e)));

    this.bindEvents();
    this.registerServiceWorker();
    this.boot().catch((err) => {
      console.error('[gods-eye] boot failed', err);
      setSaveNamespace('local');
      this.loadSavedWorld();
      this.ui.showTitle(this.titleInfo());
    });
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  /* -------------------------------- auth --------------------------------- */

  async resolveSession() {
    try {
      const res = await fetch('/auth/freebuff/session', {
        headers: { accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const type = res.headers.get('content-type') || '';
      if (type.includes('application/json')) {
        const data = await res.json().catch(() => ({}));
        return { status: data.user ? 'in' : 'out', user: data.user || null };
      }
      // No auth server here (the site is static). If an account provider is
      // configured, the browser talks to it directly instead.
      if (account.authConfigured()) {
        const stored = account.readSession();
        if (stored?.user?.sub) {
          if (stored.expires_at && stored.expires_at < Date.now() + 30000) {
            try {
              const fresh = await account.refresh(stored);
              if (fresh?.user) return { status: 'in', user: fresh.user };
            } catch {
              /* keep the stored session and let the player try again later */
            }
          }
          return { status: 'in', user: stored.user };
        }
        return { status: 'out', user: null };
      }
      return { status: 'local', user: null };
    } catch {
      // offline: keep playing with the world cached for this profile
      const cached = readProfile();
      return { status: 'offline', user: cached || null };
    }
  }

  async boot() {
    this.ui.showTitleLoading();
    await this.beginSession(await this.resolveSession());
  }

  async beginSession(session) {
    this.auth = session;

    if (session.user) {
      setSaveNamespace(session.user.sub);
      cacheProfile(session.user);
    } else if (session.status === 'offline') {
      const cached = readProfile();
      setSaveNamespace(cached?.sub || 'local');
    } else if (session.status === 'local') {
      setSaveNamespace('local');
    } else {
      this.ui.showAuthGate();
      return;
    }

    this.loadSavedWorld();
    this.touchEnabled = localStorage.getItem(TOUCH_KEY) === '1' || (localStorage.getItem(TOUCH_KEY) === null && isTouchDevice());
    this.touchControls.setEnabled(this.touchEnabled);
    this.ui.showTitle(this.titleInfo());
  }

  async signIn(email, password, create = false) {
    this.ui.authBusy(true, create ? 'Creating…' : 'Signing in…');
    try {
      const session = create ? await account.signUp(email, password) : await account.signIn(email, password);
      this.ui.authMessage('');
      await this.beginSession({ status: 'in', user: session.user });
    } catch (err) {
      this.ui.authMessage(err?.message || 'Could not sign in.');
    } finally {
      this.ui.authBusy(false);
    }
  }

  async playLocally() {
    this.ui.authMessage('');
    await this.beginSession({ status: 'local', user: null });
  }

  async signOut() {
    await account.signOut();
    setSaveNamespace('local');
    this.persist();
    window.location.reload();
  }

  loadSavedWorld() {
    const loaded = loadState();
    if (!loaded) {
      this.savedState = null;
      return;
    }
    this.savedState = loaded;
    if (loaded.started) {
      const away = awayDays(loaded);
      if (away > 0) {
        this.away = away;
        loaded.onEvent = null;
        advanceDays(loaded, away, { quiet: true });
      }
      loaded.lastVisit = Date.now();
    }
  }

  titleInfo() {
    const state = this.savedState;
    const user = this.auth.user || readProfile();
    const signedIn = this.auth.status === 'in';
    let summary = '';
    if (state && state.started) {
      const stats = worldStats(state);
      summary = `${dateLabel(state.world.day)} — ${stats.population} inhabitant${stats.population === 1 ? '' : 's'}, ${stats.settlements} settlement${stats.settlements === 1 ? '' : 's'}, ${stats.nations} nation${stats.nations === 1 ? '' : 's'}. ${state.world.tiles.size} tiles.`;
    }
    const who = signedIn
      ? user?.name || user?.email || 'Signed in with Freebuff'
      : this.auth.status === 'offline'
        ? 'Offline — this device’s world'
        : this.auth.status === 'local'
          ? 'This device — the world is saved here'
          : '';
    return {
      hasSave: !!summary,
      summary,
      account: who,
      signedIn,
      offline: this.auth.status === 'offline',
    };
  }

  /* -------------------------------- title -------------------------------- */

  attachState() {
    this.society = new Society(this.state);
    this.society.restore(this.state.society || null);
    this.society.onNote = (text, day) => {
      if (!/enters the|founded|becomes a|Hunger/.test(text)) return;
      civEvent(this.state, {
        type: 'society',
        title: text,
        detail: text,
        where: 'the camps',
        important: /enters the|founded|becomes a/.test(text),
      });
    };
    this.state.onEvent = (event) =>
      this.ui.toast(event, event.category === 'civilization' ? 'civ' : event.category === 'jolene' ? 'jolene' : 'johan');
    this.ui.setState(this.state);
  }

  newGame() {
    if (hasSave() && !this.confirmReplace()) return;
    clearSave();
    if (this.region) {
      this.region.dispose();
      this.region = null;
    }
    this.state = createState();
    this.state.started = true;
    this.attachState();
    this.ui.closeIntro();
    this.ui.closeWhatsNew();
    this.away = 0;
    this.enterCabin(true);
    this.lockLandscape();
    if (!this.touchEnabled) this.fp.lock();
    this.ui.toast({
      category: 'johan',
      day: 0,
      title: 'Johan wakes. 25 tiles of black grass and a cabin on an island.',
      important: true,
    });
    saveState(this.state);
  }

  confirmReplace() {
    return window.confirm('Begin a new world? The world saved on this device will be replaced.');
  }

  continueGame() {
    if (!this.savedState) {
      this.newGame();
      return;
    }
    this.state = this.savedState;
    this.state.started = true;
    this.attachState();
    this.ui.closeIntro();
    this.enterCabin(true);
    this.lockLandscape();
    if (!this.touchEnabled) this.fp.lock();
    if (this.state.events.some((e) => e.day > this.state.lastSeenDay)) this.ui.openWhatsNew();
    this.ui.toast({
      category: 'johan',
      day: this.state.world.day,
      title: `Johan kept working for ${this.away > 0 ? `${this.away} days` : 'a while'}. ${worldStats(this.state).population} inhabitants now.`,
      important: true,
    });
    saveState(this.state);
  }

  /* ------------------------------- lifecycle ------------------------------ */

  registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((err) => {
      console.warn('[gods-eye] service worker failed', err);
    });
  }

  bindEvents() {
    window.addEventListener('resize', () => this.onResize());
    this.renderer.domElement.addEventListener('click', (e) => {
      if (this.mode === 'cabin' && this.decorMode) {
        this.placeDecor(e);
        return;
      }
      if (this.mode === 'cabin' || this.mode === 'world') {
        if (this.ui.dialogueNpc || this.touchEnabled) return;
        this.fp.lock();
      }
    });
    this.renderer.domElement.addEventListener('pointerup', (e) => this.onCanvasPointerUp(e));

    document.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('pointerlockchange', () => {
      if (this.mode === 'cabin' || this.mode === 'world') {
        this.ui.setReticle(!!document.pointerLockElement);
      }
    });

    window.addEventListener('beforeunload', () => this.persist());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.hiddenAt = Date.now();
        this.persist();
      } else {
        this.resumeFromAway();
      }
    });

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installEvent = e;
      this.ui.showInstall(true);
    });
    window.addEventListener('appinstalled', () => {
      this.installEvent = null;
      this.ui.showInstall(false);
    });

    setInterval(() => {
      if (this.state) this.persist();
    }, 25000);
  }

  resumeFromAway() {
    if (!this.state || !this.state.started || !this.hiddenAt) return;
    const elapsed = Date.now() - this.hiddenAt;
    this.hiddenAt = 0;
    if (elapsed < 120000) return;
    const days = Math.min(600, Math.floor(elapsed / 60000) * 2);
    if (days <= 0) return;
    advanceDays(this.state, days, { quiet: true });
    this.buildTable();
    saveState(this.state);
    this.ui.toast({
      category: 'johan',
      day: this.state.world.day,
      title: `While you were away, ${days} days passed.`,
      important: true,
    });
  }

  async install() {
    if (!this.installEvent) {
      this.ui.toast({ category: 'johan', day: this.state?.world.day || 0, title: 'Use your browser menu → “Add to Home Screen” to install.' });
      return;
    }
    this.installEvent.prompt();
    try {
      await this.installEvent.userChoice;
    } catch {
      /* ignore */
    }
    this.installEvent = null;
    this.ui.showInstall(false);
  }

  toggleTouch() {
    this.touchEnabled = !this.touchEnabled;
    localStorage.setItem(TOUCH_KEY, this.touchEnabled ? '1' : '0');
    this.touchControls.setEnabled(this.touchEnabled);
    this.touchControls.setMode(this.mode);
    this.ui.updateTouchButton(this.touchEnabled);
    if (!this.touchEnabled && (this.mode === 'cabin' || this.mode === 'world')) this.fp.lock();
  }

  onResize() {
    this.presentation.resize();
  }

  onKey(e) {
    if (!this.state) return;
    if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    const key = keyCode(e);
    if (this.mode === 'table' && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE'].includes(key)) {
      if (key.startsWith('Arrow')) e.preventDefault();
      this.tableKeys.add(key);
      return;
    }
    if (key === 'Escape') {
      if (this.ui.dialogueNpc) return this.closeDialogue();
      if (!this.ui.els.whatsnew.hidden) return this.ui.closeWhatsNew();
      if (!this.ui.els.journal.hidden) return this.closeJournal();
      if (!this.ui.els.divine.hidden) return this.closeDivine();
      if (!this.ui.els.laptop.hidden) return this.closeLaptop();
      if (this.mode === 'table') return this.exitTable();
      return;
    }
    if (key === 'KeyE') return this.interact();
    if (key === 'KeyM') return this.toggleMute();
    if (key === 'KeyB') return this.toggleDecor();
    if (key === 'KeyJ') return this.toggleJournal();
    if (key === 'KeyL') return this.toggleLaptop();
    if (key === 'KeyG') return this.toggleDivine();
    if (key === 'KeyH') return this.ui.showIntro(true);
    if (key === 'KeyR' && this.mode === 'world') return this.ascend();
    if (key === 'Enter' && this.mode === 'table') return this.descend();
    if (key === 'Space') {
      e.preventDefault();
      this.setSpeed(this.state.speed === 0 ? this.resumeSpeed : 0);
      return;
    }
    if (key === 'Digit1') this.setSpeed(1);
    if (key === 'Digit2') this.setSpeed(3);
    if (key === 'Digit3') this.setSpeed(8);
  }

  setMode(mode) {
    this.mode = mode;
    const civPanel = document.getElementById('civ-panel');
    if (civPanel && mode !== 'world') civPanel.hidden = true;
    this.touchControls.setMode(mode);
    document.body.classList.toggle('playing', mode === 'cabin' || mode === 'table' || mode === 'world');
  }

  // Installed Android apps honour a real orientation lock; elsewhere the CSS
  // overlay asks politely, and the manifest declares landscape.
  lockLandscape() {
    if (!this.touchEnabled) return;
    const orientation = screen.orientation;
    if (!orientation || typeof orientation.lock !== 'function') return;
    try {
      Promise.resolve(orientation.lock('landscape')).catch(() => {});
    } catch {
      /* not installed / not fullscreen */
    }
  }

  /* -------------------------------- cabin -------------------------------- */

  enterCabin(reset = false) {
    this.setMode('cabin');
    this.scene = this.cabin.scene;
    this.orbit.enabled = false;
    this.orbit.dragging = false;
    this.fp.enabled = true;
    this.fp.bounds = { minX: -3.95, maxX: 3.95, minZ: -3.35, maxZ: 3.3 };
    this.fp.blockers = this.cabin.blockers;
    this.fp.walkable = null;
    this.fp.groundHeight = null;
    const spawn = reset || !this.cabinReturn ? this.cabin.spawn : this.cabinReturn;
    // On a phone held upright the view is narrow, so face the table squarely
    // instead of leaving the world off the right edge of the screen.
    const portrait = window.innerWidth / window.innerHeight < 1;
    const yaw = reset ? (portrait ? this.cabinAimYaw() : this.cabin.spawnYaw) : spawn.yaw || this.cabin.spawnYaw;
    this.fp.place(spawn.x, spawn.z, yaw);
    this.camera.fov = portrait ? 76 : 66;
    this.camera.updateProjectionMatrix();
    this.ui.setReticle(false);
    this.ui.closeDivine();
    this.ui.els.selection.hidden = true;
    this.buildTable(true);
    this.ui.setPrompt('');
    this.overlay = null;
    if (!this.touchEnabled) requestAnimationFrame(() => this.fp.lock());
  }

  cabinAimYaw() {
    const target = this.cabin.mapCenter;
    const spawn = this.cabin.spawn;
    return Math.atan2(-(target.x - spawn.x), -(target.z - spawn.z));
  }

  buildTable(force = false) {
    if (!this.state) return;
    const world = this.state.world;
    // Rebuilding every tile mesh is expensive, so only do it when the board
    // actually changed: new ground, a new day band, a new village or a polish.
    const signature = [
      world.tiles.size,
      Math.floor(world.day / 4),
      this.state.settlements.length,
      this.state.jolene?.polished ?? 0,
      this.state.lastSeenDay ?? 0,
    ].join(':');
    if (!force && signature === this.tableSignature) {
      this.mapTimer = 0;
      return;
    }
    this.tableSignature = signature;
    this.cabin.map.build(this.state);
    this.mapTimer = 0;
  }

  /* -------------------------------- table -------------------------------- */

  enterTable() {
    if (this.mode === 'world') return;
    this.cabinReturn = { x: this.fp.position.x, z: this.fp.position.z, yaw: this.fp.yaw };
    this.setMode('table');
    this.fp.enabled = false;
    this.fp.unlock();
    this.ui.setReticle(false);
    this.camera.fov = 52;
    this.camera.updateProjectionMatrix();
    this.orbit.setTarget(this.cabin.focusTarget);
    this.orbit.theta = -0.62;
    this.orbit.phi = 0.9;
    this.orbit.radius = 2.05;
    // The floor is one block of the board, whatever size the board currently is.
    this.orbit.minRadius = Math.max(0.05, this.cabin.map.scale * 1.7);
    this.orbit.enabled = true;
    this.orbit.update();
    this.buildTable(true);
    this.ui.setPrompt('Stick roams and turns · pinch to zoom · tap a tile · Enter walks it · Esc steps back');
    this.overlay = 'table';
    if (this.state.selected) {
      const tile = tileAt(this.state.world, this.state.selected.x, this.state.selected.y);
      if (tile) this.ui.openSelection(tile);
    }
  }

  // Free roam over the board: the stick (or WASD) walks the camera's aim across
  // the map and its sideways push turns the view, so you can cross the whole
  // world without pinching and dragging.
  moveTable(dt) {
    if (!this.state || !this.orbit.enabled) return;
    const keys = this.tableKeys;
    const touch = this.fp.touch || { x: 0, y: 0 };
    let forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    let strafe = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    let turn = (keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyE') ? 1 : 0);
    forward += -touch.y;
    // sideways push turns rather than strafes: a stick walk, not a crab walk
    turn += -touch.x * 1.4;
    if (turn) this.orbit.theta += turn * dt * 1.15;

    const mag = Math.hypot(forward, strafe);
    if (mag > 1) {
      forward /= mag;
      strafe /= mag;
    }
    const move = Math.min(1, Math.hypot(forward, strafe));
    // the camera keeps moving for a moment after you let go
    const speed = this.orbit.radius * 1.35;
    const sin = Math.sin(this.orbit.theta);
    const cos = Math.cos(this.orbit.theta);
    const fwdX = -sin;
    const fwdZ = -cos;
    const rightX = cos;
    const rightZ = -sin;
    const wantX = (fwdX * forward + rightX * strafe) * speed;
    const wantZ = (fwdZ * forward + rightZ * strafe) * speed;
    const ease = Math.min(1, dt * (move > 0.01 ? 9 : 6));
    this.tableDrift.x += (wantX - this.tableDrift.x) * ease;
    this.tableDrift.y += (wantZ - this.tableDrift.y) * ease;
    if (move < 0.01 && this.tableDrift.length() < 0.002) {
      this.tableDrift.set(0, 0);
      return;
    }
    this.orbit.target.x += this.tableDrift.x * dt;
    this.orbit.target.z += this.tableDrift.y * dt;
    // the board has edges; the aim stays on it
    const t = this.cabin.tablePos;
    this.orbit.target.x = Math.max(t.x - 1.5, Math.min(t.x + 1.5, this.orbit.target.x));
    this.orbit.target.z = Math.max(t.z - 1.05, Math.min(t.z + 1.05, this.orbit.target.z));
  }

  exitTable() {
    this.orbit.enabled = false;
    this.tableKeys.clear();
    this.tableDrift.set(0, 0);
    this.ui.els.selection.hidden = true;
    this.enterCabin(false);
  }

  onCanvasPointerUp(e) {
    if (this.mode !== 'table') return;
    if (this.orbit.moved > 8) return;
    const x = e.clientX ?? e.changedTouches?.[0]?.clientX;
    const y = e.clientY ?? e.changedTouches?.[0]?.clientY;
    if (x === undefined) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((x - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((y - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.cabin.map.pickPlane, false);
    if (!hits.length) return;
    const local = this.cabin.map.group.worldToLocal(hits[0].point.clone());
    const tile = this.cabin.map.tileFromLocal(local);
    if (!tile) return;
    this.select(tile);
  }

  select(tile) {
    if (!tile || !this.state) return;
    this.state.selected = { x: tile.x, y: tile.y };
    this.cabin.map.applySelection(this.state.selected);
    this.ui.openSelection(tile);
  }

  clearSelection() {
    if (!this.state) return;
    this.state.selected = null;
    this.cabin.map.applySelection(null);
    this.ui.els.selection.hidden = true;
  }

  // Walk straight to a camp picked from the top bar's roll.
  travelToTile(x, y) {
    if (!this.state) return;
    const tile = tileAt(this.state.world, x, y);
    if (!tile) {
      this.ui.toast({ category: 'johan', day: this.state.world.day, title: 'That ground is not on the map.' });
      return;
    }
    this.state.selected = { x, y };
    this.transition(() => this.buildRegion(tile));
  }

  descend() {
    if (!this.state || !this.state.selected) {
      this.ui.toast({ category: 'johan', day: this.state?.world.day || 0, title: 'Select a land tile on the table first.' });
      return;
    }
    const tile = tileAt(this.state.world, this.state.selected.x, this.state.selected.y);
    if (!tile || !isLand(tile) || tile.biome === 'island') {
      this.ui.toast({ category: 'johan', day: this.state.world.day, title: 'There is no walkable ground there.' });
      return;
    }
    this.transition(() => this.buildRegion(tile));
  }

  buildRegion(tile) {
    if (this.region) {
      this.region.dispose();
      this.region = null;
    }
    this.region = new Region(this.state, tile);
    this.scene = this.region.scene;
    const founded = this.society.ensureFounded(tile);
    if (!founded && !this.society.data?.founded && this.society.waitingOnGrass) {
      this.ui.toast({
        category: 'johan',
        day: this.state.world.day,
        title: `They will not settle on ${this.society.waitingOnGrass}. Walk them onto grass and they will found their camp.`,
      });
    }
    this.society.attachRegion(this.region);
    this.societyHudIn = 0;
    this.drawCivHud();
    this.setMode('world');
    this.orbit.enabled = false;
    this.fp.enabled = true;
    this.fp.bounds = this.region.tilesBounds();
    this.fp.blockers = [];
    this.fp.walkable = (x, z) => this.region.walkable(x, z);
    this.fp.groundHeight = (x, z) => this.region.groundAt(x, z);
    this.fp.place(this.region.spawn.x, this.region.spawn.z, 0);
    this.camera.fov = 72;
    this.camera.updateProjectionMatrix();
    this.ui.els.selection.hidden = true;
    this.ui.closeDivine();
    this.ui.setPrompt('');
    this.ui.setReticle(false);
    this.overlay = null;
    this.ui.toast({
      category: 'johan',
      day: this.state.world.day,
      title: `Johan stands at ${tile.x},${tile.y} — ${tile.biome}.`,
    });
    if (!this.touchEnabled) requestAnimationFrame(() => this.fp.lock());
  }

  drawCivHud() {
    const panel = document.getElementById('civ-panel');
    if (!panel) return;
    const show = this.mode === 'world' && !!this.society?.founded;
    panel.hidden = !show;
    if (!show) return;
    const snap = this.society.snapshot(this.fp.position);
    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    set('civ-camp', snap.name);
    set('civ-era', snap.era);
    set('civ-blurb', snap.blurb);
    set('civ-stats', `${snap.population} people · ${snap.homes} homes · ${snap.territory} tiles held`);
    set('civ-gov', `${snap.government}${snap.leader ? ` · led by ${snap.leader}` : ''} · ${snap.camps} camps${snap.wars ? ` · ${snap.wars} at war` : ''}`);
    set('civ-gov', `${snap.government}${snap.leader ? ` · led by ${snap.leader}` : ''}`);
    set('civ-stores', `food ${snap.food} · wood ${snap.wood} · ${snap.born} born, ${snap.died} lost`);
    const fill = document.getElementById('civ-fill');
    if (fill) fill.style.width = `${Math.round(snap.progress * 100)}%`;
    set('civ-next', snap.next ? `toward the ${snap.next} — ${snap.knowledge} knowledge` : 'the last age, and they know it');
    const works = [...snap.businesses.slice(-3), ...snap.civics.slice(-2)];
    set('civ-works', works.length ? works.join(' · ') : 'no trades or civic halls yet');
    const inSight = this.society.views.length > 0;
    set('civ-task', snap.person
      ? `${inSight ? '' : 'No camp in sight — '}${snap.person.name}, ${snap.person.age}, is a ${snap.person.job}.`
      : '');
  }

  ascend() {
    if (this.mode !== 'world') return;
    this.transition(() => {
      if (this.society) {
        this.society.detach();
        this.society.save();
      }
      const leaving = this.region;
      this.region = null;
      this.enterCabin(false);
      if (leaving) leaving.dispose();
      this.ui.toast({ category: 'johan', day: this.state.world.day, title: 'Back in the cabin. The table is already different.' });
    });
  }

  transition(fn) {
    this.ui.fade(true);
    setTimeout(() => {
      fn();
      this.ui.fade(false);
    }, 300);
  }

  /* ------------------------------- overlays ------------------------------- */

  /* -------------------------------- decorate ------------------------------- */

  toggleDecor(force = null) {
    if (this.mode !== 'cabin') return;
    this.decorMode = force === null ? !this.decorMode : force;
    const bar = document.getElementById('decor-bar');
    if (bar) bar.hidden = !this.decorMode;
    if (this.decorMode) {
      this.fp.unlock();
      this.ui.setPrompt('');
      this.syncDecorBar();
    } else {
      this.ui.setPrompt('');
    }
  }

  syncDecorBar() {
    document.querySelectorAll('.decor-pick[data-decor]').forEach((btn) => {
      const id = btn.dataset.decor;
      btn.classList.toggle('on', id === this.decorPick);
    });
  }

  setDecorPick(id) {
    if (id === 'done') return this.toggleDecor(false);
    this.decorPick = id;
    this.syncDecorBar();
  }

  // A tap in the room: place the chosen piece where the floor was hit, or clear
  // whatever sits under the finger when Remove is chosen.
  placeDecor(e) {
    const x = e.clientX ?? e.changedTouches?.[0]?.clientX;
    const y = e.clientY ?? e.changedTouches?.[0]?.clientY;
    if (x === undefined || !this.cabin.floor) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((x - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((y - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.cabin.floor, false);
    if (!hits.length) return;
    const point = hits[0].point;
    // keep furniture off the walls
    const px = Math.max(-3.9, Math.min(3.9, point.x));
    const pz = Math.max(-3.2, Math.min(3.2, point.z));

    if (this.decorPick === 'remove') {
      const item = this.decor.nearest(px, pz, 0.9);
      if (item) {
        this.decor.remove(this.cabin.root, this.cabin.blockers, item);
        this.sound?.cue('tap');
      }
      return;
    }

    const yaw = Math.atan2(this.fp.position.x - px, this.fp.position.z - pz);
    this.decor.add(this.cabin.root, this.cabin.blockers, this.decorPick, px, pz, yaw);
    this.sound?.cue('open');
  }

  toggleJournal() {
    if (this.ui.els.journal.hidden) this.openJournal();
    else this.closeJournal();
  }

  openJournal() {
    this.ui.openJournal();
    this.fp.enabled = false;
    this.fp.unlock();
    this.overlay = 'journal';
  }

  closeJournal() {
    this.ui.closeJournal();
    this.overlay = null;
    if (this.mode === 'cabin' || this.mode === 'world') {
      this.fp.enabled = true;
      if (!this.touchEnabled) requestAnimationFrame(() => this.fp.lock());
    }
  }

  /* --------------------------------- laptop -------------------------------- */

  toggleLaptop() {
    if (!this.state) return;
    if (this.ui.els.laptop.hidden) this.openLaptop();
    else this.closeLaptop();
  }

  laptopAgents() {
    const agents = [{ id: 'johan', label: this.state?.johan?.name || 'Johan' }];
    for (const sector of this.state?.sectors || []) agents.push({ id: sector.dresser, label: sector.dresser });
    return agents;
  }

  selectAgent(id) {
    if (!this.state) return;
    this.laptopAgent = id;
    this.ui.renderLaptopAgents(this.laptopAgents(), id);
    if (this.ui.els.laptopInput) {
      this.ui.els.laptopInput.placeholder = `tell ${id} what to do…`;
      this.ui.els.laptopInput.focus();
    }
  }

  openLaptop() {
    if (!this.state) return;
    this.fp.enabled = false;
    this.fp.unlock();
    const agents = this.laptopAgents();
    if (!agents.some((a) => a.id === this.laptopAgent)) this.laptopAgent = agents[0].id;
    this.ui.renderLaptopAgents(agents, this.laptopAgent);
    this.ui.openLaptop();
    this.overlay = 'laptop';
  }

  closeLaptop() {
    this.ui.closeLaptop();
    if (this.overlay === 'laptop') this.overlay = null;
    if (this.mode === 'cabin') {
      this.fp.enabled = true;
      if (!this.touchEnabled) this.fp.lock();
    }
  }

  submitOrder(text) {
    if (!this.state) return;
    const raw = String(text || '').trim();
    if (!raw) return;

    // Typing a name in front still works; otherwise the selected tab decides who
    // is being spoken to.
    const agents = this.laptopAgents();
    const firstWord = raw.split(/[\s:,]+/)[0];
    const match = agents.find((a) => a.label.toLowerCase() === firstWord.toLowerCase())
      || (firstWord.toLowerCase() === 'jolene' ? { id: 'jolene', label: 'Jolene' } : null);

    let who = this.laptopAgent || agents[0].id;
    let instruction = raw;
    if (match) {
      who = match.id;
      instruction = raw.slice(firstWord.length).replace(/^[\s:,.-]+/, '');
      if (!instruction) {
        this.ui.laptopSay('you', raw);
        this.ui.laptopSay(who, `${who} is listening. Say what to do.`);
        return;
      }
      this.selectAgent(match.id);
    }

    if (/^(crew|sectors)$/i.test(raw)) {
      this.ui.laptopSay('you', raw);
      const crew = runOrder(this.state, 'crew', '', null);
      this.ui.laptopSay('crew', crew.detail || crew.title);
      return;
    }

    this.ui.laptopSay('you', raw);
    const tile = this.mode === 'world' && this.region
      ? tileAt(this.state.world, this.region.center.x, this.region.center.y)
      : null;
    const result = runOrder(this.state, who, instruction, tile);
    this.ui.laptopSay(result.category || who, result.detail ? `${result.title} ${result.detail}` : result.title);
    if (!result.ok) return;
    this.buildTable(true);
    this.ui.renderSelection();
    if (this.mode === 'world' && this.region) {
      const center = tileAt(this.state.world, this.region.center.x, this.region.center.y);
      if (center) this.buildRegion(center);
    }
    saveState(this.state);
  }

  toggleDivine() {
    if (this.ui.els.divine.hidden) {
      this.ui.openDivine();
      this.overlay = 'divine';
    } else {
      this.closeDivine();
    }
  }

  openDivine(tile) {
    if (tile && this.state) {
      this.state.selected = { x: tile.x, y: tile.y };
      this.ui.updateDivineTarget();
    }
    this.ui.openDivine();
  }

  closeDivine() {
    this.ui.closeDivine();
    if (this.overlay === 'divine') this.overlay = null;
  }

  closePanel(name) {
    if (name === 'selection') {
      this.ui.els.selection.hidden = true;
      if (this.state) this.state.selected = null;
      this.cabin.map.applySelection(null);
    } else if (name === 'divine') {
      this.closeDivine();
    } else if (name === 'laptop') {
      this.closeLaptop();
    } else if (name === 'journal') {
      this.closeJournal();
    } else if (name === 'whatsnew') {
      this.ui.closeWhatsNew();
    } else if (name === 'dialogue') {
      this.closeDialogue();
    }
  }

  closeDialogue() {
    this.ui.closeDialogue();
    if (this.mode === 'world') {
      this.fp.enabled = true;
      if (!this.touchEnabled) requestAnimationFrame(() => this.fp.lock());
    }
    this.touchControls.setMode(this.mode);
  }

  acknowledge() {
    if (!this.state) return;
    this.state.lastSeenDay = this.state.world.day;
    this.ui.closeWhatsNew();
    this.ui.closeJournal();
    if (this.mode === 'table') this.buildTable();
    saveState(this.state);
    this.ui.toast({ category: 'johan', day: this.state.world.day, title: 'The record is acknowledged. Nothing is forgotten.' });
  }

  setSpeed(speed) {
    if (!this.state) return;
    if (speed > 0) this.resumeSpeed = speed;
    this.state.speed = speed;
    this.ui.update(this.state);
  }

  /* -------------------------------- touch -------------------------------- */

  setVolume(value) {
    this.sound.setVolume(value / 10);
    this.ui.syncVolume();
    if (value > 0 && !this.sound.muted) this.sound.cue('tap');
  }

  toggleMute() {
    this.sound.toggleMute();
    this.ui.syncVolume();
    if (!this.sound.muted) this.sound.cue('tap');
  }

  lookBy(dx, dy) {
    if (this.mode !== 'cabin' && this.mode !== 'world') return;
    this.fp.yaw -= dx * 0.0055;
    this.fp.pitch = Math.max(-1.1, Math.min(1.1, this.fp.pitch - dy * 0.0055));
  }

  touchAction(kind) {
    if (!this.state) return;
    if (kind === 'interact') return this.interact();
    if (kind === 'back') {
      if (this.ui.dialogueNpc) return this.closeDialogue();
      if (this.mode === 'table') return this.exitTable();
      if (this.mode === 'world') return this.ascend();
      return;
    }
    if (kind === 'journal') return this.toggleJournal();
    if (kind === 'divine') return this.toggleDivine();
    if (kind === 'walk') return this.descend();
    if (kind === 'zoomin') {
      this.orbit.zoomBy(-0.35);
      this.orbit.update();
      return;
    }
    if (kind === 'zoomout') {
      this.orbit.zoomBy(0.35);
      this.orbit.update();
    }
  }

  /* ------------------------------ simulation ----------------------------- */

  tick(dt) {
    if (!this.state || !this.state.started) return;
    const state = this.state;
    const paused = state.speed === 0 || this.overlay === 'journal' || this.overlay === 'whatsnew' || this.mode === 'title';
    if (!paused) {
      this.simAccumulator += dt * DAYS_PER_SECOND * state.speed;
      let steps = 0;
      while (this.simAccumulator >= 1 && steps < 40) {
        advanceDays(state, 1);
        this.simAccumulator -= 1;
        steps++;
      }
      if (this.simAccumulator > 30) this.simAccumulator = 0;
    }
    this.mapTimer += dt;
    const interval = this.mode === 'table' ? 0.9 : 2.2;
    if (this.mapTimer > interval && (this.mode === 'cabin' || this.mode === 'table')) {
      this.buildTable();
      if (this.state.selected && this.cabin.map) this.cabin.map.applySelection(this.state.selected);
      if (this.state.selected && !this.ui.els.selection.hidden) this.ui.renderSelection();
    }
    this.uiTimer += dt;
    if (this.uiTimer > 0.4) {
      this.uiTimer = 0;
      this.ui.update(state);
      this.ui.updateKingdoms();
    }
    this.saveTimer += dt;
    if (this.saveTimer > 20) {
      this.saveTimer = 0;
      saveState(state);
    }
    if (this.region && this.mode === 'world') {
      this.nearestNpc = this.region.nearestNpc(this.fp.position, 3.4);
    }
  }

  persist() {
    this.society?.save();
    if (this.state) saveState(this.state);
  }

  /* ------------------------------ interaction ----------------------------- */

  interact() {
    if (!this.state) return;
    if (this.mode === 'table') return this.descend();
    if (this.mode === 'world') {
      if (this.ui.dialogueNpc) return;
      const actor = this.region?.nearestNpc(this.fp.position, 3.4);
      if (actor) {
        this.fp.enabled = false;
        this.fp.unlock();
        this.ui.openDialogue(actor.npc);
        this.touchControls.setMode('dialogue');
      } else {
        this.ui.toast({ category: 'johan', day: this.state.world.day, title: 'No inhabitant within reach.' });
      }
      return;
    }
    if (this.mode !== 'cabin') return;
    const pos = this.fp.position;
    const dLaptop = this.cabin.laptopPos
      ? Math.hypot(pos.x - this.cabin.laptopPos.x, pos.z - this.cabin.laptopPos.z)
      : Infinity;
    const dTable = Math.hypot(pos.x - this.cabin.tablePos.x, pos.z - this.cabin.tablePos.z);
    const dJournal = Math.hypot(pos.x - 2.35, pos.z - -3.52);
    const dBed = Math.hypot(pos.x - -3.15, pos.z - -2.1);
    if (dLaptop < 1.75) this.openLaptop();
    else if (dTable < 2.35) this.enterTable();
    else if (dJournal < 2.4) this.openJournal();
    else if (dBed < 2.4) this.rest();
  }

  rest() {
    if (!this.state) return;
    const before = worldStats(this.state);
    advanceDays(this.state, 30, { quiet: true });
    const after = worldStats(this.state);
    this.buildTable();
    saveState(this.state);
    const born = after.population - before.population;
    this.ui.toast({
      category: 'johan',
      day: this.state.world.day,
      title: `Johan slept. 30 days passed. ${after.population} inhabitants now, ${born >= 0 ? '+' : ''}${born} since he lay down.`,
    });
  }

  talkTo(topic) {
    if (!this.state || !this.ui.dialogueNpc) return null;
    return talk(this.state, this.ui.dialogueNpc, topic, Math.random);
  }

  /* --------------------------------- god --------------------------------- */

  godAct(kind) {
    if (!this.state) return;
    let tile = null;
    if (this.state.selected) tile = tileAt(this.state.world, this.state.selected.x, this.state.selected.y);
    if (!tile && this.mode === 'world') tile = tileAt(this.state.world, this.region.center.x, this.region.center.y);
    if (!tile) {
      this.ui.toast({ category: 'johan', day: this.state.world.day, title: 'Aim first: select a tile on the table or stand in the world.' });
      return;
    }
    const event = godAction(this.state, kind, tile, Math.random);
    if (!event) {
      this.ui.toast({ category: 'johan', day: this.state.world.day, title: 'Johan cannot do that here.' });
      return;
    }
    this.ui.toast(event, event.type === 'disaster' ? 'war' : 'johan');
    this.buildTable();
    this.ui.renderSelection();
    if (this.mode === 'world' && this.region) {
      this.buildRegion(tileAt(this.state.world, this.region.center.x, this.region.center.y) || tile);
    }
    saveState(this.state);
  }

  /* --------------------------------- loop -------------------------------- */

  updatePrompts() {
    if (!this.state) return;
    if (this.touchEnabled) {
      this.ui.setPrompt('');
      return;
    }
    const blocked =
      this.overlay === 'journal' || this.overlay === 'whatsnew' || this.overlay === 'divine' ||
      this.overlay === 'laptop' || this.ui.dialogueNpc;
    if (blocked || !this.ui.els.whatsnew.hidden || !this.ui.els.journal.hidden) {
      this.ui.setPrompt('');
      return;
    }
    if (this.mode === 'table') {
      this.ui.setPrompt('WASD roams · Q/E or drag turns · wheel zooms · click a tile · Enter walks it');
      return;
    }
    if (this.mode === 'world') {
      const actor = this.region?.nearestNpc(this.fp.position, 3.4);
      this.ui.setPrompt(actor ? `Speak with ${actor.npc.name}` : 'R returns to the cabin');
      return;
    }
    if (this.mode === 'cabin') {
      const pos = this.fp.position;
      const dTable = Math.hypot(pos.x - this.cabin.tablePos.x, pos.z - this.cabin.tablePos.z);
      const dJournal = Math.hypot(pos.x - 2.35, pos.z - -3.52);
      const dBed = Math.hypot(pos.x - -3.15, pos.z - -2.1);
      const dLaptop = this.cabin.laptopPos
        ? Math.hypot(pos.x - this.cabin.laptopPos.x, pos.z - this.cabin.laptopPos.z)
        : Infinity;
      if (dLaptop < 1.75) this.ui.setPrompt('Open the laptop and give an order');
      else if (dTable < 2.35) this.ui.setPrompt('Look into the living world table');
      else if (dJournal < 2.4) this.ui.setPrompt('Read the journal of the world');
      else if (dBed < 2.4) this.ui.setPrompt('Sleep — let 30 days turn');
      else this.ui.setPrompt('');
    }
  }

  loop() {
    requestAnimationFrame(this.loop);
    const frameDt = this.clock.getDelta();
    const dt = Math.min(0.05, frameDt);
    this.elapsed += dt;

    this.tick(dt);
    this.society?.tick(Math.min(0.5, frameDt));
    this.sound.update(dt);

    if (this.mode === 'table') {
      this.moveTable(dt);
      this.orbit.update();
      this.cabin.update(dt, this.elapsed);
      this.scene = this.cabin.scene;
    } else if (this.mode === 'cabin') {
      this.fp.update(dt);
      this.cabin.update(dt, this.elapsed);
      this.scene = this.cabin.scene;
    } else if (this.mode === 'world' && this.region) {
      this.fp.update(dt);
      this.region.update(dt, this.elapsed, this.fp.position);
      this.scene = this.region.scene;
      if (this.society) {
        this.society.updateVisuals(Math.min(0.05, frameDt), this.fp.position);
        this.societyHudIn -= dt;
        if (this.societyHudIn <= 0) {
          this.societyHudIn = 0.4;
          this.drawCivHud();
        }
      }
    }

    if (this.society?.founded && (this.mode === 'table' || this.mode === 'cabin')
      && this.elapsed - (this.mapSocietyAt || 0) > 1.2) {
      this.mapSocietyAt = this.elapsed;
      this.cabin.map.updateSociety(this.society);
    }

    this.updatePrompts();
    this.ui.setReticle(
      (this.mode === 'cabin' || this.mode === 'world') && !this.ui.dialogueNpc && !!document.pointerLockElement,
    );

    this.presentation.render(this.scene);
  }
}

const game = new Game();
window.__godsEye = game;

// The perf overlay is opt-in and loaded on demand, so an ordinary visit never
// downloads it. ?perf=1 turns it on for the device under test.
if (new URLSearchParams(location.search).get('perf') === '1') {
  import('./perf.js')
    .then((mod) => mod.startPerfOverlay(game))
    .catch((err) => console.warn('[gods-eye] perf overlay unavailable', err));
}
