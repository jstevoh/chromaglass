/**
 * Which of the control's frame stops the builds it made on its frames sat in
 * (`npm run startup`, 1b, PLAN.md 19aa-7d). Beside startup.mjs, which is over
 * 100 KB and may not grow; `npm run compilestop` runs the made-up cases below.
 *
 * 1b prices the old way's compile as the stops in its frames that the builds
 * it made on its frames sat in. A build sits in the stop that holds it, or,
 * held by none, in one begun within the second after it: the frame it was
 * asked for in may close before the GPU stops the next. A stop no build sat
 * in is not the compile, however long or near the builds, so a runner's stall
 * is not priced as compile.
 *
 * What was reported: main's deploys 832 and 839 (runs 43619150637 and
 * 43638356311, both on the owner's second Mac runner) went red on 1b's "moving
 * for good no later than the old way" and "nothing to compare", because the
 * control (?prepare=0) priced no compile at all: "0.00 s compiling the old
 * way's pipelines (0 stops), 8.55 s the page's own". On 839 it built all 59 of
 * its pipelines on its first step at 0.81 s; its heartbeats and steps stopped
 * from that moment for 8.34 s; its frames stopped from 2.53 s for 6.61 s, the
 * page's timer silent through all of it, and the first use outstanding when
 * they stopped came back as they returned. Between the builds and that stop
 * the page's timer ran on time for at most about 0.16 s of the 1.72 s (the
 * leftover line: 0.38 s on time in all from 0.61 s, about 0.2 s of it the
 * ticks every 110 ms before the first step). So the page was held from the
 * builds on, and one frame got through at 2.53 s: the frame gap from the
 * builds was 1.72 s, under the two seconds that make a stop, and the stop that
 * followed began 1.72 s after the builds, outside the second. 832 was the same
 * (builds at 0.78 s, the stop from 2.05 s for 7.81 s, 0.27 s on time in all).
 * On every other control read, 34 of the deploys' to 832, the page's timer ran
 * on time through the compile's stop (silent at most 0.24 s) or the builds sat
 * in it; on 827, on the same runner, the stop from 2.47 s held all 59.
 *
 * The first-use rule (a stop the first use of a build was handed before and
 * came back with) does not reach it either, rightly: it asks that the page's
 * timer ran through the stop, because a page that stood still hears its first
 * use late, at the stop's end, whatever the GPU did. Nothing measured says when
 * the GPU was done here, only that the page stopped as the builds were asked
 * and did not run freely again until the stop was over.
 *
 * So, a third way a build sits in a stop, read off what the page ran rather
 * than a window of time. Held by no stop and by none begun within the second,
 * a build sits in the first stop after it when:
 *
 *   - that stop began less than MAX_GAP_S after it, so the stretch between,
 *     had no frame got through, would itself have been part of the stop (839's
 *     1.72 s, 832's 1.27 s). A longer stretch with frames in it was not one
 *     freeze, and a stall at the end of it is not priced, however the page ran
 *     before (check-skeptic on this PR: with no such cap, a page busy with its
 *     own work for ten seconds and a stall after it priced sixteen as compile,
 *     which loosened line 2);
 *   - the page was never seen running for HELD_RUN_S at a stretch between the
 *     two: running is its timer's ticks and its frames, together, coming no
 *     more than TICK_FREE_MS apart (the same quarter second startup.mjs calls
 *     the timer on time), so a page that ran freely runs the whole stretch,
 *     over a second here, and a page busy with its own short tasks still
 *     draws and ticks between them and reads as running. 839's page ran for
 *     about 0.16 s after the builds, by the leftover line, in one burst at most;
 *   - and the page's timer was seen on time for ALIVE_S of the second before
 *     the build, so a run whose timer was never read, or ran late already,
 *     prices nothing this way.
 *
 * That stop is then read from the earliest such build, not from the stray
 * frame: the freeze began at the builds, as it does when a stop holds them,
 * and the held stretch before the frame is the compile's as much as the stop
 * after it, at most MAX_GAP_S of it. Not looser: what moves from the control's
 * own wait to its compile makes 1b's first line stricter by as much as it
 * makes the second easier (the comment in waitOf), and the cap keeps what
 * moves to under two seconds plus a stop the page was held into. On 839's
 * shape the control's own wait reads about 0.23 s, beside the 0.46 to 1.2 s
 * of the green runs, not 8.55 s. Known limit, named: whether the page's thread
 * sat in one long task through the stretch is not asked (839's log does not
 * print the control's long tasks after its first step, so no bar can be read
 * for it); the stop must still follow within two seconds.
 */

