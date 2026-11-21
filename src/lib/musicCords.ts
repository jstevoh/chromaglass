/**
 * The music's hands as cords (PLAN 38v-1).
 *
 * What was there. Until 2026-11-21 the frame loop played the music with hands
 * of its own whenever Sound Drive was over 0.01: a pulse of dye and heat at
 * the plate's middle on the Density route, the glass pressed on the Velocity
 * route, a bloom of droplets and a dose of the look's liquid on every kick, a
 * stream of dye wandering on the mids, sparks of heat and white dye on the
 * treble and a swell wandering on the energy, all scaled by the one Sound
 * Drive. It was on 33 of the 35 built-in looks and on no patch bay: with
 * every cord pulled out the plate still answered the music, which the plate's
 * rule (sound reaches it only through cords and preset patches) says cannot
 * happen, and no one could aim, turn or remove one hand of it. The physics
 * audit of 2026-11-21 found it (RS-43) and the owner chose to route it all
 * through cords, as able to hit as hard as the block or harder.
 *
 * What is here. Each hand is a cord on one of the hand's acts
 * (lib/areaCords.ts): the pulse a dropper pouring at the middle (or in the
 * bass's areas), its heat a heat cord there, the press a Press cord, the
 * bloom a gated dropper on the kick that lets go a slug of drops and a dose
 * of the bottle's liquid, the stream and the swell droppers roaming the plate
 * (or their areas), the colour route a Bottle cord. The sparks are gone: a
 * speck of white dye and a kelvin of heat dropped at random is no hand a
 * projectionist has. Every cord rides Sound Drive as its master
 * (`masters: ['audioImpact']`, read with the passage's loudness, as the block
 * was), so the knob does what it always did; the bloom rides Kick Bloom too.
 * Each has its own depth, so a hand can be turned past where the block had
 * it, and the patch bay shows every one of them.
 *
 * The depths are the block's at Sound Drive's 1x: each hand's rate was written
 * per step at sixty a second, and a cord's is per second, so a laid cord at
 * depth 0.5 pours what the hand poured (`npm run musiccords` holds each to the
 * block's own arithmetic within a tenth, and checks that with the cords
 * pulled loud music lays nothing).
 *
 * Laid by presets.ts after the looks are written, as the music's stir is
 * (lib/stir.ts), from each look's own wiring (`audioMappings`), Sound Drive and
 * areas, so a look retuned keeps the right cords without anyone remembering
 * to; a look saved before is given them once as it is read (lib/userPresets.ts).
 */
import { DEFAULT_SETTINGS, type AudioFeature, type CordMaster, type MusicRole, type SceneMapping, type VisualizerSettings } from '../types';
import { areasForBand, type PlateArea } from './plateAreas.ts';
import { musicHands } from './soundLevels.ts';
import type { MasterGains } from './areaCords.ts';

/** The music's hands' masters: Sound Drive; the bloom rides Kick Bloom as well. */
const DRIVE: CordMaster[] = ['audioImpact'];
const BLOOM: CordMaster[] = ['audioImpact', 'kickBloom'];

