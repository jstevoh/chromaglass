#!/usr/bin/env node
/**
 * One args name, one value a submit (PLAN 46r).
 *
 *   npm run argnames          (the lab on SwiftShader, about a minute)
 *
 * What was wrong. A dispatch's eight numbers live in a uniform buffer the
 * solver keeps under a name (`arg`, src/gpu/fluid/core.ts). A `writeBuffer`
 * lands on the queue ahead of the next submit, so what a buffer holds when a
 * step's commands run is whatever was written to it last. Two calls in one
 * step that share a name and differ in a value therefore both read the
 * second's. Three calls shared 'current grid': the lasting current's forces
 * and projection (z = 1 while the boil runs, 0 otherwise), the swirl's
 * projection (z = 0), and the open plate's addCurrent (z = Depth Drag, w =
 * the swirl's scale). On the open plate (Thin Gap off) addCurrent's write is
 * the last, so currentForces read Depth Drag as "the boil is running": at
 * Depth Drag above 0 and Heat 0 the lamp's lift left the clamped linear rise
 * every look has for the boil's uncapped density rise, and at Heat above 0
 * and Depth Drag 0 the boil's plate got the clamped one. A thin gap's
 * addCurrent has a name of its own, which is why no shipped look showed it
 * (every look opens thin) and why `npm run plateboil` (thin, or Depth Drag
 * 0) did not see it.
 *
 * What this asks, of the feature and not of one plate:
 *
 *   names   no name is given two different values between two submits, on
 *           the open plate and the thin one, with each of the things that
 *           put a value in a current's args turned up (Depth Drag, Heat,
 *           the spun dish, the oil). The solver's own `argWrite` is watched
 *           from here, in the page, so the frame pays nothing for it. A
 *           planted pair proves the watch catches one.
 *   drag    the lasting current after one step is a function of the current,
 *           the flow and the dye before it, and not of Depth Drag: the same
 *           plate stepped once at Depth Drag 0 and at 1.5 has the same
 *           current, bit for bit, at Heat 0 and at Heat 1. One step because
 *           that is the statement: after it the dye has ridden a flow the
 *           depth did slow, and the two plates differ as they should.
 *   boil    and the boil's rise is the boil's on the open plate too: at Heat
 *           1 the current under a 70 K spot runs past the cap the unheated
 *           current is held to (the boil's buoyancy is added after the cap,
 *           PLAN 36e-2), and at Heat 0 it does not.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** The plates the names are watched on: each turns up something that writes a current's args. */
const PLATES = [
  ['open plate', {}],
  ['open plate, Depth Drag', { depthDrag: 1.5 }],
  ['open plate, Heat', { heat: 1, dimmer: 1 }],
  ['open plate, Depth Drag and Heat', { depthDrag: 1.5, heat: 1, dimmer: 1 }],
  ['open plate, spun dish', { spinLiquid: 0.6, spinDish: 0.6, spinTau: 1 }],
  ['open plate, spun dish and Depth Drag', { spinLiquid: 0.6, spinDish: 0.6, spinTau: 1, depthDrag: 1.5 }],
  ['open plate, oil', { oilTension: 0.5, oilBodies: 1, surfactantFlow: 0.5 }],
  ['thin gap', { thinGap: 1 }],
  ['thin gap, Depth Drag and Heat', { thinGap: 1, depthDrag: 1.5, heat: 1, dimmer: 1 }],
  ['thin gap, spun dish', { thinGap: 1, spinLiquid: 0.6, spinDish: 0.6, spinTau: 1 }],
  ['thin gap, oil', { thinGap: 1, oilTension: 0.5, oilBodies: 1, surfactantFlow: 0.5 }],
];
const UPRIGHT = { plateUpright: 1, gravityY: -1, currentBuoy: 0.45 };

