/**
 * The bug bash: every look, every panel and every control, turned end to
 * end, and a list of what broke.
 *
 *   npm run bugbash                               the looks, then the desk, then the phone, then the films and the report
 *   BUGBASH_PART=looks npm run bugbash            every look, opened as a person opens one
 *   BUGBASH_PART=desk npm run bugbash             every panel's every control, on the desk
 *   BUGBASH_PART=phone npm run bugbash            every button, sheet and control on the phone layout
 *   BUGBASH_PART=film npm run bugbash             a short film of each high or medium finding, replayed
 *   BUGBASH_PART=report npm run bugbash           the findings, grouped by area, as findings.md
 *   BUGBASH_OUT=dir                               where it all goes (default bugbash/)
 *   BUGBASH_LOOKS=classic,galaxy                  just these looks (the looks part), or the looks the desk is swept on
 *   BUGBASH_TABS=1,2                              just these of the seeded desk tabs (seven of six panels each)
 *   BUGBASH_LIMIT=5                               at most this many controls a tab or a sheet (a smoke run)
 *
 * Asked for (the owner, 2026-11-26): "an automated bug bash". The checks we
 * have each ask one thing of one part: `controls` asks whether the settings
 * a desk can pin are visible and come back, `looks` whether every look is a
 * picture, `qa` whether a show night's path holds together, `phone` whether
 * a thumb can reach everything. None of them presses every button. A panel
 * the desk ships with has switches, menus and buttons that are not settings
 * at all (a sheet's opener, a loop's Play, a bottle's swatch), and nothing
 * has ever pressed most of them to see whether the plate survives.
 *
 * So this is not a check. It never fails and never gates anything: it
 * writes what it saw, and a person (or the agent that runs it) reads the
 * list. That is deliberate. A sweep this wide meets every quirk of every
 * panel, and a gate built on it would be quarantined within a week. A
 * report that says "these eleven things look wrong, here is a film of each"
 * is what turns into fixes.
 *
 * What counts as wrong, judged on numbers about the whole frame and the
 * page, never on pixels (the plate is chaotic):
 *
 *   crash, hung     the page died, or stopped answering for twenty seconds
 *   freeze          the page drew no frame in half a second, or the solver took no step
 *   slow            under 20 frames a second where the look ran at over 40
 *   black, flat     the plate went to black, or to one colour, from a picture
 *   NaN             a cell of the plate that is not a number
 *   bad value       a setting that is not a finite number, or past a million
 *   error           an uncaught exception or a console error, new since the action
 *   no way back     a switch pressed twice does not put its settings back
 *   dead            turned end to end (or pressed), it changed no setting, no
 *                   part of the page and nothing on the plate
 *   unseen          it changed a setting, and the plate did not move past its own drift
 *
 * The last two are the weak ones and say so (low): a setting can be for the
 * sound, the MIDI or the wall, and a button can do its work somewhere this
 * cannot see. They are listed for a person to read, not to be fixed blind.
 *
 * Every part opens its own browser through `launchChromium`, so each waits
 * for a deploy on the owner's Mac to finish and takes the Mac's film queue
 * (one film at a time) for as long as it runs. Run the parts one after the
 * other, never side by side: the queue would make the second wait anyway.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launchChromium, port } from './chromium.mjs';
import { untilMacDeployDone } from './macdeploy.mjs';
import { PRESETS } from '../src/presets.ts';
import { PANELS } from '../src/lib/deskLayout.ts';
import { TABS_KEY } from '../src/lib/deskTabs.ts';
import { engineQuery, installFrameReader, frameOf, stepsNow } from './frame.mjs';
import { readingOf } from './judge.mjs';

const PORT = port(4351, 'BUGBASH_PORT');
const OUT = process.env.BUGBASH_OUT ?? 'bugbash';
const PART = process.env.BUGBASH_PART ?? 'all';
const WAIT = Number(process.env.BUGBASH_WAIT ?? 1500);
const SETTLE = Number(process.env.BUGBASH_SETTLE ?? 8000);
const LIMIT = Number(process.env.BUGBASH_LIMIT ?? Infinity);
const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null);
const LOOKS = list(process.env.BUGBASH_LOOKS);
const TABS = list(process.env.BUGBASH_TABS)?.map(Number);
fs.mkdirSync(path.join(OUT, 'films'), { recursive: true });

/*
  What is never pressed. Each of these leaves the app, spends something,
  throws away the owner's work or reaches past this browser (a stream, a
  purchase, a mail). The sweep runs on a fresh profile, so nothing here
  could reach the owner's account, but a Go Live that opens a stream or a
  Delete that removes the panel under the sweep makes every line after it
  about a different page. The panel's own chrome (close, fold, dock, float)
  is the desk's, and the `desk` check already owns it.
*/
const DENY = /\b(delete|remove|reset|clear all|erase|wipe|forget|sign ?(in|out|up)|log ?(in|out)|buy|upgrade|purchase|subscribe|checkout|licen[cs]e|go live|stream|broadcast|record|export|download|save as|share|send|feedback|report|quit|reload|update|install|unlink|unpair|pair|close|fold|unfold|dock|undock|float|pop ?out|new window|own window|open in|calibrate|fullscreen|full screen)\b/i;

