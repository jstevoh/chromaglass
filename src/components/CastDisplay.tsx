import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { LiquidVisualizer, type LiquidVisualizerHandle } from './LiquidVisualizer';
import { DEFAULT_SETTINGS } from '../types';
import type { AudioData } from '../hooks/useAudioAnalyzer';
import { CAST_CHANNEL, type CastMessage, type CastState } from '../lib/castProtocol';
import { useRemoteLink } from '../hooks/useRemoteLink';
import { useWakeLock } from '../hooks/useWakeLock';
import { LOCKUP_URL } from '../brand';

/**
 * The cast receiver: the show on the second screen.
 *
 * Runs the visualizer itself and takes everything it needs from the sender —
 * settings, the audio bands, seeds and clears — over whichever link brought
 * it here: a PresentationConnection when Chrome presented this page to a
 * Chromecast or a second display, or a BroadcastChannel when it was opened
 * as a popup. It never looks at `window.opener`: a presented page has none.
 *
 * No pointer here, ever. It used to come back on any movement and hide after
 * two and a half seconds still (three on a receiver), which meant an arrow on
 * the wall every time the operator's hand crossed to the projector's screen
 * on its way somewhere, and at the moment the owner opened the window; the
 * owner asked for none on the show at all (2026-10-04). Nothing on this page
 * is meant to be aimed at: a click anywhere asks for full screen, and F,
 * Enter or Space do the same. The class and its rule are in `index.html`'s
 * head, so even the black window that waits for this page has no arrow (set
 * from `main.tsx` it was there for the first ~30 ms), and the rule is
 * `.show-screen *` with `!important` rather than a style on the root here,
 * because a style on one element is undone by any child that sets its own
 * (the plate's canvas is `cursor-crosshair`). `npm run showcursor` holds it.
 */
export default function CastDisplay() {
  // Opened by the show window itself, on this machine: mirror its canvas pixel
  // for pixel. That is the HDMI projector — one render, at the projector's
  // own resolution, nothing sent anywhere, and every stroke on the laptop is
  // on the wall the same frame. A page presented by Chrome or opened over the
  // network has no opener and runs the show itself instead.
  const source = useMemo(() => {
    try {
      const o = window.opener as Window | null;
      return (o && !o.closed && o.document?.querySelector<HTMLCanvasElement>('#liquid-canvas')) || null;
    } catch {
      return null;   // cross-origin, or no opener
    }
  }, []);
  if (source) return <StageMirror source={source} />;
  return <CastReceiver />;
}

/**
 * The browser's own fullscreen: the only thing that removes the window's
 * title bar (the app's name, or the address). It needs a gesture: a click or
 * key on this window, or one on the show window handed over by capability
 * delegation (the opener posts a message with its gesture attached).
 */
function goFullscreen() {
  const el = document.documentElement as HTMLElement & { requestFullscreen?: (o?: { navigationUI?: 'hide' | 'show' | 'auto' }) => Promise<void> };
  el.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => { /* not allowed here */ });
}

function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const change = () => setIsFullscreen(!!document.fullscreenElement);
    const key = (e: KeyboardEvent) => { if (e.key === 'f' || e.key === 'F' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goFullscreen(); } };
    const message = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if ((e.data as { chromaglass?: string } | null)?.chromaglass === 'fullscreen') goFullscreen();
    };
    document.addEventListener('fullscreenchange', change);
    window.addEventListener('keydown', key);
    window.addEventListener('message', message);
    // Full screen may have come between the first render and this listener:
    // the Mac app puts the window there as soon as it has loaded
    // (desktop/main.js), and a missed change left the click hint on the wall
    // over a window already in full screen (seen once in three runs of
    // `npm run desktop`).
    change();
    return () => {
      document.removeEventListener('fullscreenchange', change);
      window.removeEventListener('keydown', key);
      window.removeEventListener('message', message);
    };
  }, []);
  return isFullscreen;
}

