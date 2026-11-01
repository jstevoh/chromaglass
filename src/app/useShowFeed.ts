/*
  The show's feed out to the show server: the plate's colour for the lighting
  rig (Art-Net), and the colour, the sound and the beat for a VJ app (OSC out,
  PLAN.md 13.5-osc). The colour's half moved here whole from `App()` when OSC
  out arrived, and the rest stands beside it, so the one report the server
  turns into both stays one.
*/
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { RemoteMessage } from '../lib/remoteProtocol';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';
import type { AudioData } from '../hooks/useAudioAnalyzer';
import type { TempoSource } from '../lib/tempo';
import { SOUND_OUT, loadOscOut, oscOutTarget, saveOscOut, type OscOutLabel } from '../lib/oscOut';

type OscOutState = Extract<RemoteMessage, { type: 'osc-out' }>;

export interface ShowFeedDeps {
  connected: boolean;
  relaySendRef: RefObject<((m: RemoteMessage) => void) | null>;
  wallRef: RefObject<LiquidVisualizerHandle | null>;
  blackoutRef: RefObject<boolean>;
  /** What the plate hears this frame (App's `hear`). */
  hear: () => AudioData | null;
  tempoRef: RefObject<TempoSource | null>;
  /** Where `useRemote` hands the server's `osc-out` state. */
  oscOutHearRef: { current: ((m: OscOutState) => void) | null };
}

export function useShowFeed({ connected, relaySendRef, wallRef, blackoutRef, hear, tempoRef, oscOutHearRef }: ShowFeedDeps) {
  /*
    The plate's colour, out to the lighting rig.

    The same `layerReport` the bench draws its tabs from, twenty times a second
    to the show server, which turns it into Art-Net (see `server/artnet.js`).
    The par cans wash the room in whatever the dye is doing instead of whatever
    was set before the doors opened.

    Faster than the bench's poll because a light that lags the screen by half a
    second reads as broken, and it costs nothing when nothing is listening: no
    relay, no socket, no send. It carries no React state, so the loop never
    causes a render.

    13.5-osc adds the ear's fast readings and its bands (the same 0..1 numbers
    the patch bay's sources read, not the smoothed bass/mid/treble, by the
    owner's rule that sound patches use fast readings only) and the beat
    clock's tempo. They ride the same report, a few dozen bytes, whether OSC
    out is on or not: the server drops them when it is off, and a second timer
    switched by the server's state would be one more thing to fall out of step.
  */
  const hearRef = useRef(hear);
  hearRef.current = hear;
  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => {
      const layers = wallRef.current?.layerReport?.();
      if (!layers?.length) return;
      // The plate's own brightness, so the room dims when the glass thins
      // rather than sitting at full on an empty plate. Blackout is black.
      const fill = layers.reduce((a, l) => a + l.fill, 0) / layers.length;
      const master = blackoutRef.current ? 0 : Math.min(1, fill * 1.6);
      const f = hearRef.current()?.features;
      const sound = f ? Object.fromEntries(SOUND_OUT.map(k => [k, f[k]])) : undefined;
      relaySendRef.current?.({
        type: 'lights', layers: layers.map(l => ({ colour: l.colour, fill: l.fill })), master,
        ...(f ? { sound, bands: f.bands.slice() } : {}),
        bpm: tempoRef.current?.bpm ?? 0,
      });
    }, 50);
    return () => clearInterval(id);
  }, [connected, wallRef, blackoutRef, relaySendRef, tempoRef]);

  // ── OSC out's switch ────────────────────────────────────────────────
  // Null until a show server says it is there: a page with no server behind
  // it (the website) never hears `osc-out`, so it never offers the switch.
  const [oscOut, setOscOutLabel] = useState<OscOutLabel | null>(null);
  const wantRef = useRef(loadOscOut());
  // -Infinity, not 0: performance.now() starts again at 0 on a reload, and a
  // page that joins inside two seconds would otherwise never ask (as Link's, useRemote).
  const askedRef = useRef(-Infinity);
  oscOutHearRef.current = (m) => {
    const want = wantRef.current;
    setOscOutLabel({ on: m.on, target: m.target ?? want.target, pro: m.pro, says: m.says });
    // The operator wanted it on and the server says it is off: a server just
    // started (the Mac app relaunches it) or this page just connected. Asked
    // at most every two seconds, as Link is (useRemote), so a server that
    // cannot open the socket is not asked on every answer.
    // Switched off on purpose elsewhere (the Mac app's menu, another page):
    // that is the operator's word, and it is remembered here too.
    if (want.on && !m.on && m.stopped) { wantRef.current = { ...want, on: false }; saveOscOut(wantRef.current); return; }
    const at = performance.now();
    if (want.on && !m.on && !m.says.startsWith('off (') && at - askedRef.current > 2000) {
      askedRef.current = at;
      relaySendRef.current?.({ type: 'osc-out-enable', on: true, target: want.target });
    }
  };
  useEffect(() => { if (!connected) setOscOutLabel(null); }, [connected]);
  /** Switch OSC out on or off; a target given moves it, refused unless it is "address:port". */
  const onOscOut = useCallback((on: boolean, target?: string): boolean => {
    const t = target === undefined ? wantRef.current.target : oscOutTarget(target);
    if (!t) return false;
    wantRef.current = { on, target: t };
    saveOscOut(wantRef.current);
    relaySendRef.current?.({ type: 'osc-out-enable', on, target: t });
    setOscOutLabel(o => (o ? { ...o, target: t } : o));
    return true;
  }, [relaySendRef]);

  /*
    The beat, out at once while OSC out is on: the frame the plate presses on
    its kick, not the next twentieth-of-a-second report, which would put a
    VJ app's strobe up to 50 ms behind the plate's own beat. One read of a
    counter a frame (`kicks`, the visualizer's own count), and nothing at all
    while OSC out is off.
  */
  const sending = connected && !!oscOut?.on && oscOut.pro;
  useEffect(() => {
    if (!sending) return;
    let last = wallRef.current?.kicks() ?? 0;
    let raf = 0;
    const tick = () => {
      const n = wallRef.current?.kicks() ?? last;
      // A plate restarted counts from zero again: take its count as the new start.
      if (n > last) relaySendRef.current?.({ type: 'beat' });
      last = n;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sending, wallRef, relaySendRef]);

  return { oscOut, onOscOut };
}
