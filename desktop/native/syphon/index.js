/**
 * Loads the macOS Syphon native add-on (`build/syphon.node`) and wires the
 * offscreen shared-texture window in the main process (PLAN.md 13.2).
 *
 * When packed in `app.asar`, `electron-builder` unpacks `*.node` into
 * `app.asar.unpacked`; Node/Electron's `createRequire` resolves unpacked `.node`
 * binaries, and we check the unpacked path explicitly as well.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function loadAddon() {
  if (process.platform !== 'darwin') return null;
  const localNode = join(HERE, 'build', 'syphon.node');
  const unpackedNode = localNode.replace('app.asar', 'app.asar.unpacked');
  if (!existsSync(unpackedNode) && !existsSync(localNode)) {
    const buildScript = join(HERE, 'build.mjs');
    if (existsSync(buildScript) && !HERE.includes('app.asar')) {
      spawnSync(process.execPath, [buildScript], { stdio: 'ignore' });
    }
  }
  const target = existsSync(unpackedNode) ? unpackedNode : localNode;
  try {
    return require(target);
  } catch {
    return null;
  }
}

const addon = loadAddon();

export const syphonAddon = {
  loaded: Boolean(addon),
  start(name = 'ChromaGlass') {
    if (!addon) return false;
    return Boolean(addon.start(name));
  },
  stop() {
    if (!addon) return true;
    return Boolean(addon.stop());
  },
  publishIOSurface(ioSurfaceBuffer) {
    if (!addon) return false;
    return Boolean(addon.publishIOSurface(ioSurfaceBuffer));
  },
  state() {
    if (!addon) return { serving: false, name: null, published: 0, hasClients: false };
    return addon.state();
  },
};

export function createSyphonController({ BrowserWindow, ipcMain, Menu, MessageChannelMain, show, readShowFile, writeShowFile, getShowWindow, webPreferences }) {
  let syphonWindow = null;
  let syphonWanted = false;
  const origGetAllWindows = BrowserWindow.getAllWindows.bind(BrowserWindow);
  BrowserWindow.getAllWindows = () => origGetAllWindows().filter((w) => w !== syphonWindow);

  const syphonState = {
    loaded: syphonAddon.loaded,
    serving: false,
    name: null,
    published: 0,
    released: 0,
  };
  globalThis.__chromaglassSyphon = syphonState;

  function setMenuChecked(checked) {
    const item = Menu.getApplicationMenu()?.getMenuItemById('syphon-out');
    if (item && item.checked !== checked) item.checked = checked;
  }

  function stopServer() {
    syphonWanted = false;
    syphonAddon.stop();
    syphonState.serving = false;
    syphonState.name = null;
  }

  function requestSyphonOut(on) {
    const wanted = Boolean(on);
    show.syphon = wanted;
    writeShowFile({ syphon: wanted });
    setMenuChecked(wanted);
    const showWindow = getShowWindow();
    if (!wanted) {
      stopServer();
      if (syphonWindow && !syphonWindow.isDestroyed()) {
        try { syphonWindow.webContents.send('chromaglass:syphon-ask', false); } catch { /* ignore */ }
      }
      if (showWindow && !showWindow.isDestroyed()) {
        try { showWindow.webContents.send('chromaglass:syphon-ask', false); } catch { /* ignore */ }
      }
      return;
    }
    if (showWindow && !showWindow.isDestroyed()) {
      try { showWindow.webContents.send('chromaglass:syphon-ask', true); } catch { /* ignore */ }
    }
  }

  ipcMain.on('chromaglass:syphon-set', (_event, allowed) => {
    const ok = Boolean(allowed) && show.syphon && syphonAddon.loaded;
    if (!ok) {
      show.syphon = false;
      writeShowFile({ syphon: false });
      setMenuChecked(false);
      stopServer();
      if (syphonWindow && !syphonWindow.isDestroyed()) {
        try { syphonWindow.webContents.send('chromaglass:syphon-ask', false); } catch { /* ignore */ }
      }
      return;
    }
    if (syphonAddon.start('ChromaGlass')) {
      syphonWanted = true;
      if (syphonWindow && !syphonWindow.isDestroyed()) {
        try {
          syphonWindow.webContents.send('chromaglass:syphon-ask', true);
        } catch { /* ignore */ }
      }
    } else {
      stopServer();
    }
  });

  function connectChannel() {
    const showWindow = getShowWindow();
    if (!showWindow || showWindow.isDestroyed() || !syphonWindow || syphonWindow.isDestroyed()) return;
    const { port1, port2 } = new MessageChannelMain();
    syphonWindow.webContents.postMessage('chromaglass:syphon-port', null, [port1]);
    showWindow.webContents.postMessage('chromaglass:syphon-port', null, [port2]);
    syphonWindow.webContents.send('chromaglass:syphon-ask', syphonWanted);
    showWindow.webContents.send('chromaglass:syphon-ask', show.syphon);
  }

  async function openWindow() {
    if (process.platform !== 'darwin') return;
    syphonWindow = new BrowserWindow({
      width: 640,
      height: 360,
      show: false,
      backgroundColor: '#000000',
      webPreferences: {
        ...webPreferences(),
        offscreen: { useSharedTexture: true },
      },
    });
    syphonWindow.webContents.setFrameRate(60);
    syphonWindow.webContents.on('paint', (e) => {
      const tex = e?.texture;
      const ioSurface = tex?.textureInfo?.handle?.ioSurface;
      if (syphonWanted && ioSurface) {
        if (syphonAddon.publishIOSurface(ioSurface)) {
          syphonState.published += 1;
          syphonState.serving = true;
          syphonState.name = 'ChromaGlass';
        }
      }
      if (tex && typeof tex.release === 'function') {
        tex.release();
        syphonState.released += 1;
      }
    });
    await syphonWindow.loadURL(`http://127.0.0.1:${show.port}/privacy.html?syphon=1`);
    connectChannel();
  }

  function closeAll() {
    stopServer();
    for (const w of origGetAllWindows()) {
      if (!w.isDestroyed()) w.destroy();
    }
    syphonWindow = null;
  }

  return {
    readSetting() {
      try { return Boolean(readShowFile().syphon); } catch { return false; }
    },
    request: requestSyphonOut,
    connectChannel,
    openWindow,
    closeAll,
  };
}
