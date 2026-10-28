import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { MixTakes } from '../lib/mixFade';
import { X, FlaskConical, Magnet, Waves, Sliders, Zap, Wind, Layers, Activity, Hourglass, Palette, Microscope, Projector, Camera, Film, Clapperboard, Droplets, Lightbulb, Aperture, Video, MonitorPlay, Image, Shapes, Cable, SlidersVertical, ScanEye, RotateCw } from 'lucide-react';
import { VisualizerSettings, BlendMode, LedMode, SimResolution, SceneFeature, SceneMapping, PatchSource, AudioFeature } from '../types';
import { MODULATOR_FEATURES, MODULATOR_LABELS } from '../lib/modulators';
import { SOURCE_NAMES, type AudioReading } from '../lib/audioFeatures';
import { HIT_FEATURES, HIT_FEATURE_LABELS } from '../lib/hitSource';
import { LEARNABLE_SETTINGS, factoryFor, FACTORY_MAPS, curveOf, handValueAt, travelOf, isMapping, MUSIC_SOURCE_LABELS, type FactoryMapId } from '../lib/midi';
import { PIN_RANGE, type DeskSurface } from '../lib/deskPins';
import { PER_LAYER, PATCH_TARGETS } from '../lib/sceneMap';
import { AREA_TARGETS, isAreaTarget } from '../lib/areaCords';
import { plateAreas, areaFamily, areaDye } from '../lib/plateAreas';
import { PRESET_CONTRACTS } from '../presetPlate';
import { PALETTE } from '../constants';
import { AreaPicker } from './phone/AreaPicker';
import { BandStrip } from './phone/BandStrip';
import { SETTINGS_CATEGORIES, SETTINGS_SECTIONS, SECTION_BY_ID, FIRST_SECTION, sectionMatches, groupOf } from '../lib/settingsMap';
import type { MidiController } from '../hooks/useMidi';
import { Info } from './Info';
import { MixerPanel } from './MixerPanel';
import { LiquidDesigner, type LiquidDesignerProps } from './LiquidDesigner';
import { MappingPanel, OutputPanel } from './OutputPanel';
import type { OutputConfig, WallTest } from '../lib/outputConfig';
import { Segmented, Sheet, SwitchPill, Tag, Toggle, LIT, LIVE } from './ui';
import { PaceTrack } from './ui/Pace';
import { LensCap, StrobeRing, TapPad, ViscosityDrip } from './ui/Playful';
import type { TempoReading } from '../lib/tempo';
import { CameraPicker } from './CameraPicker';
import { readSetting } from '../lib/readout';
import type { RoomCalibration } from '../lib/audioCalibration';
import { isProLicenseUnlocked, type EngineStatus } from '../lib/platform';
import { SPIN_AUTO_NAMES } from '../lib/turntable';
import { APP_FEATURE_TILES, CHECKOUT_PRO_URL, CHECKOUT_UPGRADE_URL, getEffectiveTier, isFreeTierGated, isTierGatingEnforced, openAccountSheet } from '../lib/tierGates';
import { helpFor } from '../lib/controlHelp';
import { useControlTip } from './ui/ControlTip';

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
            ? LIT
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
  onPourVideo?: (file: File) => void;
  onStopPourVideo?: () => void;
  settings: VisualizerSettings;
  /**
   * Song detection, the master switch: whether the app listens for which song
   * is playing at all. Off, nothing is identified, so no set item, song show,
   * sequence or saved look made for a song goes up on its own.
   */
  songDetection?: boolean;
  onSongDetection?: (on: boolean) => void;
  onUpdate: (settings: Partial<VisualizerSettings>) => void;
  /** Live room-calibration readout, null when auto-calibration is off. */
  calibration?: RoomCalibration | null;
  onRecalibrate?: () => void;
  /** Flick a plate: spin it up and let the bed it rests on slow it down. */
  onFlickPlate?: (layer: number) => void;
  /** Which solver is running and at what grid, e.g. "GPU · 512²". */
  engineStatus?: EngineStatus | null;
  /** The live reading (frame time), polled while the panel is open. */
  getLiveEngineStatus?: () => EngineStatus | null;
  /** The motion camera: whether it is watching, which one, and what it is seeing. */
  sceneOn?: boolean;
  onSceneToggle?: (on: boolean) => void;
  sceneState?: { active: boolean; error: string | null; device: string | null; fellBack?: boolean; lost?: boolean; ms: number; energy: number; raw: number; people: number } | null;
  /** The cameras plugged in (`useCameras`), for both cameras' pickers. */
  cameras?: readonly MediaDeviceInfo[];
  sceneDeviceId?: string;
  onSceneDevice?: (id: string) => void;
  /** Where the sensor draws what it sees, so the camera can be aimed. */
  scenePreviewRef?: React.RefObject<HTMLCanvasElement | null>;
  /** The film projector: what's playing, and how to change it. */
  filmSource?: 'none' | 'file' | 'camera' | 'window';
  /** The file playing as the film (its name), while the source is a file. */
  filmName?: string | null;
  /** The file pouring as dye (its name), or null. */
  pourName?: string | null;
  onFilmFile?: (file: File) => void;
  onFilmCamera?: () => void;
  /** The film's Webcam: which camera it shows, what opened, and whether it was unplugged. */
  filmCameraId?: string;
  onFilmCameraDevice?: (id: string) => void;
  filmCamera?: { label: string | null; fellBack: boolean } | null;
  filmCameraLost?: boolean;
  /** Another tab, window or screen, through the browser's own picker. */
  onFilmWindow?: () => void;
  onFilmClear?: () => void;
  /** The mark: a logo or title card over the finished frame, and whether one is loaded. */
  markLoaded?: boolean;
  /** The Mixer rows' take buttons (lib/mixFade.ts). */
  mixTakes?: MixTakes;
  /** The look the back plate is on, for the Mixer's Back Plate row (PLAN.md §16a). */
  backLook?: string | null;
  /** The look on the plate, by id, for its areas of the dish in the patch bay (PLAN 25h). */
  lookId?: string | null;
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
  audioSource?: 'none' | 'microphone' | 'system' | 'file' | 'simulated' | 'drone';
  onAudioSource?: (s: 'none' | 'microphone' | 'system' | 'simulated' | 'drone') => void;
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
  /** The wall test (PLAN.md 8e): Load-in's test pattern and Identify, for the Wall section. */
  wallTest?: WallTest;
  onWallTest?: (t: WallTest) => void;
  /**
   * Open showing this section. This is what the command palette's per-section
   * rows use, so "the room" typed into ⌘K lands on the room rather than on the
   * top of a panel with seventeen of them.
   */
  focusSection?: string | null;
  /** The shelf, for the Liquids section: design, load and save liquids (LiquidDesigner). */
  liquids?: LiquidDesignerProps;
  /** What is already on each desk, and how to put something there. */
  pins?: PinApi;
  /** The controller, for the Controller section and its one-click setup. */
  midi?: MidiController;
  /** The full MIDI panel, for the things this panel's section does not hold. */
  onOpenMidi?: () => void;
  /** Open the Sound sheet, where the source is chosen. */
  onOpenSound?: () => void;
  /** Where the tempo is coming from, and the three ways to say it by hand. */
  tempo?: { source: string | null; bpm: number; taps: number };
  onTap?: () => void;
  /** The tempo source's reading, for the tap pad's beat light (it polls this itself). */
  readTempo?: () => TempoReading | null;
  /** The analyser's live reading, polled by the patch bay's spectrum strip (`BandStrip`, PLAN 30a). */
  readEar?: () => AudioReading | null;
  /** The tempo the dish's Tempo mode is lit by (tapped, clocked or heard), bpm, or 0. */
  spinBpm?: number;
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
  /**
   * One section alone, as a desk panel draws it (Desk v2): no sheet, no rail,
   * no search, no title (the panel's header has it), and no other section
   * rendered at all.
   */
  embed?: string | null;
  /**
   * The Stage sheet (⌘,): the room and the machine only, the sections in the
   * `stage` category. Nothing in it saves into a look.
   */
  scope?: 'all' | 'stage';
  /** On a desk panel, where a link to another section goes: the sheet, at that section. */
  onGoTo?: (id: string) => void;
}

/** What the room can be read for, in the order they are worth reaching for. */
const SCENE_FEATURES: [SceneFeature, string][] = [
  ['motion', 'How busy'],
  ['motionHighFreq', 'How sudden'],
  ['motionOverTime', 'How busy, lately'],
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
  // The sound again, by name: the kick, the snare, the hats and the bands
  // (`bands` in types.ts says why it is a source of its own).
  ['bands', 'Bands'],
  // And its hits and its note (`lib/hitSource.ts`): how hard each drum's
  // last hit was, falling over a quarter second. Same microphone, same master.
  ['hits', 'Hits'],
  // The odd one out, and last for that reason: the other three report what is
  // happening in the room, and this one is a shape you asked for.
  ['shape', 'Shapes'],
];

/**
 * The features a source offers.
 *
 * The room and the film are the same analysis over different pixels, so they
 * offer the same list. The sound offers its own seven, and switching between
 * them has to change the list — "how many people" is not something a microphone
 * can tell you.
 */
const featuresFor = (source: PatchSource): [string, string][] =>
  source === 'sound' ? AUDIO_FEATURES
    : source === 'bands' ? SOURCE_NAMES.map(f => [f, MUSIC_SOURCE_LABELS[f]] as [string, string])
    : source === 'hits' ? HIT_FEATURES.map(f => [f, HIT_FEATURE_LABELS[f]] as [string, string])
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
/**
 * `curve` bends the travel without touching the value.
 *
 * A control whose useful range is all at one end is a control with no
 * resolution where it is played. Speed is the case: thirty of thirty-two
 * looks sit in the bottom 27% of its 0–0.3 range, and the median at 10% of
 * the way along, so the whole of the plate's usable tempo was a centimetre of
 * the throw. At `curve: 3` half the travel is 0.0375 and the slow end gets
 * the bottom third.
 *
 * The stored setting is unchanged — only where the handle sits for it — so
 * looks, patches and song cues written before this mean exactly what they
 * meant. The curve comes from `LEARNABLE_SETTINGS` so the phone, a MIDI
 * fader and its LED ring all bend the same way; see `curveOf` in `midi.ts`.
 */
const Slider = ({ label, value, min, max, step, onChange, icon: Icon, disabled, settingKey }: { label: string; value: number | undefined; min: number; max: number; step: number; onChange: (v: number) => void; icon?: React.ComponentType<{ size?: number }>; disabled?: string | false; settingKey?: keyof VisualizerSettings }) => {
  const safeValue = value ?? 0;
  const curve = settingKey ? curveOf(settingKey) : 1;
  // What the control does, as the desk's hover card says it (PLAN.md 8j); a
  // tap on the name opens it where there is no hover.
  const line = helpFor(settingKey);
  const tip = useControlTip({ name: label, help: line, value: disabled ? undefined : readSetting(String(settingKey ?? ''), safeValue, min, max), disabled: !!disabled });
  return (
    <div ref={el => { tip.anchor.current = el; }} {...tip.bind} className={`mb-3 flex min-w-0 flex-col gap-1 ${disabled ? 'opacity-35' : ''}`} title={disabled || undefined} data-disabled={disabled ? 'true' : undefined} data-slider="">
      {tip.card}
      <div className="flex items-center justify-between gap-2">
        {/*
          The rail beside this pane is sentence case and so is every control
          on both desks; only in here was a control's own name shouted. Two
          type conventions touching each other reads as two different
          programs, and the shouting one was the one describing eighty
          controls. Section headings keep their uppercase eyebrow, which the
          rail's category headers share — that is a level, not a label.
        */}
        <div className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-text-2">
          {Icon && <Icon size={14} />}
          <span
            className={`truncate ${line ? '[@media(pointer:coarse)]:underline [@media(pointer:coarse)]:decoration-dotted [@media(pointer:coarse)]:decoration-white/25 [@media(pointer:coarse)]:underline-offset-4' : ''}`}
            onClick={line ? tip.toggle : undefined}
          >{label}</span>
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
          <span className="min-w-[44px] rounded-md bg-white/[0.06] px-1.5 py-0.5 text-center font-mono text-[11.5px] font-medium tabular-nums text-text">
            {disabled ? disabled : readSetting(String(settingKey ?? ''), safeValue, min, max)}
          </span>
        </div>
      </div>
      <PaceTrack settingKey={settingKey} at={Math.max(0, Math.min(1, (curve === 1 ? (safeValue - min) / Math.max(1e-9, max - min) : travelOf(safeValue, min, max, curve))))}>
        <input
          type="range"
          min={curve === 1 ? min : 0}
          max={curve === 1 ? max : 1}
          step={curve === 1 ? step : 0.001}
          value={curve === 1 ? safeValue : travelOf(safeValue, min, max, curve)}
          disabled={!!disabled}
          aria-label={label}
          onChange={(e) => {
            const raw = parseFloat(e.target.value);
            if (curve === 1) { onChange(raw); return; }
            // Three figures, not the setting's step: see handValueAt.
            onChange(handValueAt(raw, min, max, curve));
          }}
          className="set-range"
          style={{ '--fill': `${Math.round(100 * (curve === 1 ? (safeValue - min) / Math.max(1e-9, max - min) : travelOf(safeValue, min, max, curve)))}%` } as React.CSSProperties}
        />
      </PaceTrack>
    </div>
  );
};

