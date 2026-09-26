import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { AudioData } from './useAudioAnalyzer';
import type { VisualizerRender } from '../components/LiquidVisualizer';
import { beginFixedClock, endFixedClock, tickFixedClock } from '../lib/showClock';
import { setShowSeed, showSeed } from '../lib/rng';
import { decodeSong, songAudioTrack, type DecodedSong } from '../lib/songTrack';
import type { LevelParams } from '../lib/soundLevels';
import {
  RenderCancelled, RenderEncoder, openRenderSink, pickRenderFormat, renderSupport, type RenderFormat, type RenderSink,
} from '../lib/render';

/**
 * Render this song (PLAN.md §6): the loop that plays the show against the
 * song's own timeline, one frame at a time, and hands each frame to the
 * encoders.
 *
 * The order of things, and why:
 *
 *   1. The format and the file, first, inside the click: Chrome's save
 *      dialog needs the click's user activation, which a long decode would
 *      outlast.
 *   2. The song, decoded and heard in advance (lib/songTrack.ts): one
 *      AudioData per frame, before the first frame, so the plate's reaction
 *      is a function of the song and the frame rate and nothing else.
 *   3. The app is asked to step aside (`prepare`): the music element pauses
 *      (a render is not a listening session), a running sequence or song
 *      show stops (first cut: see below), fades in flight are dropped, and
 *      the settings are kept so they can be put back.
 *   4. The seed, then the clock, then the plate: `setShowSeed` restarts
 *      every stream, `beginFixedClock` makes time the frame number, and the
 *      visualizer lays the look on fresh solvers (`VisualizerRender.begin`).
 *   5. All of the song through the audio encoder, then frame by frame:
 *      tick the clock (show intervals fire: Evolve's drift, its glides),
 *      hand the frame's sound to the app, commit both with `flushSync` so
 *      React has applied them before the frame is drawn, draw, encode, and
 *      wait for the GPU and every readback, so the next frame reads this
 *      one's and not whichever happened to land.
 *   6. Whatever happens (done, cancelled, an error), the clock is handed
 *      back first, then the plate, then the app's own state.
 *
 * First cut, said plainly: the render plays the look that is on the plate
 * now, from the seed, with Evolve if it is on, reacting to the song. A
 * running sequence, a song's show and a cue sheet do not play in it yet;
 * they are stopped for the render and the dialog says so. Their clocks
 * already run on the show clock (lib/showClock.ts), which is the hard part;
 * starting them at the song's zero is the next step.
 */

export type RenderPhase = 'idle' | 'preparing' | 'audio' | 'frames' | 'finishing' | 'done' | 'cancelled' | 'failed';

export interface SongRenderState {
  phase: RenderPhase;
  frame: number;
  frames: number;
  /** What to tell the person, in a sentence. */
  message: string;
  format: string | null;
  /** Wall-clock seconds since the render started, and the estimate of what is left. */
  elapsedS: number;
  remainingS: number | null;
  /** The film's own summary, when done. */
  summary: { videoFrames: number; audioPackets: number; durationMs: number; bytes: number } | null;
  /** FNV hashes of every frame that went in, when asked for (the checks). */
  frameHashes: string[] | null;
  /** The whole file, when it was kept in memory and asked for (the checks). */
  bytes: Uint8Array | null;
}

export interface SongRenderRequest {
  song: string | Blob;
  name: string;
  width: number;
  height: number;
  fps: number;
  seed: number;
  /** The trims the live ear is using, so the render hears the song as the show does. */
  levels: LevelParams;
  /** For the checks: keep the file in memory rather than asking where to save it, hash every frame. */
  test?: { keepInMemory: boolean; hashFrames: boolean; maxFrames?: number };
}

export interface SongRenderHost {
  /** The visualizer's render hold, or null while the stage is not up. */
  render: () => VisualizerRender | null;
  /** The frame's sound, to the app (null: back to the live ear). */
  setAudio: (a: AudioData | null) => void;
  /** Step aside for a render; returns what puts everything back. */
  prepare: () => () => void;
}

const IDLE: SongRenderState = {
  phase: 'idle', frame: 0, frames: 0, message: '', format: null, elapsedS: 0, remainingS: null, summary: null, frameHashes: null, bytes: null,
};

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
};

