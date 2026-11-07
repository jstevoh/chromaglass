#!/usr/bin/env node
/**
 * Settings → Feedback in the built app, on the desk and on a phone (PLAN 39a).
 *
 *   npm run feedbackpane        (builds first)
 *
 * Its own file, not a block in `phone.mjs`, because that file is over the
 * size budget and may not grow (`npm run sizes`). What it asks:
 *
 *   1. the desk: Settings' rail ends in Feedback, apart from the seven
 *      groups' rows, and it opens the pane; Send is off with no words and on
 *      with some; and the checks' build, which has no feedback Worker, says
 *      the note goes by mail and draws no switches it could not honour;
 *   2. a phone, in portrait and two landscapes: More → Feedback opens a
 *      sheet on screen, over no more than 90% of it, with nothing covered,
 *      its box in 16 px type (under that iOS zooms the page on focus and the
 *      sheet slides away; the first run of this check found 13 px in every
 *      landscape, where the `sm:` size had applied), four topics a thumb's
 *      48 px, and Send waiting for words;
 *   3. the phone's Settings strip ends in Feedback too, which takes a tap
 *      where it is drawn and opens the pane.
 *
 * Send is never pressed: on this build it opens the mail app, which would
 * leave the page. The Worker's half, and the switches' effect on what is
 * sent, are `npm run feedback-worker`.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { launchChromium } from './chromium.mjs';
import { coveredControls } from './layoutProbe.mjs';

const PORT = Number(process.env.FEEDBACK_PORT ?? 4187);
const URL = `http://localhost:${PORT}/?debug&look=classic&dpr=0.35&play=0`;

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
  server.stdout.on('data', (d) => { if (String(d).includes('localhost')) { clearTimeout(bail); resolve(); } });
  server.stderr.on('data', (d) => { notes.push(String(d).trim()); });
  server.on('exit', (c) => { clearTimeout(bail); reject(new Error(`preview exited ${c}: ${notes.join(' ').slice(0, 200)}`)); });
});
process.on('exit', () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); } });

const browser = await launchChromium(chromium, { headless: true });
const open = async (width, height, touch) => {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  await page.goto(URL, { waitUntil: 'load' });
  const ready = touch ? 'phone-stage' : 'open-all-settings';
  for (let i = 0; i < 60 && !(await page.getByTestId(ready).count()); i++) await page.waitForTimeout(250);
  await page.waitForTimeout(800);
  return { ctx, page };
};
const visible = (page, id) => page.getByTestId(id).first().isVisible().catch(() => false);
const enabled = (page, id) => page.getByTestId(id).first().isEnabled().catch(() => null);

/** The pane's facts, read inside `root`. */
const paneFacts = (page, root) => page.evaluate((root) => {
  const scope = document.querySelector(`[data-testid="${root}"]`);
  const pane = scope?.querySelector('[data-testid="settings-feedback"]');
  const box = pane?.querySelector('[data-testid="feedback-message"]');
  const topics = [...(pane?.querySelectorAll('[data-testid^="feedback-topic-"]') ?? [])];
  return pane ? {
    font: box ? parseFloat(getComputedStyle(box).fontSize) : 0,
    topics: topics.length,
    smallestTopic: Math.round(Math.min(...topics.map((t) => t.getBoundingClientRect().height))),
    switches: pane.querySelectorAll('[data-testid="feedback-logs"], [data-testid="feedback-picture"]').length,
    mailOnly: !!pane.querySelector('[data-testid="feedback-mail-only"]'),
    send: pane.querySelector('[data-testid="feedback-send"]')?.textContent?.trim() ?? null,
  } : null;
}, root);

