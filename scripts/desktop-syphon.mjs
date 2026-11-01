/**
 * The Mac app's Syphon line in `npm run desktop` (PLAN.md 13.2, "Syphon out",
 * docs/plan/13-vj-software.md; Antigravity's brief 5 of 2026-10-31), written
 * ahead of the add-on and run as `--owed=syphon` in desktop.yml until the PR
 * that ships it takes the id out.
 *
 * What the brief asks: a native add-on under desktop/ that publishes a Syphon
 * server named "ChromaGlass" from Electron's offscreen shared texture, with no
 * readback, behind a "Syphon Out" item in the Show menu, off by default, Pro
 * only through tierGates, the paint event's texture released every frame. The
 * one thing a check on the packed app can hold without a VJ app on the Mac is
 * that the add-on loads and publishes, so this is that, through a contract the
 * build implements:
 *
 *   - a checkbox in the Show menu with id `syphon-out`, unchecked at start;
 *   - `globalThis.__chromaglassSyphon` in the main process, an object with
 *     `loaded` (the add-on was required without error), `serving` (a Syphon
 *     server is up), `name` (its name), `published` (frames handed to it since
 *     it started) and `released` (paint textures released since it started).
 *
 * The line: the add-on loaded; with the item clicked on, within three seconds
 * a server named "ChromaGlass" serving and at least 30 frames published in a
 * second, each one released (published and released within 2 of each other, the
 * releases counted by this check's own wrapper on the paint texture: a texture held is the stall the brief warns of); clicked off, not serving.
 * Under xvfb and on any machine that is not a Mac it is skipped and says so
 * (Syphon is macOS's). Owed, it is excused only while neither the menu item
 * nor the main-process object exists, main's state; a build that has either
 * and misses is red.
 */
export async function syphonLine({ electronApp, check, skip, sleep }) {
  const flag = process.argv.find((a) => a.startsWith('--owed='));
  const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
  const name = 'Syphon out: the add-on loads, and the menu item serves "ChromaGlass" with every frame released';
  if (process.platform !== 'darwin') { skip(name, `Syphon is macOS's; this is ${process.platform}${process.env.DISPLAY ? ' under xvfb' : ''}`); return; }
  const state = () => electronApp.evaluate(() => {
    const s = globalThis.__chromaglassSyphon;
    return s ? { loaded: !!s.loaded, serving: !!s.serving, name: s.name ?? null, published: s.published ?? 0, released: s.released ?? 0 } : null;
  }).catch(() => null);
  const item = () => electronApp.evaluate(({ Menu }) => {
    const i = Menu.getApplicationMenu()?.getMenuItemById('syphon-out');
    return i ? { checked: i.checked, label: i.label } : null;
  }).catch(() => null);
  const click = () => electronApp.evaluate(({ Menu }) => { Menu.getApplicationMenu().getMenuItemById('syphon-out').click(); });

  /*
    The releases are counted here, not taken from the build's own counter: a
    counter kept beside `published` would pass without releasing anything
    (the check-skeptic). Each offscreen window's paint event gets a listener
    ahead of the build's that wraps its texture's `release()`.
  */
  await electronApp.evaluate(({ webContents }) => {
    globalThis.__checkReleased = 0;
    for (const wc of webContents.getAllWebContents()) {
      if (!wc.isOffscreen?.() || wc.__checkWrapped) continue;
      wc.__checkWrapped = true;
      wc.prependListener('paint', (e) => {
        const t = e?.texture;
        if (!t || typeof t.release !== 'function' || t.__checkWrapped) return;
        const release = t.release.bind(t);
        t.__checkWrapped = true;
        t.release = (...a) => { globalThis.__checkReleased++; return release(...a); };
      });
    }
  }).catch(() => {});
  const released = () => electronApp.evaluate(() => globalThis.__checkReleased ?? 0).catch(() => 0);
  const at = await item();
  const before = await state();
  let ok = false, detail;
  if (!at || !before) {
    detail = `${at ? `menu item "${at.label}"` : 'no syphon-out item in the Show menu'}; ${before ? 'globalThis.__chromaglassSyphon present' : 'no globalThis.__chromaglassSyphon'}`;
  } else {
    await click();
    let on = await state();
    for (let t = 0; t < 30 && !(on?.serving); t++) { await sleep(100); on = await state(); }
    const from = on;
    const r0 = await released();
    await sleep(1000);
    const later = await state();
    const freed = (await released()) - r0;
    const perS = later && from ? later.published - from.published : 0;
    await click();
    await sleep(300);
    const off = await state();
    ok = before.loaded && !at.checked && !!on?.serving && on?.name === 'ChromaGlass' && perS >= 30
      && Math.abs(perS - freed) <= 2 && off?.serving === false;
    detail = `loaded ${before.loaded}, off at start ${!at.checked}; on: serving ${on?.serving} as ${JSON.stringify(on?.name)}, ${perS} frames published in a second and ${freed} paint textures released in it (seen by this check's own wrapper; the app reports ${later?.released}); off: serving ${off?.serving}`;
  }
  if (!owed.has('syphon')) return check(name, ok, detail);
  if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "syphon" out of --owed in desktop.yml`);
  if (at || before) return check(name, false, `${detail}; owed, but what it is owed for has been built and misses`);
  console.log(` owed  ${name} — ${detail}`);
}
