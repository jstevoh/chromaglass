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
 *      and not after, fades (not a cut), and is gone from the page
 *   5. a press on the desk leaves it up; a press on it, or a key, takes it away
 *   6. a browser with no WebGPU sees the failure screen, not the intro
 *   7. the remote and a cast never show it, not even before the app has run
 *   8. an app that never arrives: it leaves when the way out appears
 *   9. it holds still while each of the opening's render pipelines
 *      compiles, and moves again once they are done
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
  const at = w.__introAt = { frames: 0, shown: 0, hidden: 0, renders: [], moving: [] };
  /*
    Every render pipeline asked of the GPU, from its ask to its settle, seen
    from outside the app: check 9 holds the intro's frames against the
    opening's. Its own record (`__cgIntro.still`) says only when it meant to
    hold still; this is when the compiles really were under way.
  */
  const make = w.GPUDevice?.prototype?.createRenderPipelineAsync;
  if (make) {
    w.GPUDevice.prototype.createRenderPipelineAsync = function (desc) {
      const r = [performance.now(), null, desc?.label ?? ''];
      at.renders.push(r);
      const p = make.call(this, desc);
      const end = () => { r[1] = performance.now(); };
      p.then(end, end);
      return p;
    };
  }
  const frame = () => {
    const n = ++at.frames;
    const el = document.getElementById('cg-intro');
    const on = !!el && el.isConnected;
    const style = on ? getComputedStyle(el) : null;
    // Up and not leaving: when it was, and whether anything in it was
    // turning on this frame (a paused animation is not).
    if (on && style.display !== 'none' && !el.classList.contains('cg-out')) {
      at.moving.push([performance.now(), el.getAnimations({ subtree: true }).some((a) => a.playState === 'running')]);
    }
    // Seen and showing, or there and hidden by the page itself: the remote
    // and a cast must have the second and never the first, on every frame,
    // not only on one that might come after the app has removed it.
    if (on && style.display !== 'none') at.shown++;
    if (on && style.display === 'none') at.hidden++;
    if (n === 1) {
      at.firstFrame = performance.now();
      at.firstFrameIntro = on && style.display !== 'none' && style.opacity === '1';
    }
    if (at.leaving === undefined && at.shown > 0 && (!on || el.classList.contains('cg-out'))) { at.leaving = n; at.leavingAt = performance.now(); }
    /*
      The fade, as the page started it: a transition on opacity, and how
      long. Not its opacity frame by frame: on a software plate the first
      steps stall the page's frames for a second and a half just after it
      starts, so samples of it were a coin flip between four readings of 1
      and one of 0.94 (the compositor runs it whether or not they come).
    */
    if (at.leaving !== undefined && on && at.fade === undefined) {
      const t = el.getAnimations().find((a) => a.transitionProperty === 'opacity');
      if (t) at.fade = { ms: +t.effect.getTiming().duration, to: +getComputedStyle(el).getPropertyValue('opacity') };
    }
    if (at.leaving !== undefined && !on && at.goneAt === undefined) at.goneAt = performance.now();
    if (at.stepped === undefined) {
      const f = w.chromaglassDebug?.()?.fluids?.[0];
      if (f && typeof f.stepCount !== 'number') at.noCount = true;
      if ((f?.stepCount ?? 0) > 0) { at.stepped = n; at.steppedAt = performance.now(); }
    }
    // Every frame until the intro has gone from the page and the plate has
    // stepped (or three seconds of frames on a page that never shows it).
    const done = at.goneAt !== undefined && at.stepped !== undefined;
    if (!done && !(at.shown === 0 && performance.now() - at.firstFrame > 3000) && n < 20000) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};

