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
import { PipelineCache, type BuildTimes, type Prep } from './kit';
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
  /** What it asked for, by the ledger's `scope/name`, in the order it asked (any it never reached last). */
  keys: string[];
  /**
   * Each build as it went: its key, and the stretch of the opening's wall
   * time charged to it (from ms from load, for ms): one at a time, from its
   * ask to its settle; several at a time, from its ask or the last settle,
   * whichever was later, so the stretches never overlap (`buildInTurn`).
   * What `npm run startup` holds a stop against: a stop that one build spans
   * end to end is that build's.
   */
  builds: [key: string, at: number, ms: number][];
  /**
   * Each build from its own ask, overlaps and all, split in two: its key,
   * its ask in ms from load, the ms to its compile, and the ms from there to
   * its first use handed to the GPU (null where it had none; the GPU's own
   * time for all of them is `useWait`). Not wall time, as `builds`
   * is: with three in flight these add up to about three times the
   * opening. What it says is where a build's time goes, the compiler or the
   * first use, which `builds` cannot.
   */
  raw: [key: string, at: number, compile: number | null, use: number | null][];
  /**
   * The opening's one wait for the GPU to finish every first use it was
   * handed (`firstUse` in `gpu/kit.ts`), in ms, once the last compile is in;
   * null for the half behind the show, which has none. In `ms`, and in no
   * build's stretch of `builds`: it is the GPU's time, not a compile's.
   */
  useWait: number | null;
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
 * How many of the opening's builds are in flight at once. Three, and only
 * for the half the show waits for.
 *
 * What was reported: the show takes a long time to load. What was measured:
 * on CI's Mac, with the shader cache emptied, the plate sat black on its
 * starting frame until its first step at 12.15, 17.62 and 12.49 s (`npm run
 * startup`, runs 37166785182, 37166234101, 37165604455), and 11.46, 13.57
 * and 11.83 s of that was this file building the opening's fifty pipelines
 * one after another. The owner's machine pays the same, scaled to its
 * compiler, every time a deploy changes the shaders, which is most deploys.
 *
 * One at a time was chosen against all at once (above): all at once
 * compiled faster, 0.12 s a pipeline against 0.22, but the page waited
 * behind every queued compile and drew nothing for 8.6 s. A few at a time
 * sits between: the page waits behind at most that few, and the compiler
 * has the next one in hand while the GPU runs the last one's first use,
 * which one at a time left idle on every pipeline. (Since 2026-10-04 a
 * first use is not waited for in the lane at all, but once, at the end:
 * `firstUse` in `gpu/kit.ts`.)
 *
 * Two at a time, on the same Mac (run 37172629037): the fifty in 10.86 s.
 * The first of them, `fluid/fill`, sits under Chromium starting the GPU
 * whatever the count (2.5 to 3.7 s); the forty-nine after it took 7.17 s
 * against 8.93 and 9.17 s one at a time, a fifth less, and the longest
 * wait for a frame anywhere in the opening was 0.67 s, under the 2 s an
 * audience would see. Three is the next step toward all at once's 0.12 s,
 * still waiting behind no more than three compiles (about 0.7 s). The half
 * built behind the show stays one at a time: there a compile costs the
 * running show frames, and nobody is waiting.
 *
 * `?lanes=N` (1 to 8) changes it, from the query string alone, so a machine
 * can be timed both ways: `?lanes=1` is the old opening.
 */
const OPENING_LANES = (() => {
  let asked: number | null = null;
  try { asked = Number(new URLSearchParams(window.location.search).get('lanes') ?? NaN); } catch { /* no window */ }
  return asked !== null && Number.isInteger(asked) && asked >= 1 && asked <= 8 ? asked : 3;
})();

/**
 * `builds`, `lanes` at a time (above), until they are done, the device is
 * gone or PREPARE_TIMEOUT_MS has passed (in the opening, since it began;
 * behind the show, on any one build: see the lane). A device lost part way would
 * otherwise have every remaining build refused one after another, each
 * counted as a try.
 */
