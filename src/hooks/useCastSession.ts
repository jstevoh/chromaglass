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
export function useCastSender(onReceiverReady: () => void) {
  const [isCasting, setIsCasting] = useState(false);
  const windowRef = useRef<Window | null>(null);
  const connectionRef = useRef<PresentationConnectionLike | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const readyRef = useRef(onReceiverReady);
  readyRef.current = onReceiverReady;

  const cleanup = useCallback(() => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
    windowRef.current = null;
    connectionRef.current = null;
    channelRef.current?.close();
    channelRef.current = null;
    setIsCasting(false);
  }, []);

  const openChannel = useCallback(() => {
    if (channelRef.current || typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel(CAST_CHANNEL);
    bc.onmessage = (e: MessageEvent<CastMessage>) => {
      if (e.data?.type === 'hello') readyRef.current();
    };
    channelRef.current = bc;
  }, []);

  const startCast = useCallback(async () => {
    const debug = new URLSearchParams(window.location.search).has('debug') ? '&debug' : '';
    const castUrl = `${window.location.origin}${window.location.pathname}?cast=true${debug}`;

    // Presentation API: the native device picker, with Chromecasts and
    // second displays in it. The receiver page is presented there and
    // driven over the connection.
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

    // Fallback: a popup on this machine, driven over a BroadcastChannel.
    const castWindow = window.open(castUrl, 'chromaglass-cast', 'popup,width=1920,height=1080');
    if (castWindow) {
      windowRef.current = castWindow;
      openChannel();
      setIsCasting(true);
      checkIntervalRef.current = setInterval(() => {
        if (castWindow.closed) cleanup();
      }, 1000);
    }
  }, [cleanup, openChannel]);

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

  return { isCasting, startCast, stopCast, send };
}

// The Presentation API is not in every TypeScript lib; the shape used here.
interface PresentationRequestLike {
  start(): Promise<PresentationConnectionLike>;
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
