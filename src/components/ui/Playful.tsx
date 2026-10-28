import { useEffect, useId, useRef, useState } from 'react';
import { blackbodyHex, kelvinLabel, warmthKelvin } from '../../lib/lampKelvin';
import { FORM_S, dripFallFor } from '../../lib/dripPace';
import { HUB_CM, reelsAt } from '../../lib/tapeReels';
import { VU_FULL, VU_RED_FROM, needleAtRest, needleDeg, stepNeedle } from '../../lib/vuMeter';
import { strobeOf } from '../../lib/strobeRing';
import { shownRoom } from '../../lib/dyeTarget';
import { NOTCH_MM, MOUNT_MM, SLOT_DEG, TRAY_SLOTS, WINDOW_H, WINDOW_W, stepOf, trayDeg } from '../../lib/slideTray';
import type { TempoReading } from '../../lib/tempo';

/*
  Small machines inside controls (PLAN 35e, 35f): a bottle that tips and holds
  what is left of the Dye Budget, a drop that lets go at the pace of the
  carrier's viscosity, a bulb whose filament glows the colour of the
  temperature the Lamp Warmth grade matches, and the show hardware (tape
  reels, a tap pad, a VU needle, a lens cap, a strobe ring) and the looks (a slide
  mount and the round tray that clicks one slot when the look changes, 35g). Each moves only inside its own few pixels, and
  stands still under reduced motion (index.css). Colour says where, never
  whether: the drop and the bottle's outline take the control's own text colour,
  so violet stays "on" and red stays "live".
*/

// ── Bottle ───────────────────────────────────────────────────────────

/** The bottle in its own frame: a neck, a shoulder, a body from y 7.3 to 21. */
const BOTTLE = 'M6 1.6h4v3.1l2.4 2.6v12.2a1.6 1.6 0 0 1-1.6 1.6H5.2a1.6 1.6 0 0 1-1.6-1.6V7.3L6 4.7z';
const BODY_TOP = 7.3, BODY_BOTTOM = 21;
/** How far it leans when picked, degrees: far enough to read as tipped, short of pouring out. */
const TIP_DEG = -26;
const PIVOT = '8px 18px';

/**
 * A bottle of liquid. `level` is how full it stands, 0 to 1, and `tipped` leans
 * it forward, ready to pour. The surface stays level as the bottle leans (the
 * liquid is drawn in the room's frame and clipped by the bottle's), which is
 * what a real one does and what makes the lean read as a tilt, not a turn.
 * `colour` is the liquid's own, or transparent for clear liquid, which is then
 * drawn as a faint tint so there is something to see rise and fall.
 */
