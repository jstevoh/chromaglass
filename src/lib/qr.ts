/**
 * A QR code, drawn without a library (PLAN.md 8f).
 *
 * The Phone · iPad panel gives the address a phone opens to drive the show:
 * `http://192.168.1.23:8787/?remote=1&key=…`, sixty-odd characters typed on a
 * phone keyboard in a dark room, with a key in it nobody can read aloud. The
 * design puts a QR code beside it, so the phone's camera reads it instead.
 *
 * Why not a package: every QR library on npm brings a canvas or SVG renderer,
 * several encodings and every version up to 40, for one address that is never
 * longer than a hundred bytes. What it needs is small and fixed by the
 * standard (ISO/IEC 18004): byte mode, error correction level M (15% of the
 * symbol can be smudged or glared and it still reads), versions 1 to 10 (up
 * to 213 bytes), and the eight masks scored by the standard's four penalty
 * rules. The panel draws the module grid as one SVG path.
 *
 * `npm run qr` reads every symbol back: it unmasks the modules, walks them in
 * the standard's order, checks every Reed–Solomon block's syndromes are zero
 * and decodes the bytes, and checks the fixed patterns and the format and
 * version words against their own BCH codes. Pure, so it runs in node.
 */

/** Per version, level M: total codewords, error-correction codewords per block, and the blocks as [count, data codewords each]. */
const M_BLOCKS: [number, number, [number, number][]][] = [
  [0, 0, []], // no version 0
  [26, 10, [[1, 16]]],
  [44, 16, [[1, 28]]],
  [70, 26, [[1, 44]]],
  [100, 18, [[2, 32]]],
  [134, 24, [[2, 43]]],
  [172, 16, [[4, 27]]],
  [196, 18, [[4, 31]]],
  [242, 22, [[2, 38], [2, 39]]],
  [292, 22, [[3, 36], [2, 37]]],
  [346, 26, [[4, 43], [1, 44]]],
];

export const QR_MAX_VERSION = 10;

/** The centres of the alignment patterns, per version. */
const ALIGN: number[][] = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

export const qrSize = (version: number): number => 17 + 4 * version;

/** How many data codewords a version holds at level M. */
export const dataCodewords = (version: number): number =>
  M_BLOCKS[version][2].reduce((n, [count, each]) => n + count * each, 0);

/** The blocks of a version, for the encoder and for `npm run qr`'s reading back. */
export const qrBlocks = (version: number): { ec: number; data: number[] } => {
  const [, ec, groups] = M_BLOCKS[version];
  const data: number[] = [];
  for (const [count, each] of groups) for (let i = 0; i < count; i++) data.push(each);
  return { ec, data };
};

// ── GF(256) and Reed–Solomon ─────────────────────────────────────────

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
export const gfMul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);
export const gfPow2 = (n: number): number => EXP[n % 255];

/** The generator polynomial of degree n, highest power first, leading 1 dropped. */
function generator(n: number): number[] {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= gfMul(g[j], EXP[i]);
    }
    g = next;
  }
  return g.slice(1);
}

/** The n error-correction codewords for a block: the remainder of data·x^n divided by the generator. */
export function rsRemainder(data: number[], n: number): number[] {
  const g = generator(n);
  const r = new Array(n).fill(0);
  for (const d of data) {
    const factor = d ^ r[0];
    r.shift(); r.push(0);
    for (let i = 0; i < n; i++) r[i] ^= gfMul(g[i], factor);
  }
  return r;
}

// ── Codewords ────────────────────────────────────────────────────────

