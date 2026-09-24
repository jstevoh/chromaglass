/**
 * Macro camera — the "closeup" cinematography for ChromaGlass.
 *
 * The fluid solver runs on a coarse grid covering the whole plate. This module
 * picks one isolated bead of dye out of that grid, locks a virtual camera onto
 * it, and hands the renderer a center + zoom so the frame is filled by a single
 * travelling drop instead of the whole plate.
 *
 * Behaviour it aims for (macro liquid videography):
 *   - the camera rides *with* the bead, so the bead sits still while the world
 *     rushes past it,
 *   - when the bead dissolves or its screen time runs out, the camera whips to
 *     a fresh bead: a fast pan with a short dolly-out that hides the cut,
 *   - a slow zoom breathe keeps the frame from ever looking locked off.
 *
 * Everything here works in grid cells; `update()` returns fluid-UV (0..1) so
 * the shader can use it directly as its sampling center.
 */

export interface MacroField {
  /** Total dye density per cell. */
  density: Float32Array;
  /** Velocity field, same layout as density. */
  vx: Float32Array;
  vy: Float32Array;
  /** Grid edge length (density.length === size * size). */
  size: number;
}

export interface MacroCameraOptions {
  /** Magnification. 1 = the normal plate-wide framing. */
  zoom: number;
  /** 0 = lazy drift, 1 = whip-fast follow. */
  chase: number;
  /** Seconds to stay on one bead before cutting to another. */
  hold: number;
  /** Audio energy 0..1 — a slow push-in and faster cutting in loud passages. */
  energy?: number;
  /**
   * Music sync 0..1. At 0 the camera keeps its own time; at 1 it cuts on
   * kicks, punches in with the bass, chases harder when the track is loud
   * and picks up a handheld tremor from the treble.
   */
  sync?: number;
  /** Bass level 0..1 this frame, and whether a kick landed on it. */
  bass?: number;
  beat?: boolean;
  /** Treble level 0..1 — the tremor. */
  treble?: number;
  /**
   * Density that counts as bare ground. The renderer exposes the closeup
   * against this same level, so tracking it keeps the camera on what the
   * viewer can actually see rather than on an invisible thin wash.
   */
  floor?: number;
  /** Visible fraction of the grid at zoom 1, used to keep the frame in bounds. */
  spanX: number;
  spanY: number;
}

export interface MacroShot {
  /** Camera center in fluid UV (0..1). */
  cx: number;
  cy: number;
  /** Effective zoom after breathe / whip / audio modulation. */
  zoom: number;
  /** 1 right after a cut, decaying to 0 — lets the renderer react to the whip. */
  whip: number;
}

