/**
 * Areas that listen for themselves (PLAN 25h): a patch cord aimed at one area
 * of the dish, so a kick works one pool and the mids another.
 *
 * Why this exists. The owner, 2026-10-24: the presets want more complexity,
 * more varied palettes, and parts of the canvas answering the music. Areas
 * (lib/plateAreas.ts) already took the music's hands by band, a kick's ring in
 * the bass well and the mid's stream round the mid pool, but every patch cord
 * moved one number for the whole plate: a kick on Turbulence stirred all of it
 * at once. Imaginando's VS gives each of its layers its own modulation, so a
 * kick drives one and the melody another; the plate's layers are its areas.
 *
 * ## What a cord can do in one place
 *
 * What a projectionist does to one place on a dish, and nothing else:
 *
 *   - **Heat** (`areaHeat`): a heat source held under the spot, a candle or a
 *     hot-air gun. It is heat put into the liquid, in kelvin (the plate's
 *     temperature is in kelvin since PLAN 18f), which the solver then carries,
 *     spreads and cools like the lamp's own (Newton cooling, about 12 s).
 *     What warm liquid does on the plate is what 18f gave it: on an upright
 *     plate it rises (Boussinesq), and in the thin gap it is runnier (water's
 *     viscosity falls about 2% a kelvin; 18f-4 names that this is put on the
 *     whole mobility rather than on the water layer, a shortcut). The surface
 *     pulled away from a warm spot, which is most of what a projectionist's
 *     heat is for, is thermal Marangoni, reverted with 18f and open as 18f-2:
 *     until it lands a heat cord on a level plate warms the pool and thins it,
 *     and opens no hole. Named in the PR, and in PLAN 25h-1.
 *   - **Stir** (`areaStir`): a paddle drawn round in the pool. It is a solid
 *     in the layer (lib/handSolid.ts, the Finger's own Brinkman penalisation),
 *     moving round a circle inside the area at a speed the cord sets, so the
 *     flow is whatever a paddle there makes: the pool is folded and what is
 *     outside it is pushed only as far as a real paddle's wake reaches. Not a
 *     force painted on the cells (a radial push the thin gap's projection
 *     takes out whole, measured in the lab: lib/squish.ts BassPress has the
 *     story) and never a swirl of the whole plate. A gated cord turns the
 *     paddle the other way on each hit, as a hand folds back and forth.
 *   - **Pour** (`areaPour`): dye released into the area from
 *     one of its bottles, its own colour family (`PlateArea.dyes`), as much
 *     as the cord is open. Real dye, laid as every pour is, so it mixes and is
 *     carried as the plate's dye is; on the app it is held under the look's
 *     fill as every music pour is (the regulator, PLAN 28d-A).
 *   - **Bottle** (`areaHue`): which of the area's bottles its pours come from
 *     next. A pigment does not change colour where it lies, so this changes
 *     nothing on the plate by itself: it picks the bottle the next pour, kick
 *     ring or drop in that area is drawn from (`picked`, which the
 *     visualizer's areaCycle reads for the music's own hands there). On the
 *     lead's note (`noteClass`, PLAN 25i) the note picks it, the colour
 *     organ's way: each of the twelve has its bottle.
 *
 * ## An area of a reagent (PLAN 25i)
 *
 * Where an area's liquid is a reagent (Acid, Base, BZ Activator: what changes
 * the colour by its chemistry, not by being coloured), its pour is a drop of
 * that liquid, one a hit, as a pipette lets one go, and no dye at all: on Red
 * Cabbage the snare's acid turns the indicator pink in its well and the kick's
 * base turns it green in the other, and where they meet they cancel; a
 * drop of activator in a BZ gel (Chemical Clock's places, which the kick's
 * own hand touches in turn) fires it and a wave runs out. The colour is the chemistry's, and no hue is turned. It was the area's
 * dye before, so Red Cabbage's snare poured pink cabbage juice into its acid
 * well, a painted pink and not the indicator answering.
 *
 * A setting the solver reads (Turbulence, Viscosity, the Dimmer) is one number
 * per plate, a uniform in the shaders, and making each of them a field over
 * the plate would be a texture per setting in every pass that reads it. These
 * four are what the plate already takes per cell, the deltas every hand and
 * pour lays, so an area cord is a hand in that place rather than a field of a
 * setting. Nothing here moves the frame: each act stays inside its area.
 *
 * ## The gate
 *
 * A cord follows its reading, so on a live room it fires on every boom. The
 * least of PLAN 30a a cord needs to fire on the instrument: a threshold, an
 * attack and a release. The gate opens when the reading crosses the threshold
 * (once: it closes again only `GATE_HYSTERESIS` below, so a reading dithering
 * on the line is one hit, not twenty), rises to the hit's height over the
 * attack and falls from it over the release once closed. With none of the
 * three set the cord follows its reading exactly as every cord before it did.
 *
 * Arithmetic only, no DOM or GPU, so `npm run areacords` drives it with
 * readings it made up, and the lab lays what it returns on the real solver.
 */
