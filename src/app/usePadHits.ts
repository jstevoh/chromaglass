import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { PALETTE, hexToRgb } from '../constants';
import { laidColour } from '../lib/liquidColour';
import { makePadHolds, padOff, padOn, padPressure, placeHit, releaseAllPads, stepPads, PAD_TICK_HZ, type PadGesture } from '../lib/padHits';
import { isPadTool, LAYING_PAD_TOOLS, type HandTarget, type PadTarget, type PadTool } from '../lib/padTarget';
import { stream } from '../lib/rng';
import { setPadDoor } from '../lib/padDoor';
import { LIQUIDS_BY_ID } from '../presetPlate';
import type { MidiEvent } from '../lib/midi';
import type { LiquidType } from '../types';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';
import type { useHand } from './useHand';

/**
 * The grid's pads held on the plate (PLAN 30c): MIDI's half of
 * lib/padHits.ts, and the half that knows the app's hand.
 *
 * A pad names what it can of its tool, liquid and colour (lib/padTarget.ts)
 * and leaves the rest to the hand: the tool picked on the desk (or on Track
 * Select), the bottle in hand, the dye in it. Those are read at the hit and
 * kept with the hold, so picking another bottle while a pour is held does
 * not change what is already pouring, as it would not with a real bottle in
 * the other hand.
 *
 * The holds are stepped by a timer at the phone's finger rate while any is
 * held, and by nothing while none is: the frame loop is the visualizer's and
 * does not grow for this (the gestures go through `applyGesture`, the door
 * the phone's pad, OSC and a replayed take use).
 */
interface Paint { liquid: LiquidType; color?: string; clear?: true }

/** A hand tool the grid can be: the mouse's Magnet and Spin are not, so a pad asking for the hand's while one is picked drips. */
const padToolOf = (t: string): PadTool => (isPadTool(t) ? t : 'dropper');

/** Gesture ids for pads, clear of the phone's and the pen's. */
const PAD_ID_BASE = 90000;

const places = stream('pad-hits');
/** The phone's pads hold on this channel (0-based 15, the 16th), clear of a controller's usual 1–8. */
const PHONE_CHANNEL = 15;

