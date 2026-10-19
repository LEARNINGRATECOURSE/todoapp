// Display preferences. Kept apart from habit data so a restored backup never changes how the app looks.
const KEY = 'scribble-habits.prefs';
const DEFAULTS = { theme: 'system', text: 'normal', calm: false, weekStart: 1, time: 'auto' };
const VALID = {
  theme: ['system', 'light', 'dark'], text: ['normal', 'large'], calm: [false, true], weekStart: [0, 1], time: ['auto', '12', '24'],
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY)) || {};
    return Object.fromEntries(Object.entries(DEFAULTS).map(([k, d]) => [k, VALID[k].includes(raw[k]) ? raw[k] : d]));
  } catch { return { ...DEFAULTS }; }
}

let prefs = load();
const dark = matchMedia('(prefers-color-scheme: dark)');

export const getPrefs = () => prefs;
/** Options for toLocaleTimeString honouring the 12h/24h preference. */
export const timeOpts = () => ({ hour: 'numeric', minute: '2-digit', ...(prefs.time !== 'auto' && { hour12: prefs.time === '12' }) });

export function apply() {
  const root = document.documentElement;
  const isDark = prefs.theme === 'dark' || (prefs.theme === 'system' && dark.matches);
  root.dataset.theme = isDark ? 'dark' : 'light';
  root.dataset.text = prefs.text;
  root.dataset.calm = prefs.calm ? '1' : '0';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#1e1c19' : '#fdfbf7');
}

export function setPref(name, value) {
  if (!VALID[name]?.includes(value)) return;
  prefs = { ...prefs, [name]: value };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
  apply();
}

export function clearPrefs() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

dark.addEventListener('change', () => { if (prefs.theme === 'system') apply(); });