/** The projector window: the show window's canvas, and nothing else. */
function StageMirror({ source }: { source: HTMLCanvasElement }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gone, setGone] = useState(false);
  /** For `?debug`: frames painted, times gone dark, times taken back by a reloaded show. */
  const statsRef = useRef({ paints: 0, darkened: 0, reattached: 0 });
  const isFullscreen = useFullscreen();
  // This window *is* the projector. Nothing it does is worth a screensaver.
  useWakeLock(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CAST_CHANNEL) : null;
    let lastW = 0, lastH = 0;
    const stats = statsRef.current;
    // Tell the show window how many pixels this screen has, so it renders
    // that many; again whenever the window moves, resizes or goes fullscreen.
    const announce = (again = false) => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(window.innerWidth * dpr));
      const h = Math.max(1, Math.round(window.innerHeight * dpr));
      if (again && w === lastW && h === lastH) {
        // The same size to a show that has never heard it: a reloaded one.
        bc?.postMessage({ type: 'stage', width: w, height: h } satisfies CastMessage);
        return;
      }
      if (w !== lastW || h !== lastH) {
        canvas.width = w; canvas.height = h;
        /*
          Scaled the way a picture is scaled, not the way a texture is.

          The show draws this window's pixels at a share of them when the
          governor has had to give pixels up (PLAN.md §14c: three quarters or
          half of the stage), and the letterbox scales whatever arrives, so
          `drawImage` below is enlarging a frame much of the time. A 2D
          context left alone does that at `imageSmoothingQuality` 'low', the
          cheapest filter the browser has, and nothing here ever set it.
          'high' is its best, paid once per frame on one image, and a frame
          drawn at three quarters and enlarged is exactly the case it exists
          for. What it looks like on a real projector is for the Mac to say.

          Set here, after the size, because assigning a canvas's width resets
          its context's state to the defaults, 'low' included: set once at
          the top, it would have been lost the first time the window went
          fullscreen.
        */
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        lastW = w; lastH = h;
        bc?.postMessage({ type: 'stage', width: w, height: h } satisfies CastMessage);
      }
    };
    const resized = () => announce();
    announce();
    window.addEventListener('resize', resized);
    document.addEventListener('fullscreenchange', resized);
    /*
      The show pushes; this window does not pull (docs/webgpu-plan.md, P3).

      This used to run its own rAF and `drawImage` the opener's canvas, which
      is exactly what a presented WebGPU canvas cannot serve: once the frame
      is out, reading it gives black — not an error, just a dark projector.
      So the drawing moves to the show window, into the frame task that drew
      it, where the canvas is still readable on either engine.

      It costs nothing and removes something: there is one clock now instead
      of two that could tear against each other. What stays here is the
      letterbox — this window knows its own size — and announcing that size,
      which is how the show knows how many pixels to render.
    */
    const opener = window.opener as (Window & { __chromaglassMirror?: unknown }) | null;
    /*
      Dark while there is no show to mirror.

      A reload of the show used to leave this window holding its last frame
      for good (S15): a still picture on the wall, which reads to a room as
      the show having frozen, and to the operator as nothing at all. While
      the show is away the wall fades to black, the projector's own "off",
      and the first frame of the show that comes back fades it up again. The
      fade is the canvas's opacity over the black page, so it costs no draw
      and holds whatever was last painted until it is under black.
    */
    let dark = false;
    canvas.style.transition = 'opacity 0.4s linear';
    const goDark = (on: boolean) => {
      if (dark === on) return;
      dark = on;
      canvas.style.opacity = on ? '0' : '1';
      if (on) stats.darkened++;
    };
    const paint = (frame: HTMLCanvasElement) => {
      const sw = frame.width, sh = frame.height;
      if (sw === 0 || sh === 0 || lastW === 0 || lastH === 0) return;
      stats.paints++;
      if (dark) goDark(false);
      const s = Math.min(lastW / sw, lastH / sh);
      const dw = Math.round(sw * s), dh = Math.round(sh * s);
      const dx = (lastW - dw) >> 1, dy = (lastH - dh) >> 1;
      if (dw !== lastW || dh !== lastH) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, lastW, lastH); }
      ctx.drawImage(frame, 0, 0, sw, sh, dx, dy, dw, dh);
    };
    if (opener && !opener.closed) opener.__chromaglassMirror = paint;

    /*
      And this window drives the clock when the show window cannot.

      The show pushes frames; it does not get pulled. That is right, and it
      has one consequence: when the browser stops giving the show window
      animation frames — which is what happens the moment this window goes
      fullscreen and covers it — the wall holds the last frame it was given
      and the show appears to freeze.

      This window is the one that is definitely visible, so it asks. The show
      ignores the ask if it has already drawn this interval, so with both
      windows up there is still one clock and nothing tears (PLAN.md §14b,
      lib/drawGate.ts).

      The ask carries the time this window's refresh began, on the show's
      clock. Both windows share one main thread, so an ask can wait behind
      the show's own draw in the same refresh; stamped with the time it got
      to run, a draw that cost more than 0.6 of a refresh made it look like
      the next refresh's and the plate drew twice. The animation frame's
      timestamp is on this window's clock, which starts when this window
      opened; the difference of the two windows' `timeOrigin`s moves it onto
      the show's.
    */
    let tick = 0;
    const ask = (ts: number) => {
      try {
        const o = window.opener as (Window & { __chromaglassFrame?: (ts?: number) => void }) | null;
        if (o && !o.closed) o.__chromaglassFrame?.(ts + performance.timeOrigin - o.performance.timeOrigin);
      } catch { /* the show window is gone, or cross-origin */ }
      tick = requestAnimationFrame(ask);
    };
    tick = requestAnimationFrame(ask);

    /*
      The show window closing, and the show window reloading: the two things
      this window has to notice for itself.

      A close makes the opener `closed`. A reload does not: it is the same
      window with a new page in it, and what says so is that the page has no
      `paint` of ours on it any more (the old page also takes it away as it
      goes, so the wall darkens at once rather than at the next look). Then
      this window puts `paint` back on the new page, which is what makes its
      frames arrive here, and asks the new page to take it as its projector
      (`__chromaglassWallBack`, useCastSession), which gives the show its
      `isCasting`, its poll and its channel back. Then the stage again, which
      the new page needs to render this screen's pixels and has never heard.
      From then on it asks on every turn of the watch, not only until it is
      answered: the hook is there only once the new page's app has mounted,
      and a hold the show dropped while this window stayed up is taken back
      the same way.

      Only an empty hook is taken. One that is someone else's function is
      another projector window the show opened since, and two windows each
      putting theirs back four times a second would take turns at the frames.

      Every quarter of a second rather than every half: the reattach is the
      second a wall stands dark after a reload, and reading a property costs
      nothing.
    */
    /*
      Asking starts with the first reload this window sees. A window the show
      opened itself is held already; one a harness opened by hand
      (`npm run wall`, `npm run showcursor`) was never the show's to hold, and
      taken on its first ask it would have the show render at its size and
      feed it the cast state, which those checks do not measure for.
    */
    let asking = false;
    const watch = window.setInterval(() => {
      const o = window.opener as (Window & { __chromaglassMirror?: unknown; __chromaglassWallBack?: (w: Window) => 'taken' | 'held' | false }) | null;
      if (!o || o.closed) { setGone(true); goDark(false); return; }
      let theirs: unknown;
      // Another origin's page in the show window: no show to mirror.
      try { theirs = o.__chromaglassMirror; } catch { goDark(true); return; }
      if (theirs !== paint) {
        goDark(true);
        if (theirs !== undefined) return;                             // another wall has the show
        try { o.__chromaglassMirror = paint; } catch { return; }
        asking = true;
      }
      if (!asking) return;
      let back: ((w: Window) => 'taken' | 'held' | false) | undefined;
      try { back = o.__chromaglassWallBack; } catch { return; }
      if (typeof back !== 'function') return;                         // the new page's app is not up yet
      if (back(window) === 'taken') {
        stats.reattached++;
        announce(true);
      }
    }, 250);

    return () => {
      cancelAnimationFrame(tick);
      window.clearInterval(watch);
      try {
        const o = window.opener as (Window & { __chromaglassMirror?: unknown }) | null;
        if (o && !o.closed && o.__chromaglassMirror === paint) o.__chromaglassMirror = undefined;
      } catch { /* the show window is gone */ }
      window.removeEventListener('resize', resized);
      document.removeEventListener('fullscreenchange', resized);
      bc?.close();
    };
  }, [source]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('debug')) {
      (window as unknown as { chromaglassCast?: unknown }).chromaglassCast = () => {
        // The show's canvas of the moment: after a reload it is not the one this window opened on.
        let now: HTMLCanvasElement | null = null;
        try { now = (window.opener as Window | null)?.document?.querySelector<HTMLCanvasElement>('#liquid-canvas') ?? null; } catch { /* gone */ }
        const c = canvasRef.current;
        return {
          mode: 'mirror', linked: !gone,
          stage: { width: c?.width, height: c?.height },
          source: { width: (now ?? source).width, height: (now ?? source).height },
          dark: c?.style.opacity === '0',
          ...statsRef.current,
        };
      };
    }
  }, [gone, source]);

  return (
    <div
      className="w-full h-screen bg-black overflow-hidden"
      onClick={goFullscreen}
      data-testid="cast-display"
    >
      <canvas ref={canvasRef} className="w-full h-full" id="stage-canvas" />
      {gone && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl px-6 py-4 text-center">
            <p className="text-white/60 text-sm">The show window was closed</p>
          </div>
        </div>
      )}
      <CastHint isFullscreen={isFullscreen} />
    </div>
  );
}

