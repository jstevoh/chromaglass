/**
 * What the composite is told, worked out once (docs/webgpu-plan.md, P3).
 *
 * This mapping — the show's frame and its settings to the plate's uniforms —
 * used to live inside the WebGL `drawFrame`, several hundred `uniform1f` calls
 * deep. Both engines are told the same things, so it is here, once, writing
 * into a `UniformPack` rather than into a context. Every clamp, every `?? 0.35`
 * that a look saved before a setting existed relies on, and every conditional
 * was the WebGL path's, copied: a gate called `npm run uniforms` checked the
 * two field for field, so a tidied default read as a failure. The WebGL path
 * and that gate both went at P7 — these clamps and defaults are now load
 * bearing on their own, and changing one changes what every saved look does.
 *
 * The twelve textures are not here — they are bindings, not buffer fields.
 */

import { hexToRgb, PALETTE_RGB } from '../constants';
import type { VisualizerSettings } from '../types';
import type { UniformPack } from './uniforms';
import { PER_CELL, SPLAT_SCALE } from './particles';

/** The grid the look was tuned on: `GRID_SIZE` in LiquidVisualizer. */
export const LOGICAL_GRID = 192;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * The frame, as the uniforms read it.
 *
 * Structurally `FrameView` from LiquidVisualizer, narrowed to the parts the
 * mapping touches and to plain numbers — no DOM, no GL — so this file does not
 * import the component (which imports it), and so a harness can hand it an
 * object it made up. A real `FrameView` satisfies it as it stands.
 */
export interface PlateView {
  settings: VisualizerSettings;
  /** The simulation clock, which the speed control governs. */
  time: number;
  /** Where the macro camera is parked, in fluid UV, and how far in it is. */
  shot: { cx: number; cy: number; zoom: number };
  /** How far into the macro closeup: 0 at the plate, 1 once it is in. */
  macroAmount: number;
  isDarkBlend: boolean;
  /** The frame's flow in fluid-UV a second, for advecting procedural detail. */
  flowRate: number;
  /** Where each plate has turned to. */
  rotations: number[];
  /** The working harmony, as indices into `PALETTE_RGB`. */
  harmony: number[];
  /** Where the lamp and its second have wandered to, under the plate. */
  lamp: { x: number; y: number; x2: number; y2: number };
  gelAngle: number;
  /** Where the mirror rig has turned to, accumulated on the CPU. */
  kaleidoPhase: number;
  /** The second plate's throw: how magnified, and how far it has drifted. */
  layer1: { zoom: number; dx: number; dy: number };
  /** How many bubbles are on the plate and how strongly they read. */
  bubbles: { count: number; strength: number };
  /** Their geometry, packed: MAX_BUBBLES vec4s in each array. */
  bubblePack: { packed: Float32Array; shape: Float32Array };
  /** The flash guard's gain, from the luminance the last frame read back. */
  dimmerGain: number;
  /** The exposure the film histogram settled on. */
  filmLevel: number;
  filmGain: number;
  /**
   * The mark laid over the finished frame, and its own aspect. Null when none
   * is loaded, which is what keeps `markOn` at 0 and the rect at its default.
   */
  mark: { aspect: number } | null;
  /**
   * The film projector. There is only a frame to project once the video has
   * one, which is what `filmOn` and the cover-fit are decided from.
   */
  film: {
    kind: 'none' | 'file' | 'camera' | 'window';
    video: { readyState: number; videoWidth: number; videoHeight: number } | null;
  };
}

/**
 * A layer, as the uniforms read it: `FluidSimulation`, and of it only the
 * solver, because that is where the grid and the pigment coordinates are.
 */
export interface PlateFluid {
  gpu?: {
    /** The physical grid it is solving on. */
    readonly N: number;
    /** The crossfade between the pigment's two phases. */
    readonly grainMix: number;
    /** The coordinates the pigment rides, where the device can carry them. */
    readonly grainTexture?: unknown;
  } | null;
}

