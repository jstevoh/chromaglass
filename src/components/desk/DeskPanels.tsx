import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePortalBody } from '../portalBody';
import { ImagePlus, SlidersHorizontal, Video } from 'lucide-react';
import { Button, CueRow, Knob, Segmented, Sheet, Slider, Swatch, Tag, Toggle } from '../ui';
import { TiltPad } from '../ui/TiltPad';
import { bearingName, readSpring, writeSpring } from '../../lib/tiltPad';
import { MixerPanel } from '../MixerPanel';
import { PanelGuard } from '../PanelGuard';
import { ToolAmountChip, ToolOptions, toolUnder } from '../ToolAmount';
import { TOOL_AMOUNT } from '../../lib/toolAmount';
import { readSetting } from '../../lib/readout';
import { FADE_CHOICES } from '../../lib/lookFade';
import { PINNABLE, PIN_RANGE, type DeskSpec } from '../../lib/deskPins';
import { PANEL_BY_ID, whereIs } from '../../lib/deskLayout';
import { relayInfo, type RelayInfo } from '../../lib/remoteProtocol';
import { useAccountShows, joinAccountShow } from '../../lib/accountShows';
import { encodeQr, qrPath } from '../../lib/qr';
import { bottleSwatch, isClearLiquid, isNatural } from '../../lib/liquidColour';
import type { VisualizerSettings } from '../../types';
import { PickList } from './PickList';
import { SongScore } from '../SongScore';
import { DESK_TOOLS } from './tools';
import type { DeskProps, SetAction, SetItemAction } from './deskProps';

/**
 * The bodies of the desk's panels (Desk v2).
 *
 * Each was a column of one of the two old desks: the cue list and the rides
 * were Perform's, the bottles, the dyes and the recipe were Design's. They
 * keep their test ids (`cue-list`, `rides`, `recipe`, `bottle-…`), because a
 * panel is the same controls in a different place, and the checks that drive
 * them (`npm run saves`, `npm run layout`, the Mac's `qa`) are asking about
 * the controls, not about which column they were in.
 */

/*
  What a performer rides. Each has to pass three tests: it shows on any look
  within a second, pulling it back undoes it, and it does something no other
  ride does.

  Dimmer (intensity), Speed (motion), Turbulence (calm glass to boiling),
  Beat Press (the kick squeezes the glass), Plate Rock (the kick tips the
  plate and it sloshes back), Soap Bursts (the dye blown apart on the beat),
  Zoom (a dive into the liquid), and Evolve Speed (how far the show wanders
  on its own; raising it from zero switches Random Evolve on).

  Swirl and Gravity were here and are not now, though Choose still has both.
  Swirl only spins up eddies a look already has, so on a calm one it did
  next to nothing. Gravity pours the dye down the plate and pulling it back
  does not bring the dye up again: it is a scene change, not a ride.
*/
export const DEFAULT_RIDES: (keyof VisualizerSettings)[] = [
  'dimmer', 'globalSpeed', 'turbulenceScale', 'beatSqueeze', 'plateRock', 'surfactantFlow', 'macroZoom', 'automateRate',
];

const RANGE = PIN_RANGE;

/** The Dimmer's handle is white because it is the one that can black the room out. */
const WHITE = new Set<string>(['dimmer']);

/** The same tools wherever the Tools panel is (`tools.ts`). */
const TOOLS = DESK_TOOLS;

/**
 * Evolve Speed does nothing with Random Evolve off, so the control is the
 * switch as well: up from zero turns it on, down to zero turns it off. Shared
 * by every surface that draws it, so a knob and a ride agree.
 */
function setControl(p: DeskProps, key: keyof VisualizerSettings, n: number) {
  p.onSetting({ [key]: n } as Partial<VisualizerSettings>);
  if (key === 'automateRate') {
    if (n > 0.005 && !p.automated) p.onAutomate(true);
    else if (n <= 0.005 && p.automated) p.onAutomate(false);
  }
}

/**
 * One control, drawn as the hardware it is ridden on.
 *
 * A CC learned to a fader is a slider, full width, above the knobs; an
 * encoder, or nothing learned, is a knob. Re-learn a control and it redraws
 * in place. The value is the settings' own, so a fader, the mouse and the
 * phone are three ways to move one number.
 */
function DeskControl({ spec, p, testId, asKnob }: { spec: DeskSpec; p: DeskProps; testId: string; asKnob: boolean }) {
  const key = spec.key;
  const raw = p.settings[key];
  const v = typeof raw === 'number' ? raw : spec.min;
  const cc = p.ccFor(key);
  const display = readSetting(String(key), v, spec.min, spec.max);
  if (asKnob) {
    return (
      <Knob
        label={spec.label}
        value={v}
        min={spec.min}
        max={spec.max}
        step={spec.step}
        display={display}
        mapping={cc != null ? `CC${cc}` : null}
        resetTo={p.lookValueOf?.(key)}
        onChange={n => setControl(p, key, n)}
        midiKey={`setting:${String(key)}`}
        testId={testId}
      />
    );
  }
  return (
    <Slider
      label={spec.label}
      value={v}
      min={spec.min}
      max={spec.max}
      // A stepped control (folds, octaves, layers) lands on a step, as it
      // does on the sheet; the rest keep the fine travel.
      step={spec.step}
      display={display}
      cc={cc}
      white={WHITE.has(String(key))}
      resetTo={p.lookValueOf?.(key)}
      onChange={n => setControl(p, key, n)}
      midiKey={`setting:${String(key)}`}
      testId={testId}
    />
  );
}

/** Faders first, full width; then the knobs, four to a row. */
function ControlGrid({ keys, p, prefix }: { keys: (keyof VisualizerSettings)[]; p: DeskProps; prefix: string }) {
  const specs = keys.map(k => RANGE.get(String(k))).filter((s): s is DeskSpec => !!s);
  const faders = specs.filter(s => p.kindFor(s.key) === 'fader');
  const knobs = specs.filter(s => p.kindFor(s.key) !== 'fader');
  return (
    <>
      {faders.map(s => <DeskControl key={String(s.key)} spec={s} p={p} testId={`${prefix}-${String(s.key)}`} asKnob={false} />)}
      {knobs.length > 0 && (
        <div className="grid grid-cols-4 justify-items-center gap-x-1 gap-y-2 pt-1">
          {knobs.map(s => <DeskControl key={String(s.key)} spec={s} p={p} testId={`${prefix}-${String(s.key)}`} asKnob />)}
        </div>
      )}
    </>
  );
}

