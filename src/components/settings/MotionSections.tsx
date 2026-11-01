import { Waves, Zap, Hourglass, Aperture, RotateCw } from 'lucide-react';
import { AudioFeature } from '../../types';
import { groupOf } from '../../lib/settingsMap';
import { Info } from '../Info';
import { LIT } from '../ui';
import { StrobeRing } from '../ui/Playful';
import { TipPad } from '../ui/TipPad';
import { SPIN_AUTO_NAMES } from '../../lib/turntable';
import { Slider, PinChips } from './controls';
import { AUDIO_FEATURES } from './patchLists';
import type { SectionCtx } from './props';

/*
  Motion: how the plate moves by itself. The kaleidoscope, tilt and rock, the plate's
  spin, the fluid physics and the automation.

  Each section is the markup that sat inline in `SettingsPanel`'s `sections` tree,
  moved verbatim (PLAN 19ai-9): its `{keep(id) && (<section ...>)}` is unchanged, so
  a desk panel, the Stage sheet and the full sheet draw it exactly as before, and
  it takes the panel's props and locals as one object (`SectionCtx`, in
  `props.ts`), destructuring only the names its markup reads. `npm run panel`
  reads this file with the panel (`scripts/settingsSource.mjs`).
*/
export const KaleidoscopeSection = ({ c }: { c: SectionCtx }) => {
  const { settings, onUpdate, focusSection, pins, keep, shown, CARD, GRID, TITLE } = c;
  return (
    <>


      {/*
        Kaleidoscope Section

        It used to be one control three-quarters of the way down Show, between
        Background Loop and Round Dish, and two of its three dimensions were
        constants inside the shader — so there was nothing to group and no way
        to play it. Folds, how fast the rig turns, and how much plate feeds
        each wedge, together, and all three on the MIDI list.
      */}
      {keep('kaleidoscope') && (
      <section id="settings-kaleidoscope" className={`${CARD} ${shown('kaleidoscope') ? GRID : 'hidden'} ${focusSection === 'kaleidoscope' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('kaleidoscope')} data-section="kaleidoscope">
        <h3 className={TITLE}>
          <Aperture size={12} /> Kaleidoscope
        </h3>
        <Info>
          A mirror rig over the plate, the four-fold dish of the reference stills. Folds sets how many wedges; Kaleido Spin turns the rig, and runs backwards below zero; Kaleido Zoom decides how much of the plate feeds each wedge — pulled in, a few enormous shapes, and taken out to the rim, something fine and busy. All three ride a fader.
        </Info>
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[13px] font-medium text-text">Folds</div>
            {pins && <PinChips settingKey="kaleidoscope" />}
          </div>
          <div className="grid grid-cols-5 gap-1" data-testid="kaleido-folds">
            {[0, 2, 4, 6, 8].map((k) => (
              <button
                aria-pressed={Math.round(settings.kaleidoscope ?? 0) === k}
                key={k}
                onClick={() => onUpdate({ kaleidoscope: k })}
                className={`py-1.5 rounded-lg text-[13px] font-medium border transition-all ${
                  Math.round(settings.kaleidoscope ?? 0) === k ? LIT : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
                title={k === 0 ? 'No mirror rig' : `${k} mirrored wedges`}
                data-testid={`kaleido-folds-${k}`}
              >
                {k === 0 ? 'Off' : `${k}×`}
              </button>
            ))}
          </div>
        </div>
        <Slider
          label="Kaleido Spin"
          value={settings.kaleidoSpin ?? 0}
          min={-0.5}
          max={0.5}
          step={0.005}
          onChange={(v: number) => onUpdate({ kaleidoSpin: v })}
          settingKey="kaleidoSpin"
          disabled={Math.round(settings.kaleidoscope ?? 0) < 2 && 'needs a fold count above Off'}
        />
        <Slider
          label="Kaleido Zoom"
          value={settings.kaleidoZoom ?? 0.72}
          min={0.2}
          max={1.6}
          step={0.01}
          onChange={(v: number) => onUpdate({ kaleidoZoom: v })}
          settingKey="kaleidoZoom"
          disabled={Math.round(settings.kaleidoscope ?? 0) < 2 && 'needs a fold count above Off'}
        />
      </section>
      )}
    </>
  );
};

