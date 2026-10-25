/**
 * The map of the settings panel: what is in it, and where.
 *
 * Two dozen sections and ninety-odd controls is not a list you scroll. It was
 * one — a single column with a three-way filter on top — and the result was the
 * complaint that wrote this file: the controls existed, and could not be
 * found. So the panel is a rail of named places and one place at a time in the
 * pane, the way every settings screen anyone has used is built.
 *
 * It lives out here rather than inside the panel because three other things
 * need it: the command palette offers a row per section, the desks' pickers
 * group what you can pin by the section it came from, and `scripts/panel.mjs`
 * checks the panel's own source against it.
 */

import { PINNABLE } from './deskPins';

export interface SettingsCategory { id: string; name: string; hint: string }

/**
 * Seven groups, by what you are doing when you open one (PLAN 35b).
 *
 * There used to be four vocabularies for the same sections and they did not
 * agree: `data-group` in the panel's markup (perform, setup, look, inputs,
 * stage), the rail's five (Live, Inputs, Look, Plate, Stage), the panel
 * browser's, which borrowed the rail's and added its own panels to them, and the
 * phone's Settings strip, which drew the same groups with the headings hidden.
 * This is the one list; the rail, the browser, the sections' `data-group` and
 * the desk's own panels (`lib/deskLayout.ts`) all read it, in this order.
 *
 * What goes where is the question you have in your hand: Play is riding the
 * show you have, Pour is putting liquid on the plate, Feed is what drives the
 * show (sound, a camera, a film, a controller), Motion is how the plate moves
 * by itself, Chemistry is the liquid's own behaviour, Look is what the light
 * does to the picture, and Stage is the room and the machine. Not by how
 * often: that was the old Perform/Setup split, and "how often" is not a thing
 * you can search for.
 *
 * Only which group a section sits in changes here. A section's controls, its
 * id and its place on the desk are what they were (PLAN 35c, one home for
 * each setting, is the step that split Squish Plate up: it held the plate's
 * tilt, the oil, the ferrofluid and the reactions, and was the only member of
 * Chemistry until then).
 */
export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  { id: 'play',      name: 'Play',      hint: 'riding the show you have' },
  { id: 'pour',      name: 'Pour',      hint: 'putting liquid on the plate' },
  { id: 'feed',      name: 'Feed',      hint: 'what drives the show' },
  { id: 'motion',    name: 'Motion',    hint: 'how the plate moves by itself' },
  { id: 'chemistry', name: 'Chemistry', hint: 'the liquid itself' },
  { id: 'look',      name: 'Look',      hint: 'what the light does to the picture' },
  { id: 'stage',     name: 'Stage',     hint: 'the room and the machine' },
];

