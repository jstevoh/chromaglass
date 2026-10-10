import fs from 'fs';
import { execSync } from 'child_process';
const plate = fs.readFileSync('src/gpu/wgsl/plate.ts', 'utf8');

// The easiest way is to let the code run in node and override navigator.gpu!
