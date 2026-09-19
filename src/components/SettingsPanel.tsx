import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Sliders, Zap, Thermometer, Wind, Layers, Activity, Sparkles, Palette, Microscope, Projector, Camera, Film, Clapperboard, Lightbulb, Aperture, Video, MonitorPlay, Image, Shapes, Cable } from 'lucide-react';
import { VisualizerSettings, BlendMode, LedMode, SimResolution, SceneFeature, SceneMapping, PatchSource, AudioFeature } from '../types';
import { MODULATOR_FEATURES, MODULATOR_LABELS } from '../lib/modulators';
import { LEARNABLE_SETTINGS, factoryFor, FACTORY_MAPS, type FactoryMapId } from '../lib/midi';
import { PIN_RANGE, type DeskSurface } from '../lib/deskPins';
import { PER_LAYER, PATCH_TARGETS } from '../lib/sceneMap';
import { SETTINGS_CATEGORIES, SETTINGS_SECTIONS, SECTION_BY_ID, FIRST_SECTION, sectionMatches } from '../lib/settingsMap';
import type { MidiController } from '../hooks/useMidi';
import { Info } from './Info';
import { MappingPanel, OutputPanel } from './OutputPanel';
import type { OutputConfig } from '../lib/outputConfig';
import { Segmented, Sheet } from './ui';
import { readSetting } from '../lib/readout';
import type { RoomCalibration } from '../lib/audioCalibration';
import type { EngineStatus } from '../lib/platform';

/**
 * Pinning a control onto a desk.
 *
 * Every slider in this panel offers two chips: put me on Perform, put me on
 * Design. It is two buttons rather than a menu because in a dark room a menu
 * is two clicks and a guess, and it is on the control itself rather than in a
 * list somewhere because the moment you want a fader out where you can reach
 * it is the moment you are looking at it.
 *
 * Passed through a context rather than a prop, because it has to reach
 * eighty-six call sites and threading it would have meant eighty-six edits
 * every time the shape changed.
 */
export interface PinApi {
  perform: (keyof VisualizerSettings)[];
  design: (keyof VisualizerSettings)[];
  onPin: (desk: DeskSurface, key: keyof VisualizerSettings, on: boolean) => void;
}
const PinContext = React.createContext<PinApi | null>(null);

function PinChips({ settingKey }: { settingKey: keyof VisualizerSettings }) {
  const api = React.useContext(PinContext);
  if (!api) return null;
  // Only what a desk can actually draw. A chip on a control the strip would
  // drop on the next reload is a button that lies.
  if (!PIN_RANGE.has(String(settingKey))) return null;
  const chip = (desk: DeskSurface, letter: string, name: string) => {
    const on = (desk === 'perform' ? api.perform : api.design).includes(settingKey);
    return (
      <button
        key={desk}
        onClick={() => api.onPin(desk, settingKey, !on)}
        aria-pressed={on}
        title={on ? `On ${name}. Click to take it off.` : `Put this on ${name}`}
        aria-label={`${on ? 'Remove from' : 'Add to'} ${name}`}
        data-testid={`pin-${desk}-${String(settingKey)}`}
        className={`h-[22px] w-[22px] shrink-0 rounded-[4px] border text-[11px] font-bold leading-none transition-colors ${
          on
            ? 'border-white bg-white text-black'
            : 'border-white/15 text-white/25 hover:border-white/40 hover:text-white/70'
        }`}
      >
        {letter}
      </button>
    );
  };
  return (
    <span className="flex items-center gap-1" data-testid={`pins-${String(settingKey)}`}>
      {chip('perform', 'P', 'the Perform desk')}
      {chip('design', 'D', 'the Design bench')}
    </span>
  );
}

interface SettingsPanelProps {
  settings: VisualizerSettings;
  onUpdate: (settings: Partial<VisualizerSettings>) => void;
  /** Live room-calibration readout, null when auto-calibration is off. */
  calibration?: RoomCalibration | null;
  onRecalibrate?: () => void;
  /** Which solver is running and at what grid, e.g. "GPU · 512²". */
  engineStatus?: EngineStatus | null;
  /** The live reading (frame time), polled while the panel is open. */
  getLiveEngineStatus?: () => EngineStatus | null;
  /** The room camera: whether it is watching, which one, and what it is seeing. */
  sceneOn?: boolean;
  onSceneToggle?: (on: boolean) => void;
  sceneState?: { active: boolean; error: string | null; device: string | null; ms: number; energy: number; raw: number; people: number } | null;
  sceneDevices?: MediaDeviceInfo[];
  sceneDeviceId?: string;
  onSceneDevice?: (id: string) => void;
  /** Where the sensor draws what it sees, so the camera can be aimed. */
  scenePreviewRef?: React.RefObject<HTMLCanvasElement | null>;
  /** The film projector: what's playing, and how to change it. */
  filmSource?: 'none' | 'file' | 'camera' | 'window';
  onFilmFile?: (file: File) => void;
  onFilmCamera?: () => void;
  /** Another tab, window or screen, through the browser's own picker. */
  onFilmWindow?: () => void;
  onFilmClear?: () => void;
  /** The mark: a logo or title card over the finished frame, and whether one is loaded. */
  markLoaded?: boolean;
  onMarkFile?: (file: File) => void;
  onMarkClear?: () => void;
  /** The microphone inputs the browser can see, and the one the show listens to ('' = default). */
  /*
    What is listening, and on which device.

    The source buttons lived only in the old left-hand strip, so the section
    called Sound under a category called Inputs could change the microphone's
    *device* but not whether the microphone was the input at all. The Mic dot
    on the desk now opens this section, and a dot that reports the input has
    to land somewhere that can change it.
  */
  audioSource?: 'none' | 'microphone' | 'system' | 'file' | 'simulated';
  onAudioSource?: (s: 'none' | 'microphone' | 'system' | 'simulated') => void;
  /** The file picker, which cannot be opened from a value change. */
  onAudioFile?: () => void;
  audioInputs?: { id: string; label: string }[];
  audioInputId?: string;
  onAudioInput?: (id: string) => void;
  /** The house lights. */
  blackout?: boolean;
  onBlackout?: () => void;
  /** The projector's geometry and grade, and how to change it. */
  output?: OutputConfig;
  onOutput?: (next: OutputConfig) => void;
  onOutputReset?: () => void;
  /** Whether this machine is keeping its screen awake, and whether it can. */
  wakeLock?: { supported: boolean; held: boolean };
  /**
   * Open showing this section. This is what the command palette's per-section
   * rows use, so "the room" typed into ⌘K lands on the room rather than on the
   * top of a panel with seventeen of them.
   */
  focusSection?: string | null;
  /** What is already on each desk, and how to put something there. */
  pins?: PinApi;
  /** The controller, for the Controller section and its one-click setup. */
  midi?: MidiController;
  /** The full MIDI panel, for the things this panel's section does not hold. */
  onOpenMidi?: () => void;
  /** Where the tempo is coming from, and the three ways to say it by hand. */
  tempo?: { source: string | null; bpm: number; taps: number };
  onTap?: () => void;
  onTempoClear?: () => void;
  onTempoBpm?: (bpm: number) => void;
  /** Whether MIDI clock is arriving on the open port, for the note that says so. */
  midiClocked?: boolean;
  /** Where a desk says we are, formatted, or null when nothing is sending timecode. */
  timecode?: string | null;
  /** What to do when a second screen is connected. */
  projectorMode?: 'ask' | 'auto' | 'off';
  onProjectorMode?: (m: 'ask' | 'auto' | 'off') => void;
  projectorName?: string | null;
  onClose: () => void;
}

/** What the room can be read for, in the order they are worth reaching for. */
const SCENE_FEATURES: [SceneFeature, string][] = [
  ['motion', 'How busy'],
  ['crowd', 'How many'],
  ['spread', 'How spread out'],
  ['centroidX', 'Where — across'],
  ['centroidY', 'Where — up'],
  ['dirX', 'Which way — across'],
  ['dirY', 'Which way — up'],
  ['brightness', 'How light'],
  ['sceneHue', 'What colour'],
];

/** What the sound can be read for. The same features the four fixed selects use. */
const AUDIO_FEATURES: [AudioFeature, string][] = [
  ['volume', 'How loud'],
  ['bass', 'Bass'],
  ['mid', 'Mid'],
  ['treble', 'Treble'],
  ['energy', 'Energy'],
  ['timbre', 'Timbre'],
  ['complexity', 'Complexity'],
];

/** What a patch can listen to, and what each one is called. */
const PATCH_SOURCES: [PatchSource, string][] = [
  ['room', 'Room'],
  ['film', 'Film'],
  ['sound', 'Sound'],
  // The odd one out, and last for that reason: the other three report what is
  // happening in the room, and this one is a shape you asked for.
  ['shape', 'Shapes'],
];

/**
 * The features a source offers.
 *
 * The room and the film are the same analysis over different pixels, so they
 * offer the same nine. The sound offers its own seven, and switching between
 * them has to change the list — "how many people" is not something a microphone
 * can tell you.
 */
const featuresFor = (source: PatchSource): [string, string][] =>
  source === 'sound' ? AUDIO_FEATURES
    : source === 'shape' ? MODULATOR_FEATURES.map(f => [f, MODULATOR_LABELS[f]] as [string, string])
    : SCENE_FEATURES;

/**
 * What a patch may be plugged into. One list, in `sceneMap`, so the dropdown
 * and the fold cannot come to disagree about what is patchable.
 */
const sceneTargets = PATCH_TARGETS;

/**
 * The same list, by the section each control is shown in.
 *
 * Eighty-odd controls in one flat dropdown, in the order they happened to be
 * registered, was a list read top to bottom every time a patch was aimed.
 * Grouped the way the rail is, "the lamp" is a place in the menu, and each
 * group is alphabetical because a select has no search box.
 */
const TARGET_GROUPS = SETTINGS_SECTIONS
  .map(sec => ({
    id: sec.id,
    name: sec.name,
    targets: sceneTargets.filter(t => t.section === sec.id).sort((a, b) => a.label.localeCompare(b.label)),
  }))
  .filter(g => g.targets.length > 0);

/**
 * A labelled range. Lives outside the panel: defined inside it, it was a new
 * component type on every render, so every slider remounted on every change
 * and a drag died after its first step. `disabled` is the reason the control
 * cannot do anything with the current settings; it is shown greyed with that
 * reason as its tooltip.
 */
