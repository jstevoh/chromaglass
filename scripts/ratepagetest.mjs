#!/usr/bin/env node
/**
 * The rating page a batch run writes, in a real browser (PLAN 47p-5,
 * scripts/watchrate.mjs).
 *
 *   npm run ratepage
 *
 * The page is how a person builds an eval set of their own (the owner,
 * 2026-11-27), opened from the disk, often on a phone, with nothing behind
 * it: every mark lives in the page's script until it is saved as
 * ratings.json. So the script is held where it runs, in Chromium, at a
 * phone's width (390 px), on a page of three clips built here (no video and
 * no ffmpeg: the page's own behaviour, not the batch's files, which
 * `npm run watchbatch` holds):
 *
 *   (a) no sideways scroll at a phone's width;
 *   (b) a mark, a note typed just before a tap elsewhere (the first version
 *       lost it: a debounced note was repainted away by the next tap), a
 *       moment pinned by tapping the timeline half-way, and on another clip a
 *       canon mark and "keep aside", all kept across a reload;
 *   (c) Save downloads ratings.json with exactly the two clips rated: the
 *       mark, the note, the moment at the source's time (the clip starts
 *       40 s into its source), the canon mark, keep aside, and each clip's
 *       read for a refit;
 *   (d) a mark tapped twice is cleared, and a removed moment is gone from the
 *       file;
 *   (e) Load merges a file in: its mark wins, both clips' moments are kept, a
 *       clip this page does not show is kept and saved back out;
 *   (f) ratings already on file when the batch ran show filled in.
 *
 * In the browser shard, where Chromium is. A few seconds.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { ratePage } from './watchrate.mjs';

let total = 0, failed = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ratepage-'));
const read = i => ({ rms: 0.1 + i / 100, colourfulness: 40 + i, blackMean: 0.2 });
const clips = [
  { key: 'dawn-pour', title: 'Dawn pour', video: 'dawn-pour/rate.mp4', from: 40, span: 30, timeline: null, sheet: null, read: read(1) },
  { key: 'night-sea', title: 'Night sea', video: 'night-sea/rate.mp4', from: 0, span: 20, timeline: null, sheet: null, read: read(2) },
  { key: 'old-take', title: 'Old take', video: 'old-take/rate.mp4', from: 0, span: 10, timeline: null, sheet: null, read: read(3) },
];
const file = path.join(dir, 'rate.html');
fs.writeFileSync(file, ratePage({ title: 'Rate: test', id: 'test-3', clips, prior: { 'old-take': { overall: 3, note: 'rated before' } } }));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(`file://${file}`);
const card = k => `.rate[data-key="${k}"]`;
const save = async () => { const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#save')]); return { name: dl.suggestedFilename(), json: JSON.parse(fs.readFileSync(await dl.path(), 'utf8')) }; };

// (a)
const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check('(a) at a phone\'s width it does not scroll sideways', wide <= 1, `${wide} px over`);

// (f) prior ratings show.
const prior = await page.evaluate(k => ({ v: document.querySelector(`.rate[data-key="${k}"] .stars button[aria-pressed=true]`)?.dataset.v, note: document.querySelector(`.rate[data-key="${k}"] .note`).value }), 'old-take');
check('(f) ratings on file when the batch ran show filled in', prior.v === '3' && prior.note === 'rated before', JSON.stringify(prior));

// (b)
await page.click(`${card('dawn-pour')} .stars button[data-v="4"]`);
await page.fill(`${card('dawn-pour')} .note`, 'lovely slow cells');
const box = await page.locator(`${card('dawn-pour')} .strip`).boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.fill(`${card('dawn-pour')} .mnote`, 'froze here');
await page.click(`${card('dawn-pour')} .pin`);
await page.click(`${card('night-sea')} .stars button[data-v="2"]`);
await page.click(`${card('night-sea')} details summary`);
await page.click(`${card('night-sea')} .mini[data-canon="arc"] button[data-v="1"]`);
await page.check(`${card('night-sea')} .heldout`);
await page.waitForTimeout(600);
await page.reload();
const kept = await page.evaluate(k => ({ pressed: document.querySelector(`.rate[data-key="${k}"] .stars button[aria-pressed=true]`)?.dataset.v,
  moments: document.querySelectorAll(`.rate[data-key="${k}"] ul.moments li`).length, note: document.querySelector(`.rate[data-key="${k}"] .note`).value,
  count: document.getElementById('count').textContent }), 'dawn-pour');
check('(b) the mark, the note and the moment are kept across a reload', kept.pressed === '4' && kept.moments === 1 && kept.note === 'lovely slow cells' && /^3 of 3 rated/.test(kept.count), JSON.stringify(kept));

// (c)
const s1 = await save();
const a = s1.json['dawn-pour'], b = s1.json['night-sea'];
check('(c) Save downloads ratings.json with the clips that have marks', s1.name === 'ratings.json' && Object.keys(s1.json).sort().join() === 'dawn-pour,night-sea,old-take', Object.keys(s1.json).join(', '));
check('(c) …the mark, the note and the moment at the source\'s time (55 s)', a?.overall === 4 && a?.note === 'lovely slow cells' && a?.moments?.length === 1 && a.moments[0].note === 'froze here' && near(a.moments[0].t, 55, 1.2), JSON.stringify(a?.moments));
check('(c) …the canon mark and keep aside, and every clip\'s read', b?.overall === 2 && b?.arc === 1 && b?.heldOut === true && near(a?.read?.rms, 0.11, 1e-9) && near(b?.read?.rms, 0.12, 1e-9), JSON.stringify({ ...b, read: b?.read }));

// (d)
await page.click(`${card('night-sea')} .stars button[data-v="2"]`);
await page.click(`${card('dawn-pour')} ul.moments button`);
const s2 = await save();
check('(d) a mark tapped twice is cleared, a removed moment is gone', s2.json['night-sea']?.overall === undefined && s2.json['night-sea']?.arc === 1 && s2.json['dawn-pour']?.overall === 4 && !s2.json['dawn-pour']?.moments, JSON.stringify({ ns: s2.json['night-sea'], dp: s2.json['dawn-pour']?.moments }));

// (e)
const other = path.join(dir, 'other.json');
fs.writeFileSync(other, JSON.stringify({ 'dawn-pour': { overall: 5, moments: [{ t: 41, note: 'blooms' }] }, elsewhere: { overall: 3, note: 'from another batch' } }));
await page.click(`${card('dawn-pour')} .stars button[data-v="4"]`);
await page.fill(`${card('dawn-pour')} .mnote`, 'second look');
await page.click(`${card('dawn-pour')} .pin`);
await page.setInputFiles('#load', other);
await page.waitForTimeout(300);
const s3 = await save();
check('(e) Load merges: its mark wins, both moments kept, a clip from elsewhere kept', s3.json['dawn-pour']?.overall === 5 && s3.json['dawn-pour']?.moments?.map(m => m.note).sort().join() === 'blooms,second look' && s3.json.elsewhere?.note === 'from another batch',
  JSON.stringify({ dp: s3.json['dawn-pour'], elsewhere: !!s3.json.elsewhere }));
check('the page ran without a script error', !errors.length, errors.join('; '));

await browser.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(failed ? `\n${failed} of ${total} FAIL` : `\nall ${total} ok`);
process.exit(failed ? 1 : 0);
