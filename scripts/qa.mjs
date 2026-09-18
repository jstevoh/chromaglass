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

/*
  How many pixels the plate is drawn into, as a fraction of the window.

  This suite took 34.3 minutes on a runner, and until it was measured the only
  theory about that was the fixed waits — which turned out to be 69 seconds
  across all seventy-three of them. `ps` during a run found where the rest of
  it went:

    chrome --type=gpu-process --use-angle=swiftshader-webgl   309% CPU
    chrome --type=renderer  (React, the fluid solver)           9% CPU

  Three of four cores shading fragments in software, and every step here
  queueing behind them. One `page.evaluate` at 1440x900, measured:

    dpr 1     1440x900   2831ms
    dpr 0.5    720x450    789ms
    dpr 0.35   504x315    433ms

  Fragment cost is the pixel count, so it falls with the square of this. What
  the suite asks is resolution-independent — does it load, do the controls
  work, does the console stay clean, does it come back from a lost context,
  where is a column laid out — because layout and geometry are CSS and the
  luminance checks take a mean over a 16x9 reduction of whatever size the
  canvas happens to be. The one harness that makes precise claims about
  individual pixels is `wall`, and that one is deliberately left at full
  resolution.

  QA_DPR=1 runs it the slow way, for anything that needs the real thing.
*/
const DPR = process.env.QA_DPR ?? '0.35';
/*
  `look=classic` because the app now opens on a random one.

  That is right for somebody arriving — the plate does thirty things and the
  first one anybody saw was always the same — and wrong for anything that
  measures the plate. `wall` reads its brightness and compares a graded frame
  against an ungraded one: a bright look under 2.2x gain clips and lifts by
  1.19x where the check wants 1.25x, so the suite started failing on which
  look it happened to get. Every harness that measures pixels pins it.
*/
const URL = `http://localhost:${PORT}/?debug&look=classic&dpr=${encodeURIComponent(DPR)}${GPU ? `&gpu=${encodeURIComponent(GPU)}&tier=local` : ''}`;
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
 * Wait for something to turn up: the counterpart of `escapeCloses`, and the
 * same lesson.
 *
 * `poke` is re-run before each look, because some of what this waits for is a
 * *moment* rather than a state. The activity readout keeps an event for four
 * seconds and then drops it, and the comment above measured this runner
 * stalling the main thread for longer than that — so a fixed wait is wrong in
 * both directions at once: too early to have seen the event, and late enough
 * that it has already expired. Re-firing is not a workaround for the app, it
 * is what the hardware does: a fader on a desk sends continuously.
 *
 * The assertion is unchanged. Something that never turns up still fails.
 */
