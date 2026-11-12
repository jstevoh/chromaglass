import { useState, useEffect, useCallback, useRef } from 'react';
import { loadToolAmounts, saveToolAmounts, clampAmount } from '../lib/toolAmount';
import { publishHand, setHandDoor } from './deskNow';

export type HandTool = 'dropper' | 'blow' | 'spray' | 'splatter' | 'pour' | 'streak' | 'press' | 'finger' | 'magnet' | 'spin';

/**
 * What is in the hand: the tool, how much each tool does, and which plate a
 * gesture lands on. Moved out of App() whole (PLAN 44k-16) so the owner's
 * assistant can pick them through app/deskNow.ts, as the tool picker, its
 * Amount and the layer chips do, without App(), which may not grow, carrying
 * the door.
 *
 * The plates on the stage are App's (the look's count, and two while the back
 * plate has a look); it hands them in with `setStageLayers`, and the plate in
 * hand steps back onto the stage here when they fall, as it always did there.
 */
export function useHand() {
  const [activeLayer, setActiveLayer] = useState(0);
  const [activeTool, setActiveTool] = useState<HandTool>('dropper');
  // How much each tool does, per tool (lib/toolAmount.ts); 1 is what it always did.
  const [toolAmounts, setToolAmounts] = useState<Record<string, number>>(() => loadToolAmounts());
  useEffect(() => { saveToolAmounts(toolAmounts); }, [toolAmounts]);
  const toolAmount = toolAmounts[activeTool] ?? 1;
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;
  const setToolAmount = useCallback((tool: string, v: number) => setToolAmounts(prev => ({ ...prev, [tool]: clampAmount(v) })), []);
  const [stageLayers, setStageLayers] = useState(1);
  useEffect(() => {
    if (activeLayer >= stageLayers) {
      setActiveLayer(Math.max(0, stageLayers - 1));
    }
  }, [stageLayers, activeLayer]);

  useEffect(() => { publishHand(activeTool, toolAmount, activeLayer, stageLayers); }, [activeTool, toolAmount, activeLayer, stageLayers]);
  useEffect(() => {
    setHandDoor({ tool: t => setActiveTool(t as HandTool), amount: setToolAmount, layer: setActiveLayer });
    return () => setHandDoor(null);
  }, [setToolAmount]);

  return { activeLayer, setActiveLayer, activeTool, setActiveTool, toolAmounts, setToolAmounts, toolAmount, activeToolRef, setToolAmount, setStageLayers };
}
