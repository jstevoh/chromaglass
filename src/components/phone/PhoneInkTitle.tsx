import { SwitchPill } from '../ui';
import type { VisualizerSettings } from '../../types';

/**
 * The phone's Title switch (PLAN 37x-10): each new song's credit put up as
 * the corner caption (37x-10j) when a song starts. The same setting as the
 * desk's "Song titles" (Logo & Titles), bound to `inkTitle`. Until
 * 2026-11-12 a Caption / Ink choice sat under it, and the ink's Sweep; the
 * owner shelved the ink then (37x-10m, "this poured option never really
 * worked"), so both are gone and a title is always the caption. Shared by
 * the phone's own layout (the More sheet) and the remote's Controls during
 * a live set, where the Live Show is run from (CLAUDE.md: the phone shares,
 * never forks). Under it, the Logo melt switch (`logoMelt`, PLAN 37x-11):
 * the logo poured at the start of a stream or a recording.
 */
export function PhoneInkTitle({ settings, onSetting, disabled = false, testId = 'phone-ink-title' }: {
  settings: Partial<Pick<VisualizerSettings, 'inkTitle' | 'logoMelt'>> | null | undefined;
  onSetting: (patch: Partial<VisualizerSettings>) => void;
  disabled?: boolean;
  testId?: string;
}) {
  const on = !!settings?.inkTitle;
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
          <span className="text-[12px] text-dim">Each new song&apos;s credit in the corner, then gone</span>
        </span>
        <SwitchPill on={on} />
      </button>
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
