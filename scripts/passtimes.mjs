/**
 * The GPU pass readout (PLAN.md 14ab-16): the list `?debug` shows under the
 * grid on the laptop, the desk and the phone, from the profilers' timestamps.
 *
 *   npm run passtimes
 *
 * What it holds, with no GPU. The timestamps themselves are the GPU's and a
 * node check cannot make them; the profiler that takes them has its own test
 * in `gpu/selftest.ts` (a `?debug` page, "timestamps granted but no pass time
 * came back"). What can go wrong between those numbers and the screen is the
 * arithmetic and the words, and that is what this checks (the wiring, from
 * the visualizer to the phone's screen, is `npm run passtimesapp`):
 *
 *   1. a solver pass is per step and the drawing's per frame, so the solver's
 *      are scaled by the steps a frame takes: at two steps a frame a 1.2 ms
 *      pressure solve must outrank a 1.5 ms plate pass, and at half a step
 *      fall below it. Built so the order flips between the two, so a list
 *      that forgot to scale, or scaled the drawing too, fails one of them;
 *   2. costliest first, the second layer's passes named `L2`, the first
 *      layer's not, and a layer with no GPU solver skipped without taking a
 *      number;
 *   3. a pass that stopped running (its entry decayed toward zero in the
 *      profiler) is left out, and one that is cheap but running is kept;
 *   4. no timestamps reads as no timestamps, not as an empty frame: a stage
 *      profiler that is not timing (a device without 'timestamp-query' still
 *      has one, with an empty map) gives null, and the readout says so in
 *      words;
 *   5. the loop's steps a second and frame interval turned into steps a
 *      frame (sixty at 33.3 ms is two), and the list's total equal to the
 *      governor's frame cost (`frameGpuMs`) for the same steps, so the two
 *      readings of one set of profilers cannot drift apart;
 *   6. the readout, rendered: its total is the sum, the rows are in the
 *      list's order, past eight they are summed into "N more", the
 *      `&stages` hint shows only while the solver is one whole pass, and a
 *      page that did not ask (not `?debug`) draws nothing.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { framePasses, frameGpuMs, gpuPassTotal, solverStepMs, stepsPerFrame, PASS_FLOOR_MS } from '../src/lib/gpuPasses.ts';
import { GpuPassReadout, PASSES_SHOWN } from '../src/components/settings/GpuPassReadout.tsx';

let failed = 0;
const line = (ok, what, got) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${got === undefined ? '' : `  (${got})`}`);
  if (!ok) failed++;
};
const near = (a, b) => Math.abs(a - b) < 1e-9;
const labels = (list) => (list ? list.map((p) => p.label).join(', ') : String(list));

/*
  The app hands \`framePasses\` the stage's profiler and finds each layer's
  solver profiler with an \`instanceof\` (\`gpu/gpuTimes.ts\`). Here a profiler is
  a plain { enabled, ms } and a layer is its solver's map or null (a layer
  with no GPU solver), which is all the arithmetic reads.
*/
const clockOf = (layer) => (layer ? { ms: layer } : null);
const stage = (ms, enabled = true) => ({ enabled, ms });
const gpuPassTimes = (drawingMs, layers, spf) => framePasses(drawingMs ? stage(drawingMs) : null, layers, clockOf, spf);

const drawing = new Map([['plate', 1.5], ['camera', 0.4], ['finish', 0.2]]);
const solver = new Map([['project 1', 1.2], ['squeeze', 0.3], ['advect dye', 0.1]]);

// 1. Per frame: the order flips with the steps a frame takes.
{
  const two = gpuPassTimes(drawing, [solver], 2);
  line(two[0].label === 'project 1' && near(two[0].ms, 2.4), 'two steps a frame: the 1.2 ms solve costs 2.4 and outranks the 1.5 ms plate', labels(two));
  const plate = two.find((p) => p.label === 'plate');
  line(near(plate.ms, 1.5), 'the drawing is not scaled by the steps', plate.ms);
  const half = gpuPassTimes(drawing, [solver], 0.5);
  line(half[0].label === 'plate' && near(half.find((p) => p.label === 'project 1').ms, 0.6), 'half a step a frame: the solve costs 0.6 and falls below the plate', labels(half));
  const none = gpuPassTimes(drawing, [solver], 0);
  line(!none.some((p) => p.label === 'project 1'), 'no steps this frame: the solver costs the frame nothing', labels(none));
  const nan = gpuPassTimes(drawing, [solver], NaN);
  line(nan.length === 3, 'a steps reading that is not a number is taken as none', labels(nan));
}

// 2. Order, layers.
{
  const back = new Map([['project 1', 0.9], ['squeeze', 0.25]]);
  const list = gpuPassTimes(drawing, [solver, null, back], 1);
  let sorted = true;
  for (let i = 1; i < list.length; i++) if (list[i].ms > list[i - 1].ms) sorted = false;
  line(sorted, 'costliest first', list.map((p) => p.ms.toFixed(2)).join(' '));
  line(list.some((p) => p.label === 'L2 project 1') && list.some((p) => p.label === 'project 1'),
    'the second GPU layer is named L2 and the first is not, with a CPU layer between them', labels(list));
  line(!list.some((p) => p.label.startsWith('L3')), 'a layer with no GPU solver takes no number');
  line(near(gpuPassTotal(list), 1.5 + 0.4 + 0.2 + 1.2 + 0.3 + 0.1 + 0.9 + 0.25), 'the total is every pass', gpuPassTotal(list).toFixed(3));
}

