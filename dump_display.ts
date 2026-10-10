import { plateWgsl } from './src/gpu/wgsl/plate.ts';
import { DISPLAY_MAIN } from './src/gpu/wgsl/plate.ts';
import fs from 'fs';
const src = plateWgsl(DISPLAY_MAIN);
fs.writeFileSync('display.wgsl', src);
