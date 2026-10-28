import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePortalBody } from '../portalBody';
import { TIP_DELAY_MS } from '../../lib/tipDelay';

/*
  The card that says what a control is (PLAN.md 8j).

  A knob is 58 px wide and its name is cut to fit, so "Magnet Strength" and
  "Magnet Height" both read "Magnet …", and while a hand was on one the name
  was swapped for the value and a chip laid over the row above. The owner
  could not tell which knob was under the hand. This card is the other half of
  that fix: the whole name, one plain line on what it does, and the value,
  drawn into the body so no panel's scroll or the plate's layer can clip or
  cover it, and never over the control itself.

  Two ways in, because a desk has a mouse and a phone has not:

    · hover or keyboard focus (desk): after a long wait (`TIP_DELAY_MS`, 1.5 s,
      the owner's call: 380 ms woke a card on every third knob of a deck
      crossed), counted afresh on every control with no grace for a neighbour of
      one just seen. Once up it stays through a drag, and the value on it
      follows the hand.
    · a tap on the name (phone, `tap`): the card toggles, and goes on the
      next touch anywhere else or after a few seconds.

  The card never takes the pointer, so it cannot get between a hand and the
  thing it is turning.

  One card at a time, whatever asked for it. The owner found two up at once,
  Macro Zoom's under Evolve Speed's, and neither going: each knob thought a
  hand was still on it (see `Knob`'s drag, which now ends however the release
  is lost). A card coming up puts down whichever was up before, so a control
  that has lost track of the hand can at worst leave its card up until the
  next one opens, never stack them. The newest wins because it is the one
  under the hand, or under the keyboard's focus, now.
*/

/** The card up now, if any: its id, and how to put it down. */
let current: { id: string; close: () => void } | null = null;

/** A tapped card goes by itself: a phone has no pointer-leave to end it. */
const TAP_HIDE_MS = 6000;
const CARD_W = 248;
const GAP = 8;

export interface ControlTipOptions {
  name: string;
  help?: string;
  /** The value as it reads now; kept live on the card. */
  value?: string;
  /** A second line, fainter: the gestures, say. */
  hint?: ReactNode;
  /** A drag is in progress: the card is shown, whatever the pointer does. */
  held?: boolean;
  disabled?: boolean;
}

export function useControlTip({ name, help, value, hint, held = false, disabled = false }: ControlTipOptions) {
  const anchor = useRef<HTMLElement | null>(null);
  const body = usePortalBody();
  const id = useId();
  const [want, setWant] = useState(false);
  const [shown, setShown] = useState(false);
  const [tapped, setTapped] = useState(false);
  /** Put down for another control's card; up again only on its own next hover, focus, tap or drag. */
  const [superseded, setSuperseded] = useState(false);
  const [rect, setRect] = useState<{ x: number; top: number; bottom: number } | null>(null);

  useEffect(() => {
    if (!want || disabled) { setShown(false); return; }
    const t = window.setTimeout(() => setShown(true), TIP_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [want, disabled]);

  // A tapped card ends on the next touch anywhere, or on its own.
  useEffect(() => {
    if (!tapped) return;
    const off = () => setTapped(false);
    const t = window.setTimeout(off, TAP_HIDE_MS);
    const doc = anchor.current?.ownerDocument ?? document;
    // A touch on the control itself is its own to toggle: closing it here as
    // well would have the click that follows open it again.
    const away = (e: Event) => { if (!(e.target instanceof Node && anchor.current?.contains(e.target))) off(); };
    // Deferred a tick so the tap that opened it is not the one that closes it.
    const arm = window.setTimeout(() => doc.addEventListener('pointerdown', away), 0);
    return () => { window.clearTimeout(t); window.clearTimeout(arm); doc.removeEventListener('pointerdown', away); };
  }, [tapped]);

  // A new drag is a fresh ask, even on a card another put down.
  useEffect(() => { if (held) setSuperseded(false); }, [held]);

  const visible = !disabled && !superseded && (shown || held || tapped);
  useEffect(() => {
    if (!visible) return;
    if (current && current.id !== id) current.close();
    const me = { id, close: () => { setSuperseded(true); setWant(false); setTapped(false); } };
    current = me;
    return () => { if (current === me) current = null; };
  }, [visible, id]);
  useLayoutEffect(() => {
    if (!visible) return;
    const el = anchor.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ x: r.left + r.width / 2, top: r.top, bottom: r.bottom });
  }, [visible, held]);

  const bind = {
    // A finger's pointerenter is a tap on its way, not a hover.
    onPointerEnter: (e: { pointerType: string }) => { if (e.pointerType !== 'touch') { setSuperseded(false); setWant(true); } },
    onPointerLeave: () => setWant(false),
    onFocus: (e: FocusEvent) => {
      try { if (e.target instanceof HTMLElement && e.target.matches(':focus-visible')) { setSuperseded(false); setWant(true); } } catch { /* an old engine: hover still works */ }
    },
    onBlur: () => setWant(false),
  };
  // A tap on a card another put down opens it again rather than toggling a card no one can see.
  const toggle = useCallback(() => {
    if (superseded) { setSuperseded(false); setTapped(true); } else setTapped(t => !t);
  }, [superseded]);

  let card: ReactNode = null;
  if (visible && rect) {
    const view = (anchor.current?.ownerDocument.defaultView ?? window);
    const vw = view.innerWidth;
    const above = rect.top > 120;
    const left = Math.max(CARD_W / 2 + GAP, Math.min(vw - CARD_W / 2 - GAP, rect.x));
    card = createPortal(
      <div
        id={id}
        role="tooltip"
        data-control-tip=""
        className="pointer-events-none fixed z-[90] rounded-md border border-white/10 bg-elevated px-3 py-2 shadow-[0_4px_16px_rgba(0,0,0,.55)]"
        style={{
          width: CARD_W,
          left,
          transform: above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
          top: above ? rect.top - GAP : rect.bottom + GAP,
        }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-medium leading-snug text-text" data-tip="name">{name}</span>
          {value !== undefined && <span className="shrink-0 font-mono text-[12px] text-text-2" data-tip="value">{value}</span>}
        </div>
        {help && <p className="mt-1 text-[12px] leading-snug text-text-2" data-tip="help">{help}</p>}
        {hint && <p className="mt-1.5 text-[11px] leading-snug text-faint" data-tip="hint">{hint}</p>}
      </div>,
      body,
    );
  }

  return { anchor, bind, toggle, card, open: visible, id };
}
