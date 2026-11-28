import { CARRY_KERNELS } from './carry';
import { HEAD, PACKED, THIN_FACE, W } from './shared';

/*
  The plate's dye carried as its two liquids' shares in one pass (PLAN
  38w-33), where PLAN 38w-29 and 38w-32 carried them in four.

  What 38w-29 found and why the dye is split at all: with Oil Bodies on, the
  plate's dye holds both liquids' colours and the oil carries its own share
  of it beside (bodyPartition reads the water's share as the dye less the
  oil's). The oil itself moves with superbee and no corner; the water's
  colour with van Leer's MC and the corner's transverse share. Carried as
  one field the oil's colour went the water's way, its edge parted from the
  oil's a little each substep, and bodyPartition handed what strayed to the
  water: Classic's colours washed out under a hand. So the dye was split
  (bodyWater, the dye less the oil's share), the water's share carried the
  water's way, the oil's share carried the oil's way, and the two joined
  (bodyJoin): `npm run oilride`, 0.54% of the oil's share lost in 300 steps
  before, none after.

  What that cost: two pointwise passes a step round the carry, and the oil's
  share carried through the faces a second time. The second is the dear one.
  bodyAdvectPairSub's note (wgsl/fluid.ts, PLAN 18d-11a) measured it: what
  a thin gap's carry pays for is the face, not the field (thinFaceVel reads
  the velocity, the gap and the mobility on both sides and the solve's P
  across three faces, a dozen loads a face), so a second field through the
  same faces costs half what carrying it alone does. The water's share and
  the oil's go through exactly the same faces in exactly the same substeps;
  only their limiters and the corner differ.

  So both go through each face once, here, and the split and the join go
  into the carry's own substeps. The first substep reads the whole dye and
  the oil's share and takes the water's share as the dye less the oil's at
  each cell it reads (`mx`, which is bodyWater); the rest read the water's
  share where the substep before left it, in a texture of its own (the
  dye's `water`, fluid/passes.ts), one load a cell as the single carries
  read. Every substep writes the water's share, the oil's, and the whole
  dye as their sum (bodyJoin) into the dye's next texture, so whichever
  substep is the step's last (carryPlan decides on the GPU, and a pair it
  does not need runs no workgroups) has left the joined dye there. The
  split and the join are exactly bodyWater's and bodyJoin's sums, on the
  same half floats, so the fields are the old way's to the rounding of the
  Courant number's products: `npm run splitcarry` carries the same plate
  both ways and asks for the same fields and less time.

  Measured on the way (SwiftShader, 128², a step's share carry repeated on
  the queue): split in every substep, reading the dye less the oil's share
  at every neighbour (two loads for each of the water's reads, about sixty
  a cell), 104 to 110 ms against 86 to 90 ms apart, slower than the four
  passes it replaced; this, 70 to 76 ms against 89 to 92 (0.78 to 0.83),
  and the fields the same to the bit but for the glass's drift's rounding.

  Which share a function reads is its first argument, `t`: 0 the water's,
  1 the oil's, a constant at every call, and `monomorph` (below) writes
  each share's functions out on their own, so nothing branches on it. A
  share index where the pair carry passes a texture lets the air's room
  (airLiquid in wgsl/fluid.ts) wrap this kernel as it wraps the pair, its
  donor reads going through `mx` like the faces'.
*/
/** The two shares' reads: on the first substep the water's is split from the dye; after, it is its own texture. */
function shares(first: boolean): string {
  const water = first
    ? `  let d = max(textureLoad(src, q, 0), vec4f(0.0));
  return d - clamp(textureLoad(oil, q, 0), vec4f(0.0), d);`
    : '  return textureLoad(src, q, 0);';
  return /* wgsl */ `
// Share t at q: the oil's (1) as the oil carries it, or the water's (0)${first ? ', the dye less the oil\'s (bodyWater: never more of the oil\'s than the dye holds)' : ''}.
fn mx(t: i32, p: vec2i, n: i32) -> vec4f {
  let q = clamp(p, vec2i(0), vec2i(n - 1));
  if (t == 1) { return textureLoad(oil, q, 0); }
${water}
}
// The water's limiter, van Leer's MC (bodyAdvect), and the oil's, superbee (bodyAdvectSharp, mixAdvect's for the oil).
fn mcSlope(a: vec4f, b: vec4f) -> vec4f {
  let l = min(min(2.0 * abs(a), 2.0 * abs(b)), 0.5 * abs(a + b));
  return select(vec4f(0.0), sign(a) * l, a * b > vec4f(0.0));
}
fn sb1(a: f32, b: f32) -> f32 {
  if (a * b <= 0.0) { return 0.0; }
  return sign(a) * max(min(2.0 * abs(a), abs(b)), min(abs(a), 2.0 * abs(b)));
}
fn mm(t: i32, a: vec4f, b: vec4f) -> vec4f {
  if (t == 1) { return vec4f(sb1(a.x, b.x), sb1(a.y, b.y), sb1(a.z, b.z), sb1(a.w, b.w)); }
  return mcSlope(a, b);
}
`;
}

