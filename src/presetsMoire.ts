import type { VisualizerSettings } from './types';

/**
 * The moiré pack's looks (PLAN 42a): six of the house looks with a pair of
 * the pack's sheets on the stage. Each starts from a look that already
 * ships, so the liquid is one people know, and sets only what the sheets
 * need: which two, how they sit, and the lamp.
 *
 * Lamp Ground is 1 on every one. The sheets are filters on the lamp's light;
 * on a look that paints its dye as light on black, the bare glass is black
 * and a filter over black is black, so the fringes would show only through
 * the dye. On the real stage the lamp is always under the sheets.
 *
 * Sound reaches the sheets only through patch cords (fast readings, the
 * owner's rule): a kick nudges a turn, the bass slides a sheet or wiggles a
 * groove. Never the frame: the sheets move, the picture does not.
 */
export const MOIRE_LOOKS: readonly {
  id: string; name: string; description: string; from: string; settings: Partial<VisualizerSettings>;
}[] = [
  {
    id: 'moire-star',
    name: 'Moiré Star',
    description: 'Two swept spoke sheets, one face down, crossing into a field of diamonds that wheels as the top sheet turns. A kick nudges the turn.',
    from: 'classic',
    settings: {
      lampGround: 1, moireAmount: 1, moireSheetA: 'spokes', moireSheetB: 'spokes', moireFlip: true,
      moireDensity: 40, moireAngle: 3, moireSpin: 0.4, moireCurl: 0.35, moireGap: 3,
      sceneMappings: [{ source: 'hits', feature: 'kickHit', setting: 'moireAngle', depth: 0.008 }],
    },
  },
  {
    id: 'moire-ripple',
    name: 'Moiré Ripple',
    description: 'Two ring sheets slid a little apart: curved fringes like a pond, and every pool of dye bends them. The bass slides the top sheet.',
    from: 'oil-and-water',
    settings: {
      lampGround: 1, moireAmount: 1, moireSheetA: 'rings', moireSheetB: 'rings', moireFlip: false,
      moireDensity: 44, moireAngle: 0, moireSlide: 0.035, moireGap: 5,
      sceneMappings: [{ source: 'bands', feature: 'bass', setting: 'moireSlide', depth: 0.03 }],
    },
  },
  {
    id: 'moire-garden',
    name: 'Quasicrystal Garden',
    description: 'Two five-fold quasicrystal sheets turning slowly against each other: flowers bloom and fold back that no grid can make.',
    from: 'milk-marble',
    settings: {
      lampGround: 1, moireAmount: 1, moireSheetA: 'quasi', moireSheetB: 'quasi', moireFlip: false,
      moireDensity: 26, moireAngle: 2, moireSpin: 0.15, moireGap: 2,
    },
  },
  {
    id: 'moire-press',
    name: 'Colour Press',
    description: 'Two sheets of cyan, magenta and yellow lines at the printer\'s angles, turned so they beat: fringes in colour over the poster dye.',
    from: 'poster-1969',
    settings: {
      lampGround: 1, moireAmount: 1, moireSheetA: 'inks', moireSheetB: 'inks', moireFlip: false,
      moireDensity: 36, moireAngle: 4, moireSpin: 0.2, moireGap: 2,
      sceneMappings: [{ source: 'hits', feature: 'snareHit', setting: 'moireAngle', depth: 0.005 }],
    },
  },
  {
    id: 'moire-groove',
    name: 'Song Groove',
    description: 'Two record grooves slid apart, their lines wiggled by the bass: the fringes breathe with the song.',
    from: 'velvet-underground',
    settings: {
      lampGround: 1, moireAmount: 1, moireSheetA: 'song', moireSheetB: 'song', moireFlip: false,
      moireDensity: 50, moireAngle: 0, moireSlide: 0.03, moireCurl: 0.15, moireGap: 3,
      sceneMappings: [{ source: 'bands', feature: 'bass', setting: 'moireCurl', depth: 0.5 }],
    },
  },
  {
    id: 'moire-tunnel',
    name: 'Zoom Tunnel',
    description: 'Two log-polar grids, one a shade larger and turning: the fringes spiral inward for ever over the lava.',
    from: 'lava-lamp',
    settings: {
      lampGround: 1, moireAmount: 1, moireSheetA: 'zoom', moireSheetB: 'zoom', moireFlip: false,
      moireDensity: 30, moireRatio: 1.03, moireAngle: 0, moireSpin: 0.5, moireCurl: 0.2, moireGap: 3,
    },
  },
];