import type { AreaTarget, SceneMapping } from '../types';
import { areaFamily, type PlateArea } from './plateAreas.ts';
import { BandRange } from './audioFeatures.ts';
import { isClassFeature } from './hitSource.ts';
import { DEFAULT_LIQUID_TYPES } from '../bottles.ts';

/** The four things a hand does to one place, in the order the patch bay lists them. */
export const AREA_TARGETS: readonly { key: AreaTarget; label: string; hint: string }[] = [
  { key: 'areaHeat', label: 'Heat here', hint: 'a heat source under this area' },
  { key: 'areaStir', label: 'Stir here', hint: 'a paddle drawn round this area' },
  { key: 'areaPour', label: 'Pour here', hint: 'dye from this area\'s bottles' },
  { key: 'areaHue', label: 'Bottle here', hint: 'which of this area\'s bottles pours next' },
];
const AREA_TARGET_KEYS: ReadonlySet<string> = new Set(AREA_TARGETS.map(t => t.key));
export const isAreaTarget = (s: unknown): s is AreaTarget => typeof s === 'string' && AREA_TARGET_KEYS.has(s);
/** A cord aimed at an area: an area index and one of the four targets. Neither alone is one. */
export const isAreaCord = (m: SceneMapping): boolean =>
  typeof m.area === 'number' && Number.isInteger(m.area) && m.area >= 0 && isAreaTarget(m.setting);

/*
  The hand's numbers, at a cord at full depth and full reading.

  Heat: 1.5 K/s. The lamp heats dark dye at 0.24 K/s (18f's LAMP_HEATING, from
  a kilowatt a square metre into a millimetre of water); a hot-air gun a hand
  holds under a dish puts several times that into a spot. With Newton cooling
  at about 12 s a held full cord settles some 18 K up, 36% runnier water in
  18f's mobility, and a kick's envelope of a few tenths of a second adds a
  few tenths of a kelvin that a run of kicks builds on.

  Stir: one turn of the paddle in 1.2 s, round a circle 0.45 of the area's
  radius, the paddle 0.3 of it: a hand folding a pool, not whisking it. On
  Velvet's soap well (0.14 of a 192-cell plate) that is 12 cells round a
  circle in 1.2 s, about 60 cells a second, a dish of 30 cm stirred at
  10 cm/s.

  Pour: 1.5 of density a second over the area, eased to nothing over its rim
  as every act is. An area's laid pool is 3.2 deep at its middle (layAreas),
  so a second of a cord held open pours about half a pool's depth. It was
  laid over the middle 0.6 of the area first, and a Jellyfish bell (0.085 of
  the plate) then poured a disc under 1% of the plate, too small to count as a
  place in 25e's measure whatever was poured into it: the cord's value is the
  area's, so it is laid over the area.
*/
export const AREA_HEAT_RATE = 1.5;
export const AREA_STIR_TURN_S = 1.2;
export const AREA_PADDLE_ORBIT = 0.45;
export const AREA_PADDLE_R = 0.3;
export const AREA_POUR_RATE = 1.5;
export const AREA_POUR_SPREAD = 1;
/** How far inside its radius an area's act is whole; it eases to nothing over the rest. */
export const AREA_CORE = 0.7;
/** How far under the threshold a reading must fall to close the gate (0..1 of the reading). */
export const GATE_HYSTERESIS = 0.05;

