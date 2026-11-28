#!/usr/bin/env node
/**
 * `npm run structuretargets -- <reference> <ours>`: ChromaGlass's layer on
 * the watch tool's structure and light read (scripts/watchstructure.mjs,
 * PLAN 47q). The read itself is public and says nothing about liquids or
 * this app; this turns the gaps between a reference's read and one of our
 * takes into physics targets: which phenomenon makes the reference's number,
 * and which control or plan item gives the plate the same phenomenon.
 *
 * Why (the owner, 2026-11-28): a reference film's read is only useful if it
 * says what to build. "Theirs has 0.95 double-line edges, ours 0.08" is a
 * number; "their borders are Plateau borders, concave liquid prisms whose two
 * faces refract the lamp into two bright lines around a clear core, and ours
 * are drawn as one soft line" is a target, and the owner's standing rule is
 * that the physics stays at the core. Each rule below names the phenomenon
 * first and the control second, and fires only on a gap big enough to see.
 *
 * Each argument is a structure.json (from `node scripts/watchstructure.mjs
 * --out`), a design.json from a watch (its `structure`), or a folder holding
 * either. Not shipped with reelreader (its name keeps it out of the build).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const at = (o, k) => k.split('.').reduce((v, p) => (v == null ? null : v[p]), o);
const f = (x, d = 2) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(d));

export function loadRead(p) {
  let file = p;
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) file = ['structure.json', 'design.json'].map(x => path.join(p, x)).find(fs.existsSync);
  if (!file || !fs.existsSync(file)) throw new Error(`no structure.json or design.json at ${p}`);
  const doc = JSON.parse(fs.readFileSync(file, 'utf8')), read = doc.structure ?? doc;
  if (!read.cells && !read.light) throw new Error(`${file} holds no structure read (watch it again with this version of the tool)`);
  return { name: doc.title ?? doc.file ?? path.basename(p), read };
}

/**
 * The rules: [key, label, when(ref, ours) → true where the gap matters,
 * the phenomenon, the ChromaGlass target]. `when` gets the two values.
 */
export const RULES = [
  ['cells.diam', 'cell size (% of width)', (r, o) => r && o && o / r > 1.3,
    'A foam\'s cell size is the bubbles\' volume; coarsening (gas diffusing from small cells to big ones) grows it over time.',
    'Smaller cells: PLAN 47z-8 (a cell about fifty grid cells across), and the foam looks\' cell count.'],
  ['cells.angleDev', 'junction angles off 120° (°)', (r, o) => r != null && o != null && o - r > 6,
    'Plateau\'s laws: films meet in threes at 120° where their tensions balance; a foam relaxes to them within a second.',
    'Let films relax to 120°: PLAN 47z-5 (Plateau\'s laws in the foam solve).'],
  ['cells.borderShare', 'border share of the frame (liquid fraction)', (r, o) => r != null && o != null && Math.abs(o - r) > 0.15,
    'The liquid fraction: a wet foam (over about 10% liquid) has thick Plateau borders and rounded cells, a dry one thin films and polygons.',
    'Match the border width to the reference\'s liquid fraction (the foam look\'s border width, PLAN 47z-5).'],
  ['edges.types.double', 'double-line edges', (r, o) => r != null && o != null && r >= 0.3 && o < r / 2,
    'A Plateau border is a concave liquid prism: seen from above, its two curved faces refract the lamp into two bright lines around a clear core.',
    'Draw borders as refracting menisci, not one line: 47b\'s dark field with glassy borders (the thread "Make our bubbles look real").'],
  ['edges.types.halo', 'halo edges', (r, o) => r != null && o != null && o - r > 0.15,
    'An edge in focus that refracts does not ring with dark fringes either side; a halo is defocus or a drawn outline glow.',
    'Take out the outline glow around forms; let the edge come from refraction and focus (47d).'],
  ['edges.width', 'edge width (% of width)', (r, o) => r && o && o / r > 1.5,
    'Oil and soap edges in focus are a few microns of meniscus: sharp at any macro scale.',
    'Finer edges: the closeup\'s fine window (PLAN 47a) and the projector\'s focus (§51).'],
  ['light.darkField', 'dark-field index', (r, o) => r != null && o != null && r > 0.25 && o < r - 0.2,
    'Dark-field lighting: the lamp outside the lens\'s cone, so only light bent by an edge reaches the camera; flat film stays black.',
    'Dark Field up (PLAN 47b), toward the reference\'s index.'],
  ['light.hueSplit', 'colour split by structure', (r, o) => r != null && o != null && r - o > 0.2,
    'Rheinberg lighting: a coloured ring and centre, so how steeply an edge bends the light decides its colour (cores one hue, flanks another).',
    'Ring colours from the reference\'s border cores and flanks (47b\'s Ring Colour, Inner and Outer Hue); stop filling cells with one colour.'],
  ['light.speculars', 'specular highlights a frame', (r, o) => r != null && o != null && r >= 10 && o < r / 3,
    'Curved films and bubble caps mirror the lamp as small white glints that move with the surface.',
    'Glints on curved films: PLAN 47e (sparkle) and 47i (point lights seen through the beads).'],
  ['light.fringe.radialPx', 'colour fringe outward (px)', (r, o) => r != null && o != null && r > 0.3 && Math.abs(o) < 0.15,
    'A macro lens\'s lateral chromatic aberration: red focuses a little further out than blue, more toward the frame\'s edge.',
    'A lens-character fringe on the plate (PLAN 47q-9).'],
  ['specks.satellites', 'satellite specks a frame', (r, o) => r != null && o != null && r > 3 * Math.max(1, o),
    'Small bubbles and droplets: foam sheds microbubbles into its borders, and they ride and drain along them.',
    'More, smaller bubbles riding the borders: the `bubbles` setting and satellite specks (the bubbles thread\'s next look).'],
  ['specks.chain', 'specks in chains or rings', (r, o) => r != null && o != null && r - (o ?? 0) > 0.15,
    'Microbubbles trapped in a Plateau border line up along it, and a bubble\'s rim strings droplets into dotted rings.',
    'Specks that follow the borders, not scattered (with the satellites above).'],
  ['layers.count', 'focus layers', (r, o) => r != null && o != null && r > o,
    'A macro lens\'s depth of field is a fraction of a millimetre: a foam in focus over a second foam far out of it.',
    'A defocused back layer: §51\'s two plates with focus per projector, and 47d depth of field.'],
  ['layers.sharpShare', 'sharp share of edges', (r, o) => r != null && o != null && r > 2 * o && r > 0.2,
    'In focus, every edge of a real film is sharp at the lens\'s resolution; softness comes only from depth.',
    'Sharpen the plate where it is in focus (47a fine window; the plate\'s resolution).'],
  ['motion.parallax', 'parallax speed ratio', (r, o) => r != null && o == null,
    'A camera gliding over layers at two depths sees the near one move faster.',
    'Two layers drifting at two rates (§51\'s back plate moving slower than the front).'],
  ['illustrated.index', 'illustrated index', (r, o) => r != null && o != null && o - r > 0.15,
    'What reads as drawn: flat fills, one width of line, one size of form, few specks, colour that ignores structure.',
    'See the parts below where ours is far more drawn.'],
];

