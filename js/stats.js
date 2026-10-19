// Pure date + progress helpers. Dates are local "YYYY-MM-DD" keys.
const pad = (n) => String(n).padStart(2, '0');
export const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const today = () => parse(key(new Date()));
export const logKey = (habitId, date) => `${habitId}|${date}`;

export const PROGRESS_DAYS = 66; // Lally et al. (2010): median time to automaticity
export const INSIGHT_MIN_DAYS = 14;

const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));

/** Does the habit's schedule land on `date`? Handles "every N weeks", counted from the start week. */
export function occursOn(habit, date) {
  if (!habit.days.includes(date.getDay())) return false;
  const every = habit.every || 1;
  if (every === 1) return true;
  const weeks = Math.round((mondayOf(date) - mondayOf(parse(habit.createdAt))) / (7 * 864e5));
  return weeks >= 0 && weeks % every === 0;
}

/** Date of the habit's Nth occurrence, counted from its start date. Turns "after N times" into an end date. */
export function endDateAfter(habit, n) {
  for (let d = parse(habit.createdAt), count = 0, i = 0; i < 40000; d = addDays(d, 1), i++) {
    if (occursOn(habit, d) && ++count === n) return key(d);
  }
  return null;
}

/** A scheduled day that wasn't completed: unlogged past day, or a counter that fell short of its target. */
const missed = (s) => s === 'miss' || s === 'part';

/** True once `date` is past the habit's optional end date. */
export const isEnded = (habit, date) => !!habit.endDate && key(date) > habit.endDate;

/**
 * Status of one habit on one day:
 * done | skip (logged) · part (counter short of target, past day) · miss (scheduled, past, unlogged) · open (scheduled today, unlogged)
 * rest (not scheduled) · before (predates habit) · future
 */
export function dayStatus(habit, logs, date, now = today()) {
  const log = logs[logKey(habit.id, key(date))];
  if (log) return log.status === 'partial' ? (date.getTime() === now.getTime() ? 'open' : 'part') : log.status;
  if (date < parse(habit.createdAt)) return 'before';
  if (date > now) return 'future';
  if (!occursOn(habit, date) || isEnded(habit, date)) return 'rest';
  return date.getTime() === now.getTime() ? 'open' : 'miss';
}

/** Consecutive done days, newest first. Skips and rest days are neutral; only a miss ends the chain. */
export function chain(habit, logs, now = today()) {
  const start = parse(habit.createdAt);
  let n = 0;
  for (let d = now, i = 0; d >= start && i < 3660; d = addDays(d, -1), i++) {
    const s = dayStatus(habit, logs, d, now);
    if (missed(s)) break;
    if (s === 'done') n++;
  }
  return n;
}

/** Done ÷ (done + missed) over the last 30 days. Skips are excluded, never counted as failures. */
export function completion30(habit, logs, now = today()) {
  let done = 0, miss = 0;
  for (let i = 0; i < 30; i++) {
    const s = dayStatus(habit, logs, addDays(now, -i), now);
    if (s === 'done') done++; else if (missed(s)) miss++;
  }
  return done + miss ? Math.round((done / (done + miss)) * 100) : null;
}

/**
 * The habit's journey: only the days it is actually scheduled, from its start date to its end date.
 * With no end date it runs for PROGRESS_DAYS scheduled days. Misses never subtract from `done`.
 */
export function journey(habit, logs, now = today()) {
  const start = parse(habit.createdAt);
  const days = [];
  for (let d = start, i = 0; i < 3660; d = addDays(d, 1), i++) {
    if (habit.endDate ? key(d) > habit.endDate : days.length >= PROGRESS_DAYS) break;
    if (!occursOn(habit, d)) continue;
    const s = dayStatus(habit, logs, d, now);
    days.push({ date: d, status: s === 'open' || s === 'future' ? 'up' : s });
  }
  const end = habit.endDate ? parse(habit.endDate) : days.length ? days[days.length - 1].date : start;
  return { start, end, days, done: days.filter((x) => x.status === 'done').length, hasEnd: !!habit.endDate };
}

/** Calendar cell state: done | skip | miss | up (scheduled, not yet logged) | rest (off day) | out (outside the journey). */
export function calendarDay(habit, logs, date, range, now = today()) {
  if (date < range.start || date > range.end) return 'out';
  const s = dayStatus(habit, logs, date, now);
  if (s === 'open' || (s === 'future' && occursOn(habit, date))) return 'up';
  return s === 'future' || s === 'before' ? 'rest' : s;
}

/** This week (Mon–Sun) per habit. */
export function weekly(habits, logs, now = today()) {
  const monday = addDays(now, -((now.getDay() + 6) % 7));
  return habits.map((habit) => {
    let done = 0, skipped = 0, scheduled = 0;
    for (let i = 0; i < 7; i++) {
      const s = dayStatus(habit, logs, addDays(monday, i), now);
      if (s === 'done') { done++; scheduled++; }
      else if (s === 'skip') skipped++;
      else if (missed(s) || s === 'open') scheduled++;
      else if (s === 'future' && occursOn(habit, addDays(monday, i)) && !isEnded(habit, addDays(monday, i))) scheduled++;
    }
    return { habit, done, skipped, scheduled };
  });
}

/**
 * Which check-in tags come before misses: for each tagged log, look at the next scheduled day
 * (if it's already past) and record whether it was missed. Needs INSIGHT_MIN_DAYS of history.
 */
export function tagInsights(habits, logs, now = today()) {
  const entries = Object.values(logs);
  const oldest = entries.reduce((m, l) => (!m || l.date < m ? l.date : m), null);
  const days = oldest ? Math.round((now - parse(oldest)) / 864e5) : 0;
  const byId = new Map(habits.map((h) => [h.id, h]));
  const tally = {};
  for (const l of entries) {
    const h = byId.get(l.habitId);
    if (!h || !l.tags?.length || !h.days.length) continue;
    let d = addDays(parse(l.date), 1);
    for (let i = 0; i < 7 * (h.every || 1) && !occursOn(h, d); i++) d = addDays(d, 1);
    if (d >= now) continue; // next scheduled day hasn't finished yet
    const wasMissed = missed(dayStatus(h, logs, d, now));
    for (const t of l.tags) {
      const row = (tally[t] ||= { tag: t, total: 0, misses: 0 });
      row.total++; if (wasMissed) row.misses++;
    }
  }
  const rows = Object.values(tally).sort((a, b) => b.misses / b.total - a.misses / a.total || b.total - a.total);
  return { ready: days >= INSIGHT_MIN_DAYS, daysLeft: Math.max(0, INSIGHT_MIN_DAYS - days), rows };
}
