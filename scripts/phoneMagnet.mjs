/**
 * The Magnet's Size slider on the phone, driven end to end and read back from
 * the app (`npm run phone`; moved here from phone.mjs, which is at its size
 * ceiling, when the dial's end moved).
 *
 * The end is the registry's, not a copy: Magnet Size ran 0 to 1 and runs on to
 * 1.5 since PLAN 27h-1 (the owner, 2026-10-31: every dial from very gentle to
 * very extreme). The check read 1 as the end and so failed on all nine screens
 * the day the phone's slider was given the dial's own range, which is the
 * failure a copied number is for.
 */
import { PIN_RANGE } from '../src/lib/deskPins.ts';

export const MAGNET_SIZE_TOP = PIN_RANGE.get('magnetSize').max;

/** Whether Size sits under the Amount, and the setting at its slider's End, its Home, and ten steps back up. */
export async function magnetSizeEnds(page, shown, box) {
  let sizeUnder = false, sizeUp = null, sizeBack = null, sizeReset = null;
  if (shown) {
    const amountBox = await box(page, 'phone-amount-slider'), sizeBox = await box(page, 'phone-magnet-size');
    sizeUnder = !!amountBox && !!sizeBox && sizeBox.y >= amountBox.y + amountBox.height - 1;
    const setting = () => page.evaluate(() => window.chromaglassDebug?.().settings?.magnetSize ?? null);
    await page.getByTestId('phone-magnet-size').locator('input').focus();
    await page.keyboard.press('End');
    await page.waitForTimeout(200);
    sizeUp = await setting();
    await page.keyboard.press('Home');
    await page.waitForTimeout(200);
    sizeBack = await setting();
    // Ten steps of 0.05 back to the middle, through the slider, and read back.
    for (let k = 0; k < 10; k++) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    sizeReset = await setting();
  }
  return { sizeUnder, sizeUp, sizeBack, sizeReset };
}
