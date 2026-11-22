#!/usr/bin/env node
/**
 * A picture palette recolours the plate that is playing (PLAN 43d-6).
 *
 *   npm run pictureplate      (needs a plate that draws: CI's macOS runner)
 *
 * What was reported: a cover set as the palette (PLAN 43d, "Palette from a
 * picture or video") switched the harmony to the four picture dyes, and the
 * swatches and the engine's harmony both said so, but a minute later the
 * plate still showed the look's own colours. Measured on Classic with The
 * Starry Night as the cover (pale blues, greys and olive against Classic's
 * pink, magenta, yellow and blue), the share of the plate's lit pixels whose
 * hue is nearer one of the picture's four dyes than any of the look's six:
 * 0% before the cover, then 7.7%, 7.4%, 7.3%, 5.7% and 5.1% at 2, 15, 30, 60
 * and 90 seconds. The pours did use the picture's dyes; the dye already laid
 * stays on a lit plate for minutes, and a full plate gave the new pours no
 * room. So every line that only read the lock (`phoneDye.mjs` reads the
 * engine's harmony) was green on a plate that never changed colour.
 *
 * This asks the plate itself. A cover of four blocks is made in the page in
 * teals and greens, hues Classic has none of (its six are Sunshine Yellow,
 * Amber, Hot Pink, Magenta, Ultramarine and Blue Cheer), so a pixel's hue
 * says which palette it came from. Each lit, coloured pixel of the plate read
 * back is classed by the direction of its chroma (its colour less its grey):
 * nearer a picture dye's direction or nearer a look dye's. Then, on the
 * laptop's Perform desk (the Dyes panel's button) and on the phone's own
 * layout (the Dye sheet's), each asserted:
 *
 *   before        the plate is the look's: under 30% of its lit pixels are
 *                 nearer the picture. This is what keeps the lines below
 *                 honest: a classifier that called every pixel "picture", or
 *                 a cover in hues the look already has, is red here.
 *   the lock      the engine's harmony is the four picture slots (24 to 27),
 *                 and the frame read back was a real read of the plate
 *                 (`lastFrameRead`), not a fallback.
 *   20 s on       over half the lit pixels are nearer the picture (7% before
 *                 the fix), and the plate is still lit: at least half the lit
 *                 share it had before (a recolour that drained the plate to
 *                 black would pass a share of nothing).
 *   45 s on       still over half and still lit: the recolour holds after
 *                 it has finished, and nothing the plate does next (its
 *                 regulator's doses, a re-seed) brings the look back. (play=0
 *                 only opens the phone on its stage screen; the plate runs.)
 *
 * What makes it able to fail: the dyes it judges by are read from the engine
 * (paletteRgb), and each must have real chroma, so a picture slot left at its
 * starting grey cannot score nothing and hand every odd pixel to the picture;
 * the picture's dyes must also lie within 30 degrees of hue of a cover colour.
 * The look's harmony is asserted before the cover, the picture's at each read,
 * and "before" must be a lit plate (40%), so a dark plate cannot be both the
 * control and the floor the after-reads are held to.
 *
 * Why a share of hue and not a distance in RGB: the plate's colours are lit,
 * thinned and mixed (a dye is darker where it is thin and the plate shader
 * lights it through the glass), so a pixel is rarely near any dye's own RGB.
 * The direction of its chroma survives that: thinning and lighting scale it,
 * and only mixing with another dye turns it. Mixing is also why the bar is
 * "over half" and not "nearly all": Classic's yellow over its blue is green,
 * and the before line measures how much of that a look plate already shows.
 *
 * Where no plate draws (a Linux box without `PW_WEBGPU`) there is nothing to
 * read back, so the lines are printed as skipped there, never passed;
 * `PICTUREPLATE_PLATE=1` runs them anyway. With `PW_WEBGPU` a cloud session's
 * plate draws a frame every few seconds and a recolour of eight seconds is a
 * few steps of the solver, so the lines run there and the 20 s one is likely
 * red: the Mac's run is the one that says.
 */
import { chromium } from 'playwright';
import { launchChromium, presentsInXvfb, port } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery, frameOf, installFrameReader, lastFrameRead, settlePlate, waitForEngine } from './frame.mjs';

