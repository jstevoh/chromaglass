/**
 * What the page is told about the app it is in.
 *
 * `__CHROMAGLASS_NATIVE__` is the name `detectTier()` (src/lib/platform.ts)
 * already looked for, so the show gets the native tier's quality ladder. And
 * `shell: 'desktop'` is what `isDesktopApp()` reads: in this app a projector
 * that appears is used at once, with no click (useProjector), because the app
 * opens the window itself and a popup needs no gesture here.
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
  setAmbient(on) {
    ipcRenderer.send('chromaglass:set-ambient', Boolean(on));
  },
});
