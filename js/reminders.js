// Per-habit reminders. They fire while the app is running (open, or alive in the background). Phones can
// suspend background apps, so a reminder may arrive late, when the app wakes. Reliable delivery while the app is
// closed needs a push server, which a local-first v1 deliberately doesn't have.
import { key, today, logKey, isEnded, occursOn } from './stats.js';
import { markNotified } from './store.js';

export const supported = () => 'Notification' in window;
export const permission = () => (supported() ? Notification.permission : 'unsupported');
export const request = () => (supported() ? Notification.requestPermission() : Promise.resolve('unsupported'));

/** The active service worker, or null. (`serviceWorker.ready` would wait forever if there isn't one.) */
async function activeWorker() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    return reg?.active ? reg : null;
  } catch { return null; }
}
export const workerReady = async () => !!(await activeWorker());

/** Shows a notification. Resolves true only if one was actually handed to the browser. */
export async function notify(habit) {
  const opts = { body: habit.cue ? `Cue: ${habit.cue}` : 'Tap to log it in two taps.', tag: habit.id, icon: 'icons/icon-192.png' };
  try {
    const reg = await activeWorker(); // phones require the service worker route
    if (reg) { await reg.showNotification(habit.name, opts); return true; }
  } catch { /* fall through to the page API */ }
  try { new Notification(habit.name, opts); return true; } catch { return false; } // desktop only; throws on Android
}

/** Habits with a reminder time, in case the user hasn't allowed notifications yet. */
export const hasReminders = (habits) => habits.some((h) => h.reminder && !isEnded(h, today()));

const sending = new Set();

export function startReminders(getState) {
  const tick = async () => {
    if (permission() !== 'granted') return;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const { habits, logs, notified } = getState();
    const date = key(today());
    for (const h of habits) {
      const id = logKey(h.id, date);
      if (isEnded(h, now) || !h.reminder || h.reminder > hhmm || !occursOn(h, now)) continue;
      if (logs[id] || notified[id] || sending.has(id)) continue;
      sending.add(id);
      // Only mark it sent once it really showed, so a failure is retried on the next tick
      if (await notify(h)) markNotified(h.id, date);
      sending.delete(id);
    }
  };
  tick();
  // Check as soon as the app wakes or returns to the foreground, not just on the timer
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  addEventListener('focus', tick);
  addEventListener('pageshow', tick);
  return setInterval(tick, 20_000);
}
