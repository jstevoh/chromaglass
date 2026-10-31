import { FlaskConical, Magnet, Sliders, Droplets } from 'lucide-react';
import { groupOf } from '../../lib/settingsMap';
import { LIT } from '../ui';
import { ViscosityDrip } from '../ui/Playful';
import { Slider } from './controls';
import type { SectionCtx } from './props';

/*
  Chemistry: the liquid itself. The squish plate, oil and soap, the ferrofluid and
  the reactions.

  Each section is the markup that sat inline in `SettingsPanel`'s `sections` tree,
  moved verbatim (PLAN 19ai-9): its `{keep(id) && (<section ...>)}` is unchanged, so
  a desk panel, the Stage sheet and the full sheet draw it exactly as before, and
  it takes the panel's props and locals as one object (`SectionCtx`, in
  `props.ts`), destructuring only the names its markup reads. `npm run panel`
  reads this file with the panel (`scripts/settingsSource.mjs`).
*/
export const SquishSection = ({ c }: { c: SectionCtx }) => {
  const { settings, onUpdate, focusSection, keep, shown, CARD, GRID, TITLE } = c;
  return (
    <>

      {keep('squish') && (
      <section id="settings-squish" className={`${CARD} ${shown('squish') ? GRID : 'hidden'} ${focusSection === 'squish' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('squish')} data-section="squish">
        <h3 className={TITLE}>
          <Sliders size={12} /> Squish Plate
        </h3>
        {/*
          The two glasses and the film between them (PLAN 35c). What used to be
          one section of forty controls is five: this is the cell itself, how
          hard it is pressed, how it is shaped and how thin the gap is, and the
          liquid's own behaviour in it; the oil, the ferrofluid and the
          reactions each have a section beside it, and the tilt is Motion's.
        */}
        <Slider
          label="Plate Pressure"
          value={settings.platePressure}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ platePressure: v })}
          settingKey="platePressure"
        />
        {/*
          The two glasses themselves.

          Plate Shape is the dome the pair leaves at rest. Left of centre
          opens the gap in the middle and tightens it at the rim; right of
          centre does the opposite. Dead centre is two flats, which is what
          this was before and which no real plate is — and which is still the
          default, because a dome measured more inward flow than a flat plate
          and nothing yet measures what it buys.

          Press Lift is how long a press takes to come back up. It was fixed
          at a twelfth of a second, faster than a hand can move, which is
          most of why pressing did not feel like it did anything.
        */}
        <Slider
          label="Plate Shape"
          value={settings.plateCurve ?? 0}
          min={-1}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ plateCurve: v })}
          settingKey="plateCurve"
        />
        <Slider
          label="Depth Drag"
          value={settings.depthDrag ?? 0}
          min={0}
          max={3}
          step={0.05}
          onChange={(v: number) => onUpdate({ depthDrag: v })}
          settingKey="depthDrag"
        />
        {/*
          The plate as a Hele-Shaw cell (PLAN §18a): a switch on a slider's
          two stops, as Layers is, so a MIDI button and a desk can hold it
          too. Thickness is how long a push lasts in it, so it only shows
          while it is on.
        */}
        <Slider
          label="Thin Gap"
          value={settings.thinGap ?? 1}
          min={0}
          max={1}
          step={1}
          onChange={(v: number) => onUpdate({ thinGap: v })}
          settingKey="thinGap"
        />
        {(settings.thinGap ?? 1) > 0.5 && (
          <Slider
            label="Thickness"
            value={settings.gapThickness ?? 0.45}
            min={0}
            max={1}
            step={0.05}
            onChange={(v: number) => onUpdate({ gapThickness: v })}
            settingKey="gapThickness"
          />
        )}
        <Slider
          label="Press Lift"
          value={settings.plateSpring ?? 0.35}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ plateSpring: v })}
          settingKey="plateSpring"
        />
        <Slider
          label="Glass Smear"
          value={settings.glassSmear}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ glassSmear: v })}
          settingKey="glassSmear"
        />
        <Slider
          label="Rain Drip"
          value={settings.rainDrip}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ rainDrip: v })}
          settingKey="rainDrip"
        />
        <div className="flex flex-col gap-2 mb-4">
          <span className="text-[13px] font-medium text-text">Viscosity</span>
          <div className="flex gap-2 p-1 bg-white/5 rounded-lg">
            {(['thick', 'thin'] as const).map((v) => (
              <button
                aria-pressed={settings.viscosity === v}
                key={v}
                onClick={() => onUpdate({ viscosity: v })}
                title={v === 'thick' ? 'A light oil, 20 times water\'s viscosity. Hover to watch a drop fall through it.' : 'Water. Hover to watch a drop fall through it.'}
                className={`flex flex-1 items-center justify-center gap-1.5 py-1 text-[12px] rounded-md transition-all ${
                  settings.viscosity === v ? `${LIT} font-bold` : 'text-muted hover:bg-hover'
                }`}
              >
                {/* A drop that lets go at the pace of this viscosity (PLAN 35e, lib/dripPace.ts). */}
                <ViscosityDrip mode={v} />
                {v}
              </button>
            ))}
          </div>
        </div>
      </section>
      )}
    </>
  );
};

export const OilSection = ({ c }: { c: SectionCtx }) => {
  const { settings, onUpdate, focusSection, keep, shown, CARD, GRID, TITLE } = c;
  return (
    <>

      {/* Oil & Soap Section */}
      {keep('oil') && (
      <section id="settings-oil" className={`${CARD} ${shown('oil') ? GRID : 'hidden'} ${focusSection === 'oil' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('oil')} data-section="oil">
        <h3 className={TITLE}>
          <Droplets size={12} /> Oil & Soap
        </h3>
        {/* What keeps one liquid out of another: surface tension, soap, and how polar each liquid is (PLAN 35c). */}
        <Slider
          label="Oil Tension"
          value={settings.oilTension ?? 0}
          min={0}
          max={3}
          step={0.05}
          onChange={(v: number) => onUpdate({ oilTension: v })}
          settingKey="oilTension"
        />
        {/* Each liquid keeps its own colour: needs Oil Tension, which is what puts oil on the plate. */}
        <Slider
          label="Oil Bodies"
          value={settings.oilBodies ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ oilBodies: v })}
          settingKey="oilBodies"
        />
        {/* The water film between two drops holds them apart (FILM_WGSL): needs Oil Tension too. */}
        <Slider
          label="Film Hold"
          value={settings.filmHold ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ filmHold: v })}
          settingKey="filmHold"
        />
        <Slider
          label="Soap Bursts"
          value={settings.surfactantFlow ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ surfactantFlow: v })}
          settingKey="surfactantFlow"
        />
        {/*
          A clear oil film against the glass that tears into lace (PLAN §20b):
          how thick it is laid. Thin tears at once over the dish's dust, thick
          holds until alcohol or soap lands on it. White only on Lamp Ground.
        */}
        <Slider
          label="Clear Film"
          value={settings.clearFilm ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ clearFilm: v })}
          settingKey="clearFilm"
        />
        <Slider
          label="Polarity (Repulsion)"
          value={settings.polarity}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ polarity: v })}
          settingKey="polarity"
        />
      </section>
      )}
    </>
  );
};

