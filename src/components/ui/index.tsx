import { useEffect, useRef, useState, type ReactNode, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useMidiTouch } from '../../hooks/useMidiTouch';
import { curveOf, settingKeyOf, handValueAt, travelOf } from '../../lib/midi';
import type { VisualizerSettings } from '../../types';

/**
 * The desk's vocabulary.
 *
 * Every screen is composed from these, so a size or a colour is decided once
 * here rather than re-typed into each panel. The values come from
 * `tokens.css`; this file is only how they are put together.
 *
 * Three rules from the design system that the code has to keep, because they
 * are the difference between a web app and something played in a dark room:
 *
 *   1. Only three chromatic colours, and each means one thing — violet is
 *      cued/next/selected, red is live-now/destructive, green is connected.
 *      Everything else is grey. A violet used for decoration makes the one
 *      that means "this is next" stop reading.
 *   2. Hairlines, not fills. Panels separate with a 1px border at 8% white;
 *      background steps are reserved for interactive state.
 *   3. Nothing clickable under 32px on a desk or 48px under a thumb.
 */

// ── Keyboard chip ────────────────────────────────────────────────────

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-xs bg-active px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted">
      {children}
    </kbd>
  );
}

// ── Button ───────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:   'bg-primary text-on-primary hover:opacity-90',
  secondary: 'border border-border-strong text-text-2 hover:bg-hover',
  danger:    'border border-live-border text-live hover:bg-live-bg',
  ghost:     'text-muted hover:bg-hover hover:text-text',
};