/** A share carried from a cell's four faces at their Courant numbers, floored at 0 as each carry floors. */
const CARRIED = /* wgsl */ `
fn carried(t: i32, p: vec2i, ce: f32, cw: f32, cn: f32, cs: f32, n: i32) -> vec4f {
  let x = vec2i(1, 0);
  let y = vec2i(0, 1);
  let d = flux(t, p, x, ce, n) - flux(t, p - x, x, cw, n) + flux(t, p, y, cn, n) - flux(t, p - y, y, cs, n);
  let out = max(mx(t, p, n) - d, vec4f(0.0));
  return select(vec4f(0.0), out, finite4(out));
}`;

/*
  On a thin gap, in the substeps carryPlan chose (bodyAdvectSub's and
  bodyAdvectSharpSub's), through the faces the thin solve made conserve
  liquid. Bound as bodyAdvectPairSub is, the oil's share in the second
  field's place, and the whole dye after it (`whole`). The water's share
  takes the corner's transverse share (PLAN 18a-8) and the oil's does not,
  as their own carries do.
*/
function splitSub(first: boolean): string {
  return `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var vel: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<DYE_FORMAT, write>;
@group(0) @binding(5) var<storage, read> flow: array<vec4f>;
@group(0) @binding(6) var<storage, read> sub: array<f32>;
@group(0) @binding(7) var sq: texture_2d<f32>;
@group(0) @binding(8) var<storage, read> mob: array<f32>;
@group(0) @binding(9) var oil: texture_2d<f32>;
@group(0) @binding(10) var dst2: texture_storage_2d<DYE_FORMAT, write>;
@group(0) @binding(11) var whole: texture_storage_2d<DYE_FORMAT, write>;
${THIN_FACE}
${shares(first)}
// The corner's transverse share of the donor d (ACROSS in wgsl/fluid/carry.ts) for the water's share; the oil's carry has none.
fn acrossOf(t: i32, d: vec2i, side: vec2i, k: f32, n: i32) -> vec4f {
  if (t == 1) { return vec4f(0.0); }
  let ct = clamp(dot(textureLoad(vel, d, 0).xy, vec2f(side)) * k, -0.45, 0.45);
  let up = select(mx(0, d + side, n) - mx(0, d, n), mx(0, d, n) - mx(0, d - side, n), ct >= 0.0);
  return 0.5 * ct * up;
}
// The share of a cell crossing the face a → a + e this substep, as the single carries reckon it; nothing through the grid's wall.
fn courant(a: vec2i, e: vec2i, n: i32) -> f32 {
  let b = a + e;
  if (b.x < 0 || b.y < 0 || b.x >= n || b.y >= n || a.x < 0 || a.y < 0 || a.x >= n || a.y >= n) { return 0.0; }
  let ve = thinFaceVel(a, e, n);
  let k = A.b.y * sub[0] * f32(n);
  return clamp(ve * k, -0.45, 0.45);
}
fn flux(t: i32, a: vec2i, e: vec2i, c: f32, n: i32) -> vec4f {
  let b = a + e;
  let side = vec2i(e.y, e.x);
  let k = A.b.y * sub[0] * f32(n);
  if (c >= 0.0) {
    let s = mm(t, mx(t, a, n) - mx(t, a - e, n), mx(t, b, n) - mx(t, a, n));
    return c * (mx(t, a, n) + 0.5 * (1.0 - c) * s - acrossOf(t, a, side, k, n));
  }
  let s = mm(t, mx(t, b, n) - mx(t, a, n), mx(t, b + e, n) - mx(t, b, n));
  return c * (mx(t, b, n) - 0.5 * (1.0 + c) * s - acrossOf(t, b, side, k, n));
}
${CARRIED}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let ce = courant(p, vec2i(1, 0), n);
  let cw = courant(p - vec2i(1, 0), vec2i(1, 0), n);
  let cn = courant(p, vec2i(0, 1), n);
  let cs = courant(p - vec2i(0, 1), vec2i(0, 1), n);
  let w = carried(0, p, ce, cw, cn, cs, n);
  let o = carried(1, p, ce, cw, cn, cs, n);
  textureStore(dst, p, w);
  textureStore(dst2, p, o);
  textureStore(whole, p, w + o);
}`;
}

