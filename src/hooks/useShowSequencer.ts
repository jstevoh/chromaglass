/**
 * Runs a show sequence: a transport (play, pause, next, previous) over the
 * stages of a `ShowSequence`, gliding the settings from one stage to the next
 * and advancing on a timer or when the song changes section.
 *
 * The hook owns no settings of its own. On each tick it asks the app for the
 * current settings, interpolates toward the stage's target, and hands back a
 * patch — so anything the user touches meanwhile is kept unless the stage
 * names that field.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VisualizerSettings } from '../types';
import { PRESETS, type Preset } from '../presets';
import { lookOf } from '../lib/lookFade';
import { clearShowInterval, showInterval, showNow } from '../lib/showClock';
import {
  ShowSequence, ShowStage, SequencerStatus,
  builtInSequences, loadUserSequences, saveUserSequences, lerpSettings,
} from '../lib/sequencer';
import {
  PACE_NEUTRAL, FROM_DARK_BELOW, ScenePlayer, type PaceMoment, type PaceSample, type SongCue,
} from '../lib/scenePacing';
import { stream } from '../lib/rng';

export interface UseShowSequencerArgs {
  /** The live settings, read at tick time. */
  getSettings: () => VisualizerSettings;
  /** Apply a settings patch (the app's updateSettings). */
  applySettings: (patch: Partial<VisualizerSettings>) => void;
  /** Adopt a preset's dyes and injection style without clearing the plate. */
  adoptPreset: (presetId: string) => void;
  /** Restrict the working palette to `size` of the preset's dyes, led by `lead`; null = all of them. */
  setPaletteWindow: (size: number | null, lead: number) => void;
  /** The current song section label, when music intelligence knows it. */
  sectionLabel: string | null;
  /** Time-based stages only run while the show is running. */
  isActive: boolean;
  /**
   * Hold everything: the clock, the glide, the stage changes.
   *
   * A sequence is a performance instrument — it rewrites the settings on a
   * clock — and Design is where those settings are being chosen by hand. With
   * both live, a look being built is edited underneath the person building it
   * every few seconds, by a stage they cannot see from that desk. So Design
   * suspends it, exactly as a paused plate does, and Perform picks it up
   * where it left off rather than losing the operator's place in the set.
   */
  suspended?: boolean;
  /** Every preset a stage may name: the built-ins and the user's own. */
  presets?: Preset[];
  /**
   * Where a desk says we are, in seconds from the top, or null when nothing
   * is sending timecode.
   *
   * With this arriving, the sequence stops being a timer and becomes a
   * timeline: the position decides which stage is up and how far into it we
   * are, so a set that is paused, located or restarted at the desk lands in
   * the same place the sound and the lights do. Without it nothing changes
   * and the stage clock runs as it always has.
   */
  timecodeAt?: number | null;
  /**
   * Where the scene is: how busy the plate should be and how far the light is
   * down (`lib/scenePacing.ts`). Called when it changes, and with 1 and 1 when
   * nothing is pacing the plate — stopped, paused, held in Design, or Pacing at 0.
   */
  pace?: (sample: PaceSample) => boolean | void;
  /** A scene's swell opening: pour, press, the next dyes, or the drain in the dark. */
  moment?: (kind: PaceMoment) => void;
  /**
   * What the song's shape has heard since the last call (`lib/songShape.ts`):
   * its drops, builds and breakdowns, the section and how far into a build.
   * Asked once a tick; a paced scene follows it by the Follow the Song
   * setting. Null when nothing is listening.
   */
  songCue?: () => SongCue | null;
}

interface Run {
  sequenceId: string;
  stageIndex: number;
  enteredAt: number;          // showNow() seconds (lib/showClock.ts)
  pausedAt: number | null;
  from: Partial<VisualizerSettings>;
  target: Partial<VisualizerSettings>;
  transition: number;
  sectionAtEntry: string | null;
  glideDone: boolean;
  /** The stage's scene (lib/scenePacing.ts): planned when Pacing is up, nothing at 0. */
  scene: ScenePlayer;
  /** The set is over (a sequence that does not loop ran out), as against the operator pausing it. */
  finished: boolean;
}

