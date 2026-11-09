import { useState, useRef, useMemo, useCallback, useEffect, useLayoutEffect, type RefObject, type Dispatch, type SetStateAction } from 'react';
import { RIG_KEYS, lookFadeStep } from '../lib/lookFade';
import type { VisualizerSettings } from '../types';
import { rideSlot, type SettingRide } from '../lib/ride';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';
import { type ShowIntervalHandle, clearShowInterval, showNow, showInterval } from '../lib/showClock';
import { COLOR_HARMONIES } from '../constants';
import { isUserPresetId } from '../lib/userPresets';
import type { MusicIntelResult } from '../hooks/useMusicIntelligence';
import type { ScreenLike } from '../hooks/useCastSession';
import type { DeskLayout } from '../lib/deskLayout';
import { OPENING_LOOK, type WallLook } from './shared';

/** The room's settings out of a whole set (lib/lookFade's RIG_KEYS): what the desk rides live on the wall even in Preview. */
function roomOf(s: VisualizerSettings): Partial<VisualizerSettings> {
  const out: Record<string, unknown> = {};
  for (const k of RIG_KEYS) out[k] = (s as unknown as Record<string, unknown>)[k];
  return out as Partial<VisualizerSettings>;
}

/**
 * Preview, for real (PLAN 8b): while the Design desk builds, the wall keeps
 * the look that was on it, and Send to wall hands the draft over on a fade.
 *
 * The wall's own copy of the look, its triggers and its engine are here; the
 * desk's plate is App's `visualizerRef` and the wall's is `wallRef`, which are
 * one engine whenever nothing is drafting. `npm run draftwall` drives it.
 */
interface WallLookDeps {
  isCasting: boolean;
  mirrorCount: number;
  designing: boolean;
  musicIntel: MusicIntelResult;
  ride: SettingRide;
  wallRef: RefObject<LiquidVisualizerHandle | null>;
  visualizerRef: RefObject<LiquidVisualizerHandle | null>;
  settingsRef: RefObject<VisualizerSettings>;
  pinnedPresetId: string | null;
  activePresetId: string | null;
  presetSeq: number;
  seedCount: number;
  clearTrigger: number;
  drainTrigger: number;
  spinFlick: { seq: number; layer: number; } | undefined;
  backLook: { id: string; name: string; leaving?: boolean | undefined; } | null;
  docId: string | null;
  setSeedCount: Dispatch<SetStateAction<number>>;
  setClearTrigger: Dispatch<SetStateAction<number>>;
  setDrainTrigger: Dispatch<SetStateAction<number>>;
  setSpinFlick: Dispatch<SetStateAction<{ seq: number; layer: number; } | undefined>>;
  setSettings: Dispatch<SetStateAction<VisualizerSettings>>;
  setPinnedPresetId: Dispatch<SetStateAction<string | null>>;
  setPresetSeq: Dispatch<SetStateAction<number>>;
  setBackLook: Dispatch<SetStateAction<{ id: string; name: string; leaving?: boolean | undefined; } | null>>;
  setDocId: Dispatch<SetStateAction<string | null>>;
  setDocDirty: Dispatch<SetStateAction<boolean>>;
  adoptPreset: (presetId: string) => void;
  stageRef: RefObject<{ width: number; height: number; } | null>;
  paletteLock: number | null;
  lookPhase: (s: Partial<VisualizerSettings>) => { phaseAmount: number; phaseScale: number; };
  markUrlRef: RefObject<string | null>;
  fadeSeconds: number;
  setToast: Dispatch<SetStateAction<string | null>>;
  startCast: (mode?: "window" | "device", screen?: ScreenLike | null | undefined) => Promise<void>;
  effectiveSettings: VisualizerSettings;
  deskLayout: DeskLayout;
}

