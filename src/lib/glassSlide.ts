/**
 * The top glass, still unless a hand or a cord moves it (PLAN 38u-11).
 *
 * Glass Smear is the cover glass sliding over the liquid. In a thin gap the
 * liquid against a moving wall is dragged along with it and the liquid against
 * the still one is held, so the gap fills with a shear (Couette) flow whose
 * mean is half the glass's speed; that is what `thinProject` adds to the plate
 * (passes.ts, `glassX = 0.25 * smearX …`), and the solver's step turns the dial
 * into the glass's speed along a slow wandering direction (fluidSimulation.ts,
 * where `smearX` is set).
 *
 * Until the physics audit of 2026-11-13 the dial's default was 0.3 and
 * twenty-two of the forty-one looks wrote one above zero, so on most looks the
 * glass slid all the time with nobody's hand on it. A real plate does not do
 * that: the cover glass is still until the performer pushes it. The owner
 * chose (2026-11-14) to make the dial's resting place zero, the glass still,
 * and to keep the drift those looks were built around as something the
 * performer can see, turn and pull out: a cord.
 *
 * The cord is LFO 1 (a sine over eight bars, 0..1) on Glass Smear. Its depth
 * is the look's old dial as a share of the dial's travel (0 to 3,
 * deskPins.ts), so at the top of each wave the glass slides as fast as it
 * used to all the time (to a hundredth of the travel, rounded down), and at
 * the bottom it rests. Never faster than the look was written for, half as
 * much on average, and the glass now visibly comes to rest and starts again,
 * which is how a hand on a plate moves it. An LFO and not the sound, because
 * the glass sliding was never the music's: LFOs run on the beat clock, which
 * falls back to a steady tempo in silence, so the look still breathes with
 * nothing playing. Sound reaches the glass only where a look asked for it
 * (bass-drop's hats cords), and those looks keep their own cords and get none
 * from here.
 *
 * Laid by presets.ts over the written looks, like the music's stir
 * (lib/stir.ts `layStirCords`), and not typed into each look: one rule, one
 * depth, and the look's own number stays in the file as the record of how fast
 * it was built to slide. `npm run glassstill` holds every look to it.
 */
import type { SceneMapping, VisualizerSettings } from '../types';

/** Glass Smear's travel, 0..3: the desk's and the patch bay's (deskPins.ts). `npm run glassstill` checks they agree. */
export const GLASS_TRAVEL = 3;

/** The glass's slide as a cord: LFO 1 on Glass Smear, every plate. */
export function slideCord(depth: number): SceneMapping {
  return { source: 'shape', feature: 'lfo1', setting: 'glassSmear', depth };
}

/** Is this cord the glass's slow slide (LFO 1 on Glass Smear, aimed at every plate)? */
export function isSlideCord(m: SceneMapping | null | undefined): boolean {
  return !!m && m.source === 'shape' && m.feature === 'lfo1' && m.setting === 'glassSmear'
    && m.area === undefined && (m.layer === undefined || m.layer === 'all') && m.mode !== 'gate';
}

/** How far a look's glass slides: its slide cords' depths summed (0 with none), for the phone's slider. */
export function glassSlideOf(maps: readonly SceneMapping[] | null | undefined): number {
  let d = 0;
  for (const m of maps ?? []) if (isSlideCord(m) && Number.isFinite(m.depth)) d += m.depth;
  return Math.max(0, Math.min(1, d));
}

/**
 * A look's cords with the glass's slide set to `depth`: the first slide cord
 * takes it and any other goes, a look without one gains it at the end, and at
 * 0 the cord is taken out, so the glass is still and the list of cords does
 * not show one that does nothing. The same rule as the music's stir
 * (lib/stir.ts `withMusicStir`).
 */
export function withGlassSlide(maps: readonly SceneMapping[] | null | undefined, depth: number): SceneMapping[] {
  const d = Math.round(Math.max(0, Math.min(1, Number.isFinite(depth) ? depth : 0)) * 100) / 100;
  const out: SceneMapping[] = [];
  let put = false;
  for (const m of maps ?? []) {
    if (!isSlideCord(m)) { out.push(m); continue; }
    if (!put && d > 0) out.push({ ...m, depth: d });
    put = true;
  }
  if (!put && d > 0) out.push(slideCord(d));
  return out;
}

/**
 * The cord's depth for a look written with Glass Smear at `dial`: its share of
 * the travel, so the wave's top is the old constant speed. Rounded down to
 * hundredths, not to the nearest: rounded to the nearest, soap-film's 0.35
 * became 0.12 of the travel, a top of 0.36, three per cent faster than the
 * look ever slid; rounded down the top is at most a hundredth of the travel
 * under the old speed and never over it.
 */
export function slideDepth(dial: number): number {
  const g = Math.max(0, Number.isFinite(dial) ? dial : 0);
  return Math.floor(Math.min(1, g / GLASS_TRAVEL) * 100 + 1e-9) / 100;
}

/**
 * Every look whose glass slid (its own Glass Smear, or the old default of
 * `oldDefault` where it wrote none) has the dial set to rest and the slide
 * handed to a cord. A look that already has a cord on Glass Smear chose its
 * own motion for the glass and is left as it is.
 */
export function laySlideCords(looks: readonly { settings: Partial<VisualizerSettings> }[], oldDefault: number): void {
  for (const p of looks) {
    const s = p.settings;
    if ((s.sceneMappings ?? []).some(m => m.setting === 'glassSmear')) continue;
    const depth = slideDepth(s.glassSmear ?? oldDefault);
    s.glassSmear = 0;
    if (depth > 0) s.sceneMappings = [...(s.sceneMappings ?? []), slideCord(depth)];
  }
}