// 3. Decayed entries.
{
  // 1.31 ms decaying by 0.9 a frame (GpuProfiler.afterSubmit) is under a microsecond after 71 frames, 1.2 s.
  const stale = new Map([['plate', 1.5], ['dye diffuse', 1.31 * 0.9 ** 400], ['just under', 0.0009], ['just over', 0.0011], ['grain', 0.004]]);
  const list = gpuPassTimes(stale, [], 1);
  line(!list.some((p) => p.label === 'dye diffuse'), 'a pass that stopped four hundred frames ago is not listed', labels(list));
  line(!list.some((p) => p.label === 'just under') && list.some((p) => p.label === 'just over'),
    `the floor is ${PASS_FLOOR_MS * 1000} µs: 0.9 µs is left out and 1.1 µs kept`, labels(list));
  line(list.some((p) => p.label === 'grain'), 'a cheap pass that is running (4 µs) is listed', labels(list));
  const solverStale = gpuPassTimes(new Map([['plate', 1]]), [new Map([['viscosity', 0.0006]])], 2);
  line(solverStale.some((p) => p.label === 'viscosity'), 'the floor is on the frame\'s cost: 0.6 µs a step at two steps a frame is 1.2 µs, and listed', labels(solverStale));
}

// 4. No timestamps.
{
  line(framePasses(stage(new Map(), false), [solver], clockOf, 1) === null,
    'a stage profiler that is not timing (no timestamp-query: an empty map) gives null, not an empty list');
  line(framePasses(stage(new Map(), true), [], clockOf, 1)?.length === 0, 'a timing one with nothing back yet gives an empty list');
  line(framePasses(null, [solver], clockOf, 1) === null, 'no stage yet gives null');
  const html = renderToStaticMarkup(React.createElement(GpuPassReadout, { passes: null }));
  line(/no timestamps/.test(html), 'and the readout says this GPU gives none', html.replace(/<[^>]+>/g, ' ').trim());
  const wait = renderToStaticMarkup(React.createElement(GpuPassReadout, { passes: [] }));
  line(/no timings back yet/.test(wait), "before the first timings come back it says so");
  const off = renderToStaticMarkup(React.createElement(GpuPassReadout, { passes: undefined }));
  line(off === '', 'a page that did not ask draws nothing');
}

// 5. Steps a frame, and the governor's number.
{
  line(near(stepsPerFrame(60, 1000 / 30), 2), 'sixty steps a second at 33.3 ms frames is two steps a frame', stepsPerFrame(60, 1000 / 30));
  line(near(stepsPerFrame(30, 1000 / 60), 0.5), 'thirty at 16.7 ms is half a step', stepsPerFrame(30, 1000 / 60));
  line(stepsPerFrame(NaN, 16.7) === 0 && stepsPerFrame(60, 0) === 0, 'no reading is no steps');
  const back = new Map([['project 1', 0.9], ['squeeze', 0.25]]);
  const layers = [solver, null, back];
  for (const steps of [0.5, 1, 2]) {
    const list = framePasses(stage(drawing), layers, clockOf, steps);
    const gov = frameGpuMs(stage(drawing), layers, clockOf, steps);
    line(near(gpuPassTotal(list), gov), `at ${steps} steps a frame the list's total is the governor's frame cost`, `${gpuPassTotal(list).toFixed(3)} and ${gov.toFixed(3)}`);
  }
  line(near(solverStepMs(layers, clockOf), 1.2 + 0.3 + 0.1 + 0.9 + 0.25), "one step is every layer's solver passes", solverStepMs(layers, clockOf).toFixed(3));
}

// 6. The readout.
{
  const many = new Map(Array.from({ length: 11 }, (_, i) => [`pass ${i}`, 1 + i * 0.1]));
  const list = gpuPassTimes(many, [new Map([['solver step', 2]])], 2);
  const html = renderToStaticMarkup(React.createElement(GpuPassReadout, { passes: list }));
  const rows = [...html.matchAll(/data-testid="gpu-pass"><span[^>]*>([^<]*)<\/span><span[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]]);
  const total = gpuPassTotal(list);
  line(html.includes(`GPU ${total.toFixed(1)} ms a frame`), 'the header is the sum of the passes', total.toFixed(1));
  line(rows.length === PASSES_SHOWN + 1, `${PASSES_SHOWN} named rows and one for the rest`, rows.length);
  line(rows.slice(0, PASSES_SHOWN).every((r, i) => r[0] === list[i].label), 'the rows in the list\'s order', rows.slice(0, 3).map((r) => r[0]).join(', '));
  line(rows[0][0] === 'solver step' && rows[0][1].startsWith('4.00 ms'), 'the 2 ms step at two steps a frame heads it at 4.00', rows[0].join(' '));
  const restMs = gpuPassTotal(list.slice(PASSES_SHOWN));
  line(rows[PASSES_SHOWN][0] === `${list.length - PASSES_SHOWN} more` && rows[PASSES_SHOWN][1].startsWith(restMs.toFixed(2)), 'the rest summed into one row', rows[PASSES_SHOWN].join(' '));
  line(/&amp;stages/.test(html), 'the solver as one whole pass: the readout says how to split it');
  const split = gpuPassTimes(drawing, [solver], 1);
  const splitHtml = renderToStaticMarkup(React.createElement(GpuPassReadout, { passes: split }));
  line(!/stages/.test(splitHtml), 'split into stages: no hint');
  const back = gpuPassTimes(drawing, [new Map([['squeeze', 1]]), new Map([['solver step', 2]])], 1);
  line(/&amp;stages/.test(renderToStaticMarkup(React.createElement(GpuPassReadout, { passes: back }))), 'a back layer drawn whole (L2 solver step) gets the hint too');
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
