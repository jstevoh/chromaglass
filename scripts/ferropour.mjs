#!/usr/bin/env node
/**
 * Ferro Paint's ferrofluid worked through the whole plate, measured on the
 * GPU solver alone (scripts/lab.mjs).
 *
 *   npm run ferropour
 *
 * The owner called Ferro Paint underwhelming beside the looks it was made
 * after, Chemical Bouillon's Colored I and II. Put side by side, the gap was
 * where the ferrofluid is, before how it looks: in those films it is worked
 * through the colour edge to edge, black channels and beads between cells of
 * dye across the whole frame. Ferro Paint poured it as every look does, a
 * ring of big drops round the middle (phasePour's `ring`), so its maze only
 * ever formed in the ring and most of the plate stayed plain colour. It now
 * pours `scatter`: many small drops over the whole plate (src/lib/phasePour.ts,
 * phasePourShape in src/presetPlate.ts). What this asks:
 *
 *   1. every other look still pours exactly the drops it poured before
 *   2. the scatter pours the same share of the plate whatever the Scale, and
 *      does not read Ferrofluid at all: the pour happens at one moment, and
 *      a look faded in or handed off with Go pours while Ferrofluid is still
 *      on its way up (see SCATTER_COVER). When it read it, those pours
 *      landed 0 or 1 drops and about 80 of 180
 *   3. Ferro Paint, laid and then played with its own field and walking
 *      magnet, has ferrofluid worked through nearly every part of the plate
 *      (black and colour side by side in each tile of an 8 × 8 grid), and
 *      still has after three times as long: a check at one moment would not
 *      see it gathered or coarsened back into a few blobs later. The same
 *      look poured the old way is the other arm, so a measure that could
 *      not tell the two would show it
 *   4. and the playing is what drew it: the black has moved off the drops it
 *      was poured as. Without this, 3 would pass on the pour alone, before a
 *      single step (a pour rasterised at 256² already has black and colour
 *      in every tile)
 *   5. as channels through the colour, not one pool with holes in it: the
 *      black is under half the plate, and its fingers narrower than the
 *      ring's blobs
 *   6. and a pool reads as one: the same ferrofluid poured as a single
 *      disc falls under 3's bar, so the tiles can see a gathered plate
 *   7. with all the ferrofluid still there
 *
 * Measured while writing this (256², SwiftShader). Poured over the plate
 * (179 drops): at the pour 100% of the tiles worked, black 41%, fingers
 * 0.0240; after 240 steps 98%, 35%, 0.0233, 26% of the plate moved; after
 * 720, 94%, 32%, 0.0236, 39% moved. Poured as the ring (18 drops): 42% at
 * the pour, 45% after 240, black 17%, fingers 0.0366, 9% moved. The bounds
 * (worked at least 90% at both times against under 70%; moved over 15%;
 * black a fifth to a half; fingers under 0.8 of the ring's) sit between
 * those with room for another GPU's rounding.
 *
 * 6 was first written as the same pour under the magnet at full strength,
 * held still over the middle, for 240 steps. It read 98%: at this reach
 * the magnet stands up what is under it and leaves the rest of a maze this
 * spread out alone, so it was not a pool at all, and a control that makes
 * none cannot show the tiles would see one. A pool is made directly
 * instead: the same volume as one disc over the middle, which reads 25%.
 *
 * What it is not: the app. The flow is the lab's (BASE in lab-entry.ts: no
 * turbulence, dye or hands), and the walk advances a thirtieth of a second
 * every three steps where the app advances it by wall time. Where the pour
 * lands and what the maze does with it is the solver's, which is the same;
 * how Ferro Paint looks at 60 fps is docs/judging.md's, on the owner's Mac.
 *
 * On 256², where Maze Detail does nothing (its twelve-cell floor, see
 * `npm run maze`): what is measured is where the ferrofluid is, which the
 * grid does not change, and 256² keeps this to minutes on a software GPU.
 * How fine the maze is at 512² is `npm run maze`'s question.
 *
 * No canvas, so it runs on any adapter that computes: a Mac's Metal in CI,
 * a Linux box's software WebGPU anywhere else.
 */
