/**
 * Bind groups and texture views that are made once and found again, for the
 * passes that draw a frame (PLAN.md 14ab-5).
 *
 * The solver has kept its bind groups since H2c-11 (`groupAt` in `fluid.ts`),
 * but the passes after it did not: every frame the plate's pack, derive and
 * display, the camera, the post chain's three or four passes, the projector,
 * the particles' and the air's splats and the ferrofluid drop's relaxation
 * each called `createBindGroup` again, over a `createView()` for every texture
 * they bind. Read in the code on 2026-10-24 that was 10 to 20 bind groups and
 * 40 to 60 views a frame, all of them the same as the frame before's: the
 * textures only change when a size, a rung or a layer does. Each is a call
 * into the GPU process and a wrapper object for the collector, sixty times a
 * second, for nothing.
 *
 * Why a walk down `WeakMap`s keyed by the objects bound, rather than a group
 * kept in a field of each pass. A field has to be told when to forget: every
 * `ensure` that makes a texture again, every ping-pong flip (the dye a frame
 * reads is one of two, and which depends on how many steps it took), every
 * rung change that hands the plate a new solver. Missing one is a frame drawn
 * from a destroyed texture, which on WebGPU is a validation error and a black
 * plate. Keyed by the objects themselves there is nothing to forget: a new
 * texture is a new key and finds no group, and a texture let go is a key the
 * collector takes, and with it every group that bound it. The ping-pong pair
 * is two keys, and two groups, found again on every frame after.
 *
 * Why the walk is rooted at the pipeline and not its layout: a pipeline made
 * with `layout: 'auto'` hands out a new layout object on every
 * `getBindGroupLayout`, so a layout would never be found again. The pipeline
 * is the cache's own (`PipelineCache`) and lives as long as the device.
 *
 * What it does not keep: a view made with a descriptor other than the two
 * named here (the post chain's ring makes a view of each of its layers when
 * it makes the ring, `ringLayers`), and a buffer bound at an offset. Nothing that draws a frame
 * binds either today; one that does should add its key here rather than go
 * around it.
 */

export type Bound = GPUBuffer | GPUTexture | GPUTextureView | GPUSampler;

/** One step of the walk: the group found here, and where each next object leads. */
type Node = { kids: WeakMap<object, Node>; group?: GPUBindGroup };

const roots = new WeakMap<GPUComputePipeline | GPURenderPipeline, Node[]>();

/**
 * For the check (`npm run framegroups`) and nothing else. `fresh` makes every
 * group and view again, as before 14ab-5, so the check can show its counting
 * sees them; `blind` keys a group by its pipeline alone, so the check can show
 * a cache that served the wrong textures would draw a different picture.
 */
export const groupCacheTest = { fresh: false, blind: false };

/** A view of `tex`: its default view, or the whole of a stack of layers (`'array'`). */
export function viewOf(tex: GPUTexture, layer: 'default' | 'array' = 'default'): GPUTextureView {
  if (groupCacheTest.fresh) return makeView(tex, layer);
  let views = viewsOf.get(tex);
  if (!views) { views = new Map(); viewsOf.set(tex, views); }
  let v = views.get(layer);
  if (!v) { v = makeView(tex, layer); views.set(layer, v); }
  return v;
}

const viewsOf = new WeakMap<GPUTexture, Map<'default' | 'array', GPUTextureView>>();

function makeView(tex: GPUTexture, layer: 'default' | 'array'): GPUTextureView {
  return layer === 'array' ? tex.createView({ dimension: '2d-array' }) : tex.createView();
}

/**
 * The bind group for `pipeline`'s group `index` binding `resources` in binding
 * order (a texture as its default view), made the first time it is asked for.
 */
export function groupOf(
  device: GPUDevice,
  pipeline: GPUComputePipeline | GPURenderPipeline,
  resources: readonly Bound[],
  index = 0,
): GPUBindGroup {
  if (groupCacheTest.fresh) return make(device, pipeline, resources, index);
  let byIndex = roots.get(pipeline);
  if (!byIndex) { byIndex = []; roots.set(pipeline, byIndex); }
  let at = byIndex[index] ??= { kids: new WeakMap() };
  if (!groupCacheTest.blind) {
    for (const r of resources) {
      let n = at.kids.get(r);
      if (!n) { n = { kids: new WeakMap() }; at.kids.set(r, n); }
      at = n;
    }
  }
  return at.group ??= make(device, pipeline, resources, index);
}

function make(device: GPUDevice, pipeline: GPUComputePipeline | GPURenderPipeline, resources: readonly Bound[], index: number): GPUBindGroup {
  return device.createBindGroup({
    layout: pipeline.getBindGroupLayout(index),
    entries: resources.map((r, binding) => ({
      binding,
      resource: r instanceof GPUBuffer ? { buffer: r } : r instanceof GPUTexture ? viewOf(r) : r,
    })),
  });
}
