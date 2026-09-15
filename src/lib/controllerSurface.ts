/**
 * The face of a controller, drawn to scale, so a map can be made by pointing
 * at the thing your hands will be on rather than by reading a list of CC
 * numbers — and so the same picture can be printed and taped to the desk.
 *
 * Every control carries the MIDI address it actually sends, taken from the
 * manufacturer's protocol document, so what the picture says and what the
 * hardware does cannot drift apart.
 */
export type ControlShape = 'pad' | 'button' | 'round' | 'knob' | 'fader';

export interface SurfaceControl {
  /** Stable id, also the React key. */
  id: string;
  /** What is printed on the hardware next to it. */
  label: string;
  shape: ControlShape;
  /** Position and size in the surface's own units (see `width` / `height`). */
  x: number; y: number; w: number; h: number;
  kind: 'note' | 'cc';
  number: number;
  /**
   * The channel it sends on. The APC40 uses the channel to say which track
   * strip a control belongs to; everything else sends on channel 0.
   */
  channel: number;
  /** Encoders send nudges rather than a position, so they bind as relative. */
  relative?: boolean;
  /** Full-colour pad: the app can light it back in the dye it cues. */
  rgb?: boolean;
  /** For grouping and for the legend. */
  section: 'grid' | 'scene' | 'strip' | 'fader' | 'device' | 'track' | 'transport';
}

export interface ControllerSurface {
  id: string;
  name: string;
  /** The device name Web MIDI reports, for matching an attached controller. */
  match: RegExp;
  width: number;
  height: number;
  controls: SurfaceControl[];
  /** Shown under the picture: the things worth knowing before a show. */
  notes: string[];
}

const PAD = 46, GAP = 6;
const GRID_X = 286, GRID_Y = 44;

/**
 * Akai APC40 mkII, from the Communications Protocol v1.2.
 *
 * Clip pads are notes 0x00–0x27 and ignore the channel; the four button rows
 * under the grid are notes 0x30–0x34 and use the channel to say which of the
 * eight tracks they belong to. Faders are CC 7 per channel, the master CC 14,
 * the device knobs CC 16–23 and the track knobs CC 48–55.
 */
