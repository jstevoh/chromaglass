/**
 * What is on the plate for each preset: its dyes, how the automation puts them
 * there, and what liquid they are.
 *
 * These three maps used to live inside `LiquidVisualizer`, next to the code
 * that reads them. They are here instead because they are data about every
 * preset in the app and nothing about them needs a browser — which means
 * `npm run plate` can check that they agree with `presets.ts` and with the
 * liquid list, and catch the one failure none of the others would: a liquid id
 * with a typo in it reads as "this preset has no liquid", silently, forever.
 */
import { DEFAULT_LIQUID_TYPES } from './types';
import type { PhasePourShape } from './lib/phasePour';

// ─── Palette contracts ───────────────────────────────────────────────
// Each preset names the palette indices it may use; seeding, automation,
// beat injection and the slow harmony rotation all pick from inside that
// set. A user's palette lock still wins outright.
//
// Most looks carry five or six dyes, as a family of neighbouring hues and an
// accent, in the order the hue walk visits them (PLAN 18l). They carried two
// or three, from the rule that a projected clock face shows two or three hues
// a frame (the show research of 2026-09-26, PLAN §10), and the hue walk shows
// one fewer than the set, so most looks had two dyes on the plate at once;
// the owner (2026-10-04): "there just aren't enough colours in the presets. I
// want a lot of colour subtlety between colour gradients." Neighbours, not a
// rainbow, because the dye mixes like filters: two neighbours meeting make
// the hues between them, two opposites meeting make mud, so a family gives a
// meeting of colours many in-between hues and the accent one dark seam.
// Left as they were: the looks other work owns (Velvet Underground, Lumia,
// Cell Bloom and the Fillmores get areas of their own; Sensual Laboratory is
// on the lamp; Clock Glass and the ferrofluid looks have their own pass),
// Roy's three printing inks, and the looks whose liquids or chemistry make
// the colour (Oil & Water, Red Cabbage, Chemical Clock).
/*
  How many of a look's dyes are on the plate at once, when nothing narrower
  is asked for (the sequencer's window, or the hue walk's one fewer than the
  set): `harmonyWithin` and `windowOf` in the visualizer. It was three, from
  the same two-or-three-hues rule; with five or six dyes to a family, three
  would hide half of each, and the in-between hues come from neighbours
  meeting on the plate.
*/
export const WORKING_DYES = 5;

/**
 * How many of a contract's n dyes are on the plate at once with nothing
 * narrower asked for: with the hue walk on, one fewer than the set (so the
 * walk shows), at least two and at most WORKING_DYES; with it off, the set,
 * at most WORKING_DYES. `harmonyFromContract` in the visualizer draws this
 * many, and `npm run colours` reads it per look.
 */
export function dyesOnPlate(n: number, journeyOn: boolean): number {
  if (journeyOn && n >= 3) return Math.min(WORKING_DYES, Math.max(2, n - 1));
  return Math.min(n, WORKING_DYES);
}

