// Bundled into a page by scripts/wgsl.mjs: every solver kernel and the plate's
// display shader, compiled on whatever WebGPU the browser has.
import { KERNELS, kernel } from '../src/gpu/wgsl/fluid';
import { plateWgsl, DISPLAY_MAIN, DERIVE_WGSL } from '../src/gpu/wgsl/plate';

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
  out.push(`checked ${Object.keys(KERNELS).length + 2} shaders`);
  return out;
};
