/**
 * Whether the runner can start Chromium on the system libraries it already
 * has (PLAN 19ab-2). Run by the Measure shards that drive a browser, after the
 * browser is in place and before the first harness. It exits 0 when every
 * binary of the browsers the harnesses launch finds every library it links
 * and both start and open a page; it exits 1 naming each missing library, or
 * with the browser's own words when it will not start.
 *
 * Why this exists. Until 2026-10-24 those shards ran `playwright install
 * --with-deps`, which runs apt on every run. That afternoon it timed out at its
 * six-minute bound on the browser shard of PR #429 (run 40117937609): the mirror
 * was answering at 50 to 100 KB/s and had reached package 10 of 17. The 17 were
 * 8 upgrades of libraries the runner already had and 9 fonts and tools —
 * Japanese, Chinese, Thai, FreeFont — that nothing the app draws asks for. The
 * job carried on past the timed-out step and every browser harness after it
 * passed: the libraries were there all along, and the step that went red was
 * fetching things nobody needed. So the question to put to the runner is not
 * "can apt finish in time" but "is anything missing", and only a missing
 * library is worth a trip to the mirror (checks.yml calls apt only when this
 * fails, then runs this again).
 *
 * The two easy answers, and why neither. Letting the apt step time out and
 * carry on (`continue-on-error`) keeps the run green on a slow mirror, but on
 * the day a runner image really drops a library, the red turns up later as a
 * harness's browser closing at launch, nothing pointing at the library.
 * Raising the bound only waits longer for the same fonts.
 *
 * Why its own ldd, and not Playwright's. Playwright has a check of exactly this
 * ("Host system is missing dependencies"), run at install and at launch, and in
 * 1.63 it checks nothing: it runs ldd over the binaries in `chrome-linux`, while
 * the linux-x64 builds it installs unpack to `chrome-linux64` (coreBundle.js,
 * the browser's `_validateHostRequirements` against its DOWNLOAD_PATHS), so it
 * finds no binaries, so it finds nothing missing. It also skips itself for 30
 * days once a `DEPENDENCIES_VALIDATED` file sits in the browser's directory, and
 * since #444 that directory comes out of `actions/cache`, marker and all, from
 * whichever runner first filled it. A launch alone is not enough either: a
 * library missing from Chromium's own binary stops the launch (the loader's
 * "error while loading shared libraries" is in Playwright's error, but only in
 * the first harness to launch, mid-shard), while one missing from a helper it
 * starts later shows only when that helper is needed. ldd over
 * every binary in both directories, on this runner, every run, takes a second.
 *
 * Why both browsers. The harnesses start Playwright's headless shell
 * (`launchChromium`, scripts/chromium.mjs) and, for WebGPU, its full Chromium
 * (`channel: 'chromium'`, scripts/webgpu-smoke.mjs). They are separate builds in
 * separate directories, and each is checked on its own.
 */

import { readdirSync, statSync, openSync, readSync, closeSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { launchChromium, chromiumPath } from './chromium.mjs';

const registry = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), '.cache', 'ms-playwright');

function isElf(path) {
  const fd = openSync(path, 'r');
  const head = Buffer.alloc(4);
  readSync(fd, head, 0, 4, 0);
  closeSync(fd);
  return head.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
}

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path, { throwIfNoEntry: false });
    if (!st) continue;
    if (st.isDirectory()) yield* files(path);
    else if (st.isFile() && st.size > 4) yield path;
  }
}

const failures = [];

// The browsers' directories: one per build, `chromium-<n>` and
// `chromium_headless_shell-<n>`, which on CI are the version the cache was
// keyed on and nothing else.
const builds = existsSync(registry)
  ? readdirSync(registry).filter((d) => /^chromium(_headless_shell)?-\d+$/.test(d))
  : [];
if (!builds.length) failures.push(`no Chromium build under ${registry}: the install step did not put one there`);
for (const build of builds) {
  const missing = new Map();
  let checked = 0;
  for (const path of files(join(registry, build))) {
    if (!isElf(path)) continue;
    checked++;
    // The browser's own directory on the search path, as the browser has it,
    // so a library it ships beside itself is not reported as missing.
    const r = spawnSync('ldd', [path], {
      encoding: 'utf8',
      env: { ...process.env, LD_LIBRARY_PATH: [process.env.LD_LIBRARY_PATH, dirname(path)].filter(Boolean).join(':') },
    });
    // An ldd that is missing or fails would read as "nothing missing" and
    // quietly leave only the launches: so either is a failure, except on a
    // file the loader does not link at all (a static helper), which is fine.
    const said = `${r.stdout || ''}${r.stderr || ''}`;
    if (r.error || (r.status !== 0 && !/not a dynamic executable/.test(said))) {
      failures.push(`ldd could not read ${path.slice(registry.length + 1)}: ${r.error ? r.error.message : said.trim() || `exit ${r.status}`}`);
      continue;
    }
    for (const line of (r.stdout || '').split('\n')) {
      const m = line.trim().match(/^(\S+) => not found$/);
      if (m) missing.set(m[1], [...(missing.get(m[1]) || []), path.slice(registry.length + 1)]);
    }
  }
  if (missing.size) {
    console.log(`FAIL ${build}: ${missing.size} system librar${missing.size === 1 ? 'y' : 'ies'} missing, over ${checked} binaries`);
    for (const [lib, by] of missing) failures.push(`${build} needs ${lib} (linked by ${by.slice(0, 3).join(', ')}${by.length > 3 ? ` and ${by.length - 3} more` : ''})`);
  } else {
    console.log(`ok   ${build}: every library found, over ${checked} binaries`);
  }
}

// Then start each, which is what the harnesses do. On a cloud session's
// sandbox `chromiumPath` points both at one fixed binary; on CI it is unset and
// each launch takes the build checked above.
if (chromiumPath()) console.log(`note launches use ${chromiumPath()}, not the builds above`);
for (const [name, opts] of [['headless shell', {}], ['full Chromium', { channel: 'chromium' }]]) {
  const t0 = Date.now();
  try {
    const browser = await launchChromium(chromium, { ...opts, timeout: 60_000 });
    const page = await browser.newPage();
    await page.setContent('<p>ok</p>');
    await browser.close();
    console.log(`ok   ${name} starts and opens a page (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (e) {
    console.log(`FAIL ${name} does not start`);
    failures.push(`${name} does not start: ${e.message}`);
  }
}

// What the page falls back to where Geist (index.css, from Google Fonts) does
// not draw a glyph: printed because the fonts the apt step used to add are no
// longer added, so a change in the runner's own is in the log beside the checks
// that might feel it.
for (const family of ['sans-serif', 'emoji']) {
  try {
    console.log(`font ${family}: ${execFileSync('fc-match', [family], { encoding: 'utf8' }).trim()}`);
  } catch { console.log(`font ${family}: fc-match not available`); }
}

if (failures.length) {
  console.log('');
  for (const f of failures) console.log(f);
  process.exit(1);
}
