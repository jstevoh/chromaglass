import { useMidi } from '../hooks/useMidi';
import { isUserPresetId, type UserPreset } from '../lib/userPresets';
import { PRESET_CONTRACTS } from '../presetPlate';
import { livePresetId } from '../presets';
import { PALETTE_RGB } from '../constants';
import { useCallback, useEffect, type RefObject, type Dispatch, type SetStateAction } from 'react';
import type { SoundBinding, MidiAction, MidiMap } from '../lib/midi';
import { runTrigger } from '../lib/soundLearn';
import { useGamepad } from '../hooks/useGamepad';
import { laidColour } from '../lib/liquidColour';
import { useProjector } from '../hooks/useProjector';
import type { SettingRide } from '../lib/ride';
import type { VisualizerSettings, LiquidType } from '../types';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';
import type { Recorder } from '../hooks/useRecorder';
import type { MusicIntelResult } from '../hooks/useMusicIntelligence';
import type { TempoSource } from '../lib/tempo';
import type { TimecodeReader } from '../lib/timecode';
import type { ScreenLike } from '../hooks/useCastSession';
import type { useShowSequencer } from '../hooks/useShowSequencer';

/**
 * The controllers: MIDI (`hooks/useMidi.ts`), the gamepad and the projector
 * window, each wired to the same settings, actions and cues the desk uses.
 */
interface ControllersDeps {
  ride: SettingRide;
  settingsRef: RefObject<VisualizerSettings>;
  rideSetting: (key: keyof VisualizerSettings, value: number) => void;
  runAction: (a: MidiAction) => void;
  cuePreset: (presetId: string) => void;
  selectDye: (paletteIndex: number) => void;
  wallRef: RefObject<LiquidVisualizerHandle | null>;
  activePresetId: string | null;
  selectedDyeIndex: number;
  userPresetsRef: RefObject<UserPreset[]>;
  isActive: boolean;
  isAutomated: boolean;
  settings: VisualizerSettings;
  overlaysVisible: boolean;
  sequencer: ReturnType<typeof useShowSequencer>;
  blackout: boolean;
  recorder: Recorder;
  musicIntel: MusicIntelResult;
  allPresetIds: string[];
  tempoRef: RefObject<TempoSource | null>;
  timecodeRef: RefObject<TimecodeReader>;
  midiRef: RefObject<{ map: MidiMap; activeInputName: string | null; stepBank: (dir: 1 | -1) => void; } | null>;
  colourDye: (paletteIndex: number) => void;
  visualizerRef: RefObject<LiquidVisualizerHandle | null>;
  activeLayer: number;
  selectedLiquid: LiquidType;
  setActiveLayer: Dispatch<SetStateAction<number>>;
  stageLayers: number;
  startCast: (mode?: "window" | "device", screen?: ScreenLike | null | undefined) => Promise<void>;
  isCasting: boolean;
}

export function useControllers({
  ride, settingsRef, rideSetting, runAction, cuePreset, selectDye, wallRef, activePresetId,
  selectedDyeIndex, userPresetsRef, isActive, isAutomated, settings, overlaysVisible, sequencer,
  blackout, recorder, musicIntel, allPresetIds, tempoRef, timecodeRef, midiRef, colourDye,
  visualizerRef, activeLayer, selectedLiquid, setActiveLayer, stageLayers, startCast, isCasting,
}: ControllersDeps) {
  const midi = useMidi(
    {
      getSetting: (key) => ride.read(String(key), settingsRef.current as unknown as Record<string, unknown>),
      setSetting: rideSetting,
      action: runAction,
      applyPreset: cuePreset,
      selectDye,
      // Every note plays the envelopes, whatever else that pad is for.
      noteStruck: (velocity) => wallRef.current?.fireEnvelopes?.(velocity),
    },
    {
      activePresetId,
      dyeIndex: selectedDyeIndex,
      presetColor: (id) => {
        const contract = isUserPresetId(id) ? userPresetsRef.current.find(p => p.id === id)?.contract : PRESET_CONTRACTS[livePresetId(id)];
        const idx = contract?.[0];
        return idx === undefined ? null : PALETTE_RGB[idx] ?? null;
      },
      paletteColor: (i) => PALETTE_RGB[i] ?? null,
      toggles: { play: isActive, automate: isAutomated, macro: !!settings.macroMode, overlays: overlaysVisible, sequencer: sequencer.status.running, blackout, record: recorder.recording, performance: !!musicIntel.performance.live },
    },
    allPresetIds,
    // The tempo, if the desk is sending it. Straight into the tempo source:
    // twenty-four messages a beat has no business going through React.
    useCallback((kind: 'clock' | 'start' | 'continue' | 'stop', at: number) => {
      const t = tempoRef.current;
      if (!t) return;
      if (kind === 'clock') t.clockPulse(at);
      else if (kind === 'stop') t.clockStop();
      else t.clockStart(at);
    }, []),
    // Timecode, straight into the reader for the same reason: a rolling desk
    // sends a hundred of these a second and none of them is a render.
    useCallback((message: { quarter: number } | { full: Uint8Array }, at: number) => {
      const r = timecodeRef.current;
      if ('quarter' in message) r.quarter(message.quarter, at);
      else r.full(message.full, at);
    }, []),
  );
  midiRef.current = midi as unknown as typeof midiRef.current;
  /*
    A trigger the music fired (sound learn, PLAN §5): the same action and
    preset doors a pad goes through, so a kick on Next Preset and a pad on
    Next Preset cannot come to mean different things. The dye is the one
    difference, and it is deliberate: the colour changes and the tool does not
    (`TriggerHost` in soundLearn.ts says why). `runTrigger` also refuses an
    action a beat must not press, the last door before the show.
  */
  const runSoundTrigger = (b: SoundBinding) => {
    runTrigger(b, { action: runAction, preset: cuePreset, dye: colourDye });
  };
  const gamepad = useGamepad({
    gesture: (tool, x, y, amount, dx, dy) => visualizerRef.current?.applyGesture({ tool, x, y, amount, dx, dy, layer: activeLayer, ...(tool === 'drop' ? laidColour(selectedLiquid) : {}) }),
    action: runAction,
    cycleDye: (dir) => selectDye((selectedDyeIndex < 0 ? 0 : selectedDyeIndex) + dir),
    cycleLayer: (dir) => setActiveLayer(l => Math.max(0, Math.min(stageLayers - 1, l + dir))),
  });
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('debug')) {
      window.chromaglassInputs = () => ({ midi: { enabled: midi.enabled, input: midi.activeInputName, bindings: midi.map.bindings.length, learning: midi.learning }, gamepad: { connected: gamepad.connected, cursor: gamepad.cursor.get() } });
    }
  }, [midi.enabled, midi.activeInputName, midi.map, midi.learning, gamepad.connected, gamepad.cursor]);
  // ── A projector, noticed ──
  // A second screen that is not built in is the projector. Ask (a chip),
  // Automatic (the show goes there on the next click after it appears), or
  // Off; see useProjector. The window opens fullscreen on that screen.
  const projector = useProjector({
    send: (screen) => { void startCast('window', screen); },
    casting: isCasting,
  });
  // Where the controller's ring is drawn: the plate's rectangle, or the window before it has one.
  const gamepadRingRect = useCallback(() => {
    const r = visualizerRef.current?.drawnRect?.();
    return r ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  }, []);

  return {
    midi, runSoundTrigger, gamepad, projector, gamepadRingRect,
  };
}