/** The longest the page may be seen running at a stretch between a build and the next stop and still be held. */
export const HELD_RUN_S = 0.5;
/** How much of the second before a build the page's timer must have run on time, so it was read at all. */
export const ALIVE_S = 0.5;

/** Seconds of [a, b] between two ticks of the page's timer no more than `freeS` apart. */
export const freeIn = (ticks, a, b, freeS) => {
  let n = 0;
  for (let i = 1; i < ticks.length; i++) {
    const u = ticks[i - 1], v = ticks[i];
    if (v - u <= freeS) n += Math.max(0, Math.min(b, v) - Math.max(a, u));
  }
  return n;
};

/** The longest the page ran without a pause over `freeS` (its ticks and frames together) inside (a, b). */
export const longestRun = (ticks, frames, a, b, freeS) => {
  const ts = [...ticks, ...frames].filter((t) => t > a && t < b).sort((p, q) => p - q);
  let best = 0, from = ts[0];
  for (let i = 1; i < ts.length; i++) {
    if (ts[i] - ts[i - 1] > freeS) from = ts[i];
    best = Math.max(best, ts[i] - from);
  }
  return best;
};

/**
 * raw: the frame stops, [from, len] in seconds; built: when each build was
 * asked (s); ticks, frames: the page's timer and its animation frames (s);
 * freeS: TICK_FREE_MS, maxGapS: MAX_GAP_S, in seconds. Returns, per stop, how
 * many builds sat in it, and `lead`: for a stop the third rule gave builds to,
 * the earliest of them, where it is read from, with the page's longest run
 * between it and the stop (else null).
 */
export function buildsIn(raw, built, ticks, frames, { freeS, maxGapS }) {
  const holds = raw.map(() => 0);
  const lead = raw.map(() => null);
  for (const t of built) {
    let i = raw.findIndex(([from, len]) => t >= from && t <= from + len);
    if (i < 0) i = raw.findIndex(([from]) => from > t && from <= t + 1);
    if (i < 0) {
      const j = raw.findIndex(([from]) => from > t);
      const s = j < 0 ? null : raw[j][0];
      const run = j < 0 ? null : longestRun(ticks, frames, t, s, freeS);
      if (j >= 0 && s - t < maxGapS && run < HELD_RUN_S && freeIn(ticks, t - 1, t, freeS) >= ALIVE_S) {
        i = j;
        if (!lead[j] || t < lead[j].at) lead[j] = { at: t, run };
      }
    }
    if (i >= 0) holds[i]++;
  }
  return { holds, lead };
}