function utf8(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

/** The smallest version that holds these bytes, or null when none up to 10 does. */
export function versionFor(byteLength: number): number | null {
  for (let v = 1; v <= QR_MAX_VERSION; v++) {
    const countBits = v < 10 ? 8 : 16;
    if (4 + countBits + byteLength * 8 <= dataCodewords(v) * 8) return v;
  }
  return null;
}

/** Byte mode, the count, the bytes, the terminator, padded to the version's data length. */
function dataStream(bytes: number[], version: number): number[] {
  const bits: number[] = [];
  const put = (value: number, length: number) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const capacity = dataCodewords(version) * 8;
  put(0, Math.min(4, capacity - bits.length));
  while (bits.length % 8) bits.push(0);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; out.length < dataCodewords(version); pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

/** Split into blocks, add each block's error correction, and interleave, as the standard lays them in the symbol. */
function interleave(data: number[], version: number): number[] {
  const { ec, data: sizes } = qrBlocks(version);
  const blocks: number[][] = [];
  let at = 0;
  for (const n of sizes) { blocks.push(data.slice(at, at + n)); at += n; }
  const ecs = blocks.map(b => rsRemainder(b, ec));
  const out: number[] = [];
  const longest = Math.max(...sizes);
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ec; i++) for (const e of ecs) out.push(e[i]);
  return out;
}

// ── The symbol ───────────────────────────────────────────────────────

export interface QrCode {
  version: number;
  size: number;
  mask: number;
  /** Row-major, true is dark. */
  modules: boolean[];
}

/** The modules that are not data: finders, separators, timing, alignment, format and version areas. */
export function functionModules(version: number): boolean[] {
  const n = qrSize(version);
  const fixed = new Array(n * n).fill(false);
  const mark = (x: number, y: number) => { if (x >= 0 && y >= 0 && x < n && y < n) fixed[y * n + x] = true; };
  // Finders with their separators, and the format areas beside them.
  for (const [cx, cy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) mark(cx + x, cy + y);
  }
  for (let i = 0; i < 9; i++) { mark(8, i); mark(i, 8); }
  for (let i = 0; i < 8; i++) { mark(n - 1 - i, 8); mark(8, n - 1 - i); }
  // Timing.
  for (let i = 0; i < n; i++) { mark(6, i); mark(i, 6); }
  // Alignment, except where one would sit on a finder.
  const al = ALIGN[version];
  for (const ay of al) for (const ax of al) {
    if ((ax === 6 && ay === 6) || (ax === 6 && ay === al[al.length - 1]) || (ax === al[al.length - 1] && ay === 6)) continue;
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) mark(ax + x, ay + y);
  }
  // Version areas.
  if (version >= 7) {
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { mark(i, n - 11 + j); mark(n - 11 + j, i); }
  }
  return fixed;
}

/** The data modules in the order codeword bits are placed: up and down two-column strips from the bottom right, skipping the timing column. */
export function dataOrder(version: number): number[] {
  const n = qrSize(version);
  const fixed = functionModules(version);
  const order: number[] = [];
  let upward = true;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let k = 0; k < n; k++) {
      const y = upward ? n - 1 - k : k;
      for (const x of [right, right - 1]) if (!fixed[y * n + x]) order.push(y * n + x);
    }
    upward = !upward;
  }
  return order;
}

/** Whether mask m flips the module at row y, column x. */
export function maskBit(m: number, y: number, x: number): boolean {
  switch (m) {
    case 0: return (y + x) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (y + x) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return ((y * x) % 2) + ((y * x) % 3) === 0;
    case 6: return (((y * x) % 2) + ((y * x) % 3)) % 2 === 0;
    default: return (((y + x) % 2) + ((y * x) % 3)) % 2 === 0;
  }
}

/** The 15-bit format word for level M and a mask: BCH(15,5), then the standard's XOR. */
export function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask; // level M is 00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | (rem & 0x3ff)) ^ 0x5412;
}

/** The 18-bit version word: BCH(18,6). */
export function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | (rem & 0xfff);
}

/** Where each of the format word's 15 bits goes, both copies: [x, y] for bit i (bit 0 the least significant). */
export function formatPlaces(n: number): [[number, number], [number, number]][] {
  const out: [[number, number], [number, number]][] = [];
  for (let i = 0; i < 15; i++) {
    // Beside the top-left finder: up column 8 then left along row 8.
    const a: [number, number] = i < 6 ? [8, i] : i < 8 ? [8, i + 1] : i === 8 ? [7, 8] : [14 - i, 8];
    // The second copy: along row 8 under the top-right finder, then down column 8 beside the bottom-left.
    const b: [number, number] = i < 8 ? [n - 1 - i, 8] : [8, n - 15 + i];
    out.push([a, b]);
  }
  return out;
}

