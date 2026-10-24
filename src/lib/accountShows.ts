import { useEffect, useState } from 'react';
import { isSignedInCached } from './authFlag';
import { isPhoneApp, saveLaptop, remoteHref } from './appLink';
import { relayInfo } from './remoteProtocol';

export interface AccountShow {
  id: string;
  name: string;
  relay: string;
  url: string;
  key: string;
  port: number;
  hosts: string[];
  updatedAt: number;
}

const SHOW_SESSION_ID_KEY = 'chromaglass-account-show-id';
const HEARTBEAT_MS = 10_000;
const POLL_MS = 2_000;

function showsEndpoint(): string {
  return import.meta.env.VITE_FIREBASE_SHOWS_URL || '/account-shows';
}

function getShowSessionId(port: number, key: string): string {
  try {
    const existing = sessionStorage.getItem(SHOW_SESSION_ID_KEY);
    if (existing) return existing;
    const created = 'show-' + String(port) + '-' + String(key || 'local') + '-' + Date.now().toString(36);
    sessionStorage.setItem(SHOW_SESSION_ID_KEY, created);
    return created;
  } catch {
    return 'show-' + String(port);
  }
}

async function getTokenIfSignedIn(): Promise<string | null> {
  if (!import.meta.env.VITE_FIREBASE_API_KEY || !isSignedInCached()) {
    return null;
  }
  try {
    const mod = await import('./firebaseAuth');
    return await mod.getCurrentIdToken();
  } catch {
    return null;
  }
}

export async function fetchAccountShows(): Promise<AccountShow[]> {
  const token = await getTokenIfSignedIn();
  if (!token) return [];
  try {
    const res = await fetch(showsEndpoint(), {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
    });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('application/json')) {
      return [];
    }
    const data = (await res.json()) as { shows?: unknown };
    if (!Array.isArray(data.shows)) return [];
    return data.shows.filter(
      (s): s is AccountShow =>
        Boolean(
          s &&
            typeof s === 'object' &&
            typeof (s as AccountShow).id === 'string' &&
            typeof (s as AccountShow).name === 'string' &&
            typeof (s as AccountShow).relay === 'string' &&
            typeof (s as AccountShow).url === 'string' &&
            typeof (s as AccountShow).key === 'string' &&
            typeof (s as AccountShow).port === 'number',
        ),
    );
  } catch {
    return [];
  }
}

export async function publishAccountShow(
  show: Omit<AccountShow, 'updatedAt'>,
): Promise<boolean> {
  const token = await getTokenIfSignedIn();
  if (!token) return false;
  try {
    const res = await fetch(showsEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify(show),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function unpublishAccountShows(id?: string): Promise<void> {
  const token = await getTokenIfSignedIn();
  if (!token) return;
  try {
    await fetch(showsEndpoint(), {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify(id ? { id } : {}),
      keepalive: true,
    });
  } catch {
    // ignore offline errors
  }
}

/**
 * Join a running show on the local network: hands over the show's address and
 * key, remembers it for the iPhone app, and navigates to the remote surface.
 */
export function joinAccountShow(show: AccountShow): void {
  saveLaptop({ relay: show.relay, key: show.key });
  if (isPhoneApp()) {
    window.location.assign(remoteHref({ relay: show.relay, key: show.key }));
    return;
  }
  const host = window.location.hostname;
  if (host === '127.0.0.1' || host === 'localhost') {
    const localUrl =
      'http://' +
      host +
      ':' +
      String(show.port) +
      '/?remote=1&key=' +
      encodeURIComponent(show.key);
    window.location.assign(localUrl);
    return;
  }
  window.location.assign(show.url);
}

/**
 * Publish this machine's running show to the account directory while connected
 * to the local show server relay.
 */
export function usePublishAccountShow(enabled: boolean, lookName: string | null): void {
  useEffect(() => {
    if (!enabled || !import.meta.env.VITE_FIREBASE_API_KEY || !isSignedInCached()) {
      return;
    }
    let cancelled = false;
    let publishedId: string | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    const push = async () => {
      const info = await relayInfo();
      if (cancelled || !info || !info.key) return;
      const primaryHost = info.hosts[0] || window.location.hostname || '127.0.0.1';
      const relay = 'http://' + primaryHost + ':' + String(info.port);
      const url = relay + '/?remote=1&key=' + encodeURIComponent(info.key);
      const id = getShowSessionId(info.port, info.key);
      publishedId = id;
      const label = lookName ? `${lookName} (${primaryHost}:${info.port})` : `Show (${primaryHost}:${info.port})`;
      await publishAccountShow({
        id,
        name: label,
        relay,
        url,
        key: info.key,
        port: info.port,
        hosts: info.hosts,
      });
    };

    void push();
    timer = setInterval(() => {
      void push();
    }, HEARTBEAT_MS);

    const onPageHide = () => {
      if (publishedId) {
        void unpublishAccountShows(publishedId);
      }
    };
    window.addEventListener('pagehide', onPageHide);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [enabled, lookName]);
}

/**
 * Poll the signed-in account's running shows.
 */
export function useAccountShows(enabled = true): AccountShow[] {
  const [shows, setShows] = useState<AccountShow[]>([]);

  useEffect(() => {
    if (!enabled || !import.meta.env.VITE_FIREBASE_API_KEY || !isSignedInCached()) {
      setShows([]);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      const next = await fetchAccountShows();
      if (!cancelled) {
        setShows(next);
      }
    };
    void poll();
    const timer = setInterval(() => {
      void poll();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled]);

  return shows;
}
