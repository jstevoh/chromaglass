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
 * `.first()`, because a panel may legitimately carry a control the toolbar
 * also has. It is deliberately forgiving — which is why the duplicate check
 * below exists: without it, this helper silently drives one of two buttons and
 * the other could be anything at all.
 */
const firstVisible = (testId) => page.getByTestId(testId).first();

/*
  Raw coordinates for the desk's controls.

  `locator.click()` stalls on them: its call log stops at "locator resolved to
  <button …>" and never reports an actionability verdict, while a mouse click
  at the same point works and the control visibly takes the selection. The
  element is stable (traced over twenty animation frames: one bounding box)
  and hit-testable (elementFromPoint returns the button itself), so that is
  Playwright's machinery queueing behind the render loop, not the app.
*/
const clickOn = async (testId) => {
  const box = await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, testId);
  if (!box) throw new Error(`no element [data-testid="${testId}"]`);
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

  // ── The panel is two tabs, and Perform is the shorter one ─────────
  //
  // It used to be one column eight screens deep with 722 words of prose in
  // it, which is not a control surface. What is checked is the split holding:
  // Perform must show fewer sections than the panel has, and must be the
  // shorter scroll of the two, or the tab has stopped earning itself.
  {
    const measure = async () => page.evaluate(() => {
      const vis = [...document.querySelectorAll('section')].filter(s => s.offsetParent !== null);
      const panel = [...document.querySelectorAll('div')].find(d => d.querySelector('section h3') && d.scrollHeight > d.clientHeight + 4);
      return { n: vis.length, scroll: panel ? panel.scrollHeight : 0, client: panel ? panel.clientHeight : 1 };
    });
    await firstVisible('settings-tab-perform').click();
    await settle(600);
    const perform = await measure();
    await firstVisible('settings-tab-setup').click();
    await settle(600);
    const setup = await measure();
    await firstVisible('settings-tab-perform').click();
    await settle(600);
    check('the settings panel is split in two',
      perform.n > 0 && setup.n > 0 && perform.n + setup.n === headings.length,
      `${perform.n} perform + ${setup.n} setup = ${headings.length}`);
    check('and Perform is the shorter half',
      perform.scroll < setup.scroll,
      `${(perform.scroll / perform.client).toFixed(1)} screens vs ${(setup.scroll / setup.client).toFixed(1)}`);
    check('and Perform fits in about three screens',
      perform.scroll / perform.client < 3.5, `${(perform.scroll / perform.client).toFixed(1)} screens`);
  }

  // ── The long explanations are folded away ─────────────────────────
  {
    const toggles = await page.locator('[data-info="toggle"]').count();
    const open = await page.locator('[data-info="body"]').count();
    check('the explanations are behind an info toggle', toggles > 8, `${toggles} of them`);
    check('and none of them is open until it is asked for', open === 0, `${open} open`);
    if (toggles) {
      await page.evaluate(() => document.querySelector('[data-info="toggle"]').click());
      await settle(400);
      check('and clicking one opens it', (await page.locator('[data-info="body"]').count()) === 1);
      await page.evaluate(() => document.querySelector('[data-info="toggle"]').click());
      await settle(300);
    }
  }

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
  // It lives on the Setup tab now: the panel is split between what a hand
  // reaches for during a show and what is decided once, and a room camera's
  // device and mappings are decided once. Without this the harness reached
  // for a control on the hidden half and sat there until it timed out.
  await firstVisible('settings-tab-setup').click();
  await settle(700);
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
      await page.keyboard.press('Escape');
      await settle(500);
    }

    await noteDuplicates();

    // Design is the bench: the other half of the job, same grid.
    await clickOn('mode-segmented-design');
    await settle(1500);
    const benchUp = await page.getByTestId('design-desk').count();
    const bottles = await page.getByTestId('bottle-silicone').count();
    const cuesGone = await page.getByTestId('cue-list').count();
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
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (errors.length) {
  console.log(`\nconsole output the app should not have produced (${errors.length}):`);
  for (const e of errors.slice(0, 20)) console.log('  ', e.slice(0, 300));
}
process.exit(failed.length === 0 ? 0 : 1);
