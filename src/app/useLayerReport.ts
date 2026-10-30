import { useState, useRef, useEffect, type RefObject } from 'react';
import type { DeskLayout } from '../lib/deskLayout';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';

/**
 * Each layer's fill and colour for the desk's layer strip, polled from the
 * plate twice a second while the desk is in Preview and not at all otherwise:
 * the dye room is read off the GPU, and only the person building a look wants
 * the numbers.
 */
interface LayerReportDeps {
  deskLayout: DeskLayout;
  visualizerRef: RefObject<LiquidVisualizerHandle | null>;
}

export function useLayerReport({
  deskLayout, visualizerRef,
}: LayerReportDeps) {
  const [layerReport, setLayerReport] = useState<{ index: number; fill: number; colour: string }[]>([]);
  const layerReportKey = useRef('');
  /** Whether the plate is in Preview, for the poll below, which is armed once and never re-armed. */
  const buildingRef = useRef(false);
  buildingRef.current = deskLayout.plateMode === 'preview';
  useEffect(() => {
    const id = setInterval(() => {
      // Only a tab building a look in Preview draws them (Build's bench did),
      // and only when there is more than one layer to tell apart — otherwise
      // this is a re-render for a badge nobody is looking at.
      if (!buildingRef.current) return;
      const r = visualizerRef.current?.layerReport?.();
      if (!r || r.length < 2) return;
      // Only when the badge would change: a fresh array every poll re-rendered
      // the whole App two and a half times a second on an empty plate
      // (PLAN.md §14f, measured with `npm run renders`), and the tabs show a
      // whole percent and a colour, not the fill's fourth decimal.
      const key = r.map(l => `${Math.round(l.fill * 100)}:${l.colour}`).join(' ');
      if (key === layerReportKey.current) return;
      layerReportKey.current = key;
      setLayerReport(r);
    }, 400);
    return () => clearInterval(id);
  }, []);

  return {
    layerReport,
  };
}
