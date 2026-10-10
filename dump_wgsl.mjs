import { plateWgsl } from './src/gpu/wgsl/plate.js';
const src = plateWgsl('fn main() {}');
const lines = src.split('\n');
for (let i = 470; i <= 505; i++) {
  console.log((i + 1) + ": " + lines[i]);
}