const scroller = 'min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide';

// ── Cues ─────────────────────────────────────────────────────────────

function CuesBody({ p }: { p: DeskProps }) {
  /** The row whose menu is open, and the set's own menu. */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [setMenu, setSetMenu] = useState(false);
  const itemAct = (a: SetItemAction) => { if (menuFor) p.onItemAction(menuFor, a); setMenuFor(null); };
  const setAct = (a: SetAction, name?: string) => { p.onSetAction(a, name); setSetMenu(false); };
  const [renaming, setRenaming] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedOpen, setSavedOpen] = useState(true);
  /*
    What Go sends: the cued set item, or else a look cued from outside the set.
    Go always sent the cued look (goLook in App), but the button read its name
    from the set alone, so a look cued from ⌘K, or from Your presets, showed
    "Nothing cued" with Go greyed out while Space would have sent it.
  */
  const next = p.cues.find(c => c.id === p.nextId)
    ?? (p.cuedLook ? { id: p.cuedLook.id, name: p.cuedLook.name } : null);
  return (
    <div className="-mx-3 -mb-2.5 flex min-h-0 flex-1 flex-col" data-testid="cue-list">
      <div className="relative flex shrink-0 flex-col gap-1.5 px-3 pb-2">
        <div className="flex min-w-0 items-center">
          {renaming ? (
            <input
              autoFocus
              defaultValue={p.setName}
              onBlur={e => { p.onSetAction('rename', e.currentTarget.value); setRenaming(false); }}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') { e.currentTarget.value = p.setName; e.currentTarget.blur(); }
              }}
              className="h-7 min-w-0 flex-1 rounded-md border border-border-strong bg-elevated px-2 text-[13px] font-medium text-text outline-none focus:border-accent"
              data-testid="set-name-input"
            />
          ) : (
            <button
              onClick={() => setRenaming(true)}
              title="Rename the set"
              className="-mx-1 min-h-7 min-w-0 truncate rounded-md px-1 text-left text-[13px] font-medium text-text hover:text-accent"
              data-testid="set-name"
            >
              {p.setName}
            </button>
          )}
          <span className="ml-auto shrink-0 whitespace-nowrap pl-2 font-mono text-[12px] text-faint" data-testid="set-count">{p.cues.length} {p.cues.length === 1 ? 'item' : 'items'}</span>
        </div>
        <span className="flex items-center gap-1 whitespace-nowrap [&>*]:flex-1">
          <Button height={28} onClick={p.onAddToSet} testId="set-add" title="Add a preset palette, a saved one, a sequence or a file to the set">+ Add</Button>
          <Button
            height={28}
            onClick={() => { setAct('save'); setSaved(true); window.setTimeout(() => setSaved(false), 1400); }}
            testId="set-save"
            title={`Keep this set as “${p.setName}”, to open again from the menu`}
          >
            {saved ? 'Saved' : 'Save'}
          </Button>
          <Button height={28} onClick={() => setSetMenu(v => !v)} testId="set-menu" title="Sets: open, new, import, export, song shows">⋯</Button>
        </span>
        {setMenu && (
          <div className="absolute right-3 top-full z-30 w-56 rounded-md border border-border-strong bg-elevated p-1 shadow-lg" data-testid="set-menu-list">
            {p.savedSets.length > 0 && (
              <>
                <p className="px-2 pb-1 pt-1.5 text-[11px] uppercase tracking-wide text-faint">Open a saved set</p>
                {p.savedSets.map(n => (
                  <div key={n} className="flex items-center">
                    <MenuItem onClick={() => setAct('open', n)} testId={`set-open-${n}`}>{n}</MenuItem>
                    <button
                      onClick={() => p.onSetAction('delete', n)}
                      title={`Forget the saved set “${n}”`}
                      className="shrink-0 rounded px-2 py-1 text-[13px] text-faint hover:bg-hover hover:text-text"
                      data-testid={`set-delete-${n}`}
                    >×</button>
                  </div>
                ))}
                <div className="my-1 h-px bg-border" />
              </>
            )}
            <MenuItem onClick={() => setAct('new')} testId="set-new">New empty set</MenuItem>
            <MenuItem onClick={() => setAct('clear')} testId="set-clear">Start from all preset palettes</MenuItem>
            <div className="my-1 h-px bg-border" />
            <MenuItem onClick={() => setAct('import')} testId="set-import">Import a set list…</MenuItem>
            <MenuItem onClick={() => setAct('export')} testId="set-export">Export this set</MenuItem>
            <div className="my-1 h-px bg-border" />
            <MenuItem onClick={() => setAct('import-show')} testId="set-import-show">Import show kit…</MenuItem>
            <MenuItem onClick={() => setAct('export-show')} testId="set-export-show">Export show kit</MenuItem>
            <MenuItem onClick={() => setAct('song-shows')} testId="set-song-shows">Song shows…</MenuItem>
          </div>
        )}
      </div>
      <div className={`${scroller} px-2 pb-2`}>
        {p.cues.map((c, i) => (
          <CueRow
            key={c.id}
            index={i + 1}
            name={c.name}
            swatch={c.swatch}
            state={c.id === p.liveId ? 'live' : c.id === p.nextId ? 'next' : 'idle'}
            trailing={
              <>
                {c.song && <span className="shrink-0 text-[12px] text-muted" title={`Goes up on its own when ${c.song} plays`} data-testid={`cue-song-${c.id}`}>♪</span>}
                {c.kind === 'sequence' && <span className="shrink-0 text-[11px] text-faint" title="A stage sequence">seq</span>}
                {c.missing && <span className="shrink-0 text-[11px] text-live" title="This look or sequence is not here any more">missing</span>}
                {c.id === p.liveId ? <Tag tone="live">live</Tag>
                : c.id === p.nextId ? <Tag tone="next">next</Tag>
                : <span className="font-mono text-[12px] text-faint">{c.fade === 0 ? 'cut' : `${c.fade}s`}</span>}
                {/* Take it off the set. A span, not a button: the row is the button. */}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={e => { e.stopPropagation(); p.onItemAction(c.id, 'remove'); }}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); p.onItemAction(c.id, 'remove'); } }}
                  title="Remove from the set"
                  aria-label={`Remove ${c.name} from the set`}
                  className="-mr-1 shrink-0 rounded px-1.5 text-[15px] leading-none text-faint opacity-0 hover:bg-hover hover:text-text focus:opacity-100 group-hover:opacity-100"
                  data-testid={`cue-remove-${c.id}`}
                >×</span>
              </>
            }
            onClick={() => p.onCue(c.id)}
            onDoubleClick={() => p.onCueNow(c.id)}
            onContextMenu={(e) => { e.preventDefault(); setMenuFor(c.id); }}
            midiKey={`preset:${c.id}`}
            testId={`cue-${c.id}`}
          />
        ))}
        {menuFor && (() => {
          const c = p.cues.find(x => x.id === menuFor);
          return (
            <div className="mx-1 mb-2 rounded-md border border-border-strong bg-elevated p-1" data-testid="cue-menu">
              <p className="truncate px-2 py-1 text-[12px] text-muted">{c?.name}</p>
              {p.songNow && <MenuItem onClick={() => itemAct('link-song')} testId="cue-menu-link-song">Goes up when “{p.songNow}” plays</MenuItem>}
              {c?.song && <MenuItem onClick={() => itemAct('unlink-song')} testId="cue-menu-unlink-song">Unlink from {c.song}</MenuItem>}
              <MenuItem onClick={() => itemAct('capture')} testId="cue-menu-capture">Keep the controls as they are now</MenuItem>
              <MenuItem onClick={() => itemAct('up')} testId="cue-menu-up">Move up</MenuItem>
              <MenuItem onClick={() => itemAct('down')} testId="cue-menu-down">Move down</MenuItem>
              <MenuItem onClick={() => itemAct('remove')} testId="cue-menu-remove">Remove from the set</MenuItem>
              <MenuItem onClick={() => setMenuFor(null)} testId="cue-menu-close">Close</MenuItem>
            </div>
          );
        })()}
        {p.cues.length > 0 ? (
          <p className="px-2 pt-1 text-[11px] text-faint">Right-click an item for its song, controls and order; × takes it off.</p>
        ) : (
          <div className="px-3 py-8 text-center text-[13px] text-muted" data-testid="set-empty">
            <p>This set is empty.</p>
            <p className="mt-1 text-[12px] text-faint">+ Add preset palettes to it, or start from all of them in the ⋯ menu.</p>
          </div>
        )}
      </div>
      {/*
        Your presets, on the panel you play from (PLAN QA-18a). Beside the set
        rather than in it, because the set is the show's running order and the
        library is everything you have kept; + puts one in the set. A click
        cues, as a cue row does, so a look picked mid-show waits for Go rather
        than cutting the wall. Folds away to a line when the set wants the room.
      */}
      {p.savedLooks.length > 0 && (
        <div className="shrink-0 border-t border-border px-2 pb-1 pt-1.5" data-testid="perform-saved">
          <button
            onClick={() => setSavedOpen(v => !v)}
            aria-expanded={savedOpen}
            className="flex w-full items-center justify-between rounded-md px-2 py-1 text-[12px] text-muted hover:text-text"
            data-testid="perform-saved-toggle"
          >
            <span>Your preset palettes</span>
            <span className="font-mono text-[11px] text-faint">{p.savedLooks.length} {savedOpen ? '▾' : '▸'}</span>
          </button>
          {savedOpen && (
            <div className="max-h-[22vh] overflow-y-auto scrollbar-hide" data-testid="perform-saved-list">
              {p.savedLooks.map(l => {
                const state = l.id === p.liveLookId ? 'live' : l.id === p.cuedLook?.id ? 'next' : 'idle';
                return (
                  <div key={l.id} className={`group flex h-9 items-center rounded-md border ${state === 'live' ? 'border-live-border bg-live-bg' : state === 'next' ? 'border-accent-border bg-elevated' : 'border-transparent hover:bg-hover'}`}>
                    <button
                      onClick={() => p.onCueSaved(l.id)}
                      onDoubleClick={() => p.onSendSaved(l.id)}
                      title={`Cue ${l.name}; Go sends it. Double-click sends it now.`}
                      className="flex h-full min-w-0 flex-1 items-center gap-2.5 px-2 text-left"
                      data-testid={`perform-saved-${l.id}`}
                      data-state={state}
                    >
                      <span className="h-4 w-4 shrink-0 rounded-sm" style={{ background: l.swatch }} />
                      <span className={`truncate text-[13px] ${state === 'idle' ? 'text-text-2' : 'text-text'}`}>{l.name}</span>
                    </button>
                    {state === 'live' ? <Tag tone="live">live</Tag> : state === 'next' ? <Tag tone="next">next</Tag> : null}
                    <button
                      onClick={() => p.onAddSavedToSet(l.id)}
                      title={`Add ${l.name} to the set`}
                      aria-label={`Add ${l.name} to the set`}
                      className="ml-1 mr-1 shrink-0 rounded px-1.5 py-0.5 text-[13px] text-faint hover:bg-hover hover:text-text"
                      data-testid={`perform-saved-add-${l.id}`}
                    >+</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {/*
        Fade and Go, as small as they can be and still be hit in the dark: one
        row of fade times across the column and a Go a finger's height. They
        were 140px of the column with Back and Freeze under them, which the
        owner never pressed (2026-10-10: "I don't use them. We can keep the
        shortcuts though"). Back is still ⌫ and Freeze still F, from the
        keyboard (App's key handler), ⌘K, and a learned MIDI pad
        (`action:revert`, `action:play-toggle` in the Controller's map).
      */}
      <div className="flex shrink-0 flex-col gap-1.5 border-t border-border px-3 py-2" data-testid="cue-go">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[12px] text-muted">Fade</span>
          <Segmented
            value={String(p.fade)}
            options={FADE_CHOICES.map(s => [String(s), s === 0 ? 'cut' : `${s}s`] as const)}
            onChange={v => p.onFade(Number(v))}
            height={28}
            fill
            testId="fade-segmented"
          />
        </div>
        <Button
          variant="primary" full height={36} kbd="Space"
          onClick={p.onGo}
          disabled={!next}
          midiKey="action:go"
          testId="go-button"
        >
          <span className="min-w-0 truncate">{next ? `Go to ${next.name}` : 'Nothing cued'}</span>
        </Button>
      </div>
    </div>
  );
}

// ── Rides ────────────────────────────────────────────────────────────

/** The rides' column; the docked Mixer is its width, so it covers the rides and not the plate. */
export const RIDES_WIDTH = 312;
/** The left column's width (the cue list's, in Gig). */
export const LEFT_WIDTH = 272;

function RidesBody({ p }: { p: DeskProps }) {
  const portalBody = usePortalBody();
  const [picking, setPicking] = useState(false);
  const [mixerOpen, setMixerOpen] = useState(false);
  /*
    The Mixer sheet lies over the rides, on whichever side they are, at that
    column's width, so it covers none of the plate. With the Mixer out as a
    panel of its own the button goes: one Mixer on screen, not two.
  */
  const where = whereIs(p.layout, 'rides');
  const mixerOut = whereIs(p.layout, 'mixer') !== null;
  const side = where === 'left' ? 'left' : 'right';
  return (
    <div className="-mx-3 -mb-2.5 flex min-h-0 flex-1 flex-col" data-testid="rides">
      <div className="flex h-9 shrink-0 items-center justify-end px-3">
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
        <div className={`${scroller} px-3`}>
          {p.rideKeys.length === 0 && (
            <p className="py-3 text-[13px] leading-relaxed text-dim">
              Nothing on the strip. <span className="text-text">Choose</span> picks what rides here.
            </p>
          )}
          {/* Rides are faders in every case: a ride is a hand on a strip. */}
          {p.rideKeys.map(key => {
            const spec = RANGE.get(String(key));
            if (!spec) return null;          // a key saved by an older build
            return <DeskControl key={String(key)} spec={spec} p={p} testId={`ride-${String(key)}`} asKnob={false} />;
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
            reads when their controller is not working, so it is a button that
            goes there rather than a route to walk by hand.
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
        The Mixer beside the rides (lib/mixer.ts): a sheet docked over the
        rides' column rather than a panel in the deck by default, because a
        mixer is opened, set and closed far more often than it is watched, and
        a level is a ride. `npm run layout` asks that it covers none of the plate.
      */}
      <div className="flex shrink-0 gap-2 border-t border-border px-3 pt-3">
        {!mixerOut && <Button full height={40} onClick={() => setMixerOpen(true)} testId="open-mixer">Mixer</Button>}
        <Button full height={40} onClick={p.onOpenSettings} testId="open-all-settings">All settings…</Button>
      </div>
      <div className="flex shrink-0 gap-2 p-3">
        <Button full height={40} onClick={p.onDrain} midiKey="action:drain" testId="drain-button">Drain</Button>
      </div>
      {mixerOpen && !mixerOut && createPortal(
        /*
          Into the body, not the desk: the plate's frame is a fixed layer above
          the desk's own, so a sheet inside the desk opened under the plate.
          The width of the rides' column, less the docked sheet's 8 px margin,
          so it lies over the rides and not over the plate (PLAN.md §11 step 5).
        */
        <Sheet title="Mixer" onClose={() => setMixerOpen(false)} width={(side === 'left' ? LEFT_WIDTH : RIDES_WIDTH) - 8} height={900} testId="mixer-sheet" docked dockSide={side}>
          <div className="min-h-0 w-full overflow-y-auto px-3 py-3">
            <PanelGuard name="The Mixer" inline onClose={() => setMixerOpen(false)}>
            <MixerPanel settings={p.settings} onSetting={p.onSetting} hasFilm={p.hasFilm} hasMark={p.hasMark} onFade={p.takes?.onFade} fading={p.takes?.fading} backLook={p.onGoBackPlate ? (p.backLook ?? null) : undefined} testId="desk-mixer" />
            </PanelGuard>
          </div>
        </Sheet>,
        portalBody,
      )}
    </div>
  );
}

// ── Recipe ───────────────────────────────────────────────────────────

/*
  The controls a look is built from, chosen by the owner (`DEFAULT_RECIPE`):
  the old bench's right-hand column, now a panel that leads Build's deck.
  Choose is the same picker the rides use, over the same list, so whatever
  can ride there can sit here. Knobs or sliders by the controller, as every
  panel's controls are.
*/
function RecipeBody({ p }: { p: DeskProps }) {
  const [picking, setPicking] = useState(false);
  /*
    Random evolve and All settings are the rides' too. With both panels out
    (anyone can dock the recipe beside the rides now) they would be on the
    screen twice, and a control in two places is one nobody trusts mid-set:
    the recipe leaves them to the rides, which is where Gig keeps them.
  */
  const ridesOut = whereIs(p.layout, 'rides') !== null;
  return (
    <div className="-mx-3 -mb-2.5 flex min-h-0 flex-1 flex-col" data-testid="recipe">
      <div className="flex h-7 shrink-0 items-center justify-end px-3">
        <button
          onClick={() => setPicking(v => !v)}
          className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors ${
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
        <div className={`${scroller} px-3`}>
          {p.recipeKeys.length === 0 && (
            <p className="py-3 text-[13px] leading-relaxed text-dim">
              Nothing on the recipe. <span className="text-text">Choose</span> picks what is here.
            </p>
          )}
          <ControlGrid keys={p.recipeKeys} p={p} prefix="recipe" />
          {!ridesOut && (
            <div className="mt-2 border-t border-border pt-1">
              <Toggle
                label="Random evolve"
                on={p.automated}
                onChange={on => {
                  p.onAutomate(on);
                  if (on && (p.settings.automateRate ?? 0) < 0.02) p.onSetting({ automateRate: 0.15 });
                }}
                testId="toggle-evolve"
              />
            </div>
          )}
        </div>
      )}
      {/*
        The way in to the rest, pinned rather than at the end of a list that
        scrolls: the one control whose job is to be found must not be below
        the fold (the Mac's `qa` checks it is on screen).
      */}
      <div className="flex shrink-0 gap-1.5 border-t border-border px-3 pt-2">
        {!ridesOut && <Button full height={32} onClick={p.onOpenSettings} testId="open-all-settings">All settings…</Button>}
        <Button
          height={32}
          onClick={() => p.onSetting({ macroMode: !p.settings.macroMode })}
          midiKey="action:macro-toggle"
          testId="macro-button"
        >
          {p.settings.macroMode ? 'Wide' : 'Macro'}
        </Button>
        {/* Randomise replaces every setting at once, so it asks first. */}
        <Button
          height={32}
          variant={p.randomiseArmed ? 'primary' : 'secondary'}
          onClick={p.onRandomise}
          midiKey="action:lucky"
          testId="randomise-button"
        >
          {p.randomiseArmed ? 'Sure?' : 'Randomise'}
        </Button>
      </div>
    </div>
  );
}

// ── Bottles, dyes, tools ─────────────────────────────────────────────

function BottlesBody({ p }: { p: DeskProps }) {
  return (
    <div className="grid grid-cols-3 gap-1.5" data-testid="bench-left">
      {[...p.dyeBottles, ...p.behaviourBottles].map(l => (
        <button
          key={l.id}
          onClick={() => p.onBottle(l.id)}
          title={l.behaviour ? `${l.name}: changes the plate where it lands` : l.name}
          className={`flex h-8 min-w-0 items-center gap-2 rounded-md border px-2 text-left transition-colors ${
            p.bottleId === l.id ? 'border-accent-border bg-elevated text-text' : 'border-transparent text-muted hover:bg-hover hover:text-text'
          }`}
          data-testid={`bottle-${l.id}`}
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] border border-border-strong" style={bottleSwatch(l)} />
          <span className="truncate text-[13px] font-medium">{l.name}</span>
        </button>
      ))}
    </div>
  );
}

function DyesBody({ p }: { p: DeskProps }) {
  const portalBody = usePortalBody();
  const bottle = [...p.dyeBottles, ...p.behaviourBottles].find(l => l.id === p.bottleId);
  const natural = isNatural(bottle);
  /*
    Where the palette list opens: under its button when there is room, over
    it when there is not, and never taller than the room it has. It opened
    under the button whatever was there, so with the Dyes panel low on the
    screen the list ran off the bottom of the window and most of the palettes
    could not be reached (the owner, 2026-10-10).
  */
  const [palettes, setPalettes] = useState<{ top?: number; bottom?: number; left: number; maxHeight: number } | null>(null);
  const paletteName = p.paletteLock === null ? 'Auto' : (p.palettes[p.paletteLock]?.name ?? 'Auto');
  const paletteColours = p.paletteLock === null ? [] : (p.palettes[p.paletteLock]?.colours ?? []);
  return (
    <div className="flex flex-col gap-2">
      {/*
        The bottle's own colour with no dye in it (lib/liquidColour.ts): what
        it pours until a dye is picked, and the way back after.
      */}
      {bottle?.own && (
        <button
          onClick={() => p.onDye(bottle.own!)}
          aria-pressed={natural}
          className={`flex h-8 w-full items-center gap-2 rounded-md border px-2 text-left text-[13px] transition-colors ${
            natural ? 'border-border-strong bg-hover text-text' : 'border-border text-muted hover:bg-hover hover:text-text'
          }`}
          data-testid="dye-natural"
          title={`${bottle.name} as it is, with no dye in it`}
        >
          <span
            className="h-3.5 w-3.5 shrink-0 rounded-full border border-dashed border-border-strong"
            style={isClearLiquid(bottle) ? { background: 'transparent' } : { background: bottle.own }}
          />
          Natural · {isClearLiquid(bottle) ? 'clear' : 'its own colour'}
        </button>
      )}
      {/*
        As many swatches a row as fit at 28px or more: eight across a column,
        fewer in a panel floated narrow or popped out small, rather than eight
        squeezed under a fingertip.
      */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(28px,1fr))] gap-1.5">
        {p.swatches.map((c, i) => (
          <Swatch
            key={c.hex}
            hex={c.hex}
            selected={!natural && p.dye?.toLowerCase() === c.hex.toLowerCase()}
            onClick={() => p.onDye(c.hex)}
            // The grid is the palette in order, so the index *is* the palette
            // index a dye pad fires.
            midiKey={`dye:${i}`}
            className="aspect-square h-auto min-h-[28px] w-full"
            title={c.name}
            testId={`swatch-${c.hex.replace('#', '')}`}
          />
        ))}
      </div>
      <button
        onClick={(e) => {
          if (palettes) { setPalettes(null); return; }
          const r = e.currentTarget.getBoundingClientRect();
          const below = window.innerHeight - r.bottom - 12, above = r.top - 12;
          const left = Math.max(8, Math.min(r.left, window.innerWidth - 256 - 8));
          setPalettes(below >= 320 || below >= above
            ? { top: r.bottom + 4, left, maxHeight: below }
            : { bottom: window.innerHeight - r.top + 4, left, maxHeight: above });
        }}
        className="flex h-8 w-full items-center gap-2 rounded-md bg-elevated px-2.5 text-left text-[13px] text-muted transition-colors hover:bg-hover hover:text-text"
        title="The colour harmony the music draws from. Auto: the music picks."
        data-testid="palette-button"
      >
        <span>Palette</span>
        <span className="ml-auto flex shrink-0 gap-0.5">
          {paletteColours.slice(0, 4).map((hex, j) => <span key={j} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: hex }} />)}
        </span>
        <span className="truncate font-medium text-text">{paletteName}</span>
        <span className="text-faint">⌄</span>
      </button>
      {palettes && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setPalettes(null)} />
          <div className="fixed z-[61] w-64 overflow-y-auto rounded-md border border-border-strong bg-surface py-1 shadow-2xl" style={palettes} data-testid="palette-menu">
            <button
              onClick={() => { p.onPalette(null); setPalettes(null); }}
              className={`flex h-9 w-full items-center gap-2.5 px-3 text-left text-[13px] ${p.paletteLock === null ? 'bg-active text-text' : 'text-text-2 hover:bg-hover'}`}
              data-testid="palette-auto"
            >
              Auto <span className="ml-auto text-[12px] text-faint">the music picks</span>
            </button>
            {p.palettes.map((h, i) => (
              <button
                key={h.name}
                onClick={() => { p.onPalette(i); setPalettes(null); }}
                className={`flex h-9 w-full items-center gap-2.5 px-3 text-left text-[13px] ${p.paletteLock === i ? 'bg-active text-text' : 'text-text-2 hover:bg-hover'}`}
                data-testid={`palette-${i}`}
              >
                <span className="flex shrink-0 gap-0.5">
                  {h.colours.slice(0, 4).map((hex, j) => <span key={j} className="h-3.5 w-2 rounded-[1px]" style={{ background: hex }} />)}
                </span>
                <span className="truncate">{h.name}</span>
              </button>
            ))}
          </div>
        </>,
        portalBody,
      )}
      <div className="flex gap-1.5">
        <button
          onClick={p.onImageDye}
          className="h-8 flex-1 rounded-md border border-dashed border-border-strong text-[13px] text-muted transition-colors hover:bg-hover hover:text-text"
          data-testid="image-dye"
        >
          <ImagePlus size={13} className="mr-1.5 inline" /> Image…
        </button>
        <button
          onClick={p.onVideoDye}
          className="h-8 flex-1 rounded-md border border-dashed border-border-strong text-[13px] text-muted transition-colors hover:bg-hover hover:text-text"
          data-testid="video-dye"
        >
          <Video size={13} className="mr-1.5 inline" /> Video…
        </button>
      </div>
    </div>
  );
}

function ToolsBody({ p }: { p: DeskProps }) {
  /** A tool's own options, open by a right-click on it or the Amount chip. */
  const [toolMenu, setToolMenu] = useState<{ tool: string; at: { x: number; y: number } } | null>(null);
  return (
    <div className="flex flex-col gap-2">
      {/*
        The tools as a grid of buttons, with their keys printed on them. The
        test ids are the segmented row's (`tool-segmented-…`) the desks drew
        before, so a right-click on one still finds its tool (`toolUnder`).
      */}
      <div
        className="grid grid-cols-4 gap-1.5"
        role="tablist"
        data-testid="tool-segmented"
        onContextMenu={(e) => {
          const t = toolUnder(e, 'tool-segmented');
          if (!t || !p.amountOf) return;
          e.preventDefault();
          setToolMenu({ tool: t, at: { x: e.clientX, y: e.clientY } });
        }}
      >
        {TOOLS.map(([id, label, k]) => (
          <button
            key={id}
            role="tab"
            aria-selected={p.tool === id}
            onClick={() => p.onTool(id)}
            title={`${label} (${k}). Right-click for its options.`}
            data-testid={`tool-segmented-${id}`}
            className={`inline-flex h-8 min-w-0 items-center justify-between gap-1 rounded-md border px-2 text-[13px] font-medium transition-colors duration-[120ms] ${
              p.tool === id ? 'border-border-strong bg-active text-text' : 'border-border text-muted hover:bg-hover hover:text-text-2'
            }`}
          >
            <span className="truncate">{label}</span>
            <span className="shrink-0 font-mono text-[11px] text-faint">{k}</span>
          </button>
        ))}
      </div>
      {p.onToolAmount && (
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[13px] text-muted">Amount</span>
          <input
            type="range"
            min={TOOL_AMOUNT.min}
            max={TOOL_AMOUNT.max}
            step={TOOL_AMOUNT.step}
            value={p.toolAmount ?? 1}
            onChange={e => p.onToolAmount?.(Number(e.target.value))}
            onDoubleClick={() => p.onToolAmount?.(1)}
            aria-label="Amount"
            className="ride-slider h-6 min-w-0 flex-1"
            style={{ '--fill': `${(((p.toolAmount ?? 1) - TOOL_AMOUNT.min) / (TOOL_AMOUNT.max - TOOL_AMOUNT.min)) * 100}%` } as CSSProperties}
            data-testid="tool-amount-range"
          />
          {/* The value, and the door to the tool's own options (the Magnet's size). */}
          <ToolAmountChip tool={p.tool} value={p.toolAmount ?? 1} onOpen={(at) => setToolMenu({ tool: p.tool, at })} />
          <span className="shrink-0 font-mono text-[12px] text-text-2 min-[1400px]:hidden">{(p.toolAmount ?? 1).toFixed(1)}×</span>
        </div>
      )}
      {toolMenu && p.amountOf && p.onAmountFor && (
        <ToolOptions
          tool={toolMenu.tool}
          value={p.amountOf(toolMenu.tool)}
          onChange={(v) => p.onAmountFor!(toolMenu.tool, v)}
          at={toolMenu.at}
          onClose={() => setToolMenu(null)}
          magnetSize={p.magnetSize}
          onMagnetSize={p.onMagnetSize}
        />
      )}
    </div>
  );
}

// ── A section, as knobs or whole ─────────────────────────────────────

const SECTION_KEYS = new Map<string, (keyof VisualizerSettings)[]>();
for (const s of PINNABLE) SECTION_KEYS.set(s.section, [...(SECTION_KEYS.get(s.section) ?? []), s.key]);

function KnobsBody({ id, p }: { id: string; p: DeskProps }) {
  const keys = SECTION_KEYS.get(id) ?? [];
  const name = PANEL_BY_ID.get(id)?.name ?? id;
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid={`section-knobs-${id}`}>
      <div className={scroller}>
        <ControlGrid keys={keys} p={p} prefix="knob" />
      </div>
      {/*
        The rest of the section: its switches and pickers are not numbers, so
        they are not knobs, and they are one click away rather than a second
        copy here.
      */}
      <button
        onClick={() => p.onOpenSection(id)}
        className="mt-1.5 h-6 shrink-0 self-start rounded-sm px-1 text-[12px] text-dim underline decoration-dotted underline-offset-2 hover:text-text-2"
        data-testid={`panel-${id}-more`}
      >
        All of {name}…
      </button>
    </div>
  );
}

