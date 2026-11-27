/**
 * Two-finger pinch and trackpad ctrl-wheel handling for the plate:
 * - Outside the closeup, a trackpad ctrl-wheel pinch or a touch pair whose
 *   span changes past `PINCH_SPAN` drives `FluidSimulation.coverHand` via
 *   `pinchHand(scale)`, returning `coverHand` to 0 when the gesture ends.
 * - On the closeup, two fingers zoom and pan the camera (`pinchSpan`,
 *   `applyZoomPinch`), kept out of `LiquidVisualizer.tsx` so it stays small
 *   and App / the desks never touch GPU code.
 */
import { pinchHand, playHand, type PlayHand, type PlayTool } from '../lib/playGesture';

export interface PinchSpan {
  d: number;
  mx: number;
  my: number;
}

export interface ZoomPinch {
  d0: number;
  mx0: number;
  my0: number;
  zoom0: number;
  aimX: number;
  aimY: number;
  sent: number;
  last: PinchSpan | null;
  panned: boolean;
}

export function pinchSpan(e: TouchEvent): PinchSpan {
  const a = e.targetTouches[0], b = e.targetTouches[1];
  return {
    d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
    mx: (a.clientX + b.clientX) / 2,
    my: (a.clientY + b.clientY) / 2,
  };
}

export function applyZoomPinch(
  pinch: ZoomPinch,
  span: PinchSpan,
  rect: { width: number; height: number },
  angle: number,
  macroZoom: number,
  onZoom: ((z: number) => void) | undefined,
  onAim: ((x: number, y: number) => void) | undefined,
): void {
  onZoom?.(Math.max(1, Math.min(16, (pinch.zoom0 * span.d) / pinch.d0)));
  if (!pinch.panned && Math.hypot(span.mx - pinch.mx0, span.my - pinch.my0) < 8) return;
  pinch.panned = true;
  const scale = Math.max(rect.width, rect.height) * 1.5 * Math.max(0.0001, macroZoom);
  const sx = span.mx - pinch.mx0, sy = -(span.my - pinch.my0);
  const du = (sx * Math.cos(-angle) - sy * Math.sin(-angle)) / scale;
  const dv = (sx * Math.sin(-angle) + sy * Math.cos(-angle)) / scale;
  onAim?.(Math.min(1, Math.max(0, pinch.aimX - du)), Math.min(1, Math.max(0, pinch.aimY - dv)));
}

export interface CoverPinchOpts {
  canvas: HTMLCanvasElement;
  isCloseup: () => boolean;
  getTool: () => string;
  getFluids: () => readonly ({ coverHand: number } | null | undefined)[];
  getLayer: () => number;
  onPinchEnter: () => void;
}

const WHEEL_IDLE_MS = 200;

export function attachCoverPinch(opts: CoverPinchOpts): { detach: () => void; active: () => boolean } {
  let wheelScale = 1;
  let wheelTimer = 0;

  const setHand = (v: number) => {
    const f = opts.getFluids()[opts.getLayer()];
    if (f) f.coverHand = v;
  };
  const clearHand = () => {
    for (const f of opts.getFluids()) if (f) f.coverHand = 0;
  };

  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey || opts.isCloseup()) return;
    e.preventDefault();
    wheelScale = Math.max(1e-6, Math.min(1e6, wheelScale * Math.exp(-e.deltaY / 100)));
    setHand(pinchHand(wheelScale));
    window.clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(() => {
      wheelScale = 1;
      clearHand();
    }, WHEEL_IDLE_MS);
  };

  const down = new Map<number, { x0: number; y0: number; x: number; y: number; t0: number; travel: number }>();
  let picked = 'dropper';
  let hand: PlayHand = 'dropper';
  let d0 = 0;

  const isPlay = () => typeof document !== 'undefined' && document.querySelector('[data-testid="play-screen"]') !== null;

  const updateTouch = () => {
    const now = performance.now();
    let span = 1;
    if (down.size >= 2) {
      const [a, b] = down.values();
      if (d0 === 0) d0 = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
      span = Math.hypot(a.x - b.x, a.y - b.y) / d0;
    }
    const playPicked: PlayTool = picked === 'dropper' || picked === 'press' ? picked : 'blow';
    const fingers = [...down.values()].map(f => ({ travel: f.travel, ms: now - f.t0 }));
    const next = isPlay()
      ? playHand(playPicked, hand, fingers, opts.isCloseup(), span)
      : (fingers.length === 0 ? 'dropper' : hand === 'pinch' ? 'pinch' : playPicked);
    if (next === 'pinch') {
      if (hand !== 'pinch') opts.onPinchEnter();
      hand = 'pinch';
      if (down.size >= 2) setHand(pinchHand(span));
    } else {
      if (hand === 'pinch') clearHand();
      hand = next;
    }
  };

  const onTouchStart = (e: TouchEvent) => {
    const now = performance.now();
    if (down.size === 0) {
      picked = opts.getTool();
      hand = picked === 'dropper' || picked === 'blow' || picked === 'press' ? picked : 'blow';
    }
    for (const t of Array.from(e.changedTouches)) {
      down.set(t.identifier, { x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, t0: now, travel: 0 });
    }
    updateTouch();
  };

  const onTouchMove = (e: TouchEvent) => {
    let any = false;
    for (const t of Array.from(e.changedTouches)) {
      const f = down.get(t.identifier);
      if (!f) continue;
      f.x = t.clientX;
      f.y = t.clientY;
      f.travel = Math.max(f.travel, Math.hypot(t.clientX - f.x0, t.clientY - f.y0));
      any = true;
    }
    if (any) updateTouch();
  };

  const onTouchEnd = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) down.delete(t.identifier);
    if (down.size < 2) d0 = 0;
    updateTouch();
  };

  opts.canvas.addEventListener('wheel', onWheel, { passive: false });
  opts.canvas.addEventListener('touchstart', onTouchStart);
  opts.canvas.addEventListener('touchmove', onTouchMove);
  opts.canvas.addEventListener('touchend', onTouchEnd);
  opts.canvas.addEventListener('touchcancel', onTouchEnd);

  return {
    active: () => hand === 'pinch',
    detach: () => {
      window.clearTimeout(wheelTimer);
      clearHand();
      opts.canvas.removeEventListener('wheel', onWheel);
      opts.canvas.removeEventListener('touchstart', onTouchStart);
      opts.canvas.removeEventListener('touchmove', onTouchMove);
      opts.canvas.removeEventListener('touchend', onTouchEnd);
      opts.canvas.removeEventListener('touchcancel', onTouchEnd);
    },
  };
}
