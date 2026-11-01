import { useMemo, useRef, useEffect, type RefObject, type Dispatch, type SetStateAction } from 'react';
import { type RemoteState, parseRemoteGesture, type RemoteMessage } from '../lib/remoteProtocol';
import { isUserPresetId } from '../lib/userPresets';
import type { VisualizerSettings, LiquidType } from '../types';
import { sanitizePatch } from '../lib/sanitizeSettings';
import { PadPictureSender, setPadPictureSender } from '../lib/padPicture';
import { useRemoteLink } from '../hooks/useRemoteLink';
import type { MixSource } from '../lib/mixer';
import { unhandled } from '../lib/unhandled';
import { laidColour } from '../lib/liquidColour';
import { usePublishAccountShow } from '../lib/accountShows';
import type { MusicIntelResult } from '../hooks/useMusicIntelligence';
import type { Preset } from '../presets';
import type { Recorder } from '../hooks/useRecorder';
import type { ArmedLook } from './shared';
import type { FadeWay } from '../lib/mixFade';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';
import type { CastState } from '../lib/castProtocol';
import type { MidiAction } from '../lib/midi';
import type { TempoSource } from '../lib/tempo';
import type { useShowSequencer } from '../hooks/useShowSequencer';
import { useLiveShow, onAir, stopLive } from '../lib/liveShow';

/**
 * The phone remote (`hooks/useRemoteLink.ts`, `lib/remoteProtocol.ts`): the
 * state a phone or iPad shows, sent as it changes, and every gesture one sends
 * back, which lands on the same moves a key or a pad makes. Also the account's
 * published show and the pad's picture.
 */
interface RemoteDeps {
  settings: VisualizerSettings;
  activePresetId: string | null;
  isActive: boolean;
  isAutomated: boolean;
  overlaysVisible: boolean;
  musicIntel: MusicIntelResult;
  sequencer: ReturnType<typeof useShowSequencer>;
  allPresets: Preset[];
  blackout: boolean;
  recorder: Recorder;
  cued: ArmedLook | null;
  fadeSeconds: number;
  filmSource: "camera" | "window" | "none" | "file";
  markLoaded: boolean;
  rowFading: Partial<Record<MixSource, FadeWay>>;
  updateSettings: (patch: Partial<VisualizerSettings>) => void;
  wallRef: RefObject<LiquidVisualizerHandle | null>;
  setMirrorCount: Dispatch<SetStateAction<number>>;
  setPhoneCount: Dispatch<SetStateAction<number>>;
  relaySendRef: RefObject<((m: RemoteMessage) => void) | null>;
  castState: CastState;
  cuePreset: (presetId: string) => void;
  cueLook: (presetId: string) => void;
  setCued: Dispatch<SetStateAction<ArmedLook | null>>;
  updateLiquidColor: (id: string, color: string) => void;
  selectedLiquidId: string;
  liquidTypesRef: RefObject<LiquidType[]>;
  setSelectedLiquidId: Dispatch<SetStateAction<string>>;
  setIsActive: Dispatch<SetStateAction<boolean>>;
  setSeedCount: Dispatch<SetStateAction<number>>;
  setClearTrigger: Dispatch<SetStateAction<number>>;
  setDrainTrigger: Dispatch<SetStateAction<number>>;
  triggerLucky: () => void;
  setIsAutomated: Dispatch<SetStateAction<boolean>>;
  hideOverlays: () => void;
  setOverlaysVisible: Dispatch<SetStateAction<boolean>>;
  stepPreset: (dir: 1 | -1) => void;
  toggleBlackout: () => void;
  toggleRecording: () => void;
  togglePerformance: () => void;
  goLook: (seconds?: number | undefined) => void;
  revertLook: () => void;
  fadeRow: (id: MixSource) => void;
  selectedLiquid: LiquidType;
  phone: boolean;
  pinnedLookName: string | null;
  runActionRef: RefObject<((a: MidiAction) => void) | null>;
  runAction: (a: MidiAction) => void;
  /** Where Ableton Link's readings go (PLAN.md 13.5-link): the show server sends them, the beat clock reads them. */
  tempoRef: RefObject<TempoSource | null>;
}

