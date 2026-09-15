/**
 * The room, as a sensor.
 *
 * The camera has always been on the plate as a slide — the film projector
 * shows it through the dye — but nothing read it back, so the room in front of
 * the glass could not touch the liquid. This module reads it back.
 *
 * Pixels in, a reading out: no DOM, no WebGL, no video element. The hook owns
 * the camera and hands over one small frame at a time; everything here is
 * arithmetic over that frame, which is what lets it be measured and tuned
 * without a browser in the way.
 *
 * What comes out of a pair of frames:
 *
 *   - a **flow lattice**, Lucas–Kanade per cell. One pass over the pixels
 *     accumulating the structure tensor, rather than a block search, so the
 *     cost is the size of the frame and not the size of the search radius.
 *   - a **presence mask** against a background that creeps toward the frame at
 *     a fixed rate — a running median in all but name. It survives the house
 *     lights coming up, and unlike frame differencing it sees a person who is
 *     standing still. Not forever: any adaptive background eventually absorbs
 *     someone who does not move, and it is the *tracker* that holds them
 *     after that, by coasting a track it knows is not going anywhere.
 *   - **scalars** for everything else worth mapping: how much is happening,
 *     where, which way, how spread out, how many people, how bright the room
 *     is and what colour it is.
 *
 * Motion energy is normalised against the room's own recent range, the way
 * `autoCalibrate` does for the microphone. A rehearsal room with the lights on
 * and a dark venue with a strobe are orders of magnitude apart and no fixed
 * threshold serves both.
 *
 * Mirroring is not here: the hook draws the video flipped when the camera
 * faces the audience, so by the time a frame arrives it is already the way
 * round the plate should see it.
 */

/** A person the sensor is holding on to, in frame coordinates (0..1). */
export interface ScenePerson {
  /** Stable while the sensor keeps hold of them — the dye follows this. */
  id: number;
  x: number;
  y: number;
  /** Frame widths per second, smoothed. */
  vx: number;
  vy: number;
  /** Share of the frame they take up, 0..1. */
  area: number;
  /** Seconds tracked. */
  age: number;
  /** Seconds spent below the moving threshold — a hand held on the glass. */
  still: number;
  /** True only on the frame they were first seen. */
  fresh: boolean;
}

export interface SceneReading {
  /** Lattice edge: flow arrays are `lattice * lattice`, row-major, top-left first. */
  lattice: number;
  /**
   * Flow per cell, deadzoned and smoothed in time, nominally in frame widths
   * per second. Nominally, because Lucas–Kanade linearises: past a pixel or so
   * of displacement per frame it under-reads, and `scripts/scene.mjs` measures
   * a bar crossing at 0.6 frame widths a second as about 0.1. Read it as a
   * direction with a magnitude comparable between cells and between frames,
   * not as a calibrated speed — what rides it scales it anyway.
   */
  flowX: Float32Array;
  flowY: Float32Array;
  /** How much changed in each cell this frame, 0..1. */
  motion: Float32Array;

  /** Motion energy normalised against the room's own recent range, 0..1. */
  energy: number;
  /** The same before normalisation — what the meter in the panel shows. */
  raw: number;
  /** Where the motion is, 0..1 across the frame. Holds its last value when still. */
  centroidX: number;
  centroidY: number;
  /** Which way the room is moving as a whole, −1..1 per axis. */
  dirX: number;
  dirY: number;
  /** 0 = all the motion in one place, 1 = the whole frame busy. */
  spread: number;
  /** Mean luma, 0..1. */
  brightness: number;
  /** The frame's colour centroid as a hue, 0..1, and how saturated it is. */
  hue: number;
  chroma: number;

  people: ScenePerson[];
  /** People, as a 0..1 fraction of the most the sensor will hold. */
  crowd: number;

  /** `performance.now()`-style stamp the caller passed in, so the plate can ignore a stale reading. */
  at: number;
  /** Milliseconds the last analysis took. */
  ms: number;
  /** False until two frames have been seen. */
  ready: boolean;
}