export const TiltSection = ({ c }: { c: SectionCtx }) => {
  const { settings, onUpdate, focusSection, keep, shown, CARD, GRID, TITLE } = c;
  return (
    <>

      {/* Tilt & Rock Section */}
      {keep('tilt') && (
      <section id="settings-tilt" className={`${CARD} ${shown('tilt') ? GRID : 'hidden'} ${focusSection === 'tilt' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('tilt')} data-section="tilt">
        <h3 className={TITLE}>
          <Waves size={12} /> Tilt & Rock
        </h3>
        {/* The dish tipped: held by a hand (Gravity, Tilt Direction), sloshed by the music (Slosh) and rocked on the beat (Plate Rock). PLAN 35c. */}
        {/* And the hand itself, which moves the two faders under it and puts them back on letting go (PLAN 18a-13j). */}
        <div className="col-span-full flex items-center gap-3">
          <TipPad settings={settings} onSetting={onUpdate} size={84} testId="tilt-tip-pad" />
          <p className="min-w-0 text-[12px] leading-snug text-muted">Drag the dot toward an edge: that edge goes down and the liquid runs to it. Let go and the dish lies back, and the liquid sloshes past the middle. A first grab turns Slosh up to half if it was off.</p>
        </div>
        <Slider
          label="Gravity"
          value={settings.plateUpright ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ plateUpright: v })}
          settingKey="plateUpright"
        />
        <Slider
          label="Tilt Direction"
          value={settings.tiltDirection ?? 180}
          min={0}
          max={360}
          step={5}
          onChange={(v: number) => onUpdate({ tiltDirection: v })}
          settingKey="tiltDirection"
        />
        <Slider
          label="Slosh"
          value={settings.slosh ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ slosh: v })}
          settingKey="slosh"
        />
        <Slider
          label="Plate Rock"
          value={settings.plateRock ?? 0.45}
          min={0}
          max={3}
          step={0.05}
          onChange={(v: number) => onUpdate({ plateRock: v })}
          settingKey="plateRock"
        />
      </section>
      )}
    </>
  );
};

export const SpinSection = ({ c }: { c: SectionCtx }) => {
  const { settings, onUpdate, spinBpm, focusSection, onFlickPlate, keep, shown, CARD, GRID, TITLE } = c;
  return (
    <>

      {/*
        The plate turning. Rotation Speed, the flick, Auto Spin and everything
        that steers them were the first half of Plates & LED, a Stage panel,
        which keeps a panel out of Build and Gig: the dish's spin is a motion
        the hand rides in a set, so it is Motion's and findable there (PLAN
        35c-2). Plates & LED keeps what is the rig's: how many plates, how
        they blend, and the LED platform under them.
      */}
      {keep('spin') && (
      <section id="settings-spin" className={`${CARD} ${shown('spin') ? GRID : 'hidden'} ${focusSection === 'spin' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('spin')} data-section="spin">
        <h3 className={TITLE}>
          <RotateCw size={12} /> Plate Spin
        </h3>
        <Slider
          label="Rotation Speed"
          value={settings.rotationSpeed}
          min={0}
          max={1.3}
          step={0.05}
          onChange={(v: number) => onUpdate({ rotationSpeed: v })}
          settingKey="rotationSpeed"
        />
        {/*
          The plate as a flywheel.

          Rotation Speed above is a motor: it asks for a speed and the plate
          holds it. Most presets set it low, a turn every few minutes or hours,
          and a few music looks turn visibly (acid-trip once every twenty
          seconds) since the motor's stir in the middle became the dish's turn
          (PLAN 22j). A flick is the other thing a
          plate does — spun by hand and left to slow down — so it is a press
          and not a value, and it goes to one plate at a time because the two
          turn opposite ways and shearing them by hand is the point.

          Both are on pads too, as Spin Front Plate and Spin Back Plate.
        */}
        <div className="flex gap-2 mt-1 mb-2">
          {[0, 1].map((l) => (
            <button
              key={l}
              onClick={() => onFlickPlate?.(l)}
              disabled={!onFlickPlate || (settings.layerCount ?? 1) <= l}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white/80
                         hover:bg-white/10 hover:border-white/30 active:bg-white/20 transition-all
                         disabled:opacity-35 disabled:hover:bg-white/5 disabled:cursor-not-allowed"
              data-testid={`flick-plate-${l}`}
              title={(settings.layerCount ?? 1) <= l
                ? 'This look has one plate'
                : 'Spin this plate up; it slows on its own'}
            >
              Flick {l === 0 ? 'Front' : 'Back'}
            </button>
          ))}
        </div>
        {/*
          Auto Spin (PLAN §22): the dish turned by a motor of its own, at a
          rate or at the tempo. Stepped like Spin Direction, since it is three
          answers. The Rate is signed: its sign is the way round, and Reverse
          flips it (a pad can too, as Reverse Spin), so reversing a dish in
          the middle of a song is one press and not a trip to a slider.
        */}
        {/*
          The platter's strobe rim (PLAN 35f): a ring of dots that drifts at
          the dish's speed in Rate and stands still in Tempo once a tempo is
          heard, because the dish then turns exactly one dot a beat.
        */}
        <div className="mb-1 flex items-center gap-3" data-testid="spin-strobe">
          <StrobeRing mode={settings.spinAuto ?? 0} rpm={settings.spinRpm ?? 6} beats={settings.spinBeats ?? 16} bpm={spinBpm} />
          <p className="text-[11px] leading-snug text-white/50" data-testid="spin-strobe-says">
            {Math.round(settings.spinAuto ?? 0) === 2 && spinBpm > 0
              ? `Locked to ${spinBpm} bpm: the dots stand still while the dish turns once in ${Math.round(settings.spinBeats ?? 16)} beats.`
              : Math.round(settings.spinAuto ?? 0) === 0 ? 'Auto Spin is off.'
              : `Turning at ${Math.abs(settings.spinRpm ?? 6).toFixed(1)} rpm${Math.round(settings.spinAuto ?? 0) === 2 ? ' until a tempo is heard' : ''}.`}
          </p>
        </div>
        <Slider
          label={`Auto Spin — ${SPIN_AUTO_NAMES[Math.max(0, Math.min(2, Math.round(settings.spinAuto ?? 0)))]}`}
          value={settings.spinAuto ?? 0}
          min={0}
          max={2}
          step={1}
          onChange={(v: number) => onUpdate({ spinAuto: Math.round(v) })}
          settingKey="spinAuto"
        />
        <Slider
          label={`Spin Rate — ${(settings.spinRpm ?? 6).toFixed(1)} rpm`}
          value={settings.spinRpm ?? 6}
          min={-45}
          max={45}
          step={0.5}
          onChange={(v: number) => onUpdate({ spinRpm: v })}
          settingKey="spinRpm"
        />
        <Slider
          label={`Beats a Turn — ${Math.round(settings.spinBeats ?? 16)}`}
          value={settings.spinBeats ?? 16}
          min={1}
          max={64}
          step={1}
          onChange={(v: number) => onUpdate({ spinBeats: Math.round(v) })}
          settingKey="spinBeats"
        />
        <div className="flex gap-2 mt-1 mb-2">
          <button
            onClick={() => onUpdate({ spinRpm: -(settings.spinRpm ?? 6) })}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white/80
                       hover:bg-white/10 hover:border-white/30 active:bg-white/20 transition-all"
            data-testid="spin-reverse"
            title="Turn Auto Spin the other way round"
          >
            Reverse Spin
          </button>
        </div>
        <p className="mb-2 mt-1 text-[11px] leading-relaxed text-white/40">
          The dish turns and the liquid follows it: water lags for a few seconds, oil goes at once,
          and a fast dish flings the heavy colour outward. Tempo turns once every so many beats,
          locked to the beat; with no beat heard yet it turns at the Rate.
        </p>
        {/*
          Which way, how steadily, and what drives it.

          Direction is stepped rather than swept because there are three
          answers and none of them is "0.4 of the way anticlockwise". Opposed
          is the default and is what every look did before there was a choice.
        */}
        <Slider
          label={`Spin Direction — ${
            (settings.spinDirection ?? 0) > 0.5 ? 'all clockwise'
              : (settings.spinDirection ?? 0) < -0.5 ? 'all anticlockwise'
              : 'plates opposed'}`}
          value={settings.spinDirection ?? 0}
          min={-1}
          max={1}
          step={1}
          onChange={(v: number) => onUpdate({ spinDirection: Math.round(v) })}
          settingKey="spinDirection"
        />
        <Slider
          label="Spin Wander"
          value={settings.spinWander ?? 0}
          min={0}
          max={1}
          step={0.01}
          onChange={(v: number) => onUpdate({ spinWander: v })}
          settingKey="spinWander"
        />
        <p className="mb-2 mt-1 text-[11px] leading-relaxed text-white/40">
          Wander drifts the motor off its speed. Past about half it crosses zero and the plate
          turns back on itself now and then, the way a dish nudged by hand does.
        </p>
        {/*
          The audio route was reachable from a preset file and nowhere else.

          `audioMappings.rotation` has accepted a feature since long before
          this, and every shipped look sets it to 'none', so the one way to
          turn a plate with the bass was to write a look by hand. That is the
          same fault as a control hidden behind a mode: built, wired, and not
          reachable by anyone using the app.
        */}
        <label className="mb-3 flex items-center gap-2 text-[12px] text-white/60">
          <span className="w-28 shrink-0">Driven by</span>
          <select
            value={settings.audioMappings?.rotation ?? 'none'}
            onChange={(e) => onUpdate({
              audioMappings: { ...settings.audioMappings, rotation: e.target.value as AudioFeature },
            })}
            className="flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-white/85"
            data-testid="spin-audio-route"
            title="Turn the plates with the music: the chosen band adds to whatever the motor is already asking for"
          >
            {/* The one list, not a second copy of it: a feature added there
                but not here is a route nobody can reach. */}
            <option value="none">nothing — the motor only</option>
            {AUDIO_FEATURES.map(([f, name]) => <option key={f} value={f}>{name}</option>)}
          </select>
        </label>
        <Slider
          label="Spin From Music"
          value={settings.spinAudioDepth ?? 0}
          min={0}
          max={1}
          step={0.01}
          onChange={(v: number) => onUpdate({ spinAudioDepth: v })}
          settingKey="spinAudioDepth"
        />
        <Slider
          label="Flick Strength"
          value={settings.spinImpulse ?? 0.5}
          min={0}
          max={2}
          step={0.05}
          onChange={(v: number) => onUpdate({ spinImpulse: v })}
          settingKey="spinImpulse"
        />
        <Slider
          label="Plate Drag"
          value={settings.spinDrag ?? 0.25}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ spinDrag: v })}
          settingKey="spinDrag"
        />
      </section>
      )}
    </>
  );
};