/** One opening of `query`; `prep` runs in the page before anything else. */
async function open(query, { viewport = { width: 1440, height: 900 }, phone = false, slow = false, prep = null } = {}) {
  const context = await browser.newContext({ viewport, ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}) });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`   page error: ${e.message}`));
  // What the app says of its own opening ("ChromaGlass: …", a warning when
  // the pipelines were not all built ahead), kept to print beside a failure.
  page.cgSaid = [];
  page.on('console', (m) => { if (/ChromaGlass/.test(m.text())) page.cgSaid.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
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
    leaving: !!el && el.classList.contains('cg-out'),
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
      // Held still is still its animation: the opening may be compiling.
      if (a.playState !== 'running' && a.playState !== 'paused') continue;
      n++;
      for (const k of a.effect.getKeyframes()) for (const p of Object.keys(k)) if (!['offset', 'computedOffset', 'easing', 'composite'].includes(p)) props.add(p);
    }
    return { n, props: [...props] };
  });
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'desk-opening.png') });
  // The plate's first step, and the fade, for up to a minute and a half (a
  // software plate compiles slowly).
  const stepped = await waitFor(page, () => window.__introAt?.stepped !== undefined && window.__introAt?.goneAt !== undefined, null, 90000);
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
  /*
    Seen from outside, every frame: the frame the lead plate's step count
    first went above nought, the first frame the intro was leaving, the
    first it was off the page, and its opacity in between. The fade is
    0.9 s; the bound on its being gone is three, because a software
    plate's frames can stall a second and a half while it compiles, and
    what it guards is "it went", not the fade's length. A cut would start
    no transition, or one of no length.
  */
  const leftOnStep = stepped && !at.noCount && at.leaving >= at.stepped && at.leaving - at.stepped <= 1;
  const faded = at.fade !== undefined && at.fade.ms >= 500;
  const goneIn = at.goneAt !== undefined && at.goneAt - at.leavingAt <= 3000;
  check('4. it leaves on the frame the plate first steps, fades, and is gone from the page',
    leftOnStep && faded && goneIn && !after.there,
    `${at.noCount ? 'no stepCount on the lead plate to read; ' : ''}${stepped ? `plate stepped on frame ${at.stepped} (${s(at.steppedAt)}), intro leaving on frame ${at.leaving} (${s(at.leavingAt)}) for "${rec.reason}"` : 'the plate never stepped, or the intro never went'}; ${at.fade ? `a ${at.fade.ms} ms fade on opacity` : 'no fade started'}; gone ${at.goneAt !== undefined ? `${Math.round(at.goneAt - at.leavingAt)} ms after` : 'never'}`);
  /*
    Still through the opening's render compiles. What it guards (run
    37233245217): with the intro turning, a frame needs the GPU process, and
    on CI's Mac it waited there behind the display's compile, 2.82 s with
    no frame at all. Software WebGPU does not stall so, so what is held
    here is the cause and not the stall: no frame in which anything of the
    intro was running while one of the opening's render pipelines was
    compiling, and some such frame seen (a check that saw none measured
    nothing). The opening's are those asked from its start until it was
    done (`prepareLog`); what is built later, behind a plate already
    drawing, is not the intro's to wait for. And it moved again: every
    stretch it held still was let go, and once the compiles were done it
    turned on some frame before it left (or left within two frames of the
    last of them).
  */
  await waitFor(page, () => !!window.chromaglassDebug?.()?.pipelines?.()?.prepares?.some((x) => x.stage === 'opening'), null, 10000);
  const log = await page.evaluate(() => {
    const d = window.chromaglassDebug?.();
    const all = d?.pipelines?.()?.prepares;
    const p = all?.find((x) => x.stage === 'opening');
    return { opening: p ? { at: p.at, end: p.at + p.ms } : null, stages: all ? all.map((x) => x.stage) : null, debug: d ? Object.keys(d).length : null, pipelines: typeof d?.pipelines };
  });
  const opening = log.opening;
  if (!opening) console.log(`     no opening to read: ${log.debug ?? 'no'} debug keys, pipelines ${log.pipelines}, prepares ${JSON.stringify(log.stages)}; ${at.renders?.length ?? 0} render compiles seen in all; the app said ${JSON.stringify(page.cgSaid)}`);
  const renders = opening ? (at.renders ?? []).filter(([a]) => a >= opening.at && a <= opening.end) : [];
  const inCompile = (t) => renders.some(([a, e]) => t > a && (e === null || t < e));
  const during = (at.moving ?? []).filter(([t]) => inCompile(t));
  const lastEnd = renders.length && renders.every(([, e]) => e !== null) ? Math.max(...renders.map(([, e]) => e)) : null;
  const afterward = lastEnd === null ? [] : (at.moving ?? []).filter(([t]) => t > lastEnd);
  const stills = rec.still ?? [];
  const letGo = stills.length > 0 && stills.every(([, e]) => e !== null);
  // One at a time, as the opening has always asked for them (`renderBusy` in
  // gpu/prepare.ts): the hold must not let the lanes ask for several at once.
  const sorted = [...renders].sort((a, b) => a[0] - b[0]);
  const overlaps = sorted.filter((r, i) => i > 0 && (sorted[i - 1][1] === null || sorted[i - 1][1] > r[0])).length;
  check('9. it holds still while the opening\'s render pipelines compile, one at a time, and moves again after',
    overlaps === 0 && renders.length > 0 && during.length > 0 && during.every(([, m]) => !m) && letGo && lastEnd !== null
      && (afterward.some(([, m]) => m) || afterward.length <= 2),
    `${renders.length} render compiles in the opening${opening ? '' : ' (no opening in the prepare log)'}, ${overlaps} asked while another compiled; ${during.length} frames up during them, ${during.filter(([, m]) => m).length} of them moving; held still ${stills.map(([a, e]) => `${s(a)}–${e === null ? 'never let go' : s(e)}`).join(', ') || 'never'}; ${afterward.filter(([, m]) => m).length} of ${afterward.length} frames moving after the last`);
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
    /*
      The dock's buttons drawn over the intro, read in paint order. The intro
      takes no presses, so a hit test looks straight through it and would
      call the dock "over" it wherever it was drawn: for the reading only,
      the intro is made a target, and the topmost thing at each of the
      dock's buttons must still be the button. Every one, and at least one:
      the phone has a dock by design, and finding none is not a pass.
    */
    const el = document.getElementById('cg-intro');
    const r = el?.getBoundingClientRect();
    if (!r) return null;
    const buttons = [...document.querySelectorAll('button')].filter((b) => {
      const q = b.getBoundingClientRect();
      const x = q.left + q.width / 2, y = q.top + q.height / 2;
      return q.width > 0 && q.height > 0 && x > r.left && x < r.right && y > r.top && y < r.bottom;
    });
    const probe = document.createElement('style');
    probe.textContent = '#cg-intro, #cg-intro * { pointer-events: auto !important; }';
    document.head.append(probe);
    let under = 0;
    for (const b of buttons) {
      const q = b.getBoundingClientRect();
      const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
      if (!hit || el.contains(hit) || !b.contains(hit)) under++;
    }
    probe.remove();
    return { buttons: buttons.length, under };
  });
  check('3b. on a phone it is in the plate\'s frame, the plate\'s size, and under the dock',
    up.inPlate && sameRect(up.rect, up.frame) && !up.hitIsIntro && !!dock && dock.buttons > 0 && dock.under === 0,
    `intro ${up.rect?.join(',')} vs frame ${up.frame?.join(',')}; the centre is ${up.hit}; ${dock ? `${dock.buttons} of the dock's buttons over the plate, ${dock.under} of them under the intro` : 'no intro to read'}`);
  await page.context().close();
}