export function Bottle({ colour, level, tipped = false, height = 20, testId }: {
  colour: string; level: number; tipped?: boolean; height?: number; testId?: string;
}) {
  const id = useId();
  const clipId = `cg-bottle-${id.replace(/:/g, '')}`;
  const lv = Math.max(0, Math.min(1, level));
  const surface = BODY_BOTTOM - (BODY_BOTTOM - BODY_TOP) * lv;
  const clear = colour === 'transparent';
  const lean = tipped ? TIP_DEG : 0;
  const frame = (deg: number) => ({ transform: `rotate(${deg}deg)`, transformOrigin: PIVOT }) as const;
  return (
    <svg
      viewBox="0 0 16 22" width={height * 16 / 22} height={height}
      aria-hidden overflow="visible" className="shrink-0"
      data-testid={testId} data-level={lv.toFixed(2)} data-tipped={tipped ? 'true' : 'false'}
    >
      <g className="cg-tip" style={frame(lean)}>
        <clipPath id={clipId}><path d={BOTTLE} /></clipPath>
        <g clipPath={`url(#${clipId})`}>
          <g className="cg-tip" style={frame(-lean)}>
            <rect x="-8" y={surface} width="32" height="30" fill={clear ? 'currentColor' : colour} opacity={clear ? 0.4 : 1} />
            {clear && <path d={`M-8 ${surface}h32`} stroke="currentColor" strokeWidth="0.9" opacity="0.85" />}
          </g>
        </g>
        <path d={BOTTLE} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/**
 * The reading `read` gives, polled while mounted: how much of the Dye Budget is
 * left. Only the picked bottle asks, a few times a second, and it re-renders
 * only when the level moves a twentieth past a wobble (`shownRoom`), so a
 * plate at rest costs nothing and nothing above it re-renders (`npm run renders`).
 */
export function useDyeRoom(read: (() => number) | undefined): number {
  const [room, setRoom] = useState(1);
  useEffect(() => {
    if (!read) return;
    const poll = () => { const r = read(); setRoom(prev => shownRoom(prev, r)); };
    poll();
    const id = setInterval(poll, 400);
    return () => clearInterval(id);
  }, [read]);
  return read ? room : 1;
}

/** The picked bottle: tipped, and filled to what is left of the Dye Budget as `read` gives it. */
export function LiveBottle({ colour, read, height, tipped = true, testId }: { colour: string; read: (() => number) | undefined; height?: number; tipped?: boolean; testId?: string }) {
  const room = useDyeRoom(read);
  return <Bottle colour={colour} level={room} tipped={tipped} height={height} testId={testId} />;
}

// ── Drip ─────────────────────────────────────────────────────────────

/**
 * A drop at the lip of a button that lets go at its carrier's pace: `mode` is
 * the look's Viscosity word, and the fall is timed by `dripFallFor` (Stokes's
 * terminal speed, the same number the solver reads). Thick also pays out a
 * thread behind the drop. It runs once when the button is hovered, focused or
 * becomes the chosen one (index.css), and at rest it is a drop hanging.
 */
export function ViscosityDrip({ mode }: { mode: 'thick' | 'thin' }) {
  const fall = dripFallFor(mode);
  const thick = mode === 'thick';
  return (
    <svg
      viewBox="0 0 20 22" width="14" height="15" aria-hidden className="cg-drip shrink-0"
      style={{ '--form': `${FORM_S}s`, '--fall': `${fall}s` } as React.CSSProperties}
      data-fall-seconds={fall.toFixed(3)}
    >
      <path d="M5 2h10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      {thick && <rect className="cg-thread" x="9.2" y="2" width="1.6" height="10" fill="currentColor" />}
      <g className="cg-fall">
        <circle className="cg-form" cx="10" cy={thick ? 12 : 6.2} r={thick ? 3.4 : 2.6} fill="currentColor" />
      </g>
    </svg>
  );
}

// ── Bulb ─────────────────────────────────────────────────────────────

/**
 * The lamp beside Lamp Warmth: a bulb whose filament and glow are the
 * blackbody colour at the temperature the grade matches (lib/lampKelvin.ts),
 * with that temperature written under it. It does not move; it changes colour
 * with the slider, which is the whole of it.
 */
export function Bulb({ warmth }: { warmth: number }) {
  const hex = blackbodyHex(warmthKelvin(warmth));
  return (
    <span className="flex w-11 shrink-0 flex-col items-center gap-px" data-testid="lamp-bulb" data-kelvin={Math.round(warmthKelvin(warmth))}>
      <svg viewBox="0 0 22 24" width="24" height="26" aria-hidden>
        <circle cx="11" cy="9.5" r="8.8" fill={hex} opacity="0.2" />
        <path d="M7.6 15.6A6.6 6.6 0 1 1 14.4 15.6V18H7.6z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M8 18h6M8.6 20.4h4.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M9 17.4V10.6l1-1.6 1 1.6 1-1.6 1 1.6v6.8" fill="none" stroke={hex} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="whitespace-nowrap font-mono text-[10px] leading-none text-muted">{kelvinLabel(warmth)}</span>
    </span>
  );
}

// ── Show hardware (PLAN 35f) ─────────────────────────────────────────

/**
 * The two reels of a tape deck. The tape runs at one speed, so the full reel
 * turns slowly and the bare one fast, and over a take the left one empties
 * onto the right (lib/tapeReels.ts). Pure in `seconds`: each reel's angle is
 * set once a second and a linear one-second transition carries it round
 * (index.css), so there is no loop here and nothing to drift.
 */
export function TapeReels({ seconds, running = true, height = 14 }: { seconds: number; running?: boolean; height?: number }) {
  const r = reelsAt(running ? seconds : 0);
  const CM = 3.1;                        // drawing px per cm: a full pack is 6.5 px, a hub 2.8
  const reel = (cx: number, packCm: number, deg: number, key: string) => (
    <g key={key}>
      <circle cx={cx} cy={7} r={packCm * CM} fill="currentColor" opacity={0.3} />
      <g className="cg-reel" style={{ transform: `rotate(${deg.toFixed(1)}deg)`, transformOrigin: `${cx}px 7px` }}>
        <circle cx={cx} cy={7} r={HUB_CM * CM} fill="none" stroke="currentColor" strokeWidth={1} />
        {[0, 120, 240].map(a => (
          <line key={a} x1={cx} y1={7} x2={cx + Math.sin(a * Math.PI / 180) * HUB_CM * CM} y2={7 - Math.cos(a * Math.PI / 180) * HUB_CM * CM} stroke="currentColor" strokeWidth={1} strokeLinecap="round" />
        ))}
      </g>
    </g>
  );
  return (
    <svg
      viewBox="0 0 28 14" width={height * 2} height={height} aria-hidden className="shrink-0"
      data-testid="tape-reels" data-supply-omega={r.supplyOmega.toFixed(3)} data-takeup-omega={r.takeupOmega.toFixed(3)}
      data-supply-r={r.supplyR.toFixed(3)} data-takeup-r={r.takeupR.toFixed(3)}
    >
      {reel(7.5, r.supplyR, r.supplyDeg, 's')}
      {reel(20.5, r.takeupR, r.takeupDeg, 't')}
    </svg>
  );
}

/** `m:ss` or `mm:ss` as seconds, for a clock already formatted. */
export const clockSeconds = (clock: string): number => {
  const m = /^(\d+):(\d\d)$/.exec(clock.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

// ── Seven-segment digits ─────────────────────────────────────────────

/** Which of a, b, c, d, e, f, g light for each digit. */
const SEGMENTS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg',
  '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g',
};
/** Segment boxes in a 10 by 18 digit cell: x, y, w, h. */
const SEG_BOX: Record<string, [number, number, number, number]> = {
  a: [1.6, 0.4, 6.8, 1.8], b: [8, 1.8, 1.8, 6.4], c: [8, 9.8, 1.8, 6.4], d: [1.6, 15.8, 6.8, 1.8],
  e: [0.2, 9.8, 1.8, 6.4], f: [0.2, 1.8, 1.8, 6.4], g: [1.6, 8.1, 6.8, 1.8],
};

/**
 * A number in seven-segment digits, the unlit segments left faint so the
 * display keeps its width whatever it reads. `text` is digits and dashes.
 */
export function SegmentDigits({ text, height = 18, testId }: { text: string; height?: number; testId?: string }) {
  const chars = text.split('');
  return (
    <svg viewBox={`0 0 ${chars.length * 12} 18`} height={height} width={height * chars.length * 12 / 18} aria-hidden className="shrink-0" data-testid={testId} data-text={text}>
      {chars.map((c, i) => (
        <g key={i} transform={`translate(${i * 12 + 1} 0)`}>
          {Object.entries(SEG_BOX).map(([k, [x, y, w, h]]) => (
            <rect key={k} x={x} y={y} width={w} height={h} rx={0.7} fill="currentColor" opacity={(SEGMENTS[c] ?? '').includes(k) ? 1 : 0.13} />
          ))}
        </g>
      ))}
    </svg>
  );
}

// ── Tap pad ──────────────────────────────────────────────────────────

/**
 * A light that blinks on the beat the tempo source has locked, driven by the
 * Web Animations API at the beat's period and phase so it runs on the
 * compositor and needs no re-render (`npm run renders`). Resynced every
 * quarter second if it has slipped by more than 30 ms or the period moved
 * (a tap re-phases it; a MIDI clock's pulses nudge it).
 */
function useBeatLight(read: (() => TempoReading | null) | undefined) {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!read) return;
    const node = el.current;
    if (!node || typeof node.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let anim: Animation | null = null;
    let period = 0;
    const sync = () => {
      const r = read();
      if (!r || r.beatAt === null || !(r.period > 0)) {
        anim?.cancel(); anim = null; period = 0; delete node.dataset.beatMs; return;
      }
      const phase = (((performance.now() - r.beatAt) % r.period) + r.period) % r.period;
      let off = Infinity;
      if (anim && period > 0) {
        const cur = ((Number(anim.currentTime) % period) + period) % period;
        off = Math.abs(((cur - phase) % period + period * 1.5) % period - period / 2);
      }
      if (!anim || Math.abs(r.period - period) > 1 || off > 30) {
        anim?.cancel();
        anim = node.animate(
          [{ opacity: 1 }, { opacity: 1, offset: 0.22 }, { opacity: 0.15, offset: 0.23 }, { opacity: 0.15 }],
          { duration: r.period, iterations: Infinity },
        );
        anim.currentTime = phase;
        period = r.period;
        node.dataset.beatMs = String(Math.round(r.period));
      }
    };
    sync();
    const id = setInterval(sync, 250);
    return () => { clearInterval(id); anim?.cancel(); };
  }, [read]);
  return el;
}

/**
 * The four pips of "two taps give a tempo, four give a good one": one fills
 * for each tap, and all four stay full once the tempo is a good one. Hidden
 * (as space) when the tempo is a MIDI clock or a typed number, which no tap
 * made.
 */
export function TapPips({ taps }: { taps: number }) {
  const n = Math.max(0, Math.min(4, taps));
  return (
    <span className="flex items-center gap-1.5" data-testid="tempo-pips" data-filled={n} aria-hidden>
      {[0, 1, 2, 3].map(i => (
        <span key={i} className={`h-2 w-2 rounded-full border ${i < n ? 'border-lit bg-lit' : 'border-muted'}`} />
      ))}
    </span>
  );
}

/** The tap button with its beat light, and the tempo in segment digits beside four pips. */
export function TapPad({ tempo, read, onTap, touch = false }: {
  tempo?: { source: string | null; bpm: number; taps: number };
  read?: () => TempoReading | null;
  onTap: () => void;
  touch?: boolean;
}) {
  const light = useBeatLight(read);
  const bpm = tempo?.source ? tempo.bpm : 0;
  const tapped = tempo?.source === 'tap';
  return (
    <div className="flex flex-1 items-stretch gap-2">
      <button
        onClick={onTap}
        data-testid="tempo-tap"
        title="Tap the beat — two taps give a tempo, four give a good one. Also on any pad, as the Tap Tempo action."
        className={`relative flex flex-1 items-center justify-center rounded-lg border border-white/10 bg-white/5 font-medium transition-all hover:bg-white/10 active:scale-[0.98] ${touch ? 'min-h-[64px] text-[15px]' : 'min-h-9 text-[13px]'}`}
      >
        Tap
        <span ref={light} className="absolute right-2 top-2 h-2 w-2 rounded-full bg-lit opacity-15" data-testid="tempo-beat-light" aria-hidden />
      </button>
      <div className={`flex flex-col items-center justify-center gap-1 rounded-lg border border-white/10 px-3 text-text ${touch ? 'min-w-[104px]' : 'min-w-[84px]'}`} data-testid="tempo-display">
        <SegmentDigits text={bpm > 0 ? String(Math.min(999, bpm)).padStart(3, '-') : '---'} height={touch ? 22 : 16} testId="tempo-digits" />
        <TapPips taps={tapped ? tempo!.taps : bpm > 0 ? 4 : 0} />
      </div>
    </div>
  );
}

// ── VU needle ────────────────────────────────────────────────────────

/**
 * A moving-coil meter on the sound input: a needle with a VU's real
 * ballistics (lib/vuMeter.ts), the only thing in the app that moves with
 * sound. `read` gives the plate's volume (0 to 100) or null with no ear; the
 * needle is moved on a requestAnimationFrame loop through a ref, so nothing
 * re-renders with it. When the input goes deaf, or nothing is listening, the
 * target is zero and the needle falls back to its stop; "deaf" is written on
 * the dial. Under reduced motion it does not move: the dial shows the number.
 */
export function VuMeter({ read, listening, deaf, width = 64 }: { read: () => number | null; listening: boolean; deaf: boolean; width?: number }) {
  const needle = useRef<SVGGElement>(null);
  const [still, setStill] = useState<number | null>(null);
  const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    const node = needle.current;
    if (!node) return;
    const aim = () => (listening && !deaf ? read() ?? 0 : 0);
    if (reduce) {
      const poll = () => { const v = Math.round(aim()); setStill(prev => (prev === v ? prev : v)); };
      poll();
      const id = setInterval(poll, 500);
      return () => clearInterval(id);
    }
    let state = needleAtRest();
    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      state = stepNeedle(state, aim(), (now - last) / 1000);
      last = now;
      node.style.transform = `rotate(${needleDeg(state.x).toFixed(2)}deg)`;
      node.dataset.x = state.x.toFixed(3);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [read, listening, deaf, reduce]);
  const cx = 32, cy = 37, rad = 27;
  const at = (v: number, r: number) => {
    const a = needleDeg(v / VU_FULL) * Math.PI / 180;
    return [cx + Math.sin(a) * r, cy - Math.cos(a) * r] as const;
  };
  const arc = (from: number, to: number) => {
    const [x0, y0] = at(from, rad), [x1, y1] = at(to, rad);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${rad} ${rad} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };
  return (
    <svg
      viewBox="0 0 64 40" width={width} height={width * 40 / 64} className="shrink-0 text-text"
      role="img" aria-label={deaf ? 'Sound level: not hearing' : listening ? 'Sound level' : 'Sound level: nothing is listening'}
      data-testid="vu-meter" data-deaf={deaf ? 'true' : undefined} data-listening={listening ? 'true' : undefined}
    >
      <rect x="0.5" y="0.5" width="63" height="39" rx="3" fill="none" stroke="currentColor" strokeOpacity={0.25} />
      <path d={arc(0, VU_RED_FROM)} fill="none" stroke="currentColor" strokeOpacity={0.7} strokeWidth={1.2} />
      <path d={arc(VU_RED_FROM, VU_FULL)} fill="none" className="text-warn" stroke="currentColor" strokeWidth={3} />
      {[0, 25, 50, 75, 100].map(v => {
        const [x0, y0] = at(v, rad - 3), [x1, y1] = at(v, rad + 1);
        return <line key={v} x1={x0} y1={y0} x2={x1} y2={y1} stroke="currentColor" strokeOpacity={0.7} strokeWidth={0.9} />;
      })}
      <text x={cx} y="14" textAnchor="middle" fontSize="7" fontWeight="700" fill="currentColor" opacity={0.8}>{deaf ? 'deaf' : 'VU'}</text>
      {reduce && listening && !deaf && <text x={cx} y="24" textAnchor="middle" fontSize="7" fill="currentColor" data-testid="vu-still">{still ?? 0}%</text>}
      <g ref={needle} className="cg-needle" style={{ transformOrigin: `${cx}px ${cy}px`, transform: `rotate(${needleDeg(0)}deg)` }} data-testid="vu-needle">
        <line x1={cx} y1={cy} x2={cx} y2={cy - rad + 2} stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
      </g>
      <circle cx={cx} cy={cy} r={2.4} fill="currentColor" />
    </svg>
  );
}