export const PhysicsSection = ({ c }: { c: SectionCtx }) => {
  const { settings, onUpdate, focusSection, keep, shown, CARD, GRID, TITLE } = c;
  return (
    <>

      {/* Fluid Physics Section */}
      {keep('physics') && (
      <section id="settings-physics" className={`${CARD} ${shown('physics') ? GRID : 'hidden'} ${focusSection === 'physics' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('physics')} data-section="physics">
        <h3 className={TITLE}>
          <Zap size={12} /> Fluid Physics
        </h3>
        {/*
          0.0002, not 0.001. Dye diffusion costs 1.34 ms of a solver step and
          takes structure out of the plate — measured on one running plate,
          switching it off moved hard edges from 11.1% of pixels to 13.1% and
          the frame from 36.8 ms to 32.9 (docs/webgpu-plan.md). Above the new
          ceiling it was buying nothing anybody wanted. A ceiling rather than
          a switch, because some looks do lean on a little of it.
        */}
        <Slider
          label="Diffusion Rate"
          value={settings.diffusionRate}
          min={0}
          max={0.0002}
          step={0.00001}
          onChange={(v: number) => onUpdate({ diffusionRate: v })}
          settingKey="diffusionRate"
        />
        <Slider
          label="Buoyancy"
          value={settings.buoyancy}
          min={0}
          max={2.0}
          step={0.1}
          onChange={(v: number) => onUpdate({ buoyancy: v })}
          settingKey="buoyancy"
        />
        <Slider
          label="Advection"
          value={settings.advection}
          min={0}
          max={2.0}
          step={0.1}
          onChange={(v: number) => onUpdate({ advection: v })}
          settingKey="advection"
        />
        {/*
          "Momentum", not "Damping (Friction)": this is how much velocity
          survives each step, so up means more of the motion is kept — less
          friction, the opposite of what the old label promised.
        */}
        <Slider
          label="Momentum"
          value={settings.damping}
          min={0.8}
          max={1.0}
          step={0.01}
          onChange={(v: number) => onUpdate({ damping: v })}
          settingKey="damping"
        />
        {/*
          Heat Slide, as was: two knobs on a panel of their own until the owner
          asked for no setting to sit alone (2026-10-10). The heat they set is
          the heat Heat Spread spreads and Buoyancy lifts.
        */}
        {/* Heat Intensity and Boiling Point were here: nothing in either solver
            read them. The keys stay in saved looks; the sliders are gone. */}
        {/* 0–0.08: the looks run from 0.0015 to 0.06, and the old 0–1 slider's
            first step (0.05) was seventeen times the default. */}
        <Slider
          label="Evaporation Rate"
          value={settings.evaporationRate}
          min={0}
          max={0.5}
          step={0.0005}
          onChange={(v: number) => onUpdate({ evaporationRate: v })}
          settingKey="evaporationRate"
        />
        <Slider
          label="Heat Decay"
          value={settings.heatDecay}
          min={0.8}
          max={1.0}
          step={0.01}
          onChange={(v: number) => onUpdate({ heatDecay: v })}
          settingKey="heatDecay"
        />
        <Slider
          label="Swirl"
          value={settings.vorticityConfinement ?? 0}
          min={0}
          max={2}
          step={0.05}
          onChange={(v: number) => onUpdate({ vorticityConfinement: v })}
          settingKey="vorticityConfinement"
        />
        <Slider
          label="Dye Weight"
          value={settings.solutalBuoyancy ?? 0}
          min={0}
          max={2}
          step={0.05}
          onChange={(v: number) => onUpdate({ solutalBuoyancy: v })}
          settingKey="solutalBuoyancy"
        />
        <Slider
          label="Heat Spread"
          value={settings.doubleDiffusion ?? 0}
          min={0}
          max={2}
          step={0.05}
          onChange={(v: number) => onUpdate({ doubleDiffusion: v })}
          settingKey="doubleDiffusion"
        />
      </section>
      )}
    </>
  );
};

export const AutomationSection = ({ c }: { c: SectionCtx }) => {
  const { settings, onUpdate, focusSection, keep, shown, CARD, GRID, TITLE } = c;
  return (
    <>

      {/* Automation Section */}
      {keep('automation') && (
      <section id="settings-automation" className={`${CARD} ${shown('automation') ? GRID : 'hidden'} ${focusSection === 'automation' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('automation')} data-section="automation">
        <h3 className={TITLE}>
          <Hourglass size={12} /> Automation
        </h3>
        <Slider
          label="Evolve Speed"
          value={settings.automateRate}
          min={0}
          max={3}
          step={0.05}
          onChange={(v: number) => onUpdate({ automateRate: v })}
          settingKey="automateRate"
        />
        {/*
          Surge shapes the automation into gusts with quiet between, which is
          what a dish being worked on actually looks like — a pour, twenty
          seconds of watching it spread, then a press. Every preset sets it,
          between 0.12 and 0.95, and until now nothing on any surface could.
        */}
        <Slider
          label="Surge"
          value={settings.surge ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ surge: v })}
          settingKey="surge"
        />
        {/*
          Pacing is Surge's big brother, and lives beside it. Surge bunches the
          automation's small events into gusts; Pacing makes a running
          sequence's stages into scenes, with whole-plate moments, real rests
          and the light going down between them. It does nothing until a
          sequence is playing, so its 0 is today's show.
        */}
        <Slider
          label="Pacing"
          value={settings.pacing ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ pacing: v })}
          settingKey="pacing"
        />
        {/*
          Follow the Song lives under Pacing because it shapes Pacing's
          scenes: the drops open the big swells, builds and breakdowns hold
          them back (lib/scenePacing.ts). With Pacing at 0 there is no scene,
          so it is dimmed there rather than hidden: the pair reads as one.
        */}
        <div className={(settings.pacing ?? 0) > 0.001 ? '' : 'opacity-50'}>
          <Slider
            label="Follow the Song"
            value={settings.songFollow ?? 0}
            min={0}
            max={1.0}
            step={0.05}
            onChange={(v: number) => onUpdate({ songFollow: v })}
            settingKey="songFollow"
          />
        </div>
      </section>
      )}
    </>
  );
};
