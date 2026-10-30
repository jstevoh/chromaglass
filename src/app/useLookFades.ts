import { useCallback, useRef, useEffect, type RefObject, type Dispatch, type SetStateAction } from 'react';
import type { VisualizerSettings } from '../types';
import { clearShowInterval, showNow, showInterval, type ShowIntervalHandle } from '../lib/showClock';
import { rideSlot, type SettingRide } from '../lib/ride';
import { lookFadeStep, targetLook, type LaterWrites } from '../lib/lookFade';
import { isUserPresetId, type UserPreset } from '../lib/userPresets';
import { findPreset } from '../presets';
import { FADE_LEVEL_KEYS, type RowFades, type FadeWay } from '../lib/mixFade';
import type { ArmedLook } from './shared';
import type { ShowSequence } from '../lib/sequencer';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';
import type { MixSource } from '../lib/mixer';

/**
 * Taking a look to the stage over a fade, without a clear: Go on the armed
 * look, Go now from the palette, the back plate's own look, and Revert.
 *
 * The fade walks the settings on the show timer (`lib/showClock.ts`), takes the
 * mixer's levels with it (`lib/lookFade.ts`), and hands the rows a hand is on
 * back to the hand. The state it moves is `useSetListState`'s.
 */
interface LookFadesDeps {
  lookFadeRef: RefObject<ShowIntervalHandle | null>;
  lookTakesLevels: () => void;
  flushRide: () => void;
  evolveLetsGo: () => void;
  ride: SettingRide;
  settingsRef: RefObject<VisualizerSettings>;
  setSettings: Dispatch<SetStateAction<VisualizerSettings>>;
  setFading: Dispatch<SetStateAction<number>>;
  rowFades: RowFades;
  laterWrites: LaterWrites;
  setLiveItemId: Dispatch<SetStateAction<string | null>>;
  setRideKeys: Dispatch<SetStateAction<(keyof VisualizerSettings)[]>>;
  setCued: Dispatch<SetStateAction<ArmedLook | null>>;
  sequencerRef: RefObject<{ startAt: (id: string, positionSec: number) => void; sequences: ShowSequence[]; } | null>;
  previousLook: RefObject<{ id: string | null; settings: VisualizerSettings; } | null>;
  pinnedPresetId: string | null;
  adoptPreset: (presetId: string) => void;
  visualizerRef: RefObject<LiquidVisualizerHandle | null>;
  lookPhase: (s: Partial<VisualizerSettings>) => { phaseAmount: number; phaseScale: number; };
  cued: ArmedLook | null;
  fadeSeconds: number;
  userPresetsRef: RefObject<UserPreset[]>;
  setBackLook: Dispatch<SetStateAction<{ id: string; name: string; leaving?: boolean | undefined; } | null>>;
  setRowFading: Dispatch<SetStateAction<Partial<Record<MixSource, FadeWay>>>>;
  blackoutRef: RefObject<boolean>;
}

