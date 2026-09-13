import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  apcMiniMk2Map, apc40Mk2Map, launchpadMap, launchControlXlMap, eventSource, loadMidiMap, nanoKontrol2Map, padVelocityFor, parseMidi, parseMidiMap, relativeDelta,
  saveMidiMap, serializeMidiMap, sourceKey, SoftTakeover,
  MIDI_FILE_EXT, MIDI_FORMAT,
  type MidiAction, type MidiBinding, type MidiEvent, type MidiMap, type MidiSource, type MidiTarget,
} from '../lib/midi';
import { downloadText } from '../lib/userPresets';
import type { VisualizerSettings } from '../types';

/**
 * The MIDI controller on the desk.
 *
 * Faders and knobs ride settings, pads cue presets and dyes, buttons fire the
 * one-shots and the sequencer. Bindings come from a factory map or from MIDI
 * learn (pick a target, touch a control) and live in localStorage and in
 * `.chromaglass-midi.json` files, the same way presets do. Pads light up in
 * the dye of the preset they cue.
 *
 * The app it drives is described by `MidiHost`, read through a ref so the
 * message handler never sees a stale closure.
 */
export interface MidiHost {
  getSetting: (key: keyof VisualizerSettings) => number | undefined;
  setSetting: (key: keyof VisualizerSettings, value: number) => void;
  action: (action: MidiAction) => void;
  applyPreset: (presetId: string) => void;
  selectDye: (paletteIndex: number) => void;
}

/** What the LEDs should show. Changes here are pushed to the controller. */
export interface MidiFeedback {
  activePresetId: string | null;
  /** The selected dye's palette index, or -1 when it is not a palette colour. */
  dyeIndex: number;
  /** Lead dye colour (0..1 RGB) of a preset, for its pad. */
  presetColor: (presetId: string) => { r: number; g: number; b: number } | null;
  /** Palette colour (0..1 RGB) by index, for the dye pads. */
  paletteColor: (index: number) => { r: number; g: number; b: number } | null;
  toggles: { play: boolean; automate: boolean; macro: boolean; overlays: boolean; sequencer: boolean; blackout: boolean; record: boolean };
}

export interface MidiDevice { id: string; name: string; }

const ENABLED_KEY = 'chromaglass-midi-enabled';
const PORTS_KEY = 'chromaglass-midi-ports';

type MidiAccessLike = {
  inputs: Map<string, { id: string; name?: string | null; onmidimessage: ((e: { data: Uint8Array }) => void) | null }>;
  outputs: Map<string, { id: string; name?: string | null; send: (data: number[]) => void }>;
  onstatechange: (() => void) | null;
};

const hasWebMidi = () => typeof navigator !== 'undefined' && typeof (navigator as unknown as { requestMIDIAccess?: unknown }).requestMIDIAccess === 'function';

const newId = () => `b-${Math.random().toString(36).slice(2, 8)}`;

