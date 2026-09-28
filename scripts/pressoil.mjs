#!/usr/bin/env node
/**
 * A press moves the oil out from under the palm the way it moves the dye, and
 * keeps all of it: measured on the GPU solver alone (scripts/lab.mjs).
 *
 *   npm run pressoil
 *
 * Found auditing every tool against every liquid (PLAN §15d, 2026-09-27):
 * the Press's ring move (squeezeOut) carried the dye out from under the palm
 * and left the oil, so with Oil Bodies a press drew a body's colour out into
 * the water and the body stayed where it was, colourless. The oil now goes
 * through pressOil (src/lib/pressRing.ts), which the app's squeezeOut calls
 * and this calls too, with the app's arguments: the palm in the dye mirror's
 * cells, the app's size (30 before GRID_SCALE, 45 cells of 192: a quarter of
 * the plate across, so its ring runs off the plate from most places a person
 * presses), and the app's largest share, 0.6. Six presses, as squeezeOut hands
 * them over once per dye reading.
 *
 * The plate is one flat layer of oil over all of it (mixSplat is flat to its
 * edge), so every number below has an exact answer, and the palm is pressed
 * in three places: the middle, off it at (0.3, 0.4), and in a corner at
 * (0.15, 0.15), where most of its ring is off the plate. It asks:
 *
 *   1. at each, the oil is all still there, to 1% of what the press moved
 *      (not of the plate's oil, most of which a press never touches). What
 *      would land off the plate is not taken; before that, the corner lost 27%
 *      of what it moved. 1% is the gather's own rounding (0.4% measured): a
 *      ring cell reads the one palm cell it maps back to, so the cells do not
 *      tile exactly.
 *   2. the dye's share, not the Finger's cone: every cell under the palm holds
 *      0.4^6 of what it had, to 0.2%. The cone took a third of the dye's share
 *      averaged over the palm, so most of a press's colour left its oil.
 *   3. it lands where the dye lands: nothing arrives under the palm or past
 *      1.7 palms out, and it lands on the ring area for area, the inner part
 *      of the palm on the inner part of the ring. Asked as the oil gained
 *      from R to 1.2R, 1.45R and 1.7R against what the palm lost inside the
 *      radius each maps back to, within 5%. A hop straight out (the first cut
 *      at this, 0.7 of the palm) put a fifth back under the palm and fails.
 *   4. it goes out evenly: the change's middle is the palm's middle.
 *   5. and a press where there is no oil changes nothing, to the bit, on a
 *      plate that has oil elsewhere: the kernel runs (the share is 0.6, not
 *      zero) and must leave the field exactly as it was.
 *   6. the colour lands where its oil lands. The dye's half is on the CPU
 *      (pressDye, which squeezeOut runs on the dye mirror); here it runs on a
 *      mirror holding exactly the oil field, and one press of each must land
 *      the same amounts in the same cells. Asked with the oil on the left
 *      half of the plate only and the palm on its edge, so a dye that went
 *      evenly round the ring (as it did) puts half its colour on the right,
 *      in the water, and fails: the right side of the ring must get under 1%
 *      of what the press moved, from either half, and the two must agree
 *      cell by cell to 5% of it. And what leaves, not only what arrives: each
 *      palm cell gives up the same share of its colour as of its oil (a dye
 *      that took nothing and duplicated what it laid passed the rest), and in
 *      a corner, where most of the ring is off the plate, all the colour taken
 *      lands (one that took from cells with nowhere to go destroyed it).
 *      Asked at a solver grid equal to the mirror's (192); the app runs a
 *      finer solver under its 192 mirror, which this does not.
 *
 * The Finger's drag (the other mode of the same kernel) is `npm run bodies`
 * check 5, which this leaves as it was.
 *
 * No canvas, so it runs on any adapter that computes: a Mac's Metal in CI,
 * a Linux box's software WebGPU anywhere else.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab();
try {
  const r = await page.evaluate(async () => {
    // The dye mirror is 192 across in the app; the palm is 30 × GRID_SCALE (1.5).
    const M = 192, RC = 45, take = 0.6, O = lab.pressRing;
    const R = RC / M;
    const read = async (s) => {
      const d = (await s.readChemistry('mix')).data;
      return Array.from(d.filter((_, k) => k % 4 === 0));
    };
    const press = async (P, layer) => {
      await lab.create(256, M);
      const s = lab.solver();
      if (layer) s.addMix(0.5, 0.5, 1.0, { oil: 0.5 });
      else s.addMix(0.85, 0.85, 0.05, { oil: 0.5 });
      const a = await read(s);
      // The palm in mirror cells, as squeezeOut has it: cell x is the plate's (x + 0.5) / M.
      for (let k = 0; k < 6; k++) lab.pressOil(P[0] * M - 0.5, P[1] * M - 0.5, RC, M, take);
      const b = await read(s);
      return { a, b };
    };
    const out = {};
    for (const [name, P] of [['middle', [0.5, 0.5]], ['off it', [0.3, 0.4]], ['corner', [0.15, 0.15]]]) {
      const { a, b } = await press(P, true);
      const n = Math.round(Math.sqrt(a.length));
      const at = (i) => [((i % n) + 0.5) / n, (Math.floor(i / n) + 0.5) / n];
      const dist = (i) => { const p = at(i); return Math.hypot(p[0] - P[0], p[1] - P[1]); };
      const sum = (f, pred) => f.reduce((t, v, i) => t + (pred(i) ? v : 0), 0);
      const all = () => true;
      const cell = 1.5 / n;
      // Where a palm point lands (the kernel's map), and whether it is on the plate.
      const K = (O * O - 1);
      const lands = (i) => {
        const p = at(i), d = dist(i);
        const f = Math.sqrt(R * R + d * d * K) / Math.max(d, 1e-9);
        const q = [P[0] + (p[0] - P[0]) * f, P[1] + (p[1] - P[1]) * f];
        return q[0] >= 0 && q[1] >= 0 && q[0] < 1 && q[1] < 1;
      };
      // 2: inside the palm, clear of its rim, every cell that has somewhere to go.
      let worst = 0, inPalm = 0;
      a.forEach((v, i) => {
        if (dist(i) < R - cell && lands(i) && v > 0) { inPalm++; worst = Math.max(worst, Math.abs(b[i] / (v * 0.4 ** 6) - 1)); }
      });
      // 3: gained on the ring out to each radius against lost inside what it maps back to.
      const lostIn = (s) => sum(a, (i) => dist(i) < s) - sum(b, (i) => dist(i) < s);
      const gainedTo = (rr) => sum(b, (i) => dist(i) >= R && dist(i) < rr) - sum(a, (i) => dist(i) >= R && dist(i) < rr);
      const back = (rr) => R * Math.sqrt((rr * rr - R * R) / (O * O * R * R - R * R));
      const bands = [1.2, 1.45, O].map((k) => ({ k, gained: gainedTo(k * R), lost: lostIn(back(k * R)) }));
      const beyond = sum(b, (i) => dist(i) > O * R + cell) - sum(a, (i) => dist(i) > O * R + cell);
      const centre = (f) => { let t = 0, x = 0, y = 0; f.forEach((v, i) => { const p = at(i); t += v; x += v * p[0]; y += v * p[1]; }); return [x / t, y / t]; };
      const change = b.map((v, i) => Math.abs(v - a[i]));
      out[name] = {
        total: [sum(a, all), sum(b, all)], worst, inPalm, bands, beyond, moved: lostIn(R),
        centre: centre(change),
      };
    }
    // 6: the oil on the left half only, the palm on its edge; one press of each half.
    {
      await lab.create(M, M);
      const s = lab.solver();
      s.addMix(-0.5, 0.5, 1.0, { oil: 0.5 });
      const a = await read(s);
      const n = Math.round(Math.sqrt(a.length));
      const P = [0.5, 0.5];
      const cx = P[0] * M - 0.5, cy = P[1] * M - 0.5;
      lab.pressOil(cx, cy, RC, M, take);
      const b = await read(s);
      const mirror = new Array(n * n * 4).fill(0);
      a.forEach((v, i) => { mirror[i * 4] = v; mirror[i * 4 + 3] = v; });
      const d = lab.pressDye(mirror, n, cx, cy, RC, take);
      let oilRight = 0, dyeRight = 0, apart = 0, oilIn = 0, dyeIn = 0;
      for (let i = 0; i < n * n; i++) {
        const og = Math.max(0, b[i] - a[i]), dg = d.density[i];
        oilIn += og; dyeIn += dg; apart += Math.abs(og - dg);
        if (i % n >= n / 2) { oilRight += og; dyeRight += dg; }
      }
      // And what leaves: the colour's share from each palm cell is the oil's.
      let takeOff = 0, palmCells = 0;
      for (let i = 0; i < n * n; i++) {
        const dd = Math.hypot((i % n) - cx, Math.floor(i / n) - cy);
        if (dd >= RC || !(a[i] > 0)) continue;
        palmCells++;
        takeOff = Math.max(takeOff, Math.abs((a[i] - b[i]) / a[i] - (1 - d.mul[i])));
      }
      // In a corner, where most of the ring is off the plate: the colour taken is the colour landed.
      const flat = new Array(n * n * 4).fill(0);
      for (let i = 0; i < n * n; i++) flat[i * 4 + 3] = 0.5;
      const c = lab.pressDye(flat, n, 0.15 * M - 0.5, 0.15 * M - 0.5, RC, take);
      let cTaken = 0, cLanded = 0, cKept = 0, cTakenOff = 0;
      const ccx = 0.15 * M - 0.5, K = O * O - 1;
      for (let i = 0; i < n * n; i++) {
        cTaken += 0.5 * (1 - c.mul[i]); cLanded += c.density[i];
        // A palm cell whose landing is off the plate keeps its colour, as it keeps its oil.
        const dx = (i % n) - ccx, dy = Math.floor(i / n) - ccx, ds = Math.hypot(dx, dy);
        if (ds >= RC) continue;
        const f = Math.sqrt(RC * RC + ds * ds * K) / Math.max(ds, 1e-9);
        const lx = ccx + dx * f, ly = ccx + dy * f;
        if (lx < -0.5 || ly < -0.5 || lx >= n - 0.5 || ly >= n - 0.5) { cKept++; if (c.mul[i] < 1) cTakenOff++; }
      }
      out.half = { n, moved: d.moved, oilIn, dyeIn, oilRight, dyeRight, apart, takeOff, palmCells, cTaken, cLanded, cKept, cTakenOff };
    }
    const ctl = await press([0.3, 0.3], false);
    out.control = {
      cells: ctl.a.length, total: ctl.a.reduce((t, v) => t + v, 0),
      same: ctl.a.length > 0 && ctl.a.every((v, i) => v === ctl.b[i]),
    };
    return out;
  });
  const pct = (x) => `${(100 * x).toFixed(1)}%`;
  for (const name of ['middle', 'off it', 'corner']) {
    const x = r[name];
    check(`${name}: the oil is all still there`, Math.abs(x.total[1] - x.total[0]) < 0.01 * x.moved,
      `${x.total[0].toFixed(1)} → ${x.total[1].toFixed(1)}, ${(x.total[1] - x.total[0]).toFixed(1)} against ${x.moved.toFixed(1)} moved`);
  }
  for (const name of ['middle', 'corner']) {
    const x = r[name];
    check(`${name}: the palm takes the dye's share from every cell`, x.inPalm > 100 && x.worst < 0.002,
      `${x.inPalm} cells hold 0.4^6 of what they had, worst off by ${pct(x.worst)}`);
  }
  for (const name of ['middle', 'off it']) {
    const x = r[name];
    const off = x.bands.map((b) => Math.abs(b.gained / b.lost - 1));
    check(`${name}: it lands where the dye does, the palm spread over the ring`, x.moved > 50 && off.every((e) => e < 0.05) && Math.abs(x.beyond) < 0.01 * x.moved,
      `${x.bands.map((b) => `to ${b.k}R ${b.gained.toFixed(1)} of ${b.lost.toFixed(1)}`).join(', ')}, ${x.beyond.toFixed(2)} past it`);
  }
  const c = r.middle.centre;
  const moved = Math.hypot(c[0] - 0.5, c[1] - 0.5);
  check('it goes out evenly: the change\'s middle is the palm\'s', moved < 0.002, `off by ${moved.toFixed(4)} of the plate`);
  const h = r.half;
  check('the colour lands where its oil lands, cell by cell, and none of it in the water across the ring',
    h.n === 192 && h.moved > 50 && h.oilIn > 0.8 * h.moved && h.dyeIn > 0.8 * h.moved
      && h.oilRight < 0.01 * h.moved && h.dyeRight < 0.01 * h.moved && h.apart < 0.05 * h.moved,
    `${h.moved.toFixed(1)} taken; landed oil ${h.oilIn.toFixed(1)}, colour ${h.dyeIn.toFixed(1)}; on the far side oil ${h.oilRight.toFixed(2)}, colour ${h.dyeRight.toFixed(2)}; apart ${h.apart.toFixed(2)}`);
  check('and the colour leaves each palm cell as its oil does, and in a corner all the colour taken lands',
    h.palmCells > 1000 && h.takeOff < 1e-3 && h.cTaken > 50 && Math.abs(h.cLanded / h.cTaken - 1) < 0.01 && h.cKept > 100 && h.cTakenOff === 0,
    `${h.palmCells} palm cells, shares apart by at most ${h.takeOff.toExponential(1)}; corner ${h.cTaken.toFixed(1)} taken, ${h.cLanded.toFixed(1)} landed, ${h.cTakenOff} of the ${h.cKept} cells with nowhere to go taken from`);
  check('a press where there is no oil changes nothing, to the bit', r.control.same && r.control.total > 1 && r.control.cells > 1000,
    `${r.control.cells} cells, ${r.control.total.toFixed(1)} of oil elsewhere, ${r.control.same ? 'unchanged' : 'changed'}`);
} finally {
  await close();
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
