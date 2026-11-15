/**
 * The TV's calm loops (PLAN 12-tv-loops): six films of half an hour each,
 * silent, that a Google TV or an Apple TV plays round and round with no Mac on
 * the network.
 *
 * Asked for by the owner, 2026-11-14: "audio free visuals that the appletv
 * and googletv apps can use. like 10 different 30 minute loops that evolve
 * over time and are calming." The TV apps are receivers (12-tv): the plate is
 * WebGPU and a TV's GPU is too weak to run the solver, so everything a TV
 * shows on its own is a film of the solver's frames. These are the app's own
 * Render a song (`hooks/useSongRender.ts`) of a look with Evolve on, made on
 * a Mac by `npm run tvloops` from a song of silence, so nothing in them comes
 * from music: what moves is the liquid and Evolve's slow moves (one theme's
 * dials glided over thirty to ninety seconds, the palette turning every three
 * to five minutes when nothing is heard, lib/slowEvolve.ts).
 *
 * Why a film and not something the TV draws: a TV has no WebGPU in its web
 * view and tvOS has no web view at all, and the owner settled the TV as a
 * receiver. Why made by the render and not the Record button: the render
 * steps the plate a frame at a time on the film's clock, so a half-hour film
 * drops no frame however slow the Mac is, and the same seed draws the same
 * frames, so a loop can be made again after its look is retuned.
 *
 * A liquid never comes back to where it began, so the loop is an edit of the
 * finished film, as the Canvas loop is (PLAN 43b, `npm run loopseam`): the
 * render runs `TV_LOOP_WARM_S` before the loop starts (the look laid on clean
 * glass is a beginning, not the middle of a loop), the loop's thirty minutes,
 * and `TV_LOOP_SEAM_S` more; the loop's first seconds are a crossfade from
 * those last seconds into its own, so its last frame runs on into its first.
 * The plate is not touched; `npm run tvloops -- --judge` holds each file to
 * that.
 *
 * Where they live: GitHub release assets of the pre-release `tv-loops-1` (one
 * file may be up to 2 GiB; these are about 0.6 to 1.4 GB), reached through
 * the website's address, which firebase.json sends on with a 302, so the TV
 * apps carry one address and the files can move (to R2, 12-tv-2g) without a
 * new app. A pre-release and never "latest": the Mac app's updater reads
 * releases/latest (desktop/updates.js).
 *
 * Pure data: read by the TV apps' own copies (12-tv-loops-2) and by the
 * script that makes and judges the films.
 */

export interface TvLoop {
  /** The file's name, and the look's id where it is one look. */
  id: string;
  /** The built-in look it is rendered from (src/presets.ts). */
  look: string;
  /** What the TV calls it. */
  title: string;
  /** The render's seed: the same seed draws the same film. */
  seed: number;
}

/** How long a loop runs before it comes round again. */
export const TV_LOOP_SECONDS = 30 * 60;
/** Rendered before the loop starts, so it starts in the middle of the look's life, not at its laying. */
export const TV_LOOP_WARM_S = 60;
/** The crossfade at the loop's start, from the film's own seconds after the loop into its first ones. */
export const TV_LOOP_SEAM_S = 20;
export const TV_LOOP_FPS = 30;
export const TV_LOOP_WIDTH = 1920;
export const TV_LOOP_HEIGHT = 1080;
/** The pre-release that holds the files. */
export const TV_LOOP_RELEASE = 'tv-loops-1';
/** The address a TV asks for, which the website sends on to the release. */
export const TV_LOOP_ORIGIN = 'https://chromaglass.art/loops/';

/*
 * Six, chosen for calm (the owner asked for ten and settled on six once these
 * were made, 2026-11-15: "Let's stick with 6 loops. We don't need 10"): looks whose liquid moves slowly on its own and
 * keeps changing without music. The Chemical Clock first, because the owner
 * loves it; it keeps remaking itself, the oil looks (Clock Glass, Velvet
 * Underground, Lava Lamp) fold and drift, and Aurora Borealis and Jellyfish
 * Bloom are light through moving liquid. Classic was in the first list and came out after its film: with
 * nothing heard its dye drains, and over the half hour the light per minute
 * fell from 86 to 9 of 255, a black screen by the end (the judge's light line
 * caught it). Clock Glass, cells of oil drifting in water, took its place.
 * Galaxy came out the same way: its light fell to 17.6 against a median
 * minute's 35.9, under half, for a minute of the half hour. Cell Bloom, Oil &
 * Water, Soap Film and Neon Coral Reef were next and were not made.
 * Left out on purpose: the looks made to hit with a band (Bass Drop,
 * Solar Flare, Cyberpunk Neon, Comet River, Acid Trip), the ones that move
 * the whole picture (Fractal Dream's mirror, Macro Bead's chasing camera),
 * and the flat pop ones (Poster, Roy).
 */
export const TV_LOOPS: readonly TvLoop[] = [
  { id: 'chemical-clock', look: 'chemical-clock', title: 'Chemical Clock', seed: 1101 },
  { id: 'clock-glass', look: 'clock-glass', title: 'Clock Glass', seed: 1102 },
  { id: 'aurora-borealis', look: 'aurora-borealis', title: 'Aurora Borealis', seed: 1103 },
  { id: 'jellyfish-bloom', look: 'jellyfish-bloom', title: 'Jellyfish Bloom', seed: 1104 },
  { id: 'velvet-underground', look: 'velvet-underground', title: 'Velvet Underground', seed: 1105 },
  { id: 'lava-lamp', look: 'lava-lamp', title: 'Lava Lamp', seed: 1106 },
];

/** Where a TV fetches a loop. */
export function tvLoopUrl(loop: TvLoop): string {
  return `${TV_LOOP_ORIGIN}${loop.id}.mp4`;
}