const PORT = port(4367, 'PICTUREPLATE_PORT');
const PLATE = process.platform === 'darwin' || !!process.env.PICTUREPLATE_PLATE
  || (process.platform === 'linux' && !!process.env.PW_WEBGPU);
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const LAPTOP = { viewport: { width: 1418, height: 703 }, touch: false };
const PHONE = { viewport: { width: 390, height: 844 }, touch: true };
const CASES = [
  { name: 'laptop', screen: LAPTOP },
  { name: 'phone', screen: PHONE },
];
// Classic's harmony (src/presets): the look's six dyes in PALETTE_RGB.
const LOOK_DYES = [0, 17, 2, 20, 18, 8];
const PICTURE_SLOTS = [24, 25, 26, 27];
// Teal, green, emerald and turquoise: none of them near a Classic dye's hue.
const COVER = ['#00a096', '#1eb43c', '#00c878', '#00b4b4'];
const BEFORE_MAX = 0.3, AFTER_MIN = 0.5, LIT_KEEP = 0.5, BEFORE_LIT = 0.4, MIN_LIT_PX = 300;
// A dye whose chroma is under this has no hue to judge by (the slots start grey 0.5).
const MIN_CHROMA = 0.05, HUE_COS = Math.cos(Math.PI / 6);
const AT = [20, 45];

if (!PLATE) {
  for (const c of CASES) console.log(`skip  ${c.name} — no plate draws here; held on the Mac (PICTUREPLATE_PLATE=1 to run anyway)`);
  process.exit(0);
}

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
await new Promise((r) => setTimeout(r, 2500));

/** The plate's lit share and the share of its lit pixels nearer the picture's hues. */
async function plateHues(page) {
  const W = 120, H = 120;
  const px = await frameOf(page, W, H);
  const read = await lastFrameRead(page);
  if (!px) return { ok: false, read };
  const harmony = await page.evaluate(() => Array.from(window.chromaglassDebug().harmony ?? []));
  return { ok: true, read, px: px.data ?? px, W, H, harmony };
}

