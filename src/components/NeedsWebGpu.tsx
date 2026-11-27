import { useState } from 'react';
import type { GpuFailure } from '../gpu/device';
import { goRemote, isAndroidApp, openInChrome } from '../lib/appLink';

/**
 * The screen a machine that cannot draw the plate gets, in place of the plate.
 *
 * A browser without WebGPU gets a clear screen rather than a degraded show
 * (docs/webgpu-plan.md): what is missing, where it works, how to turn WebGPU
 * on, and how to use this device as a remote for a laptop running the show
 * instead (PLAN 49j / H9-01). There is no second renderer to fall back to any
 * more, so every dead end leads somewhere useful.
 *
 * Inside the Android app, Android's WebView has WebGPU on fewer phones than
 * Chrome does, so it keeps the direct Chrome / Laptop remote split (PLAN 12-ctl-3).
 *
 * `onRetry` is the visualizer's own: it resets the recovery counters it owns.
 */
export function NeedsWebGpu({ failure, onRetry }: { failure: GpuFailure['failure']; onRetry: () => void }) {
  const [helpOpen, setHelpOpen] = useState(false);
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
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center overflow-y-auto p-5" data-testid="needs-webgpu">
      <div className="max-w-md text-center font-mono text-[12px] leading-relaxed text-white/75">
        <div className="mb-2 text-[15px] tracking-wide text-white">ChromaGlass needs WebGPU</div>
        <div className="mb-3 text-white/60">
          {failure === 'no-webgpu' ? 'This browser has no WebGPU.'
            : failure === 'no-adapter' ? 'This browser has WebGPU but no GPU to give it.'
            : 'The GPU would not start.'}
        </div>
        <p>It runs in Chrome or Edge on a desktop, Chrome on a recent Android phone, Safari 26 on macOS and iOS, and Firefox on Windows.</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {failure !== 'no-webgpu' && (
            /* A GPU that would not start a minute ago may start now — the
               driver finished resetting, the other tab closed — and asking
               again costs nothing next to a reload that loses the set. */
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-8 pointer-coarse:min-h-11 items-center rounded-full bg-white px-4 text-[12px] font-semibold text-black transition-opacity hover:opacity-90"
              data-testid="gpu-retry"
            >
              Try again
            </button>
          )}
          <button
            type="button"
            onClick={goRemote}
            className="inline-flex min-h-8 pointer-coarse:min-h-11 items-center rounded-full border border-white/25 px-3.5 text-[12px] font-medium text-white/90 transition-colors hover:bg-white/10"
            data-testid="needs-webgpu-remote"
          >
            Be the laptop's remote
          </button>
          <button
            type="button"
            onClick={() => setHelpOpen((v) => !v)}
            aria-expanded={helpOpen}
            className="inline-flex min-h-8 pointer-coarse:min-h-11 items-center rounded-full border border-white/20 px-3.5 text-[12px] font-medium text-white/85 transition-colors hover:bg-white/10"
            data-testid="webgpu-help-toggle"
          >
            How to turn it on
          </button>
          <a
            href="https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API#browser_compatibility"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-8 pointer-coarse:min-h-11 items-center rounded-full border border-white/15 px-3.5 text-[12px] font-medium text-white/85 underline underline-offset-2 transition-colors hover:bg-white/10"
            data-testid="webgpu-help-link"
          >
            Browser guide ↗
          </a>
        </div>
        {helpOpen && (
          <div className="mt-3 rounded-lg border border-white/15 bg-black/50 p-3 text-left text-[12px] leading-relaxed text-white/80" data-testid="webgpu-help">
            <p><strong className="text-white">Chrome / Edge:</strong> Open Settings → System and turn on <em>Use graphics acceleration when available</em>, then relaunch.</p>
            <p className="mt-1"><strong className="text-white">Safari:</strong> Update to macOS / iOS 26+, or turn on WebGPU under Develop → Feature Flags.</p>
            <p className="mt-1"><strong className="text-white">Firefox:</strong> Update to the current Windows release with hardware acceleration enabled.</p>
          </div>
        )}
      </div>
    </div>
  );
}
