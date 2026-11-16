// Orders typed at Johan's laptop. Everything here is read on this device: the
// words are matched against Johan's own acts and Jolene's reskins, then applied
// straight to the world. No network, no model, no cloud.

import { BIOMES, isLand, tileAt } from './world.js';
import { godAction } from './life.js';
import { advanceDays } from './state.js';
import { addEvent } from './journal.js';
import { crewSummary, dressSector, sectorByDresser } from './sectors.js';
import { johanReply, joleneReply } from './chat.js';

const JOHAN_ACTS = [
  [/(new land|more land|raise land|grow land|expand)/, 'newland'],
  [/(\bmountain|\bpeak|\bridge|\bsummit|\brange)/, 'mountain'],
  [/(\briver|\bstream|\bcreek|coursed? water)/, 'river'],
  [/(forest|wood|grove|trees?)/, 'forest'],
  [/(\blake|\bpond)/, 'lake'],
  [/(fertile|fertil|farm|crop|harvest|field)/, 'blessfertility'],
  [/(tornado|twister)/, 'tornado'],
  [/(hurricane|cyclone)/, 'hurricane'],
  [/(earthquake|quake|tremor)/, 'earthquake'],
  [/(flood|deluge|surge)/, 'flood'],
  [/(drought|dry spell|no rain)/, 'drought'],
  [/(wildfire|fire|burn|blaze)/, 'wildfire'],
  [/(volcano|eruption|lava)/, 'volcano'],
  [/(blizzard|freeze|froze|frost)/, 'blizzard'],
  [/(heat ?wave|scorching|heat)/, 'heatwave'],
  [/(tsunami|tidal wave)/, 'tsunami'],
  [/(meteor|comet|asteroid)/, 'meteor'],
  [/(landslide|mudslide)/, 'landslide'],
  [/(storm|thunder|lightning)/, 'storm'],
  [/(plague|sickness|disease|pestilence)/, 'plague'],
  [/(blight|crop disease)/, 'plantdisease'],
  [/(animal sickness|livestock|cattle sick)/, 'animaldisease'],
  [/(hope|hopeful)/, 'emotion_hope'],
  [/(trust)/, 'emotion_trust'],
  [/(compassion|kindness)/, 'emotion_compassion'],
  [/(courage|brave)/, 'emotion_courage'],
  [/(creativity|inspire)/, 'emotion_creativity'],
  [/(fear|terror)/, 'emotion_fear'],
  [/(anger|rage)/, 'emotion_anger'],
  [/(paranoia|suspicion)/, 'emotion_paranoia'],
  [/(greed|avarice)/, 'emotion_greed'],
  [/(despair|hopeless)/, 'emotion_despair'],
  [/(jealousy|envy)/, 'emotion_jealousy'],
];

const JOLENE_KINDS = [
  [/(everything|anything|whole board|all of it|every tile)/, 'all'],
  [/(tree|branch|leaves|canopy|forest)/, 'trees'],
  [/(grass|strand|blade|meadow)/, 'grass'],
  [/(water|ripple|wave|river|lake|sea|ocean|coast)/, 'water'],
  [/(village|house|roof|town|settlement|person|people)/, 'village'],
  [/(mountain|peak|ridge)/, 'mountains'],
  [/(reskin|re-?skin|polish|refine|sharpen|clean|detail|beautif|paint|skin|smooth|mold|mould|nicer|pretty|better|lovely|tidy)/, 'polish'],
];

const JOLENE_BIOMES = {
  grass: ['grass', 'meadow', 'blackgrass', 'tundra', 'hills', 'swamp', 'island'],
  trees: ['forest', 'deepforest', 'swamp'],
  water: ['river', 'lake', 'ocean', 'coast'],
  mountains: ['mountain', 'peak', 'hills'],
};

const JOLENE_VERBS = {
  all: 'repainted the whole board',
  trees: 'gave the trees their branches and leaves back',
  grass: 'combed out individual blades of grass',
  water: 'smoothed the water until the ripples showed',
  village: 'straightened the roofs and the people standing under them',
  mountains: 'cut new ridgelines into the rock',
  polish: 'sharpened the detail',
};

function firstLand(state) {
  for (const tile of state.world.tiles.values()) if (isLand(tile)) return tile;
  return null;
}

function targetTile(state, hint) {
  if (hint) return hint;
  if (state.selected) {
    const t = tileAt(state.world, state.selected.x, state.selected.y);
    if (t) return t;
  }
  return firstLand(state);
}

export function parseOrder(text) {
  const raw = String(text || '').trim();
  const crew = raw.match(/^(crew|sectors|who\s+works\s+where)\b/i);
  if (crew) return { who: 'crew', instruction: '' };
  const match = raw.match(/^(johan|jolene)\b[\s:,.-]*(.*)$/i);
  if (!match) return null;
  return { who: match[1].toLowerCase(), instruction: match[2].trim() };
}

