/**
 * The map of the settings panel: what is in it, and where.
 *
 * Seventeen sections and ninety controls is not a list you scroll. It was one
 * — a single column with a three-way filter on top — and the result was the
 * complaint that wrote this file: the controls existed, and could not be
 * found. So the panel is a rail of named places and one place at a time in the
 * pane, the way every settings screen anyone has used is built.
 *
 * It lives out here rather than inside the panel because three other things
 * need it: the command palette offers a row per section, the desks' pickers
 * group what you can pin by the section it came from, and `scripts/desk.mjs`
 * checks the panel's own source against it.
 */

export interface SettingsCategory { id: string; name: string; hint: string }

/**
 * Four groups, by what you are doing when you open one.
 *
 * Not by how often: that was the old Perform/Setup split, and the trouble with
 * it was that "how often" is not a thing you can search for. "The camera is an
 * input" is.
 */
export const SETTINGS_CATEGORIES: SettingsCategory[] = [
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
  { id: 'audio-input', name: 'Sound', category: 'inputs',
    terms: 'sound microphone mic system file band device tempo bpm tap midi clock beat prediction blackout dimmer calibration song' },
  { id: 'audio-mappings', name: 'Audio Mappings', category: 'inputs',
    terms: 'sound bass mid treble energy timbre map drive reactive band' },
  { id: 'room', name: 'The Room', category: 'inputs',
    terms: 'camera video webcam people crowd dancers track tracking hands motion sensor floor deadzone smoothing mirror presence' },
  { id: 'midi', name: 'Controller', category: 'inputs',
    terms: 'midi apc40 apc mini launchpad nanokontrol launch control xl fader knob pad learn map bank shift soft takeover led clock controller akai novation korg usb' },

  { id: 'look', name: 'Light Show Look', category: 'look',
    terms: 'turbulence blobs glow relief bubbles rock saturation gloss blur look' },
  { id: 'show', name: 'Show', category: 'look',
    terms: 'hue journey beat squeeze background loop kaleidoscope dish vignette projectors beads cells' },
  { id: 'lamp', name: 'Lamp', category: 'look',
    terms: 'light play motion hotspot second lamp iridescence projector bulb' },
  { id: 'camera', name: 'Camera', category: 'look',
    terms: 'photograph paper focus aperture bloom chromatic aberration refraction droplets thin film lens depth of field' },
  { id: 'macro', name: 'Macro Closeup', category: 'look',
    terms: 'zoom bead chase magnify closeup detail cells lacing depth relief' },
  { id: 'automation', name: 'Automation', category: 'look',
    terms: 'evolve random drops air bursts rate dye budget' },

  { id: 'squish', name: 'Squish Plate', category: 'plate',
    terms: 'plate pressure squeeze film hele-shaw gap thickness' },
  { id: 'heat', name: 'Heat Slide', category: 'plate',
    terms: 'temperature buoyancy convection lamp warmth slide' },
  { id: 'physics', name: 'Fluid Physics', category: 'plate',
    terms: 'viscosity diffusion vorticity immiscibility fingering surface tension advection' },
  { id: 'interaction', name: 'Manual Interaction', category: 'plate',
    terms: 'brush dropper blow press tools mouse touch radius strength' },

  { id: 'projectors', name: 'Projectors', category: 'stage',
    terms: 'wall keystone corner pin mask blanking rear projection flip gain gamma flash limit strobe safety second screen hdmi lumia chemistry gel wheel warmth exposure film loop video window tab screen capture share archive internet archive prelinger movie footage' },
  { id: 'layers', name: 'Multi-Layer Mixer', category: 'stage',
    terms: 'layer blend mode screen multiply overlay exclusion count mixer led platform' },
  { id: 'simulation', name: 'Simulation', category: 'stage',
    terms: 'fluid grid solver resolution gpu cpu engine performance quality sharpness granulation grain' },
];

export const SECTION_NAME = new Map(SETTINGS_SECTIONS.map(s => [s.id, s.name]));
export const SECTION_BY_ID = new Map(SETTINGS_SECTIONS.map(s => [s.id, s]));

/** Does a query hit this section? The one answer the rail and the pane share. */
export function sectionMatches(sec: SettingsSection, q: string): boolean {
  return `${sec.name} ${sec.terms}`.toLowerCase().includes(q);
}

/** The section the panel opens on when nothing says otherwise. */
export const FIRST_SECTION = SETTINGS_SECTIONS[0].id;
