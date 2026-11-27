#!/usr/bin/env node
/**
 * The logo melted at the start of a film or a stream (PLAN 37x-11).
 *
 *   npm run logomelt
 *
 * What was asked (the owner, 2026-11-10): a big ChromaGlass logo at the start
 * of every video and stream, left to melt away before the show begins. What
 * this holds the build to is the plate's rule, physics writes and rendering
 * reads: the logo is not a picture over the frame faded out, it is dye poured
 * into the solver (src/lib/logoMelt.ts through src/lib/inkTitleRun.ts, the
 * song title's thick ink and rinse, 37x-10g), and what takes it away is the
 * liquid moving. So the lab lines step the real solver on the thin gap every
 * look opens on, pour the real wordmark (public/intro-name.svg) the way the
 * app pours it, stir the plate with a lively look's flow, and read the dye:
 *
 *   lands   the logo is read in the dye when it lands (normalised correlation
 *           of the dye with the logo's own mask, best over shifts, as
 *           `npm run inktitle` reads a title): 0.8 or better at 0.5 s, and
 *           it went through the solver's pourInk, not the CPU's arrays;
 *   holds   still readable at 2 s (0.7 or better) under the look's flow,
 *           since a logo smeared before anyone sees it is no logo: this is
 *           what the thick ink's pad is for;
 *   melts   gone into the plate (0.3 or worse) by 7 s, the few seconds
 *           before a show starts;
 *   kept    90% or more of the dye added is still on the plate at 7 s, so
 *           it left by flowing and mixing, not by being taken away (a fade
 *           would read as gone with its dye gone with it);
 *   padded  the logo lies on a pad of thick liquid (the species field's share
 *           under its box above 0.3 after the pour).
 *
 * And with no browser: the setting (`logoMelt` off by default, so today's
 * films are unchanged; one of the show's keys, which no look sets), the cue
 * (`logoMeltCue`: on the stream going live or a take starting, once each, and
 * never with the switch off), and the wiring (the app hook fed by the Live
 * Show's phase and the recorder, the desk's switch and the phone's, and no
 * shader under src/gpu/wgsl/ that names the logo: rendering never draws it).
 *
 * About 7 s of plate at 60 steps a second: three minutes on SwiftShader's
 * fast tier. Not 12 as first written: on CI's slow tier lab4 was cancelled at
 * its 25-minute bound six minutes into a 12 s arm (#780's first run).
 */
import { build } from 'esbuild';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const bundle = async (entry) => {
  const out = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
};
const src = (p) => readFileSync(p, 'utf8');

const melt = await bundle('src/lib/logoMelt.ts');
const { DEFAULT_SETTINGS } = await bundle('src/types.ts');
const { RIG_KEYS } = await bundle('src/lib/lookFade.ts');

// ── setting ──
check('`logoMelt` is off by default and is the show\'s, not a look\'s', DEFAULT_SETTINGS.logoMelt === false && RIG_KEYS.has('logoMelt'),
  `default ${JSON.stringify(DEFAULT_SETTINGS.logoMelt)}, in RIG_KEYS ${RIG_KEYS.has('logoMelt')}`);

// ── cue ──
{
  const cue = melt.logoMeltCue, off = { live: false, recording: false };
  const cases = [
    ['switch off, going live', cue(off, { live: true, recording: false }, false), false],
    ['going live', cue(off, { live: true, recording: false }, true), true],
    ['staying live', cue({ live: true, recording: false }, { live: true, recording: false }, true), false],
    ['a take starting', cue(off, { live: false, recording: true }, true), true],
    ['a take starting while live', cue({ live: true, recording: false }, { live: true, recording: true }, true), true],
    ['the stream stopping', cue({ live: true, recording: false }, off, true), false],
    ['the switch turned on mid-stream', cue({ live: true, recording: false }, { live: true, recording: false }, true), false],
  ];
  const bad = cases.filter(([, got, want]) => got !== want).map(([n, got]) => `${n}: ${got}`);
  check('the logo pours once as the stream goes live or a take starts, never with the switch off', bad.length === 0, bad.join('; ') || `${cases.length} cases`);
}

