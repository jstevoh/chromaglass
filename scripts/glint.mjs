#!/usr/bin/env node
/**
 * Glitter, the lens and the side lamp (PLAN 47e, 47d, 47b-side): `npm run glint`.
 *
 * What was asked (2026-11-13, after the artist's Microlab films were watched
 * frame by frame): specks floating in the liquid, out-of-focus ones as big
 * discs, star-shaped glints on the brightest, and a red or amber light
 * raking in from one side over the blue glow. The laws are in lib/glint.ts
 * and the shaders compute them per speck and per pixel (gpu/wgsl/glint.ts).
 * This holds the feature, not a moment of the plate:
 *
 *   A. The laws, in numbers (node). Poiseuille's profile has a mean of 1 and
 *      stops at both glasses. The Jeffery orbit integrated step by step from
 *      its own equation lands where the closed form tan θ = r tan ξ says, a
 *      thin flake lies within 20° of flat for most of its turn, and it turns
 *      round to itself once per 2π (r + 1/r) of strain. A glitter flake settles at a few
 *      hundredths of a millimetre a second. The defocus disc grows with the
 *      distance from the focal plane and shrinks as the lens stops down, and
 *      is nothing in focus; the Airy core grows with the stop, so the spikes
 *      reach further stopped down and from a brighter point. The side lamp's
 *      light falls off across the stage away from it by the inverse square,
 *      and a flat flake shows a few hundredths of it while one tilted to the half-way
 *      normal does.
 *
 *   B. Off is off (the lab, the real shaders). The plate with Glitter and
 *      Side Light at 0 is, to the byte, the plate with the lens's other dials
 *      moved too (Lens Stop, the side lamp's colour and place): at 0 and 0
 *      the pass does not run, so they cannot reach a pixel. Control: the same
 *      plate with Side Light at 0.05 is not the same bytes.
 *
 *   C. The side lamp on black (a fluorescent glow): where there is no dye the
 *      ground stays black within 2 levels; the dye gains the lamp's colour
 *      (red gains more than blue under an amber lamp); and the half of a
 *      centred disc toward the lamp gains more than the half away from it,
 *      both ways round (the lamp moved to the other side swaps them). A tint
 *      laid on everywhere, or one that is not the lamp's, fails.
 *
 *   D. Glitter is a population: on the lamp, up close (where every flake is
 *      a dark speck, its shadow) the darkened pixels at Glitter 1 are about twice those
 *      at 0.5 (1.6 to 2.4), and none at 0.
 *
 *   E. The lens: up close with the side lamp, against the same lamp without
 *      glitter, the glints' light
 *      covers several times more pixels wide open (f/1.4, defocus discs)
 *      than at f/5.6; and stopped down (f/16) the brightest glint is a
 *      six-pointed star, its light along the spikes' six directions at 6 to
 *      20 px out at least three times that along the six directions between
 *      them, where wide open the spikes are gone (under a fifth of that
 *      light). All at 8x and 1024 px: a flake's spikes and disc are in screen
 *      pixels, so a small picture or a far lens shows neither. Projector
 *      Focus on the floor glass spreads the glints at f/5.6 further than
 *      focused mid-gap.
 *
 *   F. The pass and the flakes over frames. With the pass on and no
 *      flakes, the picture is the plate's own within 2 levels, drawn to
 *      the canvas and to a texture (an upside-down picture fails it). On one
 *      plate over eight frames pushed to +x, the flakes (read back from the
 *      GPU) do not move while the solver stands, travel with the push,
 *      mid-gap ones further than those by the glass in the ratio of
 *      6z(1−z), and their travel over 6z(1−z) is the dye's own.
 */
import { openLab } from './lab.mjs';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? ' ok ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

// ── A. The laws ────────────────────────────────────────────────────
const lawsOut = 'node_modules/.cache/glint-laws.mjs';
await build({ entryPoints: ['src/lib/glint.ts'], bundle: true, format: 'esm', platform: 'node', outfile: lawsOut, logLevel: 'warning' });
const L = await import(pathToFileURL(`${process.cwd()}/${lawsOut}`).href);

