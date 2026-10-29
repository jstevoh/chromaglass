#!/usr/bin/env node
/**
 * Does every control do something, in the setting where it should matter?
 * (PLAN.md 27d.) Run on a GPU that presents WebGPU: this Mac, or the macOS runner.
 *
 *   npm run sweep                         every control, in its home setting (about an hour)
 *   SWEEP_KEYS=kickBloom,beads npm run sweep    just these
 *   SWEEP_CTX=ferro,oil  npm run sweep    just the controls whose home is one of these
 *   SWEEP_SHARD=2/3                       this runner's share of the settings
 *   SWEEP_OUT=sweep SWEEP_RUN=full        where rows-<run>-<shard>.json and table-<run>.md go (a partial run: another SWEEP_RUN)
 *   npm run sweep -- --table              only fold the rows already in SWEEP_OUT into table.md
 *
 * Why this and not `npm run controls`: that check turns each control to its
 * far end on four looks and asks whether the picture changed. A control that
 * only means something with ferrofluid, oil, a bubble look, a kaleidoscope or
 * a lit LED ring reads "nothing" on every one of those looks, and a control
 * that is really dead reads the same, so the two could not be told apart.
 * Here every control has a HOME: a look and the settings that have to be up
 * for it to matter (the table below, with the reason). It is turned from the
 * look's own value to each end of its range there. A control that is not at
 * home on the plain look is then also turned on the plain look, so the answer
 * can be "only matters with X" rather than "dead".
 *
 * How a reading is judged is `controls.mjs`'s, and for the same reason (the
 * plate is chaotic, so no pixel is compared): six numbers about the whole
 * frame, each judged against the look's own idle drift. What differs:
 *
 *   - a reading is the mean of three frames spread over about two seconds,
 *     because a control that follows the beat (Kick Bloom, Beat Squeeze) shows
 *     in a kick's frame and not in the frame between kicks;
 *   - the idle drift is five of those means with nothing touched, and a
 *     control scores d / max(FLOOR, 2 × noise), as there;
 *   - both ends of the range are measured, not only the farther one: a dial
 *     that is dead above its default and live below it is half dead;
 *   - the simulated band plays throughout (kick, snare, hats, bass, a chord pad
 *     in sections), so kick, bass, hat and melody controls have content.
 *
 * A control is Dead below 1, Weak below 3, Works from 3 up: 3 is the picture
 * moving by half again what the look moves on its own at its quietest bar.
 *
 * Controls this does not measure, and why, are in NOT_MEASURED and HANDLED;
 * each prints in the table as such, so a skipped control is a stated gap and
 * not a quiet pass.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launchChromium } from './chromium.mjs';
import { PINNABLE, PIN_RANGE } from '../src/lib/deskPins.ts';
import { engineQuery, installFrameReader, frameOf } from './frame.mjs';
import { readingOf } from './judge.mjs';

const PORT = Number(process.env.SWEEP_PORT ?? 4346);
const OUT = process.env.SWEEP_OUT ?? 'sweep';
// One run's rows are folded together and no other's: set SWEEP_RUN to keep a partial run (SWEEP_KEYS) from replacing a full one.
const RUN = process.env.SWEEP_RUN ?? 'full';
const SETTLE = Number(process.env.SWEEP_SETTLE ?? 9000);
const LAG = Number(process.env.SWEEP_LAG ?? 2000);     // after a change, before the first frame is read
const GAP = Number(process.env.SWEEP_GAP ?? 600);      // between the frames of one reading
const FRAMES = 3;
/*
  A control that follows the beat shows in the frames just after a kick and
  not in the ones between kicks, so its readings are taken on kicks: the
  frames are read a beat's eighth after the kick counter ticks. Every control
  in the show and audio-input sections does, and these others that read the kick or the bass.
*/
const ON_KICK = new Set(['plateRock', 'frameSway', 'spinAudioDepth', 'spinBeats', 'spinAuto', 'kickBloom', 'beatSqueeze', 'beatAccent',
  'beads', 'beadDrops', 'surge', 'fingering', 'cells']);
const onKick = (spec) => spec.section === 'show' || spec.section === 'audio-input' || ON_KICK.has(spec.key);
const [shardI, shardN] = (process.env.SWEEP_SHARD ?? '1/1').split('/').map(Number);
const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null);

const METRICS = ['luma', 'colours', 'flat', 'motion', 'detail', 'cast'];
const FLOOR = { luma: 0.02, colours: 0.03, flat: 0.03, motion: 0.003, detail: 0.004, cast: 0.02 };
const WEAK = 3;
const W = 240, H = 150;

