/**
 * Window and camera capture helpers for the Film input (moved out of
 * LiquidVisualizer.tsx, PLAN 49a): opens a display tab or camera device,
 * wires track `ended` callbacks cleanly, and warns when a window capture
 * delivers only black overlay pixels.
 */
import { openCamera } from './cameras';

export interface FilmTargetHost {
  film: { video: HTMLVideoElement | null; kind: 'none' | 'file' | 'camera' | 'window'; stream: MediaStream | null; url: string | null };
  video: () => HTMLVideoElement;
  stop: () => void;
  setEnded: (cb: (() => void) | null) => void;
  getEnded: () => (() => void) | null;
}

export async function captureFilmWindow(
  host: FilmTargetHost,
  onEnded?: () => void,
  onBlank?: () => void,
): Promise<void> {
  const media = navigator.mediaDevices as MediaDevices & {
    getDisplayMedia?: (c: DisplayMediaStreamOptions) => Promise<MediaStream>;
  };
  if (!media?.getDisplayMedia) throw new Error('This browser cannot capture a window.');
  const stream = await media.getDisplayMedia({
    video: { frameRate: { ideal: 30 }, displaySurface: 'browser' },
    audio: false,
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'exclude',
  } as DisplayMediaStreamOptions);
  host.stop();
  const f = host.film;
  const v = host.video();
  f.stream = stream;
  v.srcObject = stream;
  f.kind = 'window';
  host.setEnded(onEnded ?? null);
  for (const t of stream.getVideoTracks()) {
    t.addEventListener('ended', () => {
      const cb = host.getEnded();
      host.stop();
      cb?.();
    });
  }
  try { await v.play(); } catch { /* autoplay policy: plays on next gesture */ }

  if (onBlank) {
    const probe = document.createElement('canvas');
    probe.width = 32; probe.height = 32;
    const pctx = probe.getContext('2d', { willReadFrequently: true });
    let looks = 0;
    const timer = setInterval(() => {
      looks++;
      if (!pctx || host.film.kind !== 'window' || v.readyState < 2) {
        if (looks >= 5) clearInterval(timer);
        return;
      }
      try {
        pctx.drawImage(v, 0, 0, probe.width, probe.height);
        const { data } = pctx.getImageData(0, 0, probe.width, probe.height);
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] > 8 || data[i + 1] > 8 || data[i + 2] > 8) { clearInterval(timer); return; }
        }
      } catch { clearInterval(timer); return; }
      if (looks >= 5) { clearInterval(timer); onBlank(); }
    }, 300);
  }
}

export async function captureFilmCamera(
  host: FilmTargetHost,
  deviceId = '',
  onEnded?: () => void,
): Promise<{ label: string | null; fellBack: boolean }> {
  host.stop();
  const f = host.film;
  const v = host.video();
  const opened = await openCamera(deviceId, 'environment', { width: 1280 });
  const stream = opened.stream;
  f.stream = stream;
  v.srcObject = stream;
  f.kind = 'camera';
  host.setEnded(onEnded ?? null);
  for (const t of stream.getVideoTracks()) {
    t.addEventListener('ended', () => {
      const cb = host.getEnded();
      host.stop();
      cb?.();
    });
  }
  try { await v.play(); } catch { /* autoplay policy: plays on next gesture */ }
  return { label: opened.label, fellBack: opened.fellBack };
}