function SectionBody({ id, p }: { id: string; p: DeskProps }) {
  if (p.sheetOpen) {
    return (
      <p className="py-3 text-[12px] leading-relaxed text-dim" data-testid={`panel-${id}-in-sheet`}>
        In the open sheet while it is up.
      </p>
    );
  }
  return <div className={scroller}>{p.renderSection(id)}</div>;
}

function MixerBody({ p }: { p: DeskProps }) {
  return (
    <div className={scroller}>
      <MixerPanel settings={p.settings} onSetting={p.onSetting} hasFilm={p.hasFilm} hasMark={p.hasMark} onFade={p.takes?.onFade} fading={p.takes?.fading} backLook={p.onGoBackPlate ? (p.backLook ?? null) : undefined} testId="deck-mixer" />
    </div>
  );
}

// ── Phone · iPad ─────────────────────────────────────────────────────

/*
  The address a phone or an iPad opens to link to this show.

  With a show server behind the page (the Mac app, or `npm run remote`), the
  address is the relay's on the local network (`http://<lan-host>:<port>/?remote=1&key=<key>`),
  which turns the device into a low-latency control surface for this show.
  On the hosted site or a static preview with no show server behind it, the
  address is the page's own origin (`/`), opening the standalone visualizer on
  the phone itself, and the text explains how to run a show server.

  Whether a phone is linked is counted by the relay itself (how many controller
  sockets have said hello with the show key), not by whether the display has a
  socket open to the relay: the display connects as soon as the relay starts,
  long before any phone is in the room. When no phone is linked (count 0), the
  QR code, address, and Copy button are up and ready to scan. When one or more
  phones are linked, they are tucked away so the panel stays clean, replaced
  by a "Link another" button to bring them back when another device joins.
  When the last phone disconnects and the count returns to 0, the toggle resets
  and the code is displayed again automatically.
*/
function PhoneBody({ p }: { p: DeskProps }) {
  const [info, setInfo] = useState<RelayInfo | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const accountShows = useAccountShows();

  useEffect(() => {
    let live = true;
    void relayInfo().then(r => { if (live) setInfo(r); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (p.status.phone === 0) setMoreOpen(false);
  }, [p.status.phone]);

  const hasRelay = Boolean(info && info.hosts && info.hosts.length > 0 && info.hosts[0]);
  /*
    PLAN 14m-lan: a relay answered but handed this page no display key, which
    it gives only to the laptop at its own name (localhost). So this is the
    laptop's page opened at its Wi-Fi address (or another computer's), and it
    stays off the relay by design: phones would see no laptop. It used to draw
    a code anyway, of the remote with no key in it, which a phone could scan
    and never join with. Now it says where to open the page instead, and draws
    no code.
  */
  const notLaptop = hasRelay && !!info && !info.displayKey;
  const localUrl = info ? `http://localhost:${info.port}/` : '';
  const url = hasRelay && info
    ? `http://${info.hosts[0]}:${info.port}/?remote=1${info.key ? `&key=${info.key}` : ''}`
    : `${window.location.origin}/`;

  const showCode = p.status.phone === 0 || moreOpen;

  return (
    <div className="flex flex-col gap-2 text-[13px]" data-testid="phone-link">
      <p className="flex items-center gap-2 text-text-2" data-testid="phone-link-status">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: p.status.phone > 0 ? 'var(--color-ok)' : 'var(--color-faint)' }}
        />
        {p.status.phone === 0 ? 'No phone linked.' : `${p.status.phone} phone${p.status.phone === 1 ? '' : 's'} linked.`}
      </p>
      {accountShows.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="account-shows">
          <span className="text-[11px] uppercase tracking-wider text-dim">Running shows on your account</span>
          {accountShows.map((show) => (
            <button
              key={show.id}
              type="button"
              onClick={() => joinAccountShow(show)}
              data-testid="account-show-join"
              data-cg-account-show={show.id}
              className="flex min-h-[34px] w-full items-center justify-between gap-2 rounded-md border border-border-strong bg-elevated px-2.5 py-1.5 text-left text-[12px] font-medium text-text hover:bg-hover"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                <span className="truncate">{show.name}</span>
              </span>
              <span className="shrink-0 text-[11px] font-medium text-accent-text">Join</span>
            </button>
          ))}
        </div>
      )}
      {info === undefined ? (
        <p className="text-dim">Looking for the show server…</p>
      ) : notLaptop ? (
        <p className="leading-relaxed text-dim" data-testid="phone-link-local">
          The show server is running, but this page was opened at its Wi-Fi address, so it cannot link phones. On the laptop running the show, open <span className="font-mono text-[12px] text-text-2">{localUrl}</span> instead.
        </p>
      ) : (
        <>
          {p.status.phone > 0 && (
            <Button
              height={32}
              onClick={() => setMoreOpen(v => !v)}
              testId="phone-link-more"
            >
              {moreOpen ? 'Put the code away' : 'Link another'}
            </Button>
          )}
          {showCode && (
            <>
              {hasRelay ? (
                <p className="text-dim">Point a phone or an iPad on the same Wi-Fi at this, or open the address:</p>
              ) : (
                <p className="leading-relaxed text-dim">
                  This page has no show server behind it, so the code opens the show on the phone itself. A phone that drives this show links through the show server, which runs with the Mac app (or <span className="font-mono text-[12px]">npm run remote</span> on this machine).
                </p>
              )}
              <QrCodeImage text={url} />
              <code className="break-all rounded-md bg-elevated px-2 py-1.5 font-mono text-[12px] text-text-2" data-testid="phone-link-url">{url}</code>
              <Button
                height={32}
                onClick={() => { void navigator.clipboard?.writeText(url).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1400); }); }}
                testId="phone-link-copy"
              >
                {copied ? 'Copied' : 'Copy the address'}
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
}

/*
  The link as a QR code (PLAN 8f): the address is sixty-odd characters with a
  key in it, typed on a phone in a dark room, and a camera reads this instead.
  Drawn from `lib/qr.ts`, one path of a unit per module, black on white with
  the standard's four-module quiet zone: a reader needs the light border and
  the dark-on-light polarity, so it is white in a dark panel on purpose, and
  sized in whole pixels per module so no module blurs across two.
*/
function QrCodeImage({ text }: { text: string }) {
  const code = useMemo(() => encodeQr(text), [text]);
  if (!code) return null;
  const span = code.size + 8;
  const px = Math.max(2, Math.floor(168 / span)) * span;
  return (
    <svg
      viewBox={`0 0 ${span} ${span}`}
      width={px}
      height={px}
      shapeRendering="crispEdges"
      className="self-center rounded-sm"
      role="img"
      aria-label="QR code of the address"
      data-testid="phone-link-qr"
      data-qr-version={code.version}
    >
      <rect width={span} height={span} fill="#fff" />
      <path d={qrPath(code)} fill="#000" />
    </svg>
  );
}

/*
  The tilt pad (PLAN 18a-13f): the joystick the desk did not have. Tipping the
  plate was the phone's motion sensor or two faders (Gravity, then Tilt
  Direction), and a laptop with no motion sensor could not tip one way and then
  the other, which is the gesture that makes the liquid slop. The pad writes
  those same two settings, so a controller's Gravity fader and the phone's tilt
  move it and it moves them.
*/
function TiltBody({ p }: { p: DeskProps }) {
  const s = p.settings;
  const upright = s.plateUpright ?? 0;
  const direction = s.tiltDirection ?? 180;
  const slosh = s.slosh ?? 0;
  const [spring, setSpring] = useState(readSpring);
  return (
    <div className="flex flex-col items-center gap-3 px-1 pb-1 pt-2" data-testid="tilt-panel">
      <TiltPad
        upright={upright}
        direction={direction}
        onTilt={t => p.onSetting({ plateUpright: t.upright, tiltDirection: t.direction })}
        spring={spring}
      />
      <div className="font-mono text-[12px] text-text-2" data-testid="tilt-says">
        {upright > 0 ? `${Math.round(upright * 100)}% · runs ${bearingName(direction)}` : 'Level'}
      </div>
      <div className="w-full">
        <Toggle
          label="Spring back"
          on={spring}
          onChange={v => { setSpring(v); writeSpring(v); }}
          testId="tilt-spring"
          title="Let go and the stick returns to where it was when you took it. Off, it stays where you leave it."
        />
        <Button onClick={() => p.onSetting({ plateUpright: 0 })} disabled={upright === 0} testId="tilt-level" full height={32}>Level</Button>
      </div>
      <div className="w-full">
        <Slider
          label="Slosh"
          value={slosh}
          min={0}
          max={1}
          step={0.05}
          onChange={v => p.onSetting({ slosh: v })}
          display={`${Math.round(slosh * 100)}%`}
          midiKey="setting:slosh"
          resetTo={0}
        />
      </div>
    </div>
  );
}

// ── Which body ───────────────────────────────────────────────────────

export function PanelBody({ id, p }: { id: string; p: DeskProps }): ReactNode {
  switch (id) {
    case 'cues': return <CuesBody p={p} />;
    case 'rides': return <RidesBody p={p} />;
    case 'recipe': return <RecipeBody p={p} />;
    case 'bottles': return <BottlesBody p={p} />;
    case 'dyes': return <DyesBody p={p} />;
    case 'tools': return <ToolsBody p={p} />;
    case 'phone': return <PhoneBody p={p} />;
    case 'tilt': return <TiltBody p={p} />;
    case 'score': return p.score ? <SongScore {...p.score} /> : null;
  }
  const spec = PANEL_BY_ID.get(id);
  if (!spec) return null;
  if (spec.kind === 'mixer') return <MixerBody p={p} />;
  if (spec.kind === 'knobs') return <KnobsBody id={id} p={p} />;
  return <SectionBody id={id} p={p} />;
}

/** The faint line in a panel's header: what it rides, or what it is on. */
export function panelMeta(id: string, p: DeskProps): string | null {
  const ccs = (keys: (keyof VisualizerSettings)[]) => {
    const n = keys.map(k => p.ccFor(k)).filter((c): c is number => c != null).sort((a, b) => a - b);
    if (n.length === 0) return null;
    return n.length === 1 ? `CC${n[0]}` : `CC${n[0]}–${n[n.length - 1]}`;
  };
  switch (id) {
    case 'cues': return `${p.cues.length}`;
    case 'rides': return ccs(p.rideKeys);
    case 'recipe': return ccs(p.recipeKeys);
    case 'bottles': return [...p.dyeBottles, ...p.behaviourBottles].find(l => l.id === p.bottleId)?.name.toLowerCase() ?? null;
    case 'dyes': return p.paletteLock === null ? 'auto' : null;
    case 'tools': return `layer ${p.layer + 1}`;
    case 'phone': return p.status.phone === 0 ? 'not linked' : `${p.status.phone} linked`;
    case 'tilt': return (p.settings.plateUpright ?? 0) > 0 ? `${Math.round((p.settings.plateUpright ?? 0) * 100)}%` : 'level';
    case 'score': return p.score?.songName ?? null;
  }
  const spec = PANEL_BY_ID.get(id);
  if (spec?.kind === 'knobs') return ccs(SECTION_KEYS.get(id) ?? []);
  if (spec?.category === 'stage') return 'stage';
  return null;
}

function MenuItem({ children, onClick, disabled, testId }: { children: ReactNode; onClick: () => void; disabled?: boolean; testId?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="block w-full truncate rounded-sm px-2 py-1.5 text-left text-[13px] text-text-2 hover:bg-hover disabled:opacity-40"
      data-testid={testId}
    >
      {children}
    </button>
  );
}
