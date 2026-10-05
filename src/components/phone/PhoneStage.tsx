import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import type { MixTakes } from '../../lib/mixFade';
import {
  Droplet, SprayCan, Paintbrush, FlaskConical, Slash, Wind, Hand, Fingerprint, Magnet,
  Play, Pause, Microscope, EyeOff, X, Music, Palette, Hourglass, MoreHorizontal, ChevronDown,
  Mic, FileAudio, Settings, Clapperboard, Circle, Square, BookOpen, Monitor, ImagePlus,
  Smartphone, Undo2, Shuffle, RotateCw, Trash2, Waves, SlidersVertical, Lightbulb,
  Laptop,
} from 'lucide-react';
import { Slider } from '../ui';
import { SPIN_BEATS_RANGE, SPIN_RPM_MAX } from '../../lib/turntable';
import type { LiquidType, VisualizerSettings } from '../../types';
import { MixerPanel } from '../MixerPanel';
import { goRemote, isPhoneApp } from '../../lib/appLink';
import { TOOL_AMOUNT, TOOL_AMOUNT_MEANS } from '../../lib/toolAmount';
import type { Track } from '../../lib/musicLibrary';
import { bottleSwatch, isClearLiquid, isNatural } from '../../lib/liquidColour';

/**
 * ChromaGlass on a phone.
 *
 * The laptop's floating overlay, squeezed to a phone, covered the whole plate
 * with two columns and put the tools below the fold of one of them: you could
 * see the show or reach the controls, not both. This is laid out for a thumb
 * instead. The plate is the whole screen and is the instrument: every finger
 * on it is a hand in the liquid, with whatever tool is in the dock. The dock
 * holds the nine tools, always in reach at the bottom, and everything else is
 * one tap away in a sheet that comes up over the lower part of the plate and
 * goes again: the bottles and colours, the looks, the sound, the play
 * controls, the mixer, and the rest.
 *
 * What a phone does that a laptop cannot is also here. Several fingers paint
 * at once (LiquidVisualizer's extra hands). On the closeup two fingers are the
 * camera, pinched for the magnification and moved for the aim. And Tilt makes
 * the phone the dish: tip it and the liquid runs downhill (lib/phone.ts).
 *
 * It is the same app, not a copy of it: every control here calls the handler
 * the desks and the overlay call, so a look, a colour or a tool chosen on the
 * phone is the same look, colour or tool anywhere else. Nothing is added to
 * the settings; the phone is a new hand, not a new knob.
 *
 * Sizes follow the design system's touch rules (ui/index.tsx): nothing to
 * press under 48 pixels, sliders with the touch track and handle.
 */

export type PhoneTool = 'dropper' | 'spray' | 'splatter' | 'pour' | 'streak' | 'blow' | 'press' | 'finger' | 'magnet' | 'spin';

const TOOLS: { id: PhoneTool; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: 'dropper', label: 'Drop', icon: Droplet },
  { id: 'spray', label: 'Spray', icon: SprayCan },
  { id: 'splatter', label: 'Splat', icon: Paintbrush },
  { id: 'pour', label: 'Pour', icon: FlaskConical },
  { id: 'streak', label: 'Streak', icon: Slash },
  { id: 'blow', label: 'Blow', icon: Wind },
  { id: 'press', label: 'Press', icon: Hand },
  { id: 'finger', label: 'Finger', icon: Fingerprint },
  { id: 'magnet', label: 'Magnet', icon: Magnet },
  // The dish under the finger (PLAN §22): go round the middle and it turns.
  { id: 'spin', label: 'Spin', icon: RotateCw },
];

export interface PhoneLook {
  id: string;
  name: string;
  description?: string;
  group: string;
  swatch: string;
}

type SheetName = 'dye' | 'looks' | 'sound' | 'play' | 'mix' | 'more';
type AudioSource = 'none' | 'microphone' | 'system' | 'file' | 'simulated' | 'drone';

