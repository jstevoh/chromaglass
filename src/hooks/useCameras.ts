import { useCallback, useEffect, useState } from 'react';

/**
 * The cameras plugged in, kept current.
 *
 * One list for the whole app, because both places that open a camera (the
 * motion camera and the film's Webcam, lib/cameras.ts) pick from the same
 * devices, and a camera plugged in or pulled out should change both pickers
 * at once. `devicechange` is what tells the page; the list is read again on
 * it, and once more after any camera opens, because that is the moment the
 * browser starts giving the cameras their names.
 */
export function useCameras(): { devices: MediaDeviceInfo[]; refresh: () => Promise<void> } {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const refresh = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter(d => d.kind === 'videoinput'));
    } catch { /* no media devices at all: the pickers say so */ }
  }, []);
  useEffect(() => {
    const md = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    if (!md?.enumerateDevices) return;
    void refresh();
    md.addEventListener?.('devicechange', refresh);
    return () => md.removeEventListener?.('devicechange', refresh);
  }, [refresh]);
  return { devices, refresh };
}
