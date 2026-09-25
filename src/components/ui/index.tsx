import { useEffect, useRef, type ReactNode, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
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
  value, options, onChange, height = 36, testId, compact = false,
}: {
  value: T;
  options: readonly (readonly [T, string] | readonly [T, string, string])[];
  onChange: (v: T) => void;
  height?: number;
  testId?: string;
  /**
   * Tighter, for a row that has to share its line: below 1280 the padding
   * narrows and the key letters step back into the tooltip. Perform's eight
   * tools next to the dye tray pushed Freeze and Drain off a 1024 screen
   * without it.
   */
  compact?: boolean;
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-elevated p-0.5" role="tablist" data-testid={testId}>
      {options.map(([id, label, kbd]) => (
        <button
          key={id}
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          style={{ height: height - 4 }}
          data-testid={testId ? `${testId}-${id}` : undefined}
          title={compact && kbd ? `${label} (${kbd})` : undefined}
          className={`inline-flex items-center gap-1.5 rounded-sm ${compact ? 'px-1.5 xl:px-4' : 'px-4'} text-[13px] font-medium transition-colors duration-[120ms] ${
            value === id ? 'bg-active text-text' : 'text-muted hover:text-text-2'
          }`}
        >
          {label}
          {kbd && <span className={`font-mono text-[11px] text-faint ${compact ? 'hidden xl:inline' : ''}`}>{kbd}</span>}
        </button>
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

export function StatusDot({ on, label, tone = 'ok', testId, onClick, title, bare = false, tight = false }: {
  on: boolean; label: string; tone?: 'ok' | 'live'; testId?: string;
  /** The dot alone at every width, its label only in the tooltip and to a screen reader. */
  bare?: boolean;
  /** The dot alone for now: the header has measured that the words do not fit (DeskHeader). */
  tight?: boolean;
  /**
   * What clicking it opens. A dot that reports a thing you cannot reach is
   * half a control: the MIDI dot said "no controller" all evening with no way
   * from there to the screen that would connect one.
   */
  onClick?: () => void;
  title?: string;
}) {
  const body = (
    <>
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: on ? (tone === 'live' ? 'var(--color-live)' : 'var(--color-ok)') : 'var(--color-knob-off)' }}
      />
      {/*
        The label is what gives way when the header runs out of room.

        These sit in the right-hand cluster of a header whose middle is a
        switch pinned to the centre of the *window*, so the cluster's width is
        the only thing deciding whether the two collide — and four labels
        ("Mic", "Wall", "APC40 mkII", "Phone") are most of that width. Below
        1400 they go and the dots remain: still coloured, still clickable,
        still carrying the tooltip that says what they are and what clicking
        does. A dot with no word beside it is worth more than a word painted
        underneath a control.
      */}
      <span className={`${bare || tight ? 'sr-only' : 'hidden min-[1100px]:inline'} text-[12px] ${on ? (tone === 'live' ? 'text-live' : 'text-text-2') : 'text-dim'}`}>{label}</span>
    </>
  );
  const tip = title ?? `${label}: ${on ? 'yes' : 'no'}`;
  if (!onClick) {
    return (
      <span className="inline-flex items-center gap-1.5" data-testid={testId} title={tip}>{body}</span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      title={tip}
      className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 -mx-1.5 transition-colors hover:bg-hover${bare ? ' min-h-6 min-w-6 justify-center' : ''}`}
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
      className={`flex h-12 w-full items-center gap-3 rounded-md border px-2.5 text-left transition-colors duration-[120ms] ${shell} ${hit ? MIDI_HIT : ''}`}
    >
      <span className="w-5 shrink-0 font-mono text-[12px] text-faint">{String(index).padStart(2, '0')}</span>
      <span className="h-6 w-6 shrink-0 rounded-sm" style={{ background: swatch }} />
      <span className={`flex-1 truncate text-[13px] font-medium ${state === 'idle' ? 'text-text-2' : 'text-text'}`}>{name}</span>
      {trailing}
    </button>
  );
}

// ── Sheet ────────────────────────────────────────────────────────────

export function Sheet({ title, onClose, children, width = 720, height = 640, testId }: {
  title: ReactNode; onClose: () => void; children: ReactNode; width?: number; height?: number; testId?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-0 backdrop-blur-[4px] sm:p-6"
      onClick={onClose}
      data-testid={testId ? `${testId}-scrim` : undefined}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: width, maxHeight: height }}
        className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-[0_20px_60px_rgba(0,0,0,.6)]"
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
