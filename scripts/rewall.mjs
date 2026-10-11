#!/usr/bin/env node
/**
 * Does the wall come back after the show reloads?
 *
 *   npm run rewall        # builds, then about half a minute
 *
 * S15 (docs/stability-plan.md). The projector window belongs to the browser,
 * not to the show's page: F5, Boot's "clear the cache and reload",
 * `startOver()` after a stale chunk, or a crash replace the show's page and
 * leave the popup standing with the same `opener`, which a reload does not
 * close. What went with the old page was everything that tied the two
 * together. Measured on main before the fix: after `page.reload()` the new
 * show had no `__chromaglassMirror` (the hook the wall's frames come
 * through), its `isCasting` was false, the wall said nothing and held its
 * last frame for good, and Send to wall opened a second projector window
 * beside the stranded one.
 *
 * What is asked, in this order:
 *
 *   before     the wall opened from the show (the palette's Send the show to
 *              a window, the real sender path, not a hand-made popup) is the
 *              mirror, and the show holds it: casting, with the hook on it
 *   reload     the show reloaded: within a second of the new page's app
 *              being up, the hook is the wall's again, the show is casting
 *              again, and it has heard the wall's size, which it renders for
 *   dark       the wall went dark while the show was away, rather than
 *              holding the old page's last frame
 *   frames     where a GPU draws (the Mac), the new show's frames reach the
 *              wall and it is lit again; here the app has no plate and draws
 *              nothing to send, so this is printed, not asked
 *   held       Send to wall on the reloaded show brings the same window
 *              forward, opening no second one and not loading this one
 *              again, which is the proof the show holds that window and not
 *              merely a flag
 *   let go     closing the wall by hand is noticed by the reloaded show, as
 *              it was by the one that opened it
 *
 * The controls are the lines themselves, asked before the reload as well as
 * after: a hook or a flag that was never set fails "before", and a wall
 * never taken back fails every line after the reload (main reads false on
 * the casting line, none on the hook, and on "held" the stranded wall
 * loaded again under the reused window name).
 *
 * No GPU needed: the projector window mirrors the show's canvas element
 * (CastDisplay's StageMirror) whether or not anything is drawn in it, as
 * `npm run showcursor` relies on too.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { launchChromium } from './chromium.mjs';

const PORT = Number(process.env.REWALL_PORT ?? 4191);
const ORIGIN = `http://localhost:${PORT}`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const notes = [];
async function serve() {
  const proc = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview',
    '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
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
const stopServer = (proc) => { try { process.kill(-proc.pid, 'SIGTERM'); } catch { proc.kill('SIGTERM'); } };

/** The show's side: whether it holds a wall, the hook the wall's frames come through, the size it heard. */
const showSays = (show) => show.evaluate(() => {
  const st = typeof window.chromaglassCastState === 'function' ? window.chromaglassCastState() : null;
  return {
    up: !!st,
    casting: st?.isCasting ?? null,
    stage: st?.stage ?? null,
    hook: typeof window.__chromaglassMirror === 'function',
  };
}).catch(() => ({ up: false, casting: null, stage: null, hook: false }));   // mid-navigation

const wallSays = (wall) => wall.evaluate(() => window.chromaglassCast?.() ?? null).catch(() => null);