/** Everything the mapping needs that is not a setting. */
export interface PlateContext {
  /** What the show decided this frame. */
  view: PlateView;
  /** The layers, in order. How many there are is what the shader composites. */
  fluids: PlateFluid[];
  /** The drawing buffer, in device pixels — `u_resolution`. */
  width: number;
  height: number;
  /**
   * The derive pass ran, so the composite reads each plate's neighbourhood
   * from a texture instead of working it out per screen pixel. The plate
   * always has one, so this is always true; it stays a field because the
   * shader still takes it and an effect may one day want it off.
   */
  derived: boolean;
  /**
   * The grid actually sitting in the layer textures: the packed texture's
   * width. Left out, it falls back to the lead solver's N, or the logical
   * grid.
   */
  grid?: number;
  /** The 192-cell grid the look was tuned on. Only a harness changes it. */
  logicalGrid?: number;
  /**
   * The camera pass will draw this frame, so the plate leaves the grain to it.
   * WebGL: the pass exists, is ok, and Camera is above 0.001. Default false,
   * which is the WebGPU plate today.
   */
  cameraOn?: boolean;
  /**
   * The post chain will run, so the plate does not finish the frame itself.
   * WebGL: `view.postForce || postTest.mode > 0`, and the chain built ok.
   * Default false.
   */
  postChain?: boolean;
}

/**
 * Fill `pack` from `ctx`. Every one of the layout's fields is written, in the
 * order the WebGL path sets them, so the two can be read side by side.
 */
