import { getState, saveHabit, deleteHabit, setLog, clearLog, wipe } from './store.js';
import { key, today } from './stats.js';
import { todayView, habitsView, historyView, settingsView, editorForm } from './views.js';
import { toCsv, download } from './csv.js';
import * as reminders from './reminders.js';

const VIEWS = { today: todayView, habits: habitsView, history: historyView, settings: settingsView };
const $ = (s) => document.querySelector(s);
const main = $('#main');
const editor = $('#editor');
const confirmDlg = $('#confirm');

const ui = { view: 'today', panel: null, draft: { resistance: null, tags: [] }, historyId: null, justLogged: null };
let renderedDay = key(today());

function render(focusId) {
  const prev = focusId ?? document.activeElement?.dataset?.fid;
  main.innerHTML = VIEWS[ui.view](getState(), ui);
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-current', t.dataset.view === ui.view ? 'page' : 'false'));
  if (prev) main.querySelector(`[data-fid="${CSS.escape(prev)}"]`)?.focus({ preventScroll: true });
}

function go(view) {
  ui.view = view; ui.panel = null;
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

const actions = {
  nav: (el) => go(el.dataset.view),
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
    const id = el.dataset.id;
    const withDraft = ui.panel === id ? ui.draft : { resistance: null, tags: [] };
    setLog(id, key(today()), { status: el.dataset.status, ...withDraft });
    ui.panel = null; ui.justLogged = id;
    render(`undo-${id}`);
    ui.justLogged = null;
  },
  undo(el) { clearLog(el.dataset.id, key(today())); render(`done-${el.dataset.id}`); },
  'new-habit': () => openEditor(),
  'edit-habit': (el) => openEditor(el.dataset.id),
  async delete(el) {
    const h = getState().habits.find((x) => x.id === el.dataset.id);
    if (await ask(`Delete "${h.name}" and all of its history? This can't be undone.`, 'Delete habit', 'Keep it')) {
      deleteHabit(h.id); render('new');
    }
  },
  'pick-history': (el) => { ui.historyId = el.dataset.id; render(); },
  'close-dialog': () => editor.close(),
  export: () => download(`habits-${key(today())}.csv`, toCsv(getState())),
  async wipe() {
    if (await ask('This permanently deletes every habit and log on this device. It can\'t be undone.', 'Delete everything')) {
      wipe(); location.reload();
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
  form.querySelector('#f-name-err').hidden = !!name;
  form.querySelector('#f-days-err').hidden = days.length > 0;
  if (!name) return form.querySelector('#f-name').focus();
  if (!days.length) return;
  saveHabit({ id: data.get('id') || null, name, days, cue: data.get('cue'), reminder: data.get('reminder'), endDate: data.get('endDate') });
  editor.close();
  render();
});

// Close dialogs on backdrop click
[editor, confirmDlg].forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

// Roll over at midnight / when the app returns to the foreground
const rollover = () => { const k = key(today()); if (k !== renderedDay) { renderedDay = k; render(); } };
document.addEventListener('visibilitychange', () => { if (!document.hidden) rollover(); });
setInterval(rollover, 60_000);

render();
reminders.startReminders(getState);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
