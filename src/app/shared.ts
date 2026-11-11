import { type MusicSettings, DEFAULT_MUSIC_SETTINGS } from '../lib/musicTypes';
import { findPreset, PRESETS } from '../presets';
import { stream } from '../lib/rng';
import { pickLook } from '../lib/lookPick';
import { isPackLocked } from '../lib/tierGates';
import type { VisualizerSettings } from '../types';

/**
 * What App and its hooks both read (PLAN 19ai-8): the look the page opens on,
 * the shapes of an armed look and the wall's look, and the keys the sound and
 * the room camera are kept under.
 */
export const MUSIC_SETTINGS_KEY = 'chromaglass-music-settings';

export function loadMusicSettings(): MusicSettings {
  try {
    const raw = localStorage.getItem(MUSIC_SETTINGS_KEY);
    if (raw) return { ...DEFAULT_MUSIC_SETTINGS, ...JSON.parse(raw) };
  } catch { /* fall through */ }
  return { ...DEFAULT_MUSIC_SETTINGS };
}

export type AudioSource = 'none' | 'microphone' | 'system' | 'file' | 'simulated' | 'drone';

export const AUDIO_INPUT_KEY = 'chromaglass-audio-input';

/**
 * Where the show is listening, for as long as this tab lives.
 *
 * It used to open the microphone on load, every load, which meant a permission
 * prompt in front of the plate before anyone had asked for one. Then the choice
 * was remembered in `localStorage` and came back with every launch, and a first
 * visit's first click started the band on its own, so the Sound panel's Source
 * opened on Mic or Band and not on Off (the owner, 2026-10-22: the source is
 * None whenever the app opens). It is `sessionStorage` now: a new tab or a
 * relaunched app opens on Off whatever look loads, and the pick still survives a
 * reload of the tab, which a gig has to be able to do without losing the input.
 * Nothing is opened on its own: the microphone comes back only if the browser
 * already says permission is granted (so no prompt appears), and anything else
 * waits for a click.
 */
export const AUDIO_SOURCE_KEY = 'chromaglass-audio-source';

/**
 * The Mac app's kept System audio (PLAN 14y-2), in `localStorage`, so it
 * outlives the app: '1' while System audio is the source, gone otherwise.
 *
 * 14y opens every launch on Off, because a Mic or a Band that came back by
 * itself was a device opened, or a band playing, that nobody asked for. The
 * owner, 2026-11-10, after the Mac app came back from an update on Off in
 * the middle of a stream rehearsal: "I shouldn't have to click the system
 * audio ever." System audio in the Mac app asks for nothing at open (macOS
 * asks once, the first time, and remembers), plays nothing and is what a
 * live stream is run with, so it alone is kept across launches, and only in
 * the Mac app: in a browser it is a tab picker, which may never open itself.
 * Its own key, not AUDIO_SOURCE_KEY's: a pick an older version left in
 * `localStorage` under that one must still not come back (`npm run opensource`).
 */
export const MAC_SYSTEM_AUDIO_KEY = 'chromaglass-mac-system-audio';

/**
 * The room camera lives outside the settings: a preset carries how hard the
 * room drives the plate, never whether a camera is switched on or which one.
 * Loading someone else's look should not open your camera.
 */
export const SCENE_ON_KEY = 'chromaglass-scene-on';

/**
 * The look the app opens on.
 *
 * It was Classic every time, which is a fine look and a poor introduction:
 * the plate can do thirty other things and the first one anybody saw was
 * always the same one. Chosen once per load rather than per render, because
 * "the look you arrived on" should not change under you when React re-renders.
 *
 * Macro looks are left out — a closeup of one bead is a strange first
 * impression of a light show — and `?look=<id>` pins it, which is how the
 * harnesses stay deterministic without the app having to be boring.
 *
 * The pick is the show's `show.opening` stream (lib/rng.ts), so it is still a
 * different look most nights and the same look on the same `?seed=`: the
 * look a render opens on is part of the film.
 */
export const OPENING_LOOK: string = (() => {
  try {
    const asked = new URLSearchParams(window.location.search).get('look');
    const named = asked ? findPreset(asked) : undefined;
    if (named) return named.id;
  } catch { /* no window: the default below */ }
  // Never an art pack's look (lib/lookPick.ts): the licence that says whether
  // this copy has the pack is not read yet when the first look is chosen, and
  // a first impression is the liquid, not the sheets laid on it.
  return pickLook(PRESETS, stream('show.opening').float, { locked: (pack) => !!pack })?.id ?? 'classic';
})();

/**
 * A random shipped look, as the phone's Surprise me and a new song in "New
 * preset" mode pick one: weighted so an art pack counts as one choice, not as
 * each of its looks, never a pack this copy does not have, and not the liquid
 * now on the plate or one picked lately (lib/lookPick.ts, PLAN 45a-13).
 */
export const randomLook = (currentId: string | null, rand: () => number) =>
  pickLook(PRESETS, rand, { currentId, locked: isPackLocked });

/**
 * What the wall shows while the desk builds on a copy (PLAN.md 8b): the look
 * as it was when Preview took the desk off the wall, or as Send to wall last
 * left it, and the counters the wall's engine had seen, so that the desk's
 * clears and seeds on the copy are not replayed on the wall.
 */
export interface WallLook {
  settings: VisualizerSettings;
  /** Where a Send to wall's fade is taking `settings`; Live mid-fade puts the desk there, not halfway. */
  target: VisualizerSettings | null;
  presetId: string | null;
  /** The look a cast receiver lays (`activePresetId`, which also names an edited look). */
  castPresetId: string | null;
  presetSeq: number;
  seedCount: number;
  clearTrigger: number;
  drainTrigger: number;
  spinFlick: { seq: number; layer: number } | undefined;
  /** The back plate's own look on the wall (16a), which a Send back on the copy does not change. */
  backLook: { id: string; name: string; leaving?: boolean } | null;
  /** The saved look the desk had open, so Live's Save over writes the look that is open. */
  docId: string | null;
  plate: { contract: number[] | null; injectStyles: string[]; liquids: string[] } | null;
}

/**
 * What Go will send: a look (built-in or saved) with any controls a set item
 * lays on top, or a stage sequence. `item` is the set item it came from, when
 * it came from one, so the desk can light that row and not every row that
 * happens to hold the same look.
 */
export interface ArmedLook {
  id: string;
  name: string;
  settings: Partial<VisualizerSettings>;
  item?: string;
  /** Its own fade, seconds; absent, the desk's. */
  fade?: number;
  /** The strip the desk shows while it is live. */
  rides?: (keyof VisualizerSettings)[];
  /** A stage sequence to start rather than a look to send. */
  sequence?: string;
}
