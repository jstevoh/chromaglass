import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { unhandled } from '../lib/unhandled';
import {
  apcMiniMk2Map, apc40Mk2Map, launchpadMap, launchControlXlMap, eventSource, loadMidiMap, nanoKontrol2Map, padVelocityFor, parseMidi, parseMidiMap, relativeDelta,
  parseMidiRealtime, saveMidiMap, serializeMidiMap, sourceKey, SoftTakeover,
  MIDI_BANKS, MIDI_FILE_EXT, MIDI_FORMAT, settingLed, curveOf, valueAt, travelOf,
  type FactoryMapId,
  type MidiAction, type MidiBinding, type MidiEvent, type MidiMap, type MidiRealtime, type MidiSource, type MidiTarget,
} from '../lib/midi';
import { SurfaceWatcher, buildAutoMap } from '../lib/autoMap';
import { PIN_RANGE, onStep } from '../lib/deskPins';
import { PALETTE } from '../constants';
import { touch, touchKey } from '../lib/midiTouch';
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
  /**
   * A note was struck, with its velocity.
   *
   * Separate from the bindings on purpose: this fires for *every* note-on,
   * whatever that note is also bound to, because an envelope is not a thing
   * you assign a pad to — it is what the pad being hit feels like. A grid of
   * preset pads therefore also plays the envelopes, which is the behaviour a
   * synth has and the reason the envelopes are worth having at all.
   */
  noteStruck?: (velocity: number) => void;
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
  toggles: { play: boolean; automate: boolean; macro: boolean; overlays: boolean; sequencer: boolean; blackout: boolean; record: boolean; performance?: boolean };
}

export interface MidiDevice { id: string; name: string; }

/**
 * How long after a control last sent something it is considered to still have
 * a hand on it. Longer than the gap between messages in a slow, careful move
 * of a fader; short enough that a ring is right again before anyone looks.
 */
const HANDS_OFF_MS = 400;

const ENABLED_KEY = 'chromaglass-midi-enabled';
const PORTS_KEY = 'chromaglass-midi-ports';

type MidiAccessLike = {
  inputs: Map<string, { id: string; name?: string | null; onmidimessage: ((e: { data: Uint8Array }) => void) | null }>;
  outputs: Map<string, { id: string; name?: string | null; send: (data: number[]) => void }>;
  onstatechange: (() => void) | null;
};

const hasWebMidi = () => typeof navigator !== 'undefined' && typeof (navigator as unknown as { requestMIDIAccess?: unknown }).requestMIDIAccess === 'function';

const newId = () => `b-${Math.random().toString(36).slice(2, 8)}`;

/**
 * The tempo, if the desk is sending it.
 *
 * Clock arrives on the same port as everything else and is handed straight
 * out: what it means is the tempo source's business, not this hook's.
 */
export type MidiClockHandler = (kind: MidiRealtime, at: number) => void;

/**
 * MIDI timecode, straight off the same cable.
 *
 * Handed out raw for the same reason as clock: what a position means is the
 * show's business. `quarter` is the data byte of an 0xF1 message, `full` the
 * whole SysEx of a locate.
 */
export type MidiTimecodeHandler = (message: { quarter: number } | { full: Uint8Array }, at: number) => void;

