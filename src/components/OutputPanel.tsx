import React, { useCallback, useRef, useState } from 'react';
import { Info } from './Info';
import { DEFAULT_OUTPUT, IDENTITY_CORNERS, outputIsIdentity, type OutputConfig } from '../lib/outputConfig';

/**
 * Load-in, in the app.
 *
 * Masking the light and squaring the picture is the part of a liquid light
 * show that happens before anyone plays a note, and until now ChromaGlass's
 * answer was to capture its own window in OBS and fix it in something else.
 * This is that work, in the room, with the projector already on: drag the four
 * corners until the rectangle on the wall is a rectangle, pull the edges in
 * until the light stops short of the singer's face, and lift the gamma until
 * the plate reads against the house lights.
 *
 * Two things this panel is deliberately not:
 *
 * **It is not part of a look.** Nothing here is written into a preset or a
 * sequence, so a look built in this room travels to the next one clean. It is
 * kept on this machine (see `lib/outputConfig.ts`).
 *
 * **It is not for playing.** No fader reaches it and nothing here should move
 * during a song. That is why the corner handles are large and slow rather
 * than snappy: they are set once, with the operator standing where the
 * audience will be, and then left alone.
 */

const HANDLE_LABELS = ['top left', 'top right', 'bottom right', 'bottom left'] as const;

/**
 * A wall to drag against.
 *
 * The preview is not the show: it is the projected *quad* over a grid, so the
 * shape of the correction is visible on a laptop in a dark room without
 * squinting at the actual wall. The grid is the point — a keystone is obvious
 * against straight lines and invisible against liquid.
 */
function CornerPad({ value, onChange, flipX, flipY }: {
  value: OutputConfig['corners'];
  onChange: (next: OutputConfig['corners']) => void;
  flipX: boolean;
  flipY: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const moveTo = useCallback((index: number, clientX: number, clientY: number) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    // Allowed a little way outside the frame: a projector aimed past the edge
    // of a screen is corrected by pulling the picture back in from beyond it.
    const clamp = (v: number) => Math.max(-0.25, Math.min(1.25, v));
    const x = clamp((clientX - box.left) / box.width);
    const y = clamp((clientY - box.top) / box.height);
    const next = [...value] as OutputConfig['corners'];
    next[index * 2] = Math.round(x * 1000) / 1000;
    next[index * 2 + 1] = Math.round(y * 1000) / 1000;
    onChange(next);
  }, [value, onChange]);

  const onPointerDown = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragging(index);
    moveTo(index, e.clientX, e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragging === null) return;
    moveTo(dragging, e.clientX, e.clientY);
  };
  const endDrag = () => setDragging(null);

  // Nudge a corner from the keyboard: a pixel of keystone is past what a
  // hand on a trackpad can find, and this is the control that needs to land
  // exactly right.
  const onKey = (index: number) => (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.05 : 0.002;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    const next = [...value] as OutputConfig['corners'];
    next[index * 2] = Math.round((next[index * 2] + d[0]) * 1000) / 1000;
    next[index * 2 + 1] = Math.round((next[index * 2 + 1] + d[1]) * 1000) / 1000;
    onChange(next);
  };

  const pts = [0, 1, 2, 3].map(i => ({ x: value[i * 2], y: value[i * 2 + 1] }));
  const poly = pts.map(p => `${p.x * 100}% ${p.y * 100}%`).join(', ');

  return (
    <div
      ref={boxRef}
      className="relative mb-3 w-full overflow-hidden rounded-lg border border-white/10 bg-black touch-none"
      style={{ aspectRatio: '16 / 9' }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      data-testid="corner-pad"
    >
      {/* The projected quad, with a grid in it so a keystone is visible. */}
      <div
        className="absolute inset-0"
        style={{
          clipPath: `polygon(${poly})`,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.16) 1px, transparent 1px)',
          backgroundSize: '12.5% 25%',
          backgroundColor: 'rgba(255,255,255,0.05)',
          transform: `scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`,
        }}
      />
      {pts.map((p, i) => (
        <button
          key={i}
          onPointerDown={onPointerDown(i)}
          onKeyDown={onKey(i)}
          aria-label={`Corner ${HANDLE_LABELS[i]}`}
          title={`${HANDLE_LABELS[i]} — drag, or arrow keys (shift for coarse)`}
          data-testid={`corner-${i}`}
          className={`absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-colors ${
            dragging === i ? 'border-white bg-white/25' : 'border-white/40 bg-white/10 hover:bg-white/20'
          }`}
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
        >
          <span className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
        </button>
      ))}
    </div>
  );
}

