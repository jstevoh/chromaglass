/**
 * Features onto settings, from every source that has something to say.
 *
 * Lives out here rather than in the visualizer because it is arithmetic and
 * nothing else — no DOM, no WebGL, no React — which is what lets
 * `scripts/scene.mjs` check it against a reading it made up. It got that
 * treatment when it stopped being a single-source function: summing two
 * sources, holding each one's staleness separately and clamping the result to
 * a setting's own travel is three chances to be subtly wrong, and none of them
 * would show on a plate as anything but "that looks a bit much".
 */

import { ROOM_STALE_MS } from './roomStir';
import { getSceneValue, type SceneReading } from './sceneSense';
import type { VisualizerSettings } from '../types';
import { LEARNABLE_SETTINGS } from './midi';

/**
 * How far each setting the room may ride can travel. Shared with the MIDI
 * faders on purpose: a scene mapping and a knob move a control over the same
 * range, so "half depth" means the same thing whichever hand is on it.
 */
export const SETTING_TRAVEL: Partial<Record<keyof VisualizerSettings, { min: number; max: number }>> =
  Object.fromEntries(LEARNABLE_SETTINGS.map(s => [s.key, { min: s.min, max: s.max }]));

/**
 * The scene mappings folded into a settings object.
 *
 * Returns `base` untouched when there is nothing to fold in, so the ordinary
 * case — no camera, or no mappings — costs one comparison and no copying.
 */
/**
 * Features onto settings, from every source that has something to say.
 *
 * One mapping list, read by the room and by the film, each with its own master
 * depth. That is deliberately not two lists: "how busy → Turbulence" means the
 * same thing whether the busyness is a crowd or a chase sequence, and an
 * operator who had to build the mapping twice would build it once and wonder
 * why the other source did nothing.
 *
 * The offsets add. With both dials up a busy room during a busy reel pushes
 * further than either alone, which is what anyone would expect from turning
 * two things up, and the clamp to the setting's own travel is what stops that
 * running away.
 */
export function applySceneMappings(
  base: VisualizerSettings,
  sources: readonly { reading: SceneReading | null; impact: number }[],
  into: VisualizerSettings,
  /** Passed in rather than read here, so staleness can be tested without a clock. */
  now: number = performance.now(),
): VisualizerSettings {
  const maps = base.sceneMappings;
  if (!maps || maps.length === 0) return base;
  const live = sources.filter(s =>
    s.impact > 0 && s.reading && s.reading.ready && now - s.reading.at <= ROOM_STALE_MS);
  if (live.length === 0) return base;

  Object.assign(into, base);
  for (const m of maps) {
    if (!m || m.feature === 'none' || !m.depth) continue;
    const travel = SETTING_TRAVEL[m.setting];
    if (!travel) continue;
    const current = base[m.setting];
    if (typeof current !== 'number') continue;
    let moved = current;
    for (const s of live) {
      moved += getSceneValue(s.reading!, m.feature) * m.depth * s.impact * (travel.max - travel.min);
    }
    (into as unknown as Record<string, number>)[m.setting] =
      moved < travel.min ? travel.min : moved > travel.max ? travel.max : moved;
  }
  return into;
}

