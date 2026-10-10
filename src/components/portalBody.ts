import { createContext, useContext } from 'react';

/**
 * Where a component's own menus and sheets go when they are put in the body.
 *
 * A menu opened from a desk panel is drawn into the body so the plate's layer
 * cannot cover it. A panel in a window of its own (PLAN.md 8g,
 * desk/PanelWindow.tsx) is the same React tree portalled into another
 * document, and there "the body" has to be that window's body, or the menu
 * opens on the other screen. Nothing provides it outside a panel's window, so
 * everywhere else this is the page's body, as before.
 */
export const PortalBody = createContext<HTMLElement | null>(null);
export const usePortalBody = (): HTMLElement => useContext(PortalBody) ?? document.body;
