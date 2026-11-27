/**
 * The plate's pointer and fingers: the mouse, the touches, the Spin tool's
 * hands, the closeup's Alt-drag and two-finger camera, and the cover glass's
 * pinch (PLAN 50c, 19ai-10: the frame loop's first piece out of React).
 *
 * Moved verbatim from the frame loop's `useEffect` in
 * `components/LiquidVisualizer.tsx` (the block that began "Mouse / touch
 * handlers", and the lines of its cleanup that took the listeners off and let
 * the fingers go). Nothing in it changed but its indentation: the refs it read
 * as the effect's closure it now reads from `refs`, destructured under the
 * same names, so every line below is the line that ran there, in the same
 * order, on the same events. The listeners are added in the same place in the
 * effect (after `resize`, before the first frame is asked for) and taken off
 * at the same point in its cleanup (`detach`), so a GPU loss that rebuilds the
 * effect lets go of the fingers exactly as it did.
 *
 * Why this piece first. It is the frame loop's one block with no GPU in it and
 * no frame state of its own: it writes the hands' boxes (`mousePosRef`,
 * `extraHandsRef`, the drop clock, the pinch) that the step reads, and reads
 * the camera and the settings. That makes it the engine's input edge, and the
 * shape later moves follow: a function that takes the canvas and the boxes it
 * touches, allocates nothing per frame, and returns what undoes it. It is also
 * the phone's whole touch path (`npm run phone` drives it), so the phone and
 * the desk are moved together.
 */
import { attachCoverPinch, pinchSpan, applyZoomPinch } from './coverPinch';
import type { Box } from './types';
import type { FluidSimulation } from '../sim/fluidSimulation';
import type { VisualizerSettings } from '../types';
import type { MacroShot } from '../lib/macroCamera';
import type { BlowDir } from '../lib/blowAim';
import type { SpinHand } from '../lib/turntable';
import { pointerOnPlate } from '../lib/pointerPlate';
import { showNow } from '../lib/showClock';
import { macroZoomOf, macroAmountOf, GRID_SIZE } from '../sim/constants';
import { type DropLaid, freshLaid, LAYING_TOOLS, stirAlongMove } from '../sim/tools';

// As the component's own module-level helper (LiquidVisualizer.tsx).
const c01 = (v: number) => Math.max(0, Math.min(1, v));

/** A finger on the glass after the first: its own place, stroke, drop clock and drops laid. */
export interface FingerHand { x: number; y: number; stroke: { x: number; y: number } | null; clock: number; laid: DropLaid; magnetAt?: number; blowDir?: BlowDir }

/** Two fingers on the closeup moving the camera (the component's `pinchRef`). */
export interface CameraPinch {
  d0: number; mx0: number; my0: number; zoom0: number; aimX: number; aimY: number; sent: number;
  /** The latest span, sent on lift if the frame's throttle held it back. */
  last: { d: number; mx: number; my: number } | null;
  /** Whether the pair has moved together far enough to be a pan, not only a pinch. */
  panned: boolean;
}

/**
 * The boxes the pointer reads and writes, each the component's ref of the same
 * name (see that ref's comment there for what it holds), plus `spinHandOf`,
 * the component's lazily made Spin hand per layer.
 */