export const PRESET_CONTRACTS: Record<string, number[]> = {
  'classic':            [0, 17, 2, 20, 18, 8],   // yellow, pink, blue, and amber, magenta and ultramarine between them
  'comet':              [18, 20, 23, 7, 16, 2],
  'galaxy':             [18, 23, 10, 8, 16, 7],
  'deep-ocean':         [16, 19, 7, 9, 22, 18],
  'cyberpunk':          [20, 2, 10, 18, 16, 6],
  'acid-trip':          [18, 20, 2, 21, 17, 6],
  'bass-drop':          [4, 11, 20, 18, 9, 7],
  'timbre-shifter':     [23, 10, 16, 7, 17, 21],
  'microscopic-chaos':  [20, 2, 10, 23, 18, 8],
  'aurora-borealis':    [19, 5, 6, 16, 7, 23, 10], // greens through ice to a violet, as the sky has
  'solar-flare':        [17, 0, 1, 21, 3, 4],
  'jellyfish-bloom':    [20, 2, 23, 10, 16, 7],
  'fractal-dream':      [17, 21, 20, 10, 16, 19],
  'velvet-underground': [18, 20, 11],
  'neon-coral-reef':    [21, 2, 17, 0, 16, 7],
  'stardust-collapse':  [15, 23, 10, 17, 21, 7],
  'lumia':              [10, 7, 1],
  'sensual-laboratory': [14, 12],
  'oil-wheel':          [17, 1, 6, 5, 18, 10],
  'poster-1969':        [1, 21, 17, 18, 10],
  'fillmore-1969':      [1, 0, 3, 7, 5, 10],
  'fillmore-wash':      [5, 10, 9],
  // The dye mixes like filters, so a set is chosen for what its overlaps make:
  // amber over teal is a flat green and amber over ultramarine is mud, which
  // is what the first gallery of this set showed on four plates.
  // The three that show off a part of the app nothing else used.
  'oil-and-water':      [17, 16],             // amber oil, teal water
  'red-cabbage':        [23, 10],             // the indicator itself: violet, and its deep purple
  'chemical-clock':     [7, 15],              // a pale dish for the reaction's own red and blue
  'agate':              [12, 13, 17, 4],      // an agate's browns, its amber and its red bands
  'magnet-garden':      [17, 1, 0],           // one warm family: a bright gold for the dark ferrofluid to stand on
  'ferro-maze':         [15, 7],              // clear and a breath of ice: the light table is the colour, the ferrofluid the ink
  'ferro-paint':        [17, 16, 21],         // amber, teal, coral: amber over teal is the references' green
  'lava-lamp':          [4, 1, 20, 17, 21, 11],  // the wax: crimson, orange, magenta, amber, coral, raspberry
  'roy':                [3, 0, 9],            // red, yellow, cobalt: the three a comic was printed in (the print snaps to them anyway)
  'home-movie':         [1, 21, 17, 0, 16, 19], // the colours a Super 8 cartridge loved
  'clock-glass':        [10, 3, 17, 9],         // purple water; red, amber and cobalt oil (the seed lays the first as the water)
  'oil-on-water':       [0, 17, 1, 21],
  'colorful-cosmos':    [18, 10, 20, 2, 17, 21],
  // Fully saturated sets only: white and graphite wash out fast under
  // subtractive mixing, and at this magnification the highlights and the
  // blacks come from the cell rings and lacing, not from the dye. The three
  // used to share one warm set on three dark reds; each now has its own
  // ground and its own family, so the three read as three.
  'macro-bead':         [16, 19, 17, 21, 1, 7],
  'cell-bloom':         [20, 23, 18, 17],
  'lace-run':           [17, 1, 21, 3, 4, 11],
  // Six dyes of six families rather than one: the point of this one is that
  // a person gets a colour of their own.
  'crowd-plate':        [17, 20, 16, 21, 18, 6],
  // The three built on the liquids. Food colouring for the marbling dish,
  // interference hues for the film, and slow deep dyes for the shear.
  'milk-marble':        [0, 17, 2, 20, 8, 16, 6],
  'soap-film':          [23, 20, 10, 7, 16, 17],
};

export const PRESET_INJECT_STYLES: Record<string, string[]> = {
  'classic':            ['drop'],
  'comet':              ['pour', 'streak'],
  'galaxy':             ['spray', 'streak'],
  'deep-ocean':         ['pour', 'drop'],
  'cyberpunk':          ['streak', 'splatter'],
  'acid-trip':          ['splatter', 'spray'],
  'bass-drop':          ['splatter', 'drop'],
  'timbre-shifter':     ['spray'],
  'microscopic-chaos':  ['drop'],
  'aurora-borealis':    ['streak', 'spray'],
  'solar-flare':        ['splatter', 'streak'],
  'jellyfish-bloom':    ['pour', 'drop'],
  'fractal-dream':      ['streak', 'spray'],
  'velvet-underground': ['pour', 'drop'],
  'neon-coral-reef':    ['streak', 'drop'],
  'stardust-collapse':  ['spray', 'splatter'],
  // These three had no entry and were quietly taking the 'drop' default —
  // found by `npm run plate`, which is the whole reason it exists.
  'lumia':              ['pour'],                 // nothing on this plate arrives suddenly
  'sensual-laboratory': ['drop', 'spray'],        // a reaction started, then spattered across
  'oil-wheel':          ['pour', 'drop'],         // a wheel is filled, not thrown at
  'poster-1969':        ['pour', 'drop'],
  'fillmore-1969':      ['pour', 'drop'],
  'crowd-plate':        ['drop', 'pour'],
  'oil-on-water':       ['drop'],
  'colorful-cosmos':    ['pour'],
  'macro-bead':         ['drop', 'splatter'],
  'cell-bloom':         ['drop'],
  'lace-run':           ['pour', 'streak'],
  'milk-marble':        ['drop'],
  'soap-film':          ['pour', 'drop'],
  'oil-and-water':      ['drop', 'pour'],
  'red-cabbage':        ['drop'],
  'chemical-clock':     ['drop'],
  'agate':              ['drop'],
  'magnet-garden':      ['pour'],                 // a pour is what lays the ferrofluid
  'ferro-maze':         ['pour'],
  'ferro-paint':        ['drop', 'pour'],
  'lava-lamp':          ['pour', 'drop'],         // wax poured in, a drop now and then to start a plume
  'roy':                ['pour', 'drop'],         // big flat shapes, and a drop now and then to break one
  'home-movie':         ['drop', 'pour'],
  'clock-glass':        ['drop'],                 // drops that find the middle of the dome on their own
};

