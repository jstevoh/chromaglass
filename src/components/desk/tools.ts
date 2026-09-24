/**
 * The plate's tools, with the letter that picks each one — one list, for both
 * desks.
 *
 * Perform used to carry four of them (Drop, Blow, Press, Finger) and Design
 * all eight, so a look built with a pour or a spray could not be touched up
 * the same way once it was live, and the keys for the other four worked in
 * Perform with nothing on screen saying so. Drop, Spray, Splat, Pour and
 * Streak lay liquid, Blow moves it, Press squeezes it, and Finger mixes it —
 * the only one that changes what the liquid *is* rather than where. Magnet
 * holds the magnet under the glass where the pointer is, which is how the
 * ferrofluid is moved by hand; on a look with no ferrofluid it has nothing to
 * pull.
 */
export const DESK_TOOLS = [
  ['dropper', 'Drop', 'D'], ['spray', 'Spray', 'S'], ['splatter', 'Splat', 'X'],
  ['pour', 'Pour', 'O'], ['streak', 'Streak', 'K'], ['blow', 'Blow', 'W'], ['press', 'Press', 'P'],
  ['finger', 'Finger', 'G'], ['magnet', 'Magnet', 'M'],
] as const;
