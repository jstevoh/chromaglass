import { useState, useRef, useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import type { EngineStatus } from '../lib/platform';
import { type BenchOptions, runBench, readRenderer, formatBench } from '../lib/bench';
import type { VisualizerSettings } from '../types';

/**
 * The engine's status line and the grid sweep (`lib/bench.ts`): Calibrate, the
 * bench overlay and `?bench`, which runs the sweep on its own once the first
 * frame is up so the machine a show will run on can be measured from a link.
 */
interface BenchDeps {
  setSettings: Dispatch<SetStateAction<VisualizerSettings>>;
}

export function useBench({
  setSettings,
}: BenchDeps) {
  const [calibrateNonce, setCalibrateNonce] = useState(0);
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const shownEngineStatus = useRef<EngineStatus | null>(null);
  const engineStatusRef = useRef<EngineStatus | null>(null);
  // ── The grid sweep ──
  // Walks the solver down every grid and reports where a frame's time went on
  // each, so the question "is the grid what costs you" has an answer taken the
  // same way on every machine rather than by hand, five times, from a readout.
  const [bench, setBench] = useState<{ running: boolean; done: number; total: number; label: string; text: string | null }>(
    { running: false, done: 0, total: 0, label: '', text: null },
  );
  const benchBusyRef = useRef(false);
  /** The effect that installs the hooks runs once; this keeps it off a stale callback. */
  const startBenchRef = useRef<((opts?: BenchOptions) => Promise<void>) | null>(null);
  const startBench = useCallback(async (opts?: BenchOptions) => {
    if (benchBusyRef.current) return;
    benchBusyRef.current = true;
    setBench({ running: true, done: 0, total: 0, label: 'starting', text: null });
    // Whatever the grid was before this is the grid it goes back to; a
    // diagnostic that leaves the show on a different setting than it found it
    // is a diagnostic that changes the thing it measured.
    let restore: VisualizerSettings['simResolution'] = 'auto';
    setSettings(prev => { restore = prev.simResolution; return prev; });
    try {
      const report = await runBench({
        setGrid: (g) => setSettings(prev => ({ ...prev, simResolution: g })),
        read: () => engineStatusRef.current,
        renderer: readRenderer,
        sleep: (ms) => new Promise(r => setTimeout(r, ms)),
        now: () => performance.now(),
        onProgress: (done, total, label) => setBench(b => ({ ...b, done, total, label })),
      }, opts);
      // Put the show back before showing the result, not after.
      //
      // The restore used to live only in the `finally`, which runs after the
      // report is on screen — so for the few seconds it takes the engine to
      // rebuild and republish, the sweep said it was finished while the plate
      // was still on whatever rung it ended on. Measured at three and a half
      // seconds of the show sitting on the CPU solver behind a panel saying
      // the measurement was done. The `finally` stays as the path an error
      // takes; setting it twice costs nothing, since the second is the same
      // value and React drops it.
      setSettings(prev => ({ ...prev, simResolution: restore }));
      const text = formatBench(report);
      console.log(text);
      setBench({ running: false, done: 0, total: 0, label: '', text });
    } catch (err) {
      console.error('ChromaGlass: the grid sweep failed.', err);
      setBench({ running: false, done: 0, total: 0, label: '', text: `The sweep failed: ${String(err)}` });
    } finally {
      setSettings(prev => ({ ...prev, simResolution: restore }));
      benchBusyRef.current = false;
    }
  }, []);
  startBenchRef.current = startBench;

  /*
    `?bench` runs the grid sweep on its own and shows the result.

    The measurement it takes is one somebody else has to run — it needs the
    machine the show will run on, which is never the one the code was written
    on — so the whole of it has to be a link that can be sent and a block of
    text that comes back. Waits for the first frame, because a sweep that
    starts before there is an engine to read measures the loading screen.
  */
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('bench')) return;
    let cancelled = false;
    const wait = setInterval(() => {
      if (cancelled || !engineStatusRef.current) return;
      clearInterval(wait);
      void startBenchRef.current?.();
    }, 250);
    return () => { cancelled = true; clearInterval(wait); };
  }, []);

  return {
    calibrateNonce, setCalibrateNonce, engineStatus, setEngineStatus, shownEngineStatus,
    engineStatusRef, bench, setBench, startBenchRef,
  };
}
