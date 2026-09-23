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

// ─── Palette contracts ───────────────────────────────────────────────
// A projected clock face carries two or three dyes, and the richness of a
// show comes from stacking plates, not from rainbow dye. Each preset names the
// palette indices it may use; seeding, automation, beat injection and the
// slow harmony rotation all pick from inside that set. A user's palette lock
// still wins outright.
export const PRESET_CONTRACTS: Record<string, number[]> = {
  'classic':            [0, 2, 8],
  'galaxy':             [9, 10, 7],
  'deep-ocean':         [7, 9, 5],
  'cyberpunk':          [6, 10, 2],
  'lava-lamp':          [0, 1, 3],
  'acid-trip':          [8, 3, 0, 10],
  'bass-drop':          [8, 3, 0],
  'timbre-shifter':     [2, 8, 0],
  'boiling-point':      [0, 1, 3],
  'microscopic-chaos':  [9, 10, 5],
  'aurora-borealis':    [5, 6, 10, 7],   // greens and purples, as it says: there was no purple in it
  'solar-flare':        [0, 1, 3],
  'jellyfish-bloom':    [2, 11, 10],
  'fractal-dream':      [6, 10, 2],
  'velvet-underground': [9, 10, 4],
  'neon-coral-reef':    [0, 6, 2],
  'stardust-collapse':  [7, 15, 5],
  'lumia':              [10, 7, 1],
  'sensual-laboratory': [14, 12],
  'oil-wheel':          [0, 6, 8],
  'poster-1969':        [2, 6],
  'fillmore-1969':      [1, 0, 3, 7, 5, 10],
  'fillmore-wash':      [5, 10, 9],            // the second projector: emerald, purple, cobalt
  'oil-on-water':       [0, 1],
  'colorful-cosmos':    [9, 2, 0],
  'sunny-side-up':      [7, 10, 2],
  // Warm, fully-saturated sets only: white and graphite wash out fast under
  // subtractive mixing, and at this magnification the highlights and the
  // blacks come from the cell rings and lacing, not from the dye.
  'macro-bead':         [0, 1, 3, 2],
  'cell-bloom':         [0, 1, 2, 3],
  'lace-run':           [0, 1, 4, 3],
  // Six dyes rather than the usual two or three: the point of this one is that
  // a person gets a colour of their own, and a crowd wants more than three.
  'crowd-plate':        [0, 2, 5, 7, 9, 10],
  // The three built on the liquids. Food colouring for the marbling dish,
  // interference hues for the film, and slow deep dyes for the shear.
  'milk-marble':        [0, 2, 8, 6],
  'soap-film':          [7, 10, 5],
  'glycerine-drift':    [9, 10, 4, 1],
};

export const PRESET_INJECT_STYLES: Record<string, string[]> = {
  'classic':            ['drop'],
  'galaxy':             ['spray', 'streak'],
  'deep-ocean':         ['pour', 'drop'],
  'cyberpunk':          ['streak', 'splatter'],
  'lava-lamp':          ['pour'],
  'acid-trip':          ['splatter', 'spray'],
  'bass-drop':          ['splatter', 'drop'],
  'timbre-shifter':     ['spray'],
  'boiling-point':      ['spray', 'splatter'],
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
  'sunny-side-up':      ['pour', 'drop'],
  'macro-bead':         ['drop', 'splatter'],
  'cell-bloom':         ['drop'],
  'lace-run':           ['pour', 'streak'],
  'milk-marble':        ['drop'],
  'soap-film':          ['pour', 'drop'],
  'glycerine-drift':    ['pour', 'streak'],
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
  // Points of light that must not feather at the edge, and are white anyway.
  'galaxy':             ['water', 'milk'],
  // Syrup is heavier than the water it is in, so it goes down the slope
  // while everything else drifts — which is what depth looks like.
  'deep-ocean':         ['water', 'glycerine', 'syrup'],
  // Neon wants hard edges and punched holes, not a soft wash.
  'cyberpunk':          ['water', 'silicone'],
  // A blob that crawls while the oil around it climbs — which is the lamp.
  // Alcohol is lighter than all of it and carries heat, so it is what goes
  // up: the lamp needs something to rise, not only something to sit.
  'lava-lamp':          ['oil', 'glycerine', 'milk', 'alcohol'],
  'acid-trip':          ['soap', 'silicone'],
  // Each hit blows a clear hole and the colour runs off the rim of it.
  'bass-drop':          ['water', 'soap'],
  // This one is about colour and rotation; the plate should stay out of it.
  'timbre-shifter':     ['water'],
  // A film breaking open is what boiling looks like from above.
  'boiling-point':      ['water', 'soap'],
  'microscopic-chaos':  ['oil', 'silicone'],
  // Curtains have to drape rather than blow away: body, not tension.
  'aurora-borealis':    ['water', 'glycerine'],
  // Heat drives this one, and alcohol is the liquid that answers heat.
  'solar-flare':        ['water', 'soap', 'alcohol'],
  // A bell holds its shape and lags the water it is drifting in.
  'jellyfish-bloom':    ['water', 'milk'],
  'fractal-dream':      ['water', 'silicone'],
  // Pools that stay pools while the plate churns underneath them.
  // Pools that stay pools while the plate churns underneath them, with
  // syrup settling under the ink rather than mixing into it.
  'velvet-underground': ['ink', 'glycerine', 'syrup'],
  // Filaments are what a Marangoni front curls into.
  'neon-coral-reef':    ['water', 'soap', 'silicone'],
  'stardust-collapse':  ['water', 'soap'],

  // ── The light-show and photographic looks ────────────────────────
  // Wilfred's plate is nearly clear; what moves it is thickness, not dye.
  'lumia':              ['water', 'glycerine'],
  // Boyle put reactions on the platen — cells growing, then carried off.
  'sensual-laboratory': ['silicone', 'soap'],
  'oil-wheel':          ['oil', 'silicone'],
  // The flat hard-edged poster: two dyes that refuse to blend into a third.
  // This is the look the repel channel was written for.
  'poster-1969':        ['milk', 'ink'],
  'oil-on-water':       ['oil', 'silicone', 'water'],
  // Round drops that stay round for as long as the photograph does.
  'colorful-cosmos':    ['milk', 'oil'],
  // Interference colour lives on a thin film, and soap is what thins it.
  'sunny-side-up':      ['oil', 'soap'],
  // Razor edges and lacing on the same bead.
  'macro-bead':         ['silicone', 'milk'],
  // Silicone oil is literally how a pour painter makes cells.
  'cell-bloom':         ['silicone', 'oil'],
  'lace-run':           ['soap', 'silicone'],
  'fillmore-1969':      ['oil', 'silicone', 'milk'],
  // Hands on the glass: every dancer breaks the film a little.
  'crowd-plate':        ['water', 'soap'],

  // ── The three that only exist because the liquids do ─────────────
  'milk-marble':        ['milk', 'milk', 'soap'],
  'soap-film':          ['soap', 'water'],
  'glycerine-drift':    ['glycerine', 'water'],
};

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
