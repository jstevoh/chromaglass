/**
 * Pads held on the plate (PLAN 30c): what a hit does, and what holding it on
 * keeps doing, as the hand it stands for would.
 *
 * What was asked. The owner, 2026-11-27: "I want the pads to be reactive to
 * momentary presses - splatter, presses, etc." Before this a pad was a
 * button: it picked a look or a dye on its note-on and its note-off meant
 * nothing. A hand on the plate is not a button. A pipette held squeezed keeps
 * dripping, a bottle held tipped keeps pouring, a palm held down keeps the
 * film pressed thin, and each of them stops when the hand lets go.
 *
 * So a pad here is a hold: note-on starts it with the hit's velocity as the
 * squeeze, aftertouch (where the board has it) changes the squeeze while it
 * is held, and note-off ends it. Each frame the app asks `stepPads` what the
 * holds do now, and gets back gestures for the same `applyGesture` door the
 * phone's pad and a replayed take go through, so a pad's pour is the plate's
 * own pour and nothing new is drawn.
 *
 * The physics of the hold, tool by tool, because the liquid in the bottle
 * should change how a tool behaves as it does in a kitchen and not only the
 * colour it lays:
 *
 *   - **Drip** (the dropper) lets go a drop the size Tate's law gives: a
 *     drop hangs from the tip until its weight beats the surface tension
 *     round it, mg = 2πrσ, so its volume goes as σ/ρ and alcohol's drops are
 *     a third of water's. How often one falls is that volume over the flow
 *     the squeeze drives through the tip's bore, which is Poiseuille's,
 *     Q = πr⁴ΔP/(8μL): as the squeeze, and inversely as the viscosity, so
 *     syrup held at the same squeeze drips over a hundred times slower than
 *     water. The squeeze sets the pace, never the drop.
 *   - **Pour** is a bottle's stream through its spout: Torricelli's for a
 *     thin liquid (√(2gh), the same for water and alcohol) and Poiseuille's
 *     when the spout's wall holds the liquid back, whichever is less, so oil
 *     pours at about a fifth of water and syrup a tenth.
 *   - **Spray** is a trigger's mist, which a viscous liquid will not make:
 *     an atomiser's sheet breaks into drops only while viscosity is small
 *     against surface tension and inertia (the Ohnesorge number), so the mist
 *     thins with the liquid's viscosity past a few tens of mPa·s.
 *   - **Splatter** is a loaded brush flicked: the hit is the first flick, and
 *     held, the wrist flicks again three times a second, each flick shedding
 *     a share of what is left on the bristles, so it fades as the brush empties.
 *   - **Streak** is a stroke drawn up the pad's lane while it is held.
 *   - **Press** holds the top glass down with the squeeze while the pad is
 *     held (the solver's own squeeze, Stefan's thinning film).
 *   - **Blow** is a breath held on the film; **Stir** a finger held in the
 *     liquid, circling, since a finger that does not move mixes nothing.
 *
 * Pure: no DOM, no GPU, no clock of its own (the caller hands `now`), and the
 * places drawn from a seeded stream (lib/rng.ts), so `npm run padhits` drives
 * it in node and the same show seed lays the same hits.
 */
import { DROP_TATE } from './dropImpact.ts';
import type { PadTool } from './padTarget.ts';
import { PAD_LANES } from './padTarget.ts';
import type { Rng } from './rng.ts';

/** What of a liquid a hold's physics reads: as the bottles give them, mPa·s, g/cm³, mN/m. */
export interface PadLiquid { viscosity?: number; density?: number; tension?: number }

const WATER = { viscosity: 1, density: 1, tension: 72 } as const;
const G = 9.81;

/** The gestures a hold sends while held, a second. A phone's finger sends about this many. */
export const PAD_TICK_HZ = 30;
/** Water's drip at a full squeeze, seconds between drops: a pipette's bulb held firmly, not crushed into a stream. */
export const DRIP_FULL_S = 0.25;
/**
 * The slowest a held drip is waited on, and the fastest. Syrup at a light
 * squeeze really drips once a minute; a pad held that long reads as broken,
 * so past this the drip waits no longer (a named shortcut: the drop is still
 * Tate's, only the wait is cut). Faster than the floor the drops join into a
 * stream, which is Pour.
 */
export const DRIP_MAX_S = 3;
export const DRIP_MIN_S = 0.06;
/** A squeeze below this drives no flow: the bulb's own spring holds it. */
export const SQUEEZE_FLOOR = 0.05;
/** The pour's spout: bore radius, length, and the head of liquid over it, metres. */
export const SPOUT = { r: 2.5e-3, L: 0.02, h: 0.02 } as const;
/** Where an atomiser's mist has fallen to half: the viscosity, mPa·s, a trigger sprayer stops making a fine mist at. */
export const SPRAY_HALF_MPAS = 30;
/** A wrist flicking a brush: seconds between flicks, and the share of what is left on it each flick sheds. */
export const FLICK_S = 0.3;
export const FLICK_SHED = 0.45;
/** A brush shedding less than this share of its first flick is empty. */
export const FLICK_EMPTY = 0.05;
/** A held streak's stroke, wall heights a second; and a stir's circle, wall widths across and turns a second. */
export const STROKE_SPEED = 0.35;
export const STIR_RADIUS = 0.035;
export const STIR_TURNS = 1.2;

