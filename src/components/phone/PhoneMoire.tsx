import { Slider } from '../ui';
import { PIN_RANGE } from '../../lib/deskPins';
import { readSetting } from '../../lib/readout';
import { MOIRE_SHEETS } from '../../lib/moire';
import { useMoirePreview } from '../../hooks/useMoirePreview';
import { TierLockBanner } from '../TierLock';
import type { VisualizerSettings } from '../../types';

/**
 * The moiré pack's sheets on the phone's Looks sheet (PLAN 45a): the same
 * lists and the same try-it rule as the desk's Moiré Sheets section
 * (settings/MoireSection.tsx), cut to what a thumb plays: which two sheets,
 * how dense their ink, and the upper sheet's turn and spin. The rest (slide,
 * scale, lines, gap, curl) is in Settings on the phone as on the desk.
 *
 * The pickers are 44 px selects, the touch rule's size, and the sliders the
 * phone's touch ones.
 */
export function PhoneMoire({ settings, onSetting }: {
  settings: VisualizerSettings;
  onSetting: (patch: Partial<VisualizerSettings>) => void;
}) {
  const pack = useMoirePreview(onSetting);
  const picker = (side: 'moireSheetA' | 'moireSheetB', label: string, set: (v: string) => void) => (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-[12px] text-dim">
      {label}
      <select
        value={settings[side] ?? 'spokes'}
        disabled={!pack.live}
        onChange={e => set(e.target.value)}
        className="h-11 min-w-0 rounded-lg border border-border-strong bg-elevated px-2 text-[16px] text-text disabled:opacity-40"
        data-testid={`phone-moire-${side === 'moireSheetA' ? 'lower' : 'upper'}`}
      >
        {MOIRE_SHEETS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>
  );
  const amount = settings.moireAmount ?? 0;
  const angle = settings.moireAngle ?? 4;
  const spin = settings.moireSpin ?? 0;
  const rangeOf = (k: keyof VisualizerSettings) => { const r = PIN_RANGE.get(k); return { min: r?.min ?? 0, max: r?.max ?? 1 }; };
  const pin = (k: keyof VisualizerSettings, v: number) => {
    const { min, max } = rangeOf(k);
    return { min, max, display: readSetting(k, v, min, max), midiKey: `setting:${k}` };
  };
  return (
    <div className="mt-3" data-testid="phone-moire">
      <div className="mb-2 text-[13px] font-medium text-text">Moiré Sheets</div>
      {!pack.allowed && (
        <TierLockBanner
          feature="moire"
          touch
          className="mb-2"
          dataAttrs={{ 'data-testid': 'phone-moire-pack' }}
          summary={
            pack.secondsLeft > 0
              ? `Trying the moiré pack: ${pack.secondsLeft} s left.`
              : 'Included in ChromaGlass Pro, or a $15 add-on for Home.'
          }
          actionLabel={pack.secondsLeft > 0 ? 'See unlock options →' : 'Unlock…'}
          secondaryAction={pack.secondsLeft <= 0 ? (
            <button
              type="button"
              onClick={pack.start}
              className="inline-flex min-h-11 items-center rounded-full bg-text px-4 text-[13px] font-medium text-bg"
              data-testid="phone-moire-try"
            >
              Try for 60 s
            </button>
          ) : undefined}
        />
      )}
      <div className="mb-3 flex gap-2">
        {picker('moireSheetA', 'Lower sheet', v => onSetting({ moireSheetA: v }))}
        {picker('moireSheetB', 'Upper sheet', v => onSetting({ moireSheetB: v }))}
      </div>
      {pack.live && (
        <>
          <Slider label="Moiré Sheets" value={amount} {...pin('moireAmount', amount)} step={0.05} onChange={v => onSetting({ moireAmount: v })} touch testId="phone-moire-amount" />
          <Slider label="Moiré Turn" value={angle} {...pin('moireAngle', angle)} step={0.1} onChange={v => onSetting({ moireAngle: v })} touch testId="phone-moire-turn" />
          <Slider label="Moiré Spin" value={spin} {...pin('moireSpin', spin)} step={0.1} onChange={v => onSetting({ moireSpin: v })} touch testId="phone-moire-spin" />
        </>
      )}
      <p className="-mt-3 text-[12px] leading-snug text-dim">Two printed sheets on the stage. Turn the upper one a few degrees and the fringes sweep; the liquid bends the lower one.</p>
    </div>
  );
}
