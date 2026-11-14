import type { GpuFailure } from '../gpu/device';
import { goRemote, isAndroidApp, openInChrome } from '../lib/appLink';

/**
 * The screen a machine that cannot draw the plate gets, in place of the plate.
 *
 * A browser without WebGPU gets a clear screen rather than a degraded show
 * (docs/webgpu-plan.md): what is missing, and where it works. There is no
 * second renderer to fall back to any more, so this is the whole answer for a
 * machine that cannot run it.
 *
 * Moved here from LiquidVisualizer.tsx, unchanged, when the Android app gave
 * it a second form (PLAN 12-ctl-3). Android's WebView has WebGPU on fewer
 * phones than Chrome does, so inside the Android app a phone without it is
 * told so in a sentence and offered the two things it can still do: play the
 * show in Chrome, where the same phone often can draw it, or be the remote for
 * a show running on a laptop, which needs no GPU at all. The list of browsers
 * the website gives would be no help there: the person is not in a browser,
 * and "Chrome on a recent Android phone" is a phone they are holding. The
 * iPhone app never gets this form, since its web view is Safari's engine and
 * has WebGPU wherever Safari does.
 *
 * `onRetry` is the visualizer's own: it resets the recovery counters it owns.
 */
export function NeedsWebGpu({ failure, onRetry }: { failure: GpuFailure['failure']; onRetry: () => void }) {
  if (failure === 'no-webgpu' && isAndroidApp()) {
    return (
      <div className="pointer-events-auto absolute inset-0 flex items-center justify-center p-6" data-testid="app-no-webgpu">
        <div className="max-w-sm text-center font-mono text-[12px] leading-relaxed text-white/70">
          <div className="mb-3 text-[15px] tracking-wide text-white">This phone can't draw the plate in the app</div>
          <div className="mb-6 text-white/50">Android's web view has no WebGPU on this phone. Chrome often does, and the app can still be the remote for a show on your laptop.</div>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => openInChrome()}
              className="min-h-12 rounded-full bg-white px-5 text-[13px] font-semibold text-black active:scale-[0.98]"
              data-testid="app-open-in-chrome"
            >
              Open the show in Chrome
            </button>
            <button
              onClick={goRemote}
              className="min-h-12 rounded-full border border-white/25 px-5 text-[13px] font-semibold text-white/90 active:scale-[0.98]"
              data-testid="app-no-webgpu-remote"
            >
              Be the laptop's remote
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6" data-testid="needs-webgpu">
      <div className="max-w-md text-center font-mono text-[12px] leading-relaxed text-white/70">
        <div className="mb-3 text-[15px] tracking-wide text-white">ChromaGlass needs WebGPU</div>
        <div className="mb-4 text-white/50">
          {failure === 'no-webgpu' ? 'This browser has no WebGPU.'
            : failure === 'no-adapter' ? 'This browser has WebGPU but no GPU to give it.'
            : 'The GPU would not start.'}
        </div>
        <div>It runs in Chrome or Edge on a desktop, Chrome on a recent Android phone, Safari 26 on macOS and iOS, and Firefox on Windows.</div>
        {failure !== 'no-webgpu' && (
          /* A GPU that would not start a minute ago may start now — the
             driver finished resetting, the other tab closed — and asking
             again costs nothing next to a reload that loses the set. */
          <button
            onClick={onRetry}
            className="pointer-events-auto mt-5 rounded-md border border-white/20 px-4 py-2 text-[12px] text-white/90 transition-colors hover:bg-white/10"
            data-testid="gpu-retry"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