// ── Lens cap ─────────────────────────────────────────────────────────

/**
 * A projector lens, and over it the cap. Blackout is the projectionist's own
 * move: the lens is bare while the room is lit and a solid cap, larger than
 * the lens, snaps over it while it is dark (index.css, once, on mount). The
 * cap is drawn in the button's own colours, so it is red wherever the button
 * is live and neutral while it is off: one picture everywhere, and red still
 * means only live.
 */
export function LensCap({ capped, size = 18 }: { capped: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="shrink-0" data-testid="lens-cap" data-capped={capped ? 'true' : 'false'}>
      {capped ? (
        <g className="cg-cap">
          <circle cx="12" cy="12" r="11" fill="currentColor" />
          <circle cx="12" cy="12" r="8" fill="none" stroke="var(--color-live)" strokeWidth="1.4" strokeDasharray="1.6 1.6" />
          <rect x="9.5" y="0.4" width="5" height="3" rx="1" fill="var(--color-live)" />
        </g>
      ) : (
        <g fill="none" stroke="currentColor" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" strokeWidth="1.6" />
          <circle cx="12" cy="12" r="5.2" strokeWidth="1.3" />
          <path d="M9.6 10a3 3 0 0 1 2.4-1.6" strokeWidth="1.2" opacity="0.8" />
        </g>
      )}
    </svg>
  );
}

