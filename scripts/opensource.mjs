#!/usr/bin/env node
/**
 * Does the app open with its sound Source on Off, whatever look loads?
 *
 *   npm run opensource       # builds, then about a minute; no GPU
 *
 * PLAN.md 14y, asked by the owner 2026-10-22: "generally the source should
 * always be set to none when the app opens for all of the presets". What opened
 * on something else was the sound Source (Off / Mic / System / File / Band):
 * a first visit's first click anywhere started the band, and the last Mic or
 * Band pick was kept in `localStorage` and came back on every launch. The video
 * Source already opened on Off, and a look never sets either one.
 *
 * So this opens the app the way a stranger does, a fresh browser with nothing
 * stored, and asks, on the laptop's desk and on the phone:
 *
 *   - the Source reads Off, on three looks (a look must not change it)
 *   - a click or a tap on the plate starts nothing: no reading reaches the show
 *     and no device is opened
 *   - picking the Band by its own control then does start it (else "nothing
 *     heard" above is a plate that cannot hear at all), and is kept through a
 *     reload of the tab, which a gig can do without losing its input
 *   - an old pick left in `localStorage` by a version that kept it there is not
 *     brought back, and a new tab (a relaunched app) opens on Off again
 *
 * Before 14y the first of the click checks read a level a few seconds after the
 * click and the stored-pick check found the Band already playing.
 *
 * No GPU: it reads the sound the show hears and the controls' state, not the plate.
 */
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { launchChromium, port } from './chromium.mjs';

