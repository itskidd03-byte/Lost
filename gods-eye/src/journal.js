// The wall journal is generated from real simulation events — never narration
// invented after the fact. Every record carries the simulation day it happened
// on, where it happened, and who was involved.

export const YEAR_DAYS = 360;
const MAX_EVENTS = 4000;

export function dateLabel(day) {
  const year = Math.floor(day / YEAR_DAYS) + 1;
  const d = (day % YEAR_DAYS) + 1;
  return `Year ${year} · Day ${d}`;
}

export function addEvent(state, ev) {
  const event = {
    id: ++state.eventSeq,
    day: state.world.day,
    category: ev.category || 'johan',
    type: ev.type || 'note',
    title: ev.title || 'An event',
    detail: ev.detail || '',
    where: ev.where || '',
    actors: ev.actors || [],
    consequence: ev.consequence || '',
    important: !!ev.important,
    away: !!ev.away,
  };
  state.events.push(event);
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
  if (typeof state.onEvent === 'function') state.onEvent(event);
  return event;
}

// Civilization events are throttled so a thousand births do not bury a war.
// Important records (wars, massacres, foundings, collapses) bypass the budget.
export function civEvent(state, ev) {
  if (!ev.important) {
    if ((state.eventBudget ?? 0) <= 0) return null;
    state.eventBudget--;
  }
  return addEvent(state, { ...ev, category: 'civilization' });
}

export function resetEventBudget(state) {
  state.eventBudget = 5;
}

export function tileWhere(state, x, y, label) {
  const tile = state.world.tiles.get(`${x},${y}`);
  const name = label || (tile ? null : null);
  return name ? `${name} · ${x},${y}` : `${x},${y}`;
}

export function eventsSince(state, day) {
  return state.events.filter((e) => e.day > day);
}