/*
  A reagent's drop, at a cord at full depth on a full hit: two of the
  automation's doses (presetPlate.ts AUTO_DOSE, pourLiquid), a pipette
  squeezed hard. Laid at the area's middle and then round it a little
  further each hit (golden-angle steps out to half its radius), so a run of
  hits works the well and does not stack every drop on one cell.
*/
export const AREA_DROP = 2;
/** The liquids whose colour is their chemistry's: they pour as themselves, never as dye. */
const REAGENTS: ReadonlySet<string> = new Set(DEFAULT_LIQUID_TYPES
  .filter(l => (l.behaviour?.acid ?? 0) !== 0 || (l.behaviour?.bz ?? 0) > 0).map(l => l.id));
/** Whether an area's pour is a drop of its reagent rather than its dye. */
export const reagentArea = (a: PlateArea): boolean => REAGENTS.has(a.liquid);

/** How much of an act lands at distance `d` from an area's middle, of radius `r`: whole inside AREA_CORE, eased to 0 at the rim. */
export function areaWeight(d: number, r: number): number {
  const inner = AREA_CORE * r;
  if (d <= inner) return 1;
  if (d >= r) return 0;
  const t = (r - d) / (r - inner);
  return t * t * (3 - 2 * t);
}

/**
 * Has this cord a gate, or does it follow its reading?
 *
 * Explicit `mode: 'gate'` always gates and `mode: 'follow'` always follows
 * (PLAN 30a). When `mode` is absent on an area cord (or in `CordGate.step`
 * directly), any of `threshold`, `attack` or `release` turns the gate on, as
 * PLAN 25h shipped it.
 */
export const gated = (m: SceneMapping): boolean =>
  m.mode === 'gate' || (m.mode !== 'follow' && (m.threshold !== undefined || m.attack !== undefined || m.release !== undefined));

/**
 * One cord's gate and envelope (the least of PLAN 30a).
 *
 * Linear in each direction, a synth's AR envelope: open, it climbs at the
 * hit's height over `attack` seconds, so it reaches the height in exactly the
 * attack; closed, it falls from that height to nothing over `release`. The
 * height is the most the reading reached while the gate was open, so a hard
 * kick opens it further than a soft one. An attack or release of 0 is a step.
 */
export class CordGate {
  env = 0;
  open = false;
  /** Times the gate opened. */
  fires = 0;
  private height = 0;

  step(reading: number, dt: number, m: SceneMapping): number {
    const x = Number.isFinite(reading) ? reading : 0;
    if (!gated(m)) { this.env = x; return x; }
    const th = Math.max(0, Math.min(1, m.threshold ?? 0));
    if (!this.open && x > th) { this.open = true; this.fires++; this.height = x; }
    else if (this.open && x < th - GATE_HYSTERESIS) this.open = false;
    if (this.open) this.height = Math.max(this.height, x);
    const attack = Math.max(0, m.attack ?? 0), release = Math.max(0, m.release ?? 0);
    if (this.open) {
      this.env = attack > 0 ? Math.min(this.height, this.env + this.height * dt / attack) : this.height;
    } else {
      this.env = release > 0 ? Math.max(0, this.env - this.height * dt / release) : 0;
    }
    return this.env;
  }
}

