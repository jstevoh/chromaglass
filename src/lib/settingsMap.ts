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
 * Four groups, by what you are doing when you open one.
 *
 * Not by how often: that was the old Perform/Setup split, and the trouble with
 * it was that "how often" is not a thing you can search for. "The camera is an
 * input" is.
 */
export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  { id: 'live',   name: 'Live',    hint: 'running the show' },
  { id: 'inputs', name: 'Inputs',  hint: 'what drives the show' },
  { id: 'look',   name: 'Look',    hint: 'what it looks like' },
  { id: 'plate',  name: 'Plate',   hint: 'the liquid itself' },
  { id: 'stage',  name: 'Stage',   hint: 'the room and the machine' },
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
  { id: 'master', name: 'Master', category: 'live',
    terms: 'master house lights dimmer blackout black out flash limit strobe photosensitive epilepsy safety speed pace tempo of the plate' },
  { id: 'audio-input', name: 'Sound', category: 'inputs',
    terms: 'sound microphone mic system file band device tempo bpm tap midi clock beat prediction calibration calibrate recalibrate song' },
  { id: 'audio-mappings', name: 'Sound Mappings', category: 'inputs',
    terms: 'sound bass mid treble energy timbre map drive reactive band velocity density colour color rotation' },
  { id: 'room', name: 'The Room', category: 'inputs',
    terms: 'camera video webcam people crowd dancers track tracking hands motion sensor floor deadzone smoothing mirror flip presence drive' },
  /*
    The film projector, out of Projectors.

    It is an input — a reel, a camera on a real dish, another window — and it
    drives the plate the way the room does, so it sits with the other things
    that drive the show rather than in a Stage section between the corner pin
    and a gel wheel. What it looks like on the wall is Film Mix and Film Key,
    here too, because nobody loads a reel and then goes to a different
    section to see it.
  */
  { id: 'film', name: 'Film', category: 'inputs',
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
  { id: 'patches', name: 'Patches', category: 'inputs',
    terms: 'patch patches patch bay modular route routing mapping mappings map source feature control depth impact master lfo envelope shape shapes modulator room film sound' },
  { id: 'midi', name: 'Controller', category: 'inputs',
    terms: 'midi apc40 apc mini launchpad nanokontrol launch control xl fader knob pad learn map bank shift soft takeover led clock controller akai novation korg usb' },

  { id: 'look', name: 'Light Show Look', category: 'look',
    terms: 'turbulence blobs glow relief bubbles rock saturation gloss blur look colour color vivid grain size' },
  { id: 'show', name: 'Show', category: 'look',
    terms: 'hue journey colour color beat squeeze background loop dish vignette spread beads cells' },
  /*
    A section of its own, because it is played rather than set.

    It was three-quarters of one control buried in Show, between Background
    Loop and Round Dish — a section whose own terms list runs "hue journey
    beat squeeze background loop kaleidoscope dish vignette projectors beads
    cells", which is a drawer rather than a subject. Two of its three
    dimensions were constants in the shader, so there was nothing to group.
    Now there is.
  */
  { id: 'kaleidoscope', name: 'Kaleidoscope', category: 'look',
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
  { id: 'camera', name: 'Camera', category: 'look',
    terms: 'photograph paper focus aperture bloom chromatic aberration refraction droplets thin film lens depth of field' },
  { id: 'macro', name: 'Macro Closeup', category: 'look',
    terms: 'zoom bead chase magnify closeup detail cells lacing depth relief' },
  { id: 'automation', name: 'Automation', category: 'look',
    terms: 'evolve random drops air bursts rate dye budget' },

  { id: 'squish', name: 'Squish Plate', category: 'plate',
    terms: 'plate pressure squeeze film hele-shaw gap thickness viscosity thick thin smear drip rain' },
  { id: 'heat', name: 'Heat Slide', category: 'plate',
    terms: 'temperature buoyancy convection lamp warmth slide' },
  // The old names of Momentum, Updraft and Vibration stay findable, as Grain
  // Fineness's does under Light Show Look: someone who learned them as
  // Damping, Blow Velocity, Vibration Freq and Grain Size will type those.
  { id: 'physics', name: 'Fluid Physics', category: 'plate',
    terms: 'viscosity diffusion vorticity immiscibility fingering surface tension advection damping friction' },
  { id: 'interaction', name: 'Manual Interaction', category: 'plate',
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
    terms: 'projection mapping map shapes surfaces circle ellipse triangle rectangle diamond cube box panel pillar cut out quad corners dark between' },
  /*
    A section rather than a row under the wall, because loading a mark and
    placing it is a job somebody does once before doors and then leaves alone,
    and because it is the one thing in here that belongs to whoever is paying
    for the room rather than to the look.
  */
  { id: 'mark', name: 'Logo & Titles', category: 'stage',
    terms: 'logo mark brand branding title card watermark sponsor client name overlay still image png transparent credit' },
  { id: 'layers', name: 'Multi-Layer Mixer', category: 'stage',
    terms: 'layer blend mode screen multiply overlay exclusion count mixer led platform' },
  { id: 'simulation', name: 'Simulation', category: 'stage',
    terms: 'fluid grid solver resolution gpu cpu engine performance quality sharpness granulation grain' },
];

export const SECTION_NAME = new Map(SETTINGS_SECTIONS.map(s => [s.id, s.name]));
export const SECTION_BY_ID = new Map(SETTINGS_SECTIONS.map(s => [s.id, s]));

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