const visc = (l?: PadLiquid | null) => (l?.viscosity && l.viscosity > 0 ? l.viscosity : WATER.viscosity);
const dens = (l?: PadLiquid | null) => (l?.density && l.density > 0 ? l.density : WATER.density);
const tens = (l?: PadLiquid | null) => (l?.tension && l.tension > 0 ? l.tension : WATER.tension);

/** A Tate's-law drop of this liquid against water's from the same tip: V ∝ σ/ρ. */
export const tateShare = (l?: PadLiquid | null): number => (tens(l) / WATER.tension) / (dens(l) / WATER.density);
/** The drop's amount in the dropper's units (lib/dropImpact.ts: water's Tate drop is `DROP_TATE`). */
export const tateAmount = (l?: PadLiquid | null): number => DROP_TATE * tateShare(l);

/**
 * Seconds between drops at this squeeze (0..1): the drop's volume over the
 * Poiseuille flow the squeeze drives, both against water's at a full one.
 * Infinity when the squeeze drives none.
 */
export function dripInterval(l: PadLiquid | null | undefined, squeeze: number): number {
  if (!(squeeze >= SQUEEZE_FLOOR)) return Infinity;
  const t = DRIP_FULL_S * tateShare(l) * (visc(l) / WATER.viscosity) / Math.min(1, squeeze);
  return Math.max(DRIP_MIN_S, Math.min(DRIP_MAX_S, t));
}

/**
 * A pour's flow against water's: the lesser of Torricelli's free jet and
 * Poiseuille's flow down the spout under the same head, so a thin liquid
 * pours at the jet's rate whatever it is and a thick one at its wall's.
 */
export function pourShare(l?: PadLiquid | null): number {
  const rho = dens(l) * 1000, mu = visc(l) * 1e-3;
  const head = rho * G * SPOUT.h;
  const poiseuille = (Math.PI * SPOUT.r ** 4 * head) / (8 * mu * SPOUT.L);
  const torricelli = Math.PI * SPOUT.r ** 2 * Math.sqrt(2 * G * SPOUT.h);
  return Math.min(1, poiseuille / torricelli);
}

/** How much of a trigger's mist a liquid makes against water's (Ohnesorge: viscosity against tension). */
export const sprayShare = (l?: PadLiquid | null): number => (1 + WATER.viscosity / SPRAY_HALF_MPAS) / (1 + visc(l) / SPRAY_HALF_MPAS);

/** What `applyGesture` is handed: the tool's own name there, a point on the wall, and how hard. */
export interface PadGesture<P> {
  tool: 'dropper' | 'splatter' | 'pour' | 'spray' | 'streak' | 'press' | 'blow' | 'finger';
  /** On the wall, 0..1 across and up (the app turns it onto the plate). */
  u: number;
  v: number;
  /** A direction on the wall, for Streak and Stir. */
  du?: number;
  dv?: number;
  /** The hand's own 0..1, for the tools that read one (Press, Blow, Stir). */
  amount: number;
  /** The physics on the tool's dye and liquid: 1 is water at a full squeeze. */
  gain: number;
  /** What the hold was started with: the liquid and colour, resolved by the app at the hit. */
  paint: P;
  /** Which hold, so a hand that moves (Stir, Streak) is one finger to the plate. */
  id: number;
}

export interface PadHold<P> {
  key: string;
  channel: number;
  note: number;
  tool: PadTool;
  liquid: PadLiquid | null;
  paint: P;
  u: number;
  v: number;
  squeeze: number;
  on: number;
  /** When it next drips or flicks, seconds. */
  next: number;
  /** The brush's load, for Splatter: 1 at the hit. */
  load: number;
  /** The last tick it sent, seconds. */
  tick: number;
  id: number;
}

export interface PadHolds<P> {
  holds: Map<string, PadHold<P>>;
  nextId: number;
}

export const makePadHolds = <P>(): PadHolds<P> => ({ holds: new Map(), nextId: 1 });

export const padKey = (channel: number, note: number) => `${channel & 15}:${note & 127}`;

/** Where in its lane a hit lands: across the lane with a hand's spread, and anywhere up the wall's middle. */
export function placeHit(lane: number, rng: Pick<Rng, 'range'>): { u: number; v: number } {
  const w = 1 / PAD_LANES;
  const l = Math.max(0, Math.min(PAD_LANES - 1, Math.floor(lane)));
  return { u: (l + 0.5) * w + rng.range(-0.3, 0.3) * w, v: rng.range(0.22, 0.78) };
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : Number.isFinite(x) ? x : 0);

