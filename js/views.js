// Views return HTML strings. All user text goes through esc().
import { icon, circled } from './icons.js';
import { key, today, isEnded, occursOn, dayStatus, chain, completion30, journey, calendarDay, addDays, weekly, tagInsights, logKey, PROGRESS_DAYS } from './stats.js';
import * as reminders from './reminders.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const WEEKDAYS = [['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6], ['Sun', 0]];
export const PRESET_TAGS = ['tired', 'anxious', 'distracted', 'busy', 'rushed'];
const LEVELS = ['low', 'medium', 'high'];
const CHEERS = ['Nice one!', 'Look at you go!', 'Another link in the chain.', 'Done and dusted.'];
const cheer = (id) => CHEERS[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % CHEERS.length];

const scheduleLabel = (h) => {
  const days = h.days.length === 7 ? 'Every day' : WEEKDAYS.filter(([, d]) => h.days.includes(d)).map(([n]) => n).join(' · ');
  return [h.every > 1 ? `Every ${h.every} weeks: ${days}` : days,
    h.target && `${h.target} ${h.unit || 'times'}`,
    h.endDate && `${isEnded(h, today()) ? 'ended' : 'until'} ${fmtDate(h.endDate)}${h.endAfter ? ` (${h.endAfter} times)` : ''}`].filter(Boolean).join(' · ');
};
const fmtTime = (hhmm) => new Date(`1970-01-01T${hhmm}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDate = (k, year) => new Date(`${k}T00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', ...(year && { year: 'numeric' }) });
const btn = (action, label, ic, extra = '', cls = '') =>
  `<button type="button" class="btn ${cls}" data-action="${action}" ${extra}>${icon(ic)}<span>${label}</span></button>`;

/* ---------------- Today ---------------- */
function resistancePanel(h, draft) {
  const tags = [...new Set([...PRESET_TAGS, ...draft.tags])];
  return `<div class="panel" id="panel-${esc(h.id)}">
    <div><div class="panel-label" id="res-${esc(h.id)}">How much resistance? <span class="muted small">(optional)</span></div>
      <div class="chips" role="group" aria-labelledby="res-${esc(h.id)}">
        ${LEVELS.map((l) => `<button type="button" class="chip" data-action="res" data-level="${l}" aria-pressed="${draft.resistance === l}">${l[0].toUpperCase() + l.slice(1)}</button>`).join('')}
      </div></div>
    <div><div class="panel-label" id="tags-${esc(h.id)}">What's in the way?</div>
      <div class="chips" role="group" aria-labelledby="tags-${esc(h.id)}">
        ${tags.map((t) => `<button type="button" class="chip" data-action="tag" data-tag="${esc(t)}" aria-pressed="${draft.tags.includes(t)}">${esc(t)}</button>`).join('')}
      </div></div>
    <form class="row" data-form="custom-tag">
      <label class="visually-hidden" for="tag-in-${esc(h.id)}">Add your own tag</label>
      <input class="input" id="tag-in-${esc(h.id)}" name="tag" maxlength="24" placeholder="your own tag…" style="flex:1 1 9rem" autocomplete="off">
      <button class="btn btn--small" type="submit">${icon('plus')}<span>Add tag</span></button>
    </form>
  </div>`;
}

/** Tally marks: four strokes and a slash per group of five. */
function tally(n) {
  if (!n || n > 30) return '';
  const groups = [];
  for (let left = n; left > 0; left -= 5) groups.push(Math.min(5, left));
  return groups.map((g) => (g === 5 ? '<span class="tally-g full"><i></i><i></i><i></i><i></i></span>' : `<span class="tally-g">${'<i></i>'.repeat(g)}</span>`)).join('');
}

function stepper(h, log, id) {
  const cur = log?.current ?? 0, step = h.step || 1, unit = h.unit ? ` ${h.unit}` : '';
  const stepBtn = (delta, ic, label, off) => `<button type="button" class="btn btn--icon" data-action="step" ${id} data-delta="${delta}" data-fid="${delta < 0 ? 'minus' : 'plus'}-${esc(h.id)}" aria-label="${label} ${step}${esc(unit)}" ${off ? 'disabled' : ''}>${icon(ic)}</button>`;
  return `<div class="stepper">
    ${stepBtn(-1, 'minus', 'Remove', cur <= 0)}
    <div class="stepper-count" role="status"><div class="tally" aria-hidden="true">${tally(Math.floor(cur / step))}</div>
      <strong>${cur} / ${h.target}</strong>${esc(unit)}</div>
    ${stepBtn(1, 'plus', 'Add', false)}
  </div>`;
}

function todayCard(h, state, ui, now) {
  const log = state.logs[logKey(h.id, key(now))];
  const c = chain(h, state.logs, now);
  const open = ui.panel === h.id;
  const id = `data-id="${esc(h.id)}"`;
  const done = log?.status === 'done', skipped = log?.status === 'skip';
  const settled = done || skipped; // a partly-counted habit is still upcoming
  const st = done ? 'done' : skipped ? 'skip' : 'up'; // done (green) · skip (red) · up (blue)
  const stampHtml = `<span class="stamp stamp--${st}">${icon({ done: 'check', skip: 'skip', up: 'calendar' }[st])} ${{ done: 'Done', skip: 'Skipped', up: 'Upcoming' }[st]}</span>`;
  return `<li class="card card--${st} ${ui.justLogged === h.id ? 'just-logged' : ''}" ${id}>
    <div class="habit-head">
      <h3 class="habit-name">${esc(h.name)}</h3>${stampHtml}
    </div>
    ${h.cue ? `<p class="bubble bubble--cue small">${esc(h.cue)}</p>` : ''}
    <div class="badges">
      ${h.reminder ? `<span class="badge">${icon('bell')} ${esc(fmtTime(h.reminder))}</span>` : ''}
      <span class="badge">${icon('link')} Chain ${c}</span>
    </div>
    ${log && (log.resistance || log.tags.length) ? `<p class="small muted">Felt: ${[log.resistance && `${log.resistance} resistance`, ...log.tags].filter(Boolean).map(esc).join(', ')}</p>` : ''}
    ${h.target && !skipped ? stepper(h, log, id) : ''}
    ${settled ? `
      <div class="row">
        <p class="bubble bubble--side small">${done ? cheer(h.id) : 'Rest day. Chain is safe.'}${log.at ? ` · ${esc(new Date(log.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}` : ''}</p>
        ${btn('undo', 'Undo', 'undo', `${id} data-fid="undo-${esc(h.id)}"`, 'btn--small')}
      </div>
    ` : `
      ${open ? resistancePanel(h, ui.draft) : ''}
      <div class="actions">
        ${btn('log', 'Done', 'check', `${id} data-status="done" data-fid="done-${esc(h.id)}"`, 'btn--wide')}
        ${btn('log', 'Skip', 'skip', `${id} data-status="skip"`, 'btn--wide')}
        <button type="button" class="btn btn--small" data-action="panel" ${id} aria-expanded="${open}" aria-controls="panel-${esc(h.id)}" data-fid="panel-${esc(h.id)}">${icon('gauge')}<span>${open ? 'Hide check-in' : 'Check-in'}</span></button>
      </div>`}
  </li>`;
}

export function todayView(state, ui) {
  const now = today();
  const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const habits = state.habits.filter((h) => occursOn(h, now) && !isEnded(h, now))
    .sort((a, b) => (a.reminder || '99:99').localeCompare(b.reminder || '99:99'));
  const logged = habits.filter((h) => ['done', 'skip'].includes(state.logs[logKey(h.id, key(now))]?.status)).length;
  const hero = `<div class="sticky taped">
      <h2>${esc(dateStr)}</h2>
      <p>${!habits.length ? 'Nothing scheduled today.' : logged === habits.length ? 'All logged. Go enjoy your day!' : `${logged} of ${habits.length} logged. Missed days are normal here.`}</p>
    </div>`;
  if (!state.habits.length) {
    return `<div class="stack">${hero}<div class="card card--dashed empty">
      ${circled('sparkles')}<h3>A blank page!</h3><p>Add your first habit. Three to six is plenty.</p>
      ${btn('new-habit', 'Add a habit', 'plus', '', 'btn--wide')}</div></div>`;
  }
  return `<div class="stack">${hero}
    <ul class="list" aria-label="Today's habits">${habits.map((h, i) => todayCard(h, state, ui, now).replace('<li class="card', `<li class="card ${i % 3 === 0 ? 'pinned' : i % 3 === 1 ? 'taped' : ''}`)).join('')}</ul></div>`;
}

/* ---------------- Habits ---------------- */
const habitRow = (h) => `<li class="card" data-id="${esc(h.id)}">
  <div class="habit-head"><div><h3 class="habit-name">${esc(h.name)}</h3>
    <p class="small muted">${esc(scheduleLabel(h))}${h.reminder ? ` · ${esc(fmtTime(h.reminder))}` : ''}</p>
    ${h.cue ? `<p class="small">Cue: ${esc(h.cue)}</p>` : ''}</div></div>
  <div class="actions">
    ${btn('edit-habit', 'Edit', 'pencil', `data-id="${esc(h.id)}" data-fid="edit-${esc(h.id)}"`, 'btn--small')}
    ${btn('delete', 'Delete', 'trash', `data-id="${esc(h.id)}"`, 'btn--small btn--danger')}
  </div></li>`;

export function habitsView(state) {
  const active = state.habits;
  return `<div class="stack">
    <div class="view-title"><h2>My habits</h2>${btn('new-habit', 'New habit', 'plus', 'data-fid="new"')}</div>
    ${active.length ? `<ul class="list">${active.map(habitRow).join('')}</ul>` : '<p class="muted">No active habits yet.</p>'}
  </div>`;
}

export function editorForm(h) {
  const days = h?.days ?? [0, 1, 2, 3, 4, 5, 6];
  const endMode = h?.endAfter ? 'count' : h?.endDate ? 'date' : 'never';
  const err = (id, msg) => `<p class="hint" id="${id}" role="alert" hidden style="color:var(--red-ink)">${msg}</p>`;
  return `<h2 id="editor-title">${h ? 'Edit habit' : 'New habit'}</h2>
  <form method="dialog" data-form="habit" novalidate>
    <input type="hidden" name="id" value="${esc(h?.id)}">
    <div class="field"><label for="f-name">Name</label>
      <input class="input" id="f-name" name="name" required maxlength="60" value="${esc(h?.name)}" placeholder="e.g. Stretch" autocomplete="off">
      ${err('f-name-err', 'Give it a name first.')}</div>
    <div class="field"><label for="f-kind">Track as</label>
      <select class="input" id="f-kind" name="kind">
        <option value="check">Done / not done</option>
        <option value="count" ${h?.target ? 'selected' : ''}>A number (counter)</option>
      </select></div>
    <div class="counter-fields">
      <div class="field"><label for="f-target">Daily goal</label>
        <input class="input" id="f-target" name="target" type="number" min="1" max="100000" inputmode="numeric" value="${esc(h?.target)}" placeholder="8">
        ${err('f-target-err', 'Enter a goal of 1 or more.')}</div>
      <div class="field"><label for="f-unit">Unit <span class="muted small">(optional)</span></label>
        <input class="input" id="f-unit" name="unit" maxlength="20" value="${esc(h?.unit)}" placeholder="glasses" autocomplete="off"></div>
      <div class="field"><label for="f-step">Each tap adds</label>
        <input class="input" id="f-step" name="step" type="number" min="1" max="100000" inputmode="numeric" value="${esc(h?.step || 1)}"></div>
    </div>
    <fieldset class="field"><legend>Schedule</legend>
      <div class="chips">
        ${WEEKDAYS.map(([n, d]) => `<label class="chip"><input type="checkbox" name="day" value="${d}" ${days.includes(d) ? 'checked' : ''}>${n}</label>`).join('')}
      </div>
      ${err('f-days-err', 'Pick at least one day.')}</fieldset>
    <div class="field"><label for="f-every">Repeats</label>
      <select class="input" id="f-every" name="every">
        ${[[1, 'Every week'], [2, 'Every 2 weeks (fortnightly)'], [3, 'Every 3 weeks'], [4, 'Every 4 weeks']].map(([n, t]) => `<option value="${n}" ${(h?.every || 1) === n ? 'selected' : ''}>${t}</option>`).join('')}
      </select></div>
    <div class="field"><label for="f-cue">Cue <span class="muted small">(optional)</span></label>
      <input class="input" id="f-cue" name="cue" maxlength="80" value="${esc(h?.cue)}" placeholder="after morning coffee" autocomplete="off"></div>
    <div class="field"><label for="f-rem">Time &amp; reminder <span class="muted small">(optional)</span></label>
      <input class="input" id="f-rem" name="reminder" type="time" value="${esc(h?.reminder)}"></div>
    <fieldset class="field"><legend>Ends</legend>
      <label class="opt"><input type="radio" name="endMode" value="never" ${endMode === 'never' ? 'checked' : ''}> Never</label>
      <label class="opt"><input type="radio" name="endMode" value="date" ${endMode === 'date' ? 'checked' : ''}> On
        <input class="input input--inline" name="endDate" type="date" aria-label="End date" value="${esc(h?.endDate)}" ${h ? '' : `min="${key(today())}"`}></label>
      <label class="opt"><input type="radio" name="endMode" value="count" ${endMode === 'count' ? 'checked' : ''}> After
        <input class="input input--inline" name="endAfter" type="number" min="1" max="365" inputmode="numeric" aria-label="Number of times" value="${esc(h?.endAfter)}" placeholder="10"> times</label>
      ${err('f-end-err', 'Choose a date, or how many times.')}
      <p class="hint">After the end, the habit stops showing up on Today. Its history stays.</p></fieldset>
    <div class="row row--between">
      <button type="button" class="btn" data-action="close-dialog">${icon('x')}<span>Cancel</span></button>
      <button type="submit" class="btn btn--on">${icon('check')}<span>Save</span></button>
    </div>
  </form>`;
}

/* ---------------- History ---------------- */
const STATUS_WORDS = { part: 'partly done', done: 'done', skip: 'skipped', miss: 'missed', rest: 'not scheduled', up: 'upcoming', out: '' };
const MONTH = (d) => d.getFullYear() * 12 + d.getMonth();

/** Month calendar from the habit's start date to its end date, marking the days the task is planned. */
function calendar(h, state, ui, jr) {
  const now = today();
  const lo = MONTH(jr.start), hi = MONTH(jr.end);
  const cur = ui.calMonth = Math.min(hi, Math.max(lo, ui.calMonth ?? MONTH(now)));
  const first = new Date(Math.floor(cur / 12), cur % 12, 1);
  const cells = Array.from({ length: (first.getDay() + 6) % 7 }, () => '<div aria-hidden="true"></div>');
  for (let d = first; d.getMonth() === first.getMonth(); d = addDays(d, 1)) {
    const s = calendarDay(h, state.logs, d, jr, now);
    const isStart = d.getTime() === jr.start.getTime(), isEnd = d.getTime() === jr.end.getTime();
    const label = `${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}: ${[isStart && 'start', isEnd && 'end', STATUS_WORDS[s]].filter(Boolean).join(', ')}`;
    cells.push(`<div class="cal-day st-${s} ${d.getTime() === now.getTime() ? 'is-today' : ''}" role="listitem" aria-label="${esc(label)}">
      <span>${d.getDate()}</span>${s === 'done' ? icon('check') : s === 'skip' ? icon('skip') : ''}
      ${isStart ? '<b class="flag">Start</b>' : isEnd ? '<b class="flag">End</b>' : ''}</div>`);
  }
  const range = `${fmtDate(key(jr.start))} to ${fmtDate(key(jr.end))}`;
  return `<p class="small"><strong>Start</strong> ${esc(fmtDate(key(jr.start), true))} &rarr; <strong>End</strong> ${esc(fmtDate(key(jr.end), true))}${jr.hasEnd ? '' : ` <span class="muted">(your ${PROGRESS_DAYS}th planned day)</span>`}</p>
    <div class="row row--between" style="margin:.6rem 0">
      <button type="button" class="btn btn--small" data-action="cal-step" data-delta="-1" aria-label="Previous month" ${cur <= lo ? 'disabled' : ''}>${icon('chevron-left')}</button>
      <h4 class="cal-title" aria-live="polite">${esc(first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}</h4>
      <button type="button" class="btn btn--small" data-action="cal-step" data-delta="1" aria-label="Next month" ${cur >= hi ? 'disabled' : ''}>${icon('chevron-right')}</button>
    </div>
    <div class="cal" role="list" aria-label="Planned days, ${esc(range)}">
      ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((n) => `<span class="cal-head" aria-hidden="true">${n}</span>`).join('')}${cells.join('')}
    </div>
    <div class="legend" aria-hidden="true">
      <span><i class="key st-done"></i>Done</span><span><i class="key st-skip"></i>Skipped</span><span><i class="key st-up"></i>Upcoming</span><span><i class="key st-part"></i>Partly</span>
      <span><i class="key st-miss"></i>Missed</span><span><i class="key st-rest"></i>Off day</span>
    </div>`;
}

function insightsCard(state) {
  const ins = tagInsights(state.habits, state.logs);
  let body;
  if (!ins.rows.length && !ins.ready) body = `<p>Add tags on your check-ins. After two weeks, I'll show which ones tend to come before a missed day. ${ins.daysLeft} days to go.</p>`;
  else if (!ins.ready) body = `<p>Keep tagging. Patterns show up in ${ins.daysLeft} more days.</p>`;
  else if (!ins.rows.length) body = '<p>No tagged check-ins to learn from yet. Tags are optional, and that is fine.</p>';
  else body = `<p class="muted small">How often the next scheduled day was missed after a check-in with each tag.</p>
    <ul class="list">${ins.rows.map((r) => `<li><div class="row row--between"><strong>${esc(r.tag)}</strong><span>${r.misses} of ${r.total} followed by a miss</span></div>
      <div class="bar" role="img" aria-label="${Math.round((r.misses / r.total) * 100)} percent"><i style="width:${(r.misses / r.total) * 100}%"></i></div></li>`).join('')}</ul>`;
  return `<section class="card" aria-labelledby="ins-h"><h3 id="ins-h">Before the misses</h3><div class="stack stack--tight" style="margin-top:.6rem">${body}</div></section>`;
}

export function historyView(state, ui) {
  const habits = state.habits;
  if (!habits.length) return `<div class="card card--dashed empty">${circled('calendar')}<h3>Nothing to look back on yet</h3><p>Your history will fill in as you log.</p></div>`;
  const h = habits.find((x) => x.id === ui.historyId) ?? habits[0];
  const c = chain(h, state.logs), pct = completion30(h, state.logs), jr = journey(h, state.logs);
  const summary = weekly(habits, state.logs);
  return `<div class="stack">
    <h2>History</h2>
    <div class="chips" role="group" aria-label="Choose a habit">
      ${habits.map((x) => `<button type="button" class="chip" data-action="pick-history" data-id="${esc(x.id)}" aria-pressed="${x.id === h.id}">${esc(x.name)}</button>`).join('')}
    </div>
    <section class="card" aria-labelledby="hm-h"><h3 id="hm-h">${esc(h.name)}</h3>
      <div class="badges"><span class="badge">${icon('link')} Chain: ${c}</span><span class="badge">${pct === null ? '30 days: —' : `Last 30 days: ${pct}%`}</span></div>
      ${calendar(h, state, ui, jr)}</section>
    <section class="card" aria-labelledby="p66-h"><h3 id="p66-h">${jr.hasEnd ? 'Your journey' : `${PROGRESS_DAYS}-day journey`}</h3>
      <p class="small muted">${jr.hasEnd ? 'Every day this habit is planned, until your end date.' : `Your first ${PROGRESS_DAYS} planned days (people need about 66 days on average to make a habit automatic).`} Off days aren't counted, and misses never take progress away.</p>
      <div class="dots" role="img" aria-label="${jr.done} of ${jr.days.length} planned days done" style="margin:.7rem 0">${jr.days.map((x) => `<i class="st-${x.status}" title="${esc(fmtDate(key(x.date)))}: ${STATUS_WORDS[x.status]}"></i>`).join('')}</div>
      <p><strong>${jr.done}</strong> of ${jr.days.length} planned days</p></section>
    <section class="card" aria-labelledby="wk-h"><h3 id="wk-h">This week</h3>
      <ul class="list" style="margin-top:.7rem">${summary.map((w) => `<li class="week-row"><div class="row row--between"><span>${esc(w.habit.name)}</span><span>${w.done}/${w.scheduled}${w.skipped ? ` · ${w.skipped} skipped` : ''}</span></div>
        <div class="bar" role="img" aria-label="${w.done} of ${w.scheduled} done"><i style="width:${w.scheduled ? (w.done / w.scheduled) * 100 : 0}%"></i></div></li>`).join('')}</ul></section>
    ${insightsCard(state)}
  </div>`;
}

/* ---------------- Settings ---------------- */
export function settingsView() {
  const perm = reminders.permission();
  const notifBtn = perm === 'granted' ? '<p>Reminders are on. ✓</p>'
    : perm === 'denied' ? '<p class="muted">Notifications are blocked. Change this in your browser or phone settings.</p>'
    : perm === 'unsupported' ? '<p class="muted">This browser can\'t show notifications.</p>'
    : btn('enable-notifs', 'Turn on reminders', 'bell');
  return `<div class="stack"><h2>Settings</h2>
    <section class="card"><h3>Reminders</h3><div class="stack stack--tight" style="margin-top:.6rem">${notifBtn}
      <p class="small muted">On iPhone and iPad, reminders only work after you add this app to your Home Screen (iOS 16.4+). They fire while the app is open or recently active.</p></div></section>
    <section class="card"><h3>Your data</h3><div class="stack stack--tight" style="margin-top:.6rem">
      <p class="small muted">Everything lives on this device. No accounts, ads, or trackers.</p>
      <div class="actions">${btn('export', 'Export CSV', 'download')}${btn('wipe', 'Delete all data', 'trash', '', 'btn--danger')}</div></div></section>
  </div>`;
}
