/**
 * `npm run startup`'s reading of the opening's lean display (PLAN.md 14v-12,
 * `src/gpu/displayLean.ts`). Beside startup.mjs, which is over 100 KB and
 * may not grow.
 *
 * The lean display is the old way's display for the opening's frames: the
 * same text with the tests that look cannot pass written false, drawing
 * them to the same bytes (`npm run leandisplay`), with the whole one built
 * behind the show. So where the old way built `plate/display bgra8unorm` on
 * its frames, the show's `plate/display bgra8unorm lean 6nqa2x` ahead is that
 * pipeline built ahead: priced as it in 1b's split of the wait, and counted
 * as it in "every pipeline it asked for ahead was built ahead". Without
 * this, on the Mac's first run of 14v-12 (job 132612767004), its compile
 * (1.78 s) read as the page's own wait (3.48 s against 1.11 s for
 * ?prepare=0) and the display as never built ahead ("not: plate/display
 * bgra8unorm"), while the show was moving for good 5.8 s sooner.
 */

/** A pipeline's name as the old way's list names it: a lean display is the display. */
export const asOldWay = (name) => name.replace(/ lean [0-9a-z]+$/, '');