export const FerroSection = ({ c }: { c: SectionCtx }) => {
  const { settings, onUpdate, focusSection, keep, shown, CARD, GRID, TITLE } = c;
  return (
    <>

      {/* Ferrofluid Section */}
      {keep('ferro') && (
      <section id="settings-ferro" className={`${CARD} ${shown('ferro') ? GRID : 'hidden'} ${focusSection === 'ferro' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('ferro')} data-section="ferro">
        <h3 className={TITLE}>
          <Magnet size={12} /> Ferrofluid
        </h3>
        {/*
          The second phase and the magnet under the glass (H7).

          Ferrofluid is a heavy liquid that will not mix with the dye and that
          a magnet can pull. The shapes are not drawn: spikes, labyrinths,
          lattices and chains fall out of a surface tension on one side and a
          magnetic pull on the other, and which one you get is a matter of how
          close and how strong the magnet is. Domain Size carries the whole
          look from beads, through cells, to hand-sized bodies.

          Ferrofluid is 0 on every existing look, so nothing changes until it
          is asked for.
        */}
        <Slider
          label="Ferrofluid"
          value={settings.phaseAmount ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ phaseAmount: v })}
          settingKey="phaseAmount"
        />
        <Slider
          label="Domain Size"
          value={settings.phaseScale ?? 0.4}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ phaseScale: v })}
          settingKey="phaseScale"
        />
        <Slider
          label="Phase Edge"
          value={settings.phaseSharp ?? 0.35}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ phaseSharp: v })}
          settingKey="phaseSharp"
        />
        {/* The ferrofluid moving the colour it moves through: at 0 the black
            is drawn over still dye, as Ferro Paint's references never are. */}
        <Slider
          label="Pushes Dye"
          value={settings.phaseDisplace ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ phaseDisplace: v })}
          settingKey="phaseDisplace"
        />
        <Slider
          label="Magnet Strength"
          value={settings.magnetStrength ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ magnetStrength: v })}
          settingKey="magnetStrength"
        />
        {/* Height is the control that matters most: close is a hard narrow
            pull, lifted away is broad and weak. */}
        <Slider
          label="Magnet Height"
          value={settings.magnetHeight ?? 0.25}
          min={0.02}
          max={1}
          step={0.02}
          onChange={(v: number) => onUpdate({ magnetHeight: v })}
          settingKey="magnetHeight"
        />
        {/* The Magnet tool's own size (lib/magnetSize.ts): a coin at the
            left, a palm at the right, the tool as it always was in the
            middle. The same field over it, reaching further across. */}
        <Slider
          label="Magnet Size"
          value={settings.magnetSize ?? 0.5}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ magnetSize: v })}
          settingKey="magnetSize"
        />
        <Slider
          label="Magnet Across"
          value={settings.magnetX ?? 0.5}
          min={0}
          max={1}
          step={0.02}
          onChange={(v: number) => onUpdate({ magnetX: v })}
          settingKey="magnetX"
        />
        <Slider
          label="Magnet Up"
          value={settings.magnetY ?? 0.5}
          min={0}
          max={1}
          step={0.02}
          onChange={(v: number) => onUpdate({ magnetY: v })}
          settingKey="magnetY"
        />
        {/* The hand moving the magnet around under the dish, slowly, faster
            with the music. Evolve starts it on any ferrofluid look. */}
        <Slider
          label="Magnet Walk"
          value={settings.magnetWalk ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ magnetWalk: v })}
          settingKey="magnetWalk"
        />
        <Slider
          label="Labyrinth"
          value={settings.ferroLabyrinth ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ ferroLabyrinth: v })}
          settingKey="ferroLabyrinth"
        />
        <Slider
          label="Maze Detail"
          disabled={(settings.ferroLabyrinth ?? 0) <= 0.001 && 'needs Labyrinth above 0'}
          value={settings.mazeDetail ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ mazeDetail: v })}
          settingKey="mazeDetail"
        />
      </section>
      )}
    </>
  );
};

export const ReactionsSection = ({ c }: { c: SectionCtx }) => {
  const { settings, onUpdate, focusSection, keep, shown, CARD, GRID, TITLE } = c;
  return (
    <>

      {/* Reactions Section */}
      {keep('reactions') && (
      <section id="settings-reactions" className={`${CARD} ${shown('reactions') ? GRID : 'hidden'} ${focusSection === 'reactions' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('reactions')} data-section="reactions">
        <h3 className={TITLE}>
          <FlaskConical size={12} /> Reactions
        </h3>
        {/*
          The chemistry that draws by itself on the plate: the indicator that
          changes colour with the acid, the oscillating reaction, the rings a
          reagent leaves in a gel, and the Turing pattern (spots to labyrinth)
          and its print. The last six were in Lamp & Light, under the lamp
          they were thought to colour, and are in the group they belong to now
          (PLAN 35c).
        */}
        <Slider
          label="pH Indicator"
          value={settings.phIndicator ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ phIndicator: v })}
          settingKey="phIndicator"
        />
        <Slider
          label="BZ Reaction"
          value={settings.bzReaction ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ bzReaction: v })}
          settingKey="bzReaction"
        />
        <Slider
          label="Liesegang Rings"
          value={settings.liesegang ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ liesegang: v })}
          settingKey="liesegang"
        />
        <Slider
          label="Chemistry"
          value={settings.chemistry ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ chemistry: v })}
          settingKey="chemistry"
        />
        <Slider
          label="↳ Pattern (Spots to Labyrinth)"
          value={settings.chemistryPattern ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ chemistryPattern: v })}
          settingKey="chemistryPattern"
        />
        <Slider
          label="↳ Pattern Width"
          value={settings.chemistryWidth ?? 0.5}
          min={0.1}
          max={1.0}
          step={0.01}
          onChange={(v: number) => onUpdate({ chemistryWidth: v })}
          settingKey="chemistryWidth"
        />
        <Slider
          label="↳ Turing Print"
          value={settings.turingPrint ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ turingPrint: v })}
          settingKey="turingPrint"
        />
        <Slider
          label="↳ Print Ink (0 is Starch)"
          value={settings.turingInk ?? 0}
          min={0}
          max={1.0}
          step={0.01}
          onChange={(v: number) => onUpdate({ turingInk: v })}
          settingKey="turingInk"
        />
        <Slider
          label="↳ Print Drift (0 is Still)"
          value={settings.turingDrift ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ turingDrift: v })}
          settingKey="turingDrift"
        />
      </section>
      )}
    </>
  );
};
