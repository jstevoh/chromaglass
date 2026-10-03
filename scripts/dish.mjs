#!/usr/bin/env node
/**
 * The spun dish's liquid, on the GPU solver alone (scripts/lab.mjs): the
 * swirl that `spinSwirl` makes, held to the physics it claims (PLAN.md §21).
 *
 *   npm run dish
 *
 * The solver works in a frame turning with the liquid's bulk. In it the dish
 * turns at A = Ω − ω_l, the liquid in a cell is dragged toward the dish at
 * k = 12ν/h² (the drag of a thin gap) and pushed back by the frame's own
 * acceleration, A k0, where k0 is the drag at the rest gap. Held steady, that
 * has an exact answer: the swirl goes round at w = A r (1 − k0/k), which is
 * zero where the cell is the bulk, the dish's own speed where the liquid is
 * gripped much harder than the bulk, and backwards where it is gripped less.
 * And spun, the liquid is a centrifuge: heavy outward, light inward, at a
 * drift that scales with the drag time. So the checks, each against an
 * answer worked out before the solver ran:
 *
 *   1. a flat plate of one liquid, spun hard: the swirl stays zero, to 1% of
 *      A r at the rim. The picture turns with the liquid and nothing inside
 *      it moves. (A check that the swirl is not simply always there.)
 *   2. a domed plate (Plate Curve 0.8, the rim tight and the middle open):
 *      the swirl goes round at A r (1 − h(r)²/h0²) at r = 0.1 to 0.35, to 10%
 *      of A r, and the right way round at each: with the dish (positive)
 *      where the glass is tight and against it where it is open. The
 *      measured profile is printed beside the formula.
 *   3. a press: the gap under a palm pressed toward its floor goes round with the
 *      dish (at least half of A r at its middle), the plate outside it
 *      barely at all (under a tenth). The drag is local, as a hand on glass
 *      is.
 *   4. oil in water: a disc of oil (50 mm²/s) in a plate of water (1 mm²/s)
 *      is gripped fifty times harder, so it goes round with the dish while
 *      the water beside it does not: more than half of A r in the oil,
 *      under a tenth in the water. The drag is the liquid's, not the look's.
 *   5. the centrifuge, with the dish and the liquid turning together (A = 0,
 *      so the drag has nothing to say): at a disc of heavy dye the swirl
 *      points outward, at a disc of oil inward, and with nothing spinning
 *      neither moves at all.
 *   6. and it scales with the drag time: the heavy disc's outward drift in a
 *      liquid four times thinner is four times faster once both have settled,
 *      and exactly 4 (1 − e^(−t/τ_thin)) / (1 − e^(−t/τ_thick)) at t = 0.75 s,
 *      to 5%.
 *   7. when the spinning stops the swirl dies away and is emptied: after
 *      the tail, the field is zero to the bit;
 *   8. with Thin Gap on (PLAN §18a), the swirl goes into the thin solve, and
 *      a pressed palm still goes round with the dish (at least half what the
 *      old plate's flow does there) while the plate away from it does not
 *      (under a tenth of the palm). Handed the integrated swirl, the thin
 *      solve counted the gap twice and the palm went round at 0.045 against
 *      the old plate's 0.53;
 *   9. and a plate nobody spins steps exactly as without the spin's numbers:
 *      a pressed plate, its liquid set moving by a push, stepped with the
 *      spin fields at zero and stepped without them, gives the same flow and
 *      the same dye to the bit, on the old plate and with Thin Gap on. The
 *      flow is asked to be moving first, so two still plates cannot pass it
 *      (the first version compared two plates with nothing moving at all).
 *
 * No canvas, so it runs on any adapter that computes: a Mac's Metal in CI,
 * a Linux box's software WebGPU anywhere else.
 */
import { openLab } from './lab.mjs';

