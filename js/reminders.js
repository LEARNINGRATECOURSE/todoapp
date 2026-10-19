// Per-habit reminders. Fires while the app (or its service worker) is alive; true background
// push needs a push server, which a local-first v1 deliberately doesn't have.
import { key, today, logKey, isEnded, occursOn } from './stats.js';
import { markNotified } from './store.js';

export const supported = () => 'Notification' in window;
export const permission = () => (supported() ? Notification.permission : 'unsupported');
export const request = () => (supported() ? Notification.requestPermission() : Promise.resolve('unsupported'));

async function notify(habit) {
  const opts = { body: habit.cue ? `Cue: ${habit.cue}` : 'Tap to log it in two taps.', tag: habit.id, icon: 'icons/icon-192.png' };
  const reg = await navigator.serviceWorker?.ready.catch(() => null);
  if (reg) reg.showNotification(habit.name, opts); else new Notification(habit.name, opts);
}

export function startReminders(getState) {
  const tick = () => {
    if (permission() !== 'granted') return;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const { habits, logs, notified } = getState();
    const date = key(today());
    for (const h of habits) {
      if (isEnded(h, now) || !h.reminder || h.reminder > hhmm || !occursOn(h, now)) continue;
      if (logs[logKey(h.id, date)] || notified[logKey(h.id, date)]) continue;
      markNotified(h.id, date);
      notify(h);
    }
  };
  tick();
  return setInterval(tick, 30_000);
}
