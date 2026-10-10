import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, CirclePlus, Shuffle } from 'lucide-react';
import { TouchSlider } from '../ui/TouchSlider';
import type { VisualizerSettings } from '../../types';
import type { PhoneLook, PhoneTool } from './PhoneStage';
import { playHand, HOLD_MS, type PlayHand, type PlayTool } from '../../lib/playGesture';
import { PHONE_SHORT_SIDE } from '../../lib/phone';

/**
 * Play: ChromaGlass on a phone for someone listening, not performing.
 *
 * The owner's Desk v2 design (2026-10-10, screens 3a and 3b), built for the
 * buyers the owner wants beside the VJs: people who put a record on at home
 * and want the plate going with it. The phone layout before this
 * (PhoneStage) is a performer's: ten tools, six sheets, a mixer, a
 * sequencer. Here the plate is the whole screen and the instrument, with
 * what a hand needs at the bottom and nothing in a performer's words:
 *
 *   the top      the look's name (the looks are a tap away), Shuffle, Record
 *   the tray     eight dyes, then Drop, Blow and Press; "All controls" is
 *                the full phone layout, for anyone who wants every tool
 *   the sheet    pulled up from the tray's handle: six sliders (Speed,
 *                Turbulence, Swirl, Soap, Zoom, Evolve), the looks as tiles
 *                to swipe through, Follow the music and Wander on its own,
 *                and Shuffle, Clear plate and Share clip; Save at the top
 *
 * With Drop on the tray a touch picks its own hand, the way a hand reads a
 * dish (lib/playGesture.ts): a tap drops, a drag streaks, two fingers blow,
 * a still hold presses. The hint over the tray says so on the first visits.
 *
 * It is the same app underneath, as PhoneStage is: every control here calls
 * the handler the desks and the full phone layout call, so a look picked or
 * a dye chosen here is the same look or dye everywhere. Nothing is added to
 * the settings.
 *
 * Sizes and glass from the design system's v2 additions: chrome over a live
 * plate is near-black at 72–92% with a blur and a 10% white edge, pills 36
 * tall, the tray's tools 52, the dyes 40, sliders in 44 rows. A pill drawn
 * 36 tall sits in a 48 px button, so the thumb's target is the touch rule's
 * and the picture is the design's.
 */

const GLASS_PILL = 'border border-white/10 bg-[rgba(17,17,19,0.72)] backdrop-blur-[16px]';
const GLASS_TRAY = 'border border-b-0 border-white/10 bg-[rgba(17,17,19,0.84)] backdrop-blur-[20px]';
const GLASS_SHEET = 'border border-b-0 border-white/10 bg-[rgba(17,17,19,0.92)] backdrop-blur-[20px]';

/** How many visits show the gesture hint before the hand is trusted to know it. */
const HINT_VISITS = 3;
const HINT_KEY = 'chromaglass-play-hints';
/*
  Visits, not mounts: counted once a page load. Counted where Play mounts, two
  trips to All controls and back used up all three showings in one visit.
*/
let hintVisitsThisLoad: number | null = null;
const hintVisits = () => {
  if (hintVisitsThisLoad !== null) return hintVisitsThisLoad;
  let n = 0;
  try { n = Number(localStorage.getItem(HINT_KEY) ?? 0) || 0; localStorage.setItem(HINT_KEY, String(n + 1)); } catch { /* private: every visit is a first */ }
  hintVisitsThisLoad = n;
  return n;
};

const TRAY_TOOLS: { id: PlayTool; label: string }[] = [
  { id: 'dropper', label: 'Drop' },
  { id: 'blow', label: 'Blow' },
  { id: 'press', label: 'Press' },
];