/*
  A section is a card, and its heading a title.

  Every section was bare on the pane with its heading an 12px uppercase
  eyebrow at 30% opacity, and a section opened from elsewhere got a ring
  drawn tight round its content, which put the controls flush against a line
  (reported, with a screenshot: "the left margin doesn't have enough
  space"). The card carries its own padding, so nothing touches an edge, and
  "opened from elsewhere" is its border turning the accent.
*/
/*
  And two sliders to a row where the pane is wide enough: most sections are
  a long run of them, and one to a row made the Look a four-screen column.
  Everything else in a section (its title, a choice, a note, a group) keeps
  the full width, so a row only ever pairs two sliders that were side by
  side in the list anyway.
*/
const SECTION_CARD = 'mb-5 scroll-mt-4 rounded-2xl border bg-white/[0.02] px-6 pb-4 pt-5 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]';
/** The layout of a section that is showing: two sliders to a row where there is room. Not on a hidden one, or its grid would win over `hidden`. */
const SECTION_GRID = 'md:grid md:grid-cols-2 md:gap-x-7 [&>*]:md:col-span-2 [&>[data-slider]]:md:col-span-1';
const SECTION_TITLE = 'mb-5 flex items-center gap-2.5 text-[16px] font-semibold tracking-tight text-text [&>svg]:h-7 [&>svg]:w-7 [&>svg]:shrink-0 [&>svg]:rounded-lg [&>svg]:bg-accent-bg [&>svg]:p-1.5 [&>svg]:text-accent-text';

