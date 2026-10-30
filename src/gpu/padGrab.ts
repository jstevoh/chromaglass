/**
 * The remote's Draw picture, taken on the GPU (PLAN 8-draw-a).
 *
 * The pad shows the wall: a small copy of the frame the canvas just got,
 * sent over the relay as a JPEG (`lib/padPicture.ts`). It was taken the way
 * the projector window takes its copy, `drawImage` of the canvas into a 2D
 * canvas in the frame task, then a bitmap of that handed to a worker to
 * encode. On the Mac's show (CI, the app at 30 frames a second, three
 * pictures in flight) that came to 6.3 pictures a second painted: each round
 * trip took about 375 ms, eleven frames. The 2D canvas is the GPU's too, and
 * its readback for the encode waits behind the plate's own work in a queue
 * this page does not control.
 *
 * So it is read the way the flash probe reads the frame: on this device, in
 * the frame's own task, a frame or two behind. One small render pass samples
 * the canvas's texture down into a texture the picture's size, a copy puts
 * that in a mapped buffer, and the buffer lands when the GPU reaches it,
 * which is when the frame it was drawn after is done. The pixels go to the
 * worker as plain bytes and are encoded on the CPU there; nothing in the
 * encode goes back to the GPU.
 *
 * Why not copy the whole frame out and shrink it on the CPU: a 1280 by 720
 * frame is 3.7 MB a picture, fifteen a second, where the pad wants a
 * sixtieth of that. The pass costs four texture reads a pixel of a picture
 * at most 480 wide.
 */

import { Disposer, PipelineCache, bindGroup } from './kit';
import { PAD_PICTURE_IN_FLIGHT } from '../lib/padPicture';

/*
  Four bilinear taps a pixel, a quarter of a pixel either side of its
  centre: the frame is shrunk two to eight times, and one tap a pixel would
  pick a texel here and there and shimmer as the liquid moved under it. The
  picture's rows are the frame's rows from the top, as the canvas has them,
  so the pad paints it the right way up without a flip.
*/
const grabWgsl = (w: number, h: number) => /* wgsl */ `
@group(0) @binding(0) var frame: texture_2d<f32>;
@group(0) @binding(1) var soft: sampler;

struct V { @builtin(position) pos: vec4f };

@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  var o: V;
  o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0);
  return o;
}

@fragment fn fs(v: V) -> @location(0) vec4f {
  // The fragment's position is its pixel's centre, from the top left.
  let px = vec2f(${1 / w}, ${1 / h});
  let uv = v.pos.xy * px;
  let q = px * 0.25;
  var c = textureSampleLevel(frame, soft, uv + vec2f(-q.x, -q.y), 0.0);
  c += textureSampleLevel(frame, soft, uv + vec2f(q.x, -q.y), 0.0);
  c += textureSampleLevel(frame, soft, uv + vec2f(-q.x, q.y), 0.0);
  c += textureSampleLevel(frame, soft, uv + vec2f(q.x, q.y), 0.0);
  return vec4f(c.rgb * 0.25, 1.0);
}
`;

/** One picture being read: its texture, its buffer, and whether it is out. */
interface Slot { tex: GPUTexture; buf: GPUBuffer; w: number; h: number; row: number; busy: boolean }

export class WebGPUPadGrab {
  private readonly disposer = new Disposer();
  private readonly pipelines: PipelineCache;
  private readonly sampler: GPUSampler;
  private readonly slots: Slot[] = [];
  private disposed = false;

  constructor(readonly device: GPUDevice) {
    this.pipelines = PipelineCache.for(device, 'pad picture');
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  }

  /**
   * Shrink `frame` to `w` by `h` and read it back: RGBA rows from the top,
   * packed, or null when it cannot (every slot out, or the device gone). The
   * pass and the copy are queued now, behind the frame; the promise settles
   * when the GPU has done them.
   */
  grab(frame: GPUTexture, w: number, h: number): Promise<Uint8ClampedArray | null> | null {
    if (this.disposed) return null;
    // The pipeline is per size: the picture's size is a constant in the
    // shader, which keeps the pass to a vertex and a fragment stage and no
    // uniform to write. A pad asks for one width all night.
    const pipeline = this.pipelines.renderPipeline(`pad picture ${w}x${h}`, (module) => {
      const code = grabWgsl(w, h);
      return {
        layout: 'auto' as const,
        vertex: { module: module(code), entryPoint: 'vs' },
        fragment: { module: module(code), entryPoint: 'fs', targets: [{ format: 'rgba8unorm' as GPUTextureFormat }] },
        primitive: { topology: 'triangle-list' as GPUPrimitiveTopology },
      };
    });
    if (!pipeline) return null;
    const slot = this.slot(w, h);
    if (!slot) return null;
    const encoder = this.device.createCommandEncoder({ label: 'pad picture' });
    const pass = encoder.beginRenderPass({
      label: 'pad picture',
      colorAttachments: [{ view: slot.tex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup(this.device, pipeline, [frame.createView(), this.sampler]));
    pass.draw(3);
    pass.end();
    encoder.copyTextureToBuffer({ texture: slot.tex }, { buffer: slot.buf, bytesPerRow: slot.row }, [w, h]);
    this.device.queue.submit([encoder.finish()]);
    slot.busy = true;
    return slot.buf.mapAsync(GPUMapMode.READ).then(() => {
      try {
        const mapped = new Uint8Array(slot.buf.getMappedRange());
        const out = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) out.set(mapped.subarray(y * slot.row, y * slot.row + w * 4), y * w * 4);
        return out;
      } finally {
        try { slot.buf.unmap(); } catch { /* destroyed under it */ }
        slot.busy = false;
      }
    }, () => { slot.busy = false; return null; });
  }

  /**
   * A free slot of this size: one is reused, or made, up to as many as the
   * sender lets out at once. They are made only when every one is out, so a
   * fast show keeps one or two; a show starved to 14 frames a second, whose
   * reads land behind its own queued frames, needs most of the eight, and
   * at three it was the slots as much as the sender that held the pad to 6
   * pictures a second. Each is about 1.4 MB at the widest picture.
   */
  private slot(w: number, h: number): Slot | null {
    const free = this.slots.find(s => !s.busy && s.w === w && s.h === h);
    if (free) return free;
    // A slot of another size, free: the pad's frame changed shape. Let it go.
    const stale = this.slots.findIndex(s => !s.busy && (s.w !== w || s.h !== h));
    if (stale >= 0) {
      const [s] = this.slots.splice(stale, 1);
      s.tex.destroy();
      s.buf.destroy();
    }
    if (this.slots.length >= PAD_PICTURE_IN_FLIGHT) return null;
    const row = Math.ceil((w * 4) / 256) * 256;
    const s: Slot = {
      tex: this.device.createTexture({
        label: 'pad picture', size: [w, h], format: 'rgba8unorm',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      }),
      buf: this.device.createBuffer({ label: 'pad picture', size: row * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }),
      w, h, row, busy: false,
    };
    this.slots.push(s);
    return s;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const s of this.slots) { try { s.tex.destroy(); s.buf.destroy(); } catch { /* gone with the device */ } }
    this.slots.length = 0;
    this.disposer.dispose();
  }
}
