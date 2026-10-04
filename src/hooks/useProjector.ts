import { useCallback, useEffect, useRef, useState } from 'react';
import { isDesktopApp } from '../lib/platform';

/**
 * The projector, noticed and used.
 *
 * With the Window Management API the app can see every screen and hear
 * when one is plugged in. A screen that is not built in is the projector.
 * What happens then is the projector mode:
 *
 *   ask   — a chip offers to send the show there (one click).
 *   auto  — the show goes there by itself, on the next click or key press
 *           anywhere in the app (a window opened with no gesture at all is
 *           a blocked popup; the first gesture is the earliest the browser
 *           allows), and again whenever the projector comes back.
 *   off   — nothing is offered.
 *
 * The permission itself needs a gesture the first time; the chip asks for
 * it. After that Chrome remembers, and the app sees the screens on load.
 *
 * In the Mac app (`desktop/`) none of that waits for a hand. The app grants
 * the screens, opens popups with no gesture and fills the projector's screen
 * itself (desktop/main.js), so auto is the mode it starts in and a projector
 * that appears is used at once: the show is on the wall when the app opens,
 * which is what PLAN.md §13 step 1 asked. A mode chosen in Settings → Wall
 * still wins, `ask` and `off` included.
 */
export type ProjectorMode = 'ask' | 'auto' | 'off';

export interface ProjectorScreen {
  label: string;
  left: number; top: number;
  availLeft: number; availTop: number; availWidth: number; availHeight: number;
  isInternal?: boolean;
}

interface ScreenDetailsLike {
  screens: ProjectorScreen[];
  currentScreen: ProjectorScreen;
  onscreenschange: (() => void) | null;
  addEventListener?: (type: string, cb: () => void) => void;
  removeEventListener?: (type: string, cb: () => void) => void;
}

const MODE_KEY = 'chromaglass-projector-mode';

export const loadProjectorMode = (): ProjectorMode => {
  const fallback: ProjectorMode = isDesktopApp() ? 'auto' : 'ask';
  try { const v = localStorage.getItem(MODE_KEY); return v === 'auto' || v === 'off' || v === 'ask' ? v : fallback; } catch { return fallback; }
};

/** The screen that is not built in and not this one; failing that, any other screen. */
export function pickProjector(d: { screens: ProjectorScreen[]; currentScreen: ProjectorScreen }): ProjectorScreen | null {
  const cur = d.currentScreen;
  const notHere = (sc: ProjectorScreen) => sc.left !== cur.left || sc.top !== cur.top;
  return d.screens.find(sc => sc.isInternal === false && notHere(sc)) ?? d.screens.find(notHere) ?? null;
}

export function useProjector(opts: {
  /** Open the show on that screen; must be called from a user gesture. */
  send: (screen: ProjectorScreen) => void;
  /** True while a cast of any kind is running. */
  casting: boolean;
}) {
  const [mode, setModeState] = useState<ProjectorMode>(loadProjectorMode);
  const [projector, setProjector] = useState<ProjectorScreen | null>(null);
  const [permission, setPermission] = useState<'granted' | 'prompt' | 'denied' | 'unsupported'>('prompt');
  /** Auto mode is waiting for the first gesture to open the window. */
  const [armed, setArmed] = useState(false);
  const detailsRef = useRef<ScreenDetailsLike | null>(null);
  const sendRef = useRef(opts.send); sendRef.current = opts.send;
  const castingRef = useRef(opts.casting); castingRef.current = opts.casting;
  const modeRef = useRef(mode); modeRef.current = mode;
  /** Screens the auto mode already sent to, so a projector that stays plugged in is used once per appearance. */
  const sentRef = useRef<string | null>(null);

  const setMode = useCallback((m: ProjectorMode) => {
    setModeState(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* private */ }
  }, []);

  const readScreens = useCallback(() => {
    const d = detailsRef.current;
    if (!d) return;
    const p = pickProjector(d);
    setProjector(p ? { ...p, label: p.label || 'second screen' } : null);
    if (!p) sentRef.current = null;
  }, []);

  /** Ask for the screens (prompts for the permission the first time). */
  const watch = useCallback(async (): Promise<ProjectorScreen | null> => {
    const w = window as unknown as { getScreenDetails?: () => Promise<ScreenDetailsLike> };
    if (!w.getScreenDetails) { setPermission('unsupported'); return null; }
    try {
      const d = await w.getScreenDetails();
      detailsRef.current = d;
      setPermission('granted');
      const onChange = () => readScreens();
      if (d.addEventListener) d.addEventListener('screenschange', onChange); else d.onscreenschange = onChange;
      readScreens();
      return pickProjector(d);
    } catch {
      setPermission('denied');
      return null;
    }
  }, [readScreens]);

  // On load: if the permission is already granted, look without asking.
  useEffect(() => {
    let alive = true;
    (async () => {
      const perms = (navigator as unknown as { permissions?: { query: (d: { name: string }) => Promise<{ state: string }> } }).permissions;
      const w = window as unknown as { getScreenDetails?: () => Promise<ScreenDetailsLike> };
      if (!w.getScreenDetails) { setPermission('unsupported'); return; }
      if (!perms) return;
      let state = 'prompt';
      try { state = (await perms.query({ name: 'window-management' })).state; } catch { try { state = (await perms.query({ name: 'window-placement' })).state; } catch { return; } }
      if (!alive) return;
      if (state === 'granted') await watch();
      else setPermission(state === 'denied' ? 'denied' : 'prompt');
    })();
    return () => { alive = false; };
  }, [watch]);

  // Auto mode: the moment a projector is there and nothing is casting, wait
  // for the next gesture anywhere and send the show in it.
  useEffect(() => {
    const key = projector ? `${projector.left},${projector.top},${projector.availWidth}x${projector.availHeight}` : null;
    if (mode !== 'auto' || !projector || opts.casting || sentRef.current === key) { setArmed(false); return; }
    const go = () => {
      if (modeRef.current !== 'auto' || castingRef.current) return;
      sentRef.current = key;
      setArmed(false);
      sendRef.current(projector);
    };
    // No gesture to wait for in the app (see the top of this file), but only
    // for a screen that is known not to be built in. `pickProjector` falls
    // back to any other screen, and a laptop opened on an external monitor
    // would otherwise send the show, full screen, to its own panel on every
    // launch. That case keeps the gesture. A timer, not a call in the
    // effect, so the send happens outside React's render.
    if (isDesktopApp() && projector.isInternal === false) {
      const t = setTimeout(go, 0);
      return () => clearTimeout(t);
    }
    setArmed(true);
    const fire = (e: Event) => {
      // Not from the projector window itself, and not while a text field has focus.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      go();
    };
    window.addEventListener('pointerdown', fire, { capture: true });
    window.addEventListener('keydown', fire, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', fire, { capture: true });
      window.removeEventListener('keydown', fire, { capture: true });
    };
  }, [mode, projector, opts.casting]);

  // A cast that ends (the projector window closed by hand) does not re-arm
  // for the same screen; unplugging and replugging does.
  useEffect(() => { if (!opts.casting && !projector) sentRef.current = null; }, [opts.casting, projector]);

  /** The chip's click: get permission if needed, then send. Runs in the gesture. */
  const sendNow = useCallback(async () => {
    let p = projector;
    if (!p) p = await watch();
    if (p) { sentRef.current = `${p.left},${p.top},${p.availWidth}x${p.availHeight}`; sendRef.current(p); }
  }, [projector, watch]);

  return { mode, setMode, projector, permission, armed, sendNow, watch };
}
