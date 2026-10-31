#!/usr/bin/env node
/**
 * Soap Breakdown: a real loss for the kept soap, so a long show keeps
 * bursting (PLAN 38c-3).
 *
 *   npm run soapbreak                                     what the dial does
 *   npm run soapbreak -- --owed=law,decay,show,default    as CI runs it until it ships
 *
 * Why this check exists before the dial does. Since 38c (scripts/soap.mjs)
 * the mix's soap is conserved: nothing takes it off a closed plate. That is
 * the real dish, and it is also why the Soap Bursts dropper soaps the whole
 * plate in a few minutes of a show, after which every drop lands on a
 * surface already full and does nothing (soap.mjs line 3 proves exactly
 * that for one drop). The owner chose (2026-10-31) a setting for a real
 * loss, 0 by default: the soap taken up by the oil's interface, or carried
 * off by fresh water through the trough, written as the simplest law those
 * have, a first-order loss dΓ/dt = −kΓ on the mix's surfactant channel (.g)
 * in mixUpdate, with k in 1/s. This file is the contract that build is held
 * to, written first and red on main (the Claude/Antigravity split,
 * docs/handoff.md): Antigravity builds against it and takes each id out of
 * --owed as it turns green.
 *
 * The contract, so the build has one shape to meet:
 *
 *   - `src/gpu/fluid/soap.ts` exports `soapBreakdownRate(dial)`: the
 *     setting's 0..1 to k in 1/s, exactly 0 at 0. The desk shows ln2/k as a
 *     half-life.
 *   - the step's params carry the dial as `soapBreakdown` (GpuStepParams),
 *     and the solver applies it per real second of the step
 *     (`magnetSeconds`), never per frame and never by the sim's own `dt`
 *     (the look's Speed).
 *   - the setting is `soapBreakdown` in DEFAULT_SETTINGS, 0, and no look
 *     sets it: every look keeps today's soap (PLAN's operating rule for a
 *     new setting). Its desks, MIDI and the phone's Soap sheet are the
 *     `panel`, `desk` and `phone` checks' and the setting-auditor's.
 *
 * The lines:
 *
 *   law      the dial's law: k(0) is 0 exactly, k rises with the dial, and
 *            the dial spans very gentle to very extreme (the owner's rule for
 *            every dial, 2026-10-31): its first notch, 0.01, has a half-life
 *            of an hour or more, longer than a set, and its top one of ten
 *            seconds or less, a plate cleared between two bars.
 *   decay    the solver does what the law says, in real seconds: soap laid
 *            over and under a monolayer, at a half-life of about 20 s, read
 *            after 30 s of the plate's time as exp(−k·30) within 2%, in
 *            steps of a tenth and a twentieth of a second and at three times
 *            the sim's dt. A loss written per frame reads twice as much at
 *            the shorter step; one scaled by dt reads three times as much at
 *            the faster one.
 *   show     the feature: the tenth minute of a kick track. A closed plate
 *            keeps every drop (soap.mjs line 1), so the plate at minute nine
 *            with the dial at 0 is the sum of nine minutes of the dropper's
 *            drops: that sum is laid at once, then the last minute runs in
 *            the solver with the dropper dropping on the kicks as
 *            LiquidVisualizer does at full Soap Bursts, and a drop is
 *            measured as soap.mjs measures one, against the same drop on
 *            clean water. With the dial at its top the drop still bursts
 *            (half or more of clean water's), from a plate that started the
 *            minute as soaped as the dial-0 one, which is harder than a show
 *            that had the dial up all along. With the dial at 0 it does next
 *            to nothing (under a fifth), and the plate's soap is every drop
 *            laid to 1%: the dial at 0 takes nothing.
 *   default  `soapBreakdown` is a setting, 0 by default, and every look
 *            leaves it at 0.
 *
 * --owed: a line is excused only in the state it is owed for, which is main's
 * (as `npm run liveshow -- --stack` and `npm run wall` do it, #619):
 *   law      soap.ts exports no soapBreakdownRate
 *   decay    every arm kept its soap to 1% (no loss at all)
 *   show     both arms' drops did next to nothing (under a fifth of clean)
 *   default  DEFAULT_SETTINGS has no soapBreakdown
 * Any other failure is red, owed or not, and an owed line that passes is red
 * until its id is taken out of --owed.
 *
 * The lab alone (scripts/lab.mjs), so it runs on SwiftShader as on Metal;
 * a few minutes, beside `soap` in lab2.
 */
import { openLab } from './lab.mjs';
import { build } from 'esbuild';

