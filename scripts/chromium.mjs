/**
 * Which Chromium the harnesses drive.
 *
 * The sandbox these were written in keeps one at a fixed path, and every
 * harness hard-coded it. That works on exactly one machine: on a CI runner,
 * or on a contributor's laptop, Playwright downloads its own browser
 * somewhere else and a hard-coded `executablePath` that does not exist fails
 * the launch rather than falling back — so the harnesses could not run in the
 * one place it matters most that they do.
 *
 * Order of preference:
 *
 *   1. `PW_CHROMIUM`, for pointing at a specific binary.
 *   2. The sandbox's `/opt/pw-browsers/chromium`, if it is really there.
 *   3. Playwright's own, by passing no path at all.
 */

import { existsSync } from 'node:fs';

// A harness's port comes with its browser: most import only this file, and a
// port asked for in scripts/ports.mjs moves with the runner the shard is on,
// so two shards on one Mac never meet on one (PLAN.md 19ah-6).
export { port, untilServing } from './ports.mjs';

const SANDBOX = '/opt/pw-browsers/chromium';

export function chromiumPath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  return existsSync(SANDBOX) ? SANDBOX : undefined;
}

/**
 * On a Mac, the GPU.
 *
 * Headless Chromium on macOS rasterises in SwiftShader unless it is told to
 * use Metal, and says so only in a renderer string nobody reads: `npm run
 * bench -- --full` on an M4 printed 2 fps at every rung, a reading of the
 * software rasteriser filed as the laptop's. With these flags the same
 * headless browser reports "ANGLE Metal Renderer: Apple M4" and the sweep
 * measures the machine. Linux runners have no GPU to ask for, so they are
 * left as they were. `PW_SOFTWARE=1` puts a Mac back on SwiftShader, to
 * reproduce what CI sees.
 */
const GPU_ARGS = process.platform === 'darwin' && !process.env.PW_SOFTWARE
  ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
  : [];

/*
  And WebGPU on a machine with no GPU, in software. A Linux box (a cloud
  session, a container) gets no adapter at all by default, so every harness
  that drives the app stopped at "needs WebGPU" and could only be run on CI's
  Mac. `PW_WEBGPU=1` gives the app SwiftShader's WebGPU, as the lab has always
  had (scripts/lab.mjs): slow, but the same engine and the same checks.
*/
const SOFTWARE_WEBGPU = process.platform !== 'darwin' && process.env.PW_WEBGPU
  ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader']
  : [];

/*
  And on that same box, a window to present into, for a harness that reads
  the app's plate (PLAN.md 19l).

  Software WebGPU alone was enough for the lab, which computes and reads back
  but never puts a frame on a canvas, and not for the app: headless, the
  device is lost at the first present ("A valid external Instance reference
  no longer exists"; a bare canvas, 2026-10-26, Chromium 153: lost at once
  headless, thirty frames headed). So every check that photographs the app's
  plate read zeros, or nothing, and could only be run on CI's Mac after a
  push and a queue. Headed into an X display it presents.

  And without the GPU watchdog, which headed was not enough without. The
  show's first full solver step, 248 compute passes, runs its first
  dispatches through SwiftShader's compiler on the GPU process's one thread
  for 25 to 100 s, and Chromium's watchdog takes a thread that long to be
  hung and kills the process ("GPU process exited unexpectedly", then the
  page's lost device). The page makes a new device, opens again, reaches the
  same step and is killed again, for good: that was `scripts/startup.mjs`'s
  "SwiftShader loses the app's device every few seconds". With the watchdog
  off the step finishes and the plate goes on, at about 0.4 steps a second.
  Only this launch gets it: a GPU never needs it, and a real hang on one is
  still the watchdog's to end.

  Asked for, not the default. A harness that reads the plate passes
  `present: true` (`tools`, `magnet`, `mirror`, `bottles`), and `PW_PRESENT=1`
  asks for it for any other. The first push of 19l made it the default with
  `PW_WEBGPU`, and CI's Linux lab part ran out of its 25 minutes: twenty-odd
  checks there set `PW_WEBGPU=1` themselves (`signin`, `tiers`, ...), were
  written against a plate that stops at its first present, and headed each
  of them drove a live software plate the whole run. They measure the page,
  not the plate, and stay as they were. The display is this process's own
  (`DISPLAY`, as under `xvfb-run`, which `scripts/desktop.mjs` re-executes
  itself under) or, with none, an Xvfb started here once per process and
  stopped when it ends; with no Xvfb, the headless launch and a line saying so.
*/
const PRESENTS = process.platform === 'linux' && !!process.env.PW_WEBGPU;
const HEADED_ARGS = ['--disable-gpu-watchdog'];