export interface PointerRefs {
  // Read: where the picture is and how it is seen.
  stageRef: Box<{ width: number; height: number } | null>;
  frameRef: Box<{ top: number; left: number; width: number; height: number } | null>;
  macroShotRef: Box<MacroShot>;
  settingsRef: Box<VisualizerSettings>;
  rotationAnglesRef: Box<number[]>;
  layer1ViewRef: Box<{ zoom: number; dx: number; dy: number }>;
  activeLayerRef: Box<number>;
  activeToolRef: Box<string>;
  toolAmountRef: Box<number>;
  fluidsRef: Box<FluidSimulation[]>;
  spinHandsRef: Box<SpinHand[]>;
  onAimRef: Box<((x: number, y: number) => void) | undefined>;
  onPinchZoomRef: Box<((zoom: number) => void) | undefined>;
  // Written: the hands the step reads.
  isMouseDownRef: Box<boolean>;
  mousePosRef: Box<{ x: number; y: number }>;
  lastMousePosRef: Box<{ x: number; y: number } | null>;
  strokeLastRef: Box<{ x: number; y: number } | null>;
  dropClockRef: Box<number>;
  dropLaidRef: Box<DropLaid>;
  primaryTouchRef: Box<number | null>;
  extraHandsRef: Box<Map<number, FingerHand>>;
  pinchRef: Box<CameraPinch | null>;
  aimDragRef: Box<{ x0: number; y0: number; moved: number; aimX: number; aimY: number; sent: number } | null>;
  aimProbeRef: Box<{ downs: number; altDowns: number; aims: number; zoom: number; hasAim: boolean }>;
  // Published: the pointer's maps, for the remote's pad and the desk.
  drawnRectRef: Box<(() => DOMRect) | null>;
  plateAtRef: Box<((clientX: number, clientY: number) => { x: number; y: number }) | null>;
  wallPointRef: Box<((u: number, v: number, layer: number, turned: boolean, reach?: boolean) => { x: number; y: number }) | null>;
  spinHandOf: (layer: number) => SpinHand;
}

/**
 * Put the pointer and the fingers on `canvas`. Returns `detach`, which the
 * frame loop's cleanup calls where it took the listeners off before.
 */
