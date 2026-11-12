import { useMemo, useRef, useEffect, useState, type RefObject, type Dispatch, type SetStateAction } from 'react';
import { type RemoteState, parseRemoteGesture, type RemoteMessage } from '../lib/remoteProtocol';
import { isUserPresetId } from '../lib/userPresets';
import type { VisualizerSettings, LiquidType } from '../types';
import { sanitizePatch } from '../lib/sanitizeSettings';
import { PadPictureSender, setPadPictureSender } from '../lib/padPicture';
import { TvFeedSender, setTvFeedSender } from '../lib/tvFeed';
import { canUseHomeFeature } from '../lib/tierGates';
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
import { useLiveShow, useLiveSetup, onAir, stopLive, startSavedLive } from '../lib/liveShow';
import { useSoundNow, askSound } from './soundNow';
import { usePlayerNow, askMusic } from './musicNow';
import { useEarNow, askEar } from './earNow';
import { useRecordNow, askRecord } from './recordNow';
import { useMediaNow, askMedia } from './mediaNow';
import { useOutputsNow, askOutputs } from './outputsNow';
import { useProjectorNow, askProjector } from './projectorNow';
import { useDeskNow, askDesk } from './deskNow';
import { useTempoNow, askTempo, askLink } from './tempoNow';
import { useSetNow, askSet, armSetItem } from './setNow';
import { useSongsNow, askSongs } from './songShowNow';
import { livePresetId } from '../presets';
import { assistantLook } from '../lib/assistantLook';
import { parseSongAction } from '../lib/songShows';
import { addSongCue } from './songCue';
import { takePourText } from '../lib/pourText';
import { useInkTitle } from './useInkTitle';
import { setSongTitleSink } from './songTitle';
import { parseSongCaption, showSongCaption } from '../lib/songCaption';
import { mountSongCaptionLayer } from '../components/songCaptionLayer';
import { useLogoMelt } from './useLogoMelt';

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
  liquidTypes: LiquidType[];
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
  /** Where the server's OSC out state goes (PLAN.md 13.5-osc): `useShowFeed` holds the switch. */
  oscOutHearRef: RefObject<OscOutHear | null>;
}

/** The server's word on OSC out, to whoever holds its switch. */
export type OscOutHear = (m: Extract<RemoteMessage, { type: 'osc-out' }>) => void;