export interface SceneSenseOptions {
  /** Motion below this is the room breathing, not a person. 0..1. */
  deadzone: number;
  /** How much the flow lattice is smoothed in time. 0 = raw, 1 = treacle. */
  smooth: number;
  /** Run the presence and tracking pass. Off is cheaper by about a third. */
  people: boolean;
}

/** Lattice edge. 24² is 576 vectors — finer than the eye reads on a plate. */
const LATTICE = 24;
/** Presence mask resolution, as a divisor of the frame. */
const MASK_STEP = 2;
/** The most people the sensor will hold at once. */
const MAX_PEOPLE = 6;
/** A blob smaller than this share of the frame is noise, not a person. */
const MIN_AREA = 0.004;
/**
 * And a blob larger than this is the light changing, not a person. A strobe,
 * a camera's auto-exposure catching up or the house lights coming on all lift
 * the whole frame off the background at once, and without this the sensor
 * reports the flash as one enormous dancer standing in the middle.
 */
const MAX_AREA = 0.55;
/** How fast the background creeps toward the frame, luma units per second. */
const BG_RATE = 26;
/**
 * Seconds a track survives with no detection to match it, once it has been
 * standing still.
 *
 * Any adaptive background absorbs someone who stops moving — at `BG_RATE` a
 * figure well clear of the room takes about five seconds — and holding the
 * background back where a person is standing only trades that for a trail of
 * ghosts along the way they walked in. So the mask is left alone and the
 * *tracker* does the holding: a track that was still when its detection went
 * needs no detection to say where it is, because it is not going anywhere.
 *
 * It does mean the plate forgets a hand held on the glass for longer than
 * this. Moving brings it back.
 */
const STILL_GRACE = 5.0;
/** Luma distance from the background that counts as foreground. */
const FG_THRESHOLD = 18;
/** Frame widths per second below which a track counts as still. */
const STILL_SPEED = 0.05;
/** Seconds a track survives without a detection to match it. */
const TRACK_GRACE = 0.5;
/** How far a detection may be from a track (frame widths) and still be it. */
const MATCH_RADIUS = 0.18;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * The room's own range, learned.
 *
 * The floor drops quickly to whatever the quiet moments are and climbs back
 * only slowly, so a still room does not drift up into reading as motion; the
 * ceiling rises at once to a new peak and falls back over tens of seconds, so
 * one wave of an arm does not permanently rescale the room.
 */
class RoomRange {
  private floor = 0;
  private ceil = 0.02;
  private seen = false;

  /** The minimum span, so a perfectly still room cannot divide by nothing. */
  private static readonly MIN_SPAN = 0.006;

  normalise(raw: number, dt: number): number {
    if (!this.seen) {
      this.floor = raw;
      this.ceil = raw + RoomRange.MIN_SPAN;
      this.seen = true;
    }
    const fast = 1 - Math.exp(-dt / 0.25);
    const slow = 1 - Math.exp(-dt / 20);
    if (raw < this.floor) this.floor += (raw - this.floor) * fast;
    else this.floor += (raw - this.floor) * slow * 0.25;
    if (raw > this.ceil) this.ceil += (raw - this.ceil) * fast;
    else this.ceil += (raw - this.ceil) * slow;
    const span = Math.max(RoomRange.MIN_SPAN, this.ceil - this.floor);
    return clamp((raw - this.floor) / span, 0, 1);
  }

  reset() {
    this.seen = false;
    this.floor = 0;
    this.ceil = 0.02;
  }
}

export class SceneSense {
  private width = 0;
  private height = 0;
  private luma: Float32Array = new Float32Array(0);
  private prev: Float32Array = new Float32Array(0);
  private bg: Float32Array = new Float32Array(0);
  private mask: Uint8Array = new Uint8Array(0);
  private labels: Int32Array = new Int32Array(0);
  private stack: Int32Array = new Int32Array(0);
  private frames = 0;

  private readonly flowRaw = { x: new Float32Array(LATTICE * LATTICE), y: new Float32Array(LATTICE * LATTICE) };
  private readonly range = new RoomRange();
  private tracks: (ScenePerson & { missing: number })[] = [];
  private nextId = 1;

