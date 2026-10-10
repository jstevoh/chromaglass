/**
 * `npm run qr`: the Phone · iPad panel's QR code (src/lib/qr.ts, PLAN.md 8f), read back.
 *
 * A QR code that is a picture of a QR code, and not one a camera reads, looks
 * exactly like one that works. So every symbol here is read back the way a
 * reader does, from its modules alone, and decoded to the text it was given:
 *
 *  - the finder patterns, the timing lines and the one always-dark module
 *    are where the standard puts them;
 *  - both copies of the format word are a valid BCH(15,5) word, the same
 *    word, and name level M and a mask; for version 7 and up both copies of
 *    the version word are a valid BCH(18,6) word naming the version;
 *  - the modules, unmasked with the mask the format word names and walked in
 *    the standard's order, split back into the version's blocks, and every
 *    block's Reed–Solomon syndromes are zero (one flipped module is enough
 *    to make them not), and the bytes decode to the text;
 *  - a symbol with a few modules damaged still holds its syndromes non-zero
 *    (the control: the syndrome check can fail);
 *  - the addresses the panel actually shows fit, and the version grows with
 *    the text and stops at 10 rather than drawing something wrong.
 *
 * The syndrome check is independent of the encoder's division: a codeword
 * block is a valid Reed–Solomon word exactly when the block's polynomial is
 * zero at the generator's roots, α⁰ … α^(n−1), and that is evaluated here.
 * The order modules are walked in is shared with the encoder (`dataOrder`);
 * the owner's phone reading the panel is the check of that against the world,
 * and the session that wrote this read every case below with OpenCV's
 * decoder too (the commit says so).
 */
import {
  encodeQr, dataOrder, formatBits, formatPlaces, functionModules, gfMul, gfPow2, maskBit,
  qrBlocks, qrSize, versionBits, versionFor, QR_MAX_VERSION,
} from '../src/lib/qr.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const popcount = (v) => { let c = 0; while (v) { c += v & 1; v >>>= 1; } return c; };

/** Read a symbol back to its text, or say what is wrong with it. */
function read(code) {
  const n = code.size, at = (x, y) => code.modules[y * n + x];
  const version = (n - 17) / 4;
  if (!Number.isInteger(version) || version < 1 || version > QR_MAX_VERSION) return { error: `size ${n}` };
  // Finders: a dark 7×7 ring, a light ring, a dark 3×3 centre, and the light separator.
  for (const [cx, cy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) {
      const X = cx + x, Y = cy + y;
      if (X < 0 || Y < 0 || X >= n || Y >= n) continue;
      const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
      if (at(X, Y) !== (ring !== 2 && ring !== 4)) return { error: `finder at ${cx},${cy} wrong at ${X},${Y}` };
    }
  }
  for (let i = 8; i < n - 8; i++) if (at(6, i) !== (i % 2 === 0) || at(i, 6) !== (i % 2 === 0)) return { error: `timing at ${i}` };
  if (!at(8, n - 8)) return { error: 'the dark module is light' };
  // Format: both copies, each a valid word, the same word.
  const valid = new Map();
  for (let m = 0; m < 8; m++) valid.set(formatBits(m), m);
  const words = [0, 0];
  formatPlaces(n).forEach(([[ax, ay], [bx, by]], i) => {
    if (at(ax, ay)) words[0] |= 1 << i;
    if (at(bx, by)) words[1] |= 1 << i;
  });
  if (words[0] !== words[1]) return { error: 'the two format copies differ' };
  if (!valid.has(words[0])) return { error: `format word ${words[0].toString(2)} is not a level-M word` };
  // And BCH-valid on its own terms: unmasked, the 15 bits divide by the generator.
  {
    let r = words[0] ^ 0x5412;
    for (let i = 14; i >= 10; i--) if ((r >>> i) & 1) r ^= 0x537 << (i - 10);
    if (r !== 0) return { error: 'format word fails its BCH code' };
  }
  const mask = valid.get(words[0]);
  if (version >= 7) {
    let a = 0, b = 0;
    for (let i = 0; i < 18; i++) {
      const p = Math.floor(i / 3), q = n - 11 + (i % 3);
      if (at(p, q)) a |= 1 << i;
      if (at(q, p)) b |= 1 << i;
    }
    if (a !== b || a !== versionBits(version)) return { error: 'version word' };
    let r = a;
    for (let i = 17; i >= 12; i--) if ((r >>> i) & 1) r ^= 0x1f25 << (i - 12);
    if (r !== 0) return { error: 'version word fails its BCH code' };
  }
  // The data, unmasked, in the standard's order.
  const order = dataOrder(version);
  const fixed = functionModules(version);
  if (order.some(c => fixed[c])) return { error: 'the walk visits a function module' };
  const bits = order.map(c => at(c % n, Math.floor(c / n)) !== maskBit(mask, Math.floor(c / n), c % n));
  const { ec, data: sizes } = qrBlocks(version);
  const total = sizes.reduce((a, b) => a + b, 0) + ec * sizes.length;
  const cws = [];
  for (let i = 0; i < total; i++) cws.push(bits.slice(i * 8, i * 8 + 8).reduce((a, b) => (a << 1) | (b ? 1 : 0), 0));
  // De-interleave.
  const blocks = sizes.map(() => []);
  let k = 0;
  const longest = Math.max(...sizes);
  for (let i = 0; i < longest; i++) sizes.forEach((s, b) => { if (i < s) blocks[b].push(cws[k++]); });
  for (let i = 0; i < ec; i++) sizes.forEach((_, b) => blocks[b].push(cws[k++]));
  // Syndromes: the block, highest power first, evaluated at α^j.
  let syndromes = 0;
  for (const block of blocks) {
    for (let j = 0; j < ec; j++) {
      let s = 0;
      const x = gfPow2(j);
      for (const c of block) s = gfMul(s, x) ^ c;
      if (s !== 0) syndromes++;
    }
  }
  if (syndromes) return { error: `${syndromes} non-zero syndromes`, syndromes };
  // The bytes.
  const data = blocks.flatMap((b, i) => b.slice(0, sizes[i]));
  const stream = data.flatMap(b => [7, 6, 5, 4, 3, 2, 1, 0].map(s => (b >>> s) & 1));
  let p = 0;
  const take = (len) => { let v = 0; for (let i = 0; i < len; i++) v = (v << 1) | stream[p++]; return v; };
  if (take(4) !== 0b0100) return { error: 'not byte mode' };
  const count = take(version < 10 ? 8 : 16);
  const bytes = [];
  for (let i = 0; i < count; i++) bytes.push(take(8));
  return { text: new TextDecoder().decode(new Uint8Array(bytes)), version, mask };
}

