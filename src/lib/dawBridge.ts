/**
 * The DAW bridge in the page (PLAN.md 13.7a, docs/dawbridge.md).
 *
 * The show server (`server/dawBridge.js`) listens on 127.0.0.1:9024 for the
 * ChromaGlass Bridge VST3/AU plugin and forwards four things to `display`
 * sockets on `/remote-ws`:
 *   - `{ type: 'daw', on, instance, host, sampleRate, latency, locked }`
 *   - `{ type: 'daw-slot', slot, value }` (32 automation slots at float32)
 *   - `{ type: 'daw-transport', playing, bpm, beat, barBeat, num, den, ahead }`
 *   - binary `CGPC` frames carrying the plugin's 32-bit float PCM audio
 *
 * And the display sends `{ type: 'daw-names', names }` (32 strings) whenever
 * it connects or a slot binding changes in the MIDI map.
 */

import type { VisualizerSettings } from '../types.ts';
import { ANALYSER_FFT_SIZE, ANALYSER_SMOOTHING, AnalyserEmulator } from './analyserEmulator.ts';
import {
  curveOf,
  LEARNABLE_SETTINGS,
  targetLabel,
  valueAt,
  type MidiBinding,
  type MidiMap,
  type MidiSource,
  type MidiTarget,
} from './midi.ts';
import { bytesFromDb } from './soundLevels.ts';

export const DAW_SLOTS = 32;
export const DAW_PORT = 9024;
export const DAW_PROTOCOL = 1;

export interface DawPcmFrame {
  channels: 1 | 2;
  sampleRate: number;
  seq: number;
  samples: Float32Array;
}

/**
 * Decode a binary `CGPC` frame from `/remote-ws` (`docs/dawbridge.md`).
 * Returns null for anything that is not a valid `CGPC` frame.
 */
export function decodeDawPcm(raw: ArrayBuffer | Uint8Array): DawPcmFrame | null {
  const bytes = raw instanceof Uint8Array
    ? raw
    : raw instanceof ArrayBuffer
      ? new Uint8Array(raw)
      : null;
  if (!bytes || bytes.byteLength < 16) return null;
  if (bytes[0] !== 0x43 || bytes[1] !== 0x47 || bytes[2] !== 0x50 || bytes[3] !== 0x43) return null;
  const channels = bytes[4];
  if (channels !== 1 && channels !== 2) return null;
  const bodyBytes = bytes.byteLength - 16;
  if (bodyBytes <= 0 || bodyBytes % (4 * channels) !== 0) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleRate = view.getUint32(8, true);
  const seq = view.getUint32(12, true);
  if (!(sampleRate > 0)) return null;
  const count = bodyBytes / 4;
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    samples[i] = view.getFloat32(16 + i * 4, true);
  }
  return { channels, sampleRate, seq, samples };
}

/** A DAW bridge automation slot (0..31) as a source in the MIDI map. */
export const dawSlotSource = (slot: number): MidiSource => ({
  kind: 'slot',
  channel: 0,
  number: slot,
});

const STEPPED: Partial<Record<keyof VisualizerSettings, number>> = Object.fromEntries(
  LEARNABLE_SETTINGS.filter((s) => s.step).map((s) => [s.key, s.step!]),
);

const onStep = (key: keyof VisualizerSettings, v: number): number => {
  const step = STEPPED[key];
  return step ? Math.round(v / step) * step : v;
};

/**
 * The setting values a DAW slot (0..31) writes at `value` (0..1) through the
 * MIDI learn map, at full float resolution with no 128-step rounding and no
 * soft takeover (`docs/dawbridge.md`).
 */