const Slider = ({ label, value, min, max, step, onChange, icon: Icon, disabled, settingKey }: { label: string; value: number | undefined; min: number; max: number; step: number; onChange: (v: number) => void; icon?: React.ComponentType<{ size?: number }>; disabled?: string | false; settingKey?: keyof VisualizerSettings }) => {
  const safeValue = value ?? 0;
  return (
    <div className={`flex flex-col gap-2 mb-4 ${disabled ? 'opacity-35' : ''}`} title={disabled || undefined} data-disabled={disabled ? 'true' : undefined}>
      <div className="flex items-center justify-between gap-2">
        {/*
          The rail beside this pane is sentence case and so is every control
          on both desks; only in here was a control's own name shouted. Two
          type conventions touching each other reads as two different
          programs, and the shouting one was the one describing eighty
          controls. Section headings keep their uppercase eyebrow, which the
          rail's category headers share — that is a level, not a label.
        */}
        <div className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-text">
          {Icon && <Icon size={14} />}
          <span className="truncate">{label}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {settingKey && <PinChips settingKey={settingKey} />}
          {/*
            And the same reading as the desk, from the same function. This
            printed `toFixed(2)` on everything, so the Dimmer said 100% on the
            desk and 1.00 here — one control disagreeing with itself across two
            screens — and `0.02` for a speed that rides 0.005 to 0.3 told you
            nothing at all.
          */}
          <span className="rounded-xs bg-elevated px-1.5 py-0.5 font-mono text-[12px] font-medium text-text-2">
            {disabled ? disabled : readSetting(String(settingKey ?? ''), safeValue, min, max)}
          </span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={safeValue}
        disabled={!!disabled}
        aria-label={label}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`w-full h-1 bg-white/10 rounded-full appearance-none accent-white transition-all ${disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:accent-gray-300'}`}
      />
    </div>
  );
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onUpdate, calibration, onRecalibrate, engineStatus, getLiveEngineStatus, sceneOn = false, onSceneToggle, sceneState = null, sceneDevices = [], sceneDeviceId = '', onSceneDevice, scenePreviewRef, filmSource = 'none', onFilmFile, onFilmCamera, onFilmWindow, onFilmClear, markLoaded = false, onMarkFile, onMarkClear, audioSource = 'none', onAudioSource, onAudioFile, audioInputs = [], audioInputId = '', onAudioInput, blackout = false, onBlackout, projectorMode = 'ask', onProjectorMode, projectorName = null, output, onOutput, onOutputReset, wakeLock, tempo, onTap, onTempoClear, onTempoBpm, midiClocked = false, timecode = null, focusSection = null, pins, midi, onOpenMidi, onClose }) => {
  const filmInputRef = useRef<HTMLInputElement>(null);
  const markInputRef = useRef<HTMLInputElement>(null);
  /** Whether this browser can capture a window at all. Every phone cannot. */
  const canCaptureWindow = typeof navigator !== 'undefined'
    && typeof (navigator.mediaDevices as { getDisplayMedia?: unknown } | undefined)?.getDisplayMedia === 'function';
  const [live, setLive] = useState<EngineStatus | null>(null);
  /** `?debug` puts the frame's cost split under the engine readout. */
  const showFrameSplit = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('debug');
  useEffect(() => {
    if (!getLiveEngineStatus) return;
    const tick = () => { setLive(getLiveEngineStatus() ?? null); };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [getLiveEngineStatus]);
  const blendModes: BlendMode[] = ['screen', 'lighter', 'exclusion', 'multiply', 'overlay'];
  /**
   * Which section is in the pane.
   *
   * It used to be a three-way filter — Perform, Setup, All — over one column
   * that held every section at once. Both halves of that were wrong. The
   * filter hid ten of the sixteen behind a tab nobody had reason to press, and
   * "All" fixed that by making the column eight screens deep, which is not
   * something you navigate, only something you scroll past. A settings screen
   * is a list of places and one place at a time, and it has been for thirty
   * years, because that is the shape that lets you find a thing twice.
   */
  const [section, setSection] = useState<string>(focusSection ?? FIRST_SECTION);
  useEffect(() => { if (focusSection) setSection(focusSection); }, [focusSection]);

  /** Typing here searches every section, whichever one is in the pane. */
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  /**
   * Is this section on screen right now?
   *
   * A search beats the rail: someone who typed "room" wants the room whether
   * or not they are standing in it. `terms` is what the section is *about*
   * rather than only what it is called — "camera", "people" and "video" all
   * have to find The Room, because the heading alone is the one word nobody
   * searches for.
   */
  const shown = (id: string): boolean => {
    const sec = SECTION_BY_ID.get(id);
    if (q) return !!sec && sectionMatches(sec, q);
    return section === id;
  };
  /** So a search that finds nothing says so rather than showing an empty panel. */
  const paneRef = useRef<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(1);
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    setVisibleCount(pane.querySelectorAll('section[data-section]:not(.hidden)').length);
  }, [q, section]);

  // A new place means the top of it, not wherever the last one was scrolled to.
  useEffect(() => { paneRef.current?.scrollTo({ top: 0 }); }, [section, q]);

  /**
   * Which rail rows to draw: everything, or — while searching — only the
   * sections that match, so the rail is a result list rather than a menu whose
   * rows mostly do nothing.
   */
  /** Which factory map the plugged-in controller wants, if we recognise it. */
  const detectedFactory = useMemo(() => {
    if (!midi?.enabled) return null;
    // Every open port, not just the chosen one: with "All devices" selected
    // `activeInputName` reads "2 devices", which matches nothing.
    for (const i of midi.inputs) {
      const hit = factoryFor(i.name);
      if (hit) return hit;
    }
    return null;
  }, [midi?.enabled, midi?.inputs]);

  /**
   * A way to another section, for a line that names one.
   *
   * The patch bay moved out of The Room, and anyone who knew where it was will
   * look there first. Naming the new place is half of that; being able to
   * press the name is the other half. `from` keeps each copy's test id its
   * own, because every section is in the page at once.
   */
  const goTo = (id: string, from: string) => (
    <button
      onClick={() => { setSection(id); setQuery(''); }}
      className="font-medium text-white/70 underline decoration-white/25 underline-offset-2 hover:text-white"
      data-testid={`goto-${id}-from-${from}`}
    >
      {SECTION_BY_ID.get(id)?.name ?? id}
    </button>
  );

  /** Whether any patch reads this source, which is when its master does anything. */
  const listens = (source: PatchSource) =>
    (settings.sceneMappings ?? []).some(m => (m.source ?? 'room') === source);

  const railGroups = useMemo(() => SETTINGS_CATEGORIES
    .map(cat => ({
      ...cat,
      rows: SETTINGS_SECTIONS.filter(sec => sec.category === cat.id && (!q || sectionMatches(sec, q))),
    }))
    .filter(g => g.rows.length > 0), [q]);

  /*
    A sheet, not a drawer.

    This used to be a 320px column pinned to the right edge with 112px of top
    padding to clear a title bar that no longer exists — under a desk it sat
    over the rides and wasted a seventh of its own height on nothing. The
    sheet is centred, 720 wide, and fills the screen on a phone, so one shell
    serves every size the app runs at.
  */
  return (
    <Sheet title="Settings" onClose={onClose} width={1000} height={860} testId="settings-panel">
      <PinContext.Provider value={pins ?? null}>
      {/*
        A rail and a pane, and the sheet is wider than the other two to hold
        them. Settings is the one sheet with ninety controls in it; the others
        ask one question each and stay at the handoff's 720.

        On a phone the rail becomes a strip across the top: 1000px of sheet on
        a 390px screen is the sheet's own `max-w-full`, and a 216px column
        taken out of that leaves nothing to put a slider in.
      */}
      <div className="flex min-h-0 w-full flex-1 flex-col sm:flex-row">

        {/* ── Where you are ─────────────────────────────────── */}
        <nav
          className="flex max-h-[38%] shrink-0 gap-1 overflow-x-auto overflow-y-auto border-b border-white/10 p-2 sm:max-h-none sm:w-[216px] sm:flex-col sm:border-b-0 sm:border-r"
          aria-label="Settings sections"
          data-testid="settings-rail"
        >
          {railGroups.length === 0 && (
            <p className="p-2 text-[11px] text-white/35">Nothing matches.</p>
          )}
          {railGroups.map(group => (
            <div key={group.id} className="shrink-0 sm:shrink" data-testid={`rail-group-${group.id}`}>
              <div className="hidden px-2 pb-1 pt-3 text-[9px] uppercase tracking-[0.3em] text-white/25 sm:block">
                {group.name}
                <span className="ml-1.5 normal-case tracking-normal text-white/15">{group.hint}</span>
              </div>
              <div className="flex gap-1 sm:flex-col">
                {group.rows.map(row => (
                  <button
                    key={row.id}
                    onClick={() => { setSection(row.id); setQuery(''); }}
                    aria-current={!q && section === row.id ? 'page' : undefined}
                    className={`w-full shrink-0 whitespace-nowrap rounded-lg px-2.5 py-2 text-left text-[12px] transition-colors sm:whitespace-normal ${
                      !q && section === row.id
                        ? 'bg-white text-black'
                        : 'text-white/55 hover:bg-white/10 hover:text-white'
                    }`}
                    data-testid={`settings-nav-${row.id}`}
                  >
                    {row.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* ── What is in it ─────────────────────────────────── */}
        <div ref={paneRef} className="min-h-0 flex-1 overflow-y-auto scrollbar-hide p-6">

      {/*
        A box to type into.

        Seventeen sections and ninety controls is past what anyone browses, and
        a rail alone does not fix that: it tells you where things are once you
        know what they are called. A search is the answer to "where is the
        thing that turns the camera on", and it searches what each section is
        *about* rather than only what it is called — "video", "people" and
        "crowd" all find The Room, none of which is in its heading. While a
        query is in the box the rail narrows to the hits and the pane shows all
        of them at once, which is what a result list is.
      */}
      <div className="relative mb-6">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search every setting — try “camera”, “people”, “keystone”"
          aria-label="Search settings"
          data-testid="settings-search"
          className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-[12px] text-white/90 outline-none placeholder:text-white/30 focus:border-white/30"
        />
        {q && (
          <button
            onClick={() => setQuery('')}
            aria-label="Clear the search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[12px] text-white/40 hover:text-white"
          >
            Clear
          </button>
        )}
      </div>
      {q && visibleCount === 0 && (
        <p className="mb-6 text-[12px] text-white/40" data-testid="settings-no-match">
          Nothing here matches “{query}”.
        </p>
      )}

      {/* The presets live on the title, not here. One menu opened from the
          plate's own name is where a projectionist already looks for them,
          and it carries saving and loading too; a second copy buried in a
          scrolling panel was one more place to keep in step. */}
      {/* Master Section */}
      {/*
        The four things a show is run with, whatever the look: the house lights,
        the blackout, the flash limit and the pace of the plate. They were the
        middle of Sound — between the audio device and the room calibration —
        which is where nobody reaching for the house lights in a dark room looks,
        and the sheet opened on the microphone's sensitivity. It opens here now.
      */}
      <section id="settings-master" className={`mb-8 scroll-mt-4 ${shown('master') ? '' : 'hidden'} ${focusSection === 'master' ? 'rounded-lg ring-1 ring-white/25' : ''}`} data-group="perform" data-section="master">
        <h3 className="text-[12px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Lightbulb size={12} /> Master
        </h3>
        {/* The house lights */}
        <Slider
          label="Dimmer"
          value={settings.dimmer ?? 1}
          min={0}
          max={1}
          step={0.01}
          onChange={(v: number) => onUpdate({ dimmer: v })}
          settingKey="dimmer"
        />
        {onBlackout && (
          <button
            onClick={onBlackout}
            className={`w-full mb-4 -mt-1 py-2 rounded-lg text-[13px] font-medium border transition-all ${blackout ? 'bg-red-500/20 border-red-400/40 text-red-100' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
            title="Fade the plate to black and back (B on the keyboard)"
            data-testid="blackout-button"
          >
            {blackout ? 'Lights up' : 'Blackout'}
          </button>
        )}
        {/* The same switch as the one at the bottom of Wall → Output, where it
            used to live alone: the last control of the longest section. */}
        {output && onOutput && (
          <div className="flex items-center justify-between mb-4">
            <span className="text-[13px] font-medium text-text">Flash Limit</span>
            <button
              onClick={() => onOutput({ ...output, flashGuard: !output.flashGuard })}
              className={`w-10 h-5 rounded-full relative transition-colors ${output.flashGuard ? 'bg-white' : 'bg-white/20'}`}
              title="Hold the whole screen below three flashes a second (photosensitivity)"
              aria-label="Flash Limit"
              aria-pressed={output.flashGuard}
              data-testid="flash-limit-master"
            >
              <div className={`w-4 h-4 rounded-full bg-black absolute top-0.5 transition-transform ${output.flashGuard ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        )}

        {/* 0–0.3, the desk's and the controller's range: the timestep stops
            growing near 0.21, so 70% of the old 0–1 travel only raced the clocks. */}
        <Slider
          label="Speed"
          value={settings.globalSpeed}
          min={0.0}
          max={0.3}
          step={0.001}
          onChange={(v: number) => onUpdate({ globalSpeed: v })}
          settingKey="globalSpeed"
        />
      </section>

      {/* Sound Section */}
      <section id="settings-audio-input" className={`mb-8 scroll-mt-4 ${shown('audio-input') ? '' : 'hidden'} ${focusSection === 'audio-input' ? 'rounded-lg ring-1 ring-white/25' : ''}`} data-group="setup" data-section="audio-input">
        <h3 className="text-[12px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Activity size={12} /> Audio Input
        </h3>
        <Slider
          label="Sensitivity"
          value={settings.sensitivity}
          min={0.1}
          max={3.0}
          step={0.1}
          onChange={(v: number) => onUpdate({ sensitivity: v })}
          settingKey="sensitivity"
        />
        <Slider
          label="Bass Boost"
          value={settings.bassBoost}
          min={1.0}
          max={3.0}
          step={0.1}
          onChange={(v: number) => onUpdate({ bassBoost: v })}
          settingKey="bassBoost"
        />

        {/* What is listening at all */}
        {onAudioSource && (
          <div className="flex flex-col gap-1.5 mb-4 mt-2">
            <span className="text-[13px] font-medium text-text">Source</span>
            <Segmented
              value={audioSource === 'file' ? 'file' : audioSource}
              options={[
                ['none', 'Off'],
                ['microphone', 'Mic'],
                ['system', 'System'],
                ['file', 'File'],
                ['simulated', 'Band'],
              ] as const}
              onChange={(v) => { if (v === 'file') onAudioFile?.(); else onAudioSource(v); }}
              height={32}
              testId="audio-source"
            />
            <Info>
              <b>Mic</b> hears the room. <b>System</b> captures a tab or the whole machine, so a stream drives the plate with no microphone in the loop. <b>File</b> plays a track here and is the straightest signal there is. <b>Band</b> is a synthesised group played silently into the analyser — no device, no permission, and every mapping runs exactly as it does on a real input.
            </Info>
          </div>
        )}

        {/* The input: a USB interface fed from the desk, not the laptop's own microphone */}
        {onAudioInput && (
          <div className="flex flex-col gap-1.5 mb-4 mt-2">
            <span className="text-[13px] font-medium text-text">Input</span>
            <select
              value={audioInputId}
              onChange={(e) => onAudioInput(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/40"
              data-testid="audio-input"
            >
              <option value="">Default microphone</option>
              {audioInputs.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
            <Info>
              On stage, ask the sound desk for an aux send into a USB audio interface and pick it here: a clean feed heavy on kick, snare and bass drives the plate better than a microphone hearing the room.
            </Info>
          </div>
        )}

        {/* Room calibration */}
        <div className="flex items-center justify-between mb-3 mt-5">
          <span className="text-[13px] font-medium text-text">Auto Calibrate</span>
          <button
            onClick={() => onUpdate({ autoCalibrate: !(settings.autoCalibrate !== false) })}
            className={`w-10 h-5 rounded-full relative transition-colors ${settings.autoCalibrate !== false ? 'bg-white' : 'bg-white/20'}`}
            title="Learn this room's noise floor and dynamics, and drive the visuals from where the music sits between them"
          >
            <div className={`w-4 h-4 rounded-full bg-black absolute top-0.5 transition-transform ${settings.autoCalibrate !== false ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
        {/* The beat, ahead of the microphone */}
        <Slider
          label="Beat Prediction"
          value={settings.beatPrediction ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ beatPrediction: v })}
          settingKey="beatPrediction"
        />
        <Slider
          label="Beat Lead"
          value={settings.beatLead ?? 0}
          min={0}
          max={250}
          step={5}
          onChange={(v: number) => onUpdate({ beatLead: v })}
          settingKey="beatLead"
        />
        <Info>
          A microphone hears late. Once the clock has locked onto the tempo, kicks fire from it, this many milliseconds ahead of the onset being heard; a breakdown or silence hands back to plain detection.
        </Info>

        {/* Somewhere to get the tempo from besides the microphone */}
        {onTap && (
          <div className="mb-4 mt-2 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-text">Tempo</span>
              <span className="font-mono text-[12px] opacity-50" data-testid="tempo-readout">
                {tempo?.source
                  ? `${tempo.bpm} bpm \u00b7 ${tempo.source === 'clock' ? 'midi clock' : tempo.source === 'tap' ? 'tapped' : 'set'}`
                  : 'listening'}
              </span>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={onTap}
                data-testid="tempo-tap"
                title="Tap the beat — two taps give a tempo, four give a good one. Also on any pad, as the Tap Tempo action."
                className="min-h-11 flex-1 rounded-lg border border-white/10 bg-white/5 text-[13px] font-medium transition-all hover:bg-white/10"
              >
                Tap{tempo && tempo.taps > 0 && tempo.source !== 'clock' ? ` \u00b7 ${tempo.taps}` : ''}
              </button>
              <button
                onClick={onTempoClear}
                disabled={!tempo?.source}
                data-testid="tempo-listen"
                title="Back to working the tempo out from what it can hear"
                className={`min-h-11 flex-1 rounded-lg border text-[13px] font-medium transition-all ${
                  tempo?.source ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'cursor-not-allowed border-white/5 opacity-30'
                }`}
              >
                Listen
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={60}
                max={200}
                step={1}
                placeholder="bpm"
                aria-label="Tempo in beats per minute"
                data-testid="tempo-bpm"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const v = parseFloat((e.target as HTMLInputElement).value);
                  if (Number.isFinite(v)) onTempoBpm?.(v);
                }}
                onBlur={(e) => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v)) onTempoBpm?.(v);
                }}
                className="min-h-11 w-24 rounded-lg border border-white/10 bg-white/5 px-3 font-mono text-[12px] outline-none focus:border-white/30"
              />
              <span className="text-[12px] opacity-30">off the setlist</span>
            </div>
            <Info>
              The beat clock works the tempo out from what it hears, which is the right answer on a clean feed from the desk and a hard one in a loud room. Three ways to tell it instead.
              {' '}<span className="text-white/70">MIDI clock</span> needs nothing set up: if the desk is sending it down the cable the faders are already on, the show locks to it{midiClocked ? ' \u2014 and it is arriving now' : ''}.
              {' '}<span className="text-white/70">Tap</span> sets the tempo *and* the bar, so tap on the downbeats and the plate is pressed on the downbeats; one tap on its own re-phases a tempo that is already running, which is how to get back on the bar after a fill.
              {' '}A <span className="text-white/70">typed number</span> sets the tempo and leaves the bar alone.
              {' '}Any of them overrides the microphone until <span className="text-white/70">Listen</span>; a MIDI clock that stops sending hands back by itself.
            </Info>
            {/*
              Timecode is not a tempo, so it is its own line rather than a
              fourth way of setting one. Shown only while a desk is sending:
              a readout that says nothing all evening is worse than no readout.
            */}
            {timecode && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2" data-testid="timecode-readout">
                <span className="text-[13px] font-medium text-text">Timecode</span>
                <span className="font-mono text-[13px] tabular-nums">{timecode}</span>
                <span className="text-[12px] opacity-40">the sequence is following the desk</span>
              </div>
            )}
          </div>
        )}

        {/* A new song, a new look */}
        <div className="flex flex-col gap-2 mb-4 mt-2">
          <div className="text-[13px] font-medium text-text">On a New Song</div>
          <div className="grid grid-cols-3 gap-1">
            {([['off', 'Keep'], ['preset', 'New preset'], ['random', 'Random']] as const).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => onUpdate({ onNewSong: mode })}
                className={`py-1.5 rounded-lg text-[13px] font-medium border transition-all ${
                  (settings.onNewSong ?? 'off') === mode ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
                title={mode === 'off' ? 'Keep the look across songs' : mode === 'preset' ? 'Switch to another preset when a new song starts' : 'Roll a random look when a new song starts'}
                data-testid={`new-song-${mode}`}
              >
                {label}
              </button>
            ))}
          </div>
          <Info>
            A new song is heard as a gap of a few seconds between tracks, or named by track identification. The sequencer keeps control while it is running.
          </Info>
        </div>
        {settings.autoCalibrate !== false && (
          <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-3">
            {calibration ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] opacity-60">
                    {calibration.calibrating ? 'Listening to the room' : calibration.signal ? 'Calibrated' : 'Room is quiet'}
                  </span>
                  <span className="text-[12px] font-mono opacity-50">
                    {calibration.floorDb.toFixed(0)} → {calibration.peakDb.toFixed(0)} dB
                  </span>
                </div>
                <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${calibration.calibrating ? 'bg-white/60' : 'bg-emerald-400/80'}`}
                    style={{ width: `${Math.round(calibration.progress * 100)}%` }}
                  />
                </div>
              </>
            ) : (
              <span className="text-[12px] opacity-40">Waiting for audio</span>
            )}
            <button
              onClick={() => onRecalibrate?.()}
              className="mt-3 w-full rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-[13px] font-medium opacity-70 transition-colors hover:bg-white/10 hover:opacity-100"
            >
              Recalibrate room
            </button>
          </div>
        )}
      </section>

      {/* Sound Mappings Section */}
      <section id="settings-audio-mappings" className={`mb-8 scroll-mt-4 ${shown('audio-mappings') ? '' : 'hidden'} ${focusSection === 'audio-mappings' ? 'rounded-lg ring-1 ring-white/25' : ''}`} data-group="setup" data-section="audio-mappings">
        <h3 className="text-[12px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Activity size={12} /> Sound Mappings
        </h3>

        {/*
          Sound Drive: how hard the music moves the plate at all.

          It is the headline ride — the first fader on every factory map and
          the one a hand is on through a chorus — and until now the only place
          it existed was the narrow-screen toolbar, which a desktop never
          draws. The panel that claims to hold every setting did not hold the
          most important one.
        */}
        <Slider
          label="Sound Drive"
          value={settings.audioImpact}
          min={0}
          max={1}
          step={0.01}
          icon={Activity}
          onChange={(v: number) => onUpdate({ audioImpact: v })}
          settingKey="audioImpact"
        />
        {/*
          The four selects below are the fixed wiring — which audio band drives
          velocity, density, colour and rotation — and they stay, because they
          are what the solver reads directly. The other way in is a patch,
          which can take *any* audio feature to *any* setting; Sound Impact,
          the master over those, sits with the patch bay under Patches.
        */}
        {['velocity', 'density', 'color', 'rotation'].map((param) => (
          <div key={param} className="flex flex-col gap-2 mb-4">
            <span className="text-[13px] font-medium text-text">{param}</span>
            <select
              value={settings.audioMappings[param as keyof typeof settings.audioMappings]}
              onChange={(e) => onUpdate({
                audioMappings: {
                  ...settings.audioMappings,
                  [param]: e.target.value
                }
              })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:border-white/30 transition-all"
            >
              {['none', 'volume', 'bass', 'mid', 'treble', 'energy', 'timbre', 'complexity'].map((feature) => (
                <option key={feature} value={feature} className="bg-gray-900">
                  {feature}
                </option>
              ))}
            </select>
          </div>
        ))}
        <p className="mb-3 text-[12px] leading-relaxed text-white/40">
          Any sound feature onto any other control is a patch, in {goTo('patches', 'sound')}.
        </p>
      </section>

      {/* Light Show Look Section */}
      <section id="settings-look" className={`mb-8 scroll-mt-4 ${shown('look') ? '' : 'hidden'} ${focusSection === 'look' ? 'rounded-lg ring-1 ring-white/25' : ''}`} data-group="perform" data-section="look">
        <h3 className="text-[12px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Palette size={12} /> Light Show Look
        </h3>
        <Slider
          label="Turbulence Scale"
          value={settings.turbulenceScale}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ turbulenceScale: v })}
          settingKey="turbulenceScale"
        />
        <Slider
          label="Turbulence Detail"
          value={settings.turbulenceDetail}
          min={1}
          max={4}
          step={1}
          onChange={(v: number) => onUpdate({ turbulenceDetail: Math.round(v) })}
          settingKey="turbulenceDetail"
        />
        <Slider
          label="Sharpness"
          value={settings.sharpness ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ sharpness: v })}
          settingKey="sharpness"
        />
        <Slider
          label="Granulation"
          value={settings.granulation ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ granulation: v })}
          settingKey="granulation"
        />
        {/* "Fineness", not "Size": the number is grain cells across the
            plate, so up is finer grain, not bigger. */}
        <Slider
          label="Grain Fineness"
          disabled={(settings.granulation ?? 0) <= 0.002 && 'needs Granulation above 0'}
          value={settings.grainScale ?? 320}
          min={60}
          max={900}
          step={20}
          onChange={(v: number) => onUpdate({ grainScale: v })}
          settingKey="grainScale"
        />
        <Slider
          label="Blob Surface Tension"
          value={settings.blobSurfaceTension}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ blobSurfaceTension: v })}
          settingKey="blobSurfaceTension"
        />
        <Slider
          label="Dye Budget"
          value={settings.dyeBudget ?? 0.85}
          min={0.1}
          max={1.2}
          step={0.05}
          onChange={(v: number) => onUpdate({ dyeBudget: v })}
          settingKey="dyeBudget"
        />
        <Slider
          label="Edge Relief"
          value={settings.edgeRelief ?? 0.4}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ edgeRelief: v })}
          settingKey="edgeRelief"
        />
        <Slider
          label="Lacing"
          value={settings.lacing ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ lacing: v })}
          settingKey="lacing"
        />
        <Slider
          label="Bubbles"
          value={settings.bubbles ?? 0.5}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ bubbles: v })}
          settingKey="bubbles"
        />
        <Slider
          label="Plate Rock"
          value={settings.plateRock ?? 0.45}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ plateRock: v })}
          settingKey="plateRock"
        />
        <Slider
          label="Layer Scale Variety"
          disabled={(settings.layerCount ?? 1) < 2 && 'needs 2 Layers'}
          value={settings.layerScaleVariety ?? 0.5}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ layerScaleVariety: v })}
          settingKey="layerScaleVariety"
        />
        <Slider
          label="Boundary Glow"
          value={settings.boundaryContrast}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ boundaryContrast: v })}
          settingKey="boundaryContrast"
        />
        <Slider
          label="Saturation"
          value={settings.saturationBoost}
          min={0.5}
          max={2.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ saturationBoost: v })}
          settingKey="saturationBoost"
        />
        <Slider
          label="Glossiness"
          value={settings.glossiness}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ glossiness: v })}
          settingKey="glossiness"
        />
        <Slider
          label="Post Blur"
          value={settings.postBlurRadius}
          min={0}
          max={1.5}
          step={0.05}
          onChange={(v: number) => onUpdate({ postBlurRadius: v })}
          settingKey="postBlurRadius"
        />
      </section>

      {/* Show Section */}
      <section id="settings-show" className={`mb-8 scroll-mt-4 ${shown('show') ? '' : 'hidden'} ${focusSection === 'show' ? 'rounded-lg ring-1 ring-white/25' : ''}`} data-group="perform" data-section="show">
        <h3 className="text-[12px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Clapperboard size={12} /> Show
        </h3>
        <Info>
          How the show moves over minutes, not seconds: the set walking its hues, the rhythm plate pressed on the kick, a slow loop behind the live plate, and the round dish and spread of the projected clock faces. The Show Sequencer scripts these over a song.
        </Info>
        <Slider
          label="Hue Journey (min/step)"
          value={settings.hueJourney ?? 0}
          min={0}
          max={10}
          step={0.5}
          onChange={(v: number) => onUpdate({ hueJourney: v })}
          settingKey="hueJourney"
        />
        <Slider
          label="Beat Squeeze"
          value={settings.beatSqueeze ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ beatSqueeze: v })}
          settingKey="beatSqueeze"
        />
        <Slider
          label="Fingering"
          value={settings.fingering ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ fingering: v })}
          settingKey="fingering"
        />
        <Info>
          A press (the tool, the pad, a kick with Beat Squeeze) breaks into radial fingers instead of a smooth ring: the thin liquid shooting through the thick one, the Fillmore sunburst.
        </Info>
        <Slider
          label="Oil Beads"
          value={settings.beads ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ beads: v })}
          settingKey="beads"
        />
        <Slider
          label="Plate Cells"
          value={settings.cells ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ cells: v })}
          settingKey="cells"
        />
        <Slider
          label="Background Loop"
          disabled={(settings.layerCount ?? 1) < 2 && 'needs 2 Layers'}
          value={settings.backgroundLoop ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ backgroundLoop: v })}
          settingKey="backgroundLoop"
        />
        <Slider
          label="Round Dish"
          value={settings.dishVignette ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ dishVignette: v })}
          settingKey="dishVignette"
        />
        <Slider
          label="Dish Spread"
          value={settings.dishSpread ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ dishSpread: v })}
          settingKey="dishSpread"
        />
        <Info>
          Each layer its own dish, spread apart on a black screen the way two or three projectors overlap: the lead plate large and right of centre, the second smaller at the left.
        </Info>
      </section>

      {/* Camera Section */}
      <section id="settings-camera" className={`mb-8 scroll-mt-4 ${shown('camera') ? '' : 'hidden'} ${focusSection === 'camera' ? 'rounded-lg ring-1 ring-white/25' : ''}`} data-group="setup" data-section="camera">
        <h3 className="text-[12px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Aperture size={12} /> Camera
        </h3>
        <Info>
          The macro photograph instead of the projected show: a lit paper backdrop, dye as transmission, every drop a dome with a softbox in it, then a real lens over the picture — refraction, a focal plane, bloom, colour fringing, the sensor's roll-off.
        </Info>
        <div className="flex flex-col gap-2 mb-4">
          <div className="text-[13px] font-medium text-text">Render Style</div>
          <div className="grid grid-cols-2 gap-1">
            {(['show', 'photo'] as const).map((style) => (
              <button
                key={style}
                onClick={() => onUpdate({ renderStyle: style })}
                className={`py-1.5 rounded-lg text-[13px] font-medium border transition-all ${
                  (settings.renderStyle ?? 'show') === style ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
                title={style === 'show' ? 'The projected light show: dye as light on black' : 'The photograph: dye over lit paper'}
                data-testid={`render-${style}`}
              >
                {style === 'show' ? 'Light show' : 'Photograph'}
              </button>
            ))}
          </div>
        </div>
        {(settings.renderStyle ?? 'show') === 'photo' && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            {(['paperA', 'paperB'] as const).map((key) => (
              <label key={key} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                <span className="text-[13px] font-medium opacity-60">{key === 'paperA' ? 'Paper A' : 'Paper B'}</span>
                <input
                  type="color"
                  value={settings[key] ?? '#000000'}
                  onChange={(e) => onUpdate({ [key]: e.target.value } as Partial<VisualizerSettings>)}
                  className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                />
              </label>
            ))}
          </div>
        )}
        {/*
          "Lens", not "Camera": the section is called Camera, the room has a
          camera and the film has one too, and this is none of them — it is
          how much of the photograph's lens is over the picture.
        */}
        <Slider label="Lens" value={settings.camera ?? 0} min={0} max={1.0} step={0.05} onChange={(v: number) => onUpdate({ camera: v })}
          settingKey="camera"
        />
        <Slider disabled={(settings.camera ?? 0) <= 0.001 && 'needs Lens above 0'} label="Focus" value={settings.focus ?? 0.5} min={0} max={1.0} step={0.05} onChange={(v: number) => onUpdate({ focus: v })}
          settingKey="focus"
        />
        <Slider disabled={(settings.camera ?? 0) <= 0.001 && 'needs Lens above 0'} label="Aperture" value={settings.aperture ?? 0} min={0} max={1.0} step={0.05} onChange={(v: number) => onUpdate({ aperture: v })}
          settingKey="aperture"
        />
        <Slider disabled={(settings.camera ?? 0) <= 0.001 && 'needs Lens above 0'} label="Bloom" value={settings.bloom ?? 0} min={0} max={1.0} step={0.05} onChange={(v: number) => onUpdate({ bloom: v })}
          settingKey="bloom"
        />
        <Slider disabled={(settings.camera ?? 0) <= 0.001 && 'needs Lens above 0'} label="Chromatic Aberration" value={settings.chromaticAberration ?? 0} min={0} max={1.0} step={0.05} onChange={(v: number) => onUpdate({ chromaticAberration: v })}
          settingKey="chromaticAberration"
        />
        <Slider disabled={(settings.camera ?? 0) <= 0.001 && 'needs Lens above 0'} label="Refraction" value={settings.refraction ?? 0} min={0} max={1.0} step={0.05} onChange={(v: number) => onUpdate({ refraction: v })}
          settingKey="refraction"
        />
        <Slider label="Micro-Droplets" value={settings.microDroplets ?? 0} min={0} max={1.0} step={0.05} onChange={(v: number) => onUpdate({ microDroplets: v })}
          settingKey="microDroplets"
        />
        <Slider label="Thin Film" value={settings.thinFilm ?? 0} min={0} max={1.0} step={0.05} onChange={(v: number) => onUpdate({ thinFilm: v })}
          settingKey="thinFilm"
        />
      </section>

      {/*
        Kaleidoscope Section

        It used to be one control three-quarters of the way down Show, between
        Background Loop and Round Dish, and two of its three dimensions were
        constants inside the shader — so there was nothing to group and no way
        to play it. Folds, how fast the rig turns, and how much plate feeds
        each wedge, together, and all three on the MIDI list.
      */}
      <section id="settings-kaleidoscope" className={`mb-8 scroll-mt-4 ${shown('kaleidoscope') ? '' : 'hidden'} ${focusSection === 'kaleidoscope' ? 'rounded-lg ring-1 ring-white/25' : ''}`} data-group="perform" data-section="kaleidoscope">
        <h3 className="text-[12px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Aperture size={12} /> Kaleidoscope
        </h3>
        <Info>
          A mirror rig over the plate, the four-fold dish of the reference stills. Folds sets how many wedges; Kaleido Spin turns the rig, and runs backwards below zero; Kaleido Zoom decides how much of the plate feeds each wedge — pulled in, a few enormous shapes, and taken out to the rim, something fine and busy. All three ride a fader.
        </Info>
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[13px] font-medium text-text">Folds</div>
            {pins && <PinChips settingKey="kaleidoscope" />}
          </div>
          <div className="grid grid-cols-5 gap-1" data-testid="kaleido-folds">
            {[0, 2, 4, 6, 8].map((k) => (
              <button
                key={k}
                onClick={() => onUpdate({ kaleidoscope: k })}
                className={`py-1.5 rounded-lg text-[13px] font-medium border transition-all ${
                  Math.round(settings.kaleidoscope ?? 0) === k ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
                title={k === 0 ? 'No mirror rig' : `${k} mirrored wedges`}
                data-testid={`kaleido-folds-${k}`}
              >
                {k === 0 ? 'Off' : `${k}×`}
              </button>
            ))}
          </div>
        </div>
        <Slider
          label="Kaleido Spin"
          value={settings.kaleidoSpin ?? 0}
          min={-0.5}
          max={0.5}
          step={0.005}
          onChange={(v: number) => onUpdate({ kaleidoSpin: v })}
          settingKey="kaleidoSpin"
          disabled={Math.round(settings.kaleidoscope ?? 0) < 2 && 'needs a fold count above Off'}
        />
        <Slider
          label="Kaleido Zoom"
          value={settings.kaleidoZoom ?? 0.72}
          min={0.2}
          max={1.6}
          step={0.01}
          onChange={(v: number) => onUpdate({ kaleidoZoom: v })}
          settingKey="kaleidoZoom"
          disabled={Math.round(settings.kaleidoscope ?? 0) < 2 && 'needs a fold count above Off'}
        />
      </section>

      {/* Lamp & Light Section */}
      <section id="settings-lamp" className={`mb-8 scroll-mt-4 ${shown('lamp') ? '' : 'hidden'} ${focusSection === 'lamp' ? 'rounded-lg ring-1 ring-white/25' : ''}`} data-group="perform" data-section="lamp">
        <h3 className="text-[12px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Lightbulb size={12} /> Lamp &amp; Light
        </h3>
        <Info>
          One lamp under the plate, and every material lit from where it sits: bubbles shaded as lenses with a caustic arc on the far side, dye rims bright toward the lamp and shadowed away from it. The lamp wanders, and rocks with the plate; a second lamp from the other side puts two lights across everything.
        </Info>
        <Slider
          label="Light Play"
          value={settings.lightPlay ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ lightPlay: v })}
          settingKey="lightPlay"
        />
        <Slider
          label="Lamp Motion"
          value={settings.lampMotion ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ lampMotion: v })}
          settingKey="lampMotion"
        />
        <Slider
          label="Hot-Spot"
          value={settings.lampHotspot ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ lampHotspot: v })}
          settingKey="lampHotspot"
        />
        <Slider
          label="Second Lamp"
          value={settings.secondLamp ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ secondLamp: v })}
          settingKey="secondLamp"
        />
        <Slider
          label="Iridescence"
          value={settings.iridescence ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ iridescence: v })}
          settingKey="iridescence"
        />
        {/*
          The other machines a crew stacked in front of the lamp.

          These were the back half of Projectors, after the corner pin and the
          masks: a section set once at load-in and then left alone, holding six
          controls that are ridden during a song. They colour the light, so
          they are here with the lamp rather than with the wall.
        */}
        <div className="mt-6 mb-3 text-[13px] font-medium text-text">The other machines</div>
        <Info>
          What else a light show crew stacked on the screen: Thomas Wilfred’s lumia rig, a reaction growing on the platen, a gel wheel turning over the lamp, and a sealed oil wheel’s halogen grade and exposure.
        </Info>
        <Slider
          label="Lumia"
          value={settings.lumia ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ lumia: v })}
          settingKey="lumia"
        />
        <Slider
          label="Chemistry"
          value={settings.chemistry ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ chemistry: v })}
          settingKey="chemistry"
        />
        <Slider
          label="Gel Wheel"
          value={settings.gelWheel ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ gelWheel: v })}
          settingKey="gelWheel"
        />
        <Slider
          label="Gel Speed (rpm)"
          disabled={(settings.gelWheel ?? 0) <= 0.001 && 'needs Gel Wheel above 0'}
          value={settings.gelSpeed ?? 0.5}
          min={0}
          max={3}
          step={0.1}
          onChange={(v: number) => onUpdate({ gelSpeed: v })}
          settingKey="gelSpeed"
        />
        <Slider
          label="Lamp Warmth"
          value={settings.lampWarmth ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ lampWarmth: v })}
          settingKey="lampWarmth"
        />
        <Slider
          label="Exposure"
          value={settings.exposure ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ exposure: v })}
          settingKey="exposure"
        />
      </section>

      {/* The Room Section */}
      <section id="settings-room" className={`mb-8 scroll-mt-4 ${shown('room') ? '' : 'hidden'} ${focusSection === 'room' ? 'rounded-lg ring-1 ring-white/25' : ''}`} data-group="setup" data-section="room">
        <h3 className="text-[12px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Video size={12} /> The Room
        </h3>
        <Info>
          The camera pointed at the room, read back rather than shown: movement in front of the lens becomes movement in the liquid. Aim it at the floor, not at the screen — a camera that can see the projection makes the plate drive itself.
        </Info>
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => onSceneToggle?.(!sceneOn)}
            className={`flex-1 py-2 rounded-lg text-[13px] font-medium border transition-all ${sceneOn ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
            data-testid="scene-toggle"
          >
            {sceneOn ? 'Watching' : 'Watch the room'}
          </button>
        </div>
        {sceneOn && sceneDevices.length > 1 && (
          <select
            value={sceneDeviceId}
            onChange={(e) => onSceneDevice?.(e.target.value)}
            aria-label="Room camera"
            className="w-full mb-3 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] outline-none"
          >
            <option value="">Default camera</option>
            {sceneDevices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>
            ))}
          </select>
        )}
        {sceneOn && (
          <div className="mb-4">
            <canvas
              ref={scenePreviewRef}
              width={192}
              height={192}
              className="w-full aspect-square rounded-lg border border-white/10 bg-black/60"
              data-testid="scene-preview"
            />
            {sceneState?.error ? (
              <p className="mt-2 text-[12px] leading-relaxed text-amber-300/80">{sceneState.error}</p>
            ) : (
              <>
                <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-white/70 transition-[width] duration-100" style={{ width: `${Math.round((sceneState?.energy ?? 0) * 100)}%` }} />
                </div>
                <div className="mt-1 flex items-center justify-between text-[12px] font-mono opacity-40">
                  <span>{sceneState?.active ? `${sceneState.people} tracked` : 'opening…'}</span>
                  <span>{sceneState ? `${sceneState.ms.toFixed(1)} ms` : ''}</span>
                </div>
              </>
            )}
            <p className="mt-2 text-[12px] leading-relaxed opacity-40">
              Frames are read in this page and never leave it. Nothing is recorded, and the camera stops the moment this is switched off.
            </p>
          </div>
        )}
        <Slider
          label="Room Drive"
          value={settings.sceneDrive ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ sceneDrive: v })}
          disabled={!sceneOn && 'off'}
          settingKey="sceneDrive"
        />
        <Slider
          label="Hands"
          value={settings.sceneHands ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ sceneHands: v })}
          disabled={!sceneOn ? 'off' : settings.scenePeople === false && 'needs Hold people'}
          settingKey="sceneHands"
        />
        <Slider
          label="Deadzone"
          value={settings.sceneDeadzone ?? 0.25}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ sceneDeadzone: v })}
          disabled={!sceneOn && 'off'}
          settingKey="sceneDeadzone"
        />
        <Slider
          label="Smoothing"
          value={settings.sceneSmooth ?? 0.35}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ sceneSmooth: v })}
          disabled={!sceneOn && 'off'}
          settingKey="sceneSmooth"
        />
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => onUpdate({ scenePeople: !(settings.scenePeople !== false) })}
            className={`flex-1 py-1.5 rounded-lg text-[13px] font-medium border transition-all ${settings.scenePeople !== false ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
            data-testid="scene-people"
          >
            Hold people
          </button>
          <button
            onClick={() => onUpdate({ sceneMirror: !(settings.sceneMirror !== false) })}
            className={`flex-1 py-1.5 rounded-lg text-[13px] font-medium border transition-all ${settings.sceneMirror !== false ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
            data-testid="scene-mirror"
            title="Flip the camera's view left for right, for a camera facing the room"
          >
            Flip Camera
          </button>
        </div>
        {/* The patch bay was here. It reads the film, the sound and the shapes
            as well as this camera, so it has a section of its own now — and a
            line where it used to be, because this is where anyone who knew it
            will look first. */}
        <p className="mt-3 mb-3 text-[12px] leading-relaxed text-white/40">
          Any feature of the room onto any control is a patch, in {goTo('patches', 'room')}.
        </p>
        <Info>
          <span className="text-white/70">Room Drive</span> is how hard what happens in front of the lens stirs the lead plate: an arm swept across the room sweeps the dye the same way. Aim it at the floor or the crowd rather than at the screen: a camera that can see the projection makes the plate drive itself, and while that settles rather than running away, what it settles into is a plate being stirred by nothing in particular. <span className="text-white/70">Hands</span> puts each person on the glass: standing still is a palm pressed on the plate, walking is a puff of air the way they are going, and arriving drops their own dye — one of the preset's, picked by who they are, so the same dancer stays the same colour all set. <span className="text-white/70">Deadzone</span> is how much movement counts as someone rather than as the room breathing; <span className="text-white/70">Smoothing</span> how long the liquid remembers a gesture. <span className="text-white/70">Hold people</span> finds the figures in the frame and keeps hold of each one, which is what lets a person carry a dye; turning it off is cheaper. <span className="text-white/70">Flip Camera</span> for a camera facing the room, so a hand moved left moves the dye left.
        </Info>
      </section>

      {/*
        Film

        The film projector, as the input it is. It was the bottom third of
        Projectors, under the corner pin and a gel wheel, which put the one
        thing there that drives the plate in a section about the wall — and
        made that section the longest on the rail. A reel, a camera on a real
        dish or another window, how it shows, and what it does to the liquid.
      */}
      <section id="settings-film" className={`mb-8 scroll-mt-4 ${shown('film') ? '' : 'hidden'} ${focusSection === 'film' ? 'rounded-lg ring-1 ring-white/25' : ''}`} data-group="inputs" data-section="film">
        <h3 className="text-[12px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Film size={12} /> Film
        </h3>
        <div className="mt-2 mb-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-text">Source</span>
            <span className="text-[12px] font-mono opacity-50">
              {filmSource === 'file' ? 'loop playing'
                : filmSource === 'camera' ? 'camera live'
                : filmSource === 'window' ? 'window live'
                : 'off'}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              ref={filmInputRef}
              id="film-loop-file"
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFilmFile?.(f); e.target.value = ''; }}
            />
            <button
              onClick={() => filmInputRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-2 py-2 text-[13px] font-medium hover:bg-white/10"
              title="Play a video file through the dye, looping"
            >
              <Film size={13} /> Load loop
            </button>
            <button
              onClick={() => onFilmCamera?.()}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-2 py-2 text-[13px] font-medium hover:bg-white/10"
              title="Point a camera at a real dish of oil and composite it through the solver"
              data-testid="film-camera"
            >
              <Camera size={13} /> Camera
            </button>
            {/*
              Disabled rather than silently doing nothing where the browser
              has no screen capture — which is every phone. A button that
              looks pressable and answers with a console warning is the kind
              of control that makes someone doubt the rest of the panel.
            */}
            <button
              onClick={() => onFilmWindow?.()}
              disabled={!canCaptureWindow}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-2 py-2 text-[13px] font-medium hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
              title={canCaptureWindow
                ? 'Play another tab, window or screen through the dye — a film from the Internet Archive, a media player, anything on this machine'
                : 'This browser cannot capture a window. Desktop Chrome, Edge, Firefox and Safari can; phones cannot.'}
              data-testid="film-window"
            >
              <MonitorPlay size={13} /> Window
            </button>
            <button
              onClick={() => onFilmClear?.()}
              disabled={filmSource === 'none'}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[13px] font-medium hover:bg-white/10 disabled:opacity-30"
              data-testid="film-off"
            >
              Off
            </button>
          </div>
          <Info>
            <span className="text-white/60">Window</span> is the way to a film you did not download.
            Open one in another tab — the Internet Archive's Prelinger collection is thousands of
            public-domain reels of exactly this era — press Window, and pick that tab. It reaches what a
            link cannot: a video from another site plays in a page but cannot be read back into the
            plate, and almost nothing on the web sends the header that would allow it. A window has no
            origin, only pixels. Mute the tab and let the room's own sound drive the plate.
          </Info>
        </div>
        <Slider
          label="Film Mix"
          disabled={(filmSource ?? 'none') === 'none' && 'needs a loop, the camera or a window'}
          value={settings.filmMix ?? 0.7}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ filmMix: v })}
          settingKey="filmMix"
        />
        <Slider
          label="Film Key"
          disabled={(filmSource ?? 'none') === 'none' && 'needs a loop, the camera or a window'}
          value={settings.filmKey ?? 0.18}
          min={0}
          max={0.9}
          step={0.02}
          onChange={(v: number) => onUpdate({ filmKey: v })}
          settingKey="filmKey"
        />
        {/*
          The film as a force, not only a light.

          Film Mix and Film Key decide how the reel *shows*. Film Drive and
          the film's patches decide what it *does*: the same analysis that
          reads the room camera reads the film, so a pan drags the dye, a cut
          hits it, and a busy sequence can ride whatever a room patch rides.
          Film Drive and Film Impact (under Patches) both at zero — the
          default, and what every look saved before this does — and the
          projector is the slide it always was, with the sensor not even
          running.
        */}
        <Slider
          label="Film Drive"
          disabled={(filmSource ?? 'none') === 'none' && 'needs a loop, the camera or a window'}
          value={settings.filmDrive ?? 0}
          min={0}
          max={1}
          step={0.05}
          icon={Wind}
          onChange={(v: number) => onUpdate({ filmDrive: v })}
          settingKey="filmDrive"
        />
        <p className="mb-3 text-[12px] leading-relaxed text-white/40">
          Any feature of the film onto any control is a patch, in {goTo('patches', 'film')}, where Film Impact is its master.
        </p>
        {filmSource !== 'none' && (
          <Info>
            <span className="text-white/60">Film Drive</span> puts the film's own motion into the
            liquid: a pan drags the dye the way it pans, a crowd scene stirs it, a locked-off shot
            does nothing at all — which is right, because nothing is moving. A patch reads the same
            nine features off the reel that the room camera reads off the floor, so "how busy →
            Turbulence" works off either. One warning worth having: capture this app's own window
            with Film Drive up and you have built a feedback loop. It saturates rather than runs
            away — the stir is capped per cell — but a plate stirred by a picture of itself is a
            plate being stirred by nothing in particular.
          </Info>
        )}
      </section>

      {/*
        Patches

        The patch bay, and the four faders that each pull a whole source down.

        It lived in The Room, because the room camera was the first thing that
        could ride a setting. By the time it also read the film, the sound and
        the shapes, most of what it routed had nothing to do with the room,
        and its masters were spread across three sections — Sound Impact in
        Sound Mappings, Room Impact in The Room, Film Impact in Projectors —
        while the shapes had none on screen at all. The bay and every master
        over it are one place now, after the sources it reads.
      */}
      <section id="settings-patches" className={`mb-8 scroll-mt-4 ${shown('patches') ? '' : 'hidden'} ${focusSection === 'patches' ? 'rounded-lg ring-1 ring-white/25' : ''}`} data-group="inputs" data-section="patches">
        <h3 className="text-[12px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Cable size={12} /> Patches
        </h3>
        <Info>
          A patch is a <span className="text-white/60">source</span>, something that changes in it,
          a control it moves, and how far — a floor filling up opening the turbulence, a crowd
          going still slowing the plate, someone crossing left to right walking the lamp across
          with them. The source can be the room camera, the film projector, the sound, or a shape
          (an LFO on the bar, or an envelope a pad fires), and a patch can land on every plate or
          on one of them, so a reel can drive layer 1 while the bass drives layer 2.
        </Info>
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[13px] font-medium text-text">Patch bay</div>
            <button
              onClick={() => onUpdate({ sceneMappings: [...(settings.sceneMappings ?? []), { source: 'room', feature: 'motion', setting: 'turbulenceScale', depth: 0.5, layer: 'all' }] })}
              className="px-2 py-1 rounded-md bg-white/5 border border-white/10 hover:bg-white/10 text-[13px] font-medium"
              data-testid="scene-map-add"
            >
              Add
            </button>
          </div>
          {(settings.sceneMappings ?? []).length === 0 ? (
            <p className="text-[12px] text-white/40" data-testid="patch-empty">
              Nothing patched yet. Add one, then pick what it listens to and what it moves.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {(settings.sceneMappings ?? []).map((m, i) => (
                <div key={i} className="rounded-lg border border-white/10 bg-white/5 p-2">
                  <div className="flex items-center gap-1">
                    {/*
                      Which source this patch listens to. Changing it has to
                      change the feature too: "how many people" is not
                      something the sound can tell you, and a patch left
                      pointing at a feature its source does not have would
                      quietly read zero for ever.
                    */}
                    <select
                      value={m.source ?? 'room'}
                      aria-label="Source"
                      onChange={(e) => {
                        const source = e.target.value as PatchSource;
                        const options = featuresFor(source);
                        const keep = options.some(([v]) => v === m.feature);
                        const next = [...(settings.sceneMappings ?? [])];
                        next[i] = { ...m, source, feature: (keep ? m.feature : options[0][0]) as SceneMapping['feature'] };
                        onUpdate({ sceneMappings: next });
                      }}
                      className="w-[58px] shrink-0 bg-black/40 border border-white/10 rounded px-1 py-1 text-[12px] outline-none"
                      data-testid={`patch-source-${i}`}
                    >
                      {PATCH_SOURCES.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <select
                      value={m.feature}
                      aria-label="Feature"
                      onChange={(e) => {
                        const next = [...(settings.sceneMappings ?? [])];
                        next[i] = { ...m, feature: e.target.value as SceneMapping['feature'] };
                        onUpdate({ sceneMappings: next });
                      }}
                      className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded px-1 py-1 text-[12px] outline-none"
                      data-testid={`patch-feature-${i}`}
                    >
                      {featuresFor(m.source ?? 'room').map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <select
                      value={m.setting}
                      aria-label="Control"
                      onChange={(e) => {
                        const next = [...(settings.sceneMappings ?? [])];
                        next[i] = { ...m, setting: e.target.value as SceneMapping['setting'] };
                        onUpdate({ sceneMappings: next });
                      }}
                      className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded px-1 py-1 text-[12px] outline-none"
                      data-testid={`patch-control-${i}`}
                    >
                      {TARGET_GROUPS.map(g => (
                        <optgroup key={g.id} label={g.name}>
                          {g.targets.map(t => (
                            <option key={String(t.key)} value={String(t.key)}>{t.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <button
                      onClick={() => onUpdate({ sceneMappings: (settings.sceneMappings ?? []).filter((_, j) => j !== i) })}
                      className="p-1 rounded hover:bg-white/10 opacity-50 hover:opacity-100"
                      aria-label="Remove mapping"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    {/*
                      Which plate it lands on.

                      Only the settings the solver reads can differ between
                      plates — how a layer moves and evolves. Bloom is done
                      once over the finished picture, so aiming it at layer 2
                      would do nothing at all, and a dropdown that offers a
                      choice doing nothing is worse than one that does not
                      offer it. `PER_LAYER` is that list and the harness checks
                      it against the solver's own source.
                    */}
                    <select
                      value={String(m.layer ?? 'all')}
                      aria-label="Plate"
                      disabled={!PER_LAYER.has(String(m.setting))}
                      title={PER_LAYER.has(String(m.setting))
                        ? 'Which plate this patch moves'
                        : `${sceneTargets.find(t => t.key === m.setting)?.label ?? 'This control'} is part of the finished picture, not one plate`}
                      onChange={(e) => {
                        const v = e.target.value;
                        const next = [...(settings.sceneMappings ?? [])];
                        next[i] = { ...m, layer: v === 'all' ? 'all' : Number(v) };
                        onUpdate({ sceneMappings: next });
                      }}
                      className="w-[76px] shrink-0 bg-black/40 border border-white/10 rounded px-1 py-1 text-[12px] outline-none disabled:opacity-30"
                      data-testid={`patch-layer-${i}`}
                    >
                      <option value="all">All plates</option>
                      {Array.from({ length: Math.max(1, settings.layerCount ?? 1) }, (_, n) => (
                        <option key={n} value={String(n)}>Layer {n + 1}</option>
                      ))}
                    </select>
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.05}
                      value={m.depth}
                      aria-label="Depth"
                      onChange={(e) => {
                        const next = [...(settings.sceneMappings ?? [])];
                        next[i] = { ...m, depth: parseFloat(e.target.value) };
                        onUpdate({ sceneMappings: next });
                      }}
                      className="flex-1 h-1 bg-white/10 rounded-full appearance-none accent-white cursor-pointer"
                    />
                    <span className="text-[12px] font-mono opacity-50 w-9 text-right">{m.depth.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {/*
          The masters, one per source, in the order the Source menu lists them.

          Each is greyed until a patch actually reads its source, rather than
          until any patch exists. With one room patch in the bay the old rule
          lit all three, and a fader that moves nothing is exactly what this
          panel keeps being fixed for.
        */}
        <div className="mt-6 mb-3 text-[13px] font-medium text-text">Masters</div>
        <Slider
          label="Room Impact"
          value={settings.sceneImpact ?? 0.5}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ sceneImpact: v })}
          disabled={!sceneOn ? 'needs the room camera on' : !listens('room') && 'no patch reads the room'}
          settingKey="sceneImpact"
        />
        <Slider
          label="Film Impact"
          disabled={(filmSource ?? 'none') === 'none'
            ? 'needs a loop, the camera or a window'
            : !listens('film') && 'no patch reads the film'}
          value={settings.filmImpact ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ filmImpact: v })}
          settingKey="filmImpact"
        />
        <Slider
          label="Sound Impact"
          disabled={!listens('sound') && 'no patch reads the sound'}
          value={settings.soundImpact ?? 1}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ soundImpact: v })}
          settingKey="soundImpact"
        />
        <Slider
          label="Shapes Impact"
          disabled={!listens('shape') && 'no patch reads a shape'}
          value={settings.shapeImpact ?? 1}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ shapeImpact: v })}
          settingKey="shapeImpact"
        />
        <Info>
          Each source has one master over every patch that reads it, so a whole source can be pulled down on one fader without touching the patches themselves: the room out of a quiet song, the film under the band, the sound off while the reel carries it. <span className="text-white/70">Film Impact</span> starts at zero, so a look saved before the film could ride anything does exactly what it did.
        </Info>
      </section>

      {/* ── Controller ───────────────────────────────────── */}
      {/*
        MIDI, back where it can be found.

        The app has had factory maps for five controllers, a learn mode, soft
        takeover, shift banks and LED feedback for a long time, and a picture
        of your controller drawn to scale. On a desktop none of it was reachable
        except through ⌘K, because the button that opened it lived in the
        narrow-screen toolbar the desks replaced. The answer to "how do I set up
        my APC40" was a keyboard shortcut you had to already know.

        So: the three things that get a controller working — on, which port,
        which map — are here, and the port's own name is used to offer the
        right map as one button. Everything past that (learn, banks, bindings,
        the picture) is still the panel, one click away.
      */}
      <section id="settings-midi" className={`mb-8 scroll-mt-4 ${shown('midi') ? '' : 'hidden'} ${focusSection === 'midi' ? 'rounded-lg ring-1 ring-white/25' : ''}`} data-group="inputs" data-section="midi">
        <h3 className="text-[12px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Sliders size={12} /> Controller
        </h3>
        {!midi ? (
          <p className="text-[11px] text-white/40">The controller is not available in this window.</p>
        ) : !midi.supported ? (
          <p className="text-[11px] leading-relaxed text-amber-200/80" data-testid="settings-midi-unsupported">
            This browser has no Web MIDI. Chrome, Edge and Opera have it; Safari and Firefox do not.
          </p>
        ) : (
          <>
            <button
              onClick={() => (midi.enabled ? midi.disable() : midi.enable())}
              className={`mb-3 w-full rounded-lg py-2.5 text-[13px] font-medium transition-colors ${
                midi.enabled ? 'bg-white text-black' : 'bg-white/10 border border-white/10 hover:bg-white/15'
              }`}
              data-testid="settings-midi-enable"
            >
              {midi.enabled ? 'MIDI is on' : 'Turn MIDI on'}
            </button>
            {midi.error && <p className="mb-3 text-[12px] text-red-300" data-testid="settings-midi-error">{midi.error}</p>}

            {midi.enabled && (
              <>
                <div className="mb-3 flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-text">Controller</span>
                  <select
                    value={midi.ports.input}
                    onChange={e => midi.choosePorts({ input: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/40"
                    data-testid="settings-midi-input"
                  >
                    <option value="all">All devices</option>
                    {midi.inputs.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                  {midi.inputs.length === 0 && (
                    <p className="text-[12px] text-white/40" data-testid="settings-midi-none">
                      Nothing plugged in yet. Connect the controller by USB — it appears here by itself.
                    </p>
                  )}
                </div>

                {/*
                  The one-click setup. `factoryFor` reads the port's own name,
                  so an APC40 mkII offers the APC40 map and nothing else has to
                  be known or guessed.
                */}
                {detectedFactory && (
                  <button
                    onClick={() => midi.loadFactory(detectedFactory.id)}
                    className="mb-3 w-full rounded-lg border border-emerald-400/40 bg-emerald-500/15 py-2.5 text-[13px] font-medium text-emerald-100 transition-colors hover:bg-emerald-500/25"
                    data-testid="settings-midi-setup"
                  >
                    Set up the {detectedFactory.name}
                  </button>
                )}
                <div className="mb-3 flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-text">
                    {detectedFactory ? 'Or another map' : 'Factory map'}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {FACTORY_MAPS.map(f => (
                      <button
                        key={f.id}
                        onClick={() => midi.loadFactory(f.id as FactoryMapId)}
                        className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] font-bold uppercase tracking-wider text-white/70 transition-colors hover:bg-white/10"
                        data-testid={`settings-midi-factory-${f.id}`}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                </div>
                {/*
                  Auto-map, for the controller nobody wrote a factory map for —
                  which is most of them. The full flow lives in the MIDI panel;
                  this is the same button where someone setting a controller up
                  is already standing.
                */}
                {midi.watched ? (
                  <div className="mb-3 rounded-lg border border-amber-400/40 bg-amber-400/10 p-2.5">
                    <p className="text-[13px] font-medium text-amber-100">Listening</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-amber-100/80">
                      Sweep every fader and knob, then press each pad and button. Nothing reaches the show meanwhile.
                    </p>
                    <p className="mt-1.5 font-mono text-[11px] text-amber-100" data-testid="settings-midi-auto-tally">
                      {midi.watched.continuous} faders · {midi.watched.encoder} encoders · {midi.watched.button} buttons
                    </p>
                    <div className="mt-2 flex gap-1.5">
                      <button
                        onClick={() => midi.finishAutoMap(midi.activeInputName)}
                        className="flex-1 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-bold uppercase tracking-wider text-black"
                        data-testid="settings-midi-auto-finish"
                      >
                        Map them
                      </button>
                      <button
                        onClick={() => midi.cancelAutoMap()}
                        className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[12px] font-bold uppercase tracking-wider text-white/70"
                        data-testid="settings-midi-auto-cancel"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => midi.startAutoMap()}
                    className="mb-3 w-full rounded-lg border border-white/15 bg-white/5 py-2.5 text-[13px] font-medium transition-colors hover:bg-white/10"
                    title="Watch what this controller sends and build a map from it — for hardware with no factory map, which is most of it"
                    data-testid="settings-midi-auto"
                  >
                    Auto-map this controller…
                  </button>
                )}
                <p className="mb-3 text-[12px] text-white/40" data-testid="settings-midi-state">
                  {midi.map.bindings.length} bindings · {midi.activeInputName ?? 'no device'}
                  {midi.clocked ? ' · clock arriving' : ''}
                </p>
              </>
            )}

            {onOpenMidi && (
              <button
                onClick={onOpenMidi}
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 text-[13px] font-medium transition-colors hover:bg-white/10"
                title="Learn a control, shift banks, the bindings list, and your controller drawn to scale"
                data-testid="settings-midi-open"
              >
                Learn controls, banks and bindings…
              </button>
            )}
            <Info>
              An APC40 mkII is the classic desk for this: nine faders ride the show, the 8×5 grid cues looks, and the
              transport row fires the one-shots. Plug it in, turn MIDI on, take the setup button — then the panel above
              to teach it anything else. Bank + on a button reaches the settings nine faders cannot.
            </Info>
          </>
        )}
      </section>

      {/*
        Wall

        The id is still `projectors`, which is what the Wall dot and every
        deep link open. The section is only the wall now: where the picture
        goes and what shape it arrives in, set once at load-in. The look
        effects that shared it are under Lamp & Light, and the film projector
        is an input of its own.
      */}
      <section id="settings-projectors" className={`mb-8 scroll-mt-4 ${shown('projectors') ? '' : 'hidden'} ${focusSection === 'projectors' ? 'rounded-lg ring-1 ring-white/25' : ''}`} data-group="setup" data-section="projectors">
        <h3 className="text-[12px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Projector size={12} /> Wall
        </h3>
        {onProjectorMode && (
          <div className="flex flex-col gap-2 mb-5">
            <div className="text-[13px] font-medium text-text">Second Screen</div>
            <div className="grid grid-cols-3 gap-1">
              {([['ask', 'Ask'], ['auto', 'Automatic'], ['off', 'Off']] as const).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => onProjectorMode(m)}
                  className={`py-1.5 rounded-lg text-[13px] font-medium border transition-all ${projectorMode === m ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                  data-testid={`projector-mode-${m}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Info>
              A projector on HDMI is a second screen. <span className="text-white/70">Ask</span> offers to send the show there; <span className="text-white/70">Automatic</span> sends it the moment the projector is connected, on your next click or key press (the browser needs one), fullscreen with nothing but the plate on it, and the laptop keeps the controls.{projectorName ? ` Connected now: ${projectorName}.` : ' Chrome asks once for permission to see your screens.'}
            </Info>
          </div>
        )}
        {output && onOutput && onOutputReset && (
          <OutputPanel output={output} onChange={onOutput} onReset={onOutputReset} wakeLock={wakeLock} />
        )}
      </section>

      {/* Mapping Section */}
      <section id="settings-mapping" className={`mb-8 scroll-mt-4 ${shown('mapping') ? '' : 'hidden'} ${focusSection === 'mapping' ? 'rounded-lg ring-1 ring-white/25' : ''}`} data-group="setup" data-section="mapping">
        <h3 className="text-[12px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Shapes size={12} /> Mapping
        </h3>
        {output && onOutput && <MappingPanel output={output} onChange={onOutput} />}
      </section>

      {/* Simulation Section */}
      {/*
        Logo & Titles

        The one thing on the wall that is not the plate. `injectImage` already
        existed and pours a picture into the liquid as dye, which is the lovely
        thing to do with an image and the wrong thing to do with the mark of
        whoever is paying for the room: it dissolves in about four seconds.
        This one sits over the top and stays put for three hours.
      */}
      <section id="settings-mark" className={`mb-8 scroll-mt-4 ${shown('mark') ? '' : 'hidden'} ${focusSection === 'mark' ? 'rounded-lg ring-1 ring-white/25' : ''}`} data-group="stage" data-section="mark">
        <h3 className="text-[12px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Image size={12} /> Logo &amp; Titles
        </h3>
        <div className="flex gap-2 mb-5">
          <input
            ref={markInputRef}
            id="mark-file"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onMarkFile?.(f); e.target.value = ''; }}
          />
          <button
            onClick={() => markInputRef.current?.click()}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-2 py-2 text-[13px] font-medium hover:bg-white/10"
            title="A PNG with transparency sits on the plate; anything else sits in its own rectangle"
            data-testid="mark-load"
          >
            <Image size={13} /> {markLoaded ? 'Replace' : 'Load a mark'}
          </button>
          <button
            onClick={() => onMarkClear?.()}
            disabled={!markLoaded}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[13px] font-medium hover:bg-white/10 disabled:opacity-30"
            data-testid="mark-clear"
          >
            Take it off
          </button>
        </div>
        <Slider label="Opacity" value={settings.markMix ?? 1} min={0} max={1} step={0.01}
          onChange={(v: number) => onUpdate({ markMix: v })} settingKey="markMix" />
        <Slider label="Size" value={settings.markScale ?? 0.22} min={0.03} max={1} step={0.01}
          onChange={(v: number) => onUpdate({ markScale: v })} settingKey="markScale" />
        <Slider label="Across" value={settings.markX ?? 0.5} min={0} max={1} step={0.005}
          onChange={(v: number) => onUpdate({ markX: v })} settingKey="markX" />
        <Slider label="Up" value={settings.markY ?? 0.12} min={0} max={1} step={0.005}
          onChange={(v: number) => onUpdate({ markY: v })} settingKey="markY" />
        <Info>
          Laid over the finished frame, so it reaches the projector window, a cast to another screen, a recording and
          another machine capturing this one — not just the laptop's own screen. A PNG with transparency is what you
          want; the plate shows through wherever the file is transparent. It sits under nothing, including the house
          dimmer, so a blackout leaves the mark on the wall. Its own opacity is the control for taking it off.
        </Info>
      </section>

      <section id="settings-simulation" className={`mb-8 scroll-mt-4 ${shown('simulation') ? '' : 'hidden'} ${focusSection === 'simulation' ? 'rounded-lg ring-1 ring-white/25' : ''}`} data-group="setup" data-section="simulation">
        <h3 className="text-[12px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Zap size={12} /> Simulation
        </h3>
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-text">Fluid Grid</span>
            {engineStatus && (
              <span className="text-[12px] font-mono opacity-50">
                {engineStatus.label} · {(live ?? engineStatus).frameMs > 0 ? Math.round(1000 / (live ?? engineStatus).frameMs) : '–'} fps
                {/*
                  The speed, when it is not full speed. A frame rate says the
                  frames are arriving; it cannot say the liquid inside them is
                  advancing slower than the clock, which is what happens when a
                  solver step costs more than a frame and the catch-up gives up.
                  Shown only when it is true, because on a machine with room it
                  is always 60 and would be noise.
                */}
                {(() => {
                  const sps = (live ?? engineStatus).stepsPerSec;
                  if (!(sps > 0) || sps >= 57) return null;
                  return <span className="text-amber-300/80"> · {Math.round((sps / 60) * 100)}% speed</span>;
                })()}
              </span>
            )}
          </div>
          {/*
            Where a frame actually goes, on a `?debug` visit. Cost that does
            not fall when the grid falls is not the grid's cost, and that is
            the whole question a grid sweep is trying to answer — so put both
            halves next to the control that changes the grid, rather than
            behind a console command typed once per reading.

            `solver` is the CPU time to submit one step across every layer,
            not the GPU time to run it: WebGL2 has no portable way to ask.
          */}
          {showFrameSplit && engineStatus && (
            <div className="text-[11px] font-mono opacity-40 leading-relaxed">
              solver {(live ?? engineStatus).simMs.toFixed(1)} ms/step
              {' · '}other {(live ?? engineStatus).otherMs.toFixed(1)} ms/frame
              {' · '}{Math.round((live ?? engineStatus).stepsPerSec)} of 60 steps/s
            </div>
          )}
          <select
            value={String(settings.simResolution ?? 'auto')}
            onChange={(e) => {
              const v = e.target.value;
              onUpdate({ simResolution: (v === 'auto' || v === 'cpu' ? v : Number(v)) as SimResolution });
            }}
            className="bg-white/10 border border-white/20 rounded px-2 py-1 text-sm focus:outline-none focus:border-white/50"
            title="Grid the fluid is solved on. Finer grids resolve thinner filaments and real cell structure; the CPU solver is the fallback for machines without float render targets."
          >
            <option value="auto">Auto</option>
            <option value="256">GPU · 256² (light)</option>
            <option value="384">GPU · 384²</option>
            <option value="512">GPU · 512²</option>
            <option value="768">GPU · 768² (heavy)</option>
            <option value="cpu">CPU · 192²</option>
          </select>
          <Info>
            Finer grids let the physics form the filaments and cells itself instead of the closeup synthesising them.
            Auto measures the frame rate and picks the largest grid this machine holds at 60 fps
            {engineStatus?.governed && engineStatus.steppedDown ? ' — it has stepped down on this machine.' : '.'}
            {engineStatus && ` Running ${engineStatus.tier === 'hosted' ? 'from the web' : engineStatus.tier === 'native' ? 'natively' : 'locally'}; ${engineStatus.gpu === 'software' ? 'software GL' : `${engineStatus.gpu} GPU`}.`}
          </Info>
        </div>
      </section>

      {/* Macro Closeup Section */}
      <section id="settings-macro" className={`mb-8 scroll-mt-4 ${shown('macro') ? '' : 'hidden'} ${focusSection === 'macro' ? 'rounded-lg ring-1 ring-white/25' : ''}`} data-group="perform" data-section="macro">
        <h3 className="text-[12px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Microscope size={12} /> Macro Closeup
        </h3>
        {/*
          Zoom first, and never hidden.

          It used to sit behind the Bead Camera switch, so the slider a desk or
          a pin draws — which has no switch next to it — did nothing at all
          until somebody found this panel and turned the camera on. The zoom is
          the control: at 1 the frame is the whole plate, and pushing it in is
          the closeup arriving rather than a cut to it.
        */}
        <Slider
          label="Macro Zoom"
          value={settings.macroZoom ?? 1}
          min={1}
          max={16}
          step={0.1}
          onChange={(v: number) => onUpdate({ macroZoom: v, macroMode: v > 1.05 })}
          settingKey="macroZoom"
        />
        {(settings.macroZoom ?? 1) <= 1.05 && (
          <Info>
            At 1× this is the whole plate. Push the zoom in and the camera picks a bead and follows it — the exposure,
            the depth of field and the surface under the dye all arrive with the magnification rather than switching on
            at a threshold. Everything below shapes that closeup and takes effect as you come in.
          </Info>
        )}
        {(settings.macroZoom ?? 1) > 1.05 && (
          <>
            <Slider
              label="Chase Speed"
              value={settings.macroChase}
              min={0}
              max={1}
              step={0.05}
              onChange={(v: number) => onUpdate({ macroChase: v })}
          settingKey="macroChase"
        />
            <Slider
              label="Shot Length"
              value={settings.macroHold}
              min={1}
              max={15}
              step={0.5}
              onChange={(v: number) => onUpdate({ macroHold: v })}
          settingKey="macroHold"
        />
            <Slider
              label="Music Sync"
              value={settings.macroSync ?? 0.6}
              min={0}
              max={1}
              step={0.05}
              onChange={(v: number) => onUpdate({ macroSync: v })}
          settingKey="macroSync"
        />
            <Slider
              label="Paint Cells"
              value={settings.macroCells}
              min={0}
              max={1}
              step={0.05}
              onChange={(v: number) => onUpdate({ macroCells: v })}
          settingKey="macroCells"
        />
            <Slider
              label="Cell Size"
              value={settings.macroCellScale}
              min={0.15}
              max={1.5}
              step={0.05}
              onChange={(v: number) => onUpdate({ macroCellScale: v })}
          settingKey="macroCellScale"
        />
            <Slider
              label="Macro Lacing"
              value={settings.macroLacing}
              min={0}
              max={1}
              step={0.05}
              onChange={(v: number) => onUpdate({ macroLacing: v })}
          settingKey="macroLacing"
        />
            <Slider
              label="Depth / Focus"
              value={settings.macroDepth}
              min={0}
              max={1}
              step={0.05}
              onChange={(v: number) => onUpdate({ macroDepth: v })}
          settingKey="macroDepth"
        />
            <Slider
              label="Edge Detail"
              value={settings.macroEdgeDetail}
              min={0}
              max={1}
              step={0.05}
              onChange={(v: number) => onUpdate({ macroEdgeDetail: v })}
          settingKey="macroEdgeDetail"
        />
            <Slider
              label="Relief / 3D"
              value={settings.macroRelief}
              min={0}
              max={1}
              step={0.05}
              onChange={(v: number) => onUpdate({ macroRelief: v })}
          settingKey="macroRelief"
        />
          </>
        )}
      </section>

      {/* Squish Plate Section */}
      <section id="settings-squish" className={`mb-8 scroll-mt-4 ${shown('squish') ? '' : 'hidden'} ${focusSection === 'squish' ? 'rounded-lg ring-1 ring-white/25' : ''}`} data-group="setup" data-section="squish">
        <h3 className="text-[12px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Sliders size={12} /> Squish Plate
        </h3>
        <Slider
          label="Plate Pressure"
          value={settings.platePressure}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ platePressure: v })}
          settingKey="platePressure"
        />
        <Slider
          label="Glass Smear"
          value={settings.glassSmear}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ glassSmear: v })}
          settingKey="glassSmear"
        />
        <Slider
          label="Rain Drip"
          value={settings.rainDrip}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ rainDrip: v })}
          settingKey="rainDrip"
        />
        <div className="flex flex-col gap-2 mb-4">
          <span className="text-[13px] font-medium text-text">Viscosity</span>
          <div className="flex gap-2 p-1 bg-white/5 rounded-lg">
            {(['thick', 'thin'] as const).map((v) => (
              <button
                key={v}
                onClick={() => onUpdate({ viscosity: v })}
                className={`flex-1 py-1 text-[12px] rounded-md transition-all ${
                  settings.viscosity === v ? 'bg-white text-black font-bold' : 'hover:bg-white/5 opacity-50'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <Slider
          label="Polarity (Repulsion)"
          value={settings.polarity}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ polarity: v })}
          settingKey="polarity"
        />
      </section>

      {/* Heat Slide Section */}
      <section id="settings-heat" className={`mb-8 scroll-mt-4 ${shown('heat') ? '' : 'hidden'} ${focusSection === 'heat' ? 'rounded-lg ring-1 ring-white/25' : ''}`} data-group="setup" data-section="heat">
        <h3 className="text-[12px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Thermometer size={12} /> Heat Slide
        </h3>
        {/* Heat Intensity and Boiling Point were here: nothing in either solver
            read them. The keys stay in saved looks; the sliders are gone. */}
        {/* 0–0.08: the looks run from 0.0015 to 0.06, and the old 0–1 slider's
            first step (0.05) was seventeen times the default. */}
        <Slider
          label="Evaporation Rate"
          value={settings.evaporationRate}
          min={0}
          max={0.08}
          step={0.0005}
          onChange={(v: number) => onUpdate({ evaporationRate: v })}
          settingKey="evaporationRate"
        />
        <Slider
          label="Heat Decay"
          value={settings.heatDecay}
          min={0.8}
          max={1.0}
          step={0.01}
          onChange={(v: number) => onUpdate({ heatDecay: v })}
          settingKey="heatDecay"
        />
      </section>

      {/* Manual Interaction Section */}
      <section id="settings-interaction" className={`mb-8 scroll-mt-4 ${shown('interaction') ? '' : 'hidden'} ${focusSection === 'interaction' ? 'rounded-lg ring-1 ring-white/25' : ''}`} data-group="setup" data-section="interaction">
        <h3 className="text-[12px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Wind size={12} /> Manual Interaction
        </h3>
        {/* "Updraft", not "Blow Velocity": it is a constant draught over the
            whole plate, and has nothing to do with how hard the Blow tool
            blows. */}
        <Slider
          label="Updraft"
          value={settings.airVelocity}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ airVelocity: v })}
          settingKey="airVelocity"
        />
        <Slider
          label="Vibration"
          value={settings.vibrationFrequency}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ vibrationFrequency: v })}
          settingKey="vibrationFrequency"
        />
        {/* How far a dropped liquid falls before it meets the plate: at 0 it is
            laid on; higher, it lands — pressing the film into a ring, pushing
            the liquid round it outward, and throwing satellite droplets. Works
            on the Drop tool and on the drops the show makes by itself. */}
        <Slider
          label="Drop Height"
          value={settings.dropHeight ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ dropHeight: v })}
          settingKey="dropHeight"
        />
      </section>

      {/* Fluid Physics Section */}
      <section id="settings-physics" className={`mb-8 scroll-mt-4 ${shown('physics') ? '' : 'hidden'} ${focusSection === 'physics' ? 'rounded-lg ring-1 ring-white/25' : ''}`} data-group="setup" data-section="physics">
        <h3 className="text-[12px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Zap size={12} /> Fluid Physics
        </h3>
        <Slider
          label="Diffusion Rate"
          value={settings.diffusionRate}
          min={0}
          max={0.001}
          step={0.00001}
          onChange={(v: number) => onUpdate({ diffusionRate: v })}
          settingKey="diffusionRate"
        />
        <Slider
          label="Buoyancy"
          value={settings.buoyancy}
          min={0}
          max={2.0}
          step={0.1}
          onChange={(v: number) => onUpdate({ buoyancy: v })}
          settingKey="buoyancy"
        />
        <Slider
          label="Advection"
          value={settings.advection}
          min={0}
          max={2.0}
          step={0.1}
          onChange={(v: number) => onUpdate({ advection: v })}
          settingKey="advection"
        />
        {/*
          "Momentum", not "Damping (Friction)": this is how much velocity
          survives each step, so up means more of the motion is kept — less
          friction, the opposite of what the old label promised.
        */}
        <Slider
          label="Momentum"
          value={settings.damping}
          min={0.8}
          max={1.0}
          step={0.01}
          onChange={(v: number) => onUpdate({ damping: v })}
          settingKey="damping"
        />
      </section>

      {/* Automation Section */}
      <section id="settings-automation" className={`mb-8 scroll-mt-4 ${shown('automation') ? '' : 'hidden'} ${focusSection === 'automation' ? 'rounded-lg ring-1 ring-white/25' : ''}`} data-group="perform" data-section="automation">
        <h3 className="text-[12px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Sparkles size={12} /> Automation
        </h3>
        <Slider
          label="Evolve Speed"
          value={settings.automateRate}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ automateRate: v })}
          settingKey="automateRate"
        />
      </section>

      {/* Mixer Section */}
      <section id="settings-layers" className={`mb-8 scroll-mt-4 ${shown('layers') ? '' : 'hidden'} ${focusSection === 'layers' ? 'rounded-lg ring-1 ring-white/25' : ''}`} data-group="perform" data-section="layers">
        <h3 className="text-[12px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Layers size={12} /> Multi-Layer Mixer
        </h3>
        <Slider
          label="Layers"
          value={settings.layerCount}
          min={1}
          max={2}
          step={1}
          onChange={(v: number) => onUpdate({ layerCount: Math.round(v) })}
          settingKey="layerCount"
        />
        <Slider
          label="Rotation Speed"
          value={settings.rotationSpeed}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ rotationSpeed: v })}
          settingKey="rotationSpeed"
        />
        <div className="flex items-center justify-between mb-4 mt-4">
          <span className="text-[13px] font-medium text-text">LED Platform</span>
          <button
            onClick={() => onUpdate({ ledPlatform: !settings.ledPlatform })}
            className={`w-10 h-5 rounded-full relative transition-colors ${settings.ledPlatform ? 'bg-white' : 'bg-white/20'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-black absolute top-0.5 transition-transform ${settings.ledPlatform ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
        {settings.ledPlatform && (
          <div className="flex flex-col gap-4 mb-4">
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium text-text">LED Mode</span>
              <select
                value={settings.ledMode}
                onChange={(e) => onUpdate({ ledMode: e.target.value as LedMode })}
                className="bg-white/10 border border-white/20 rounded px-2 py-1 text-sm focus:outline-none focus:border-white/50"
              >
                <option value="single">Single Color</option>
                <option value="rainbow">Rainbow Wheel</option>
                <option value="ocean">Ocean Depths</option>
                <option value="fire">Fire Pit</option>
                <option value="cyberpunk">Cyberpunk</option>
              </select>
            </div>
            
            {settings.ledMode === 'single' && (
              <div className="flex flex-col gap-2">
                <span className="text-[13px] font-medium text-text">LED Color</span>
                <input
                  type="color"
                  value={settings.ledColor}
                  onChange={(e) => onUpdate({ ledColor: e.target.value })}
                  className="w-full h-8 rounded cursor-pointer bg-transparent border-none p-0"
                />
              </div>
            )}
            
            <Slider
              label="LED Rotation Speed"
              value={settings.ledSpeed}
              min={0}
              max={2.0}
              step={0.05}
              onChange={(v: number) => onUpdate({ ledSpeed: v })}
          settingKey="ledSpeed"
        />
          </div>
        )}
        <Slider
          label="Center Gravity (Concave)"
          value={settings.centerGravity}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ centerGravity: v })}
          settingKey="centerGravity"
        />
        <Slider
          label="Gooey Blending"
          value={settings.gooeyEffect}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ gooeyEffect: v })}
          settingKey="gooeyEffect"
        />
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-text">Blend Mode</span>
          <select
            value={settings.blendMode}
            onChange={(e) => onUpdate({ blendMode: e.target.value as BlendMode })}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:border-white/30 transition-all"
          >
            {blendModes.map((mode) => (
              <option key={mode} value={mode} className="bg-gray-900">
                {mode}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/*
        The panel used to be one long scroll and this was its footer: one line
        of history at the bottom of everything. It is now seventeen sections
        shown one at a time, so that footer sits under every one of them — a
        note about the Squish Plate under Controller, under Sound, under
        Projectors. A line of flavour in the wrong place reads as a mistake,
        which is worse than no line at all, so it has gone rather than been
        repeated seventeen times or guarded by a condition.
      */}
        </div>
      </div>
      </PinContext.Provider>
    </Sheet>
  );
};
