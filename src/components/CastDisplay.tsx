import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { LiquidVisualizer, type LiquidVisualizerHandle } from './LiquidVisualizer';
import { DEFAULT_SETTINGS } from '../types';
import type { AudioData } from '../hooks/useAudioAnalyzer';
import { CAST_CHANNEL, type CastMessage, type CastState } from '../lib/castProtocol';
import { useRemoteLink } from '../hooks/useRemoteLink';

/**
 * The cast receiver: the show on the second screen.
 *
 * Runs the visualizer itself and takes everything it needs from the sender —
 * settings, the audio bands, seeds and clears — over whichever link brought
 * it here: a PresentationConnection when Chrome presented this page to a
 * Chromecast or a second display, or a BroadcastChannel when it was opened
 * as a popup. It never looks at `window.opener`: a presented page has none.
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

/** The projector window: the show window's canvas, and nothing else. */
function StageMirror({ source }: { source: HTMLCanvasElement }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gone, setGone] = useState(false);
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CAST_CHANNEL) : null;
    let lastW = 0, lastH = 0;
    // Tell the show window how many pixels this screen has, so it renders
    // that many; again whenever the window moves, resizes or goes fullscreen.
    const announce = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(window.innerWidth * dpr));
      const h = Math.max(1, Math.round(window.innerHeight * dpr));
      if (w !== lastW || h !== lastH) {
        canvas.width = w; canvas.height = h;
        lastW = w; lastH = h;
        bc?.postMessage({ type: 'stage', width: w, height: h } satisfies CastMessage);
      }
    };
    announce();
    window.addEventListener('resize', announce);
    document.addEventListener('fullscreenchange', announce);
    let anim = 0;
    const draw = () => {
      anim = requestAnimationFrame(draw);
      const opener = window.opener as Window | null;
      if (!opener || opener.closed) { setGone(true); return; }
      const sw = source.width, sh = source.height;
      if (sw === 0 || sh === 0) return;
      // Letterbox in case the show window has not caught up with our size yet.
      const s = Math.min(lastW / sw, lastH / sh);
      const dw = Math.round(sw * s), dh = Math.round(sh * s);
      const dx = (lastW - dw) >> 1, dy = (lastH - dh) >> 1;
      if (dw !== lastW || dh !== lastH) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, lastW, lastH); }
      ctx.drawImage(source, 0, 0, sw, sh, dx, dy, dw, dh);
    };
    draw();
    return () => {
      cancelAnimationFrame(anim);
      window.removeEventListener('resize', announce);
      document.removeEventListener('fullscreenchange', announce);
      bc?.close();
    };
  }, [source]);

  useEffect(() => {
    let timer = setTimeout(() => setShowCursor(false), 2500);
    const move = () => { setShowCursor(true); clearTimeout(timer); timer = setTimeout(() => setShowCursor(false), 2500); };
    window.addEventListener('mousemove', move);
    return () => { window.removeEventListener('mousemove', move); clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('debug')) {
      (window as unknown as { chromaglassCast?: unknown }).chromaglassCast = () => ({ mode: 'mirror', linked: !gone, stage: { width: canvasRef.current?.width, height: canvasRef.current?.height }, source: { width: source.width, height: source.height } });
    }
  }, [gone, source]);

  return (
    <div
      className="w-full h-screen bg-black overflow-hidden"
      style={{ cursor: showCursor ? 'default' : 'none' }}
      onClick={() => document.documentElement.requestFullscreen?.().catch(() => { /* not allowed here */ })}
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
      <CastHint />
    </div>
  );
}

/** A receiver with no show window to mirror: runs the show itself, fed by messages. */
function CastReceiver() {
  const visualizerRef = useRef<LiquidVisualizerHandle>(null);
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
      cleanups.push(() => bc.close());
    }

    // If the sender goes quiet the plate keeps running on its last settings;
    // say so rather than pretending the link is live.
    const timer = setInterval(() => setStale(linkedRef.current && performance.now() - lastMessageAt.current > 4000), 1000);
    cleanups.push(() => clearInterval(timer));
    return () => cleanups.forEach((c) => c());
  }, [handle]);
  const linkedRef = useRef(false);
  linkedRef.current = linked;

  const handleFullscreen = useCallback(() => {
    document.documentElement.requestFullscreen?.().catch(() => { /* not allowed here */ });
  }, []);

  // Hide the cursor after a few seconds still.
  const [showCursor, setShowCursor] = useState(true);
  const cursorTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    const handleMove = () => {
      setShowCursor(true);
      if (cursorTimer.current) clearTimeout(cursorTimer.current);
      cursorTimer.current = setTimeout(() => setShowCursor(false), 3000);
    };
    window.addEventListener('mousemove', handleMove);
    cursorTimer.current = setTimeout(() => setShowCursor(false), 3000);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      if (cursorTimer.current) clearTimeout(cursorTimer.current);
    };
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('debug')) {
      (window as unknown as { chromaglassCast?: unknown }).chromaglassCast = () => ({ linked, stale, state, audio });
    }
  }, [linked, stale, state, audio]);

  const settings = state?.settings ?? DEFAULT_SETTINGS;

  return (
    <div
      className="relative w-full h-screen bg-black overflow-hidden text-white overlays-hidden"
      style={{ cursor: showCursor ? 'default' : 'none' }}
      onClick={handleFullscreen}
      data-testid="cast-display"
    >
      <LiquidVisualizer
        ref={visualizerRef}
        audioData={audio}
        settings={settings}
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
            <p className="text-white/80 text-sm font-medium">ChromaGlass Cast Display</p>
            <p className="text-white/40 text-xs mt-1">{linked ? 'The show window has gone quiet' : 'Waiting for the show…'}</p>
          </div>
        </div>
      )}

      <CastHint />
    </div>
  );
}

const EMPTY = new Uint8Array(0);

function CastHint() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div className="fixed bottom-6 inset-x-0 flex justify-center z-50 pointer-events-none" style={{ transition: 'opacity 1s' }}>
      <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-full px-4 py-2">
        <p className="text-white/50 text-xs">Click anywhere for fullscreen</p>
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