  private readonly out: SceneReading = {
    lattice: LATTICE,
    flowX: new Float32Array(LATTICE * LATTICE),
    flowY: new Float32Array(LATTICE * LATTICE),
    motion: new Float32Array(LATTICE * LATTICE),
    energy: 0, raw: 0,
    centroidX: 0.5, centroidY: 0.5,
    dirX: 0, dirY: 0,
    spread: 0,
    brightness: 0,
    hue: 0, chroma: 0,
    people: [],
    crowd: 0,
    at: 0, ms: 0,
    ready: false,
  };

  /** Forget the room: a new camera, a new venue, or the sensor switched back on. */
  reset() {
    this.frames = 0;
    this.range.reset();
    this.tracks = [];
    this.out.people = [];
    this.out.ready = false;
    this.out.flowX.fill(0);
    this.out.flowY.fill(0);
    this.out.motion.fill(0);
    this.flowRaw.x.fill(0);
    this.flowRaw.y.fill(0);
  }

  private ensure(width: number, height: number) {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    const n = width * height;
    this.luma = new Float32Array(n);
    this.prev = new Float32Array(n);
    this.bg = new Float32Array(n);
    const mw = Math.ceil(width / MASK_STEP), mh = Math.ceil(height / MASK_STEP);
    this.mask = new Uint8Array(mw * mh);
    this.labels = new Int32Array(mw * mh);
    this.stack = new Int32Array(mw * mh);
    this.frames = 0;
  }

  /**
   * One frame. `rgba` is the frame as read back from a small canvas, `dt` the
   * seconds since the last one, `at` a monotonic stamp the caller will compare
   * against later to decide whether the reading is still worth acting on.
   *
   * The returned object is reused every call — read it, don't keep it.
   */
  push(rgba: Uint8ClampedArray, width: number, height: number, dt: number, at: number, opts: SceneSenseOptions): SceneReading {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    this.ensure(width, height);
    const step = clamp(dt, 1 / 240, 0.5);
    const out = this.out;
    const { luma, prev, bg } = this;
    const n = width * height;

    // ── The frame, as light and as colour ───────────────────────────
    let sumL = 0, sumR = 0, sumG = 0, sumB = 0;
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
      const l = r * 0.299 + g * 0.587 + b * 0.114;
      luma[i] = l;
      sumL += l; sumR += r; sumG += g; sumB += b;
    }
    out.brightness = sumL / (n * 255);
    {
      // The colour centroid as a hue, with how far off grey it is. A room lit
      // red reads as red without having to look at any one pixel.
      const r = sumR / n, g = sumG / n, b = sumB / n;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const d = max - min;
      out.chroma = max <= 0 ? 0 : clamp(d / max, 0, 1);
      let h = 0;
      if (d > 0.5) {
        if (max === r) h = ((g - b) / d + 6) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h /= 6;
      }
      out.hue = h;
    }

    // The first frame has nothing to be different from.
    if (this.frames === 0) {
      prev.set(luma);
      bg.set(luma);
      this.frames = 1;
      out.ready = false;
      out.at = at;
      out.ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
      return out;
    }
    this.frames++;

    // ── Flow, Lucas–Kanade over each lattice cell ───────────────────
    // The structure tensor is accumulated in one pass over the frame: every
    // pixel adds to whichever cell it falls in, so the cost does not depend on
    // how far anything moved. Solving the 2×2 per cell afterwards is 576
    // divisions, which is nothing.
    const L = LATTICE, cells = L * L;
    const sxx = scratch(cells, 0), syy = scratch(cells, 1), sxy = scratch(cells, 2);
    const sxt = scratch(cells, 3), syt = scratch(cells, 4), sabs = scratch(cells, 5), cnt = scratch(cells, 6);
    sxx.fill(0); syy.fill(0); sxy.fill(0); sxt.fill(0); syt.fill(0); sabs.fill(0); cnt.fill(0);

