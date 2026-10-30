import { FlaskConical, Wind } from 'lucide-react';
import { groupOf } from '../../lib/settingsMap';
import { LiquidDesigner } from '../LiquidDesigner';
import { Slider } from './controls';
import type { SectionCtx } from './props';

/*
  Pour: putting liquid on the plate by hand, and the liquids it pours.

  Each section is the markup that sat inline in `SettingsPanel`'s `sections` tree,
  moved verbatim (PLAN 19ai-9): its `{keep(id) && (<section ...>)}` is unchanged, so
  a desk panel, the Stage sheet and the full sheet draw it exactly as before, and
  it takes the panel's props and locals as one object (`SectionCtx`, in
  `props.ts`), destructuring only the names its markup reads. `npm run panel`
  reads this file with the panel (`scripts/settingsSource.mjs`).
*/
export const InteractionSection = ({ c }: { c: SectionCtx }) => {
  const { settings, onUpdate, focusSection, keep, shown, CARD, GRID, TITLE } = c;
  return (
    <>

      {/* Manual Interaction Section */}
      {keep('interaction') && (
      <section id="settings-interaction" className={`${CARD} ${shown('interaction') ? GRID : 'hidden'} ${focusSection === 'interaction' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('interaction')} data-section="interaction">
        <h3 className={TITLE}>
          <Wind size={12} /> Manual Interaction
        </h3>
        {/* "Updraft", not "Blow Velocity": it is a constant draught over the
            whole plate, and has nothing to do with how hard the Blow tool
            blows. */}
        <Slider
          label="Updraft"
          value={settings.airVelocity}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ airVelocity: v })}
          settingKey="airVelocity"
        />
        <Slider
          label="Vibration"
          value={settings.vibrationFrequency}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ vibrationFrequency: v })}
          settingKey="vibrationFrequency"
        />
        {/* How far a dropped liquid falls before it meets the plate: at 0 it is
            laid on; higher, it lands — pressing the film into a ring, pushing
            the liquid round it outward, and throwing satellite droplets. Works
            on the Drop tool and on the drops the show makes by itself. */}
        <Slider
          label="Drop Height"
          value={settings.dropHeight ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ dropHeight: v })}
          settingKey="dropHeight"
        />
      </section>
      )}
    </>
  );
};

export const LiquidsSection = ({ c }: { c: SectionCtx }) => {
  const { focusSection, liquids, keep, shown, CARD, GRID, TITLE } = c;
  return (
    <>

      {/* Liquids anyone can make, load from a file and save to one (lib/liquidFile.ts). */}
      {keep('liquids') && (
      <section id="settings-liquids" className={`${CARD} ${shown('liquids') ? GRID : 'hidden'} ${focusSection === 'liquids' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('liquids')} data-section="liquids">
        <h3 className={TITLE}>
          <FlaskConical size={12} /> Liquids
        </h3>
        {liquids ? <LiquidDesigner {...liquids} /> : <div className="text-[12px] opacity-35">The shelf is not available here.</div>}
      </section>
      )}
    </>
  );
};
