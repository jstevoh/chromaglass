import { useEffect, useRef, useState } from 'react';
import { subscribeTouch } from '../lib/midiTouch';

/**
 * True for a moment after the controller hit this thing.
 *
 * The flash is deliberately short and deliberately not a transition *out*. In
 * a dark room what you need is confirmation that the press landed, and a slow
 * fade reads as the app thinking about it. It comes on instantly and leaves
 * quietly.
 *
 * `null` for a key means "nothing to watch" — a row with no preset, a button
 * with no action — and costs no subscription at all.
 */
export function useMidiTouch(key: string | null, ms = 260): boolean {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!key) return;
    const off = subscribeTouch(key, () => {
      // Restarted rather than ignored: holding a pad down, or a fader still
      // moving, should keep the light on rather than blink at whatever rate
      // the hardware happens to repeat at.
      if (timer.current) clearTimeout(timer.current);
      setOn(true);
      timer.current = setTimeout(() => { timer.current = null; setOn(false); }, ms);
    });
    return () => {
      off();
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    };
  }, [key, ms]);

  return on;
}
