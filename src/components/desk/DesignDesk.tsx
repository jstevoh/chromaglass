import { useRef, useState } from 'react';
import { ToolAmountChip, ToolOptions, toolUnder } from '../ToolAmount';
import { createPortal } from 'react-dom';
import type { ReactNode, Ref } from 'react';
import { ImagePlus, SlidersHorizontal } from 'lucide-react';
import { Button, Segmented, Slider, Swatch, Tag, Toggle } from '../ui';
import { PerformanceButton } from './PerformanceButton';
import { DeskHeader, type DeskDots, type DeskMode } from './DeskHeader';
import { readSetting } from '../../lib/readout';
import { PIN_RANGE } from '../../lib/deskPins';
import { PickList } from './PickList';
import type { LiquidType, VisualizerSettings } from '../../types';
import { DESK_TOOLS } from './tools';

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

const RANGE = PIN_RANGE;

/** The same eight tools on both desks (`tools.ts`). */
const TOOLS = DESK_TOOLS;

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
  /** How much each tool does, and a way to set any of them (ToolOptions, from a right-click on a tool). */
  amountOf?: (tool: string) => number;
  onAmountFor?: (tool: string, v: number) => void;
  /** How much the tool in hand does (ToolAmount). */
  toolAmount?: number;
  onToolAmount?: (v: number) => void;
  layer: number;
  layers: number;
  onLayer: (n: number) => void;
  onAddLayer: () => void;
  /** What is on each live layer, for the tabs. */
  layerReport?: { index: number; fill: number; colour: string }[];

  settings: VisualizerSettings;
  onSetting: (patch: Partial<VisualizerSettings>) => void;
  /** Whether the plate is evolving on its own, and the switch for it. */
  automated: boolean;
  onAutomate: (on: boolean) => void;
  /** What is on the recipe, and the bench's right to change it. */
  recipeKeys: (keyof VisualizerSettings)[];
  onRecipeKeys: (keys: (keyof VisualizerSettings)[]) => void;
  onRandomise: () => void;
  randomiseArmed: boolean;

  plateRef: Ref<HTMLDivElement>;
  lookName: string | null;
  edited: boolean;
  onSave: () => void;
  onSaveAs: () => void;
  onNew: () => void;
  /** Whether the look has unsaved changes, for the dot on Save. */
  dirty: boolean;
  onSendToWall: () => void;

  mode: DeskMode;
  onMode: (m: DeskMode) => void;
  dots: DeskDots;
  midiName: string | null;
  /** The controller panel, from the header's MIDI dot. */
  onMic: () => void;
  onWall: () => void;
  onMidi: () => void;
  onPhone: () => void;
  onPerformance: () => void;
  /** The performance being recorded: its clock and the song attached so far. */
  performance: { clock: string; title?: string } | null;
  onSearch: () => void;
  /** Open the settings sheet showing everything — the bench's way to the rest. */
  onOpenSettings: () => void;
  status: { audio: string; engine: string };
}

