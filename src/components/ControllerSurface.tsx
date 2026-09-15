import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Eraser, Search } from 'lucide-react';
import { ACTION_LABELS, LEARNABLE_SETTINGS, type MidiAction, type MidiTarget } from '../lib/midi';
import type { MidiController } from '../hooks/useMidi';
import { PALETTE } from '../constants';
import { controlKey, type ControllerSurface as Surface, type SurfaceControl } from '../lib/controllerSurface';

/**
 * The controller, drawn.
 *
 * Two jobs in one picture. Making the map: touch a knob and the picture
 * selects it, pick what it should do from the list, done — no CC numbers, no
 * guessing which fader is which. Playing the show: the same picture with every
 * control labelled is the cheat sheet, and it lights up as you play, so a
 * glance tells you what your hands are on. Save it as a PNG for the phone or
 * to tape to the desk.
 */
interface Props {
  midi: MidiController;
  presets: { id: string; name: string }[];
  surface: Surface;
  onClose: () => void;
}

const KIND_COLOUR: Record<MidiTarget['kind'], string> = {
  setting: '#38bdf8',
  action: '#fbbf24',
  preset: '#a78bfa',
  dye: '#ffffff',
};

/** A label short enough to read inside a pad. */
function shortLabel(t: MidiTarget, presetName: (id: string) => string | undefined): string {
  switch (t.kind) {
    case 'setting': return LEARNABLE_SETTINGS.find(s => s.key === t.key)?.label ?? String(t.key);
    case 'action': return ACTION_LABELS[t.action];
    case 'preset': return presetName(t.presetId) ?? t.presetId;
    case 'dye': return PALETTE[t.paletteIndex]?.name ?? `Dye ${t.paletteIndex + 1}`;
  }
}

function colourOf(t: MidiTarget): string {
  return t.kind === 'dye' ? (PALETTE[t.paletteIndex]?.hex ?? '#ffffff') : KIND_COLOUR[t.kind];
}

/**
 * Type is measured, not estimated: a canvas with the same font stack gives the
 * true width of a label, so "Cyberpunk" and "Bass Drop" are known to be wider
 * than nine characters of average type before either is drawn. Widths at one
 * unit of type scale exactly, so each string is measured once.
 */
const RULER: SVGTextElement | null = (() => {
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('font-family', 'ui-sans-serif, system-ui, sans-serif');
    text.setAttribute('font-size', '100');
    svg.appendChild(text);
    document.body.appendChild(svg);
    return text;
  } catch { return null; }
})();
const widths = new Map<string, number>();
/** Width of a label at one unit of type, in the weight it will be drawn in. */
function em(text: string, bold: boolean): number {
  const key = `${bold ? 'b' : 'r'}|${text}`;
  const hit = widths.get(key);
  if (hit !== undefined) return hit;
  let w = 0;
  if (RULER) {
    RULER.setAttribute('font-weight', bold ? '700' : '400');
    RULER.textContent = text;
    w = RULER.getComputedTextLength() / 100;
  }
  if (!w) w = text.length * (bold ? 0.68 : 0.62);   // nothing laid out yet: a safe average
  widths.set(key, w);
  return w;
}

const SIZES = [8, 7.5, 7, 6.5, 6, 5.5, 5];

/** Greedy wrap at a measured width, or null if the words will not fit. */
function layout(text: string, width: number, maxLines: number, bold: boolean): string[] | null {
  const out: string[] = [];
  let cur = '';
  for (const w of text.split(' ')) {
    if (em(w, bold) > width) return null;       // one word is wider than the shape
    const next = cur ? `${cur} ${w}` : w;
    if (em(next, bold) <= width) { cur = next; continue; }
    out.push(cur);
    cur = w;
    if (out.length >= maxLines) return null;
  }
  if (cur) out.push(cur);
  return out.length <= maxLines ? out : null;
}

/**
 * The largest type that holds the whole label inside its shape. Shrinking and
 * wrapping come before clipping, because a cheat sheet that says "Sunsh…" twice
 * in a row is no use at all on a dark stage; only a label that will not fit even
 * at the smallest type gets an ellipsis.
 */
