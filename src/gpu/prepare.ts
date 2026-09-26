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
 * CI's Mac it did neither: the seventy-seven took 9.05 s, the same as the
 * forty-four had taken on the frame, and for 8.6 s of it the page had no
 * animation frame and its own timers did not fire either (`npm run startup`,
 * run 36253622675). Chromium was still compiling them in series, and a page
 * that had queued all of them waited behind all of them. Asked one at a
 * time, the page only ever waits behind one, so the starting frame keeps
 * being drawn between compiles and the page keeps answering; the whole
 * takes about as long as it did, which is the cost of a cold cache and not
 * something the order can buy back. The first step then finds every
 * pipeline it needs in the cache (`PipelineCache.prepare*`).
 *
 * What is built: everything the first steps of every look draw with, since
 * the show opens on a look picked at random (the second phase, the gel, the
 * mix, the particles and the film stock included, each some look's), and
 * the projector's pass, since a real show opens on a projector. Not the
 * harness's test effect, which no look uses. Anything else a show asks for
 * later is still built the first time it is asked for, and the ledger says
 * so. Why the lists live with their owners and not here: each is a statement
 * about what that file's frame draws with, and belongs next to the code that
 * draws. `npm run startup` holds them to it.
 */

import { WebGPUFluid } from './fluid';
import { WebGPUPlate } from './plate';
import { WebGPUFrameProbe } from './probe';
import { WebGPUAir } from './air';
import { WebGPUParticles } from './particles';
import { WebGPUCamera } from './camera';
import { WebGPUOutput } from './output';
import { PICTURE_FORMAT, WebGPUPostChain } from './post';
import { PipelineCache } from './kit';

/**
 * Long enough for the slowest cold start seen (nine seconds for the lot on a
 * CI Mac, nineteen in #162's film harness), with room; short enough that a
 * driver which never answers an async build does not hold the show on its
 * starting frame for good. Past it the show opens anyway and builds what is
 * left on the frame, as it always did.
 */
const PREPARE_TIMEOUT_MS = 30_000;

export interface Prepared {
  /** Pipelines asked for. */
  asked: number;
  /** Built and waiting in the cache (the rest are built on a frame). */
  ready: number;
  /** How long the show waited, in ms. */
  ms: number;
  /** Whether it stopped waiting at the timeout. */
  timedOut: boolean;
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

export async function prepareShow(device: GPUDevice, format: GPUTextureFormat, opts: { float32Filterable: boolean }): Promise<Prepared> {
  const t0 = performance.now();
  const before = PipelineCache.ledger().ahead;
  const builds = [
    ...WebGPUFluid.prepare(device, opts),
    ...WebGPUPlate.prepare(device, format, PICTURE_FORMAT),
    ...WebGPUFrameProbe.prepare(device),
    ...WebGPUAir.prepare(device),
    ...WebGPUParticles.prepare(device),
    ...WebGPUCamera.prepare(device, format),
    ...WebGPUOutput.prepare(device, format),
    ...WebGPUPostChain.prepare(device, format),
  ];
  // One at a time (above): the next is asked for only once the last is built.
  let timedOut = false;
  for (const build of builds) {
    const left = t0 + PREPARE_TIMEOUT_MS - performance.now();
    if (left <= 0 || !(await within(build(), left))) { timedOut = true; break; }
  }
  const done = { asked: builds.length, ready: PipelineCache.ledger().ahead - before, ms: Math.round(performance.now() - t0), timedOut };
  prepareLog.push(done);
  return done;
}
