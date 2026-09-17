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
 * canvas, already drawn — into a 16x16 texture with the driver's own linear
 * reduction. There is no shader, no full-screen quad, and nothing upstream has
 * to be rearranged to render into a texture first, which is what makes this
 * work whether or not the projector's output pass exists.
 *
 * **No stall.** The read goes into a pixel pack buffer behind a fence and is
 * collected a frame or two later, the same way the fluid solver reads its own
 * field back. One frame of latency on a measurement of how bright things have
 * been over the last second does not matter.
 *
 * 16x16 is a coarse sample of a 4K frame, which for a *mean* over a smooth
 * liquid image is plenty: the question is "is the whole field swinging", not
 * "what is in the corner".
 */

/** The grid the frame is reduced to. 256 pixels, 1 KB a read. */
const N = 16;

export class FrameProbe {
  private readonly fbo: WebGLFramebuffer;
  private readonly tex: WebGLTexture;
  private readonly slots: { pbo: WebGLBuffer; fence: WebGLSync | null; seq: number }[];
  /** Which read each slot holds, so the newest one that has landed is the one kept. */
  private seq = 0;
  private readonly pixels = new Uint8Array(N * N * 4);
  /** The last mean that came back, 0..1. */
  private lum = 0;
  private everRead = false;
  readonly ok: boolean;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.tex = gl.createTexture()!;
    // Unit 12, above everything the plate, camera and output passes bind.
    gl.activeTexture(gl.TEXTURE0 + 12);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.activeTexture(gl.TEXTURE0);

    this.fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.slots = [0, 1].map(() => ({ pbo: gl.createBuffer()!, fence: null, seq: 0 }));
    for (const s of this.slots) {
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, s.pbo);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, this.pixels.byteLength, gl.STREAM_READ);
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.ok = complete;
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
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.pixels);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      gl.deleteSync(s.fence);
      s.fence = null;
      let sum = 0;
      for (let i = 0; i < N * N; i++) {
        sum += 0.2126 * this.pixels[i * 4] + 0.7152 * this.pixels[i * 4 + 1] + 0.0722 * this.pixels[i * 4 + 2];
      }
      this.lum = sum / (N * N * 255);
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

    // The canvas, reduced to 16x16 by the driver.
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbo);
    gl.blitFramebuffer(0, 0, width, height, 0, 0, N, N, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbo);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, free.pbo);
    gl.readPixels(0, 0, N, N, gl.RGBA, gl.UNSIGNED_BYTE, 0);
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
    gl.deleteTexture(this.tex);
  }
}
