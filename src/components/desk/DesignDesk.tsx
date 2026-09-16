import type { ReactNode, Ref } from 'react';
import { ImagePlus } from 'lucide-react';
import { Button, Segmented, Slider, Tag, Toggle } from '../ui';
import { DeskHeader, type DeskDots, type DeskMode } from './DeskHeader';
import { LEARNABLE_SETTINGS } from '../../lib/midi';
import type { LiquidType, VisualizerSettings } from '../../types';

/**
 * The bench, to the handoff's Design screen.
 *
 * The same three columns as Perform, holding the other half of the job. Where
 * the desk asks "which look, and when", this asks "what is this look made
 * of": the bottles and the dyes on the left, the plate you paint on in the
 * middle, the recipe on the right.
 *
 * The plate here is not the wall. It says so — a look being built is not the
 * one an audience is watching, and the single most expensive mistake in this
 * app is thinking it is. Send to wall is a deliberate, separate act.
 */

const RANGE = new Map(LEARNABLE_SETTINGS.map(s => [s.key, s]));

/** The eight a look is actually built from, in the order you reach for them. */
const RECIPE: { key: keyof VisualizerSettings; label: string; read?: (v: number) => string }[] = [
  { key: 'globalSpeed',     label: 'Speed',      read: v => v.toFixed(3) },
  { key: 'turbulenceScale', label: 'Turbulence' },
  { key: 'audioImpact',     label: 'Sound drive' },
  { key: 'beatSqueeze',     label: 'Beat kick' },
  { key: 'bloom',           label: 'Bloom' },
  { key: 'granulation',     label: 'Grain' },
  { key: 'macroZoom',       label: 'Zoom',       read: v => `${v.toFixed(2)}×` },
  { key: 'automateRate',    label: 'Evolve speed' },
];

/** All seven, with the letter that picks each one. */
const TOOLS = [
  ['dropper', 'Drop', 'D'], ['spray', 'Spray', 'S'], ['splatter', 'Splat', 'X'],
  ['pour', 'Pour', 'O'], ['streak', 'Streak', 'K'], ['blow', 'Blow', 'W'], ['press', 'Press', 'P'],
] as const;

export interface DesignDeskProps {
  /** The bottles, already in the two groups the bench thinks in. */
  dyeBottles: LiquidType[];
  behaviourBottles: LiquidType[];
  bottleId: string;
  onBottle: (id: string) => void;
  /** The dye grid: every colour the palette holds. */
  swatches: { hex: string; name: string }[];
  dye: string | null;
  onDye: (hex: string) => void;
  /** Colour harmonies. `null` is Auto — the music picks. */
  palettes: { name: string; colours: string[] }[];
  paletteLock: number | null;
  onPalette: (i: number | null) => void;
  onImageDye: () => void;

  tool: string;
  onTool: (t: string) => void;
  layer: number;
  layers: number;
  onLayer: (n: number) => void;
  onAddLayer: () => void;

  settings: VisualizerSettings;
  onSetting: (patch: Partial<VisualizerSettings>) => void;
  onRandomise: () => void;
  randomiseArmed: boolean;

  plateRef: Ref<HTMLDivElement>;
  lookName: string | null;
  edited: boolean;
  onSave: () => void;
  onSendToWall: () => void;

  mode: DeskMode;
  onMode: (m: DeskMode) => void;
  dots: DeskDots;
  midiName: string | null;
  onSearch: () => void;
  status: { audio: string; engine: string };
}

