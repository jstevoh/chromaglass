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
 *      of the lamp through clear water, drawn in the same run. It was a mix
 *      toward a dimmed tint, 150 here: darker than air ever is. (This line
 *      holds the window, not the trace: the solver empties the pocket's dye,
 *      and the lab's lamp clips near 255, so Fresnel's 4% is not readable
 *      here. Lines 2 and 3 hold the trace.)
 *   2. its wall is a dark band, darkest under DARK of the liquid's level,
 *      just inside the contact worked out beforehand (CONTACT), and up close
 *      (EDGE_ZOOM) the light comes back by over LINE of the liquid before
 *      the contact. OPEN (38h-7 review): with the grazing reflection taken
 *      out this line still passes, the coverage's fade of the cleared middle
 *      lights that stretch; it holds once the rim is drawn from the bubble's
 *      centre and size rather than the coarse air field;
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
const DARK = 0.3, LENS = 40, LINE = 0.25, SIDE = 0.25;
const WINDOW = 0.9;
/** One plate uv is S * 1.5 * zoom pixels (the camera's uvToFluid), so the contact is known before anything is read. */
const CONTACT = (B / N) * S * 1.5 * ZOOM;
const EDGE_ZOOM = 12, EDGE_SHIFT = 0.9;

const { page, close } = await openLab();
let r;
try {
  r = await page.evaluate(async ({ N, S, B, ZOOM, EDGE_ZOOM, EDGE_SHIFT }) => {
    await lab.create(N);
    const cam = { time: 3, macroAmount: 1, zoom: ZOOM, cx: 0.5, cy: 0.5, bubbles: 1 };
    const base = { bubbles: 1, lampGround: 1, lightPlay: 0 };
    const shot = async (over, c = cam) => Array.from(await lab.render(S, { ...base, ...over }, c));
    // The lamp through clear water, no dye and no bubble: line 1's reference.
    const clear = await shot({});
    // A pale wash, the same everywhere, and later a red pool beside the bubble.
    lab.dye(0.5, 0.5, 1.2, [0.9, 0.5, 0.3], 0.5);
    lab.flush(); await lab.step(4);
    const bubble = async () => {
      lab.solver().setBubbles(new Float32Array([0.5, 0.5, B / N, 1]), 1, 0.25, new Float32Array([0, 0, 0.5, 0]));
      await lab.step(2, { bubbleClear: 1 });
    };
    await bubble();
    const out = {
      clear,
      // The bubble's right-hand rim at EDGE_ZOOM, its centre EDGE_SHIFT radii left of the picture's middle.
      edge: await shot({}, { ...cam, zoom: EDGE_ZOOM, cx: 0.5 + EDGE_SHIFT * B / N }),
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
  }, { N, S, B, ZOOM, EDGE_ZOOM, EDGE_SHIFT });
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
const lamp = Array.from({ length: 10 }, (_, k) => ring(r.clear, k, lum)).reduce((a, b) => a + b) / 10;
let band = 10; for (let k = 10; k < prof.length; k++) if (prof[k] < prof[band]) band = k;
const windowEdge = prof.findIndex((v, k) => k > 10 && v < middle - 20);
// Every line below reads at the bubble the picture was asked to show: its band just inside the contact worked out beforehand.
const placed = band >= CONTACT - 14 && band <= CONTACT - 1;
check(`1. a bubble's middle is the lamp through clear air: over ${WINDOW} of the lamp through clear water`,
  placed && middle > WINDOW * lamp, `middle ${middle.toFixed(1)}, the lamp ${lamp.toFixed(1)}: ${(middle / lamp).toFixed(3)}; the liquid round it ${outside.toFixed(0)}`);
/*
  The grazing line, at EDGE_ZOOM along the row through the bubble's centre,
  out to the right: the outer tenth of the meniscus (sin θ past 0.91) is
  several pixels there. Between the band's darkest and three pixels short
  of the contact (the coverage's antialiasing) the light must come back by
  over LINE of the liquid's level: a reflection the trace makes. With the
  reflection taken out, that stretch is dark to the antialiasing.
*/
const ez = (B / N) * S * 1.5 * EDGE_ZOOM, ex0 = S / 2 - EDGE_SHIFT * ez;
const row = Array.from({ length: S }, (_, x) => { let v = 0; for (let dy = -3; dy <= 3; dy++) v += lum(r.edge, x, S / 2 + dy); return v / 7; });
const eContact = Math.round(ex0 + ez);
let eBand = Math.round(ex0 + 0.66 * ez); for (let x = eBand; x < eContact - 3; x++) if (row[x] < row[eBand]) eBand = x;
let eLine = eBand; for (let x = eBand; x < eContact - 3; x++) if (row[x] > row[eLine]) eLine = x;
const eLiquid = row[Math.min(S - 1, eContact + 20)];
check(`2. its wall is a dark band under ${DARK} of the liquid just inside the contact, and grazing reflection brings the light back by over ${LINE} of the liquid before the contact`,
  placed && windowEdge > 0 && band > windowEdge && prof[band] < DARK * outside && row[eLine] - row[eBand] > LINE * eLiquid,
  `contact ${CONTACT.toFixed(0)} px, darkest ${prof[band].toFixed(0)} at ${band} px; up close the band ${row[eBand].toFixed(0)} at ${eBand - eContact} px, the line ${row[eLine].toFixed(0)} at ${eLine - eContact} px, the liquid ${eLiquid.toFixed(0)}`);
const inner = Math.max(windowEdge, band - 10);
const meniscus = (side) => {
  let s = 0, n = 0;
  for (let k = inner; k < band - 1; k++) { s += ring(r.pool, k, red, side - 0.6, side + 0.6); n++; }
  return s / Math.max(n, 1);
};
const right = meniscus(0), left = meniscus(Math.PI);
check(`3. the liquid round it is seen through its wall: the meniscus is redder on the red pool's side than the other by over ${LENS} levels (r - g)`,
  placed && right - left > LENS, `pool's side ${right.toFixed(1)}, far side ${left.toFixed(1)} (from ${inner} to ${band - 1} px)`);
let down = 0, added = 0, cx = 0, cy = 0, outsideAdd = 0;
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const d = lum(r.lit, x, y) - lum(r.wash, x, y);
  if (d < -1) down++;
  if (d > 1) {
    added += d; cx += d * (x - S / 2); cy += d * (y - S / 2);
    if (Math.hypot(x - S / 2, y - S / 2) > CONTACT + 2) outsideAdd += d;
  }
}
cx /= Math.max(added, 1); cy /= Math.max(added, 1);
let plateMoved = 0; for (let i = 0; i < r.plate0.length; i++) if ((i & 3) !== 3) plateMoved = Math.max(plateMoved, Math.abs(r.plate0[i] - r.plate1[i]));
check(`4. Light Play adds light only, only on the bubble, its centre over ${SIDE} of the radius above and left of the middle; the projected plate unchanged`,
  placed && down === 0 && added > 1000 && outsideAdd === 0 && cx < -SIDE * CONTACT && cy < -SIDE * CONTACT && plateMoved <= 1,
  `${down} pixels darker, ${added.toFixed(0)} levels added, ${outsideAdd.toFixed(0)} of them outside the bubble, centred (${cx.toFixed(1)}, ${cy.toFixed(1)}) px from the middle; the plate's most moved channel ${plateMoved}`);

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
