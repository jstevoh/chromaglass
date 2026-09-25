import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Music, Disc3, History, Fingerprint, Mic2, Play, Square, FileAudio, Sparkles, Circle, Trash2 } from 'lucide-react';
import { MusicIntelState, PerformanceState } from '../hooks/useMusicIntelligence';
import { clockText } from '../lib/performanceTake';
import { MusicSettings } from '../lib/musicTypes';

interface TrackPanelProps {
  state: MusicIntelState;
  musicSettings: MusicSettings;
  onUpdateMusicSettings: (partial: Partial<MusicSettings>) => void;
  onManualTag: (artist: string, title: string) => void;
  onReplayListen: (listenNumber: number) => void;
  onStopReplay: () => void;
  /** Performances, started and stopped by hand (lib/performanceTake.ts). */
  performance: PerformanceState;
  /** The live one's clock, "1:23", or null. */
  performanceClock: string | null;
  onTogglePerformance: () => void;
  onReplayPerformance: (id: string) => void;
  onStopPerformanceReplay: () => void;
  onDeletePerformance: (id: string) => void;
  onClose: () => void;
}

const SECTION_COLORS: Record<string, string> = {
  intro: '#5b8dee', verse: '#8a2be2', chorus: '#ff007f',
  bridge: '#ffb020', outro: '#4b6b8a', song: '#8a2be2',
};

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const Toggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
  <div className="flex items-center justify-between mb-3">
    <span className="text-xs font-bold uppercase tracking-widest opacity-70">{label}</span>
    <button
      onClick={() => onChange(!value)}
      className={`w-10 h-5 rounded-full relative transition-colors ${value ? 'bg-purple-500' : 'bg-white/20'}`}
    >
      <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  </div>
);

