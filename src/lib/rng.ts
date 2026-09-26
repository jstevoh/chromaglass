/**
 * The show's dice: one seed a night, one named stream per purpose.
 *
 * Batch 6 in PLAN.md is "Render this song": play the sequence again, frame by
 * frame, at a quality the live machine cannot hold, and get the performance
 * itself back as a film. Its gate is that the same song rendered twice is
 * byte-identical. Nothing can meet that while the plate is decided by
 * `Math.random`, and it was: 199 references on 166 lines, across the solver's
 * injection, the beads, the bubbles, the closeup camera, the automation, the
 * looks and the synthesised sound, plus
 * one nobody could see — `createNoise2D()` with no argument builds its
 * permutation table from `Math.random` too, so even the "noise" a look is
 * seeded with was a different field on every load.
 *
 * ## Why a seed, and why streams
 *
 * A single seeded generator shared by everything would make a render
 * reproducible, and it would make every later change to the show a change to
 * every other part of it. A bubble that learns to draw one more number for its
 * wobble would move the next draw the beads make, and the next look laid would
 * have its beads somewhere else — a bead layout "changing" because of a bubble
 * fix is exactly the kind of report that costs an evening. So each purpose gets
 * its own **stream**: a generator whose whole sequence is decided by three
 * things only,
 *
 *     (the show's seed, the stream's name, the event it was last restarted on)
 *
 * and by nothing that happens in any other stream. `npm run seed` holds that:
 * it draws extra from one stream and checks another's sequence did not move.
 *
 * ## Which generator
 *
 * sfc32 ("Small Fast Counting", Chris Doty-Humphrey, from PractRand), seeded by
 * cyrb128, the pairing bryc's widely used collection of JavaScript PRNGs
 * recommends. Chosen over the obvious alternatives for plain reasons:
 *
 *   - `mulberry32` is the usual one-liner, but it has 32 bits of state: one
 *     cycle of 2^32 numbers, and every seed is only a place to start on it.
 *     Two streams keyed differently are then two windows onto the same loop,
 *     and nothing stops one running into the other's numbers — the opposite
 *     of the independence the streams are here for.
 *   - xoshiro128** is as good, but wants its state seeded by a separate
 *     splitmix step and is no faster in JavaScript, where everything is a
 *     32-bit integer op either way.
 *   - sfc32 has 128 bits of state with a counter in it (so no short cycles:
 *     a period of at least 2^32 on any seed and about 2^127 on average), is
 *     one of the small generators reported to pass PractRand, and is a
 *     handful of adds, shifts and xors per draw. Measured in node: 70 to 100
 *     million draws a second against `Math.random`'s 150 — about ten
 *     nanoseconds a draw, where the busiest frame draws a few thousand.
 *
 * cyrb128 turns the seed, name and event into the four state words, so two
 * streams whose names differ by a letter start nowhere near each other. The
 * first dozen outputs are thrown away, as the generator's author advises, so a
 * weak seed like 0 or 1 has mixed through before anything reads it.
 *
 * ## One seed a night
 *
 * The live show must still vary night to night: a light show that opens the
 * same way every evening is a screensaver. So the seed is drawn once, when this
 * module is first asked for it, from `crypto.getRandomValues` (the clock if
 * there is no crypto), and `?seed=<n>` in the page's address fixes it instead.
 * A number is taken as it is, mod 2^32; anything else (`?seed=fillmore`) is
 * hashed, so a render can be named rather than numbered. The seed in use is
 * readable from the running page as `window.__cgSeed`, beside the harnesses'
 * other `__cg` handles, so a night that looked right can be played again.
 *
 * ## Restarting, rather than continuing
 *
 * `setShowSeed` restarts every stream from (new seed, name, ''). That alone is
 * enough for a render that starts from a clean page: set the seed, lay the
 * look, step, and every draw is the same draw.
 *
 * The streams whose names begin `plate.` are also restarted, from
 * (seed, name, `look:<id>`), every time a look is laid — `layPlate` in the
 * visualizer, which clears the glass and lays the look fresh. The choice is
 * deliberate and it is not the obvious one; the obvious one is to let one
 * global sequence run on all night. What restarting buys:
 *
 *   - The dice a look is laid with are a pure function of (seed, look).
 *     How many numbers were drawn before it — how many drops a hand made,
 *     whether a song boundary fired, which looks were auditioned in Design —
 *     no longer decides which numbers it gets. That is the dice only, not
 *     the whole plate: the bead carpet is not cleared by laying a look (only
 *     turning the beads dial to 0 clears it), and the phrasing, the
 *     modulators and the closeup camera keep their state across a look
 *     change. Those carry the past in exactly as they did before seeding; a
 *     plate that is a pure function of (seed, look, settings) needs them
 *     reset too, which is a behaviour change with its own check to write.
 *   - A render that starts at a cue which lays its look gets the plate the
 *     whole-set render had at that cue, instead of a plate that depends on how
 *     many numbers everything before the cue happened to draw.
 *   - Photographing every preset (`gallery.yml`) lays each look on the same
 *     opening plate whichever order they are shot in, and adding a preset to
 *     the front of the list stops moving the dice of every look after it.
 *
 * A `plate.` stream first asked for after the look was laid (the second
 * layer's, turned on mid-look) starts from the same (seed, name, look) it
 * would have been restarted to, so when a stream is first touched cannot
 * decide its numbers either.
 *
 * What it costs: on one night, laying the same look twice opens it the same
 * way twice. That is the look being the look; the Seed button, which pours
 * again without clearing, continues its stream and so varies, and the next
 * night has another seed.
 *
 * Streams that are *not* `plate.` — the opening look, Lucky, the evolve
 * wander, the synthesised audio — only restart with the seed. Restarting
 * Lucky on every look change would hand a person who presses it after each
 * new look the same roll every time, which is a broken button, not a
 * reproducible one.
 *
 * ## What is not here
 *
 * Wall-clock time. Several things the plate does are still integrated over
 * `performance.now()` deltas (the solver's `time`, which the shaders' noise
 * and the camera's grain are functions of; the phrase; the drift interval).
 * Given the same sequence of frame times they are deterministic, and a render
 * supplies that sequence; a live frame loop cannot. That is the render's clock
 * to own, not the dice's.
 */

