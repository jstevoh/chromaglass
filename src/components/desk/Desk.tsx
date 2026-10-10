import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, PanelFrame, Segmented, Tag } from '../ui';
import { PanelGuard } from '../PanelGuard';
import { RecordControls } from './RecordControls';
import { DeskHeader } from './DeskHeader';
import { LEFT_WIDTH, PanelBody, RIDES_WIDTH, panelMeta } from './DeskPanels';
import { PanelBrowser } from './PanelBrowser';
import {
  LAYOUT_LABEL, PANEL_BY_ID, closePanel, collapseAll, dockPanel, floatPanel, openPanel, openPanels,
  placeFloating, raiseFloating, toggleCollapsed, whereIs,
  type DeskLayout, type Slot,
} from '../../lib/deskLayout';
import type { DeskProps } from './deskProps';

/**
 * The desk (Desk v2, the owner's design of 2026-10-10).
 *
 * There were two: Perform, the cue list and the rides around a preview of the
 * wall, and Design, the bottles, dyes and recipe around the plate being
 * built. Each was a fixed screen, and everything else (the room camera, the
 * corner pin, the physics) was in a sheet that covered the plate, one section
 * at a time. This is one desk whose cells are filled from a layout
 * (lib/deskLayout.ts): every panel, the old desks' columns and every settings
 * section, can be docked in a column or the deck, floated over the plate,
 * folded or closed, and Build, Gig and Load-in are three arrangements of the
 * same panels. Switching between them changes what is on screen and never a
 * value.
 *
 * The plate is a `position: fixed` canvas that must never be re-parented (a
 * remount takes the GPU context and the show restarts, mid-song), so the desk
 * lays out around an empty box and the canvas is painted over it. That box is
 * in the same place in the tree in every layout, so the plate is measured
 * again rather than rebuilt when the columns around it change. Anything that
 * has to be drawn over the plate (a floating panel, a menu, the browser) is
 * drawn into the body, above the plate's layer, not inside the desk.
 */

/** The deck's height (the design's): taller in Build, where the knobs are the work. */
const DECK_H = { build: 268, gig: 236, loadin: 236 } as const;
const STRIP_H = 36;
const COLUMN_W = { left: LEFT_WIDTH, right: RIDES_WIDTH } as const;

/** What is being dragged by its grip, and where the pointer is. */
interface Drag { id: string; x: number; y: number; x0: number; y0: number; moved: boolean }