export interface SettingsSection {
  id: string;
  name: string;
  category: string;
  /**
   * What the section is *about*, for the search box.
   *
   * Not what it is called: "The Room" is the one phrase nobody types when they
   * want the camera that watches the crowd. These live here rather than beside
   * the markup because the rail and the pane both have to agree about what a
   * query matched, and when they were written inline only the pane knew.
   */
  terms: string;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  // First, so the sheet opens on it: what a show is run with, whatever the look.
  { id: 'master', name: 'Master', category: 'play',
    terms: 'master house lights dimmer blackout black out flash limit strobe photosensitive epilepsy safety speed pace tempo of the plate' },
  /*
    The mixer (lib/mixer.ts, docs/rig-plan.md R7): every picture on the wall
    in one stack, in an order, each with its level and grade. Live, beside
    Master, because it is ridden during a show; the desks and the phone open
    the same panel.
  */
  { id: 'mixer', name: 'Mixer', category: 'play',
    terms: 'mixer video mixer stack order layers layer order bring forward send back led ring platform film video logo mark front plate back plate brightness contrast saturation hue grade proc amp colour correction opacity level' },
  /*
    Sound Mappings is in here now: Sound Drive and the four bands' wiring.
    On the desk it was a panel holding one knob (Sound Drive; its four
    pickers are not numbers, so they were behind "All of…"), and the owner
    asked for no setting to sit alone on a panel (2026-10-10). It goes with
    the sound it reads, the way Room Drive is in The Room and Film Drive in
    Video. `MERGED_SECTIONS` below sends its old id here.
  */
  { id: 'audio-input', name: 'Sound', category: 'feed',
    terms: 'sound microphone mic system file band device tempo bpm tap midi clock beat prediction calibration calibrate recalibrate song mappings bass mid treble energy timbre map drive reactive velocity density colour color rotation' },
  /*
    Called by what it does (PLAN 14ad, the owner 2026-10-24: "what the room
    control is vs. showing video on the plate"). "The Room" said where the
    camera points, which is also where a webcam showing a picture points; this
    one stirs and is never shown. Search still finds it by "room".
  */
  { id: 'room', name: 'Motion camera', category: 'feed',
    terms: 'room camera video webcam people crowd dancers track tracking hands motion movement sensor floor deadzone smoothing mirror flip presence drive' },
  /*
    The film projector, out of Projectors.

    It is an input — a reel, a camera on a real dish, another window — and it
    drives the plate the way the room does, so it sits with the other things
    that drive the show rather than in a Stage section between the corner pin
    and a gel wheel. What it looks like on the wall is Film Mix and Film Key,
    here too, because nobody loads a reel and then goes to a different
    section to see it.
  */
  { id: 'film', name: 'Film', category: 'feed',
    terms: 'film projector loop reel video movie footage clip window tab screen capture share archive internet archive prelinger dish camera mix key drive' },
  /*
    The patch bay, with every master over it.

    It lived in The Room, because the room camera was the first thing that
    could ride a setting. By the time it also took the film, the sound and the
    shapes, most of what it routed had nothing to do with the room, and its
    masters were in three different sections: Sound Impact in Sound Mappings,
    Room Impact in The Room, Film Impact in Projectors (and the shapes had
    none). One place now, after the sources it reads.
  */
  { id: 'patches', name: 'Patches', category: 'feed',
    terms: 'patch patches patch bay modular route routing mapping mappings map source feature control depth impact master lfo envelope shape shapes modulator room film sound' },
  { id: 'midi', name: 'Controller', category: 'feed',
    terms: 'midi apc40 apc mini launchpad nanokontrol launch control xl fader knob pad learn map bank shift soft takeover led clock controller akai novation korg usb' },

  { id: 'look', name: 'Light Show Look', category: 'look',
    terms: 'turbulence blobs glow relief bubbles rock saturation gloss blur look colour color vivid grain size' },
  { id: 'show', name: 'Show', category: 'look',
    terms: 'hue journey colour color beat squeeze background loop dish vignette spread beads drops cells' },
  /*
    A section of its own, because it is played rather than set.

    It was three-quarters of one control buried in Show, between Background
    Loop and Round Dish — a section whose own terms list runs "hue journey
    beat squeeze background loop kaleidoscope dish vignette projectors beads
    cells", which is a drawer rather than a subject. Two of its three
    dimensions were constants in the shader, so there was nothing to group.
    Now there is.
  */
  { id: 'kaleidoscope', name: 'Kaleidoscope', category: 'motion',
    terms: 'kaleidoscope mirror folds wedges spin rotation turn rig zoom mandala symmetry reflect prism' },
  /*
    The lamp, and everything else a crew put in front of it.

    Lumia, chemistry, the gel wheel, the lamp's warmth and the exposure were
    the back half of Projectors, after the corner pin and the masks — the
    section you set once at load-in and then leave alone. They are the
    opposite: what the light looks like, ridden during a song. So they live
    with the lamp they colour.
  */
  { id: 'lamp', name: 'Lamp & Light', category: 'look',
    terms: 'light play motion hotspot second lamp iridescence projector bulb lumia aurora wilfred chemistry reaction coral sensual laboratory boyle gel wheel colour color rpm warmth halogen exposure grade transmission light through dye thickness depth pale deep' },
  { id: 'stock', name: 'Film Stock', category: 'look',
    terms: 'film stock 16mm super 8 slide reversal negative faded grain gate weave projector curve toe shoulder period sixties' },
  { id: 'camera', name: 'Lens', category: 'look',
    terms: 'camera photograph paper focus aperture bloom chromatic aberration refraction droplets thin film lens depth of field' },
  { id: 'macro', name: 'Macro Closeup', category: 'look',
    terms: 'zoom bead chase magnify closeup detail cells lacing depth relief' },
  { id: 'automation', name: 'Automation', category: 'motion',
    terms: 'evolve random drops air bursts rate dye budget' },

