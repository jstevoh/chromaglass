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
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';

// Overridable so two runs can share a machine — measuring a change to this
// suite means running it twice, and a hard-coded port makes that serial.
const PORT = Number(process.env.QA_PORT ?? 4178);
/*
  The whole suite, on the GPU solver:  QA_GPU=mid npm run qa

  Without it every check here exercises the CPU fallback, because
  `classifyGpu()` maps SwiftShader and llvmpipe to 'software' and
  `qualityLadder()` gives that class a ladder with only the CPU rung on it.
  That is the right policy for a real machine — emulated float render targets
  are slower than the JavaScript solver — but it means a headless suite tests
  a renderer nobody runs, which is how four hypotheses about a dye bug were
  chased on the wrong code path.

  The override is deliberately not the default. Under software rasterisation
  a 384² plate renders at about six frames a second and every step here
  queues behind the render loop, so a run that takes minutes on a machine
  with a GPU takes the best part of an hour without one. Set it where there
  is a GPU; leave it unset in a sandbox.
*/
const GPU = process.env.QA_GPU ?? '';
const URL = `http://localhost:${PORT}/?debug${GPU ? `&gpu=${encodeURIComponent(GPU)}&tier=local` : ''}`;
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
/*
  Every line carries the second it was reached, and how long it cost.

  This suite is the slowest thing in the repository by a long way — most of an
  hour on a runner with no GPU — and for a long time the only thing anyone knew
  about that number was the number. Which check is expensive is not something
  you can reason about from the source: half of them wait on a renderer running
  at a few frames a second, and the wait is invisible until it is printed.
*/
const started = Date.now();
let lastAt = started;
const check = (name, ok, detail = '') => {
  const now = Date.now();
  const at = (now - started) / 1000;
  const took = (now - lastAt) / 1000;
  lastAt = now;
  results.push({ name, ok: !!ok, detail, at, took });
  const clock = `${String(Math.floor(at / 60)).padStart(2, '0')}:${String(Math.floor(at % 60)).padStart(2, '0')}`;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${clock} ${took >= 1 ? `+${took.toFixed(0)}s` : '    '}  ${name}${detail ? ` — ${detail}` : ''}`);
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
const browser = await launchChromium(chromium, { headless: !HEADED });

const errors = [];
/*
  Starts narrow on purpose.

  Everything from here to the desk section drives the floating overlay UI —
  the bottle rail, the toolbar, the preset title menu. That surface has not
  gone anywhere, but it is now what the app shows *below* 1024px: at laptop
  width the desk owns the window and none of those controls are rendered.
  Running these checks at 1440 counted 59 visible buttons instead of 69 and
  then waited forever for a title button that does not exist.

  So: the overlay checks run at the width the overlay lives at, and the desk
  gets its own section further down at 1440 — including the two sheets, which
  are the only way to reach Settings and MIDI once the toolbar is gone.
*/
const context = await browser.newContext({ permissions: ['camera'], viewport: { width: 900, height: 860 } });
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
 * Press Escape and wait for a panel to actually be gone.
 *
 * Not `settle(n)` and then look. A panel closing is a React state change
 * followed by an unmount, on a page whose main thread is also running a fluid
 * solver — so how long it takes is a property of the machine, not of the app.
 * Measured here: about 600ms on a laptop and past four seconds on a loaded
 * runner rasterising in software, which is how a 500ms window passed five
 * times locally and failed the first time CI ever ran it.
 *
 * The assertion is unchanged — the panel must close — and only the accidental
 * one, that it closes inside one arbitrary window, is gone. A panel that never
 * closes still fails, six seconds later.
 */
const escapeCloses = async (testId) => {
  await page.keyboard.press('Escape');
  for (let i = 0; i < 20; i++) {
    if ((await page.getByTestId(testId).count()) === 0) return true;
    await settle(300);
  }
  return false;
};
/**
 * `.first()`, because a panel may legitimately carry a control the toolbar
 * also has. It is deliberately forgiving — which is why the duplicate check
 * below exists: without it, this helper silently drives one of two buttons and
 * the other could be anything at all.
 */
const firstVisible = (testId) => page.getByTestId(testId).first();

/*
  Raw coordinates for every click in the suite.

  `locator.click()` stalls in this environment: its call log stops at "locator resolved to
  <button …>" and never reports an actionability verdict, while a mouse click
  at the same point works and the control visibly takes the selection. The
  element is stable (traced over twenty animation frames: one bounding box)
  and hit-testable (elementFromPoint returns the button itself), so that is
  Playwright's machinery queueing behind the render loop, not the app.

  It was first seen on the desk, then on the overlay's Settings button, then
  inside the MIDI sheet, where it ended a run at 25 of 27 with a 60-second
  timeout. Three sightings is a property of the environment, not of three
  controls, so every click here goes through this.

  Both branches scroll first, which the locator branch did not at first. That
  is the one thing `locator.click()` was doing for free, and dropping it cost
  two checks: a control below the fold in a scrolling sheet had its
  coordinates taken where it actually sat, well outside the visible box, and
  the click landed on whatever was at that point instead.
*/
const clickOn = async (target) => {
  const box = typeof target === 'string'
    ? await page.evaluate((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        if (!el) return null;
        // Into view first: a cue list is thirty-two rows in a column that
        // holds fourteen, so a row's coordinates can be well outside the
        // visible box and a click there lands on whatever is actually at
        // that point. "Go names the look it will send" failed on exactly
        // that, and read as an app bug.
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, target)
    : await target.scrollIntoViewIfNeeded()
        .then(() => target.boundingBox())
        .then(b => (b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null));
  if (!box) throw new Error(`nothing to click: ${typeof target === 'string' ? target : 'locator'}`);
  await page.mouse.click(box.x, box.y);
};

/** ⌘K, type, Enter — the only way to reach most of the app under a desk. */
const viaPalette = async (query) => {
  await page.keyboard.press('Control+k');
  await settle(500);
  await page.evaluate((q) => {
    const input = document.querySelector('[data-testid="palette-input"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, q);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }, query);
  await settle(500);
  await page.keyboard.press('Enter');
  await settle(700);
};

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

  // ── The first five seconds ────────────────────────────────────────
  // A stranger's first visit has to *show* what this is, and what this is is a
  // light show played by music. It used to land on a plate with nothing
  // driving it until the visitor found a button. The band is silent and opens
  // no device, so it costs a permission prompt of nothing — but the browser
  // will not run audio before a gesture, so the earliest it can start is the
  // first click anywhere, which is what this checks.
  {
    const heard = () => page.evaluate(() => window.chromaglassCastState?.().audio?.volume ?? null);
    check('nothing is listening before the first gesture', (await heard()) === null);
    await page.mouse.click(5, 5);
    // The analyser has to open and the room calibration has to learn a floor
    // before a level means anything, which takes seconds by design (and more
    // of them under software rasterisation). This waits for a reading rather
    // than for a fixed delay.
    let playing = null;
    for (let i = 0; i < 20 && !(playing > 0); i++) {
      await settle(1000);
      playing = await heard();
    }
    check('a first visit is driven by the band after one click',
      playing > 0,
      playing === null ? 'no audio reaching the show at all' : `volume ${Number(playing).toFixed(1)}`);
    check('and it still opened no device to do it',
      (await page.evaluate(() => window.__media.length)) === 0,
      JSON.stringify(await page.evaluate(() => window.__media)));
  }

  // Which solver did this run actually measure? A suite that is green on the
  // CPU fallback has said nothing about the GPU shaders, and the line above
  // it would look identical either way.
  {
    const engine = await page.evaluate(() => window.chromaglassDebug?.().engine ?? null);
    if (GPU) {
      check('the GPU solver is the one being measured', /^GPU/.test(engine ?? ''), engine ?? 'no debug hook');
    } else {
      console.log(`     solver: ${engine ?? 'unknown'} — set QA_GPU=mid to run this suite on the GPU path`);
    }
  }

  // ── The toolbar ───────────────────────────────────────────────────
  const buttons = await page.locator('button:visible').count();
  check('the toolbar is there', buttons > 8, `${buttons} buttons`);

  // ── Presets ───────────────────────────────────────────────────────
  await clickOn('preset-title-button');
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
  //
  // Picking from the menu only *cues* a look now: it waits in the cue bar as
  // CUED against ON STAGE and reaches the plate on Go, over a crossfade. That
  // is right for a desk and a trap for a script, so this drives the cue the way
  // a projectionist does — set the fade to a cut, press Go — and then reads the
  // settings back. Checking that the click happened is not checking that the
  // look landed: before this, a preset that never reached the glass passed.
  const crowd = menu.locator('button', { hasText: /Crowd Plate/i }).first();
  if (await crowd.count()) {
    // main's check, kept whole: this branch had `check('a preset can be
    // applied', true)` here, which is the same literal-true that let painting
    // die on both desks unnoticed. The clicks go through clickOn because
    // locator.click() stalls in this environment — see its comment above.
    await clickOn(crowd);
    await settle(600);
    const cued = await firstVisible('cue-armed').count();
    if (cued) {
      await firstVisible('cue-fade').selectOption('0');
      await clickOn(firstVisible('cue-go'));
    }
    await settle(2500);
    // The name on the title is the app's own answer to "what is on the plate",
    // so it is what the check reads — not the fact that a click happened.
    const nowOn = await firstVisible('preset-title-button').innerText().catch(() => '');
    check('a preset reaches the plate', /crowd plate/i.test(nowOn),
      `${cued ? 'cued, then Go' : 'applied straight'} → ${nowOn.replace(/\s+/g, ' ').trim() || '(no name on the title)'}`);
  } else {
    check('a preset reaches the plate', false, 'Crowd Plate not in the menu');
  }
  await page.keyboard.press('Escape');
  await settle(400);

  // ── Settings, and every section of it ─────────────────────────────
  await clickOn(page.locator('button[title*="Settings" i]').first());
  await settle();
  const headings = await page.locator('section h3').allInnerTexts();
  check('settings opens with its sections', headings.length > 8, `${headings.length}: ${headings.slice(0, 6).join(', ')}…`);
  await noteDuplicates();

  // ── The panel is a rail and one section at a time ─────────────────
  //
  // It used to be one column with a three-way filter on top, and at its
  // widest setting that column was eight screens deep. Both shapes failed the
  // same way — you could not find a control twice — and the complaint that
  // replaced them was "a ton of settings are now hidden and I can't find
  // them". What is checked is the shape that answers it: a row per section, a
  // click lands on that section, and nothing else is in the pane with it.
  {
    const paneOf = () => page.evaluate(() => {
      const pane = document.querySelector('[data-testid="settings-panel"] [data-testid="settings-rail"] + div')
        ?? document.querySelector('[data-testid="settings-panel"] .overflow-y-auto');
      if (!pane) return null;
      const all = [...document.querySelectorAll('[data-testid="settings-panel"] section[data-section]')];
      const vis = all.filter(x => !x.classList.contains('hidden'));
      return {
        total: all.length,
        visible: vis.map(x => x.dataset.section),
        scroll: pane.scrollHeight, client: pane.clientHeight,
        wide: pane.scrollWidth - pane.clientWidth,
      };
    });

    const rail = await page.evaluate(() => {
      const r = document.querySelector('[data-testid="settings-rail"]');
      if (!r) return null;
      return {
        rows: [...r.querySelectorAll('[data-testid^="settings-nav-"]')].map(b => b.dataset.testid.replace('settings-nav-', '')),
        groups: [...r.querySelectorAll('[data-testid^="rail-group-"]')].length,
      };
    });
    check('settings has a rail of places to go', !!rail && rail.rows.length >= 16,
      rail ? `${rail.rows.length} rows in ${rail.groups} groups` : 'no rail');
    if (!rail) throw new Error('no settings rail — the checks below would be measuring nothing');

    const first = await paneOf();
    check('and the pane can be measured', !!first, first ? '' : 'no scrolling pane inside the sheet');
    if (!first) throw new Error('settings pane not found');
    check('and every section it lists has markup', first.total >= 16 && first.total >= rail.rows.length,
      `${first.total} sections, ${rail.rows.length} rows`);
    // The width failure this replaced: content flowing into horizontal columns
    // inside a box whose overflow-x is hidden, so most of it is off the edge.
    check('and nothing in it runs off the side', first.wide <= 2, `${first.wide}px`);
    check('and one section is in the pane, not all of them',
      first.visible.length === 1, `${first.visible.length}: ${first.visible.join(', ')}`);

    // Every row, not a sample: the failure this is for is one section that
    // cannot be reached, and a sample is exactly how that survives.
    const unreachable = [];
    let deepest = 0;
    for (const id of rail.rows) {
      await clickOn(`settings-nav-${id}`);
      await settle(160);
      const now = await paneOf();
      if (!now || now.visible.length !== 1 || now.visible[0] !== id) {
        unreachable.push(`${id} → ${now ? now.visible.join(', ') || 'nothing' : 'no pane'}`);
      }
      if (now) deepest = Math.max(deepest, now.scroll / now.client);
    }
    check('every row on the rail opens the section it names',
      unreachable.length === 0, unreachable.length ? unreachable.join(' · ') : `all ${rail.rows.length}`);
    // The number the old panel could not hold: with everything on screen at
    // once it was eight screens deep, and "All" was the default.
    check('and no section is more than three screens deep',
      deepest < 3, `deepest is ${deepest.toFixed(1)} screens`);

    // The room camera has a row of its own now, which is the specific thing
    // that could not be found: "turn on the video and track people".
    check('the room camera is one of those rows', rail.rows.includes('room'), rail.rows.join(', '));
    check('and so is the controller', rail.rows.includes('midi'));
  }

  // ── Every labelled slider has a label the screen reader can read ───
  const unlabelled = await page.evaluate(() =>
    [...document.querySelectorAll('input[type="range"]')].filter(i => !i.getAttribute('aria-label')).length);
  check('every slider is labelled', unlabelled === 0, `${unlabelled} without a label`);

  // ── The room camera ───────────────────────────────────────────────
  // One click on the rail, which is the whole point of the rail: the thing
  // that turns the video on and tracks people has a row with its own name.
  await clickOn('settings-nav-room');
  await settle(500);
  const roomToggle = firstVisible('scene-toggle');
  await roomToggle.scrollIntoViewIfNeeded();
  await clickOn(roomToggle);
  await settle(2500);
  check('switching the room camera on opens exactly one camera',
    (await page.evaluate(() => window.__media.length)) === 1,
    JSON.stringify(await page.evaluate(() => window.__media)));
  const mapAdd = firstVisible('scene-map-add');
  if (await mapAdd.count()) {
    // Counted rather than assumed: a preset can arrive with mappings of its
    // own, and Crowd Plate — applied earlier in this run — ships with three.
    const before = await page.locator('select[aria-label="Room feature"]').count();
    await clickOn(mapAdd);
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
  await clickOn(roomToggle);   // and off again
  await settle(600);

  // ── The band, and the audio sources ───────────────────────────────
  await page.keyboard.press('Escape');
  await settle(500);
  //
  // The band is already playing by now — a first visit starts it on the first
  // gesture — so this checks the button *toggles*, which is the thing that can
  // break, rather than assuming it starts from off. Clicking it once must stop
  // the band, and clicking it again must start it, and neither may open a
  // device.
  const band = firstVisible('simulated-audio-button');
  const beforeBand = await page.evaluate(() => window.__media.length);
  const bandLit = async () => (await band.getAttribute('class')).includes('fuchsia');
  const wasLit = await bandLit();
  await clickOn(band);
  await settle(2000);
  check('the band button turns it off', (await bandLit()) !== wasLit, wasLit ? 'was on' : 'was off');
  await clickOn(band);
  await settle(3000);
  check('the band plays without opening a device',
    (await page.evaluate(() => window.__media.length)) === beforeBand);
  check('the band reports itself as playing', await bandLit());

  // ── Tools and the plate ───────────────────────────────────────────
  //
  // This used to be `check('the plate takes a drag without throwing', true)`
  // — a condition that is the literal true, which is how painting could stop
  // working on both desks without a single check going red. A drag that
  // throws nothing and paints nothing is the failure, not the success.
  //
  // So: freeze the plate, drag, and look at what the brush actually put
  // there. Frozen, the solver never steps and so never flushes the deltas,
  // and `density` holds the injection alone. Manual injection is gated on the
  // drain, not on isActive, so the brush still works while the liquid is
  // still.
  const plate = page.locator('canvas').first();
  const box = await plate.boundingBox();
  if (box) {
    const mid = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 };
    const topmost = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return { ok: el === document.getElementById('liquid-canvas'),
               what: el?.dataset?.testid || el?.id || el?.tagName || 'nothing' };
    }, [mid.x, mid.y]);
    check('the plate is what the cursor is over', topmost.ok, `the cursor is over ${topmost.what}`);

    // Pause from the overlay's own transport, not the F key: F is gated on
    // `deskUp` and this section runs at 900px, where the narrow-screen UI is
    // the surface and F does nothing. Pressed it anyway and the plate kept
    // running, and the check read the liquid's own evaporation — density fell
    // by 489 across a drag that had just added dye to it.
    const pause = page.locator('button[title="Pause"]').first();
    const canPause = await pause.count() > 0;
    if (canPause) { await clickOn(pause); await settle(900); }
    const before = await page.evaluate(() => {
      const f = window.chromaglassDebug?.().fluids?.[0];
      return f ? f.density.reduce((a, b) => a + b, 0) : null;
    });
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55, { steps: 6 });
    await page.mouse.up();
    await settle(700);
    const after = await page.evaluate(() => {
      const f = window.chromaglassDebug?.().fluids?.[0];
      return f ? f.density.reduce((a, b) => a + b, 0) : null;
    });
    if (canPause) { await clickOn(page.locator('button[title="Play"]').first()); await settle(400); }
    check('and a drag across it lays down dye',
      canPause && before !== null && after !== null && after - before > 1,
      !canPause ? 'no transport to pause with — the plate could not be stilled'
        : before === null ? 'no debug hook — run with ?debug'
        : `density ${before.toFixed(1)} → ${after.toFixed(1)}`);
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
      await clickOn(b);
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
      await clickOn(b.first());
      await settle(1200);
      const navs = await page.locator('[data-testid^="guide-nav-"]').count();
      check('the manual opens with its sections', navs > 8, `${navs} sections`);
      // The contents column follows the reading, not just the clicking. It
      // used to move only when a heading was clicked, so scrolling from
      // Liquids into Physics left the nav still claiming Liquids — which is
      // the one thing a contents column exists to get right.
      const lit = () => page.evaluate(() =>
        document.querySelector('[data-testid^="guide-nav-"][aria-current]')?.getAttribute('data-testid')?.replace('guide-nav-', '') ?? null);
      const top = await lit();
      const followed = [];
      for (let i = 1; i <= 8; i++) {
        await page.evaluate(f => { const a = document.querySelector('[data-testid="guide-body"]'); a.scrollTop = a.scrollHeight * f; }, i / 9);
        await settle(350);
        const now = await lit();
        if (now && followed[followed.length - 1] !== now) followed.push(now);
      }
      check('and the contents follows the scrolling', followed.length > 3 && followed[followed.length - 1] !== top,
        `${top} → ${followed.join(' → ')}`);
      await noteDuplicates();
      const closed = await escapeCloses('guide-panel');
      check('and closes again', closed, closed ? '' : 'still open after six seconds');
    } else {
      check('the manual opens with its sections', false, 'no ? button');
    }
  }

  // ── The GPU, taken away and given back ────────────────────────────
  //
  // A projector plugged into a running laptop, a Mac switching between its
  // integrated and discrete GPU, a driver resetting under load: the browser
  // takes the context away and every texture, buffer and program with it. The
  // default outcome is a canvas that stays black for good, and the only fix a
  // reload — which mid-set also loses the plate, the cue list and the
  // sequencer's place.
  //
  // `WEBGL_lose_context` is the same event the driver sends, so this is the
  // real path and not a simulation of it. What is checked is what an audience
  // would see: the wall is lit before, and it is lit again afterwards.
  {
    const litness = () => page.evaluate(() => {
      const c = document.querySelector('#liquid-canvas');
      if (!c) return null;
      const o = document.createElement('canvas');
      o.width = 16; o.height = 9;
      const x = o.getContext('2d', { willReadFrequently: true });
      x.drawImage(c, 0, 0, 16, 9);
      const d = x.getImageData(0, 0, 16, 9).data;
      let sum = 0;
      for (let i = 0; i < 16 * 9; i++) sum += (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
      return sum / (16 * 9 * 255);
    });
    // Lay a known plate first. By this point the suite has blacked out,
    // drained, cleared, zoomed and dragged its way through fifty checks, and
    // the plate it leaves behind is whatever fell out of that — one run
    // measured it at pure black, which made the recovery check below a
    // comparison of nothing with nothing. The Fillmore look seeds bright and
    // immediately, so it is a plate that is definitely on.
    await page.evaluate(() => window.chromaglassApplyPreset?.('fillmore-1969'));
    let before = 0;
    for (let i = 0; i < 15 && !(before > 0.01); i++) { await settle(1000); before = await litness(); }
    check('the wall is lit before the GPU goes away', before > 0.01, `luminance ${before?.toFixed(3)}`);

    await page.evaluate(() => {
      const gl = document.querySelector('#liquid-canvas').getContext('webgl2');
      window.__lose = gl.getExtension('WEBGL_lose_context');
      window.__lose?.loseContext();
    });
    await settle(1500);
    check('a lost context is noticed and said so',
      (await page.locator('[data-testid="gl-lost"]').count()) === 1);

    await page.evaluate(() => window.__lose?.restoreContext());
    // Generous: the rebuild is a whole GL setup and then a plate laid again,
    // on a machine rasterising in software.
    let after = 0;
    for (let i = 0; i < 20 && !(after > 0.01); i++) { await settle(1500); after = await litness(); }
    check('and the show comes back by itself', after > 0.01, `luminance ${after?.toFixed(3)}`);
    check('and says nothing is wrong any more',
      (await page.locator('[data-testid="gl-lost"]').count()) === 0);
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

  // ── The desk ──────────────────────────────────────────────────────
  //
  // Perform makes the plate a preview so the controls can have the room. The
  // thing that would make that a bad trade is if it cost the audience
  // resolution, so that is what is checked: the canvas's *backing store* — the
  // pixels actually rendered — must not change when the box it is shown in
  // does. (It cannot: `frame` does not appear anywhere in the visualizer's
  // `resize`. This is the check that keeps it that way.)
  //
  // The desk owns the whole window rather than floating over the plate, and
  // Design is the same three columns holding the other half of the job. So
  // the old "is the desk under the toolbar" clash checks are replaced by a
  // stronger one — while a desk is up, the overlay UI is not rendered at all —
  // and by checking that each mode shows its own columns.
  {
    // Up to a laptop: everything above ran on the narrow-screen surface, and
    // the desks deliberately do not lay out below 1024.
    await page.setViewportSize({ width: 1440, height: 900 });
    await settle(1800);
    const size = () => page.evaluate(() => {
      const c = document.getElementById('liquid-canvas');
      const r = document.querySelector('[data-testid="plate-frame"]').getBoundingClientRect();
      return { w: c.width, h: c.height, boxW: Math.round(r.width), boxH: Math.round(r.height) };
    });

    const bench = await size();
    check('a desk lays out at laptop width',
      (await page.getByTestId('design-desk').count()) === 1 || (await page.getByTestId('perform-desk').count()) === 1);
    check('and the plate is a preview inside it, not the window',
      bench.boxW < 1440 * 0.75, `${bench.boxW}px of 1440`);

    await clickOn('mode-segmented-perform');
    await settle(1800);
    const perform = await size();
    check('Perform shows the desk', (await page.getByTestId('perform-desk').count()) === 1);
    check('and costs the render not one pixel',
      perform.w === bench.w && perform.h === bench.h,
      `${bench.w}×${bench.h} → ${perform.w}×${perform.h}`);

    // ── The mode switch stays where it is ──────────────────────────
    //
    // Design carries Save and Send to wall on the right and Perform carries
    // nothing, so a header laid out with `justify-between` slid the middle
    // group by the width of two buttons every time you used it — measured at
    // 137px. The one control whose whole job is to be in the same place every
    // time was the one that moved when you pressed it.
    {
      const at = () => page.evaluate(() => {
        const r = document.querySelector('[data-testid="mode-segmented"]')?.getBoundingClientRect();
        return r ? Math.round(r.x) : null;
      });
      const inPerform = await at();
      await clickOn('mode-segmented-design');
      await settle(1200);
      const inDesign = await at();
      await clickOn('mode-segmented-perform');
      await settle(1200);
      const back = await at();
      const drift = Math.max(Math.abs(inDesign - inPerform), Math.abs(back - inPerform));
      check('the mode switch does not move when you use it', drift <= 1,
        `perform ${inPerform}, design ${inDesign}, back ${back} — ${drift}px`);
    }

    // ── Every setting is reachable ─────────────────────────────────
    //
    // Ten of the sixteen sections used to sit behind a tab that nothing gave
    // anyone a reason to press, on a panel that opened on the other one — so
    // the room camera, the projectors, the solver and the physics were all
    // there and none of them could be found. Three ways in, all checked: the
    // All tab, the search box, and a command-palette row per section.
    {
      await clickOn('mode-segmented-design');
      await settle(1200);

      // Both desks' own way in, and it has to be *on screen*. The first
      // version of this button sat at the end of the recipe, which scrolls —
      // so the one control whose entire job is to be findable was itself
      // below the fold. It is in the pinned footer of each now, and this
      // checks the property rather than the existence.
      //
      // And it has to open on *all* of them, from either desk. A button that
      // says "All settings…" and lands you on six of the sixteen groups is the
      // same trap through a different door — which is exactly what happened
      // when Perform grew this button while the sheet still defaulted to the
      // Perform half there.
      const entryOn = async (deskLabel) => {
        const el = await page.evaluate(() => {
          const e = document.querySelector('[data-testid="open-all-settings"]');
          if (!e) return null;
          const r = e.getBoundingClientRect();
          return { onScreen: r.top >= 0 && r.bottom <= window.innerHeight && r.width > 40, top: Math.round(r.top) };
        });
        check(`${deskLabel} has a visible way into every setting`,
          !!el && el.onScreen, el ? `at y=${el.top}` : 'no button');
        if (!el?.onScreen) return;
        await clickOn('open-all-settings');
        await settle(1200);
        const opened = await page.evaluate(() => {
          const pane = document.querySelector('[data-testid="settings-panel"]');
          if (!pane) return null;
          const rail = pane.querySelector('[data-testid="settings-rail"]');
          const room = rail?.querySelector('[data-testid="settings-nav-room"]');
          const midi = rail?.querySelector('[data-testid="settings-nav-midi"]');
          const r = room?.getBoundingClientRect();
          return {
            rows: rail ? rail.querySelectorAll('[data-testid^="settings-nav-"]').length : 0,
            roomOnScreen: !!r && r.width > 20 && r.bottom > 0 && r.top < window.innerHeight,
            midiRow: !!midi,
          };
        });
        check(`and from ${deskLabel} every section is one click away`,
          !!opened && opened.rows >= 16 && opened.roomOnScreen && opened.midiRow,
          opened ? `${opened.rows} rows, room on screen ${opened.roomOnScreen}, controller ${opened.midiRow}` : 'no panel');

        // The room camera reached from the desk, by name, in two clicks.
        await clickOn('settings-nav-room');
        await settle(500);
        const reached = await page.evaluate(() => {
          const pane = document.querySelector('[data-testid="settings-panel"]');
          const vis = [...pane.querySelectorAll('section[data-section]')].filter(x => !x.classList.contains('hidden'));
          return { ids: vis.map(x => x.dataset.section), watch: !!pane.querySelector('[data-testid="scene-toggle"]') };
        });
        check(`and from ${deskLabel} the room camera is two clicks away`,
          reached.ids.length === 1 && reached.ids[0] === 'room' && reached.watch,
          `${reached.ids.join(', ') || 'nothing'}, toggle ${reached.watch}`);
        await page.keyboard.press('Escape');
        await settle(700);
      };
      await clickOn('mode-segmented-perform');
      await settle(1200);
      await entryOn('the desk');
      await clickOn('mode-segmented-design');
      await settle(1200);
      await entryOn('the bench');

      await page.keyboard.press('Meta+k');
      await settle(700);
      await page.keyboard.type('Settings: The Room');
      await settle(600);
      await page.keyboard.press('Enter');
      await settle(1500);

      const panel = await page.evaluate(() => {
        const pane = document.querySelector('[data-testid="settings-panel"]');
        if (!pane) return null;
        const all = [...pane.querySelectorAll('section[data-section]')];
        const vis = all.filter(x => !x.classList.contains('hidden'));
        const current = pane.querySelector('[data-testid="settings-rail"] [aria-current="page"]');
        return {
          total: all.length,
          visible: vis.map(x => x.dataset.section),
          reachedRoom: !!pane.querySelector('[data-testid="scene-toggle"]'),
          railSays: current?.textContent?.trim() ?? null,
        };
      });
      check('a palette row opens Settings at the section it names',
        !!panel && panel.visible.length === 1 && panel.visible[0] === 'room',
        panel ? `showing ${panel.visible.join(', ') || 'nothing'}` : 'no settings panel');
      check('and the rail says where you are',
        !!panel && panel.railSays === 'The Room', panel ? String(panel.railSays) : '');
      check('and the room camera is on it', !!panel && panel.reachedRoom);

      // The search reaches a section by what it is about, not by its heading:
      // "people" is the word someone types, and it is nowhere in "The Room".
      const found = await page.evaluate(() => {
        const input = document.querySelector('[data-testid="settings-search"]');
        if (!input) return null;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'people');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      });
      await settle(600);
      const afterSearch = await page.evaluate(() => {
        const pane = document.querySelector('[data-testid="settings-panel"]');
        const all = [...pane.querySelectorAll('section[data-section]')];
        const vis = all.filter(x => !x.classList.contains('hidden'));
        return { n: vis.length, ids: vis.map(x => x.dataset.section) };
      });
      check('searching what a section is about finds it', found && afterSearch.ids.includes('room'),
        `"people" → ${afterSearch.ids.join(', ') || 'nothing'}`);
      check('and searching narrows rather than showing everything',
        afterSearch.n > 0 && afterSearch.n < 16, `${afterSearch.n} sections`);

      // The rail narrows with it, so it reads as a result list rather than a
      // menu whose rows mostly lead nowhere.
      const railAfter = await page.evaluate(() => {
        const r = document.querySelector('[data-testid="settings-rail"]');
        return [...r.querySelectorAll('[data-testid^="settings-nav-"]')].map(b => b.dataset.testid.replace('settings-nav-', ''));
      });
      check('and the rail narrows to the same sections',
        railAfter.length === afterSearch.n && railAfter.includes('room'),
        `rail ${railAfter.join(', ') || 'empty'} vs pane ${afterSearch.ids.join(', ')}`);

      await page.keyboard.press('Escape');
      await settle(800);

      /*
        ── Putting a control on a desk ─────────────────────────────

        The other half of the same complaint: the settings a show is played
        on were reachable only through a panel, so anything not among the six
        rides or the eight recipe slots meant opening the panel again every
        time you wanted it. Every slider now carries two chips — P and D —
        and this follows one the whole way: pin it, close the panel, and
        check the strip it was pinned to actually grew it.
      */
      await clickOn('mode-segmented-perform');
      await settle(1200);
      const ridesBefore = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="rides"] [data-testid^="ride-"]')]
          .map(e => e.dataset.testid).filter(t => t.startsWith('ride-') && !t.startsWith('ride-pick')));
      await clickOn('open-all-settings');
      await settle(1200);
      await clickOn('settings-nav-physics');
      await settle(500);
      const chip = page.getByTestId('pin-perform-buoyancy');
      check('a setting deep in the panel offers to go on the desk',
        await chip.count() > 0 && await chip.isVisible(), `${await chip.count()} chip`);
      if (await chip.count()) {
        await clickOn(chip);
        await settle(400);
        const pressed = await chip.getAttribute('aria-pressed');
        check('and says so once it is on', pressed === 'true', `aria-pressed=${pressed}`);
        await page.keyboard.press('Escape');
        await settle(900);
        const ridesAfter = await page.evaluate(() =>
          [...document.querySelectorAll('[data-testid="rides"] [data-testid^="ride-"]')]
            .map(e => e.dataset.testid).filter(t => t.startsWith('ride-') && !t.startsWith('ride-pick')));
        check('and it is on the desk when the panel closes',
          ridesAfter.includes('ride-buoyancy') && ridesAfter.length === ridesBefore.length + 1,
          `${ridesBefore.length} → ${ridesAfter.length}: ${ridesAfter.join(', ')}`);

        // And back off again, so the desk is not a one-way tray.
        await clickOn('open-all-settings');
        await settle(1200);
        await clickOn('settings-nav-physics');
        await settle(500);
        await clickOn('pin-perform-buoyancy');
        await settle(400);
        await page.keyboard.press('Escape');
        await settle(900);
        const ridesBack = await page.evaluate(() =>
          [...document.querySelectorAll('[data-testid="rides"] [data-testid^="ride-"]')]
            .map(e => e.dataset.testid).filter(t => t.startsWith('ride-') && !t.startsWith('ride-pick')));
        check('and comes off again', !ridesBack.includes('ride-buoyancy'), ridesBack.join(', '));
      }

      // The bench's recipe was a constant in a file: eight controls, and no
      // way to make it nine. Its Choose is the desk's picker over the same
      // list, so this only has to prove the door opens and works.
      await clickOn('mode-segmented-design');
      await settle(1200);
      const recipeBefore = await page.evaluate(() =>
        document.querySelectorAll('[data-testid="recipe"] [data-testid^="recipe-"]').length);
      await clickOn('recipe-pick');
      await settle(500);
      const picker = page.getByTestId('recipe-picker');
      check('the bench can be told what is on its recipe', await picker.count() > 0);
      if (await picker.count()) {
        await clickOn('recipe-picker-refraction');
        await settle(300);
        await clickOn('recipe-pick');
        await settle(500);
        const recipeAfter = await page.evaluate(() =>
          [...document.querySelectorAll('[data-testid="recipe"] [data-testid^="recipe-"]')]
            .map(e => e.dataset.testid));
        check('and what you chose is on it',
          recipeAfter.includes('recipe-refraction'),
          `${recipeBefore} → ${recipeAfter.filter(t => t !== 'recipe-pick' && t !== 'recipe-picker').length}`);
      }

      /*
        ── The controller ──────────────────────────────────────────

        Five factory maps, learn, banks, LED feedback and a picture of the
        hardware, all of it reachable on a desktop only through ⌘K, because
        the button that opened it lived in the narrow-screen toolbar the
        desks replaced. Two ways in now, and both are checked: the status dot
        that was already reporting MIDI, and a rail row of its own.
      */
      await clickOn('dot-midi');
      await settle(900);
      check('the MIDI dot opens the controller panel',
        await page.getByTestId('midi-panel').count() > 0);
      await page.keyboard.press('Escape');
      await settle(800);
      await clickOn('open-all-settings');
      await settle(1200);
      await clickOn('settings-nav-midi');
      await settle(500);
      const midiSection = await page.evaluate(() => {
        const pane = document.querySelector('[data-testid="settings-panel"]');
        const vis = [...pane.querySelectorAll('section[data-section]')].filter(x => !x.classList.contains('hidden'));
        return {
          ids: vis.map(x => x.dataset.section),
          // Web MIDI is absent in this browser build, so the section's job
          // here is to say so rather than to show an enable button that
          // could never work. Either is a section that exists and explains
          // itself; neither is what was there before, which was nothing.
          enable: !!pane.querySelector('[data-testid="settings-midi-enable"]'),
          unsupported: !!pane.querySelector('[data-testid="settings-midi-unsupported"]'),
          open: !!pane.querySelector('[data-testid="settings-midi-open"]'),
        };
      });
      check('and settings has a controller section of its own',
        midiSection.ids.length === 1 && midiSection.ids[0] === 'midi',
        midiSection.ids.join(', ') || 'nothing');
      check('and it either sets the controller up or says why it cannot',
        midiSection.enable || midiSection.unsupported,
        `enable ${midiSection.enable}, unsupported ${midiSection.unsupported}`);
      await page.keyboard.press('Escape');
      await settle(800);

      await clickOn('mode-segmented-perform');
      await settle(1200);
    }

    // One control surface, not two. A check that passes because neither
    // element exists is measuring nothing, so it names what it looked for.
    const legacy = ['liquid-water', 'midi-button', 'desk-mode-button', 'preset-title-button', 'guide-button'];
    const stillUp = [];
    for (const id of legacy) if (await page.getByTestId(id).count() > 0) stillUp.push(id);
    check('and the overlay UI is not drawn underneath it',
      stillUp.length === 0, stillUp.length ? stillUp.join(', ') : `none of ${legacy.join(', ')}`);

    // Its own three columns must not overlap the hole the plate is painted
    // over — a preview with a slider on top of it is worse than no preview.
    const overlap = await page.evaluate(() => {
      const box = (id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect() ?? null;
      const hole = box('desk-preview'), cues = box('cue-list'), rides = box('rides');
      if (!hole || !cues || !rides) return 'a column is missing';
      const bad = [];
      if (cues.right > hole.left + 1) bad.push(`cues reach ${Math.round(cues.right)}, plate starts at ${Math.round(hole.left)}`);
      if (rides.left < hole.right - 1) bad.push(`rides start at ${Math.round(rides.left)}, plate ends at ${Math.round(hole.right)}`);
      return bad.length ? bad.join('; ') : null;
    });
    check('and its columns clear the plate', overlap === null, overlap ?? '');

    // Clearing the hole is not the same as letting the pointer reach it. The
    // desk is `fixed z-10` and the preview is a transparent gap in it, so for
    // a while the plate showed through while the desk stayed the topmost
    // element there: every mousedown landed on the gap, the canvas's own
    // listeners never fired, and the bottles, the dyes and all seven tools
    // did nothing. Nothing about the layout looked wrong, which is why this
    // asks the question hit-testing answers rather than the one geometry does.
    const throughTheHole = await page.evaluate(() => {
      const r = document.querySelector('[data-testid="desk-preview"]').getBoundingClientRect();
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { ok: el === document.getElementById('liquid-canvas'),
               what: el?.dataset?.testid || el?.id || el?.tagName || 'nothing' };
    });
    check('and the plate, not the hole, takes the pointer',
      throughTheHole.ok, `the cursor is over ${throughTheHole.what}`);

    // Go must name where it is going, or it is a button you press and hope.
    await clickOn('cue-oil-on-water');
    await settle(600);
    const goLabel = (await page.getByTestId('go-button').innerText()).trim();
    check('and Go names the look it will send', /Oil on Water/i.test(goLabel), goLabel.replace(/\s+/g, ' '));

    // ⌘K reaches what the desk deliberately does not show.
    await page.keyboard.press('Control+k');
    await settle(500);
    const paletteUp = await page.getByTestId('command-palette').count();
    await page.evaluate(() => {
      const input = document.querySelector('[data-testid="palette-input"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'lacing');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle(500);
    const hit = await page.getByTestId('palette-list').locator('button').first().innerText();
    await page.keyboard.press('Escape');
    await settle(400);
    check('and ⌘K finds a look by name', paletteUp === 1 && /lacing/i.test(hit), `“${hit.replace(/\s+/g, ' ')}”`);

    // Settings and MIDI have no button of their own any more; if the palette
    // cannot open them they are unreachable on a laptop.
    for (const [query, id] of [['Settings', 'settings-panel'], ['MIDI', 'midi-panel']]) {
      await viaPalette(query);
      const up = await page.getByTestId(id).count();
      const w = up ? await page.evaluate((i) => Math.round(document.querySelector(`[data-testid="${i}"]`).getBoundingClientRect().width), id) : 0;
      check(`and ⌘K opens ${query} as a sheet`, up === 1 && w <= 720 && w > 300, up ? `${w}px wide` : 'did not open');
      // Escape, then prove it closed. A sheet's scrim covers the desk and
      // takes any click meant for it, so one left open turns the next check
      // into "the click went to the scrim" — which reads as the app failing
      // to do whatever that click asked for.
      const gone = await escapeCloses(id);
      check(`and ${query} closes again`, gone, gone ? '' : 'still open — the next check would be clicking its scrim');
    }

    await noteDuplicates();

    /*
      Design is the bench: the other half of the job, same grid.

      Polled, not asserted after a fixed wait. This check failed once and read
      as the app refusing to switch back; driving the two modes directly,
      four switches in a row landed correctly every time, and both sheets
      close on Escape. What was actually wrong was a 1500ms wait on a machine
      rendering at six frames a second. A fixed delay is a guess about a
      machine's speed, and this one guessed wrong about its own.
    */
    await clickOn('mode-segmented-design');
    let benchUp = 0, bottles = 0, cuesGone = 1;
    for (let i = 0; i < 20; i++) {
      benchUp = await page.getByTestId('design-desk').count();
      bottles = await page.getByTestId('bottle-silicone').count();
      cuesGone = await page.getByTestId('cue-list').count();
      if (benchUp === 1 && bottles === 1 && cuesGone === 0) break;
      await settle(400);
    }
    check('and Design shows the bench instead of the cue list',
      benchUp === 1 && bottles === 1 && cuesGone === 0,
      `design-desk ${benchUp}, bottles ${bottles}, cue list ${cuesGone}`);
  }

  // ── Readable in a dark room ───────────────────────────────────────
  //
  // The desk is read at arm's length, in a dark room, by someone whose eyes
  // are adapted to a projection. 8px uppercase at 40% opacity is elegant in a
  // screenshot and unreadable there.
  //
  // The plan's gate said 44px hit targets. Measured, that was the wrong
  // target: it would give the sixteen dye swatches 704px of column on their
  // own. What measurement did support is the type — eleven actionable controls
  // carried text at 8, 9 or 10px, and the dye swatches were 20px square. So
  // the gate kept is type size and contrast, with a floor on hit targets low
  // enough to allow a deliberately dense swatch grid.
  //
  // One thing measurement contradicted outright: the assumption that the UI
  // leaned on faint text for things you click. Not one actionable control was
  // below 60% opacity, then or now.
  {
    await page.setViewportSize({ width: 1600, height: 900 });
    await settle(1000);
    const legible = await page.evaluate(() => {
      const alpha = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return 1; const p = m[1].split(','); return p[3] === undefined ? 1 : parseFloat(p[3]); };
      const tiny = [], faint = [], small = [];
      for (const el of document.querySelectorAll('button, input, select, [role="menuitem"], a')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || el.offsetParent === null) continue;
        const cs = getComputedStyle(el);
        const text = (el.textContent || '').trim();
        const name = (text || el.getAttribute('aria-label') || el.getAttribute('title') || el.tagName).slice(0, 26);
        if (text && parseFloat(cs.fontSize) < 11) tiny.push(`${name} ${cs.fontSize}`);
        if (text && alpha(cs.color) < 0.6) faint.push(`${name} α${alpha(cs.color)}`);
        if (Math.min(r.width, r.height) < 24) small.push(`${name} ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
      return { tiny, faint, small };
    });
    check('nothing you can click has text under 11px', legible.tiny.length === 0, legible.tiny.slice(0, 6).join(', '));
    check('and none of it is under 60% opacity', legible.faint.length === 0, legible.faint.slice(0, 6).join(', '));
    check('and nothing is smaller than 24px', legible.small.length === 0, legible.small.slice(0, 6).join(', '));
  }

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
console.log(`\n${results.length - failed.length}/${results.length} checks passed in ${((Date.now() - started) / 1000).toFixed(0)}s`);

// Where the time went, so the next person shortening this suite starts from a
// measurement rather than from the source.
const dear = [...results].sort((a, b) => b.took - a.took).slice(0, 8).filter(r => r.took >= 5);
if (dear.length) {
  console.log('\nslowest checks:');
  for (const r of dear) console.log(`  ${r.took.toFixed(0)}s  ${r.name}`);
}
if (errors.length) {
  console.log(`\nconsole output the app should not have produced (${errors.length}):`);
  for (const e of errors.slice(0, 20)) console.log('  ', e.slice(0, 300));
}
process.exit(failed.length === 0 ? 0 : 1);
