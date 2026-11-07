import { Grid3x3 } from 'lucide-react';
import { groupOf } from '../../lib/settingsMap';
import { MOIRE_SHEETS } from '../../lib/moire';
import { useMoirePreview } from '../../hooks/useMoirePreview';
import { Info } from '../Info';
import { Slider } from './controls';
import type { SectionCtx } from './props';

/*
  Moiré Sheets (PLAN 45a): the moiré pack's two printed transparencies on the
  stage. The phone's Looks sheet draws the same controls from the same lists
  (phone/PhoneMoire.tsx), and both ask `useMoirePreview` whether they move.

  Its own section rather than a Mixer row: a row can be stacked anywhere, and
  these two sheets have a place, one under the glass where the projector sees
  it through the liquid and one on the cover, which is what makes the liquid
  draw itself into the fringes.
*/
export const MoireSection = ({ c }: { c: SectionCtx }) => {
  const { settings, onUpdate, focusSection, keep, shown, CARD, GRID, TITLE } = c;
  const pack = useMoirePreview(onUpdate);
  if (!keep('moire')) return null;
  const off = !pack.live && 'the moiré pack: try it, or Pro includes it';
  const sheetPicker = (side: 'moireSheetA' | 'moireSheetB', label: string, title: string, set: (v: string) => void) => (
    <label className="mb-3 flex items-center gap-2 text-[12px] text-white/60">
      <span className="w-28 shrink-0">{label}</span>
      <select
        value={settings[side] ?? 'spokes'}
        disabled={!pack.live}
        onChange={(e) => set(e.target.value)}
        className="flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-white/85 disabled:opacity-40"
        data-testid={`moire-${side === 'moireSheetA' ? 'lower' : 'upper'}`}
        title={title}
      >
        {MOIRE_SHEETS.map(s => <option key={s.id} value={s.id} title={s.hint}>{s.name}</option>)}
      </select>
    </label>
  );
  return (
    <section id="settings-moire" className={`${CARD} ${shown('moire') ? GRID : 'hidden'} ${focusSection === 'moire' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('moire')} data-section="moire">
      <h3 className={TITLE}>
        <Grid3x3 size={12} /> Moiré Sheets
      </h3>
      <Info>
        Two printed transparencies on the stage, one under the glass and one on the cover. The light goes through both, and two line patterns multiplied make slow fringes far larger than their lines: turn the upper sheet a few degrees and bars, stars and flowers sweep across the plate. The lower sheet is seen through the liquid, so every drop bends its lines and shows up magnified in the fringes.
      </Info>
      {!pack.allowed && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] text-white/70" data-testid="moire-pack-note">
          <span className="flex-1">
            {pack.secondsLeft > 0
              ? `Trying the moiré pack: ${pack.secondsLeft} s left.`
              : 'The moiré pack: included in Pro, an add-on for Home.'}
          </span>
          {pack.secondsLeft <= 0 && (
            <button type="button" onClick={pack.start} className="rounded-full bg-white/10 px-3 py-1 text-white/85 hover:bg-white/20" data-testid="moire-try">
              Try for a minute
            </button>
          )}
        </div>
      )}
      {sheetPicker('moireSheetA', 'Lower sheet', 'The sheet under the glass, seen through the liquid', (v) => onUpdate({ moireSheetA: v }))}
      {sheetPicker('moireSheetB', 'Upper sheet', 'The sheet laid on the cover glass, the one a hand turns', (v) => onUpdate({ moireSheetB: v }))}
      {/* Face down: the same print mirrored, which crosses two spoke or spiral sheets into diamonds and flowers. */}
      <label className="mb-3 flex items-center gap-2 text-[12px] text-white/60">
        <input type="checkbox" checked={settings.moireFlip ?? true} disabled={!pack.live}
          onChange={(e) => onUpdate({ moireFlip: e.target.checked })} data-testid="moire-flip" />
        <span>Flip the upper sheet face down</span>
      </label>
      <Slider label="Moiré Sheets" disabled={off} value={settings.moireAmount ?? 0} min={0} max={1} step={0.05}
        onChange={(v: number) => onUpdate({ moireAmount: v })} settingKey="moireAmount" />
      <Slider label="Moiré Turn" disabled={off} value={settings.moireAngle ?? 4} min={-180} max={180} step={0.1}
        onChange={(v: number) => onUpdate({ moireAngle: v })} settingKey="moireAngle" />
      <Slider label="Moiré Spin (rpm)" disabled={off} value={settings.moireSpin ?? 0} min={-30} max={30} step={0.1}
        onChange={(v: number) => onUpdate({ moireSpin: v })} settingKey="moireSpin" />
      <Slider label="Moiré Slide" disabled={off} value={settings.moireSlide ?? 0} min={-0.5} max={0.5} step={0.005}
        onChange={(v: number) => onUpdate({ moireSlide: v })} settingKey="moireSlide" />
      <Slider label="Moiré Scale" disabled={off} value={settings.moireRatio ?? 1} min={0.5} max={2} step={0.005}
        onChange={(v: number) => onUpdate({ moireRatio: v })} settingKey="moireRatio" />
      <Slider label="Moiré Lines" disabled={off} value={settings.moireDensity ?? 48} min={4} max={400} step={1}
        onChange={(v: number) => onUpdate({ moireDensity: v })} settingKey="moireDensity" />
      <Slider label="Moiré Gap (mm)" disabled={off} value={settings.moireGap ?? 3} min={0} max={20} step={0.1}
        onChange={(v: number) => onUpdate({ moireGap: v })} settingKey="moireGap" />
      <Slider label="Moiré Curl" disabled={off} value={settings.moireCurl ?? 0.3} min={0} max={1} step={0.01}
        onChange={(v: number) => onUpdate({ moireCurl: v })} settingKey="moireCurl" />
    </section>
  );
};