/*
  The block's numbers, as cords.

  A dropper at full depth, full reading and a `volume` of 1 pours one drop's
  worth (DROP_AMOUNT, 5) a second (lib/areaCords.ts). The block poured, a step,
  at sixty steps a second, held by the plate's pace and its room as the
  dropper is:
    pulse   reading × 0.025  →  1.5 a second at full, so volume 0.6 at 0.5
    stream  mid01 × 0.06, mid01 the mids over 70 (the cord reads them over
            100, gain 100/70)  →  3.6, volume 1.44 at 0.5 with that gain
    swell   energy × 0.06  →  3.6, volume 1.44 at 0.5
  The bloom laid 5 to 11 droplets a kick, a third to one and a half of
  bass01 each, about 7.3 × the hit in all: a slug of 7.3 at 0.5 is a volume of
  2.9, and 3.2 with the scatter's mean drop at 0.915 of the mean, in about 8 drops. Its ring reached (10 + 14 × bass01) × GRID_SCALE
  cells, 15 to 36 on the 192 plate, a reach of 0.3 of the plate's half-width;
  in an area, a third to most of the area, 0.6 of it.
  The press: lib/squish.ts BASS_PRESS at a full bass, which is PRESS_DEPTH
  at 0.5, the bass over 85 as full (gain 100/85; the energy over 0.85),
  as wide as 40 cells on the 192 plate (0.42 of its half-width) and no wider
  than an area.
  The pulse's heat was 0.018 × the reading a step into one cell, a kelvin a
  second that the solver spread as fast as it came; a heat cord warms a disc,
  so it is laid at 0.05 over a tenth of the plate, which is as much heat a
  second as the cell had over a spot the eye can find.
*/
const PULSE_VOL = 0.6, STREAM_VOL = 1.44, SWELL_VOL = 1.44, BLOOM_VOL = 3.2, BLOOM_DROPS = 8;
const DEPTH = 0.5;

/** The look's wiring, read as the block read it (an absent route is the default's). */
function routes(s: Partial<VisualizerSettings>): { density: AudioFeature; velocity: AudioFeature; color: AudioFeature } {
  const am = s.audioMappings;
  return { density: (am?.density ?? 'bass') as AudioFeature, velocity: (am?.velocity ?? 'bass') as AudioFeature, color: (am?.color ?? 'treble') as AudioFeature };
}

/**
 * The music's cords for a look with these settings, on its `areas` (null for
 * a look on the open plate): what the block did on it, hand by hand.
 *
 * Laid whatever Sound Drive is, Lava Lamp's 0 included: every hand rides
 * Sound Drive as a master, so at 0 they are silent as the block was, and
 * turning Sound Drive up later brings them in. Left out at 0 (as this first
 * did), a look stored with Sound Drive off could never get its hands back:
 * the dial moved nothing and "What the sound moves" snapped back to none.
 */
