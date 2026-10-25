/**
 * What the page is told about the app it is in.
 *
 * `__CHROMAGLASS_NATIVE__` is the name `detectTier()` (src/lib/platform.ts)
 * already looked for, so the show gets the native tier's quality ladder. And
 * `shell: 'desktop'` is what `isDesktopApp()` reads: in this app a projector
 * that appears is used at once, with no click (useProjector), because the app
 * opens the window itself and a popup needs no gesture here.
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
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
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
