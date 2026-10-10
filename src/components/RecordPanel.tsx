import React, { useState } from 'react';
import {
  Video,
  Circle,
  Square,
  Volume2,
  VolumeX,
  Download,
  Play,
  Trash2,
  Sparkles,
  Check,
  RotateCcw,
  Sliders,
  History,
} from 'lucide-react';
import { Sheet, Button } from './ui';
import type { Recorder, VideoQuality, VideoFormat } from '../hooks/useRecorder';
import type { SavedPerformance } from '../lib/musicTypes';
import { clockText } from '../lib/performanceTake';

export interface RecordPanelProps {
  onClose: () => void;
  recorder: Recorder;
  onToggleVideo: () => void;
  performanceLive: { startedAtMs: number; title?: string } | null;
  perfClock: string | null;
  onTogglePerformance: () => void;
  savedPerformances: SavedPerformance[];
  replayingPerformanceId: string | null;
  onReplayPerformance: (id: string) => void;
  onStopPerformanceReplay: () => void;
  onDeletePerformance: (id: string) => void;
  initialTab?: 'video' | 'performance';
}

export function RecordPanel({
  onClose,
  recorder,
  onToggleVideo,
  performanceLive,
  perfClock,
  onTogglePerformance,
  savedPerformances,
  replayingPerformanceId,
  onReplayPerformance,
  onStopPerformanceReplay,
  onDeletePerformance,
  initialTab = 'video',
}: RecordPanelProps) {
  const [tab, setTab] = useState<'video' | 'performance'>(() => {
    if (performanceLive) return 'performance';
    return initialTab;
  });

  const videoClock = `${Math.floor(recorder.seconds / 60)}:${String(recorder.seconds % 60).padStart(2, '0')}`;
  const videoOpts = recorder.options;

  const formatBytes = (bytes: number): string => {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`;
    return `${bytes} B`;
  };

  return (
    <Sheet
      title={
        <div className="flex items-center gap-2">
          <span className="font-semibold tracking-tight">Recording Studio</span>
          <span className="text-[12px] text-muted">· Video & Performance</span>
        </div>
      }
      onClose={onClose}
      width={740}
      height={620}
      testId="record-panel"
    >
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* ── Tab Bar ─────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-elevated/50 px-5 py-2.5">
          <div className="inline-flex rounded-lg border border-border bg-surface p-1">
            <button
              onClick={() => setTab('video')}
              data-testid="record-tab-video"
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                tab === 'video'
                  ? 'bg-elevated text-text shadow-sm'
                  : 'text-muted hover:text-text'
              }`}
            >
              <Video size={14} />
              <span>Canvas Video</span>
              {recorder.recording && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
              )}
            </button>
            <button
              onClick={() => setTab('performance')}
              data-testid="record-tab-performance"
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                tab === 'performance'
                  ? 'bg-elevated text-text shadow-sm'
                  : 'text-muted hover:text-text'
              }`}
            >
              <History size={14} />
              <span>Performance (Strokes)</span>
              {performanceLive && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 text-[12px] text-muted">
            <span className="font-mono">R: Video</span>
            <span>·</span>
            <span className="font-mono">T: Performance</span>
          </div>
        </div>

        {/* ── Tab Content ─────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'video' ? (
            /* ═════════════════════════════════════════════════════════
               VIDEO RECORDING (CANVAS ONLY)
               ═════════════════════════════════════════════════════════ */
            <div className="space-y-6">
              {/* Feature Explanation */}
              <div className="rounded-lg border border-border bg-surface/50 p-3.5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-md bg-accent-soft p-1.5 text-accent-text">
                    <Video size={16} />
                  </div>
                  <div className="text-[13px] leading-relaxed text-muted">
                    <p className="font-medium text-text">Canvas-Only Video Recording</p>
                    <p className="mt-0.5">
                      Directly captures frames rendered on the WebGPU fluid plate via{' '}
                      <code className="rounded bg-elevated px-1 py-0.5 font-mono text-[11px] text-text">
                        canvas.captureStream
                      </code>
                      . Menus, sliders, dialogs, and the mouse pointer are never included.
                    </p>
                  </div>
                </div>
              </div>

              {/* Status & Primary Control Card */}
              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          recorder.recording ? 'bg-red-500 animate-pulse' : 'bg-muted'
                        }`}
                      />
                      <span className="text-[14px] font-semibold text-text">
                        {recorder.recording ? 'Recording Canvas Video' : 'Ready to Record'}
                      </span>
                    </div>
                    <p className="text-[12px] text-muted">
                      {recorder.recording ? (
                        <span className="font-mono text-[13px] text-text">
                          Duration: {videoClock} · Quality: {videoOpts.quality} ·{' '}
                          {videoOpts.includeAudio ? 'Audio included' : 'Silent video'}
                        </span>
                      ) : (
                        'Press R or click button below to start capturing canvas output.'
                      )}
                    </p>
                  </div>

                  <Button
                    height={38}
                    variant={recorder.recording ? 'danger' : 'primary'}
                    kbd="R"
                    onClick={onToggleVideo}
                    testId="record-video-start-stop"
                  >
                    {recorder.recording ? (
                      <>
                        <Square size={14} className="fill-current mr-1.5" />
                        Stop & Save Video ({videoClock})
                      </>
                    ) : (
                      <>
                        <Circle size={14} className="fill-current mr-1.5" />
                        Start Video Recording
                      </>
                    )}
                  </Button>
                </div>

                {recorder.error && (
                  <p className="mt-3 rounded bg-red-950/40 border border-red-800/50 px-3 py-2 text-[12px] text-red-300">
                    {recorder.error}
                  </p>
                )}
              </div>

              {/* Flexible Video Options */}
              <div className="space-y-4">
                <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
                  Recording Options
                </h3>

                {/* Audio Inclusion Toggle */}
                <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      {videoOpts.includeAudio ? (
                        <Volume2 size={16} className="text-accent-text" />
                      ) : (
                        <VolumeX size={16} className="text-muted" />
                      )}
                      <div>
                        <div className="text-[13px] font-medium text-text">Include Audio Track</div>
                        <div className="text-[12px] text-muted">
                          {videoOpts.includeAudio
                            ? 'Muxes live music, microphone, or synthesizer drone directly into the video.'
                            : 'Produces a clean, silent video stream containing only visual canvas frames.'}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => recorder.setOptions({ includeAudio: !videoOpts.includeAudio })}
                      disabled={recorder.recording}
                      data-testid="record-audio-toggle"
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        videoOpts.includeAudio ? 'bg-primary' : 'bg-border-strong'
                      } ${recorder.recording ? 'opacity-50 cursor-not-allowed' : ''}`}
                      role="switch"
                      aria-checked={videoOpts.includeAudio}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          videoOpts.includeAudio ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Quality & Bitrate Presets */}
                <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
                  <div>
                    <div className="text-[13px] font-medium text-text">Quality & Bitrate Preset</div>
                    <div className="text-[12px] text-muted">
                      Controls encoder target bitrate and compression fidelity.
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(
                      [
                        {
                          id: 'master',
                          label: 'Master (30 Mbps)',
                          desc: 'Preserves sharp fluid boundaries & grain. Ideal for editing or YouTube 4K.',
                        },
                        {
                          id: 'standard',
                          label: 'Standard (12 Mbps)',
                          desc: 'Crisp 60fps presentation with balanced file size for sharing.',
                        },
                        {
                          id: 'compact',
                          label: 'Compact (5 Mbps)',
                          desc: 'Lightweight encoding for fast downloads and smaller file sizes.',
                        },
                      ] as const
                    ).map((q) => {
                      const selected = videoOpts.quality === q.id;
                      return (
                        <button
                          key={q.id}
                          disabled={recorder.recording}
                          onClick={() => recorder.setOptions({ quality: q.id as VideoQuality })}
                          data-testid={`record-quality-${q.id}`}
                          className={`flex flex-col text-left rounded-lg border p-3 transition-colors ${
                            selected
                              ? 'border-accent-border bg-accent-soft text-text'
                              : 'border-border bg-elevated/40 text-muted hover:border-border-strong hover:text-text'
                          } ${recorder.recording ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex items-center justify-between w-full font-medium text-[13px]">
                            <span>{q.label}</span>
                            {selected && <Check size={14} className="text-accent-text" />}
                          </div>
                          <span className="mt-1 text-[11px] leading-snug opacity-80">{q.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Frame Rate & Container Format */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* FPS */}
                  <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
                    <div className="text-[13px] font-medium text-text">Frame Rate</div>
                    <div className="text-[12px] text-muted">
                      Capture rate from the fluid simulation loop.
                    </div>
                    <div className="flex gap-2 pt-1">
                      {([60, 30] as const).map((rate) => (
                        <button
                          key={rate}
                          disabled={recorder.recording}
                          onClick={() => recorder.setOptions({ fps: rate })}
                          data-testid={`record-fps-${rate}`}
                          className={`flex-1 rounded-md border py-1.5 text-center text-[12px] font-medium transition-colors ${
                            videoOpts.fps === rate
                              ? 'border-accent-border bg-accent-soft text-text'
                              : 'border-border bg-elevated/40 text-muted hover:border-border-strong'
                          } ${recorder.recording ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {rate} fps
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Format */}
                  <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
                    <div className="text-[13px] font-medium text-text">Container & Codec</div>
                    <div className="text-[12px] text-muted">
                      Preferred video container (subject to browser support).
                    </div>
                    <div className="flex gap-2 pt-1">
                      {(
                        [
                          { id: 'auto', label: 'Auto' },
                          { id: 'webm', label: 'WebM' },
                          { id: 'mp4', label: 'MP4' },
                        ] as const
                      ).map((fmt) => (
                        <button
                          key={fmt.id}
                          disabled={recorder.recording}
                          onClick={() => recorder.setOptions({ format: fmt.id as VideoFormat })}
                          data-testid={`record-format-${fmt.id}`}
                          className={`flex-1 rounded-md border py-1.5 text-center text-[12px] font-medium transition-colors ${
                            videoOpts.format === fmt.id
                              ? 'border-accent-border bg-accent-soft text-text'
                              : 'border-border bg-elevated/40 text-muted hover:border-border-strong'
                          } ${recorder.recording ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {fmt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Last Recorded Take */}
              {recorder.lastTake && (
                <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[13px] font-medium text-text">Recent Take Saved</div>
                      <div className="text-[12px] font-mono text-muted">
                        {recorder.lastTake.filename} · {clockText(recorder.lastTake.seconds)} ·{' '}
                        {formatBytes(recorder.lastTake.sizeBytes)}
                      </div>
                    </div>
                    <a
                      href={recorder.lastTake.url}
                      download={recorder.lastTake.filename}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-[12px] font-medium text-text hover:bg-hover transition-colors"
                      data-testid="record-download-last-take"
                    >
                      <Download size={13} />
                      Download Take Again
                    </a>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ═════════════════════════════════════════════════════════
               PERFORMANCE RECORDING (KEYSTROKES & PAINT STROKES)
               ═════════════════════════════════════════════════════════ */
            <div className="space-y-6">
              {/* Feature Explanation */}
              <div className="rounded-lg border border-border bg-surface/50 p-3.5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-md bg-accent-soft p-1.5 text-accent-text">
                    <History size={16} />
                  </div>
                  <div className="text-[13px] leading-relaxed text-muted">
                    <p className="font-medium text-text">Interactive Gesture & Stroke Recording</p>
                    <p className="mt-0.5">
                      Records your exact mouse strokes, dropper drops, tool switches, and dye flows into
                      ChromaGlass's internal memory. Replayable on cue or in sync with identified songs.
                    </p>
                  </div>
                </div>
              </div>

              {/* Status & Primary Control Card */}
              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          performanceLive ? 'bg-red-500 animate-pulse' : 'bg-muted'
                        }`}
                      />
                      <span className="text-[14px] font-semibold text-text">
                        {performanceLive ? 'Recording Performance Gestures' : 'Ready to Record Gestures'}
                      </span>
                    </div>
                    <p className="text-[12px] text-muted">
                      {performanceLive ? (
                        <span className="font-mono text-[13px] text-text">
                          Duration: {perfClock ?? '0:00'}
                          {performanceLive.title ? ` · Attached to "${performanceLive.title}"` : ' · Wall clock'}
                        </span>
                      ) : (
                        'Press T on your keyboard or click below to record your painting actions.'
                      )}
                    </p>
                  </div>

                  <Button
                    height={38}
                    variant={performanceLive ? 'danger' : 'secondary'}
                    kbd="T"
                    onClick={onTogglePerformance}
                    testId="record-perf-start-stop"
                  >
                    {performanceLive ? (
                      <>
                        <Square size={14} className="fill-current mr-1.5" />
                        Stop & Keep Performance
                      </>
                    ) : (
                      <>
                        <Circle size={14} className="fill-current mr-1.5" />
                        Record Performance
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Saved Performances List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
                    Saved Performances ({savedPerformances.length})
                  </h3>
                  {replayingPerformanceId && (
                    <div className="flex items-center gap-2 text-[12px] text-accent-text font-medium">
                      <span>
                        Replaying "
                        {savedPerformances.find((p) => p.id === replayingPerformanceId)?.title ?? 'Take'}
                        "
                      </span>
                      <button
                        onClick={onStopPerformanceReplay}
                        className="rounded border border-accent-border px-2 py-0.5 hover:bg-accent-soft"
                      >
                        Stop Replay
                      </button>
                    </div>
                  )}
                </div>

                {savedPerformances.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-8 text-center">
                    <p className="text-[13px] font-medium text-text">No recorded performances yet</p>
                    <p className="mt-1 text-[12px] text-muted max-w-md mx-auto">
                      Paint dye on the plate while recording is active. ChromaGlass will store your gestures
                      and replay them automatically at the right moment when the song plays.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border divide-y divide-border bg-surface overflow-hidden">
                    {savedPerformances.map((perf) => {
                      const isReplaying = replayingPerformanceId === perf.id;
                      return (
                        <div
                          key={perf.id}
                          className="flex items-center justify-between p-3 hover:bg-hover/50 transition-colors"
                        >
                          <div className="min-w-0 pr-3">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-medium text-text truncate">
                                {perf.title ?? 'Untitled Performance'}
                              </span>
                              {perf.artist && (
                                <span className="text-[12px] text-muted truncate">· {perf.artist}</span>
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-dim">
                              <span>{clockText(perf.durationSec)}</span>
                              <span>·</span>
                              <span>{perf.gestures.length} gestures</span>
                              <span>·</span>
                              <span>{perf.clock === 'song' ? 'Song-synced' : 'Wall clock'}</span>
                              <span>·</span>
                              <span>{new Date(perf.date).toLocaleDateString()}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() =>
                                isReplaying ? onStopPerformanceReplay() : onReplayPerformance(perf.id)
                              }
                              title={isReplaying ? 'Stop replay' : 'Replay this performance'}
                              className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors ${
                                isReplaying
                                  ? 'border-accent-border bg-accent-soft text-accent-text'
                                  : 'border-border hover:bg-hover text-text'
                              }`}
                            >
                              {isReplaying ? <Square size={12} className="fill-current" /> : <Play size={12} />}
                              <span>{isReplaying ? 'Stop' : 'Replay'}</span>
                            </button>

                            <button
                              onClick={() => onDeletePerformance(perf.id)}
                              title="Delete saved performance"
                              className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted hover:border-red-800 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
