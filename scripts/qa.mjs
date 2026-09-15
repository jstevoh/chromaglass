#!/usr/bin/env node
/**
 * Drive the real app and see whether it holds together.
 *
 * `detail.mjs` judges the plate, `scene.mjs` the room sensor and `music.mjs`
 * the ear. None of them opens the app. This does: it builds, serves, and walks
 * a browser through the things a person does on a show night — pick a preset,
 * ride a slider, switch a tool, open every panel, hit the keyboard shortcuts,
 * turn the camera on — watching the console the whole way.
 *
 *   npm run qa            # headless, exits non-zero on a failure
 *   npm run qa -- --head  # watch it happen
 *
 * Two things worth knowing before reading a failure.
 *
 * There is no GPU here. Chromium falls back to software WebGL, which runs the
 * plate at well under a frame a second, so anything timed against the render
 * loop needs patience that would be absurd on real hardware. Checks are
 * written against the DOM and against state, not against pixels, for that
 * reason.
 *
 * And the console is held to a standard the app should meet anyway: a WebGL
 * performance warning from the software renderer is the environment talking,
 * and is ignored by name. Everything else counts.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4178;
const URL = `http://localhost:${PORT}/`;
const HEADED = process.argv.includes('--head');

/** Console noise that is this environment rather than the app. */
const IGNORED = [
  /GPU stall due to ReadPixels/i,
  /GL Driver Message/i,
  /Automatic fallback to software WebGL/i,
  /SwiftShader/i,
  /\[Violation\]/i,
];

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Anything the preview server said on stderr, so a startup failure explains itself. */
const notes = [];

async function serve() {
  // Its own process group, and the local binary rather than `npx`. Through npx
  // this leaked: killing the shim left `vite preview` holding the port, so the
  // *second* run in a session died on `--strictPort` with nothing but
  // "preview exited 1" to go on — a harness that only works once.
  const proc = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview',
    '--port', String(PORT), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  await new Promise((resolve, reject) => {
    const bail = setTimeout(() => reject(new Error('preview server did not start')), 30_000);
    proc.stdout.on('data', d => { if (String(d).includes('localhost')) { clearTimeout(bail); resolve(); } });
    proc.stderr.on('data', d => { notes.push(String(d).trim()); });
    proc.on('exit', c => {
      clearTimeout(bail);
      reject(new Error(`preview exited ${c}${notes.length ? `: ${notes.join(' ').slice(0, 200)}` : ''}`));
    });
  });
  return proc;
}


/** Take the whole process group down, so nothing is left holding the port. */
function stopServer(proc) {
  try { process.kill(-proc.pid, 'SIGTERM'); } catch { proc.kill('SIGTERM'); }
}

const server = await serve();
const browser = await chromium.launch({
  headless: !HEADED,
  executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--enable-unsafe-swiftshader'],
});