/** A seeded stream of numbers. Every method draws exactly one number, so
 * replacing `Math.random()` by any of them never changes how many draws a
 * piece of code makes, and so never moves a later draw in the same stream. */
export interface Rng {
  /** The stream's name; with the seed and the event, all that decides it. */
  readonly name: string;
  /** Draws since the stream last started. For checks, and for the curious. */
  readonly draws: number;
  /** A float in [0, 1): the drop-in for `Math.random()`. Bound, so it can be handed on as a `() => number`. */
  float: () => number;
  /** A float in [lo, hi). */
  range: (lo: number, hi: number) => number;
  /** An integer in [0, n): `Math.floor(float() * n)`. */
  int: (n: number) => number;
  /** One element of `list`, uniformly (undefined from an empty list, as `list[0]` would be). */
  pick: <T>(list: readonly T[]) => T;
  /** True with probability `p`: `float() < p`. */
  chance: (p: number) => boolean;
  /** An angle in [0, 2π). */
  angle: () => number;
  /** A float in [-0.5, 0.5): the `(Math.random() - 0.5)` jitter. */
  centred: () => number;
  /** A float in [-1, 1): the `Math.random() * 2 - 1` of a noise buffer. */
  signed: () => number;
  /** Start the stream again from (its seed, its name, `event`). */
  restart: (event?: string) => void;
}

/**
 * cyrb128: a 128-bit string hash, used here only to spread a seed, a name and
 * an event over sfc32's four state words. Not cryptographic, and nothing here
 * needs it to be.
 */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Outputs thrown away after seeding, so a seed of 0 or 1 has mixed through. */
const WARMUP = 12;

/**
 * One generator, and the handle that re-keys it. `start` is kept out of the
 * `Rng` a caller holds: which seed a stream runs on is the show's business,
 * and a caller can only restart it on an event, never point it elsewhere.
 */
function generator(name: string): { rng: Rng; start: (seed: number, event: string) => void } {
  let a = 0, b = 0, c = 0, d = 0, n = 0, keyedOn = 0;
  const float = (): number => {
    // sfc32, one step. The counter `d` is what rules out short cycles.
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    n++;
    return (t >>> 0) / 4294967296;
  };
  const start = (seed: number, event: string): void => {
    keyedOn = seed >>> 0;
    [a, b, c, d] = cyrb128(`${keyedOn}\u0001${name}\u0001${event}`);
    for (let i = 0; i < WARMUP; i++) float();
    n = 0;
  };
  const rng: Rng = {
    name,
    get draws() { return n; },
    float,
    range: (lo, hi) => lo + float() * (hi - lo),
    int: (k) => Math.floor(float() * k),
    pick: <T>(list: readonly T[]): T => list[Math.floor(float() * list.length)],
    chance: (p) => float() < p,
    angle: () => float() * Math.PI * 2,
    centred: () => float() - 0.5,
    signed: () => float() * 2 - 1,
    restart: (event = '') => start(keyedOn, event),
  };
  return { rng, start };
}

