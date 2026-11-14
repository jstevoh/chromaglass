/**
 * OSC out and MIDI, for the remote link to report and the owner's assistant
 * to switch (PLAN 44k-14; the relay's rules are server/assistantOutputs.js).
 *
 * Why a holder here rather than a prop, as soundNow.ts and mediaNow.ts are:
 * OSC out's switch is useShowFeed's, MIDI is useMidi's under useControllers,
 * and the remote link is useRemote's, all three called from App(), which is
 * over its size ceiling and may not grow (`npm run sizes`). The state stays
 * those hooks': this holds a copy of it for reading and the doors that
 * change it, the same doors the Sound panel's OSC out row and the MIDI
 * panel's switch and port pickers use.
 *
 * Ports are named, never by Web MIDI's ids: an id is an opaque string the
 * performer never sees, and the assistant is asked for "the APC", not for
 * an id. The ids stay here, for the door. MIDI learning is not here at all:
 * it needs a hand on the controller.
 */
import { useSyncExternalStore } from 'react';
import type { MidiNow, OscOutNow, OutputsNow } from '../lib/remoteProtocol';

export type { MidiNow, OscOutNow, OutputsNow };

type Device = { id: string; name: string };
let now: OutputsNow = { oscOut: null, midi: null };
let midiDevices: { inputs: Device[]; outputs: Device[] } = { inputs: [], outputs: [] };
const listeners = new Set<() => void>();
const take = (next: OutputsNow) => { if (JSON.stringify(next) === JSON.stringify(now)) return; now = next; for (const l of listeners) l(); };

/** OSC out's row as useShowFeed holds it (null until a show server says it is there). */
export function publishOscOut(o: OscOutNow | null): void {
  take({ ...now, oscOut: o ? { on: o.on, target: o.target, pro: o.pro, says: o.says } : null });
}

/** MIDI as useMidi holds it, ports by id; names out, ids kept for the door. */
export function publishMidi(m: {
  supported: boolean; enabled: boolean; open: boolean; error: string | null; inputs: Device[]; outputs: Device[];
  ports: { input: string; output: string }; clocked: boolean; map: { name: string; bindings: unknown[] };
}): void {
  midiDevices = { inputs: m.inputs.map((d) => ({ id: d.id, name: d.name })), outputs: m.outputs.map((d) => ({ id: d.id, name: d.name })) };
  const named = (id: string, list: Device[], words: string[], fallback: string) => (words.includes(id) ? id : list.find((d) => d.id === id)?.name ?? fallback);
  take({ ...now, midi: {
    supported: m.supported, on: m.enabled, open: m.open, error: m.error,
    inputs: midiDevices.inputs.map((d) => d.name), outputs: midiDevices.outputs.map((d) => d.name),
    input: named(m.ports.input, midiDevices.inputs, ['all'], 'all'), output: named(m.ports.output, midiDevices.outputs, ['auto', 'off'], 'auto'),
    clocked: m.clocked, map: { name: m.map.name, bindings: m.map.bindings.length },
  } });
}

/** OSC out's switch (useShowFeed's `onOscOut`): false when the target is not address:port. */
type OscOutDoor = (on: boolean, target?: string) => boolean;
/** MIDI on or off and its ports by id; settles with why MIDI did not open, or null. */
type MidiDoor = (want: { on?: boolean; input?: string; output?: string }) => Promise<string | null>;
let oscDoor: OscOutDoor | null = null;
let midiDoor: MidiDoor | null = null;
export function setOscOutDoor(d: OscOutDoor | null): void { oscDoor = d; }
export function setMidiDoor(d: MidiDoor | null): void { midiDoor = d; }

const find = (name: unknown, list: Device[], words: string[]): string | undefined => {
  const want = typeof name === 'string' ? name.trim().toLowerCase() : '';
  if (words.includes(want)) return want;
  return list.find((d) => d.name === name)?.id ?? list.find((d) => d.name.trim().toLowerCase() === want)?.id;
};

/**
 * The relay's `assistant-outputs` for the page (`osc-out`, `midi`): done, or
 * why not. A port is judged again on the page's own list, since the guard's
 * copy runs behind (a controller unplugged between the read and the call is
 * refused here, with the list as it is).
 */
export async function askOutputs(m: { do?: unknown; on?: unknown; target?: unknown; input?: unknown; output?: unknown }): Promise<string | null> {
  if (m.do === 'osc-out') {
    if (typeof m.on !== 'boolean') return 'osc-out: on, as true or false';
    if (!oscDoor || !now.oscOut) return 'OSC out is the show server\'s, and this page has none';
    return oscDoor(m.on, typeof m.target === 'string' ? m.target : undefined) ? null : `osc-out: target as address:port, not ${String(m.target)}`;
  }
  if (m.do === 'midi') {
    if (!midiDoor || !now.midi) return 'MIDI is not running';
    if (!now.midi.supported) return 'this browser has no Web MIDI';
    const want: { on?: boolean; input?: string; output?: string } = {};
    if (typeof m.on === 'boolean') want.on = m.on;
    if (m.input !== undefined) {
      const id = find(m.input, midiDevices.inputs, ['all']);
      if (id === undefined) return `no MIDI input "${String(m.input)}" (there are: ${[...midiDevices.inputs.map((d) => d.name), 'all'].join(', ')})`;
      want.input = id;
    }
    if (m.output !== undefined) {
      const id = find(m.output, midiDevices.outputs, ['auto', 'off']);
      if (id === undefined) return `no MIDI output "${String(m.output)}" (there are: ${[...midiDevices.outputs.map((d) => d.name), 'auto', 'off'].join(', ')})`;
      want.output = id;
    }
    if (!Object.keys(want).length) return 'midi: on, input or output';
    return midiDoor(want);
  }
  return `outputs: osc-out or midi on the page, not ${String(m.do)}`;
}

/**
 * The MIDI door over useMidi's own calls (`read` gives the hook's latest
 * render). Switching on settles once Web MIDI has answered: on is only
 * asked until then, and a refusal (the browser's permission, or no MIDI
 * service) comes back as `enabled` false with its `error`, so the answer is
 * never "done" for a MIDI that did not open. A state from before the call is
 * not taken for the answer: `enable()` clears the error in the same render that
 * turns on, so an error read after it is the new one, and a refusal that lands
 * before the first look (a permission already denied rejects in milliseconds)
 * is still the answer, never a five-second wait.
 */
export function midiDoorOf(read: () => { enabled: boolean; open: boolean; error: string | null; enable: () => void; disable: () => void; choosePorts: (p: Partial<{ input: string; output: string }>) => void }, waitMs = 5000): MidiDoor {
  return async (want) => {
    const m = read();
    if (want.input !== undefined || want.output !== undefined) m.choosePorts({ ...(want.input === undefined ? {} : { input: want.input }), ...(want.output === undefined ? {} : { output: want.output }) });
    if (want.on === false) { m.disable(); return null; }
    if (want.on !== true || m.open) return null;
    m.enable();
    let seen = false;
    for (let t = 0; t < waitMs; t += 100) {
      await new Promise((r) => setTimeout(r, 100));
      const n = read();
      if (n.enabled) seen = true;
      if (seen && n.open) return null;
      if (!n.enabled && (seen || n.error)) return `MIDI did not open: ${n.error ?? 'it was switched off'}`;
    }
    return `MIDI did not open in ${waitMs / 1000} s (the browser may be asking for permission)`;
  };
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
/** The copy the state carries, for the check. */
export const readOutputs = (): OutputsNow => now;
export const useOutputsNow = () => useSyncExternalStore(subscribe, () => now, () => now);