export function useLookFades({
  lookFadeRef, lookTakesLevels, flushRide, evolveLetsGo, ride, settingsRef, setSettings, setFading,
  rowFades, laterWrites, setLiveItemId, setRideKeys, setCued, sequencerRef, previousLook,
  pinnedPresetId, adoptPreset, visualizerRef, lookPhase, cued, fadeSeconds, userPresetsRef,
  setBackLook, setRowFading, blackoutRef,
}: LookFadesDeps) {
  /**
   * Send a look to the stage, over `seconds`. With no fade this is still not
   * a clear: `adoptPreset` takes the new dyes without wiping the plate.
   *
   * Taking the look as an argument rather than reading `cued` is what lets
   * ⇧⏎ in the palette send one that was never armed — arming it first and
   * then calling Go would read a `cued` that this render does not have yet.
   */
  /**
   * Crossfade the settings from where the plate is now to `to`, over
   * `seconds`. The one fade loop — Go, Revert and a new song all run through
   * it, and there were three copies of it before there were three callers.
   *
   * ~30 a second: a crossfade over seconds does not need sixty settings
   * objects a second, and the solver is the expensive part of a settings
   * change rather than React.
   */
  /*
    The room's settings (RIG_KEYS: the mixer, the dimmer, the film's and the
    logo's levels) are the same in `from` and `to`, both taken from the plate
    as the fade began, and each tick used to lay the whole blend down: so a
    film brought in from its take button, or a fader ridden, during a Go was
    put back to where it was when the Go was pressed, thirty times a second,
    for as long as the Go ran. They are the room's, not the look's, so each
    tick keeps them as they are now, and keeps a row taken from its button
    since the Go began as it is too (lib/lookFade's lookStep says why).
  */
  /*
    A Back (`back`) is the one fade that puts the room back too: it is undo,
    and the owner asked for it to go fully back (lib/lookFade's backStep).
    What a hand wrote after the Back began is left where the hand put it,
    and so is whatever `hold` names (the dimmer, while a blackout is on).
  */
  const fadeSettingsTo = useCallback((to: VisualizerSettings, seconds: number, back = false, hold: readonly string[] = [], swapsRing = false) => {
    if (lookFadeRef.current) { clearShowInterval(lookFadeRef.current); lookFadeRef.current = null; }
    lookTakesLevels();
    flushRide();
    evolveLetsGo();
    // From where a fader has the plate now, not where React last heard it.
    const from = ride.lay(settingsRef.current as unknown as Record<string, unknown>, () => true, rideSlot()) as unknown as VisualizerSettings;
    // `swapsRing`: the caller ran the visualizer's handoff, which swaps the
    // ferrofluid ring in one frame at the middle; the amount dips to nothing there (lib/lookFade's ringDip).
    // The handoff never runs shorter than a second, so a fade under a second would dip and come
    // back before the swap and then swap the ring at full strength: it keeps its straight line.
    const step = lookFadeStep(back, swapsRing && seconds >= 1);
    if (seconds <= 0) { setSettings(prev => step(from, to, 1, prev, hold)); setFading(0); return; }
    const started = showNow();
    const ms = seconds * 1000;
    lookFadeRef.current = showInterval(() => {
      const t = Math.min(1, (showNow() - started) / ms);
      // A take pressed since the Go began (the gel's or the lumia's, whose
      // level the look also sets) is left to its button, to the Go's end;
      // and on a Back, anything else written since it began.
      const taken = back ? [...rowFades.levelsTakenSince(started), ...laterWrites.since(started), ...hold] : rowFades.levelsTakenSince(started);
      if (t >= 1) {
        if (lookFadeRef.current) clearShowInterval(lookFadeRef.current);
        lookFadeRef.current = null;
        setSettings(prev => step(from, to, 1, prev, taken));
        setFading(0);
        return;
      }
      setSettings(prev => step(from, to, t, prev, taken));
      setFading(t);
    }, 33, 'look-fade');
    // lookTakesLevels closes over nothing that changes: the one RowFades and
    // React's own setter, so the callback is still made once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendLook = useCallback((next: ArmedLook, seconds: number) => {
    setLiveItemId(next.item ?? null);
    // A set item's own strip goes up with it.
    if (next.rides && next.rides.length) setRideKeys(next.rides);
    if (next.sequence) {
      setCued(null);
      sequencerRef.current?.startAt(next.sequence, 0);
      return;
    }
    const from = settingsRef.current;
    previousLook.current = { id: pinnedPresetId, settings: from };
    adoptPreset(next.id);
    setCued(null);
    // Pressing Go is a decision: the whole look, structure and all — and its
    // colours with it, handed over across the fade rather than left to
    // evaporate for minutes under the new ones. A cut still gets a second.
    const target = targetLook(from, next.settings);
    visualizerRef.current?.handoff(Math.max(1, seconds), lookPhase(target));
    fadeSettingsTo(target, seconds, false, [], true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedPresetId, adoptPreset, fadeSettingsTo]);

  /** Go: the armed look, at the chosen fade. */
  const goLook = useCallback((seconds?: number) => {
    if (cued) sendLook(cued, seconds ?? cued.fade ?? fadeSeconds);
  }, [cued, fadeSeconds, sendLook]);

  /** For the debug hook (`useCheckHooks`), which is installed once and calls through this. */
  const goLookNowRef = useRef<((presetId: string, seconds?: number) => void) | null>(null);
  /** The same, for a look that was never armed — the palette's ⇧⏎. */
  const goLookNow = useCallback((presetId: string, seconds = fadeSeconds) => {
    const up = isUserPresetId(presetId) ? userPresetsRef.current.find(p => p.id === presetId) : null;
    const built = up ? undefined : findPreset(presetId);
    const look = up ? { id: presetId, name: up.name, settings: up.settings }
      : built ? { id: built.id, name: built.name, settings: built.settings } : null;
    if (look) sendLook(look, seconds);
  }, [fadeSeconds, sendLook]);
  goLookNowRef.current = goLookNow;

  /*
    Go to Back Plate (PLAN.md §16a): the cued look to the back plate alone.

    The same look a Go would send, resolved over the live settings the same
    way (`targetLook`), handed to the visualizer, which takes from it only
    what the back plate owns: its solver settings and its dyes. The front
    plate, the picture and the cue list's live row are untouched; the cue is
    spent, as a Go spends it. A cued sequence is a whole show, not a dish, so
    it has no back-plate Go.
  */
  const backLeavingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendBack = useCallback((next: ArmedLook | null, seconds: number) => {
    if (backLeavingTimer.current) { clearTimeout(backLeavingTimer.current); backLeavingTimer.current = null; }
    if (!next) {
      visualizerRef.current?.sendBack(null, null, seconds);
      // Kept on the stage while it fades back (see `leaving`), then let go.
      setBackLook(b => (b && seconds > 0 ? { ...b, leaving: true } : null));
      if (seconds > 0) backLeavingTimer.current = setTimeout(() => { backLeavingTimer.current = null; setBackLook(null); }, seconds * 1000);
      return;
    }
    if (next.sequence) return;
    const up = isUserPresetId(next.id) ? userPresetsRef.current.find(p => p.id === next.id) : null;
    visualizerRef.current?.sendBack(next.id, targetLook(settingsRef.current, next.settings), seconds, next.name, up
      ? { contract: up.contract ?? null, injectStyles: up.injectStyles ?? null, liquids: up.liquids ?? null }
      : undefined);
    setBackLook({ id: next.id, name: next.name });
    setCued(null);
  }, []);

  const goBackPlate = useCallback((seconds?: number) => {
    if (cued && !cued.sequence) sendBack(cued, seconds ?? cued.fade ?? fadeSeconds);
  }, [cued, fadeSeconds, sendBack]);

  /** The same, for a look picked straight from a list (the phone's looks sheet). */
  const backLookNow = useCallback((presetId: string, seconds = fadeSeconds) => {
    const up = isUserPresetId(presetId) ? userPresetsRef.current.find(p => p.id === presetId) : null;
    const built = up ? undefined : findPreset(presetId);
    const look = up ? { id: presetId, name: up.name, settings: up.settings }
      : built ? { id: built.id, name: built.name, settings: built.settings } : null;
    if (look) sendBack(look, seconds);
  }, [fadeSeconds, sendBack]);

  const backFollowsFront = useCallback(() => sendBack(null, fadeSeconds), [fadeSeconds, sendBack]);
  /** The visualizer let go of the back look on its own (a render began or ended). */
  const backLookCleared = useCallback(() => {
    if (backLeavingTimer.current) { clearTimeout(backLeavingTimer.current); backLeavingTimer.current = null; }
    setBackLook(null);
  }, []);
  useEffect(() => () => { if (backLeavingTimer.current) clearTimeout(backLeavingTimer.current); }, []);

  /** One step back, at the same fade. The fastest fix mid-show is undo. */
  const revertLook = useCallback(() => {
    const prev = previousLook.current;
    if (!prev) return;
    previousLook.current = null;
    evolveLetsGo();
    if (prev.id) adoptPreset(prev.id);
    visualizerRef.current?.handoff(Math.max(1, fadeSeconds), lookPhase(prev.settings));
    // A take still walking stops where it is: the Back puts every row's level
    // back and was pressed later, and two walks writing one setting would
    // fight a tick at a time. Every row, not only the ones whose level moved
    // since the Go: the Back writes them all, a row at its old level included.
    if (rowFades.handOn(FADE_LEVEL_KEYS)) setRowFading(rowFades.running());
    // A blackout on stays on: a Back that faded the dimmer up would light the
    // wall with the Blackout button still lit.
    fadeSettingsTo(prev.settings, fadeSeconds, true, blackoutRef.current ? ['dimmer'] : [], true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fadeSeconds, adoptPreset, fadeSettingsTo]);

  useEffect(() => () => { if (lookFadeRef.current) clearShowInterval(lookFadeRef.current); }, []);

  return {
    fadeSettingsTo, sendLook, goLook, goLookNowRef, goLookNow, goBackPlate, backLookNow,
    backFollowsFront, backLookCleared, revertLook,
  };
}
