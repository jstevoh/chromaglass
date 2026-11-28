import type { AudioData } from '../hooks/useAudioAnalyzer';
import { useEarView, type EarView } from '../hooks/useEarView';

/*
  The readouts of the ear that sit in the shell, each its own component so a
  reading renders it and nothing above it (hooks/useEarView.ts, PLAN.md 46f).

  They were written inline in App(): a percentage inside the desk's status
  line and three bars over the plate, both reading `audioData`, the ear's
  ten-a-second state on the App. So the App rendered ten times a second for
  them, with every desk panel under it, 14.3 ms a time on the owner's Mac.
  Each selects only what it prints: the percentage a whole number, so a room
  that holds steady renders nothing. The bars (`EarMeters`) were drawn only by
  the old floating overlay and went with it (49c-2).
*/

const percentOf = (a: AudioData | null) => (a ? Math.round(Math.min(100, a.volume)) : null);

/** " 43%" after the source's name in the desk's status line, or nothing while the ear is off. */
export function EarPercent({ view }: { view: EarView }) {
  const percent = useEarView(view, percentOf);
  return percent === null ? null : <>{` ${percent}%`}</>;
}