/*
  The homes. `look` is a preset id; `set` is what has to be up on it for the
  control to matter; `needs` is the words the table gives when the control is
  dead on the plain look and alive here ("only matters with ...").
*/
export const HOMES = {
  base: { look: 'classic', set: {}, needs: '' },
  ferro: { look: 'magnet-garden', set: {}, needs: 'ferrofluid' },
  oil: { look: 'oil-and-water', set: {}, needs: 'an oil look (Oil Tension)' },
  soap: { look: 'milk-marble', set: {}, needs: 'a soap look' },
  bubbles: { look: 'classic', set: { bubbles: 0.5, lightPlay: 0.8 }, needs: 'bubbles' },
  beads: { look: 'classic', set: { beads: 0.6 }, needs: 'oil beads' },
  squeeze: { look: 'classic', set: { beatSqueeze: 0.8 }, needs: 'Beat Squeeze above zero' },
  thin: { look: 'classic', set: { thinGap: 1 }, needs: 'Thin Gap on' },
  kaleido: { look: 'classic', set: { kaleidoscope: 6 }, needs: 'Kaleidoscope on' },
  chem: { look: 'neon-coral-reef', set: { chemistry: 0.8 }, needs: 'Chemistry on' },
  turing: { look: 'turing-print', set: {}, needs: 'Turing Print on' },
  bz: { look: 'chemical-clock', set: {}, needs: 'the BZ look' },
  ph: { look: 'red-cabbage', set: {}, needs: 'the pH look' },
  lumia: { look: 'lumia', set: {}, needs: 'Lumia up' },
  gel: { look: 'classic', set: { gelWheel: 0.8 }, needs: 'Gel Wheel up' },
  led: { look: 'classic', set: { ledPlatform: true, ledLevel: 1 }, needs: 'the LED platform on' },
  particles: { look: 'stardust-collapse', set: {}, needs: 'Dye Particles on' },
  grain: { look: 'crowd-plate', set: {}, needs: 'Granulation on' },
  stock: { look: 'home-movie', set: {}, needs: 'a film stock look' },
  turb: { look: 'classic', set: { turbulenceScale: 0.6 }, needs: 'Turbulence up' },
  tilt: { look: 'classic', set: { plateUpright: 0.7, solutalBuoyancy: 0.6 }, needs: 'a stood-up plate with Dye Weight' },
  comet: { look: 'classic', set: { cometSpeed: 1 }, needs: 'Comet Flow up' },
  // spinAuto is Off (0) on Classic, so the dish turns only at its look's own tiny rate; 1 is Rate (spinRpm turns it), 2 is Beats (spinBeats sets the turn).
  spin: { look: 'classic', set: { spinAuto: 1, spinRpm: 12 }, needs: 'Auto Spin on Rate' },
  spinbeat: { look: 'classic', set: { spinAuto: 2 }, needs: 'Auto Spin on Beats' },
  // The spin-from-music dial scales a rotation the look's audio map routes to a band; Classic routes none.
  rotmap: { look: 'galaxy', set: {}, needs: 'a look that routes a band to rotation' },
  lava: { look: 'lava-lamp', set: {}, needs: 'the lava look' },
};

// key → home. Anything not named is at home on the plain look.
const HOME_OF = {};
const home = (name, ...keys) => { for (const k of keys) HOME_OF[k] = name; };
home('ferro', 'phaseAmount', 'phaseScale', 'phaseSharp', 'phaseDisplace', 'magnetStrength', 'magnetHeight', 'magnetX', 'magnetY',
  'magnetWalk', 'magnetSize', 'mazeDetail', 'ferroLabyrinth');
