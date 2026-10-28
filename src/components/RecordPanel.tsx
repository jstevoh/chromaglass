import React from 'react';
import {
  Video,
  Film,
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
  Share2,
  Smartphone,
} from 'lucide-react';
import { Sheet, Button, SwitchPill, Toggle, LIT } from './ui';
import type { Recorder, VideoQuality, VideoFormat } from '../hooks/useRecorder';
import type { SavedPerformance } from '../lib/musicTypes';
import { clockText } from '../lib/performanceTake';
import { openAccountSheet } from '../lib/tierGates';
import { makesText, type RecordChoice } from '../lib/recordChoice';
import { PORTRAIT_STAGE, FREE_PORTRAIT_STAGE, type ClipShape } from '../lib/clipFrame';
import { canShareClip, shareClip } from '../lib/shareClip';

export interface RecordPanelProps {
  onClose: () => void;
  recorder: Recorder;
  /** The one Record button: starts what is chosen below, or stops whatever is running. */
  onToggleRecord: () => void;
  choice: RecordChoice;
  onChoice: (c: RecordChoice) => void;
  performanceLive: { startedAtMs: number; title?: string } | null;
  perfClock: string | null;
  /** The loaded song's film: absent when no song is loaded in the player. */
  songFilm?: { name: string; running: boolean; onOpen: () => void } | null;
  savedPerformances: SavedPerformance[];
  replayingPerformanceId: string | null;
  onReplayPerformance: (id: string) => void;
  onStopPerformanceReplay: () => void;
  onDeletePerformance: (id: string) => void;
}

