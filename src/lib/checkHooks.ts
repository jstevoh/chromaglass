/**
 * The app's hooks for the checks: every `window.chromaglass*` and `window.__cg*`
 * name the app's own code sets for a check or reads from one, in one place
 * (PLAN 19ai-4). Names a harness keeps for itself on the page (`__cgFrame`,
 * `__cgShot`, `__cgSockets`, … set and read by the script's own init code,
 * never by `src/`) are the script's and are not declared here.
 *
 * These are the checks' interface to the running app. A harness in
 * `scripts/` drives a real page in a browser, and the only door it has into
 * the show is `window`: it sets a setting, cues a look, fires a pad, reads
 * the plate's report, all by a name hung there. Sixty-odd scripts use them.
 * They were declared nowhere: each was set with its own cast
 * (`(window as unknown as { chromaglassTempo?: unknown }).chromaglassTempo =`)
 * in whichever file had the state, so writing a check started with grepping
 * `App.tsx` and `LiquidVisualizer.tsx` for the name, and nothing said which
 * names existed or what they took.
 *
 * So this file says. It declares each on `Window`, with the shape the code
 * that sets it gives it, the file that sets it, and whether it is there only
 * with `?debug` on the page's address (most are: a visitor's show carries
 * none of the plate's back doors). It is types only and changes nothing at
 * run time; the setters still cast as they did, so the move that added it
 * touched no setter. A new hook is a line here in the same PR as its setter,
 * and a setter that is next edited can drop its cast and assign
 * `window.<name>` directly, which this declaration then checks.
 *
 * Not here: the windows' own bridges, which the app's code (not a check)
 * reads across `window.opener` (`__chromaglassMirror`, `__chromaglassFrame`,
 * `__chromaglassWallBack`: the show and its cast window, `useCastSession`,
 * `CastDisplay`), and the Mac and iPhone bridges (`desktop/preload.cjs`,
 * `lib/appLink.ts`). Those are declared where they are used.
 *
 * Return types are `unknown` where the hook hands back a report the check
 * reads by field (`chromaglassDebug()` builds several hundred), since the
 * scripts are plain JavaScript and the report's shape is the code that
 * builds it, not a copy kept here.
 */
import type { VisualizerSettings } from '../types';
import type { OutputConfig } from './outputConfig';