function johanOrder(state, text, tile) {
  const waited = text.match(/\b(?:wait|sleep|rest|pass|let)\b.*?(\d{1,3})/);
  if (waited || /\b(sleep|rest|wait|pass time|let time)\b/.test(text)) {
    const days = Math.max(1, Math.min(90, waited ? Number(waited[1]) : 10));
    advanceDays(state, days, { quiet: true });
    return {
      ok: true,
      category: 'johan',
      title: `${days} day${days === 1 ? '' : 's'} turned.`,
      detail: `Johan set the work down and let the world move: ${state.world.tiles.size} tiles, ${state.npcs.filter((n) => n.alive).length} inhabitants now.`,
    };
  }

  if (/\b(jolene|reskin|polish|sharpen|refine)\b/.test(text)) {
    return {
      ok: false,
      category: 'johan',
      title: 'That is not his work.',
      detail: 'Johan only raises, carves and breaks ground. Type "jolene reskin this" and she will dress it.',
    };
  }

  for (const [pattern, kind] of JOHAN_ACTS) {
    if (!pattern.test(text)) continue;
    const event = godAction(state, kind, tile, Math.random);
    if (!event) {
      return { ok: false, category: 'johan', title: 'Johan cannot do that on that ground.', detail: `He tried ${kind} at ${tile.x},${tile.y} and it came to nothing.` };
    }
    return { ok: true, category: 'johan', title: event.title || 'Johan worked.', detail: event.detail || '' };
  }

  // Nothing he knows how to do: he answers in his own voice instead of a
  // flat "not understood".
  const reply = johanReply(state, text, ((state.world?.day || 0) % 11) / 11);
  return { ok: false, category: 'johan', title: reply.title, detail: reply.detail };
}

function joleneOrder(state, text, tile) {
  let kind = null;
  for (const [pattern, name] of JOLENE_KINDS) {
    if (pattern.test(text)) {
      kind = name;
      break;
    }
  }

  // She only dresses what stands: anything she does not recognise gets her
  // own answer instead of a silent reskin of whatever is nearby.
  if (!kind) {
    const reply = joleneReply(state, text, ((state.world?.day || 0) % 11) / 11);
    return { ok: false, category: 'jolene', title: reply.title, detail: reply.detail };
  }

  const wide = kind === 'all';
  const radius = wide ? 4 : 2;
  const allowed = JOLENE_BIOMES[kind];
  let painted = 0;

  for (const t of state.world.tiles.values()) {
    if (Math.abs(t.x - tile.x) > radius || Math.abs(t.y - tile.y) > radius) continue;
    if (!isLand(t) && kind !== 'water' && !wide) continue;
    if (allowed && !allowed.includes(t.biome)) continue;
    if (kind === 'village' && !t.settlementId) continue;
    t.detail = Math.min(1, Math.max(0.62, (t.detail ?? 0.4) + 0.3));
    t.polishedDay = state.world.day;
    painted += 1;
  }

  if (!painted) {
    return {
      ok: false,
      category: 'jolene',
      title: 'Nothing of that kind around there.',
      detail: `She looked at ${tile.x},${tile.y} and found no ${kind === 'polish' ? 'ground' : kind} to dress.`,
    };
  }

  state.jolene = state.jolene || { polished: 0, lastDay: 0, lastTile: null };
  state.jolene.polished += painted;
  state.jolene.reskinned = (state.jolene.reskinned || 0) + painted;
  state.jolene.lastDay = state.world.day;
  state.jolene.lastTile = { x: tile.x, y: tile.y };

  const near = BIOMES[tile.biome]?.name?.toLowerCase() || 'ground';
  const event = addEvent(state, {
    category: 'jolene',
    type: 'polish',
    title: `Jolene ${JOLENE_VERBS[kind] || 'sharpened the detail'}`,
    detail: `${painted} tile${painted === 1 ? '' : 's'} around ${tile.x},${tile.y} — ${near} — came out cleaner. She changed nothing that stands on it.`,
    where: `${tile.x},${tile.y}`,
    consequence: 'The same ground, only finer.',
  });
  return { ok: true, category: 'jolene', title: event.title, detail: event.detail };
}

export function runOrder(state, who, instruction, hint) {
  if (who === 'crew') {
    return { ok: false, category: 'johan', title: 'Sector crews', detail: crewSummary(state) };
  }
  const text = String(instruction || '').toLowerCase().trim();
  const whoKey = String(who || '').toLowerCase();
  if (whoKey !== 'johan' && whoKey !== 'jolene') {
    const sector = sectorByDresser(state, whoKey);
    if (sector) return dressSector(state, sector, text, Math.random);
    return { ok: false, category: 'johan', title: `No one named ${who} works the table.` };
  }
  if (!text) return { ok: false, category: who, title: 'Type what you want after the name.' };
  const tile = targetTile(state, hint);
  if (!tile) return { ok: false, category: who, title: 'There is no ground to work yet.' };
  if (whoKey === 'johan') return johanOrder(state, text, tile);
  if (whoKey === 'jolene') return joleneOrder(state, text, tile);
  return { ok: false, category: 'johan', title: 'Only Johan and Jolene answer.' };
}