// ── Strobe ring ──────────────────────────────────────────────────────

/**
 * A ring of dots round the dish's Auto Spin, like the strobe rim of a
 * turntable (lib/strobeRing.ts). Turning at the Rate the ring drifts at the
 * dish's speed; in Tempo, with a tempo heard, the beat is the lamp and the
 * ring stands still because the dish turns exactly one dot a beat. One dot is
 * larger than the rest so a drift can be seen at all.
 */
export function StrobeRing({ mode, rpm, beats, bpm, size = 40 }: { mode: number; rpm: number; beats: number; bpm: number; size?: number }) {
  const s = strobeOf(mode, rpm, beats, bpm);
  const period = Math.abs(s.driftDegPerS) > 0.01 ? 360 / Math.abs(s.driftDegPerS) : 0;
  const R = 17;
  return (
    <svg
      viewBox="0 0 40 40" width={size} height={size} aria-hidden className={`shrink-0 ${s.off ? 'opacity-35' : ''}`}
      data-testid="strobe-ring" data-dots={s.dots} data-drift={s.driftDegPerS.toFixed(3)} data-strobed={s.strobed ? 'true' : 'false'}
    >
      <g
        className={period ? 'cg-ring' : undefined}
        style={period ? { '--ring-s': `${period.toFixed(2)}s`, animationDirection: s.driftDegPerS < 0 ? 'reverse' : 'normal' } as React.CSSProperties : undefined}
      >
        {Array.from({ length: s.dots }, (_, i) => {
          const a = (i / s.dots) * 2 * Math.PI;
          return <circle key={i} cx={20 + Math.sin(a) * R} cy={20 - Math.cos(a) * R} r={i === 0 ? 1.7 : 1.05} fill="currentColor" />;
        })}
      </g>
      <circle cx="20" cy="20" r="9" fill="none" stroke="currentColor" strokeOpacity={0.5} strokeWidth="1.2" />
      <circle cx="20" cy="20" r="1.4" fill="currentColor" />
    </svg>
  );
}