export function DesignDesk(p: DesignDeskProps) {
  /**
   * The document menu, hung off the look's own name.
   *
   * Drawn outside the desk, at the name's position. The plate is painted over
   * its hole in the desk from a layer above the desk (so the canvas gets the
   * pointer; see LiquidVisualizer), and the desk is one fixed layer: anything
   * inside it, however high its own z-index, stays under the plate. The menu
   * hangs down over the preview, so inside the desk its lower half went under
   * the picture.
   */
  const [docMenu, setDocMenu] = useState<{ top: number; left: number } | null>(null);
  const docButton = useRef<HTMLButtonElement | null>(null);
  const toggleDocMenu = () => {
    if (docMenu) { setDocMenu(null); return; }
    const r = docButton.current?.getBoundingClientRect();
    if (r) setDocMenu({ top: r.bottom + 4, left: r.left });
  };
  const [picking, setPicking] = useState(false);
  /** A tool's own options, open by a right-click on it or the Amount chip. */
  const [toolMenu, setToolMenu] = useState<{ tool: string; at: { x: number; y: number } } | null>(null);
  return (
    <div className="fixed inset-0 z-10 grid bg-bg text-text"
      style={{ gridTemplateColumns: '272px minmax(0, 1fr) 312px', gridTemplateRows: '48px 1fr 28px' }}
      data-testid="design-desk">

      <DeskHeader
        breadcrumb={
          <>
            <span className="text-muted">Look</span>
            <span className="text-faint">/</span>
            <div className="relative flex min-w-0 items-center gap-2">
              <button
                ref={docButton}
                onClick={toggleDocMenu}
                className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] font-medium text-text transition-colors hover:bg-hover"
                title="New, Save, Save as…"
                data-testid="doc-menu-button"
              >
                <span className="truncate">{p.lookName ?? 'Untitled'}</span>
                <span className="text-faint">⌄</span>
              </button>
              {p.edited && <Tag>edited</Tag>}
              {docMenu && createPortal((
                <>
                  <div className="fixed inset-0 z-[60]" onClick={() => setDocMenu(null)} />
                  <div
                    className="fixed z-[61] w-56 overflow-hidden rounded-md border border-border-strong bg-surface shadow-2xl"
                    style={{ top: docMenu.top, left: docMenu.left }}
                    data-testid="doc-menu"
                  >
                    {[
                      ['New — an empty plate', '', p.onNew, 'doc-new'],
                      ['Save', '⌘S', p.onSave, 'doc-save'],
                      ['Save as…', '⇧⌘S', p.onSaveAs, 'doc-save-as'],
                    ].map(([label, kbd, run, id]) => (
                      <button
                        key={String(id)}
                        onClick={() => { setDocMenu(null); (run as () => void)(); }}
                        className="flex w-full items-center justify-between gap-4 px-3 py-2 text-left text-[13px] text-text-2 transition-colors hover:bg-hover hover:text-text"
                        data-testid={String(id)}
                      >
                        <span>{String(label)}</span>
                        {kbd ? <span className="font-mono text-[11px] text-faint">{String(kbd)}</span> : null}
                      </button>
                    ))}
                  </div>
                </>
              ), document.body)}
            </div>
          </>
        }
        mode={p.mode}
        onMode={p.onMode}
        dots={p.dots}
        midiName={p.midiName}
        onMic={p.onMic}
        onWall={p.onWall}
        onMidi={p.onMidi}
        onPhone={p.onPhone}
        onPerformance={p.onPerformance}
        onSearch={p.onSearch}
        trailing={
          <>
            {/*
              New, Save, Save as — the three a document needs.

              Save used to be the only one, and it made a new copy every time
              and downloaded a file, so there was no way to save over what you
              were working on and no way to begin from nothing. The dot on Save
              is whether there is anything to save.
            */}
            <Button height={32} kbd="⌘⏎" onClick={p.onSendToWall} testId="send-to-wall">
              <span className="hidden xl:inline">Send to&nbsp;</span>wall
            </Button>
            <Button height={32} variant="primary" kbd="⌘S" onClick={p.onSave} testId="save-look">
              {p.dirty ? 'Save •' : 'Save'}
            </Button>
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
            {p.swatches.map((c, i) => (
              <Swatch
                key={c.hex}
                hex={c.hex}
                selected={p.dye?.toLowerCase() === c.hex.toLowerCase()}
                onClick={() => p.onDye(c.hex)}
                // The grid is the palette in order, so the index *is* the
                // palette index a dye pad fires.
                midiKey={`dye:${i}`}
                className="h-8 w-full"
                title={c.name}
                testId={`swatch-${c.hex.replace('#', '')}`}
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
          <PerformanceButton performance={p.performance} onToggle={p.onPerformance} />
          <span className="flex items-center gap-2">
            {/*
              Each layer says what is on it.

              It was "Layer 1" and "Layer 2" and nothing else, so there was no
              telling an empty layer from a full one, what colour was on it, or
              whether it was contributing anything — which makes switching
              blind, and makes anything that happens to change at the same time
              look like the switch having caused it.

              The dot is the layer's own mean dye and the bar is how full it is,
              both from sums the solver already keeps.
            */}
            <div className="inline-flex rounded-md border border-border bg-elevated p-0.5" role="tablist" data-testid="layer-segmented">
              {Array.from({ length: Math.max(1, p.layers) }, (_, i) => {
                const rep = p.layerReport?.[i];
                return (
                  <button
                    key={i}
                    role="tab"
                    aria-selected={p.layer === i}
                    onClick={() => p.onLayer(i)}
                    style={{ height: 28 }}
                    data-testid={`layer-segmented-${i}`}
                    className={`inline-flex items-center gap-2 rounded-sm px-3 text-[13px] font-medium transition-colors duration-[120ms] ${
                      p.layer === i ? 'bg-active text-text' : 'text-muted hover:text-text-2'
                    }`}
                    title={rep ? `Layer ${i + 1} — ${Math.round(rep.fill * 100)}% full` : `Layer ${i + 1}`}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/20"
                      style={{ background: rep?.colour ?? '#111111' }}
                    />
                    Layer {i + 1}
                    <span className="h-1 w-6 shrink-0 overflow-hidden rounded-full bg-border" aria-hidden>
                      <span className="block h-full rounded-full bg-text-2" style={{ width: `${Math.round((rep?.fill ?? 0) * 100)}%` }} />
                    </span>
                  </button>
                );
              })}
            </div>
            {p.layers < 2 && (
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
        {/*
          The tools, and the Amount beside them when there is room and on a
          line of its own when there is not: squeezed into what the tools left
          at 1280 it was a sliver (reported). Wrapping, the row is no wider
          than its widest item, so it cannot push the preview narrower.
        */}
        <div className="mt-3 flex min-h-9 shrink-0 flex-wrap items-center gap-y-2">
          {/* Right-click a tool for its own options (ToolOptions). */}
          <div
            className="contents"
            onContextMenu={(e) => {
              const t = toolUnder(e, 'tool-segmented');
              if (!t || !p.amountOf) return;
              e.preventDefault();
              setToolMenu({ tool: t, at: { x: e.clientX, y: e.clientY } });
            }}
          >
          <Segmented
            value={p.tool}
            options={TOOLS.map(([id, label, k]) => [id, label, k] as const)}
            onChange={p.onTool}
            testId="tool-segmented"
          />
          </div>
          {p.onToolAmount && <ToolAmountChip tool={p.tool} value={p.toolAmount ?? 1} onOpen={(at) => setToolMenu({ tool: p.tool, at })} />}
          {toolMenu && p.amountOf && p.onAmountFor && (
            <ToolOptions
              tool={toolMenu.tool}
              value={p.amountOf(toolMenu.tool)}
              onChange={(v) => p.onAmountFor!(toolMenu.tool, v)}
              at={toolMenu.at}
              onClose={() => setToolMenu(null)}
            />
          )}
        </div>
      </section>

      {/* ── The recipe ───────────────────────────────────────── */}
      <aside className="flex min-h-0 flex-col border-l border-border" data-testid="recipe">
        <div className="flex h-11 shrink-0 items-center justify-between px-4">
          <span className="text-[13px] font-medium">Recipe</span>
          {/*
            The bench could not be changed.

            Its eight were a constant in this file, so the one screen whose
            whole job is building a look could only build it out of eight of
            the ninety things a look is made of. Everything else meant opening
            Settings, finding the control, moving it, and finding it again the
            next time. Choose is the same picker the desk's rides use, over the
            same list, so whatever can ride there can sit here.
          */}
          <button
            onClick={() => setPicking(v => !v)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors ${
              picking ? 'bg-text text-bg' : 'text-dim hover:bg-hover hover:text-text'
            }`}
            title="Choose which controls are on the recipe"
            data-testid="recipe-pick"
          >
            <SlidersHorizontal size={13} /> {picking ? 'Done' : 'Choose'}
          </button>
        </div>
        {picking ? (
          <PickList chosen={p.recipeKeys} onChange={p.onRecipeKeys} testId="recipe-picker" />
        ) : (
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide px-4">
          {p.recipeKeys.length === 0 && (
            <p className="py-3 text-[13px] leading-relaxed text-dim">
              Nothing on the recipe. <span className="text-text">Choose</span> picks what is here.
            </p>
          )}
          {p.recipeKeys.map(key => {
            const spec = RANGE.get(String(key));
            if (!spec) return null;          // a key saved by an older build
            const raw = p.settings[key];
            const v = typeof raw === 'number' ? raw : spec.min;
            return (
              <Slider
                key={String(key)}
                label={spec.label}
                value={v}
                min={spec.min}
                max={spec.max}
                // A stepped control lands on a step, as it does on the sheet.
                step={spec.step}
                display={readSetting(String(key), v, spec.min, spec.max)}
                onChange={n => p.onSetting({ [key]: n } as Partial<VisualizerSettings>)}
                midiKey={`setting:${String(key)}`}
                testId={`recipe-${String(key)}`}
              />
            );
          })}
          <div className="mt-2 border-t border-border pt-3">
            <Toggle
              label="Random evolve"
              // The real switch. This used to write automateRate between 0 and
              // 0.15, which only sets how often an evolving plate does something:
              // with evolving off (the default) it showed "on" and did nothing.
              on={p.automated}
              onChange={on => {
                p.onAutomate(on);
                if (on && (p.settings.automateRate ?? 0) < 0.02) p.onSetting({ automateRate: 0.15 });
              }}
              testId="toggle-evolve"
            />
          </div>

        </div>
        )}
        {/*
          The way in to the rest, pinned.

          The recipe is what you chose to have out. Everything else — the room
          camera, the projectors, the solver, the physics — is still a panel
          away, and that panel used to be reachable only through ⌘K, which is a
          thing you have to already know about. A bench that cannot be used to
          reach the whole of what it is building is not a bench.

          In the pinned footer and not at the end of the recipe, because the
          recipe scrolls: put there, the one control whose job is to be found
          was itself below the fold.
        */}
        <div className="shrink-0 border-t border-border px-3 pt-3">
          <Button full height={40} onClick={p.onOpenSettings} testId="open-all-settings">
            All settings…
          </Button>
        </div>
        <div className="flex shrink-0 gap-2 p-3">
          <Button
            full height={40}
            onClick={() => p.onSetting({ macroMode: !p.settings.macroMode })}
            midiKey="action:macro-toggle"
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
            midiKey="action:lucky"
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
