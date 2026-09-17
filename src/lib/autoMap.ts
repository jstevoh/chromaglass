/**
 * Learn a controller by watching it.
 *
 * Five controllers have factory maps, and they are the right answer when you
 * own one: they know where the master fader is and which pads are a grid,
 * because a person read the manual. Everything else — and everything else is
 * most of what gets carried to a gig — meant MIDI learn, one control at a
 * time, forty times, in a venue, before doors.
 *
 * So: press a button, sweep every fader and press every pad, and this works
 * out what kind of surface it is from what arrived. Nothing is asked about the
 * hardware and no device list has to be kept up to date, because the only
 * thing it uses is the shape of the messages.
 *
 * ## What it can tell apart, and how
 *
 * A **fader or knob** sends a continuous CC: many distinct values spread over
 * most of the range. An **endless encoder** also sends a CC, but it has no
 * stop — it reports *nudges*, so its values huddle at the two ends (1–8 up,
 * 120–127 down) and never sit in the middle. That difference is the whole
 * test, and it matters: bound as an absolute fader an encoder would slam the
 * setting to one end on the first click. A **pad or button** sends a note. A
 * button that sends CC 0 and CC 127 and nothing between is a button too, which
 * is what half the transport rows on cheap controllers do.
 *
 * ## The order, which is the opinion
 *
 * Controls are taken in ascending channel-then-number, because that is
 * left-to-right on nearly every controller ever made. Then:
 *
 *   - **The last continuous control is the dimmer**, when there are at least
 *     three. The rightmost fader is the master on every desk since the
 *     seventies, and the dimmer is the one control that can take the room down
 *     — it should be where a hand finds it without looking. With fewer than
 *     three there is no "master" to speak of, so they all go to the ride list
 *     and the dimmer stays on the keyboard's B.
 *   - **The rest ride the show in the order a hand reaches for them**: sound
 *     drive first, because that is the one that makes it look like it is
 *     listening, then speed, evolve, turbulence, the beat kick, the zoom.
 *   - **More settings than faders go on shift layers**, and a spare button
 *     gets Bank +. Nine faders cannot reach forty settings and every desk since
 *     the eighties has answered that the same way.
 *   - **A block of pads is a preset grid**, with the last eight kept for dyes
 *     when the block is big enough to spare them. Stray notes become the
 *     transport: Go first, then blackout, then tap tempo.
 *
 * All of it is arithmetic over a list of observed messages, so
 * `scripts/panel.mjs` drives it with surfaces it makes up — an APC-shaped one,
 * a fader box, a pad grid, one lonely knob — and checks what comes out.
 */

import {
  LEARNABLE_SETTINGS, MIDI_BANKS, MIDI_FORMAT,
  type MidiAction, type MidiBinding, type MidiEvent, type MidiMap, type MidiSource,
} from './midi';
import type { VisualizerSettings } from '../types';

/** What one control turned out to be. */
export type ControlKind = 'continuous' | 'encoder' | 'button';

export interface SeenControl {
  source: MidiSource;
  kind: ControlKind;
  /** How many messages it sent while watching. */
  messages: number;
}

/** How many messages before a CC is worth judging at all. */
const ENOUGH = 4;
/** A continuous control has to have moved over at least this much of its range. */
const TRAVEL = 20;
/** At or above this is the top of the range: a button's "on", an encoder's "down". */
const NUDGE_HIGH = 119;
/** Below this is the bottom of it. Anything between the two is a position. */
const NUDGE_LOW = 8;

/**
 * Everything the controller said, while it was being asked.
 *
 * Deliberately not a hook and not a class over the MIDI port: it takes events
 * and hands back a reading, which is what lets a harness drive it with a list.
 */
export class SurfaceWatcher {
  private readonly seen = new Map<string, {
    source: MidiSource;
    messages: number;
    min: number;
    max: number;
    distinct: Set<number>;
    /** True once a value landed in the middle of the range — a stop, not a nudge. */
    middle: boolean;
    firstAt: number;
  }>();
  private order = 0;

  reset(): void {
    this.seen.clear();
    this.order = 0;
  }

  /** One message. Note-offs are ignored: a press and its release are one control. */
  observe(e: MidiEvent): void {
    if (e.kind === 'noteoff') return;
    const kind = e.kind === 'cc' ? 'cc' : 'note';
    const key = `${kind}:${e.channel}:${e.number}`;
    let s = this.seen.get(key);
    if (!s) {
      s = {
        source: { kind, channel: e.channel, number: e.number },
        messages: 0, min: 127, max: 0, distinct: new Set(), middle: false,
        firstAt: this.order++,
      };
      this.seen.set(key, s);
    }
    s.messages++;
    s.min = Math.min(s.min, e.value);
    s.max = Math.max(s.max, e.value);
    // Capped: a swept fader sends hundreds and the only question is "many".
    if (s.distinct.size < 40) s.distinct.add(e.value);
    if (e.value > NUDGE_LOW && e.value < NUDGE_HIGH) s.middle = true;
  }

