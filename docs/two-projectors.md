# Fillmore's two projectors: PLAN 18b-5 (the owner, 2026-10-11: fix the projector issue for Fillmore)

Found by the showreel review (PLAN 28c, 28d), in the lab:
- fillmore-1969 has lampGround 1, layerCount 2, blendMode 'screen'. On the lamp the back plate
  is a second filter in the same light path whatever the Blend Mode says (src/gpu/wgsl/plate.ts,
  the back plate's lamp branch, ~2829-2838 on 10-11 main). Its wash dyes (emerald, purple,
  cobalt: 'fillmore-wash', LiquidVisualizer.tsx ~2255, laid ~5552) are the complements of the
  front's orange, yellow, cherry, so lamp through both = near black.
- Lab: both plates luma 0.122, 60% near black (Y<0.1); front alone 0.48, 0%. At Dye Budget 0.9
  0.055 / 84%, matching the Mac (luma 0.05 at 40 s). Lamp Warmth is not it (0.004).
- The owner chose NOT to drop the second plate: fix the engine so two plates can be two
  projectors.

The physics: two dishes stacked on one lamp subtract (Beer-Lambert in series: multiply). The
Joshua Light Show's plates were separate overhead projectors aimed at one screen: their light
ADDS on the screen (each its own lamp through its own dish). So:
- Each plate on the lamp ground is its own lamp x exp(-a*amount) term; when the look says the
  plates are separate projectors, the screen gets the SUM (clipped/tone-mapped as the rest of
  the plate is), not the product.
- Decide the switch: a look's Blend Mode 'screen'/'lighter'/'add' under lampGround = separate
  projectors (add); 'multiply'/'normal' = stacked dishes on one lamp (filter, today's
  behaviour). Or a new boolean setting; if new, it needs MIDI, desks, phone, setting-auditor,
  default keeping today's look for every other preset. Mixer rows (18b-5's other half): say
  what a row blend means under the lamp.
- Two projectors' white grounds add to more than white: each projector's empty lamp should be
  dimmer (or the sum normalised) so an empty screen isn't blown. Real JLS: each projector's
  bulb hit the screen, the overlap was brighter.
Checks: `npm run lamp` (byte-for-byte at lampGround 0), `npm run wgsl`, `mixer`, `plate`,
`grainedge`, a `look` render of Fillmore before/after; then the showreel on the Mac
(SHOWREEL_ONLY=fillmore-1969). Every look with lampGround 1 and layerCount 2 changes if the
switch is the blend mode: list them and render each.
Fillmore's description already says two plates, red/orange with cyan and blue against them.
