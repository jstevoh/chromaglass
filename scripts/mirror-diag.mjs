#!/usr/bin/env node
// Temporary: what the calm Classic plate does on its own across mirror.mjs's four drops.
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';

const PORT = 4352;
const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
await new Promise((r) => setTimeout(r, 2500));

const CALM = {
  turbulenceScale: 0, audioImpact: 0, plateRock: 0, beatSqueeze: 0, buoyancy: 0,
  rainDrip: 0, glassSmear: 0, vibrationFrequency: 0, centerGravity: 0, rotationSpeed: 0, spinImpulse: 0,
  audioMappings: { velocity: 'none', density: 'none', color: 'none', rotation: 'none' },
};
const VARIANTS = [
  { name: 'warm-up (browser cold)', drop: false, extra: {}, reps: 1 },
  { name: 'drops', drop: true, extra: {} },
  { name: 'drops, rung pinned where it opened', drop: true, pin: true, extra: {} },
  { name: 'drops again', drop: true, extra: {} },
  { name: 'drops, rung pinned again', drop: true, pin: true, extra: {} },
];
let openedRung = null;
const browser = await launchChromium(chromium);
try {
  for (const v of VARIANTS) {
    const page = await browser.newPage({ viewport: { width: 1418, height: 703 } });
    await page.addInitScript(() => { try { localStorage.setItem('chromaglass-desk-mode', 'design'); } catch { /* none */ } });
    await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic${v.pin && openedRung !== null ? `&rung=${openedRung}` : ''}`, { waitUntil: 'load' });
    await page.waitForTimeout(8000);
    await page.evaluate(({ CALM, extra }) => {
      window.chromaglassSettings?.({ ...CALM, layerCount: 2, ...extra });
      window.chromaglassRotation?.([0, 0]);
      window.chromaglassLayer?.(0);
      window.chromaglassTool?.('dropper');
    }, { CALM, extra: v.extra });
    await page.waitForTimeout(3000);
    const hole = await page.getByTestId('desk-preview').boundingBox();
    let shots = 0;
    const state = () => page.evaluate(() => {
      const d = window.chromaglassDebug?.();
      const s = d?.settings ?? {};
      const f0 = d?.fluids?.[0];
      let rot = 0, rad = 0, mag = 0, mvx = 0, mvy = 0;
      if (f0?.readVx) {
        const vx = f0.readVx, vy = f0.readVy, N = Math.round(Math.sqrt(vx.length));
        for (let i = 0; i < vx.length; i++) {
          const x = (i % N) / N - 0.5, y = Math.floor(i / N) / N - 0.5, r = Math.hypot(x, y) || 1e-6;
          const u = vx[i], w = vy[i]; if (!Number.isFinite(u) || !Number.isFinite(w)) continue;
          rot += (x * w - y * u) / r; rad += (x * u + y * w) / r; mag += Math.hypot(u, w); mvx += u; mvy += w;
        }
      }
      const flat = {}; for (const [k, v] of Object.entries(s)) if (typeof v !== 'object') flat[k] = v;
      return {
        gov: { index: d?.governor?.index, rung: d?.governor?.rung, rungs: d?.governor?.rungs?.length, N: f0?.gpu?.N, L: f0?.gpu?.L },
        flat, spinv: JSON.stringify(d?.spin ?? null), rotc: JSON.stringify(d?.rotation?.current ?? null), plateSpin: f0?.plateSpin,
        flow: mag ? { swirl: +(rot / mag).toFixed(3), outward: +(rad / mag).toFixed(3), drift: +(Math.hypot(mvx, mvy) / mag).toFixed(3) } : null,
        tool: d?.tool?.(), take: JSON.stringify(d?.take ?? null)?.slice(0, 80),
        t: performance.now() / 1000,
        layers: (d?.fluids ?? []).map((f) => {
          const vx = f.readVx, vy = f.readVy; let sp = 0, n = 0, mx = 0;
          if (vx && vy) for (let i = 0; i < vx.length; i++) { const v = Math.hypot(vx[i], vy[i]); if (Number.isFinite(v)) { sp += v; n++; if (v > mx) mx = v; } }
          const N = Math.round(Math.sqrt(vx?.length ?? 0)); const G = 6; const m = Array(G * G).fill(0), c = Array(G * G).fill(0);
          for (let i = 0; i < (vx?.length ?? 0); i++) { const x = i % N, y = Math.floor(i / N); const k = Math.min(G - 1, Math.floor(y / N * G)) * G + Math.min(G - 1, Math.floor(x / N * G)); const v = Math.hypot(vx[i], vy[i]); if (Number.isFinite(v)) { m[k] += v; c[k]++; } }
          return [f.stepCount, f.meanDensity, f.dt, n ? sp / n : -1, mx, m.map((v, k) => v / Math.max(1, c[k]))];
        }),
        sps: d?.solver?.().stepsPerSec, auto: d?.autoEvents,
        set: [s.dyeBudget, s.evaporationRate, s.platePressure, s.airVelocity, s.automateRate, s.globalSpeed, s.surge, s.damping].map((x) => typeof x === 'number' ? +x.toFixed(4) : x),
        phrase: (() => { const p = d?.phrase?.(); return p ? { gust: +(p.gust ?? 0).toFixed(2), drive: +(p.drive ?? 0).toFixed(2), lean: +(p.lean ?? 0).toFixed(2), dt: +(p.dt ?? 0).toFixed(4) } : null; })(),
      };
    });
    const shot = async () => {
      const png = await page.screenshot({ clip: hole });
      const id = shots++;
      await page.evaluate(async ({ b64, id }) => {
        const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
        const c = new OffscreenCanvas(img.width, img.height); const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        (window.__shots ??= {})[id] = x.getImageData(0, 0, img.width, img.height);
      }, { b64: png.toString('base64'), id });
      return { id, st: await state() };
    };
    // Whole-preview mean |change| and mean signed change of brightness, and how
    // much of the preview is lit (a fade darkens; a motion moves light about).
    const diff = (a, b) => page.evaluate(({ ia, ib }) => {
      const A = window.__shots[ia], B = window.__shots[ib];
      let abs = 0, sgn = 0, litA = 0, litB = 0, sumA = 0; const n = A.width * A.height;
      for (let i = 0; i < A.data.length; i += 4) {
        const la = A.data[i] + A.data[i + 1] + A.data[i + 2], lb = B.data[i] + B.data[i + 1] + B.data[i + 2];
        abs += Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]);
        sgn += lb - la; sumA += la; if (la > 60) litA++; if (lb > 60) litB++;
      }
      return { abs: abs / n, sgn: sgn / n, bright: sumA / n, litA: litA / n, litB: litB / n };
    }, { ia: a.id, ib: b.id });
    let lastFlat = null;
    const changed = (st) => { const out = []; if (lastFlat) for (const k of new Set([...Object.keys(lastFlat), ...Object.keys(st.flat)])) if (lastFlat[k] !== st.flat[k]) out.push(`${k}:${lastFlat[k]}→${st.flat[k]}`); lastFlat = st.flat; return out.join(' '); };
    const fmt = (s) => `gov=${JSON.stringify(s.gov)} flow=${JSON.stringify(s.flow)} spin=${s.spinv} plateSpin=${s.plateSpin} rot=${s.rotc} tool=${s.tool} changed[${changed(s)}] t=${s.t.toFixed(1)} sps=${s.sps?.toFixed?.(0)} ${s.layers.map((l) => `[step ${l[0]} mean ${l[1].toFixed(3)} dt ${l[2]?.toFixed?.(4)} |v| ${l[3].toExponential(2)} max ${l[4].toExponential(2)}]`).join(' ')} phrase=${JSON.stringify(s.phrase)}`;
    console.log(`\n== ${v.name}  settings [dyeBudget evap platePressure air automate speed surge damping] = ${JSON.stringify((await state()).set)}`);
    { const g = (await state()).gov; console.log('   opened at', JSON.stringify(g), 'pinned', v.pin ? openedRung : 'no'); if (openedRung === null && v.drop) openedRung = g.index; }
    const hx = hole.x + hole.width * 0.75, hy = hole.y + hole.height * 0.75;
    for (let rep = 0; rep < (v.reps ?? 6); rep++) {
      const a = await shot(); await page.waitForTimeout(1300); const b = await shot();
      if (v.drop && rep < 4) {
        await page.mouse.move(hx, hy); await page.mouse.down();
        if (rep === 0) console.log('     hand at', JSON.stringify(await page.evaluate(() => window.chromaglassDebug?.().pointer?.())));
        for (let k = 1; k <= 6; k++) { if (!v.still) await page.mouse.move(hx + k * 2, hy + k); await page.waitForTimeout(100); }
        await page.mouse.up();
      } else {
        await page.mouse.move(hx, hy);
        for (let k = 1; k <= 6; k++) { await page.mouse.move(hx + k * 2, hy + k); await page.waitForTimeout(100); }
      }
      await page.mouse.move(hole.x + hole.width * 0.02, hole.y + hole.height * 0.02);
      await page.waitForTimeout(500);
      const c = await shot();
      const d = await diff(a, b), ch = await diff(b, c);
      console.log(`  rep ${rep + 1}${v.drop && rep < 4 ? ' (drop)' : ''}: drift |${d.abs.toFixed(1)}| signed ${d.sgn.toFixed(1)}  change |${ch.abs.toFixed(1)}| signed ${ch.sgn.toFixed(1)}  bright ${d.bright.toFixed(1)} lit ${(d.litA * 100).toFixed(1)}%→${(ch.litB * 100).toFixed(1)}%`);
      console.log(`     a ${fmt(a.st)}\n     c ${fmt(c.st)}`);
      const map = c.st.layers[0]?.[5];
      if (map) for (let y = 0; y < 6; y++) console.log('       |v| ' + map.slice(y * 6, y * 6 + 6).map((x) => x.toExponential(1).padStart(8)).join(''));
      await page.evaluate(() => { window.__shots = {}; });
    }
    await page.close();
  }
} finally {
  await browser.close();
}
process.exit(0);
