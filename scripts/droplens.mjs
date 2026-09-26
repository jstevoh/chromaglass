#!/usr/bin/env node
/**
 * The oil drop as a lens, measured on the lab's plate as the app draws it.
 *
 *   npm run droplens      (any adapter that computes: scripts/lab.mjs)
 *
 * Reported: the beads and drops "look very cartoon like". Photographs of oil
 * on backlit water and of projected liquid light shows (the "Drops, not
 * rings" thread; /mnt/project-files/drops/references) agree on what a drop
 * is and none of it was drawn: a small drop turns the plate round it upside
 * down, a big one is flat on top and shows what is under it as it is, both
 * are outlined by a thin dark line where the meniscus throws the light
 * sideways, and there is no highlight, because a plate lit from beneath
 * shows transmitted light. Each of those is asked here of a single drop
 * laid on a plate that is one colour on the left and another on the right,
 * so the answer is a fact about where a colour lands, not about a picture.
 *
 * Where a drop is in the frame is found from the frame, not from the camera
 * arithmetic: every pixel that differs from the same plate rendered without
 * the drop. The camera is centred on the drop, off the plate's middle row,
 * so a mask drawn upside down puts the drop out of frame and the check
 * stops rather than measuring the plate beside it. Which dye a pixel shows
 * is asked of each dye's own colour, rendered alone, and a pixel near none
 * of them counts as none (a projection onto one line from A to B would call
 * white half way and cyan past B).
 *
 * And one fact about the mask the rings upload: its red is coverage times the
 * bead's fade-in, as the shader reads it. Drawn on a clear canvas, the
 * upload's straight alpha made it 255 wherever a bead touched a texel at
 * all, which is what drew a staircase of dark squares round every bead at 3x.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab();
try {
  const m = await page.evaluate(async () => {
    const N = 192, S = 512;
    const A = [0.2, 1.4, 1.4], B = [1.4, 1.4, 0.2], D = [1.4, 0.2, 1.4];
    /*
      A plate painted by a rule: rows of small discs packed closely enough
      that each region is one flat colour. A couple of steps put the dye in
      the texture and blur each boundary by about a texel.
    */
    const plate = async (rule) => {
      await lab.create(N);
      for (let y = 0.01; y < 1; y += 0.008) for (let x = 0.01; x < 1; x += 0.008) {
        const c = rule(x, y);
        if (c) lab.dye(x, y, 0.007, c, 1.2);
      }
      lab.flush(); await lab.step(2);
    };
    const mask = (beads) => {
      const f = new lab.BeadField(N);
      for (const b of beads) f.beads.push({ age: 5, seed: 0.5, ...b });
      f.dirty = true;
      return f.render();
    };
    const lum = (px, i) => 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2];
    const rgb = (px, x, y) => { const i = (y * S + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    /*
      What a dye looks like on this plate: the plain frame's middle, with the
      camera on a point that is that dye and nothing else.
    */
    const swatch = async (x, y) => rgb(await lab.render(S, { beads: 0 }, { zoom: 3, macroAmount: 0, cx: x, cy: y }), S / 2, S / 2);
    // Which of the swatches a pixel is, or null when it is near none of them.
    const which = (refs, c) => {
      let best = null, bd = Infinity, gap = Infinity;
      for (const k in refs) {
        const d = dist(c, refs[k]); if (d < bd) { bd = d; best = k; }
        for (const j in refs) if (j !== k) gap = Math.min(gap, dist(refs[k], refs[j]));
      }
      return bd <= 0.35 * gap ? best : null;
    };
    /*
      One drop of radius R (plate units) at (x, y), zoomed 3x on it, with and
      without. The drop's centre and radius in pixels are where the two
      frames differ; with the camera on the drop that must be the frame's
      middle, and a frame with no difference is an error, not a pass.
    */
    const shoot = async (x, y, R) => {
      const cam = { zoom: 3, macroAmount: 0, cx: x, cy: y };
      const on = await lab.render(S, { beads: 0.8 }, { ...cam, beadMask: mask([{ x: x * N, y: y * N, r: R * N }]) });
      const off = await lab.render(S, { beads: 0 }, cam);
      let x0 = S, x1 = -1, y0 = S, y1 = -1;
      for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
        const i = (yy * S + xx) * 4;
        if (Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]) > 24) {
          x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, yy); y1 = Math.max(y1, yy);
        }
      }
      if (x1 < 0) throw new Error(`no drop in the frame at (${x}, ${y})`);
      const s = { on, off, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rad: Math.max(x1 - x0, y1 - y0) / 2 };
      if (Math.abs(s.cx - S / 2) > 4 || Math.abs(s.cy - S / 2) > 4) throw new Error(`the drop at (${x}, ${y}) is at (${s.cx}, ${s.cy}) px, not the frame's middle`);
      return s;
    };
    /*
      Turned over: along one axis through the drop, the two windows between
      three and six tenths of the radius out, clear of the dark line and of
      the middle (where the view passes through the line). In the plain
      frame one window is the near dye; through the drop, most of that same
      window must be the far one.
    */
    const turned = (s, refs, ax) => {
      const read = (px, sign) => {
        const n = {};
        for (let t = Math.round(0.3 * s.rad); t <= Math.round(0.6 * s.rad); t++) {
          const x = Math.round(s.cx + sign * t * ax[0]), y = Math.round(s.cy + sign * t * ax[1]);
          const k = which(refs, rgb(px, x, y)); n[k] = (n[k] ?? 0) + 1; n.all = (n.all ?? 0) + 1;
        }
        return n;
      };
      for (const sign of [-1, 1]) {
        const plain = read(s.off, sign);
        const near = (plain.A ?? 0) >= 0.8 * plain.all ? 'A' : (plain.B ?? 0) >= 0.8 * plain.all ? 'B' : null;
        if (!near) continue;
        const far = near === 'A' ? 'B' : 'A';
        const seen = read(s.on, sign);
        return { near, far, plain: (plain[near] ?? 0) / plain.all, seen: (seen[far] ?? 0) / seen.all };
      }
      return { near: null, plain: 0, seen: 0 };
    };
    /*
      No highlight: a drop of radius R on one flat colour, and the most any
      pixel inside it is brighter than the plain frame there. A ball gathers
      light into its middle, by up to a third here; a lamp's glint is an
      added white, which on this plate was double the dye's brightness.
    */
    const brightest = async (x, y, R) => {
      const s = await shoot(x, y, R);
      let worst = 0, n = 0;
      for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
        if (Math.hypot(xx - s.cx, yy - s.cy) > s.rad) continue;
        const i = (yy * S + xx) * 4;
        worst = Math.max(worst, lum(s.on, i) / Math.max(24, lum(s.off, i))); n++;
      }
      if (n < 100) throw new Error(`only ${n} pixels judged for a highlight`);
      return worst;
    };

    const out = {};
    const Rs = 3 / N, Rb = 7 / N;
    /*
      The first plate: A left of x = 0.5, B right of it, and a stripe of a
      third dye three to four small radii right of the small drop's centre.
      The drop, three cells across its radius (the common size), sits just
      left of the line, off the middle row, its centre a sixth of a radius
      from it, so both what its left half covers and what it shows there
      are a clear dye's width from the line's blur. Turned over, its left
      half shows B, what lies past its right edge. But not the stripe: the
      view reaches about two radii past the far edge, and a lens turned up
      until it reaches three would show a plate the drop is nowhere near.
    */
    {
      const xs = 0.5 - 0.15 * Rs, ys = 0.42;
      await plate((x) => (x >= xs + 3 * Rs && x <= xs + 4 * Rs ? D : x < 0.5 ? A : B));
      const refs = { A: await swatch(0.3, ys), B: await swatch(0.52, ys), D: await swatch(xs + 3.5 * Rs, ys) };
      const s = await shoot(xs, ys, Rs);
      const t = turned(s, refs, [1, 0]);
      let stripe = 0;
      for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
        if (Math.hypot(xx - s.cx, yy - s.cy) > 0.9 * s.rad) continue;
        if (which(refs, rgb(s.on, xx, yy)) === 'D') stripe++;
      }
      let stripeOff = 0;
      for (let xx = 0; xx < S; xx++) if (which(refs, rgb(s.off, xx, Math.round(s.cy))) === 'D') stripeOff++;
      out.x = { ...t, stripe, stripeOff, rad: s.rad };
    }
    /*
      The second plate turns the line over: A below y = 0.5, B above. The
      same small drop across it asks the lens's other axis, which the first
      plate's middle row cannot see. Then a big drop, seven cells (a merged
      drop's size), with the line through its flat middle a third of a radius
      from its centre: flat on top, it shows the line where it is. Read down
      its middle column, the first pixel that is the other dye must be where
      the plain frame has it. A magnifier moves it outward; an inverting lens
      puts it on the other side.
    */
    {
      await plate((x, y) => (y < 0.5 ? A : B));
      const refs = { A: await swatch(0.3, 0.3), B: await swatch(0.3, 0.7) };
      const s = await shoot(0.3, 0.5 - 0.15 * Rs, Rs);
      out.y = { ...turned(s, refs, [0, 1]), rad: s.rad };

      const b = await shoot(0.7, 0.5 - Rb / 3, Rb);
      const cross = (px) => {
        const x = Math.round(b.cx), top = Math.round(b.cy - 0.6 * b.rad), bot = Math.round(b.cy + 0.6 * b.rad);
        const first = which(refs, rgb(b.off, x, top));
        if (!first) return -1;
        for (let y = top; y <= bot; y++) { const k = which(refs, rgb(px, x, y)); if (k && k !== first) return y; }
        return -1;
      };
      out.big = { on: cross(b.on), off: cross(b.off), rad: b.rad };
      /*
        The dark line: along the middle row (all A: the line is a third of a
        radius off it), left of centre, the frame's brightness as a fraction
        of the plain frame's. How dark it gets and where, how many pixels are
        under seven tenths and whether any of them is inside three quarters
        of the radius, and how bright the flank inside the line is.
      */
      const y = Math.round(b.cy);
      let dark = 1, at = 0, width = 0, inside = 0, flank = 0, nf = 0;
      for (let x = Math.round(b.cx - b.rad) - 2; x <= Math.round(b.cx); x++) {
        const i = (y * S + x) * 4;
        const f = lum(b.on, i) / Math.max(24, lum(b.off, i));
        const rr = (b.cx - x) / b.rad;
        if (f < dark) { dark = f; at = rr; }
        if (f < 0.7) { width++; if (rr < 0.75) inside++; }
        // Half way to five sixths of the way out: where the first reshade's
        // shadow was deepest, and a flat drop is still its window.
        if (rr >= 0.5 && rr <= 0.85) { flank += f; nf++; }
      }
      Object.assign(out.big, { dark, at, width: width / b.rad, inside, flank: flank / Math.max(1, nf) });
      out.bright = { small: await brightest(0.3, 0.25, Rs), big: await brightest(0.7, 0.25, Rb) };
    }
    /*
      The rings' mask, read back from the canvas as the upload reads it. One
      bead half way through its fade-in (0.6 s): its middle's red is the
      fade, a half, and no texel is less than opaque, so the upload has
      nothing to divide. And one bead grown, four cells: under its rim the
      red is still the whole bead and the blue still its dome, since the rim
      is added into green alone. Drawn over them, a rim took nine tenths of
      both, and the lens read the bead's outer tenth as another drop's.
    */
    {
      const f = new lab.BeadField(N);
      f.beads.push({ x: N / 2, y: N / 2, r: 4, age: 0.3, seed: 0.5 });
      f.dirty = true;
      let c = f.render();
      let d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let clear = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] < 255) clear++;
      out.fade = { red: d[(256 * c.width + 256) * 4], clear };
      c = mask([{ x: N / 2, y: N / 2, r: 4 }]);
      d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      // Along the middle row outward, the texel the rim covers most.
      let best = -1, g = 0;
      for (let x = 256; x < 272; x++) { const i = (256 * c.width + x) * 4; if (d[i + 1] > g) { g = d[i + 1]; best = i; } }
      out.rim = { green: g, red: d[best], blue: d[best + 2] };
    }
    return out;
  });

  console.log(`     small drop: radius ${m.x.rad.toFixed(0)} px; big drop: radius ${m.big.rad.toFixed(0)} px (3x)`);
  check('the frame finds the drops at the sizes they were laid (7 : 3)', Math.abs(m.big.rad / m.x.rad / (7 / 3) - 1) < 0.1,
    `${(m.big.rad / m.x.rad).toFixed(2)} : 1`);
  const turnedOk = (t) => t.near && t.plain >= 0.8 && t.seen >= 0.7;
  check('a small drop shows the plate turned over, left to right',
    turnedOk(m.x), `its ${m.x.near ?? '?'} half shows ${m.x.far ?? '?'} in ${(100 * m.x.seen).toFixed(0)}% of pixels (${(100 * m.x.plain).toFixed(0)}% ${m.x.near ?? '?'} with no drop)`);
  check('and top to bottom',
    turnedOk(m.y), `its ${m.y.near ?? '?'} half shows ${m.y.far ?? '?'} in ${(100 * m.y.seen).toFixed(0)}% of pixels (${(100 * m.y.plain).toFixed(0)}% ${m.y.near ?? '?'} with no drop)`);
  check('but not what lies three radii past it', m.x.stripeOff > 10 && m.x.stripe === 0,
    `${m.x.stripe} pixels of the stripe inside the drop (it is ${m.x.stripeOff} px wide in the frame)`);
  check('a big drop is flat on top: the edge under it stays where it is',
    m.big.off > 0 && m.big.on > 0 && Math.abs(m.big.on - m.big.off) <= 2,
    `the dye's edge at ${m.big.on} px through the drop, ${m.big.off} px without`);
  check('its outline is dark, at the contact', m.big.dark < 0.45 && m.big.at >= 0.8 && m.big.at <= 1.05,
    `down to ${(100 * m.big.dark).toFixed(0)}% of the plate under it, ${m.big.at.toFixed(2)} of the radius out`);
  check('and thin, a band at the contact, not a shadow round it',
    m.big.width > 0 && m.big.width < 0.2 && m.big.inside === 0 && m.big.flank > 0.85,
    `${(100 * m.big.width).toFixed(0)}% of the radius under seven tenths, ${m.big.inside} px of it inside three quarters; ${(100 * m.big.flank).toFixed(0)}% of the plate's brightness from half way out to five sixths`);
  check('no highlight: no drop is brighter than the plate beneath it by more than the light it gathers',
    m.bright.small < 1.45 && m.bright.big < 1.45,
    `at most ×${m.bright.small.toFixed(2)} in the small drop, ×${m.bright.big.toFixed(2)} in the big one`);
  check('the rings\' mask carries a bead\'s fade in its red, on an opaque canvas',
    Math.abs(m.fade.red - 128) <= 12 && m.fade.clear === 0,
    `red ${m.fade.red} half way through the fade; ${m.fade.clear} texels less than opaque`);
  check('and its rim leaves the bead and its dome under it', m.rim.green >= 100 && m.rim.red >= 230 && m.rim.blue >= 15,
    `under the rim (green ${m.rim.green}): red ${m.rim.red}, blue ${m.rim.blue}`);
} finally { await close(); }
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
