import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { SceneReading } from '../lib/sceneSense';
import { VideoSampler } from '../lib/videoSense';

/**
 * The film, read back.
 *
 * The film projector has always been a *slide*: a loop, a camera or a captured
 * window shown through the dye, contributing light and nothing else. The room
 * camera has been read back as a sensor since it was built. This is the same
 * treatment for the film, and it is almost entirely the same code — the
 * analysis is a pure function over a pixel buffer and `videoSense` owns the
 * crop, so what is left here is a clock and a source.
 *
 * Three differences from the room, all of them deliberate:
 *
 *   - **No people.** The tracker is for a room with dancers in it, and on a
 *     film it would report a face in close-up as a person standing still and
 *     press the plate with it. Skipping it is also a third cheaper, which
 *     matters because this runs alongside the room's own sensor.
 *   - **No mirror.** A camera facing the audience sees the room the wrong way
 *     round; a film is already the way round it was shot.
 *   - **It stops when the film does.** A paused loop is a still frame, and a
 *     still frame analysed twenty times a second is twenty readings of nothing
 *     at a real cost. The tick reads `paused` and skips.
 *
 * Nothing is opened here. The video element belongs to the visualizer — it is
 * the same one being drawn to the plate — and this only ever reads it, so a
 * film that is showing is a film that can drive and there is no second source
 * to keep in step.
 */

export interface FilmSenseOptions {
  /** False unloads everything: no canvas, no timer, no reading. */
  enabled: boolean;
  /** The visualizer's own film video, or null when nothing is loaded. */
  getVideo: () => HTMLVideoElement | null;
  /** Motion below this is grain and compression, not the film. 0..1. */
  deadzone: number;
  /** How much the flow lattice is smoothed in time. */
  smooth: number;
  hz?: number;
}

export interface FilmSenseState {
  /** True once two frames have been analysed. */
  reading: boolean;
  /** Motion as the film's own recent range makes it, 0..1 — the meter. */
  energy: number;
  /** Milliseconds the last analysis took. */
  ms: number;
}

const IDLE: FilmSenseState = { reading: false, energy: 0, ms: 0 };

/** A film rarely beats 24-30 fps, and the plate cannot use more than this. */
const DEFAULT_HZ = 20;

export function useFilmSense(opts: FilmSenseOptions): {
  reading: MutableRefObject<SceneReading | null>;
  state: FilmSenseState;
} {
  const reading = useRef<SceneReading | null>(null);
  const [state, setState] = useState<FilmSenseState>(IDLE);

  const optsRef = useRef(opts);
  optsRef.current = opts;

  const { enabled, hz = DEFAULT_HZ } = opts;

  useEffect(() => {
    if (!enabled) {
      reading.current = null;
      setState(IDLE);
      return;
    }
    const sampler = new VideoSampler();
    let last = performance.now();
    let uiAt = 0;
    /** Which element the sampler has been learning, so a new film forgets the old. */
    let learning: HTMLVideoElement | null = null;

    const tick = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      const o = optsRef.current;
      const v = o.getVideo();
      if (!v) {
        // The film was switched off. Hold nothing rather than the last thing
        // it saw: a stale reading would go on stirring a plate that has no
        // film on it at all.
        if (reading.current) { reading.current = null; setState(IDLE); }
        learning = null;
        return;
      }
      if (v !== learning) { sampler.reset(); learning = v; }
      // A paused loop is a still frame. Analysing it says "nothing is moving",
      // which is true and costs a millisecond twenty times a second to say.
      if (v.paused && v.readyState >= 2) return;

      const got = sampler.sample(v, dt, now, {
        deadzone: o.deadzone,
        smooth: o.smooth,
        people: false,
        mirror: false,
      });
      if (!got) return;
      const r = got.reading;
      reading.current = r.ready ? r : null;

      if (now - uiAt > 150) {
        uiAt = now;
        setState(s => (s.reading === r.ready && s.energy === r.energy && s.ms === r.ms
          ? s
          : { reading: r.ready, energy: r.energy, ms: r.ms }));
      }
    };

    const timer = setInterval(tick, Math.max(20, Math.round(1000 / Math.max(1, hz))));
    return () => {
      clearInterval(timer);
      reading.current = null;
    };
  }, [enabled, hz]);

  return { reading, state };
}
