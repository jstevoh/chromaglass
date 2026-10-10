import fs from 'fs';
let code = fs.readFileSync('scripts/bubbles.mjs', 'utf8');

code = code.replace(
  `const a = hsv(ar, ag, ab), b = hsv(br, bg, bb);`,
  `const a = hsv(ar, ag, ab), b = hsv(br, bg, bb);
      if (pairs.length < 5) console.log('DEBUG a:', a.v.toFixed(3), 'b:', b.v.toFixed(3), 'ar:', ar.toFixed(3), 'br:', br.toFixed(3));`
);

fs.writeFileSync('scripts/bubbles.mjs', code);