const W = 160, H = 100;
const METRICS = ['luma', 'colours', 'flat', 'motion', 'detail', 'cast'];
// The least change a person would call a change (controls.mjs's floor).
const FLOOR = { luma: 0.02, colours: 0.03, flat: 0.03, motion: 0.003, detail: 0.004, cast: 0.02 };

// ---------------------------------------------------------------- the server

let server = null;
async function serve() {
  server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
    { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
  server.on('exit', (code) => { if (server) { console.error(`preview server exited (${code})`); process.exit(2); } });
  await new Promise((r) => setTimeout(r, 2500));
}
const stop = () => { const s = server; server = null; if (s) try { process.kill(-s.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });

// ---------------------------------------------------------------- the page

/*
  Seven tabs of six panels, so every panel the desk has is out on one of
  them: two in each column and two on the deck. A person's desk never looks
  like this, and it does not need to; what is under test is each panel's
  body, which draws the same wherever it is docked.
*/
const TAB_PANELS = [];
for (let i = 0; i < PANELS.length; i += 6) TAB_PANELS.push(PANELS.slice(i, i + 6).map((p) => p.id));
const seededTabs = () => JSON.stringify({ v: 1, tabs: TAB_PANELS.map((ids, i) => ({
  id: `bugbash-${i + 1}`, name: `Bash ${i + 1}`,
  layout: { left: ids.slice(0, 2), right: ids.slice(2, 4), deck: ids.slice(4), floating: [], collapsed: [], plateMode: 'live' },
})) });

const findings = [];
const coverage = [];
let seq = 0;

async function openApp(browser, { look, phone = false, tabs = false, video = null }) {
  const ctx = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone,
    ...(video ? { recordVideo: { dir: video, size: phone ? { width: 390, height: 844 } : { width: 960, height: 600 } } } : {}),
  });
  // Nothing leaves this machine: a button that would reach a server reaches nothing.
  await ctx.route('**/*', (r) => (/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(r.request().url()) || r.request().url().startsWith('data:')
    ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  // A press that opens a window (a store page, a help link) opens nothing this sweep has to follow.
  ctx.on('page', (p) => { if (p !== page) p.close().catch(() => {}); });
  const sink = { errors: [], crashed: false };
  page.on('pageerror', (e) => sink.errors.push(`exception: ${String(e.message ?? e).split('\n')[0].slice(0, 200)}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // The environment talking, not the app: what a blocked request prints, and the software renderer's perf notes.
    if (/ERR_FAILED|ERR_BLOCKED|net::|Failed to load resource|GPU stall|GroupMarkerNotSet/i.test(t)) return;
    sink.errors.push(`console: ${t.split('\n')[0].slice(0, 200)}`);
  });
  page.on('crash', () => { sink.crashed = true; });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.addInitScript(([seed, key]) => {
    try { sessionStorage.setItem('chromaglass-audio-source', 'simulated'); } catch { /* private window */ }
    if (seed) try { localStorage.setItem(key, seed); localStorage.setItem('chromaglass-desk-mode', 'bugbash-1'); } catch { /* private window */ }
    window.__bbFrames = 0;
    const tick = () => { window.__bbFrames++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    /*
      What changed on the page, other than what is always changing. A clock,
      a level meter and a beat dot change every second; `__bbQuiet` marks
      everything that moved in a moment with nothing touched, and the count
      after an action leaves those out, the control itself, and its tooltip.
    */
    const noisy = new WeakSet();
    let learning = false, count = 0;
    window.__bbLearn = (on) => { learning = on; };
    window.__bbCount = () => { const c = count; count = 0; return c; };
    new MutationObserver((ms) => {
      for (const m of ms) {
        const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        if (!t) continue;
        if (learning) { noisy.add(t); continue; }
        if (noisy.has(t) || t.closest?.('[data-bb-active],[role=tooltip]')) continue;
        if (m.type === 'attributes' && m.attributeName === 'data-bb-active') continue;
        count++;
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  }, [tabs ? seededTabs() : null, TABS_KEY]);
  await installFrameReader(page);
  const url = `http://localhost:${PORT}/?debug&gpu=strong&tier=local&look=${look}${phone ? '&phone' : ''}${engineQuery()}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.mouse.click(phone ? 195 : 8, phone ? 120 : 8);   // the gesture the simulated band needs
  await page.waitForTimeout(SETTLE);
  await page.evaluate(() => { window.__bbLearn(true); });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { window.__bbLearn(false); window.__bbCount(); });
  return { ctx, page, sink, url };
}

/** An evaluate that cannot hang the sweep: a page that does not answer in 20 s is a finding. */
const ask = (page, fn, arg) => Promise.race([
  page.evaluate(fn, arg),
  new Promise((_, no) => setTimeout(() => no(new Error('hung')), 20_000)),
]);

/** Everything a fault is judged on, at one moment. */
async function snap(page, { fps = true } = {}) {
  try {
    const settings = await ask(page, () => {
      const s = window.chromaglassDebug?.().settings;
      return s ? JSON.parse(JSON.stringify(s, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? `#${v}` : v))) : null;
    });
    const nan = await ask(page, () => (window.chromaglassDebug?.().plateStats?.() ?? []).reduce((n, p) => n + (p.nan ?? 0), 0));
    const s0 = await stepsNow(page);
    const frames = fps ? await ask(page, async () => { const a = window.__bbFrames; await new Promise((r) => setTimeout(r, 500)); return (window.__bbFrames - a) * 2; }) : null;
    const s1 = fps ? await stepsNow(page) : null;
    const a = await frameOf(page, W, H);
    await page.waitForTimeout(150);
    const b = await frameOf(page, W, H);
    const reading = a && b ? readingOf(a, b, W, H) : null;
    const dom = await ask(page, () => window.__bbCount());
    return { settings, nan, fps: frames, stepped: s0 == null || s1 == null ? null : s1 > s0, reading, dom };
  } catch (e) {
    return { hung: true, why: String(e.message ?? e) };
  }
}

/** How far the picture moved between two readings, in units of the look's own drift. */
function plateMoved(a, b, noise) {
  if (!a?.reading || !b?.reading) return null;
  let best = 0;
  for (const m of METRICS) best = Math.max(best, Math.abs(b.reading[m] - a.reading[m]) / Math.max(FLOOR[m], 2 * (noise?.[m] ?? 0)));
  return best;
}
const settingsChanged = (a, b) => {
  if (!a?.settings || !b?.settings) return [];
  return Object.keys(b.settings).filter((k) => JSON.stringify(a.settings[k]) !== JSON.stringify(b.settings[k]));
};

/** The faults one snapshot shows, against the look as it was before anything was touched. */
function faultsOf(s, base, sink, errorsBefore) {
  const out = [];
  if (sink.crashed) out.push({ kind: 'crash', sev: 'high' });
  if (s.hung) { out.push({ kind: 'hung', sev: 'high', detail: s.why }); return out; }
  if (s.fps === 0 || (s.stepped === false && base.stepped)) out.push({ kind: 'freeze', sev: 'high', detail: `${s.fps} fps, solver ${s.stepped === false ? 'took no step' : 'stepping'}` });
  else if (s.fps != null && s.fps < 20 && (base.fps ?? 0) > 40) out.push({ kind: 'slow', sev: 'med', detail: `${s.fps} fps, was ${base.fps}` });
  if (s.reading && base.reading) {
    if (s.reading.luma < 0.015 && base.reading.luma > 0.04) out.push({ kind: 'black', sev: 'high', detail: `luma ${base.reading.luma.toFixed(3)}→${s.reading.luma.toFixed(3)}` });
    else if (s.reading.flat > 0.85 && base.reading.flat < 0.6) out.push({ kind: 'flat', sev: 'med', detail: `flat ${(base.reading.flat * 100).toFixed(0)}%→${(s.reading.flat * 100).toFixed(0)}%` });
  }
  if (s.nan > 0) out.push({ kind: 'NaN', sev: 'high', detail: `${s.nan} cells` });
  const bad = Object.entries(s.settings ?? {}).filter(([, v]) => (typeof v === 'string' && /^#(NaN|-?Infinity)$/.test(v)) || (typeof v === 'number' && Math.abs(v) > 1e6));
  if (bad.length) out.push({ kind: 'bad value', sev: 'med', detail: bad.map(([k, v]) => `${k}=${v}`).join(', ').slice(0, 200) });
  const fresh = sink.errors.slice(errorsBefore);
  if (fresh.length) out.push({ kind: 'error', sev: fresh.some((e) => e.startsWith('exception')) ? 'high' : 'med', detail: [...new Set(fresh)].slice(0, 3).join(' | ') });
  return out;
}

function note(area, control, look, layout, faults, extra = {}) {
  for (const f of faults) {
    const id = `bb-${String(++seq).padStart(3, '0')}`;
    findings.push({ id, area, control, look, layout, ...f, ...extra });
    console.log(`    ${f.sev.toUpperCase().padEnd(4)} ${f.kind.padEnd(10)} ${area} › ${control}${f.detail ? `  (${f.detail})` : ''}`);
  }
}

// ---------------------------------------------------------------- controls

/*
  Every control in `scope` that a person could reach: visible, enabled, not
  on the deny list. Each is tagged on the page (`data-bb`) so it can be found
  again after a re-render, and named as a person would name it: its label,
  else its text. `nth` tells apart two of the same name in one panel (each
  bottle's Pour), which is how the film part finds it again.
*/
const enumerate = (page, scopeSel, skipTagged) => ask(page, ([scope, skip, denySrc]) => {
  const deny = new RegExp(denySrc, 'i');
  const roots = scope ? [...document.querySelectorAll(scope)] : [document.body];
  const sel = 'input[type=range], select, input[type=checkbox], [role=switch], [aria-pressed], [role=checkbox], [role=radio], [role=tab], button';
  const out = [];
  const seen = new Map();
  /*
    A row of aria-pressed buttons of which exactly one is pressed is a
    pick-one-of-many (the phone's look picker, a tool row), not a set of
    switches: pressing the chosen one again keeps it chosen, which is right.
    The 2026-11-26 run judged 41 look buttons and the phone's Drop as "no way
    back" for that reason (QA-33b-5 gives those rows radio roles; this keeps
    any row still marked aria-pressed from reading as broken until then).
  */
  const pickOne = (el) => {
    const row = [...(el.parentElement?.children ?? [])].filter((x) => x.hasAttribute('aria-pressed'));
    return row.length >= 3 && row.filter((x) => x.getAttribute('aria-pressed') === 'true').length === 1;
  };
  for (const root of roots) {
    for (const el of root.querySelectorAll(sel)) {
      if (skip && el.hasAttribute('data-bb')) continue;
      if (el.closest('[aria-hidden=true],[inert]') || el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
      const r = el.getBoundingClientRect();
      // A range drawn as a knob is an invisible input over an svg: its box still has a size.
      if (r.width < 2 || r.height < 2) continue;
      const panelEl = el.closest('[data-panel]');
      const panel = panelEl?.getAttribute('data-panel') ?? '';
      const lab = el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.getAttribute('title') || el.textContent || '';
      const name = lab.replace(/\s+/g, ' ').trim().slice(0, 48) || `(${el.tagName.toLowerCase()} unnamed)`;
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role');
      const kind = tag === 'input' && el.type === 'range' ? 'range'
        : tag === 'select' ? 'select'
        : (tag === 'input' && el.type === 'checkbox') || role === 'switch' || role === 'checkbox' || (el.hasAttribute('aria-pressed') && !pickOne(el)) ? 'toggle'
        : role === 'radio' || role === 'tab' ? 'choice' : 'button';
      // The desk's own tab strip is how the sweep moves; a tab inside a panel is the panel's.
      if (role === 'tab' && !panelEl) continue;
      if (kind !== 'range' && deny.test(name)) { out.push({ skipped: true, panel, name, kind }); continue; }
      const k = `${panel}|${name}|${kind}`;
      const nth = seen.get(k) ?? 0; seen.set(k, nth + 1);
      const id = `${out.length}-${Math.random().toString(36).slice(2, 7)}`;
      el.setAttribute('data-bb', id);
      out.push({ id, panel, name, kind, nth, options: kind === 'select' ? [...el.options].map((o) => o.value).slice(0, 12) : undefined, value: kind === 'select' ? el.value : undefined });
    }
  }
  return out;
}, [scopeSel, skipTagged, DENY.source]);

/** Turn, press or choose one control, end to end, and say what it did. */
async function sweepOne(app, c, base, area, look, layout) {
  const { page, sink } = app;
  const loc = page.locator(`[data-bb="${c.id}"]`);
  if (!(await loc.count())) return 'gone';
  await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await loc.evaluate((el) => el.setAttribute('data-bb-active', '')).catch(() => {});
  const label = `${c.name}${c.nth ? ` #${c.nth + 1}` : ''} (${c.kind})`;
  const e0 = sink.errors.length;
  const before = await snap(page, { fps: false });
  const replay = { panel: c.panel, name: c.name, kind: c.kind, nth: c.nth };
  let faults = [], did = { settings: [], dom: 0, plate: 0, read: false };
  const add = (s) => {
    for (const k of settingsChanged(before, s)) if (!did.settings.includes(k)) did.settings.push(k);
    did.dom += s.dom ?? 0;
    const moved = plateMoved(before, s, base.noise);
    if (moved != null) did.read = true;
    did.plate = Math.max(did.plate, moved ?? 0);
    for (const f of faultsOf(s, base, sink, e0)) if (!faults.some((g) => g.kind === f.kind)) faults.push(f);
  };
  try {
    if (c.kind === 'range') {
      await loc.focus();
      await page.keyboard.press('End'); await page.waitForTimeout(WAIT);
      const hi = await snap(page); add(hi);
      await page.keyboard.press('Home'); await page.waitForTimeout(WAIT);
      const lo = await snap(page); add(lo);
      // End against Home: the setting it moved, and whether the plate told them apart.
      did.plate = Math.max(did.plate, plateMoved(hi, lo, base.noise) ?? 0);
      for (const k of settingsChanged(hi, lo)) if (!did.settings.includes(k)) did.settings.push(k);
    } else if (c.kind === 'select') {
      for (const v of c.options) {
        await loc.selectOption(v).catch(() => {});
        await page.waitForTimeout(Math.min(WAIT, 900));
        add(await snap(page, { fps: false }));
      }
      add(await snap(page));
      await loc.selectOption(c.value).catch(() => {});
    } else if (c.kind === 'toggle') {
      await loc.click({ timeout: 3000 }); await page.waitForTimeout(WAIT);
      add(await snap(page));
      await loc.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(WAIT);
      const back = await snap(page, { fps: false }); add(back);
      const stuck = settingsChanged(before, back);
      if (stuck.length) faults.push({ kind: 'no way back', sev: 'med', detail: `pressed twice, still changed: ${stuck.slice(0, 6).join(', ')}` });
    } else {
      await loc.click({ timeout: 3000 }); await page.waitForTimeout(WAIT);
      add(await snap(page));
    }
  } catch (e) {
    coverage.push({ area, control: label, note: `could not: ${String(e.message ?? e).split('\n')[0].slice(0, 120)}` });
  }
  /*
    Dead and unseen are claims about the plate, so they are made only when
    the plate was read: with no WebGPU (a cloud session) every frame is
    unread, and "the plate did not move" would be true of every control.
  */
  if (!faults.length && did.read) {
    const plateSaw = did.plate >= 1;
    if (!did.settings.length && !did.dom && !plateSaw && c.kind !== 'choice') {
      faults.push({ kind: 'dead', sev: 'low', detail: `${c.kind === 'range' ? 'End and Home' : 'pressed'}: no setting, no page change, plate ×${did.plate.toFixed(1)} of its drift` });
    } else if (did.settings.length && !plateSaw && c.kind === 'range') {
      faults.push({ kind: 'unseen', sev: 'low', detail: `moved ${did.settings.slice(0, 4).join(', ')}; plate ×${did.plate.toFixed(1)} of its drift` });
    }
  }
  note(area, label, look, layout, faults, { replay, settings: did.settings.slice(0, 8) });
  // Put the look back as it was, so the next control starts from the same plate.
  await loc.evaluate((el) => el.removeAttribute('data-bb-active')).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  if (before.settings) await ask(page, (s) => window.chromaglassSettings?.(s), before.settings).catch(() => {});
  if (faults.some((f) => f.kind === 'crash' || f.kind === 'hung')) return 'dead page';
  /*
    Putting the settings back does not put the liquid back. Rides' Drain (and
    any Clear or Empty) takes the dye off the plate, and on 2026-11-26 every
    control after Drain on its tab was judged against the drained plate:
    about fifty "flat 19%→97%" findings across Dyes, Bottles, Recipe and the
    Mixer, all one number, none of them those controls' fault. So when the
    plate still reads black or flat against the tab's baseline once the
    settings are back, the page is opened again before the next control.
  */
  if (did.read) {
    await page.waitForTimeout(300);
    const after = await snap(page, { fps: false });
    if (faultsOf(after, base, { errors: [] }, 0).some((f) => f.kind === 'black' || f.kind === 'flat')) return 'emptied the plate';
  }
  return did.read ? 'ok' : 'ok, plate not read';
}

/** The look's own drift with nothing touched, and how it runs: what every action is judged against. */
async function baseline(page) {
  const a = await snap(page), b = await snap(page, { fps: false }), c = await snap(page, { fps: false });
  const noise = {};
  for (const m of METRICS) noise[m] = a.reading && b.reading && c.reading
    ? Math.max(Math.abs(b.reading[m] - a.reading[m]), Math.abs(c.reading[m] - b.reading[m])) : 0;
  return { ...a, noise };
}

// ---------------------------------------------------------------- the parts

async function partLooks(browser) {
  const looks = LOOKS ?? PRESETS.map((p) => p.id);
  console.log(`\n  looks: ${looks.length}, each its own page`);
  for (const look of looks) {
    await untilMacDeployDone('the bug bash');
    const app = await openApp(browser, { look });
    const base = await baseline(app.page);
    const later = await (async () => { await app.page.waitForTimeout(20_000); return snap(app.page); })();
    const faults = faultsOf(base, { fps: 60, reading: { luma: 1, flat: 0 } }, app.sink, 0);
    // A look that opens black or flat is judged against a picture, not against itself.
    for (const f of faultsOf(later, base, app.sink, 0)) if (!faults.some((g) => g.kind === f.kind)) faults.push(f);
    if (later.reading && later.reading.motion < 0.0005 && base.reading?.motion < 0.0005) faults.push({ kind: 'still', sev: 'med', detail: 'nothing on the plate moved in 20 s' });
    const r = base.reading;
    console.log(`  ${look}: ${base.fps} fps, luma ${r?.luma.toFixed(3)} flat ${r ? (r.flat * 100).toFixed(0) : '?'}% motion ${r?.motion.toFixed(4)}`);
    note('Looks', look, look, 'desk', faults, { replay: { look: true } });
    coverage.push({ area: 'Looks', control: look, note: 'opened' });
    await app.ctx.close();
  }
}

async function partDesk(browser) {
  const looks = LOOKS ?? ['classic'];
  const names = new Map(PANELS.map((p) => [p.id, p.name]));
  for (const look of looks) {
    for (let t = 0; t < TAB_PANELS.length; t++) {
      if (TABS && !TABS.includes(t + 1)) continue;
      await untilMacDeployDone('the bug bash');
      let app = await openApp(browser, { look, tabs: true });
      const tab = app.page.getByRole('tab', { name: `Bash ${t + 1}` }).first();
      if (t > 0) { await tab.click({ timeout: 5000 }).catch(() => {}); await app.page.waitForTimeout(2500); }
      const mounted = await ask(app.page, () => [...document.querySelectorAll('[data-panel]')].map((e) => e.getAttribute('data-panel'))).catch(() => []);
      for (const id of TAB_PANELS[t]) if (!mounted.includes(id)) {
        note(`Desk › ${names.get(id)}`, '(the panel)', look, 'desk', [{ kind: 'missing', sev: 'med', detail: `seeded on tab ${t + 1}, not drawn` }]);
      }
      let base = await baseline(app.page);
      const controls = (await enumerate(app.page, '[data-panel]', false).catch(() => []));
      let live = controls.filter((c) => !c.skipped).slice(0, LIMIT);
      console.log(`\n  desk tab ${t + 1} on ${look}: ${TAB_PANELS[t].join(', ')}; ${live.length} controls (${controls.filter((c) => c.skipped).length} on the deny list), ${base.fps} fps`);
      for (const c of controls.filter((x) => x.skipped)) coverage.push({ area: `Desk › ${names.get(c.panel) ?? c.panel}`, control: c.name, note: 'not pressed (deny list)' });
      for (let i = 0; i < live.length; i++) {
        const c = live[i];
        const area = `Desk › ${names.get(c.panel) ?? (c.panel || 'desk')}`;
        let r = await sweepOne(app, c, base, area, look, `desk tab ${t + 1}`);
        /*
          A panel that re-renders (a set renamed, a list reordered) drops the
          tags with its nodes. The control is found again by its panel, name,
          kind and place, as the film part finds it, and turned then.
        */
        if (r === 'gone') {
          const again = (await enumerate(app.page, '[data-panel]', false).catch(() => []))
            .find((x) => !x.skipped && x.panel === c.panel && x.name === c.name && x.kind === c.kind && x.nth === c.nth);
          if (again) r = await sweepOne(app, again, base, area, look, `desk tab ${t + 1}`);
        }
        coverage.push({ area, control: `${c.name} (${c.kind})`, note: r });
        if (r === 'dead page') break;
        /*
          The plate is still empty with the settings back (a Drain): a fresh
          page on the same tab, a fresh baseline, and the controls not yet
          swept found again on it by panel, name, kind and place.
        */
        if (r === 'emptied the plate') {
          await app.ctx.close();
          app = await openApp(browser, { look, tabs: true });
          if (t > 0) { await app.page.getByRole('tab', { name: `Bash ${t + 1}` }).first().click({ timeout: 5000 }).catch(() => {}); await app.page.waitForTimeout(2500); }
          base = await baseline(app.page);
          const fresh = (await enumerate(app.page, '[data-panel]', false).catch(() => [])).filter((x) => !x.skipped);
          live = [...live.slice(0, i + 1), ...live.slice(i + 1).map((x) => fresh.find((y) => y.panel === x.panel && y.name === x.name && y.kind === x.kind && y.nth === x.nth) ?? x)];
          console.log(`    (${c.name} left the plate empty: the tab is opened again, ${base.fps} fps)`);
        }
        // A press that took the page somewhere else: back, and the next control is found again.
        if (!app.page.url().startsWith(`http://localhost:${PORT}/`)) { await app.page.goto(app.url).catch(() => {}); await app.page.waitForTimeout(SETTLE); }
      }
      await app.ctx.close();
    }
  }
}

/*
  The phone has no panels: its controls are the tools and the sheet buttons
  under the thumb, and each sheet's controls appear only when it is open. So
  the sweep presses each top-level button on its own fresh page, and when a
  press opens something (new controls on the page) it sweeps those as that
  sheet's, one level deep.
*/
async function partPhone(browser) {
  const look = LOOKS?.[0] ?? 'classic';
  let app = await openApp(browser, { look, phone: true });
  const top = (await enumerate(app.page, null, false)).filter((c) => !c.skipped).slice(0, LIMIT);
  console.log(`\n  phone on ${look}: ${top.length} controls on the first screen`);
  await app.ctx.close();
  for (const t of top) {
    await untilMacDeployDone('the bug bash');
    app = await openApp(browser, { look, phone: true });
    const base = await baseline(app.page);
    const again = (await enumerate(app.page, null, false)).find((c) => c.name === t.name && c.kind === t.kind && c.nth === t.nth);
    if (!again) { coverage.push({ area: 'Phone', control: t.name, note: 'not found again on a fresh page' }); await app.ctx.close(); continue; }
    const r = await sweepOne(app, again, base, 'Phone', look, 'phone');
    coverage.push({ area: 'Phone', control: `${t.name} (${t.kind})`, note: r });
    if (r === 'ok' && t.kind === 'button') {
      await app.page.locator(`[data-bb="${again.id}"]`).click({ timeout: 3000 }).catch(() => {});
      await app.page.waitForTimeout(1200);
      const inner = (await enumerate(app.page, null, true).catch(() => [])).filter((c) => !c.skipped).slice(0, LIMIT);
      if (inner.length) console.log(`    sheet "${t.name}": ${inner.length} controls`);
      for (const c of inner) {
        const rr = await sweepOne(app, c, base, `Phone › ${t.name}`, look, 'phone');
        coverage.push({ area: `Phone › ${t.name}`, control: `${c.name} (${c.kind})`, note: rr });
        if (rr === 'dead page') break;
      }
    }
    await app.ctx.close();
  }
}

/*
  A film of each finding that is not low, replayed on a fresh page with the
  context's recorder on: the look opened, the control found again by its
  panel, name and place, turned or pressed as the sweep did, and the plate
  held for six seconds after. One film at a time, by construction: this part
  is one process holding the Mac's film queue.
*/
async function partFilm(browser) {
  const all = readFindings().filter((f) => f.sev !== 'low');
  const seen = new Set();
  const todo = all.filter((f) => { const k = `${f.area}|${f.control}|${f.layout}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, Number(process.env.BUGBASH_FILMS ?? 30));
  console.log(`\n  films: ${todo.length}`);
  for (const f of todo) {
    await untilMacDeployDone('the bug bash');
    const dir = path.join(OUT, 'films', f.id);
    const phone = f.layout === 'phone';
    const tabN = Number(/desk tab (\d+)/.exec(f.layout ?? '')?.[1] ?? 0);
    const app = await openApp(browser, { look: f.look, phone, tabs: tabN > 0, video: dir });
    try {
      if (tabN > 1) { await app.page.getByRole('tab', { name: `Bash ${tabN}` }).first().click({ timeout: 5000 }).catch(() => {}); await app.page.waitForTimeout(2500); }
      if (f.replay && !f.replay.look) {
        const cs = await enumerate(app.page, phone ? null : '[data-panel]', false);
        const c = cs.find((x) => !x.skipped && x.panel === f.replay.panel && x.name === f.replay.name && x.kind === f.replay.kind && x.nth === f.replay.nth);
        const loc = c && app.page.locator(`[data-bb="${c.id}"]`);
        if (loc) {
          await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
          if (c.kind === 'range') { await loc.focus(); await app.page.keyboard.press('End'); await app.page.waitForTimeout(3000); await app.page.keyboard.press('Home'); }
          else if (c.kind === 'select') for (const v of c.options) { await loc.selectOption(v).catch(() => {}); await app.page.waitForTimeout(900); }
          else await loc.click({ timeout: 3000 }).catch(() => {});
        } else console.log(`    ${f.id}: could not find ${f.replay.name} again`);
      }
      await app.page.waitForTimeout(6000);
    } finally {
      await app.ctx.close();
    }
    const webm = fs.existsSync(dir) ? fs.readdirSync(dir).find((n) => n.endsWith('.webm')) : null;
    if (webm) { fs.renameSync(path.join(dir, webm), path.join(OUT, 'films', `${f.id}.webm`)); fs.rmSync(dir, { recursive: true, force: true }); }
    console.log(`    ${f.id} ${f.kind} ${f.area} › ${f.control}${webm ? '' : '  (no film)'}`);
  }
}

// ---------------------------------------------------------------- the report

function readFindings() {
  const out = [];
  for (const n of fs.readdirSync(OUT).filter((x) => /^findings-.*\.json$/.test(x))) out.push(...JSON.parse(fs.readFileSync(path.join(OUT, n), 'utf8')).findings);
  return out;
}

/*
  Grouped by area, because each area becomes one fix thread. The same
  console error from forty controls is one bug, so errors are folded by
  their text first; the rest are listed worst first.
*/
function partReport() {
  const all = readFindings();
  const cov = [];
  for (const n of fs.readdirSync(OUT).filter((x) => /^findings-.*\.json$/.test(x))) cov.push(...(JSON.parse(fs.readFileSync(path.join(OUT, n), 'utf8')).coverage ?? []));
  const rank = { high: 0, med: 1, low: 2 };
  const films = new Set(fs.existsSync(path.join(OUT, 'films')) ? fs.readdirSync(path.join(OUT, 'films')).map((n) => n.replace(/\.webm$/, '')) : []);
  const lines = [`# Bug bash findings`, '', `Generated by \`npm run bugbash\` (BUGBASH_PART=report). ${all.length} findings over ${cov.length} controls and looks.`, ''];
  const errs = new Map();
  for (const f of all.filter((x) => x.kind === 'error')) {
    for (const d of f.detail.split(' | ')) { const e = errs.get(d) ?? []; e.push(f); errs.set(d, e); }
  }
  if (errs.size) {
    lines.push('## Errors, folded by message', '');
    for (const [msg, fs_] of [...errs].sort((a, b) => b[1].length - a[1].length)) {
      lines.push(`- **${fs_.length}×** \`${msg.replace(/`/g, "'")}\``, `  - first: ${fs_[0].id} ${fs_[0].area} › ${fs_[0].control} on ${fs_[0].look}`);
    }
    lines.push('');
  }
  const areas = new Map();
  for (const f of all) { const a = areas.get(f.area) ?? []; a.push(f); areas.set(f.area, a); }
  const order = [...areas].sort((a, b) => Math.min(...a[1].map((f) => rank[f.sev])) - Math.min(...b[1].map((f) => rank[f.sev])) || b[1].length - a[1].length);
  for (const [area, fs_] of order) {
    const n = { high: 0, med: 0, low: 0 }; for (const f of fs_) n[f.sev]++;
    lines.push(`## ${area}  (${n.high} high, ${n.med} medium, ${n.low} low)`, '', '| id | sev | what | control | look | detail | film |', '|---|---|---|---|---|---|---|');
    for (const f of fs_.sort((a, b) => rank[a.sev] - rank[b.sev])) {
      lines.push(`| ${f.id} | ${f.sev} | ${f.kind} | ${f.control.replace(/\|/g, '/')} | ${f.look} | ${(f.detail ?? '').replace(/\|/g, '/').slice(0, 160)} | ${films.has(f.id) ? `films/${f.id}.webm` : ''} |`);
    }
    lines.push('');
  }
  const notPressed = cov.filter((c) => /not pressed|could not|not found|gone/.test(c.note));
  lines.push('## Not swept', '', `${notPressed.length} controls the sweep skipped or could not reach (the deny list keeps it off anything that spends, streams, deletes or leaves the app):`, '');
  for (const c of notPressed.slice(0, 200)) lines.push(`- ${c.area} › ${c.control}: ${c.note}`);
  fs.writeFileSync(path.join(OUT, 'findings.md'), `${lines.join('\n')}\n`);
  console.log(`\n  ${path.join(OUT, 'findings.md')}: ${all.length} findings in ${areas.size} areas`);
}

// ---------------------------------------------------------------- run

const parts = PART === 'all' ? ['looks', 'desk', 'phone', 'film', 'report'] : [PART];
for (const p of parts) {
  if (p === 'report') { partReport(); continue; }
  if (!['looks', 'desk', 'phone', 'film'].includes(p)) { console.error(`BUGBASH_PART=${p}? looks, desk, phone, film or report`); process.exit(2); }
  findings.length = 0; coverage.length = 0;
  await serve();
  const browser = await launchChromium(chromium);
  try {
    if (p === 'looks') await partLooks(browser);
    if (p === 'desk') await partDesk(browser);
    if (p === 'phone') await partPhone(browser);
    if (p === 'film') await partFilm(browser);
  } finally {
    await browser.close();
    stop();
  }
  if (p !== 'film') {
    const tag = `${p}${LOOKS ? `-${LOOKS.join('+')}` : ''}${TABS ? `-tabs${TABS.join('+')}` : ''}`;
    fs.writeFileSync(path.join(OUT, `findings-${tag}.json`), JSON.stringify({ part: p, at: new Date().toISOString(), findings, coverage }, null, 1));
    console.log(`\n  ${findings.length} findings → ${path.join(OUT, `findings-${tag}.json`)}`);
  }
}