/** A receiver with no show window to mirror: runs the show itself, fed by messages. */
function CastReceiver() {
  const visualizerRef = useRef<LiquidVisualizerHandle>(null);
  // Same again for a network display or a Chromecast tab: it exists to be
  // looked at. (A LAN address is not a secure context, so the lock is simply
  // unavailable there and the hook says so rather than pretending.)
  useWakeLock(true);
  const [state, setState] = useState<CastState | null>(null);
  const [audio, setAudio] = useState<AudioData | null>(null);
  const [linked, setLinked] = useState(false);
  const lastPresetSeq = useRef(0);
  const lastMessageAt = useRef(0);
  const [stale, setStale] = useState(false);

  const handle = useCallback((msg: CastMessage) => {
    lastMessageAt.current = performance.now();
    if (msg.type === 'state') {
      setLinked(true);
      setState(msg.state);
    } else if (msg.type === 'audio') {
      if (!msg.audio) { setAudio(null); return; }
      setAudio({
        ...msg.audio,
        frequencyData: EMPTY,
        timeDomainData: EMPTY,
        calibration: null,
      });
    } else if (msg.type === 'mark') {
      // The logo, as a picture rather than as a setting. Decoded here and
      // handed to this window's own visualizer, because this is a separate
      // document that has never seen the operator's file.
      if (!msg.dataUrl) { visualizerRef.current?.clearMark?.(); return; }
      const img = new window.Image();
      img.onload = () => visualizerRef.current?.loadMark?.(img, img.naturalWidth, img.naturalHeight);
      img.src = msg.dataUrl;
    }
  }, []);

  // The sender re-seeds the plate when a preset is chosen; do the same here,
  // and pin the palette the way the sender has it.
  useEffect(() => {
    if (!state) return;
    if (state.presetSeq > lastPresetSeq.current && state.presetId) {
      lastPresetSeq.current = state.presetSeq;
      visualizerRef.current?.applyPreset(state.presetId);
    }
    visualizerRef.current?.setHarmonyLock(state.harmonyLock);
  }, [state]);

  // A network display: served by the show server on the LAN, fed through
  // its relay. The link probes first, so a receiver opened from a static
  // host stays quiet.
  useRemoteLink({
    role: 'mirror',
    onMessage: (m) => { if (m.type === 'cast') handle(m.message); },
  });

  useEffect(() => {
    const hello = JSON.stringify({ type: 'hello' } satisfies CastMessage);
    const cleanups: (() => void)[] = [];

    // Presented by Chrome: connections arrive through the receiver object.
    const receiver = (navigator as unknown as { presentation?: { receiver?: PresentationReceiverLike } }).presentation?.receiver;
    if (receiver) {
      const attach = (conn: PresentationConnectionLike) => {
        conn.onmessage = (e) => {
          try { handle(JSON.parse(e.data) as CastMessage); } catch { /* not ours */ }
        };
        const sayHello = () => { try { conn.send(hello); } catch { /* not yet open */ } };
        if (conn.state === 'connected') sayHello();
        conn.onconnect = sayHello;
      };
      receiver.connectionList.then((list) => {
        list.connections.forEach(attach);
        list.onconnectionavailable = (e) => attach(e.connection);
      }).catch(() => { /* no presentation here */ });
    }

    // Opened as a popup: the sender is on the same origin, one channel away.
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(CAST_CHANNEL);
      bc.onmessage = (e: MessageEvent<CastMessage>) => handle(e.data);
      bc.postMessage({ type: 'hello' } satisfies CastMessage);
      /*
        And say so on the way out.

        Closing this window with its own X left the sender polling for up to a
        second before it noticed, and during that second the projector was
        gone while the app still believed it was casting. `pagehide` rather
        than `beforeunload`: it fires for a closed tab and for one the browser
        freezes, which `beforeunload` does not reliably do.
      */
      const bye = () => { try { bc.postMessage({ type: 'goodbye' } satisfies CastMessage); } catch { /* channel already shut */ } };
      window.addEventListener('pagehide', bye);
      cleanups.push(() => { window.removeEventListener('pagehide', bye); bye(); bc.close(); });
    }

    // If the sender goes quiet the plate keeps running on its last settings;
    // say so rather than pretending the link is live.
    const timer = setInterval(() => setStale(linkedRef.current && performance.now() - lastMessageAt.current > 4000), 1000);
    cleanups.push(() => clearInterval(timer));
    return () => cleanups.forEach((c) => c());
  }, [handle]);
  const linkedRef = useRef(false);
  linkedRef.current = linked;

  const isFullscreen = useFullscreen();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('debug')) {
      (window as unknown as { chromaglassCast?: unknown }).chromaglassCast = () => ({ linked, stale, state, audio });
    }
  }, [linked, stale, state, audio]);

  const settings = state?.settings ?? DEFAULT_SETTINGS;

  return (
    <div
      className="relative w-full h-screen bg-black overflow-hidden text-white overlays-hidden"
      onClick={goFullscreen}
      data-testid="cast-display"
    >
      <LiquidVisualizer
        ref={visualizerRef}
        audioData={audio}
        settings={settings}
        output={state?.output}
        seedCount={state?.seedCount ?? 0}
        clearTrigger={state?.clearTrigger ?? 0}
        drainTrigger={state?.drainTrigger ?? 0}
        activeLayer={state?.activeLayer ?? 0}
        isAutomated={state?.isAutomated ?? false}
        isActive={state?.isActive ?? true}
      />

      {(!linked || stale) && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-black/70 backdrop-blur-xl border border-white/10 rounded-2xl px-6 py-4 text-center">
            <img src={LOCKUP_URL} alt="ChromaGlass" className="mx-auto block h-9 w-auto" draggable={false} />
            <p className="text-white/80 text-sm font-medium mt-2">Cast Display</p>
            <p className="text-white/40 text-xs mt-1">{linked ? 'The show window has gone quiet' : 'Waiting for the show…'}</p>
          </div>
        </div>
      )}

      {/*
        A black projector is ambiguous: blacked out on purpose, or a dead
        link? The caption says which, quietly, and only for the first few
        seconds after it goes dark — long enough for the operator who just
        pressed B, gone before an audience can read anything off the wall.
      */}
      <BlackoutCaption on={(settings.dimmer ?? 1) <= 0.02} />

      <CastHint isFullscreen={isFullscreen} />
    </div>
  );
}