export function DesignDesk(p: DesignDeskProps) {
  return (
    <div className="fixed inset-0 z-10 grid bg-bg text-text"
      style={{ gridTemplateColumns: '272px 1fr 312px', gridTemplateRows: '48px 1fr 28px' }}
      data-testid="design-desk">

      <DeskHeader
        breadcrumb={
          <>
            <span className="text-muted">Look</span>
            <span className="text-faint">/</span>
            <span className="truncate">{p.lookName ?? 'Untitled'}</span>
            {p.edited && <Tag>edited</Tag>}
          </>
        }
        mode={p.mode}
        onMode={p.onMode}
        dots={p.dots}
        midiName={p.midiName}
        onSearch={p.onSearch}
        trailing={
          <>
            <Button height={32} kbd="⌘⏎" onClick={p.onSendToWall} testId="send-to-wall">Send to wall</Button>
            <Button height={32} variant="primary" kbd="⌘S" onClick={p.onSave} testId="save-look">Save</Button>
          </>
        }
      />

      {/* ── Bottles, dyes, palettes ──────────────────────────── */}
      <aside className="flex min-h-0 flex-col overflow-y-auto scrollbar-hide border-r border-border" data-testid="bench-left">
        <Group title="Bottles">
          {[...p.dyeBottles, ...p.behaviourBottles].map(l => (
            <button
              key={l.id}
              onClick={() => p.onBottle(l.id)}
              className={`flex h-10 w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors ${
                p.bottleId === l.id ? 'bg-hover text-text' : 'text-muted hover:bg-hover hover:text-text'
              }`}
              data-testid={`bottle-${l.id}`}
            >
              <span className="h-3.5 w-3.5 shrink-0 rounded-xs border border-border-strong" style={{ background: l.color }} />
              <span className="text-[13px]">{l.name}</span>
              {l.behaviour && <span className="ml-auto text-[12px] text-faint">changes the plate</span>}
            </button>
          ))}
        </Group>

        <Group title="Dye">
          <div className="grid grid-cols-6 gap-1.5">
            {p.swatches.map(c => (
              <button
                key={c.hex}
                onClick={() => p.onDye(c.hex)}
                title={c.name}
                aria-label={c.name}
                className="h-8 w-full rounded-md transition-transform active:scale-95"
                style={{
                  background: c.hex,
                  boxShadow: p.dye?.toLowerCase() === c.hex.toLowerCase()
                    ? '0 0 0 2px var(--color-bg), 0 0 0 3px #FAFAFA' : undefined,
                }}
                data-testid={`swatch-${c.hex.replace('#', '')}`}
              />
            ))}
          </div>
          <button
            onClick={p.onImageDye}
            className="mt-2 h-9 w-full rounded-md border border-dashed border-border-strong text-[13px] text-muted transition-colors hover:bg-hover hover:text-text"
            data-testid="image-dye"
          >
            <ImagePlus size={13} className="mr-1.5 inline" /> Image dye…
          </button>
        </Group>

        <Group title="Palette">
          <button
            onClick={() => p.onPalette(null)}
            className={`flex h-10 w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors ${
              p.paletteLock === null ? 'bg-hover text-text' : 'text-muted hover:bg-hover hover:text-text'
            }`}
            data-testid="palette-auto"
          >
            <span className="text-[13px]">Auto</span>
            <span className="ml-auto text-[12px] text-faint">the music picks</span>
          </button>
          {p.palettes.map((h, i) => (
            <button
              key={h.name}
              onClick={() => p.onPalette(i)}
              className={`flex h-10 w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors ${
                p.paletteLock === i ? 'bg-hover text-text' : 'text-muted hover:bg-hover hover:text-text'
              }`}
              data-testid={`palette-${i}`}
            >
              <span className="flex shrink-0 gap-0.5">
                {h.colours.slice(0, 4).map((hex, j) => (
                  <span key={j} className="h-3.5 w-2 rounded-[1px]" style={{ background: hex }} />
                ))}
              </span>
              <span className="truncate text-[13px]">{h.name}</span>
            </button>
          ))}
        </Group>
      </aside>

      {/* ── The plate you are painting ───────────────────────── */}
      <section className="flex min-h-0 flex-col px-4 py-3">
        <div className="mb-3 flex h-8 shrink-0 items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="text-[16px] font-medium">{p.lookName ?? 'Untitled'}</span>
            <span className="font-mono text-[12px] text-dim">not on wall</span>
          </span>
          <span className="flex items-center gap-2">
            <Segmented
              value={String(p.layer)}
              options={Array.from({ length: Math.max(1, p.layers) }, (_, i) => [String(i), `Layer ${i + 1}`] as const)}
              onChange={v => p.onLayer(Number(v))}
              height={32}
              testId="layer-segmented"
            />
            {p.layers < 3 && (
              <button
                onClick={p.onAddLayer}
                className="h-8 w-8 rounded-md border border-border-strong text-[15px] text-muted transition-colors hover:bg-hover hover:text-text"
                title="Another layer of liquid over this one"
                aria-label="Add a layer"
                data-testid="add-layer"
              >+</button>
            )}
          </span>
        </div>
        <div ref={p.plateRef} className="min-h-0 flex-1 rounded-lg border border-border" data-testid="desk-preview" />
        <div className="mt-3 flex h-9 shrink-0 items-center">
          <Segmented
            value={p.tool}
            options={TOOLS.map(([id, label, k]) => [id, label, k] as const)}
            onChange={p.onTool}
            testId="tool-segmented"
          />
        </div>
      </section>

      {/* ── The recipe ───────────────────────────────────────── */}
      <aside className="flex min-h-0 flex-col border-l border-border" data-testid="recipe">
        <div className="flex h-11 shrink-0 items-center px-4">
          <span className="text-[13px] font-medium">Recipe</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide px-4">
          {RECIPE.map(r => {
            const spec = RANGE.get(r.key);
            if (!spec) return null;
            const raw = p.settings[r.key];
            const v = typeof raw === 'number' ? raw : spec.min;
            return (
              <Slider
                key={String(r.key)}
                label={r.label}
                value={v}
                min={spec.min}
                max={spec.max}
                display={r.read ? r.read(v) : `${Math.round(((v - spec.min) / (spec.max - spec.min)) * 100)}%`}
                onChange={n => p.onSetting({ [r.key]: n } as Partial<VisualizerSettings>)}
                testId={`recipe-${String(r.key)}`}
              />
            );
          })}
          <div className="mt-2 border-t border-border pt-3">
            <Toggle
              label="Random evolve"
              on={(p.settings.automateRate ?? 0) > 0.02}
              onChange={on => p.onSetting({ automateRate: on ? 0.15 : 0 })}
              testId="toggle-evolve"
            />
          </div>
        </div>
        <div className="flex shrink-0 gap-2 border-t border-border p-3">
          <Button
            full height={40}
            onClick={() => p.onSetting({ macroMode: !p.settings.macroMode })}
            testId="macro-button"
          >
            {p.settings.macroMode ? 'Wide' : 'Macro'}
          </Button>
          {/*
            Randomise replaces every setting at once. It asks first, the same
            way it does on the desk: the look it replaced is recoverable, but
            only if you notice it went.
          */}
          <Button
            full height={40}
            variant={p.randomiseArmed ? 'primary' : 'secondary'}
            onClick={p.onRandomise}
            testId="randomise-button"
          >
            {p.randomiseArmed ? 'Sure?' : 'Randomise'}
          </Button>
        </div>
      </aside>

      <footer className="col-span-3 flex items-center justify-between border-t border-border px-4 font-mono text-[11px] text-dim">
        <span data-testid="status-hearing">{p.status.audio}</span>
        <span data-testid="status-running">{p.status.engine}</span>
      </footer>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-border px-3 py-3">
      <div className="mb-2 px-1 text-[11px] uppercase tracking-[0.18em] text-faint">{title}</div>
      {children}
    </div>
  );
}
