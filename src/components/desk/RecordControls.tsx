import { SlidersHorizontal } from 'lucide-react';
import { Button } from '../ui';
import { makesText, runningText } from '../../lib/recordChoice';

/**
 * The desk header's one Record button, and the options that go with it.
 *
 * Reported: "all the various recording options are also confusing and
 * overlapping." There used to be a Video button (R) and a Record performance
 * button (T) side by side, each with its own clock and its own dot. Now there
 * is one. What it makes (the Plate video, a Take, or both) is chosen in the
 * Record panel behind the sliders button and shown in the tooltip and, on a
 * wide desk, after the word; while anything runs the same button stops all
 * of it and shows one clock. T still starts and stops a Take by itself.
 */
export function RecordControls({
  videoRecording,
  videoSeconds,
  choice,
  onToggleRecord,
  performance,
  onOptions,
}: {
  videoRecording: boolean;
  videoSeconds: number;
  choice: { video: boolean; take: boolean };
  onToggleRecord: () => void;
  performance: { clock: string; title?: string } | null;
  onOptions: () => void;
}) {
  const running = videoRecording || !!performance;
  const videoClock = `${Math.floor(videoSeconds / 60)}:${String(videoSeconds % 60).padStart(2, '0')}`;
  const clock = videoRecording ? videoClock : performance?.clock ?? '0:00';
  const what = running ? runningText({ videoOn: videoRecording, takeOn: !!performance }) : makesText(choice);

  return (
    <div className="flex shrink-0 items-center gap-1 xl:gap-1.5" data-testid="record-controls-cluster">
      <Button
        height={32}
        variant={running ? 'danger' : 'secondary'}
        kbd="R"
        onClick={onToggleRecord}
        midiKey="action:record-toggle"
        testId="record-button"
        title={running
          ? `Stop recording (${what}, ${clock}) and keep it`
          : `Record: ${what} (R). Change what it makes with the sliders button.`}
      >
        <span className="whitespace-nowrap">
          {running ? (
            <>■ Stop · {clock}<span className="hidden 2xl:inline"> · {what}</span></>
          ) : (
            <>● Record<span className="hidden 2xl:inline"> · {what}</span></>
          )}
        </span>
      </Button>

      <button
        type="button"
        onClick={onOptions}
        data-testid="record-options-button"
        title="What Record makes: Plate video (sound, quality, format), Take, and Song film"
        aria-label="Record options"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-strong text-muted hover:bg-hover hover:text-text transition-colors"
      >
        <SlidersHorizontal size={14} />
      </button>
    </div>
  );
}
