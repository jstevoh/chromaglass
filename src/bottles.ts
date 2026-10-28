// The bottles on the shelf: moved out of types.ts (PLAN 19ai, the size ratchet), which
// re-exports the list, so no importer changed.
import type { LiquidType } from './types';

/*
  Every bottle now says what it *is*, not only what it does.

  The five below carried no behaviour at all: Oil was described as "repels
  water" and Syrup as "very heavy" in prose that nothing read, so a plate of
  oil and a plate of water behaved identically and the descriptions were a
  promise the solver never kept. `weight` and `polarity` are that promise,
  written as numbers — roughly the real ones, because the real ones are what
  makes a dish of them look like a dish of them.

  And each says what colour it is (`own`, lib/liquidColour.ts): the swatches
  were dye colours that said nothing about the liquid (Syrup red-orange,
  Alcohol mint, Glycerine and Silicone a pale blue-grey). Each now pours its
  own colour until a dye is picked for it, and a dye picked tints it. The
  colours are what a dish's depth of each, 6 mm, lets through of the lamp's
  light:
    - Water, Glycerine (water-white, under 10 on the APHA scale), Alcohol,
      Silicone oil, Soap (a surfactant solution: washing-up liquid's green
      is a dye put in it), white vinegar and washing soda are clear.
    - Syrup is amber. The bottle is a 65% sucrose syrup, 147 mPa·s and 1.32
      g/cm³, which is maple syrup's, and maple syrup's colour is graded by
      what 10 mm passes at 560 nm: 50 to 75% for Amber. 62% at 10 mm is 75%
      at 6 mm in the green, and the browning that colours it absorbs about
      four times as hard in the blue and half as hard in the red: about 27%
      and 87% at 6 mm.
    - Sunflower oil is a pale gold: refined, its carotenoids take about a
      fifth of the blue at 6 mm and almost nothing of the rest.
    - Ferrofluid is black (magnetite), and opaque: the plate draws it from
      its phase, and a dye in it could not be seen.
    - Milk is white because it scatters (`scatter`), not because it absorbs.
  Water keeps a blue dye in it by default: it is the bottle a show colours
  with, the first thing a hand drops, and clear water dropped on a black
  ground shows nothing. Its own colour is clear (Natural).
*/
export const DEFAULT_LIQUID_TYPES: LiquidType[] = [
  // The carrier, and therefore the zero of both scales.
  { id: 'water',   name: 'Water',   color: '#4488ff', own: '#ffffff', description: 'Flows freely, spreads evenly',         injectRadius: 3, injectAmount: 0.6, heatAmount: 0.05,
    behaviour: { weight: 0, polarity: 0 } },
  // Lighter than water and about as unlike it as a kitchen gets: it rides up
  // over water and will not mix with it.
  { id: 'oil',     name: 'Oil',     color: '#faf6cc', own: '#faf6cc', description: 'Lighter than water and will not mix with it — rides up and beads',  injectRadius: 2, injectAmount: 1.4, heatAmount: 0.0,
    // Sunflower oil: 49 mPa·s, 0.92 g/cm³, 33 mN/m, n 1.47 (an immiscible
    // bottle: its own phase, the oil, and not the species field).
    behaviour: { weight: -0.12, polarity: -0.9, repel: 0.3, viscosity: 49, density: 0.92, tension: 33, index: 1.47 } },
  // Lighter still, and polar enough to go into water rather than sit on it.
  { id: 'alcohol', name: 'Alcohol', color: '#ffffff', own: '#ffffff', description: 'Light and thin: it rises through water and disperses with heat, and opens holes in a clear film',  injectRadius: 4, injectAmount: 0.3, heatAmount: 0.5,
    // Ethanol: 1.2 mPa·s at 0.79 g/cm³, so a little thinner than water by
    // the kinematic measure that sets a thin gap's drag; 22 mN/m; n 1.361.
    behaviour: { weight: -0.2, polarity: -0.15, solvent: 1, viscosity: 1.2, density: 0.79, tension: 22, index: 1.361 } },
  { id: 'ink',     name: 'Ink',     color: '#cc44ff', description: 'Spreads wide and diffuses slowly',     injectRadius: 5, injectAmount: 0.3, heatAmount: 0.0,
    behaviour: { weight: 0.02, polarity: 0.2 } },
  // The heavy one, and it is sugar in water, so it is polar: it sinks through
  // water without refusing to mix with it.
  { id: 'syrup',   name: 'Syrup',   color: '#debf45', own: '#debf45', description: 'Heavy and polar: it sinks through water and drags where it settles', injectRadius: 2, injectAmount: 2.0, heatAmount: 0.0,
    // A 65% sucrose syrup: 147 mPa·s, 1.32 g/cm³, 76 mN/m, n 1.452.
    behaviour: { weight: 0.35, polarity: 0.6, body: 0.5, viscosity: 147, density: 1.32, tension: 76, index: 1.452 } },

  // The four that change what the plate does rather than only what colour it
  // is. Each writes into the liquid field, and the field goes on acting for as
  // long as the liquid is there — which is the whole difference between soap
  // and a blue dye called Soap.
  // The Turing reaction's own solution, CIMA's: chlorine dioxide, iodine and
  // malonic acid, a pale straw from the free iodine, which is its colour out
  // of the box. The pattern it grows prints in starch-iodine indigo
  // (TURING_PRODUCT, lib/chemistry.ts). It poured a hot pink before.
  { id: 'reagent', name: 'Turing Reagent', color: '#f5e69e', own: '#f5e69e', description: 'Feeds the Turing reaction where it lands', injectRadius: 3, injectAmount: 0.6, heatAmount: 0.0,
    behaviour: { reagent: 1, weight: 0.02 } },
  { id: 'soap',      name: 'Soap',      color: '#ffffff', own: '#ffffff',
    description: 'Breaks the film: colour runs away from it and curls into filaments',
    // 0.12 before, which was physically right and a usability trap: the
    // bottle still carries a colour swatch and a colour picker, so picking
    // Cherry Red with Soap selected laid so little dye that what you saw was
    // the plate underneath — it read as "red is broken". Picking a colour is
    // a statement of intent, so it has to land. Still the lightest bottle
    // there is: a fifth of syrup, and soap goes on thinning what it lands in.
    injectRadius: 3, injectAmount: 0.4, heatAmount: 0.0,
    // Amphiphilic: one end likes water and the other does not, so it sits at
    // the boundary rather than choosing a side. Near zero, and weightless.
    behaviour: { soap: 1, weight: -0.02, polarity: -0.25 } },
  { id: 'milk',      name: 'Milk',      color: '#ffffff', own: '#ffffff',
    description: 'A pale ground that holds its own edge instead of blending away',
    injectRadius: 4, injectAmount: 2.0,  heatAmount: 0.0,
    // Whole milk: 2.0 mPa·s, 1.03 g/cm³, 46 mN/m, n 1.345. Thin: what holds
    // its edge is `repel`, not a body (18d keeps that as a named stand-in).
    behaviour: { repel: 1, body: 0.35, weight: 0.03, polarity: 0.45, viscosity: 2.0, density: 1.03, tension: 46, index: 1.345, scatter: 2 } },
  { id: 'silicone',  name: 'Silicone',  color: '#ffffff', own: '#ffffff',
    description: 'Shoulders colour aside into a ring — the cell maker',
    // 0.05 before — forty times less than syrup, which made every colour
    // picked with Silicone selected invisible on a live plate.
    injectRadius: 3, injectAmount: 0.35, heatAmount: 0.0,
    // The least polar thing on the shelf, which is why it shoulders colour
    // aside instead of tinting it.
    // A 50 cSt silicone oil (PDMS): 48 mPa·s, 0.96 g/cm³, 21 mN/m, n 1.402;
    // immiscible, so the oil's phase, not the species field.
    behaviour: { soap: 0.8, repel: 0.45, weight: -0.04, polarity: -0.95, viscosity: 48, density: 0.96, tension: 21, index: 1.402 } },
  /*
    Acid and base, for a pH indicator in the dye (docs/physics-plan.md): they
    do nothing to the flow, and with pH Indicator up the dye they land in
    turns pink (acid) or green (base), and they neutralise where they meet.
  */
  { id: 'acid',      name: 'Acid',      color: '#ffffff', own: '#ffffff',
    description: 'Vinegar: turns a pH indicator in the dye pink, and neutralises a base',
    injectRadius: 4, injectAmount: 0.3, heatAmount: 0.0,
    behaviour: { acid: 1 } },
  { id: 'base',      name: 'Base',      color: '#ffffff', own: '#ffffff',
    description: 'Washing soda: turns a pH indicator in the dye green, and neutralises an acid',
    injectRadius: 4, injectAmount: 0.3, heatAmount: 0.0,
    behaviour: { acid: -1 } },
  { id: 'glycerine', name: 'Glycerine', color: '#ffffff', own: '#ffffff',
    description: 'Thick and slow: it crawls where it lands while the plate moves past it',
    injectRadius: 2, injectAmount: 1.6,  heatAmount: 0.0,
    // Glycerol: 1412 mPa·s, 1.261 g/cm³, 63.4 mN/m, n 1.4746.
    behaviour: { body: 1, repel: 0.25, weight: 0.26, polarity: 0.8, viscosity: 1412, density: 1.261, tension: 63.4, index: 1.4746 } },
  /*
    Ferrofluid was the plate's, not a bottle: a look laid it, or picking the
    Magnet poured some over the whole plate. As a bottle it goes where it is
    dropped, and only there. Its colour is its own (the dark liquid is drawn
    by the plate, not by the dye), so it lays next to no dye; heavy, oily and
    immiscible, as a real one is (magnetite in a carrier oil).
  */
  { id: 'ferrofluid', name: 'Ferrofluid', color: '#1b1c22', own: '#1b1c22',
    description: 'Black and magnetic: it will not mix, and the Magnet pulls it into spikes and mazes',
    injectRadius: 3, injectAmount: 0.05, heatAmount: 0.0,
    // Ferrotec's EFH1: 6 mPa·s, 1.21 g/cm³, about 29 mN/m; opaque, so no index.
    // Its viscosity reaches the thin gap through the phase (FERRO_NU).
    behaviour: { magnetic: 1, weight: 0.3, polarity: -0.6, viscosity: 6, density: 1.21, tension: 29 } },
];
