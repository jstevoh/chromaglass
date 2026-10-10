import type { ReactNode, Ref } from 'react';
import type { MixTakes } from '../../lib/mixFade';
import type { LiquidType, VisualizerSettings } from '../../types';
import type { DeskLayout, LayoutName } from '../../lib/deskLayout';
import type { DeskDots, DeskMode } from './DeskHeader';

/**
 * A cue: one row of the set list.
 */
export interface Cue {
  id: string;
  name: string;
  /** Two of the look's own dyes, so a row is recognisable at a glance. */
  swatch: string;
  /** Seconds, or 0 for a cut. */
  fade: number;
  /** A set item's song, as a line: the item goes up on its own when that song plays. */
  song?: string;
  /** What a set item is: a look that ships, one saved, or a stage sequence. */
  kind?: 'look' | 'saved' | 'sequence';
  /** A set item whose look or sequence is not here any more. */
  missing?: boolean;
}

/** What a set item's menu can do. */
export type SetItemAction = 'link-song' | 'unlink-song' | 'capture' | 'up' | 'down' | 'remove';
/** What the set's own menu can do. */
export type SetAction = 'import' | 'export' | 'import-show' | 'export-show' | 'clear' | 'song-shows' | 'save' | 'open' | 'delete' | 'rename' | 'new';

/** How a control is learned: to a fader (drawn as a slider) or an encoder (a knob). */
export type ControlKind = 'fader' | 'encoder';

/**
 * Everything the one desk is given.
 *
 * It is the two old desks' props side by side, because it is the two old
 * desks' panels side by side: the cue list and the rides from Perform, the
 * bottles, dyes and recipe from Design. Grouped by the panel that reads them.
 */
export interface DeskProps {
  // ── Which layout, and its panels ───────────────────────────────────
  layoutName: LayoutName;
  layout: DeskLayout;
  onLayout: (change: (l: DeskLayout) => DeskLayout) => void;
  onResetLayout: () => void;
  mode: DeskMode;
  onMode: (m: DeskMode) => void;
  /**
   * A settings section drawn whole, for a panel (`SettingsPanel embed`).
   * Not drawn while `sheetOpen`: the sheet has every section in the page, and
   * two copies of a control under one test id is a control nobody can trust.
   */
  renderSection: (id: string) => ReactNode;
  sheetOpen: boolean;
  /** The Settings sheet at a section: a knob panel's way to the rest of it. */
  onOpenSection: (id: string) => void;
  /** The Stage sheet (⌘,). */
  onStage: () => void;
  /** Re-measure the plate's hole after the desk moves around it. */
  onRelayout?: () => void;

  // ── The header and the status line ─────────────────────────────────
  dots: DeskDots;
  midiName: string | null;
  onSound: () => void;
  onVideo: () => void;
  onMidi: () => void;
  onSearch: () => void;
  onOpenSettings: () => void;
  /** Gig's breadcrumb: the show and the look that is up. */
  showCrumb: ReactNode;
  status: { audio: string; engine: string; sequence: string | null; phone: boolean; rec: string | null };
  onBlackout: () => void;
  blackout: boolean;

  // ── The plate bar ──────────────────────────────────────────────────
  plateRef: Ref<HTMLDivElement>;
  /** The look on the wall (Gig), and how long it has been up. */
  liveName: string | null;
  liveFor: string;
  /** The look being built (Build), and whether it has changes. */
  lookName: string | null;
  edited: boolean;
  dirty: boolean;
  onSendToWall: () => void;
  onSave: () => void;
  onSaveOver?: () => void;
  onNew: () => void;
  savedLooks: { id: string; name: string; swatch: string }[];
  openLookId: string | null;
  onOpenSaved: (id: string) => void;
  onDeleteSaved: (id: string) => void;
  videoRecording?: boolean;
  videoSeconds?: number;
  onToggleVideo?: () => void;
  onRecordOptions?: () => void;
  onPerformance: () => void;
  performance: { clock: string; title?: string } | null;
  layer: number;
  layers: number;
  onLayer: (n: number) => void;
  onAddLayer: () => void;
  onRemoveLayer?: () => void;
  layerHeld?: string | null;
  layerReport?: { index: number; fill: number; colour: string }[];

  // ── Cues ───────────────────────────────────────────────────────────
  cues: Cue[];
  setName: string;
  savedSets: string[];
  onAddToSet: () => void;
  onSetAction: (a: SetAction, name?: string) => void;
  onItemAction: (id: string, a: SetItemAction) => void;
  songNow: string | null;
  liveId: string | null;
  nextId: string | null;
  onCue: (id: string) => void;
  onCueNow: (id: string) => void;
  onGo: () => void;
  onGoBackPlate?: () => void;
  backLook?: string | null;
  onBackFollowsFront?: () => void;
  onBack: (() => void) | null;
  fade: number;
  onFade: (s: number) => void;
  cuedLook: { id: string; name: string } | null;
  liveLookId: string | null;
  onCueSaved: (id: string) => void;
  onSendSaved: (id: string) => void;
  onAddSavedToSet: (id: string) => void;
  onFreeze: () => void;
  frozen: boolean;
  onDrain: () => void;

  // ── Controls: rides, the recipe, the sections' knobs ───────────────
  settings: VisualizerSettings;
  onSetting: (patch: Partial<VisualizerSettings>) => void;
  automated: boolean;
  onAutomate: (on: boolean) => void;
  ccFor: (key: keyof VisualizerSettings) => number | null;
  /** Whether a control's CC is a fader or an encoder: a fader draws as a slider. */
  kindFor: (key: keyof VisualizerSettings) => ControlKind | null;
  /** The look's own value of a setting, where a double-click on its knob or slider puts it back (8c). */
  lookValueOf?: (key: keyof VisualizerSettings) => number | undefined;
  rideKeys: (keyof VisualizerSettings)[];
  onRideKeys: (keys: (keyof VisualizerSettings)[]) => void;
  recipeKeys: (keyof VisualizerSettings)[];
  onRecipeKeys: (keys: (keyof VisualizerSettings)[]) => void;
  onRandomise: () => void;
  randomiseArmed: boolean;
  hasFilm: boolean;
  hasMark: boolean;
  takes?: MixTakes;

  // ── Materials ──────────────────────────────────────────────────────
  dyeBottles: LiquidType[];
  behaviourBottles: LiquidType[];
  bottleId: string;
  onBottle: (id: string) => void;
  swatches: { hex: string; name: string }[];
  dye: string | null;
  onDye: (hex: string) => void;
  palettes: { name: string; colours: string[] }[];
  paletteLock: number | null;
  onPalette: (i: number | null) => void;
  onImageDye: () => void;
  onVideoDye: () => void;
  tool: string;
  onTool: (t: string) => void;
  amountOf?: (tool: string) => number;
  onAmountFor?: (tool: string, v: number) => void;
  toolAmount?: number;
  onToolAmount?: (v: number) => void;
  magnetSize?: number;
  onMagnetSize?: (v: number) => void;
}
