import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PortalBody } from '../portalBody';
import { installTitleTips } from '../../lib/titleTips';

/**
 * A desk panel in a window of its own (PLAN.md 8g), for a laptop and a
 * monitor at a gig: the plate and the cue list on one screen, the mixer or the
 * rides on the other.
 *
 * Not a second app. The panel is the same React tree as the desk, portalled
 * into a window this page opened, so every value it shows and every control in
 * it is the desk's own state, with nothing to send between two copies and
 * nothing to fall out of step. That is why it is `window.open` of a blank
 * window and not of a URL: a URL would load the whole app a second time, with
 * its own solver, its own sound and its own idea of the show.
 *
 * What a blank window does not have is the page's styles. They are copied in
 * when it opens: every stylesheet link (by its full address, since a blank
 * window's own is about:blank in some browsers) and every style element, which
 * is where Vite puts them while developing, and the root element's attributes,
 * which carry the theme. Fonts come with the stylesheets.
 *
 * A browser lets a page open a window only from a click, so the window is
 * opened in the click itself (`openPanelWindow`) and handed to the desk, which
 * keeps it beside the layout and never in it: a reload has no window to put
 * the panel back in, so a stored "popped" would leave a hole in the desk.
 */

const WINDOW_ID = 'cg-panel-window';

/**
 * Open a panel's window, or bring back the one it already has, at about the
 * size the panel is drawn now. Null when the browser blocks it.
 */
export function openPanelWindow(id: string, title: string, size: { w: number; h: number }): Window | null {
  const w = Math.round(Math.min(Math.max(size.w, 320), screen.availWidth || 1600));
  const h = Math.round(Math.min(Math.max(size.h, 240), screen.availHeight || 1000));
  let win: Window | null = null;
  try {
    win = window.open('', `chromaglass-panel-${id}`, `popup=yes,width=${w},height=${h}`);
  } catch { /* a sandboxed frame throws rather than returning null */ }
  if (!win) return null;
  dress(win, title);
  return win;
}

/** The page's styles, theme and title, in a window that has none. */
function dress(win: Window, title: string): void {
  const d = win.document;
  d.title = `${title} · ChromaGlass`;
  // Again from the page each time: a window reused after a reload holds the old build's styles.
  d.head.querySelectorAll('[data-cg-copied]').forEach(n => n.remove());
  for (const n of document.head.querySelectorAll('link[rel="stylesheet"], style')) {
    const c = n.cloneNode(true) as HTMLElement;
    if (n.tagName === 'LINK') c.setAttribute('href', (n as HTMLLinkElement).href);
    c.setAttribute('data-cg-copied', '');
    d.head.appendChild(c);
  }
  for (const a of [...document.documentElement.attributes]) d.documentElement.setAttribute(a.name, a.value);
  d.body.className = document.body.className;
  d.body.style.cssText = 'margin:0;overflow:hidden;background:var(--color-bg);color:var(--color-text)';
}

/**
 * The panel drawn into its window, for as long as the window is open. When
 * the window goes, closed by its own button or by the system, `onGone` puts
 * the panel back in its place on the desk.
 */
export function PanelWindow({ win, onGone, children }: { win: Window; onGone: () => void; children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const gone = useRef(onGone);
  gone.current = onGone;
  useEffect(() => {
    const d = win.document;
    let el = d.getElementById(WINDOW_ID);
    if (!el) {
      el = d.createElement('div');
      el.id = WINDOW_ID;
      d.body.appendChild(el);
    }
    // Emptied when reused: a window left by a page that crashed still holds its panel.
    el.replaceChildren();
    el.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;padding:8px;box-sizing:border-box';
    setHost(el);
    // A window of its own is another document: its titles wait the same (PLAN 8j-3).
    const offTips = installTitleTips(d);
    const left = () => gone.current();
    win.addEventListener('pagehide', left);
    // pagehide is not promised for a window the system closes; its `closed` is.
    const poll = window.setInterval(() => { if (win.closed) left(); }, 500);
    return () => { win.removeEventListener('pagehide', left); window.clearInterval(poll); offTips(); };
  }, [win]);
  return host ? createPortal(<PortalBody.Provider value={host.ownerDocument.body}>{children}</PortalBody.Provider>, host) : null;
}
