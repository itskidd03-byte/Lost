import { dateLabel } from './journal.js';
import { BIOMES } from './world.js';
import { opinionWord } from './life.js';

const $ = (sel) => document.querySelector(sel);

const DIVINE_GROUPS = [
  {
    title: 'Shape the land',
    acts: [
      ['mountain', 'Raise mountains'], ['river', 'Carve river'], ['forest', 'Grow forest'],
      ['lake', 'Fill lake'], ['newland', 'Raise new land'], ['blessfertility', 'Make fertile'],
    ],
  },
  {
    title: 'Disasters',
    acts: [
      ['tornado', 'Tornado'], ['hurricane', 'Hurricane'], ['earthquake', 'Earthquake'],
      ['flood', 'Flood'], ['drought', 'Drought'], ['wildfire', 'Wildfire'],
      ['volcano', 'Volcano'], ['blizzard', 'Blizzard'], ['heatwave', 'Heat wave'],
      ['tsunami', 'Tsunami'], ['meteor', 'Meteor'], ['landslide', 'Landslide'], ['storm', 'Severe storm'],
    ],
  },
  {
    title: 'Disease',
    acts: [['plague', 'Release plague'], ['animaldisease', 'Animal sickness'], ['plantdisease', 'Blight the crops']],
  },
  {
    title: 'Emotional influence',
    acts: [
      ['emotion_hope', 'Hope'], ['emotion_trust', 'Trust'], ['emotion_compassion', 'Compassion'],
      ['emotion_courage', 'Courage'], ['emotion_creativity', 'Creativity'],
      ['emotion_fear', 'Fear'], ['emotion_anger', 'Anger'], ['emotion_paranoia', 'Paranoia'],
      ['emotion_greed', 'Greed'], ['emotion_despair', 'Despair'], ['emotion_jealousy', 'Jealousy'],
    ],
  },
  {
    title: 'Beasts',
    acts: [['predator', 'Set predators loose']],
  },
  {
    title: 'Divine money',
    acts: [
      ['donate', 'Donate to this settlement'],
      ['donate_npc', 'Give to a civilian'],
      ['donate_building', 'Fund a building'],
    ],
  },
];