const Row = ({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) => (
  <div className="mb-3 flex flex-col gap-1.5">
    <div className="flex items-center justify-between">
      <span className="text-xs font-bold uppercase tracking-widest opacity-70">{label}</span>
      <span className="font-mono text-[10px] opacity-50">{format ? format(value) : value.toFixed(2)}</span>
    </div>
    <input
      type="range" min={min} max={max} step={step} value={value} aria-label={label}
      onChange={e => onChange(parseFloat(e.target.value))}
      className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-white"
    />
  </div>
);

const Switch = ({ label, on, onChange, hint, testId }: {
  label: string; on: boolean; onChange: (on: boolean) => void; hint?: string; testId?: string;
}) => (
  <button
    onClick={() => onChange(!on)}
    title={hint}
    data-testid={testId}
    className={`flex min-h-11 flex-1 items-center justify-center rounded-lg border px-3 text-[13px] font-medium transition-all ${
      on ? 'border-white bg-white text-black' : 'border-white/10 bg-white/5 hover:bg-white/10'
    }`}
  >
    {label}
  </button>
);

export function OutputPanel({ output, onChange, onReset, wakeLock }: {
  output: OutputConfig;
  onChange: (next: OutputConfig) => void;
  onReset: () => void;
  /** Whether the screen is being kept awake here, and whether it can be. */
  wakeLock?: { supported: boolean; held: boolean };
}) {
  const set = (patch: Partial<OutputConfig>) => onChange({ ...output, ...patch });
  // Reset puts the guard back on as well as squaring the geometry, so it has
  // something to do even when the geometry is already square.
  const identity = outputIsIdentity(output) && output.flashGuard;

  return (
    <div className="mb-6 flex flex-col gap-2" data-testid="output-panel">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-widest opacity-70">The Wall</div>
        <button
          onClick={onReset}
          disabled={identity}
          data-testid="output-reset"
          className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-all ${
            identity ? 'cursor-not-allowed border-white/5 opacity-30' : 'border-white/15 hover:bg-white/10'
          }`}
        >
          Reset
        </button>
      </div>

      <div className="mb-1 flex gap-1.5">
        <Switch
          label="Rear"
          on={output.flipX}
          onChange={v => set({ flipX: v })}
          hint="Rear projection: the image is mirrored so it reads the right way round through the screen"
          testId="output-flip-x"
        />
        <Switch
          label="Inverted"
          on={output.flipY}
          onChange={v => set({ flipY: v })}
          hint="A projector hung upside down from a bar"
          testId="output-flip-y"
        />
      </div>

      <CornerPad
        value={output.corners}
        onChange={corners => set({ corners })}
        flipX={output.flipX}
        flipY={output.flipY}
      />
      <div className="mb-3 flex justify-end">
        <button
          onClick={() => set({ corners: [...IDENTITY_CORNERS] as OutputConfig['corners'] })}
          className="text-[12px] text-white/35 hover:text-white/70"
          data-testid="corners-square"
        >
          Square the corners
        </button>
      </div>

      <Row label="Mask Top"    value={output.maskTop}    min={0} max={0.45} step={0.005} onChange={v => set({ maskTop: v })} />
      <Row label="Mask Bottom" value={output.maskBottom} min={0} max={0.45} step={0.005} onChange={v => set({ maskBottom: v })} />
      <Row label="Mask Left"   value={output.maskLeft}   min={0} max={0.45} step={0.005} onChange={v => set({ maskLeft: v })} />
      <Row label="Mask Right"  value={output.maskRight}  min={0} max={0.45} step={0.005} onChange={v => set({ maskRight: v })} />
      <Row label="Mask Edge"   value={output.maskFeather} min={0} max={0.25} step={0.005} onChange={v => set({ maskFeather: v })} />

      <Row label="Output Gain"  value={output.gain}  min={0.2} max={3}   step={0.05} onChange={v => set({ gain: v })}  format={v => `${v.toFixed(2)}x`} />
      <Row label="Output Gamma" value={output.gamma} min={0.5} max={2.5} step={0.05} onChange={v => set({ gamma: v })} />

      <div className="mb-3 mt-1 flex gap-1.5">
        <Switch
          label={output.flashGuard ? 'Flash Limit On' : 'Flash Limit Off'}
          on={output.flashGuard}
          onChange={v => set({ flashGuard: v })}
          hint="Hold the whole screen below three flashes a second"
          testId="output-flash-guard"
        />
      </div>

      <Info>
        Set this once, at load-in, with the projector on and from where the audience will be — none of it belongs to a look, so nothing here is saved into a preset and no fader can reach it mid-song.
        {' '}<span className="text-white/70">Rear</span> mirrors the picture for projection through a screen or a gauze from behind, which is how most of these shows were rigged and the surest way to keep the light off the band’s faces.
        {' '}<span className="text-white/70">The corners</span> square up a projector that could not be hung on axis: drag them until the grid’s lines are straight on the wall, or nudge with the arrow keys.
        {' '}<span className="text-white/70">The masks</span> are tape on the light: pull an edge in until the spill stops short of a face, a ceiling or the end of the screen, and <span className="text-white/70">Mask Edge</span> decides whether that stop is a hard line or a fade.
        {' '}<span className="text-white/70">Gain</span> and <span className="text-white/70">Gamma</span> are for the room rather than the show — lift the gamma when a bright bar is washing the plate out, and leave <span className="text-white/70">Dimmer</span> free for riding the song.
        {' '}<span className="text-white/70">Flash Limit</span> watches what actually reaches the screen and holds the whole field below three flashes a second, which is the clinical line for photosensitive seizures. It counts flashes rather than smoothing fast changes, so one hard hit on a kick is left alone and only a sustained strobe is pulled back — and it is here, not in the settings, because no preset should be able to switch off a safety and no fader should be able to knock it off in the dark. Turning it off is for a screen nobody is standing in front of.
        {wakeLock && (
          wakeLock.supported
            ? ` The screen is being kept awake${wakeLock.held ? '' : ' while the plate is running'}, so nothing dims or sleeps mid-set.`
            : ' This address cannot keep the screen awake (that needs https or localhost), so turn off sleep and the screensaver on this machine by hand.'
        )}
      </Info>
    </div>
  );
}

export { DEFAULT_OUTPUT };