home('oil', 'oilTension', 'oilBodies', 'clearFilm', 'blobSurfaceTension', 'polarity');
home('soap', 'surfactantFlow');
home('bubbles', 'bubbles', 'iridescence', 'lightPlay');
home('beads', 'beads', 'beadDrops');
home('squeeze', 'beatAccent');
home('thin', 'gapThickness', 'depthDrag', 'vibrationFrequency', 'damping', 'platePressure', 'glassSmear', 'plateSpring', 'plateCurve');
home('kaleido', 'kaleidoSpin', 'kaleidoZoom');
home('chem', 'chemistryPattern', 'chemistryWidth');
home('turing', 'turingPrint', 'turingInk', 'turingDrift');
home('bz', 'bzReaction');
home('ph', 'phIndicator');
home('lumia', 'lumiaBright', 'lumiaContrast', 'lumiaSat', 'lumiaHue');
home('gel', 'gelSpeed', 'gelBright', 'gelContrast', 'gelSat', 'gelHue');
home('led', 'ledLevel', 'ledSpeed', 'ledBright', 'ledContrast', 'ledSat', 'ledHue');
home('particles', 'particleMix');
home('grain', 'grainScale');
home('stock', 'stockGrain', 'stockGrainSize', 'stockWeave', 'stockGate');
home('turb', 'turbulenceDetail');
home('tilt', 'tiltDirection', 'doubleDiffusion');
home('comet', 'cometAngle');
home('spin', 'spinRpm', 'spinDirection', 'spinWander');
home('rotmap', 'spinAudioDepth');
home('spinbeat', 'spinBeats');
home('lava', 'solutalBuoyancy', 'plateUpright');

/** Not measured by this check, and why. The table prints each reason. */
export const NOT_MEASURED = {
  hueJourney: 'a walk of minutes per step: slower than a reading (judged by `npm run film`)',
  surge: 'a breath of tens of seconds: slower than a reading',
  pacing: 'only runs inside a running sequence',
  songFollow: 'only runs inside a running sequence',
  spinImpulse: 'one flick of the dish: needs a pointer gesture the sweep does not make',
  spinDrag: 'the coast after a flick: needs a pointer gesture the sweep does not make',
  slosh: 'only shows when the tilt reverses (src/lib/slosh.ts): the sweep holds the tilt',
  dropHeight: 'how a dropped liquid lands: needs a pour gesture the sweep does not make',
  beatLead: 'a few milliseconds of timing, not a picture',
  filmMix: 'needs a loaded film or the camera, which a headless run does not have',
  filmKey: 'needs a loaded film',
  filmDrive: 'needs a loaded film',
  filmBright: 'needs a loaded film', filmContrast: 'needs a loaded film', filmSat: 'needs a loaded film', filmHue: 'needs a loaded film',
  filmFade: 'a take time, not a picture (`npm run rowfade`)',
  markMix: 'needs a loaded logo', markScale: 'needs a loaded logo', markX: 'needs a loaded logo', markY: 'needs a loaded logo',
  markBright: 'needs a loaded logo', markContrast: 'needs a loaded logo', markSat: 'needs a loaded logo', markHue: 'needs a loaded logo',
  markFade: 'a take time, not a picture (`npm run rowfade`)',
  ledFade: 'a take time, not a picture (`npm run rowfade`)', gelFade: 'a take time, not a picture (`npm run rowfade`)',
  lumiaFade: 'a take time, not a picture (`npm run rowfade`)', frontFade: 'a take time, not a picture (`npm run rowfade`)',
  backFade: 'a take time, not a picture (`npm run rowfade`)',
  sceneDrive: 'needs the room sensor', sceneHands: 'needs the room sensor', sceneDeadzone: 'needs the room sensor',
  sceneSmooth: 'needs the room sensor', sceneImpact: 'a master over room patches, and a headless run has no room',
  soundImpact: 'a master over patches that read the sound: needs patches added first',
  filmImpact: 'a master over patches that read a film', shapeImpact: 'a master over patches driven by a wave: needs patches added first',
};

/** Being handled by other threads (the owner's list for this sweep). */
export const handled = (spec) => spec.key === 'bassBoost' ? 'Bass Boost thread'
  : spec.section === 'camera' ? 'Lens thread' : spec.section === 'macro' ? 'closeup camera (#432)' : null;

const specs = PINNABLE.map((s) => ({ ...s, key: String(s.key) })).filter((s) => PIN_RANGE.has(s.key));

export const homeOf = (key) => HOMES[HOME_OF[key] ?? 'base'];
const homeName = (key) => HOME_OF[key] ?? 'base';

// ---- the table: folds one run's rows-<run>-*.json in OUT into table-<run>.md ----
const scoreOf = (row) => Math.max(0, ...row.ends.map((e) => e.score));
const word = (sc) => (sc >= WEAK ? 'Works' : sc >= 1 ? 'Weak' : 'Dead');
/**
 * Works / Weak / Dead on the home; "Only matters with X" when it reads Works or Weak at
 * home and Dead on the plain look; "Home wrong?" when it is Dead at home and alive on the
 * plain look (that pattern is a wrong home, or a control the home switches off); "Breaks"
 * when the far end turns the plate black, flat or NaN.
 */
