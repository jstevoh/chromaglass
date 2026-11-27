// Bundled into a page by scripts/wgsl.mjs: every solver kernel and the plate's
// display shader, compiled on whatever WebGPU the browser has.
import { KERNELS, kernel } from '../src/gpu/wgsl/fluid';
import { plateWgsl, DISPLAY_MAIN, DERIVE_WGSL } from '../src/gpu/wgsl/plate';
import { SPIKES_WGSL } from '../src/gpu/wgsl/spikes';
import { STAND_WINDOW, standingKernels } from '../src/gpu/wgsl/standing';
import { DROP_KERNELS } from '../src/gpu/wgsl/ferroDrop';
import { SLOSH_KERNELS } from '../src/gpu/wgsl/slosh';
import { SPLAT_KERNELS, splatKernel } from '../src/gpu/wgsl/splat';
import { BEAD_KERNELS } from '../src/gpu/wgsl/beadMask';
import { SOAP_KERNELS } from '../src/gpu/wgsl/soapFilm';
import { SOAP_PLATE_KERNELS } from '../src/gpu/wgsl/soapFilmPlate';
import { SOAP_AIR_KERNELS } from '../src/gpu/wgsl/soapAir';
import { FINE_ADVECT_WGSL, FINE_REDUCE_WGSL, FINE_DETAIL_WGSL } from '../src/gpu/wgsl/fineDye';
import { STEP_WGSL, SPLAT_WGSL, LENS_WGSL } from '../src/gpu/wgsl/glint';
import { TANK_KERNELS } from '../src/gpu/wgsl/tank';
import { TANK_DRAW_WGSL } from '../src/gpu/tankDraw';
import { FARADAY_KERNELS } from '../src/gpu/wgsl/faraday';
import { SURFACE_KERNELS } from '../src/gpu/wgsl/surfaceHeight';
import { PACK_SURFACE_KERNEL } from '../src/gpu/wgsl/plateSurface';
import { GLOW_KERNELS } from '../src/gpu/wgsl/glow';

/** The closeup's fine dye (PLAN 47a): carried, averaged and turned into detail, built behind the show. */
const FINE_KERNELS: Record<string, string> = { advect: FINE_ADVECT_WGSL, reduce: FINE_REDUCE_WGSL, detail: FINE_DETAIL_WGSL };

const FORMATS: Record<string, string> = {};
(window as unknown as { runWgsl: () => Promise<string[]> }).runWgsl = async () => {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return ['no adapter'];
  const device = await adapter.requestDevice();
  const out: string[] = [];
  const check = async (label: string, code: string) => {
    const m = device.createShaderModule({ code, label });
    const info = await m.getCompilationInfo();
    for (const msg of info.messages) {
      if (msg.type === 'error') out.push(`${label}:${msg.lineNum}:${msg.linePos} ${msg.message}`);
    }
  };
  for (const name of Object.keys(KERNELS)) await check(`fluid.${name}`, kernel(name, FORMATS[name] ?? 'rgba16float'));
  await check('plate.display', plateWgsl(DISPLAY_MAIN));
  await check('plate.derive', DERIVE_WGSL);
  // The standing layer's film (PLAN §9t), built behind the show.
  const film = standingKernels(SPIKES_WGSL);
  for (const [name, code] of Object.entries(film)) await check(`standing.${name}`, code);
  await check('standing.window', STAND_WINDOW);
  // The closeup's ferrofluid drop (PLAN §29a), built behind the show too.
  for (const [name, code] of Object.entries(DROP_KERNELS)) await check(`drop.${name}`, code);
  // The slosh dish (PLAN 18a-13a, 13d): two layers of shallow water under the plate's tilt and presses.
  for (const [name, code] of Object.entries(SLOSH_KERNELS)) await check(`slosh.${name}`, code);
  // What lands on the plate (wgsl/splat.ts): the splats, the poured picture, the deltas' upsample and the video pour (PLAN 14ab-2).
  for (const name of Object.keys(SPLAT_KERNELS)) await check(`splat.${name}`, splatKernel(name, 'rgba32float'));
  // The oil beads' mask (PLAN 14ab-6), drawn by the plate from the beads' list.
  for (const [name, code] of Object.entries(BEAD_KERNELS)) await check(`beads.${name}`, code);
  // The draining soap film (PLAN 32c) and what the plate adds to it (32d): stepped behind Soap Film.
  for (const [name, code] of Object.entries(SOAP_KERNELS)) await check(`soap.${name}`, code);
  for (const [name, code] of Object.entries(TANK_KERNELS)) await check(`tank.${name}`, code);
  await check('tank.draw', TANK_DRAW_WGSL);
  // The dish on a shaker (PLAN 48f): its standing wave's step, built behind the show unless the look opens shaken.
  for (const [name, code] of Object.entries(FARADAY_KERNELS)) await check(`faraday.${name}`, code);
  for (const [name, code] of Object.entries(SURFACE_KERNELS)) await check(`surface.${name}`, code);
  await check('plate.packSurface', PACK_SURFACE_KERNEL);
  for (const [name, code] of Object.entries(SOAP_PLATE_KERNELS)) await check(`soapPlate.${name}`, code);
  for (const [name, code] of Object.entries(SOAP_AIR_KERNELS)) await check(`soapAir.${name}`, code);
  for (const [name, code] of Object.entries(FINE_KERNELS)) await check(`fine.${name}`, code);
  // The water's glow (PLAN 48c), stepped behind Glow.
  for (const [name, code] of Object.entries(GLOW_KERNELS)) await check(`glow.${name}`, code);
  // The lens pass after the plate (PLAN 47e, 47d, 47b-side): glitter, the lens, the side lamp.
  const glint = { step: STEP_WGSL, splat: SPLAT_WGSL, lens: LENS_WGSL };
  for (const [name, code] of Object.entries(glint)) await check(`glint.${name}`, code);
  out.push(`checked ${Object.keys(glint).length + Object.keys(KERNELS).length + 2 + Object.keys(film).length + 1 + Object.keys(DROP_KERNELS).length + Object.keys(SLOSH_KERNELS).length + Object.keys(SPLAT_KERNELS).length + Object.keys(BEAD_KERNELS).length + Object.keys(SOAP_KERNELS).length + Object.keys(SOAP_PLATE_KERNELS).length + Object.keys(SOAP_AIR_KERNELS).length + Object.keys(TANK_KERNELS).length + Object.keys(FARADAY_KERNELS).length + Object.keys(SURFACE_KERNELS).length + 1 + Object.keys(GLOW_KERNELS).length + 1 + Object.keys(FINE_KERNELS).length} shaders`);
  return out;
};
