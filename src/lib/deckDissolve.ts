/**
 * A Go sent to the dark projector, the crossfade carrying the light over
 * (PLAN 51c-2): the A/B deck dissolve.
 *
 * What a two-projector show does. Two heads on one wall, one lit and one
 * dark. The operator on the dark one changes their dish where nobody can see
 * it, racks it soft, and then the light goes over: the lit head's focus runs
 * out as its lamp comes down, the dark one's comes up as a glow and racks in.
 * The next change goes to the head now dark, the other way. A DJ's two decks,
 * which is why the switch is called Decks: nothing that is lit is ever
 * changed in view, and no frame is a cut.
 *
 * What the app had. 51c racks the projectors a Go changes out and back on
 * the spot: the look changes behind a blur, but on the projector that is lit.
 * And 51a's A/B crossfade was a fader for a hand. With Decks on (`projDeck`)
 * and two projectors on the wall, a Go goes to the dark one instead.
 *
 * What a deck's dish is. The back plate's own look is its liquid and its
 * colours: every solver setting and its dyes (16a, lib/backLook.ts). How the
 * plates are drawn and lit (the lamp's ground, the glass, the lacing) is one
 * render pass for both, until 16b gives each projector its own source. So a
 * Go to the dark deck takes it the new look's dish (the front's solver
 * settings and dyes, or the back plate's own look), and the rest of the look,
 * which shows on both, changes on the front over the fade's middle half,
 * where both are melted (Focus Dissolve up) or both half lit: 51c's window.
 *
 * The timing, a fade of T:
 *   - the dish goes in at the Go, over T/4, while its deck is dark; a deck
 *     still lit at the Go (the crossfade in the middle, as it opens) waits
 *     out the first quarter, its rack out, and changes over the second, held
 *     melted;
 *   - the crossfade travels over the middle half, T/4 to 3T/4, along
 *     sin²(π q / 2), still at both ends as a hand starts and stops a fader;
 *     linear in light (51a), so the middle is no brighter than the ends;
 *   - the rest of the look fades on the front over the middle half;
 *   - the racks (lib/focusDissolve.ts startDeckRack) run the whole T.
 * A second Go mid-dissolve goes to the deck the crossfade is leaving: the
 * light turns round from where it stands, and each projector's rack carries
 * on from its blur.
 *
 * Plain numbers; the App's look fades run it (app/useLookFades.ts) and
 * `npm run focus` drives it with a made-up clock.
 */

import type { VisualizerSettings } from '../types';
import { LOOK_FROM, LOOK_TO, rackShare } from './focusDissolve';
import { PER_LAYER } from './sceneMap';

/** Below this share of its light a deck is dark: its dish changes from the Go. 2%, under the dither on a lamp at full. */
export const DARK_SHARE = 0.02;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const crossOf = (x: number | undefined): number => clamp01(Number.isFinite(x) ? x as number : 0.5);

/** The deck a Go goes to at crossfade `x` (A at 0, B at 1): the darker one, B on a tie, the back plate being the one free to take a look of its own. */
export const darkDeck = (x: number | undefined): 0 | 1 => (crossOf(x) > 0.5 ? 0 : 1);

/** A deck's share of the light at crossfade `x`. */
export const deckLight = (x: number | undefined, deck: 0 | 1): number => (deck === 1 ? crossOf(x) : 1 - crossOf(x));

/** The crossfade at `p` of the way through a dissolve that began at `x0`, going to deck `to`. */
export function crossAt(p: number, x0: number, to: 0 | 1): number {
  const q = clamp01((p - LOOK_FROM) / (LOOK_TO - LOOK_FROM));
  return x0 + (to - x0) * rackShare(q / 2);
}

/** When, after the Go, each part goes in and for how long: the dish on its deck, and the rest of the look on the front. */
export interface DeckPlan {
  to: 0 | 1;
  dishDelayMs: number;
  dishSeconds: number;
  lookDelayMs: number;
  lookSeconds: number;
}

export function deckPlan(x: number | undefined, seconds: number): DeckPlan {
  const to = darkDeck(x);
  const t = Math.max(0, seconds);
  const dark = deckLight(x, to) < DARK_SHARE;
  return {
    to,
    dishDelayMs: dark ? 0 : LOOK_FROM * t * 1000,
    dishSeconds: LOOK_FROM * t,
    lookDelayMs: LOOK_FROM * t * 1000,
    lookSeconds: (LOOK_TO - LOOK_FROM) * t,
  };
}

/** `target` with the keys `pick` says from `now` instead: one pass over the keys, a Go's, not a frame's. */
const split = (target: VisualizerSettings, now: VisualizerSettings, pick: (k: string) => boolean): VisualizerSettings => {
  const out = { ...target } as Record<string, unknown>;
  const live = now as unknown as Record<string, unknown>;
  for (const k of Object.keys(out)) if (pick(k) && k in live) out[k] = live[k];
  return out as unknown as VisualizerSettings;
};

/** The look's dish over the plate as it is: its solver settings (`PER_LAYER`, what a plate owns), everything else `now`'s. */
export const dishOf = (target: VisualizerSettings, now: VisualizerSettings): VisualizerSettings => split(target, now, k => !PER_LAYER.has(k));

/** The rest of the look over the plate's dish as it is: everything but the solver settings, those `now`'s. */
export const drawingOf = (target: VisualizerSettings, now: VisualizerSettings): VisualizerSettings => split(target, now, k => PER_LAYER.has(k));

/** The switch's readout. */
export const deckLabel = (v: number): string => (v > 0.5 ? 'Go to the dark projector' : 'Off');