export function Button({
  children, onClick, variant = 'secondary', kbd, height = 40, full, title, disabled, testId, icon, midiKey,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  /** The shortcut, shown as a chip. Every key action shows its key. */
  kbd?: string;
  height?: number;
  full?: boolean;
  title?: string;
  disabled?: boolean;
  testId?: string;
  icon?: ReactNode;
  /** What a controller hits to press this, so the button lights when it does. */
  midiKey?: string | null;
}) {
  const hit = useMidiTouch(midiKey ?? null);
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      data-testid={testId}
      data-midi-hit={hit ? 'true' : undefined}
      style={{ height }}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 transition-colors duration-[120ms] disabled:opacity-40 ${
        full ? 'w-full' : ''
      } ${BUTTON_VARIANT[variant]} ${hit ? MIDI_HIT : ''}`}
    >
      {icon}
      <span className={`${variant === 'primary' ? 'text-[14px]' : 'text-[13px]'} font-medium`}>{children}</span>
      {kbd && <Kbd>{kbd}</Kbd>}
    </button>
  );
}

// ── Segmented control ────────────────────────────────────────────────

export function Segmented<T extends string>({
  value, options, onChange, height = 36, testId, compact = false, divideBefore, tight = false,
}: {
  value: T;
  options: readonly (readonly [T, string] | readonly [T, string, string])[];
  onChange: (v: T) => void;
  height?: number;
  testId?: string;
  /**
   * Tighter, for a row that has to share its line: below 1536 the padding
   * narrows and the key letters step back into the tooltip, and below 1280
   * the labels drop to 12px. Perform's nine tools next to the dye tray pushed
   * Freeze and Drain off a 1024 screen without it; and once the middle column
   * stopped growing to fit, the full-size row ran 70px past it at 1280 and
   * the rides column was painted over the Amount chip.
   *
   * And a compact row wraps inside its own box rather than run past the
   * column it is in. Spin (PLAN.md §22) made the desks' tools ten, and at
   * 1024 the row measured 454 px in a middle column of 408: the rides column
   * was painted over Magnet and Spin. Two lines of tools cost the preview
   * one button's height at that width and nothing at 1280 and up, where the
   * ten fit on one (481 px in 664).
   */
  compact?: boolean;
  /**
   * A hairline before this option: the desk's layouts (Build, Gig, Load-in)
   * are one kind of thing and Sequence another, and the design keeps them in
   * one switch with a rule between.
   */
  divideBefore?: T;
  /** Narrower items, for a header that has to fit at 1024. */
  tight?: boolean;
}) {
  return (
    <div className={`inline-flex items-center rounded-md border border-border bg-elevated p-0.5 ${compact ? 'max-w-full flex-wrap' : ''}`} role="tablist" data-testid={testId}>
      {options.map(([id, label, kbd]) => (
        <span key={id} className="contents">
        {divideBefore === id && <span className="mx-1 h-5 w-px shrink-0 bg-white/10" aria-hidden />}
        <button
          key={id}
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          style={{ height: height - 4 }}
          data-testid={testId ? `${testId}-${id}` : undefined}
          title={compact && kbd ? `${label} (${kbd})` : undefined}
          className={`inline-flex items-center gap-1.5 rounded-sm ${compact ? 'px-1.5 text-[12px] xl:text-[13px] 2xl:px-4' : tight ? 'px-2.5 text-[13px] xl:px-3.5' : 'px-4 text-[13px]'} font-medium transition-colors duration-[120ms] ${
            value === id ? 'bg-active text-text' : 'text-muted hover:text-text-2'
          }`}
        >
          {label}
          {kbd && <span className={`font-mono text-[11px] text-faint ${compact ? 'hidden 2xl:inline' : ''}`}>{kbd}</span>}
        </button>
        </span>
      ))}
    </div>
  );
}

// ── Tag ──────────────────────────────────────────────────────────────

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'live' | 'next' | 'neutral' }) {
  const cls = tone === 'live' ? 'bg-live-bg text-live'
    : tone === 'next' ? 'bg-accent-bg text-accent-text'
    : 'bg-active text-muted';
  return <span className={`rounded-xs px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

// ── Touched by the controller ────────────────────────────────────────

/*
  What a control looks like the moment a pad fires it.

  White, not a colour. The design system gives each of its three chromatic
  colours exactly one meaning — violet is cued, red is live, green is connected
  — and a fourth meaning painted in one of them would make that one stop
  reading. White is the system's "this is the thing", and a ring is the one
  decoration that does not move anything: a row that grew or shifted on every
  pad press would make a cue list jump around under a hand reaching for it.

  Sized to be seen across a room rather than admired up close. It is on for
  about a quarter of a second, which is long enough to catch out of the corner
  of an eye and short enough that four pads in a bar do not smear into one.
*/
export const MIDI_HIT = 'ring-2 ring-text ring-offset-1 ring-offset-bg';

/**
 * A dye, as a square you can press — and that lights when a pad presses it.
 *
 * One component for the desk's tray and the bench's grid, which draw the same
 * thing at different sizes, because the flash has to be identical in both: an
 * operator learning which pad is which should not have to learn it twice.
 */
export interface SwatchProps extends Keyed {
  hex: string;
  selected: boolean;
  onClick: () => void;
  midiKey?: string | null;
  className?: string;
  /** The colour of the ring's inner gap, so the selection reads on either background. */
  gap?: string;
  title?: string;
  testId?: string;
}

export function Swatch({ hex, selected, onClick, midiKey, className = '', gap = 'var(--color-bg)', title, testId }: SwatchProps) {
  const hit = useMidiTouch(midiKey ?? null);
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title ?? hex}
      data-testid={testId}
      data-midi-hit={hit ? 'true' : undefined}
      className={`rounded-md transition-transform active:scale-95 ${className} ${hit ? MIDI_HIT : ''}`}
      style={{
        background: hex,
        boxShadow: selected ? `0 0 0 2px ${gap}, 0 0 0 3px #FAFAFA` : undefined,
      }}
    />
  );
}

// ── Status dot ───────────────────────────────────────────────────────