  /** How many of each kind so far, for a panel that counts them in. */
  get tally(): { continuous: number; encoder: number; button: number } {
    const out = { continuous: 0, encoder: 0, button: 0 };
    for (const c of this.controls()) out[c.kind]++;
    return out;
  }

  /**
   * What was found, in the order a hand meets it: channel, then number.
   *
   * Not the order it was touched. Someone sweeping faders rarely does it
   * strictly left to right, and the resulting map would then depend on the
   * order they happened to wiggle things — which is the kind of thing that
   * makes a feature feel broken without ever being wrong.
   */
  controls(): SeenControl[] {
    const out: SeenControl[] = [];
    for (const s of this.seen.values()) {
      if (s.source.kind === 'note') {
        out.push({ source: s.source, kind: 'button', messages: s.messages });
        continue;
      }
      if (s.messages < ENOUGH) continue;              // a stray CC, not a control
      const sawZero = s.distinct.has(0);

      /*
        A button wired to a CC, before anything else.

        It and a two's-complement encoder look almost identical — two values,
        both at the ends, nothing in between — and the thing that tells them
        apart is *zero*. A button sends 0 for "off". An encoder never does,
        because on an encoder 0 would mean "no change" and there is no reason
        to send it. Testing for the encoder first got this backwards and every
        transport button on a cheap controller came out as a knob.
      */
      if (s.distinct.size <= 2 && sawZero && s.max >= NUDGE_HIGH) {
        out.push({ source: s.source, kind: 'button', messages: s.messages });
        continue;
      }
      // Only ever at the ends and never zero: a nudge, not a position.
      if (!s.middle && !sawZero) {
        out.push({ source: s.source, kind: 'encoder', messages: s.messages });
        continue;
      }
      /*
        The other encoder convention: a tight cluster either side of 64, one
        step down and one step up. It has middle values, so the test above
        cannot see it, and its travel is a couple of counts, so the continuous
        test below would throw it away — it would simply vanish from the map.
      */
      if (s.distinct.size <= 4 && s.max - s.min <= 6 && s.min >= 60 && s.max <= 68) {
        out.push({ source: s.source, kind: 'encoder', messages: s.messages });
        continue;
      }
      if (s.max - s.min >= TRAVEL && s.distinct.size >= 4) {
        out.push({ source: s.source, kind: 'continuous', messages: s.messages });
      }
    }
    return out.sort((a, b) =>
      a.source.channel - b.source.channel || a.source.number - b.source.number);
  }
}

/**
 * The master. Last, not first — the rightmost fader is the master on every
 * desk since the seventies, and this is the one control that takes the room
 * down.
 */
export const MASTER_RIDE: keyof VisualizerSettings = 'dimmer';

/**
 * What a hand reaches for, in the order it reaches for it.
 *
 * Sound Drive leads because it is the control that makes the plate look like
 * it is listening, and a show with nothing else mapped still works with that
 * one fader. Speed and Evolve next: the two that decide whether the room feels
 * like it is moving. Then the ones you ride into a chorus.
 */
export const RIDE_ORDER: (keyof VisualizerSettings)[] = [
  'audioImpact', 'globalSpeed', 'automateRate', 'turbulenceScale',
  'beatSqueeze', 'macroZoom', 'dyeBudget', 'bloom',
  'saturationBoost', 'granulation', 'lightPlay', 'hueJourney',
  'fingering', 'beads', 'cells', 'lumia',
  'sceneDrive', 'filmDrive', 'lampMotion', 'iridescence',
];

/**
 * The buttons, in the order a show needs them.
 *
 * Go first: the desk's safe way to change a look in front of a room is the one
 * thing a controller should always be able to do. Blackout second, because it
 * is the one you reach for when something has gone wrong.
 */
export const ACTION_ORDER: MidiAction[] = [
  'go', 'blackout-toggle', 'tap-tempo', 'cue-next', 'cue-prev', 'revert',
  'play-toggle', 'automate-toggle', 'macro-toggle', 'lucky',
  'drain', 'clear', 'seed', 'overlays-toggle', 'record-toggle',
  'seq-play-pause', 'seq-next', 'seq-prev',
  'preset-next', 'preset-prev', 'tempo-clear', 'scene-toggle',
];

/** A block of pads this big is a grid worth putting presets on. */
const GRID_MIN = 8;
/** And one this big can spare its last row for dyes. */
const GRID_WITH_DYES = 16;

const RANGE = new Map(LEARNABLE_SETTINGS.map(s => [s.key, s]));
const settingTarget = (key: keyof VisualizerSettings) => {
  const s = RANGE.get(key)!;
  return { kind: 'setting' as const, key, min: s.min, max: s.max };
};
const idOf = (s: MidiSource, suffix: string) => `auto-${s.kind}:${s.channel}:${s.number}->${suffix}`;