export function dawSlotSettings(
  map: MidiMap | null | undefined,
  slot: number,
  value: number,
  bank = 0,
): Partial<VisualizerSettings> {
  const out: Partial<VisualizerSettings> = {};
  if (!map || !Array.isArray(map.bindings) || !Number.isInteger(slot) || slot < 0 || slot >= DAW_SLOTS) {
    return out;
  }
  const v = Math.max(0, Math.min(1, value));
  for (const b of map.bindings) {
    if (!b?.source || b.source.kind !== 'slot' || b.source.channel !== 0 || b.source.number !== slot) continue;
    if (b.bank !== undefined && b.bank !== bank) continue;
    if (b.target.kind !== 'setting') continue;
    const t = b.target;
    (out as Record<string, number>)[t.key as string] = onStep(
      t.key,
      valueAt(v, t.min, t.max, curveOf(t.key)),
    );
  }
  return out;
}

/**
 * The 32 slot labels for `/chromaglass/bridge/names`: what each slot is bound
 * to in the MIDI map, or `""` when unbound.
 */
export function dawSlotNames(
  map: MidiMap | null | undefined,
  presetName?: (id: string) => string | undefined,
): string[] {
  const out = Array<string>(DAW_SLOTS).fill('');
  if (!map || !Array.isArray(map.bindings)) return out;
  for (let slot = 0; slot < DAW_SLOTS; slot++) {
    const b = map.bindings.find(
      (x) => x.source.kind === 'slot' && x.source.channel === 0 && x.source.number === slot,
    );
    if (b) out[slot] = targetLabel(b.target, presetName);
  }
  return out;
}

// ── Live bridge state & buses for the page ──────────────────────────────

export interface DawBridgeStatus {
  on: boolean;
  locked?: boolean;
  instance?: string;
  host?: string;
  sampleRate?: number;
  latency?: number;
}

let statusNow: DawBridgeStatus = { on: false };
const statusListeners = new Set<() => void>();

export const getDawBridgeStatus = (): DawBridgeStatus => statusNow;

export function setDawBridgeStatus(next: DawBridgeStatus): void {
  if (
    statusNow.on === next.on &&
    statusNow.locked === next.locked &&
    statusNow.instance === next.instance &&
    statusNow.host === next.host &&
    statusNow.sampleRate === next.sampleRate &&
    statusNow.latency === next.latency
  ) return;
  statusNow = next;
  for (const fn of statusListeners) fn();
}

export function subscribeDawBridge(fn: () => void): () => void {
  statusListeners.add(fn);
  return () => { statusListeners.delete(fn); };
}

/** The followed plugin's reported output buffer latency in seconds, for ear alignment. */
export function dawLatencySeconds(): number {
  if (!statusNow.on || !statusNow.sampleRate || !(statusNow.sampleRate > 0) || !statusNow.latency) return 0;
  return statusNow.latency / statusNow.sampleRate;
}

let slotListener: ((slot: number, value: number) => void) | null = null;
export function setDawSlotListener(fn: ((slot: number, value: number) => void) | null): void {
  slotListener = fn;
}
export function emitDawSlot(slot: number, value: number): void {
  slotListener?.(slot, value);
}

let latestNames: string[] = Array<string>(DAW_SLOTS).fill('');
let namesSender: ((names: string[]) => void) | null = null;

export const getDawSlotNames = (): string[] => latestNames;

export function setDawNamesSender(fn: ((names: string[]) => void) | null): void {
  namesSender = fn;
  if (fn) fn(latestNames);
}

export function publishDawSlotNames(names: string[]): void {
  const clean = Array.from({ length: DAW_SLOTS }, (_, i) => String(names[i] ?? ''));
  const same = clean.every((v, i) => v === latestNames[i]);
  latestNames = clean;
  if (!same) namesSender?.(latestNames);
}

/**
 * Shared handle to the MIDI map's slot bindings for surfaces (such as the
 * phone's More sheet) that inspect, learn or clear DAW slot bindings without
 * threading props through App.tsx.
 */
export interface DawSlotControllerSnapshot {
  bindings: MidiBinding[];
  learning: { target: MidiTarget; mode: 'absolute' | 'relative' } | null;
  presetName: (id: string) => string | undefined;
  learn: (target: MidiTarget) => void;
  cancelLearn: () => void;
  bindSlot: (slot: number, target: MidiTarget) => void;
  removeBinding: (id: string) => void;
}

let slotController: DawSlotControllerSnapshot | null = null;
const controllerListeners = new Set<() => void>();

