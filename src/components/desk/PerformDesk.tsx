import { useState } from 'react';
import type { ReactNode, Ref } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Button, CueRow, Segmented, Slider, Swatch, Tag, Toggle } from '../ui';
import { PALETTE } from '../../constants';
import { DeskHeader, type DeskDots, type DeskMode } from './DeskHeader';
import { readSetting } from '../../lib/readout';
import { FADE_CHOICES } from '../../lib/lookFade';
import type { VisualizerSettings } from '../../types';
import { PIN_RANGE } from '../../lib/deskPins';
import { PickList } from './PickList';
import { DESK_TOOLS } from './tools';

/**
 * The desk, to the handoff's Perform screen.
 *
 * Grid is 272 | plate | 312 across, 48 | body | 28 down. The cue list owns the
 * left because a show is a list of looks and a Go, not a settings panel; the
 * rides own the right because those are the six things a hand is on between
 * cues; the plate sits between them as a preview, since the real one is on a
 * wall behind you.
 *
 * Everything that changes the show has its key printed on it. That is not
 * decoration: in a dark room you reach for Space and B, and a label that
 * tells you so is the difference between using them and not.
 *
 * The rides read their value from `settings` rather than from local state,
 * which is what makes a MIDI fader move the bar on screen: the controller and
 * the mouse both go through `updateSettings`, so there is one value and two
 * ways to move it.
 */

export interface Cue {
  id: string;
  name: string;
  /** Two of the look's own dyes, so a row is recognisable at a glance. */
  swatch: string;
  /** Seconds, or 0 for a cut. */
  fade: number;
}

/**
 * What the strip starts with: the controls a light show is actually played on.
 *
 * Which six is the operator's choice, from `PINNABLE` — every control the
 * settings panel draws, at the range MIDI rides it at where MIDI knows it.
 * That is deliberate rather than convenient: if the desk drew from its own
 * list, the strip, the settings panel's pin chips and the controller map could
 * disagree about what is rideable, and the first time anyone noticed would be
 * on stage.
 */
export const DEFAULT_RIDES: (keyof VisualizerSettings)[] = [
  'dimmer', 'audioImpact', 'globalSpeed', 'automateRate', 'beatSqueeze', 'macroZoom',
];

const RANGE = PIN_RANGE;

/** The Dimmer's handle is white because it is the one that can black the room out. */
const WHITE = new Set<string>(['dimmer']);

interface PerformDeskProps {
  cues: Cue[];
  liveId: string | null;
  nextId: string | null;
  liveFor: string;
  onCue: (id: string) => void;
  /** Double-click a row: send it now, without arming it first. */
  onCueNow: (id: string) => void;
  onGo: () => void;
  onBack: (() => void) | null;
  onBlackout: () => void;
  blackout: boolean;
  fade: number;
  onFade: (s: number) => void;
  settings: VisualizerSettings;
  onSetting: (patch: Partial<VisualizerSettings>) => void;
  /** Whether the plate is evolving on its own, and the switch for it. */
  automated: boolean;
  onAutomate: (on: boolean) => void;
  /** Which CC each ride is learned to, so the desk and the controller agree. */
  ccFor: (key: keyof VisualizerSettings) => number | null;
  /** Which controls are on the strip, and the operator's right to change them. */
  rideKeys: (keyof VisualizerSettings)[];
  onRideKeys: (keys: (keyof VisualizerSettings)[]) => void;
  midiName: string | null;
  /** The controller panel, from the header's MIDI dot. */
  onMic: () => void;
  onWall: () => void;
  onMidi: () => void;
  onPhone: () => void;
  layer: number;
  layers: number;
  onLayer: (n: number) => void;
  tool: string;
  onTool: (t: string) => void;
  dyes: string[];
  dye: string | null;
  onDye: (hex: string) => void;
  /** The hole the plate is painted over. */
  plateRef: Ref<HTMLDivElement>;
  /** The line along the bottom: what it hears, what it runs on, what it is doing. */
  status: { audio: string; engine: string; sequence: string | null; phone: boolean; rec: string | null };
  dots: DeskDots;
  onSearch: () => void;
  /** Open the settings sheet — the desk's way to everything the six rides are not. */
  onOpenSettings: () => void;
  mode: DeskMode;
  onMode: (m: DeskMode) => void;
  breadcrumb: ReactNode;
  onFreeze: () => void;
  /** Whether the solver is already stopped, so the button can say so. */
  frozen: boolean;
  onDrain: () => void;
}

/** The same eight tools on both desks (`tools.ts`). */
const TOOLS = DESK_TOOLS;

