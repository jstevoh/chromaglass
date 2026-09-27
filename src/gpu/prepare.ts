/**
 * The show's pipelines, built before it opens.
 *
 * What was reported: the opening of every show on a fresh Mac runner stopped
 * for about nine seconds, a few seconds after load, with no animation frame
 * and no loop heartbeat while the page's own timers kept firing (`npm run
 * depth`'s "from load" line: 9.30 s on run 36245105594, 8.58 s on
 * 36243996678). The solver had taken eight steps and then nothing.
 *
 * What it was: the first step asked for forty-four pipelines, one after
 * another, with `createComputePipeline` and `createRenderPipeline`. Those
 * returned at once, which is why the page kept running, but the GPU process
 * compiles each one before it gets to anything queued behind it, presenting
 * the next frame included; and a runner's Metal shader cache is cold, so
 * every one of them was a full compile. The owner's machine pays the same
 * the first time a deploy changes a shader.
 *
 * So they are asked for here instead, before the first step, with the async
 * calls, and one at a time. All at once was tried first, on the reading that
 * WebGPU lets an implementation compile an async build off the thread that
 * presents and a driver with several compiler threads would use them. On
 * CI's Mac it compiled them faster, seventy-seven in 9.05 s, 0.12 s each
 * against the old way's 0.22, but for 8.6 s of it the page had no animation
 * frame and its own timers did not fire either (`npm run startup`, run
 * 36253622675): a page that had queued all of them waited behind all of
 * them. Asked one at a time, the page only ever waits behind one, so the
 * starting frame keeps being drawn between compiles, at about thirty a
 * second, and the page keeps answering; each compile takes 0.23 s, as long
 * as on the frame (run 36255595521). The first step then finds every
 * pipeline it needs in the cache (`PipelineCache.prepare*`).
 *
 * Then, waited for, it was too much. One at a time, all eighty-seven took
 * 19.7 s on CI's Mac, and the plate sat on its starting frame until 23 s,
 * against the old way's first step at 4.3 s and a freeze to 14.2 s (run
 * 36255595521): the freeze was gone and the show opened later than the
 * freeze had ended. Most of the wait was for looks it was not opening on.
 * Every look opens on the same forty-three pipelines and adds at most
 * ten of its own; the union of all thirty-eight openings is seventy-
 * three, so waiting for every look's opening would have saved almost
 * nothing either. So the show waits for what its own look opens with (the
 * forty-three and what `gpu/opening.ts` says the look turns on) and builds
 * the rest behind it, still one at a time, once it is up. Behind the show a
 * compile should cost frames rather than stop them, as it did the starting
 * frame; `npm run startup` watches the first ten seconds of steps to see.
 *
 * What is built, in all: everything the first steps of every look draw
 * with, the projector's pass, since a real show opens on a projector, and
 * what a step can run a setting away. Not the harness's test effect, which
 * no look uses. Anything else a show asks for is still built the first time
 * it is asked for, and the ledger says so. Why the lists live with their
 * owners and not here: each is a statement about what that file's frame
 * draws with, and belongs next to the code that draws. `npm run startup`
 * holds them to it, and opens every look to hold the split to it too.
 */

import { WebGPUFluid } from './fluid';
import { WebGPUPlate } from './plate';
import { WebGPUFrameProbe } from './probe';
import { WebGPUAir } from './air';
import { WebGPUParticles } from './particles';
import { WebGPUCamera } from './camera';
import { WebGPUOutput } from './output';
import { PICTURE_FORMAT, WebGPUPostChain } from './post';
import { PipelineCache, type Prep } from './kit';
import type { Opening } from './opening';

/**
 * Long enough for the slowest cold start seen (nine seconds for the lot on a
 * CI Mac, nineteen in #162's film harness), with room; short enough that a
 * driver which never answers an async build does not hold the show on its
 * starting frame for good. Past it the show opens anyway and builds what is
 * left on the frame, as it always did.
 */
const PREPARE_TIMEOUT_MS = 30_000;

export interface Prepared {
  /** Which half: what the show waited for, or what was built behind it. */
  stage: 'opening' | 'later';
  /** Which device, as the ledger numbers them: a harness pairs the halves by it. */
  device: number;
  /** Pipelines asked for. */
  asked: number;
  /** In the cache when it was done (the rest are built on a frame). */
  ready: number;
  /** When it started, in ms from the page's load (`performance.now()`). */
  at: number;
  /** How long it took, in ms. */
  ms: number;
  /** Whether it stopped waiting at the timeout. */
  timedOut: boolean;
  /** What it asked for, by the ledger's `scope/name`. */
  keys: string[];
  /**
   * Each build as it went: its key, when it was asked for (ms from load) and
   * how long it took to settle. What `npm run startup` holds a stop against:
   * a stop that one build spans end to end is that build's.
   */
  builds: [key: string, at: number, ms: number][];
}

/**
 * Every prepare this page has run, the opening's first. The page's and not
 * the stage's, like the ledger: a device lost while its pipelines were
 * building starts the next device's prepare in a new stage, and a harness
 * asking the new stage for "the" prepare got nothing until that one ended.
 */
export const prepareLog: Prepared[] = [];

/** Whether `p` settles within `ms`. */
function within(p: Promise<void>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p.then(() => true),
    new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), ms); }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * `builds`, one at a time (above), until they are done, the device is gone or
 * PREPARE_TIMEOUT_MS has passed. A device lost part way would otherwise have
 * every remaining build refused one after another, each counted as a try.
 */
