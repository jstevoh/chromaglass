// The desk panel's props, moved out of SettingsPanel.tsx (PLAN 19ai, the size ratchet).

import type { AudioReading } from '../lib/audioFeatures';
import type { EngineStatus } from '../lib/platform';
import type { LiquidDesignerProps } from './LiquidDesigner';
import type { MidiController } from '../hooks/useMidi';
import type { MixTakes } from '../lib/mixFade';
import type { OutputConfig, WallTest } from '../lib/outputConfig';
import type { RoomCalibration } from '../lib/audioCalibration';
import type { TempoReading } from '../lib/tempo';
import type { VisualizerSettings } from '../types';
import type { CartoonShelfProps } from './CartoonShelf';
import type { PinApi } from './SettingsPanel';

export interface SettingsPanelProps {
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
  /** The public domain cartoons that ship with the app, for the Film section (CartoonShelf, PLAN 14ac). */
  cartoons?: CartoonShelfProps;
}