// ── Taken away early: a GPU that never answers, so the plate never comes ──
const hang = () => {
  const gpu = globalThis.GPU?.prototype;
  if (gpu) gpu.requestAdapter = () => new Promise(() => {});
};
{
  const page = await open('?debug&look=classic', { prep: hang });
  const adopted = await waitFor(page, () => !!document.querySelector('[data-testid="plate-frame"] #cg-intro'), null, 30000);
  const before = await intro(page);
  if (!adopted || !before.frame) throw new Error('intro: the intro never went into the plate\'s frame with the GPU held, so 5 has nothing to press');
  // A press on the desk, away from the plate's frame.
  const f = before.frame;
  const desk = f && f[0] > 40 ? [Math.round(f[0] / 2), Math.round(before.window[1] - 20)] : null;
  // At 1440 the plate is framed in the desk: a desk with nowhere to press
  // beside the plate is a failure of this check, not a pass.
  let deskLeft = 'no desk beside the plate to press';
  if (desk) {
    // Somewhere on the desk that is not a control: its own background.
    const spot = await page.evaluate(([x, y]) => { const h = document.elementFromPoint(x, y); return h && !h.closest('button,input,select,a,[role="slider"],[role="button"]') ? 'bare' : h?.tagName; }, desk);
    if (spot === 'bare') {
      await page.mouse.click(desk[0], desk[1]);
      await page.waitForTimeout(1300);
      const after = await intro(page);
      deskLeft = after.there && !after.leaving ? null : 'it went';
    } else deskLeft = `no bare desk at ${desk.join(',')} (${spot})`;
  }
  await page.mouse.click(f[0] + f[2] / 2, f[1] + f[3] / 2);
  await page.waitForTimeout(1300);
  const pressed = await intro(page);
  check('5. a press on the desk leaves it up, a press on it takes it away',
    before.inPlate && deskLeft === null && pressed.record.reason === 'skip' && !pressed.there,
    `after the desk's press: ${deskLeft === null ? 'still up' : deskLeft}; after a press on it: ${pressed.record.reason ?? 'still up'}${pressed.there ? ', still on the page' : ''}`);
  await page.context().close();

  const keyed = await open('?debug&look=classic', { prep: hang });
  const keyedUp = await waitFor(keyed, () => !!document.querySelector('[data-testid="plate-frame"] #cg-intro'), null, 30000);
  await keyed.keyboard.press('Shift');
  await keyed.waitForTimeout(1300);
  const sh = await intro(keyed);
  await keyed.keyboard.press('Escape');
  await keyed.waitForTimeout(1300);
  const k = await intro(keyed);
  check('5b. a key takes it away (Shift alone does not)',
    keyedUp && sh.there && !sh.leaving && !k.there && k.record.reason === 'skip',
    `${keyedUp ? 'up in the plate' : 'NEVER up in the plate'}; after Shift: ${sh.there && !sh.leaving ? 'still up' : 'went'}; after Escape: ${k.there ? 'still on the page' : `gone ("${k.record.reason}")`}`);
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
/*
  On the slowed network, so the page draws frames before its entry has run:
  there the intro is in the page and hidden by `index.html`'s own script,
  which is the claim, and not merely already taken out by the app. Read on
  every frame, not one: shown on any frame is a failure.
*/
for (const q of ['?remote=1', '?cast=true']) {
  const page = await open(q, { slow: true });
  await page.waitForLoadState('load');
  await waitFor(page, () => window.__cgIntro?.out !== undefined, null, 30000);
  await page.waitForTimeout(500);
  const r = await intro(page);
  check(`7. ${q} never shows it, not even before the app has run`,
    r.at.frames > 0 && r.at.shown === 0 && r.at.hidden > 0 && !r.there && r.record.reason === 'elsewhere',
    `${r.at.frames} frames read: shown on ${r.at.shown}, there and hidden on ${r.at.hidden}; ${r.there ? 'still on the page' : 'gone'}${r.record.reason ? ` ("${r.record.reason}")` : ''}`);
  await page.context().close();
}

// ── The app that never arrives ────────────────────────────────────────
/*
  main.tsx's Loading turns into a "Clear the cache and reload" button after
  eight seconds of an app chunk that has not come. The intro sits over that
  rectangle, so it must leave when the button comes, or the way out is
  under it.
*/
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.route(/\/assets\/App-[^/]*\.js$/, () => { /* never answered */ });
  await page.addInitScript(instruments);
  await page.goto(`${base}/?look=classic`, { waitUntil: 'domcontentloaded' });
  const slowShown = await waitFor(page, () => [...document.querySelectorAll('button')].some((b) => /Clear the cache/.test(b.textContent ?? '')), null, 20000);
  await page.waitForTimeout(1300);
  const r = await intro(page);
  const onTop = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /Clear the cache/.test(x.textContent ?? ''));
    const q = b?.getBoundingClientRect();
    const hit = q ? document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2) : null;
    return !!hit && !!b && b.contains(hit);
  });
  check('8. an app that never arrives: the intro leaves when the way out appears',
    slowShown && onTop && r.at.shown > 0 && !r.there,
    `button ${slowShown ? (onTop ? 'up and on top' : 'up but covered') : 'never shown'}; intro shown on ${r.at.shown} frames, ${r.there ? 'still on the page' : `then gone ("${r.record.reason ?? 'no record'}")`}`);
  await context.close();
}

await browser.close();
server.close();
const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} of ${checks.length} FAILED` : `\nall ${checks.length} ok`);
process.exit(failed ? 1 : 0);
