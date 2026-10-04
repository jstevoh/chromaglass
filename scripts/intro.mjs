#!/usr/bin/env node
/**
 * Does the intro cover the opening, and only the opening?
 *
 *   npm run intro          (software WebGPU off a Mac: a plate to wait on)
 *
 * What was asked: an intro on the first load that covers the latency of
 * what loads behind it (src/lib/intro.ts). The plate is black on its
 * starting frame for as long as the opening's pipelines compile, nine to
 * seventeen seconds on CI's Mac with the shader cache empty (PLAN.md 14v),
 * and the window is black before that while the app downloads. The intro is
 * drawn by `index.html` so that it paints first, is taken into the plate's
 * frame when the app is up, and fades on the plate's first frame.
 *
 * The built site is served on a slowed network, as `npm run loadtime`
 * serves it, so that "before the app has arrived" is a stretch of time and
 * not a tie. What is judged is the feature, never how long a runner took:
 *
 *   1. the first frame the page draws has the intro in it, before the app's
 *      chunk has arrived
 *   2. it moves only by transform and opacity, which the compositor runs
 *      while the page's thread is held, and it does move
 *   3. once the app is up it is in the plate's frame and the plate's size,
 *      on the desk and on a phone, and never what a press lands on
 *   4. it starts to leave on the frame the plate first steps, not before
 *      and not after, and is gone from the page within its fade
 *   5. a press on the desk leaves it up; a press on it, or a key, takes it away
 *   6. a browser with no WebGPU sees the failure screen, not the intro
 *   7. the remote and a cast never show it, not even on their first frame
 *
 * And it prints how much of the wait it covered: from the first paint to
 * the plate's first step, the share of that time the intro was up.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

const checks = [];
const check = (n, ok, d = '') => { checks.push({ ok: !!ok }); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

const DIST = resolve(process.env.INTRO_DIST ?? 'dist');
/** Pictures of each opening, when asked for: INTRO_SHOTS=<dir>. */
const SHOTS = process.env.INTRO_SHOTS ? resolve(process.env.INTRO_SHOTS) : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const RTT_MS = 100;
const DOWN_MBPS = 10;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(DIST, path);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await launchChromium(chromium);

/*
  Read from the page every frame, from before its first: whether the intro
  was in that frame and showing, the first frame the lead plate had stepped,
  and the first frame the intro was leaving. Frames are counted, not timed:
  a software plate's frames are hundreds of milliseconds apart, and "the
  same frame" is the claim.
*/
const instruments = () => {
  const w = window;
  const at = w.__introAt = { frames: 0 };
  const frame = () => {
    const n = ++at.frames;
    const el = document.getElementById('cg-intro');
    if (n === 1) {
      at.firstFrame = performance.now();
      at.firstFrameIntro = !!el && el.isConnected && getComputedStyle(el).display !== 'none' && getComputedStyle(el).opacity === '1';
    }
    if (at.leaving === undefined && (!el || el.classList.contains('cg-out'))) { at.leaving = n; at.leavingAt = performance.now(); }
    if (at.stepped === undefined) {
      const steps = w.chromaglassDebug?.()?.fluids?.[0]?.stepIndex ?? 0;
      if (steps > 0) { at.stepped = n; at.steppedAt = performance.now(); }
    }
    if (at.stepped === undefined || at.leaving === undefined || n < 3) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};

/** One opening of `query`; `prep` runs in the page before anything else. */
async function open(query, { viewport = { width: 1440, height: 900 }, phone = false, slow = false, prep = null } = {}) {
  const context = await browser.newContext({ viewport, ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}) });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`   page error: ${e.message}`));
  if (slow) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: RTT_MS, downloadThroughput: DOWN_MBPS * 1e6 / 8, uploadThroughput: 2e6 / 8 });
  }
  if (prep) await page.addInitScript(prep);
  await page.addInitScript(instruments);
  await page.goto(`${base}/${query}`, { waitUntil: 'domcontentloaded' });
  return page;
}

const intro = (page) => page.evaluate(() => {
  const el = document.getElementById('cg-intro');
  const frame = document.querySelector('[data-testid="plate-frame"]');
  const r = el?.getBoundingClientRect();
  // The frame's inside: on the desk it has a one-pixel border.
  const b = frame?.getBoundingClientRect();
  const f = b ? { left: b.left + frame.clientLeft, top: b.top + frame.clientTop, width: frame.clientWidth, height: frame.clientHeight } : null;
  const hit = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
  return {
    there: !!el && el.isConnected,
    inPlate: !!el && !!frame && frame.contains(el),
    rect: r ? [r.left, r.top, r.width, r.height].map(Math.round) : null,
    frame: f ? [f.left, f.top, f.width, f.height].map(Math.round) : null,
    window: [innerWidth, innerHeight],
    hitIsIntro: !!hit && !!el && el.contains(hit),
    hit: hit ? `${hit.tagName.toLowerCase()}${hit.id ? '#' + hit.id : ''}` : null,
    record: { ...(window.__cgIntro ?? {}) },
    at: { ...(window.__introAt ?? {}) },
  };
});
const waitFor = async (page, fn, arg, ms) => { try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); return true; } catch { return false; } };
const s = (ms) => (ms === undefined || ms === null ? 'never' : `${(ms / 1000).toFixed(2)} s`);
const sameRect = (a, b) => !!a && !!b && a.every((v, i) => Math.abs(v - b[i]) <= 1);