const now = () => showNow() * 0.001;
const TICK_MS = 250;
/** A section change can only advance a stage after this long in it. */
const MIN_SECTION_SECONDS = 8;
const pacingOf = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function useShowSequencer(args: UseShowSequencerArgs) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const [userSequences, setUserSequences] = useState<ShowSequence[]>(() => loadUserSequences());
  const builtIns = useMemo(() => builtInSequences(), []);
  const sequences = useMemo(() => [...builtIns, ...userSequences], [builtIns, userSequences]);
  const sequencesRef = useRef(sequences);
  sequencesRef.current = sequences;

  const [selectedId, setSelectedId] = useState<string>(builtIns[0]?.id ?? '');
  const runRef = useRef<Run | null>(null);
  /*
    Pacing belongs to the room, not a look (a look change keeps it), so a
    sequence whose stages set it would leave it set after it stopped, and the
    next sequence started that evening, one that never mentions Pacing, would
    play paced with dark endings it was not written for. So the Pacing in
    force when such a sequence starts is kept, and put back when it stops or
    another takes its place.

    `restoredPacingRef` covers the moment in between: the put-back value is
    handed to the app, which will not re-render before the next sequence's
    first stage reads the settings, so that stage reads it from here. It is
    cleared on the next tick.
  */
  const pacingBeforeRef = useRef<number | null>(null);
  const restoredPacingRef = useRef<number | null>(null);
  const releasePacing = useCallback(() => {
    const v = pacingBeforeRef.current;
    if (v === null) return;
    pacingBeforeRef.current = null;
    restoredPacingRef.current = v;
    argsRef.current.applySettings({ pacing: v });
  }, []);
  const holdPacing = useCallback((seq: ShowSequence) => {
    if (pacingBeforeRef.current !== null) return;
    if (!seq.stages.some(st => typeof st.settings?.pacing === 'number')) return;
    pacingBeforeRef.current = pacingOf(restoredPacingRef.current ?? argsRef.current.getSettings().pacing);
  }, []);
  /** What the plate was last told, so a tick that changes nothing sends nothing. */
  const paceSentRef = useRef<PaceSample>({ ...PACE_NEUTRAL });
  const sendPace = useCallback((s: PaceSample) => {
    const last = paceSentRef.current;
    if (Math.abs(s.activity - last.activity) < 1e-4 && Math.abs(s.dim - last.dim) < 1e-4) return;
    // Recorded as sent only when the plate took it: a sample sent before the
    // plate is up would otherwise never be sent again while it held steady.
    if (argsRef.current.pace?.(s) === false) return;
    paceSentRef.current = { ...s };
  }, []);
  const [status, setStatus] = useState<SequencerStatus>({
    sequenceId: null, name: null, running: false, stageIndex: 0, stageName: null, progress: 0, stages: [],
  });

  const persist = useCallback((next: ShowSequence[]) => {
    setUserSequences(next);
    saveUserSequences(next);
  }, []);

  const findSequence = useCallback((id: string | null | undefined) =>
    sequencesRef.current.find(q => q.id === id) ?? null, []);

  /** Enter a stage: adopt its preset, set the palette window, and start the glide. */
  const enterStage = useCallback((seq: ShowSequence, index: number) => {
    const stage: ShowStage | undefined = seq.stages[index];
    if (!stage) return;
    const a = argsRef.current;
    const preset = stage.presetId ? (a.presets ?? PRESETS).find(p => p.id === stage.presetId) : null;
    if (preset) a.adoptPreset(preset.id);
    // A stage that names a look glides to the whole of it (see LOOK_BASE), with
    // the stage's own settings over it. A stage with no look is a set of
    // changes to the one already playing, and glides only those.
    const target: Partial<VisualizerSettings> = { ...(preset ? lookOf(preset.settings) : {}), ...(stage.settings ?? {}) };
    if (stage.macro !== undefined) target.macroMode = stage.macro;
    const current = a.getSettings();
    const from: Partial<VisualizerSettings> = {};
    for (const key of Object.keys(target) as (keyof VisualizerSettings)[]) (from as Record<string, unknown>)[key] = current[key];
    a.setPaletteWindow(stage.paletteSize ?? null, stage.paletteLead ?? 0);
    const prev = runRef.current;
    /*
      The scene is planned at the Pacing the stage is going to, not the one it
      is leaving: a stage that glides Pacing up plans the busier scene it is
      becoming. It comes up out of the dark when the light is actually down as
      it enters, which is the stage before's dark ending, or Next pressed in
      the middle of one.
    */
    const pacing = pacingOf(target.pacing ?? restoredPacingRef.current ?? current.pacing);
    const fromDark = !!prev && prev.sequenceId === seq.id && paceSentRef.current.dim < FROM_DARK_BELOW;
    runRef.current = {
      sequenceId: seq.id,
      stageIndex: index,
      enteredAt: now(),
      pausedAt: prev && prev.sequenceId === seq.id && prev.pausedAt !== null ? now() : null,
      from, target,
      transition: Math.max(0, stage.transition),
      sectionAtEntry: a.sectionLabel,
      glideDone: false,
      scene: new ScenePlayer(stage, stream('show.pacing').float).enter(pacing, fromDark),
      finished: false,
    };
    // Non-numeric fields (blend mode, viscosity) switch at once when there is
    // nothing to glide through; numeric ones start moving on the next tick.
    if (runRef.current.transition <= 0) { a.applySettings(target); runRef.current.glideDone = true; }
  }, []);

  const publish = useCallback(() => {
    const run = runRef.current;
    const seq = run ? findSequence(run.sequenceId) : null;
    if (!run || !seq) {
      setStatus(s => (s.sequenceId === null && !s.running ? s : { ...s, sequenceId: null, name: null, running: false, stageName: null, progress: 0 }));
      return;
    }
    const stage = seq.stages[run.stageIndex];
    const elapsed = (run.pausedAt ?? now()) - run.enteredAt;
    const progress = stage ? Math.min(1, elapsed / Math.max(1, stage.seconds)) : 0;
    setStatus({
      sequenceId: seq.id,
      name: seq.name,
      running: run.pausedAt === null,
      stageIndex: run.stageIndex,
      stageName: stage?.name ?? null,
      progress,
      stages: seq.stages.map(st => ({ name: st.name, seconds: st.seconds, advance: st.advance })),
    });
  }, [findSequence]);

  const goTo = useCallback((index: number) => {
    const run = runRef.current;
    const seq = run ? findSequence(run.sequenceId) : findSequence(selectedId);
    if (!seq || seq.stages.length === 0) return;
    const n = seq.stages.length;
    const i = ((index % n) + n) % n;
    enterStage(seq, i);
    publish();
  }, [enterStage, findSequence, publish, selectedId]);

  const play = useCallback((sequenceId?: string) => {
    const id = sequenceId ?? runRef.current?.sequenceId ?? selectedId;
    const seq = findSequence(id);
    if (!seq || seq.stages.length === 0) return;
    if (sequenceId) setSelectedId(sequenceId);
    const run = runRef.current;
    if (run && run.sequenceId === seq.id && run.pausedAt !== null) {
      // Resume: shift the clock so the pause didn't count.
      run.enteredAt += now() - run.pausedAt;
      run.pausedAt = null;
      run.finished = false;
    } else if (!run || run.sequenceId !== seq.id) {
      if (run) releasePacing();
      holdPacing(seq);
      enterStage(seq, 0);
    }
    publish();
  }, [enterStage, findSequence, holdPacing, publish, releasePacing, selectedId]);

  /**
   * Start a sequence part-way through — the song it was made for was
   * identified `offsetSec` in — so its stages line up with the music rather
   * than starting from the top. Stages are laid end to end by their seconds.
   */
  const startAt = useCallback((sequenceId: string, offsetSec: number) => {
    const seq = findSequence(sequenceId);
    if (!seq || seq.stages.length === 0) return;
    setSelectedId(sequenceId);
    if (runRef.current && runRef.current.sequenceId !== seq.id) releasePacing();
    holdPacing(seq);
    const total = seq.stages.reduce((t, st) => t + Math.max(1, st.seconds), 0);
    let off = Math.max(0, offsetSec);
    if (seq.loop && total > 0) off = off % total;
    let index = 0;
    for (; index < seq.stages.length - 1; index++) {
      const len = Math.max(1, seq.stages[index].seconds);
      if (off < len) break;
      off -= len;
    }
    enterStage(seq, index);
    const run = runRef.current;
    if (run) {
      run.enteredAt -= Math.min(off, Math.max(1, seq.stages[index].seconds));
      run.pausedAt = null;
      // Arriving mid-stage, the settings should already be there.
      if (run.transition > 0 && off > run.transition) { argsRef.current.applySettings(run.target); run.glideDone = true; }
    }
    publish();
  }, [enterStage, findSequence, holdPacing, publish, releasePacing]);

  const pause = useCallback(() => {
    const run = runRef.current;
    if (run && run.pausedAt === null) run.pausedAt = now();
    publish();
  }, [publish]);

  const stop = useCallback(() => {
    runRef.current = null;
    argsRef.current.setPaletteWindow(null, 0);
    releasePacing();
    sendPace(PACE_NEUTRAL);
    publish();
  }, [publish, releasePacing, sendPace]);

  const next = useCallback(() => { if (runRef.current) goTo(runRef.current.stageIndex + 1); }, [goTo]);
  const prev = useCallback(() => { if (runRef.current) goTo(runRef.current.stageIndex - 1); }, [goTo]);

  // The clock.
  useEffect(() => {
    const timer = showInterval(() => {
      // The app has re-rendered with a put-back Pacing by now (see pacingBeforeRef).
      restoredPacingRef.current = null;
      const run = runRef.current;
      if (!run) return;
      const seq = findSequence(run.sequenceId);
      const stage = seq?.stages[run.stageIndex];
      if (!seq || !stage) { runRef.current = null; sendPace(PACE_NEUTRAL); publish(); return; }
      const a = argsRef.current;
      /*
        Paused, the operator has the plate: the light comes back up and the
        clock back to its own pace (at the plate's rate limit, so not in a
        blink), and a stage resumed picks its scene up where it was. The same
        in Design, where a look is being built and must be seen at full light.
      */
      /*
        Unless the set is over: a sequence that does not loop and ends in the
        dark stays dark, rather than relighting its last plate a second and a
        half after the show's final fade. Stop, or a play, hands it back.
      */
      if (run.pausedAt !== null) { if (!run.finished) sendPace(PACE_NEUTRAL); return; }
      // Held: the stage clock is pushed forward by the tick it just skipped,
      // so returning to Perform resumes where the set was rather than where
      // it would have got to on its own.
      if (a.suspended) { run.enteredAt += TICK_MS * 0.001; sendPace(PACE_NEUTRAL); return; }
      /*
        Locked to a desk.

        A timecode position is the whole answer — which stage, and how far in —
        so the stage clock is not advanced, it is *set* from the position. That
        is what makes a locate work: the desk jumps to 00:04:30 and the show
        goes to whatever stage covers that second rather than carrying on from
        where its own timer had got to.

        Held above the pause check on purpose. A show following a desk is not
        paused when the desk stops rolling, it is parked, and parked is what
        the position says it is.
      */
      const tc = a.timecodeAt;
      if (tc !== null && tc !== undefined) {
        let acc = 0, index = 0;
        for (; index < seq.stages.length - 1; index++) {
          if (acc + seq.stages[index].seconds > tc) break;
          acc += seq.stages[index].seconds;
        }
        // A timeline longer than the sequence wraps when it loops and parks on
        // the last stage when it does not, which is what the timer does too.
        if (seq.loop) {
          const total = seq.stages.reduce((t, st) => t + st.seconds, 0) || 1;
          const within = ((tc % total) + total) % total;
          acc = 0; index = 0;
          for (; index < seq.stages.length - 1; index++) {
            if (acc + seq.stages[index].seconds > within) break;
            acc += seq.stages[index].seconds;
          }
          run.enteredAt = now() - (within - acc);
        } else {
          run.enteredAt = now() - Math.max(0, tc - acc);
        }
        if (index !== run.stageIndex) { enterStage(seq, index); return; }
      } else if (!a.isActive) {
        // The show is paused: hold the stage clock, and give the plate its
        // light back, as a paused sequence does.
        run.enteredAt += TICK_MS * 0.001;
        sendPace(PACE_NEUTRAL);
        return;
      }
      const elapsed = now() - run.enteredAt;

      // Glide the settings toward the stage's target.
      if (!run.glideDone) {
        const t = run.transition > 0 ? Math.min(1, elapsed / run.transition) : 1;
        a.applySettings(lerpSettings(run.from, run.target, t));
        if (t >= 1) run.glideDone = true;
      }

      /*
        The scene: fire the swells that are due, and tell the plate where it
        is. Pacing is read live, so a stage gliding it, a fader or a MIDI knob
        deepens or flattens the scene as it moves, and 0 hands back exactly
        today's plate.
      */
      const settings = a.getSettings();
      const pacing = pacingOf(settings.pacing);
      // And the song: its drops open the swells, its builds and breakdowns
      // hold them (Follow the Song, lib/scenePacing.ts). Asked every tick so
      // nothing heard piles up for the next.
      const cue = a.songCue?.() ?? null;
      const { sample, moments } = run.scene.tick(elapsed, pacing, cue, pacingOf(settings.songFollow));
      for (const k of moments) a.moment?.(k);
      sendPace(sample);

      // Advance.
      let advance = false;
      if (stage.advance === 'time') advance = elapsed >= stage.seconds;
      else if (stage.advance === 'section') {
        const label = a.sectionLabel;
        if (label !== null && label !== run.sectionAtEntry && elapsed >= Math.min(MIN_SECTION_SECONDS, stage.seconds)) advance = true;
        // No song map (nothing identified yet): the clock runs the stage, a little long.
        else if (label === null && elapsed >= Math.max(stage.seconds, MIN_SECTION_SECONDS) * 1.5) advance = true;
      }
      // A desk's position owns the stage; advancing on our own clock as well
      // would fight it every tick.
      if (advance && (a.timecodeAt === null || a.timecodeAt === undefined)) {
        const last = run.stageIndex >= seq.stages.length - 1;
        if (last && !seq.loop) { run.pausedAt = now(); run.finished = true; publish(); return; }
        enterStage(seq, last ? 0 : run.stageIndex + 1);
      }
      publish();
    }, TICK_MS, 'sequencer');
    return () => { clearShowInterval(timer); sendPace(PACE_NEUTRAL); };
  }, [enterStage, findSequence, publish, sendPace]);

  const upsertSequence = useCallback((seq: ShowSequence) => {
    const next = userSequences.some(q => q.id === seq.id)
      ? userSequences.map(q => (q.id === seq.id ? seq : q))
      : [...userSequences, seq];
    persist(next);
  }, [persist, userSequences]);

  const removeSequence = useCallback((id: string) => {
    persist(userSequences.filter(q => q.id !== id));
    if (runRef.current?.sequenceId === id) stop();
    if (selectedId === id) setSelectedId(builtIns[0]?.id ?? '');
  }, [builtIns, persist, selectedId, stop, userSequences]);

  return {
    sequences,
    selectedId,
    setSelectedId,
    status,
    play, pause, stop, next, prev, goTo, startAt,
    upsertSequence, removeSequence,
  };
}
