/**
 * The ChromaGlass mark and wordmark, as SVG.
 *
 * The mark is a press on the glass: a hand, or a kick through Beat Squeeze,
 * thins the film and the dye fingers outward in blue and green — the Fillmore
 * sunburst the app draws with Fingering up. At its centre is a C, a bright
 * meniscus ring round a dark pool, which is the old paint-cell icon opened up
 * into a letter.
 *
 * Detail is a parameter. The same burst is drawn with a hundred and fifty
 * points per finger and a bright filament along each for a share card, and
 * with a fraction of that for a favicon, where a filament would be a tenth of
 * a pixel and every point is bytes on every page load.
 */

import { r1, rng, blob, spline, ribbon, radial, linear, blur } from './geometry.mjs';

/** Three dyes, each from pale at the press to deep at the tip. */
const DYES = [
  [['0', '#b8f4ff'], ['0.5', '#2a7dff'], ['1', '#1433c9']],   // blue
  [['0', '#cffff7'], ['0.5', '#15c9b4'], ['1', '#0a6f86']],   // teal
  [['0', '#dcffb0'], ['0.5', '#2fd67e'], ['1', '#0b7d4f']],   // green
];
const INK = '#011322';                     // the dark of the pool and the ground's deepest point

const DETAIL = {
  low: { samples: 28, threads: false, glow: false },
  medium: { samples: 60, threads: false, glow: true },
  high: { samples: 150, threads: true, glow: true },
};

const ground = (id) => radial(id, [['0%', '#062a47'], ['70%', '#020f1d'], ['100%', '#00060d']], 'cx="50%" cy="50%" r="72%"');
const hotSpot = (id) => radial(id, [['0%', '#f6fffd', 0.95], ['28%', '#a8fff0', 0.55], ['100%', '#1de0c0', 0]]);

/**
 * The fingers of dye, about (cx, cy), `s` times the 512 design size. Each
 * finger's path is defined once and drawn twice through <use> — blurred for
 * the glow, then sharp — so the glow costs no bytes.
 */
function burst({ cx = 256, cy = 256, s = 1, id = 'f', detail = 'high' }) {
  const { samples, threads, glow } = DETAIL[detail];
  const R = rng(9);
  const N = 13;
  let defs = glow ? blur(`${id}glow`, r1(12 * s)) : '';
  let under = '', over = '', lines = '';
  for (let k = 0; k < N; k++) {
    const a0 = k / N * Math.PI * 2 + (R() - 0.5) * 0.18 - 1.2;
    const long = k % 2 === 0;
    const len = (long ? 200 : 135) + R() * 45;
    const curl = 0.32 + R() * 0.3;
    const wmax = (long ? 58 : 42) + R() * 10;
    const P = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const a = a0 + curl * t * t + 0.07 * Math.sin(3 * Math.PI * t + k);
      const r = 30 + len * t;
      P.push([cx + Math.cos(a) * r * s, cy + Math.sin(a) * r * s]);
    }
    const Q = spline(P, samples);
    const W = (u) => (wmax * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.08)), 0.8) * (1 - 0.5 * u) * (1 + 0.12 * Math.sin(11 * u + k)) + 2) * s;
    defs += linear(`${id}g${k}`, [...P[0], ...P[8]], DYES[k % 3]) + `<path id="${id}${k}" d="${ribbon(Q, W)}"/>`;
    if (glow) under += `<use href="#${id}${k}" fill="url(#${id}g${k})" opacity="0.45" filter="url(#${id}glow)"/>`;
    over += `<use href="#${id}${k}" fill="url(#${id}g${k})"/>`;
    if (threads) lines += `<path d="${ribbon(Q, u => (3 * (1 - u) + 0.6) * s, u => W(u) * 0.42)}" fill="#e6fffb" opacity="0.7"/>`;
  }
  return { defs, body: under + over + lines };
}

