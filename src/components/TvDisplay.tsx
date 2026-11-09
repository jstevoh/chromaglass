import { useCallback, useEffect, useRef, useState } from 'react';
import { useRemoteLink } from '../hooks/useRemoteLink';
import { useWakeLock } from '../hooks/useWakeLock';
import type { RemoteMessage, TvSignal } from '../lib/remoteProtocol';

/**
 * A TV at home (PLAN 12-tv, route 2): the laptop's plate, played as video.
 *
 * Opened at `/tv?key=…` on the laptop's show server, from a TV's browser or
 * the TV app's WebView (the Android TV shell, 12-tv's second PR), or a phone
 * or tablet propped up as a second screen, which is this page's phone
 * version: the same page, the picture fitted to whichever way the screen is
 * held. It runs no visualizer and asks for no GPU: the laptop sends what it
 * drew (lib/tvFeed.ts says why), and this page answers the offer, shows the
 * track and nothing else. So it works on a box whose GPU could never run the
 * solver, and on a plain http address, where WebGPU would not start but a
 * peer connection does.
 *
 * When there is no show (the laptop's page is closed, or reloading), the TV
 * is never a blank screen: it plays the films the site ships of the plate,
 * one after another, and goes live by itself when the show comes back (the
 * relay says `tv-show`). The films are the press clips today; the long
 * rendered films, and playing them with the laptop switched off altogether,
 * are 12-tv's sign-in item (the TV then talks to the site, not the laptop).
 *
 * What it says, in a line at the bottom that fades after a few seconds: that
 * it is live, that the show is off, or why it was turned away (a wrong key,
 * three TVs already, or a copy without Home or Pro). No pointer and no
 * controls: a TV is driven by a remote with no cursor, and the phone remote
 * already drives the show it shows. Enter, Space, F or a tap asks for full
 * screen.
 */

/** The films played while there is no show: the plate's own, shipped with the site. */
export const TV_FILMS = ['/press/clips/neon-coral-reef.mp4', '/press/clips/ferro-paint.mp4'];
/**
 * How long the TV waits for a connection once the show says it is here, before
 * it starts over: an offer lost, or ICE that found no road. Ten seconds is
 * many times a home network's handshake (about 100 ms on the check's loopback).
 * Once connected it waits for the first frame as long as that takes.
 */
export const TV_CONNECT_MS = 10_000;
/** The jitter buffer the TV asks for, in ms: a frame or so of slack on Wi-Fi, without the half second a default player holds. */
export const TV_JITTER_MS = 50;

type TvState = 'looking' | 'live' | 'films' | 'tier' | 'full' | 'denied' | 'locked' | 'lost';

const SAYS: Record<TvState, string> = {
  looking: 'Looking for the show…',
  live: 'Live from the show',
  films: 'The show is off: playing films until it starts',
  tier: 'Playing on a TV needs ChromaGlass Home or Pro on the computer running the show',
  full: 'Three TVs are already showing this show',
  denied: 'This address has the wrong show key: copy the TV address again from the computer running the show',
  locked: 'Too many wrong keys from this network: trying again in a few minutes',
  lost: 'The picture did not arrive: starting over',
};

