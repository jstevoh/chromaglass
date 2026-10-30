/**
 * Whether the pass should exist. The optics (refraction, aperture, bloom,
 * chromatic aberration) act at their own settings; Lens only scales the
 * sensor's look (roll-off, vignette, grain). So any of the five being up is
 * enough, where it used to take Lens above 0 for the others to do anything.
 */
export function cameraWanted(s: { camera?: number; refraction?: number; aperture?: number; bloom?: number; chromaticAberration?: number }): boolean {
  return (s.camera ?? 0) > 0.001 || (s.refraction ?? 0) > 0.001 || (s.aperture ?? 0) > 0.001
    || (s.bloom ?? 0) > 0.001 || (s.chromaticAberration ?? 0) > 0.001;
}
