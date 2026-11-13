import { motion } from 'motion/react';
import type { AudioData } from '../hooks/useAudioAnalyzer';
import { useEarView, type EarView } from '../hooks/useEarView';

/*
  The readouts of the ear that sit in the shell, each its own component so a
  reading renders it and nothing above it (hooks/useEarView.ts, PLAN.md 46f).

  They were written inline in App(): a percentage inside the desk's status
  line and three bars over the plate, both reading `audioData`, the ear's
  ten-a-second state on the App. So the App rendered ten times a second for
  them, with every desk panel under it, 14.3 ms a time on the owner's Mac.
  Each selects only what it prints: the percentage a whole number, the bars
  each its own level, so a room that holds steady renders nothing.
*/

const percentOf = (a: AudioData | null) => (a ? Math.round(Math.min(100, a.volume)) : null);

/** " 43%" after the source's name in the desk's status line, or nothing while the ear is off. */
export function EarPercent({ view }: { view: EarView }) {
  const percent = useEarView(view, percentOf);
  return percent === null ? null : <>{` ${percent}%`}</>;
}

const hearing = (a: AudioData | null) => a !== null;
// To a tenth of a percent of the bar's height: the bar is sixty-four pixels
// tall and sprung, so a finer step is not one anybody sees, and a selector
// that returned every float would render on every reading whatever the room did.
const level = (v: number) => Math.round(Math.min(100, v) * 10) / 10;
const bassOf = (a: AudioData | null) => level(a?.bass ?? 0);
const midOf = (a: AudioData | null) => level(a?.mid ?? 0);
const trebleOf = (a: AudioData | null) => level(a?.treble ?? 0);

function Meter({ view, label, of }: { view: EarView; label: string; of: (a: AudioData | null) => number }) {
  const value = useEarView(view, of);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-1.5 h-16 bg-white/10 rounded-full overflow-hidden relative">
        <motion.div
          className="absolute bottom-0 w-full bg-white/80 rounded-full"
          animate={{ height: `${value}%` }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
      </div>
      <span className="text-[7px] uppercase font-bold opacity-60">{label}</span>
    </div>
  );
}

/** The bass, mid and treble bars at the plate's bottom left, while the ear is hearing. */
export function EarMeters({ view }: { view: EarView }) {
  if (!useEarView(view, hearing)) return null;
  return (
    <div className="absolute bottom-16 left-6 z-10 flex items-end gap-1 opacity-30 pointer-events-none" data-testid="ear-meters">
      <Meter view={view} label="B" of={bassOf} />
      <Meter view={view} label="M" of={midOf} />
      <Meter view={view} label="T" of={trebleOf} />
    </div>
  );
}