// ── The addresses the panel shows ───────────────────────────────────────
const CASES = [
  'http://192.168.1.23:8787/?remote=1',
  'http://192.168.1.23:8787/?remote=1&key=3f9a27c1b4e8d6f0',
  'http://10.0.0.5:8787/?remote=1&key=0123456789abcdef0123456789abcdef',
  'http://chromaglass-mac.local:8787/?remote=1&key=0123456789abcdef0123456789abcdef',
  'A',
  'x'.repeat(150),
  'y'.repeat(200),
  'Ünïcödé · ✓',
];
for (const text of CASES) {
  const code = encodeQr(text);
  const got = code && read(code);
  check(`"${text.length > 40 ? text.slice(0, 37) + '…' : text}" reads back`, got && got.text === text,
    code ? `version ${code.version}, mask ${code.mask}${got.error ? `, ${got.error}` : ''}` : 'not encoded');
}

// ── The control: damage is seen ─────────────────────────────────────────
{
  const code = encodeQr(CASES[1]);
  const order = dataOrder(code.version);
  const hurt = { ...code, modules: code.modules.slice() };
  for (const c of [order[3], order[40], order[200]]) hurt.modules[c] = !hurt.modules[c];
  const got = read(hurt);
  check('three flipped data modules make the syndromes non-zero (the check can fail)', got.syndromes > 0, got.error ?? 'read as clean');
  const fmt = { ...code, modules: code.modules.slice() };
  const [[ax, ay]] = formatPlaces(code.size)[4];
  fmt.modules[ay * code.size + ax] = !fmt.modules[ay * code.size + ax];
  check('a flipped format module is seen', !!read(fmt).error, read(fmt).error ?? 'read as clean');
}

// ── Size ────────────────────────────────────────────────────────────────
{
  const v = [10, 40, 80, 120, 200].map(len => versionFor(len));
  check('the version grows with the text', v.every((x, i) => i === 0 || x >= v[i - 1]), v.join(' '));
  check('past version 10 there is no code rather than a wrong one', encodeQr('x'.repeat(260)) === null);
  const addr = encodeQr(CASES[2]);
  check('the panel\'s longest address is a small symbol', addr.version <= 5, `version ${addr.version}, ${qrSize(addr.version)} modules`);
}

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} qr checks passed`);
process.exit(failed.length ? 1 : 0);