const OWED_IDS = ['law', 'decay', 'show', 'default'];
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const flag = process.argv.find((a) => a.startsWith('--owed='));
const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
const unknown = [...owed].filter((id) => !OWED_IDS.includes(id));
if (unknown.length) check('every id in --owed is a line of this check', false, `unknown: ${unknown.join(', ')} (known: ${OWED_IDS.join(', ')})`);
/** A line, excused only when it is owed and `inOwedState` says the code is still main's. */
const line = (id, name, ok, detail, inOwedState) => {
  if (!owed.has(id)) return check(name, ok, detail);
  if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
  if (!inOwedState) return check(name, false, `${detail}; owed only while the code is main's, and it is not`);
  console.log(` owed ${name} — ${detail}`);
};

const bundle = async (entry) => {
  const out = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
};
const soap = await bundle('src/gpu/fluid/soap.ts');
const rate = typeof soap.soapBreakdownRate === 'function' ? soap.soapBreakdownRate : null;
const halfLife = (k) => (k > 0 ? Math.LN2 / k : Infinity);
const fmtH = (s) => (s === Infinity ? '∞' : s >= 3600 ? `${(s / 3600).toFixed(2)} h` : s >= 60 ? `${(s / 60).toFixed(1)} min` : `${s.toFixed(2)} s`);

// ── law (node) ──
{
  if (!rate) {
    line('law', 'the dial\'s law: 0 takes nothing, and it runs from gentler than a set to a plate cleared in seconds', false,
      'src/gpu/fluid/soap.ts exports no soapBreakdownRate', true);
  } else {
    const ks = Array.from({ length: 101 }, (_, i) => rate(i / 100));
    const rising = ks.every((k, i) => Number.isFinite(k) && (i === 0 || k > ks[i - 1]));
    const ok = ks[0] === 0 && rising && halfLife(ks[1]) >= 3600 && halfLife(ks[100]) <= 10;
    line('law', 'the dial\'s law: 0 takes nothing, and it runs from gentler than a set to a plate cleared in seconds', ok,
      `k(0) = ${ks[0]}, ${rising ? 'rising' : 'not rising'} over 0..1 by hundredths; half-life ${fmtH(halfLife(ks[1]))} at 0.01 (bar ≥ 1 h), ${fmtH(halfLife(ks[50]))} at 0.5, ${fmtH(halfLife(ks[100]))} at 1 (bar ≤ 10 s)`, false);
  }
}

// The dial the lab lines run at: the law's own, or the top when there is none yet.
const dialFor = (seconds) => {
  if (!rate) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (halfLife(rate(m)) > seconds) lo = m; else hi = m; }
  return hi;
};