/*
  On the old plate (Thin Gap off), in one step through bodyAdvect's own
  faces (the cells' velocities and the packed pressure's Rhie–Chow term),
  neither share with the corner, as there. Bound as runPressed2 binds: the
  dye and the oil's share, the velocity, the two written, the pressure.
*/
const SPLIT_OLD = `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var oil: texture_2d<f32>;
@group(0) @binding(4) var vel: texture_2d<f32>;
@group(0) @binding(5) var dst: texture_storage_2d<DYE_FORMAT, write>;
@group(0) @binding(6) var dst2: texture_storage_2d<DYE_FORMAT, write>;
@group(0) @binding(7) var<storage, read> pr: array<f32>;
${PACKED}
${shares(true)}
fn courant(a: vec2i, e: vec2i, n: i32) -> f32 {
  let b = a + e;
  if (b.x < 0 || b.y < 0 || b.x >= n || b.y >= n || a.x < 0 || a.y < 0 || a.x >= n || a.y >= n) { return 0.0; }
  let t = vec2i(e.y, e.x);
  let va = textureLoad(vel, clamp(a - t, vec2i(0), vec2i(n - 1)), 0).xy + 2.0 * textureLoad(vel, a, 0).xy + textureLoad(vel, clamp(a + t, vec2i(0), vec2i(n - 1)), 0).xy;
  let vb = textureLoad(vel, clamp(b - t, vec2i(0), vec2i(n - 1)), 0).xy + 2.0 * textureLoad(vel, b, 0).xy + textureLoad(vel, clamp(b + t, vec2i(0), vec2i(n - 1)), 0).xy;
  let pa = packedAt(a.x, a.y, n);
  let pb = packedAt(b.x, b.y, n);
  let wide = 0.25 * ((pb - packedAt(a.x - e.x, a.y - e.y, n)) + (packedAt(b.x + e.x, b.y + e.y, n) - pa));
  let ve = dot(va + vb, vec2f(e)) * 0.125 + (wide - (pb - pa)) * f32(n) * A.b.z;
  let k = A.b.y * f32(n);
  return clamp(ve * k, -0.45, 0.45);
}
fn flux(t: i32, a: vec2i, e: vec2i, c: f32, n: i32) -> vec4f {
  let b = a + e;
  if (c >= 0.0) {
    let s = mm(t, mx(t, a, n) - mx(t, a - e, n), mx(t, b, n) - mx(t, a, n));
    return c * (mx(t, a, n) + 0.5 * (1.0 - c) * s);
  }
  let s = mm(t, mx(t, b, n) - mx(t, a, n), mx(t, b + e, n) - mx(t, b, n));
  return c * (mx(t, b, n) - 0.5 * (1.0 + c) * s);
}
${CARRIED}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let ce = courant(p, vec2i(1, 0), n);
  let cw = courant(p - vec2i(1, 0), vec2i(1, 0), n);
  let cn = courant(p, vec2i(0, 1), n);
  let cs = courant(p - vec2i(0, 1), vec2i(0, 1), n);
  let w = carried(0, p, ce, cw, cn, cs, n);
  let o = carried(1, p, ce, cw, cn, cs, n);
  textureStore(dst, p, w + o);
  textureStore(dst2, p, o);
}`;

