import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Info } from './Info';
import {
  DEFAULT_OUTPUT, IDENTITY_CORNERS, MAX_SURFACES, SURFACE_SHAPES,
  makeCube, makeSurface, outputIsIdentity, surfaceOutline,
  type OutputConfig, type Surface, type SurfaceShape,
} from '../lib/outputConfig';

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

const SHAPE_LABELS: Record<SurfaceShape, string> = {
  rect: 'Rectangle', ellipse: 'Circle', triangle: 'Triangle', diamond: 'Diamond',
};

/**
 * The shape of the frame the corners are fractions of.
 *
 * Both pads were drawn at 16:9, which is right for a projector on HDMI and
 * wrong for everything else: the plate renders at the window's shape unless a
 * projector is attached, and on a 1470x956 laptop window a circle drawn round
 * on the pad came out taller on the wall than it looked here. Read from the
 * canvas's backing store, which is the frame the output pass actually maps
 * onto, and followed while the panel is open because attaching a projector
 * changes it without resizing this window.
 */
function useFrameAspect(): number {
  const read = () => {
    const c = document.getElementById('liquid-canvas') as HTMLCanvasElement | null;
    const a = c && c.width > 0 && c.height > 0 ? c.width / c.height : 16 / 9;
    return Math.max(0.5, Math.min(3, a));
  };
  const [aspect, setAspect] = useState(read);
  useEffect(() => {
    const id = window.setInterval(() => {
      const a = read();
      setAspect(prev => (Math.abs(prev - a) > 0.005 ? a : prev));
    }, 500);
    return () => window.clearInterval(id);
  }, []);
  return aspect;
}

/**
 * The shape that had its handles, kept across the panel closing.
 *
 * Mapping is drag a corner, close Settings to look at the wall, open it again,
 * drag again. The panel unmounts when Settings closes, so a selection held only
 * in its state was gone every time the operator looked, and the next drag
 * started with a click to find the shape again. Held for the page's life, not
 * saved: surfaces keep their ids, and one that has since been deleted simply
 * matches nothing.
 */
let lastSelected: string | null = null;

const poly = (pts: [number, number][]) => pts.map(([x, y]) => `${x * 100}% ${y * 100}%`).join(', ');

/**
 * The wall, with the shapes on it.
 *
 * One surface at a time carries handles. Sixteen surfaces with four corners
 * each is sixty-four targets on one small rectangle, which is not an editor,
 * it is a minefield — so the others are drawn and clickable as whole shapes,
 * and selecting one is what gives it its corners.
 *
 * What is drawn is the shape's real outline, its local-space boundary carried
 * through the same projective map the shader inverts, rather than a rectangle
 * standing in for it. A circle pinned onto a surface that is not square to the
 * projector is an ellipse on the wall, and the preview has to show that or it
 * is lying about the one thing it exists to show.
 */
function SurfacePad({ surfaces, selected, onSelect, onChange, aspect }: {
  surfaces: Surface[];
  selected: string | null;
  onSelect: (id: string) => void;
  onChange: (id: string, next: Partial<Surface>) => void;
  aspect: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const active = surfaces.find(s => s.id === selected) ?? null;

  const moveTo = useCallback((index: number, clientX: number, clientY: number) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || !active) return;
    const clamp = (v: number) => Math.max(-0.25, Math.min(1.25, v));
    const next = [...active.corners] as Surface['corners'];
    next[index * 2] = Math.round(clamp((clientX - box.left) / box.width) * 1000) / 1000;
    next[index * 2 + 1] = Math.round(clamp((clientY - box.top) / box.height) * 1000) / 1000;
    onChange(active.id, { corners: next });
  }, [active, onChange]);

  const onKey = (index: number) => (e: React.KeyboardEvent) => {
    if (!active) return;
    const step = e.shiftKey ? 0.05 : 0.002;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    const next = [...active.corners] as Surface['corners'];
    next[index * 2] = Math.round((next[index * 2] + d[0]) * 1000) / 1000;
    next[index * 2 + 1] = Math.round((next[index * 2 + 1] + d[1]) * 1000) / 1000;
    onChange(active.id, { corners: next });
  };

  return (
    <div
      ref={boxRef}
      className="relative mb-3 w-full overflow-hidden rounded-lg border border-white/10 bg-black touch-none"
      style={{ aspectRatio: aspect }}
      onPointerMove={e => { if (dragging !== null) moveTo(dragging, e.clientX, e.clientY); }}
      onPointerUp={() => setDragging(null)}
      onPointerCancel={() => setDragging(null)}
      data-testid="surface-pad"
    >
      {surfaces.map((s, i) => {
        const outline = surfaceOutline(s.shape, s.corners);
        if (outline.length < 3) return null;
        const on = s.id === selected;
        return (
          <button
            key={s.id}
            onPointerDown={() => onSelect(s.id)}
            aria-label={`Surface ${i + 1}, ${SHAPE_LABELS[s.shape]}`}
            data-testid={`surface-shape-${i}`}
            className="absolute inset-0"
            style={{
              clipPath: `polygon(${poly(outline)})`,
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.16) 1px, transparent 1px)',
              backgroundSize: '12.5% 25%',
              backgroundColor: on ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)',
              opacity: s.enabled ? 1 : 0.25,
            }}
          />
        );
      })}
      {active && [0, 1, 2, 3].map(i => (
        <button
          key={i}
          onPointerDown={e => {
            e.preventDefault();
            (e.target as Element).setPointerCapture?.(e.pointerId);
            setDragging(i);
            moveTo(i, e.clientX, e.clientY);
          }}
          onKeyDown={onKey(i)}
          aria-label={`Surface corner ${HANDLE_LABELS[i]}`}
          title={`${HANDLE_LABELS[i]} — drag, or arrow keys (shift for coarse)`}
          data-testid={`surface-corner-${i}`}
          className={`absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-colors ${
            dragging === i ? 'border-white bg-white/25' : 'border-white/50 bg-white/10 hover:bg-white/20'
          }`}
          style={{ left: `${active.corners[i * 2] * 100}%`, top: `${active.corners[i * 2 + 1] * 100}%` }}
        >
          <span className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
        </button>
      ))}
      {surfaces.length === 0 && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] text-white/30">
          No shapes — the whole frame is the picture
        </span>
      )}
    </div>
  );
}

