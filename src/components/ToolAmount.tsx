/**
 * The Amount of the tool in hand: how much dye it lays, how hard it presses,
 * how strong the wind or the pull (lib/toolAmount.ts). One per tool, so the
 * dropper can be light while the press is heavy.
 */
import { TOOL_AMOUNT, TOOL_AMOUNT_MEANS } from '../lib/toolAmount';

export function ToolAmount({ tool, value, onChange, className = '' }: {
  tool: string;
  value: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  const means = TOOL_AMOUNT_MEANS[tool] ?? 'amount';
  return (
    <label className={`flex min-w-0 items-center gap-2 text-[11px] ${className}`} title={`How much the tool does: its ${means}. 1× is the usual; double-click to reset.`} data-testid="tool-amount">
      <span className="whitespace-nowrap opacity-60">Amount</span>
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
      <span className="w-9 text-right font-mono tabular-nums opacity-80" data-testid="tool-amount-value">{value.toFixed(1)}×</span>
      <span className="hidden whitespace-nowrap opacity-40 xl:inline">{means}</span>
    </label>
  );
}

/** Each tool's name, as the popover titles it. */
const TOOL_NAMES: Record<string, string> = {
  dropper: 'Drop', spray: 'Spray', splatter: 'Splat', pour: 'Pour', streak: 'Streak',
  blow: 'Blow', press: 'Press', finger: 'Finger', magnet: 'Magnet',
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
export function ToolOptions({ tool, value, onChange, at, onClose }: {
  tool: string;
  value: number;
  onChange: (v: number) => void;
  /** Where to open, in the window: the click, or the chip's corner. */
  at: { x: number; y: number };
  onClose: () => void;
}) {
  const means = TOOL_AMOUNT_MEANS[tool] ?? 'amount';
  const W = 280, H = 150;
  const left = Math.max(8, Math.min(at.x, window.innerWidth - W - 8));
  const top = Math.max(8, Math.min(at.y - H - 8, window.innerHeight - H - 8));
  const fill = ((value - TOOL_AMOUNT.min) / (TOOL_AMOUNT.max - TOOL_AMOUNT.min)) * 100;
  return (
    <div className="fixed inset-0 z-50" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        style={{ left, top, width: W }}
        className="absolute rounded-xl border border-border-strong bg-elevated p-4 shadow-[0_16px_48px_rgba(0,0,0,.6)]"
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
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] text-faint">[ and ] step it · double-click resets</span>
          <button
            onClick={() => onChange(1)}
            disabled={value === 1}
            className="rounded-md border border-border-strong px-2.5 py-1 text-[12px] text-text-2 hover:bg-hover disabled:opacity-40"
            data-testid="tool-options-reset"
          >1×</button>
        </div>
      </div>
    </div>
  );
}

/** The Amount of the tool in hand, as a chip that is always there: click it for the tool's options. */
export function ToolAmountChip({ tool, value, onOpen }: { tool: string; value: number; onOpen: (at: { x: number; y: number }) => void }) {
  const means = TOOL_AMOUNT_MEANS[tool] ?? 'amount';
  return (
    <button
      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onOpen({ x: r.left, y: r.top }); }}
      title={`How much the ${TOOL_NAMES[tool] ?? tool} does (${means}). Click, or right-click any tool, for its options.`}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[12px] transition-colors hover:bg-hover ${value === 1 ? 'border-border text-muted' : 'border-accent-border text-accent-text'}`}
      data-testid="tool-amount-chip"
    >
      {/*
        The word only where there is room for it. On the macOS runner's fonts
        the chip with its word pushed the tool row past the middle column at
        1440, which widened the whole desk and slid the header's centred mode
        switch off true (npm run qa: "the mode switch does not move").
      */}
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