/**
 * What is actually in the dish for each preset.
 *
 * Injection styles say how the automation puts colour on the plate. This says
 * what the colour *is* — and for four of the nine liquids that changes what
 * the plate does for the next half minute, not just how the drop looked going
 * in. Soap makes colour flee and curl; glycerine crawls where the plate flows;
 * milk holds its own edge; silicone opens a ring. The other five carry no
 * behaviour at all, and that is the point of listing them: a run of `water`
 * entries is how a preset says *mostly nothing, once in a while something*.
 * `['water', 'water', 'soap']` is a plate that gets broken open every third
 * dose; `['soap', 'silicone']` is a plate that never stops reacting.
 *
 * A preset with no entry here gets no liquid and behaves exactly as it did
 * before any of this existed, which is what every user preset saved before
 * today does.
 */
export const PRESET_LIQUIDS: Record<string, string[]> = {
  // ── The originals ────────────────────────────────────────────────
  // Oil and water with a drop of soap in it now and then: the thing that is
  // being imitated, done the way it was actually done.
  'classic':            ['water', 'water', 'soap'],
  'comet':              ['syrup', 'glycerine'],
  // Points of light that must not feather at the edge, and are white anyway.
  'galaxy':             ['water', 'milk'],
  // Syrup is heavier than the water it is in, so it goes down the slope
  // while everything else drifts — which is what depth looks like.
  'deep-ocean':         ['water', 'glycerine', 'syrup'],
  // Neon wants hard edges and punched holes, not a soft wash.
  'cyberpunk':          ['water', 'silicone', 'reagent'],
  // A blob that crawls while the oil around it climbs — which is the lamp.
  // Alcohol is lighter than all of it and carries heat, so it is what goes
  // up: the lamp needs something to rise, not only something to sit.
  'acid-trip':          ['soap', 'silicone'],
  // Each hit blows a clear hole and the colour runs off the rim of it.
  'bass-drop':          ['water', 'soap'],
  // This one is about colour and rotation; the plate should stay out of it.
  'timbre-shifter':     ['water'],
  'microscopic-chaos':  ['oil', 'silicone'],
  // Curtains have to drape rather than blow away: body, not tension.
  'aurora-borealis':    ['water', 'glycerine'],
  // Heat drives this one, and alcohol is the liquid that answers heat.
  'solar-flare':        ['water', 'soap', 'alcohol'],
  // A bell holds its shape and lags the water it is drifting in.
  'jellyfish-bloom':    ['water', 'milk'],
  'fractal-dream':      ['water', 'silicone', 'reagent'],
  // Three pools apart, one liquid each, poured into its own area of the
  // dish (lib/plateAreas.ts): glycerine that holds, soap the bass breaks
  // open, syrup that settles. Ink was here, and did nothing a pool showed.
  'velvet-underground': ['glycerine', 'soap', 'syrup'],
  // Filaments are what a Marangoni front curls into.
  'neon-coral-reef':    ['water', 'soap', 'silicone'],
  'stardust-collapse':  ['water', 'soap'],

  // ── The light-show and photographic looks ────────────────────────
  // Wilfred's plate is nearly clear; what moves it is thickness, not dye.
  // And soap, for the one of its three areas whose veil spreads and opens (lib/plateAreas.ts).
  'lumia':              ['water', 'glycerine', 'soap'],
  // Boyle put reactions on the platen — cells growing, then carried off.
  'sensual-laboratory': ['silicone', 'soap'],
  'oil-wheel':          ['oil', 'silicone'],
  // The flat hard-edged poster: two dyes that refuse to blend into a third.
  // This is the look the repel channel was written for.
  'poster-1969':        ['milk', 'ink'],
  'oil-on-water':       ['oil', 'silicone', 'water'],
  // Round drops that stay round for as long as the photograph does.
  'colorful-cosmos':    ['milk', 'oil'],
  // Razor edges and lacing on the same bead.
  'macro-bead':         ['silicone', 'milk'],
  // Silicone oil is literally how a pour painter makes cells.
  'cell-bloom':         ['silicone', 'oil'],
  'lace-run':           ['soap', 'silicone'],
  'fillmore-1969':      ['oil', 'silicone', 'milk'],
  // Hands on the glass: every dancer breaks the film a little.
  'crowd-plate':        ['water', 'soap'],

  // ── The two that only exist because the liquids do ───────────────
  'milk-marble':        ['milk', 'milk', 'soap'],
  'soap-film':          ['soap', 'water'],

  // ── The three that show off a part of the app ────────────────────
  // Oil will not wet the ferrofluid, so the pools stand apart from it.
  'oil-and-water':      ['oil', 'water', 'oil'],
  'red-cabbage':        ['acid', 'base', 'water'],
  'chemical-clock':     ['water'],
  'agate':              ['water'],
  'magnet-garden':      ['water', 'oil'],
  'ferro-maze':         ['water', 'oil'],
  'ferro-paint':        ['water', 'oil', 'water'],
  // Wax that is heavier than the liquid round it, and a liquid thick enough
  // that it falls in plumes rather than drops.
  'lava-lamp':          ['glycerine', 'water'],
  // Poster, 1969's pair: two dyes that hold their own edge and refuse to
  // blend into a third, so a shape stays one ink with a line round it.
  'roy':                ['milk', 'ink'],
  'home-movie':         ['water', 'water', 'soap'],
  // Oil that rounds into bodies, as a clock-glass dish is laid; syrup finds
  // the low point of a curved glass, which is the middle.
  'clock-glass':        ['oil', 'water', 'oil', 'syrup'],
};

