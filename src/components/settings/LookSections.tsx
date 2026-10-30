import { Palette, Microscope, Film, Clapperboard, Lightbulb, Aperture } from 'lucide-react';
import { VisualizerSettings } from '../../types';
import { groupOf } from '../../lib/settingsMap';
import { Info } from '../Info';
import { Segmented, LIT } from '../ui';
import { Slider } from './controls';
import type { SectionCtx } from './props';

/*
  Look: what the light does to the picture. The look, the show, the lens, the film
  stock, the lamp and the macro closeup.

  Each section is the markup that sat inline in `SettingsPanel`'s `sections` tree,
  moved verbatim (PLAN 19ai-9): its `{keep(id) && (<section ...>)}` is unchanged, so
  a desk panel, the Stage sheet and the full sheet draw it exactly as before, and
  it takes the panel's props and locals as one object (`SectionCtx`, in
  `props.ts`), destructuring only the names its markup reads. `npm run panel`
  reads this file with the panel (`scripts/settingsSource.mjs`).
*/
export const LookSection = ({ c }: { c: SectionCtx }) => {
  const { settings, onUpdate, backLook, focusSection, keep, shown, CARD, GRID, TITLE } = c;
  return (
    <>

      {/* Light Show Look Section */}
      {keep('look') && (
      <section id="settings-look" className={`${CARD} ${shown('look') ? GRID : 'hidden'} ${focusSection === 'look' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('look')} data-section="look">
        <h3 className={TITLE}>
          <Palette size={12} /> Light Show Look
        </h3>
        <Slider
          label="Turbulence Scale"
          value={settings.turbulenceScale}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ turbulenceScale: v })}
          settingKey="turbulenceScale"
        />
        <Slider
          label="Turbulence Detail"
          value={settings.turbulenceDetail}
          min={1}
          max={4}
          step={1}
          onChange={(v: number) => onUpdate({ turbulenceDetail: Math.round(v) })}
          settingKey="turbulenceDetail"
        />
        <Slider
          label="Sharpness"
          value={settings.sharpness ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ sharpness: v })}
          settingKey="sharpness"
        />
        {/*
          Dye carried by particles (H1). The grid keeps the body of colour and
          these add the structure a grid cannot hold, so it reads as detail
          appearing rather than as a different plate — and at 0 the solver
          allocates none of them, which is where every look made before this
          sits.
        */}
        <Slider
          label="Dye Particles"
          value={settings.particles ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ particles: v })}
          settingKey="particles"
        />
        <Slider
          label="Particle Colour"
          disabled={(settings.particles ?? 0) <= 0.001 && 'needs Dye Particles above 0'}
          value={settings.particleMix ?? 0.6}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ particleMix: v })}
          settingKey="particleMix"
        />
        <Slider
          label="Granulation"
          value={settings.granulation ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ granulation: v })}
          settingKey="granulation"
        />
        {/* "Fineness", not "Size": the number is grain cells across the
            plate, so up is finer grain, not bigger. */}
        <Slider
          label="Grain Fineness"
          disabled={(settings.granulation ?? 0) <= 0.002 && 'needs Granulation above 0'}
          value={settings.grainScale ?? 320}
          min={60}
          max={900}
          step={20}
          onChange={(v: number) => onUpdate({ grainScale: v })}
          settingKey="grainScale"
        />
        <Slider
          label="Blob Surface Tension"
          value={settings.blobSurfaceTension}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ blobSurfaceTension: v })}
          settingKey="blobSurfaceTension"
        />
        <Slider
          label="Dye Budget"
          value={settings.dyeBudget ?? 0.85}
          min={0.1}
          max={1.2}
          step={0.05}
          onChange={(v: number) => onUpdate({ dyeBudget: v })}
          settingKey="dyeBudget"
        />
        <Slider
          label="Edge Relief"
          value={settings.edgeRelief ?? 0.4}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ edgeRelief: v })}
          settingKey="edgeRelief"
        />
        <Slider
          label="Projector Focus"
          value={settings.projectorFocus ?? 0.5}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ projectorFocus: v })}
          settingKey="projectorFocus"
        />
        <Slider
          label="Lacing"
          value={settings.lacing ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ lacing: v })}
          settingKey="lacing"
        />
        <Slider
          label="Bubbles"
          value={settings.bubbles ?? 0.5}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ bubbles: v })}
          settingKey="bubbles"
        />
        <Slider
          label="Frame Sway"
          value={settings.frameSway ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ frameSway: v })}
          settingKey="frameSway"
        />
        <Slider
          label="Layer Scale Variety"
          disabled={(settings.layerCount ?? 1) < 2 && !backLook && 'needs 2 Layers'}
          value={settings.layerScaleVariety ?? 0.5}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ layerScaleVariety: v })}
          settingKey="layerScaleVariety"
        />
        <Slider
          label="Boundary Glow"
          value={settings.boundaryContrast}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ boundaryContrast: v })}
          settingKey="boundaryContrast"
        />
        <Slider
          label="Saturation"
          value={settings.saturationBoost}
          min={0.5}
          max={2.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ saturationBoost: v })}
          settingKey="saturationBoost"
        />
        {/* How solid the colour reads: a tint the light shows through, or a body of colour. */}
        <Slider
          label="Colour Body"
          value={settings.colourBody ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ colourBody: v })}
          settingKey="colourBody"
        />
        {/* The plate printed as a comic: flat inks, black outlines, the tints in even dots. The Roy look's own control. */}
        <Slider
          label="Ben-Day Dots"
          value={settings.benDay ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ benDay: v })}
          settingKey="benDay"
        />
        <Slider
          label="Glossiness"
          value={settings.glossiness}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ glossiness: v })}
          settingKey="glossiness"
        />
        <Slider
          label="Post Blur"
          value={settings.postBlurRadius}
          min={0}
          max={1.5}
          step={0.05}
          onChange={(v: number) => onUpdate({ postBlurRadius: v })}
          settingKey="postBlurRadius"
        />
      </section>
      )}
    </>
  );
};

export const ShowSection = ({ c }: { c: SectionCtx }) => {
  const { settings, onUpdate, backLook, focusSection, keep, shown, CARD, GRID, TITLE } = c;
  return (
    <>

      {/* Show Section */}
      {keep('show') && (
      <section id="settings-show" className={`${CARD} ${shown('show') ? GRID : 'hidden'} ${focusSection === 'show' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('show')} data-section="show">
        <h3 className={TITLE}>
          <Clapperboard size={12} /> Show
        </h3>
        <Info>
          How the show moves over minutes, not seconds: the set walking its hues, the rhythm plate pressed on the kick, a slow loop behind the live plate, and the round dish and spread of the projected clock faces. The Show Sequencer scripts these over a song.
        </Info>
        <Slider
          label="Hue Journey (min/step)"
          value={settings.hueJourney ?? 0}
          min={0}
          max={10}
          step={0.5}
          onChange={(v: number) => onUpdate({ hueJourney: v })}
          settingKey="hueJourney"
        />
        <Slider
          label="Kick Bloom"
          value={settings.kickBloom ?? 1}
          min={0}
          max={1.5}
          step={0.05}
          onChange={(v: number) => onUpdate({ kickBloom: v })}
          settingKey="kickBloom"
        />
        <Slider
          label="Melody Walk"
          value={settings.melodyWalk ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ melodyWalk: v })}
          settingKey="melodyWalk"
        />
        <Info>
          Kick Bloom is the dye each kick throws outward from the bass spot. Melody Walk lets each note of a tune go as a drop, low notes on one side of the plate and high ones on the other, so a played line draws itself across it. Beat Squeeze presses a thin sheet on the liquid where the kick lands: a dent as wide as the sheet bends over this liquid, wide on thin oil, a fingertip on syrup. Plate Rock is the slow one: a hand tipping the dish on the one and three, the heavier colour running downhill each way.
        </Info>
        <Slider
          label="Beat Squeeze"
          value={settings.beatSqueeze ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ beatSqueeze: v })}
          settingKey="beatSqueeze"
        />
        <Slider
          label="Accent the One"
          value={settings.beatAccent ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ beatAccent: v })}
          settingKey="beatAccent"
        />
        <Info>
          Accent the One weighs each kick's squeeze and rock by where it falls in the bar: the one pressed hardest, three lighter, two, four and the offbeat left to the plate. The show counts the bar from the music as it plays; until it is sure, every kick lands alike. 0 is every kick alike.
        </Info>
        <Slider
          label="Fingering"
          value={settings.fingering ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ fingering: v })}
          settingKey="fingering"
        />
        <Info>
          A press (the tool, a finger, the pad) goes down round and comes up in fingers: as the glass lifts, the rim it pushed out breaks into radial fingers drawn back toward the centre, the Fillmore sunburst. 0 is a round press that lifts round.
        </Info>
        <Slider
          label="Oil Beads"
          value={settings.beads ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ beads: v })}
          settingKey="beads"
        />
        <Slider
          label="Drops"
          disabled={(settings.beads ?? 0) <= 0 && 'needs Oil Beads'}
          value={settings.beadDrops ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ beadDrops: v })}
          settingKey="beadDrops"
        />
        <Info>
          Drops turns the oil beads from dark-rimmed rings into drops of colour: each takes a dye from the look, is a lens over the liquid under it, presses flat against its neighbours, gathers a ring of droplets, and keeps a smaller drop it swallowed visible inside it.
        </Info>
        <Slider
          label="Plate Cells"
          value={settings.cells ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ cells: v })}
          settingKey="cells"
        />
        <Slider
          label="Background Loop"
          disabled={(settings.layerCount ?? 1) < 2 && !backLook && 'needs 2 Layers'}
          value={settings.backgroundLoop ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ backgroundLoop: v })}
          settingKey="backgroundLoop"
        />
        <Slider
          label="Round Dish"
          value={settings.dishVignette ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ dishVignette: v })}
          settingKey="dishVignette"
        />
        <Slider
          label="Dish Spread"
          value={settings.dishSpread ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ dishSpread: v })}
          settingKey="dishSpread"
        />
        <Info>
          Each layer its own dish, spread apart on a black screen the way two or three projectors overlap: the lead plate large and right of centre, the second smaller at the left.
        </Info>
      </section>
      )}
    </>
  );
};

