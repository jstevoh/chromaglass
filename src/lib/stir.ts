/**
 * Turbulence, the hand stirring the layer: the stir's speed for the dial
 * (PLAN 27c), and the cord the music stirs it by (PLAN 38u-4, 38u-5).
 * LiquidVisualizer's deriveStep says why it is this curve; `npm run rides`
 * holds the curve and `npm run musicstir` the cord.
 *
 * `dial` is the setting (0–1). The music is not an argument. Until 38u-4 it
 * was: the analyser's energy multiplied the stir by up to two inside the
 * solver's step, and mid and treble added a second noise curl wherever there
 * was dye (38u-5), with no cord and nothing on any panel to say so or to turn
 * it off. The owner's rule is that sound moves the plate only through cords
 * and preset patches, so both are one cord now, on every look, from the
 * sound's mids onto this dial (`stirCord`), and the step reads the dial the
 * patch bay folded and nothing else.
 */
import type { SceneMapping, VisualizerSettings } from '../types';

export function stirOf(dial: number): number {
  const t = Math.max(0, Math.min(1, Number.isFinite(dial) ? dial : 0));
  return t * (1 + 3 * t * t * t);
}

/** The same, as it was until PLAN 27c: the dial was the speed, and the music held it to the larger of the dial and 1.2. */
export function stirBefore(dial: number, energy: number | null, impact: number): number {
  const t = dial ?? 0;
  if (energy == null) return t;
  return Math.min(Math.max(t, 1.2), t * (1 + Math.min(1, energy) * impact * 2.0));
}

/*
  What the music added until 38u-4 and 38u-5, in Turbulence's own units, kept
  so the cord's depth can be set from it and `npm run musicstir` can hold the
  cord to it.

  Two terms. The energy multiplied the dial's stir, by at most two. And mid
  and treble (each over 70, as the routes read a band) drove "spin", a curl
  of one octave of noise laid where there was dye: its push a step was
  s·(0.4/3) times the noise's gradient, where Turbulence's is the stir times
  (0.5/3) times the same gradient summed over its octaves (weights 1, 0.55,
  0.30, an r.m.s. of 1.18 at the looks' three). So one unit of s moved the
  dye as 0.8/1.18 = 0.68 of a unit of stir did: EDDY_AS_STIR. It is a
  judgement, not an identity: the eddies were one scale and only under dye,
  and the stir they are folded into is three scales and the whole dish.
*/
export const EDDY_AS_STIR = 0.68;
export function musicStirBefore(dial: number, energy: number, mid: number, treble: number, drive: number): number {
  const clip = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
  const impact = Math.max(0, Number.isFinite(drive) ? drive : 0);
  const stir = stirOf(dial) * Math.min(2, 1 + clip(energy) * impact * 2.0);
  const s = (clip(mid / 70) * 0.6 + clip(treble / 70) * 0.4) * impact;
  return stir + (s > 0.08 ? s * EDDY_AS_STIR : 0);
}

/**
 * The music a cord's depth is set for: the analyser's energy, mid and treble
 * over the loud fifth (by its mids) of the club song the sound checks play
 * (`scripts/arrangement.mjs` at 128 bpm, heard as `npm run kicks` hears it;
 * `npm run musicstir` prints them and fails if they drift from these by a
 * tenth). The whole song's means are 0.27, 59 and 47.5.
 *
 * The loud fifth and not the mean, because the dial's curve steepens: set at
 * the mean, a look low on the dial with a deep cord (Bass Drop, 0.08 and a
 * depth of 0.67) matched over the song and stirred 1.41 times what it had at
 * the loud moments. Set here, every look on the shelf is 0.88 to 1.06 of
 * what it was over each of three songs and 0.85 to 1.02 at their loudest
 * twentieth: where the band is loud it is as it was, and never more.
 */
export const STIR_REF = { energy: 0.39, mid: 81, treble: 77.5 };

/*
  Which reading the cord takes: the mids.

  One cord has to stand for two terms, and the dial it rides is not the stir
  but its fourth-power curve (stirOf), so a reading that swings wide
  overshoots at the top. Measured over three songs (the club song, one 6 dB
  louder, one 12 dB quieter and slower; 2026-11-13), each cord's depth set
  for this comparison so the club song's mean matched, on dials from 0 to 0.9 and Sound Drive
  from 0.3 to 0.8, the worst look's stir against what it was:

    reading   mean, worst song    loudest twentieth
    energy    0.64 to 1.66        up to 3.4 times
    treble    0.86 to 1.35        up to 2.2 times
    volume    1.15 to 1.32        up to 2.0 times
    mid       0.80 to 1.16        0.64 to 1 (never over)

  The energy is the waveform's r.m.s., a quarter on average and three times
  that on a kick, and a cord deep enough to carry the eddies' steady share
  at the average throws the dial to the top on every loud moment. The mids
  sit near their ceiling whenever a band plays and fall away when it stops,
  which is what the eddies did (they read mid at 0.6 and treble at 0.4), and
  on most looks the eddies were the larger of the two terms.
*/

