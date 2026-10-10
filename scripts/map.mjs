/**
 * Projection mapping, in arithmetic.
 *
 * The shapes on a wall are four corners and a projective map, and almost
 * nothing about whether that map is right can be seen from a picture: a
 * circle that is subtly the wrong ellipse, a quad whose interior is stretched
 * the wrong way, a keystone that composes in the wrong order — all of them
 * look like *a shape on a wall*, which is what makes them the kind of mistake
 * that ships. So the geometry is checked as numbers, where "the corners of the
 * unit square land on the corners of the quad" is a thing that is either true
 * or false rather than a thing that looks about right.
 *
 *   npm run map
 *
 * The pixels are `npm run wall`, which drives a browser. This is the half that
 * has no picture in it.
 */

import {
  IDENTITY_CORNERS, MAX_SURFACES, composeOntoPin, cornerPinMatrix, makeCube, makeSurface,
  normalizeOutput, normalizeSurfaces, outputIsIdentity, pointInQuad, surfaceOutline,
  DEFAULT_OUTPUT, saveOutput,
} from '../src/lib/outputConfig.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
/** A quad with real perspective in it, so nothing passes by being affine. */
const SKEW = [0.1, 0.2, 0.9, 0.05, 0.8, 0.95, 0.25, 0.7];

// ── The forward map ─────────────────────────────────────────────────
{
  const id = pointInQuad(IDENTITY_CORNERS, 0.37, 0.62);
  check('the identity quad moves nothing', id && near(id[0], 0.37) && near(id[1], 0.62),
    id ? `${id[0].toFixed(3)}, ${id[1].toFixed(3)}` : 'null');

  // The defining property: the unit square's corners are the quad's corners,
  // in the same winding. Get this wrong and every shape is rotated or mirrored
  // on the wall while still looking like a shape on a wall.
  const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
  let worst = 0;
  uv.forEach(([u, v], i) => {
    const p = pointInQuad(SKEW, u, v);
    worst = Math.max(worst, Math.abs(p[0] - SKEW[i * 2]), Math.abs(p[1] - SKEW[i * 2 + 1]));
  });
  check('the unit square’s corners land on the quad’s corners', worst < 1e-6,
    `worst ${worst.toExponential(1)}`);

  // Forward and inverse are the same map in two directions: what the panel
  // draws and what the shader samples must agree, or a shape is drawn in one
  // place and lit in another.
  const m = cornerPinMatrix(SKEW);
  const [px, py] = pointInQuad(SKEW, 0.3, 0.8);
  const w = m[2] * px + m[5] * py + m[8];
  const back = [(m[0] * px + m[3] * py + m[6]) / w, (m[1] * px + m[4] * py + m[7]) / w];
  check('the shader’s inverse undoes the panel’s forward',
    near(back[0], 0.3, 1e-5) && near(back[1], 0.8, 1e-5),
    `${back[0].toFixed(4)}, ${back[1].toFixed(4)}`);

  check('a flattened quad is refused rather than divided by',
    pointInQuad([0, 0, 1, 0, 1, 0, 0, 0], 0.5, 0.5) === null || cornerPinMatrix([0, 0, 1, 0, 1, 0, 0, 0]) === null);
}

// ── Shapes ──────────────────────────────────────────────────────────
{
  check('a rectangle is its four corners', surfaceOutline('rect', SKEW).length === 4);
  check('a triangle is three', surfaceOutline('triangle', SKEW).length === 3);
  check('a diamond is four', surfaceOutline('diamond', SKEW).length === 4);

  const ell = surfaceOutline('ellipse', SKEW);
  check('a circle is sampled, not cornered', ell.length > 20, `${ell.length} points`);

  // A circle inside a skewed quad must not reach the quad's corners — if it
  // did it would be the rectangle, which is exactly what a subtly wrong local
  // space produces and exactly what nobody notices on a wall.
  const corner = [SKEW[0], SKEW[1]];
  const nearest = Math.min(...ell.map(([x, y]) => Math.hypot(x - corner[0], y - corner[1])));
  check('a circle stays clear of its quad’s corners', nearest > 0.05,
    `nearest ${nearest.toFixed(3)}`);

  // And it must enclose the quad's own middle, so it is on the shape rather
  // than beside it.
  //
  // Not "its centroid is the middle": under a projective map the centroid of a
  // mapped boundary is *not* the image of the centre, because perspective
  // compresses the far side — a true circle drawn correctly fails that test,
  // which is what the first version of this check did. Containment is the
  // property that actually holds.
  const inside = (pt, ring) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  const mid = pointInQuad(SKEW, 0.5, 0.5);
  check('a circle encloses its quad\u2019s middle', inside(mid, ell),
    `middle ${mid[0].toFixed(3)}, ${mid[1].toFixed(3)}`);
  check('and does not enclose its quad\u2019s corner', !inside([SKEW[0], SKEW[1]], ell));

  // The triangle's apex is the top edge's middle, not a corner: the shape is
  // defined in local space, so it has to keystone with the quad.
  const tri = surfaceOutline('triangle', SKEW);
  const apex = pointInQuad(SKEW, 0.5, 0);
  check('the triangle’s apex keystones with the quad',
    near(tri[0][0], apex[0], 1e-9) && near(tri[0][1], apex[1], 1e-9));
}

