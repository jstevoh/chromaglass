import { plateWgsl } from './src/gpu/wgsl/plate.ts';
const src = plateWgsl('fn main() {}');
src.split('\n').forEach((l, i) => { if (l.includes('clamp') || l.includes('max') || l.includes('min')) { if(i+1 > 470 && i+1 < 505) console.log(i + 1, l); } });
