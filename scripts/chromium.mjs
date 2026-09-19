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

/** What the harnesses launch with, on top of whatever each one needs. */
export const BASE_ARGS = [
  '--no-sandbox',
  '--enable-unsafe-swiftshader',
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  ...GPU_ARGS,
];

/**
 * Launch it. `args` are added to the base set; anything else in `opts` is
 * passed through.
 */
export async function launchChromium(chromium, { args = [], ...opts } = {}) {
  const executablePath = chromiumPath();
  return chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: [...BASE_ARGS, ...args],
    ...opts,
  });
}