  /*
    Squish Plate was forty controls under one name: the glass, the oil, the
    ferrofluid, the reactions and the tilt. It is five sections now (PLAN 35c,
    the owner 2026-10-24: one home for each setting), and this one is the
    glass itself. Its id stays: a saved desk layout and a deep link name it,
    and the controls that stayed are the ones the name was always about.
  */
  { id: 'squish', name: 'Squish Plate', category: 'chemistry',
    terms: 'plate pressure press squeeze film hele-shaw gap thin gap thickness plate shape dome depth drag press lift viscosity thick thin smear glass drip rain' },
  { id: 'oil', name: 'Oil & Soap', category: 'chemistry',
    terms: 'oil tension bodies soap bursts surfactant clear film lace polarity repulsion repel immiscible water alcohol surface tension' },
  { id: 'ferro', name: 'Ferrofluid', category: 'chemistry',
    terms: 'ferrofluid magnet magnetic domain size phase edge pushes dye labyrinth maze detail spikes walk strength height lattice' },
  { id: 'reactions', name: 'Reactions', category: 'chemistry',
    terms: 'reaction reactions chemistry ph indicator acid bz belousov zhabotinsky liesegang rings turing pattern spots labyrinth print ink starch drift' },
  /*
    The plate tipped. Gravity and Tilt Direction were in Squish Plate, Slosh
    beside them, and Plate Rock in Light Show Look between Bubbles and Frame
    Sway: four controls that all say which way the heavy colour runs.
  */
  { id: 'tilt', name: 'Tilt & Rock', category: 'motion',
    terms: 'tilt rock rocking gravity slosh tip tipping dish upright direction downhill beat plate rock' },
  // The old names of Momentum, Updraft and Vibration stay findable, as Grain
  // Fineness's does under Light Show Look: someone who learned them as
  // Damping, Blow Velocity, Vibration Freq and Grain Size will type those.
  // And Heat Slide, which was two knobs on a panel of its own (Evaporation
  // Rate, Heat Decay): the heat they set is the heat Heat Spread spreads and
  // Buoyancy lifts, which were already here.
  { id: 'physics', name: 'Fluid Physics', category: 'motion',
    terms: 'viscosity diffusion vorticity immiscibility fingering surface tension advection damping friction heat slide temperature buoyancy convection evaporation' },
  // The bottles themselves: design one, load one from a file, save them.
  { id: 'liquids', name: 'Liquids', category: 'pour',
    terms: 'liquid liquids bottle bottles shelf custom design make create own import upload load export save file json ferrofluid magnetic oil water soap polarity weight' },
  { id: 'interaction', name: 'Manual Interaction', category: 'pour',
    terms: 'brush dropper blow press tools mouse touch radius strength velocity air wind draught draft frequency drop height fall splash impact crown satellite droplets' },

