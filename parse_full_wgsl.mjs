import fs from 'fs';

let text = fs.readFileSync('src/gpu/wgsl/plate.ts', 'utf8');

// The WGSL is assembled by concatenating string variables.
// Let's just find `fn decodeFluid` and anything named `decodeFluid`
