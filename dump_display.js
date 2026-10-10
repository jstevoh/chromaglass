"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var plate_ts_1 = require("./src/gpu/wgsl/plate.ts");
var plate_ts_2 = require("./src/gpu/wgsl/plate.ts");
var fs_1 = __importDefault(require("fs"));
var src = (0, plate_ts_1.plateWgsl)(plate_ts_2.DISPLAY_MAIN);
fs_1.default.writeFileSync('display.wgsl', src);