const MOOD_WORDS = (m) => (m > 0.72 ? 'hopeful' : m > 0.55 ? 'content' : m > 0.4 ? 'uneasy' : 'afraid');

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export class UI {
  constructor(game) {
    this.game = game;
    this.state = null;
    this.journalTab = 'all';
    this.lastPrompt = '';
    this.lastSelectionRender = 0;
    this.dialogueNpc = null;
    this.introHelp = false;
    this.authMode = 'signin';
    this.els = {
      clock: $('#clock'),
      statPop: $('#stat-pop'),
      statTiles: $('#stat-tiles'),
      statNations: $('#stat-nations'),
      statWars: $('#stat-wars'),
      prompt: $('#prompt'),
      promptText: $('#prompt-text'),
      selection: $('#selection'),
      selTitle: $('#sel-title'),
      selSub: $('#sel-sub'),
      selBody: $('#sel-body'),
      selActions: $('#sel-actions'),
      divine: $('#divine'),
      divineBody: $('#divine-body'),
      divineTarget: $('#divine-target'),
      journal: $('#journal'),
      journalBody: $('#journal-body'),
      laptop: $('#laptop'),
      laptopTabs: $('#laptop-tabs'),
      laptopLog: $('#laptop-log'),
      laptopInput: $('#laptop-input'),
      laptopForm: $('#laptop-form'),
      whatsnew: $('#whatsnew'),
      whatsnewBody: $('#whatsnew-body'),
      dialogue: $('#dialogue'),
      dlgName: $('#dlg-name'),
      dlgMeta: $('#dlg-meta'),
      dlgText: $('#dlg-text'),
      dlgTopics: $('#dlg-topics'),
      dlgOpinion: $('#dlg-opinion'),
      toasts: $('#toasts'),
      auth: $('#auth'),
      intro: $('#intro'),
      fade: $('#fade'),
      reticle: $('#reticle'),
      volSlider: $('#vol-slider'),
      volBtn: $('#btn-vol'),
      volNum: $('#vol-num'),
      volWrap: $('#vol'),
    };
    this.buildDivine();
    this.bind();
    this.syncVolume();
  }

  // The slider is ten steps, the sound is nought to one; this keeps the two in
  // step however the volume was changed (slider, mute button or the saved value).
  syncVolume() {
    const sound = this.game.sound;
    if (!sound) return;
    const step = Math.round(sound.volume * 10);
    if (this.els.volSlider && document.activeElement !== this.els.volSlider) {
      this.els.volSlider.value = String(step);
    }
    if (this.els.volNum) this.els.volNum.textContent = String(step);
    if (this.els.volBtn) {
      this.els.volBtn.textContent = sound.muted || sound.volume === 0 ? '✕' : '♪';
      this.els.volBtn.title = sound.muted ? 'Sound off (M)' : 'Sound (M)';
    }
    this.els.volWrap?.classList.toggle('muted', sound.muted || sound.volume === 0);
  }

  bind() {
    $('#btn-new')?.addEventListener('click', () => {
      if (this.introHelp) this.closeIntro();
      else this.game.newGame();
    });
    $('#btn-continue')?.addEventListener('click', () => this.game.continueGame());
    $('#btn-install')?.addEventListener('click', () => this.game.install());
    $('#btn-touch')?.addEventListener('click', () => this.game.toggleTouch());
    $('#btn-journal')?.addEventListener('click', () => this.game.toggleJournal());
    $('#btn-laptop')?.addEventListener('click', () => this.game.toggleLaptop());
    this.els.laptopForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = (this.els.laptopInput?.value || '').trim();
      if (!text) return;
      this.els.laptopInput.value = '';
      this.game.submitOrder(text);
    });
    $('#btn-divine')?.addEventListener('click', () => this.game.toggleDivine());
    $('#btn-help')?.addEventListener('click', () => this.showIntro(true));
    this.els.volSlider?.addEventListener('input', (e) => {
      this.game.setVolume(Number(e.target.value));
    });
    this.els.volBtn?.addEventListener('click', () => this.game.toggleMute());
    $('#btn-decor')?.addEventListener('click', () => this.game.toggleDecor());
    document.querySelectorAll('.decor-pick[data-decor]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.game.setDecorPick(btn.dataset.decor);
      });
    });
    $('#btn-ack')?.addEventListener('click', () => this.game.acknowledge());
    $('#btn-ack2')?.addEventListener('click', () => this.game.acknowledge());

    $('#auth-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = $('#auth-email')?.value.trim() || '';
      const password = $('#auth-password')?.value || '';
      if (!email || password.length < 6) {
        this.authMessage('Enter an email and a password of at least six characters.');
        return;
      }
      this.game.signIn(email, password, this.authMode === 'signup');
    });
    $('#auth-switch')?.addEventListener('click', () =>
      this.setAuthMode(this.authMode === 'signup' ? 'signin' : 'signup'),
    );
    $('#auth-skip')?.addEventListener('click', () => this.game.playLocally());
    $('#btn-signout')?.addEventListener('click', () => this.game.signOut());

    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => this.game.closePanel(btn.dataset.close));
    });

    document.querySelectorAll('#speed button').forEach((btn) => {
      btn.addEventListener('click', () => this.game.setSpeed(Number(btn.dataset.speed)));
    });

    document.querySelectorAll('.book-tabs [data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.journalTab = btn.dataset.tab;
        document.querySelectorAll('.book-tabs [data-tab]').forEach((b) => b.classList.toggle('on', b === btn));
        this.renderJournal();
      });
    });
  }

  buildDivine() {
    this.els.divineBody.innerHTML = DIVINE_GROUPS.map(
      (group) => `
      <div class="divine-group">
        <h4>${group.title}</h4>
        <div class="row">
          ${group.acts.map(([kind, label]) => `<button class="btn" data-god="${kind}">${label}</button>`).join('')}
        </div>
      </div>`,
    ).join('');
    this.els.divineBody.querySelectorAll('[data-god]').forEach((btn) => {
      btn.addEventListener('click', () => this.game.godAct(btn.dataset.god));
    });
  }

  setState(state) {
    this.state = state;
  }

  showIntro(help = false) {
    this.introHelp = !!help;
    this.els.auth.hidden = true;
    this.els.intro.hidden = false;
    this.els.intro.style.zIndex = help ? '70' : '';
    const btn = $('#btn-new');
    if (btn) {
      btn.textContent = help ? 'Close' : 'Begin a new world';
      btn.disabled = false;
    }
    const save = $('#title-save');
    if (save) save.hidden = help ? true : !this.game.savedState;
    const account = $('#account');
    if (account) account.hidden = !!help;
    const signout = $('#btn-signout');
    if (signout) signout.hidden = !!help || this.game.auth.status !== 'in';
  }

  closeIntro() {
    this.els.intro.hidden = true;
    this.introHelp = false;
    this.els.intro.style.zIndex = '';
  }

  showTitleLoading() {
    this.els.auth.hidden = true;
    this.els.intro.hidden = false;
    const btn = $('#btn-new');
    if (btn) {
      btn.textContent = 'Waking Johan…';
      btn.disabled = true;
    }
    const save = $('#title-save');
    if (save) save.hidden = true;
    const account = $('#account');
    if (account) account.textContent = '';
    const signout = $('#btn-signout');
    if (signout) signout.hidden = true;
  }

  showAuthGate() {
    this.els.intro.hidden = true;
    this.els.auth.hidden = false;
    this.setAuthMode('signin');
  }

  setAuthMode(mode) {
    this.authMode = mode === 'signup' ? 'signup' : 'signin';
    const signup = this.authMode === 'signup';
    const title = $('#auth-title');
    if (title) title.textContent = signup ? 'Create an account' : 'Sign in';
    const lede = $('#auth-lede');
    if (lede) {
      lede.textContent = signup
        ? 'An email and a password. The account names this world and keeps it yours.'
        : 'Your world is kept on this device. Sign in so it carries your name and is still yours when you come back.';
    }
    const submit = $('#auth-submit');
    if (submit) submit.textContent = signup ? 'Create account' : 'Sign in';
    const swap = $('#auth-switch');
    if (swap) swap.textContent = signup ? 'Already have an account? Sign in' : 'New here? Create an account';
    const password = $('#auth-password');
    if (password) password.autocomplete = signup ? 'new-password' : 'current-password';
    this.authMessage('');
  }

  authMessage(text) {
    const el = $('#auth-message');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('on', !!text);
  }

  authBusy(on, label) {
    const submit = $('#auth-submit');
    if (!submit) return;
    if (on) {
      submit.dataset.label = submit.dataset.label || submit.textContent;
      submit.textContent = label || 'Working…';
      submit.disabled = true;
    } else {
      submit.textContent = submit.dataset.label || (this.authMode === 'signup' ? 'Create account' : 'Sign in');
      submit.disabled = false;
    }
  }

  showTitle(info = {}) {
    this.introHelp = false;
    this.els.auth.hidden = true;
    this.els.intro.hidden = false;
    this.els.intro.style.zIndex = '';
    const btn = $('#btn-new');
    if (btn) {
      btn.textContent = 'Begin a new world';
      btn.disabled = false;
    }
    const save = $('#title-save');
    if (save) save.hidden = !info.hasSave;
    if (info.hasSave) {
      const summary = $('#save-summary');
      if (summary) summary.textContent = info.summary;
    }
    const account = $('#account');
    if (account) {
      account.hidden = false;
      account.innerHTML = info.account
        ? info.signedIn
          ? `Signed in as <b>${escapeHtml(info.account)}</b>`
          : escapeHtml(info.account)
        : '';
    }
    const signout = $('#btn-signout');
    if (signout) signout.hidden = !info.signedIn;
    const note = $('#title-note');
    if (note) {
      note.textContent = info.hasSave
        ? 'Johan has been working while you were gone.'
        : 'Johan sleeps until a world is begun. After that he never stops.';
    }
    this.showInstall(!!this.game.installEvent);
    this.updateTouchButton(this.game.touchEnabled);
  }

  showInstall(on) {
    const btn = $('#btn-install');
    if (btn) btn.hidden = !on;
  }

  updateTouchButton(on) {
    const btn = $('#btn-touch');
    if (btn) btn.textContent = `Touch controls: ${on ? 'on' : 'off'}`;
  }

  update(state) {
    this.state = state;
    if (!state) return;
    const w = state.world;
    this.els.clock.textContent = dateLabel(w.day);
    this.els.statPop.textContent = String(state.npcs.filter((n) => n.alive).length);
    this.els.statTiles.textContent = String(w.tiles.size);
    this.els.statNations.textContent = String(state.nations.filter((n) => n.alive).length);
    const wars = state.wars.filter((x) => !x.endedDay).length;
    this.els.statWars.hidden = wars === 0;
    if (wars) this.els.statWars.innerHTML = `<b>${wars}</b> war${wars > 1 ? 's' : ''}`;

    document.querySelectorAll('#speed button').forEach((btn) => {
      btn.classList.toggle('on', Number(btn.dataset.speed) === state.speed);
    });

    const sel = state.selected;
    if (sel && !this.els.selection.hidden && performance.now() - this.lastSelectionRender > 800) {
      this.renderSelection();
    }
    this.updateDivineTarget();
  }

  setPrompt(text) {
    if (text === this.lastPrompt) return;
    this.lastPrompt = text;
    if (!text) {
      this.els.prompt.hidden = true;
      return;
    }
    this.els.promptText.textContent = text;
    this.els.prompt.hidden = false;
  }

  setReticle(on) {
    this.els.reticle.hidden = !on;
  }

  toast(event, kind = 'johan') {
    if (!event) return;
    // Fast-forward stays readable: only turning points interrupt.
    if (this.state && this.state.speed > 1 && !event.important) return;
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = `<b>${event.category === 'johan' ? 'Johan' : 'The world'} · ${dateLabel(event.day)}</b><br>${event.title}`;
    this.els.toasts.appendChild(el);
    while (this.els.toasts.children.length > 3) this.els.toasts.firstChild.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 600);
    }, 6200);
  }

  openSelection(tile) {
    if (!tile || !this.state) return;
    this.els.selection.hidden = false;
    this.renderSelection();
  }

  renderSelection() {
    const state = this.state;
    const sel = state?.selected;
    if (!sel) return;
    const tile = state.world.tiles.get(`${sel.x},${sel.y}`);
    if (!tile) {
      this.els.selection.hidden = true;
      return;
    }
    this.lastSelectionRender = performance.now();
    const def = BIOMES[tile.biome] || BIOMES.blackgrass;
    const settlement = tile.settlementId ? state.settlements.find((s) => s.id === tile.settlementId && s.alive) : null;
    const nation = settlement?.nationId ? state.nations.find((n) => n.id === settlement.nationId) : null;
    const land = !['ocean', 'lake', 'river', 'coast'].includes(tile.biome);
    const isCabin = tile.biome === 'island';

    this.els.selTitle.textContent = settlement ? settlement.name : def.name;
    this.els.selSub.textContent = `Tile ${tile.x}, ${tile.y}${isCabin ? ' · Johan’s own island' : ''}`;

    const rows = [
      ['Terrain', def.name],
      ['Detail', `${Math.round(tile.detail * 100)}%`],
      ['Fertility', land ? `${Math.round(tile.fertility * 100)}%` : '—'],
      ['Wildlife', land ? String(tile.wildlife) : '—'],
      ['Resources', tile.resources.length ? tile.resources.join(', ') : 'none found'],
    ];
    if (settlement) {
      rows.push(['Settlement', `${settlement.tier} · ${settlement.population} souls`]);
      rows.push(['Buildings', settlement.buildings.length ? settlement.buildings.join(', ') : 'none yet']);
      rows.push(['Mood', MOOD_WORDS(settlement.mood)]);
      rows.push(['Nation', nation ? `${nation.name} (${nation.gov})` : 'independent']);
      if (settlement.tech.length) rows.push(['Knowledge', settlement.tech.join(', ')]);
    }
    if (tile.moodTag) rows.push(['Feeling', `${tile.moodTag} (${tile.mood > 0 ? '+' : ''}${tile.mood.toFixed(2)})`]);
    if (tile.war) {
      const wars = state.wars.filter((w) => !w.endedDay);
      const lines = wars
        .map((w) => {
          const a = state.nations.find((n) => n.id === w.aId);
          const b = state.nations.find((n) => n.id === w.bId);
          return a && b ? `${a.name} vs ${b.name}` : null;
        })
        .filter(Boolean);
      rows.push(['War', lines.length ? lines.join('; ') : 'front active']);
    }
    if (tile.blood > 0) rows.push(['Marked', 'blood soaked into this ground']);
    if (tile.disaster && state.world.day - tile.disaster.day < 12) {
      rows.push(['Disaster', `${tile.disaster.type}, ${state.world.day - tile.disaster.day} days ago`]);
    }
    if (tile.resources.length === 0 && land && !settlement) rows.push(['Empty', 'Johan has not refined this ground']);

    this.els.selBody.innerHTML = `<dl class="kv">${rows
      .map(([k, v]) => `<dt>${k}</dt><dd>${nation && k === 'Nation' ? `<span class="swatch" style="background:${nation.color}"></span>` : ''}${v}</dd>`)
      .join('')}</dl>`;

    const actions = [];
    if (isCabin) {
      actions.push(`<button class="btn" disabled>Johan's own ground</button>`);
    } else if (land) {
      actions.push(`<button class="btn primary" id="sel-descend">Walk this ground</button>`);
    } else {
      actions.push(`<button class="btn" disabled>Open water</button>`);
    }
    actions.push(`<button class="btn" id="sel-divine">Aim God's Eye here</button>`);
    actions.push(`<button class="btn" id="sel-clear">Clear</button>`);
    this.els.selActions.innerHTML = actions.join('');

    $('#sel-descend')?.addEventListener('click', () => this.game.descend());
    $('#sel-divine')?.addEventListener('click', () => {
      this.game.openDivine(tile);
      this.openDivine();
    });
    $('#sel-clear')?.addEventListener('click', () => this.game.clearSelection());
  }

  updateDivineTarget() {
    const sel = this.state?.selected;
    if (!sel) {
      this.els.divineTarget.textContent = 'Select a tile on the world table to aim an act.';
      return;
    }
    const tile = this.state.world.tiles.get(`${sel.x},${sel.y}`);
    const settlement = tile?.settlementId ? this.state.settlements.find((s) => s.id === tile.settlementId && s.alive) : null;
    this.els.divineTarget.innerHTML = `Aimed at <b>${sel.x}, ${sel.y}</b>${settlement ? ` · ${settlement.name}` : tile ? ` · ${BIOMES[tile.biome].name}` : ''}.`;
  }

  openDivine() {
    this.els.divine.hidden = false;
    this.updateDivineTarget();
  }

  closeDivine() {
    this.els.divine.hidden = true;
  }

  openLaptop() {
    this.els.laptop.hidden = false;
    if (!this.els.laptopLog.dataset.ready) {
      this.els.laptopLog.dataset.ready = '1';
      this.laptopSay('johan', 'Johan is at his table. Tell him what to raise, carve or break — or ask Jolene to dress it finer.');
    }
    setTimeout(() => this.els.laptopInput?.focus(), 60);
  }

  closeLaptop() {
    this.els.laptop.hidden = true;
    this.els.laptopInput?.blur();
  }

  renderLaptopAgents(agents, active) {
    const el = this.els.laptopTabs;
    if (!el) return;
    el.innerHTML = agents
      .map((a) => `<button class="laptop-tab${a.id === active ? ' on' : ''}" data-agent="${a.id}">${a.label}</button>`)
      .join('');
    el.querySelectorAll('[data-agent]').forEach((btn) => {
      btn.addEventListener('click', () => this.game.selectAgent(btn.dataset.agent));
    });
  }

  laptopSay(who, text) {
    const log = this.els.laptopLog;
    if (!log || !text) return;
    const line = document.createElement('div');
    const tone = who === 'you' ? 'you' : who === 'johan' ? 'johan' : 'jolene';
    line.className = `laptop-line ${tone}`;
    const name = who === 'you' ? 'You' : who.charAt(0).toUpperCase() + who.slice(1);
    const label = document.createElement('b');
    label.textContent = name;
    const body = document.createElement('span');
    body.textContent = text;
    line.append(label, body);
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
    while (log.children.length > 60) log.removeChild(log.firstChild);
  }

  openJournal() {
    this.els.journal.hidden = false;
    this.renderJournal();
  }

  closeJournal() {
    this.els.journal.hidden = true;
  }

  renderJournal() {
    const state = this.state;
    if (!state) return;
    const filtered = state.events
      .filter((e) => this.journalTab === 'all' || e.category === this.journalTab)
      .slice()
      .sort((a, b) => b.day - a.day || b.id - a.id);
    if (!filtered.length) {
      this.els.journalBody.innerHTML = '<p class="empty">Nothing has been written here yet.</p>';
      return;
    }
    this.els.journalBody.innerHTML = filtered
      .slice(0, 220)
      .map((e) => {
        const isNew = e.day > state.lastSeenDay;
        const cls = e.type === 'massacre' ? 'massacre' : e.category;
        return `<article class="entry ${cls}">
          <div class="when">${dateLabel(e.day)}<span class="where">${e.where || ''}</span></div>
          <div class="what">
            <h4>${e.title}${isNew ? '<span class="badge">new</span>' : ''}</h4>
            <p>${e.detail}</p>
            ${e.consequence ? `<span class="consequence">${e.consequence}</span>` : ''}
          </div>
        </article>`;
      })
      .join('');
  }

  openWhatsNew() {
    const state = this.state;
    if (!state) return;
    const fresh = state.events.filter((e) => e.day > state.lastSeenDay).slice().sort((a, b) => b.day - a.day);
    if (!fresh.length) {
      this.toast({ category: 'johan', day: state.world.day, title: 'Nothing new has happened since your last visit.' });
      return;
    }
    this.els.whatsnewBody.innerHTML = `<ul class="changelog">${fresh
      .slice(0, 60)
      .map(
        (e) => `<li class="${e.category === 'civilization' ? 'civ' : ''}">
          <span class="dot"></span>
          <div>${e.title}<span class="meta">${dateLabel(e.day)} · ${e.where || 'the world'} · ${e.category === 'johan' ? "Johan's work" : 'civilization'}</span></div>
        </li>`,
      )
      .join('')}</ul>`;
    this.els.whatsnew.hidden = false;
  }

  closeWhatsNew() {
    this.els.whatsnew.hidden = true;
  }

  openDialogue(npc) {
    if (!npc) return;
    this.dialogueNpc = npc;
    this.els.dialogue.hidden = false;
    this.els.dlgName.textContent = npc.name;
    const s = this.state?.settlements.find((x) => x.id === npc.settlementId && x.alive);
    this.els.dlgMeta.textContent = `${npc.job} · ${s ? s.name : 'no settlement'} · ${Math.floor(npc.age)} years · ${npc.hobby}`;
    this.renderTopics();
    this.showDialogueLine('The immortal looks at you and waits. He has all the time there is.');
  }

  showDialogueLine(text) {
    if (!this.dialogueNpc) return;
    this.els.dlgText.textContent = text;
    if (this.state) {
      this.els.dlgOpinion.textContent = `Thinks of Johan: ${opinionWord(this.dialogueNpc).replace(' to you', '')} · mood ${this.dialogueNpc.happiness > 0.6 ? 'good' : this.dialogueNpc.happiness > 0.4 ? 'level' : 'low'}`;
    }
  }

  renderTopics() {
    const npc = this.dialogueNpc;
    if (!npc) return;
    const topics = [
      ['self', 'Who are you?'],
      ['family', 'Your family'],
      ['work', 'Your work'],
      ['land', 'This place'],
      ['johan', 'What do you make of Johan?'],
      ['history', 'What has happened here?'],
    ];
    if (this.state?.wars.some((w) => !w.endedDay)) topics.push(['war', 'The war']);
    this.els.dlgTopics.innerHTML = topics
      .map(([id, label]) => `<button class="btn" data-topic="${id}">${label}</button>`)
      .join('');
    this.els.dlgTopics.querySelectorAll('[data-topic]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const reply = this.game.talkTo(btn.dataset.topic);
        if (reply) this.showDialogueLine(reply.text);
      });
    });
  }

  closeDialogue() {
    this.els.dialogue.hidden = true;
    this.dialogueNpc = null;
  }

  fade(on) {
    this.els.fade.classList.toggle('on', on);
  }
}
