#!/usr/bin/env node
/**
 * Does a hand pour on a sparse look stay on the plate, is the Dye Budget slider
 * live on a seeded look, and which looks did the grey-wash fix move?
 * (PLAN 28d-A, review of #401)
 *
 *   npm run handpour            all of it
 *   HANDPOUR_ONLY=a,b           just these looks
 *   HANDPOUR_SKIP_SERIES=1      the pours only, not the black share over time
 *
 * Four things, because the review asked four:
 *
 * 1. THE SLIDER, ON PAPER (node, no browser). `lookTarget` is what the regulator
 *    holds a seeded plate at. Before round 2 it was `min(dyeBudget, seedMean)`,
 *    flat from the look's own composition to the slider's top: a look laid
 *    thinner than its budget (Jellyfish Bloom lays 0.47 under the default 0.85)
 *    held 0.47 for every slider position from 0.47 up, and the review's 0.14
 *    and 0.85 were two slider positions, not its composition. It has to rise with the
 *    whole range, and be the old number at the look's own value for EVERY
 *    preset's budget and a spread of compositions, heavy ones included, so a
 *    preset left alone is the program it was. The "old" number is written out
 *    here from the PR's first round, not imported, so the check cannot agree
 *    with itself.
 *
 * 2. THE SLIDER, ON THE PLATE (the app). Jellyfish Bloom is opened with the
 *    slider at 0.85 and at 0.14 and left to settle; the low one has to hold
 *    less dye. Before round 2 the slider was dead above the look's own mass. Twice, in both orders, so a plate that drifts reads as drift.
 *
 * 3. THE HAND POUR (the app). On a look laid sparse (galaxy, aurora, a
 *    regulator that works at up to 12.5 x its normal rate on a seeded plate)
 *    dye a hand lays is, to the regulator, an excess to be dried at once. The
 *    fix banks what a hand laid (`FluidSimulation.bankHand`) and lets it raise
 *    the target for ten seconds. The harness pours the same way four times on
 *    one page, bank off, on, on, off (ABBA, so a plate that drifts over the
 *    run does not read as an effect), and reports the share of the pour still
 *    on the plate 1, 3 and 10 s later. A fifth pour is made with the mouse on
 *    the canvas, the way a hand does, to prove the bank is fed by the real
 *    path and not only by the debug gesture hook.
 *    "Off" is the same build with the bank and the surface term switched off
 *    on the plate itself, which is the program before the fix and nothing
 *    more: the treble sparkle's strength, the continuous pours' style and the
 *    slider's formula are not switched, so this measures the bank and the
 *    surface term and says nothing about those. Two page loads would be two
 *    different plates, which is why the switch is in the page.
 *
 * 4. WHICH LOOKS MOVED. Every preset is loaded and asked whether the fix
 *    reaches it (`sparseDarkLook`, the one flag the surface term, the sparkle
 *    and the bank key on), next to the answer worked out from the preset alone
 *    (`lampGround`, `dyeBudget`, and the seed the plate reports), so a column
 *    that disagrees is visible. The others are the program they were, by
 *    construction (`npm run lampzero` holds the plate shader to the same);
 *    this lists them so the PR body can say so. For the ones it reaches, the
 *    share of the frame that is black at 8, 20 and 40 s is printed with the
 *    fix off and on. That is a report, not a bar: two fresh plates of the
 *    same look drift apart by more than the fix moves them (see LOOKS_AB in
 *    `looks.mjs`).
 *
 * Needs a GPU that presents WebGPU: the app on software WebGPU returns zero
 * readbacks, and this says so and fails rather than reporting empty plates.
 *
 * Bars introduced here (new, none moved): the slider is live on the plate by a
 * 10% margin; a pour that the bank-off arm drains below 90% at 3 s is held
 * 5 points better with the bank on; the bank is within 0.2 to 5 x what the
 * pour raised the mean by.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { launchChromium, presentsInXvfb, port } from './chromium.mjs';
import { PRESETS } from '../src/presets.ts';
import { lookTarget } from '../src/lib/dyeTarget.ts';
import { engineQuery, installFrameReader, frameOf, waitForShow, settlePlate } from './frame.mjs';

const PORT = port(4346, 'HANDPOUR_PORT');
const ONLY = process.env.HANDPOUR_ONLY ? process.env.HANDPOUR_ONLY.split(',').map((s) => s.trim()).filter(Boolean) : null;
const SERIES = process.env.HANDPOUR_SKIP_SERIES !== '1';
const OUT = process.env.HANDPOUR_OUT ?? 'handpour.json';
const TIMES = [8, 20, 40];
const POUR_AT = [1, 3, 10];

const checks = [];
const check = (n, ok, d = '') => { checks.push({ ok: !!ok }); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };
const report = { slider: [], dial: [], looks: [], pours: [], series: [] };
const budgetOf = (id) => PRESETS.find((p) => p.id === id)?.settings.dyeBudget ?? 0.85;

/* 1. The slider, on paper ----------------------------------------------- */
{
  // The program the PR had after round 1, written out so the check does not
  // import the thing it is checking.
  const first = (seedMean, dyeBudget) =>
    seedMean > 0.85 && dyeBudget >= 0.85 ? seedMean : Math.min(dyeBudget, seedMean);
  let rises = true, same = true, live = true;
  const worst = [];
  const budgets = [...new Set(PRESETS.map((p) => p.settings.dyeBudget ?? 0.85))];
  for (const sb of budgets) {
    for (const sm of [0.05, 0.1, 0.14, 0.16, 0.3, 0.6, 0.85, 0.9, 1.1]) {
      // Left alone: at the look's own budget the number is the first round's.
      if (Math.abs(lookTarget(sm, sb, sb) - first(sm, sb)) > 1e-9) { same = false; worst.push(`seed ${sm} budget ${sb}: ${lookTarget(sm, sb, sb).toFixed(3)} vs ${first(sm, sb).toFixed(3)}`); }
      // Never falls as the slider rises, and is not flat when the laid picture
      // is thinner than the budget (the dead slider).
      let prev = -1;
      for (let b = 0.14; b <= 1.2001; b += 0.02) {
        const t = lookTarget(sm, b, sb);
        if (!(t >= prev - 1e-9)) rises = false;
        prev = t;
      }
      if (sm < sb && !(lookTarget(sm, 1.2, sb) > lookTarget(sm, 0.14, sb) * 1.5)) live = false;
    }
  }
  console.log(`     checked ${budgets.length} distinct preset budgets (${budgets.join(', ')}) x 9 compositions`);
  worst.slice(0, 5).forEach((w) => console.log(`     moved at its own value: ${w}`));
  check('the Dye Budget slider never lowers a seeded look\'s target as it rises', rises);
  check('and where the laid picture is thinner than the budget it is live across the whole range', live, 'top over 1.5 x bottom');
  check('and at the look\'s own budget the target is the one it was, for every preset budget and composition, heavy ones included', same, worst[0] ?? '');
  // The two the review named, with the budget the preset really has.
  for (const [name, seedMean] of [['jellyfish-bloom', 0.47], ['comet', 0.16]]) {
    const sb = budgetOf(name);
    const row = { name, seedMean, seedBudget: sb, before: [first(seedMean, 0.14), first(seedMean, 0.85)], after: [lookTarget(seedMean, 0.14, sb), lookTarget(seedMean, 0.85, sb)] };
    report.slider.push(row);
    console.log(`     ${name} (budget ${sb}, laid ${seedMean}): slider 0.14 / 0.85 held ${row.before.map((v) => v.toFixed(3)).join(' / ')} before, ${row.after.map((v) => v.toFixed(3)).join(' / ')} after`);
    check(`${name}: slider at 0.14 holds less than at 0.85`, row.after[0] < row.after[1] * 0.5, `${row.after[0].toFixed(3)} vs ${row.after[1].toFixed(3)}`);
  }
  check('a plate laid with nothing is held at the slider', lookTarget(null, 0.7) === 0.7 && lookTarget(0, 0.7) === 0.7);
}