  /*
    The wall: where the picture goes and what shape it is when it gets there.

    It was called Projectors and it was three sections in one — this, the look
    effects now under Lamp & Light, and the film projector now under Inputs —
    so the one place you square up a projector at load-in was also where you
    rode a gel wheel mid-song. What is left is the part that describes the
    venue rather than the look: none of it is saved into a preset.

    The id stays `projectors`. The Wall dot, `openSettingsAt('projectors')` and
    every saved deep link name it, and an id is not something anyone reads.
  */
  { id: 'projectors', name: 'Wall', category: 'stage',
    terms: 'wall projector projectors keystone corner pin mask masks blanking rear projection flip inverted output gain gamma grade flash limit strobe safety second screen hdmi load-in' },
  // Out of the wall's section for the same reason as the mark: it made that
  // section three screens deep, and cutting a picture into shapes is a job of
  // its own.
  { id: 'mapping', name: 'Mapping', category: 'stage',
    terms: 'projection mapping map shapes surfaces circle ellipse triangle rectangle diamond cube box panel pillar cut out quad corners dark between source front plate back plate film alone light add beam beams over edge blend blending seam overlap tile tiles' },
  /*
    A section rather than a row under the wall, because loading a mark and
    placing it is a job somebody does once before doors and then leaves alone,
    and because it is the one thing in here that belongs to whoever is paying
    for the room rather than to the look.
  */
  { id: 'mark', name: 'Logo & Titles', category: 'stage',
    terms: 'logo mark brand branding title card watermark sponsor client name overlay still image png transparent credit' },
  { id: 'layers', name: 'Plates & LED', category: 'stage',
    terms: 'layer layers plates blend mode screen multiply overlay exclusion count led platform spin flick auto spin turntable dish rpm tempo beats a turn reverse spin' },
  { id: 'simulation', name: 'Simulation', category: 'stage',
    terms: 'fluid grid solver resolution gpu cpu engine performance quality sharpness granulation grain' },
];

/**
 * Sections that were folded into another, by their old id.
 *
 * An id outlives its section: a saved desk layout names it as a panel, a
 * deep link or `openSettingsAt` call may still ask for it. Each lands on the
 * section that now holds its controls (`resolveSection`), so a layout saved
 * with Sound Mappings on its deck opens with Sound there instead.
 */
export const MERGED_SECTIONS: Record<string, string> = {
  'audio-mappings': 'audio-input',
  heat: 'physics',
};
export const resolveSection = (id: string): string => MERGED_SECTIONS[id] ?? id;

export const SECTION_NAME = new Map(SETTINGS_SECTIONS.map(s => [s.id, s.name]));
export const SECTION_BY_ID = new Map(SETTINGS_SECTIONS.map(s => [s.id, s]));

/** The group a section sits in, for the markup's `data-group`. */
export const groupOf = (id: string): string => SECTION_BY_ID.get(id)?.category ?? '';

/*
  Every control's own label, by the section it lives in.

  The terms above are what a section is *about*; they never included what is
  written on it. So 66 of the 97 slider labels, typed exactly as shown, did not
  find their own section — "bass boost", "film mix", "speed" found nothing, and
  "grain" went to Simulation. The pin list already knows every label and its
  section, so the index is built from that rather than kept by hand.
*/
const LABELS = new Map<string, string>();
for (const p of PINNABLE) LABELS.set(p.section, `${LABELS.get(p.section) ?? ''} ${p.label}`);

/** Everything a search can match for a section: name, terms and labels. */
export function sectionSearchText(sec: SettingsSection): string {
  return `${sec.name} ${sec.terms} ${LABELS.get(sec.id) ?? ''}`.toLowerCase();
}

/**
 * Does a query hit this section? The one answer the rail and the pane share.
 * Word by word — every word has to land somewhere — so "film mix" and
 * "bass boost" work, and the order they are typed in does not matter.
 */
export function sectionMatches(sec: SettingsSection, q: string): boolean {
  const hay = sectionSearchText(sec);
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}

/** The section the panel opens on when nothing says otherwise. */
export const FIRST_SECTION = SETTINGS_SECTIONS[0].id;