/**
 * A wall to drag against.
 *
 * The preview is not the show: it is the projected *quad* over a grid, so the
 * shape of the correction is visible on a laptop in a dark room without
 * squinting at the actual wall. The grid is the point — a keystone is obvious
 * against straight lines and invisible against liquid.
 */
function CornerPad({ value, onChange, flipX, flipY, aspect }: {
  value: OutputConfig['corners'];
  onChange: (next: OutputConfig['corners']) => void;
  flipX: boolean;
  flipY: boolean;
  aspect: number;
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
      style={{ aspectRatio: aspect }}
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
  const aspect = useFrameAspect();
  // Reset puts the guard back on as well as squaring the geometry, so it has
  // something to do even when the geometry is already square. It leaves the
  // mapped shapes alone — they have a section and a Clear of their own — so
  // "already reset" is judged without them.
  const identity = outputIsIdentity({ ...output, surfaces: [] }) && output.flashGuard;

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
        aspect={aspect}
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

/**
 * Projection mapping, as a section of its own.
 *
 * It was the middle of Projectors, between the corner pin and the masks, and
 * took that section to 3.2 screens deep — past the three the settings sheet
 * holds every section to, and far enough that the output grade and the flash
 * limit below it were a long scroll from the wall they belong to. Same config,
 * same room, its own row on the rail.
 */
export function MappingPanel({ output, onChange }: {
  output: OutputConfig;
  onChange: (next: OutputConfig) => void;
}) {
  const set = (patch: Partial<OutputConfig>) => onChange({ ...output, ...patch });
  const aspect = useFrameAspect();
  const surfaces = output.surfaces ?? [];
  const [selected, setSelectedState] = useState<string | null>(() => lastSelected);
  const setSelected = (id: string | null) => { lastSelected = id; setSelectedState(id); };
  const active = surfaces.find(s => s.id === selected) ?? null;
  const setSurfaces = (next: Surface[]) => set({ surfaces: next.slice(0, MAX_SURFACES) });
  const patchSurface = (id: string, patch: Partial<Surface>) =>
    setSurfaces(surfaces.map(s => (s.id === id ? { ...s, ...patch } : s)));
  const addSurfaces = (made: Surface[]) => {
    const next = [...surfaces, ...made].slice(0, MAX_SURFACES);
    setSurfaces(next);
    // Select what was just made: the first thing anybody does with a new shape
    // is drag a corner, and a new shape with no handles looks like nothing
    // happened.
    if (next.length > surfaces.length) setSelected(next[surfaces.length].id);
  };

  return (
    <div className="mb-6 flex flex-col gap-2" data-testid="mapping-panel">
      <p className="mb-3 text-[12px] leading-relaxed text-white/40">
        Cut the picture into shapes on the wall, with the dark left dark between them.
        Add a shape, then drag its corners onto whatever the projector is pointed at —
        a panel, a pillar, a stack of boxes. With no shapes the whole frame is the picture.
      </p>

      <SurfacePad
        surfaces={surfaces}
        selected={selected}
        onSelect={setSelected}
        onChange={patchSurface}
        aspect={aspect}
      />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {SURFACE_SHAPES.map(shape => (
          <button
            key={shape}
            onClick={() => addSurfaces([makeSurface(shape, surfaces.length)])}
            disabled={surfaces.length >= MAX_SURFACES}
            className="rounded border border-white/20 px-2.5 py-1 text-[12px] hover:bg-white/10 disabled:opacity-30"
            data-testid={`add-surface-${shape}`}
          >
            + {SHAPE_LABELS[shape]}
          </button>
        ))}
        <button
          onClick={() => addSurfaces(makeCube())}
          disabled={surfaces.length + 3 > MAX_SURFACES}
          className="rounded border border-white/20 px-2.5 py-1 text-[12px] hover:bg-white/10 disabled:opacity-30"
          title="Three faces, arranged as a box. Each is an ordinary shape afterwards."
          data-testid="add-surface-cube"
        >
          + Cube
        </button>
        {surfaces.length > 0 && (
          <button
            onClick={() => { setSurfaces([]); setSelected(null); }}
            className="ml-auto text-[12px] text-white/35 hover:text-white/70"
            data-testid="surfaces-clear"
          >
            Clear all
          </button>
        )}
      </div>

      {active && (
        <div className="mb-3 rounded-lg border border-white/10 p-3" data-testid="surface-editor">
          <div className="mb-2 flex items-center gap-1.5">
            <select
              value={active.shape}
              onChange={e => patchSurface(active.id, { shape: e.target.value as SurfaceShape })}
              className="rounded border border-white/20 bg-white/10 px-2 py-1 text-[12px] focus:border-white/50 focus:outline-none"
              data-testid="surface-shape"
            >
              {SURFACE_SHAPES.map(s => <option key={s} value={s}>{SHAPE_LABELS[s]}</option>)}
            </select>
            <button
              onClick={() => patchSurface(active.id, { enabled: !active.enabled })}
              className="rounded border border-white/20 px-2 py-1 text-[12px] hover:bg-white/10"
              data-testid="surface-enabled"
            >
              {active.enabled ? 'On' : 'Off'}
            </button>
            <button
              onClick={() => addSurfaces([{ ...active, id: `${active.id}-copy-${surfaces.length}` }])}
              disabled={surfaces.length >= MAX_SURFACES}
              className="rounded border border-white/20 px-2 py-1 text-[12px] hover:bg-white/10 disabled:opacity-30"
              data-testid="surface-duplicate"
            >
              Duplicate
            </button>
            <button
              onClick={() => { setSurfaces(surfaces.filter(s => s.id !== active.id)); setSelected(null); }}
              className="ml-auto rounded border border-white/20 px-2 py-1 text-[12px] text-white/60 hover:bg-white/10 hover:text-white"
              data-testid="surface-delete"
            >
              Delete
            </button>
          </div>
          <Row label="Opacity" value={active.opacity} min={0} max={1} step={0.01}
            onChange={v => patchSurface(active.id, { opacity: v })} />
          <Row label="Edge" value={active.feather} min={0} max={0.5} step={0.005}
            onChange={v => patchSurface(active.id, { feather: v })} />
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[12px] text-white/40">Shows</span>
            <button
              onClick={() => patchSurface(active.id, { src: [0, 0, 1, 1] })}
              className="rounded border border-white/20 px-2 py-1 text-[11px] hover:bg-white/10"
              data-testid="surface-src-all"
            >
              Whole picture
            </button>
            <button
              onClick={() => {
                // A vertical slice, stepped along so a row of shapes shows a
                // row of the plate rather than the same strip four times.
                const n = Math.max(1, surfaces.length);
                const i = surfaces.findIndex(s => s.id === active.id);
                patchSurface(active.id, { src: [i / n, 0, 1 / n, 1] });
              }}
              className="rounded border border-white/20 px-2 py-1 text-[11px] hover:bg-white/10"
              title="Give each shape its own vertical slice of the plate"
              data-testid="surface-src-slice"
            >
              Its own slice
            </button>
          </div>
        </div>
      )}

      {surfaces.length > 0 && (
        <div className="mb-4 flex flex-col gap-1" data-testid="surface-list">
          {surfaces.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setSelected(s.id)}
              className={`flex items-center gap-2 rounded px-2 py-1 text-left text-[12px] ${
                s.id === selected ? 'bg-white/15' : 'hover:bg-white/5'
              }`}
              data-testid={`surface-row-${i}`}
            >
              <span className="w-4 text-white/30">{i + 1}</span>
              <span className={s.enabled ? '' : 'text-white/30 line-through'}>{SHAPE_LABELS[s.shape]}</span>
              {s.opacity < 1 && <span className="text-white/30">{Math.round(s.opacity * 100)}%</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
