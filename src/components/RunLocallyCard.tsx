import { useState } from 'react';
import { motion } from 'motion/react';
import { MonitorDown, X } from 'lucide-react';
import type { EngineStatus } from '../lib/platform';

const DISMISS_KEY = 'chromaglass-run-locally-dismissed';
const REPO = 'https://github.com/jstevoh/chromaglass';

const readDismissed = (): boolean => {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * Shown on the hosted build once the governor has had to step down, or the
 * GPU solver isn't available at all: the page is running below what the
 * machine in front of the viewer could do. Turns the hosted page into the way
 * in to the local one rather than a lesser copy of it.
 */
export function RunLocallyCard({ status }: { status: EngineStatus | null }) {
  const [dismissed, setDismissed] = useState(readDismissed);

  if (!status || dismissed) return null;
  if (status.tier !== 'hosted') return null;
  if (!status.steppedDown && !status.gpuUnavailable) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode */
    }
  };

  const reason = status.gpuUnavailable
    ? 'This browser can’t run the GPU solver, so the show is on the 192² CPU grid.'
    : `The show stepped down to ${status.label.replace(/ · [\d.]+x$/, '')} to hold the frame rate.`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      className="absolute bottom-20 left-1/2 z-20 w-[22rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl border border-white/10 bg-black/70 p-4 text-white shadow-2xl backdrop-blur-xl"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-white/60">
          <MonitorDown size={14} /> Run it locally
        </div>
        <button onClick={dismiss} className="text-white/40 hover:text-white/80" title="Dismiss">
          <X size={14} />
        </button>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-white/70">
        {reason} The same build on your own machine runs the full 768² grid at native resolution, and
        turns your phone into the remote.
      </p>
      <pre className="mb-3 overflow-x-auto rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-[10px] leading-relaxed text-white/80">
{`git clone ${REPO}
cd chromaglass && npm install
npm run build && npm run remote`}
      </pre>
      <div className="flex items-center justify-between">
        <a
          href={REPO}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] font-bold uppercase tracking-widest text-white/60 underline-offset-4 hover:text-white hover:underline"
        >
          Source on GitHub
        </a>
        <button
          onClick={dismiss}
          className="rounded-full border border-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white/60 hover:bg-white/10"
        >
          Not now
        </button>
      </div>
    </motion.div>
  );
}
