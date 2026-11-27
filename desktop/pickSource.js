/*
  Which window or screen a picture-only `getDisplayMedia` films (Film → a
  window, from the desk or from the assistant): the person at the Mac picks it.

  What was found (the security review of 2026-11-13): the handler in main.js
  took `desktopCapturer.getSources(...)[0]`, the first window macOS listed,
  with no picker at all. That is whatever window was frontmost or first, Mail
  or a password manager as easily as the film the owner meant, and in Full
  mode an assistant talked round by a web page or a track title could ask for
  it and then go live, so it went out on the public stream and to every cast.
  The owner chose (2026-11-13) to keep the assistant's window filming but to
  have it ask: the window is picked by a hand, on this Mac, every time.

  Why a picker window of our own and not macOS's `useSystemPicker`: Electron's
  `useSystemPicker` is a whole-session switch, and the same handler gives
  System audio its loopback with no picker at all (main.js), which a system
  picker would break. An earlier version used `dialog.showMessageBox` buttons
  capped at 12 truncated names (49k / H5-03), dropping window #13+ with no
  thumbnails or app icons. A sandboxed modal picker window shows every window
  and screen with its preview, app icon, full title and search filter while
  the plate keeps drawing behind it, and cancelling or closing films nothing.

  Why thumbnails are handed in via `executeJavaScript` after `did-finish-load`
  rather than embedded in the `data:text/html` URL: Chromium caps URLs around
  2 MB (`ERR_INVALID_URL`), which 20+ base64 PNG thumbnails easily exceed.
*/

function safeImageDataUrl(img) {
  try {
    if (!img || typeof img.isEmpty !== 'function' || img.isEmpty() || typeof img.toDataURL !== 'function') return '';
    const url = img.toDataURL();
    return typeof url === 'string' && url.startsWith('data:image/') ? url : '';
  } catch {
    return '';
  }
}

/** Build serializable picker entries for every valid source (no count cap or title truncation). */
export function buildPickerItems(sources) {
  const list = (Array.isArray(sources) ? sources : []).filter((s) => s && typeof s.name === 'string');
  return list.map((s, i) => ({
    index: i,
    id: String(s.id ?? ''),
    name: s.name.trim() || `Window ${i + 1}`,
    kind: String(s.id ?? '').startsWith('screen:') ? 'Screen' : 'Window',
    thumbnail: safeImageDataUrl(s.thumbnail),
    appIcon: safeImageDataUrl(s.appIcon),
  }));
}

/** Render the sandboxed HTML picker shell. Items arrive via `window.__setSources(items)`. */
export function renderPickerHtml(initialItems = []) {
  const safeJson = JSON.stringify(initialItems)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'" />
  <title>Film which window onto the plate?</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; height: 100%;
      background: #0c0c10; color: #f1f0f5;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
      font-size: 13px; overflow: hidden;
    }
    .shell { display: flex; flex-direction: column; height: 100%; }
    .head {
      padding: 16px 18px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      display: flex; flex-direction: column; gap: 8px;
    }
    .title-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
    h1 { margin: 0; font-size: 15px; font-weight: 600; color: #fff; }
    .count { font-size: 12px; color: rgba(241,240,245,0.65); white-space: nowrap; }
    .sub { margin: 0; font-size: 12px; color: rgba(241,240,245,0.7); line-height: 1.4; }
    .search {
      width: 100%; min-height: 36px; padding: 6px 10px;
      border-radius: 8px; border: 1px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.06); color: #fff;
      font-size: 13px; outline: none;
    }
    .search:focus { border-color: rgba(167,139,250,0.8); }
    .grid-wrap { flex: 1; overflow-y: auto; padding: 14px 18px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(195px, 1fr));
      gap: 12px;
    }
    .card {
      display: flex; flex-direction: column; text-align: left;
      padding: 8px; border-radius: 10px; cursor: pointer;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.04); color: inherit;
      transition: border-color 0.12s, background 0.12s;
    }
    .card:hover, .card:focus-visible {
      outline: none;
      border-color: rgba(167,139,250,0.85);
      background: rgba(167,139,250,0.12);
    }
    .thumb {
      width: 100%; aspect-ratio: 16 / 9; border-radius: 6px;
      background: #17171f; overflow: hidden;
      display: flex; align-items: center; justify-content: center;
      color: rgba(241,240,245,0.45); font-size: 12px;
    }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .meta { display: flex; align-items: flex-start; gap: 7px; margin-top: 8px; min-width: 0; }
    .icon { width: 16px; height: 16px; border-radius: 3px; flex: none; margin-top: 1px; }
    .name {
      font-size: 12px; font-weight: 500; line-height: 1.35; color: #f5f4f8;
      overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      word-break: break-word;
    }
    .kind {
      margin-top: 4px; font-size: 11px; color: rgba(241,240,245,0.6);
    }
    .empty { padding: 28px 12px; text-align: center; color: rgba(241,240,245,0.65); }
    .foot {
      padding: 12px 18px; border-top: 1px solid rgba(255,255,255,0.1);
      display: flex; justify-content: flex-end; align-items: center; gap: 10px;
    }
    .cancel {
      min-height: 38px; padding: 0 16px; border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.06);
      color: #f1f0f5; font-size: 13px; font-weight: 500; cursor: pointer;
    }
    .cancel:hover, .cancel:focus-visible { outline: none; background: rgba(255,255,255,0.14); }
  </style>
