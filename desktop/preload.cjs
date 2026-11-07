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
  onSystemAudioPcm(fn) {
    if (typeof fn !== 'function') return () => {};
    const listener = (_event, samples, sampleRate) => {
      try { fn(samples, sampleRate); } catch { /* ignore */ }
    };
    ipcRenderer.on('chromaglass:system-audio-pcm', listener);
    return () => ipcRenderer.removeListener('chromaglass:system-audio-pcm', listener);
  },
  onAmbientChange(fn) {
    if (typeof fn !== 'function') return () => {};
    const listener = (_event, on) => {
      try { fn(Boolean(on)); } catch { /* ignore */ }
    };
    ipcRenderer.on('chromaglass:ambient', listener);
    return () => ipcRenderer.removeListener('chromaglass:ambient', listener);
  },
  // The Show menu's Ableton Link item (PLAN.md 13.5-link-menu): the page
  // switches Link as its own Link button does, so it stays remembered.
  onLinkMenu(fn) {
    if (typeof fn !== 'function') return () => {};
    const listener = (_event, on) => {
      try { fn(Boolean(on)); } catch { /* ignore */ }
    };
    ipcRenderer.on('chromaglass:link', listener);
    return () => ipcRenderer.removeListener('chromaglass:link', listener);
  },
  setAmbient(on) {
    ipcRenderer.send('chromaglass:set-ambient', Boolean(on));
  },
  // A sign-in that must finish in the real browser (PLAN.md 23.17d): main.js
  // opens only this app's own address.
  openInBrowser: (url) => ipcRenderer.invoke('chromaglass:open-browser', String(url)),
  // The laptop's "Make it full screen" for the projector window this show
  // opened (main.js `fillProjector`): no gesture needed from this side.
  fillProjector: () => ipcRenderer.invoke('chromaglass:fill-projector'),
  // The live stream (PLAN.md 37x-4b; src/lib/liveStream.ts is the page's
  // side, desktop/live.js the other). The page names a key; it never holds
  // one. `packet` is send, not invoke: thirty frames and fifty audio packets a
  // second have nothing to wait for.
  live: {
    start: (req) => ipcRenderer.invoke('chromaglass:live-start', req),
    config: (cfg) => ipcRenderer.invoke('chromaglass:live-config', cfg),
    packet: (p) => ipcRenderer.send('chromaglass:live-packet', p),
    stop: () => ipcRenderer.invoke('chromaglass:live-stop'),
    state: () => ipcRenderer.invoke('chromaglass:live-state'),
    onEvent: (fn) => {
      const listener = (_e, ev) => { try { fn(ev); } catch { /* the page's own error */ } };
      ipcRenderer.on('chromaglass:live-event', listener);
      return () => ipcRenderer.removeListener('chromaglass:live-event', listener);
    },
    keys: {
      set: (name, key) => ipcRenderer.invoke('chromaglass:live-key-set', String(name), String(key)),
      list: () => ipcRenderer.invoke('chromaglass:live-key-list'),
      remove: (name) => ipcRenderer.invoke('chromaglass:live-key-remove', String(name)),
    },
  },
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
