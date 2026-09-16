import { useEffect, useRef, type ReactNode, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';

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
  children, onClick, variant = 'secondary', kbd, height = 40, full, title, disabled, testId, icon,
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
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      data-testid={testId}
      style={{ height }}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 transition-colors duration-[120ms] disabled:opacity-40 ${
        full ? 'w-full' : ''
      } ${BUTTON_VARIANT[variant]}`}
    >
      {icon}
      <span className={`${variant === 'primary' ? 'text-[14px]' : 'text-[13px]'} font-medium`}>{children}</span>
      {kbd && <Kbd>{kbd}</Kbd>}
    </button>
  );
}

// ── Segmented control ────────────────────────────────────────────────

export function Segmented<T extends string>({
  value, options, onChange, height = 36, testId,
}: {
  value: T;
  options: readonly (readonly [T, string] | readonly [T, string, string])[];
  onChange: (v: T) => void;
  height?: number;
  testId?: string;
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
          className={`inline-flex items-center gap-1.5 rounded-sm px-4 text-[13px] font-medium transition-colors duration-[120ms] ${
            value === id ? 'bg-active text-text' : 'text-muted hover:text-text-2'
          }`}
        >
          {label}
          {kbd && <span className="font-mono text-[11px] text-faint">{kbd}</span>}
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

// ── Status dot ───────────────────────────────────────────────────────

export function StatusDot({ on, label, tone = 'ok', testId }: {
  on: boolean; label: string; tone?: 'ok' | 'live'; testId?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5" data-testid={testId} title={`${label}: ${on ? 'yes' : 'no'}`}>
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: on ? (tone === 'live' ? 'var(--color-live)' : 'var(--color-ok)') : 'var(--color-knob-off)' }}
      />
      <span className={`text-[12px] ${on ? (tone === 'live' ? 'text-live' : 'text-text-2') : 'text-dim'}`}>{label}</span>
    </span>
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
}

export function Slider({ label, value, min, max, step, onChange, display, cc, white, touch, testId }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="mb-5" data-testid={testId}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-text">{label}</span>
        <span className="flex items-center gap-2">
          {cc != null && <span className="font-mono text-[11px] text-faint">CC {cc}</span>}
          <span className="rounded-xs bg-elevated px-1.5 py-0.5 font-mono text-[12px] font-medium text-text-2">{display}</span>
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step ?? (max - min) / 200}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
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
}

export function CueRow({ index, name, swatch, state, trailing, onClick, onDoubleClick, onContextMenu, testId }: CueRowProps) {
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
      className={`flex h-12 w-full items-center gap-3 rounded-md border px-2.5 text-left transition-colors duration-[120ms] ${shell}`}
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
