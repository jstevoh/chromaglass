/**
 * The phone's Dye sheet (`npm run phone`): a bottle picked there is the one in
 * the dock, and its "Palette from a picture or video" makes the picture's
 * colours the palette (PLAN 43d). Moved here from phone.mjs, which is at its
 * size ceiling, when the picture palette's line was added (the bottle's line
 * with it, unchanged, so the sheet's lines live together).
 *
 * Called with the sheet closed and the dock up; leaves the Dye sheet open for
 * the caller to close, as the lines did in place.
 */
export async function dyeSheetLines(page, tap, check) {
  // A bottle from the Dye sheet is the one in the dock.
  await tap(page, 'phone-open-dye');
  await tap(page, 'phone-liquid-ink');
  const dyeLabel = (await page.getByTestId('phone-open-dye').innerText()).trim();
  check('a bottle picked in the Dye sheet is the one in the dock', /ink/i.test(dyeLabel), `dock says "${dyeLabel}"`);

  /*
    A palette from a picture (PLAN 43d), from the same sheet: its button
    hands a file to the desk's own call, and "From picture" joins the
    palettes, locked, in the picture's colours. A cover of four blocks
    made here, so its four colours are known. The palette goes back to
    Auto after, so the rest of the run plays what it did.
  */
  const cover = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    for (const [fill, x, y] of [['#ec1e8c', 0, 0], ['#00a096', 32, 0], ['#fad21e', 0, 32], ['#6432c8', 32, 32]]) { g.fillStyle = fill; g.fillRect(x, y, 32, 32); }
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('phone-picture-palette-input').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from(cover, 'base64') });
  const pictureChip = page.locator('[data-testid="phone-sheet-dye"] button', { hasText: 'From picture' });
  await pictureChip.waitFor({ timeout: 8000 }).catch(() => {});
  const chipPressed = await pictureChip.getAttribute('aria-pressed').catch(() => null);
  const chipColours = await pictureChip.locator('span > span').evaluateAll(els => els.map(e => getComputedStyle(e).backgroundColor)).catch(() => []);
  const want = [[236, 30, 140], [0, 160, 150], [250, 210, 30], [100, 50, 200]];
  const got = chipColours.map(c => (c.match(/\d+/g) ?? []).slice(0, 3).map(Number));
  const close8 = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 8);
  check('the Dye sheet\'s "Palette from a picture or video" makes "From picture" the palette, in the picture\'s four colours',
    chipPressed === 'true' && want.every(w => got.some(g => close8(g, w))), `pressed ${chipPressed}, swatches ${chipColours.join(' ')}`);
  /*
    And the plate took it: the swatches above are the hook's state, so this
    asks the engine itself that its harmony is the four picture slots (24 to
    27, lib/picturePalette.ts). Only where the plate runs, as the fingers.
  */
  const harmony = await page.evaluate(() => (document.querySelector('[data-testid="needs-webgpu"]') ? null : window.chromaglassDebug?.()?.harmony ?? null));
  if (harmony != null || process.env.PHONE_GPU) {
    check('and the plate\'s own harmony is the four picture dyes', String(harmony) === '24,25,26,27', `harmony ${harmony}`);
  } else console.log(' --   the plate has no WebGPU here: its harmony is not asked (PHONE_GPU=1 on the Mac shard asks it)');
  await page.locator('[data-testid="phone-sheet-dye"] button', { hasText: /^Auto$/ }).first().tap().catch(() => {});
}
