import { useCallback, useEffect, useRef, useState } from 'react';
import {
  probeRelay,
  remoteSocketUrl,
  type RemoteMessage,
  type RemoteState,
} from '../lib/remoteProtocol';

export type RemoteStatus = 'connecting' | 'connected' | 'offline';

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

  // Handlers and state are read through refs so a re-render never tears the
  // socket down and reconnects.
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const stateRef = useRef(state);
  stateRef.current = state;

  const send = useCallback((message: RemoteMessage) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus('offline');
      return;
    }
    closedRef.current = false;

    const connect = () => {
      if (closedRef.current) return;
      // The display is on every page load, relay or not — a Firebase-hosted
      // page has nothing to talk to. Probe before opening a socket, since a
      // refused handshake is a console error nothing can suppress. A phone
      // was pointed here deliberately, so it connects straight away.
      if (role !== 'controller') {
        void probeRelay().then((present) => {
          if (closedRef.current) return;
          if (present) openSocket();
          else {
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
        socket = new WebSocket(remoteSocketUrl());
      } catch {
        scheduleRetry();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        retryRef.current = RETRY_MIN;
        setStatus('connected');
        socket.send(JSON.stringify({ type: 'hello', role } satisfies RemoteMessage));
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
        if (message.type === 'request-state' && role === 'display' && stateRef.current) {
          socket.send(JSON.stringify({ type: 'state', state: stateRef.current } satisfies RemoteMessage));
          return;
        }
        onMessageRef.current?.(message);
      };

      socket.onclose = () => {
        socketRef.current = null;
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
