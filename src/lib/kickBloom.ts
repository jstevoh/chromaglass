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
 * Since PLAN 38v-1 the bloom is a cord: a gated dropper on the kick
 * (lib/musicCords.ts) whose slug of liquid is split into drops scattered
 * here, and lib/areaCords.ts lays each as a real drop. The push each droplet
 * was given went with the frame loop's block: a drop's own volume pushes the
 * liquid aside as it lands (sim/dropSplash.ts), and a painted outward kick is
 * curl-free, which the gap's pressure solve takes out whole (PLAN 18c-3).
 * The dice are the plate's music stream; no array is made.
 */
/**
 * A slug's drops round (`x`, `y`) out to about `R` cells: about `drops` of
 * them (four tenths fewer to four tenths more, so 8 is the old 5 to 11), `total`
 * of dye in all on average, each a third to one and a half of the mean.
 * `at` lays one drop. `rand` is 0..1.
 */
export function scatterBloom(at: (x: number, y: number, amount: number) => void, rand: () => number,
  x: number, y: number, R: number, total: number, drops: number): void {
  const want = Math.max(1, Math.round(drops));
  if (want === 1) { at(x, y, total); return; }
  const lo = Math.max(1, Math.round(want * 0.6)), hi = Math.max(lo, Math.round(want * 1.4));
  const n = lo + Math.min(hi - lo, Math.floor(rand() * (hi - lo + 1)));
  const lobes = 2 + Math.min(1, Math.floor(rand() * 2));
  const lobeAt0 = rand() * 2 * Math.PI, lobeAt1 = rand() * 2 * Math.PI, lobeAt2 = rand() * 2 * Math.PI;
  const bx0 = x + (rand() - 0.5) * R * 0.66;
  const by0 = y + (rand() - 0.5) * R * 0.66;
  const mean = total / want;
  for (let d = 0; d < n; d++) {
    const wild = rand() < 0.2;
    const lobe = d % lobes === 0 ? lobeAt0 : d % lobes === 1 ? lobeAt1 : lobeAt2;
    const a = wild ? rand() * 2 * Math.PI : lobe + (rand() - 0.5) * 1.4;
    const rad = R * (0.35 + 0.95 * rand());
    at(bx0 + Math.cos(a) * rad, by0 + Math.sin(a) * rad, mean * (0.33 + 1.17 * rand()));
  }
}