let xvfb = null;          // { display, proc } once started
let xvfbFailed = false;

/** A display to present into: this process's own, or an Xvfb started for it. */
async function virtualDisplay() {
  if (process.env.DISPLAY) return process.env.DISPLAY;
  if (xvfb) return xvfb.display;
  if (xvfbFailed) return null;
  const { spawn } = await import('node:child_process');
  /*
    `-displayfd` has Xvfb pick a free display number itself and write it to
    the descriptor it is given, so two harnesses started side by side (a
    session running checks in parallel) never race for `:99`. The screen is
    larger than any viewport a harness asks for (the wall checks open
    1920×1080 windows), at 24 bits: Chromium's GPU process refuses a depth-16
    visual for a GL surface.
  */
  const proc = spawn('Xvfb', ['-displayfd', '3', '-screen', '0', '2560x1600x24', '-nolisten', 'tcp', '-noreset'],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe'] });
  const display = await new Promise((resolve) => {
    let got = '';
    const timer = setTimeout(() => resolve(null), 10000);
    proc.on('error', () => { clearTimeout(timer); resolve(null); });
    proc.on('exit', () => { clearTimeout(timer); resolve(null); });
    proc.stdio[3].on('data', (b) => {
      got += String(b);
      if (got.includes('\n')) { clearTimeout(timer); resolve(`:${got.trim()}`); }
    });
  });
  if (!display) {
    xvfbFailed = true;
    try { proc.kill('SIGKILL'); } catch { /* never started */ }
    console.log(' --   no Xvfb: the browser runs headless, and the app\'s frames may not be readable (PLAN.md 19l)');
    return null;
  }
  proc.stdio[3].destroy();
  proc.unref();
  // `exit` handlers must be synchronous: a kill is. A harness that exits on a
  // signal goes through its own handler to `process.exit`, which lands here.
  process.on('exit', () => { try { proc.kill('SIGKILL'); } catch { /* gone */ } });
  xvfb = { display, proc };
  return display;
}

/** What the harnesses launch with, on top of whatever each one needs. */
export const BASE_ARGS = [
  '--no-sandbox',
  '--enable-unsafe-swiftshader',
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  ...GPU_ARGS,
  ...SOFTWARE_WEBGPU,
];

/**
 * Launch it. `args` are added to the base set; `present` asks for the
 * headed launch above when it applies; anything else in `opts` is passed
 * through.
 */
export async function launchChromium(chromium, { args = [], present = false, ...opts } = {}) {
  const executablePath = chromiumPath();
  // Headed wins over a harness's own `headless: true`: it asked to present.
  const display = PRESENTS && (present || !!process.env.PW_PRESENT) ? await virtualDisplay() : null;
  presented = !!display;
  const headed = display ? { headless: false, env: { ...process.env, ...opts.env, DISPLAY: display } } : {};
  return chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: [...BASE_ARGS, ...(display ? HEADED_ARGS : []), ...args],
    ...opts,
    ...headed,
  });
}

let presented = false;

/**
 * Did the last launch go headed into a virtual display on software WebGPU?
 * What `scripts/frame.mjs` asks before it adds its software overrides to the
 * app's URL and makes its waits wait for steps.
 */
export const presentsInXvfb = () => presented;
