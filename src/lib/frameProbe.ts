/**
 * How bright was the frame that just went to the wall?
 *
 * The flash guard needs the *delivered* luminance — after the plate pass, the
 * camera, the projector's grade, the dimmer and the guard's own correction —
 * because anything measured earlier would be a guess about what the audience
 * sees, and because a guard fed its own uncorrected input would keep pulling
 * harder against a flash it had already flattened.
 *
 * Two things make this cheap enough to do every frame.
 *
 * **No extra pass.** `blitFramebuffer` copies the default framebuffer — the
 * canvas, already drawn — into a texture at half size with the driver's own
 * linear filter, and `generateMipmap` reduces that to a few hundred texels.
 * There is no shader, no full-screen quad, and nothing upstream has to be
 * rearranged to render into a texture first, which is what makes this work
 * whether or not the projector's output pass exists.
 *
 * **An average, not a sample.** A linear blit straight down to 16x16 — how
 * this used to work — reads one 2x2 spot for each of its 256 texels, so a
 * bright patch that fell between the spots counted for nothing, and one that
 * landed on a spot counted for far more than its size. At exactly half size a
 * linear blit *is* a 2x2 mean. The half-size copy then sits in the corner of
 * a black power-of-two square, because mipmaps are an exact 2x2 mean only on
 * power-of-two sizes: on others the driver samples at scaled centres, and a
 * one-pixel line read 7.7 times its size on Metal. The level read back is a
 * true area average, scaled back up by how much of the square is padding, so
 * a flash counts in proportion to how much of the wall it covers.
 *
 * **No stall.** The read goes into a pixel pack buffer behind a fence and is
 * collected a frame or two later, the same way the fluid solver reads its own
 * field back. One frame of latency on a measurement of how bright things have
 * been over the last second does not matter.
 */

import { UNIT } from './textureUnits';

/** The level read back is the first whose longer side is at most this: 480 texels at 16:9, 4 KB at most a read. */
const TARGET = 32;