// ── wired ──
{
  const bad = [];
  const remote = src('src/app/useRemote.ts');
  if (!/useLogoMelt\(wallRef, \{ live: liveShow\.phase === 'live', recording: recorder\.recording \}, !!settings\.logoMelt\)/.test(remote)) bad.push('useRemote does not feed useLogoMelt the Live Show\'s phase, the recorder and the switch');
  if (!/pourText\(\[\], \{ logo \}\)/.test(src('src/app/useLogoMelt.ts'))) bad.push('useLogoMelt does not pour through the wall\'s pourText');
  if (!/queueInkTitle\(inkTitleRef\.current, rows, opts\)/.test(src('src/components/LiquidVisualizer.tsx'))) bad.push('the visualizer\'s pourText does not hand its options (the logo) to queueInkTitle');
  if (!/onUpdate\(\{ logoMelt: v \}\)/.test(src('src/components/settings/StageSections.tsx'))) bad.push('no desk switch binds logoMelt');
  if (!/onSetting\(\{ logoMelt: !melt \}\)/.test(src('src/components/phone/PhoneInkTitle.tsx'))) bad.push('no phone switch binds logoMelt');
  const wgsl = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.wgsl')) wgsl.push(p); } };
  walk('src/gpu/wgsl');
  const drawn = wgsl.filter((p) => /logo/i.test(src(p)));
  if (drawn.length) bad.push(`a shader names the logo: ${drawn.join(', ')}`);
  check('the app pours the logo at a film\'s start, the desk and the phone have the switch, no shader draws it', bad.length === 0, bad.join('; ') || 'useRemote, useLogoMelt, the visualizer, desk, phone, no WGSL');
}

