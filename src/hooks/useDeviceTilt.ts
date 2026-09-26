import { useCallback, useEffect, useRef, useState } from 'react';
import { tiltReading } from '../lib/phone';

/**
 * The phone's tilt, as the plate's Gravity and Tilt Direction (lib/phone.ts).
 *
 * `start` must be called from a tap: Safari on iOS gives no orientation events
 * until `DeviceOrientationEvent.requestPermission()` has been asked inside a
 * user gesture, and refuses silently if it is asked anywhere else. Android
 * Chrome needs no permission and has no such function.
 *
 * The reading goes out at most ten times a second and only when it has moved
 * (two hundredths of Gravity or three degrees): each one is a settings write,
 * and the orientation sensor fires at sixty.
 */
type Permissioned = { requestPermission?: () => Promise<'granted' | 'denied'> };

export function useDeviceTilt(onTilt: (t: { upright: number; direction: number }) => void) {
  const supported = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  const [on, setOn] = useState(false);
  const [refused, setRefused] = useState(false);
  const onTiltRef = useRef(onTilt);
  onTiltRef.current = onTilt;

  const start = useCallback(async () => {
    if (!supported) return false;
    const ask = (window.DeviceOrientationEvent as unknown as Permissioned).requestPermission;
    if (typeof ask === 'function') {
      try {
        if ((await ask()) !== 'granted') { setRefused(true); return false; }
      } catch { setRefused(true); return false; }
    }
    setRefused(false);
    setOn(true);
    return true;
  }, [supported]);
  const stop = useCallback(() => setOn(false), []);

  useEffect(() => {
    if (!on) return;
    let level: { beta: number; gamma: number } | null = null;
    let levelAngle: number | null = null;
    let sent = { upright: -1, direction: -1, at: 0 };
    const angleNow = () => (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0);
    const read = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      const angle = angleNow();
      const here = { beta: e.beta, gamma: e.gamma };
      // Level is where the hand is when Tilt comes on, and again whenever
      // the phone is turned between portrait and landscape: the screen's
      // axes have moved, so the old rest means nothing in the new ones.
      if (!level || levelAngle !== angle) { level = here; levelAngle = angle; }
      const t = tiltReading(here, level, angle);
      const now = performance.now();
      const turned = Math.abs((((t.direction - sent.direction) % 360) + 540) % 360 - 180);
      if (now - sent.at < 100) return;
      if (Math.abs(t.upright - sent.upright) < 0.02 && (t.upright === 0 || turned < 3)) return;
      sent = { ...t, at: now };
      onTiltRef.current(t);
    };
    window.addEventListener('deviceorientation', read);
    return () => window.removeEventListener('deviceorientation', read);
  }, [on]);

  return { supported, on, refused, start, stop };
}
