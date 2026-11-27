/**
 * The Amount of the tool in hand: how much dye it lays, how hard it presses,
 * how strong the wind or the pull (lib/toolAmount.ts). One per tool, so the
 * dropper can be light while the press is heavy.
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal } from 'lucide-react';
import { Toggle } from './ui';
import { usePortalBody } from './portalBody';
import { TOOL_AMOUNT, TOOL_AMOUNT_MEANS } from '../lib/toolAmount';
import { PIN_RANGE } from '../lib/deskPins';
import { useEscape } from '../hooks/useEscape';

/** Magnet Size's top, the registry's (it runs on to 1.5, PLAN 27h-1). */
const MAGNET_SIZE_MAX = PIN_RANGE.get('magnetSize')?.max ?? 1;

export function ToolAmount({ tool, value, onChange, className = '' }: {
  tool: string;
  value: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  const means = TOOL_AMOUNT_MEANS[tool] ?? 'amount';
  return (
    <label className={`flex min-w-0 items-center gap-2 text-[12px] ${className}`} title={`How much the tool does: its ${means}. 1× is the usual; double-click to reset.`} data-testid="tool-amount">
      <span className="whitespace-nowrap text-muted">Amount</span>
      <input
        type="range"
        className="h-6 w-0 min-w-0 flex-1"
        min={TOOL_AMOUNT.min}
        max={TOOL_AMOUNT.max}
        step={TOOL_AMOUNT.step}
        value={value}
        aria-label={`Amount: ${means}`}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(1)}
      />
      <span className="w-9 text-right font-mono tabular-nums text-text-2" data-testid="tool-amount-value">{value.toFixed(1)}×</span>
      <span className="hidden whitespace-nowrap text-dim xl:inline">{means}</span>
    </label>
  );
}

/** Each tool's name, as the popover titles it. */
const TOOL_NAMES: Record<string, string> = {
  dropper: 'Drop', spray: 'Spray', splatter: 'Splat', pour: 'Pour', streak: 'Streak',
  blow: 'Blow', press: 'Press', finger: 'Finger', magnet: 'Magnet', spin: 'Spin',
};

/**
 * A tool's own options, in a small panel by the hand: right-click a tool, or
 * click the Amount chip beside them.
 *
 * The Amount lived inline beside the tools, taking whatever width the row had
 * left, and on the Perform desk that was none: reported, with a screenshot,
 * as a dot that could not be seen or clicked. This gives it a slider of its
 * own at a size a hand can use, for any tool, not only the one in hand.
 */