export function useMidi(host: MidiHost, feedback: MidiFeedback, presetIds: string[]) {
  const supported = useMemo(hasWebMidi, []);
  const [enabled, setEnabled] = useState<boolean>(() => { try { return localStorage.getItem(ENABLED_KEY) === '1'; } catch { return false; } });
  const [error, setError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<MidiDevice[]>([]);
  const [outputs, setOutputs] = useState<MidiDevice[]>([]);
  const [ports, setPorts] = useState<{ input: string; output: string }>(() => {
    try { return { input: 'all', output: 'auto', ...JSON.parse(localStorage.getItem(PORTS_KEY) ?? '{}') }; } catch { return { input: 'all', output: 'auto' }; }
  });
  const [map, setMapState] = useState<MidiMap>(() => loadMidiMap() ?? { format: MIDI_FORMAT, version: 1, name: 'My controller', bindings: [] });
  const [learning, setLearning] = useState<{ target: MidiTarget; mode: 'absolute' | 'relative' } | null>(null);
  const [lastEvent, setLastEvent] = useState<{ source: MidiSource; value: number; at: number } | null>(null);
  const [softTakeover, setSoftTakeoverOn] = useState(true);

  const accessRef = useRef<MidiAccessLike | null>(null);
  const hostRef = useRef(host); hostRef.current = host;
  const mapRef = useRef(map); mapRef.current = map;
  const learningRef = useRef(learning); learningRef.current = learning;
  const portsRef = useRef(ports); portsRef.current = ports;
  const softRef = useRef(softTakeover); softRef.current = softTakeover;
  const takeover = useRef(new SoftTakeover()).current;
  /** The last value each absolute binding wrote, so a change made elsewhere is noticed. */
  const lastApplied = useRef(new Map<string, number>()).current;
  const eventTick = useRef(0);

  const setMap = useCallback((next: MidiMap | ((prev: MidiMap) => MidiMap)) => {
    setMapState(prev => {
      const m = typeof next === 'function' ? next(prev) : next;
      saveMidiMap(m);
      return m;
    });
  }, []);

  // ── Handling a message ─────────────────────────────────────────
  const handle = useCallback((e: MidiEvent) => {
    const src = eventSource(e);
    const now = performance.now();
    if (now - eventTick.current > 80) { eventTick.current = now; setLastEvent({ source: src, value: e.value, at: now }); }

    const learn = learningRef.current;
    if (learn && e.kind !== 'noteoff') {
      const key = sourceKey(src);
      setMap(prev => ({
        ...prev,
        bindings: [...prev.bindings.filter(b => sourceKey(b.source) !== key), { id: newId(), source: src, target: learn.target, mode: learn.mode }],
      }));
      setLearning(null);
      return;
    }

    const h = hostRef.current;
    const key = sourceKey(src);
    for (const b of mapRef.current.bindings) {
      if (sourceKey(b.source) !== key) continue;
      const t = b.target;
      const pressed = e.kind === 'noteon' || (e.kind === 'cc' && e.value > 63);
      switch (t.kind) {
        case 'setting': {
          if (e.kind === 'noteoff') break;
          const span = t.max - t.min || 1;
          const cur = h.getSetting(t.key);
          const cur01 = cur === undefined ? 0 : Math.max(0, Math.min(1, (cur - t.min) / span));
          if (b.mode === 'relative') {
            const d = relativeDelta(e.value);
            if (d === 0) break;
            const v = Math.max(t.min, Math.min(t.max, (cur ?? t.min) + d * span / 100));
            h.setSetting(t.key, v);
            break;
          }
          let in01 = e.value / 127;
          if (e.kind === 'noteon') in01 = 1;
          if (softRef.current) {
            const last = lastApplied.get(b.id);
            if (last !== undefined && Math.abs(last - cur01) > 0.02) takeover.drop(b.id);
            const v = takeover.apply(b.id, in01, cur01);
            if (v === null) break;
            takeover.markPicked(b.id);
            in01 = v;
          }
          lastApplied.set(b.id, in01);
          h.setSetting(t.key, t.min + in01 * span);
          break;
        }
        case 'action': if (pressed) h.action(t.action); break;
        case 'preset': if (pressed) h.applyPreset(t.presetId); break;
        case 'dye':    if (pressed) h.selectDye(t.paletteIndex); break;
      }
    }
  }, [setMap, takeover, lastApplied]);
  const handleRef = useRef(handle); handleRef.current = handle;

  // ── Devices ────────────────────────────────────────────────────
  const refreshPorts = useCallback(() => {
    const a = accessRef.current;
    if (!a) { setInputs([]); setOutputs([]); return; }
    setInputs([...a.inputs.values()].map(p => ({ id: p.id, name: p.name ?? p.id })));
    setOutputs([...a.outputs.values()].map(p => ({ id: p.id, name: p.name ?? p.id })));
  }, []);

  const wireInputs = useCallback(() => {
    const a = accessRef.current;
    if (!a) return;
    const want = portsRef.current.input;
    for (const input of a.inputs.values()) {
      input.onmidimessage = (want === 'all' || input.id === want)
        ? (m) => { const ev = parseMidi(m.data); if (ev) handleRef.current(ev); }
        : null;
    }
  }, []);

  useEffect(() => {
    if (!enabled || !supported) {
      if (accessRef.current) {
        for (const input of accessRef.current.inputs.values()) input.onmidimessage = null;
        accessRef.current.onstatechange = null;
        accessRef.current = null;
      }
      refreshPorts();
      return;
    }
    let cancelled = false;
    (navigator as unknown as { requestMIDIAccess: (o?: { sysex?: boolean }) => Promise<MidiAccessLike> })
      .requestMIDIAccess({ sysex: false })
      .then(access => {
        if (cancelled) return;
        accessRef.current = access;
        setError(null);
        access.onstatechange = () => { refreshPorts(); wireInputs(); };
        refreshPorts();
        wireInputs();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'MIDI access was refused.');
        setEnabled(false);
      });
    return () => { cancelled = true; };
  }, [enabled, supported, refreshPorts, wireInputs]);

  useEffect(() => { wireInputs(); }, [ports.input, wireInputs]);

  const enable = useCallback(() => { setError(null); setEnabled(true); try { localStorage.setItem(ENABLED_KEY, '1'); } catch { /* private */ } }, []);
  const disable = useCallback(() => { setEnabled(false); setLearning(null); try { localStorage.setItem(ENABLED_KEY, '0'); } catch { /* private */ } }, []);
  const choosePorts = useCallback((next: Partial<{ input: string; output: string }>) => {
    setPorts(prev => { const p = { ...prev, ...next }; try { localStorage.setItem(PORTS_KEY, JSON.stringify(p)); } catch { /* private */ } return p; });
  }, []);

  // ── LED feedback ───────────────────────────────────────────────
  // Every note-bound pad gets a colour: a preset pad the preset's lead dye
  // (dim until it is the active one), a dye pad its colour, a toggle button
  // on or off. CC-bound buttons get 127/0 for controllers whose LEDs listen.
  const outputFor = useCallback(() => {
    const a = accessRef.current;
    if (!a) return null;
    const want = portsRef.current.output;
    if (want === 'off') return null;
    if (want !== 'auto') return a.outputs.get(want) ?? null;
    // Auto: the output that shares a name with the chosen input, else the first.
    const inName = want === 'auto' && portsRef.current.input !== 'all' ? a.inputs.get(portsRef.current.input)?.name : null;
    for (const o of a.outputs.values()) if (inName && o.name === inName) return o;
    return a.outputs.values().next().value ?? null;
  }, []);

  const feedbackRef = useRef(feedback); feedbackRef.current = feedback;
  const sendFeedback = useCallback(() => {
    const out = outputFor();
    if (!out) return;
    const f = feedbackRef.current;
    for (const b of mapRef.current.bindings) {
      const t = b.target;
      let level: number | null = null;
      if (t.kind === 'preset') {
        const c = f.presetColor(t.presetId);
        level = c ? padVelocityFor(c.r, c.g, c.b, f.activePresetId !== t.presetId) : (f.activePresetId === t.presetId ? 3 : 1);
      } else if (t.kind === 'dye') {
        const c = f.paletteColor(t.paletteIndex);
        level = c ? padVelocityFor(c.r, c.g, c.b, f.dyeIndex !== t.paletteIndex) : 0;
      } else if (t.kind === 'action') {
        const on = toggleState(t.action, f.toggles);
        const lit = on === null ? true : on;           // one-shots stay lit so they can be found in the dark
        level = b.source.kind === 'cc' ? (lit ? 127 : 0) : (lit ? 1 : 0);
      }
      if (level === null) continue;
      try {
        if (b.source.kind === 'note') out.send([0x90 | (b.source.channel & 0x0f), b.source.number & 0x7f, level & 0x7f]);
        else out.send([0xb0 | (b.source.channel & 0x0f), b.source.number & 0x7f, level & 0x7f]);
      } catch { /* the port went away */ }
    }
  }, [outputFor]);

  const fbKey = `${feedback.activePresetId}|${feedback.dyeIndex}|${Object.values(feedback.toggles).map(Number).join('')}`;
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(sendFeedback, 60);
    return () => clearTimeout(t);
  }, [enabled, fbKey, map, outputs, ports.output, sendFeedback]);

  // ── Learn, edit, files ──────────────────────────────────────────
  const learn = useCallback((target: MidiTarget, mode: 'absolute' | 'relative' = 'absolute') => setLearning({ target, mode }), []);
  const cancelLearn = useCallback(() => setLearning(null), []);
  const removeBinding = useCallback((id: string) => setMap(prev => ({ ...prev, bindings: prev.bindings.filter(b => b.id !== id) })), [setMap]);
  const setBindingMode = useCallback((id: string, mode: 'absolute' | 'relative') => setMap(prev => ({ ...prev, bindings: prev.bindings.map(b => b.id === id ? { ...b, mode } : b) })), [setMap]);
  const clearMap = useCallback(() => setMap(prev => ({ ...prev, bindings: [] })), [setMap]);
  const rename = useCallback((name: string) => setMap(prev => ({ ...prev, name })), [setMap]);
  const loadFactory = useCallback((which: 'apc-mini-mk2' | 'nanokontrol2' | 'apc40-mk2' | 'launchpad' | 'launch-control-xl') => {
    setMap(
      which === 'apc-mini-mk2' ? apcMiniMk2Map(presetIds)
      : which === 'apc40-mk2' ? apc40Mk2Map(presetIds)
      : which === 'launchpad' ? launchpadMap(presetIds)
      : which === 'launch-control-xl' ? launchControlXlMap()
      : nanoKontrol2Map(),
    );
    takeover.reset(); lastApplied.clear();
  }, [presetIds, setMap, takeover, lastApplied]);
  const exportMap = useCallback(() => {
    const m = mapRef.current;
    const slug = m.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'midi';
    downloadText(`${slug}${MIDI_FILE_EXT}`, serializeMidiMap(m));
  }, []);
  const importFile = useCallback(async (file: File) => {
    const m = parseMidiMap(await file.text());
    setMap(m);
    takeover.reset(); lastApplied.clear();
  }, [setMap, takeover, lastApplied]);
  /** A binding written by hand (the panel's "add" without touching the controller). */
  const addBinding = useCallback((b: Omit<MidiBinding, 'id'>) => setMap(prev => ({ ...prev, bindings: [...prev.bindings.filter(x => sourceKey(x.source) !== sourceKey(b.source)), { ...b, id: newId() }] })), [setMap]);

  const activeInputName = useMemo(() => {
    if (!enabled || inputs.length === 0) return null;
    if (ports.input === 'all') return inputs.length === 1 ? inputs[0].name : `${inputs.length} devices`;
    return inputs.find(i => i.id === ports.input)?.name ?? null;
  }, [enabled, inputs, ports.input]);

  return {
    supported, enabled, enable, disable, error,
    inputs, outputs, ports, choosePorts, activeInputName,
    map, setMap, rename, clearMap, loadFactory, exportMap, importFile,
    learning, learn, cancelLearn, removeBinding, setBindingMode, addBinding,
    softTakeover, setSoftTakeover: setSoftTakeoverOn,
    lastEvent,
  };
}

function toggleState(a: MidiAction, t: MidiFeedback['toggles']): boolean | null {
  switch (a) {
    case 'play-toggle': return t.play;
    case 'automate-toggle': return t.automate;
    case 'macro-toggle': return t.macro;
    case 'overlays-toggle': return !t.overlays;
    case 'seq-play-pause': return t.sequencer;
    case 'blackout-toggle': return t.blackout;
    case 'record-toggle': return t.record;
    default: return null;
  }
}

export type MidiController = ReturnType<typeof useMidi>;