export function musicCordsFor(s: Partial<VisualizerSettings>, areas: readonly PlateArea[] | null): SceneMapping[] {
  const r = routes(s);
  const out: SceneMapping[] = [];
  const idx = (list: readonly PlateArea[]) => list.map(a => areas!.indexOf(a)).filter(i => i >= 0);
  const bass = areas ? idx(areasForBand(areas, 'bass')) : [];
  const mid = areas ? idx(areasForBand(areas, 'mid')) : [];
  /*
    A hand that turned from area to area of a band, a new one each kick or
    each eight seconds, is a cord in each, its depth split between them: the
    same pour in all, and the hand's depths still add to its 0.5, so a look
    change crosses a hand of three areas as it does a hand of one (`npm run
    desk` holds a cord's summed depth to 0.03 a tick; split by volume, three
    areas at 0.5 each stepped 0.05 at the turn from Classic to Jellyfish).
  */
  const spread = (list: number[], c: SceneMapping): void => {
    if (!areas || list.length === 0) { out.push(c); return; }
    for (const i of list) out.push({ ...c, area: i, depth: round(c.depth / list.length) });
  };
  const sound = (feature: AudioFeature, setting: SceneMapping['setting'], role: MusicRole, more: Partial<SceneMapping>): SceneMapping =>
    ({ source: 'sound', feature, setting, depth: DEPTH, mode: 'follow', masters: DRIVE, role, ...more });

  if (r.density !== 'none') {
    spread(bass, sound(r.density, 'areaPour', 'pulse', { volume: PULSE_VOL, size: areas ? 1 : 0.12 }));
    const heat = sound(r.density, 'areaHeat', 'heat', { depth: 0.05, size: areas ? 0.3 : 0.1 });
    out.push(areas && bass.length ? { ...heat, area: bass[0] } : heat);
  }
  if (r.velocity !== 'none') {
    const press = sound(r.velocity, 'areaPress', 'press', { gain: round(r.velocity === 'energy' ? 1 / 0.85 : 100 / 85), size: areas ? 1 : 0.42 });
    out.push(areas && bass.length ? { ...press, area: bass[0] } : press);
  }
  spread(bass, {
    source: 'hits', feature: 'kickHit', setting: 'areaPour', depth: DEPTH, mode: 'gate', threshold: 0.3, attack: 0, release: 0.1,
    volume: BLOOM_VOL, drops: BLOOM_DROPS, size: areas ? 0.6 : 0.3, bottle: 2, masters: BLOOM, role: 'bloom',
  });
  spread(mid, sound('mid', 'areaPour', 'stream', { volume: STREAM_VOL, gain: round(100 / 70), size: 0.2, wander: areas ? 0.8 : 0.6, bottle: 1 }));
  spread(mid, sound('energy', 'areaPour', 'swell', { volume: SWELL_VOL, size: 0.2, wander: areas ? 0.6 : 0.56, bottle: 3 }));
  /*
    The Color route: the bottle each hand pours from, one cord on the whole
    plate, which every hand reads wherever its area has no Bottle cord of its
    own (AreaHands.picked), as the block turned every area's colours on the
    one route. Laid first on the plate alone, the treble changed no colour on
    Chemical Clock, Bass Drop or Jellyfish (the review of 38v-1); laid in
    each area, a look change faded one out and four in, a step of 0.05 of a
    depth a tick (`npm run desk`). No Sound Drive master: it picks which
    bottle, not how much is poured, so a hand someone patched in still takes
    its colour on the route.
  */
  if (r.color !== 'none') {
    /*
      The block's colour: timbre picked the bottle outright, its share of the
      family; every other route walked the family a bottle every ten seconds
      and shifted it by the reading × π, about three bottles at full, which
      is a Roam Bottle cord (AreaHands pickOf). Depth 0.6 for both: the
      treble's three of five, and the most a cord may differ by between two
      looks for a one-second Go to cross it smoothly (`npm run desk`, 0.03 of
      a depth a tick), which a treble look and a timbre look do. So timbre
      reaches the fourth of five bottles where the block reached the fifth.
    */
    const timbre = r.color === 'timbre';
    out.push({ source: 'sound', feature: r.color, setting: 'areaHue', depth: 0.6, mode: 'follow', role: 'bottle', ...(timbre ? {} : { wander: 1 }) });
  }
  return out;
}

const round = (v: number): number => Math.round(v * 1000) / 1000;

/** Is this cord one of the music's hands? */
export const isMusicCord = (m: SceneMapping | null | undefined): boolean => !!m && typeof m.role === 'string';

/**
 * Give every look its music's cords (presets.ts, after the looks and the
 * pack's are written, beside layStirCords). `areasFor` is a look's areas by id.
 */
export function layMusicCords(looks: readonly { id: string; settings: Partial<VisualizerSettings> }[], areasFor: (id: string) => readonly PlateArea[] | null): void {
  for (const p of looks) {
    const add = musicCordsFor(p.settings, areasFor(p.id));
    if (add.length) p.settings.sceneMappings = [...(p.settings.sceneMappings ?? []), ...add];
  }
}

/**
 * A saved look from before the music's hands were cords, read with them once
 * (lib/userPresets.ts PRESET_VERSION): the cords its own wiring and Sound
 * Drive call for, on the open plate. A look already carrying one is left as
 * it is.
 */
export function withMusicCordsOnce<T extends Partial<VisualizerSettings>>(settings: T): T {
  const maps = Array.isArray(settings.sceneMappings) ? settings.sceneMappings : [];
  if (maps.some(isMusicCord)) return settings;
  const add = musicCordsFor(settings, null);
  return add.length ? { ...settings, sceneMappings: [...maps, ...add] } : settings;
}

