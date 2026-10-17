import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_FRAME_BYTES,
  relayInfo,
  remoteSocketUrl,
  showKeyFromUrl,
  type RemoteMessage,
  type RemoteState,
} from '../lib/remoteProtocol';

/**
 * 'denied' means the relay is there but this page's show key is wrong or missing.
 * 'locked' means this address gave three wrong keys and the relay is refusing it
 * for a few minutes (PLAN 14m); the link tries again by itself when that is over.
 */
export type RemoteStatus = 'connecting' | 'connected' | 'offline' | 'denied' | 'locked';

interface UseRemoteLinkOptions {
  role: 'display' | 'controller' | 'mirror';
  /** Called for every message addressed to this role. */
  onMessage?: (message: RemoteMessage) => void;
  /**
   * Display only: the current state, sent on connect, on request, and whenever
   * it changes. Controllers pass nothing.
   */
  state?: RemoteState;
  /**
   * Skip connecting entirely. The display sets this when no relay is expected
   * (a Firebase-hosted page, say) so the app behaves exactly as it always has.
   */
  enabled?: boolean;
}

/** Reconnect backoff, milliseconds. */
const RETRY_MIN = 500;
const RETRY_MAX = 8000;
/** How often a display with no relay in sight looks again for one. */
const PROBE_INTERVAL = 30000;

/**
 * One end of the phone-remote link.
 *
 * Reconnects on its own with backoff — a laptop lid closing or a phone
 * sleeping shouldn't need anyone to reload anything — and stays completely
 * silent when there's no relay to talk to.
 */
export function useRemoteLink({ role, onMessage, state, enabled = true }: UseRemoteLinkOptions) {
  const [status, setStatus] = useState<RemoteStatus>(enabled ? 'connecting' : 'offline');
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(RETRY_MIN);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);
  const lockedRef = useRef(false);
  // Has a relay ever answered this page? Then one that stops answering is coming back.
  const seenRef = useRef(false);
  // The show key: from the URL a phone or display was given, or — on the
  // machine the server runs on — from the relay itself.
  const keyRef = useRef<string | null>(showKeyFromUrl());

  // Handlers and state are read through refs so a re-render never tears the
  // socket down and reconnects.
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const stateRef = useRef(state);
  stateRef.current = state;

  const send = useCallback((message: RemoteMessage) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      const raw = JSON.stringify(message);
      // The relay closes a socket that sends more than MAX_FRAME_BYTES (PLAN 14m),
      // so a message that large is dropped here and the link kept: losing one
      // oversized patch is better than every phone losing the laptop while it
      // reconnects. A string's UTF-8 is at most three bytes a character, so the
      // encoder runs only for a message that could be over.
      if (raw.length * 3 > MAX_FRAME_BYTES && new TextEncoder().encode(raw).length > MAX_FRAME_BYTES) {
        console.warn(`Not sent to the show server: a ${message.type} message over ${MAX_FRAME_BYTES >> 10} KB`);
        return;
      }
      socket.send(raw);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus('offline');
      return;
    }
    closedRef.current = false;
    lockedRef.current = false;

    const connect = () => {
      if (closedRef.current) return;
      // The display is on every page load, relay or not — a Firebase-hosted
      // page has nothing to talk to. Probe before opening a socket, since a
      // refused handshake is a console error nothing can suppress. A phone
      // was pointed here deliberately, so it connects straight away.
      if (role !== 'controller') {
        void relayInfo().then((info) => {
          if (closedRef.current) return;
          if (info) {
            seenRef.current = true;
            // The display takes its own key (PLAN 14m), asked for again on every
            // connect since the server makes a new one each launch; a mirror on
            // the laptop takes the show key, as a phone does.
            const key = role === 'display' ? info.displayKey : info.key;
            if (key) keyRef.current = key;
            // The relay gives the display key only to the laptop at its own
            // name (localhost). The laptop's page opened at its Wi-Fi address
            // is told no key, and a display hello with none can only be
            // refused, so it stays off the relay and looks again later, as a
            // page with no relay does. (It used to say hello anyway, and
            // every try was a wrong key against the room's address.)
            if (role === 'display' && !keyRef.current) {
              setStatus('offline');
              timerRef.current = setTimeout(connect, PROBE_INTERVAL);
              return;
            }
            openSocket();
          } else if (seenRef.current) {
            // The relay was here and is gone: the show server restarting, or the
            // Mac app relaunching it. Look again on the short backoff, not the
            // half-minute probe for a page that never had one: `npm run showkey`
            // restarts the server under a linked phone and laptop, and on the
            // probe interval the laptop came back after the phone had given up
            // (a change on the laptop had not reached the phone in 25 s).
            scheduleRetry();
          } else {
            setStatus('offline');
            timerRef.current = setTimeout(connect, PROBE_INTERVAL);
          }
        });
        return;
      }
      openSocket();
    };

    const openSocket = () => {
      if (closedRef.current) return;
      let socket: WebSocket;
      try {
        socket = new WebSocket(remoteSocketUrl(role));
      } catch {
        scheduleRetry();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        retryRef.current = RETRY_MIN;
        setStatus('connected');
        socket.send(JSON.stringify({ type: 'hello', role, key: keyRef.current ?? undefined } satisfies RemoteMessage));
        if (role === 'display' && stateRef.current) {
          socket.send(JSON.stringify({ type: 'state', state: stateRef.current } satisfies RemoteMessage));
        }
      };

      socket.onmessage = (event) => {
        let message: RemoteMessage;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;   // a malformed frame is not worth tearing the link down for
        }
        if (message.type === 'denied') {
          if (message.reason === 'locked') {
            // Locked out for a few minutes: knocking sooner is refused unread and
            // only keeps the lock, so wait it out and try once more. The socket's
            // close is ignored (lockedRef) so its retry does not come early.
            lockedRef.current = true;
            setStatus('locked');
            timerRef.current = setTimeout(() => {
              lockedRef.current = false;
              connect();
            }, Math.max(RETRY_MAX, message.retryMs ?? 5 * 60_000));
            return;
          }
          // Wrong key: no point retrying with the same one.
          closedRef.current = true;
          setStatus('denied');
          return;
        }
        if (message.type === 'request-state' && role === 'display' && stateRef.current) {
          socket.send(JSON.stringify({ type: 'state', state: stateRef.current } satisfies RemoteMessage));
          return;
        }
        onMessageRef.current?.(message);
      };

      socket.onclose = () => {
        socketRef.current = null;
        if (closedRef.current || lockedRef.current) return;   // refused, locked out, or torn down on purpose: keep that status
        setStatus('connecting');
        scheduleRetry();
      };

      // An error is always followed by a close; let that path do the retrying.
      socket.onerror = () => {};
    };

    const scheduleRetry = () => {
      if (closedRef.current) return;
      setStatus('connecting');
      timerRef.current = setTimeout(connect, retryRef.current);
      retryRef.current = Math.min(RETRY_MAX, retryRef.current * 2);
    };

    connect();

    return () => {
      closedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [enabled, role]);

  // Display: push a fresh snapshot whenever the show changes — coalesced, so
  // a slider being dragged on a phone doesn't come back as a snapshot per
  // tick. The last state always goes out.
  const snapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (role !== 'display' || !state) return;
    if (snapshotTimer.current) return;   // one is already scheduled; it reads stateRef when it fires
    snapshotTimer.current = setTimeout(() => {
      snapshotTimer.current = null;
      if (stateRef.current) send({ type: 'state', state: stateRef.current });
    }, 80);
  }, [role, state, send]);

  return { status, send };
}
