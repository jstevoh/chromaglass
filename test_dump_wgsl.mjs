import { plateWgsl } from './src/gpu/wgsl/plate.js';
console.log(plateWgsl('fn main() {}').split('\n')[499]);
console.log(plateWgsl('fn main() {}').split('\n')[473]);
