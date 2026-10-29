import { useMemo, useRef, useState, useCallback, useEffect, type RefObject } from 'react';
import type { CastState, CastMessage } from '../lib/castProtocol';
import { COLOR_HARMONIES } from '../constants';
import type { RemoteMessage } from '../lib/remoteProtocol';
import { isFreeTierGated } from '../lib/tierGates';
import { fitMarkForCast } from '../lib/markFit';
import { isGlobalAmbientMode } from '../lib/ambient';
import type { AudioData, Ear } from '../hooks/useAudioAnalyzer';
import type { WallLook } from './shared';
import type { VisualizerSettings } from '../types';
import type { OutputConfig } from '../lib/outputConfig';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';
import type { SongChange } from '../hooks/useSongChange';

/**
 * Keeping a receiver in step: the cast window, the mirror and the network
 * display each draw their own plate, so the look, its triggers and the mark
 * are sent to them (`lib/castProtocol.ts`), throttled to the cast's own rate,
 * and the ear's readings follow at the frame rate.
 *
 * `chromaglassCastState` (`scripts/mirror.mjs`, `npm run draftwall`) reads what was sent
 * from the log kept here.
 */
interface CastFeedDeps {
  wallLook: WallLook | null;
  wallSettings: VisualizerSettings;
  effectiveSettings: VisualizerSettings;
  isActive: boolean;
  isAutomated: boolean;
  activeLayer: number;
  seedCount: number;
  clearTrigger: number;
  drainTrigger: number;
  activePresetId: string | null;
  presetSeq: number;
  paletteLock: number | null;
  shownOutput: OutputConfig;
  castSend: (msg: CastMessage) => void;
  mirrorCount: number;
  ridePlate: { desk: (base: VisualizerSettings) => VisualizerSettings; wall: (base: VisualizerSettings) => VisualizerSettings; };
  markUrlRef: RefObject<string | null>;
  bothEngines: () => LiquidVisualizerHandle[];
  setToastRef: RefObject<(m: string) => void>;
  castReadyRef: RefObject<() => void>;
  castNudgeRef: RefObject<() => void>;
  isCasting: boolean;
  ear: Ear;
  hear: () => AudioData | null;
  audioData: AudioData | null;
  songChange: SongChange | null;
  stageRef: RefObject<{ width: number; height: number; } | null>;
  settingsRef: RefObject<VisualizerSettings>;
  renderAudioRef: RefObject<AudioData | null>;
  renderAudio: AudioData | null;
  liveAudio: AudioData | null;
}

