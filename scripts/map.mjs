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
  DEFAULT_OUTPUT,
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

console.log('');
const failed = checks.filter(c => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