// ── Slide mount and tray ─────────────────────────────────────────────

/** Cardboard, the colour of an unprinted Kodak mount; one colour on every look, so it says only "a slide". */
const MOUNT_COLOUR = '#cfc9ba';

/**
 * A look as a 35 mm slide (lib/slideTray.ts has the proportions): a square
 * cardboard mount with one clipped corner and a landscape window with the
 * look's own palette on the film. The mount never changes colour for state;
 * the row or tile around it carries lit and live as it did before.
 */
export function SlideMount({ swatch, size = 24, className = '' }: { swatch: string; size?: number; className?: string }) {
  const n = NOTCH_MM / MOUNT_MM * 100;
  return (
    <span
      aria-hidden
      className={`relative inline-block shrink-0 ${className}`}
      style={{ width: size, height: size, background: MOUNT_COLOUR, clipPath: `polygon(0 ${n}%, ${n}% 0, 100% 0, 100% 100%, 0 100%)` }}
    >
      <i
        className="absolute"
        style={{
          left: `${(1 - WINDOW_W) / 2 * 100}%`, top: `${(1 - WINDOW_H) / 2 * 100}%`,
          width: `${WINDOW_W * 100}%`, height: `${WINDOW_H * 100}%`,
          background: swatch, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.5)',
        }}
      />
    </span>
  );
}

