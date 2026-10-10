import { Component, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { record as crashRecord } from '../lib/crashLog';

/**
 * A panel that throws stops being a panel, not the show (S14,
 * docs/stability-plan.md).
 *
 * Until this, `Boot` (`src/main.tsx`) was the only error boundary, and the
 * plate shares a React tree with every desk, sheet and phone component. A
 * render error in any of them unmounted the whole app: the GPU device was
 * destroyed with `LiquidVisualizer`, the ear and the recorder ended, the wall
 * froze on its last frame, and the screen said "ChromaGlass could not start"
 * with only a reload, which then strands the projector window (S15). The
 * thing that failed was a settings list; the thing the room lost was the show.
 *
 * So every panel, desk and phone component sits in one of these, and the plate
 * sits in none of them. A panel that throws is replaced by a small card that
 * says which one stopped, writes the error to the black box (source `panel`,
 * so a report says which panel and why), and offers Try again and, where the
 * panel can be closed, Close. Everything outside it carries on: the plate
 * keeps stepping, the sound keeps being heard, the wall keeps being fed.
 *
 * Two shapes. A panel drawn over the plate (settings, the songs, a sheet)
 * gets a card pinned to the bottom-left of the window (portalled to the body),
 * because an in-flow card would land wherever the dead panel's box was; several
 * at once stack upwards rather than on top of each other. A panel drawn inside
 * another one (the Mixer inside the Perform desk and the phone's Play sheet)
 * gets an `inline` card in its own place, so the desk around it keeps its Go
 * button and its set list.
 *
 * Measured by `npm run crash` ("a panel that throws…"): with `?debug`,
 * `window.chromaglassPanelFault(name)` makes the named panel throw on its next
 * render, and the check asks that the card is drawn, the line is in the log,
 * no fatal is written, the plate is still mounted, and Try again brings the
 * panel back once the fault is cleared.
 */

const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

// ── The debug hook: a fault armed by name, and which guards are mounted ──
// Kept out of `chromaglassDebug` (LiquidVisualizer's) on purpose: the guards
// must be testable without the plate's own state, and the plate is exactly the
// thing a panel's fault must not reach.
let armed: string | null = null;
const armedListeners = new Set<() => void>();
const mounted = new Map<string, number>();
if (DEBUG && typeof window !== 'undefined') {
  const w = window as unknown as { chromaglassPanelFault?: (n: string | null) => void; chromaglassPanels?: () => string[] };
  w.chromaglassPanelFault = (name) => { armed = name; for (const fn of armedListeners) fn(); };
  w.chromaglassPanels = () => [...mounted.keys()];
}
const subscribeArmed = (fn: () => void) => { armedListeners.add(fn); return () => armedListeners.delete(fn); };

function Tripwire({ name, children }: { name: string; children: ReactNode }) {
  const fault = useSyncExternalStore(subscribeArmed, () => armed);
  if (fault === name) throw new Error(`a fault armed by hand in ${name} (chromaglassPanelFault)`);
  return <>{children}</>;
}

// ── Which cards are up, so the pinned ones stack instead of overlapping ──
let failed: string[] = [];
const failedListeners = new Set<() => void>();
const setFailed = (next: string[]) => { failed = next; for (const fn of failedListeners) fn(); };
const subscribeFailed = (fn: () => void) => { failedListeners.add(fn); return () => failedListeners.delete(fn); };

function FailedCard({ name, error, inline, onRetry, onClose, closeLabel }: {
  name: string; error: unknown; inline: boolean; onRetry: () => void; onClose?: () => void; closeLabel: string;
}) {
  const stack = useSyncExternalStore(subscribeFailed, () => failed);
  const slot = Math.max(0, stack.indexOf(name));
  const message = String((error as { message?: unknown })?.message ?? error);
  const card = (
    <div
      role="alert"
      data-testid="panel-failed"
      data-panel={name}
      style={inline ? undefined : { bottom: 16 + slot * 92 }}
      className={`${inline ? 'relative w-full' : 'fixed left-4 z-[90] w-[min(320px,calc(100vw-32px))]'} pointer-events-auto rounded-lg border border-amber-300/30 bg-black/85 px-3 py-2.5 text-left shadow-2xl backdrop-blur-xl`}
    >
      <p className="text-[12px] text-white/90">{name} stopped working. The show carries on.</p>
      <p className="mt-0.5 truncate text-[11px] text-white/45" title={message}>{message}</p>
      <div className="mt-2 flex gap-2">
        <button onClick={onRetry} data-testid="panel-retry"
          className="rounded-md border border-white/20 px-2.5 py-1 text-[11px] text-white/90 transition-colors hover:bg-white/10">
          Try again
        </button>
        {onClose && (
          <button onClick={onClose} data-testid="panel-close"
            className="rounded-md px-2.5 py-1 text-[11px] text-white/60 transition-colors hover:bg-white/10 hover:text-white/90">
            {closeLabel}
          </button>
        )}
      </div>
    </div>
  );
  // Pinned cards go to the body: most panels sit in a container with a
  // backdrop blur or a transform, which makes `fixed` mean "fixed to that
  // container", and the first card drawn landed inside the crash button's
  // corner, half off the window.
  return inline ? card : createPortal(card, document.body);
}

interface Props {
  /**
   * How the card names it to the performer, and how the log and the debug hook
   * name it. Two guards may share a name only if they can never be up at once
   * (the crash report's two places, one per layout): the hook would fault both
   * and their cards would share a slot.
   */
  name: string;
  children: ReactNode;
  /** Draw the card where the panel was, not pinned to the window (a panel inside another). */
  inline?: boolean;
  /** Where the panel can be put away, the card offers that as well as Try again. */
  onClose?: () => void;
  /** What Close is called where putting the panel away means something else (a desk: open the other one). */
  closeLabel?: string;
}

export class PanelGuard extends Component<Props, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) { return { error }; }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    const e = error as { message?: unknown; stack?: unknown };
    // The component stack says which part of the panel; the JS stack's first
    // lines say which line. Both are short enough for the ring's clip.
    const where = String(info?.componentStack ?? '').split('\n').filter(Boolean).slice(0, 3).map(s => s.trim()).join(' < ');
    crashRecord('error', 'panel', `${this.props.name} stopped: ${String(e?.message ?? error)}${where ? `\n${where}` : ''}${e?.stack ? `\n${String(e.stack).split('\n').slice(1, 3).join('\n')}` : ''}`);
    if (!this.props.inline && !failed.includes(this.props.name)) setFailed([...failed, this.props.name]);
  }

  componentDidMount() { mounted.set(this.props.name, (mounted.get(this.props.name) ?? 0) + 1); }

  componentWillUnmount() {
    const n = (mounted.get(this.props.name) ?? 1) - 1;
    if (n > 0) mounted.set(this.props.name, n); else mounted.delete(this.props.name);
    this.unstack();
  }

  private unstack() { if (failed.includes(this.props.name)) setFailed(failed.filter(n => n !== this.props.name)); }

  private retry = () => { this.unstack(); this.setState({ error: null }); };

  // Close puts the panel away and clears the card in the same render. Not
  // every parent unmounts the guard when its panel closes (the bench overlay is
  // always mounted and draws nothing without text; the cue bar stays up while
  // a look is fading back), so a card that waited to be unmounted stayed up
  // with a Close that did nothing. If the panel throws again with the parent's
  // state changed, the card comes back, which is the truth.
  private close = () => { this.unstack(); this.props.onClose?.(); this.setState({ error: null }); };

  render() {
    const { error } = this.state;
    const { name, inline = false, onClose, closeLabel = 'Close', children } = this.props;
    if (error !== null) {
      return <FailedCard name={name} error={error} inline={inline} onRetry={this.retry} onClose={onClose ? this.close : undefined} closeLabel={closeLabel} />;
    }
    return DEBUG ? <Tripwire name={name}>{children}</Tripwire> : children;
  }
}