export function useWallLook({
  isCasting, mirrorCount, designing, musicIntel, ride, wallRef, visualizerRef, settingsRef,
  pinnedPresetId, activePresetId, presetSeq, seedCount, clearTrigger, drainTrigger, spinFlick,
  backLook, docId, setSeedCount, setClearTrigger, setDrainTrigger, setSpinFlick, setSettings,
  setPinnedPresetId, setPresetSeq, setBackLook, setDocId, setDocDirty, adoptPreset, stageRef,
  paletteLock, lookPhase, markUrlRef, fadeSeconds, setToast, startCast, effectiveSettings,
  deskLayout,
}: WallLookDeps) {
  /*
    ── Preview, for real (PLAN.md 8b) ─────────────────────────────────

    Preview held the sequencer, a song's show and a new song's look, but the
    plate being built was still the plate on the wall: one canvas, which the
    projector window is painted from, so every slider tried while choosing the
    next look was on the wall as it was tried. The plate bar said "not on
    wall" and it was.

    Now, while Preview is on and a wall is up (the projector window, a cast
    receiver, a network display), the desk builds on a copy: a second engine
    (`draft` on LiquidVisualizer) drawn in the desk's preview, and the first
    carries on drawing the wall with the look it had (`wallLook`), hidden from
    the desk. Send to wall hands the copy's look to the wall across the fade,
    as a Go does; leaving Preview puts the desk back on the wall's look, so
    switching to Live never changes what the room sees.

    With no wall up there is nothing to keep the desk off, and Preview stays
    one engine: a second would cost a whole second solver on every Build
    session for nothing anyone sees.

    What stays live on the wall through Preview is the room (RIG_KEYS: the
    dimmer, the mixer, the logo and the film's levels), which the desk still
    rides, and the music. What waits for Send to wall is the look: its
    settings, its dyes and pours, and the desk's clears and seeds.
  */
  const wallUp = isCasting || mirrorCount > 0;
  const draftWanted = designing && wallUp;
  const [wallLook, setWallLook] = useState<WallLook | null>(null);
  const wallLookRef = useRef(wallLook);
  wallLookRef.current = wallLook;
  /*
    The plate's read of the ride, at the top of each of its frames (PLAN.md
    §14f; `lay` in lib/ride.ts). One for each engine, because each draws its
    own settings:

    - Neither takes a key the identified track overrides. The fader moves
      the look's setting, and the track's value is what is drawn for that
      key (`effectiveSettings`); laid over it, the ride would undo the track.
    - Nor the plate count. It is a structure, not a level, the stage can hold
      more plates than the look asks for (`stageLayers`), and it is the one
      setting the plate's component acts on through React rather than reading
      on its frame. It reaches the plate when React renders it.
    - While the desk builds on a copy (Preview), the wall takes only the
      room's keys from the desk, as `wallSettings` does: the rest of what the
      desk rides is the copy's, not the show's.
  */
  const overridesRef = useRef(musicIntel.overrides);
  overridesRef.current = musicIntel.overrides;
  const ridePlate = useMemo(() => {
    const deskTakes = (k: string) => k !== 'layerCount' && !(overridesRef.current && k in overridesRef.current);
    const wallTakes = (k: string) => deskTakes(k) && (!wallLookRef.current || RIG_KEYS.has(k as keyof VisualizerSettings));
    const deskSlot = rideSlot(), wallSlot = rideSlot();
    type Live = Record<string, unknown>;
    return {
      desk: (base: VisualizerSettings) => ride.lay(base as unknown as Live, deskTakes, deskSlot) as unknown as VisualizerSettings,
      wall: (base: VisualizerSettings) => ride.lay(base as unknown as Live, wallTakes, wallSlot) as unknown as VisualizerSettings,
    };
  }, [ride]);
  const drafting = draftWanted && wallLook !== null;
  /*
    The wall's engine and a receiver follow `wallLook` for as long as it is
    held, which is one render longer than the copy is up: in the render where
    Preview ends the copy is gone but the desk's settings and counters are
    only put back by the effect after it, and handing them to the wall's
    engine for that one render dropped or laid plates in front of the room
    and sent a receiver the copy's look (the pre-push review).
  */
  const walled = wallLook !== null;
  /*
    The wall's engine, always. `visualizerRef` is the engine the desk edits:
    the same one outside Preview, the draft inside it. Everything the desk
    does goes through `visualizerRef` and lands on the draft without each
    call knowing; what is the show's (the music, the sequencer, the remote,
    the projector's size) goes through `wallRef`.
  */
  const wallEngineRef = useCallback((h: LiquidVisualizerHandle | null) => {
    wallRef.current = h;
    if (!drafting) visualizerRef.current = h;
  }, [drafting]);
  const wallFadeRef = useRef<ShowIntervalHandle | null>(null);
  useEffect(() => () => { if (wallFadeRef.current) clearShowInterval(wallFadeRef.current); }, []);
  useLayoutEffect(() => {
    if (draftWanted && !wallLookRef.current) {
      const plate = wallRef.current?.describePlate() ?? null;
      setWallLook({
        settings: settingsRef.current, target: null, presetId: pinnedPresetId, castPresetId: activePresetId, presetSeq,
        seedCount, clearTrigger, drainTrigger, spinFlick, backLook, docId,
        plate: plate ? { contract: plate.contract, injectStyles: plate.injectStyles, liquids: plate.liquids } : null,
      });
    } else if (!draftWanted && wallLookRef.current) {
      const w = wallLookRef.current;
      if (wallFadeRef.current) { clearShowInterval(wallFadeRef.current); wallFadeRef.current = null; }
      /*
        Either way the counters go back to the ones the wall's engine has
        seen, so it sees no change: its loop clears and seeds on a count
        higher than the last, and a clear pressed on the copy was replayed on
        the wall's plate the moment the copy went.
      */
      setSeedCount(w.seedCount);
      setClearTrigger(w.clearTrigger);
      setDrainTrigger(w.drainTrigger);
      setSpinFlick(w.spinFlick);
      if (!designing) {
        // Out of Preview with the wall still up: the desk goes back to what
        // the room is seeing (where a Send's fade was taking it, if one was
        // under way), and to the saved look that was open.
        setSettings(prev => ({ ...(w.target ?? w.settings), ...roomOf(prev) }));
        setPinnedPresetId(w.presetId);
        setPresetSeq(w.presetSeq);
        setBackLook(w.backLook);
        setDocId(w.docId);
        setDocDirty(false);
      } else if (pinnedPresetId) {
        // The wall went away mid-Preview: the wall's engine is the desk's
        // again and carries on from the copy's look, as a Go would.
        adoptPreset(pinnedPresetId);
      }
      setWallLook(null);
    }
    // Only the edge matters; the snapshot reads everything else as it is then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftWanted]);
  // The copy starts as the wall's look, laid fresh on its own plate.
  useEffect(() => {
    if (!drafting) return;
    const w = wallLookRef.current;
    const v = visualizerRef.current;
    // Composed at the wall's shape, letterboxed in the preview as the one engine was.
    v?.setStage(stageRef.current);
    if (paletteLock != null) v?.setHarmonyLock(COLOR_HARMONIES[paletteLock]);
    /*
      A saved look's dyes are handed over; a built-in's come from its own
      tables. The plate tables are module constants both engines read, and
      handing a built-in's id a null contract deleted that look's colours for
      the wall's engine too (applyPreset's `delete PRESET_CONTRACTS[id]`).
    */
    const id = w?.presetId ?? OPENING_LOOK;
    v?.applyPreset(id, w?.plate && isUserPresetId(id) ? w.plate : undefined, lookPhase(settingsRef.current));
    if (markUrlRef.current) {
      const img = new window.Image();
      img.onload = () => visualizerRef.current?.loadMark?.(img, img.naturalWidth, img.naturalHeight);
      img.src = markUrlRef.current;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafting]);
  /** Send to wall, in Preview: the copy's look to the wall, across the fade a Go takes. */
  const sendDraftToWall = () => {
    const w = wallLookRef.current;
    if (!w) return;
    const raw = visualizerRef.current?.describePlate();
    const plate = raw ? { contract: raw.contract, injectStyles: raw.injectStyles, liquids: raw.liquids } : null;
    const to = settingsRef.current;
    const id = pinnedPresetId ?? w.presetId ?? OPENING_LOOK;
    wallRef.current?.adoptPreset(id, plate ?? undefined);
    wallRef.current?.handoff(Math.max(1, fadeSeconds), lookPhase(to));
    const from = w.settings;
    setWallLook(prev => prev && { ...prev, target: to, presetId: id, castPresetId: activePresetId, presetSeq, plate, docId });
    if (wallFadeRef.current) clearShowInterval(wallFadeRef.current);
    const started = showNow();
    const ms = Math.max(1, fadeSeconds) * 1000;
    // The handoff above swaps the ring in one frame, so the fade dips its amount there (lib/lookFade's ringDip).
    const step = lookFadeStep(false, true);
    wallFadeRef.current = showInterval(() => {
      const t = Math.min(1, (showNow() - started) / ms);
      setWallLook(prev => prev && { ...prev, settings: step(from, to, t, prev.settings), target: t >= 1 ? null : prev.target });
      if (t >= 1 && wallFadeRef.current) { clearShowInterval(wallFadeRef.current); wallFadeRef.current = null; }
    }, 33, 'wall-fade');
    setToast('Sent to the wall');
  };
  /**
    Send to wall: in Preview with a wall up, the copy's look goes to it; with
    none, the projector window opens, as before. A ref so ⌘⏎'s listener,
    bound once, sends whichever is true when the key is pressed.
  */
  const sendToWallRef = useRef<() => void>(() => {});
  sendToWallRef.current = () => { if (drafting) sendDraftToWall(); else void startCast('window'); };
  /** What the wall's engine draws while the desk has a copy: the wall's look, under the desk's room. */
  const wallSettings = useMemo(() => {
    if (!wallLook) return effectiveSettings;
    const s = { ...wallLook.settings, ...roomOf(effectiveSettings), ...(musicIntel.overrides ?? {}) } as VisualizerSettings;
    // The wall's own back plate, not one sent on the copy, which would have grown the wall a plate.
    const layers = Math.max(1, s.layerCount ?? 1, wallLook.backLook ? 2 : 1);
    return (s.layerCount ?? 1) < layers ? { ...s, layerCount: layers } : s;
  }, [wallLook, effectiveSettings, musicIntel.overrides]);

  /**
   * How long the look on the wall has been up.
   *
   * Ticked once a second rather than derived per frame: a clock on a desk
   * does not need to be right to the millisecond, and the alternative is a
   * re-render of the whole shell sixty times a second for a number that
   * changes once.
   */
  const lookSince = useRef(Date.now());
  const [lookFor, setLookFor] = useState(0);
  useEffect(() => { lookSince.current = Date.now(); setLookFor(0); }, [pinnedPresetId]);
  const clockLive = deskLayout.plateMode === 'live';
  useEffect(() => {
    // On the tab's plate being Live, as it ran on the Gig desk being chosen:
    // not on `performing`, which is also a window wide enough for the desk,
    // so a phone (never a desk) lost the clock and `npm run renders` read 0
    // renders a second where its clock is asked for (0.6 to 1.5).
    if (!clockLive) return;
    const id = setInterval(() => setLookFor((Date.now() - lookSince.current) / 1000), 1000);
    return () => clearInterval(id);
  }, [clockLive]);

  return {
    wallLook, ridePlate, drafting, walled, wallEngineRef, sendToWallRef, wallSettings, lookFor,
  };
}
