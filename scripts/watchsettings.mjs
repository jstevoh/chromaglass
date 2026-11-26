/**
 * From a gap to the settings that close it (`npm run watch -- ... --vs`, PLAN 47x-12).
 *
 * Maps every comparable measure (`compareDesign`, `comparePhysics`, `reportCard`)
 * to `DEFAULT_SETTINGS` keys (`src/types.ts`). Every entry gives the direction
 * that RAISES the measure (`way: 'raise' | 'lower'`); when a comparison needs to
 * lower a measure, `gapSettings` flips each suggestion's direction.
 *
 * Standing rule: physical controls (dye budget, Beer–Lambert transmission,
 * lamp dimmer/warmth, oil tension, viscosity/gap, advection, diffusion, tilt,
 * turntable spin) are always listed before post grades (`saturationBoost`,
 * `exposure`, `ledContrast`, `postBlurRadius`, `ledHue`), and each line labels
 * which is physics and which is a post grade.
 */

export const MEASURE_SETTINGS = {
  // ─── Colour (compareDesign + reportCard) ──────────────────────────────────
  colourfulness: [
    { key: 'dyeBudget', way: 'raise', kind: 'physics', why: 'concentrates dye added to the plate before mixing' },
    { key: 'transmission', way: 'raise', kind: 'physics', why: 'deepens Beer–Lambert optical path saturation' },
    { key: 'saturationBoost', way: 'raise', kind: 'grade', why: 'post-grade boost; prefer dye budget and optical depth first' },
  ],
  coloured: [
    { key: 'dyeBudget', way: 'raise', kind: 'physics', why: 'covers more of the dish in dye' },
    { key: 'advection', way: 'raise', kind: 'physics', why: 'carries poured colour farther across bare water' },
    { key: 'diffusionRate', way: 'raise', kind: 'physics', why: 'lets dye spread into uncoloured gaps' },
  ],
  hueSpread: [
    { key: 'hueJourney', way: 'raise', kind: 'physics', why: 'steps poured hues wider around the colour wheel' },
    { key: 'polarity', way: 'raise', kind: 'physics', why: 'keeps immiscible dyes separate rather than merging into one hue' },
    { key: 'doubleDiffusion', way: 'raise', kind: 'physics', why: 'separates chemical species into distinct chromatic bands' },
  ],
  hueGap: [
    { key: 'hueJourney', way: 'raise', kind: 'physics', why: 'separates the main pour hues farther in angle' },
    { key: 'ledHue', way: 'raise', kind: 'grade', why: 'shifts the back/stage LED wash hue' },
  ],
  hues: [
    { key: 'hueJourney', way: 'raise', kind: 'physics', why: 'introduces more distinct hues across pours' },
    { key: 'polarity', way: 'raise', kind: 'physics', why: 'prevents nearby dyes from muddying into fewer hues' },
  ],
  warm: [
    { key: 'lampWarmth', way: 'raise', kind: 'physics', why: 'shifts the projector bulb spectrum toward warm tungsten' },
    { key: 'ledHue', way: 'lower', kind: 'grade', why: 'shifts the auxiliary platform LED tint warmer' },
  ],

  // ─── Light and contrast (compareDesign + reportCard) ──────────────────────
  lumMean: [
    { key: 'dimmer', way: 'raise', kind: 'physics', why: 'raises projector lamp brightness at the light source' },
    { key: 'lampHotspot', way: 'raise', kind: 'physics', why: 'brightens condenser illumination across the dish' },
    { key: 'exposure', way: 'raise', kind: 'grade', why: 'post exposure gain; adjust lamp dimmer first' },
  ],
  rms: [
    { key: 'boundaryContrast', way: 'raise', kind: 'physics', why: 'deepens optical contrast across dye and oil rims' },
    { key: 'lampHotspot', way: 'raise', kind: 'physics', why: 'steepens bright-centre to dark-edge dynamic range' },
    { key: 'ledContrast', way: 'raise', kind: 'grade', why: 'post contrast grade; tune optical path and lamp first' },
  ],
  p5: [
    { key: 'lampGround', way: 'raise', kind: 'physics', why: 'illuminates the ground layer under thin dye' },
    { key: 'dimmer', way: 'raise', kind: 'physics', why: 'raises baseline projector floor luminance' },
    { key: 'exposure', way: 'raise', kind: 'grade', why: 'lifts shadow floor in post; adjust lamp ground first' },
  ],
  blackMean: [
    { key: 'transmission', way: 'raise', kind: 'physics', why: 'deepens Beer–Lambert optical absorption in pools toward black' },
    { key: 'lampGround', way: 'lower', kind: 'physics', why: 'keeps the uncoloured ground dark like an overhead room' },
    { key: 'exposure', way: 'lower', kind: 'grade', why: 'darkens overall grade; adjust lamp ground and dye depth first' },
  ],

  // ─── Edges and form (compareDesign + comparePhysics) ─────────────────────
  edgeWidth: [
    { key: 'diffusionRate', way: 'raise', kind: 'physics', why: 'softens boundaries by diffusing dye across interfaces' },
    { key: 'polarity', way: 'lower', kind: 'physics', why: 'lower immiscibility blurs sharp oil-water meniscus rims' },
    { key: 'focus', way: 'lower', kind: 'physics', why: 'softens projector lens focus across the dish' },
    { key: 'postBlurRadius', way: 'raise', kind: 'grade', why: 'adds post gaussian blur; adjust diffusion and lens focus first' },
  ],
  scaleX: [
    { key: 'turbulenceScale', way: 'raise', kind: 'physics', why: 'drives larger coherent flow structures' },
    { key: 'oilTension', way: 'raise', kind: 'physics', why: 'merges small droplets into broader pools' },
    { key: 'macroZoom', way: 'raise', kind: 'physics', why: 'magnifies cells across a larger fraction of the frame' },
  ],
  coherence: [
    { key: 'advection', way: 'raise', kind: 'physics', why: 'draws dye into long parallel flow filaments and streaks' },
    { key: 'vorticityConfinement', way: 'raise', kind: 'physics', why: 'organises shear into clean coherent streams' },
    { key: 'blobSurfaceTension', way: 'lower', kind: 'physics', why: 'lets stretched tendrils persist instead of snapping back round' },
  ],
  forms: [
    { key: 'beads', way: 'raise', kind: 'physics', why: 'breaks sheets into discrete oil beads and droplets' },
    { key: 'oilBodies', way: 'raise', kind: 'physics', why: 'tracks separate non-merging dye bodies' },
    { key: 'turbulenceDetail', way: 'raise', kind: 'physics', why: 'splits large washes with fine turbulence octaves' },
  ],
  elongation: [
    { key: 'blobSurfaceTension', way: 'raise', kind: 'physics', why: 'pulls stretched tendrils into rounder cells' },
    { key: 'filmHold', way: 'raise', kind: 'physics', why: 'prevents close drops from coalescing into long chains' },
    { key: 'advection', way: 'lower', kind: 'physics', why: 'reduces velocity shear stretching' },
  ],
  spectrum: [
    { key: 'turbulenceDetail', way: 'raise', kind: 'physics', why: 'adds high-wavenumber octaves of fine detail' },
    { key: 'sharpness', way: 'raise', kind: 'physics', why: 'sharpens fine colour boundary transitions' },
    { key: 'focus', way: 'raise', kind: 'physics', why: 'tightens projector focus so high frequencies survive' },
    { key: 'postBlurRadius', way: 'lower', kind: 'grade', why: 'reduces post softening; check focus and turbulence detail first' },
  ],

  // ─── Composition ──────────────────────────────────────────────────────────
  mirror: [
    { key: 'kaleidoscope', way: 'raise', kind: 'physics', why: 'adds optical mirror reflection symmetry' },
    { key: 'centerGravity', way: 'raise', kind: 'physics', why: 'pulls fluid weight symmetrically toward the dish centre' },
  ],
  spread: [
    { key: 'advection', way: 'raise', kind: 'physics', why: 'transports light and colour outward across the dish' },
    { key: 'dishVignette', way: 'lower', kind: 'physics', why: 'opens illumination toward the glass rim' },
    { key: 'centerGravity', way: 'lower', kind: 'physics', why: 'stops fluid from gathering tightly in the centre' },
  ],

  // ─── Physics / show motion (comparePhysics) ───────────────────────────────
  own: [
    { key: 'globalSpeed', way: 'raise', kind: 'physics', why: 'increases physical advection pace' },
    { key: 'advection', way: 'raise', kind: 'physics', why: 'pushes stronger fluid currents across the gap' },
    { key: 'damping', way: 'lower', kind: 'physics', why: 'reduces viscous damping so currents travel faster' },
  ],
  carried: [
    { key: 'advection', way: 'raise', kind: 'physics', why: 'increases bulk fluid transport over in-place colour fades' },
    { key: 'diffusionRate', way: 'lower', kind: 'physics', why: 'reduces passive in-place bleeding across boundaries' },
    { key: 'evaporationRate', way: 'lower', kind: 'physics', why: 'preserves dye material along flow trajectories' },
  ],
  turnover: [
    { key: 'globalSpeed', way: 'lower', kind: 'physics', why: 'slows flow so forms cross their own width more slowly' },
    { key: 'gapThickness', way: 'lower', kind: 'physics', why: 'tightens glass gap drag to give slower, stately turnover' },
  ],
  lifetime: [
    { key: 'globalSpeed', way: 'lower', kind: 'physics', why: 'lets compositions hold longer before shearing apart' },
    { key: 'evaporationRate', way: 'lower', kind: 'physics', why: 'keeps dye patterns visible longer' },
    { key: 'soapBreakdown', way: 'lower', kind: 'physics', why: 'preserves thin-film structures longer before rupture' },
  ],
  wholeShare: [
    { key: 'rotationSpeed', way: 'raise', kind: 'physics', why: 'rotates the whole clock glass coherently' },
    { key: 'plateTiltX', way: 'raise', kind: 'physics', why: 'tilts the plate so the whole body drifts together' },
  ],
  curl: [
    { key: 'rotationSpeed', way: 'raise', kind: 'physics', why: 'rotates the dish clockwise' },
    { key: 'spinAuto', way: 'raise', kind: 'physics', why: 'drives continuous turntable rotation' },
  ],

  // ─── Arc, Surprise, Music fit, Restraint (reportCard) ─────────────────────
  reorgPerMin: [
    { key: 'automateRate', way: 'raise', kind: 'physics', why: 'increases how often the look shifts palette and density' },
    { key: 'pacing', way: 'raise', kind: 'physics', why: 'steps more frequently between composition phases' },
  ],
  swellsPerMin: [
    { key: 'surge', way: 'raise', kind: 'physics', why: 'creates distinct rises and releases rather than constant stir' },
    { key: 'automateRate', way: 'raise', kind: 'physics', why: 'modulates pours and energy across phrases' },
  ],
  thirdsSpread: [
    { key: 'surge', way: 'raise', kind: 'physics', why: 'builds larger contrast between quiet and active sections' },
    { key: 'pacing', way: 'raise', kind: 'physics', why: 'shapes distinct beginning, middle and end phases' },
  ],
  peakOver: [
    { key: 'surge', way: 'raise', kind: 'physics', why: 'concentrates energy into peaks above the median pace' },
    { key: 'audioImpact', way: 'raise', kind: 'physics', why: 'lets musical crescendos drive larger physical swells' },
    { key: 'kickBloom', way: 'raise', kind: 'physics', why: 'throws stronger expanding blooms on accents' },
  ],
  surge: [
    { key: 'surge', way: 'raise', kind: 'physics', why: 'shapes alternating busy bursts and quiet holds' },
    { key: 'pacing', way: 'raise', kind: 'physics', why: 'widens phrase contrast over the minute' },
  ],
  sync: [
    { key: 'audioImpact', way: 'raise', kind: 'physics', why: 'couples fluid forces more closely to audio envelope' },
    { key: 'soundImpact', way: 'raise', kind: 'physics', why: 'opens sound-patch modulation depth' },
    { key: 'sensitivity', way: 'raise', kind: 'physics', why: 'lifts audio input gain above noise floor' },
  ],
  lag: [
    { key: 'beatPrediction', way: 'raise', kind: 'physics', why: 'anticipates musical hits earlier' },
    { key: 'beatLead', way: 'raise', kind: 'physics', why: 'advances beat trigger lead time (ms)' },
  ],
  longestRest: [
    { key: 'surge', way: 'raise', kind: 'physics', why: 'opens longer quiet holds between swells' },
    { key: 'damping', way: 'raise', kind: 'physics', why: 'lets fluid settle to rest between moves' },
    { key: 'globalSpeed', way: 'lower', kind: 'physics', why: 'leaves quieter breathing space between pours' },
  ],
  calm: [
    { key: 'surge', way: 'raise', kind: 'physics', why: 'trades steady churn for bursts with calm passages between' },
    { key: 'damping', way: 'raise', kind: 'physics', why: 'calms background drift during quiet bars' },
  ],
};

