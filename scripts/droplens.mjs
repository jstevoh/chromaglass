#!/usr/bin/env node
/**
 * The oil drop as a lens, measured on the lab's plate as the app draws it.
 *
 *   npm run droplens      (any adapter that computes: scripts/lab.mjs)
 *
 * Reported: the beads and drops "look very cartoon like". Photographs of oil
 * on backlit water and of projected liquid light shows (the "Drops, not
 * rings" thread, kept in the project's shared files, not the repo) agree on what a drop
 * is and none of it was drawn: a small drop turns the plate round it upside
 * down, a big one is flat on top and shows what is under it as it is, both
 * are outlined by a thin dark line where the meniscus throws the light
 * sideways, and there is no highlight, because a plate lit from beneath
 * shows transmitted light. Then the research (bubbles-and-drops.md, same
 * place) found that a camera and a projector see a drop differently, and
 * the owner chose both: the macro closeup is the camera, as above; the
 * plate is the projector, which turns nothing over and draws each drop as
 * a bright middle ringed in dark where the curve bends light out of its
 * aperture, the curve set by the gap between the glasses. Each of those is
 * asked here of a single drop laid on a plate that is one colour on the
 * left and another on the right (or one grey, for brightness), so the
 * answer is a fact about where a colour lands, not about a picture.
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
import { readFileSync } from 'node:fs';

/*
  What the projector's dark band should come to, from the shader's own
  constants (read from plate.ts, so a change there moves the prediction with
  it rather than leaving a copy here stale): the core ends at
  u* = X / sqrt(1 + X^2) of a drop's curved part, X = NA / (2 n_w (1 - n_w/n_o));
  the curved part is the whole radius of a ball and half the gap round a
  pool; and the brightness is a half where 1 - 0.85 * smoothstep(u* - soft,
  u* + soft, t) is, soft being 0.7 of a mask texel (512 across) over the
  curved part's width.
*/
const plateSrc = readFileSync(new URL('../src/gpu/wgsl/plate.ts', import.meta.url), 'utf8');
const constant = (name) => {
  const m = plateSrc.match(new RegExp(`const ${name}: f32 = ([0-9.]+);`));
  if (!m) throw new Error(`no ${name} in plate.ts`);
  return Number(m[1]);
};
const NA = constant('DROP_NA'), NW = constant('N_WATER'), NO = constant('N_OIL'), HALF_GAP_UV = constant('DROP_HALF_GAP');
const X = NA / (2 * NW * (1 - NW / NO)), CORE = X / Math.sqrt(1 + X * X);
const halfPoint = (R, rho) => {
  const flat = Math.min(0.95, Math.max(0, 1 - rho / R));
  const soft = Math.min(0.3, Math.max(0.02, 0.7 / 512 / Math.max((1 - flat) * R, 1 / 512)));
  // smoothstep(-1, 1, z) = 0.5 / 0.85, solved by halving.
  let lo = -1, hi = 1;
  for (let k = 0; k < 40; k++) { const z = (lo + hi) / 2, u = (z + 1) / 2; if (u * u * (3 - 2 * u) < 0.5 / 0.85) lo = z; else hi = z; }
  return flat + (CORE + soft * lo) * (1 - flat);
};

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab();
try {
  const m = await page.evaluate(async (HALF_GAP) => {
    const N = 192, S = 512;
    const A = [0.2, 1.4, 1.4], B = [1.4, 1.4, 0.2], D = [1.4, 0.2, 1.4];
    /*
      A grey dye, for anything that asks how bright a drop is against the
      plate. The dyes above are absorbers that leave a channel or two of
      the lamp at 255, where a drop that lit its middle up by a third came
      out 2% brighter: the no-highlight and not-lit-up checks passed with
      the camera's focus brightening put on the projected plate. This one
      comes out near 135 in every channel, and its swatch is asked to be
      well clear of both ends.
    */
    const DIM = [0.6, 0.6, 0.6];
    /*
      The two ways of looking (dropLens in plate.ts): the plate as the
      projector throws it, and the macro closeup, a camera looking through
      the drop, all the way in. The closeup's own paint detail (cells, lacing,
      relief, depth of field, the edge warp) is turned off for the camera:
      it is laid over the whole frame, drop or none, and what is asked here
      is where the lens puts a colour.
    */
    const PLATE = { cam: { macroAmount: 0 }, set: {} };
    const CAMERA = { cam: { macroAmount: 1 }, set: { macroCells: 0, macroLacing: 0, macroDepth: 0, macroEdgeDetail: 0, macroRelief: 0 } };
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
    // The drops' mask as the field draws it (rasterDrops), twice as wide.
    const wide = (beads) => {
      const px = new Uint8ClampedArray(S * 2 * S * 4);
      lab.rasterDrops(beads.map((b) => ({ age: 5, seed: 0.5, color: [1, 0.48, 0], ...b })), N, S, px, new Float32Array(S * S), new Int32Array(S * S), 1);
      const c = new OffscreenCanvas(S * 2, S);
      c.getContext('2d').putImageData(new ImageData(px, S * 2, S), 0, 0);
      return c;
    };
    const lum = (px, i) => 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2];
    const rgb = (px, x, y) => { const i = (y * S + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    /*
      What a dye looks like on this plate: the plain frame's middle, with the
      camera on a point that is that dye and nothing else.
    */
    const swatch = async (x, y, look = PLATE) => rgb(await lab.render(S, { beads: 0, ...look.set }, { zoom: 3, ...look.cam, cx: x, cy: y }), S / 2, S / 2);
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
    const shoot = async (x, y, R, look = PLATE) => {
      const cam = { zoom: 3, ...look.cam, cx: x, cy: y };
      const on = await lab.render(S, { beads: 0.8, ...look.set }, { ...cam, beadMask: mask([{ x: x * N, y: y * N, r: R * N }]) });
      const off = await lab.render(S, { beads: 0, ...look.set }, cam);
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
        return { near, far, plain: (plain[near] ?? 0) / plain.all, seen: (seen[far] ?? 0) / seen.all, kept: (seen[near] ?? 0) / seen.all };
      }
      return { near: null, plain: 0, seen: 0, kept: 0 };
    };
    /*
      No highlight: a drop of radius R on one flat colour, and the most any
      pixel inside it is brighter than the plain frame there. A ball gathers
      light into its middle, by up to a third here; a lamp's glint is an
      added white, which on this plate was double the dye's brightness.
    */
    const brightest = async (x, y, R, look) => {
      const s = await shoot(x, y, R, look);
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
    // How much of the big drop is flat on top: all but half the gap at rest (plate.ts).
    const FLAT_B = 1 - HALF_GAP / Rb;
    /*
      The first plate: A left of x = 0.5, B right of it. The drop, three
      cells across its radius (the common size), sits just left of the line,
      off the middle row, its centre a sixth of a radius from it, so both
      what its left half covers and what it shows there are a clear dye's
      width from the line's blur. Turned over, its left half shows B, what
      lies past its right edge.
    */
    {
      const xs = 0.5 - 0.15 * Rs, ys = 0.42;
      await plate((x) => (x < 0.5 ? A : B));
      const refs = { A: await swatch(0.3, ys, CAMERA), B: await swatch(0.7, ys, CAMERA) };
      const s = await shoot(xs, ys, Rs, CAMERA);
      out.x = { ...turned(s, refs, [1, 0]), rad: s.rad };
    }
    /*
      How far a drop sees. The owner, on the macro photographs: "some of the
      bubbles have multiple background colors in them". A droplet there
      shows, small and turned over, the colours for some way round it, not
      only the patch it sits on. So on a plate of A with a stripe of D two
      and a half to three and a half radii to the right of the small drop,
      the drop must show D; a lens that sees only a radius or two past
      itself (the first version) shows none. And a stripe of B seven to
      eight radii away must not be in it: the view has a reach, and a lens
      turned up past it would put the whole plate in every droplet.
    */
    {
      const xs = 0.3, ys = 0.42;
      const inD = (x) => x >= xs + 2.5 * Rs && x <= xs + 3.5 * Rs;
      const inE = (x) => x >= xs + 7 * Rs && x <= xs + 8 * Rs;
      await plate((x) => (inD(x) ? D : inE(x) ? B : A));
      const refs = { A: await swatch(xs, 0.2, CAMERA), D: await swatch(xs + 3 * Rs, ys, CAMERA), E: await swatch(xs + 7.5 * Rs, ys, CAMERA) };
      const s = await shoot(xs, ys, Rs, CAMERA);
      let d = 0, e = 0;
      for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
        if (Math.hypot(xx - s.cx, yy - s.cy) > 0.9 * s.rad) continue;
        const k = which(refs, rgb(s.on, xx, yy));
        if (k === 'D') d++; else if (k === 'E') e++;
      }
      let dOff = 0;
      for (let xx = 0; xx < S; xx++) if (which(refs, rgb(s.off, xx, Math.round(s.cy))) === 'D') dOff++;
      out.reach = { d, e, dOff, eApart: which(refs, refs.E) === 'E' };
    }
    /*
      The projector (the plate, dropLens and the Oil drops block in
      plate.ts). A projection lens focused on the dye sees nothing turned
      over, and loses the light the drop's curved part bends past its
      aperture: a bright middle out to DROP_CORE (0.71) of the curved part,
      dark beyond it. Each drop on one flat colour, its middle row read
      outward as a fraction of the plain frame, in bins of a twentieth of
      the radius:
      - the small drop (a ball: three cells is half the gap at rest) is as
        bright as the plate to half its radius, neither lit up like a
        camera's ball lens nor dimmed, and dark from within a tenth of 0.71
        out. Dark is asked of 0.75 to 0.85: the outer texel of the mask is
        its antialiasing, where the coverage fades the whole drop into the
        plate, and on a drop eight texels across that is the outer seventh
        (measured, the profile climbs back from 18% at 0.8 to 83% at 0.95);
      - the big one is a pancake whose curved band is half the gap (0.44
        of its radius), so it stays the plate's brightness to three
        quarters out and goes dark only past 0.56 + 0.71 * 0.44 = 0.87;
      - the small drop across the first plate's line shows its near dye on
        its near side, upright, where the camera shows the far one;
      - and a press: with the glasses bowed to half the gap at the plate's
        middle (plateCurve -0.5, the solver's own gap, handed to the plate
        as the app hands it), a big drop there is flatter, and its dark edge
        about half as wide as at rest.
    */
    {
      const profile = (s) => {
        const bins = new Array(21).fill(0), n = new Array(21).fill(0);
        const y = Math.round(s.cy);
        for (let x = Math.round(s.cx - s.rad) - 2; x <= Math.round(s.cx); x++) {
          const i = (y * S + x) * 4;
          const k = Math.round(20 * (s.cx - x) / s.rad);
          if (k > 20) continue;
          bins[k] += lum(s.on, i) / Math.max(24, lum(s.off, i)); n[k]++;
        }
        return bins.map((b, k) => (n[k] ? b / n[k] : 1));
      };
      /*
        Where the brightness first falls under a half, walking out from the
        middle a pixel at a time and interpolating between the two pixels
        either side, in pixels from the centre. Turned into a fraction of the
        drop's radius below, from the drops' laid sizes rather than from the
        frame difference, whose edge runs a pixel or so past the drop.
      */
      const cross = (s) => {
        const y = Math.round(s.cy), cx = Math.round(s.cx);
        let prev = null;
        for (let x = cx; x >= cx - Math.round(s.rad) - 2; x--) {
          const i = (y * S + x) * 4;
          const f = lum(s.on, i) / Math.max(24, lum(s.off, i));
          if (f < 0.5) return prev ? prev.d + (prev.f - 0.5) / (prev.f - f) : 0;
          prev = { d: cx - x, f };
        }
        return Infinity;
      };
      const mean = (p, lo, hi) => { let t = 0, c = 0; for (let k = Math.round(lo * 20); k <= Math.round(hi * 20); k++) { t += p[k]; c++; } return t / c; };
      await plate(() => DIM);
      out.dim = await swatch(0.5, 0.25);
      const sS = await shoot(0.3, 0.25, Rs, PLATE), sB = await shoot(0.7, 0.25, Rb, PLATE);
      const small = profile(sS), big = profile(sB);
      // Pixels per plate unit, and the frame difference's overhang, from the two drops.
      const perUnit = (sB.rad - sS.rad) / (Rb - Rs);
      out.proj = {
        perUnit, over: sS.rad - perUnit * Rs,
        small: { core: mean(small, 0, 0.5), coreMax: Math.max(...small.slice(0, 11)), edge: cross(sS) / (perUnit * Rs), dark: mean(small, 0.75, 0.85) },
        big: { top: mean(big, 0.1, 0.75), edge: cross(sB) / (perUnit * Rb), dark: Math.min(...big.slice(17, 21)) },
      };
      await plate((x) => (x < 0.5 ? A : B));
      const refs = { A: await swatch(0.3, 0.42), B: await swatch(0.7, 0.42) };
      out.proj.upright = turned(await shoot(0.5 - 0.15 * Rs, 0.42, Rs, PLATE), refs, [1, 0]);
      /*
        Part way into the closeup. The lens changes from the projector's to
        the camera's over the middle fifth of the zoom's fade (dropCam in
        plate.ts), so that the blend in between, which reads a whole drop
        from its centre and then blows it up, passes in a few hundredths of
        the zoom. At 0.3 of the fade (1.35x) it is still the projector's;
        at 0.7 (1.6x) already the camera's. Checked with the closeup's paint
        detail off, as the camera is.
      */
      const part = (a) => ({ cam: { macroAmount: a }, set: CAMERA.set });
      const pRefs = async (a) => ({ A: await swatch(0.3, 0.42, part(a)), B: await swatch(0.7, 0.42, part(a)) });
      out.proj.early = turned(await shoot(0.5 - 0.15 * Rs, 0.42, Rs, part(0.3)), await pRefs(0.3), [1, 0]);
      out.proj.late = turned(await shoot(0.5 - 0.15 * Rs, 0.42, Rs, part(0.7)), await pRefs(0.7), [1, 0]);
      const pressed = async (curve) => {
        await plate(() => A);
        await lab.step(2, { plateCurve: curve });
        const gap = await lab.squeeze();
        const mid = gap ? gap.gap[Math.floor(gap.n / 2) * gap.n + Math.floor(gap.n / 2)] : 0;
        const cam = { zoom: 3, macroAmount: 0, cx: 0.5, cy: 0.5, view: true };
        const on = await lab.render(S, { beads: 0.8 }, { ...cam, beadMask: mask([{ x: 0.5 * N, y: 0.5 * N, r: Rb * N }]) });
        const off = await lab.render(S, { beads: 0 }, cam);
        // The dark edge: pixels of the middle row, both sides, under a half.
        let dark = 0;
        for (let x = 0; x < S; x++) { const i = (S / 2 * S + x) * 4; if (lum(on, i) / Math.max(24, lum(off, i)) < 0.5) dark++; }
        return { mid, dark };
      };
      out.proj.rest = await pressed(0);
      out.proj.press = await pressed(-0.5);
    }
    /*
      Where drops press together. At a wall between two drops the dome is
      nearly level across the lens's taps, and the size it implied ran up to
      the whole plate: a push of a few radii then read the plate from far
      across it, flecks of distant colour down every wall at 3x. The pair is
      a three-cell drop pressed a fifth into one of three and a half, as in
      a crowd: a pair of one size put the level spot on the wall's middle,
      where the lens stops, and passed with the cap removed (a copy of the
      lens's arithmetic on the pair's mask: the farthest read 0.23 of the
      plate for two of a size, 1.55 for these). They sit in the middle of a
      disc of A three tenths across, B all round it; the farthest a drop of
      the biggest size can see is two tenths, so no pixel may show B.
      Near the wall the dark outline takes most of the light, so a pixel's
      dye is asked of its hue (its colour over its sum), not its brightness.
    */
    {
      const pc = [0.4, 0.42];
      await plate((x, y) => (Math.hypot(x - pc[0], y - pc[1]) < 0.3 ? A : B));
      const refs = { A: await swatch(pc[0], pc[1], CAMERA), B: await swatch(0.9, 0.9, CAMERA) };
      const hue = (c) => { const s = c[0] + c[1] + c[2]; return s < 30 ? null : c.map((v) => v / s); };
      const hueRefs = { A: hue(refs.A), B: hue(refs.B) };
      const whichHue = (c) => { const h = hue(c); return h && which(hueRefs, h); };
      const pair = [{ x: pc[0] * N - 2.4, y: pc[1] * N, r: 3 }, { x: pc[0] * N + 2.6, y: pc[1] * N, r: 3.4 }];
      const cam = { zoom: 3, ...CAMERA.cam, cx: pc[0], cy: pc[1] };
      const far = {};
      for (const [name, over, bm] of [['rings', { beads: 0.8 }, mask(pair)], ['drops', { beads: 0.8, beadDrops: 1 }, wide(pair)]]) {
        const on = await lab.render(S, { ...over, ...CAMERA.set }, { ...cam, beadMask: bm });
        const off = await lab.render(S, { beads: 0, ...CAMERA.set }, cam);
        let changed = 0, b = 0;
        for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
          const i = (yy * S + xx) * 4;
          if (Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]) > 24) changed++;
          if (whichHue(rgb(on, xx, yy)) === 'B' && whichHue(rgb(off, xx, yy)) !== 'B') b++;
        }
        far[name] = { changed, b };
      }
      out.pairApart = which(hueRefs, hueRefs.B) === 'B' && which(hueRefs, hueRefs.A) === 'A' && hueRefs.A && hueRefs.B;
      out.pair = far;
    }
    /*
      The drops' own mask, twice as wide: each drop's colour in the right
      half. A green drop on the red plate is green in its middle; and the
      mask's seam is not a drop. The plate's right edge reads the mask just
      left of the seam, and a drop at the plate's left edge has its colour
      just right of it: a tap that strayed across would draw that colour as
      a drop where there is none.
    */
    {
      await plate(() => A);
      const G = [0.31, 0.78, 0.47];
      const bm = wide([{ x: 0.03 * N, y: 0.42 * N, r: 3, color: G }, { x: 0.5 * N, y: 0.42 * N, r: 4, color: G }]);
      const mid = { zoom: 3, macroAmount: 0, cx: 0.5, cy: 0.42 };
      const on = await lab.render(S, { beads: 0.8, beadDrops: 1 }, { ...mid, beadMask: bm });
      const off = await lab.render(S, { beads: 0 }, mid);
      const c = rgb(on, S / 2, S / 2), p = rgb(off, S / 2, S / 2);
      const edge = { zoom: 3, macroAmount: 0, cx: 0.97, cy: 0.42 };
      const eOn = await lab.render(S, { beads: 0.8, beadDrops: 1 }, { ...edge, beadMask: bm });
      const eOff = await lab.render(S, { beads: 0 }, edge);
      let seam = 0;
      for (let i = 0; i < eOn.length; i += 4) if (Math.abs(eOn[i] - eOff[i]) + Math.abs(eOn[i + 1] - eOff[i + 1]) + Math.abs(eOn[i + 2] - eOff[i + 2]) > 24) seam++;
      out.dyed = { c, p, seam };
    }
    /*
      The second plate turns the line over: A below y = 0.5, B above. The
      same small drop across it asks the lens's other axis, which the first
      plate's middle row cannot see. Then a big drop, seven cells (a merged
      drop's size), with the line through its flat middle a fifth of a radius
      from its centre: flat on top, it shows the line where it is. Read down
      its middle column, the first pixel that is the other dye must be where
      the plain frame has it. Read only across the flat: its edge is the
      meniscus, half the gap wide (DROP_HALF_GAP in plate.ts, three cells at
      rest), which is 0.56 of this drop's radius in; the column is read to
      eight tenths of that. A magnifier moves it outward; an inverting lens
      puts it on the other side.
    */
    {
      await plate((x, y) => (y < 0.5 ? A : B));
      const refs = { A: await swatch(0.3, 0.3, CAMERA), B: await swatch(0.3, 0.7, CAMERA) };
      const s = await shoot(0.3, 0.5 - 0.15 * Rs, Rs, CAMERA);
      out.y = { ...turned(s, refs, [0, 1]), rad: s.rad };

      const b = await shoot(0.7, 0.5 - Rb / 5, Rb, CAMERA);
      const cross = (px) => {
        const x = Math.round(b.cx), top = Math.round(b.cy - 0.8 * FLAT_B * b.rad), bot = Math.round(b.cy + 0.8 * FLAT_B * b.rad);
        const first = which(refs, rgb(b.off, x, top));
        if (!first) return -1;
        for (let y = top; y <= bot; y++) { const k = which(refs, rgb(px, x, y)); if (k && k !== first) return y; }
        return -1;
      };
      out.big = { on: cross(b.on), off: cross(b.off), rad: b.rad };
      /*
        The dark line: the same big drop on one flat colour (A, well below
        the line), along its middle row left of centre, the frame's
        brightness as a fraction of the plain frame's. How dark it gets and
        where, how many pixels are under seven tenths and whether any of
        them is inside three quarters of the radius, and how bright the
        flank inside the line is. Across the line the camera's band shows
        the far side, so a drop straddling two dyes would be measuring the
        dyes' brightness, not the line.
      */
      const o = await shoot(0.7, 0.25, Rb, CAMERA);
      const y = Math.round(o.cy);
      let dark = 1, at = 0, width = 0, inside = 0, flank = 0, nf = 0;
      for (let x = Math.round(o.cx - o.rad) - 2; x <= Math.round(o.cx); x++) {
        const i = (y * S + x) * 4;
        const f = lum(o.on, i) / Math.max(24, lum(o.off, i));
        const rr = (o.cx - x) / o.rad;
        if (f < dark) { dark = f; at = rr; }
        if (f < 0.7) { width++; if (rr < 0.75) inside++; }
        // Half way to five sixths of the way out: where the first reshade's
        // shadow was deepest, and a flat drop is still its window.
        if (rr >= 0.5 && rr <= 0.85) { flank += f; nf++; }
      }
      Object.assign(out.big, { dark, at, width: width / o.rad, inside, flank: flank / Math.max(1, nf) });
      await plate(() => DIM);
      out.bright = { small: await brightest(0.3, 0.25, Rs, CAMERA), big: await brightest(0.7, 0.25, Rb, CAMERA) };
      out.brightP = { small: await brightest(0.3, 0.25, Rs, PLATE), big: await brightest(0.7, 0.25, Rb, PLATE) };
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
      /*
        Along the middle row outward, the first texel the rim covers well
        (green 100 or more). Not the one it covers most: the stroke's outer
        edge is the bead's own, so its heaviest texel can be the bead's
        antialiased edge texel, two thirds inside the bead, where red is two
        thirds whatever the rim does. Chromium on Metal put the rim's peak
        there (green 151, red 167, blue 2; SwiftShader's was a texel in,
        green 164, red 255), and the check failed on a texel the rim does not
        own. The first well-covered texel is wholly inside the bead on both.
      */
      let best = -1, g = 0;
      for (let x = 256; x < 272; x++) { const i = (256 * c.width + x) * 4; if (d[i + 1] >= 100) { g = d[i + 1]; best = i; break; } }
      out.rim = { green: g, red: best < 0 ? 0 : d[best], blue: best < 0 ? 0 : d[best + 2] };
    }
    return out;
  }, HALF_GAP_UV);

  console.log(`     small drop: radius ${m.x.rad.toFixed(0)} px; big drop: radius ${m.big.rad.toFixed(0)} px (3x)`);
  check('the frame finds the drops at the sizes they were laid (7 : 3)', Math.abs(m.big.rad / m.x.rad / (7 / 3) - 1) < 0.1,
    `${(m.big.rad / m.x.rad).toFixed(2)} : 1`);
  const turnedOk = (t) => t.near && t.plain >= 0.8 && t.seen >= 0.7;
  check('in the closeup, a small drop shows the plate turned over, left to right',
    turnedOk(m.x), `its ${m.x.near ?? '?'} half shows ${m.x.far ?? '?'} in ${(100 * m.x.seen).toFixed(0)}% of pixels (${(100 * m.x.plain).toFixed(0)}% ${m.x.near ?? '?'} with no drop)`);
  check('and top to bottom',
    turnedOk(m.y), `its ${m.y.near ?? '?'} half shows ${m.y.far ?? '?'} in ${(100 * m.y.seen).toFixed(0)}% of pixels (${(100 * m.y.plain).toFixed(0)}% ${m.y.near ?? '?'} with no drop)`);
  check('in the closeup, a small drop shows the plate a few radii round it, not only what it sits on', m.reach.dOff > 10 && m.reach.d >= 30,
    `${m.reach.d} pixels of a stripe three radii off inside the drop (it is ${m.reach.dOff} px wide in the frame)`);
  check('but not what lies seven radii away', m.reach.eApart && m.reach.e === 0, `${m.reach.e} pixels of a stripe seven radii off`);
  check('in the closeup, a big drop is flat on top: the edge under it stays where it is',
    m.big.off > 0 && m.big.on > 0 && Math.abs(m.big.on - m.big.off) <= 2,
    `the dye's edge at ${m.big.on} px through the drop, ${m.big.off} px without`);
  check('its outline in the closeup is dark, at the contact', m.big.dark < 0.45 && m.big.at >= 0.8 && m.big.at <= 1.05,
    `down to ${(100 * m.big.dark).toFixed(0)}% of the plate under it, ${m.big.at.toFixed(2)} of the radius out`);
  check('and thin, a band at the contact, not a shadow round it',
    m.big.width > 0 && m.big.width < 0.2 && m.big.inside === 0 && m.big.flank > 0.85,
    `${(100 * m.big.width).toFixed(0)}% of the radius under seven tenths, ${m.big.inside} px of it inside three quarters; ${(100 * m.big.flank).toFixed(0)}% of the plate's brightness from half way out to five sixths`);
  const P = m.proj;
  const dimOk = Math.max(...m.dim) < 180 && Math.max(...m.dim) > 40;
  console.log(`     the grey plate: ${m.dim.join(',')}`);
  check('no highlight: no drop is brighter than the plate beneath it by more than the light it gathers',
    dimOk && m.bright.small < 1.45 && m.bright.big < 1.45 && m.brightP.small < 1.1 && m.brightP.big < 1.1,
    `at most ×${m.bright.small.toFixed(2)} in the small drop, ×${m.bright.big.toFixed(2)} in the big one in the closeup; ×${m.brightP.small.toFixed(2)} and ×${m.brightP.big.toFixed(2)} projected`);
  check('projected, a small drop is as bright as the plate in its middle, not lit up like a lens',
    dimOk && P.small.core > 0.85 && P.small.coreMax < 1.1,
    `to half its radius ${(100 * P.small.core).toFixed(0)}% of the plate on average, ${(100 * P.small.coreMax).toFixed(0)}% at most`);
  const predS = halfPoint(3 / 192, HALF_GAP_UV), predB = halfPoint(7 / 192, HALF_GAP_UV);
  console.log(`     ${P.perUnit.toFixed(0)} px to the plate's width at 3x, the frame difference ${P.over.toFixed(1)} px past a drop; the core ends at ${CORE.toFixed(3)} of the curved part (NA ${NA})`);
  /*
    Within three hundredths of the radius on the small drop, a pixel and a
    quarter at 38 px; two hundredths on the big one, about two pixels. The
    two renderers' antialiasing differs by about a pixel.
  */
  check('and dark round it from where the aperture says',
    Math.abs(P.small.edge - predS) <= 0.03 && P.small.dark < 0.4,
    `half as bright ${P.small.edge.toFixed(3)} of the radius out, the aperture says ${predS.toFixed(3)}; ${(100 * P.small.dark).toFixed(0)}% of the plate from 0.75 to 0.85`);
  check('projected, a big drop is flat to three quarters out and dark only at its edge',
    dimOk && P.big.top > 0.9 && P.big.top < 1.1 && Math.abs(P.big.edge - predB) <= 0.02 && P.big.dark < 0.4,
    `${(100 * P.big.top).toFixed(0)}% of the plate to 0.75, half as bright ${P.big.edge.toFixed(3)} of the radius out (half the gap and the aperture say ${predB.toFixed(3)}), down to ${(100 * P.big.dark).toFixed(0)}%`);
  check('projected, a small drop shows the plate the right way round',
    P.upright.near && P.upright.plain >= 0.8 && P.upright.kept >= 0.7 && P.upright.seen < 0.1,
    `its ${P.upright.near ?? '?'} half shows ${P.upright.near ?? '?'} in ${(100 * P.upright.kept).toFixed(0)}% of pixels, ${P.upright.far ?? '?'} in ${(100 * P.upright.seen).toFixed(0)}%`);
  check('and still does a third of the way into the closeup, turned over by two thirds',
    P.early.near && P.early.kept >= 0.7 && P.early.seen < 0.1 && turnedOk(P.late),
    `at 0.3 of the way its ${P.early.near ?? '?'} half shows ${P.early.near ?? '?'} in ${(100 * P.early.kept).toFixed(0)}%; at 0.7, ${P.late.far ?? '?'} in ${(100 * P.late.seen).toFixed(0)}%`);
  /*
    Half the gap should halve the band's width; measured it is a third,
    since pressed the dark part of a big drop's edge is under half a cell of
    the grid and the mask's antialiasing, which fades the whole drop into the
    plate over its outer texel, takes a share of it. So: narrower by a
    quarter at least (the gap ignored, it is the same width), and still
    there (two pixels or more).
  */
  check('a narrower gap flattens a drop and thins its dark edge',
    P.rest.mid > 0.025 && P.press.mid < 0.6 * P.rest.mid && P.rest.dark > 6 && P.press.dark >= 2 && P.press.dark / P.rest.dark <= 0.75,
    `the glasses bowed to half the gap under it, ${P.rest.mid.toFixed(4)} → ${P.press.mid.toFixed(4)}; its dark edge ${P.rest.dark} → ${P.press.dark} px across the middle row`);
  check('where two drops press together, neither shows the far side of the plate in the closeup',
    m.pairApart && m.pair.rings.changed > 500 && m.pair.drops.changed > 500 && m.pair.rings.b === 0 && m.pair.drops.b === 0,
    `pixels of the dye beyond three tenths: ${m.pair.rings.b} as rings, ${m.pair.drops.b} as drops (${m.pair.rings.changed} and ${m.pair.drops.changed} pixels drawn)`);
  check('a dyed drop is its dye in the middle', m.dyed.c[1] - m.dyed.p[1] > 40,
    `green ${m.dyed.p[1]} → ${m.dyed.c[1]} (the plate ${m.dyed.p.join(',')}, the drop ${m.dyed.c.join(',')})`);
  check('and the wide mask\'s seam is not a drop', m.dyed.seam === 0, `${m.dyed.seam} pixels changed at the plate's right edge`);
  check('the rings\' mask carries a bead\'s fade in its red, on an opaque canvas',
    Math.abs(m.fade.red - 128) <= 12 && m.fade.clear === 0,
    `red ${m.fade.red} half way through the fade; ${m.fade.clear} texels less than opaque`);
  check('and its rim leaves the bead and its dome under it', m.rim.green >= 100 && m.rim.red >= 230 && m.rim.blue >= 15,
    `under the rim (green ${m.rim.green}): red ${m.rim.red}, blue ${m.rim.blue}`);
} finally { await close(); }
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