/** The loops that ship in public/video, for the Film section's demo rows. A loop is known by its title, which is the name of the File it is handed over as. */
const DEMO_LOOPS = [
  { id: 'ring', src: '/video/spinning-ring.webm', title: 'Spinning Ring (Transparent WebM)' },
  { id: 'particles', src: '/video/pulsing-particles.webm', title: 'Pulsing Particles (Transparent WebM)' },
  { id: 'orb', src: '/video/pulsing-orb.webm', title: 'Pulsing Orb (Transparent WebM)' },
] as const;

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onUpdate, songDetection, onSongDetection, calibration, onRecalibrate, engineStatus, getLiveEngineStatus, sceneOn = false, onSceneToggle, sceneState = null, cameras = [], sceneDeviceId = '', onSceneDevice, scenePreviewRef, filmSource = 'none', filmName = null, pourName = null, onFilmFile, onPourVideo, onStopPourVideo, onFilmCamera, filmCameraId = '', onFilmCameraDevice, filmCamera = null, filmCameraLost = false, onFilmWindow, onFilmClear, markLoaded = false, mixTakes, backLook, lookId = null, onMarkFile, onMarkClear, audioSource = 'none', onAudioSource, onAudioFile, audioInputs = [], audioInputId = '', onAudioInput, blackout = false, onBlackout, projectorMode = 'ask', onProjectorMode, projectorName = null, output, onOutput, onOutputReset, wakeLock, wallTest, onWallTest, tempo, onTap, readTempo, readEar, spinBpm = 0, onTempoClear, onTempoBpm, midiClocked = false, timecode = null, focusSection = null, liquids, pins, midi, onOpenMidi, onOpenSound, onClose, onFlickPlate, embed = null, scope = 'all', onGoTo,
}) => {
  const filmInputRef = useRef<HTMLInputElement>(null);
  /*
    The look's areas of the dish, for the patch bay's area picker (PLAN 25h),
    each drawn in its family's colours from the look's own dyes. None for a
    look built the old way, and then the picker is not drawn at all.
  */
  const lookAreas = useMemo(() => plateAreas(lookId), [lookId]);
  const areaColours = useMemo(() => (lookAreas ?? []).map(a => areaFamily(a).map((_, k) =>
    PALETTE[areaDye(a, PRESET_CONTRACTS[lookId ?? ''] ?? [0], 0, k)]?.hex ?? '#888')), [lookAreas, lookId]);
  const markInputRef = useRef<HTMLInputElement>(null);
  /** Whether this browser can capture a window at all. Every phone cannot. */
  const canCaptureWindow = typeof navigator !== 'undefined'
    && typeof (navigator.mediaDevices as { getDisplayMedia?: unknown } | undefined)?.getDisplayMedia === 'function';
  const [live, setLive] = useState<EngineStatus | null>(null);
  /** `?debug` puts the frame's cost split under the engine readout. */
  const showFrameSplit = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('debug');
  /*
    Polled only where the readout is drawn: the Simulation section, which an
    embedded panel draws only when it is that panel. Every section docked on
    the desk is its own SettingsPanel, and each polled the engine once a
    second for a reading it never showed: on the Mac runner, where the plate
    draws and every reading is a new object, the Gig desk's Patches panel
    alone committed once a second on top of the App's clock (`npm run
    renders`: 2.0 commits/s against 1.0 renders/s on the Perform desk with
    no sound). In a cloud session the reading is null each time and the set
    is dropped, which is why it passed there.
  */
  const drawsEngine = !embed || embed === 'simulation';
  useEffect(() => {
    if (!getLiveEngineStatus || !drawsEngine) return;
    const tick = () => { setLive(getLiveEngineStatus() ?? null); };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [getLiveEngineStatus, drawsEngine]);
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
  /** Whether this shell draws a section at all: one in a panel, the Stage ones in the Stage sheet, every one in the sheet. */
  const keep = (id: string): boolean => embed ? id === embed
    : scope === 'stage' ? SECTION_BY_ID.get(id)?.category === 'stage'
    : true;
  const firstSection = scope === 'stage' ? (SETTINGS_SECTIONS.find(x => x.category === 'stage')?.id ?? FIRST_SECTION) : FIRST_SECTION;
  const [section, setSection] = useState<string>(focusSection && keep(focusSection) ? focusSection : firstSection);
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
    if (embed) return id === embed;
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
  /*
    On a desk panel the section is the only one drawn, so a link to another
    goes where that one is: the sheet, opened at it (`onGoTo`). It is a
    24px target there, inline in the sentence, which is the desk's rule:
    both ways, because "Film" in a 12px sentence is 23.6px wide and the
    layout check found it ("room: Film 24×24") once the section was named
    Film rather than Video (PLAN 35a).
  */
  const goTo = (id: string, from: string) => (
    <button
      onClick={() => { if (embed && onGoTo) { onGoTo(id); return; } setSection(id); setQuery(''); }}
      className={`font-medium text-white/70 underline decoration-white/25 underline-offset-2 hover:text-white ${embed ? 'inline-flex min-h-6 min-w-6 items-center justify-center' : ''}`}
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
      rows: SETTINGS_SECTIONS.filter(sec => sec.category === cat.id && keep(sec.id) && (!q || sectionMatches(sec, q))),
    }))
    .filter(g => g.rows.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, scope]);
  /*
    A section in a panel is narrow, and the sheet's card (its border, its
    24 px padding, its two-column grid from 768 px of *window*) is drawn for a
    1000 px sheet. In a panel the section is its controls, one column.
  */
  const CARD = embed ? 'block' : SECTION_CARD;
  const GRID = embed ? '' : SECTION_GRID;
  const TITLE = embed ? 'hidden' : SECTION_TITLE;

  /*
    A sheet, not a drawer.

    This used to be a 320px column pinned to the right edge with 112px of top
    padding to clear a title bar that no longer exists — under a desk it sat
    over the rides and wasted a seventh of its own height on nothing. The
    sheet is centred, 720 wide, and fills the screen on a phone, so one shell
    serves every size the app runs at.
  */
  /*
    The sections, drawn once and placed in one of three shells: the sheet
    (every section, one at a time, with the rail and the search), the Stage
    sheet (the room and the machine only), or a desk panel (one section, no
    chrome: the panel's own header names it). A section not in the shell is
    not rendered at all, not merely hidden, so a desk panel and the sheet never
    put the same control, under the same test id, on the page twice; the desk
    shows a panel's section only while no sheet is open.
  */
  const sections = (
    <>
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
      {keep('master') && (
      <section id="settings-master" className={`${CARD} ${shown('master') ? GRID : 'hidden'} ${focusSection === 'master' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('master')} data-section="master">
        <h3 className={TITLE}>
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
        {/* Not on a desk panel: the desk's header has Blackout, in every layout. */}
        {onBlackout && !embed && (
          <button
            aria-pressed={blackout}
            onClick={onBlackout}
            className={`flex w-full items-center justify-center gap-2 mb-4 -mt-1 py-2 rounded-lg text-[13px] font-medium border transition-all ${blackout ? LIVE : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
            title="Fade the plate to black and back (B on the keyboard)"
            data-testid="blackout-button"
          >
            <LensCap capped={blackout} size={16} />
            {blackout ? 'Lights up' : 'Blackout'}
          </button>
        )}
        {/* The same switch as the one at the bottom of Wall → Output, where it
            used to live alone: the last control of the longest section. */}
        {output && onOutput && (
          <div className="mb-4">
            <Toggle
              label="Flash Limit"
              on={output.flashGuard}
              onChange={v => onOutput({ ...output, flashGuard: v })}
              title="Hold the whole screen below three flashes a second (photosensitivity)"
              testId="flash-limit-master"
            />
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
        {/* How far the speed follows the music instead of the look: the
            tempo and how loud it has been. Random Evolve leans harder. */}
        <Slider
          label="Tempo Sync"
          value={settings.tempoSync ?? 0.5}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ tempoSync: v })}
          settingKey="tempoSync"
        />
      </section>
      )}

      {/*
        The mixer (lib/mixer.ts, docs/rig-plan.md R7): the same panel the
        Perform desk and the phone open, with the pin chips this sheet puts on
        every control. Its sliders are drawn from MIX_CONTROLS, and `npm run
        panel` reads that list as this section's, since there is no literal
        slider here to read.
      */}
      {keep('mixer') && (
      <section id="settings-mixer" className={`${CARD} ${shown('mixer') ? '' : 'hidden'} ${focusSection === 'mixer' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('mixer')} data-section="mixer">
        <h3 className={TITLE}>
          <SlidersVertical size={12} /> Mixer
        </h3>
        <MixerPanel
          settings={settings}
          onSetting={onUpdate}
          hasFilm={filmSource !== 'none'}
          hasMark={markLoaded}
          chips={(k) => <PinChips settingKey={k} />}
          onFade={mixTakes?.onFade}
          backLook={backLook}
          fading={mixTakes?.fading}
          testId="settings-mixer-panel"
        />
      </section>
      )}

      {/* Sound Section */}
      {keep('audio-input') && (
      <section id="settings-audio-input" className={`${CARD} ${shown('audio-input') ? GRID : 'hidden'} ${focusSection === 'audio-input' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('audio-input')} data-section="audio-input">
        <h3 className={TITLE}>
          <Activity size={12} /> Audio Input
        </h3>
        {/*
          Sound Drive: how hard the music moves the plate at all. First in
          Sound, which it joined with the rest of Sound Mappings (2026-10-10):
          on the desk Sound Mappings was a panel of this one knob.

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
        <Slider
          label="Sound Impact"
          disabled={!listens('sound') && !listens('bands') && !listens('hits') && !midi?.map.sound?.some(isMapping) && 'no patch reads the sound'}
          value={settings.soundImpact ?? 1}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ soundImpact: v })}
          settingKey="soundImpact"
        />
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

        {/*
          What is listening, said here and chosen in the Sound sheet.

          The five-way switch that stood here was the second drawing of the
          sheet's six, which also has the plate as an instrument; two homes
          meant one could be changed while the other was read. The sheet is
          the superset, so it is the home, and this row is the state and the
          way there. The device below stays: it is where the Mic dot lands.
        */}
        {onAudioSource && (
          <div className="mb-3.5 flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-text">Source</span>
            <div className="flex items-center gap-2">
              <div
                className={`flex h-8 flex-1 items-center rounded-lg border px-3 text-[13px] font-medium ${audioSource === 'none' ? 'border-white/10 bg-white/5 text-white/60' : LIT}`}
                role="status"
                data-testid="audio-source-state"
                data-source={audioSource}
              >
                {({ none: 'Off', microphone: 'Mic', system: 'System', file: 'File', simulated: 'Band', drone: 'Instrument' } as const)[audioSource]}
              </div>
              {onOpenSound && (
                <button
                  onClick={onOpenSound}
                  className="h-8 rounded-lg border border-white/10 bg-white/5 px-3 text-[12px] font-medium transition-colors hover:bg-white/10"
                  title="Choose what the plate listens to: the mic, a tab, a file, the band or the plate as an instrument"
                  data-testid="audio-source-open"
                >
                  Change in Sound…
                </button>
              )}
            </div>
            <Info>
              <b>Mic</b> hears the room. <b>System</b> captures a tab or the whole machine, so a stream drives the plate with no microphone in the loop. <b>File</b> plays a track here and is the straightest signal there is. <b>Band</b> is a synthesised group played silently into the analyser — no device, no permission, and every mapping runs exactly as it does on a real input.
            </Info>
          </div>
        )}

        {/* The input: a USB interface fed from the desk, not the laptop's own microphone */}
        {onAudioInput && (
          <div className="mb-3.5 flex flex-col gap-1.5">
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
        <div className="mb-3 mt-2">
          <Toggle
            label="Auto Calibrate"
            on={settings.autoCalibrate !== false}
            onChange={v => onUpdate({ autoCalibrate: v })}
            title="Learn this room's noise floor and dynamics, and drive the visuals from where the music sits between them"
            testId="auto-calibrate-toggle"
          />
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
              <TapPad tempo={tempo} read={readTempo} onTap={onTap} />
              <button
                onClick={onTempoClear}
                disabled={!tempo?.source}
                data-testid="tempo-listen"
                title="Back to working the tempo out from what it can hear"
                className="min-h-9 flex-none rounded-lg border border-white/10 bg-white/5 px-3 text-[13px] font-medium transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/5 disabled:opacity-30"
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
                className="h-9 w-24 rounded-lg border border-white/10 bg-white/5 px-3 font-mono text-[12px] outline-none focus:border-accent-border"
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

        {/* Song detection: the master switch for everything that follows a song. */}
        {onSongDetection && (
          <div className="mb-4 mt-2 flex items-center justify-between gap-3" data-testid="song-detection">
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-text">Song Detection</div>
              <div className="text-[12px] text-muted">Listen for which song is playing, so set items, song shows and looks made for a song go up on their own.</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!!songDetection}
              onClick={() => onSongDetection(!songDetection)}
              className="flex h-8 w-11 shrink-0 items-center justify-center rounded-md p-1"
              title={songDetection ? 'On: songs are identified' : 'Off: nothing is identified'}
              data-testid="song-detection-toggle"
            >
              <SwitchPill on={!!songDetection} />
            </button>
          </div>
        )}

        {/* A new song, a new look */}
        <div className="flex flex-col gap-2 mb-4 mt-2">
          <div className="text-[13px] font-medium text-text">On a New Song</div>
          <div className="grid grid-cols-3 gap-1">
            {([['off', 'Keep'], ['preset', 'New preset'], ['random', 'Random']] as const).map(([mode, label]) => (
              <button
                aria-pressed={(settings.onNewSong ?? 'off') === mode}
                key={mode}
                onClick={() => onUpdate({ onNewSong: mode })}
                className={`py-1.5 rounded-lg text-[13px] font-medium border transition-all ${
                  (settings.onNewSong ?? 'off') === mode ? LIT : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
                title={mode === 'off' ? 'Keep the look across songs' : mode === 'preset' ? 'Switch to another preset when a new song starts' : 'Roll a random look when a new song starts'}
                data-testid={`new-song-${mode}`}
              >
                {label}
              </button>
            ))}
          </div>
          <Info>
            A new song is heard as the last one falling away into the next, even a half-second gap, or named by song recognition when one song crossfades into another. The new look comes in on a beat: quickly after a gap, slowly under a crossfade. The sequencer keeps control while it is running.
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
        {/* What each band of the sound moves: Sound Mappings, as was. */}
        <span className="mb-2 mt-4 block text-[11px] font-medium uppercase tracking-wide text-white/40">What the sound moves</span>
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
      )}

      {/* Light Show Look Section */}
      {keep('look') && (
      <section id="settings-look" className={`${CARD} ${shown('look') ? GRID : 'hidden'} ${focusSection === 'look' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('look')} data-section="look">
        <h3 className={TITLE}>
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
        {/*
          Dye carried by particles (H1). The grid keeps the body of colour and
          these add the structure a grid cannot hold, so it reads as detail
          appearing rather than as a different plate — and at 0 the solver
          allocates none of them, which is where every look made before this
          sits.
        */}
        <Slider
          label="Dye Particles"
          value={settings.particles ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ particles: v })}
          settingKey="particles"
        />
        <Slider
          label="Particle Colour"
          disabled={(settings.particles ?? 0) <= 0.001 && 'needs Dye Particles above 0'}
          value={settings.particleMix ?? 0.6}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ particleMix: v })}
          settingKey="particleMix"
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
          label="Projector Focus"
          value={settings.projectorFocus ?? 0.5}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ projectorFocus: v })}
          settingKey="projectorFocus"
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
          label="Frame Sway"
          value={settings.frameSway ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ frameSway: v })}
          settingKey="frameSway"
        />
        <Slider
          label="Layer Scale Variety"
          disabled={(settings.layerCount ?? 1) < 2 && !backLook && 'needs 2 Layers'}
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
        {/* How solid the colour reads: a tint the light shows through, or a body of colour. */}
        <Slider
          label="Colour Body"
          value={settings.colourBody ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ colourBody: v })}
          settingKey="colourBody"
        />
        {/* The plate printed as a comic: flat inks, black outlines, the tints in even dots. The Roy look's own control. */}
        <Slider
          label="Ben-Day Dots"
          value={settings.benDay ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ benDay: v })}
          settingKey="benDay"
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
      )}

      {/* Show Section */}
      {keep('show') && (
      <section id="settings-show" className={`${CARD} ${shown('show') ? GRID : 'hidden'} ${focusSection === 'show' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('show')} data-section="show">
        <h3 className={TITLE}>
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
          label="Kick Bloom"
          value={settings.kickBloom ?? 1}
          min={0}
          max={1.5}
          step={0.05}
          onChange={(v: number) => onUpdate({ kickBloom: v })}
          settingKey="kickBloom"
        />
        <Slider
          label="Melody Walk"
          value={settings.melodyWalk ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ melodyWalk: v })}
          settingKey="melodyWalk"
        />
        <Info>
          Kick Bloom is the dye each kick throws outward from the bass spot. Melody Walk lets each note of a tune go as a drop, low notes on one side of the plate and high ones on the other, so a played line draws itself across it. Beat Squeeze presses a thin sheet on the liquid where the kick lands: a dent as wide as the sheet bends over this liquid, wide on thin oil, a fingertip on syrup. Plate Rock is the slow one: a hand tipping the dish on the one and three, the heavier colour running downhill each way.
        </Info>
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
          label="Accent the One"
          value={settings.beatAccent ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ beatAccent: v })}
          settingKey="beatAccent"
        />
        <Info>
          Accent the One weighs each kick's squeeze and rock by where it falls in the bar: the one pressed hardest, three lighter, two, four and the offbeat left to the plate. The show counts the bar from the music as it plays; until it is sure, every kick lands alike. 0 is every kick alike.
        </Info>
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
          A press (the tool, a finger, the pad) goes down round and comes up in fingers: as the glass lifts, the rim it pushed out breaks into radial fingers drawn back toward the centre, the Fillmore sunburst. 0 is a round press that lifts round.
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
          label="Drops"
          disabled={(settings.beads ?? 0) <= 0 && 'needs Oil Beads'}
          value={settings.beadDrops ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ beadDrops: v })}
          settingKey="beadDrops"
        />
        <Info>
          Drops turns the oil beads from dark-rimmed rings into drops of colour: each takes a dye from the look, is a lens over the liquid under it, presses flat against its neighbours, gathers a ring of droplets, and keeps a smaller drop it swallowed visible inside it.
        </Info>
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
          disabled={(settings.layerCount ?? 1) < 2 && !backLook && 'needs 2 Layers'}
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
      )}

      {/* Camera Section */}
      {keep('camera') && (
      <section id="settings-camera" className={`${CARD} ${shown('camera') ? GRID : 'hidden'} ${focusSection === 'camera' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('camera')} data-section="camera">
        <h3 className={TITLE}>
          <Aperture size={12} /> Lens
        </h3>
        <Info>
          The macro photograph instead of the projected show: a lit paper backdrop, dye as transmission, every drop a dome with a softbox in it, then a real lens over the picture — refraction, a focal plane, bloom, colour fringing, the sensor's roll-off.
        </Info>
        <div className="flex flex-col gap-2 mb-4">
          <div className="text-[13px] font-medium text-text">Render Style</div>
          <div className="grid grid-cols-2 gap-1">
            {(['show', 'photo'] as const).map((style) => (
              <button
                aria-pressed={(settings.renderStyle ?? 'show') === style}
                key={style}
                onClick={() => onUpdate({ renderStyle: style })}
                className={`py-1.5 rounded-lg text-[13px] font-medium border transition-all ${
                  (settings.renderStyle ?? 'show') === style ? LIT : 'bg-white/5 border-white/10 hover:bg-white/10'
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
        {/* The film's colours: the rainbow at 0, as every look was made; a
            real soap film's at 1 (black where thinnest, straw, purple, blue,
            gold, washing out as it thickens), and on the plate the pale
            tint a projector throws through one. Thin Film and the bubbles'
            Iridescence both draw through it. */}
        <Slider label="Film Physics" value={settings.filmPhysics ?? 0} min={0} max={1.0} step={0.05} onChange={(v: number) => onUpdate({ filmPhysics: v })}
          settingKey="filmPhysics"
        />
      </section>
      )}

      {/* Film stock — what the whole show is photographed on (F1). */}
      {keep('stock') && (
      <section id="settings-stock" className={`${CARD} ${shown('stock') ? GRID : 'hidden'} ${focusSection === 'stock' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('stock')} data-section="stock">
        <h3 className={TITLE}>
          <Film size={12} /> Film Stock
        </h3>
        <Info>
          The texture of the era&apos;s projected film. Light shows ran 16mm loops and slides beside the liquid plates, all projected, and the plate itself sat on an overhead projector — so this is not a filter over the picture, it is what the picture was photographed on. A characteristic curve so highlights roll off instead of clipping, a per-channel dye crossover for the stock&apos;s cast, grain in three layers heaviest through the mid-tones, and a gate that wanders and has its own soft edge. The plate&apos;s own granulation gives way to it, so there is never two grains at once.
        </Info>
        <Slider
          label="Film Stock"
          value={settings.stock ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ stock: v })}
          settingKey="stock"
        />
        <div className="flex flex-col gap-2 mb-4">
          <span className="text-[11px] uppercase tracking-widest font-bold text-white/55">Stock</span>
          <div className="grid grid-cols-5 gap-1">
            {['16mm', 'Slide', 'Faded', 'Super 8', 'Mono'].map((name, i) => (
              <button
                aria-pressed={(settings.stockType ?? 0) === i}
                key={name}
                onClick={() => onUpdate({ stockType: i })}
                className={`py-2 rounded-lg text-[9px] uppercase tracking-wider font-bold border transition-colors ${
                  (settings.stockType ?? 0) === i ? LIT : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
                title={[
                  '16mm reversal: cool and saturated, with a hard shoulder',
                  'A slide stock: warm, deep blacks, a long shoulder',
                  'Faded sixties negative: magenta cast and lifted blacks',
                  'Super 8: soft, warm, and grainy enough that the grain is the look',
                  'Monochrome reversal, toned',
                ][i]}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        <Slider
          label="Grain"
          value={settings.stockGrain ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ stockGrain: v })}
          settingKey="stockGrain"
        />
        <Slider
          label="Grain Size"
          value={settings.stockGrainSize ?? 2}
          min={1}
          max={6}
          step={0.5}
          onChange={(v: number) => onUpdate({ stockGrainSize: v })}
          settingKey="stockGrainSize"
        />
        <Slider
          label="Gate Weave"
          value={settings.stockWeave ?? 0}
          min={0}
          max={3}
          step={0.1}
          onChange={(v: number) => onUpdate({ stockWeave: v })}
          settingKey="stockWeave"
        />
        <Slider
          label="Gate Edge"
          value={settings.stockGate ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ stockGate: v })}
          settingKey="stockGate"
        />
      </section>
      )}


      {/*
        Kaleidoscope Section

        It used to be one control three-quarters of the way down Show, between
        Background Loop and Round Dish, and two of its three dimensions were
        constants inside the shader — so there was nothing to group and no way
        to play it. Folds, how fast the rig turns, and how much plate feeds
        each wedge, together, and all three on the MIDI list.
      */}
      {keep('kaleidoscope') && (
      <section id="settings-kaleidoscope" className={`${CARD} ${shown('kaleidoscope') ? GRID : 'hidden'} ${focusSection === 'kaleidoscope' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('kaleidoscope')} data-section="kaleidoscope">
        <h3 className={TITLE}>
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
                aria-pressed={Math.round(settings.kaleidoscope ?? 0) === k}
                key={k}
                onClick={() => onUpdate({ kaleidoscope: k })}
                className={`py-1.5 rounded-lg text-[13px] font-medium border transition-all ${
                  Math.round(settings.kaleidoscope ?? 0) === k ? LIT : 'bg-white/5 border-white/10 hover:bg-white/10'
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
      )}

      {/* Lamp & Light Section */}
      {keep('lamp') && (
      <section id="settings-lamp" className={`${CARD} ${shown('lamp') ? GRID : 'hidden'} ${focusSection === 'lamp' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('lamp')} data-section="lamp">
        <h3 className={TITLE}>
          <Lightbulb size={12} /> Lamp &amp; Light
        </h3>
        <Info>
          One lamp under the plate, and every material lit from where it sits: bubbles shaded as lenses with a caustic arc on the far side, dye rims bright toward the lamp and shadowed away from it. The lamp wanders, and rocks with the plate; a second lamp from the other side puts two lights across everything. Lamp Ground is what the dye is seen on: at 0 the dye glows on black, as a light show's slides always were drawn here; at 1 the lamp shines up through it, as a projector does, so clear liquid is the lamp's white and dense dye deepens and then goes dark.
        </Info>
        {/* The lamp under the dish shining up through the dye (PLAN 18b), or the dye as light on black. */}
        <Slider
          label="Lamp Ground"
          value={settings.lampGround ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ lampGround: v })}
          settingKey="lampGround"
        />
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
          max={3.75}
          step={0.05}
          onChange={(v: number) => onUpdate({ lampWarmth: v })}
          settingKey="lampWarmth"
        />
        {/* How the lamp meets the dye: at 0 each dye is one flat colour at any
            depth; toward 1 the light goes through it, so thin washes are pale
            and thick pools deep, and overlaps darken. */}
        <Slider
          label="Light Through Dye"
          value={settings.transmission ?? 1}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ transmission: v })}
          settingKey="transmission"
        />
        <Slider
          label="Layer Depth"
          value={settings.thicknessOptics ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ thicknessOptics: v })}
          settingKey="thicknessOptics"
        />
        <Slider
          label="Spectral Mix"
          value={settings.spectralOptics ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ spectralOptics: v })}
          settingKey="spectralOptics"
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
      )}

      {/* The Room Section */}
      {keep('room') && (
      <section id="settings-room" className={`${CARD} ${shown('room') ? GRID : 'hidden'} ${focusSection === 'room' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('room')} data-section="room">
        {/*
          Two cameras, two jobs, and the owner could not tell them apart
          (2026-10-24): "what the room control is vs. showing video on the
          plate". This one is a sensor. Its picture is never drawn; movement
          in front of it stirs the liquid. The film's Webcam is the other
          one, a picture on the plate. So the heading says what it does
          rather than where it points ("The Room"), the first line says the
          picture is never shown and where to go to show one, and the switch
          is the shared Toggle, so on and off read the way every other
          switch does. (PLAN 14ad.)
        */}
        <h3 className={TITLE}>
          <ScanEye size={12} /> Motion camera
        </h3>
        <p className="mb-2 text-[12px] leading-relaxed text-text-2" data-testid="scene-what">
          Movement in front of a camera stirs the liquid. Its picture is never shown. To put a camera&rsquo;s picture on the plate, use Webcam in {goTo('film', 'room')}.
        </p>
        <Info>
          Aim it at the floor or the crowd, not at the screen: a camera that can see the projection makes the plate drive itself. Hold people below is what tracks each person and puts their hands on the glass.
        </Info>
        <div className="mb-2">
          <Toggle
            label="Watch for movement"
            on={sceneOn}
            onChange={(v) => onSceneToggle?.(v)}
            testId="scene-toggle"
          />
        </div>
        <CameraPicker
          cameras={cameras}
          value={sceneDeviceId}
          onChange={(id) => onSceneDevice?.(id)}
          label="Motion camera"
          testId="scene-device"
          inUse={sceneState?.device}
          fellBack={sceneOn && !!sceneState?.fellBack}
        />
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
              <p className="mt-2 text-[12px] leading-relaxed text-amber-300/80" data-testid="scene-error">{sceneState.error}</p>
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
            aria-pressed={settings.scenePeople !== false}
            onClick={() => onUpdate({ scenePeople: !(settings.scenePeople !== false) })}
            className={`flex-1 py-1.5 rounded-lg text-[13px] font-medium border transition-all ${settings.scenePeople !== false ? LIT : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
            data-testid="scene-people"
          >
            Hold people
          </button>
          <button
            aria-pressed={settings.sceneMirror !== false}
            onClick={() => onUpdate({ sceneMirror: !(settings.sceneMirror !== false) })}
            className={`flex-1 py-1.5 rounded-lg text-[13px] font-medium border transition-all ${settings.sceneMirror !== false ? LIT : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
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
      )}

      {/*
        Film

        The film projector, as the input it is. It was the bottom third of
        Projectors, under the corner pin and a gel wheel, which put the one
        thing there that drives the plate in a section about the wall — and
        made that section the longest on the rail. A reel, a camera on a real
        dish or another window, how it shows, and what it does to the liquid.
      */}
      {keep('film') && (
      <section id="settings-film" className={`${CARD} ${shown('film') ? GRID : 'hidden'} ${focusSection === 'film' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('film')} data-section="film">
        <h3 className={TITLE}>
          <Video size={12} /> Film
        </h3>
        <div className="mt-2 mb-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-text">Source</span>
            <span className="min-w-0 truncate text-[12px] text-muted" data-testid="film-source-status">
              {filmSource === 'file' ? `playing ${filmName ?? 'a video file'}`
                : filmSource === 'camera' ? (filmCamera?.label ? `camera live: ${filmCamera.label}` : 'camera live')
                : filmSource === 'window' ? 'window live'
                : 'off'}
            </span>
          </div>
          <input
            ref={filmInputRef}
            id="film-loop-file"
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFilmFile?.(f); e.target.value = ''; }}
          />
          {/*
            One pick-one, the source lit (PLAN 35a). The owner, a loop
            playing: "I really can't tell what buttons are turned on/off."
            These were four grey buttons alike and Off was the only one that
            changed, by greying out, so the row said what was not playing and
            never what was. Video file opens the chooser even when it is the
            one lit, which is how a second file replaces the first.

            Wraps: as a 312px desk panel its four sources ran past the frame,
            and Off was cut off. Window is disabled rather than silently doing
            nothing where the browser has no screen capture, which is every
            phone: a button that looks pressable and answers with a console
            warning is the kind of control that makes someone doubt the rest
            of the panel.
          */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Film source" data-testid="film-source">
            {([
              ['none', 'Off', null, 'film-off', 'No film under the dye', () => onFilmClear?.()],
              ['file', 'Video file', Film, 'film-file', 'Play a video file from this machine through the dye, looping', () => filmInputRef.current?.click()],
              ['camera', 'Webcam', Camera, 'film-camera', 'Point a camera at a real dish of oil and composite it through the solver', () => onFilmCamera?.()],
              ['window', 'Window', MonitorPlay, 'film-window', canCaptureWindow
                ? 'Play another tab, window or screen through the dye: a film from the Internet Archive, a media player, anything on this machine'
                : 'This browser cannot capture a window. Desktop Chrome, Edge, Firefox and Safari can; phones cannot.', () => onFilmWindow?.()],
            ] as const).map(([id, label, Icon, testId, title, go]) => (
              <button
                key={id}
                aria-pressed={filmSource === id}
                onClick={go}
                disabled={id === 'window' && !canCaptureWindow}
                className={`flex ${id === 'none' ? '' : 'flex-1'} items-center justify-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                  filmSource === id ? LIT : 'border-white/15 bg-white/5 text-text-2 hover:bg-white/10'
                }`}
                title={title}
                data-testid={testId}
              >
                {Icon && <Icon size={13} />} {label}
              </button>
            ))}
          </div>

          {/*
            Which camera the film shows, and what the film's camera is for
            (PLAN 14ad). It had no picker: the browser's "environment" camera
            or nothing. The line says the other camera's job too, because the
            owner could not tell this from the motion camera, and the two are
            two sections apart.
          */}
          <div className="mt-1" data-testid="film-camera-pick">
            <p className="mb-2 text-[12px] leading-relaxed text-text-2" data-testid="film-camera-what">
              Webcam shows a camera&rsquo;s picture on the plate, through the dye. To stir the liquid with movement instead, use the {goTo('room', 'film')}.
            </p>
            <CameraPicker
              cameras={cameras}
              value={filmCameraId}
              onChange={(id) => onFilmCameraDevice?.(id)}
              label="Webcam"
              testId="film-device"
              inUse={filmCamera?.label}
              fellBack={!!filmCamera?.fellBack}
            />
            {filmCameraLost && (
              <p className="-mt-1 mb-2 text-[12px] leading-relaxed text-amber-300/80" data-testid="film-camera-lost">
                The camera was unplugged. The film comes back on when it is plugged in again.
              </p>
            )}
          </div>

          {/*
            The demo loops, each with its two uses as the cartoon shelf has
            them: Film plays it as the source above, Pour lays it into the
            dish as dye. The whole row was a button that filmed it, with Pour
            as Dye a span inside it and Load Film a span that did nothing of
            its own (a click on it fell through to the row), and nothing said
            which loop was playing. Now each use is its own button, lit while
            that loop is doing it, and the one filming says so.
          */}
          <div className="mt-3 flex flex-col gap-1" data-testid="film-demos">
            <span className="mb-1 text-[11px] font-medium uppercase tracking-wider text-white/50">Demo loops</span>
            {DEMO_LOOPS.map(v => {
              const filming = filmSource === 'file' && filmName === v.title;
              const pouring = pourName === v.title;
              const fetchAs = async (use: (f: File) => void) => {
                try {
                  const blob = await (await fetch(v.src)).blob();
                  use(new File([blob], v.title, { type: 'video/webm' }));
                } catch (e) { console.error('Failed to load demo video', e); }
              };
              const btn = 'flex h-8 shrink-0 items-center gap-1 rounded-md border px-2.5 text-[12px] font-medium transition-colors';
              const off = 'border-white/15 text-text-2 hover:bg-white/10';
              return (
                <div key={v.src} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5" data-testid={`film-demo-${v.id}`}>
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{v.title}</span>
                  {filming && <Tag tone="next">playing as film</Tag>}
                  <button
                    aria-pressed={filming}
                    onClick={() => (filming ? onFilmClear?.() : fetchAs(f => onFilmFile?.(f)))}
                    className={`${btn} ${filming ? LIT : off}`}
                    title={filming ? 'Playing as the film. Click to take it off.' : 'Play it through the projector as the film, looping (Film Mix sets how much shows)'}
                    data-testid={`film-demo-film-${v.id}`}
                  >
                    <Clapperboard size={11} /> Film
                  </button>
                  <button
                    aria-pressed={pouring}
                    onClick={() => (pouring ? onStopPourVideo?.() : fetchAs(f => onPourVideo?.(f)))}
                    className={`${btn} ${pouring ? LIT : off}`}
                    title={pouring ? 'Pouring into the dish. Click to stop.' : 'Pour it into the dish as dye, looping'}
                    data-testid={`film-demo-pour-${v.id}`}
                  >
                    <Droplets size={11} /> Pour
                  </button>
                </div>
              );
            })}
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
        <p className="mb-3 text-[12px] leading-relaxed text-white/40">
          Any feature of the film onto any control is a patch, in {goTo('patches', 'film')}, where Film Impact, just above, is its master.
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
      )}

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
      {keep('patches') && (
      <section id="settings-patches" className={`${CARD} ${shown('patches') ? GRID : 'hidden'} ${focusSection === 'patches' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('patches')} data-section="patches">
        <h3 className={TITLE}>
          <Cable size={12} /> Patches
        </h3>
        <Info>
          A patch is a <span className="text-white/60">source</span>, something that changes in it,
          a control it moves, and how far — a floor filling up opening the turbulence, a crowd
          going still slowing the plate, someone crossing left to right walking the lamp across
          with them. The source can be the room camera, the film projector, the sound (its
          levels, its bands, or its hits: how hard each kick, snare and hat landed, and the
          note), or a shape (an LFO on the bar, or an envelope a pad fires), and a patch can
          land on every plate or on one of them, so a reel can drive layer 1 while the bass
          drives layer 2.
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
                        const { band: _dropBand, ...rest } = m;
                        next[i] = {
                          ...(source === 'bands' ? m : rest),
                          source,
                          feature: (keep ? m.feature : options[0][0]) as SceneMapping['feature'],
                        };
                        onUpdate({ sceneMappings: next });
                      }}
                      className="min-h-6 w-[58px] shrink-0 bg-black/40 border border-white/10 rounded px-1 py-1 text-[12px] outline-none"
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
                        const { band: _dropBand, ...rest } = m;
                        next[i] = { ...rest, feature: e.target.value as SceneMapping['feature'] };
                        onUpdate({ sceneMappings: next });
                      }}
                      className="min-h-6 flex-1 min-w-0 bg-black/40 border border-white/10 rounded px-1 py-1 text-[12px] outline-none"
                      data-testid={`patch-feature-${i}`}
                    >
                      {featuresFor(m.source ?? 'room').map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    {/*
                      What it moves. Aimed at an area, what a hand does there
                      (lib/areaCords.ts): a setting is one number for the
                      whole plate, so an area takes the four acts and nothing
                      else, and the whole plate takes settings.
                    */}
                    <select
                      value={m.setting}
                      aria-label="Control"
                      onChange={(e) => {
                        const next = [...(settings.sceneMappings ?? [])];
                        next[i] = { ...m, setting: e.target.value as SceneMapping['setting'] };
                        onUpdate({ sceneMappings: next });
                      }}
                      className="min-h-6 flex-1 min-w-0 bg-black/40 border border-white/10 rounded px-1 py-1 text-[12px] outline-none"
                      data-testid={`patch-control-${i}`}
                    >
                      {m.area !== undefined ? AREA_TARGETS.map(t => (
                        <option key={t.key} value={t.key} title={t.hint}>{t.label}</option>
                      )) : TARGET_GROUPS.map(g => (
                        <optgroup key={g.id} label={g.name}>
                          {g.targets.map(t => (
                            <option key={String(t.key)} value={String(t.key)}>{t.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <button
                      onClick={() => onUpdate({ sceneMappings: (settings.sceneMappings ?? []).filter((_, j) => j !== i) })}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-white/10 opacity-50 hover:opacity-100"
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
                      disabled={m.area !== undefined || !PER_LAYER.has(String(m.setting))}
                      title={m.area !== undefined ? 'An area cord works on the plate the music plays'
                        : PER_LAYER.has(String(m.setting))
                        ? 'Which plate this patch moves'
                        : `${sceneTargets.find(t => t.key === m.setting)?.label ?? 'This control'} is part of the finished picture, not one plate`}
                      onChange={(e) => {
                        const v = e.target.value;
                        const next = [...(settings.sceneMappings ?? [])];
                        next[i] = { ...m, layer: v === 'all' ? 'all' : Number(v) };
                        onUpdate({ sceneMappings: next });
                      }}
                      className="min-h-6 w-[76px] shrink-0 bg-black/40 border border-white/10 rounded px-1 py-1 text-[12px] outline-none disabled:opacity-30"
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
                      className="set-range flex-1"
                      style={{ '--fill': `${Math.round(50 * (m.depth + 1))}%` } as React.CSSProperties}
                    />
                    <span className="text-[12px] font-mono opacity-50 w-9 text-right">{m.depth.toFixed(2)}</span>
                  </div>
                  {/*
                    Live spectrum strip for `bands` cords (PLAN 30a): log
                    frequency 40 Hz–16 kHz, the eight fixed bands marked, and
                    the gate threshold drawn on the cord's own live reading.
                    Dragging a band writes `band: [loHz, hiHz]` and updates
                    `feature` to the named band holding the drag's middle.
                  */}
                  {m.source === 'bands' && (
                    <div className="mt-2">
                      <BandStrip
                        band={m.band}
                        feature={m.feature}
                        gain={m.gain ?? 1}
                        threshold={(m.area !== undefined
                          ? (m.mode === 'gate' || (m.mode !== 'follow' && (m.threshold !== undefined || m.attack !== undefined || m.release !== undefined)))
                          : m.mode === 'gate')
                          ? (m.threshold ?? 0.3)
                          : undefined}
                        readEar={readEar}
                        testId={`patch-band-${i}`}
                        onChange={(band, feature) => {
                          const next = [...(settings.sceneMappings ?? [])];
                          const { band: _oldBand, ...rest } = m;
                          next[i] = band ? { ...rest, band, feature } : { ...rest, feature };
                          onUpdate({ sceneMappings: next });
                        }}
                      />
                    </div>
                  )}
                  {/*
                    Where on the plate (PLAN 25h): on a look with areas of the
                    dish, the cord can work one of them alone. Aiming it at an
                    area turns its control into what a hand does there (Stir,
                    to start), and aiming it back at the plate gives it a
                    setting again (Turbulence), so the cord is never left
                    naming something its aim cannot take.
                  */}
                  {lookAreas && (
                    <div className="mt-2">
                      <AreaPicker
                        areas={lookAreas}
                        colours={areaColours}
                        value={m.area !== undefined && m.area < lookAreas.length ? m.area : undefined}
                        testId={`patch-area-${i}`}
                        onChange={(area) => {
                          const next = [...(settings.sceneMappings ?? [])];
                          const { area: _drop, layer: _layer, ...rest } = m;
                          next[i] = area === undefined
                            ? { ...rest, layer: m.layer ?? 'all', setting: isAreaTarget(m.setting) ? 'turbulenceScale' : m.setting }
                            : { ...rest, area, setting: isAreaTarget(m.setting) ? m.setting : 'areaStir' };
                          onUpdate({ sceneMappings: next });
                        }}
                      />
                    </div>
                  )}
                  {/*
                    Shaping the cord (PLAN 30a / 25h-2): gain before the
                    threshold on sound and band cords, and mode (Follow vs Gate)
                    with Gate (threshold), Rise (attack) and Fall (release) on
                    both whole-plate sound/band cords and area cords.
                  */}
                  {(m.source === 'sound' || m.source === 'bands' || m.area !== undefined) && (() => {
                    const isSoundOrBands = m.source === 'sound' || m.source === 'bands';
                    const isGated = m.area !== undefined
                      ? (m.mode === 'gate' || (m.mode !== 'follow' && (m.threshold !== undefined || m.attack !== undefined || m.release !== undefined)))
                      : m.mode === 'gate';
                    return (
                      <div className="mt-2 flex flex-col gap-1.5" data-testid={`patch-gate-${i}`}>
                        {isSoundOrBands && (
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] text-white/60 w-9">Gain</span>
                            <input
                              type="range" min={0} max={4} step={0.05}
                              value={m.gain ?? 1}
                              aria-label="Gain"
                              onChange={(e) => {
                                const next = [...(settings.sceneMappings ?? [])];
                                next[i] = { ...m, gain: parseFloat(e.target.value) };
                                onUpdate({ sceneMappings: next });
                              }}
                              className="set-range flex-1"
                              style={{ '--fill': `${Math.round(100 * (m.gain ?? 1) / 4)}%` } as React.CSSProperties}
                              data-testid={`patch-gain-${i}`}
                            />
                            <span className="text-[12px] font-mono opacity-50 w-12 text-right">{`${(m.gain ?? 1).toFixed(2)}×`}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2 min-h-[28px]" data-testid={`patch-mode-${i}`}>
                          <span className="text-[12px] text-white/60">Mode</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-pressed={!isGated}
                              onClick={() => {
                                const next = [...(settings.sceneMappings ?? [])];
                                const { mode: _m, threshold: _t, attack: _a, release: _r, ...rest } = m;
                                next[i] = rest;
                                onUpdate({ sceneMappings: next });
                              }}
                              className={`min-h-6 px-2.5 rounded text-[12px] font-medium border ${!isGated ? LIT : 'bg-transparent border-white/10'}`}
                              data-testid={`patch-mode-follow-${i}`}
                            >
                              Follow
                            </button>
                            <button
                              type="button"
                              aria-pressed={isGated}
                              onClick={() => {
                                const next = [...(settings.sceneMappings ?? [])];
                                next[i] = {
                                  ...m,
                                  mode: 'gate',
                                  threshold: m.threshold ?? 0.3,
                                  attack: m.attack ?? 0.02,
                                  release: m.release ?? 0.4,
                                };
                                onUpdate({ sceneMappings: next });
                              }}
                              className={`min-h-6 px-2.5 rounded text-[12px] font-medium border ${isGated ? LIT : 'bg-transparent border-white/10'}`}
                              data-testid={`patch-gate-on-${i}`}
                            >
                              Gate
                            </button>
                          </div>
                        </div>
                        {isGated && ([
                          ['threshold', 'Gate', 0, 1, 0.05, (v: number) => v.toFixed(2)],
                          ['attack', 'Rise', 0, 2, 0.01, (v: number) => `${v.toFixed(2)} s`],
                          ['release', 'Fall', 0, 4, 0.05, (v: number) => `${v.toFixed(2)} s`],
                        ] as const).map(([key, label, min, max, step, show]) => (
                          <div key={key} className="flex items-center gap-2">
                            <span className="text-[12px] text-white/60 w-9">{label}</span>
                            <input
                              type="range" min={min} max={max} step={step}
                              value={m[key] ?? 0}
                              aria-label={label}
                              onChange={(e) => {
                                const next = [...(settings.sceneMappings ?? [])];
                                next[i] = { ...m, [key]: parseFloat(e.target.value) };
                                onUpdate({ sceneMappings: next });
                              }}
                              className="set-range flex-1"
                              style={{ '--fill': `${Math.round(100 * ((m[key] ?? 0) - min) / Math.max(1e-9, max - min))}%` } as React.CSSProperties}
                              data-testid={`patch-${key}-${i}`}
                            />
                            <span className="text-[12px] font-mono opacity-50 w-12 text-right">{show(m[key] ?? 0)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>
        {/*
          The masters, one per source. Three of them sit beside the Drive of
          the source they scale (Room Impact under Room Drive, Film Impact
          under Film Drive, Sound Impact under Sound Drive): the owner found
          two strengths for one input in two sections (PLAN 35c-2). Shapes
          have no input section, a wave or an envelope being the bay's own, so
          their master stays here.

          Each is greyed until a patch actually reads its source, rather than
          until any patch exists. With one room patch in the bay the old rule
          lit all three, and a fader that moves nothing is exactly what this
          panel keeps being fixed for.
        */}
        <div className="mt-6 mb-3 text-[13px] font-medium text-text">Masters</div>
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
          Each source has one master over every patch that reads it, so a whole source can be pulled down on one fader without touching the patches themselves: the room out of a quiet song, the film under the band, the sound off while the reel carries it. <span className="text-white/70">Room Impact</span> is in {goTo('room', 'patches')}, <span className="text-white/70">Film Impact</span> in {goTo('film', 'patches')} and <span className="text-white/70">Sound Impact</span> in {goTo('audio-input', 'patches')}, each under the Drive of the same source; Shapes Impact is the one here. Film Impact starts at zero, so a look saved before the film could ride anything does exactly what it did.
        </Info>
      </section>
      )}

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
      {keep('midi') && (
      <section id="settings-midi" className={`${CARD} ${shown('midi') ? GRID : 'hidden'} ${focusSection === 'midi' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('midi')} data-section="midi">
        <h3 className={TITLE}>
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
              aria-pressed={midi.enabled}
              onClick={() => (midi.enabled ? midi.disable() : midi.enable())}
              className={`mb-3 w-full rounded-lg py-2.5 text-[13px] font-medium transition-colors ${
                midi.enabled ? `border ${LIT}` : 'border border-white/10 hover:bg-white/10'
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
                {/* The port out, for the pads' LEDs: the MIDI sheet used to draw this next to the port in. */}
                <div className="mb-3 flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-text">LEDs</span>
                  <select
                    value={midi.ports.output}
                    onChange={e => midi.choosePorts({ output: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/40"
                    data-testid="settings-midi-output"
                  >
                    <option value="auto">Auto</option>
                    <option value="off">Off</option>
                    {midi.outputs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
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
      )}

      {/*
        Wall

        The id is still `projectors`, which is what the Wall dot and every
        deep link open. The section is only the wall now: where the picture
        goes and what shape it arrives in, set once at load-in. The look
        effects that shared it are under Lamp & Light, and the film projector
        is an input of its own.
      */}
      {keep('projectors') && (
      <section id="settings-projectors" className={`${CARD} ${shown('projectors') ? GRID : 'hidden'} ${focusSection === 'projectors' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('projectors')} data-section="projectors">
        <h3 className={TITLE}>
          <Projector size={12} /> Wall
        </h3>
        {onProjectorMode && (
          <div className="flex flex-col gap-2 mb-5">
            <div className="text-[13px] font-medium text-text">Second Screen</div>
            <div className="grid grid-cols-3 gap-1">
              {([['ask', 'Ask'], ['auto', 'Automatic'], ['off', 'Off']] as const).map(([m, label]) => (
                <button
                  aria-pressed={projectorMode === m}
                  key={m}
                  onClick={() => onProjectorMode(m)}
                  className={`py-1.5 rounded-lg text-[13px] font-medium border transition-all ${projectorMode === m ? LIT : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
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
          <OutputPanel output={output} onChange={onOutput} onReset={onOutputReset} wakeLock={wakeLock} test={wallTest} onTest={onWallTest} />
        )}
      </section>
      )}

      {/* Mapping Section */}
      {keep('mapping') && (
      <section id="settings-mapping" className={`${CARD} ${shown('mapping') ? GRID : 'hidden'} ${focusSection === 'mapping' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('mapping')} data-section="mapping">
        <h3 className={TITLE}>
          <Shapes size={12} /> Mapping
        </h3>
        {output && onOutput && <MappingPanel output={output} onChange={onOutput} />}
      </section>
      )}

      {/* Simulation Section */}
      {/*
        Logo & Titles

        The one thing on the wall that is not the plate. `injectImage` already
        existed and pours a picture into the liquid as dye, which is the lovely
        thing to do with an image and the wrong thing to do with the mark of
        whoever is paying for the room: it dissolves in about four seconds.
        This one sits over the top and stays put for three hours.
      */}
      {keep('mark') && (
      <section id="settings-mark" className={`${CARD} ${shown('mark') ? GRID : 'hidden'} ${focusSection === 'mark' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('mark')} data-section="mark">
        <h3 className={TITLE}>
          <Image size={12} /> Logo &amp; Titles
        </h3>
        {isFreeTierGated() ? (
          <div className="mb-5 flex flex-col gap-2.5">
            <div
              data-cg-free-logo-mark="ChromaGlass"
              data-cg-app-tile="custom-logo"
              onClick={openAccountSheet}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAccountSheet(); } }}
              className="cursor-pointer rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] leading-relaxed text-amber-100 transition-colors hover:border-amber-400/50 hover:bg-amber-500/15"
            >
              <div className="flex items-center justify-between gap-2 font-semibold text-amber-200">
                <span>In the ChromaGlass app · Custom band logo &amp; text layer</span>
                <span className="shrink-0 text-[11px] font-medium text-amber-300 underline underline-offset-2">Get Home or Pro →</span>
              </div>
              <p className="mt-0.5 text-amber-100/90">
                On the free site, the logo layer displays the ChromaGlass mark. Unlock Home or Pro to load your own band mark or SVG.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="80" viewBox="0 0 420 80"><text x="210" y="52" text-anchor="middle" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="38" font-weight="600" letter-spacing="2">ChromaGlass</text></svg>`;
                  onMarkFile?.(new File([svg], 'chromaglass-mark.svg', { type: 'image/svg+xml' }));
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-2 py-2 text-[13px] font-medium hover:bg-white/10"
                data-testid="mark-load"
              >
                <Image size={13} /> {markLoaded ? 'ChromaGlass mark active' : 'Show ChromaGlass mark'}
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
          </div>
        ) : (
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
        )}
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
      )}

      {keep('simulation') && (
      <section id="settings-simulation" className={`${CARD} ${shown('simulation') ? GRID : 'hidden'} ${focusSection === 'simulation' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('simulation')} data-section="simulation">
        <h3 className={TITLE}>
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
                  const st = live ?? engineStatus;
                  const sps = st.stepsPerSec;
                  // Against what the loop asked for, not a hard sixty. Thirty
                  // steps at twice the timestep is the same liquid at the same
                  // speed, and this read it as "50% speed" in amber — the one
                  // warning that catches a plate silently running slow, fired
                  // at a plate running exactly on time.
                  const want = st.stepRate > 0 ? st.stepRate : 60;
                  if (!(sps > 0) || sps >= want * 0.95) return null;
                  return <span className="text-amber-300/80"> · {Math.round((sps / want) * 100)}% speed</span>;
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
            not the GPU time to run it, which the governor now reads from
            timestamp queries instead.
          */}
          {showFrameSplit && engineStatus && (
            <div className="text-[11px] font-mono opacity-40 leading-relaxed">
              solver {(live ?? engineStatus).simMs.toFixed(1)} ms/step
              {' · '}other {(live ?? engineStatus).otherMs.toFixed(1)} ms/frame
              {' · '}{Math.round((live ?? engineStatus).stepsPerSec)} of {Math.round((live ?? engineStatus).stepRate || 60)} steps/s
            </div>
          )}
          <select
            value={String(settings.simResolution ?? 'auto')}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '1024' && isTierGatingEnforced() && !isProLicenseUnlocked()) return;
              onUpdate({ simResolution: (v === 'auto' ? v : Number(v)) as SimResolution });
            }}
            className="bg-white/10 border border-white/20 rounded px-2 py-1 text-sm focus:outline-none focus:border-white/50"
            title="Grid the fluid is solved on. Finer grids resolve thinner filaments and real cell structure; Auto leaves the choice to the governor, which measures the GPU's own frame cost."
          >
            <option value="auto">Auto</option>
            <option value="256">GPU · 256² (light)</option>
            <option value="384">GPU · 384²</option>
            <option value="512">GPU · 512²</option>
            <option value="768">GPU · 768² (heavy)</option>
            <option value="1024" disabled={isTierGatingEnforced() && !isProLicenseUnlocked()}>GPU · 1024² (Pro · ultra)</option>
          </select>
          <Info>
            Finer grids let the physics form the filaments and cells itself instead of the closeup synthesising them.
            Auto measures the frame rate and picks the largest grid this machine holds at 60 fps
            {engineStatus?.governed && engineStatus.steppedDown ? ' — it has stepped down on this machine.' : '.'}
            {engineStatus && ` Running ${engineStatus.tier === 'hosted' ? 'from the web' : engineStatus.tier === 'native' ? 'natively' : 'locally'}; ${engineStatus.gpu === 'software' ? 'software GL' : `${engineStatus.gpu} GPU`}.`}
          </Info>
          {((engineStatus?.governed && engineStatus.steppedDown) || engineStatus?.gpuUnavailable) && !isProLicenseUnlocked() && (
            <div
              data-cg-grid-upgrade-pro=""
              className="mt-1 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] p-3 text-[12px] leading-snug text-amber-100/90"
            >
              <div className="font-semibold text-amber-200">
                Upgrade to ChromaGlass Pro for full GPU &amp; CPU headroom
              </div>
              <p className="mt-1 text-[11px] text-white/75">
                Pro lets the automatic quality ladder climb to <span className="font-mono text-white/90">768²</span> at <span className="font-mono text-white/90">2x</span> and <span className="font-mono text-white/90">1024²</span> at <span className="font-mono text-white/90">1x</span>, and unlocks the <span className="font-mono text-white/90">1024²</span> grid pin on your machine.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a
                  href={getEffectiveTier() === 'home' ? CHECKOUT_UPGRADE_URL : CHECKOUT_PRO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-md bg-amber-400 px-2.5 py-1 text-[11px] font-semibold text-black hover:bg-amber-300"
                >
                  {getEffectiveTier() === 'home' ? 'Upgrade to Pro — $164' : 'Get Pro — $199'}
                </a>
                <button
                  type="button"
                  onClick={openAccountSheet}
                  className="rounded-md border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-white/85 hover:bg-white/[0.12]"
                >
                  Enter licence key
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
      )}

      {/* Macro Closeup Section */}
      {keep('macro') && (
      <section id="settings-macro" className={`${CARD} ${shown('macro') ? GRID : 'hidden'} ${focusSection === 'macro' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('macro')} data-section="macro">
        <h3 className={TITLE}>
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
            At 1× this is the whole plate. Push the zoom in and the camera goes where it is aimed — the exposure,
            the depth of field and the surface under the dye all arrive with the magnification rather than switching on
            at a threshold. Everything below shapes that closeup and takes effect as you come in.
          </Info>
        )}
        {(settings.macroZoom ?? 1) > 1.05 && (
          <>
            {/*
              Who moves the camera. It used to be the camera alone: it picked a
              subject, held it a few seconds and cut to another, so a closeup
              could not be kept on anything. Now it goes where it is aimed
              (Hold), rides what it is aimed at (Follow), or roams (Auto).
              Alt-drag on the plate pans it and Alt-click fixes it on a spot;
              Random Evolve wanders the aim when it is on.
            */}
            <div className="mb-3">
              <div className="text-[12px] opacity-60 mb-1">Camera</div>
              <Segmented
                value={settings.macroCamera ?? 'hold'}
                options={[['hold', 'Hold'], ['follow', 'Follow'], ['auto', 'Auto']]}
                onChange={(v) => onUpdate({ macroCamera: v as 'hold' | 'follow' | 'auto' })}
              />
            </div>
            {(settings.macroCamera ?? 'hold') !== 'auto' && (
              <>
                <Slider
                  label="Macro Aim Across"
                  value={settings.macroAimX ?? 0.5}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v: number) => onUpdate({ macroAimX: v })}
          settingKey="macroAimX"
        />
                <Slider
                  label="Macro Aim Up"
                  value={settings.macroAimY ?? 0.5}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v: number) => onUpdate({ macroAimY: v })}
          settingKey="macroAimY"
        />
                <Info>
                  Alt-drag (Option-drag) on the plate pans the camera; Alt-click fixes it on the spot under the pointer.
                  {(settings.macroCamera ?? 'hold') === 'follow' ? ' Follow locks onto the liquid there and rides with it.' : ''}
                  {' '}With Random Evolve on, the aim wanders slowly.
                </Info>
              </>
            )}
            <Slider
              label="Chase Speed"
              value={settings.macroChase}
              min={0}
              max={1}
              step={0.05}
              onChange={(v: number) => onUpdate({ macroChase: v })}
          settingKey="macroChase"
        />
            {(settings.macroCamera ?? 'hold') === 'auto' && (
            <Slider
              label="Shot Length"
              value={settings.macroHold}
              min={1}
              max={15}
              step={0.5}
              onChange={(v: number) => onUpdate({ macroHold: v })}
          settingKey="macroHold"
        />
            )}
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
      )}

      {keep('squish') && (
      <section id="settings-squish" className={`${CARD} ${shown('squish') ? GRID : 'hidden'} ${focusSection === 'squish' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('squish')} data-section="squish">
        <h3 className={TITLE}>
          <Sliders size={12} /> Squish Plate
        </h3>
        {/*
          The two glasses and the film between them (PLAN 35c). What used to be
          one section of forty controls is five: this is the cell itself, how
          hard it is pressed, how it is shaped and how thin the gap is, and the
          liquid's own behaviour in it; the oil, the ferrofluid and the
          reactions each have a section beside it, and the tilt is Motion's.
        */}
        <Slider
          label="Plate Pressure"
          value={settings.platePressure}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ platePressure: v })}
          settingKey="platePressure"
        />
        {/*
          The two glasses themselves.

          Plate Shape is the dome the pair leaves at rest. Left of centre
          opens the gap in the middle and tightens it at the rim; right of
          centre does the opposite. Dead centre is two flats, which is what
          this was before and which no real plate is — and which is still the
          default, because a dome measured more inward flow than a flat plate
          and nothing yet measures what it buys.

          Press Lift is how long a press takes to come back up. It was fixed
          at a twelfth of a second, faster than a hand can move, which is
          most of why pressing did not feel like it did anything.
        */}
        <Slider
          label="Plate Shape"
          value={settings.plateCurve ?? 0}
          min={-1}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ plateCurve: v })}
          settingKey="plateCurve"
        />
        <Slider
          label="Depth Drag"
          value={settings.depthDrag ?? 0}
          min={0}
          max={3}
          step={0.05}
          onChange={(v: number) => onUpdate({ depthDrag: v })}
          settingKey="depthDrag"
        />
        {/*
          The plate as a Hele-Shaw cell (PLAN §18a): a switch on a slider's
          two stops, as Layers is, so a MIDI button and a desk can hold it
          too. Thickness is how long a push lasts in it, so it only shows
          while it is on.
        */}
        <Slider
          label="Thin Gap"
          value={settings.thinGap ?? 1}
          min={0}
          max={1}
          step={1}
          onChange={(v: number) => onUpdate({ thinGap: v })}
          settingKey="thinGap"
        />
        {(settings.thinGap ?? 1) > 0.5 && (
          <Slider
            label="Thickness"
            value={settings.gapThickness ?? 0.45}
            min={0}
            max={1}
            step={0.05}
            onChange={(v: number) => onUpdate({ gapThickness: v })}
            settingKey="gapThickness"
          />
        )}
        <Slider
          label="Press Lift"
          value={settings.plateSpring ?? 0.35}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ plateSpring: v })}
          settingKey="plateSpring"
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
                aria-pressed={settings.viscosity === v}
                key={v}
                onClick={() => onUpdate({ viscosity: v })}
                title={v === 'thick' ? 'A light oil, 20 times water\'s viscosity. Hover to watch a drop fall through it.' : 'Water. Hover to watch a drop fall through it.'}
                className={`flex flex-1 items-center justify-center gap-1.5 py-1 text-[12px] rounded-md transition-all ${
                  settings.viscosity === v ? `${LIT} font-bold` : 'text-muted hover:bg-hover'
                }`}
              >
                {/* A drop that lets go at the pace of this viscosity (PLAN 35e, lib/dripPace.ts). */}
                <ViscosityDrip mode={v} />
                {v}
              </button>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* Oil & Soap Section */}
      {keep('oil') && (
      <section id="settings-oil" className={`${CARD} ${shown('oil') ? GRID : 'hidden'} ${focusSection === 'oil' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('oil')} data-section="oil">
        <h3 className={TITLE}>
          <Droplets size={12} /> Oil & Soap
        </h3>
        {/* What keeps one liquid out of another: surface tension, soap, and how polar each liquid is (PLAN 35c). */}
        <Slider
          label="Oil Tension"
          value={settings.oilTension ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ oilTension: v })}
          settingKey="oilTension"
        />
        {/* Each liquid keeps its own colour: needs Oil Tension, which is what puts oil on the plate. */}
        <Slider
          label="Oil Bodies"
          value={settings.oilBodies ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ oilBodies: v })}
          settingKey="oilBodies"
        />
        {/* The water film between two drops holds them apart (FILM_WGSL): needs Oil Tension too. */}
        <Slider
          label="Film Hold"
          value={settings.filmHold ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ filmHold: v })}
          settingKey="filmHold"
        />
        <Slider
          label="Soap Bursts"
          value={settings.surfactantFlow ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ surfactantFlow: v })}
          settingKey="surfactantFlow"
        />
        {/*
          A clear oil film against the glass that tears into lace (PLAN §20b):
          how thick it is laid. Thin tears at once over the dish's dust, thick
          holds until alcohol or soap lands on it. White only on Lamp Ground.
        */}
        <Slider
          label="Clear Film"
          value={settings.clearFilm ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ clearFilm: v })}
          settingKey="clearFilm"
        />
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
      )}

      {/* Ferrofluid Section */}
      {keep('ferro') && (
      <section id="settings-ferro" className={`${CARD} ${shown('ferro') ? GRID : 'hidden'} ${focusSection === 'ferro' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('ferro')} data-section="ferro">
        <h3 className={TITLE}>
          <Magnet size={12} /> Ferrofluid
        </h3>
        {/*
          The second phase and the magnet under the glass (H7).

          Ferrofluid is a heavy liquid that will not mix with the dye and that
          a magnet can pull. The shapes are not drawn: spikes, labyrinths,
          lattices and chains fall out of a surface tension on one side and a
          magnetic pull on the other, and which one you get is a matter of how
          close and how strong the magnet is. Domain Size carries the whole
          look from beads, through cells, to hand-sized bodies.

          Ferrofluid is 0 on every existing look, so nothing changes until it
          is asked for.
        */}
        <Slider
          label="Ferrofluid"
          value={settings.phaseAmount ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ phaseAmount: v })}
          settingKey="phaseAmount"
        />
        <Slider
          label="Domain Size"
          value={settings.phaseScale ?? 0.4}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ phaseScale: v })}
          settingKey="phaseScale"
        />
        <Slider
          label="Phase Edge"
          value={settings.phaseSharp ?? 0.35}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ phaseSharp: v })}
          settingKey="phaseSharp"
        />
        {/* The ferrofluid moving the colour it moves through: at 0 the black
            is drawn over still dye, as Ferro Paint's references never are. */}
        <Slider
          label="Pushes Dye"
          value={settings.phaseDisplace ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ phaseDisplace: v })}
          settingKey="phaseDisplace"
        />
        <Slider
          label="Magnet Strength"
          value={settings.magnetStrength ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ magnetStrength: v })}
          settingKey="magnetStrength"
        />
        {/* Height is the control that matters most: close is a hard narrow
            pull, lifted away is broad and weak. */}
        <Slider
          label="Magnet Height"
          value={settings.magnetHeight ?? 0.25}
          min={0.02}
          max={1}
          step={0.02}
          onChange={(v: number) => onUpdate({ magnetHeight: v })}
          settingKey="magnetHeight"
        />
        {/* The Magnet tool's own size (lib/magnetSize.ts): a coin at the
            left, a palm at the right, the tool as it always was in the
            middle. The same field over it, reaching further across. */}
        <Slider
          label="Magnet Size"
          value={settings.magnetSize ?? 0.5}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ magnetSize: v })}
          settingKey="magnetSize"
        />
        <Slider
          label="Magnet Across"
          value={settings.magnetX ?? 0.5}
          min={0}
          max={1}
          step={0.02}
          onChange={(v: number) => onUpdate({ magnetX: v })}
          settingKey="magnetX"
        />
        <Slider
          label="Magnet Up"
          value={settings.magnetY ?? 0.5}
          min={0}
          max={1}
          step={0.02}
          onChange={(v: number) => onUpdate({ magnetY: v })}
          settingKey="magnetY"
        />
        {/* The hand moving the magnet around under the dish, slowly, faster
            with the music. Evolve starts it on any ferrofluid look. */}
        <Slider
          label="Magnet Walk"
          value={settings.magnetWalk ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ magnetWalk: v })}
          settingKey="magnetWalk"
        />
        <Slider
          label="Labyrinth"
          value={settings.ferroLabyrinth ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ ferroLabyrinth: v })}
          settingKey="ferroLabyrinth"
        />
        <Slider
          label="Maze Detail"
          disabled={(settings.ferroLabyrinth ?? 0) <= 0.001 && 'needs Labyrinth above 0'}
          value={settings.mazeDetail ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ mazeDetail: v })}
          settingKey="mazeDetail"
        />
      </section>
      )}

      {/* Reactions Section */}
      {keep('reactions') && (
      <section id="settings-reactions" className={`${CARD} ${shown('reactions') ? GRID : 'hidden'} ${focusSection === 'reactions' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('reactions')} data-section="reactions">
        <h3 className={TITLE}>
          <FlaskConical size={12} /> Reactions
        </h3>
        {/*
          The chemistry that draws by itself on the plate: the indicator that
          changes colour with the acid, the oscillating reaction, the rings a
          reagent leaves in a gel, and the Turing pattern (spots to labyrinth)
          and its print. The last six were in Lamp & Light, under the lamp
          they were thought to colour, and are in the group they belong to now
          (PLAN 35c).
        */}
        <Slider
          label="pH Indicator"
          value={settings.phIndicator ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ phIndicator: v })}
          settingKey="phIndicator"
        />
        <Slider
          label="BZ Reaction"
          value={settings.bzReaction ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ bzReaction: v })}
          settingKey="bzReaction"
        />
        <Slider
          label="Liesegang Rings"
          value={settings.liesegang ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ liesegang: v })}
          settingKey="liesegang"
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
          label="↳ Pattern (Spots to Labyrinth)"
          value={settings.chemistryPattern ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ chemistryPattern: v })}
          settingKey="chemistryPattern"
        />
        <Slider
          label="↳ Pattern Width"
          value={settings.chemistryWidth ?? 0.5}
          min={0.1}
          max={1.0}
          step={0.01}
          onChange={(v: number) => onUpdate({ chemistryWidth: v })}
          settingKey="chemistryWidth"
        />
        <Slider
          label="↳ Turing Print"
          value={settings.turingPrint ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ turingPrint: v })}
          settingKey="turingPrint"
        />
        <Slider
          label="↳ Print Ink (0 is Starch)"
          value={settings.turingInk ?? 0}
          min={0}
          max={1.0}
          step={0.01}
          onChange={(v: number) => onUpdate({ turingInk: v })}
          settingKey="turingInk"
        />
        <Slider
          label="↳ Print Drift (0 is Still)"
          value={settings.turingDrift ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ turingDrift: v })}
          settingKey="turingDrift"
        />
      </section>
      )}

      {/* Manual Interaction Section */}
      {keep('interaction') && (
      <section id="settings-interaction" className={`${CARD} ${shown('interaction') ? GRID : 'hidden'} ${focusSection === 'interaction' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('interaction')} data-section="interaction">
        <h3 className={TITLE}>
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
      )}

      {/* Liquids anyone can make, load from a file and save to one (lib/liquidFile.ts). */}
      {keep('liquids') && (
      <section id="settings-liquids" className={`${CARD} ${shown('liquids') ? GRID : 'hidden'} ${focusSection === 'liquids' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('liquids')} data-section="liquids">
        <h3 className={TITLE}>
          <FlaskConical size={12} /> Liquids
        </h3>
        {liquids ? <LiquidDesigner {...liquids} /> : <div className="text-[12px] opacity-35">The shelf is not available here.</div>}
      </section>
      )}

      {/* Tilt & Rock Section */}
      {keep('tilt') && (
      <section id="settings-tilt" className={`${CARD} ${shown('tilt') ? GRID : 'hidden'} ${focusSection === 'tilt' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('tilt')} data-section="tilt">
        <h3 className={TITLE}>
          <Waves size={12} /> Tilt & Rock
        </h3>
        {/* The dish tipped: held by a hand (Gravity, Tilt Direction), sloshed by the music (Slosh) and rocked on the beat (Plate Rock). PLAN 35c. */}
        <Slider
          label="Gravity"
          value={settings.plateUpright ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ plateUpright: v })}
          settingKey="plateUpright"
        />
        <Slider
          label="Tilt Direction"
          value={settings.tiltDirection ?? 180}
          min={0}
          max={360}
          step={5}
          onChange={(v: number) => onUpdate({ tiltDirection: v })}
          settingKey="tiltDirection"
        />
        <Slider
          label="Slosh"
          value={settings.slosh ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ slosh: v })}
          settingKey="slosh"
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
      </section>
      )}

      {/*
        The plate turning. Rotation Speed, the flick, Auto Spin and everything
        that steers them were the first half of Plates & LED, a Stage panel,
        which keeps a panel out of Build and Gig: the dish's spin is a motion
        the hand rides in a set, so it is Motion's and findable there (PLAN
        35c-2). Plates & LED keeps what is the rig's: how many plates, how
        they blend, and the LED platform under them.
      */}
      {keep('spin') && (
      <section id="settings-spin" className={`${CARD} ${shown('spin') ? GRID : 'hidden'} ${focusSection === 'spin' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('spin')} data-section="spin">
        <h3 className={TITLE}>
          <RotateCw size={12} /> Plate Spin
        </h3>
        <Slider
          label="Rotation Speed"
          value={settings.rotationSpeed}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ rotationSpeed: v })}
          settingKey="rotationSpeed"
        />
        {/*
          The plate as a flywheel.

          Rotation Speed above is a motor: it asks for a speed and the plate
          holds it. Most presets set it low, a turn every few minutes or hours,
          and a few music looks turn visibly (acid-trip once every twenty
          seconds) since the motor's stir in the middle became the dish's turn
          (PLAN 22j). A flick is the other thing a
          plate does — spun by hand and left to slow down — so it is a press
          and not a value, and it goes to one plate at a time because the two
          turn opposite ways and shearing them by hand is the point.

          Both are on pads too, as Spin Front Plate and Spin Back Plate.
        */}
        <div className="flex gap-2 mt-1 mb-2">
          {[0, 1].map((l) => (
            <button
              key={l}
              onClick={() => onFlickPlate?.(l)}
              disabled={!onFlickPlate || (settings.layerCount ?? 1) <= l}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white/80
                         hover:bg-white/10 hover:border-white/30 active:bg-white/20 transition-all
                         disabled:opacity-35 disabled:hover:bg-white/5 disabled:cursor-not-allowed"
              data-testid={`flick-plate-${l}`}
              title={(settings.layerCount ?? 1) <= l
                ? 'This look has one plate'
                : 'Spin this plate up; it slows on its own'}
            >
              Flick {l === 0 ? 'Front' : 'Back'}
            </button>
          ))}
        </div>
        {/*
          Auto Spin (PLAN §22): the dish turned by a motor of its own, at a
          rate or at the tempo. Stepped like Spin Direction, since it is three
          answers. The Rate is signed: its sign is the way round, and Reverse
          flips it (a pad can too, as Reverse Spin), so reversing a dish in
          the middle of a song is one press and not a trip to a slider.
        */}
        {/*
          The platter's strobe rim (PLAN 35f): a ring of dots that drifts at
          the dish's speed in Rate and stands still in Tempo once a tempo is
          heard, because the dish then turns exactly one dot a beat.
        */}
        <div className="mb-1 flex items-center gap-3" data-testid="spin-strobe">
          <StrobeRing mode={settings.spinAuto ?? 0} rpm={settings.spinRpm ?? 6} beats={settings.spinBeats ?? 16} bpm={spinBpm} />
          <p className="text-[11px] leading-snug text-white/50" data-testid="spin-strobe-says">
            {Math.round(settings.spinAuto ?? 0) === 2 && spinBpm > 0
              ? `Locked to ${spinBpm} bpm: the dots stand still while the dish turns once in ${Math.round(settings.spinBeats ?? 16)} beats.`
              : Math.round(settings.spinAuto ?? 0) === 0 ? 'Auto Spin is off.'
              : `Turning at ${Math.abs(settings.spinRpm ?? 6).toFixed(1)} rpm${Math.round(settings.spinAuto ?? 0) === 2 ? ' until a tempo is heard' : ''}.`}
          </p>
        </div>
        <Slider
          label={`Auto Spin — ${SPIN_AUTO_NAMES[Math.max(0, Math.min(2, Math.round(settings.spinAuto ?? 0)))]}`}
          value={settings.spinAuto ?? 0}
          min={0}
          max={2}
          step={1}
          onChange={(v: number) => onUpdate({ spinAuto: Math.round(v) })}
          settingKey="spinAuto"
        />
        <Slider
          label={`Spin Rate — ${(settings.spinRpm ?? 6).toFixed(1)} rpm`}
          value={settings.spinRpm ?? 6}
          min={-45}
          max={45}
          step={0.5}
          onChange={(v: number) => onUpdate({ spinRpm: v })}
          settingKey="spinRpm"
        />
        <Slider
          label={`Beats a Turn — ${Math.round(settings.spinBeats ?? 16)}`}
          value={settings.spinBeats ?? 16}
          min={1}
          max={64}
          step={1}
          onChange={(v: number) => onUpdate({ spinBeats: Math.round(v) })}
          settingKey="spinBeats"
        />
        <div className="flex gap-2 mt-1 mb-2">
          <button
            onClick={() => onUpdate({ spinRpm: -(settings.spinRpm ?? 6) })}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white/80
                       hover:bg-white/10 hover:border-white/30 active:bg-white/20 transition-all"
            data-testid="spin-reverse"
            title="Turn Auto Spin the other way round"
          >
            Reverse Spin
          </button>
        </div>
        <p className="mb-2 mt-1 text-[11px] leading-relaxed text-white/40">
          The dish turns and the liquid follows it: water lags for a few seconds, oil goes at once,
          and a fast dish flings the heavy colour outward. Tempo turns once every so many beats,
          locked to the beat; with no beat heard yet it turns at the Rate.
        </p>
        {/*
          Which way, how steadily, and what drives it.

          Direction is stepped rather than swept because there are three
          answers and none of them is "0.4 of the way anticlockwise". Opposed
          is the default and is what every look did before there was a choice.
        */}
        <Slider
          label={`Spin Direction — ${
            (settings.spinDirection ?? 0) > 0.5 ? 'all clockwise'
              : (settings.spinDirection ?? 0) < -0.5 ? 'all anticlockwise'
              : 'plates opposed'}`}
          value={settings.spinDirection ?? 0}
          min={-1}
          max={1}
          step={1}
          onChange={(v: number) => onUpdate({ spinDirection: Math.round(v) })}
          settingKey="spinDirection"
        />
        <Slider
          label="Spin Wander"
          value={settings.spinWander ?? 0}
          min={0}
          max={1}
          step={0.01}
          onChange={(v: number) => onUpdate({ spinWander: v })}
          settingKey="spinWander"
        />
        <p className="mb-2 mt-1 text-[11px] leading-relaxed text-white/40">
          Wander drifts the motor off its speed. Past about half it crosses zero and the plate
          turns back on itself now and then, the way a dish nudged by hand does.
        </p>
        {/*
          The audio route was reachable from a preset file and nowhere else.

          `audioMappings.rotation` has accepted a feature since long before
          this, and every shipped look sets it to 'none', so the one way to
          turn a plate with the bass was to write a look by hand. That is the
          same fault as a control hidden behind a mode: built, wired, and not
          reachable by anyone using the app.
        */}
        <label className="mb-3 flex items-center gap-2 text-[12px] text-white/60">
          <span className="w-28 shrink-0">Driven by</span>
          <select
            value={settings.audioMappings?.rotation ?? 'none'}
            onChange={(e) => onUpdate({
              audioMappings: { ...settings.audioMappings, rotation: e.target.value as AudioFeature },
            })}
            className="flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-white/85"
            data-testid="spin-audio-route"
            title="Turn the plates with the music: the chosen band adds to whatever the motor is already asking for"
          >
            {/* The one list, not a second copy of it: a feature added there
                but not here is a route nobody can reach. */}
            <option value="none">nothing — the motor only</option>
            {AUDIO_FEATURES.map(([f, name]) => <option key={f} value={f}>{name}</option>)}
          </select>
        </label>
        <Slider
          label="Spin From Music"
          value={settings.spinAudioDepth ?? 0}
          min={0}
          max={1}
          step={0.01}
          onChange={(v: number) => onUpdate({ spinAudioDepth: v })}
          settingKey="spinAudioDepth"
        />
        <Slider
          label="Flick Strength"
          value={settings.spinImpulse ?? 0.5}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ spinImpulse: v })}
          settingKey="spinImpulse"
        />
        <Slider
          label="Plate Drag"
          value={settings.spinDrag ?? 0.25}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ spinDrag: v })}
          settingKey="spinDrag"
        />
      </section>
      )}

      {/* Fluid Physics Section */}
      {keep('physics') && (
      <section id="settings-physics" className={`${CARD} ${shown('physics') ? GRID : 'hidden'} ${focusSection === 'physics' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('physics')} data-section="physics">
        <h3 className={TITLE}>
          <Zap size={12} /> Fluid Physics
        </h3>
        {/*
          0.0002, not 0.001. Dye diffusion costs 1.34 ms of a solver step and
          takes structure out of the plate — measured on one running plate,
          switching it off moved hard edges from 11.1% of pixels to 13.1% and
          the frame from 36.8 ms to 32.9 (docs/webgpu-plan.md). Above the new
          ceiling it was buying nothing anybody wanted. A ceiling rather than
          a switch, because some looks do lean on a little of it.
        */}
        <Slider
          label="Diffusion Rate"
          value={settings.diffusionRate}
          min={0}
          max={0.0002}
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
        {/*
          Heat Slide, as was: two knobs on a panel of their own until the owner
          asked for no setting to sit alone (2026-10-10). The heat they set is
          the heat Heat Spread spreads and Buoyancy lifts.
        */}
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
        <Slider
          label="Swirl"
          value={settings.vorticityConfinement ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ vorticityConfinement: v })}
          settingKey="vorticityConfinement"
        />
        <Slider
          label="Dye Weight"
          value={settings.solutalBuoyancy ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ solutalBuoyancy: v })}
          settingKey="solutalBuoyancy"
        />
        <Slider
          label="Heat Spread"
          value={settings.doubleDiffusion ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ doubleDiffusion: v })}
          settingKey="doubleDiffusion"
        />
      </section>
      )}

      {/* Automation Section */}
      {keep('automation') && (
      <section id="settings-automation" className={`${CARD} ${shown('automation') ? GRID : 'hidden'} ${focusSection === 'automation' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('automation')} data-section="automation">
        <h3 className={TITLE}>
          <Hourglass size={12} /> Automation
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
        {/*
          Surge shapes the automation into gusts with quiet between, which is
          what a dish being worked on actually looks like — a pour, twenty
          seconds of watching it spread, then a press. Every preset sets it,
          between 0.12 and 0.95, and until now nothing on any surface could.
        */}
        <Slider
          label="Surge"
          value={settings.surge ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ surge: v })}
          settingKey="surge"
        />
        {/*
          Pacing is Surge's big brother, and lives beside it. Surge bunches the
          automation's small events into gusts; Pacing makes a running
          sequence's stages into scenes, with whole-plate moments, real rests
          and the light going down between them. It does nothing until a
          sequence is playing, so its 0 is today's show.
        */}
        <Slider
          label="Pacing"
          value={settings.pacing ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ pacing: v })}
          settingKey="pacing"
        />
        {/*
          Follow the Song lives under Pacing because it shapes Pacing's
          scenes: the drops open the big swells, builds and breakdowns hold
          them back (lib/scenePacing.ts). With Pacing at 0 there is no scene,
          so it is dimmed there rather than hidden: the pair reads as one.
        */}
        <div className={(settings.pacing ?? 0) > 0.001 ? '' : 'opacity-50'}>
          <Slider
            label="Follow the Song"
            value={settings.songFollow ?? 0}
            min={0}
            max={1.0}
            step={0.05}
            onChange={(v: number) => onUpdate({ songFollow: v })}
            settingKey="songFollow"
          />
        </div>
      </section>
      )}

      {/* Mixer Section */}
      {keep('layers') && (
      <section id="settings-layers" className={`${CARD} ${shown('layers') ? GRID : 'hidden'} ${focusSection === 'layers' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('layers')} data-section="layers">
        <h3 className={TITLE}>
          <Layers size={12} /> Plates &amp; LED
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
        {/* The look's own count, which a back plate with a look of its own
            (PLAN.md §16a) keeps at two on the stage whatever it says, so the
            slider at 1 with two plates showing is explained, not a fault. */}
        {backLook && (settings.layerCount ?? 1) < 2 && (
          <p className="col-span-full text-[12px] text-dim" data-testid="settings-back-plate-on">
            The back plate is on {backLook}, so it stays on the stage until it follows the front again.
          </p>
        )}
        <div className="mb-4 mt-4">
          <Toggle
            label="LED Platform"
            on={!!settings.ledPlatform}
            onChange={v => onUpdate({ ledPlatform: v })}
            testId="led-platform-toggle"
          />
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
          label="Comet Flow"
          value={settings.cometSpeed}
          min={0}
          max={2.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ cometSpeed: v })}
          settingKey="cometSpeed"
        />
        {(settings.cometSpeed ?? 0) > 0 && (
          <div className="pl-4 border-l-2 border-white/10 ml-2">
            <Slider
              label="Flow Direction"
              value={settings.cometAngle}
              min={0}
              max={360}
              step={5}
              onChange={(v: number) => onUpdate({ cometAngle: v })}
              settingKey="cometAngle"
            />
          </div>
        )}
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
        <div className="flex items-center justify-between mt-4">
          <span className="text-[13px] font-medium text-text">Two Projectors</span>
          <div className="flex items-center gap-2">
            <PinChips settingKey="twoProjectors" />
            <button
              type="button"
              role="switch"
              aria-checked={settings.twoProjectors > 0.5}
              aria-label="Two Projectors"
              onClick={() => onUpdate({ twoProjectors: settings.twoProjectors > 0.5 ? 0 : 1 })}
              className="flex h-8 w-11 shrink-0 items-center justify-center rounded-md p-1"
              data-testid="two-projectors-toggle"
            >
              <SwitchPill on={settings.twoProjectors > 0.5} />
            </button>
          </div>
        </div>
      </section>
      )}

      {/*
        The panel used to be one long scroll and this was its footer: one line
        of history at the bottom of everything. It is now seventeen sections
        shown one at a time, so that footer sits under every one of them — a
        note about the Squish Plate under Controller, under Sound, under
        Projectors. A line of flavour in the wrong place reads as a mistake,
        which is worse than no line at all, so it has gone rather than been
        repeated seventeen times or guarded by a condition.
      */}
    </>
  );

  if (embed) {
    return (
      <PinContext.Provider value={null}>
        <div className="min-w-0 pt-1" data-testid={`settings-embed-${embed}`}>{sections}</div>
      </PinContext.Provider>
    );
  }

  return (
    <Sheet title={scope === 'stage' ? 'Stage' : 'Settings'} onClose={onClose} width={scope === 'stage' ? 720 : 1000} height={scope === 'stage' ? 520 : 860} testId={scope === 'stage' ? 'stage-sheet' : 'settings-panel'}>
      <PinContext.Provider value={pins ?? null}>
      {/*
        A rail and a pane, and the sheet is wider than the other two to hold
        them. Settings is the one sheet with ninety controls in it; the others
        ask one question each and stay at the handoff's 720.

        On a phone the rail becomes a strip across the top: 1000px of sheet on
        a 390px screen is the sheet's own `max-w-full`, and a 216px column
        taken out of that leaves nothing to put a slider in.

        The tabs are full width only in the column. In the strip, a tab of
        `w-full` took its group's whole width, the group being as wide as its
        labels laid end to end, so each group's tabs ran on past it and lay
        under the next group: measured at 390 px, the Inputs group's six tabs
        spanned 140 to 3180 px in a group 505 px wide, and 13 of the 26 tabs
        could not be tapped (`npm run phone`): Mixer, every Inputs tab but
        Sound (Patches among them), three of Look's and four of Plate's.
      */}
      <div className="flex min-h-0 w-full flex-1 flex-col sm:flex-row">

        {/* ── Where you are ─────────────────────────────────── */}
        <nav
          className="flex max-h-[38%] shrink-0 gap-1 overflow-x-auto overflow-y-auto border-b border-white/10 bg-black/20 p-2 sm:max-h-none sm:w-[220px] sm:flex-col sm:border-b-0 sm:border-r sm:px-3 sm:py-3"
          aria-label="Settings sections"
          data-testid="settings-rail"
        >
          {railGroups.length === 0 && (
            <p className="p-2 text-[11px] text-white/35">Nothing matches.</p>
          )}
          {railGroups.map(group => (
            <div key={group.id} className="shrink-0 sm:shrink" data-testid={`rail-group-${group.id}`} data-group={group.id}>
              {/* The seven headings are drawn on a phone too (PLAN 35b): the strip was one flat run of 26 tabs with these hidden, so the phone had no way to see that Squish Plate is chemistry or that Film is a feed. */}
              <div className="whitespace-nowrap px-3 pb-1 pt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/40 sm:pb-1.5 sm:pt-4" title={group.hint} data-testid={`rail-heading-${group.id}`}>
                <span className="mr-1.5 inline-block h-[7px] w-[7px] rounded-full align-[0.5px]" style={{ background: 'var(--cap)' }} aria-hidden />
                {group.name}
              </div>
              <div className="flex gap-0.5 sm:flex-col">
                {group.rows.map(row => (
                  <button
                    key={row.id}
                    onClick={() => { setSection(row.id); setQuery(''); }}
                    aria-current={!q && section === row.id ? 'page' : undefined}
                    className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-[7px] text-left text-[13px] transition-colors sm:w-full sm:whitespace-normal ${
                      !q && section === row.id
                        ? 'bg-accent-bg font-medium text-white shadow-[inset_2px_0_0_var(--color-accent)]'
                        : 'text-white/60 hover:bg-white/[0.05] hover:text-white'
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
        <div ref={paneRef} className="min-h-0 flex-1 overflow-y-auto scrollbar-hide px-7 py-6">

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
      <div className="relative mb-5">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search every setting — try “camera”, “people”, “keystone”"
          aria-label="Search settings"
          data-testid="settings-search"
          className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-[13px] text-white/90 outline-none transition-colors placeholder:text-white/30 focus:border-accent-border focus:bg-white/[0.05]"
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

      {sections}
      {isTierGatingEnforced() && getEffectiveTier() !== 'pro' && (
        <section
          data-cg-app-tiles=""
          data-cg-effective-tier={getEffectiveTier()}
          className="mt-6 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-amber-200">
              In the ChromaGlass app
            </span>
            <button
              type="button"
              onClick={openAccountSheet}
              className="text-[11px] font-semibold text-amber-200 underline underline-offset-2 hover:text-amber-100"
            >
              {getEffectiveTier() === 'home' ? 'Upgrade to Pro →' : 'Get Home or Pro →'}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {APP_FEATURE_TILES.filter((t) => (getEffectiveTier() === 'home' ? t.tier === 'pro' : true)).map((tile) => (
              <div
                key={tile.id}
                data-cg-app-tile={tile.id}
                data-cg-tile-tier={tile.tier}
                onClick={openAccountSheet}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAccountSheet(); } }}
                className="cursor-pointer rounded-lg border border-white/10 bg-black/40 p-2.5 text-[12px] leading-snug transition-colors hover:border-amber-500/40 hover:bg-black/60"
              >
                <div className="flex items-center justify-between gap-2 font-medium text-neutral-100">
                  <span>{tile.title}</span>
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-200">
                    {tile.tier}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-neutral-400">{tile.summary}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      {scope === 'stage' && (
        <p className="mt-2 text-[12px] text-dim" data-testid="stage-sheet-rule">
          The room and the machine: nothing here saves into a look.
        </p>
      )}
        </div>
      </div>
      </PinContext.Provider>
    </Sheet>
  );
};