const flip = way => (way === 'raise' ? 'lower' : 'raise');
const fmtVal = v => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')) : String(v));

/**
 * Given ranked comparison gaps (`{ key, label, size, direction }`) and optional
 * current take `settings`, return `"## Settings to try"` markdown lines for
 * every gap of at least one just-noticeable step, ordering physics controls
 * ahead of post grades.
 */
export function gapSettings(gaps, settings = null) {
  const list = (Array.isArray(gaps) ? gaps : [])
    .filter(g => g && g.size >= 1 && MEASURE_SETTINGS[g.key])
    .sort((a, b) => b.size - a.size);

  if (!list.length) {
    return ['## Settings to try', '', 'No gap reached one just-noticeable step.'];
  }

  const lines = ['## Settings to try', ''];
  for (const g of list) {
    const entries = MEASURE_SETTINGS[g.key];
    // Physical controls strictly precede post grades.
    const physics = entries.filter(e => e.kind === 'physics');
    const grades = entries.filter(e => e.kind === 'grade');
    const ordered = [...physics, ...grades].slice(0, 3);
    const items = ordered.map(e => {
      const turn = g.direction === 'lower' ? flip(e.way) : e.way;
      const cur = settings && e.key in settings ? ` (now ${fmtVal(settings[e.key])})` : '';
      return `${e.kind}: **${turn} \`${e.key}\`**${cur} — ${e.why}`;
    });
    lines.push(`- **${g.label}** (${g.size.toFixed(1)} steps; ${g.direction} to match): ${items.join('; ')}`);
  }
  return lines;
}
