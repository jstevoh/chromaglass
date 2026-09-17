import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  X, BookOpen, Play, Layers, Droplets, Palette, Activity, Aperture,
  Zap, Microscope, Projector, Video, Sliders, GitMerge, History, Gauge,
} from 'lucide-react';

/**
 * About ChromaGlass: the manual, in the app.
 *
 * Everything here is either something a person has to be told before the app
 * makes sense, or something they cannot find out by moving a slider — what a
 * control is in solver terms, which other control it fights with, and why the
 * app is shaped the way it is. What a slider does on its own is already in its
 * own tooltip; repeating that here would be a list of labels.
 *
 * The section that earns the panel is "How they interact". A liquid light show
 * has about eighty controls and perhaps a dozen real couplings between them,
 * and the couplings are what the panel is for: raising Evaporation to keep the
 * plate clear while Automation pours faster is two hands on the same rope.
 *
 * Kept as data rather than one long slab of JSX so the nav and the body cannot
 * drift apart — a section that is not in the list cannot be scrolled to.
 */

interface GuidePanelProps {
  onClose: () => void;
}

// ── Small presentational pieces ──────────────────────────────────────

const H = ({ children }: { children: ReactNode }) => (
  <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/90 mt-6 mb-2 first:mt-0">{children}</h4>
);

const P = ({ children }: { children: ReactNode }) => (
  <p className="text-[12px] leading-[1.75] text-white/60 mb-3">{children}</p>
);

/** A control and what it actually is, rather than what its label says. */
const Rows = ({ items }: { items: [string, ReactNode][] }) => (
  <dl className="mb-4 border-t border-white/5">
    {items.map(([term, def]) => (
      <div key={term} className="flex flex-col sm:flex-row gap-1 sm:gap-4 py-2 border-b border-white/5">
        <dt className="sm:w-44 shrink-0 text-[11px] font-semibold text-white/80">{term}</dt>
        <dd className="flex-1 text-[12px] leading-[1.7] text-white/55">{def}</dd>
      </div>
    ))}
  </dl>
);

/** Something worth knowing that is not a control. */
const Note = ({ children }: { children: ReactNode }) => (
  <p className="text-[12px] leading-[1.7] text-amber-100/70 border-l-2 border-amber-300/30 pl-3 my-4">{children}</p>
);

const C = ({ children }: { children: ReactNode }) => (
  <span className="font-mono text-[11px] text-white/80 bg-white/8 rounded px-1 py-0.5">{children}</span>
);

const Em = ({ children }: { children: ReactNode }) => (
  <em className="text-white/80 not-italic font-medium">{children}</em>
);

// ── The guide ────────────────────────────────────────────────────────

interface Section {
  id: string;
  title: string;
  icon: ReactNode;
  body: ReactNode;
}

