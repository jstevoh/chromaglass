/**
 * The layout measurements, shared by the show night (`qa.mjs`) and the fast
 * layout check (`layout.mjs`).
 *
 * They lived inside `qa.mjs`, which needs a GPU and fifteen minutes, so a
 * button 20px tall or a column painted over the Mic dot was found by the
 * macOS job at the end of a run — ten of thirty-one red runs in September were
 * exactly this. None of these measurements reads a pixel: they are the
 * layout, which is CSS, and CSS is the same with or without a GPU. So they are
 * here once, and each harness says what it asks of them.
 */

/*
  Raw coordinates for every click.

  `locator.click()` stalls in this environment: its call log stops at "locator resolved to
  <button …>" and never reports an actionability verdict, while a mouse click
  at the same point works and the control visibly takes the selection. The
  element is stable (traced over twenty animation frames: one bounding box)
  and hit-testable (elementFromPoint returns the button itself), so that is
  Playwright's machinery queueing behind the render loop, not the app.

  It was first seen on the desk, then on the overlay's Settings button, then
  inside the MIDI sheet, where it ended a run at 25 of 27 with a 60-second
  timeout. Three sightings is a property of the environment, not of three
  controls, so every click here goes through this.

  Both branches scroll first, which the locator branch did not at first. That
  is the one thing `locator.click()` was doing for free, and dropping it cost
  two checks: a control below the fold in a scrolling sheet had its
  coordinates taken where it actually sat, well outside the visible box, and
  the click landed on whatever was at that point instead.
*/
export const clickAt = async (page, target) => {
  const box = typeof target === 'string'
    ? await page.evaluate((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        if (!el) return null;
        // Into view first: a cue list is thirty-two rows in a column that
        // holds fourteen, so a row's coordinates can be well outside the
        // visible box and a click there lands on whatever is actually at
        // that point. "Go names the look it will send" failed on exactly
        // that, and read as an app bug.
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, target)
    : await target.scrollIntoViewIfNeeded()
        .then(() => target.boundingBox())
        .then(b => (b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null));
  if (!box) throw new Error(`nothing to click: ${typeof target === 'string' ? target : 'locator'}`);
  await page.mouse.click(box.x, box.y);
};

/** Where the Perform / Design / Sequence switch starts, or null if it is not up. */
export const modeSwitchX = (page) => page.evaluate(() => {
  const r = document.querySelector('[data-testid="mode-segmented"]')?.getBoundingClientRect();
  return r ? Math.round(r.x) : null;
});

/**
 * Every visible control whose text is under 11px, under 60% opacity, or whose
 * box is under 24px on its short side (`qa.mjs`, "Readable in a dark room",
 * says why those three and not 44px).
 */
export const legibility = (page) => page.evaluate(() => {
  const alpha = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return 1; const p = m[1].split(','); return p[3] === undefined ? 1 : parseFloat(p[3]); };
  const tiny = [], faint = [], small = [];
  for (const el of document.querySelectorAll('button, input, select, [role="menuitem"], a')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || el.offsetParent === null) continue;
    const cs = getComputedStyle(el);
    const text = (el.textContent || '').trim();
    const name = (text || el.getAttribute('aria-label') || el.getAttribute('title') || el.tagName).slice(0, 26);
    if (text && parseFloat(cs.fontSize) < 11) tiny.push(`${name} ${cs.fontSize}`);
    if (text && alpha(cs.color) < 0.6) faint.push(`${name} α${alpha(cs.color)}`);
    if (Math.min(r.width, r.height) < 24) small.push(`${name} ${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  return { tiny, faint, small };
});

/**
 * Every control in view whose middle is not the control: click it, and you
 * hit something painted on top (`qa.mjs`, "Nothing is painted on top of
 * anything you can click"). An element scrolled out of a list is out of view,
 * not covered, so the clipping ancestors are walked first. `skipInside` is a
 * selector whose controls are not asked about.
 */
export const coveredControls = (page, { skipInside = null } = {}) => page.evaluate((skipInside) => {
  const inView = (el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/auto|scroll|hidden/.test(cs.overflowY + cs.overflowX)) {
        const pr = p.getBoundingClientRect();
        if (cy < pr.top - 1 || cy > pr.bottom + 1 || cx < pr.left - 1 || cx > pr.right + 1) return false;
      }
    }
    return cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight;
  };
  const out = [];
  for (const el of document.querySelectorAll('button, input, select, [role="tab"]')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || !inView(el)) continue;
    if (skipInside && el.closest(skipInside)) continue;
    const top = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    if (!top || el === top || el.contains(top) || top.contains(el)) continue;
    const me = el.dataset.testid || el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 20) || el.tagName;
    const by = top.dataset?.testid || (top.textContent || '').trim().slice(0, 20) || top.tagName;
    out.push(`${me} under ${by}`);
  }
  return out;
}, skipInside);

/** The desk header's status dots, and the ones showing no word. */
export const statusDots = async (page) => {
  const bare = await page.evaluate(() => [...document.querySelectorAll('header [data-testid^="dot-"]')]
    .filter((el) => el.getBoundingClientRect().width > 0 && !(el.innerText || '').trim())
    .map((el) => el.dataset.testid));
  const all = await page.locator('header [data-testid^="dot-"]').count();
  return { all, bare };
};

/** The widths "nothing covers a control" is asked at: the desk's, and the overlay's below 1024. */
export const COVER_WIDTHS = [[1440, 900], [1280, 860], [1024, 860], [900, 860], [430, 932], [390, 844]];