export function useCastFeed({
  wallLook, wallSettings, effectiveSettings, isActive, isAutomated, activeLayer, seedCount,
  clearTrigger, drainTrigger, activePresetId, presetSeq, paletteLock, shownOutput, castSend,
  mirrorCount, ridePlate, markUrlRef, bothEngines, setToastRef, castReadyRef, castNudgeRef,
  isCasting, ear, hear, audioData, songChange, stageRef, settingsRef, renderAudioRef, renderAudio,
  liveAudio,
}: CastFeedDeps) {
  // ── Cast: keep the receiver in step ─────────────────────────────
  /*
    A receiver that draws its own plate is the wall too: while the desk builds
    on a copy (PLAN.md 8b) it is sent the wall's look, not the desk's, and
    Send to wall moves it with the window's.
  */
  const wl = wallLook;
  const castState = useMemo<CastState>(() => ({
    settings: wl ? wallSettings : effectiveSettings,
    isActive,
    isAutomated,
    activeLayer,
    seedCount: wl ? wl.seedCount : seedCount,
    clearTrigger: wl ? wl.clearTrigger : clearTrigger,
    drainTrigger: wl ? wl.drainTrigger : drainTrigger,
    presetId: wl ? wl.castPresetId : activePresetId,
    presetSeq: wl ? wl.presetSeq : presetSeq,
    harmonyLock: paletteLock == null ? null : COLOR_HARMONIES[paletteLock],
    // With the wall test on it (8e), so a receiver that draws its own plate
    // (a Chromecast, a second machine) shows the pattern and the numbers as
    // the HDMI wall does. Identify's end is a clock time, so a receiver whose
    // clock is a second off flashes a second more or less.
    output: shownOutput,
  }), [wl, wallSettings, effectiveSettings, isActive, isAutomated, activeLayer, seedCount, clearTrigger, drainTrigger, activePresetId, presetSeq, paletteLock, shownOutput]);
  const relaySendRef = useRef<((m: RemoteMessage) => void) | null>(null);
  /*
    The same mark as it crosses the show server to a network display: the
    original when it fits a relay frame, else a smaller copy (PLAN 14m-mark,
    `lib/markFit.ts`). The relay closes a socket on a frame over 512 KB, and a
    print-sized logo is several megabytes, so before this a big logo never
    reached the network display at all.
  */
  const markRelayUrlRef = useRef<string | null>(null);
  const [markLoaded, setMarkLoaded] = useState(false);
  /*
    The state, at most fifteen times a second.

    It used to go out every time `castState` changed, and during a look fade
    that is every tick of the fade (thirty a second), plus every override the
    ear writes: a full settings object, stringified, down the Presentation
    channel and again down the relay to every mirror, and at the other end a
    React render of the whole receiver and a solver retune for each one. The
    stability plan (S10) asked for ~10 Hz on the grounds that "the receiver
    interpolates anyway". It does not: `CastDisplay` hands `state.settings`
    straight to its own visualizer, so a receiver shows a fade as exactly the
    staircase it was sent. At 10 Hz a two-second fade to black is twenty steps
    of 5% brightness a tenth of a second apart, which reads as a staircase on
    a dark wall. Fifteen is half the fade's own tick, so it still halves the
    traffic, and gives thirty steps a fifteenth of a second apart, which does
    not.

    So: a leading and trailing throttle. The first change after a quiet spell
    goes at once; changes inside the window are held, and one trailing send at
    the end of it carries whatever the state is *then* (read from a ref, not
    captured) — so the last value of a fade always arrives, and a receiver
    never rests on a value from the middle of one.

    Three things skip the wait:
    - A receiver's hello, or a new cast or mirror (`castReadyRef`, `joined`):
      a new receiver has nothing, and the mark goes with it on those alone,
      exactly as before.
    - A trigger: `presetSeq`, `seedCount`, `clearTrigger`, `drainTrigger`.
      Those are events carried as counters, and the receiver acts on each
      change; two coalesced into one window would be one seed or one clear
      where the operator pressed twice, or a preset re-seed that arrives up
      to a fifteenth of a second after the settings that follow it.
    - Nothing else. `isActive`, the output, the harmony lock and the rest are
      levels, and a level only needs its last value.
  */
  const CAST_STATE_MS = 66;
  const castStateRef = useRef(castState);
  castStateRef.current = castState;
  const castSendRef = useRef(castSend);
  castSendRef.current = castSend;
  const mirrorCountRef = useRef(mirrorCount);
  mirrorCountRef.current = mirrorCount;
  const castSentAtRef = useRef(-Infinity);
  const castSentTriggersRef = useRef('');
  const castTrailRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const castTriggers = (s: CastState) => `${s.presetSeq}:${s.seedCount}:${s.clearTrigger}:${s.drainTrigger}`;
  // Stable, and reads everything through refs, so the trailing timer can
  // never send a state (or a mirror count) older than the one it was set for.
  const castSentLogRef = useRef<{ n: number; presetSeq: number; clearTrigger: number; layers: number }[]>([]);
  const castSentCountRef = useRef(0);
  const sendCastState = useCallback((withMark = false) => {
    if (castTrailRef.current) { clearTimeout(castTrailRef.current); castTrailRef.current = null; }
    /*
      With a fader's moves React has not rendered yet (PLAN.md §14f): React
      hears a ride ten times a second, and a receiver that drew only that
      would take a ride to black as the staircase CAST_STATE_MS is there to
      prevent. The wall's view of the ride, since a receiver draws the wall.
    */
    const told = castStateRef.current;
    const laid = ridePlate.wall(told.settings);
    const state = laid === told.settings ? told : { ...told, settings: laid };
    const send = castSendRef.current;
    castSentAtRef.current = performance.now();
    castSentTriggersRef.current = castTriggers(state);
    // The last forty sent, for the debug hook (`npm run draftwall` reads every one, not the last).
    castSentLogRef.current.push({ n: ++castSentCountRef.current, presetSeq: state.presetSeq, clearTrigger: state.clearTrigger, layers: state.settings.layerCount ?? 1 });
    if (castSentLogRef.current.length > 40) castSentLogRef.current.shift();
    send({ type: 'state', state });
    // The picture only when a receiver is new — on its hello, or when a cast
    // or a mirror starts — because that is the one moment it needs it.
    // It used to ride along with every state, and the state changes twice a
    // second while a track is identified and every frame of a fade: a data
    // URL of up to several megabytes, sixty times a second, down the channel
    // and the relay, each one decoded and re-uploaded at the other end.
    if (withMark) send({ type: 'mark', dataUrl: markUrlRef.current });
    if (mirrorCountRef.current > 0) {
      relaySendRef.current?.({ type: 'cast', message: { type: 'state', state } });
      if (withMark) relaySendRef.current?.({ type: 'cast', message: { type: 'mark', dataUrl: markRelayUrlRef.current } });
    }
  }, []);
  useEffect(() => () => { if (castTrailRef.current) clearTimeout(castTrailRef.current); }, []);

  const loadMark = useCallback((file: File) => {
    const effectiveFile = isFreeTierGated()
      ? new File(
          [`<svg xmlns="http://www.w3.org/2000/svg" width="420" height="80" viewBox="0 0 420 80"><text x="210" y="52" text-anchor="middle" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="38" font-weight="600" letter-spacing="2">ChromaGlass</text></svg>`],
          'chromaglass-mark.svg',
          { type: 'image/svg+xml' },
        )
      : file;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? '');
      const img = new window.Image();
      img.onload = () => {
        for (const v of bothEngines()) v.loadMark?.(img, img.naturalWidth, img.naturalHeight);
        markUrlRef.current = url;
        markRelayUrlRef.current = fitMarkForCast(img, url);
        setMarkLoaded(true);
        castSend({ type: 'mark', dataUrl: url });
        relaySendRef.current?.({ type: 'cast', message: { type: 'mark', dataUrl: markRelayUrlRef.current } });
        setToastRef.current?.('Mark on the wall');
      };
      img.onerror = () => setToastRef.current?.('That file would not open as a picture');
      img.src = url;
    };
    reader.readAsDataURL(effectiveFile);
  }, [castSend]);

  const clearMark = useCallback(() => {
    for (const v of bothEngines()) v.clearMark?.();
    markUrlRef.current = null;
    markRelayUrlRef.current = null;
    setMarkLoaded(false);
    castSend({ type: 'mark', dataUrl: null });
    relaySendRef.current?.({ type: 'cast', message: { type: 'mark', dataUrl: null } });
  }, [castSend]);
  castReadyRef.current = () => sendCastState(true);
  /*
    A ride between React's renders asks for a send the way a change of state
    does (the throttle just below), so a receiver hears a fader at the cast's
    own rate rather than at React's.
  */
  castNudgeRef.current = () => {
    if (!castLinkRef.current || castTrailRef.current) return;
    const wait = CAST_STATE_MS - (performance.now() - castSentAtRef.current);
    if (wait <= 0) { sendCastState(false); return; }
    castTrailRef.current = setTimeout(() => { castTrailRef.current = null; sendCastState(false); }, wait);
  };
  const castLinkRef = useRef('');
  useEffect(() => {
    if (!isCasting && mirrorCount === 0) {
      castLinkRef.current = '';
      if (castTrailRef.current) { clearTimeout(castTrailRef.current); castTrailRef.current = null; }
      return;
    }
    const link = `${isCasting}:${mirrorCount}`;
    const joined = link !== castLinkRef.current;
    castLinkRef.current = link;
    if (joined || castTriggers(castState) !== castSentTriggersRef.current) { sendCastState(joined); return; }
    const wait = CAST_STATE_MS - (performance.now() - castSentAtRef.current);
    if (wait <= 0) { sendCastState(false); return; }
    // One trailing send per window; it reads the state when it fires.
    if (!castTrailRef.current) castTrailRef.current = setTimeout(() => { castTrailRef.current = null; sendCastState(false); }, wait);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCasting, mirrorCount, castState, sendCastState]);
  /*
    The live state, for a harness to read.

    This used to close over the render's `castState` and be re-registered when
    it changed, which sounds equivalent and is not: a look fade or the
    sequencer rewrites settings between renders, and what came back was
    whichever snapshot the last effect happened to capture. A harness setting a
    value and reading it straight back got the old one — which cost three
    rounds of measuring the wrong plate before anyone thought to check the
    instrument. Reading refs means it cannot be stale.
  */
  const earDebugRef = useRef(ear.debug);
  earDebugRef.current = ear.debug;
  /*
    How many times the App has rendered, for `npm run renders` (PLAN.md
    §14f): with a band playing it was about seventy a second, one per sound
    reading and then some, and the check holds it down. Counting in the body
    counts the renders React commits and the ones strict mode throws away
    alike, which is what the page paid for.
  */
  const appRendersRef = useRef(0);
  appRendersRef.current++;
  const hearRef = useRef(hear);
  hearRef.current = hear;
  const liveDebugRef = useRef({ isCasting, castState, audioData, songChange, isAutomated });
  liveDebugRef.current = { isCasting, castState, audioData, songChange, isAutomated };
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('debug')) {
      window.chromaglassCastState = () => {
        const l = liveDebugRef.current;
        return {
          isCasting: l.isCasting,
          /** The projector's size as the wall last announced it: what the show renders for (and, after a reload, hears again, S15). */
          stage: stageRef.current,
          castState: l.castState,
          sent: [...castSentLogRef.current],
          // The reading the plate hears now, not the last one React was
          // shown: a harness asking what the show hears means the plate.
          audio: hearRef.current(),
          ear: earDebugRef.current(),
          songChange: l.songChange,
          // Straight from the render rather than from the cast snapshot, which
          // is assembled for a receiver and not for a question.
          isAutomated: l.isAutomated,
          ambient: isGlobalAmbientMode(),
          settings: settingsRef.current,
          appRenders: appRendersRef.current,
        };
      };
    }
  }, []);
  /*
    The audio bands, thirty times a second; the raw spectrum stays here.

    This was an effect on `audioData`, so it ran on every render the ear
    caused. The ear now tells React what it heard ten times a second
    (useAudioAnalyzer's EAR_VIEW_MS, PLAN.md §14f), and ten readings a second
    is too few for a receiver's plate to move with the beat. So the feed
    listens to the ear itself, which hands over every reading on its own
    clock, and keeps its own thirty-a-second limit. Not a page timer: the ear
    keeps reading while this window is hidden behind the wall (§14a), and a
    hidden window's timers are held to one a second.

    A render's readings (`renderAudio`) are sent from the effect below
    instead, one per frame of the film as before, and the room's are not sent
    while one is running, as they were not when this read `audioData`.
  */
  const lastCastAudioRef = useRef(0);
  const sendCastAudio = useCallback((a: AudioData | null) => {
    const now = performance.now();
    if (now - lastCastAudioRef.current < 33) return;
    lastCastAudioRef.current = now;
    const message: CastMessage = {
      type: 'audio',
      audio: a ? {
        volume: a.volume, bass: a.bass, mid: a.mid, treble: a.treble,
        energy: a.energy, spectralCentroid: a.spectralCentroid, timbre: a.timbre, complexity: a.complexity,
        passage: a.passage,
      } : null,
    };
    if (castingRef.current && !stageRef.current) castSendRef.current(message);   // a mirror of this canvas needs no feed
    if (mirrorCountRef.current > 0) relaySendRef.current?.({ type: 'cast', message });
  }, []);
  const castingRef = useRef(isCasting);
  castingRef.current = isCasting;
  const feedingCast = isCasting || mirrorCount > 0;
  const { onReading } = ear;
  useEffect(() => {
    if (!feedingCast) return;
    return onReading((a) => { if (!renderAudioRef.current) sendCastAudio(a); });
  }, [feedingCast, onReading, sendCastAudio]);
  // A render's reading, and the ear going quiet (stopped: no more readings to
  // say so), both reach the feed as state.
  useEffect(() => {
    if (!feedingCast) return;
    if (renderAudio) sendCastAudio(renderAudio);
    else if (!liveAudio) { lastCastAudioRef.current = -Infinity; sendCastAudio(null); }
  }, [feedingCast, renderAudio, liveAudio, sendCastAudio]);

  return {
    castState, relaySendRef, markLoaded, loadMark, clearMark,
  };
}
