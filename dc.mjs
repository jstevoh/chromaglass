// The desk section of scripts/qa.mjs, on its own, so the part that was
// rewritten can be validated without a forty-minute full run.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const PORT = 4333;
const out = [];
const check = (n, ok, d = '') => { out.push(ok); console.log(`${ok ? ' ok ' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`); };
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { detached: true, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const settle = (ms = 900) => page.waitForTimeout(ms);
  const clickOn = async (id) => {
    const b = await page.evaluate((i) => {
      const el = document.querySelector(`[data-testid="${i}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, id);
    if (!b) throw new Error(`no [data-testid="${id}"]`);
    await page.mouse.click(b.x, b.y);
  };
  const viaPalette = async (q) => {
    await page.keyboard.press('Control+k');
    await settle(500);
    await page.evaluate((query) => {
      const input = document.querySelector('[data-testid="palette-input"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, query);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    }, q);
    await settle(500);
    await page.keyboard.press('Enter');
    await settle(700);
  };
  await page.goto(`http://localhost:${PORT}/?debug`, { waitUntil: 'load' });
  await settle(7000);

  const size = () => page.evaluate(() => {
    const c = document.getElementById('liquid-canvas');
    const r = document.querySelector('[data-testid="plate-frame"]').getBoundingClientRect();
    return { w: c.width, h: c.height, boxW: Math.round(r.width) };
  });
  const bench = await size();
  check('a desk lays out at laptop width',
    (await page.getByTestId('design-desk').count()) === 1 || (await page.getByTestId('perform-desk').count()) === 1);
  check('and the plate is a preview inside it, not the window', bench.boxW < 1440 * 0.75, `${bench.boxW}px of 1440`);

  await clickOn('mode-segmented-perform');
  await settle(1800);
  const perform = await size();
  check('Perform shows the desk', (await page.getByTestId('perform-desk').count()) === 1);
  check('and costs the render not one pixel', perform.w === bench.w && perform.h === bench.h, `${bench.w}×${bench.h} → ${perform.w}×${perform.h}`);

  const legacy = ['liquid-water', 'midi-button', 'desk-mode-button', 'preset-title-button', 'guide-button'];
  const stillUp = [];
  for (const id of legacy) if (await page.getByTestId(id).count() > 0) stillUp.push(id);
  check('and the overlay UI is not drawn underneath it', stillUp.length === 0, stillUp.join(', ') || `none of ${legacy.join(', ')}`);

  const overlap = await page.evaluate(() => {
    const box = (id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect() ?? null;
    const hole = box('desk-preview'), cues = box('cue-list'), rides = box('rides');
    if (!hole || !cues || !rides) return 'a column is missing';
    const bad = [];
    if (cues.right > hole.left + 1) bad.push(`cues reach ${Math.round(cues.right)}, plate starts at ${Math.round(hole.left)}`);
    if (rides.left < hole.right - 1) bad.push(`rides start at ${Math.round(rides.left)}, plate ends at ${Math.round(hole.right)}`);
    return bad.length ? bad.join('; ') : null;
  });
  check('and its columns clear the plate', overlap === null, overlap ?? '');

  await clickOn('cue-oil-on-water');
  await settle(600);
  const goLabel = (await page.getByTestId('go-button').innerText()).trim();
  check('and Go names the look it will send', /Oil on Water/i.test(goLabel), goLabel.replace(/\s+/g, ' '));

  await page.keyboard.press('Control+k');
  await settle(500);
  const up = await page.getByTestId('command-palette').count();
  await page.evaluate(() => {
    const input = document.querySelector('[data-testid="palette-input"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'lacing');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle(500);
  const hit = await page.getByTestId('palette-list').locator('button').first().innerText();
  await page.keyboard.press('Escape');
  await settle(400);
  check('and ⌘K finds a look by name', up === 1 && /lacing/i.test(hit), `“${hit.replace(/\s+/g, ' ')}”`);

  for (const [query, id] of [['Settings', 'settings-panel'], ['MIDI', 'midi-panel']]) {
    await viaPalette(query);
    const n = await page.getByTestId(id).count();
    const w = n ? await page.evaluate((i) => Math.round(document.querySelector(`[data-testid="${i}"]`).getBoundingClientRect().width), id) : 0;
    check(`and ⌘K opens ${query} as a sheet`, n === 1 && w <= 720 && w > 300, n ? `${w}px wide` : 'did not open');
    await page.keyboard.press('Escape');
    await settle(500);
  }

  await clickOn('mode-segmented-design');
  await settle(1500);
  const benchUp = await page.getByTestId('design-desk').count();
  const bottles = await page.getByTestId('bottle-silicone').count();
  const cuesGone = await page.getByTestId('cue-list').count();
  check('and Design shows the bench instead of the cue list', benchUp === 1 && bottles === 1 && cuesGone === 0,
    `design-desk ${benchUp}, bottles ${bottles}, cue list ${cuesGone}`);
} finally {
  await browser.close();
  try { process.kill(-server.pid, 'SIGKILL'); } catch {}
}
console.log(`\n${out.filter(Boolean).length}/${out.length} checks passed`);
