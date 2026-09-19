import type { ComponentType, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Sparkles, Droplets, Eraser, Waves, Microscope, Monitor, MonitorOff, Wifi, WifiOff, Hand, Compass, Clapperboard, SkipBack, SkipForward, Square, Maximize2, Minimize2, PenTool, ChevronLeft, ChevronRight, Circle, Lightbulb } from 'lucide-react';
import { PRESETS } from '../presets';
import { PALETTE } from '../constants';
import { DEFAULT_LIQUID_TYPES } from '../types';
import { useRemoteLink } from '../hooks/useRemoteLink';
import type { RemoteAction, RemoteState } from '../lib/remoteProtocol';
import type { VisualizerSettings } from '../types';
import { useWakeLock } from '../hooks/useWakeLock';
import { PIN_RANGE } from '../lib/deskPins';
import lockupUrl from '../assets/brand/lockup.svg';

/**
 * The phone and the tablet. A control surface for a show running on the
 * laptop — deliberately not a second copy of the settings panel.
 *
 * On a phone it is one column: transport, the dials that change the mood
 * most, the projectionist's pad, the sequencer, presets. On an iPad it is two:
 * the pad fills the left half as a plate you work with your fingers or a pen
 * (pressure sets how much dye, tilt sets which way the air blows), and the
 * dials and presets sit on the right. The pad can also take the whole screen.
 */

/**
 * Defined at module level on purpose: a component created inside the render
 * body gets a new identity on every state message from the laptop, which
 * remounts the slider under the thumb that is dragging it.
 *
 * The travel is not written here. It is the setting's one range, from the
 * registry every other surface reads: this page had Speed at 0.005–0.6, twice
 * the sheet's top, and the macro zoom stopping at 12 where the sheet goes to
 * 16, so the same thumb position meant a different plate from the phone.
 */
