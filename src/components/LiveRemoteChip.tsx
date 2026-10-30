import { useEffect, useRef, useState } from 'react';
import type { RemoteAction, RemoteState } from '../lib/remoteProtocol';

/**
 * The live stream on the phone (PLAN 37x-4d): whether the Mac app is on air,
 * for how long and to where, and a Stop. The plan's phone version of the
 * Live Show panel, on both of the remote's screens (Draw and Controls), since
 * the one who must end a stream that has gone wrong may be holding either.
 *
 * Stop takes two taps: the first turns the chip into "Stop the stream?" for
 * four seconds. A phone is pressed by a pocket, a sleeve, a palm resting on a
 * drawing; ending a broadcast by accident is the one thing here a viewer
 * would see. Starting is not offered at all (remoteProtocol's `live-stop`).
 */
export function LiveRemoteChip({ live, action, className = '' }: {
  live: RemoteState['live'];
  action: (a: RemoteAction) => void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if (!live) setArmed(false); }, [live]);
  if (!live) return null;
  const clock = `${Math.floor(live.seconds / 60)}:${String(live.seconds % 60).padStart(2, '0')}`;
  const press = () => {
    if (timer.current) clearTimeout(timer.current);
    if (armed) { setArmed(false); action('live-stop'); return; }
    setArmed(true);
    timer.current = setTimeout(() => setArmed(false), 4000);
  };
  return (
    <button
      onClick={press}
      className={`flex min-h-12 items-center justify-center gap-2 rounded-full border px-4 text-[12px] font-bold uppercase tracking-widest active:scale-95 ${armed ? 'border-white bg-white text-black' : 'border-live bg-live text-bg'} ${className}`}
      data-testid="remote-live"
      data-armed={armed ? 'true' : 'false'}
      aria-label={armed ? 'Tap again to stop the stream' : `${live.test ? 'Testing' : 'Live'} for ${clock} to ${live.names.join(', ')}: tap to stop`}
    >
      {armed ? 'Stop the stream?' : (
        <>
          <span className="h-2 w-2 shrink-0 rounded-full bg-current" />
          {live.test ? 'Test' : 'Live'} <span className="font-mono">{clock}</span>
          {live.trouble && <span aria-hidden>!</span>}
        </>
      )}
    </button>
  );
}