export const getDawSlotController = (): DawSlotControllerSnapshot | null => slotController;

export function setDawSlotController(next: DawSlotControllerSnapshot | null): void {
  slotController = next;
  for (const fn of controllerListeners) fn();
}

export function subscribeDawSlotController(fn: () => void): () => void {
  controllerListeners.add(fn);
  return () => { controllerListeners.delete(fn); };
}

// ── The DAW audio tap (CGPC frames -> AudioWorklet -> ear's AnalyserNode) ─

const pcmRing = new Float32Array(ANALYSER_FFT_SIZE);
const pcmWindow = new Float32Array(ANALYSER_FFT_SIZE);
let pcmWrite = 0;
let lastPcmAt = -Infinity;

const WORKLET_CODE = `
class CgDawPcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.cap = 32768;
    this.left = new Float32Array(this.cap);
    this.right = new Float32Array(this.cap);
    this.readAt = 0;
    this.writeAt = 0;
    this.port.onmessage = (e) => {
      const { samples, channels } = e.data || {};
      if (!samples || !samples.length) return;
      const frames = channels === 2 ? (samples.length >> 1) : samples.length;
      for (let i = 0; i < frames; i++) {
        const w = (this.writeAt + i) & (this.cap - 1);
        if (channels === 2) {
          this.left[w] = samples[i * 2];
          this.right[w] = samples[i * 2 + 1];
        } else {
          this.left[w] = samples[i];
          this.right[w] = samples[i];
        }
      }
      this.writeAt = (this.writeAt + frames) & (this.cap - 1);
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0];
    if (!out || !out.length) return true;
    const l = out[0];
    const r = out[1] || l;
    for (let i = 0; i < l.length; i++) {
      if (this.readAt !== this.writeAt) {
        l[i] = this.left[this.readAt];
        if (r !== l) r[i] = this.right[this.readAt];
        this.readAt = (this.readAt + 1) & (this.cap - 1);
      } else {
        l[i] = 0;
        if (r !== l) r[i] = 0;
      }
    }
    return true;
  }
}
registerProcessor('cg-daw-pcm', CgDawPcmProcessor);
`;

interface ActiveDawTap {
  context: AudioContext;
  dest: MediaStreamAudioDestinationNode;
  worklet: AudioWorkletNode | null;
  nextTime: number;
}

let activeTap: ActiveDawTap | null = null;

/**
 * Feed a binary `CGPC` WebSocket frame into the DAW audio tap and ring buffer.
 */
export function feedDawPcm(raw: ArrayBuffer | Uint8Array): DawPcmFrame | null {
  const frame = decodeDawPcm(raw);
  if (!frame) return null;
  const { channels, sampleRate, samples } = frame;
  const frames = channels === 2 ? (samples.length >> 1) : samples.length;
  for (let i = 0; i < frames; i++) {
    const mono = channels === 2 ? 0.5 * (samples[2 * i] + samples[2 * i + 1]) : samples[i];
    pcmRing[pcmWrite] = mono;
    pcmWrite = (pcmWrite + 1) & (ANALYSER_FFT_SIZE - 1);
  }
  if (typeof performance !== 'undefined') {
    lastPcmAt = performance.now();
  }
  const tap = activeTap;
  if (tap) {
    if (tap.context.state === 'suspended') {
      void tap.context.resume().catch(() => {});
    }
    if (tap.worklet) {
      tap.worklet.port.postMessage({ samples, channels });
    } else if (tap.context.state === 'running' && frames > 0) {
      const buf = tap.context.createBuffer(channels, frames, sampleRate);
      if (channels === 2) {
        const l = buf.getChannelData(0);
        const r = buf.getChannelData(1);
        for (let i = 0; i < frames; i++) {
          l[i] = samples[2 * i];
          r[i] = samples[2 * i + 1];
        }
      } else {
        buf.getChannelData(0).set(samples);
      }
      const src = tap.context.createBufferSource();
      src.buffer = buf;
      src.connect(tap.dest);
      const startAt = Math.max(tap.context.currentTime, tap.nextTime);
      src.start(startAt);
      tap.nextTime = startAt + frames / sampleRate;
    }
  }
  return frame;
}

