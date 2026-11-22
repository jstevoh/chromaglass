/**
 * Music Shake (PLAN 48f): the cord that puts the music on the dish's
 * speaker, the sound's bass onto Shake.
 *
 * The rule is the plate's: sound moves the liquid only through cords and
 * preset patches. A dish of water on a speaker playing the music is shaken
 * by it, so here the music is a cord on Shake (the dish's acceleration, in
 * g) like any other: it shows in the desk's Patches, its depth is set there
 * and it is pulled like any other. The bass and not the whole level, because
 * a speaker's cone travels most, and so shakes hardest, on the low notes
 * (the acceleration of a millimetre's travel at 40 Hz is a few tenths of a
 * g, the size of the water's threshold; src/lib/faraday.ts).
 *
 * The phone has no patch bay, so its Music Shake slider is this cord's
 * depth, as Music Stir is the stir's (lib/stir.ts); on the desk the same
 * cord is laid in Patches, bass onto Shake.
 */
import type { SceneMapping } from '../types';

/** The music's shake as a cord: the sound's bass on Shake, every plate. */
export function shakeCord(depth: number): SceneMapping {
  return { source: 'sound', feature: 'bass', setting: 'faraday', depth };
}

/** Is this cord the music's shake (the bass on Shake, the whole plate, following)? */
export function isShakeCord(m: SceneMapping | null | undefined): boolean {
  return !!m && m.source === 'sound' && m.feature === 'bass' && m.setting === 'faraday'
    && m.area === undefined && (m.layer === undefined || m.layer === 'all') && m.mode !== 'gate';
}

/** How deep a look's music shake is: its shake cords' depths summed (0 with none). */
export function musicShakeOf(maps: readonly SceneMapping[] | null | undefined): number {
  let d = 0;
  for (const m of maps ?? []) if (isShakeCord(m) && Number.isFinite(m.depth)) d += m.depth;
  return Math.max(0, Math.min(1, d));
}

/**
 * A look's cords with the music's shake set to `depth`: the first shake cord
 * takes it and any other goes, a look without one gains it at the end, and
 * at 0 it is taken out.
 */
export function withMusicShake(maps: readonly SceneMapping[] | null | undefined, depth: number): SceneMapping[] {
  const d = Math.round(Math.max(0, Math.min(1, Number.isFinite(depth) ? depth : 0)) * 100) / 100;
  const out: SceneMapping[] = [];
  let put = false;
  for (const m of maps ?? []) {
    if (!isShakeCord(m)) { out.push(m); continue; }
    if (!put && d > 0) out.push({ ...m, depth: d });
    put = true;
  }
  if (!put && d > 0) out.push(shakeCord(d));
  return out;
}