export function useSongRender(host: SongRenderHost) {
  const [state, setState] = useState<SongRenderState>(IDLE);
  const hostRef = useRef(host);
  hostRef.current = host;
  const cancelRef = useRef<(() => void) | null>(null);
  const running = state.phase === 'preparing' || state.phase === 'audio' || state.phase === 'frames' || state.phase === 'finishing';

  const cancel = useCallback(() => { cancelRef.current?.(); }, []);
  const reset = useCallback(() => setState(IDLE), []);

  const start = useCallback(async (req: SongRenderRequest): Promise<SongRenderState> => {
    const began = performance.now();
    let cancelled = false;
    let encoder: RenderEncoder | null = null;
    let sink: RenderSink | null = null;
    cancelRef.current = () => { cancelled = true; void encoder?.cancel(); };
    const elapsed = () => (performance.now() - began) / 1000;
    let last: SongRenderState = { ...IDLE, phase: 'preparing', message: 'Choosing a format…' };
    const set = (patch: Partial<SongRenderState>) => { last = { ...last, ...patch, elapsedS: elapsed() }; setState(last); return last; };
    set({});

    let format: RenderFormat | null = null;
    let song: DecodedSong | null = null;
    let restoreApp: (() => void) | null = null;
    let clockTaken = false;
    let seedBefore: number | null = null;
    let plate: VisualizerRender | null = null;
    try {
      if (!renderSupport().webcodecs) {
        return set({ phase: 'failed', message: 'This browser cannot render a song: it has no WebCodecs (Chrome and Edge do). The Record button still captures the screen as it plays.' });
      }
      format = await pickRenderFormat(req.width, req.height, req.fps, 48000, 2);
      if (!format) {
        return set({ phase: 'failed', message: `This browser cannot encode ${req.width}x${req.height} at ${req.fps} fps in H.264 or VP9. Try a smaller size; the Record button still captures the screen.` });
      }
      set({ format: `${format.label}${renderSupport().streamsToDisk && !req.test?.keepInMemory ? ', written to disk as it renders' : ', kept in memory and downloaded at the end'}` });
      const base = `${req.name.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'song'}_${req.width}x${req.height}_${req.fps}fps_seed${req.seed}_${stamp()}`;
      try {
        sink = await openRenderSink(`${base}.${format.ext}`, format, !!req.test?.keepInMemory);
      } catch {
        return set({ phase: 'cancelled', message: 'No file chosen: nothing was rendered.' });
      }
      if (req.test?.keepInMemory && sink.kind === 'memory') {
        // The checks read the bytes back rather than downloading them.
        const inner = sink;
        sink = { ...inner, close: async () => {} };
      }

      set({ message: 'Hearing the song…' });
      song = await decodeSong(req.song, 48000);
      const track = songAudioTrack(song.mono, song.sampleRate, req.fps, req.levels);
      const frames = Math.min(track.length, req.test?.maxFrames ?? Infinity);
      if (frames === 0) throw new Error('the song decoded to no samples');
      if (cancelled) throw new RenderCancelled();

      plate = hostRef.current.render();
      if (!plate) throw new Error('the plate is not up yet: wait for the picture, then render');
      restoreApp = hostRef.current.prepare();
      seedBefore = showSeed();
      setShowSeed(req.seed);
      beginFixedClock(req.fps);
      clockTaken = true;
      set({ frames, message: 'Laying the look…' });
      const laid = await plate.begin({ fps: req.fps, width: req.width, height: req.height });

      encoder = new RenderEncoder({
        format, width: req.width, height: req.height, fps: req.fps, sink,
        audio: req.test?.maxFrames ? { sampleRate: song.sampleRate, channels: song.channels.map((c) => c.subarray(0, Math.round((frames / req.fps) * song!.sampleRate))) } : song,
        hashFrames: !!req.test?.hashFrames,
      });
      set({ phase: 'audio', message: 'Encoding the sound…' });
      await encoder.encodeAudio();
      set({ phase: 'frames', message: `Rendering ${laid.lookId} on a ${laid.grid}² grid, ${laid.stepRate} steps a second` });

      const p = plate;
      const enc = encoder;
      let shown = performance.now();
      for (let i = 0; i < frames; i++) {
        if (cancelled) throw new RenderCancelled();
        flushSync(() => {
          if (i > 0) tickFixedClock();
          hostRef.current.setAudio(track[i]);
        });
        await enc.addFrame((ts, dur) => p.step(track[i], ts, dur));
        await p.settle();
        const now = performance.now();
        if (now - shown > 250 || i === frames - 1) {
          shown = now;
          const rate = (i + 1) / Math.max(1e-3, elapsed());
          set({ frame: i + 1, remainingS: (frames - i - 1) / rate });
        }
      }
      set({ phase: 'finishing', message: 'Finishing the file…' });
      const summary = await enc.finish();
      return set({
        phase: 'done', summary, frame: frames, remainingS: 0,
        frameHashes: req.test?.hashFrames ? enc.frameHashes.slice() : null,
        bytes: req.test?.keepInMemory ? sink.bytes?.() ?? null : null,
        message: `Rendered ${frames} frames (${(summary.durationMs / 1000).toFixed(1)} s) in ${Math.round(elapsed())} s: ${(summary.bytes / 1e6).toFixed(1)} MB of ${format.label}.`,
      });
    } catch (e) {
      if (e instanceof RenderCancelled || cancelled) {
        await encoder?.cancel();
        if (!encoder) await sink?.abort();
        return set({ phase: 'cancelled', message: 'Cancelled: the partial file was thrown away.' });
      }
      await encoder?.cancel();
      if (!encoder) await sink?.abort();
      console.error('ChromaGlass: the render failed', e);
      return set({ phase: 'failed', message: `The render failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      // The clock first, so the plate's stamps are reset onto real time.
      if (clockTaken) endFixedClock();
      // Tonight's seed back: the panel and `?seed=` still name the show that was running.
      if (seedBefore !== null) setShowSeed(seedBefore);
      plate?.end();
      hostRef.current.setAudio(null);
      restoreApp?.();
      cancelRef.current = null;
    }
  }, []);

  return { state, running, start, cancel, reset, support: renderSupport() };
}