export interface PhonePlayProps {
  lookName: string;
  /** The look has been moved since it came in: "edited" by its name. */
  edited: boolean;
  looks: PhoneLook[];
  activeLookId: string | null;
  onLook: (id: string) => void;
  onShuffle: () => void;
  /** Save the plate as a new look under a name, asked for every time (QA-18), as the desks' Save. */
  onSave?: (name: string) => void;
  /** The name the field starts with. */
  saveSuggestion?: string;
  dyes: readonly string[];
  dye: string;
  onDye: (hex: string) => void;
  /** The app's hand: Play sets it from the tray and from the touch itself. */
  onTool: (t: PhoneTool) => void;
  settings: Pick<VisualizerSettings, 'globalSpeed' | 'turbulenceScale' | 'vorticityConfinement' | 'surfactantFlow' | 'automateRate' | 'macroZoom' | 'macroMode'>;
  onSetting: (patch: Partial<VisualizerSettings>) => void;
  onZoom: (z: number) => void;
  listening: boolean;
  deaf: boolean;
  onListen: (on: boolean) => void;
  wandering: boolean;
  onWander: (on: boolean) => void;
  onClear: () => void;
  recording: { supported: boolean; on: boolean; seconds: number; onToggle: () => void; take: { blob: Blob; filename: string; url: string } | null };
  onAllControls: () => void;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** The zoom the plate is drawn at, as LiquidVisualizer's macroZoomOf reads the look (a closeup look with no zoom of its own is at 4). */
const zoomOf = (s: PhonePlayProps['settings']) => {
  const z = s.macroZoom ?? 1;
  return s.macroMode === true ? (z > 1.05 ? z : 4) : Math.max(1, z);
};

/** A 36-tall glass pill in a 48 px target. */
function Pill({ onPress, label, testId, children, pressed }: { onPress: () => void; label: string; testId: string; children: ReactNode; pressed?: boolean }) {
  return (
    <button onClick={onPress} aria-label={label} aria-pressed={pressed} data-testid={testId}
      className="pointer-events-auto flex h-12 min-w-12 items-center justify-center">
      <span className={`flex h-9 min-w-11 items-center justify-center gap-1.5 rounded-[18px] px-3 text-[14px] font-medium text-text ${GLASS_PILL}`}>
        {children}
      </span>
    </button>
  );
}

export function PhonePlay(p: PhonePlayProps) {
  const [sheet, setSheet] = useState(false);
  const [picked, setPicked] = useState<PlayTool>('dropper');
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(false);
  /** The name field, while a save is being named; null when it is not. */
  const [saveName, setSaveName] = useState<string | null>(null);
  const [visits] = useState(hintVisits);

  /*
    The tray's pick is the app's hand as Play opens and whenever it changes:
    coming from the full layout with the Magnet in hand, a tap on Play's
    plate should drop, as its tray says.
  */
  const onToolRef = useRef(p.onTool);
  onToolRef.current = p.onTool;
  const pickedRef = useRef(picked);
  /*
    On a closeup two fingers are the camera (LiquidVisualizer's pinch, from
    the zoom the look asks for), not a breath: the plate drops both hands and
    pinches, so handing it Blow there blew nothing.
  */
  const pinchesRef = useRef(false);
  pinchesRef.current = zoomOf(p.settings) > 1.05;
  useEffect(() => { pickedRef.current = picked; onToolRef.current(picked); }, [picked]);

  /*
    The touch picks the hand (lib/playGesture.ts). Read from the window, not
    the canvas, and only for touches that began on the plate's canvas: the
    plate's own listeners are on the canvas and stay as they are, so a
    finger is the same hand in the solver whichever screen is up, and this
    only says which tool that hand holds. The hold is read by a timer as
    well as on moves, since a finger held still sends no moves.
  */
  useEffect(() => {
    const down = new Map<number, { x0: number; y0: number; t0: number; travel: number }>();
    let hand: PlayHand = pickedRef.current;
    let timer = 0;
    const apply = () => {
      const now = performance.now();
      const next = playHand(pickedRef.current, hand, [...down.values()].map(f => ({ travel: f.travel, ms: now - f.t0 })), pinchesRef.current);
      if (next !== hand) { hand = next; onToolRef.current(next); }
    };
    const onStart = (e: TouchEvent) => {
      if (!(e.target instanceof Element) || e.target.id !== 'liquid-canvas') return;
      const now = performance.now();
      // A new touch starts from the tray's hand, which is the app's at rest.
      if (down.size === 0) hand = pickedRef.current;
      for (const t of Array.from(e.changedTouches)) down.set(t.identifier, { x0: t.clientX, y0: t.clientY, t0: now, travel: 0 });
      setTouched(true);
      apply();
      window.clearTimeout(timer);
      timer = window.setTimeout(apply, HOLD_MS + 10);
    };
    const onMove = (e: TouchEvent) => {
      let any = false;
      for (const t of Array.from(e.changedTouches)) {
        const f = down.get(t.identifier);
        if (!f) continue;
        f.travel = Math.max(f.travel, Math.hypot(t.clientX - f.x0, t.clientY - f.y0));
        any = true;
      }
      if (any) apply();
    };
    const onEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) down.delete(t.identifier);
      if (down.size === 0) window.clearTimeout(timer);
      apply();
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setSaved(false), 1600);
    return () => window.clearTimeout(t);
  }, [saved]);

  // The looks strip opens on the look that is up, not at the start of forty.
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sheet) return;
    /*
      By hand, not scrollIntoView: that scrolled the sheet itself as well, and
      in landscape opened it with the sliders scrolled away above the looks.
    */
    const strip = stripRef.current;
    const tile = strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (strip && tile) strip.scrollLeft = tile.offsetLeft - strip.offsetLeft - (strip.clientWidth - tile.offsetWidth) / 2;
  }, [sheet]);

  /*
    The handle: a tap toggles the sheet, and a swipe on it goes the way the
    thumb went, as a sheet's handle does on every phone.
  */
  const swipe = useRef<number | null>(null);
  const swiped = useRef(false);
  const handle = (
    <button
      aria-label={sheet ? 'Close the controls' : 'More controls'}
      aria-expanded={sheet}
      data-testid="play-handle"
      onClick={() => { if (swiped.current) { swiped.current = false; return; } setSaveName(null); setSheet(v => !v); }}
      // A swipe sends no click to clear the flag, so each touch starts it clear.
      onPointerDown={(e) => { swipe.current = e.clientY; swiped.current = false; }}
      onPointerUp={(e) => {
        const from = swipe.current; swipe.current = null;
        if (from == null || Math.abs(e.clientY - from) < 24) return;
        // The click that follows the lift is the same thumb: not a second toggle.
        swiped.current = true;
        setSheet(e.clientY < from);
      }}
      className="mx-auto flex h-6 w-24 touch-none items-center justify-center"
    >
      <span className="h-1 w-9 rounded-full bg-white/30" />
    </button>
  );

  const take = p.recording.take;
  const shareClip = async () => {
    if (p.recording.on) { p.recording.onToggle(); return; }
    if (!take) { p.recording.onToggle(); return; }
    /*
      The phone's own share sheet where it has one (Messages, Instagram,
      Photos), with the clip as a file; a download where it has not. Called
      from the tap itself: a share sheet opened after an await of anything
      else is refused for want of a user gesture.
    */
    const file = new File([take.blob], take.filename, { type: take.blob.type || 'video/mp4' });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try { await nav.share({ files: [file], title: 'ChromaGlass' }); } catch { /* closed without sharing */ }
      return;
    }
    const a = document.createElement('a');
    a.href = take.url; a.download = take.filename; a.click();
  };
  const clipLabel = p.recording.on ? `Stop · ${clock(p.recording.seconds)}` : take ? 'Share clip' : 'Record a clip';

  /*
    A tablet (its short side past a phone's, lib/phone.ts PHONE_SHORT_SIDE)
    gets the design system's iPad sizes for the same tray, dyes 56 and the
    hands 72, in a wider tray: Play on an iPad at a phone's sizes was a strip
    of small buttons along the bottom of a large plate.
  */
  const [tablet, setTablet] = useState(() => Math.min(window.innerWidth, window.innerHeight) >= PHONE_SHORT_SIDE);
  useEffect(() => {
    const onResize = () => setTablet(Math.min(window.innerWidth, window.innerHeight) >= PHONE_SHORT_SIDE);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const s = p.settings;
  const zoom = zoomOf(s);
  const showHint = !sheet && !touched && picked === 'dropper' && visits < HINT_VISITS;
  const saveNamed = () => {
    const name = saveName?.trim();
    if (!name || !p.onSave) return;
    p.onSave(name);
    setSaveName(null);
    setSaved(true);
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex flex-col justify-between" data-testid="play-screen">
      {/* ── The top: the look, and Shuffle and Record (Save while the sheet is up) ── */}
      <div className="pointer-events-none flex items-start justify-between gap-2 px-3" style={{ paddingTop: 'max(8px, env(safe-area-inset-top))' }}>
        <button
          onClick={() => setSheet(true)}
          aria-label="Choose a look"
          data-testid="play-look"
          className="pointer-events-auto flex h-12 min-w-0 max-w-[65%] items-center"
        >
          <span className={`flex h-9 min-w-0 items-center gap-2 rounded-[18px] pl-3.5 pr-2.5 ${GLASS_PILL}`}>
            <span className="truncate text-[14px] font-medium text-text">{p.lookName}</span>
            {p.edited && <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-medium text-text-2" data-testid="play-edited">edited</span>}
            {!sheet && <ChevronDown size={14} className="shrink-0 text-text-2" />}
          </span>
        </button>
        <div className="pointer-events-none flex shrink-0 items-center gap-1">
          {sheet ? (
            p.onSave && (
              <Pill onPress={() => setSaveName(n => (n === null ? (p.saveSuggestion ?? 'My look') : null))} label="Save this look" testId="play-save" pressed={saveName !== null}>
                {saved ? 'Saved' : 'Save'}
              </Pill>
            )
          ) : (
            <>
              <Pill onPress={p.onShuffle} label="Shuffle the look" testId="play-shuffle"><Shuffle size={18} /></Pill>
              {p.recording.supported && (
                <Pill onPress={p.recording.onToggle} label={p.recording.on ? 'Stop recording' : 'Record a clip'} testId="play-record" pressed={p.recording.on}>
                  <span className={`h-4 w-4 rounded-full border-2 border-[#F87171] ${p.recording.on ? 'bg-[#F87171]' : ''}`} />
                  {p.recording.on && <span className="font-mono text-[12px] text-text">{clock(p.recording.seconds)}</span>}
                </Pill>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── The bottom: the hint, then the tray or the sheet ── */}
      <div className="pointer-events-none flex flex-col items-center">
        {showHint && (
          <div className={`mb-2 rounded-full px-3 py-1 text-[12px] text-text-2 ${GLASS_PILL}`} data-testid="play-hint">
            {zoom > 1.05 ? 'tap drops · drag streaks · pinch zooms · hold presses' : 'tap drops · drag streaks · two fingers blow · hold presses'}
          </div>
        )}
        {!sheet ? (
          <div className={`pointer-events-auto w-full ${tablet ? 'max-w-[720px]' : 'max-w-[560px]'} rounded-t-[24px] px-4 pt-1.5 ${GLASS_TRAY}`}
            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }} data-testid="play-tray">
            {handle}
            <div className="mt-1.5 flex gap-2" role="radiogroup" aria-label="Dye">
              {p.dyes.map(hex => {
                const on = hex.toLowerCase() === p.dye.toLowerCase();
                return (
                  <button key={hex} role="radio" aria-checked={on} aria-label={`Dye ${hex}`} data-testid="play-dye"
                    onClick={() => p.onDye(hex)}
                    className={`${tablet ? 'h-14 rounded-[14px]' : 'h-10 rounded-[12px]'} min-w-0 flex-1`}
                    style={{ background: hex, boxShadow: on ? '0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-text)' : undefined }} />
                );
              })}
            </div>
            <div className="mt-3 flex gap-2">
              {TRAY_TOOLS.map(t => {
                const on = picked === t.id;
                return (
                  <button key={t.id} onClick={() => setPicked(t.id)} aria-pressed={on} data-testid={`play-tool-${t.id}`}
                    className={`${tablet ? 'h-[72px] rounded-[16px] text-[16px]' : 'h-[52px] rounded-[14px] text-[15px]'} min-w-0 flex-1 font-medium transition-colors ${
                      on ? 'bg-primary text-on-primary' : 'border border-white/10 bg-white/[0.04] text-text active:bg-white/10'
                    }`}>
                    {t.label}
                  </button>
                );
              })}
              <button onClick={p.onAllControls} aria-label="All controls" data-testid="play-all-controls"
                className={`flex ${tablet ? 'h-[72px] w-[72px] rounded-[16px]' : 'h-[52px] w-[52px] rounded-[14px]'} shrink-0 items-center justify-center border border-white/10 bg-white/[0.04] text-text active:bg-white/10`}>
                <CirclePlus size={20} />
              </button>
            </div>
          </div>
        ) : (
          <div className={`pointer-events-auto flex max-h-[80dvh] w-full max-w-[560px] flex-col rounded-t-[24px] pt-1.5 landscape:max-h-[90dvh] landscape:max-w-[880px] ${GLASS_SHEET}`}
            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }} data-testid="play-sheet">
            {handle}
            {/*
              In landscape two columns, the sliders beside the looks and the
              buttons: stacked, a phone on its side had the sheet over all of
              the plate and the buttons a scroll below it.
            */}
            {saveName !== null && (
              <form className="flex gap-2 px-4 pb-2" onSubmit={(e) => { e.preventDefault(); saveNamed(); }} data-testid="play-save-form">
                <input
                  autoFocus
                  onFocus={e => e.currentTarget.select()}
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  aria-label="Name for the new look"
                  // 16 px: under it, iOS zooms the page in on focus.
                  className="h-12 min-w-0 flex-1 rounded-[14px] border border-white/10 bg-white/[0.06] px-3 text-[16px] text-text outline-none focus:border-accent"
                  data-testid="play-save-name"
                />
                <button type="submit" disabled={!saveName.trim()} data-testid="play-save-confirm"
                  className="h-12 shrink-0 rounded-[14px] bg-primary px-4 text-[15px] font-medium text-on-primary disabled:opacity-40">Save</button>
              </form>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-1 landscape:grid landscape:grid-cols-2 landscape:content-start landscape:gap-x-6">
              <div>
              <TouchSlider glass label="Speed" setting="globalSpeed" min={0} max={0.3} value={s.globalSpeed ?? 0}
                display={(s.globalSpeed ?? 0) < 0.1 ? (s.globalSpeed ?? 0).toFixed(3) : (s.globalSpeed ?? 0).toFixed(2)} onChange={v => p.onSetting({ globalSpeed: v })} testId="play-slider-speed" />
              <TouchSlider glass label="Turbulence" setting="turbulenceScale" min={0} max={1} value={s.turbulenceScale ?? 0}
                display={pct(s.turbulenceScale ?? 0)} onChange={v => p.onSetting({ turbulenceScale: v })} testId="play-slider-turbulence" />
              <TouchSlider glass label="Swirl" setting="vorticityConfinement" min={0} max={1} value={s.vorticityConfinement ?? 0}
                display={pct(s.vorticityConfinement ?? 0)} onChange={v => p.onSetting({ vorticityConfinement: v })} testId="play-slider-swirl" />
              <TouchSlider glass label="Soap" setting="surfactantFlow" min={0} max={1} value={s.surfactantFlow ?? 0}
                display={pct(s.surfactantFlow ?? 0)} onChange={v => p.onSetting({ surfactantFlow: v })} testId="play-slider-soap" />
              {/* To 8×, not the pinch's 16: past 8 a phone's plate is a few cells across, and the slider's travel is better spent below. */}
              <TouchSlider glass label="Zoom" min={1} max={8} value={Math.min(8, zoom)}
                display={`${zoom.toFixed(1)}×`} onChange={v => p.onZoom(v)} testId="play-slider-zoom" />
              <TouchSlider glass label="Evolve" setting="automateRate" min={0} max={1} value={s.automateRate ?? 0}
                display={pct(s.automateRate ?? 0)} onChange={v => p.onSetting({ automateRate: v })} testId="play-slider-evolve" />
              </div>
              <div className="min-w-0">

              <div className="mb-2 mt-4 flex items-baseline justify-between landscape:mt-1">
                <span className="text-[14px] font-medium text-text">Looks</span>
                <span className="text-[12px] text-muted">swipe</span>
              </div>
              <div ref={stripRef} className="-mx-4 flex snap-x gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1" data-testid="play-looks">
                {p.looks.map(l => {
                  const on = l.id === p.activeLookId;
                  return (
                    <button key={l.id} onClick={() => p.onLook(l.id)} aria-pressed={on} data-testid="play-look-tile"
                      className="flex w-[92px] shrink-0 snap-start flex-col gap-1.5 text-left">
                      <span className={`h-14 w-[92px] rounded-[12px] ${on ? 'border-2 border-white' : 'border border-white/10'}`} style={{ background: l.swatch }} />
                      <span className={`w-full truncate text-[12px] ${on ? 'font-medium text-text' : 'text-text-2'}`}>{l.name}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex gap-2">
                <button onClick={() => p.onListen(!p.listening)} aria-pressed={p.listening} data-testid="play-follow"
                  className={`flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-[14px] border text-[14px] font-medium ${
                    p.listening ? 'border-accent-border bg-accent-bg text-accent-text' : 'border-white/10 text-text-2'
                  }`}>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${p.listening ? (p.deaf ? 'bg-[#FBBF24]' : 'bg-accent') : 'bg-muted'}`} />
                  <span className="truncate">{p.listening && p.deaf ? 'Hearing nothing' : 'Follow the music'}</span>
                </button>
                <button onClick={() => p.onWander(!p.wandering)} aria-pressed={p.wandering} data-testid="play-wander"
                  className={`flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-[14px] border text-[14px] font-medium ${
                    p.wandering ? 'border-accent-border bg-accent-bg text-accent-text' : 'border-white/10 text-text-2'
                  }`}>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${p.wandering ? 'bg-accent' : 'bg-muted'}`} />
                  <span className="truncate">Wander on its own</span>
                </button>
              </div>
              <div className="mt-3 flex gap-2 pb-1">
                <button onClick={p.onShuffle} data-testid="play-sheet-shuffle"
                  className="h-[52px] min-w-0 flex-1 rounded-[14px] border border-white/10 text-[15px] font-medium text-text active:bg-white/10">Shuffle</button>
                <button onClick={p.onClear} data-testid="play-clear"
                  className="h-[52px] min-w-0 flex-1 rounded-[14px] border border-white/10 text-[15px] font-medium text-text active:bg-white/10">Clear plate</button>
                {p.recording.supported && (
                  <button onClick={() => { void shareClip(); }} data-testid="play-share"
                    className="h-[52px] min-w-0 flex-1 truncate rounded-[14px] bg-primary px-2 text-[15px] font-medium text-on-primary">{clipLabel}</button>
                )}
              </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