export const CameraSection = ({ c }: { c: SectionCtx }) => {
  const { settings, onUpdate, focusSection, keep, shown, CARD, GRID, TITLE } = c;
  return (
    <>

      {/* Camera Section */}
      {keep('camera') && (
      <section id="settings-camera" className={`${CARD} ${shown('camera') ? GRID : 'hidden'} ${focusSection === 'camera' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('camera')} data-section="camera">
        <h3 className={TITLE}>
          <Aperture size={12} /> Lens
        </h3>
        <Info>
          The macro photograph instead of the projected show: a lit paper backdrop, dye as transmission, every drop a dome with a softbox in it, then a real lens over the picture — refraction, a focal plane, bloom, colour fringing, the sensor's roll-off.
        </Info>
        <div className="flex flex-col gap-2 mb-4">
          <div className="text-[13px] font-medium text-text">Render Style</div>
          <div className="grid grid-cols-2 gap-1">
            {(['show', 'photo'] as const).map((style) => (
              <button
                aria-pressed={(settings.renderStyle ?? 'show') === style}
                key={style}
                onClick={() => onUpdate({ renderStyle: style })}
                className={`py-1.5 rounded-lg text-[13px] font-medium border transition-all ${
                  (settings.renderStyle ?? 'show') === style ? LIT : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
                title={style === 'show' ? 'The projected light show: dye as light on black' : 'The photograph: dye over lit paper'}
                data-testid={`render-${style}`}
              >
                {style === 'show' ? 'Light show' : 'Photograph'}
              </button>
            ))}
          </div>
        </div>
        {(settings.renderStyle ?? 'show') === 'photo' && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            {(['paperA', 'paperB'] as const).map((key) => (
              <label key={key} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                <span className="text-[13px] font-medium opacity-60">{key === 'paperA' ? 'Paper A' : 'Paper B'}</span>
                <input
                  type="color"
                  value={settings[key] ?? '#000000'}
                  onChange={(e) => onUpdate({ [key]: e.target.value } as Partial<VisualizerSettings>)}
                  className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                />
              </label>
            ))}
          </div>
        )}
        {/*
          "Lens", not "Camera": the section is called Camera, the room has a
          camera and the film has one too, and this is none of them — it is
          how much of the photograph's lens is over the picture.
        */}
        <Slider label="Lens" value={settings.camera ?? 0} min={0} max={1.0} step={0.05} onChange={(v: number) => onUpdate({ camera: v })}
          settingKey="camera"
        />
        <Slider disabled={(settings.camera ?? 0) <= 0.001 && 'needs Lens above 0'} label="Focus" value={settings.focus ?? 0.5} min={0} max={1.0} step={0.05} onChange={(v: number) => onUpdate({ focus: v })}
          settingKey="focus"
        />
        <Slider disabled={(settings.camera ?? 0) <= 0.001 && 'needs Lens above 0'} label="Aperture" value={settings.aperture ?? 0} min={0} max={1.0} step={0.05} onChange={(v: number) => onUpdate({ aperture: v })}
          settingKey="aperture"
        />
        <Slider disabled={(settings.camera ?? 0) <= 0.001 && 'needs Lens above 0'} label="Bloom" value={settings.bloom ?? 0} min={0} max={1.0} step={0.05} onChange={(v: number) => onUpdate({ bloom: v })}
          settingKey="bloom"
        />
        <Slider disabled={(settings.camera ?? 0) <= 0.001 && 'needs Lens above 0'} label="Chromatic Aberration" value={settings.chromaticAberration ?? 0} min={0} max={1.0} step={0.05} onChange={(v: number) => onUpdate({ chromaticAberration: v })}
          settingKey="chromaticAberration"
        />
        <Slider disabled={(settings.camera ?? 0) <= 0.001 && 'needs Lens above 0'} label="Refraction" value={settings.refraction ?? 0} min={0} max={1.0} step={0.05} onChange={(v: number) => onUpdate({ refraction: v })}
          settingKey="refraction"
        />
        <Slider label="Micro-Droplets" value={settings.microDroplets ?? 0} min={0} max={1.0} step={0.05} onChange={(v: number) => onUpdate({ microDroplets: v })}
          settingKey="microDroplets"
        />
        <Slider label="Thin Film" value={settings.thinFilm ?? 0} min={0} max={1.0} step={0.05} onChange={(v: number) => onUpdate({ thinFilm: v })}
          settingKey="thinFilm"
        />
        {/* The film's colours: the rainbow at 0, as every look was made; a
            real soap film's at 1 (black where thinnest, straw, purple, blue,
            gold, washing out as it thickens), and on the plate the pale
            tint a projector throws through one. Thin Film and the bubbles'
            Iridescence both draw through it. */}
        <Slider label="Film Physics" value={settings.filmPhysics ?? 0} min={0} max={1.0} step={0.05} onChange={(v: number) => onUpdate({ filmPhysics: v })}
          settingKey="filmPhysics"
        />
      </section>
      )}
    </>
  );
};