</head>
<body>
  <div class="shell">
    <div class="head">
      <div class="title-row">
        <h1>Film which window onto the plate?</h1>
        <span class="count" id="count"></span>
      </div>
      <p class="sub">Something asked to film a window (the desk, or the assistant). Nothing is filmed until you choose.</p>
      <input class="search" id="search" type="search" placeholder="Filter windows and screens…" aria-label="Filter windows and screens" />
    </div>
    <div class="grid-wrap">
      <div class="grid" id="grid"></div>
      <div class="empty" id="empty" hidden>No windows match that filter.</div>
    </div>
    <div class="foot">
      <button type="button" class="cancel" id="cancel">Cancel</button>
    </div>
  </div>
  <script id="sources-json" type="application/json">${safeJson}</script>
  <script>
    let all = JSON.parse(document.getElementById('sources-json').textContent);
    const grid = document.getElementById('grid');
    const empty = document.getElementById('empty');
    const count = document.getElementById('count');
    const search = document.getElementById('search');
    const cancel = document.getElementById('cancel');

    function choose(index) {
      window.location.href = 'cg-pick://choose/' + index;
    }
    function abort() {
      window.location.href = 'cg-pick://cancel';
    }

    function render(filter) {
      const q = (filter || '').trim().toLowerCase();
      const shown = q ? all.filter((s) => s.name.toLowerCase().includes(q) || s.kind.toLowerCase().includes(q)) : all;
      grid.textContent = '';
      count.textContent = shown.length === all.length
        ? all.length + ' available'
        : shown.length + ' of ' + all.length;
      empty.hidden = shown.length > 0;
      for (const item of shown) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'card';
        btn.title = item.name;
        btn.setAttribute('data-source-id', item.id);
        btn.addEventListener('click', () => choose(item.index));

        const thumb = document.createElement('div');
        thumb.className = 'thumb';
        if (item.thumbnail) {
          const img = document.createElement('img');
          img.src = item.thumbnail;
          img.alt = '';
          thumb.appendChild(img);
        } else {
          thumb.textContent = 'No preview';
        }
        btn.appendChild(thumb);

        const meta = document.createElement('div');
        meta.className = 'meta';
        if (item.appIcon) {
          const icon = document.createElement('img');
          icon.className = 'icon';
          icon.src = item.appIcon;
          icon.alt = '';
          meta.appendChild(icon);
        }
        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = item.name;
        meta.appendChild(name);
        btn.appendChild(meta);

        const kind = document.createElement('div');
        kind.className = 'kind';
        kind.textContent = item.kind;
        btn.appendChild(kind);

        grid.appendChild(btn);
      }
    }

    window.__setSources = (items) => {
      all = Array.isArray(items) ? items : [];
      render(search.value);
    };

    search.addEventListener('input', () => render(search.value));
    cancel.addEventListener('click', abort);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); abort(); }
    });
    render('');
  </script>
</body>
</html>`;
}

function openWindowPicker(sources, { BrowserWindow, parent }) {
  const items = buildPickerItems(sources);
  if (!items.length) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const parentAlive = parent && !parent.isDestroyed?.() ? parent : undefined;
    const win = new BrowserWindow({
      width: 720,
      height: 560,
      minWidth: 360,
      minHeight: 380,
      parent: parentAlive,
      modal: Boolean(parentAlive),
      show: false,
      backgroundColor: '#0c0c10',
      title: 'Film which window onto the plate?',
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    const onParentClosed = () => finish(null);
    const finish = (choice) => {
      if (settled) return;
      settled = true;
      parentAlive?.removeListener?.('closed', onParentClosed);
      if (!win.isDestroyed()) win.destroy();
      resolve(choice);
    };
    parentAlive?.once?.('closed', onParentClosed);
    win.on('closed', () => finish(null));
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('before-input-event', (e, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape') {
        e.preventDefault();
        finish(null);
      }
    });
    win.webContents.on('will-navigate', (e, url) => {
      e.preventDefault();
      if (url.startsWith('cg-pick://choose/')) {
        const idx = Number(url.slice('cg-pick://choose/'.length));
        finish(Number.isInteger(idx) && idx >= 0 && idx < sources.length ? sources[idx] : null);
      } else if (url === 'cg-pick://cancel') {
        finish(null);
      }
    });
    win.webContents.once('did-finish-load', () => {
      if (settled || win.isDestroyed()) return;
      const payload = JSON.stringify(items);
      void win.webContents.executeJavaScript(`window.__setSources(${payload})`).catch(() => {}).then(() => {
        if (!settled && !win.isDestroyed()) win.show();
      });
    });
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderPickerHtml())}`).catch(() => finish(null));
  });
}

/**
 * Asks which of `sources` to film. Answers the chosen source, or null when the
 * person cancels or there is nothing to choose. `presenter` is `{ BrowserWindow, parent }`
 * for the visual window picker, or a `dialog.showMessageBox` stand-in in Node checks.
 */
export async function pickSource(sources, presenter) {
  const list = (Array.isArray(sources) ? sources : []).filter((s) => s && typeof s.name === 'string');
  if (!list.length) return null;
  if (presenter && typeof presenter === 'object' && typeof presenter.BrowserWindow === 'function') {
    return openWindowPicker(list, presenter);
  }
  const names = list.map((s, i) => s.name.trim() || `Window ${i + 1}`);
  const cancel = names.length;
  const r = await presenter({
    type: 'question',
    message: 'Film which window onto the plate?',
    detail: 'Something asked to film a window (the desk, or the assistant). Nothing is filmed until you choose.',
    buttons: [...names, 'Cancel'],
    defaultId: cancel,
    cancelId: cancel,
  });
  const i = typeof r?.response === 'number' ? r.response : cancel;
  return i >= 0 && i < list.length ? list[i] : null;
}
