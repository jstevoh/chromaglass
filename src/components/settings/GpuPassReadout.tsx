import { gpuPassTotal, type GpuPassTime } from '../../lib/gpuPasses';

/** How many passes the readout names; the rest are summed into one line. */
export const PASSES_SHOWN = 8;

/**
 * Every GPU pass of a frame, costliest first, under the Simulation section's
 * `?debug` frame split (PLAN.md 14ab-16).
 *
 * The frame split above it says the solver costs so many milliseconds a step
 * and everything else so many a frame, which is the CPU's side and the
 * whole-frame view. What it cannot say is which pass on the GPU that time is,
 * and that is the question someone tuning a grid or a look on their own
 * machine is asking. The numbers come from the timestamp queries the governor
 * already reads (`lib/gpuPasses.ts` says how they are turned into ms a frame),
 * so showing them costs the show nothing: the list is built once a second, and
 * only on a `?debug` page.
 *
 * The same component in the laptop's Settings, the desk's Simulation panel
 * and the phone's More → Settings, since all three are the one SettingsPanel.
 *
 * `passes` undefined: nothing asked (not a `?debug` page), draw nothing. Null:
 * this GPU grants no timestamps, and the readout says so rather than showing an
 * empty list that would read as a frame that cost nothing. Empty: the first
 * readings have not come back yet.
 */
export const GpuPassReadout = ({ passes }: { passes: GpuPassTime[] | null | undefined }) => {
  if (passes === undefined) return null;
  const line = 'text-[11px] font-mono opacity-40 leading-relaxed';
  if (passes === null) {
    return <div className={line} data-testid="gpu-passes">GPU passes: this GPU gives no timestamps</div>;
  }
  if (!passes.length) {
    return <div className={line} data-testid="gpu-passes">GPU passes: no timings back yet</div>;
  }
  const total = gpuPassTotal(passes);
  const shown = passes.slice(0, PASSES_SHOWN);
  const rest = passes.length > PASSES_SHOWN ? gpuPassTotal(passes.slice(PASSES_SHOWN)) : 0;
  // A step drawn as one pass hides its stages; `?stages` opens a pass per stage.
  const whole = passes.some((p) => p.label === 'solver step' || p.label.endsWith(' solver step'));
  const row = (label: string, ms: number, key: string) => (
    <div key={key} className="flex justify-between gap-3" data-testid="gpu-pass">
      <span className="truncate">{label}</span>
      <span className="shrink-0 tabular-nums">{ms.toFixed(2)} ms · {Math.round((ms / total) * 100)}%</span>
    </div>
  );
  return (
    <div className={line} data-testid="gpu-passes">
      <div>GPU {total.toFixed(1)} ms a frame, by pass</div>
      {shown.map((p, i) => row(p.label, p.ms, `${i}`))}
      {rest > 0 && row(`${passes.length - PASSES_SHOWN} more`, rest, 'rest')}
      {whole && <div>add &amp;stages to the address to split the solver step</div>}
    </div>
  );
};
