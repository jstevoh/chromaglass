import type { CSSProperties, MutableRefObject, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { PALETTE } from '../constants';
import { DEFAULT_LIQUID_TYPES } from '../types';
import { bottleSwatch, isClearLiquid } from '../lib/liquidColour';
import type { RemoteAction, RemoteState } from '../lib/remoteProtocol';
import { isPadPicture, type PadPictureMessage } from '../lib/padPicture';
import { MARK_URL } from '../brand';

/**
 * Draw (PLAN §8-draw, the Desk v2 design's #3c phone and #3d iPad): the
 * remote's whole screen is the wall's pad.
 *
 * The remote had this already, as the Projectionist pad's Full button: a pad
 * the size of the screen with the tools and dyes as rows of chips under it.
 * The owner's design makes it the screen the remote opens on, with the dyes
 * down one edge and the tools down the other where the thumbs already are,
 * and the four buttons a performer reaches for without looking (Amount,
 * Lucky, Freeze, Blackout) along the bottom. The transport, the sequencer,
 * the mixer and the looks are still one tap away under Controls: the design
 * calls that the "Gig" remote, still valid, and not this screen's job.
 *
 * Nothing on the wire changed. Every touch is the pad message it always was
 * (`drop`, `blow`, `press`, `finger` at 30 Hz along a drag, 60 for a held
 * press), sent by RemoteControl's own pad handlers, which this screen is
 * handed rather than copying: two pads with two sets of throttles and press
 * repeats would drift apart the first time one of them was fixed.
 */

export type PadTool = 'blow' | 'drop' | 'press' | 'finger' | 'spin';

/**
 * The tiles, in the design's order and words. Stir is the pad's `finger`: a
 * finger drawn through the liquid, mixing by its own direction (the name the
 * design gives it, because "finger" on a screen you touch with a finger says
 * nothing). Spin, the dish turned under a finger (PLAN §22), is not one of
 * the design's four and stays in Controls.
 */
const TILES: { tool: PadTool; name: string; hint: string }[] = [
  { tool: 'drop', name: 'Drop', hint: 'tap · drag' },
  { tool: 'blow', name: 'Blow', hint: 'drag' },
  { tool: 'press', name: 'Press', hint: 'hold' },
  { tool: 'finger', name: 'Stir', hint: 'finger' },
];

/** The Amount slider's travel, as a multiple of a finger's own amount (see RemoteControl's padSend). */
export const DRAW_AMOUNT_MIN = 0.1;
export const DRAW_AMOUNT_MAX = 2;

/**
 * Phone or iPad, by the short side, the same test the phone layout uses
 * (`lib/phone.ts`: under 600 is a phone). Not the width: a phone held on its
 * side is 844 wide and still has a phone's 390 of height, which the iPad's
 * three-row grid would leave a 200 px plate in.
 */
function useScreen(): { tablet: boolean; side: boolean } {
  const read = () => ({
    tablet: Math.min(window.innerWidth, window.innerHeight) >= 600,
    side: window.innerWidth > window.innerHeight,
  });
  const [screen, setScreen] = useState(read);
  useEffect(() => {
    const on = () => setScreen(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return screen;
}

/** A wall's shape as people say it: 16:9, 4:3; otherwise to two places. */
export function ratioName(aspect: number): string {
  const known: [number, number][] = [[16, 9], [16, 10], [4, 3], [3, 2], [5, 4], [1, 1], [21, 9], [9, 16], [10, 16], [3, 4]];
  for (const [w, h] of known) if (Math.abs(aspect - w / h) <= 0.01 * (w / h)) return `${w}:${h}`;
  return `${aspect.toFixed(2)}:1`;
}

/** A picture older than this is a laptop that stopped drawing (a hidden window, an older build): the frame dims. */
const STALE_MS = 2000;

/**
 * The wall in Draw's frame: the laptop's picture, painted as it lands.
 *
 * By hand on a canvas, not through React: fifteen pictures a second through
 * state would re-render Draw, and through Draw all of RemoteControl, under
 * every finger. Decoding is latest-wins: while one picture decodes, only the
 * newest that arrived meanwhile waits, so a slow phone shows the wall late
 * by one picture rather than by a queue of them. The frame takes the
 * picture's shape (`onAspect`), which is the wall's, so a circle drawn on the
 * pad is a circle on a 4:3 wall too.
 */
function useWallPicture(sink: DrawScreenProps['pictureSink'], onAspect: (a: number) => void) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const aspectRef = useRef(onAspect);
  aspectRef.current = onAspect;
  useEffect(() => {
    let busy = false;
    let next: PadPictureMessage | null = null;
    let frames = 0;
    let at = 0;
    const decode = (m: PadPictureMessage) => {
      busy = true;
      const img = new Image();
      const done = (ok: boolean) => {
        const canvas = canvasRef.current;
        if (ok && canvas) {
          if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
          }
          canvas.getContext('2d')?.drawImage(img, 0, 0);
          frames++;
          at = performance.now();
          canvas.dataset.frames = String(frames);
          canvas.style.opacity = '1';
          aspectRef.current(m.aspect);
        }
        busy = false;
        if (next) { const n = next; next = null; decode(n); }
      };
      img.onload = () => done(true);
      img.onerror = () => done(false);
      img.src = m.src;
    };
    sink.current = (m) => {
      if (!isPadPicture(m)) return;
      if (busy) { next = m; return; }
      decode(m);
    };
    // A picture that stops coming is said, not passed off as the wall now.
    const stale = setInterval(() => {
      const canvas = canvasRef.current;
      if (canvas && frames > 0 && performance.now() - at > STALE_MS) canvas.style.opacity = '0.35';
    }, 500);
    return () => { sink.current = null; clearInterval(stale); };
  }, [sink]);
  return canvasRef;
}

export interface DrawScreenProps {
  connected: boolean;
  /** The link's own words for why it is not linked yet (finding the laptop, a refused key). */
  waiting: string;
  /** What to do about it, under the words: in the iPhone app, Change laptop. */
  waitingAction?: ReactNode;
  state: RemoteState | null;
  lookName: string;
  tool: PadTool;
  setTool: (t: PadTool) => void;
  color: string | null;
  chooseColor: (hex: string) => void;
  liquid: string;
  chooseLiquid: (id: string) => void;
  layer: number;
  setLayer: (n: number) => void;
  layerCount: number;
  touchCount: number;
  amount: number;
  setAmount: (v: number) => void;
  /** Where the wall is: the pad handlers map a touch into this box. */
  wallRef: RefObject<HTMLDivElement | null>;
  /** Where RemoteControl hands the laptop's pictures (lib/padPicture.ts); Draw sets it while it is up. */
  pictureSink: MutableRefObject<((m: PadPictureMessage) => void) | null>;
  onPadDown: (e: ReactPointerEvent) => void;
  onPadMove: (e: ReactPointerEvent) => void;
  onPadUp: (e: ReactPointerEvent) => void;
  action: (a: RemoteAction) => void;
  onControls: () => void;
}

/** Glass over the plate (DESIGN-SYSTEM "Glass"): full-opacity type on a dark blur. */
const GLASS = 'border border-white/10 bg-[rgba(17,17,19,.78)] backdrop-blur-[16px]';

export function DrawScreen(p: DrawScreenProps) {
  const { tablet, side } = useScreen();
  /*
    A phone on its side has 390 of height. With the portrait bottom bar
    (Amount over the three buttons) the wall's frame was 316×178 on an
    844-wide screen (`npm run draw`); in one row it is a third larger.
  */
  const foot = side ? 76 : 148;
  // The wall's shape: 16:9 (the design's) until the laptop's first picture says otherwise.
  const [aspect, setAspect] = useState(16 / 9);
  const pictureRef = useWallPicture(p.pictureSink, (a) => {
    setAspect(prev => (Math.abs(prev - a) > 0.002 * prev ? a : prev));
  });
  const bottle = DEFAULT_LIQUID_TYPES.find(l => l.id === p.liquid);
  /*
    The ring a touch draws, in the dye it drops. Drawn by hand on the DOM, not
    from React state: a ring follows the finger at the pointer's own rate,
    120 Hz on an iPad, and a state change per move would re-render all of
    RemoteControl, sequencer and mixer included, under every finger.
  */
  const ringsRef = useRef<HTMLDivElement>(null);
  const rings = useRef(new Map<number, HTMLDivElement>());
  const size = tablet ? 56 : 44;
  const ringFill = p.tool === 'drop' ? (p.color ?? bottle?.own ?? bottle?.color ?? '#ffffff') : null;
  const placeRing = (e: ReactPointerEvent, el: HTMLDivElement) => {
    const box = ringsRef.current!.getBoundingClientRect();
    el.style.transform = `translate(${e.clientX - box.left - size / 2}px, ${e.clientY - box.top - size / 2}px)`;
  };
  const down = (e: ReactPointerEvent) => {
    p.onPadDown(e);
    if (!p.connected || !ringsRef.current) return;
    const el = document.createElement('div');
    el.className = 'pointer-events-none absolute left-0 top-0 rounded-full border-2 border-white/90';
    el.style.width = el.style.height = `${size}px`;
    if (ringFill) el.style.background = `${ringFill}99`;
    el.dataset.testid = 'draw-ring';
    ringsRef.current.appendChild(el);
    rings.current.get(e.pointerId)?.remove();
    rings.current.set(e.pointerId, el);
    placeRing(e, el);
  };
  const move = (e: ReactPointerEvent) => {
    p.onPadMove(e);
    const el = rings.current.get(e.pointerId);
    if (el) placeRing(e, el);
  };
  const up = (e: ReactPointerEvent) => {
    p.onPadUp(e);
    rings.current.get(e.pointerId)?.remove();
    rings.current.delete(e.pointerId);
  };

  /*
    Blackout on touch is hold-to-snap, tap-to-fade (the design). The display
    has one blackout, a toggle that fades the dimmer over 1.1 s (App's
    toggleBlackout), and the protocol was to stay as it is, so a hold is the
    lighting desk's flash button: dark while the thumb is down, back when it
    lifts; a tap latches. It is a fade both ways, not a snap: a snap needs a
    message the display does not have yet (PLAN 8-draw-c).
  */
  const blackHeld = useRef<{ at: number; fromLit: boolean } | null>(null);
  const blackDown = (e: ReactPointerEvent) => {
    if (!p.connected) return;
    // A mouse let go off the button still lets go of the blackout.
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    const fromLit = !p.state?.blackout;
    blackHeld.current = { at: performance.now(), fromLit };
    if (fromLit) p.action('blackout-toggle');
  };
  const blackUp = () => {
    const held = blackHeld.current;
    blackHeld.current = null;
    if (!held || !p.connected) return;
    if (!held.fromLit) p.action('blackout-toggle');            // a tap on a dark wall brings it up
    else if (performance.now() - held.at >= 400) p.action('blackout-toggle');  // a hold lets go
  };
  const dark = !!p.state?.blackout;
  const frozen = p.state ? !p.state.isActive : false;

  const pad = (
    <div
      className="absolute inset-0 select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="remote-pad"
    >
      {/*
        The wall's box: the largest frame of the wall's shape (16:9 until the
        laptop's picture says) that fits, from the container's own
        size (cqw/cqh), because a phone's pad is tall and the wall is wide and
        neither the width nor the height alone gives the frame. A touch is
        mapped into this box, not the screen: on a portrait phone the old full
        pad squeezed the wall's width into 390 px and stretched its height over
        800, so a circle drawn came out on the wall as a flat ellipse.
      */}
      <div className={`pointer-events-none absolute flex items-center justify-center ${tablet ? 'inset-3' : 'inset-x-4 inset-y-0'}`} style={{ containerType: 'size' }}>
        <div
          ref={p.wallRef}
          className={`relative overflow-hidden border border-dashed ${tablet ? 'rounded-lg' : ''} ${p.connected ? 'border-white/30' : 'border-white/10'}`}
          style={{ width: `min(100cqw, calc(100cqh * ${aspect}))`, aspectRatio: String(aspect) }}
          data-testid="draw-wall"
          data-aspect={aspect.toFixed(4)}
        >
          {/*
            The wall itself, stretched to the frame: the picture is the canvas
            the laptop drew, so where a finger is on it is the point the
            laptop maps onto the plate (`wall: true`). Gone while unlinked, so
            a last picture never stands in for a laptop that is not there.
          */}
          <canvas
            ref={pictureRef}
            className="absolute inset-0 h-full w-full transition-opacity duration-300"
            style={{ opacity: 0, visibility: p.connected ? 'visible' : 'hidden' }}
            data-testid="draw-picture"
            data-frames="0"
          />
          {/* On the phone the dye rail lies over the frame's left edge, so the label starts past it. */}
          <span className={`absolute top-2 font-mono text-[10px] text-muted [text-shadow:0_1px_2px_#000] ${tablet ? 'left-2.5' : 'left-11'}`}>
            {tablet ? `wall ${ratioName(aspect)} · every touch lands on the wall` : `wall ${ratioName(aspect)}`}
          </span>
          {!p.connected && (
            <span className={`pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-3 text-center ${tablet ? 'px-6' : 'px-16'} text-[13px] text-text-2`}>
              <span data-testid="draw-waiting">{p.waiting}</span>
              {p.waitingAction}
            </span>
          )}
        </div>
      </div>
      <div ref={ringsRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );

  const dyes = (dye: number) => (
    <>
      {PALETTE.map((c) => {
        const on = p.color?.toLowerCase() === c.hex.toLowerCase();
        return (
          <button
            key={c.hex}
            onClick={() => p.chooseColor(c.hex)}
            disabled={!p.connected}
            className="shrink-0 transition-transform active:scale-95 disabled:opacity-40"
            style={{ width: dye, height: dye, borderRadius: 14, backgroundColor: c.hex, boxShadow: on ? '0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-text)' : undefined }}
            title={c.name}
            aria-label={c.name}
            aria-pressed={on}
            data-testid="draw-dye"
          />
        );
      })}
      {/* The bottle with no dye in it: its own colour, or clear (the dashed tile, where the design's "+" sits). */}
      {bottle?.own && (
        <button
          onClick={() => p.chooseColor(bottle.own!)}
          disabled={!p.connected}
          className={`shrink-0 border-2 border-dashed disabled:opacity-40 ${p.color?.toLowerCase() === bottle.own.toLowerCase() ? 'border-text' : 'border-white/30'}`}
          style={{ width: dye, height: dye, borderRadius: 14, backgroundColor: isClearLiquid(bottle) ? 'transparent' : bottle.own }}
          title={`Natural: ${bottle.name.toLowerCase()} with no dye`}
          aria-label={`Natural ${bottle.name}`}
          data-testid="draw-dye-natural"
        />
      )}
    </>
  );

  const tile = (t: typeof TILES[number], h: number, w?: number) => {
    const on = p.tool === t.tool;
    return (
      <button
        key={t.tool}
        onClick={() => p.setTool(t.tool)}
        disabled={!p.connected}
        className={`flex shrink-0 flex-col items-center justify-center rounded-2xl disabled:opacity-40 ${on ? 'bg-primary text-on-primary' : `${GLASS} text-text`}`}
        style={{ height: h, width: w }}
        aria-pressed={on}
        data-testid={`draw-tool-${t.tool}`}
      >
        <span className="text-[14px] font-semibold">{t.name}</span>
        <span className={`mt-0.5 text-[9px] ${on ? 'text-on-primary/70' : 'text-muted'}`}>{t.hint}</span>
      </button>
    );
  };

  const amountRow = (w?: number) => (
    <label className="flex h-11 items-center gap-3" style={{ width: w }} data-testid="draw-amount">
      <span className="w-[64px] shrink-0 text-[14px] font-medium text-text-2">Amount</span>
      <input
        type="range"
        min={DRAW_AMOUNT_MIN}
        max={DRAW_AMOUNT_MAX}
        step={0.05}
        value={p.amount}
        onChange={(e) => p.setAmount(Number(e.target.value))}
        aria-label="Amount"
        className="ride-slider is-touch min-w-0 flex-1"
        style={{ '--fill': `${((p.amount - DRAW_AMOUNT_MIN) / (DRAW_AMOUNT_MAX - DRAW_AMOUNT_MIN)) * 100}%` } as CSSProperties}
      />
      <span className="w-11 shrink-0 rounded-xs bg-black/60 px-1 py-0.5 text-right font-mono text-[12px] text-text">{p.amount.toFixed(1)}×</span>
    </label>
  );

  const button = (label: string, onClick: () => void, id: string, opts: { h: number; on?: boolean; flex?: boolean } = { h: 52 }) => (
    <button
      onClick={onClick}
      disabled={!p.connected}
      className={`rounded-2xl px-5 text-[15px] font-semibold disabled:opacity-40 ${opts.flex ? 'flex-1' : ''} ${opts.on ? 'bg-primary text-on-primary' : `${GLASS} text-text`}`}
      style={{ height: opts.h }}
      aria-pressed={opts.on}
      data-testid={id}
    >
      {label}
    </button>
  );
  const blackout = (h: number, flex: boolean) => (
    <button
      onPointerDown={blackDown}
      onPointerUp={blackUp}
      onPointerCancel={blackUp}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.action('blackout-toggle'); } }}
      disabled={!p.connected}
      className={`flex items-center justify-center gap-2 rounded-2xl border px-5 text-[15px] font-semibold disabled:opacity-40 ${flex ? 'flex-1' : ''} ${
        dark ? 'border-live bg-live text-on-primary' : 'border-live-border bg-[rgba(17,17,19,.78)] text-live'
      }`}
      style={{ height: h, touchAction: 'none' }}
      aria-pressed={dark}
      data-testid="draw-blackout"
    >
      {dark ? 'Dark' : 'Blackout'}
      {tablet && <span className={`text-[11px] font-normal ${dark ? 'text-on-primary/70' : 'text-live/70'}`}>hold</span>}
    </button>
  );
  const controlsButton = (
    <button
      onClick={p.onControls}
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-text-2 ${GLASS}`}
      title="Transport, sequencer, mixer and looks"
      data-testid="draw-controls"
    >
      <SlidersHorizontal size={14} /> {tablet && 'Controls'}
    </button>
  );
  const touches = (
    <span className={`flex h-9 shrink-0 items-center rounded-full px-3 font-mono text-[12px] text-text-2 ${tablet ? '' : GLASS}`} data-testid="draw-touches">
      {p.touchCount} {p.touchCount === 1 ? 'touch' : 'touches'}
    </span>
  );
  const linkDot = <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${p.connected ? 'bg-ok' : 'bg-warn'}`} />;
  const show = p.state?.sequencer?.name ?? null;
  const live = p.connected && <span className={`font-mono text-[12px] ${dark ? 'text-muted' : 'text-live'}`}>{dark ? 'dark' : 'live'}</span>;
  const safe = {
    paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
    paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)',
  };

  if (tablet) {
    /*
      #3d: the grid 104 | 1fr | 88 by 52 | 1fr | 92. Tools and the bottle on
      the left, the plate at the wall's proportions in the middle, the dyes on
      the right, Amount and the buttons along the bottom. The layer is a
      segmented control in the header because an iPad has the width for it.
    */
    return (
      <div
        className="fixed inset-0 z-50 grid bg-bg text-text"
        style={{ ...safe, gridTemplateColumns: '104px 1fr 88px', gridTemplateRows: '52px 1fr 92px', overscrollBehavior: 'none' }}
        data-testid="remote-draw"
        data-linked={p.connected ? 'true' : 'false'}
        data-layout="tablet"
      >
        <header className="col-span-3 flex items-center gap-3 border-b border-border px-6">
          <img src={MARK_URL} alt="" className="h-5 w-5" draggable={false} />
          <span className="text-[14px] font-semibold">Draw</span>
          <span className="text-faint">/</span>
          <span className="flex min-w-0 items-center gap-1.5 truncate text-[13px] text-muted" data-testid="draw-linked">
            {linkDot}{p.connected ? `Linked${show ? ` to ${show}` : ''}` : 'Not linked'}
          </span>
          <span className="mx-auto flex min-w-0 items-center gap-2 truncate">
            {p.connected && <span className={`h-2 w-2 shrink-0 rounded-full ${dark ? 'bg-dim' : 'bg-live'}`} />}
            <span className="truncate text-[14px] font-semibold">{p.connected ? p.lookName : ''}</span>
            {live}
          </span>
          {p.layerCount > 1 && (
            <div className="flex rounded-[10px] border border-border bg-surface p-0.5" role="group" aria-label="Layer" data-testid="draw-layers">
              {Array.from({ length: p.layerCount }, (_, i) => (
                <button
                  key={i}
                  onClick={() => p.setLayer(i)}
                  disabled={!p.connected}
                  className={`h-8 rounded-lg px-3.5 text-[12px] font-medium disabled:opacity-40 ${p.layer === i ? 'bg-active text-text' : 'text-muted'}`}
                  aria-pressed={p.layer === i}
                  data-testid={`draw-layer-${i}`}
                >
                  Layer {i + 1}
                </button>
              ))}
            </div>
          )}
          {touches}
          {controlsButton}
        </header>
        <aside className="flex min-h-0 flex-col gap-2 overflow-y-auto border-r border-border p-3" data-testid="draw-tools">
          {TILES.map(t => tile(t, 72))}
          <div className="mt-3 px-1 text-[11px] font-medium uppercase tracking-wider text-dim">Bottle</div>
          <div className="flex flex-col gap-2" data-testid="draw-bottles">
            {DEFAULT_LIQUID_TYPES.map((liq) => {
              const on = p.liquid === liq.id;
              return (
                <button
                  key={liq.id}
                  onClick={() => p.chooseLiquid(liq.id)}
                  disabled={!p.connected}
                  className={`flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] border px-2 text-left text-[12px] font-medium disabled:opacity-40 ${on ? 'border-accent-border bg-accent-bg text-text' : 'border-border bg-surface text-text-2'}`}
                  title={liq.description}
                  aria-pressed={on}
                  data-testid={`draw-bottle-${liq.id}`}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm border border-white/30" style={bottleSwatch(liq)} />
                  <span className="truncate">{liq.name}</span>
                </button>
              );
            })}
          </div>
        </aside>
        <main className="relative min-h-0">{pad}</main>
        <aside className="flex min-h-0 flex-col items-center gap-2 overflow-y-auto border-l border-border py-3" data-testid="draw-dyes">
          {dyes(56)}
        </aside>
        <footer data-testid="draw-footer" className="col-span-3 flex items-center gap-4 border-t border-border px-6">
          {amountRow(420)}
          <div className="ml-auto flex gap-3">
            {button('Lucky', () => p.action('lucky'), 'draw-lucky', { h: 56 })}
            {button('Clear', () => p.action('clear'), 'draw-clear', { h: 56 })}
            {button(frozen ? 'Frozen' : 'Freeze', () => p.action(frozen ? 'play' : 'pause'), 'draw-freeze', { h: 56, on: frozen })}
            {blackout(56, false)}
          </div>
        </footer>
      </div>
    );
  }

  /*
    #3c: the pad is the whole screen, and the chrome floats on it as glass,
    out of the way of the wall's box in the middle. The layer is one tile
    under the tools that steps through the plates the laptop has, since a
    phone has no width for a segmented row.
  */
  return (
    <div className="fixed inset-0 z-50 bg-black text-text" style={{ ...safe, overscrollBehavior: 'none' }} data-testid="remote-draw"
        data-linked={p.connected ? 'true' : 'false'} data-layout="phone">
      <div className="relative h-full w-full">
        {/* The wall's box sits between the header and the bottom bar. */}
        <div className="absolute inset-x-0 top-[64px]" style={{ bottom: foot }}>{pad}</div>
        <header className="absolute inset-x-4 top-3 flex items-center gap-2">
          <span className={`flex h-9 min-w-0 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold ${GLASS}`} data-testid="draw-linked">
            {linkDot}
            {/* Not the reason: that is said once, in the frame, where there is room for it. */}
            <span className="truncate">{p.connected ? `${show ? `${show} · ` : ''}${p.lookName}` : 'Not linked'}</span>
            {live}
          </span>
          <span className="ml-auto" />
          {touches}
          {controlsButton}
        </header>
        <div className="absolute left-3 top-[64px] flex w-11 flex-col gap-2 overflow-y-auto py-1" style={{ bottom: foot, scrollbarWidth: 'none' }} data-testid="draw-dyes">
          {dyes(44)}
        </div>
        <div className="absolute right-3 top-[64px] flex w-16 flex-col gap-2.5 overflow-y-auto py-1" style={{ bottom: foot, scrollbarWidth: 'none' }} data-testid="draw-tools">
          {TILES.map(t => tile(t, 64, 64))}
          <button
            onClick={() => p.setLayer((p.layer + 1) % p.layerCount)}
            disabled={!p.connected || p.layerCount < 2}
            className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl text-text disabled:opacity-60 ${GLASS}`}
            title={p.layerCount > 1 ? 'Step to the next plate' : 'The laptop has one plate'}
            data-testid="draw-layer"
          >
            <span className="text-[14px] font-semibold">L{p.layer + 1}</span>
            <span className="mt-0.5 text-[9px] text-muted">layer</span>
          </button>
        </div>
        <footer data-testid="draw-footer" className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/85 to-transparent px-4 pb-3 ${side ? 'flex items-center gap-4 pt-3' : 'pt-6'}`}>
          {side ? <div className="min-w-0 flex-1">{amountRow()}</div> : amountRow()}
          <div className={side ? 'flex w-[420px] shrink-0 gap-2.5' : 'mt-2 flex gap-2.5'}>
            {button('Lucky', () => p.action('lucky'), 'draw-lucky', { h: 52, flex: true })}
            {button(frozen ? 'Frozen' : 'Freeze', () => p.action(frozen ? 'play' : 'pause'), 'draw-freeze', { h: 52, on: frozen, flex: true })}
            {blackout(52, true)}
          </div>
        </footer>
      </div>
    </div>
  );
}