const verdictOf = (home, plain) => {
  const sh = scoreOf(home), sp = plain ? scoreOf(plain) : null;
  const hw = word(sh);
  if (home.faults.some((f) => /NaN|black|flat/.test(f)) && sh >= 1) return `Breaks (${[...new Set(home.faults)].join(' ')})`;
  if (sp === null) return hw;
  if (sh >= 1 && sp < 1) return `${hw === 'Works' ? 'Only matters' : 'Weak, only matters'} with ${HOMES[home.home].needs}`;
  if (sh < 1 && sp >= WEAK) return 'Home wrong? (alive on the plain look)';
  return hw;
};

function foldTable() {
  const rows = [];
  for (const f of fs.readdirSync(OUT)) if (f.startsWith(`rows-${RUN}-`) && f.endsWith('.json')) rows.push(...JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')));
  const byKey = new Map();
  for (const r of rows) { const e = byKey.get(r.key) ?? {}; e[r.role] = r; byKey.set(r.key, e); }
  const lines = ['| Control | Section | Verdict | Score | Min end | Max end | Measured on |', '|---|---|---|---|---|---|---|'];
  const tally = {};
  let twin = 0, twinDiffer = 0;
  const end = (row, at) => { const e = row.ends.find((x) => x.at.startsWith(at)); return e ? `${e.metric} ${e.from.toFixed(3)}→${e.to.toFixed(3)} ×${e.score.toFixed(1)}` : 'at default'; };
  for (const s of specs) {
    const hd = handled(s);
    const e = byKey.get(s.key);
    let cells;
    if (hd) cells = ['Handled elsewhere', '', '', '', hd];
    else if (NOT_MEASURED[s.key]) cells = ['Not measured', '', '', '', NOT_MEASURED[s.key]];
    else if (!e?.home) cells = ['No row', '', '', '', 'not run'];
    else if (e.home.error) cells = ['Error', '', '', '', e.home.error];
    else {
      const plain = e.plain && !e.plain.error ? e.plain : null;
      const v = verdictOf(e.home, plain);
      const h = HOMES[e.home.ctx];
      cells = [v, `×${scoreOf(e.home).toFixed(1)}`, end(e.home, 'min'), end(e.home, 'max'),
        h.look + (Object.keys(h.set).length ? ` + ${Object.entries(h.set).map(([k, x]) => `${k}=${x}`).join(' ')}` : '') + (plain ? `; plain look ×${scoreOf(plain).toFixed(1)}` : '')];
      // The thin home is the plain look (Classic has Thin Gap on), so its two rows are one measurement twice.
      if (plain && e.home.ctx === 'thin') { twin++; if (word(scoreOf(e.home)) !== word(scoreOf(plain))) twinDiffer++; }
    }
    const t = cells[0].replace(/ with .*| \(.*/, '');
    tally[t] = (tally[t] ?? 0) + 1;
    lines.push(`| ${s.label} (\`${s.key}\`) | ${s.section} | ${cells[0]} | ${cells[1]} | ${cells[2] ?? ''} | ${cells[3] ?? ''} | ${cells[4] ?? ''} |`);
  }
  lines.push('', Object.entries(tally).map(([k, n]) => `${k}: ${n}`).join(' · '));
  if (twin) lines.push(`Repeat measurements (the same plate measured twice): ${twinDiffer} of ${twin} gave a different word. That is this check's own false-verdict rate.`);
  fs.writeFileSync(path.join(OUT, `table-${RUN}.md`), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}

fs.mkdirSync(OUT, { recursive: true });
if (process.argv.includes('--table')) { foldTable(); process.exit(0); }

// ---- the run ----
const only = list(process.env.SWEEP_KEYS);
const onlyCtx = list(process.env.SWEEP_CTX);
const todo = specs.filter((s) => !handled(s) && !NOT_MEASURED[s.key] && (!only || only.includes(s.key)));
// ctx name → [{spec, role}]: a control runs in its home, and, if the home is not the plain look, on the plain look too.
const plan = new Map();
const add = (ctx, spec, role) => { const a = plan.get(ctx) ?? []; a.push({ spec, role }); plan.set(ctx, a); };
for (const s of todo) {
  const h = homeName(s.key);
  if (!onlyCtx || onlyCtx.includes(h)) add(h, s, 'home');
  if (h !== 'base' && (!onlyCtx || onlyCtx.includes('base'))) add('base', s, 'plain');
}
const ctxs = [...plan.keys()].filter((_, i) => i % shardN === shardI - 1);

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
let leaving = false;
server.on('exit', (code) => { if (!leaving) { console.error(`preview server exited (${code})`); process.exit(2); } });
const stop = () => { leaving = true; try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { stop(); process.exit(130); });
await new Promise((r) => setTimeout(r, 2500));

const rows = [];
let failures = 0;
const rowsFile = path.join(OUT, `rows-${RUN}-${shardI}.json`);
const browser = await launchChromium(chromium);
try {
  console.log(`  sweep: ${todo.length} controls, ${ctxs.length} settings (shard ${shardI}/${shardN})\n`);
  for (const ctx of ctxs) {
    const H0 = HOMES[ctx];
    let page;
    const put = (patch) => page.evaluate((p) => window.chromaglassSettings?.(p), patch);
    /** Set, then read back: a renamed key must not read as a dead control. */
    const set = async (patch) => {
      const got = await put(patch);
      for (const k of Object.keys(patch)) {
        if (typeof patch[k] === 'number' && typeof got?.[k] !== 'number') throw new Error(`${ctx}: ${k} is not a setting this build reads back`);
      }
      return got;
    };
    const current = (k) => page.evaluate((key) => window.chromaglassDebug?.().settings?.[key], k);
    // A reader that cannot measure fails; it does not answer "nothing" (frame.mjs says why).
    const health = () => page.evaluate(() => {
      const st = window.chromaglassDebug?.().plateStats?.();
      return Array.isArray(st) ? st.reduce((n, p) => n + (p.nan ?? 0), 0) : null;
    });
    const kicks = async () => {
      const k = await page.evaluate(() => window.chromaglassDebug?.().kicks?.());
      if (typeof k !== 'number') throw new Error('the visualizer reports no kick count');
      return k;
    };

    /** One reading: the mean of FRAMES frames GAP apart, each judged against the one before it for motion. */
    const sample = async (kick = false) => {
      const acc = Object.fromEntries(METRICS.map((m) => [m, 0]));
      let n = 0;
      for (let i = 0; i < FRAMES; i++) {
        if (kick) {
          const k = await kicks();
          let t = 0;
          while ((await kicks()) === k) { if (++t > 200) throw new Error(`${ctx}: no kick in 10 s (counter ${k}, ${JSON.stringify(await page.evaluate(() => window.chromaglassDebug?.().settings?.audioSource ?? null))}): the band is silent or the counter is dead`); await page.waitForTimeout(50); }
          await page.waitForTimeout(120);
        }
        const a = await frameOf(page, W, H);
        await page.waitForTimeout(150);
        const b = await frameOf(page, W, H);
        if (!a || !b) throw new Error(`${ctx}: a frame could not be read`);
        const r = readingOf(a, b, W, H); for (const m of METRICS) acc[m] += r[m]; n++;
        await page.waitForTimeout(GAP);
      }
      for (const m of METRICS) acc[m] /= n;
      return acc;
    };

    /** A fresh page on the home's look with the home's settings up: a control must not inherit what the last one did to the plate. */
    let snap;
    const boot = async () => {
      if (page) await page.close();
      page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
      // The simulated band, chosen outright: a silent plate is a different app (controls.mjs says why).
      await page.addInitScript(() => { try { localStorage.setItem('chromaglass-audio-source', 'simulated'); } catch { /* private window */ } });
      await installFrameReader(page);
      await page.goto(`http://localhost:${PORT}/?debug&gpu=strong&tier=local&look=${H0.look}${engineQuery()}`, { waitUntil: 'load' });
      await page.mouse.click(8, 8);   // the gesture the band needs
      await page.evaluate(() => document.body.classList.add('overlays-hidden'));
      await page.waitForTimeout(SETTLE);
      if (Object.keys(H0.set).length) { await set(H0.set); await page.waitForTimeout(LAG * 2); }
      snap = await put({});
    };

    try {
      await boot();
      const k0 = await kicks();
      const noises = {}, means = {};
      for (const kick of [false, true]) {
        const idle = [];
        for (let i = 0; i < 5; i++) { await page.waitForTimeout(LAG); idle.push(await sample(kick)); }
        const noise = {}, mean = {};
        for (const m of METRICS) {
          let d = 0; for (let i = 1; i < idle.length; i++) d = Math.max(d, Math.abs(idle[i][m] - idle[i - 1][m]));
          noise[m] = d; mean[m] = idle.reduce((t, r) => t + r[m], 0) / idle.length;
        }
        noises[kick] = noise; means[kick] = mean;
      }
      const heard = (await kicks()) - k0;
      console.log(`  ${ctx} (${H0.look}${Object.keys(H0.set).length ? ' + ' + JSON.stringify(H0.set) : ''}): ${heard} kicks heard while idle`);
      if (heard < 20) throw new Error(`${ctx}: only ${heard} kicks in the idle readings: the band is not playing`);

      for (const { spec, role } of plan.get(ctx)) {
        const key = spec.key;
        try {
          const v0 = await current(key);
          if (typeof v0 !== 'number') { console.log(`    ${spec.label}: no numeric value on this look`); continue; }
          const span = spec.max - spec.min;
          // Each end of the range that is not the look's own value (within 5% of the range).
          const ends = [[spec.min, 'min'], [spec.max, 'max']].filter(([v]) => Math.abs(v - v0) > 0.05 * span);
          const evolve = key === 'automateRate';
          const kick = onKick(spec);
          const noise = noises[kick];
          const out = [];
          let nan = 0;
          const faults = [];
          for (const [v, at] of ends) {
            // A fresh "before" for each end: the look drifts on its own, and the noise was measured over one gap, not three.
            await page.waitForTimeout(LAG);
            const a0 = await sample(kick);
            await set({ [key]: v });
            if (evolve) await page.evaluate(() => window.chromaglassAction?.('automate-toggle'));
            await page.waitForTimeout(LAG);
            const b = await sample(kick);
            const bad = await health();
            if (bad === null) faults.push('no-plateStats'); else nan += bad;
            if (evolve) await page.evaluate(() => window.chromaglassAction?.('automate-toggle'));
            let best = null;
            for (const m of METRICS) {
              const d = Math.abs(b[m] - a0[m]);
              const score = d / Math.max(FLOOR[m], 2 * noise[m]);
              if (!best || score > best.score) best = { at: `${at} (${+v.toFixed(3)})`, metric: m, from: a0[m], to: b[m], score };
            }
            out.push(best);
            if (b.luma < 0.015 && key !== 'dimmer') faults.push('black');
            if (b.flat > 0.85 && key !== 'dimmer') faults.push('flat');
            // Put back everything, not only this key (Evolve rewrites many), then ask whether the plate came back.
            await put(snap);
            await page.waitForTimeout(LAG);
            const back = await sample(kick);
            const off = Math.max(...['luma', 'colours', 'flat'].map((m) => Math.abs(back[m] - means[kick][m]) / Math.max(FLOOR[m], 3 * noise[m])));
            if (off > 1) { await boot(); }
          }
          if (nan > 0) faults.push(`NaN×${nan}`);
          if (!out.length) continue;
          const row = { run: RUN, key, label: spec.label, ctx, home: homeName(key), role, v0, ends: out, faults };
          rows.push(row);
          const s = scoreOf(row);
          console.log(`    ${spec.label.padEnd(26)} ${role === 'plain' ? '(plain look) ' : ''}${s >= WEAK ? 'works ' : s >= 1 ? 'weak  ' : 'DEAD  '} ×${s.toFixed(1).padStart(5)}  ` +
            out.map((e) => `${e.at} ${e.metric} ${e.from.toFixed(3)}→${e.to.toFixed(3)} ×${e.score.toFixed(1)}`).join(' | ') + (faults.length ? `  ${faults.join(' ').toUpperCase()}` : ''));
        } catch (err) {
          rows.push({ run: RUN, key, label: spec.label, ctx, home: homeName(key), role, error: String(err.message ?? err) });
          console.log(`    ${spec.label}: ERROR ${err.message}`);
          failures++;
          await boot();
        }
        fs.writeFileSync(rowsFile, JSON.stringify(rows, null, 1));
      }
    } catch (err) {
      console.log(`  ${ctx}: ERROR ${err.message}`);
      for (const { spec, role } of plan.get(ctx)) rows.push({ run: RUN, key: spec.key, label: spec.label, ctx, home: homeName(spec.key), role, error: String(err.message ?? err) });
      failures++;
    }
    if (page) await page.close();
    fs.writeFileSync(rowsFile, JSON.stringify(rows, null, 1));
  }
} finally {
  await browser.close();
  stop();
}
fs.writeFileSync(rowsFile, JSON.stringify(rows, null, 1));
if (shardN === 1) foldTable();
if (failures) { console.error(`\n  ${failures} setting(s) or control(s) could not be measured: the table lists them as errors`); process.exit(1); }