export function ToolOptions({ tool, value, onChange, at, onClose, magnetSize, onMagnetSize, fingering, onFingering, thinGap, onThinGap }: {
  tool: string;
  value: number;
  onChange: (v: number) => void;
  /** Where to open, in the window: the click, or the chip's corner. */
  at: { x: number; y: number };
  onClose: () => void;
  /**
   * The Magnet's size (Magnet Size, lib/magnetSize.ts), shown under its
   * Amount: how far its pull reaches, where the Amount is how hard.
   */
  magnetSize?: number;
  onMagnetSize?: (v: number) => void;
  /** Press's Fingering and Thin Gap (also in Settings / Phone Stage). */
  fingering?: number;
  onFingering?: (v: number) => void;
  thinGap?: number;
  onThinGap?: (v: number) => void;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  useEscape(onClose);
  // Close on click outside without mounting an invisible full-screen scrim over the header.
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!cardRef.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [onClose]);

  const means = TOOL_AMOUNT_MEANS[tool] ?? 'amount';
  const sized = tool === 'magnet' && magnetSize !== undefined && !!onMagnetSize;
  const pressOpts = tool === 'press' && fingering !== undefined && !!onFingering;
  const W = 280, H = sized ? 210 : pressOpts ? 250 : 150;
  // The window it opens in: the page's, or a Tools panel's own (PLAN.md 8g).
  const body = usePortalBody();
  const view = body.ownerDocument.defaultView ?? window;
  const left = Math.max(8, Math.min(at.x, view.innerWidth - W - 8));
  const top = Math.max(8, Math.min(at.y - H - 8, view.innerHeight - H - 8));
  const fill = ((value - TOOL_AMOUNT.min) / (TOOL_AMOUNT.max - TOOL_AMOUNT.min)) * 100;
  /*
    To the body. Opened from the tool row under the plate, it was drawn
    inside the desk's own stacking, beneath the plate: on the Design desk at
    1440 only its bottom edge showed under the canvas (a browser screenshot,
    2026-10-03, while adding the Magnet's Size here), so the options could
    be set by a script and not seen by a hand.
  */
  return createPortal(
    <div
      ref={cardRef}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      style={{ left, top, width: W }}
      className="fixed z-[61] rounded-xl border border-border-strong bg-elevated p-4 shadow-[0_16px_48px_rgba(0,0,0,.6)]"
      data-testid="tool-options"
      role="dialog"
      aria-label={`${TOOL_NAMES[tool] ?? tool} options`}
    >
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[14px] font-semibold text-text">{TOOL_NAMES[tool] ?? tool}</span>
        <span className="font-mono text-[13px] tabular-nums text-text" data-testid="tool-options-value">{value.toFixed(2)}×</span>
      </div>
      <div className="mb-1 flex items-center justify-between text-[12px] text-muted">
        <span>Amount</span>
        <span className="text-faint">{means}</span>
      </div>
      <input
        type="range"
        autoFocus
        className="set-range"
        style={{ '--fill': `${fill}%` } as React.CSSProperties}
        min={TOOL_AMOUNT.min}
        max={TOOL_AMOUNT.max}
        step={TOOL_AMOUNT.step}
        value={value}
        aria-label={`${TOOL_NAMES[tool] ?? tool} amount: ${means}`}
        onChange={(e) => onChange(Number(e.target.value))}
        data-testid="tool-options-amount"
      />
      {sized && (
        <>
          <div className="mb-1 mt-3 flex items-center justify-between text-[12px] text-muted">
            <span>Size</span>
            <span className="text-faint">a coin to a palm</span>
          </div>
          <input
            type="range"
            className="set-range"
            style={{ '--fill': `${magnetSize! / MAGNET_SIZE_MAX * 100}%` } as React.CSSProperties}
            min={0}
            max={MAGNET_SIZE_MAX}
            step={0.05}
            value={magnetSize}
            aria-label="Magnet size: how far its pull reaches"
            onChange={(e) => onMagnetSize!(Number(e.target.value))}
            onDoubleClick={() => onMagnetSize!(0.5)}
            data-testid="tool-options-size"
          />
        </>
      )}
      {pressOpts && (
        <div className="mt-3 space-y-2.5">
          <div>
            <div className="mb-1 flex items-center justify-between text-[12px] text-muted">
              <span>Fingering</span>
              <span className="font-mono tabular-nums text-faint">{Math.round(fingering! * 100)}%</span>
            </div>
            <input
              type="range"
              className="set-range"
              style={{ '--fill': `${fingering! * 100}%` } as React.CSSProperties}
              min={0}
              max={1}
              step={0.01}
              value={fingering}
              aria-label="Press fingering: fingers as it lifts"
              onChange={(e) => onFingering!(Number(e.target.value))}
              onDoubleClick={() => onFingering!(0)}
              data-testid="tool-options-fingering"
            />
          </div>
          {thinGap !== undefined && onThinGap && (
            <Toggle
              label="Thin Gap"
              on={thinGap > 0.5}
              onChange={(on) => onThinGap(on ? 1 : 0)}
              testId="tool-options-thin-gap"
            />
          )}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[12px] text-faint">[ and ] step it · double-click resets</span>
        <button
          onClick={() => onChange(1)}
          disabled={value === 1}
          className="rounded-md border border-border-strong px-2.5 py-1 text-[12px] text-text-2 hover:bg-hover disabled:opacity-65"
          data-testid="tool-options-reset"
        >1×</button>
      </div>
    </div>
    , body,
  );
}

/** The Amount of the tool in hand, as a chip that is always there: click it for the tool's options. */
export function ToolAmountChip({ tool, value, onOpen }: { tool: string; value: number; onOpen: (at: { x: number; y: number }) => void }) {
  const means = TOOL_AMOUNT_MEANS[tool] ?? 'amount';
  const extra = tool === 'magnet' ? ' and Magnet Size' : tool === 'press' ? ', Fingering and Thin Gap' : '';
  return (
    <button
      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onOpen({ x: r.left, y: r.top }); }}
      title={`Tool options: ${TOOL_NAMES[tool] ?? tool} amount (${means})${extra}. Click, or right-click any tool.`}
      aria-label={`${TOOL_NAMES[tool] ?? tool} options (${value.toFixed(1)}×)`}
      className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[12px] transition-colors hover:bg-hover hover:text-text ${value === 1 ? 'border-border-strong text-muted' : 'border-accent-border text-accent-text'}`}
      data-testid="tool-amount-chip"
    >
      <SlidersHorizontal size={12} className="opacity-75" aria-hidden />
      <span className="hidden opacity-70 2xl:inline">Amount</span>
      <span className="font-mono tabular-nums">{value.toFixed(1)}×</span>
    </button>
  );
}

/**
 * Right-click on a row of tools opens the options of the tool under the
 * pointer. The row's buttons are `${testId}-${tool}`, so the tool is read
 * from the one that was hit.
 */
export function toolUnder(e: React.MouseEvent, testId: string): string | null {
  const hit = (e.target as HTMLElement).closest(`[data-testid^="${testId}-"]`);
  return hit ? (hit.getAttribute('data-testid') ?? '').slice(testId.length + 1) || null : null;
}