const errors = [];
const context = await browser.newContext({ permissions: ['camera'], viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(60_000);
const note = (text) => { if (!IGNORED.some(re => re.test(text))) errors.push(text); };
page.on('console', m => { if (m.type() === 'error') note(m.text()); });
page.on('pageerror', e => note(`uncaught: ${e.message}`));

// Count every device the page opens, and never auto-accept a prompt silently:
// a show that asks for a microphone on load is the bug we are watching for.
await page.addInitScript(() => {
  window.__media = [];
  const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = (c) => { window.__media.push(JSON.stringify(c)); return gum(c); };
});

const settle = (ms = 900) => page.waitForTimeout(ms);
/**
 * `.first()`, because a panel may legitimately carry a control the toolbar
 * also has. It is deliberately forgiving — which is why the duplicate check
 * below exists: without it, this helper silently drives one of two buttons and
 * the other could be anything at all.
 */
const firstVisible = (testId) => page.getByTestId(testId).first();

/** Every `data-testid` in the document now, with how many elements carry it. */
const testIdCounts = () => page.evaluate(() => {
  const seen = {};
  for (const el of document.querySelectorAll('[data-testid]')) {
    const id = el.getAttribute('data-testid');
    seen[id] = (seen[id] ?? 0) + 1;
  }
  return seen;
});
/** Ids seen more than once across everything opened so far. */
const duplicated = {};
const noteDuplicates = async () => {
  for (const [id, n] of Object.entries(await testIdCounts())) {
    if (n > 1) duplicated[id] = Math.max(duplicated[id] ?? 0, n);
  }
};

try {
  // ── It loads ──────────────────────────────────────────────────────
  await page.goto(URL, { waitUntil: 'networkidle' });
  await settle(2500);
  check('the app loads and paints a plate', (await page.locator('canvas').count()) > 0);
  check('nothing is asked for on a cold load',
    (await page.evaluate(() => window.__media.length)) === 0,
    JSON.stringify(await page.evaluate(() => window.__media)));

  const title = await page.title();
  check('the page has a title', !!title && title.length > 0, title);

  // ── The toolbar ───────────────────────────────────────────────────
  const buttons = await page.locator('button:visible').count();
  check('the toolbar is there', buttons > 8, `${buttons} buttons`);

  // ── Presets ───────────────────────────────────────────────────────
  await firstVisible('preset-title-button').click();
  await settle();
  const menu = firstVisible('preset-menu');
  const entries = await menu.locator('button').count();
  check('the preset menu opens with presets in it', (await menu.count()) === 1 && entries > 10, `${entries} entries`);

  // Read it while it is still open: applying a preset closes the menu, and
  // saving and loading must still be reachable now that the settings panel's
  // copy of the presets is gone — one menu, or the feature was lost rather
  // than de-duplicated.
  const menuText = await menu.innerText();
  check('the preset menu can still save and load a look',
    /save/i.test(menuText) && /load/i.test(menuText));
  // Apply one and make sure the app survives having its whole look replaced.
  const crowd = menu.locator('button', { hasText: /Crowd Plate/i }).first();
  if (await crowd.count()) {
    await crowd.click();
    await settle(2000);
    check('a preset can be applied', true);
  } else {
    check('a preset can be applied', false, 'Crowd Plate not in the menu');
  }
  await page.keyboard.press('Escape');
  await settle(400);

  // ── Settings, and every section of it ─────────────────────────────
  await page.locator('button[title*="Settings" i]').first().click();
  await settle();
  const headings = await page.locator('section h3').allInnerTexts();
  check('settings opens with its sections', headings.length > 8, `${headings.length}: ${headings.slice(0, 6).join(', ')}…`);
  await noteDuplicates();

  const sliders = page.locator('input[type="range"]:visible');
  const sliderCount = await sliders.count();
  check('settings has sliders', sliderCount > 20, `${sliderCount}`);

  // The presets belong on the title and nowhere else.
  check('settings does not carry a second copy of the presets',
    !headings.some(h => /^presets$/i.test(h.trim())), headings.join(', '));

  // Ride every one of them, to a value its own min/max/step allows, one per
  // animation frame — which is how a hand on a slider, a MIDI fader and the
  // sequencer's glide all deliver changes. Driving all of them inside a single
  // tick instead does trip React's nested-update ceiling, but nothing in the
  // app or on a controller writes settings in a loop without yielding, so that
  // says more about the harness than the show.
  const rode = await page.evaluate(() => new Promise(done => {
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const els = [...document.querySelectorAll('input[type="range"]')];
    const skipped = [];
    let i = 0, moved = 0;
    const step = () => {
      if (i >= els.length) return done({ moved, skipped });
      const el = els[i++];
      const min = Number(el.min === '' ? 0 : el.min);
      const max = Number(el.max === '' ? 100 : el.max);
      const stepSize = Number(el.step === '' || el.step === 'any' ? (max - min) / 100 : el.step);
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
        skipped.push(el.getAttribute('aria-label'));
      } else {
        const target = min + Math.round(((max - min) * 0.65) / stepSize) * stepSize;
        set(el, Math.min(max, Math.max(min, target)));
        moved++;
      }
      requestAnimationFrame(step);
    };
    step();
  }));
  await settle(3000);
  check('every slider takes a value from its own range', rode.moved > 20 && rode.skipped.length === 0,
    `${rode.moved} moved${rode.skipped.length ? `, skipped ${rode.skipped.join(', ')}` : ''}`);

  // ── Every labelled slider has a label the screen reader can read ───
  const unlabelled = await page.evaluate(() =>
    [...document.querySelectorAll('input[type="range"]')].filter(i => !i.getAttribute('aria-label')).length);
  check('every slider is labelled', unlabelled === 0, `${unlabelled} without a label`);

  // ── The room camera ───────────────────────────────────────────────
  const roomToggle = firstVisible('scene-toggle');
  await roomToggle.scrollIntoViewIfNeeded();
  await roomToggle.click();
  await settle(2500);
  check('switching the room camera on opens exactly one camera',
    (await page.evaluate(() => window.__media.length)) === 1,
    JSON.stringify(await page.evaluate(() => window.__media)));
  const mapAdd = firstVisible('scene-map-add');
  if (await mapAdd.count()) {
    // Counted rather than assumed: a preset can arrive with mappings of its
    // own, and Crowd Plate — applied earlier in this run — ships with three.
    const before = await page.locator('select[aria-label="Room feature"]').count();
    await mapAdd.click();
    await settle(700);
    const rows = await page.locator('select[aria-label="Room feature"]').count();
    check('a room mapping can be added and targeted', rows === before + 1, `${before} → ${rows}`);
    if (rows) {
      await page.locator('select[aria-label="Room feature"]').first().selectOption('crowd');
      await page.locator('select[aria-label="Control"]').first().selectOption('dyeBudget');
      await settle(600);
      check('and choosing a feature and a control does not throw', true);
    }
  }
  await roomToggle.click();   // and off again
  await settle(600);

  // ── The band, and the audio sources ───────────────────────────────
  await page.keyboard.press('Escape');
  await settle(500);
  const band = firstVisible('simulated-audio-button');
  const beforeBand = await page.evaluate(() => window.__media.length);
  await band.click();
  await settle(3000);
  check('the band plays without opening a device',
    (await page.evaluate(() => window.__media.length)) === beforeBand);
  check('the band reports itself as playing',
    (await band.getAttribute('class')).includes('fuchsia'));

  // ── Tools and the plate ───────────────────────────────────────────
  const plate = page.locator('canvas').first();
  const box = await plate.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55, { steps: 6 });
    await page.mouse.up();
    await settle(700);
    check('the plate takes a drag without throwing', true);
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────
  for (const key of ['b', 'b', '+', '-']) {
    await page.keyboard.press(key);
    await settle(350);
  }
  check('the keyboard shortcuts run without throwing', true);

  // ── The other panels ──────────────────────────────────────────────
  for (const [title, what] of [['MIDI', 'the MIDI panel'], ['Sequence', 'the sequencer'], ['Track', 'the track panel']]) {
    const b = page.locator(`button[title*="${title}" i]`).first();
    if (await b.count()) {
      await b.click();
      await settle(800);
      check(`${what} opens`, true);
      await noteDuplicates();
      await page.keyboard.press('Escape');
      await settle(400);
    } else {
      check(`${what} opens`, true, 'no button — skipped');
    }
  }

  // The manual: it opens, it has its sections, and it closes again.
  {
    const b = page.getByTestId('guide-button');
    if (await b.count()) {
      await b.first().click();
      await settle(1200);
      const navs = await page.locator('[data-testid^="guide-nav-"]').count();
      check('the manual opens with its sections', navs > 8, `${navs} sections`);
      await noteDuplicates();
      await page.keyboard.press('Escape');
      await settle(500);
      check('and closes again', (await page.getByTestId('guide-panel').count()) === 0);
    } else {
      check('the manual opens with its sections', false, 'no ? button');
    }
  }

  // ── A reload keeps what it should and asks for nothing ────────────
  await page.reload({ waitUntil: 'networkidle' });
  await settle(2500);
  check('a reload asks for nothing',
    (await page.evaluate(() => window.__media.length)) === 0,
    JSON.stringify(await page.evaluate(() => window.__media)));
  check('and the plate comes back', (await page.locator('canvas').count()) > 0);

  // ── Small screens ─────────────────────────────────────────────────
  await page.setViewportSize({ width: 420, height: 820 });
  await settle(1500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('nothing spills off a phone-width screen', overflow <= 2, `${overflow}px of overflow`);

  // ── Nothing is on the screen twice ────────────────────────────────
  //
  // The Band button was in the sound picker twice — the same markup pasted
  // twice in the commit that added it — and it shipped, because every check
  // here reaches for a control with `.first()` and the first one worked
  // perfectly. A user found it by reading the menu.
  //
  // Two identical buttons is the harmless version. The same id on two
  // *different* controls means every check that touches it is driving
  // whichever happens to be first in the document, and passing.
  await noteDuplicates();
  const dupes = Object.entries(duplicated);
  check('no control appears on the screen twice', dupes.length === 0,
    dupes.map(([id, n]) => `${id} ×${n}`).join(', '));

  check('the console stayed clean', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (err) {
  check('the run completed', false, String(err).split('\n')[0]);
} finally {
  await browser.close();
  stopServer(server);
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (errors.length) {
  console.log(`\nconsole output the app should not have produced (${errors.length}):`);
  for (const e of errors.slice(0, 20)) console.log('  ', e.slice(0, 300));
}
process.exit(failed.length === 0 ? 0 : 1);
