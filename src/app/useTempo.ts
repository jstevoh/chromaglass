import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { TempoSource, type TempoLabel } from '../lib/tempo';

/**
 * Where the beat clock's tempo comes from: Ableton Link, a MIDI clock, taps, a
 * number off the set list, else the microphone (`lib/tempo.ts`).
 *
 * The source is a ref the render loop reads once a frame; the label the desk
 * shows is sampled from it four times a second rather than watched, so a tempo
 * that wobbles in its last decimal does not re-render the app. `npm run squeeze`
 * reads the source's own period through `chromaglassTempo`, set here.
 */
export function useTempo() {
  // ── Where the tempo comes from ──────────────────────────────────
  // The microphone, unless something better is offering: a MIDI clock from
  // the desk, four taps, or a number off the setlist. A ref because the
  // render loop reads it once a frame and nothing else does; `tempoLabel`
  // is the only part the UI needs, sampled rather than watched.
  const tempoRef = useRef<TempoSource | null>(null);
  if (!tempoRef.current) {
    tempoRef.current = new TempoSource();
    // Link on is remembered on this machine: a show is set up once, and the
    // show server, relaunched with the app, is asked again on every connect.
    try { tempoRef.current.linkWanted = localStorage.getItem(LINK_KEY) === '1'; } catch { /* private window: off */ }
  }
  const [tempoLabel, setTempoLabel] = useState<TempoLabel>({ source: null, bpm: 0, taps: 0 });
  const tempoLabelRef = useRef(tempoLabel);
  useEffect(() => {
    const timer = setInterval(() => {
      const t = tempoRef.current;
      if (!t) return;
      t.read(performance.now());        // lets a stopped MIDI clock lapse
      const next = { source: t.active, bpm: Math.round(t.bpm), taps: t.tapCount, link: t.linkStatus };
      // Compared here, not in an updater that hands back the old value: React
      // still renders the App to find that out whenever anything else is
      // pending, which with the ear running is always (PLAN.md §14f).
      const prev = tempoLabelRef.current;
      if (prev.source === next.source && prev.bpm === next.bpm && prev.taps === next.taps
        && prev.link?.available === next.link.available && prev.link?.on === next.link.on && prev.link?.peers === next.link.peers) return;
      tempoLabelRef.current = next;
      setTempoLabel(next);
    }, 250);
    return () => clearInterval(timer);
  }, []);
  const tapTempo = useCallback(() => tempoRef.current?.tap(performance.now()), []);
  /** The source's reading, for the tap pad's beat light, which polls it itself so the App never re-renders for a beat (PLAN 35f). */
  const readTempo = useCallback(() => tempoRef.current?.read(performance.now()) ?? null, []);
  const setLinkOn = useCallback((on: boolean) => {
    tempoRef.current?.switchLink(on);
    try { localStorage.setItem(LINK_KEY, on ? '1' : '0'); } catch { /* not remembered */ }
  }, []);
  // "Listen" means the ear again, so it switches Link off too: otherwise the
  // session would take the tempo straight back a twentieth of a second later.
  const clearTempo = useCallback(() => {
    const t = tempoRef.current;
    if (t?.linkWanted) setLinkOn(false);
    t?.clear();
  }, [setLinkOn]);
  const setTempoBpm = useCallback((bpm: number) => tempoRef.current?.setBpm(bpm), []);
  /*
    The tempo source's own reading, for `npm run squeeze` (PLAN 0-tap). That
    check asked whether the beat clock ran at the tapped period by comparing
    it with the harness's own stamps of its taps, and the harness stamps a
    tap a moment before the app does, so a pause between the two went red
    on a clock that was right. With the source's period to hand, the clock
    is judged against what it was actually given. Here rather than on
    `chromaglassDebug()` because the source lives here, and so a check of
    the tempo does not have to edit the plate.
  */
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('debug')) return;
    window.chromaglassTempo =
      () => tempoRef.current?.read(performance.now()) ?? null;
  }, []);

  /**
    The Settings panel's Tempo block, its readout and the ways to set one,
    handed over as one. Not `readTempo`, which App passes by name to the panel
    and the phone alike (`npm run panel` finds the tap pad polled that way).
  */
  const tempoPanel = useMemo(() => ({
    tempo: tempoLabel, onTap: tapTempo, onTempoClear: clearTempo, onTempoBpm: setTempoBpm, onLink: setLinkOn,
  }), [tempoLabel, tapTempo, clearTempo, setTempoBpm, setLinkOn]);

  return {
    tempoRef, tempoLabel, tapTempo, readTempo, clearTempo, setTempoBpm, setLinkOn, tempoPanel,
  };
}

const LINK_KEY = 'chromaglass.link';