const { page, close } = await openLab();
try {
  const soapTotal = () => page.evaluate(async () => {
    const m = await lab.solver().readField('mix'); const L = Math.round(Math.sqrt(m.length / 4));
    let t = 0; for (let c = 0; c < L * L; c++) t += m[c * 4 + 1];
    return t / (L * L);
  });

  // ── decay (lab) ──
  {
    const dial = dialFor(20), k = rate ? rate(dial) : 0, T = 30;
    const arm = async (seconds, dt) => {
      await page.evaluate(() => lab.create(64, 64));
      // Over a monolayer in the middle (micelles), under it at the edges: the loss is on the whole channel.
      await page.evaluate(() => { lab.solver().addMix(0.5, 0.5, 0.45, { soap: 3 }); lab.solver().addMix(0.25, 0.7, 0.12, { soap: 0.4 }); });
      const a = await soapTotal();
      await page.evaluate(([s, n, d, b]) => lab.step(n, { surfactantFlow: 1, magnetSeconds: s, dt: d, soapBreakdown: b }), [seconds, Math.round(T / seconds), dt, dial]);
      return (await soapTotal()) / a;
    };
    const arms = [await arm(0.1, 0.004), await arm(0.05, 0.004), await arm(0.1, 0.012)];
    const want = Math.exp(-k * T);
    const ok = !!rate && k > 0 && arms.every((r) => Math.abs(r / want - 1) < 0.02);
    line('decay', 'the solver loses soap as the law says, per real second, whatever the step or the Speed', ok,
      `dial ${dial.toFixed(3)} (half-life ${fmtH(halfLife(k))}): kept ${arms.map((r) => r.toFixed(4)).join(', ')} after ${T} s in 0.1 s steps, 0.05 s steps, and 0.1 s at 3× dt; exp(−kt) is ${want.toFixed(4)}`,
      arms.every((r) => Math.abs(r - 1) < 0.01));
  }

  // ── show (lab) ──
  {
    // The dropper at full Soap Bursts on a kick every half second (120 bpm):
    // a kick drops with 0.25 + 0.7 of a chance, a drop 0.03 to 0.07 in radius
    // at 0.15..0.85 (LiquidVisualizer, "Soap Bursts"). Seeded, so both arms
    // get the same drops.
    const KICK = 0.5, STEP = 0.1;
    const kickTrack = (seconds, seed) => {
      let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      const drops = [];
      for (let t = 0; t < seconds; t += KICK) if (r() < 0.95) drops.push([0.15 + 0.7 * r(), 0.15 + 0.7 * r(), 0.03 + 0.04 * r()]);
      return drops;
    };
    // Nine minutes of drops, each a dome holding πr²/2 of a monolayer (soap.mjs line 4).
    const nine = kickTrack(540, 7).reduce((a, [, , r]) => a + Math.PI * r * r / 2, 0);
    const minute = kickTrack(60, 9);

    // The dye within the measured drop's own radius (soap.mjs line 3's measure).
    const inner = () => page.evaluate(async () => {
      const d = await lab.field('dye'); const L = Math.round(Math.sqrt(d.length / 4)); let a = 0;
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) if (Math.hypot((i + 0.5) / L - 0.5, (j + 0.5) / L - 0.5) < 0.05) a += d[(i + j * L) * 4 + 3];
      return a;
    });
    const run = async (dial, soaped) => {
      await page.evaluate(() => lab.create(128, 128));
      let laid = 0;
      if (soaped) {
        // The nine minutes' soap as one wide dome, scaled to their sum.
        await page.evaluate(() => lab.solver().addMix(0.5, 0.5, 0.75, { soap: 1 }));
        const one = await soapTotal();
        await page.evaluate(() => lab.create(128, 128));
        await page.evaluate((a) => lab.solver().addMix(0.5, 0.5, 0.75, { soap: a }), nine / one);
        laid = await soapTotal();
        // The last minute, its drops on the kicks.
        const added = await page.evaluate(async ([drops, dial, perKick, step]) => {
          let sum = 0;
          for (const d of drops) {
            if (d) { lab.solver().addMix(d[0], d[1], d[2], { soap: 1 }); sum += Math.PI * d[2] * d[2] / 2; }
            await lab.step(perKick, { surfactantFlow: 1, magnetSeconds: step, soapBreakdown: dial });
          }
          return sum;
        }, [minute, dial, Math.round(KICK / STEP), STEP]);
        laid += added;
      }
      const pre = await soapTotal();
      // The measured drop, on a spot of dye, as soap.mjs lays it; 2 s of the plate.
      await page.evaluate(() => { lab.dye(0.5, 0.5, 0.3, [1, 1, 1], 1); lab.flush(); lab.solver().addMix(0.5, 0.5, 0.06, { soap: 1 }); });
      const before = await inner();
      await page.evaluate((dial) => lab.step(20, { surfactantFlow: 1, magnetSeconds: 0.1, soapBreakdown: dial }), dial);
      return { burst: 1 - (await inner()) / before, kept: pre / Math.max(laid, 1e-12), laid };
    };
    const clean = await run(0, false);
    const zero = await run(0, true);
    const top = await run(1, true);
    const ok = clean.burst > 0.2 && top.burst >= 0.5 * clean.burst && zero.burst < 0.2 * clean.burst && Math.abs(zero.kept - 1) < 0.01;
    line('show', 'in the tenth minute of a kick track a drop still bursts with the dial up, and does nothing at 0', ok,
      `${(top.burst * 100).toFixed(1)}% of the dye in the drop's radius gone in 2 s at the dial's top, ${(zero.burst * 100).toFixed(1)}% at 0, ${(clean.burst * 100).toFixed(1)}% on clean water (bars ≥ half, < a fifth); nine minutes laid ${zero.laid.toFixed(3)} of a monolayer over the plate with the last minute's drops, kept ${(zero.kept * 100).toFixed(2)}% at 0`,
      top.burst < 0.2 * clean.burst && zero.burst < 0.2 * clean.burst);
  }
} finally {
  await close();
}

// ── default (node) ──
{
  const { DEFAULT_SETTINGS } = await bundle('src/types.ts');
  const { PRESETS } = await bundle('src/presets.ts');
  const has = DEFAULT_SETTINGS && 'soapBreakdown' in DEFAULT_SETTINGS;
  const setters = PRESETS.filter((p) => (p.settings?.soapBreakdown ?? 0) !== 0).map((p) => p.name ?? p.id);
  line('default', 'Soap Breakdown is a setting, 0 by default, and every look leaves it at 0', has && DEFAULT_SETTINGS.soapBreakdown === 0 && setters.length === 0,
    has ? `default ${DEFAULT_SETTINGS.soapBreakdown}; ${setters.length ? `set by ${setters.join(', ')}` : `no look of ${PRESETS.length} sets it`}` : 'DEFAULT_SETTINGS has no soapBreakdown', !has);
}

const bad = checks.filter((c) => !c.ok);
const owedN = [...owed].filter((id) => OWED_IDS.includes(id)).length;
console.log(bad.length ? `\n${bad.length} of ${checks.length} soap breakdown checks failed` : `\nall ${checks.length} soap breakdown checks pass${owedN ? ` (${owedN} owed)` : ''}`);
process.exit(bad.length ? 1 : 0);