function fitLabel(text: string, w: number, h: number, along: boolean, round: boolean, bold: boolean): { lines: string[]; size: number } {
  // Room along the label's own reading direction; a circle takes its margin as
  // a fraction, because the shape narrows above and below the centre line.
  const across = round ? (along ? h : w) * 0.84 : (along ? h : w) - 5;
  const down = along ? w : h;           // across it, where the lines stack
  for (const size of SIZES) {
    const maxLines = Math.max(1, Math.min(3, Math.floor((down - 2) / (size + 1.5))));
    const lines = layout(text, across / size, maxLines, bold);
    if (lines) return { lines, size };
  }
  const size = SIZES[SIZES.length - 1];
  let cut = text;
  while (cut.length > 1 && em(`${cut}…`, bold) * size > across) cut = cut.slice(0, -1);
  return { lines: [`${cut}…`], size };
}

/** Relative luminance, for deciding whether a colour will read on a ground. */
function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const parse = (hex: string): number[] => {
  const h = hex.replace('#', '');
  return h.length === 3 ? h.split('').map(c => parseInt(c + c, 16)) : [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
};
const hexOf = (rgb: number[]): string => `#${rgb.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * A dye is drawn in its own colour, which is the point — but Crimson on a black
 * panel and Icy Blue on paper are the colour of the ground they sit on. Lift or
 * drop the ink, keeping the hue, until it separates from the panel it is on.
 */
function readable(hex: string, onPaper: boolean): string {
  const ground = onPaper ? 1 : luminance([10, 10, 10]);
  const towards = onPaper ? 0 : 255;
  let rgb = parse(hex);
  for (let i = 0; i < 24 && contrast(luminance(rgb), ground) < 3.6; i++) {
    rgb = rgb.map(v => v + (towards - v) * 0.1);
  }
  return hexOf(rgb);
}

export function ControllerSurface({ midi, presets, surface, onClose }: Props) {
  const [selected, setSelected] = useState<SurfaceControl | null>(null);
  const [filter, setFilter] = useState('');
  const [paper, setPaper] = useState(false);
  const [lit, setLit] = useState<Record<string, number>>({});
  const svgRef = useRef<SVGSVGElement>(null);
  const presetName = useCallback((id: string) => presets.find(p => p.id === id)?.name, [presets]);

  const byKey = useMemo(() => {
    const m = new Map<string, MidiTarget>();
    for (const b of midi.map.bindings) m.set(controlKey(b.source), b.target);
    return m;
  }, [midi.map.bindings]);

  // Touching a control on the hardware selects it here, which is the fast way
  // to make a map: hand on the knob, eyes on the list.
  const lastAt = useRef(0);
  useEffect(() => {
    const e = midi.lastEvent;
    if (!e || e.at === lastAt.current) return;
    lastAt.current = e.at;
    const key = controlKey(e.source);
    const hit = surface.controls.find(c => controlKey(c) === key);
    if (hit) setSelected(hit);
    setLit(prev => ({ ...prev, [key]: performance.now() }));
  }, [midi.lastEvent, surface.controls]);

  // Fade the touch highlight out.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force(n => n + 1), 120);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const assign = (target: MidiTarget) => {
    if (!selected) return;
    midi.addBinding({
      source: { kind: selected.kind, channel: selected.channel, number: selected.number },
      target,
      mode: selected.relative && target.kind === 'setting' ? 'relative' : 'absolute',
    });
  };

  const clearSelected = () => {
    if (!selected) return;
    const key = controlKey(selected);
    for (const b of midi.map.bindings) if (controlKey(b.source) === key) midi.removeBinding(b.id);
  };

  /** The picture as a PNG, for the phone or the desk. */
  const savePng = async () => {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    await img.decode().catch(() => {});
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = surface.width * scale; canvas.height = surface.height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = paper ? '#ffffff' : '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `chromaglass-${surface.id}-cheatsheet.png`;
    a.click();
  };

  const ink = paper ? '#111827' : '#ffffff';
  // Paper mode is for printing, so the chrome turns to paper too — the side
  // list is part of what a photograph of this screen has to be readable in.
  const card = paper ? 'border-black/10 bg-black/[0.03]' : 'border-white/10 bg-white/5';
  const btn = `px-2.5 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${paper ? 'border-black/15 bg-black/5 hover:bg-black/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`;
  const chip = `px-2 py-1 rounded-md border text-[10px] flex items-center gap-1.5 disabled:opacity-30 ${paper ? 'border-black/15 bg-black/5 hover:bg-black/15' : 'border-white/10 bg-white/5 hover:bg-white/15'}`;
  const faint = paper ? 'rgba(17,24,39,0.45)' : 'rgba(255,255,255,0.35)';
  const panel = paper ? '#ffffff' : '#0a0a0a';

  const matches = (label: string) => !filter || label.toLowerCase().includes(filter.toLowerCase());

  const drawControl = (c: SurfaceControl) => {
    const target = byKey.get(controlKey(c));
    const isSel = selected?.id === c.id;
    const touched = performance.now() - (lit[controlKey(c)] ?? -1e9) < 600;
    const raw = target ? colourOf(target) : null;
    const colour = raw ? readable(raw, paper) : null;
    const round = c.shape === 'round' || c.shape === 'knob';
    const r = c.shape === 'knob' ? c.w / 2 : c.shape === 'round' ? c.h / 2 : c.shape === 'pad' ? 6 : 4;
    const label = target ? shortLabel(target, presetName) : c.label;
    // A tall fader is 22 units across and 96 down, so its label runs along it,
    // the way a mixer strip is labelled.
    const along = c.shape === 'fader' && c.h > c.w * 1.5;
    const { lines, size: fontSize } = fitLabel(label, c.w, c.h, along, round, !!target);
    const fill = raw ? `${raw}${target?.kind === 'dye' ? '55' : '33'}` : (paper ? 'rgba(17,24,39,0.04)' : 'rgba(255,255,255,0.04)');
    const edge = touched ? (paper ? '#111827' : '#ffffff') : isSel ? '#22d3ee' : (colour ?? faint);
    // The track line runs the length of the fader, whichever way it lies — on
    // the horizontal crossfader a vertical one struck through its own label —
    // and it breaks around the label rather than scoring it through.
    const long = along ? c.h : c.w;
    const gap = Math.min(long - 16, Math.max(...lines.map(l => em(l, !!target))) * fontSize + 5);
    const track: [number, number][] = c.shape !== 'fader' ? []
      : [[6, (long - gap) / 2], [(long + gap) / 2, long - 6]].filter(([a, b]) => b - a > 2) as [number, number][];
    return (
      <g
        key={c.id}
        onClick={() => setSelected(c)}
        style={{ cursor: 'pointer' }}
        role="button"
        aria-label={`${c.label}${target ? `, ${shortLabel(target, presetName)}` : ', unassigned'}`}
        data-testid={`surface-${c.id}`}
        data-bound={target ? 'true' : 'false'}
      >
        {round
          ? <ellipse cx={c.x + c.w / 2} cy={c.y + c.h / 2} rx={c.w / 2} ry={c.h / 2} fill={fill} stroke={edge} strokeWidth={isSel || touched ? 2.4 : 1} />
          : <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={r} fill={fill} stroke={edge} strokeWidth={isSel || touched ? 2.4 : 1} />}
        {c.shape === 'fader' && track.map(([a, b], i) => (along
          ? <line key={i} x1={c.x + c.w / 2} y1={c.y + a} x2={c.x + c.w / 2} y2={c.y + b} stroke={faint} strokeWidth={1} />
          : <line key={i} x1={c.x + a} y1={c.y + c.h / 2} x2={c.x + b} y2={c.y + c.h / 2} stroke={faint} strokeWidth={1} />))}
        {lines.map((l, i) => {
          const cx = c.x + c.w / 2;
          const cy = c.y + c.h / 2;
          return (
            <text
              key={i}
              x={cx}
              y={cy + (i - (lines.length - 1) / 2) * (fontSize + 1.5) + fontSize / 3}
              transform={along ? `rotate(-90 ${cx} ${cy})` : undefined}
              textAnchor="middle"
              fontSize={fontSize}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontWeight={target ? 700 : 400}
              fill={target ? (colour ?? ink) : faint}
            >{l}</text>
          );
        })}
      </g>
    );
  };

  const section = (title: string, rows: { key: string; label: string; target: MidiTarget; swatch?: string }[]) => {
    const shown = rows.filter(r => matches(r.label));
    if (shown.length === 0) return null;
    return (
      <div className="mb-4">
        <div className="text-[9px] uppercase tracking-[0.25em] opacity-40 mb-1.5">{title}</div>
        <div className="flex flex-wrap gap-1">
          {shown.map(r => (
            <button
              key={r.key}
              onClick={() => assign(r.target)}
              disabled={!selected}
              className={chip}
              data-testid={`assign-${r.key}`}
            >
              {r.swatch && <span className="w-2 h-2 rounded-full" style={{ background: r.swatch }} />}
              {r.label}
            </button>
          ))}
        </div>
      </div>
    );
  };

  // Through a portal: the panel that opens this is animated with a transform,
  // and a transformed ancestor makes `fixed` position against it rather than
  // against the window, which pins a full-screen overlay inside a drawer.
  return createPortal((
    <div
      className={`fixed inset-0 z-[60] backdrop-blur-xl overflow-auto ${paper ? 'bg-white text-neutral-900' : 'bg-black/95 text-white'}`}
      data-testid="controller-surface"
      data-paper={paper ? 'true' : 'false'}
    >
      <div className="flex items-start justify-between p-5 pb-2">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{surface.name}</h2>
          <p className="text-[11px] opacity-50 max-w-2xl">
            Touch a control on the controller, or click one here, then pick what it should do.
            The picture is the cheat sheet: save it for the phone or the desk.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPaper(p => !p)} className={btn} data-testid="surface-paper">
            {paper ? 'On screen' : 'On paper'}
          </button>
          <button onClick={savePng} className={`${btn} flex items-center gap-1.5`} data-testid="surface-png">
            <Printer size={12} /> Save PNG
          </button>
          <button onClick={onClose} className={`p-2 rounded-full ${paper ? 'hover:bg-black/10' : 'hover:bg-white/10'}`} aria-label="Close the controller picture"><X size={18} /></button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-4 px-5 pb-6">
        <div className="flex-1 min-w-0">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${surface.width} ${surface.height}`}
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-auto rounded-2xl border"
            style={{ background: panel, borderColor: paper ? '#d1d5db' : 'rgba(255,255,255,0.1)' }}
          >
            <rect x={0} y={0} width={surface.width} height={surface.height} fill={panel} />
            {surface.controls.map(drawControl)}
          </svg>
          <div className="flex flex-wrap gap-3 mt-2 text-[10px] opacity-60">
            {(['preset', 'dye', 'action', 'setting'] as MidiTarget['kind'][]).map(k => (
              <span key={k} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: readable(KIND_COLOUR[k], paper) }} />
                {k === 'dye' ? 'Dye (in its own colour)' : k[0].toUpperCase() + k.slice(1)}
              </span>
            ))}
            <span className="opacity-70">{midi.map.bindings.length} assigned</span>
          </div>
          <ul className="mt-2 text-[10px] opacity-40 list-disc pl-4 space-y-0.5">
            {surface.notes.map(n => <li key={n}>{n}</li>)}
          </ul>
        </div>

        <div className="xl:w-80 shrink-0">
          <div className={`rounded-2xl border p-3 ${card}`}>
            {selected ? (
              <div className="mb-3">
                <div className="text-[9px] uppercase tracking-[0.25em] opacity-40">Selected</div>
                <div className="text-sm font-bold">{selected.label}</div>
                <div className="text-[10px] font-mono opacity-50">
                  {selected.kind === 'cc' ? 'CC' : 'Note'} {selected.number} · ch {selected.channel + 1}
                  {selected.relative ? ' · endless' : ''}
                </div>
                <button onClick={clearSelected} className={`mt-2 ${chip}`} data-testid="surface-clear">
                  <Eraser size={11} /> Unassign
                </button>
              </div>
            ) : (
              <p className="text-[11px] opacity-50 mb-3">Touch a control on the controller, or click one in the picture.</p>
            )}

            <div className="relative mb-3">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-40" />
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Find a preset, dye, action or control"
                aria-label="Filter what to assign"
                className={`w-full rounded-lg pl-7 pr-2 py-1.5 text-xs border focus:outline-none ${paper ? 'bg-black/[0.03] border-black/15 focus:border-black/40' : 'bg-white/5 border-white/10 focus:border-white/40'}`}
                data-testid="surface-filter"
              />
            </div>

            <div className="max-h-[52vh] overflow-y-auto pr-1 scrollbar-hide">
              {section('Presets', presets.map(p => ({ key: `preset-${p.id}`, label: p.name, target: { kind: 'preset', presetId: p.id } as MidiTarget })))}
              {section('Dyes', PALETTE.map((p, i) => ({ key: `dye-${i}`, label: p.name, swatch: p.hex, target: { kind: 'dye', paletteIndex: i } as MidiTarget })))}
              {section('Actions', (Object.keys(ACTION_LABELS) as MidiAction[]).map(a => ({ key: `action-${a}`, label: ACTION_LABELS[a], target: { kind: 'action', action: a } as MidiTarget })))}
              {section('Controls', LEARNABLE_SETTINGS.map(s => ({ key: `setting-${s.key}`, label: s.label, target: { kind: 'setting', key: s.key, min: s.min, max: s.max } as MidiTarget })))}
            </div>
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}
