import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import {
  Droplet, SprayCan, Paintbrush, FlaskConical, Slash, Wind, Hand, Fingerprint, Magnet,
  Play, Pause, Microscope, EyeOff, X, Music, Sparkles, MoreHorizontal, ChevronDown,
  Mic, FileAudio, Settings, Clapperboard, Circle, Square, BookOpen, Monitor, ImagePlus,
  Smartphone, Undo2, Shuffle, RotateCw, Trash2, Waves,
} from 'lucide-react';
import { Slider } from '../ui';
import type { LiquidType } from '../../types';
import { TOOL_AMOUNT, TOOL_AMOUNT_MEANS } from '../../lib/toolAmount';
import type { Track } from '../../lib/musicLibrary';

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
 * controls, and the rest.
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

export type PhoneTool = 'dropper' | 'spray' | 'splatter' | 'pour' | 'streak' | 'blow' | 'press' | 'finger' | 'magnet';

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
];

export interface PhoneLook {
  id: string;
  name: string;
  description?: string;
  group: string;
  swatch: string;
}

type SheetName = 'dye' | 'looks' | 'sound' | 'play' | 'more';
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
  onClear: () => void;
  onDrain: () => void;
  onSpin: () => void;
  onLucky: () => void;
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
  const [shelfOpen, setShelfOpen] = useState(false);
  const close = () => setSheet(null);
  const open = (s: SheetName) => { setAmountOpen(false); setSheet(cur => (cur === s ? null : s)); };
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
      <div className="pointer-events-auto flex items-start justify-between gap-2 px-3" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
        <button
          onClick={() => open('looks')}
          className="flex h-12 min-w-0 max-w-[60%] items-center gap-2 rounded-full border border-border-strong bg-black/55 pl-1.5 pr-3 backdrop-blur-xl active:bg-black/70"
          data-testid="phone-look-button"
          aria-label="Choose a look"
        >
          <span className="h-9 w-9 shrink-0 rounded-full border border-white/20" style={{ background: p.lookSwatch }} />
          <span className="truncate text-[14px] font-medium text-text">{p.lookName ?? 'Custom'}</span>
          <ChevronDown size={16} className="shrink-0 text-muted" />
        </button>
        <div className="flex shrink-0 items-center gap-1 rounded-full border border-border-strong bg-black/55 p-0.5 backdrop-blur-xl">
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
        </div>
      )}

      {/*
        The dock. All nine tools in view at once, never scrolled: the first
        draft put them in one sliding row and three of the nine (Press,
        Finger, Magnet) were off the edge of a 390-pixel phone with nothing
        saying they were there. Five across in portrait, with the bottle in
        hand as the tenth; all ten and the sheets on one row in landscape,
        where height is what the plate is short of.
      */}
      <div
        className="pointer-events-auto flex flex-col gap-1.5 border-t border-border bg-black/55 px-2 pt-1.5 backdrop-blur-xl landscape:flex-row landscape:items-center"
        style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}
        data-testid="phone-dock"
      >
        <div className="grid min-w-0 flex-1 grid-cols-5 gap-1 landscape:grid-cols-10" data-testid="phone-tools">
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
                className={`relative flex h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border text-[12px] ${
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
            className={`flex h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border text-[12px] ${sheet === 'dye' ? 'border-border-strong bg-active text-text' : 'border-transparent text-text-2 active:bg-active'}`}
          >
            <span className="h-5 w-5 rounded-full border-2 border-white/40" style={{ backgroundColor: liquid?.color ?? '#fff' }} />
            <span className="max-w-full truncate px-0.5">{liquid?.name ?? 'Dye'}</span>
          </button>
        </div>
        <div className="grid shrink-0 grid-cols-4 gap-1 border-t border-border pt-1.5 landscape:w-[232px] landscape:border-l landscape:border-t-0 landscape:pl-1.5 landscape:pt-0">
          {([
            ['looks', 'Looks', Sparkles],
            ['sound', 'Sound', Music],
            ['play', 'Play', Waves],
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
              {name === 'sound' && p.audioSource !== 'none' && <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-ok" />}
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
                      <span className="h-5 w-5 shrink-0 rounded-full border-2 border-white/30" style={{ backgroundColor: l.color }} />
                      <span className="truncate">{l.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {liquid?.description && <p className="mt-2 text-[13px] leading-snug text-muted" data-testid="phone-liquid-description">{liquid.description}</p>}

          <SectionLabel>{liquid ? `${liquid.name}'s colour` : 'Colour'}</SectionLabel>
          <div className="grid grid-cols-6 gap-2">
            {p.dyeColors.map(hex => {
              const on = liquid?.color.toLowerCase() === hex.toLowerCase();
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
          {groups.map(g => (
            <div key={g}>
              <SectionLabel>{g}</SectionLabel>
              <div className="flex flex-col gap-1">
                {p.looks.filter(l => l.group === g).map(l => {
                  const on = l.id === p.activeLookId;
                  return (
                    <button
                      key={l.id}
                      onClick={() => { p.onLook(l.id); close(); }}
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
          <div className="mt-4">
            <Slider label="Sound Drive" value={p.soundDrive} min={0} max={1} step={0.01} onChange={p.onSoundDrive}
              display={`${Math.round(p.soundDrive * 100)}%`} touch testId="phone-sound-drive" midiKey="setting:audioImpact" />
          </div>
        </PhoneSheet>
      )}

      {sheet === 'play' && (
        <PhoneSheet title="Play" onClose={close} testId="phone-sheet-play">
          <div className="grid grid-cols-2 gap-1.5">
            <Tile icon={Sparkles} label={p.evolving ? 'Evolving' : 'Evolve'} on={p.evolving} onPress={() => p.onEvolve(!p.evolving)} testId="phone-evolve" />
            {p.tilt.supported && (
              <Tile icon={Smartphone} label={p.tilt.on ? 'Tilting' : 'Tilt'} on={p.tilt.on} onPress={p.tilt.onToggle} testId="phone-tilt" />
            )}
          </div>
          {p.tilt.on && <p className="mt-2 text-[13px] leading-snug text-muted">Tip the phone and the liquid runs downhill. The way you held it when you turned this on is level.</p>}
          {p.tilt.silent && !p.tilt.on && <p className="mt-2 text-[13px] leading-snug text-warn">No motion sensor answered, so Tilt is off. It needs a phone or a tablet.</p>}
          {p.tilt.refused && !p.tilt.on && <p className="mt-2 text-[13px] leading-snug text-warn">The phone said no to its motion sensor. Settings → Safari → Motion &amp; Orientation Access turns it back on.</p>}
          <div className={`mt-4 transition-opacity ${p.evolving ? '' : 'opacity-50'}`}>
            <Slider label="Evolve speed" value={p.evolveSpeed} min={0} max={1} step={0.01} onChange={p.onEvolveSpeed}
              display={`${Math.round(p.evolveSpeed * 100)}%`} touch testId="phone-evolve-speed" midiKey="setting:automateRate" />
          </div>
          {p.layers > 1 && (
            <>
              <SectionLabel>The plate your fingers work</SectionLabel>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${p.layers}, minmax(0, 1fr))` }}>
                {Array.from({ length: p.layers }).map((_, i) => (
                  <button key={i} onClick={() => p.onLayer(i)} aria-pressed={p.activeLayer === i} data-testid={`phone-layer-${i}`}
                    className={`h-12 rounded-lg border text-[14px] ${p.activeLayer === i ? 'border-accent-border bg-accent-bg text-accent-text' : 'border-border bg-elevated text-text-2'}`}>
                    {i === 0 ? 'Front' : i === 1 ? 'Back' : `Layer ${i + 1}`}
                  </button>
                ))}
              </div>
            </>
          )}
          <SectionLabel>Do something to it</SectionLabel>
          <div className="grid grid-cols-4 gap-1.5">
            <Tile icon={RotateCw} label="Spin" onPress={p.onSpin} testId="phone-spin" />
            <Tile icon={Shuffle} label="Random" onPress={() => { p.onLucky(); close(); }} testId="phone-lucky" />
            <Tile icon={Waves} label="Drain" onPress={() => { p.onDrain(); close(); }} testId="phone-drain" />
            <Tile icon={Trash2} label="Clear" onPress={() => { p.onClear(); close(); }} testId="phone-clear" />
          </div>
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
          </div>
          <p className="mt-3 text-[12px] leading-snug text-dim">
            Full layout is the laptop's, for the rest of this visit. The phone's comes back next time.
          </p>
        </PhoneSheet>
      )}
    </div>
  );
}