async function buildInTurn(device: GPUDevice, stage: Prepared['stage'], builds: Prep[]): Promise<Prepared> {
  const t0 = performance.now();
  let gone = false;
  void device.lost.then(() => { gone = true; });
  let timedOut = false;
  // Counted here and not off the ledger's page-wide count, which another
  // device's builds (a replacement's, mid-way) would add to.
  let ready = 0;
  const times: Prepared['builds'] = [];
  for (const prep of builds) {
    if (gone) break;
    const left = t0 + PREPARE_TIMEOUT_MS - performance.now();
    if (left <= 0) { timedOut = true; break; }
    const b0 = performance.now();
    const built = prep.build();
    const settled = await within(built.then(() => undefined), left);
    times.push([prep.key, Math.round(b0), Math.round(performance.now() - b0)]);
    if (!settled) { timedOut = true; break; }
    if (await built) ready++;
  }
  const done: Prepared = {
    stage, device: PipelineCache.deviceIndex(device), asked: builds.length, ready,
    at: Math.round(t0), ms: Math.round(performance.now() - t0), timedOut, keys: builds.map((b) => b.key), builds: times,
  };
  prepareLog.push(done);
  return done;
}

/*
  WebGPU's own pipelines, which no list of ours names. The browser builds a
  few pipelines of its own, inside the GPU process, the first time a page
  asks for what they do: turning a pass's timestamps into nanoseconds when a
  query set is resolved (every frame here, where the device has
  'timestamp-query': `GpuProfiler`), and drawing a page's picture into a
  texture for `copyExternalImageToTexture` (the beads' mask and the mark, on
  the frames they change). Neither goes through `createComputePipeline` or
  `createRenderPipeline`, so `npm run startup`'s count at WebGPU never saw
  them, and on a cold Metal cache each is a full compile on the frame.

  What was reported: `npm run startup` on CI's Mac found every opening
  stopping for 1.0 to 2.4 s a quarter second after the first step, over all
  thirty-seven runs since #164, and the three deploys of #177 to #179 went red
  on it against its 2 s limit while their PR runs passed at 1.3 to 1.5 s.
  Holding the pipelines built behind the show until it drew steadily moved
  them five seconds later and left the stop exactly where it was (2.07 s, no
  build of ours under way, run 36298506575): it is the show's own first
  frames. These two are what those frames ask the GPU for that nothing built
  ahead. Each is done here once on a scrap of a texture, in turn with the
  rest, and timed like them.
*/
function webgpuPrep(device: GPUDevice): Prep[] {
  const done = () => device.queue.onSubmittedWorkDone().then(() => true, () => false);
  const preps: Prep[] = [];
  if (device.features.has('timestamp-query')) {
    preps.push({
      key: 'webgpu/timestamps', later: false, build: async () => {
        try {
          const querySet = device.createQuerySet({ label: 'warm timestamps', type: 'timestamp', count: 2 });
          const buf = device.createBuffer({ label: 'warm timestamps', size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
          const enc = device.createCommandEncoder({ label: 'warm timestamps' });
          enc.beginComputePass({ timestampWrites: { querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } }).end();
          enc.resolveQuerySet(querySet, 0, 2, buf, 0);
          device.queue.submit([enc.finish()]);
          const ok = await done();
          querySet.destroy(); buf.destroy();
          return ok;
        } catch { return false; }
      },
    });
  }
  if (typeof OffscreenCanvas === 'function') {
    preps.push({
      key: 'webgpu/copyExternalImage', later: false, build: async () => {
        try {
          const source = new OffscreenCanvas(1, 1);
          source.getContext('2d')?.fillRect(0, 0, 1, 1);
          // The format and usage `WebGPUPlate.setSource` copies into.
          const texture = device.createTexture({
            label: 'warm copy', size: [1, 1], format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
          });
          device.queue.copyExternalImageToTexture({ source }, { texture }, [1, 1]);
          const ok = await done();
          texture.destroy();
          return ok;
        } catch { return false; }
      },
    });
  }
  return preps;
}

/**
 * Builds what the show opens with and returns when it is done; then goes on
 * building the rest behind the show, which is under way by then.
 */
export async function prepareShow(device: GPUDevice, format: GPUTextureFormat, opts: { float32Filterable: boolean }, open: Opening): Promise<Prepared> {
  const builds = [
    ...WebGPUFluid.prepare(device, opts, open),
    ...WebGPUPlate.prepare(device, format, PICTURE_FORMAT, open),
    ...WebGPUFrameProbe.prepare(device),
    ...WebGPUAir.prepare(device),
    ...WebGPUParticles.prepare(device, open),
    ...WebGPUCamera.prepare(device, format, open),
    ...WebGPUOutput.prepare(device, format),
    ...WebGPUPostChain.prepare(device, format, open),
    ...webgpuPrep(device),
  ];
  const opening = await buildInTurn(device, 'opening', builds.filter((b) => !b.later));
  // Nobody waits on it, so nobody would hear it fail: the builds cannot
  // throw, but reading the lists can (a kernel renamed under one).
  void buildInTurn(device, 'later', builds.filter((b) => b.later))
    .catch((err) => console.warn('ChromaGlass: the rest of the pipelines could not be built behind the show; the frame builds them.', err));
  return opening;
}