function apc40Mk2(): ControllerSurface {
  const c: SurfaceControl[] = [];
  const add = (x: Omit<SurfaceControl, 'channel'> & { channel?: number }) => c.push({ channel: 0, ...x });

  // The 8 × 5 grid of clip pads. Note 0 is the bottom-left pad, so the top row
  // (the one a hand reaches first) is notes 32–39.
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 8; col++) {
      const note = (4 - row) * 8 + col;
      add({
        id: `pad-${note}`, label: `Clip ${col + 1}/${5 - row}`, shape: 'pad', rgb: true, section: 'grid',
        x: GRID_X + col * (PAD + GAP), y: GRID_Y + row * (PAD + GAP), w: PAD, h: PAD,
        kind: 'note', number: note,
      });
    }
  }

  // Scene launch down the right of the grid, with the master select under it.
  for (let row = 0; row < 5; row++) {
    add({
      id: `scene-${row}`, label: `Scene ${row + 1}`, shape: 'button', rgb: true, section: 'scene',
      x: GRID_X + 8 * (PAD + GAP) + 10, y: GRID_Y + row * (PAD + GAP), w: 62, h: PAD,
      kind: 'note', number: 0x52 + row,
    });
  }
  add({ id: 'master-sel', label: 'Master', shape: 'button', section: 'scene', x: GRID_X + 8 * (PAD + GAP) + 10, y: GRID_Y + 5 * (PAD + GAP), w: 62, h: 30, kind: 'note', number: 0x50 });
  add({ id: 'stop-all', label: 'Stop All Clips', shape: 'button', section: 'scene', x: GRID_X + 8 * (PAD + GAP) + 10, y: GRID_Y + 5 * (PAD + GAP) + 36, w: 62, h: 30, kind: 'note', number: 0x51 });

  // The four per-track rows under the grid, then the fader and its select.
  // Short labels: these buttons are 28 units wide, and the column they sit in
  // already says which track they belong to.
  const rows: { note: number; label: string; full: string }[] = [
    { note: 0x32, label: 'Act', full: 'Activator' },
    { note: 0x42, label: 'A|B', full: 'Crossfade assign' },
    { note: 0x31, label: 'Solo', full: 'Solo' },
    { note: 0x30, label: 'Arm', full: 'Record arm' },
    { note: 0x34, label: 'Stop', full: 'Clip stop' },
  ];
  const stripY = GRID_Y + 5 * (PAD + GAP) + 14;
  rows.forEach((r, i) => {
    for (let t = 0; t < 8; t++) {
      add({
        id: `strip-${r.note}-${t}`, label: r.label, shape: 'round', section: 'strip',
        x: GRID_X + t * (PAD + GAP) + 9, y: stripY + i * 30, w: 28, h: 22,
        kind: 'note', number: r.note, channel: t,
      });
    }
  });

  const faderY = stripY + rows.length * 30 + 12;
  for (let t = 0; t < 8; t++) {
    add({ id: `fader-${t}`, label: `Fader ${t + 1}`, shape: 'fader', section: 'fader', x: GRID_X + t * (PAD + GAP) + 12, y: faderY, w: 22, h: 96, kind: 'cc', number: 7, channel: t });
    add({ id: `select-${t}`, label: 'Sel', shape: 'round', section: 'fader', x: GRID_X + t * (PAD + GAP) + 9, y: faderY + 102, w: 28, h: 22, kind: 'note', number: 0x33, channel: t });
  }
  add({ id: 'fader-master', label: 'Master Fader', shape: 'fader', section: 'fader', x: GRID_X + 8 * (PAD + GAP) + 28, y: faderY, w: 22, h: 96, kind: 'cc', number: 0x0E });

  // Device control, left of the grid: eight knobs over their buttons.
  for (let i = 0; i < 8; i++) {
    add({
      id: `dev-knob-${i}`, label: `Device ${i + 1}`, shape: 'knob', section: 'device',
      x: 34 + (i % 4) * 58, y: 54 + Math.floor(i / 4) * 66, w: 46, h: 46,
      kind: 'cc', number: 0x10 + i,
    });
  }
  const devButtons: [number, string][] = [
    [0x3A, 'Device ←'], [0x3B, 'Device →'], [0x3C, 'Bank ←'], [0x3D, 'Bank →'],
    [0x3E, 'Dev On/Off'], [0x3F, 'Dev Lock'], [0x40, 'Clip/Dev'], [0x41, 'Detail'],
  ];
  devButtons.forEach(([n, label], i) => add({
    id: `dev-btn-${n}`, label, shape: 'button', section: 'device',
    x: 34 + (i % 4) * 58, y: 196 + Math.floor(i / 4) * 34, w: 50, h: 26, kind: 'note', number: n,
  }));

  // Track control, right of the grid.
  for (let i = 0; i < 8; i++) {
    add({
      id: `trk-knob-${i}`, label: `Track ${i + 1}`, shape: 'knob', section: 'track',
      x: 806 + (i % 4) * 58, y: 54 + Math.floor(i / 4) * 66, w: 46, h: 46,
      kind: 'cc', number: 0x30 + i,
    });
  }
  ([[0x57, 'Pan'], [0x58, 'Sends'], [0x59, 'User']] as [number, string][]).forEach(([n, label], i) => add({
    id: `trk-btn-${n}`, label, shape: 'button', section: 'track',
    x: 806 + i * 58, y: 196, w: 50, h: 26, kind: 'note', number: n,
  }));

  // Tempo, cue, the crossfader and the transport, along the bottom right.
  add({ id: 'tempo', label: 'Tempo', shape: 'knob', section: 'transport', x: 806, y: 252, w: 46, h: 46, kind: 'cc', number: 0x0D, relative: true });
  add({ id: 'cue', label: 'Cue Level', shape: 'knob', section: 'transport', x: 864, y: 252, w: 46, h: 46, kind: 'cc', number: 0x2F, relative: true });
  add({ id: 'crossfader', label: 'Crossfader', shape: 'fader', section: 'transport', x: 806, y: 322, w: 104, h: 24, kind: 'cc', number: 0x0F });

  const transport: [number, string][] = [
    [0x5B, 'Play'], [0x5C, 'Stop'], [0x5D, 'Record'], [0x66, 'Session Rec'],
    [0x63, 'Tap Tempo'], [0x5A, 'Metronome'], [0x64, 'Nudge −'], [0x65, 'Nudge +'],
    [0x62, 'Shift'], [0x5E, 'Up'], [0x5F, 'Down'], [0x61, 'Left'], [0x60, 'Right'],
  ];
  transport.forEach(([n, label], i) => add({
    id: `tr-${n}`, label, shape: 'button', section: 'transport',
    x: 806 + (i % 3) * 58, y: 362 + Math.floor(i / 3) * 32, w: 52, h: 26, kind: 'note', number: n,
  }));

  return {
    id: 'apc40mk2',
    name: 'APC40 mkII',
    match: /apc40/i,
    width: 1064,
    height: 632,
    controls: c,
    notes: [
      'Clip pads and scene buttons are full colour: each one lights in the dye or preset it cues.',
      'The four button rows under the grid send the same note on a different channel, one per track.',
      'Tempo and Cue Level are endless encoders, so they bind as relative and nudge instead of jumping.',
    ],
  };
}

export const SURFACES: ControllerSurface[] = [apc40Mk2()];

/** The surface for an attached controller, by the name Web MIDI reports. */
export function surfaceFor(deviceName: string | null | undefined): ControllerSurface | null {
  if (!deviceName) return null;
  return SURFACES.find(s => s.match.test(deviceName)) ?? null;
}

/** The key a binding's source shares with a control on the picture. */
export const controlKey = (c: { kind: string; channel: number; number: number }) => `${c.kind}:${c.channel}:${c.number}`;
