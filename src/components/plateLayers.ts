import { WebGPUFluid } from '../gpu/fluid';
import type { FluidSimulation } from '../sim/fluidSimulation';

/**
 * Build the WebGPU plate layer list for a frame, attaching each solver's
 * `fieldWrites` count so `WebGPUPlate.draw` only packs layers whose fields
 * changed since the last pack (H2c-9; 19ai-10 module beside `LiquidVisualizer`).
 */
export function plateLayers(fluids: readonly FluidSimulation[]) {
  const out = [];
  for (const f of fluids) {
    if (f.gpu instanceof WebGPUFluid) {
      out.push({ ...f.gpu.fields, writes: f.gpu.fieldWrites });
    }
  }
  return out;
}
