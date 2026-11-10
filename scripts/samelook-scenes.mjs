#!/usr/bin/env node
/**
 * The plates `npm run samelook` draws, in one tree (PLAN.md 46-0).
 *
 *   node <this file> --tree <a checkout> --out <file.json> [--grid 256] [--size 256] [--steps 1,90]
 *
 * Run once in the change's own tree and once in a checkout of the commit it
 * is compared against, each time with that tree's own lab (`scripts/lab.mjs`
 * and `scripts/lab-entry.ts`, so the solver and the plate shader are the
 * tree's), and the same lay, so the two can be laid side by side pixel for
 * pixel. Lives beside samelook.mjs rather than in it because the other tree
 * does not have samelook.mjs: it is run from this tree with the other as its
 * working directory.
 *
 * The lay is each look as the app opens it, as far as the lab can: the look's
 * own dyes (`PRESET_CONTRACTS`), in seeded drops, its liquid poured in its own
 * shape, a seeded stir, and the look's own settings drawn by the real plate
 * shader. The step is the app's thin gap (every look opens on one) with the
 * app's dt and advection, as `rides` and `musicforce` step it. `--over` adds
 * step parameters for a control (`npm run samelook` passes them only to show
 * the bars catch a change).
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = (name, fallback) => {
  const i = process.argv.lastIndexOf(`--${name}`); // the last one wins, so a control can override the guard's own
  return i > 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
};
const tree = arg('tree', process.cwd());
const out = arg('out', null);
const GRID = Number(arg('grid', 256));
const SIZE = Number(arg('size', 256));
const RENDER = Number(arg('render', SIZE));
const STEPS = arg('steps', '1,90').split(',').map(Number);
const LOOKS = arg('looks', '').split(',').filter(Boolean);
const OVER = JSON.parse(arg('over', '{}'));
const SPEED = Number(arg('speed', 2.5));
const CAMS = JSON.parse(arg('cams', '[{"name":"plate","cam":{}},{"name":"closeup","cam":{"zoom":3,"cx":0.45,"cy":0.55}}]'));

process.chdir(tree);
const { openLab } = await import(pathToFileURL(join(tree, 'scripts/lab.mjs')).href);
const { page, js, close } = await openLab({ tag: arg('tag', 'samelook') });
const bundle = createHash('sha256').update(js).digest('hex').slice(0, 16);
const t0 = Date.now();
try {
  const shots = await page.evaluate(async ({ GRID, SIZE, RENDER, STEPS, LOOKS, OVER, CAMS, SPEED }) => {
    const ids = LOOKS.length ? LOOKS : lab.lookIds();
    const N = GRID;
    // The app's step on a thin gap, as rides.mjs and musicforce.mjs lay it.
    const base = { thinGap: 1, gapThickness: 0.45, dt: 0.003, advection: 0.45, gapSpring: 0.00048, turbDetail: 3, meanDensity: 0, maxCurrent: 0.75 / (0.003 * 0.45 * (N - 2)), currentDamp: 0.99 };
    /*
      And the look's own physics, so each look runs the kernels it switches
      on (the magnet, the second phase's tension and bodies, the film, the
      reaction, buoyancy): the settings that share a name with a step
      parameter, as the look sets them. A named shortcut (PLAN.md 46-2): the
      app maps settings to a step inside LiquidVisualizer.tsx, with unit
      changes on some, and the lab cannot call that; these are the ones that
      turn a part of the solver on, passed as the look holds them, the same in
      both trees. The ones whose units the app changes (advection, damping,
      sharpness, the gap) stay the app's thin-gap step above.
    */
    const PHYSICS = ['buoyancy', 'phaseSharp', 'magnetX', 'magnetY', 'magnetHeight', 'magnetStrength', 'oilTension', 'oilBodies',
      'ferroLabyrinth', 'mazeDetail', 'phaseDisplace', 'clearFilm', 'surfactantFlow', 'soapBreakdown', 'solutalBuoyancy',
      'doubleDiffusion', 'bzReaction', 'liesegang'];
    const shots = [];
    const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
    for (const id of ids) {
      const { settings, pour, dyes } = lab.look(id);
      const own = Object.fromEntries(PHYSICS.filter((k) => typeof settings[k] === 'number').map((k) => [k, settings[k]]));
      const app = { ...base, ...own, ...OVER };
      await lab.create(N, N);
      let seed = 9001;
      for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const inks = (dyes.length ? dyes : [{ r: 255, g: 60, b: 40 }, { r: 40, g: 120, b: 255 }]).map((c) => lab.dyeOf([c.r, c.g, c.b]));
      for (let k = 0; k < 9; k++) lab.dye(0.2 + 0.6 * rnd(), 0.2 + 0.6 * rnd(), 0.05 + 0.08 * rnd(), inks[k % inks.length], 0.8 + 0.8 * rnd());
      if (pour) lab.pour(pour, settings.phaseScale ?? 1);
      /*
        A stir every ten steps, seeded: the thin gap's own drag stills a
        current within about a hundred steps, and a plate that has stopped
        draws the same in any solver. Each stir is four eddies at a share
        of the step's speed cap.
      */
      const eddies = Array.from({ length: 4 }, () => {
        const a = rnd() * 2 * Math.PI, s = SPEED * (N / 128) * (0.6 + 0.8 * rnd());
        return [0.25 + 0.5 * rnd(), 0.25 + 0.5 * rnd(), 0.1 + 0.08 * rnd(), [Math.cos(a) * s, Math.sin(a) * s, 0, 0]];
      });
      const stir = (k) => { const [x, y, r, v] = eddies[k % 4]; lab.vel(x, y, r, v); };
      lab.flush(app.dt);
      let done = 0;
      const tLook = performance.now();
      for (const at of STEPS) {
        while (done < at) {
          if (done % 10 === 0) { stir(done / 10); lab.flush(app.dt); }
          const n = Math.min(at, done + 10 - (done % 10)) - done;
          await lab.step(n, app);
          done += n;
        }
        for (const { name, cam } of CAMS) {
          const px = await lab.render(RENDER, settings, { time: done * app.dt, ...cam });
          shots.push({ look: id, steps: at, cam: name, size: RENDER, ms: Math.round(performance.now() - tLook), rgba: b64(new Uint8Array(px.buffer ?? px)) });
        }
      }
    }
    return shots;
  }, { GRID, SIZE, RENDER, STEPS, LOOKS, OVER, CAMS, SPEED });
  const meta = { tree, bundle, grid: GRID, size: SIZE, render: RENDER, steps: STEPS, over: OVER, seconds: (Date.now() - t0) / 1000 };
  if (out) writeFileSync(out, JSON.stringify({ meta, shots }));
  else console.log(JSON.stringify(meta), shots.length, 'shots');
} finally {
  await close();
}
