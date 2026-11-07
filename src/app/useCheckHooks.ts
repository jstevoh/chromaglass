import { useEffect, type RefObject, type Dispatch, type SetStateAction } from 'react';
import { touch } from '../lib/midiTouch';
import type { MidiAction } from '../lib/midi';
import type { VisualizerSettings, LiquidType } from '../types';
import { isGlobalAmbientMode } from '../lib/ambient';
import { sanitizePatch } from '../lib/sanitizeSettings';
import { clampAmount } from '../lib/toolAmount';
import { LIBRARY, type Track } from '../lib/musicLibrary';
import { showFor, type SongShow } from '../lib/songShows';
import type { BenchOptions } from '../lib/bench';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';
import type { SongShowRuntime } from '../hooks/useSongShows';

/**
 * The checks' doors into the running app (`lib/checkHooks.ts`): with `?debug`
 * on the page's address, a harness can cue a look, fire an action, set a
 * setting, pick a tool or a bottle, play a track or start a song's show, each
 * the way the control a hand would use does.
 *
 * Installed once, after every hook whose refs and setters it reaches, which is
 * why it is called last: in App it sat near the top and reached forward through
 * refs, which a hook cannot. Effects run in call order within one commit and
 * nothing calls these until the page has drawn, so a check sees them as before.
 */
interface CheckHooksDeps {
  cuePresetRef: RefObject<((id: string) => void) | null>;
  goLookNowRef: RefObject<((presetId: string, seconds?: number | undefined) => void) | null>;
  runActionRef: RefObject<((a: MidiAction) => void) | null>;
  setSettings: Dispatch<SetStateAction<VisualizerSettings>>;
  settingsRef: RefObject<VisualizerSettings>;
  wallRef: RefObject<LiquidVisualizerHandle | null>;
  setAmbientModeRef: RefObject<(on: boolean) => void>;
  activeTool: "dropper" | "spray" | "splatter" | "pour" | "streak" | "blow" | "press" | "finger" | "magnet" | "spin";
  setActiveTool: Dispatch<SetStateAction<"dropper" | "spray" | "splatter" | "pour" | "streak" | "blow" | "press" | "finger" | "magnet" | "spin">>;
  setActiveLayer: Dispatch<SetStateAction<number>>;
  setSelectedLiquidId: Dispatch<SetStateAction<string>>;
  updateLiquidColor: (id: string, color: string) => void;
  liquidTypesRef: RefObject<LiquidType[]>;
  setToolAmounts: Dispatch<SetStateAction<Record<string, number>>>;
  playTrackRef: RefObject<(t: Track) => void>;
  songShowsRef: RefObject<SongShow[]>;
  songRuntimeRef: RefObject<SongShowRuntime>;
  startBenchRef: RefObject<((opts?: BenchOptions | undefined) => Promise<void>) | null>;
}