    const cw = width / L, ch = height / L;
    let motionSum = 0;
    for (let y = 1; y < height - 1; y++) {
      const cy = Math.min(L - 1, (y / ch) | 0);
      const rowBase = y * width;
      for (let x = 1; x < width - 1; x++) {
        const i = rowBase + x;
        const ix = (luma[i + 1] - luma[i - 1]) * 0.5;
        const iy = (luma[i + width] - luma[i - width]) * 0.5;
        const it = luma[i] - prev[i];
        const c = Math.min(L - 1, (x / cw) | 0) + cy * L;
        sxx[c] += ix * ix;
        syy[c] += iy * iy;
        sxy[c] += ix * iy;
        sxt[c] += ix * it;
        syt[c] += iy * it;
        const a = it < 0 ? -it : it;
        sabs[c] += a;
        cnt[c]++;
        motionSum += a;
      }
    }

    // A 24² lattice over a 96² frame is sixteen pixels a cell, which is not
    // enough to solve a 2×2 system from without it wandering. Rather than
    // coarsen the lattice — the plate wants the resolution — each cell is
    // solved from a 3×3 block of cells' worth of pixels, by box-filtering the
    // accumulated sums across the lattice first. Separable, so it is six
    // arrays over 576 cells twice, and the windows overlap the way a dense
    // optical flow's would.
    // `cnt` stays as it is — the per-cell motion figure is the cell's own, not
    // its neighbourhood's — so the window's pixel count gets its own array.
    const wcnt = scratch(cells, 8);
    wcnt.set(cnt);
    boxLattice(sxx, L); boxLattice(syy, L); boxLattice(sxy, L);
    boxLattice(sxt, L); boxLattice(syt, L); boxLattice(wcnt, L);

    // Regularisation: a blank wall has no gradient to speak of, and without
    // this the solve turns its noise into a gale.
    const REG = 400;
    const dead = clamp(opts.deadzone, 0, 1);
    // A cell's motion has to clear the deadzone before its flow is believed,
    // and the deadzone is in the same units the meter shows.
    const deadLuma = dead * 24;
    const alpha = 1 - Math.exp(-step / (0.03 + clamp(opts.smooth, 0, 1) * 0.6));
    let cx = 0, cy = 0, wsum = 0, dx = 0, dy = 0;
    let maxCell = 0;

    for (let c = 0; c < cells; c++) {
      const count = cnt[c] || 1;
      const mag = sabs[c] / count;                    // mean |Δluma| in the cell
      const m01 = clamp((mag - deadLuma) / 26, 0, 1);
      out.motion[c] = m01;
      if (m01 > maxCell) maxCell = m01;

      let fx = 0, fy = 0;
      if (m01 > 0) {
        const det = sxx[c] * syy[c] - sxy[c] * sxy[c] + REG * (wcnt[c] || 1);
        // Pixels per frame, then frame widths per second.
        const px = (-syy[c] * sxt[c] + sxy[c] * syt[c]) / det;
        const py = (sxy[c] * sxt[c] - sxx[c] * syt[c]) / det;
        fx = clamp(px / width / step, -3, 3);
        fy = clamp(py / height / step, -3, 3);
      }
      this.flowRaw.x[c] += (fx - this.flowRaw.x[c]) * alpha;
      this.flowRaw.y[c] += (fy - this.flowRaw.y[c]) * alpha;
      out.flowX[c] = this.flowRaw.x[c];
      out.flowY[c] = this.flowRaw.y[c];

      if (m01 > 0) {
        const gx = (c % L + 0.5) / L, gy = ((c / L) | 0) + 0.5;
        cx += gx * m01;
        cy += (gy / L) * m01;
        wsum += m01;
        dx += out.flowX[c] * m01;
        dy += out.flowY[c] * m01;
      }
    }

    out.raw = clamp(motionSum / ((width - 2) * (height - 2)) / 32, 0, 1);
    out.energy = this.range.normalise(out.raw, step);
    if (wsum > 0.0001) {
      // The centroid keeps its last position through a still moment rather
      // than snapping to the middle, so anything riding it does not twitch.
      out.centroidX = cx / wsum;
      out.centroidY = cy / wsum;
      out.dirX = clamp(dx / wsum * 4, -1, 1);
      out.dirY = clamp(dy / wsum * 4, -1, 1);
      // Busy everywhere or busy in one place: the share of cells carrying
      // motion, against the strongest cell.
      let lit = 0;
      for (let c = 0; c < cells; c++) if (out.motion[c] > maxCell * 0.35) lit++;
      out.spread = clamp(lit / cells * 3, 0, 1);
    } else {
      out.dirX += (0 - out.dirX) * alpha;
      out.dirY += (0 - out.dirY) * alpha;
      out.spread += (0 - out.spread) * alpha;
    }