/**
 * A generator decided by (seed, name, event) and nothing else, not registered
 * anywhere: a reseed or a look being laid does not touch it. For checks, and
 * for the few things that must be a pure function of the seed alone (the
 * noise table, what an object draws while it is being constructed).
 */
export function makeRng(seed: number, name: string, event = ''): Rng {
  const g = generator(name);
  g.start(seed, event);
  return g.rng;
}

/**
 * `?seed=` as a seed. A whole number is itself mod 2^32, so the value the page
 * reports can be pasted back; anything else is hashed, so a render can have a
 * name. Empty or absent is null: draw one.
 */
export function parseSeed(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const s = raw.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(BigInt(s) % 4294967296n);
  return cyrb128(s)[0];
}

/** Once a load: crypto where there is some, the clock where there is not. */
function drawStartupSeed(): number {
  try {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] >>> 0;
  } catch { /* no crypto on this page: the clock below */ }
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  return (Date.now() ^ Math.floor((perf ? perf.now() : 0) * 1000)) >>> 0;
}

/** Put the seed where a harness, or a person with the console open, can read it. */
function publish(seed: number): void {
  if (typeof window === 'undefined') return;
  try { (window as unknown as { __cgSeed?: number }).__cgSeed = seed; } catch { /* a frozen window: nothing to do */ }
}

let current: number | null = null;
const streams = new Map<string, ReturnType<typeof generator>>();
/*
  The restarts since the seed was set, latest last, one per prefix: what a
  stream made *after* a restart must start from.

  Without this, a stream's sequence depended on whether it happened to exist
  when the look was laid. The palette's is first asked for by the first drop
  of colour; a second layer's is first asked for when the layer is turned on.
  Made after the restart, such a stream started from (seed, name, '') while
  the same stream made before it started from (seed, name, look) — so the
  same seed and the same look gave two different plates depending on the
  order things were first touched in. `npm run seed` caught exactly that: six
  of the libraries failed "seed 5 twice is the same" until a new stream took
  its start from here.
*/
let restarts: { prefix: string; event: string }[] = [];
const eventFor = (name: string): string => {
  for (let i = restarts.length - 1; i >= 0; i--) if (name.startsWith(restarts[i].prefix)) return restarts[i].event;
  return '';
};

/**
 * The seed tonight's show is running on. The first call decides it: from
 * `?seed=` when the page has one, otherwise drawn fresh.
 */
export function showSeed(): number {
  if (current === null) {
    let asked: number | null = null;
    try {
      if (typeof window !== 'undefined') asked = parseSeed(new URLSearchParams(window.location.search).get('seed'));
    } catch { /* no address to read */ }
    current = asked ?? drawStartupSeed();
    publish(current);
  }
  return current;
}

/**
 * Run the show on `seed` from here: every stream starts again from
 * (seed, its name, ''), as if the page had just loaded with `?seed=<seed>`.
 */
export function setShowSeed(seed: number): void {
  current = seed >>> 0;
  publish(current);
  restarts = [];
  for (const g of streams.values()) g.start(current, '');
}

/**
 * The stream called `name`, made on first ask and the same object after that,
 * so a module can hold on to it (a constant at the top of a file is fine) and
 * still follow every reseed and restart, which re-key it in place.
 */
export function stream(name: string): Rng {
  let g = streams.get(name);
  if (!g) {
    g = generator(name);
    g.start(showSeed(), eventFor(name));
    streams.set(name, g);
  }
  return g.rng;
}

/**
 * How many numbers the stream called `name` has drawn since it was last
 * (re)started, or null when nothing has asked for it yet. For a render's
 * frame digest, which must read every stream without making one: `stream`
 * would create a stream that does not exist yet, and a digest that changes
 * the registry it reads is not a reading.
 */
export function streamDraws(name: string): number | null {
  return streams.get(name)?.rng.draws ?? null;
}

/**
 * Restart every stream whose name starts with `prefix` from (seed, name,
 * `event`). The visualizer calls this with `look:<id>` and `plate.` each time
 * it lays a look (see "Restarting, rather than continuing" above). Returns how
 * many streams it restarted, for the check. A stream first asked for later
 * starts from the same event, as if it had been there to be restarted.
 */
export function restartStreams(event: string, prefix = ''): number {
  const seed = showSeed();
  restarts = restarts.filter(r => r.prefix !== prefix);
  restarts.push({ prefix, event });
  let k = 0;
  for (const [name, g] of streams) {
    if (!name.startsWith(prefix)) continue;
    g.start(seed, event);
    k++;
  }
  return k;
}
