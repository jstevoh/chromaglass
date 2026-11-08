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

// Syphon output (PLAN.md 13.2): the show page checks `canUseProFeature()` in
// `src/lib/syphonOut.ts` and hands GPU-backed `ImageBitmap` frames over a
// `MessageChannelMain` port to the offscreen Syphon window, whose compositor
// emits `paint` events carrying an `IOSurface` handle to `Syphon.framework`.
let syphonPort = null;
let syphonLastAsked = false;
let syphonHasAsked = false;
let syphonActive = false;
const syphonAskListeners = new Set();
let syphonCanvas = null;
let syphonCtx = null;
let syphonLatestBmp = null;
let syphonNeedsBlit = false;
let syphonLastDrawMs = 0;
let syphonRafId = 0;
let syphonIntervalId = 0;
let syphonFlip = 0;

function isSyphonReceiverWindow() {
  try {
    return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('syphon') === '1';
  } catch {
    return false;
  }
}

function drawSyphonLatest() {
  if (!syphonActive) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - syphonLastDrawMs < 12) return;
  syphonLastDrawMs = now;
  const w = syphonLatestBmp ? syphonLatestBmp.width : 640;
  const h = syphonLatestBmp ? syphonLatestBmp.height : 360;
  if (!syphonCanvas) {
    syphonCanvas = document.createElement('canvas');
    syphonCanvas.width = w;
    syphonCanvas.height = h;
    syphonCtx = syphonCanvas.getContext('2d', { alpha: false });
  }
  if (!syphonCanvas.isConnected && document.body) {
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    document.body.innerHTML = '';
    document.body.appendChild(syphonCanvas);
  }
  if (syphonLatestBmp && (syphonCanvas.width !== w || syphonCanvas.height !== h)) {
    syphonCanvas.width = w;
    syphonCanvas.height = h;
    syphonNeedsBlit = true;
  }
  if (syphonCtx) {
    if (syphonLatestBmp && syphonNeedsBlit) {
      syphonCtx.drawImage(syphonLatestBmp, 0, 0);
      syphonNeedsBlit = false;
    }
    // Toggle 1 LSB on a 1x1 pixel with opaque colour so the 8-bit offscreen
    // compositor always records damage and emits a 60 Hz IOSurface paint event.
    syphonFlip ^= 1;
    syphonCtx.fillStyle = syphonFlip ? '#000000' : '#010101';
    syphonCtx.fillRect(0, 0, 1, 1);
  }
}

function stopSyphonTick() {
  if (syphonRafId && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(syphonRafId);
    syphonRafId = 0;
  }
  if (syphonIntervalId) {
    clearInterval(syphonIntervalId);
    syphonIntervalId = 0;
  }
}

function syphonTick() {
  if (!syphonActive) {
    syphonRafId = 0;
    return;
  }
  drawSyphonLatest();
  syphonRafId = requestAnimationFrame(syphonTick);
}

function ensureSyphonTick() {
  if (!syphonActive) return;
  if (!syphonRafId && typeof requestAnimationFrame === 'function') {
    syphonRafId = requestAnimationFrame(syphonTick);
  }
  if (!syphonIntervalId) {
    syphonIntervalId = setInterval(() => {
      if (!syphonActive) {
        stopSyphonTick();
        return;
      }
      drawSyphonLatest();
    }, 16);
  }
}

ipcRenderer.on('chromaglass:syphon-port', (event) => {
  const port = event.ports && event.ports[0];
  if (!port) return;
  if (syphonPort) {
    try { syphonPort.close(); } catch { /* ignore */ }
  }
  syphonPort = port;
  if (isSyphonReceiverWindow()) {
    port.onmessage = (msg) => {
      const bmp = msg.data;
      if (!bmp || typeof bmp.close !== 'function') return;
      if (!syphonActive) {
        try { bmp.close(); } catch { /* ignore */ }
        return;
      }
      if (syphonLatestBmp && syphonLatestBmp !== bmp) {
        try { syphonLatestBmp.close(); } catch { /* ignore */ }
      }
      syphonLatestBmp = bmp;
      syphonNeedsBlit = true;
      ensureSyphonTick();
    };
    port.start();
  }
});

ipcRenderer.on('chromaglass:syphon-ask', (_event, on) => {
  const wanted = Boolean(on);
  syphonLastAsked = wanted;
  syphonHasAsked = true;
  if (isSyphonReceiverWindow()) {
    syphonActive = wanted;
    if (!wanted) {
      stopSyphonTick();
      syphonNeedsBlit = false;
      if (syphonLatestBmp) {
        try { syphonLatestBmp.close(); } catch { /* ignore */ }
        syphonLatestBmp = null;
      }
    } else {
      syphonLastDrawMs = 0;
      drawSyphonLatest();
      ensureSyphonTick();
    }
    return;
  }
  for (const fn of syphonAskListeners) {
    try { fn(wanted); } catch { /* ignore */ }
  }
});

if (typeof window !== 'undefined') {
  window.addEventListener('message', (e) => {
    if (e.source === window && e.data && e.data.__cgSyphonFrame && e.data.bmp) {
      const bmp = e.data.bmp;
      if (syphonPort) {
        try { syphonPort.postMessage(bmp, [bmp]); } catch { try { bmp.close(); } catch { /* ignore */ } }
      } else {
        try { bmp.close(); } catch { /* ignore */ }
      }
    }
  });
}

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
  syphon: {
    set: (on) => ipcRenderer.send('chromaglass:syphon-set', Boolean(on)),
    onAsk: (fn) => {
      if (typeof fn !== 'function') return () => {};
      syphonAskListeners.add(fn);
      if (syphonHasAsked) {
        try { fn(syphonLastAsked); } catch { /* ignore */ }
      }
      return () => syphonAskListeners.delete(fn);
    },
  },
});