export function targets(ref, ours) {
  const rows = [];
  for (const [key, label, when, physics, target] of RULES) {
    const r = at(ref, key), o = at(ours, key);
    rows.push({ key, label, ref: r, ours: o, fire: !!when(r, o), physics, target });
  }
  const parts = Object.entries(ours?.illustrated?.parts ?? {}).filter(([k, v]) => v != null && ref?.illustrated?.parts?.[k] != null && v - ref.illustrated.parts[k] > 0.3).map(([k, v]) => `${k} ${f(ref.illustrated.parts[k])} → ${f(v)}`);
  return { rows, illustratedParts: parts };
}

export function targetLines({ rows, illustratedParts }, refName, oursName) {
  const fired = rows.filter(r => r.fire);
  return [
    `## Physics targets: ${oursName} against ${refName}`,
    '',
    fired.length ? `${fired.length} gaps big enough to see, each with the phenomenon behind the reference's number and what gives the plate the same:` : 'No gap big enough to see on these measures.',
    '',
    ...fired.flatMap(r => [`- **${r.label}**: ${f(r.ref)} against ours ${f(r.ours)}. ${r.physics} → ${r.target}`]),
    ...(illustratedParts.length ? ['', `Where ours reads more drawn: ${illustratedParts.join(', ')}.`] : []),
    '',
    '| measure | reference | ours | gap |',
    '|---|---|---|---|',
    ...rows.map(r => `| ${r.label} | ${f(r.ref)} | ${f(r.ours)} | ${r.fire ? 'yes' : ''} |`),
  ];
}

const main = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (main) {
  const args = process.argv.slice(2).filter(a => a !== '--json'), json = process.argv.includes('--json');
  if (args.length !== 2) { console.log('usage: npm run structuretargets -- <reference read> <our read> [--json]\n(each a structure.json, a design.json from a watch, or a folder holding one)'); process.exit(2); }
  const [a, b] = args.map(loadRead), t = targets(a.read, b.read);
  console.log(json ? JSON.stringify(t, null, 1) : targetLines(t, a.name, b.name).join('\n'));
}