export const StockSection = ({ c }: { c: SectionCtx }) => {
  const { settings, onUpdate, focusSection, keep, shown, CARD, GRID, TITLE } = c;
  return (
    <>

      {/* Film stock — what the whole show is photographed on (F1). */}
      {keep('stock') && (
      <section id="settings-stock" className={`${CARD} ${shown('stock') ? GRID : 'hidden'} ${focusSection === 'stock' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('stock')} data-section="stock">
        <h3 className={TITLE}>
          <Film size={12} /> Film Stock
        </h3>
        <Info>
          The texture of the era&apos;s projected film. Light shows ran 16mm loops and slides beside the liquid plates, all projected, and the plate itself sat on an overhead projector — so this is not a filter over the picture, it is what the picture was photographed on. A characteristic curve so highlights roll off instead of clipping, a per-channel dye crossover for the stock&apos;s cast, grain in three layers heaviest through the mid-tones, and a gate that wanders and has its own soft edge. The plate&apos;s own granulation gives way to it, so there is never two grains at once.
        </Info>
        <Slider
          label="Film Stock"
          value={settings.stock ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ stock: v })}
          settingKey="stock"
        />
        <div className="flex flex-col gap-2 mb-4">
          <span className="text-[11px] uppercase tracking-widest font-bold text-white/55">Stock</span>
          <div className="grid grid-cols-5 gap-1">
            {['16mm', 'Slide', 'Faded', 'Super 8', 'Mono'].map((name, i) => (
              <button
                aria-pressed={(settings.stockType ?? 0) === i}
                key={name}
                onClick={() => onUpdate({ stockType: i })}
                className={`py-2 rounded-lg text-[9px] uppercase tracking-wider font-bold border transition-colors ${
                  (settings.stockType ?? 0) === i ? LIT : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
                title={[
                  '16mm reversal: cool and saturated, with a hard shoulder',
                  'A slide stock: warm, deep blacks, a long shoulder',
                  'Faded sixties negative: magenta cast and lifted blacks',
                  'Super 8: soft, warm, and grainy enough that the grain is the look',
                  'Monochrome reversal, toned',
                ][i]}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        <Slider
          label="Grain"
          value={settings.stockGrain ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ stockGrain: v })}
          settingKey="stockGrain"
        />
        <Slider
          label="Grain Size"
          value={settings.stockGrainSize ?? 2}
          min={1}
          max={6}
          step={0.5}
          onChange={(v: number) => onUpdate({ stockGrainSize: v })}
          settingKey="stockGrainSize"
        />
        <Slider
          label="Gate Weave"
          value={settings.stockWeave ?? 0}
          min={0}
          max={3}
          step={0.1}
          onChange={(v: number) => onUpdate({ stockWeave: v })}
          settingKey="stockWeave"
        />
        <Slider
          label="Gate Edge"
          value={settings.stockGate ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ stockGate: v })}
          settingKey="stockGate"
        />
      </section>
      )}
    </>
  );
};