export function StatusDot({ on, label, short, tone = 'ok', testId, onClick, title, tight = false }: {
  on: boolean; label: string;
  /** What it says where there is little room (under the dot); the label when absent. */
  short?: string;
  tone?: 'ok' | 'live'; testId?: string;
  /** Little room: the header has measured that the words beside the dots do not fit (DeskHeader). */
  tight?: boolean;
  /**
   * What clicking it opens. A dot that reports a thing you cannot reach is
   * half a control: the MIDI dot said "no controller" all evening with no way
   * from there to the screen that would connect one.
   */
  onClick?: () => void;
  title?: string;
}) {
  /*
    Every dot says what it is, at every width.

    The words used to go when the header ran out of room (and always below
    1100px), leaving a row of unlabelled dots with the name only in a
    tooltip: reported, with a screenshot, "these dots need to be labeled. I
    don't know what goes to what." Where there is little room now the word
    moves under its dot, small, rather than away: a stacked label costs its
    own width and not the dot's and the gap's beside it, and the short form
    ("MIDI" for a controller's full name) is what it says there.
  */
  const colour = on ? (tone === 'live' ? 'text-live' : 'text-text-2') : 'text-dim';
  const small = short ?? label;
  const body = (
    <>
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: on ? (tone === 'live' ? 'var(--color-live)' : 'var(--color-ok)') : 'var(--color-knob-off)' }}
      />
      {tight ? (
        <span className={`text-[10px] leading-none ${colour}`}>{small}</span>
      ) : (
        <>
          <span className={`text-[10px] leading-none min-[1100px]:hidden ${colour}`}>{small}</span>
          <span className={`hidden text-[12px] min-[1100px]:inline ${colour}`}>{label}</span>
        </>
      )}
    </>
  );
  const shape = tight
    ? 'inline-flex flex-col items-center gap-1'
    : 'inline-flex flex-col items-center gap-1 min-[1100px]:flex-row min-[1100px]:gap-1.5';
  const tip = title ?? `${label}: ${on ? 'yes' : 'no'}`;
  if (!onClick) {
    return (
      <span className={shape} data-testid={testId} title={tip}>{body}</span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      title={tip}
      className={`${shape} rounded-md py-1 transition-colors hover:bg-hover ${tight ? 'px-0.5 -mx-0.5' : 'px-1.5 -mx-1.5'}`}
    >
      {body}
    </button>
  );
}

// ── Ride slider ──────────────────────────────────────────────────────

export interface SliderProps extends Keyed {
  label: string;
  value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void;
  /** What the value chip reads — a percentage, a multiplier, whatever suits. */
  display: string;
  /** The MIDI CC it is learned to, if any. */
  cc?: number | null;
  /** The Dimmer fills white; every other ride fills violet. */
  white?: boolean;
  touch?: boolean;
  testId?: string;
  /** The setting a controller moves to reach this, so its CC lights when one does. */
  midiKey?: string | null;
}

