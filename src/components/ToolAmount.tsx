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
    <label className={`flex items-center gap-2 text-[11px] ${className}`} title={`How much the tool does: its ${means}. 1× is the usual; double-click to reset.`} data-testid="tool-amount">
      <span className="whitespace-nowrap opacity-60">Amount</span>
      <input
        type="range"
        className="min-w-0 flex-1"
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