import { openLab } from './lab.mjs';
import { phasePour, SCATTER_COVER } from '../src/lib/phasePour.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── 1. The ring, as layPhase poured it before there was a choice ──────
{
  // Copied from LiquidVisualizer's layPhase as it stood before phasePour, so
  // that moving it out of the app is held to changing nothing.
  const before = (scale) => {
    const s = Math.max(0, Math.min(1, scale)), out = [];
    const count = Math.round(3 + (1 - s) * 22), r = 0.04 + s * 0.16;
    for (let k = 0; k < count; k++) {
      const a = k * 2.399963229728653, rad = 0.16 + 0.3 * ((k * 0.6180339887) % 1);
      out.push({ x: 0.5 + Math.cos(a) * rad, y: 0.5 + Math.sin(a) * rad, r, amount: 0.9 });
    }
    return out;
  };
  const bad = [];
  for (const scale of [0, 0.1, 0.3, 0.4, 0.55, 1, -1, 2]) {
    if (JSON.stringify(phasePour('ring', scale)) !== JSON.stringify(before(scale))) bad.push(`scale ${scale}`);
  }
  check('every look that pours a ring pours the same drops it did', bad.length === 0, bad.join('; ') || 'eight scales');
}

// ── 2. The scatter's volume, whatever the Scale ───────────────────────
{
  // A splat holds amount · πr²/2 (phaseSplat: 1 − d² of its amount).
  const off = [];
  for (let s = 0; s <= 1.0001; s += 0.1) {
    const drops = phasePour('scatter', s);
    const vol = drops.reduce((v, d) => v + d.amount * Math.PI * d.r * d.r / 2, 0);
    if (!(Math.abs(vol / SCATTER_COVER - 1) < 0.03) || drops.length < 20) off.push(`scale ${s.toFixed(1)}: ${drops.length} drops, ${vol.toFixed(3)}`);
  }
  const at = (s) => phasePour('scatter', s).length;
  check('the scatter pours the same share of the plate at every Scale, and reads nothing else',
    off.length === 0 && phasePour.length === 2,
    off.join('; ') || `${SCATTER_COVER} of the plate at eleven Scales (${at(0)} drops at 0, ${at(0.3)} at 0.3, ${at(1)} at 1)`);
}