// ── the lab ──
const READ = 0.8, HOLD = 0.7, GONE = 0.3, KEPT = 0.9, PAD = 0.3;
{
  const { openLab } = await import('./lab.mjs');
  mkdirSync('node_modules/.cache', { recursive: true });
  const entry = 'node_modules/.cache/logomelt-entry.ts';
  writeFileSync(entry, [
    "import '../../scripts/lab-entry.ts';",
    "import * as melt from '../../src/lib/logoMelt.ts';",
    "import * as inkRun from '../../src/lib/inkTitleRun.ts';",
    '(window as unknown as { melt: typeof melt; inkRun: typeof inkRun }).melt = melt;',
    '(window as unknown as { melt: typeof melt; inkRun: typeof inkRun }).inkRun = inkRun;',
    '',
  ].join('\n'));
  const svg = `data:image/svg+xml;base64,${Buffer.from(src('public/intro-name.svg')).toString('base64')}`;
  const { page, close } = await openLab({ entry });
  try {
    const r = await page.evaluate(async ({ svg, seconds, lively, thickness }) => {
      const img = new Image();
      await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error('the wordmark did not load')); img.src = svg; });
      const logo = { source: img, aspect: melt.LOGO_MELT_ASPECT };
      const { L, N } = await lab.create(256, 192);
      const over = { magnetSeconds: 1 / 60, thinGap: 1, gapThickness: thickness };
      const total = async () => { const d = await lab.field('dye'); let t = 0; for (let i = 3; i < d.length; i += 4) t += d[i]; return t; };
      // A little dye already on the plate, as a show has, so the first step is a real one.
      lab.dye(0.12, 0.12, 0.08, [0.2, 0.4, 0.8], 1); lab.flush(); await lab.step(1, over, true);
      const thinBefore = lab.thinLive();
      const before = await total();
      const { mask: mN, box } = melt.logoMeltMask(logo, melt.LOGO_MELT_WIDTH, N);
      const mL = melt.logoMeltMask(logo, melt.LOGO_MELT_WIDTH, L).mask;
      let cover = 0; for (const v of mN) cover += v;
      const vel = new Float32Array(L * L * 4);
      const solver = lab.solver();
      let cpu = false;
      const target = {
        size: L, gpu: solver, meanColor: [0, 0, 0], meanDensity: 0,
        addDensity() { cpu = true; },
        addVelocity(i, j, vx, vy) { const o = (i + j * L) * 4; vel[o] += vx; vel[o + 1] += vy; },
      };
      const run = inkRun.newInkTitleRun();
      inkRun.queueInkTitle(run, [], { logo });
      const settings = { gapThickness: thickness };
      // The species' share under the logo's box just after the pour: the pad.
      const share = async () => {
        const sp = await lab.field('species').catch(() => null);
        if (!sp || sp.length < L * L * 4) return 0;
        let t = 0, n = 0; const n0 = Math.floor(box[0] * L), n1 = Math.ceil(box[2] * L), m0 = Math.floor(box[1] * L), m1 = Math.ceil(box[3] * L);
        for (let j = m0; j < m1; j++) for (let i = n0; i < n1; i++) { t += sp[(i + j * L) * 4]; n++; }
        return t / Math.max(1, n);
      };
      let x0 = L, x1 = 0, y0 = L, y1 = 0;
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) if (mL[i + j * L] > 0.3) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j); }
      x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(L - 1, x1 + 2); y1 = Math.min(L - 1, y1 + 2);
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, mm = new Float32Array(bw * bh);
      for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) mm[i + j * bw] = mL[x0 + i + (y0 + j) * L];
      let mu = 0; for (const v of mm) mu += v; mu /= mm.length;
      let ms = 0; for (const v of mm) ms += (v - mu) ** 2; ms = Math.sqrt(ms);
      const ncc = (d, dx, dy) => {
        let s = 0, sv = 0, svv = 0;
        for (let j = 0; j < bh; j++) {
          const yy = y0 + j + dy; if (yy < 0 || yy >= L) return -1;
          for (let i = 0; i < bw; i++) {
            const xx = x0 + i + dx; if (xx < 0 || xx >= L) return -1;
            const v = d[xx + yy * L]; sv += v; svv += v * v; s += (mm[i + j * bw] - mu) * v;
          }
        }
        const n = bw * bh, vs = Math.sqrt(Math.max(0, svv - sv * sv / n));
        return vs > 0 ? s / (ms * vs) : 0;
      };
      // The logo slid whole is still the logo: the best correlation over shifts, coarse then fine.
      const read = async () => {
        const f = await lab.field('dye');
        const d = new Float32Array(L * L);
        for (let i = 0; i < L * L; i++) { d[i] = f[i * 4 + 3]; if (!Number.isFinite(d[i])) throw new Error(`the dye is not finite at cell ${i}: a broken plate, not a melted logo`); }
        let best = -1, bx = 0, by = 0;
        for (let dy = -y0; dy <= L - bh - y0; dy += 3) for (let dx = -x0; dx <= L - bw - x0; dx += 3) { const v = ncc(d, dx, dy); if (v > best) { best = v; bx = dx; by = dy; } }
        const cx = bx, cy = by;
        for (let dy = cy - 2; dy <= cy + 2; dy++) for (let dx = cx - 2; dx <= cx + 2; dx++) { const v = ncc(d, dx, dy); if (v > best) best = v; }
        return best;
      };
      const SEC = 1 / 60, reads = [];
      const k = Math.PI / (L / 8);
      let padShare = null;
      for (let s = 1; s <= Math.round(seconds * 60); s++) {
        vel.fill(0);
        inkRun.stepInkTitle(run, target, settings, SEC, [], 0);
        // The look's flow: ψ = A(cos φ sin kx sin ky + sin φ cos kx cos ky), cells an eighth of the plate, φ turning 0.7 rad/s (inktitle's).
        const ph = 0.7 * s * SEC, c = Math.cos(ph), sn = Math.sin(ph), amp = lively * SEC;
        for (let j = 0; j < L; j++) {
          const yy = j + 0.5, sy = Math.sin(k * yy), cy = Math.cos(k * yy);
          for (let i = 0; i < L; i++) {
            const xx = i + 3.5, sx = Math.sin(k * xx), cx = Math.cos(k * xx), o = (i + j * L) * 4;
            vel[o] += amp * (c * sx * cy - sn * cx * sy);
            vel[o + 1] -= amp * (c * cx * sy - sn * sx * cy);
          }
        }
        lab.addVel(vel); lab.flush();
        await lab.step(1, over, true);
        if (s === 1) padShare = await share();
        if (s % 30 === 0) reads.push({ t: s * SEC, r: await read() });
      }
      return { cpu, poured: !!run.logo && run.logo.pending === null, thinBefore, thinAfter: lab.thinLive(), before, cover: cover * (L / N) ** 2, reads, after: await total(), padShare };
    }, { svg, seconds: 7, lively: 10, thickness: DEFAULT_SETTINGS.gapThickness ?? 0.45 });

    const at = (t) => r.reads.find((x) => Math.abs(x.t - t) < 1e-6)?.r ?? NaN;
    const goneBy = r.reads.find((x) => x.r <= GONE)?.t ?? null;
    const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : '—');
    const trace = r.reads.filter((_, i) => i % 2 === 1).map((x) => f3(x.r)).join(' ');
    if (!r.thinBefore || !r.thinAfter) check('the arm ran on the thin gap', false, 'it stepped the old plate');
    check(`the logo lands readable in the dye (${READ} or better at 0.5 s), poured by the solver's pourInk`, at(0.5) >= READ && !r.cpu && r.poured,
      `${f3(at(0.5))}${r.cpu ? '; it went through the CPU\'s arrays' : ''}${r.poured ? '' : '; it was never poured'}`);
    check(`under a lively look's flow it still reads at 2 s (${HOLD} or better)`, at(2) >= HOLD, `${f3(at(2))}; each second: ${trace}`);
    check(`it melts into the plate by 7 s (${GONE} or worse)`, goneBy !== null, goneBy !== null ? `gone at ${goneBy.toFixed(1)} s` : `still ${f3(at(7))} at 7 s`);
    const rose = r.after - r.before, kept = rose / Math.max(1e-6, r.cover);
    check(`its dye stays on the plate: melted by the liquid, not faded (${Math.round(KEPT * 100)}% or more of what it poured)`, kept >= KEPT,
      `${rose.toFixed(1)} on the plate at 7 s of ${r.cover.toFixed(1)} poured (${(kept * 100).toFixed(0)}%)`);
    check(`it lies on a pad of thick liquid (the species' share under it above ${PAD})`, (r.padShare ?? 0) > PAD, `${f3(r.padShare ?? NaN)}`);
  } finally {
    await close();
  }
}

const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} of ${checks.length} FAILED` : `\nall ${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