try {
  // ── 1. The desk ──
  {
    const { ctx, page } = await open(1440, 900, false);
    await page.getByTestId('open-all-settings').first().click();
    await page.waitForTimeout(700);
    const rail = await page.evaluate(() => {
      const nav = document.querySelector('[data-testid="settings-panel"] [data-testid="settings-rail"]');
      const row = nav?.querySelector('[data-testid="settings-feedback-nav"]');
      const groups = [...(nav?.querySelectorAll('[data-testid^="rail-group-"]') ?? [])];
      const last = groups.at(-1)?.getBoundingClientRect();
      const r = row?.getBoundingClientRect();
      return { row: !!row, below: !!r && !!last && r.top >= last.bottom - 0.5, sections: nav?.querySelectorAll('[data-testid^="settings-nav-"]').length ?? 0 };
    });
    await page.getByTestId('settings-feedback-nav').first().click().catch(() => {});
    await page.waitForTimeout(400);
    const facts = await paneFacts(page, 'settings-panel');
    const off = await enabled(page, 'feedback-send');
    await page.getByTestId('feedback-message').first().fill('The plate went dark after a pour').catch(() => {});
    const on = await enabled(page, 'feedback-send');
    check('the desk: Settings\' rail ends in Feedback, under the groups, and it opens the pane',
      rail.row && rail.below && rail.sections > 20 && !!facts,
      `row ${rail.row}, under the last group ${rail.below}, ${rail.sections} section rows, pane ${facts ? 'open' : 'not open'}`);
    check('and Send is off with no words and on with some', off === false && on === true, `empty ${off}, with words ${on}`);
    check('and a build with no feedback Worker sends by mail, drawing no switches it could not honour',
      !!facts && facts.mailOnly && facts.switches === 0 && facts.send === 'Email it',
      facts ? `switches ${facts.switches}, mail note ${facts.mailOnly}, button "${facts.send}"` : 'no pane');
    // A search turns the rail into a result list, and Feedback is not a result.
    await page.getByTestId('settings-search').first().fill('camera');
    await page.waitForTimeout(300);
    check('and a search hides it, the rail being its hits', !(await visible(page, 'settings-feedback-nav')) && !(await visible(page, 'settings-feedback')));
    await ctx.close();
  }

  // ── 2 and 3. A phone ──
  for (const [label, w, h] of [['portrait', 390, 844], ['landscape', 844, 390], ['the smallest landscape', 667, 375]]) {
    const { ctx, page } = await open(w, h, true);
    if (!(await visible(page, 'phone-stage'))) { check(`${label}: the phone layout is up`, false); await ctx.close(); continue; }
    await page.getByTestId('phone-open-more').first().tap();
    await page.waitForTimeout(250);
    await page.getByTestId('phone-feedback').first().tap();
    await page.waitForTimeout(400);
    const sheet = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="phone-sheet-feedback"]')?.lastElementChild?.getBoundingClientRect();
      return panel ? { top: panel.top, bottom: panel.bottom, height: panel.height } : null;
    });
    const facts = await paneFacts(page, 'phone-sheet-feedback');
    const covered = sheet ? await coveredControls(page, { skipInside: '[data-testid="needs-webgpu"], [data-testid="phone-stage"] > :not([data-testid^="phone-sheet"])' }) : [];
    const off = await enabled(page, 'feedback-send');
    await page.getByTestId('feedback-message').first().fill('The plate went dark after a pour').catch(() => {});
    const on = await enabled(page, 'feedback-send');
    check(`${label} ${w}×${h}: More → Feedback opens on screen, over no more than 90% of it, nothing covered`,
      !!sheet && sheet.top >= 0 && sheet.bottom <= h + 0.5 && sheet.height <= 0.9 * h && covered.length === 0,
      sheet ? `${Math.round(sheet.height)} of ${h} px${covered.length ? `; covered ${covered.slice(0, 3).join('; ')}` : ''}` : 'no sheet');
    check(`${label}: its box in 16 px type, four topics of 48 px or more, Send waiting for words`,
      !!facts && facts.font >= 16 && facts.topics === 4 && facts.smallestTopic >= 48 && off === false && on === true,
      facts ? `${facts.font} px type, ${facts.topics} topics at ${facts.smallestTopic} px, Send ${off ? 'ON' : 'off'} empty and ${on ? 'on' : 'OFF'} with words` : 'no pane');
    await page.getByTestId('phone-sheet-scrim').first().tap({ position: { x: 20, y: 20 } });
    await page.waitForTimeout(300);

    if (label === 'portrait') {
      await page.getByTestId('phone-open-more').first().tap();
      await page.waitForTimeout(250);
      await page.getByTestId('phone-settings').first().tap();
      await page.waitForTimeout(700);
      const row = page.getByTestId('settings-feedback-nav').first();
      await row.scrollIntoViewIfNeeded().catch(() => {});
      const hit = await page.evaluate(() => {
        const t = document.querySelector('[data-testid="settings-feedback-nav"]');
        if (!t) return false;
        const r = t.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!at && t.contains(at);
      });
      if (hit) await row.tap();
      await page.waitForTimeout(300);
      const pane = await visible(page, 'settings-feedback');
      check('the phone\'s Settings strip ends in Feedback, which takes a tap and opens the pane', hit && pane,
        `row ${hit ? 'takes a tap' : 'covered or missing'}, pane ${pane ? 'open' : 'not open'}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
