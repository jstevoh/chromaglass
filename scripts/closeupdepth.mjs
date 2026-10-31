#!/usr/bin/env node
/**
 * Depth in the closeup's bubbles (PLAN 38h-7).
 *
 *   npm run closeupdepth      (the lab: any adapter that computes)
 *
 * The owner asked to see 3D when zoomed in, against macro photographs of
 * bubbles and drops. Set beside them (the project's drops/references), the
 * closeup's camera bubble was a dark ring round a dimmer disc: the wall was
 * one small-angle bend through the light box's cone, the middle a mix by
 * eye toward a dimmed tint, and the liquid behind it was read inward, as a
 * magnifying lens, which a pocket of air (lower index than the water round
 * it) is not. Now the wall is traced (closeupDepth.ts): Snell's law into the
 * air and out, Fresnel's share each way, total internal reflection past
 * 48.6 degrees, the light pad seen only inside the water's critical cone;
 * the middle is the pad through the liquid where the ray lands; and Light
 * Play is a softbox above the glass, seen only by Fresnel reflection in a
 * curved wall. So, on a lab plate through the real plate shader, a pancake
 * bubble at the closeup's zoom:
 *
 *   1. its middle is the lamp through a pocket of clear air: over WINDOW
 *      of the lamp through clear water (255 in the lab), all but what
 *      Fresnel reflects at the pocket's two faces, about 4%. It was a mix
 *      toward a dimmed tint, 150 here: darker than air ever is;
 *   2. its wall is a dark band, darkest under DARK of the liquid's level,
 *      between the window and the contact, and the light is back within
 *      CLOSE of the radius past its darkest: by the trace, the grazing
 *      reflection lights the outer tenth of the meniscus, which is a third
 *      of a pancake's radius, so 3% and a pixel's antialiasing. The single
 *      bend left the wall dark to the contact, 8 px (9%) here;
 *   3. the liquid round it is seen through its wall: with a red pool on one
 *      side, the meniscus inside the band is redder on that side than the
 *      other by over LENS levels (r - g). A magnifier, as the bubble was,
 *      reads inward, the bubble's own clear middle, and shows nothing;
 *   4. Light Play only adds light, only in the closeup, only on the bubble,
 *      and on the side its softbox hangs (above and left on the screen);
 *      on the projected plate it changes no pixel.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** The grid, the picture, a bubble of B cells at the closeup's zoom (a pancake: its radius three times half the gap). */
const N = 384, S = 360, B = 18, ZOOM = 4;
const WINDOW = 0.9, DARK = 0.3, LENS = 12, CLOSE = 0.05;

const { page, close } = await openLab();
let r;
try {
  r = await page.evaluate(async ({ N, S, B, ZOOM }) => {
    await lab.create(N);
    // A pale wash, the same everywhere, and later a red pool beside the bubble.
    lab.dye(0.5, 0.5, 1.2, [0.9, 0.5, 0.3], 0.5);
    lab.flush(); await lab.step(4);
    const bubble = async () => {
      lab.solver().setBubbles(new Float32Array([0.5, 0.5, B / N, 1]), 1, 0.25, new Float32Array([0, 0, 0.5, 0]));
      await lab.step(2, { bubbleClear: 1 });
    };
    await bubble();
    const cam = { time: 3, macroAmount: 1, zoom: ZOOM, cx: 0.5, cy: 0.5, bubbles: 1 };
    const base = { bubbles: 1, lampGround: 1, lightPlay: 0 };
    const shot = async (over, c = cam) => Array.from(await lab.render(S, { ...base, ...over }, c));
    const out = {
      wash: await shot({}),
      lit: await shot({ lightPlay: 1 }),
      plate0: await shot({}, { ...cam, macroAmount: 0, zoom: 1 }),
      plate1: await shot({ lightPlay: 1 }, { ...cam, macroAmount: 0, zoom: 1 }),
    };
    // A red pool to the bubble's right, its edge a bubble's width away.
    lab.dye(0.5 + 2.2 * B / N, 0.5, 1.4 * B / N, [0.1, 1.4, 1.4], 1.6);
    lab.flush(); await lab.step(2);
    await bubble();
    out.pool = await shot({});
    return out;
  }, { N, S, B, ZOOM });
} finally {
  await close();
}