let bad = 0;
const check = (name, ok, detail = '') => {
  if (!ok) bad++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab();
try {
  const r = await page.evaluate(async () => {
    const DISH_M = 0.2, H0 = 0.03;
    const drag = (nu, gap = H0) => (gap * DISH_M) ** 2 / (12 * nu);
    const THICK = 2e-5, WATER = 1e-6;
    // A plate at rest, with its gap laid at the look's curve (clear lays the dome).
    const fresh = async (curve = 0) => {
      await lab.create(256, 192);
      await lab.step(1, { plateCurve: curve });
    };
    const spin = (A, omega, nu, extra = {}) => ({ spinDish: A, spinLiquid: omega, spinTau: drag(nu), spinNu: nu, spinDyeWeight: 0.15, ...extra });
    // The swirl's azimuthal and radial parts, averaged over a ring or a disc (plate units).
    const sample = (f, pick) => {
      let az = 0, rad = 0, n = 0;
      for (let j = 0; j < f.m; j++) for (let i = 0; i < f.m; i++) {
        const x = (i + 0.5) / f.m, y = (j + 0.5) / f.m;
        if (!pick(x, y)) continue;
        const dx = x - 0.5, dy = y - 0.5, rr = Math.hypot(dx, dy) || 1;
        const wx = f.data[(j * f.m + i) * 2], wy = f.data[(j * f.m + i) * 2 + 1];
        az += (wx * -dy + wy * dx) / rr; rad += (wx * dx + wy * dy) / rr; n++;
      }
      return { az: az / Math.max(1, n), rad: rad / Math.max(1, n), n };
    };
    const ring = (r0, w = 0.012) => (x, y) => Math.abs(Math.hypot(x - 0.5, y - 0.5) - r0) < w;
    const disc = (cx, cy, rr) => (x, y) => Math.hypot(x - cx, y - cy) < rr;
    const maxAbs = (f) => { let m = 0; for (const v of f.data) m = Math.max(m, Math.abs(v)); return m; };
    const out = {};

    // 1. Flat, one liquid, spun hard: nothing moves in the liquid's frame.
    await fresh(0);
    await lab.step(90, spin(2, 0, THICK));
    out.flat = maxAbs(await lab.swirl());

    // 2. The dome: A r (1 − h²/h0²), held until steady (the widest gap's drag is 0.6 s).
    const curve = 0.8, A = 1;
    await fresh(curve);
    await lab.step(180, spin(A, 0, THICK, { plateCurve: curve }));
    const sw = await lab.swirl();
    out.dome = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35].map((r0) => {
      const r2 = Math.min(1, 4 * r0 * r0);
      const h = Math.max(0.004, Math.min(0.06, H0 * (1 - curve * (r2 - 0.5) * 2)));
      return { r: r0, want: A * r0 * (1 - (h * h) / (H0 * H0)), got: sample(sw, ring(r0)).az, scale: A * r0 };
    });

    // 3. A press: the gap under a palm at (0.65, 0.5) pressed toward its floor.
    await fresh(0);
    // lab.squish is in the delta grid's cells (192 across), as the app's is.
    for (let k = 0; k < 6; k++) { lab.squish(0.65 * 192, 96, 12, 0.004, 0, 'press'); lab.flush(); await lab.step(1, { gapSpring: 0 }); }
    const sq = await lab.squeeze();
    const gapAt = (x, y) => sq.gap[Math.floor(y * sq.n) * sq.n + Math.floor(x * sq.n)];
    out.pressGap = gapAt(0.65, 0.5);
    await lab.step(60, spin(A, 0, THICK, { gapSpring: 0 }));
    const sp = await lab.swirl();
    out.press = { inside: sample(sp, disc(0.65, 0.5, 0.02)).az, outside: sample(sp, (x, y) => Math.hypot(x - 0.35, y - 0.5) < 0.04).az, scale: A * 0.15 };

    // 4. Oil in water, on a flat plate.
    await fresh(0);
    lab.solver().addMix(0.7, 0.5, 0.06, { oil: 1 });
    // Water's rest drag is 3 s and the oil's 0.06: after 1.5 s the oil has
    // long since caught the dish and the water has barely begun.
    await lab.step(90, spin(A, 0, WATER));
    const so = await lab.swirl();
    out.oil = { inside: sample(so, disc(0.7, 0.5, 0.025)).az, water: sample(so, disc(0.3, 0.5, 0.04)).az, scale: A * 0.2 };

    // 5 and 6. The centrifuge: a heavy dye disc and an oil disc, dish and liquid together at 3 rad/s.
    const centrifuge = async (omega, nu) => {
      await fresh(0);
      lab.dye(0.72, 0.5, 0.05, [1, 0.2, 0.2], 1.5); lab.flush();
      lab.solver().addMix(0.28, 0.5, 0.05, { oil: 1 });
      await lab.step(1, {});
      await lab.step(45, spin(0, omega, nu));
      const f = await lab.swirl();
      return { heavy: sample(f, disc(0.72, 0.5, 0.03)).rad, light: sample(f, disc(0.28, 0.5, 0.03)).rad, max: maxAbs(f) };
    };
    out.spun = await centrifuge(3, THICK);
    out.still = await centrifuge(0, THICK);
    out.thinner = await centrifuge(3, THICK / 4);

    // 7. Stop and let the tail run out: the swirl is emptied.
    await fresh(0);
    lab.dye(0.6, 0.5, 0.08, [1, 1, 1], 1); lab.flush();
    await lab.step(30, spin(0, 3, THICK));
    // The tail is five of the widest gap's drag times: 3 s for this liquid.
    const tail = 5 * drag(THICK, 0.06);
    await lab.step(Math.ceil(tail * 60) + 5, spin(0, 0, THICK));
    const after = await lab.swirl();
    out.after = { max: maxAbs(after), nonzero: after.data.some((v) => v !== 0), tail };

    // 8 and 9. A pressed palm on each plate: its flow (the field the dye
    // rides), its azimuthal part at the palm and away from it.
    const az = (f, cx, cy, rr) => {
      const L = Math.round(Math.sqrt(f.length / 4));
      let s = 0, n = 0;
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
        const x = (i + 0.5) / L, y = (j + 0.5) / L;
        if (Math.hypot(x - cx, y - cy) >= rr) continue;
        const dx = x - 0.5, dy = y - 0.5, rr2 = Math.hypot(dx, dy) || 1, k = (j * L + i) * 4;
        s += (f[k] * -dy + f[k + 1] * dx) / rr2; n++;
      }
      return s / Math.max(1, n);
    };
    /*
      `kick` sets the liquid moving for check 9, with a finger's push across
      the palm. That check first leaned on the press itself to move the flow,
      which it did only through the leak #225 closed (a held press set the
      whole old plate flowing): with that gone the old plate under a still
      palm is still, 0 everywhere, and two still plates prove nothing. A push
      is motion the solver is meant to carry, so it stays whatever becomes
      of the press. Check 8 is left without it: its grip is read against an
      unpushed plate.
    */
    const pressed = async (extra, over, kick = false) => {
      await lab.create(256, 192); await lab.step(1, extra);
      for (let k = 0; k < 6; k++) { lab.squish(0.65 * 192, 96, 12, 0.004, 0, 'press'); lab.flush(); await lab.step(1, extra); }
      lab.dye(0.6, 0.5, 0.08, [1, 1, 1], 1);
      if (kick) lab.vel(0.5, 0.5, 0.1, [0.09, 0.03, 0, 0]);
      lab.flush();
      await lab.step(60, { ...extra, ...over });
      return { vel: await lab.field('vel'), dye: await lab.field('dye') };
    };
    out.grip = {};
    out.same = {};
    for (const [name, extra] of [['old', { gapSpring: 0 }], ['thin', { gapSpring: 0, thinGap: 1 }]]) {
      const spun = await pressed(extra, spin(A, 0, THICK));
      out.grip[name] = { palm: az(spun.vel, 0.65, 0.5, 0.02), away: az(spun.vel, 0.35, 0.5, 0.04) };
      const bare = await pressed(extra, {}, true);
      const zero = await pressed(extra, spin(0, 0, THICK), true);
      let dv = 0, dd = 0;
      for (let k = 0; k < bare.vel.length; k++) dv = Math.max(dv, Math.abs(bare.vel[k] - zero.vel[k]));
      for (let k = 0; k < bare.dye.length; k++) dd = Math.max(dd, Math.abs(bare.dye[k] - zero.dye[k]));
      out.same[name] = { moving: maxAbs({ data: bare.vel }), dv, dd };
    }
    return out;
  });

  check('a flat plate of one liquid, spun hard, has no swirl: the picture turns and nothing moves in it',
    r.flat < 0.01 * 2 * 0.5, `max |w| ${r.flat.toExponential(2)} plate widths/s, against A r = 1 at the rim`);
  console.log('     dome: r, A r (1 − h²/h0²), measured');
  for (const d of r.dome) console.log(`       ${d.r.toFixed(2)}  ${d.want.toFixed(4)}  ${d.got.toFixed(4)}`);
  const domeErr = Math.max(...r.dome.map((d) => Math.abs(d.got - d.want) / d.scale));
  check('a domed plate swirls at A r (1 − h²/h0²), to 10% of A r at every radius', domeErr < 0.1, `worst ${(100 * domeErr).toFixed(1)}%`);
  check('and the right way round: with the dish where the glass is tight, against it where it is open',
    r.dome.every((d) => Math.abs(d.want) < 0.02 * d.scale || Math.sign(d.got) === Math.sign(d.want)));
  check('a pressed palm grips its liquid: it goes round with the dish',
    r.press.inside > 0.5 * r.press.scale, `gap ${r.pressGap.toFixed(4)} (rest 0.03), ${(r.press.inside / r.press.scale).toFixed(2)} of A r`);
  check('and the plate away from it barely moves', Math.abs(r.press.outside) < 0.1 * r.press.scale,
    `${(r.press.outside / r.press.scale).toFixed(3)} of A r`);
  check('oil in water is gripped harder than the water: it goes round with the dish',
    r.oil.inside > 0.5 * r.oil.scale, `${(r.oil.inside / r.oil.scale).toFixed(2)} of A r`);
  check('and the water beside it lags', Math.abs(r.oil.water) < 0.1 * r.oil.scale, `${(r.oil.water / r.oil.scale).toFixed(3)} of A r`);
  check('spun, heavy dye is flung outward', r.spun.heavy > 0, `radial ${r.spun.heavy.toExponential(2)} plate widths/s`);
  check('and oil drawn inward', r.spun.light < 0, `radial ${r.spun.light.toExponential(2)}`);
  check('with nothing spinning, neither moves', r.still.max === 0, `max |w| ${r.still.max}`);
  /*
    Not simply four. 45 steps is 0.75 s, and the thinner liquid's drag time at
    the rest gap is 0.6 s, so it is still getting up to speed (the thick one,
    0.15 s, has long since arrived): each drift is its steady speed times
    1 − e^(−t/τ). The first version asked for 3 to 5.3 and read 2.84, which
    is that factor exactly; so the check asks for the answer with it in,
    which is sharper than waiting for both to settle while the discs move.
  */
  const settle = (tau) => 1 - Math.exp(-0.75 / tau);
  const want = 4 * settle(0.6) / settle(0.15);
  const ratio = r.thinner.heavy / Math.max(1e-12, r.spun.heavy);
  check(`the drift scales with the drag time: four times thinner, ${want.toFixed(2)}× faster by 0.75 s, to 5%`,
    Math.abs(ratio / want - 1) < 0.05, `${ratio.toFixed(3)}×`);
  check('when the spinning stops, the swirl dies away and is emptied', !r.after.nonzero, `max |w| ${r.after.max} after a ${r.after.tail.toFixed(1)} s tail`);
  const g = r.grip;
  check('with Thin Gap on, a pressed palm still goes round with the dish: at least half what the old plate gives',
    g.thin.palm > 0.5 * g.old.palm, `${g.thin.palm.toFixed(3)} against ${g.old.palm.toFixed(3)}`);
  check('and the plate away from it barely moves: under a tenth of the palm', Math.abs(g.thin.away) < 0.1 * g.thin.palm,
    `${g.thin.away.toExponential(2)} (the old plate ${g.old.away.toExponential(2)})`);
  for (const name of ['old', 'thin']) {
    const q = r.same[name];
    check(`a plate nobody spins steps exactly as without the spin's numbers (${name === 'thin' ? 'Thin Gap on' : 'the old plate'})`,
      q.moving > 0 && q.dv === 0 && q.dd === 0, `its flow moving at up to ${q.moving.toExponential(2)}; largest difference ${q.dv} in the flow, ${q.dd} in the dye`);
  }
} finally {
  await close();
}
console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
