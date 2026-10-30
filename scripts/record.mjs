#!/usr/bin/env node
/**
 * The one Record button (src/lib/recordChoice.ts): what a press does for each
 * choice and each state, that the choice can never be nothing, and that the
 * desk, the panel and the phone have one Record each instead of the three
 * names and five places there were (the owner: "What's video recording?
 * what's audio? what's recording inputs? what's recording the plate?").
 *
 *   npm run record
 */
import fs from 'node:fs';
import {
  DEFAULT_RECORD_CHOICE, normalizeChoice, recordMove, makesText, runningText,
} from '../src/lib/recordChoice.ts';
import { appSource } from './appSource.mjs';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else failed++; console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const idle = { videoOn: false, takeOn: false, videoSupported: true };

{
  check('the default is the Plate video alone, which is what R did before',
    DEFAULT_RECORD_CHOICE.video && !DEFAULT_RECORD_CHOICE.take);
  check('both off is never kept: it falls back to the default',
    JSON.stringify(normalizeChoice({ video: false, take: false })) === JSON.stringify(DEFAULT_RECORD_CHOICE)
    && JSON.stringify(normalizeChoice({ take: true })) === JSON.stringify({ video: true, take: true })
    && JSON.stringify(normalizeChoice(null)) === JSON.stringify(DEFAULT_RECORD_CHOICE));

  const v = recordMove({ video: true, take: false }, idle);
  check('Record with Plate video starts the video and no take', v.startVideo && !v.startTake && !v.stopVideo && !v.stopTake);
  const t = recordMove({ video: false, take: true }, idle);
  check('Record with Take starts a take and no video', !t.startVideo && t.startTake);
  const b = recordMove({ video: true, take: true }, idle);
  check('Record with both starts both, from one press', b.startVideo && b.startTake);
  const nv = recordMove({ video: true, take: false }, { ...idle, videoSupported: false });
  check('where this browser cannot record video, Record still makes a take rather than nothing', !nv.startVideo && nv.startTake);

  for (const [name, s] of [['the video', { ...idle, videoOn: true }], ['a take', { ...idle, takeOn: true }], ['both', { ...idle, videoOn: true, takeOn: true }]]) {
    const m = recordMove({ video: true, take: false }, s);
    check(`Record while ${name} runs stops what runs and starts nothing, whatever is chosen`,
      !m.startVideo && !m.startTake && m.stopVideo === s.videoOn && m.stopTake === s.takeOn);
  }

  check('one wording for what it makes', makesText({ video: true, take: false }) === 'Plate video'
    && makesText({ video: false, take: true }) === 'Take' && makesText({ video: true, take: true }) === 'Plate video + Take'
    && runningText({ videoOn: true, takeOn: true }) === 'Plate video + Take');
}

// The surfaces. These read the source: the place each control lives is what the
// owner reported, and a second Record button growing back is how it got here.
const read = (p) => fs.readFileSync(p, 'utf8');
{
  const controls = read('src/components/desk/RecordControls.tsx');
  check('the desk header has one Record button and the options, not a Video and a Performance button',
    /testId="record-button"/.test(controls) && !/performance-button|record-video-button/.test(controls));
  check('the unused third Record performance button is gone', !fs.existsSync('src/components/desk/PerformanceButton.tsx'));
  const header = read('src/components/desk/DeskHeader.tsx');
  check('one Rec dot says what is recording, and the separate Perf dot is gone', /testId="dot-rec"/.test(header) && !/dot-performance/.test(header));
  const panel = read('src/components/RecordPanel.tsx');
  check('the panel has no Canvas Video / Performance tabs: one page, Plate video, Take and Song film',
    !/record-tab-/.test(panel) && /record-makes-video/.test(panel) && /record-makes-take/.test(panel) && /record-song-film/.test(panel));
  const phone = read('src/components/phone/PhoneStage.tsx');
  check('the phone says what Record makes', /phone-record-makes/.test(phone));
  const palette = appSource(read);
  check('the command palette has one Record and no second "Record the plate"/"Record performance" row',
    !/Record the plate/.test(palette) && !/'Record performance \(strokes/.test(palette));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