/** The dial that stirs at `speed`: stirOf's inverse, by halving (stirOf rises all the way). */
function dialFor(speed: number): number {
  if (!(speed > 0)) return 0;
  if (speed >= 4) return 1;
  let lo = 0, hi = 1;
  for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (stirOf(m) < speed) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/**
 * How deep the music's cord goes on a look whose Turbulence is `dial` and
 * whose Sound Drive was `drive`: the depth at which the reference music
 * (STIR_REF) puts the dial where the old multiplier and eddies put the stir.
 * A share of the dial's travel (0–1), as every cord's depth is.
 */
export function stirCordDepth(dial: number, drive: number): number {
  const t = Math.max(0, Math.min(1, Number.isFinite(dial) ? dial : 0));
  const want = dialFor(musicStirBefore(t, STIR_REF.energy, STIR_REF.mid, STIR_REF.treble, drive));
  return Math.round(Math.max(0, Math.min(1, (want - t) / (STIR_REF.mid / 100))) * 100) / 100;
}

/** The music's stir as a cord: the sound's mids on Turbulence, every plate. */
export function stirCord(depth: number): SceneMapping {
  return { source: 'sound', feature: 'mid', setting: 'turbulenceScale', depth };
}

/** Is this cord the music's stir (the mids on Turbulence, aimed at every plate)? */
export function isStirCord(m: SceneMapping | null | undefined): boolean {
  return !!m && m.source === 'sound' && m.feature === 'mid' && m.setting === 'turbulenceScale'
    && m.area === undefined && (m.layer === undefined || m.layer === 'all') && m.mode !== 'gate';
}

/** How deep a look's music stir is: its stir cords' depths summed (0 with none), for the phone's slider. */
export function musicStirOf(maps: readonly SceneMapping[] | null | undefined): number {
  let d = 0;
  for (const m of maps ?? []) if (isStirCord(m) && Number.isFinite(m.depth)) d += m.depth;
  return Math.max(0, Math.min(1, d));
}

/**
 * A look's cords with the music's stir set to `depth`: the first stir cord
 * takes it and any other goes, a look without one gains it at the end, and at
 * 0 the cord is taken out (a cord at no depth is not folded, and a list that
 * says what is plugged in should not show one that is not).
 */
export function withMusicStir(maps: readonly SceneMapping[] | null | undefined, depth: number): SceneMapping[] {
  const d = Math.round(Math.max(0, Math.min(1, Number.isFinite(depth) ? depth : 0)) * 100) / 100;
  const out: SceneMapping[] = [];
  let put = false;
  for (const m of maps ?? []) {
    if (!isStirCord(m)) { out.push(m); continue; }
    if (!put && d > 0) out.push({ ...m, depth: d });
    put = true;
  }
  if (!put && d > 0) out.push(stirCord(d));
  return out;
}

/*
  The music's stir, on every look (PLAN 38u-4, 38u-5).

  Until the physics audit of 2026-11-13 the solver's step read the analyser
  itself: the energy multiplied Turbulence's stir by up to two, and mid and
  treble laid a second curl of noise wherever there was dye. Every look
  churned with the band by that and no look said so: with its cords all
  pulled out it still moved to the music, which is the one thing the plate's
  rule (sound reaches it only through cords and preset patches) says cannot
  happen. The owner chose to route it through cords. So the step takes no
  sound, and each look carries what it always did as a cord that can be
  seen, turned and pulled: the sound's mids on Turbulence, at the depth
  that puts its stir with a band playing about where the multiplier and the
  eddies had it for that look's own Turbulence and Sound Drive (lib/stir.ts
  `stirCordDepth`; `npm run musicstir` holds each look within a quarter over
  a song).

  Laid by presets.ts after the looks are written and the pack's are laid
  over theirs, and not typed into each look: it is one rule with one depth
  formula, and a look whose Turbulence is retuned keeps the right cord
  without anyone remembering to. It is beside a look's two or three answers
  to the drums (PLAN 28i-3b), not one of them: those are what a look does on
  a hit, written per look, and this is the stir every look had under them
  all along (`npm run soundpatch` counts them apart).
*/
export function layStirCords(looks: readonly { settings: Partial<VisualizerSettings> }[], dial: number, drive: number): void {
  for (const p of looks) {
    const depth = stirCordDepth(p.settings.turbulenceScale ?? dial, p.settings.audioImpact ?? drive);
    if (depth > 0) p.settings.sceneMappings = [...(p.settings.sceneMappings ?? []), stirCord(depth)];
  }
}