export function Slider({ label, value, min, max, step, onChange, display, cc, white, touch, testId, midiKey }: SliderProps) {
  /*
    The travel is not always the value.

    Speed's range is 0–0.3 and thirty of the thirty-two looks are at or below
    0.08, so on a linear throw the whole of the plate's usable tempo was the
    bottom quarter and the median look sat at 10% of the way along. `curveOf`
    (`lib/midi.ts`) gives the control an exponent — the stored value is
    untouched, so a look means what it always meant — and the desk, the phone
    and a MIDI fader all bend the same way. `midiKey` is the setting's name
    here, which is what the curve is looked up by.
  */
  /*
    The desk names a ride `setting:globalSpeed`, not `globalSpeed`.

    `midiKey` is what a controller reaches this by, and its settings are
    prefixed to keep them apart from `preset:`, `action:` and `dye:`. Looked
    up unprefixed it matched nothing, so `curveOf` returned 1 and the Speed
    ride on the Perform desk was the one control that did *not* get the
    curved travel — handle hard against the left stop at a value the curve
    would put a third of the way along. The panel and the phone were right
    and the desk was wrong, which is the hardest kind of wrong to notice.
  */
  const settingKey = settingKeyOf(midiKey);
  const curve = settingKey ? curveOf(settingKey) : 1;
  const at = curve === 1 ? (value - min) / (max - min) : travelOf(value, min, max, curve);
  const pct = at * 100;
  /*
    A fader already moves this bar — both go through the same number. What it
    does not show is *which* of ten rides the hand is on, which is the question
    when a strip is full and a knob is unlabelled. So the CC chip lights while
    the control is being moved, and the bar is left alone: a strip where every
    ride jumped on every message would be unreadable.
  */
  const hit = useMidiTouch(midiKey ?? null);
  return (
    <div className="mb-5" data-testid={testId} data-midi-hit={hit ? 'true' : undefined}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-text">{label}</span>
        <span className="flex items-center gap-2">
          {cc != null && (
            <span className={`rounded-xs px-1 font-mono text-[11px] transition-colors duration-[120ms] ${
              hit ? 'bg-text text-bg' : 'text-faint'
            }`}>CC {cc}</span>
          )}
          <span className="rounded-xs bg-elevated px-1.5 py-0.5 font-mono text-[12px] font-medium text-text-2">{display}</span>
        </span>
      </div>
      <input
        type="range"
        min={curve === 1 ? min : 0} max={curve === 1 ? max : 1}
        step={curve === 1 ? (step ?? (max - min) / 200) : 0.001}
        value={curve === 1 ? value : at}
        onChange={e => {
          const raw = Number(e.target.value);
          if (curve === 1) { onChange(raw); return; }
          onChange(handValueAt(raw, min, max, curve));
        }}
        aria-label={label}
        className={`ride-slider w-full ${touch ? 'is-touch' : ''} ${white ? 'is-white' : ''}`}
        style={{ '--fill': `${pct}%` } as CSSProperties}
      />
    </div>
  );
}

// ── Toggle ───────────────────────────────────────────────────────────

export function Toggle({ label, on, onChange, testId }: {
  label: string; on: boolean; onChange: (v: boolean) => void; testId?: string;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      data-testid={testId}
      className="flex min-h-[36px] w-full items-center justify-between rounded-md px-1 text-left transition-colors hover:bg-hover"
    >
      <span className="text-[13px] text-text-2">{label}</span>
      <span
        className="relative inline-block h-5 w-9 shrink-0 rounded-[10px] transition-colors duration-[120ms]"
        style={{ background: on ? 'var(--color-accent)' : 'var(--color-track)' }}
      >
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full transition-all duration-[120ms]"
          style={{ left: on ? 18 : 2, background: on ? '#fff' : 'var(--color-muted)' }}
        />
      </span>
    </button>
  );
}

// ── Knob ─────────────────────────────────────────────────────────────

/*
  A control drawn as the hardware it is ridden on (Desk v2, the owner's
  design, 2026-10-10).

  The desk drew every control as a slider, and a deck of panels under the
  plate is four sliders wide at most: a section like Fluid Physics, thirty-odd
  controls, was a column you scrolled. A knob is a quarter of the width, so
  four sit in a row and a section reads at a glance. Which one a control gets
  is the controller's call, not the desk's: one learned to a fader is a
  slider, because that is what the hand on it is moving, and an encoder or
  nothing at all is a knob (`DeskControl` in the desk's panels).

  It is a real range input under the drawing, not a picture of one. That is
  what the keyboard, a screen reader and the checks drive (`npm run saves`
  fills the recipe's inputs), and it means the knob takes the value the same
  way the slider does: the same curved travel (`curveOf`), so Speed sits at
  the same place on a knob, a slider, the phone and a fader. A mouse does not
  drag the input sideways, though, which is how a range input moves: the
  pointer is taken over and the knob turns with the hand going up and down,
  half a percent of its travel a pixel, a tenth of that with ⌥ held.
*/
export interface KnobProps extends Keyed {
  label: string;
  value: number;
  min: number;
  max: number;
  /** A control that takes whole steps (folds, octaves): ticks on the ring, and it lands on one. */
  step?: number;
  onChange: (v: number) => void;
  /** The value as it reads ("42%", "1.30×"). */
  display: string;
  /** What it is learned to ("K1"), shown faint after the value. */
  mapping?: string | null;
  /** Double-click goes back to this: the look's own value. */
  resetTo?: number;
  disabled?: boolean;
  midiKey?: string | null;
  testId?: string;
  /** 40 on the desk; 56 in Load-in and the Stage sheet. */
  size?: number;
}