/** Send the show to a window, as the palette (⌘K) does it on any desk. */
async function sendToWall(show) {
  await show.keyboard.press('Control+k');
  await show.waitForSelector('[data-testid="palette-input"]', { timeout: 10_000 });
  await show.evaluate(() => {
    const input = document.querySelector('[data-testid="palette-input"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'send the show');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  });
  await show.waitForSelector('[data-testid="palette-row-open-wall"]', { timeout: 10_000 });
  await show.keyboard.press('Enter');
}

const server = await serve();
const browser = await launchChromium(chromium);
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const show = await context.newPage();
  show.setDefaultTimeout(60_000);
  await show.goto(`${ORIGIN}/?debug&look=classic&dpr=0.35`, { waitUntil: 'networkidle' });
  await show.waitForSelector('#liquid-canvas', { timeout: 30_000 });

  // ── Before: the wall opened the way the operator opens it ─────────
  const popup = context.waitForEvent('page', { timeout: 15_000 });
  await sendToWall(show);
  const wall = await popup;
  wall.setDefaultTimeout(60_000);
  await wall.waitForSelector('[data-testid="cast-display"]', { timeout: 30_000 });
  await show.waitForTimeout(1200);
  const w0 = await wallSays(wall);
  const s0 = await showSays(show);
  check('the wall Send to wall opens is the mirror, and the show holds it with the hook on it',
    w0?.mode === 'mirror' && s0.casting === true && s0.hook && !!s0.stage && w0?.darkened === 0 && w0?.reattached === 0,
    `wall ${w0?.mode ?? 'no debug hook'}; show casting ${s0.casting}, hook ${s0.hook}, stage ${s0.stage ? `${s0.stage.width}×${s0.stage.height}` : 'unheard'}; dark ${w0?.darkened ?? '?'} and taken back ${w0?.reattached ?? '?'} time(s) so far`);
  const paints0 = w0?.paints ?? 0;

  // ── The reload ────────────────────────────────────────────────────
  // Timed from the new page's app being up (its debug hook defined), not
  // from the reload: the bundle's load is the network's and the build's, and
  // the claim is about what happens once there is a show to go back to.
  await show.reload({ waitUntil: 'domcontentloaded' });
  let upAt = null, backAt = null, last = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 30_000) {
    last = await showSays(show);
    if (last.up && upAt === null) upAt = Date.now();
    if (last.up && last.casting && last.hook && last.stage) { backAt = Date.now(); break; }
    if (upAt !== null && Date.now() - upAt > 3000) break;
    await show.waitForTimeout(50);
  }
  const took = upAt !== null && backAt !== null ? (backAt - upAt) / 1000 : null;
  const w1 = await wallSays(wall);
  check('within a second of the reloaded show being up, the wall is its own again: casting, the hook back, the wall\'s size heard',
    took !== null && took <= 1,
    took !== null ? `${took.toFixed(2)} s; taken back ${w1?.reattached ?? '?'} time(s)`
      : `after ${upAt === null ? 'the app never came up' : `${((Date.now() - upAt) / 1000).toFixed(1)} s`}: casting ${last?.casting}, hook ${last?.hook}, stage ${last?.stage ? 'heard' : 'unheard'}; the wall taken back ${w1?.reattached ?? '?'} time(s)`);
  check('the wall went dark while the show was away, rather than holding the old page\'s last frame',
    (w1?.darkened ?? 0) > (w0?.darkened ?? 0), `dark ${w1?.darkened ?? '?'} time(s), ${w0?.darkened ?? '?'} before the reload`);

  // Where a GPU draws, the reloaded show's frames reach the wall and light it.
  await show.waitForTimeout(1500);
  const w2 = await wallSays(wall);
  if (paints0 > 0) {
    check('and the reloaded show\'s frames reach the wall and light it again',
      (w2?.paints ?? 0) > (w1?.paints ?? 0) && w2?.dark === false,
      `${(w2?.paints ?? 0) - (w1?.paints ?? 0)} frames in 1.5 s; ${w2?.dark ? 'still dark' : 'lit'}`);
  } else {
    console.log(` --   no frames reached the wall before the reload here (${paints0}): the show draws none without a GPU, so whether they come back is the Mac's to ask`);
  }

  // ── Held: the same window, not a second one ───────────────────────
  /*
    The same page, not only the same window. Main read 0 new windows here
    too: the window is opened by name, the name's counter starts again with
    the reloaded page, and `window.open` with a name already taken navigates
    that window instead of opening one, so the stranded wall was quietly
    loaded afresh. A mark left on the wall's page says whether it was.
  */
  await wall.evaluate(() => { window.__cgSameWall = true; });
  const pagesBefore = context.pages().length;
  await sendToWall(show);
  await show.waitForTimeout(1500);
  const pagesAfter = context.pages().length;
  const same = await wall.evaluate(() => window.__cgSameWall === true).catch(() => false);
  check('Send to wall on the reloaded show brings the same wall forward, neither opening a second one nor loading this one again',
    pagesAfter === pagesBefore && !wall.isClosed() && same,
    `${pagesAfter - pagesBefore} new window(s); ${same ? 'the same page' : 'the wall was loaded again'}`);
  for (const p of context.pages()) if (p !== show && p !== wall) await p.close();

  // ── Let go: closing the wall by hand ──────────────────────────────
  // Casting just before, or a show that never took the wall back passes at once.
  const castingBefore = (await showSays(show)).casting === true;
  await wall.close();
  let gone = null;
  const t1 = Date.now();
  while (Date.now() - t1 < 3000) {
    const s = await showSays(show);
    if (s.casting === false) { gone = (Date.now() - t1) / 1000; break; }
    await show.waitForTimeout(50);
  }
  check('closing the wall by hand is noticed by the reloaded show within a second', castingBefore && gone !== null && gone <= 1,
    !castingBefore ? 'the show was not casting before the close' : gone !== null ? `${gone.toFixed(2)} s` : 'still casting after 3 s');
} catch (err) {
  check('the run completed', false, String(err).split('\n')[0]);
} finally {
  await browser.close();
  stopServer(server);
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} wall-reload checks passed`);
process.exit(failed.length ? 1 : 0);