/** Ignore this fraction of the grid at each edge — the solver's walls live there. */
const EDGE_MARGIN = 0.1;
/** Radius (cells) of the window used to re-centre on the bead each frame. */
const TRACK_RADIUS = 7;
/** Radius (cells) used to measure how isolated a candidate bead is. */
const CONTRAST_RADIUS = 6;
/** Seconds a whip takes to settle. */
const WHIP_TIME = 0.7;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export class MacroCamera {
  /** Camera center, grid cells. */
  private camX = 0;
  private camY = 0;
  /** Current subject, grid cells. */
  private beadX = 0;
  private beadY = 0;
  /** Dye mass in the tracking window when the bead was acquired. */
  private beadMass = 0;
  private holdLeft = 0;
  private whipLeft = 0;
  /** Seconds since the last cut, so a kick can't cut twice in a bar. */
  private sinceCut = 0;
  /** A kick's push-in, decaying. */
  private punchLeft = 0;
  private tremorX = 0;
  private tremorY = 0;
  private clock = 0;
  /** Density counted as bare ground, mirrored from the renderer's exposure. */
  private floor = 0;
  private smoothZoom = 0;
  private initialized = false;
  private lastStep = 1 / 60;

  /** Force a cut to a new bead on the next update (preset change, drain, seed). */
  reset() {
    this.sinceCut = 0;
    this.punchLeft = 0;
    this.tremorX = 0;
    this.tremorY = 0;
    this.initialized = false;
    this.holdLeft = 0;
    this.whipLeft = 0;
  }

  update(field: MacroField, dt: number, opts: MacroCameraOptions): MacroShot {
    const { size } = field;
    const step = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.25);
    /*
      Not-a-number is sticky here, and it was black.

      Every position in this camera is eased — `camX += (target - camX) * k` —
      so one NaN, from a velocity the solver had not settled or a frame time
      that was not a number, made the camera's position NaN for good, and the
      shader sampled nowhere: Macro Bead drew a black screen, with `shot`
      reading { cx: NaN, cy: NaN } in the owner's report. Anything not finite
      is put back on a real place instead — the bead, or the middle.
    */
    if (!Number.isFinite(this.beadX) || !Number.isFinite(this.beadY)) { this.beadX = size / 2; this.beadY = size / 2; }
    if (!Number.isFinite(this.camX) || !Number.isFinite(this.camY)) { this.camX = this.beadX; this.camY = this.beadY; }
    if (!Number.isFinite(this.clock)) this.clock = 0;
    if (!Number.isFinite(this.tremorX) || !Number.isFinite(this.tremorY)) { this.tremorX = 0; this.tremorY = 0; }
    if (!Number.isFinite(this.smoothZoom) || this.smoothZoom < 1) this.smoothZoom = Math.max(1, Number.isFinite(opts.zoom) ? opts.zoom : 1);
    this.lastStep = Math.max(1 / 240, step);
    this.clock += step;
    this.floor = Math.max(0, opts.floor ?? 0);

    if (!this.initialized) {
      this.acquire(field, null, opts.hold);
      this.camX = this.beadX;
      this.camY = this.beadY;
      this.smoothZoom = opts.zoom;
      this.initialized = true;
      this.whipLeft = 0;
    }

    const sync = clamp(opts.sync ?? 0, 0, 1);
    const energy = clamp(opts.energy ?? 0, 0, 1);
    const bass = clamp(opts.bass ?? 0, 0, 1);
    const treble = clamp(opts.treble ?? 0, 0, 1);

    // ── Stay on the bead ────────────────────────────────────────────
    const tracked = this.recenter(field);
    // Loud passages spend the hold a little faster, so a chorus cuts sooner than a verse.
    this.holdLeft -= step * (1 + sync * energy * 0.4);
    this.sinceCut += step;
    this.whipLeft = Math.max(0, this.whipLeft - step);
    this.punchLeft = Math.max(0, this.punchLeft - step / 0.6);

    const margin = size * EDGE_MARGIN;
    const lostIt = tracked.mass < this.beadMass * 0.18 || tracked.mass < 0.5;
    const ranAground =
      this.beadX < margin || this.beadX > size - margin ||
      this.beadY < margin || this.beadY > size - margin;

    // A kick can bring the cut forward once the shot has had a fair run —
    // most of the way through its hold at low sync, half of it at full — so
    // the edit lands on the music instead of a private timer. Never sooner
    // than two seconds: a cut a beat is a strobe, not an edit.
    const minRun = Math.max(2, opts.hold * (0.95 - 0.5 * sync));
    const beatCut = !!opts.beat && sync > 0.05 && this.sinceCut >= minRun && bass > 0.6;
    // Only a strong kick punches in, and gently.
    if (opts.beat && bass > 0.6) this.punchLeft = Math.max(this.punchLeft, (bass - 0.6) * 2.5 * sync);

    if (lostIt || ranAground || this.holdLeft <= 0 || beatCut) {
      const from = { x: this.beadX, y: this.beadY };
      this.acquire(field, from, opts.hold);
      this.sinceCut = 0;
      const jumped = Math.hypot(this.beadX - from.x, this.beadY - from.y);
      // Only call it a cut if the camera actually has somewhere to travel.
      if (jumped > size * 0.06) this.whipLeft = WHIP_TIME;
    }

    // ── Lead the subject so a fast bead never trails off-frame ──────
    const bi = this.gridIndex(this.beadX, this.beadY, size);
    const lead = 6 + opts.chase * 10;
    const vx = field.vx[bi], vy = field.vy[bi];
    const targetX = this.beadX + (Number.isFinite(vx) ? vx : 0) * lead;
    const targetY = this.beadY + (Number.isFinite(vy) ? vy : 0) * lead;

    // ── Follow ─────────────────────────────────────────────────────
    const whip = this.whipLeft / WHIP_TIME;
    // The chase tightens when the track is loud. Slow by default: a macro
    // rig on a bead is a heavy thing on a slider, not a hand-held phone.
    const rate = (1.0 + opts.chase * 5) * (1 + whip * 1.8) * (1 + sync * energy * 0.4);
    const k = 1 - Math.exp(-rate * step);
    this.camX += (targetX - this.camX) * k;
    this.camY += (targetY - this.camY) * k;

    // ── Handheld tremor from the treble ────────────────────────────
    // A few cells of drift at three unrelated rates, scaled by the highs, so
    // hi-hats read as a hand that is never quite still.
    const tremorAmp = size * 0.0012 * sync * treble;
    const tx = (Math.sin(this.clock * 3.1) + Math.sin(this.clock * 7.3 + 1.3) * 0.5) * tremorAmp;
    const ty = (Math.sin(this.clock * 3.9 + 0.7) + Math.sin(this.clock * 6.4 + 2.1) * 0.5) * tremorAmp;
    this.tremorX += (tx - this.tremorX) * (1 - Math.exp(-8 * step));
    this.tremorY += (ty - this.tremorY) * (1 - Math.exp(-8 * step));

    // ── Zoom: slow breathe, a dolly-out through each whip, the music's push ──
    const breathe = 1 + Math.sin(this.clock * 0.37) * 0.08 + Math.sin(this.clock * 0.11 + 1.7) * 0.05;
    const dolly = 1 - Math.sin(whip * Math.PI) * 0.22;
    // A slow push with the energy, and a strong kick's push-in that eases back.
    const push = 1 + energy * (0.05 + sync * 0.05);
    const punch = 1 + this.punchLeft * this.punchLeft * 0.06;
    const wantZoom = Math.max(1, opts.zoom * breathe * dolly * push * punch);
    // The punch is quicker in than out; everything eases.
    const zoomRate = wantZoom > this.smoothZoom ? 4 + sync * 4 : 3;
    this.smoothZoom += (wantZoom - this.smoothZoom) * (1 - Math.exp(-zoomRate * step));

    // ── Keep the frame on the plate ────────────────────────────────
    const halfX = clamp(opts.spanX / this.smoothZoom, 0, 1) * 0.5;
    const halfY = clamp(opts.spanY / this.smoothZoom, 0, 1) * 0.5;
    const cx = this.frameClamp((this.camX + this.tremorX) / size, halfX);
    const cy = this.frameClamp((this.camY + this.tremorY) / size, halfY);

    // And whatever got through, the shot itself is never not a place.
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return { cx: 0.5, cy: 0.5, zoom: Math.max(1, Number.isFinite(this.smoothZoom) ? this.smoothZoom : 1), whip: 0 };
    return { cx, cy, zoom: this.smoothZoom, whip };
  }

  /**
   * Density-weighted centroid in a small window around the current bead.
   * Squaring the weight makes the camera lock onto the bead's core rather than
   * sliding toward whatever larger pool happens to drift into the window.
   */
  private recenter(field: MacroField): { mass: number } {
    const { density, size } = field;
    const bx = Math.round(this.beadX), by = Math.round(this.beadY);
    const x0 = Math.max(1, bx - TRACK_RADIUS), x1 = Math.min(size - 2, bx + TRACK_RADIUS);
    const y0 = Math.max(1, by - TRACK_RADIUS), y1 = Math.min(size - 2, by + TRACK_RADIUS);

    let sum = 0, sx = 0, sy = 0;
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        const d = density[i + j * size] - this.floor;
        if (!(d > 0.02)) continue;   // also skips a cell that is not a number
        const w = d * d;
        sum += w;
        sx += i * w;
        sy += j * w;
      }
    }
    if (sum > 0) {
      // Blend rather than snap — a hard centroid jitters on turbulent dye —
      // and blend by time, not by frame, so 120 Hz is no twitchier than 30.
      const k = 1 - Math.exp(-this.lastStep * 6);
      this.beadX += (sx / sum - this.beadX) * k;
      this.beadY += (sy / sum - this.beadY) * k;
    }
    return { mass: sum };
  }

  /**
   * Pick the most photogenic bead on the plate: dense, compact, and away from
   * the walls. `avoid` (the bead we are leaving) is penalised so successive
   * shots land somewhere new.
   */
  private acquire(field: MacroField, avoid: { x: number; y: number } | null, hold: number) {
    const { density, size } = field;
    const margin = Math.floor(size * EDGE_MARGIN) + CONTRAST_RADIUS;
    const r = CONTRAST_RADIUS;
    let bestScore = -Infinity;
    let bestX = size / 2, bestY = size / 2;

    for (let j = margin; j < size - margin; j += 3) {
      for (let i = margin; i < size - margin; i += 3) {
        const d = density[i + j * size] - this.floor;
        if (!(d >= 0.1)) continue;   // also skips a cell that is not a number

        // A bead falls off toward its rim; the middle of a wide pool does not.
        const ring = Math.max(0,
          (density[i + r + j * size] + density[i - r + j * size] +
           density[i + (j + r) * size] + density[i + (j - r) * size]) * 0.25 - this.floor);
        const compactness = clamp((d - ring) / (d + 0.001), 0, 1);

        /*
          Raw density here is not what blacks the closeup out, and the control
          is worth keeping because the arithmetic says otherwise.

          `d` runs to the 6.0 clamp and `compactness` cannot pass 1, so the
          middle of a saturated pool scores 6.0 * 0.25 = 1.5 while a real bead
          at d = 0.5 scores 0.5 * 2.0 = 1.0 — which reads as a proof that a
          filled plate makes the camera cut into its flattest place. Scoring on
          the fall-off instead (`(d - ring) * (0.25 + compactness * 1.75)`),
          which is zero for a uniform pool, changed nothing: measured by
          `npm run closeup` over a filled plate, three toggles a look, the
          worst frame went 100% -> 100% on soap-film, 96% -> 96% on classic,
          68% -> 60% on galaxy, and classic's median frame got *worse*, 35% ->
          82%. So the subject it picks is not what fills the frame.

          The fault is real and reproducible — `npm run gig` has killed a show
          on the macro-toggle alone, twice, over a plate 96% wet with 125
          colours on it — but it is not here.

          Nor is it that a look built for the whole plate has nothing to resolve
          this close, which was the next suspect. Flatness against magnification
          on one plate, eight frames a step, peaks in the middle and comes back
          down: soap-film 10% at 1x, 60% at 2x, 30% at 4x, 27% at 8x, and
          classic 7%, 50%, 40%, 25%. Deeper is not flatter.

          What is left is that it happens to *some shots and not others*. Over
          fourteen seconds at 4x, soap-film's median frame is 19% in one colour
          and its worst is 100% — the camera cuts on a hold of about two
          seconds, so roughly every other reading catches a bad one. So the
          question is not how close it goes or which pool it prefers, but what
          a shot looks like in the moment it lands: whether the frame is one
          colour while the ease is still running, or whether some subjects are
          simply uniform all the way across at that magnification.
        */
        let score = d * (0.25 + compactness * 1.75);
        if (avoid) {
          const dist = Math.hypot(i - avoid.x, j - avoid.y);
          if (dist < size * 0.12) score *= 0.15;   // don't cut back to the same drop
        }
        score *= 0.75 + Math.random() * 0.5;       // keeps repeat runs from looking scripted

        if (score > bestScore) {
          bestScore = score;
          bestX = i;
          bestY = j;
        }
      }
    }

    this.beadX = bestX;
    this.beadY = bestY;
    this.beadMass = this.recenter(field).mass;
    // Jittered hold — cuts should never land on a metronome.
    this.holdLeft = Math.max(0.6, hold * (0.7 + Math.random() * 0.6));
  }

  private gridIndex(x: number, y: number, size: number): number {
    const i = clamp(Math.round(x), 1, size - 2);
    const j = clamp(Math.round(y), 1, size - 2);
    return i + j * size;
  }

  /** Centre a frame of half-width `half` inside 0..1, centring it if it doesn't fit. */
  private frameClamp(c: number, half: number): number {
    if (half >= 0.5) return 0.5;
    return clamp(c, half, 1 - half);
  }
}
