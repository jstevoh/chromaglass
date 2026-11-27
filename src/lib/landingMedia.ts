/**
 * The webpage's "Real looks from the app" grid (PLAN.md 34a-3): which looks it
 * shows, in what order, and how each card's still is made.
 *
 * One list for two readers: the webpage (src/components/Landing.tsx) draws a
 * card for each entry from public/landing/looks/<id>.webp, and the script that
 * photographs those stills on the owner's Mac (`npm run landinglooks`) opens
 * each entry's look in the app, applies its settings or its picture, and
 * writes the WebP. Keeping both on one list is what stops a card from naming
 * a look the stills were never taken of, or a still going stale under a
 * renamed card; `npm run landinghero` holds the two together.
 *
 * Why these: the first eight are the looks the grid has shown since 28i-1,
 * each a different liquid (ferrofluid, curtains, lens pools, opaque poster
 * dyes, a bead close up, bells, lacing, a reaction). The four after them are
 * the newer things the app does that a still can say in one look (the owner,
 * 2026-11-21): the Belousov-Zhabotinsky dish keeping its own time, a liquid
 * between polarisers lighting in the colours of its own strain (31p-1), the
 * dyes taken from a picture (43d), and the splodascope's crowd of oil drops on
 * the lamp (47z-1). Twelve, so the grid's four columns close on a full row.
 */

import type { VisualizerSettings } from '../types';

export interface LandingLook {
  /** The card's id, its still's file name, and the look it photographs unless `look` says another. */
  id: string;
  name: string;
  /** One line under the name: the look's own description, shortened. */
  line: string;
  /** The preset the still is taken of, when the card is a feature shown on a look rather than the look itself. */
  look?: string;
  /** Settings laid on the running look before the frames are counted, as the desk would. */
  settings?: Partial<VisualizerSettings>;
  /** The card's dyes come from a picture handed to the desk's "Palette from a picture"; the card shows the picture too. */
  picture?: boolean;
}

/** Each still's size: two pixels a CSS pixel for the widest card (480 wide at four columns on a 2000-pixel window). */
export const LANDING_LOOK_SIZE: readonly [number, number] = [960, 600];
/** A still's ceiling in bytes: twelve of them, loaded lazily under the fold, about 0.6 MB together at worst. */
export const LANDING_LOOK_MAX_BYTES = 60_000;

export const LANDING_LOOKS: readonly LandingLook[] = [
  { id: 'magnet-garden', name: 'Magnet Garden', line: 'Black ferrofluid on a golden pool fingers into a labyrinth over a magnet.' },
  { id: 'aurora-borealis', name: 'Aurora Borealis', line: 'Curtains of jade and lime rippling across a night sky.' },
  { id: 'cell-bloom', name: 'Lens Pools', line: 'Three pools of silicone and oil turning under a magnifier.' },
  { id: 'poster-1969', name: 'Poster, 1969', line: 'Orange against ultramarine, flat like a Fillmore poster, under two sheets of moiré that beat.' },
  { id: 'macro-bead', name: 'Macro Bead', line: 'The camera follows one bead close up: domed, wet, razor edges.' },
  { id: 'jellyfish-bloom', name: 'Jellyfish Bloom', line: 'Magenta and lavender bells pulsing through teal water.' },
  { id: 'lace-run', name: 'Lacing Run', line: 'A tongue of amber dye dragging black lace behind it.' },
  { id: 'neon-coral-reef', name: 'Neon Coral Reef', line: 'A reaction grows coral across the glass, branch by branch.' },
  { id: 'chemical-clock', name: 'Chemical Clock', line: 'The Belousov-Zhabotinsky reaction: blue waves curl into spirals that keep their own time.' },
  {
    id: 'polarised-light', name: 'Polarised Light', look: 'milk-marble',
    line: 'Between crossed polarisers the stretched liquid lights in the colours of its own strain.',
    // Crossed sheets with the quarter-wave plates in (the setting's defaults) and the stretch turned up a step,
    // so the orders climb past straw into the reds and blues (31p-1: the colours want white light, on a lamp ground).
    settings: { polariser: 1, analyserAngle: 90, quarterWave: 1, birefringence: 0.55 },
  },
  { id: 'picture-palette', name: 'Palette From a Picture', look: 'aurora-borealis', picture: true, line: 'Hand it a photo or a video and the dyes take its colours.' },
  { id: 'splodascope', name: 'Splodascope', line: 'A crowd of oil drops packed edge to edge on the lamp: they press together without merging.' },
];

/**
 * The hero's loop (PLAN.md 34a-2): a silent montage of looks filmed by the Mac
 * app playing to music, cut from the Song films the channel's rescore renders
 * (34a-8, `npm run sitefilms`), so every second of it is the real solver on a
 * real GPU and not a mock-up. Two shapes: a wide one for a laptop and a tall
 * one for a phone held upright, which `object-cover` would otherwise crop to a
 * sliver of the middle. Each comes as WebM (VP9) and MP4 (H.264), the second
 * for the Safaris that will not play the first. The poster is the loop's first
 * frame, so the change from still to moving is not seen.
 */
export const LANDING_HERO = {
  wide: { webm: '/landing/hero/wide.webm', mp4: '/landing/hero/wide.mp4', poster: '/landing/hero/wide.webp', size: [1280, 720] as const },
  tall: { webm: '/landing/hero/tall.webm', mp4: '/landing/hero/tall.mp4', poster: '/landing/hero/tall.webp', size: [720, 1280] as const },
  /** A screen narrower than this aspect (width over height) gets the tall loop. */
  tallBelow: 0.8,
  /** Each file's ceiling in bytes: a visitor on a phone's data plan pays for this before the first scroll. */
  maxBytes: 1_600_000,
  /**
   * The montage, in order: each a film the rescore renders (its id) and the
   * second its piece starts at. `npm run landingclips` cuts `seconds` of each,
   * cross-fades one into the next over `blend`, and the last into the first.
   */
  films: [
    { id: 'undertow', at: 40 }, // Neon Coral Reef: cyan and red folding into each other
    { id: 'distant-sun', at: 25 }, // Galaxy: gold ribbons on black
    { id: 'machina', at: 95 }, // Velvet Underground: red and blue bodies on violet
  ] as readonly { id: string; at: number }[],
  seconds: 5,
  blend: 1,
};

/**
 * The "plays to your music" clip (PLAN.md 34a-2): twenty seconds of one Song
 * film with its sound, muted until a tap, so the page shows what the hero
 * cannot, the plate answering the music. The music is the rescore's (34a-8),
 * released under Creative Commons Attribution, and its credit is the one the
 * licence asks for, in the form the channel's films carry it.
 */
export const LANDING_MUSIC = {
  webm: '/landing/music/clip.webm',
  mp4: '/landing/music/clip.mp4',
  poster: '/landing/music/clip.webp',
  maxBytes: 3_000_000,
  look: 'Neon Coral Reef',
  title: 'Undertow',
  artist: 'Scott Buckley',
  page: 'https://www.scottbuckley.com.au/library/undertow/',
  licence: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  /** Where it is cut from: the rescore's film of the track (its id), the second it starts at, and how long. */
  film: { id: 'undertow', at: 60, seconds: 20 },
};
