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
  const monthly = input.repeat === 'monthly';
  const fields = {
    name: input.name.trim(),
    createdAt: input.startDate || key(new Date()), // the day tracking starts
    repeat: monthly ? 'monthly' : 'weekly',
    days: [...input.days].sort((a, b) => a - b),
    monthDays: [...new Set(input.monthDays)].sort((a, b) => a - b),
    every: monthly ? 1 : input.every || 1,
    reminder: input.reminder || null,
    endDate: input.endDate || null,
    endAfter: input.endAfter || null,
    cue: input.cue.trim(),
    target: input.target || null, // counter habits: e.g. 8 (glasses)
    unit: input.target ? input.unit.trim() : '',
    step: input.target ? input.step || 1 : 1,
  };
  const existing = input.id && state.habits.find((h) => h.id === input.id);
  const habit = existing ? Object.assign(existing, fields) : { id: uid(), ...fields };
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

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const posInt = (n) => (Number.isInteger(n) && n > 0 ? n : null);

/** Validate and sanitise a backup file's text. Returns { habits, logs } or null if it isn't a usable backup. */
export function parseBackup(text) {
  let o;
  try { o = JSON.parse(text); } catch { return null; }
  if (!o || !Array.isArray(o.habits) || !o.logs || typeof o.logs !== 'object') return null;
  const habits = [];
  for (const h of o.habits) {
    const repeat = h?.repeat === 'monthly' ? 'monthly' : 'weekly';
    const days = Array.isArray(h?.days) ? h.days : [];
    const monthDays = Array.isArray(h?.monthDays) ? h.monthDays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 31) : [];
    const okDays = days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) && (repeat === 'monthly' || days.length > 0);
    const okSchedule = repeat === 'monthly' ? monthDays.length > 0 : okDays;
    if (typeof h?.id !== 'string' || typeof h.name !== 'string' || !DATE.test(h.createdAt) || !okSchedule) return null;
    habits.push({
      id: h.id, name: h.name.slice(0, 60), createdAt: h.createdAt, repeat, days, monthDays,
      every: [1, 2, 3, 4].includes(h.every) ? h.every : 1,
      cue: String(h.cue ?? '').slice(0, 80),
      reminder: /^\d{2}:\d{2}$/.test(h.reminder) ? h.reminder : null,
      endDate: DATE.test(h.endDate) ? h.endDate : null, endAfter: posInt(h.endAfter),
      target: posInt(h.target), unit: String(h.unit ?? '').slice(0, 20), step: posInt(h.step) ?? 1,
    });
  }
  const ids = new Set(habits.map((h) => h.id));
  const logs = {};
  for (const l of Object.values(o.logs)) {
    if (!ids.has(l?.habitId) || !DATE.test(l.date) || !['done', 'skip', 'partial'].includes(l.status)) continue;
    logs[logKey(l.habitId, l.date)] = {
      habitId: l.habitId, date: l.date, status: l.status,
      resistance: ['low', 'medium', 'high'].includes(l.resistance) ? l.resistance : null,
      tags: Array.isArray(l.tags) ? l.tags.filter((t) => typeof t === 'string').slice(0, 10).map((t) => t.slice(0, 24)) : [],
      ...(Number.isFinite(l.current) && Number.isFinite(l.target) ? { current: l.current, target: l.target } : {}),
      ...(Number.isFinite(l.at) ? { at: l.at } : {}),
    };
  }
  return { habits, logs };
}

export function replaceAll({ habits, logs }) {
  state = { habits, logs, notified: {} };
  save();
}
