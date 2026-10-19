import { getState, saveHabit, deleteHabit, setLog, clearLog, wipe, parseBackup, replaceAll } from './store.js';
import { apply as applyPrefs, setPref, clearPrefs } from './prefs.js';
import { key, today, logKey, parse, addDays } from './stats.js';
import { todayView, habitsView, historyView, settingsView, editorForm } from './views.js';
import { toCsv, download } from './csv.js';
import * as reminders from './reminders.js';

const VIEWS = { today: todayView, habits: habitsView, history: historyView, settings: settingsView };
const $ = (s) => document.querySelector(s);
const main = $('#main');
const editor = $('#editor');
const confirmDlg = $('#confirm');

const ui = { view: 'today', panel: null, draft: { resistance: null, tags: [] }, historyId: null, notice: '', date: null, calMonth: null, justLogged: null };
let renderedDay = key(today());

function render(focusId) {
  const prev = focusId ?? document.activeElement?.dataset?.fid;
  main.innerHTML = VIEWS[ui.view](getState(), ui);
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-current', t.dataset.view === ui.view ? 'page' : 'false'));
  if (prev) main.querySelector(`[data-fid="${CSS.escape(prev)}"]`)?.focus({ preventScroll: true });
}

function go(view) {
  ui.view = view; ui.panel = null; ui.notice = '';
  render();
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function openEditor(id) {
  editor.innerHTML = editorForm(id ? getState().habits.find((h) => h.id === id) : null);
  editor.showModal();
  editor.querySelector('#f-name').focus();
}

function ask(message, okLabel, cancelLabel = 'Keep my data') {
  confirmDlg.querySelector('#confirm-msg').textContent = message;
  confirmDlg.querySelector('#confirm-cancel').textContent = cancelLabel;
  confirmDlg.querySelector('#confirm-ok').lastElementChild.textContent = okLabel;
  return new Promise((resolve) => {
    confirmDlg.returnValue = '';
    confirmDlg.addEventListener('close', () => resolve(confirmDlg.returnValue === 'ok'), { once: true });
    confirmDlg.showModal();
  });
}

const habitOf = (id) => getState().habits.find((h) => h.id === id);
// The day being logged: today unless the user stepped back to catch up on an earlier day
const viewKey = () => ui.date ?? key(today());
const todaysLog = (id) => getState().logs[logKey(id, viewKey())];
// Check-in answers come from the open panel if there is one, otherwise whatever was already saved
const feltFor = (id, prev) => (ui.panel === id ? ui.draft : { resistance: prev?.resistance ?? null, tags: prev?.tags ?? [] });

const actions = {
  nav(el) { ui.date = null; go(el.dataset.view); },
  'day-step'(el) {
    const earliest = getState().habits.reduce((m, h) => (h.createdAt < m ? h.createdAt : m), key(today()));
    const next = key(addDays(parse(viewKey()), Number(el.dataset.delta)));
    ui.date = next >= key(today()) ? null : next < earliest ? ui.date : next;
    ui.panel = null;
    render();
  },
  'day-today'() { ui.date = null; ui.panel = null; render(); },
  'open-day'(el) { ui.date = el.dataset.date === key(today()) ? null : el.dataset.date; go('today'); },
  panel(el) {
    ui.panel = ui.panel === el.dataset.id ? null : el.dataset.id;
    ui.draft = { resistance: null, tags: [] };
    render();
  },
  res(el) {
    ui.draft.resistance = ui.draft.resistance === el.dataset.level ? null : el.dataset.level;
    render(null);
    main.querySelector(`[data-level="${el.dataset.level}"]`)?.focus();
  },
  tag(el) {
    const t = el.dataset.tag, tags = ui.draft.tags;
    ui.draft.tags = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t];
    render(null);
    main.querySelector(`[data-tag="${CSS.escape(t)}"]`)?.focus();
  },
  log(el) {
    const { id } = el.dataset, h = habitOf(id), prev = todaysLog(id);
    const count = h.target ? { target: h.target, current: el.dataset.status === 'done' ? h.target : prev?.current ?? 0 } : {};
    setLog(id, viewKey(), { status: el.dataset.status, ...feltFor(id, prev), ...count });
    ui.panel = null; ui.justLogged = id;
    render(`undo-${id}`);
    ui.justLogged = null;
  },
  step(el) { // counter habits: reaching the goal marks the day done; anything less is partial progress
    const { id } = el.dataset, h = habitOf(id), prev = todaysLog(id);
    const current = Math.max(0, (prev?.current ?? 0) + Number(el.dataset.delta) * (h.step || 1));
    if (current === 0) clearLog(id, viewKey());
    else setLog(id, viewKey(), { status: current >= h.target ? 'done' : 'partial', current, target: h.target, ...feltFor(id, prev) });
    render();
    ui.justLogged = null;
  },
  undo(el) { clearLog(el.dataset.id, viewKey()); render(`done-${el.dataset.id}`); },
  'new-habit': () => openEditor(),
  'edit-habit': (el) => openEditor(el.dataset.id),
  async delete(el) {
    const h = getState().habits.find((x) => x.id === el.dataset.id);
    if (await ask(`Delete "${h.name}" and all of its history? This can't be undone.`, 'Delete habit', 'Keep it')) {
      deleteHabit(h.id); render('new');
    }
  },
  'pick-history': (el) => { ui.historyId = el.dataset.id; ui.calMonth = null; render(); },
  'cal-step': (el) => {
    ui.calMonth += Number(el.dataset.delta); // the view always stores a clamped month
    render();
  },
  'close-dialog': () => editor.close(),
  export: () => download(`habits-${key(today())}.csv`, toCsv(getState())),
  pref(el) { setPref(el.dataset.key, JSON.parse(el.dataset.value)); render(); },
  backup() {
    const { habits, logs } = getState();
    download(`habits-backup-${key(today())}.json`, JSON.stringify({ app: 'scribble-habits', version: 1, exportedAt: new Date().toISOString(), habits, logs }, null, 2), 'application/json');
  },
  restore: () => $('#restore-file').click(),
  async wipe() {
    if (await ask('This permanently deletes every habit and log on this device. It can\'t be undone.', 'Delete everything')) {
      wipe(); clearPrefs(); location.reload();
    }
  },
  async 'enable-notifs'() { await reminders.request(); render(); },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el) actions[el.dataset.action]?.(el);
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  if (form.dataset.form === 'custom-tag') {
    const t = new FormData(form).get('tag').trim().toLowerCase();
    if (t && !ui.draft.tags.includes(t)) ui.draft.tags.push(t);
    const habitId = ui.panel;
    render(null);
    main.querySelector(`#tag-in-${CSS.escape(habitId)}`)?.focus();
    return;
  }
  const data = new FormData(form);
  const name = data.get('name').trim(), days = data.getAll('day').map(Number);
  const isCount = data.get('kind') === 'count', target = isCount ? Number(data.get('target')) : null;
  const mode = data.get('endMode'), endDate = mode === 'date' ? data.get('endDate') : null, endAfter = mode === 'count' ? Number(data.get('endAfter')) : null;
  const problems = [
    ['#f-name-err', !name, '#f-name'],
    ['#f-target-err', isCount && !(target >= 1), '#f-target'],
    ['#f-days-err', !days.length, '[name=day]'],
    ['#f-end-err', (mode === 'date' && !endDate) || (mode === 'count' && !(endAfter >= 1)), mode === 'date' ? '[name=endDate]' : '[name=endAfter]'],
  ];
  problems.forEach(([err, bad]) => { form.querySelector(err).hidden = !bad; });
  const first = problems.find(([, bad]) => bad);
  if (first) return form.querySelector(first[2]).focus();
  saveHabit({
    id: data.get('id') || null, name, days, every: Number(data.get('every')), cue: data.get('cue'), reminder: data.get('reminder'),
    endDate, endAfter, target, unit: data.get('unit'), step: Number(data.get('step')) || 1,
  });
  editor.close();
  render();
});

$('#restore-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const backup = parseBackup(await file.text());
  if (!backup) { ui.notice = "That file isn't a Scribble Habits backup, so nothing was changed."; return render(); }
  const msg = `Replace everything on this device with this backup (${backup.habits.length} habits, ${Object.keys(backup.logs).length} entries)?`;
  if (await ask(msg, 'Restore backup', 'Cancel')) { replaceAll(backup); ui.notice = 'Backup restored.'; render(); }
});

// Typing in an "Ends" input selects its radio
document.addEventListener('focusin', (e) => {
  if (e.target.name === 'endDate' || e.target.name === 'endAfter') e.target.closest('label').querySelector('input[type=radio]').checked = true;
});

// Close dialogs on backdrop click
[editor, confirmDlg].forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

// Roll over at midnight / when the app returns to the foreground
const rollover = () => { const k = key(today()); if (k !== renderedDay) { renderedDay = k; render(); } };
document.addEventListener('visibilitychange', () => { if (!document.hidden) rollover(); });
setInterval(rollover, 60_000);

applyPrefs();
render();
reminders.startReminders(getState);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
