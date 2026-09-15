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

/** Break a label into at most `lines` rows that fit `chars` characters each. */
function wrap(text: string, chars: number, lines: number): string[] {
  const clip = (l: string) => (l.length > chars ? `${l.slice(0, Math.max(1, chars - 1))}…` : l);
  if (lines <= 1) return [clip(text)];
  const words = text.split(' ');
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= chars) { cur = next; continue; }
    if (cur) out.push(cur);
    cur = w;
    if (out.length === lines) break;
  }
  if (cur && out.length < lines) out.push(cur);
  // Ran out of room: say so on the last line rather than silently dropping words.
  if (out.join(' ').length < text.length) out[out.length - 1] = clip(`${out[out.length - 1]}…`);
  return out.map(clip);
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
  const faint = paper ? 'rgba(17,24,39,0.45)' : 'rgba(255,255,255,0.35)';
  const panel = paper ? '#ffffff' : '#0a0a0a';

  const matches = (label: string) => !filter || label.toLowerCase().includes(filter.toLowerCase());

  const drawControl = (c: SurfaceControl) => {
    const target = byKey.get(controlKey(c));
    const isSel = selected?.id === c.id;
    const touched = performance.now() - (lit[controlKey(c)] ?? -1e9) < 600;
    const colour = target ? colourOf(target) : null;
    const round = c.shape === 'round' || c.shape === 'knob';
    const r = c.shape === 'knob' ? c.w / 2 : c.shape === 'round' ? c.h / 2 : c.shape === 'pad' ? 6 : 4;
    const label = target ? shortLabel(target, presetName) : c.label;
    // A tall fader is 22 units across and 96 down, so its label runs along it,
    // the way a mixer strip is labelled.
    const along = c.shape === 'fader' && c.h > c.w * 1.5;
    const chars = Math.max(5, Math.round((along ? c.h : c.w) / 4.6));
    const lines = wrap(label, chars, along ? 1 : c.h >= 40 ? 3 : c.h >= 26 ? 2 : 1);
    const fontSize = c.h >= 40 && !along ? 8 : 7;
    const fill = colour ? `${colour}${target?.kind === 'dye' ? '55' : '33'}` : (paper ? 'rgba(17,24,39,0.04)' : 'rgba(255,255,255,0.04)');
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
          ? <ellipse cx={c.x + c.w / 2} cy={c.y + c.h / 2} rx={c.w / 2} ry={c.h / 2} fill={fill} stroke={touched ? '#ffffff' : isSel ? '#22d3ee' : (colour ?? faint)} strokeWidth={isSel || touched ? 2.4 : 1} />
          : <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={r} fill={fill} stroke={touched ? '#ffffff' : isSel ? '#22d3ee' : (colour ?? faint)} strokeWidth={isSel || touched ? 2.4 : 1} />}
        {c.shape === 'fader' && (
          <line x1={c.x + c.w / 2} y1={c.y + 6} x2={c.x + c.w / 2} y2={c.y + c.h - 6} stroke={faint} strokeWidth={1} />
        )}
        {lines.map((l, i) => {
          const cx = c.x + c.w / 2;
          const cy = c.y + c.h / 2;
          return (
            <text
              key={i}
              x={cx}
              y={along ? cy + fontSize / 3 : cy + (i - (lines.length - 1) / 2) * (fontSize + 1.5) + fontSize / 3}
              transform={along ? `rotate(-90 ${cx} ${cy})` : undefined}
              textAnchor="middle"
              fontSize={fontSize}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontWeight={target ? 700 : 400}
              fill={target ? (paper ? '#111827' : colour ?? ink) : faint}
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
              className="px-2 py-1 rounded-md border border-white/10 bg-white/5 hover:bg-white/15 disabled:opacity-30 text-[10px] flex items-center gap-1.5"
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
    <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-xl text-white overflow-auto" data-testid="controller-surface">
      <div className="flex items-start justify-between p-5 pb-2">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{surface.name}</h2>
          <p className="text-[11px] opacity-50 max-w-2xl">
            Touch a control on the controller, or click one here, then pick what it should do.
            The picture is the cheat sheet: save it for the phone or the desk.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPaper(p => !p)} className="px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-[10px] font-bold uppercase tracking-wider" data-testid="surface-paper">
            {paper ? 'On screen' : 'On paper'}
          </button>
          <button onClick={savePng} className="px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" data-testid="surface-png">
            <Printer size={12} /> Save PNG
          </button>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10" aria-label="Close the controller picture"><X size={18} /></button>
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
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: KIND_COLOUR[k] }} />
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
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            {selected ? (
              <div className="mb-3">
                <div className="text-[9px] uppercase tracking-[0.25em] opacity-40">Selected</div>
                <div className="text-sm font-bold">{selected.label}</div>
                <div className="text-[10px] font-mono opacity-50">
                  {selected.kind === 'cc' ? 'CC' : 'Note'} {selected.number} · ch {selected.channel + 1}
                  {selected.relative ? ' · endless' : ''}
                </div>
                <button onClick={clearSelected} className="mt-2 px-2 py-1 rounded-md border border-white/10 bg-white/5 hover:bg-white/15 text-[10px] flex items-center gap-1.5" data-testid="surface-clear">
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
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-2 py-1.5 text-xs focus:outline-none focus:border-white/40"
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