    // ── Presence, and the people in it ──────────────────────────────
    if (opts.people) this.trackPeople(step);
    else if (this.tracks.length) { this.tracks = []; out.people = []; }
    out.crowd = out.people.length / MAX_PEOPLE;

    // The background creeps toward the frame whether or not anyone is being
    // tracked, so switching people on mid-show does not start from a blank.
    const creep = BG_RATE * step;
    for (let i = 0; i < n; i++) {
      const d = luma[i] - bg[i];
      bg[i] += d < -creep ? -creep : d > creep ? creep : d;
    }

    prev.set(luma);
    out.ready = this.frames > 2;
    out.at = at;
    out.ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    return out;
  }

  /**
   * Foreground blobs, matched to last frame's people.
   *
   * Nearest centroid within a radius: a crowd is not a tracking problem worth
   * solving properly here, and the only thing the id has to survive is one
   * person walking across a frame. When it does lose them, they come back as a
   * new id with a new dye, which reads as a new dancer rather than as a fault.
   */
  private trackPeople(dt: number) {
    const { width, height, luma, bg, mask, labels, stack } = this;
    const mw = Math.ceil(width / MASK_STEP), mh = Math.ceil(height / MASK_STEP);

    for (let my = 0; my < mh; my++) {
      const sy = my * MASK_STEP;
      for (let mx = 0; mx < mw; mx++) {
        const i = sy * width + mx * MASK_STEP;
        const d = luma[i] - bg[i];
        mask[my * mw + mx] = (d < 0 ? -d : d) > FG_THRESHOLD ? 1 : 0;
      }
    }

    labels.fill(0);
    const total = mw * mh;
    const minCells = Math.max(3, Math.round(MIN_AREA * total));
    type Blob = { x: number; y: number; area: number };
    const blobs: Blob[] = [];

    for (let seed = 0; seed < total; seed++) {
      if (mask[seed] === 0 || labels[seed] !== 0) continue;
      let sp = 0;
      stack[sp++] = seed;
      labels[seed] = 1;
      let sumX = 0, sumY = 0, area = 0;
      while (sp > 0) {
        const p = stack[--sp];
        const px = p % mw, py = (p / mw) | 0;
        sumX += px; sumY += py; area++;
        if (px > 0 && mask[p - 1] && !labels[p - 1]) { labels[p - 1] = 1; stack[sp++] = p - 1; }
        if (px < mw - 1 && mask[p + 1] && !labels[p + 1]) { labels[p + 1] = 1; stack[sp++] = p + 1; }
        if (py > 0 && mask[p - mw] && !labels[p - mw]) { labels[p - mw] = 1; stack[sp++] = p - mw; }
        if (py < mh - 1 && mask[p + mw] && !labels[p + mw]) { labels[p + mw] = 1; stack[sp++] = p + mw; }
      }
      const share = area / total;
      if (share >= MIN_AREA && area >= minCells && share <= MAX_AREA) {
        blobs.push({ x: sumX / area / mw, y: sumY / area / mh, area: share });
      }
    }

    blobs.sort((a, b) => b.area - a.area);
    if (blobs.length > MAX_PEOPLE) blobs.length = MAX_PEOPLE;

    const taken = new Set<number>();
    const smoothV = 1 - Math.exp(-dt / 0.15);
    for (const track of this.tracks) track.fresh = false;

    for (const blob of blobs) {
      let best = -1, bestDist = MATCH_RADIUS;
      for (let i = 0; i < this.tracks.length; i++) {
        if (taken.has(i)) continue;
        const t = this.tracks[i];
        const d = Math.hypot(t.x - blob.x, t.y - blob.y);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      if (best >= 0) {
        const t = this.tracks[best];
        taken.add(best);
        const vx = (blob.x - t.x) / dt, vy = (blob.y - t.y) / dt;
        t.vx += (vx - t.vx) * smoothV;
        t.vy += (vy - t.vy) * smoothV;
        t.x = blob.x; t.y = blob.y; t.area = blob.area;
        t.age += dt;
        t.missing = 0;
        t.still = Math.hypot(t.vx, t.vy) < STILL_SPEED ? t.still + dt : 0;
      } else {
        this.tracks.push({
          id: this.nextId++, x: blob.x, y: blob.y, vx: 0, vy: 0,
          area: blob.area, age: 0, still: 0, fresh: true, missing: 0,
        });
        taken.add(this.tracks.length - 1);
      }
    }

    for (let i = this.tracks.length - 1; i >= 0; i--) {
      if (taken.has(i)) continue;
      const t = this.tracks[i];
      t.missing += dt;
      // Carry them on at their last speed — a person briefly lost behind
      // someone else should not come back as a stranger. Someone who had
      // stopped moving is carried much longer, because the background will
      // have absorbed them and coasting a still track is exact.
      t.x = clamp(t.x + t.vx * dt, 0, 1);
      t.y = clamp(t.y + t.vy * dt, 0, 1);
      if (t.still > 0) t.still += dt;
      if (t.missing > (t.still > 0 ? STILL_GRACE : TRACK_GRACE)) this.tracks.splice(i, 1);
    }

    this.out.people = this.tracks;
  }
}