export function usePadHits(deps: {
  visualizerRef: RefObject<LiquidVisualizerHandle | null>;
  wallRef: RefObject<LiquidVisualizerHandle | null>;
  activeLayer: number;
  selectedLiquid: LiquidType;
  hand: ReturnType<typeof useHand>;
  setSelectedLiquidId: (id: string) => void;
  selectDye: (paletteIndex: number) => void;
}) {
  const live = useRef(deps);
  live.current = deps;
  const holds = useRef(makePadHolds<Paint>());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const out = useRef<PadGesture<Paint>[]>([]);

  /** What a pad lays, with the hand's picks filled in: its liquid, and the colour that liquid lays with the dye in it. */
  const paintOf = useCallback((t: PadTarget): Paint => {
    const d = live.current;
    const liquid = (t.liquid ? LIQUIDS_BY_ID.get(t.liquid) : undefined) ?? d.selectedLiquid;
    const dye = t.dye !== undefined ? PALETTE[t.dye % PALETTE.length]?.hex : d.selectedLiquid.color;
    return { liquid, ...laidColour(liquid, dye) };
  }, []);
  const toolOf = useCallback((t: PadTarget): PadTool => t.tool ?? padToolOf(live.current.hand.activeTool), []);

  const send = useCallback(() => {
    const gs = out.current;
    const d = live.current;
    const v = d.visualizerRef.current ?? d.wallRef.current;
    if (v) {
      for (const g of gs) {
        // A wall point onto the plate when it lands: the dish may have turned since the pad was struck.
        const p = v.wallToPlate(g.u, g.v, d.activeLayer, true);
        let dx: number | undefined, dy: number | undefined;
        if (g.du !== undefined || g.dv !== undefined) {
          const q = v.wallToPlate(g.u + (g.du ?? 0), g.v + (g.dv ?? 0), d.activeLayer, true);
          dx = q.x - p.x; dy = q.y - p.y;
          // A streak's dx/dy is a direction (performGesture smears ±len along it), as the recorder sends; Stir's is a drag.
          const n = Math.hypot(dx, dy);
          if (g.tool === 'streak' && n > 0) { dx /= n; dy /= n; }
        }
        const size = d.hand.toolAmounts[g.tool] ?? 1;
        v.applyGesture({
          // amount is the squeeze, and 0.5 is the mouse's: a full press of Press, Blow or Stir is the mouse's, not twice it.
          tool: g.tool, x: p.x, y: p.y, dx, dy, layer: d.activeLayer, amount: LAYING_PAD_TOOLS.has(g.tool) ? g.amount : g.amount / 2, id: PAD_ID_BASE + g.id,
          gain: g.gain * size * size, liquid: g.paint.liquid, color: g.paint.color, clear: g.paint.clear,
        });
      }
    }
    gs.length = 0;
  }, []);

  const stop = useCallback(() => {
    if (timer.current !== null) { clearInterval(timer.current); timer.current = null; }
  }, []);
  const tick = useCallback(() => {
    stepPads(holds.current, performance.now() / 1000, out.current);
    send();
    if (holds.current.holds.size === 0) stop();
  }, [send, stop]);

  const start = useCallback((channel: number, note: number, squeeze: number, t: PadTarget) => {
    const tool = toolOf(t);
    const paint = paintOf(t);
    padOn(holds.current, channel, note, squeeze, performance.now() / 1000, {
      tool, liquid: LAYING_PAD_TOOLS.has(tool) ? paint.liquid.behaviour ?? null : null, paint, at: placeHit(t.lane, places),
    }, out.current);
    send();
    if (timer.current === null) timer.current = setInterval(tick, 1000 / PAD_TICK_HZ);
  }, [paintOf, toolOf, send, tick]);
  const pad = useCallback((e: MidiEvent, t: PadTarget) => {
    if (e.kind === 'noteoff') padOff(holds.current, e.channel, e.number);
    else if (e.kind === 'noteon') start(e.channel, e.number, e.value / 127, t);
  }, [start]);

  const lift = useCallback((channel: number, note: number) => padOff(holds.current, channel, note), []);
  const pressure = useCallback((channel: number, note: number | null, v: number) => padPressure(holds.current, channel, note, v), []);
  const releasePads = useCallback(() => { releaseAllPads(holds.current); stop(); }, [stop]);
  useEffect(() => releasePads, [releasePads]);

  const pickHand = useCallback((t: HandTarget) => {
    if (t.tool) live.current.hand.setActiveTool(t.tool);
    else if (t.liquid) live.current.setSelectedLiquidId(t.liquid);
  }, []);
  /*
    The phone's pads (components/phone/PhonePads.tsx) through lib/padDoor.ts,
    held on MIDI channel 16's notes: the same holds, so the phone's grid and
    the APC40's are one engine.
  */
  useEffect(() => {
    setPadDoor({
      hit: (key, t, squeeze) => start(PHONE_CHANNEL, key, squeeze, t),
      press: (key, squeeze) => padPressure(holds.current, PHONE_CHANNEL, key, squeeze),
      lift: (key) => padOff(holds.current, PHONE_CHANNEL, key),
      pick: (t) => (t.kind === 'dye' ? live.current.selectDye(t.paletteIndex) : pickHand(t)),
    });
    return () => setPadDoor(null);
  }, [start, pickHand]);
  const toolAmount = useCallback((tool: PadTool) => live.current.hand.toolAmounts[tool] ?? 1, []);
  const setToolAmount = useCallback((tool: PadTool, a: number) => live.current.hand.setToolAmount(tool, a), []);

  /** A pad's LED: the colour it lays now, or none for a hand that lays nothing. */
  const padColor = useCallback((t: PadTarget) => {
    if (!LAYING_PAD_TOOLS.has(toolOf(t))) return null;
    const p = paintOf(t);
    return p.clear ? hexToRgb(p.liquid.own ?? '#ffffff') : p.color ? hexToRgb(p.color) : null;
  }, [paintOf, toolOf]);
  const inHand = useCallback((t: HandTarget) =>
    t.tool ? live.current.hand.activeTool === t.tool : live.current.selectedLiquid.id === t.liquid, []);
  const { hand, selectedLiquid } = deps;
  const handKey = `${hand.activeTool}|${selectedLiquid.id}|${selectedLiquid.color}|${Object.values(hand.toolAmounts).join(',')}`;

  return { pad, padPressure: pressure, padLift: lift, releasePads, pickHand, toolAmount, setToolAmount, padColor, inHand, handKey };
}