const PORT = port(4194, 'OPENSOURCE_PORT');
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// On CI an earlier step has built dist/; anywhere else build it, so a stale
// build is never what is measured.
if (!process.env.CI) {
  const b = spawnSync('npm', ['run', 'build'], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (b.status !== 0) { check('the site builds', false, `exit ${b.status}`); process.exit(1); }
}

const notes = [];
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
await new Promise((resolve, reject) => {
  const bail = setTimeout(() => reject(new Error('preview server did not start')), 30_000);
  server.stdout.on('data', (d) => { if (String(d).includes('localhost')) { clearTimeout(bail); resolve(); } });
  server.stderr.on('data', (d) => { notes.push(String(d).trim()); });
  server.on('exit', (c) => { clearTimeout(bail); reject(new Error(`preview exited ${c}: ${notes.join(' ').slice(0, 200)}`)); });
});

const LOOKS = ['classic', 'aurora', 'bass-drop'];
const URL = (look) => `http://localhost:${PORT}/?debug&gpu=mid&tier=local&play=0&look=${look}`;
const LAPTOP = { name: 'laptop', viewport: { width: 1440, height: 900 }, touch: false };
const PHONE = { name: 'phone', viewport: { width: 390, height: 844 }, touch: true };

/** What the show hears now, and how many devices the page has been given. */
const heard = (page) => page.evaluate(() => window.chromaglassCastState?.().audio?.volume ?? null);
const devices = (page) => page.evaluate(() => (window.__media ?? []).length);

/** The Source the person is shown: which of the sound controls reads as chosen. */
const shown = async (screen, page) => {
  if (screen.touch) {
    await page.getByTestId('phone-open-sound').first().tap();
    await page.waitForTimeout(300);
    const on = async (id) => (await page.getByTestId(id).first().getAttribute('aria-pressed')) === 'true';
    const lit = (await on('phone-sound-mic')) ? 'mic' : (await on('phone-sound-band')) ? 'band' : (await on('phone-sound-file')) ? 'file' : 'off';
    return lit;
  }
  await page.getByTestId('dot-sound').click();
  // Settings' Sound section says what is listening (the choosing is in the Sound sheet: PLAN 35c-3).
  const state = page.getByTestId('audio-source-state');
  await state.waitFor({ state: 'visible' });
  return ({ none: 'off', microphone: 'mic', system: 'system', simulated: 'band' })[await state.getAttribute('data-source')] ?? 'nothing selected';
};

/** Close what `shown` opened, so the plate is clickable again. */
const away = async (screen, page) => {
  if (screen.touch) await page.getByTestId('phone-sheet-scrim').tap({ position: { x: 20, y: 20 } }).catch(() => {});
  else await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
};

const pickBand = async (screen, page) => {
  if (screen.touch) {
    await page.getByTestId('phone-open-sound').first().tap();
    await page.waitForTimeout(300);
    await page.getByTestId('phone-sound-band').first().tap();
  } else {
    await page.getByTestId('dot-sound').click();
    await page.getByTestId('audio-source-open').click();
    await page.getByTestId('sound-source-simulated').click();
  }
  await page.waitForTimeout(300);
};

const browser = await launchChromium(chromium);
try {
  for (const screen of [LAPTOP, PHONE]) {
    // A fresh browser: nothing stored, which is what a stranger and a relaunched app both are.
    const context = await browser.newContext({
      viewport: screen.viewport, isMobile: screen.touch, hasTouch: screen.touch, deviceScaleFactor: screen.touch ? 2 : 1,
    });
    // Every ask for a device, as qa.mjs counts them.
    await context.addInitScript(() => {
      window.__media = [];
      const gum = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
      if (gum) navigator.mediaDevices.getUserMedia = (c) => { window.__media.push(JSON.stringify(c)); return gum(c); };
    });
    const open = async (look, init) => {
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
      if (init) await page.addInitScript(init);
      await page.goto(URL(look), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.chromaglassCastState === 'function', null, { timeout: 60_000 });
      return page;
    };
    const at = async (page) => {
      const box = await page.locator('canvas').first().boundingBox();
      return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : { x: screen.viewport.width / 2, y: screen.viewport.height / 3 };
    };

    // The Source on three looks, none of which may move it.
    for (const look of LOOKS) {
      const page = await open(look);
      const lit = await shown(screen, page);
      check(`${screen.name}, ${look}: the Source opens on Off`, lit === 'off', `reads ${lit}`);
      await page.close();
    }

    // A gesture chooses nothing.
    const page = await open('classic');
    check(`${screen.name}: nothing is heard before a gesture`, (await heard(page)) === null);
    const spot = await at(page);
    if (screen.touch) await page.touchscreen.tap(spot.x, spot.y); else await page.mouse.click(spot.x, spot.y);
    // The analyser takes seconds to open and learn a floor (qa.mjs waits for it
    // the same way), so a band started by the click would read by now.
    await page.waitForTimeout(6000);
    check(`${screen.name}: a click on the plate starts no sound`, (await heard(page)) === null, `reads ${await heard(page)}`);
    check(`${screen.name}: and opens no device`, (await devices(page)) === 0);
    check(`${screen.name}: and the Source still reads Off`, (await shown(screen, page)) === 'off');
    await away(screen, page);

    // The instrument can hear, and a pick lasts the tab.
    await pickBand(screen, page);
    let level = null;
    for (let i = 0; i < 20 && !(level > 0); i++) { await page.waitForTimeout(1000); level = await heard(page); }
    check(`${screen.name}: choosing the Band starts it`, level > 0, level === null ? 'nothing reached the show' : `volume ${Number(level).toFixed(1)}`);
    check(`${screen.name}: and it opens no device`, (await devices(page)) === 0);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.chromaglassCastState === 'function', null, { timeout: 60_000 });
    const kept = await shown(screen, page);
    check(`${screen.name}: a reload of the tab keeps the Band`, kept === 'band', `reads ${kept}`);
    await page.close();

    // A new tab, and a pick an older version left in localStorage.
    const old = await open('classic', () => { try { localStorage.setItem('chromaglass-audio-source', 'simulated'); } catch { /* private window */ } });
    const fresh = await shown(screen, old);
    check(`${screen.name}: a new tab opens on Off, an old stored pick not brought back`, fresh === 'off', `reads ${fresh}`);
    await context.close();
  }
} catch (err) {
  check('the run completed', false, String(err).split('\n')[0]);
} finally {
  await browser.close();
  stop();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} open-source checks passed`);
process.exit(failed.length ? 1 : 0);