{
  let mean = 0; const n = 1000;
  for (let i = 0; i < n; i++) mean += L.gapSpeed((i + 0.5) / n) / n;
  check("Poiseuille's profile across the gap has a mean of 1 and stops at both glasses", Math.abs(mean - 1) < 0.01 && L.gapSpeed(0) === 0 && L.gapSpeed(1) === 0, `mean ${mean.toFixed(4)}`);
}
{
  // dθ/dt = γ̇/(r²+1) (r² cos²θ + sin²θ), stepped in small strains, against tan θ = r tan ξ.
  const r = 0.06; let theta = 0; let strain = 0; let worst = 0; let flat = 0; const steps = 200000;
  const turn = L.jefferyTurnStrain(r);
  const ds = turn / steps;
  for (let i = 0; i < steps; i++) {
    const k = (s) => (r * r * Math.cos(s) ** 2 + Math.sin(s) ** 2) / (r * r + 1);
    const mid = theta + 0.5 * ds * k(theta);
    theta += ds * k(mid);
    strain += ds;
    const closed = L.jefferyTilt(L.jefferyPhase(strain, r), r);
    // Compare as directions of a line (θ and θ ± π are one flake).
    const d = Math.abs(Math.atan(Math.tan(theta - closed)));
    worst = Math.max(worst, d);
    if (Math.abs(Math.atan(Math.tan(theta))) < (20 * Math.PI) / 180) flat++;
  }
  check('the Jeffery orbit stepped from its equation follows tan θ = r tan ξ', worst < 0.01, `worst ${(worst * 180 / Math.PI).toFixed(3)}°`);
  check('a thin flake lies within 20° of flat for most of its turn', flat / steps > 0.7, `${(100 * flat / steps).toFixed(0)}% of the turn`);
  check('and comes round to itself (2π) in 2π (r + 1/r) of strain, flipping twice', Math.abs(theta - 2 * Math.PI) < 0.02, `θ after a turn's strain ${(theta).toFixed(3)} rad`);
}
{
  const v = L.settlingSpeed(30e-6, 0.06) * 1000;
  check('a glitter flake settles at a few hundredths of a millimetre a second (Stokes)', v > 0.005 && v < 0.08, `${v.toFixed(4)} mm/s, ${(2 / v).toFixed(0)} s to cross the gap`);
}
{
  const d1 = L.defocusRadiusPx(0.9, 0.5, 2.8, 6, 1920), d2 = L.defocusRadiusPx(0.7, 0.5, 2.8, 6, 1920);
  const d3 = L.defocusRadiusPx(0.9, 0.5, 11, 6, 1920), d0 = L.defocusRadiusPx(0.5, 0.5, 2.8, 6, 1920);
  check('the defocus disc grows with the distance from the focal plane, shrinks stopped down, and is nothing in focus',
    Math.abs(d1 / d2 - 2) < 1e-6 && Math.abs(d1 / d3 - 11 / 2.8) < 1e-6 && d0 === 0, `${d1.toFixed(1)} px at 0.4 of the gap, ${d2.toFixed(1)} at 0.2, ${d3.toFixed(1)} at f/11`);
  const a28 = L.airyRadiusPx(540e-9, 2.8, 6, 1920), a11 = L.airyRadiusPx(540e-9, 11, 6, 1920);
  const s28 = L.spikeReachPx(500, a28, a28), s11 = L.spikeReachPx(500, a11, a11), dim = L.spikeReachPx(5, a11, a11);
  check('the Airy core grows with the stop, so the spikes reach further stopped down and from a brighter point',
    a11 > a28 && s11 > s28 && s11 > dim, `airy ${a28.toFixed(2)} → ${a11.toFixed(2)} px; reach ${s28.toFixed(0)} → ${s11.toFixed(0)} px, a point a hundredth as bright ${dim.toFixed(0)} px`);
}
{
  const toward = L.sideFalloff(-0.05, 0, 180), away = L.sideFalloff(0.05, 0, 180);
  const [, , d, h] = L.sideLampPlace(180);
  const want = (((d + 0.05) ** 2 + h * h) / ((d - 0.05) ** 2 + h * h)) ** 1.5;
  check("the side lamp's light falls off across the stage by the inverse square and the slant", toward > 1 && away < 1 && Math.abs(toward / away - want) < 1e-6, `toward ${toward.toFixed(2)}, away ${away.toFixed(2)}`);
  const l = L.sideRayInWater(180);
  const half = [l[0], l[1], l[2] + 1]; const m = Math.hypot(...half);
  const tilted = L.flakeMirror(half.map((x) => x / m), l, L.SIDE_LAMP_RADIUS);
  const flat = L.flakeMirror([0, 0, 1], l, L.SIDE_LAMP_RADIUS);
  // A flat flake's mirror points the lamp's ray away from the lens; only its crinkle (FLAKE_CRINKLE, a facet spread of 0.15 rad)
  // sends any back, a few hundredths of what a flake tilted to the half-way normal sends.
  check('a flat flake shows a few hundredths of the side lamp (its crinkle); one tilted to the half-way normal shows it', flat < 0.1 * tilted && tilted > 0.01, `flat ${flat.toExponential(1)}, tilted ${tilted.toFixed(3)}`);
  check('with Glitter and Side Light at 0 the lens pass is not wanted', !L.glintWanted(0, 0) && L.glintWanted(0.1, 0) && L.glintWanted(0, 0.1));
}

