#!/usr/bin/env node
/**
 * The letters of the wordmark, turned into shapes.
 *
 *   npm i --no-save opentype.js && node scripts/brand/outline.mjs
 *
 * Run it only when the words change. It reads Jost (SIL Open Font License,
 * see fonts/OFL.txt) and writes `words.json`, which is all `npm run brand`
 * needs — so the brand can be regenerated without a font installed, and the
 * logo looks the same on every screen rather than on whichever machine happens
 * to have the font.
 *
 * opentype.js is not a dependency on purpose: installing it with `--save` on a
 * Mac rewrites package-lock.json and drops every other platform's optional
 * binaries, which breaks `npm ci` on the Linux runners.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const font = (file) => opentype.parse(fs.readFileSync(path.join(HERE, 'fonts', file)).buffer);

/**
 * Path data from the glyph's commands, written here rather than by
 * `Path.toPathData`: opentype.js 2.0's writer emits a stray `NaN` for some
 * quadratic segments depending on where the glyph sits, and a browser stops
 * drawing a path at the first bad number — measured, the share card's second
 * line ended at "that rea". The commands themselves are all finite.
 */
const n = (v) => String(Math.round(v * 10) / 10);
function toD(commands) {
  return commands.map(c => {
    switch (c.type) {
      case 'M': case 'L': return `${c.type}${n(c.x)} ${n(c.y)}`;
      case 'Q': return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
      case 'C': return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
      default: return 'Z';
    }
  }).join('');
}

/** Outline `text` at `size`, baseline at y = 0, starting at x = 0. `track` is letter spacing in em. */
function outline(f, text, size, track = 0) {
  const scale = size / f.unitsPerEm;
  const glyphs = f.stringToGlyphs(text);
  let x = 0, d = '';
  glyphs.forEach((g, i) => {
    d += toD(g.getPath(x, 0, size).commands);
    x += g.advanceWidth * scale;
    if (i < glyphs.length - 1) x += f.getKerningValue(g, glyphs[i + 1]) * scale + track * size;
  });
  return { d, width: Math.round(x * 10) / 10 };
}

const bold = font('Jost-Bold.ttf'), italic = font('Jost-Italic.ttf'), regular = font('Jost-Regular.ttf');
const SIZE = 150;
const words = {
  font: 'Jost (SIL Open Font License 1.1)',
  size: SIZE,
  capHeight: Math.round(bold.tables.os2.sCapHeight / bold.unitsPerEm * SIZE * 10) / 10,
  chroma: outline(bold, 'Chroma', SIZE, -0.02),
  glass: outline(italic, 'Glass', SIZE, -0.02),
  // The share card's line, in two lines; the same words the card has always carried.
  tagline: [outline(regular, 'A psychedelic liquid light show', 40, 0.01), outline(regular, 'that reacts to your music', 40, 0.01)],
};
fs.writeFileSync(path.join(HERE, 'words.json'), JSON.stringify(words, null, 1) + '\n');
console.log(`words.json: Chroma ${words.chroma.width}, Glass ${words.glass.width}, cap height ${words.capHeight}`);
