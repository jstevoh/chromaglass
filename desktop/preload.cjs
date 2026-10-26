/**
 * What the page is told about the app it is in.
 *
 * `__CHROMAGLASS_NATIVE__` is the name `detectTier()` (src/lib/platform.ts)
 * already looked for, so the show gets the native tier's quality ladder. And
 * `shell: 'desktop'` is what `isDesktopApp()` reads: in this app a projector
 * that appears is used at once, with no click (useProjector), because the app
 * opens the window itself and a popup needs no gesture here.
 *
 * `requireSignIn` says the app opens only on a Home or Pro key (always, in the
 * app as it ships; main.js), and `license` is the key main.js verified at
 * launch, so a licensed launch never shows the gate for a frame.
 *
 * `updates` is the profile sheet's view of what the app's updater found
 * (desktop/updates.js): `state()` asks, `act()` does what the menu item does
 * (open the new download, or restart into the one that has arrived), and
 * `onChange(fn)` hears each change. Only those three calls cross, never
 * ipcRenderer itself.
 *
 * CommonJS, because a sandboxed preload cannot be an ES module.
 */
const { contextBridge, ipcRenderer } = require('electron');

function parseArg(prefix) {
  const arg = (process.argv || []).find((a) => typeof a === 'string' && a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

let license = { valid: false, tier: 'free', email: null, id: null, exp: null, error: null, enforced: false };
try {
  const encoded = parseArg('--chromaglass-license=');
  if (encoded) {
    const json = decodeURIComponent(encoded);
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object') license = parsed;
  }
} catch { /* fallback to default */ }

const requireSignIn = parseArg('--chromaglass-require-signin=') === '1';

contextBridge.exposeInMainWorld('__CHROMAGLASS_NATIVE__', {
  shell: 'desktop',
  platform: process.platform,
  requireSignIn,
  license,
  // A sign-in that must finish in the real browser (PLAN.md 23.17d): main.js
  // opens only this app's own address.
  openInBrowser: (url) => ipcRenderer.invoke('chromaglass:open-browser', String(url)),
  updates: {
    state: () => ipcRenderer.invoke('chromaglass:update-state'),
    act: () => ipcRenderer.invoke('chromaglass:update-act'),
    onChange: (fn) => {
      const listener = (_e, state) => { try { fn(state); } catch { /* the page's own error */ } };
      ipcRenderer.on('chromaglass:update', listener);
      return () => ipcRenderer.removeListener('chromaglass:update', listener);
    },
  },
});