/*
  And the passes that run on each carried field after its substeps, for
  both shares at once: the glass's drift (driftShift, shiftCarried) and,
  with air, what a dry core sheds to the liquid at its rim (airShed). Each
  is nonlinear in its field (driftShift's fraction is a limited flux, and
  airShed floors what a dry cell keeps at none), so the whole dye's result
  is not the sum of its shares', and the old way ran each on each share
  apart before the join. `perShare` turns such a kernel into one that runs
  its own code once on each share, read through the same split as `mx`,
  and writes the dye as their sum and the oil's share beside it: every
  `textureLoad(src, …)` becomes `share(…)`, the share being a
  `var<private> which` so the borrowed text is left as it is (these run
  once a step, not once a substep), and its main becomes a function of the
  cell. Bound as run2 binds: the dye, the oil's share, then what the kernel
  read after its field, the two written.

  Measured on the air's plate before airShed was split (`npm run
  splitcarry -- --plate=air`): the whole dye 0.27% of its largest cell
  apart from the old way where a bubble's rim floored a share.
*/
export function perShare(src: string, name: string): string {
  const head = `${W} fn main(@builtin(global_invocation_id) id: vec3u) {\n  if (!inGrid(id)) { return; }\n`;
  const store = /\n  textureStore\(dst, p, ([^\n]+)\);\n\}$/;
  const bindings = [...src.matchAll(/@group\(0\) @binding\((\d+)\) var ([^\n]*)\n/g)];
  const last = bindings[bindings.length - 1];
  if (src.split(head).length !== 2 || !store.test(src) || !src.includes('@group(0) @binding(2) var src: texture_2d<f32>;')
    || !last || !/^dst: texture_storage_2d<DYE_FORMAT, write>;$/.test(last[2]) || !src.includes('let p = vec2i(id.xy);')) {
    throw new Error(`${name} cannot take ${name.replace(/Split$/, '')}: its field, its target, its main or its store moved`);
  }
  // Every binding after the field one along, the oil's share in its place, and the second target after the first.
  const bound = src.replace(/@group\(0\) @binding\((\d+)\) var /g, (m, k) => (Number(k) >= 3 ? `@group(0) @binding(${Number(k) + 1}) var ` : m))
    .replace('@group(0) @binding(2) var src: texture_2d<f32>;\n', `@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var oil: texture_2d<f32>;
var<private> which: i32;
// The share \`which\` names at q, as mx reads it in the carry.
fn share(q: vec2i, l: i32) -> vec4f {
  let o = textureLoad(oil, q, l);
  if (which == 1) { return o; }
  let t = max(textureLoad(src, q, l), vec4f(0.0));
  return t - clamp(o, vec4f(0.0), t);
}
`);
  const out = Number(last[1]) + 2;
  const withDst2 = bound.replace(/(@group\(0\) @binding\(\d+\) var dst: texture_storage_2d<DYE_FORMAT, write>;\n)/, `$1@group(0) @binding(${out}) var dst2: texture_storage_2d<DYE_FORMAT, write>;\n`);
  // The loads in share itself read the textures by name; every other read of the field goes through it.
  const [pre, post] = withDst2.split('fn share(q: vec2i, l: i32) -> vec4f {');
  const shareEnd = post.indexOf('\n}\n') + 3;
  const body = post.slice(shareEnd).replaceAll('textureLoad(src, ', 'share(');
  // A read of the field any other way would see the whole dye in both shares, and a second store would be written once a share: neither may pass quietly.
  if (body.includes('textureLoad(src') || src.split('textureStore(dst,').length !== 2) {
    throw new Error(`${name}: ${name.replace(/Split$/, '')} reads its field other than as textureLoad(src, …) or stores it more than once`);
  }
  return `${pre}fn share(q: vec2i, l: i32) -> vec4f {${post.slice(0, shareEnd)}${body}`
    .replace(head, 'fn oneShare(id: vec3u) -> vec4f {\n')
    .replace(store, '\n  return $1;\n}') + `
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  which = 0;
  let w = oneShare(id);
  which = 1;
  let o = oneShare(id);
  textureStore(dst, p, w + o);
  textureStore(dst2, p, o);
}`;
}

