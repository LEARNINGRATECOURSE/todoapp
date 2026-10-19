// Pure date + progress helpers. Dates are local "YYYY-MM-DD" keys.
const pad = (n) => String(n).padStart(2, '0');
export const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const today = () => parse(key(new Date()));
export const logKey = (habitId, date) => `${habitId}|${date}`;

export const PROGRESS_DAYS = 66; // Lally et al. (2010): median time to automaticity
export const INSIGHT_MIN_DAYS = 14;

/** True once `date` is past the habit's optional end date. */
export const isEnded = (habit, date) => !!habit.endDate && key(date) > habit.endDate;

/**
 * Status of one habit on one day:
 * done | skip (logged) · miss (scheduled, past, unlogged) · open (scheduled today, unlogged)
 * rest (not scheduled) · before (predates habit) · future
 */
export function dayStatus(habit, logs, date, now = today()) {
  const log = logs[logKey(habit.id, key(date))];
  if (log) return log.status;
  if (date < parse(habit.createdAt)) return 'before';
  if (date > now) return 'future';
  if (!habit.days.includes(date.getDay()) || isEnded(habit, date)) return 'rest';
  return date.getTime() === now.getTime() ? 'open' : 'miss';
}

/** Consecutive done days, newest first. Skips and rest days are neutral; only a miss ends the chain. */
export function chain(habit, logs, now = today()) {
  const start = parse(habit.createdAt);
  let n = 0;
  for (let d = now, i = 0; d >= start && i < 3660; d = addDays(d, -1), i++) {
    const s = dayStatus(habit, logs, d, now);
    if (s === 'miss') break;
    if (s === 'done') n++;
  }
  return n;
}

/** Done ÷ (done + missed) over the last 30 days. Skips are excluded, never counted as failures. */
export function completion30(habit, logs, now = today()) {
  let done = 0, miss = 0;
  for (let i = 0; i < 30; i++) {
    const s = dayStatus(habit, logs, addDays(now, -i), now);
    if (s === 'done') done++; else if (s === 'miss') miss++;
  }
  return done + miss ? Math.round((done / (done + miss)) * 100) : null;
}

/** Total done days toward the 66-day goal. It only grows, so a miss never resets this view. */
export function progress66(habit, logs) {
  let done = 0;
  for (const k in logs) if (logs[k].habitId === habit.id && logs[k].status === 'done') done++;
  return Math.min(done, PROGRESS_DAYS);
}

/** Last `weeks` weeks as Monday-first columns, ending with the current week. */
export function heatmap(habit, logs, weeks = 13, now = today()) {
  const monday = addDays(now, -((now.getDay() + 6) % 7));
  const first = addDays(monday, -7 * (weeks - 1));
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const date = addDays(first, i);
    return { date, status: dayStatus(habit, logs, date, now) };
  });
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
      else if (s === 'miss' || s === 'open') scheduled++;
      else if (s === 'future' && habit.days.includes(addDays(monday, i).getDay()) && !isEnded(habit, addDays(monday, i))) scheduled++;
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
    for (let i = 0; i < 7 && !h.days.includes(d.getDay()); i++) d = addDays(d, 1);
    if (d >= now) continue; // next scheduled day hasn't finished yet
    const missed = dayStatus(h, logs, d, now) === 'miss';
    for (const t of l.tags) {
      const row = (tally[t] ||= { tag: t, total: 0, misses: 0 });
      row.total++; if (missed) row.misses++;
    }
  }
  const rows = Object.values(tally).sort((a, b) => b.misses / b.total - a.misses / a.total || b.total - a.total);
  return { ready: days >= INSIGHT_MIN_DAYS, daysLeft: Math.max(0, INSIGHT_MIN_DAYS - days), rows };
}
