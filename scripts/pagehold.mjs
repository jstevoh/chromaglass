/**
 * Which silent stretches of an opening were the page's thread held from
 * outside it, and which were the page's own code (`npm run startup`, 4b).
 *
 * A stretch is silent when the page ran nothing anyone can see: no animation
 * frame, no tick of its own tenth-of-a-second timer, no long task. Chromium
 * starting its GPU on a cold Mac looks like that from the page (a second to
 * four, from about a second after load, ending when the adapter or device is
 * handed over). So does one thing of the page's own: its JavaScript run as the
 * continuation of an awaited promise, which Chromium does not report as a long
 * task. That continuation begins the moment the promise settles, and the
 * startup check marks those moments (`__startupSettled`, and the adapter's and
 * device's handovers).
 *
 * The rule before this one called a stretch the page's own if it began within
 * fifty milliseconds of such a mark. On main's 997c71f deploy (run
 * 37162044666) that charged Chromium's hold to the page: the adapter was asked
 * for at 0.47 s and handed over at 4.18 s, the page drew a frame at 1.00 s and
 * then nothing until 4.17 s, with no long task and a long animation frame
 * across it naming no script and no blocking time, the same as the hold on
 * every green run read (seven, 2.00 to 2.36 s from about 1.0 s, all "0
 * scripts, blocking 0.00 s"). Some promise had settled within fifty
 * milliseconds of 1.02 s. It cannot have been one of the GPU's: there was no
 * device until 4.56 s. So it was something the page fetched, and the stop of
 * 3.18 s went whole to check 4, against two seconds.
 *
 * Two things tell the cases apart that the fifty milliseconds did not, both
 * tried on software WebGPU in a cloud session (the probes are in the project's
 * startup lab). The first of them can count as held a stretch the old rule
 * kept as the page's (a GPU promise settled, then a frame or tick, then
 * silence), which is right: the code after that await had finished. The
 * second, and the scripts and blocking time of any stretch, only ever count
 * more of it as the page's:
 *
 *   - The continuation runs in the same turn as the mark, before anything else
 *     the page does. So if a frame, a tick or the end of a long task came
 *     after the mark and before the silence, the code after that await had
 *     already finished: the silence is not it. Only a stretch whose last
 *     sign of life was the mark itself can be the page's code after it.
 *   - For a promise the page fetched, read, decoded or made an image from,
 *     Chromium's long animation frames name the continuation as a script
 *     (`resolve-promise`, the whole time it ran, with that time counted as
 *     blocking): a second of busy code after `await fetch`, `.json()`,
 *     `.text()`, `.arrayBuffer()`, `.blob()`, `createImageBitmap` and
 *     `decodeAudioData` each showed as one, every time. A renderer stopped
 *     from outside for two seconds forty milliseconds after a fetch settled
 *     showed a long animation frame with none. For those (SEEN below) the
 *     stretch is the page's for as long as such a script runs in it, and what
 *     is left after it, if HELD_MIN_S or more, is held. A stretch no long
 *     animation frame covers cannot be read this way and stays the page's.
 *     The GPU's own promises (pipelines, work done, mapped buffers, errors,
 *     compilation info, the adapter and device) are named by nothing: a
 *     second of busy code after each showed no script at all. So a stretch
 *     that follows one of those with nothing between stays the page's, as
 *     before.
 *
 * What is held still has to begin in the first HELD_BY_S after load, end
 * before the first step, and add up to no more than COLD_CAP_S
 * (scripts/startup.mjs): none of that moves.
 */

/** Promises whose continuation a long animation frame names as a script. */
export const SEEN = new Set([
  'fetch', 'Response.json', 'Response.text', 'Response.arrayBuffer', 'Response.blob',
  'createImageBitmap', 'decodeAudioData',
]);

/**
 * frames, ticks: times (ms). long: [start, duration]. marks: [time, name].
 * loaf: [start, duration, renderStart, blocking, scriptCount, scripts], each
 * script [start, duration]. Returns held stretches [from, to] and the ones
 * kept as the page's own, [from, to, what settled before it].
 */