console.log(`intro: ${DIST}, the desk over ${RTT_MS} ms round trips at ${DOWN_MBPS} Mb/s`);

// ── The desk, on the slowed network ───────────────────────────────────
{
  const page = await open('?debug&look=classic', { slow: true });
  // Taken in by the plate's frame once the app is up.
  await waitFor(page, () => !!document.querySelector('[data-testid="plate-frame"] #cg-intro') || !document.getElementById('cg-intro'), null, 60000);
  const up = await intro(page);
  const anims = await page.evaluate(() => {
    const el = document.getElementById('cg-intro');
    if (!el) return null;
    const props = new Set();
    let n = 0;
    for (const a of el.getAnimations({ subtree: true })) {
      if (a.playState !== 'running') continue;
      n++;
      for (const k of a.effect.getKeyframes()) for (const p of Object.keys(k)) if (!['offset', 'computedOffset', 'easing', 'composite'].includes(p)) props.add(p);
    }
    return { n, props: [...props] };
  });
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'desk-opening.png') });
  // The plate's first step, and the fade, for up to a minute and a half (a
  // software plate compiles slowly).
  const stepped = await waitFor(page, () => window.__introAt?.stepped !== undefined && window.__introAt?.leaving !== undefined, null, 90000);
  await page.waitForTimeout(1500);
  const after = await intro(page);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'desk-plate.png') });
  const timing = await page.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
    const app = performance.getEntriesByType('resource').find((e) => /\/assets\/App-[^/]*\.js$/.test(new URL(e.name).pathname));
    return { fcp, appIn: app?.responseEnd };
  });
  const at = after.at;
  const rec = after.record;
  check('1. the intro is in the first frame the page draws, before the app has arrived',
    at.firstFrameIntro === true && timing.appIn !== undefined && at.firstFrame < timing.appIn,
    `first frame at ${s(at.firstFrame)} ${at.firstFrameIntro ? 'with' : 'WITHOUT'} the intro, the app in at ${s(timing.appIn)}; first contentful paint ${s(timing.fcp)}`);
  const compositor = anims && anims.n >= 4 && anims.props.every((p) => p === 'transform' || p === 'opacity');
  check('2. it moves, and only by transform and opacity',
    compositor, anims ? `${anims.n} running, animating ${anims.props.join(', ') || 'nothing'}` : 'gone before the app was up');
  check('3. on the desk it is in the plate\'s frame, the plate\'s size, and no press lands on it',
    up.inPlate && sameRect(up.rect, up.frame) && !up.hitIsIntro,
    `in the frame: ${up.inPlate}; intro ${up.rect?.join(',')} vs frame ${up.frame?.join(',')} in a ${up.window.join('×')} window; the centre is ${up.hit}`);
  const leftOnStep = stepped && rec.reason === 'plate' && at.leaving >= at.stepped && at.leaving - at.stepped <= 1;
  check('4. it leaves on the frame the plate first steps, and is gone within its fade',
    leftOnStep && !after.there && rec.gone !== undefined && rec.gone - rec.out <= 1200,
    `${stepped ? `plate stepped on frame ${at.stepped} (${s(at.steppedAt)}), intro leaving on frame ${at.leaving} (${s(at.leavingAt)}) for "${rec.reason}"` : 'the plate never stepped'}; gone ${rec.gone !== undefined ? `${Math.round(rec.gone - rec.out)} ms after` : 'never'}`);
  // How much of the wait it covered: from the first paint to the plate's
  // first step, it was up from the first paint until it began to leave.
  if (timing.fcp !== undefined && at.steppedAt !== undefined && rec.out !== undefined) {
    const wait = at.steppedAt - timing.fcp;
    const covered = Math.min(rec.out, at.steppedAt) - timing.fcp;
    console.log(`     covered ${s(covered)} of the ${s(wait)} from the first paint to the plate's first step (${Math.round(100 * covered / Math.max(1, wait))} %); taken into the plate at ${s(rec.adopted)}`);
  }
  await page.context().close();
}