/** The longest run of consecutive note numbers on one channel. */
function longestRun(notes: SeenControl[]): SeenControl[] {
  let best: SeenControl[] = [];
  let run: SeenControl[] = [];
  for (const n of notes) {
    const prev = run[run.length - 1];
    if (prev && prev.source.channel === n.source.channel && n.source.number === prev.source.number + 1) {
      run.push(n);
    } else {
      run = [n];
    }
    if (run.length > best.length) best = [...run];
  }
  return best;
}

export interface AutoMapResult {
  map: MidiMap;
  /** What it decided, in words, for a panel that has to say what it just did. */
  summary: { rides: number; banks: number; presets: number; dyes: number; actions: number };
}

/**
 * Build a map from what was seen.
 *
 * `presetIds` and `paletteSize` come from the app so the grid is filled with
 * the looks that actually exist rather than with a guess about how many there
 * are.
 */
export function buildAutoMap(
  controls: SeenControl[],
  presetIds: string[],
  paletteSize: number,
  deviceName?: string | null,
): AutoMapResult {
  const bindings: MidiBinding[] = [];
  const knobs = controls.filter(c => c.kind === 'continuous' || c.kind === 'encoder');
  const buttons = controls.filter(c => c.kind === 'button');

  // ── The faders ──
  //
  // The master comes off the end first, so the ride list fills from the left
  // and the dimmer is where a hand expects it without counting.
  let master: SeenControl | null = null;
  let riders = knobs;
  if (knobs.length >= 3) {
    master = knobs[knobs.length - 1];
    riders = knobs.slice(0, -1);
  }

  let banksUsed = 0;
  let rides = 0;
  for (let i = 0; i < RIDE_ORDER.length; i++) {
    const c = riders[i % Math.max(1, riders.length)];
    if (!c || riders.length === 0) break;
    const bank = Math.floor(i / riders.length);
    if (bank >= MIDI_BANKS) break;
    if (i >= riders.length && bank === 0) break;
    bindings.push({
      id: idOf(c.source, `${RIDE_ORDER[i]}-b${bank}`),
      source: c.source,
      target: settingTarget(RIDE_ORDER[i]),
      mode: c.kind === 'encoder' ? 'relative' : 'absolute',
      // The first pass is always-live; the rest belong to a layer. A fader
      // with no bank is one you can trust whatever else you pressed.
      ...(bank === 0 ? {} : { bank }),
    });
    rides++;
    banksUsed = Math.max(banksUsed, bank);
  }
  if (master) {
    bindings.push({
      id: idOf(master.source, 'dimmer'),
      source: master.source,
      target: settingTarget(MASTER_RIDE),
      mode: master.kind === 'encoder' ? 'relative' : 'absolute',
    });
    rides++;
  }

  // ── The pads ──
  const grid = longestRun(buttons);
  let presets = 0;
  let dyes = 0;
  let spare = buttons;
  if (grid.length >= GRID_MIN) {
    const forDyes = grid.length >= GRID_WITH_DYES ? Math.min(8, paletteSize) : 0;
    const padsForPresets = grid.slice(0, grid.length - forDyes);
    padsForPresets.forEach((c, i) => {
      if (i >= presetIds.length) return;
      bindings.push({
        id: idOf(c.source, `preset-${presetIds[i]}`),
        source: c.source,
        target: { kind: 'preset', presetId: presetIds[i] },
        mode: 'absolute',
      });
      presets++;
    });
    grid.slice(grid.length - forDyes).forEach((c, i) => {
      bindings.push({
        id: idOf(c.source, `dye-${i}`),
        source: c.source,
        target: { kind: 'dye', paletteIndex: i },
        mode: 'absolute',
      });
      dyes++;
    });
    const inGrid = new Set(grid.map(c => `${c.source.channel}:${c.source.number}`));
    spare = buttons.filter(c => !inGrid.has(`${c.source.channel}:${c.source.number}`));
  }

  // ── The transport ──
  //
  // Bank + goes first when there are layers to step, because a layer you
  // cannot reach is worse than a setting you never mapped.
  const wanted: MidiAction[] = banksUsed > 0 ? ['bank-next', ...ACTION_ORDER] : [...ACTION_ORDER];
  let actions = 0;
  spare.forEach((c, i) => {
    if (i >= wanted.length) return;
    bindings.push({
      id: idOf(c.source, `action-${wanted[i]}`),
      source: c.source,
      target: { kind: 'action', action: wanted[i] },
      mode: 'absolute',
    });
    actions++;
  });

  const name = deviceName ? `Auto: ${deviceName}` : 'Auto-mapped';
  return {
    map: { format: MIDI_FORMAT, version: 1, name, device: deviceName ?? undefined, bindings },
    summary: { rides, banks: banksUsed, presets, dyes, actions },
  };
}
