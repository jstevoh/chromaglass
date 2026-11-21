/**
 * The Mac app's narrow window (PLAN.md 37x-4d-4), a part of `npm run liveshow`
 * kept beside it because liveshow.mjs is past the 40 KB a file is read whole.
 *
 * Narrowed under the desks' width (1024, `roomForDesk` in
 * src/app/usePhoneLayout.ts) the Mac app leaves the desks, and the Live Show
 * panel with them. The plan's item said the window goes to the phone layout;
 * it does not: the phone layout wants a coarse pointer and a short side under
 * 600 (`wantsPhoneLayout`, src/lib/phone.ts), and a Mac's window dragged
 * narrow has neither, so it gets the floating overlay (`overlayUp`). Either
 * way the stream keeps running (its state is lib/liveShow.ts's, not the
 * panel's) and nothing on screen says so, or offers to stop it.
 *
 * Two lines, run while the stream is live:
 *
 * - **narrow** (owed until the build): at 900 x 800 the page shows the
 *   remote's live chip (`LiveRemoteChip`, `data-testid="remote-live"`, the
 *   same component the phone's remote draws, so its two-tap Stop comes with
 *   it) on screen, saying Live with its clock, and its first tap only asks
 *   (`data-armed="true"`, no stop reaches the bridge); its clock read again two
 *   seconds on has moved two seconds. Excused only while no
 *   such element is in the Mac app's page at all.
 * - never owed: narrowed, the panel is gone (so the line above measures the
 *   overlay, not a desk that never left); back at full width the panel still
 *   says live, and nothing was stopped. Holds on main, which is why the stream's survival is not a
 *   part of the owed line.
 *
 *   npm run liveshow -- --owed=narrow
 */

export const NARROW_IDS = ['narrow'];

export async function narrowLines({ page, until, check, argv = process.argv }) {
  const flag = argv.find((a) => a.startsWith('--owed='));
  const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
  const unknown = [...owed].filter((id) => !NARROW_IDS.includes(id));
  if (unknown.length) check('every id in --owed is a line of this check', false, `unknown: ${unknown.join(', ')} (known: ${NARROW_IDS.join(', ')})`);
  const line = (id, name, ok, detail, mainState) => {
    if (!owed.has(id)) return check(name, ok, detail);
    if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
    if (!mainState) return check(name, false, `${detail}; owed, but what it is owed for has been built and misses`);
    console.log(` owed ${name} — ${detail}`);
  };

  const full = page.viewportSize();
  const stopsBefore = await page.evaluate(() => window.__liveStub.calls.stop);
  await page.setViewportSize({ width: 900, height: 800 });
  const seen = await until(page, () => {
    const chips = [...document.querySelectorAll('[data-testid="remote-live"]')];
    const on = chips.find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && getComputedStyle(el).visibility !== 'hidden';
    });
    return on ? { says: `${on.textContent} | ${on.getAttribute('aria-label') ?? ''}`, panel: !!document.querySelector('[data-testid="live-show"]') } : null;
  }, undefined, 8000);
  const anyChip = await page.evaluate(() => document.querySelectorAll('[data-testid="remote-live"]').length);
  const panelNarrow = await page.evaluate(() => !!document.querySelector('[data-testid="live-show"]'));
  // Read again two seconds on: a clock frozen at its first second is not a stream seen.
  const secs = (t) => { const m = /(\d+):(\d\d)/.exec(String(t)); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  let later = null;
  if (seen) {
    await page.waitForTimeout(2200);
    later = await page.evaluate(() => { const el = [...document.querySelectorAll('[data-testid="remote-live"]')].find((e) => e.getBoundingClientRect().width > 0); return el ? `${el.textContent} | ${el.getAttribute('aria-label') ?? ''}` : null; });
  }
  let armed = null, stopsAfterTap = null;
  if (seen) {
    await page.locator('[data-testid="remote-live"]:visible').first().click();
    await page.waitForTimeout(300);
    armed = await page.locator('[data-testid="remote-live"]:visible').first().getAttribute('data-armed').catch(() => null);
    stopsAfterTap = await page.evaluate(() => window.__liveStub.calls.stop);
  }
  await page.screenshot({ path: 'scratch/liveshow-narrow.png' }).catch(() => {});
  const saysLive = !!seen && /Live/.test(seen.says) && secs(seen.says) !== null && secs(later) !== null && secs(later) >= secs(seen.says) + 2;
  line('narrow', '37x-4d-4: the Mac app narrowed under the desks shows the stream is live, with its clock, and its first tap only asks to stop',
    saysLive && armed === 'true' && stopsAfterTap === stopsBefore,
    seen ? `chip says "${seen.says}", then "${later}", first tap armed ${armed}, stops ${stopsAfterTap - stopsBefore}` : `no live chip on screen at 900x800 (${anyChip} in the page; the Live Show panel ${panelNarrow ? 'still' : 'not'} there)`,
    anyChip === 0);

  await page.setViewportSize(full);
  const back = await until(page, () => document.querySelector('[data-testid="live-show"]')?.getAttribute('data-phase') === 'live', undefined, 15_000);
  const stopsAfter = await page.evaluate(() => window.__liveStub.calls.stop);
  check('narrowed, the Live Show panel left the screen; the stream kept running, and the panel says so back at full width', !panelNarrow && !!back && stopsAfter === stopsBefore,
    `panel on screen while narrow ${panelNarrow}, live again ${!!back}, ${stopsAfter - stopsBefore} stops`);
  // The chip's first tap arms it for four seconds; let that lapse so the phone's own Stop lines start from rest.
  await page.waitForTimeout(seen ? 4200 : 0);
}
