/**
 * A video element, reduced to a reading.
 *
 * `sceneSense` is arithmetic over a pixel buffer and knows nothing about where
 * the pixels came from — which is what makes this possible at all. What the
 * room camera's hook did around it, though, was not reusable: the square crop,
 * the mirror, the small canvas and the read-back all lived inline in the one
 * hook that owned a camera, so the film projector's video — a file, a capture
 * card, another window — could be shown through the dye and never read.
 *
 * So the middle of it lives here. One sampler per source, each with its own
 * `SceneSense` (they learn different backgrounds and different ranges, and
 * sharing one would mean a cut in the film looked like the room lurching).
 *
 * The square crop is the part worth keeping in one place. The fluid grid is
 * square, so taking the middle square of the source means a movement travels
 * across the plate at the speed it travelled across the frame instead of being
 * stretched by whatever aspect the source happens to have — and a film is
 * 16:9, or 4:3, or 2.39:1, which is exactly the case that would have been got
 * wrong by writing it a second time.
 */

import { SceneSense, type SceneReading, type SceneSenseOptions } from './sceneSense';

/** The analysis frame's edge. 96² is 9,216 pixels — a millisecond of work. */
export const SENSE_FRAME = 96;

export interface SampleOptions extends SceneSenseOptions {
  /** Flip left for right. A camera facing the audience sees the room mirrored. */
  mirror?: boolean;
}

export class VideoSampler {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly sense = new SceneSense();
  readonly frame: number;

  constructor(frame = SENSE_FRAME) {
    this.frame = frame;
    this.canvas = document.createElement('canvas');
    this.canvas.width = frame;
    this.canvas.height = frame;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  /** Forget the source: a new camera, a new film, a new venue. */
  reset(): void {
    this.sense.reset();
  }

  /**
   * One frame in, a reading out — plus the pixels, because the room's panel
   * draws the sensor's own view for aiming a camera and would otherwise have
   * to grab the frame a second time.
   *
   * Null when there is nothing to read yet: no 2D context, or a video that has
   * not decoded a frame. A caller must not treat that as "nothing is moving".
   */
  sample(
    video: HTMLVideoElement,
    dt: number,
    now: number,
    opts: SampleOptions,
  ): { reading: SceneReading; pixels: ImageData } | null {
    const ctx = this.ctx;
    if (!ctx || video.readyState < 2 || video.videoWidth === 0) return null;
    const n = this.frame;

    const side = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - side) / 2;
    const sy = (video.videoHeight - side) / 2;
    ctx.save();
    if (opts.mirror) { ctx.translate(n, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, sx, sy, side, side, 0, 0, n, n);
    ctx.restore();

    const pixels = ctx.getImageData(0, 0, n, n);
    const reading = this.sense.push(pixels.data, n, n, dt, now, {
      deadzone: opts.deadzone,
      smooth: opts.smooth,
      people: opts.people,
    });
    return { reading, pixels };
  }
}
