import { useRef, useEffect, type RefObject } from 'react';
import * as crashLog from '../lib/crashLog';
import type { VisualizerSettings } from '../types';
import type { OutputConfig } from '../lib/outputConfig';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';
import type { useProjector } from '../hooks/useProjector';

/**
 * The black box's half from here (`lib/crashLog.ts`, `docs/crash-plan.md`):
 * which look, where the picture is going and the look itself, for a report.
 */
interface CrashStateDeps {
  activePresetName: string | null;
  settings: VisualizerSettings;
  output: OutputConfig;
  isCasting: boolean;
  projector: ReturnType<typeof useProjector>;
  isAutomated: boolean;
  wallRef: RefObject<LiquidVisualizerHandle | null>;
}

export function useCrashState({
  activePresetName, settings, output, isCasting, projector, isAutomated, wallRef,
}: CrashStateDeps) {
  // The black box's half from here: which look, where the picture is going,
  // and the look itself for a report (docs/crash-plan.md).
  const crashStateRef = useRef({ activePresetName, settings, output, isCasting, projector: projector.projector, isAutomated });
  crashStateRef.current = { activePresetName, settings, output, isCasting, projector: projector.projector, isAutomated };
  useEffect(() => {
    const unprovide = crashLog.provide('app', () => {
      const c = crashStateRef.current;
      const p = c.projector;
      return {
        preset: c.activePresetName ?? 'custom',
        // Whether Evolve is on, and how fast: the one switch a report about
        // "the plate changing too much" could not answer without.
        evolve: c.isAutomated ? `on at ${Math.round((c.settings.automateRate ?? 0) * 100)}%, surge ${Math.round((c.settings.surge ?? 0) * 100)}%` : 'off',
        projector: c.isCasting ? `casting${p ? ` to ${p.availWidth}x${p.availHeight}` : ''}` : p ? `found ${p.availWidth}x${p.availHeight}` : 'none',
      };
    });
    crashLog.provideReport({
      look: () => ({
        preset: crashStateRef.current.activePresetName,
        settings: crashStateRef.current.settings,
        plate: wallRef.current?.describePlate() ?? null,
        output: crashStateRef.current.output,
      }),
    });
    return unprovide;
  }, []);
}
