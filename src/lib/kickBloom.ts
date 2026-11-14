/**
 * The kick's bloom: the droplets each kick throws on the plate (Kick Bloom,
 * the dial; PLAN 19ai-10 moved it here out of the visualizer's frame loop).
 *
 * Not a ring. The owner, 2026-10-21: the pulse should be more random, not in
 * a circle. The droplets sat on one circle at even angles (a jitter of 0.45
 * rad) and at 0.9 to 1.2 of one radius, so every kick drew the same wreath.
 * Now two or three lobes at random angles gather most of the droplets, a
 * fifth land anywhere, their distance runs from a third of the radius to past
 * it, their sizes from a third to one and a half of a mean droplet, and the
 * whole burst is centred off the bass spot by up to a third of the radius.
 * Each is pushed outward from that centre with a wide swirl and its own
 * speed, so the dye breaks into clumps and streaks rather than expanding as a
 * ring. Fewer on average (5 to 11 against 6 to 12), the sizes averaging about
 * what they did, so the dye a kick lays is about what it was.
 *
 * The dice are the plate's music stream, drawn in the order the frame loop
 * always drew them, so a seeded film throws the same bloom it did before the
 * move. One small array a kick (the lobes' angles), never one a frame.
 */
import type { Rng } from './rng';

/** What the bloom lays into: the plate's dye and flow (FluidSimulation has both). */
export interface BloomSink {
  addDensity(x: number, y: number, amount: number, r: number, g: number, b: number): void;
  addVelocity(x: number, y: number, vx: number, vy: number): void;
}

/**
 * Throw one kick's bloom round (`x`, `y`), out to about `ringR` cells, on a
 * plate `size` cells across. `hit` is how hard the kick landed (the bass's
 * level through Bass Boost); each droplet lays `hit × dyeGain` of `col`'s dye
 * on average and is pushed at `hit × pushGain`.
 */
export function throwKickBloom(sink: BloomSink, dice: Rng, size: number, x: number, y: number, ringR: number,
  col: { r: number; g: number; b: number }, hit: number, dyeGain: number, pushGain: number): void {
  const drops = 5 + dice.int(7);
  const lobes = 2 + dice.int(2);
  const lobeAt: number[] = [];
  for (let l = 0; l < lobes; l++) lobeAt.push(dice.angle());
  const bx0 = x + (dice.float() - 0.5) * ringR * 0.66;
  const by0 = y + (dice.float() - 0.5) * ringR * 0.66;
  for (let d = 0; d < drops; d++) {
    const wild = dice.float() < 0.2;
    const a = wild ? dice.angle() : lobeAt[d % lobes] + (dice.float() - 0.5) * 1.4;
    const rad = ringR * (0.35 + 0.95 * dice.float());
    const rx2 = Math.floor(bx0 + Math.cos(a) * rad);
    const ry2 = Math.floor(by0 + Math.sin(a) * rad);
    if (rx2 > 1 && rx2 < size - 2 && ry2 > 1 && ry2 < size - 2) {
      const dropStr = hit * (0.33 + 1.17 * dice.float()) * dyeGain;
      if (dropStr > 0.001) sink.addDensity(rx2, ry2, dropStr, col.r, col.g, col.b);
      // Outward from the burst's own centre, with a wide swirl and a speed of its own
      const swirl = 0.9 * (dice.float() - 0.5);
      const speed = (0.1 + 0.3 * dice.float()) * hit * pushGain;
      sink.addVelocity(rx2, ry2, (Math.cos(a) - Math.sin(a) * swirl) * speed, (Math.sin(a) + Math.cos(a) * swirl) * speed);
    }
  }
}