/**
 * A pad struck: start its hold, and say what the hit itself lays (the first
 * drop, the first flick; the stream and the press start on the next tick).
 * A pad struck again while held starts over from the new hit.
 */
export function padOn<P>(
  s: PadHolds<P>, channel: number, note: number, velocity01: number, now: number,
  hit: { tool: PadTool; liquid: PadLiquid | null; paint: P; at: { u: number; v: number } },
  out: PadGesture<P>[],
): void {
  const key = padKey(channel, note);
  const squeeze = clamp01(velocity01);
  const h: PadHold<P> = {
    key, channel: channel & 15, note: note & 127, tool: hit.tool, liquid: hit.liquid, paint: hit.paint,
    u: hit.at.u, v: hit.at.v, squeeze, on: now, next: now, load: 1, tick: now - 1 / PAD_TICK_HZ, id: s.nextId++,
  };
  s.holds.set(key, h);
  emit(h, now, out);
}

/** Pressure on a held pad (poly aftertouch, `note`), or on every pad held on the channel (channel pressure, `note` null). */
export function padPressure<P>(s: PadHolds<P>, channel: number, note: number | null, value01: number): void {
  const p = clamp01(value01);
  if (note !== null) {
    const h = s.holds.get(padKey(channel, note));
    if (h) h.squeeze = p;
    return;
  }
  for (const h of s.holds.values()) if (h.channel === (channel & 15)) h.squeeze = p;
}

/** A pad let go: its hold ends, and the hand with it. */
export function padOff<P>(s: PadHolds<P>, channel: number, note: number): void {
  s.holds.delete(padKey(channel, note));
}

/** Let go of everything: the map changed, MIDI went away, the plate was cleared. */
export const releaseAllPads = <P>(s: PadHolds<P>): void => { s.holds.clear(); };

/** What the holds do at `now`, appended to `out`. */
export function stepPads<P>(s: PadHolds<P>, now: number, out: PadGesture<P>[]): void {
  for (const h of s.holds.values()) emit(h, now, out);
}

function emit<P>(h: PadHold<P>, now: number, out: PadGesture<P>[]): void {
  const g = (gain: number, extra?: Partial<PadGesture<P>>): void => {
    out.push({ tool: h.tool, u: h.u, v: h.v, amount: h.squeeze, gain, paint: h.paint, id: h.id, ...extra });
  };
  switch (h.tool) {
    case 'dropper': {
      // A drop falls when the tip has filled one; the next waits for the flow to fill another.
      if (now + 1e-9 < h.next) return;
      const wait = dripInterval(h.liquid, h.squeeze);
      // The first drop falls on the hit whatever the squeeze: a pad struck is a drop let go.
      if (h.next === h.on || Number.isFinite(wait)) g(tateShare(h.liquid));
      h.next = now + (Number.isFinite(wait) ? wait : DRIP_MAX_S);
      return;
    }
    case 'splatter': {
      if (now + 1e-9 < h.next || h.load < FLICK_EMPTY) return;
      const shed = h.load * FLICK_SHED;
      h.load -= shed;
      // Against the first flick's shed, so the hit is the tool's whole splatter and each flick after it less.
      g((shed / FLICK_SHED) * Math.max(SQUEEZE_FLOOR, h.squeeze));
      h.next = now + FLICK_S;
      return;
    }
    default: break;
  }
  // The rest flow for as long as they are held, a tick at a time.
  if (now - h.tick < 1 / PAD_TICK_HZ - 1e-6) return;
  const dt = Math.min(0.25, now - h.tick);
  h.tick = now;
  switch (h.tool) {
    case 'pour': if (h.squeeze >= SQUEEZE_FLOOR) g(h.squeeze * pourShare(h.liquid)); break;
    case 'spray': if (h.squeeze >= SQUEEZE_FLOOR) g(h.squeeze * sprayShare(h.liquid)); break;
    case 'press': g(1); break;
    case 'blow': g(1); break;
    case 'streak': {
      if (h.v > 0.95) break;
      const dv = STROKE_SPEED * dt;
      h.v += dv;
      g(h.squeeze, { du: 0, dv });
      break;
    }
    case 'finger': {
      const a = (now - h.on) * STIR_TURNS * 2 * Math.PI;
      const step = STIR_RADIUS * STIR_TURNS * 2 * Math.PI * dt;
      g(1, { u: h.u + STIR_RADIUS * Math.cos(a), v: h.v + STIR_RADIUS * Math.sin(a), du: -Math.sin(a) * step, dv: Math.cos(a) * step });
      break;
    }
    default: break;
  }
}
