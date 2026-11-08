import type { VisualizerSettings } from './types';

/**
 * The moiré pack's looks (PLAN 45a): seven of the house looks with a pair of
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
 * owner's rule): a kick twists the spokes, the bass slides a sheet or wiggles
 * a groove. Never the frame: the sheets move, the picture does not. A sheet's
 * cord takes the last of its house look's cords (presets.ts), and moves its
 * control by at least 3% of its travel, the least `npm run soundpatch` calls
 * moving: a kick on the Turn would have to swing it 11 degrees, which sends
 * line fringes from wide to fine on every beat, so the kick twists the Curl.
 * Over a look with areas (Milk Marbling, Poster) a look adds no sheet cord;
 * Song Groove is laid over Home Movie for that reason, and for its white lamp
 * (Cell Bloom's dark violet LED ring drew the grooves near black).
 */
export const MOIRE_LOOKS: readonly {
  id: string; name: string; description: string; from: string; settings: Partial<VisualizerSettings>;
}[] = [
  {
    id: 'moire-star',
    name: 'Moiré Star',
    description: 'Two swept spoke sheets, one face down, crossing into a field of diamonds that wheels as the top sheet turns. A kick twists the spokes.',
    from: 'classic',
    settings: {
      lampGround: 1, moireAmount: 1, moireSheetA: 'spokes', moireSheetB: 'spokes', moireFlip: true,
      moireDensity: 40, moireAngle: 3, moireSpin: 0.4, moireCurl: 0.35, moireGap: 3,
      sceneMappings: [{ source: 'hits', feature: 'kickHit', setting: 'moireCurl', depth: 0.06 }],
    },
  },
  {
    /*
      PLAN 45a-11. The owner picked this one off the moiré reel of 2026-11-08
      ("I like the waves one"): the clip was Moiré Star's stage with the spoke
      sheets swapped for Waves, laid the same way up. Face down, two wave
      sheets cross their crests and troughs into a lattice of eyes; face up
      the crests stay in step and beat into broad swells that roll across the
      plate as the top sheet turns, which is what the clip showed. The turn is
      Star's less one degree and its spin half, so the swells are wide and
      slow, and Curl (the waves' height) at 0.4 is the clip's. The kick cord
      is Star's: on Waves the Curl is the height of the waves, so a kick
      lifts them and the swells jump with it.
    */
    id: 'moire-waves',
    name: 'Moiré Waves',
    description: 'Two wave sheets turning slowly against each other: their crests beat into broad swells that roll across the dye. A kick lifts the waves.',
    from: 'classic',
    settings: {
      lampGround: 1, moireAmount: 1, moireSheetA: 'waves', moireSheetB: 'waves', moireFlip: false,
      moireDensity: 40, moireAngle: 2, moireSpin: 0.2, moireCurl: 0.4, moireGap: 3,
      sceneMappings: [{ source: 'hits', feature: 'kickHit', setting: 'moireCurl', depth: 0.06 }],
    },
  },
  {
    id: 'moire-ripple',
    name: 'Moiré Ripple',
    description: 'Two ring sheets slid a little apart: curved fringes like a pond, and every pool of dye bends them. The bass slides the top sheet.',
    from: 'clock-glass',
    settings: {
      lampGround: 1, moireAmount: 1, moireSheetA: 'rings', moireSheetB: 'rings', moireFlip: false,
      moireDensity: 44, moireAngle: 0, moireSlide: 0.035, moireGap: 5,
      sceneMappings: [{ source: 'bands', feature: 'bass', setting: 'moireSlide', depth: 0.05 }],
    },
  },
  {
    id: 'moire-garden',
    name: 'Quasicrystal Garden',
    description: 'Two five-fold quasicrystal sheets turning slowly against each other: flowers bloom and fold back that no grid can make.',
    from: 'milk-marble',
    settings: {
      lampGround: 1, moireAmount: 0.6, moireSheetA: 'quasi', moireSheetB: 'quasi', moireFlip: false,
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
    },
  },
  {
    id: 'moire-groove',
    name: 'Song Groove',
    description: 'Two record grooves slid apart, their lines wiggled by the bass: the fringes breathe with the song.',
    from: 'home-movie',
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
      lampGround: 1, moireAmount: 0.6, moireSheetA: 'zoom', moireSheetB: 'zoom', moireFlip: false,
      moireDensity: 30, moireRatio: 1.03, moireAngle: 0, moireSpin: 0.5, moireCurl: 0.2, moireGap: 3,
    },
  },
];