export default function TvDisplay() {
  const [state, setState] = useState<TvState>('looking');
  const [says, setSays] = useState(true);
  const [film, setFilm] = useState(0);
  const liveRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sendRef = useRef<(m: RemoteMessage) => void>(() => {});
  const stuckRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useWakeLock(true);

  const hangUp = useCallback(() => {
    if (stuckRef.current) { clearTimeout(stuckRef.current); stuckRef.current = null; }
    const pc = pcRef.current;
    pcRef.current = null;
    if (pc) { pc.ontrack = null; pc.onicecandidate = null; pc.onconnectionstatechange = null; try { pc.close(); } catch { /* closed */ } }
    if (liveRef.current) liveRef.current.srcObject = null;
  }, []);

  /*
    The picture did not come: a TV left waiting forever on a black screen
    would be the worst thing it could do. Starting over is a reload: a fresh
    hello is what makes the relay hand the display a new join, and a TV page
    holds nothing a reload would lose.
  */
  const armStuck = useCallback(() => {
    if (stuckRef.current) clearTimeout(stuckRef.current);
    stuckRef.current = setTimeout(() => {
      setState('lost');
      setTimeout(() => window.location.reload(), 2000);
    }, TV_CONNECT_MS);
  }, []);

  const onOffer = useCallback(async (sdp: string) => {
    hangUp();
    const pc = new RTCPeerConnection({ iceServers: [] });
    pcRef.current = pc;
    armStuck();
    pc.onicecandidate = (e) => sendRef.current({ type: 'tv-signal', signal: { kind: 'ice', candidate: e.candidate ? e.candidate.toJSON() : null } });
    pc.ontrack = (e) => {
      // Ask for a short jitter buffer: Chrome's own holds more than a sofa needs.
      try { (e.receiver as RTCRtpReceiver & { jitterBufferTarget?: number }).jitterBufferTarget = TV_JITTER_MS; } catch { /* the browser's own */ }
      const v = liveRef.current;
      if (!v) return;
      v.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      void v.play().catch(() => { /* muted autoplay is allowed; a refusal waits for a press */ });
    };
    pc.onconnectionstatechange = () => {
      if (pcRef.current !== pc) return;
      // Connected is not stuck: a plate drawing slowly sends its first frame
      // late, and the films stay up until it comes (measured: the real app on
      // a software GPU, a frame every few seconds, restarted this page every
      // ten seconds while it timed only the frame).
      if (pc.connectionState === 'connected' && stuckRef.current) { clearTimeout(stuckRef.current); stuckRef.current = null; }
      if (pc.connectionState === 'failed') { hangUp(); setState('lost'); setTimeout(() => window.location.reload(), 2000); }
    };
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (pcRef.current !== pc) return;
      sendRef.current({ type: 'tv-signal', signal: { kind: 'answer', sdp: pc.localDescription?.sdp ?? answer.sdp ?? '' } });
    } catch {
      hangUp();
      setState('lost');
    }
  }, [hangUp, armStuck]);

  const onSignal = useCallback((s: TvSignal) => {
    if (s.kind === 'offer') void onOffer(s.sdp);
    else if (s.kind === 'ice') void pcRef.current?.addIceCandidate(s.candidate ?? undefined).catch(() => { /* stale */ });
    else if (s.kind === 'refused') { hangUp(); setState(s.reason); }
  }, [onOffer, hangUp]);

  const link = useRemoteLink({
    role: 'tv',
    onMessage: (m) => {
      if (m.type === 'tv-show') {
        if (m.here) { setState((s) => (s === 'live' ? s : 'looking')); armStuck(); }
        else { hangUp(); setState('films'); }
      } else if (m.type === 'tv-signal') {
        onSignal(m.signal);
      }
    },
  });
  sendRef.current = link.send;
  useEffect(() => {
    if (link.status === 'denied') { hangUp(); setState('denied'); }
    else if (link.status === 'locked') { hangUp(); setState('locked'); }
    // No relay here at all (the site itself, or the laptop gone): films.
    else if (link.status === 'offline' || link.status === 'connecting') { hangUp(); setState((s) => (s === 'looking' || s === 'live' ? 'films' : s)); }
  }, [link.status, hangUp]);
  useEffect(() => hangUp, [hangUp]);

  // Live once a frame has been drawn, not when the track arrived: the films
  // stay up until there is a picture to cut to.
  useEffect(() => {
    const v = liveRef.current;
    if (!v) return;
    const onFrame = () => {
      if (!pcRef.current || !v.videoWidth) return;
      if (stuckRef.current) { clearTimeout(stuckRef.current); stuckRef.current = null; }
      setState('live');
    };
    v.addEventListener('playing', onFrame);
    v.addEventListener('resize', onFrame);
    return () => { v.removeEventListener('playing', onFrame); v.removeEventListener('resize', onFrame); };
  }, []);

  // The line at the bottom: up for six seconds after each change, then gone.
  // A refusal stays, since it is the only thing on the screen worth reading.
  useEffect(() => {
    setSays(true);
    if (state !== 'live' && state !== 'films') return;
    const t = setTimeout(() => setSays(false), 6000);
    return () => clearTimeout(t);
  }, [state]);

  const fullScreen = useCallback(() => {
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => { /* the TV app is full screen already */ });
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'f' || e.key === 'F') fullScreen(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [fullScreen]);

  const live = state === 'live';
  const films = !live;
  return (
    <div
      className="fixed inset-0 bg-black select-none overflow-hidden"
      data-testid="tv-page"
      data-state={state}
      onClick={fullScreen}
    >
      <video
        ref={liveRef}
        data-testid="tv-live"
        className="absolute inset-0 h-full w-full object-contain"
        style={{ opacity: live ? 1 : 0 }}
        muted
        autoPlay
        playsInline
      />
      {films && (
        <video
          key={film}
          data-testid="tv-film"
          className="absolute inset-0 h-full w-full object-contain"
          src={TV_FILMS[film % TV_FILMS.length]}
          muted
          autoPlay
          playsInline
          onEnded={() => setFilm((f) => f + 1)}
          onError={() => setFilm((f) => f + 1)}
        />
      )}
      <div
        data-testid="tv-says"
        className="absolute left-0 right-0 bottom-0 px-[4vw] pb-[4vh] pt-[8vh] text-white/85 transition-opacity duration-1000"
        style={{
          opacity: says ? 1 : 0,
          fontSize: 'clamp(14px, 1.8vw, 28px)',
          background: 'linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0))',
        }}
      >
        <span className="font-semibold tracking-wide">ChromaGlass</span>
        <span className="opacity-70"> · {SAYS[state]}</span>
      </div>
    </div>
  );
}
