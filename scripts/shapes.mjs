#!/usr/bin/env node
/**
 * Do the LFOs and envelopes say what they claim to?
 *
 *   npm run shapes
 *
 * A modulator is arithmetic with no picture in it, which makes it the easiest
 * kind of thing to get subtly wrong and never notice: an LFO whose triangle is
 * a sawtooth, an envelope that never reaches zero, a rate that drifts against
 * the bar. None of those look broken on a plate — they look like a choice.
 *
 * Driven a step at a time with an injected random source, so every number here
 * is the same on every machine.
 */

import { Modulators, MODULATOR_FEATURES, MODULATOR_LABELS } from '../src/lib/modulators.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
/** A deterministic stand-in for Math.random. */
const seeded = () => { let s = 99; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
/** Run for `seconds` at `bpm`, sampling one feature every step. */
const run = (feature, seconds, bpm, dt = 1 / 60, onStep) => {
  const m = new Modulators(seeded());
  const out = [];
  for (let t = 0; t < seconds; t += dt) {
    if (onStep) onStep(m, t);
    m.step(dt, bpm);
    out.push(m.value(feature));
  }
  return out;
};

// ── 1. Every modulator is named and bounded ──────────────────────────
{
  check('every modulator has a label a panel can print',
    MODULATOR_FEATURES.every(f => typeof MODULATOR_LABELS[f] === 'string' && MODULATOR_LABELS[f].length > 3),
    MODULATOR_FEATURES.join(' '));
  const m = new Modulators(seeded());
  m.fire(1);
  for (let i = 0; i < 600; i++) m.step(1 / 60, 128);
  const strays = MODULATOR_FEATURES.filter(f => {
    const v = m.value(f);
    return !Number.isFinite(v) || v < 0 || v > 1;
  });
  check('and none of them ever leaves 0..1', strays.length === 0, strays.join(', ') || 'all in range');
  check('an unknown feature is nothing rather than NaN', new Modulators().value('nope') === 0);
}

// ── 2. The LFOs keep time with the bar ───────────────────────────────
//
// The whole reason they are divisions of a bar: an LFO that free-runs against
// music drifts in and out of phase and everything it touches looks
// almost-deliberate. At 120bpm a bar is two seconds, so LFO 3 — one bar —
// should come back to where it started every two seconds.
{
  const dt = 1 / 60;
  const v = run('lfo3', 8, 120, dt);
  const atStart = v[0];
  const oneBarLater = v[Math.round(2 / dt) - 1];
  check('a one-bar LFO is back where it started one bar later',
    Math.abs(atStart - oneBarLater) < 0.05, `${atStart.toFixed(3)} then ${oneBarLater.toFixed(3)}`);

  // Twice the tempo, half the wall-clock time per cycle.
  const fast = run('lfo3', 8, 240, dt);
  const halfBar = fast[Math.round(1 / dt) - 1];
  check('and at double the tempo it gets there in half the time',
    Math.abs(atStart - halfBar) < 0.05, `${halfBar.toFixed(3)} after one second at 240bpm`);

  // The slow one must *not* have come round in that time, or it is not slow.
  const slow = run('lfo1', 8, 120, dt);
  check('the eight-bar LFO has not come round after one bar',
    Math.abs(slow[0] - slow[Math.round(2 / dt) - 1]) > 0.05,
    `${slow[0].toFixed(3)} then ${slow[Math.round(2 / dt) - 1].toFixed(3)}`);

  // A nonsense tempo must not stop them: a show with no clock still wants LFOs.
  const noTempo = run('lfo2', 20, 0, dt);
  check('with no tempo at all they still run', Math.max(...noTempo) - Math.min(...noTempo) > 0.8,
    `${(Math.max(...noTempo) - Math.min(...noTempo)).toFixed(2)} of travel at the fallback tempo`);
}

// ── 3. The shapes are the shapes ─────────────────────────────────────
{
  const dt = 1 / 240;
  const tri = run('lfo3', 2, 120, dt);
  // A triangle's slope is constant; a sine's is not. Compare the spread of
  // the step-to-step differences: near zero for a triangle, wide for a sine.
  const slopes = (v) => v.slice(1).map((x, i) => Math.abs(x - v[i])).filter(x => x < 0.5);
  const spread = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length) / m; };
  check('the triangle climbs at one rate, the way a triangle does',
    spread(slopes(tri)) < 0.15, `slope varies by ${(spread(slopes(tri)) * 100).toFixed(0)}%`);
  const sine = run('lfo2', 8, 120, dt);
  check('and the sine does not, the way a sine does not',
    spread(slopes(sine)) > 0.3, `slope varies by ${(spread(slopes(sine)) * 100).toFixed(0)}%`);

  // Stepped: flat between beats, and it does move.
  const step = run('lfo4', 16, 120, 1 / 60);
  const uniq = new Set(step.map(v => v.toFixed(4)));
  check('the stepped LFO holds a value and then jumps',
    uniq.size > 4 && uniq.size < step.length / 4, `${uniq.size} values across ${step.length} samples`);
}

// ── 4. The envelopes are fired, not free ─────────────────────────────
{
  const m = new Modulators(seeded());
  check('an envelope that has never been fired is silent', m.value('env1') === 0 && m.value('env2') === 0);
  for (let i = 0; i < 300; i++) m.step(1 / 60, 120);
  check('and stays silent however long the show runs', m.value('env1') === 0);

  m.fire(1);
  m.step(1 / 60, 120);
  const peak1 = m.value('env1');
  check('firing one reaches the top quickly', peak1 > 0.9, `${peak1.toFixed(2)} after a frame`);

  // The short one must be over while the long one is still going, or there is
  // no reason for there to be two.
  let short = 0, long = 0;
  const m2 = new Modulators(seeded());
  m2.fire(1);
  for (let t = 0; t < 4; t += 1 / 60) {
    m2.step(1 / 60, 120);
    if (m2.value('env1') > 0.05) short = t;
    if (m2.value('env2') > 0.05) long = t;
  }
  check('the snap is over while the swell is still going',
    short < long * 0.5, `snap ${short.toFixed(2)}s, swell ${long.toFixed(2)}s`);

  // Velocity: a soft note is a small envelope.
  const soft = new Modulators(seeded());
  soft.fire(0.25);
  soft.step(1 / 60, 120);
  check('a soft note makes a small envelope', soft.value('env1') < peak1 * 0.4,
    `${soft.value('env1').toFixed(2)} against ${peak1.toFixed(2)} at full`);
}

console.log('');
const failed = checks.filter(c => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