export interface PhoneStageProps {
  // The look
  lookName: string | null;
  lookSwatch: string;
  looks: PhoneLook[];
  activeLookId: string | null;
  onLook: (id: string) => void;
  onRandomLook: () => void;
  onRevert: (() => void) | null;
  /**
   * The back plate's own look (PLAN.md §16a): a look sent to the back plate
   * alone, what it is on (null while it follows the front), and the way back
   * to twins. The desk's To Back Plate, as a switch at the top of the looks
   * sheet, because on a phone the list is the cue.
   */
  onBackLook?: (id: string) => void;
  backLook?: string | null;
  onBackFollowsFront?: () => void;
  // The hand
  tool: PhoneTool;
  onTool: (t: PhoneTool) => void;
  amount: number;
  onAmount: (v: number) => void;
  // The bottles
  liquids: LiquidType[];
  selectedLiquidId: string;
  onLiquid: (id: string) => void;
  dyeColors: readonly string[];
  onDyeColor: (hex: string) => void;
  palettes: { name: string; colors: string[] }[];
  paletteLock: number | null;
  onPalette: (index: number | null) => void;
  onImageDye: () => void;
  // Playing
  playing: boolean;
  onPlay: () => void;
  evolving: boolean;
  onEvolve: (on: boolean) => void;
  evolveSpeed: number;
  onEvolveSpeed: (v: number) => void;
  layers: number;
  activeLayer: number;
  onLayer: (i: number) => void;
  /** Put a back layer on this look (there are at most two). */
  onAddLayer: () => void;
  /** Take the back layer off; absent while the back plate has a look of its own. */
  onRemoveLayer?: () => void;
  onClear: () => void;
  onDrain: () => void;
  onSpin: () => void;
  onLucky: () => void;
  /*
    Auto Spin (PLAN §22): the dish's own motor, Off, Rate or Tempo, its rate
    in rev/min (signed: the sign is the way round) and, in Tempo, the beats
    a turn. On the Play sheet beside the flick, since a turning dish is
    something played, not set up.
  */
  spin: { auto: number; rpm: number; beats: number; onChange: (patch: Partial<VisualizerSettings>) => void };
  // The closeup
  zoom: number;
  onZoom: () => void;
  camera: 'hold' | 'follow' | 'auto';
  onCamera: (c: 'hold' | 'follow' | 'auto') => void;
  // Tilt
  tilt: { supported: boolean; on: boolean; refused: boolean; silent: boolean; onToggle: () => void };
  // Sound
  audioSource: AudioSource;
  onAudioSource: (s: AudioSource) => void;
  onMusicFile: () => void;
  tracks: readonly Track[];
  nowPlaying: { name: string; src: string | null } | null;
  musicPlaying: boolean;
  onToggleMusic: () => void;
  onTrack: (t: Track) => void;
  soundDrive: number;
  onSoundDrive: (v: number) => void;
  /** The song's shape in a word (lib/songShape.ts): "drop", "build 40%", "breakdown", or empty while it simply plays. */
  songLine: string;
  /** Listening but hearing nothing (hooks/useAudioAnalyzer.ts): the dock's dot turns amber and the sound sheet says so. */
  deaf: boolean;
  /*
    The show from the phone: Light Show Night, the paced sequence played like
    the filmed shows (lib/scenePacing.ts), started and stopped from a tile on
    the Play sheet; and how far its scenes follow the song (Follow the Song,
    lib/scenePacing.ts "Following the song"), beside the song's line on the
    Sound sheet, where the thing it follows is named.
  */
  show: {
    running: boolean;
    /** A sequence is loaded and paused: the tile resumes it rather than replacing it. */
    paused: boolean;
    name: string | null;
    /** The running sequence plays its stages as scenes (Pacing up), so the scene wording is true of it. */
    scenes: boolean;
    onToggle: () => void;
  };
  songFollow: number;
  onSongFollow: (v: number) => void;
  /*
    Accent the One (lib/barGrid.ts): the kick's press by its place in the
    bar, on the Sound sheet under Follow the Song, with what the bar grid
    knows printed under it, since the setting waits on that.
  */
  beatAccent: number;
  onBeatAccent: (v: number) => void;
  /**
   * Fingering, on the Press tool's own Amount panel: how far the glass
   * breaks into fingers as it lifts (lib/squish.ts). The desk has it on the
   * Show sheet; on the phone it sits where a finger already is when it
   * presses, so pressing and trying the lift is one reach.
   */
  fingering: number;
  onFingering: (v: number) => void;
  /*
    And the glass under the Press, beside Fingering: Thin Gap (PLAN §18a),
    with which a press pushes the liquid out from under the palm and the
    glass draws it back as it lifts, and Press Lift, how fast the glass
    comes back up and so how fast the liquid returns. The desk has both on
    the settings sheet's Physics; here they sit under the finger that
    presses, so a press, a let go and the speed of the return are one reach.
  */
  thinGap: number;
  onThinGap: (v: number) => void;
  pressLift: number;
  onPressLift: (v: number) => void;
  /**
   * Magnet Size, on the Magnet's own Amount panel (lib/magnetSize.ts): how
   * far the magnet under the finger reaches, a coin to a palm. Beside the
   * pull, as the desk's Magnet options have it.
   */
  magnetSize: number;
  onMagnetSize: (v: number) => void;
  /**
   * Ben-Day Dots (wgsl/plate.ts benDay): the plate printed as a comic, the
   * Roy look's own control. On the Looks sheet when it opens on a printed
   * plate, because it is part of the look rather than a hand.
   */
  benDay: number;
  onBenDay: (v: number) => void;
  /**
   * Lamp Ground (PLAN 18b): what the dye is seen on, black or the lamp
   * shining up through it. On the Looks sheet, always: it turns a look
   * over, and a thumb on the phone picks the ground as it picks the look.
   */
  lampGround: number;
  onLampGround: (v: number) => void;
  /**
   * Clear Film (PLAN §20b): a clear oil film over the dish that tears into
   * lace. On the Dye sheet, under the bottles, because it is a liquid
   * poured: the Oil and Alcohol bottles then thicken it and punch holes in it.
   */
  clearFilm: number;
  onClearFilm: (v: number) => void;
  barLine: string;
  /*
    The mixer (lib/mixer.ts): the same panel the desk and the settings sheet
    draw, at the phone's sizes, so the order and the grades are one thumb
    away like everything else here.
  */
  mixer: { settings: VisualizerSettings; onSetting: (patch: Partial<VisualizerSettings>) => void; hasFilm: boolean; hasMark: boolean; takes?: MixTakes; backLook?: string | null };
  // The rest
  onSettings: () => void;
  onSongs: () => void;
  onGuide: () => void;
  recording: { supported: boolean; on: boolean; seconds: number; onToggle: () => void };
  onHide: () => void;
  onFullLayout: () => void;
}

