/**
 * A look change hidden behind a rack of the focus (PLAN 51c).
 *
 * What was asked. Liquid Light Lab's "Epic Rig" (17:50) racks a sharp oil
 * disc into a red glow over about six seconds, then changes the scene while
 * nothing on the wall has an edge; a lumia "spreads it across the whole
 * thing, then focuses it". The app's look change was a fade or a cut: a fade
 * walks eighty settings and hands the dye over in full view, and what cannot
 * be halfway (a blend mode, a switch, the ferrofluid ring) jumps at its
 * middle on a sharp picture.
 *
 * What a projectionist does. Turns the head's focus knob out, at the pace of
 * a hand, to a melt; swaps the dish or the slide where no edge can be seen;
 * turns it back. So this is 51b's rack moved by the show rather than by a
 * hand on the knob: each projector's Δz goes from where its own knob has it
 * out to the dissolve's depth (Focus Dissolve, `projRack`: 0.5 the head's
 * real end of travel, as on the focus knob, 1 a glow past it, GLOW_M) and
 * back, over the look's fade time (lib/projectorFocus.ts rackedDz). The blur is 51b's: the
 * lamp's image in linear light, so the light on the wall is kept the whole
 * way and a melted cell is a glow.
 *
 * The rack's path is sin²(π p) over the fade, p from 0 to 1: still at both
 * ends, as a hand starts and stops a knob, fastest a quarter and three
 * quarters of the way, and widest at the middle, once. The look change runs
 * inside it, over the middle half (LOOK_FROM to LOOK_TO), where the rack is
 * past half its depth: so the look fade's own middle, where its switches
 * flip and the ring is swapped (lib/lookFade.ts, the visualizer's handoff),
 * falls on the rack's widest blur. A fade of T seconds becomes a rack of T
 * with the look's fade of T / 2 starting T / 4 in.
 *
 * A second Go while a rack runs carries on from the blur it has reached:
 * the new rack starts where the old one is (on its way out, at the same
 * share), so nothing snaps sharp, and its look change waits only for what is
 * left of its first quarter.
 *
 * Plain numbers on the stage clocks (lib/stageClocks.ts), no objects in the
 * frame: a rack is started on a Go and walked each frame on the show clock.
 */

import { dissolveDz, LENS_HEIGHT_M, PUPIL_LONG_M, STAGE_M } from './projectorFocus';

/** Where in the rack the look change begins and ends: the middle half, the rack past half its depth throughout. */
export const LOOK_FROM = 0.25;
export const LOOK_TO = 0.75;

/** The rack's share of its depth at `p` of the way through: sin²(π p), 0 at both ends and 1 at the middle, 0 outside. */
export function rackShare(p: number): number {
  if (!(p > 0 && p < 1)) return 0;
  const s = Math.sin(Math.PI * p);
  return s * s;
}

/** Each projector's rack, A's then B's: its share this frame, when it began on the show clock, and how long it runs (0 at rest). */
export interface RackClock {
  share: Float32Array;
  start: Float64Array;
  ms: Float64Array;
}

export function rackClock(): RackClock {
  return { share: new Float32Array(2), start: new Float64Array(2), ms: new Float64Array(2) };
}

/** Each frame, on the show clock: every running rack's share, and a finished one back at rest. */
export function walkRack(c: RackClock, now: number): void {
  for (let i = 0; i < 2; i++) {
    if (!(c.ms[i] > 0)) { c.share[i] = 0; continue; }
    const p = (now - c.start[i]) / c.ms[i];
    if (p >= 1) { c.ms[i] = 0; c.share[i] = 0; continue; }
    c.share[i] = rackShare(p);
  }
}

/** When a look change inside a rack begins, after the Go, and how long its fade runs. */
export interface DissolvePlan { delayMs: number; seconds: number }

/**
 * Start a dissolve of `seconds` on projectors `a` and `b` at `now`, and say
 * when the look change goes in. A projector already racking carries on from
 * its blur (see the header); the plan follows the first projector named.
 */
export function startRack(c: RackClock, now: number, seconds: number, a: boolean, b: boolean): DissolvePlan {
  const ms = Math.max(0, seconds) * 1000;
  let lead = -1;
  for (let i = 0; i < 2; i++) {
    if (!(i === 0 ? a : b) || !(ms > 0)) continue;
    // From the share it is at, on the way out.
    walkRack(c, now);
    const p0 = c.share[i] > 0 ? Math.asin(Math.sqrt(Math.min(1, c.share[i]))) / Math.PI : 0;
    c.start[i] = now - p0 * ms;
    c.ms[i] = ms;
    if (lead < 0) lead = p0;
  }
  if (lead < 0) return { delayMs: 0, seconds };
  const from = Math.max(lead, LOOK_FROM);
  return { delayMs: (from - lead) * ms, seconds: ((LOOK_TO - from) * ms) / 1000 };
}

/** The dial as the panel reads it: Off, or how wide a point's blur is at the swap, as a share of the frame along the lamp's bar. */
export const rackLabel = (v: number): string => {
  if (!(v > 0.005)) return 'Off';
  const pct = (100 * dissolveDz(v) * PUPIL_LONG_M) / LENS_HEIGHT_M / STAGE_M;
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}% of the frame${v > 0.5 ? ', past the rack' : ''}`;
};
