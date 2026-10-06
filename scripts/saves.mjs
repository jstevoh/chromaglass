#!/usr/bin/env node
/**
 * Saving a preset under a name, on every surface that has a Save.
 *
 * Reported by the owner (2026-10-05): "The save feature for the presets
 * doesn't work on desktop. I want to be able to name a new preset based on
 * saving the current settings." Nothing here asked it before, and what was
 * wrong was not that the first Save failed. It worked, once. From then on the
 * look just saved was the open document and Save wrote over it without asking
 * for a name, so there was no way from the Save button to make a second
 * preset; the saved one was then in no list on the desk; and ⌘S on the
 * Perform desk, whose Save button wears it, reached the browser instead.
 *
 * So the checks are the owner's sentence, on each surface: Save asks for a
 * name, every time; the preset saved is the settings on the plate when it
 * was saved (a slider is moved first and the stored value must be the moved
 * one, so a save of the defaults cannot pass); it is listed where presets are
 * listed on that surface; and it is still there after a reload. Writing over
 * a look stays possible, named for the look it replaces, and must not add a
 * preset.
 *
 * None of it reads a frame, so it runs without a GPU: the desks lay out round
 * the plate whether or not the plate can draw.
 *
 *   `npm run saves`        (builds, then serves the build)
 *   `npm run saves -- --head`
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { launchChromium } from './chromium.mjs';

const PORT = Number(process.env.SAVES_PORT ?? 4187);
const HEADED = process.argv.includes('--head');
const KEY = 'chromaglass-user-presets';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const notes = [];
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
await new Promise((resolve, reject) => {
  const bail = setTimeout(() => reject(new Error('preview server did not start')), 30_000);
  server.stdout.on('data', d => { if (String(d).includes('localhost')) { clearTimeout(bail); resolve(); } });
  server.stderr.on('data', d => { notes.push(String(d).trim()); });
  server.on('exit', c => { clearTimeout(bail); reject(new Error(`preview exited ${c}: ${notes.join(' ').slice(0, 200)}`)); });
});
const stopServer = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); } };
process.on('exit', stopServer);

const URL = `http://localhost:${PORT}/?look=classic&dpr=0.35`;
const browser = await launchChromium(chromium, { headless: !HEADED });

const pageErrors = [];
async function open({ width, height, touch = false, deskMode = null, ready }) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch });
  if (deskMode) await ctx.addInitScript((m) => { try { if (!sessionStorage.getItem('saves-set')) { localStorage.setItem('chromaglass-desk-mode', m); sessionStorage.setItem('saves-set', '1'); } } catch { /* */ } }, deskMode);
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (e) => { pageErrors.push(e.message); console.log('  [pageerror]', e.message.slice(0, 200)); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.getByTestId(ready).first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(600);
  return { ctx, page };
}
const stored = (page) => page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return null; } }, KEY);
const count = (page, id) => page.getByTestId(id).count();

/**
 * Move a slider on the desk's right-hand column; returns its key and the
 * value it was moved to.
 *
 * One whose travel is the setting itself: a curved slider (Speed's) runs 0..1
 * in steps of 0.001 and the setting is a curve of that, so moving it to 0.83
 * saves 0.172, which is right and reads as wrong. A straight one's step is
 * its range over 200.
 */
async function moveARecipeSlider(page) {
  const boxes = page.locator('[data-testid^="recipe-"]:has(input[type=range])');
  let box = null;
  for (let i = 0; i < await boxes.count(); i++) {
    const step = await boxes.nth(i).locator('input[type=range]').evaluate(el => Number(el.step));
    if (Math.abs(step - 0.001) > 1e-9) { box = boxes.nth(i); break; }
  }
  if (!box) throw new Error('no straight slider on the recipe');
  const id = await box.getAttribute('data-testid');
  const key = id.replace(/^recipe-/, '');
  const input = box.locator('input[type=range]');
  const [min, max, before] = await Promise.all(['min', 'max', 'value'].map(a => input.evaluate((el, a) => Number(el[a]), a)));
  const to = Math.abs(before - (min + (max - min) * 0.83)) > (max - min) * 0.1 ? min + (max - min) * 0.83 : min + (max - min) * 0.17;
  await input.fill(String(to));
  await page.waitForTimeout(200);
  return { key, before, to, min, max };
}
const near = (a, b, span) => typeof a === 'number' && Math.abs(a - b) <= span * 0.03;

