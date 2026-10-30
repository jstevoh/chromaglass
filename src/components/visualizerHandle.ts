// The handle the visualizer gives the app: types only, moved out of LiquidVisualizer.tsx
// (PLAN 19ai, the size ratchet) so the file need not be read to learn what the app may
// ask of it. LiquidVisualizer.tsx re-exports it, so no importer changed.
import type { QualityGovernor } from '../lib/governor';
import type { VisualizerSettings } from '../types';
import type { PaceSample } from '../lib/scenePacing';
import type { SongEvent, SongShapeState } from '../lib/songShape';
import type { BarNow } from '../lib/barGrid';
import type { LookPhase, FrameDigest, VisualizerRender, SongShapeReport } from '../sim/frameTypes';

export interface LiquidVisualizerHandle {
  /** A song render's hold on the plate; see `VisualizerRender`. Null until the stage is up. */
  render: () => VisualizerRender | null;
  /** The quality governor running the show. */
  governor: () => QualityGovernor | null;
  injectImage: (imageData: ImageData) => void;
  pourVideo: (video: HTMLVideoElement) => void;
  stopPourVideo: () => void;
  /**
   * Pour words into the lead plate: each row drawn at the biggest size its
   * share of the box allows, in `colour` (default: the look's brightest dye;
   * 'contrast' picks an ink that reads against the plate as it is), level on
   * the frame whatever angle the plate is turned to.
   */
  pourText: (rows: { text: string; weight?: number }[], opts?: { colour?: string | 'contrast'; columns?: [number, number] }) => void;
  /** Kicks heard (or predicted) since the plate started: a count to take differences of. */
  kicks: () => number;
  /**
   * The song's shape (`lib/songShape.ts`): where the song is now, and the
   * builds, drops and breakdowns heard lately, each numbered so a reader that
   * polls can take only the ones it has not seen.
   */
  songShape: () => SongShapeReport;
  /**
   * Where the closeup camera is pointed, in plate uv, or null while there is
   * no closeup (MacroCamera.centre): what Hold aims at, so it stays put (QA-12).
   */
  macroCentre: () => { x: number; y: number } | null;
  /** Move the look's working dyes on by one, the way the hue journey would. */
  stepDyes: () => void;
  /** Where a paced scene is (`lib/scenePacing.ts`); the plate follows it at its own rate. 1 and 1 is no pacing. */
  pace: (sample: PaceSample) => void;
  /** A flood across a good share of the lead plate, `gust` (0..1, default 0.8) its size and force. */
  pour: (gust?: number) => void;
  /**
   * Clear the plate and seed it as `presetId`; a user preset passes its own dyes, injection styles and liquids.
   * `phase` is the Ferrofluid (and its Scale) the look asks for, when the caller knows it: the look's settings
   * reach the plate a render after this call, so without it the ferrofluid is laid by the last look's.
   */
  applyPreset: (presetId: string, extras?: { contract?: number[] | null; injectStyles?: string[] | null; liquids?: string[] | null }, phase?: LookPhase) => void;
  /** The dyes, injection styles and liquids in force, for saving the current look as a preset. */
  /** What is on each live layer: how full it is, and the colour of it. */
  layerReport: () => { index: number; fill: number; colour: string }[];
  /** What is left of the Dye Budget on the layer in hand, 0 to 1: the bottle's level (PLAN 35e). */
  dyeRoom: () => number;
  describePlate: () => { contract: number[] | null; injectStyles: string[]; liquids: string[] };
  /**
   * Take on a preset's dyes, injection style and liquids without clearing the
   * plate — the sequencer's way of changing stage, and the desk's Go.
   *
   * `extras` is how a user preset gets adopted. Its dyes are not in the maps
   * here (they live in the saved file), so before this took them the only way
   * to register them was `applyPreset` — which clears. A sequence that
   * changed to one of your own looks cut the plate to black; the built-ins
   * next to it did not.
   */
  adoptPreset: (presetId: string, extras?: { contract?: number[] | null; injectStyles?: string[] | null; liquids?: string[] | null }) => void;
  /** A pressed look change over `seconds`: the old dye thins while the new palette pours in. */
  /** A look fading in over `seconds`; `phase` as for applyPreset: what the incoming look asks of the ferrofluid, laid half way. */
  handoff: (seconds: number, phase?: LookPhase) => void;
  /**
   * Send a look to the back plate alone (PLAN.md §16a), or `null` to have it
   * follow the front again. Over `seconds`: its solver settings fade the way
   * a Go's do, its old dye thins and the look's own is laid in, and from then
   * on it pours the look's dyes, styles and liquids while the front pours
   * its own. `extras` is a user preset's dyes, as for `adoptPreset`.
   */
  sendBack: (presetId: string | null, look: VisualizerSettings | null, seconds: number, name?: string | null, extras?: { contract?: number[] | null; injectStyles?: string[] | null; liquids?: string[] | null }) => void;
  /** Restrict the working palette to `size` of the contract's dyes, led by `lead`; null size = all of them. */
  setPaletteWindow: (size: number | null, lead: number) => void;
  setInjectStyle: (styles: string[]) => void;
  /** What the automation may pour, as liquid ids. An empty list is a plate with only dye on it. */
  setPlateLiquids: (ids: string[]) => void;
  /** Pin the color harmony to a specific palette-index set (music intelligence). */
  setHarmony: (indices: number[]) => void;
  /** User palette lock — overrides auto-rotation, drains, seeds and music. Pass null to unlock. */
  setHarmonyLock: (indices: number[] | null) => void;
  /**
   * Evolve turns the palette for the dye still to come (lib/slowEvolve.ts: at a
   * drop or a breakdown, or every few minutes with no music). Nothing already
   * on the plate changes colour; a palette lock or a hue journey keeps its own.
   */
  evolvePalette: () => void;
  /** Fire a themed dye burst for a lyric word-trigger. */
  triggerTheme: (theme: string, energy?: number) => void;
  /** Re-fire a recorded manual gesture (performance replay). Normalized coords; `layer` defaults to the active one. */
  /**
   * A gesture from any hand: mouse, phone pad, pen, gamepad or MIDI. `amount`
   * (0..1, default 0.5) scales the drop's size or the puff's strength, so a
   * pen pressed harder drops more dye; `dx`/`dy` give a blow its direction
   * (a pen's tilt, a stick's push) instead of a radial puff.
   */
  applyGesture: (g: { tool: string; x: number; y: number; dx?: number; dy?: number; color?: string; clear?: boolean; layer?: number; amount?: number; id?: number }) => void;
  /**
   * A point on the wall (the drawn picture, normalised, y up) as the plate's
   * point under it, through the camera: the plate is wider than the wall,
   * turns with the dish and is magnified by the closeup. `turned` false
   * leaves the dish's turn out, for a hand on the dish (Spin reads its
   * angle as the room sees it). The point itself, until the canvas is up.
   */
  wallToPlate: (u: number, v: number, layer?: number, turned?: boolean) => { x: number; y: number };
  /** A tilt from outside — the phone's gyroscope — in −1..1 per axis. Fades out if not refreshed. */
  setExternalTilt: (x: number, y: number) => void;
  /** Where the picture sits on screen (letterboxed when a stage is attached), for overlays that track the plate. */
  drawnRect: () => DOMRect | null;
  /** What the dye is doing, cheaply, for an instrument that plays the plate. */
  plateReading: (voices: number) => { wetness: number; colour: [number, number, number]; cells: number[]; flow: number; swirl: number } | null;
  /** Film projector: a video file, the camera, or another window, shown through the dye. */
  loadFilmFile: (file: File) => Promise<void>;
  /** A film by address, from the app's own origin (a cartoon on the shelf, lib/cartoons.ts): it streams, where a file is read whole first. */
  loadFilmUrl: (url: string) => Promise<void>;
  /**
   * A camera's picture as the film (lib/cameras.ts): `deviceId` from the
   * film's camera picker, '' for the browser's pick (a phone's back camera,
   * pointed at a dish). `onEnded` fires when the camera is unplugged, and the
   * answer says which camera opened and whether the chosen one was missing.
   */
  startFilmCamera: (deviceId?: string, onEnded?: () => void) => Promise<{ label: string | null; fellBack: boolean }>;
  /**
   * A window, a tab or a screen, picked from the browser's own chooser.
   *
   * `onEnded` fires if the capture stops from the browser's side — the Stop
   * sharing button, or the tab being closed — which is the one way a film
   * source can go away without the app asking. Without it the panel goes on
   * saying "window live" over a projector showing nothing.
   */
  /**
   * Capture a tab, window or screen as the film.
   *
   * `onBlank` fires when the capture yields nothing but black pixels, which a
   * window playing hardware-accelerated video does — see the note at the
   * implementation. The plate cannot tell that from a very dark film, so the
   * operator is told.
   */
  startFilmWindow: (onEnded?: () => void, onBlank?: () => void) => Promise<void>;
  clearFilm: () => void;
  /**
   * A logo or title card laid over the finished frame.
   *
   * Not `injectImage`, which pours a picture into the plate as dye: that is
   * the lovely thing to do with an image and the wrong thing to do with a
   * client's mark, which has to stay readable for three hours. This one sits
   * over the top and does not dissolve.
   *
   * Composited in the shader rather than as an element over the canvas, so it
   * reaches everything that reads the canvas: the projector window, a cast to
   * another screen, the recorder, and another machine capturing this window.
   */
  loadMark: (source: CanvasImageSource, width: number, height: number) => void;
  clearMark: () => void;
  /**
   * Fire the envelopes — a MIDI note, a pad, a finger on the phone.
   *
   * On the handle rather than reached through settings because it is an event,
   * and because the thing firing it should not have to know what an envelope
   * is. `velocity` scales how far they swing, so a hard note hits harder.
   */
  fireEnvelopes: (velocity?: number) => void;
  /**
   * The element the film is playing in, so it can be read back as a sensor
   * as well as shown through the dye. Null when nothing is loaded.
   *
   * Handed out rather than copied: there is one film, and a second video
   * element decoding the same source would double the cost and still drift a
   * frame from what is on the plate.
   */
  filmVideoEl: () => HTMLVideoElement | null;
  /**
   * A second display mirrors this canvas pixel for pixel: render at its size
   * (the projector's pixels) and letterbox it here. Null returns to the window.
   */
  setStage: (size: { width: number; height: number } | null) => void;
}