/** What a cord did this step, in one area. */
export interface AreaAct {
  cord: SceneMapping;
  area: PlateArea;
  index: number;
  target: AreaTarget;
  /** The envelope times the cord's depth: −1..1 at full. */
  amount: number;
  /** Its state's key: what the cord is, and its turn among cords alike. */
  key: string;
  /** A pour cord whose gate opened this step: how big a drop (depth × the hit), else 0. */
  drop: number;
}

/** Where an area's acts are laid: grid cells of a `size`-cell plate. */
export interface AreaSink {
  /** Heat into the cell, in kelvin. */
  heat(x: number, y: number, kelvin: number): void;
  /** Dye into the cell: `amount` of density in colour `rgb` (0..1, as the palette has it). */
  dye(x: number, y: number, amount: number, rgb: { r: number; g: number; b: number }): void;
  /** A paddle `r` cells in radius at (x, y), that moved (mx, my) cells this step. */
  paddle(x: number, y: number, r: number, mx: number, my: number): void;
  /** A drop of a liquid (a bottle's id) at (x, y): `strength` of the automation's doses. */
  liquid?(x: number, y: number, id: string, strength: number): void;
}

/** What of a plate an area's acts are laid through: the visualizer's FluidSimulation has all three. */
export interface AreaFluid {
  addTemp(x: number, y: number, kelvin: number): void;
  addDensity(x: number, y: number, amount: number, r: number, g: number, b: number): void;
  fingerDrag(x: number, y: number, radius: number, strength: number, dx: number, dy: number, phase?: boolean, moved?: { x: number; y: number }): void;
}

/**
 * The sink the app lays through, and the lab too (`npm run areacords` hands it
 * a stand-in with the same three methods), so what the check measures is laid
 * by the same code the plate's loop runs. A paddle is the Finger's solid
 * (fingerDrag; its radius in the 128-cell units the tools take, `gridScale`
 * cells each), and like the automation's stroke it leaves a ferrofluid where
 * it is (`phase` false). `pour` is how a bottle is poured on that plate
 * (sim/tools.ts pourLiquid, which needs the window this file must not), for
 * an area of a reagent.
 */
export function fluidSink<F extends AreaFluid>(f: F, gridScale: number, pour?: (f: F, id: string, x: number, y: number, strength: number) => void): AreaSink {
  return {
    liquid: pour && ((x, y, id, s) => pour(f, id, x, y, s)),
    heat: (x, y, k) => f.addTemp(x, y, k),
    dye: (x, y, amount, c) => f.addDensity(x, y, amount, c.r, c.g, c.b),
    paddle: (x, y, r, mx, my) => f.fingerDrag(Math.round(x), Math.round(y), r / gridScale, 0.1, mx, my, false, { x: mx, y: my }),
  };
}

interface CordState {
  gate: CordGate; band: BandRange; angle: number; dir: number; seen: boolean;
  /** The bottle a gated pour took up when its gate opened, which it pours from until the next opening. */
  held: number | null;
}
const keyOf = (m: SceneMapping): string =>
  `${m.source ?? 'room'}|${m.source === 'bands' && m.band ? `${m.band[0]}-${m.band[1]}` : m.feature}|${m.setting}|${m.area}`;

/**
 * Every area cord of a look, stepped and laid.
 *
 * Held across frames because a gate and a paddle have a state: its envelope,
 * where the paddle is round its circle and which way it is turning. Keyed by
 * what the cord is, not where it sits in the list, so a cord added or removed
 * leaves the others' envelopes alone; a cord gone from the list is forgotten.
 */
export class AreaHands {
  private readonly state = new Map<string, CordState>();
  /** This step's acts, for `lay` and for a check to read. */
  acts: AreaAct[] = [];