/**
 * Scratch accumulators for the flow solve, shared across every sensor in the
 * page. There is one camera and one analysis at a time, and allocating seven
 * lattice-sized arrays per frame is the kind of garbage that shows up as a
 * stutter in a show.
 */
/**
 * A 3×3 box filter over a lattice-shaped array, in place, separably. Edges
 * repeat rather than fall off, so a cell at the rim of the frame is solved
 * from the pixels there are rather than from a third as many.
 */
function boxLattice(a: Float32Array, L: number) {
  const tmp = scratch(a.length, 7);
  for (let y = 0; y < L; y++) {
    const r = y * L;
    for (let x = 0; x < L; x++) {
      const l = a[r + (x > 0 ? x - 1 : 0)];
      const c = a[r + x];
      const rr = a[r + (x < L - 1 ? x + 1 : L - 1)];
      tmp[r + x] = l + c + rr;
    }
  }
  for (let x = 0; x < L; x++) {
    for (let y = 0; y < L; y++) {
      const u = tmp[(y > 0 ? y - 1 : 0) * L + x];
      const c = tmp[y * L + x];
      const d = tmp[(y < L - 1 ? y + 1 : L - 1) * L + x];
      // A sum, not a mean: the solve divides one window total by another, and
      // the regularisation is counted in pixels, so both have to be the whole
      // window's worth or the two scale apart.
      a[y * L + x] = u + c + d;
    }
  }
}

const SCRATCH: Float32Array[] = [];
function scratch(size: number, slot: number): Float32Array {
  const have = SCRATCH[slot];
  if (have && have.length === size) return have;
  const made = new Float32Array(size);
  SCRATCH[slot] = made;
  return made;
}

/** The lattice edge, for callers that need to size their own buffers. */
export const SCENE_LATTICE = LATTICE;
/** The most people the sensor will hold, so `crowd` can be read back as a count. */
export const SCENE_MAX_PEOPLE = MAX_PEOPLE;

/**
 * One of the room's features, as a number to put on a setting.
 *
 * Unipolar features come back 0..1 and push a setting one way from where it
 * was. The two directions are −1..1, so the room moves a setting either side
 * of its resting value: the lamp follows the crowd left and right rather than
 * only ever sliding one way.
 */
export function getSceneValue(r: SceneReading, feature: string): number {
  switch (feature) {
    case 'motion': return r.energy;
    case 'spread': return r.spread;
    case 'centroidX': return r.centroidX;
    case 'centroidY': return r.centroidY;
    case 'dirX': return r.dirX;
    case 'dirY': return r.dirY;
    case 'crowd': return r.crowd;
    case 'brightness': return r.brightness;
    case 'sceneHue': return r.hue;
    default: return 0;
  }
}