export function fillPlateUniforms(pack: UniformPack, ctx: PlateContext): void {
  const { view, fluids, width, height } = ctx;
  const s = view.settings;
  const logicalGrid = ctx.logicalGrid ?? LOGICAL_GRID;

  // ── Worked out before the uniforms, as the WebGL path does ────────

  // Pigment coordinates, one plate per unit. A layer without them (the CPU
  // solver, or a context without float render targets) leaves the shader on a
  // screen-fixed grain, which is why this is per-frame, not per-layer: the
  // second plate borrows the lead's coordinates when it has none, so only the
  // lead's decide it.
  /*
    The plate's own grain gives way to the stock's (F1, filters-plan E6).

    Two grains at once is the one thing this effect must not do: the plate's
    is pigment settling in the dye, the stock's is dye clouds in the film, and
    a frame carrying both reads as noise rather than as either. The stock is
    photographing the plate, so it wins — and at half strength the plate's is
    already halfway out of the way.
  */
  const gran = clamp01(s.granulation ?? 0) * (1 - clamp01(s.stock ?? 0));
  const leadGrain = fluids[0]?.gpu?.grainTexture ?? null;
  const grainOn = gran > 0.002 && Boolean(leadGrain) ? 1 : 0;

  // The mark, if one is loaded. `markOn` is the mix itself, not a flag, and
  // the rect keeps its centred default whenever there is nothing to draw.
  let markOn = 0;
  const markRect = [0.5, 0.5, 0.5, 0.5];
  {
    const mk = view.mark;
    if (mk) {
      const mix = clamp01(s.markMix ?? 1);
      if (mix > 0.002) {
        markOn = mix;
        // Width is the setting; height follows the image's own aspect
        // against the frame's, so a wide logo is not stretched tall on
        // a 16:9 wall and squat on a 4:3 one.
        const halfW = Math.max(0.002, (s.markScale ?? 0.22)) * 0.5;
        const frameAspect = width / Math.max(1, height);
        markRect[0] = clamp01(s.markX ?? 0.5);
        markRect[1] = clamp01(s.markY ?? 0.12);
        markRect[2] = halfW;
        markRect[3] = halfW * (frameAspect / Math.max(0.01, mk.aspect));
      }
    }
  }

  // The film projector's frame, if one is playing.
  let filmOn = 0;
  let filmScaleX = 1, filmScaleY = 1;
  {
    const f = view.film;
    const v = f.video;
    if (f.kind !== 'none' && v && v.readyState >= 2 && v.videoWidth > 0) {
      filmOn = 1;
      // Cover-fit: crop whichever axis the frame has too much of.
      const va = v.videoWidth / v.videoHeight, ca = width / height;
      if (va > ca) filmScaleX = ca / va; else filmScaleY = va / ca;
    }
  }

  // ── The uniforms ──────────────────────────────────────────────────

  pack.set('derivedOn', ctx.derived ? 1 : 0);
  pack.set('layerCount', fluids.length);
  pack.set('rotation0', view.rotations[0] ?? 0);
  pack.set('rotation1', view.rotations[1] ?? 0);
  pack.set('resolution', width, height);
  pack.set('gooey', s.gooeyEffect ?? 0);
  pack.set('darkBlend', view.isDarkBlend ? 1 : 0);

  // Map blend mode string to int: screen=0, lighter=1, exclusion=2, multiply=3, overlay=4
  const blendModeMap: Record<string, number> = {
    'screen': 0, 'lighter': 1, 'exclusion': 2, 'multiply': 3, 'overlay': 4,
  };
  pack.set('blendMode', blendModeMap[s.blendMode] ?? 0);

  pack.set('ledPlatform', s.ledPlatform ? 1 : 0);
  const ledModeMap: Record<string, number> = { 'single': 0, 'ocean': 1, 'fire': 2, 'cyberpunk': 3, 'rainbow': 4 };
  pack.set('ledMode', ledModeMap[s.ledMode] ?? 0);

  // Parse ledColor hex to vec3
  const lcRgb = hexToRgb(s.ledColor ?? '#ffffff');
  pack.set('ledColor', lcRgb.r, lcRgb.g, lcRgb.b);

  const ledAngle = view.time * (s.ledSpeed ?? 1) * 0.5 / (2 * Math.PI);
  pack.set('ledAngle', ledAngle);
  pack.set('time', view.time);
  pack.set('glossiness', s.glossiness ?? 0);
  pack.set('saturation', s.saturationBoost ?? 1.35);
  pack.set('colourBody', Math.max(0, Math.min(1, s.colourBody ?? 0)));
  pack.set('boundaryContrast', s.boundaryContrast ?? 0.35);
  pack.set('edgeRelief', s.edgeRelief ?? 0);
  pack.set('lacing', clamp01(s.lacing ?? 0));
  pack.set('exposure', clamp01(s.exposure ?? 0));
  pack.set('transmission', clamp01(s.transmission ?? 0.5));
  // The dimmer, with the flash guard's correction folded in. Riding the
  // dimmer rather than adding a pass is what lets one implementation
  // cover the laptop, the projector, a network display and the
  // recorder: every material is already lit through this number.
  const dimmerNow = clamp01(s.dimmer ?? 1) * view.dimmerGain;
  pack.set('dimmer', dimmerNow);
  pack.set('lampWarmth', clamp01(s.lampWarmth ?? 0));
  pack.set('markOn', markOn);
  pack.set('markRect', markRect[0], markRect[1], markRect[2], markRect[3]);
  {
    const k = Math.round(s.kaleidoscope ?? 0);
    pack.set('kaleido', k >= 2 ? Math.min(12, k) : 0);
    pack.set('kaleidoPhase', view.kaleidoPhase);
    pack.set('kaleidoZoom', clamp(s.kaleidoZoom ?? 0.72, 0.2, 2));
  }
  pack.set('dish', clamp01(s.dishVignette ?? 0));
  {
    const lamp = view.lamp;
    pack.set('lamp', lamp.x, lamp.y, 0.55, clamp01(s.lampHotspot ?? 0));
    pack.set('lamp2', lamp.x2, lamp.y2, 0.45, clamp01(s.secondLamp ?? 0));
    pack.set('lightPlay', clamp01(s.lightPlay ?? 0));
    pack.set('iridescence', clamp01(s.iridescence ?? 0));
  }
  {
    const photo = s.renderStyle === 'photo';
    pack.set('photo', photo ? 1 : 0);
    const pa = hexToRgb(s.paperA ?? '#1e5fb8');
    const pb = hexToRgb(s.paperB ?? '#f4c04a');
    pack.set('phaseAmount', clamp01(s.phaseAmount ?? 0));
    pack.set('phIndicator', clamp01(s.phIndicator ?? 0));
    pack.set('bzShow', clamp01(s.bzReaction ?? 0));
    pack.set('liesShow', clamp01(s.liesegang ?? 0));
    pack.set('thickOptics', clamp01(s.thicknessOptics ?? 0));
    pack.set('spectral', clamp01(s.spectralOptics ?? 0));
    pack.set('paperA', pa.r, pa.g, pa.b);
    pack.set('paperB', pb.r, pb.g, pb.b);
    pack.set('droplets', clamp01(s.microDroplets ?? 0));
    pack.set('thinFilm', clamp01(s.thinFilm ?? 0));
  }
  {
    // Lumia and gel colours come from the working harmony, so they
    // stay inside the preset's dyes.
    const h = view.harmony;
    const hc = (i: number) => PALETTE_RGB[h[i % h.length]];
    const a = hc(0), b = hc(1), c2 = hc(2), d = hc(3);
    pack.set('lumia', clamp01(s.lumia ?? 0));
    pack.set('lumiaA', a.r, a.g, a.b);
    pack.set('lumiaB', b.r, b.g, b.b);
    const gel = clamp01(s.gelWheel ?? 0);
    pack.set('gelWheel', gel);
    pack.set('gelAngle', view.gelAngle);
    pack.set('gel0', a.r, a.g, a.b);
    pack.set('gel1', b.r, b.g, b.b);
    pack.set('gel2', c2.r, c2.g, c2.b);
    pack.set('gel3', d.r, d.g, d.b);
    pack.set('beads', clamp01(s.beads ?? 0));
    pack.set('beadDrops', clamp01(s.beadDrops ?? 0));
    // Gathered back to the one plate as the closeup comes in (see `plateAmt` in wgsl/plate.ts).
    pack.set('dishSpread', clamp01(s.dishSpread ?? 0) * (1 - clamp01(view.macroAmount)));
    pack.set('cells', clamp01(s.cells ?? 0));
    pack.set('filmOn', filmOn);
    pack.set('filmMix', clamp01(s.filmMix ?? 0.7));
    pack.set('filmKey', clamp(s.filmKey ?? 0.18, 0, 0.9));
    pack.set('filmScale', filmScaleX, filmScaleY);
  }
  {
    const throw1 = view.layer1;
    const plateAmt = 1 - clamp01(view.macroAmount);
    pack.set('layerZoom1', 1 + (throw1.zoom - 1) * plateAmt);
    pack.set('layerDrift1', throw1.dx * plateAmt, throw1.dy * plateAmt);
    const bubbles = view.bubbles;
    pack.setAll('bubbles', view.bubblePack.packed);
    pack.setAll('bubbleShape', view.bubblePack.shape);
    pack.set('bubbleCount', bubbles.count);
    pack.set('bubbleStrength', bubbles.strength);
  }
  pack.set('postBlur', s.postBlurRadius ?? 0.35);
  // Sampling math follows the texture actually bound; the tuned look
  // (normals, edge lines, macro cells) stays on the logical 192 grid.
  pack.set('gridSize', ctx.grid ?? fluids[0]?.gpu?.N ?? logicalGrid);
  pack.set('logicalGrid', logicalGrid);

  // Macro closeup
  pack.set('camCenter', view.shot.cx, view.shot.cy);
  pack.set('camZoom', view.shot.zoom);
  pack.set('macroOn', view.macroAmount);          // `u_macro` in the GLSL
  pack.set('macroCells', s.macroCells ?? 0.75);
  pack.set('macroCellScale', s.macroCellScale ?? 0.5);
  pack.set('macroLacing', s.macroLacing ?? 0.55);
  pack.set('macroDepth', s.macroDepth ?? 0.5);
  pack.set('macroEdge', s.macroEdgeDetail ?? 0.6);
  pack.set('macroRelief', s.macroRelief ?? 0.7);
  pack.set('flowRate', view.flowRate);
  pack.set('filmLevel', view.filmLevel);
  pack.set('filmGain', clamp(view.filmGain, 0.5, 12));

  /*
    Dye carried by particles (H1).

    `particleNorm` is the splat weight a texel carries when the population is
    all there, so that dividing by it makes the shader's coverage read about
    1 and it can treat the splat as a fraction rather than as a count whose
    meaning moves with the setting. Three factors: four particles a cell;
    each depositing the integral of its kernel, which for (1−r²)² over a disc
    of 1.5 texels is π/3 · 1.5² ≈ 2.36; and each averaging 2/π of its full
    weight over a life that fades in and out. That is 6.0 a texel at an
    amount of 1, and it scales with the amount because the population does.

    It assumes the particles are spread over the whole plate, and they are
    not — they are born only where there is dye, so a plate a third covered
    packs them three times as densely. The shader clamps rather than trusting
    this absolutely, which is what keeps a sparse plate from reading as one
    enormous pile.
  */
  /**
   * Four particles a cell, each depositing the integral of its kernel and
   * averaging 2/π of its weight over a life that fades in and out, spread
   * over a target `SPLAT_SCALE` times finer than the grid in each axis.
   */
  const PARTICLE_NORM = PER_CELL * (Math.PI / 3) * 1.5 * 1.5 * (2 / Math.PI) / (SPLAT_SCALE * SPLAT_SCALE);
  const parts = clamp01(s.particles ?? 0);
  pack.set('particles', parts);
  pack.set('particleMix', clamp01(s.particleMix ?? 0.6));
  pack.set('particleNorm', Math.max(1e-4, PARTICLE_NORM * parts));

  pack.set('grainOn', grainOn);
  pack.set('grainMix', fluids[0]?.gpu?.grainMix ?? 0);
  pack.set('granulation', gran);
  pack.set('grainScale', clamp(s.grainScale ?? 320, 20, 1200));
  pack.set('cameraOn', ctx.cameraOn ? 1 : 0);

  // Into the chain's half floats nothing; into the camera's 8-bit texture
  // still a dither, or a dark ramp bands before the camera sees it.
  pack.set('finishInMain', !ctx.postChain ? 1 : ctx.cameraOn ? 2 : 0);
}