  /**
   * Step every area cord by `dt` seconds. `read` is the cord's reading this
   * step times its source's master (the patch bay's own, sceneMap.ts
   * `cordReading`), or null when the source has nothing to say, which a gate
   * hears as silence; it is handed the cord's own `BandRange`, held here with
   * its gate so a dragged band's auto-range survives a look fade that builds
   * the cord's object again every frame. A cord aimed at an area the look does not have does
   * nothing, as a cord aimed at a plate not on the stage does nothing.
   */
  step(cords: readonly SceneMapping[] | undefined, areas: readonly PlateArea[] | null, read: (m: SceneMapping, band: BandRange) => number | null, dt: number): AreaAct[] {
    this.acts = [];
    for (const s of this.state.values()) s.seen = false;
    if (cords && areas) {
      /*
        Two cords alike (same source, reading, act and area, which only a
        hand-made patch has) each keep a gate of their own: the second is
        keyed by its turn among its twins. Shared, the one gate was stepped
        twice a step and rose twice as fast (the review of #454).
      */
      const twins = new Map<string, number>();
      for (const m of cords) {
        if (!m || !isAreaCord(m) || !m.depth) continue;
        const area = areas[m.area!];
        if (!area) continue;
        const base = keyOf(m), turn = twins.get(base) ?? 0;
        twins.set(base, turn + 1);
        const k = turn ? `${base}#${turn}` : base;
        let s = this.state.get(k);
        if (!s) { s = { gate: new CordGate(), band: new BandRange(), angle: 0, dir: 1, seen: true, held: null }; this.state.set(k, s); }
        s.seen = true;
        const reading = read(m, s.band);
        /*
          A note's name is not a level (hitSource.ts noteClass): no gate, and
          the class itself is the act, whatever the depth (which only says the
          cord is on). With nothing heard, nothing: the area's hands go back
          to turning through its family.
        */
        if (isClassFeature(m.feature)) {
          if (reading !== null) this.acts.push({ cord: m, area, index: m.area!, target: m.setting as AreaTarget, amount: Math.max(0, Math.min(1, reading)), key: k, drop: 0 });
          continue;
        }
        const before = s.gate.fires;
        const v = s.gate.step(reading ?? 0, dt, m);
        const opened = s.gate.fires > before;
        // A gated paddle turns back on each hit: a hand folding, not a motor.
        if (m.setting === 'areaStir' && gated(m) && opened && before > 0) s.dir = -s.dir;
        const drop = m.setting === 'areaPour' && opened ? Math.min(1, Math.abs(m.depth) * Math.max(0, reading ?? 0)) : 0;
        this.acts.push({ cord: m, area, index: m.area!, target: m.setting as AreaTarget, amount: v * m.depth, key: k, drop });
      }
    }
    for (const [k, s] of this.state) if (!s.seen) this.state.delete(k);
    return this.acts;
  }

  /** How many times a cord's gate has opened (for the check). */
  fires(m: SceneMapping): number { return this.state.get(keyOf(m))?.gate.fires ?? 0; }

  /**
   * The bottle an area's Bottle cord holds it to, or null with none on it.
   * Read by this area's pours (`bottle`) and by the music's own hands in the
   * area (the visualizer's areaCycle: the kick's ring, the treble's drops,
   * the swell), which otherwise turn through the whole family: so a Bottle
   * cord on an area with no pour cord of its own still says what colour the
   * music lays there. Without that it did nothing at all (the review of
   * #454: Jellyfish's band 7 on its treble bell), since a pigment does not
   * change colour where it already lies.
   */
  picked(index: number, area: PlateArea): number | null {
    const n = areaFamily(area).length;
    for (const a of this.acts) {
      if (a.index !== index || a.target !== 'areaHue') continue;
      return Math.min(n - 1, Math.floor(Math.min(1, Math.abs(a.amount)) * n));
    }
    return null;
  }