export function heldStretches({ frames, ticks, long, marks, loaf }, { stepRaw, t0, heldMinMs, heldByMs }) {
  // Marks after everything else at the same moment: when a tick and a mark
  // share a millisecond, which ran last cannot be told, so the mark is
  // taken as last and the stretch stays the page's.
  const ran = [...frames.map((t) => [t, t, null]), ...ticks.map((t) => [t, t, null]),
    ...long.map(([st, dur]) => [st, st + dur, null]), ...marks.map(([t, what]) => [t, t, what])]
    .sort((x, y) => x[0] - y[0] || (x[2] == null ? 0 : 1) - (y[2] == null ? 0 : 1));
  const held = [], own = [];
  let end = null, last = null;
  for (const item of ran) {
    const [st, en] = item;
    if (end != null && st - end >= heldMinMs && st <= stepRaw && end - t0 <= heldByMs) {
      const what = last[2];
      // After the GPU's own promises nothing names the page's code: kept.
      if (what != null && !SEEN.has(what)) own.push([end, st, what]);
      else {
        /*
          The page's scripts in it, as the long animation frames name them,
          are its own whatever came before: a second of code after an
          awaited promise this does not wrap (`enumerateDevices`,
          `caches.keys()`, a Blob's body, all of which the app awaits) is
          named so too (the check-skeptic's probes). What is left after the
          last of them is held if it is long enough, lies under a long
          animation frame, and that frame was not blocked: Chromium's hold
          read no script and no blocking on every run read, while the page's
          own code reads blocking of nearly its whole length.
        */
        const frames = loaf.filter(([a, d]) => a < st && a + d > end);
        const from = frames.flatMap((f) => f[5] ?? []).filter(([a, d]) => a < st && a + d > end)
          .reduce((m, [a, d]) => Math.max(m, a + d), end);
        const under = frames.filter(([a, d]) => Math.min(st, a + d) - Math.max(from, a) >= heldMinMs);
        const blocked = frames.some(([, , , bl]) => bl != null && bl >= heldMinMs);
        const cut = frames.some(([, , , , n, sc]) => n > (sc ?? []).length);
        if (st - from >= heldMinMs && !blocked && !cut && (what == null || under.length)) held.push([from, st]);
        else own.push([end, st, what ?? 'no promise this wraps']);
      }
    }
    if (end == null || en >= end) { end = en; last = item; }
  }
  return { held, own };
}