/**
 * A dye pad fires by palette index, and the tray holds hexes — so the tray has
 * to find its own index to know which pad lights it. Null for a dye that is not
 * in the palette (an image dye, a colour picked by hand), which no pad can
 * reach and so should never flash.
 */
const dyeKey = (hex: string): string | null => {
  const i = PALETTE.findIndex(c => c.hex.toLowerCase() === hex.toLowerCase());
  return i < 0 ? null : `dye:${i}`;
};

export function PerformDesk(p: PerformDeskProps) {
  const [picking, setPicking] = useState(false);
  const next = p.cues.find(c => c.id === p.nextId) ?? null;
  const live = p.cues.find(c => c.id === p.liveId) ?? null;

  return (
    <div className="fixed inset-0 z-10 grid bg-bg text-text"
      style={{ gridTemplateColumns: '272px 1fr 312px', gridTemplateRows: '48px 1fr 28px' }}
      data-testid="perform-desk">

      <DeskHeader
        breadcrumb={p.breadcrumb}
        mode={p.mode}
        onMode={p.onMode}
        dots={p.dots}
        midiName={p.midiName}
        onMic={p.onMic}
        onWall={p.onWall}
        onMidi={p.onMidi}
        onPhone={p.onPhone}
        onSearch={p.onSearch}
      />

      {/* ── Cues ────────────────────────────────────────────── */}
      <aside className="flex min-h-0 flex-col border-r border-border" data-testid="cue-list">
        <div className="flex h-11 shrink-0 items-center justify-between px-4">
          <span className="text-[13px] font-medium text-text">Cues</span>
          <span className="font-mono text-[12px] text-faint">{p.cues.length}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide px-2 pb-2">
          {p.cues.map((c, i) => (
            <CueRow
              key={c.id}
              index={i + 1}
              name={c.name}
              swatch={c.swatch}
              state={c.id === p.liveId ? 'live' : c.id === p.nextId ? 'next' : 'idle'}
              trailing={
                c.id === p.liveId ? <Tag tone="live">live</Tag>
                : c.id === p.nextId ? <Tag tone="next">next</Tag>
                : <span className="font-mono text-[12px] text-faint">{c.fade === 0 ? 'cut' : `${c.fade}s`}</span>
              }
              onClick={() => p.onCue(c.id)}
              onDoubleClick={() => p.onCueNow(c.id)}
              midiKey={`preset:${c.id}`}
              testId={`cue-${c.id}`}
            />
          ))}
        </div>
        <div className="shrink-0 border-t border-border p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-[13px] text-muted">Fade</span>
            <Segmented
              value={String(p.fade)}
              options={FADE_CHOICES.map(s => [String(s), s === 0 ? 'cut' : `${s}s`] as const)}
              onChange={v => p.onFade(Number(v))}
              height={32}
              testId="fade-segmented"
            />
          </div>
          <Button
            variant="primary" full height={48} kbd="Space"
            onClick={p.onGo}
            disabled={!next}
            midiKey="action:go"
            testId="go-button"
          >
            {next ? `Go to ${next.name}` : 'Nothing cued'}
          </Button>
          <div className="mt-2 flex gap-2">
            <Button full height={40} kbd="⌫" onClick={() => p.onBack?.()} disabled={!p.onBack} midiKey="action:revert" testId="back-button">Back</Button>
            {/* Inverted while it is on: a blacked-out room is exactly when
                you need the button to say so without reading it. */}
            <Button
              full height={40} kbd="B"
              variant={p.blackout ? 'primary' : 'danger'}
              onClick={p.onBlackout}
              midiKey="action:blackout-toggle"
              testId="blackout-button"
            >
              {p.blackout ? 'Blacked out' : 'Blackout'}
            </Button>
          </div>
        </div>
      </aside>

      {/* ── Plate ───────────────────────────────────────────── */}
      <section className="flex min-h-0 flex-col px-4 py-3">
        <div className="mb-3 flex h-8 shrink-0 items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: 'var(--color-live)' }} />
            <span className="text-[16px] font-medium">{live?.name ?? '—'}</span>
            <span className="font-mono text-[12px] text-dim">live · {p.liveFor}</span>
          </span>
          <Segmented
            value={String(p.layer)}
            options={Array.from({ length: Math.max(1, p.layers) }, (_, i) => [String(i), `Layer ${i + 1}`] as const)}
            onChange={v => p.onLayer(Number(v))}
            height={32}
            testId="layer-segmented"
          />
        </div>
        {/* The hole the plate's canvas is painted over — it is never re-parented. */}
        <div ref={p.plateRef} className="min-h-0 flex-1 rounded-lg border border-border" data-testid="desk-preview" />
        <div className="mt-3 flex h-9 shrink-0 items-center justify-between gap-3">
          <Segmented
            value={p.tool}
            options={TOOLS.map(([id, label, k]) => [id, label, k] as const)}
            onChange={p.onTool}
            testId="tool-segmented"
            compact
          />
          <div className="flex items-center gap-1.5 rounded-md bg-elevated p-1.5" data-testid="dye-tray">
            {p.dyes.map(hex => (
              <Swatch
                key={hex}
                hex={hex}
                selected={p.dye?.toLowerCase() === hex.toLowerCase()}
                onClick={() => p.onDye(hex)}
                midiKey={dyeKey(hex)}
                className="h-9 w-9"
                gap="var(--color-elevated)"
                title={hex}
                testId={`dye-${hex.replace('#','')}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── Rides ───────────────────────────────────────────── */}
      <aside className="flex min-h-0 flex-col border-l border-border" data-testid="rides">
        <div className="flex h-11 shrink-0 items-center justify-between px-4">
          <span className="text-[13px] font-medium">Rides</span>
          <button
            onClick={() => setPicking(v => !v)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors ${
              picking ? 'bg-text text-bg' : 'text-dim hover:bg-hover hover:text-text'
            }`}
            title="Choose which controls ride here"
            data-testid="ride-pick"
          >
            <SlidersHorizontal size={13} /> {picking ? 'Done' : 'Choose'}
          </button>
        </div>
        {picking ? (
          <PickList chosen={p.rideKeys} onChange={p.onRideKeys} testId="ride-picker" />
        ) : (
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide px-4">
          {p.rideKeys.length === 0 && (
            <p className="py-3 text-[13px] leading-relaxed text-dim">
              Nothing on the strip. <span className="text-text">Choose</span> picks what rides here.
            </p>
          )}
          {p.rideKeys.map(key => {
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
                // A stepped control (folds, octaves, layers) lands on a step,
                // as it does on the sheet; the rest keep the fine travel.
                step={spec.step}
                display={readSetting(String(key), v, spec.min, spec.max)}
                cc={p.ccFor(key)}
                white={WHITE.has(String(key))}
                onChange={n => p.onSetting({ [key]: n } as Partial<VisualizerSettings>)}
                midiKey={`setting:${String(key)}`}
                testId={`ride-${String(key)}`}
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
            <Toggle
              label="Follow beat"
              on={(p.settings.beatPrediction ?? 0) > 0.05}
              onChange={on => p.onSetting({ beatPrediction: on ? 0.7 : 0 })}
              testId="toggle-beat"
            />
          </div>
          {/*
            The line that says there is no controller is the one place someone
            reads when their controller is not working, and it used to spell
            out a route — "Settings → MIDI" — for them to walk by hand. It is
            a button now: it says the same thing and goes there.
          */}
          {p.midiName ? (
            <p className="mt-3 pb-2 text-[12px] text-faint">{`${p.midiName} · a CC on a fader moves it here too`}</p>
          ) : (
            <button
              onClick={p.onMidi}
              className="mt-3 pb-2 text-left text-[12px] text-faint underline decoration-dotted underline-offset-2 hover:text-text-2"
              data-testid="no-controller-hint"
            >
              No controller yet — set one up
            </button>
          )}
        </div>
        )}
        {/*
          The same way in as the bench has.

          Perform is deliberately six rides and a cue list, and that is still
          what it should be — but "deliberately few" and "no way to reach the
          rest" are different things, and until now the only route to the room
          camera or the projector's keystone from here was ⌘K, which you have
          to already know about. One line, under the rides, in the pinned part
          so it is never below the fold.
        */}
        <div className="shrink-0 border-t border-border px-3 pt-3">
          <Button full height={40} onClick={p.onOpenSettings} testId="open-all-settings">
            All settings…
          </Button>
        </div>
        <div className="flex shrink-0 gap-2 p-3">
          <Button full height={40} kbd="F" onClick={p.onFreeze} midiKey="action:play-toggle" testId="freeze-button">{p.frozen ? 'Thaw' : 'Freeze'}</Button>
          <Button full height={40} onClick={p.onDrain} midiKey="action:drain" testId="drain-button">Drain</Button>
        </div>
      </aside>

      {/* ── Status ──────────────────────────────────────────── */}
      <footer className="col-span-3 flex items-center justify-between border-t border-border px-4 font-mono text-[11px] text-dim">
        <span data-testid="status-hearing">
          {p.status.audio}
          {p.status.sequence && ` · ${p.status.sequence}`}
        </span>
        <span data-testid="status-running">
          {p.status.phone ? 'phone linked · ' : ''}
          {p.status.rec ? `rec ${p.status.rec} · ` : ''}
          {p.status.engine}
        </span>
      </footer>
    </div>
  );
}
