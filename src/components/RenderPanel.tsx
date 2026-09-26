import React, { useEffect, useState } from 'react';
import { Film, X } from 'lucide-react';
import type { SongRenderState } from '../hooks/useSongRender';

/**
 * Render this song: the size, the rate and the seed, then progress and a
 * cancel.
 *
 * Opened from the music player, because a render is of the song that is
 * loaded there: nothing on the Perform desk moves for it, and the panel sits
 * over the plate like the shelf does, above the player. Every choice starts
 * where it should for a film someone will keep: 1080p, 60 fps, and tonight's
 * seed, so a render of a night that looked right is that night's dice. A
 * seed typed here is a whole number, or a word (it is hashed, as `?seed=` is).
 *
 * The line under the choices says what the browser will actually write
 * before anything is pressed: H.264 and AAC in MP4 on Chrome on a Mac, VP9
 * and Opus in WebM where H.264 cannot be encoded, and on a browser with no
 * WebCodecs at all, that it cannot and that Record still captures the screen.
 */

export const RENDER_SIZES = [
  { id: '1080p', label: '1080p', width: 1920, height: 1080 },
  { id: '720p', label: '720p', width: 1280, height: 720 },
  { id: '4k', label: '4K', width: 3840, height: 2160 },
  { id: 'square', label: 'Square 1080', width: 1080, height: 1080 },
  { id: 'vertical', label: 'Vertical 1080', width: 1080, height: 1920 },
] as const;
export const RENDER_RATES = [60, 30, 24] as const;

export interface RenderChoice { width: number; height: number; fps: number; seed: string }

interface Props {
  songName: string;
  songSeconds: number;
  currentSeed: number;
  state: SongRenderState;
  running: boolean;
  /** Whether a sequence or a song's show is running and will be stopped for the render. */
  showRunning: boolean;
  webcodecs: boolean;
  streamsToDisk: boolean;
  onRender: (c: RenderChoice) => void;
  onCancel: () => void;
  onClose: () => void;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function RenderPanel(p: Props) {
  const [size, setSize] = useState<string>('1080p');
  const [fps, setFps] = useState<number>(60);
  const [seed, setSeed] = useState<string>(String(p.currentSeed));
  useEffect(() => { if (!p.running) setSeed((s) => s || String(p.currentSeed)); }, [p.currentSeed, p.running]);
  const chosen = RENDER_SIZES.find((s) => s.id === size) ?? RENDER_SIZES[0];
  const frames = Math.ceil(p.songSeconds * fps);
  const st = p.state;
  const pct = st.frames > 0 ? Math.round((st.frame / st.frames) * 100) : 0;
  const finished = st.phase === 'done' || st.phase === 'failed' || st.phase === 'cancelled';

  return (
    <div className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 w-[min(92vw,460px)] rounded-2xl border border-white/10 bg-black/85 p-3 backdrop-blur-xl shadow-2xl" data-testid="render-panel">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/70">
          <Film size={12} /> Render this song
        </span>
        <button onClick={p.onClose} disabled={p.running} className="p-1 rounded-full hover:bg-white/10 text-white/50 disabled:opacity-30" aria-label="Close the render panel"><X size={12} /></button>
      </div>
      <p className="px-1 text-[12px] text-white/80 truncate" title={p.songName}>{p.songName} · {clock(p.songSeconds)}</p>

      {!p.webcodecs ? (
        <p className="mt-2 rounded-lg bg-amber-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-amber-100" data-testid="render-unsupported">
          This browser cannot render a song: it has no WebCodecs (Chrome and Edge do). The Record button still captures the show as it plays, with MediaRecorder, which drops frames when the machine is busy.
        </p>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 px-1 text-[11px] text-white/60">
            <span>Size</span>
            <div className="flex flex-wrap gap-1">
              {RENDER_SIZES.map((s) => (
                <button key={s.id} disabled={p.running} onClick={() => setSize(s.id)} data-testid={`render-size-${s.id}`}
                  className={`rounded-full border px-2 py-0.5 ${size === s.id ? 'border-white/40 bg-white/15 text-white' : 'border-white/10 text-white/50 hover:text-white/80'} disabled:opacity-40`}>
                  {s.label}
                </button>
              ))}
            </div>
            <span>Rate</span>
            <div className="flex gap-1">
              {RENDER_RATES.map((r) => (
                <button key={r} disabled={p.running} onClick={() => setFps(r)} data-testid={`render-fps-${r}`}
                  className={`rounded-full border px-2 py-0.5 ${fps === r ? 'border-white/40 bg-white/15 text-white' : 'border-white/10 text-white/50 hover:text-white/80'} disabled:opacity-40`}>
                  {r} fps
                </button>
              ))}
            </div>
            <span>Seed</span>
            <input value={seed} disabled={p.running} onChange={(e) => setSeed(e.target.value)} data-testid="render-seed"
              className="w-40 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-white/90 disabled:opacity-40"
              title="Tonight's seed by default: the same seed and look render the same film. A word works too." />
          </div>
          <p className="mt-2 px-1 text-[10px] leading-relaxed text-white/40">
            {chosen.width}x{chosen.height} at {fps} fps: {frames.toLocaleString()} frames, every one computed, none dropped.
            {' '}{p.streamsToDisk ? 'Written to a file you choose as it renders.' : 'Kept in memory and downloaded at the end.'}
            {' '}The film plays the look on the plate now, with Evolve if it is on.
            {p.showRunning && ' The running sequence or song show stops for the render: it does not play in a render yet.'}
          </p>
        </>
      )}

      {st.phase !== 'idle' && (
        <div className="mt-2 px-1" data-testid="render-progress">
          {st.format && <p className="text-[10px] text-white/40">{st.format}</p>}
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className={`h-full ${st.phase === 'failed' ? 'bg-red-400' : st.phase === 'done' ? 'bg-emerald-400' : 'bg-white/70'}`} style={{ width: `${finished ? 100 : pct}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-white/70" data-testid="render-message">
            {st.phase === 'frames' ? `Frame ${st.frame.toLocaleString()} of ${st.frames.toLocaleString()}${st.remainingS !== null && st.frame > 0 ? ` · about ${clock(st.remainingS)} left` : ''}` : st.message}
          </p>
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2">
        {p.running ? (
          <button onClick={p.onCancel} className="rounded-full border border-red-400/40 bg-red-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-red-100 hover:bg-red-500/25" data-testid="render-cancel">
            Cancel
          </button>
        ) : p.webcodecs && (
          <button onClick={() => p.onRender({ width: chosen.width, height: chosen.height, fps, seed })} className="rounded-full border border-white/20 bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white hover:bg-white/25" data-testid="render-start">
            {finished ? 'Render again' : 'Render'}
          </button>
        )}
      </div>
    </div>
  );
}
