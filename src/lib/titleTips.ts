import { TIP_DELAY_MS } from './tipDelay';

/*
  The browser's own `title` tip, held back to the app's wait (PLAN.md 8j-3).

  About 240 controls say what they are with a `title=`, and the browser shows
  that after its own wait (near a second), which no page can lengthen. The
  owner found them in the way, so they are not left to the browser: while the
  pointer is on an element with a `title`, the attribute is lifted off it (so
  the browser has nothing to show), and after `TIP_DELAY_MS` the same words are
  drawn on a card like the knobs' (`ui/ControlTip.tsx`). When the pointer
  leaves, presses, or the page scrolls, the attribute goes back and the card
  goes. Doing it at the document, rather than at each of the 240, means a new
  `title=` gets the same wait with nothing to remember.

  Only a mouse or pen starts it: a finger's `pointerover` is a tap on its way,
  and a phone has no hover to wait on, so touch keeps what it does today.

  While the title is lifted an icon-only control would lose the name the title
  was giving it to a screen reader, so one with no label of its own is given
  `aria-label` for the same stretch and has it taken off again with the rest.

  If the page rewrites the element's `title` while it is lifted (React sets the
  attribute when the prop changes), the page's wins: the stash is dropped
  rather than put back over it.
*/

const HELD = 'data-title-held';
const LABELLED = 'data-title-labelled';

interface Lifted { el: Element; title: string; labelled: boolean }

/** Starts the delayed tips on `doc`; the returned function stops them and puts everything back. */
export function installTitleTips(doc: Document): () => void {
  const view = doc.defaultView;
  if (!view) return () => {};
  let lifted: Lifted | null = null;
  let timer = 0;
  let card: HTMLElement | null = null;

  const hideCard = () => { card?.remove(); card = null; };
  const restore = () => {
    window.clearTimeout(timer);
    hideCard();
    if (!lifted) return;
    const { el, title, labelled } = lifted;
    lifted = null;
    el.removeAttribute(HELD);
    if (labelled) { el.removeAttribute('aria-label'); el.removeAttribute(LABELLED); }
    if (!el.hasAttribute('title')) el.setAttribute('title', title);
  };

  const show = (l: Lifted) => {
    if (lifted !== l || !l.el.isConnected) return;
    const r = l.el.getBoundingClientRect();
    const c = doc.createElement('div');
    c.setAttribute('role', 'tooltip');
    c.setAttribute('data-title-tip', '');
    c.className = 'pointer-events-none fixed z-[90] rounded-md border border-white/10 bg-elevated px-3 py-2 text-[12px] leading-snug text-text shadow-[0_4px_16px_rgba(0,0,0,.55)]';
    c.style.maxWidth = '260px';
    c.textContent = l.title;
    doc.body.appendChild(c);
    // Measured once it is in, so it can be kept inside the window: above the
    // control when there is room, else below.
    const w = c.offsetWidth, h = c.offsetHeight;
    const vw = view.innerWidth, vh = view.innerHeight;
    const x = Math.max(8, Math.min(vw - w - 8, r.left + r.width / 2 - w / 2));
    const above = r.top - h - 8 >= 8;
    const y = above ? r.top - h - 8 : Math.min(vh - h - 8, r.bottom + 8);
    c.style.left = `${x}px`;
    c.style.top = `${y}px`;
    card = c;
  };

  const onOver = (e: PointerEvent) => {
    if (e.pointerType === 'touch' || !(e.target instanceof view.Element)) return;
    const el = e.target.closest('[title]');
    if (el === (lifted?.el ?? null)) return;
    restore();
    if (!el) return;
    const title = el.getAttribute('title');
    if (!title || !title.trim()) return;
    const labelled = !el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby') && !(el.textContent ?? '').trim();
    el.setAttribute(HELD, '');
    el.removeAttribute('title');
    if (labelled) { el.setAttribute('aria-label', title); el.setAttribute(LABELLED, ''); }
    const l: Lifted = { el, title, labelled };
    lifted = l;
    timer = window.setTimeout(() => show(l), TIP_DELAY_MS);
  };
  const onOut = (e: PointerEvent) => {
    if (!lifted) return;
    const to = e.relatedTarget;
    if (to instanceof view.Node && lifted.el.contains(to)) return;
    restore();
  };

  doc.addEventListener('pointerover', onOver, true);
  doc.addEventListener('pointerout', onOut, true);
  // A press, a key or a scroll is the hand getting on with it: the tip is done.
  doc.addEventListener('pointerdown', restore, true);
  doc.addEventListener('keydown', restore, true);
  doc.addEventListener('scroll', restore, true);
  view.addEventListener('blur', restore);
  return () => {
    restore();
    doc.removeEventListener('pointerover', onOver, true);
    doc.removeEventListener('pointerout', onOut, true);
    doc.removeEventListener('pointerdown', restore, true);
    doc.removeEventListener('keydown', restore, true);
    doc.removeEventListener('scroll', restore, true);
    view.removeEventListener('blur', restore);
  };
}