/*
  Each share's functions written out on their own (`monomorph`): every
  top-level function whose first argument is the share, `t: i32`, made
  twice, `name_0` and `name_1`, with `t` a constant inside, and every
  call naming the share by `t`, 0 or 1 sent to its copy. Run last, on the
  kernel as the air's room left it, so its donor functions are split too.

  Why not leave the share an argument: measured under SwiftShader at 128²
  (`npm run splitcarry`), one pass with the share an argument took 110 ms
  a step's carry against 86 ms apart; written out, 104 ms: the branches
  were not the cost (the two loads of every water read were, above), but
  nothing is left to branch on.
*/
export function monomorph(src: string, name: string): string {
  const head = /^fn (\w+)\(t: i32, ([^)]*)\) -> ([^{]+) \{\n/gm;
  const fns = [...src.matchAll(head)];
  if (!fns.length) throw new Error(`${name} has no function of its share`);
  const names = fns.map((m) => m[1]);
  const calls = new RegExp(`\\b(${names.join('|')})\\((t|0|1), `, 'g');
  let out = src;
  for (const m of fns) {
    const start = out.indexOf(m[0]);
    const end = out.indexOf('\n}\n', start) + 3;
    if (start < 0 || end < 3) throw new Error(`${name}: ${m[1]} has no end`);
    const body = out.slice(start + m[0].length, end);
    const copy = (k: number) => `fn ${m[1]}_${k}(${m[2]}) -> ${m[3]} {\n  const t = ${k};\n${body.replace(calls, (_c, f, a) => `${f}_${a === 't' ? k : a}(`)}`;
    out = out.slice(0, start) + copy(0) + copy(1) + out.slice(end);
  }
  // And the calls from outside them (main's).
  return out.replace(calls, (_c, f, a) => {
    if (a === 't') throw new Error(`${name}: ${f} called with the share outside a function of it`);
    return `${f}_${a}(`;
  });
}

/**
 * The split carry's kernels (PLAN 38w-33): `bodyAdvectSplitSub` and
 * `bodyAdvectSplitOnSub` (the thin gap's first substep and the rest, which
 * wgsl/fluid.ts also wraps in the air's room as their Air kernels and then
 * writes out per share, `monomorph`), `bodyAdvectSplit` (the old plate's) and
 * `driftShiftSplit` (the glass's drift of both shares).
 */
export const SPLIT_KERNELS: Record<string, string> = {
  bodyAdvectSplitSub: splitSub(true),
  bodyAdvectSplitOnSub: splitSub(false),
  bodyAdvectSplit: monomorph(SPLIT_OLD, 'bodyAdvectSplit'),
  driftShiftSplit: perShare(CARRY_KERNELS.driftShift, 'driftShiftSplit'),
};