export class FrameProbe {
  /** Draws the half-size copy into the texture's level 0. */
  private readonly fbo: WebGLFramebuffer;
  /** Reads the small level back. */
  private readonly readFbo: WebGLFramebuffer;
  private tex: WebGLTexture | null = null;
  /** The half-size copy, and the level read back from it. */
  private w = 0;
  private h = 0;
  private level = 0;
  private lw = 0;
  private lh = 0;
  /** The padded square's area over the picture's: what a mean over the square is multiplied by. */
  private scale = 1;
  private readonly slots: { pbo: WebGLBuffer; fence: WebGLSync | null; seq: number; lw: number; lh: number; scale: number }[];
  /** Which read each slot holds, so the newest one that has landed is the one kept. */
  private seq = 0;
  private readonly pixels = new Uint8Array(TARGET * TARGET * 4);
  /** The last mean that came back, 0..1. */
  private lum = 0;
  private everRead = false;
  readonly ok: boolean;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.fbo = gl.createFramebuffer()!;
    this.readFbo = gl.createFramebuffer()!;
    this.slots = [0, 1].map(() => ({ pbo: gl.createBuffer()!, fence: null, seq: 0, lw: 0, lh: 0, scale: 1 }));
    for (const s of this.slots) {
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, s.pbo);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, this.pixels.byteLength, gl.STREAM_READ);
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.ok = true;
  }

  /** The half-size copy and its mips, for a canvas this size. False if the copy cannot be drawn into. */
  private ensure(width: number, height: number): boolean {
    const w = Math.max(1, width >> 1), h = Math.max(1, height >> 1);
    if (w === this.w && h === this.h && this.tex) return true;
    const gl = this.gl;
    // Immutable storage cannot be resized: a new texture for a new size.
    if (this.tex) gl.deleteTexture(this.tex);
    this.tex = gl.createTexture()!;
    // Its own unit (see textureUnits.ts); it was 12, a pigment-coordinate unit.
    gl.activeTexture(gl.TEXTURE0 + UNIT.probe);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    const size = Math.max(TARGET, 2 ** Math.ceil(Math.log2(Math.max(w, h))));
    gl.texStorage2D(gl.TEXTURE_2D, Math.log2(size) + 1, gl.RGBA8, size, size);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.activeTexture(gl.TEXTURE0);
    this.level = Math.log2(size / TARGET);
    this.lw = this.lh = TARGET;
    this.scale = (size * size) / (w * h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if (complete) {
      // The padding is black, once: the copy only ever writes its own corner.
      const clear = gl.getParameter(gl.COLOR_CLEAR_VALUE) as Float32Array;
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.readFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, this.level);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.w = w;
    this.h = h;
    return complete;
  }

  /** Copy the canvas down and reduce it; the small level is then ready to read on readFbo. */
  private reduce(width: number, height: number): boolean {
    if (!this.ensure(width, height)) return false;
    const gl = this.gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbo);
    // An even source, so the halving is exact (an odd last row or column is left out).
    gl.blitFramebuffer(0, 0, this.w * 2, this.h * 2, 0, 0, this.w, this.h, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0 + UNIT.probe);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.activeTexture(gl.TEXTURE0);
    return true;
  }

  private meanOf(px: Uint8Array, lw: number, lh: number, scale: number): number {
    let sum = 0;
    for (let i = 0; i < lw * lh; i++) sum += 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];
    return Math.min(1, (sum / (lw * lh * 255)) * scale);
  }

  /**
   * The canvas's mean luminance right now, read synchronously. A stall: for
   * the harness's check of the reduction, never the render loop.
   */
  measureNow(width: number, height: number): number | null {
    if (!this.reduce(width, height)) return null;
    const gl = this.gl;
    const px = new Uint8Array(this.lw * this.lh * 4);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.readFbo);
    gl.readPixels(0, 0, this.lw, this.lh, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    return this.meanOf(px, this.lw, this.lh, this.scale);
  }

  /** The most recent delivered mean luminance, or null before the first read lands. */
  get luminance(): number | null {
    return this.everRead ? this.lum : null;
  }

  /**
   * Start a read of the frame on screen, and collect an earlier one if the GPU
   * has finished with it. Call after everything has been drawn, while the
   * default framebuffer still holds this frame.
   */
  measure(width: number, height: number): void {
    if (!this.ok || width <= 0 || height <= 0) return;
    const gl = this.gl;

    // Collect anything the GPU has finished with, first — in the order the
    // reads were issued, not the order the slots happen to sit in. Both can
    // land in the same frame after a stall, and draining them by slot index
    // would leave `lum` holding the *older* of the two: a reading that goes
    // backwards in time, which to a guard counting peaks and troughs is a
    // flash that never happened.
    for (const s of [...this.slots].sort((a, b) => a.seq - b.seq)) {
      if (!s.fence) continue;
      const status = gl.clientWaitSync(s.fence, 0, 0);
      if (status !== gl.ALREADY_SIGNALED && status !== gl.CONDITION_SATISFIED) continue;
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, s.pbo);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.pixels, 0, s.lw * s.lh * 4);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      gl.deleteSync(s.fence);
      s.fence = null;
      this.lum = this.meanOf(this.pixels, s.lw, s.lh, s.scale);
      this.everRead = true;
    }

    // Then start a new read, but only into a buffer nobody is waiting on.
    //
    // Writing into a slot whose last read has not come back yet throws that
    // read away — and the driver says so, loudly, once a frame: "READ-usage
    // buffer was written, then fenced, but written again before being read
    // back". On a machine where the reads lag (which is every machine where
    // the frames are expensive, so exactly the ones that matter) that was most
    // of them. Skipping a frame costs nothing: this is a question about the
    // last second, not about this frame in particular.
    const free = this.slots.find(s => !s.fence);
    if (!free) return;

    // The canvas, halved by the driver and averaged down its mips.
    if (!this.reduce(width, height)) return;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.readFbo);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, free.pbo);
    gl.readPixels(0, 0, this.lw, this.lh, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    free.lw = this.lw;
    free.lh = this.lh;
    free.scale = this.scale;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    free.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    free.seq = ++this.seq;
    // A fence is not guaranteed ever to signal unless the commands before it
    // have been flushed, so without this the read can simply never land — and
    // a guard that never gets a reading is a guard that silently does nothing.
    gl.flush();
  }

  dispose(): void {
    const gl = this.gl;
    for (const s of this.slots) {
      if (s.fence) gl.deleteSync(s.fence);
      gl.deleteBuffer(s.pbo);
    }
    gl.deleteFramebuffer(this.fbo);
    gl.deleteFramebuffer(this.readFbo);
    if (this.tex) gl.deleteTexture(this.tex);
  }
}
