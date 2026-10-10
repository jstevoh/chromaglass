import fs from 'fs';
const src = fs.readFileSync('src/gpu/wgsl/plate.ts', 'utf8');
const lines = src.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('clamp(')) {
    console.log(i + 1, lines[i].trim());
  }
}