export function useRemote({
  settings, activePresetId, isActive, isAutomated, overlaysVisible, musicIntel, sequencer,
  allPresets, blackout, recorder, cued, fadeSeconds, filmSource, markLoaded, rowFading,
  updateSettings, wallRef, setMirrorCount, setPhoneCount, relaySendRef, castState, cuePreset,
  cueLook, setCued, updateLiquidColor, selectedLiquidId, liquidTypes, setSelectedLiquidId,
  setIsActive, setSeedCount, setClearTrigger, setDrainTrigger, triggerLucky, setIsAutomated,
  hideOverlays, setOverlaysVisible, stepPreset, toggleBlackout, toggleRecording, togglePerformance,
  goLook, revertLook, fadeRow, selectedLiquid, phone, pinnedLookName, runActionRef, runAction,
  tempoRef, oscOutHearRef,
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
  /*
    The Live Show's titles (PLAN 37x-10): when the identified song changes
    and the Title switch is on (the phone's, beside the controls below, or
    the desk's Logo & Titles), its name is poured as ink and the wash takes
    it. Here beside the remote's `pour-text` message, the other way a title
    reaches the plate in a set, so the two are read in one place.
  */
  useInkTitle(wallRef, musicIntel.state.track, settings.inkTitle);
  /*
    How a title goes up, wherever it came from (app/songTitle.ts, 37x-10j):
    the corner caption unless `titleCaption` is off, then the ink as before.
    The setting is read through a ref when the title is due, so turning it
    over mid-song does not put a second title up. The caption's screen layer
    lives as long as this hook does; the stream draws its own copy.
  */
  const titleCaptionRef = useRef(settings.titleCaption);
  titleCaptionRef.current = settings.titleCaption;
  useEffect(() => {
    setSongTitleSink((card, ink) => {
      if (titleCaptionRef.current !== false) showSongCaption(card);
      else wallRef.current?.pourText(ink.rows, ink.colour ? { colour: ink.colour } : undefined);
    });
    const unmount = mountSongCaptionLayer();
    return () => { setSongTitleSink(null); unmount(); };
  }, [wallRef]);
  // The logo poured and melted as a film starts (PLAN 37x-11): the stream on air, or a Record take.
  useLogoMelt(wallRef, { live: liveShow.phase === 'live', recording: recorder.recording }, !!settings.logoMelt);
  // Each destination's health too (PLAN 44j), rounded to what a reader acts
  // on, so the key turns over with the clock's second and not with each byte.
  const liveKey = onAir(liveShow)
    ? JSON.stringify({
      test: liveShow.test, seconds: liveShow.seconds, names: liveShow.names, trouble: liveShow.destinations.some(d => d.dropping || d.phase !== 'live'),
      destinations: liveShow.destinations.map(d => ({ name: d.name, phase: d.phase, kbps: Math.round(d.kbps), secondsBehind: Math.round(d.secondsBehind * 10) / 10, dropping: d.dropping, reconnects: d.reconnects, error: d.error })),
      skipped: liveShow.skipped,
    })
    : '';
  const live = useMemo<RemoteState['live']>(() => (liveKey ? JSON.parse(liveKey) : null), [liveKey]);
  // What can be streamed to before going live, and what the show hears: the
  // owner's assistant reads both from here (PLAN 44j). Neither carries an
  // address or a key.
  const liveSetup = useLiveSetup();
  const sound = useSoundNow();
  const player = usePlayerNow();
  const ear = useEarNow();
  const record = useRecordNow();
  const media = useMediaNow();
  const outputs = useOutputsNow();
  const projector = useProjectorNow();
  const desk = useDeskNow();
  const tempo = useTempoNow();
  // The bench, for the state: it re-sends when a bottle changes (PLAN 44k-6).
  const bench = useMemo<RemoteState['bench']>(() => ({
    bottles: liquidTypes.map(l => ({ id: l.id, name: l.name, color: l.color })), inHand: selectedLiquidId,
  }), [liquidTypes, selectedLiquidId]);
  /*
    The set list, numbered as the desk lists it, and the song shows in brief
    (PLAN 44k-3, 44k-5), for the owner's assistant. An item's name is the
    desk's (App's `cues`): its own, else its look's, else its sequence's.
  */
  const setNow = useSetNow();
  const songs = useSongsNow();
  const set = useMemo<RemoteState['set']>(() => {
    const items = setNow.list.items.map((item, i) => {
      const seq = item.kind === 'sequence' ? sequencer.sequences.find(q => q.id === item.ref) : undefined;
      const look = item.kind === 'sequence' ? undefined : allPresets.find(p => p.id === (isUserPresetId(item.ref) ? item.ref : livePresetId(item.ref)));
      return { n: i + 1, name: item.name ?? look?.name ?? seq?.name ?? item.ref, kind: item.kind, look: look?.id ?? null, fade: item.fade ?? null, missing: item.kind === 'sequence' ? !seq : !look };
    });
    const armed = setNow.armedItem ? setNow.list.items.findIndex(i => i.id === setNow.armedItem) : -1;
    return { name: setNow.list.name, items, armed: armed >= 0 ? armed + 1 : null, fadeSeconds: setNow.fadeSeconds };
  }, [setNow, sequencer.sequences, allPresets]);
  /*
    The same set and shows as the phone controller lists them (PLAN 12-ctl-1):
    rows by id with the desk's names, and what is on stage, armed and running
    as the desk has it, so the phone's marks follow the laptop and never the
    phone's own tap.
  */
  const setList = useMemo<RemoteState['setList']>(() => ({
    name: setNow.list.name,
    items: setNow.list.items.map((item, i) => ({ id: item.id, name: set?.items[i]?.name ?? item.ref })),
    liveId: setNow.liveItem,
    cuedId: setNow.armedItem,
  }), [setNow, set]);
  const songList = useMemo<RemoteState['songs']>(() => ({
    shows: songs.shows.map(s => ({ id: s.id, title: s.title })),
    runningId: songs.running?.showId ?? null,
    follow: songs.follow,
  }), [songs]);
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
      sequences: sequencer.sequences.map(q => ({ id: q.id, name: q.name, stages: q.stages.length })),
      selectedId: sequencer.selectedId,
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
    liveSetup,
    sound,
    bench,
    tempo,
    set,
    setList,
    songs: songList,
    songShows: songs,
    player,
    ear,
    record,
    media,
    outputs,
    projector, desk,
  }), [settings, activePresetId, isActive, isAutomated, overlaysVisible, musicIntel.state.track?.title, sequencer.status, sequencer.sequences, sequencer.selectedId, allPresets, blackout, recorder.recording, recorder.seconds, cued, fadeSeconds, filmSource, markLoaded, rowFading, live, liveSetup, sound, bench, tempo, set, setList, songList, songs, player, ear, record, media, outputs, projector, desk]);

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
  // TVs at home showing the plate (PLAN 12-tv), and how many, for the cast menu.
  const tvFeedRef = useRef<TvFeedSender | null>(null);
  const [tvCount, setTvCount] = useState(0);
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
  const lastPourTextRef = useRef(-Infinity);
  /** The display's word on an assistant's call that carries an `answer` number (PLAN 44f-4, 44k-3, 44k-5). */
  const answer = (n: unknown, r: { ok: boolean; reason?: string; data?: unknown }) => {
    if (typeof n === 'number') relaySendRef.current?.({ type: 'assistant-answer', answer: n, ...r });
  };

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
        case 'tv-join':
          void tvFeedRef.current?.join(message.id);
          break;
        case 'tv-leave':
          tvFeedRef.current?.leave(message.id);
          break;
        case 'tv-signal':
          if (message.from) void tvFeedRef.current?.signal(message.from, message.signal);
          break;
        case 'tv-show':
          break;   // the relay's word to a TV, never a display's
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
        // The owner's assistant (PLAN 44c): a look it made, armed for Go, and
        // in Full mode the live stream. Only the relay's guard sends these.
        case 'cue-look': {
          const look = assistantLook(message, allPresets, activePresetId);
          if (look) setCued(look);
          break;
        }
        case 'assistant-live':
          // Why a start failed comes back in the state's `liveSetup.last`.
          void startSavedLive(message.test === true, Array.isArray(message.names) ? message.names.filter((n): n is string => typeof n === 'string') : undefined).catch(() => { /* the panel and liveSetup say why */ });
          break;
        case 'assistant-sound': {
          // With the microphone's input by name since 44k-12, answered once
          // the source has opened or failed, so an input unplugged since the
          // guard's copy, or one another app holds, comes back as why.
          void askSound(message.source, message.device).then((why) => {
            if (why) console.warn(`The assistant's sound source: ${why}`);
            answer(message.answer, why ? { ok: false, reason: why } : { ok: true });
          });
          break;
        }
        // A still for the assistant to judge detail by (PLAN 44c-4), and a
        // song action it programmed, fired by the show's own clock (44f).
        case 'assistant-still':
          padPictureRef.current?.wantStill(message.width);
          break;
        // The tempo, Link and the Sequence (PLAN 44k-7, 44k-8), through the
        // desk's own callbacks: what a typed bpm, the Link switch or the
        // Sequence panel's picker does, the assistant's call does.
        case 'assistant-tempo': case 'assistant-link': {
          const why = message.type === 'assistant-tempo' ? askTempo(message) : askLink(message);
          if (why) console.warn(`The assistant's tempo: ${why}`);
          break;
        }
        // One or the other in a message: a stage straight after a choice
        // would be read against the choice before it, since the choice lands
        // on the next render. The guard sends them apart. A stage only moves
        // a run: with none, goTo would start the sequence without holding the
        // performer's Pacing (useShowSequencer's holdPacing), and stop would
        // then have nothing to give back.
        case 'assistant-seq':
          if (typeof message.select === 'string') {
            if (sequencer.sequences.some(q => q.id === message.select)) sequencer.setSelectedId(message.select);
            else console.warn(`The assistant's sequence: no sequence ${message.select}`);
          } else if (typeof message.stage === 'number' && Number.isInteger(message.stage) && sequencer.status.sequenceId) sequencer.goTo(message.stage);
          break;
        case 'song-action': {
          let a = parseSongAction(message);
          // A set is clamped as a patch is, and dropped if it names no setting.
          if (a?.what.do === 'set') {
            const v = sanitizePatch({ [a.what.key]: a.what.value })[a.what.key];
            a = typeof v === 'number' ? { ...a, what: { ...a.what, value: v } } : null;
          }
          const why = a ? addSongCue(a.when, a.what) : 'not a song action this build knows';
          if (why) console.info(`[assistant] song action not added: ${why}`);
          answer(message.answer, why ? { ok: false, reason: why } : { ok: true });
          break;
        }
        /*
          The set list and the song shows (PLAN 44k-3, 44k-5), through the
          desk's own callbacks (app/setNow.ts, app/songShowNow.ts). Both
          answer, through the relay to the assistant alone: the guard said the
          call was allowed, this says it was done, or why not (the set changed
          under it, a look gone, no song to nudge), and what a read found.
        */
        case 'assistant-set': {
          const why = askSet(message);
          answer(message.answer, why ? { ok: false, reason: why } : { ok: true });
          break;
        }
        case 'assistant-songs':
          answer(message.answer, askSongs(message));
          break;
        /*
          The phone controller's Songs screen (PLAN 12-ctl-1), through the same
          doors: a set row armed by its id, a song's show run or stopped, and
          the Songs panel's Follow songs switch. The phone gets no answer: it
          reads the result in the next state, as every other control does.
        */
        case 'cue-set-item':
          if (typeof message.id === 'string') armSetItem(message.id);
          break;
        case 'song-run':
          if (typeof message.id === 'string') askSongs({ do: 'start', show: message.id });
          break;
        case 'song-stop':
          askSongs({ do: 'stop' });
          break;
        case 'song-follow':
          if (typeof message.on === 'boolean') askSongs({ do: 'follow', on: message.on });
          break;
        // The music player (PLAN 44k-2, app/musicNow.ts), answered as the set list is.
        case 'assistant-music': {
          const why = askMusic(message);
          answer(message.answer, why ? { ok: false, reason: why } : { ok: true });
          break;
        }
        // Calibrate, the song detector and Listen (PLAN 44k-10, app/earNow.ts), the same way.
        case 'assistant-ear': {
          const why = askEar(message);
          answer(message.answer, why ? { ok: false, reason: why } : { ok: true });
          break;
        }
        // Recording's options and the Takes (PLAN 44k-11, app/recordNow.ts), the same way.
        case 'assistant-record': {
          const why = askRecord(message);
          answer(message.answer, why ? { ok: false, reason: why } : { ok: true });
          break;
        }
        // Film, pours, the room camera and the mark (PLAN 44k-13, app/mediaNow.ts), answered once a camera or window opened.
        case 'assistant-media':
          void askMedia(message).then((why) => answer(message.answer, why ? { ok: false, reason: why } : { ok: true }),
            (err) => answer(message.answer, { ok: false, reason: `the show could not: ${String(err)}` }));
          break;
        // OSC out and MIDI (PLAN 44k-14, app/outputsNow.ts), answered once MIDI has opened or failed.
        case 'assistant-outputs':
          void askOutputs(message).then((why) => answer(message.answer, why ? { ok: false, reason: why } : { ok: true }),
            (err) => answer(message.answer, { ok: false, reason: `the show could not: ${String(err)}` }));
          break;
        // The projector and the wall (PLAN 44k-15, app/projectorNow.ts), answered once the show's window opened or did not.
        case 'assistant-projector':
          void askProjector(message).then((why) => answer(message.answer, why ? { ok: false, reason: why } : { ok: true }),
            (err) => answer(message.answer, { ok: false, reason: `the show could not: ${String(err)}` }));
          break;
        // The desk: its tabs and panels, the pins, the palette lock and what is in the hand (PLAN 44k-16, 44k-17, app/deskNow.ts).
        case 'assistant-desk':
          void askDesk(message).then((why) => answer(message.answer, why ? { ok: false, reason: why } : { ok: true }),
            (err) => answer(message.answer, { ok: false, reason: `the show could not: ${String(err)}` }));
          break;
        /*
          Words poured as ink (PLAN 37x-10c): a song's name at the top of a
          track, from the phone's text box or the relay's guard. Read as
          untrusted whoever sent it, and one pour per POUR_TEXT_GAP_MS at
          most (lib/pourText.ts `takePourText`), since a pour adds dye and a double tap
          would stack the same words into a blot.
        */
        case 'pour-text': {
          const t = performance.now();
          const pour = takePourText(message, t, lastPourTextRef.current);
          if (!pour) break;
          lastPourTextRef.current = t;
          wallRef.current?.pourText(pour.rows, { colour: pour.colour });
          break;
        }
        /*
          A song's credit as the corner caption (PLAN 37x-10j): artist, title,
          album and label from the phone, the show server's conductor or the
          assistant, for a set the ear cannot name (files played on the Mac).
          Read as untrusted (lib/songCaption.ts `parseSongCaption`); a new
          card replaces the last, so a double send shows one card. Always the
          caption, whatever `titleCaption` says: words poured as ink have
          their own message, `pour-text`, above.
        */
        case 'song-title': {
          const card = parseSongCaption(message);
          if (card) showSongCaption(card);
          break;
        }
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
          if (liquidTypes.some(l => l.id === message.id)) {
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
        case 'osc-out':
          oscOutHearRef.current?.(message);
          break;
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
        case 'osc-out-enable':
        case 'beat':
        case 'state':
        case 'lights':
        case 'cast':
        case 'picture':
        case 'assistant-mode':
        case 'assistant-reply':
        case 'assistant-undo':
        case 'assistant-answer':
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
  // And the TVs': one sender while the link is up, fed by the same frame task.
  // Home or Pro is asked at each TV's join, not here, so a licence that lands
  // after the page opened lets the next TV in without a reload.
  useEffect(() => {
    const sender = new TvFeedSender(remoteSend, canUseHomeFeature);
    sender.onCount = setTvCount;
    tvFeedRef.current = sender;
    setTvFeedSender(sender);
    return () => {
      sender.close();
      if (tvFeedRef.current === sender) tvFeedRef.current = null;
      setTvFeedSender(null);
      setTvCount(0);
    };
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
    tvCount,
  };
}
