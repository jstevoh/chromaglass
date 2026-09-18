import { useState, useRef, useCallback, useEffect } from 'react';
import { CAST_CHANNEL, type CastMessage } from '../lib/castProtocol';

/**
 * The sender side of casting.
 *
 * Presentation API first: Chrome shows its device picker and presents the
 * receiver page on a Chromecast or a second display. That page runs in its
 * own context, so it is driven over the PresentationConnection. If there is
 * no Presentation API, or the user cancels the picker, a popup window is
 * opened instead and driven over a BroadcastChannel. Either way `send`
 * reaches whatever receiver is live, and `onReceiverReady` fires when one
 * connects so the app can push a full snapshot.
 */
export function useCastSender(
  onReceiverReady: () => void,
  onStage?: (size: { width: number; height: number } | null) => void,
  /** Something went wrong the operator needs to know about, in words. */
  onTrouble?: (message: string) => void,
) {
  const [isCasting, setIsCasting] = useState(false);
  /** For a window we opened: whether it fills its screen (the browser's own fullscreen, no title bar); null when unknown or not a window. */
  const [windowFullscreen, setWindowFullscreen] = useState<boolean | null>(null);
  const windowRef = useRef<Window | null>(null);
  const connectionRef = useRef<PresentationConnectionLike | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const readyRef = useRef(onReceiverReady);
  readyRef.current = onReceiverReady;
  const stageRef = useRef(onStage);
  stageRef.current = onStage;
  const troubleRef = useRef(onTrouble);
  troubleRef.current = onTrouble;
  /** Bumped per open, so a fresh window never reuses a stale window's name. */
  const openSeq = useRef(0);

  const cleanup = useCallback(() => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
    windowRef.current = null;
    connectionRef.current = null;
    channelRef.current?.close();
    channelRef.current = null;
    stageRef.current?.(null);
    setIsCasting(false);
    setWindowFullscreen(null);
  }, []);

  const readWindowFullscreen = useCallback((w: Window): boolean | null => {
    try { return !!w.document.fullscreenElement; } catch { return null; }   // not ours to read
  }, []);

  /**
   * Make the projector window fill its screen from a gesture in this window.
   * A title bar on it (the app's name, or the address) is the browser's
   * window frame: the OS's full screen keeps it, the browser's own removes
   * it, and that needs a gesture — normally one on that window. Capability
   * delegation hands this window's gesture to it, so a click here does it.
   * Must be called from a click or key press.
   */
  const fillWindow = useCallback(() => {
    const w = windowRef.current;
    if (!w || w.closed || readWindowFullscreen(w) !== false) return;
    const msg = { chromaglass: 'fullscreen' };
    try {
      (w.postMessage as unknown as (m: unknown, o: { targetOrigin: string; delegate?: string }) => void)(msg, { targetOrigin: window.location.origin, delegate: 'fullscreen' });
    } catch {
      try { w.postMessage(msg, window.location.origin); } catch { /* gone */ }
    }
  }, [readWindowFullscreen]);

  const openChannel = useCallback(() => {
    if (channelRef.current || typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel(CAST_CHANNEL);
    bc.onmessage = (e: MessageEvent<CastMessage>) => {
      if (e.data?.type === 'hello') readyRef.current();
      if (e.data?.type === 'stage') stageRef.current?.({ width: e.data.width, height: e.data.height });
      // The receiver closing, at the moment it happens rather than whenever
      // the poll next comes round.
      if (e.data?.type === 'goodbye') cleanup();
    };
    channelRef.current = bc;
  }, [cleanup]);

  /**
   * Open the receiver in a window. With the Window Management API and a
   * second screen present, the window is placed on the other screen at its
   * full size — the projector plugged into the laptop, which is what most
   * shows are. Otherwise a large popup on this screen.
   */
  const openWindow = useCallback(async (castUrl: string, screen?: ScreenLike | null) => {
    // The window must open in the click itself: anything after an await has
    // lost the user gesture and is blocked as a popup. So open first, then
    // find the other screen and move the window there. When the projector
    // is already known, the window opens straight on it, and fullscreen
    // where the browser allows a popup to (Chrome, with the permission).
    const features = screen
      ? `popup,fullscreen,left=${Math.round(screen.availLeft)},top=${Math.round(screen.availTop)},width=${Math.round(screen.availWidth)},height=${Math.round(screen.availHeight)}`
      : 'popup,width=1920,height=1080';
    /*
      Reopening after the window was closed by hand.

      Three things made that unreliable, and the first one made it silent.

      A blocked popup returned false and said nothing at all, so "Send to
      wall" did visibly nothing and there was no way to tell a blocked popup
      from a broken feature. Chrome is readier to block the second open than
      the first, which is exactly the case being reported.

      The window was opened under a fixed name, and a named target that the
      browser still half-remembers can hand back a window that never
      navigates — so the name now carries a counter and every open is its own
      window.

      And an open window should be brought forward rather than duplicated:
      pressing the button twice meant a second projector nobody asked for.
    */
    const live = windowRef.current;
    if (live && !live.closed) {
      try { live.focus(); } catch { /* another screen, another space */ }
      return true;
    }
    const castWindow = window.open(castUrl, `chromaglass-cast-${++openSeq.current}`, features);
    if (!castWindow) {
      troubleRef.current?.('Chrome blocked the projector window — allow pop-ups for this site');
      return false;
    }
    windowRef.current = castWindow;
    openChannel();
    setIsCasting(true);
    // Cleared first: opening twice used to leave the previous poll running for
    // a window nobody holds a reference to any more.
    if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    checkIntervalRef.current = setInterval(() => {
      if (castWindow.closed) { cleanup(); return; }
      setWindowFullscreen(readWindowFullscreen(castWindow));
    }, 400);
    try {
      const w = window as unknown as { getScreenDetails?: () => Promise<{ screens: ScreenLike[]; currentScreen: ScreenLike }> };
      if (w.getScreenDetails) {
        const details = await w.getScreenDetails();
        const cur = details.currentScreen;
        // The projector is the screen that is not built in; failing that, any other screen.
        const notHere = (sc: ScreenLike) => sc.left !== cur.left || sc.top !== cur.top;
        const other = details.screens.find((sc) => (sc as ScreenLike & { isInternal?: boolean }).isInternal === false && notHere(sc))
          ?? details.screens.find(notHere);
        const target = screen ?? other;
        if (target && !castWindow.closed) {
          castWindow.moveTo(target.availLeft, target.availTop);
          castWindow.resizeTo(target.availWidth, target.availHeight);
        }
      }
    } catch {
      // Permission refused or no such API: the window stays where it opened.
    }
    return true;
  }, [cleanup, openChannel, readWindowFullscreen]);

  // While our window is up with its title bar showing, the next click or key
  // anywhere in this window fills it (delegation needs the gesture itself).
  useEffect(() => {
    if (windowFullscreen !== false) return;
    const fire = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      fillWindow();
    };
    window.addEventListener('pointerdown', fire, { capture: true });
    window.addEventListener('keydown', fire, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', fire, { capture: true });
      window.removeEventListener('keydown', fire, { capture: true });
    };
  }, [windowFullscreen, fillWindow]);

  const startCast = useCallback(async (mode: 'window' | 'device' = 'device', screen?: ScreenLike | null) => {
    const debug = new URLSearchParams(window.location.search).has('debug') ? '&debug' : '';
    const castUrl = `${window.location.origin}${window.location.pathname}?cast=true${debug}`;

    if (mode === 'window') { await openWindow(castUrl, screen); return; }

    // Presentation API: Chrome's device picker, with Chromecasts in it. The
    // receiver page is presented there and driven over the connection.
    const PR = (window as unknown as { PresentationRequest?: new (urls: string[]) => PresentationRequestLike }).PresentationRequest;
    if (PR) {
      try {
        const request = new PR([castUrl]);
        const connection = await request.start();
        connectionRef.current = connection;
        connection.onmessage = (e: MessageEvent<string>) => {
          try {
            const msg = JSON.parse(e.data) as CastMessage;
            if (msg.type === 'hello') readyRef.current();
          } catch { /* not ours */ }
        };
        connection.onconnect = () => readyRef.current();
        connection.onclose = cleanup;
        connection.onterminate = cleanup;
        setIsCasting(true);
        if (connection.state === 'connected') readyRef.current();
        return;
      } catch {
        // The user closed the picker, or there was nothing to present to.
      }
    }

    // No device chosen: a window on this machine, driven over a BroadcastChannel.
    await openWindow(castUrl);
  }, [cleanup, openWindow]);

  const stopCast = useCallback(() => {
    try { connectionRef.current?.terminate(); } catch { /* already gone */ }
    try { windowRef.current?.close(); } catch { /* already gone */ }
    cleanup();
  }, [cleanup]);

  /** Deliver a message to the live receiver, whichever kind it is. */
  const send = useCallback((msg: CastMessage) => {
    const conn = connectionRef.current;
    if (conn && conn.state === 'connected') {
      try { conn.send(JSON.stringify(msg)); } catch { /* connection dropped mid-send */ }
    }
    channelRef.current?.postMessage(msg);
  }, []);

  useEffect(() => () => { cleanup(); }, [cleanup]);

  return { isCasting, startCast, stopCast, send, windowFullscreen, fillWindow };
}

// The Presentation API is not in every TypeScript lib; the shape used here.
interface PresentationRequestLike {
  start(): Promise<PresentationConnectionLike>;
}
export interface ScreenLike {
  left: number; top: number;
  availLeft: number; availTop: number; availWidth: number; availHeight: number;
  isPrimary?: boolean;
  isInternal?: boolean;
  label?: string;
}
interface PresentationConnectionLike {
  state: 'connecting' | 'connected' | 'closed' | 'terminated';
  send(data: string): void;
  terminate(): void;
  close(): void;
  onmessage: ((e: MessageEvent<string>) => void) | null;
  onconnect: (() => void) | null;
  onclose: (() => void) | null;
  onterminate: (() => void) | null;
}