declare global {
  interface Window {
    // ── The plate (components/LiquidVisualizer.tsx, `?debug`) ──

    /** The plate's whole report: the solver, the GPU, the governor, the hands, the music's ride. Its own fields are also its calls (`plateAt`, `throwFrames`, `simulateOutOfMemory`, …). */
    chromaglassDebug?: () => unknown;
    /** The ride's counters themselves, read every frame by `npm run renders` (the report is too much to build per frame). */
    __cgRiding?: unknown;
    /** Turn the plates to given angles in radians, to reproduce a report's plate exactly. */
    chromaglassRotation?: (angles: number[]) => void;
    /** The video pour and the film's video, for `npm run cartoons`. */
    __cgVideo?: () => unknown;

    // ── The show and the desks (App.tsx, `?debug`) ──

    /** The tempo the show is following now, or null. */
    chromaglassTempo?: () => unknown;
    /** Patch the Wall's output (projector) config. */
    chromaglassOutput?: (patch: Partial<OutputConfig>) => void;
    /** Cue a look as the desk would (it fades in on the next Go). */
    chromaglassApplyPreset?: (id: string) => void;
    /** Go to a look now, over `seconds` if given. */
    chromaglassGo?: (id: string, seconds?: number) => void;
    /** Fire a controller's "this was hit" signal by its key, as the MIDI handler does. */
    chromaglassTouch?: (key: string, value?: number) => void;
    /** Run any one-shot action by name (the list a pad, a phone or OSC reaches). */
    chromaglassAction?: (name: string) => void;
    /** Set settings on the running plate, and read them back. */
    chromaglassSettings?: (patch?: Partial<VisualizerSettings>) => VisualizerSettings;
    /** The quality governor's state, or null before the plate is up. */
    chromaglassGovernor?: () => unknown;
    /** Turn ambient mode on or off; returns whether it is on. */
    chromaglassAmbient?: (on?: boolean) => boolean;
    /** The patch sanitiser a saved look goes through (`lib/sanitizePatch`). */
    chromaglassSanitizePatch?: (patch: unknown) => unknown;
    /** Pick the hand's tool. */
    chromaglassTool?: (tool: string) => void;
    /** Pick the layer a tool lays on, 0 or 1. */
    chromaglassLayer?: (layer: number) => void;
    /** Pick the bottle a tool pours from. */
    chromaglassLiquid?: (id: string) => void;
    /** Recolour a bottle. */
    chromaglassLiquidColour?: (id: string, hex: string) => void;
    /** The bottles on the shelf, by id. */
    chromaglassBottles?: () => string[];
    /** Set a tool's Amount. */
    chromaglassToolAmount?: (tool: string, v: number) => void;
    /** Play a track from the shelf (the first when no `src` is given); returns the track. */
    chromaglassMusic?: (src?: string) => unknown;
    /** The song shows the show knows. */
    chromaglassSongs?: () => unknown;
    /** Start a song's show; returns its status. */
    chromaglassSongStart?: (id: string, opts?: { skip?: string[]; duration?: number }) => unknown;
    /** The song show for a title and artist, if there is one. */
    chromaglassSongFor?: (title: string, artist: string) => unknown;
    /** Stop the song's show. */
    chromaglassSongStop?: () => void;
    /** Pour rows of text onto the plate. */
    chromaglassPourText?: (rows: { text: string; weight?: number }[], opts?: { colour?: string; columns?: [number, number] }) => unknown;
    /** Start the bench (`npm run bench`). */
    chromaglassBench?: (opts?: unknown) => void;
    /** The cast session as the show sees it. */
    chromaglassCastState?: () => unknown;
    /** What a render could leave running in the live show: fades and glides on the film's clock. */
    chromaglassRenderPending?: () => { lookFade: boolean; dimmerFade: boolean; glides: number };
    /** Render the loaded song (or the bytes given) to hashed frames, for `npm run render-app`. */
    chromaglassRender?: (o: { song?: ArrayBuffer; width: number; height: number; fps: number; seed: number; maxFrames?: number }) => Promise<unknown>;
    /** The MIDI input and the gamepad as the desk sees them. */
    chromaglassInputs?: () => unknown;

    // ── Set by a check, read by the app ──

    /** An array a check puts here to have every level a take writes pushed onto it (App.tsx `traceFade`); nothing is kept when it is absent. */
    __cgFadeLog?: unknown[];
    /** The licence key's public key, swapped for a test pair by the licence checks (`lib/licenseKey.ts`). */
    __cgTestLicensePublicKey?: JsonWebKey;

    // ── Elsewhere (the file and its gate on each line) ──

    /** The cast window's own report (components/CastDisplay.tsx, `?debug`). */
    chromaglassCast?: () => unknown;
    /** Arm a fault in the named panel guard, or disarm with null (components/PanelGuard.tsx, `?debug`). */
    chromaglassPanelFault?: (name: string | null) => void;
    /** The panel guards now mounted (components/PanelGuard.tsx, `?debug`). */
    chromaglassPanels?: () => string[];
    /** The hex-to-colour cache's size, a lookup, and a membership test (constants.ts, PLAN 14n; always). */
    chromaglassHexCacheSize?: () => number;
    chromaglassHexToRgb?: (hex: string) => { r: number; g: number; b: number };
    chromaglassHexCacheHas?: (hex: string) => boolean;
    /** Fail a named pipeline's build, and clear those failures (gpu/kit.ts, S17; always). */
    chromaglassFailPipeline?: (name: string) => void;
    chromaglassResetFailures?: () => void;
    /** The show's seed, as `?seed=` would set it from a fresh load (lib/rng.ts; always). */
    __cgSeed?: number;
    /** The opening's record: what it waited on and why it left (lib/intro.ts; always). */
    __cgIntro?: unknown;
    /** Ask for the app's modules once the landing page has loaded (the page's preload script, vite.config.ts; main.tsx calls it). */
    __cgPreloadApp?: () => void;
  }
}

export {};