/*
  Made-up openings, in seconds, each the shape of one read off a log (or the
  one it must not be mistaken for), with what each must come to. Ticks every
  0.11 s where the page ran, as the logs print it before the first step.
*/
const every = (a, b, dt = 0.11) => Array.from({ length: Math.floor((b - a) / dt) + 1 }, (_, k) => +(a + k * dt).toFixed(3));
const many = (t, n = 59) => Array(n).fill(t);
const burst = (a, b) => every(a, b, 0.0167);
const SELF = [
  {
    name: "839's control: built at 0.81 s, held, a burst of frames to 2.53 s, then stopped 6.61 s",
    raw: [[2.53, 6.61]], built: many(0.81),
    ticks: [...every(0.04, 0.81), 1.42, 2.41, 2.52, ...every(9.15, 12)], frames: [...burst(0.05, 0.81), 1.43, ...burst(2.38, 2.53), ...burst(9.14, 12)],
    holds: [59], leadAt: 0.81,
  },
  {
    name: "832's control: built at 0.78 s, held, the stop from 2.05 s for 7.81 s",
    raw: [[2.05, 7.81]], built: many(0.78),
    ticks: [...every(0.05, 0.78), 1.30, 1.95, 2.04, ...every(9.87, 12)], frames: [...burst(0.05, 0.78), ...burst(1.9, 2.05), ...burst(9.86, 12)],
    holds: [59], leadAt: 0.78,
  },
  {
    name: 'a page that ran freely after its builds, then a stall 1.72 s later: not the compile',
    raw: [[2.53, 6.61]], built: many(0.81),
    ticks: [...every(0.04, 2.53), ...every(9.15, 12)], frames: [...burst(0.05, 2.53), ...burst(9.14, 12)],
    holds: [0], leadAt: null,
  },
  {
    name: 'a page busy with its own work, drawing and ticking every 0.2 s between its tasks, then a stall: not the compile',
    raw: [[2.53, 6.61]], built: many(0.81),
    ticks: [...every(0.04, 0.81), ...every(0.95, 2.53, 0.3)], frames: [...burst(0.05, 0.81), ...every(0.85, 2.53, 0.3)],
    holds: [0], leadAt: null,
  },
  {
    name: 'held, but the stop began 2.1 s after the builds: two freezes, not one, so not priced',
    raw: [[2.91, 6]], built: many(0.81),
    ticks: [...every(0.04, 0.81), 2.81, 2.9, ...every(8.95, 12)], frames: [...burst(0.05, 0.81), 1.9, ...burst(2.8, 2.91)],
    holds: [0], leadAt: null,
  },
  {
    name: 'held, seen running 0.45 s at a stretch between: held',
    raw: [[2.53, 6.61]], built: many(0.81),
    ticks: [...every(0.04, 0.81), ...every(1.5, 1.95, 0.15)], frames: [...burst(0.05, 0.81), ...burst(1.5, 1.95)],
    holds: [59], leadAt: 0.81,
  },
  {
    name: 'seen running 0.55 s at a stretch between: it ran, not held',
    raw: [[2.53, 6.61]], built: many(0.81),
    ticks: [...every(0.04, 0.81), ...every(1.5, 2.05, 0.11)], frames: [...burst(0.05, 0.81), ...burst(1.5, 2.05)],
    holds: [0], leadAt: null,
  },
  {
    name: 'no timer read at all: nothing priced by the third rule',
    raw: [[2.53, 6.61]], built: many(0.81), ticks: [], frames: [],
    holds: [0], leadAt: null,
  },
  {
    name: 'the timer on time 0.45 s of the second before the builds (and 0.44 s after them): not read, not priced',
    raw: [[2.53, 6.61]], built: many(0.81),
    ticks: [0.0, 0.36, 0.45, 0.54, 0.63, 0.72, 0.81, 0.92, 1.03, 1.14, 1.25, 2.52, ...every(9.15, 12)], frames: [2.53],
    holds: [0], leadAt: null,
  },
  {
    name: 'the timer on time 0.55 s of the second before the builds: read, held',
    raw: [[2.53, 6.61]], built: many(0.81),
    ticks: [0.0, 0.26, 0.37, 0.48, 0.59, 0.70, 0.81, 2.52, ...every(9.15, 12)], frames: [2.53],
    holds: [59], leadAt: 0.81,
  },
  {
    name: 'builds at two moments, both held into the stop: read from the earlier',
    raw: [[2.53, 6.61]], built: [...many(0.81, 30), ...many(0.9, 29)],
    ticks: [...every(0.04, 0.9), 2.52, ...every(9.15, 12)], frames: [2.53],
    holds: [59], leadAt: 0.81,
  },
  {
    name: "827's control: the builds inside the stop, as before",
    raw: [[2.47, 9.23]], built: many(2.48),
    ticks: [...every(0.05, 2.47), ...every(2.5, 11.7)], frames: burst(0.05, 2.47),
    holds: [59], leadAt: null,
  },
  {
    name: 'builds 0.5 s before the stop: the second after them, as before, whatever the page did',
    raw: [[1.3, 8]], built: many(0.8),
    ticks: [...every(0.05, 12)], frames: burst(0.05, 1.3),
    holds: [59], leadAt: null,
  },
];

export function selfCheck(freeS = 0.25, maxGapS = 2) {
  const wrong = [];
  for (const c of SELF) {
    const { holds, lead } = buildsIn(c.raw, c.built, c.ticks, c.frames, { freeS, maxGapS });
    const at = lead.find(Boolean)?.at ?? null;
    if (holds.join() !== c.holds.join() || at !== c.leadAt) wrong.push(`${c.name} (built in each: ${holds.join(', ')}, read from ${at ?? 'its own start'}; meant ${c.holds.join(', ')}, ${c.leadAt ?? 'its own start'})`);
  }
  return { cases: SELF.length, wrong };
}

// Run as its own script only. Not `import.meta.url === argv[1]`: `npm run
// startup` bundles this file into its own, where the two are the same file,
// and on #878's first Mac run that ran this block inside startup and exited
// it green after the self-check, 7 s in, with the opening never measured.
if (/(^|[\\/])compilestop\.mjs$/.test(process.argv[1] ?? '')) {
  const { cases, wrong } = selfCheck();
  console.log(`${wrong.length ? ' FAIL' : ' ok  '} which frame stops the control's builds sat in, on ${cases} made-up openings (scripts/compilestop.mjs, PLAN.md 19aa-7d) — ${wrong.length ? wrong.join('; ') : `${cases} of ${cases}`}`);
  process.exit(wrong.length ? 1 : 0);
}