/*
  The rule's own cases, run by the startup check before it reads an opening,
  so a change to it that would tell one of them wrong is red before it is
  trusted with a run. Times in ms after load. A frame every 16 ms and a tick
  every 100 ms lead up to each.
*/
const lead = (to) => ({ frames: Array.from({ length: Math.floor(to / 16) }, (_, i) => 16 * (i + 1)), ticks: Array.from({ length: Math.floor(to / 100) }, (_, i) => 100 * (i + 1)) });
const opts = { stepRaw: 15000, t0: 0, heldMinMs: 500, heldByMs: 3000 };
const SELF = [
  {
    name: "main's 997c71f deploy, a fetch settled and then a tick before Chromium's hold",
    input: { ...lead(1000), long: [[740, 260]], marks: [[990, 'fetch']], loaf: [[1020, 3150, 4170, 0, 0, []]] },
    extra: { ticks: [1020], frames: [4170] },
    held: 3150, own: 0,
  },
  {
    name: "main's 997c71f deploy, a fetch's body read last, no script in the long frame over the hold",
    input: { ...lead(1000), long: [[740, 260]], marks: [[1020, 'Response.arrayBuffer']], loaf: [[1020, 3150, 4170, 0, 0, []]] },
    extra: { frames: [4170] },
    held: 3150, own: 0,
  },
  {
    name: 'a second of the page\'s code after await fetch (the lab: resolve-promise for 1.00 s)',
    input: { ...lead(1000), long: [], marks: [[1020, 'fetch']], loaf: [[1018, 1010, 2020, 950, 1, [[1020, 1000]]]] },
    extra: { frames: [2025] },
    held: 0, own: 1000,
  },
  {
    name: 'the page\'s code after await fetch, with no long animation frame to say so',
    input: { ...lead(1000), long: [], marks: [[1020, 'Response.json']], loaf: [] },
    extra: { frames: [2025] },
    held: 0, own: 1000,
  },
  {
    name: 'a second and a half of the page\'s code after a pipeline was built (the lab: no script named)',
    input: { ...lead(1000), long: [], marks: [[1020, 'createComputePipelineAsync']], loaf: [[1018, 1510, 2530, 0, 0, []]] },
    extra: { frames: [2530] },
    held: 0, own: 1510,
  },
  {
    name: 'the page\'s code after the device was handed over',
    input: { ...lead(1000), long: [], marks: [[1020, 'device']], loaf: [[1018, 2010, 3030, 0, 0, []]] },
    extra: { frames: [3030] },
    held: 0, own: 2010,
  },
  {
    name: 'a pipeline settled, a frame drew, then the thread was held',
    input: { ...lead(1000), long: [], marks: [[1010, 'createRenderPipelineAsync']], loaf: [[1016, 2000, 3016, 0, 0, []]] },
    extra: { frames: [1016, 3016] },
    held: 2000, own: 0,
  },
  {
    name: 'a fetch\'s code ran 0.3 s, then the thread was held 2 s',
    input: { ...lead(1000), long: [], marks: [[1020, 'fetch']], loaf: [[1018, 2310, 3320, 280, 1, [[1020, 300]]]] },
    extra: { frames: [3320] },
    held: 2000, own: 0,
  },
  {
    name: 'a fetch\'s code ran most of the stretch, too little after it to be a hold',
    input: { ...lead(1000), long: [], marks: [[1020, 'fetch']], loaf: [[1018, 1510, 2530, 1150, 1, [[1020, 1200]]]] },
    extra: { frames: [2530] },
    held: 0, own: 1510,
  },
  {
    name: 'a second and a half of the page\'s code after a promise this does not wrap (enumerateDevices, in the skeptic\'s probe)',
    input: { ...lead(1000), long: [], marks: [], loaf: [[1018, 1510, 2530, 1451, 1, [[1020, 1500]]]] },
    extra: { frames: [2530] },
    held: 0, own: 1510,
  },
  {
    name: 'a silent stretch under a long animation frame blocked for most of it, with its scripts not named',
    input: { ...lead(1000), long: [], marks: [], loaf: [[1018, 1510, 2530, 1400, 0, []]] },
    extra: { frames: [2530] },
    held: 0, own: 1510,
  },
  {
    name: 'a fetch settled under a long animation frame that named fewer scripts than it ran',
    input: { ...lead(1000), long: [], marks: [[1020, 'fetch']], loaf: [[1018, 2010, 3030, 0, 3, [[1020, 10]]]] },
    extra: { frames: [3030] },
    held: 0, own: 2010,
  },
  {
    name: 'no mark at all: Chromium\'s hold as on the green runs',
    input: { ...lead(1000), long: [], marks: [], loaf: [[1010, 2000, 3010, 0, 0, []]] },
    extra: { frames: [3010] },
    held: 2010, own: 0,
  },
];

/** The cases this rule tells wrong, by name; empty when it tells them all. */
export function selfCheck() {
  const wrong = [];
  for (const c of SELF) {
    const input = { ...c.input, frames: [...c.input.frames, ...(c.extra.frames ?? [])], ticks: [...c.input.ticks, ...(c.extra.ticks ?? [])] };
    const { held, own } = heldStretches(input, opts);
    const h = held.reduce((n, [a, b]) => n + b - a, 0), o = own.reduce((n, [a, b]) => n + b - a, 0);
    if (Math.abs(h - c.held) > 20 || Math.abs(o - c.own) > 20) wrong.push(`${c.name} (held ${h.toFixed(0)} ms, the page's ${o.toFixed(0)} ms; meant ${c.held} and ${c.own})`);
  }
  return { cases: SELF.length, wrong };
}