export function Desk(p: DeskProps) {
  const l = p.layout;
  const set = p.onLayout;
  const [browser, setBrowser] = useState<{ top: number; right: number } | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** Tab hides every floating panel and shows them again: a look at the plate under them. */
  const [floatsHidden, setFloatsHidden] = useState(false);
  // A panel floated, or another layout, shows them again: hidden floats are
  // easy to forget, and a panel just floated that does not appear reads as broken.
  useEffect(() => { setFloatsHidden(false); }, [l.floating.length, p.layoutName]);
  /**
   * A floating panel being moved or resized, held here until the hand lets
   * go. Written to the layout on every pointer move it re-rendered the whole
   * app and wrote storage sixty times a second, mid-show.
   */
  const [gesture, setGesture] = useState<{ id: string; x: number; y: number; w: number; h: number } | null>(null);
  const browserButton = useRef<HTMLButtonElement | null>(null);

  const openBrowser = useCallback(() => {
    const r = browserButton.current?.getBoundingClientRect();
    setBrowser(b => (b ? null : { top: (r?.bottom ?? 48) + 6, right: Math.max(8, window.innerWidth - (r?.right ?? window.innerWidth - 8)) }));
  }, []);

  // The plate is measured where it is; the columns moving round it do not resize the window.
  const { onRelayout } = p;
  useEffect(() => {
    const id = requestAnimationFrame(() => onRelayout?.());
    return () => cancelAnimationFrame(id);
  }, [l, p.layoutName, onRelayout]);

  // ── Keys ────────────────────────────────────────────────────────────
  /*
    Read through a ref and listened for once. The handlers come from App,
    which re-renders whenever the sound does, and an effect keyed on them took
    the listener off and put it back nearly every frame.
  */
  const latest = useRef({ onMode: p.onMode, onStage: p.onStage, openBrowser, set, floats: l.floating.length });
  latest.current = { onMode: p.onMode, onStage: p.onStage, openBrowser, set, floats: l.floating.length };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = latest.current;
      const t = e.target as HTMLElement | null;
      const mod = e.metaKey || e.ctrlKey;
      // The ⌘ keys work from a text field, as App's ⌘K and ⌘S do: the panel
      // browser's own search has the focus while it is open, and ⌘P there
      // has to close it, not print the page.
      if (mod && !e.shiftKey && !e.altKey && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault();
        k.onMode(e.key === '1' ? 'design' : e.key === '2' ? 'perform' : 'loadin');
        return;
      }
      if (mod && (e.key === 'p' || e.key === 'P') && !e.shiftKey) { e.preventDefault(); k.openBrowser(); return; }
      if (mod && e.key === ',') { e.preventDefault(); k.onStage(); return; }
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.altKey && !mod && e.code === 'KeyD') {
        e.preventDefault();
        k.set(x => ({ ...x, deckCollapsed: !x.deckCollapsed }));
      } else if (e.key === 'Tab' && !mod && !e.altKey && !e.shiftKey && k.floats > 0 && (!t || t === document.body)) {
        e.preventDefault();
        setFloatsHidden(v => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Dragging a panel by its grip ────────────────────────────────────
  /*
    Dropped on a column or the deck it docks there, in front of the panel the
    pointer is over; dropped anywhere else (over the plate) it floats there.
    While it is held, every place that takes it shows a dashed edge, and an
    empty column is a strip at the window's edge.
  */
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => setDrag(d => d && ({ ...d, x: e.clientX, y: e.clientY, moved: d.moved || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 4 }));
    const up = (e: PointerEvent) => {
      setDrag(d => {
        if (!d || !d.moved) return null;
        const hits = document.elementsFromPoint(e.clientX, e.clientY);
        const zone = hits.find(h => (h as HTMLElement).dataset?.slot) as HTMLElement | undefined;
        const set = latest.current.set;
        if (zone) {
          const slot = zone.dataset.slot as Slot;
          const across = slot === 'deck';
          const panels = [...zone.querySelectorAll<HTMLElement>(':scope > [data-panel], :scope > [data-panel-wrap]')]
            .filter(el => (el.dataset.panel ?? el.dataset.panelWrap) !== d.id);
          let index = panels.length;
          for (let i = 0; i < panels.length; i++) {
            const r = panels[i].getBoundingClientRect();
            if (across ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2) { index = i; break; }
          }
          set(x => dockPanel(x, d.id, slot, index));
        } else {
          set(x => floatPanel(x, d.id, { x: Math.max(0, e.clientX - 60), y: Math.max(48, e.clientY - 16) }));
        }
        return null;
      });
    };
    // A cancelled pointer (a touch taken by the system, the window losing it)
    // drops the drag where it began rather than leaving the drop zones up.
    const cancel = () => setDrag(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [drag !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const startDrag = (id: string) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setDrag({ id, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false });
  };

  /** Move or resize a floating panel by its header or its corner. */
  const startFloatGesture = (id: string, kind: 'move' | 'resize') => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const f = l.floating.find(x => x.id === id);
    if (!f) return;
    set(x => raiseFloating(x, id));
    const sx = e.clientX, sy = e.clientY;
    const from = { id, x: f.x, y: f.y, w: f.w, h: f.h };
    let at = from;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      at = kind === 'move'
        ? { ...from, x: Math.max(0, Math.min(window.innerWidth - 80, f.x + dx)), y: Math.max(48, Math.min(window.innerHeight - 40, f.y + dy)) }
        : { ...from, w: Math.max(220, f.w + dx), h: Math.max(120, f.h + dy) };
      setGesture(at);
    };
    const end = (keep: boolean) => () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      // Written once, where the hand let go.
      if (keep && at !== from) set(x => placeFloating(x, id, { x: at.x, y: at.y, w: at.w, h: at.h }));
      setGesture(null);
    };
    const onUp = end(true), onCancel = end(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  // ── One panel ───────────────────────────────────────────────────────
  const frame = (id: string, opts: { floating?: boolean; className?: string; style?: React.CSSProperties } = {}): ReactNode => {
    const spec = PANEL_BY_ID.get(id);
    if (!spec) return null;
    const collapsed = l.collapsed.includes(id);
    return (
      <PanelFrame
        key={id}
        id={id}
        title={spec.name}
        meta={panelMeta(id, p)}
        floating={opts.floating}
        collapsed={collapsed}
        className={`${opts.className ?? ''} ${drag?.moved && drag.id === id ? 'opacity-40' : ''}`}
        style={opts.style}
        onFloat={() => set(x => floatPanel(x, id))}
        onDock={() => set(x => dockPanel(x, id, 'deck'))}
        onCollapse={() => set(x => toggleCollapsed(x, id))}
        onClose={() => set(x => closePanel(x, id))}
        onGripDown={startDrag(id)}
        onHeaderDown={opts.floating ? startFloatGesture(id, 'move') : undefined}
        onResizeDown={opts.floating ? startFloatGesture(id, 'resize') : undefined}
        onTitleMenu={(e) => { e.preventDefault(); setMenu({ id, x: e.clientX, y: e.clientY }); }}
      >
        {/* Its own guard: one panel that throws is a card in its place, not the end of the desk. */}
        <PanelGuard name={spec.name} inline onClose={() => set(x => closePanel(x, id))}>
          <PanelBody id={id} p={p} />
        </PanelGuard>
      </PanelFrame>
    );
  };

  const dropping = !!drag?.moved;
  const dashed = dropping ? 'outline-dashed outline-1 outline-offset-[-4px] outline-accent-border' : '';

  const column = (slot: 'left' | 'right') => {
    const ids = l[slot];
    if (ids.length === 0) return null;
    const one = ids.length === 1 && !l.collapsed.includes(ids[0]);
    return (
      <aside
        className={`flex min-h-0 flex-col gap-2 overflow-y-auto overflow-x-hidden scrollbar-hide p-2 ${slot === 'left' ? 'border-r' : 'border-l'} border-border ${dashed}`}
        data-slot={slot}
        data-testid={`desk-${slot}`}
      >
        {ids.map(id => frame(id, { className: one ? 'min-h-0 flex-1' : 'shrink-0' }))}
      </aside>
    );
  };

  const deckH = l.deck.length === 0 ? 44 : l.deckCollapsed ? STRIP_H : DECK_H[p.layoutName];
  const left = l.left.length > 0, right = l.right.length > 0;
  const live = l.plateMode === 'live';
  const plateName = p.layoutName === 'gig' ? (p.liveName ?? '—') : (p.lookName ?? 'Untitled');
  const nPanels = openPanels(l).length;

  return (
    <div
      className="fixed inset-0 z-10 grid bg-bg text-text"
      style={{
        gridTemplateColumns: `${left ? `${COLUMN_W.left}px ` : ''}minmax(0, 1fr)${right ? ` ${COLUMN_W.right}px` : ''}`,
        gridTemplateRows: `48px minmax(0, 1fr) ${deckH}px 28px`,
      }}
      // The old desks' ids, so everything that asks which desk is up still can:
      // Build is the Design desk's job and Gig the Perform desk's.
      data-testid={p.layoutName === 'build' ? 'design-desk' : p.layoutName === 'gig' ? 'perform-desk' : 'loadin-desk'}
      data-desk="v2"
      data-layout={p.layoutName}
      data-plate-mode={l.plateMode}
    >
      <DeskHeader
        breadcrumb={p.layoutName === 'gig' ? p.showCrumb : <DocMenu p={p} crumb={p.layoutName === 'loadin' ? 'Stage' : 'Look'} />}
        mode={p.mode}
        onMode={p.onMode}
        dots={p.dots}
        midiName={p.midiName}
        onSound={p.onSound}
        onVideo={p.onVideo}
        onWall={p.onSendToWall}
        onMidi={p.onMidi}
        onRecord={p.onRecordOptions ?? p.onToggleVideo}
        onPerformance={p.onPerformance}
        onSearch={p.onSearch}
        leading={
          <button
            ref={browserButton}
            onClick={openBrowser}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border-strong px-2.5 text-[13px] font-medium text-text-2 transition-colors hover:bg-hover"
            title="Open any panel (⌘P)"
            aria-label="Open a panel"
            data-testid="panel-browser-button"
          >
            +<span className="hidden xl:inline"> Panel</span>
            <span className="hidden font-mono text-[11px] text-faint 2xl:inline">⌘P</span>
          </button>
        }
        trailing={
          /* Inverted while it is on: a blacked-out room is exactly when the button has to say so without being read. */
          <Button
            height={32}
            kbd="B"
            variant={p.blackout ? 'primary' : 'danger'}
            onClick={p.onBlackout}
            midiKey="action:blackout-toggle"
            testId="blackout-button"
          >
            {p.blackout ? 'Blacked out' : 'Blackout'}
          </Button>
        }
      />

      {column('left')}

      {/* ── The plate ─────────────────────────────────────────────── */}
      <section className="flex min-h-0 min-w-0 flex-col px-4 py-3">
        {/*
          The plate bar. It wraps rather than runs under a column: at 1024 in
          Gig the plate is 440 px wide and its bar holds the name, Record, the
          layers, Live | Preview, Send to wall and Save.
        */}
        <div className="mb-3 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2">
          {/* The name gives way first, so the bar is one row wherever the plate is wider than about 940 px. */}
          <span className="flex min-w-[120px] flex-1 items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: live ? 'var(--color-live)' : 'var(--color-accent)' }} />
            <span className="truncate text-[16px] font-medium" data-testid="plate-name">{plateName}</span>
            <span className="hidden shrink-0 whitespace-nowrap font-mono text-[12px] text-dim 2xl:inline">
              {live ? (p.layoutName === 'gig' ? `live · ${p.liveFor}` : 'live') : 'preview · not on wall'}
            </span>
          </span>
          <RecordControls
            videoRecording={p.videoRecording ?? false}
            videoSeconds={p.videoSeconds ?? 0}
            onToggleVideo={p.onToggleVideo ?? (() => {})}
            performance={p.performance}
            onTogglePerformance={p.onPerformance}
            onOptions={p.onRecordOptions ?? (() => {})}
          />
          <Layers p={p} report={p.layoutName === 'build'} />
          <span className="flex shrink-0 items-center gap-2">
            {/*
              Live | Preview: the whole of the old Perform/Design split.
              Preview holds the sequencer, a song's show and a new song's
              look off, so a look is not rewritten while it is being built.
            */}
            <Segmented
              value={l.plateMode}
              options={[['live', 'Live'], ['preview', 'Preview']] as const}
              onChange={m => set(x => ({ ...x, plateMode: m }))}
              height={32}
              testId="plate-mode-segmented"
            />
            <Button height={32} kbd="⌘⏎" onClick={p.onSendToWall} testId="send-to-wall">
              <span className="hidden xl:inline">Send to&nbsp;</span>wall
            </Button>
            <Button height={32} variant="primary" kbd="⌘S" onClick={p.onSave} testId="save-look">
              {p.dirty ? 'Save •' : 'Save'}
            </Button>
          </span>
        </div>
        {/* The hole the plate's canvas is painted over. It is never re-parented. */}
        <div ref={p.plateRef} className="min-h-0 flex-1 rounded-lg border border-border" data-testid="desk-preview" />
      </section>

      {column('right')}

      {/* ── The deck ──────────────────────────────────────────────── */}
      {l.deckCollapsed && l.deck.length > 0 ? (
        <div className="col-[1/-1] flex items-center gap-1.5 overflow-x-auto scrollbar-hide border-t border-border px-2" data-slot="deck" data-testid="deck-strip">
          {l.deck.map(id => (
            <button
              key={id}
              onClick={() => set(x => ({ ...x, deckCollapsed: false }))}
              className="inline-flex h-7 shrink-0 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-[12px] font-medium text-text-2 hover:bg-hover"
              data-testid={`deck-chip-${id}`}
              data-panel-wrap={id}
            >
              {PANEL_BY_ID.get(id)?.name ?? id}
              {panelMeta(id, p) && <span className="font-mono text-[11px] text-faint">{panelMeta(id, p)}</span>}
            </button>
          ))}
          <button
            onClick={() => set(x => ({ ...x, deckCollapsed: false }))}
            className="ml-auto inline-flex h-7 shrink-0 items-center gap-2 rounded-md px-2.5 text-[12px] text-muted hover:bg-hover hover:text-text"
            data-testid="deck-show"
          >
            Show deck <span className="font-mono text-[11px] text-faint">⌥D</span>
          </button>
        </div>
      ) : (
        <div
          className={`col-[1/-1] flex min-h-0 items-stretch gap-2 overflow-x-auto overflow-y-hidden scrollbar-hide border-t border-border p-2 ${dashed}`}
          data-slot="deck"
          data-testid="desk-deck"
        >
          {l.deck.map(id => {
            const spec = PANEL_BY_ID.get(id);
            const folded = l.collapsed.includes(id);
            return frame(id, { className: `shrink-0 ${folded ? 'self-start' : ''}`, style: { width: spec?.deckWidth ?? 266 } });
          })}
          <button
            onClick={openBrowser}
            className="min-w-[180px] flex-1 rounded-lg border border-dashed border-border-strong text-[13px] text-dim transition-colors hover:bg-hover hover:text-text-2"
            data-testid="deck-add"
          >
            + Panel here
          </button>
          {l.deck.length > 0 && (
            <button
              onClick={() => set(x => ({ ...x, deckCollapsed: true }))}
              className="w-7 shrink-0 self-start rounded-md text-[13px] text-faint hover:bg-hover hover:text-text"
              style={{ height: 28 }}
              title="Fold the deck to a strip (⌥D): the plate takes its height"
              aria-label="Fold the deck"
              data-testid="deck-fold"
            >⌄</button>
          )}
        </div>
      )}

      {/* ── Status ────────────────────────────────────────────────── */}
      <footer className="col-[1/-1] flex items-center justify-between gap-4 border-t border-border px-4 font-mono text-[11px] text-dim">
        <span className="truncate" data-testid="status-hearing">
          {p.status.audio}
          {p.status.sequence && ` · ${p.status.sequence}`}
        </span>
        <span className="truncate" data-testid="status-running">
          {`layout ${LAYOUT_LABEL[p.layoutName]} · ${nPanels} panel${nPanels === 1 ? '' : 's'}`}
          {l.floating.length > 0 && ` · ${l.floating.length} floating`}
          {p.status.phone ? ' · phone linked' : ''}
          {p.status.rec ? ` · rec ${p.status.rec}` : ''}
          {p.status.engine ? ` · ${p.status.engine}` : ''}
        </span>
      </footer>

      {/* ── Over the plate ────────────────────────────────────────── */}
      {!floatsHidden && l.floating.length > 0 && createPortal(
        <>
          {l.floating.map((stored, i) => {
            const f = gesture?.id === stored.id ? gesture : stored;
            // Kept on this window: a layout floated on a big display and
            // opened on a laptop would otherwise put the panel off the edge.
            const left = Math.max(0, Math.min(f.x, window.innerWidth - 80));
            const top = Math.max(48, Math.min(f.y, window.innerHeight - 40));
            return (
            <div
              key={f.id}
              className="fixed"
              style={{ left, top, width: f.w, height: l.collapsed.includes(f.id) ? undefined : f.h, zIndex: 30 + i }}
              onPointerDown={() => set(x => raiseFloating(x, f.id))}
              data-testid={`floating-${f.id}`}
            >
              {frame(f.id, { floating: true, className: 'h-full' })}
            </div>
            );
          })}
        </>,
        document.body,
      )}
      {dropping && drag && createPortal(
        <>
          {/* An empty column, as a strip at the window's edge to drop on. */}
          {!left && <div className="fixed bottom-[64px] left-0 top-12 z-[62] flex w-14 items-center justify-center border-2 border-dashed border-accent-border bg-accent-bg text-[11px] text-accent-text [writing-mode:vertical-rl]" data-slot="left">Dock left</div>}
          {!right && <div className="fixed bottom-[64px] right-0 top-12 z-[62] flex w-14 items-center justify-center border-2 border-dashed border-accent-border bg-accent-bg text-[11px] text-accent-text [writing-mode:vertical-rl]" data-slot="right">Dock right</div>}
          <div
            className="pointer-events-none fixed z-[63] rounded-md border border-border-strong bg-elevated px-2.5 py-1 text-[13px] font-medium text-text shadow-[0_20px_60px_rgba(0,0,0,.6)]"
            style={{ left: drag.x + 12, top: drag.y + 8 }}
          >
            {PANEL_BY_ID.get(drag.id)?.name}
          </div>
        </>,
        document.body,
      )}
      {menu && createPortal(
        <PanelMenu
          at={menu}
          layout={l}
          onClose={() => setMenu(null)}
          act={(change) => { set(change); setMenu(null); }}
          onReset={() => { p.onResetLayout(); setMenu(null); }}
        />,
        document.body,
      )}
      {browser && (
        <PanelBrowser
          layoutName={p.layoutName}
          layout={l}
          at={browser}
          onDock={(id) => set(x => openPanel(x, id, 'deck'))}
          onFloat={(id) => set(x => openPanel(x, id, 'float'))}
          onStage={p.onStage}
          onClose={() => setBrowser(null)}
        />
      )}
    </div>
  );
}

/** Right-click a panel's title: where it goes, folding them all, and the layout back as it shipped. */
function PanelMenu({ at, layout, act, onReset, onClose }: {
  at: { id: string; x: number; y: number };
  layout: DeskLayout;
  act: (change: (l: DeskLayout) => DeskLayout) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const id = at.id;
  const where = whereIs(layout, id);
  const allFolded = openPanels(layout).every(x => layout.collapsed.includes(x));
  const rows: [string, () => void, string][] = [
    ...(where === 'float' ? [] : [['Float', () => act(x => floatPanel(x, id)), 'float']] as [string, () => void, string][]),
    ...(where === 'left' ? [] : [['Move to the left column', () => act(x => dockPanel(x, id, 'left')), 'left']] as [string, () => void, string][]),
    ...(where === 'right' ? [] : [['Move to the right column', () => act(x => dockPanel(x, id, 'right')), 'right']] as [string, () => void, string][]),
    ...(where === 'deck' ? [] : [['Move to the deck', () => act(x => dockPanel(x, id, 'deck')), 'deck']] as [string, () => void, string][]),
    [allFolded ? 'Open all' : 'Fold all', () => act(x => collapseAll(x, !allFolded)), 'fold-all'],
    ['Reset layout', onReset, 'reset'],
  ];
  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }} />
      <div className="fixed z-[61] w-56 overflow-hidden rounded-md border border-border-strong bg-surface py-1 shadow-2xl" style={{ left: Math.min(at.x, window.innerWidth - 232), top: Math.min(at.y, window.innerHeight - 240) }} data-testid="panel-menu">
        {rows.map(([label, run, key]) => (
          <button key={key} onClick={run} className="block h-8 w-full px-3 text-left text-[13px] text-text-2 hover:bg-hover hover:text-text" data-testid={`panel-menu-${key}`}>
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * The layer tabs, and the button that adds or takes off the back layer.
 *
 * Each tab says what is on its layer: the dot is the layer's own mean dye and
 * the bar how full it is, from sums the solver already keeps, so switching is
 * not blind. Polled only in Build (App's `layerReport`), where looks are made;
 * the tabs are there in every layout. Two is the most the plate has (the
 * display pass is at WebGPU's sixteen sampled textures, PLAN.md §16d), so the
 * button is a plus on one layer and a minus on two.
 */
function Layers({ p, report }: { p: DeskProps; report: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-2">
      <div className="inline-flex rounded-md border border-border bg-elevated p-0.5" role="tablist" data-testid="layer-segmented">
        {Array.from({ length: Math.max(1, p.layers) }, (_, i) => {
          const rep = report ? p.layerReport?.[i] : undefined;
          return (
            <button
              key={i}
              role="tab"
              aria-selected={p.layer === i}
              onClick={() => p.onLayer(i)}
              style={{ height: 28 }}
              data-testid={`layer-segmented-${i}`}
              className={`inline-flex items-center gap-1.5 rounded-sm px-2 text-[13px] font-medium transition-colors duration-[120ms] 2xl:gap-2 2xl:px-3 ${
                p.layer === i ? 'bg-active text-text' : 'text-muted hover:text-text-2'
              }`}
              title={rep ? `Layer ${i + 1} — ${Math.round(rep.fill * 100)}% full` : `Layer ${i + 1}`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/20" style={{ background: rep?.colour ?? '#111111' }} />
              <span><span className="hidden 2xl:inline">Layer </span>{i + 1}</span>
              {report && (
                <span className="hidden h-1 w-6 shrink-0 overflow-hidden rounded-full bg-border 2xl:block" aria-hidden>
                  <span className="block h-full rounded-full bg-text-2" style={{ width: `${Math.round((rep?.fill ?? 0) * 100)}%` }} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {p.layers < 2 ? (
        <button
          onClick={p.onAddLayer}
          className="h-8 w-8 rounded-md border border-border-strong text-[15px] text-muted transition-colors hover:bg-hover hover:text-text"
          title="Another layer of liquid behind this one"
          aria-label="Add a layer"
          data-testid="add-layer"
        >+</button>
      ) : (
        <button
          onClick={p.onRemoveLayer}
          disabled={!p.onRemoveLayer}
          className="h-8 w-8 rounded-md border border-border-strong text-[15px] text-muted transition-colors hover:bg-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent disabled:hover:text-muted"
          title={p.onRemoveLayer
            ? `Take layer ${p.layers} off this look`
            : p.layerHeld
              ? `The back plate is on ${p.layerHeld}, so it stays until it follows the front again`
              : 'The back plate is fading back to the front, and comes off once it lands'}
          aria-label="Remove a layer"
          data-testid="remove-layer"
        >−</button>
      )}
    </span>
  );
}

/**
 * The document menu, hung off the look's own name: New, Save, Save over, and
 * your saved presets to open or take out.
 *
 * Drawn into the body at the name's position, not inside the desk: the plate
 * is painted over its hole from a layer above the desk, so a menu inside the
 * desk that hangs down over the preview went under the picture.
 */
function DocMenu({ p, crumb }: { p: DeskProps; crumb: string }) {
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const toggle = () => {
    if (at) { setAt(null); return; }
    const r = button.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 4, left: r.left });
  };
  return (
    <>
      <span className="text-muted">{crumb}</span>
      <span className="text-faint">/</span>
      <div className="relative flex min-w-0 items-center gap-2">
        <button
          ref={button}
          onClick={toggle}
          className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] font-medium text-text transition-colors hover:bg-hover"
          title="New, Save, and your saved preset palettes"
          data-testid="doc-menu-button"
        >
          <span className="truncate">{p.lookName ?? 'Untitled'}</span>
          <span className="text-faint">⌄</span>
        </button>
        {p.edited && <Tag>edited</Tag>}
        {at && createPortal((
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setAt(null)} />
            <div
              className="fixed z-[61] w-56 overflow-hidden rounded-md border border-border-strong bg-surface shadow-2xl"
              style={{ top: at.top, left: at.left }}
              data-testid="doc-menu"
            >
              {([
                ['New — an empty plate', '', p.onNew, 'doc-new'],
                ['Save as a new preset…', '⌘S', p.onSave, 'doc-save'],
                ...(p.onSaveOver ? [[`Save over “${p.lookName ?? 'Untitled'}”`, '', p.onSaveOver, 'doc-save-over']] : []),
              ] as [string, string, () => void, string][]).map(([label, kbd, run, id]) => (
                <button
                  key={id}
                  onClick={() => { setAt(null); run(); }}
                  className="flex w-full items-center justify-between gap-4 px-3 py-2 text-left text-[13px] text-text-2 transition-colors hover:bg-hover hover:text-text"
                  data-testid={id}
                >
                  <span className="truncate">{label}</span>
                  {kbd ? <span className="font-mono text-[11px] text-faint">{kbd}</span> : null}
                </button>
              ))}
              {p.savedLooks.length > 0 && (
                <div className="border-t border-border py-1" data-testid="doc-saved">
                  <div className="px-3 pb-1 pt-1.5 text-[11px] text-faint">Your preset palettes</div>
                  <div className="max-h-[50vh] overflow-y-auto">
                    {p.savedLooks.map(sl => (
                      <div key={sl.id} className={`group flex items-center ${sl.id === p.openLookId ? 'bg-active' : 'hover:bg-hover'}`}>
                        <button
                          onClick={() => { setAt(null); p.onOpenSaved(sl.id); }}
                          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-[13px] text-text-2 hover:text-text"
                          title={`Open ${sl.name}`}
                          data-testid={`doc-saved-${sl.id}`}
                        >
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: sl.swatch }} />
                          <span className="truncate">{sl.name}</span>
                        </button>
                        <button
                          onClick={() => p.onDeleteSaved(sl.id)}
                          className="mr-1 rounded p-1.5 text-faint opacity-60 hover:bg-hover hover:text-text group-hover:opacity-100"
                          title={`Remove ${sl.name} from your presets`}
                          aria-label={`Remove ${sl.name}`}
                          data-testid={`doc-saved-remove-${sl.id}`}
                        >
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ), document.body)}
      </div>
    </>
  );
}