export function useCheckHooks({
  cuePresetRef, goLookNowRef, runActionRef, setSettings, settingsRef, wallRef, setAmbientModeRef,
  activeTool, setActiveTool, setActiveLayer, setSelectedLiquidId, updateLiquidColor, liquidTypesRef,
  setToolAmounts, playTrackRef, songShowsRef, songRuntimeRef, startBenchRef,
}: CheckHooksDeps) {
  // `npm run shots` photographs the plate at 16:9, which is wider than the
  // width the overlay's preset menu exists at — above 1024px the desk owns the
  // window. Rather than photograph a narrow app, it applies presets through
  // this. The picture is what that harness is about; `npm run qa` is the one
  // that drives the menu a hand would use.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('debug')) return;
    window.chromaglassApplyPreset =
      (id: string) => { cuePresetRef.current?.(id); };
    // A Go to a look over a fade, as the palette's ⇧⏎ does (`npm run bottles` fades a look in with it).
    window.chromaglassGo =
      (id: string, seconds?: number) => { goLookNowRef.current?.(id, seconds); };
    /*
      Fire the controller's "this was hit" signal by hand.

      For the harness only, and it exists because the browser it drives has no
      Web MIDI at all — so the one thing a check could not otherwise do is
      prove that a pad press reaches the screen. This is the same call the MIDI
      handler makes and nothing else about the path is faked: the subscription,
      the flash and the timer are the real ones.
    */
    window.chromaglassTouch =
      (key: string, value?: number) => { touch(key, value); };
    /*
      Fire any of the one-shot actions by name.

      The same list a pad, a phone or an OSC message reaches, so a harness can
      put the show into a state — automation on, the sequencer running — that
      it would otherwise have to find a button for. Written for the motion
      measurements, which spent several runs quietly measuring a plate whose
      automation was off.
    */
    window.chromaglassAction =
      (name: string) => { runActionRef.current?.(name as MidiAction); };
    /*
      Set any setting from the harness.

      `npm run detail` judges a frame by numbers, and the question it exists to
      answer — how much of the softness is the solver and how much is the
      renderer — needs the same plate photographed under several settings
      rather than several plates. Driving the panel for that would mean a
      different look each time; this changes one value on the running plate.
    */
    window.chromaglassSettings =
      (patch?: Partial<VisualizerSettings>) => {
        if (patch) setSettings(prev => ({ ...prev, ...patch }));
        // Called with nothing, it says what the settings are (npm run qa reads the camera's aim).
        return settingsRef.current;
      };
    window.chromaglassGovernor =
      () => wallRef.current?.governor?.() ?? null;
    window.chromaglassAmbient =
      (on?: boolean) => {
        if (typeof on === 'boolean') setAmbientModeRef.current(on);
        return isGlobalAmbientMode();
      };
    window.chromaglassSanitizePatch = sanitizePatch;
    // Pick a tool, as the tool buttons do: `npm run tools` uses every one.
    window.chromaglassTool =
      (tool: typeof activeTool) => { setActiveTool(tool); };
    // Which layer the hand is on, as the layer switch does (scripts/mirror.mjs).
    window.chromaglassLayer =
      (layer: number) => { setActiveLayer(Math.max(0, Math.min(1, Math.round(layer)))); };
    // Which bottle is in the hand, as the shelf does (npm run bottles).
    window.chromaglassLiquid =
      (id: string) => { setSelectedLiquidId(id); };
    // A bottle's colour, as a dye swatch or Natural does (`npm run bottles` puts a dye in Glycerine).
    window.chromaglassLiquidColour =
      (id: string, hex: string) => { updateLiquidColor(id, hex); };
    // Every bottle on the bench, by id (npm run bottles picks each one).
    window.chromaglassBottles =
      () => liquidTypesRef.current.map(l => l.id);
    // And its Amount, as the Amount slider does (npm run tools).
    window.chromaglassToolAmount =
      (tool: string, v: number) => { setToolAmounts(prev => ({ ...prev, [tool]: clampAmount(v) })); };
    /*
      Put a track from the shelf on, from outside.

      `npm run shelf` has to answer one question — does music that ships with
      the show actually reach the analyser, or does it play to a plate that
      cannot hear it — and driving the desk to ask it means finding a button
      inside a panel inside a mode, which is a layout test wearing an audio
      test's clothes. This is the same back door `chromaglassSettings` is: it
      sets the test up, it does not perform it.
    */
    window.chromaglassMusic =
      (src?: string) => {
        const t = src ? LIBRARY.find(x => x.src === src) : LIBRARY[0];
        if (!t) throw new Error(`no such track on the shelf: ${src}`);
        playTrackRef.current(t);
        return t;
      };
    /*
      A song's show, from outside: the clip tool starts one on the first note of
      a take, with the song's own look already on the plate.
    */
    window.chromaglassSongs = () => songShowsRef.current;
    window.chromaglassSongStart =
      (id: string, opts?: { skip?: string[]; duration?: number }) => { songRuntimeRef.current?.start(id, opts); return songRuntimeRef.current?.status ?? null; };
    window.chromaglassSongFor =
      (title: string, artist: string) => showFor(songShowsRef.current, { title, artist });
    window.chromaglassSongStop = () => songRuntimeRef.current?.stop();
    window.chromaglassPourText =
      (rows: { text: string; weight?: number }[], opts?: { colour?: string; columns?: [number, number] }) => wallRef.current?.pourText(rows, opts);
    window.chromaglassBench =
      (opts?: BenchOptions) => { void startBenchRef.current?.(opts); };
  }, []);
}
