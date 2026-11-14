/**
 * The tank on the plate (PLAN 47n): the side of a tank of water instead of the
 * dish from above, stepped with the plate and drawn in its place.
 *
 * What was asked (the owner, 2026-11-13, from Davy Evans' *Gravity L1*): dye
 * falling through a tank seen through its side wall, a jet that stretches
 * into one thread, lands, and runs along the floor as a gravity current whose
 * head curls. The plate is a thin layer between glass, whose drag eats the
 * momentum a falling jet and a curling head need (src/lib/tank.ts says why at
 * length), so this is its own solver: `createTankGpu` (src/gpu/tank.ts, held
 * to the CPU reference by `npm run tankgpu`), a vertical slice of water with
 * heavy dye falling under its own weight from a nozzle at the surface.
 *
 * The tank is 24 cm wide and 13.5 cm deep (16:9, the projector's frame) on
 * 256 × 144 cells of 0.94 mm: the nozzle's 3 mm is three cells, and the
 * thread thins to about one before it lands.
 *
 * What the performer does to it. The settings (Tank, Feed, Dye Weight,
 * Nozzle, Drain, Glow Hue) are read every step, so a cord or a MIDI fader can
 * open the feed or make the dye heavier with the music. A finger held on the
 * plate (on the screen, or the phone's hold) carries the nozzle to it, and it
 * stays where the finger left it until the Nozzle setting moves. That is the
 * only thing a touch does to the tank: a pour or a beat's splat moves nothing
 * here (sound moves the plate only through cords).
 *
 * Off (Tank at 0, every look but the tank's) nothing here is made or run;
 * turned off, it goes, and the next time it is clear water.
 */
import { createTankGpu, type TankGpu, type TankField } from './tank';

/** The tank's grid and size: 16:9, 0.94 mm cells. */
export const TANK_PLATE_NX = 256;
export const TANK_PLATE_NY = 144;
export const TANK_PLATE_WIDTH = 0.24;
/** The nozzle's bore, metres: a pipette's tip. */
export const TANK_NOZZLE_W = 3e-3;

/** What a step needs of the settings: the front plate's only (the tank replaces the whole picture). */
export interface TankStepParams {
  tank?: number;
  tankFeed?: number;
  tankWeight?: number;
  tankNozzle?: number;
  tankDrain?: number;
  tankHue?: number;
}

const NO_TANK: TankStepParams = Object.freeze({});

export function tankStep(s: TankStepParams, layer: number): TankStepParams {
  if (layer > 0 || !((s.tank ?? 0) > 0.001)) return NO_TANK;
  return { tank: s.tank, tankFeed: s.tankFeed ?? 1.5, tankWeight: s.tankWeight ?? 0.5, tankNozzle: s.tankNozzle ?? 0.5, tankDrain: s.tankDrain ?? 1, tankHue: s.tankHue ?? 205 };
}

/**
 * A hue's colour at full saturation and value, 0..1 per channel, written into
 * `out` (the dye's glow; the camera's bloom spreads it). Into an array the
 * caller keeps, since a cord on Glow Hue changes it every step.
 */
export function hueColour(deg: number, out: [number, number, number]): [number, number, number] {
  const h = (((deg % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  const k = Math.floor(h) % 6;
  out[0] = k === 0 || k === 5 ? 1 : k === 1 || k === 4 ? x : 0;
  out[1] = k === 1 || k === 2 ? 1 : k === 0 || k === 3 ? x : 0;
  out[2] = k === 3 || k === 4 ? 1 : k === 2 || k === 5 ? x : 0;
  return out;
}

/** What the plate draws: the dye, and how it glows. */
export interface TankPlateField extends TankField {
  colour: [number, number, number];
  glow: number;
}

/*
  A held finger's place on the plate, as a share across the screen. The
  plate's field is wider than the screen (it spans 1.5 of the screen's long
  side, wgsl/plate.ts uvToFluid), so a finger at the screen's middle is the
  field's middle and one at its edge is a sixth in. This takes the long side
  as the width (a projector's, a laptop's) and the camera unzoomed and
  unturned, which is what a tank look sets; PLAN 47n-3 is to hand the
  solver the screen's own mapping.
*/
const screenX = (plateX: number) => Math.max(0, Math.min(1, 0.5 + (plateX - 0.5) * 1.5));

export class TankPlate {
  private tank: TankGpu;
  private nozzle = 0.5;
  private nozzleSetting = NaN;
  private hue = NaN;
  // Reused every step: no new objects in the frame.
  private readonly opts = { gPrime: 0, feed: 0, nozzleX: 0.5, nozzleW: TANK_NOZZLE_W, drain: 1 };
  readonly field: TankPlateField;

  constructor(device: GPUDevice) {
    this.tank = createTankGpu(device, { nx: TANK_PLATE_NX, ny: TANK_PLATE_NY, width: TANK_PLATE_WIDTH });
    this.tank.write({});
    this.field = { ...this.tank.field, colour: hueColour(205, [0, 0, 0]), glow: 1 };
  }

  /** A step of `seconds` of the tank's own time, on `enc`. */
  step(enc: GPUCommandEncoder, seconds: number, p: TankStepParams, holds: readonly { x: number; y: number }[] | undefined): void {
    const set = Math.max(0, Math.min(1, p.tankNozzle ?? 0.5));
    if (set !== this.nozzleSetting) { this.nozzleSetting = set; this.nozzle = set; }
    if (holds && holds.length) this.nozzle = screenX(holds[0].x);
    const o = this.opts;
    o.gPrime = 9.81 * Math.max(0, p.tankWeight ?? 0.5) / 100;
    o.feed = Math.max(0, p.tankFeed ?? 1.5) / 100;
    o.nozzleX = this.nozzle;
    o.drain = p.tankDrain ?? 1;
    this.tank.encode(enc, Math.max(0, Math.min(0.1, seconds)), o);
    this.field.c = this.tank.field.c;
    const hue = p.tankHue ?? 205;
    if (hue !== this.hue) { this.hue = hue; hueColour(hue, this.field.colour); }
    this.field.glow = Math.max(0, Math.min(1, p.tank ?? 1));
  }

  /** Clear water again (the plate's wipe). */
  reset(): void {
    this.tank.write({});
    this.field.c = this.tank.field.c;
  }

  dispose(): void {
    this.tank.destroy();
  }
}
