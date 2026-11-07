/**
 * One plate kept across frames, for the checks that ask what the plate does
 * on the frame after the last (`npm run framereads`, scripts/framereads-owed.mjs:
 * PLAN H2c-6, the aux target with the camera off, and H2c-9, the pack only
 * after a step).
 *
 * `lab.render` makes a fresh WebGPUPlate for every picture and disposes of it,
 * which is right for a look (no frame before it can leak into it) and wrong
 * for these two: what they ask about is what a plate that has already drawn
 * does on its next frame, whether it allocates a target it allocated before
 * and whether it packs fields it packed already. So this keeps one, draws it
 * as the app's frame does (the wall into a canvas-format texture, the
 * uniforms filled by the app's own `fillPlateUniforms`), and can draw the
 * same frame on a fresh plate as the control the kept one is compared with.
 *
 * Loaded by its check's own lab entry (scripts/framereads-entry.ts), not by
 * lab-entry.ts, which is past 40 KB and loaded by every lab check. The view
 * is the one `lab.render` fills, with its defaults and no camera rig:
 * nothing here turns the shot, the film or the beads, so the copy is the
 * few fields a PlateView must have.
 */
import { WebGPUPlate } from '../src/gpu/plate';
import { fillPlateUniforms, type PlateView } from '../src/gpu/plateUniforms';
import { DEFAULT_SETTINGS, type VisualizerSettings } from '../src/types';
import { CELL_TRAVEL } from '../src/lib/detailFlow';
import type { WebGPUFluid } from '../src/gpu/fluid';

type LabState = { solver: WebGPUFluid; N: number; time: number; cellClock: number; magnets: { x: number; y: number; height: number; strength: number }[] };

export type PlateFrameOptions = {
  /** The camera pass will draw this frame (`cameraOn` in the plate's uniforms, as the app fills it). */
  camera?: boolean;
  /**
   * Hand the plate the solver's count of writes to its fields with the
   * layer (`writes`, from `WebGPUFluid.fieldWrites`), as the app's frame
   * does once H2c-9 is built. Absent on main, where the count is undefined
   * and the plate packs every frame.
   */
  writes?: boolean;
  /** Read the wall back and return its pixels. */
  read?: boolean;
  /** Draw on a fresh plate made for this frame and disposed after it: the control. */
  fresh?: boolean;
};

export function plateFrames(get: () => LabState) {
  let kept: WebGPUPlate | null = null;
  const view = (l: LabState, settings: VisualizerSettings): PlateView => ({
    settings, time: l.time,
    shot: { cx: 0.5, cy: 0.5, zoom: 1 }, macroAmount: 0, isDarkBlend: false,
    flowRate: CELL_TRAVEL, cellClock: l.cellClock,
    rotations: [0, 0], harmony: [0, 1, 2, 3], lamp: { x: 0.5, y: 0.5, x2: 0.5, y2: 0.5 }, magnets: l.magnets, gelAngle: 0,
    kaleidoPhase: 0, layer1: { zoom: 1, dx: 0, dy: 0 }, bubbles: { count: 0, strength: 0 },
    bubblePack: { packed: new Float32Array(160), shape: new Float32Array(160) }, dimmerGain: 1,
    filmLevel: 0.05, filmGain: 3, mark: null, film: { kind: 'none', video: null },
  });
  const draw = async (plate: WebGPUPlate, size: number, o: PlateFrameOptions): Promise<number[] | null> => {
    const l = get();
    const device = l.solver['device'] as GPUDevice;
    fillPlateUniforms(plate.pack, {
      view: view(l, { ...DEFAULT_SETTINGS } as VisualizerSettings), fluids: [{ gpu: l.solver as never }],
      width: size, height: size, derived: true, grid: l.N, cameraOn: !!o.camera,
    });
    const s = l.solver as unknown as { fields: { dye: GPUTexture; view: GPUTexture; species: GPUTexture }; velForced: GPUTexture; fieldWrites?: number };
    const layer = {
      dye: s.fields.dye, velForced: s.velForced, grain: null, particles: null, air: null, view: s.fields.view, species: s.fields.species,
      ...(o.writes ? { writes: s.fieldWrites } : {}),
    };
    const target = device.createTexture({ label: 'plateframes wall', size: [size, size], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const enc = device.createCommandEncoder({ label: 'plateframes' });
    plate.draw(enc, target.createView(), { width: size, height: size }, [layer]);
    const row = Math.ceil(size * 4 / 256) * 256;
    const buf = o.read ? device.createBuffer({ size: row * size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }) : null;
    if (buf) enc.copyTextureToBuffer({ texture: target }, { buffer: buf, bytesPerRow: row }, [size, size]);
    device.queue.submit([enc.finish()]);
    let out: number[] | null = null;
    if (buf) {
      await buf.mapAsync(GPUMapMode.READ);
      const src = new Uint8Array(buf.getMappedRange());
      const px = new Uint8Array(size * size * 4);
      for (let y = 0; y < size; y++) px.set(src.subarray(y * row, y * row + size * 4), y * size * 4);
      buf.unmap(); buf.destroy();
      out = Array.from(px);
    } else {
      await device.queue.onSubmittedWorkDone();
    }
    target.destroy();
    return out;
  };
  const make = async () => {
    const plate = new WebGPUPlate(get().solver['device'] as GPUDevice, 'rgba8unorm');
    await plate.drop.prepare();
    return plate;
  };
  return {
    /** Draw one frame of `size`² on the kept plate (made on the first call), or on a fresh one with `fresh`. */
    async draw(size: number, o: PlateFrameOptions = {}): Promise<number[] | null> {
      if (o.fresh) {
        const plate = await make();
        try { return await draw(plate, size, o); } finally { plate.dispose(); }
      }
      kept ??= await make();
      return draw(kept, size, o);
    },
    /** The kept plate, for what it says about itself (`auxTarget`). */
    get plate(): WebGPUPlate | null { return kept; },
    /** Let the kept plate go: the next draw makes a new one. */
    dispose(): void { kept?.dispose(); kept = null; },
  };
}