const SECTIONS: Section[] = [
  // ─────────────────────────────────────────────────────────────────
  {
    id: 'start',
    title: 'Getting started',
    icon: <Play size={13} />,
    body: (
      <>
        <P>
          ChromaGlass is a liquid light show. Not a shader that looks like one — a fluid
          solver running the same arithmetic the real thing obeys, with dye between two
          sheets of glass over a lamp, and a projectionist's hands on it. Everything in
          the app is either a hand, a property of the liquid, or a property of the light.
        </P>
        <H>The first two minutes</H>
        <Rows items={[
          ['1. Press Play', <>The plate starts moving. It is seeded with the <Em>Classic Light Show</Em> preset — slow luminous blobs, the meditative 1960s look.</>],
          ['2. Give it sound', <>The quickest is <Em>Band</Em>: a synthesised kick, snare, hats, bass and pad at 122 bpm, played silently into the analyser. No device, so no permission prompt and nothing to ask. <Em>Mic</Em>, <Em>System</Em> and <Em>File</Em> are the real inputs.</>],
          ['3. Pick a look', <>Click the name under the ChromaGlass title. Thirty-two presets in three groups — Light show, Photograph, Closeup — plus any you have saved.</>],
          ['4. Put a hand on it', <>The <Em>Dropper</Em> adds dye, <Em>Blow</Em> puffs air through a straw, <Em>Press</Em> holds the top glass down so the film thins and the dye runs out in a ring.</>],
        ]} />
        <H>Your first show, in order</H>
        <P>
          The order matters more than it looks: each step is hard to undo once a room is
          watching, and easy before.
        </P>
        <Rows items={[
          ['1. Sound first', <>Pick the input and let <Em>room calibration</Em> settle for a minute (Settings → Inputs → Sound). It learns this room's floor and ceiling, so the plate reacts to where the music sits between them rather than to an absolute level. Skip it and the show is either dead or frantic all night.</>],
          ['2. Then the projector', <>Cast → <Em>Second display</Em>. Do it before you tune anything: the projector announces its resolution and the plate re-renders at it, so a look tuned on the laptop alone can arrive coarser or finer than you expected.</>],
          ['3. Then the look', <>Build in <Em>Design</Em> (the plate filling the window), where <Em>Load</Em> on a preset row is what you want — it lands on clean glass. Save anything you like: <Em>Save current</Em> keeps the settings, the dyes, the injection styles and the liquids together.</>],
          ['4. Switch to Perform', <>Now the plate becomes a preview and the desk gets the room. From here, change looks by <Em>cueing</Em> and pressing Go, never by Load — Load clears the plate, which on a wall is a cut to black.</>],
          ['5. Clean Screen last', <>Hides every overlay and the cursor for the projection. Esc brings them back, or a finger held still on a touch screen.</>],
        ]} />
        <P>
          <Em>Record</Em>, the red button beside Cast, writes the show and its music to a{' '}
          <C>.webm</C> file. <C>B</C> is blackout — the thing to hit when something goes
          wrong, because it fades rather than cuts.
        </P>
        <H>When something is wrong</H>
        <Rows items={[
          ['Nothing is moving', <>In this order: is the plate playing; can the show hear anything (the level meter in the status line, or Settings → Inputs → Sound); is the <Em>Dimmer</Em> up. <C>B</C> is blackout and it is easy to leave on — the status line says <Em>Blackout</Em> in red when it is.</>],
          ['It moves but ignores the music', <>Raise <Em>Sound Drive</Em> (audioImpact). If it still will not, the mappings are set to <C>none</C> — Settings → Inputs → Audio Mappings.</>],
          ['It is being thrown around', <>Lower <Em>Sound Drive</Em>. Turning Automation on roughly doubles every audio-driven push on top of it, so a plate tuned with it off will be about twice as emphatic once it is on.</>],
          ['The plate has gone flat', <>It is saturated: there are no boundaries left to see. Lower <Em>Dye Budget</Em> — counter-intuitively that makes it look fuller, because empty glass is what makes the colour read.</>],
          ['A slider does nothing', <>Two usual causes. <Em>Blob Surface Tension</Em> does nothing with <Em>Polarity</Em> at zero. And Focus, Aperture, Bloom, Chromatic Aberration, Refraction, Micro-Droplets and Thin Film are photograph-only — they do nothing in the light-show render.</>],
          ['The wall went dark on a look change', <>You used Load rather than Cue and Go. Load clears the plate on purpose; Go never does.</>],
          ['It got slow', <>The status line names the rung the engine settled on. Set <Em>Sim Resolution</Em> to a fixed number rather than auto if a look depends on a particular grid, and expect the frame-time governor to step auto back down on a machine that cannot hold it.</>],
        ]} />
      </>
    ),
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'plate',
    title: 'The plate',
    icon: <Layers size={13} />,
    body: (
      <>
        <P>
          Worth two minutes, because every control in the app is a control on one of
          these four things.
        </P>
        <Rows items={[
          ['Velocity', <>Which way the liquid is going, everywhere at once. Almost everything that looks like motion is something adding to this field: a blow, a beat, turbulence, the room, a rocking plate.</>],
          ['Dye', <>How much colour is where, as three absorptions plus a thickness. Colour is <Em>subtractive</Em> — the dye takes light out of the lamp behind it rather than adding light of its own, which is why two dyes over each other read as a third rather than as a brighter version of either.</>],
          ['Heat', <>Warmth from the lamp. Warm liquid rises, which is what makes a plate left alone keep breathing.</>],
          ['The gap', <>How far apart the two sheets of glass are. Pressing squeezes it, and liquid has to go somewhere — this is the squeeze-film flow that makes the ring under a palm.</>],
        ]} />
        <H>How it advances</H>
        <P>
          The solver steps at a fixed 1/60 s in <Em>wall-clock</Em> time, not once per
          rendered frame, so the show runs at the same speed on a 30 fps laptop, a 60 fps
          desktop and a 120 Hz display. A slow frame catches up by taking several steps,
          capped so a stall cannot spiral.
        </P>
        <P>
          On a GPU it solves at whatever grid the quality governor picks (Settings →
          Simulation, <Em>Sim Resolution</Em>); without float render targets it falls back
          to a 192² solver in JavaScript. Both run the same scheme, so a preset looks like
          itself on either — a finer grid resolves thinner filaments and real cell
          structure, it does not change the physics.
        </P>
      </>
    ),
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'liquids',
    title: 'Liquids',
    icon: <Droplets size={13} />,
    body: (
      <>
        <P>
          The dropper has nine bottles, and they are not nine colours. Five put dye on the
          glass and nothing else. Four also write themselves into a second field the plate
          carries, and the plate goes on acting on that field long after the drop.
        </P>
        <H>Colour only</H>
        <P>
          <Em>Water</Em>, <Em>Oil</Em>, <Em>Alcohol</Em>, <Em>Ink</Em> and <Em>Syrup</Em> differ
          in how wide the drop is, how much dye it lays down and how much warmth it brings.
          Alcohol is thin and hot, syrup is small and heavy, ink spreads wide and pale.
        </P>
        <H>Liquids that change the plate</H>
        <Rows items={[
          ['Soap', <>Breaks the surface film. Colour runs <Em>away</Em> from it as long as the soap is there to make a gradient, and the plate's own vorticity curls the front into filaments. It also thins the film it broke, which is the clear disc a drop of soap opens in a plate of dye. Fades over about six seconds — a surfactant spreads until it is too thin to lower anything, which is why soap is a moment rather than a state.</>],
          ['Milk', <>Holds its own edge instead of feathering out, and drags slightly. Not a pull toward the middle — it takes away the flow that is <Em>escaping</Em> the pool, and nothing else. Lasts about twenty-five seconds.</>],
          ['Silicone', <>The cell maker: soap's displacement without soap's colour. It shoulders dye aside into a ring rather than colouring one, which is where every cell in a pour painting comes from.</>],
          ['Glycerine', <>Thick. It crawls where it lands while the plate flows past it, so a patch of it shears against everything around it. Lasts about twenty seconds.</>],
        ]} />
        <Note>
          Milk's <Em>behaviour</Em> is real; its <Em>optics</Em> are not there yet. Colour still
          transmits through it rather than sitting on top of it, because the dye texture
          has no channel left for an opaque ground. That is the one part of the reference
          photographs this does not reach.
        </Note>
        <H>What is in the dish</H>
        <P>
          Every preset names the liquids its automation may pour, and the list doubles as
          the dilution: the app picks from it evenly, so the inert entries are how a preset
          says <Em>mostly nothing, once in a while something</Em>.{' '}
          <C>water, water, soap</C> is a plate broken open every third dose;{' '}
          <C>soap, silicone</C> never stops reacting. Classic Light Show is the first,
          Lacing Run is the second.
        </P>
        <P>
          A show that runs itself adds liquid for hours and pours none of it out, so each
          automated dose is scaled by how much room the plate has left. A plate that is
          thick everywhere is not a thick plate, it is a stopped one — and soap spread
          evenly over the whole plate has no gradient left to pull with at all. A hand on
          the dropper is never limited this way.
        </P>
      </>
    ),
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'presets',
    title: 'Presets and dyes',
    icon: <Palette size={13} />,
    body: (
      <>
        <P>
          A preset is a complete plate: every setting, the dyes it may use, how the
          automation injects them and what liquid they are. Applying one clears the glass
          and lays the new plate; the sequencer can also <Em>adopt</Em> one, taking on the new
          dyes and liquids without wiping what is already there.
        </P>
        <H>Palette contracts</H>
        <P>
          A projected clock face carries two or three dyes. The richness of a real show
          comes from stacking plates, not from rainbow dye — so each preset names the
          handful of colours it may use, and everything that adds colour stays inside that
          set: seeding, automation, beat hits, the slow harmony rotation, a song's
          identity. <Em>Crowd Plate</Em> is the exception at six, because a crowd wants more
          colours to hand out than a clock face does.
        </P>
        <Rows items={[
          ['Hue Journey', <>Settings → Show. Minutes per step. The set drifts its colours over the length of a set, one dye draining as the next arrives, never a jump. At zero the old behaviour stays: a re-pick every forty-five seconds or so.</>],
          ['Palette lock', <>Pin a harmony and it wins outright — over drains, seeds, auto-rotation and the music. Persists across sessions.</>],
          ['Save current', <>Writes the look, its dyes, its injection styles and its liquids to your library and to a <C>.chromaglass-preset.json</C> file. Load a friend's the same way.</>],
          ['For this song', <>A saved preset can be attached to the track that was playing. It is applied whenever that song is identified again.</>],
        ]} />
        <Note>
          The presets live on the title, and nowhere else. They used to be in the settings
          panel too, which meant two lists that could disagree about which one was active.
        </Note>
      </>
    ),
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'sound',
    title: 'Sound',
    icon: <Activity size={13} />,
    body: (
      <>
        <H>Where it listens</H>
        <Rows items={[
          ['Mic', <>The microphone, or whichever input is chosen in Settings → Inputs → Sound. The app never opens it on load — it only comes back where the browser already says granted.</>],
          ['System', <>System audio, for music playing on this machine.</>],
          ['File', <>A music file played here, with its own small player.</>],
          ['Band', <>A synthesised band — kick, snare, hats, bass and pad in verses and choruses at 122 bpm — played silently into the analyser. It is a real audio stream, so the analyser, the room calibration, the beat clock's tempo lock and every mapping run exactly as they do on a microphone.</>],
        ]} />
        <H>The controls</H>
        <Rows items={[
          ['Sensitivity', <>How hard the analysis drives everything downstream. The first thing to reach for in a room that is louder or quieter than the last one.</>],
          ['Bass Boost', <>Weights the 20–250 Hz band before it is mapped. A PA with no low end, or too much of it, is fixed here rather than by re-tuning every slider.</>],
          ['Global Speed', <>How fast the whole plate lives, independent of the music.</>],
          ['Dimmer / Blackout', <>The house lights for the plate. <C>B</C> fades to black and back, as does the Blackout button on the phone or a controller.</>],
          ['Room calibration', <>Learns this room's noise floor and dynamics and drives the visuals from where the music sits between them, rather than from an absolute level. A quiet room and a loud one then look the same.</>],
          ['Beat Prediction', <>A phase-locked beat clock. The microphone hears a kick after it happens, so the clock learns the tempo and fires the next one <Em>early</Em>. <Em>Beat Lead</Em> is how early, in milliseconds.</>],
        ]} />
        <H>Audio Mappings</H>
        <P>
          Four destinations — velocity, density, colour, rotation — each fed by one of
          eight features: volume, bass, mid, treble, energy, timbre, complexity, or none.
          This is the coarse wiring. <Em>Audio Impact</Em> in Light Show Look is how hard the
          result lands, and it is the slider to move when the plate is either ignoring the
          music or being shoved around by it.
        </P>
      </>
    ),
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'look',
    title: 'The look',
    icon: <Aperture size={13} />,
    body: (
      <>
        <H>Light Show Look</H>
        <Rows items={[
          ['Turbulence Scale / Detail', <>Multi-octave curl noise added to the velocity field. Scale is how strong, Detail is how many octaves — structure from whole-blob motion down to ripple and filament trails.</>],
          ['Sharpness', <>How hard the boundary between two dyes is held. High values keep a boundary a boundary instead of letting diffusion soften it into a gradient.</>],
          ['Granulation / Grain Size', <>Pigment that separates the way real pigment does, and travels <Em>with</Em> the dye rather than sitting on the screen.</>],
          ['Blob Surface Tension', <>Trades cohesion against shear. Low gives amoeba-like elongation and pinching; high gives rounder, self-contained blobs. Scaled by Polarity — see the interaction section.</>],
          ['Dye Budget', <>How full the plate is allowed to get. As it fills toward saturation, evaporation ramps up hard, so injection and removal find an equilibrium with empty glass left. A saturated plate has no boundaries and reads as a flat colour wash.</>],
          ['Edge Relief', <>The meniscus: the little bright lip where dye meets clear glass.</>],
          ['Lacing', <>The dark dendritic threads that outline a boundary, drawn by the strain across it.</>],
          ['Bubbles', <>Air between the plates. A bubble is not drawn over the dye — it is a standing squeeze on its own footprint, so the dye pumps out to its rim and the field flows round it.</>],
          ['Plate Rock', <>The beat tips the whole plate and a damped spring rocks it back, so the field sloshes instead of only churning.</>],
          ['Boundary Glow', <>A bright line where two distinct dyes meet — the oil-water interface, without a multi-fluid solve.</>],
          ['Saturation / Glossiness / Post Blur', <>The final grade. Glossiness defaults to zero: flat, evenly lit matte dye is the projected look, and a specular highlight makes it read as glossy 3D spheres instead.</>],
        ]} />
        <H>Camera: two render styles</H>
        <P>
          <Em>Light show</Em> is dye as light on black — the projected image. <Em>Photograph</Em> is
          a two-pass render with a camera over the plate and lit paper behind it, and it
          is what the Oil on Water, Colorful Cosmos and Sunny Side Up presets are. Focus,
          Aperture, Bloom, Chromatic Aberration, Refraction, Micro-Droplets and Thin Film
          only do anything in the photograph.
        </P>
        <H>Lamp</H>
        <P>
          One lamp lights everything. <Em>Light Play</Em> is how much it matters, <Em>Lamp
          Motion</Em> walks it about, <Em>Hot-Spot</Em> is the bright centre a real projector has,
          and <Em>Second Lamp</Em> adds another from a different angle. Bubbles act as lenses
          for it and dye rims are lit from wherever it happens to be.
        </P>
      </>
    ),
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'physics',
    title: 'Physics',
    icon: <Zap size={13} />,
    body: (
      <>
        <H>Fluid Physics</H>
        <Rows items={[
          ['Diffusion Rate', <>How fast dye bleeds into its neighbours. Near zero keeps pinpoints sharp; up high everything becomes a wash.</>],
          ['Buoyancy', <>How strongly warm liquid rises. This and Heat Intensity are what make a plate left alone keep moving.</>],
          ['Advection', <>How far the dye is carried per step. Raise it and the plate sweeps; lower it and motion becomes local churn.</>],
          ['Damping', <>How much velocity survives each step. This is how long a gesture lasts — at 0.99 a blow is still visible half a minute later, at 0.95 it is gone in a second.</>],
        ]} />
        <H>Squish Plate</H>
        <Rows items={[
          ['Plate Pressure', <>A standing radial spread from the middle, as if the glass were slightly bowed.</>],
          ['Glass Smear', <>Slow wandering of the whole field, the way a plate on a warm projector drifts.</>],
          ['Rain Drip', <>Occasional downward streaks.</>],
          ['Fingering', <>Settings → Show. With it up, a press does not thin evenly: the film thins more along a ring of spokes and the outflow follows them, so the front breaks into radial fingers instead of a smooth ring. The physics is Saffman–Taylor — thin liquid shooting through thick.</>],
        ]} />
        <H>Heat Slide</H>
        <Rows items={[
          ['Heat Intensity', <>How much warmth the lamp puts in.</>],
          ['Boiling Point', <>How hard the plate is to boil. Low makes a churning cauldron; near 1 keeps it calm whatever the heat.</>],
          ['Evaporation Rate', <>How fast dye leaves the plate. Paired with Dye Budget — see the interaction section.</>],
          ['Heat Decay', <>How long warmth lingers. High keeps a gentle convection going between events.</>],
          ['Polarity', <>How strongly the dyes refuse to mix, plate-wide. This is the global setting; milk and silicone do the same thing <Em>locally</Em>, only where they are.</>],
        ]} />
        <H>Simulation</H>
        <P>
          <Em>Sim Resolution</Em> is the grid the solver runs on. <C>auto</C> hands the choice to
          a frame-time governor that climbs when there is headroom and steps down when
          there is not; <C>cpu</C> is the 192² JavaScript fallback; a pinned number is
          honoured up to the graphics card's texture limit.
        </P>
      </>
    ),
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'macro',
    title: 'Macro closeup',
    icon: <Microscope size={13} />,
    body: (
      <>
        <P>
          A tracking camera that magnifies the plate and chases a single travelling bead
          of liquid, from 1× to 16×. <C>+</C> and <C>−</C>, the wheel over the plate, or the
          chip under the title. It is a different subject, not a zoom: at 8× the frame is
          cells, lacing and razor edges, and the presets built for it (Macro Bead, Cell
          Bloom, Lacing Run) are composed for that.
        </P>
        <Rows items={[
          ['Chase Speed / Shot Length', <>How eagerly the camera follows its subject, and how long it stays on one before cutting.</>],
          ['Music Sync', <>The camera cuts on kicks, punches on bass, chases on energy and tremors on treble.</>],
          ['Paint Cells / Cell Size', <>Synthesised cells at magnification — the rings a pour painting makes.</>],
          ['Lacing / Edge Detail / Relief', <>The filaments, the fine boundary structure and the apparent thickness of the film.</>],
          ['Depth / Focus', <>Shallow depth of field, the way a real macro lens has no choice about.</>],
        ]} />
        <Note>
          The closeup overrides <Em>Dye Budget</Em> while it is running and holds the plate much
          emptier than a wide shot would. A macro frame needs bare glass around its
          subject; a full plate at 8× is a colour field.
        </Note>
      </>
    ),
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'projectors',
    title: 'The other projectors',
    icon: <Projector size={13} />,
    body: (
      <>
        <P>
          A real light show was never one projector. These are the others, each able to
          run under or over the dye.
        </P>
        <Rows items={[
          ['Lumia', <>Thomas Wilfred's aurora: slow folded sheets of light drifting under a nearly clear plate. No beat, no dye to speak of, minutes-long evolutions.</>],
          ['Chemistry', <>Reaction–diffusion that grows coral and cells on the plate, the way Mark Boyle's Sensual Laboratory projected reactions on the platen instead of oil in a dish.</>],
          ['Gel Wheel', <>A rotating colour wheel over the lamp, in revolutions per minute. Half a turn a minute is the Optikinetics look.</>],
          ['Film projector', <>A video file on a loop, or a live camera, played <Em>through</Em> the dye rather than beside it. <Em>Film Mix</Em> and <Em>Film Key</Em> set how much and what it keys on.</>],
          ['Lamp Warmth / Exposure', <>The halogen grade, for the sealed oil-wheel look, and how hot the whole image is driven.</>],
          ['Projectors / Round Dish', <>Settings → Show. Each layer gets its own dish on a black screen, circular the way a real clock face is. The Fillmore East, 1969 preset is three of them at once.</>],
        ]} />
      </>
    ),
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'room',
    title: 'The room',
    icon: <Video size={13} />,
    body: (
      <>
        <P>
          A camera pointed at the floor, read back rather than shown. The movement in
          front of it stirs the liquid, everyone it can hold becomes a hand on the glass,
          and any feature of the room can ride any control a MIDI fader can learn.
        </P>
        <Rows items={[
          ['Room Drive', <>The optical-flow lattice upsampled onto the grid and added as velocity every solver step. A wave of an arm reaches the plate about 100 ms after it happens.</>],
          ['Hands', <>Everyone the sensor holds becomes a projectionist: standing still is a palm on the top glass (so <Em>Fingering</Em> breaks it into spokes), moving is a puff of air the way they are going, arriving is a drop. A track keeps its identity, so the same dancer keeps the same dye across a set.</>],
          ['Mappings', <>How busy the floor is, how many people, how spread out, where they are, which way they are going, how light the room is and what colour — any of them on any control, each with its own depth, under one master <Em>Room Impact</Em>.</>],
          ['Deadzone / Smoothing', <>What counts as nothing, and how much the reading is smoothed before it is used. A room is a noisy sensor.</>],
        ]} />
        <Note>
          Frames are read in the page and never leave it, and nothing is recorded. Which
          camera is watching lives in local storage rather than in the settings, so loading
          someone else's preset cannot open your camera.
        </Note>
        <P>
          The preset <Em>Crowd Plate</Em> is built for this: a plate deliberately calm to start
          with so what the room adds is what is seen moving, the music turned down so it is
          not the loudest hand, and six dyes so there are enough to hand out.
        </P>
      </>
    ),
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'live',
    title: 'Playing it live',
    icon: <Sliders size={13} />,
    body: (
      <>
        <H>Hands</H>
        <Rows items={[
          ['MIDI', <>Plug the controller in and click the <Em>MIDI</Em> dot in the header, or open Settings → Inputs → Controller: if we recognise the port, its factory map is one button. Factory maps for APC mini mk2, APC40 mkII, nanoKONTROL2, Launchpad and Launch Control XL, or teach yours: choose what a control should do, then touch it. Soft takeover, endless encoders and LED feedback. The panel draws your controller to scale, which doubles as a printable cheat sheet. Maps save as <C>.chromaglass-midi.json</C>.</>],
          ['Game controller', <>Sticks move a cursor and blow, triggers drop dye, shoulders cycle the dye, d-pad steps presets and plates, face buttons fire the one-shots.</>],
          ['Phone / iPad', <>A projectionist's pad: drag to blow, tap to drop, pick a dye, pick which plate you are working, tilt the device to rock the plate. On an iPad it is two columns — the pad on the left, the dials and sequencer on the right. A pen's pressure sets how much dye and its lean sets which way the air goes.</>],
          ['OSC', <>Addresses like <C>/chromaglass/dye</C> for a lighting desk or a laptop running a show-control app.</>],
        ]} />
        <H>The show over time</H>
        <Rows items={[
          ['Automation', <>Dye drops and air blows driven by the music. <Em>Evolve Speed</Em> is how often, from a drop every second or so to the old frenzy.</>],
          ['Sequencer', <>Script how the show evolves over a song or a set: stages with their own presets and durations, saved as <C>.chromaglass-sequence.json</C> with any of your presets it needs, so it arrives whole on another laptop.</>],
          ['Multi-Layer Mixer', <>Up to five fluid layers, each its own plate, composited with screen, lighter, exclusion, multiply or overlay. <Em>Layer Scale Variety</Em> gives each one its own magnification, which is what two projectors at different throws actually look like.</>],
          ['Music intelligence', <>The first listen to a song is recorded and analysed offline into a map — verse and chorus structure, pitch and energy curves — cached locally. On every later listen the show is driven by known structure rather than by the last half-second: choruses surge, intros and outros calm. Lyrics come from LRCLIB, with themed word triggers and a per-section sentiment arc.</>],
        ]} />
        <H>Changing look mid-song, step by step</H>
        <P>
          This is the one sequence worth having in your fingers, because it is what the
          desk is for and it is not obvious from the buttons alone.
        </P>
        <Rows items={[
          ['Arm it', <>Click the plate's name at the top left and pick a look. Nothing happens on the wall. The bar at the bottom now reads <Em>On stage</Em> → <Em>Cued</Em>.</>],
          ['Set the fade', <>The timer on that bar: cut, 1, 2, 4 or 8 seconds. Two is a good default; eight is a scene change; cut is for when you mean it.</>],
          ['Go', <>The new look crossfades in and the plate is never wiped. The Go button fills as it travels, so you can see how far through it is without watching the wall.</>],
          ['Undo', <>The arrow beside Go returns to the look before the last Go, at the same fade. It also undoes <Em>Lucky</Em> — that is why Lucky is safe to press.</>],
        ]} />

        <H>The keyboard</H>
        <Rows items={[
          ['B', <>Blackout — fades the plate down and back. The panic button, and the one to leave your hand near.</>],
          ['+ / −', <>Macro zoom, 1× to 16×. <C>+</C> with the closeup off turns it on gently at 2×; <C>−</C> never turns it off.</>],
          ['?', <>This manual.</>],
          ['Esc', <>Brings the overlays back after Clean Screen; with them up, closes whatever panel is open.</>],
          ['Wheel over the plate', <>Zooms the closeup while it is running. It will not turn it on — a trackpad brush must not become a camera cut.</>],
        ]} />

        <H>Out of the laptop</H>
        <P>
          <Em>Second display</Em> opens a window on a projector that mirrors this canvas pixel
          for pixel — one render, at the projector's own resolution, with the laptop
          keeping the controls. <Em>Network display</Em> gives an address any browser on the
          same Wi-Fi can open. <Em>Chromecast</Em> uses Chrome's own picker.
        </P>
      </>
    ),
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'interact',
    title: 'How they interact',
    icon: <GitMerge size={13} />,
    body: (
      <>
        <P>
          Eighty controls, and about a dozen real couplings between them. These are the
          ones worth knowing, because each is a case where moving one slider makes another
          stop behaving the way its label suggests.
        </P>

        <H>Dye Budget ↔ Evaporation ↔ Evolve Speed</H>
        <P>
          These three are one loop. The plate removes dye faster the fuller it gets, so
          Dye Budget is a <Em>target</Em>, not a cap, and the equilibrium is wherever injection
          and removal meet. Turning Automation up does not make the plate fuller for long —
          it makes it churn harder at the same fullness. To actually get a fuller plate,
          raise the budget; to get a sparser one with the same activity, lower it and leave
          Evolve Speed alone.
        </P>

        <H>Polarity × Blob Surface Tension</H>
        <P>
          Polarity is the master: it scales <Em>both</Em> the cohesion that rounds a blob and the
          fingering that tears it. Blob Surface Tension then splits that budget between
          them — high is round and self-contained, low is elongated and pinching. With
          Polarity at zero, Blob Surface Tension does nothing at all, which is the most
          common reason a slider appears dead.
        </P>

        <H>Turbulence × Damping × Advection</H>
        <P>
          Turbulence makes structure, Damping decides how long it survives, Advection
          decides how far it travels before it dies. High turbulence with low damping is a
          boil; high turbulence with high damping and high advection is a sweep with detail
          in it. Turbulence alone, with damping low, mostly produces noise that vanishes.
        </P>

        <H>Heat Intensity × Buoyancy × Boiling Point × Heat Decay</H>
        <P>
          Heat does nothing visible without Buoyancy to turn it into motion. Boiling Point
          is the ceiling on how violent that motion may get, and Heat Decay is how long it
          lasts between events. A plate that is calm despite a lot of heat usually has
          Boiling Point near 1; a plate that will not settle usually has Heat Decay near 1.
        </P>

        <H>The liquids are local; the sliders are plate-wide</H>
        <P>
          <Em>Polarity</Em> is immiscibility everywhere. Milk's edge-holding is immiscibility{' '}
          <Em>where the milk is</Em>. They compose rather than duplicate, which is the point —
          a plate at low Polarity with a pool of milk in it has one thing that will not
          blend and everything else that will, and that contrast is not reachable from the
          sliders alone.
        </P>

        <H>Audio Impact × Automation</H>
        <P>
          Automation roughly doubles the punch of every audio-driven injection on top of
          whatever Audio Impact is set to. A plate tuned to taste with automation off will
          be about twice as emphatic when it is turned on.
        </P>

        <H>Room Drive × Audio Impact</H>
        <P>
          Both are hands on the same plate, and the loudest one wins the look. Crowd Plate
          sets the music down to 0.35 on purpose: with the music at its usual strength, an
          arm waved in front of the camera is invisible against what the bass is already
          doing.
        </P>

        <H>Who gets to pick the colour</H>
        <P>
          In order of precedence: a <Em>palette lock</Em> beats everything. Otherwise the preset's{' '}
          <Em>contract</Em> is the set, and within it the <Em>hue journey</Em> (or a random re-pick, if
          the journey is off) chooses, and a <Em>song's identity</Em> can steer — but only ever
          inside the contract. Nothing can introduce a colour the preset did not name.
        </P>

        <H>Render style gates whole sections</H>
        <P>
          Focus, Aperture, Bloom, Chromatic Aberration, Refraction, Micro-Droplets and
          Thin Film are photograph-only. Glossiness fights the projected look by design: at
          anything above zero the dye reads as lit 3D spheres rather than as flat backlit
          colour.
        </P>

        <H>Grid resolution is not a quality slider</H>
        <P>
          A finer grid resolves thinner filaments and real cell structure. It does not make
          a preset look better if that preset's structure is at a coarse scale anyway, and
          the frame-time governor will quietly step it back down if the machine cannot hold
          it. If a look depends on a specific grid, pin it rather than leaving it on auto.
        </P>

        <H>Macro overrides the plate</H>
        <P>
          Turning the closeup on replaces Dye Budget with a much lower target and changes
          what the frame is about. A preset tuned wide will not look like itself at 8×,
          which is why there are presets composed for the closeup specifically.
        </P>
      </>
    ),
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'history',
    title: 'History',
    icon: <History size={13} />,
    body: (
      <>
        <H>1.0.0 — April 2026 — the solver</H>
        <P>
          Real-time Navier–Stokes with squeeze-film flow, buoyancy, immiscibility and
          fingering. Microphone and system audio through a 1024-point FFT split into bass,
          mid and treble. Ten presets, five compositing layers, an LED platform, the
          dropper and blow tools, automation, and a settings panel with every parameter
          exposed.
        </P>

        <H>1.1.0 — July 2026 — it stopped looking like a screensaver</H>
        <P>
          The rendering was rebuilt around the tradition rather than around 3D. Multi-octave
          curl-noise turbulence gave structure at every scale; blob surface tension traded
          cohesion for shear so blobs elongated and pinched instead of sitting there as
          circles; a bright interface line faked the oil–water boundary without a
          multi-fluid solve. The decisive change was making the specular highlight optional
          and defaulting it <Em>off</Em>: flat, evenly lit matte dye is the projected look, and
          glossy spheres are not.
        </P>

        <H>1.2.0 — July 2026 — the show knows what it is playing</H>
        <P>
          Song identification, and then something more interesting than identification:
          each first listen is recorded and analysed offline into a song map — verse and
          chorus structure, pitch and energy curves — so that every later listen can be
          driven by known structure instead of by the last half-second of audio. Local
          fingerprinting recognises repeat listens in seconds, offline. Synced lyrics,
          themed word triggers and a sentiment arc arrived with it. The grid went 128 → 192,
          and the self-regulating dye budget fixed the saturation washout that had made
          long shows drift to a flat colour field.
        </P>

        <H>August 2026 — the macro camera, and a real GPU</H>
        <P>
          A tracking camera that magnifies the plate and chases one travelling bead, which
          turned out to be a different instrument rather than a zoom. Room calibration so a
          quiet room and a loud one look the same. Then the solver moved to the GPU with
          MacCormack advection, and a frame-time governor that picks the grid by what the
          machine can actually hold.
        </P>

        <H>September 2026 — out of the laptop</H>
        <P>
          Most of this month was about the show leaving the browser window. The phone
          remote, then casting that works on a real second screen, then a network display
          any browser on the Wi-Fi can open. Presets and sequences as files, so a look can
          be given to someone. MIDI controllers with factory maps and learn, game
          controllers, the iPad as a plate, OSC, recording, a dimmer and a blackout.
        </P>

        <H>September 2026 — the other projectors, and the photograph</H>
        <P>
          A real light show was never one projector: a Wilfred lumia layer, a
          reaction–diffusion chemistry mode after Mark Boyle, a rotating gel wheel, a film
          projector playing through the dye. Then a second render path entirely — the
          photograph, with a camera over the plate and lit paper behind it, which is what
          the Oil on Water and Colorful Cosmos presets are. Bubbles were rebuilt as air
          <Em> between</Em> the plates rather than sprites over the dye. Fillmore East, 1969
          arrived as three projectors at once.
        </P>

        <H>September 2026 — judging it by numbers</H>
        <P>
          A plan with gates, and harnesses to meet them, because "it looks better" had
          stopped being a usable answer. Sharp liquid, pigment granulation that travels
          with the dye, and lacing — the dark threads that outline a boundary — each
          measured against filmed liquid rather than against an impression.
        </P>

        <H>September 2026 — the room, and liquids that stay liquids</H>
        <P>
          The camera had always been able to show <Em>through</Em> the dye; it is read back now
          instead, so a room full of people stirs the plate and each dancer is a hand on the
          glass with a dye of their own. A synthesised band so a show can be built with no
          microphone and no permission prompt. And the liquids stopped being nine names for
          the same drop: soap, milk, silicone and glycerine now write into a field the plate
          carries and keeps acting on, and every preset says what is in its dish.
        </P>
      </>
    ),
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'numbers',
    title: 'Judging it by numbers',
    icon: <Gauge size={13} />,
    body: (
      <>
        <P>
          Six harnesses, so a change is judged the same way every time rather than by
          watching a plate and forming an impression. They are developer tools, but knowing
          they exist explains why the app is the shape it is.
        </P>
        <Rows items={[
          ['detail', <>How much structure a frame carries, and at what scale, against filmed liquid.</>],
          ['liquids', <>Each liquid measured on the thing it is for — and first, that a plate with none of them on it is left completely alone.</>],
          ['plate', <>That every preset's dyes, injection styles and liquids name things that exist. A typo in a liquid id reads as "this preset has no liquid", silently, forever.</>],
          ['scene', <>The room sensor against painted rooms, a closed feedback loop, and a person who walks in and stops.</>],
          ['music', <>Level traces through the real calibration into the boundary detector, and synthetic songs through the real matcher.</>],
          ['qa', <>The app itself: it builds, serves, and walks a browser through a show night watching the console.</>],
        ]} />
        <Note>
          There is a running record of what was tried, what it measured at, and what was
          wrong the first time in <C>PLAN.md</C> and <C>CHANGELOG.md</C> in the repository.
          Several entries are there because the first attempt measured <Em>worse</Em> than doing
          nothing.
        </Note>
      </>
    ),
  },
];

export function GuidePanel({ onClose }: GuidePanelProps) {
  const [active, setActive] = useState(SECTIONS[0].id);
  const bodyRef = useRef<HTMLElement | null>(null);
  /**
   * While a click-scroll is in flight the observer would light up every
   * section the view passes through on the way, so the nav flickers down the
   * list and lands on the right one. This holds it to the section that was
   * asked for until the scrolling stops.
   */
  const jumpingTo = useRef<string | null>(null);

  const go = (id: string) => {
    setActive(id);
    jumpingTo.current = id;
    document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /**
   * The nav follows the reading, not just the clicking.
   *
   * Without this the highlight only ever moved when a heading was clicked, so
   * scrolling from Liquids down into Physics left the nav still claiming
   * Liquids — the one thing a contents column is for is saying where you are.
   *
   * The band is the top third of the view: a section counts as the one being
   * read once its heading reaches there, which is how a person would answer
   * the question themselves.
   */
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    const seen = new Map<string, number>();
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) seen.set(e.target.id.replace('guide-', ''), e.intersectionRatio);
        // The topmost section that is meaningfully in view wins, so a long
        // section stays lit while it is being read rather than handing over
        // to whatever is peeking in at the bottom.
        const inView = SECTIONS.map(s => s.id).filter(id => (seen.get(id) ?? 0) > 0);
        const next = inView[0];
        if (!next) return;
        if (jumpingTo.current) {
          if (next === jumpingTo.current) jumpingTo.current = null;   // arrived
          return;
        }
        setActive(next);
      },
      { root, rootMargin: '0px 0px -67% 0px', threshold: [0, 0.01] },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(`guide-${s.id}`);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-0 sm:p-6"
      onClick={onClose}
      data-testid="guide-backdrop"
    >
      <motion.div
        initial={{ scale: 0.97, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.97, y: 12 }}
        transition={{ type: 'spring', damping: 26, stiffness: 240 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-5xl h-full sm:h-[88vh] bg-neutral-950/95 border border-white/10 sm:rounded-2xl overflow-hidden flex flex-col text-white shadow-2xl"
        data-testid="guide-panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-7 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-lg font-bold tracking-tighter flex items-center gap-2">
              <BookOpen size={17} /> About ChromaGlass
            </h2>
            <p className="text-[10px] uppercase tracking-[0.25em] opacity-30 mt-0.5">The manual</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            aria-label="Close the guide"
            data-testid="guide-close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Nav — a column on a laptop, a scrolling row on a phone */}
          <nav className="hidden sm:block w-52 shrink-0 border-r border-white/10 overflow-y-auto scrollbar-hide py-3">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => go(s.id)}
                ref={el => { if (el && active === s.id) el.scrollIntoView({ block: 'nearest' }); }}
                aria-current={active === s.id ? 'true' : undefined}
                className={`w-full flex items-center gap-2.5 border-l-2 px-5 py-2 text-[11px] text-left transition-colors ${
                  active === s.id
                    ? 'text-white bg-white/10 border-white'
                    : 'text-white/45 border-transparent hover:text-white/80 hover:bg-white/5'
                }`}
                data-testid={`guide-nav-${s.id}`}
              >
                <span className="opacity-70">{s.icon}</span>
                {s.title}
              </button>
            ))}
          </nav>

          <div className="flex-1 flex flex-col min-w-0">
            <div className="sm:hidden flex gap-1.5 overflow-x-auto scrollbar-hide px-4 py-2.5 border-b border-white/10 shrink-0">
              {SECTIONS.map(s => (
                <button
                  key={s.id}
                  onClick={() => go(s.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] whitespace-nowrap border transition-colors ${
                    active === s.id ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/60'
                  }`}
                >
                  {s.title}
                </button>
              ))}
            </div>

            {/* Body */}
            <article
              ref={bodyRef}
              className="flex-1 overflow-y-auto scrollbar-hide px-5 sm:px-10 py-7"
              data-testid="guide-body"
            >
              {SECTIONS.map(s => (
                <section key={s.id} id={`guide-${s.id}`} className="mb-12 scroll-mt-4">
                  <h3 className="text-[13px] font-bold uppercase tracking-[0.25em] text-white flex items-center gap-2 mb-4 pb-2 border-b border-white/10">
                    {s.icon} {s.title}
                  </h3>
                  {s.body}
                </section>
              ))}
              <p className="text-[10px] text-white/25 pb-8">
                ChromaGlass is open source. The code, the plan and a changelog of every
                change are at github.com/jstevoh/chromaglass.
              </p>
            </article>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
