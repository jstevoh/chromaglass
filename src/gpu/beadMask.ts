/**
 * The oil beads' mask, drawn on the GPU into the picture the plate reads
 * (PLAN.md 14ab-6; the kernels are wgsl/beadMask.ts, the list they read
 * lib/beadPack.ts, and why it moved is told there).
 *
 * The plate owns one. On a frame the beads moved the page hands the field
 * over (`WebGPUPlate.setBeads`): the list is written into buffers there and
 * then, and the passes run at the head of the plate's next draw, in the same
 * encoder, so the display that samples the mask reads this frame's.
 *
 * The drops' passes keep a state buffer per pixel (the owner, the hole flag,
 * the two halves' colours as bytes) and a second to fill the holes from, 4 MB
 * each at 512²; made the first time drops are drawn and kept, as the plate
 * keeps its other targets. The rings need neither.
 */
import { Disposer, PipelineCache } from './kit';
import { groupOf } from './groupCache';
import { BEAD_KERNELS } from './wgsl/beadMask';
import { BEAD_FLOATS, BeadPacker, type BeadPack } from '../lib/beadPack';
import type { BeadField } from '../lib/beads';

/** A storage buffer that grows to what it is asked to hold (never shrinks: a show's bead count comes and goes). */
class Grown {
  buffer: GPUBuffer | null = null;
  constructor(private readonly device: GPUDevice, private readonly disposer: Disposer, private readonly label: string) {}
  write(data: ArrayBufferView & { buffer: ArrayBufferLike }, bytes: number): GPUBuffer {
    // Never empty: a binding has to have something behind it.
    const need = Math.max(16, Math.ceil(bytes / 16) * 16);
    if (!this.buffer || this.buffer.size < need) {
      if (this.buffer) this.disposer.release(this.buffer);
      this.buffer = this.disposer.track(this.device.createBuffer({
        label: this.label, size: Math.max(need, (this.buffer?.size ?? 0) * 2),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }));
    }
    if (bytes > 0) this.device.queue.writeBuffer(this.buffer, 0, data.buffer, data.byteOffset, Math.ceil(bytes / 4) * 4);
    return this.buffer;
  }
}

export class BeadMask {
  private readonly packer = new BeadPacker();
  private readonly args: GPUBuffer;
  private readonly beads: Grown;
  private readonly cuts: Grown;
  private readonly tiles: Grown;
  private state: [GPUBuffer, GPUBuffer] | null = null;
  private stateSize = 0;
  /** The pack waiting for the next draw, and its size as a picture. */
  private due: BeadPack | null = null;
  /** The last pack's bytes across, for `npm run beadmask`. */
  bytes = 0;

  constructor(private readonly device: GPUDevice, private readonly pipelines: PipelineCache, private readonly disposer: Disposer) {
    this.args = disposer.track(device.createBuffer({ label: 'bead args', size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
    this.beads = new Grown(device, disposer, 'bead list');
    this.cuts = new Grown(device, disposer, 'bead walls');
    this.tiles = new Grown(device, disposer, 'bead tiles');
  }

  /** The kernels, built before they are first needed (the plate's opening, `WebGPUPlate.prepare`). */
  static prepare(cache: PipelineCache) {
    return Object.entries(BEAD_KERNELS).map(([name, code]) => cache.computePrep(name, code));
  }

  /**
   * The field's beads written across for the next draw. Returns the mask's
   * size, which the plate makes its texture at: square for rings, twice as
   * wide for drops, as `BeadField.render` draws them.
   */
  set(field: BeadField): [number, number] {
    const p = this.packer.packBeads(field.beads, field.grid, field.size, field.drops);
    const words = new Uint32Array(4);
    words[0] = p.S; words[1] = p.nTiles; words[2] = p.wide ? 1 : 0;
    new Float32Array(words.buffer)[3] = p.amount;
    this.device.queue.writeBuffer(this.args, 0, words);
    this.beads.write(p.beads, p.n * BEAD_FLOATS * 4);
    this.tiles.write(p.tiles, p.tileWords * 4);
    if (p.wide) this.cuts.write(p.cuts, p.nCuts * 16);
    this.bytes = 16 + (p.n * BEAD_FLOATS + p.tileWords + (p.wide ? p.nCuts * 4 : 0)) * 4;
    this.due = p;
    return [p.wide ? p.S * 2 : p.S, p.S];
  }

  /** Whether a pack is waiting to be drawn. */
  get pending(): boolean { return this.due !== null; }

  /** Drop a pack not yet drawn (the plate was handed a picture for the beads instead). */
  cancel(): void { this.due = null; }

  /** Draw the waiting pack into `mask` (its size the one `set` gave). */
  draw(encoder: GPUCommandEncoder, mask: GPUTexture): void {
    const p = this.due;
    if (!p) return;
    this.due = null;
    const groups = Math.ceil(p.S / 8);
    const pipe = (name: keyof typeof BEAD_KERNELS) => this.pipelines.computePipeline(name, BEAD_KERNELS[name]);
    const pass = encoder.beginComputePass({ label: 'bead mask' });
    if (!p.wide) {
      const rings = pipe('beadRings');
      if (rings) {
        pass.setPipeline(rings);
        pass.setBindGroup(0, groupOf(this.device, rings, [this.args, this.beads.buffer!, this.tiles.buffer!, mask]));
        pass.dispatchWorkgroups(groups, groups);
      }
      pass.end();
      return;
    }
    if (!this.state || this.stateSize !== p.S) {
      if (this.state) for (const b of this.state) this.disposer.release(b);
      const make = (i: number) => this.disposer.track(this.device.createBuffer({ label: `bead state ${i}`, size: p.S * p.S * 16, usage: GPUBufferUsage.STORAGE }));
      this.state = [make(0), make(1)];
      this.stateSize = p.S;
    }
    const [a, b] = this.state;
    const drops = pipe('beadDrops'), holes = pipe('beadHoles'), finish = pipe('beadFinish');
    if (drops && holes && finish) {
      pass.setPipeline(drops);
      pass.setBindGroup(0, groupOf(this.device, drops, [this.args, this.beads.buffer!, this.tiles.buffer!, this.cuts.buffer!, a]));
      pass.dispatchWorkgroups(groups, groups);
      // Twice over, as rasterDrops: a to b, and back.
      pass.setPipeline(holes);
      pass.setBindGroup(0, groupOf(this.device, holes, [this.args, a, b]));
      pass.dispatchWorkgroups(groups, groups);
      pass.setBindGroup(0, groupOf(this.device, holes, [this.args, b, a]));
      pass.dispatchWorkgroups(groups, groups);
      pass.setPipeline(finish);
      pass.setBindGroup(0, groupOf(this.device, finish, [this.args, this.beads.buffer!, a, mask]));
      pass.dispatchWorkgroups(groups, groups);
    }
    pass.end();
  }
}