/** A C: an open ring with round ends, the opening toward +x, turned by `rot` degrees. */
function cRing(cx, cy, Ro, Ri, gapDeg = 42, rotDeg = 0) {
  const g = gapDeg * Math.PI / 180, rot = rotDeg * Math.PI / 180;
  const pt = (r, a) => `${r1(cx + r * Math.cos(a + rot))},${r1(cy + r * Math.sin(a + rot))}`;
  const cap = r1((Ro - Ri) / 2);
  return `M${pt(Ro, g)}A${Ro},${Ro} 0 1 1 ${pt(Ro, 2 * Math.PI - g)}A${cap},${cap} 0 0 1 ${pt(Ri, 2 * Math.PI - g)}`
    + `A${Ri},${Ri} 0 1 0 ${pt(Ri, g)}A${cap},${cap} 0 0 1 ${pt(Ro, g)}Z`;
}

/** The hot spot, the dark pool under the press, and the C in it. */
function hub({ cx = 256, cy = 256, s = 1, id = 'h', detail = 'high' }) {
  const C = cRing(cx, cy, r1(50 * s), r1(28 * s), 42, -8);
  const glow = DETAIL[detail].glow;
  const defs = hotSpot(`${id}hot`)
    + linear(`${id}c`, [cx - 56 * s, cy - 56 * s, cx + 54 * s, cy + 54 * s], [['0', '#ffffff'], ['0.45', '#d9fff7'], ['1', '#5ef0d8']])
    + (glow ? blur(`${id}well`, r1(6 * s)) + blur(`${id}cglow`, r1(7 * s)) : '');
  const body = `<circle cx="${cx}" cy="${cy}" r="${r1(104 * s)}" fill="url(#${id}hot)"/>`
    + (glow ? `<circle cx="${cx}" cy="${cy}" r="${r1(62 * s)}" fill="${INK}" opacity="0.85" filter="url(#${id}well)"/>` : '')
    + `<circle cx="${cx}" cy="${cy}" r="${r1(54 * s)}" fill="${INK}"/>`
    + (glow ? `<path d="${C}" fill="#7ff5e4" opacity="0.8" filter="url(#${id}cglow)"/>` : '')
    + `<path d="${C}" fill="url(#${id}c)"/>`;
  return { defs, body };
}