/** A sheet from the bottom: over the lower part of the plate, gone with a tap above it. */
function PhoneSheet({ title, onClose, children, testId }: { title: string; onClose: () => void; children: ReactNode; testId: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    // pointer-events-auto: the stage around it is click-through so the plate
    // under it takes fingers, and a sheet inherited that and took none.
    <div className="pointer-events-auto fixed inset-0 z-[55] flex flex-col justify-end" data-testid={testId}>
      <button className="min-h-0 flex-1 bg-black/30" aria-label="Close" onClick={onClose} data-testid="phone-sheet-scrim" />
      <div
        className="mx-auto flex max-h-[72dvh] w-full max-w-[560px] flex-col rounded-t-xl border border-b-0 border-border-strong bg-surface/95 backdrop-blur-xl landscape:max-h-[88dvh]"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between px-4 pt-2">
          <span className="text-[15px] font-medium text-text">{title}</span>
          <button onClick={onClose} className="-mr-2 flex h-12 w-12 items-center justify-center rounded-full text-muted active:bg-active" aria-label={`Close ${title}`}>
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2">{children}</div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="mb-2 mt-4 text-[12px] font-medium uppercase tracking-[0.12em] text-dim first:mt-1">{children}</div>;
}

/** A square button for a sheet's grid: icon over a word, 64 tall. */
function Tile({ icon: Icon, label, on = false, onPress, testId, tone }: {
  icon: ComponentType<{ size?: number }>; label: string; on?: boolean; onPress: () => void; testId?: string; tone?: 'live';
}) {
  return (
    <button
      onClick={onPress}
      aria-pressed={on}
      data-testid={testId}
      className={`flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-lg border text-[13px] transition-colors active:scale-[0.97] ${
        tone === 'live' && on ? 'border-live-border bg-live-bg text-live'
          : on ? 'border-accent-border bg-accent-bg text-accent-text'
          : 'border-border bg-elevated text-text-2 active:bg-active'
      }`}
    >
      <Icon size={20} />
      <span>{label}</span>
    </button>
  );
}

export function PhoneStage(p: PhoneStageProps) {
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [amountOpen, setAmountOpen] = useState(false);
  // Whether the Looks sheet opened on a printed plate: its Ben-Day slider
  // stays for as long as the sheet is up, so taking it to 0 does not take
  // the slider away from under the thumb.
  const [printing, setPrinting] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);
  const close = () => setSheet(null);
  /** Where a look picked in the looks sheet goes: the whole plate, or the back plate alone. */
  const [lookTo, setLookTo] = useState<'all' | 'back'>('all');
  const open = (s: SheetName) => { setAmountOpen(false); if (s === 'looks') setPrinting(p.benDay > 0.001); setSheet(cur => (cur === s ? null : s)); };
  const liquid = p.liquids.find(l => l.id === p.selectedLiquidId);
  const zoomed = p.zoom > 1.05;

  /*
    The camera's hint, for a few seconds after the closeup comes in: the one
    gesture here nobody would guess, and the one that stops two fingers
    painting, which they do everywhere else.
  */
  const [zoomHint, setZoomHint] = useState(false);
  useEffect(() => {
    if (!zoomed) { setZoomHint(false); return; }
    setZoomHint(true);
    const t = setTimeout(() => setZoomHint(false), 4000);
    return () => clearTimeout(t);
  }, [zoomed]);

  const groups = [...new Set(p.looks.map(l => l.group))];

  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex flex-col justify-between" data-testid="phone-stage">
      {/* ── Along the top: the look, and the three things a thumb reaches for mid-show ── */}
      {/*
        The row itself lets touches through to the plate; only its two
        buttons take them. The row was a full-width band of touch, so a
        finger anywhere across the top 65 px between the look and the three
        buttons landed on nothing: 12% of a 667×375 plate, measured by
        `npm run phone`'s plate share, which read 50% there with the
        two-row dock until the band went.
      */}
      <div className="pointer-events-none flex items-start justify-between gap-2 px-3" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
        <button
          onClick={() => open('looks')}
          className="pointer-events-auto flex h-12 min-w-0 max-w-[60%] items-center gap-2 rounded-full border border-border-strong bg-black/55 pl-1.5 pr-3 backdrop-blur-xl active:bg-black/70"
          data-testid="phone-look-button"
          aria-label="Choose a look"
        >
          <span className="h-9 w-9 shrink-0 rounded-full border border-white/20" style={{ background: p.lookSwatch }} />
          <span className="truncate text-[14px] font-medium text-text">{p.lookName ?? 'Custom'}</span>
          <ChevronDown size={16} className="shrink-0 text-muted" />
        </button>
        <div className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-full border border-border-strong bg-black/55 p-0.5 backdrop-blur-xl">
          <button
            onClick={p.onZoom}
            aria-pressed={zoomed}
            aria-label={zoomed ? 'Leave the closeup' : 'Closeup'}
            data-testid="phone-zoom"
            className={`flex h-12 w-12 items-center justify-center rounded-full ${zoomed ? 'bg-accent-bg text-accent-text' : 'text-text-2 active:bg-active'}`}
          >
            <Microscope size={20} />
          </button>
          <button
            onClick={p.onPlay}
            aria-label={p.playing ? 'Pause the plate' : 'Play the plate'}
            data-testid="phone-play"
            className={`flex h-12 w-12 items-center justify-center rounded-full ${p.playing ? 'text-text-2 active:bg-active' : 'bg-primary text-on-primary'}`}
          >
            {p.playing ? <Pause size={20} /> : <Play size={20} fill="currentColor" />}
          </button>
          <button
            onClick={p.onHide}
            aria-label="Clean screen: hide everything. Hold a finger still on the plate to bring it back."
            data-testid="phone-hide"
            className="flex h-12 w-12 items-center justify-center rounded-full text-text-2 active:bg-active"
          >
            <EyeOff size={20} />
          </button>
        </div>
      </div>

      {zoomed && (
        <div className="pointer-events-auto mx-auto mt-2 flex flex-col items-center gap-2" data-testid="phone-camera">
          <div className="flex rounded-full border border-border-strong bg-black/55 p-0.5 backdrop-blur-xl">
            {(['hold', 'follow', 'auto'] as const).map(c => (
              <button
                key={c}
                onClick={() => p.onCamera(c)}
                aria-pressed={p.camera === c}
                data-testid={`phone-camera-${c}`}
                className={`h-10 min-w-[64px] rounded-full px-3 text-[13px] capitalize ${p.camera === c ? 'bg-accent-bg text-accent-text' : 'text-text-2'}`}
              >
                {c}
              </button>
            ))}
          </div>
          {zoomHint && (
            <span className="rounded-full bg-black/60 px-3 py-1.5 text-[12px] text-text-2 backdrop-blur-xl">
              Pinch to zoom · two fingers move the camera
            </span>
          )}
        </div>
      )}

      <div className="flex-1" />

      {/* ── The tool's Amount, when its button is tapped again ── */}
      {amountOpen && (
        <div className="pointer-events-auto mx-3 mb-2 rounded-xl border border-border-strong bg-surface/90 px-4 pt-3 backdrop-blur-xl" data-testid="phone-amount">
          <Slider
            label={`${TOOLS.find(t => t.id === p.tool)?.label ?? ''} · ${TOOL_AMOUNT_MEANS[p.tool] ?? 'amount'}`}
            value={p.amount}
            min={TOOL_AMOUNT.min}
            max={TOOL_AMOUNT.max}
            step={TOOL_AMOUNT.step}
            onChange={p.onAmount}
            display={`${p.amount.toFixed(1)}×`}
            touch
            testId="phone-amount-slider"
          />
          {/*
            The Press's three under its Amount: one under another in portrait,
            side by side in landscape, where four rows pushed the dock off the
            bottom of a phone held sideways (npm run phone).
          */}
          {p.tool === 'press' && (
            <div className="grid landscape:grid-cols-3 landscape:gap-x-3">
            <Slider
              label="Press · fingers as it lifts"
              value={p.fingering}
              min={0}
              max={1}
              step={0.01}
              onChange={p.onFingering}
              display={`${Math.round(p.fingering * 100)}%`}
              touch
              testId="phone-press-fingering"
              midiKey="setting:fingering"
            />
            <Slider
              label="Press · thin gap"
              value={p.thinGap}
              min={0}
              max={1}
              step={1}
              onChange={p.onThinGap}
              display={p.thinGap > 0.5 ? 'On' : 'Off'}
              touch
              testId="phone-press-thin"
              midiKey="setting:thinGap"
            />
            <Slider
              label="Press · glass lifts"
              value={p.pressLift}
              min={0}
              max={1}
              step={0.05}
              onChange={p.onPressLift}
              display={`${Math.round(p.pressLift * 100)}%`}
              touch
              testId="phone-press-lift"
              midiKey="setting:plateSpring"
            />
            </div>
          )}
          {p.tool === 'magnet' && (
            <Slider
              label="Magnet · size"
              value={p.magnetSize}
              min={0}
              max={1}
              step={0.05}
              onChange={p.onMagnetSize}
              display={`${Math.round(p.magnetSize * 100)}%`}
              touch
              testId="phone-magnet-size"
              midiKey="setting:magnetSize"
            />
          )}
        </div>
      )}

      {/*
        The dock. All nine tools in view at once, never scrolled: the first
        draft put them in one sliding row and three of the nine (Press,
        Finger, Magnet) were off the edge of a 390-pixel phone with nothing
        saying they were there. Five across in portrait, with the bottle in
        hand as the tenth; all ten and the sheets on one row in landscape,
        where height is what the plate is short of. One row only where it
        fits (wide-land, 800 px and up, in index.css): the ten tools share
        what the sheets' 264 px leave, 42 px each on a 740 px phone and 35
        on a 667, under a thumb's 48. Narrower, the ten tools take a row of
        their own (61 px each at 667) and the sheets the row under it. In
        landscape every row is the 48 px a thumb needs and no more, and the
        gaps are 4 px, since the second row costs the plate its height.

        Spin made it ten tools and the bottle (PLAN §22): six across in
        portrait, still two rows (59 px each at 390), and all eleven in a
        landscape row (55 px at 667). Beside the sheets they were 43 px at
        800 wide and 47 on an 844 phone, so the side-by-side row now starts
        at 860 (index.css), where all eleven have their 48.
      */}
      <div
        className="pointer-events-auto flex flex-col gap-1.5 landscape:gap-1 border-t border-border bg-black/55 px-2 pt-1.5 backdrop-blur-xl wide-land:flex-row wide-land:items-center"
        style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}
        data-testid="phone-dock"
      >
        <div className="grid min-w-0 flex-1 grid-cols-6 gap-1 landscape:grid-cols-11" data-testid="phone-tools">
          {TOOLS.map(({ id, label, icon: Icon }) => {
            const on = p.tool === id;
            return (
              <button
                key={id}
                onClick={() => {
                  // Tapping the tool already in hand opens its Amount: the
                  // strength a mouse cannot give, one tap from the tool.
                  if (on) { setAmountOpen(v => !v); setSheet(null); return; }
                  p.onTool(id);
                  setAmountOpen(false);
                }}
                aria-pressed={on}
                aria-label={on ? `${label}, in hand. Tap again for its amount` : label}
                data-testid={`phone-tool-${id}`}
                className={`relative flex h-[52px] min-w-0 flex-col landscape:h-12 items-center justify-center gap-0.5 rounded-lg border text-[12px] ${
                  on ? 'border-accent-border bg-accent-bg text-accent-text' : 'border-transparent text-text-2 active:bg-active'
                }`}
              >
                <Icon size={20} />
                <span>{label}</span>
                {on && Math.abs(p.amount - 1) > 0.01 && (
                  <span className="absolute right-0.5 top-0.5 rounded-xs bg-black/60 px-1 font-mono text-[11px] text-text">{p.amount.toFixed(1)}</span>
                )}
              </button>
            );
          })}
          <button
            onClick={() => open('dye')}
            aria-pressed={sheet === 'dye'}
            aria-label={`Dye: ${liquid?.name ?? 'none'}. Choose a bottle and its colour`}
            data-testid="phone-open-dye"
            className={`flex h-[52px] min-w-0 flex-col landscape:h-12 items-center justify-center gap-0.5 rounded-lg border text-[12px] ${sheet === 'dye' ? 'border-border-strong bg-active text-text' : 'border-transparent text-text-2 active:bg-active'}`}
          >
            <span className="h-5 w-5 rounded-full border-2 border-white/40" style={liquid ? bottleSwatch(liquid) : { backgroundColor: '#fff' }} />
            <span className="max-w-full truncate px-0.5">{liquid?.name ?? 'Dye'}</span>
          </button>
        </div>
        <div className="grid shrink-0 grid-cols-5 gap-1 border-t border-border pt-1.5 landscape:pt-1 wide-land:w-[264px] wide-land:border-l wide-land:border-t-0 wide-land:pl-1.5 wide-land:pt-0">
          {([
            ['looks', 'Looks', Palette],
            ['sound', 'Sound', Music],
            ['play', 'Play', Waves],
            ['mix', 'Mix', SlidersVertical],
            ['more', 'More', MoreHorizontal],
          ] as const).map(([name, label, Icon]) => (
            <button
              key={name}
              onClick={() => open(name)}
              aria-pressed={sheet === name}
              data-testid={`phone-open-${name}`}
              className={`relative flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[12px] ${sheet === name ? 'bg-active text-text' : 'text-text-2 active:bg-active'}`}
            >
              <Icon size={18} />
              <span>{label}</span>
              {name === 'play' && (p.evolving || p.tilt.on) && <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />}
              {name === 'sound' && p.audioSource !== 'none' && <span className={`absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full ${p.deaf ? 'bg-warn' : 'bg-ok'}`} data-testid="phone-sound-dot" data-deaf={p.deaf ? 'true' : undefined} />}
              {name === 'more' && p.recording.on && <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-live" />}
            </button>
          ))}
        </div>
      </div>

      {/* ── The sheets ── */}
      {sheet === 'dye' && (
        <PhoneSheet title="Dye" onClose={close} testId="phone-sheet-dye">
          {([
            ['Dye', p.liquids.filter(l => !l.behaviour)],
            ['Changes the plate', p.liquids.filter(l => l.behaviour)],
          ] as const).map(([label, group]) => group.length === 0 ? null : (
            <div key={label}>
              <SectionLabel>{label}</SectionLabel>
              <div className="grid grid-cols-2 gap-1.5">
                {group.map(l => {
                  const on = l.id === p.selectedLiquidId;
                  return (
                    <button
                      key={l.id}
                      onClick={() => { p.onLiquid(l.id); p.onTool('dropper'); }}
                      aria-pressed={on}
                      data-testid={`phone-liquid-${l.id}`}
                      className={`flex h-12 items-center gap-2.5 rounded-lg border px-3 text-left text-[14px] ${on ? 'text-text' : 'border-border bg-elevated text-text-2'}`}
                      style={on ? { borderColor: l.color, backgroundColor: `${l.color}26` } : undefined}
                    >
                      <span className="h-5 w-5 shrink-0 rounded-full border-2 border-white/30" style={bottleSwatch(l)} />
                      <span className="truncate">{l.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {liquid?.description && <p className="mt-2 text-[13px] leading-snug text-muted" data-testid="phone-liquid-description">{liquid.description}</p>}

          <div className="mt-3">
            <Slider label="Clear Film" value={p.clearFilm} min={0} max={1} step={0.05} onChange={p.onClearFilm}
              display={`${Math.round(p.clearFilm * 100)}%`} touch testId="phone-clear-film" midiKey="setting:clearFilm" />
            <p className="-mt-3 text-[12px] leading-snug text-dim">A clear film over the colour that tears into lace. Alcohol opens holes in it, oil thickens it. White on the Lamp Ground.</p>
          </div>

          <SectionLabel>{liquid ? `${liquid.name}'s colour` : 'Colour'}</SectionLabel>
          {/*
            The bottle's own colour with no dye in it (lib/liquidColour.ts),
            as on the desk: what it pours until a dye is picked.
          */}
          {liquid?.own && (
            <button
              onClick={() => p.onDyeColor(liquid.own!)}
              aria-pressed={isNatural(liquid)}
              data-testid="phone-dye-natural"
              className={`mb-2 flex h-12 w-full items-center gap-2.5 rounded-lg border px-3 text-left text-[14px] ${isNatural(liquid) ? 'border-white text-text' : 'border-border bg-elevated text-text-2'}`}
            >
              <span
                className="h-5 w-5 shrink-0 rounded-full border-2 border-dashed border-white/40"
                style={isClearLiquid(liquid) ? { backgroundColor: 'transparent' } : { backgroundColor: liquid.own }}
              />
              Natural · {isClearLiquid(liquid) ? 'clear, no dye' : 'its own colour, no dye'}
            </button>
          )}
          <div className="grid grid-cols-6 gap-2">
            {p.dyeColors.map(hex => {
              const on = !isNatural(liquid) && liquid?.color.toLowerCase() === hex.toLowerCase();
              return (
                <button
                  key={hex}
                  onClick={() => p.onDyeColor(hex)}
                  aria-label={`Colour ${hex}`}
                  aria-pressed={on}
                  className={`aspect-square min-h-[44px] rounded-full border-2 ${on ? 'border-white' : 'border-white/15'}`}
                  style={{ backgroundColor: hex }}
                />
              );
            })}
          </div>

          <SectionLabel>Palette</SectionLabel>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => p.onPalette(null)}
              aria-pressed={p.paletteLock == null}
              className={`h-12 shrink-0 rounded-lg border px-4 text-[13px] ${p.paletteLock == null ? 'border-accent-border bg-accent-bg text-accent-text' : 'border-border bg-elevated text-text-2'}`}
            >
              Auto
            </button>
            {p.palettes.map((pal, i) => (
              <button
                key={pal.name}
                onClick={() => p.onPalette(i)}
                aria-pressed={p.paletteLock === i}
                className={`flex h-12 shrink-0 items-center gap-2 rounded-lg border px-3 text-[13px] ${p.paletteLock === i ? 'border-accent-border bg-accent-bg text-accent-text' : 'border-border bg-elevated text-text-2'}`}
              >
                <span className="flex">
                  {pal.colors.slice(0, 4).map((c, j) => <span key={j} className="-ml-1 h-4 w-4 rounded-full border border-black/40 first:ml-0" style={{ backgroundColor: c }} />)}
                </span>
                <span className="whitespace-nowrap">{pal.name}</span>
              </button>
            ))}
          </div>

          <button
            onClick={() => { p.onImageDye(); close(); }}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-border bg-elevated text-[14px] text-text-2"
          >
            <ImagePlus size={18} /> A photo as dye
          </button>
        </PhoneSheet>
      )}

      {sheet === 'looks' && (
        <PhoneSheet title="Looks" onClose={close} testId="phone-sheet-looks">
          <div className={`grid gap-1.5 ${p.onRevert ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <Tile icon={Shuffle} label="Surprise me" onPress={() => { p.onRandomLook(); close(); }} testId="phone-random-look" />
            {p.onRevert && <Tile icon={Undo2} label="The last look" onPress={() => { p.onRevert?.(); close(); }} testId="phone-revert" />}
          </div>
          <div className="mt-3">
            <Slider label="Lamp Ground" value={p.lampGround} min={0} max={1} step={0.05} onChange={p.onLampGround}
              display={`${Math.round(p.lampGround * 100)}%`} touch testId="phone-lamp-ground" midiKey="setting:lampGround" />
            <p className="-mt-3 text-[12px] leading-snug text-dim">Black, or the lamp shining up through the dye: clear liquid white, deep dye dark.</p>
          </div>
          {(printing || p.benDay > 0.001) && (
            <div className="mt-3">
              <Slider label="Ben-Day Dots" value={p.benDay} min={0} max={1} step={0.05} onChange={p.onBenDay}
                display={`${Math.round(p.benDay * 100)}%`} touch testId="phone-ben-day" midiKey="setting:benDay" />
              <p className="-mt-3 text-[12px] leading-snug text-dim">The plate printed as a comic: flat inks, black lines, the pale washes in dots.</p>
            </div>
          )}
          {p.onBackLook && (
            <div className="mt-3">
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-1" role="group" aria-label="Send a look to">
                {([['all', 'Whole plate'], ['back', 'Back plate']] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setLookTo(v)}
                    aria-pressed={lookTo === v}
                    data-testid={`phone-send-to-${v}`}
                    className={`h-10 rounded-md text-[14px] ${lookTo === v ? 'bg-accent-bg text-accent-text' : 'text-muted active:bg-active'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-1 flex min-h-[40px] items-center justify-between gap-2">
                <span className="truncate text-[12px] text-dim" data-testid="phone-back-plate-on">Back plate: {p.backLook ?? 'follows the front'}</span>
                {p.backLook && (
                  <button
                    onClick={() => { p.onBackFollowsFront?.(); setLookTo('all'); }}
                    data-testid="phone-back-follows-front"
                    className="h-10 shrink-0 rounded-md border border-border px-3 text-[13px] text-text-2 active:bg-active"
                  >
                    Follow front
                  </button>
                )}
              </div>
            </div>
          )}
          {groups.map(g => (
            <div key={g}>
              <SectionLabel>{g}</SectionLabel>
              <div className="flex flex-col gap-1">
                {p.looks.filter(l => l.group === g).map(l => {
                  const on = l.id === p.activeLookId;
                  return (
                    <button
                      key={l.id}
                      onClick={() => {
                        // The switch is for one look: it goes back to Whole plate
                        // once that look is sent, so a pick an hour later is not
                        // sent to the back plate by a switch nobody remembers.
                        if (lookTo === 'back' && p.onBackLook) { p.onBackLook(l.id); setLookTo('all'); }
                        else p.onLook(l.id);
                        close();
                      }}
                      aria-pressed={on}
                      data-testid={`phone-look-${l.id}`}
                      className={`flex min-h-[56px] items-center gap-3 rounded-lg border px-2 text-left ${on ? 'border-accent-border bg-accent-bg' : 'border-transparent active:bg-active'}`}
                    >
                      <span className="h-10 w-10 shrink-0 rounded-md border border-white/10" style={{ background: l.swatch }} />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[14px] ${on ? 'text-accent-text' : 'text-text'}`}>{l.name}</span>
                        {l.description && <span className="block truncate text-[12px] text-dim">{l.description}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </PhoneSheet>
      )}

      {sheet === 'sound' && (
        <PhoneSheet title="Sound" onClose={close} testId="phone-sheet-sound">
          <p className="mb-3 text-[13px] leading-snug text-muted">What the plate listens to. It moves with whatever is playing.</p>
          <div className="grid grid-cols-2 gap-1.5">
            <Tile icon={Mic} label="Microphone" on={p.audioSource === 'microphone'} onPress={() => p.onAudioSource(p.audioSource === 'microphone' ? 'none' : 'microphone')} testId="phone-sound-mic" />
            <Tile icon={Music} label="Band" on={p.audioSource === 'simulated'} onPress={() => p.onAudioSource(p.audioSource === 'simulated' ? 'none' : 'simulated')} testId="phone-sound-band" />
            <Tile icon={Waves} label="The shelf" on={shelfOpen || !!(p.nowPlaying?.src)} onPress={() => setShelfOpen(v => !v)} testId="phone-sound-shelf" />
            <Tile icon={FileAudio} label="A song file" on={p.audioSource === 'file' && !p.nowPlaying?.src} onPress={() => { p.onMusicFile(); }} testId="phone-sound-file" />
          </div>
          {p.nowPlaying && (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-elevated p-2" data-testid="phone-now-playing">
              <button onClick={p.onToggleMusic} aria-label={p.musicPlaying ? 'Pause the music' : 'Play the music'} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
                {p.musicPlaying ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
              </button>
              <span className="min-w-0 flex-1 truncate text-[14px] text-text">{p.nowPlaying.name}</span>
            </div>
          )}
          {shelfOpen && (
            <div className="mt-2 flex flex-col gap-1" data-testid="phone-shelf">
              {p.tracks.map(t => (
                <button
                  key={t.src}
                  onClick={() => p.onTrack(t)}
                  aria-pressed={p.nowPlaying?.src === t.src}
                  className={`flex min-h-[52px] flex-col justify-center rounded-lg px-3 text-left ${p.nowPlaying?.src === t.src ? 'bg-accent-bg' : 'active:bg-active'}`}
                >
                  <span className={`text-[14px] ${p.nowPlaying?.src === t.src ? 'text-accent-text' : 'text-text'}`}>{t.title}</span>
                  <span className="text-[12px] text-dim">{t.artist} · {t.licence}</span>
                </button>
              ))}
            </div>
          )}
          {/*
            What the show hears of the song's shape, the same word the desk's
            status line carries: its builds, drops and breakdowns, live. Only
            while something is being listened to, since with no sound there is
            no song to have a shape.
          */}
          {p.audioSource !== 'none' && p.deaf && (
            <p className="mt-3 text-[13px] leading-snug text-warn" role="status" data-testid="phone-sound-deaf">
              Not hearing anything: the sound has stopped arriving. Tap the plate to wake it, or pick the source again.
            </p>
          )}
          {p.audioSource !== 'none' && (
            <p className="mt-3 text-[13px] leading-snug text-muted" data-testid="phone-song-shape">
              {p.songLine ? <>The song: <span className="text-text">{p.songLine}</span></> : 'Listening for builds, drops and breakdowns.'}
            </p>
          )}
          {p.audioSource !== 'none' && (
            <div className={`mt-3 transition-opacity ${p.show.running ? '' : 'opacity-50'}`}>
              <Slider label="Follow the song" value={p.songFollow} min={0} max={1} step={0.01} onChange={p.onSongFollow}
                display={`${Math.round(p.songFollow * 100)}%`} touch testId="phone-song-follow" midiKey="setting:songFollow" />
              <p className="-mt-3 text-[12px] leading-snug text-dim" data-testid="phone-song-follow-says">
                {p.show.running
                  ? 'The show holds still through a build and throws its big move on the drop.'
                  : 'Moves a light show with the song: start one from Play.'}
              </p>
            </div>
          )}
          {p.audioSource !== 'none' && (
            <div className="mt-3">
              <Slider label="Accent the one" value={p.beatAccent} min={0} max={1} step={0.01} onChange={p.onBeatAccent}
                display={`${Math.round(p.beatAccent * 100)}%`} touch testId="phone-beat-accent" midiKey="setting:beatAccent" />
              <p className="-mt-3 text-[12px] leading-snug text-dim" data-testid="phone-beat-accent-says">
                {p.barLine ? `${p.barLine}.` : 'Listening for the beat.'}
              </p>
            </div>
          )}
          <div className="mt-4">
            <Slider label="Sound Drive" value={p.soundDrive} min={0} max={1} step={0.01} onChange={p.onSoundDrive}
              display={`${Math.round(p.soundDrive * 100)}%`} touch testId="phone-sound-drive" midiKey="setting:audioImpact" />
          </div>
        </PhoneSheet>
      )}

      {sheet === 'play' && (
        <PhoneSheet title="Play" onClose={close} testId="phone-sheet-play">
          <div className="grid grid-cols-2 gap-1.5">
            <Tile icon={Hourglass} label={p.evolving ? 'Evolving' : 'Evolve'} on={p.evolving} onPress={() => p.onEvolve(!p.evolving)} testId="phone-evolve" />
            <Tile icon={Lightbulb} label={p.show.running ? 'Stop the show' : p.show.paused ? 'Resume' : 'Light show'} on={p.show.running} onPress={p.show.onToggle} testId="phone-show" />
            {p.tilt.supported && (
              <Tile icon={Smartphone} label={p.tilt.on ? 'Tilting' : 'Tilt'} on={p.tilt.on} onPress={p.tilt.onToggle} testId="phone-tilt" />
            )}
          </div>
          {(p.show.running || p.show.paused) && (
            <p className="mt-2 text-[13px] leading-snug text-muted" data-testid="phone-show-says">
              {p.show.paused ? `${p.show.name ?? 'The show'} is paused.` : `Playing ${p.show.name ?? 'a show'}${p.show.scenes ? ': a scene every twenty-odd seconds, the light going down between them.' : '.'}`}
            </p>
          )}
          {p.tilt.on && <p className="mt-2 text-[13px] leading-snug text-muted">Tip the phone and the liquid runs downhill. The way you held it when you turned this on is level.</p>}
          {p.tilt.silent && !p.tilt.on && <p className="mt-2 text-[13px] leading-snug text-warn">No motion sensor answered, so Tilt is off. It needs a phone or a tablet.</p>}
          {p.tilt.refused && !p.tilt.on && <p className="mt-2 text-[13px] leading-snug text-warn">The phone said no to its motion sensor. Settings → Safari → Motion &amp; Orientation Access turns it back on.</p>}
          <div className={`mt-4 transition-opacity ${p.evolving ? '' : 'opacity-50'}`}>
            <Slider label="Evolve speed" value={p.evolveSpeed} min={0} max={1} step={0.01} onChange={p.onEvolveSpeed}
              display={`${Math.round(p.evolveSpeed * 100)}%`} touch testId="phone-evolve-speed" midiKey="setting:automateRate" />
          </div>
          {/*
            The plates, on every look. This section was here only on a look
            with two, as a picker, so the phone could neither give a look a
            back plate nor take one off (the owner reported the desk's half of
            the same gap). Now it is always here: the picker when there are
            two, with a button beside it that takes the back one off, and on a
            one-plate look a button that adds it.
          */}
          <SectionLabel>{p.layers > 1 ? 'The plate your fingers work' : 'Plates'}</SectionLabel>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: p.layers > 1 ? `repeat(${p.layers}, minmax(0, 1fr)) auto` : '1fr' }}>
            {p.layers > 1 && Array.from({ length: p.layers }).map((_, i) => (
              <button key={i} onClick={() => p.onLayer(i)} aria-pressed={p.activeLayer === i} data-testid={`phone-layer-${i}`}
                className={`h-12 rounded-lg border text-[14px] ${p.activeLayer === i ? 'border-accent-border bg-accent-bg text-accent-text' : 'border-border bg-elevated text-text-2'}`}>
                {i === 0 ? 'Front' : i === 1 ? 'Back' : `Layer ${i + 1}`}
              </button>
            ))}
            {p.layers > 1 ? (
              <button onClick={p.onRemoveLayer} disabled={!p.onRemoveLayer} data-testid="phone-remove-layer"
                className="h-12 rounded-lg border border-border bg-elevated px-4 text-[14px] text-text-2 disabled:opacity-60">
                {p.onRemoveLayer ? 'Take off back' : 'Back has a look'}
              </button>
            ) : (
              <button onClick={p.onAddLayer} data-testid="phone-add-layer"
                className="h-12 rounded-lg border border-border bg-elevated px-4 text-left text-[14px] text-text-2">
                + Add a back plate
              </button>
            )}
          </div>
          <SectionLabel>Turn the dish by itself</SectionLabel>
          <div className="grid grid-cols-3 gap-1.5" data-testid="phone-spin-auto">
            {(['Off', 'Rate', 'Tempo'] as const).map((name, mode) => (
              <button key={name} onClick={() => p.spin.onChange({ spinAuto: mode })} aria-pressed={Math.round(p.spin.auto) === mode}
                data-testid={`phone-spin-auto-${name.toLowerCase()}`}
                className={`h-12 rounded-lg border text-[14px] ${Math.round(p.spin.auto) === mode ? 'border-accent-border bg-accent-bg text-accent-text' : 'border-border bg-elevated text-text-2'}`}>
                {name}
              </button>
            ))}
          </div>
          <div className={`mt-3 transition-opacity ${Math.round(p.spin.auto) === 0 ? 'opacity-50' : ''}`}>
            <Slider label="Spin rate" value={p.spin.rpm} min={-SPIN_RPM_MAX} max={SPIN_RPM_MAX} step={0.5} onChange={(v) => p.spin.onChange({ spinRpm: v })}
              display={`${p.spin.rpm.toFixed(1)} rpm`} touch testId="phone-spin-rate" midiKey="setting:spinRpm" />
            {Math.round(p.spin.auto) === 2 && (
              <Slider label="Beats a turn" value={p.spin.beats} min={SPIN_BEATS_RANGE[0]} max={SPIN_BEATS_RANGE[1]} step={1}
                onChange={(v) => p.spin.onChange({ spinBeats: Math.round(v) })}
                display={`${Math.round(p.spin.beats)}`} touch testId="phone-spin-beats" midiKey="setting:spinBeats" />
            )}
            <button onClick={() => p.spin.onChange({ spinRpm: -p.spin.rpm })} data-testid="phone-spin-reverse"
              className="mt-1 h-12 w-full rounded-lg border border-border bg-elevated text-[14px] text-text-2 active:bg-active">
              Reverse
            </button>
          </div>
          <SectionLabel>Do something to it</SectionLabel>
          <div className="grid grid-cols-4 gap-1.5">
            <Tile icon={RotateCw} label="Flick" onPress={p.onSpin} testId="phone-spin" />
            <Tile icon={Shuffle} label="Random" onPress={() => { p.onLucky(); close(); }} testId="phone-lucky" />
            <Tile icon={Waves} label="Drain" onPress={() => { p.onDrain(); close(); }} testId="phone-drain" />
            <Tile icon={Trash2} label="Clear" onPress={() => { p.onClear(); close(); }} testId="phone-clear" />
          </div>
        </PhoneSheet>
      )}

      {sheet === 'mix' && (
        <PhoneSheet title="Mixer" onClose={close} testId="phone-sheet-mix">
          <MixerPanel
            settings={p.mixer.settings}
            onSetting={p.mixer.onSetting}
            hasFilm={p.mixer.hasFilm}
            hasMark={p.mixer.hasMark}
            onFade={p.mixer.takes?.onFade}
            fading={p.mixer.takes?.fading}
            backLook={p.mixer.backLook}
            touch
            testId="phone-mixer"
          />
        </PhoneSheet>
      )}

      {sheet === 'more' && (
        <PhoneSheet title="More" onClose={close} testId="phone-sheet-more">
          <div className="grid grid-cols-3 gap-1.5">
            {p.recording.supported && (
              <Tile
                icon={p.recording.on ? Square : Circle}
                label={p.recording.on ? `${Math.floor(p.recording.seconds / 60)}:${String(p.recording.seconds % 60).padStart(2, '0')}` : 'Record'}
                on={p.recording.on}
                tone="live"
                onPress={p.recording.onToggle}
                testId="phone-record"
              />
            )}
            <Tile icon={Clapperboard} label="Songs" onPress={() => { close(); p.onSongs(); }} testId="phone-songs" />
            <Tile icon={Settings} label="Settings" onPress={() => { close(); p.onSettings(); }} testId="phone-settings" />
            <Tile icon={BookOpen} label="Guide" onPress={() => { close(); p.onGuide(); }} testId="phone-guide" />
            <Tile icon={Monitor} label="Full layout" onPress={() => { close(); p.onFullLayout(); }} testId="phone-full-layout" />
            {/* The iPhone app's other mode: the remote for a show on the
                laptop. Not on the website, whose https page cannot reach a
                laptop's plain ws:// relay (lib/appLink.ts). */}
            {isPhoneApp() && <Tile icon={Laptop} label="Laptop remote" onPress={() => { close(); goRemote(); }} testId="phone-laptop-remote" />}
          </div>
          <p className="mt-3 text-[12px] leading-snug text-dim">
            Full layout is the laptop's, for the rest of this visit. The phone's comes back next time.
            {isPhoneApp() && ' Laptop remote makes this phone the remote for a show running on the laptop; Play here brings it back.'}
          </p>
        </PhoneSheet>
      )}
    </div>
  );
}
