/**
 * The Mac app's narrow window, a part of `npm run liveshow` kept beside it
 * because liveshow.mjs is past the 40 KB a file is read whole.
 *
 * Until 49c (PLAN §49, docs/plan/49-usability-review.md) a Mac window dragged
 * under the desks' 1024 px left the desks for the old floating overlay, and the
 * Live Show panel went with them: the stream kept running and nothing on screen
 * said so. 37x-4d-4 owed a live chip for that window. 49c and 49c-3 (#963,
 * #981) took the overlay away instead: every non-touch window keeps the desk
 * down to 360 px, folding its columns, so a narrowed window still has the
 * panel, its Live state and its Stop. The chip is no longer owed (37x-4d-4 is
 * superseded by 49c-3), and this part now holds the thing the owner cares
 * about: narrowing a window mid-stream neither loses the panel nor the stream.
 *
 * One line, run while the stream is live:
 *
 * - at 900 x 800 the Live Show panel is still in the page and still says live
 *   (`data-phase="live"`), its Stop on screen once scrolled to and not under
 *   anything, frames still reaching the bridge, and nothing was stopped;
 *   back at full width it still says live and nothing was stopped.
 *
 * The 900 x 800 window is the one the old line used, under the desks' 1024 and
 * over 768, so it is the folded one-column desk, the width a laptop window
 * snapped to half a screen lands on.
 */

export async function narrowLines({ page, until, check }) {
  const full = page.viewportSize();
  const stopsBefore = await page.evaluate(() => window.__liveStub.calls.stop);
  await page.setViewportSize({ width: 900, height: 800 });
  // The panel is live before the resize, so asking for "live" at once answers
  // from the wide layout. Wait for the narrow one first: the window at 900 and
  // the desk's own plate drawn in it, then a beat for a layout that changes
  // late (a check skeptic's control: a desk dropped 600 ms after the resize
  // passed when this read at once).
  const settled = await until(page, () => innerWidth === 900 && !!document.querySelector('[data-testid="desk-preview"]'), undefined, 8000);
  await page.waitForTimeout(1500);
  const packetsBefore = await page.evaluate(() => window.__liveStub.calls.packets);
  const narrow = await page.evaluate(() => document.querySelector('[data-testid="live-show"]')?.getAttribute('data-phase') === 'live');
  // In the page is not enough: the panel sits in the desk's deck, which clips
  // and scrolls it, so its own box says little. What the owner needs on screen
  // is its Stop: once scrolled to, the whole button inside the window and the
  // thing under its middle (not a sheet, a scrim or another column over it).
  const onScreen = narrow ? await page.locator('[data-testid="live-show"] [data-testid="live-stop"]').first().evaluate((el) => {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const ok = r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && !!hit && el.contains(hit);
    return { ok, says: `Stop at ${[r.left, r.top, r.width, r.height].map(Math.round).join(',')} in ${innerWidth}x${innerHeight}, under its middle ${hit && el.contains(hit) ? 'itself' : (hit?.getAttribute('data-testid') || hit?.tagName || 'nothing')}` };
  }, undefined, { timeout: 3000 }).catch((e) => ({ ok: false, says: `no Stop: ${String(e).split('\n')[0].slice(0, 80)}` })) : { ok: false, says: 'not read' };
  // Live is the stand-in's word until someone calls stop; frames still reaching
  // the bridge while narrow are what says the stream kept running.
  const moved = await until(page, (n) => window.__liveStub.calls.packets > n + 30, packetsBefore, 10_000);
  const packetsNarrow = await page.evaluate(() => window.__liveStub.calls.packets);
  const stopsNarrow = await page.evaluate(() => window.__liveStub.calls.stop);
  await page.screenshot({ path: 'scratch/liveshow-narrow.png' }).catch(() => {});

  await page.setViewportSize(full);
  const back = await until(page, () => document.querySelector('[data-testid="live-show"]')?.getAttribute('data-phase') === 'live', undefined, 15_000);
  const stopsAfter = await page.evaluate(() => window.__liveStub.calls.stop);
  check('narrowed to 900 x 800 the desk keeps the Live Show panel, on screen and saying live; the stream kept running, and the panel says so back at full width',
    !!settled && narrow && onScreen.ok && !!moved && stopsNarrow === stopsBefore && !!back && stopsAfter === stopsBefore,
    `narrow: ${settled ? 'desk drawn' : 'no desk at 900'}, panel ${narrow ? 'live' : 'not live or gone'}, ${onScreen.ok ? 'on screen' : 'not on screen'} (${onScreen.says}), ${packetsNarrow - packetsBefore} packets, ${stopsNarrow - stopsBefore} stops; full width: live again ${!!back}, ${stopsAfter - stopsBefore} stops`);
}