export function useMidi(host: MidiHost, feedback: MidiFeedback, presetIds: string[], onClock?: MidiClockHandler, onTimecode?: MidiTimecodeHandler) {
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
  /**
   * The live shift layer.
   *
   * Not persisted: a show starts on bank 1 whatever the last one ended on,
   * because the one thing worse than not reaching a control is reaching a
   * different one than the label says.
   */
  const [bank, setBankState] = useState(0);

  const accessRef = useRef<MidiAccessLike | null>(null);
  const hostRef = useRef(host); hostRef.current = host;
  const mapRef = useRef<MidiMap>(map); mapRef.current = map;
  const learningRef = useRef(learning); learningRef.current = learning;
  /** What each control was last told to show, so nothing is sent twice. */
  const ledRef = useRef(new Map<string, number>());
  /**
   * When each control last sent us something, so feedback never talks back to
   * a control with a hand on it. See `sendFeedback`.
   */
  const heardRef = useRef(new Map<string, number>());
  /** The surface being learned, or null when nothing is listening for one. */
  const watchRef = useRef<SurfaceWatcher | null>(null);
  const tallyTick = useRef(0);
  const [watched, setWatched] = useState<{ continuous: number; encoder: number; button: number } | null>(null);
  const portsRef = useRef(ports); portsRef.current = ports;
  const softRef = useRef(softTakeover); softRef.current = softTakeover;
  const bankRef = useRef(bank); bankRef.current = bank;
  const takeover = useRef(new SoftTakeover()).current;
  const eventTick = useRef(0);
  const clockRef = useRef(onClock); clockRef.current = onClock;
  const timecodeRef = useRef(onTimecode); timecodeRef.current = onTimecode;
  /** Whether clock has been seen on this port lately, for the panel to report. */
  const [clocked, setClocked] = useState(false);
  const clockSeenAt = useRef(-Infinity);

  // Whether clock is arriving, sampled rather than counted: setting React
  // state from the message handler would re-render the app twenty-four times
  // a beat for a lamp.
  useEffect(() => {
    if (!enabled) { setClocked(false); return; }
    const timer = setInterval(() => setClocked(performance.now() - clockSeenAt.current < 1000), 500);
    return () => clearInterval(timer);
  }, [enabled]);

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
    heardRef.current.set(sourceKey(src), now);
    // Ahead of the bindings, and regardless of them: see `noteStruck`.
    if (e.kind === 'noteon') hostRef.current.noteStruck?.(Math.max(0, Math.min(1, e.value / 127)));
    if (now - eventTick.current > 80) { eventTick.current = now; setLastEvent({ source: src, value: e.value, at: now }); }

    /*
      Learning the surface swallows everything.

      Auto-map asks you to sweep every fader and press every pad, and if the
      map underneath were still live that would mean dragging the dimmer to
      zero, firing four presets and blacking the room out on the way to
      building a map. So while it is watching, nothing else sees a message.
    */
    if (watchRef.current) {
      watchRef.current.observe(e);
      const t = watchRef.current.tally;
      if (now - tallyTick.current > 120) {
        tallyTick.current = now;
        setWatched({ ...t });
      }
      return;
    }

    const learn = learningRef.current;
    if (learn && e.kind !== 'noteoff') {
      const key = sourceKey(src);
      // Learn onto the layer that is live. Bank 1 is the base layer and its
      // bindings are always live (`bank: undefined`), so a map made by
      // someone who never touches banks is exactly the map they would have
      // had before banks existed.
      const onto = bankRef.current === 0 ? undefined : bankRef.current;
      setMap(prev => ({
        ...prev,
        // Replace only what this control already does *on this layer*: the
        // whole point of a shift layer is that one fader means four things,
        // so learning on bank 3 must not wipe what it does on bank 1.
        bindings: [
          ...prev.bindings.filter(b => sourceKey(b.source) !== key || b.bank !== onto),
          { id: newId(), source: src, target: learn.target, mode: learn.mode, bank: onto },
        ],
      }));
      setLearning(null);
      return;
    }

    const h = hostRef.current;
    const key = sourceKey(src);
    // What this control does *on this layer*.
    //
    // A binding that names a bank answers only on that one; a binding that
    // names none is always live. Where a control has both — which is exactly
    // what happens when someone learns a fader on the base layer and then
    // gives it a second job on bank 3 — the bank-specific one wins and the
    // always-live one stays out of the way. Firing both meant one fader
    // driving two settings at once, which on a stage reads as the app having
    // a mind of its own.
    const matching = mapRef.current.bindings.filter(b => sourceKey(b.source) === key);
    const onThisBank = matching.filter(b => b.bank === bankRef.current);
    const live = onThisBank.length ? onThisBank : matching.filter(b => b.bank === undefined);
    for (const b of live) {
      // Annotated, and that is not decoration: without it `t` is `any` here,
      // so nothing in the switch below was checked at all — not the property
      // names it reads off each kind, not a misspelt case, not a missing one.
      const t: MidiTarget = b.target;

      const pressed = e.kind === 'noteon' || (e.kind === 'cc' && e.value > 63);
      /**
       * Set when soft takeover held this fader back, so the report below does
       * not go on to claim it moved. `break` inside the switch leaves the
       * switch, not the loop.
       */
      let held = false;
      switch (t.kind) {
        case 'setting': {
          if (e.kind === 'noteoff') break;
          const span = t.max - t.min || 1;
          /*
            The fader's travel, which is not always the value's: Speed's is
            cubed, so the bottom third of a throw covers the slow end where
            almost every look actually sits (`curveOf` in `midi.ts`). The
            curve comes from the setting rather than from the binding, so a
            map learned before it existed gets it too.
          */
          const curve = curveOf(t.key);
          /*
            A control that only takes whole steps — the folds — rides them as
            detents: the sheet offers Off, 2, 4, 6 and 8, so a fader lands on
            those and nothing between. The step is the registry's; the travel
            is the binding's, which `parseMidiMap` has already brought up to
            the same range.
          */
          const stepped = { min: t.min, max: t.max, step: PIN_RANGE.get(String(t.key))?.step };
          const cur = h.getSetting(t.key);
          const cur01 = cur === undefined ? 0 : travelOf(cur, t.min, t.max, curve);
          if (b.mode === 'relative') {
            const d = relativeDelta(e.value);
            if (d === 0) break;
            // A whole step a click on a stepped control: a hundredth of the
            // travel would round straight back to where it started.
            const by = stepped.step ?? span / 100;
            const v = Math.max(t.min, Math.min(t.max, (cur ?? t.min) + d * by));
            h.setSetting(t.key, onStep(stepped, v));
            break;
          }
          let in01 = e.value / 127;
          if (e.kind === 'noteon') in01 = 1;
          // Onto the nearest detent before soft takeover sees it, so the
          // position it compares against the setting is one the setting can
          // actually hold. Snapped afterwards instead, a fader resting between
          // two steps would sit a fraction away from a value it had written
          // itself, and takeover would read its own write as somebody else's.
          if (stepped.step) in01 = travelOf(onStep(stepped, valueAt(in01, t.min, t.max, curve)), t.min, t.max, curve);
          if (softRef.current) {
            const v = takeover.ride(b.id, in01, cur01);
            if (v === null) {
              /*
                Held back until the fader passes through the app's value.

                This is the right thing to do and the wrong thing to do in
                silence: a fader that does nothing is indistinguishable from
                MIDI not working, and the answer to both is to move the fader,
                which only fixes one of them. So say what it is waiting for.
              */
              touch(touchKey(t), cur === undefined ? undefined : cur, now, 'pickup');
              held = true;
              break;
            }
            in01 = v;
          }
          h.setSetting(t.key, onStep(stepped, valueAt(in01, t.min, t.max, curve)));
          break;
        }
        case 'action': if (pressed) h.action(t.action); break;
        case 'preset': if (pressed) h.applyPreset(t.presetId); break;
        case 'dye':    if (pressed) h.selectDye(t.paletteIndex); break;
        // A binding whose kind has no case here is a control that does
        // nothing when it is touched, and says nothing about why.
        default: unhandled('a MIDI binding', t);
      }
      /*
        Say on screen that this was hit.

        Only for what actually fired: a pad held down past its note-on, or a
        fader the soft takeover is still ignoring, has not done anything and
        should not claim to have. A setting says so on every message because
        that is a fader moving, which is exactly when you want to see which
        one you have hold of.
      */
      if (!held && (t.kind === 'setting' ? e.kind !== 'noteoff' : pressed)) {
        // The value goes with it, so the activity view can say where a fader
        // landed without reading the setting back and racing the update.
        touch(touchKey(t), t.kind === 'setting' ? hostRef.current.getSetting(t.key) : undefined);
      }
    }
  }, [setMap, takeover]);
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
        ? (m) => {
            // Realtime first: a clock byte is one byte and `parseMidi` wants
            // two, so these used to fall on the floor. Twenty-four a beat is a
            // lot of messages, so nothing here allocates or sets state.
            const rt = parseMidiRealtime(m.data);
            if (rt) {
              const at = performance.now();
              clockSeenAt.current = at;
              clockRef.current?.(rt, at);
              return;
            }
            // Timecode, before the channel-message parser: a quarter-frame is
            // 0xF1 and one data byte, which is two bytes, so `parseMidi` would
            // read it as a control change on a channel that does not exist.
            // A rolling desk sends a hundred a second, so this allocates
            // nothing and touches no state.
            if (m.data[0] === 0xf1 && m.data.length >= 2) {
              timecodeRef.current?.({ quarter: m.data[1] }, performance.now());
              return;
            }
            if (m.data[0] === 0xf0) {
              timecodeRef.current?.({ full: m.data }, performance.now());
              return;
            }
            const ev = parseMidi(m.data);
            if (ev) handleRef.current(ev);
          }
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

  /**
   * Change the shift layer.
   *
   * Every fader is dropped out of soft takeover on the way. A fader sitting
   * at 80% that has just been handed a different setting must pass through
   * that setting's value before it does anything — otherwise switching bank
   * slams four parameters to wherever the hardware happens to be standing,
   * which on a stage is the whole look gone in one button press.
   */
  const setBank = useCallback((next: number) => {
    setBankState(prev => {
      const b = ((next % MIDI_BANKS) + MIDI_BANKS) % MIDI_BANKS;
      if (b !== prev) { takeover.reset(); }
      return b;
    });
  }, [takeover]);
  const stepBank = useCallback((dir: 1 | -1) => setBank(bankRef.current + dir), [setBank]);

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
    const sent = ledRef.current;
    /*
      Nothing is sent twice.

      This used to run only when a preset, a dye, a toggle or the bank changed
      — a handful of times a minute — so writing every control each time cost
      nothing. It now also runs on a timer, because a knob's LED ring has to
      follow a setting the *screen* changed, and a setting has no event to hang
      off. Forty controls ten times a second is four hundred messages a second
      down a cable that also carries the clock, so each control is written only
      when what it should show has actually changed. In the steady state that
      is no traffic at all.
    */
    const write = (src: MidiSource, level: number) => {
      const k = sourceKey(src);
      /*
        Never talk back to a control with a hand on it.

        A fader's ring is worth setting when a preset moves the setting
        underneath it. While the *fader* is what is moving the setting,
        sending the value back is at best telling the hardware what it just
        told us, ten times a second, on a cable already carrying the clock —
        and on a rig where the output finds its way back to the input, it is
        the app arguing with the operator's hand. The cache entry is dropped
        rather than updated, so the control is brought up to date once the
        hand comes off.
      */
      const heard = heardRef.current.get(k);
      if (heard !== undefined && performance.now() - heard < HANDS_OFF_MS) { sent.delete(k); return; }
      if (sent.get(k) === level) return;
      sent.set(k, level);
      try {
        if (src.kind === 'note') out.send([0x90 | (src.channel & 0x0f), src.number & 0x7f, level & 0x7f]);
        else out.send([0xb0 | (src.channel & 0x0f), src.number & 0x7f, level & 0x7f]);
      } catch { /* the port went away */ }
    };
    // One decision per control, not one per binding.
    //
    // A pad on another layer is not doing anything, so it must not be lit as
    // though it were: an LED that says "this cues Deep Ocean" while the layer
    // says otherwise is worse than an LED that is off. But a control can carry
    // several bindings, and walking them one at a time meant an out-of-bank
    // one could blank a pad that *is* live on this layer through its
    // always-live binding — whichever came last in the list won. So the same
    // rule the message handler uses decides what each control is doing now,
    // and each control is written exactly once.
    const byControl = new Map<string, MidiBinding[]>();
    for (const b of mapRef.current.bindings) {
      const k = sourceKey(b.source);
      const list = byControl.get(k);
      if (list) list.push(b); else byControl.set(k, [b]);
    }
    for (const group of byControl.values()) {
      const onThisBank = group.filter(x => x.bank === bankRef.current);
      const b = (onThisBank.length ? onThisBank : group.filter(x => x.bank === undefined))[0];
      if (!b) {
        // Bound, but not on this layer: dark.
        write(group[0].source, 0);
        continue;
      }
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
      } else if (t.kind === 'setting' && b.source.kind === 'cc' && b.mode !== 'relative') {
        /*
          A knob's LED ring, showing where the setting actually is.

          This was the one target kind feedback skipped, so a controller with
          rings round its knobs showed nothing at all — and worse, showed
          nothing *differently* from the truth the moment a preset loaded and
          moved forty settings the hardware knew nothing about. Load Crowd
          Plate and the rings now follow it.

          Only for absolute controls. An endless encoder has no position to
          show, and a motorised fader would be driven to the value — which is
          right, and is what a motorised fader is for.
        */
        const cur = hostRef.current.getSetting(t.key);
        if (cur === undefined) continue;
        level = settingLed(cur, t.min, t.max, curveOf(t.key));
      }
      if (level === null) continue;
      write(b.source, level);
    }
  }, [outputFor]);

  const fbKey = `${feedback.activePresetId}|${feedback.dyeIndex}|${Object.values(feedback.toggles).map(Number).join('')}|${bank}`;
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(sendFeedback, 60);
    return () => clearTimeout(t);
  }, [enabled, fbKey, map, outputs, ports.output, sendFeedback]);

  /*
    A different port, or MIDI coming back, is a controller that knows nothing.

    The cache above is what it was told last, and a controller that was just
    plugged in was told none of it — so the cache has to be forgotten or every
    LED stays dark until something happens to change it.
  */
  useEffect(() => { ledRef.current.clear(); }, [enabled, ports.output, map.name]);

  /*
    Settings have no event to hang feedback off.

    A preset load moves forty of them at once, a fader on screen moves one, and
    the sequencer moves them over minutes — none of which is a React update
    this hook can watch without re-rendering on every frame of it. So the rings
    are brought up to date on a timer instead. Ten times a second is under the
    eye's threshold for a knob you are not touching, and costs nothing because
    `sendFeedback` only writes what changed.
  */
  useEffect(() => {
    if (!enabled) return;
    const ticking = mapRef.current.bindings.some(b => b.target.kind === 'setting' && b.source.kind === 'cc');
    if (!ticking) return;
    const id = setInterval(sendFeedback, 100);
    return () => clearInterval(id);
  }, [enabled, map, ports.output, sendFeedback]);

  // ── Learn, edit, files ──────────────────────────────────────────
  const learn = useCallback((target: MidiTarget, mode: 'absolute' | 'relative' = 'absolute') => setLearning({ target, mode }), []);
  const cancelLearn = useCallback(() => setLearning(null), []);
  const removeBinding = useCallback((id: string) => setMap(prev => ({ ...prev, bindings: prev.bindings.filter(b => b.id !== id) })), [setMap]);
  const setBindingMode = useCallback((id: string, mode: 'absolute' | 'relative') => setMap(prev => ({ ...prev, bindings: prev.bindings.map(b => b.id === id ? { ...b, mode } : b) })), [setMap]);
  /** Move a binding onto a shift layer, or (undefined) back to always-live. */
  const setBindingBank = useCallback((id: string, bankIndex: number | undefined) =>
    setMap(prev => ({ ...prev, bindings: prev.bindings.map(b => b.id === id ? { ...b, bank: bankIndex } : b) })), [setMap]);
  const clearMap = useCallback(() => setMap(prev => ({ ...prev, bindings: [] })), [setMap]);
  const rename = useCallback((name: string) => setMap(prev => ({ ...prev, name })), [setMap]);
  const loadFactory = useCallback((which: FactoryMapId) => {
    setMap(
      which === 'apc-mini-mk2' ? apcMiniMk2Map(presetIds)
      : which === 'apc40-mk2' ? apc40Mk2Map(presetIds)
      : which === 'launchpad' ? launchpadMap(presetIds)
      : which === 'launch-control-xl' ? launchControlXlMap()
      : nanoKontrol2Map(),
    );
    takeover.reset();
  }, [presetIds, setMap, takeover]);
  /*
    Auto-map: start listening, stop listening, keep what was heard.

    Three calls rather than one, because the operator decides when they have
    finished touching things. A timer would either cut them off mid-sweep or
    make them wait after the last pad, and both feel like the app is not paying
    attention.
  */
  const startAutoMap = useCallback(() => {
    watchRef.current = new SurfaceWatcher();
    setWatched({ continuous: 0, encoder: 0, button: 0 });
  }, []);
  const cancelAutoMap = useCallback(() => {
    watchRef.current = null;
    setWatched(null);
  }, []);
  /**
   * Build the map from what was heard, and keep it. Returns what it decided so
   * the panel can say so in words, or null when nothing was touched — which
   * must not wipe a map somebody already had.
   */
  const finishAutoMap = useCallback((deviceName?: string | null) => {
    const watch = watchRef.current;
    watchRef.current = null;
    setWatched(null);
    if (!watch) return null;
    const controls = watch.controls();
    if (controls.length === 0) return null;
    const { map, summary } = buildAutoMap(controls, presetIds, PALETTE.length, deviceName ?? null);
    setMap(map);
    takeover.reset();
    return summary;
  }, [presetIds, setMap, takeover]);

  const exportMap = useCallback(() => {
    const m = mapRef.current;
    const slug = m.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'midi';
    downloadText(`${slug}${MIDI_FILE_EXT}`, serializeMidiMap(m));
  }, []);
  const importFile = useCallback(async (file: File) => {
    const m = parseMidiMap(await file.text());
    setMap(m);
    takeover.reset();
  }, [setMap, takeover]);
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
    learning, learn, cancelLearn, removeBinding, setBindingMode, setBindingBank, addBinding,
    softTakeover, setSoftTakeover: setSoftTakeoverOn,
    lastEvent,
    clocked,
    bank, setBank, stepBank, banks: MIDI_BANKS,
    startAutoMap, cancelAutoMap, finishAutoMap, watched,
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
    case 'performance-toggle': return !!t.performance;
    default: return null;
  }
}

export type MidiController = ReturnType<typeof useMidi>;