/** The ring's geometry, from the design (`tokens.css`): 270° of a radius-16 circle. */
const RING = 2 * Math.PI * 16;          // 100.53
const SWEEP = RING * 0.75;              // 75.4

export function Knob({ label, value, min, max, step, onChange, display, mapping, resetTo, disabled, midiKey, testId, size = 40 }: KnobProps) {
  const settingKey = settingKeyOf(midiKey);
  const curve = settingKey ? curveOf(settingKey) : 1;
  const travel = (v: number) => Math.max(0, Math.min(1, curve === 1 ? (v - min) / (max - min || 1) : travelOf(v, min, max, curve)));
  const valueAt = (t: number) => {
    const c = Math.max(0, Math.min(1, t));
    const v = curve === 1 ? min + c * (max - min) : handValueAt(c, min, max, curve);
    return step ? Math.max(min, Math.min(max, min + Math.round((v - min) / step) * step)) : v;
  };
  const at = travel(value);
  const [drag, setDrag] = useState<{ fine: boolean } | null>(null);
  const grab = useRef<{ y: number; t: number; id: number } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hit = useMidiTouch(midiKey ?? null);

  // A wheel turns it a notch. Not passive, so the deck does not scroll as well.
  useEffect(() => {
    const el = inputRef.current;
    if (!el || disabled) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const notch = step ? step / (max - min || 1) : 0.01;
      onChange(valueAt(travel(value) + (e.deltaY < 0 ? notch : -notch) * (e.altKey ? 0.25 : 1)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const steps = step ? Math.round((max - min) / step) : 0;
  return (
    <div
      className={`relative flex w-[58px] flex-col items-center ${disabled ? 'opacity-40' : ''}`}
      // The label is cut to the knob's width; the whole name is a hover away.
      title={label}
      data-testid={testId}
      data-midi-hit={hit ? 'true' : undefined}
      data-knob
    >
      {drag && (
        <span className="pointer-events-none absolute -top-6 z-10 whitespace-nowrap rounded-xs bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-text shadow-[0_1px_3px_rgba(0,0,0,.6)]">
          {display}{drag.fine ? ' · fine' : ' · ⌥ fine'}
        </span>
      )}
      <span className={`group relative block ${hit ? `rounded-full ${MIDI_HIT}` : ''}`} style={{ width: size, height: size }}>
        <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden className="block">
          <circle cx="20" cy="20" r="16" fill="none" strokeWidth="3" strokeLinecap="round"
            className="transition-colors group-hover:[stroke:var(--color-ring-hover)]"
            style={{ stroke: 'var(--color-ring)' }}
            strokeDasharray={`${SWEEP} ${RING}`} transform="rotate(135 20 20)" />
          {steps > 1 && steps <= 24 && (
            <circle cx="20" cy="20" r="16" fill="none" strokeWidth="3.2" style={{ stroke: 'var(--color-bg)' }}
              strokeDasharray={`1.2 ${SWEEP / steps - 1.2}`} strokeDashoffset={-SWEEP / steps + 0.6} transform="rotate(135 20 20)" />
          )}
          <circle cx="20" cy="20" r="16" fill="none" strokeWidth="3" strokeLinecap="round"
            style={{ stroke: drag ? 'var(--color-accent-text)' : 'var(--color-accent)' }}
            strokeDasharray={`${Math.max(0.01, SWEEP * at)} ${RING}`} transform="rotate(135 20 20)" />
          <circle cx="20" cy="20" r="11" className="transition-colors group-hover:[fill:var(--color-knob-off)]" style={{ fill: 'var(--color-active)' }} />
          <line x1="20" y1="15" x2="20" y2="10" stroke="#fff" strokeWidth="2" strokeLinecap="round"
            transform={`rotate(${-135 + 270 * at} 20 20)`} />
        </svg>
        <input
          ref={inputRef}
          type="range"
          aria-label={label}
          disabled={disabled}
          min={curve === 1 ? min : 0}
          max={curve === 1 ? max : 1}
          step={curve === 1 ? (step ?? (max - min) / 200) : 0.001}
          value={curve === 1 ? value : at}
          onChange={e => {
            const raw = Number(e.target.value);
            onChange(curve === 1 ? raw : handValueAt(raw, min, max, curve));
          }}
          onPointerDown={e => {
            if (disabled || e.button !== 0) return;
            // Taken over: the input would move with the pointer sideways.
            e.preventDefault();
            e.currentTarget.focus();
            e.currentTarget.setPointerCapture(e.pointerId);
            grab.current = { y: e.clientY, t: at, id: e.pointerId };
            setDrag({ fine: e.altKey });
          }}
          onPointerMove={e => {
            const g = grab.current;
            if (!g || g.id !== e.pointerId) return;
            const fine = e.altKey;
            const dy = g.y - e.clientY;
            // Re-anchored when ⌥ changes, so going fine does not jump the knob.
            if (fine !== drag?.fine) { grab.current = { y: e.clientY, t: travel(value), id: e.pointerId }; setDrag({ fine }); return; }
            onChange(valueAt(g.t + dy * 0.005 * (fine ? 0.1 : 1)));
          }}
          onPointerUp={e => { if (grab.current?.id === e.pointerId) { grab.current = null; setDrag(null); } }}
          onPointerCancel={() => { grab.current = null; setDrag(null); }}
          onDoubleClick={() => { if (resetTo !== undefined && !disabled) onChange(resetTo); }}
          className="absolute inset-0 h-full w-full cursor-ns-resize appearance-none rounded-full opacity-0"
        />
      </span>
      {drag ? (
        <span className="mt-1 max-w-full truncate text-[13px] font-medium text-text">{display}</span>
      ) : (
        <span className="mt-1 max-w-full truncate text-[11px] font-medium text-text-2" title={label}>{label}</span>
      )}
      <span className="max-w-full truncate font-mono text-[10px] leading-tight">
        <span className="text-dim">{disabled ? 'off' : display}</span>
        {mapping && <span className="text-faint"> {mapping}</span>}
      </span>
    </div>
  );
}

// ── Panel ────────────────────────────────────────────────────────────

/*
  The chrome every desk panel shares (Desk v2): a 32 px header with a grip,
  the title, the hardware it rides, and three buttons (float or dock, fold,
  close), over the section's own body.

  The buttons are 24 px, the smallest anything clickable on a desk is allowed
  to be (`npm run layout` measures it): the design's 12 px glyphs sit in a
  24 px target.
*/
export function PanelFrame({
  id, title, meta, floating = false, collapsed = false, children, onFloat, onDock, onCollapse, onClose,
  onGripDown, onHeaderDown, onResizeDown, onTitleMenu, style, className = '', bodyClassName = '',
}: {
  id: string;
  title: string;
  meta?: ReactNode;
  floating?: boolean;
  collapsed?: boolean;
  children?: ReactNode;
  onFloat?: () => void;
  onDock?: () => void;
  onCollapse?: () => void;
  onClose?: () => void;
  /** Start dragging the panel by its grip (docked: to reorder, re-dock or float it). */
  onGripDown?: (e: ReactPointerEvent) => void;
  /** Start moving a floating panel by its header. */
  onHeaderDown?: (e: ReactPointerEvent) => void;
  onResizeDown?: (e: ReactPointerEvent) => void;
  onTitleMenu?: (e: ReactMouseEvent) => void;
  style?: CSSProperties;
  className?: string;
  bodyClassName?: string;
}) {
  const icon = 'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-faint transition-colors hover:bg-hover hover:text-muted';
  return (
    <section
      className={`relative flex min-h-0 flex-col overflow-hidden rounded-lg border bg-surface ${floating ? 'border-[var(--color-float-border)] shadow-[0_20px_60px_rgba(0,0,0,.65)]' : 'border-border'} ${className}`}
      style={style}
      data-testid={`panel-${id}`}
      data-panel={id}
      data-floating={floating ? 'true' : undefined}
      data-collapsed={collapsed ? 'true' : undefined}
    >
      <header
        className={`flex h-8 shrink-0 items-center gap-1.5 pl-1.5 pr-1 ${floating ? 'cursor-move border-b border-border bg-elevated' : ''}`}
        onPointerDown={floating ? onHeaderDown : undefined}
        onContextMenu={onTitleMenu}
        data-panel-head
      >
        <span
          role="button"
          aria-label={`Move ${title}`}
          title="Drag to move"
          onPointerDown={e => { e.stopPropagation(); onGripDown?.(e); }}
          className="inline-flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center text-faint"
        >
          <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor" aria-hidden>
            {[0, 1, 2].map(r => [0, 1].map(c => <circle key={`${r}${c}`} cx={1.5 + c * 5} cy={1.5 + r * 4.5} r="1.2" />))}
          </svg>
        </span>
        <span className={`min-w-0 flex-1 truncate text-[13px] font-medium ${collapsed ? 'text-muted' : 'text-text'}`}>{title}</span>
        {floating && <span className="shrink-0 rounded-xs bg-accent-bg px-1.5 py-0.5 text-[11px] font-medium text-accent-text">floating</span>}
        {meta && <span className="min-w-0 shrink truncate font-mono text-[11px] text-faint">{meta}</span>}
        {floating ? (
          <button className={icon} onClick={onDock} title="Dock it back" aria-label={`Dock ${title}`} data-testid={`panel-${id}-dock`}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden><path d="M7 1.5h3.5V11h-9V5" /><path d="M1.5 1.5L6 6M6 2.8V6H2.8" /></svg>
          </button>
        ) : (
          <button className={icon} onClick={onFloat} title="Float it over the plate" aria-label={`Float ${title}`} data-testid={`panel-${id}-float`}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden><path d="M5 1.5H1.5V11h9V7" /><path d="M10.5 1.5L6 6M7 1.5h3.5V5" /></svg>
          </button>
        )}
        <button className={icon} onClick={onCollapse} title={collapsed ? 'Open it' : 'Fold it to its header'} aria-label={collapsed ? `Open ${title}` : `Fold ${title}`} aria-expanded={!collapsed} data-testid={`panel-${id}-collapse`}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={collapsed ? 'M3 4.5l3 3 3-3' : 'M3 7.5l3-3 3 3'} />
          </svg>
        </button>
        <button className={icon} onClick={onClose} title="Close it (the + Panel browser opens it again)" aria-label={`Close ${title}`} data-testid={`panel-${id}-close`}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden><path d="M3 3l6 6M9 3l-6 6" /></svg>
        </button>
      </header>
      {!collapsed && <div className={`flex min-h-0 flex-1 flex-col px-3 pb-2.5 ${bodyClassName}`}>{children}</div>}
      {floating && !collapsed && onResizeDown && (
        <span
          onPointerDown={onResizeDown}
          className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize touch-none"
          aria-hidden
          style={{ background: 'linear-gradient(135deg, transparent 50%, var(--color-border-strong) 50%)' }}
        />
      )}
    </section>
  );
}

// ── Cue row ──────────────────────────────────────────────────────────

/**
 * This project has no `@types/react`, so JSX does not add React's own
 * `key` to a component's props the way it would otherwise — every `key` in
 * the codebase before now sat on a DOM element, where the DOM typings supply
 * it. Declaring it here is what lets these be rendered from a list. React
 * consumes `key` itself and never passes it down, so no component ever reads
 * the value; it is here for the type checker alone.
 */
export interface Keyed { key?: string | number }

export interface CueRowProps extends Keyed {
  index: number;
  name: string;
  /** A two-colour smear standing in for the look, from its palette contract. */
  swatch: string;
  state: 'live' | 'next' | 'idle';
  trailing?: ReactNode;
  onClick?: () => void;
  /** Double-click sends it now, the way a cue list has always worked. */
  onDoubleClick?: () => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
  testId?: string;
  /** The preset a controller fires to reach this row, so it lights when one does. */
  midiKey?: string | null;
}

export function CueRow({ index, name, swatch, state, trailing, onClick, onDoubleClick, onContextMenu, testId, midiKey }: CueRowProps) {
  const hit = useMidiTouch(midiKey ?? null);
  const shell = state === 'live' ? 'bg-live-bg border-live-border'
    : state === 'next' ? 'bg-elevated border-accent-border'
    : 'border-transparent hover:bg-hover';
  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      data-testid={testId}
      data-state={state}
      data-midi-hit={hit ? 'true' : undefined}
      className={`group flex h-12 w-full items-center gap-3 rounded-md border px-2.5 text-left transition-colors duration-[120ms] ${shell} ${hit ? MIDI_HIT : ''}`}
    >
      <span className="w-5 shrink-0 font-mono text-[12px] text-faint">{String(index).padStart(2, '0')}</span>
      <span className="h-6 w-6 shrink-0 rounded-sm" style={{ background: swatch }} />
      <span className={`flex-1 truncate text-[13px] font-medium ${state === 'idle' ? 'text-text-2' : 'text-text'}`}>{name}</span>
      {trailing}
    </button>
  );
}

// ── Sheet ────────────────────────────────────────────────────────────

export function Sheet({ title, onClose, children, width = 720, height = 640, testId, docked = false }: {
  title: ReactNode; onClose: () => void; children: ReactNode; width?: number; height?: number; testId?: string;
  /**
   * Beside the plate rather than over it: no dimmed, blurred scrim, the panel
   * against the right edge, and the rest of the window still live. For a
   * sheet whose controls are judged by eye on the plate itself (the Mixer's
   * brightness and hue, judged through half-black glass, read wrong), and
   * which is ridden while the desk around it is still being played.
   */
  docked?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className={docked
        // Between the desk's 48 px header and its 28 px status bar, so the
        // header's buttons and lights stay in reach and in view beside it.
        ? 'pointer-events-none fixed bottom-7 right-0 top-12 z-50 flex items-stretch justify-end p-2'
        : 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-0 backdrop-blur-[4px] sm:p-6'}
      onClick={docked ? undefined : onClose}
      data-testid={testId ? `${testId}-scrim` : undefined}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: width, maxHeight: height, width: docked ? width : undefined }}
        className={`pointer-events-auto flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-[0_20px_60px_rgba(0,0,0,.6)]`}
        data-testid={testId}
      >
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-border px-5">
          <div className="flex items-center gap-2 text-[16px] font-medium text-text">{title}</div>
          <button onClick={onClose} className="rounded-md p-2 text-muted transition-colors hover:bg-hover hover:text-text" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="flex min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

// ── Toast ────────────────────────────────────────────────────────────

export function Toast({ title, meta, action, onAction, onDone, tone = 'ok' }: {
  title: string; meta?: string; action?: string; onAction?: () => void; onDone: () => void; tone?: 'ok' | 'live';
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    timer.current = setTimeout(onDone, 4000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [onDone]);
  return (
    <div
      className="fixed bottom-6 left-1/2 z-50 flex h-12 -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-elevated px-4 shadow-[0_12px_40px_rgba(0,0,0,.6)]"
      data-testid="toast"
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone === 'live' ? 'var(--color-live)' : 'var(--color-ok)' }} />
      <span className="text-[13px] font-medium text-text">{title}</span>
      {meta && <span className="text-[12px] text-dim">{meta}</span>}
      {action && (
        <button onClick={onAction} className="text-[13px] font-medium text-accent-text hover:underline">{action}</button>
      )}
    </div>
  );
}