  /**
   * Which of an area's bottles (an index into its family) pours next: what
   * its Bottle cord says, else the next in turn on each opening of its pour
   * cord, so a kick pours one bottle and the next kick the other.
   */
  bottle(index: number, area: PlateArea): number {
    const n = areaFamily(area).length;
    const held = this.picked(index, area);
    if (held !== null) return held;
    for (const a of this.acts) {
      if (a.index !== index || a.target !== 'areaPour') continue;
      const fires = this.state.get(a.key)?.gate.fires ?? 0;
      return gated(a.cord) ? Math.max(0, fires - 1) % n : 0;
    }
    return 0;
  }

  /**
   * Lay this step's acts into `sink` on a `size`-cell plate, `dt` seconds of
   * them. `colour` turns an area and a bottle of its family into the dye's
   * colour (the look's dyes, a palette lock, the hue journey: the caller's).
   * `pourScale` is the app's regulator on the pours (1 in the lab).
   */
  lay(sink: AreaSink, size: number, dt: number, colour: (area: PlateArea, k: number) => { r: number; g: number; b: number }, pourScale = 1): void {
    for (const a of this.acts) {
      const { area } = a;
      const cx = area.x * size, cy = area.y * size, R = area.r * size;
      if (a.target === 'areaHeat') {
        const k = AREA_HEAT_RATE * a.amount * dt;
        if (k === 0) continue;
        disc(cx, cy, R, size, (x, y, w) => sink.heat(x, y, k * w));
      } else if (a.target === 'areaPour' && reagentArea(area)) {
        if (!(a.drop > 0) || !sink.liquid) continue;
        const n = this.state.get(a.key)?.gate.fires ?? 1;
        const ang = n * 2.399963, d = R * 0.5 * Math.sqrt(((n - 1) % 6) / 6);
        // Not under the dye's regulator: a reagent is not dye, and pourLiquid keeps its own headroom.
        sink.liquid(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, area.liquid, AREA_DROP * a.drop);
      } else if (a.target === 'areaPour') {
        const k = AREA_POUR_RATE * Math.max(0, a.amount) * dt * pourScale;
        if (!(k > 0)) continue;
        /*
          A gated pour is a bottle picked up on the hit and poured until the
          next: the note may change during its release (PLAN 25i), and the
          next note picks the next pour's bottle, not the colour of the one
          already pouring. A cord with no gate pours what is picked now.
        */
        const s = this.state.get(a.key);
        let b = this.bottle(a.index, area);
        if (s && gated(a.cord)) { if (a.drop > 0 || s.held === null) s.held = b; else b = s.held; }
        const rgb = colour(area, b);
        disc(cx, cy, R * AREA_POUR_SPREAD, size, (x, y, w) => sink.dye(x, y, k * w, rgb));
      } else if (a.target === 'areaStir') {
        const s = this.state.get(a.key);
        if (!s || a.amount === 0) continue;
        const orbit = AREA_PADDLE_ORBIT * R;
        const turn = (2 * Math.PI / AREA_STIR_TURN_S) * a.amount * s.dir * dt;
        const x0 = cx + Math.cos(s.angle) * orbit, y0 = cy + Math.sin(s.angle) * orbit;
        s.angle += turn;
        const x1 = cx + Math.cos(s.angle) * orbit, y1 = cy + Math.sin(s.angle) * orbit;
        sink.paddle(x1, y1, AREA_PADDLE_R * R, x1 - x0, y1 - y0);
      }
    }
  }
}

/** Every cell of a disc of radius R (cells) round (cx, cy), with its weight, off the plate's border. */
function disc(cx: number, cy: number, R: number, size: number, at: (x: number, y: number, w: number) => void): void {
  const x0 = Math.max(1, Math.floor(cx - R)), x1 = Math.min(size - 2, Math.ceil(cx + R));
  const y0 = Math.max(1, Math.floor(cy - R)), y1 = Math.min(size - 2, Math.ceil(cy + R));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const w = areaWeight(Math.hypot(x + 0.5 - cx, y + 0.5 - cy), R);
    if (w > 0) at(x, y, w);
  }
}
