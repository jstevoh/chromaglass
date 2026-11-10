import { SwitchPill } from '../ui';
import type { VisualizerSettings } from '../../types';

/**
 * The phone's Title switch (PLAN 37x-10): song titles put up when a song
 * starts, as the corner caption (37x-10j, `titleCaption`, the default) or
 * painted onto the plate as ink and washed away, with the choice between
 * the two under the switch while it is on, as the desk's "As a corner
 * caption" is. The same setting as the desk's
 * "Song titles" (Logo & Titles), bound to `inkTitle`, with its Sweep
 * beside it while it is on, since how fast a title goes is the one thing
 * about it a performer changes mid-set. Shared by the phone's own layout
 * (the More sheet) and the remote's Controls during a live set, where the
 * Live Show is run from (CLAUDE.md: the phone shares, never forks). Under it,
 * the Logo melt switch (`logoMelt`, PLAN 37x-11): the other ink the show
 * pours, the logo at the start of a stream or a recording.
 */
export function PhoneInkTitle({ settings, onSetting, disabled = false, testId = 'phone-ink-title' }: {
  settings: Partial<Pick<VisualizerSettings, 'inkTitle' | 'inkTitleSweep' | 'titleCaption' | 'logoMelt'>> | null | undefined;
  onSetting: (patch: Partial<VisualizerSettings>) => void;
  disabled?: boolean;
  testId?: string;
}) {
  const on = !!settings?.inkTitle;
  const sweep = settings?.inkTitleSweep ?? 0.5;
  const caption = settings?.titleCaption !== false;
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
          <span className="text-[12px] text-dim">{caption ? 'Each new song\'s credit in the corner, then gone' : 'Each new song\'s name poured as ink, then washed away'}</span>
        </span>
        <SwitchPill on={on} />
      </button>
      {on && (
        <div className="flex gap-2" role="radiogroup" aria-label="How titles go up">
          {([[true, 'Caption'], [false, 'Ink']] as const).map(([v, name]) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={caption === v}
              onClick={() => onSetting({ titleCaption: v })}
              disabled={disabled}
              data-testid={`${testId}-${v ? 'caption' : 'ink'}`}
              className={`min-h-11 flex-1 rounded-xl border text-[13px] font-semibold disabled:opacity-30 ${caption === v ? 'border-accent-border bg-accent-bg text-text' : 'border-white/10 bg-white/5 text-dim'}`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      {on && !caption && (
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
