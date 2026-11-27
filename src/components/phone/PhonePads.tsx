import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { PALETTE } from '../../constants';
import { DEFAULT_LIQUID_TYPES } from '../../types';
import { padDoor } from '../../lib/padDoor';
import { PAD_LAYOUT_HELP, PAD_LAYOUT_LABELS, padLayoutBindings, type PadLayout } from '../../lib/padLayouts';
import { PAD_TOOL_LABELS, padTargetLabel, type PadTarget } from '../../lib/padTarget';
import type { MidiTarget } from '../../lib/midi';

/**
 * The APC40's grid on the phone (PLAN 30c): the same three layouts, the same
 * pads, held as long as a finger is on them, through the same engine
 * (lib/padDoor.ts into app/usePadHits.ts). Every feature ships its phone
 * version, and this is the controller's: a phone in the other hand is a
 * grid of pads too.
 *
 * Laid from `padLayoutBindings`, the board's own, so the phone cannot drift
 * from the APC40: row for row and pad for pad it is the same grid, and the
 * row of pickers under it is Track Select. A pen's pressure is the squeeze
 * (aftertouch's); a finger has none a browser can read, so it is a full one.
 */
const LAYOUTS: PadLayout[] = ['tools-colours', 'liquids-colours', 'liquids-tools'];
const ROWS = 5, COLS = 8;
const liquidOf = (id?: string) => DEFAULT_LIQUID_TYPES.find(l => l.id === id);

/** What a pad or a picker shows: its colour if it has one, the liquid's own if it is a liquid's, else grey. */
function swatch(t: MidiTarget): string {
  if (t.kind === 'pad' && t.dye !== undefined) return PALETTE[t.dye]?.hex ?? '#888888';
  if (t.kind === 'dye') return PALETTE[t.paletteIndex]?.hex ?? '#888888';
  const liq = t.kind === 'pad' || t.kind === 'hand' ? liquidOf(t.liquid) : undefined;
  return liq?.own ?? liq?.color ?? '#5b6472';
}
function caption(t: MidiTarget, layout: PadLayout): string {
  if (t.kind === 'dye') return PALETTE[t.paletteIndex]?.name.split(' ').pop() ?? '';
  if (t.kind === 'hand') return t.tool ? PAD_TOOL_LABELS[t.tool] : liquidOf(t.liquid)?.name ?? '';
  if (t.kind !== 'pad') return '';
  // The grid's first column names its row, and Liquids × Tools' top row its columns.
  if (layout === 'liquids-tools') return t.tool ? PAD_TOOL_LABELS[t.tool] : '';
  if (t.lane !== 0) return '';
  return t.tool ? PAD_TOOL_LABELS[t.tool] : liquidOf(t.liquid)?.name ?? '';
}

export function PhonePads({ testId = 'phone-pads' }: { testId?: string }) {
  const [layout, setLayout] = useState<PadLayout>('tools-colours');
  const [picked, setPicked] = useState<number | null>(null);
  const held = useRef(new Set<number>());
  const all = padLayoutBindings(layout, []);
  const grid: (PadTarget | null)[] = Array.from({ length: ROWS * COLS }, () => null);
  for (const b of all) if (b.source.number < ROWS * COLS && b.target.kind === 'pad') grid[(ROWS - 1 - Math.floor(b.source.number / COLS)) * COLS + (b.source.number % COLS)] = b.target;
  const pickers = all.filter(b => b.source.number >= ROWS * COLS).sort((a, b) => a.source.channel - b.source.channel);

  const squeezeOf = (e: ReactPointerEvent) => (e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 1);
  const down = (i: number, t: PadTarget) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    held.current.add(i);
    padDoor()?.hit(i, t, squeezeOf(e));
  };
  const move = (i: number) => (e: ReactPointerEvent) => { if (held.current.has(i) && e.pointerType === 'pen') padDoor()?.press(i, squeezeOf(e)); };
  const up = (i: number) => () => { if (held.current.delete(i)) padDoor()?.lift(i); };

  return (
    <div className="flex flex-col gap-1.5" data-testid={testId}>
      <div className="grid grid-cols-3 gap-1">
        {LAYOUTS.map(l => (
          <button
            key={l}
            onClick={() => { setLayout(l); setPicked(null); }}
            aria-pressed={layout === l}
            className={`min-h-[44px] rounded-lg border px-1 text-[12px] ${layout === l ? 'border-white/40 bg-white/15 text-white' : 'border-white/10 text-text-2'}`}
            data-testid={`${testId}-layout-${l}`}
          >
            {PAD_LAYOUT_LABELS[l]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-8 gap-1 select-none" style={{ touchAction: 'none' }}>
        {grid.map((t, i) => t && (
          <button
            key={`${layout}-${i}`}
            onPointerDown={down(i, t)}
            onPointerMove={move(i)}
            onPointerUp={up(i)}
            onPointerCancel={up(i)}
            onContextMenu={e => e.preventDefault()}
            aria-label={padTargetLabel(t, id => liquidOf(id)?.name ?? id, d => PALETTE[d]?.name ?? `Dye ${d + 1}`)}
            className="flex aspect-square min-h-[36px] items-end justify-center overflow-hidden rounded-md border border-black/40 text-[12px] leading-none text-black/80 active:brightness-150"
            style={{ backgroundColor: swatch(t) }}
            data-testid={`${testId}-pad-${i}`}
          >
            <span className="truncate px-0.5 pb-0.5">{i < COLS || layout !== 'liquids-tools' ? caption(t, layout) : ''}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-8 gap-1">
        {pickers.map((b, i) => (
          <button
            key={`${layout}-pick-${i}`}
            onClick={() => {
              const t = b.target;
              if (t.kind === 'hand' || t.kind === 'dye') { padDoor()?.pick(t); setPicked(i); }
            }}
            aria-pressed={picked === i}
            aria-label={caption(b.target, layout)}
            className={`min-h-[44px] overflow-hidden rounded-md border text-[12px] leading-tight ${picked === i ? 'border-white text-white' : 'border-white/10 text-text-2'}`}
            style={b.target.kind === 'dye' ? { boxShadow: `inset 0 -6px 0 ${swatch(b.target)}` } : undefined}
            data-testid={`${testId}-pick-${i}`}
          >
            <span className="block truncate px-0.5">{caption(b.target, layout)}</span>
          </button>
        ))}
      </div>
      <p className="text-[13px] leading-snug text-muted">{PAD_LAYOUT_HELP[layout]} Hold a pad and it keeps going: Drip drips, Pour pours, Press presses.</p>
    </div>
  );
}