function BlackoutCaption({ on }: { on: boolean }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!on) { setShow(false); return; }
    setShow(true);
    const timer = setTimeout(() => setShow(false), 3000);
    return () => clearTimeout(timer);
  }, [on]);
  if (!show) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center" data-testid="wall-blackout">
      <span className="font-mono text-[11px] tracking-widest" style={{ color: '#3F3F46' }}>blackout</span>
    </div>
  );
}

const EMPTY = new Uint8Array(0);

/**
 * Shown while the window still has its frame, and gone the moment it fills
 * the screen. A window opened fullscreen by the show never shows it (the
 * short delay covers the browser reporting the state).
 */
function CastHint({ isFullscreen }: { isFullscreen: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(timer);
  }, []);
  if (!ready || isFullscreen) return null;
  // The OS's full screen (the green button) fills the screen but keeps the
  // browser's title bar; only the browser's own full screen drops it.
  const osFull = window.innerHeight >= (window.screen?.height ?? 0) - 4;
  return (
    <div className="fixed bottom-6 inset-x-0 flex justify-center z-50 pointer-events-none" data-testid="cast-hint">
      <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-2 text-center">
        <p className="text-white/60 text-xs">Click here, press F, or click the show on the laptop, to fill this screen</p>
        {osFull && <p className="text-white/35 text-[10px] mt-0.5">That bar at the top is the browser's title bar: its own full screen removes it, the green button does not</p>}
      </div>
    </div>
  );
}

interface PresentationConnectionLike {
  state: 'connecting' | 'connected' | 'closed' | 'terminated';
  send(data: string): void;
  onmessage: ((e: MessageEvent<string>) => void) | null;
  onconnect: (() => void) | null;
}
interface PresentationReceiverLike {
  connectionList: Promise<{
    connections: PresentationConnectionLike[];
    onconnectionavailable: ((e: { connection: PresentationConnectionLike }) => void) | null;
  }>;
}
