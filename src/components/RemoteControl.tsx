import type { ComponentType, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Sparkles, Droplets, Eraser, Waves, Microscope, Monitor, MonitorOff, Wifi, WifiOff, Hand, Compass } from 'lucide-react';
import { PRESETS } from '../presets';
import { useRemoteLink } from '../hooks/useRemoteLink';
import type { RemoteAction, RemoteState } from '../lib/remoteProtocol';
import type { VisualizerSettings } from '../types';

/**
 * The phone. A control surface for a show running on the laptop — deliberately
 * not a second copy of the settings panel.
 *
 * What's here is what you reach for mid-show in a dark room: presets, the two
 * dials that change the mood most (drive and speed), the macro camera, and the
 * one-shot gestures. Everything else stays on the laptop, where there's a
 * pointer and enough screen to see what you're doing.
 */

/**
 * Defined at module level on purpose: a component created inside the render
 * body gets a new identity on every state message from the laptop, which
 * remounts the slider under the thumb that is dragging it.
 */
function Slider({ label, field, min, max, step, format, value, connected, onDrag, onChange }: {
  label: string;
  field: keyof VisualizerSettings;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  value: number | undefined;
  connected: boolean;
  onDrag: (field: keyof VisualizerSettings, dragging: boolean) => void;
  onChange: (field: keyof VisualizerSettings, v: number) => void;
}) {
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
        className="remote-slider h-10 w-full cursor-pointer disabled:opacity-30"
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

  const presetGroups = useMemo(() => {
    const macro = PRESETS.filter((p) => p.settings.macroMode);
    const rest = PRESETS.filter((p) => !p.settings.macroMode);
    return [
      { label: 'Closeup', presets: macro },
      { label: 'Light show', presets: rest },
    ];
  }, []);

  const connected = status === 'connected' && state !== null;
  const sliderProps = { onDrag: onSliderDrag, onChange: onSliderChange };

  // ── The projectionist's pad ──────────────────────────────────────
  // A finger on the pad is a finger on the plate: dragging blows air along
  // its path, a tap drops dye. Each phone holds one layer, so two phones are
  // two projectionists on two plates.
  const [padLayer, setPadLayer] = useState(0);
  const [padTool, setPadTool] = useState<'blow' | 'drop'>('blow');
  const padRef = useRef<HTMLDivElement>(null);
  const padLastSend = useRef(0);
  const padDown = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const padPoint = (e: ReactPointerEvent) => {
    const r = padRef.current!.getBoundingClientRect();
    // Normalised, y up — the plate's own coordinates.
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)) };
  };
  const padSend = (kind: 'blow' | 'drop', p: { x: number; y: number }) => send({ type: kind, x: p.x, y: p.y, layer: padLayer });

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

  return (
    <div
      className="min-h-screen bg-[#0a0a0a] text-white"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
        touchAction: 'manipulation',
        overscrollBehavior: 'none',
      }}
    >
      {/* Status */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#0a0a0a]/95 px-5 py-4 backdrop-blur">
        <div>
          <h1 className="text-lg font-bold italic tracking-tighter">
            Chroma<span className="not-italic">Glass</span>
          </h1>
          <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">Remote</p>
        </div>
        <div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest ${connected ? 'text-emerald-400/80' : 'text-amber-400/80'}`}>
          {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
          {connected ? 'Linked' : status === 'connecting' ? 'Finding laptop' : 'Offline'}
        </div>
      </header>

      {!connected && (
        <p className="px-5 py-3 text-xs leading-relaxed text-white/45">
          Waiting for the laptop. Make sure the show is open there and both devices are on the
          same network.
        </p>
      )}

      <main className="px-5 pt-5">
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

        {/* The two dials that change the mood most */}
        <Slider label="Sound Drive" field="audioImpact" min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} value={value('audioImpact') as number | undefined} {...sliderProps} connected={connected} />
        <Slider label="Speed" field="globalSpeed" min={0.005} max={0.6} step={0.005} format={(v) => v.toFixed(3)} value={value('globalSpeed') as number | undefined} {...sliderProps} connected={connected} />

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
              <Slider label="Zoom" field="macroZoom" min={1} max={12} step={0.5} format={(v) => `${v.toFixed(1)}x`} value={value('macroZoom') as number | undefined} {...sliderProps} connected={connected} />
              <Slider label="Music Sync" field="macroSync" min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} value={value('macroSync') as number | undefined} {...sliderProps} connected={connected} />
              <Slider label="Shot Length" field="macroHold" min={1} max={15} step={0.5} format={(v) => `${v.toFixed(1)}s`} value={value('macroHold') as number | undefined} {...sliderProps} connected={connected} />
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

        {/* The projectionist's pad */}
        <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">
              <Hand size={15} /> Projectionist
            </span>
            <div className="flex gap-1.5">
              {(['blow', 'drop'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setPadTool(t)}
                  disabled={!connected}
                  className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest disabled:opacity-30 ${padTool === t ? 'border-white/50 bg-white/15 text-white' : 'border-white/10 text-white/50'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div
            ref={padRef}
            className={`relative aspect-video w-full touch-none select-none rounded-xl border border-dashed ${connected ? 'border-white/25 bg-black/40' : 'border-white/10 bg-black/20'}`}
            onPointerDown={(e) => {
              if (!connected) return;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              const p = padPoint(e);
              padDown.current = { ...p, moved: false };
              if (padTool === 'drop') padSend('drop', p);
              else { padSend('blow', p); padLastSend.current = performance.now(); }
            }}
            onPointerMove={(e) => {
              if (!connected || !padDown.current) return;
              const p = padPoint(e);
              padDown.current.moved = true;
              const now = performance.now();
              if (now - padLastSend.current < 33) return;   // 30 Hz along the drag
              padLastSend.current = now;
              padSend(padTool, p);
            }}
            onPointerUp={() => { padDown.current = null; }}
            onPointerCancel={() => { padDown.current = null; }}
          >
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-[0.25em] text-white/25">
              {padTool === 'blow' ? 'drag to blow air across the plate' : 'tap or drag to drop dye'}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex gap-1.5">
              {Array.from({ length: Math.max(1, Math.min(5, settings?.layerCount ?? 1)) }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPadLayer(i)}
                  disabled={!connected}
                  className={`h-8 w-8 rounded-full border text-[11px] font-bold disabled:opacity-30 ${padLayer === i ? 'border-white/50 bg-white/15 text-white' : 'border-white/10 text-white/50'}`}
                  title={`This phone works plate ${i + 1}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button
              onClick={toggleTilt}
              disabled={!connected}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest disabled:opacity-30 ${tiltOn ? 'border-white/50 bg-white/15 text-white' : 'border-white/10 text-white/60'}`}
              title="Tilting the phone tilts the plate"
            >
              <Compass size={13} /> {tiltOn ? 'Tilt live' : 'Tilt'}
            </button>
          </div>
        </div>

        {/* One-shot gestures */}
        <div className="mb-7 flex gap-3">
          <ActionButton label="Seed" icon={Droplets} onPress={() => action('seed')} connected={connected} />
          <ActionButton label="Random" icon={Sparkles} onPress={() => action('lucky')} connected={connected} />
          <ActionButton label="Drain" icon={Waves} onPress={() => action('drain')} connected={connected} />
          <ActionButton label="Clear" icon={Eraser} onPress={() => action('clear')} tone="warn" connected={connected} />
        </div>

        {/* Presets */}
        {presetGroups.map(({ label, presets }) => (
          <section key={label} className="mb-7">
            <h2 className="mb-3 text-[10px] uppercase tracking-[0.3em] text-white/30">{label}</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {presets.map((preset) => {
                const isActive = state?.activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => send({ type: 'preset', presetId: preset.id })}
                    disabled={!connected}
                    className={`rounded-2xl border px-3 py-4 text-left transition-colors active:scale-95 disabled:opacity-30 ${
                      isActive ? 'border-white/50 bg-white/15' : 'border-white/10 bg-white/5'
                    }`}
                  >
                    <span className={`block text-sm font-bold leading-tight ${isActive ? 'text-white' : 'text-white/75'}`}>
                      {preset.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