// ── Composing onto the projector's keystone ─────────────────────────
{
  const s = makeSurface('rect').corners;
  check('an unpinned projector leaves a surface where it was',
    composeOntoPin(s, IDENTITY_CORNERS) === s);

  // A pin that squeezes the picture into the left half must squeeze every
  // shape with it — that is the whole reason the pin composes rather than
  // being a separate warp the shapes ignore.
  const half = [0, 0, 0.5, 0, 0.5, 1, 0, 1];
  const moved = composeOntoPin([0, 0, 1, 0, 1, 1, 0, 1], half);
  check('a pinned projector carries the shapes with it',
    moved && near(moved[2], 0.5) && near(moved[4], 0.5) && near(moved[0], 0),
    moved ? moved.map(n => n.toFixed(2)).join(' ') : 'null');

  check('a flattened pin is refused', composeOntoPin(s, [0, 0, 1, 0, 1, 0, 0, 0]) === null);
}

// ── Reading a stored config ─────────────────────────────────────────
{
  check('nothing stored is no surfaces', normalizeSurfaces(undefined).length === 0);
  check('rubbish in the list is dropped, not repaired',
    normalizeSurfaces([{ corners: [1, 2] }, null, 'x', { corners: [0, 0, 1, 0, 1, 1, 0, 1] }]).length === 1);

  const [one] = normalizeSurfaces([{ corners: [0, 0, 1, 0, 1, 1, 0, 1], shape: 'hexagon', opacity: 9, feather: -3 }]);
  check('an unknown shape falls back to a rectangle', one.shape === 'rect');
  check('opacity and edge are held in range', one.opacity === 1 && one.feather === 0,
    `opacity ${one.opacity}, edge ${one.feather}`);
  check('a surface with no id is given one', typeof one.id === 'string' && one.id.length > 0);

  const many = normalizeSurfaces(Array.from({ length: MAX_SURFACES + 9 }, () => ({ corners: [0, 0, 1, 0, 1, 1, 0, 1] })));
  check('the list has a ceiling', many.length === MAX_SURFACES, `${many.length}`);

  check('an old config with no surfaces still reads', normalizeOutput({ gain: 1.2 }).surfaces.length === 0);
}

// ── When the pass is built at all ───────────────────────────────────
{
  check('a plain config still costs nothing', outputIsIdentity(DEFAULT_OUTPUT));
  check('one shape is enough to need the pass',
    !outputIsIdentity({ ...DEFAULT_OUTPUT, surfaces: [makeSurface('rect')] }));
  // The wall test (8e) is drawn by the pass, so it needs it while it is up,
  // and not once Identify has run out; and it never comes back in from a
  // stored or sent config, where it would open a show on a test pattern.
  check('the test pattern and a running Identify need the pass; one run out does not',
    !outputIsIdentity({ ...DEFAULT_OUTPUT, test: { pattern: true, identifyUntil: 0 } })
    && !outputIsIdentity({ ...DEFAULT_OUTPUT, test: { pattern: false, identifyUntil: Date.now() + 10_000 } })
    && outputIsIdentity({ ...DEFAULT_OUTPUT, test: { pattern: false, identifyUntil: Date.now() - 1 } }));
  check('a config read back never carries a wall test', normalizeOutput({ ...DEFAULT_OUTPUT, test: { pattern: true, identifyUntil: 0 } }).test === undefined);
  // And it is never written: saved with the pattern up, what is stored has no test in it
  // but keeps the rest (the control: the shape saved beside it is there).
  {
    const stored = new Map();
    const was = globalThis.localStorage;
    globalThis.localStorage = { setItem: (k, v) => stored.set(k, v), getItem: (k) => stored.get(k) ?? null, removeItem: (k) => stored.delete(k) };
    saveOutput({ ...DEFAULT_OUTPUT, surfaces: [makeSurface('rect')], test: { pattern: true, identifyUntil: Date.now() + 10_000 } });
    globalThis.localStorage = was;
    const [text = ''] = [...stored.values()];
    const back = text ? JSON.parse(text) : {};
    check('a config saved with the test pattern up is stored without it', !!text && !('test' in back) && back.surfaces?.length === 1,
      text ? `${text.length} chars, ${back.surfaces?.length ?? 0} shape${'test' in back ? ', test stored' : ''}` : 'nothing stored');
  }
}

