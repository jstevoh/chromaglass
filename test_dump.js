"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var plate_ts_1 = require("./src/gpu/wgsl/plate.ts");
var src = (0, plate_ts_1.plateWgsl)('fn main() {}');
src.split('\n').forEach(function (l, i) { if (l.includes('clamp') || l.includes('max') || l.includes('min')) {
    if (i + 1 > 470 && i + 1 < 505)
        console.log(i + 1, l);
} });