export function useRemote({
  settings, activePresetId, isActive, isAutomated, overlaysVisible, musicIntel, sequencer,
  allPresets, blackout, recorder, cued, fadeSeconds, filmSource, markLoaded, rowFading,
  updateSettings, wallRef, setMirrorCount, setPhoneCount, relaySendRef, castState, cuePreset,
  cueLook, setCued, updateLiquidColor, selectedLiquidId, liquidTypesRef, setSelectedLiquidId,
  setIsActive, setSeedCount, setClearTrigger, setDrainTrigger, triggerLucky, setIsAutomated,
  hideOverlays, setOverlaysVisible, stepPreset, toggleBlackout, toggleRecording, togglePerformance,
  goLook, revertLook, fadeRow, selectedLiquid, phone, pinnedLookName, runActionRef, runAction,
  tempoRef,
}: RemoteDeps) {
  // ── Phone remote ────────────────────────────────────────────────
  // The laptop is authoritative: it publishes a snapshot of the show whenever
  // anything changes, and applies commands the phone sends back. When no relay
  // is running (the Firebase-hosted build, or plain `vite dev`), the link stays
  // dormant and nothing here changes behaviour.
  /*
    The live stream (lib/liveShow.ts, PLAN 37x-4d) as the phone needs it. Read
    whole once a second while on air (its clock), and folded to what the
    phone draws, so a destination's byte counts moving do not resend the
    state between those seconds.
  */
  const liveShow = useLiveShow();
  const liveKey = onAir(liveShow)
    ? JSON.stringify({ test: liveShow.test, seconds: liveShow.seconds, names: liveShow.names, trouble: liveShow.destinations.some(d => d.dropping || d.phase !== 'live') })
    : '';
  const live = useMemo<RemoteState['live']>(() => (liveKey ? JSON.parse(liveKey) : null), [liveKey]);
  const remoteState = useMemo<RemoteState>(() => ({
    settings,
    activePresetId,
    isActive,
    isAutomated,
    overlaysVisible,
    trackName: musicIntel.state.track?.title ?? null,
    sequencer: {
      name: sequencer.status.name,
      running: sequencer.status.running,
      stageIndex: sequencer.status.stageIndex,
      stageName: sequencer.status.stageName,
      progress: Math.round(sequencer.status.progress * 100) / 100,
      stages: sequencer.status.stages.map(st => ({ name: st.name, seconds: st.seconds })),
    },
    presets: allPresets.map(p => ({ id: p.id, name: p.name, macro: !!p.settings.macroMode, user: isUserPresetId(p.id) })),
    blackout,
    recording: recorder.recording ? recorder.seconds : null,
    cuedPresetId: cued?.id ?? null,
    cuedName: cued?.name ?? null,
    fadeSeconds,
    filmLoaded: filmSource !== 'none',
    markLoaded,
    rowFading,
    live,
  }), [settings, activePresetId, isActive, isAutomated, overlaysVisible, musicIntel.state.track?.title, sequencer.status, allPresets, blackout, recorder.recording, recorder.seconds, cued, fadeSeconds, filmSource, markLoaded, rowFading, live]);

  // Patches from a phone arrive at the rate of a thumb on a slider; apply
  // them in batches so the show isn't re-rendered thirty times a second.
  const pendingPatchRef = useRef<Partial<VisualizerSettings> | null>(null);
  const patchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queuePatch = (partial: Partial<VisualizerSettings>) => {
    const clean = sanitizePatch(partial);
    if (Object.keys(clean).length === 0) return;
    pendingPatchRef.current = { ...(pendingPatchRef.current ?? {}), ...clean };
    if (patchTimerRef.current) return;
    patchTimerRef.current = setTimeout(() => {
      patchTimerRef.current = null;
      const p = pendingPatchRef.current;
      pendingPatchRef.current = null;
      if (p) updateSettings(p);
    }, 50);
  };

  /*
    A pad's point on the wall, as the plate's (PLAN 8-draw-a): the remote's
    Draw sends where the finger is on the picture it shows, and the plate
    under that is through the camera (`wallToPlate`). A point without `wall`
    is the plate's already (OSC, an older remote). A stroke maps both its
    ends, so it shrinks with the plate as a mouse's does; a lean is only a
    direction in the room, so it is turned and keeps its length and angle.
  */
  const onWall = (wall: unknown, x: number, y: number, layer: number, dx?: number, dy?: number,
                  vec: 'stroke' | 'lean' = 'stroke', turned = true) => {
    const v = wallRef.current;
    if (wall !== true || !v) return { x, y, dx, dy };
    const p = v.wallToPlate(x, y, layer, turned);
    if (dx === undefined || dy === undefined) return { x: p.x, y: p.y, dx, dy };
    if (vec === 'stroke') {
      const q = v.wallToPlate(x - dx, y - dy, layer, turned);
      return { x: p.x, y: p.y, dx: p.x - q.x, dy: p.y - q.y };
    }
    /*
      A pen's lean is a direction in the room, not wall units: a 45° lean
      drawn as wall units on a 16:9 wall would come out at 29°. So it is
      only turned, by the angle the camera turns a step to the right through.
    */
    const r = v.wallToPlate(x + 0.01, y, layer, turned);
    const a = Math.atan2(r.y - p.y, r.x - p.x);
    return { x: p.x, y: p.y, dx: dx * Math.cos(a) - dy * Math.sin(a), dy: dx * Math.sin(a) + dy * Math.cos(a) };
  };
  const padPictureRef = useRef<PadPictureSender | null>(null);
  const linkAskedRef = useRef(-Infinity);
  /*
    Live's play and stop, when the operator asked for them (PLAN.md
    13.5-link-transport): a stop pauses a running Sequence, and a start
    resumes only a Sequence that Link paused, so Live never starts a show
    nobody started. The newest sequencer is read through a ref, because a
    reading twenty times a second is no reason to rebuild the handler.
  */
  const sequencerRef = useRef(sequencer);
  sequencerRef.current = sequencer;
  const linkPausedRef = useRef(false);
  const linkPausedIdRef = useRef<string | null>(null);
  const remoteLinkRef = useRef<((m: RemoteMessage) => void) | null>(null);

  const remoteLink = useRemoteLink({
    role: 'display',
    state: remoteState,
    onMessage: (message) => {
      switch (message.type) {
        case 'mirrors':
          setMirrorCount(message.count);
          break;
        case 'controllers':
          setPhoneCount(message.count);
          break;
        case 'request-cast':
          relaySendRef.current?.({ type: 'cast', message: { type: 'state', state: castState } });
          break;
        case 'patch':
          queuePatch(message.settings);
          break;
        case 'preset':
          cuePreset(message.presetId);
          break;
        case 'cue':
          // Arm, do not apply: `preset` is the destructive one.
          if (message.presetId) cueLook(message.presetId); else setCued(null);
          break;
        case 'dye': {
          const color = typeof message.color === 'string' && message.color.length <= 9 ? message.color : undefined;
          if (color) {
            updateLiquidColor(selectedLiquidId, color);
          }
          break;
        }
        case 'liquid':
          // Only a bottle that is actually on the bench: the pad may be a
          // newer build than the display, or the other way round.
          if (liquidTypesRef.current.some(l => l.id === message.id)) {
            setSelectedLiquidId(message.id);
          }
          break;
        case 'action':
          switch (message.action) {
            case 'play':          setIsActive(true); break;
            case 'pause':         setIsActive(false); break;
            case 'seed':          setSeedCount(prev => prev + 1); break;
            case 'clear':         setClearTrigger(prev => prev + 1); break;
            case 'drain':         setDrainTrigger(prev => prev + 1); break;
            case 'lucky':         triggerLucky(); break;
            case 'automate-on':   setIsAutomated(true); break;
            case 'automate-off':  setIsAutomated(false); break;
            case 'overlays-off':  hideOverlays(); break;
            case 'overlays-on':   setOverlaysVisible(true); break;
            case 'seq-play':      sequencer.play(); break;
            case 'seq-pause':     sequencer.pause(); break;
            case 'seq-next':      sequencer.next(); break;
            case 'seq-prev':      sequencer.prev(); break;
            case 'seq-stop':      sequencer.stop(); break;
            case 'preset-next':   stepPreset(1); break;
            case 'preset-prev':   stepPreset(-1); break;
            case 'blackout-toggle': toggleBlackout(); break;
            case 'record-toggle': toggleRecording(); break;
            case 'live-stop':     void stopLive().catch(() => { /* the panel shows why */ }); break;
            case 'performance-toggle': togglePerformance(); break;
            case 'go':            goLook(); break;
            case 'back':          revertLook(); break;
            case 'mix-fade-led': case 'mix-fade-gel': case 'mix-fade-lumia': case 'mix-fade-front':
            case 'mix-fade-back': case 'mix-fade-film': case 'mix-fade-mark':
              fadeRow(message.action.slice('mix-fade-'.length) as MixSource); break;
            // A phone may be a newer build than the display, so an action
            // this one does not know is possible rather than impossible: it
            // is said out loud instead of swallowed. `tsc` still requires a
            // case for every action this build's own protocol declares.
            default: unhandled('an action from the phone', message.action);
          }
          break;
        case 'blow': {
          const g = parseRemoteGesture(message);
          if (!g || g.type !== 'blow') break;
          // A pen's lean is a direction, not a stroke: turned with the dish, its length kept.
          wallRef.current?.applyGesture({ tool: 'blow', layer: g.layer, amount: g.amount, ...onWall(g.wall, g.x, g.y, g.layer, g.dx, g.dy, 'lean') });
          break;
        }
        case 'drop': {
          const g = parseRemoteGesture(message);
          if (!g || g.type !== 'drop') break;
          wallRef.current?.applyGesture({ tool: 'drop', ...onWall(g.wall, g.x, g.y, g.layer), layer: g.layer, amount: g.amount, ...laidColour(selectedLiquid, g.color) });
          break;
        }
        case 'press': {
          const g = parseRemoteGesture(message);
          if (!g || g.type !== 'press') break;
          wallRef.current?.applyGesture({ tool: 'press', ...onWall(g.wall, g.x, g.y, g.layer), layer: g.layer, amount: g.amount });
          break;
        }
        case 'finger': {
          const g = parseRemoteGesture(message);
          if (!g || g.type !== 'finger') break;
          wallRef.current?.applyGesture({ tool: 'finger', layer: g.layer, amount: g.amount, ...onWall(g.wall, g.x, g.y, g.layer, g.dx, g.dy, 'stroke') });
          break;
        }
        // The pad's finger on the dish (PLAN §22): the dish turns under it.
        case 'spin': {
          const g = parseRemoteGesture(message);
          if (!g || g.type !== 'spin') break;
          // Untouched by the dish's turn: Spin reads the hand's angle as the room sees it.
          wallRef.current?.applyGesture({ tool: 'spin', ...onWall(g.wall, g.x, g.y, g.layer, undefined, undefined, 'stroke', false), layer: g.layer, amount: g.amount, id: g.id });
          break;
        }
        // A remote on Draw asking for the wall (lib/padPicture.ts).
        case 'pad-picture':
          padPictureRef.current?.want(message.width);
          break;
        case 'tilt': {
          const g = parseRemoteGesture(message);
          if (!g || g.type !== 'tilt') break;
          wallRef.current?.setExternalTilt(g.x, g.y);
          break;
        }
        case 'link': {
          const t = tempoRef.current;
          if (!t) break;
          const edge = t.linkReading(performance.now(), message);
          const seq = sequencerRef.current;
          // A Sequence played, stopped or switched by hand since Link paused
          // it is the operator's again: Live's next play must not start it.
          if (linkPausedRef.current && (seq.status.running || seq.status.sequenceId !== linkPausedIdRef.current)) linkPausedRef.current = false;
          if (edge && t.linkTransport) {
            if (edge === 'stop' && seq.status.running) { linkPausedRef.current = true; linkPausedIdRef.current = seq.status.sequenceId; seq.pause(); }
            else if (edge === 'start' && linkPausedRef.current) { linkPausedRef.current = false; seq.play(); }
          }
          if (edge === 'stop' && !t.linkTransport) linkPausedRef.current = false;
          // The operator wanted Link on and the server says it is off: a server
          // just started (the Mac app relaunches it) or this page just
          // connected. Asked again at most every two seconds, so a server that
          // will not switch it on is not asked twenty times a second.
          const at = performance.now();
          // Below Pro (`locked`) every ten seconds, so a key filed later still opens it.
          if (t.linkWanted && !message.on && at - linkAskedRef.current > (message.locked ? 10000 : 2000)) {
            linkAskedRef.current = at;
            remoteLinkRef.current?.({ type: 'link-enable', on: true });
          }
          break;
        }
        /*
          Not this display's, and each for its own reason. Naming them is the
          point: without these four the switch below cannot ask the compiler
          for the rest, and "no case" reads the same whether it was decided
          or forgotten.

          `hello` goes the other way — `useRemoteLink` sends it on connect.
          `denied` is taken by that hook too, before `onMessage` ever runs,
          and so is `request-state`, which the hook answers for this role.
          `lights` and `state` this display *sends*: the first a few lines
          down from here, the second from the hook.
          `cast` is the mirror's, and `CastDisplay` has it.
        */
        case 'hello':
        case 'denied':
        case 'request-state':
        case 'link-enable':
        case 'state':
        case 'lights':
        case 'cast':
        case 'picture':
          break;
        default: unhandled('a message from the phone', message);
      }
    },
  });
  usePublishAccountShow(!phone && remoteLink.status === 'connected', pinnedLookName);

  runActionRef.current = runAction;
  remoteLinkRef.current = remoteLink.send;

  // The wall for a remote's Draw: one sender while the link is up, fed by the frame task.
  const remoteSend = remoteLink.send;
  useEffect(() => {
    const sender = new PadPictureSender(remoteSend);
    padPictureRef.current = sender;
    setPadPictureSender(sender);
    return () => { if (padPictureRef.current === sender) padPictureRef.current = null; setPadPictureSender(null); };
  }, [remoteSend]);
  // The desk's Link switch goes to the show server over this link.
  useEffect(() => {
    const t = tempoRef.current;
    if (!t) return;
    t.onLinkSwitch = (on) => remoteSend({ type: 'link-enable', on });
    return () => { t.onLinkSwitch = null; };
  }, [tempoRef, remoteSend]);

  return {
    remoteLink,
  };
}
