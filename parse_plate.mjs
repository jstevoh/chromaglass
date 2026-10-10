import fs from 'fs';
const text = fs.readFileSync('src/gpu/wgsl/plate.ts', 'utf8');
const chunks = text.split('\`');
let out = [];
for (const chunk of chunks) {
  if (chunk.includes('fn ')) {
    out.push(chunk);
  }
}
const code = out.join('\n');
const lines = code.split('\n');
let err = false;
lines.forEach((l, i) => {
  if (l.includes('clamp') || l.includes('max') || l.includes('min') || l.includes('pow') || l.includes('vec2')) {
    if (l.match(/clamp\([^,]+,\s*[0-9]+\.[0-9]+,\s*vec2/)) err = true;
    if (l.match(/clamp\([^,]+,\s*vec2[^,]+,\s*[0-9]+\.[0-9]+/)) err = true;
    if (l.match(/max\([^,]+,\s*[0-9]+\.[0-9]+\)/) && l.includes('vec2')) console.log("MAYBE MAX: " + l.trim());
    if (l.match(/min\([^,]+,\s*[0-9]+\.[0-9]+\)/) && l.includes('vec2')) console.log("MAYBE MIN: " + l.trim());
    if (l.match(/vec2.* - [0-9]+\.[0-9]+/)) console.log("MAYBE SUB: " + l.trim());
    if (l.match(/[0-9]+\.[0-9]+ - vec2/)) console.log("MAYBE SUB2: " + l.trim());
    if (l.match(/vec2.* \+ [0-9]+\.[0-9]+/)) console.log("MAYBE ADD: " + l.trim());
    if (l.match(/[0-9]+\.[0-9]+ \+ vec2/)) console.log("MAYBE ADD2: " + l.trim());
  }
});
