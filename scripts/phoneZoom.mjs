/**
 * The phone's way into the closeup, driven through its own slider
 * (`npm run phone`; here rather than in phone.mjs, which is at its size
 * ceiling).
 *
 * The microscope at the top of the phone was the closeup's on/off, 4x in and
 * the plate out. The owner asked for the Close-up button gone everywhere and
 * the Macro Zoom to be the way in and out (2026-11-14, PLAN QA-32c), so the
 * microscope opens the Macro Zoom's row instead. This taps it, finds the
 * slider, and sets it to where 4x sits along it, then reads the zoom back from
 * the app: the slider writing the zoom is the feature, so the zoom is not set
 * behind its back. Where 4x sits is the registry's (`travelOfKey`): the slider
 * draws Macro Zoom on its curve, 0 to 1 in steps of 0.001, so thirty steps of
 * 0.1 from 1x (the first version of this) reached 1.01x.
 */
import { travelOfKey } from '../src/lib/deskPins.ts';

/** Tap the microscope, set the Macro Zoom it shows to 4x, and check the app's zoom went there. */
export async function phoneZoomIn(page, tap, check) {
  await tap(page, 'phone-zoom');
  const input = page.getByTestId('phone-zoom-slider').locator('input');
  const shown = (await input.count()) === 1;
  if (!shown) { check('the microscope opens the Macro Zoom', false, 'no Macro Zoom slider on the phone'); return; }
  await input.fill(String(travelOfKey('macroZoom', 4)));
  await page.waitForTimeout(300);
  const zoom = await page.evaluate(() => window.chromaglassDebug?.().settings?.macroZoom ?? null);
  // Focus back off the slider, so the fingers that follow are the plate's.
  await input.evaluate((el) => el.blur());
  check('the microscope opens the Macro Zoom, and walked to 4x the closeup is in', zoom !== null && Math.abs(zoom - 4) < 0.05,
    `the app's Macro Zoom ${zoom} (4 wanted, the slider set to 4x along it)`);
}
