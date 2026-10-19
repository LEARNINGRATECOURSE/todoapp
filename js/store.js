// Local-first store. localStorage writes are synchronous, so a log is never lost to a pending async write.
import { key, logKey, endDateAfter } from './stats.js';

const KEY = 'scribble-habits.v1';
const empty = () => ({ habits: [], logs: {}, notified: {} });

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.habits)) return { ...empty(), ...s, habits: s.habits.map(({ archived, ...h }) => h) };
  } catch { /* corrupt or unavailable: start fresh */ }
  return empty();
}

let state = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota/private mode */ } };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `h${Date.now()}${Math.random().toString(16).slice(2)}`);

export const getState = () => state;

export function saveHabit(input) {
  const fields = {
    name: input.name.trim(),
    days: [...input.days].sort((a, b) => a - b),
    every: input.every || 1,
    reminder: input.reminder || null,
    endDate: input.endDate || null,
    endAfter: input.endAfter || null,
    cue: input.cue.trim(),
    target: input.target || null, // counter habits: e.g. 8 (glasses)
    unit: input.target ? input.unit.trim() : '',
    step: input.target ? input.step || 1 : 1,
  };
  const existing = input.id && state.habits.find((h) => h.id === input.id);
  const habit = existing ? Object.assign(existing, fields) : { id: uid(), createdAt: key(new Date()), ...fields };
  if (habit.endAfter) habit.endDate = endDateAfter(habit, habit.endAfter); // "after N times" becomes a concrete end date
  if (!existing) state.habits.push(habit);
  save();
}

export function deleteHabit(id) {
  state.habits = state.habits.filter((h) => h.id !== id);
  for (const k of Object.keys(state.logs)) if (state.logs[k].habitId === id) delete state.logs[k];
  save();
}

export function setLog(habitId, date, { status, resistance = null, tags = [], current, target }) {
  // status stays done | skip | partial, so logs from before counters existed remain valid
  state.logs[logKey(habitId, date)] = { habitId, date, status, resistance, tags, ...(target ? { current, target } : {}), at: Date.now() };
  save();
}

export function clearLog(habitId, date) {
  delete state.logs[logKey(habitId, date)];
  save();
}

export function markNotified(habitId, date) {
  const todays = Object.entries(state.notified).filter(([k]) => k.endsWith(`|${date}`)); // drop old days
  state.notified = { ...Object.fromEntries(todays), [logKey(habitId, date)]: true };
  save();
}

export function wipe() {
  state = empty();
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