export interface DawAudioTap {
  stream: MediaStream;
  context: AudioContext;
  stop: () => void;
}

/**
 * Open the silent Web Audio tap for `AudioSource === 'daw'`.
 *
 * Plays `CGPC` frames through an `AudioWorkletNode` into a `MediaStream` shared
 * with `useAudioAnalyzer` in the same `AudioContext` (never to `destination` at
 * audible gain, because the DAW itself is already playing to the room).
 */
export function startDawTap(): DawAudioTap {
  activeTap?.context.close().catch(() => {});
  const AudioCtor: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new AudioCtor({ sampleRate: 48000 });
  const dest = context.createMediaStreamDestination();
  const silent = context.createGain();
  silent.gain.value = 0;
  silent.connect(context.destination);

  const tap: ActiveDawTap = { context, dest, worklet: null, nextTime: 0 };
  activeTap = tap;

  const nativeCreateAnalyser = context.createAnalyser.bind(context);
  context.createAnalyser = () => {
    const analyser = nativeCreateAnalyser();
    if (tap.worklet) {
      try { tap.worklet.connect(analyser); } catch { /* ignore */ }
    }
    const emulator = new AnalyserEmulator(context.sampleRate, ANALYSER_FFT_SIZE, ANALYSER_SMOOTHING);
    let lastStepAt = typeof performance !== 'undefined' ? performance.now() : 0;
    let lastFrame: { bins: Float32Array; timeDomainData: Uint8Array } | null = null;
    const stepEmulator = () => {
      const now = typeof performance !== 'undefined' ? performance.now() : lastStepAt + 16;
      const dtSec = Math.max(0.001, Math.min(0.25, (now - lastStepAt) / 1000));
      lastStepAt = now;
      const fresh = now - lastPcmAt < 180;
      if (fresh) {
        const mask = ANALYSER_FFT_SIZE - 1;
        for (let i = 0; i < ANALYSER_FFT_SIZE; i++) {
          pcmWindow[i] = pcmRing[(pcmWrite + i) & mask];
        }
      } else {
        pcmWindow.fill(0);
      }
      lastFrame = emulator.frame(pcmWindow, ANALYSER_FFT_SIZE, dtSec);
      return lastFrame;
    };
    analyser.getFloatFrequencyData = (array: Float32Array<ArrayBuffer>) => {
      const f = stepEmulator();
      const n = Math.min(array.length, f.bins.length);
      for (let i = 0; i < n; i++) array[i] = f.bins[i];
    };
    analyser.getByteTimeDomainData = (array: Uint8Array<ArrayBuffer>) => {
      const f = lastFrame ?? stepEmulator();
      const n = Math.min(array.length, f.timeDomainData.length);
      for (let i = 0; i < n; i++) array[i] = f.timeDomainData[i];
    };
    analyser.getByteFrequencyData = (array: Uint8Array<ArrayBuffer>) => {
      const f = lastFrame ?? stepEmulator();
      bytesFromDb(f.bins, analyser.minDecibels, analyser.maxDecibels, array);
    };
    return analyser;
  };

  if (context.audioWorklet && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
    const url = URL.createObjectURL(new Blob([WORKLET_CODE], { type: 'application/javascript' }));
    void context.audioWorklet
      .addModule(url)
      .then(() => {
        URL.revokeObjectURL(url);
        if (activeTap !== tap) return;
        const node = new AudioWorkletNode(context, 'cg-daw-pcm', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        node.connect(dest);
        node.connect(silent);
        tap.worklet = node;
      })
      .catch(() => {
        URL.revokeObjectURL(url);
      });
  }

  void context.resume().catch(() => {});

  return {
    stream: dest.stream,
    context,
    stop: () => {
      if (activeTap === tap) activeTap = null;
      try { tap.worklet?.disconnect(); } catch { /* ignore */ }
      dest.stream.getTracks().forEach((t) => t.stop());
      void context.close().catch(() => {});
    },
  };
}