function drawFixed(version: number, grid: boolean[]): void {
  const n = qrSize(version);
  const set = (x: number, y: number, v: boolean) => { if (x >= 0 && y >= 0 && x < n && y < n) grid[y * n + x] = v; };
  for (const [cx, cy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) {
      const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
      set(cx + x, cy + y, ring !== 2 && ring !== 4);
    }
  }
  for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const al = ALIGN[version];
  for (const ay of al) for (const ax of al) {
    if ((ax === 6 && ay === 6) || (ax === 6 && ay === al[al.length - 1]) || (ax === al[al.length - 1] && ay === 6)) continue;
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) set(ax + x, ay + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
  }
  // The one module that is always dark, beside the bottom-left finder.
  set(8, n - 8, true);
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const on = ((bits >>> i) & 1) === 1;
      const a = Math.floor(i / 3), b = n - 11 + (i % 3);
      set(a, b, on); set(b, a, on);
    }
  }
}

function drawFormat(grid: boolean[], n: number, mask: number): void {
  const bits = formatBits(mask);
  formatPlaces(n).forEach(([[ax, ay], [bx, by]], i) => {
    const on = ((bits >>> i) & 1) === 1;
    grid[ay * n + ax] = on;
    grid[by * n + bx] = on;
  });
}

/** The standard's four penalty rules: runs, 2×2 blocks, finder-like patterns, and dark/light balance. */
export function penalty(grid: boolean[], n: number): number {
  let score = 0;
  const at = (x: number, y: number) => grid[y * n + x];
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < n; a++) {
      let run = 1;
      const line: boolean[] = [];
      for (let b = 0; b < n; b++) line.push(pass === 0 ? at(b, a) : at(a, b));
      for (let b = 1; b <= n; b++) {
        if (b < n && line[b] === line[b - 1]) { run++; continue; }
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
      // 1:1:3:1:1 with four light modules on one side.
      for (let b = 0; b + 11 <= n; b++) {
        const s = line.slice(b, b + 11).map(v => (v ? 1 : 0)).join('');
        if (s === '10111010000' || s === '00001011101') score += 40;
      }
    }
  }
  for (let y = 0; y + 1 < n; y++) for (let x = 0; x + 1 < n; x++) {
    const v = at(x, y);
    if (v === at(x + 1, y) && v === at(x, y + 1) && v === at(x + 1, y + 1)) score += 3;
  }
  const dark = grid.filter(Boolean).length;
  score += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
  return score;
}

/** Encode text as a QR code at level M, the smallest version that holds it; null past version 10. */
export function encodeQr(text: string): QrCode | null {
  const bytes = utf8(text);
  const version = versionFor(bytes.length);
  if (version === null) return null;
  const n = qrSize(version);
  const codewords = interleave(dataStream(bytes, version), version);
  const order = dataOrder(version);
  const base = new Array(n * n).fill(false);
  drawFixed(version, base);
  // Codeword bits, most significant first; the remainder bits past the last codeword stay light.
  const dataBits = order.map((_, i) => {
    const cw = codewords[i >> 3];
    return cw === undefined ? false : ((cw >>> (7 - (i & 7))) & 1) === 1;
  });
  let best: QrCode | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const grid = base.slice();
    order.forEach((cell, i) => { grid[cell] = dataBits[i] !== maskBit(mask, Math.floor(cell / n), cell % n); });
    drawFormat(grid, n, mask);
    const s = penalty(grid, n);
    if (s < bestScore) { bestScore = s; best = { version, size: n, mask, modules: grid }; }
  }
  return best;
}

/** The dark modules as one SVG path, a unit per module, with the standard's four-module quiet zone around it. */
export function qrPath(code: QrCode, quiet = 4): string {
  let d = '';
  for (let y = 0; y < code.size; y++) for (let x = 0; x < code.size; x++) {
    if (code.modules[y * code.size + x]) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
  }
  return d;
}
