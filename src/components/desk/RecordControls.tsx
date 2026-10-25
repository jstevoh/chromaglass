import { SlidersHorizontal } from 'lucide-react';
import { Button } from '../ui';

/**
 * Unified recording controls for the desk header:
 * 1. Video Recording: captures raw projected canvas (only) to WebM/MP4, with optional audio.
 * 2. Performance Recording: captures keystrokes, paint strokes, and tool gestures into memory.
 * 3. Options Trigger: opens the dedicated Recording Studio panel.
 */
export function RecordControls({
  videoRecording,
  videoSeconds,
  onToggleVideo,
  performance,
  onTogglePerformance,
  onOptions,
}: {
  videoRecording: boolean;
  videoSeconds: number;
  onToggleVideo: () => void;
  performance: { clock: string; title?: string } | null;
  onTogglePerformance: () => void;
  onOptions: () => void;
}) {
  const title = performance?.title;
  const short = title && title.length > 20 ? `${title.slice(0, 19)}…` : title;
  const videoClock = `${Math.floor(videoSeconds / 60)}:${String(videoSeconds % 60).padStart(2, '0')}`;

  return (
    <div className="flex shrink-0 items-center gap-1 xl:gap-1.5" data-testid="record-controls-cluster">
      {/* ── Video Recording Button (Canvas Only) ─────────────── */}
      {/*
        The running timer takes no extra width (PLAN.md 19v-4, as Save's dot in
        19v-3): the idle label stays in flow to size the button, and the stop
        mark + clock sit over that same box while recording so starting a take
        at 1280 never widens the bar or drops the plate.
      */}
      <Button
        height={32}
        variant={videoRecording ? 'danger' : 'secondary'}
        onClick={onToggleVideo}
        testId="record-video-button"
        title={videoRecording
          ? `Stop canvas video recording (${videoClock}) and save video file`
          : 'Record canvas directly to a video file (R) — click sliders for quality and audio options'}
      >
        <span className="relative inline-flex items-center justify-center whitespace-nowrap">
          <span aria-hidden={videoRecording || undefined} className={videoRecording ? 'invisible' : undefined}>
            ● <span className="hidden 2xl:inline">Record </span>Video
          </span>
          {videoRecording && (
            <span
              data-testid="record-video-timer"
              className="absolute inset-0 flex items-center justify-center tabular-nums"
            >
              ■ <span className="hidden 2xl:inline">Stop · </span>{videoClock}
            </span>
          )}
        </span>
      </Button>

      {/* ── Performance Recording Button (Keystrokes / Gestures) ─ */}
      {/* Kept with data-testid="performance-button" for scripts/take.mjs & layout.mjs */}
      <Button
        height={32}
        variant={performance ? 'danger' : 'secondary'}
        kbd="T"
        onClick={onTogglePerformance}
        midiKey="action:performance-toggle"
        testId="performance-button"
        title={performance
          ? `Stop${short ? ` (${short})` : ''}, and keep what was painted with the song that was playing`
          : 'Record what you paint from now until you stop, with the song that is playing (T)'}
      >
        <span className="relative inline-flex items-center justify-center whitespace-nowrap">
          <span aria-hidden={!!performance || undefined} className={performance ? 'invisible' : undefined}>
            ● Record<span className="hidden 2xl:inline"> performance</span>
          </span>
          {performance && (
            <span
              data-testid="performance-timer"
              className="absolute inset-0 flex items-center justify-center tabular-nums"
            >
              ■ <span className="hidden 2xl:inline">Stop · </span>{performance.clock}
            </span>
          )}
        </span>
      </Button>

      {/* ── Recording Options Trigger ────────────────────────── */}
      <button
        type="button"
        onClick={onOptions}
        data-testid="record-options-button"
        title="Recording options (canvas video settings, audio toggle, performance takes)"
        aria-label="Recording options"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-strong text-muted hover:bg-hover hover:text-text transition-colors"
      >
        <SlidersHorizontal size={14} />
      </button>
    </div>
  );
}
