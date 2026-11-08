/**
 * Syphon output (PLAN.md 13.2): the plate handed to the Mac app's offscreen
 * Syphon window on the GPU, with no CPU readback.
 *
 * The Show menu owns the "Syphon Out" checkbox (`desktop/main.js`, kept in
 * `show.json`) and asks the show page whether to serve (`onAsk`). The page
 * checks `canUseProFeature()` (`src/lib/tierGates.ts`; Pro only, never reading
 * the licence directly) and tells the main process whether Syphon may run.
 *
 * While serving, `tapSyphonFrame(canvas)` is called from `tapPadPicture` in the
 * frame task that just drew `#liquid-canvas`. It turns the canvas into a
 * GPU-backed `ImageBitmap` (`AcceleratedStaticBitmapImage`, a `gpu::SharedImage`
 * mailbox with zero CPU readback) and transfers it via `window.postMessage`
 * (preserving the transferable across `contextIsolation`) and a
 * `MessageChannelMain` port to the offscreen Syphon window (in the same
 * renderer process), whose compositor emits `paint` events carrying an
 * `IOSurface` texture handle to the `Syphon.framework` Metal server
 * (`desktop/native/syphon/`).
 *
 * When wall geometry (keystone / surfaces) is active, the pre-geometry scene
 * lives in an internal `GPUTexture` inside `src/gpu/output.ts` rather than on a
 * separate canvas; switching Syphon to tap that pre-geometry texture when wall
 * geometry is in use is tracked in PLAN 13.2-1.
 */
import { canUseProFeature } from './tierGates';

interface NativeSyphonBridge {
  set: (on: boolean) => void;
  onAsk: (fn: (wanted: boolean) => void) => () => void;
}

function getSyphonBridge(): NativeSyphonBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    __CHROMAGLASS_NATIVE__?: {
      shell?: string;
      syphon?: NativeSyphonBridge;
    };
  };
  const s = w.__CHROMAGLASS_NATIVE__?.shell === 'desktop' ? w.__CHROMAGLASS_NATIVE__.syphon : undefined;
  return s && typeof s.set === 'function' ? s : null;
}

let active = false;
let inFlight = 0;
let seq = 0;
let lastSentSeq = 0;
let wired = false;
let lastTapMs = 0;
let stageCanvas: HTMLCanvasElement | null = null;
let stageCtx: CanvasRenderingContext2D | null = null;

function ensureWired(): NativeSyphonBridge | null {
  const bridge = getSyphonBridge();
  if (!bridge) return null;
  if (!wired) {
    wired = true;
    bridge.onAsk((wanted: boolean) => {
      if (wanted && canUseProFeature()) {
        active = true;
        bridge.set(true);
      } else {
        active = false;
        bridge.set(false);
      }
    });
  }
  return bridge;
}

if (typeof window !== 'undefined') {
  ensureWired();
}

/**
 * Hand the frame task's canvas to the Mac app's Syphon server when Syphon Out
 * is active. Never throws into the frame task.
 */
export function tapSyphonFrame(canvas: HTMLCanvasElement): void {
  const bridge = ensureWired();
  if (!bridge || !active) return;
  if (!canUseProFeature()) {
    active = false;
    bridge.set(false);
    return;
  }
  if (inFlight >= 8 || canvas.width === 0 || canvas.height === 0) return;
  if (typeof createImageBitmap !== 'function') return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - lastTapMs < 14) return;
  lastTapMs = now;
  const scale = Math.min(1, 1280 / canvas.width, 720 / canvas.height);
  const w = Math.max(2, Math.round(canvas.width * scale));
  const h = Math.max(2, Math.round(canvas.height * scale));
  if (!stageCanvas && typeof document !== 'undefined') {
    stageCanvas = document.createElement('canvas');
    stageCtx = stageCanvas.getContext('2d', { alpha: false, willReadFrequently: false });
  }
  let source: CanvasImageSource = canvas;
  if (stageCanvas && stageCtx) {
    if (stageCanvas.width !== w || stageCanvas.height !== h) {
      stageCanvas.width = w;
      stageCanvas.height = h;
    }
    stageCtx.drawImage(canvas, 0, 0, w, h);
    source = stageCanvas;
  }
  const mySeq = ++seq;
  inFlight += 1;
  createImageBitmap(source).then(
    (bmp) => {
      inFlight -= 1;
      if (!active || mySeq < lastSentSeq) {
        bmp.close();
        return;
      }
      lastSentSeq = mySeq;
      try {
        window.postMessage({ __cgSyphonFrame: true, bmp }, '*', [bmp]);
      } catch {
        try { bmp.close(); } catch { /* ignore */ }
      }
    },
    () => {
      inFlight -= 1;
    },
  );
}