export function RecordPanel({
  onClose,
  recorder,
  onToggleRecord,
  choice,
  onChoice,
  performanceLive,
  perfClock,
  songFilm,
  savedPerformances,
  replayingPerformanceId,
  onReplayPerformance,
  onStopPerformanceReplay,
  onDeletePerformance,
}: RecordPanelProps) {
  const anyRunning = recorder.recording || !!performanceLive;

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
          <span className="font-semibold tracking-tight">Record</span>
          <span className="text-[12px] text-muted">· Plate video, Take and Song film</span>
        </div>
      }
      onClose={onClose}
      width={740}
      height={620}
      testId="record-panel"
    >
      <div className="flex flex-1 flex-col overflow-hidden">

        <div className="flex-1 overflow-y-auto p-5">
          <div className="space-y-8">
            {/* ═════════ THE ONE RECORD BUTTON ═════════ */}
            <section className="space-y-3" data-testid="record-makes">
              <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${anyRunning ? 'bg-live animate-pulse' : 'bg-muted'}`} />
                      <span className="text-[14px] font-semibold text-text">
                        {anyRunning ? 'Recording' : 'Ready to record'}
                      </span>
                    </div>
                    <p className="text-[12px] text-muted font-mono">
                      {anyRunning ? (
                        <>
                          {recorder.recording && <>Plate video {videoClock} · {videoOpts.includeAudio ? 'with sound' : 'silent'}</>}
                          {recorder.recording && performanceLive && ' · '}
                          {performanceLive && <>Take {perfClock ?? '0:00'}{performanceLive.title ? ` · with "${performanceLive.title}"` : ''}</>}
                        </>
                      ) : (
                        <>Record makes: {makesText(choice)}. R starts and stops it.</>
                      )}
                    </p>
                  </div>
                  <Button
                    height={38}
                    // Off it is a plain button with a red dot, on it is the solid
                    // red that means recording now (PLAN 35a). It was the white
                    // primary while off, which is brighter than the red, so on
                    // drew darker than off (switches' lift bar: 1.00:1).
                    variant="secondary"
                    pressed={anyRunning}
                    live
                    kbd="R"
                    onClick={onToggleRecord}
                    testId="record-start-stop"
                  >
                    {anyRunning ? (
                      <span className="inline-flex items-center gap-1.5"><Square size={14} className="fill-current" />Stop and keep it</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5"><Circle size={14} className="fill-current text-live" />Record</span>
                    )}
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 border-t border-border pt-2">
                  <Toggle
                    label="Plate video: a video file of the plate"
                    on={choice.video}
                    onChange={(v) => onChoice(v ? { ...choice, video: true } : { video: false, take: true })}
                    disabled={anyRunning}
                    title="Record makes a video file of the plate. Turning this off turns Take on: Record always makes something."
                    testId="record-makes-video"
                  />
                  <Toggle
                    label="Take: your strokes, to replay with the song"
                    on={choice.take}
                    onChange={(v) => onChoice(v ? { ...choice, take: true } : { video: true, take: false })}
                    disabled={anyRunning}
                    title="Record also keeps what you paint, replayable with the song (T records a Take by itself). Turning this off turns Plate video on."
                    testId="record-makes-take"
                  />
                </div>
                {recorder.error && (
                  <p className="rounded bg-red-950/40 border border-red-800/50 px-3 py-2 text-[12px] text-red-300">
                    {recorder.error}
                  </p>
                )}
              </div>
            </section>

            {/* ═════════ PLATE VIDEO ═════════ */}
            <section className="space-y-4" data-testid="record-section-video">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-md bg-accent-soft p-1.5 text-accent-text"><Video size={16} /></div>
                <div className="text-[13px] leading-relaxed text-muted">
                  <p className="font-medium text-text">Plate video</p>
                  <p className="mt-0.5">
                    A video file of the plate's picture, made live. Menus, sliders and the pointer are never in it.
                    Sound is a setting here: it adds what the plate is hearing, and nothing else is recorded.
                  </p>
                </div>
              </div>
              {recorder.maxDurationSec !== null && (
                <div
                  data-cg-app-tile="full-record"
                  data-cg-record-free-cap={String(recorder.maxDurationSec)}
                  onClick={openAccountSheet}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAccountSheet(); } }}
                  className="cursor-pointer rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-[12px] leading-relaxed text-amber-100 transition-colors hover:border-amber-400/50 hover:bg-amber-500/15"
                >
                  <div className="flex items-center justify-between gap-2 font-semibold text-amber-200">
                    <span>In the ChromaGlass app · Full-length unmarked Record</span>
                    <span className="shrink-0 text-[11px] font-medium text-amber-300 underline underline-offset-2">Get Home or Pro →</span>
                  </div>
                  <p className="mt-0.5 text-amber-100/90">
                    On the free site, clips are capped at {recorder.maxDurationSec} seconds and carry the ChromaGlass corner mark. Unlock Home or Pro for full-length unmarked takes.
                  </p>
                </div>
              )}


              {/* Flexible Video Options */}
              <div className="space-y-4">
                <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
                  Plate video options
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
                        <div className="text-[13px] font-medium text-text">Sound in the video</div>
                        <div className="text-[12px] text-muted">
                          {videoOpts.includeAudio
                            ? 'Adds what the plate is hearing (music, microphone, system sound or the drone) to the video file.'
                            : 'A silent video of the plate.'}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => recorder.setOptions({ includeAudio: !videoOpts.includeAudio })}
                      disabled={recorder.recording}
                      data-testid="record-audio-toggle"
                      role="switch"
                      aria-checked={videoOpts.includeAudio}
                      aria-label="Sound in the video"
                      className={`flex h-8 w-11 shrink-0 items-center justify-center rounded-md p-1 ${
                        recorder.recording ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      <SwitchPill on={videoOpts.includeAudio} />
                    </button>
                  </div>
                </div>

                {/* The frame: the plate as it is, or a 9:16 clip to post (PLAN 34f) */}
                <div className="rounded-lg border border-border bg-surface p-4 space-y-3" data-testid="record-frame">
                  <div className="flex items-start gap-2.5">
                    <Smartphone size={16} className="mt-0.5 text-accent-text" />
                    <div>
                      <div className="text-[13px] font-medium text-text">Frame</div>
                      <div className="text-[12px] text-muted">
                        {videoOpts.shape === 'portrait'
                          ? `A clip to post: ${recorder.maxDurationSec !== null ? `${FREE_PORTRAIT_STAGE.width} × ${FREE_PORTRAIT_STAGE.height}` : `${PORTRAIT_STAGE.width} × ${PORTRAIT_STAGE.height}`}, 9:16 for Reels and TikTok, with sound, as an MP4 where this browser can write one.`
                          : 'The plate in the shape of this window.'}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Frame">
                    {(
                      [
                        { id: 'plate', label: 'As the plate is', desc: 'Whatever shape the window or the wall is.' },
                        { id: 'portrait', label: 'Portrait 9:16', desc: 'The plate drawn tall while it records, not the landscape picture cut down.' },
                      ] as const
                    ).map((f) => {
                      const selected = videoOpts.shape === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={recorder.recording}
                          onClick={() => recorder.setOptions(f.id === 'portrait' ? { shape: 'portrait', includeAudio: true } : { shape: 'plate' })}
                          data-testid={`record-shape-${f.id}`}
                          className={`flex flex-col text-left rounded-lg border p-3 transition-colors ${
                            selected ? LIT : 'border-border text-muted hover:border-border-strong hover:text-text'
                          } ${recorder.recording ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex items-center justify-between w-full font-medium text-[13px]">
                            <span>{f.label}</span>
                            {selected && <Check size={14} />}
                          </div>
                          <span className="mt-1 text-[11px] leading-snug opacity-80">{f.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                  {videoOpts.shape === 'portrait' && (
                    <p className="text-[11px] leading-snug text-muted" data-testid="record-shape-note">
                      While it records, the plate on this screen becomes a tall strip and goes back when you stop. With a projector attached the wall keeps its shape and the clip is the centred 9:16 slice of it.
                    </p>
                  )}
                </div>

                {/* Quality & Bitrate Presets */}
                <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
                  <div>
                    <div className="text-[13px] font-medium text-text">Quality & Bitrate Preset</div>
                    <div className="text-[12px] text-muted">
                      Controls encoder target bitrate and compression fidelity.
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Quality & Bitrate Preset">
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
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={recorder.recording}
                          onClick={() => recorder.setOptions({ quality: q.id as VideoQuality })}
                          data-testid={`record-quality-${q.id}`}
                          className={`flex flex-col text-left rounded-lg border p-3 transition-colors ${
                            selected
                              ? LIT
                              : 'border-border text-muted hover:border-border-strong hover:text-text'
                          } ${recorder.recording ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex items-center justify-between w-full font-medium text-[13px]">
                            <span>{q.label}</span>
                            {selected && <Check size={14} />}
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
                    <div className="flex gap-2 pt-1" role="radiogroup" aria-label="Frame Rate">
                      {([60, 30] as const).map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          role="radio"
                          aria-checked={videoOpts.fps === rate}
                          disabled={recorder.recording}
                          onClick={() => recorder.setOptions({ fps: rate })}
                          data-testid={`record-fps-${rate}`}
                          className={`flex-1 rounded-md border py-1.5 text-center text-[12px] font-medium transition-colors ${
                            videoOpts.fps === rate
                              ? LIT
                              : 'border-border text-muted hover:border-border-strong'
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
                    <div className="flex gap-2 pt-1" role="radiogroup" aria-label="Container & Codec">
                      {(
                        [
                          { id: 'auto', label: 'Auto' },
                          { id: 'webm', label: 'WebM' },
                          { id: 'mp4', label: 'MP4' },
                        ] as const
                      ).map((fmt) => (
                        <button
                          key={fmt.id}
                          type="button"
                          role="radio"
                          aria-checked={videoOpts.format === fmt.id}
                          disabled={recorder.recording}
                          onClick={() => recorder.setOptions({ format: fmt.id as VideoFormat })}
                          data-testid={`record-format-${fmt.id}`}
                          className={`flex-1 rounded-md border py-1.5 text-center text-[12px] font-medium transition-colors ${
                            videoOpts.format === fmt.id
                              ? LIT
                              : 'border-border text-muted hover:border-border-strong'
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
                      <div className="text-[13px] font-medium text-text">Last plate video</div>
                      <div className="text-[12px] font-mono text-muted">
                        {recorder.lastTake.filename} · {clockText(recorder.lastTake.seconds)} ·{' '}
                        {formatBytes(recorder.lastTake.sizeBytes)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                    {canShareClip(recorder.lastTake) && (
                      <button
                        type="button"
                        onClick={() => { void shareClip(recorder.lastTake!); }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-[12px] font-medium text-text hover:bg-hover transition-colors"
                        data-testid="record-share-last-take"
                      >
                        <Share2 size={13} />
                        Share
                      </button>
                    )}
                    <a
                      href={recorder.lastTake.url}
                      download={recorder.lastTake.filename}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-[12px] font-medium text-text hover:bg-hover transition-colors"
                      data-testid="record-download-last-take"
                    >
                      <Download size={13} />
                      Download again
                    </a>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* ═════════ TAKES ═════════ */}
            <section className="space-y-4" data-testid="record-section-takes">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-md bg-accent-soft p-1.5 text-accent-text"><History size={16} /></div>
                <div className="text-[13px] leading-relaxed text-muted">
                  <p className="font-medium text-text">Takes</p>
                  <p className="mt-0.5">
                    Your strokes, dropper drops, tool switches and dye flows, kept to replay on cue or with the song.
                    A Take is not a video and has no sound. T records one on its own.
                  </p>
                </div>
              </div>
              {/* Saved Performances List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
                    Saved takes ({savedPerformances.length})
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
                    <p className="text-[13px] font-medium text-text">No takes yet</p>
                    <p className="mt-1 text-[12px] text-muted max-w-md mx-auto">
                      Turn on Take above (or press T), then paint. ChromaGlass keeps your strokes and replays them
                      at the right moment when the song plays.
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
                                {perf.title ?? 'Untitled take'}
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
                              aria-pressed={isReplaying}
                              onClick={() =>
                                isReplaying ? onStopPerformanceReplay() : onReplayPerformance(perf.id)
                              }
                              title={isReplaying ? 'Stop replay' : 'Replay this take'}
                              className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors ${
                                isReplaying
                                  ? LIT
                                  : 'border-border hover:bg-hover text-text'
                              }`}
                            >
                              {isReplaying ? <Square size={12} className="fill-current" /> : <Play size={12} />}
                              <span>{isReplaying ? 'Stop' : 'Replay'}</span>
                            </button>

                            <button
                              onClick={() => onDeletePerformance(perf.id)}
                              title="Delete this take"
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
            </section>

            {/* ═════════ SONG FILM ═════════ */}
            <section className="space-y-3" data-testid="record-section-song-film">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-md bg-accent-soft p-1.5 text-accent-text"><Film size={16} /></div>
                <div className="text-[13px] leading-relaxed text-muted">
                  <p className="font-medium text-text">Song film</p>
                  <p className="mt-0.5">
                    A frame-exact video of the song loaded in the music player, rendered with none dropped. Unlike
                    Plate video it is not live: it takes as long as it takes, and it needs a browser with WebCodecs.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
                <span className="min-w-0 truncate text-[13px] text-text">
                  {songFilm ? songFilm.name : 'No song loaded. Load one in the music player to render its film.'}
                </span>
                <Button
                  height={34}
                  variant="secondary"
                  onClick={songFilm?.onOpen ?? (() => {})}
                  disabled={!songFilm}
                  testId="record-song-film"
                >
                  {songFilm?.running ? 'Show progress' : 'Render the song…'}
                </Button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