/**
 * The round tray from above: slots round a drum, the one at the gate marked
 * and fixed at the top. `at` is the look's place in its list; when it moves,
 * the drum clicks one slot the way it moved (stepOf), with a small overshoot
 * and settle (index.css), and nothing else on the screen moves. It holds
 * only how many pushes it has had, so there is no timer and no loop.
 */
export function SlideTray({ at, size = 28 }: { at: number | null; size?: number }) {
  const prev = useRef(at);
  const [clicks, setClicks] = useState(0);
  useEffect(() => {
    const d = stepOf(prev.current, at);
    prev.current = at;
    if (d) setClicks(c => c + d);
  }, [at]);
  const deg = trayDeg(clicks);
  const slot = (i: number) => {
    const a = i * SLOT_DEG;
    return <rect key={i} x={12.7} y={2.4} width={2.6} height={4.6} rx={0.6} transform={`rotate(${a} 14 14)`} fill="currentColor" opacity={0.38} />;
  };
  return (
    <svg viewBox="0 0 28 28" width={size} height={size} aria-hidden className="shrink-0" data-testid="slide-tray" data-clicks={clicks} data-deg={deg}>
      <circle cx={14} cy={14} r={13} fill="none" stroke="currentColor" strokeWidth={1.1} opacity={0.7} />
      <g className="cg-tray" style={{ transform: `rotate(${deg}deg)`, transformOrigin: '14px 14px' }}>
        <circle cx={14} cy={14} r={3.2} fill="none" stroke="currentColor" strokeWidth={1} opacity={0.7} />
        {Array.from({ length: TRAY_SLOTS }, (_, i) => slot(i))}
      </g>
      {/* The gate: fixed at the top, the slot that is in the light. */}
      <rect x={12.4} y={1.6} width={3.2} height={6} rx={0.7} fill="none" stroke="currentColor" strokeWidth={1.2} />
    </svg>
  );
}
