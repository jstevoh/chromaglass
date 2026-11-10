import { SwitchPill } from '../ui';
import type { VisualizerSettings } from '../../types';

/**
 * The phone's Title switch (PLAN 37x-10): song titles painted onto the plate
 * as ink when a song starts, then washed away. The same setting as the desk's
 * "Song titles as ink" (Logo & Titles), bound to `inkTitle`, with its Sweep
 * beside it while it is on, since how fast a title goes is the one thing
 * about it a performer changes mid-set. Shared by the phone's own layout
 * (the More sheet) and the remote's Controls during a live set, where the
 * Live Show is run from (CLAUDE.md: the phone shares, never forks). Under it,
 * the Logo melt switch (`logoMelt`, PLAN 37x-11): the other ink the show
 * pours, the logo at the start of a stream or a recording.
 */
export function PhoneInkTitle({ settings, onSetting, disabled = false, testId = 'phone-ink-title' }: {
  settings: Partial<Pick<VisualizerSettings, 'inkTitle' | 'inkTitleSweep' | 'logoMelt'>> | null | undefined;
  onSetting: (patch: Partial<VisualizerSettings>) => void;
  disabled?: boolean;
  testId?: string;
}) {
  const on = !!settings?.inkTitle;
  const sweep = settings?.inkTitleSweep ?? 0.5;
  const melt = !!settings?.logoMelt;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4" data-testid={testId}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onSetting({ inkTitle: !on })}
        disabled={disabled}
        data-testid={`${testId}-switch`}
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left disabled:opacity-30"
      >
        <span className="flex flex-col">
          <span className="text-[13px] font-semibold text-text">Title</span>
          <span className="text-[12px] text-dim">Each new song&apos;s name poured as ink, then washed away</span>
        </span>
        <SwitchPill on={on} />
      </button>
      {on && (
        <label className="flex items-center gap-3 text-[12px] text-dim">
          <span className="w-12 shrink-0">Sweep</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={sweep}
            disabled={disabled}
            onChange={(e) => onSetting({ inkTitleSweep: Number(e.target.value) })}
            className="h-11 flex-1 accent-[var(--color-accent)]"
            aria-label="Title sweep"
            data-testid={`${testId}-sweep`}
          />
          <span className="w-9 text-right font-mono">{Math.round(sweep * 100)}</span>
        </label>
      )}
      {/* The logo melted at the start of a film or stream (PLAN 37x-11): the desk's "Melt the logo at the start". */}
      <button
        type="button"
        role="switch"
        aria-checked={melt}
        onClick={() => onSetting({ logoMelt: !melt })}
        disabled={disabled}
        data-testid={`${testId}-logo`}
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left disabled:opacity-30"
      >
        <span className="flex flex-col">
          <span className="text-[13px] font-semibold text-text">Logo melt</span>
          <span className="text-[12px] text-dim">The logo poured as ink when the stream or a recording starts, then melted away</span>
        </span>
        <SwitchPill on={melt} />
      </button>
    </div>
  );
}
