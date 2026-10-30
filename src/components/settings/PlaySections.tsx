import { Lightbulb, SlidersVertical } from 'lucide-react';
import { groupOf } from '../../lib/settingsMap';
import { MixerPanel } from '../MixerPanel';
import { Toggle, LIVE } from '../ui';
import { LensCap } from '../ui/Playful';
import { Slider, PinChips } from './controls';
import type { SectionCtx } from './props';

/*
  Play, the first group on the rail: Master (the house lights, the blackout, the flash limit,
  the pace) and the mixer.

  Each section is the markup that sat inline in `SettingsPanel`'s `sections` tree,
  moved verbatim (PLAN 19ai-9): its `{keep(id) && (<section ...>)}` is unchanged, so
  a desk panel, the Stage sheet and the full sheet draw it exactly as before, and
  it takes the panel's props and locals as one object (`SectionCtx`, in
  `props.ts`), destructuring only the names its markup reads. `npm run panel`
  reads this file with the panel (`scripts/settingsSource.mjs`).
*/
export const MasterSection = ({ c }: { c: SectionCtx }) => {
  const {
    settings, onUpdate, blackout, onBlackout, output, onOutput, focusSection, embed, keep, shown,
    CARD, GRID, TITLE,
  } = c;
  return (
    <>
      {/* The presets live on the title, not here. One menu opened from the
          plate's own name is where a projectionist already looks for them,
          and it carries saving and loading too; a second copy buried in a
          scrolling panel was one more place to keep in step. */}
      {/* Master Section */}
      {/*
        The four things a show is run with, whatever the look: the house lights,
        the blackout, the flash limit and the pace of the plate. They were the
        middle of Sound — between the audio device and the room calibration —
        which is where nobody reaching for the house lights in a dark room looks,
        and the sheet opened on the microphone's sensitivity. It opens here now.
      */}
      {keep('master') && (
      <section id="settings-master" className={`${CARD} ${shown('master') ? GRID : 'hidden'} ${focusSection === 'master' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('master')} data-section="master">
        <h3 className={TITLE}>
          <Lightbulb size={12} /> Master
        </h3>
        {/* The house lights */}
        <Slider
          label="Dimmer"
          value={settings.dimmer ?? 1}
          min={0}
          max={1}
          step={0.01}
          onChange={(v: number) => onUpdate({ dimmer: v })}
          settingKey="dimmer"
        />
        {/* Not on a desk panel: the desk's header has Blackout, in every layout. */}
        {onBlackout && !embed && (
          <button
            aria-pressed={blackout}
            onClick={onBlackout}
            className={`flex w-full items-center justify-center gap-2 mb-4 -mt-1 py-2 rounded-lg text-[13px] font-medium border transition-all ${blackout ? LIVE : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
            title="Fade the plate to black and back (B on the keyboard)"
            data-testid="blackout-button"
          >
            <LensCap capped={blackout} size={16} />
            {blackout ? 'Lights up' : 'Blackout'}
          </button>
        )}
        {/* The same switch as the one at the bottom of Wall → Output, where it
            used to live alone: the last control of the longest section. */}
        {output && onOutput && (
          <div className="mb-4">
            <Toggle
              label="Flash Limit"
              on={output.flashGuard}
              onChange={v => onOutput({ ...output, flashGuard: v })}
              title="Hold the whole screen below three flashes a second (photosensitivity)"
              testId="flash-limit-master"
            />
          </div>
        )}

        {/* 0–0.3, the desk's and the controller's range: the timestep stops
            growing near 0.21, so 70% of the old 0–1 travel only raced the clocks. */}
        <Slider
          label="Speed"
          value={settings.globalSpeed}
          min={0.0}
          max={0.3}
          step={0.001}
          onChange={(v: number) => onUpdate({ globalSpeed: v })}
          settingKey="globalSpeed"
        />
        {/* How far the speed follows the music instead of the look: the
            tempo and how loud it has been. Random Evolve leans harder. */}
        <Slider
          label="Tempo Sync"
          value={settings.tempoSync ?? 0.5}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ tempoSync: v })}
          settingKey="tempoSync"
        />
      </section>
      )}
    </>
  );
};

export const MixerSection = ({ c }: { c: SectionCtx }) => {
  const {
    settings, onUpdate, filmSource, markLoaded, mixTakes, backLook, focusSection, keep, shown, CARD,
    TITLE,
  } = c;
  return (
    <>

      {/*
        The mixer (lib/mixer.ts, docs/rig-plan.md R7): the same panel the
        Perform desk and the phone open, with the pin chips this sheet puts on
        every control. Its sliders are drawn from MIX_CONTROLS, and `npm run
        panel` reads that list as this section's, since there is no literal
        slider here to read.
      */}
      {keep('mixer') && (
      <section id="settings-mixer" className={`${CARD} ${shown('mixer') ? '' : 'hidden'} ${focusSection === 'mixer' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('mixer')} data-section="mixer">
        <h3 className={TITLE}>
          <SlidersVertical size={12} /> Mixer
        </h3>
        <MixerPanel
          settings={settings}
          onSetting={onUpdate}
          hasFilm={filmSource !== 'none'}
          hasMark={markLoaded}
          chips={(k) => <PinChips settingKey={k} />}
          onFade={mixTakes?.onFade}
          backLook={backLook}
          fading={mixTakes?.fading}
          testId="settings-mixer-panel"
        />
      </section>
      )}
    </>
  );
};