const lum = (px, x, y) => { const i = (y * S + x) * 4; return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; };
const red = (px, x, y) => { const i = (y * S + x) * 4; return px[i] - px[i + 1]; };
const ring = (px, rad, f, from = 0, to = 2 * Math.PI) => {
  let s = 0, n = 0;
  for (let a = 0; a < 96; a++) {
    const t = from + (to - from) * (a + 0.5) / 96;
    s += f(px, Math.round(S / 2 + rad * Math.cos(t)), Math.round(S / 2 + rad * Math.sin(t))); n++;
  }
  return s / n;
};
const prof = Array.from({ length: Math.floor(S / 2) - 2 }, (_, k) => ring(r.wash, k, lum));
const outside = prof[prof.length - 1];
const middle = prof.slice(0, 10).reduce((a, b) => a + b) / 10;
let band = 0; for (let k = 10; k < prof.length; k++) if (prof[k] < prof[band] || band === 0) band = k;
const windowEdge = prof.findIndex((v, k) => k > 10 && v < middle - 20);
const after = prof.slice(band).findIndex((v) => v > 0.5 * outside);
check(`1. a bubble's middle is the lamp through clear air: over ${WINDOW} of 255`,
  middle > WINDOW * 255, `middle ${middle.toFixed(0)}, the liquid round it ${outside.toFixed(0)}`);
check(`2. its wall is a dark band under ${DARK} of the liquid between the window and the contact, and the light is back over half within ${CLOSE} of the radius outside it`,
  prof[band] < DARK * outside && windowEdge > 0 && band > windowEdge && after >= 0 && after < CLOSE * band,
  `window to ${windowEdge} px, darkest ${prof[band].toFixed(0)} at ${band} px, half back ${after} px out`);
const inner = Math.max(windowEdge, band - 10);
const meniscus = (side) => {
  let s = 0, n = 0;
  for (let k = inner; k < band - 1; k++) { s += ring(r.pool, k, red, side - 0.6, side + 0.6); n++; }
  return s / Math.max(n, 1);
};
const right = meniscus(0), left = meniscus(Math.PI);
check(`3. the liquid round it is seen through its wall: the meniscus is redder on the red pool's side than the other by over ${LENS} levels (r - g)`,
  right - left > LENS, `pool's side ${right.toFixed(1)}, far side ${left.toFixed(1)} (from ${inner} to ${band - 1} px)`);
let down = 0, added = 0, cx = 0, cy = 0, outsideAdd = 0;
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const d = lum(r.lit, x, y) - lum(r.wash, x, y);
  if (d < -1) down++;
  if (d > 1) {
    added += d; cx += d * (x - S / 2); cy += d * (y - S / 2);
    if (Math.hypot(x - S / 2, y - S / 2) > band + 4) outsideAdd += d;
  }
}
let plateMoved = 0; for (let i = 0; i < r.plate0.length; i++) if ((i & 3) !== 3) plateMoved = Math.max(plateMoved, Math.abs(r.plate0[i] - r.plate1[i]));
check('4. Light Play adds light only, only on the bubble, above and left of its middle; the projected plate unchanged',
  down === 0 && added > 1000 && outsideAdd === 0 && cx < 0 && cy < 0 && plateMoved <= 1,
  `${down} pixels darker, ${added.toFixed(0)} levels added, ${outsideAdd.toFixed(0)} of them outside the bubble, centre of the added light (${(cx / Math.max(added, 1)).toFixed(1)}, ${(cy / Math.max(added, 1)).toFixed(1)}) px from the middle; the plate's most moved channel ${plateMoved}`);

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
