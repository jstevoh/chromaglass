import { Slider } from '../ui';
import { MOIRE_SHEETS } from '../../lib/moire';
import { useMoirePreview } from '../../hooks/useMoirePreview';
import { openAccountSheet } from '../../lib/tierGates';
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
  return (
    <div className="mt-3" data-testid="phone-moire">
      <div className="mb-2 text-[13px] font-medium text-text">Moiré Sheets</div>
      {!pack.allowed && (
        <div className="mb-2 flex items-center gap-2 text-[12px] text-dim" data-testid="phone-moire-pack">
          <span className="flex-1">
            {pack.secondsLeft > 0 ? `Trying the moiré pack: ${pack.secondsLeft} s left.` : 'The moiré pack: in Pro, an add-on for Home.'}
          </span>
          {pack.secondsLeft <= 0 && (
            <button type="button" onClick={pack.start} className="h-11 rounded-full bg-text px-4 text-[14px] font-medium text-bg" data-testid="phone-moire-try">
              Try it
            </button>
          )}
          {pack.secondsLeft <= 0 && (
            <button type="button" onClick={openAccountSheet} className="h-11 rounded-full border border-border-strong px-4 text-[14px] font-medium text-text" data-testid="phone-moire-get">
              Get it
            </button>
          )}
        </div>
      )}
      <div className="mb-3 flex gap-2">
        {picker('moireSheetA', 'Lower sheet', v => onSetting({ moireSheetA: v }))}
        {picker('moireSheetB', 'Upper sheet', v => onSetting({ moireSheetB: v }))}
      </div>
      {pack.live && (
        <>
          <Slider label="Moiré Sheets" value={amount} min={0} max={1} step={0.05} onChange={v => onSetting({ moireAmount: v })}
            display={`${Math.round(amount * 100)}%`} touch testId="phone-moire-amount" midiKey="setting:moireAmount" />
          <Slider label="Moiré Turn" value={angle} min={-180} max={180} step={0.1} onChange={v => onSetting({ moireAngle: v })}
            display={`${angle.toFixed(1)}°`} touch testId="phone-moire-turn" midiKey="setting:moireAngle" />
          <Slider label="Moiré Spin" value={spin} min={-30} max={30} step={0.1} onChange={v => onSetting({ moireSpin: v })}
            display={`${spin.toFixed(1)} rpm`} touch testId="phone-moire-spin" midiKey="setting:moireSpin" />
        </>
      )}
      <p className="-mt-3 text-[12px] leading-snug text-dim">Two printed sheets on the stage. Turn the upper one a few degrees and the fringes sweep; the liquid bends the lower one.</p>
    </div>
  );
}
