/**
 * The plate before the lamp (PLAN.md 18b), for `npm run lamp`'s first check
 * and for `node scripts/lampwhere.mjs`: today's wgsl/plate.ts with every line
 * the lamp added taken out, the composites put back to what they were, built
 * as a second lab by an esbuild plugin. Each edit says how many places it
 * must find; a refactor that moves one makes this throw rather than quietly
 * compare a shader with itself.
 */
import { readFileSync } from 'node:fs';

function paren(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return i;
  }
  throw new Error('lamp: unbalanced parentheses in plate.ts');
}
/** The top-level arguments of the call whose '(' is at `open`. */
function args(src, open) {
  const close = paren(src, open), out = [];
  let depth = 0, from = open + 1;
  for (let i = open + 1; i < close; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') depth--;
    else if (src[i] === ',' && depth === 0) { out.push(src.slice(from, i).trim()); from = i + 1; }
  }
  out.push(src.slice(from, close).trim());
  return { close, out };
}
export const BEFORE_LAMP = {
  name: 'before-lamp',
  setup(b) {
    b.onLoad({ filter: /src[\\/]gpu[\\/]wgsl[\\/]plate\.ts$/ }, (a) => {
      let s = readFileSync(a.path, 'utf8');
      const edit = (what, re, to, n) => {
        const found = s.match(re)?.length ?? 0;
        if (found !== n) throw new Error(`lamp: the before-lamp control found ${found} of ${n} ${what} in wgsl/plate.ts`);
        s = s.replace(re, to);
      };
      edit('lamp grounds', /\n[ \t]*if \(U\.lampGround > 0\.001\) \{ lampBg = [^\n]*\}/g, '', 1);
      edit('front plate levels', /mixLevelled\(groundOf\(bgColor\)/g, 'mixLevelled(bgColor', 1);
      edit('decodes through the lamp', /\n[ \t]*if \(U\.lampGround > 0\.001\) \{ dyeThrough = [^\n]*\}/g, '', 2);
      edit('back plates through the lamp', /if \(U\.lampGround > 0\.001\) \{[\s\S]*?\} else \{\n\s*outColor = painted1;\n\s*\}/g, 'outColor = painted1;', 1);
      // Each call site of the two composites back to the mix it was.
      for (const [fn, n, to] of [
        ['chemOnGround', 3, (x) => x[1]],
        ['onGround', 2, (x) => `mix(${x[0]}, ${x[1]}.rgb, ${x[1]}.a)`],
      ]) {
        let at = 0, done = 0;
        const call = new RegExp(`(?<![\\w])${fn}\\(`, 'g');
        for (;;) {
          call.lastIndex = at;
          const m = call.exec(s);
          if (!m) break;
          // Not the declaration.
          if (s.slice(Math.max(0, m.index - 3), m.index) === 'fn ') { at = m.index + 1; continue; }
          const { close, out } = args(s, m.index + fn.length);
          const rep = to(out);
          s = s.slice(0, m.index) + rep + s.slice(close + 1);
          at = m.index + rep.length;
          done++;
        }
        if (done !== n) throw new Error(`lamp: the before-lamp control rewrote ${done} of ${n} ${fn} calls in wgsl/plate.ts`);
      }
      if (/U\.lampGround/.test(s.replace(/fn (?:onGround|chemOnGround|groundOf)\([\s\S]*?\n\}/g, ''))) {
        throw new Error('lamp: the before-lamp control left a read of U.lampGround outside the two composites');
      }
      return { contents: s, loader: 'ts' };
    });
  },
};

export const RED = [0.05, 1.6, 1.6], YELLOW = [0.02, 0.1, 1.6], BLUE = [1.6, 0.9, 0.25], TEAL = [1.2, 0.3, 0.8];
/** The plate for check 1 (and lampwhere): four pools, a pale one, and two dyes overlapping. */
export const POOLS = [[0.3, 0.3, 0.14, RED, 1.4], [0.7, 0.3, 0.14, YELLOW, 1.4], [0.3, 0.7, 0.14, BLUE, 1.4], [0.7, 0.7, 0.14, TEAL, 0.6],
  [0.47, 0.5, 0.1, RED, 0.3], [0.55, 0.5, 0.1, BLUE, 0.3]];