export function attachPointer(canvas: HTMLCanvasElement, refs: PointerRefs): { detach: () => void } {
  const {
    stageRef, frameRef, macroShotRef, settingsRef, rotationAnglesRef, layer1ViewRef, activeLayerRef,
    activeToolRef, toolAmountRef, fluidsRef, spinHandsRef, onAimRef, onPinchZoomRef,
    isMouseDownRef, mousePosRef, lastMousePosRef, strokeLastRef, dropClockRef, dropLaidRef,
    primaryTouchRef, extraHandsRef, pinchRef, aimDragRef, aimProbeRef,
    drawnRectRef, plateAtRef, wallPointRef, spinHandOf,
  } = refs;
  // ── Mouse / touch handlers ─────────────────────────────────────
  // Where the picture actually sits in the element: the whole box, unless a
  // stage is attached and the canvas is letterboxed inside it.
  const drawnRect = (): DOMRect => {
    const box = canvas.getBoundingClientRect();
    // `objectFit: contain` is set for a stage *and* for the desk's preview,
    // so both letterbox and both need the same correction. Only the stage
    // used to get it, which put the brush wherever the letterbox bars moved
    // it to — on a 1200x800 buffer shown in a 582x606 hole that is 109px of
    // vertical error and a 2x scale error.
    if ((!stageRef.current && !frameRef.current) || canvas.width === 0 || canvas.height === 0) return box;
    const s = Math.min(box.width / canvas.width, box.height / canvas.height);
    const w = canvas.width * s, h = canvas.height * s;
    return new DOMRect(box.left + (box.width - w) / 2, box.top + (box.height - h) / 2, w, h);
  };
  drawnRectRef.current = drawnRect;
  /*
    A point on the wall (the canvas, normalised, y up) as a point on the
    plate, through the same camera as this screen's own pointer: the
    remote's pad sends the wall's points (PLAN 8-draw-a), and the wall is
    the middle of a plate half again as wide, turned and magnified. A
    DOMRect the canvas's own size stands for the screen's box; only its
    proportions are read.
  */
  wallPointRef.current = (u, v, layer, turned, reach) => {
    const rect = new DOMRect(0, 0, Math.max(1, canvas.width), Math.max(1, canvas.height));
    const p = fluidPointAt(u * rect.width, (1 - v) * rect.height, rect, layer, turned, reach);
    return { x: p.x / GRID_SIZE, y: p.y / GRID_SIZE };
  };
  /*
    Where a pointer is, in the plate's cells, not rounded: the Spin tool
    reads a hand's angle round the middle from it, and a pointer rounded to
    a cell is an angle rounded to a sixtieth of a radian at a third of the
    plate out, which at sixty readings a second is a turn a second of noise.
  */
  const fluidPointAt = (clientX: number, clientY: number, rect: DOMRect, layer = activeLayerRef.current, turned = true, reach = false) => {
    const shot = macroShotRef.current, st = settingsRef.current;
    // As the plate's uniforms have it: gathered back to one plate as the closeup comes in.
    const spread = c01(st.dishSpread ?? 0) * (1 - macroAmountOf(st));
    return pointerOnPlate(clientX - rect.left, clientY - rect.top, rect.width, rect.height, layer, turned ? rotationAnglesRef.current[layer] || 0 : 0,
      shot.cx, shot.cy, shot.zoom, spread, layer1ViewRef.current, GRID_SIZE, reach);
  };
  plateAtRef.current = (clientX, clientY) => {
    const p = fluidPointAt(clientX, clientY, drawnRect(), activeLayerRef.current, true, LAYING_TOOLS.has(activeToolRef.current));
    return { x: p.x / GRID_SIZE, y: p.y / GRID_SIZE };
  };
  const getTransformedMousePos = (clientX: number, clientY: number, rect: DOMRect) => {
    // A pouring hand in the screen's edge band reaches the dish past it (lib/pointerPlate.ts, PLAN 18a-18).
    const p = fluidPointAt(clientX, clientY, rect, activeLayerRef.current, true, LAYING_TOOLS.has(activeToolRef.current));
    return { x: Math.floor(p.x), y: Math.floor(p.y) };
  };
  /*
    A hand on the Spin tool (PLAN §22): where it is from the dish's middle
    as the audience sees it, in plate widths. The plate's cells turn with
    the liquid (`rotationAnglesRef`), so the point is turned back out by
    that angle; the hand's angle is then the room's, and its speed round
    the middle is what the dish is asked to turn at (lib/turntable.ts,
    SpinHand).
  */
  const spinHand = (id: string, clientX: number, clientY: number, landing: boolean) => {
    const p = fluidPointAt(clientX, clientY, drawnRect());
    const fx = p.x / GRID_SIZE - 0.5, fy = p.y / GRID_SIZE - 0.5;
    const a = rotationAnglesRef.current[activeLayerRef.current] || 0;
    const dx = fx * Math.cos(a) - fy * Math.sin(a), dy = fx * Math.sin(a) + fy * Math.cos(a);
    const hand = spinHandOf(activeLayerRef.current);
    if (landing) hand.down(id, dx, dy, showNow(), toolAmountRef.current); else hand.move(id, dx, dy, showNow(), toolAmountRef.current);
  };
  const spinLetGo = (id?: string) => {
    for (const h of spinHandsRef.current) { if (!h) continue; if (id === undefined) h.clear(); else h.up(id); }
  };

  /*
    The closeup camera by hand. Alt (Option) and drag grabs the view and
    pans it, the way a map moves under a hand; Alt-click fixes the camera
    on the spot under the pointer. The tools do nothing meanwhile. Only
    while zoomed in: at 1x there is nothing to aim.
  */
  const aimAtPointer = (clientX: number, clientY: number) => {
    const p = getTransformedMousePos(clientX, clientY, drawnRect());
    aimProbeRef.current.aims++;
    onAimRef.current?.(Math.min(1, Math.max(0, (p.x + 0.5) / GRID_SIZE)), Math.min(1, Math.max(0, (p.y + 0.5) / GRID_SIZE)));
  };
  const panAim = (e: MouseEvent) => {
    const drag = aimDragRef.current!;
    drag.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    const rect = drawnRect();
    const angle = rotationAnglesRef.current[activeLayerRef.current] || 0;
    const scale = Math.max(rect.width, rect.height) * 1.5 * Math.max(0.0001, macroShotRef.current.zoom);
    const sx = e.movementX, sy = -e.movementY;   // the plate's uv counts up
    const du = (sx * Math.cos(-angle) - sy * Math.sin(-angle)) / scale;
    const dv = (sx * Math.sin(-angle) + sy * Math.cos(-angle)) / scale;
    drag.aimX = Math.min(1, Math.max(0, drag.aimX - du));
    drag.aimY = Math.min(1, Math.max(0, drag.aimY - dv));
    // At most once a frame: each is a settings write.
    const now = performance.now();
    if (now - drag.sent > 16) { drag.sent = now; onAimRef.current?.(drag.aimX, drag.aimY); }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (aimDragRef.current) { panAim(e); return; }
    const rect = drawnRect();
    const { x, y } = getTransformedMousePos(e.clientX, e.clientY, rect);
    lastMousePosRef.current = { ...mousePosRef.current };
    mousePosRef.current = { x, y };
    const activeFluid = fluidsRef.current[activeLayerRef.current];
    if (!activeFluid) return;
    /*
      The magnet in the hand moves no liquid itself: the pull does. This
      pressed the glass under the pointer and stirred along its path on
      every move, whatever the tool, and under the magnet that press spread
      the ferrofluid into a ring round the hand and the stir swept it on.
      Measured by npm run magnet on the app's own step replayed in the lab:
      the magnet alone gathers 46 to 275 at the hand, and in the app the
      hand's spot emptied (187 to 108) while a ring 0.15-0.2 out filled.
    */
    if (activeToolRef.current === 'magnet') return;
    // The Spin tool turns the dish under the pointer and touches no liquid.
    if (activeToolRef.current === 'spin') {
      if (isMouseDownRef.current) spinHand('mouse', e.clientX, e.clientY, false);
      return;
    }
    /*
      And only while the button is down. This ran on every move, so moving
      the mouse across the plate to reach a control pressed and stirred the
      picture on the wall without anything having been clicked.
    */
    if (!isMouseDownRef.current) return;
    const angle = rotationAnglesRef.current[activeLayerRef.current] || 0;
    const scale = Math.max(rect.width, rect.height) * 1.5 / GRID_SIZE * Math.max(0.0001, macroShotRef.current.zoom);
    // The plate's uv counts up and CSS counts down (getTransformedMousePos):
    // unflipped, a stroke up the screen shoved the liquid down it.
    const sx = e.movementX, sy = -e.movementY;
    stirAlongMove(activeFluid, activeToolRef.current, x, y, (sx * Math.cos(-angle) - sy * Math.sin(-angle)) / scale, (sx * Math.sin(-angle) + sy * Math.cos(-angle)) / scale);
  };

  const handleMouseDown = (e: MouseEvent) => {
    const probe = aimProbeRef.current;
    probe.downs++; if (e.altKey) probe.altDowns++;
    probe.zoom = macroShotRef.current.zoom; probe.hasAim = !!onAimRef.current;
    if (e.altKey && macroShotRef.current.zoom > 1.005 && onAimRef.current) {
      // Start from where the camera is looking now, whoever was moving it.
      const shot = macroShotRef.current;
      aimDragRef.current = { x0: e.clientX, y0: e.clientY, moved: 0, aimX: shot.cx, aimY: shot.cy, sent: 0 };
      e.preventDefault();
      return;
    }
    isMouseDownRef.current = true;
    // A fresh press's own clock and count, even if no step has run since
    // the last let go (the step loop's reset needs a step with no hand).
    dropClockRef.current = 0;
    dropLaidRef.current = freshLaid();
    if (activeToolRef.current === 'spin') spinHand('mouse', e.clientX, e.clientY, true);
  };
  const handleMouseUp = (e: MouseEvent) => {
    const drag = aimDragRef.current;
    if (drag) {
      aimDragRef.current = null;
      if (drag.moved < 4) aimAtPointer(e.clientX, e.clientY);
      else onAimRef.current?.(drag.aimX, drag.aimY);
      return;
    }
    isMouseDownRef.current = false;
    spinLetGo('mouse');
  };

  /*
    Fingers, each one a hand (extraHandsRef).

    This read `touches[0]` and nothing else, so on a phone a second finger
    did nothing, and lifting either finger let go of the pointer while the
    other was still on the glass. Now the first finger down is the pointer,
    exactly as before (so everything that follows the pointer, the magnet
    and the performance recorder, still follows one finger), and every other
    finger is a hand of its own. When the pointer's finger lifts and others
    are still down, the oldest of them becomes the pointer, so a hand that
    keeps one finger on the glass keeps the magnet.

    Two fingers on the closeup are the camera instead (onPinchZoom): apart
    and together is the magnification, both moving is the aim, the way a map
    moves under two fingers. Only with the closeup in, and only where the app
    asked for it; everywhere else two fingers are two hands.
  */
  const touchCell = (t: Touch) => getTransformedMousePos(t.clientX, t.clientY, drawnRect());
  /*
    The fingers on the glass, not on the page. `touches` counts every
    finger on the screen, so a thumb resting on the dock (a tool, the Amount
    slider) and one finger landing on the closeup read as a pinch, spanned
    down to the thumb, and the plate could not be painted until the thumb
    came off the dock. `targetTouches` is the fingers that began on the
    canvas.
  */
  const letGo = () => {
    isMouseDownRef.current = false;
    primaryTouchRef.current = null;
    extraHandsRef.current.clear();
    spinLetGo();
  };
  const sendZoomPinch = (pinch: NonNullable<typeof pinchRef.current>, span: { d: number; mx: number; my: number }) =>
    applyZoomPinch(pinch, span, drawnRect(), rotationAnglesRef.current[activeLayerRef.current] || 0, macroShotRef.current.zoom, onPinchZoomRef.current, onAimRef.current);
  const handleTouchStart = (e: TouchEvent) => {
    if (pinchRef.current || coverPinch.active()) return;
    /*
      On the closeup by what the look asks for, not by where the camera
      has got to: the camera eases in over a second or so after the Zoom
      button, and gating on its zoom left the first pinch in that second
      painting two drops instead (npm run phone found it on a slow plate).
    */
    const asked = macroZoomOf(settingsRef.current);
    if (e.targetTouches.length >= 2 && onPinchZoomRef.current && asked > 1.05) {
      // The second finger of a pair on the closeup: the camera, not a brush.
      // Whatever the first finger had started is let go of.
      letGo();
      const span = pinchSpan(e);
      const shot = macroShotRef.current;
      pinchRef.current = { d0: Math.max(10, span.d), mx0: span.mx, my0: span.my, zoom0: asked, aimX: shot.cx, aimY: shot.cy, sent: 0, last: null, panned: false };
      return;
    }
    for (const t of Array.from(e.changedTouches)) {
      const p = touchCell(t);
      // Every finger on the Spin tool is a hand on the dish; two go round together.
      if (activeToolRef.current === 'spin') spinHand(`touch${t.identifier}`, t.clientX, t.clientY, true);
      if (primaryTouchRef.current === null) {
        primaryTouchRef.current = t.identifier;
        isMouseDownRef.current = true;
        dropClockRef.current = 0;
        dropLaidRef.current = freshLaid();
        // From here, not from where the last finger lifted: the recorder's
        // first gesture of a touch takes its direction from this.
        lastMousePosRef.current = { ...p };
        mousePosRef.current = p;
      } else if (t.identifier !== primaryTouchRef.current) {
        extraHandsRef.current.set(t.identifier, { ...p, stroke: null, clock: 0, laid: freshLaid() });
      }
    }
  };
  const handleTouchEnd = (e: TouchEvent) => {
    const pinch = pinchRef.current;
    if (pinch) {
      if (e.targetTouches.length === 0) {
        // The last move a frame's throttle held back, so the camera ends
        // where the fingers did, as the Alt-drag's mouseup does.
        if (pinch.last) sendZoomPinch(pinch, pinch.last);
        pinchRef.current = null;
      }
      return;
    }
    for (const t of Array.from(e.changedTouches)) {
      spinLetGo(`touch${t.identifier}`);
      if (t.identifier === primaryTouchRef.current) {
        const next = extraHandsRef.current.entries().next();
        if (next.done) {
          isMouseDownRef.current = false;
          primaryTouchRef.current = null;
        } else {
          // The oldest other finger takes over the pointer, stroke and clock
          // and all, so it carries on rather than landing a fresh drop.
          const [id, h] = next.value;
          extraHandsRef.current.delete(id);
          primaryTouchRef.current = id;
          mousePosRef.current = { x: h.x, y: h.y };
          lastMousePosRef.current = { x: h.x, y: h.y };
          strokeLastRef.current = h.stroke;
          dropClockRef.current = h.clock;
          dropLaidRef.current = h.laid;
        }
      } else {
        extraHandsRef.current.delete(t.identifier);
      }
    }
    if (e.targetTouches.length === 0) letGo();
  };
  const handleTouchMove = (e: TouchEvent) => {
    const pinch = pinchRef.current;
    if (pinch) {
      if (e.targetTouches.length < 2) return;
      pinch.last = pinchSpan(e);
      const now = performance.now();
      if (now - pinch.sent < 16) return;   // at most once a frame: each is a settings write
      pinch.sent = now;
      sendZoomPinch(pinch, pinch.last);
      return;
    }
    if (coverPinch.active()) return;
    const activeFluid = fluidsRef.current[activeLayerRef.current];
    for (const t of Array.from(e.changedTouches)) {
      const { x, y } = touchCell(t);
      if (activeToolRef.current === 'spin') { spinHand(`touch${t.identifier}`, t.clientX, t.clientY, false); continue; }
      if (t.identifier === primaryTouchRef.current) {
        lastMousePosRef.current = { ...mousePosRef.current };
        mousePosRef.current = { x, y };
      } else {
        const h = extraHandsRef.current.get(t.identifier);
        if (!h) continue;
        h.x = x; h.y = y;
      }
      // The press as for the mouse above, and no stir, which a touch never had (stirAlongMove: not under the finger, the drop or the blow).
      if (activeFluid && activeToolRef.current !== 'magnet') stirAlongMove(activeFluid, activeToolRef.current, x, y, 0, 0);
    }
  };

  const coverPinch = attachCoverPinch({
    canvas,
    isCloseup: () => macroZoomOf(settingsRef.current) > 1.05,
    getTool: () => activeToolRef.current,
    getFluids: () => fluidsRef.current,
    getLayer: () => activeLayerRef.current,
    onPinchEnter: letGo,
  });
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mousedown', handleMouseDown);
  window.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('touchstart', handleTouchStart);
  canvas.addEventListener('touchend', handleTouchEnd);
  canvas.addEventListener('touchcancel', handleTouchEnd);
  canvas.addEventListener('touchmove', handleTouchMove);

  const detach = () => {
    coverPinch.detach();
    canvas.removeEventListener('mousemove', handleMouseMove);
    canvas.removeEventListener('mousedown', handleMouseDown);
    window.removeEventListener('mouseup', handleMouseUp);
    canvas.removeEventListener('touchstart', handleTouchStart);
    canvas.removeEventListener('touchend', handleTouchEnd);
    canvas.removeEventListener('touchcancel', handleTouchEnd);
    canvas.removeEventListener('touchmove', handleTouchMove);
    // The fingers are let go of with their listeners; a mouse button held
    // through a rebuild is left as it always was, down until its mouseup.
    if (primaryTouchRef.current !== null) isMouseDownRef.current = false;
    primaryTouchRef.current = null;
    extraHandsRef.current.clear();
    pinchRef.current = null;
  };
  return { detach };
}