/* The app -------------------------------------------------------------- */
const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise((r) => setTimeout(r, 2500));

// `present`: on a Linux box with PW_WEBGPU, headed into Xvfb so the plate reads back (chromium.mjs, PLAN.md 19l).
const browser = await launchChromium(chromium, { present: true });

/** A fresh page on one look, the show open; null (page closed) if it never opened. */
const open = async (id, dyeBudget) => {
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await installFrameReader(page);
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=${id}${engineQuery()}`, { waitUntil: 'load' });
  const waited = await waitForShow(page, presentsInXvfb() ? 300_000 : 60_000);
  if (waited === null) { await page.close(); return null; }
  if (dyeBudget !== undefined) await page.evaluate((v) => { window.chromaglassDebug().settings.dyeBudget = v; }, dyeBudget);
  return page;
};

const mean = (page) => page.evaluate(() => {
  const a = window.chromaglassDebug().fluids[0].readDensity;
  let t = 0; for (let i = 0; i < a.length; i++) t += a[i];
  return a.length ? t / a.length : NaN;
});

/**
 * The program before the fix on the plate itself: no bank, no surface term.
 * Switched on the instance so both programs run in one page; the frame loop
 * writes `sparseDarkLook` every frame, so it is overridden with an accessor.
 * Only those two: see the header for what "off" does not switch.
 */
const fix = (page, on) => page.evaluate((want) => {
  for (const f of window.chromaglassDebug().fluids) {
    if (!f) continue;
    if (want) {
      delete f.bankHand;
      delete f.sparseDarkLook;
      f.sparseDarkLook = false;
    } else {
      f.bankHand = () => {};
      f.handBank = 0;
      Object.defineProperty(f, 'sparseDarkLook', { configurable: true, get: () => false, set() {} });
    }
  }
}, on);

const state = (page) => page.evaluate(() => {
  const f = window.chromaglassDebug().fluids[0];
  return { sparse: !!f.sparseDarkLook, seedMean: f.seedMean, seedBudget: f.seedBudget, bank: f.handBank };
});

const black = async (page) => {
  const px = await frameOf(page, 160, 100);
  if (!px) return null;
  let dark = 0;
  for (let i = 0; i < px.length; i += 4) if (Math.max(px[i], px[i + 1], px[i + 2]) < 24) dark++;
  return dark / (px.length / 4);
};

/** The pour the debug hook makes: three spots, four gestures each, until the plate has taken `want`. */
const pourByHook = async (page, base) => {
  let rise = 0, n = 0;
  while (rise < 0.01 && n < 60) {
    await page.evaluate(() => {
      const d = window.chromaglassDebug();
      for (const at of [[0.3, 0.3], [0.7, 0.35], [0.5, 0.7]]) for (let k = 0; k < 4; k++) d.gesture({ tool: 'pour', x: at[0], y: at[1], layer: 0 });
    });
    n += 12;
    await settlePlate(page, 400);
    rise = (await mean(page)) - base;
  }
  return { rise, n };
};

/** The pour a hand makes: the mouse held down and dragged on the canvas (the default tool lays dye). */
const pourByMouse = async (page, base) => {
  const box = await page.evaluate(() => {
    const c = document.querySelector('#liquid-canvas') ?? document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  let rise = 0, n = 0;
  while (rise < 0.01 && n < 12) {
    await page.mouse.move(box.x + box.w * 0.35, box.y + box.h * 0.4);
    await page.mouse.down();
    for (let k = 0; k <= 20; k++) {
      await page.mouse.move(box.x + box.w * (0.35 + 0.01 * k), box.y + box.h * (0.4 + 0.005 * k));
      await page.waitForTimeout(40);
    }
    await page.mouse.up();
    n++;
    await settlePlate(page, 300);
    rise = (await mean(page)) - base;
  }
  return { rise, n };
};

/** One pour, then the share of it still on the plate at each of POUR_AT seconds. */
const pourRun = async (page, on, how) => {
  await fix(page, on);
  await settlePlate(page, 6000);
  const before = await state(page);
  const base = await mean(page);
  const { rise, n } = await (how === 'mouse' ? pourByMouse : pourByHook)(page, base);
  const bank = (await state(page)).bank;
  const left = {};
  let t = 0;
  for (const at of POUR_AT) {
    await settlePlate(page, (at - t) * 1000);
    t = at;
    left[at] = rise > 1e-4 ? ((await mean(page)) - base) / rise : NaN;
  }
  return { on, how, sparse: before.sparse, rise, n, bank, left };
};

try {
  /* 4a. Which looks the fix reaches ------------------------------------ */
  const ids = (ONLY ?? PRESETS.map((p) => p.id));
  const reached = [];
  for (const id of ids) {
    const page = await open(id);
    if (!page) { report.looks.push({ id, error: 'the show never opened' }); console.log(`     ${id}: the show never opened`); continue; }
    await settlePlate(page, 6000);
    const s = await state(page);
    const m = await mean(page);
    const preset = PRESETS.find((p) => p.id === id);
    // Worked out from the preset alone: no lamp behind the plate and a target
    // under 0.45 for the composition the plate reports.
    const expected = s.seedMean > 0 && ((preset?.settings.lampGround ?? 0) < 0.05) &&
      lookTarget(s.seedMean, preset?.settings.dyeBudget ?? 0.85, preset?.settings.dyeBudget ?? 0.85) < 0.45;
    const target = s.seedMean > 0 ? lookTarget(s.seedMean, preset?.settings.dyeBudget ?? 0.85, preset?.settings.dyeBudget ?? 0.85) : null;
    report.looks.push({ id, ...s, mean: m, expected, target });
    if (s.sparse && s.seedMean > 0) reached.push(id);
    console.log(`     ${id.padEnd(24)} ${s.sparse ? 'REACHED  ' : 'unchanged'} (expected ${expected ? 'reached  ' : 'unchanged'}) seedMean ${s.seedMean === null ? '-' : s.seedMean.toFixed(3)} mean ${Number.isFinite(m) ? m.toFixed(3) : 'NaN'}`);
    await page.close();
  }
  const readable = report.looks.filter((l) => Number.isFinite(l.mean) && l.mean > 0).length;
  check('the plates can be read at all (not the zero readbacks of software WebGPU)', readable >= Math.ceil(ids.length * 0.8), `${readable} of ${ids.length} looks gave a mean above zero`);
  const disagree = report.looks.filter((l) => l.expected !== undefined && l.expected !== (l.sparse && l.seedMean > 0));
  check('the plate\'s own answer matches the one worked out from the preset', disagree.length === 0, disagree.map((l) => l.id).join(', ') || `${report.looks.length} looks agree`);
  console.log(`     the fix reaches ${reached.length} of ${ids.length}: ${reached.join(', ') || 'none'}`);
  check('it reaches at least one look', reached.length >= 1, 'without one, nothing below measures the fix');
  // Jellyfish Bloom sits ON the 0.45 cliff. The mass it lays is not the same
  // on every load (0.470 on one Mac run, 0.395 on the next, the same commit's
  // source), and its target at the default slider is that mass, so one load is
  // sparse and the next is not. This first said "not reached" because the run
  // it was written from happened to lay 0.47. What can be asserted is the
  // fact that makes it unassertable: its target is within a quarter of the cliff.
  // Looks like that are left out of the pour A/B below (whether the bank is on
  // would change between its own pages), and Jellyfish's slider test (part 2)
  // holds either way, because the slider is proportional below the cliff too.
  const NEAR_CLIFF = [0.45 * 0.75, 0.45 * 1.25];
  const nearCliff = (l) => l.target !== null && l.target >= NEAR_CLIFF[0] && l.target <= NEAR_CLIFF[1];
  const steady = reached.filter((id) => !nearCliff(report.looks.find((l) => l.id === id)));
  if (!ONLY) {
    const jf = report.looks.find((l) => l.id === 'jellyfish-bloom');
    check('Jellyfish Bloom\'s target at its default is within a quarter of the 0.45 cliff, so whether it is sparse is not asserted',
      jf && nearCliff(jf), `target ${jf?.target?.toFixed(3)}, ${reached.includes('jellyfish-bloom') ? 'sparse' : 'not sparse'} on this load`);
    check('it reaches at least three looks away from the cliff, so the pour A/B is not one look\'s luck', steady.length >= 3, `${steady.length} steady of ${reached.length} reached: ${steady.join(', ')}`);
    const seed = jf?.seedMean;
    check('Jellyfish Bloom lays a mass under its 0.85 budget, where the slider is proportional', seed > 0 && seed < 0.85, `seedMean ${seed?.toFixed(3)}`);
  }

  /* 2. The slider on the plate ----------------------------------------- */
  {
    const settle = async (b) => {
      const page = await open('jellyfish-bloom', b);
      if (!page) return NaN;
      await settlePlate(page, 25000);
      const m = await mean(page);
      await page.close();
      return m;
    };
    const rows = [];
    for (const order of [[0.85, 0.14], [0.14, 0.85]]) {
      const got = {};
      for (const b of order) got[b] = await settle(b);
      rows.push(got);
    }
    report.dial = rows;
    for (const r of rows) console.log(`     Jellyfish Bloom after 25 s: slider 0.85 holds ${r[0.85].toFixed(3)}, slider 0.14 holds ${r[0.14].toFixed(3)}`);
    check('Jellyfish Bloom: the slider at 0.14 leaves less dye on the plate than at 0.85, in both orders',
      rows.every((r) => r[0.14] < r[0.85] * 0.9), rows.map((r) => `${r[0.14].toFixed(3)} < ${r[0.85].toFixed(3)} x 0.9`).join('; '));
  }

  /* 3. Hand pours, ABBA on one page ------------------------------------- */
  const pourLooks = steady.slice(0, Math.max(3, Math.min(steady.length, 4)));
  for (const id of pourLooks) {
    const page = await open(id);
    if (!page) { check(`${id}: the show opened for the pour`, false); continue; }
    await settlePlate(page, 10000);
    const runs = [];
    for (const on of [false, true, true, false]) runs.push(await pourRun(page, on, 'hook'));
    const byMouse = await pourRun(page, true, 'mouse');
    const avg = (on, at) => {
      const v = runs.filter((r) => r.on === on).map((r) => r.left[at]);
      return v.reduce((a, b) => a + b, 0) / v.length;
    };
    const row = { id, runs, byMouse, off: Object.fromEntries(POUR_AT.map((a) => [a, avg(false, a)])), on: Object.fromEntries(POUR_AT.map((a) => [a, avg(true, a)])) };
    report.pours.push(row);
    const pct = (o) => POUR_AT.map((a) => (o[a] * 100).toFixed(0) + '%').join(' / ');
    console.log(`     ${id}: share of a hand pour left at ${POUR_AT.join(' / ')} s — before ${pct(row.off)}, after ${pct(row.on)}, by mouse ${pct(byMouse.left)}`);
    console.log(`     ${id}: pour sizes (mean raised) ${runs.map((r) => `${r.on ? 'on' : 'off'} ${r.rise.toFixed(3)}`).join(', ')}, mouse ${byMouse.rise.toFixed(3)}`);
    check(`${id}: the pour registered in all five runs`, [...runs, byMouse].every((r) => r.rise >= 0.01), [...runs, byMouse].map((r) => r.rise.toFixed(3)).join(' '));
    check(`${id}: the switch is real (plate sparse and bank holding the pour with the fix on; neither with it off)`,
      runs.filter((r) => !r.on).every((r) => r.bank === 0 && !r.sparse) && runs.filter((r) => r.on).every((r) => r.bank > 0 && r.sparse),
      runs.map((r) => `${r.on ? 'on' : 'off'} sparse ${r.sparse} bank ${r.bank.toFixed(3)}`).join(', '));
    check(`${id}: the bank is the size of what the pour raised the mean by (0.2 to 5 x)`,
      runs.filter((r) => r.on).every((r) => r.bank > 0.2 * r.rise && r.bank < 5 * r.rise),
      runs.filter((r) => r.on).map((r) => `bank ${r.bank.toFixed(3)} vs rise ${r.rise.toFixed(3)}`).join(', '));
    check(`${id}: a pour made with the mouse is banked too (the real path, not only the hook)`, byMouse.bank > 0 && byMouse.sparse, `bank ${byMouse.bank.toFixed(3)}`);
    // The share of a pour left is read off the dish mean, which a moving look
    // (cell-bloom's cells drift) moves by itself: on the Mac run for d514a6f the
    // two bank-off runs of cell-bloom read 101% and 69% at 10 s, the same look
    // and the same pour 32 points apart, so a two-run mean cannot resolve 2
    // points there and the 6 points it did show (85% off, 79% on) are inside
    // that spread. The margin is therefore the larger of 2 points and the gap
    // between the two FIX-OFF runs at that time, which is the noise this look has
    // at this moment measured on the same page. It is taken from the off arm
    // only: with the fix on, the plate also runs the new `surf` drain, which the
    // off arm never runs, so a margin widened by the on arm's own spread would
    // let the arm under test set its own tolerance (a look off at 96% / 95% and
    // on at 40% / 80% would pass). The off arm is the control for noise, and the
    // cell-bloom 101% / 69% above is in it. Where the bank matters the gap is far
    // larger than that (lumia 3 s: 30% off, 101% on; roy 18% vs 101%), and the
    // 5-point check below still has to hold there.
    const spread = (a) => Math.max(0.02, ...[false].map((on) => {
      const v = runs.filter((r) => r.on === on).map((r) => r.left[a]);
      return Math.max(...v) - Math.min(...v);
    }));
    check(`${id}: with the bank a hand pour is not drained faster than without (beyond the run-to-run spread)`,
      POUR_AT.every((a) => row.on[a] >= row.off[a] - spread(a)),
      `before ${pct(row.off)} vs after ${pct(row.on)}, spread ${POUR_AT.map((a) => (spread(a) * 100).toFixed(0) + '%').join(' / ')}`);
    // If the bank-off arm does drain the pour, the bank has to have held more
    // of it: otherwise this would pass for a bank that does nothing.
    row.drained = row.off[3] < 0.9;
    if (row.drained) check(`${id}: the pour the old program drained is held better with the bank in every run (3 s, 5 points)`, Math.min(...runs.filter((r) => r.on).map((r) => r.left[3])) > row.off[3] + 0.05, `worst bank-on run ${(Math.min(...runs.filter((r) => r.on).map((r) => r.left[3])) * 100).toFixed(0)}% vs ${(row.off[3] * 100).toFixed(0)}% off`);
    else console.log(`     ${id}: the old program did not drain this pour (${(row.off[3] * 100).toFixed(0)}% left at 3 s); nothing for the bank to hold`);
    await page.close();
  }
  if (!ONLY) check('three sparse looks were poured on', report.pours.length >= 3, `${report.pours.length}`);
  if (steady.length) {
    const drained = report.pours.filter((r) => r.drained).length;
    check('the drain the review described shows up without the bank on at least one look', drained >= 1,
      `${drained} of ${report.pours.length} looks lost over 10% of a hand pour in 3 s with the bank off`);
  } else check('a look was reached to pour on', false, ONLY ? `none of ${ONLY.join(', ')} is a sparse seeded look` : 'none');

  /* 4b. Black share over time, the looks it reaches ---------------------- */
  if (SERIES) {
    let frames = 0, unread = 0;
    for (const id of reached) {
      const row = { id, off: {}, on: {} };
      for (const on of [false, true]) {
        const page = await open(id);
        if (!page) continue;
        await fix(page, on);
        let t = 0;
        for (const at of TIMES) {
          await settlePlate(page, (at - t) * 1000);
          t = at;
          const v = await black(page);
          frames++;
          if (v === null) unread++;
          row[on ? 'on' : 'off'][at] = v;
        }
        await page.close();
      }
      report.series.push(row);
      const fmt = (o) => TIMES.map((a) => (o[a] === null || o[a] === undefined ? '?' : (o[a] * 100).toFixed(0) + '%')).join(' / ');
      console.log(`     ${id.padEnd(24)} black at ${TIMES.join(' / ')} s — before ${fmt(row.off)}, after ${fmt(row.on)}`);
    }
    check('the frames of the black-share series could be read', frames > 0 && unread <= frames * 0.2, `${frames - unread} of ${frames} read`);
  }
} finally {
  fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
  await browser.close();
  stop();
}
process.exit(checks.some((c) => !c.ok) ? 1 : 0);
