---
name: look
description: Render before/after pictures and numbers for a visual change to the ChromaGlass plate (shaders, bubbles, zoom, lighting, dye) using the lab, which runs the real solver and plate shader on software WebGPU. Use whenever a change is about how something looks, before pushing it, and to show the user.
---

# Look: pictures of a visual change

The full app cannot be photographed in a cloud session (its readbacks are empty
on software WebGPU), but the **lab** can: `scripts/lab.mjs` opens a page with
the real solver and the real plate shader (`scripts/lab-entry.ts`), on a
plate you lay down yourself, the same every time.

## The lab, in one page

```js
import { openLab } from '/home/user/chromaglass/scripts/lab.mjs';
const { page, close } = await openLab();
const px = await page.evaluate(async () => {
  await lab.create(256);                       // grid size
  lab.dye(0.5, 0.5, 0.12, [1.2, 0.3, 0.8], 1.4);  // x, y, radius, absorptions, amount
  lab.flush(); await lab.step(20);             // settle
  // lab.vel(...), lab.addPhase(...), lab.solver().setBubbles(...) for flow, oil, bubbles
  return await lab.render(640,
    { iridescence: 0.5 },                      // any VisualizerSettings
    { zoom: 1, macroAmount: 0, cx: 0.5, cy: 0.5, bubbles: 0 });  // the camera
});
await close();
```

`lab.render` returns RGBA bytes. To see them, turn them into a PNG in the page
(an `OffscreenCanvas`, `convertToBlob`, base64 back to node) and write it to
the **scratchpad**, then open it with the Read tool. `lab-entry.ts` rebuilds on
every `openLab()`, so a shader edit is picked up without a build step.

## Doing it properly

1. **Before and after.** Render the same seeded plate on `git stash` and on the
   change, same settings, same camera. A seeded random (`s = s * 16807 % 2147483647`)
   keeps the plate identical.
2. **Look at it.** Open the PNGs. Say what is wrong in them before saying what
   is right: artifacts (wedges, square halos, banding, seams) show up here first.
3. **Measure it.** One number that captures the claim: mean change between
   frames across a sweep (the zoom's first notch 97.8 → 26), a fine-structure
   count (`npm run microscope`), a radial profile. Put it in the commit.
4. **Show the user.** Send the after picture (and the before if it helps) with
   one line on what to look at.
5. Scripts go in the scratchpad, not in `scripts/`, unless they become a check.

A thing the lab cannot show: timing, the desk, anything driven by the app's
own loop (audio, automation, hand tools). For those, say it needs the owner's
eyes and add it to `docs/judging.md` if it is a matter of taste.