async function buildInTurn(device: GPUDevice, stage: Prepared['stage'], builds: Prep[], lanes = 1, quiet?: Quiet): Promise<Prepared> {
  const t0 = performance.now();
  let gone = false;
  void device.lost.then(() => { gone = true; });
  let timedOut = false;
  // Counted here and not off the ledger's page-wide count, which another
  // device's builds (a replacement's, mid-way) would add to.
  let ready = 0;
  const times: Prepared['builds'] = [];
  const raw: Prepared['raw'] = [];
  // Each lane takes the next build in the list when its last one settles, so
  // the order they are asked in is the list's, as it was with one, but for
  // the one render pipeline at a time (`renderBusy`, below).
  const queue = builds.slice();
  const asked: string[] = [];
  /*
    One render pipeline compiling at a time, the other lanes taking the
    compute kernels behind it in the meantime.

    What was reported: main's deploy of 5505a2a (run 37196539858) went red
    on startup 4b, the page's thread held from outside it for 4.98 s from
    0.96 s against a 4.5 s cap. What was measured, over the open shard's 30
    runs of 3-4 October: the hold begins at 0.92 to 1.07 s on every
    opening, before #249 and after (Chromium readying the page's GPU), and
    lasts until the GPU process is free. Before #249 the first thing asked
    was a compute kernel, and the hold ran 1.54 to 3.50 s. #249 asked for
    the render pipelines first, so three of them (the display, derive and
    the air's splat) compiled at once from about 0.5 s, and by their times
    they did not run beside each other but queued in the GPU process: each
    took 5.22 to 5.24 s on the red run, where the display alone had taken 1.03 to 2.49 s
    on every run before #249 and derive a few tenths. Chromium's hold
    waited behind them, 1.92 to 4.98 s on the seven runs since. So three
    render compiles at once bought nothing (they were served one after
    another anyway) and held the page for all three.
    The display is still asked for first, as #249 chose, for the reason it
    gave: it is the one compile of seconds, and asked last it ran alone
    while the other lanes stood idle.
  */
  let renderBusy: Promise<void> | null = null;
  // The page held still across the render compiles (`Quiet`, below): asked
  // once, before the first of them, and let go when the last has settled.
  let renderLeft = quiet ? builds.filter((b) => b.kind === 'render').length : 0;
  const take = (): Prep | undefined => {
    const i = renderBusy ? queue.findIndex((b) => b.kind !== 'render') : 0;
    return i < 0 ? undefined : queue.splice(i, 1)[0];
  };
  /*
    What each build is charged in `builds`: the opening's wall time from the
    later of its own ask and the last build to settle, to its own settle. One
    at a time that is exactly its ask to its settle, as it always was. Two at
    a time, the raw ask-to-settle stretches overlap, and `npm run startup`
    adds them up as the time the opening spent compiling (its 1b lines) and
    names a stop by the one build that spans it: summed raw, two lanes would
    read as twice the compile they took. Charged this way the stretches tile
    the wall time without overlapping, so the sum is the time the opening was
    compiling, whichever count of lanes ran.
  */
  let lastSettled = t0;
  const lane = async () => {
    while (queue.length && !gone && !timedOut) {
      /*
        The opening's half has the whole PREPARE_TIMEOUT_MS between them,
        because the show waits on its starting frame for all of them. The
        half behind the show has it for each build: nobody waits for that
        half, and what a cap on it is for is a driver that never answers,
        which one build that never settles shows as well as the list does.
        A cap on the whole list stopped building with pipelines still to
        build, and those are built on the frame when a look first draws with
        them, the freeze this file exists to take away, mid-show.

        What was measured: the half behind the show is fifty-odd builds one
        at a time beside a running show, and took 21.16 to 24.17 s on four
        of the open shard's runs of 4 October (`npm run startup`, "behind
        it in"), up from 18 to 23 s for the forty-nine before #249. On the
        fifth (run 37209299356, a PR that never touched the opening) it ran
        out of the thirty seconds with 52 of 54 built, its builds slower
        by a tenth of a second or so each, all through the same list (the flipped display
        asked at 38.35 s, against 30.17 to 33.86 s on the others), and
        startup's check of the half went red.
      */
      const left = stage === 'later' ? PREPARE_TIMEOUT_MS : t0 + PREPARE_TIMEOUT_MS - performance.now();
      if (left <= 0) { timedOut = true; break; }
      const prep = take();
      // Only render pipelines are left and one is compiling: wait for it.
      if (!prep) { await renderBusy; continue; }
      asked.push(prep.key);
      const b0 = performance.now();
      const stamps: BuildTimes = {};
      const built = prep.build(stamps);
      const waited = within(built.then(() => undefined), left);
      if (prep.kind === 'render') {
        renderBusy = waited.then(() => {
          renderBusy = null;
          if (quiet && --renderLeft === 0) quiet.go();
        });
      }
      const settled = await waited;
      const now = performance.now();
      const from = Math.max(b0, lastSettled);
      lastSettled = now;
      times.push([prep.key, Math.round(from), Math.round(now - from)]);
      const c = stamps.compiled;
      raw.push([prep.key, Math.round(b0), c == null ? null : Math.round(c - b0), c == null || stamps.used == null ? null : Math.round(stamps.used - c)]);
      if (!settled) { timedOut = true; break; }
      if (await built) ready++;
    }
  };
  /*
    Held still before any lane starts, not as a lane takes its first render
    pipeline: an await between \`take\` and \`renderBusy\` let all three lanes
    take a render pipeline while the first waited, and the opening asked for
    three at once (#283's first Mac run: \`air/air splat\` 3.32 s, under way
    through a 2.15 s frame gap). The render pipelines are asked first anyway.
  */
  if (renderLeft > 0) await quiet?.still().catch(() => undefined);
  await Promise.all(Array.from({ length: Math.max(1, Math.min(lanes, builds.length)) }, lane));
  // Gone, timed out or a build that never settled: never left held still.
  if (quiet && renderLeft > 0) quiet.go();
  /*
    The first uses, handed over as each compile came in and not waited for
    there (`firstUse` in `gpu/kit.ts` on why), waited for here, once, so
    the show still opens with them paid. Within what is left of the
    timeout, like the builds.
  */
  let useWait: number | null = null;
  if (stage === 'opening' && !gone) {
    const w0 = performance.now();
    const left = t0 + PREPARE_TIMEOUT_MS - w0;
    if (left <= 0 || !await within(device.queue.onSubmittedWorkDone().catch(() => undefined), left)) timedOut = true;
    useWait = Math.round(performance.now() - w0);
  }
  const done: Prepared = {
    stage, device: PipelineCache.deviceIndex(device), asked: builds.length, ready,
    at: Math.round(t0), ms: Math.round(performance.now() - t0), timedOut, keys: [...asked, ...queue.map((b) => b.key)], builds: times, raw, useWait,
  };
  prepareLog.push(done);
  return done;
}