/**
 * How each look pours its ferrofluid when it is laid (src/lib/phasePour.ts).
 *
 * Keyed by preset, as the dye's seed is (seedPreset), because it is the plate
 * as the look lays it and not a control: it acts once, when the look is laid
 * or the Ferrofluid slider pours onto a bare plate, and nothing is gained by
 * moving it mid-show. A look not listed pours the ring every look has always
 * poured. `npm run plate` checks every entry is a look that pours any.
 */
export const PRESET_PHASE_POUR: Record<string, PhasePourShape> = {
  // Colored I and II: ferrofluid worked through the colour edge to edge.
  'ferro-paint':        'scatter',
};
/**
 * The one place a look's pour is looked up, for the app and the lab alike.
 * By the built-in id, as the dye's seed is, so a look saved from Ferro Paint
 * under a new name pours the ring, as it lays the default dye.
 */
export const phasePourShape = (presetId: string): PhasePourShape => PRESET_PHASE_POUR[presetId] ?? 'ring';

/** Liquid id to its definition, for the dose the automation pours. */
export const LIQUIDS_BY_ID = new Map(DEFAULT_LIQUID_TYPES.map(l => [l.id, l]));

/**
 * How strong an automated dose is, against a hand on the dropper at 1.
 *
 * A person adds soap once and watches what it does. Automation adds something
 * every second or so for as long as the show runs, so each dose is a fraction
 * of a real one and is scaled again by whatever headroom the plate has left.
 */
export const AUTO_DOSE = 0.35;