const appears = async (testId, poke) => {
  for (let i = 0; i < 20; i++) {
    if (poke) await poke();
    if ((await page.getByTestId(testId).count()) > 0) return true;
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

  // ── The macro zoom is a move, not a switch ────────────────────────
  //
  // This one is here because the slider did nothing. It reached the renderer
  // only when a toggle in another panel was already on, so on the desk — where
  // there is no such toggle — dragging it changed the number and not the
  // picture. A control that is drawn and does nothing is worse than one that
  // is missing, and nothing in the suite would have noticed.
  //
  // Measured as how far the frame has travelled from the plate-wide one, which
  // is the claim: not that magnification looks like anything in particular,
  // but that the zoom moves the picture and moves it *gradually*. The first
  // version of this check asserted a direction — that a magnified frame has
  // less neighbour contrast, because bigger shapes — and that was wrong twice
  // over: pushing in also raises the closeup's exposure, which throws a hard
  // silhouette against dark ground, and the contrast went up tenfold rather
  // than down. The feature was right and the check was wrong.
  {
    const frame = () => page.evaluate(() => {
      const c = document.querySelector('#liquid-canvas');
      const o = document.createElement('canvas');
      o.width = 96; o.height = 54;
      const x = o.getContext('2d', { willReadFrequently: true });
      x.drawImage(c, 0, 0, o.width, o.height);
      return [...x.getImageData(0, 0, o.width, o.height).data];
    });
    /** Mean absolute difference per channel, 0 for identical frames. */
    const apart = (a, b) => {
      let sum = 0;
      for (let i = 0; i < a.length; i++) if (i % 4 !== 3) sum += Math.abs(a[i] - b[i]);
      return sum / (a.length * 0.75);
    };
    const at = async (zoom) => {
      await page.evaluate(z => window.chromaglassSettings?.({ macroZoom: z }), zoom);
      await settle(1800);
      return frame();
    };

    await page.evaluate(() => window.chromaglassSettings?.({ macroZoom: 1, macroMode: false }));
    await settle(1800);
    const plate = await frame();

    // The plate goes on moving under all of this, so measure how far it
    // wanders on its own first: nothing below counts unless it clears this.
    await settle(1800);
    const drift = apart(plate, await frame());

    // The bug, exactly: the zoom on its own, with no switch thrown anywhere.
    const far = apart(plate, await at(9));
    check('the zoom alone moves the picture, with no switch thrown',
      far > Math.max(6, drift * 4), `${far.toFixed(1)} from the plate against ${drift.toFixed(1)} of drift`);

    // And it is a travel rather than a cut: a little way in is a little way
    // along, not already at the far end. A hard switch scores the same here as
    // at nine times, which is what it used to be.
    const near = apart(plate, await at(1.4));
    check('and a little way in is a little way along, not all of it',
      near > drift && near < far * 0.8,
      `${near.toFixed(1)} at 1.4× against ${far.toFixed(1)} at 9×`);

    // Back to the plate, not stranded in the closeup.
    const home = apart(plate, await at(1));
    check('and it comes back to the plate again',
      home < far * 0.5, `${home.toFixed(1)} back at 1×`);

    // The readout follows the zoom, not the old flag.
    await page.evaluate(() => window.chromaglassSettings?.({ macroZoom: 5 }));
    await settle(600);
    const readout = await page.evaluate(() => document.querySelector('[data-testid="macro-zoom-value"]')?.textContent ?? null);
    check('and the frame says how far in it is', readout === '5.0×', `readout ${readout}`);
    await page.evaluate(() => window.chromaglassSettings?.({ macroZoom: 1, macroMode: false }));
    await settle(800);
  }

  // ── The mark: a logo that survives the plate ──────────────────────
  //
  // The whole point of compositing it in the shader rather than putting an
  // element over the canvas is that it reaches everything which reads the
  // canvas — the projector window, a cast, the recorder, another machine
  // capturing this one. So the check is on the canvas pixels, not on the DOM:
  // a mark that is only in the DOM would pass a DOM check and be missing from
  // every screen that matters.
  {
    await clickOn('settings-nav-mark');
    await settle(300);
    // Eight magenta pixels. Magenta because nothing the plate does on its own
    // is full red and full blue with no green at all, so finding it on the
    // canvas cannot be the liquid having a moment.
    const MAGENTA_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAE0lEQVR4nGP4z/D/Pz7MMDIUAACD5r9BB2dd7wAAAABJRU5ErkJggg==';
    const magentaShare = () => page.evaluate(() => {
      const c = document.querySelector('#liquid-canvas');
      if (!c) return -1;
      const o = document.createElement('canvas');
      o.width = 160; o.height = 90;
      const x = o.getContext('2d', { willReadFrequently: true });
      x.drawImage(c, 0, 0, o.width, o.height);
      const d = x.getImageData(0, 0, o.width, o.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 180 && d[i + 2] > 180 && d[i + 1] < 90) n++;
      }
      return n / (o.width * o.height);
    });

    const before = await magentaShare();
    await page.setInputFiles('#mark-file', {
      name: 'mark.png', mimeType: 'image/png', buffer: Buffer.from(MAGENTA_PNG, 'base64'),
    });
    await settle(900);
    // Big enough that a share of the frame is unambiguous.
    await page.evaluate(() => window.chromaglassSettings?.({ markScale: 0.8, markMix: 1, markX: 0.5, markY: 0.5 }));
    await settle(700);
    const after = await magentaShare();
    check('a loaded mark reaches the canvas, not just the page',
      before < 0.02 && after > 0.15, `${(before * 100).toFixed(1)}% → ${(after * 100).toFixed(1)}% of the frame`);

    // The house dimmer is the lamp. Taking the lamp out should not take the
    // sponsor's logo off the wall with it.
    await page.evaluate(() => window.chromaglassSettings?.({ dimmer: 0 }));
    await settle(500);
    const blacked = await magentaShare();
    check('and a blackout leaves it on the wall', blacked > 0.15,
      `${(blacked * 100).toFixed(1)}% with the dimmer at zero`);
    await page.evaluate(() => window.chromaglassSettings?.({ dimmer: 1 }));

    // Its own opacity is the control for taking it off, and it has to reach 0.
    await page.evaluate(() => window.chromaglassSettings?.({ markMix: 0 }));
    await settle(500);
    check('and its opacity takes it off', (await magentaShare()) < 0.02);
    await page.evaluate(() => window.chromaglassSettings?.({ markMix: 1 }));
    await settle(400);

    await clickOn('mark-clear');
    await settle(600);
    check('and taking it off leaves nothing behind', (await magentaShare()) < 0.02);
  }

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
    // Counted by test id, not by the label. The label used to say "Room
    // feature" and a patch now names its own source, so the label changed and
    // this counted zero of zero — a check that passes nothing and fails loudly,
    // which is the good version of that mistake.
    const before = await page.locator('[data-testid^="patch-feature-"]').count();
    await clickOn(mapAdd);
    await settle(700);
    const rows = await page.locator('[data-testid^="patch-feature-"]').count();
    check('a room mapping can be added and targeted', rows === before + 1, `${before} → ${rows}`);
    if (rows) {
      await page.locator('[data-testid^="patch-feature-"]').first().selectOption('crowd');
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
        ── The film projector's third source ───────────────────────

        A video file and a camera were the only two ways to get moving
        pictures through the dye, and both need the film to already be on the
        machine. A window reaches everything else — a tab playing a reel off
        the Internet Archive, a media player — and is the only way that can
        work: a cross-origin video plays in a page but taints the texture the
        moment WebGL reads it, and the Archive's file responses carry no CORS
        header (checked: none on /download/, none on the data node, OPTIONS
        405). A captured window has no origin.

        The picker cannot be driven from a harness, so what is checked is that
        the way in exists, says what it is for, and does not throw — the rest
        is the browser's own dialog.
      */
      await clickOn('open-all-settings');
      await settle(1200);
      await clickOn('settings-nav-projectors');
      await settle(500);
      const film = await page.evaluate(() => {
        const box = (id) => {
          const el = document.querySelector(`[data-testid="${id}"]`);
          return el ? { ...el.getBoundingClientRect().toJSON(), title: el.getAttribute('title') ?? '' } : null;
        };
        const w = box('film-window'), cam = box('film-camera'), off = box('film-off');
        if (!w || !cam || !off) return null;
        return {
          title: w.title,
          width: Math.round(w.width),
          // In the row with the other two, which is the claim that matters.
          // Not "on screen without scrolling": this lives inside a section
          // eight controls deep, and Load loop and Camera are just as far
          // down it. The pinned way *into* settings has to be above the fold
          // and is checked for that; a control inside a section does not.
          inRow: Math.abs(w.top - cam.top) < 4 && Math.abs(w.top - off.top) < 4,
          between: cam.right <= w.left + 1 && w.right <= off.left + 1,
          wide: w.width > 40,
        };
      });
      check('the film projector can be fed from a window',
        !!film && film.wide, film ? `${film.width}px button` : 'no window button');
      check('and it sits in the row with the other two sources',
        !!film && film.inRow && film.between && /window|tab|screen/i.test(film.title),
        film ? `in row ${film.inRow}, between ${film.between}, “${film.title.slice(0, 40)}…”` : '');
      /*
        ── The patch bay ───────────────────────────────────────────

        A patch is a source, a feature of it, a control it moves, how far, and
        which plate it lands on. The first three existed; source and plate are
        new, and both are dropdowns that would be easy to ship pointing at
        nothing. What is checked here is that adding a patch gives you all five
        and that the plate selector refuses the settings it cannot move —
        `PER_LAYER` is checked against the solver's own source by `npm run
        panel`, and this is the other half: that the panel honours it.
      */
      await clickOn('settings-nav-room');
      await settle(500);
      const addBtn = page.getByTestId('scene-map-add');
      if (await addBtn.count()) {
        await clickOn(addBtn);
        await settle(500);
        const patch = await page.evaluate(() => {
          const src = document.querySelector('[data-testid="patch-source-0"]');
          const feat = document.querySelector('[data-testid="patch-feature-0"]');
          const layer = document.querySelector('[data-testid="patch-layer-0"]');
          if (!src || !feat || !layer) return null;
          const opts = (el) => [...el.options].map(o => o.value);
          return {
            sources: opts(src),
            features: opts(feat).length,
            layers: opts(layer),
            layerEnabled: !layer.disabled,
          };
        });
        check('a patch names the source it listens to',
          !!patch && ['room', 'film', 'sound'].every(x => patch.sources.includes(x)),
          patch ? patch.sources.join(', ') : 'no source select');
        check('and the plate it lands on',
          !!patch && patch.layers.includes('all') && patch.layers.length > 1,
          patch ? patch.layers.join(', ') : '');

        // Switching to the sound has to change the feature list with it: a
        // microphone cannot tell you how many people are in the room, and a
        // patch left pointing at a feature its source does not have would read
        // zero for ever without saying so.
        const swapped = await page.evaluate(() => {
          const src = document.querySelector('[data-testid="patch-source-0"]');
          const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
          set.call(src, 'sound');
          src.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        });
        await settle(500);
        const after = await page.evaluate(() => {
          const feat = document.querySelector('[data-testid="patch-feature-0"]');
          return feat ? { value: feat.value, options: [...feat.options].map(o => o.value) } : null;
        });
        check('and choosing the sound offers the sound\'s own features',
          swapped && !!after && after.options.includes('bass') && !after.options.includes('crowd'),
          after ? after.options.join(', ') : 'no feature select');
        check('and moves the patch onto one of them',
          !!after && after.options.includes(after.value),
          after ? `${after.value}` : '');
      } else {
        check('a patch names the source it listens to', false, 'no Add button in The Room');
      }
      await page.keyboard.press('Escape');
      await settle(800);

      /*
        The film as a force, not only a light.

        Film Mix and Film Key decide how the reel shows; Film Drive and Film
        Impact decide what it does to the liquid. Both are greyed with a reason
        until there is a film to read, which is the check — a control that
        silently does nothing is the thing this panel keeps being fixed for.

        Opens the panel for itself rather than inheriting whatever the block
        above left behind. It used to lean on the film-window checks having
        just been on Projectors, and the moment a block was added between them
        that went to The Room and closed the panel, this looked for two
        controls in a panel that was not on screen and reported them missing.
        A check that depends on the one before it is a check that fails for a
        reason that has nothing to do with what it is testing.
      */
      await clickOn('open-all-settings');
      await settle(1200);
      await clickOn('settings-nav-projectors');
      await settle(500);
      const force = await page.evaluate(() => {
        const of = (key) => {
          const el = [...document.querySelectorAll('[data-testid^="pins-"]')]
            .find(e => e.dataset.testid === `pins-${key}`);
          const row = el?.closest('div.flex.flex-col');
          const range = row?.querySelector('input[type="range"]');
          return row ? { there: true, disabled: !!range?.disabled, why: row.getAttribute('title') ?? '' } : null;
        };
        return { drive: of('filmDrive'), impact: of('filmImpact') };
      });
      check('the film can drive the plate as well as light it',
        !!force.drive && !!force.impact,
        `drive ${!!force.drive}, impact ${!!force.impact}`);
      check('and both say why they are greyed with no film loaded',
        !!force.drive?.disabled && /loop|camera|window/i.test(force.drive.why ?? ''),
        force.drive ? `disabled ${force.drive.disabled}, “${(force.drive.why ?? '').slice(0, 40)}”` : '');

      await page.keyboard.press('Escape');
      await settle(800);

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

      /*
        ── Every dot lands somewhere that can change it ─────────────

        The dots are the one place on either desk where the state of an input
        is named, so they are where a hand goes when that input is the
        problem — and the Mic dot reported "on" all evening with no way from
        there to the question it raises, which is *which* microphone. The
        section it opens has to be able to answer that, so the source chooser
        and the device picker are both checked for, not just the heading.
      */
      await clickOn('dot-mic');
      await appears('settings-panel');
      await settle(400);
      const micDot = await page.evaluate(() => {
        const pane = document.querySelector('[data-testid="settings-panel"]');
        if (!pane) return null;
        const at = pane.querySelector('[data-testid="settings-rail"] [aria-current="page"]');
        return {
          at: at?.textContent?.trim() ?? null,
          source: !!pane.querySelector('[data-testid="audio-source"]'),
          device: !!pane.querySelector('[data-testid="audio-input"]'),
          mic: !!pane.querySelector('[data-testid="audio-source-microphone"]'),
        };
      });
      check('the Mic dot opens the sound settings', !!micDot && /sound/i.test(micDot.at ?? ''), micDot?.at ?? 'no panel');
      check('and they can choose what is listening', !!micDot?.source && !!micDot?.mic);
      check('and which device it listens on', !!micDot?.device);
      /*
        `escapeCloses`, not Escape and a fixed wait.

        These three blocks each open a panel over the plate and the block after
        them clicks into Settings, so a panel still closing is a click that
        lands on nothing. Which is exactly what CI reported — `nothing to
        click: settings-nav-midi`, because 700ms is a laptop's number and this
        runner rasterises in software. The helper right above the suite exists
        for this and I should have reached for it the first time.
      */
      await escapeCloses('settings-panel');

      await clickOn('dot-wall');
      await appears('settings-panel');
      await settle(400);
      const wallDot = await page.evaluate(() => {
        const pane = document.querySelector('[data-testid="settings-panel"]');
        const at = pane?.querySelector('[data-testid="settings-rail"] [aria-current="page"]');
        return at?.textContent?.trim() ?? null;
      });
      check('the Wall dot opens the projector settings', /projector/i.test(wallDot ?? ''), wallDot ?? 'no panel');
      await escapeCloses('settings-panel');

      await clickOn('dot-phone');
      await appears('guide-panel');
      check('the Phone dot says what a phone can do',
        await page.getByTestId('guide-panel').count() > 0 || await page.locator('text=Playing it live').count() > 0);
      const guideGone = await escapeCloses('guide-panel');
      check('and the guide gets out of the way again', guideGone, guideGone ? '' : 'still open after six seconds');
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

    /*
      ── The screen says what the controller hit ──────────────────

      A fader already shows itself, because the bar and the hardware go
      through the same number. A pad shows nothing: press a preset and the
      look changes, but the row that preset lives on sits there exactly as it
      did, which in a dark room reads as "did that work?".

      This browser has no Web MIDI, so the press is fired through the debug
      hook — the same call the MIDI handler makes. Everything after it is the
      real path: the subscription, the class, and the timer that takes it off
      again. That last part is the half worth checking, because a flash that
      never clears is not feedback, it is a highlight stuck on the wrong row
      for the rest of the night.
    */
    const lit = async () => page.evaluate(() =>
      document.querySelectorAll('[data-midi-hit="true"]').length);
    check('nothing is lit before anything is pressed', (await lit()) === 0, `${await lit()} lit`);
    await page.evaluate(() => window.chromaglassTouch?.('preset:oil-on-water'));
    await settle(120);
    const onNow = await page.evaluate(() => {
      const row = document.querySelector('[data-testid="cue-oil-on-water"]');
      return { hit: row?.getAttribute('data-midi-hit') === 'true', any: document.querySelectorAll('[data-midi-hit="true"]').length };
    });
    check('a controller press lights the row it fired',
      onNow.hit && onNow.any === 1, `row ${onNow.hit}, ${onNow.any} lit in total`);
    // Long enough to be well past the flash, short enough that a stuck one
    // still fails rather than the harness waiting it out.
    await settle(700);
    check('and the light goes out again', (await lit()) === 0, `${await lit()} still lit`);

    /*
      ── What the controller is doing, without the controls on screen ──

      The desk shows six rides and a controller can reach ninety settings, so
      riding one of the other eighty-four meant spending a ride slot on it or
      riding blind. The readout is the third option, and the thing to check is
      that it is *hideable* and stays hidden — an overlay in the corner of a
      show screen that cannot be got rid of is worse than no overlay.
    */
    /*
      ── Seeding must not rebuild the machine ─────────────────────

      Seed is a counter the render loop compares against what it last acted
      on, exactly like Drain and Clear — but unlike them it *worked*, because
      it was in the dependency list of the effect that owns WebGL. Which meant
      every press tore the context down and built it again: every shader
      compiled, every framebuffer reallocated, every simulation rebuilt, on a
      button people press repeatedly while building a look. Nothing in that
      setup reads the counter — the seeding happens in the loop — so the
      rebuild was never doing the work, only delivering the news.

      Counted rather than asserted, by watching for a WebGL2 context being
      taken out. The same canvas handing back the same context does not count:
      `getContext` is only called again when the effect runs again, which is
      the thing being measured. Four presses, because one could be a fluke of
      ordering and four cannot.
    */
    await page.evaluate(() => {
      window.__glGrabs = 0;
      const real = HTMLCanvasElement.prototype.getContext;
      window.__realGetContext = real;
      HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
        if (kind === 'webgl2') window.__glGrabs++;
        return real.call(this, kind, ...rest);
      };
    });
    /*
      The seeds have to be proved to have happened, or a zero means nothing.

      This check counts something *not* happening, which is the shape that
      passes for the wrong reason: if the presses silently stopped landing,
      the count would be zero and the check would go green with the bug in
      place. The palette is the guard — `fire` returns early when nothing
      matches, so the palette only closes if a command actually ran, and
      "seed the plate" matches exactly one. Four closes, four seeds.
    */
    let seedsLanded = 0;
    for (let i = 0; i < 4; i++) {
      await viaPalette('seed the plate');
      if ((await page.getByTestId('palette-input').count()) === 0) seedsLanded++;
    }
    await settle(600);
    const glGrabs = await page.evaluate(() => {
      HTMLCanvasElement.prototype.getContext = window.__realGetContext;
      return window.__glGrabs;
    });
    check('four presses of Seed reach the plate', seedsLanded === 4, `${seedsLanded} of 4 ran`);
    check('and seeding does not rebuild the renderer',
      seedsLanded === 4 && glGrabs === 0, `${glGrabs} context build(s) across ${seedsLanded} seeds`);

    check('the controller readout is not up uninvited',
      (await page.getByTestId('midi-activity').count()) === 0);
    await viaPalette('what the controller is doing');
    await settle(600);
    check('and the palette puts it up',
      (await page.getByTestId('midi-activity').count()) === 1);

    const rideDimmer = () => page.evaluate(() => window.chromaglassTouch?.('setting:dimmer', 0.42));
    const showed = await appears('midi-activity-setting:dimmer', rideDimmer);
    const said = !showed ? null : await page.evaluate(() => {
      const el = document.querySelector('[data-testid="midi-activity-setting:dimmer"]');
      return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
    });
    check('and it names what moved and where it landed',
      !!said && /dimmer/i.test(said) && /42%/.test(said), said ?? 'no line');

    await clickOn('midi-activity-hide');
    await settle(500);
    check('and it can be got rid of',
      (await page.getByTestId('midi-activity').count()) === 0);

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
      // A fraction of the window, not a hard 720.
      //
      // "A sheet" means centred over the desk with the desk still visible
      // round it, and the number that says so is a share of the window. 720
      // was not that number; it was the width every sheet happened to have,
      // and the first sheet that legitimately needed more — Settings, once it
      // grew a rail beside its pane — failed a check that was never about it.
      const share = w / 1600;
      check(`and ⌘K opens ${query} as a sheet`, up === 1 && share <= 0.8 && w > 300,
        up ? `${w}px wide, ${Math.round(share * 100)}% of the window` : 'did not open');
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
    const measure = () => page.evaluate(() => {
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
    const legible = await measure();
    check('nothing you can click has text under 11px', legible.tiny.length === 0, legible.tiny.slice(0, 6).join(', '));
    check('and none of it is under 60% opacity', legible.faint.length === 0, legible.faint.slice(0, 6).join(', '));
    check('and nothing is smaller than 24px', legible.small.length === 0, legible.small.slice(0, 6).join(', '));

    /*
      And inside the panels, which is where it was never looking.

      This measured whatever was on screen, and what was on screen was the
      desk with nothing open — which passes, and passed all along. The
      settings pane, the sequencer and the controller panel were carrying
      buttons at 10px in the old uppercase style the whole time, under a check
      that reported the app legible. A floor that only holds where it is
      already met is not a floor.
    */
    for (const [name, open_] of [
      ['settings', async () => { await clickOn('open-all-settings'); return appears('settings-panel'); }],
      ['the controller panel', async () => { await clickOn('dot-midi'); return appears('midi-panel'); }],
    ]) {
      const up = await open_();
      await settle(700);
      const inPanel = await measure();
      check(`nothing in ${name} is under 11px either`,
        up && inPanel.tiny.length === 0, up ? inPanel.tiny.slice(0, 5).join(', ') : 'never opened');
      await page.keyboard.press('Escape');
      await settle(600);
    }
  }

  // ── Nothing is painted on top of anything you can click ───────────
  /*
    Found by a usability pass over the shipped build, at 1024 — a laptop width.

    The desk header centres the Perform / Design / Sequence switch by taking it
    out of the flow, which is exact and, out of the flow, stops it pushing
    anything. So as the window narrows the right-hand cluster slides underneath
    it, and at 1024 the switch was painted over the Mic, Wall and MIDI dots.
    Those dots had just been made clickable, so reaching for Mic did not merely
    miss — it switched the desk to Design.

    Nothing existing could have caught it. The duplicate-control check counts
    testids, the legibility check measures type, and both are happy with two
    controls in the same place. This asks the only question that matters: click
    the middle of each control, and is the control what you hit?

    An element scrolled out of a list is not covered, it is out of view, so the
    walk up the clipping ancestors comes first. Without it a long cue list
    reports every row below the fold and the check drowns in its own noise —
    which is what the first draft of it did.
  */
  {
    const coveredAt = async (w, h) => {
      await page.setViewportSize({ width: w, height: h });
      await settle(1200);
      return page.evaluate(() => {
        const inView = (el) => {
          const r = el.getBoundingClientRect();
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          for (let p = el.parentElement; p; p = p.parentElement) {
            const cs = getComputedStyle(p);
            if (/auto|scroll|hidden/.test(cs.overflowY + cs.overflowX)) {
              const pr = p.getBoundingClientRect();
              if (cy < pr.top - 1 || cy > pr.bottom + 1 || cx < pr.left - 1 || cx > pr.right + 1) return false;
            }
          }
          return cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight;
        };
        const out = [];
        for (const el of document.querySelectorAll('button, input, select, [role="tab"]')) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height || !inView(el)) continue;
          const top = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
          if (!top || el === top || el.contains(top) || top.contains(el)) continue;
          const me = el.dataset.testid || el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 20) || el.tagName;
          const by = top.dataset?.testid || (top.textContent || '').trim().slice(0, 20) || top.tagName;
          out.push(`${me} under ${by}`);
        }
        return out;
      });
    };
    /*
      Including the widths below 1024, where the app shows its own older
      overlay interface rather than the desk. Two columns pinned to opposite
      edges at the same vertical centre, so their combined width is the only
      thing keeping them apart — and on a phone it was not: the bottle rows
      and an eight-wide swatch grid made the left one 270px of a 390px window
      and the right column was painted over the end of it.
    */
    for (const [w, h] of [[1440, 900], [1280, 860], [1024, 860], [900, 860], [430, 932], [390, 844]]) {
      const hit = await coveredAt(w, h);
      check(`nothing covers a control at ${w}px`, hit.length === 0, hit.slice(0, 4).join('; '));
    }
    await page.setViewportSize({ width: 1600, height: 900 });
    await settle(900);
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
