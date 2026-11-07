import { useEffect, useRef, useState } from 'react';
import { canUseMoirePack } from '../lib/tierGates';
import { MOIRE_PREVIEW_SECONDS } from '../lib/moire';
import type { VisualizerSettings } from '../types';

/**
 * Whether the moiré pack's controls are live here, and the minute's try of
 * it a copy without the pack gets (PLAN 42a). The desk's Moiré Sheets
 * section and the phone's Looks sheet both call this, so the two hands play
 * by one rule.
 *
 * A try puts the sheets on at a good print's ink and takes them off again
 * when the minute is up, or when the control that started it goes away (the
 * sheet closed), so a try never outlives the hand that asked for it.
 */
export function useMoirePreview(onUpdate: (patch: Partial<VisualizerSettings>) => void) {
  const allowed = canUseMoirePack();
  const [left, setLeft] = useState(0);
  const update = useRef(onUpdate);
  update.current = onUpdate;
  const leftRef = useRef(0);
  leftRef.current = left;
  const trying = left > 0;
  useEffect(() => {
    if (!trying) return;
    const t = setTimeout(() => {
      setLeft(l => l - 1);
      if (left <= 1) update.current({ moireAmount: 0 });
    }, 1000);
    return () => clearTimeout(t);
  }, [trying, left]);
  // The hand that started a try is gone: the sheets come off with it.
  useEffect(() => () => { if (leftRef.current > 0) update.current({ moireAmount: 0 }); }, []);
  return {
    /** Whether the controls move: the pack is here, or a try is running. */
    live: allowed || trying,
    allowed,
    secondsLeft: left,
    start: () => {
      if (allowed || trying) return;
      setLeft(MOIRE_PREVIEW_SECONDS);
      update.current({ moireAmount: 1 });
    },
  };
}