// ── The phone ─────────────────────────────────────────────────────────
{
  const page = await open('?debug&look=classic', { viewport: { width: 390, height: 844 }, phone: true });
  await waitFor(page, () => !!document.querySelector('[data-testid="plate-frame"] #cg-intro') || !document.getElementById('cg-intro'), null, 60000);
  const up = await intro(page);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'phone-opening.png') });
  const dock = await page.evaluate(() => {
    // Whatever of the phone's controls is drawn over the plate: still drawn
    // over it with the intro up.
    const el = document.getElementById('cg-intro');
    const r = el?.getBoundingClientRect();
    if (!r) return null;
    for (let y = r.bottom - 4; y > r.top; y -= 8) {
      const hit = document.elementFromPoint(r.left + r.width / 2, y);
      if (hit && hit.closest('button')) return { y: Math.round(y), over: !el.contains(hit) };
    }
    return null;
  });
  check('3b. on a phone it is in the plate\'s frame, the plate\'s size, and under the dock',
    up.inPlate && sameRect(up.rect, up.frame) && !up.hitIsIntro && (dock ? dock.over : true),
    `intro ${up.rect?.join(',')} vs frame ${up.frame?.join(',')}; the centre is ${up.hit}; ${dock ? `a button at y ${dock.y} is ${dock.over ? 'over it' : 'UNDER it'}` : 'no button over the plate found'}`);
  await page.context().close();
}

// ── Taken away early: a GPU that never answers, so the plate never comes ──
const hang = () => {
  const gpu = globalThis.GPU?.prototype;
  if (gpu) gpu.requestAdapter = () => new Promise(() => {});
};
{
  const page = await open('?debug&look=classic', { prep: hang });
  await waitFor(page, () => !!document.querySelector('[data-testid="plate-frame"] #cg-intro'), null, 30000);
  const before = await intro(page);
  // A press on the desk, away from the plate's frame.
  const f = before.frame;
  const desk = f && f[0] > 40 ? [Math.round(f[0] / 2), Math.round(before.window[1] - 20)] : null;
  let deskLeft = null;
  if (desk) {
    // Somewhere on the desk that is not a control: its own background.
    const spot = await page.evaluate(([x, y]) => { const h = document.elementFromPoint(x, y); return h && !h.closest('button,input,select,a,[role="slider"],[role="button"]') ? 'bare' : h?.tagName; }, desk);
    if (spot === 'bare') { await page.mouse.click(desk[0], desk[1]); await page.waitForTimeout(200); deskLeft = (await intro(page)).record.reason ?? null; } else deskLeft = `no bare desk at ${desk.join(',')} (${spot})`;
  }
  await page.mouse.click(f[0] + f[2] / 2, f[1] + f[3] / 2);
  await page.waitForTimeout(1300);
  const pressed = await intro(page);
  check('5. a press on the desk leaves it up, a press on it takes it away',
    before.inPlate && deskLeft === null && pressed.record.reason === 'skip' && !pressed.there,
    `${desk ? `after the desk's press: ${deskLeft === null ? 'still up' : `"${deskLeft}"`}` : 'the plate fills the window, no desk to press'}; after a press on it: ${pressed.record.reason ?? 'still up'}${pressed.there ? ', still on the page' : ''}`);
  await page.context().close();

  const keyed = await open('?debug&look=classic', { prep: hang });
  await waitFor(keyed, () => !!document.querySelector('[data-testid="plate-frame"] #cg-intro'), null, 30000);
  await keyed.keyboard.press('Shift');
  const shift = (await intro(keyed)).record.reason ?? null;
  await keyed.keyboard.press('Escape');
  await keyed.waitForTimeout(200);
  const k = await intro(keyed);
  check('5b. a key takes it away (Shift alone does not)',
    shift === null && k.record.reason === 'skip',
    `after Shift: ${shift ?? 'still up'}; after Escape: ${k.record.reason ?? 'still up'}`);
  await keyed.context().close();
}

// ── No WebGPU at all ──────────────────────────────────────────────────
{
  const page = await open('?debug&look=classic', { prep: () => { try { delete Navigator.prototype.gpu; } catch { /* */ } } });
  const shown = await waitFor(page, () => !!document.querySelector('[data-testid="needs-webgpu"]'), null, 30000);
  await page.waitForTimeout(1300);
  const r = await intro(page);
  const seen = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="needs-webgpu"]');
    const b = el?.getBoundingClientRect();
    const hit = b ? document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) : null;
    return !!hit && !!el && el.contains(hit);
  });
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'no-webgpu.png') });
  check('6. with no WebGPU the failure screen shows, and the intro has gone',
    shown && seen && !r.there && r.record.reason === 'failure',
    `failure screen ${shown ? (seen ? 'up and on top' : 'up but covered') : 'never shown'}; intro ${r.there ? 'still on the page' : 'gone'} for "${r.record.reason ?? 'nothing'}"`);
  await page.context().close();
}

// ── The remote and a cast ─────────────────────────────────────────────
for (const q of ['?remote=1', '?cast=true']) {
  const page = await open(q);
  await page.waitForLoadState('load');
  await page.waitForTimeout(1500);
  const r = await intro(page);
  check(`7. ${q} never shows it`,
    r.at.firstFrame !== undefined && r.at.firstFrameIntro === false && !r.there && r.record.reason === 'elsewhere',
    `first frame ${r.at.firstFrameIntro ? 'WITH' : 'without'} it; ${r.there ? 'still on the page' : 'gone'}${r.record.reason ? ` ("${r.record.reason}")` : ''}`);
  await page.context().close();
}

await browser.close();
server.close();
const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} of ${checks.length} FAILED` : `\nall ${checks.length} ok`);
process.exit(failed ? 1 : 0);
