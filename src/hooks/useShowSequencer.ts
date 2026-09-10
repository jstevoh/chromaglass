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
import { PRESETS } from '../presets';
import {
  ShowSequence, ShowStage, SequencerStatus,
  builtInSequences, loadUserSequences, saveUserSequences, lerpSettings,
} from '../lib/sequencer';

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
}

interface Run {
  sequenceId: string;
  stageIndex: number;
  enteredAt: number;          // performance.now() seconds
  pausedAt: number | null;
  from: Partial<VisualizerSettings>;
  target: Partial<VisualizerSettings>;
  transition: number;
  sectionAtEntry: string | null;
  glideDone: boolean;
}

const now = () => performance.now() * 0.001;
const TICK_MS = 250;
/** A section change can only advance a stage after this long in it. */
const MIN_SECTION_SECONDS = 8;

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
    const preset = stage.presetId ? PRESETS.find(p => p.id === stage.presetId) : null;
    if (preset) a.adoptPreset(preset.id);
    const target: Partial<VisualizerSettings> = { ...(preset?.settings ?? {}), ...(stage.settings ?? {}) };
    if (stage.macro !== undefined) target.macroMode = stage.macro;
    else if (preset && preset.settings.macroMode === undefined) target.macroMode = false;
    const current = a.getSettings();
    const from: Partial<VisualizerSettings> = {};
    for (const key of Object.keys(target) as (keyof VisualizerSettings)[]) (from as Record<string, unknown>)[key] = current[key];
    a.setPaletteWindow(stage.paletteSize ?? null, stage.paletteLead ?? 0);
    const prev = runRef.current;
    runRef.current = {
      sequenceId: seq.id,
      stageIndex: index,
      enteredAt: now(),
      pausedAt: prev && prev.sequenceId === seq.id && prev.pausedAt !== null ? now() : null,
      from, target,
      transition: Math.max(0, stage.transition),
      sectionAtEntry: a.sectionLabel,
      glideDone: false,
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
    } else if (!run || run.sequenceId !== seq.id) {
      enterStage(seq, 0);
    }
    publish();
  }, [enterStage, findSequence, publish, selectedId]);

  const pause = useCallback(() => {
    const run = runRef.current;
    if (run && run.pausedAt === null) run.pausedAt = now();
    publish();
  }, [publish]);

  const stop = useCallback(() => {
    runRef.current = null;
    argsRef.current.setPaletteWindow(null, 0);
    publish();
  }, [publish]);

  const next = useCallback(() => { if (runRef.current) goTo(runRef.current.stageIndex + 1); }, [goTo]);
  const prev = useCallback(() => { if (runRef.current) goTo(runRef.current.stageIndex - 1); }, [goTo]);

  // The clock.
  useEffect(() => {
    const timer = setInterval(() => {
      const run = runRef.current;
      if (!run) return;
      const seq = findSequence(run.sequenceId);
      const stage = seq?.stages[run.stageIndex];
      if (!seq || !stage) { runRef.current = null; publish(); return; }
      const a = argsRef.current;
      if (run.pausedAt !== null) return;
      if (!a.isActive) { run.enteredAt += TICK_MS * 0.001; return; }   // the show is paused: hold the stage clock
      const elapsed = now() - run.enteredAt;

      // Glide the settings toward the stage's target.
      if (!run.glideDone) {
        const t = run.transition > 0 ? Math.min(1, elapsed / run.transition) : 1;
        a.applySettings(lerpSettings(run.from, run.target, t));
        if (t >= 1) run.glideDone = true;
      }

      // Advance.
      let advance = false;
      if (stage.advance === 'time') advance = elapsed >= stage.seconds;
      else if (stage.advance === 'section') {
        const label = a.sectionLabel;
        if (label !== null && label !== run.sectionAtEntry && elapsed >= Math.min(MIN_SECTION_SECONDS, stage.seconds)) advance = true;
        // No song map (nothing identified yet): the clock runs the stage, a little long.
        else if (label === null && elapsed >= Math.max(stage.seconds, MIN_SECTION_SECONDS) * 1.5) advance = true;
      }
      if (advance) {
        const last = run.stageIndex >= seq.stages.length - 1;
        if (last && !seq.loop) { run.pausedAt = now(); publish(); return; }
        enterStage(seq, last ? 0 : run.stageIndex + 1);
      }
      publish();
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [enterStage, findSequence, publish]);

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
    play, pause, stop, next, prev, goTo,
    upsertSequence, removeSequence,
  };
}