/*
  The phone's and the desk's handles on them (the phone shares, never forks).

  `musicHandOf` is how deep a look's hand of one role is: its cords' depths
  added, as a hand spread over three areas is a third in each (0 with
  none). `withMusicHand` sets it, scaling each cord so they keep their
  shares, and at 0 they stay plugged in at 0 (pulled out, a look would have
  to be laid again to get them back); from 0 they share it evenly. `withMusicRoute` is the
  desk's coarse wiring, What the sound moves: the Density route is what the
  pulse and its heat read, Velocity the press, Color the bottle, so changing
  one changes those cords' reading, and "none" sets them to nothing.
*/
export function musicHandOf(maps: readonly SceneMapping[] | null | undefined, role: MusicRole): number {
  let sum = 0;
  for (const c of maps ?? []) if (c.role === role && Number.isFinite(c.depth)) sum += c.depth;
  return round(sum);
}

export function withMusicHand(maps: readonly SceneMapping[] | null | undefined, role: MusicRole, depth: number): SceneMapping[] {
  const d = Math.round(Math.max(0, Math.min(1, Number.isFinite(depth) ? depth : 0)) * 100) / 100;
  const list = maps ?? [], now = musicHandOf(list, role), n = list.filter(c => c.role === role).length;
  return list.map(m => (m.role === role ? { ...m, depth: round(now > 0 ? (m.depth || 0) * d / now : d / n) } : m));
}

/** Which roles each coarse route drives. */
export const ROUTE_ROLES: Record<'density' | 'velocity' | 'color', readonly MusicRole[]> = {
  density: ['pulse', 'heat'], velocity: ['press'], color: ['bottle'],
};

/** What a coarse route reads now: its first cord's feature, 'none' with none. */
export function musicRouteOf(maps: readonly SceneMapping[] | null | undefined, route: keyof typeof ROUTE_ROLES): AudioFeature {
  const roles = ROUTE_ROLES[route];
  const m = (maps ?? []).find(c => c.role !== undefined && roles.includes(c.role) && c.source === 'sound');
  return m ? (m.feature as AudioFeature) : 'none';
}

/**
 * The cords with a coarse route moved to `feature`: its cords read it; with
 * "none" they read nothing (kept, so choosing a reading again brings them
 * back). A look with no cord for the route gains the music's ones for it.
 */
export function withMusicRoute(settings: Partial<VisualizerSettings>, route: keyof typeof ROUTE_ROLES, feature: AudioFeature, areas: readonly PlateArea[] | null): SceneMapping[] {
  const roles = ROUTE_ROLES[route];
  const maps = settings.sceneMappings ?? [];
  if (maps.some(m => m.role !== undefined && roles.includes(m.role))) {
    return maps.map(m => (m.role !== undefined && roles.includes(m.role) ? { ...m, feature } : m));
  }
  if (feature === 'none') return [...maps];
  const am = { ...(settings.audioMappings ?? { velocity: 'bass', density: 'bass', color: 'treble', rotation: 'none' }), [route]: feature } as VisualizerSettings['audioMappings'];
  const add = musicCordsFor({ ...settings, audioMappings: am }, areas).filter(m => m.role !== undefined && roles.includes(m.role));
  return [...maps, ...add];
}

/**
 * What each master is worth this frame, written into `out` (reused by the
 * caller: one object for the show): Sound Drive as the music's hands always
 * read it (lib/soundLevels.ts musicHands, its 0.45 the 1x, times the
 * passage's loudness), Kick Bloom kept to its 0 to 4.
 */
export function setMasters(out: MasterGains, s: Partial<VisualizerSettings>, sound: { passage?: number } | null): MasterGains {
  out.audioImpact = musicHands(s.audioImpact ?? 0.45, sound?.passage);
  const kb = s.kickBloom;
  out.kickBloom = Number.isFinite(kb) ? Math.max(0, Math.min(4, kb as number)) : 1;
  return out;
}

/** A new look's settings (New Look, New Palette): the defaults with the music's hands, as a new look answered the music before they were cords. */
export const NEW_LOOK: VisualizerSettings = withMusicCordsOnce(DEFAULT_SETTINGS);