// ── The made shapes ─────────────────────────────────────────────────
{
  const a = makeSurface('rect', 0), b = makeSurface('rect', 1);
  check('a second shape does not hide under the first', a.corners[0] !== b.corners[0],
    `${a.corners[0]} against ${b.corners[0]}`);
  check('every shape gets its own id', a.id !== b.id);

  const cube = makeCube();
  check('a cube is three faces', cube.length === 3);
  check('the faces have their own ids', new Set(cube.map(f => f.id)).size === 3);
  check('the faces show different parts of the plate',
    new Set(cube.map(f => f.src[0])).size === 3, cube.map(f => f.src[0].toFixed(2)).join(' '));
  // A face with no area is a face nobody can grab.
  const areas = cube.map(f => {
    let a2 = 0;
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      a2 += f.corners[i * 2] * f.corners[j * 2 + 1] - f.corners[j * 2] * f.corners[i * 2 + 1];
    }
    return Math.abs(a2 / 2);
  });
  check('every face has area', areas.every(v => v > 0.002), areas.map(v => v.toFixed(4)).join(' '));
}

// ── What a surface shows (PLAN.md §16b) ─────────────────────────────
/*
  A surface picks its source: the wall (the finished frame, as always), the
  front plate alone, the back plate alone or the film alone. What has to hold
  without a GPU: a stored setup opens as it was (every surface on the wall,
  nothing extra drawn), a name this build does not know falls back to the
  wall, the source reaches the shader's slot for that quad and not its
  neighbour's, only enabled and visible surfaces ask for a picture to be
  drawn, and each source takes out exactly the rows it says. The pictures
  themselves are `npm run mixer` (the lab) and `npm run wall` (the Mac).
*/
{
  const { build } = await import('esbuild');
  const { tmpdir } = await import('node:os');
  const { join, dirname } = await import('node:path');
  const { rmSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const out = join(tmpdir(), `map-sources-${process.pid}.mjs`);
  await build({
    stdin: {
      contents: `
        export { fillOutputUniforms, SOURCE_INDEX, BLEND_INDEX } from './src/gpu/output.ts';
        export { OUTPUT_WGSL } from './src/gpu/wgsl/output.ts';
        export { UniformPack } from './src/gpu/uniforms.ts';
        export { OUTPUT_LAYOUT } from './src/gpu/wgsl/outputFields.ts';
        export { sourceSettings, SOURCE_OFF } from './src/lib/plateSources.ts';
        export { sourcesAskedFor, SURFACE_SOURCES } from './src/lib/outputConfig.ts';
        export { MIX_SOURCE_INFO } from './src/lib/mixer.ts';
        export { DEFAULT_SETTINGS } from './src/types.ts';
      `,
      resolveDir: root, loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
  });
  // The output pass's module names WebGPU's usage flags where it is loaded
  // (through gpu/kit.ts); node has no WebGPU, and nothing here draws, so the
  // flags are stood in for with the spec's own bit values.
  globalThis.GPUTextureUsage ??= { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };
  globalThis.GPUBufferUsage ??= { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512 };
  globalThis.GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
  globalThis.GPUMapMode ??= { READ: 1, WRITE: 2 };
  const m = await import(out);
  rmSync(out, { force: true });

  const stored = normalizeSurfaces([{ corners: SKEW }, { corners: SKEW, source: 'projector 3' }, { corners: SKEW, source: 'back' }]);
  check('a stored surface with no source shows the wall, a name this build does not know too, and a known one is kept',
    stored[0].source === 'wall' && stored[1].source === 'wall' && stored[2].source === 'back',
    stored.map(x => x.source).join(', '));
  check('a new surface and a cube\'s faces show the wall',
    makeSurface().source === 'wall' && makeCube().every(f => f.source === 'wall'));

  const cfg = (surfaces) => normalizeOutput({ ...DEFAULT_OUTPUT, surfaces });
  const quad = (x, source, extra = {}) => ({ corners: [x, 0.1, x + 0.2, 0.1, x + 0.2, 0.9, x, 0.9], source, ...extra });
  check('with every surface on the wall nothing extra is asked for',
    m.sourcesAskedFor(cfg([quad(0, 'wall'), quad(0.3, 'wall')])).length === 0 && m.sourcesAskedFor(DEFAULT_OUTPUT).length === 0);
  const asked = m.sourcesAskedFor(cfg([quad(0, 'film'), quad(0.25, 'back'), quad(0.5, 'back'), quad(0.75, 'front', { enabled: false })]));
  check('each source asked for once, in a fixed order, and a switched-off surface asks for nothing',
    asked.join(' ') === 'back film', asked.join(' '));
  check('and a surface at no opacity asks for nothing either',
    m.sourcesAskedFor(cfg([quad(0, 'front', { opacity: 0 })])).length === 0);

  // The source goes into the quad's own slot. Four surfaces, four sources,
  // the second switched off so the slots and the list disagree: a writer
  // that indexed by the list, not by the quads drawn, reads wrong here.
  const pack = new m.UniformPack(m.OUTPUT_LAYOUT);
  const n = m.fillOutputUniforms(pack, cfg([quad(0, 'back'), quad(0.25, 'front', { enabled: false }), quad(0.5, 'film'), quad(0.75, 'wall')]), 800, 600);
  const form = pack.get('form');
  const got = [0, 1, 2].map(i => form[i * 4 + 3]);
  check('the shader is told each quad\'s source in that quad\'s slot (0 wall, 1 front, 2 back, 3 film)',
    n === 3 && got.join(' ') === `${m.SOURCE_INDEX.back} ${m.SOURCE_INDEX.film} ${m.SOURCE_INDEX.wall}` && m.SOURCE_INDEX.front === 1 && m.SOURCE_INDEX.back === 2 && m.SOURCE_INDEX.film === 3,
    `${n} quads, sources ${got.join(' ')}`);

  /*
    How each surface's light meets the wall (§16c): laid over, as every
    surface was, unless it is set to add as a beam; and that reaches the
    quad's own slot, with the count of quads the beams search for the
    others they cross. The light itself is `npm run beams`.
  */
  {
    const kept = normalizeSurfaces([{ corners: SKEW }, { corners: SKEW, blend: 'screen' }, { corners: SKEW, blend: 'add' }]);
    check('a stored surface with no blend is laid over, one this build does not know too, and an add is kept',
      kept.map(x => x.blend).join(' ') === 'over over add' && makeSurface().blend === 'over' && makeCube().every(f => f.blend === 'over'),
      kept.map(x => x.blend).join(' '));
    const lp = new m.UniformPack(m.OUTPUT_LAYOUT);
    // Four beams first, so a slot the three-quad frame after leaves unwritten
    // still says add, and the check below sees it.
    m.fillOutputUniforms(lp, cfg([0, 0.25, 0.5, 0.75].map(x => quad(x, 'wall', { blend: 'add' }))), 800, 600);
    const nq = m.fillOutputUniforms(lp, cfg([quad(0, 'wall', { blend: 'add' }), quad(0.25, 'wall', { enabled: false, blend: 'add' }), quad(0.5, 'front'), quad(0.75, 'back', { blend: 'add' })]), 800, 600);
    const lay = lp.get('lay');
    const slots = [0, 1, 2].map(i => lay[i * 4]);
    check('the shader is told each quad\'s blend in that quad\'s slot (0 over, 1 add), and how many quads there are',
      nq === 3 && slots.join(' ') === `${m.BLEND_INDEX.add} ${m.BLEND_INDEX.over} ${m.BLEND_INDEX.add}` && m.BLEND_INDEX.over === 0 && m.BLEND_INDEX.add === 1
      && lp.get('quads')[0] === 3 && lay[3 * 4] === 0,
      `${nq} quads, blends ${slots.join(' ')}, count ${lp.get('quads')[0]}`);
  }

  /*
    And that slot reaches that texture: the shader's branch on the slot's
    number to a texture variable, that variable's binding, and the binding
    the output pass puts each source's picture at. Read from the two sources
    themselves, because no picture here can see it: the lab reads each
    source's texture directly, and two projectors with front and back
    swapped are, to the Mac's check, as different as the right way round.
  */
  {
    const { readFileSync } = await import('node:fs');
    const wgsl = m.OUTPUT_WGSL;
    const ts = readFileSync(join(root, 'src/gpu/output.ts'), 'utf8');
    const varAt = Object.fromEntries([...wgsl.matchAll(/which == (\d+)\) \{ col = textureSampleLevel\((\w+),/g)].map(x => [Number(x[1]), x[2]]));
    const bindingOf = Object.fromEntries([...wgsl.matchAll(/@binding\((\d+)\) var (\w+): texture_2d/g)].map(x => [x[2], Number(x[1])]));
    const kindAt = Object.fromEntries([...ts.matchAll(/binding: (\d+), resource: this\.bound\('(\w+)'\)/g)].map(x => [Number(x[1]), x[2]]));
    const routes = ['front', 'back', 'film'].map(kind => {
      const n = m.SOURCE_INDEX[kind];
      const v = varAt[n];
      return { kind, n, v, reaches: kindAt[bindingOf[v]] };
    });
    check('each source\'s slot number reaches that source\'s picture: the shader\'s branch, its binding, the texture bound there',
      routes.every(r => r.reaches === r.kind) && Object.keys(varAt).length === 3 && !varAt[m.SOURCE_INDEX.wall],
      routes.map(r => `${r.kind}: ${r.n} → ${r.v} → ${r.reaches}`).join(' · '));
  }

  /*
    Each source takes out the rows it names and nothing else, by the Mixer's
    own level keys, so a renamed level cannot leave a row on. Against a base
    in which every number is its own non-zero value and every switch is
    thrown from its default, so a key a source quietly set to 0 (or to
    anything) cannot hide behind a default that was 0 already.
  */
  const base = Object.fromEntries(Object.entries(m.DEFAULT_SETTINGS).map(([k, v], i) =>
    [k, typeof v === 'number' ? 0.37 + i * 1e-3 : typeof v === 'boolean' ? !v : v]));
  const level = (id) => m.MIX_SOURCE_INFO[id].level;
  const zeroed = (kind) => {
    const got = m.sourceSettings(kind, base);
    return [...new Set([...Object.keys(base), ...Object.keys(got)])].filter(k => got[k] !== base[k]).sort().join(' ');
  };
  check('the front plate alone takes out the back plate and the film, and nothing else',
    zeroed('front') === [level('back'), level('film')].sort().join(' '), zeroed('front'));
  check('the back plate alone takes out the front plate, the film and the logo (which goes out on the front plate\'s projector), and nothing else',
    zeroed('back') === [level('front'), level('film'), level('mark')].sort().join(' '), zeroed('back'));
  // The lamp ground too: on a look on the lamp the film alone would otherwise
  // be the bare lamp with the film over it (PLAN 18b-1).
  check('the film alone takes out both plates, the lamp rows, the logo and the lamp ground, and nothing else',
    zeroed('film') === [...['front', 'back', 'led', 'gel', 'lumia', 'mark'].map(level), 'lampGround'].sort().join(' '), zeroed('film'));
  check('and none of them touches the dimmer, so the dimmer and a blackout reach every projector',
    ['front', 'back', 'film'].every(k => m.sourceSettings(k, { ...base, dimmer: 0.37 }).dimmer === 0.37));
  // Multiply over the black under the film alone is black: the film alone draws a Multiply film as Add, and only it.
  const blends = ['own', 'screen', 'add', 'multiply', 'key'].map(b => [b, m.sourceSettings('film', { ...base, filmBlend: b }).filmBlend]);
  check('the film alone draws a film row on Multiply as Add, the frame itself, and keeps every other blend',
    blends.every(([b, got]) => got === (b === 'multiply' ? 'add' : b))
    && ['front', 'back'].every(k => m.sourceSettings(k, { ...base, filmBlend: 'multiply' }).filmBlend === 'multiply'),
    blends.map(([b, got]) => `${b} → ${got}`).join(' · '));
}

console.log('');
const failed = checks.filter(c => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