/**
 * What the page holds still while the opening's render pipelines compile.
 *
 * What was reported: the first deploy with the intro over the opening
 * (`lib/intro.ts`, run 37233245217) went red on `npm run startup`'s "no
 * stop in the opening": no animation frame for 2.82 s from 3.15 s, the page
 * neither busy nor held. Its frames stopped exactly while `plate/display`
 * compiled (4.30 s from 2.71 s), and again for about 1.9 s while
 * `plate/derive` did (2.18 s from 7.03 s); through the compute kernels after
 * them they ran on. On every run before the intro the display's compile
 * stopped nothing (no frame gap over 0.62 s on #254's, the display 3.46 s):
 * the page drew nothing new then, and a frame with nothing new in it needs
 * nothing of the GPU process. The intro's turning burst is a new picture on
 * every frame, and on CI's Mac a frame that needs the GPU process waits
 * behind a render pipeline compiling there (inferred from the timings; a
 * compute kernel's compile does not hold it), and the next frame waits for
 * that one.
 *
 * So the intro holds still for those seconds: it would have frozen anyway,
 * and still, the page keeps its frames, and with them the desk answering a
 * press. `still` resolves once the page has drawn the still picture (a
 * frame or two), so the last moving frame is not left queued behind the
 * first compile; `go` lets it move again. Asked only in the opening, and
 * only while the intro is up (`introStill`).
 *
 * That caught the render compiles and not what comes before them: on a
 * cold Mac the GPU process is as busy starting the device, and the intro
 * moving through that stopped the frames as long (`lib/intro.ts` has the
 * runs). So the intro now starts still, from the first paint, and the
 * opening's `still` finds it so; `go` here is still what lets it move.
 */
export interface Quiet {
  still(): Promise<void>;
  go(): void;
}

/**
 * Builds what the show opens with and returns when it is done; then goes on
 * building the rest behind the show, which is under way by then.
 */
export async function prepareShow(device: GPUDevice, format: GPUTextureFormat, opts: { float32Filterable: boolean; quiet?: Quiet }, open: Opening): Promise<Prepared> {
  const builds = [
    ...WebGPUFluid.prepare(device, opts, open),
    ...WebGPUPlate.prepare(device, format, PICTURE_FORMAT, open),
    ...WebGPUFrameProbe.prepare(device),
    ...WebGPUAir.prepare(device),
    ...WebGPUParticles.prepare(device, open),
    ...WebGPUCamera.prepare(device, format, open),
    ...WebGPUOutput.prepare(device, format),
    ...WebGPUPostChain.prepare(device, format, open),
  ];
  /*
    The render pipelines first, the plate's display first of all (it heads
    its owner's list); the compute kernels after, in their owners' order.

    What was measured: with three in flight, the opening's fifty took from
    0.46 s to 9.23 s, and the last 1.34 s of it was the display alone, from
    7.89 s, with nothing else settling (`npm run startup`, run 37174580232,
    its "slowest ahead"). It is one compile of seconds (1.3 to 2.2 s cold on
    CI's Mac) among forty-nine of tenths, and it was asked for forty-fifth,
    once the solver's kernels had all been handed out, so the other two
    lanes ran dry while it finished. Asked for first it runs beside them
    instead, and the opening ends when the most work does, not when the
    longest compile asked last does: the order a list of jobs on a few
    workers wants, longest first. The kind is the measure of length here
    because it is the one the code knows: every render pipeline built ahead
    draws a picture (the display's is the whole plate), every compute
    kernel moves one field, and the slowest compute in any run read was
    0.44 s. Sorted, not reordered by hand, so a new render pipeline in any
    owner's list takes its place without anyone remembering this.

    First in the list, not all at once: `buildInTurn` compiles one render
    pipeline at a time and gives the other lanes the kernels behind it (why
    there), so the display goes first and the other render pipelines follow
    it one by one while the kernels run beside them.
  */
  const ahead = builds.filter((b) => !b.later).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'render' ? -1 : 1));
  const opening = await buildInTurn(device, 'opening', ahead, OPENING_LANES, opts.quiet);
  // Nobody waits on it, so nobody would hear it fail: the builds cannot
  // throw, but reading the lists can (a kernel renamed under one).
  void buildInTurn(device, 'later', builds.filter((b) => b.later))
    .catch((err) => console.warn('ChromaGlass: the rest of the pipelines could not be built behind the show; the frame builds them.', err));
  return opening;
}