const chroma = ([r, g, b]) => {
  const y = 0.3 * r + 0.59 * g + 0.11 * b;
  return [r - y, g - y, b - y];
};
const dir = (rgb) => {
  const v = chroma(rgb);
  const n = Math.hypot(...v);
  if (!(n > 1e-6)) throw new Error(`no hue in ${rgb.map((x) => x.toFixed(2)).join(',')}`);
  return v.map((x) => x / n);
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function classify(shot, lookRgb, picRgb) {
  const L = lookRgb.map(dir), P = picRgb.map(dir);
  const best = (S, d) => Math.max(...S.map((s) => dot(s, d)));
  let lit = 0, pic = 0;
  for (let i = 0; i < shot.W * shot.H; i++) {
    const r = shot.px[i * 4] / 255, g = shot.px[i * 4 + 1] / 255, b = shot.px[i * 4 + 2] / 255;
    const y = 0.3 * r + 0.59 * g + 0.11 * b;
    if (y < 0.08) continue;
    const c = Math.hypot(r - y, g - y, b - y);
    if (c < 0.04) continue;
    lit++;
    const d = dir([r, g, b]);
    if (best(P, d) > best(L, d)) pic++;
  }
  return { lit: lit / (shot.W * shot.H), pic: lit ? pic / lit : 0, n: lit };
}
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

const browser = await launchChromium(chromium, { present: true });
let failed = 0;
try {
  for (const c of CASES) {
    const ctx = await browser.newContext({
      viewport: c.screen.viewport, isMobile: c.screen.touch, hasTouch: c.screen.touch, deviceScaleFactor: c.screen.touch ? 2 : 1,
    });
    const page = await ctx.newPage();
    if (presentsInXvfb()) page.setDefaultTimeout(300_000);
    await installFrameReader(page);
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
    await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic&play=0${engineQuery()}`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.chromaglassDebug === 'function', null, { timeout: 60_000 });
    await waitForEngine(page);
    // Let Classic lay and light its own plate first, so "before" is a look's plate and not a blank one.
    await settlePlate(page, 12_000);
    const phone = await page.evaluate(() => !!document.querySelector('[data-testid="phone-stage"]'));
    check(`${c.name}: the page is ${c.screen.touch ? 'the phone layout' : "the laptop's layout, not the phone's"}`,
      c.screen.touch ? phone : !phone, phone ? 'phone-stage present' : 'no phone-stage');

    const before = await plateHues(page);
    check(`${c.name}: before the cover the engine's harmony is Classic's`,
      String(before.harmony) === String(LOOK_DYES), `harmony ${before.harmony?.join(',')}`);

    // The cover, made here so its colours are known (as phoneDye.mjs does).
    const cover = await page.evaluate((fills) => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      const g = cv.getContext('2d');
      fills.forEach((f, i) => { g.fillStyle = f; g.fillRect((i % 2) * 32, Math.floor(i / 2) * 32, 32, 32); });
      return cv.toDataURL('image/png').split(',')[1];
    }, COVER);
    const file = { name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from(cover, 'base64') };
    if (c.screen.touch) {
      await page.getByTestId('phone-open-dye').first().tap();
      await page.getByTestId('phone-picture-palette-input').setInputFiles(file);
      await page.locator('[data-testid="phone-sheet-dye"] button', { hasText: 'From picture' }).waitFor({ timeout: 15_000 });
      await page.getByTestId('phone-sheet-scrim').tap({ position: { x: 20, y: 20 } });
    } else {
      await page.getByTestId('picture-palette-input').first().setInputFiles(file);
    }
    const t0 = Date.now();
    await page.waitForFunction((slots) => String(window.chromaglassDebug?.()?.harmony) === String(slots), PICTURE_SLOTS, { timeout: 15_000 }).catch(() => {});

    const shots = [];
    for (const t of AT) {
      await settlePlate(page, Math.max(0, t * 1000 - (Date.now() - t0)));
      shots.push(await plateHues(page));
    }
    const last = shots[shots.length - 1];
    // The dyes the engine draws with, from the engine itself: the look's and the cover's, once set.
    const rgb = await page.evaluate(([look, pic]) => {
      const p = window.chromaglassDebug().paletteRgb?.();
      return p ? { look: look.map((i) => p[i]), pic: pic.map((i) => p[i]) } : null;
    }, [LOOK_DYES, PICTURE_SLOTS]);
    const hued = (d) => Math.hypot(...chroma(d)) >= MIN_CHROMA;
    const lookDyes = rgb?.look?.every((d) => d && hued(d)) ? rgb.look : null;
    const coverDirs = COVER.map((h) => dir(hex(h)));
    const picDyes = rgb?.pic?.every((d) => d && hued(d) && coverDirs.some((cd) => dot(dir(d), cd) >= HUE_COS)) ? rgb.pic : null;

    check(`${c.name}: the engine's harmony is the picture's four dyes at every read, and the plate was read back`,
      shots.every((s) => String(s.harmony) === String(PICTURE_SLOTS)) && before.ok && shots.every((s) => s.ok) && !!lookDyes,
      `harmony ${shots.map((s) => s.harmony?.join(',')).join(' / ')}; reads ${[before, ...shots].map((s) => s.read?.via ?? 'none').join(', ')}${rgb ? '' : '; no paletteRgb hook'}`);
    check(`${c.name}: the picture's dyes are the cover's colours (real chroma, within 30° of a cover hue)`, !!picDyes,
      rgb?.pic ? rgb.pic.map((d) => d?.map((x) => x.toFixed(2)).join(',')).join(' | ') : 'no picture dyes read');
    if (!before.ok || !shots.every((s) => s.ok) || !lookDyes || !picDyes) { await ctx.close(); continue; }

    const b = classify(before, lookDyes, picDyes);
    check(`${c.name}: before the cover the plate is lit, in the look's colours`, b.pic < BEFORE_MAX && b.lit >= BEFORE_LIT,
      `${pct(b.pic)} of the lit pixels nearer the picture (under ${pct(BEFORE_MAX)}), ${pct(b.lit)} lit (at least ${pct(BEFORE_LIT)})`);
    AT.forEach((t, i) => {
      const a = classify(shots[i], lookDyes, picDyes);
      check(`${c.name}: ${t} s after the cover the plate is the picture's colours, and still lit`,
        a.pic > AFTER_MIN && a.lit >= b.lit * LIT_KEEP && a.n >= MIN_LIT_PX,
        `${pct(a.pic)} of the lit pixels nearer the picture (over ${pct(AFTER_MIN)}); ${pct(a.lit)} lit, at least ${pct(b.lit * LIT_KEEP)} (${a.n} px, at least ${MIN_LIT_PX})`);
    });
    await ctx.close();
  }
} catch (err) {
  check('the run completed', false, String(err?.message ?? err));
  failed = 1;
} finally {
  await browser.close();
  stop();
}

const bad = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - bad}/${checks.length} checks passed`);
process.exit(bad || failed ? 1 : 0);