const GRID = 256, EARLY = 240, LATE = 720;
const { page, close } = await openLab();
try {
  /*
    The look laid and played. Its dye is left off: nothing here reads it, and
    the phase does not depend on it. The field is the look's Labyrinth at
    0.725 of full, where the app holds it between kicks at middling
    loudness; the magnet walks the app's path at the app's speed for middling
    loudness (magnetWalk in LiquidVisualizer), at the look's strength and
    height. Read at the pour and at each checkpoint.
  */
  const play = (pour, checkpoints) => page.evaluate(async ({ pour, checkpoints, GRID, cover }) => {
    const { settings: L } = lab.look('ferro-paint');
    const need = (k) => { const v = L[k]; if (!Number.isFinite(v)) throw new Error(`Ferro Paint's ${k} is ${v}`); return v; };
    const scale = need('phaseScale'), walk = need('magnetWalk');
    await lab.create(GRID);
    // The pool: the scatter's volume (SCATTER_COVER of the plate) as one
    // disc, 0.9 · πR²/2 = SCATTER_COVER.
    const drops = pour === 'pool' ? (lab.addPhase(0.5, 0.5, Math.sqrt(2 * cover / (0.9 * Math.PI)), 0.9), 1) : lab.pour(pour, scale);
    const read = async () => {
      const f = await lab.phase(); const n = f.n, d = f.data, T = n / 8;
      let mass = 0, area = 0, edge = 0, worked = 0;
      const black = new Uint8Array(n * n);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const v = d[x + y * n]; mass += v; if (v > 0.5) { area++; black[x + y * n] = 1; }
        if (x + 1 < n && (v > 0.5) !== (d[x + 1 + y * n] > 0.5)) edge++;
        if (y + 1 < n && (v > 0.5) !== (d[x + (y + 1) * n] > 0.5)) edge++;
      }
      for (let ty = 0; ty < 8; ty++) for (let tx = 0; tx < 8; tx++) {
        let b = 0;
        for (let y = ty * T; y < (ty + 1) * T; y++) for (let x = tx * T; x < (tx + 1) * T; x++) b += black[x + y * n];
        const share = b / (T * T);
        if (share >= 0.1 && share <= 0.9) worked++;
      }
      return { mass, cover: area / (n * n), width: edge ? 2 * area / edge / n : Infinity, worked: worked / 64, black };
    };
    const at0 = await read();
    const out = { drops, 0: at0 };
    let walkT = 0, done = 0;
    for (const c of checkpoints) {
      for (; done < c; done += 3) {
        const mx = 0.5 + 0.34 * walk * Math.sin(walkT * 0.9), my = 0.5 + 0.28 * walk * Math.sin(walkT * 1.3 + 1.1);
        await lab.step(3, {
          ferroLabyrinth: Math.min(1, need('ferroLabyrinth') * 0.725), phaseSharp: need('phaseSharp'), phaseTension: scale * 0.45,
          magnetStrength: need('magnetStrength'), magnetX: mx, magnetY: my,
          magnetHeight: need('magnetHeight') * (0.5 + scale),
          mazeDetail: need('mazeDetail'), phaseDisplace: need('phaseDisplace'),
        });
        walkT += (1 / 30) * (0.35 + 1.1 * 0.5) * (0.6 + 0.6 * walk);
      }
      const r = await read();
      // Cells that are black now and were not at the pour, or were and are not.
      let moved = 0; for (let i = 0; i < r.black.length; i++) if (r.black[i] !== at0.black[i]) moved++;
      out[c] = { ...r, moved: moved / r.black.length };
    }
    for (const k of Object.keys(out)) if (out[k]?.black) delete out[k].black;
    return out;
  }, { pour, checkpoints, GRID, cover: SCATTER_COVER });

  const look = await page.evaluate(() => lab.look('ferro-paint').pour);
  const now = await play(look, [EARLY, LATE]);
  const old = await play('ring', [EARLY]);
  const pooled = await play('pool', []);
  const pct = (v) => `${(v * 100).toFixed(0)}%`;
  const line = (r) => `worked ${pct(r.worked)}, black ${pct(r.cover)}, fingers ${r.width.toFixed(4)}${r.moved !== undefined ? `, moved ${pct(r.moved)}` : ''}`;
  console.log(`  ${GRID}². Ferro Paint poured '${look}' (${now.drops} drops): at the pour ${line(now[0])}`);
  console.log(`    after ${EARLY} steps ${line(now[EARLY])}; after ${LATE} ${line(now[LATE])}`);
  console.log(`  poured 'ring' (${old.drops} drops): at the pour ${line(old[0])}; after ${EARLY} ${line(old[EARLY])}`);
  console.log(`  the same ferrofluid as one pool: ${line(pooled[0])}\n`);

  // The old arm has to be a plate before it can be a comparison: nothing
  // poured reads worked 0 and fingers Infinity, and would pass both.
  const ringReal = old.drops === 18 && old[EARLY].cover > 0.1 && Number.isFinite(old[EARLY].width);
  check('Ferro Paint pours its own shape, not the ring', look === 'scatter', `phasePourShape gives '${look}'`);
  check('its ferrofluid is worked through nearly the whole plate, and still is three times later',
    ringReal && now[EARLY].worked >= 0.9 && now[LATE].worked >= 0.9 && old[EARLY].worked < 0.7,
    `black and colour side by side in ${pct(now[EARLY].worked)} then ${pct(now[LATE].worked)} of an 8 × 8 grid's tiles, against ${pct(old[EARLY].worked)} poured the old way`
    + (ringReal ? '' : ` (the ring arm poured ${old.drops} drops, black ${pct(old[EARLY].cover)}: not a plate to compare with)`));
  check('and the playing drew it: the black has moved off the drops it was poured as',
    now[LATE].moved > 0.15,
    `${pct(now[LATE].moved)} of the plate changed between black and colour since the pour`);
  check('as channels through the colour, not a pool',
    ringReal && now[LATE].cover > 0.2 && now[LATE].cover < 0.5 && now[EARLY].width < old[EARLY].width * 0.8,
    `black ${pct(now[LATE].cover)} of the plate; fingers ${now[EARLY].width.toFixed(4)} of the plate wide against the ring's ${old[EARLY].width.toFixed(4)} at the same age`);
  check('and a pool reads as one', pooled[0].worked < 0.9 && Math.abs(pooled[0].mass / now[0].mass - 1) < 0.1,
    `the same ferrofluid (${pooled[0].mass.toFixed(0)} against ${now[0].mass.toFixed(0)}) as one disc: ${pct(pooled[0].worked)} of the tiles`);
  const drift = (r, c) => Math.abs(r[c].mass / r[0].mass - 1);
  check('and keeps all the ferrofluid', drift(now, LATE) < 0.001 && drift(old, EARLY) < 0.001,
    `${now[0].mass.toFixed(1)} → ${now[LATE].mass.toFixed(1)} poured over the plate, ${old[0].mass.toFixed(1)} → ${old[EARLY].mass.toFixed(1)} in the ring`);
} finally {
  await close();
}
const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