const { page, close } = await openLab();
const gpuErrors = [];
page.on('console', (m) => { if (/gpu error|validation|device lost/i.test(m.text())) gpuErrors.push(m.text().slice(0, 160)); });
try {
  const r = await page.evaluate(async ([plates, upright]) => {
    /** A plate with dye, a warm spot and a liquid on it, so every pass that could run has something to run on. */
    const lay = async (kelvin) => {
      await lab.create(64, 64);
      lab.dye(0.5, 0.5, 0.3, [1.5, 0.8, 0.3], 1);
      lab.dye(0.3, 0.65, 0.12, [0.2, 1.2, 1.6], 2);
      lab.vel(0.42, 0.45, 0.14, [0, 0, kelvin, 0]);
      lab.flush();
      return lab.solver();
    };
    /**
     * Watch the solver's args from here: every name written since the last
     * submit with the eight numbers it was given, and the names given two
     * different sets. `submit` and `submitRead` both end a window, since a
     * write queued before either lands before its commands.
     */
    const watch = (s) => {
      let seen = new Map();
      const names = new Set(), clashes = new Map();
      const write = s.argWrite.bind(s), submit = s.submit.bind(s), submitRead = s.submitRead.bind(s);
      s.argWrite = (name) => {
        const v = Array.from(s.argScratch);
        const was = seen.get(name);
        if (was && was.some((x, i) => !Object.is(x, v[i]))) clashes.set(name, [was, v]);
        seen.set(name, v);
        names.add(name);
        return write(name);
      };
      s.submit = (enc) => { seen = new Map(); return submit(enc); };
      s.submitRead = (enc) => { seen = new Map(); return submitRead(enc); };
      return { names, clashes };
    };

    // names: the control first, a pair planted under one name before a step's submit.
    const planted = await (async () => {
      const s = await lay(30);
      const w = watch(s);
      s.arg('argnames planted', [1, 0, 0, 0]);
      s.arg('argnames planted', [2, 0, 0, 0]);
      await lab.step(1, upright);
      return [...w.clashes.keys()];
    })();
    const rows = [];
    for (const [name, over] of plates) {
      const s = await lay(30);
      s.addLiquidDrop(0.55, 0.5, 0.1, { soap: 1, body: 1, repel: 1, weight: 1, polarity: 1 }, 1);
      if (over.oilTension) s.addMix(0.4, 0.5, 0.1, { oil: 1, soap: 0.5 });
      // Three steps unwatched first: a pass a look makes on first use (the mix, the boil) is running by then.
      await lab.step(3, { ...upright, ...over });
      const w = watch(s);
      await lab.step(3, { ...upright, ...over });
      rows.push({ name, thin: s.thinGapLive, names: w.names.size, current: [...w.names].filter((n) => /current|swirl/.test(n)), clashes: [...w.clashes].map(([n, [a, b]]) => `'${n}' [${a.slice(0, 4).join(', ')}] and [${b.slice(0, 4).join(', ')}]`) });
    }

    // drag and boil: the current after one step, read whole on its own grid.
    const current = async (over, kelvin = 30) => {
      const s = await lay(kelvin);
      await lab.step(1, { ...upright, ...over });
      const f = await s.readHalf(s.cur);
      let top = 0;
      for (let k = 0; k < f.data.length; k += 4) top = Math.max(top, Math.hypot(f.data[k], f.data[k + 1]));
      return { data: Array.from(f.data), top, thin: s.thinGapLive };
    };
    const differ = (a, b) => {
      const fa = new Float32Array(a), fb = new Float32Array(b);
      const ua = new Uint32Array(fa.buffer), ub = new Uint32Array(fb.buffer);
      let n = 0, worst = 0;
      for (let k = 0; k < ua.length; k++) if (ua[k] !== ub[k]) { n++; worst = Math.max(worst, Math.abs(fa[k] - fb[k])); }
      return { n, worst };
    };
    const cold = await current({ currentBuoy: 0 });
    const d0 = await current({});
    const d15 = await current({ depthDrag: 1.5 });
    const h0 = await current({ heat: 1, dimmer: 1 });
    const h15 = await current({ heat: 1, dimmer: 1, depthDrag: 1.5 });
    const CAP = 0.002;
    const capped = await current({ maxCurrent: CAP }, 70);
    const boiled = await current({ maxCurrent: CAP, heat: 1, dimmer: 1 }, 70);
    return {
      planted, rows, drew: lab.adapter(),
      open: !d0.thin && !d15.thin && !h0.thin && !h15.thin && !capped.thin && !boiled.thin,
      reach: differ(cold.data, d0.data), top: d0.top,
      heat0: differ(d0.data, d15.data), heat1: differ(h0.data, h15.data),
      cap: CAP, capped: capped.top, boiled: boiled.top,
    };
  }, [PLATES, UPRIGHT]);

  const who = r.drew ? `${r.drew.vendor} ${r.drew.architecture}`.trim() : 'no adapter';
  console.log(`one args name, one value a submit (drawn by ${who})`);
  check('the lab ran without a GPU error', !gpuErrors.length, gpuErrors.length ? gpuErrors.slice(0, 2).join(' | ') : 'none');

  check('names: the watch catches a pair planted under one name', r.planted.includes('argnames planted'), r.planted.length ? r.planted.join(', ') : 'nothing caught');
  const asked = r.rows.every((x) => x.names >= 20 && x.current.length > 0)
    && r.rows.every((x, i) => x.thin === (PLATES[i][1].thinGap === 1));
  check('names: every plate ran as asked (thin or open) and wrote a current\'s args while watched', asked,
    r.rows.map((x) => `${x.name}: ${x.names} names${x.thin ? ', thin' : ''}`).join('; '));
  const clashed = r.rows.filter((x) => x.clashes.length);
  check(`names: no name is given two values in one submit (${PLATES.length} plates, three steps each)`, !clashed.length,
    clashed.length ? clashed.map((x) => `${x.name}: ${x.clashes.join('; ')}`).join(' | ') : 'none');

  check('drag: the plates are open ones, and the warm spot drives the current (Buoyancy 0.45 against 0)',
    r.open && r.reach.n > 0 && r.top > 0, `${r.reach.n} values differ, the current's fastest ${r.top.toExponential(2)}${r.open ? '' : ', a plate ran thin'}`);
  check('drag: at Heat 0 the current after one step is the same at Depth Drag 0 and 1.5, bit for bit', r.heat0.n === 0,
    r.heat0.n ? `${r.heat0.n} values differ, worst ${r.heat0.worst.toExponential(2)}` : 'none different');
  check('drag: at Heat 1 the current after one step is the same at Depth Drag 0 and 1.5, bit for bit', r.heat1.n === 0,
    r.heat1.n ? `${r.heat1.n} values differ, worst ${r.heat1.worst.toExponential(2)}` : 'none different');
  /*
    The cap is on the forces, before the current's own projection, which
    takes speed away and gives none: 1.05 is half-float rounding's room. The
    boil's rise for 70 K over the room is added after the cap and is some
    hundreds of times it (Buoyancy 0.45 × Kell's density deficit as about
    160 K of the linear rise × the damping's fiftieth), so 3× is a bar a
    boil that is read clears by two orders and a boil that is not read
    cannot reach.
  */
  check('boil: at Heat 0 a 70 K spot\'s current keeps to its cap on the open plate', r.capped > 0 && r.capped <= r.cap * 1.05,
    `fastest ${r.capped.toExponential(2)}, cap ${r.cap}`);
  check('boil: at Heat 1 it runs past the cap (the boil\'s own rise, added after it), Depth Drag 0', r.boiled > r.cap * 3,
    `fastest ${r.boiled.toExponential(2)}, cap ${r.cap} (bar over 3×)`);
} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok);
if (failed.length) { console.error(`\n${failed.length} of ${checks.length} failed.`); process.exit(1); }
console.log(`\nAll ${checks.length} passed.`);
