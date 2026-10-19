// "Add to home screen" support. Android/Chrome expose an install prompt; iOS Safari has no API, so we show steps.
let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify(); });
window.addEventListener('appinstalled', () => { deferred = null; notify(); });

export const onInstallChange = (fn) => listeners.add(fn);
export const canPrompt = () => !!deferred;
export const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export function platform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'; // iPadOS reports as a Mac
  return /Android/i.test(ua) ? 'android' : 'other';
}

/** Shows the browser's install dialog. Returns 'accepted', 'dismissed' or 'unavailable'. */
export async function promptInstall() {
  if (!deferred) return 'unavailable';
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  return outcome;
}