function Slider({ label, field, step, format, value, connected, onDrag, onChange }: {
  label: string;
  field: keyof VisualizerSettings;
  step: number;
  format?: (v: number) => string;
  value: number | undefined;
  connected: boolean;
  onDrag: (field: keyof VisualizerSettings, dragging: boolean) => void;
  onChange: (field: keyof VisualizerSettings, v: number) => void;
}) {
  const { min, max } = PIN_RANGE.get(String(field)) ?? { min: 0, max: 1 };
  const current = value ?? min;
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">{label}</span>
        <span className="font-mono text-xs text-white/40">{format ? format(current) : current.toFixed(2)}</span>
      </div>
      <input
        id={`remote-${String(field)}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        disabled={!connected}
        onPointerDown={() => onDrag(field, true)}
        onPointerUp={() => onDrag(field, false)}
        onPointerCancel={() => onDrag(field, false)}
        onChange={(e) => onChange(field, parseFloat(e.target.value))}
        className="remote-slider h-10 w-full cursor-pointer disabled:opacity-30 md:h-12"
        style={{ ['--fill' as string]: `${((current - min) / (max - min)) * 100}%` }}
      />
    </div>
  );
}

function ActionButton({ label, icon: Icon, onPress, connected, tone = 'default' }: {
  label: string;
  icon: ComponentType<{ size?: number }>;
  onPress: () => void;
  connected: boolean;
  tone?: 'default' | 'warn';
}) {
  return (
    <button
      onClick={onPress}
      disabled={!connected}
      className={`flex flex-1 flex-col items-center gap-1.5 rounded-2xl border py-4 transition-colors active:scale-95 disabled:opacity-30 ${
        tone === 'warn'
          ? 'border-red-400/25 bg-red-500/10 text-red-200 active:bg-red-500/20'
          : 'border-white/10 bg-white/5 text-white/80 active:bg-white/15'
      }`}
    >
      <Icon size={20} />
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </button>
  );
}

/** How hard a pointer presses, 0..1. Fingers on most screens report 0 or 1: treat them as a mouse. */
function pressureOf(e: ReactPointerEvent): number {
  if (e.pointerType === 'pen') return Math.max(0.05, Math.min(1, e.pressure || 0.5));
  if (e.pointerType === 'touch' && e.pressure > 0 && e.pressure < 1) return Math.max(0.05, e.pressure);  // Sensel, 3D Touch
  return 0.5;
}
/** Which way a pen leans, as a plate direction (y up); zero for anything without tilt. */
function tiltOf(e: ReactPointerEvent): { dx: number; dy: number } | null {
  if (e.pointerType !== 'pen') return null;
  const tx = e.tiltX ?? 0, ty = e.tiltY ?? 0;
  if (Math.abs(tx) < 8 && Math.abs(ty) < 8) return null;
  return { dx: tx / 90, dy: -ty / 90 };
}

export default function RemoteControl() {
  const [state, setState] = useState<RemoteState | null>(null);
  /**
   * While a finger is on a slider, the phone trusts its own value: state
   * snapshots keep arriving from the laptop, and letting them win would make
   * the thumb jump backwards mid-drag.
   */
  const draggingRef = useRef<Set<keyof VisualizerSettings>>(new Set());
  const [localValues, setLocalValues] = useState<Partial<VisualizerSettings>>({});

  const { status, send } = useRemoteLink({
    role: 'controller',
    onMessage: (message) => {
      if (message.type !== 'state') return;
      setState(message.state);
      setLocalValues((prev) => {
        // Drop local overrides for anything not currently being dragged.
        const next: Partial<VisualizerSettings> = {};
        for (const key of draggingRef.current) {
          if (key in prev) (next as Record<string, unknown>)[key] = prev[key];
        }
        return next;
      });
    },
  });

  const settings = state?.settings;
  const value = useCallback(
    <K extends keyof VisualizerSettings>(key: K): VisualizerSettings[K] | undefined =>
      (localValues[key] ?? settings?.[key]) as VisualizerSettings[K] | undefined,
    [localValues, settings],
  );

  const patch = useCallback(
    (partial: Partial<VisualizerSettings>) => send({ type: 'patch', settings: partial }),
    [send],
  );
  // A dragged slider fires many times a frame; the laptop needs about twenty
  // a second, and always the last one.
  const throttleRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; pending: Partial<VisualizerSettings> }>({ timer: null, pending: {} });
  const patchThrottled = useCallback((partial: Partial<VisualizerSettings>) => {
    const t = throttleRef.current;
    t.pending = { ...t.pending, ...partial };
    if (t.timer) return;
    t.timer = setTimeout(() => {
      t.timer = null;
      const p = t.pending;
      t.pending = {};
      patch(p);
    }, 50);
  }, [patch]);
  const onSliderDrag = useCallback((field: keyof VisualizerSettings, dragging: boolean) => {
    if (dragging) draggingRef.current.add(field);
    else draggingRef.current.delete(field);
  }, []);
  const onSliderChange = useCallback((field: keyof VisualizerSettings, v: number) => {
    setLocalValues((prev) => ({ ...prev, [field]: v }));
    patchThrottled({ [field]: v } as Partial<VisualizerSettings>);
  }, [patchThrottled]);

  const action = useCallback((a: RemoteAction) => send({ type: 'action', action: a }), [send]);

  // The laptop's own preset list when it sends one (the user's files included); the built-ins until then.
  const presetGroups = useMemo(() => {
    const list = state?.presets ?? PRESETS.map(p => ({ id: p.id, name: p.name, macro: !!p.settings.macroMode, user: false }));
    return [
      { label: 'Light show', presets: list.filter(p => !p.macro && !p.user) },
      { label: 'Closeup', presets: list.filter(p => p.macro && !p.user) },
      { label: 'Yours', presets: list.filter(p => p.user) },
    ].filter(g => g.presets.length > 0);
  }, [state?.presets]);

  const connected = status === 'connected' && state !== null;
  const sliderProps = { onDrag: onSliderDrag, onChange: onSliderChange };

  // ── Keep the screen on while linked ──────────────────────────────
  // A tablet that sleeps mid-song is a dark pad.
  useWakeLock(connected);

  // ── The projectionist's pad ──────────────────────────────────────
  // A finger on the pad is a finger on the plate: dragging blows air along
  // its path, a tap drops dye. Several fingers are several hands. A pen
  // presses (more dye) and leans (which way the air goes). Each device holds
  // one layer, so two tablets are two projectionists on two plates.
  const [padLayer, setPadLayer] = useState(0);
  const [padTool, setPadTool] = useState<'blow' | 'drop' | 'press'>('blow');
  const [padColor, setPadColor] = useState<string | null>(null);
  const [padLiquid, setPadLiquid] = useState<string>('water');
  const [padFull, setPadFull] = useState(false);
  const [penSeen, setPenSeen] = useState(false);
  const padRef = useRef<HTMLDivElement>(null);
  const padLastSend = useRef(new Map<number, number>());
  const padTouches = useRef(new Map<number, { x: number; y: number }>());
  const [padTouchCount, setPadTouchCount] = useState(0);
  const padPoint = (e: ReactPointerEvent) => {
    const r = padRef.current!.getBoundingClientRect();
    // Normalised, y up — the plate's own coordinates.
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)) };
  };
  const padSend = (kind: 'blow' | 'drop' | 'press', e: ReactPointerEvent, p: { x: number; y: number }) => {
    const amount = pressureOf(e);
    if (kind === 'drop') send({ type: 'drop', x: p.x, y: p.y, layer: padLayer, amount, color: padColor ?? undefined });
    else if (kind === 'press') send({ type: 'press', x: p.x, y: p.y, layer: padLayer, amount });
    else { const t = tiltOf(e); send({ type: 'blow', x: p.x, y: p.y, layer: padLayer, amount, ...(t ?? {}) }); }
  };
  const onPadDown = (e: ReactPointerEvent) => {
    if (!connected) return;
    e.preventDefault();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    if (e.pointerType === 'pen' && !penSeen) setPenSeen(true);
    const p = padPoint(e);
    padTouches.current.set(e.pointerId, p);
    setPadTouchCount(padTouches.current.size);
    // A pen's barrel button blows even in drop mode; a second button drops in blow mode.
    const tool = e.button === 5 || e.buttons === 32 ? 'blow' : e.button === 2 ? 'drop' : padTool;
    padSend(tool, e, p);
    padLastSend.current.set(e.pointerId, performance.now());
  };
  const onPadMove = (e: ReactPointerEvent) => {
    if (!connected || !padTouches.current.has(e.pointerId)) return;
    const p = padPoint(e);
    padTouches.current.set(e.pointerId, p);
    const now = performance.now();
    if (now - (padLastSend.current.get(e.pointerId) ?? 0) < (padTool === 'press' ? 16 : 33)) return;   // 30 Hz along a drag, 60 for a held press
    padLastSend.current.set(e.pointerId, now);
    padSend(e.buttons === 32 ? 'blow' : padTool, e, p);
  };
  const onPadUp = (e: ReactPointerEvent) => {
    padTouches.current.delete(e.pointerId);
    padLastSend.current.delete(e.pointerId);
    setPadTouchCount(padTouches.current.size);
  };
  const chooseColor = (hex: string) => { setPadColor(hex); send({ type: 'dye', color: hex }); setPadTool('drop'); };
  const chooseLiquid = (id: string) => { setPadLiquid(id); send({ type: 'liquid', id }); setPadTool('drop'); };
  const toggleFull = async () => {
    const next = !padFull;
    setPadFull(next);
    try {
      const el = document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
      if (next && el.requestFullscreen && !document.fullscreenElement) await el.requestFullscreen();
      else if (!next && document.fullscreenElement) await document.exitFullscreen();
    } catch { /* iPhone Safari has no fullscreen; the fixed layout is enough */ }
  };
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setPadFull(false); };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // ── Tilt ─────────────────────────────────────────────────────────
  // The phone's orientation rocks the laptop's plate. iOS asks permission
  // from a gesture; everywhere else the sensor just streams.
  const [tiltOn, setTiltOn] = useState(false);
  const tiltLast = useRef(0);
  useEffect(() => {
    if (!tiltOn) return;
    const onOrient = (e: DeviceOrientationEvent) => {
      const now = performance.now();
      if (now - tiltLast.current < 66) return;   // ~15 Hz is plenty for a plate
      tiltLast.current = now;
      const gamma = e.gamma ?? 0;   // left-right, degrees
      const beta = e.beta ?? 0;     // front-back
      send({ type: 'tilt', x: Math.max(-1, Math.min(1, gamma / 30)), y: Math.max(-1, Math.min(1, (beta - 40) / 30)) });
    };
    window.addEventListener('deviceorientation', onOrient);
    return () => {
      window.removeEventListener('deviceorientation', onOrient);
      send({ type: 'tilt', x: 0, y: 0 });
    };
  }, [tiltOn, send]);
  const toggleTilt = async () => {
    if (tiltOn) { setTiltOn(false); return; }
    const req = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
    if (typeof req === 'function') {
      try { if ((await req()) !== 'granted') return; } catch { return; }
    }
    setTiltOn(true);
  };

  const layerCount = Math.max(1, Math.min(5, settings?.layerCount ?? 1));

  const padSurface = (
    <div
      ref={padRef}
      className={`relative w-full select-none rounded-xl border border-dashed ${padFull ? 'h-full' : 'aspect-video md:aspect-[4/3] md:min-h-[360px]'} ${connected ? 'border-white/25 bg-black/40' : 'border-white/10 bg-black/20'}`}
      style={{ touchAction: 'none' }}
      onPointerDown={onPadDown}
      onPointerMove={onPadMove}
      onPointerUp={onPadUp}
      onPointerCancel={onPadUp}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="remote-pad"
    >
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-[10px] uppercase tracking-[0.25em] text-white/25">
        {padTool === 'blow' ? 'drag to blow air across the plate' : padTool === 'press' ? 'hold to press the glass: the dye spreads in a ring' : 'tap or drag to drop dye'}
        {penSeen ? ' · pen: press for more, lean to steer' : ''}
      </span>
      {padTouchCount > 0 && (
        <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-white/10 px-2 py-0.5 text-[9px] text-white/50" data-testid="remote-pad-touches">
          {padTouchCount} {padTouchCount === 1 ? 'hand' : 'hands'}
        </span>
      )}
    </div>
  );

  const padControls = (
    <>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {Array.from({ length: layerCount }, (_, i) => (
            <button
              key={i}
              onClick={() => setPadLayer(i)}
              disabled={!connected}
              className={`h-9 w-9 rounded-full border text-[11px] font-bold disabled:opacity-30 ${padLayer === i ? 'border-white/50 bg-white/15 text-white' : 'border-white/10 text-white/50'}`}
              title={`This device works plate ${i + 1}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {(['blow', 'drop', 'press'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setPadTool(t)}
              disabled={!connected}
              className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest disabled:opacity-30 ${padTool === t ? 'border-white/50 bg-white/15 text-white' : 'border-white/10 text-white/50'}`}
              data-testid={`remote-tool-${t}`}
            >
              {t}
            </button>
          ))}
          <button
            onClick={toggleTilt}
            disabled={!connected}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest disabled:opacity-30 ${tiltOn ? 'border-white/50 bg-white/15 text-white' : 'border-white/10 text-white/60'}`}
            title="Tilting the device tilts the plate"
          >
            <Compass size={13} /> {tiltOn ? 'Tilt live' : 'Tilt'}
          </button>
        </div>
      </div>
      {/*
        The bottles. Four of these are not colours: soap, milk, silicone and
        glycerine change what the plate does where they land, and for as long
        as they are there. Without this row the pad could only ever drop dye,
        which meant the most performable gesture in the app — a drop of soap
        on a full plate — was reachable from the laptop and nowhere else.
      */}
      <div className="mt-3" data-testid="remote-liquids">
        <div className="text-[9px] uppercase tracking-widest font-bold text-white/40 mb-1.5">Bottle</div>
        <div className="flex flex-wrap gap-1.5">
          {DEFAULT_LIQUID_TYPES.map((liq) => {
            const on = padLiquid === liq.id;
            return (
              <button
                key={liq.id}
                onClick={() => chooseLiquid(liq.id)}
                disabled={!connected}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-transform active:scale-95 disabled:opacity-30 ${
                  on ? 'border-white bg-white/15 text-white' : 'border-white/10 text-white/55'
                }`}
                title={liq.description}
              >
                <span className="h-2.5 w-2.5 rounded-full border border-white/30" style={{ backgroundColor: liq.color }} />
                {liq.name}
                {/* A dot for the four that do something the dye cannot. */}
                {liq.behaviour && <span className="h-1 w-1 rounded-full bg-amber-300/80" />}
              </button>
            );
          })}
        </div>
      </div>
      {/* Dye colours: a tap picks the colour this pad drops and the laptop's dropper with it */}
      <div className="mt-3 flex flex-wrap gap-1.5" data-testid="remote-dyes">
        {PALETTE.map((c) => (
          <button
            key={c.hex}
            onClick={() => chooseColor(c.hex)}
            disabled={!connected}
            className={`h-7 w-7 rounded-full border-2 transition-transform active:scale-90 disabled:opacity-30 md:h-8 md:w-8 ${padColor?.toLowerCase() === c.hex.toLowerCase() ? 'border-white scale-110' : 'border-white/20'}`}
            style={{ backgroundColor: c.hex }}
            title={c.name}
            aria-label={c.name}
          />
        ))}
      </div>
    </>
  );

  if (padFull) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0a] text-white"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)', overscrollBehavior: 'none' }}
        data-testid="remote-pad-full"
      >
        <div className="flex items-center justify-between px-3 py-2">
          <span className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest ${connected ? 'text-emerald-400/80' : 'text-amber-400/80'}`}>
            {connected ? <Wifi size={12} /> : <WifiOff size={12} />} {connected ? 'Linked' : 'Offline'}
          </span>
          <button onClick={toggleFull} className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest" data-testid="remote-pad-exit">
            <Minimize2 size={13} /> Controls
          </button>
        </div>
        <div className="min-h-0 flex-1 px-3">{padSurface}</div>
        <div className="px-3 pb-2">{padControls}</div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[#0a0a0a] text-white"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 6.5rem)',   // clear of the fixed transport bar
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
        touchAction: 'manipulation',
        overscrollBehavior: 'none',
      }}
    >
      {/* Status */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#0a0a0a]/95 px-5 py-4 backdrop-blur">
        <div>
          <h1>
            <img src={lockupUrl} alt="ChromaGlass" className="block h-8 w-auto" draggable={false} />
          </h1>
          <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-white/35">Remote{state?.trackName ? ` · ${state.trackName}` : ''}</p>
        </div>
        <div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest ${connected ? 'text-emerald-400/80' : 'text-amber-400/80'}`}>
          {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
          {status === 'denied' && <span className="ml-2 text-red-300">Wrong show key — open the address the show server printed, key included</span>}
          {connected ? 'Linked' : status === 'connecting' ? 'Finding laptop' : 'Offline'}
        </div>
      </header>

      {!connected && (
        <p className="px-5 py-3 text-xs leading-relaxed text-white/45">
          Waiting for the laptop. Make sure the show is open there and both devices are on the
          same network.
        </p>
      )}

      <main className="px-5 pt-5 md:grid md:grid-cols-2 md:gap-8 md:px-8" data-testid="remote-main">
        {/* Left on a tablet: the pad, kept in view while the right column scrolls */}
        <section className="md:sticky md:top-20 md:self-start">
          <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4" data-testid="remote-projectionist">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">
                <Hand size={15} /> Projectionist {penSeen && <PenTool size={12} className="text-white/40" />}
              </span>
              <button onClick={toggleFull} className="flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white/60" title="The pad alone, full screen" data-testid="remote-pad-fullscreen">
                <Maximize2 size={12} /> Full
              </button>
            </div>
            {padSurface}
            {padControls}
          </div>
        </section>

        <section>
          {/* Transport */}
          <div className="mb-6 flex gap-3">
            <button
              onClick={() => action(state?.isActive ? 'pause' : 'play')}
              disabled={!connected}
              className={`flex flex-[2] items-center justify-center gap-2 rounded-2xl py-5 text-sm font-bold uppercase tracking-widest transition-colors active:scale-95 disabled:opacity-30 ${
                state?.isActive ? 'bg-white text-black' : 'border border-white/15 bg-white/5 text-white/80'
              }`}
            >
              {state?.isActive ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
              {state?.isActive ? 'Playing' : 'Paused'}
            </button>
            <button
              onClick={() => action(state?.isAutomated ? 'automate-off' : 'automate-on')}
              disabled={!connected}
              className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl border py-5 transition-colors active:scale-95 disabled:opacity-30 ${
                state?.isAutomated
                  ? 'border-purple-400/40 bg-purple-500/20 text-purple-100'
                  : 'border-white/10 bg-white/5 text-white/70'
              }`}
            >
              <Waves size={18} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Auto</span>
            </button>
          </div>

          {/* The dials that change the mood most */}
          <Slider label="Sound Drive" field="audioImpact" step={0.01} format={(v) => `${Math.round(v * 100)}%`} value={value('audioImpact') as number | undefined} {...sliderProps} connected={connected} />
          <Slider label="Speed" field="globalSpeed" step={0.005} format={(v) => v.toFixed(3)} value={value('globalSpeed') as number | undefined} {...sliderProps} connected={connected} />
          <Slider label="Evolve Speed" field="automateRate" step={0.01} format={(v) => `${Math.round(v * 100)}%`} value={value('automateRate') as number | undefined} {...sliderProps} connected={connected} />
          <Slider label="Dimmer" field="dimmer" step={0.01} format={(v) => `${Math.round(v * 100)}%`} value={value('dimmer') as number | undefined} {...sliderProps} connected={connected} />
          <div className="mb-6 flex gap-3">
            <button
              onClick={() => action('blackout-toggle')}
              disabled={!connected}
              className={`flex flex-[2] items-center justify-center gap-2 rounded-2xl border py-4 text-[11px] font-bold uppercase tracking-[0.2em] transition-colors active:scale-95 disabled:opacity-30 ${
                state?.blackout ? 'border-red-400/40 bg-red-500/20 text-red-100' : 'border-white/10 bg-white/5 text-white/80'
              }`}
              data-testid="remote-blackout"
            >
              <Lightbulb size={16} /> {state?.blackout ? 'Lights up' : 'Blackout'}
            </button>
            <button
              onClick={() => action('record-toggle')}
              disabled={!connected}
              className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border py-4 text-[11px] font-bold uppercase tracking-[0.2em] transition-colors active:scale-95 disabled:opacity-30 ${
                state?.recording != null ? 'border-red-500 bg-red-600 text-white' : 'border-white/10 bg-white/5 text-white/70'
              }`}
              data-testid="remote-record"
            >
              {state?.recording != null ? <Square size={14} fill="currentColor" /> : <Circle size={14} />}
              {state?.recording != null ? `${Math.floor(state.recording / 60)}:${String(state.recording % 60).padStart(2, '0')}` : 'Rec'}
            </button>
          </div>
          <Slider label="Dye Budget" field="dyeBudget" step={0.05} format={(v) => `${Math.round(v * 100)}%`} value={value('dyeBudget') as number | undefined} {...sliderProps} connected={connected} />
          <Slider label="Plate Rock" field="plateRock" step={0.01} format={(v) => `${Math.round(v * 100)}%`} value={value('plateRock') as number | undefined} {...sliderProps} connected={connected} />

          {/* Macro camera */}
          <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4">
            <button
              onClick={() => patch({ macroMode: !settings?.macroMode })}
              disabled={!connected}
              className="flex w-full items-center justify-between disabled:opacity-30"
            >
              <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">
                <Microscope size={15} /> Macro Closeup
              </span>
              <span className={`h-6 w-11 rounded-full transition-colors ${settings?.macroMode ? 'bg-white' : 'bg-white/20'}`}>
                <span className={`mt-0.5 block h-5 w-5 rounded-full bg-black transition-transform ${settings?.macroMode ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </span>
            </button>
            {settings?.macroMode && (
              <div className="mt-4">
                <Slider label="Macro Zoom" field="macroZoom" step={0.5} format={(v) => `${v.toFixed(1)}x`} value={value('macroZoom') as number | undefined} {...sliderProps} connected={connected} />
                <Slider label="Music Sync" field="macroSync" step={0.05} format={(v) => `${Math.round(v * 100)}%`} value={value('macroSync') as number | undefined} {...sliderProps} connected={connected} />
                <Slider label="Shot Length" field="macroHold" step={0.5} format={(v) => `${v.toFixed(1)}s`} value={value('macroHold') as number | undefined} {...sliderProps} connected={connected} />
              </div>
            )}
          </div>

          {/* Clean screen on the laptop: the phone is the natural place to do this from */}
          <button
            onClick={() => action(state?.overlaysVisible === false ? 'overlays-on' : 'overlays-off')}
            disabled={!connected}
            className={`mb-6 flex w-full items-center justify-center gap-2 rounded-2xl border py-4 text-[11px] font-bold uppercase tracking-[0.2em] transition-colors active:scale-95 disabled:opacity-30 ${
              state?.overlaysVisible === false
                ? 'border-white/40 bg-white/15 text-white'
                : 'border-white/10 bg-white/5 text-white/70'
            }`}
          >
            {state?.overlaysVisible === false ? <Monitor size={16} /> : <MonitorOff size={16} />}
            {state?.overlaysVisible === false ? 'Show laptop controls' : 'Clean screen on laptop'}
          </button>

          {/* The show sequencer's transport: what you reach for when the song changes */}
          {state?.sequencer && (
            <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4" data-testid="remote-sequencer">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">
                  <Clapperboard size={15} /> Sequencer
                </span>
                <span className="text-[10px] text-white/40 truncate max-w-[50%]">
                  {state.sequencer.name ?? 'Stopped'}
                </span>
              </div>
              {state.sequencer.name && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="truncate">{state.sequencer.stageIndex + 1}. {state.sequencer.stageName}</span>
                    <span className="text-white/40">{state.sequencer.stageIndex + 1}/{state.sequencer.stages.length}</span>
                  </div>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full bg-white/70 transition-[width]" style={{ width: `${Math.round(state.sequencer.progress * 100)}%` }} />
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => action('seq-prev')} disabled={!connected || !state.sequencer.name} className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 disabled:opacity-30 active:scale-95" aria-label="Previous stage" data-testid="remote-seq-prev">
                  <SkipBack size={16} className="mx-auto" />
                </button>
                <button
                  onClick={() => action(state.sequencer.running ? 'seq-pause' : 'seq-play')}
                  disabled={!connected}
                  className={`flex-[2] flex items-center justify-center gap-2 rounded-xl border py-3 text-[11px] font-bold uppercase tracking-[0.2em] disabled:opacity-30 active:scale-95 ${
                    state.sequencer.running ? 'border-white/40 bg-white text-black' : 'border-white/10 bg-white/5 text-white/80'
                  }`}
                  data-testid="remote-seq-toggle"
                >
                  {state.sequencer.running ? <Pause size={16} /> : <Play size={16} />}
                  {state.sequencer.running ? 'Pause' : state.sequencer.name ? 'Resume' : 'Play'}
                </button>
                <button onClick={() => action('seq-next')} disabled={!connected || !state.sequencer.name} className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 disabled:opacity-30 active:scale-95" aria-label="Next stage" data-testid="remote-seq-next">
                  <SkipForward size={16} className="mx-auto" />
                </button>
                <button onClick={() => action('seq-stop')} disabled={!connected || !state.sequencer.name} className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 disabled:opacity-30 active:scale-95" aria-label="Stop sequencer" data-testid="remote-seq-stop">
                  <Square size={16} className="mx-auto" />
                </button>
              </div>
            </div>
          )}

          {/* One-shot gestures */}
          <div className="mb-7 flex gap-3">
            <ActionButton label="Seed" icon={Droplets} onPress={() => action('seed')} connected={connected} />
            <ActionButton label="Random" icon={Sparkles} onPress={() => action('lucky')} connected={connected} />
            <ActionButton label="Drain" icon={Waves} onPress={() => action('drain')} connected={connected} />
            <ActionButton label="Clear" icon={Eraser} onPress={() => action('clear')} tone="warn" connected={connected} />
          </div>

          {/* Presets */}
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[10px] uppercase tracking-[0.3em] text-white/30">Looks — tap to arm, Go sends</h2>
            <div className="flex gap-1.5">
              <button onClick={() => action('preset-prev')} disabled={!connected} className="rounded-full border border-white/10 p-2 disabled:opacity-30 active:scale-95" aria-label="Previous preset" data-testid="remote-preset-prev"><ChevronLeft size={14} /></button>
              <button onClick={() => action('preset-next')} disabled={!connected} className="rounded-full border border-white/10 p-2 disabled:opacity-30 active:scale-95" aria-label="Next preset" data-testid="remote-preset-next"><ChevronRight size={14} /></button>
            </div>
          </div>
          {presetGroups.map(({ label, presets }) => (
            <section key={label} className="mb-7" data-testid={`remote-presets-${label.toLowerCase().replace(/\s+/g, '-')}`}>
              <h3 className="mb-3 text-[10px] uppercase tracking-[0.3em] text-white/30">{label}</h3>
              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
                {presets.map((preset) => {
                  const isActive = state?.activePresetId === preset.id;
                  const isCued = state?.cuedPresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => send({ type: 'cue', presetId: preset.id })}
                      disabled={!connected}
                      className={`rounded-2xl border px-3 py-4 text-left transition-colors active:scale-95 disabled:opacity-30 ${
                        isActive ? 'border-white/50 bg-white/15'
                        : isCued ? 'border-violet-400/60 bg-violet-500/10'
                        : 'border-white/10 bg-white/5'
                      }`}
                      data-testid={`remote-preset-${preset.id}`}
                    >
                      <span className={`block text-sm font-bold leading-tight ${isActive ? 'text-white' : 'text-white/75'}`}>
                        {preset.name}
                      </span>
                      {(isActive || isCued) && (
                        <span className={`mt-1 block text-[10px] font-bold uppercase tracking-widest ${isActive ? 'text-red-300' : 'text-violet-300'}`}>
                          {isActive ? 'live' : 'next'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </section>
      </main>

      {/*
        The transport, always under the thumb.

        Everything above this bar scrolls; Go and Blackout do not. A phone in
        a dark room is held one-handed and the two things you must be able to
        hit without looking are the look change and the lights, so they live
        at the bottom edge where the thumb already is — and Go names what it
        will send, because a button you press and hope is not a transport.
      */}
      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#0a0a0a]/95 px-4 pt-3 backdrop-blur"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
        data-testid="remote-transport"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <button
            onClick={() => action('blackout-toggle')}
            disabled={!connected}
            className={`flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl border text-[11px] font-bold uppercase tracking-widest transition-colors active:scale-95 disabled:opacity-30 md:w-[140px] md:flex-none ${
              state?.blackout ? 'border-red-400 bg-red-500 text-black' : 'border-red-400/30 bg-red-500/10 text-red-200'
            }`}
            data-testid="remote-blackout"
          >
            <Lightbulb size={16} />
            {state?.blackout ? 'Blacked out' : 'Blackout'}
          </button>
          {/*
            The cue rail, on a tablet.

            A phone has no room for it and scrolls to the list below; an iPad
            has 1180 points across and nothing to put in the middle of the
            transport. Tapping a card arms the look — the same thing the list
            does — so the whole change of look happens without leaving the
            bar your thumbs are already on: pick, then Go.
          */}
          <div className="hidden min-w-0 flex-1 gap-2 overflow-x-auto scrollbar-hide md:flex" data-testid="remote-cue-rail">
            {(state?.presets ?? []).map((preset) => {
              const live = state?.activePresetId === preset.id;
              const next = state?.cuedPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => send({ type: 'cue', presetId: preset.id })}
                  disabled={!connected}
                  className={`flex h-14 w-[170px] shrink-0 flex-col justify-center rounded-xl border px-3 text-left transition-colors active:scale-95 disabled:opacity-30 ${
                    live ? 'border-red-400/60 bg-red-500/10'
                    : next ? 'border-violet-400/60 bg-violet-500/10'
                    : 'border-white/10 bg-white/5'
                  }`}
                  data-testid={`remote-cue-${preset.id}`}
                >
                  <span className="truncate text-[13px] font-semibold text-white/85">{preset.name}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${
                    live ? 'text-red-300' : next ? 'text-violet-300' : 'text-white/30'
                  }`}>
                    {live ? 'live' : next ? 'next' : preset.user ? 'yours' : preset.macro ? 'closeup' : 'look'}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => action('go')}
            disabled={!connected || !state?.cuedPresetId}
            className="flex h-14 flex-[2] flex-col items-center justify-center rounded-2xl bg-white px-4 text-black transition-transform active:scale-95 disabled:bg-white/15 disabled:text-white/40 md:w-[220px] md:flex-none"
            data-testid="remote-go"
          >
            <span className="text-sm font-bold">
              {state?.cuedName ? `Go to ${state.cuedName}` : 'Nothing armed'}
            </span>
            {state?.cuedName && (
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">
                {state.fadeSeconds ? `${state.fadeSeconds}s fade` : 'cut'}
              </span>
            )}
          </button>
          <button
            onClick={() => action('back')}
            disabled={!connected}
            className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 text-white/70 active:scale-95 disabled:opacity-30"
            aria-label="Back — undo the last look"
            data-testid="remote-back"
          >
            <SkipBack size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