export const LampSection = ({ c }: { c: SectionCtx }) => {
  const { settings, onUpdate, focusSection, keep, shown, CARD, GRID, TITLE } = c;
  return (
    <>

      {/* Lamp & Light Section */}
      {keep('lamp') && (
      <section id="settings-lamp" className={`${CARD} ${shown('lamp') ? GRID : 'hidden'} ${focusSection === 'lamp' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('lamp')} data-section="lamp">
        <h3 className={TITLE}>
          <Lightbulb size={12} /> Lamp &amp; Light
        </h3>
        <Info>
          One lamp under the plate, and every material lit from where it sits: bubbles shaded as lenses with a caustic arc on the far side, dye rims bright toward the lamp and shadowed away from it. The lamp wanders, and rocks with the plate; a second lamp from the other side puts two lights across everything. Lamp Ground is what the dye is seen on: at 0 the dye glows on black, as a light show's slides always were drawn here; at 1 the lamp shines up through it, as a projector does, so clear liquid is the lamp's white and dense dye deepens and then goes dark.
        </Info>
        {/* The lamp under the dish shining up through the dye (PLAN 18b), or the dye as light on black. */}
        <Slider
          label="Lamp Ground"
          value={settings.lampGround ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ lampGround: v })}
          settingKey="lampGround"
        />
        <Slider
          label="Light Play"
          value={settings.lightPlay ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ lightPlay: v })}
          settingKey="lightPlay"
        />
        <Slider
          label="Lamp Motion"
          value={settings.lampMotion ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ lampMotion: v })}
          settingKey="lampMotion"
        />
        <Slider
          label="Hot-Spot"
          value={settings.lampHotspot ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ lampHotspot: v })}
          settingKey="lampHotspot"
        />
        <Slider
          label="Second Lamp"
          value={settings.secondLamp ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ secondLamp: v })}
          settingKey="secondLamp"
        />
        <Slider
          label="Iridescence"
          value={settings.iridescence ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ iridescence: v })}
          settingKey="iridescence"
        />
        {/*
          The other machines a crew stacked in front of the lamp.

          These were the back half of Projectors, after the corner pin and the
          masks: a section set once at load-in and then left alone, holding six
          controls that are ridden during a song. They colour the light, so
          they are here with the lamp rather than with the wall.
        */}
        <div className="mt-6 mb-3 text-[13px] font-medium text-text">The other machines</div>
        <Info>
          What else a light show crew stacked on the screen: Thomas Wilfred’s lumia rig, a reaction growing on the platen, a gel wheel turning over the lamp, and a sealed oil wheel’s halogen grade and exposure.
        </Info>
        <Slider
          label="Lumia"
          value={settings.lumia ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ lumia: v })}
          settingKey="lumia"
        />
        <Slider
          label="Gel Wheel"
          value={settings.gelWheel ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ gelWheel: v })}
          settingKey="gelWheel"
        />
        <Slider
          label="Gel Speed (rpm)"
          disabled={(settings.gelWheel ?? 0) <= 0.001 && 'needs Gel Wheel above 0'}
          value={settings.gelSpeed ?? 0.5}
          min={0}
          max={3}
          step={0.1}
          onChange={(v: number) => onUpdate({ gelSpeed: v })}
          settingKey="gelSpeed"
        />
        <Slider
          label="Lamp Warmth"
          value={settings.lampWarmth ?? 0}
          min={0}
          max={3.75}
          step={0.05}
          onChange={(v: number) => onUpdate({ lampWarmth: v })}
          settingKey="lampWarmth"
        />
        {/* How the lamp meets the dye: at 0 each dye is one flat colour at any
            depth; toward 1 the light goes through it, so thin washes are pale
            and thick pools deep, and overlaps darken. */}
        <Slider
          label="Light Through Dye"
          value={settings.transmission ?? 1}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ transmission: v })}
          settingKey="transmission"
        />
        <Slider
          label="Layer Depth"
          value={settings.thicknessOptics ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ thicknessOptics: v })}
          settingKey="thicknessOptics"
        />
        <Slider
          label="Spectral Mix"
          value={settings.spectralOptics ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ spectralOptics: v })}
          settingKey="spectralOptics"
        />
        <Slider
          label="Exposure"
          value={settings.exposure ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ exposure: v })}
          settingKey="exposure"
        />
      </section>
      )}
    </>
  );
};

export const MacroSection = ({ c }: { c: SectionCtx }) => {
  const { settings, onUpdate, focusSection, keep, shown, CARD, GRID, TITLE } = c;
  return (
    <>

      {/* Macro Closeup Section */}
      {keep('macro') && (
      <section id="settings-macro" className={`${CARD} ${shown('macro') ? GRID : 'hidden'} ${focusSection === 'macro' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('macro')} data-section="macro">
        <h3 className={TITLE}>
          <Microscope size={12} /> Macro Closeup
        </h3>
        {/*
          Zoom first, and never hidden.

          It used to sit behind the Bead Camera switch, so the slider a desk or
          a pin draws — which has no switch next to it — did nothing at all
          until somebody found this panel and turned the camera on. The zoom is
          the control: at 1 the frame is the whole plate, and pushing it in is
          the closeup arriving rather than a cut to it.
        */}
        <Slider
          label="Macro Zoom"
          value={settings.macroZoom ?? 1}
          min={1}
          max={16}
          step={0.1}
          onChange={(v: number) => onUpdate({ macroZoom: v, macroMode: v > 1.05 })}
          settingKey="macroZoom"
        />
        {(settings.macroZoom ?? 1) <= 1.05 && (
          <Info>
            At 1× this is the whole plate. Push the zoom in and the camera goes where it is aimed — the exposure,
            the depth of field and the surface under the dye all arrive with the magnification rather than switching on
            at a threshold. Everything below shapes that closeup and takes effect as you come in.
          </Info>
        )}
        {(settings.macroZoom ?? 1) > 1.05 && (
          <>
            {/*
              Who moves the camera. It used to be the camera alone: it picked a
              subject, held it a few seconds and cut to another, so a closeup
              could not be kept on anything. Now it goes where it is aimed
              (Hold), rides what it is aimed at (Follow), or roams (Auto).
              Alt-drag on the plate pans it and Alt-click fixes it on a spot;
              Random Evolve wanders the aim when it is on.
            */}
            <div className="mb-3">
              <div className="text-[12px] opacity-60 mb-1">Camera</div>
              <Segmented
                value={settings.macroCamera ?? 'hold'}
                options={[['hold', 'Hold'], ['follow', 'Follow'], ['auto', 'Auto']]}
                onChange={(v) => onUpdate({ macroCamera: v as 'hold' | 'follow' | 'auto' })}
              />
            </div>
            {(settings.macroCamera ?? 'hold') !== 'auto' && (
              <>
                <Slider
                  label="Macro Aim Across"
                  value={settings.macroAimX ?? 0.5}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v: number) => onUpdate({ macroAimX: v })}
          settingKey="macroAimX"
        />
                <Slider
                  label="Macro Aim Up"
                  value={settings.macroAimY ?? 0.5}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v: number) => onUpdate({ macroAimY: v })}
          settingKey="macroAimY"
        />
                <Info>
                  Alt-drag (Option-drag) on the plate pans the camera; Alt-click fixes it on the spot under the pointer.
                  {(settings.macroCamera ?? 'hold') === 'follow' ? ' Follow locks onto the liquid there and rides with it.' : ''}
                  {' '}With Random Evolve on, the aim wanders slowly.
                </Info>
              </>
            )}
            <Slider
              label="Chase Speed"
              value={settings.macroChase}
              min={0}
              max={1}
              step={0.05}
              onChange={(v: number) => onUpdate({ macroChase: v })}
          settingKey="macroChase"
        />
            {(settings.macroCamera ?? 'hold') === 'auto' && (
            <Slider
              label="Shot Length"
              value={settings.macroHold}
              min={1}
              max={15}
              step={0.5}
              onChange={(v: number) => onUpdate({ macroHold: v })}
          settingKey="macroHold"
        />
            )}
            <Slider
              label="Music Sync"
              value={settings.macroSync ?? 0.6}
              min={0}
              max={1}
              step={0.05}
              onChange={(v: number) => onUpdate({ macroSync: v })}
          settingKey="macroSync"
        />
            <Slider
              label="Paint Cells"
              value={settings.macroCells}
              min={0}
              max={1}
              step={0.05}
              onChange={(v: number) => onUpdate({ macroCells: v })}
          settingKey="macroCells"
        />
            <Slider
              label="Cell Size"
              value={settings.macroCellScale}
              min={0.15}
              max={1.5}
              step={0.05}
              onChange={(v: number) => onUpdate({ macroCellScale: v })}
          settingKey="macroCellScale"
        />
            <Slider
              label="Macro Lacing"
              value={settings.macroLacing}
              min={0}
              max={1}
              step={0.05}
              onChange={(v: number) => onUpdate({ macroLacing: v })}
          settingKey="macroLacing"
        />
            <Slider
              label="Depth / Focus"
              value={settings.macroDepth}
              min={0}
              max={1}
              step={0.05}
              onChange={(v: number) => onUpdate({ macroDepth: v })}
          settingKey="macroDepth"
        />
            <Slider
              label="Edge Detail"
              value={settings.macroEdgeDetail}
              min={0}
              max={1}
              step={0.05}
              onChange={(v: number) => onUpdate({ macroEdgeDetail: v })}
          settingKey="macroEdgeDetail"
        />
            <Slider
              label="Relief / 3D"
              value={settings.macroRelief}
              min={0}
              max={1}
              step={0.05}
              onChange={(v: number) => onUpdate({ macroRelief: v })}
          settingKey="macroRelief"
        />
          </>
        )}
      </section>
      )}
    </>
  );
};
