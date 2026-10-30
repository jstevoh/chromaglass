import { useState, useCallback, useEffect, useMemo } from 'react';
import { type OutputConfig, loadOutput, saveOutput, DEFAULT_OUTPUT, type WallTest, wallTestOn, normalizeOutput } from '../lib/outputConfig';

/**
 * The projector's geometry and grade, and the wall's test card.
 *
 * Corner pin, mask, flip and the output grade describe the room, not the look,
 * so they are kept on this machine (`lib/outputConfig.ts`) and never travel in a
 * preset. The test pattern and Identify sit beside them because they are how
 * that geometry is set up on a real wall. `npm run wall` reaches the geometry
 * through `chromaglassOutput`, set here beside the state it writes.
 */
export function useOutput() {
  // ── The projector's geometry and grade ──────────────────────────
  // Rear-projection flip, corner pin, edge blanking, output grade. Kept on
  // this machine rather than in the settings, because it describes the room
  // and not the look: a preset file must not carry a venue's keystone to
  // whoever opens it next. See `lib/outputConfig.ts`.
  const [output, setOutputState] = useState<OutputConfig>(loadOutput);
  const setOutput = useCallback((next: OutputConfig | ((prev: OutputConfig) => OutputConfig)) => {
    setOutputState(prev => {
      const value = typeof next === 'function' ? (next as (p: OutputConfig) => OutputConfig)(prev) : next;
      saveOutput(value);
      return value;
    });
  }, []);
  // The wall's Reset squares the projector and leaves the mapped shapes: they
  // live in a section of their own with their own Clear, and a Reset pressed
  // over there should not quietly throw away an evening's corner-dragging here.
  const resetOutput = useCallback(() => setOutput(prev => ({ ...DEFAULT_OUTPUT, surfaces: prev.surfaces })), [setOutput]);
  /*
    The wall test (Desk v2, PLAN.md 8e): Load-in's test pattern and Identify.
    Beside the output config, never in it: that config is stored, and a show
    that opened on last night's test pattern would put a grid on the wall in
    front of the room. Laid onto the config only for the plate (`shownOutput`),
    which draws it in the projector's pass, through the same pin and masks as
    the show. Identify ends itself: once its three seconds are up the test is
    dropped, so the pass it needed is dropped with it when nothing else does.
  */
  const [wallTest, setWallTest] = useState<WallTest>({ pattern: false, identifyUntil: 0 });
  useEffect(() => {
    const left = wallTest.identifyUntil - Date.now();
    if (left <= 0) return;
    const t = window.setTimeout(() => setWallTest(w => ({ ...w, identifyUntil: 0 })), left + 50);
    return () => window.clearTimeout(t);
  }, [wallTest.identifyUntil]);
  const shownOutput = useMemo<OutputConfig>(
    () => (wallTestOn(wallTest) ? { ...output, test: wallTest } : output),
    [output, wallTest]);

  // Load-in is geometry, and geometry can be checked exactly. `npm run wall`
  // drives this to set a corner pin or a mask on a plate that is already
  // running, so the before and the after are the same look half a second
  // apart rather than two different plates from two page loads.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('debug')) return;
    window.chromaglassOutput =
      (patch: Partial<OutputConfig>) => { setOutput(prev => normalizeOutput({ ...prev, ...patch })); };
  }, [setOutput]);

  return {
    output, setOutput, resetOutput, wallTest, setWallTest, shownOutput,
  };
}
