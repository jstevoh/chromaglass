import type { VisualizerSettings } from '../types';

/**
 * Why a control in the Lens panel does nothing in the current mode, or
 * `false` when it is live.
 *
 * Shared by the desk panels (which keep all controls mounted as knobs and grey
 * inactive ones out) and the settings / phone sheets so both surfaces agree on
 * which dials are gated off and tell the performer what turns each one on.
 */
export function settingDisabledReason(
  key: keyof VisualizerSettings | string,
  settings: Partial<VisualizerSettings>,
): string | false {
  switch (key) {
    case 'focus':
    case 'aperture':
    case 'bloom':
    case 'chromaticAberration':
    case 'refraction':
      return (settings.camera ?? 0) <= 0.001 && 'needs Lens above 0';
    case 'filmPhysics': {
      const thin = (settings.thinFilm ?? 0) > 0.001;
      const zoom = (settings.macroZoom ?? 1) > 1.05;
      // On the wide plate (`wgsl/plate.ts`), bubble iridescence begins past 0.25.
      const irid = (settings.iridescence ?? 0) > (zoom ? 0.001 : 0.25);
      return !thin && !irid && 'needs Thin Film or Iridescence';
    }
    case 'soapFilmRate':
    case 'soapFilmAngle':
    case 'soapFilmTilt':
      return (settings.soapFilm ?? 0) <= 0.001 && 'needs Soap Film above 0';
    case 'glowShear':
    case 'glowRecharge':
      return (settings.glow ?? 0) <= 0.001 && 'needs Glow above 0';
    case 'lensStop':
      return (settings.glitter ?? 0) <= 0.001 && 'needs Glitter above 0';
    case 'tankFeed':
    case 'tankWeight':
    case 'tankNozzle':
    case 'tankDrain':
    case 'tankHue':
      return (settings.tank ?? 0) <= 0.001 && 'needs Tank above 0';
    default:
      return false;
  }
}