export const TrackPanel: React.FC<TrackPanelProps> = ({
  state, musicSettings, onUpdateMusicSettings, onManualTag, onReplayListen, onStopReplay,
  performance, performanceClock, onTogglePerformance, onReplayPerformance, onStopPerformanceReplay, onDeletePerformance, onClose,
}) => {
  const [tagArtist, setTagArtist] = useState('');
  const [tagTitle, setTagTitle] = useState('');
  const { track, songMap, lyrics, trackState, positionSec, section } = state;

  return (
    <motion.div
      initial={{ x: '-100%' }}
      animate={{ x: 0 }}
      exit={{ x: '-100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed top-0 left-0 w-80 h-full bg-black/80 backdrop-blur-xl border-r border-white/10 z-40 overflow-y-auto p-8 pt-28 scrollbar-hide"
    >
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-xl font-bold tracking-tighter italic">Track <span className="not-italic">Intelligence</span></h2>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <X size={20} />
        </button>
      </div>

      {/* ── Now Playing ──────────────────────────────────────────── */}
      <section className="mb-8">
        <h3 className="text-[10px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Disc3 size={12} /> Now Playing
        </h3>
        {track ? (
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="text-sm font-bold">{track.title}</div>
            <div className="text-xs opacity-60 mt-0.5">{track.artist}{track.album ? ` — ${track.album}` : ''}</div>
            <div className="flex items-center gap-2 mt-2 text-[9px] uppercase tracking-wider opacity-50">
              <span>{fmtTime(positionSec)}</span>
              {section && (
                <span className="px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: `${SECTION_COLORS[section.label] ?? '#888'}40`, color: SECTION_COLORS[section.label] ?? '#ccc' }}>
                  {section.label}
                </span>
              )}
              <span className="px-1.5 py-0.5 rounded bg-white/10">
                {track.source === 'manual' ? 'manual tag' : track.source === 'local' ? 'local match' : 'fingerprint'}
              </span>
              {trackState?.presetId && (
                <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-200 font-bold">{trackState.presetId.replace(/-/g, ' ')}</span>
              )}
            </div>

            {/* Section timeline */}
            {songMap && songMap.sections.length > 0 && (
              <div className="mt-3">
                <div className="flex h-2 rounded-full overflow-hidden">
                  {songMap.sections.map((s, i) => (
                    <div
                      key={i}
                      title={`${s.label} ${fmtTime(s.start)}–${fmtTime(s.end)}`}
                      style={{
                        width: `${((s.end - s.start) / songMap.durationSec) * 100}%`,
                        backgroundColor: SECTION_COLORS[s.label] ?? '#888',
                        opacity: section === s ? 1 : 0.45,
                      }}
                    />
                  ))}
                </div>
                <div className="relative h-1 mt-0.5">
                  <div
                    className="absolute top-0 w-0.5 h-1 bg-white"
                    style={{ left: `${Math.min(100, (positionSec / songMap.durationSec) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {lyrics && (
              <div className="mt-2 text-[9px] uppercase tracking-wider opacity-40">
                {lyrics.synced ? 'synced lyrics' : 'lyrics (aligned)'} · {lyrics.triggers.length} word triggers
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs opacity-50 leading-relaxed">
            No track identified yet.
            {!state.fingerprintEnabled && ' Fingerprinting is not configured — tag the track manually below, or set VITE_FINGERPRINT_PROXY_URL for automatic identification.'}
          </div>
        )}

        {/* Status row */}
        <div className="flex gap-2 mt-3 text-[9px] uppercase tracking-wider">
          {state.identifying && <span className="flex items-center gap-1 text-blue-300"><Fingerprint size={10} /> identifying…</span>}
          {state.recording && <span className="flex items-center gap-1 text-red-300"><Mic2 size={10} /> mapping this listen</span>}
          {state.analyzing && <span className="flex items-center gap-1 text-yellow-300"><FileAudio size={10} /> analyzing structure…</span>}
        </div>
      </section>

      {/* ── Manual tag ───────────────────────────────────────────── */}
      <section className="mb-8">
        <h3 className="text-[10px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Music size={12} /> Tag Track
        </h3>
        <div className="flex flex-col gap-2">
          <input
            value={tagArtist} onChange={e => setTagArtist(e.target.value)}
            placeholder="Artist"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-white/30"
          />
          <input
            value={tagTitle} onChange={e => setTagTitle(e.target.value)}
            placeholder="Title"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-white/30"
          />
          <button
            onClick={() => { onManualTag(tagArtist, tagTitle); setTagArtist(''); setTagTitle(''); }}
            disabled={!tagArtist.trim() || !tagTitle.trim()}
            className="w-full py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 text-[13px] font-medium transition-all"
          >
            Identify as this track
          </button>
        </div>
      </section>

      {/* ── Evolution ────────────────────────────────────────────── */}
      {trackState && (
        <section className="mb-8">
          <h3 className="text-[10px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
            <Sparkles size={12} /> Evolution
          </h3>
          <div className="text-xs opacity-70 mb-2">
            Listened <span className="font-bold text-white">{trackState.listenCount}</span> time{trackState.listenCount === 1 ? '' : 's'}
          </div>
          <div className="mb-2">
            <div className="flex justify-between text-[9px] uppercase tracking-wider opacity-50 mb-1">
              <span>Complexity</span><span>{Math.round(trackState.currentParams.complexity * 100)}%</span>
            </div>
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-purple-400 rounded-full" style={{ width: `${trackState.currentParams.complexity * 100}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {trackState.currentParams.unlockedLayers.map(theme => (
              <span key={theme} className="text-[8px] px-1.5 py-0.5 rounded bg-white/10 uppercase tracking-wider opacity-70">{theme}</span>
            ))}
          </div>
        </section>
      )}

      {/* ── Performances ─────────────────────────────────────────── */}
      <section className="mb-8" data-testid="performances">
        <h3 className="text-[10px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Circle size={12} /> Performances
        </h3>
        <button
          onClick={onTogglePerformance}
          data-testid="performance-toggle"
          className={`flex items-center justify-center gap-2 w-full mb-2 px-3 py-2.5 rounded-lg border text-[12px] font-bold uppercase tracking-widest transition-colors ${
            performance.live
              ? 'bg-red-500/25 border-red-400/50 text-red-100 hover:bg-red-500/35'
              : 'bg-white/5 border-white/15 hover:bg-white/10'
          }`}
        >
          {performance.live
            ? <><Square size={11} /> Stop and keep · {performanceClock ?? '0:00'}</>
            : <><Circle size={11} className="text-red-400" fill="currentColor" /> Start a performance</>}
        </button>
        <p className="text-[9px] opacity-40 mb-3 leading-relaxed">
          {performance.live
            ? (performance.live.title ? `With “${performance.live.title}”. ` : 'No song identified yet; one that is by the time you stop is attached. ')
              + 'Everything you paint until you stop is kept.'
            : 'Start, paint, stop: what you painted is kept with the song that is playing, and replays at the same moments in it. T on the desks.'}
        </p>
        {performance.saved.length > 0 && (
          <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
            {performance.saved.map(perf => {
              const replaying = performance.replayingId === perf.id;
              return (
                <div
                  key={perf.id}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border ${
                    replaying ? 'bg-purple-500/20 border-purple-400/40' : 'bg-white/5 border-white/10'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold truncate">{perf.title ?? 'No song'}{perf.artist ? ` — ${perf.artist}` : ''}</div>
                    <div className="text-[9px] opacity-50">
                      {new Date(perf.date).toLocaleString()} · {clockText(perf.durationSec)} · {perf.gestures.length} gestures
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => (replaying ? onStopPerformanceReplay() : onReplayPerformance(perf.id))}
                      title={replaying ? 'Stop the replay' : perf.clock === 'song'
                        ? 'Replay it: with its song playing it follows the song, otherwise it plays on its own'
                        : 'Replay it on its own clock'}
                      className="p-1.5 rounded-md hover:bg-white/10"
                    >
                      {replaying ? <Square size={11} /> : <Play size={11} />}
                    </button>
                    <button
                      onClick={() => onDeletePerformance(perf.id)}
                      title="Delete this performance"
                      className="p-1.5 rounded-md hover:bg-white/10 opacity-60 hover:opacity-100"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── History / Replay ─────────────────────────────────────── */}
      {trackState && trackState.listens.length > 0 && (
        <section className="mb-8">
          <h3 className="text-[10px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
            <History size={12} /> Listen History
          </h3>
          {state.replayListenNumber != null && (
            <button
              onClick={onStopReplay}
              className="flex items-center gap-2 w-full mb-3 px-3 py-2 rounded-lg bg-purple-500/20 border border-purple-400/40 text-[13px] font-medium text-purple-200"
            >
              <Square size={10} /> Replaying listen #{state.replayListenNumber} — tap to return to live evolution
            </button>
          )}
          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
            {[...trackState.listens].reverse().map(listen => (
              <button
                key={listen.listenNumber}
                onClick={() => onReplayListen(listen.listenNumber)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all text-left ${
                  state.replayListenNumber === listen.listenNumber
                    ? 'bg-purple-500/20 border-purple-400/40'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                <div>
                  <div className="text-[10px] font-bold flex items-center gap-1.5">
                    Listen #{listen.listenNumber}
                    {listen.gestures && listen.gestures.length > 0 && (
                      <span className="px-1 py-0.5 rounded bg-purple-500/25 text-purple-200 text-[8px] font-bold" title={`${listen.gestures.length} recorded gestures replay with this listen`}>
                        🎨 {listen.gestures.length}
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] opacity-50">{new Date(listen.date).toLocaleString()}</div>
                </div>
                <Play size={10} className="opacity-50" />
              </button>
            ))}
          </div>
          <p className="text-[9px] opacity-40 mt-2 leading-relaxed">
            Replay renders the live audio with that listen's frozen visual parameters — and re-paints any saved 🎨 performance at the same moments in the song.
          </p>
        </section>
      )}

      {/* ── Music settings ───────────────────────────────────────── */}
      <section className="mb-8">
        <h3 className="text-[10px] uppercase tracking-[0.3em] opacity-30 mb-4">Music Intelligence</h3>
        <Toggle label="Enabled" value={musicSettings.enabled} onChange={v => onUpdateMusicSettings({ enabled: v })} />
        <Toggle label="Lyric Triggers" value={musicSettings.lyricTriggers} onChange={v => onUpdateMusicSettings({ lyricTriggers: v })} />
        <Toggle label="Sentiment Arc" value={musicSettings.sentimentArc} onChange={v => onUpdateMusicSettings({ sentimentArc: v })} />
        <Toggle label="Lyrics Overlay" value={musicSettings.lyricsOverlay} onChange={v => onUpdateMusicSettings({ lyricsOverlay: v })} />
        <div className="flex flex-col gap-2 mt-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest opacity-70">Evolution Speed</span>
            <span className="text-[10px] font-mono opacity-50">{musicSettings.evolutionSpeed.toFixed(2)}</span>
          </div>
          <input
            type="range" min={0} max={1} step={0.05}
            value={musicSettings.evolutionSpeed}
            onChange={e => onUpdateMusicSettings({ evolutionSpeed: parseFloat(e.target.value) })}
            className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-purple-400"
          />
        </div>
      </section>

      {/* ── Library ──────────────────────────────────────────────── */}
      {state.allTracks.length > 0 && (
        <section className="mb-8">
          <h3 className="text-[10px] uppercase tracking-[0.3em] opacity-30 mb-4">Library</h3>
          <div className="flex flex-col gap-1">
            {state.allTracks.slice(0, 12).map(t => (
              <div key={t.isrc} className="flex items-center justify-between text-[10px] px-2 py-1.5 rounded bg-white/5">
                <span className="truncate opacity-80">{t.title ?? t.isrc}{t.artist ? <span className="opacity-50"> — {t.artist}</span> : null}</span>
                <span className="opacity-40 shrink-0 ml-2">{t.listenCount}×</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </motion.div>
  );
};