const svg = (viewBox, defs, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="ChromaGlass"><defs>${defs}</defs>${body}</svg>\n`;

/**
 * The icon on a 512 canvas.
 *
 *   tile    rounded square, transparent corners: favicon, "any" app icons
 *   square  full bleed, for anything that masks it itself (Android's maskable
 *           icons, iOS home screens, avatars cropped to a circle); `scale`
 *           pulls the burst in to sit inside the platform's safe zone
 *   circle  the dish on its own, for sitting beside the name
 */
export function icon({ shape = 'tile', detail = 'high', scale = 1 } = {}) {
  const b = burst({ s: scale, detail });
  const h = hub({ s: scale, detail });
  let defs = ground('ground') + b.defs + h.defs;
  let frame, open = '<g>', close = '</g>';
  if (shape === 'circle') {
    defs += `<clipPath id="clip"><circle cx="256" cy="256" r="236"/></clipPath>`;
    frame = `<circle cx="256" cy="256" r="236" fill="url(#ground)"/>`;
    open = '<g clip-path="url(#clip)">';
  } else if (shape === 'tile') {
    defs += `<clipPath id="clip"><rect width="512" height="512" rx="112"/></clipPath>`;
    frame = `<rect width="512" height="512" fill="url(#ground)"/>`;
    open = '<g clip-path="url(#clip)">' + frame; frame = '';
  } else {
    frame = `<rect width="512" height="512" fill="url(#ground)"/>`;
  }
  const dish = detail === 'low' ? '' : `<circle cx="256" cy="256" r="${r1(232 * scale)}" fill="none" stroke="#7ff0e0" stroke-width="3" opacity="0.18"/>`;
  return svg('0 0 512 512', defs, frame + open + dish + b.body + h.body + close);
}

/**
 * The mark beside the name, and one finger of dye running out of the mark
 * and under both words.
 *
 * Laid out on a 260-high canvas: the dish is 170 across, the words are set at
 * 150 with the baseline at 186, and the viewBox is cropped to what is drawn so
 * the file can be sized by its height alone.
 */
export function lockup(words, { detail = 'medium' } = {}) {
  const S = 0.36;                                    // the 512 dish drawn 184 across
  const b = burst({ s: 1, id: 'lf', detail });
  const h = hub({ s: 1, id: 'lh', detail });
  const textX = 236, baseline = 186, gap = 8;
  const glassX = textX + words.chroma.width + gap;
  const end = glassX + words.glass.width;
  const flow = spline([[190, 175], [330, 212.8], [560, 220], [860, 209], [end + 30, 193]], DETAIL[detail].samples + 60);
  const under = ribbon(flow, u => 14.4 * Math.pow(1 - u, 1.3) + 1.1);
  const glow = DETAIL[detail].glow;
  const defs = ground('lground') + b.defs + h.defs
    + `<clipPath id="ldish"><circle cx="256" cy="256" r="236"/></clipPath>`
    + linear('chroma', [textX, 0, textX + words.chroma.width, 0], [['0', '#8fe8ff'], ['0.5', '#4fe6cf'], ['1', '#a8ff8c']])
    + linear('glass', [0, baseline - words.capHeight, 0, baseline], [['0', '#ffffff'], ['0.6', '#e4fbff'], ['1', '#9fdcf0']])
    + linear('flow', [190, 0, end + 30, 0], [['0', '#5ef0d8'], ['0.45', '#2fd67e'], ['1', '#a8ff8c', 0]])
    + (glow ? blur('flowGlow', 6) : '');
  const mark = `<g transform="translate(40 40) scale(${S})"><circle cx="256" cy="256" r="236" fill="url(#lground)"/>`
    + `<g clip-path="url(#ldish)">${b.body}${h.body}</g></g>`;
  const body = (glow ? `<path d="${under}" fill="url(#flow)" opacity="0.6" filter="url(#flowGlow)"/>` : '')
    + `<path d="${under}" fill="url(#flow)"/>` + mark
    + `<path transform="translate(${textX} ${baseline})" d="${words.chroma.d}" fill="url(#chroma)"/>`
    + `<path transform="translate(${r1(glassX)} ${baseline})" d="${words.glass.d}" fill="url(#glass)"/>`;
  const pad = 8;
  return svg(`${40 - pad} ${40 - pad} ${r1(end + 40 - 40 + 2 * pad)} ${184 + 2 * pad}`, defs, body);
}

/** The picture a link unfurls into: the lockup on the ground, a big faint burst behind, the line beneath. */
export function shareCard(words) {
  const W = 1200, H = 630;
  const back = burst({ cx: 980, cy: 330, s: 1.5, id: 'bk', detail: 'high' });
  // Lockup units to card pixels, and where its origin lands: the block of
  // mark, name and two lines of text is centred top to bottom.
  const scale = 0.7, lx = 96, ly = 170;
  const inner = lockup(words, { detail: 'high' }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>\n$/, '');
  const [line1, line2] = words.tagline;
  const textX = r1(lx + 236 * scale);
  const defs = radial('card', [['0%', '#0a3a5c'], ['60%', '#031627'], ['100%', '#00070f']], 'cx="30%" cy="35%" r="90%"') + back.defs;
  const body = `<rect width="${W}" height="${H}" fill="url(#card)"/>`
    + `<g opacity="0.28">${back.body}</g>`
    + `<g transform="translate(${lx} ${ly}) scale(${scale})">${inner}</g>`
    + `<g fill="#d9f3f7" opacity="0.72">`
    + `<path transform="translate(${textX} ${ly + 205})" d="${line1.d}"/>`
    + `<path transform="translate(${textX} ${ly + 257})" d="${line2.d}"/></g>`;
  return svg(`0 0 ${W} ${H}`, defs, body);
}
