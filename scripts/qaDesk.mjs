/**
 * The desk's own ways to what `npm run qa`'s opening steps ask for (PLAN 19ak-25).
 *
 * Those steps were written against the floating overlay: its Band button, its
 * preset title menu and its toolbar. The overlay went at every width with 49b
 * (#962, 2026-11-26; its code deleted in 49c-2), and the
 * first of the steps, the Band, waited sixty seconds for a button no longer
 * drawn, so every deploy after it ran five of the suite's checks and stopped.
 * These are the same questions asked of the places the desk keeps the same
 * things. In a module of their own because qa.mjs is held at its size ceiling
 * (`npm run sizes`).
 */

/**
 * Choose a sound source the desk's way: the Settings sheet, its Sound section,
 * the source's button (SoundPanel.tsx, sound-source-<id>), then the sheet shut
 * again. Returns whether that source's button reads as chosen (aria-pressed,
 * the state itself, not its colour: PLAN 35a).
 */
export async function chooseSourceOn(page, clickOn, settle, id) {
  await clickOn('open-all-settings');
  await settle(800);
  await clickOn('settings-nav-audio-input');
  await settle(400);
  await clickOn(`sound-source-${id}`);
  await settle(300);
  const lit = (await page.getByTestId(`sound-source-${id}`).first().getAttribute('aria-pressed')) === 'true';
  await page.keyboard.press('Escape');
  await settle(500);
  return lit;
}

/**
 * The looks: every one of them can be found, a look can be saved, and one
 * picked reaches the plate. The overlay's preset title menu held all three in
 * one list; on the desk they are the Looks grid (every look, a picture each),
 * the File menu, and the cue list beside the plate with Go. None of the three
 * lines may pass on a click alone.
 */
export async function presetChecks({ page, clickOn, settle, check, firstVisible }) {
  await clickOn('looks-grid-open');
  await settle();
  const entries = await page.locator('[data-testid="looks-grid"] [data-testid^="looks-grid-"]:not([data-testid="looks-grid-close"])').count();
  check('the Looks grid opens with every look in it',
    (await page.getByTestId('looks-grid').count()) === 1 && entries > 10, `${entries} looks`);
  // Loading: a card in the grid sends its look (LooksGrid onSelectLook), so
  // one is picked and the plate's name read back.
  let loaded = '';
  if (await page.getByTestId('looks-grid-galaxy').count()) {
    await clickOn('looks-grid-galaxy');
    await settle(2500);
    loaded = await firstVisible('plate-name').innerText().catch(() => '');
  }
  await page.keyboard.press('Escape');
  await settle(400);
  if (await page.getByTestId('looks-grid').count()) await clickOn('looks-grid-close');

  // Saving must still be reachable now that the settings panel's copy of the
  // presets is gone.
  await clickOn('doc-menu-button');
  await settle(400);
  const menuIds = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="doc-menu"] [data-testid]')].map(e => e.dataset.testid));
  check('the File menu can still save a look, and the grid loads one',
    menuIds.includes('doc-save') && /galaxy/i.test(loaded),
    `${menuIds.join(', ') || 'no menu'}; Galaxy from the grid → ${loaded.replace(/\s+/g, ' ').trim() || '(no name over the plate)'}`);
  await page.keyboard.press('Escape');
  await settle(400);

  // Apply one and make sure the app survives having its whole look replaced.
  // A look in the cue list is only *cued* by a click: it reaches the plate on
  // Go, over a crossfade. That is right for a desk and a trap for a script, so
  // this drives it the way a projectionist does (the fade at a cut, then Go)
  // and reads the plate's own name back: before the overlay's version of this
  // line read the title, a preset that never reached the glass passed.
  if (await page.getByTestId('cue-crowd-plate').count()) {
    await clickOn('cue-crowd-plate');
    await settle(600);
    if (await page.getByTestId('fade-segmented-0').count()) await clickOn('fade-segmented-0');
    await clickOn('go-button');
    await settle(2500);
    const nowOn = await firstVisible('plate-name').innerText().catch(() => '');
    check('a preset reaches the plate', /crowd plate/i.test(nowOn),
      `cued, then Go → ${nowOn.replace(/\s+/g, ' ').trim() || '(no name over the plate)'}`);
  } else {
    check('a preset reaches the plate', false, 'Crowd Plate not in the cue list');
  }
}
