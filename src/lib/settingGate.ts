import type { VisualizerSettings } from '../types';

export interface SettingGateOpts {
  /** Whether the back plate currently holds a look of its own (acts as 2 layers). */
  backLook?: boolean;
}

/**
 * Why a mode-gated control does nothing under the current settings, or `false`
 * when it is live.
 *
 * Shared by the desk panels (which keep every control mounted as a knob and
 * grey inactive ones out) and the Settings / phone panels so both surfaces
 * agree on which dials are gated off and tell the performer what turns each
 * one on.
 */
export function settingDisabledReason(
  key: keyof VisualizerSettings | string,
  settings: Partial<VisualizerSettings>,
  opts?: SettingGateOpts,
): string | false {
  const twoLayers = (settings.layerCount ?? 1) >= 2 || !!opts?.backLook;
  const camera = settings.renderStyle === 'photo' || (settings.macroZoom ?? 1) > 1.05;

  switch (key) {
    case 'turbulenceDetail':
      return (settings.turbulenceScale ?? 0) <= 0.005 && 'needs Turbulence Scale above 0';
    case 'particleMix':
      return (settings.particles ?? 0) <= 0.001 && 'needs Dye Particles above 0';
    case 'grainScale':
      return (settings.granulation ?? 0) <= 0.002 && 'needs Granulation above 0';
    case 'layerScaleVariety':
    case 'backgroundLoop':
      return !twoLayers && 'needs 2 Layers';
    case 'boundaryContrast':
      if (camera) return 'off in Photograph / Macro';
      return (
        Math.abs((settings.projectorFocus ?? 0.5) - 0.5) <= 0.002 &&
        !twoLayers &&
        'needs Projector Focus off 50% or 2 Layers'
      );
    case 'glossiness': {
      const relief = (settings.edgeRelief ?? 0) > 0.005;
      const moire = (settings.moireAmount ?? 0) > 0.001;
      return !camera && !relief && !moire && 'needs Edge Relief, Photo, or Macro';
    }
    case 'postBlurRadius':
      // wgsl/plate.ts skips the blur below U.gooey * U.postBlur > 0.01 (max postBlur = 1.5).
      return (settings.gooeyEffect ?? 0) <= 0.007 && 'needs Gooey Blending above 0';
    case 'stockGrain':
    case 'stockWeave':
    case 'stockGate':
      return (settings.stock ?? 0) <= 0.001 && 'needs Film Stock above 0';
    case 'stockGrainSize':
      if ((settings.stock ?? 0) <= 0.001) return 'needs Film Stock above 0';
      return (settings.stockGrain ?? 0) <= 0.001 && 'needs Grain above 0';
    default:
      return false;
  }
}
