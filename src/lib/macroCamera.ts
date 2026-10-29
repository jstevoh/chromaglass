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
 *
 * What the music may do to the frame, and what it may not (the owner,
 * 2026-10-11: the closeup "even bouncier and twitchier than before", the
 * evening after Frame Sway seated the plate's own sway, PLAN 27a-7). A real
 * macro rig over a dish is a camera on a copy stand or a rail: the only
 * thing that moves in the picture is the liquid. Here, Macro Sync had three
 * hands on the frame at its default of 0.5, in every mode: a kick's
 * punch-in, a push with the energy, and a "handheld" tremor from the treble.
 * Driven through a song by `npm run steadycam` (120 bpm, a kick a beat, hats
 * on the eighths) at 6x on a 1440 px frame, the song swayed the frame 0.42%
 * of its width (6 px) and pumped the zoom 3.2% (the frame's edge 23 px); at
 * Macro Bead's 0.85 it was 0.71% and 6.3% (46 px). And the ear hears nearly
 * every kick now where it once heard a third of them (`npm run kicks`,
 * lib/audioFeatures.ts), so the punch landed on every beat. The three are
 * the frame moving with the sound, the very thing Frame Sway was made to
 * gate, so they ride it: `sway` (lib/plateRock.ts, 0 by default and turned
 * up only by a hand) scales the sync's hand on the frame, `move = sync ×
 * sway`. Macro Sync keeps what is an edit and not a move: the cut on a kick
 * and the hold spent faster in a loud passage.
 *
 * The lead was the other jolt. The camera aimed ahead of its subject by the
 * solver's velocity in the subject's one cell times up to sixteen cells, and
 * that velocity carries the music through the liquid (Beat Squeeze's press,
 * the kick's shove) and whatever one cell of a turbulent field reads: a
 * press of half a cell a step under a drop that itself drifted on steadily
 * threw the frame 0.95% of its width (14 px at 6x) in a frame and 1.6% (24
 * px) over the beat, then back, and the drop sat up to 6.8% off centre
 * against 3.6% with no press. A camera operator does not jump ahead when the paint
 * under the subject twitches; they read where the subject is going over a
 * second or so. So the lead is the subject's own motion, the tracked
 * centroid's, smoothed over LEAD_SECONDS, starting from nothing on each new
 * subject; the velocity field is no longer read here at all. Measured the
 * same way: the same press moves the frame by the drop's own drift and
 * nothing more (0.17% a frame with the press and without, the drop within
 * half a percent of centre), and a drop drifting at 15 cells a second sits
 * 3% from the middle of the frame, where it sat 27% off.
 */
import { stream, type Rng } from './rng';

export interface MacroField {
  /** Total dye density per cell. */
  density: Float32Array;
  /**
   * Velocity field, same layout as density. The camera no longer reads it
   * (see the header: the lead is the subject's own motion), so a caller may
   * leave it out; the frame loop still hands it over.
   */
  vx?: Float32Array;
  vy?: Float32Array;
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
  /**
   * How far the music may move the frame, 0..1: Frame Sway (lib/plateRock.ts,
   * `frameSway(settings.frameSway)`). The sync's punch-in, push and tremor
   * are scaled by it; absent is 0, so nothing but a hand on that dial lets
   * the sound move the picture. The sync's cut on a kick is an edit, not a
   * move, and does not need it.
   */
  sway?: number;
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
  /**
   * Who moves the camera.
   *
   *   hold    it sits on the aim, and goes only where it is aimed
   *   follow  it locks onto the liquid under the aim and rides with it, and
   *           never cuts away on its own; aimed again, it locks on there
   *   auto    it picks its own subjects and cuts between them (the old rig)
   *
   * Absent is auto, for anything that drives the camera without saying.
   */
  mode?: 'hold' | 'follow' | 'auto';
  /** Where it is aimed, in plate uv (0..1), for hold and follow. */
  aimX?: number;
  aimY?: number;
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
/**
 * Over how long the subject's velocity is smoothed before the camera leads
 * by it (see the header): about the time an operator takes to read where a
 * drop is going. A kick's press under the drop lasts a quarter of a second
 * and so barely reaches the lead; a drop's drift is read within a second.
 */
const LEAD_SECONDS = 0.6;
/**
 * A held frame is bare glass when the dye in it is under this share of the
 * plate's own average (see `landing` for what was reported). A thin wash
 * reads a fifth to a half of the average and is drawn, since the exposure
 * comes down to what the frame holds; bare glass reads 0.
 */
const BARE_SHARE = 0.1;
/** A plate whose average dye is under this has nothing to land on yet. */
const EMPTY_PLATE = 1e-3;

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
  /** The subject's drift as the lead reads it, grid cells a second, smoothed over LEAD_SECONDS. */
  private leadVx = 0;
  private leadVy = 0;
  /** Where the subject was at the last frame, for its drift; NaN on a new subject. */
  private leadFromX = NaN;
  private leadFromY = NaN;
  private clock = 0;
  /** Density counted as bare ground, mirrored from the renderer's exposure. */
  private floor = 0;
  private smoothZoom = 0;
  private initialized = false;
  private lastStep = 1 / 60;
  /** The aim last acted on (grid cells), so follow locks on again only when it moves. */
  private lastAimX = NaN;
  private lastAimY = NaN;
  /** The grid the camera last ran on, so `centre` can answer in plate uv. */
  private lastSize = 0;
  /**
   * Hold and Follow coming in: whether this closeup still has to check that
   * its aim shows any liquid, and where it landed instead when it did not
   * (grid cells, NaN for on the aim). See `landing`.
   */
  private landPending = true;
  private landX = NaN;
  private landY = NaN;

  /**
   * The jitter on which drop wins a cut and how long the shot holds. Seeded
   * (the show's `plate.macro` stream) so "repeat runs don't look scripted"
   * stays true from one night to the next, and a render of one night is the
   * same film twice: the cut is where the closeup camera goes, which is most
   * of what a macro look shows.
   */
  constructor(private readonly rng: Rng = stream('plate.macro')) {}

  /** Force a cut to a new bead on the next update (preset change, drain, seed). */
  reset() {
    this.sinceCut = 0;
    this.punchLeft = 0;
    this.tremorX = 0;
    this.tremorY = 0;
    this.leadVx = 0;
    this.leadVy = 0;
    this.leadFromX = NaN;
    this.leadFromY = NaN;
    this.initialized = false;
    this.holdLeft = 0;
    this.whipLeft = 0;
    this.lastAimX = NaN;
    this.lastAimY = NaN;
    this.landPending = true;
    this.landX = NaN;
    this.landY = NaN;
  }

  /**
   * `reset`, and the camera's own clock back to 0: a camera as if just made.
   *
   * `reset` is a cut, and a cut keeps the clock running on purpose: the
   * handheld tremor and the breathing zoom are sines of it, and restarting
   * them on every preset change would jolt the frame. A song render is the
   * other case (VisualizerRender.begin, through `resetPlateClocks`): it
   * has to draw the same film every time, and with the clock left where the
   * live show had run it to, a macro look's tremor and breathing started at
   * whatever phase the room had reached, so the same seed shook the closeup
   * differently in each render. The review that found it read it off this
   * class; the frame digest carries `macroClock` so a render check sees it.
   */
  forget(): void {
    this.reset();
    this.clock = 0;
    this.smoothZoom = 0;
  }

  /** The clock the tremor and breathing are drawn from, in seconds (for a render's frame digest). */
  get time(): number {
    return this.clock;
  }

  /**
   * Where the camera is pointed now, in plate uv (0..1): its own eased centre,
   * without the treble's tremor, or null before it has run.
   *
   * What Hold aims at as it is pressed (`holdWhereItIs`, QA-12). The centre
   * before the frame clamp, as the aim is: `aimed()` clamps the same way, so
   * the shot it draws from this aim is the one already on screen.
   */
  get centre(): { x: number; y: number } | null {
    if (!this.initialized || !(this.lastSize > 0)) return null;
    const x = this.camX / this.lastSize, y = this.camY / this.lastSize;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
  }

  update(field: MacroField, dt: number, opts: MacroCameraOptions): MacroShot {
    const { size } = field;
    this.lastSize = size;
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
    if (!Number.isFinite(this.leadVx) || !Number.isFinite(this.leadVy)) { this.leadVx = 0; this.leadVy = 0; }
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
    const sway = clamp(opts.sway ?? 0, 0, 1);
    // The sync's hand on the frame itself (the punch, the push, the tremor):
    // nothing until Frame Sway is turned up. See the header.
    const move = sync * sway;
    const energy = clamp(opts.energy ?? 0, 0, 1);
    const bass = clamp(opts.bass ?? 0, 0, 1);
    const treble = clamp(opts.treble ?? 0, 0, 1);

    const mode = opts.mode ?? 'auto';
    // Auto finds its own subjects; a later switch to Hold or Follow is a hand
    // on the camera, not the closeup coming in, so it does not land.
    if (mode === 'auto') this.landPending = false;
    if (mode !== 'auto') return this.aimed(field, step, opts, mode, { move, energy, bass, treble });

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
    // Only a strong kick punches in, and gently, and only as far as Frame Sway lets the frame move.
    if (opts.beat && bass > 0.6) this.punchLeft = Math.max(this.punchLeft, (bass - 0.6) * 2.5 * move);

    if (lostIt || ranAground || this.holdLeft <= 0 || beatCut) {
      const from = { x: this.beadX, y: this.beadY };
      this.acquire(field, from, opts.hold);
      this.sinceCut = 0;
      const jumped = Math.hypot(this.beadX - from.x, this.beadY - from.y);
      // Only call it a cut if the camera actually has somewhere to travel.
      if (jumped > size * 0.06) this.whipLeft = WHIP_TIME;
      /*
        An edit is a cut. The travel was crossing bare glass.

        The camera used to ease across to the new subject over the whip, and at
        4x what the frame holds on the way is whatever it is flying over —
        which on a plate that is wet in patches is the dry part. Photographed
        at the moment a shot landed and again a second and a half later, the
        same shot is dye in one corner with three fifths of the frame bare
        plate, and then a proper closeup. Nine shots in ten did that.

        Reported as the screen going one colour on a setting change, and killed
        a show in `npm run gig` twice on the macro-toggle alone. Measured by
        `npm run closeup` over a filled plate, five toggles a look, worst frame
        in one colour: soap-film 80% -> 41%, galaxy 79% -> 69%, and galaxy's
        median 61% -> 46%. A three-run baseline had said galaxy's median got
        *worse*, 27% -> 46%; five runs against five put its own baseline at
        61%, so that was noise in the control rather than a regression.

        `whipLeft` still runs, so the dolly-out through a cut is unchanged --
        the gesture is kept, and only the journey across the dry part is not.
      */
      this.camX = this.beadX;
      this.camY = this.beadY;
    }

    // ── Lead the subject so a fast bead never trails off-frame ──────
    const [targetX, targetY] = this.leadTarget(step, opts.chase);

    // ── Follow ─────────────────────────────────────────────────────
    const whip = this.whipLeft / WHIP_TIME;
    // The chase tightens when the track is loud, as far as Frame Sway lets
    // the music move the frame. Slow by default: a macro rig on a bead is a
    // heavy thing on a slider, not a hand-held phone.
    const rate = (1.0 + opts.chase * 5) * (1 + whip * 1.8) * (1 + move * energy * 0.4);
    const k = 1 - Math.exp(-rate * step);
    this.camX += (targetX - this.camX) * k;
    this.camY += (targetY - this.camY) * k;

    // ── Handheld tremor from the treble ────────────────────────────
    // A few cells of drift at three unrelated rates, scaled by the highs, so
    // hi-hats read as a hand that is never quite still: a hand Frame Sway
    // keeps off the rig by default.
    const tremorAmp = size * 0.0012 * move * treble;
    const tx = (Math.sin(this.clock * 3.1) + Math.sin(this.clock * 7.3 + 1.3) * 0.5) * tremorAmp;
    const ty = (Math.sin(this.clock * 3.9 + 0.7) + Math.sin(this.clock * 6.4 + 2.1) * 0.5) * tremorAmp;
    this.tremorX += (tx - this.tremorX) * (1 - Math.exp(-8 * step));
    this.tremorY += (ty - this.tremorY) * (1 - Math.exp(-8 * step));

    // ── Zoom: slow breathe, a dolly-out through each whip, the music's push ──
    const breathe = 1 + Math.sin(this.clock * 0.37) * 0.08 + Math.sin(this.clock * 0.11 + 1.7) * 0.05;
    const dolly = 1 - Math.sin(whip * Math.PI) * 0.22;
    // A slow push with the energy, and a strong kick's push-in that eases
    // back; both the music's hand on the frame, so both by Frame Sway.
    const push = 1 + energy * (0.05 + sync * 0.05) * sway;
    const punch = 1 + this.punchLeft * this.punchLeft * 0.06;
    const wantZoom = Math.max(1, opts.zoom * this.eased(opts.zoom, breathe * dolly * push * punch));
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
   * The camera someone is holding: on the aim (hold), or on the liquid under
   * it (follow). No cuts, no whip, no breathing zoom; the music may still push
   * in on a kick and shake the frame with the treble, by Macro Sync, because
   * that is a setting the person chose too.
   */
  private aimed(field: MacroField, step: number, opts: MacroCameraOptions, mode: 'hold' | 'follow',
    m: { move: number; energy: number; bass: number; treble: number }): MacroShot {
    const { size } = field;
    const ax = clamp(Number.isFinite(opts.aimX) ? opts.aimX! : 0.5, 0, 1) * size;
    const ay = clamp(Number.isFinite(opts.aimY) ? opts.aimY! : 0.5, 0, 1) * size;
    const aimMoved = !(Math.hypot(ax - this.lastAimX, ay - this.lastAimY) < 0.25);
    const first = !Number.isFinite(this.lastAimX);
    this.lastAimX = ax; this.lastAimY = ay;
    this.whipLeft = 0;
    this.punchLeft = Math.max(0, this.punchLeft - step / 0.6);
    if (opts.beat && m.bass > 0.6) this.punchLeft = Math.max(this.punchLeft, (m.bass - 0.6) * 2.5 * m.move);

    // A hand moving the aim during the closeup is where it wants to look,
    // liquid or not: it is no longer coming in.
    if (aimMoved && !first) { this.landPending = false; this.landX = NaN; this.landY = NaN; }
    const halfCellsX = clamp(opts.spanX / Math.max(1, opts.zoom), 0, 1) * 0.5 * size;
    const halfCellsY = clamp(opts.spanY / Math.max(1, opts.zoom), 0, 1) * 0.5 * size;
    let landed = false;
    if (this.landPending) {
      const plate = this.plateMean(field);
      if (plate > EMPTY_PLATE) {
        this.landPending = false;
        const atX = mode === 'follow' && !first ? this.beadX : ax, atY = mode === 'follow' && !first ? this.beadY : ay;
        if (this.frameMean(field, atX, atY, halfCellsX, halfCellsY) < BARE_SHARE * plate) {
          const l = this.landing(field, ax, ay, halfCellsX, halfCellsY);
          this.landX = l.x; this.landY = l.y; landed = true;
        }
      }
    }
    const wantX = Number.isFinite(this.landX) ? this.landX : ax;
    const wantY = Number.isFinite(this.landY) ? this.landY : ay;

    let targetX = wantX, targetY = wantY;
    if (mode === 'follow') {
      if (aimMoved || landed) this.lockNear(field, wantX, wantY);
      const tracked = this.recenter(field);
      // Lost it (it thinned away, or ran into the wall): find what is nearest
      // where it was, rather than cutting across the plate.
      if (tracked.mass < this.beadMass * 0.18 || tracked.mass < 0.5) this.lockNear(field, this.beadX, this.beadY);
      const margin = size * EDGE_MARGIN;
      this.beadX = clamp(this.beadX, margin, size - margin);
      this.beadY = clamp(this.beadY, margin, size - margin);
      [targetX, targetY] = this.leadTarget(step, opts.chase);
    } else {
      this.beadX = wantX; this.beadY = wantY;
    }
    if (first || landed) { this.camX = targetX; this.camY = targetY; }
    // A hand on the aim should be answered at once; a follow eases like a rig.
    const rate = mode === 'hold' ? 6 + opts.chase * 6 : 1.0 + opts.chase * 5;
    const k = 1 - Math.exp(-rate * step);
    this.camX += (targetX - this.camX) * k;
    this.camY += (targetY - this.camY) * k;

    const tremorAmp = size * 0.0012 * m.move * m.treble;
    const tx = (Math.sin(this.clock * 3.1) + Math.sin(this.clock * 7.3 + 1.3) * 0.5) * tremorAmp;
    const ty = (Math.sin(this.clock * 3.9 + 0.7) + Math.sin(this.clock * 6.4 + 2.1) * 0.5) * tremorAmp;
    this.tremorX += (tx - this.tremorX) * (1 - Math.exp(-8 * step));
    this.tremorY += (ty - this.tremorY) * (1 - Math.exp(-8 * step));

    const push = 1 + m.energy * m.move * 0.08;
    const punch = 1 + this.punchLeft * this.punchLeft * 0.06;
    const wantZoom = Math.max(1, opts.zoom * this.eased(opts.zoom, push * punch));
    const zoomRate = wantZoom > this.smoothZoom ? 4 + m.move * 4 : 3;
    this.smoothZoom += (wantZoom - this.smoothZoom) * (1 - Math.exp(-zoomRate * step));

    const halfX = clamp(opts.spanX / this.smoothZoom, 0, 1) * 0.5;
    const halfY = clamp(opts.spanY / this.smoothZoom, 0, 1) * 0.5;
    const cx = this.frameClamp((this.camX + this.tremorX) / size, halfX);
    const cy = this.frameClamp((this.camY + this.tremorY) / size, halfY);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return { cx: 0.5, cy: 0.5, zoom: Math.max(1, Number.isFinite(this.smoothZoom) ? this.smoothZoom : 1), whip: 0 };
    return { cx, cy, zoom: this.smoothZoom, whip: 0 };
  }

  /** The plate's average dye inside the walls, on every third cell. */
  private plateMean(field: MacroField): number {
    const { density, size } = field;
    const m = Math.floor(size * EDGE_MARGIN);
    let sum = 0, n = 0;
    for (let j = m; j < size - m; j += 3) {
      for (let i = m; i < size - m; i += 3) { const d = density[i + j * size]; if (d > 0) sum += d; n++; }
    }
    return n > 0 ? sum / n : 0;
  }

  /** The average dye in a frame of half-size (hx, hy) cells about (x, y), on every second cell. */
  private frameMean(field: MacroField, x: number, y: number, hx: number, hy: number): number {
    const { density, size } = field;
    const x0 = Math.max(0, Math.floor(x - hx)), x1 = Math.min(size - 1, Math.ceil(x + hx));
    const y0 = Math.max(0, Math.floor(y - hy)), y1 = Math.min(size - 1, Math.ceil(y + hy));
    let sum = 0, n = 0;
    for (let j = y0; j <= y1; j += 2) {
      for (let i = x0; i <= x1; i += 2) { const d = density[i + j * size]; if (d > 0) sum += d; n++; }
    }
    return n > 0 ? sum / n : 0;
  }

  /**
   * Where a closeup coming in on bare glass goes instead: the nearest frame
   * to the aim that holds at least half the dye the plate's fullest frame
   * holds. Grid cells.
   *
   * What was reported (the owner, 2026-10-29): "this closeup button doesn't
   * seem to do anything besides make the canvas black/empty". The Close-up
   * button, the M key, the zoom and the phone's pinch all bring the closeup
   * in on the camera's mode, and the default mode is Hold, aimed at the
   * middle of the plate. Hold sat on its aim and nowhere else, so on a plate
   * whose middle was bare (a look that pours in pools, a middle a finger
   * had swept, a plate between pours) the frame was four times the size of
   * nothing: the exposure, kept under what the frame holds, had nothing to
   * expose, and the picture was the plate's black ground. Measured in the
   * app (software WebGPU, one pool at a fifth of the way across the plate):
   * the frame's mean 1.4 of 255 and no pixel lit, for as long as it was in.
   *
   * The closeup is the liquid seen closer, so coming in it looks for liquid
   * when its aim shows none, as a person at a microscope moves the slide
   * until something is under the lens; once there, Hold holds and Follow
   * rides, as before. Only coming in: a hand that moves the aim during the
   * closeup is obeyed onto bare glass if that is where it points, and a
   * switch of mode mid-closeup is not a landing (`holdWhereItIs`). Nearest
   * rather than fullest, so a look whose middle has a little in it moves no
   * further than it must; at least half the fullest, so it lands on a
   * subject and not on the fringe of one. The frame is the one asked for
   * (the zoom it is going to), not the one easing in from the plate.
   */
  private landing(field: MacroField, ax: number, ay: number, hx: number, hy: number): { x: number; y: number } {
    const { density, size } = field;
    const W = size + 1;
    const sat = new Float64Array(W * W);
    for (let j = 0; j < size; j++) {
      let run = 0;
      for (let i = 0; i < size; i++) {
        const d = density[i + j * size];
        run += d > 0 ? d : 0;
        sat[(j + 1) * W + i + 1] = sat[j * W + i + 1] + run;
      }
    }
    const boxMean = (cx: number, cy: number) => {
      const x0 = clamp(Math.round(cx - hx), 0, size), x1 = clamp(Math.round(cx + hx), 0, size);
      const y0 = clamp(Math.round(cy - hy), 0, size), y1 = clamp(Math.round(cy + hy), 0, size);
      const area = (x1 - x0) * (y1 - y0);
      return area > 0 ? (sat[y1 * W + x1] - sat[y0 * W + x1] - sat[y1 * W + x0] + sat[y0 * W + x0]) / area : 0;
    };
    // Centres the frame can sit on: inside the plate, and its middle off the walls.
    const m = size * EDGE_MARGIN;
    const range = (h: number): [number, number] => {
      const lo = Math.max(h, m), hi = size - Math.max(h, m);
      return lo <= hi ? [lo, hi] : [size / 2, size / 2];
    };
    const [xLo, xHi] = range(hx), [yLo, yHi] = range(hy);
    const stride = Math.max(1, Math.min(hx, hy) / 2);
    const cand: { x: number; y: number; v: number }[] = [];
    let best = 0;
    for (let y = yLo; y <= yHi + 1e-6; y += stride) {
      for (let x = xLo; x <= xHi + 1e-6; x += stride) {
        const v = boxMean(x, y);
        cand.push({ x, y, v });
        if (v > best) best = v;
      }
    }
    let pick = { x: ax, y: ay }, near = Infinity;
    for (const c of cand) {
      if (c.v < 0.5 * best) continue;
      const dist = Math.hypot(c.x - ax, c.y - ay);
      if (dist < near) { near = dist; pick = c; }
    }
    // The nearest such frame has its subject in the corner furthest from the
    // aim (every frame that holds the whole of a pool holds the same dye), so
    // the subject is put in the middle: the frame goes to the centroid of the
    // dye it holds, twice, as a cut lands on a drop's middle (`recenter`).
    let x = pick.x, y = pick.y;
    for (let pass = 0; pass < 2; pass++) {
      const x0 = clamp(Math.floor(x - hx), 0, size - 1), x1 = clamp(Math.ceil(x + hx), 0, size - 1);
      const y0 = clamp(Math.floor(y - hy), 0, size - 1), y1 = clamp(Math.ceil(y + hy), 0, size - 1);
      let sum = 0, sx = 0, sy = 0;
      for (let j = y0; j <= y1; j++) {
        for (let i = x0; i <= x1; i++) { const d = density[i + j * size]; if (d > 0) { sum += d; sx += d * i; sy += d * j; } }
      }
      if (!(sum > 0)) break;
      x = clamp(sx / sum, xLo, xHi); y = clamp(sy / sum, yLo, yHi);
    }
    return { x, y };
  }

  /**
   * Lock onto the densest liquid near (x, y), grid cells: within about a
   * tenth of the plate, nearer counting for more; the point itself if there
   * is none, so a follow aimed at bare glass waits there for something.
   */
  private lockNear(field: MacroField, x: number, y: number) {
    const { density, size } = field;
    const reach = Math.max(4, size * 0.1);
    let best = -Infinity, bx = x, by = y;
    const x0 = Math.max(1, Math.floor(x - reach)), x1 = Math.min(size - 2, Math.ceil(x + reach));
    const y0 = Math.max(1, Math.floor(y - reach)), y1 = Math.min(size - 2, Math.ceil(y + reach));
    for (let j = y0; j <= y1; j += 2) {
      for (let i = x0; i <= x1; i += 2) {
        const d = density[i + j * size] - this.floor;
        if (!(d >= 0.1)) continue;
        const dist = Math.hypot(i - x, j - y);
        if (dist > reach) continue;
        const score = d * (1 - 0.7 * dist / reach);
        if (score > best) { best = score; bx = i; by = j; }
      }
    }
    this.beadX = bx; this.beadY = by;
    this.beadMass = this.recenter(field, true).mass;
    // A new subject: its drift is read afresh, not carried over from the last one's.
    this.leadVx = 0; this.leadVy = 0; this.leadFromX = NaN; this.leadFromY = NaN;
  }

  /**
   * Where the camera aims: the subject, led by its drift so a fast bead
   * never trails off-frame. The drift is the subject's own motion, the
   * tracked centroid's, smoothed over LEAD_SECONDS (see the header: read
   * off the solver's velocity in one cell, a kick's press under the drop
   * threw the frame). Grid cells.
   */
  private leadTarget(step: number, chase: number): [number, number] {
    // The subject's own motion since the last frame, cells a second: where
    // the tracked centroid went, which is what an operator watches.
    const fromX = Number.isFinite(this.leadFromX) ? this.leadFromX : this.beadX;
    const fromY = Number.isFinite(this.leadFromY) ? this.leadFromY : this.beadY;
    const vx = (this.beadX - fromX) / step, vy = (this.beadY - fromY) / step;
    this.leadFromX = this.beadX; this.leadFromY = this.beadY;
    const k = 1 - Math.exp(-step / LEAD_SECONDS);
    this.leadVx += ((Number.isFinite(vx) ? vx : 0) - this.leadVx) * k;
    this.leadVy += ((Number.isFinite(vy) ? vy : 0) - this.leadVy) * k;
    /*
      How far ahead, in seconds of the subject's drift: the rig's own lag.
      The camera eases to its target at `1 + chase × 5` a second and the
      tracked centroid eases to the drop at 6 a second, so on a steady drift
      the drop would sit behind the centre by the drift times the sum of the
      two eases' time constants; led by that, it sits on the centre. The old
      lead, six to sixteen cells per cell a step, was a third of this at the
      default Chase, and a drop drifting at fifteen cells a second sat 27% of
      the frame off centre at 6x; now 3% (`npm run steadycam`).
    */
    const lead = 1 / (1 + chase * 5) + 1 / 6;
    return [this.beadX + this.leadVx * lead, this.beadY + this.leadVy * lead];
  }

  /**
   * Density-weighted centroid in a small window around the current bead.
   * Squaring the weight makes the camera lock onto the bead's core rather than
   * sliding toward whatever larger pool happens to drift into the window.
   */
  private recenter(field: MacroField, snap = false): { mass: number } {
    const { density, size } = field;
    let sum = 0, sx = 0, sy = 0;
    // The window is set about the bead's nearest cell, so where it starts
    // moves the centroid it finds a little; a snap re-windows about what it
    // found until the answer stays put, so a cut lands on the drop's middle
    // whichever lattice cell named it (the note below).
    for (let pass = 0; pass < 6; pass++) {
      const bx = Math.round(this.beadX), by = Math.round(this.beadY);
      const x0 = Math.max(1, bx - TRACK_RADIUS), x1 = Math.min(size - 2, bx + TRACK_RADIUS);
      const y0 = Math.max(1, by - TRACK_RADIUS), y1 = Math.min(size - 2, by + TRACK_RADIUS);
      sum = 0; sx = 0; sy = 0;
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
      if (!snap || !(sum > 0)) break;
      const moved = Math.hypot(sx / sum - this.beadX, sy / sum - this.beadY);
      this.beadX = sx / sum; this.beadY = sy / sum;
      if (moved < 0.01) break;
    }
    if (sum > 0 && !snap) {
      /*
        Blend rather than snap — a hard centroid jitters on turbulent dye —
        and blend by time, not by frame, so 120 Hz is no twitchier than 30.

        Except on a new subject (`snap`): `acquire` picks it on a lattice
        three cells wide with its score jittered, so the cell it names is
        up to a few cells from the drop's middle, and the camera is put on
        that cell at the cut. Blended from there at this rate, the frame
        then slid those few cells over the next half second, and a cut back
        to the same drop (a plate with one subject, whose hold ran out)
        jumped the frame 14% of its width at 6x and slid back; measured by
        `npm run steadycam`, whose Auto camera on one still drop now lands
        on the same place at every cut, so a song timing those cuts moves
        the frame by nothing. A cut lands on the subject's middle.
      */
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
        score *= 0.75 + this.rng.float() * 0.5;       // keeps repeat runs from looking scripted

        if (score > bestScore) {
          bestScore = score;
          bestX = i;
          bestY = j;
        }
      }
    }

    this.beadX = bestX;
    this.beadY = bestY;
    this.beadMass = this.recenter(field, true).mass;
    this.leadVx = 0; this.leadVy = 0; this.leadFromX = NaN; this.leadFromY = NaN;
    // Jittered hold — cuts should never land on a metronome.
    this.holdLeft = Math.max(0.6, hold * (0.7 + this.rng.float() * 0.6));
  }

  private gridIndex(x: number, y: number, size: number): number {
    const i = clamp(Math.round(x), 1, size - 2);
    const j = clamp(Math.round(y), 1, size - 2);
    return i + j * size;
  }

  /** Centre a frame of half-width `half` inside 0..1, centring it if it doesn't fit. */
  /**
   * The breathing, the dolly and the music's push, in proportion to how far in
   * the zoom is: at 1.1x a breath of 13% swung the frame past the plate's edge
   * and back, which read as the first steps of the zoom not being smooth.
   * Fully itself from 2x.
   */
  private eased(zoom: number, mod: number): number {
    return 1 + (mod - 1) * clamp(zoom - 1, 0, 1);
  }

  private frameClamp(c: number, half: number): number {
    if (half >= 0.5) return 0.5;
    return clamp(c, half, 1 - half);
  }
}

type CameraMode = 'hold' | 'follow' | 'auto';

/**
 * The settings patch that switches the closeup to Hold, with the aim set to
 * where the camera is looking now (QA-12).
 *
 * The owner pressed Hold on the zoom chip and the picture jumped. Hold sits on
 * the stored aim (`aimed()` above), and under Follow or Auto the camera had
 * ridden away from that aim, so Hold eased the frame back to it at Hold's
 * quick rate: across the plate, at 3x, in a second. Hold is the mode for "stay
 * there", so it takes the camera's own centre as its aim, and there is
 * nowhere to go. The aim is a setting, not a private place inside the camera,
 * so the Aim sliders say where it is and the drift wanders round the new aim
 * rather than pulling the frame back to the old one.
 *
 * Left alone: a patch that is not a switch to Hold, a Hold that was already
 * on, a patch carrying its own aim (a click on the plate means that place),
 * and no closeup running (`centre` null: the camera is not looking anywhere).
 */
export function holdWhereItIs<T extends { macroCamera?: CameraMode; macroAimX?: number; macroAimY?: number }>(
  patch: T, mode: CameraMode | undefined, centre: () => { x: number; y: number } | null,
): T {
  if (patch.macroCamera !== 'hold' || (mode ?? 'hold') === 'hold') return patch;
  if (patch.macroAimX !== undefined || patch.macroAimY !== undefined) return patch;
  const here = centre();
  return here ? { ...patch, macroAimX: here.x, macroAimY: here.y } : patch;
}

/**
 * Auto's cut, as the zoom chip and the phone's camera buttons name it (QA-11):
 * "5s", "2.5s". The same `max(0.5, macroHold ?? 5)` that LiquidVisualizer hands
 * MacroCamera as `hold`, so the label is the length the camera actually rides
 * a subject for, not the slider's raw value.
 */
export function shotLabel(macroHold: number | undefined): string {
  return `${+Math.max(0.5, macroHold ?? 5).toFixed(1)}s`;
}