try {
  // ── The Design desk ───────────────────────────────────────────────
  {
    const { ctx, page } = await open({ width: 1440, height: 900, ready: 'design-desk' });
    check('design: nothing saved to begin with', (await stored(page))?.length === 0);

    const moved = await moveARecipeSlider(page);
    await page.getByTestId('save-look').click();
    check('design: Save asks for a name', await count(page, 'save-sheet') === 1);
    const field = await page.getByTestId('save-name').boundingBox();
    check('design: the name field is the sheet\'s width, not its content\'s', field && field.width > 400, `${Math.round(field?.width ?? 0)} px`);
    check('design: with no saved look open there is nothing to replace', await count(page, 'save-replace') === 0);
    await page.getByTestId('save-name').fill('Blue Friday');
    await page.getByTestId('save-confirm').click();
    await page.waitForTimeout(300);
    let list = await stored(page);
    const first = list?.[0];
    check('design: it is saved under that name', list?.length === 1 && first?.name === 'Blue Friday', JSON.stringify(list?.map(p => p.name)));
    check('design: with the settings on the plate, the moved slider included',
      near(first?.settings?.[moved.key], moved.to, moved.max - moved.min), `${moved.key} moved ${moved.before} → ${moved.to}, saved ${first?.settings?.[moved.key]}`);
    check('design: the sheet closes and the look is named in the breadcrumb',
      await count(page, 'save-sheet') === 0 && (await page.getByTestId('doc-menu-button').innerText()).includes('Blue Friday'));

    // The reported case: a second Save, with the first one open.
    await page.getByTestId('save-look').click();
    check('design: Save asks for a name again with a saved look open', await count(page, 'save-sheet') === 1);
    const replace = page.getByTestId('save-replace');
    check('design: and offers to replace the open one by name', (await replace.count()) === 1 && (await replace.innerText()).includes('Blue Friday'));
    await page.getByTestId('save-name').fill('Red Saturday');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    list = await stored(page);
    check('design: a second preset is saved beside the first', list?.length === 2 && list[1]?.name === 'Red Saturday' && list[0].id !== list[1].id,
      JSON.stringify(list?.map(p => p.name)));

    // ⌘S does the same as the button.
    await page.keyboard.press('Control+s');
    check('design: ⌘S asks for a name', await count(page, 'save-sheet') === 1);
    await page.getByTestId('save-cancel').click();

    // Listed where the desk lists looks: the menu off the look's name.
    await page.getByTestId('doc-menu-button').click();
    const names = await page.getByTestId('doc-saved').innerText().catch(() => '');
    check('design: both are listed under the look menu', names.includes('Blue Friday') && names.includes('Red Saturday'), names.replace(/\n/g, ' | '));

    // Open the first, change it, replace it: still two, the first rewritten.
    await page.getByTestId(`doc-saved-${first.id}`).click();
    await page.waitForTimeout(300);
    check('design: opening one from the list makes it the open look', (await page.getByTestId('doc-menu-button').innerText()).includes('Blue Friday'));
    const again = await moveARecipeSlider(page);
    await page.getByTestId('save-look').click();
    await page.getByTestId('save-replace').click();
    await page.waitForTimeout(300);
    list = await stored(page);
    const rewritten = list?.find(p => p.id === first.id);
    check('design: Replace writes over that one and adds none', list?.length === 2 && rewritten?.name === 'Blue Friday'
      && near(rewritten?.settings?.[again.key], again.to, again.max - again.min), `${list?.length} saved, ${again.key} ${rewritten?.settings?.[again.key]} (moved to ${again.to})`);

    // ⌘K's Save over: the palette's list is memoised, so a command in it
    // holding the settings from when the list was built would save those.
    const third = await moveARecipeSlider(page);
    await page.keyboard.press('Control+k');
    await page.getByTestId('palette-input').fill('Save over');
    await page.getByTestId('palette-row-save-over').click();
    await page.waitForTimeout(300);
    list = await stored(page);
    const viaK = list?.find(p => p.id === first.id);
    check('design: ⌘K\'s Save over writes the settings as they are now', list?.length === 2
      && near(viaK?.settings?.[third.key], third.to, third.max - third.min), `${third.key} ${viaK?.settings?.[third.key]} (moved to ${third.to})`);
    if (await count(page, 'command-palette')) await page.keyboard.press('Escape');

    // Taken out from the same list.
    await page.getByTestId('doc-menu-button').click();
    await page.getByTestId(`doc-saved-remove-${list[1].id}`).click();
    await page.waitForTimeout(200);
    list = await stored(page);
    check('design: the cross beside one takes it out of the library', list?.length === 1 && list[0].id === first.id);
    await page.keyboard.press('Escape');

    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('design-desk').waitFor({ state: 'visible', timeout: 60_000 });
    await page.getByTestId('doc-menu-button').click();
    const after = await page.getByTestId('doc-saved').innerText().catch(() => '');
    check('design: still listed after a reload', after.includes('Blue Friday'));
    await ctx.close();
  }

  // ── The Perform desk ──────────────────────────────────────────────
  {
    const { ctx, page } = await open({ width: 1440, height: 900, deskMode: 'perform', ready: 'save-look' });
    check('perform: the Perform desk is up', await count(page, 'design-desk') === 0);
    // ⌘S first: it reached the browser here before.
    const prevented = await page.evaluate(() => new Promise((resolve) => {
      const e = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
      window.dispatchEvent(e);
      setTimeout(() => resolve(e.defaultPrevented), 50);
    }));
    await page.waitForTimeout(200);
    check('perform: ⌘S asks for a name, and the browser does not get it', prevented && await count(page, 'save-sheet') === 1);
    await page.getByTestId('save-name').fill('Encore');
    await page.getByTestId('save-confirm').click();
    await page.waitForTimeout(300);
    const list = await stored(page);
    check('perform: it is saved under that name', list?.length === 1 && list[0].name === 'Encore', JSON.stringify(list?.map(p => p.name)));

    // This desk's own list of them (QA-18a): it was in none before.
    const encore = list?.[0]?.id;
    const row = page.getByTestId(`perform-saved-${encore}`);
    check('perform: listed under Your presets on this desk', await row.count() === 1 && (await row.innerText()).includes('Encore'));
    // A second, so a cue moves off the look that is live.
    await page.getByTestId('save-look').click();
    await page.getByTestId('save-name').fill('Last song');
    await page.getByTestId('save-confirm').click();
    await page.waitForTimeout(300);
    const last = (await stored(page))?.find(p => p.name === 'Last song')?.id;
    check('perform: a second one joins the list', await count(page, `perform-saved-${last}`) === 1);
    const goBefore = (await page.getByTestId('go-button').innerText()).trim();
    await page.getByTestId(`perform-saved-${encore}`).click();
    await page.waitForTimeout(250);
    const go = page.getByTestId('go-button');
    check('perform: a click cues it, and Go names it', (await go.innerText()).includes('Encore') && await go.isEnabled()
      && await page.getByTestId(`perform-saved-${encore}`).getAttribute('data-state') === 'next', `Go read "${goBefore}", now "${(await go.innerText()).trim()}"`);
    const items = async () => Number((await page.getByTestId('set-count').innerText()).match(/\d+/)?.[0] ?? NaN);
    const n0 = await items();
    await page.getByTestId(`perform-saved-add-${encore}`).click();
    await page.waitForTimeout(250);
    const n1 = await items();
    const inSet = await page.locator('[data-testid^="cue-"]').filter({ hasText: 'Encore' }).count();
    check('perform: + puts it in the set', n1 === n0 + 1 && inSet >= 1, `${n0} → ${n1} items`);
    await page.getByTestId('perform-saved-toggle').click();
    check('perform: the list folds away to its heading', await count(page, 'perform-saved-list') === 0 && await count(page, 'perform-saved-toggle') === 1);
    await ctx.close();
  }

  // ── A laptop window under the desks' width ────────────────────────
  {
    const { ctx, page } = await open({ width: 900, height: 800, ready: 'preset-title-button' });
    await page.getByTestId('preset-title-button').click();
    await page.getByTestId('preset-save').click();
    const confirm = await page.getByTestId('preset-save-confirm').innerText();
    check('window: the button says Save, not "Save as file"', /^save$/i.test(confirm.trim()), confirm);
    await page.getByTestId('preset-save-name').fill('Small window');
    await page.getByTestId('preset-save-confirm').click();
    await page.waitForTimeout(300);
    const list = await stored(page);
    check('window: it is saved under that name', list?.length === 1 && list[0].name === 'Small window');
    await page.getByTestId('preset-title-button').click();
    check('window: and listed under Yours', await count(page, `preset-menu-${list?.[0]?.id}`) === 1);
    await ctx.close();
  }

  // ── The phone ─────────────────────────────────────────────────────
  {
    const { ctx, page } = await open({ width: 390, height: 844, touch: true, ready: 'phone-stage' });
    await page.getByTestId('phone-open-looks').first().tap();
    await page.waitForTimeout(250);
    check('phone: the Looks sheet has a Save', await count(page, 'phone-save-look') === 1);
    await page.getByTestId('phone-save-look').tap();
    await page.getByTestId('phone-save-name').fill('Pocket look');
    const field = await page.getByTestId('phone-save-name').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    check('phone: the name field is 16 px, so iOS does not zoom on it', field >= 16, `${field} px`);
    await page.getByTestId('phone-save-confirm').tap();
    await page.waitForTimeout(300);
    const list = await stored(page);
    check('phone: it is saved under that name', list?.length === 1 && list[0].name === 'Pocket look', JSON.stringify(list?.map(p => p.name)));
    check('phone: and listed under Yours in the same sheet', await count(page, `phone-look-${list?.[0]?.id}`) === 1);
    await ctx.close();
  }

  check('no page errors along the way', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  stopServer();
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ` — failed: ${failed.map(r => r.name).join('; ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