// ── B to E: the real shaders, in the lab ──────────────────────────
const { page, close } = await openLab();
try {
  const out = await page.evaluate(async (irisTurn) => {
    await lab.create(256);
    // One centred disc of a blue-glowing dye: symmetric, so the side lamp's falloff shows as a difference of halves.
    lab.dye(0.5, 0.5, 0.14, [1.4, 0.5, 0.08], 1.3);
    lab.flush(); await lab.step(4);
    const S = 256;
    const r = (set, cam = { zoom: 1 }) => lab.render(S, set, cam);
    const off = await r({});
    const offMoved = await r({ glitter: 0, sideLight: 0, lensStop: 11, sideLightHue: 300, sideLightAngle: 20 });
    const faint = await r({ sideLight: 0.05 });
    const left = await r({ sideLight: 0.6, sideLightHue: 30, sideLightAngle: 180 });
    const right = await r({ sideLight: 0.6, sideLightHue: 30, sideLightAngle: 0 });
    // Above and below: the plate is drawn flipped into the pass's picture and turned back by it, which only a lamp off the x axis shows.
    const above = await r({ sideLight: 0.6, sideLightHue: 30, sideLightAngle: 90 });
    const below = await r({ sideLight: 0.6, sideLightHue: 30, sideLightAngle: 270 });
    // A blue lamp: the hue is the lamp's, not a fixed amber.
    const blue = await r({ sideLight: 0.6, sideLightHue: 220, sideLightAngle: 180 });
    // Up close (4x), where a flake's shadow is a few pixels: at 1x on this small picture it is a fraction of one.
    const near = { zoom: 4, cx: 0.5, cy: 0.5, macroAmount: 1 };
    const lampHalf = await r({ lampGround: 1, glitter: 0.5, lightPlay: 0 }, near);
    const lampFull = await r({ lampGround: 1, glitter: 1, lightPlay: 0 }, near);
    const lampNone = await r({ lampGround: 1, lightPlay: 0 }, near);
    // The lens pass on with no flakes (Side Light just past its threshold, a hundredth of a level): no specks, and its finish the display's own.
    const lampPass = await r({ lampGround: 1, lightPlay: 0, sideLight: 0.0011 }, near);
    // A picture the size of a screen's short side: a flake's energy on screen, and so how far its spikes show, goes with the pixels it covers.
    // Measured here in the page: four of them would not come back to node as numbers.
    const C = 1024;
    // At 8x (a magnification of about 2): at 4x on this plate most flakes sit within a pixel or two of focus at any stop.
    const close = { zoom: 8, cx: 0.5, cy: 0.5, macroAmount: 1 };
    // The same lamp without the glitter: what the glints add is the difference.
    const base = await lab.render(C, { glitter: 0, sideLight: 1, lightPlay: 0 }, close);
    const added = async (stop, more = {}, against = base) => {
      const img = await lab.render(C, { glitter: 1, sideLight: 1, lensStop: stop, lightPlay: 0, ...more }, close);
      const d = new Float32Array(C * C);
      for (let i = 0; i < C * C; i++) d[i] = img[i * 4] + img[i * 4 + 1] + img[i * 4 + 2] - against[i * 4] - against[i * 4 + 1] - against[i * 4 + 2];
      return d;
    };
    // Any pixel a glint adds two levels to: a defocus disc spreads a flake's light thin (its brightness falls as its area grows),
    // so a bright threshold counts the in-focus cores and misses the discs, the very thing being measured.
    const lit = (d) => { let n = 0; for (let i = 0; i < d.length; i++) if (d[i] > 6) n++; return n; };
    const star = (d) => {
      // The brightest glint: the pixel with the most added light in its 5×5.
      const add = (x, y) => (x < 0 || y < 0 || x >= C || y >= C) ? 0 : d[y * C + x];
      let best = -1, bx = 0, by = 0;
      for (let y = 24; y < C - 24; y++) for (let x = 24; x < C - 24; x++) {
        let s = 0; for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) s += add(x + i, y + j);
        if (s > best) { best = s; bx = x; by = y; }
      }
      // Along the spikes (IRIS_TURN + 30° + k 60°, uv's y up, the image's y down) and between them, 6 to 20 px out.
      let along = 0, between = 0;
      for (let k = 0; k < 6; k++) for (let rr = 6; rr <= 20; rr++) {
        const a = irisTurn + Math.PI / 6 + k * Math.PI / 3;
        const b = a + Math.PI / 6;
        along += Math.max(0, add(Math.round(bx + Math.cos(a) * rr), Math.round(by - Math.sin(a) * rr)));
        between += Math.max(0, add(Math.round(bx + Math.cos(b) * rr), Math.round(by - Math.sin(b) * rr)));
      }
      return { along, between, best };
    };
    const wide = await added(1.4);
    const lens = { wide: lit(wide), starWide: star(wide) };
    const mid = await added(5.6);
    lens.stopped = lit(mid);
    const tight = await added(16);
    lens.starry = star(tight);
    // The focal plane on the floor glass rather than mid-gap: the flakes are twice as far from it on the whole, so their discs grow.
    const low = { projectorFocus: 0.02 };
    const baseLow = await lab.render(C, { glitter: 0, sideLight: 1, lightPlay: 0, ...low }, close);
    lens.focusMid = lens.stopped;
    lens.focusLow = lit(await added(5.6, low, baseLow));
    return { S, off, offMoved, faint, left, right, above, below, blue, lampHalf, lampFull, lampNone, lampPass, lens };
  }, L.IRIS_TURN);
  const { S } = out;
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  check('B. off is off: at Glitter and Side Light 0 the lens\'s other dials reach no pixel', same(out.off, out.offMoved));
  check('   control: Side Light at 0.05 is not the same bytes', !same(out.off, out.faint));

  // C. The side lamp on black.
  const at = (px, x, y, c) => px[(y * S + x) * 4 + c];
  let groundWorst = 0; const gain = { l: [0, 0, 0], r: [0, 0, 0], ll: [0, 0, 0], rr: [0, 0, 0] }; let nl = 0, nr = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const lum = (at(out.off, x, y, 0) + at(out.off, x, y, 1) + at(out.off, x, y, 2)) / 3;
    const dx = (x + 0.5) / S - 0.5, dy = (y + 0.5) / S - 0.5;
    const rad = Math.hypot(dx, dy);
    if (rad > 0.45 && lum < 3) for (const img of [out.left, out.right]) for (let c = 0; c < 3; c++) groundWorst = Math.max(groundWorst, at(img, x, y, c) - at(out.off, x, y, c));
    if (lum > 60 && Math.abs(dx) > 0.03) {
      const side = dx < 0 ? 'l' : 'r';
      for (let c = 0; c < 3; c++) {
        gain[side][c] += at(out.left, x, y, c) - at(out.off, x, y, c);
        gain[side + side][c] += at(out.right, x, y, c) - at(out.off, x, y, c);
      }
      if (side === 'l') nl++; else nr++;
    }
  }
  for (const k of ['l', 'll']) gain[k] = gain[k].map((v) => v / Math.max(1, nl));
  for (const k of ['r', 'rr']) gain[k] = gain[k].map((v) => v / Math.max(1, nr));
  const f = (g) => g.map((v) => v.toFixed(1)).join('/');
  check('C. where there is no dye the ground stays black under the side lamp', groundWorst <= 2, `worst rise ${groundWorst} levels`);
  check('   the dye gains the amber lamp\'s colour: red more than blue', gain.l[0] > 2 && gain.l[0] > gain.l[2] * 1.5, `toward the lamp r/g/b +${f(gain.l)}`);
  check('   the half toward the lamp gains more than the half away (lamp on the left)', gain.l[0] > gain.r[0] * 1.15, `left +${gain.l[0].toFixed(1)}, right +${gain.r[0].toFixed(1)} red`);
  check('   and the other way round with the lamp on the right', gain.rr[0] > gain.ll[0] * 1.15, `right +${gain.rr[0].toFixed(1)}, left +${gain.ll[0].toFixed(1)} red`);
  // Above and below (the image's rows run down, the stage's y up): a picture the pass turned upside down swaps these.
  const halves = (img) => {
    let top = 0, bot = 0, nt = 0, nb = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const lum = (at(out.off, x, y, 0) + at(out.off, x, y, 1) + at(out.off, x, y, 2)) / 3;
      const dy = (y + 0.5) / S - 0.5;
      if (lum > 60 && Math.abs(dy) > 0.03) { const g = at(img, x, y, 0) - at(out.off, x, y, 0); if (dy < 0) { top += g; nt++; } else { bot += g; nb++; } }
    }
    return [top / Math.max(1, nt), bot / Math.max(1, nb)];
  };
  const [aboveTop, aboveBot] = halves(out.above), [belowTop, belowBot] = halves(out.below);
  check('   the lamp above lights the top half more, and below the bottom half', aboveTop > aboveBot * 1.15 && belowBot > belowTop * 1.15,
    `above: top +${aboveTop.toFixed(1)}, bottom +${aboveBot.toFixed(1)}; below: top +${belowTop.toFixed(1)}, bottom +${belowBot.toFixed(1)} red`);
  let blueGain = [0, 0, 0], nBlue = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const lum = (at(out.off, x, y, 0) + at(out.off, x, y, 1) + at(out.off, x, y, 2)) / 3;
    if (lum > 60 && (x + 0.5) / S < 0.47) { for (let c = 0; c < 3; c++) blueGain[c] += at(out.blue, x, y, c) - at(out.off, x, y, c); nBlue++; }
  }
  blueGain = blueGain.map((v) => v / Math.max(1, nBlue));
  check('   Side Colour turned to blue: the dye gains blue more than red', blueGain[2] > 2 && blueGain[2] > blueGain[0] * 1.5, `r/g/b +${f(blueGain)}`);

  // D. Glitter as a population of dark specks on the lamp.
  const specks = (img) => {
    let n = 0;
    for (let i = 0; i < S * S; i++) {
      const d = (out.lampNone[i * 4] + out.lampNone[i * 4 + 1] + out.lampNone[i * 4 + 2]) - (img[i * 4] + img[i * 4 + 1] + img[i * 4 + 2]);
      if (d > 6) n++;
    }
    return n;
  };
  // "None at 0" against the lens pass running with no flakes, not the plate against itself.
  const half = specks(out.lampHalf), full = specks(out.lampFull), none = specks(out.lampPass);
  check('D. on the lamp, the dark specks at Glitter 1 are about twice those at 0.5, and none at 0', none === 0 && half > 20 && full / half > 1.6 && full / half < 2.4, `${none}, ${half}, ${full} darkened pixels`);

  // E. The lens.
  const { wide: lw, stopped: ls, starry: ss, starWide: sw } = out.lens;
  check('E. wide open (f/1.4) the glints cover several times more pixels than at f/5.6 (defocus discs)', lw > 3 * ls && ls > 0, `${lw} against ${ls} lit pixels`);
  check('   stopped down (f/16) the brightest glint is a six-pointed star: its spikes carry three times the light between them', ss.along > 3 * Math.max(1, ss.between) && ss.along > 200, `along ${ss.along}, between ${ss.between}`);
  // Wide open the spikes go: the Airy core they grow from shrinks with the stop, and they fade as the flake leaves focus.
  check('   wide open the spikes are gone: under a fifth of the light along them stopped down', sw.along < 0.2 * ss.along, `along ${sw.along} against ${ss.along}`);
  // The shader's own |z − focus|: with the focal plane on the floor glass the flakes average twice the distance from it.
  check('   Projector Focus moves the sharp plane: focused on the floor glass, the glints at f/5.6 spread wider than focused mid-gap', out.lens.focusLow > 1.5 * out.lens.focusMid,
    `${out.lens.focusLow} against ${out.lens.focusMid} lit pixels`);

  // F. The pass's picture the right way up, and the flakes riding the flow (the step shader, on one plate over frames).
  const ride = await page.evaluate(async (count) => {
    await lab.create(256);
    // Off centre, so a picture turned upside down by the pass reads as a different picture.
    lab.dye(0.5, 0.72, 0.1, [1.4, 0.5, 0.08], 1.3);
    lab.flush(); await lab.step(4);
    // The worst channel's difference, and the share of channels within a level.
    const diff = (a, b) => {
      let m = 0, near = 0, n = 0;
      for (let i = 0; i < a.length; i++) if ((i & 3) !== 3) { const d = Math.abs(a[i] - b[i]); m = Math.max(m, d); if (d <= 1) near++; n++; }
      return { worst: m, near: near / n };
    };
    const pass = { sideLight: 0.0011 };
    const up = diff(await lab.render(256, {}, { zoom: 1 }), await lab.render(256, pass, { zoom: 1 }));
    const flipped = diff(await lab.render(256, {}, { zoom: 1, flip: true }), await lab.render(256, pass, { zoom: 1, flip: true }));

    await lab.create(256);
    lab.dye(0.5, 0.5, 0.05, [1.4, 0.5, 0.08], 1.3);
    lab.flush(); await lab.step(1);
    const kept = { zoom: 1, keepPlate: true };
    const set = { glitter: 1 };
    await lab.render(64, set, kept);
    const born = await lab.glintSpecks(count);
    // Frames with no step: the solver's clock stands, so nothing is carried.
    await lab.render(64, set, kept); await lab.render(64, set, kept);
    const still = await lab.glintSpecks(count);
    const centroid = async () => {
      const d = await lab.field('dye'); const L = Math.round(Math.sqrt(d.length / 4));
      let t = 0, mx = 0, my = 0;
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) { const v = d[(i + j * L) * 4 + 3]; t += v; mx += v * (i + 0.5) / L; my += v * (j + 0.5) / L; }
      return [mx / t, my / t];
    };
    const c0 = await centroid();
    // A push to +x over the middle, one solver step a frame as the app's frames mostly are.
    for (let k = 0; k < 8; k++) { lab.vel(0.5, 0.5, 0.3, [1.5, 0, 0, 0]); lab.flush(); await lab.step(1); await lab.render(64, set, kept); }
    const moved = await lab.glintSpecks(count);
    const c1 = await centroid();
    let stillWorst = 0;
    const mid = { dx: 0, dy: 0, k: 0, n: 0 }, glass = { dx: 0, k: 0, n: 0 }; let perK = 0, nK = 0;
    for (let i = 0; i < count; i++) {
      const o = i * 12;
      // Not a flake that came to the end of its life in those frames and was born again elsewhere.
      if (still[o + 10] === born[o + 10]) stillWorst = Math.max(stillWorst, Math.abs(still[o] - born[o]), Math.abs(still[o + 1] - born[o + 1]));
      const z = born[o + 2];
      if (born[o + 11] < 0.5 || z <= 0.03 || moved[o + 10] !== born[o + 10]) continue;
      if (Math.hypot(born[o] - c0[0], born[o + 1] - c0[1]) > 0.06) continue;
      const k = 6 * z * (1 - z), dx = moved[o] - born[o], dy = moved[o + 1] - born[o + 1];
      perK += dx / k; nK++;
      if (k > 1.3) { mid.dx += dx; mid.dy += dy; mid.k += k; mid.n++; }
      if (k < 0.6) { glass.dx += dx; glass.k += k; glass.n++; }
    }
    return { up, flipped, stillWorst, mid, glass, perK: perK / Math.max(1, nK), nK, dye: c1[0] - c0[0], dyeY: c1[1] - c0[1] };
  }, L.speckCount(1));
  // Side Light just past its threshold still adds a thousandth of the lamp, which the display curve's slope at dark values
  // (about 25 of 255) turns into 2 levels at a handful of pixels (7 of 196,608 channels measured); a picture the pass left
  // upside down differs by tens of levels over the whole off-centre disc.
  const fine = (d) => d.worst <= 3 && d.near > 0.999;
  check('F. the pass turns the plate\'s picture back the right way up: with it on and no flakes, the plate\'s own (99.9 % within a level)', fine(ride.up) && fine(ride.flipped),
    `to the canvas worst ${ride.up.worst}, ${(100 * ride.up.near).toFixed(2)} % within 1; to a texture worst ${ride.flipped.worst}, ${(100 * ride.flipped.near).toFixed(2)} %`);
  check('   frames with the solver standing carry no flake', ride.stillWorst < 1e-6, `worst ${ride.stillWorst.toExponential(1)}`);
  const m = ride.mid, g = ride.glass;
  const midDx = m.dx / Math.max(1, m.n), midDy = m.dy / Math.max(1, m.n), glassDx = g.dx / Math.max(1, g.n);
  check('   pushed to +x, the flakes in mid-gap travel with the push', m.n > 20 && midDx > 0.005 && midDx > 5 * Math.abs(midDy),
    `${m.n} flakes, ${midDx.toFixed(4)} across, ${midDy.toFixed(4)} down`);
  const want = (m.k / Math.max(1, m.n)) / (g.k / Math.max(1, g.n)), got = midDx / glassDx;
  check("   by Poiseuille's profile: mid-gap flakes go further than those by the glass, in the ratio of 6z(1−z)", g.n > 10 && Math.abs(got / want - 1) < 0.2,
    `${got.toFixed(2)} against ${want.toFixed(2)} (${g.n} by the glass)`);
  check('   and with the dye: their travel over 6z(1−z) is the dye\'s own, within 30 %', ride.nK > 50 && Math.abs(ride.perK / ride.dye - 1) < 0.3,
    `${ride.perK.toFixed(4)} against the dye's ${ride.dye.toFixed(4)} (${ride.nK} flakes)`);
} finally {
  await close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
